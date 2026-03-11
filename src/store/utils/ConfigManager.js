// src/store/utils/ConfigManager.js
const { state } = require('../../main/state');
const { THEME } = require('../../main/constants');

const ConfigManager = {
    validateConfig(savedConfig = {}) {
        const defaultConfig = state.config;
        return this.validateConfigStructure(savedConfig) ? 
            this.mergeWithDefaults(savedConfig, defaultConfig) : 
            defaultConfig;
    },

    validateConfigStructure(config) {
        return (
            config &&
            typeof config === 'object' &&
            config.theme &&
            config.overlay &&
            typeof config.processMode === 'string' &&
            typeof config.viewMode === 'string' &&
            typeof config.language === 'string'  // language 검증 추가
        );
    },

    mergeWithDefaults(savedConfig, defaultConfig) {
        return {
            theme: {
                mode: this.validateThemeMode(
                    savedConfig.theme?.mode, 
                    defaultConfig.theme.mode
                ),
                accentColor: savedConfig.theme?.accentColor || defaultConfig.theme.accentColor
            },
            language: this.validateLanguage(
                savedConfig.language,
                defaultConfig.language
            ),
            overlay: {
                bounds: {
                    width: this.validateNumber(
                        savedConfig.overlay?.bounds?.width, 
                        defaultConfig.overlay.bounds.width
                    ),
                    height: this.validateNumber(
                        savedConfig.overlay?.bounds?.height, 
                        defaultConfig.overlay.bounds.height
                    ),
                    x: this.validateNumber(
                        savedConfig.overlay?.bounds?.x, 
                        defaultConfig.overlay.bounds.x
                    ),
                    y: this.validateNumber(
                        savedConfig.overlay?.bounds?.y, 
                        defaultConfig.overlay.bounds.y
                    )
                },
                windowOpacity: this.validateNumber(
                    savedConfig.overlay?.windowOpacity, 
                    defaultConfig.overlay.windowOpacity
                ),
                contentOpacity: this.validateNumber(
                    savedConfig.overlay?.contentOpacity, 
                    defaultConfig.overlay.contentOpacity
                ),
                overlayFixed: this.validateBoolean(
                    savedConfig.overlay?.overlayFixed, 
                    defaultConfig.overlay.overlayFixed
                ),
                loadLastOverlayBounds: this.validateBoolean(
                    savedConfig.overlay?.loadLastOverlayBounds, 
                    defaultConfig.overlay.loadLastOverlayBounds
                ),
                isVisible: this.validateBoolean(
                    savedConfig.overlay?.isVisible,
                    defaultConfig.overlay.isVisible
                ),
            },
            processMode: this.validateProcessMode(
                savedConfig.processMode, 
                defaultConfig.processMode
            ),
            viewMode: this.validateViewMode(
                savedConfig.viewMode, 
                defaultConfig.viewMode
            )
        };
    },

    // Helper functions
    validateBoolean(value, defaultValue) {
        return typeof value === 'boolean' ? value : defaultValue;
    },
    
    validateNumber(value, defaultValue, min = 0, max = Infinity) {
        if (typeof value !== 'number' || isNaN(value)) {
            return defaultValue;
        }
        return Math.min(Math.max(value, min), max);
    },

    validateThemeMode(value, defaultValue) {
        const allowedModes = [THEME.DARK, THEME.LIGHT, THEME.AUTO];
        return allowedModes.includes(value) ? value : defaultValue;
    },

    validateLanguage(value, defaultValue) {
        const supportedLanguages = ['auto', 'ko', 'en', 'ja', 'zh'];
        return supportedLanguages.includes(value) ? value : defaultValue;
    },

    validateProcessMode(value, defaultValue) { // 추가된 함수
        const allowedModes = ['paragraph', 'line']; // 예시: 허용된 모드 목록
        return allowedModes.includes(value) ? value : defaultValue;
    },

    validateViewMode(value, defaultValue) {
        const allowedModes = ['overview', 'listview'];
        return allowedModes.includes(value) ? value : defaultValue;
    },
    
    async loadAndValidateConfig(savedConfig) {
        // 중요: savedConfig가 null이거나 undefined일 때 처리
        const configToValidate = savedConfig || {};
        const validConfig = this.validateConfig(configToValidate);
        state.loadConfig(validConfig);
        return validConfig;
    }
};

module.exports = { ConfigManager };