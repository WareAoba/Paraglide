// IPCManager.js — IPC 핸들러 등록
const { ipcMain, dialog, clipboard, shell, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs').promises;
const { TextProcessUtils } = require('../../store/utils/TextProcessUtils');
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

    // 오버레이 수동 드래그 핸들러
    let dragStart = null;
    ipcMain.on('overlay-drag-start', (_, pos) => {
      if (!state.overlayWindow) return;
      const bounds = state.overlayWindow.getBounds();
      dragStart = { mouseX: pos.x, mouseY: pos.y, winX: bounds.x, winY: bounds.y };
    });
    ipcMain.on('overlay-drag-move', (_, pos) => {
      if (!state.overlayWindow || !dragStart) return;
      state.overlayWindow.setPosition(
        dragStart.winX + (pos.x - dragStart.mouseX),
        dragStart.winY + (pos.y - dragStart.mouseY)
      );
    });

    // 모드 전환 핸들러
    ipcMain.on('switch-mode', async (event, newMode) => {
      await FileManager.switchMode(newMode);
      event.reply('mode-switched', newMode);
    });

    // 뷰모드 전환 핸들러
    ipcMain.on('update-view-mode', async (event, newViewMode) => {
      state.updateViewMode(newViewMode);
      // viewMode 변경을 즉시 설정 파일에 저장
      await FileManager.saveConfig({ viewMode: newViewMode });
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
          pluginConnected: config.pluginConnected ?? false
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

    // 포토샵 플러그인 자동 설치 핸들러
    ipcMain.handle('ensure-photoshop-plugin', async () => {
      return this._ensurePhotoshopPlugin();
    });

    // 플러그인 설정 변경 알림 (Settings → MainComponent)
    ipcMain.on('notify-plugin-settings', (event, data) => {
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('plugin-settings-changed', data);
        }
      });
    });

    // 오버레이에서 플러그인 연결 토글
    ipcMain.on('toggle-plugin-connection', async () => {
      const current = state.config.pluginConnected;
      const newVal = !current;
      await this.handleApplySettings({ pluginConnected: newVal });
      // 모든 윈도우에 변경 알림
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('plugin-settings-changed', { pluginConnected: newVal });
        }
      });
    });

    handlersInitialized = true;
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
      const newViewMode = (textProcessState.programStatus === ProgramStatus.PROCESS ||
                          textProcessState.programStatus === ProgramStatus.PAUSE) && 
                         textProcessState.processMode === 'editor' ? 
                         'editor' : 
                         settings.viewMode;
  
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
      
      // 오버레이 창 설정 적용
      if (state.overlayWindow) {
        state.overlayWindow.setOpacity(newConfig.overlay.windowOpacity);
        state.overlayWindow.setIgnoreMouseEvents(newConfig.overlay.overlayFixed);
        state.overlayWindow.webContents.send('update-content-opacity', newConfig.overlay.contentOpacity);
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
  handleMove(direction, moveType = 'paragraph') {
    const textState = state.textProcess;
    const isNext = direction === 'next';
    let newPosition;
  
    if (moveType === 'page') {
      const currentPage = textState.paragraphsMetadata[textState.currentParagraph]?.pageNumber;
      
      if (currentPage !== null) {
        const targetPage = isNext ? currentPage + 1 : currentPage - 1;
        
        let searchPage = targetPage;
        let found = false;
        
        while (!found) {
          newPosition = textState.paragraphsMetadata.findIndex(meta => {
            return meta?.pageNumber === searchPage && 
                   textState.paragraphs[textState.paragraphsMetadata.indexOf(meta)]?.trim().length > 0;
          });
          
          if (newPosition !== -1) {
            found = true;
          } else {
            searchPage = isNext ? searchPage + 1 : searchPage - 1;
            
            const lastPage = Math.max(...textState.paragraphsMetadata
              .filter(meta => meta?.pageNumber !== null)
              .map(meta => meta.pageNumber));
            const firstPage = Math.min(...textState.paragraphsMetadata
              .filter(meta => meta?.pageNumber !== null)
              .map(meta => meta.pageNumber));
              
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
      newPosition = isNext ? 
        textState.currentParagraph + 1 : 
        textState.currentParagraph - 1;
    }
  
    const canMove = newPosition >= 0 && newPosition < textState.paragraphs.length;
    
    if (canMove) {
      this.handleResume();
      state.updateCurrentParagraph(newPosition);

      state.mainWindow.webContents.send('clear-search');
      
      const currentContent = textState.paragraphs[newPosition];
      if (currentContent) {
        ContentManager.copyAndLogDebouncer(currentContent);
      }
  
      updateState({
        ...state.textProcess,
        isPaused: false,
        timestamp: Date.now()
      }, 'move');
    }
  },

  handleMoveToPosition(position) {
    if (position >= 0 && position < state.textProcess.paragraphs.length) {
      // 1. 현재 단락으로 이동
      state.updateCurrentParagraph(position);
      
      // 2. 일시정지 해제 + 프로세스 상태 복원
      state.globalState.isPaused = false;
      
      // 3. 상태 업데이트 (isPaused + programStatus 포함)
      updateState({
        ...state.textProcess,
        isPaused: false,
        programStatus: ProgramStatus.PROCESS,
        timestamp: Date.now()
      });
  
      // 4. 현재 단락 복사 및 로깅
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
    const config = state.config;
    await FileManager.saveConfig(config);
    
    // 2. 상태 업데이트
    await updateState({ 
      isOverlayVisible: newVisibility,
      timestamp: Date.now()
    });
  },

  handlePause() {
    if (!state.globalState.isPaused) {
      state.globalState.isPaused = true;
      updateState({ isPaused: true, programStatus: ProgramStatus.PAUSE });
    }
  },
  
  handleResume() {
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

  // ═══════════════ 포토샵 플러그인 자동 설치 ═══════════════

  /**
   * 포토샵 UXP 플러그인이 설치되어 있는지 확인하고, 없으면 자동 복사
   * 
   * UXP 플러그인 경로:
   *   Windows: %APPDATA%/Adobe/UXP/PluginsStorage/PHSP/<version>/Internal/com.paraglide.connector/
   *   macOS:   ~/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP/<version>/Internal/com.paraglide.connector/
   * 
   * 공용 개발 플러그인 경로 (버전 무관, 더 안정적):
   *   Windows: %APPDATA%/Adobe/UXP/Develop/com.paraglide.connector/
   *   macOS:   ~/Library/Application Support/Adobe/UXP/Develop/com.paraglide.connector/
   */
  async _ensurePhotoshopPlugin() {
    try {
      const pluginId = 'd6a4ab9b';
      const targetDir = this._getUXPDevelopPath(pluginId);

      if (!targetDir) {
        console.warn('[PluginInstall] 지원되지 않는 플랫폼');
        return { error: 'unsupported_platform' };
      }

      // 이미 설치되어 있는지 확인
      const manifestPath = path.join(targetDir, 'manifest.json');
      try {
        await fs.access(manifestPath);
        console.log('[PluginInstall] 플러그인이 이미 설치됨:', targetDir);
        return { alreadyInstalled: true };
      } catch {
        // 설치되지 않은 상태 — 계속 진행
      }

      // 소스 플러그인 경로 (앱 내 plugins/photoshop/)
      const { app } = require('electron');
      const sourcePath = isDev
        ? path.join(__dirname, '../../../plugins/photoshop')
        : path.join(process.resourcesPath, 'plugins/photoshop');

      // 소스 존재 확인
      try {
        await fs.access(sourcePath);
      } catch {
        console.error('[PluginInstall] 소스 플러그인 경로 없음:', sourcePath);
        return { error: 'source_not_found' };
      }

      // 대상 디렉토리 생성
      await fs.mkdir(targetDir, { recursive: true });

      // 파일 복사 (재귀)
      await this._copyDir(sourcePath, targetDir);

      console.log('[PluginInstall] 플러그인 설치 완료:', targetDir);
      return { installed: true, path: targetDir };
    } catch (error) {
      console.error('[PluginInstall] 자동 설치 실패:', error);
      return { error: error.message };
    }
  },

  _getUXPDevelopPath(pluginId) {
    const { app } = require('electron');
    if (process.platform === 'win32') {
      return path.join(app.getPath('appData'), 'Adobe/UXP/Develop', pluginId);
    } else if (process.platform === 'darwin') {
      return path.join(app.getPath('home'), 'Library/Application Support/Adobe/UXP/Develop', pluginId);
    }
    return null;
  },

  async _copyDir(src, dest) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this._copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
};

module.exports = IPCManager;
