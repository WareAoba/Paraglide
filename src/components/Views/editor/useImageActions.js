import { useCallback, useMemo, useEffect } from 'react';
import useEditorStore from '../../../stores/useEditorStore';
import useAppStore from '../../../stores/useAppStore';
import ImageViewer from '../ImageViewer';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');
const fs = window.require('fs');
const _appBase = process.env.NODE_ENV === 'development'
  ? process.cwd()
  : path.join(process.resourcesPath, 'app.asar');
const { BlackPointAnalyzer } = window.require(
  path.join(_appBase, 'src', 'utils', 'BlackPointAnalyzer')
);
const { SpreadDetector } = window.require(
  path.join(_appBase, 'src', 'utils', 'SpreadDetector')
);
const { ParaFileFormat } = window.require(
  path.join(_appBase, 'src', 'utils', 'ParaFileFormat')
);
const { DpiAdjuster } = window.require(
  path.join(_appBase, 'src', 'utils', 'DpiAdjuster')
);
const { TextProcessUtils } = window.require(
  path.join(_appBase, 'src', 'utils', 'TextProcessUtils')
);

import { readPsd } from 'ag-psd';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.psd'];
const MIME_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.psd': 'image/vnd.adobe.photoshop' };

/**
 * 이미지 관련 액션 훅: 블랙포인트 분석, 합페 감지, 페이지 넘버링, 메타데이터 저장, DPI 조정, 이미지 로드
 */
