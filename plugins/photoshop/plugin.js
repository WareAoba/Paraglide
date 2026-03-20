// Paraglide Connector — Photoshop UXP Plugin
//
// 전략: 모달 상태 폴링으로 텍스트 편집 진입 감지 → Space+커밋 전송
//       → 공백 레이어의 스타일 디스크립터 읽기 → 텍스트 교체+스타일 보존
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
    statusLabel.textContent = connected ? '연결됨' : '연결끊김';
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

// ═══════════════ PS Action 목록 조회 ═══════════════

async function fetchActionList() {
  try {
    const result = await photoshop.core.executeAsModal(async () => {
      const sets = [];
      // actionSet 개수 조회
      const [countResult] = await psAction.batchPlay([{
        _obj: "get",
        _target: [{ _property: "numberOfActionSets" }, { _ref: "application", _enum: "ordinal", _value: "targetEnum" }]
      }], {});
      const setCount = countResult.numberOfActionSets || 0;

      for (let si = 1; si <= setCount; si++) {
        try {
          const [setResult] = await psAction.batchPlay([{
            _obj: "get",
            _target: [{ _ref: "actionSet", _index: si }]
          }], {});
          const setName = setResult.name || ('Set ' + si);
          const actionCount = setResult.numberOfChildren || 0;
          const actions = [];
          for (let ai = 1; ai <= actionCount; ai++) {
            try {
              const [actResult] = await psAction.batchPlay([{
                _obj: "get",
                _target: [
                  { _ref: "action", _index: ai },
                  { _ref: "actionSet", _index: si }
                ]
              }], {});
              actions.push(actResult.name || ('Action ' + ai));
            } catch { /* skip */ }
          }
          sets.push({ set: setName, actions });
        } catch { /* skip */ }
      }
      return sets;
    }, { commandName: "PG ListActions" });

    log('액션 목록: ' + result.length + '개 세트');
    wsSend({ type: 'event', event: 'actionList', data: result });
  } catch (e) {
    log('액션 목록 조회 실패: ' + e.message);
  }
}

// ═══════════════ PS Action 실행 ═══════════════

async function playAction(setName, actionName) {
  if (!setName || !actionName) return false;
  try {
    await psAction.batchPlay([{
      _obj: "play",
      _target: [
        { _ref: "action", _name: actionName },
        { _ref: "actionSet", _name: setName }
      ]
    }], {});
    log('액션 실행: ' + setName + ' / ' + actionName);
    return true;
  } catch (e) {
    log('액션 실행 실패: ' + e.message);
    return false;
  }
}

// ═══════════════ 메시지 처리 ═══════════════

function onMessage(msg) {
  log('수신: ' + msg.type + (msg.action ? '/' + msg.action : '') + (msg.event ? '/' + msg.event : ''));
  if (msg.type === 'response' && msg.action === 'getCurrentParagraph' && msg.data) {
    paragraph = msg.data;
    log('단락 수신: ' + (paragraph.text || '').substring(0, 30) + ' (' + (paragraph.index+1) + '/' + paragraph.total + ')' +
      ' color=' + (paragraph.textColor || 'none') + ' align=' + (paragraph.textAlign || 'none'));
    updateUI();
  }
  if (msg.type === 'event' && msg.event === 'paragraphChanged' && msg.data) {
    paragraph = msg.data;
    log('단락 변경: ' + (paragraph.text || '').substring(0, 30) +
      ' color=' + (paragraph.textColor || 'none') + ' align=' + (paragraph.textAlign || 'none'));
    updateUI();
  }
  if (msg.type === 'event' && msg.event === 'connected' && msg.data) {
    paragraph = {
      text: msg.data.text || '', index: msg.data.index || 0, total: msg.data.total || 0,
      textColor: msg.data.textColor || null, textAlign: msg.data.textAlign || null
    };
    log('서버 연결 확인, 텍스트: ' + (paragraph.text ? '있음' : '없음'));
    updateUI();
    // 연결 직후 액션 목록 전송
    fetchActionList();
  }
  if (msg.type === 'response' && msg.action === 'sendEsc') {
    log('Esc 응답: ' + (msg.data?.success ? '성공' : '실패'));
  }
  // Paraglide에서 액션 목록 재요청
  if (msg.type === 'request' && msg.action === 'getActionList') {
    fetchActionList();
  }
}

