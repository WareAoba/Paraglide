// src/store/utils/ConfigManager.js
const store = require('../store');
const { configActions } = require('../slices/configSlice');  // 추가

const ConfigManager = {
    validateConfig(savedConfig = {}) {
        const defaultConfig = store.getState().config;
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
            typeof config.viewMode === 'string'
        );
    },

    mergeWithDefaults(savedConfig, defaultConfig) {
        return {
            theme: {
                isDarkMode: this.validateBoolean(
                    savedConfig.theme?.isDarkMode, 
                    defaultConfig.theme.isDarkMode
                ),
                mode: savedConfig.theme?.mode || defaultConfig.theme.mode,
                accentColor: savedConfig.theme?.accentColor || defaultConfig.theme.accentColor
            },
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
                )
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

    async loadAndValidateConfig(savedConfig) {
        try {
            const validConfig = this.validateConfig(savedConfig);
            store.dispatch(configActions.loadConfig(validConfig));
            return validConfig;
        } catch (error) {
            console.error('설정 검증 실패:', error);
            const defaultConfig = store.getState().config;
            store.dispatch(configActions.loadConfig(defaultConfig));
            return defaultConfig;
        }
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
        store.dispatch(configActions.loadConfig(validConfig));
        return validConfig;
    }
};

module.exports = { ConfigManager };