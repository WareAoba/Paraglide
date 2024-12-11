// main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, clipboard, screen } = require('electron');
const path = require('path');
const store = require('./store/store');
const { TextProcessUtils } = require('./store/utils/TextProcessUtils');
const { textProcessActions } = require('./store/slices/textProcessSlice');
const { configActions, THEME } = require('./store/slices/configSlice');
const { ConfigManager } = require('./store/utils/ConfigManager');
const { logActions } = require('./store/slices/logSlice');
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
        console.error('[Main] SystemListener 초기화 실패');
        return;
      }
  
      mainWindow?.webContents.send('notify-clipboard-change');
      systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
      process.stdout.write(`[Main] 복사 성공: ${content.substring(0, 20)}...`);
  
      const state = store.getState().textProcess;
  
      if (!skipLog && state.currentFilePath) {
        await FileManager.saveCurrentPositionToLog();
        console.log('[Main] 로그 저장 성공');
      }
    } catch (error) {
      console.error('[Main] 복사/로깅 중 오류:', error, error.stack);
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
  titles: {
    light: isDev
      ? path.join(appPath, 'public', 'TitleLight.png')
      : path.join(process.resourcesPath, './app.asar.unpacked/public', 'TitleLight.png'),
    dark: isDev
      ? path.join(appPath, 'public', 'TitleDark.png')
      : path.join(process.resourcesPath, './app.asar.unpacked/public', 'TitleDark.png')
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
  paragraphsMetadata: [],
  isPaused: true,
  timestamp: Date.now(),
  isOverlayVisible: false,
  processMode: DEFAULT_PROCESS_MODE
};

// 상태 업데이트 함수
const updateState = async (newState) => {

  const state = store.getState().textProcess;
  const config = store.getState().config;
  
  // Redux store 업데이트
  if (newState.programStatus !== undefined) {
    store.dispatch(textProcessActions.updateContent({
      ...state,
      programStatus: newState.programStatus
    }));
  }
  if (newState.content) {
    store.dispatch(textProcessActions.updateContent(newState.content));
  }
  if (newState.currentParagraph !== undefined) {
    store.dispatch(textProcessActions.updateCurrentParagraph(newState.currentParagraph));
  }

  if (newState.programStatus === ProgramStatus.READY) {
    // READY 상태일 때는 무조건 false
    globalState = {
      programStatus: ProgramStatus.READY,
      currentParagraph: 0,
      currentNumber: null,
      isPaused: false,
      isOverlayVisible: false,
      currentFilePath: null,
      timestamp: Date.now(),
      processMode: DEFAULT_PROCESS_MODE
    };
    mainWindow.setTitle('Paraglide');
  } else if (newState.programStatus === ProgramStatus.PROCESS && globalState.programStatus !== ProgramStatus.PROCESS) {
    // PROCESS 상태로 처음 전환될 때 (파일 열기)
    globalState = {
      ...globalState,
      ...newState,
      isOverlayVisible: config.overlay.isVisible // config의 설정값 사용
    };
  } else {
    // 그 외의 상태 업데이트
    const overlayVisibility = newState.isOverlayVisible !== undefined ? 
      newState.isOverlayVisible : 
      globalState.isOverlayVisible;
    
    globalState = {
      ...globalState,
      ...newState,
      isOverlayVisible: overlayVisibility
    };
  }

  // 창 업데이트
  await WindowManager.updateWindowContent(mainWindow, 'state-update');

  // 오버레이 창 처리
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const shouldShow = globalState.programStatus === ProgramStatus.PROCESS && 
                      globalState.isOverlayVisible;
    
    if (shouldShow) {
      overlayWindow.showInactive();
      await WindowManager.updateWindowContent(overlayWindow, 'content-update');
    } else {
      overlayWindow.hide();
    }
  }

  console.log('[Main] 현재 프로그램 상태:', store.getState().textProcess.programStatus);

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

    if (newStatus === ProgramStatus.READY && mainWindow) {
      mainWindow.setTitle('Paraglide');
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
          mode: config.theme.mode ?? state.theme.mode,
          accentColor: config.theme.accentColor ?? state.theme.accentColor
        };
      }
  
      // 오버레이 설정 처리
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
      console.error('[Main] 설정 저장 실패:', error);
    }
  },

  async loadConfig() {
    try {
      // 1. 파일 존재 확인
      try {
        await fs.access(FILE_PATHS.config);
      } catch {
        console.log('[Main] 새 설정 파일 생성');
        const defaultConfig = store.getState().config;  // store에서 직접 가져오기
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
  
      // 2. 파일 읽기
      const data = await fs.readFile(FILE_PATHS.config, 'utf8');
      
      // 3. 파일 내용 검증
      if (!data.trim()) {
        console.log('[Main] 잘못된 설정 파일, 기본값으로 초기화');
        const defaultConfig = store.getState().config;  // store에서 직접 가져오기
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
  
      try {
        const parsedConfig = JSON.parse(data);
        
        // 4. 구조 검증
        if (!ConfigManager.validateConfigStructure(parsedConfig)) {
          console.log('[Main] 올바르지 않은 설정 구조, 기본값으로 초기화]');
          const defaultConfig = store.getState().config;  // store에서 직접 가져오기
          await this.saveConfig(defaultConfig);
          return defaultConfig;
        }
  
        return parsedConfig;
      } catch (parseError) {
        console.error('[Main] 설정 파일 파싱 실패:', parseError);
        const defaultConfig = store.getState().config;  // store에서 직접 가져오기
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
    } catch (error) {
      console.error('[Main] 설정 로드 실패:', error);
      return store.getState().config;  // store에서 직접 가져오기
    }
  },

  async loadLog() {
    try {
      // 1. 로그 파일 존재 확인
      try {
        await fs.access(FILE_PATHS.log);
      } catch {
        // 로그 파일이 없으면 빈 객체로 초기화
        await fs.writeFile(FILE_PATHS.log, '{}', 'utf8');
        return {};
      }

      // 2. 로그 파일 읽기
      const data = await fs.readFile(FILE_PATHS.log, 'utf8');

      // 3. 파일 내용 검증
      if (!data.trim()) {
        // 빈 파일이면 초기화
        await fs.writeFile(FILE_PATHS.log, '{}', 'utf8');
        return {};
      }

      try {
        // 4. JSON 파싱
        const parsedLog = JSON.parse(data);
        return parsedLog;
      } catch (parseError) {
        console.error('[Main] 로그 파일 파싱 실패:', parseError);
        // 파싱 실패시 초기화
        await fs.writeFile(FILE_PATHS.log, '{}', 'utf8');
        return {};
      }
    } catch (error) {
      console.error('[Main] 로그 파일 로드 실패:', error);
      return {};
    }
  },

  async saveLog(logData) {
    try {
      await fs.writeFile(FILE_PATHS.log, JSON.stringify(logData, null, 2), 'utf8');
    } catch (error) {
      console.error('[Main] 로그 저장 실패:', error);
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
          console.log('[Main] 파일 기록 삭제 성공:', filePath);
        }
      } else {
        // 전체 로그 초기화
        await this.saveLog({});
        console.log('[Main] 로그 파일 정리 성공');
      }
      return { success: true };
    } catch (error) {
      console.error('[Main] 로그 정리 실패:', error);
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
        console.warn('[Main] 로그 저장 취소');
        return;
      }

      const originalContent = await fs.readFile(state.currentFilePath, 'utf8');
      const fileHash = this.getFileHash(originalContent);
      const log = await this.loadLog();
  
      const currentMeta = state.paragraphsMetadata[state.currentParagraph];
      if (!currentMeta) {
        console.warn('[Main] 현재 위치의 메타데이터가 없음:', state.currentParagraph);
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
      console.error('[Main] 현재 위치 저장 실패:', error);
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
      console.error('[Main] 파일 확인 실패:', error);
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
      console.error('[Main] 파일 기록 로드 실패:', error);
      return [];
    }
  },

  async openFile(filePath, content = null) {
    try {
      // 파일 확장자 검사
      const fileExtension = path.extname(filePath).toLowerCase();
      if (fileExtension !== '.txt') {
        dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: ['확인'],
          defaultId: 1,
          title: '파일 형식 오류',
          message: '지원하지 않는 파일 형식입니다.\n(.txt 파일만 지원됩니다)',
          cancelId: 1,
          noLink: true,
          normalizeAccessKeys: true,
        });
        return { success: false };
      }
      // content가 직접 제공되지 않은 경우 파일 존재 여부 확인
      if (!content) {
        try {
          await fs.access(filePath);
        } catch (error) {
          if (error.code === 'ENOENT') {
            // 파일이 존재하지 않는 경우
            dialog.showMessageBoxSync(mainWindow, {
              type: 'warning',
              buttons: ['확인'],
              defaultId: 1,
              title: '파일 열기 오류',
              message: '파일이 존재하지 않습니다.\n 기록을 삭제합니다.',
              cancelId: 1,
              noLink: true, // 버튼을 링크 스타일로 표시하지 않음
              normalizeAccessKeys: true, // 단축키 정규화
            });
  
            // 로그에서 해당 파일 기록 삭제
            await this.clearLogs(filePath);
            const updatedHistory = await this.getFileHistory();
            mainWindow?.webContents.send('state-update', {
              ...globalState,
              fileHistory: updatedHistory
            });
            
            return { success: false };
          }
        }
      }

      const fileContent = content || await fs.readFile(filePath, 'utf8');
      if (!fileContent) {
        console.error('[Main] 파일 내용 없음:', filePath);
        dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: ['확인'],
          defaultId: 1,
          title: '잘못된 파일',
          message: '파일 내용이 비어있습니다.',
          cancelId: 1,
          noLink: true, // 버튼을 링크 스타일로 표시하지 않음
          normalizeAccessKeys: true, // 단축키 정규화
        });
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
      try {
        // 1. 먼저 content 업데이트
        await store.dispatch(textProcessActions.updateContent({
          paragraphs: result.paragraphsToDisplay,
          paragraphsMetadata: result.paragraphsMetadata,
          currentNumber: result.paragraphsMetadata[restoredPosition]?.pageInfo, // 명시적으로 pageInfo 설정
          processMode: processMode,
          currentFilePath: filePath,
          programStatus: ProgramStatus.PROCESS
        }));
      
        // 2. 위치 업데이트
        await store.dispatch(textProcessActions.updateCurrentParagraph(restoredPosition));
      
        // 3. 상태 확인을 위한 지연 추가
        await new Promise(resolve => setTimeout(resolve, 0));

        // 4. 전역 업데이트
        await updateState({
          paragraphs: result.paragraphsToDisplay,
          currentFilePath: filePath,
          currentParagraph: restoredPosition,
          programStatus: ProgramStatus.PROCESS,
          isOverlayVisible: config.overlay.isVisible,
          isPaused: false,
          processMode: processMode,
          currentNumber: result.paragraphsMetadata[restoredPosition]?.pageInfo // pageInfo 추가
        });
        
        const formatFileName = (filePath, maxLength = 30) => {
          const fileName = path.basename(filePath);
          if (fileName.length > maxLength) {
            return fileName.slice(0, maxLength - 3) + '...';
          }
          return fileName;
        };

        // 사용할 때
        mainWindow.setTitle(`${formatFileName(filePath)} - Paraglide`);

        const currentContent = result.paragraphsToDisplay[restoredPosition];
        if (currentContent) {
          ContentManager.copyAndLogDebouncer(currentContent);
        }
      
        return { success: true };
      } catch (error) {
        console.error('[Main] 상태 업데이트 실패:', error);
        return { success: false };
      }

    } catch (error) {
      console.error('[Main] 파일 열기 실패:', error);
      return { success: false };
    }
  },

  async switchMode(newMode) {
    try {
      const filePath = globalState.currentFilePath;
      if (!filePath) {
        console.log('[Main] 모드 전환 실패, 파일을 불러오지 않음.');
        return { success: false };
      }
  
      const content = await fs.readFile(filePath, 'utf8');
      const previousState = store.getState().textProcess;
      const result = TextProcessUtils.processParagraphs(content, newMode);
      const newPosition = TextProcessUtils.mapPositionBetweenModes(
        previousState.currentParagraph,
        previousState.paragraphsMetadata,
        result.paragraphsMetadata,
        previousState.processMode,
        newMode
      );
  
      // 1. Redux 상태 먼저 업데이트
      store.dispatch(textProcessActions.updateContent({
        paragraphs: result.paragraphsToDisplay,
        paragraphsMetadata: result.paragraphsMetadata,
        processMode: newMode,
        currentFilePath: filePath
      }));
      store.dispatch(textProcessActions.updateCurrentParagraph(newPosition));
      store.dispatch(configActions.updateProcessMode(newMode));
  
      // 2. 전역 상태 업데이트
      await updateState({
        paragraphs: result.paragraphsToDisplay,
        currentFilePath: filePath,
        currentParagraph: newPosition,
        programStatus: ProgramStatus.PROCESS,
        processMode: newMode,
        timestamp: Date.now()
      });
  
      // 3. 설정과 로그 저장 (상태 업데이트 후)
      await FileManager.saveConfig({ processMode: newMode });
      await FileManager.saveCurrentPositionToLog(); // Redux 상태가 업데이트된 후 실행
  
      // 4. UI 업데이트
      WindowManager.updateWindowContent(mainWindow, 'state-update');
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        WindowManager.updateWindowContent(overlayWindow, 'paragraphs-updated');
      }

      mainWindow.webContents.send('clear-search'); // 검색창 초기화
  
      return { success: true };
    } catch (error) {
      console.error('[Main] 모드 전환 실패:', error);
      return { success: false };
    }
  },
};

