// Paraglide Connector — Photoshop UXP Plugin
//
// 전략: 모달 상태 폴링으로 텍스트 편집 진입 감지 → 자동 Esc → make 이벤트 수신
//       → 빈 레이어 삭제 + 같은 위치에 번역 텍스트 레이어 생성
//       연결 + 텍스트 데이터가 있으면 자동 활성화

const { entrypoints } = require("uxp");
const photoshop = require("photoshop");
const psApp = photoshop.app;
const psAction = photoshop.action;

const PORT = 27182;
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT = 50;

let ws = null;
let connected = false;
let reconnectCount = 0;
let reconnectTimer = null;
let paragraph = { text: '', index: 0, total: 0 };

// 스탬프 상태
let stampProcessing = false;
let modalPollTimer = null;
let inModalState = false;
let escSentCount = 0;
let layerCountBeforeModal = -1;  // 모달 진입 전 레이어 수
let layerIdsBeforeModal = new Set(); // 모달 진입 전 레이어 ID

// ═══════════════ 다국어 ═══════════════

const i18n = {
  en: { connected: 'Connected', disconnected: 'Disconnected' },
  ko: { connected: '연결됨', disconnected: '연결끊김' },
  ja: { connected: '接続中', disconnected: '未接続' },
  zh: { connected: '已连接', disconnected: '未连接' }
};

function detectLang() {
  try {
    const locale = (psApp.locale || navigator.language || 'en').toLowerCase();
    if (locale.startsWith('ko')) return 'ko';
    if (locale.startsWith('ja')) return 'ja';
    if (locale.startsWith('zh')) return 'zh';
  } catch {}
  return 'en';
}

const lang = detectLang();
const t = i18n[lang] || i18n.en;

// 활성 여부: 연결됨 + 텍스트 있음
function isActive() {
  return connected && !!paragraph.text;
}

// 폴링 자동 시작/중지
function checkPollState() {
  if (isActive() && !modalPollTimer) {
    startModalPoll();
  } else if (!isActive() && modalPollTimer) {
    stopModalPoll();
  }
}

// ═══════════════ 로그 ═══════════════

const MAX_LOG = 80;
const lines = [];

function log(msg) {
  const d = new Date();
  const t = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
  const s = `[${t}] ${msg}`;
  console.log('[PG]', msg);
  lines.push(s);
  if (lines.length > MAX_LOG) lines.shift();
  const el = document.getElementById('log');
  if (el) {
    el.textContent = lines.join('\n');
    el.scrollTop = 99999;
  }
}

// ═══════════════ 테마 감지 ═══════════════

let currentThemeMode = ''; // 초기값 빈 문자열 → 첫 호출 시 반드시 업데이트

function detectTheme() {
  // body의 실제 계산된 배경색을 읽음 (CSS 변수보다 안정적)
  const bgColor = getComputedStyle(document.body).backgroundColor || '';

  let r = 50, g = 50, b = 50;  // fallback: dark

  const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const hexMatch = bgColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

  if (rgbMatch) {
    r = parseInt(rgbMatch[1]); g = parseInt(rgbMatch[2]); b = parseInt(rgbMatch[3]);
  } else if (hexMatch) {
    r = parseInt(hexMatch[1], 16); g = parseInt(hexMatch[2], 16); b = parseInt(hexMatch[3], 16);
  }

  const luminance = r * 0.299 + g * 0.587 + b * 0.114;
  return luminance < 128 ? 'dark' : 'light';
}

function updateThemeImages() {
  const mode = detectTheme();
  if (mode === currentThemeMode) return;
  currentThemeMode = mode;

  const logoImg = document.getElementById('logo-img');
  const titleImg = document.getElementById('title-img');
  if (logoImg)  logoImg.src  = mode === 'dark' ? 'logo_dark.png' : 'logo_light.png';
  if (titleImg) titleImg.src = mode === 'dark' ? 'TitleDark.png' : 'TitleLight.png';
  log('테마 변경: ' + mode);
}

// ═══════════════ UI ═══════════════

