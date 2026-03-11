// Paraglide Connector — Photoshop UXP Plugin
//
// 기능:
//   1. Paraglide WebSocket 서버에 연결
//   2. 새 텍스트 레이어 "생성" 감지 (기존 레이어 편집은 무시)
//   3. 파이프라인: 텍스트 삽입 → [미들웨어] → 레이어 커밋 → 다음 단락 이동
//   4. 어느 단계에서든 실패 시 moveNext 차단
//   5. 연결 상태 패널 표시

const { app, action, core } = require("photoshop");
const { executeAsModal } = core;

const PARAGLIDE_PORT = 27182;
const RECONNECT_INTERVAL = 5000;
const MAX_RECONNECT = 10;

let ws = null;
let isConnected = false;
let autoInsertEnabled = true;
let reconnectCount = 0;
let reconnectTimer = null;
let currentParagraph = { text: '', index: 0, total: 0, meta: null };
let notificationListenerCleanup = null;

// ═══════════════ WebSocket 연결 ═══════════════

function connect() {
  if (ws && ws.readyState <= 1) return; // CONNECTING or OPEN

  try {
    ws = new WebSocket(`ws://localhost:${PARAGLIDE_PORT}`);

    ws.onopen = () => {
      isConnected = true;
      reconnectCount = 0;
      console.log('[Paraglide] 연결됨');
      
      // 자기소개
      send({ type: 'identify', app: 'Photoshop', version: app.version });
      
      // 현재 단락 요청
      send({ type: 'request', action: 'getCurrentParagraph' });
      
      updatePanel();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('[Paraglide] 메시지 파싱 실패:', e);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      console.log('[Paraglide] 연결 해제');
      updatePanel();
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('[Paraglide] WebSocket 오류');
    };
  } catch (e) {
    console.error('[Paraglide] 연결 실패:', e);
    scheduleReconnect();
  }
}

function disconnect() {
  reconnectCount = MAX_RECONNECT; // 재연결 방지
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  isConnected = false;
  updatePanel();
}

