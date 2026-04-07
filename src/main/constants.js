// constants.js — 상수 및 유틸리티 함수
const path = require('path');
const os = require('os');
const { app } = require('electron');

const ProgramStatus = {
  READY: 'Ready',
  PROCESS: 'Process',
  PAUSE: 'Pause',
  LOADING: 'Loading',
  EDIT: 'Edit'
};

const THEME = {
  DARK: 'dark',
  LIGHT: 'light',
  AUTO: 'auto'
};

// 상수 정의
const DEBOUNCE_TIME = 250;
const DEFAULT_PROCESS_MODE = 'paragraph';
const DEFAULT_VIEW_MODE = 'overview';
const DEFAULT_LANGUAGE = 'auto';
const DEFAULT_ACCENT_COLOR = '#007bff';
const PLUGIN_PORT = 27182;
const TEMP_DIR = path.join(os.tmpdir(), 'paraglide-backup');
const TEMP_FILE = 'backup.json';

// 오버레이 기본값
const OVERLAY_DEFAULTS = {
  WIDTH: 320,
  HEIGHT: 240,
  WINDOW_OPACITY: 1.0,
  CONTENT_OPACITY: 0.8,
};

const isDev = process.env.NODE_ENV === 'development';
const appPath = isDev ? path.resolve(__dirname, '../..') : app.getAppPath();

// 파일 경로 정의
const FILE_PATHS = {
  config: path.join(os.homedir(), '.ParaglideConfigure.json'),
  log: path.join(os.homedir(), '.ParaglideParaLog.json'),
  logos: isDev 
    ? path.join(appPath, 'public', 'logo.png')
    : path.join(process.resourcesPath, 'dist', 'logo.png'),
  titles: {
    light: isDev
      ? path.join(appPath, 'public', 'TitleLight.png')
      : path.join(process.resourcesPath, 'dist', 'TitleLight.png'), 
    dark: isDev
      ? path.join(appPath, 'public', 'TitleDark.png')
      : path.join(process.resourcesPath, 'dist', 'TitleDark.png')
  },
  icon: isDev
    ? path.join(appPath, 'public', 'icons', 'mac', 'icon.icns')
    : path.join(process.resourcesPath, 'dist', 'icons', 'mac', 'icon.icns'),
  ui_icons: isDev
    ? path.join(appPath, 'public', 'UI_icons')
    : path.join(process.resourcesPath, 'dist', 'UI_icons')
};

// 디바운스 함수 정의
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

module.exports = {
  ProgramStatus,
  THEME,
  DEBOUNCE_TIME,
  DEFAULT_PROCESS_MODE,
  DEFAULT_VIEW_MODE,
  DEFAULT_LANGUAGE,
  DEFAULT_ACCENT_COLOR,
  OVERLAY_DEFAULTS,
  PLUGIN_PORT,
  TEMP_DIR,
  TEMP_FILE,
  isDev,
  appPath,
  FILE_PATHS,
  debounce
};
