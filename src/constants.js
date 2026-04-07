// src/constants.js — 렌더러(ESM) 공유 상수
// Main Process의 src/main/constants.js(CJS)와 값을 동기화해야 합니다.

export const ProgramStatus = {
  READY: 'Ready',
  PROCESS: 'Process',
  PAUSE: 'Pause',
  LOADING: 'Loading',
  EDIT: 'Edit'
};

export const THEME = {
  DARK: 'dark',
  LIGHT: 'light',
  AUTO: 'auto'
};

// ─── 기본값 상수 ───
export const DEFAULT_ACCENT_COLOR = '#007bff';
export const DEFAULT_PROCESS_MODE = 'paragraph';
export const DEFAULT_VIEW_MODE = 'overview';
export const DEFAULT_LANGUAGE = 'auto';
export const PLUGIN_PORT = 27182;

// ─── 오버레이 기본값 ───
export const OVERLAY_DEFAULTS = {
  WIDTH: 320,
  HEIGHT: 240,
  WINDOW_OPACITY: 1.0,
  CONTENT_OPACITY: 0.8,
};

// ─── 색상 프리셋 ───
export const COLOR_PRESETS = ['#007bff', '#dc3545', '#28a745', '#ffc107', '#17a2b8', '#6f42c1'];
