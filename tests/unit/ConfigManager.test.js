// tests/unit/ConfigManager.test.js
import { describe, it, expect } from 'vitest';

const { ConfigManager } = require('../../src/utils/ConfigManager');
const { THEME } = require('../../src/main/constants');

// ═══════════════ validateBoolean ═══════════════
describe('validateBoolean', () => {
  it('boolean 값이면 그대로 반환', () => {
    expect(ConfigManager.validateBoolean(true, false)).toBe(true);
    expect(ConfigManager.validateBoolean(false, true)).toBe(false);
  });

  it('boolean이 아니면 기본값 반환', () => {
    expect(ConfigManager.validateBoolean('true', false)).toBe(false);
    expect(ConfigManager.validateBoolean(null, true)).toBe(true);
    expect(ConfigManager.validateBoolean(undefined, false)).toBe(false);
    expect(ConfigManager.validateBoolean(1, true)).toBe(true);
  });
});

// ═══════════════ validateNumber ═══════════════
describe('validateNumber', () => {
  it('유효한 숫자면 그대로 반환', () => {
    expect(ConfigManager.validateNumber(42, 0)).toBe(42);
    expect(ConfigManager.validateNumber(0.5, 1)).toBe(0.5);
  });

  it('숫자가 아니면 기본값 반환', () => {
    expect(ConfigManager.validateNumber('42', 10)).toBe(10);
    expect(ConfigManager.validateNumber(null, 10)).toBe(10);
    expect(ConfigManager.validateNumber(undefined, 10)).toBe(10);
  });

  it('NaN이면 기본값 반환', () => {
    expect(ConfigManager.validateNumber(NaN, 10)).toBe(10);
  });

  it('min/max 범위 적용', () => {
    expect(ConfigManager.validateNumber(150, 50, 0, 100)).toBe(100);
    expect(ConfigManager.validateNumber(-5, 50, 0, 100)).toBe(0);
    expect(ConfigManager.validateNumber(50, 0, 0, 100)).toBe(50);
  });
});

// ═══════════════ validateThemeMode ═══════════════
describe('validateThemeMode', () => {
  it('허용된 모드면 그대로 반환', () => {
    expect(ConfigManager.validateThemeMode('dark', 'auto')).toBe('dark');
    expect(ConfigManager.validateThemeMode('light', 'auto')).toBe('light');
    expect(ConfigManager.validateThemeMode('auto', 'dark')).toBe('auto');
  });

  it('허용되지 않은 값이면 기본값 반환', () => {
    expect(ConfigManager.validateThemeMode('neon', 'auto')).toBe('auto');
    expect(ConfigManager.validateThemeMode(null, 'dark')).toBe('dark');
    expect(ConfigManager.validateThemeMode(123, 'light')).toBe('light');
  });
});

// ═══════════════ validateLanguage ═══════════════
describe('validateLanguage', () => {
  it('지원 언어면 그대로 반환', () => {
    ['auto', 'ko', 'en', 'ja', 'zh'].forEach(lang => {
      expect(ConfigManager.validateLanguage(lang, 'auto')).toBe(lang);
    });
  });

  it('미지원 언어면 기본값 반환', () => {
    expect(ConfigManager.validateLanguage('fr', 'auto')).toBe('auto');
    expect(ConfigManager.validateLanguage(null, 'ko')).toBe('ko');
  });
});

// ═══════════════ validateProcessMode ═══════════════
describe('validateProcessMode', () => {
  it('허용된 모드면 그대로 반환', () => {
    expect(ConfigManager.validateProcessMode('paragraph', 'paragraph')).toBe('paragraph');
    expect(ConfigManager.validateProcessMode('line', 'paragraph')).toBe('line');
  });

  it('허용되지 않은 값이면 기본값 반환', () => {
    expect(ConfigManager.validateProcessMode('word', 'paragraph')).toBe('paragraph');
  });
});

