// main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const SystemListener = require('./src/SystemListener.js');  // 클래스로 import

// 디바운스 함수 정의
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
  debounceTime: 250, // 디바운스 시간 설정

  // 복사와 로깅 통합 함수
  copyAndLogDebouncer: debounce(async (content, skipLog = false) => {
    try {
      if (!content) return;

      // systemListener 인스턴스 확인
      if (!systemListener) {
        console.error('systemListener가 초기화되지 않았습니다');
        return;
      }

      // 클립보드 변경 전 내부 변경 알림
      mainWindow?.webContents.send('notify-clipboard-change');

      // 클립보드 변경 전에 내부 복사 플래그 설정
      systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
      console.log('복사됨:', content.substring(0, 20) + '...');

      // 로깅 수행 (skipLog가 true일 경우 건너뜀)
      if (!skipLog && globalState.currentFilePath) {
        await FileManager.saveCurrentPositionToLog();
        console.log('로그 저장됨');
      }
    } catch (error) {
      console.error('복사/로깅 중 오류:', error);
    }
  }, DEBOUNCE_TIME),
};

// 파일 경로 정의
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

// 전역 상태
let mainWindow;
let overlayWindow;
let systemListener;
let globalState = {
  programStatus: ProgramStatus.READY,
  paragraphs: [],
  currentParagraph: 0,
  currentNumber: null,
  isDarkMode: nativeTheme.shouldUseDarkColors,
  paragraphsMetadata: [],
  isPaused: false,
  timestamp: Date.now(),
  isOverlayVisible: false,
  visibleRanges: {
    overlay: { before: 5, after: 5 }
  }
};

// 상태 업데이트 함수
const updateGlobalState = async (newState, source = 'other') => {
  try {
    // READY 상태로 전환 시 특별 처리
    if (newState.programStatus === ProgramStatus.READY) {
      globalState = {
        ...globalState,
        programStatus: ProgramStatus.READY,
        paragraphs: [],
        currentParagraph: 0,
        currentNumber: null,
        isPaused: false,
        isOverlayVisible: false,
        currentFilePath: null
      };

      // 오버레이 창 숨기기
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
    } else {
      // 일반적인 상태 업데이트
      globalState = { ...globalState, ...newState };
    }

    // 여기에 단락 변경 시 디바운스된 복사 로직 추가
    if ('currentParagraph' in newState && globalState.paragraphs?.[globalState.currentParagraph]) {
      ContentManager.copyAndLogDebouncer(globalState.paragraphs[globalState.currentParagraph]);
    }

    // UI 업데이트
    mainWindow?.webContents.send('state-update', globalState);
    if (globalState.isOverlayVisible && overlayWindow) {
      overlayWindow.show();
      await WindowManager.updateOverlayContent();
    }

    ipcMain.emit('program-status-update', 'event', {
      isPaused: globalState.isPaused,
      programStatus: globalState.programStatus
    });

  } catch (error) {
    console.error('상태 업데이트 중 에러:', error);
  }
};

// 상태 관리 시스템
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

