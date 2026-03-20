// main.js — 엔트리포인트 (초기화만)
const { app } = require('electron');
const { state } = require('./main/state');
const ApplicationManager = require('./main/managers/ApplicationManager');
const DialogManager = require('./main/managers/DialogManager');
const LanguageManager = require('./main/managers/LanguageManager');

// 앱 시작점
const gotTheLock = app.requestSingleInstanceLock();

// async IIFE로 래핑
(async () => {
  if (!gotTheLock) {
    app.quit();
    return;
  }

  // 두 번째 인스턴스 실행 시도 시 기존 창 포커스
  app.on('second-instance', async () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();
      
      await DialogManager.show(DialogManager.DIALOGS.SWITCH_TO_EXISTING, state.mainWindow);
    }
  });

  // 기존 앱 시작 로직
  app.whenReady().then(async () => {
    await LanguageManager.initializeI18n();
    await ApplicationManager.initialize();
  }).catch((error) => {
    console.error('[Main] 초기화 실패:', error);
    app.quit();
  });
})();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ApplicationManager.exit();
  }
});

// 예외 처리기 (디버깅용)
process.on('uncaughtException', (error) => {
  console.error('[Main] 예외처리 실패:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] 비동기 처리 실패:', promise, 'reason:', reason);
});