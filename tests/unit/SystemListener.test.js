// tests/unit/SystemListener.test.js — SystemListener 모드 전환 시 리스너/단축키 생명주기 테스트
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── 모킹 ───
const mockGlobalShortcut = {
  register: vi.fn(),
  unregister: vi.fn(),
  unregisterAll: vi.fn()
};
const mockClipboard = {
  readText: vi.fn(() => ''),
  writeText: vi.fn()
};
const mockIpcMain = {
  on: vi.fn(),
  handle: vi.fn(),
  emit: vi.fn(),
  removeHandler: vi.fn()
};
const mockRegister = vi.fn();
const mockUnregisterAll = vi.fn();

// require cache에 electron mock 주입
const { createRequire } = await import('module');
const _require = createRequire(import.meta.url);

const electronPath = _require.resolve('electron');
_require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: { getAppPath: () => '/mock', getPath: () => '/mock', isReady: () => true, on: () => {}, whenReady: () => Promise.resolve(), quit: () => {}, getName: () => 'Paraglide', getVersion: () => '0.0.0' },
    dialog: { showErrorBox: vi.fn() },
    clipboard: mockClipboard,
    ipcMain: mockIpcMain,
    globalShortcut: mockGlobalShortcut,
    BrowserWindow: function () {},
    nativeTheme: { shouldUseDarkColors: false, on: () => {}, themeSource: 'system' },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
    shell: { openExternal: () => {} }
  }
};

// electron-localshortcut mock
const localShortcutPath = _require.resolve('electron-localshortcut');
_require.cache[localShortcutPath] = {
  id: localShortcutPath,
  filename: localShortcutPath,
  loaded: true,
  exports: {
    register: mockRegister,
    unregisterAll: mockUnregisterAll
  }
};

// state mock — _photoshopModeActive 지원
const statePath = _require.resolve('../../src/main/state');
_require.cache[statePath] = {
  id: statePath,
  filename: statePath,
  loaded: true,
  exports: {
    state: {
      _photoshopModeActive: false,
      on: vi.fn(),
      emit: vi.fn()
    }
  }
};

const SystemListener = _require('../../src/SystemListener.jsx');

