const { app, BrowserWindow, dialog, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let overlayWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  // 메인 창이 닫힐 때 모든 프로세스 종료
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow) {
      overlayWindow.close();
      overlayWindow = null;
    }
    // 로컬 서버와 앱 종료
    process.exit(0);
  });

  // 초기 테마 설정
  mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);

  // 시스템 테마 변경 감지
  nativeTheme.on('updated', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
    if (overlayWindow) {
      overlayWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
    }
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadURL('http://localhost:3000/overlay');

  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
  });
}

app.on('ready', () => {
  createMainWindow();
  createOverlayWindow();

  // 파일 선택 다이얼로그 핸들러
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Text Files', extensions: ['txt'] }
      ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // 파일 읽기 핸들러
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      console.log('File content read:', content.substring(0, 100) + '...'); // 디버깅
      return content;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  });

  ipcMain.on('update-overlay', (event, content) => {
    overlayWindow.webContents.send('file-content', content);
  });

  // 창 이동을 위한 IPC 핸들러
  ipcMain.on('move-overlay', (event, coords) => {
    if (!overlayWindow) return;
    
    try {
      const x = Math.round(coords.x);
      const y = Math.round(coords.y);
      overlayWindow.setPosition(x, y);
    } catch (error) {
      console.error('Error moving window:', error);
    }
  });

  // 창 크기 조절을 위한 IPC 핸들러
  ipcMain.on('resize-overlay', (event, data) => {
    if (!overlayWindow) return;
    
    const x = parseInt(data.x) || 0;
    const y = parseInt(data.y) || 0;
    const edge = data.edge;
    
    try {
      const [posX, posY] = overlayWindow.getPosition();
      if (edge === 'se') {
        const newWidth = Math.max(200, x - posX);
        const newHeight = Math.max(200, y - posY);
        overlayWindow.setSize(newWidth, newHeight);
      }
    } catch (error) {
      console.error('Error resizing window:', error);
    }
  });


  ipcMain.handle('get-window-position', () => {
    if (!overlayWindow) return { x: 0, y: 0 };
    const [x, y] = overlayWindow.getPosition();
    return { x, y };
  });

  ipcMain.on('move-overlay', (event, { x, y }) => {
    if (!overlayWindow) return;
    try {
      overlayWindow.setPosition(Math.round(x), Math.round(y));
    } catch (error) {
      console.error('Error moving window:', error);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    createOverlayWindow();
  }
});