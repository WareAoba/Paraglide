// ThemeManager.js — 테마 계산/브로드캐스트
const { nativeTheme, BrowserWindow } = require('electron');
const { THEME } = require('../constants');
const { state } = require('../state');

const ThemeManager = {
  initialize() {
    let prevTheme = this.getCurrentTheme();
    state.on('config-changed', () => {
      const currentTheme = this.getCurrentTheme();
      
      // accentColor 변경은 mode와 무관하게 항상 broadcast
      if (currentTheme.accentColor !== prevTheme.accentColor) {
        prevTheme = currentTheme;
        this.broadcastTheme();
        return;
      }

      // mode 변경은 기존 로직 유지
      if (prevTheme.mode !== currentTheme.mode) {
        prevTheme = currentTheme;
        this.broadcastTheme();
      }
    });

    // auto 모드: 시스템 테마 변경 감지
    nativeTheme.on('updated', () => {
      if (state.config.theme.mode === THEME.AUTO) {
        const currentTheme = this.getCurrentTheme();
        if (prevTheme.mode !== currentTheme.mode) {
          prevTheme = currentTheme;
          this.broadcastTheme();
        }
      }
    });
  },

  getCurrentTheme() {
    return {
      mode: this.getEffectiveMode(),
      accentColor: state.config.theme.accentColor
    };
  },

  getEffectiveMode() {
    return state.config.theme.mode === THEME.AUTO ? 
      (nativeTheme.shouldUseDarkColors ? THEME.DARK : THEME.LIGHT) : 
      state.config.theme.mode;
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

module.exports = ThemeManager;
