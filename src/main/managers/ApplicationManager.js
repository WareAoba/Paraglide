// ApplicationManager.js — 앱 라이프사이클
const { ProgramStatus } = require('../constants');
const { state } = require('../state');
const { ConfigManager } = require('../../store/utils/ConfigManager');
const StatusManager = require('./StatusManager');
const FileManager = require('./FileManager');
const LanguageManager = require('./LanguageManager');
const ThemeManager = require('./ThemeManager');
const IPCManager = require('./IPCManager');
const WindowManager = require('./WindowManager');
const PluginBridge = require('./PluginBridge');
const SystemListener = require('../../SystemListener.jsx');

const setupLogCapture = () => {
  ['stdout', 'stderr'].forEach(output => {
    const original = process[output].write;
    process[output].write = (...args) => {
      // 1. 원본 출력 먼저 실행
      const result = original.apply(process[output], args);
      
      // 2. 로그 저장
      const logEntry = {
        type: output,
        content: args[0].toString(),
        timestamp: new Date().toISOString()
      };
      
      // 3. AppState에 저장
      state.addLog(logEntry);

      return result;
    };
  });

  // 4. 초기화 확인 로그
  console.log('[Main] 로그 캡처 시스템 초기화');
};

const ApplicationManager = {
  async initialize() {
    try {
      await StatusManager.transition(ProgramStatus.LOADING);

      // 1. 설정 파일 로드 및 적용을 가장 먼저
      const savedConfig = await FileManager.loadConfig();
      await ConfigManager.loadAndValidateConfig(savedConfig);

      // 2. i18next 초기화는 설정 로드 후에
      await LanguageManager.initializeI18n();

      // 3. 나머지 초기화
      ThemeManager.initialize();
      PluginBridge.initialize();
      IPCManager.setupHandlers();
      WindowManager.createMainWindow();
      WindowManager.createOverlayWindow();

      state.systemListener = new SystemListener(state.mainWindow);
      await state.systemListener.initialize();
      setupLogCapture();

      await StatusManager.transition(ProgramStatus.READY);
      console.log('[Main] 메인 프로세스 초기화 성공');
    } catch (error) {
      console.error('[Main] 메인 프로세스 초기화 실패:', error);
      await StatusManager.transition(ProgramStatus.READY);
    }
  },

  async exit() {
    try {
      PluginBridge.stop();

      if (state.systemListener) {
        state.systemListener.destroy();
      }

      if (state.overlayWindow && !state.overlayWindow.isDestroyed()) {
        state.overlayWindow.destroy();
        state.overlayWindow = null;
      }
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.destroy();
        state.mainWindow = null;
      }
    } catch (error) {
      console.error('[Main] 종료 중 오류 발생:', error);
    } finally {
      const { app } = require('electron');
      app.quit();
    }
  }
};

module.exports = ApplicationManager;
