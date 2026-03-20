// SystemListener.js — 클립보드 모니터링 + 글로벌/앱 내 단축키
const { app, dialog, clipboard, ipcMain, globalShortcut } = require('electron');
const { register, unregisterAll } = require('electron-localshortcut');
const { spawn } = require('child_process');
const { state } = require('./main/state');

// IPCManager를 lazy require로 가져옴 (초기화 순서 보장)
let _ipcManager = null;
function getIPCManager() {
	if (!_ipcManager) {
		_ipcManager = require('./main/managers/IPCManager');
	}
	return _ipcManager;
}

class SystemListener {
	constructor(mainWindow) {
		this.mainWindow = mainWindow;
		this.isInternalClipboardChange = false;
		this.lastInternalChangeTime = 0;
		this.lastClipboardText = '';
		this.programStatus = { isPaused: false };
		this.currentParagraphText = null;
		this._initialized = false;
		this._clipboardInterval = null;
		this._psProcess = null;
		this._psReady = false;
		this._hasXdotool = false;
		this._pasteHandlerRegistered = false;
	}

	// 초기화 (중복 호출 시 guard로 보호)
	async initialize() {
		if (this._initialized) {
			console.warn('[SystemListener] 이미 초기화됨 — 재초기화 무시');
			return true;
		}

		try {
			ipcMain.on('program-status-update', (event, status) => {
				const prevStatus = this.programStatus?.programStatus;
				this.programStatus = status;

				// Process 상태 진입 시 클립보드 기준값 갱신 (Ready 동안 변경된 내용을 오감지하지 않도록)
				if (prevStatus !== 'Process' && status?.programStatus === 'Process') {
					this.lastClipboardText = clipboard.readText();
				}

				// Process/Pause → 네비게이션 단축키 + 클립보드 기능 등록, 그 외(Ready/Edit) → 해제
				const isActive = status?.programStatus === 'Process' || status?.programStatus === 'Pause';
				const wasActive = prevStatus === 'Process' || prevStatus === 'Pause';
				if (isActive && !wasActive) {
					this._registerNavigationShortcuts();
					this._startClipboardMonitor();
					this._registerPasteHandler();
				} else if (!isActive && wasActive) {
					this._unregisterNavigationShortcuts();
					this._stopClipboardMonitor();
					this._unregisterPasteHandler();
					this.currentParagraphText = null;
				}
			});

			this.setupKeyboardListener();
			this.setupAppShortcuts();
			this._initialized = true;
			console.log('[SystemListener] 초기화 완료');
			return true;
		} catch (error) {
			console.error('[SystemListener] 초기화 실패:', error);
			return false;
		}
	}

	// ═══════════════ 클립보드 모니터링 ═══════════════

	/** Process/Pause 진입 시 클립보드 변경 감시 시작 */
	_startClipboardMonitor() {
		if (this._clipboardInterval) return; // 이미 실행 중
		if (state._photoshopModeActive) return; // 포토샵 모드에서는 클립보드 감시 불필요
		this.lastClipboardText = clipboard.readText();

		this._clipboardInterval = setInterval(() => {
			if (this.programStatus?.programStatus !== 'Process') return;

			const currentText = clipboard.readText();
			if (currentText !== this.lastClipboardText) {
				console.log('[SystemListener] 클립보드 변경 감지');
				this.onClipboardChange(currentText);
				this.lastClipboardText = currentText;
			}
		}, 500);
	}

	/** Ready/Edit 전환 시 클립보드 변경 감시 중지 */
	_stopClipboardMonitor() {
		if (this._clipboardInterval) {
			clearInterval(this._clipboardInterval);
			this._clipboardInterval = null;
		}
	}

	/**
	 * 클립보드 변경 처리
	 * 
	 * 동작 의도:
	 *   사용자가 앱 외부에서 텍스트를 복사하면, 현재 진행 중인 단락 복사 흐름이
	 *   외부 복사 내용으로 덮어써질 수 있으므로 자동으로 일시정지합니다.
	 *   - isPaused 상태이면 무시 (이미 정지됨)
	 *   - 내부 복사(앱이 클립보드에 쓴 것)인 경우 500ms 이내면 무시
	 *   - 그 외 → 외부 복사로 판단하고 자동 일시정지
	 */
	onClipboardChange(text) {
		const now = Date.now();
		if (this.programStatus?.isPaused) {
			return;
		}

		if (this.isInternalClipboardChange && (now - this.lastInternalChangeTime) < 500) {
			this.isInternalClipboardChange = false;
			return;
		}

		if (this.mainWindow?.isDestroyed()) return;
		getIPCManager().handlePause();
		console.log('[클립보드] 외부 복사 감지 → 자동 일시정지');
	}