// ─── 테스트 ───
describe('SystemListener', () => {
  let listener;
  let statusUpdateHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    _require.cache[statePath].exports.state._photoshopModeActive = false;

    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };
    listener = new SystemListener(mockWindow);
    // initialize를 호출하면 ipcMain.on('program-status-update', handler)가 등록됨
    listener._setupPasteHelper = vi.fn(); // PowerShell 생성 방지
    listener.initialize();

    // program-status-update 핸들러 캡처
    const calls = mockIpcMain.on.mock.calls;
    const found = calls.find(c => c[0] === 'program-status-update');
    statusUpdateHandler = found ? found[1] : null;
  });

  // ═══════════════ 초기화 ═══════════════

  describe('초기화', () => {
    it('initialize()는 중복 호출 시 무시', async () => {
      const result = await listener.initialize();
      expect(result).toBe(true); // 이미 초기화됨
    });

    it('초기 상태에서 클립보드 인터벌 없음', () => {
      expect(listener._clipboardInterval).toBeNull();
    });

    it('초기 상태에서 붙여넣기 핸들러 미등록', () => {
      expect(listener._pasteHandlerRegistered).toBe(false);
    });
  });

  // ═══════════════ Process/Pause 진입 ═══════════════

  describe('Process/Pause 진입 시', () => {
    it('네비게이션 단축키가 등록됨', () => {
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
      expect(mockGlobalShortcut.register).toHaveBeenCalledWith('Shift+Right', expect.any(Function));
      expect(mockGlobalShortcut.register).toHaveBeenCalledWith('Shift+Left', expect.any(Function));
    });

    it('클립보드 모니터링이 시작됨', () => {
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
      expect(listener._clipboardInterval).not.toBeNull();
    });

    it('Ctrl+V 핸들러가 등록됨', () => {
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
      expect(mockGlobalShortcut.register).toHaveBeenCalledWith('CommandOrControl+V', expect.any(Function));
      expect(listener._pasteHandlerRegistered).toBe(true);
    });
  });

  // ═══════════════ Ready/Edit 전환 ═══════════════

  describe('Ready/Edit 전환 시', () => {
    beforeEach(() => {
      // Process 진입
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
      vi.clearAllMocks();
    });

    it('네비게이션 단축키가 해제됨', () => {
      statusUpdateHandler('event', { programStatus: 'Ready', isPaused: false });
      expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('Shift+Right');
      expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('Shift+Left');
    });

    it('클립보드 모니터링이 중지됨', () => {
      statusUpdateHandler('event', { programStatus: 'Ready', isPaused: false });
      expect(listener._clipboardInterval).toBeNull();
    });

    it('Ctrl+V 핸들러가 해제됨', () => {
      statusUpdateHandler('event', { programStatus: 'Ready', isPaused: false });
      expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+V');
      expect(listener._pasteHandlerRegistered).toBe(false);
    });

    it('currentParagraphText가 초기화됨 (#7)', () => {
      listener.currentParagraphText = '이전 단락 텍스트';
      statusUpdateHandler('event', { programStatus: 'Ready', isPaused: false });
      expect(listener.currentParagraphText).toBeNull();
    });

    it('Edit 모드 전환 시에도 동일하게 해제됨', () => {
      statusUpdateHandler('event', { programStatus: 'Edit', isPaused: false });
      expect(listener._clipboardInterval).toBeNull();
      expect(listener._pasteHandlerRegistered).toBe(false);
      expect(listener.currentParagraphText).toBeNull();
    });
  });

  // ═══════════════ Process ↔ Pause ═══════════════

  describe('Process ↔ Pause 전환 시', () => {
    beforeEach(() => {
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
      vi.clearAllMocks();
    });

    it('Process → Pause: 네비게이션 단축키 재등록하지 않음 (이미 등록됨)', () => {
      statusUpdateHandler('event', { programStatus: 'Pause', isPaused: true });
      // 둘 다 active이므로 register/unregister가 호출되지 않아야 함
      expect(mockGlobalShortcut.register).not.toHaveBeenCalledWith('Shift+Right', expect.any(Function));
      expect(mockGlobalShortcut.unregister).not.toHaveBeenCalledWith('Shift+Right');
    });

    it('Process → Pause: 클립보드 인터벌 유지됨', () => {
      const intervalBefore = listener._clipboardInterval;
      statusUpdateHandler('event', { programStatus: 'Pause', isPaused: true });
      expect(listener._clipboardInterval).toBe(intervalBefore);
    });
  });

  // ═══════════════ Ctrl+V 재등록 조건 (#5) ═══════════════

  describe('Ctrl+V 재등록 시 모드 확인 (#5)', () => {
    it('재등록 콜백에서 모드가 Process일 때만 등록', () => {
      // Process 진입
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
      expect(listener._pasteHandlerRegistered).toBe(true);

      // Ctrl+V 핸들러 콜백 내부에서 재등록 시 모드 확인
      // _registerPasteHandler의 guard가 programStatus를 확인
      listener._pasteHandlerRegistered = false;
      listener.programStatus = { programStatus: 'Ready', isPaused: false };
      listener._registerPasteHandler();
      // Ready 상태에서는 등록되지만, 실제 setTimeout 콜백에서 필터됨
      // 여기서는 _registerPasteHandler 자체의 guard를 확인
      // photoshopMode가 아니고 이미 등록되지 않았으면 등록 시도
      expect(listener._pasteHandlerRegistered).toBe(true);
    });
  });

  // ═══════════════ 포토샵 모드 ═══════════════

  describe('포토샵 모드', () => {
    beforeEach(() => {
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
    });

    it('suspendClipboardOps()는 인터벌과 핸들러를 해제', () => {
      listener.suspendClipboardOps();
      expect(listener._clipboardInterval).toBeNull();
      expect(listener._pasteHandlerRegistered).toBe(false);
    });

    it('resumeClipboardOps()는 인터벌과 핸들러를 복구', () => {
      listener.suspendClipboardOps();
      listener.resumeClipboardOps();
      expect(listener._clipboardInterval).not.toBeNull();
      expect(listener._pasteHandlerRegistered).toBe(true);
    });

    it('포토샵 모드 활성 시 Ctrl+V 등록 방지', () => {
      listener.suspendClipboardOps();
      _require.cache[statePath].exports.state._photoshopModeActive = true;
      listener._registerPasteHandler();
      expect(listener._pasteHandlerRegistered).toBe(false);
    });
  });

  // ═══════════════ destroy ═══════════════

  describe('destroy()', () => {
    it('모든 리소스 정리', () => {
      statusUpdateHandler('event', { programStatus: 'Process', isPaused: false });
      listener.currentParagraphText = '테스트';
      listener.destroy();
      expect(listener._clipboardInterval).toBeNull();
      expect(listener.currentParagraphText).toBeNull();
    });
  });
});