function updateUI() {
  const dot = document.getElementById('dot');
  const statusLabel = document.getElementById('status-label');
  const toggleLabel = document.getElementById('toggle-label');
  const toggleInput = document.getElementById('toggle-connection');

  if (dot) {
    if (connected) {
      dot.classList.add('connected');
    } else {
      dot.classList.remove('connected');
    }
  }
  if (statusLabel) {
    statusLabel.textContent = connected ? t.connected : t.disconnected;
  }
  if (toggleLabel && toggleInput) {
    toggleLabel.textContent = toggleInput.checked ? 'ON' : 'OFF';
  }

  updateThemeImages();
  checkPollState();
}

// ═══════════════ WebSocket ═══════════════

function cleanupWs() {
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState <= 1) ws.close();
    } catch { /* ignore */ }
    ws = null;
  }
  connected = false;
}

function wsConnect() {
  cleanupWs();
  log('연결 시도...');
  try {
    ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.onopen = () => {
      connected = true;
      reconnectCount = 0;
      log('연결 성공');
      wsSend({ type: 'identify', app: 'Photoshop', version: psApp.version });
      wsSend({ type: 'request', action: 'getCurrentParagraph' });
      updateUI();
    };
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); }
      catch (err) { log('파싱 실패: ' + err.message); }
    };
    ws.onclose = (e) => {
      connected = false;
      ws = null;
      log('연결 해제 (' + e.code + ')');
      updateUI();
      scheduleReconnect();
    };
    ws.onerror = () => {};
  } catch (e) {
    log('연결 실패: ' + e.message);
    ws = null;
    scheduleReconnect();
  }
}

function wsDisconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  cleanupWs();
  reconnectCount = MAX_RECONNECT;
  updateUI();
}