	setCurrentParagraphText(text) {
		this.currentParagraphText = text;
	}

	// 내부 클립보드 변경 알림
	notifyInternalClipboardChange() {
		this.isInternalClipboardChange = true;
		this.lastInternalChangeTime = Date.now();
	}

	// ═══════════════ 글로벌 키보드 단축키 (electron globalShortcut) ═══════════════
	// 다른 앱에 포커스가 있어도 동작하는 네비게이션 단축키

	setupKeyboardListener() {
		try {
			// ── Ctrl+V 붙여넣기 헬퍼 준비 (PowerShell/osascript/xdotool) ──
			this._setupPasteHelper();

			// Ctrl+V 핸들러와 네비게이션 단축키는 Process/Pause 진입 시에만 등록됨
			console.log('[SystemListener] 글로벌 키보드 리스너 설정 완료 (단축키는 Process/Pause 시 등록)');
		} catch (error) {
			console.error('[SystemListener] 글로벌 키보드 리스너 설정 실패:', error);
		}
	}

	clearKeyboardListener() {
		try {
			this._pasteHandlerRegistered = false;
			globalShortcut.unregisterAll();
			// PowerShell 프로세스 종료
			if (this._psProcess) {
				try {
					this._psProcess.stdin.end();
					this._psProcess.kill();
				} catch {}
				this._psProcess = null;
				this._psReady = false;
			}
			console.log('[SystemListener] 글로벌 단축키 해제됨');
		} catch (error) {
			console.error('[SystemListener] 글로벌 단축키 해제 중 오류:', error);
		}
	}

	// ═══════════════ 네비게이션 단축키 등록/해제 (Process/Pause 전용) ═══════════════

	_registerNavigationShortcuts() {
		try {
			globalShortcut.register('Shift+Right', () => this.moveToNext());
			globalShortcut.register('Shift+Left', () => this.moveToPrev());
			globalShortcut.register('Shift+Up', () => this.toggleResume());
			globalShortcut.register('Shift+Down', () => this.togglePause());
			globalShortcut.register('Shift+Alt+Right', () => this.moveToNextPage());
			globalShortcut.register('Shift+Alt+Left', () => this.moveToPrevPage());
			globalShortcut.register('Shift+Alt+Up', () => this.toggleOverlay());
			console.log('[SystemListener] 네비게이션 단축키 등록됨 (Process/Pause)');
		} catch (error) {
			console.error('[SystemListener] 네비게이션 단축키 등록 실패:', error);
		}
	}

	_unregisterNavigationShortcuts() {
		try {
			globalShortcut.unregister('Shift+Right');
			globalShortcut.unregister('Shift+Left');
			globalShortcut.unregister('Shift+Up');
			globalShortcut.unregister('Shift+Down');
			globalShortcut.unregister('Shift+Alt+Right');
			globalShortcut.unregister('Shift+Alt+Left');
			globalShortcut.unregister('Shift+Alt+Up');
			console.log('[SystemListener] 네비게이션 단축키 해제됨 (Ready/Edit)');
		} catch (error) {
			console.error('[SystemListener] 네비게이션 단축키 해제 실패:', error);
		}
	}

	// ═══════════════ Ctrl+V 붙여넣기 감지 ═══════════════
	// globalShortcut으로 Ctrl+V를 가로챈 뒤, 플랫폼 네이티브로 키를 재주입

