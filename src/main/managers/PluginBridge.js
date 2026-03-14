// PluginBridge.js — 외부 플러그인 WebSocket 통신 매니저
//
// 역할:
//   Paraglide ↔ 외부 플러그인(Photoshop UXP 등) 간 WebSocket 서버 운영
//   플러그인이 연결되면 현재 단락 텍스트를 제공하고,
//   플러그인 요청에 따라 다음/이전 단락 이동 등을 수행
//
// 프로토콜 (JSON):
//   → 플러그인 → Paraglide:
//     { "type": "request", "action": "getCurrentParagraph" }
//     { "type": "request", "action": "moveNext" }
//     { "type": "request", "action": "movePrev" }
//     { "type": "request", "action": "getStatus" }
//     { "type": "request", "action": "sendEsc" }
//     { "type": "identify", "app": "Photoshop", "version": "26.0" }
//
//   ← Paraglide → 플러그인:
//     { "type": "response", "action": "...", "data": {...} }
//     { "type": "event", "event": "paragraphChanged", "data": {...} }
//     { "type": "event", "event": "statusChanged", "data": {...} }

const { state } = require('../state');
const { PLUGIN_PORT } = require('../constants');
const { spawn, exec } = require('child_process');

let WebSocketServer = null;

const PluginBridge = {
  _server: null,
  _clients: new Map(),  // ws → { app, version, connectedAt }
  _started: false,
  _pingTimer: null,
  _daemon: null,        // sendesc.exe 데몬 프로세스
  _daemonReady: false,
  _escCallback: null,   // 대기 중인 Esc 응답 콜백

  initialize() {
    // WebSocket 서버 시작은 lazy — 실제 사용 시에만 로드
    state.on('textprocess-changed', () => {
      this._broadcastEvent('paragraphChanged', this._getParagraphData());
    });

    console.log('[PluginBridge] 초기화 완료 (서버 대기 중)');
  },

  // WebSocket 서버 시작
  async start() {
    if (this._started) return true;

    try {
      // ws 모듈 로드 (lazy)
      if (!WebSocketServer) {
        const ws = require('ws');
        WebSocketServer = ws.WebSocketServer || ws.Server;
      }

      this._server = new WebSocketServer({ port: PLUGIN_PORT });

      this._server.on('connection', (ws) => {
        console.log('[PluginBridge] 플러그인 연결됨');
        this._clients.set(ws, { app: 'unknown', connectedAt: Date.now() });

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            this._handleMessage(ws, msg);
          } catch (error) {
            console.error('[PluginBridge] 메시지 파싱 실패:', error);
          }
        });

        ws.on('close', () => {
          const info = this._clients.get(ws);
          console.log(`[PluginBridge] 플러그인 연결 해제: ${info?.app || 'unknown'}`);
          this._clients.delete(ws);
          this._notifyConnectionChange();
        });

        ws.on('error', (error) => {
          console.error('[PluginBridge] WebSocket 오류:', error.message);
          this._clients.delete(ws);
        });

        // 연결 즉시 현재 상태 전송
        this._send(ws, {
          type: 'event',
          event: 'connected',
          data: {
            app: 'Paraglide',
            version: require('../../../package.json').version,
            ...this._getParagraphData()
          }
        });
      });

      this._server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[PluginBridge] 포트 ${PLUGIN_PORT} 사용 중 — 서버 시작 실패`);
        } else {
          console.error('[PluginBridge] 서버 오류:', error);
        }
      });

      this._started = true;
      console.log(`[PluginBridge] WebSocket 서버 시작 (port: ${PLUGIN_PORT})`);

      // 30초마다 ping으로 idle 끊김 방지
      this._pingTimer = setInterval(() => {
        this._clients.forEach((_, ws) => {
          if (ws.readyState === 1) {
            try { ws.ping(); } catch { /* ignore */ }
          }
        });
      }, 30000);

      return true;
    } catch (error) {
      console.error('[PluginBridge] 서버 시작 실패:', error);
      return false;
    }
  },

  // 서버 중지
  stop() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    this._stopDaemon();
    if (this._server) {
      this._clients.forEach((_, ws) => {
        try { ws.close(); } catch (e) { /* ignore */ }
      });
      this._clients.clear();
      this._server.close();
      this._server = null;
      this._started = false;
      console.log('[PluginBridge] 서버 중지됨');
    }
  },

  // 메시지 처리
  _handleMessage(ws, msg) {
    const IPCManager = require('./IPCManager');

    switch (msg.type) {
      case 'identify':
        // 플러그인 자기소개
        this._clients.set(ws, {
          app: msg.app || 'unknown',
          version: msg.version || 'unknown',
          connectedAt: Date.now()
        });
        console.log(`[PluginBridge] 플러그인 식별: ${msg.app} v${msg.version}`);
        this._notifyConnectionChange();
        break;

      case 'request':
        this._handleRequest(ws, msg, IPCManager);
        break;

      case 'event':
        this._handlePluginEvent(ws, msg, IPCManager);
        break;

      default:
        console.warn('[PluginBridge] 알 수 없는 메시지 타입:', msg.type);
    }
  },

  _handleRequest(ws, msg, IPCManager) {
    switch (msg.action) {
      case 'getCurrentParagraph':
        this._send(ws, {
          type: 'response',
          action: 'getCurrentParagraph',
          data: this._getParagraphData()
        });
        break;

      case 'moveNext':
        IPCManager.handleMove('next');
        this._send(ws, {
          type: 'response',
          action: 'moveNext',
          data: { success: true }
        });
        break;

      case 'movePrev':
        IPCManager.handleMove('prev');
        this._send(ws, {
          type: 'response',
          action: 'movePrev',
          data: { success: true }
        });
        break;

      case 'getStatus':
        this._send(ws, {
          type: 'response',
          action: 'getStatus',
          data: this._getStatusData()
        });
        break;

      case 'sendEsc':
        this._sendEscToPhotoshop(ws);
        break;

      default:
        this._send(ws, {
          type: 'error',
          message: `Unknown action: ${msg.action}`
        });
    }
  },

  // Photoshop에 Space+Esc 전송 (플랫폼별 분기)
  _sendEscToPhotoshop(ws) {
    if (process.platform === 'darwin') {
      this._sendEscMac(ws);
    } else {
      this._sendEscWin(ws);
    }
  },

  // ── Windows: C++ 데몬 경유 (~1ms 응답) ──
  _sendEscWin(ws) {
    this._ensureDaemon();

    if (!this._daemon || !this._daemonReady) {
      console.error('[PluginBridge] 데몬 미실행');
      this._send(ws, { type: 'response', action: 'sendEsc', data: { success: false } });
      return;
    }

    // 콜백 등록 (타임아웃 포함)
    const timeout = setTimeout(() => {
      this._escCallback = null;
      console.error('[PluginBridge] Esc 응답 타임아웃');
      this._send(ws, { type: 'response', action: 'sendEsc', data: { success: false } });
    }, 2000);

    this._escCallback = (line) => {
      clearTimeout(timeout);
      this._escCallback = null;
      const success = line.trim() === 'ok';
      console.log('[PluginBridge] Esc', success ? '성공' : '실패');
      this._send(ws, { type: 'response', action: 'sendEsc', data: { success } });
    };

    this._daemon.stdin.write('esc\n');
  },

  // ── macOS: osascript 경유 ──
  _sendEscMac(ws) {
    // 1) PS 활성화 → 2) Space 키 → 3) Esc 키
    const script = [
      'tell application "Adobe Photoshop 2025" to activate',
      'delay 0.05',
      'tell application "System Events"',
      '  key code 49',   // Space
      '  delay 0.03',
      '  key code 53',   // Escape
      'end tell'
    ].join('\n');

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 3000 }, (err) => {
      if (err) {
        console.error('[PluginBridge] macOS Esc 실패:', err.message);
        this._send(ws, { type: 'response', action: 'sendEsc', data: { success: false } });
      } else {
        console.log('[PluginBridge] macOS Esc 성공');
        this._send(ws, { type: 'response', action: 'sendEsc', data: { success: true } });
      }
    });
  },

  // sendesc.exe 데몬 시작 (Windows 전용)
  _ensureDaemon() {
    if (process.platform !== 'win32') return;
    if (this._daemon && !this._daemon.killed) return;

    const path = require('path');
    const fs = require('fs');
    let exePath = path.join(__dirname, '..', '..', '..', 'native', 'sendesc.exe');
    if (!fs.existsSync(exePath)) {
      exePath = path.join(process.resourcesPath || '', 'sendesc.exe');
    }
    if (!fs.existsSync(exePath)) {
      console.error('[PluginBridge] sendesc.exe 없음:', exePath);
      return;
    }

    console.log('[PluginBridge] 데몬 시작:', exePath);
    this._daemon = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true
    });
    this._daemonReady = true;

    // stdout 응답 처리
    let buffer = '';
    this._daemon.stdout.on('data', (data) => {
      buffer += data.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.substring(0, idx);
        buffer = buffer.substring(idx + 1);
        if (this._escCallback) {
          this._escCallback(line);
        }
      }
    });

    this._daemon.on('exit', (code) => {
      console.log('[PluginBridge] 데몬 종료 (code=' + code + ')');
      this._daemon = null;
      this._daemonReady = false;
    });

    this._daemon.on('error', (err) => {
      console.error('[PluginBridge] 데몬 에러:', err.message);
      this._daemon = null;
      this._daemonReady = false;
    });
  },

  // 데몬 종료 (Windows 전용)
  _stopDaemon() {
    if (process.platform !== 'win32') return;
    if (this._daemon && !this._daemon.killed) {
      try {
        this._daemon.stdin.write('quit\n');
        setTimeout(() => {
          if (this._daemon && !this._daemon.killed) {
            this._daemon.kill();
          }
        }, 500);
      } catch { /* ignore */ }
    }
    this._daemon = null;
    this._daemonReady = false;
    this._escCallback = null;
  },

  // 플러그인 이벤트 처리
  _handlePluginEvent(ws, msg, IPCManager) {
    console.log('[PluginBridge] 플러그인 이벤트 수신:', msg.event);
    switch (msg.event) {
      default:
        console.log('[PluginBridge] 알 수 없는 플러그인 이벤트:', msg.event);
    }
  },

  // 데이터 헬퍼
  _getParagraphData() {
    const textState = state.textProcess;
    return {
      text: textState.paragraphs[textState.currentParagraph] || '',
      index: textState.currentParagraph,
      total: textState.paragraphs.length,
      isPaused: textState.isPaused
    };
  },

  _getStatusData() {
    const textState = state.textProcess;
    return {
      programStatus: textState.programStatus,
      isPaused: textState.isPaused,
      currentIndex: textState.currentParagraph,
      totalParagraphs: textState.paragraphs.length,
      currentFilePath: textState.currentFilePath,
      connectedPlugins: this.getConnectedPlugins()
    };
  },

  // 전송 헬퍼
  _send(ws, data) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(data));
    }
  },

  _broadcastEvent(event, data) {
    if (this._clients.size === 0) return;

    const message = JSON.stringify({ type: 'event', event, data });
    this._clients.forEach((_, ws) => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  },

  // 연결 상태 변경 알림 (렌더러에 전달)
  _notifyConnectionChange() {
    const plugins = this.getConnectedPlugins();
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('plugin-connection-changed', plugins);
    }
  },

  // 외부 API
  getConnectedPlugins() {
    const plugins = [];
    this._clients.forEach((info) => {
      plugins.push({
        app: info.app,
        version: info.version,
        connectedAt: info.connectedAt
      });
    });
    return plugins;
  },

  isRunning() {
    return this._started;
  },

  hasConnections() {
    return this._clients.size > 0;
  }
};

module.exports = PluginBridge;
