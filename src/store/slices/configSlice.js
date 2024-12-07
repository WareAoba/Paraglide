const { createSlice } = require('@reduxjs/toolkit');
const { nativeTheme } = require('electron');

// 상수 정의
const THEME = {
  DARK: 'dark',
  LIGHT: 'light',
  AUTO: 'auto'
};

// 초기값 설정
const initialState = {
  theme: {
    mode: THEME.AUTO,
    accentColor: '#007bff'
  },
  overlay: {
    bounds: { 
      width: 320, 
      height: 240,
      x: null,
      y: null
    },
    windowOpacity: 1.0,
    contentOpacity: 0.8,
    overlayFixed: false,
    loadLastOverlayBounds: true,
    visibleRanges: {
      before: 5, 
      after: 5
    },
    isVisible: true
  },
  processMode: 'paragraph',
  viewMode: 'overview'
};

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    loadConfig: (state, action) => {
      const newConfig = action.payload;
      return {
        ...state,
        theme: { 
          mode: newConfig.theme?.mode ?? state.theme.mode,
          accentColor: newConfig.theme?.accentColor ?? state.theme.accentColor
        },
        overlay: {
          ...state.overlay,
          ...newConfig.overlay,
          bounds: { 
            ...state.overlay.bounds, 
            ...newConfig.overlay?.bounds 
          },
          // Settings.js와 호환되도록 평면적인 구조로 저장
          windowOpacity: newConfig.overlay?.windowOpacity ?? state.overlay.windowOpacity,
          contentOpacity: newConfig.overlay?.contentOpacity ?? state.overlay.contentOpacity,
          overlayFixed: newConfig.overlay?.overlayFixed ?? state.overlay.overlayFixed,
          loadLastOverlayBounds: newConfig.overlay?.loadLastOverlayBounds ?? state.overlay.loadLastOverlayBounds,
          visibleRanges: { 
            ...state.overlay.visibleRanges, 
            ...newConfig.overlay?.visibleRanges 
          }
        },
        processMode: newConfig.processMode ?? state.processMode,
        viewMode: newConfig.viewMode ?? state.viewMode
      };
    },

    setThemeMode: (state, action) => {
      state.theme.mode = action.payload;
    },
    setEffectiveTheme: (state, action) => {
      // AUTO 모드일 때만 실제 테마 적용
      if (state.theme.mode === THEME.AUTO) {
        state.theme.effectiveMode = action.payload;
      }
    },

    setOverlayBounds: (state, action) => {
      const newBounds = action.payload;
      if (newBounds) {
        state.overlay.bounds = {
          ...state.overlay.bounds,
          x: newBounds.x ?? state.overlay.bounds.x,
          y: newBounds.y ?? state.overlay.bounds.y,
          width: newBounds.width ?? state.overlay.bounds.width,
          height: newBounds.height ?? state.overlay.bounds.height
        };
      }
    },

    updateOverlaySettings: (state, action) => {
      state.overlay = {
        ...state.overlay,
        ...action.payload
      };
    },

    updateOverlayVisibility: (state, action) => {
      state.overlay.isVisible = action.payload;
    },

    updateInitialPosition: (state, action) => {
      const { width, height } = action.payload;
      state.overlay.bounds.x = Math.floor(width * 0.02);
      state.overlay.bounds.y = Math.floor(height * 0.05);
    },

    updateProcessMode: (state, action) => { // 추가된 리듀서
      state.processMode = action.payload;
    },

    updateViewMode: (state, action) => {
      state.viewMode = action.payload;
    }
  }
});

// 선택자 추가
const selectTheme = (state) => state.config.theme;
const selectOverlay = (state) => state.config.overlay;
const selectProcessMode = (state) => state.config.processMode;
const selectViewMode = (state) => state.config.viewMode;

module.exports = {
  configReducer: configSlice.reducer,
  configActions: configSlice.actions,
  selectTheme,
  selectOverlay,
  selectProcessMode,
  selectViewMode,
  THEME
};