// ═══════════════ 모달 감지 + 자동 처리 (통합) ═══════════════
// 핵심: executeAsModal은 실제 작업이 필요할 때만 호출
//   평상시 → 모달 없이 레이어 수만 모니터링 (폰트 크기 등 UI 조작 방해 안 함)
//   레이어 수 증가 → executeAsModal 시도로 모달 여부 판별
//   모달 내 레이어 증가 → Esc 전송
//   모달 해제 + Esc 보냈었음 → executeAsModal로 텍스트 교체

let escWasSent = false;  // 이 모달 세션에서 Esc를 보냈는지
let escSendTime = 0;     // Esc 전송 시각 (중복 방지용)

// hex("#RRGGBB") → PS RGBColor descriptor
function hexToDescriptor(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return {
    _obj: "RGBColor",
    red: parseInt(m[1], 16),
    grain: parseInt(m[2], 16),   // PS uses "grain" for green
    blue: parseInt(m[3], 16)
  };
}

// textAlign string → PS alignmentType enum value
function alignToAlignmentType(align) {
  if (!align || typeof align !== 'string') return null;
  const map = {
    'left': 'left', 'center': 'center', 'right': 'right',
    'justifyLeft': 'justifyLeft', 'justifyCenter': 'justifyCenter',
    'justifyRight': 'justifyRight', 'justifyAll': 'justifyAll'
  };
  return map[align] || null;
}

