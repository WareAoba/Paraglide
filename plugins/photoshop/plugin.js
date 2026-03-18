// Paraglide Connector — Photoshop UXP Plugin
//
// 전략: addNotificationListener('make') + 모달 폴링 듀얼 감지
//       → Ctrl+Enter로 텍스트 편집 커밋
//       → batchPlay set textLayer (공식 Adobe 포맷) 로 텍스트+스타일 교체
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
let layerCountBeforeModal = -1;
let layerIdsBeforeModal = new Set();

// 이벤트 리스너 기반 감지
let notificationListenerAdded = false;
let pendingAutoFill = false;      // make 이벤트로 텍스트 레이어 생성 감지됨
let usesPasteCommit = false;      // 클립보드+붙여넣기 방식 사용 여부
let cachedToolStyle = null;        // Character 패널 설정 캐시

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
    paragraph = msg.data;
    log('서버 연결 확인, 텍스트: ' + (paragraph.text ? '있음' : '없음'));
    updateUI();
  }
  if (msg.type === 'response' && msg.action === 'sendEsc') {
    log('Ctrl+Enter 응답: ' + (msg.data?.success ? '성공' : '실패'));
  }
  if (msg.type === 'response' && msg.action === 'pasteCommit') {
    log('pasteCommit 응답: ' + (msg.data?.success ? '성공' : '실패'));
  }
}

// ═══════════════ 모달 감지 + 자동 처리 ═══════════════
//
// 듀얼 감지 플로우:
//   1차: addNotificationListener('make') → 텍스트 레이어 생성 이벤트 수신
//   2차: 모달 폴링 (fallback) → layers.length 비교
//   → 감지 시 Ctrl+Enter 전송 (커밋)
//   → 모달 해제 후 batchPlay set textLayer로 텍스트+스타일 교체
//   → 캐시된 도구 스타일 or 레이어 디스크립터에서 원본 스타일 보존

let escWasSent = false;
let escSendTime = 0;

// ── 이벤트 기반 텍스트 레이어 생성 감지 ──
function setupNotificationListener() {
  if (notificationListenerAdded) return;
  notificationListenerAdded = true;

  psAction.addNotificationListener(['make'], (event, descriptor) => {
    try {
      const descStr = JSON.stringify(descriptor || {}).substring(0, 300);
      log('[EVENT] make: ' + descStr);

      if (!isActive() || stampProcessing) return;

      // 텍스트 레이어 생성 여부 판별
      const target = descriptor?._target;
      const isTextMake = (Array.isArray(target) && target.some(t => t._ref === 'textLayer' || t._ref === 'contentLayer')) ||
                         descriptor?.using?._obj === 'textLayer' ||
                         descriptor?.layerKind === 3;

      // 텍스트 도구(typeCreateOrEditTool)가 활성 상태인 경우도 감지
      const layerCreated = descriptor?.layerID != null;

      if ((isTextMake || layerCreated) && !pendingAutoFill) {
        pendingAutoFill = true;

        // ── 클립보드에 텍스트 기록 → pasteCommit 요청 ──
        // 붙여넣기된 텍스트는 Character 패널 스타일을 자동 상속 → 12pt 문제 해결
        const rawText = paragraph.text;
        if (rawText && navigator.clipboard && navigator.clipboard.writeText) {
          const textToSet = rawText.replace(/\r\n|\n/g, '\r');
          navigator.clipboard.writeText(textToSet)
            .then(() => {
              usesPasteCommit = true;
              escWasSent = true;
              escSentCount++;
              escSendTime = Date.now();
              log('[EVENT] 클립보드 설정 완료 → pasteCommit 요청');
              wsSend({ type: 'request', action: 'pasteCommit' });
            })
            .catch(err => {
              log('[EVENT] 클립보드 실패: ' + err.message + ' → sendEsc fallback');
              usesPasteCommit = false;
              escWasSent = true;
              escSentCount++;
              escSendTime = Date.now();
              wsSend({ type: 'request', action: 'sendEsc' });
            });
        } else {
          // 클립보드 API 없거나 텍스트 없음 → 기존 방식
          log('[EVENT] 텍스트 레이어 생성 감지 → sendEsc fallback');
          usesPasteCommit = false;
          escWasSent = true;
          escSentCount++;
          escSendTime = Date.now();
          wsSend({ type: 'request', action: 'sendEsc' });
        }
      }
    } catch (err) {
      log('[EVENT] make 처리 에러: ' + err.message);
    }
  });

  log('이벤트 리스너 등록 완료 (make)');
}

