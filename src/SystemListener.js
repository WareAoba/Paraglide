// SystemListener.js
const { dialog, clipboard, systemPreferences, ipcMain } = require('electron');
const { GlobalKeyboardListener } = require('node-global-key-listener');


class SystemListener {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isInternalClipboardChange = false;
    this.lastInternalChangeTime = 0;
    this.lastClipboardText = '';
    this.keyboardListener = null;  // 키보드 리스너 참조 저장
    this.programStatus = { isPaused: false }; // 초기화 추가
  }

  // 초기화
  async initialize() {
    try {
      // MacKeyServer 실행 권한 확인 및 설정
      if (process.platform === 'darwin') {
        const { execSync } = require('child_process');
        try {
          await execSync('sudo chmod +x ./node_modules/node-global-key-listener/bin/MacKeyServer');
        } catch (error) {
          console.error('MacKeyServer 권한 설정 실패:', error);
          return false;
        }
      }

      ipcMain.on('program-status-update', (event, status) => {
        console.log('[SystemListener] 상태 업데이트:', status);
        this.programStatus = status;
      });

      const hasPermission = await this.setupMacPermissions();
      if (!hasPermission) {
        return false;
      }

      // 나머지 초기화
      this.setupKeyboardListener();
      this.setupClipboardMonitor();
      return true;
    } catch (error) {
      console.error('[SystemListener] 초기화 실패:', error);
      return false;
    }
  }


    // macOS 권한 설정
    async setupMacPermissions() {
      if (process.platform !== 'darwin') return true;
  
      const { app } = require('electron');
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
      
      if (!isTrusted) {
        const response = await dialog.showMessageBox({
          type: 'error',
          buttons: ['Open Settings', 'Quit'],
          defaultId: 0,
          title: 'Paraglide Permissions Required',
          message: 'Paraglide requires accessibility permissions to function',
          detail: 'Please enable Paraglide in System Settings > Privacy & Security > Accessibility'
        });
  
        if (response.response === 0) {
          await require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        }
        
        app.quit();
        return false;
      }
  
      return true;
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
    if (this.keyboardListener) {
      // 기존 리스너가 있다면 제거
      this.keyboardListener = null;
    }

    try {
      console.log('[SystemListener] 키보드 리스너 설정 시도');
      this.keyboardListener = new GlobalKeyboardListener();
      
      if (!this.keyboardListener) {
        console.error('[SystemListener] 키보드 리스너 생성 실패');
        return;
      }

      this.keyboardListener.addListener((e, down) => {
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

    console.log('[SystemListener] 키보드 리스너 설정 완료');
  } catch (error) {
    console.error('[SystemListener] 키보드 리스너 설정 실패:', error);
  }
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

  // 오류 대화상자 표시
  showErrorDialog(message) {
    dialog.showErrorBox('오류', message.toString());
  }
}

module.exports = SystemListener;