function startModalPoll() {
  if (modalPollTimer) return;
  log('폴링 시작 (활성)');

  modalPollTimer = setInterval(async () => {
    if (!isActive() || stampProcessing) return;

    // ── 모달 해제 대기: Esc 전송 후 텍스트 교체 필요 ──
    if (inModalState && escWasSent) {
      try {
        await photoshop.core.executeAsModal(async () => {
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
            log('[POLL] 새 레이어 없음 → 무시');
            layerCountBeforeModal = d.layers.length;
            layerIdsBeforeModal = new Set(d.layers.map(l => l.id));
            return;
          }

          d._activeLayers = [newLayer];

          const rawText = paragraph.text;
          if (!rawText) return;

          stampProcessing = true;
          const pgText = rawText.replace(/\r\n|\n/g, '\r');

          // ── Read: 공백 레이어의 스타일 디스크립터 읽기 ──
          let readDesc = null;
          try {
            const [readResult] = await psAction.batchPlay([{
              _obj: "get",
              _target: [
                { _ref: "property", _property: "textKey" },
                { _ref: "layer", _enum: "ordinal", _value: "targetEnum" }
              ],
            }], {});
            readDesc = (readResult.textKey && typeof readResult.textKey === 'object')
              ? readResult.textKey : readResult;
            const dbg = {
              readKeys: Object.keys(readDesc),
              hasTextStyleRange: !!readDesc.textStyleRange,
              tsrCount: readDesc.textStyleRange?.length,
              hasParagraphStyleRange: !!readDesc.paragraphStyleRange,
              psrCount: readDesc.paragraphStyleRange?.length,
              psrFirst: readDesc.paragraphStyleRange?.[0]?.paragraphStyle || null,
              metaAlign: paragraph.textAlign,
              metaColor: paragraph.textColor,
            };
            log('[DBG] ' + JSON.stringify(dbg));
            wsSend({ type: 'event', event: 'debug', data: dbg });
          } catch (re) {
            log('⚠️ 스타일 읽기 실패: ' + re.message);
          }

          // ── Modify + Write ──
          const writeDesc = { _obj: "textLayer", textKey: pgText };

          if (readDesc && readDesc.textStyleRange && readDesc.textStyleRange.length > 0) {
            const tsr = readDesc.textStyleRange[0];
            tsr.from = 0;
            tsr.to = pgText.length;
            const colorDesc = hexToDescriptor(paragraph.textColor);
            if (colorDesc && tsr.textStyle) {
              tsr.textStyle.color = colorDesc;
            }
            writeDesc.textStyleRange = [tsr];
          }

          // paragraphStyleRange 처리
          const alignValue = alignToAlignmentType(paragraph.textAlign);
          if (readDesc && readDesc.paragraphStyleRange && readDesc.paragraphStyleRange.length > 0) {
            const psr = readDesc.paragraphStyleRange[0];
            psr.from = 0;
            psr.to = pgText.length;
            if (alignValue) {
              if (!psr.paragraphStyle) psr.paragraphStyle = { _obj: "paragraphStyle" };
              psr.paragraphStyle.align = { _enum: "alignmentType", _value: alignValue };
            }
            writeDesc.paragraphStyleRange = [psr];
          } else if (alignValue) {
            writeDesc.paragraphStyleRange = [{
              _obj: "paragraphStyleRange",
              from: 0, to: pgText.length,
              paragraphStyle: {
                _obj: "paragraphStyle",
                align: { _enum: "alignmentType", _value: alignValue }
              }
            }];
          }

          const writeDbg = { writeKeys: Object.keys(writeDesc), align: alignValue };
          log('[DBG] write: ' + JSON.stringify(writeDbg));
          wsSend({ type: 'event', event: 'debug', data: writeDbg });

          await psAction.batchPlay([{
            _obj: "set",
            _target: [{ _ref: "textLayer", _enum: "ordinal", _value: "targetEnum" }],
            to: writeDesc
          }], {});

          // ── 스타일 액션 실행 (텍스트 교체 후) ──
          if (paragraph.styleAction) {
            const sa = paragraph.styleAction;
            if (sa.set && sa.action) {
              try {
                await playAction(sa.set, sa.action);
              } catch (ae) {
                log('⚠️ 스타일 액션 실패: ' + ae.message);
              }
            }
          }

          log('✅ 완료: ' + rawText.substring(0, 30));
          wsSend({ type: 'request', action: 'moveNext' });

          layerCountBeforeModal = d.layers.length;
          layerIdsBeforeModal = new Set(d.layers.map(l => l.id));
          stampProcessing = false;
          updateUI();
        }, { commandName: "PG Stamp" });
      } catch {
        // 아직 모달 중 — 대기
      }
      return;
    }

    // ── 모달 중 (Esc 미전송) → 새 레이어 확인 후 Esc 전송 ──
    if (inModalState) {
      try {
        const doc = psApp.activeDocument;
        const currentCount = doc ? doc.layers.length : -1;
        if (layerCountBeforeModal >= 0 && currentCount > layerCountBeforeModal) {
          const now = Date.now();
          if (escSentCount < 3 && (now - escSendTime) > 500) {
            escSentCount++;
            escWasSent = true;
            escSendTime = now;
            log('[POLL] 새 레이어 → Esc (' + escSentCount + ')');
            wsSend({ type: 'request', action: 'sendEsc' });
          }
        }
      } catch { /* 문서 접근 불가 */ }

      // 모달 탈출 확인
      try {
        await photoshop.core.executeAsModal(async () => {
          // 모달 해제되었으나 Esc 안 보냄 — 사용자가 직접 닫은 경우
          inModalState = false;
          escSentCount = 0;
          escSendTime = 0;
          const doc = psApp.activeDocument;
          if (doc) {
            layerCountBeforeModal = doc.layers.length;
            layerIdsBeforeModal = new Set(doc.layers.map(l => l.id));
          }
        }, { commandName: "PG Check" });
      } catch { /* 아직 모달 */ }
      return;
    }

    // ── 평상시: executeAsModal 호출 없이 레이어 수만 모니터링 ──
    try {
      const doc = psApp.activeDocument;
      if (!doc) return;
      const currentCount = doc.layers.length;

      if (layerCountBeforeModal >= 0 && currentCount > layerCountBeforeModal) {
        // 레이어 수 증가 감지 → 모달 여부 판별
        try {
          await photoshop.core.executeAsModal(async () => {
            // 모달 아님 — 다른 이유로 레이어 추가됨 (복사, 그리기 등)
            layerCountBeforeModal = currentCount;
            layerIdsBeforeModal = new Set(doc.layers.map(l => l.id));
          }, { commandName: "PG Check" });
        } catch (e) {
          if (e.message && e.message.includes('modal')) {
            // 모달 진입 확인 → Esc 전송
            inModalState = true;
            const now = Date.now();
            if (escSentCount < 3 && (now - escSendTime) > 500) {
              escSentCount++;
              escWasSent = true;
              escSendTime = now;
              log('[POLL] 새 레이어 → Esc (' + escSentCount + ')');
              wsSend({ type: 'request', action: 'sendEsc' });
            }
          }
        }
      } else {
        // 변화 없음 — baseline 갱신 (executeAsModal 호출 안 함!)
        layerCountBeforeModal = currentCount;
        layerIdsBeforeModal = new Set(doc.layers.map(l => l.id));
      }
    } catch {
      // 문서 접근 실패 — 무시
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
