// main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, clipboard, screen } = require('electron');
const path = require('path');
const store = require('./store/store');
const { TextProcessUtils } = require('./store/utils/TextProcessUtils');
const { textProcessActions } = require('./store/slices/textProcessSlice');
const { configActions } = require('./store/slices/configSlice');
const { ConfigManager } = require('./store/utils/ConfigManager');
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
const DEFAULT_PROCESS_MODE = 'paragraph';

// ContentManager 수정
const ContentManager = {
  debounceTime: DEBOUNCE_TIME,
  
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
  
      const state = store.getState().textProcess;
  
      if (!skipLog && state.currentFilePath) {
        await FileManager.saveCurrentPositionToLog();
        console.log('로그 저장됨');
      }
    } catch (error) {
      console.error('복사/로깅 중 오류:', error, error.stack);
    }
  }, DEBOUNCE_TIME)
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
  processMode: DEFAULT_PROCESS_MODE
};

// 상태 업데이트 함수
const updateState = async (newState) => {
  // Redux store 업데이트
  if (newState.content) {
    store.dispatch(textProcessActions.updateContent(newState.content));
  }
  if (newState.currentParagraph !== undefined) {
    store.dispatch(textProcessActions.updateCurrentParagraph(newState.currentParagraph));
  }

  // 전역 상태 업데이트
  const state = store.getState().textProcess;
  globalState = newState.programStatus === ProgramStatus.READY
    ? {
        programStatus: ProgramStatus.READY,
        currentParagraph: 0,
        currentNumber: null,
        isPaused: false,
        isOverlayVisible: false,
        currentFilePath: null,
        timestamp: Date.now(),
        processMode: DEFAULT_PROCESS_MODE
      }
    : { ...globalState, ...newState };

  // 창 업데이트
  await WindowManager.updateWindowContent(mainWindow, 'state-update');

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (globalState.programStatus === ProgramStatus.PROCESS) {
      overlayWindow.showInactive();
      await WindowManager.updateWindowContent(overlayWindow, 'content-update');
    } else {
      overlayWindow.hide();
    }
  }

  // 상태 변경 통보
  ipcMain.emit('program-status-update', 'event', {
    isPaused: globalState.isPaused,
    programStatus: globalState.programStatus
  });
};

