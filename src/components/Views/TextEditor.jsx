import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import TextMacro from './TextMacro';
import TextStyleSlots from './TextStyleSlots';
import ImageViewer from './ImageViewer';
import AutomationPanel from './AutomationPanel';
import useAppStore from '../../stores/useAppStore';
import '../../CSS/Views/Editor.css';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');
const fs = window.require('fs');
const _appBase = process.env.NODE_ENV === 'development'
  ? process.cwd()
  : path.join(process.resourcesPath, 'app.asar');
const { TextProcessUtils } = window.require(
  path.join(_appBase, 'src', 'store', 'utils', 'TextProcessUtils')
);
const { BlackPointAnalyzer } = window.require(
  path.join(_appBase, 'src', 'store', 'utils', 'BlackPointAnalyzer')
);
const { SpreadDetector } = window.require(
  path.join(_appBase, 'src', 'store', 'utils', 'SpreadDetector')
);
const { ParaFileFormat, STYLE_NAMES } = window.require(
  path.join(_appBase, 'src', 'store', 'utils', 'ParaFileFormat')
);
const { DpiAdjuster } = window.require(
  path.join(_appBase, 'src', 'store', 'utils', 'DpiAdjuster')
);

import { readPsd } from 'ag-psd';

const FONT_SCALE_OPTIONS = [10, 15, 20, 25, 35, 50, 65, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.psd'];
const MIME_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.psd': 'image/vnd.adobe.photoshop' };

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function TextEditor({ theme, currentFilePath, onSavedStateChange, icons }) {
  const { t } = useTranslation();
  const editorRef = useRef(null);
  const scrollTrackRef = useRef(null);
  const scrollThumbRef = useRef(null);
  const scrollHideTimer = useRef(null);

  const isLoadingRef = useRef(false);
  const initialContentRef = useRef('');
  const isSavedRef = useRef(true);

  // ─── 뷰어/에디터 리사이즈 ───
  const [viewerRatio, setViewerRatio] = useState(null);
  const resizingRef = useRef(false);
  const rafRef = useRef(null);
  const [fontScale, setFontScale] = useState(100);
  const [macroOpen, setMacroOpen] = useState(false);
  const macroButtonRef = useRef(null);
  const macroSlotsRef = useRef(['…', '―', '♡', '♥']);

  // ─── 텍스트 스타일 슬롯 상태 ───
  const [styleOpen, setStyleOpen] = useState(false);
  const styleButtonRef = useRef(null);
  const pluginServer = useAppStore(s => s.pluginServer);

  // ─── 메타데이터 패널 상태 ───
  const [metaPanelOpen, setMetaPanelOpen] = useState(false);
  const metaButtonRef = useRef(null);
  const [metaImage, setMetaImage] = useState('');

  // ─── 이미지 뷰어 상태 ───
  const [viewerImages, setViewerImages] = useState([]);
  const viewerImagesRef = useRef([]);
  const [viewerPage, setViewerPage] = useState(0);
  const lastSyncedPageRef = useRef(0);
  const [cursorSync, setCursorSync] = useState(true);
  const [spreadPairs, setSpreadPairs] = useState([]);
  const spreadPairsRef = useRef([]);
  useEffect(() => { spreadPairsRef.current = spreadPairs; }, [spreadPairs]);

  // ─── .para 메타데이터 로컬 관리 ───
  const paraMetadataRef = useRef(null);

  // viewerImagesRef를 최신 상태와 동기화
  useEffect(() => { viewerImagesRef.current = viewerImages; }, [viewerImages]);

  // ─── 블랙포인트 분석 상태 ───
  const [blackPointInfo, setBlackPointInfo] = useState(null);
  const [blackPointAction, setBlackPointAction] = useState(null);

  // ─── 자동화 패널 상태 ───
  const automationAutoRef = useRef(AutomationPanel.loadAutoSettings());
  const handleAutomationAutoChange = useCallback((settings) => {
    automationAutoRef.current = settings;
  }, []);

  // ─── 정렬 인디케이터 상태 ───
  const [alignIndicators, setAlignIndicators] = useState([]);
  const alignOverlayRef = useRef(null);
  const [alignExpandHover, setAlignExpandHover] = useState(null); // { paragraphIdx, rect, align }
  const alignExpandTimerRef = useRef(null);

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
        // 빈 페이지: 껮지 공백을 3줄로 확장
        // 페이지 번호 다음 공백들을 먼저 제거
        while (i + 1 < divs.length && !divs[i + 1].textContent.trim()) {
          const next = divs[i + 1];
          // 다음 페이지 번호인지 확인
          if (next.textContent.trim()) break;
          el.removeChild(next);
        }
        // 3줄 삽입
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

    // 각 단락의 첫 줄(단락번호 줄)을 찾아서 바로 아래에 위치
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
          // 이전 단락 마무리
          if (firstDivOfParagraph) {
            const rect = firstDivOfParagraph.getBoundingClientRect();
            const align = ParaFileFormat.getParagraphAlign(paraMetadataRef.current, paragraphIdx);
            const style = ParaFileFormat.getParagraphStyle(paraMetadataRef.current, paragraphIdx);
            indicators.push({
              paragraphIdx: paragraphIdx,
              top: rect.top - editorRect.top,
              align,
              style
            });
          }
          paragraphIdx = idx;
          firstDivOfParagraph = div;
        } else if (!inParagraph) {
          firstDivOfParagraph = div;
        }
        inParagraph = true;
      } else if (inParagraph) {
        // 단락이 끝남
        if (firstDivOfParagraph) {
          const rect = firstDivOfParagraph.getBoundingClientRect();
          const align = ParaFileFormat.getParagraphAlign(paraMetadataRef.current, paragraphIdx);
          const style = ParaFileFormat.getParagraphStyle(paraMetadataRef.current, paragraphIdx);
          indicators.push({
            paragraphIdx: paragraphIdx,
            top: rect.top - editorRect.top,
            align,
            style
          });
        }
        paragraphIdx++;
        inParagraph = false;
        firstDivOfParagraph = null;
      }
    }

    // 마지막 단락
    if (inParagraph && firstDivOfParagraph) {
      const rect = firstDivOfParagraph.getBoundingClientRect();
      const align = ParaFileFormat.getParagraphAlign(paraMetadataRef.current, paragraphIdx);
      const style = ParaFileFormat.getParagraphStyle(paraMetadataRef.current, paragraphIdx);
      indicators.push({
        paragraphIdx: paragraphIdx,
        top: rect.top - editorRect.top,
        align,
        style
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
    // 변경 시에만 업데이트 (무한 루프 방지)
    const prevKey = spreadPairsRef.current.map(s => `${s.pageA}-${s.pageB}`).join(',');
    const newKey = derivedSpreads.map(s => `${s.pageA}-${s.pageB}`).join(',');
    if (prevKey !== newKey) {
      setSpreadPairs(derivedSpreads);
    }

    // 정렬 인디케이터 위치 업데이트
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
    // 커서가 단락 밖(공백 줄 등)에 있으면 -1
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
    // 변경 감지
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

    // 커서가 속한 div 를 찾는다
    let node = sel.focusNode;
    while (node && node !== el && node.parentNode !== el) {
      node = node.parentNode;
    }
    if (!node || node === el) return null;

    // 해당 div 위쪽으로 가장 가까운 page-number 라인까지 역순 탐색
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

      divs[i].scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 페이지 번호 다음 내용 수집: 다음 페이지 번호까지의 줄들
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
        // 내용이 있으면 첫 단락의 마지막 문자로 커서 이동
        // 첫 단락의 마지막 줄 찾기 (다음 빈줄 or 페이지까지)
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
        // 빈 줄이 2개 이상이면 두 번째 빈 줄(가운데)으로
        const midBlank = blankLines[1];
        range.selectNodeContents(midBlank);
        range.collapse(true);
      } else if (blankLines.length === 1) {
        range.selectNodeContents(blankLines[0]);
        range.collapse(true);
      } else {
        // 다음 줄이 없으면 페이지 번호 다음에 치
        const nextDiv = divs[i + 1];
        if (nextDiv) {
          range.selectNodeContents(nextDiv);
          range.collapse(true);
        } else {
          continue;
        }
      }

      sel.removeAllRanges();
      sel.addRange(range);

      // 커서가 놓인 요소를 뷰포트에 보이도록 스크롤
      const cursorNode = range.startContainer;
      const cursorEl = cursorNode.nodeType === Node.TEXT_NODE ? cursorNode.parentElement : cursorNode;
      if (cursorEl && cursorEl.scrollIntoView) {
        cursorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
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
    if (viewerImages.length === 0) return false;

    const el = editorRef.current;
    if (!el) return false;

    // 합페 pageB (소비된 페이지) 집합 구성
    const consumed = new Set(spreadPairs.map(s => s.pageB));

    const sortedPages = viewerImages.map(img => img.page).sort((a, b) => a - b);
    const curPage = lastSyncedPageRef.current || viewerPage;

    // 1. 에디터에 페이지 번호가 하나도 없으면 현재 페이지를 먼저 기록
    const { blocks: existingBlocks } = collectPageBlocks();
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

    // 타겟 페이지 계산
    const curIdx = sortedPages.indexOf(curPage);
    let targetPage;

    if (forward) {
      // 다음 페이지 (consumed 건너뛰기)
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
      // 이전 페이지 (consumed 건너뛰기)
      for (let i = curIdx - 1; i >= 0; i--) {
        if (!consumed.has(sortedPages[i])) {
          targetPage = sortedPages[i];
          break;
        }
      }
      if (targetPage == null) return false;
    }

    // 이미지 뷰어 페이지 전환
    setViewerPage(targetPage);
    lastSyncedPageRef.current = targetPage;

    // 에디터에 해당 페이지 번호가 이미 있는지 확인
    const targetExists = existingBlocks.some(b => b.pageNum === targetPage);

    if (targetExists) {
      // 2. 페이지가 이미 존재 → 순서 정렬 후 스크롤
      const sorted = sortEditorPagesIfNeeded();
      if (sorted) {
        normalizeBlankLines();
        expandEmptyPages();
        scheduleDecorations();
      }
      scrollEditorToPage(targetPage);
    } else {
      // 3. 페이지 없음 → 순서 정렬 후 올바른 위치에 삽입
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

    // 현재 페이지가 이미 합페 pageA라면 → 해체 (에디터 텍스트 기반 판별)
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
        // 합페 범위 div 찾기
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
          // "pageA-pageB" → "pageA" 로 변경
          spreadDiv.textContent = String(pageA);

          // pageA 아래 다음 페이지 번호 직전까지가 내용 영역 (모두 pageA에 남김)
          // 그 위치에 pageB 페이지 번호 + 공백 3줄 삽입
          let insertBeforeNode = null;
          for (let j = spreadDivIdx + 1; j < divs.length; j++) {
            if (divs[j].classList.contains('line-page-number')) {
              insertBeforeNode = divs[j];
              break;
            }
          }

          // pageB 번호 div 생성
          const pageBDiv = document.createElement('div');
          pageBDiv.textContent = String(pageB);

          // 공백 3줄
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

    // 합페가 아니면 → 묶기
    const curIdx = sortedPages.indexOf(curPage);
    if (curIdx < 0 || curIdx >= sortedPages.length - 1) return;

    const pageA = sortedPages[curIdx];
    const pageB = sortedPages[curIdx + 1];

    // 이미 다른 합페에 포함된 페이지면 무시 (에디터 텍스트 기반)
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

      // "pageA" → "pageA-pageB" 범위 형식으로 변경
      if (divA) {
        divA.textContent = `${pageA}-${pageB}`;
      }

      // pageB 블록 처리: pageB 번호 div 제거, 내용은 pageA 영역으로 병합
      if (divB && divBIdx > 0) {
        // pageB 아래 내용(다음 페이지 번호 직전까지)을 수집
        const contentNodes = [];
        for (let j = divBIdx + 1; j < divs.length; j++) {
          if (divs[j].classList.contains('line-page-number')) break;
          contentNodes.push(divs[j]);
        }

        // pageA 영역 끝 위치 찾기 (= divB 바로 앞)
        // divB 직전의 후행 공백 제거 (pageA 영역 끝의 빈 줄들)
        while (divB.previousSibling && divB.previousSibling !== divA &&
               !divB.previousSibling.classList?.contains('line-page-number') &&
               !divB.previousSibling.textContent.trim()) {
          divB.previousSibling.remove();
        }

        // pageB 내용 노드들을 divB 앞에 이동 (pageA 영역 끝에 붙이기)
        const hasPageBContent = contentNodes.some(n => n.textContent.trim());
        if (hasPageBContent) {
          for (const node of contentNodes) {
            el.insertBefore(node, divB);
          }
        }

        // pageB 번호 div 제거
        divB.remove();
      }

      // 합페 페이지에 내용이 없으면 공백 3줄 보장
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

  // ─── 저장 ───
  const handleSave = useCallback(async () => {
    try {
      // 저장 전 공백줄 정규화 (빈 페이지 3줄 → 1줄)
      normalizeBlankLines();
      applyDecorations();

      const content = getPlainText();
      
      // 현재 파일 확장자에 따라 저장 포맷 결정
      const currentExt = currentFilePath ? path.extname(currentFilePath).toLowerCase() : '';
      // 메타데이터가 있으면 .para로 저장 (새 파일이라도)
      const hasMetadata = !!paraMetadataRef.current;
      const isParaFile = currentExt === '.para' || (currentExt === '' && hasMetadata);
      const format = isParaFile ? 'para' : 'txt';
      const defaultExt = isParaFile ? '.para' : '.txt';
      const fileName = currentFilePath 
        ? path.basename(currentFilePath) 
        : 'Untitled' + defaultExt;

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
        } : undefined
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
      }

      // 저장 후 빈 페이지 다시 3줄로 확장
      expandEmptyPages();
      applyDecorations();
    } catch (error) {
      console.error('저장 실패:', error);
    } finally {
      editorRef.current?.focus();
    }
  }, [currentFilePath, getPlainText, onSavedStateChange, normalizeBlankLines, expandEmptyPages, applyDecorations]);

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

      // Tab / Shift+Tab → 이미지 뷰어가 열려 있으면 처리
      if (e.key === 'Tab' && viewerImages.length > 0) {
        e.stopPropagation();
        e.preventDefault();
        // Shift+Tab(역방향)은 즉시 처리
        if (e.shiftKey && !e.repeat) {
          handleTabNavigation(false);
          return;
        }
        // 순방향: 첫 keydown에서 타이머 시작
        if (!e.repeat && !e.shiftKey) {
          tabFiredRef.current = false;
          tabDownTimeRef.current = Date.now();
          tabLongPressTimerRef.current = setTimeout(() => {
            tabFiredRef.current = true;
            tabDownTimeRef.current = 0;
            mergeSpreadManual();
          }, TAB_LONG_PRESS_MS);
        }
        return;
      }

      // Ctrl+숫자(1~9, 0) → 매크로 삽입
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

      // Alt+방향키 → 단락 정렬 변경 / Alt+숫자 → 스타일 적용
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

        // Alt+1~9, Alt+0 → 스타일 1~10
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
          e.stopPropagation();
          e.preventDefault();
          const paraIdx = getParagraphAtCursor();
          if (paraIdx >= 0) {
            setParagraphStyle(paraIdx, effectiveSlots[styleIdx]);
          }
          return;
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Tab' && !e.shiftKey && viewerImages.length > 0) {
        // 타이머 취소
        if (tabLongPressTimerRef.current) {
          clearTimeout(tabLongPressTimerRef.current);
          tabLongPressTimerRef.current = null;
        }
        // 합페 토글이 이미 발동했으면 페이지 이동 안 함
        if (!tabFiredRef.current && tabDownTimeRef.current > 0) {
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

    // ── 썩 드래그 ──
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

    // ── 트랙 클릭으로 점프 ──
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

  // ─── 블랙포인트 분석 ───
  const analyzeBlackPoint = useCallback(async (imageFiles) => {
    if (imageFiles.length === 0) return;
    try {
      const toDataUrl = async (filePath) => {
        const buffer = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'image/jpeg';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      };

      const result = await BlackPointAnalyzer.analyzeWithSampling(imageFiles, toDataUrl);
      setBlackPointInfo(result);

      // ── 페이지별 블랙포인트를 .para 메타데이터에 기록 ──
      // 분석된 페이지: 표준화된 결과 사용 (표준 또는 개별 BP)
      // 미분석 페이지: 표준 블랙포인트 적용
      if (paraMetadataRef.current) {
        if (!(paraMetadataRef.current.pages instanceof Map)) {
          paraMetadataRef.current.pages = new Map();
        }
      }

      const standardHex = result.blackPoint.hex;
      for (const img of imageFiles) {
        const page = img.page;
        const pageResult = result.perPage?.get(page);
        const hex = pageResult ? pageResult.blackPoint.hex : standardHex;

        // 로컬 ref 업데이트
        if (paraMetadataRef.current) {
          if (!paraMetadataRef.current.pages.has(page)) {
            paraMetadataRef.current.pages.set(page, { blackpoint: '#000000' });
          }
          paraMetadataRef.current.pages.get(page).blackpoint = hex;
        }
        // 메인 프로세스에도 동기화
        ipcRenderer.invoke('set-page-blackpoint', {
          pageNumber: page,
          blackpoint: hex
        });
      }

      if (!result.isPureBlack) {
        const choice = await ipcRenderer.invoke('show-black-point-dialog', result.blackPoint);
        const action = choice === 0 ? 'photoshop-color' : choice === 1 ? 'adjust-levels' : 'none';
        setBlackPointAction(action);
        if (choice === 0) {
          ipcRenderer.send('set-black-point-color', result.blackPoint.hex);
        }
      }
    } catch (error) {
      console.error('블랙포인트 분석 실패:', error);
    }
  }, []);

  // ─── 합페(스프레드) 자동 감지 ───
  const detectSpreads = useCallback(async (imageFiles) => {
    if (imageFiles.length < 2) return;
    try {
      const toDataUrl = async (filePath) => {
        const buffer = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'image/jpeg';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      };

      const spreads = await SpreadDetector.detect(imageFiles, toDataUrl);
      if (spreads.length === 0) return;

      // ── 에디터 페이지 번호를 합페 범위 형식으로 업데이트 ──
      const el = editorRef.current;
      if (el) {
        for (const { pageA, pageB } of spreads) {
          const divs = el.children;
          let divA = null, divAIdx = -1, divB = null, divBIdx = -1;
          for (let i = 0; i < divs.length; i++) {
            if (!divs[i].classList.contains('line-page-number')) continue;
            const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
            if (!info) continue;
            if (info.start === pageA && info.start === info.end) { divA = divs[i]; divAIdx = i; }
            if (info.start === pageB && info.start === info.end) { divB = divs[i]; divBIdx = i; }
          }

          // "pageA" → "pageA-pageB" 범위 형식으로 변경
          if (divA) {
            divA.textContent = `${pageA}-${pageB}`;
          }

          // "pageB" 블록 처리: 내용은 pageA 영역으로 병합
          if (divB && divBIdx > 0) {
            const contentNodes = [];
            for (let j = divBIdx + 1; j < divs.length; j++) {
              if (divs[j].classList.contains('line-page-number')) break;
              contentNodes.push(divs[j]);
            }

            // pageA 영역 끝 후행 공백 제거
            while (divB.previousSibling && divB.previousSibling !== divA &&
                   !divB.previousSibling.classList?.contains('line-page-number') &&
                   !divB.previousSibling.textContent.trim()) {
              divB.previousSibling.remove();
            }

            // pageB 내용을 divB 앞으로 이동 (= pageA 영역 끝)
            const hasContent = contentNodes.some(n => n.textContent.trim());
            if (hasContent) {
              for (const node of contentNodes) {
                el.insertBefore(node, divB);
              }
            }

            divB.remove();
          }
        }
        expandEmptyPages();
        applyDecorations();
      }

      console.log(`합페 감지 완료: ${spreads.map(s => `${s.pageA}-${s.pageB}`).join(', ')}`);
    } catch (error) {
      console.error('합페 감지 실패:', error);
    }
  }, [applyDecorations, expandEmptyPages]);

  // ─── 에디터에 페이지 번호 삽입 (자동화 기능 2) ───
  const insertPageNumbers = useCallback((imageFiles) => {
    const el = editorRef.current;
    if (!el || imageFiles.length <= 1) return;

    const loadedPages = imageFiles.map(img => img.page);
    const existingEditorPages = new Set();
    for (const div of el.children) {
      if (div.classList.contains('line-page-number')) {
        const info = TextProcessUtils.extractPageNumber(div.textContent.trim());
        if (info) existingEditorPages.add(info.start);
      }
    }

    const pagesToInsert = loadedPages.filter(p => !existingEditorPages.has(p));
    if (pagesToInsert.length === 0) return;

    for (const page of pagesToInsert) {
      const makePageBlock = () => {
        const frag = document.createDocumentFragment();
        const pageDiv = document.createElement('div');
        pageDiv.textContent = String(page);
        frag.appendChild(pageDiv);
        const blank = document.createElement('div');
        blank.innerHTML = '<br>';
        frag.appendChild(blank);
        return frag;
      };

      let inserted = false;
      const divs = el.children;
      for (let i = 0; i < divs.length; i++) {
        if (!divs[i].classList.contains('line-page-number')) continue;
        const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
        if (info && info.start > page) {
          el.insertBefore(makePageBlock(), divs[i]);
          inserted = true;
          break;
        }
      }
      if (!inserted) el.appendChild(makePageBlock());
    }

    normalizeBlankLines();
    expandEmptyPages();
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
    applyDecorations();
  }, [normalizeBlankLines, expandEmptyPages, getPlainText, onSavedStateChange, currentFilePath, applyDecorations]);

  // ─── 이미지 메타데이터 저장 (자동화 기능 1) ───
  const saveImageMetadata = useCallback((imageFiles) => {
    if (imageFiles.length === 0) return Promise.resolve();
    const imageNames = imageFiles.map(img => path.basename(img.filePath)).join(',');
    if (!paraMetadataRef.current) {
      paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
    }
    paraMetadataRef.current.integral.image = imageNames;
    setMetaImage(imageNames);
    ipcRenderer.invoke('update-para-metadata', { integral: { image: imageNames } });
    return analyzeBlackPoint(imageFiles);
  }, [analyzeBlackPoint]);

  // ─── 인쇄 DPI 72로 조정 (자동화 기능 4) ───
  const adjustDpiTo72 = useCallback(async (imageFiles) => {
    if (!imageFiles || imageFiles.length === 0) return;
    let count = 0;
    for (const img of imageFiles) {
      try {
        const buffer = await fs.promises.readFile(img.filePath);
        const adjusted = DpiAdjuster.setDpi(buffer, 72);
        if (adjusted !== buffer) {
          await fs.promises.writeFile(img.filePath, adjusted);
          count++;
        }
      } catch (err) {
        console.error(`DPI 조정 실패: ${img.filePath}`, err);
      }
    }
    console.log(`DPI 72로 조정 완료: ${count}/${imageFiles.length}장`);
  }, []);

  // ─── 자동화 패널: 수동 실행 콜백 ───
  const automationActions = useMemo(() => ({
    metadata: () => saveImageMetadata(viewerImagesRef.current),
    numbering: () => { insertPageNumbers(viewerImagesRef.current); return Promise.resolve(); },
    spread: () => detectSpreads(viewerImagesRef.current),
    dpi: () => adjustDpiTo72(viewerImagesRef.current),
    onAutoSettingsChange: handleAutomationAutoChange
  }), [saveImageMetadata, insertPageNumbers, detectSpreads, adjustDpiTo72, handleAutomationAutoChange]);

  // ─── 선택된 이미지 파일 로드 ───
  const loadImageFiles = useCallback((filePaths) => {
    const newFiles = filePaths
      .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map(f => ({
        filePath: f,
        filename: path.basename(f),
        page: ImageViewer.extractPageFromFilename(f)
      }));

    // 기존 이미지와 병합 (같은 filePath 중복 제거)
    const prevImages = viewerImagesRef.current || [];
    const existingPaths = new Set(prevImages.map(img => img.filePath));
    const uniqueNew = newFiles.filter(f => !existingPaths.has(f.filePath));
    const merged = [...prevImages, ...uniqueNew];

    // 페이지 번호를 추출할 수 없는(page=0) 이미지에 순차 번호 할당
    const usedPages = new Set(merged.filter(img => img.page > 0).map(img => img.page));
    let nextPage = 1;
    for (const img of merged) {
      if (img.page === 0) {
        while (usedPages.has(nextPage)) nextPage++;
        img.page = nextPage;
        usedPages.add(nextPage);
        nextPage++;
      }
    }
    merged.sort((a, b) => a.page - b.page);

    const imageFiles = merged;

    // 이미지 뷰어 최초 마운트 시 → 첫 이미지 크기 기반으로 창 확장
    const isFirstLoad = (viewerImagesRef.current || []).length === 0;
    if (isFirstLoad && imageFiles.length > 0) {
      const firstFile = imageFiles[0].filePath;
      const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      try {
        const buf = fs.readFileSync(firstFile);
        const ext = path.extname(firstFile).toLowerCase();

        let imgWidth, imgHeight;
        if (ext === '.psd') {
          const psd = readPsd(new Uint8Array(buf));
          imgWidth = psd.width;
          imgHeight = psd.height;
        } else {
          const mime = MIME[ext] || 'image/jpeg';
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          // 비동기로 이미지 크기 측정
          const img = new window.Image();
          img.onload = () => {
            const textEditorEl = document.querySelector('.text-editor');
            if (!textEditorEl || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
            const viewerCanvasHeight = textEditorEl.clientHeight - 80;
            const fitImageWidth = (img.naturalWidth / img.naturalHeight) * viewerCanvasHeight;
            const neededViewerWidth = fitImageWidth + 32;
            const nonEditorWidth = document.documentElement.clientWidth - textEditorEl.clientWidth;
            const totalNeeded = nonEditorWidth + 360 + 8 + neededViewerWidth;
            ipcRenderer.send('expand-window-for-image', Math.ceil(totalNeeded));
          };
          img.src = dataUrl;
          imgWidth = null; // 비동기 처리됨
        }

        if (imgWidth && imgHeight) {
          const textEditorEl = document.querySelector('.text-editor');
          if (textEditorEl && imgWidth > 0 && imgHeight > 0) {
            const viewerCanvasHeight = textEditorEl.clientHeight - 80;
            const fitImageWidth = (imgWidth / imgHeight) * viewerCanvasHeight;
            const neededViewerWidth = fitImageWidth + 32;
            const nonEditorWidth = document.documentElement.clientWidth - textEditorEl.clientWidth;
            const totalNeeded = nonEditorWidth + 360 + 8 + neededViewerWidth;
            ipcRenderer.send('expand-window-for-image', Math.ceil(totalNeeded));
          }
        }
      } catch { /* 이미지 로드 실패 시 확장 생략 */ }
    }

    setViewerImages(imageFiles);
    if (imageFiles.length === 0) return;

    // 새로 추가된 이미지의 페이지 목록
    const newLoadedPages = uniqueNew.map(img => img.page);
    const loadedPages = imageFiles.map(img => img.page);
    const firstNewPage = newLoadedPages.length > 0 ? newLoadedPages[0] : loadedPages[0];

    // viewerPage를 즉시 설정하여 ImageViewer가 유효한 페이지로 마운트되도록 보장
    setViewerPage(firstNewPage);
    lastSyncedPageRef.current = firstNewPage;

    const el = editorRef.current;
    if (!el) return;

    // ─── 자동화 설정에 따른 조건부 실행 ───
    const autoSettings = automationAutoRef.current;

    // 기능 2: 텍스트 넘버링 자동 스탬프
    if (autoSettings.numbering) {
      insertPageNumbers(imageFiles);
    }

    // 커서 배치: 페이지 번호가 있으면 첫 번째 빈 페이지로 이동
    const findFirstEmptyPage = () => {
      applyDecorations();
      const divs = el.children;

      for (const targetPage of loadedPages) {
        for (let i = 0; i < divs.length; i++) {
          if (!divs[i].classList.contains('line-page-number')) continue;
          const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
          if (!info || info.start !== targetPage) continue;

          let hasContent = false;
          for (let j = i + 1; j < divs.length; j++) {
            if (divs[j].classList.contains('line-page-number')) break;
            if (divs[j].textContent.trim() && !divs[j].classList.contains('line-comment')) {
              hasContent = true;
              break;
            }
          }
          if (!hasContent) return targetPage;
          break;
        }
      }
      return null;
    };

    setTimeout(() => {
      const jumpPage = findFirstEmptyPage() ?? firstNewPage;
      if (jumpPage !== firstNewPage) {
        setViewerPage(jumpPage);
        lastSyncedPageRef.current = jumpPage;
      }
      scrollEditorToPage(jumpPage);
    }, 50);

    // 블랙포인트 분석은 항상 실행 (상태 바 표시용)
    analyzeBlackPoint(uniqueNew.length > 0 ? uniqueNew : imageFiles);

    // 기능 1: 이미지 정보 메타데이터에 저장
    if (autoSettings.metadata) {
      saveImageMetadata(uniqueNew.length > 0 ? uniqueNew : imageFiles);
    }

    // 기능 3: 합페 검출 및 넘버링에 적용
    if (autoSettings.spread) {
      detectSpreads(imageFiles);
    }

    // 기능 4: 인쇄 DPI를 72로 조정
    if (autoSettings.dpi) {
      adjustDpiTo72(imageFiles);
    }
  }, [scheduleDecorations, scrollEditorToPage, applyDecorations, getPlainText, onSavedStateChange, currentFilePath, normalizeBlankLines, expandEmptyPages, analyzeBlackPoint, detectSpreads, insertPageNumbers, saveImageMetadata, adjustDpiTo72]);

  // ─── IPC/이벤트: 이미지 파일 열기 ───
  useEffect(() => {
    const handleOpenImageFiles = (_, filePaths) => {
      if (Array.isArray(filePaths) && filePaths.length > 0) {
        loadImageFiles(filePaths);
      }
    };
    // 드래그-드롭 등 렌더러 내부 이벤트
    const handleEditorLoadImages = (e) => {
      if (Array.isArray(e.detail) && e.detail.length > 0) {
        loadImageFiles(e.detail);
      }
    };

    // 에디터 마운트 시 pendingImagePaths 소비
    const pending = useAppStore.getState().pendingImagePaths;
    if (Array.isArray(pending) && pending.length > 0) {
      useAppStore.setState({ pendingImagePaths: null });
      loadImageFiles(pending);
    }

    ipcRenderer.on('open-image-files', handleOpenImageFiles);
    window.addEventListener('editor-load-images', handleEditorLoadImages);
    return () => {
      ipcRenderer.removeListener('open-image-files', handleOpenImageFiles);
      window.removeEventListener('editor-load-images', handleEditorLoadImages);
    };
  }, [loadImageFiles]);

  // ─── 이미지 뷰어 닫기 ───
  const closeImageViewer = useCallback(() => {
    setViewerImages([]);
    setViewerPage(0);
    lastSyncedPageRef.current = 0;
    setBlackPointInfo(null);
    setBlackPointAction(null);
    ipcRenderer.send('clear-black-point-color');
  }, []);

  // ─── 현재 이미지 한 장 제거 ───
  const removeCurrentImage = useCallback(() => {
    const curPage = viewerPage;
    setViewerImages(prev => {
      const remaining = prev.filter(img => img.page !== curPage);
      if (remaining.length === 0) {
        closeImageViewer();
        return [];
      }
      const sorted = [...remaining].sort((a, b) => a.page - b.page);
      const next = sorted.find(img => img.page > curPage) || sorted[sorted.length - 1];
      setViewerPage(next.page);
      return remaining;
    });
  }, [viewerPage, closeImageViewer]);

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

    // 이미지 파일 드롭 처리
    const imageFilePaths = files
      .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f.name).toLowerCase()))
      .map(f => f.path);
    if (imageFilePaths.length > 0) {
      loadImageFiles(imageFilePaths);
    }
  }, [loadImageFiles]);

  // ─── 이미지 파일 선택 다이얼로그 ───
  const openImageFiles = useCallback(async () => {
    const result = await ipcRenderer.invoke('open-image-files');
    if (result) {
      loadImageFiles(result);
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
      onSavedStateChange(true);
      setTimeout(() => el.focus(), 50);
      return;
    }

    const loadFile = async () => {
      try {
        isLoadingRef.current = true;

        const rawContent = await ipcRenderer.invoke('read-file', currentFilePath);
        const isParaFile = path.extname(currentFilePath).toLowerCase() === '.para';
        let normalized;

        if (isParaFile) {
          const parsed = ParaFileFormat.parse(rawContent);
          normalized = parsed.plainText.replace(/\r\n/g, '\n');

          // 메타데이터를 로컬 ref에 저장
          paraMetadataRef.current = parsed.metadata;

          // 메타데이터 패널 상태 동기화
          const imgMeta = parsed.metadata.integral.image;
          setMetaImage(imgMeta && imgMeta !== 'null' ? imgMeta : '');

          // 메타데이터를 메인 프로세스에도 동기화
          const metaForIPC = {
            integral: parsed.metadata.integral,
            pages: Object.fromEntries(parsed.metadata.pages),
            paragraphs: parsed.metadata.paragraphs
          };
          ipcRenderer.invoke('update-para-metadata', metaForIPC);

          // 이미지 메타데이터가 있으면 같은 디렉토리에서 파일명 매칭하여 자동 로드
          if (parsed.metadata.integral.image && parsed.metadata.integral.image !== 'null') {
            const paraDir = path.dirname(currentFilePath);
            const imageNames = parsed.metadata.integral.image.split(',').map(s => s.trim()).filter(Boolean);
            const imagePaths = imageNames
              .map(name => path.join(paraDir, name))
              .filter(p => {
                try { fs.accessSync(p); return true; } catch { return false; }
              });
            if (imagePaths.length > 0) {
              setTimeout(() => loadImageFiles(imagePaths), 300);
            }
          }
        } else {
          normalized = rawContent.replace(/\r\n/g, '\n');
          // .txt 파일은 기본 메타데이터 생성
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

        // 히스토리에서 스크롤 위치 복원
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
  const handleMetaImageChange = useCallback((e) => {
    const value = e.target.value;
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
  }, [getParagraphAtCursor, alignIndicators]); // alignIndicators dependency ensures re-render on decoration updates

  return (
    <div className={`text-editor${hasImages ? ' with-image-viewer' : ''}`} data-theme={theme.mode}>
      {/* ── [독립 컨테이너 2] 이미지 뷰어 ── 에디터·툴바와 절대 합치지 말 것 */}
      {hasImages && (
        <ImageViewer
          images={viewerImages}
          currentPage={viewerPage}
          onPageChange={handleViewerPageChange}
          onRemoveCurrentImage={removeCurrentImage}
          cursorSync={cursorSync}
          onCursorSyncToggle={() => setCursorSync(prev => !prev)}
          blackPointInfo={blackPointInfo}
          levelAdjustment={levelAdjustment}
          icons={icons}
          automationActions={automationActions}
          spreadPairs={spreadPairs}
          style={viewerRatio != null ? { width: `${viewerRatio}%` } : undefined}
        />
      )}
      {/* ── 뷰어↔에디터 리사이즈 핸들 ── */}
      {hasImages && (
        <div className="panel-resize-handle" onMouseDown={handlePanelResizeStart}>
          <div className="panel-resize-handle__bar" />
        </div>
      )}
      {/* ── [독립 컨테이너 1] 에디터 본체 ── 이미지 뷰어·툴바와 절대 합치지 말 것 */}
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
        <div className="align-indicator-overlay" ref={alignOverlayRef}>
          {alignIndicators.map(({ paragraphIdx, top, align, style }) => {
            const alignBtns = [
              { key: 'left', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '←' },
              { key: 'center', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="3.5" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="3.5" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '↑' },
              { key: 'right', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="6" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="6" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '→' },
            ];
            const activeBtn = alignBtns.find(b => b.key === align) || alignBtns[1];
            const editorSlotOrder = useAppStore.getState().slotOrder;
            const editorSlots = Array.isArray(editorSlotOrder) && editorSlotOrder.length === 10 ? editorSlotOrder : STYLE_NAMES;
            const styleIdx = editorSlots.indexOf(style);
            const circledNums = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
            return (
              <div
                key={paragraphIdx}
                className={`para-indicator${!pluginServer ? ' disabled' : ''}`}
                style={{ top: `${top}px` }}
              >
                {/* 단락 번호 */}
                <span className="para-indicator-num">{paragraphIdx + 1}</span>
                {/* 정렬 아이콘 (기본: 활성만, 호버: 포탈로 전체 표시) */}
                <span
                  className={`para-indicator-align${alignExpandHover?.paragraphIdx === paragraphIdx ? ' expand-open' : ''}`}
                  title={`${t(`editor.align.${align}`)} (Alt+${activeBtn.shortcut})`}
                  onMouseEnter={(e) => {
                    clearTimeout(alignExpandTimerRef.current);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setAlignExpandHover({ paragraphIdx, rect, align });
                  }}
                  onMouseLeave={() => {
                    alignExpandTimerRef.current = setTimeout(() => setAlignExpandHover(null), 80);
                  }}
                >
                  <span className="para-indicator-align-active">{activeBtn.icon}</span>
                </span>
                {/* 스타일 번호 */}
                <span className="para-indicator-style" title={`${t(`editor.style.${style}`)} (Alt+${styleIdx === 9 ? '0' : styleIdx + 1})`}>
                  {circledNums[styleIdx] || styleIdx + 1}
                </span>
              </div>
            );
          })}
        </div>
        <div className="editor-scrollbar-track" ref={scrollTrackRef}>
          <div className="editor-scrollbar-thumb" ref={scrollThumbRef} />
        </div>
      </div>
      {/* ── 정렬 확장 팝업 (포탈) ── overflow:hidden 탈출을 위해 body에 렌더링 */}
      {alignExpandHover && (() => {
        const { paragraphIdx, rect, align } = alignExpandHover;
        const portalAlignBtns = [
          { key: 'left', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '←' },
          { key: 'center', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="3.5" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="3.5" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '↑' },
          { key: 'right', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="6" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="6" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '→' },
        ];
        return createPortal(
          <div
            className="para-indicator-align-expand portal"
            data-theme={theme.mode}
            style={{
              position: 'fixed',
              left: `${rect.left + rect.width / 2}px`,
              top: `${rect.top + rect.height / 2}px`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseEnter={() => clearTimeout(alignExpandTimerRef.current)}
            onMouseLeave={() => setAlignExpandHover(null)}
          >
            {portalAlignBtns.map(({ key, icon, shortcut }) => (
              <span
                key={key}
                className={`para-indicator-align-btn${align === key ? ' active' : ''}`}
                title={`${t(`editor.align.${key}`)} (Alt+${shortcut})`}
                onMouseDown={(e) => { e.preventDefault(); handleAlignClick(paragraphIdx, key); setAlignExpandHover(null); }}
              >
                {icon}
              </span>
            ))}
          </div>,
          document.body
        );
      })()}
      {/* ── [독립 컨테이너 3] 툴바 ── 에디터 본체·이미지 뷰어와 절대 합치지 말 것 */}
      <div className="editor-toolbar">
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={handleZoomOut}
          title={t('editor.toolbar.fontSize')}
          disabled={fontScale <= FONT_SCALE_OPTIONS[0]}
        >
          <img src={icons?.zoomOut} alt="Zoom Out" className="icon" />
        </button>
        <span className="editor-toolbar-scale">{fontScale}%</span>
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={handleZoomIn}
          title={t('editor.toolbar.fontSize')}
          disabled={fontScale >= FONT_SCALE_OPTIONS[FONT_SCALE_OPTIONS.length - 1]}
        >
          <img src={icons?.zoomIn} alt="Zoom In" className="icon" />
        </button>
        <div className="editor-toolbar-divider" />
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={handleLoadFile}
          title={t('editor.toolbar.load')}
        >
          <img src={icons?.folder} alt="Load" className="icon" />
        </button>
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={handleSave}
          title={t('editor.toolbar.save')}
        >
          <img src={icons?.save} alt="Save" className="icon" />
        </button>
        <div className="editor-toolbar-divider" />
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={openImageFiles}
          title={t('editor.toolbar.imageViewer', '이미지 뷰어')}
        >
          <img src={icons?.imageAdd} alt="Image Folder" className="icon" />
        </button>
        {hasImages && (
          <button
            type="button"
            className="editor-toolbar-icon"
            onClick={closeImageViewer}
            title={t('editor.toolbar.closeViewer', '뷰어 닫기')}
          >
            <img src={icons?.delete} alt="Close Viewer" className="icon" />
          </button>
        )}
        <div className="editor-toolbar-divider" />
        <button
          ref={macroButtonRef}
          type="button"
          className="editor-toolbar-icon"
          onClick={() => setMacroOpen(prev => !prev)}
          title={t('editor.toolbar.textMacro')}
        >
          <img src={icons?.textAdd} alt="Text Macro" className="icon" />
        </button>
        <button
          ref={styleButtonRef}
          type="button"
          className="editor-toolbar-icon"
          onClick={() => setStyleOpen(prev => !prev)}
          title={t('editor.toolbar.textStyle')}
        >
          <img src={icons?.fontStyle} alt="Text Style" className="icon" />
        </button>
        {isParaFileLoaded && (
          <>
            <div className="editor-toolbar-divider" />
            <button
              ref={metaButtonRef}
              type="button"
              className={`editor-toolbar-icon${metaPanelOpen ? ' active' : ''}`}
              onClick={() => setMetaPanelOpen(prev => !prev)}
              title={t('editor.toolbar.metadata', '메타데이터')}
            >
              <img src={icons?.database} alt="Metadata" className="icon" />
            </button>
          </>
        )}
      </div>
      {/* ── 메타데이터 패널 ── */}
      {isParaFileLoaded && metaPanelOpen && (
        <div className={`meta-panel${metaPanelOpen ? ' visible' : ''}`}>
          <div className="meta-panel-header">
            <span className="meta-panel-title">{t('editor.metadata.title', '메타데이터')}</span>
          </div>
          <div className="meta-panel-body">
            <label className="meta-panel-field">
              <span className="meta-panel-label">{t('editor.metadata.image', '열 이미지')}</span>
              <input
                type="text"
                className="meta-panel-input"
                value={metaImage}
                onChange={handleMetaImageChange}
                placeholder={t('editor.metadata.imagePlaceholder', 'image1.jpg,image2.jpg')}
                spellCheck={false}
              />
            </label>
          </div>
        </div>
      )}
      <TextMacro
        isOpen={macroOpen}
        onClose={() => setMacroOpen(false)}
        onInsert={(text) => { setMacroOpen(false); handleMacroInsert(text); }}
        anchorRef={macroButtonRef}
      />
      <TextStyleSlots
        isOpen={styleOpen}
        onClose={() => setStyleOpen(false)}
        onSelect={handleStyleSelect}
        anchorRef={styleButtonRef}
        activeStyleName={currentParaStyle}
      />
    </div>
  );
}

export default TextEditor;