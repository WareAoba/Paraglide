// SystemListener.js
const { app, dialog, clipboard, systemPreferences, ipcMain, nativeTheme } = require('electron');
const { GlobalKeyboardListener } = require('node-global-key-listener');
const { configActions } = require('./store/slices/configSlice');
const store = require('./store/store');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

class SystemListener {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isInternalClipboardChange = false;
    this.lastInternalChangeTime = 0;
    this.lastClipboardText = '';
    this.keyboardListener = null;
    this.programStatus = { isPaused: false };
  }

  // 초기화
  async initialize() {
    if (process.platform === 'darwin') {
      const macKeyServerPath = isDev
        ? path.join(__dirname, '../node_modules/node-global-key-listener/bin/MacKeyServer')
        : path.join(process.resourcesPath, './app.asar.unpacked/node_modules/node-global-key-listener/bin/MacKeyServer');

      try {
        fs.chmodSync(macKeyServerPath, '755');
      } catch (error) {
        console.error('MacKeyServer 권한 설정 실패:', error);
      }
    }

    try {
      ipcMain.on('program-status-update', (event, status) => {
        console.log('[SystemListener] 상태 업데이트:', status);
        this.programStatus = status;
      });

      const hasPermission = await this.checkAndRequestMacPermissions();
      if (!hasPermission) {
        return false;
      }

      // 나머지 초기화
      this.setupKeyboardListener();
      this.setupClipboardMonitor();
      this.setupThemeListener();
      return true;
    } catch (error) {
      console.error('[SystemListener] 초기화 실패:', error);
      return false;
    }
  }

  // macOS 권한 확인 및 요청
  async checkAndRequestMacPermissions() {
    if (process.platform !== 'darwin') return true;

    const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);

    if (!isTrusted) {
      const response = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['재시도', '종료'],
        defaultId: 0,
        title: '접근성 권한 필요',
        message: 'Paraglide를 사용하려면 입력 모니터링 및 손쉬운 사용 권한이 필요합니다.',
        detail: '시스템 환경설정 > 보안 및 개인 정보 보호 > 입력 모니터링 및 손쉬운 사용에서 Paraglide의 권한을 허용해주세요.'
      });

      if (response.response === 0) {
        require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_InputMonitoring');
        require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_InputMonitoring');
        // 권한 변경 후 앱 재시작을 유도
        app.relaunch();
        app.exit();
      } else {
        app.quit();
      }
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

  // 테마 감지 메서드 추가
  setupThemeListener() {
    // 초기 테마 설정
    this.updateTheme(nativeTheme.shouldUseDarkColors);

    // 테마 변경 이벤트 리스너
    nativeTheme.on('updated', () => {
      this.updateTheme(nativeTheme.shouldUseDarkColors);
    });
  }

  // 테마 업데이트 메서드
  updateTheme(isDark) {
    console.log('[SystemListener] Theme change detected:', isDark);
    store.dispatch(configActions.updateTheme(isDark));
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
      this.mainWindow.webContents.send(eventName);
      ipcMain.emit(eventName);
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