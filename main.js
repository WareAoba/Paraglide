// Main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let overlayWindow;
let isAppReady = false;

// 리소스 사전 로드 함수
async function preloadResources() {
  // 필요한 리소스들을 미리 로드
  return new Promise(resolve => {
    // 여기에 필요한 초기화 작업 추가
    resolve();
  });
}

// 전역 상태 관리
let globalState = {
  paragraphs: [],
  currentIndex: 0,
  currentNumber: null,
  isDarkMode: false,
  paragraphsMetadata: [], // 각 단락의 메타데이터 저장
  isPaused: false,
  isOverlayVisible: true,
  timestamp: Date.now()
};

// 디바운스 함수 추가
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 상태 업데이트 함수 최적화
const updateGlobalState = (() => {
  let updatePromise = Promise.resolve();
  
  return async (newState) => {
    updatePromise = updatePromise.then(async () => {
      const prevState = { ...globalState };
      globalState = { ...globalState, ...newState };
      
      // 현재 인덱스의 페이지 번호 찾기
      if ('currentIndex' in newState) {
        const metadata = globalState.paragraphsMetadata[globalState.currentIndex];
        if (metadata) {
          globalState.currentNumber = metadata.pageNumber;
        }
      }

      // 일시정지 상태가 변경된 경우 로깅
      if ('isPaused' in newState && prevState.isPaused !== newState.isPaused) {
        console.log(`[상태 변경] 프로그램 ${newState.isPaused ? '일시정지' : '재개'}`);
      }

      if (JSON.stringify(prevState) !== JSON.stringify(globalState)) {
        // 상태 변경 전파
        await Promise.all([
          mainWindow?.webContents.send('state-updated', globalState),
          overlayWindow?.webContents.send('state-updated', {
            prev: globalState.paragraphs[globalState.currentIndex - 1],
            current: globalState.paragraphs[globalState.currentIndex],
            next: globalState.paragraphs[globalState.currentIndex + 1],
            currentNumber: globalState.currentNumber,
            isDarkMode: globalState.isDarkMode,
            isPaused: globalState.isPaused
          })
        ]);
      }
    });
    
    return updatePromise;
  };
})();

// 오버레이 업데이트를 별도 함수로 분리
async function updateOverlayContent() {
  if (!overlayWindow) return;
  
  const { paragraphs, currentIndex, currentNumber } = globalState;
  const prevParagraph = currentIndex > 0 ? paragraphs[currentIndex - 1] : null;
  const currentParagraph = paragraphs[currentIndex];
  const nextParagraph = currentIndex < paragraphs.length - 1 ? paragraphs[currentIndex + 1] : null;
  
  await overlayWindow.webContents.send('paragraphs-updated', {
    prev: prevParagraph,
    current: currentParagraph,
    next: nextParagraph,
    currentNumber
  });
}

// 1. 앱 초기화 및 윈도우 생성
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // 준비될 때까지 숨김
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.once('ready-to-show', () => {
    if (isAppReady) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow) {
      overlayWindow.close();
      overlayWindow = null;
    }
    process.exit(0);
  });

  // 초기 테마 설정
  mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 175,
    x: 0,
    y: 0,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    titleBarStyle: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadURL('http://localhost:3000/overlay');
  
  // 창 드래그 활성화를 위한 설정
  overlayWindow.setMovable(true);
  overlayWindow.setResizable(true);
  
  // -webkit-app-region: drag CSS 속성이 작동하도록 설정
  overlayWindow.webContents.on('dom-ready', () => {
    overlayWindow.webContents.insertCSS(`
      body { -webkit-app-region: drag; }
      button, input { -webkit-app-region: no-drag; }
    `);
  });

  overlayWindow.once('ready-to-show', () => {
    if (isAppReady) {
      overlayWindow.show();
    }
  });

  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
  });
}

