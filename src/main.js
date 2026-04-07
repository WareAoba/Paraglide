// main.js — 엔트리포인트 (초기화만)
const { app } = require('electron');
const path = require('path');
const { state } = require('./main/state');
const ApplicationManager = require('./main/managers/ApplicationManager');
const DialogManager = require('./main/managers/DialogManager');
const LanguageManager = require('./main/managers/LanguageManager');

// 커맨드 라인에서 .para/.txt 파일 경로 추출
function extractFilePathFromArgs(args) {
  for (const arg of args) {
    if (arg && typeof arg === 'string') {
      const ext = path.extname(arg).toLowerCase();
      if (ext === '.para' || ext === '.txt') {
        return arg;
      }
    }
  }
  return null;
}

// 앱 시작점
const gotTheLock = app.requestSingleInstanceLock();

// async IIFE로 래핑
(async () => {
  if (!gotTheLock) {
    app.quit();
    return;
  }

  // 두 번째 인스턴스 실행 시도 시 — 파일 경로가 있으면 열기, 없으면 기존 창 포커스
  app.on('second-instance', async (event, commandLine) => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();

      const filePath = extractFilePathFromArgs(commandLine);
      if (filePath) {
        const FileManager = require('./main/managers/FileManager');
        await FileManager.openFile(filePath);
      } else {
        await DialogManager.show(DialogManager.DIALOGS.SWITCH_TO_EXISTING, state.mainWindow);
      }
    }
  });

  // 기존 앱 시작 로직
  app.whenReady().then(async () => {
    // 파일 연결로 앱이 실행된 경우, 렌더러 준비 후 열 수 있도록 경로 저장
    const filePath = extractFilePathFromArgs(process.argv);
    if (filePath) {
      state._pendingFilePath = filePath;
    }

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