import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import TextMacro from './TextMacro';
import TextStyleSlots from './TextStyleSlots';
import ImageViewer from './ImageViewer';
import useAppStore from '../../stores/useAppStore';
import '../../CSS/Views/Editor.css';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');
const fs = window.require('fs');
const { TextProcessUtils } = window.require(
  path.join(process.cwd(), 'src', 'store', 'utils', 'TextProcessUtils')
);
const { BlackPointAnalyzer } = window.require(
  path.join(process.cwd(), 'src', 'store', 'utils', 'BlackPointAnalyzer')
);
const { SpreadDetector } = window.require(
  path.join(process.cwd(), 'src', 'store', 'utils', 'SpreadDetector')
);
const { ParaFileFormat } = window.require(
  path.join(process.cwd(), 'src', 'store', 'utils', 'ParaFileFormat')
);

const FONT_SCALE_OPTIONS = [10, 15, 20, 25, 35, 50, 65, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MIME_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

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
  const rafRef = useRef(null);
  const [fontScale, setFontScale] = useState(100);
  const [macroOpen, setMacroOpen] = useState(false);
  const macroButtonRef = useRef(null);
  const macroSlotsRef = useRef(['…', '―', '♡', '♥']);

  // ─── 텍스트 스타일 슬롯 상태 ───
  const [styleOpen, setStyleOpen] = useState(false);
  const styleButtonRef = useRef(null);

  // ─── 이미지 뷰어 상태 ───
  const [viewerImages, setViewerImages] = useState([]);
  const viewerImagesRef = useRef([]);
  const [viewerPage, setViewerPage] = useState(0);
  const lastSyncedPageRef = useRef(0);
  const [cursorSync, setCursorSync] = useState(true);

  // ─── .para 메타데이터 로컬 관리 ───
  const paraMetadataRef = useRef(null);

  // viewerImagesRef를 최신 상태와 동기화
  useEffect(() => { viewerImagesRef.current = viewerImages; }, [viewerImages]);

  // ─── 블랙포인트 분석 상태 ───
  const [blackPointInfo, setBlackPointInfo] = useState(null);
  const [blackPointAction, setBlackPointAction] = useState(null);

  // ─── 정렬 인디케이터 상태 ───
  const [alignIndicators, setAlignIndicators] = useState([]);
  const alignOverlayRef = useRef(null);

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
              top: rect.bottom - editorRect.top,
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
            top: rect.bottom - editorRect.top,
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
        top: rect.bottom - editorRect.top,
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
      paraMetadataRef.current.paragraphs[paragraphIndex] = { align: 'center', style: '1' };
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
  const setParagraphStyle = useCallback((paragraphIndex, styleNum) => {
    if (paragraphIndex < 0) return;
    if (!paraMetadataRef.current) {
      paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
    }
    if (!paraMetadataRef.current.paragraphs[paragraphIndex]) {
      paraMetadataRef.current.paragraphs[paragraphIndex] = { align: 'center', style: '1' };
    }
    paraMetadataRef.current.paragraphs[paragraphIndex].style = String(styleNum);
    ipcRenderer.invoke('set-paragraph-meta', { paragraphIndex, key: 'style', value: String(styleNum) });
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
  const handleStyleSelect = useCallback((styleNum) => {
    const paraIdx = getParagraphAtCursor();
    if (paraIdx >= 0) {
      setParagraphStyle(paraIdx, styleNum);
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
      return;
    }
  }, []);

  // ─── Tab 키: 다음 페이지로 이동 + 에디터에 페이지 번호 자동 삽입 ───
  const handleTabNavigation = useCallback((forward) => {
    if (viewerImages.length === 0) return false;

    const sortedPages = viewerImages.map(img => img.page).sort((a, b) => a - b);
    const curPage = lastSyncedPageRef.current || viewerPage;
    const curIdx = sortedPages.indexOf(curPage);
    let targetPage;

    if (forward) {
      // 다음 페이지
      if (curIdx < sortedPages.length - 1) {
        targetPage = sortedPages[curIdx + 1];
      } else if (curIdx === -1 && sortedPages.length > 0) {
        targetPage = sortedPages[0];
      } else {
        return false;
      }
    } else {
      // 이전 페이지
      if (curIdx > 0) {
        targetPage = sortedPages[curIdx - 1];
      } else {
        return false;
      }
    }

    // 이미지 뷰어 페이지 전환
    setViewerPage(targetPage);
    lastSyncedPageRef.current = targetPage;

    if (forward) {
      // 에디터에 해당 페이지 번호 라인이 이미 있는지 확인
      const el = editorRef.current;
      if (el) {
        const divs = el.children;
        let exists = false;
        for (let i = 0; i < divs.length; i++) {
          if (divs[i].classList.contains('line-page-number')) {
            const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
            if (info && info.start === targetPage) {
              exists = true;
              // 이미 존재하면 그 위치로만 스크롤
              scrollEditorToPage(targetPage);
              break;
            }
          }
        }
        if (!exists) {
          // 페이지 번호 자동 삽입
          el.focus();
          document.execCommand('insertText', false, '\n' + String(targetPage) + '\n');
          normalizeBlankLines();
          expandEmptyPages();
          scheduleDecorations();
          setTimeout(() => scrollEditorToPage(targetPage), 50);
        }
      }
    } else {
      scrollEditorToPage(targetPage);
    }

    return true;
  }, [viewerImages, viewerPage, scrollEditorToPage, scheduleDecorations, normalizeBlankLines, expandEmptyPages]);

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
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.stopPropagation();
        e.preventDefault();
        handleSave();
        return;
      }

      // Tab / Shift+Tab → 이미지 뷰어가 열려 있으면 페이지 이동
      if (e.key === 'Tab' && viewerImages.length > 0) {
        const handled = handleTabNavigation(!e.shiftKey);
        if (handled) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
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
        let styleNum = -1;
        if (key >= '1' && key <= '9') {
          styleNum = parseInt(key, 10);
        } else if (key === '0') {
          styleNum = 10;
        }
        if (styleNum > 0) {
          e.stopPropagation();
          e.preventDefault();
          const paraIdx = getParagraphAtCursor();
          if (paraIdx >= 0) {
            setParagraphStyle(paraIdx, styleNum);
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleSave, handleMacroInsert, viewerImages, handleTabNavigation, getParagraphAtCursor, setParagraphAlign, setParagraphStyle]);

  // ─── 커서 이동 (클릭, 방향키) 시 뷰어 동기화 ───
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const handleSelChange = () => {
      syncViewerFromCursor();
    };
    document.addEventListener('selectionchange', handleSelChange);
    return () => document.removeEventListener('selectionchange', handleSelChange);
  }, [syncViewerFromCursor]);

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
          let divA = null, divB = null;
          for (const div of el.children) {
            if (!div.classList.contains('line-page-number')) continue;
            const info = TextProcessUtils.extractPageNumber(div.textContent.trim());
            if (!info) continue;
            if (info.start === pageA && !info.end) divA = div;
            if (info.start === pageB && !info.end) divB = div;
          }

          // "pageA" → "pageA-pageB" 범위 형식으로 변경
          if (divA) {
            divA.textContent = `${pageA}-${pageB}`;
          }

          // "pageB" 블록 제거 (페이지 번호 div + 후속 빈 줄)
          if (divB) {
            const nextSibling = divB.nextSibling;
            divB.remove();
            if (nextSibling && !nextSibling.classList?.contains('line-page-number') &&
                nextSibling.textContent.trim() === '') {
              nextSibling.remove();
            }
          }
        }
        applyDecorations();
      }

      // ── 합페 정보를 .para 메타데이터에 기록 ──
      if (paraMetadataRef.current) {
        if (!paraMetadataRef.current.integral) {
          paraMetadataRef.current.integral = {};
        }
        paraMetadataRef.current.integral.spreads = spreads.map(s => `${s.pageA}-${s.pageB}`).join(',');
        ipcRenderer.invoke('update-para-metadata', {
          integral: { spreads: paraMetadataRef.current.integral.spreads }
        });
      }

      console.log(`합페 감지 완료: ${spreads.map(s => `${s.pageA}-${s.pageB}`).join(', ')}`);
    } catch (error) {
      console.error('합페 감지 실패:', error);
    }
  }, [applyDecorations]);

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

    // 에디터에 이미 존재하는 페이지 번호 수집
    const existingEditorPages = new Set();
    for (const div of el.children) {
      if (div.classList.contains('line-page-number')) {
        const info = TextProcessUtils.extractPageNumber(div.textContent.trim());
        if (info) existingEditorPages.add(info.start);
      }
    }

    // 단일 이미지만 있으면 에디터에 페이지 번호를 삽입하지 않음
    // 여러 장일 때만 에디터에 없는 페이지 번호를 삽입
    const pagesToInsert = imageFiles.length > 1
      ? loadedPages.filter(p => !existingEditorPages.has(p))
      : [];

    if (pagesToInsert.length > 0) {
      // 각 페이지를 번호 순서에 맞는 위치에 삽입
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

        // 이 페이지보다 큰 번호의 첫 번째 기존 페이지 앞에 삽입
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
        if (!inserted) {
          el.appendChild(makePageBlock());
        }
      }

      // DOM 직접 조작했으므로 공백줄 정규화 + 빈 페이지 확장 + 변경 감지
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
    }

    // 커서 배치: 로드한 이미지 페이지 중 "첫 번째 빈 페이지"를 찾는다
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

    analyzeBlackPoint(uniqueNew.length > 0 ? uniqueNew : imageFiles);
    detectSpreads(imageFiles);

    // 이미지 파일명들을 메타데이터에 저장 (같은 디렉토리 전제, 저장 시 포맷 판별)
    if (imageFiles.length > 0) {
      const imageNames = imageFiles.map(img => path.basename(img.filePath)).join(',');

      if (!paraMetadataRef.current) {
        paraMetadataRef.current = ParaFileFormat.createDefaultMetadata();
      }
      paraMetadataRef.current.integral.image = imageNames;

      ipcRenderer.invoke('update-para-metadata', {
        integral: { image: imageNames }
      });
    }
  }, [scheduleDecorations, scrollEditorToPage, applyDecorations, getPlainText, onSavedStateChange, currentFilePath, normalizeBlankLines, expandEmptyPages, analyzeBlackPoint, detectSpreads]);

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
        viewMode: 'editor'
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
        viewMode: 'editor'
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
          currentPage: 0,
          totalPages: pageNumbers.length > 0 ? Math.max(...pageNumbers) : 0,
          paragraphCount: lines.filter(l => l.trim()).length,
          isValid: pageNumbers.length > 0,
        }
      });
    };

    ipcRenderer.on('get-editor-info', handleRequest);
    return () => ipcRenderer.removeListener('get-editor-info', handleRequest);
  }, [currentFilePath, getPlainText]);

  // ─── IPC: 저장 상태 체크 ───
  useEffect(() => {
    const handle = () => {
      ipcRenderer.send('editor-is-saved-result', getPlainText() === initialContentRef.current);
    };
    ipcRenderer.on('editor-is-saved-check', handle);
    return () => ipcRenderer.removeListener('editor-is-saved-check', handle);
  }, [getPlainText]);

  // ─── 렌더링 ───
  const hasImages = viewerImages.length > 0;
  const currentParaStyle = useMemo(() => {
    const paraIdx = getParagraphAtCursor();
    if (paraIdx < 0) return 1;
    return parseInt(ParaFileFormat.getParagraphStyle(paraMetadataRef.current, paraIdx), 10) || 1;
  }, [getParagraphAtCursor, alignIndicators]); // alignIndicators dependency ensures re-render on decoration updates

  return (
    <div className={`text-editor${hasImages ? ' with-image-viewer' : ''}`} data-theme={theme.mode}>
      {/* ── [독립 컨테이너 2] 이미지 뷰어 ── 에디터·툴바와 절대 합치지 말 것 */}
      {hasImages && (
        <ImageViewer
          images={viewerImages}
          currentPage={viewerPage}
          onPageChange={handleViewerPageChange}
          cursorSync={cursorSync}
          onCursorSyncToggle={() => setCursorSync(prev => !prev)}
          blackPointInfo={blackPointInfo}
          levelAdjustment={levelAdjustment}
          icons={icons}
        />
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
            return (
              <div
                key={paragraphIdx}
                className="align-indicator"
                style={{ top: `${top}px` }}
              >
                {/* 기본: 활성 아이콘만 표시 */}
                <span
                  className="align-indicator-btn active"
                  title={`${t(`editor.align.${align}`)} (Alt+${activeBtn.shortcut})`}
                >
                  {activeBtn.icon}
                </span>
                {/* 호버 시 펼침 패널 */}
                <div className="align-indicator-expand">
                  {alignBtns.map(({ key, icon, shortcut }) => (
                    <span
                      key={key}
                      className={`align-indicator-btn${align === key ? ' active' : ''}`}
                      title={`${t(`editor.align.${key}`)} (Alt+${shortcut})`}
                      onMouseDown={(e) => { e.preventDefault(); handleAlignClick(paragraphIdx, key); }}
                    >
                      {icon}
                    </span>
                  ))}
                  <span className="align-indicator-style" title={`${t(`editor.style.preset${style}`)} (Alt+${style === '10' ? '0' : style})`}>
                    {t(`editor.style.preset${style}`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="editor-scrollbar-track" ref={scrollTrackRef}>
          <div className="editor-scrollbar-thumb" ref={scrollThumbRef} />
        </div>
      </div>
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
          <img src={icons?.fileOpen} alt="Image Folder" className="icon" />
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
          <span className="editor-toolbar-style-label">S</span>
        </button>
      </div>
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
        activeStyleIndex={currentParaStyle}
      />
    </div>
  );
}

export default TextEditor;