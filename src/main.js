// main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, clipboard, screen } = require('electron');
const path = require('path');
const store = require('./store/store');
const { TextProcessUtils } = require('./store/utils/TextProcessUtils');
const { textProcessActions } = require('./store/slices/textProcessSlice');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const url = require('url');
const SystemListener = require('./SystemListener.js');  // 클래스로 import

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
      if (!systemListener) {
        console.error('systemListener가 초기화되지 않았습니다');
        return;
      }
  
      mainWindow?.webContents.send('notify-clipboard-change');
      systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
      console.log('복사됨:', content.substring(0, 20) + '...');
  
      // 로깅 수행
      if (!skipLog && globalState.currentFilePath) {
        await FileManager.saveCurrentPositionToLog(); // 이미 Redux store 사용하도록 수정됨
        console.log('로그 저장됨');
      }
    } catch (error) {
      console.error('복사/로깅 중 오류:', error);
    }
  }, DEBOUNCE_TIME),
};

const isDev = !app.isPackaged;
const appPath = isDev ? path.resolve(__dirname, '..') : app.getAppPath();

// 파일 경로 정의
const FILE_PATHS = {
  config: path.join(os.homedir(), '.ParaglideConfigure.json'),
  log: path.join(os.homedir(), '.ParaglideParaLog.json'),
  logos: {
    light: isDev 
      ? path.join(appPath, 'public', 'logo-light.png')
      : path.join(process.resourcesPath, './app.asar.unpacked/public', 'logo-light.png'),
    dark: isDev
      ? path.join(appPath, 'public', 'logo-dark.png')
      : path.join(process.resourcesPath, './app.asar.unpacked/public', 'logo-dark.png')
  },
  icon: isDev
    ? path.join(appPath, 'public', 'icons', 'mac', 'icon.icns')
    : path.join(process.resourcesPath, './app.asar.unpacked/public', 'icons', 'mac', 'icon.icns'),
  ui_icons: isDev
    ? path.join(appPath, 'public', 'UI_icons')
    : path.join(process.resourcesPath, './app.asar.unpacked/public', 'UI_icons')
};


// 설정할 값 정의

const getDefaultConfig = () => ({
  overlayBounds: { 
    width: 300, 
    height: 240,
    get x() { return Math.floor(screen.getPrimaryDisplay().workAreaSize.width * 0.02) },
    get y() { return Math.floor(screen.getPrimaryDisplay().workAreaSize.height * 0.05) }
  },
  windowOpacity: 1.0,
  contentOpacity: 0.8,
  overlayFixed: false,
  loadLastOverlayBounds: true,
  accentColor: '#007bff'
});

