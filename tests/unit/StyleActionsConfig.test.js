// tests/unit/StyleActionsConfig.test.js
// — 텍스트 스타일 슬롯 액션 매핑 및 슬롯 순서의 저장/로드 검증
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

// ═══════════════════════════════════════════════════════════
// Mock: fs.promises — Node require cache에 직접 주입
//  (CJS 모듈이 require('fs')할 때 이 mock을 사용)
// ═══════════════════════════════════════════════════════════
const mockFiles = {};

function clearMockFiles() {
  for (const key of Object.keys(mockFiles)) delete mockFiles[key];
}

const mockFsPromises = {
  readFile: async (filePath) => {
    if (mockFiles[filePath] !== undefined) return mockFiles[filePath];
    const err = new Error('ENOENT');
    err.code = 'ENOENT';
    throw err;
  },
  writeFile: async (filePath, data) => {
    mockFiles[filePath] = data;
  },
  rename: async (oldPath, newPath) => {
    if (mockFiles[oldPath] === undefined) {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    }
    mockFiles[newPath] = mockFiles[oldPath];
    delete mockFiles[oldPath];
  },
  access: async (filePath) => {
    if (mockFiles[filePath] === undefined) {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    }
  },
  mkdir: async () => {},
  unlink: async () => {},
};

// 실제 fs 모듈의 require cache에 mock promises 주입
const fsPath = _require.resolve('fs');
const realFs = _require.cache[fsPath]?.exports || _require('fs');
const patchedFs = Object.create(realFs, {
  promises: { value: mockFsPromises, writable: true, configurable: true },
});
_require.cache[fsPath] = {
  id: fsPath,
  filename: fsPath,
  loaded: true,
  exports: patchedFs,
};

// FileManager 모듈 캐시 초기화 (mock fs를 사용하도록 재로드)
const fmPath = _require.resolve('../../src/main/managers/FileManager');
delete _require.cache[fmPath];

const { FILE_PATHS } = _require('../../src/main/constants');
const configPath = FILE_PATHS.config;
const FileManager = _require(fmPath);

// ═══════════════════════════════════════════════════════════
// 각 테스트 전 파일 시스템 초기화 + lock 대기
// ═══════════════════════════════════════════════════════════
beforeEach(async () => {
  clearMockFiles();
  await FileManager.flushConfigWrites();
});

afterEach(async () => {
  await FileManager.flushConfigWrites();
});

// ═══════════════════════════════════════════════════════════
// 헬퍼
// ═══════════════════════════════════════════════════════════
function seedConfig(obj) {
  mockFiles[configPath] = JSON.stringify(obj, null, 2);
}

function readSavedConfig() {
  const raw = mockFiles[configPath];
  return raw ? JSON.parse(raw) : null;
}

