// src/store/utils/ConfigManager.js
const store = require('../store');
const { configActions } = require('../slices/configSlice');  // 추가

const ConfigManager = {
    validateConfig(savedConfig = {}) {
        const defaultConfig = store.getState().config;
        
        // 중첩 구조 유지하면서 검증
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
                ),
                visibleRanges: {
                    before: this.validateNumber(
                        savedConfig.overlay?.visibleRanges?.before, 
                        defaultConfig.overlay.visibleRanges.before
                    ),
                    after: this.validateNumber(
                        savedConfig.overlay?.visibleRanges?.after, 
                        defaultConfig.overlay.visibleRanges.after
                    )
                }
            }
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
    
    async loadAndValidateConfig(savedConfig) {
        // 중요: savedConfig가 null이거나 undefined일 때 처리
        const configToValidate = savedConfig || {};
        const validConfig = this.validateConfig(configToValidate);
        store.dispatch(configActions.loadConfig(validConfig));
        return validConfig;
    }
};

module.exports = { ConfigManager };