// 상태 관리 시스템
const StatusManager = {
  async transition(newStatus) {
    if (!this.validateTransition(globalState.programStatus, newStatus)) {
      throw new Error(`Invalid transition: ${globalState.programStatus} -> ${newStatus}`);
    }
    await updateState({ programStatus: newStatus, timestamp: Date.now() });
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
      const state = store.getState().config;
      let newConfig = { ...state };
  
      // 테마 설정 처리
      if (config.theme) {
        newConfig.theme = {
          isDarkMode: config.theme.isDarkMode ?? state.theme.isDarkMode,
          mode: config.theme.isDarkMode ? 'dark' : 'light',
          accentColor: config.theme.accentColor ?? state.theme.accentColor
        };
      }
  
      // 오버레이 설정 처리 - Settings.js와 호환되도록 수정
      if (config.windowOpacity !== undefined) {
        newConfig.overlay.windowOpacity = config.windowOpacity;
      }
      if (config.contentOpacity !== undefined) {
        newConfig.overlay.contentOpacity = config.contentOpacity;
      }
      if (config.overlayFixed !== undefined) {
        newConfig.overlay.overlayFixed = config.overlayFixed;
      }
      if (config.loadLastOverlayBounds !== undefined) {
        newConfig.overlay.loadLastOverlayBounds = config.loadLastOverlayBounds;
      }
      if (config.overlayBounds) {
        newConfig.overlay.bounds = config.overlayBounds;
      }
  
      // Redux store 업데이트
      store.dispatch(configActions.loadConfig(newConfig));
      
      // 파일 저장
      await fs.writeFile(FILE_PATHS.config, JSON.stringify(newConfig, null, 2));
    } catch (error) {
      console.error('설정 저장 실패:', error);
    }
  },

  async loadConfig() {
    try {
      try {
        await fs.access(FILE_PATHS.config);
      } catch {
        const defaultConfig = store.getState().config;
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }

      const data = await fs.readFile(FILE_PATHS.config, 'utf8');
      if (!data.trim()) {
        const defaultConfig = store.getState().config;
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }

      return JSON.parse(data);
    } catch (error) {
      console.error('설정 로드 실패:', error);
      return store.getState().config;
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

  async clearLogs(filePath = null) {  // filePath 파라미터 추가
    try {
      if (filePath) {
        // 특정 파일 기록만 삭제
        const logData = await this.loadLog();
        if (logData[filePath]) {
          delete logData[filePath];
          await this.saveLog(logData);
          console.log('파일 기록이 삭제되었습니다:', filePath);
        }
      } else {
        // 전체 로그 초기화
        await this.saveLog({});
        console.log('로그 파일이 정리되었습니다.');
      }
      return { success: true };
    } catch (error) {
      console.error('로그 정리 실패:', error);
      return { success: false };
    }
  },

  getFileHash(content) {
    const normalizedContent = content.replace(/\s+/g, ' ').trim();
    return crypto.createHash('sha256').update(normalizedContent).digest('hex');
  },

  async saveCurrentPositionToLog() {
    try {
      const state = store.getState().textProcess;  // 여기로 이동
      
      if (!state.currentFilePath) {
        console.warn('currentFilePath가 없어 로그 저장 취소');
        return;
      }

      const originalContent = await fs.readFile(state.currentFilePath, 'utf8');
      const fileHash = this.getFileHash(originalContent);
      const log = await this.loadLog();
  
      const currentMeta = state.paragraphsMetadata[state.currentParagraph];
      if (!currentMeta) {
        console.warn('현재 위치의 메타데이터가 없음:', state.currentParagraph);
        return;
      }
      
      log[state.currentFilePath] = {
        fileName: path.basename(state.currentFilePath),
        fileHash: fileHash,
        lastPosition: {
          currentParagraph: state.currentParagraph,
          pageNumber: currentMeta?.pageNumber || null,
          processMode: state.processMode,
          metadata: {  // 위치 복원용 메타데이터
            startPos: currentMeta?.startPos,
            endPos: currentMeta?.endPos
          }
        },
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
      const content = await fs.readFile(filePath, 'utf8');
      const currentHash = this.getFileHash(content);
      
      // 1. 같은 경로 확인
      let fileLog = logData[filePath];
      let oldPath = null;
      
      // 2. 해시값으로 다른 파일 검색
      if (!fileLog) {
        const existingFile = Object.entries(logData).find(([path, log]) => log.fileHash === currentHash);
        if (existingFile) {
          [oldPath, fileLog] = existingFile;
          // 새 경로로 로그 이전
          logData[filePath] = {
            ...fileLog,
            fileName: path.basename(filePath)  // 새 파일명으로 업데이트
          };
          // 기존 로그 삭제
          delete logData[oldPath];
          await this.saveLog(logData);
        }
      }
  
      return {
        isExisting: !!fileLog,
        lastPosition: fileLog?.lastPosition?.currentParagraph || 0,
        processMode: fileLog?.lastPosition?.processMode || null,
        metadata: fileLog?.lastPosition?.metadata || null
      };
    } catch (error) {
      console.error('파일 확인 실패:', error);
      return { 
        isExisting: false, 
        lastPosition: 0,
        processMode: null,
        metadata: null
      };
    }
  },

  async getFileHistory() {
    try {
      const logData = await this.loadLog();
      const state = store.getState().textProcess;
      
      let currentFile = null;
      if (globalState.currentFilePath) {
          const originalContent = await fs.readFile(globalState.currentFilePath, 'utf8');
          currentFile = {
              path: globalState.currentFilePath,
              hash: this.getFileHash(originalContent)
          };
      }
  
      return {
        logData,
        currentFile
      };
    } catch (error) {
      console.error('파일 기록 로드 실패:', error);
      return [];
    }
  },

  async openFile(filePath, content = null) {
    try {
      const fileContent = content || await fs.readFile(filePath, 'utf8');
      if (!fileContent) {
        console.error('파일 내용 없음:', filePath);
        return { success: false };
      }
  
      // 1. 설정의 processMode 먼저 확인
      const config = store.getState().config;
      let processMode = config.processMode;
  
      // 2. 파일 상태 확인 (이전 로그)
      const fileStatus = await this.checkExistingFile(filePath);
      
      // 3. 로그에 저장된 모드가 있다면 우선 적용
      if (fileStatus.processMode) {
        processMode = fileStatus.processMode;

        store.dispatch(configActions.updateProcessMode(processMode));
        await this.saveConfig({ processMode: processMode });
      }
      
      // 4. 모드가 없을 때만 자동 감지
      if (!processMode) {
        const shouldSuggestLine = TextProcessUtils.detectLineMode(fileContent);
        if (shouldSuggestLine) {
          const choice = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['확인', '취소'],
            defaultId: 0,
            title: '모드 추천',
            message: '문장 길이가 길어 보입니다. 줄 단위로 표시할까요?'
          });
          processMode = choice.response === 0 ? 'line' : 'paragraph';
        } else {
          processMode = DEFAULT_PROCESS_MODE;
        }
      }
  
      // 나머지 로직은 그대로 유지
      const result = TextProcessUtils.processParagraphs(fileContent, processMode);
  
      // 위치 복원 로직
      let restoredPosition = 0;
      if (fileStatus.isExisting && fileStatus.metadata) {
        restoredPosition = result.paragraphsMetadata.findIndex(meta => 
          meta?.startPos === fileStatus.metadata.startPos && 
          meta?.endPos === fileStatus.metadata.endPos
        );
        if (restoredPosition === -1) {
          restoredPosition = Math.min(
            fileStatus.lastPosition, 
            result.paragraphsToDisplay.length - 1
          );
        }
      }
  
      // Redux store 업데이트
      store.dispatch(textProcessActions.updateContent({
        paragraphs: result.paragraphsToDisplay,
        paragraphsMetadata: result.paragraphsMetadata,
        currentNumber: result.currentNumber,
        processMode: processMode,
        currentFilePath: filePath
      }));
      store.dispatch(textProcessActions.updateCurrentParagraph(restoredPosition));
  
      // 전역 상태 업데이트
      await updateState({
        paragraphs: result.paragraphsToDisplay,
        currentFilePath: filePath,
        currentParagraph: restoredPosition,
        programStatus: ProgramStatus.PROCESS,
        isOverlayVisible: true,
        isPaused: false,
        processMode: processMode,
        currentNumber: result.paragraphsMetadata[restoredPosition]?.pageNumber || null
      });
  
      // 현재 단락 즉시 복사 및 로깅
      const currentContent = result.paragraphsToDisplay[restoredPosition];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent, false);
      }
  
      return { success: true };
    } catch (error) {
      console.error('파일 열기 실패:', error);
      return { success: false };
    }
  },

  async switchMode(newMode) {
    try {
      const filePath = globalState.currentFilePath;
      if (!filePath) return;
  
      // 1. 파일 재처리를 먼저 수행
      const content = await fs.readFile(filePath, 'utf8');
      const result = TextProcessUtils.processParagraphs(content, newMode);
      
      // 2. 이전 상태 저장
      const previousState = store.getState().textProcess;
      const oldContent = previousState.paragraphs;
      const oldMetadata = previousState.paragraphsMetadata;
      const currentParagraph = previousState.currentParagraph;

      // 3. 위치 매핑
      const newPosition = TextProcessUtils.mapPositionBetweenModes(
        oldContent,
        result.paragraphsToDisplay,
        oldMetadata,
        result.paragraphsMetadata,
        currentParagraph,
        newMode
      );
      
      // 4. Redux store 업데이트 순서 변경
      store.dispatch(textProcessActions.updateContent({
        paragraphs: result.paragraphsToDisplay,
        paragraphsMetadata: result.paragraphsMetadata,
        currentNumber: result.paragraphsMetadata[newPosition]?.pageNumber || null,
        processMode: newMode,
        currentFilePath: filePath
      }));

      // 5. 설정 업데이트는 그 다음에
      store.dispatch(configActions.updateProcessMode(newMode));
      await FileManager.saveConfig({ processMode: newMode });
      
      // 6. 현재 단락 위치 업데이트
      store.dispatch(textProcessActions.updateCurrentParagraph(newPosition));

      // 7. 전역 상태 업데이트
      await updateState({
        paragraphs: result.paragraphsToDisplay,
        currentFilePath: filePath,
        currentParagraph: newPosition,
        programStatus: ProgramStatus.PROCESS,
        isOverlayVisible: true,
        isPaused: false,
        processMode: newMode,
        timestamp: Date.now()
      });

      ContentManager.copyAndLogDebouncer(result.paragraphsToDisplay[newPosition]);
  
      if (globalState.isOverlayVisible) {
        await WindowManager.updateWindowContent();
      }
  
      return { success: true };
    } catch (error) {
      console.error('모드 전환 실패:', error);
      return { success: false };
    }
  },
};

