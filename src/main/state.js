// state.js — AppState: 메인 프로세스 상태 관리 (Redux 대체)
const { EventEmitter } = require('events');
const { ipcMain } = require('electron');
const { ProgramStatus, THEME, DEFAULT_PROCESS_MODE } = require('./constants');

/**
 * AppState — 메인 프로세스의 모든 상태를 관리하는 싱글톤 EventEmitter
 * 
 * 교체 대상:
 *   - Redux store (configSlice, textProcessSlice, logSlice)
 *   - 기존 state 객체 (mainWindow, overlayWindow, globalState 등)
 * 
 * 이벤트:
 *   - 'config-changed'      : config 상태 변경 시
 *   - 'textprocess-changed'  : textProcess/globalState 변경 시
 *   - 'log-changed'          : 로그 변경 시
 */
class AppState extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);

    // ─── 윈도우 참조 ───
    this.mainWindow = null;
    this.overlayWindow = null;
    this.systemListener = null;
    this.savedState = true;

    // ─── 포토샵 모드 (클립보드 분리) ───
    this._photoshopModeActive = false;

    // ─── 블랙포인트 색상 (PluginBridge에서 사용) ───
    this._blackPointColor = null;

    // ─── .para 메타데이터 (ParaFileFormat에서 관리) ───
    this._paraMetadata = null;

    // ─── Config 상태 (was: configSlice) ───
    this._config = {
      theme: {
        mode: THEME.AUTO,
        accentColor: '#007bff'
      },
      language: 'auto',
      overlay: {
        bounds: { width: 320, height: 240, x: null, y: null },
        windowOpacity: 1.0,
        contentOpacity: 0.8,
        overlayFixed: false,
        loadLastOverlayBounds: true,
        visibleRanges: { before: 5, after: 5 },
        isVisible: true
      },
      processMode: 'paragraph',
      viewMode: 'overview',
      pluginServer: false,
      pluginConnected: false
    };

    // ─── TextProcess + Runtime 통합 상태 (was: textProcessSlice + globalState) ───
    this._globalState = {
      programStatus: ProgramStatus.READY,
      paragraphs: [],
      paragraphsMetadata: [],
      currentParagraph: 0,
      currentNumber: null,
      currentFilePath: null,
      processMode: DEFAULT_PROCESS_MODE,
      isPaused: true,
      isOverlayVisible: false,
      timestamp: Date.now()
    };

    // ─── 로그 상태 (was: logSlice) ───
    this._logs = [];
  }

  // ═══════════════ Config 접근자 ═══════════════
  get config() { return this._config; }

  /** configSlice.loadConfig 리듀서와 동일한 딥 머지 로직 */
  loadConfig(newConfig) {
    const prev = this._config;
    this._config = {
      ...prev,
      theme: {
        mode: newConfig.theme?.mode ?? prev.theme.mode,
        accentColor: newConfig.theme?.accentColor ?? prev.theme.accentColor
      },
      language: newConfig.language ?? prev.language,
      overlay: {
        ...prev.overlay,
        ...newConfig.overlay,
        bounds: {
          ...prev.overlay.bounds,
          ...newConfig.overlay?.bounds
        },
        windowOpacity: newConfig.overlay?.windowOpacity ?? prev.overlay.windowOpacity,
        contentOpacity: newConfig.overlay?.contentOpacity ?? prev.overlay.contentOpacity,
        overlayFixed: newConfig.overlay?.overlayFixed ?? prev.overlay.overlayFixed,
        loadLastOverlayBounds: newConfig.overlay?.loadLastOverlayBounds ?? prev.overlay.loadLastOverlayBounds,
        visibleRanges: {
          ...prev.overlay.visibleRanges,
          ...newConfig.overlay?.visibleRanges
        }
      },
      processMode: newConfig.processMode ?? prev.processMode,
      viewMode: newConfig.viewMode ?? prev.viewMode,
      pluginServer: newConfig.pluginServer ?? prev.pluginServer,
      pluginConnected: newConfig.pluginConnected ?? prev.pluginConnected
    };
    this.emit('config-changed', this._config);
  }

  setThemeMode(mode) {
    this._config.theme.mode = mode;
    this.emit('config-changed', this._config);
  }

  setEffectiveTheme(mode) {
    if (this._config.theme.mode === THEME.AUTO) {
      this._config.theme.effectiveMode = mode;
      this.emit('config-changed', this._config);
    }
  }

  setOverlayBounds(bounds) {
    if (bounds) {
      this._config.overlay.bounds = {
        ...this._config.overlay.bounds,
        x: bounds.x ?? this._config.overlay.bounds.x,
        y: bounds.y ?? this._config.overlay.bounds.y,
        width: bounds.width ?? this._config.overlay.bounds.width,
        height: bounds.height ?? this._config.overlay.bounds.height
      };
      this.emit('config-changed', this._config);
    }
  }

  updateLanguage(lang) {
    this._config.language = lang;
    this.emit('config-changed', this._config);
  }

  updateOverlaySettings(settings) {
    this._config.overlay = { ...this._config.overlay, ...settings };
    this.emit('config-changed', this._config);
  }

  updateOverlayVisibility(visible) {
    this._config.overlay.isVisible = visible;
    this.emit('config-changed', this._config);
  }

  updateConfigProcessMode(mode) {
    this._config.processMode = mode;
    this.emit('config-changed', this._config);
  }

  updateViewMode(mode) {
    this._config.viewMode = mode;
    this.emit('config-changed', this._config);
  }

  // ═══════════════ TextProcess / GlobalState 접근자 ═══════════════
  /** store.getState().textProcess 와 호환 */
  get textProcess() { return this._globalState; }

  /** state.globalState 와 호환 (기존 코드의 직접 접근 지원) */
  get globalState() { return this._globalState; }
  set globalState(val) { this._globalState = val; }

  /** textProcessSlice.updateContent 리듀서 대체 */
  updateContent(payload) {
    if (payload.paragraphs !== undefined) this._globalState.paragraphs = payload.paragraphs;
    if (payload.paragraphsMetadata !== undefined) this._globalState.paragraphsMetadata = payload.paragraphsMetadata;
    if (payload.currentNumber !== undefined) this._globalState.currentNumber = payload.currentNumber;
    if (payload.processMode !== undefined) this._globalState.processMode = payload.processMode;
    if (payload.programStatus !== undefined) this._globalState.programStatus = payload.programStatus;
    if (payload.currentFilePath !== undefined) this._globalState.currentFilePath = payload.currentFilePath;
    this.emit('textprocess-changed', this._globalState);
  }

  /** textProcessSlice.updateCurrentParagraph 리듀서 대체 */
  updateCurrentParagraph(position) {
    this._globalState.currentParagraph = position;
    this.emit('textprocess-changed', this._globalState);
  }

  // ═══════════════ 로그 접근자 ═══════════════
  get logs() { return this._logs; }

  addLog(entry) {
    this._logs.push(entry);
    this.emit('log-changed', this._logs);
  }

  clearLogs() {
    this._logs = [];
    this.emit('log-changed', this._logs);
  }

  // ═══════════════ 범용 subscribe (store.subscribe 호환) ═══════════════
  subscribe(callback) {
    this.on('config-changed', callback);
    this.on('textprocess-changed', callback);
    this.on('log-changed', callback);
    return () => {
      this.off('config-changed', callback);
      this.off('textprocess-changed', callback);
      this.off('log-changed', callback);
    };
  }
}

