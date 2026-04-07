import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import TextMacro from '../TextMacro';
import TextStyleSlots from '../TextStyleSlots';
import EncryptionPanel from '../EncryptionPanel';
import ImageViewer from '../ImageViewer';
import useAppStore from '../../../stores/useAppStore';
import useIconStore from '../../../stores/useIconStore';
import useEditorStore from '../../../stores/useEditorStore';
import EditorToolbar from './EditorToolbar';
import AlignIndicatorOverlay from './AlignIndicatorOverlay';
import MetadataPanel from './MetadataPanel';
import useImageActions from './useImageActions';
import '../../../CSS/Views/Editor.css';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');
const fs = window.require('fs');
const _appBase = process.env.NODE_ENV === 'development'
  ? process.cwd()
  : path.join(process.resourcesPath, 'app.asar');
const { TextProcessUtils } = window.require(
  path.join(_appBase, 'src', 'utils', 'TextProcessUtils')
);
const { ParaFileFormat, STYLE_NAMES } = window.require(
  path.join(_appBase, 'src', 'utils', 'ParaFileFormat')
);

const FONT_SCALE_OPTIONS = [10, 15, 20, 25, 35, 50, 65, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.psd'];
const MIME_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.psd': 'image/vnd.adobe.photoshop' };

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function TextEditor() {
  const { t } = useTranslation();

  // ─── Zustand 스토어에서 상태 구독 ───
  const theme = useAppStore((s) => s.theme);
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const setEditorSaved = useAppStore((s) => s.setEditorSaved);
  const icons = useIconStore((s) => s.icons);
  const pluginServer = useAppStore((s) => s.pluginServer);

  // ─── 에디터 스토어 ───
  const viewerRatio = useEditorStore((s) => s.viewerRatio);
  const setViewerRatio = useEditorStore((s) => s.setViewerRatio);
  const fontScale = useEditorStore((s) => s.fontScale);
  const setFontScale = useEditorStore((s) => s.setFontScale);
  const macroOpen = useEditorStore((s) => s.macroOpen);
  const setMacroOpen = useEditorStore((s) => s.setMacroOpen);
  const styleOpen = useEditorStore((s) => s.styleOpen);
  const setStyleOpen = useEditorStore((s) => s.setStyleOpen);
  const metaPanelOpen = useEditorStore((s) => s.metaPanelOpen);
  const setMetaPanelOpen = useEditorStore((s) => s.setMetaPanelOpen);
  const encryptionOpen = useEditorStore((s) => s.encryptionOpen);
  const setEncryptionOpen = useEditorStore((s) => s.setEncryptionOpen);
  const encryptionEnabled = useEditorStore((s) => s.encryptionEnabled);
  const setEncryptionEnabled = useEditorStore((s) => s.setEncryptionEnabled);
  const encryptionPassword = useEditorStore((s) => s.encryptionPassword);
  const setEncryptionPassword = useEditorStore((s) => s.setEncryptionPassword);
  const metaImage = useEditorStore((s) => s.metaImage);
  const setMetaImage = useEditorStore((s) => s.setMetaImage);
  const viewerImages = useEditorStore((s) => s.viewerImages);
  const setViewerImages = useEditorStore((s) => s.setViewerImages);
  const viewerPage = useEditorStore((s) => s.viewerPage);
  const setViewerPage = useEditorStore((s) => s.setViewerPage);
  const cursorSync = useEditorStore((s) => s.cursorSync);
  const setCursorSync = useEditorStore((s) => s.setCursorSync);
  const spreadPairs = useEditorStore((s) => s.spreadPairs);
  const setSpreadPairs = useEditorStore((s) => s.setSpreadPairs);
  const blackPointInfo = useEditorStore((s) => s.blackPointInfo);
  const setBlackPointInfo = useEditorStore((s) => s.setBlackPointInfo);
  const blackPointAction = useEditorStore((s) => s.blackPointAction);
  const setBlackPointAction = useEditorStore((s) => s.setBlackPointAction);
  const alignIndicators = useEditorStore((s) => s.alignIndicators);
  const setAlignIndicators = useEditorStore((s) => s.setAlignIndicators);
  const alignExpandHover = useEditorStore((s) => s.alignExpandHover);
  const setAlignExpandHover = useEditorStore((s) => s.setAlignExpandHover);

  const editorRef = useRef(null);
  const scrollTrackRef = useRef(null);
  const scrollThumbRef = useRef(null);
  const scrollHideTimer = useRef(null);

  const isLoadingRef = useRef(false);
  const initialContentRef = useRef('');
  const isSavedRef = useRef(true);

  const resizingRef = useRef(false);
  const rafRef = useRef(null);
  const macroButtonRef = useRef(null);
  const macroSlotsRef = useRef(['…', '―', '♡', '♥']);
  const styleButtonRef = useRef(null);
  const metaButtonRef = useRef(null);
  const encryptionButtonRef = useRef(null);

  const viewerImagesRef = useRef([]);
  const lastSyncedPageRef = useRef(0);
  const spreadPairsRef = useRef([]);
  useEffect(() => { spreadPairsRef.current = spreadPairs; }, [spreadPairs]);

  // ─── .para 메타데이터 로컬 관리 ───
  const paraMetadataRef = useRef(null);

  // viewerImagesRef를 최신 상태와 동기화
  useEffect(() => { viewerImagesRef.current = viewerImages; }, [viewerImages]);

  // ─── 자동화 패널 상태 ───
  const autoSettings = useEditorStore((s) => s.autoSettings);
  const automationAutoRef = useRef(autoSettings);
  useEffect(() => { automationAutoRef.current = autoSettings; }, [autoSettings]);
  const handleAutomationAutoChange = useCallback((settings) => {
    useEditorStore.getState().setAutoSettings(settings);
  }, []);

  // ─── 정렬 인디케이터 ───
  const alignOverlayRef = useRef(null);
  const alignExpandTimerRef = useRef(null);

  const onSavedStateChange = setEditorSaved;

  // ─── 에디터 DOM에서 plain text 추출 ───
  const getPlainText = useCallback(() => {
    const el = editorRef.current;
    if (!el || el.childNodes.length === 0) return '';

    const lines = [];
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        lines.push(child.textContent);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          lines.push('');
        } else {
          const isBrOnly = child.childNodes.length === 1 && child.firstChild.nodeName === 'BR';
          lines.push(isBrOnly ? '' : child.textContent);
        }
      }
    }
    return lines.join('\n').replace(/\u00A0/g, ' ');
  }, []);

  // ─── plain text → 에디터 DOM ───
  const setEditorContent = useCallback((text) => {
    const el = editorRef.current;
    if (!el) return;
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = text.split('\n')
      .map(line => line ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>')
      .join('');
  }, []);

  // ─── bare text 노드 → div 래핑 (초기 입력 시 발생하는 문제 수정) ───
  const normalizeNodes = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const sel = window.getSelection();
    const focusNode = sel.rangeCount > 0 ? sel.focusNode : null;
    const focusOffset = sel.rangeCount > 0 ? sel.focusOffset : 0;

    for (const child of [...el.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent) {
        const div = document.createElement('div');
        div.textContent = child.textContent;
        el.replaceChild(div, child);
        if (focusNode === child) {
          try {
            const range = document.createRange();
            range.setStart(div.firstChild, Math.min(focusOffset, div.firstChild.length));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (_) {}
        }
      }
    }
  }, []);

  // ─── 공백줄 정규화: 연속 공백 제거, 페이지 번호 전후 공백 보장 ───
  const normalizeBlankLines = useCallback(() => {
    const el = editorRef.current;
    if (!el || el.children.length === 0) return;

    // 1단계: 연속 공백줄 → 1개로 축소
    let i = 0;
    while (i < el.children.length) {
      if (!el.children[i].textContent.trim()) {
        while (i + 1 < el.children.length && !el.children[i + 1].textContent.trim()) {
          el.removeChild(el.children[i + 1]);
        }
      }
      i++;
    }

    // 2단계: 맨 앞 공백 제거
    while (el.children.length > 0 && !el.children[0].textContent.trim()) {
      el.removeChild(el.children[0]);
    }

    // 3단계: 맨 뒤 공백 제거
    while (el.children.length > 0 && !el.children[el.children.length - 1].textContent.trim()) {
      el.removeChild(el.children[el.children.length - 1]);
    }

    // 4단계: 페이지 번호 전후에 공백줄 보장
    i = 0;
    while (i < el.children.length) {
      const trimmed = el.children[i].textContent.trim();
      const isPage = trimmed && !TextProcessUtils.isCommentLine(trimmed) && !!TextProcessUtils.extractPageNumber(trimmed);
      if (isPage) {
        if (i > 0 && el.children[i - 1].textContent.trim()) {
          const blank = document.createElement('div');
          blank.innerHTML = '<br>';
          el.insertBefore(blank, el.children[i]);
          i++;
        }
        if (i + 1 < el.children.length && el.children[i + 1].textContent.trim()) {
          const blank = document.createElement('div');
          blank.innerHTML = '<br>';
          el.insertBefore(blank, el.children[i + 1]);
        }
      }
      i++;
    }

    // 5단계: 최종 후미 공백 정리
    while (el.children.length > 0 && !el.children[el.children.length - 1].textContent.trim()) {
      el.removeChild(el.children[el.children.length - 1]);
    }
  }, []);

  // ─── 빈 페이지 공백 확장: 내용 없는 페이지는 공백 3줄로 확장 (편집용) ───
  const expandEmptyPages = useCallback(() => {
    const el = editorRef.current;
    if (!el || el.children.length === 0) return;

    const divs = el.children;
    let i = 0;
    while (i < divs.length) {
      const trimmed = divs[i].textContent.trim();
      const isPage = trimmed && !TextProcessUtils.isCommentLine(trimmed) && !!TextProcessUtils.extractPageNumber(trimmed);
      if (!isPage) { i++; continue; }

      // 이 페이지 하위에 내용이 있는지 확인
      let hasContent = false;
      let blankCount = 0;
      for (let j = i + 1; j < divs.length; j++) {
        const t = divs[j].textContent.trim();
        const jp = t && !TextProcessUtils.isCommentLine(t) && !!TextProcessUtils.extractPageNumber(t);
        if (jp) break; // 다음 페이지
        if (t && !TextProcessUtils.isCommentLine(divs[j].textContent)) {
          hasContent = true;
          break;
        }
        if (!t) blankCount++;
      }

      if (!hasContent && blankCount < 3) {
        // 빈 페이지: 공백을 3줄로 확장
        while (i + 1 < divs.length && !divs[i + 1].textContent.trim()) {
          const next = divs[i + 1];
          if (next.textContent.trim()) break;
          el.removeChild(next);
        }
        const insertBefore = divs[i + 1] || null;
        for (let b = 0; b < 3; b++) {
          const blank = document.createElement('div');
          blank.innerHTML = '<br>';
          if (insertBefore) {
            el.insertBefore(blank, insertBefore);
          } else {
            el.appendChild(blank);
          }
        }
      }
      i++;
    }
  }, []);

  // ─── 정렬 인디케이터 위치 업데이트 ───
  const updateAlignIndicators = useCallback(() => {
    const el = editorRef.current;
    if (!el) { setAlignIndicators([]); return; }

    const editorRect = el.getBoundingClientRect();
    const indicators = [];

    const divs = el.children;
    let paragraphIdx = 0;
    let inParagraph = false;
    let firstDivOfParagraph = null;

    for (let i = 0; i < divs.length; i++) {
      const div = divs[i];
      const hasParagraphAttr = div.hasAttribute('data-paragraph');

      if (hasParagraphAttr) {
        const idx = parseInt(div.getAttribute('data-paragraph'), 10);
        if (idx !== paragraphIdx && inParagraph) {
          if (firstDivOfParagraph) {
            const rect = firstDivOfParagraph.getBoundingClientRect();
            const align = ParaFileFormat.getParagraphAlign(paraMetadataRef.current, paragraphIdx);
            const explicitStyle = paraMetadataRef.current?.paragraphs?.[paragraphIdx]?.style || null;
            indicators.push({
              paragraphIdx: paragraphIdx,
              top: rect.top - editorRect.top,
              align,
              style: explicitStyle
            });
          }
          paragraphIdx = idx;
          firstDivOfParagraph = div;
        } else if (!inParagraph) {
          firstDivOfParagraph = div;
        }
        inParagraph = true;
      } else if (inParagraph) {
        if (firstDivOfParagraph) {
          const rect = firstDivOfParagraph.getBoundingClientRect();
          const align = ParaFileFormat.getParagraphAlign(paraMetadataRef.current, paragraphIdx);
          const explicitStyle = paraMetadataRef.current?.paragraphs?.[paragraphIdx]?.style || null;
          indicators.push({
            paragraphIdx: paragraphIdx,
            top: rect.top - editorRect.top,
            align,
            style: explicitStyle
          });
        }
        paragraphIdx++;
        inParagraph = false;
        firstDivOfParagraph = null;
      }
    }

    if (inParagraph && firstDivOfParagraph) {
      const rect = firstDivOfParagraph.getBoundingClientRect();
      const align = ParaFileFormat.getParagraphAlign(paraMetadataRef.current, paragraphIdx);
      const explicitStyle = paraMetadataRef.current?.paragraphs?.[paragraphIdx]?.style || null;
      indicators.push({
        paragraphIdx: paragraphIdx,
        top: rect.top - editorRect.top,
        align,
        style: explicitStyle
      });
    }

    setAlignIndicators(indicators);
  }, []);

  // ─── 시각적 데코레이션 (CSS 클래스만, 콘텐츠 변경 없음) ───
  const applyDecorations = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    normalizeNodes();

    const divs = el.children;
    let paragraphIdx = 0;
    let inParagraph = false;

    for (let i = 0; i < divs.length; i++) {
      const div = divs[i];
      const text = div.textContent;
      const trimmed = text.trim();
      const isEmpty = !trimmed;
      const isComment = !isEmpty && TextProcessUtils.isCommentLine(text);
      const isPage = !isEmpty && !isComment && !!TextProcessUtils.extractPageNumber(trimmed);

      div.classList.toggle('line-page-number', isPage);
      div.classList.toggle('line-empty', isEmpty);
      div.classList.toggle('line-comment', isComment);

      if (isPage || isEmpty) {
        div.classList.remove('line-paragraph-first');
        div.removeAttribute('data-paragraph');
        div.removeAttribute('data-paragraph-number');
        div.removeAttribute('data-align');
        div.removeAttribute('data-style');
        if (inParagraph) { paragraphIdx++; inParagraph = false; }
      } else {
        const isFirst = !inParagraph;
        div.classList.toggle('line-paragraph-first', isFirst);
        div.setAttribute('data-paragraph', paragraphIdx);
        if (isFirst) {
          div.setAttribute('data-paragraph-number', paragraphIdx + 1);
          const align = ParaFileFormat.getParagraphAlign(paraMetadataRef.current, paragraphIdx);
          const style = ParaFileFormat.getParagraphStyle(paraMetadataRef.current, paragraphIdx);
          div.setAttribute('data-align', align);
          div.setAttribute('data-style', style);
        } else {
          div.removeAttribute('data-paragraph-number');
          div.removeAttribute('data-align');
          div.removeAttribute('data-style');
        }
        inParagraph = true;
      }
    }

    // 페이지 번호 하위에 단락 입력이 전혀 없는 경우 빈 페이지로 표시
    for (let i = 0; i < divs.length; i++) {
      const div = divs[i];
      if (!div.classList.contains('line-page-number')) continue;

      let hasContent = false;
      for (let j = i + 1; j < divs.length; j++) {
        const next = divs[j];
        if (next.classList.contains('line-page-number')) break;
        if (next.textContent.trim() && !next.classList.contains('line-comment')) {
          hasContent = true;
          break;
        }
      }
      div.classList.toggle('line-page-empty', !hasContent);
    }

    el.classList.toggle('is-empty', !el.textContent.trim());

    // ── 에디터 텍스트에서 합페 쌍 자동 도출 ──
    const derivedSpreads = [];
    for (let i = 0; i < divs.length; i++) {
      if (!divs[i].classList.contains('line-page-number')) continue;
      const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
      if (info && info.start !== info.end) {
        derivedSpreads.push({ pageA: info.start, pageB: info.end, confidence: 1 });
      }
    }
    const prevKey = spreadPairsRef.current.map(s => `${s.pageA}-${s.pageB}`).join(',');
    const newKey = derivedSpreads.map(s => `${s.pageA}-${s.pageB}`).join(',');
    if (prevKey !== newKey) {
      setSpreadPairs(derivedSpreads);
    }

    updateAlignIndicators();
  }, [normalizeNodes, updateAlignIndicators]);

  const scheduleDecorations = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(applyDecorations);
  }, [applyDecorations]);

  // ─── 커서 위치의 단락 인덱스 감지 ───
  const getParagraphAtCursor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return -1;
    const sel = window.getSelection();
    if (!sel.rangeCount) return -1;
    let node = sel.focusNode;
    while (node && node !== el && node.parentNode !== el) {
      node = node.parentNode;
    }
    if (!node || node === el) return -1;
    const paraAttr = node.getAttribute?.('data-paragraph');
    if (paraAttr != null) return parseInt(paraAttr, 10);
    return -1;
  }, []);

  // ─── 단락 정렬 변경 ───
  const setParagraphAlign = useCallback((paragraphIndex, align) => {
    if (paragraphIndex < 0) return;
    if (!paraMetadataRef.current) {
      paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
    }
    if (!paraMetadataRef.current.paragraphs[paragraphIndex]) {
      paraMetadataRef.current.paragraphs[paragraphIndex] = { align: 'center' };
    }
    paraMetadataRef.current.paragraphs[paragraphIndex].align = align;
    ipcRenderer.invoke('set-paragraph-meta', { paragraphIndex, key: 'align', value: align });
    applyDecorations();
    if (isSavedRef.current) {
      isSavedRef.current = false;
      onSavedStateChange(false);
      ipcRenderer.send('update-editor-state', {
        saved: false,
        filePath: currentFilePath,
        isEditing: true
      });
    }
  }, [applyDecorations, currentFilePath, onSavedStateChange]);

  // ─── 단락 스타일 변경 ───
  const setParagraphStyle = useCallback((paragraphIndex, styleName) => {
    if (paragraphIndex < 0) return;
    if (!paraMetadataRef.current) {
      paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
    }
    if (!paraMetadataRef.current.paragraphs[paragraphIndex]) {
      paraMetadataRef.current.paragraphs[paragraphIndex] = { align: 'center' };
    }
    paraMetadataRef.current.paragraphs[paragraphIndex].style = styleName;
    ipcRenderer.invoke('set-paragraph-meta', { paragraphIndex, key: 'style', value: styleName });
    applyDecorations();
    if (isSavedRef.current) {
      isSavedRef.current = false;
      onSavedStateChange(false);
      ipcRenderer.send('update-editor-state', {
        saved: false,
        filePath: currentFilePath,
        isEditing: true
      });
    }
  }, [applyDecorations, currentFilePath, onSavedStateChange]);

  // ─── 정렬 인디케이터 클릭 핸들러 ───
  const handleAlignClick = useCallback((paragraphIdx, align) => {
    setParagraphAlign(paragraphIdx, align);
    editorRef.current?.focus();
  }, [setParagraphAlign]);

  // ─── 텍스트 스타일 선택 핸들러 (현재 커서 단락에 적용) ───
  const handleStyleSelect = useCallback((styleName) => {
    const currentActions = useAppStore.getState().styleActions;
    if (!currentActions[styleName]) return; // 액션 미지정 스타일 차단
    const paraIdx = getParagraphAtCursor();
    if (paraIdx >= 0) {
      setParagraphStyle(paraIdx, styleName);
    }
    setStyleOpen(false);
    editorRef.current?.focus();
  }, [getParagraphAtCursor, setParagraphStyle]);

  // ─── 에디터 DOM에서 현재 커서 위치의 페이지 번호 감지 ───
  const getPageAtCursor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return null;

    const sel = window.getSelection();
    if (!sel.rangeCount) return null;

    let node = sel.focusNode;
    while (node && node !== el && node.parentNode !== el) {
      node = node.parentNode;
    }
    if (!node || node === el) return null;

    let sibling = node;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.classList.contains('line-page-number')) {
        const pageInfo = TextProcessUtils.extractPageNumber(sibling.textContent.trim());
        if (pageInfo) return pageInfo.start;
      }
      sibling = sibling.previousSibling;
    }
    return null;
  }, []);

  // ─── 커서 위치에 따라 이미지 뷰어 페이지 자동 동기화 ───
  const syncViewerFromCursor = useCallback(() => {
    if (!cursorSync) return;
    if (viewerImages.length === 0) return;
    const page = getPageAtCursor();
    if (page != null && page !== lastSyncedPageRef.current) {
      lastSyncedPageRef.current = page;
      setViewerPage(page);
    }
  }, [cursorSync, viewerImages, getPageAtCursor]);

  // ─── 에디터에서 특정 페이지 번호 라인으로 커서 이동 ───
  const scrollEditorToPage = useCallback((page) => {
    const el = editorRef.current;
    if (!el) return;
    const divs = el.children;
    for (let i = 0; i < divs.length; i++) {
      if (!divs[i].classList.contains('line-page-number')) continue;
      const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
      if (!info || info.start !== page) continue;

      let firstContentDiv = null;
      let blankLines = [];
      for (let j = i + 1; j < divs.length; j++) {
        if (divs[j].classList.contains('line-page-number')) break;
        const txt = divs[j].textContent.trim();
        if (!txt) {
          blankLines.push(divs[j]);
        } else if (!divs[j].classList.contains('line-comment')) {
          firstContentDiv = divs[j];
          break;
        }
      }

      const sel = window.getSelection();
      const range = document.createRange();

      if (firstContentDiv) {
        let lastLineOfParagraph = firstContentDiv;
        for (let j = Array.from(divs).indexOf(firstContentDiv) + 1; j < divs.length; j++) {
          if (divs[j].classList.contains('line-page-number')) break;
          const txt = divs[j].textContent.trim();
          if (!txt || divs[j].classList.contains('line-comment')) break;
          lastLineOfParagraph = divs[j];
        }
        const textNode = lastLineOfParagraph.firstChild;
        if (textNode) {
          const len = textNode.nodeType === Node.TEXT_NODE ? textNode.length : 0;
          range.setStart(textNode, len);
          range.collapse(true);
        } else {
          range.selectNodeContents(lastLineOfParagraph);
          range.collapse(false);
        }
      } else if (blankLines.length >= 2) {
        const midBlank = blankLines[1];
        range.selectNodeContents(midBlank);
        range.collapse(true);
      } else if (blankLines.length === 1) {
        range.selectNodeContents(blankLines[0]);
        range.collapse(true);
      } else {
        const nextDiv = divs[i + 1];
        if (nextDiv) {
          range.selectNodeContents(nextDiv);
          range.collapse(true);
        } else {
          continue;
        }
      }

      el.focus();
      sel.removeAllRanges();
      sel.addRange(range);

      // 레이아웃 반영 후 페이지 번호 라인을 에디터 상단 1/5 지점에 부드럽게 스크롤
      const pageDiv = divs[i];
      requestAnimationFrame(() => {
        const dest = pageDiv.offsetTop - el.clientHeight * 0.2;
        el.scrollTo({ top: Math.max(0, dest), behavior: 'smooth' });
      });
      return;
    }
  }, []);

  // ─── 에디터 페이지 블록 수집 유틸리티 ───
  const collectPageBlocks = useCallback(() => {
    const el = editorRef.current;
    if (!el) return { preamble: [], blocks: [] };

    const blocks = [];
    let currentBlock = null;
    const preamble = [];

    for (let i = 0; i < el.children.length; i++) {
      const div = el.children[i];
      const trimmed = div.textContent.trim();
      const isComment = trimmed ? TextProcessUtils.isCommentLine(trimmed) : false;
      const info = trimmed && !isComment ? TextProcessUtils.extractPageNumber(trimmed) : null;

      if (info) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { pageNum: info.start, nodes: [div] };
      } else if (currentBlock) {
        currentBlock.nodes.push(div);
      } else {
        preamble.push(div);
      }
    }
    if (currentBlock) blocks.push(currentBlock);

    return { preamble, blocks };
  }, []);

  // ─── 페이지 순서가 꼬여있으면 정렬 ───
  const sortEditorPagesIfNeeded = useCallback(() => {
    const el = editorRef.current;
    if (!el) return false;

    const { preamble, blocks } = collectPageBlocks();
    if (blocks.length <= 1) return false;

    let needsSort = false;
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].pageNum < blocks[i - 1].pageNum) {
        needsSort = true;
        break;
      }
    }
    if (!needsSort) return false;

    blocks.sort((a, b) => a.pageNum - b.pageNum);

    const fragment = document.createDocumentFragment();
    for (const node of preamble) fragment.appendChild(node);
    for (const block of blocks) {
      for (const node of block.nodes) fragment.appendChild(node);
    }
    el.innerHTML = '';
    el.appendChild(fragment);

    return true;
  }, [collectPageBlocks]);

  // ─── 페이지 번호를 올바른 위치에 삽입 ───
  const insertPageNumberSorted = useCallback((pageNum) => {
    const el = editorRef.current;
    if (!el) return;

    const { blocks } = collectPageBlocks();

    let insertBeforeNode = null;
    for (const block of blocks) {
      if (block.pageNum > pageNum) {
        insertBeforeNode = block.nodes[0];
        break;
      }
    }

    const pageDiv = document.createElement('div');
    pageDiv.textContent = String(pageNum);

    if (insertBeforeNode) {
      el.insertBefore(pageDiv, insertBeforeNode);
    } else {
      el.appendChild(pageDiv);
    }
  }, [collectPageBlocks]);

  // ─── Tab 키: 다음/이전 페이지로 이동 + 에디터에 페이지 번호 자동 삽입 ───
  const handleTabNavigation = useCallback((forward) => {
    const el = editorRef.current;
    if (!el) return false;

    const { blocks: existingBlocks } = collectPageBlocks();
    const hasImages = viewerImages.length > 0;

    // ─── 이미지 없이 에디터 기반 페이지 네비게이션 ───
    if (!hasImages) {
      if (existingBlocks.length === 0) {
        el.focus();
        const text = getPlainText().trim();
        if (!text) { el.innerHTML = ''; }
        const pageDiv = document.createElement('div');
        pageDiv.textContent = '1';
        el.appendChild(pageDiv);
        normalizeBlankLines();
        expandEmptyPages();
        scheduleDecorations();
        lastSyncedPageRef.current = 1;
        setTimeout(() => scrollEditorToPage(1), 50);
        return true;
      }
      const sortedBlocks = [...existingBlocks].sort((a, b) => a.pageNum - b.pageNum);
      const curPage = lastSyncedPageRef.current || sortedBlocks[sortedBlocks.length - 1].pageNum;
      const curBlockIdx = sortedBlocks.findIndex(b => b.pageNum === curPage);

      if (forward) {
        if (curBlockIdx >= 0 && curBlockIdx < sortedBlocks.length - 1) {
          // 다음 페이지가 이미 있으면 이동만
          const nextPage = sortedBlocks[curBlockIdx + 1].pageNum;
          lastSyncedPageRef.current = nextPage;
          scrollEditorToPage(nextPage);
        } else {
          // 마지막 페이지거나 못 찾으면 새 페이지 생성
          const maxPage = sortedBlocks[sortedBlocks.length - 1].pageNum;
          const targetPage = maxPage + 1;
          insertPageNumberSorted(targetPage);
          normalizeBlankLines();
          expandEmptyPages();
          scheduleDecorations();
          lastSyncedPageRef.current = targetPage;
          setTimeout(() => scrollEditorToPage(targetPage), 50);
        }
      } else {
        if (curBlockIdx > 0) {
          const prevPage = sortedBlocks[curBlockIdx - 1].pageNum;
          lastSyncedPageRef.current = prevPage;
          scrollEditorToPage(prevPage);
        } else {
          return false;
        }
      }
      return true;
    }

    // ─── 이미지 기반 페이지 네비게이션 ───
    const consumed = new Set(spreadPairs.map(s => s.pageB));
    const sortedPages = viewerImages.map(img => img.page).sort((a, b) => a - b);
    const curPage = lastSyncedPageRef.current || viewerPage;

    if (existingBlocks.length === 0) {
      el.focus();
      const text = getPlainText().trim();
      if (!text) {
        el.innerHTML = '';
      }
      const pageDiv = document.createElement('div');
      pageDiv.textContent = String(curPage);
      el.appendChild(pageDiv);
      normalizeBlankLines();
      expandEmptyPages();
      scheduleDecorations();
      setTimeout(() => scrollEditorToPage(curPage), 50);
      return true;
    }

    const curIdx = sortedPages.indexOf(curPage);
    let targetPage;

    if (forward) {
      for (let i = curIdx + 1; i < sortedPages.length; i++) {
        if (!consumed.has(sortedPages[i])) {
          targetPage = sortedPages[i];
          break;
        }
      }
      if (targetPage == null) {
        if (curIdx === -1 && sortedPages.length > 0) {
          targetPage = sortedPages[0];
        } else {
          return false;
        }
      }
    } else {
      for (let i = curIdx - 1; i >= 0; i--) {
        if (!consumed.has(sortedPages[i])) {
          targetPage = sortedPages[i];
          break;
        }
      }
      if (targetPage == null) return false;
    }

    setViewerPage(targetPage);
    lastSyncedPageRef.current = targetPage;

    const targetExists = existingBlocks.some(b => b.pageNum === targetPage);

    if (targetExists) {
      const sorted = sortEditorPagesIfNeeded();
      if (sorted) {
        normalizeBlankLines();
        expandEmptyPages();
        scheduleDecorations();
      }
      scrollEditorToPage(targetPage);
    } else {
      sortEditorPagesIfNeeded();
      insertPageNumberSorted(targetPage);
      normalizeBlankLines();
      expandEmptyPages();
      scheduleDecorations();
      setTimeout(() => scrollEditorToPage(targetPage), 50);
    }

    return true;
  }, [viewerImages, viewerPage, scrollEditorToPage, scheduleDecorations, normalizeBlankLines, expandEmptyPages, spreadPairs, collectPageBlocks, sortEditorPagesIfNeeded, insertPageNumberSorted, getPlainText]);

  // ─── Tab 길게 눌러 합페 묶기/해체 토글 ───
  const mergeSpreadManual = useCallback(() => {
    if (viewerImages.length < 2) return;

    const sortedPages = viewerImages.map(img => img.page).sort((a, b) => a - b);
    const curPage = lastSyncedPageRef.current || viewerPage;

    const el = editorRef.current;
    let existingSpread = null;
    if (el) {
      for (const div of el.children) {
        if (!div.classList.contains('line-page-number')) continue;
        const info = TextProcessUtils.extractPageNumber(div.textContent.trim());
        if (info && info.start === curPage && info.start !== info.end) {
          existingSpread = { pageA: info.start, pageB: info.end };
          break;
        }
      }
    }
    if (existingSpread) {
      const { pageA, pageB } = existingSpread;
      const el = editorRef.current;
      if (el) {
        let spreadDiv = null;
        let spreadDivIdx = -1;
        const divs = el.children;
        for (let i = 0; i < divs.length; i++) {
          if (!divs[i].classList.contains('line-page-number')) continue;
          const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
          if (info && info.start === pageA && info.end === pageB) {
            spreadDiv = divs[i];
            spreadDivIdx = i;
            break;
          }
        }

        if (spreadDiv) {
          spreadDiv.textContent = String(pageA);

          let insertBeforeNode = null;
          for (let j = spreadDivIdx + 1; j < divs.length; j++) {
            if (divs[j].classList.contains('line-page-number')) {
              insertBeforeNode = divs[j];
              break;
            }
          }

          const pageBDiv = document.createElement('div');
          pageBDiv.textContent = String(pageB);

          const blanks = [];
          for (let b = 0; b < 3; b++) {
            const blank = document.createElement('div');
            blank.innerHTML = '<br>';
            blanks.push(blank);
          }

          if (insertBeforeNode) {
            el.insertBefore(pageBDiv, insertBeforeNode);
            for (const blank of blanks) {
              el.insertBefore(blank, insertBeforeNode);
            }
          } else {
            el.appendChild(pageBDiv);
            for (const blank of blanks) {
              el.appendChild(blank);
            }
          }

          applyDecorations();
        }
      }

      console.log(`합페 해체: ${pageA}-${pageB}`);
      return;
    }

    const curIdx = sortedPages.indexOf(curPage);
    if (curIdx < 0 || curIdx >= sortedPages.length - 1) return;

    const pageA = sortedPages[curIdx];
    const pageB = sortedPages[curIdx + 1];

    if (el) {
      for (const div of el.children) {
        if (!div.classList.contains('line-page-number')) continue;
        const info = TextProcessUtils.extractPageNumber(div.textContent.trim());
        if (!info || info.start === info.end) continue;
        if (info.start === pageA || info.end === pageA || info.start === pageB || info.end === pageB) return;
      }
    }

    if (el) {
      let divA = null, divAIdx = -1, divB = null, divBIdx = -1;
      const divs = el.children;
      for (let i = 0; i < divs.length; i++) {
        if (!divs[i].classList.contains('line-page-number')) continue;
        const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
        if (!info) continue;
        if (info.start === pageA && info.start === info.end) { divA = divs[i]; divAIdx = i; }
        if (info.start === pageB && info.start === info.end) { divB = divs[i]; divBIdx = i; }
      }

      if (divA) {
        divA.textContent = `${pageA}-${pageB}`;
      }

      if (divB && divBIdx > 0) {
        const contentNodes = [];
        for (let j = divBIdx + 1; j < divs.length; j++) {
          if (divs[j].classList.contains('line-page-number')) break;
          contentNodes.push(divs[j]);
        }

        while (divB.previousSibling && divB.previousSibling !== divA &&
               !divB.previousSibling.classList?.contains('line-page-number') &&
               !divB.previousSibling.textContent.trim()) {
          divB.previousSibling.remove();
        }

        const hasPageBContent = contentNodes.some(n => n.textContent.trim());
        if (hasPageBContent) {
          for (const node of contentNodes) {
            el.insertBefore(node, divB);
          }
        }

        divB.remove();
      }

      expandEmptyPages();
      applyDecorations();
    }

    console.log(`수동 합페 묶기: ${pageA}-${pageB}`);
  }, [viewerImages, viewerPage, applyDecorations, expandEmptyPages]);

  // ─── 입력 핸들러 ───
  const handleInput = useCallback(() => {
    if (isLoadingRef.current) return;

    const currentText = getPlainText();
    const changed = currentText !== initialContentRef.current;

    if (isSavedRef.current === changed) {
      isSavedRef.current = !changed;
      onSavedStateChange(!changed);
      ipcRenderer.send('update-editor-state', {
        saved: !changed,
        filePath: currentFilePath,
        isEditing: true
      });
    }

    scheduleDecorations();
    syncViewerFromCursor();
  }, [currentFilePath, getPlainText, onSavedStateChange, scheduleDecorations, syncViewerFromCursor]);

  // ─── 붙여넣기: plain text만 허용 ───
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // ─── 역본이 작성된 페이지 번호 추출 ───
  const getWrittenPages = useCallback((text) => {
    const lines = text.split('\n');
    const pages = new Set();
    let currentPages = null;
    let hasContent = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^\/\//.test(trimmed)) continue;
      if (/^[=\-]{3,}/.test(trimmed) || /^#/.test(trimmed)) continue;

      const pageInfo = TextProcessUtils.extractPageNumber(trimmed);
      if (pageInfo) {
        if (currentPages && hasContent) {
          currentPages.forEach(p => pages.add(p));
        }
        currentPages = [];
        for (let p = pageInfo.start; p <= (pageInfo.end || pageInfo.start); p++) {
          currentPages.push(p);
        }
        hasContent = false;
      } else if (currentPages) {
        hasContent = true;
      }
    }

    if (currentPages && hasContent) {
      currentPages.forEach(p => pages.add(p));
    }

    return pages;
  }, []);

  // ─── 블랙포인트 보정을 실제 이미지 파일에 적용 ───
  const applyBlackPointToFiles = useCallback(async (pages, blackPoint) => {
    const images = viewerImagesRef.current;
    if (!images || images.length === 0) return;

    const rMin = blackPoint.r, gMin = blackPoint.g, bMin = blackPoint.b;
    const rRange = (255 - rMin) || 1;
    const gRange = (255 - gMin) || 1;
    const bRange = (255 - bMin) || 1;
    const correctedPages = [];

    for (const img of images) {
      if (!pages.has(img.page)) continue;

      const ext = path.extname(img.filePath).toLowerCase();
      if (ext === '.psd') continue;

      try {
        const buffer = await fs.promises.readFile(img.filePath);
        const mime = MIME_TYPES[ext] || 'image/jpeg';
        const base64 = buffer.toString('base64');
        const dataUrl = `data:${mime};base64,${base64}`;

        const correctedDataUrl = await new Promise((resolve, reject) => {
          const image = new window.Image();
          image.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = image.width;
              canvas.height = image.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(image, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const d = imageData.data;
              for (let i = 0; i < d.length; i += 4) {
                d[i]     = Math.max(0, Math.min(255, Math.round((d[i] - rMin) * 255 / rRange)));
                d[i + 1] = Math.max(0, Math.min(255, Math.round((d[i + 1] - gMin) * 255 / gRange)));
                d[i + 2] = Math.max(0, Math.min(255, Math.round((d[i + 2] - bMin) * 255 / bRange)));
              }
              ctx.putImageData(imageData, 0, 0);
              const outputMime = (mime === 'image/jpeg' || mime === 'image/webp') ? mime : 'image/png';
              const quality = outputMime === 'image/jpeg' ? 0.95 : undefined;
              resolve(canvas.toDataURL(outputMime, quality));
            } catch (e) { reject(e); }
          };
          image.onerror = reject;
          image.src = dataUrl;
        });

        const base64Data = correctedDataUrl.split(',')[1];
        await fs.promises.writeFile(img.filePath, Buffer.from(base64Data, 'base64'));
        correctedPages.push(img.page);
      } catch (err) {
        console.error(`블랙포인트 보정 실패: ${img.filePath}`, err);
      }
    }

    if (paraMetadataRef.current && correctedPages.length > 0) {
      for (const page of correctedPages) {
        if (paraMetadataRef.current.pages instanceof Map) {
          if (paraMetadataRef.current.pages.has(page)) {
            paraMetadataRef.current.pages.get(page).blackpoint = '#000000';
          }
        }
        ipcRenderer.invoke('set-page-blackpoint', { pageNumber: page, blackpoint: '#000000' });
      }
    }

    if (correctedPages.length > 0) {
      const currentInfo = useEditorStore.getState().blackPointInfo;
      if (currentInfo?.perPage) {
        const newPerPage = new Map(currentInfo.perPage);
        for (const page of correctedPages) {
          if (newPerPage.has(page)) {
            const old = newPerPage.get(page);
            newPerPage.set(page, { ...old, blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' } });
          }
        }
        setBlackPointInfo({ ...currentInfo, perPage: newPerPage });
      }
    }

    return correctedPages.length;
  }, []);

  // ─── 저장 ───
  const handleSave = useCallback(async () => {
    try {
      normalizeBlankLines();
      applyDecorations();

      const content = getPlainText();
      
      const currentExt = currentFilePath ? path.extname(currentFilePath).toLowerCase() : '';
      const hasMetadata = !!paraMetadataRef.current;
      const { encryptionEnabled: _encEnabled, encryptionPassword: _encPw } = useEditorStore.getState();
      const encryptionActive = _encEnabled && _encPw.length >= 4;
      // 암호화 활성 시 .para 포맷 강제
      const isParaFile = encryptionActive || currentExt === '.para' || (currentExt === '' && hasMetadata);
      const format = isParaFile ? 'para' : 'txt';
      const defaultExt = isParaFile ? '.para' : '.txt';
      const fileName = currentFilePath 
        ? path.basename(currentFilePath) 
        : 'Untitled' + defaultExt;

      const { blackPointAction: bpAction, blackPointInfo: bpInfo } = useEditorStore.getState();
      let correctedCount = 0;
      if (bpAction === 'adjust-levels' && bpInfo && !bpInfo.isPureBlack) {
        const writtenPages = getWrittenPages(content);
        if (writtenPages.size > 0) {
          correctedCount = await applyBlackPointToFiles(writtenPages, bpInfo.blackPoint);
        }
      }

      const result = await ipcRenderer.invoke('save-text-file', {
        content,
        fileName,
        currentFilePath,
        saveType: currentFilePath ? 'overwrite' : 'new',
        format,
        metadata: isParaFile && paraMetadataRef.current ? {
          integral: paraMetadataRef.current.integral,
          pages: paraMetadataRef.current.pages instanceof Map
            ? Object.fromEntries(paraMetadataRef.current.pages)
            : (paraMetadataRef.current.pages || {}),
          paragraphs: paraMetadataRef.current.paragraphs || []
        } : (isParaFile ? undefined : undefined),
        password: encryptionActive ? _encPw : undefined
      });

      if (result.success) {
        isSavedRef.current = true;
        initialContentRef.current = content;
        onSavedStateChange(true);
        if (!currentFilePath && result.filePath) {
          ipcRenderer.send('update-current-file-path', result.filePath);
        }
        ipcRenderer.send('update-editor-state', {
          saved: true,
          filePath: result.filePath || currentFilePath
        });

        if (correctedCount > 0) {
          console.log(`블랙포인트 보정 완료: ${correctedCount}장`);
        }
      }

      expandEmptyPages();
      applyDecorations();
      return { success: result.success, filePath: result.filePath || currentFilePath };
    } catch (error) {
      console.error('저장 실패:', error);
      return { success: false };
    } finally {
      editorRef.current?.focus();
    }
  }, [currentFilePath, getPlainText, onSavedStateChange, normalizeBlankLines, expandEmptyPages, applyDecorations, getWrittenPages, applyBlackPointToFiles]);

  const handleFontScaleChange = useCallback((event) => {
    setFontScale(Number(event.target.value));
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const handleZoomIn = useCallback(() => {
    setFontScale(prev => {
      const idx = FONT_SCALE_OPTIONS.indexOf(prev);
      return idx < FONT_SCALE_OPTIONS.length - 1 ? FONT_SCALE_OPTIONS[idx + 1] : prev;
    });
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const handleZoomOut = useCallback(() => {
    setFontScale(prev => {
      const idx = FONT_SCALE_OPTIONS.indexOf(prev);
      return idx > 0 ? FONT_SCALE_OPTIONS[idx - 1] : prev;
    });
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  // ─── 매크로 슬롯 로드 ───
  useEffect(() => {
    const loadMacros = async () => {
      try {
        const saved = await ipcRenderer.invoke('load-text-macros');
        if (Array.isArray(saved) && saved.length > 0) {
          macroSlotsRef.current = saved.slice(0, 10);
        }
      } catch (_) { /* 기본값 사용 */ }
    };
    loadMacros();

    const handleMacroUpdate = (_, macros) => {
      if (Array.isArray(macros)) macroSlotsRef.current = macros;
    };
    ipcRenderer.on('text-macros-updated', handleMacroUpdate);
    return () => ipcRenderer.removeListener('text-macros-updated', handleMacroUpdate);
  }, []);

  // ─── 매크로 텍스트 삽입 ───
  const handleMacroInsert = useCallback((text) => {
    const el = editorRef.current;
    if (!el || !text) return;
    el.focus();
    document.execCommand('insertText', false, text);
  }, []);

  // ─── useImageActions 훅 ───
  const {
    analyzeBlackPoint,
    automationActions,
    loadImageFiles,
    closeImageViewer,
    removeCurrentImage,
    openImageFiles,
  } = useImageActions({
    editorRef,
    paraMetadataRef,
    viewerImagesRef,
    lastSyncedPageRef,
    isSavedRef,
    initialContentRef,
    automationAutoRef,
    applyDecorations,
    expandEmptyPages,
    normalizeBlankLines,
    getPlainText,
    scrollEditorToPage,
    onSavedStateChange,
    handleAutomationAutoChange,
  });

  // ─── Ctrl+S, Ctrl+숫자, Tab/Shift+Tab 단축키 ───
  const tabDownTimeRef = useRef(0);
  const tabLongPressTimerRef = useRef(null);
  const tabFiredRef = useRef(false);
  const TAB_LONG_PRESS_MS = 700;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.stopPropagation();
        e.preventDefault();
        handleSave();
        return;
      }

      if (e.key === 'Tab') {
        e.stopPropagation();
        e.preventDefault();
        if (e.shiftKey && !e.repeat) {
          handleTabNavigation(false);
          return;
        }
        if (!e.repeat && !e.shiftKey) {
          if (viewerImages.length > 0) {
            // 이미지 있을 때: 길게 누르면 합페 토글
            tabFiredRef.current = false;
            tabDownTimeRef.current = Date.now();
            tabLongPressTimerRef.current = setTimeout(() => {
              tabFiredRef.current = true;
              tabDownTimeRef.current = 0;
              mergeSpreadManual();
            }, TAB_LONG_PRESS_MS);
          } else {
            // 이미지 없을 때: 즉시 페이지 번호 삽입
            handleTabNavigation(true);
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const key = e.key;
        let slotIdx = -1;
        if (key >= '1' && key <= '9') {
          slotIdx = parseInt(key, 10) - 1;
        } else if (key === '0') {
          slotIdx = 9;
        }
        if (slotIdx >= 0 && slotIdx < macroSlotsRef.current.length) {
          const value = macroSlotsRef.current[slotIdx];
          if (value) {
            e.stopPropagation();
            e.preventDefault();
            handleMacroInsert(value);
          }
        }
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const alignMap = { ArrowLeft: 'left', ArrowUp: 'center', ArrowRight: 'right' };
        const align = alignMap[e.key];
        if (align) {
          e.stopPropagation();
          e.preventDefault();
          const paraIdx = getParagraphAtCursor();
          if (paraIdx >= 0) {
            setParagraphAlign(paraIdx, align);
          }
          return;
        }

        const key = e.key;
        let styleIdx = -1;
        if (key >= '1' && key <= '9') {
          styleIdx = parseInt(key, 10) - 1;
        } else if (key === '0') {
          styleIdx = 9;
        }
        const currentSlotOrder = useAppStore.getState().slotOrder;
        const effectiveSlots = Array.isArray(currentSlotOrder) && currentSlotOrder.length === 10 ? currentSlotOrder : STYLE_NAMES;
        if (styleIdx >= 0 && styleIdx < effectiveSlots.length) {
          const targetStyle = effectiveSlots[styleIdx];
          const currentActions = useAppStore.getState().styleActions;
          if (!currentActions[targetStyle]) return; // 액션 미지정 스타일 차단
          e.stopPropagation();
          e.preventDefault();
          const paraIdx = getParagraphAtCursor();
          if (paraIdx >= 0) {
            setParagraphStyle(paraIdx, targetStyle);
          }
          return;
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        if (tabLongPressTimerRef.current) {
          clearTimeout(tabLongPressTimerRef.current);
          tabLongPressTimerRef.current = null;
        }
        if (viewerImages.length > 0 && !tabFiredRef.current && tabDownTimeRef.current > 0) {
          handleTabNavigation(true);
        }
        tabDownTimeRef.current = 0;
        tabFiredRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      if (tabLongPressTimerRef.current) clearTimeout(tabLongPressTimerRef.current);
    };
  }, [handleSave, handleMacroInsert, viewerImages, handleTabNavigation, mergeSpreadManual, getParagraphAtCursor, setParagraphAlign, setParagraphStyle]);

  // ─── 에디터 정보 전송 헬퍼 ───
  const sendEditorInfo = useCallback(() => {
    const text = getPlainText();
    const lines = text.split('\n');
    const pageNumbers = lines
      .map(l => TextProcessUtils.extractPageNumber(l.trim()))
      .filter(Boolean)
      .map(p => p.start);

    ipcRenderer.send('get-editor-info', {
      type: 'response',
      data: {
        fileName: currentFilePath ? path.basename(currentFilePath) : '',
        filePath: currentFilePath || '',
        currentPage: getPageAtCursor() || 0,
        totalPages: pageNumbers.length > 0 ? Math.max(...pageNumbers) : 0,
        paragraphCount: lines.filter(l => l.trim()).length,
        isValid: pageNumbers.length > 0,
      }
    });
  }, [currentFilePath, getPlainText, getPageAtCursor]);

  // ─── 커서 이동 (클릭, 방향키) 시 뷰어 동기화 + 사이드바 페이지 정보 갱신 ───
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const handleSelChange = () => {
      syncViewerFromCursor();
      sendEditorInfo();
    };
    document.addEventListener('selectionchange', handleSelChange);
    return () => document.removeEventListener('selectionchange', handleSelChange);
  }, [syncViewerFromCursor, sendEditorInfo]);

  // ─── 스크롤 시 정렬 인디케이터 + 커스텀 스크롤바 ───
  useEffect(() => {
    const el = editorRef.current;
    const track = scrollTrackRef.current;
    const thumb = scrollThumbRef.current;
    if (!el || !track || !thumb) return;

    const updateThumb = () => {
      if (el.scrollHeight <= el.clientHeight) {
        thumb.style.display = 'none';
        return;
      }
      thumb.style.display = '';
      const ratio = el.clientHeight / el.scrollHeight;
      const thumbH = Math.max(24, ratio * el.clientHeight);
      const maxTop = el.clientHeight - thumbH;
      const scrollRatio = el.scrollTop / (el.scrollHeight - el.clientHeight);
      thumb.style.height = `${thumbH}px`;
      thumb.style.top = `${scrollRatio * maxTop}px`;
    };

    const showTrack = () => {
      track.classList.add('visible');
      clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => track.classList.remove('visible'), 1200);
    };

    const handleScroll = () => {
      updateAlignIndicators();
      updateThumb();
      showTrack();
    };

    let isDragging = false;
    let dragStartY = 0;
    let dragStartScrollTop = 0;

    const onThumbDown = (e) => {
      e.preventDefault();
      isDragging = true;
      dragStartY = e.clientY;
      dragStartScrollTop = el.scrollTop;
      thumb.classList.add('dragging');
      document.addEventListener('mousemove', onDocMove);
      document.addEventListener('mouseup', onDocUp);
    };
    const onDocMove = (e) => {
      if (!isDragging) return;
      const ratio = el.clientHeight / el.scrollHeight;
      const thumbH = Math.max(24, ratio * el.clientHeight);
      const maxTop = el.clientHeight - thumbH;
      const maxScroll = el.scrollHeight - el.clientHeight;
      const delta = e.clientY - dragStartY;
      el.scrollTop = dragStartScrollTop + (delta / maxTop) * maxScroll;
    };
    const onDocUp = () => {
      isDragging = false;
      thumb.classList.remove('dragging');
      document.removeEventListener('mousemove', onDocMove);
      document.removeEventListener('mouseup', onDocUp);
    };

    const onTrackClick = (e) => {
      if (e.target === thumb) return;
      const rect = track.getBoundingClientRect();
      const clickRatio = (e.clientY - rect.top) / rect.height;
      el.scrollTo({ top: clickRatio * (el.scrollHeight - el.clientHeight), behavior: 'smooth' });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    thumb.addEventListener('mousedown', onThumbDown);
    track.addEventListener('click', onTrackClick);
    updateThumb();

    return () => {
      el.removeEventListener('scroll', handleScroll);
      thumb.removeEventListener('mousedown', onThumbDown);
      track.removeEventListener('click', onTrackClick);
      document.removeEventListener('mousemove', onDocMove);
      document.removeEventListener('mouseup', onDocUp);
      clearTimeout(scrollHideTimer.current);
    };
  }, [updateAlignIndicators]);

  // ─── 이미지 뷰어에서 페이지 변경 시 에디터도 동기화 ───
  const handleViewerPageChange = useCallback((page) => {
    setViewerPage(page);
    lastSyncedPageRef.current = page;
    scrollEditorToPage(page);
  }, [scrollEditorToPage]);

  // ─── 이미지 레벨 조정 메모 ───
  const levelAdjustment = useMemo(() => {
    if (blackPointAction !== 'adjust-levels' || !blackPointInfo) return null;
    return { enabled: true, blackPoint: blackPointInfo.blackPoint };
  }, [blackPointAction, blackPointInfo]);

  // ─── 텍스트 파일 불러오기 ───
  const handleLoadFile = useCallback(async () => {
    const filePath = await ipcRenderer.invoke('show-open-file-dialog');
    if (filePath) {
      const { ProgramStatus } = useAppStore.getState();
      useAppStore.setState({
        currentFilePath: filePath,
        programStatus: ProgramStatus.EDIT,
      });
    }
  }, []);

  // ─── 에디터 드래그 드롭 ───
  const handleEditorDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleEditorDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find((file) => {
      const ext = path.extname(file.name).toLowerCase();
      return ext === '.txt' || ext === '.para';
    });

    if (txtFile) {
      const filePath = txtFile.path;
      const { ProgramStatus } = useAppStore.getState();
      useAppStore.setState({
        currentFilePath: filePath,
        programStatus: ProgramStatus.EDIT,
      });
      return;
    }

    const imageFilePaths = files
      .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f.name).toLowerCase()))
      .map(f => f.path);
    if (imageFilePaths.length > 0) {
      loadImageFiles(imageFilePaths);
    }
  }, [loadImageFiles]);

  // ─── Enter 시 <div> 생성 보장 ───
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'div');
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ─── 파일 로드 ───
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    if (!currentFilePath) {
      el.innerHTML = '';
      el.classList.add('is-empty');
      initialContentRef.current = '';
      isSavedRef.current = true;
      paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
      setMetaImage('');
      setEncryptionEnabled(false);
      setEncryptionPassword('');
      onSavedStateChange(true);
      setTimeout(() => el.focus(), 50);
      return;
    }

    const loadFile = async () => {
      try {
        isLoadingRef.current = true;

        const readResult = await ipcRenderer.invoke('read-file-decrypted', currentFilePath);
        if (!readResult.success) {
          console.warn('파일 읽기 실패/취소:', readResult.reason);
          isLoadingRef.current = false;
          return;
        }
        const rawContent = readResult.content;

        // 암호화 상태 동기화
        if (readResult.wasEncrypted) {
          setEncryptionEnabled(true);
          setEncryptionPassword(readResult.password);
        } else {
          setEncryptionEnabled(false);
          setEncryptionPassword('');
        }

        const isParaFile = path.extname(currentFilePath).toLowerCase() === '.para';
        let normalized;

        if (isParaFile) {
          const parsed = ParaFileFormat.parse(rawContent);
          normalized = parsed.plainText.replace(/\r\n/g, '\n');

          paraMetadataRef.current = parsed.metadata;

          const imgMeta = parsed.metadata.integral.image;
          setMetaImage(imgMeta && imgMeta !== 'null' ? imgMeta : '');

          const metaForIPC = {
            integral: parsed.metadata.integral,
            pages: Object.fromEntries(parsed.metadata.pages),
            paragraphs: parsed.metadata.paragraphs
          };
          ipcRenderer.invoke('update-para-metadata', metaForIPC);

          if (parsed.metadata.integral.image && parsed.metadata.integral.image !== 'null') {
            const paraDir = path.dirname(currentFilePath);
            const imageNames = parsed.metadata.integral.image.split(',').map(s => s.trim()).filter(Boolean);
            const imagePaths = imageNames
              .map(name => path.join(paraDir, name))
              .filter(p => {
                try { fs.accessSync(p); return true; } catch { return false; }
              });
            if (imagePaths.length > 0) {
              setTimeout(() => loadImageFiles(imagePaths, { fromParaMeta: true }), 300);
            }
          }
        } else {
          normalized = rawContent.replace(/\r\n/g, '\n');
          paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
        }

        initialContentRef.current = normalized;
        setEditorContent(normalized);
        normalizeBlankLines();
        expandEmptyPages();
        applyDecorations();

        isSavedRef.current = true;
        onSavedStateChange(true);
        ipcRenderer.send('update-editor-state', {
          saved: true,
          filePath: currentFilePath,
          isEditing: true
        });

        try {
          const { logData } = await ipcRenderer.invoke('get-file-history');
          const fileLog = logData?.[currentFilePath];
          if (fileLog?.lastPosition?.metadata) {
            const targetPos = fileLog.lastPosition.metadata.endPos;
            const lines = normalized.split('\n');
            let pos = 0;
            let targetIdx = 0;
            for (let i = 0; i < lines.length; i++) {
              if (pos + lines[i].length >= targetPos) {
                targetIdx = i;
                break;
              }
              pos += lines[i].length + 1;
            }
            if (el.children[targetIdx]) {
              setTimeout(() => {
                el.children[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 200);
            }
          }
        } catch (_) { /* 히스토리 없음 */ }

        isLoadingRef.current = false;
        setTimeout(() => el.focus(), 150);
      } catch (error) {
        console.error('파일 로드 실패:', error);
        isLoadingRef.current = false;
      }
    };

    loadFile();
  }, [currentFilePath, setEditorContent, applyDecorations, onSavedStateChange, normalizeBlankLines, expandEmptyPages, loadImageFiles]);

  // ─── IPC: 에디터 정보 응답 ───
  useEffect(() => {
    const handleRequest = (_, { type }) => {
      if (type !== 'request') return;
      sendEditorInfo();
    };

    ipcRenderer.on('get-editor-info', handleRequest);
    return () => ipcRenderer.removeListener('get-editor-info', handleRequest);
  }, [sendEditorInfo]);

  // ─── IPC: 저장 상태 체크 ───
  useEffect(() => {
    const handle = () => {
      ipcRenderer.send('editor-is-saved-result', getPlainText() === initialContentRef.current);
    };
    ipcRenderer.on('editor-is-saved-check', handle);
    return () => ipcRenderer.removeListener('editor-is-saved-check', handle);
  }, [getPlainText]);

  // ─── 외부 저장 요청 (사이드바에서 뷰모드 전환 시 사용) ───
  useEffect(() => {
    const handle = async () => {
      const result = await handleSave();
      window.dispatchEvent(new CustomEvent('editor-save-complete', { detail: result }));
    };
    window.addEventListener('trigger-editor-save', handle);
    return () => window.removeEventListener('trigger-editor-save', handle);
  }, [handleSave]);

  // ─── 뷰어/에디터 리사이즈 핸들러 ───
  const handlePanelResizeStart = useCallback((e) => {
    e.preventDefault();
    resizingRef.current = true;
    const handle = e.currentTarget;
    handle.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const container = handle.closest('.text-editor');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const padding = parseFloat(getComputedStyle(container).paddingLeft) || 0;

    const onMouseMove = (ev) => {
      if (!resizingRef.current) return;
      const x = ev.clientX - rect.left - padding;
      const usable = rect.width - padding * 2;
      const percent = (x / usable) * 100;
      setViewerRatio(Math.min(65, Math.max(20, percent)));
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      handle.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // ─── 메타데이터 패널: integral.image 변경 핸들러 ───
  const handleMetaImageChange = useCallback((value) => {
    setMetaImage(value);
    if (!paraMetadataRef.current) {
      paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
    }
    paraMetadataRef.current.integral.image = value || null;
    ipcRenderer.invoke('update-para-metadata', { integral: { image: value || null } });
    if (isSavedRef.current) {
      isSavedRef.current = false;
      onSavedStateChange(false);
      ipcRenderer.send('update-editor-state', {
        saved: false,
        filePath: currentFilePath,
        isEditing: true
      });
    }
  }, [currentFilePath, onSavedStateChange]);

  // ─── 렌더링 ───
  const hasImages = viewerImages.length > 0;
  const isParaFileLoaded = currentFilePath && path.extname(currentFilePath).toLowerCase() === '.para';
  const currentParaStyle = useMemo(() => {
    const paraIdx = getParagraphAtCursor();
    if (paraIdx < 0) return 'plain';
    return ParaFileFormat.getParagraphStyle(paraMetadataRef.current, paraIdx) || 'plain';
  }, [getParagraphAtCursor, alignIndicators]);

  return (
    <div className={`text-editor${hasImages ? ' with-image-viewer' : ''}`} data-theme={theme.mode}>
      {hasImages && (
        <ImageViewer
          onPageChange={handleViewerPageChange}
          onRemoveCurrentImage={removeCurrentImage}
          onCursorSyncToggle={() => setCursorSync(!cursorSync)}
          levelAdjustment={levelAdjustment}
          automationActions={automationActions}
          style={viewerRatio != null ? { width: `${viewerRatio}%` } : undefined}
        />
      )}
      {hasImages && (
        <div className="panel-resize-handle" onMouseDown={handlePanelResizeStart}>
          <div className="panel-resize-handle__bar" />
        </div>
      )}
      <div className="editor-body-wrapper">
        <div
          ref={editorRef}
          className="editor-body is-empty"
          style={{ '--editor-font-scale': fontScale }}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onDragOver={handleEditorDragOver}
          onDrop={handleEditorDrop}
          spellCheck={false}
          data-placeholder={t('editor.placeholder')}
        />
        <AlignIndicatorOverlay
          alignOverlayRef={alignOverlayRef}
          alignIndicators={alignIndicators}
          alignExpandHover={alignExpandHover}
          alignExpandTimerRef={alignExpandTimerRef}
          pluginServer={pluginServer}
          styleNames={STYLE_NAMES}
          theme={theme}
          onAlignClick={handleAlignClick}
          onSetAlignExpandHover={setAlignExpandHover}
        />
        <div className="editor-scrollbar-track" ref={scrollTrackRef}>
          <div className="editor-scrollbar-thumb" ref={scrollThumbRef} />
        </div>
      </div>
      <EditorToolbar
        icons={icons}
        fontScale={fontScale}
        hasImages={hasImages}
        isParaFileLoaded={isParaFileLoaded}
        metaPanelOpen={metaPanelOpen}
        encryptionEnabled={encryptionEnabled}
        macroButtonRef={macroButtonRef}
        styleButtonRef={styleButtonRef}
        metaButtonRef={metaButtonRef}
        encryptionButtonRef={encryptionButtonRef}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onLoadFile={handleLoadFile}
        onSave={handleSave}
        onOpenImageFiles={openImageFiles}
        onCloseImageViewer={closeImageViewer}
        onToggleMacro={() => setMacroOpen(prev => !prev)}
        onToggleStyle={() => setStyleOpen(prev => !prev)}
        onToggleMetaPanel={() => setMetaPanelOpen(prev => !prev)}
        onToggleEncryption={() => setEncryptionOpen(prev => !prev)}
      />
      {isParaFileLoaded && (
        <MetadataPanel
          metaPanelOpen={metaPanelOpen}
          metaImage={metaImage}
          onMetaImageChange={handleMetaImageChange}
          onClose={() => setMetaPanelOpen(false)}
        />
      )}
      <TextMacro
        onInsert={(text) => { setMacroOpen(false); handleMacroInsert(text); }}
        anchorRef={macroButtonRef}
      />
      <TextStyleSlots
        onSelect={handleStyleSelect}
        anchorRef={styleButtonRef}
        activeStyleName={currentParaStyle}
      />
      <EncryptionPanel
        anchorRef={encryptionButtonRef}
      />
    </div>
  );
}

export default TextEditor;
