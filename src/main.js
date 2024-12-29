// main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, clipboard, screen, shell } = require('electron');
const path = require('path');
const store = require('./store/store');
const i18next = require('i18next');
const { TextProcessUtils } = require('./store/utils/TextProcessUtils');
const { ConfigManager } = require('./store/utils/ConfigManager');
const { textProcessActions } = require('./store/slices/textProcessSlice');
const { configActions, THEME } = require('./store/slices/configSlice');
const { logActions } = require('./store/slices/logSlice');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const url = require('url');
const SystemListener = require('./SystemListener.jsx');  // 클래스로 import
const jschardet = require('jschardet');
const iconv = require('iconv-lite');

// i18n 로케일 파일
const ko = require('./i18n/locales/ko.json');
const en = require('./i18n/locales/en.json');
const ja = require('./i18n/locales/ja.json');
const zh = require('./i18n/locales/zh.json');

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
  LOADING: 'Loading',
  EDIT: 'Edit'
};

// 상수 정의
const DEBOUNCE_TIME = 250;
const DEFAULT_PROCESS_MODE = 'paragraph';
const TEMP_DIR = path.join(os.tmpdir(), 'paraglide-backup');
const TEMP_FILE = 'backup.json';

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
  
      systemListener.setCurrentParagraphText(content);
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

const isDev = process.env.NODE_ENV === 'development';
const appPath = isDev ? path.resolve(__dirname, '..') : app.getAppPath();

// 파일 경로 정의
const FILE_PATHS = {
  config: path.join(os.homedir(), '.ParaglideConfigure.json'),
  log: path.join(os.homedir(), '.ParaglideParaLog.json'),
  logos: isDev 
    ? path.join(appPath, 'public', 'logo.png')
    : path.join(process.resourcesPath, 'dist', 'logo.png'),
  titles: {
    light: isDev
      ? path.join(appPath, 'public', 'TitleLight.png')
      : path.join(process.resourcesPath, 'dist', 'TitleLight.png'), 
    dark: isDev
      ? path.join(appPath, 'public', 'TitleDark.png')
      : path.join(process.resourcesPath, 'dist', 'TitleDark.png')
  },
  icon: isDev
    ? path.join(appPath, 'public', 'icons', 'mac', 'icon.icns')
    : path.join(process.resourcesPath, 'dist', 'icons', 'mac', 'icon.icns'),
  ui_icons: isDev
    ? path.join(appPath, 'public', 'UI_icons')
    : path.join(process.resourcesPath, 'dist', 'UI_icons')
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
let savedState = true;

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
      [ProgramStatus.PAUSE]: [ProgramStatus.PROCESS, ProgramStatus.READY],
      [ProgramStatus.EDIT]: [ProgramStatus.READY]
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

      const updatedHistory = await this.getFileHistory();
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('history-update', updatedHistory);
      }
    });

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
        await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          buttons: [i18next.t('common.buttons.confirm')],
          defaultId: 0,
          title: i18next.t('dialogs.fileError.title'),
          message: i18next.t('dialogs.fileError.message'),
          noLink: true
        });
        return { success: false };
      }

      // 파일 존재 여부 확인
      if (!content) {
        try {
          await fs.access(filePath);
        } catch (error) {
          if (error.code === 'ENOENT') {
            await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              buttons: [i18next.t('common.buttons.confirm')],
              defaultId: 0,
              title: i18next.t('dialogs.fileNotFound.title'),
              message: i18next.t('dialogs.fileNotFound.message'),
              noLink: true
            });

            // 로그에서 해당 파일 기록 삭제
            await this.clearLogs(filePath);
            const updatedHistory = await this.getFileHistory();
            mainWindow?.webContents.send('history-update', updatedHistory);
            
            return { success: false };
          }
          throw error; // 다른 에러는 상위로 전파
        }
      }

      let fileContent;
