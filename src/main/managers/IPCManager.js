// IPCManager.js — IPC 핸들러 등록
const { ipcMain, dialog, clipboard, shell, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs').promises;
const { TextProcessUtils } = require('../../utils/TextProcessUtils');
const { ProgramStatus, isDev, FILE_PATHS } = require('../constants');
const { state, updateState } = require('../state');
const FileManager = require('./FileManager');
const LanguageManager = require('./LanguageManager');
const ThemeManager = require('./ThemeManager');
const DialogManager = require('./DialogManager');
const WindowManager = require('./WindowManager');
const ContentManager = require('./ContentManager');
const PluginBridge = require('./PluginBridge');

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
    ipcMain.handle('get-state', () => state.globalState);
    ipcMain.on('update-state', (event, newState) => updateState(newState));

    // 렌더러 준비 완료 시 — 대기 중인 파일이 있으면 열기
    ipcMain.handle('renderer-ready', async () => {
      if (state._pendingFilePath) {
        const filePath = state._pendingFilePath;
        state._pendingFilePath = null;
        await FileManager.openFile(filePath);
      }
    });

    // 언어 변경 핸들러
    ipcMain.handle('change-language', async (_, lang) => {
      return await LanguageManager.changeLanguage(lang);
    });
  
    // 파일 관련 핸들러 - 통합
    ipcMain.handle('get-file-history', () => FileManager.getFileHistory());
    ipcMain.handle('open-file', async (_, options = {}) => {
      try {
        if (!options.filePath) {
          const result = await dialog.showOpenDialog(state.mainWindow, {
            properties: ['openFile'],
            filters: [
              { name: 'Supported Files', extensions: ['txt', 'para'] },
              { name: 'Paraglide Files', extensions: ['para'] },
              { name: 'Text Files', extensions: ['txt'] }
            ]
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

    ipcMain.handle('save-text-file', async (event, { content, fileName, currentFilePath, saveType, format, metadata, password }) => {
      return await FileManager.saveTextFile({ content, fileName, currentFilePath, saveType, format, metadata, password });
    });

    ipcMain.handle('process-file-content', async (_, content, filePath) => {
      return await FileManager.processFileContent(content, filePath);
    });

    // 저장 상태 업데이트 리스너
    ipcMain.on('update-saved-state', (event, s) => {
      state.savedState = s;
    });

    // 저장 상태 확인 핸들러
    ipcMain.handle('check-unsaved-sync', () => {
      return !state.savedState;
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

    // 에디터용 암호화 대응 파일 읽기
    ipcMain.handle('read-file-decrypted', async (event, filePath) => {
      const content = await fs.readFile(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.para') {
        const { ParaFileFormat } = require('../../utils/ParaFileFormat');
        if (ParaFileFormat.isEncrypted(content)) {
          // 캐시된 비밀번호가 같은 파일에 대해 있으면 먼저 시도
          const cached = state._cachedDecrypt;
          if (cached && cached.filePath === filePath && cached.password) {
            const tryResult = ParaFileFormat.decrypt(content, cached.password);
            if (tryResult.success) {
              return { success: true, content: tryResult.content, wasEncrypted: true, password: cached.password };
            }
          }
          // 로그의 저장된 비밀번호로 시도
          try {
            const log = await FileManager.loadLog();
            const logEntry = log[filePath];
            if (logEntry?.savedPassword) {
              const tryResult = ParaFileFormat.decrypt(content, logEntry.savedPassword);
              if (tryResult.success) {
                state._cachedDecrypt = { filePath, password: logEntry.savedPassword, rememberPassword: true };
                return { success: true, content: tryResult.content, wasEncrypted: true, password: logEntry.savedPassword };
              }
            }
          } catch (_) { /* 로그 로드 실패 무시 */ }
          // 모달로 요청
          const result = await FileManager._requestDecryptPassword(state.mainWindow);
          if (!result) {
            return { success: false, reason: 'decrypt-canceled' };
          }
          const decResult = ParaFileFormat.decrypt(content, result.password);
          if (!decResult.success) {
            return { success: false, reason: 'decrypt-failed' };
          }
          state._cachedDecrypt = { filePath, password: result.password, rememberPassword: result.rememberPassword };
          return { success: true, content: decResult.content, wasEncrypted: true, password: result.password };
        }
      }
      return { success: true, content, wasEncrypted: false };
    });

    // 에디터용 파일 열기 다이얼로그 (파일 경로만 반환, 프로세스 상태 변경 없음)
    ipcMain.handle('show-open-file-dialog', async () => {
      const result = await dialog.showOpenDialog(state.mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Supported Files', extensions: ['txt', 'para'] },
          { name: 'Paraglide Files', extensions: ['para'] },
          { name: 'Text Files', extensions: ['txt'] }
        ]
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return result.filePaths[0];
    });

    // 리소스 관련 핸들러
    ipcMain.handle('get-logo-path', async (_, type) => this.handleGetLogoPath(type));
    ipcMain.handle('get-icon-path', async (event, iconName) => this.handleGetIconPath(iconName));

    // 클립보드 관련 핸들러
    ipcMain.on('copy-to-clipboard', (event, content) => {
      if (state._photoshopModeActive) return;
      state.mainWindow?.webContents.send('notify-clipboard-change');
      state.systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
    });

    ipcMain.handle('get-logs', () => {
      return state.logs;
    });

    // 네비게이션 핸들러
    ipcMain.on('move-to-next', () => IPCManager.handleMove('next'));
    ipcMain.on('move-to-prev', () => IPCManager.handleMove('prev'));
    ipcMain.on('move-to-next-page', () => IPCManager.handleMove('next', 'page'));
    ipcMain.on('move-to-prev-page', () => IPCManager.handleMove('prev', 'page'));
    ipcMain.on('move-to-position', (event, position) => this.handleMoveToPosition(position));

    // 오버레이 리사이즈 임시 제어 (transparent frameless 창 드래그 시 리사이즈 오작동 방지)
    // sendSync으로 호출되므로 즉시 처리 후 응답
    ipcMain.on('overlay-set-resizable', (event, resizable) => {
      if (!state.overlayWindow || state.overlayWindow.isDestroyed()) {
        event.returnValue = false;
        return;
      }
      state.overlayWindow.setResizable(resizable);
      event.returnValue = true;
    });

    // 오버레이 수동 드래그 핸들러
    let dragStart = null;
    ipcMain.on('overlay-drag-start', (_, pos) => {
      if (!state.overlayWindow) return;
      const bounds = state.overlayWindow.getBounds();
      dragStart = { mouseX: pos.x, mouseY: pos.y, winX: bounds.x, winY: bounds.y, winW: bounds.width, winH: bounds.height };
    });
    ipcMain.on('overlay-drag-move', (_, pos) => {
      if (!state.overlayWindow || !dragStart) return;
      // setBounds로 크기를 명시적으로 유지하여 OS 리사이즈 간섭 방지
      state.overlayWindow.setBounds({
        x: dragStart.winX + (pos.x - dragStart.mouseX),
        y: dragStart.winY + (pos.y - dragStart.mouseY),
        width: dragStart.winW,
        height: dragStart.winH
      });
    });
    ipcMain.on('overlay-drag-end', () => {
      dragStart = null;
    });

    // 모드 전환 핸들러
    ipcMain.on('switch-mode', async (event, newMode) => {
      await FileManager.switchMode(newMode);
    });

    // 뷰모드 전환 핸들러
    ipcMain.on('update-view-mode', async (event, newViewMode) => {
      state.updateViewMode(newViewMode);
      // viewMode 변경을 즉시 설정 파일에 저장
      await FileManager.saveConfig();
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('view-mode-update', newViewMode);
        }
      });
    });

    ipcMain.handle('show-dialog', async (event, dialogType) => {
      return await DialogManager.show(dialogType);
    });

    // 윈도우 관련 핸들러
    ipcMain.on('toggle-overlay', () => this.handleToggleOverlay());
    ipcMain.on('toggle-pause', () => {
      if (state.globalState.isPaused) {
        this.handleResume();
      } else {
        this.handlePause();
      }
    });
    ipcMain.on('toggle-resume', () => this.handleResume());

    // 커스텀 타이틀바 윈도우 컨트롤 핸들러
    ipcMain.on('window-minimize', () => {
      state.mainWindow?.minimize();
    });
    ipcMain.on('window-maximize', () => {
      if (state.mainWindow?.isMaximized()) {
        state.mainWindow.unmaximize();
      } else {
        state.mainWindow?.maximize();
      }
    });
    ipcMain.on('window-close', () => {
      state.mainWindow?.close();
    });
    ipcMain.handle('window-is-maximized', () => {
      return state.mainWindow?.isMaximized() ?? false;
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
          viewMode: config.viewMode,
          pluginServer: config.pluginServer ?? false,
          pluginConnected: config.pluginConnected ?? false,
          pluginModeActive: state._photoshopModeActive
        };
      } catch (error) {
        console.error('[Main] 설정 로드 실패:', error);
        return null;
      }
    });
    
    ipcMain.handle('apply-settings', (_, settings) => this.handleApplySettings(settings));
    ipcMain.handle('clear-log-files', (_, filePath = null) => FileManager.clearLogs(filePath));
    ipcMain.handle('lock-file', (_, filePath) => FileManager.lockFile(filePath));

    // 테마 관련 핸들러
    ipcMain.handle('get-current-theme', () => {
      return ThemeManager.getCurrentTheme();
    });

    // 테마 변수 중계 (메인 윈도우 → 오버레이 윈도우)
    ipcMain.on('update-theme-variables', (event, variables) => {
      state._lastThemeVariables = variables;
      if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
        state.overlayWindow.webContents.send('update-theme-variables', variables);
      }
    });

    // --primary-color-filter 생성
    ipcMain.handle('generate-css-filter', async (event, color, options) => {
      return ThemeManager.generateCSSfilter(color, options);
    });

    // 디버그 콘솔 핸들러
    ipcMain.on('show-debug-console', () => this.handleShowDebugConsole());

    // 플러그인 서버 핸들러
    ipcMain.handle('toggle-plugin-server', async (_, enabled) => {
      if (enabled) {
        const result = await PluginBridge.start();
        return { running: result };
      } else {
        PluginBridge.stop();
        return { running: false };
      }
    });

    ipcMain.handle('get-plugin-status', () => {
      return {
        running: PluginBridge.isRunning(),
        plugins: PluginBridge.getConnectedPlugins()
      };
    });

    // 오버레이에서 플러그인 연결 토글
    ipcMain.on('toggle-plugin-connection', async () => {
      const current = state.config.pluginConnected;
      const newVal = !current;
      await this.handleApplySettings({ pluginConnected: newVal });
    });

    // ─── 텍스트 매크로 저장/로드 ───
    ipcMain.handle('load-text-macros', async () => {
      return await FileManager.loadTextMacros();
    });

    ipcMain.on('save-text-macros', async (event, macros) => {
      await FileManager.saveTextMacros(macros);
      // 모든 윈도우에 업데이트 알림
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('text-macros-updated', macros);
        }
      });
    });

    // ─── 텍스트 스타일 저장/로드 ───
    ipcMain.handle('load-text-styles', async () => {
      return await FileManager.loadTextStyles();
    });

    ipcMain.on('save-text-styles', async (event, styles) => {
      await FileManager.saveTextStyles(styles);
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('text-styles-updated', styles);
        }
      });
    });

    // ─── 스타일 액션 매핑 (슬롯 → PS 액션) ───
    ipcMain.handle('load-style-actions', async () => {
      const mapping = await FileManager.loadStyleActions();
      PluginBridge.setStyleActions(mapping);
      return mapping;
    });

    ipcMain.on('save-style-actions', async (event, mapping) => {
      await FileManager.saveStyleActions(mapping);
      PluginBridge.setStyleActions(mapping);
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('style-actions-updated', mapping);
        }
      });
    });

    // PS 액션 목록 조회 (캐시)
    ipcMain.handle('get-ps-action-list', () => {
      return PluginBridge.getActionList();
    });

    // PS 액션 목록 새로고침 요청
    ipcMain.on('refresh-ps-action-list', () => {
      PluginBridge.requestActionList();
    });

    // ─── 슬롯 순서 ───
    ipcMain.handle('load-slot-order', async () => {
      return await FileManager.loadSlotOrder();
    });

    ipcMain.on('save-slot-order', async (event, order) => {
      await FileManager.saveSlotOrder(order);
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('slot-order-updated', order);
        }
      });
    });

    // ─── 이미지 파일 열기 (이미지 뷰어) ───
    ipcMain.handle('open-image-files', async () => {
      const result = await dialog.showOpenDialog(state.mainWindow, {
        properties: ['openFile', 'multiSelections'],
        title: '이미지 파일 선택',
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'psd'] }
        ]
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths;
    });

    // ─── 이미지 뷰어: 창 확장 요청 ───
    ipcMain.on('expand-window-for-image', (_, neededWidth) => {
      WindowManager.expandWindowForImage(neededWidth);
    });

    // ─── 블랙포인트 다이얼로그 ───
    ipcMain.handle('show-black-point-dialog', async (_, blackPoint) => {
      const result = await dialog.showMessageBox(state.mainWindow, {
        type: 'info',
        title: '블랙포인트 검출',
        message: `이미지의 블랙포인트가 순수 블랙(#000000)이 아닙니다.\n검출값: ${blackPoint.hex}`,
        detail: '처리 방법을 선택하세요:\n\n• 포토샵 색상 적용: 텍스트 삽입 시 해당 색상을 사용합니다.\n• 이미지 레벨 조정: 이미지의 색상을 보정하여 순수 블랙에 맞춥니다.',
        buttons: ['포토샵 색상 적용', '이미지 레벨 조정', '건너뛰기'],
        defaultId: 2,
        cancelId: 2,
        noLink: true
      });
      return result.response;
    });

    // ─── 블랙포인트 색상 설정/해제 (PluginBridge 연동) ───
    ipcMain.on('set-black-point-color', (_, hexColor) => {
      state._blackPointColor = hexColor;
    });

    ipcMain.on('clear-black-point-color', () => {
      state._blackPointColor = null;
    });

    // ─── .para 메타데이터 관련 핸들러 ───
    ipcMain.handle('get-para-metadata', () => {
      return state._paraMetadata || null;
    });

    ipcMain.handle('update-para-metadata', async (_, metadata) => {
      if (metadata) {
        // 기존 메타데이터가 없으면 기본값 생성
        if (!state._paraMetadata) {
          const { ParaFileFormat } = require('../../utils/ParaFileFormat');
          state._paraMetadata = ParaFileFormat.createDefaultMetadata();
        }

        // integral 병합
        if (metadata.integral) {
          state._paraMetadata.integral = { ...state._paraMetadata.integral, ...metadata.integral };
        }

        // pages 변환 및 병합
        if (metadata.pages) {
          if (!(state._paraMetadata.pages instanceof Map)) {
            state._paraMetadata.pages = new Map();
          }
          const entries = metadata.pages instanceof Map
            ? metadata.pages.entries()
            : Object.entries(metadata.pages);
          for (const [key, value] of entries) {
            state._paraMetadata.pages.set(Number(key), value);
          }
        }

        // paragraphs 교체 (있는 경우만)
        if (metadata.paragraphs) {
          state._paraMetadata.paragraphs = metadata.paragraphs;
        }
      }
      return true;
    });

    ipcMain.handle('set-page-blackpoint', async (_, { pageNumber, blackpoint }) => {
      if (!state._paraMetadata) {
        const { ParaFileFormat } = require('../../utils/ParaFileFormat');
        state._paraMetadata = ParaFileFormat.createDefaultMetadata();
      }
      if (!state._paraMetadata.pages) {
        state._paraMetadata.pages = new Map();
      }
      if (!(state._paraMetadata.pages instanceof Map)) {
        state._paraMetadata.pages = new Map(Object.entries(state._paraMetadata.pages).map(([k, v]) => [Number(k), v]));
      }
      if (!state._paraMetadata.pages.has(pageNumber)) {
        state._paraMetadata.pages.set(pageNumber, { blackpoint: '#000000' });
      }
      state._paraMetadata.pages.get(pageNumber).blackpoint = blackpoint;
      return true;
    });

    ipcMain.handle('set-paragraph-meta', async (_, { paragraphIndex, key, value }) => {
      if (!state._paraMetadata) {
        const { ParaFileFormat } = require('../../utils/ParaFileFormat');
        state._paraMetadata = ParaFileFormat.createDefaultMetadata();
      }
      if (!state._paraMetadata.paragraphs[paragraphIndex]) {
        state._paraMetadata.paragraphs[paragraphIndex] = { align: 'center', style: 'plain' };
      }
      state._paraMetadata.paragraphs[paragraphIndex][key] = value;
      return true;
    });

    handlersInitialized = true;

    // 저장된 스타일 액션 매핑을 PluginBridge에 로드
    FileManager.loadStyleActions().then(mapping => {
      PluginBridge.setStyleActions(mapping);
    }).catch(() => {});
  },

  handleEditorEvent(type, data) {
    try {
      switch(type) {
        case 'request':
          BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
              window.webContents.send('get-editor-info', { type: 'request' });
            }
          });
          break;
  
        case 'response':
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
        const { THEME } = require('../constants');
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
      
      const currentConfig = state.config;
      const textProcessState = state.textProcess;
  
      // 에디터 모드일 때는 viewMode 변경 무시
      const newViewMode = textProcessState.programStatus === ProgramStatus.EDIT
        ? currentConfig.viewMode
        : settings.viewMode;
  
      const newConfig = {
        ...currentConfig,
        theme: {
          mode: settings.theme?.mode ?? currentConfig.theme.mode,
          accentColor: settings.theme?.accentColor ?? currentConfig.theme.accentColor
        },
        language: settings.language ?? currentConfig.language,
        overlay: {
          ...currentConfig.overlay,
          windowOpacity: settings.windowOpacity ?? currentConfig.overlay.windowOpacity,
          contentOpacity: settings.contentOpacity ?? currentConfig.overlay.contentOpacity,
          overlayFixed: settings.overlayFixed ?? currentConfig.overlay.overlayFixed,
          loadLastOverlayBounds: settings.loadLastOverlayBounds ?? currentConfig.overlay.loadLastOverlayBounds
        },
        processMode: settings.processMode ?? currentConfig.processMode,
        viewMode: newViewMode ?? currentConfig.viewMode,
        pluginServer: settings.pluginServer ?? currentConfig.pluginServer,
        pluginConnected: settings.pluginConnected ?? currentConfig.pluginConnected
      };
  
      state.loadConfig(newConfig);

      // 플러그인 서버 상태 변경 시 시작/중지
      // pluginServer(설정 토글) AND pluginConnected(연결 토글) 모두 켜져있을 때만 서버 시작
      const shouldRun = newConfig.pluginServer && newConfig.pluginConnected;
      if (shouldRun && !PluginBridge.isRunning()) {
        await PluginBridge.start();
      } else if (!shouldRun && PluginBridge.isRunning()) {
        PluginBridge.stop();
      }

      // 플러그인 관련 설정이 변경되었으면 모든 윈도우에 알림
      if (settings.pluginServer !== undefined || settings.pluginConnected !== undefined) {
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach(window => {
          if (!window.isDestroyed()) {
            window.webContents.send('plugin-settings-changed', {
              pluginServer: newConfig.pluginServer,
              pluginConnected: newConfig.pluginConnected
            });
          }
        });
      }

      // 오버레이 창 설정 적용
      if (state.overlayWindow) {
        state.overlayWindow.setOpacity(newConfig.overlay.windowOpacity);
        state.overlayWindow.setIgnoreMouseEvents(newConfig.overlay.overlayFixed);
        state.overlayWindow.webContents.send('update-content-opacity', newConfig.overlay.contentOpacity);
      }
  
      // ThemeManager를 통해 테마 업데이트 브로드캐스트 
      ThemeManager.broadcastTheme();
      
      await FileManager.saveConfig();
      return true;
    } catch (error) {
      console.error('[Main] 설정 적용 중 오류:', error);
      return false;
    }
  },

  // 네비게이션 관련 메서드
  handleMove(direction, moveType = 'paragraph') {
    const textState = state.textProcess;
    const isNext = direction === 'next';
    let newPosition;
  
    if (moveType === 'page') {
      const currentPage = textState.paragraphsMetadata[textState.currentParagraph]?.pageNumber;
      
      if (currentPage != null) {
        const targetPage = isNext ? currentPage + 1 : currentPage - 1;
        
        let searchPage = targetPage;
        let found = false;
        
        const pageNumbers = textState.paragraphsMetadata
          .filter(meta => meta?.pageNumber != null)
          .map(meta => meta.pageNumber);

        if (pageNumbers.length === 0) {
          // 페이지 정보가 전혀 없으면 단락 단위로 fallback
          newPosition = isNext ?
            textState.currentParagraph + 1 :
            textState.currentParagraph - 1;
        } else {
          const lastPage = Math.max(...pageNumbers);
          const firstPage = Math.min(...pageNumbers);

          while (!found) {
            newPosition = textState.paragraphsMetadata.findIndex((meta, idx) => {
              return meta?.pageNumber === searchPage && 
                     textState.paragraphs[idx]?.trim().length > 0;
            });
            
            if (newPosition !== -1) {
              found = true;
            } else {
              searchPage = isNext ? searchPage + 1 : searchPage - 1;
                
              if (searchPage > lastPage || searchPage < firstPage) {
                newPosition = isNext ? 
                  textState.paragraphs.length - 1 :
                  0;
                break;
              }
            }
          }
        }
      } else {
        // 현재 단락에 페이지 정보가 없으면 단락 단위로 fallback
        newPosition = isNext ?
          textState.currentParagraph + 1 :
          textState.currentParagraph - 1;
      }
    } else {
      newPosition = isNext ? 
        textState.currentParagraph + 1 : 
        textState.currentParagraph - 1;
    }
  
    const canMove = newPosition >= 0 && newPosition < textState.paragraphs.length;
    
    if (canMove) {
      state.updateCurrentParagraph(newPosition);

      state.mainWindow.webContents.send('clear-search');
      
      const currentContent = textState.paragraphs[newPosition];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent);
      }
  
      updateState({
        ...state.textProcess,
        isPaused: false,
        programStatus: ProgramStatus.PROCESS,
        timestamp: Date.now()
      });
    }
  },

  handleMoveToPosition(position) {
    if (position >= 0 && position < state.textProcess.paragraphs.length) {
      // 1. 현재 단락으로 이동
      state.updateCurrentParagraph(position);
      
      // 2. 상태 업데이트 (isPaused + programStatus 포함)
      updateState({
        ...state.textProcess,
        isPaused: false,
        programStatus: ProgramStatus.PROCESS,
        timestamp: Date.now()
      });
  
      // 3. 현재 단락 복사 및 로깅
      const textState = state.textProcess;
      const currentContent = textState.paragraphs[position];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent);
      }
    }
  },

  // 윈도우 관련 메서드
  async handleToggleOverlay() {
    if (!state.overlayWindow) return;
  
    const newVisibility = !state.globalState.isOverlayVisible;
    
    state.updateOverlayVisibility(newVisibility);

    // 1. 사용자의 직접 토글 동작에서만 설정 저장
    await FileManager.saveConfig();
    
    // 2. 상태 업데이트
    await updateState({ 
      isOverlayVisible: newVisibility,
      timestamp: Date.now()
    });
  },

  handlePause() {
    if (!state.globalState.isPaused) {
      updateState({ isPaused: true, programStatus: ProgramStatus.PAUSE });
    }
  },
  
  handleResume() {
      if (state.globalState.programStatus !== ProgramStatus.PROCESS &&
          state.globalState.programStatus !== ProgramStatus.PAUSE) return;
      if (!state.globalState.isPaused && state.globalState.programStatus === ProgramStatus.PROCESS) return;

      updateState({ isPaused: false, programStatus: ProgramStatus.PROCESS });
      const textState = state.textProcess;
      const currentContent = textState.paragraphs[textState.currentParagraph];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent);
      }
  },

  // 디버그 콘솔 메서드
  handleShowDebugConsole() {
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.focus();
      // 포커스할 때도 최신 로그 전송
      const logs = state.logs;
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
      const logs = state.logs || [];
      logWindow.webContents.send('update-logs', logs);
    });
  
    // 로그 변경 구독 설정
    const logHandler = () => {
      if (logWindow && !logWindow.isDestroyed()) {
        const logs = state.logs;
        logWindow.webContents.send('update-logs', logs);
      }
    };
    state.on('log-changed', logHandler);
  
    // React 라우팅
    const consoleUrl = isDev
      ? 'http://localhost:5173/#/console'
      : url.format({
          pathname: path.join(__dirname, '../../dist/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/console'
        });
  
    logWindow.loadURL(consoleUrl);
  
    // 구독 해제 추가
    logWindow.on('closed', () => {
      state.off('log-changed', logHandler);
      logWindow = null;
    });
  },

};

module.exports = IPCManager;