// ─── 싱글톤 인스턴스 ───
const state = new AppState();

// ─── updateState 함수 (기존과 동일한 시그니처) ───
const updateState = async (newState) => {
  // Lazy require to avoid circular dependencies
  const WindowManager = require('./managers/WindowManager');

  if (newState.programStatus === ProgramStatus.READY) {
    // READY 상태일 때는 무조건 초기화
    state._globalState = {
      programStatus: ProgramStatus.READY,
      paragraphs: [],
      paragraphsMetadata: [],
      currentParagraph: 0,
      currentNumber: null,
      isPaused: false,
      isOverlayVisible: false,
      currentFilePath: null,
      timestamp: Date.now(),
      processMode: DEFAULT_PROCESS_MODE
    };
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.setTitle('Paraglide');
    }
  } else if (newState.programStatus === ProgramStatus.PROCESS && state._globalState.programStatus !== ProgramStatus.PROCESS) {
    // PROCESS 상태로 처음 전환될 때 (파일 열기)
    state._globalState = {
      ...state._globalState,
      ...newState,
      isOverlayVisible: state._config.overlay.isVisible
    };
  } else {
    // 그 외의 상태 업데이트
    const overlayVisibility = newState.isOverlayVisible !== undefined ? 
      newState.isOverlayVisible : 
      state._globalState.isOverlayVisible;
    
    state._globalState = {
      ...state._globalState,
      ...newState,
      isOverlayVisible: overlayVisibility
    };
  }

  // 창 업데이트
  await WindowManager.updateWindowContent(state.mainWindow, 'state-update');

  // 오버레이 창 처리
  if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
    const shouldShow = (state._globalState.programStatus === ProgramStatus.PROCESS ||
                        state._globalState.programStatus === ProgramStatus.PAUSE) && 
                      state._globalState.isOverlayVisible;
    
    if (shouldShow) {
      state.overlayWindow.showInactive();
      await WindowManager.updateWindowContent(state.overlayWindow, 'content-update');
    } else {
      state.overlayWindow.hide();
    }
  }

  console.log('[Main] 현재 프로그램 상태:', state._globalState.programStatus);

  // 상태 변경 통보
  ipcMain.emit('program-status-update', 'event', {
    isPaused: state._globalState.isPaused,
    programStatus: state._globalState.programStatus
  });
};

module.exports = { state, updateState, THEME };