if (content) {
  fileContent = content;
} else {
  const buffer = await fs.readFile(filePath);
  
  // 1. jschardet로 인코딩 감지
  const detected = jschardet.detect(buffer);
  let encoding = detected.encoding || 'utf8';
  
  console.log('[Main] 감지된 인코딩:', encoding, '(신뢰도:', detected.confidence, ')');

  // 2. 신뢰도가 낮거나 ASCII로 감지된 경우 한글 우선 시도
  const lowConfidence = detected.confidence < 0.5;
  const isAsciiLike = ['ascii', 'windows-1252'].includes(encoding.toLowerCase());
  
  // 3. 시도할 인코딩 순서 결정
  const encodingsToTry = lowConfidence || isAsciiLike ?
    ['cp949', 'windows-1252', 'utf8'] :  // 신뢰도가 낮을 때
    [encoding, 'cp949', 'windows-1252', 'utf8'];  // 신뢰도가 높을 때

  // 4. 순차적으로 인코딩 시도
  for (const enc of encodingsToTry) {
    try {
      const decoded = iconv.decode(buffer, enc);
      // 한글 포함 여부로 검증
      const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(decoded);
      const hasInvalidChar = decoded.includes('�');
      
      if (!hasInvalidChar && (!isAsciiLike || hasKorean)) {
        fileContent = decoded;
        console.log('[Main] 성공한 인코딩:', enc, '(한글 포함:', hasKorean, ')');
        break;
      }
    } catch (error) {
      console.warn(`[Main] ${enc} 인코딩 변환 실패:`, error);
    }
  }

  // 5. 모든 시도 실패시 기본값
  if (!fileContent) {
    console.warn('[Main] 모든 인코딩 시도 실패, UTF-8로 진행');
    fileContent = iconv.decode(buffer, 'utf8');
  }
}
  
      if (!fileContent) {
        console.error('[Main] 파일 내용 없음:', filePath);
        dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: [i18next.t('common.buttons.confirm')],
          defaultId: 1,
          title: i18next.t('dialogs.emptyFile.title'), 
          message: i18next.t('dialogs.emptyFile.message'),
          cancelId: 1,
          noLink: true,
          normalizeAccessKeys: true,
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
            buttons: [i18next.t('common.buttons.confirm'), i18next.t('common.buttons.cancel')],
            defaultId: 0,
            title: i18next.t('dialogs.processMode.title'),
            message: i18next.t('dialogs.processMode.message')
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
      
      // 에러 발생 시 안전하게 메시지 표시
      if (!mainWindow.isDestroyed()) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          buttons: [i18next.t('common.buttons.confirm')],
          defaultId: 0,
          title: i18next.t('dialogs.fileOpenError.title'),  // ko.json에 추가 필요
          message: i18next.t('dialogs.fileOpenError.message'),  // ko.json에 추가 필요
          detail: error.message,
          noLink: true
        });
      }
      
      return { success: false };
    }
  },

  async processFileContent(content, filePath) {
    try {
      const initialState = {
        paragraphs: [content],
        paragraphsMetadata: [{ startPos: 0, endPos: content.length }],
        currentFilePath: filePath,
        currentParagraph: 0,
        programStatus: ProgramStatus.EDIT,
        processMode: 'editor',
        viewMode: 'editor'
      };
  
      // Redux store 업데이트
      store.dispatch(textProcessActions.updateContent(initialState));
  
      // 전역 상태 업데이트
      await updateState({
        ...initialState,
        timestamp: Date.now()
      });
  
      // 창 제목 업데이트
      const formatFileName = (filePath, maxLength = 30) => {
        const fileName = path.basename(filePath);
        if (fileName.length > maxLength) {
          return fileName.slice(0, maxLength - 3) + '...';
        }
        return fileName;
      };
      mainWindow.setTitle(`${formatFileName(filePath)} - Paraglide (편집)`);
  
      return { success: true };
    } catch (error) {
      console.error('[Main] 파일 처리 실패:', error);
      return { success: false };
    }
  },

  async saveTextFile({ content, fileName, currentFilePath, saveType }) {
    try {
      let filePath;
  
      // 기존 파일 덮어쓰기
      if (saveType === 'overwrite' && currentFilePath) {
        filePath = currentFilePath;
      } 
      // 새 파일 저장
      else {
        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: fileName,
          filters: [{ name: 'Text Files', extensions: ['txt'] }]
        });
  
        if (result.canceled) {
          return { success: false, reason: 'canceled' };
        }
        
        filePath = result.filePath;
      }
  
      // 파일 저장
      await fs.writeFile(filePath, content, 'utf8');
  
      return { 
        success: true, 
        filePath 
      };
  
    } catch (error) {
      console.error('[Main] 파일 저장 실패:', error);
      return { 
        success: false, 
        reason: error.message 
      };
    }
  },

  async backupContent({ content, fileName }) {
    try {
        // 임시 디렉토리 생성
        await fs.mkdir(TEMP_DIR, { recursive: true });
        
        const backupData = {
            content,
            fileName,
            timestamp: Date.now()
        };

        // 임시 파일에 저장
        await fs.writeFile(
            path.join(TEMP_DIR, TEMP_FILE),
            JSON.stringify(backupData),
            'utf8'
        );

        return { success: true };
    } catch (error) {
        console.error('[Main] 임시 저장 실패:', error);
        return { success: false };
    }
},

