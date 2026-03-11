// ContentManager.js — 클립보드 복사/디바운스
const { clipboard } = require('electron');
const { debounce, DEBOUNCE_TIME } = require('../constants');
const { state } = require('../state');

const ContentManager = {
  debounceTime: DEBOUNCE_TIME,
  
  copyAndLogDebouncer: debounce(async (content, skipLog = false) => {
    try {
      if (!content) return;
      if (!state.systemListener) {
        console.error('[Main] SystemListener 초기화 실패');
        return;
      }
  
      state.systemListener.setCurrentParagraphText(content);
      state.mainWindow?.webContents.send('notify-clipboard-change');
      state.systemListener.notifyInternalClipboardChange();
      clipboard.writeText(content);
      process.stdout.write(`[Main] 복사 성공: ${content.substring(0, 20)}...`);
  
      const textState = state.textProcess;
  
      if (!skipLog && textState.currentFilePath) {
        // Lazy require to avoid circular dependency
        const FileManager = require('./FileManager');
        await FileManager.saveCurrentPositionToLog();
        console.log('[Main] 로그 저장 성공');
      }
    } catch (error) {
      console.error('[Main] 복사/로깅 중 오류:', error, error.stack);
    }
  }, DEBOUNCE_TIME)
};

module.exports = ContentManager;
