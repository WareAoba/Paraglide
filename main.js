// main.js
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');

// 설정 파일 경로
const configPath = path.join(os.homedir(), '.ParaglideConfigure.json');

// 설정 저장 함수
async function saveConfig(config) {
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('설정 저장 실패:', error);
  }
}

// 설정 불러오기 함수
async function loadConfig() {
  try {
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// 로그 파일 경로
const logPath = path.join(os.homedir(), '.ParaglideParaLog.json');

// 로그 저장 함수
async function saveLog(log) {
  try {
    await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  } catch (error) {
    console.error('로그 저장 실패:', error);
  }
}

// 로그 불러오기 함수
async function loadLog() {
  try {
    const data = await fs.readFile(logPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// 파일 해시 계산 함수
function getFileHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

let mainWindow;
let overlayWindow;

// 전역 상태 관리
let globalState = {
  paragraphs: [],
  currentParagraph: 0,
  currentNumber: null,
  isDarkMode: nativeTheme.shouldUseDarkColors,
  paragraphsMetadata: [],
  isPaused: false,
  isOverlayVisible: false,
  timestamp: Date.now(),
  visibleRanges: {
    overlay: {
      before: 1,
      after: 1
    }
  }
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

// 단락 접근 함수
const getParagraphByOffset = (baseParagraph, offset = 1) => {
  const targetParagraph = baseParagraph + offset;
  
  if (targetParagraph >= 0 && targetParagraph < globalState.paragraphs.length) {
    return {
      text: globalState.paragraphs[targetParagraph],
      metadata: globalState.paragraphsMetadata[targetParagraph],
      distanceFromCurrent: offset
    };
  }
  return null;
};

// 클립보드 복사 및 로그 저장을 위한 디바운스 함수
const debounceSaveAndCopy = debounce(async () => {
  await saveCurrentPositionToLog();

  const currentParagraphContent = globalState.paragraphs[globalState.currentParagraph];
  if (currentParagraphContent) {
    clipboard.writeText(currentParagraphContent);
  }
}, 500);

// 로그 저장 함수 수정 (예외 처리 포함)
async function saveCurrentPositionToLog() {
  try {
    const log = await loadLog();

    const currentFilePath = globalState.currentFilePath;
    const fileHash = getFileHash(globalState.paragraphs.join('\n\n'));

    if (currentFilePath) {
      log[currentFilePath] = {
        fileHash,
        filePath: currentFilePath,
        currentParagraph: globalState.currentParagraph
      };
      await saveLog(log);
    }
  } catch (error) {
    console.error('로그 저장 중 에러 발생:', error);
  }
}

// 오버레이 업데이트를 별도 함수로 분리 (예외 처리 포함)
async function updateOverlayContent() {
  try {
    if (!overlayWindow) return;
    
    const { paragraphs, currentParagraph, currentNumber, visibleRanges } = globalState;
    const { before, after } = visibleRanges.overlay;

    const prevParagraphs = [];
    const nextParagraphs = [];

    for (let i = 1; i <= before; i++) {
      const prev = getParagraphByOffset(currentParagraph, -i);
      if (prev) prevParagraphs.push(prev);
    }

    for (let i = 1; i <= after; i++) {
      const next = getParagraphByOffset(currentParagraph, i);
      if (next) nextParagraphs.push(next);
    }

    await overlayWindow.webContents.send('paragraphs-updated', {
      previous: prevParagraphs,
      current: paragraphs[currentParagraph],
      next: nextParagraphs,
      currentNumber,
      isDarkMode: globalState.isDarkMode,
      isPaused: globalState.isPaused
    });
  } catch (error) {
    console.error('오버레이 업데이트 중 에러 발생:', error);
  }
}

// 상태 업데이트 함수 최적화
const updateGlobalState = (() => {
  let updatePromise = Promise.resolve();

  return (newState, source = 'other') => {
    updatePromise = updatePromise.then(async () => {
      try {
        const prevState = { ...globalState };
        globalState = { ...globalState, ...newState };

        if ('currentParagraph' in newState) {
          const metadata = globalState.paragraphsMetadata[globalState.currentParagraph];
          if (metadata) {
            globalState.currentNumber = metadata.pageNumber;
          }
        }

        if ('isPaused' in newState && prevState.isPaused !== newState.isPaused) {
          console.log(`[상태 변경] 프로그램 ${newState.isPaused ? '일시정지' : '재개'}`);
        }

        if ('currentParagraph' in newState && prevState.currentParagraph !== globalState.currentParagraph) {
          if (source === 'move') {
            debounceSaveAndCopy();
          } else {
            await saveCurrentPositionToLog();

            const currentParagraphContent = globalState.paragraphs[globalState.currentParagraph];
            if (currentParagraphContent) {
              clipboard.writeText(currentParagraphContent);
            }
          }
        }

        if ('isOverlayVisible' in newState && prevState.isOverlayVisible !== globalState.isOverlayVisible) {
          if (globalState.isOverlayVisible && overlayWindow) {
            overlayWindow.show();
          } else if (overlayWindow) {
            overlayWindow.hide();
          }
        }

        if (JSON.stringify(prevState) !== JSON.stringify(globalState)) {
          const { currentParagraph, isOverlayVisible } = globalState;

          if (isOverlayVisible && overlayWindow) {
            await updateOverlayContent();
          }

          mainWindow?.webContents.send('state-updated', globalState);
        }
      } catch (error) {
        console.error('updateGlobalState 중 에러 발생:', error);
      }
    }).catch(error => {
      console.error('updateGlobalState Promise 체인에서 에러 발생:', error);
    });

    return updatePromise;
  };
})();

// 프로그램 종료 로직을 담당하는 함수
async function handleExitProgram() {
  if (mainWindow) mainWindow.hide();
  if (overlayWindow) overlayWindow.hide();

  try {
    await saveCurrentPositionToLog();
    await saveLog(globalState);
    await saveConfig(globalState);
  } catch (error) {
    console.error('종료 시 백엔드 작업 중 에러 발생:', error);
  } finally {
    app.quit();
  }
}

// 앱 초기화 및 윈도우 생성
function createMainWindow() {
  const minWidth = 600;
  const minHeight = 660;
  const maxWidth = 1300;
  const maxHeight = 900;

  globalState.isDarkMode = nativeTheme.shouldUseDarkColors;

  mainWindow = new BrowserWindow({
    width: minWidth,
    height: minHeight,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    show: false,
    title: 'Paraglide',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.once('ready-to-show', () => {
    mainWindow.webContents.send('theme-changed', globalState.isDarkMode);
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow) {
      overlayWindow.close();
      overlayWindow = null;
    }
    handleExitProgram();
  });

  mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
}

// 오버레이 창 생성 함수
function createOverlayWindow() {
  const minHeight = 240;
  const minWidth = 400;
  const maxHeight = 600;
  const maxWidth = 400;

  overlayWindow = new BrowserWindow({
    width: globalState.overlayBounds?.width || minWidth,
    height: globalState.overlayBounds?.height || minHeight,
    x: globalState.overlayBounds?.x,
    y: globalState.overlayBounds?.y,
    minHeight,
    minWidth,
    maxHeight,
    maxWidth,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    show: false, // 초기에는 숨김 상태
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.loadURL('http://localhost:3000/overlay');

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.webContents.send('theme-changed', globalState.isDarkMode);
    if (globalState.isOverlayVisible) {
      overlayWindow.show();
    }
  });

  const saveOverlayBounds = () => {
    globalState.overlayBounds = overlayWindow.getBounds();
    saveConfig({ overlayBounds: globalState.overlayBounds });
  };

  overlayWindow.on('move', saveOverlayBounds);
  overlayWindow.on('resize', saveOverlayBounds);
}

// IPC 핸들러 설정
function setupIpcHandlers() {
  ipcMain.handle('get-state', () => globalState);
  
  ipcMain.on('update-state', (event, newState) => {
    updateGlobalState(newState);
  });

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
    updateGlobalState({ isPaused: globalState.isPaused });
  });

  ipcMain.on('move-to-next', () => {
    if (globalState.currentParagraph < globalState.paragraphs.length - 1) {
      updateGlobalState({ 
        currentParagraph: globalState.currentParagraph + 1,
        timestamp: Date.now()
      }, 'move');
    }
  });

  ipcMain.on('move-to-prev', () => {
    if (globalState.currentParagraph > 0) {
      updateGlobalState({ 
        currentParagraph: globalState.currentParagraph - 1,
        timestamp: Date.now()
      }, 'move');
    }
  });

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
    if (overlayWindow && content) {
      overlayWindow.webContents.send('paragraphs-updated', {
        previous: content.prev || [],
        current: content.current || null,
        next: content.next || []
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

  ipcMain.handle('process-file-content', async (event, fileContent, filePath) => {
    const result = processParagraphs(fileContent);
    
    const fileHash = getFileHash(fileContent);
    
    const log = await loadLog();
    
    let previousLogEntry = null;

    for (const [key, entry] of Object.entries(log)) {
      if (entry.fileHash === fileHash || entry.filePath === filePath) {
        previousLogEntry = entry;
        break;
      }
    }
    
    let currentParagraph = 0;
    
    if (previousLogEntry) {
      currentParagraph = previousLogEntry.currentParagraph || 0;
    }
    
    await updateGlobalState({
      paragraphs: result.paragraphsToDisplay,
      paragraphsMetadata: result.paragraphsMetadata,
      currentNumber: result.currentNumber,
      currentParagraph,
      currentFilePath: filePath,
      timestamp: Date.now(),
      isOverlayVisible: true // 오버레이 표시 상태 설정
    });

    if (overlayWindow) {
      overlayWindow.show();
    }
    
    log[filePath] = {
      fileHash,
      filePath,
      currentParagraph: globalState.currentParagraph
    };
    await saveLog(log);
    
    return { success: true };
  });

  ipcMain.handle('get-window-position', () => {
    if (!overlayWindow) return { x: 0, y: 0 };
    const [x, y] = overlayWindow.getPosition();
    return { x, y };
  });

  ipcMain.on('exit-program', async () => {
    await handleExitProgram();
  });
}

// 앱 초기화 시점에서 테마 설정
app.whenReady().then(async () => {
  try {
    globalState.isDarkMode = nativeTheme.shouldUseDarkColors;

    nativeTheme.on('updated', () => {
      globalState.isDarkMode = nativeTheme.shouldUseDarkColors;
      mainWindow?.webContents.send('theme-changed', globalState.isDarkMode);
      overlayWindow?.webContents.send('theme-changed', globalState.isDarkMode);
    });

    const savedConfig = await loadConfig();
    if (savedConfig.overlayBounds) {
      globalState.overlayBounds = savedConfig.overlayBounds;
    }

    createMainWindow();
    createOverlayWindow();
    setupIpcHandlers();
    
    mainWindow?.show();
  } catch (error) {
    console.error('Application initialization failed:', error);
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
  comment: /^[\/\/#]/,       // //, # 으로 시작하는 단락
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
const processParagraphs = (fileContent) => {
  const splitParagraphs = fileContent
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  let currentNumber = null;
  const paragraphsMetadata = [];
  const paragraphsToDisplay = [];
  let previousWasPageNumber = false;

  splitParagraphs.forEach((p) => {
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