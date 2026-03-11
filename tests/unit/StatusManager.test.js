// tests/unit/StatusManager.test.js
import { describe, it, expect } from 'vitest';

const { ProgramStatus } = require('../../src/main/constants');
const StatusManager = require('../../src/main/managers/StatusManager');

// ═══════════════ validateTransition ═══════════════
describe('validateTransition', () => {
  // READY → LOADING (유일하게 허용)
  it('READY → LOADING 허용', () => {
    expect(StatusManager.validateTransition(ProgramStatus.READY, ProgramStatus.LOADING))
      .toBe(true);
  });

  it('READY → PROCESS 불허', () => {
    expect(StatusManager.validateTransition(ProgramStatus.READY, ProgramStatus.PROCESS))
      .toBeFalsy();
  });

  it('READY → PAUSE 불허', () => {
    expect(StatusManager.validateTransition(ProgramStatus.READY, ProgramStatus.PAUSE))
      .toBeFalsy();
  });

  // LOADING → PROCESS, READY
  it('LOADING → PROCESS 허용', () => {
    expect(StatusManager.validateTransition(ProgramStatus.LOADING, ProgramStatus.PROCESS))
      .toBe(true);
  });

  it('LOADING → READY 허용 (로딩 취소)', () => {
    expect(StatusManager.validateTransition(ProgramStatus.LOADING, ProgramStatus.READY))
      .toBe(true);
  });

  it('LOADING → PAUSE 불허', () => {
    expect(StatusManager.validateTransition(ProgramStatus.LOADING, ProgramStatus.PAUSE))
      .toBeFalsy();
  });

  // PROCESS → PAUSE, READY
  it('PROCESS → PAUSE 허용', () => {
    expect(StatusManager.validateTransition(ProgramStatus.PROCESS, ProgramStatus.PAUSE))
      .toBe(true);
  });

  it('PROCESS → READY 허용', () => {
    expect(StatusManager.validateTransition(ProgramStatus.PROCESS, ProgramStatus.READY))
      .toBe(true);
  });

  it('PROCESS → LOADING 불허', () => {
    expect(StatusManager.validateTransition(ProgramStatus.PROCESS, ProgramStatus.LOADING))
      .toBeFalsy();
  });

  // PAUSE → PROCESS, READY
  it('PAUSE → PROCESS 허용 (재개)', () => {
    expect(StatusManager.validateTransition(ProgramStatus.PAUSE, ProgramStatus.PROCESS))
      .toBe(true);
  });

  it('PAUSE → READY 허용 (중단)', () => {
    expect(StatusManager.validateTransition(ProgramStatus.PAUSE, ProgramStatus.READY))
      .toBe(true);
  });

  it('PAUSE → LOADING 불허', () => {
    expect(StatusManager.validateTransition(ProgramStatus.PAUSE, ProgramStatus.LOADING))
      .toBeFalsy();
  });

  // EDIT → READY
  it('EDIT → READY 허용', () => {
    expect(StatusManager.validateTransition(ProgramStatus.EDIT, ProgramStatus.READY))
      .toBe(true);
  });

  it('EDIT → PROCESS 불허', () => {
    expect(StatusManager.validateTransition(ProgramStatus.EDIT, ProgramStatus.PROCESS))
      .toBeFalsy();
  });

  it('EDIT → PAUSE 불허', () => {
    expect(StatusManager.validateTransition(ProgramStatus.EDIT, ProgramStatus.PAUSE))
      .toBeFalsy();
  });

  // 알 수 없는 상태
  it('존재하지 않는 상태에서 전환 불허', () => {
    expect(StatusManager.validateTransition('UNKNOWN', ProgramStatus.READY))
      .toBeFalsy();
  });
});

// ═══════════════ ProgramStatus 상수 ═══════════════
describe('ProgramStatus 상수', () => {
  it('모든 상태값이 정의됨', () => {
    expect(ProgramStatus.READY).toBe('Ready');
    expect(ProgramStatus.PROCESS).toBe('Process');
    expect(ProgramStatus.PAUSE).toBe('Pause');
    expect(ProgramStatus.LOADING).toBe('Loading');
    expect(ProgramStatus.EDIT).toBe('Edit');
  });

  it('5개의 상태가 존재', () => {
    expect(Object.keys(ProgramStatus)).toHaveLength(5);
  });
});
