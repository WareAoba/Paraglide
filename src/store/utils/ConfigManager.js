// src/store/utils/ConfigManager.js
const store = require('../store');
const { configActions } = require('../slices/configSlice');  // 추가

const ConfigManager = {
    validateConfig(savedConfig = {}) {
        const defaultConfig = store.getState().config;
        
        // 먼저 기본 설정값 결정
        const validatedConfig = {
          overlayFixed: this.validateBoolean(savedConfig.overlayFixed, defaultConfig.overlayFixed),
          loadLastOverlayBounds: this.validateBoolean(savedConfig.loadLastOverlayBounds, defaultConfig.loadLastOverlayBounds),
          windowOpacity: this.validateNumber(savedConfig.windowOpacity, defaultConfig.windowOpacity),
          contentOpacity: this.validateNumber(savedConfig.contentOpacity, defaultConfig.contentOpacity),
          accentColor: savedConfig.accentColor || defaultConfig.accentColor,
          visibleRanges: savedConfig.visibleRanges || defaultConfig.visibleRanges,
          isDarkMode: this.validateBoolean(savedConfig.isDarkMode, defaultConfig.isDarkMode),
          theme: savedConfig.theme || defaultConfig.theme
        };
    
        // overlayBounds는 loadLastOverlayBounds에 따라 결정
        validatedConfig.overlayBounds = validatedConfig.loadLastOverlayBounds
          ? (savedConfig.overlayBounds || defaultConfig.overlayBounds)
          : defaultConfig.overlayBounds;
    
        return validatedConfig;
    },
    
    // Helper functions
    validateBoolean(value, defaultValue) {
        return typeof value === 'boolean' ? value : defaultValue;
    },
    
    validateNumber(value, defaultValue) {
        return typeof value === 'number' && !isNaN(value) ? value : defaultValue;
    },
    
    async loadAndValidateConfig(savedConfig) {
        const validConfig = this.validateConfig(savedConfig);
        store.dispatch(configActions.loadConfig(validConfig));  // 이제 configActions 사용 가능
        return validConfig;
    }
};

module.exports = { ConfigManager };