// ═══════════════ validateViewMode ═══════════════
describe('validateViewMode', () => {
  it('허용된 모드면 그대로 반환', () => {
    expect(ConfigManager.validateViewMode('overview', 'overview')).toBe('overview');
    expect(ConfigManager.validateViewMode('listview', 'overview')).toBe('listview');
  });

  it('허용되지 않은 값이면 기본값 반환', () => {
    expect(ConfigManager.validateViewMode('gridview', 'overview')).toBe('overview');
  });
});

// ═══════════════ validateConfigStructure ═══════════════
describe('validateConfigStructure', () => {
  it('유효한 구조면 true', () => {
    const validConfig = {
      theme: { mode: 'dark' },
      overlay: { bounds: {} },
      processMode: 'paragraph',
      viewMode: 'overview',
      language: 'ko'
    };
    expect(ConfigManager.validateConfigStructure(validConfig)).toBe(true);
  });

  it('null이면 falsy', () => {
    expect(ConfigManager.validateConfigStructure(null)).toBeFalsy();
  });

  it('theme 누락이면 falsy', () => {
    expect(ConfigManager.validateConfigStructure({
      overlay: {}, processMode: 'paragraph', viewMode: 'overview', language: 'ko'
    })).toBeFalsy();
  });

  it('overlay 누락이면 falsy', () => {
    expect(ConfigManager.validateConfigStructure({
      theme: {}, processMode: 'paragraph', viewMode: 'overview', language: 'ko'
    })).toBeFalsy();
  });

  it('processMode가 문자열이 아니면 false', () => {
    expect(ConfigManager.validateConfigStructure({
      theme: {}, overlay: {}, processMode: 123, viewMode: 'overview', language: 'ko'
    })).toBe(false);
  });

  it('language 누락이면 false', () => {
    expect(ConfigManager.validateConfigStructure({
      theme: {}, overlay: {}, processMode: 'paragraph', viewMode: 'overview'
    })).toBe(false);
  });
});

// ═══════════════ mergeWithDefaults ═══════════════
describe('mergeWithDefaults', () => {
  const defaultConfig = {
    theme: { mode: 'auto', accentColor: '#007bff' },
    language: 'auto',
    overlay: {
      bounds: { width: 320, height: 240, x: null, y: null },
      windowOpacity: 1.0,
      contentOpacity: 0.8,
      overlayFixed: false,
      loadLastOverlayBounds: true,
      isVisible: true
    },
    processMode: 'paragraph',
    viewMode: 'overview'
  };

  it('유효한 saved 값은 유지', () => {
    const saved = {
      theme: { mode: 'dark', accentColor: '#ff0000' },
      language: 'ko',
      overlay: {
        bounds: { width: 400, height: 300, x: 100, y: 200 },
        windowOpacity: 0.9,
        contentOpacity: 0.5,
        overlayFixed: true,
        loadLastOverlayBounds: false,
        isVisible: false
      },
      processMode: 'line',
      viewMode: 'listview'
    };
    const result = ConfigManager.mergeWithDefaults(saved, defaultConfig);
    expect(result.theme.mode).toBe('dark');
    expect(result.theme.accentColor).toBe('#ff0000');
    expect(result.language).toBe('ko');
    expect(result.overlay.windowOpacity).toBe(0.9);
    expect(result.processMode).toBe('line');
    expect(result.viewMode).toBe('listview');
  });

  it('누락된 필드는 기본값 사용', () => {
    const saved = {
      theme: {},
      language: 'en',
      overlay: {},
      processMode: 'paragraph',
      viewMode: 'overview'
    };
    const result = ConfigManager.mergeWithDefaults(saved, defaultConfig);
    expect(result.theme.mode).toBe('auto');
    expect(result.theme.accentColor).toBe('#007bff');
    expect(result.overlay.windowOpacity).toBe(1.0);
    expect(result.overlay.overlayFixed).toBe(false);
  });

  it('잘못된 theme mode는 기본값으로 교정', () => {
    const saved = {
      theme: { mode: 'neon' },
      language: 'en',
      overlay: {},
      processMode: 'paragraph',
      viewMode: 'overview'
    };
    const result = ConfigManager.mergeWithDefaults(saved, defaultConfig);
    expect(result.theme.mode).toBe('auto');
  });
});
