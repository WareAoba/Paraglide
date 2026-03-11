// src/stores/useAppStore.js — 앱 핵심 상태 (Zustand)
import { create } from 'zustand';

const ProgramStatus = {
  READY: 'Ready',
  PROCESS: 'Process',
  PAUSE: 'Pause',
  LOADING: 'Loading',
  EDIT: 'Edit'
};

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

  // ─── 테마 상태 ───
  theme: {
    mode: null,
    accentColor: '#007bff',
  },

  // ─── 상수 ───
  ProgramStatus,

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

    return {
      ...prev,
      ...updatedState,
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
    if (s.programStatus !== ProgramStatus.PROCESS) return s;

    const newSearchState = visible;

    if (newSearchState === s.isSearchVisible) {
      // 이미 원하는 상태면 닫기
      if (s.isSearchVisible) {
        return {
          isSearchVisible: false,
          isSidebarVisible: s.wasInitiallySidebarOpen ? s.isSidebarVisible : false
        };
      }
      return s;
    }

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
    if (s.programStatus !== ProgramStatus.PROCESS) return;

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

  // 복합 상태 업데이트
  updateAfterFileLoad: (newState) => set((prev) => ({
    ...prev,
    ...newState,
    isSidebarVisible: false
  })),

  resetToReady: () => set({
    paragraphs: [],
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