function scheduleReconnect() {
  if (reconnectCount >= MAX_RECONNECT) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectTimer = setTimeout(() => {
    reconnectCount++;
    log('재연결 ' + reconnectCount + '/' + MAX_RECONNECT);
    wsConnect();
  }, RECONNECT_INTERVAL);
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ═══════════════ 메시지 처리 ═══════════════

function onMessage(msg) {
  log('수신: ' + msg.type + (msg.action ? '/' + msg.action : '') + (msg.event ? '/' + msg.event : ''));
  if (msg.type === 'response' && msg.action === 'getCurrentParagraph' && msg.data) {
    paragraph = msg.data;
    log('단락 수신: ' + (paragraph.text || '').substring(0, 30) + ' (' + (paragraph.index+1) + '/' + paragraph.total + ')');
    updateUI();
  }
  if (msg.type === 'event' && msg.event === 'paragraphChanged' && msg.data) {
    paragraph = msg.data;
    log('단락 변경: ' + (paragraph.text || '').substring(0, 30));
    updateUI();
  }
  if (msg.type === 'event' && msg.event === 'connected' && msg.data) {
    paragraph = { text: msg.data.text || '', index: msg.data.index || 0, total: msg.data.total || 0 };
    log('서버 연결 확인, 텍스트: ' + (paragraph.text ? '있음' : '없음'));
    updateUI();
  }
  if (msg.type === 'response' && msg.action === 'sendEsc') {
    log('Esc 응답: ' + (msg.data?.success ? '성공' : '실패'));
  }
}

// ═══════════════ 모달 감지 + 자동 처리 (통합) ═══════════════
// 1. 비모달 → 레이어 수 기록
// 2. 모달 진입 + 레이어 수 증가 → 새 텍스트 레이어 → Esc 전송
// 3. 모달 해제 + Esc 전송했었음 → 바로 텍스트 교체

let escWasSent = false;  // 이 모달 세션에서 Esc를 보냈는지
let escSendTime = 0;     // Esc 전송 시각 (중복 방지용)

function startModalPoll() {
  if (modalPollTimer) return;
  log('폴링 시작 (활성)');

  modalPollTimer = setInterval(async () => {
    if (!isActive() || stampProcessing) return;

    try {
      await photoshop.core.executeAsModal(async (ctx) => {
        if (inModalState && escWasSent) {
          // ── 모달 해제 + Esc 보냈었음 → 새 레이어 찾아서 텍스트 교체 ──
          inModalState = false;
          escWasSent = false;
          escSentCount = 0;
          escSendTime = 0;

          const d = psApp.activeDocument;
          if (!d) return;

          // 새로 생성된 레이어 찾기 (ID 비교)
          let newLayer = null;
          for (const layer of d.layers) {
            if (!layerIdsBeforeModal.has(layer.id)) {
              newLayer = layer;
              break;
            }
          }

          if (!newLayer) {
            log('[POLL] 새 레이어 없음 (Space 실패로 삭제됨) → 무시');
            // 레이어 정보 갱신
            layerCountBeforeModal = d.layers.length;
            layerIdsBeforeModal = new Set(d.layers.map(l => l.id));
            return;
          }

          // 새 레이어를 활성화
          d._activeLayers = [newLayer];

          const rawText = paragraph.text;
          if (!rawText) return;

          stampProcessing = true;

          const pgText = rawText.replace(/\r\n|\n/g, '\r');
          await psAction.batchPlay([{
            _obj: "set",
            _target: [{ _ref: "textLayer", _enum: "ordinal", _value: "targetEnum" }],
            to: {
              _obj: "textLayer",
              textKey: pgText
            }
          }], {});

          log('✅ 완료: ' + rawText.substring(0, 30));
          wsSend({ type: 'request', action: 'moveNext' });

          layerCountBeforeModal = d.layers.length;
          layerIdsBeforeModal = new Set(d.layers.map(l => l.id));
          stampProcessing = false;
          updateUI();
        } else {
          // ── 일반 비모달 → 레이어 정보 기록 ──
          inModalState = false;
          escSentCount = 0;
          escSendTime = 0;
          const doc = psApp.activeDocument;
          if (doc) {
            layerCountBeforeModal = doc.layers.length;
            layerIdsBeforeModal = new Set(doc.layers.map(l => l.id));
          }
        }
      }, { commandName: "PG Stamp" });
    } catch (e) {
      if (e.message && e.message.includes('modal')) {
        // ── 모달 중 → 새 레이어면 Esc 전송 ──
        try {
          const doc = psApp.activeDocument;
          const currentCount = doc ? doc.layers.length : -1;

          if (layerCountBeforeModal >= 0 && currentCount > layerCountBeforeModal) {
            const now = Date.now();
            // 중복 방지: 직전 Esc 후 500ms 이내면 Skip (C++ 데몬 처리 시간 확보)
            if (escSentCount < 3 && (now - escSendTime) > 500) {
              escSentCount++;
              escWasSent = true;
              escSendTime = now;
              log('[POLL] 새 레이어 → Esc (' + escSentCount + ')');
              wsSend({ type: 'request', action: 'sendEsc' });
            }
          } else if (!inModalState) {
            log('[POLL] 기존 레이어 편집 → 무시');
          }
        } catch { /* 문서 접근 불가 */ }
        inModalState = true;
      }
    }
  }, 200);
}

function stopModalPoll() {
  if (modalPollTimer) {
    clearInterval(modalPollTimer);
    modalPollTimer = null;
    inModalState = false;
    escWasSent = false;
    log('폴링 중지 (비활성)');
  }
}

// ═══════════════ 로그 복사 ═══════════════

async function copyLog() {
  const text = lines.join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      log('클립보드에 복사됨 ✓');
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      log('복사됨 (execCommand) ✓');
    }
  } catch (e) {
    log('복사 실패: ' + e.message);
  }
}

// ═══════════════ entrypoints (최우선 등록) ═══════════════

let panelInited = false;

entrypoints.setup({
  plugin: {
    create() {
      log('플러그인 시작');
    },
    destroy() {
      log('플러그인 종료');
      stopModalPoll();
      wsDisconnect();
    }
  },
  commands: {
    toggleConnection() {
      if (connected) wsDisconnect();
      else { reconnectCount = 0; wsConnect(); }
    }
  },
  panels: {
    mainPanel: {
      show() {
        log('패널 show');
        if (!panelInited) {
          panelInited = true;
          const toggle = document.getElementById('toggle-connection');
          if (toggle) {
            toggle.checked = true;
            toggle.addEventListener('change', () => {
              if (toggle.checked) {
                log('토글 ON → 연결');
                reconnectCount = 0;
                wsConnect();
              } else {
                log('토글 OFF → 연결 해제');
                wsDisconnect();
              }
              updateUI();
            });
          }
          // 테마 변경 감시 (CSS 변수 변경 폴링)
          setInterval(updateThemeImages, 2000);
          updateThemeImages();
        }
        if (!connected) { reconnectCount = 0; wsConnect(); }
        updateUI();
      },
      hide() { log('패널 hide'); },
    }
  }
});

log('plugin.js 로드 완료');
