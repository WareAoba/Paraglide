// SystemListener.js
const { GlobalKeyboardListener } = require("node-global-key-listener");
const ClipboardWatcher = require('electron-clipboard-watcher');
const { ipcMain, app, BrowserWindow } = require('electron');
const path = require('path');
const { execSync } = require('child_process');

class SystemListener {
  constructor() {
    this.programStatus = 'READY';
    this.initialize();
  }

  async initialize() {
    if (process.platform === 'darwin') {
      await this.setupMacPermissions();
    }

    try {
      this.keyboardListener = new GlobalKeyboardListener();
      this.setupListeners();
      console.log('[시스템] 키보드 리스너 초기화 완료');
    } catch (error) {
      console.error('[시스템] 키보드 리스너 초기화 실패:', error);
    }
  }

  async setupMacPermissions() {
    const serverPath = path.join(__dirname, 'node_modules/node-global-key-listener/bin/MacKeyServer');
    
    try {
      // 실행 권한 부여
      execSync(`chmod +x "${serverPath}"`);
      
      // 코드 서명 확인
      const isSigned = execSync(`codesign -v "${serverPath}" 2>&1 || true`).toString();
      if (isSigned.includes('not signed')) {
        console.log('[시스템] MacKeyServer에 코드 서명이 필요합니다.');
        // 자체 서명 시도
        execSync(`codesign --force --deep --sign - "${serverPath}"`);
      }

      if (!app.isAccessibilitySupportEnabled()) {
        // 권한 요청 다이얼로그 표시
        const { dialog } = require('electron');
        dialog.showMessageBox({
          type: 'info',
          message: '접근성 권한이 필요합니다',
          detail: '시스템 환경설정 > 개인정보 보호 및 보안 > 입력 모니터링에서 앱을 허용해주세요.',
          buttons: ['확인']
        });
        
        // 시스템 설정 열기
        execSync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"');
      }
    } catch (error) {
      console.error('[시스템] 권한 설정 중 오류:', error);
    }
  }

  setupListeners() {
    ipcMain.on('state-update', (_, newState) => {
      this.programStatus = newState.programStatus;
    });

    this.setupKeyboardListeners();
    this.setupClipboardWatcher();
  }

  setupKeyboardListeners() {
    this.keyboardListener.addListener((e, down) => {
      // 프로그램이 일시정지 상태일 때는 특정 키만 허용
      if (this.programStatus === 'PAUSE' && e.name === "V") {
        return;
      }

      if (e.state === "DOWN") {
        // Cmd+V 또는 Ctrl+V
        if (e.name === "V" && (down["LEFT CTRL"] || down["RIGHT CTRL"] || 
           down["LEFT META"] || down["RIGHT META"])) {
          this.emitEvent('move-to-next');
          console.log('[단축키] 다음 단락으로 이동 (Ctrl+V)');
        }

        // Alt/Option + 방향키
        if (down["LEFT ALT"] || down["RIGHT ALT"]) {
          switch (e.name) {
            case "LEFT":
              this.emitEvent('move-to-prev');
              console.log('[단축키] 이전 단락으로 이동 (Alt+←)');
              break;
            case "RIGHT":
              this.emitEvent('move-to-next');
              console.log('[단축키] 다음 단락으로 이동 (Alt+→)');
              break;
            case "UP":
              if (this.programStatus === 'PAUSE') {
                this.emitEvent('toggle-pause');
                console.log('[단축키] 재생 (Alt+↑)');
              }
              break;
            case "DOWN":
              if (this.programStatus === 'PROCESS') {
                this.emitEvent('toggle-pause');
                console.log('[단축키] 일시정지 (Alt+↓)');
              }
              break;
          }
        }
      }
    });
  }

  setupClipboardWatcher() {
    ClipboardWatcher({
      watchDelay: 250,
      onTextChange: (text) => {
        this.emitEvent('external-clipboard-change', text);
      }
    });
  }

  emitEvent(channel, ...args) {
    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
    if (mainWindow) {
      mainWindow.webContents.send(channel, ...args);
    }
  }
}

const listener = new SystemListener();
module.exports = listener;