async restoreBackup() {
    try {
        const backupPath = path.join(TEMP_DIR, TEMP_FILE);
        const exists = await fs.access(backupPath)
            .then(() => true)
            .catch(() => false);

        if (!exists) return null;

        const data = await fs.readFile(backupPath, 'utf8');
        const backup = JSON.parse(data);

        // 백업 파일이 24시간 이상 지난 경우 삭제
        if (Date.now() - backup.timestamp > 24 * 60 * 60 * 1000) {
            await fs.unlink(backupPath);
            return null;
        }

        return backup;
    } catch (error) {
        console.error('[Main] 백업 복원 실패:', error);
        return null;
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

const LanguageManager = {
// i18next 초기화 함수
async initializeI18n() {
  try {
    const config = store.getState().config;
    const savedLanguage = config.language;
    
    console.log('[Main] 저장된 언어 설정:', savedLanguage);
    
    const effectiveLanguage = savedLanguage === 'auto' 
      ? app.getLocale().split('-')[0] 
      : savedLanguage;

    // 지원 언어 확인 및 기본값 설정
    const supportedLanguages = ['ko', 'en', 'ja', 'zh'];
    const finalLanguage = supportedLanguages.includes(effectiveLanguage) 
      ? effectiveLanguage 
      : 'en';  // 기본값을 'en'으로 변경

    // i18next 초기화
    await i18next.init({
      lng: finalLanguage,
      fallbackLng: 'en',
      resources: {
        ko: { translation: ko },
        en: { translation: en },
        ja: { translation: ja },
        zh: { translation: zh }
      },
      interpolation: {
        escapeValue: false
      },
      initImmediate: false
    });

    console.log('[Main] i18next 초기화 완료:', finalLanguage);
    return true;
  } catch (error) {
    console.error('[Main] i18n 초기화 실패:', error);
    return false;
  }
},

async changeLanguage(lang) {
  try {
    // 초기화되지 않았다면 재초기화
    if (!i18next.isInitialized) {
      const initResult = await initializeI18n();
      if (!initResult) {
        throw new Error('i18next 재초기화 실패');
      }
    }

    const effectiveLang = lang === 'auto' ? 
      app.getLocale().split('-')[0] : 
      lang;

    await i18next.changeLanguage(effectiveLang);
    
    store.dispatch(configActions.updateLanguage(lang));
    await FileManager.saveConfig({ language: lang });

    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('language-changed', effectiveLang);
      }
    });

    console.log('[Main] 언어 변경 성공:', effectiveLang);
    return true;
  } catch (error) {
    console.error('[Main] 언어 변경 실패:', error);
    return false;
  }
}
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

  generateCSSfilter(color, options) {
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
    mainWindow.webContents.openDevTools();

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
      
      try {
        if (currentState.programStatus === ProgramStatus.PROCESS || 
            currentState.programStatus === ProgramStatus.EDIT) {
    
          // 공통 작업 중 경고
          const workingChoice = dialog.showMessageBoxSync(mainWindow, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.exit'), i18next.t('common.buttons.cancel')],
            defaultId: 1,
            title: i18next.t('dialogs.exitConfirm.title'),
            message: i18next.t('dialogs.exitConfirm.message'),
            cancelId: 1,
            noLink: true,
          });
          if (workingChoice === 1) return;
    
          // 에디터 모드에서는 저장 여부도 추가 확인
          if (currentState.programStatus === ProgramStatus.EDIT) {
            mainWindow.webContents.send('editor-is-saved-check');
            const isEditorSaved = await new Promise(resolve => {
              ipcMain.once('editor-is-saved-result', (_, isSaved) => resolve(isSaved));
            });
    
            if (!isEditorSaved) {
              const saveChoice = dialog.showMessageBoxSync(mainWindow, {
                type: 'warning',
                buttons: [i18next.t('common.buttons.exit'), i18next.t('common.buttons.cancel')],
                defaultId: 1,
                title: i18next.t('dialogs.unsavedChanges.title'),  // ko.json에 추가 필요
                message: i18next.t('dialogs.unsavedChanges.message'),  // ko.json에 추가 필요
                cancelId: 1,
                noLink: true,
              });
              if (saveChoice === 1) return;
            }
          }
        }
        
        isClosing = true;
        ApplicationManager.exit();
      } catch (error) {
        console.error('종료 처리 중 오류:', error);
        isClosing = true;
        ApplicationManager.exit();
      }
    });

    const startUrl = isDev
      ? 'http://localhost:5173' // Vite 기본 포트
      : url.format({
        pathname: path.join(__dirname, '../dist/index.html'), // build -> dist
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
      ? 'http://localhost:5173/#/overlay'
      : url.format({
          pathname: path.join(__dirname, '../dist/index.html'),
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
    if (!state || !state.paragraphs) return;
  
    const currentParagraph = state.currentParagraph || 0;
  
    if (window === mainWindow) {
      const pageInfo = state.paragraphsMetadata[currentParagraph]?.pageInfo;
      const display = pageInfo ? {
        text: pageInfo.end !== pageInfo.start ? 
          `${pageInfo.start}-${pageInfo.end}` :  // 합페이지
          `${pageInfo.start}`,                   // 단일 페이지
        isRange: pageInfo.end !== pageInfo.start // 합페이지 여부
      } : null;
    
      window.webContents.send('state-update', {
        ...globalState,
        paragraphs: state.paragraphs,
        currentParagraph: state.currentParagraph,
        paragraphsMetadata: state.paragraphsMetadata,
        currentNumber: { ...pageInfo, display },
        theme: ThemeManager.getEffectiveMode(),
      });
      
    } else if (window === overlayWindow) {
      const startIdx = Math.max(0, currentParagraph - 5);
      const endIdx = Math.min(state.paragraphs.length, currentParagraph + 6);
        // 오버레이에는 합페일 때 숫자만 표시하도록 해주세요.
      const pageInfo = state.paragraphsMetadata[currentParagraph]?.pageInfo;
      const display = pageInfo ? {
        text: pageInfo.end !== pageInfo.start ? 
          `${pageInfo.start}-${pageInfo.end}` :  // 합페이지는 숫자만
          pageInfo.start,                        // 단일 페이지는 숫자만
        isRange: pageInfo.end !== pageInfo.start // 합페이지 여부
      } : null;
    
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
        currentNumber: { ...pageInfo, display },
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

    // 언어 변경 핸들러
    ipcMain.handle('change-language', async (_, lang) => {
      return await LanguageManager.changeLanguage(lang);
    });
  
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

    ipcMain.handle('save-text-file', async (event, { content, fileName, currentFilePath, saveType }) => {
      return await FileManager.saveTextFile({ content, fileName, currentFilePath, saveType });
    });

    ipcMain.handle('process-file-content', async (_, content, filePath) => {
      return await FileManager.processFileContent(content, filePath);
    });

    // 저장 상태 업데이트 리스너
ipcMain.on('update-saved-state', (event, state) => {
  savedState = state;
});

// 저장 상태 확인 핸들러
ipcMain.handle('check-unsaved-sync', () => {
  return !savedState;
});

ipcMain.handle('process-paragraphs', (_, content) => {
  return TextProcessUtils.processParagraphs(content);
});
    
    ipcMain.handle('backup-text-content', async (_, data) => {
      return await FileManager.backupContent(data);
  });
  
  ipcMain.handle('restore-backup', async () => {
      return await FileManager.restoreBackup();
  });

    ipcMain.handle('show-in-folder', (_, filePath) => {
      shell.showItemInFolder(filePath);
    });

    ipcMain.on('get-editor-info', (event, { type, data }) => {
      this.handleEditorEvent(type, data);
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
    ipcMain.handle('set-window-title', (event, title) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setTitle(`${title} - Paraglide`);
      }
  });

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
          language: config.language,
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

    // --primary-color-filter 생성
    ipcMain.handle('generate-css-filter', async (event, color, options) => {
      return ThemeManager.generateCSSfilter(color, options);
    });

    // 디버그 콘솔 핸들러
    ipcMain.on('show-debug-console', () => this.handleShowDebugConsole());

    handlersInitialized = true;
  },

  handleEditorEvent(type, data) {
    try {
      switch(type) {
        case 'request':
          // 모든 창에 요청 전달
          BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
              window.webContents.send('get-editor-info', { type: 'request' });
            }
          });
          break;
  
        case 'response':
          // 응답 데이터를 모든 창에 전달
          BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
              window.webContents.send('get-editor-info', { 
                type: 'response',
                data: data
              });
            }
          });
          break;
  
        default:
          console.error('알 수 없는 에디터 이벤트 타입:', type);
      }
    } catch (error) {
      console.error('에디터 이벤트 처리 중 오류:', error);
    }
  },

  async handleGetLogoPath(type = 'logo') {
    try {
      const effectiveMode = ThemeManager.getEffectiveMode();
      let imagePath;
      
      if (type === 'logo') {
        imagePath = FILE_PATHS.logos;
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
      const textProcessState = store.getState().textProcess;
  
      // 에디터 모드일 때는 viewMode 변경 무시
      const newViewMode = textProcessState.programStatus === ProgramStatus.PROCESS && 
                         textProcessState.processMode === 'editor' ? 
                         'editor' : 
                         settings.viewMode;
  
      const newConfig = {
        ...state,
        theme: {
          mode: settings.theme?.mode ?? state.theme.mode,
          accentColor: settings.theme?.accentColor ?? state.theme.accentColor
        },
        language: settings.language ?? state.language,
        overlay: {
          ...state.overlay,
          windowOpacity: settings.windowOpacity ?? state.overlay.windowOpacity,
          contentOpacity: settings.contentOpacity ?? state.overlay.contentOpacity,
          overlayFixed: settings.overlayFixed ?? state.overlay.overlayFixed,
          loadLastOverlayBounds: settings.loadLastOverlayBounds ?? state.overlay.loadLastOverlayBounds
        },
        processMode: settings.processMode ?? state.processMode,
        viewMode: newViewMode ?? state.viewMode
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
      ? 'http://localhost:5173/#/console'
      : url.format({
          pathname: path.join(__dirname, '../dist/index.html'),
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

      // 1. 설정 파일 로드 및 적용을 가장 먼저
      const savedConfig = await FileManager.loadConfig();
      await ConfigManager.loadAndValidateConfig(savedConfig);

      // 2. i18next 초기화는 설정 로드 후에
      await LanguageManager.initializeI18n();

      // 3. 나머지 초기화
      ThemeManager.initialize();
      IPCManager.setupHandlers();
      WindowManager.createMainWindow();
      WindowManager.createOverlayWindow();

      systemListener = new SystemListener(mainWindow);
      await systemListener.initialize();
      setupLogCapture();

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
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  LanguageManager.initializeI18n().then(() => {
  // 다른 인스턴스가 실행 중이면 경고창을 표시하고 종료
  dialog.showMessageBoxSync({
    type: 'warning',
    buttons: [i18next.t('common.buttons.confirm')],
    title: i18next.t('dialogs.alreadyRunning.title'),
    message: i18next.t('dialogs.alreadyRunning.message'),
    detail: i18next.t('dialogs.alreadyRunning.detail'),
    cancelId: 1,
    noLink: true,
    normalizeAccessKeys: true,
  });
  app.quit();
 });
} else {
  // 두 번째 인스턴스 실행 시도 시 기존 창 포커스
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: [i18next.t('common.buttons.confirm')],
        title: i18next.t('dialogs.switchToExisting.title'),
        message: i18next.t('dialogs.switchToExisting.message'),
        detail: i18next.t('dialogs.switchToExisting.detail'),
        cancelId: 1,
        noLink: true,
        normalizeAccessKeys: true,
      });
    }
  });

  // 기존 앱 시작 로직
  app.whenReady().then(async () => {
    // i18next 초기화를 먼저 수행
    await LanguageManager.initializeI18n();
    await ApplicationManager.initialize();
  });
}

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