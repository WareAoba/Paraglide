// src/hooks/useIPC.js — IPC 이벤트 구독 및 Zustand 자동 동기화 훅
import { useEffect, useRef } from 'react';
import useAppStore from '../stores/useAppStore';

const { ipcRenderer } = window.require('electron');

/**
 * Main Process에서 오는 IPC 이벤트를 수신하여 Zustand 스토어에 자동 동기화.
 * MainComponent에서 한 번만 호출하면 됩니다.
 * 
 * @param {Function} themeCalc - 테마 CSS 변수 계산 함수
 * @param {React.RefObject} searchRef - 검색 컴포넌트 ref
 */
export default function useIPC(themeCalc, searchRef) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const store = useAppStore;

    // ─── 초기 상태 로드 ───
    const initializeState = async () => {
      try {
        const [initialState, savedSettings, initialTheme] = await Promise.all([
          ipcRenderer.invoke('get-state'),
          ipcRenderer.invoke('load-settings'),
          ipcRenderer.invoke('get-current-theme')
        ]);

        store.setState({
          programStatus: initialState.programStatus,
          isOverlayVisible: initialState.isOverlayVisible,
          viewMode: savedSettings?.viewMode || 'overview',
          theme: initialTheme,
          pluginServer: savedSettings?.pluginServer ?? false,
          pluginConnected: (savedSettings?.pluginServer && savedSettings?.pluginConnected) ?? false
        });

        // 테마 계산 및 로고 로드
        themeCalc(initialTheme.accentColor);
        loadLogo();
      } catch (error) {
        console.error('초기 상태 로드 실패:', error);
      }
    };

    const loadLogo = async () => {
      try {
        const [logoData, titleData] = await Promise.all([
          ipcRenderer.invoke('get-logo-path', 'logo'),
          ipcRenderer.invoke('get-logo-path', 'title')
        ]);
        store.setState({ logoPath: logoData, titlePath: titleData });
      } catch (error) {
        console.error('로고/타이틀 로드 실패:', error);
      }
    };

    // ─── IPC 이벤트 핸들러 ───
    const handleStateUpdate = (_, updatedState) => {
      store.getState().syncFromMain(updatedState);
    };

    const handleThemeUpdate = (_, newTheme) => {
      if (!newTheme) return;
      store.setState({ theme: newTheme });
      loadLogo();
      themeCalc(newTheme.accentColor);
    };

    const handleViewModeUpdate = (_, newViewMode) => {
      const { viewMode: currentViewMode } = store.getState();

      if (newViewMode === 'editor') {
        store.setState({ viewMode: newViewMode });
        ipcRenderer.send('toggle-overlay', false);
      } else if (currentViewMode === 'editor') {
        store.setState({ viewMode: newViewMode });
      } else {
        store.setState({ viewMode: newViewMode });
      }
    };

    const handleClearSearch = () => {
      if (searchRef?.current) {
        searchRef.current.clearSearch();
      }
    };

    const handleLoadFile = () => {
      // trigger-load-file → 파일 로드 핸들러
      const { handleLoadFile } = store.getState();
      if (typeof handleLoadFile === 'function') {
        handleLoadFile();
      }
    };

    const handleToggleSearch = () => {
      store.getState().toggleSearch();
    };

    const handleToggleSidebar = () => {
      store.getState().toggleSidebar();
    };

    const handleToggleSettings = () => {
      store.getState().toggleSettings();
    };

    const handleCloseEsc = () => {
      store.getState().handleCloseEsc();
      if (searchRef?.current) {
        searchRef.current.clearSearch();
      }
    };

    const handlePluginSettingsChanged = (_, { pluginServer, pluginConnected }) => {
      if (pluginServer !== undefined) store.setState({ pluginServer });
      if (pluginConnected !== undefined) store.setState({ pluginConnected });
    };

    // ─── 이벤트 리스너 등록 ───
    ipcRenderer.on('state-update', handleStateUpdate);
    ipcRenderer.on('theme-update', handleThemeUpdate);
    ipcRenderer.on('view-mode-update', handleViewModeUpdate);
    ipcRenderer.on('clear-search', handleClearSearch);
    ipcRenderer.on('trigger-load-file', handleLoadFile);
    ipcRenderer.on('toggle-search', handleToggleSearch);
    ipcRenderer.on('toggle-sidebar', handleToggleSidebar);
    ipcRenderer.on('toggle-settings', handleToggleSettings);
    ipcRenderer.on('close-esc', handleCloseEsc);
    ipcRenderer.on('plugin-settings-changed', handlePluginSettingsChanged);

    // 초기화
    initializeState();

    // 클린업
    return () => {
      ipcRenderer.removeListener('state-update', handleStateUpdate);
      ipcRenderer.removeListener('theme-update', handleThemeUpdate);
      ipcRenderer.removeListener('view-mode-update', handleViewModeUpdate);
      ipcRenderer.removeListener('clear-search', handleClearSearch);
      ipcRenderer.removeListener('trigger-load-file', handleLoadFile);
      ipcRenderer.removeListener('toggle-search', handleToggleSearch);
      ipcRenderer.removeListener('toggle-sidebar', handleToggleSidebar);
      ipcRenderer.removeListener('toggle-settings', handleToggleSettings);
      ipcRenderer.removeListener('close-esc', handleCloseEsc);
      ipcRenderer.removeListener('plugin-settings-changed', handlePluginSettingsChanged);
      initialized.current = false;
    };
  }, [themeCalc, searchRef]);
}