	/**
	 * 플랫폼별 붙여넣기 시뮬레이션 헬퍼 준비
	 * Windows: PowerShell 백그라운드 프로세스 + keybd_event
	 *   → V키만 송신하므로 물리적 Ctrl 상태를 유지
	 *   → 연속 Ctrl+V가 정상 동작
	 * macOS: osascript 사용
	 */
	_setupPasteHelper() {
		if (process.platform === 'win32') {
			try {
				this._psProcess = spawn('powershell.exe', [
					'-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command', '-'
				], {
					stdio: ['pipe', 'pipe', 'pipe'],
					windowsHide: true
				});

				// Add-Type으로 keybd_event 로드 (한 번만)
				this._psProcess.stdin.write(
					`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; ` +
					`public class PGKey { ` +
					`[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo); ` +
					`public static void SendV() { keybd_event(0x56, 0, 0, 0); keybd_event(0x56, 0, 2, 0); } ` +
					`}'\n`
				);

				this._psProcess.on('error', (err) => {
					console.error('[SystemListener] PowerShell 프로세스 오류:', err);
					this._psProcess = null;
					this._psReady = false;
				});

				this._psProcess.on('exit', () => {
					this._psProcess = null;
					this._psReady = false;
				});

				// Add-Type 완료 대기 (stdout으로 확인)
				this._psProcess.stdin.write('Write-Host "READY"\n');
				this._psProcess.stdout.once('data', () => {
					this._psReady = true;
					console.log('[SystemListener] PowerShell 붙여넣기 헬퍼 준비 완료');
				});
			} catch (error) {
				console.error('[SystemListener] PowerShell 헬퍼 생성 실패:', error);
			}
		} else if (process.platform === 'linux') {
			// Linux: xdotool 존재 여부 확인
			const { execFileSync } = require('child_process');
			try {
				execFileSync('which', ['xdotool'], { stdio: 'ignore' });
				this._hasXdotool = true;
				console.log('[SystemListener] xdotool 감지됨 — Linux 붙여넣기 헬퍼 준비 완료');
			} catch {
				this._hasXdotool = false;
				console.warn('[SystemListener] xdotool 미설치 — Linux 붙여넣기 시뮬레이션 불가. sudo apt install xdotool');
			}
		}
		// macOS: osascript 기본 내장이므로 별도 준비 불필요
	}

	/**
	 * Ctrl+V 글로벌 단축키 등록 (Process/Pause 진입 시 호출)
	 * 
	 * 동작 흐름:
	 *   1. globalShortcut이 Ctrl+V를 가로챔 (실제 붙여넣기 차단됨)
	 *   2. 클립보드 내용이 현재 단락과 일치하면 → 다음 단락으로 이동
	 *   3. 등록 해제 → 네이티브로 키 재주입 → 실제 붙여넣기 수행
	 *   4. 재주입 완료 후 재등록 (단, 여전히 Process/Pause 상태일 때만)
	 */
	_registerPasteHandler() {
		if (this._pasteHandlerRegistered) return;
		if (state._photoshopModeActive) return;

		try {
			globalShortcut.register('CommandOrControl+V', () => {
				const clipboardText = clipboard.readText();

				// 붙여넣은 내용이 Paraglide가 복사한 단락이면 → 다음 단락 이동
				if (!this.programStatus?.isPaused &&
					this.currentParagraphText &&
					clipboardText === this.currentParagraphText) {
					console.log('[붙여넣기 감지] Ctrl+V → 다음 단락 이동');
					this.moveToNext();
				}

				// 실제 붙여넣기를 위해 등록 해제 후 키 재주입
				this._pasteHandlerRegistered = false;
				globalShortcut.unregister('CommandOrControl+V');
				this._simulatePaste(() => {
					// 재주입 완료 후 재등록 — 여전히 활성 모드일 때만
					setTimeout(() => {
						const status = this.programStatus?.programStatus;
						if (status === 'Process' || status === 'Pause') {
							this._registerPasteHandler();
						}
					}, 50);
				});
			});
			this._pasteHandlerRegistered = true;
		} catch (error) {
			console.error('[SystemListener] Ctrl+V 핸들러 등록 실패:', error);
		}
	}

	/** Ctrl+V 핸들러 해제 (Ready/Edit 전환 시 호출) */
	_unregisterPasteHandler() {
		if (this._pasteHandlerRegistered) {
			try {
				globalShortcut.unregister('CommandOrControl+V');
			} catch {}
			this._pasteHandlerRegistered = false;
		}
	}

