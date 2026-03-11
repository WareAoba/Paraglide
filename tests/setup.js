// tests/setup.js — Electron 모듈 모킹 (Node.js require cache 직접 override)
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const electronPath = _require.resolve('electron');

// Node.js의 require cache에 직접 mock을 주입
// CJS 모듈(constants.js, state.js)이 require('electron') 호출 시 이 mock을 사용
_require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      getAppPath: () => '/mock/app',
      getPath: () => '/mock/path',
      isReady: () => true,
      on: () => {},
      whenReady: () => Promise.resolve(),
      quit: () => {},
      getName: () => 'Paraglide',
      getVersion: () => '0.0.0'
    },
    ipcMain: {
      on: () => {},
      handle: () => {},
      emit: () => {},
      removeHandler: () => {}
    },
    BrowserWindow: function () {},
    nativeTheme: {
      shouldUseDarkColors: false,
      on: () => {},
      themeSource: 'system'
    },
    screen: {
      getPrimaryDisplay: () => ({
        workAreaSize: { width: 1920, height: 1080 }
      })
    },
    shell: { openExternal: () => {} },
    dialog: { showOpenDialog: () => Promise.resolve({ canceled: true }) }
  }
};
