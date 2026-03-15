// tests/__mocks__/electron.js — Vitest용 electron 모킹 모듈
module.exports = {
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
};
