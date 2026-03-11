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
//     { "type": "identify", "app": "Photoshop", "version": "26.0" }
//
//   ← Paraglide → 플러그인:
//     { "type": "response", "action": "...", "data": {...} }
//     { "type": "event", "event": "paragraphChanged", "data": {...} }
//     { "type": "event", "event": "statusChanged", "data": {...} }

const { state } = require('../state');
const { PLUGIN_PORT } = require('../constants');

let WebSocketServer = null;

const PluginBridge = {
  _server: null,
  _clients: new Map(),  // ws → { app, version, connectedAt }
  _started: false,

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
      return true;
    } catch (error) {
      console.error('[PluginBridge] 서버 시작 실패:', error);
      return false;
    }
  },

  // 서버 중지
  stop() {
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

      default:
        this._send(ws, {
          type: 'error',
          message: `Unknown action: ${msg.action}`
        });
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
