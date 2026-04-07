// src/stores/useEditorStore.js — 텍스트 에디터 상태 (Zustand)
import { create } from 'zustand';

const useEditorStore = create((set) => ({
  // ─── 뷰어/에디터 레이아웃 ───
  viewerRatio: null,
  fontScale: 100,

  // ─── 패널 토글 ───
  macroOpen: false,
  styleOpen: false,
  metaPanelOpen: false,

  // ─── 메타데이터 이미지 ───
  metaImage: '',

  // ─── 이미지 뷰어 ───
  viewerImages: [],
  viewerPage: 0,
  cursorSync: true,
  spreadPairs: [],

  // ─── 블랙포인트 분석 ───
  blackPointInfo: null,
  blackPointAction: null,

  // ─── 정렬 인디케이터 ───
  alignIndicators: [],
  alignExpandHover: null,

  // ─── 에디터 문서 정보 (사이드바 Panel에서 사용) ───
  editorDocInfo: null,

  // ─── 자동화 설정 ───
  autoSettings: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('paraglide-automation-auto'));
      if (saved && typeof saved === 'object') return { metadata: false, numbering: false, spread: false, dpi: false, ...saved };
    } catch (_) { /* ignore */ }
    return { metadata: false, numbering: false, spread: false, dpi: false };
  })(),
  automationRunning: { metadata: false, numbering: false, spread: false, dpi: false },

  // ─── 텍스트 매크로 ───
  macroSlots: ['…', '―', '♡', '♥'],
  macroEditingIdx: -1,
  macroEditValue: '',

  // ─── 암호화 ───
  encryptionOpen: false,
  encryptionEnabled: false,
  encryptionPassword: '',

  // ─── 이미지 뷰어 세부 ───
  zoom: null,
  pageInput: '',
  isPageInputVisible: false,
  automationOpen: false,
  spreadDataUrl: null,
  psdBackgroundOnly: false,
  imageDataUrl: null,

  // ─── 액션 ───
  setViewerRatio: (ratio) => set({ viewerRatio: ratio }),
  setFontScale: (scale) => set({ fontScale: scale }),
  setMacroOpen: (open) => set({ macroOpen: open }),
  setStyleOpen: (open) => set({ styleOpen: open }),
  setMetaPanelOpen: (open) => set({ metaPanelOpen: open }),
  setMetaImage: (img) => set({ metaImage: img }),
  setViewerImages: (images) => set({ viewerImages: images }),
  setViewerPage: (page) => set({ viewerPage: page }),
  setCursorSync: (sync) => set({ cursorSync: sync }),
  setSpreadPairs: (pairs) => set({ spreadPairs: pairs }),
  setBlackPointInfo: (info) => set({ blackPointInfo: info }),
  setBlackPointAction: (action) => set({ blackPointAction: action }),
  setAlignIndicators: (indicators) => set({ alignIndicators: indicators }),
  setAlignExpandHover: (hover) => set({ alignExpandHover: hover }),
  setEditorDocInfo: (info) => set({ editorDocInfo: info }),

  // ─── 자동화 액션 ───
  setAutoSettings: (settings) => {
    set({ autoSettings: settings });
    localStorage.setItem('paraglide-automation-auto', JSON.stringify(settings));
  },
  toggleAutoSetting: (key) => set((s) => {
    const newSettings = { ...s.autoSettings, [key]: !s.autoSettings[key] };
    localStorage.setItem('paraglide-automation-auto', JSON.stringify(newSettings));
    return { autoSettings: newSettings };
  }),
  setAutomationRunning: (updater) => set((s) => ({
    automationRunning: typeof updater === 'function' ? updater(s.automationRunning) : updater,
  })),

  // ─── 텍스트 매크로 액션 ───
  setMacroSlots: (slots) => set({ macroSlots: slots }),
  setMacroEditingIdx: (idx) => set({ macroEditingIdx: idx }),
  setMacroEditValue: (val) => set({ macroEditValue: val }),

  // ─── 이미지 뷰어 액션 ───
  setEncryptionOpen: (open) => set({ encryptionOpen: open }),
  setEncryptionEnabled: (enabled) => set({ encryptionEnabled: enabled }),
  setEncryptionPassword: (pw) => set({ encryptionPassword: pw }),

  setZoom: (zoom) => set({ zoom }),
  setPageInput: (input) => set({ pageInput: input }),
  setIsPageInputVisible: (visible) => set({ isPageInputVisible: visible }),
  setAutomationOpen: (open) => set({ automationOpen: open }),
  setSpreadDataUrl: (url) => set({ spreadDataUrl: url }),
  setPsdBackgroundOnly: (val) => set({ psdBackgroundOnly: val }),
  setImageDataUrl: (url) => set({ imageDataUrl: url }),

  // ─── 에디터 리셋 ───
  resetEditor: () => set({
    viewerRatio: null,
    fontScale: 100,
    macroOpen: false,
    styleOpen: false,
    metaPanelOpen: false,
    metaImage: '',
    viewerImages: [],
    viewerPage: 0,
    cursorSync: true,
    spreadPairs: [],
    blackPointInfo: null,
    blackPointAction: null,
    alignIndicators: [],
    alignExpandHover: null,
    editorDocInfo: null,
    macroSlots: ['…', '―', '♡', '♥'],
    macroEditingIdx: -1,
    macroEditValue: '',
    encryptionOpen: false,
    encryptionEnabled: false,
    encryptionPassword: '',
    zoom: null,
    pageInput: '',
    isPageInputVisible: false,
    automationOpen: false,
    spreadDataUrl: null,
    psdBackgroundOnly: false,
    imageDataUrl: null,
  }),
}));

export default useEditorStore;