app.whenReady().then(async () => {
  try {
    // 리소스 사전 로드
    await preloadResources();
    
    // 윈도우 생성
    createMainWindow();
    createOverlayWindow();
    
    // IPC 핸들러 등록
    setupIpcHandlers();
    
    // 모든 초기화가 완료됨을 표시
    isAppReady = true;
    
    // 준비된 윈도우 표시
    if (mainWindow?.webContents.isLoading()) {
      mainWindow.once('ready-to-show', () => mainWindow.show());
    } else {
      mainWindow?.show();
    }
    
    if (overlayWindow?.webContents.isLoading()) {
      overlayWindow.once('ready-to-show', () => overlayWindow.show());
    } else {
      overlayWindow?.show();
    }
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

// IPC 핸들러 설정을 별도 함수로 분리
function setupIpcHandlers() {
  ipcMain.handle('get-state', () => globalState);
  ipcMain.on('update-state', (event, newState) => {
    updateGlobalState(newState);
  });
  // ... 기타 IPC 핸들러

  ipcMain.on('toggle-overlay', () => {
    if (overlayWindow) {
      globalState.isOverlayVisible = !globalState.isOverlayVisible;
      if (globalState.isOverlayVisible) {
        overlayWindow.show();
      } else {
        overlayWindow.hide();
      }
      updateGlobalState({ isOverlayVisible: globalState.isOverlayVisible });
    }
  });

  ipcMain.on('toggle-pause', () => {
    globalState.isPaused = !globalState.isPaused;
    console.log(`[상태 변경] 프로그램 ${globalState.isPaused ? '일시정지' : '재개'}`);
    
    // 즉시 모든 윈도우에 상태 전파
    mainWindow?.webContents.send('state-updated', globalState);
    overlayWindow?.webContents.send('state-updated', {
      ...globalState,
      prev: globalState.paragraphs[globalState.currentIndex - 1],
      current: globalState.paragraphs[globalState.currentIndex],
      next: globalState.paragraphs[globalState.currentIndex + 1]
    });
  });
}

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

// 2. IPC 통신 및 파일 처리 핸들러
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  return !result.canceled && result.filePaths.length > 0 ? result.filePaths[0] : null;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.replace(/\r\n/g, '\n');
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
});

ipcMain.on('update-overlay', (event, content) => {
  if (overlayWindow && content) {  // content가 undefined가 아닌지 확인
    overlayWindow.webContents.send('file-content', {
      prev: content.prev || null,
      current: content.current || null,
      next: content.next || null
    });
  }
});

ipcMain.on('resize-overlay', (event, data) => {
  if (!overlayWindow) return;
  const [posX, posY] = overlayWindow.getPosition();
  if (data.edge === 'se') {
    overlayWindow.setSize(
      Math.max(200, parseInt(data.x) - posX),
      Math.max(200, parseInt(data.y) - posY)
    );
  }
});

// main.js의 process-file-content 핸들러 수정
ipcMain.handle('process-file-content', async (event, fileContent) => {
  const splitParagraphs = fileContent
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  let currentNumber = null;
  const paragraphsMetadata = [];
  const paragraphsToDisplay = [];
  let previousWasPageNumber = false;

  splitParagraphs.forEach((p, index) => {
    const pageNum = extractPageNumber(p);
    if (pageNum) {
      currentNumber = pageNum;
      previousWasPageNumber = true;
    } else if (!shouldSkipParagraph(p)) {
      paragraphsToDisplay.push(p);
      paragraphsMetadata.push({
        isPageChange: previousWasPageNumber,
        pageNumber: currentNumber,
        index: paragraphsToDisplay.length - 1
      });
      previousWasPageNumber = false;
    }
  });

  // 상태 즉시 업데이트
  await updateGlobalState({
    paragraphs: paragraphsToDisplay,
    paragraphsMetadata,
    currentNumber,
    currentIndex: 0,
    timestamp: Date.now()
  });

  // 메인 윈도우에 초기 상태 전파
  mainWindow?.webContents.send('state-updated', globalState);
  
  return { success: true };
});

// get-window-position 핸들러 추가
ipcMain.handle('get-window-position', () => {
  if (!overlayWindow) return { x: 0, y: 0 };
  const [x, y] = overlayWindow.getPosition();
  return { x, y };
});

// 상태 변경 핸들러 최적화
ipcMain.on('move-to-next', () => {
  if (globalState.currentIndex < globalState.paragraphs.length - 1) {
    updateGlobalState({ 
      currentIndex: globalState.currentIndex + 1,
      timestamp: Date.now() // 상태 업데이트 타임스탬프 추가
    });
  }
});

ipcMain.on('move-to-prev', () => {
  if (globalState.currentIndex > 0) {
    updateGlobalState({ 
      currentIndex: globalState.currentIndex - 1,
      timestamp: Date.now()
    });
  }
});

// 3. 텍스트 처리 유틸리티 함수
const pagePatterns = {
  numberOnly: /^(\d+)$/,               // "127", "128" 등 숫자로만 이루어진 페이지 번호
  koreanStyle: /^(\d+)(페이지|페)$/,   // "127페이지", "127페" 등 한글이 들어간 페이지 번호
  englishStyle: /^(\d+)(page|p)$/i     // "127page", "127p" 등 영어가 들어간 페이지 번호
};

const skipPatterns = {
  separator: /^[=\-]{3,}/, // === 또는 --- 로 시작하는 단락
  comment: /^[\/\/#]/, // //, # 으로 시작하는 단락
};

const extractPageNumber = (paragraph) => {
  const text = paragraph.trim();
  for (const pattern of Object.values(pagePatterns)) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
};

const shouldSkipParagraph = (paragraph) => {
  // 페이지 번호 패턴도 스킵 대상에 포함
  const isPageNumber = Object.values(pagePatterns).some(pattern => 
    pattern.test(paragraph.trim())
  );
  
  return isPageNumber || Object.values(skipPatterns).some(pattern => 
    pattern.test(paragraph.trim())
  );
};

// Main.js의 텍스트 처리 부분 수정
const processParapraphs = (fileContent) => {
  const splitParagraphs = fileContent
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  let currentNumber = null;
  const paragraphsMetadata = [];
  const paragraphsToDisplay = [];
  let previousWasPageNumber = false;

  splitParagraphs.forEach((p, index) => {
    const pageNum = extractPageNumber(p);
    
    if (pageNum) {
      currentNumber = pageNum;
      previousWasPageNumber = true;
    } else if (!shouldSkipParagraph(p)) {
      // 실제 내용 단락만 추가
      paragraphsToDisplay.push(p);
      paragraphsMetadata.push({
        isPageChange: previousWasPageNumber,
        pageNumber: currentNumber,
        index: paragraphsToDisplay.length - 1
      });
      previousWasPageNumber = false;
    }
  });

  return {
    paragraphsToDisplay,
    paragraphsMetadata,
    currentNumber: currentNumber || null
  };
};