const ThemeManager = {
  initialize() {
    store.subscribe(() => {
      const prevTheme = this.getCurrentTheme();
      const currentState = store.getState().config.theme;
      
      // accentColor 변경은 mode와 무관하게 항상 broadcast
      if (currentState.accentColor !== prevTheme.accentColor) {
        this.broadcastTheme();
        return;
      }

      // mode 변경은 기존 로직 유지
      if (prevTheme.mode !== this.getEffectiveMode()) {
        this.broadcastTheme();
      }
    });
  },

  getCurrentTheme() {
    const config = store.getState().config;
    return {
      mode: this.getEffectiveMode(), // 실제 적용될 테마만 반환
      accentColor: config.theme.accentColor
    };
  },

  getEffectiveMode() {
    const config = store.getState().config;
    return config.theme.mode === THEME.AUTO ? 
      (nativeTheme.shouldUseDarkColors ? THEME.DARK : THEME.LIGHT) : 
      config.theme.mode;
  },

  broadcastTheme() {
    const theme = this.getCurrentTheme();
    
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        try {
          window.webContents.send('theme-update', theme);
          window.webContents.send('update-logos');
        } catch (error) {
          console.error('[Main] 테마 업데이트 실패:', error);
        }
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
      minWidth: 400,
      minHeight: 660,
      show: false,
      title: 'Paraglide',
      icon: FILE_PATHS.icon,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      }
    });

    mainWindow.setMenu(null);

    // beforeunload 이벤트 핸들러 추가
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Alt' && input.type === 'keyDown') {
        event.preventDefault();
      }
    });

    let isClosing = false;
    mainWindow.on('close', async (e) => {
      if (isClosing) return;
      
      e.preventDefault();
      const currentState = store.getState().textProcess;
      
      if (currentState.programStatus === ProgramStatus.PROCESS) {
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: ['종료', '취소'],
          defaultId: 1,
          title: '작업 종료',
          message: '작업 중인 파일이 있습니다.\n 정말 종료하시겠습니까?',
          cancelId: 1,
          noLink: true, // 버튼을 링크 스타일로 표시하지 않음
          normalizeAccessKeys: true, // 단축키 정규화
        });

        if (choice === 1) {
          return;
        }
      }
      
      isClosing = true;
      ApplicationManager.exit();
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
      mainWindow.showInactive();
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
    const currentParagraph = state.currentParagraph;
  
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
        theme: ThemeManager.getEffectiveMode(),
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
        theme: {
          mode: ThemeManager.getEffectiveMode(),
          accentColor: store.getState().config.theme.accentColor
        },
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
        console.error('[Main] 파일 열기 실패:', error);
        return { success: false };
      }
    });

    ipcMain.handle('read-file', async (event, filePath) => fs.readFile(filePath, 'utf8'));

    // 리소스 관련 핸들러
    ipcMain.handle('get-logo-path', async (_, type) => this.handleGetLogoPath(type));
    ipcMain.handle('get-icon-path', async (event, iconName) => this.handleGetIconPath(iconName));

    // 클립보드 관련 핸들러
    ipcMain.on('copy-to-clipboard', (event, content) => {
      mainWindow?.webContents.send('notify-clipboard-change');
      systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
    });

    ipcMain.handle('get-logs', () => { // 로그 메시지 반환
      return store.getState().log.logs;
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
          theme: {
            mode: config.theme.mode,
            accentColor: config.theme.accentColor
          },
          processMode: config.processMode,
          viewMode: config.viewMode
        };
      } catch (error) {
        console.error('[Main] 설정 로드 실패:', error);
        return null;
      }
    });
    
    ipcMain.handle('apply-settings', (_, settings) => this.handleApplySettings(settings));
    ipcMain.handle('clear-log-files', (_, filePath = null) => FileManager.clearLogs(filePath));

    // 테마 관련 핸들러
    ipcMain.handle('get-current-theme', () => {
      return ThemeManager.getCurrentTheme();
    });

    ipcMain.handle('generate-css-filter', async (event, color, options) => { // --primary-color-filter 생성
      try {
        // 모듈 불러오기
        const module = require('hex-to-css-filter');
        
        // hexToCSSFilter 함수 직접 접근
        if (typeof module.hexToCSSFilter === 'function') {
          const result = module.hexToCSSFilter(color, options);
          return result;
        }
        
        throw new Error('hexToCSSFilter 함수를 찾을 수 없습니다');
        
      } catch (error) {
        console.error('[Main] 필터 생성 실패:', error);
        return {
          filter: 'brightness(0) saturate(100%)',
          success: false,
          loss: 1
        };
      }
    });

    // 디버그 콘솔 핸들러
    ipcMain.on('show-debug-console', () => this.handleShowDebugConsole());

    handlersInitialized = true;
  },

  async handleGetLogoPath(type = 'logo') {
    try {
      const effectiveMode = ThemeManager.getEffectiveMode();
      let imagePath;
      
      if (type === 'logo') {
        imagePath = effectiveMode === THEME.DARK ? 
          FILE_PATHS.logos.dark : 
          FILE_PATHS.logos.light;
      } else if (type === 'title') {
        imagePath = effectiveMode === THEME.DARK ? 
          FILE_PATHS.titles.dark : 
          FILE_PATHS.titles.light;
      } else {
        throw new Error('Unknown image type');
      }
  
      const imageBuffer = await fs.readFile(imagePath);
      return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
      console.error(`[Main] ${type} 로드 실패:`, error);
      return null;
    }
  },

  async handleGetIconPath(iconName) {
    try {
      const iconPath = path.join(FILE_PATHS.ui_icons, iconName);
      const svgContent = await fs.readFile(iconPath, 'utf8');
      return `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
    } catch (error) {
      console.error('[Main] 아이콘 로드 실패:', error);
      return null;
    }
  },

  async handleApplySettings(settings) {
    try {
      if (!settings) throw new Error('[Main] 설정 파일 찾기 실패');
      
      const state = store.getState().config;
      const newConfig = {
        ...state,
        theme: {
          mode: settings.theme?.mode ?? state.theme.mode,
          accentColor: settings.theme?.accentColor ?? state.theme.accentColor
        },
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
      
      // 오버레이 창 설정 적용
      if (overlayWindow) {
        overlayWindow.setOpacity(newConfig.overlay.windowOpacity);
        overlayWindow.setIgnoreMouseEvents(newConfig.overlay.overlayFixed);
        overlayWindow.webContents.send('update-content-opacity', newConfig.overlay.contentOpacity);
      }
  
      // ThemeManager를 통해 테마 업데이트 브로드캐스트 
      ThemeManager.broadcastTheme();
      
      await FileManager.saveConfig(newConfig);
      return true;
    } catch (error) {
      console.error('[Main] 설정 적용 중 오류:', error);
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

      mainWindow.webContents.send('clear-search');
      
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
    
    store.dispatch(configActions.updateOverlayVisibility(newVisibility));

    // 1. 사용자의 직접 토글 동작에서만 설정 저장
    const config = store.getState().config;
    await FileManager.saveConfig(config);
    
    // 2. 상태 업데이트
    await updateState({ 
      isOverlayVisible: newVisibility,
      timestamp: Date.now()  // 상태 변경 시점 기록
    });
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
      // 포커스할 때도 최신 로그 전송
      const logs = store.getState().log.logs;
      logWindow.webContents.send('update-logs', logs);
      return;
    }
  
    logWindow = new BrowserWindow({
      backgroundColor: '#1e1e1e',
      frame: false,
      movable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

  // 초기 로그 전송
  logWindow.webContents.on('did-finish-load', () => {
    const logs = store.getState().log?.logs || [];
    logWindow.webContents.send('update-logs', logs);
  });
  
    // Redux 스토어 구독 설정
    const unsubscribe = store.subscribe(() => {
      if (logWindow && !logWindow.isDestroyed()) {
        const logs = store.getState().log.logs;
        logWindow.webContents.send('update-logs', logs);
      }
    });
  
    // React 라우팅
    const consoleUrl = isDev
      ? 'http://localhost:3000/#/console'
      : url.format({
          pathname: path.join(__dirname, '../build/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/console'
        });
  
    logWindow.loadURL(consoleUrl);
  
    // 구독 해제 추가
    logWindow.on('closed', () => {
      unsubscribe();
      logWindow = null;
    });
  }
};

const setupLogCapture = () => {
  if (!store.getState().log) {
    return;
  }

  ['stdout', 'stderr'].forEach(output => {
    const original = process[output].write;
    process[output].write = (...args) => {
      // 1. 원본 출력 먼저 실행
      const result = original.apply(process[output], args);
      
      // 2. 로그 저장
      const logEntry = {
        type: output,
        content: args[0].toString(),
        timestamp: new Date().toISOString()
      };
      
      // 3. 동기적으로 저장 (setImmediate 제거)
      store.dispatch(logActions.addLog(logEntry));

      return result;
    };
  });

  // 4. 초기화 확인 로그
  console.log('[Main] 로그 캡처 시스템 초기화');
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
      setupLogCapture(); // 로그 캡처

      await StatusManager.transition(ProgramStatus.READY);
      console.log('[Main] 메인 프로세스 초기화 성공');
    } catch (error) {
      console.error('[Main] 메인 프로세스 초기화 실패:', error);
      await StatusManager.transition(ProgramStatus.READY);
    }
  },

  async exit() {
    try {

      if (systemListener) { // globalShortcut 해제
        systemListener.clearAppShortcuts();
      }

      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.destroy();
        overlayWindow = null;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
        mainWindow = null;
      }
    } catch (error) {
      console.error('[Main] 종료 중 오류 발생:', error);
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
  console.error('[Main] 예외처리 실패:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] 비동기 처리 실패:', promise, 'reason:', reason);
});