// ── 현재 도구 스타일 캐시 (Character 패널 설정) ──
async function cacheCurrentToolStyle() {
  try {
    // 현재 텍스트 도구의 textStyle 속성을 읽음
    const result = await psAction.batchPlay([{
      _obj: "get",
      _target: [{ _ref: "tool", _enum: "ordinal", _value: "targetEnum" }]
    }], {});

    const toolOpts = result?.[0];
    if (toolOpts) {
      // textToolCharacterOptions 또는 currentToolOptions에서 스타일 추출
      const charOpts = toolOpts.currentToolOptions?.textToolCharacterOptions ||
                       toolOpts.textToolCharacterOptions;
      if (charOpts) {
        cachedToolStyle = charOpts;
        log('[CACHE] 도구 스타일 캐시 갱신: size=' + JSON.stringify(charOpts.size || 'N/A'));
      }
    }
  } catch { /* 무시 */ }
}

function startModalPoll() {
  if (modalPollTimer) return;
  log('폴링 시작 (활성)');

  // 이벤트 리스너 등록 (1차 감지 — 가장 빠르고 신뢰성 높음)
  setupNotificationListener();

  modalPollTimer = setInterval(async () => {
    if (!isActive() || stampProcessing) return;

    try {
      await photoshop.core.executeAsModal(async (ctx) => {
        if (inModalState && (escWasSent || pendingAutoFill)) {
          // ── 모달 해제됨: 텍스트 교체 ──
          const wasPasteCommit = usesPasteCommit;
          log('[FLOW] 모달해제 진입. inModal=' + inModalState + ' escSent=' + escWasSent + ' pending=' + pendingAutoFill + ' paste=' + wasPasteCommit);
          inModalState = false;
          escWasSent = false;
          pendingAutoFill = false;
          usesPasteCommit = false;
          escSentCount = 0;
          escSendTime = 0;

          try {
            const d = psApp.activeDocument;
            if (!d) { log('[FLOW] 문서 없음'); return; }

            if (wasPasteCommit) {
              // ── pasteCommit: 텍스트+스타일이 이미 적용됨 (Character 패널 스타일 상속) ──
              log('[FLOW] pasteCommit 완료 → moveNext');
              wsSend({ type: 'request', action: 'moveNext' });
              log('✅ pasteCommit 완료');
            } else {
              // ── sendEsc fallback: batchPlay로 텍스트+스타일 설정 필요 ──
              const active = d.activeLayers[0];
              if (!active) { log('[FLOW] 활성 레이어 없음'); return; }

              log('[FLOW] 활성레이어: id=' + active.id + ' kind=' + active.kind + ' name="' + active.name + '"');

              // 텍스트 레이어인지 확인
              let isTextLayer = false;
              try { isTextLayer = active.textItem != null; } catch { isTextLayer = false; }
              if (!isTextLayer) {
                log('[FLOW] 텍스트 레이어 아님 → 건너뜀');
                layerCountBeforeModal = d.layers.length;
                layerIdsBeforeModal = new Set(d.layers.map(l => l.id));
                stampProcessing = false;
                return;
              }

              const rawText = paragraph.text;
              if (!rawText) { log('[FLOW] paragraph.text 비어있음'); return; }

              stampProcessing = true;
              const pgText = rawText.replace(/\r\n|\n/g, '\r');
              log('[FLOW] 텍스트 설정 시도 (fallback): "' + pgText.substring(0, 30) + '"');

              await replaceTextContent(pgText, active.id);
              log('[FLOW] replaceTextContent 성공!');

              wsSend({ type: 'request', action: 'moveNext' });
              log('✅ 완료 (fallback)');
            }
          } catch (e) {
            log('❌ 교체 실패: ' + e.message);
          }

          const doc2 = psApp.activeDocument;
          if (doc2) {
            layerCountBeforeModal = doc2.layers.length;
            layerIdsBeforeModal = new Set(doc2.layers.map(l => l.id));
          }
          stampProcessing = false;
          updateUI();

        } else {
          // ── 비모달: 레이어 스냅샷 갱신 + 도구 스타일 캐시 ──
          inModalState = false;
          escSentCount = 0;
          escSendTime = 0;
          const doc = psApp.activeDocument;
          if (doc) {
            layerCountBeforeModal = doc.layers.length;
            layerIdsBeforeModal = new Set(doc.layers.map(l => l.id));
          }
          // 도구 스타일 캐시 (Character 패널 설정 보존용)
          await cacheCurrentToolStyle();
        }
      }, { commandName: "PG Stamp" });

    } catch (e) {
      if (e.message && e.message.includes('modal')) {
        // ── 모달 중: 2차 감지 (이벤트 리스너가 놓친 경우 fallback) ──
        if (!stampProcessing && !pendingAutoFill && layerCountBeforeModal >= 0) {
          try {
            const cnt = psApp.activeDocument?.layers?.length ?? -1;
            if (cnt > layerCountBeforeModal) {
              const now = Date.now();
              if (escSentCount < 3 && (now - escSendTime) > 500) {
                escSentCount++;
                escWasSent = true;
                escSendTime = now;
                log('[POLL] 레이어 증가 (' + layerCountBeforeModal + '→' + cnt + ') → Ctrl+Enter (' + escSentCount + ')');
                wsSend({ type: 'request', action: 'sendEsc' });
              }
            }
          } catch { /* 문서 접근 불가 */ }
        }
        inModalState = true;
      } else {
        log('[ERR] 비모달 에러: ' + e.message);
      }
    }
  }, 200);
}

