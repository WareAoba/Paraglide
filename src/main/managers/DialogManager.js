// DialogManager.js — 다이얼로그 표시
const { dialog } = require('electron');
const i18next = require('i18next');
const { state } = require('../state');

const DialogManager = {
  DIALOGS: {
    EXIT_CONFIRM: 'EXIT_CONFIRM',
    UNSAVED_CHANGES: 'UNSAVED_CHANGES',
    FILE_ERROR: 'FILE_ERROR',
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    EMPTY_FILE: 'EMPTY_FILE',
    PROCESS_MODE: 'PROCESS_MODE',
    ALREADY_RUNNING: 'ALREADY_RUNNING',
    SWITCH_TO_EXISTING: 'SWITCH_TO_EXISTING',
    FILE_OPEN_ERROR: 'FILE_OPEN_ERROR',
    PARA_DECRYPT: 'PARA_DECRYPT',
    PARA_DECRYPT_FAILED: 'PARA_DECRYPT_FAILED',
    PARA_ENCRYPT: 'PARA_ENCRYPT'
  },

  async show(dialogType, window = state.mainWindow) {
    const defaultOptions = { noLink: true };

    switch (dialogType) {
      case this.DIALOGS.EXIT_CONFIRM:
        return dialog.showMessageBoxSync(window, {
          type: 'warning',
          buttons: [i18next.t('common.buttons.exit'), i18next.t('common.buttons.cancel')],
          defaultId: 1,
          title: i18next.t('dialogs.exitConfirm.title'),
          message: i18next.t('dialogs.exitConfirm.message'),
          cancelId: 1,
          ...defaultOptions
        });

        case this.DIALOGS.UNSAVED_CHANGES:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.exit'), i18next.t('common.buttons.cancel')],
            defaultId: 1,
            title: i18next.t('dialogs.unsavedChanges.title'),
            message: i18next.t('dialogs.unsavedChanges.message'),
            cancelId: 1,
            ...defaultOptions
          });

        case this.DIALOGS.FILE_ERROR:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 0,
            title: i18next.t('dialogs.fileError.title'),
            message: i18next.t('dialogs.fileError.message'),
            ...defaultOptions
          });

        case this.DIALOGS.FILE_NOT_FOUND:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 0,
            title: i18next.t('dialogs.fileNotFound.title'),
            message: i18next.t('dialogs.fileNotFound.message'),
            ...defaultOptions
          });

        case this.DIALOGS.EMPTY_FILE:
          return dialog.showMessageBoxSync(window, {
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 1,
            title: i18next.t('dialogs.emptyFile.title'),
            message: i18next.t('dialogs.emptyFile.message'),
            cancelId: 1,
            normalizeAccessKeys: true,
            ...defaultOptions
          });

        case this.DIALOGS.PROCESS_MODE:
          return dialog.showMessageBox(window, {
            type: 'question',
            buttons: [i18next.t('common.buttons.confirm'), i18next.t('common.buttons.cancel')],
            defaultId: 0,
            title: i18next.t('dialogs.processMode.title'),
            message: i18next.t('dialogs.processMode.message'),
            ...defaultOptions
          });

        case this.DIALOGS.ALREADY_RUNNING:
          return dialog.showMessageBoxSync({
            type: 'warning',
            buttons: [i18next.t('common.buttons.confirm')],
            title: i18next.t('dialogs.alreadyRunning.title'),
            message: i18next.t('dialogs.alreadyRunning.message'),
            detail: i18next.t('dialogs.alreadyRunning.detail'),
            cancelId: 1,
            normalizeAccessKeys: true,
            ...defaultOptions
          });

        case this.DIALOGS.SWITCH_TO_EXISTING:
          return dialog.showMessageBox(window, {
            type: 'info',
            buttons: [i18next.t('common.buttons.confirm')],
            title: i18next.t('dialogs.switchToExisting.title'),
            message: i18next.t('dialogs.switchToExisting.message'),
            detail: i18next.t('dialogs.switchToExisting.detail'),
            cancelId: 1,
            normalizeAccessKeys: true,
            ...defaultOptions
          });

        case this.DIALOGS.FILE_OPEN_ERROR:
          return dialog.showMessageBox(window, {
            type: 'error',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 0,
            title: i18next.t('dialogs.fileOpenError.title'),
            message: i18next.t('dialogs.fileOpenError.message'),
            ...defaultOptions
          });

        case this.DIALOGS.PARA_DECRYPT: {
          // 암호 입력 다이얼로그 — Electron의 prompt는 없으므로 BrowserWindow 기반
          // 간단한 구현: 메시지 박스 + 비밀번호 입력을 위해 커스텀 윈도우 사용
          // 현재는 간단히 기본 다이얼로그로 대체
          const { BrowserWindow } = require('electron');
          return new Promise((resolve) => {
            const promptWin = new BrowserWindow({
              width: 380,
              height: 200,
              resizable: false,
              minimizable: false,
              maximizable: false,
              alwaysOnTop: true,
              modal: true,
              parent: window,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
              },
              show: false,
              autoHideMenuBar: true,
              title: '암호 입력'
            });
            
            const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #1e1e1e; color: #ccc; display: flex; flex-direction: column; justify-content: center; height: calc(100vh - 48px); }
  label { font-size: 14px; margin-bottom: 8px; display: block; }
  input { width: 100%; padding: 8px; font-size: 14px; border: 1px solid #555; border-radius: 4px; background: #2d2d2d; color: #eee; box-sizing: border-box; outline: none; }
  input:focus { border-color: #007bff; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  button { padding: 6px 16px; font-size: 13px; border: 1px solid #555; border-radius: 4px; cursor: pointer; background: #333; color: #eee; }
  button.primary { background: #007bff; border-color: #007bff; color: #fff; }
  button:hover { opacity: 0.9; }
</style></head><body>
  <label>암호화된 .para 파일입니다. 암호를 입력하세요:</label>
  <input type="password" id="pw" placeholder="4~32자" autofocus />
  <div class="buttons">
    <button onclick="cancel()">취소</button>
    <button class="primary" onclick="submit()">확인</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    function submit() { const v = document.getElementById('pw').value; if (v.length >= 4 && v.length <= 32) ipcRenderer.send('para-decrypt-response', v); else alert('암호는 4~32자 사이여야 합니다.'); }
    function cancel() { ipcRenderer.send('para-decrypt-response', null); }
    document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); });
  </script>
</body></html>`;
            
            promptWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
            promptWin.once('ready-to-show', () => promptWin.show());

            const { ipcMain } = require('electron');
            const handler = (_, value) => {
              ipcMain.removeListener('para-decrypt-response', handler);
              promptWin.close();
              resolve(value);
            };
            ipcMain.on('para-decrypt-response', handler);
            promptWin.on('closed', () => {
              ipcMain.removeListener('para-decrypt-response', handler);
              resolve(null);
            });
          });
        }

        case this.DIALOGS.PARA_DECRYPT_FAILED:
          return dialog.showMessageBox(window, {
            type: 'error',
            buttons: [i18next.t('common.buttons.confirm')],
            defaultId: 0,
            title: '복호화 실패',
            message: '암호가 잘못되었습니다.',
            ...defaultOptions
          });

        case this.DIALOGS.PARA_ENCRYPT: {
          // 암호화용 비밀번호 입력 다이얼로그
          const { BrowserWindow: BWEncrypt } = require('electron');
          return new Promise((resolve) => {
            const promptWin = new BWEncrypt({
              width: 380,
              height: 230,
              resizable: false,
              minimizable: false,
              maximizable: false,
              alwaysOnTop: true,
              modal: true,
              parent: window,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
              },
              show: false,
              autoHideMenuBar: true,
              title: '암호화 설정'
            });
            
            const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #1e1e1e; color: #ccc; display: flex; flex-direction: column; justify-content: center; height: calc(100vh - 48px); }
  label { font-size: 14px; margin-bottom: 8px; display: block; }
  input { width: 100%; padding: 8px; font-size: 14px; border: 1px solid #555; border-radius: 4px; background: #2d2d2d; color: #eee; box-sizing: border-box; outline: none; margin-bottom: 8px; }
  input:focus { border-color: #007bff; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  button { padding: 6px 16px; font-size: 13px; border: 1px solid #555; border-radius: 4px; cursor: pointer; background: #333; color: #eee; }
  button.primary { background: #007bff; border-color: #007bff; color: #fff; }
  button:hover { opacity: 0.9; }
  .error { color: #ff6b6b; font-size: 12px; display: none; }
</style></head><body>
  <label>암호화할 암호를 설정하세요 (4~32자):</label>
  <input type="password" id="pw1" placeholder="암호 입력" autofocus />
  <input type="password" id="pw2" placeholder="암호 확인" />
  <div class="error" id="err"></div>
  <div class="buttons">
    <button onclick="cancel()">취소</button>
    <button class="primary" onclick="submit()">암호화 저장</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    function submit() {
      const v1 = document.getElementById('pw1').value;
      const v2 = document.getElementById('pw2').value;
      const err = document.getElementById('err');
      if (v1.length < 4 || v1.length > 32) { err.textContent = '암호는 4~32자 사이여야 합니다.'; err.style.display = 'block'; return; }
      if (v1 !== v2) { err.textContent = '암호가 일치하지 않습니다.'; err.style.display = 'block'; return; }
      ipcRenderer.send('para-encrypt-response', v1);
    }
    function cancel() { ipcRenderer.send('para-encrypt-response', null); }
    document.getElementById('pw2').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); });
  </script>
</body></html>`;
            
            promptWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
            promptWin.once('ready-to-show', () => promptWin.show());

            const { ipcMain: ipcEnc } = require('electron');
            const handler = (_, value) => {
              ipcEnc.removeListener('para-encrypt-response', handler);
              promptWin.close();
              resolve(value);
            };
            ipcEnc.on('para-encrypt-response', handler);
            promptWin.on('closed', () => {
              ipcEnc.removeListener('para-encrypt-response', handler);
              resolve(null);
            });
          });
        }

          default:
        throw new Error(`Unknown dialog type: ${dialogType}`);
    }
  }
};

module.exports = DialogManager;