// ═══════════════════════════════════════════════════════════
// 1. styleActions 저장/로드 라운드트립
// ═══════════════════════════════════════════════════════════
describe('styleActions 저장/로드', () => {
  it('매핑을 저장하고 동일하게 로드', async () => {
    const mapping = {
      plain: { set: 'DefaultActions', action: 'Bold' },
      emphasis: { set: 'MySet', action: 'Italic' },
    };
    await FileManager.saveStyleActions(mapping);
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual(mapping);
  });

  it('빈 매핑 저장/로드', async () => {
    await FileManager.saveStyleActions({});
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({});
  });

  it('null 매핑은 빈 객체로 저장됨', async () => {
    await FileManager.saveStyleActions(null);
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({});
  });

  it('undefined 매핑은 빈 객체로 저장됨', async () => {
    await FileManager.saveStyleActions(undefined);
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({});
  });

  it('config 파일이 없을 때 로드하면 빈 객체 반환', async () => {
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({});
  });

  it('config 파일이 깨진 JSON일 때 빈 객체 반환', async () => {
    mockFiles[configPath] = '{ broken json !!!';
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({});
  });

  it('기존 config에 다른 필드가 있어도 그대로 보존하며 styleActions만 갱신', async () => {
    seedConfig({
      theme: { mode: 'dark' },
      textMacros: ['…', '―'],
      slotOrder: ['plain', 'emphasis'],
    });

    const mapping = { angry: { set: 'FX', action: 'RedGlow' } };
    await FileManager.saveStyleActions(mapping);

    const saved = readSavedConfig();
    expect(saved.theme).toEqual({ mode: 'dark' });
    expect(saved.textMacros).toEqual(['…', '―']);
    expect(saved.slotOrder).toEqual(['plain', 'emphasis']);
    expect(saved.styleActions).toEqual(mapping);
  });

  it('10개 슬롯 전체에 액션을 매핑하고 라운드트립', async () => {
    const allSlots = [
      'plain', 'emphasis', 'monologue', 'thought', 'announce',
      'excited', 'surprise', 'angry', 'custom1', 'custom2',
    ];
    const mapping = {};
    allSlots.forEach((name, i) => {
      mapping[name] = { set: `Set${i}`, action: `Action${i}` };
    });

    await FileManager.saveStyleActions(mapping);
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual(mapping);
    expect(Object.keys(loaded)).toHaveLength(10);
  });

  it('커스텀 슬롯 이름(custom3, custom4)도 정상 저장/로드', async () => {
    const mapping = {
      custom3: { set: 'Extra', action: 'Glow' },
      custom4: { set: 'Extra', action: 'Shadow' },
    };
    await FileManager.saveStyleActions(mapping);
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual(mapping);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. slotOrder 저장/로드 라운드트립
// ═══════════════════════════════════════════════════════════
describe('slotOrder 저장/로드', () => {
  it('순서를 저장하고 동일하게 로드', async () => {
    const order = ['emphasis', 'plain', 'angry', 'thought', 'announce',
                   'excited', 'surprise', 'monologue', 'custom1', 'custom2'];
    await FileManager.saveSlotOrder(order);
    const loaded = await FileManager.loadSlotOrder();
    expect(loaded).toEqual(order);
  });

  it('null 순서를 저장하면 로드 시 null 반환', async () => {
    await FileManager.saveSlotOrder(null);
    const loaded = await FileManager.loadSlotOrder();
    expect(loaded).toBeNull();
  });

  it('config 파일이 없을 때 로드하면 null 반환', async () => {
    const loaded = await FileManager.loadSlotOrder();
    expect(loaded).toBeNull();
  });

  it('빈 배열은 null로 취급(기본 순서 사용)', async () => {
    seedConfig({ slotOrder: [] });
    const loaded = await FileManager.loadSlotOrder();
    // loadSlotOrder는 length > 0일 때만 반환
    expect(loaded).toBeNull();
  });

  it('기존 config의 다른 필드를 보존하며 slotOrder만 갱신', async () => {
    seedConfig({
      theme: { mode: 'light' },
      styleActions: { plain: { set: 'A', action: 'B' } },
    });

    const order = ['custom2', 'plain', 'emphasis', 'monologue', 'thought',
                   'announce', 'excited', 'surprise', 'angry', 'custom1'];
    await FileManager.saveSlotOrder(order);

    const saved = readSavedConfig();
    expect(saved.theme).toEqual({ mode: 'light' });
    expect(saved.styleActions).toEqual({ plain: { set: 'A', action: 'B' } });
    expect(saved.slotOrder).toEqual(order);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. saveConfig가 styleActions/slotOrder를 보존하는지
// ═══════════════════════════════════════════════════════════
describe('saveConfig 시 styleActions/slotOrder 보존', () => {
  it('일반 설정 저장 후에도 기존 styleActions가 유지됨', async () => {
    // 먼저 스타일 액션 저장
    const mapping = { plain: { set: 'Actions', action: 'Bold' } };
    await FileManager.saveStyleActions(mapping);

    // 일반 설정 저장 (테마 변경 등)
    await FileManager.saveConfig({ theme: { mode: 'light', accentColor: '#ff0000' } });

    // styleActions가 여전히 존재하는지 확인
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual(mapping);
  });

  it('일반 설정 저장 후에도 기존 slotOrder가 유지됨', async () => {
    const order = ['emphasis', 'plain', 'angry', 'thought', 'announce',
                   'excited', 'surprise', 'monologue', 'custom1', 'custom2'];
    await FileManager.saveSlotOrder(order);

    await FileManager.saveConfig({ processMode: 'line' });

    const loaded = await FileManager.loadSlotOrder();
    expect(loaded).toEqual(order);
  });

  it('styleActions와 slotOrder가 모두 있을 때 saveConfig 후 둘 다 보존', async () => {
    const mapping = {
      plain: { set: 'A', action: '1' },
      emphasis: { set: 'B', action: '2' },
    };
    const order = ['emphasis', 'plain', 'angry', 'thought', 'announce',
                   'excited', 'surprise', 'monologue', 'custom1', 'custom2'];

    await FileManager.saveStyleActions(mapping);
    // flushConfigWrites로 이전 쓰기 완료 대기
    await FileManager.flushConfigWrites();
    await FileManager.saveSlotOrder(order);
    await FileManager.flushConfigWrites();

    // 일반 설정 저장
    await FileManager.saveConfig({ viewMode: 'listview' });
    await FileManager.flushConfigWrites();

    expect(await FileManager.loadStyleActions()).toEqual(mapping);
    expect(await FileManager.loadSlotOrder()).toEqual(order);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 직렬 쓰기 보장 (withConfigLock)
// ═══════════════════════════════════════════════════════════
describe('동시 쓰기 직렬화', () => {
  it('styleActions와 slotOrder를 동시에 저장해도 둘 다 최종 파일에 존재', async () => {
    const mapping = { angry: { set: 'FX', action: 'Explosion' } };
    const order = ['angry', 'plain', 'emphasis', 'monologue', 'thought',
                   'announce', 'excited', 'surprise', 'custom1', 'custom2'];

    // 동시 호출 — withConfigLock이 직렬화
    await Promise.all([
      FileManager.saveStyleActions(mapping),
      FileManager.saveSlotOrder(order),
    ]);
    await FileManager.flushConfigWrites();

    const saved = readSavedConfig();
    expect(saved.styleActions).toEqual(mapping);
    expect(saved.slotOrder).toEqual(order);
  });

  it('여러 번 연속 저장해도 마지막 값이 반영됨', async () => {
    const m1 = { plain: { set: 'A', action: '1' } };
    const m2 = { plain: { set: 'B', action: '2' } };
    const m3 = { plain: { set: 'C', action: '3' } };

    // 세 번 연속 (lock으로 직렬화됨)
    await FileManager.saveStyleActions(m1);
    await FileManager.saveStyleActions(m2);
    await FileManager.saveStyleActions(m3);

    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual(m3);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 매핑 덮어쓰기 & 부분 업데이트
// ═══════════════════════════════════════════════════════════
describe('매핑 덮어쓰기 & 부분 업데이트', () => {
  it('기존 매핑에 새 슬롯 추가 시 전체가 교체됨 (merge가 아닌 replace)', async () => {
    await FileManager.saveStyleActions({ plain: { set: 'A', action: '1' } });

    // 새 매핑으로 교체 — emphasis만 있고 plain은 없음
    await FileManager.saveStyleActions({ emphasis: { set: 'B', action: '2' } });

    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({ emphasis: { set: 'B', action: '2' } });
    expect(loaded.plain).toBeUndefined();
  });

  it('특정 슬롯만 삭제된 매핑이 정확히 저장됨', async () => {
    const full = {
      plain: { set: 'A', action: '1' },
      emphasis: { set: 'B', action: '2' },
      angry: { set: 'C', action: '3' },
    };
    await FileManager.saveStyleActions(full);

    // emphasis 삭제
    const { emphasis, ...rest } = full;
    await FileManager.saveStyleActions(rest);

    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual(rest);
    expect(loaded.emphasis).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// 6. 엣지 케이스
// ═══════════════════════════════════════════════════════════
describe('엣지 케이스', () => {
  it('styleActions 값이 객체가 아닌 경우 빈 객체로 대체', async () => {
    seedConfig({ styleActions: 'not-an-object' });
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({});
  });

  it('styleActions 값이 배열인 경우에도 typeof === object이므로 그대로 반환', async () => {
    // 잠재적 문제 확인: 배열도 typeof === 'object'
    seedConfig({ styleActions: [1, 2, 3] });
    const loaded = await FileManager.loadStyleActions();
    // loadStyleActions는 typeof === 'object'만 체크하므로 배열도 통과함
    expect(loaded).toEqual([1, 2, 3]);
  });

  it('slotOrder가 배열이 아닌 경우 null 반환', async () => {
    seedConfig({ slotOrder: 'not-an-array' });
    const loaded = await FileManager.loadSlotOrder();
    expect(loaded).toBeNull();
  });

  it('slotOrder가 문자열이 아닌 요소를 포함해도 그대로 반환 (검증 없음)', async () => {
    // 잠재적 문제 확인: 배열 내부 요소 검증 없음
    const order = ['plain', 123, null, 'emphasis'];
    seedConfig({ slotOrder: order });
    const loaded = await FileManager.loadSlotOrder();
    expect(loaded).toEqual(order);
  });

  it('handleActionSelect 시뮬레이션: 슬롯 매핑 → 삭제 → 재할당', async () => {
    // 단계 1: 슬롯에 액션 할당
    const m1 = { plain: { set: 'MyActions', action: 'Bold' } };
    await FileManager.saveStyleActions(m1);
    expect(await FileManager.loadStyleActions()).toEqual(m1);

    // 단계 2: 해당 슬롯 액션 삭제 (handleActionSelect에서 set/action이 null)
    const m2 = {};  // plain 삭제됨
    await FileManager.saveStyleActions(m2);
    expect(await FileManager.loadStyleActions()).toEqual({});

    // 단계 3: 다른 액션 재할당
    const m3 = { plain: { set: 'OtherSet', action: 'Italic' } };
    await FileManager.saveStyleActions(m3);
    expect(await FileManager.loadStyleActions()).toEqual(m3);
  });

  it('handleDeleteSlot 시뮬레이션: 슬롯 삭제 + 순서 변경 동시 저장', async () => {
    // 초기: 매핑 + 순서 둘 다 존재
    const mapping = {
      plain: { set: 'A', action: '1' },
      emphasis: { set: 'B', action: '2' },
      angry: { set: 'C', action: '3' },
    };
    const order = ['plain', 'emphasis', 'angry', 'thought', 'announce',
                   'excited', 'surprise', 'monologue', 'custom1', 'custom2'];

    await FileManager.saveStyleActions(mapping);
    await FileManager.flushConfigWrites();
    await FileManager.saveSlotOrder(order);
    await FileManager.flushConfigWrites();

    // emphasis 슬롯 삭제 → 매핑에서 제거, 순서에서 제거 + custom3 추가
    const newMapping = { ...mapping };
    delete newMapping.emphasis;
    const newOrder = [...order];
    newOrder.splice(1, 1); // emphasis 제거
    newOrder.push('custom3'); // 새 커스텀 추가

    // TextStyleSlots.handleDeleteSlot이 하는 것과 동일한 동시 저장
    await Promise.all([
      FileManager.saveStyleActions(newMapping),
      FileManager.saveSlotOrder(newOrder),
    ]);

    const loadedMapping = await FileManager.loadStyleActions();
    const loadedOrder = await FileManager.loadSlotOrder();

    expect(loadedMapping.emphasis).toBeUndefined();
    expect(loadedMapping.plain).toEqual({ set: 'A', action: '1' });
    expect(loadedMapping.angry).toEqual({ set: 'C', action: '3' });
    expect(loadedOrder).not.toContain('emphasis');
    expect(loadedOrder).toContain('custom3');
    expect(loadedOrder).toHaveLength(10);
  });

  it('handleDrop 시뮬레이션: 드래그 순서 변경', async () => {
    const original = ['plain', 'emphasis', 'monologue', 'thought', 'announce',
                      'excited', 'surprise', 'angry', 'custom1', 'custom2'];
    await FileManager.saveSlotOrder(original);
    await FileManager.flushConfigWrites();

    // angry(idx=7)를 emphasis(idx=1) 위치로 이동
    const newSlots = [...original];
    const [moved] = newSlots.splice(7, 1); // angry 제거
    newSlots.splice(1, 0, moved);           // idx=1에 삽입

    await FileManager.saveSlotOrder(newSlots);
    const loaded = await FileManager.loadSlotOrder();

    expect(loaded[0]).toBe('plain');    // 첫 번째는 항상 plain
    expect(loaded[1]).toBe('angry');    // 이동된 항목
    expect(loaded[2]).toBe('emphasis'); // 밀린 항목
    expect(loaded).toHaveLength(10);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. saveConfig가 textMacros/textStyles도 보존하는지
// ═══════════════════════════════════════════════════════════
describe('saveConfig 시 textMacros/textStyles 보존', () => {
  it('saveConfig 후에도 기존 textMacros가 유지됨', async () => {
    await FileManager.saveTextMacros(['…', '―', '♡']);
    await FileManager.saveConfig({ processMode: 'line' });

    const loaded = await FileManager.loadTextMacros();
    expect(loaded).toEqual(['…', '―', '♡']);
  });

  it('saveConfig 후에도 기존 textStyles가 유지됨', async () => {
    await FileManager.saveTextStyles(['기본', '강조']);
    await FileManager.saveConfig({ viewMode: 'listview' });

    const loaded = await FileManager.loadTextStyles();
    expect(loaded).toEqual(['기본', '강조']);
  });

  it('saveConfig가 styleActions + slotOrder + textMacros + textStyles 모두 보존', async () => {
    const mapping = { plain: { set: 'A', action: '1' } };
    const order = ['emphasis', 'plain', 'angry', 'thought', 'announce',
                   'excited', 'surprise', 'monologue', 'custom1', 'custom2'];
    const macros = ['…', '―'];
    const styles = ['기본', '강조', '독백'];

    await FileManager.saveStyleActions(mapping);
    await FileManager.saveSlotOrder(order);
    await FileManager.saveTextMacros(macros);
    await FileManager.saveTextStyles(styles);

    // 일반 설정 저장 (앱 종료 시나리오 시뮬레이션)
    await FileManager.saveConfig({ theme: { mode: 'dark', accentColor: '#ff0000' } });

    expect(await FileManager.loadStyleActions()).toEqual(mapping);
    expect(await FileManager.loadSlotOrder()).toEqual(order);
    expect(await FileManager.loadTextMacros()).toEqual(macros);
    expect(await FileManager.loadTextStyles()).toEqual(styles);
  });
});

// ═══════════════════════════════════════════════════════════
// 8. 동시 쓰기 경쟁 조건 (lock 검증)
// ═══════════════════════════════════════════════════════════
describe('모든 config 쓰기 함수가 lock을 공유하여 경쟁 방지', () => {
  it('saveTextMacros와 saveStyleActions 동시 호출 시 양쪽 데이터 모두 보존', async () => {
    await Promise.all([
      FileManager.saveTextMacros(['…', '―', '♡']),
      FileManager.saveStyleActions({ plain: { set: 'X', action: 'Y' } }),
    ]);
    await FileManager.flushConfigWrites();

    const saved = readSavedConfig();
    expect(saved.textMacros).toEqual(['…', '―', '♡']);
    expect(saved.styleActions).toEqual({ plain: { set: 'X', action: 'Y' } });
  });

  it('saveTextStyles와 saveSlotOrder 동시 호출 시 양쪽 데이터 모두 보존', async () => {
    await Promise.all([
      FileManager.saveTextStyles(['기본', '강조']),
      FileManager.saveSlotOrder(['angry', 'plain', 'emphasis', 'monologue', 'thought',
                                  'announce', 'excited', 'surprise', 'custom1', 'custom2']),
    ]);
    await FileManager.flushConfigWrites();

    const saved = readSavedConfig();
    expect(saved.textStyles).toEqual(['기본', '강조']);
    expect(saved.slotOrder).toEqual(['angry', 'plain', 'emphasis', 'monologue', 'thought',
                                      'announce', 'excited', 'surprise', 'custom1', 'custom2']);
  });

  it('4개 함수 동시 호출 → 모든 데이터가 최종 파일에 존재', async () => {
    await Promise.all([
      FileManager.saveStyleActions({ emphasis: { set: 'FX', action: 'Glow' } }),
      FileManager.saveSlotOrder(['custom2', 'plain', 'emphasis', 'monologue', 'thought',
                                  'announce', 'excited', 'surprise', 'angry', 'custom1']),
      FileManager.saveTextMacros(['★', '☆']),
      FileManager.saveTextStyles(['기본']),
    ]);
    await FileManager.flushConfigWrites();

    const saved = readSavedConfig();
    expect(saved.styleActions).toEqual({ emphasis: { set: 'FX', action: 'Glow' } });
    expect(saved.slotOrder).toEqual(['custom2', 'plain', 'emphasis', 'monologue', 'thought',
                                      'announce', 'excited', 'surprise', 'angry', 'custom1']);
    expect(saved.textMacros).toEqual(['★', '☆']);
    expect(saved.textStyles).toEqual(['기본']);
  });
});

// ═══════════════════════════════════════════════════════════
// 9. 앱 종료 시나리오 전체 시뮬레이션
// ═══════════════════════════════════════════════════════════
describe('앱 종료 → 재시작 라운드트립', () => {
  it('슬롯 설정 후 saveConfig(일반 설정)을 호출해도 모든 데이터 보존', async () => {
    // 1단계: 사용자가 슬롯 액션 설정
    const mapping = {
      plain: { set: 'DefaultActions', action: 'Bold' },
      emphasis: { set: 'MySet', action: 'Italic' },
      angry: { set: 'FX', action: 'RedGlow' },
    };
    const order = ['emphasis', 'plain', 'angry', 'thought', 'announce',
                   'excited', 'surprise', 'monologue', 'custom1', 'custom2'];
    await FileManager.saveStyleActions(mapping);
    await FileManager.saveSlotOrder(order);

    // 2단계: 앱 종료 시 exit() 진행 — flushConfigWrites + saveConfig
    await FileManager.flushConfigWrites();
    await FileManager.saveConfig({
      processMode: 'paragraph',
      viewMode: 'overview',
    });
    await FileManager.flushConfigWrites();

    // 3단계: 앱 재시작 시 로드
    const loadedMapping = await FileManager.loadStyleActions();
    const loadedOrder = await FileManager.loadSlotOrder();

    expect(loadedMapping).toEqual(mapping);
    expect(loadedOrder).toEqual(order);
  });

  it('textMacros + textStyles + styleActions가 saveConfig 이후에도 모두 살아남음', async () => {
    // 1단계: 다양한 설정 저장
    await FileManager.saveStyleActions({ plain: { set: 'A', action: '1' } });
    await FileManager.saveTextMacros(['★', '☆', '♪']);
    await FileManager.saveTextStyles(['기본', '강조', '독백']);

    // 2단계: 앱 종료 흐름
    await FileManager.flushConfigWrites();
    await FileManager.saveConfig({ theme: { mode: 'dark' } });
    await FileManager.flushConfigWrites();

    // 3단계: 재시작 로드
    expect(await FileManager.loadStyleActions()).toEqual({ plain: { set: 'A', action: '1' } });
    expect(await FileManager.loadTextMacros()).toEqual(['★', '☆', '♪']);
    expect(await FileManager.loadTextStyles()).toEqual(['기본', '강조', '독백']);
  });

  it('반복적인 saveConfig 호출이 데이터를 누적 손상시키지 않음', async () => {
    const mapping = { plain: { set: 'X', action: 'Y' } };
    await FileManager.saveStyleActions(mapping);

    // saveConfig를 3번 연속 호출 (설정 변경 시마다)
    await FileManager.saveConfig({ processMode: 'line' });
    await FileManager.saveConfig({ viewMode: 'listview' });
    await FileManager.saveConfig({ theme: { mode: 'light' } });
    await FileManager.flushConfigWrites();

    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual(mapping);
  });
});

// ═══════════════════════════════════════════════════════════
// 10. Atomic write 검증 — .tmp 통한 안전 쓰기
// ═══════════════════════════════════════════════════════════
describe('Atomic write (truncation 방지)', () => {
  it('쓰기 중 .tmp 파일을 거쳐 원본에 도달', async () => {
    const writes = [];
    const renames = [];
    const origWrite = mockFsPromises.writeFile;
    const origRename = mockFsPromises.rename;

    mockFsPromises.writeFile = async (p, d) => {
      writes.push(p);
      return origWrite(p, d);
    };
    mockFsPromises.rename = async (o, n) => {
      renames.push({ from: o, to: n });
      return origRename(o, n);
    };

    try {
      await FileManager.saveStyleActions({ test: { set: 'A', action: '1' } });
      await FileManager.flushConfigWrites();

      // .tmp에 먼저 쓰고 rename으로 원본에 이동
      expect(writes.some(p => p.endsWith('.tmp'))).toBe(true);
      expect(renames.some(r => r.from.endsWith('.tmp') && r.to === configPath)).toBe(true);
    } finally {
      mockFsPromises.writeFile = origWrite;
      mockFsPromises.rename = origRename;
    }
  });

  it('rename 전 프로세스 죽으면 원본 파일은 이전 상태 그대로 (시뮬레이션)', async () => {
    // 기존 설정 저장
    await FileManager.saveStyleActions({ original: { set: 'O', action: '0' } });
    await FileManager.flushConfigWrites();

    // rename을 실패시켜 "프로세스 crash" 시뮬레이션
    const origRename = mockFsPromises.rename;
    mockFsPromises.rename = async () => { throw new Error('simulated crash'); };

    try {
      await FileManager.saveStyleActions({ overwritten: { set: 'X', action: 'X' } })
        .catch(() => {});
      await FileManager.flushConfigWrites().catch(() => {});
    } finally {
      mockFsPromises.rename = origRename;
    }

    // 원본 파일은 이전 상태 유지 (rename이 실패했으므로)
    const loaded = await FileManager.loadStyleActions();
    expect(loaded).toEqual({ original: { set: 'O', action: '0' } });
  });
});