// FileManager 정의
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
      const logData = await this.loadLog();
      return {
        isExisting: logData.hasOwnProperty(filePath),
        lastPosition: logData[filePath]?.currentParagraph || 0,
        currentNumber: logData[filePath]?.currentPageNumber
      };
    } catch (error) {
      console.error('파일 확인 실패:', error);
      return { isExisting: false };
    }
  },

  async getFileHistory() {
    try {
      const logData = await this.loadLog();

      // 현재 파일 제외하고 반환
      return Object.entries(logData)
        .filter(([path]) => path !== globalState.currentFilePath)
        .map(([path, data]) => ({
          path,
          lastPosition: data.currentParagraph,
          currentNumber: data.currentPageNumber,
          lastAccessed: data.timestamp,
          metadata: data.metadata
        }))
        .sort((a, b) => b.lastAccessed - a.lastAccessed);
    } catch (error) {
      console.error('파일 기록 로드 실패:', error);
      return [];
    }
  },

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

  async openHistoryFile(filePath) {
    return await this.openFile(filePath, 'history');
  },

  async removeFromHistory(filePath) {
    try {
      const log = await this.loadLog();

      if (log[filePath]) {
        delete log[filePath];
        await this.saveLog(log);

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

// WindowManager 정의
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
      },
      autoHideMenuBar: true
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
    overlayWindow.on('move', this.saveOverlayBounds.bind(this));
    overlayWindow.on('resize', this.saveOverlayBounds.bind(this));
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

// TextProcessor 정의
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

// IPC 통신 관리
let handlersInitialized = false;
let logWindow = null;
let logMessages = [];

// stdout 및 stderr 캡처
const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);

process.stdout.write = function(chunk) {
  logMessages.push(chunk.toString());
  return originalStdout(chunk);
};

process.stderr.write = function(chunk) {
  logMessages.push(chunk.toString());
  return originalStderr(chunk);
};

const IPCManager = {
  setupHandlers() {
    if (handlersInitialized) return;

    // 상태 관련 핸들러
    ipcMain.handle('get-state', () => globalState);
    ipcMain.on('update-state', (event, newState) => updateGlobalState(newState));

    // 파일 관련 핸들러
    ipcMain.handle('get-file-history', () => FileManager.getFileHistory());
    ipcMain.handle('remove-history-file', async (event, filePath) =>
      FileManager.removeFromHistory(filePath));
    ipcMain.handle('open-file-dialog', async (...args) => this.handleOpenFileDialog(...args));
    ipcMain.handle('read-file', async (event, filePath) => fs.readFile(filePath, 'utf8'));
    ipcMain.handle('process-file-content', async (...args) =>
      this.handleProcessFileContent(...args));

    // 리소스 관련 핸들러
    ipcMain.handle('get-logo-path', async () => this.handleGetLogoPath());
    ipcMain.handle('get-icon-path', async (event, iconName) => this.handleGetIconPath(iconName));

    // 클립보드 관련 핸들러
    ipcMain.on('copy-to-clipboard', (event, content) => {
      mainWindow?.webContents.send('notify-clipboard-change');
      systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
    });

    // 네비게이션 핸들러
    ipcMain.on('move-to-next', () => IPCManager.handleMove('next'));
    ipcMain.on('move-to-prev', () => IPCManager.handleMove('prev'));
    ipcMain.on('move-to-position', (event, position) => this.handleMoveToPosition(position));

    // 윈도우 관련 핸들러
    ipcMain.on('toggle-overlay', () => this.handleToggleOverlay());
    ipcMain.on('toggle-pause', () => this.handlePause());
    ipcMain.on('toggle-resume', () => this.handleResume());

    // 디버그 콘솔 핸들러
    ipcMain.on('show-debug-console', () => this.handleShowDebugConsole());

    // 테마 관련 핸들러
    ipcMain.handle('get-theme', () => {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    // 테마 변경 감지
    nativeTheme.on('updated', () => {
      const isDark = nativeTheme.shouldUseDarkColors;
      const newTheme = isDark ? 'dark' : 'light';
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('theme-changed', newTheme);
      });
      updateGlobalState({ ...globalState, theme: newTheme });
    });

    // 초기 테마 상태 설정
    const initialTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    updateGlobalState({ ...globalState, theme: initialTheme });

    handlersInitialized = true;
  },

  // 파일 관련 메서드
  async handleOpenFileDialog() {
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
  },

  async handleProcessFileContent(event, fileContent, filePath) {
    if (!fileContent || !filePath) return { success: false };

    const fileStatus = await FileManager.checkExistingFile(filePath);
    const result = TextProcessor.processParagraphs(fileContent);

    if (!result?.paragraphsToDisplay) return { success: false };

    const startPosition = fileStatus.isExisting ? fileStatus.lastPosition : 0;
    const currentMetadata = result.paragraphsMetadata[startPosition];

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
  },

  // 리소스 관련 메서드
  async handleGetLogoPath() {
    try {
      const logoPath = nativeTheme.shouldUseDarkColors ?
        FILE_PATHS.logos.dark : FILE_PATHS.logos.light;
      const imageBuffer = await fs.readFile(logoPath);
      return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
      console.error('로고 로드 실패:', error);
      return null;
    }
  },

  async handleGetIconPath(iconName) {
    try {
      const iconPath = path.join(FILE_PATHS.ui_icons, iconName);
      const svgContent = await fs.readFile(iconPath, 'utf8');
      return `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
    } catch (error) {
      console.error('아이콘 로드 실패:', error);
      return null;
    }
  },

  // 네비게이션 관련 메서드
  handleMove(direction) {
    const isNext = direction === 'next';
    const canMove = isNext ?
      globalState.currentParagraph < globalState.paragraphs.length - 1 :
      globalState.currentParagraph > 0;

    if (canMove) {
      mainWindow?.webContents.send('notify-clipboard-change');
      this.handleResume();
      updateGlobalState({
        currentParagraph: globalState.currentParagraph + (isNext ? 1 : -1),
        timestamp: Date.now(),
      }, 'move');
    }
  },

  handleMoveToPosition(position) {
    if (position >= 0 && position < globalState.paragraphs.length) {
      mainWindow?.webContents.send('notify-clipboard-change');
      updateGlobalState({
        currentParagraph: position,
        timestamp: Date.now()
      }, 'move');
    }
  },

  // 윈도우 관련 메서드
  handleToggleOverlay() {
    if (!overlayWindow) return;

    globalState.isOverlayVisible = !globalState.isOverlayVisible;
    if (globalState.isOverlayVisible) {
      overlayWindow.show();
      mainWindow.focus();
    } else {
      overlayWindow.hide();
    }
    updateGlobalState({ isOverlayVisible: globalState.isOverlayVisible });
  },

  handlePause() {
    if (!globalState.isPaused) {
      globalState.isPaused = true;
      updateGlobalState({ isPaused: true });
    }
  },
  
  handleResume() {
    if (globalState.isPaused) {
      globalState.isPaused = false;
      updateGlobalState({ isPaused: false });
    }
  },

  // 디버그 콘솔 메서드
  handleShowDebugConsole() {
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.focus();
      // 기존 창이 있다면 내용 업데이트
      logWindow.webContents.send('update-logs', logMessages.join(''));
      return;
    }

    logWindow = new BrowserWindow({
      width: 800,
      height: 600,
      backgroundColor: '#1e1e1e',
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>/* 기존 스타일 유지 */</style>
        </head>
        <body>
          <div class="title-bar">
            <div class="title">Terminal Logs</div>
            <button class="close-button" onclick="closeWindow()">×</button>
          </div>
          <div id="logContent" class="log-content"></div>
          <script>
            const { ipcRenderer } = require('electron');
            
            function closeWindow() {
              window.close();
            }
            
            // 로그 업데이트 수신 및 표시
            const logContent = document.getElementById('logContent');
            ipcRenderer.on('update-logs', (_, logs) => {
              logContent.textContent = logs;
              logContent.scrollTop = logContent.scrollHeight;
            });
          </script>
        </body>
      </html>
    `;

    logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    logWindow.webContents.on('did-finish-load', () => {
      logWindow.webContents.send('update-logs', logMessages.join(''));
    });

    logWindow.on('closed', () => {
      logWindow = null;
    });
  }
};

// ApplicationManager 정의
const ApplicationManager = {
  async initialize() {
    try {
      await StatusManager.transition(ProgramStatus.LOADING);

      // 설정 로드
      const savedConfig = await FileManager.loadConfig();
      if (savedConfig.overlayBounds) {
        globalState.overlayBounds = savedConfig.overlayBounds;
      }
      
      // 윈도우 생성
      WindowManager.createMainWindow();
      WindowManager.createOverlayWindow();

      // SystemListener 초기화
      systemListener = new SystemListener(mainWindow);
      await systemListener.initialize();

      // 나머지 초기화
      globalState.isDarkMode = nativeTheme.shouldUseDarkColors;

      // IPC 핸들러 설정
      IPCManager.setupHandlers();

      await StatusManager.transition(ProgramStatus.READY);
      console.log('Application initialized successfully');
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

// 예외 처리기 (디버깅용)
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});