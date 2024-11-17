// main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const systemListener = require('./src/SystemListener.js');

// main.js 최상단 (상수 정의 전)
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const ProgramStatus = {
  READY: 'Ready',    
  PROCESS: 'Process', 
  PAUSE: 'Pause',    
  LOADING: 'Loading' 
};

// 상수 정의
const DEBOUNCE_TIME = 250;

// ContentManager 수정
const ContentManager = {
  debounceTime: 250,  // 디바운스 시간 설정

  // 복사와 로깅 통합 함수
  copyAndLogDebouncer: debounce(async (content, skipLog = false) => {
    try {
      if (!content) return;
      
      // 클립보드 변경 전 내부 변경 알림
      mainWindow?.webContents.send('notify-clipboard-change');
      
      // 클립보드 변경 전에 내부 복사 플래그 설정
      systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
      console.log('복사됨:', content.substring(0, 20) + '...');

      // 2. 로깅 수행 (skipLog가 true일 경우 건너뜀)
      if (!skipLog && globalState.currentFilePath) {
        await FileManager.saveCurrentPositionToLog();
        console.log('로그 저장됨');
      }
    } catch (error) {
      console.error('복사/로깅 중 오류:', error);
    }
  }, 250),  // 250ms 디바운스
};

// 상태 업데이트 함수 수정
const updateGlobalState = async (newState, source = 'other') => {
  try {
    // READY 상태로 전환 시 특별 처리
    if (newState.programStatus === 'READY') {
      globalState = {
        ...globalState,
        programStatus: 'READY',
        paragraphs: [],
        currentParagraph: 0,
        currentNumber: null,
        isPaused: false,
        isOverlayVisible: false,
        currentFilePath: null  // 파일 경로도 초기화
      };
      
      // 오버레이 창 숨기기
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
    } else {
      // 일반적인 상태 업데이트
      globalState = { ...globalState, ...newState };
    }

    // UI 업데이트
    mainWindow?.webContents.send('state-update', globalState);
    if (globalState.isOverlayVisible && overlayWindow) {
      await WindowManager.updateOverlayContent();
    }
  } catch (error) {
    console.error('상태 업데이트 중 에러:', error);
  }
};

const FILE_PATHS = {
  config: path.join(os.homedir(), '.ParaglideConfigure.json'),
  log: path.join(os.homedir(), '.ParaglideParaLog.json'),
  logos: {
    light: path.join(__dirname, 'public', 'logo-light.png'),
    dark: path.join(__dirname, 'public', 'logo-dark.png')
  },
  icon: process.platform === 'win32' ? path.join(__dirname, 'public/icons/win/icon.ico')
    : process.platform === 'darwin' ? path.join(__dirname, 'public/icons/mac/icon.icns')
    : path.join(__dirname, 'public/icons/png/512x512.png'),

  ui_icons: path.join(__dirname, 'public', 'UI_icons')
};

// 2. 전역 상태
let mainWindow;
let overlayWindow;
let globalState = {
  programStatus: ProgramStatus.READY,
  paragraphs: [],
  currentParagraph: 0,
  currentNumber: null,
  isDarkMode: nativeTheme.shouldUseDarkColors,
  paragraphsMetadata: [],
  isPaused: false,
  timestamp: Date.now(),
  visibleRanges: {
    overlay: { before: 5, after: 5 }
  }
};

// 3. 상태 관리 시스템
const StatusManager = {
  async transition(newStatus) {
    if (!this.validateTransition(globalState.programStatus, newStatus)) {
      throw new Error(`Invalid transition: ${globalState.programStatus} -> ${newStatus}`);
    }
    await updateGlobalState({ programStatus: newStatus, timestamp: Date.now() });
  },
  
  validateTransition(fromStatus, toStatus) {
    const allowedTransitions = {
      [ProgramStatus.READY]: [ProgramStatus.LOADING],
      [ProgramStatus.LOADING]: [ProgramStatus.PROCESS, ProgramStatus.READY],
      [ProgramStatus.PROCESS]: [ProgramStatus.PAUSE, ProgramStatus.READY],
      [ProgramStatus.PAUSE]: [ProgramStatus.PROCESS, ProgramStatus.READY]
    };
    return allowedTransitions[fromStatus]?.includes(toStatus);
  }
};