	/**
	 * V키만 송신 (물리적 Ctrl/Cmd 상태 유지)
	 * Windows: keybd_event(V down/up) — 물리 Ctrl과 합쳐져 Ctrl+V로 인식
	 * macOS:   CGEvent로 V키만 송신 — 물리 Cmd 상태 유지, 접근성 권한 불필요
	 * Linux:   xdotool key --clearmodifiers v — 물리 Ctrl 상태 유지
	 */
	_simulatePaste(callback) {
		if (process.platform === 'win32' && this._psProcess && this._psReady) {
			// Windows: 상주 PowerShell에 V키 down/up 명령 전송
			this._psProcess.stdin.write('[PGKey]::SendV()\n');
			setTimeout(() => callback?.(), 30);
		} else if (process.platform === 'darwin') {
			// macOS: CGEvent를 사용해 V키만 전송 (물리 Cmd 유지, 접근성 권한 불필요)
			const { execFile } = require('child_process');
			const script = `
				use framework "CoreGraphics"
				set vDown to current application's CGEventCreateKeyboardEvent(missing value, 9, true)
				set vUp to current application's CGEventCreateKeyboardEvent(missing value, 9, false)
				current application's CGEventPost(current application's kCGHIDEventTap, vDown)
				current application's CGEventPost(current application's kCGHIDEventTap, vUp)
			`;
			execFile('osascript', ['-l', 'AppleScript', '-e', script], (err) => {
				if (err) console.error('[SystemListener] 붙여넣기 시뮬레이션 실패:', err);
				callback?.();
			});
		} else if (process.platform === 'linux' && this._hasXdotool) {
			// Linux: xdotool로 V키만 전송 (물리 Ctrl 상태는 OS가 유지)
			const { execFile } = require('child_process');
			execFile('xdotool', ['key', '--clearmodifiers', 'v'], (err) => {
				if (err) console.error('[SystemListener] 붙여넣기 시뮬레이션 실패:', err);
				callback?.();
			});
		} else {
			// 지원되지 않는 플랫폼 — 붙여넣기 재주입 불가
			console.warn('[SystemListener] 현재 플랫폼에서 붙여넣기 시뮬레이션 미지원');
			callback?.();
		}
	}

	// ═══════════════ 앱 내 단축키 (electron-localshortcut) ═══════════════
	// Paraglide 윈도우가 포커스된 상태에서만 동작

	setupAppShortcuts() {
		try {
			if (!this.mainWindow) {
				throw new Error('메인 윈도우가 초기화되지 않았습니다.');
			}

			// ── UI 단축키 ──
			register(this.mainWindow, 'CommandOrControl+O', () => {
				this.mainWindow?.webContents.send('trigger-load-file');
			});

			register(this.mainWindow, 'CommandOrControl+F', () => {
				this.mainWindow?.webContents.send('toggle-search');
			});

			register(this.mainWindow, 'CommandOrControl+M', () => {
				this.mainWindow?.webContents.send('toggle-sidebar');
			});

			register(this.mainWindow, 'CommandOrControl+,', () => {
				this.mainWindow?.webContents.send('toggle-settings');
			});

			register(this.mainWindow, 'Escape', () => {
				this.mainWindow?.webContents.send('close-esc');
			});

			console.log('[SystemListener] 앱 단축키 설정 완료');
		} catch (error) {
			console.error('[SystemListener] 앱 단축키 설정 실패:', error);
		}
	}

	clearAppShortcuts() {
		try {
			if (this.mainWindow && !this.mainWindow.isDestroyed()) {
				unregisterAll(this.mainWindow);
				console.log('[SystemListener] 모든 단축키 해제됨');
			}
		} catch (error) {
			console.error('[SystemListener] 단축키 해제 중 오류:', error);
		}
	}

	// ═══════════════ 네비게이션 메서드 ═══════════════

	moveToNext() {
		getIPCManager().handleMove('next');
	}

	moveToPrev() {
		getIPCManager().handleMove('prev');
	}

	toggleResume() {
		getIPCManager().handleResume();
	}

	togglePause() {
		getIPCManager().handlePause();
	}

	moveToNextPage() {
		getIPCManager().handleMove('next', 'page');
	}

	moveToPrevPage() {
		getIPCManager().handleMove('prev', 'page');
	}

	toggleOverlay() {
		getIPCManager().handleToggleOverlay();
	}

	// ═══════════════ 포토샵 모드: 클립보드 일시 중지/복구 ═══════════════

	suspendClipboardOps() {
		this._stopClipboardMonitor();
		this._unregisterPasteHandler();
		console.log('[SystemListener] 클립보드 관련 기능 일시 중지 (포토샵 모드)');
	}

	resumeClipboardOps() {
		this.lastClipboardText = clipboard.readText();
		this._startClipboardMonitor();
		this._registerPasteHandler();
		console.log('[SystemListener] 클립보드 관련 기능 복구');
	}

	// ═══════════════ 정리 ═══════════════

	destroy() {
		this.clearKeyboardListener();
		this.clearAppShortcuts();
		this._stopClipboardMonitor();
		this.currentParagraphText = null;
	}

	showErrorDialog(message) {
		dialog.showErrorBox('오류', message.toString());
	}
}

module.exports = SystemListener;
