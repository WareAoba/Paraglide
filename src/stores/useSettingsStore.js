// src/stores/useSettingsStore.js — 설정 모달 상태 (Zustand)
import { create } from 'zustand';
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PROCESS_MODE,
  DEFAULT_VIEW_MODE,
  DEFAULT_LANGUAGE,
  OVERLAY_DEFAULTS,
  THEME,
} from '../constants';

const { ipcRenderer } = window.require('electron');

const useSettingsStore = create((set, get) => ({
  // ─── 설정 값 ───
  settings: {
    windowOpacity: OVERLAY_DEFAULTS.WINDOW_OPACITY,
    contentOpacity: OVERLAY_DEFAULTS.CONTENT_OPACITY,
    overlayFixed: false,
    loadLastOverlayBounds: true,
    theme: {
      mode: THEME.AUTO,
      accentColor: DEFAULT_ACCENT_COLOR,
    },
    processMode: DEFAULT_PROCESS_MODE,
    viewMode: DEFAULT_VIEW_MODE,
    language: DEFAULT_LANGUAGE,
    pluginServer: false,
    pluginConnected: false,
  },

  // ─── 플러그인 상태 ───
  pluginStatus: { running: false, plugins: [] },


  // ─── 원본 설정 (취소용) ───
  originalSettings: null,

  // ─── 액션 ───
  setSettings: (settings) => set({ settings }),
  updateSettings: (partial) => set((s) => ({
    settings: { ...s.settings, ...partial },
  })),
  setPluginStatus: (status) => set({ pluginStatus: status }),

  setOriginalSettings: (settings) => set({ originalSettings: settings }),

  // ─── 설정 로드 ───
  loadSettings: async () => {
    try {
      const savedSettings = await ipcRenderer.invoke('load-settings');
      if (savedSettings) {
        const newSettings = {
          ...get().settings,
          ...savedSettings,
        };
        set({ settings: newSettings, originalSettings: newSettings });
      }
    } catch (error) {
      console.error('설정 로드 중 오류:', error);
    }
  },

  // ─── 설정 적용 ───
  applySettings: async (newSettings) => {
    try {
      set({ settings: newSettings });
      const result = await ipcRenderer.invoke('apply-settings', {
        windowOpacity: newSettings.windowOpacity,
        contentOpacity: newSettings.contentOpacity,
        overlayFixed: newSettings.overlayFixed,
        loadLastOverlayBounds: newSettings.loadLastOverlayBounds,
        processMode: newSettings.processMode,
        viewMode: newSettings.viewMode,
        theme: {
          mode: newSettings.theme.mode,
          accentColor: newSettings.theme.accentColor,
        },
        pluginServer: newSettings.pluginServer,
        pluginConnected: newSettings.pluginConnected,
      });
      if (!result) {
        console.error('[Settings] 설정 적용 실패');
      }
    } catch (error) {
      console.error('[Settings] 설정 변경 중 오류:', error);
    }
  },

  // ─── 취소 시 복원 ───
  cancelSettings: () => {
    const { originalSettings } = get();
    if (originalSettings) {
      set({ settings: originalSettings });
      get().applySettings(originalSettings);
    }
  },
}));

export default useSettingsStore;