// FileManager 수정
const FileManager = {
  async saveConfig(config) {
    try {
      await fs.writeFile(FILE_PATHS.config, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('설정 저장 실패:', error);
    }
  },

  async loadConfig() {
    try {
      const data = await fs.readFile(FILE_PATHS.config, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  },

  async saveLog(log) {
    try {
      const jsonString = JSON.stringify(log, null, 2);
      await fs.writeFile(FILE_PATHS.log, jsonString);
    } catch (error) {
      console.error('로그 저장 실패:', error);
      throw error;
    }
  },

  async loadLog() {
    try {
      const data = await fs.readFile(FILE_PATHS.log, 'utf8');
      return data ? JSON.parse(data) : {};
    } catch (error) {
      return {};
    }
  },

  getFileHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  },

  async saveCurrentPositionToLog() {
    try {
      const log = await this.loadLog();
      if (!globalState.currentFilePath) return;
      
      const fileName = path.basename(globalState.currentFilePath);
      const filePath = globalState.currentFilePath;
      const fileContent = globalState.paragraphs.join('\n');
      const currentMetadata = globalState.paragraphsMetadata[globalState.currentParagraph];

      log[filePath] = {
        fileName,
        filePath,
        fileHash: this.getFileHash(fileContent),
        currentParagraph: globalState.currentParagraph,
        currentPageNumber: currentMetadata?.pageNumber || null,
        timestamp: Date.now()
      };
      
      await this.saveLog(log);
    } catch (error) {
      console.error('현재 위치 저장 실패:', error);
    }
  },

  async checkExistingFile(filePath) {
    try {
      const logPath = FILE_PATHS.log;
      const exists = await fs.access(logPath).then(() => true).catch(() => false);
      
      if (!exists) return { isExisting: false };
      
      const logContent = await fs.readFile(logPath, 'utf8');
      const logData = JSON.parse(logContent);
      
      return {
        isExisting: logData.hasOwnProperty(filePath),
        lastPosition: logData[filePath]?.currentParagraph || 0,  // 필드명 수정
        currentNumber: logData[filePath]?.currentPageNumber      // 필드명 수정
      };
    } catch (error) {
      console.error('파일 확인 실패:', error);
      return { isExisting: false };
    }
  },

  async getFileHistory() {
    try {
      const logPath = FILE_PATHS.log;
      const exists = await fs.access(logPath).then(() => true).catch(() => false);
      if (!exists) return [];

      const logContent = await fs.readFile(logPath, 'utf8');
      const logData = JSON.parse(logContent);
      
      // 현재 파일 제외하고 반환
      return Object.entries(logData)
        .filter(([path]) => path !== globalState.currentFilePath)
        .map(([path, data]) => ({
          path,
          lastPosition: data.lastPosition,
          currentNumber: data.metadata?.currentNumber,
          lastAccessed: data.timestamp,
          metadata: data.metadata
        }))
        .sort((a, b) => b.lastAccessed - a.lastAccessed);
    } catch (error) {
      console.error('파일 기록 로드 실패:', error);
      return [];
    }
  },

  // main.js 수정 - 통합된 파일 열기 함수
  async openFile(filePath, source = 'normal') {
    try {
      // 1. 파일 내용 읽기
      const content = await fs.readFile(filePath, 'utf8');
      if (!content) {
        console.error('파일 내용 없음:', filePath);
        return { success: false };
      }

      // 2. 로그에서 이전 위치 정보 읽기
      const logData = await this.checkExistingFile(filePath);
      const startPosition = logData.isExisting ? logData.lastPosition : 0;
      const savedPageNumber = logData.currentNumber;

      // 3. 파일 처리
      const result = TextProcessor.processParagraphs(content);
      if (!result?.paragraphsToDisplay) {
        console.error('단락 처리 실패');
        return { success: false };
      }

      // 4. 상태 업데이트
      await updateGlobalState({
        paragraphs: result.paragraphsToDisplay,
        paragraphsMetadata: result.paragraphsMetadata,
        currentFilePath: filePath,
        currentParagraph: startPosition,
        currentNumber: savedPageNumber,
        programStatus: ProgramStatus.PROCESS
      }, source);

      console.log('파일 로드 완료:', {
        path: filePath,
        paragraphs: result.paragraphsToDisplay.length,
        position: startPosition,
        pageNumber: savedPageNumber
      });

      return { success: true };
    } catch (error) {
      console.error('파일 열기 실패:', error);
      return { success: false };
    }
  },

  // openHistoryFile은 openFile을 호출하도록 수정
  async openHistoryFile(filePath) {
    return await this.openFile(filePath, 'history');
  },

  async removeFromHistory(filePath) {
    try {
      const log = await this.loadLog(); // 기존의 loadLog 메소드 활용
      
      if (log[filePath]) {
        delete log[filePath];
        await this.saveLog(log); // 기존의 saveLog 메소드 활용
        
        // 현재 열린 파일이 삭제된 파일인 경우 처리
        if (globalState.currentFilePath === filePath) {
          updateGlobalState({
            currentFilePath: null,
            paragraphs: [],
            currentParagraph: 0,
            programStatus: ProgramStatus.READY
          });
        }
        
        return { success: true };
      }
      return { success: false, reason: 'File not found in history' };
    } catch (error) {
      console.error('히스토리 삭제 실패:', error);
      return { success: false, reason: error.message };
    }
  }
};

// 5. 윈도우 관리 시스템
const WindowManager = {
  createMainWindow() {
    mainWindow = new BrowserWindow({
      width: 600,
      height: 600,
      minWidth: 600,
      minHeight: 660,
      maxWidth: 1300,
      maxHeight: 800,
      show: false,
      title: 'Paraglide',
      icon: FILE_PATHS.icon,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    mainWindow.loadURL('http://localhost:3000');
    this.setupMainWindowEvents();
  },

  createOverlayWindow() {
    overlayWindow = new BrowserWindow({
      width: globalState.overlayBounds?.width || 300,
      height: globalState.overlayBounds?.height || 240,
      x: globalState.overlayBounds?.x,
      y: globalState.overlayBounds?.y,
      minHeight: 240,
      minWidth: 300,
      maxHeight: 600,
      maxWidth: 500,
      frame: false,
      transparent: true,
      focusable: true,
      alwaysOnTop: true,
      resizable: true,
      movable: true,
      hasShadow: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    overlayWindow.loadURL('http://localhost:3000/overlay');
    this.setupOverlayWindowEvents();
  },

  setupMainWindowEvents() {
    mainWindow.once('ready-to-show', () => {
      mainWindow.webContents.send('theme-updated', globalState.isDarkMode);
      mainWindow.show();
    });

    mainWindow.on('closed', () => ApplicationManager.exit());
  },

  setupOverlayWindowEvents() {
    overlayWindow.on('move', this.saveOverlayBounds);
    overlayWindow.on('resize', this.saveOverlayBounds);
    overlayWindow.on('close', (e) => {
      e.preventDefault();
      overlayWindow.hide();
    });
  },

  saveOverlayBounds() {
    if (!overlayWindow) return;
    globalState.overlayBounds = overlayWindow.getBounds();
    FileManager.saveConfig({ overlayBounds: globalState.overlayBounds });
  },

  async updateOverlayContent() {
    if (!overlayWindow) return;
    
    const prevParagraphs = [];
    const nextParagraphs = [];
    const { before, after } = globalState.visibleRanges.overlay;

    for (let i = 1; i <= before; i++) {
      const prev = TextProcessor.getParagraphByOffset(globalState.currentParagraph, -i);
      if (prev) prevParagraphs.unshift(prev);
    }

    for (let i = 1; i <= after; i++) {
      const next = TextProcessor.getParagraphByOffset(globalState.currentParagraph, i);
      if (next) nextParagraphs.push(next);
    }

    const currentMetadata = globalState.paragraphsMetadata[globalState.currentParagraph];
    overlayWindow.webContents.send('paragraphs-updated', {
      previous: prevParagraphs,
      current: globalState.paragraphs[globalState.currentParagraph],
      next: nextParagraphs,
      currentParagraph: globalState.currentParagraph,
      currentNumber: currentMetadata?.pageNumber,
      isDarkMode: globalState.isDarkMode,
      isPaused: globalState.isPaused
    });
  }
};

// 6. 텍스트 처리 시스템
const TextProcessor = {
  pagePatterns: {
    numberOnly: /^(\d+)$/,
    koreanStyle: /^(\d+)(페이지|페)$/,
    englishStyle: /^(\d+)(page|p)$/i
  },

  skipPatterns: {
    separator: /^[=\-]{3,}/,
    comment: /^[\/\/#]/
  },

  getParagraphByOffset(baseParagraph, offset) {
    const targetParagraph = baseParagraph + offset;
    if (targetParagraph >= 0 && targetParagraph < globalState.paragraphs.length) {
      return {
        text: globalState.paragraphs[targetParagraph],
        metadata: globalState.paragraphsMetadata[targetParagraph],
        index: targetParagraph,
        distanceFromCurrent: offset
      };
    }
    return null;
  },

  processParagraphs(fileContent) {
    const splitParagraphs = fileContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    let currentNumber = null;
    const paragraphsMetadata = [];
    const paragraphsToDisplay = [];
    let previousWasPageNumber = false;

    splitParagraphs.forEach((p) => {
      const pageNum = this.extractPageNumber(p);
      
      if (pageNum) {
        currentNumber = pageNum;
        previousWasPageNumber = true;
      } else if (!this.shouldSkipParagraph(p)) {
        paragraphsToDisplay.push(p);
        paragraphsMetadata.push({
          isPageChange: previousWasPageNumber,
          pageNumber: currentNumber,
          index: paragraphsToDisplay.length - 1
        });
        previousWasPageNumber = false;
      }
    });

    return { paragraphsToDisplay, paragraphsMetadata, currentNumber };
  },
  
  extractPageNumber(paragraph) {
    for (const pattern of Object.values(this.pagePatterns)) {
      const match = paragraph.trim().match(pattern);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  },

  shouldSkipParagraph(paragraph) {
    return Object.values(this.skipPatterns).some(pattern => 
      pattern.test(paragraph.trim())
    );
  }
};

// 7. IPC 통신 관리
const IPCManager = {
  copyLogDebouncer: debounce(async () => {
    try {
      await FileManager.saveCurrentPositionToLog();
    } catch (error) {
      console.error('복사 로깅 실패:', error);
    }
  }, 1000),

  setupHandlers() {
    this.setupStateHandlers();
    this.setupWindowHandlers();
    this.setupFileHandlers();
    this.setupNavigationHandlers();
    this.setupClipboardHandlers();  // 추가
  },

  setupClipboardHandlers() {
    ipcMain.on('copy-to-clipboard', (event, content) => {
      mainWindow?.webContents.send('notify-clipboard-change');
      systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
    });
  },

  // setupCopyHandlers 메서드 제거

  setupStateHandlers() {
    ipcMain.handle('get-state', () => globalState);
    
    ipcMain.on('update-state', (event, newState) => {
      updateGlobalState(newState);
    });

    ipcMain.handle('get-logo-path', async () => {
      try {
        const logoPath = nativeTheme.shouldUseDarkColors ? 
          FILE_PATHS.logos.dark : FILE_PATHS.logos.light;
        const imageBuffer = await fs.readFile(logoPath);
        return `data:image/png;base64,${imageBuffer.toString('base64')}`;
      } catch (error) {
        console.error('로고 로드 실패:', error);
        return null;
      }
    });

    ipcMain.handle('remove-history-file', async (event, filePath) => {
      try {
        return await FileManager.removeFromHistory(filePath);
      } catch (error) {
        console.error('히스토리 삭제 처리 실패:', error);
        return { success: false, reason: error.message };
      }
    });

    ipcMain.on('toggle-pause', () => {
      // 일시정지/재개 토글
      const newStatus = globalState.programStatus === ProgramStatus.PROCESS ? 
        ProgramStatus.PAUSE : 
        ProgramStatus.PROCESS;
      
      updateGlobalState({
        programStatus: newStatus,
        timestamp: Date.now()
      });
    });
  },

  setupWindowHandlers() {
    ipcMain.on('toggle-overlay', () => {
      if (!overlayWindow) return;
      
      globalState.isOverlayVisible = !globalState.isOverlayVisible;
      if (globalState.isOverlayVisible) {
        overlayWindow.show();
        mainWindow.focus();
      } else {
        overlayWindow.hide();
      }
      updateGlobalState({ isOverlayVisible: globalState.isOverlayVisible });
    });

    ipcMain.on('toggle-pause', () => {
      globalState.isPaused = !globalState.isPaused;
      updateGlobalState({ isPaused: globalState.isPaused });
    });

    ipcMain.handle('get-window-position', () => {
      if (!overlayWindow) return { x: 0, y: 0 };
      const [x, y] = overlayWindow.getPosition();
      return { x, y };
    });
  },

  setupFileHandlers() {
    // 파일 대화상자 열기
    ipcMain.handle('open-file-dialog', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const openResult = await FileManager.openFile(filePath, 'dialog');
        return openResult.success ? filePath : null;
      }
      return null;
    });

    // 파일 읽기
    ipcMain.handle('read-file', async (event, filePath) => {
      try {
        return await fs.readFile(filePath, 'utf8');
      } catch (error) {
        console.error('파일 읽기 실패:', error);
        return null;
      }
    });

    ipcMain.handle('get-icon-path', async (event, iconName) => {
      try {
        const iconPath = path.join(FILE_PATHS.ui_icons, iconName);
        const svgContent = await fs.readFile(iconPath, 'utf8');
        return `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
      } catch (error) {
        console.error('아이콘 로드 실패:', error);
        return null;
      }
    });

    ipcMain.handle('process-file-content', async (event, fileContent, filePath) => {
      try {
        if (!fileContent || !filePath) return { success: false };

        const fileStatus = await FileManager.checkExistingFile(filePath, fileContent);
        const result = TextProcessor.processParagraphs(fileContent);
        
        if (!result?.paragraphsToDisplay) return { success: false };

        const startPosition = fileStatus.isExisting ? fileStatus.lastPosition : 0;
        const currentMetadata = result.paragraphsMetadata[startPosition];
        
        // 상태 업데이트 전 디버깅
        console.log('파일 처리 결과:', {
          position: startPosition,
          pageNumber: currentMetadata?.pageNumber,
          totalParagraphs: result.paragraphsToDisplay.length
        });

        // 오버레이 창 생성/표시
        if (!overlayWindow || overlayWindow.isDestroyed()) {
          createOverlayWindow();
        } else {
          overlayWindow.show();
        }

        // 상태 업데이트
        await updateGlobalState({
          paragraphs: result.paragraphsToDisplay,
          paragraphsMetadata: result.paragraphsMetadata,
          currentFilePath: filePath,
          currentParagraph: startPosition,
          currentNumber: currentMetadata?.pageNumber,
          programStatus: ProgramStatus.PROCESS,
          isOverlayVisible: true
        });

        return { success: true };
      } catch (error) {
        console.error('파일 처리 중 오류:', error);
        return { success: false };
      }
    });

    // main.js에 추가할 IPC 핸들러
    ipcMain.handle('get-file-history', async () => {
      try {
        const logPath = FILE_PATHS.log;
        const exists = await fs.access(logPath).then(() => true).catch(() => false);
        if (!exists) return {};
        
        const logContent = await fs.readFile(logPath, 'utf8');
        return {
          logData: JSON.parse(logContent),
          currentFile: {
            path: globalState.currentFilePath,
            hash: globalState.fileHash
          }
        };
      } catch (error) {
        console.error('로그 파일 읽기 실패:', error);
        return {};
      }
    });

    ipcMain.handle('remove-file-history', async (event, filePath) => {
      try {
        const logPath = FILE_PATHS.log;
        const logContent = await fs.readFile(logPath, 'utf8');
        const logData = JSON.parse(logContent);
        
        delete logData[filePath];
        
        await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
        return true;
      } catch (error) {
        console.error('파일 기록 삭제 실패:', error);
        return false;
      }
    });

    // IPC 핸들러 수정
    ipcMain.handle('open-history-file', async (event, filePath) => {
      return await FileManager.openFile(filePath, 'history');
    });
  },

  setupNavigationHandlers() {
    const handleMove = (direction) => {
      const isNext = direction === 'next';
      const canMove = isNext ? 
        globalState.currentParagraph < globalState.paragraphs.length - 1 :
        globalState.currentParagraph > 0;
      
      if (canMove) {
        // 클립보드 변경 전에 내부 변경 알림
        mainWindow?.webContents.send('notify-clipboard-change');
        
        updateGlobalState({
          currentParagraph: globalState.currentParagraph + (isNext ? 1 : -1),
          timestamp: Date.now()
        }, 'move');
      }
    };

    ipcMain.on('move-to-next', () => handleMove('next'));
    ipcMain.on('move-to-prev', () => handleMove('prev'));
  }
};

const ApplicationManager = {
  async initialize() {
    try {
      await StatusManager.transition(ProgramStatus.LOADING);
      
      // SystemListener 초기화 추가
      require('./src/SystemListener.js');
      
      globalState.isDarkMode = nativeTheme.shouldUseDarkColors;
      const savedConfig = await FileManager.loadConfig();
      
      if (savedConfig.overlayBounds) {
        globalState.overlayBounds = savedConfig.overlayBounds;
      }

      WindowManager.createMainWindow();
      WindowManager.createOverlayWindow();
      IPCManager.setupHandlers();
      
      await StatusManager.transition(ProgramStatus.READY);
      mainWindow?.show();
    } catch (error) {
      console.error('Application initialization failed:', error);
      await StatusManager.transition(ProgramStatus.READY);
    }
  },

  async exit() {
    try {
      await FileManager.saveCurrentPositionToLog();
      await FileManager.saveConfig(globalState);

      if (overlayWindow) {
        overlayWindow.destroy();
        overlayWindow = null;
      }
      if (mainWindow) {
        mainWindow.destroy();
        mainWindow = null;
      }
    } catch (error) {
      console.error('종료 시 백엔드 작업 중 에러 발생:', error);
    } finally {
      app.quit();
    }
  }
};

// 앱 시작점
app.whenReady().then(() => ApplicationManager.initialize());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ApplicationManager.exit();
  }
});

// 오버레이 창 생성 함수 수정
function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.loadURL(
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000/overlay'
      : `file://${path.join(__dirname, 'build/index.html')}/overlay`
  );

  // 로드 완료 시 현재 상태 전송
  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('오버레이 창 로드 완료');
    overlayWindow.webContents.send('state-update', {
      ...globalState,
      timestamp: Date.now()
    });
  });

  // 디버깅 로그 추가
  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('오버레이 창 상태:', {
      windowExists: !!overlayWindow,
      isDestroyed: overlayWindow?.isDestroyed(),
      currentState: globalState
    });
  });
}

// 예외 처리기 (디버깅용)
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});