// src/stores/useAppStore.js — 앱 핵심 상태 (Zustand)
import { create } from 'zustand';
import {
  ProgramStatus,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_VIEW_MODE,
} from '../constants';

const useAppStore = create((set, get) => ({
  // ─── 프로그램 상태 ───
  programStatus: ProgramStatus.READY,
  paragraphs: [],
  paragraphsMetadata: [],
  currentParagraph: 0,
  currentNumber: null,
  currentFilePath: null,
  isPaused: false,
  isOverlayVisible: false,
  viewMode: null,

  // ─── UI 상태 ───
  logoPath: null,
  titlePath: null,
  isSidebarVisible: false,
  wasInitiallySidebarOpen: false,
  isSettingsVisible: false,
  isSearchVisible: false,
  isDragging: false,
  dragCounter: 0,
  hoveredSection: null,
  isEditorSaved: true,

  // ─── 플러그인 상태 ───
  pluginServer: false,
  pluginConnected: false,
  pluginModeActive: false,
  psActionList: [],    // PS 액션 세트/액션 목록
  styleActions: {},    // 스타일명→PS액션 매핑 { "plain": { set, action }, ... }
  slotOrder: null,     // 슬롯 순서 (null이면 기본 STYLE_NAMES 사용)
  pendingImagePaths: null, // 에디터 마운트 시 로드할 이미지 경로

  // ─── 알림 상태 ───
  toastMessage: null,
  toastVisible: false,

  // ─── 윈도우 상태 ───
  isMaximized: false,

  // ─── 최근 파일 목록 ───
  recentFiles: [],

  // ─── 테마 상태 ───
  theme: {
    mode: null,
    accentColor: DEFAULT_ACCENT_COLOR,
  },

  // ─── 오버레이 전용 상태 (별도 윈도우에서 사용) ───
  overlayContent: {
    previous: [],
    current: null,
    next: [],
    currentNumber: null,
    currentParagraph: null,
    currentMetadata: null,
    _animDirection: '',
    _animKey: 0,
  },

  // ─── Main Process → Renderer 상태 동기화 ───
  syncFromMain: (updatedState) => set((prev) => {
    const pageInfo = updatedState.paragraphsMetadata?.[updatedState.currentParagraph]?.pageInfo;
    const display = pageInfo ? {
      text: pageInfo.end !== pageInfo.start
        ? `${pageInfo.start}-${pageInfo.end}`
        : `${pageInfo.start}`,
      isRange: pageInfo.end !== pageInfo.start
    } : null;

    // theme가 객체가 아닌 경우(문자열 등) 무시하여 덮어쓰기 방지
    const safeTheme = (updatedState.theme && typeof updatedState.theme === 'object' && updatedState.theme.mode)
      ? updatedState.theme
      : prev.theme;

    // state-update는 텍스트 처리 상태 전용 — viewMode는 별도 채널(view-mode-update)로만 변경
    const { viewMode: _ignoredViewMode, ...safeState } = updatedState;

    return {
      ...prev,
      ...safeState,
      theme: safeTheme,
      currentNumber: { ...pageInfo, display }
    };
  }),

  // ─── 액션 ───
  setTheme: (theme) => set({ theme }),
  setLogoPaths: (logoPath, titlePath) => set({ logoPath, titlePath }),

  setSidebarVisible: (visible) => set({ isSidebarVisible: visible }),
  toggleSidebar: () => set((s) => {
    if (!s.isSidebarVisible && s.isSearchVisible) {
      return { isSidebarVisible: !s.isSidebarVisible, isSearchVisible: false };
    }
    return { isSidebarVisible: !s.isSidebarVisible };
  }),
  closeSidebar: () => set({
    isSidebarVisible: false,
    wasInitiallySidebarOpen: false,
    isSearchVisible: false
  }),

  setSettingsVisible: (visible) => set((s) => ({
    isSettingsVisible: visible,
    isSidebarVisible: visible ? false : s.isSidebarVisible
  })),
  toggleSettings: () => set((s) => ({
    isSettingsVisible: !s.isSettingsVisible,
    isSidebarVisible: false
  })),

  setSearchVisible: (visible, fromSidebar = false) => set((s) => {
    if (s.programStatus !== ProgramStatus.PROCESS && s.programStatus !== ProgramStatus.PAUSE) return s;

    const newSearchState = visible;

    // 이미 원하는 상태면 변경 없음
    if (newSearchState === s.isSearchVisible) return s;

    if (newSearchState) {
      return {
        isSearchVisible: true,
        isSidebarVisible: true,
        wasInitiallySidebarOpen: fromSidebar || s.isSidebarVisible
      };
    } else {
      return {
        isSearchVisible: false,
        isSidebarVisible: s.wasInitiallySidebarOpen ? s.isSidebarVisible : false,
        wasInitiallySidebarOpen: false
      };
    }
  }),

  toggleSearch: (forceValue = null, fromSidebar = false) => {
    const s = get();
    if (s.programStatus !== ProgramStatus.PROCESS && s.programStatus !== ProgramStatus.PAUSE) return;

    const newSearchState = forceValue === null ? !s.isSearchVisible : Boolean(forceValue);
    get().setSearchVisible(newSearchState, fromSidebar);
  },

  handleCloseEsc: () => set((s) => {
    if (s.isSearchVisible) {
      return {
        isSearchVisible: false,
        isSidebarVisible: s.wasInitiallySidebarOpen ? s.isSidebarVisible : false,
        wasInitiallySidebarOpen: false
      };
    }
    if (s.isSidebarVisible) {
      return { isSidebarVisible: false, wasInitiallySidebarOpen: false };
    }
    return { isSettingsVisible: false };
  }),

  setDragging: (isDragging) => set({ isDragging }),
  setDragCounter: (updater) => set((s) => {
    const newCount = typeof updater === 'function' ? updater(s.dragCounter) : updater;
    return { dragCounter: newCount, isDragging: newCount > 0 };
  }),

  setHoveredSection: (section) => set({ hoveredSection: section }),
  setEditorSaved: (saved) => set({ isEditorSaved: saved }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setOverlayVisible: (visible) => set({ isOverlayVisible: visible }),
  setPluginServer: (enabled) => set({ pluginServer: enabled }),
  setPluginConnected: (connected) => set({ pluginConnected: connected }),
  setPsActionList: (list) => set({ psActionList: list }),
  setStyleActions: (mapping) => set({ styleActions: mapping }),
  setSlotOrder: (order) => set({ slotOrder: order }),
  setPendingImagePaths: (paths) => set({ pendingImagePaths: paths }),
  setToastMessage: (msg) => set({ toastMessage: msg }),
  setToastVisible: (visible) => set({ toastVisible: visible }),
  setIsMaximized: (maximized) => set({ isMaximized: maximized }),
  setRecentFiles: (files) => set({ recentFiles: files }),

  // ─── 오버레이 콘텐츠 동기화 (paragraphs-updated IPC용) ───
  syncOverlayContent: (data) => set((prev) => {
    const oc = prev.overlayContent;
    const paragraphChanged =
      oc.currentParagraph !== null &&
      data.currentParagraph !== undefined &&
      data.currentParagraph !== null &&
      oc.currentParagraph !== data.currentParagraph;

    return {
      // 전역 상태 동기화
      isPaused: data.isPaused ?? prev.isPaused,
      pluginServer: data.pluginServer ?? prev.pluginServer,
      pluginModeActive: data.pluginModeActive ?? prev.pluginModeActive,
      theme: (data.theme && typeof data.theme === 'object' && data.theme.mode)
        ? data.theme : prev.theme,
      // 오버레이 전용 콘텐츠
      overlayContent: {
        previous: data.previous ?? oc.previous,
        current: data.current ?? oc.current,
        next: data.next ?? oc.next,
        currentNumber: data.currentNumber ?? oc.currentNumber,
        currentParagraph: data.currentParagraph ?? oc.currentParagraph,
        currentMetadata: data.currentMetadata ?? oc.currentMetadata,
        _animDirection: paragraphChanged
          ? (data.currentParagraph > oc.currentParagraph ? 'text-slide-up' : 'text-slide-down')
          : oc._animDirection,
        _animKey: paragraphChanged ? oc._animKey + 1 : oc._animKey,
      }
    };
  }),

  // 복합 상태 업데이트
  updateAfterFileLoad: (newState) => set((prev) => ({
    ...prev,
    ...newState,
    isSidebarVisible: false
  })),

  resetToReady: () => set({
    paragraphs: [],
    paragraphsMetadata: [],
    currentParagraph: 0,
    currentNumber: null,
    currentFilePath: null,
    isPaused: false,
    isOverlayVisible: false,
    programStatus: ProgramStatus.READY,
    isSearchVisible: false
  }),
}));

export default useAppStore;
export { ProgramStatus };