const ThemeManager = {
  currentTheme: {
    isDarkMode: nativeTheme.shouldUseDarkColors,
    mode: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    accentColor: '#007bff'
  },

  initialize() {
    // 설정에서 테마 정보 가져오기
    const config = store.getState().config;
    this.currentTheme = {
      isDarkMode: config.theme.isDarkMode,
      mode: config.theme.isDarkMode ? 'dark' : 'light',
      accentColor: config.theme.accentColor
    };
    
    // 변경사항 구독
    store.subscribe(() => {
      const state = store.getState();
      this.currentTheme = state.config.theme;
      this.broadcastTheme(this.currentTheme);
    });
  },

  getCurrentTheme() {
    return this.currentTheme;
  },

  broadcastTheme(theme) {
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('theme-update', theme);
      }
    });
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

    mainWindow.loadURL(startUrl);
    this.setupMainWindowEvents();
  },

  createOverlayWindow() {
    const config = store.getState().config;
    const primaryDisplay = screen.getPrimaryDisplay();
    
    // 1. bounds 설정
    let windowBounds;
    if (config.overlay.loadLastOverlayBounds && config.overlay.bounds.x !== null) {
      windowBounds = config.overlay.bounds;
    } else {
      windowBounds = { // 값이 없으면 사용할 기본값
        width: 320,
        height: 240,
        x: Math.floor(primaryDisplay.workArea.width * 0.02),
        y: Math.floor(primaryDisplay.workArea.height * 0.05)
      };
      store.dispatch(configActions.setOverlayBounds(windowBounds));       // 새 위치 저장
    }
  
    const windowOptions = {
      ...windowBounds,
      minHeight: 240,
      minWidth: 320,
      maxHeight: 600,
      maxWidth: 500,
      opacity: config.overlay.windowOpacity,
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
    };
  
    overlayWindow = new BrowserWindow(windowOptions);
    
    // 2. 오버레이 설정 적용
    overlayWindow.setIgnoreMouseEvents(config.overlay.overlayFixed);

    overlayWindow.webContents.on('did-finish-load', () => {
      overlayWindow.webContents.send('update-content-opacity', config.overlay.contentOpacity);
    });
  
    const overlayUrl = isDev
      ? 'http://localhost:3000/#/overlay'
      : url.format({
          pathname: path.join(__dirname, '../build/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/overlay'
        });
  
    overlayWindow.loadURL(overlayUrl);
    this.setupOverlayWindowEvents();
  },

  setupMainWindowEvents() {
    mainWindow.once('ready-to-show', () => {
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
    const bounds = overlayWindow.getBounds();
    
    // overlay.bounds로 저장
    const config = {
      overlay: {
        bounds: bounds
      }
    };
    
    store.dispatch(configActions.setOverlayBounds(bounds));
    await FileManager.saveConfig(config);
  },

  async updateWindowContent(window, eventName) {
    if (!window || window.isDestroyed()) return;
  
    const state = store.getState().textProcess;
    const config = store.getState().config;
  
    if (!state.paragraphs || !state.paragraphsMetadata) {
      console.warn('Invalid text process state');
      return;
    }
  
    const currentParagraph = state.currentParagraph;
    if (currentParagraph < 0 || currentParagraph >= state.paragraphs.length) {
      console.warn('Invalid current paragraph Paragraph');
      return;
    }
  
    if (window === mainWindow) {
      // 메인 창에는 항상 "페이지" 문구를 포함하여 표시
      const pageInfo = state.paragraphsMetadata[currentParagraph]?.pageInfo;
      const display = pageInfo ? (
        pageInfo.end !== pageInfo.start ? 
        `${pageInfo.start}-${pageInfo.end} 페이지` : 
        `${pageInfo.start} 페이지`
      ) : '';
    
      window.webContents.send('state-update', {
        ...globalState,
        paragraphs: state.paragraphs,
        currentParagraph: state.currentParagraph,
        paragraphsMetadata: state.paragraphsMetadata,
        currentNumber: { ...pageInfo, display }, // display 속성 덮어쓰기
        theme: ThemeManager.currentTheme
      });
    } else if (window === overlayWindow) {
      const startIdx = Math.max(0, currentParagraph - 5);
      const endIdx = Math.min(state.paragraphs.length, currentParagraph + 6);
        // 오버레이에는 합페일 때 숫자만 표시
      const pageInfo = state.paragraphsMetadata[currentParagraph]?.pageInfo;
      const display = pageInfo ? (
        pageInfo.end !== pageInfo.start ? 
        `${pageInfo.start}-${pageInfo.end}` : 
        `${pageInfo.start} 페이지`
      ) : '';
    
      window.webContents.send('paragraphs-updated', {
        previous: state.paragraphs.slice(startIdx, currentParagraph).map((text, idx) => ({
          text: String(text),
          paragraph: startIdx + idx,
          metadata: state.paragraphsMetadata[startIdx + idx]
        })),
        current: state.paragraphs[currentParagraph]?.toString() || '',
        next: state.paragraphs.slice(currentParagraph + 1, endIdx).map((text, idx) => ({
          text: String(text),
          paragraph: currentParagraph + 1 + idx,
          metadata: state.paragraphsMetadata[currentParagraph + 1 + idx]
        })),
        currentParagraph: currentParagraph,
        // currentNumber를 전체 pageInfo 객체로 전달
        currentNumber: { ...pageInfo, display } || null,
        isPaused: globalState.isPaused,
        isDarkMode: ThemeManager.currentTheme.isDarkMode,
        processMode: state.processMode,
        totalParagraphs: state.paragraphs.length
      });
    }
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
    ipcMain.on('update-state', (event, newState) => updateState(newState));
  
    // 파일 관련 핸들러 - 통합
    ipcMain.handle('get-file-history', () => FileManager.getFileHistory());
    ipcMain.handle('open-file', async (_, options = {}) => {  // options 기본값 추가
      try {
        if (!options.filePath) {  // filePath가 없으면 다이얼로그 오픈
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Text Files', extensions: ['txt'] }]
          });
          
          if (result.canceled || !result.filePaths[0]) return null;
          return await FileManager.openFile(result.filePaths[0]);
        }
        
        return await FileManager.openFile(options.filePath, options.content);
      } catch (error) {
        console.error('파일 열기 실패:', error);
        return { success: false };
      }
    });

    ipcMain.handle('read-file', async (event, filePath) => fs.readFile(filePath, 'utf8'));

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
    ipcMain.on('move-to-next-page', () => IPCManager.handleMove('next', 'page'));
    ipcMain.on('move-to-prev-page', () => IPCManager.handleMove('prev', 'page'));
    ipcMain.on('move-to-position', (event, position) => this.handleMoveToPosition(position));

    // 모드 전환 핸들러
    ipcMain.on('switch-mode', async (event, newMode) => {
      await FileManager.switchMode(newMode);
      event.reply('mode-switched', newMode);
    });

    // 뷰모드 전환 핸들러
    ipcMain.on('update-view-mode', async (event, newViewMode) => {
      store.dispatch(configActions.updateViewMode(newViewMode));
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('view-mode-update', newViewMode);
        }
      });
    });

    // 윈도우 관련 핸들러
    ipcMain.on('toggle-overlay', () => this.handleToggleOverlay());
    ipcMain.on('toggle-pause', () => this.handlePause());
    ipcMain.on('toggle-resume', () => this.handleResume());

    // 설정 관련 핸들러
    ipcMain.handle('load-settings', async () => {
      try {
        const config = await FileManager.loadConfig();
        
        // Settings.js가 기대하는 평면적인 구조로 변환
        return {
          windowOpacity: config.overlay.windowOpacity,
          contentOpacity: config.overlay.contentOpacity,
          overlayFixed: config.overlay.overlayFixed,
          loadLastOverlayBounds: config.overlay.loadLastOverlayBounds,
          accentColor: config.theme.accentColor,
          processMode: config.processMode,
          viewMode: config.viewMode
        };
      } catch (error) {
        console.error('설정 로드 실패:', error);
        return null;
      }
    });
    
    ipcMain.handle('apply-settings', (_, settings) => this.handleApplySettings(settings));
    ipcMain.handle('clear-log-files', (_, filePath = null) => FileManager.clearLogs(filePath));

    // 테마 관련 핸들러
    ipcMain.handle('get-current-theme', () => {
      return ThemeManager.getCurrentTheme();
    });

    // 디버그 콘솔 핸들러
    ipcMain.on('show-debug-console', () => this.handleShowDebugConsole());

    handlersInitialized = true;
  },

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
      
      const state = store.getState().config;
      const newConfig = {
        ...state,
        overlay: {
          ...state.overlay,
          windowOpacity: settings.windowOpacity ?? state.overlay.windowOpacity,
          contentOpacity: settings.contentOpacity ?? state.overlay.contentOpacity,
          overlayFixed: settings.overlayFixed ?? state.overlay.overlayFixed,
          loadLastOverlayBounds: settings.loadLastOverlayBounds ?? state.overlay.loadLastOverlayBounds
        },
        processMode: settings.processMode ?? state.processMode,
        viewMode: settings.viewMode ?? state.viewMode
      };
  
      store.dispatch(configActions.loadConfig(newConfig));
      
      if (overlayWindow) {
        overlayWindow.setOpacity(newConfig.overlay.windowOpacity);
        overlayWindow.setIgnoreMouseEvents(newConfig.overlay.overlayFixed);
        overlayWindow.webContents.send('update-content-opacity', newConfig.overlay.contentOpacity);
      }
      
      await FileManager.saveConfig(newConfig);
      return true;
    } catch (error) {
      console.error('설정 적용 중 오류:', error);
      return false;
    }
  },

  // 네비게이션 관련 메서드
  handleMove(direction, moveType = 'paragraph') { // moveType 파라미터 추가
    const state = store.getState().textProcess;
    const isNext = direction === 'next';
    let newPosition;
  
    if (moveType === 'page') {  // 페이지 신호에서는 페이지 단위로 이동
      const currentPage = state.paragraphsMetadata[state.currentParagraph]?.pageNumber;
      
      if (currentPage !== null) {
        const targetPage = isNext ? currentPage + 1 : currentPage - 1;
        
        // 다음/이전 페이지 검색 시 내용이 있는 페이지를 찾을 때까지 계속 검색
        let searchPage = targetPage;
        let found = false;
        
        while (!found) {
          newPosition = state.paragraphsMetadata.findIndex(meta => {
            // 페이지 번호가 있고 내용이 있는 단락을 찾음
            return meta?.pageNumber === searchPage && 
                   state.paragraphs[state.paragraphsMetadata.indexOf(meta)]?.trim().length > 0;
          });
          
          if (newPosition !== -1) {
            found = true;
          } else {
            // 못 찾으면 다음/이전 페이지로 계속 검색
            searchPage = isNext ? searchPage + 1 : searchPage - 1;
            
            // 검색 범위를 벗어나면 중단
            const lastPage = Math.max(...state.paragraphsMetadata
              .filter(meta => meta?.pageNumber !== null)
              .map(meta => meta.pageNumber));
            const firstPage = Math.min(...state.paragraphsMetadata
              .filter(meta => meta?.pageNumber !== null)
              .map(meta => meta.pageNumber));
              
            if (searchPage > lastPage || searchPage < firstPage) {
              newPosition = isNext ? 
                state.paragraphs.length - 1 : // 마지막 단락
                0; // 첫 단락
              break;
            }
          }
        }
      }
    } else {
      // 기존 단락 단위 이동
      newPosition = isNext ? 
        state.currentParagraph + 1 : 
        state.currentParagraph - 1;
    }
  
    const canMove = newPosition >= 0 && newPosition < state.paragraphs.length;
    
    if (canMove) {
      this.handleResume();
      store.dispatch(textProcessActions.updateCurrentParagraph(newPosition));
      
      const currentContent = state.paragraphs[newPosition];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent);
      }
  
      updateState({
        ...store.getState().textProcess,
        isPaused: false,
        timestamp: Date.now()
      }, 'move');
    }
  },

  handleMoveToPosition(position) {
    if (position >= 0 && position < store.getState().textProcess.paragraphs.length) {
      // 1. 현재 단락으로 이동
      store.dispatch(textProcessActions.updateCurrentParagraph(position));
      
      // 2. 일시정지 해제
      globalState.isPaused = false;
      
      // 3. 상태 업데이트 (isPaused 포함)
      updateState({
        ...store.getState().textProcess,
        isPaused: false,
        timestamp: Date.now()
      });
  
      // 4. 현재 단락 복사 및 로깅
      const state = store.getState().textProcess;
      const currentContent = state.paragraphs[position];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent);
      }
    }
  },

  // 윈도우 관련 메서드
  async handleToggleOverlay() {
    if (!overlayWindow) return;
    
    const newVisibility = !globalState.isOverlayVisible;
    
    // 1. 먼저 상태 업데이트
    await updateState({ isOverlayVisible: newVisibility });
    
    // 2. 창 상태 업데이트
    if (newVisibility) {
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.show();
        mainWindow?.focus();
      }
    } else {
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
    }
  },

  handlePause() {
    if (!globalState.isPaused) {
      globalState.isPaused = true;
      updateState({ isPaused: true });
    }
  },
  
  handleResume() {
      updateState({ isPaused: false });
      const state = store.getState().textProcess;
      const currentContent = state.paragraphs[state.currentParagraph];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent);
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

      // 1. 설정 파일 로드 및 적용
      const savedConfig = await FileManager.loadConfig();
      await ConfigManager.loadAndValidateConfig(savedConfig);

      // 2. 테마 관리자 초기화
      ThemeManager.initialize();

      // 3. IPC 핸들러 설정
      IPCManager.setupHandlers();

      // 4. 윈도우 생성
      WindowManager.createMainWindow();
      WindowManager.createOverlayWindow();

      // 5. 시스템 리스너 초기화
      systemListener = new SystemListener(mainWindow);
      await systemListener.initialize();

      await StatusManager.transition(ProgramStatus.READY);
      console.log('메인 프로세스 초기화 성공');
    } catch (error) {
      console.error('메인 프로세스 초기화 실패:', error);
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