function scheduleReconnect() {
  if (reconnectCount >= MAX_RECONNECT) return;
  
  reconnectTimer = setTimeout(() => {
    reconnectCount++;
    console.log(`[Paraglide] 재연결 시도 ${reconnectCount}/${MAX_RECONNECT}`);
    connect();
  }, RECONNECT_INTERVAL);
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ═══════════════ 메시지 처리 ═══════════════

function handleMessage(msg) {
  switch (msg.type) {
    case 'response':
      if (msg.action === 'getCurrentParagraph' && msg.data) {
        currentParagraph = msg.data;
        updatePanel();
      }
      break;

    case 'event':
      if (msg.event === 'paragraphChanged' && msg.data) {
        currentParagraph = msg.data;
        updatePanel();
      }
      if (msg.event === 'connected' && msg.data) {
        currentParagraph = {
          text: msg.data.text || '',
          index: msg.data.index || 0,
          total: msg.data.total || 0,
          meta: msg.data.meta || null
        };
        updatePanel();
      }
      break;
  }
}

// ═══════════════ 새 텍스트 레이어 생성 감지 ═══════════════
//
// 판별 전략:
//   make 이벤트 발생 시, 이벤트 디스크립터에서 textLayer 생성인지 확인.
//   기존 레이어를 "편집 모드로 여는" 동작은 make 이벤트가 아니므로
//   (select/set 이벤트에 해당) 자연스럽게 필터링됨.
//
//   추가 안전장치: 이전에 알려진 레이어 ID 목록을 스냅샷으로 유지하여,
//   make 이벤트 직후 활성 레이어가 기존 목록에 없는 경우에만 "신규"로 판정.

/** 현재 문서의 모든 레이어 ID를 수집 (재귀) */
function collectLayerIds(layers, ids = new Set()) {
  if (!layers) return ids;
  for (const layer of layers) {
    ids.add(layer.id);
    if (layer.layers) collectLayerIds(layer.layers, ids);
  }
  return ids;
}

/** 마지막으로 알려진 레이어 ID 목록 */
let knownLayerIds = new Set();

/** 레이어 스냅샷 갱신 */
function refreshLayerSnapshot() {
  try {
    const doc = app.activeDocument;
    if (doc) {
      knownLayerIds = collectLayerIds(doc.layers);
    }
  } catch { /* 문서가 없을 수 있음 */ }
}

function setupTextLayerListener() {
  // 초기 스냅샷
  refreshLayerSnapshot();

  // "make" 이벤트만 리스닝 — 기존 레이어 편집(select/set)은 수신하지 않음
  notificationListenerCleanup = action.addNotificationListener(
    ['make'],
    async (event, descriptor) => {
      if (!isConnected || !autoInsertEnabled) return;
      if (!currentParagraph.text) return;

      // 텍스트 레이어 생성인지 확인 (make의 using 프로퍼티)
      const isTextLayer = descriptor?.using?._obj === 'textLayer' ||
                          descriptor?.using?._obj === 'contentLayer';
      if (!isTextLayer) return;

      // 짧은 딜레이 후 신규 레이어 검증 및 파이프라인 실행
      setTimeout(async () => {
        try {
          const doc = app.activeDocument;
          if (!doc) return;

          const activeLayer = doc.activeLayers[0];
          if (!activeLayer || activeLayer.kind !== 'text') return;

          // 안전장치: 기존 레이어 ID에 없는 경우에만 신규로 판정
          if (knownLayerIds.has(activeLayer.id)) {
            console.log('[Paraglide] 기존 레이어 — 무시');
            return;
          }

          console.log(`[Paraglide] 새 텍스트 레이어 감지 (ID: ${activeLayer.id})`);

          // 파이프라인 실행
          await runInsertPipeline(activeLayer);
        } catch (e) {
          console.error('[Paraglide] 레이어 감지 처리 실패:', e);
        } finally {
          // 스냅샷은 항상 갱신 (성공/실패 무관)
          refreshLayerSnapshot();
        }
      }, 150);
    }
  );

  // 문서 변경 시 스냅샷 갱신
  try {
    action.addNotificationListener(
      ['open', 'close', 'select'],
      () => setTimeout(() => refreshLayerSnapshot(), 200)
    );
  } catch { /* optional */ }
}

// ═══════════════ 삽입 파이프라인 ═══════════════
//
// 구조:
//   runInsertPipeline(layer)
//     ├─ Step 1: insertText       — 단락 텍스트 삽입
//     ├─ Step 2: [middleware]     — 미들웨어 실행 (메타데이터 기반 ATN 액션 등)
//     ├─ Step 3: commitLayer      — 텍스트 레이어 편집 확정
//     └─ Step 4: advanceParagraph — Paraglide에 다음 단락 이동 요청
//
//   어느 단계에서든 에러 발생 시 → 즉시 중단, moveNext 호출하지 않음
//
// 확장 방법:
//   pipeline 배열에 { name, fn } 객체를 추가하면 됨.
//   fn(context) 시그니처: context = { layer, paragraph, doc, results }
//   fn이 false를 반환하면 파이프라인 중단 (에러 아닌 의도적 중단)

/**
 * 파이프라인 단계 목록
 * 순서대로 실행되며, 각 단계는 async fn(context) 형태
 * 단계를 추가하려면 이 배열에 push 하면 됨
 */
const pipeline = [
  { name: 'insertText',       fn: stepInsertText },
  // { name: 'runAction',     fn: stepRunAction },     // ← 향후 ATN 액션 단계
  // { name: 'applyStyle',    fn: stepApplyStyle },    // ← 향후 스타일 적용 단계
  { name: 'commitLayer',      fn: stepCommitLayer },
  { name: 'advanceParagraph', fn: stepAdvanceParagraph },
];

/**
 * 파이프라인 실행
 * @param {Layer} layer - 대상 텍스트 레이어
 * @returns {boolean} 전체 파이프라인 성공 여부
 */
async function runInsertPipeline(layer) {
  const context = {
    layer,
    paragraph: { ...currentParagraph },
    doc: app.activeDocument,
    results: {},  // 단계간 데이터 전달용
  };

  for (const step of pipeline) {
    try {
      console.log(`[Paraglide] 파이프라인: ${step.name} 시작`);
      const result = await step.fn(context);

      // 명시적 false 반환 → 의도적 중단 (에러 아님)
      if (result === false) {
        console.log(`[Paraglide] 파이프라인: ${step.name} → 중단 (스킵 요청)`);
        return false;
      }

      // 결과를 context에 저장 (다음 단계에서 참조 가능)
      if (result !== undefined && result !== true) {
        context.results[step.name] = result;
      }

      console.log(`[Paraglide] 파이프라인: ${step.name} 완료`);
    } catch (error) {
      console.error(`[Paraglide] 파이프라인: ${step.name} 실패:`, error);
      console.error('[Paraglide] 파이프라인 중단 — moveNext 호출하지 않음');
      return false;
    }
  }

  console.log('[Paraglide] 파이프라인 전체 완료');
  return true;
}

// ─── Step 1: 텍스트 삽입 ───

async function stepInsertText(context) {
  await executeAsModal(async () => {
    const { layer, paragraph } = context;

    if (!layer || layer.kind !== 'text') {
      throw new Error('활성 레이어가 텍스트 레이어가 아닙니다.');
    }

    layer.textItem.contents = paragraph.text;
    console.log(`[Paraglide] 텍스트 삽입: "${paragraph.text.substring(0, 30)}${paragraph.text.length > 30 ? '…' : ''}"`);
  }, { commandName: 'Paraglide: Insert Text' });
}

// ─── Step 2: (확장 슬롯) 미들웨어 — ATN 액션 등 ───
//
// 향후 구현 예시:
//
// async function stepRunAction(context) {
//   const { paragraph } = context;
//   const meta = paragraph.meta;
//   if (!meta?.actionName) return; // 메타데이터 없으면 스킵 (중단 아님)
//
//   await executeAsModal(async () => {
//     await action.batchPlay([{
//       _obj: 'play',
//       _target: [
//         { _ref: 'action', _name: meta.actionName },
//         { _ref: 'actionSet', _name: meta.actionSet || 'Default Actions' }
//       ]
//     }], {});
//   }, { commandName: `Paraglide: Run Action (${meta.actionName})` });
//
//   return { action: meta.actionName };  // context.results.runAction에 저장됨
// }

// ─── Step 3: 레이어 커밋 (편집 모드 종료) ───

async function stepCommitLayer(context) {
  try {
    await executeAsModal(async () => {
      // 텍스트 편집 모드를 종료하여 레이어를 확정
      // select 이벤트를 발생시켜 편집 모드를 빠져나옴
      const batchResult = await action.batchPlay([
        {
          _obj: 'select',
          _target: [{ _ref: 'layer', _id: context.layer.id }],
          makeVisible: false
        }
      ], { synchronousExecution: true });

      if (batchResult[0]?.message) {
        throw new Error(batchResult[0].message);
      }
    }, { commandName: 'Paraglide: Commit Layer' });
  } catch (error) {
    // 이미 커밋된 상태일 수 있음 — 경고만 출력
    console.warn('[Paraglide] 레이어 커밋 경고:', error.message || error);
  }
}

// ─── Step 4: 다음 단락 이동 요청 ───

async function stepAdvanceParagraph(context) {
  if (!isConnected) {
    throw new Error('Paraglide 연결이 끊어짐 — 단락 이동 불가');
  }

  send({ type: 'request', action: 'moveNext' });
}

// ═══════════════ 패널 UI ═══════════════

function updatePanel() {
  const panel = document.getElementById('paraglide-panel');
  if (!panel) return;

  const statusDot = panel.querySelector('.status-dot');
  const statusText = panel.querySelector('.status-text');
  const paragraphInfo = panel.querySelector('.paragraph-info');
  const previewText = panel.querySelector('.preview-text');
  const toggleBtn = panel.querySelector('.toggle-btn');

  if (statusDot) {
    statusDot.style.backgroundColor = isConnected ? '#28a745' : '#dc3545';
  }
  if (statusText) {
    statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
  }
  if (paragraphInfo) {
    paragraphInfo.textContent = isConnected 
      ? `${currentParagraph.index + 1} / ${currentParagraph.total}`
      : '— / —';
  }
  if (previewText) {
    const text = currentParagraph.text || '';
    previewText.textContent = text.length > 80 ? text.substring(0, 80) + '…' : text;
  }
  if (toggleBtn) {
    toggleBtn.textContent = autoInsertEnabled ? 'Auto Insert: ON' : 'Auto Insert: OFF';
    toggleBtn.className = `toggle-btn ${autoInsertEnabled ? 'on' : 'off'}`;
  }
}

// ═══════════════ 엔트리포인트 ═══════════════

// 패널 설정
function setupPanel(event) {
  const container = document.createElement('div');
  container.id = 'paraglide-panel';
  container.innerHTML = `
    <style>
      #paraglide-panel {
        padding: 12px;
        font-family: 'Adobe Clean', sans-serif;
        font-size: 12px;
        color: #e0e0e0;
      }
      .status-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #dc3545;
      }
      .status-text {
        font-weight: bold;
      }
      .paragraph-info {
        color: #aaa;
        font-size: 11px;
        margin-bottom: 4px;
      }
      .preview-text {
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 8px;
        font-size: 11px;
        line-height: 1.4;
        min-height: 40px;
        margin-bottom: 8px;
        color: #ccc;
        word-break: break-word;
      }
      .toggle-btn {
        width: 100%;
        padding: 6px;
        border: 1px solid #555;
        border-radius: 4px;
        background: transparent;
        color: #e0e0e0;
        cursor: pointer;
        font-size: 11px;
      }
      .toggle-btn.on { border-color: #28a745; color: #28a745; }
      .toggle-btn.off { border-color: #dc3545; color: #dc3545; }
      .toggle-btn:hover { background: rgba(255,255,255,0.05); }
    </style>
    <div class="status-row">
      <div class="status-dot"></div>
      <span class="status-text">Disconnected</span>
    </div>
    <div class="paragraph-info">— / —</div>
    <div class="preview-text">Waiting for connection...</div>
    <button class="toggle-btn on">Auto Insert: ON</button>
  `;

  // 자동 삽입 토글
  container.querySelector('.toggle-btn').addEventListener('click', () => {
    autoInsertEnabled = !autoInsertEnabled;
    updatePanel();
  });

  event.node.appendChild(container);
}

// 커맨드: 연결 토글
function toggleConnection() {
  if (isConnected) {
    disconnect();
  } else {
    reconnectCount = 0;
    connect();
  }
}

// ═══════════════ 플러그인 라이프사이클 ═══════════════

// 플러그인 로드 시 자동 시작
connect();
setupTextLayerListener();

module.exports = {
  commands: {
    toggleConnection
  },
  panels: {
    mainPanel: {
      show: setupPanel,
      hide: () => {},
      destroy: () => {
        if (notificationListenerCleanup) {
          notificationListenerCleanup();
        }
        disconnect();
      }
    }
  }
};
