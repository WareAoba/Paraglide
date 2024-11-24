const { createSlice } = require('@reduxjs/toolkit');
const { nativeTheme } = require('electron');

// 상수 정의
const THEME = {
  DARK: 'dark',
  LIGHT: 'light'
};

// 초기값 설정
const initialState = {
  theme: {
    isDarkMode: nativeTheme.shouldUseDarkColors,
    mode: nativeTheme.shouldUseDarkColors ? THEME.DARK : THEME.LIGHT,
    accentColor: '#007bff'
  },
  overlay: {
    bounds: { 
      width: 320, 
      height: 240,
      x: undefined,
      y: undefined
    },
    window: {
      opacity: 1.0,
      contentOpacity: 0.8,
      isFixed: false,
      loadLastBounds: true
    },
    visibleRanges: {
      before: 5, 
      after: 5
    }
  }
};

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    loadConfig: (state, action) => {
      const newConfig = action.payload;
      // 깊은 병합으로 변경
      return {
        theme: { ...state.theme, ...newConfig.theme },
        overlay: {
          ...state.overlay,
          bounds: { ...state.overlay.bounds, ...newConfig.overlay?.bounds },
          window: { ...state.overlay.window, ...newConfig.overlay?.window },
          visibleRanges: { ...state.overlay.visibleRanges, ...newConfig.overlay?.visibleRanges }
        }
      };
    },

    updateTheme: (state, action) => {
      const isDarkMode = action.payload;
      state.theme.isDarkMode = isDarkMode;
      state.theme.mode = isDarkMode ? THEME.DARK : THEME.LIGHT;
    },

    setOverlayBounds: (state, action) => {
      state.overlay.bounds = {
        ...state.overlay.bounds,
        ...action.payload
      };
    },

    updateOverlaySettings: (state, action) => {
      state.overlay.window = {
        ...state.overlay.window,
        ...action.payload
      };
    },

    updateInitialPosition: (state, action) => {
      const { width, height } = action.payload;
      state.overlay.bounds.x = Math.floor(width * 0.02);
      state.overlay.bounds.y = Math.floor(height * 0.05);
    }
  }
});

// 선택자 추가
const selectTheme = (state) => state.config.theme;
const selectOverlay = (state) => state.config.overlay;

module.exports = {
  configReducer: configSlice.reducer,
  configActions: configSlice.actions,
  selectTheme,
  selectOverlay,
  THEME
};