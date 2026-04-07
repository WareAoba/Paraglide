// src/hooks/useIPC.js — IPC 이벤트 구독 및 Zustand 자동 동기화 훅
import { useEffect, useRef } from 'react';
import useAppStore from '../stores/useAppStore';
import { DEFAULT_VIEW_MODE } from '../constants';

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
    let cancelled = false;

    const store = useAppStore;

    // ─── 초기 상태 로드 ───
    const initializeState = async () => {
      // 각 IPC 호출을 개별 처리하여 하나의 실패가 전체를 차단하지 않도록 함
      let initialState = null;
      let savedSettings = null;
      let initialTheme = null;

      try {
        [initialState, savedSettings, initialTheme] = await Promise.all([
          ipcRenderer.invoke('get-state'),
          ipcRenderer.invoke('load-settings'),
          ipcRenderer.invoke('get-current-theme')
        ]);
      } catch (error) {
        console.error('초기 상태 로드 실패, 개별 로드 시도:', error);
        // 개별적으로 재시도
        const safeInvoke = (channel) => ipcRenderer.invoke(channel).catch(() => null);
        [initialState, savedSettings, initialTheme] = await Promise.all([
          initialState ?? safeInvoke('get-state'),
          savedSettings ?? safeInvoke('load-settings'),
          initialTheme ?? safeInvoke('get-current-theme')
        ]);
      }

      // StrictMode cleanup 후 실행되는 비동기 결과 무시
      if (cancelled) return;

      // 기본 상태 설정 (부분 실패해도 가능한 만큼 적용)
      store.setState({
        ...(initialState && {
          programStatus: initialState.programStatus,
          isOverlayVisible: initialState.isOverlayVisible,
        }),
        viewMode: savedSettings?.viewMode || DEFAULT_VIEW_MODE,
        ...(initialTheme && { theme: initialTheme }),
        pluginServer: savedSettings?.pluginServer ?? false,
        pluginConnected: (savedSettings?.pluginServer && savedSettings?.pluginConnected) ?? false,
        pluginModeActive: savedSettings?.pluginModeActive ?? false
      });

      // 테마 계산 및 로고 로드
      if (initialTheme) {
        themeCalc(initialTheme.accentColor);
      }
      loadLogo();

      // 스타일 액션 매핑 로드
      try {
        const [styleActions, psActionList, slotOrder] = await Promise.all([
          ipcRenderer.invoke('load-style-actions'),
          ipcRenderer.invoke('get-ps-action-list'),
          ipcRenderer.invoke('load-slot-order')
        ]);
        store.setState({
          styleActions: styleActions || {},
          psActionList: Array.isArray(psActionList) ? psActionList : [],
          slotOrder: Array.isArray(slotOrder) ? slotOrder : null
        });
      } catch { /* ignore */ }

      // 렌더러 준비 완료 알림 — 파일 연결로 실행된 경우 이 시점에 파일이 열림
      ipcRenderer.invoke('renderer-ready').catch(() => {});
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
      store.setState({ viewMode: newViewMode });
    };

    const handleClearSearch = () => {
      if (searchRef?.current) {
        searchRef.current.clearSearch();
      }
    };

    const handleLoadFile = async () => {
      // trigger-load-file → Ctrl+O 파일 열기
      const { programStatus, isEditorSaved } = store.getState();
      if (programStatus === 'edit' && !isEditorSaved) {
        const saveChoice = await ipcRenderer.invoke('show-dialog', 'UNSAVED_CHANGES');
        if (saveChoice === 1) return;
      }
      const result = await ipcRenderer.invoke('open-file', { source: 'dialog' });
      if (result?.success) {
        store.setState({ isSidebarVisible: false });
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

    const handlePhotoshopModeChanged = (_, active) => {
      store.setState({ pluginModeActive: active });
    };

    const handlePsActionList = (_, list) => {
      store.setState({ psActionList: Array.isArray(list) ? list : [] });
    };

    const handleStyleActionsUpdated = (_, mapping) => {
      store.setState({ styleActions: mapping || {} });
    };

    const handleSlotOrderUpdated = (_, order) => {
      store.setState({ slotOrder: Array.isArray(order) ? order : null });
    };

    const handleParaImageMissing = () => {
      store.getState().setToastMessage('이미지가 모두 로드되지 않았습니다');
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
    ipcRenderer.on('photoshop-mode-changed', handlePhotoshopModeChanged);
    ipcRenderer.on('ps-action-list', handlePsActionList);
    ipcRenderer.on('style-actions-updated', handleStyleActionsUpdated);
    ipcRenderer.on('slot-order-updated', handleSlotOrderUpdated);
    ipcRenderer.on('para-image-missing', handleParaImageMissing);

    // 초기화
    initializeState();

    // 클린업
    return () => {
      cancelled = true;
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
      ipcRenderer.removeListener('photoshop-mode-changed', handlePhotoshopModeChanged);
      ipcRenderer.removeListener('ps-action-list', handlePsActionList);
      ipcRenderer.removeListener('style-actions-updated', handleStyleActionsUpdated);
      ipcRenderer.removeListener('slot-order-updated', handleSlotOrderUpdated);
      ipcRenderer.removeListener('para-image-missing', handleParaImageMissing);
      // StrictMode 재마운트 시 재초기화 허용을 위해 플래그 리셋
      initialized.current = false;
    };
  }, [themeCalc, searchRef]);
}
