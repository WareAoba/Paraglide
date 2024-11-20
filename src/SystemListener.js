// SystemListener.js
const { dialog, clipboard, systemPreferences, ipcMain } = require('electron');
const { GlobalKeyboardListener } = require('node-global-key-listener');


class SystemListener {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isInternalClipboardChange = false;
    this.lastInternalChangeTime = 0;
    this.lastClipboardText = '';
  };

  // 초기화
  async initialize() {
    if (process.platform === 'darwin') {
      await this.setupMacPermissions();
    }
    this.setupKeyboardListener();
    this.setupClipboardMonitor();
    console.log('[SystemListener] 초기화 완료');
    ipcMain.on('program-status-update', (event, status) => {
      this.programStatus = status;
      console.log('[SystemListener] 프로그램 상태 업데이트:', status);
    });
  }

  // 클립보드 모니터링 설정
  setupClipboardMonitor() {
    setInterval(() => {
      const currentText = clipboard.readText();
      if (currentText !== this.lastClipboardText) {
        console.log('[SystemListener] 클립보드 변경 감지');
        this.onClipboardChange(currentText);
        this.lastClipboardText = currentText;
      }
    }, 100);
  }

  // 클립보드 변경 처리
  onClipboardChange(text) {
    const now = Date.now();
    if (this.programStatus?.isPaused){
      return;
    }

    if (this.isInternalClipboardChange && (now - this.lastInternalChangeTime) < 500) {
      this.isInternalClipboardChange = false;
      return;
    }

    if (this.mainWindow?.isDestroyed()) return;
    ipcMain.emit('toggle-pause');
    console.log('[클립보드] 외부 복사 감지');
  }

  // 내부 클립보드 변경 알림
  notifyInternalClipboardChange() {
    this.isInternalClipboardChange = true;
    this.lastInternalChangeTime = Date.now();
  }

  // setupKeyboardListener는 수정하지 않음 (사람이 작성한 코드)
  // Important: 절대로 건들지 마세요.
  setupKeyboardListener() {
    console.log('[SystemListener] 키보드 리스너 설정');
    const keyboard = new GlobalKeyboardListener();
    keyboard.addListener((e, down) => {
      // only handle key down events
      if (e.state === 'UP') return; 

      const isCtrlOrCmd = (down["LEFT CTRL"] || down["RIGHT CTRL"] || 
        down["LEFT META"] || down["RIGHT META"]);
      
      if (e.name === 'V' && isCtrlOrCmd) {
        if (!this.programStatus || this.programStatus.isPaused) {
          return;
        }
        
        console.log('[단축키] Cmd+V 또는 Ctrl+V');
        this.moveToNext();
      }

      const isAlt = down["LEFT ALT"] || down["RIGHT ALT"]
      const keyName = e.name;
      
      if(isAlt) {
        switch(keyName) {
          case 'RIGHT ARROW':
            console.log('[단축키] Alt+Right');
            this.moveToNext();
            break;
          case 'LEFT ARROW':
            console.log('[단축키] Alt+Left');
            this.moveToPrev();
            break;
          case 'UP ARROW':
            console.log('[단축키] Alt+Up');
            this.toggleResume();
            break;
          case 'DOWN ARROW':
            console.log('[단축키] Alt+Down');
            this.togglePause();
            break;
        }
      }
    });
  }

  // 이벤트 전송
  sendEvent(eventName) {
    if (!this.mainWindow?.isDestroyed()) {
      this.notifyInternalClipboardChange();


      // 근데 이거는 다른거에도 쓰는지 몰라서 일단 두긴 할게
      this.mainWindow.webContents.send(eventName);

      // ipcMain.on이니까
      // ipcMain.emit으로 쏴줘야 받을 수 있음
      ipcMain.emit(eventName)
    }
  }

  // 네비게이션 메서드
  moveToNext() {
    ipcMain.emit('move-to-next');
  }

  moveToPrev() {
    ipcMain.emit('move-to-prev');
  }

  toggleResume() {
    ipcMain.emit('toggle-resume');
  }

  togglePause() {
    ipcMain.emit('toggle-pause');
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

module.exports = SystemListener;