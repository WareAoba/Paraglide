// FileManager.js — 파일 I/O, 로그, 히스토리
const { BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { TextProcessUtils } = require('../../store/utils/TextProcessUtils');
const { ParaFileFormat } = require('../../store/utils/ParaFileFormat');
const { ConfigManager } = require('../../store/utils/ConfigManager');
const { ProgramStatus, DEFAULT_PROCESS_MODE, FILE_PATHS, TEMP_DIR, TEMP_FILE } = require('../constants');
const { state, updateState } = require('../state');
const DialogManager = require('./DialogManager');
const jschardet = require('jschardet');
const iconv = require('iconv-lite');

const FileManager = {
  async saveConfig(config) {
    try {
      const currentState = state.config;
      let newConfig = { ...currentState };
  
      // 테마 설정 처리
      if (config.theme) {
        newConfig.theme = {
          mode: config.theme.mode ?? currentState.theme.mode,
          accentColor: config.theme.accentColor ?? currentState.theme.accentColor
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
  
      // AppState 업데이트
      state.loadConfig(newConfig);
      
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
        const defaultConfig = state.config;
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
  
      // 2. 파일 읽기
      const data = await fs.readFile(FILE_PATHS.config, 'utf8');
      
      // 3. 파일 내용 검증
      if (!data.trim()) {
        console.log('[Main] 잘못된 설정 파일, 기본값으로 초기화');
        const defaultConfig = state.config;
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
  
      try {
        const parsedConfig = JSON.parse(data);
        
        // 4. 구조 검증
        if (!ConfigManager.validateConfigStructure(parsedConfig)) {
          console.log('[Main] 올바르지 않은 설정 구조, 기본값으로 초기화]');
          const defaultConfig = state.config;
          await this.saveConfig(defaultConfig);
          return defaultConfig;
        }
  
        return parsedConfig;
      } catch (parseError) {
        console.error('[Main] 설정 파일 파싱 실패:', parseError);
        const defaultConfig = state.config;
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
    } catch (error) {
      console.error('[Main] 설정 로드 실패:', error);
      return state.config;
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

  async clearLogs(filePath = null) {
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
      const textState = state.textProcess;
      
      if (!textState.currentFilePath) {
        console.warn('[Main] 로그 저장 취소');
        return;
      }

      const originalContent = await fs.readFile(textState.currentFilePath, 'utf8');
      const fileHash = this.getFileHash(originalContent);
      const log = await this.loadLog();
  
      const currentMeta = textState.paragraphsMetadata[textState.currentParagraph];
      if (!currentMeta) {
        console.warn('[Main] 현재 위치의 메타데이터가 없음:', textState.currentParagraph);
        return;
      }
      
      log[textState.currentFilePath] = {
        fileName: path.basename(textState.currentFilePath),
        fileHash: fileHash,
        lastPosition: {
          currentParagraph: textState.currentParagraph,
          pageNumber: currentMeta?.pageNumber || null,
          processMode: textState.processMode,
          metadata: {
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
        const existingFile = Object.entries(logData).find(([p, log]) => log.fileHash === currentHash);
        if (existingFile) {
          [oldPath, fileLog] = existingFile;
          // 새 경로로 로그 이전
          logData[filePath] = {
            ...fileLog,
            fileName: path.basename(filePath)
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
      
      let currentFile = null;
      if (state.globalState.currentFilePath) {
          const originalContent = await fs.readFile(state.globalState.currentFilePath, 'utf8');
          currentFile = {
              path: state.globalState.currentFilePath,
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
      if (fileExtension !== '.txt' && fileExtension !== '.para') {
        await DialogManager.show(DialogManager.DIALOGS.FILE_ERROR, state.mainWindow);
        return { success: false };
      }

      // 파일 존재 여부 확인
      if (!content) {
        try {
          await fs.access(filePath);
        } catch (error) {
          if (error.code === 'ENOENT') {
            await DialogManager.show(DialogManager.DIALOGS.FILE_NOT_FOUND, state.mainWindow);

            // 로그에서 해당 파일 기록 삭제
            await this.clearLogs(filePath);
            const updatedHistory = await this.getFileHistory();
            state.mainWindow?.webContents.send('history-update', updatedHistory);
            
            return { success: false };
          }
          throw error;
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
    ['cp949', 'windows-1252', 'utf8'] :
    [encoding, 'cp949', 'windows-1252', 'utf8'];

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
        await DialogManager.show(DialogManager.DIALOGS.EMPTY_FILE, state.mainWindow);
        return { success: false };
      }

      // ─── .para 메타데이터 처리 ───
      let paraMetadata = null;
      const isParaFile = fileExtension === '.para';

      if (isParaFile) {
        // 암호화 확인
        if (ParaFileFormat.isEncrypted(fileContent)) {
          const password = await DialogManager.show(DialogManager.DIALOGS.PARA_DECRYPT, state.mainWindow);
          if (!password) {
            return { success: false, reason: 'decrypt-canceled' };
          }
          const decryptResult = ParaFileFormat.decrypt(fileContent, password);
          if (!decryptResult.success) {
            await DialogManager.show(DialogManager.DIALOGS.PARA_DECRYPT_FAILED, state.mainWindow);
            return { success: false, reason: 'decrypt-failed' };
          }
          fileContent = decryptResult.content;
        }

        // .para 포맷 파싱 → 평문 + 메타데이터 분리
        const parsed = ParaFileFormat.parse(fileContent);
        fileContent = parsed.plainText;
        paraMetadata = parsed.metadata;
        console.log('[Main] .para 메타데이터 로드 완료:', {
          hasImage: !!paraMetadata.integral.image,
          pages: paraMetadata.pages.size,
          paragraphs: paraMetadata.paragraphs.length
        });
      } else if (ParaFileFormat.isParaFormat(fileContent)) {
        // .txt지만 내용이 .para 포맷인 경우
        const parsed = ParaFileFormat.parse(fileContent);
        fileContent = parsed.plainText;
        paraMetadata = parsed.metadata;
      } else {
        // 순수 txt → 기본 메타데이터 생성
        paraMetadata = ParaFileFormat.createDefaultMetadata();
      }

      // 메타데이터를 상태에 저장
      state._paraMetadata = paraMetadata;

      // ─── 이미지 파일 존재 확인 ───
      if (paraMetadata.integral.image) {
        const imageDir = path.dirname(filePath);
        const imagePath = path.resolve(imageDir, paraMetadata.integral.image);
        try {
          await fs.access(imagePath);
        } catch {
          // 이미지를 찾을 수 없으면 무시하고 렌더러에 알림
          console.warn('[Main] .para 이미지 파일을 찾을 수 없음:', imagePath);
          paraMetadata.integral.image = null;
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            state.mainWindow.webContents.send('para-image-missing');
          }
        }
      }
  
      // 1. 설정의 processMode 먼저 확인
      const config = state.config;
      let processMode = config.processMode;
  
      // 2. 파일 상태 확인 (이전 로그)
      const fileStatus = await this.checkExistingFile(filePath);
      
      // 3. 로그에 저장된 모드가 있다면 우선 적용
      if (fileStatus.processMode) {
        processMode = fileStatus.processMode;

        state.updateConfigProcessMode(processMode);
        await this.saveConfig({ processMode: processMode });
      }
      
      // 4. 모드가 없을 때만 자동 감지
      if (!processMode) {
        const shouldSuggestLine = TextProcessUtils.detectLineMode(fileContent);
        if (shouldSuggestLine) {
          const choice = await DialogManager.show(DialogManager.DIALOGS.PROCESS_MODE, state.mainWindow);
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
  
      // 상태 업데이트
      try {
        // 1. 먼저 content 업데이트
        state.updateContent({
          paragraphs: result.paragraphsToDisplay,
          paragraphsMetadata: result.paragraphsMetadata,
          currentNumber: result.paragraphsMetadata[restoredPosition]?.pageInfo,
          processMode: processMode,
          currentFilePath: filePath,
          programStatus: ProgramStatus.PROCESS
        });
      
        // 2. 위치 업데이트
        state.updateCurrentParagraph(restoredPosition);
      
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
          currentNumber: result.paragraphsMetadata[restoredPosition]?.pageInfo
        });
        
        const formatFileName = (fp, maxLength = 30) => {
          const fileName = path.basename(fp);
          if (fileName.length > maxLength) {
            return fileName.slice(0, maxLength - 3) + '...';
          }
          return fileName;
        };

        // 사용할 때
        state.mainWindow.setTitle(`${formatFileName(filePath)} - Paraglide`);

        // Lazy require to avoid circular dependency
        const ContentManager = require('./ContentManager');
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
      if (!state.mainWindow.isDestroyed()) {
        await DialogManager.show(DialogManager.DIALOGS.FILE_OPEN_ERROR, state.mainWindow);
      }
      
      return { success: false };
    }
  },

  // update-editor-state 리스너 등록 여부 플래그
  _editorStateListenerRegistered: false,

  _ensureEditorStateListener() {
    if (this._editorStateListenerRegistered) return;
    this._editorStateListenerRegistered = true;

    ipcMain.on('update-editor-state', (_, { saved, filePath: fp }) => {
      // EDIT 모드가 아니면 무시
      if (state.globalState.programStatus !== ProgramStatus.EDIT) return;

      const formatFileName = (p, maxLength = 30) => {
        if (!p) return 'Untitled';
        const fileName = path.basename(p);
        if (fileName.length > maxLength) {
          return fileName.slice(0, maxLength - 3) + '...';
        }
        return fileName;
      };

      const formattedName = formatFileName(fp);
      const title = `${formattedName}${saved ? '' : ' *'} - Paraglide (편집)`;
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.setTitle(title);
      }
    });
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
  
      // 상태 업데이트
      state.updateContent(initialState);
  
      // 전역 상태 업데이트
      await updateState({
        ...initialState,
        timestamp: Date.now()
      });
  
      // 창 제목 업데이트 리스너 등록 (중복 방지)
      this._ensureEditorStateListener();
  
      return { success: true };
    } catch (error) {
      console.error('[Main] 파일 처리 실패:', error);
      return { success: false };
    }
  },

  async saveTextFile({ content, fileName, currentFilePath, saveType, format, metadata, password }) {
    try {
      let filePath;

      // 저장 포맷 결정
      const saveFormat = format || 'txt';
      const fileExtension = saveFormat === 'para' ? '.para' : '.txt';
      const defaultFileName = fileName ? 
        path.basename(fileName, path.extname(fileName)) + fileExtension : 
        'Untitled' + fileExtension;
  
      // 기존 파일 덮어쓰기
      if (saveType === 'overwrite' && currentFilePath) {
        filePath = currentFilePath;
      } 
      // 새 파일 저장
      else {
        const filters = saveFormat === 'para' 
          ? [
              { name: 'Paraglide Files', extensions: ['para'] },
              { name: 'Text Files', extensions: ['txt'] }
            ]
          : [
              { name: 'Text Files', extensions: ['txt'] },
              { name: 'Paraglide Files', extensions: ['para'] }
            ];

        const result = await dialog.showSaveDialog(state.mainWindow, {
          defaultPath: defaultFileName,
          filters
        });
  
        if (result.canceled) {
          return { success: false, reason: 'canceled' };
        }
        
        filePath = result.filePath;
      }

      // 저장할 확장자에 따라 내용 결정
      const actualExtension = path.extname(filePath).toLowerCase();
      let saveContent;

      if (actualExtension === '.para') {
        // .para 포맷: 메타데이터 포함
        let meta;
        if (metadata) {
          // 렌더러에서 직접 전달된 메타데이터 사용
          meta = { ...metadata };
          // pages를 Map으로 변환 (IPC에서 직렬화된 경우)
          if (meta.pages && !(meta.pages instanceof Map)) {
            meta.pages = new Map(Object.entries(meta.pages).map(([k, v]) => [Number(k), v]));
          }
        } else {
          meta = state._paraMetadata || ParaFileFormat.createDefaultMetadata();
        }
        // 타임스탬프 갱신
        meta.integral.timestamp = Date.now();
        
        // 평문에서 기존 메타데이터 라인 제거 후 직렬화
        const cleanContent = ParaFileFormat.stripMetadata(content);
        saveContent = ParaFileFormat.serialize(cleanContent, meta);

        // 암호화 요청이 있는 경우
        if (password) {
          meta.integral.encrypted = true;
          saveContent = ParaFileFormat.encrypt(
            ParaFileFormat.serialize(cleanContent, meta),
            password
          );
        }

        // 메타데이터 상태 갱신
        state._paraMetadata = meta;
      } else {
        // .txt 포맷: 메타데이터 완전 제거, 순수 평문만 저장
        saveContent = ParaFileFormat.stripMetadata(content);
      }
  
      // 파일 저장
      await fs.writeFile(filePath, saveContent, 'utf8');
  
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
      const filePath = state.globalState.currentFilePath;
      if (!filePath) {
        console.log('[Main] 모드 전환 실패, 파일을 불러오지 않음.');
        return { success: false };
      }
  
      const content = await fs.readFile(filePath, 'utf8');
      const previousState = state.textProcess;
      const result = TextProcessUtils.processParagraphs(content, newMode);
      const newPosition = TextProcessUtils.mapPositionBetweenModes(
        previousState.currentParagraph,
        previousState.paragraphsMetadata,
        result.paragraphsMetadata,
        previousState.processMode,
        newMode
      );
  
      // 1. 상태 먼저 업데이트
      state.updateContent({
        paragraphs: result.paragraphsToDisplay,
        paragraphsMetadata: result.paragraphsMetadata,
        processMode: newMode,
        currentFilePath: filePath
      });
      state.updateCurrentParagraph(newPosition);
      state.updateConfigProcessMode(newMode);
  
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
      await FileManager.saveCurrentPositionToLog();
  
      // 4. UI 업데이트
      // Lazy require to avoid circular dependency
      const WindowManager = require('./WindowManager');
      WindowManager.updateWindowContent(state.mainWindow, 'state-update');
      if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
        WindowManager.updateWindowContent(state.overlayWindow, 'paragraphs-updated');
      }

      state.mainWindow.webContents.send('clear-search');
  
      return { success: true };
    } catch (error) {
      console.error('[Main] 모드 전환 실패:', error);
      return { success: false };
    }
  },

  // ─── 텍스트 매크로 저장/로드 ───
  async loadTextMacros() {
    try {
      const configPath = FILE_PATHS.config;
      const data = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(data);
      if (Array.isArray(config.textMacros)) {
        return config.textMacros;
      }
    } catch (_) { /* 파일 없음 또는 파싱 실패 */ }
    return ['…', '―', '♡', '♥'];
  },

  async saveTextMacros(macros) {
    try {
      const configPath = FILE_PATHS.config;
      let config = {};
      try {
        const data = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(data);
      } catch (_) { /* 새 config */ }
      config.textMacros = Array.isArray(macros) ? macros.slice(0, 10) : [];
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('[Main] 텍스트 매크로 저장 실패:', error);
    }
  },

  // ─── 텍스트 스타일 저장/로드 ───
  async loadTextStyles() {
    try {
      const configPath = FILE_PATHS.config;
      const data = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(data);
      if (Array.isArray(config.textStyles)) {
        return config.textStyles;
      }
    } catch (_) { /* 파일 없음 또는 파싱 실패 */ }
    return ['기본'];
  },

  async saveTextStyles(styles) {
    try {
      const configPath = FILE_PATHS.config;
      let config = {};
      try {
        const data = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(data);
      } catch (_) { /* 새 config */ }
      config.textStyles = Array.isArray(styles) ? styles.slice(0, 10) : [];
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('[Main] 텍스트 스타일 저장 실패:', error);
    }
  },
};

module.exports = FileManager;
