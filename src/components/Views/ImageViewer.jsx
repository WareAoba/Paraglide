import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readPsd } from 'ag-psd';
import AutomationPanel from './AutomationPanel';
import useEditorStore from '../../stores/useEditorStore';
import useIconStore from '../../stores/useIconStore';
import '../../CSS/Views/ImageViewer.css';

const path = window.require('path');
const fs = window.require('fs');

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.psd': 'image/vnd.adobe.photoshop'
};

/**
 * PSD 버퍼를 파싱하여 합성 이미지 data URL을 반환한다.
 * @param {Buffer} buffer
 * @param {boolean} backgroundOnly - true이면 배경 레이어만 렌더링
 * @returns {string} data URL (image/png)
 */
function renderPsdToDataUrl(buffer, backgroundOnly = false) {
  const psd = readPsd(new Uint8Array(buffer));

  if (!backgroundOnly) {
    return psd.canvas.toDataURL('image/png');
  }

  // 배경 레이어 탐색: 이름이 Background/배경인 레이어 또는 맨 아래 레이어
  const children = psd.children || [];
  const bgLayer = children.find(l =>
    /^(Background|배경)$/i.test(l.name)
  ) || children[children.length - 1];

  if (!bgLayer?.canvas) {
    return psd.canvas.toDataURL('image/png');
  }

  const canvas = document.createElement('canvas');
  canvas.width = psd.width;
  canvas.height = psd.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bgLayer.canvas, bgLayer.left || 0, bgLayer.top || 0);
  return canvas.toDataURL('image/png');
}

/**
 * 파일명에서 페이지 번호를 추출한다.
 * 예: "001.jpg" → 1, "page_05.png" → 5, "vol1_p012.webp" → 12
 */
function extractPageFromFilename(filename) {
  const name = path.basename(filename, path.extname(filename));
  // 마지막으로 등장하는 연속 숫자를 페이지 번호로 사용
  const matches = name.match(/(\d+)/g);
  if (!matches) return 0;
  return parseInt(matches[matches.length - 1], 10);
}

/**
 * 이미지의 레벨을 조정하여 블랙포인트를 순수 블랙에 맞춘다.
 * [blackPoint, 255] → [0, 255] 선형 매핑
 */
