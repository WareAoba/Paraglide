// WindowManager.js — BrowserWindow 생성/관리
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const { ProgramStatus, isDev, FILE_PATHS } = require('../constants');
const { state } = require('../state');
const ThemeManager = require('./ThemeManager');
const DialogManager = require('./DialogManager');

// ─── 전체화면 감지 API (네이티브 FFI) ───
let _checkFullscreen = null;
try {
  const koffi = require('koffi');
  if (process.platform === 'win32') {
    const shell32 = koffi.load('shell32.dll');
    const SHQueryUserNotificationState = shell32.func('int __stdcall SHQueryUserNotificationState(_Out_ int *)');
    _checkFullscreen = () => {
      const out = [0];
      SHQueryUserNotificationState(out);
      // QUNS_BUSY=2, QUNS_RUNNING_D3D_FULL_SCREEN=3, QUNS_PRESENTATION_MODE=4
      return out[0] >= 2 && out[0] <= 4;
    };
  } else if (process.platform === 'darwin') {
    const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const CGMainDisplayID = cg.func('uint32_t CGMainDisplayID()');
    const CGDisplayIsCaptured = cg.func('bool CGDisplayIsCaptured(uint32_t)');
    const mainDisplay = CGMainDisplayID();
    _checkFullscreen = () => CGDisplayIsCaptured(mainDisplay);
  }
} catch (err) {
  console.warn('[WindowManager] 전체화면 감지 API 초기화 실패 — 비활성화:', err.message);
}

