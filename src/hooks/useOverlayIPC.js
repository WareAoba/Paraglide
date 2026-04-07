// src/hooks/useOverlayIPC.js — 오버레이 윈도우 전용 IPC→Zustand 동기화 훅
// 오버레이는 메인 윈도우와 별도 BrowserWindow(별도 JS 런타임)이므로
// Zustand 인스턴스가 분리됨. 이 훅이 IPC 이벤트를 수신하여 오버레이의 Zustand를 갱신.
import { useEffect, useRef } from 'react';
import useAppStore from '../stores/useAppStore';

const { ipcRenderer } = window.require('electron');

export default function useOverlayIPC() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let cancelled = false;

    const store = useAppStore;

    // ─── 초기 상태 로드 ───
    const initializeState = async () => {
      try {
        const [initialState, savedSettings, initialTheme] = await Promise.all([
          ipcRenderer.invoke('get-state'),
          ipcRenderer.invoke('load-settings'),
          ipcRenderer.invoke('get-current-theme')
        ]);

        // StrictMode cleanup 후 실행되는 비동기 결과 무시
        if (cancelled) return;

        if (initialState || savedSettings || initialTheme) {
          store.setState({
            ...(initialState && {
              programStatus: initialState.programStatus,
              isPaused: initialState.isPaused,
              isOverlayVisible: initialState.isOverlayVisible,
            }),
            ...(initialTheme && { theme: initialTheme }),
            pluginServer: savedSettings?.pluginServer ?? false,
            pluginConnected: (savedSettings?.pluginServer && savedSettings?.pluginConnected) ?? false,
            pluginModeActive: savedSettings?.pluginModeActive ?? false,
          });
        }
      } catch (error) {
        console.error('[Overlay] 초기 상태 로드 실패:', error);
      }
    };

    // ─── IPC 이벤트 핸들러 ───
    // paragraphs-updated: 오버레이 전용 콘텐츠 업데이트 (WindowManager에서 전송)
    const handleParagraphsUpdated = (_, data) => {
      if (!data) return;
      store.getState().syncOverlayContent(data);
    };

    const handleThemeUpdate = (_, newTheme) => {
      if (!newTheme) return;
      store.setState({ theme: newTheme });
    };

    const handleThemeVariables = (_, variables) => {
      if (!variables || typeof variables !== 'object') return;
      const root = document.documentElement;
      Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
      if (variables['--primary-color']) {
        const prev = store.getState().theme;
        store.setState({
          theme: { ...prev, accentColor: variables['--primary-color'] }
        });
      }
    };

    const handleContentOpacity = (_, opacity) => {
      document.documentElement.style.setProperty('--bg-opacity', opacity);
    };

    const handlePluginSettings = (_, { pluginServer, pluginConnected }) => {
      if (pluginServer !== undefined) store.setState({ pluginServer });
      if (pluginConnected !== undefined) store.setState({ pluginConnected });
    };

    const handlePhotoshopMode = (_, active) => {
      store.setState({ pluginModeActive: active });
    };

    // ─── 이벤트 리스너 등록 ───
    ipcRenderer.on('paragraphs-updated', handleParagraphsUpdated);
    ipcRenderer.on('theme-update', handleThemeUpdate);
    ipcRenderer.on('update-theme-variables', handleThemeVariables);
    ipcRenderer.on('update-content-opacity', handleContentOpacity);
    ipcRenderer.on('plugin-settings-changed', handlePluginSettings);
    ipcRenderer.on('photoshop-mode-changed', handlePhotoshopMode);

    initializeState();

    return () => {
      cancelled = true;
      ipcRenderer.removeListener('paragraphs-updated', handleParagraphsUpdated);
      ipcRenderer.removeListener('theme-update', handleThemeUpdate);
      ipcRenderer.removeListener('update-theme-variables', handleThemeVariables);
      ipcRenderer.removeListener('update-content-opacity', handleContentOpacity);
      ipcRenderer.removeListener('plugin-settings-changed', handlePluginSettings);
      ipcRenderer.removeListener('photoshop-mode-changed', handlePhotoshopMode);
      // StrictMode 재마운트 시 재초기화 허용을 위해 플래그 리셋
      initialized.current = false;
    };
  }, []);
}