const ConfigManager = {
  extractConfig(config = {}) {

    const defaultConfig = getDefaultConfig();
    const loadLastOverlayBounds = typeof config.loadLastOverlayBounds !== 'undefined' 
    ? config.loadLastOverlayBounds 
    : defaultConfig.loadLastOverlayBounds;

    return {
      overlayBounds: loadLastOverlayBounds
        ? (config.overlayBounds || defaultConfig.overlayBounds)
        : defaultConfig.overlayBounds,
      windowOpacity: config.windowOpacity ?? defaultConfig.windowOpacity,
      contentOpacity: config.contentOpacity ?? defaultConfig.contentOpacity,
      overlayFixed: typeof config.overlayFixed !== 'undefined' ? config.overlayFixed : defaultConfig.overlayFixed,
      loadLastOverlayBounds,
      accentColor: config.accentColor || defaultConfig.accentColor
    };
  }
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
  isPaused: true,
  timestamp: Date.now(),
  isOverlayVisible: false,
  visibleRanges: {
    overlay: { before: 5, after: 5 }
  },

  // Settings.json
  overlayBounds: { width: 300, height: 240 },
  windowOpacity: 1.0,
  contentOpacity: 0.8,
  overlayFixed: false,
  accentColor: '#007bff',
  loadLastOverlayBounds: true
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

    // updateGlobalState 함수 내부 수정
    if ('isPaused' in newState && newState.isPaused === false) {
      const state = store.getState()?.textProcess;
      if (state?.paragraphs?.[state.currentParagraph]) {
        ContentManager.copyAndLogDebouncer(state.paragraphs[state.currentParagraph]);
      }
    }
    
    if ('currentParagraph' in newState) {
      const state = store.getState()?.textProcess;
      if (state?.paragraphs?.[state.currentParagraph]) {
        ContentManager.copyAndLogDebouncer(state.paragraphs[state.currentParagraph]);
      }
    }

    // UI 업데이트
    mainWindow?.webContents.send('state-update', globalState);

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (globalState.isOverlayVisible) {
        overlayWindow.showInactive();
        await WindowManager.updateOverlayContent();
      } else {
        overlayWindow.hide();
      }
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
      const configToSave = ConfigManager.extractConfig(config);
      await fs.writeFile(FILE_PATHS.config, JSON.stringify(configToSave, null, 2));
    } catch (error) {
      console.error('설정 저장 실패:', error);
    }
  },

  async loadConfig() {
    try {

     try{
      await fs.access(FILE_PATHS.config);
    } catch {
      // 파일이 없으면 기본 설정으로 새로 생성
      const defaultConfig = getDefaultConfig();
      await this.saveConfig(defaultConfig);
      return defaultConfig;
    }

      const data = await fs.readFile(FILE_PATHS.config, 'utf8');

        // 내용이 비어있거나 유효하지 않은 JSON인 경우
        if (!data.trim()) {
          const defaultConfig = getDefaultConfig();
          await this.saveConfig(defaultConfig);
          return defaultConfig;
        }

      return JSON.parse(data);
    } catch (error) {
      console.error('설정 로드 실패, 기본값 사용:', error);
      return getDefaultConfig();
    }
  },

  async saveLog(log) {
    try {
      // 1. 데이터 유효성 검증
      const validLog = typeof log === 'object' ? log : {};
      
      // 2. JSON 문자열로 변환
      const jsonString = JSON.stringify(validLog, null, 2);
      
      // 3. 파일 저장
      await fs.writeFile(FILE_PATHS.log, jsonString, 'utf8');
      
      console.log('로그 저장 완료');
      return true;
    } catch (error) {
      console.error('로그 저장 실패:', error);
      return false;
    }
  },

  async loadLog() {
    try {
      // 1. 파일 존재 여부 확인
      try {
        await fs.access(FILE_PATHS.log);
      } catch {
        // 파일이 없으면 빈 로그로 새로 생성
        await this.saveLog({});
        return {};
      }

      // 2. 파일 읽기
      const data = await fs.readFile(FILE_PATHS.log, 'utf8');

      // 3. 내용 검증
      if (!data.trim()) {
        // 빈 파일이면 초기화
        await this.saveLog({});
        return {};
      }

      try {
        // JSON 파싱 시도
        const parsed = JSON.parse(data);
        
        // 객체가 아니면 초기화
        if (!parsed || typeof parsed !== 'object') {
          await this.saveLog({});
          return {};
        }

        return parsed;
      } catch (parseError) {
        // JSON 파싱 실패시 파일 복구
        console.error('로그 파일 손상, 초기화됨:', parseError);
        await this.saveLog({});
        return {};
      }
    } catch (error) {
      console.error('로그 파일 로드 실패:', error);
      return {};
    }
  },

  async clearLogs() {
    try {
      await this.saveLog({});
      console.log('로그 파일이 정리되었습니다.');
      return { success: true };
    } catch (error) {
      console.error('로그 파일 정리 실패:', error);
      return { success: false };
    }
  },

  getFileHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  },

  async saveCurrentPositionToLog() {
    try {
      const log = await this.loadLog();
      if (!globalState.currentFilePath) return;
  
      const state = store.getState().textProcess;
      const fileName = path.basename(globalState.currentFilePath);
      const filePath = globalState.currentFilePath;
      const fileContent = state.paragraphs.join('\n');
      const currentMetadata = state.paragraphsMetadata[state.currentParagraph];
  
      log[filePath] = {
        fileName,
        filePath,
        fileHash: this.getFileHash(fileContent),
        currentParagraph: state.currentParagraph,
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
      const state = store.getState().textProcess;
      const currentFile = globalState.currentFilePath ? {
        path: globalState.currentFilePath,
        hash: this.getFileHash(state.paragraphs.join('\n')) // globalState -> state로 변경
      } : null;
  
      return {
        logData,
        currentFile
      };
    } catch (error) {
      console.error('파일 기록 로드 실패:', error);
      return [];
    }
  },

  async openFile(filePath, source = 'normal') {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      if (!content) {
        console.error('파일 내용 없음:', filePath);
        return { success: false };
      }
  
      const logData = await this.checkExistingFile(filePath);
      const startPosition = logData.isExisting ? logData.lastPosition : 0;
  
      // Redux store에서 처리
      store.dispatch(textProcessActions.processParagraphs(content));
      const state = store.getState().textProcess;
      
      console.log('파일 로드 완료:', {
        path: filePath,
        paragraphs: state.paragraphs.length,
        position: startPosition,
        pageNumber: state.currentNumber
      });
  
      await updateGlobalState({
        ...state,
        currentFilePath: filePath,
        programStatus: ProgramStatus.PROCESS
      }, source);
  
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
      height: 660,
      minWidth: 600,
      minHeight: 660,
      maxWidth: 1300,
      maxHeight: 800,
      show: false,
      title: 'Paraglide',
      icon: FILE_PATHS.icon,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      autoHideMenuBar: true
    });

    const startUrl = isDev
      ? 'http://localhost:3000'
      : url.format({
          pathname: path.join(__dirname, '../build/index.html'),
          protocol: 'file:',
          slashes: true
        });

    console.log('Main Window Path:', app.getAppPath());
    console.log('Main Window URL:', startUrl);
    mainWindow.loadURL(startUrl);
    this.setupMainWindowEvents();
  },

  createOverlayWindow() {

    const defaultBounds = {
      width: 300,
      height: 240,
      x: undefined,
      y: undefined
    };

    const bounds = globalState.loadLastOverlayBounds ? 
      { ...globalState.overlayBounds } : 
      { ...defaultBounds };

    overlayWindow = new BrowserWindow({
      width: globalState.loadLastOverlayBounds ? bounds.width : defaultBounds.width,
      height: globalState.loadLastOverlayBounds ? bounds.height : defaultBounds.height,
      x: globalState.loadLastOverlayBounds ? bounds.x : undefined,
      y: globalState.loadLastOverlayBounds ? bounds.y : undefined,
      minHeight: 240,
      minWidth: 300,
      maxHeight: 600,
      maxWidth: 500,
      opacity: globalState.windowOpacity,
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
        contextIsolation: false,
        enableRemoteModule: true
      }
    });

    const overlayUrl = isDev
    ? 'http://localhost:3000/#/overlay'  // 해시 경로 추가
    : url.format({
        pathname: path.join(__dirname, '../build/index.html'),
        protocol: 'file:',
        slashes: true,
        hash: '/overlay'
      });

  console.log('Overlay URL:', overlayUrl);
  overlayWindow.loadURL(overlayUrl);
  this.setupOverlayWindowEvents();
  },

  setupMainWindowEvents() {
    mainWindow.once('ready-to-show', () => {
      mainWindow.webContents.send('theme-changed', globalState.isDarkMode);
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

  async saveOverlayBounds() {
    if (!overlayWindow) return;
  
    // 1. 현재 설정 로드
    const currentConfig = await FileManager.loadConfig();
    
    // 2. 바운드 정보만 업데이트
    const newConfig = {
      ...currentConfig,
      overlayBounds: overlayWindow.getBounds()
    };
    
    // 3. 상태 및 파일 업데이트
    globalState.overlayBounds = newConfig.overlayBounds;
    await FileManager.saveConfig(newConfig);
  },

  async updateOverlayContent() {
    if (!overlayWindow) return;
  
    const state = store.getState().textProcess;
    const prevParagraphs = [];
    const nextParagraphs = [];
    const { before, after } = globalState.visibleRanges.overlay;
  
    // 이전 단락들 처리
    for (let i = 1; i <= before; i++) {
      const prev = TextProcessUtils.getParagraphByOffset(state, state.currentParagraph, -i);
      if (prev) {
        prevParagraphs.unshift({
          text: prev.text.toString(),
          pageNumber: prev.metadata?.pageNumber || null,
          metadata: {  // metadata 객체 추가
            index: state.currentParagraph - i
          }
        });
      }
    }
    
    // 다음 단락도 동일하게 수정
    for (let i = 1; i <= after; i++) {
      const next = TextProcessUtils.getParagraphByOffset(state, state.currentParagraph, i);
      if (next) {
        nextParagraphs.push({
          text: next.text.toString(),
          pageNumber: next.metadata?.pageNumber || null,
          index: state.currentParagraph + i // 인덱스 추가
        });
      }
    }
  
    const currentMetadata = state.paragraphsMetadata[state.currentParagraph];
    overlayWindow.webContents.send('paragraphs-updated', {
      previous: prevParagraphs,
      current: String(state.paragraphs[state.currentParagraph] || ''), // 객체 대신 문자열
      next: nextParagraphs,
      currentParagraph: state.currentParagraph,
      currentNumber: currentMetadata?.pageNumber || null,
      isDarkMode: globalState.isDarkMode,
      isPaused: globalState.isPaused
    });
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

    // 설정 관련 핸들러
    ipcMain.handle('load-settings', () => FileManager.loadConfig());
    ipcMain.handle('apply-settings', (_, settings) => this.handleApplySettings(settings));
    ipcMain.handle('clear-log-files', () => FileManager.clearLogs());

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
      updateGlobalState({ ...globalState, isDarkMode: isDark });
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
      const content = await fs.readFile(filePath, 'utf8');
      store.dispatch(textProcessActions.processParagraphs(content));
      const state = store.getState().textProcess;
      
      if (!state.paragraphs.length) {
        console.error('단락 처리 실패');
        return { success: false };
      }
      return filePath;
    }
    return null;
  },

  async handleProcessFileContent(event, fileContent, filePath) {
    if (!fileContent || !filePath) return { success: false };
  
    const fileStatus = await FileManager.checkExistingFile(filePath);
    
    // Redux store에서 처리
    store.dispatch(textProcessActions.processParagraphs(fileContent));
    const state = store.getState().textProcess;
  
    if (!state.paragraphs.length) return { success: false };
  
    const startPosition = fileStatus.isExisting ? fileStatus.lastPosition : 0;
    
    // 시작 위치도 Redux로 업데이트
    store.dispatch(textProcessActions.updateCurrentParagraph(startPosition));
    const currentMetadata = state.paragraphsMetadata[startPosition];
  
    await updateGlobalState({
      ...store.getState().textProcess, // 업데이트된 상태 가져오기
      currentFilePath: filePath,
      currentParagraph: startPosition,
      currentNumber: currentMetadata?.pageNumber,
      programStatus: ProgramStatus.PROCESS,
      isOverlayVisible: true,
      isPaused: false
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

  async handleApplySettings(settings) {
    try {
      if (!settings) throw new Error('설정값이 없습니다');
    
      if (overlayWindow) {
        // 창 전체 투명도
        if (typeof settings.windowOpacity === 'number') {
          overlayWindow.setOpacity(settings.windowOpacity);
          globalState.windowOpacity = settings.windowOpacity;
        }
        
        // 배경 투명도
        if (typeof settings.contentOpacity === 'number') {
          overlayWindow.webContents.send('update-content-opacity', settings.contentOpacity);
          globalState.contentOpacity = settings.contentOpacity;
        }

        // 기존 설정들...
        if (typeof settings.overlayFixed === 'boolean') {
          overlayWindow.setIgnoreMouseEvents(settings.overlayFixed);
          globalState.overlayFixed = settings.overlayFixed;
        }
        
        if (typeof settings.loadLastOverlayBounds === 'boolean') {
          globalState.loadLastOverlayBounds = settings.loadLastOverlayBounds;
        }
      }
      
      // 설정 저장
      const currentConfig = ConfigManager.extractConfig(globalState);
      await FileManager.saveConfig(currentConfig);
      
      return true;
    } catch (error) {
      console.error('설정 적용 중 오류:', error);
      return false;
    }
  },

  // 네비게이션 관련 메서드
  handleMove(direction) {
    const state = store.getState().textProcess;
    const isNext = direction === 'next';
    const canMove = isNext ?
      state.currentParagraph < state.paragraphs.length - 1 :
      state.currentParagraph > 0;
  
    if (canMove) {
      const newPosition = isNext ? 
        state.currentParagraph + 1 : 
        state.currentParagraph - 1;
  
      mainWindow?.webContents.send('notify-clipboard-change');
      this.handleResume();
  
      store.dispatch(textProcessActions.updateCurrentParagraph(newPosition));
      
      updateGlobalState({
        ...store.getState().textProcess,
        timestamp: Date.now()
      }, 'move');
    }
  },

  handleMoveToPosition(position) {
    if (position >= 0 && position < store.getState().textProcess.paragraphs.length) {
      store.dispatch(textProcessActions.updateCurrentParagraph(position));
      mainWindow?.webContents.send('notify-clipboard-change');
      
      updateGlobalState({
        ...store.getState().textProcess,
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
      if (savedConfig) {
        // 오버레이 윈도우 크기 / 위치
        if (savedConfig.overlayBounds) {
          globalState.overlayBounds = savedConfig.overlayBounds;
        }
        
        // 오버레이 투명도
        if (savedConfig.overlayOpacity) {
          globalState.overlayOpacity = savedConfig.overlayOpacity;
        }

        // 오버레이 고정 여부
        if (typeof savedConfig.overlayFixed !== 'undefined') {
          globalState.overlayFixed = savedConfig.overlayFixed;
        }

        // 앱 강조색
        if (savedConfig.accentColor) {
          globalState.accentColor = savedConfig.accentColor;
        }
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

      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.destroy();
        overlayWindow = null;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
        mainWindow = null;
      }
    } catch (error) {
      console.error('종료 처리 중 오류 발생:', error);
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