const WindowManager = {
  // ─── 전체화면 감지 상태 ───
  _fsTimer: null,
  _fsIsFullscreen: false,
  _fsOverlayHiddenByFullscreen: false,
  _getThemeBackgroundColor() {
    const mode = ThemeManager.getEffectiveMode();
    return mode === 'dark' ? '#181818' : '#F2F3F7';
  },

  createMainWindow() {
    state.mainWindow = new BrowserWindow({
      width: 600,
      height: 660,
      minWidth: 600,
      minHeight: 660,
      show: false,
      frame: false,
      title: 'Paraglide',
      icon: FILE_PATHS.icon,
      backgroundColor: this._getThemeBackgroundColor(),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      }
    });

    state.mainWindow.setMenu(null);

    // Windows에서 minWidth/minHeight가 적용되지 않는 Electron 버그 대응
    state.mainWindow.on('will-resize', (event, newBounds) => {
      if (newBounds.width < 400 || newBounds.height < 660) {
        event.preventDefault();
      }
    });

    // beforeunload 이벤트 핸들러 추가
    state.mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        state.mainWindow.webContents.toggleDevTools();
      } else if (input.key === 'Alt' && input.type === 'keyDown') {
        event.preventDefault();
      }
    });

    let isClosing = false;
    state.mainWindow.on('close', async (e) => {
      if (isClosing) return;
      
      e.preventDefault();
      const currentState = state.textProcess;
      
      try {
        if (currentState.programStatus === ProgramStatus.PROCESS || 
            currentState.programStatus === ProgramStatus.PAUSE) {
          // 프로세스/일시정지 중 종료 경고
          const workingChoice = await DialogManager.show(DialogManager.DIALOGS.EXIT_CONFIRM, state.mainWindow);
          if (workingChoice === 1) return;
        } else if (currentState.programStatus === ProgramStatus.EDIT) {
          // 에디터 모드: 미저장 시 경고 한 번만 표시
          state.mainWindow.webContents.send('editor-is-saved-check');
          const isEditorSaved = await new Promise(resolve => {
            const timeout = setTimeout(() => {
              ipcMain.removeAllListeners('editor-is-saved-result');
              resolve(true); // 타임아웃 시 저장된 것으로 간주하여 종료 허용
            }, 3000);
            ipcMain.once('editor-is-saved-result', (_, isSaved) => {
              clearTimeout(timeout);
              resolve(isSaved);
            });
          });

          if (!isEditorSaved) {
            const saveChoice = await DialogManager.show(DialogManager.DIALOGS.UNSAVED_CHANGES, state.mainWindow);
            if (saveChoice === 1) return;
          }
        }
        
        isClosing = true;
        // Lazy require to avoid circular dependency
        const ApplicationManager = require('./ApplicationManager');
        ApplicationManager.exit();
      } catch (error) {
        console.error('종료 처리 중 오류:', error);
        isClosing = true;
        const ApplicationManager = require('./ApplicationManager');
        ApplicationManager.exit();
      }
    });

    const startUrl = isDev
      ? 'http://localhost:5173' // Vite 기본 포트
      : url.format({
        pathname: path.join(process.resourcesPath, 'dist', 'index.html'),
        protocol: 'file:',
        slashes: true
    });

    state.mainWindow.loadURL(startUrl);
    this.setupMainWindowEvents();
  },

  createOverlayWindow() {
    const config = state.config;
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
      state.setOverlayBounds(windowBounds);
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
  
    state.overlayWindow = new BrowserWindow(windowOptions);
    
    // 2. 오버레이 설정 적용
    state.overlayWindow.setIgnoreMouseEvents(config.overlay.overlayFixed);

    state.overlayWindow.webContents.on('did-finish-load', () => {
      state.overlayWindow.webContents.send('update-content-opacity', config.overlay.contentOpacity);
      // 캐시된 테마 변수 전달
      if (state._lastThemeVariables) {
        state.overlayWindow.webContents.send('update-theme-variables', state._lastThemeVariables);
      }
    });
  
    const overlayUrl = isDev
      ? 'http://localhost:5173/#/overlay'
      : url.format({
          pathname: path.join(process.resourcesPath, 'dist', 'index.html'),
          protocol: 'file:',
          slashes: true,
          hash: '/overlay'
        });
  
    state.overlayWindow.loadURL(overlayUrl);
    this.setupOverlayWindowEvents();
  },

  setupMainWindowEvents() {
    state.mainWindow.once('ready-to-show', () => {
      state.mainWindow.showInactive();
    });

    // 최대화/복원 상태 변경 시 렌더러에 알림
    state.mainWindow.on('maximize', () => {
      state.mainWindow.webContents.send('window-maximized', true);
    });
    state.mainWindow.on('unmaximize', () => {
      state.mainWindow.webContents.send('window-maximized', false);
    });
  
    state.mainWindow.on('closed', () => {
      // Lazy require to avoid circular dependency
      const ApplicationManager = require('./ApplicationManager');
      ApplicationManager.exit();
    });
  },

  setupOverlayWindowEvents() {
    state.overlayWindow.on('move', this.saveOverlayBounds.bind(this));
    state.overlayWindow.on('resize', this.saveOverlayBounds.bind(this));
    state.overlayWindow.on('close', (e) => {
      e.preventDefault();
      state.overlayWindow.hide();
    });

    // 오버레이 렌더러 크래시 복구
    state.overlayWindow.webContents.on('render-process-gone', (_, details) => {
      console.error('[WindowManager] 오버레이 렌더러 프로세스 종료:', details.reason);
      this._recreateOverlay();
    });
    state.overlayWindow.on('unresponsive', () => {
      console.warn('[WindowManager] 오버레이 창 응답 없음 — 재생성');
      this._recreateOverlay();
    });
  },

  _recreateOverlay() {
    try {
      if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
        state.overlayWindow.destroy();
      }
      state.overlayWindow = null;
      this.createOverlayWindow();

      const shouldShow = (state._globalState.programStatus === ProgramStatus.PROCESS ||
                          state._globalState.programStatus === ProgramStatus.PAUSE) &&
                        state._globalState.isOverlayVisible &&
                        !this._fsIsFullscreen;
      if (shouldShow) {
        state.overlayWindow.once('ready-to-show', () => {
          state.overlayWindow.showInactive();
          this.updateWindowContent(state.overlayWindow, 'content-update');
        });
      }
      console.log('[WindowManager] 오버레이 재생성 완료');
    } catch (err) {
      console.error('[WindowManager] 오버레이 재생성 실패:', err);
    }
  },

  // ─── 전체화면 감지 (네이티브 FFI — Windows/macOS) ───
  startFullscreenDetection() {
    if (this._fsTimer || !_checkFullscreen) return;

    this._fsTimer = setInterval(() => {
      try {
        const isFullscreen = _checkFullscreen();
        if (isFullscreen !== this._fsIsFullscreen) {
          this._fsIsFullscreen = isFullscreen;
          this._onFullscreenChanged(isFullscreen);
        }
      } catch (err) {
        console.error('[WindowManager] 전체화면 감지 오류:', err.message);
        this.stopFullscreenDetection();
      }
    }, 1000);

    console.log('[WindowManager] 전체화면 감지 시작');
  },

  stopFullscreenDetection() {
    if (this._fsTimer) {
      clearInterval(this._fsTimer);
      this._fsTimer = null;
    }
    this._fsIsFullscreen = false;
    this._fsOverlayHiddenByFullscreen = false;
  },

  _onFullscreenChanged(isFullscreen) {
    if (!state.overlayWindow || state.overlayWindow.isDestroyed()) return;

    if (isFullscreen) {
      if (state.overlayWindow.isVisible()) {
        state.overlayWindow.hide();
        this._fsOverlayHiddenByFullscreen = true;
        console.log('[WindowManager] 전체화면 감지 — 오버레이 숨김');
      }
    } else {
      if (this._fsOverlayHiddenByFullscreen) {
        this._fsOverlayHiddenByFullscreen = false;
        const shouldShow = (state._globalState.programStatus === ProgramStatus.PROCESS ||
                            state._globalState.programStatus === ProgramStatus.PAUSE) &&
                          state._globalState.isOverlayVisible;
        if (shouldShow) {
          state.overlayWindow.showInactive();
          this.updateWindowContent(state.overlayWindow, 'content-update');
          console.log('[WindowManager] 전체화면 해제 — 오버레이 복원');
        }
      }
    }
  },

  async saveOverlayBounds() {
    if (!state.overlayWindow) return;
    const bounds = state.overlayWindow.getBounds();
    
    state.setOverlayBounds(bounds);
    // Lazy require to avoid circular dependency
    const FileManager = require('./FileManager');
    await FileManager.saveConfig();
  },

  expandWindowForImage(targetWidth) {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

    const bounds = state.mainWindow.getBounds();
    if (targetWidth <= bounds.width) return;

    const display = screen.getDisplayMatching(bounds);
    const workArea = display.workArea;
    const maxWidth = workArea.x + workArea.width - bounds.x;
    const finalWidth = Math.min(targetWidth, maxWidth);
    if (finalWidth <= bounds.width) return;

    state.mainWindow.setBounds({ ...bounds, width: finalWidth });
  },

  async updateWindowContent(window, eventName) {
    if (!window || window.isDestroyed()) return;

    const textState = state.textProcess;
    if (!textState || !textState.paragraphs) return;
  
    const currentParagraph = textState.currentParagraph || 0;
  
    if (window === state.mainWindow) {
      const pageInfo = textState.paragraphsMetadata[currentParagraph]?.pageInfo;
      const display = pageInfo ? {
        text: pageInfo.end !== pageInfo.start ? 
          `${pageInfo.start}-${pageInfo.end}` :
          `${pageInfo.start}`,
        isRange: pageInfo.end !== pageInfo.start
      } : null;
    
      window.webContents.send('state-update', {
        ...state.globalState,
        paragraphs: textState.paragraphs,
        currentParagraph: textState.currentParagraph,
        paragraphsMetadata: textState.paragraphsMetadata,
        currentNumber: { ...pageInfo, display },
        theme: ThemeManager.getCurrentTheme(),
      });
      
    } else if (window === state.overlayWindow) {
      const startIdx = Math.max(0, currentParagraph - 5);
      const endIdx = Math.min(textState.paragraphs.length, currentParagraph + 6);
      const pageInfo = textState.paragraphsMetadata[currentParagraph]?.pageInfo;
      const display = pageInfo ? {
        text: pageInfo.end !== pageInfo.start ? 
          `${pageInfo.start}-${pageInfo.end}` :
          pageInfo.start,
        isRange: pageInfo.end !== pageInfo.start
      } : null;
    
      window.webContents.send('paragraphs-updated', {
        previous: textState.paragraphs.slice(startIdx, currentParagraph).map((text, idx) => ({
          text: String(text),
          paragraph: startIdx + idx,
          metadata: textState.paragraphsMetadata[startIdx + idx]
        })),
        current: textState.paragraphs[currentParagraph]?.toString() || '',
        next: textState.paragraphs.slice(currentParagraph + 1, endIdx).map((text, idx) => ({
          text: String(text),
          paragraph: currentParagraph + 1 + idx,
          metadata: textState.paragraphsMetadata[currentParagraph + 1 + idx]
        })),
        currentParagraph: currentParagraph,
        currentMetadata: textState.paragraphsMetadata[currentParagraph],
        currentNumber: { ...pageInfo, display },
        isPaused: state.globalState.isPaused,
        pluginModeActive: state._photoshopModeActive,
        pluginServer: state.config.pluginServer,
        theme: {
          mode: ThemeManager.getEffectiveMode(),
          accentColor: state.config.theme.accentColor
        },
        processMode: textState.processMode,
        totalParagraphs: textState.paragraphs.length
      });
    }
  }
};

module.exports = WindowManager;