export default function useImageActions({
  editorRef,
  paraMetadataRef,
  viewerImagesRef,
  lastSyncedPageRef,
  isSavedRef,
  initialContentRef,
  automationAutoRef,
  // 에디터 core 함수들
  applyDecorations,
  expandEmptyPages,
  normalizeBlankLines,
  getPlainText,
  scrollEditorToPage,
  // 콜백
  onSavedStateChange,
  handleAutomationAutoChange,
}) {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const setViewerImages = useEditorStore((s) => s.setViewerImages);
  const setViewerPage = useEditorStore((s) => s.setViewerPage);
  const viewerPage = useEditorStore((s) => s.viewerPage);
  const setBlackPointInfo = useEditorStore((s) => s.setBlackPointInfo);
  const setBlackPointAction = useEditorStore((s) => s.setBlackPointAction);
  const setMetaImage = useEditorStore((s) => s.setMetaImage);

  // ─── 블랙포인트 분석 ───
  const analyzeBlackPoint = useCallback(async (imageFiles, { silent = false } = {}) => {
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

        if (paraMetadataRef.current) {
          if (!paraMetadataRef.current.pages.has(page)) {
            paraMetadataRef.current.pages.set(page, { blackpoint: '#000000' });
          }
          paraMetadataRef.current.pages.get(page).blackpoint = hex;
        }
        ipcRenderer.invoke('set-page-blackpoint', { pageNumber: page, blackpoint: hex });
      }

      if (!silent && !result.isPureBlack) {
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

      const el = editorRef.current;
      if (el) {
        for (const { pageA, pageB } of spreads) {
          const divs = el.children;
          let divA = null, divB = null, divBIdx = -1;
          for (let i = 0; i < divs.length; i++) {
            if (!divs[i].classList.contains('line-page-number')) continue;
            const info = TextProcessUtils.extractPageNumber(divs[i].textContent.trim());
            if (!info) continue;
            if (info.start === pageA && info.start === info.end) { divA = divs[i]; }
            if (info.start === pageB && info.start === info.end) { divB = divs[i]; divBIdx = i; }
          }

          if (divA) {
            divA.textContent = `${pageA}-${pageB}`;
          }

          if (divB && divBIdx > 0) {
            const contentNodes = [];
            const divs2 = el.children;
            for (let j = divBIdx + 1; j < divs2.length; j++) {
              if (divs2[j].classList.contains('line-page-number')) break;
              contentNodes.push(divs2[j]);
            }

            while (divB.previousSibling && divB.previousSibling !== divA &&
                   !divB.previousSibling.classList?.contains('line-page-number') &&
                   !divB.previousSibling.textContent.trim()) {
              divB.previousSibling.remove();
            }

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
    onAutoSettingsChange: handleAutomationAutoChange,
  }), [saveImageMetadata, insertPageNumbers, detectSpreads, adjustDpiTo72, handleAutomationAutoChange]);

  // ─── 이미지 파일 로드 ───
  const loadImageFiles = useCallback((filePaths, { fromParaMeta = false } = {}) => {
    const newFiles = filePaths
      .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map(f => ({
        filePath: f,
        filename: path.basename(f),
        page: ImageViewer.extractPageFromFilename(f)
      }));

    const prevImages = viewerImagesRef.current || [];
    const existingPaths = new Set(prevImages.map(img => img.filePath));
    const uniqueNew = newFiles.filter(f => !existingPaths.has(f.filePath));
    const merged = [...prevImages, ...uniqueNew];

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

    // 최초 로드 시 창 확장
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
          imgWidth = null;
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

    const newLoadedPages = uniqueNew.map(img => img.page);
    const loadedPages = imageFiles.map(img => img.page);
    const firstNewPage = newLoadedPages.length > 0 ? newLoadedPages[0] : loadedPages[0];

    setViewerPage(firstNewPage);
    lastSyncedPageRef.current = firstNewPage;

    const el = editorRef.current;
    if (!el) return;

    // ─── 자동화 설정에 따른 조건부 실행 ───
    const autoSettings = automationAutoRef.current;

    if (autoSettings.numbering) {
      insertPageNumbers(imageFiles);
    }

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

    analyzeBlackPoint(uniqueNew.length > 0 ? uniqueNew : imageFiles, { silent: fromParaMeta });

    if (autoSettings.metadata) {
      saveImageMetadata(uniqueNew.length > 0 ? uniqueNew : imageFiles);
    }

    if (autoSettings.spread) {
      detectSpreads(imageFiles);
    }

    if (autoSettings.dpi) {
      adjustDpiTo72(imageFiles);
    }
  }, [scrollEditorToPage, applyDecorations, getPlainText, onSavedStateChange, currentFilePath, normalizeBlankLines, expandEmptyPages, analyzeBlackPoint, detectSpreads, insertPageNumbers, saveImageMetadata, adjustDpiTo72]);

  // ─── IPC/이벤트: 이미지 파일 열기 ───
  useEffect(() => {
    const handleOpenImageFiles = (_, filePaths) => {
      if (Array.isArray(filePaths) && filePaths.length > 0) {
        loadImageFiles(filePaths);
      }
    };
    const handleEditorLoadImages = (e) => {
      if (Array.isArray(e.detail) && e.detail.length > 0) {
        loadImageFiles(e.detail);
      }
    };

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
    const prev = viewerImagesRef.current || [];
    const remaining = prev.filter(img => img.page !== curPage);
    if (remaining.length === 0) {
      closeImageViewer();
      return;
    }
    const sorted = [...remaining].sort((a, b) => a.page - b.page);
    const next = sorted.find(img => img.page > curPage) || sorted[sorted.length - 1];
    setViewerImages(remaining);
    setViewerPage(next.page);
  }, [viewerPage, closeImageViewer]);

  // ─── 이미지 파일 선택 다이얼로그 ───
  const openImageFiles = useCallback(async () => {
    const result = await ipcRenderer.invoke('open-image-files');
    if (result) {
      loadImageFiles(result);
    }
  }, [loadImageFiles]);

  return {
    analyzeBlackPoint,
    detectSpreads,
    insertPageNumbers,
    saveImageMetadata,
    adjustDpiTo72,
    automationActions,
    loadImageFiles,
    closeImageViewer,
    removeCurrentImage,
    openImageFiles,
  };
}
