// SystemListener.js
const { clipboard, dialog, BrowserWindow, systemPreferences } = require('electron');
const { GlobalKeyboardListener } = require("node-global-key-listener");

class SystemListener {
  constructor() {
    this.isInternalClipboardChange = false;
    this.mainWindow = null;
    this.programStatus = 'READY';
    this.lastClipboardText = clipboard.readText();
    this.lastInternalChangeTime = 0; // 마지막 내부 변경 시간
    this.initializeAsync();
  }

  // 메인 윈도우 설정
  setMainWindow(win) {
    this.mainWindow = win;
    console.log('[SystemListener] 메인 윈도우가 설정되었습니다.');
  }

  // 내부 클립보드 변경 알림
  notifyInternalClipboardChange() {
    this.isInternalClipboardChange = true;
    this.lastInternalChangeTime = Date.now();
    console.log('[SystemListener] 내부 클립보드 변경 알림 호출됨.');
  }

  // 초기화 함수
  async initializeAsync() {
    try {
      console.log('[SystemListener] 초기화 시작.');
      if (process.platform === 'darwin') {
        await this.setupMacPermissions();
      }
      await this.setupKeyboardListener();
      this.startClipboardWatcher();
      console.log('[SystemListener] 초기화 완료.');
    } catch (error) {
      console.error('[시스템] 초기화 실패:', error);
      this.showErrorDialog(error);
    }
  }

  // 클립보드 변경 감시 시작
  startClipboardWatcher() {
    console.log('[SystemListener] 클립보드 감시 시작.');
    setInterval(() => {
      const currentText = clipboard.readText();
      if (currentText !== this.lastClipboardText) {
        console.log('[SystemListener] 클립보드 변경 감지:', currentText);
        this.onClipboardChange(currentText);
        this.lastClipboardText = currentText;
      }
    }, 100); // 100ms 간격으로 클립보드 확인
  }

  // 클립보드 변경 시 호출
  onClipboardChange(text) {
    const now = Date.now();
    // 내부 복사 변경이 최근 500ms 이내에 발생했는지 확인
    if (this.isInternalClipboardChange && (now - this.lastInternalChangeTime) < 500) {
      console.log('[클립보드] 내부 복사 감지.');
      this.isInternalClipboardChange = false;
      return;
    }

    console.log('[클립보드] 외부 복사 감지:', text);
    // 외부 복사에 대한 처리
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('external-copy', text);
      console.log('[SystemListener] 외부 복사 이벤트 전송됨.');
    }
  }

  // 키보드 리스너 설정
  async setupKeyboardListener() {
    console.log('[SystemListener] 키보드 리스너 설정 시작.');
    const keyboard = new GlobalKeyboardListener();

    keyboard.addListener((e, down) => {
      console.log(`[SystemListener] 키 이벤트 발생 - 상태: ${e.state}, 키: ${e.name}, 다운: ${down}`);
      if (e.state === 'DOWN') {
        // Cmd+V 또는 Ctrl+V 감지
        const isCtrlOrCmd = e.meta || e.control;
        if (e.name === 'V' && isCtrlOrCmd) {
          console.log('[단축키] 다음 단락으로 이동 (Cmd+V 또는 Ctrl+V) 감지됨.');
          this.moveToNext();
          return;
        }

        const isAlt = e.alt;
        const keyName = e.name;

        if (isAlt && keyName === 'Right') {
          console.log('[단축키] Alt+Right 감지됨.');
          this.moveToNext();
        } else if (isAlt && keyName === 'Left') {
          console.log('[단축키] Alt+Left 감지됨.');
          this.moveToPrev();
        } else if (isAlt && keyName === 'Up') {
          console.log('[단축키] Alt+Up 감지됨.');
          this.toggleOverlay();
        } else if (isAlt && keyName === 'Down') {
          console.log('[단축키] Alt+Down 감지됨.');
          this.togglePause();
        }
      }
    });

    console.log('[SystemListener] 키보드 리스너 설정 완료.');
  }

  // 다음 단락으로 이동
  moveToNext() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // 내부 클립보드 변경 알림
      this.notifyInternalClipboardChange();
      this.mainWindow.webContents.send('move-to-next');
      console.log('[SystemListener] 다음 단락으로 이동 이벤트 전송됨.');
    }
  }

  // 이전 단락으로 이동
  moveToPrev() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // 내부 클립보드 변경 알림
      this.notifyInternalClipboardChange();
      this.mainWindow.webContents.send('move-to-prev');
      console.log('[SystemListener] 이전 단락으로 이동 이벤트 전송됨.');
    }
  }

  // 오버레이 토글
  toggleOverlay() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('toggle-overlay');
      console.log('[SystemListener] 오버레이 토글 이벤트 전송됨.');
    }
  }

  // 일시정지 토글
  togglePause() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('toggle-pause');
      console.log('[SystemListener] 일시정지 토글 이벤트 전송됨.');
    }
  }

  // macOS 권한 설정
  async setupMacPermissions() {
    console.log('[SystemListener] macOS 접근성 권한 확인 중.');
    const isTrusted = systemPreferences.isTrustedAccessibilityClient(true);
    if (!isTrusted) {
      console.error('[시스템] 접근성 권한이 필요합니다.');
      this.showErrorDialog('앱을 사용하려면 접근성 권한이 필요합니다.');
      throw new Error('접근성 권한이 허용되지 않았습니다.');
    }
    console.log('[SystemListener] 접근성 권한이 허용되었습니다.');
  }

  // 오류 대화상자 표시
  showErrorDialog(message) {
    dialog.showErrorBox('오류', message.toString());
  }
}

module.exports = new SystemListener();