function applyLevelAdjustment(dataUrl, blackPoint) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        const rMin = blackPoint.r, gMin = blackPoint.g, bMin = blackPoint.b;
        const rRange = (255 - rMin) || 1;
        const gRange = (255 - gMin) || 1;
        const bRange = (255 - bMin) || 1;
        for (let i = 0; i < d.length; i += 4) {
          d[i]     = Math.max(0, Math.min(255, Math.round((d[i] - rMin) * 255 / rRange)));
          d[i + 1] = Math.max(0, Math.min(255, Math.round((d[i + 1] - gMin) * 255 / gRange)));
          d[i + 2] = Math.max(0, Math.min(255, Math.round((d[i + 2] - bMin) * 255 / bRange)));
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function ImageViewer({ onPageChange, onRemoveCurrentImage, onCursorSyncToggle, levelAdjustment, automationActions, style }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const automationBtnRef = useRef(null);

  // ─── Zustand 스토어에서 상태 구독 ───
  const icons = useIconStore((s) => s.icons);
  const images = useEditorStore((s) => s.viewerImages);
  const currentPage = useEditorStore((s) => s.viewerPage);
  const cursorSync = useEditorStore((s) => s.cursorSync);
  const blackPointInfo = useEditorStore((s) => s.blackPointInfo);
  const spreadPairs = useEditorStore((s) => s.spreadPairs);

  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const pageInput = useEditorStore((s) => s.pageInput);
  const setPageInput = useEditorStore((s) => s.setPageInput);
  const isPageInputVisible = useEditorStore((s) => s.isPageInputVisible);
  const setIsPageInputVisible = useEditorStore((s) => s.setIsPageInputVisible);
  const automationOpen = useEditorStore((s) => s.automationOpen);
  const setAutomationOpen = useEditorStore((s) => s.setAutomationOpen);
  const spreadDataUrl = useEditorStore((s) => s.spreadDataUrl);
  const setSpreadDataUrl = useEditorStore((s) => s.setSpreadDataUrl);
  const psdBackgroundOnly = useEditorStore((s) => s.psdBackgroundOnly);
  const setPsdBackgroundOnly = useEditorStore((s) => s.setPsdBackgroundOnly);
  const imageDataUrl = useEditorStore((s) => s.imageDataUrl);
  const setImageDataUrl = useEditorStore((s) => s.setImageDataUrl);

  const [dragState, setDragState] = useState(null);   // { startX, startY, scrollLeft, scrollTop }

  // ─── 합페 맵 ───
  const spreadMap = useMemo(() => {
    const map = new Map();
    if (spreadPairs) {
      for (const { pageA, pageB } of spreadPairs) {
        map.set(pageA, pageB);
      }
    }
    return map;
  }, [spreadPairs]);

  const reverseSpreadMap = useMemo(() => {
    const map = new Map();
    if (spreadPairs) {
      for (const { pageA, pageB } of spreadPairs) {
        map.set(pageB, pageA);
      }
    }
    return map;
  }, [spreadPairs]);

  const consumedPages = useMemo(() => {
    const set = new Set();
    if (spreadPairs) {
      for (const { pageB } of spreadPairs) {
        set.add(pageB);
      }
    }
    return set;
  }, [spreadPairs]);

  // 정렬된 이미지 목록 (페이지 번호순)
  const sortedImages = useMemo(() => {
    if (!images || images.length === 0) return [];
    return [...images].sort((a, b) => a.page - b.page);
  }, [images]);

  const currentIndex = useMemo(() => {
    if (sortedImages.length === 0) return -1;
    const idx = sortedImages.findIndex(img => img.page === currentPage);
    return idx >= 0 ? idx : 0;
  }, [sortedImages, currentPage]);

  const currentImage = currentIndex >= 0 ? sortedImages[currentIndex] : null;

  // ─── 현재 이미지가 PSD인지 여부 ───
  const isPsdFile = currentImage && path.extname(currentImage.filePath).toLowerCase() === '.psd';

  // ─── 이미지 data URL 로드 ───

  useEffect(() => {
    if (!currentImage) { setImageDataUrl(null); return; }
    let canceled = false;

    (async () => {
      try {
        const buffer = await fs.promises.readFile(currentImage.filePath);
        if (canceled) return;
        const ext = path.extname(currentImage.filePath).toLowerCase();
        let dataUrl;

        if (ext === '.psd') {
          dataUrl = renderPsdToDataUrl(buffer, psdBackgroundOnly);
        } else {
          const mime = MIME_TYPES[ext] || 'image/jpeg';
          const base64 = buffer.toString('base64');
          dataUrl = `data:${mime};base64,${base64}`;
        }

        if (levelAdjustment?.enabled && levelAdjustment.blackPoint) {
          dataUrl = await applyLevelAdjustment(dataUrl, levelAdjustment.blackPoint);
          if (canceled) return;
        }

        setImageDataUrl(dataUrl);
      } catch {
        if (!canceled) setImageDataUrl(null);
      }
    })();

    return () => { canceled = true; };
  }, [currentImage, levelAdjustment, psdBackgroundOnly]);

  // ─── 합페: pageB → pageA 리다이렉트 ───
  useEffect(() => {
    const redirectTo = reverseSpreadMap.get(currentPage);
    if (redirectTo != null && onPageChange) {
      onPageChange(redirectTo);
    }
  }, [currentPage, reverseSpreadMap, onPageChange]);

  // ─── 합페: 파트너 이미지 로드 ───
  const spreadPartnerPage = spreadMap.get(currentPage);
  const isSpreadView = spreadPartnerPage != null;
  const partnerImage = isSpreadView
    ? sortedImages.find(img => img.page === spreadPartnerPage)
    : null;

  useEffect(() => {
    if (!partnerImage) { setSpreadDataUrl(null); return; }
    let canceled = false;

    (async () => {
      try {
        const buffer = await fs.promises.readFile(partnerImage.filePath);
        if (canceled) return;
        const ext = path.extname(partnerImage.filePath).toLowerCase();
        let dataUrl;

        if (ext === '.psd') {
          dataUrl = renderPsdToDataUrl(buffer, psdBackgroundOnly);
        } else {
          const mime = MIME_TYPES[ext] || 'image/jpeg';
          const base64 = buffer.toString('base64');
          dataUrl = `data:${mime};base64,${base64}`;
        }

        if (levelAdjustment?.enabled && levelAdjustment.blackPoint) {
          dataUrl = await applyLevelAdjustment(dataUrl, levelAdjustment.blackPoint);
          if (canceled) return;
        }

        setSpreadDataUrl(dataUrl);
      } catch {
        if (!canceled) setSpreadDataUrl(null);
      }
    })();

    return () => { canceled = true; };
  }, [partnerImage, levelAdjustment, psdBackgroundOnly]);

  // ─── 페이지 이동 (합페 pageB 건너뛰기) ───
  const goToPage = useCallback((page) => {
    if (onPageChange) onPageChange(page);
  }, [onPageChange]);

  const hasNext = useMemo(() => {
    for (let i = currentIndex + 1; i < sortedImages.length; i++) {
      if (!consumedPages.has(sortedImages[i].page)) return true;
    }
    return false;
  }, [currentIndex, sortedImages, consumedPages]);

  const hasPrev = useMemo(() => {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (!consumedPages.has(sortedImages[i].page)) return true;
    }
    return false;
  }, [currentIndex, sortedImages, consumedPages]);

  const goNext = useCallback(() => {
    for (let i = currentIndex + 1; i < sortedImages.length; i++) {
      if (!consumedPages.has(sortedImages[i].page)) {
        goToPage(sortedImages[i].page);
        return;
      }
    }
  }, [currentIndex, sortedImages, goToPage, consumedPages]);

  const goPrev = useCallback(() => {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (!consumedPages.has(sortedImages[i].page)) {
        goToPage(sortedImages[i].page);
        return;
      }
    }
  }, [currentIndex, sortedImages, goToPage, consumedPages]);

  // ─── 페이지 점프 (합페 리다이렉트) ───
  const handlePageInputSubmit = useCallback(() => {
    const num = parseInt(pageInput, 10);
    if (!isNaN(num)) {
      const redirected = reverseSpreadMap.get(num) ?? num;
      const target = sortedImages.find(img => img.page === redirected);
      if (target) goToPage(target.page);
    }
    setPageInput('');
    setIsPageInputVisible(false);
  }, [pageInput, sortedImages, goToPage, reverseSpreadMap]);

  const handlePageInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePageInputSubmit();
    } else if (e.key === 'Escape') {
      setPageInput('');
      setIsPageInputVisible(false);
    }
  }, [handlePageInputSubmit]);

  // ─── fit 배율 계산 (이미지 자연 크기 vs 컨테이너) ───
  const getFitZoom = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth) return 100;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const fitByWidth = cW / img.naturalWidth * 100;
    const fitByHeight = cH / img.naturalHeight * 100;
    return Math.round(Math.min(fitByWidth, fitByHeight));
  }, []);

  // ─── 휠 동작: Ctrl=줌(마우스 기준), Shift=좌우 스크롤, 기본=상하 스크롤 ───
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const contentX = container.scrollLeft + mouseX;
      const contentY = container.scrollTop + mouseY;

      const base = useEditorStore.getState().zoom ?? getFitZoom();
      const delta = e.deltaY > 0 ? -10 : 10;
      const newZoom = Math.max(20, Math.min(500, base + delta));
      const scale = newZoom / base;

      container.scrollLeft = contentX * scale - mouseX;
      container.scrollTop = contentY * scale - mouseY;

      setZoom(newZoom);
    } else if (e.shiftKey) {
      e.preventDefault();
      const container = containerRef.current;
      if (container) {
        container.scrollLeft += e.deltaY;
      }
    }
    // else: 기본 동작 (상하 스크롤)
  }, [getFitZoom]);

  const handleZoomIn = useCallback(() => {
    const cur = useEditorStore.getState().zoom;
    setZoom(Math.min(500, (cur ?? getFitZoom()) + 10));
  }, [getFitZoom]);

  const handleZoomOut = useCallback(() => {
    const cur = useEditorStore.getState().zoom;
    setZoom(Math.max(20, (cur ?? getFitZoom()) - 10));
  }, [getFitZoom]);

  // ─── 블랙포인트 색상값 클립보드 복사 ───
  const handleCopyBlackPoint = useCallback(() => {
    if (!blackPointInfo?.blackPoint?.hex) return;
    const { clipboard } = window.require('electron');
    const hex = levelAdjustment?.enabled ? '#000000' : blackPointInfo.blackPoint.hex;
    clipboard.writeText(hex);
  }, [blackPointInfo, levelAdjustment]);

  // ─── 드래그로 스크롤 (줌 상태에서) / 휠 클릭으로 fit ───
  const handleMouseDown = useCallback((e) => {
    if (e.button === 1) {
      e.preventDefault();
      setZoom(null);
      return;
    }
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    setDragState({
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop
    });
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!dragState) return;
    const container = containerRef.current;
    if (!container) return;
    container.scrollLeft = dragState.scrollLeft - (e.clientX - dragState.startX);
    container.scrollTop = dragState.scrollTop - (e.clientY - dragState.startY);
  }, [dragState]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  // 페이지 변경 시 스크롤·줌 리셋
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
    setZoom(null);
  }, [currentPage]);

  // ─── 현재 페이지의 블랙포인트 정보 (레벨 조정 시 보정) ───
  const currentPageBPInfo = useMemo(() => {
    if (!blackPointInfo?.perPage || !currentImage) return null;
    const raw = blackPointInfo.perPage.get(currentImage.page) ?? null;
    if (!raw) return null;
    if (levelAdjustment?.enabled) {
      return { ...raw, blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' } };
    }
    return raw;
  }, [blackPointInfo, currentImage, levelAdjustment]);

  if (!sortedImages || sortedImages.length === 0) {
    return (
      <div className="image-viewer image-viewer--empty" style={style}>
        <div className="image-viewer__placeholder">
          <span>{t('imageViewer.empty')}</span>
        </div>
      </div>
    );
  }

  const isFitMode = zoom === null;
  const displayZoom = zoom ?? 100;

  return (
    <div className="image-viewer" style={style}>
      {/* 네비게이션 바 */}
      <div className="image-viewer__nav">
        {sortedImages.length > 1 && (
          <>
            <button
              className="image-viewer__nav-btn"
              onClick={goPrev}
              disabled={!hasPrev}
              title={t('imageViewer.prevPage')}
            >
              ◀
            </button>
            {isPageInputVisible ? (
              <input
                className="image-viewer__page-input"
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={handlePageInputKeyDown}
                onBlur={handlePageInputSubmit}
                autoFocus
                placeholder={String(currentImage?.page ?? '')}
              />
            ) : (
              <span
                className="image-viewer__page-info"
                onClick={() => setIsPageInputVisible(true)}
                title={t('imageViewer.pageInputHint')}
              >
                {currentImage ? (isSpreadView ? `${currentImage.page}-${spreadPartnerPage}` : currentImage.page) : '-'} / {sortedImages[sortedImages.length - 1].page}
                <span className="image-viewer__page-sub">
                  ({currentIndex + 1}/{sortedImages.length})
                </span>
              </span>
            )}
            <button
              className="image-viewer__nav-btn"
              onClick={goNext}
              disabled={!hasNext}
              title={t('imageViewer.nextPage')}
            >
              ▶
            </button>
          </>
        )}

        {/* 커서 동기화 토글 */}
        {sortedImages.length > 1 && (
          <button
            className={`image-viewer__nav-btn image-viewer__sync-btn${cursorSync ? ' is-active' : ''}`}
            onClick={onCursorSyncToggle}
            title={t(cursorSync ? 'imageViewer.cursorSyncOn' : 'imageViewer.cursorSyncOff')}
          >
            {icons?.locate
              ? <img src={icons.locate} alt="Sync" className="image-viewer__sync-icon" />
              : '⊙'}
          </button>
        )}

        {/* 파일명 */}
        {currentImage && (
          <span className="image-viewer__filename" title={currentImage.filePath}>
            {path.basename(currentImage.filePath)}
          </span>
        )}

        {/* PSD 배경 레이어만 보기 토글 */}
        {isPsdFile && (
          <button
            className={`image-viewer__nav-btn image-viewer__psd-bg-btn${psdBackgroundOnly ? ' is-active' : ''}`}
            onClick={() => setPsdBackgroundOnly(!psdBackgroundOnly)}
            title={t(psdBackgroundOnly ? 'imageViewer.showAllLayers' : 'imageViewer.showBgOnly')}
          >
            BG
          </button>
        )}

        {/* 줌 컨트롤 */}
        <div className="image-viewer__zoom-controls">
          <button className="image-viewer__zoom-btn" onClick={handleZoomOut} title={t('imageViewer.zoomOut')}>
            {icons?.zoomOut
              ? <img src={icons.zoomOut} alt="−" className="image-viewer__zoom-icon" />
              : '−'}
          </button>
          <span
            className="image-viewer__zoom-info"
            onClick={() => setZoom(null)}
            title={t('imageViewer.resetZoom')}
          >
            {isFitMode ? 'Fit' : `${displayZoom}%`}
          </span>
          <button className="image-viewer__zoom-btn" onClick={handleZoomIn} title={t('imageViewer.zoomIn')}>
            {icons?.zoomIn
              ? <img src={icons.zoomIn} alt="+" className="image-viewer__zoom-icon" />
              : '+'}
          </button>
        </div>
      </div>

      {/* 이미지 영역 */}
      <div className="image-viewer__canvas-wrapper">
        {onRemoveCurrentImage && currentImage && (
          <button
            className="image-viewer__remove-btn"
            onClick={onRemoveCurrentImage}
            title={t('imageViewer.removeImage')}
          >
            {icons?.delete
              ? <img src={icons.delete} alt="Remove" className="image-viewer__remove-icon" />
              : '✕'}
          </button>
        )}
        <div
          ref={containerRef}
          className="image-viewer__canvas"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          style={{ cursor: dragState ? 'grabbing' : (!isFitMode && displayZoom > 100 ? 'grab' : 'default') }}
        >
        {isSpreadView && currentImage && imageDataUrl && spreadDataUrl ? (
          <div className={`image-viewer__spread${isFitMode ? ' image-viewer__spread--fit' : ''}`}
               style={isFitMode ? undefined : { width: `${displayZoom}%` }}>
            <img
              className={`image-viewer__img${isFitMode ? ' image-viewer__img--fit' : ''}`}
              src={spreadDataUrl}
              alt={`Page ${spreadPartnerPage}`}
              draggable={false}
            />
            <img
              ref={imgRef}
              className={`image-viewer__img${isFitMode ? ' image-viewer__img--fit' : ''}`}
              src={imageDataUrl}
              alt={`Page ${currentImage.page}`}
              draggable={false}
            />
          </div>
        ) : currentImage && imageDataUrl ? (
          <img
            ref={imgRef}
            className={`image-viewer__img${isFitMode ? ' image-viewer__img--fit' : ''}`}
            src={imageDataUrl}
            alt={`Page ${currentImage.page}`}
            style={isFitMode ? undefined : { width: `${displayZoom}%` }}
            draggable={false}
          />
        ) : null}
        </div>
      </div>

      {/* 하단 상태 바 */}
      <div className="image-viewer__status-bar">
        {currentPageBPInfo ? (
          <>
            <span className={`image-viewer__color-badge ${currentPageBPInfo.isGrayscale ? 'is-grayscale' : 'is-color'}`}>
              {t(currentPageBPInfo.isGrayscale ? 'imageViewer.grayscale' : 'imageViewer.color')}
            </span>
            <div className="image-viewer__black-point">
              <span
                className="image-viewer__bp-swatch"
                style={{ backgroundColor: currentPageBPInfo.blackPoint.hex }}
              />
              <span className="image-viewer__bp-hex">BP {currentPageBPInfo.blackPoint.hex}</span>
              <button
                className="image-viewer__bp-copy"
                onClick={handleCopyBlackPoint}
                title={t('imageViewer.copyColor')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          </>
        ) : blackPointInfo ? (
          <>
            <span className={`image-viewer__color-badge ${blackPointInfo.isGrayscale ? 'is-grayscale' : 'is-color'}`}>
              {t(blackPointInfo.isGrayscale ? 'imageViewer.grayscale' : 'imageViewer.color')}
            </span>
            <div className="image-viewer__black-point">
              <span
                className="image-viewer__bp-swatch"
                style={{ backgroundColor: levelAdjustment?.enabled ? '#000000' : blackPointInfo.blackPoint.hex }}
              />
              <span className="image-viewer__bp-hex">BP {levelAdjustment?.enabled ? '#000000' : blackPointInfo.blackPoint.hex}</span>
              <button
                className="image-viewer__bp-copy"
                onClick={handleCopyBlackPoint}
                title={t('imageViewer.copyColor')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          </>
        ) : null}

        {/* 자동화 버튼 (상태 바 오른쪽 끝) */}
        <button
          ref={automationBtnRef}
          className={`image-viewer__automation-btn${automationOpen ? ' is-active' : ''}`}
          onClick={() => setAutomationOpen(!automationOpen)}
          title="Automation"
        >
          {icons?.automation
            ? <img src={icons.automation} alt="Automation" className="image-viewer__automation-icon" />
            : '⚙'}
        </button>
      </div>

      {/* 자동화 패널 */}
      <AutomationPanel
        isOpen={automationOpen}
        onClose={() => setAutomationOpen(false)}
        actions={automationActions}
        anchorRef={automationBtnRef}
      />
    </div>
  );
}

ImageViewer.extractPageFromFilename = extractPageFromFilename;

export default ImageViewer;