// ── 텍스트 교체 핵심 함수 ──
// 공식 Adobe 샘플 기반 포맷 (green ≠ grain, 클린 디스크립터)
// get으로 원본 스타일을 읽되, set에는 필요한 속성만 수동 구성한다.
// 캐시된 도구 스타일을 fallback으로 사용하여 12pt 기본값 문제를 해결.
async function replaceTextContent(newText, layerId) {
  log('[REPLACE] 시작: layerId=' + layerId + ' newText길이=' + newText.length);

  // 1. 해당 레이어의 텍스트 디스크립터 읽기
  let fullDesc = null;
  try {
    const getResult = await psAction.batchPlay([{
      _obj: "get",
      _target: [
        { _ref: "property", _property: "textKey" },
        { _ref: "layer", _id: layerId }
      ]
    }], {});
    fullDesc = getResult?.[0]?.textKey;
  } catch (e) {
    log('[REPLACE] 디스크립터 읽기 에러: ' + e.message);
  }

  // 원본 스타일 추출
  const origTSR = fullDesc?.textStyleRange?.[0];
  const origTS = origTSR?.textStyle;
  log('[DESC] 전체 textStyle: ' + JSON.stringify(origTS || 'null').substring(0, 500));

  // 캐시된 도구 스타일 (Character 패널 설정)
  const toolTS = cachedToolStyle;
  log('[DESC] cachedToolStyle: ' + JSON.stringify(toolTS || 'null').substring(0, 300));

  // 2. 클린 textStyle 구성 (공식 샘플 포맷)
  //    우선순위: origTS (레이어) → toolTS (Character 패널 캐시)
  const cleanTextStyle = { _obj: "textStyle" };

  // 폰트: 레이어 스타일 우선, 없으면 캐시된 도구 스타일
  cleanTextStyle.fontPostScriptName = origTS?.fontPostScriptName || toolTS?.fontPostScriptName;
  cleanTextStyle.fontName = origTS?.fontName || toolTS?.fontName;
  cleanTextStyle.fontStyleName = origTS?.fontStyleName || toolTS?.fontStyleName;

  // 크기: 레이어 스타일 우선. 12pt(기본값)이고 캐시에 다른 값이 있으면 캐시 사용
  const origSize = origTS?.size;
  const toolSize = toolTS?.size;
  if (origSize) {
    // 원본 크기가 12pt(기본값)이고, 캐시에 다른 크기가 있으면 캐시 우선
    const origPt = origSize?._value ?? origSize;
    const toolPt = toolSize?._value ?? toolSize;
    if (origPt === 12 && toolPt && toolPt !== 12) {
      cleanTextStyle.size = toolSize;
      log('[STYLE] 12pt 기본값 → 캐시 크기 사용: ' + JSON.stringify(toolSize));
    } else {
      cleanTextStyle.size = origSize;
      log('[STYLE] 원본 크기 사용: ' + JSON.stringify(origSize));
    }
  } else if (toolSize) {
    cleanTextStyle.size = toolSize;
    log('[STYLE] 레이어 크기 없음 → 캐시 크기 사용: ' + JSON.stringify(toolSize));
  }

  // 자간/행간
  if (origTS?.tracking !== undefined) cleanTextStyle.tracking = origTS.tracking;
  else if (toolTS?.tracking !== undefined) cleanTextStyle.tracking = toolTS.tracking;

  if (origTS?.leading) cleanTextStyle.leading = origTS.leading;
  else if (toolTS?.leading) cleanTextStyle.leading = toolTS.leading;

  if (origTS?.autoLeading !== undefined) cleanTextStyle.autoLeading = origTS.autoLeading;
  else if (toolTS?.autoLeading !== undefined) cleanTextStyle.autoLeading = toolTS.autoLeading;

  if (origTS?.baselineShift) cleanTextStyle.baselineShift = origTS.baselineShift;
  if (origTS?.horizontalScale !== undefined) cleanTextStyle.horizontalScale = origTS.horizontalScale;
  if (origTS?.verticalScale !== undefined) cleanTextStyle.verticalScale = origTS.verticalScale;

  // 안티앨리어싱
  if (origTS?.antiAlias) cleanTextStyle.antiAlias = origTS.antiAlias;
  else if (toolTS?.antiAlias) cleanTextStyle.antiAlias = toolTS.antiAlias;

  // undefined 속성 제거 (batchPlay 호환)
  for (const key of Object.keys(cleanTextStyle)) {
    if (cleanTextStyle[key] === undefined || cleanTextStyle[key] === null) {
      delete cleanTextStyle[key];
    }
  }

  // 색상: .para 메타데이터 우선, 없으면 원본 (green 키 사용 — 공식 샘플 포맷)
  if (paragraph.textColor) {
    const hex = paragraph.textColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    cleanTextStyle.color = {
      _obj: "RGBColor",
      red: r,
      green: g,
      blue: b
    };
    log('[COLOR] .para 색상: #' + hex + ' → R' + r + ' G' + g + ' B' + b);
  } else if (origTS?.color) {
    // get은 grain을 반환하지만 set은 green을 사용
    cleanTextStyle.color = {
      _obj: "RGBColor",
      red: origTS.color.red ?? 0,
      green: origTS.color.grain ?? origTS.color.green ?? 0,
      blue: origTS.color.blue ?? 0
    };
    log('[COLOR] 원본 색상: R' + cleanTextStyle.color.red + ' G' + cleanTextStyle.color.green + ' B' + cleanTextStyle.color.blue);
  } else if (toolTS?.color) {
    cleanTextStyle.color = {
      _obj: "RGBColor",
      red: toolTS.color.red ?? 0,
      green: toolTS.color.grain ?? toolTS.color.green ?? 0,
      blue: toolTS.color.blue ?? 0
    };
    log('[COLOR] 캐시 색상 사용');
  }

  // 3. 클린 paragraphStyle 구성
  const origPSR = fullDesc?.paragraphStyleRange?.[0];
  const origPS = origPSR?.paragraphStyle;
  const cleanParaStyle = { _obj: "paragraphStyle" };

  if (paragraph.textAlign) {
    cleanParaStyle.align = {
      _enum: "alignmentType",
      _value: paragraph.textAlign === 'left' ? 'left' :
              paragraph.textAlign === 'right' ? 'right' : 'center'
    };
  } else if (origPS?.align) {
    cleanParaStyle.align = origPS.align;
  }

  // 4. set textLayer — 현재 활성 레이어 타겟 (가장 안정적)
  const setDesc = {
    _obj: "set",
    _target: [{ _ref: "textLayer", _enum: "ordinal", _value: "targetEnum" }],
    to: {
      _obj: "textLayer",
      textKey: newText,
      textStyleRange: [{
        _obj: "textStyleRange",
        from: 0,
        to: newText.length,
        textStyle: cleanTextStyle
      }],
      paragraphStyleRange: [{
        _obj: "paragraphStyleRange",
        from: 0,
        to: newText.length,
        paragraphStyle: cleanParaStyle
      }]
    }
  };

  log('[SET] send: size=' + JSON.stringify(cleanTextStyle.size) + ' font=' + (cleanTextStyle.fontPostScriptName || cleanTextStyle.fontName));

  const setResult = await psAction.batchPlay([setDesc], {});

  const resultStr = JSON.stringify(setResult?.[0] ?? 'null');
  log('[SET] result: ' + resultStr.substring(0, 300));

  if (setResult?.[0]?.message) {
    log('[SET] ⚠ 경고: ' + setResult[0].message);
  }
}

function stopModalPoll() {
  if (modalPollTimer) {
    clearInterval(modalPollTimer);
    modalPollTimer = null;
    inModalState = false;
    escWasSent = false;
    pendingAutoFill = false;
    usesPasteCommit = false;
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
