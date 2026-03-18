import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import '../../CSS/Views/ImageViewer.css';

const path = window.require('path');
const fs = window.require('fs');

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

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

function ImageViewer({ images, currentPage, onPageChange, cursorSync, onCursorSyncToggle, blackPointInfo, levelAdjustment, icons }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(null);             // null = 비율 유지 최대 채움 (fit)
  const [dragState, setDragState] = useState(null);   // { startX, startY, scrollLeft, scrollTop }
  const [pageInput, setPageInput] = useState('');
  const [isPageInputVisible, setIsPageInputVisible] = useState(false);

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

  // ─── 이미지 data URL 캐시 ───
  const [imageDataUrl, setImageDataUrl] = useState(null);

  useEffect(() => {
    if (!currentImage) { setImageDataUrl(null); return; }
    let canceled = false;

    (async () => {
      try {
        const buffer = await fs.promises.readFile(currentImage.filePath);
        if (canceled) return;
        const ext = path.extname(currentImage.filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'image/jpeg';
        const base64 = buffer.toString('base64');
        let dataUrl = `data:${mime};base64,${base64}`;

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
  }, [currentImage, levelAdjustment]);

  // ─── 페이지 이동 ───
  const goToPage = useCallback((page) => {
    if (onPageChange) onPageChange(page);
  }, [onPageChange]);

  const goNext = useCallback(() => {
    if (currentIndex < sortedImages.length - 1) {
      goToPage(sortedImages[currentIndex + 1].page);
    }
  }, [currentIndex, sortedImages, goToPage]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      goToPage(sortedImages[currentIndex - 1].page);
    }
  }, [currentIndex, sortedImages, goToPage]);

  // ─── 페이지 점프 ───
  const handlePageInputSubmit = useCallback(() => {
    const num = parseInt(pageInput, 10);
    if (!isNaN(num)) {
      const target = sortedImages.find(img => img.page === num);
      if (target) goToPage(target.page);
    }
    setPageInput('');
    setIsPageInputVisible(false);
  }, [pageInput, sortedImages, goToPage]);

  const handlePageInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePageInputSubmit();
    } else if (e.key === 'Escape') {
      setPageInput('');
      setIsPageInputVisible(false);
    }
  }, [handlePageInputSubmit]);

  // ─── Ctrl+휠 줌 ───
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      setZoom(prev => {
        const base = prev ?? 100;
        const delta = e.deltaY > 0 ? -10 : 10;
        return Math.max(20, Math.min(500, base + delta));
      });
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(500, (prev ?? 100) + 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(20, (prev ?? 100) - 10));
  }, []);

  // ─── 블랙포인트 색상값 클립보드 복사 ───
  const handleCopyBlackPoint = useCallback(() => {
    if (!blackPointInfo?.blackPoint?.hex) return;
    const { clipboard } = window.require('electron');
    clipboard.writeText(blackPointInfo.blackPoint.hex);
  }, [blackPointInfo]);

  // ─── 드래그로 스크롤 (줌 상태에서) ───
  const handleMouseDown = useCallback((e) => {
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

  // ─── 현재 페이지의 블랙포인트 정보 ───
  const currentPageBPInfo = useMemo(() => {
    if (!blackPointInfo?.perPage || !currentImage) return null;
    return blackPointInfo.perPage.get(currentImage.page) ?? null;
  }, [blackPointInfo, currentImage]);

  if (!sortedImages || sortedImages.length === 0) {
    return (
      <div className="image-viewer image-viewer--empty">
        <div className="image-viewer__placeholder">
          <span>이미지 없음</span>
        </div>
      </div>
    );
  }

  const isFitMode = zoom === null;
  const displayZoom = zoom ?? 100;

  return (
    <div className="image-viewer">
      {/* 네비게이션 바 */}
      <div className="image-viewer__nav">
        {sortedImages.length > 1 && (
          <>
            <button
              className="image-viewer__nav-btn"
              onClick={goPrev}
              disabled={currentIndex <= 0}
              title="이전 페이지"
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
                title="클릭하여 페이지 번호 입력"
              >
                {currentImage ? currentImage.page : '-'} / {sortedImages[sortedImages.length - 1].page}
                <span className="image-viewer__page-sub">
                  ({currentIndex + 1}/{sortedImages.length})
                </span>
              </span>
            )}
            <button
              className="image-viewer__nav-btn"
              onClick={goNext}
              disabled={currentIndex >= sortedImages.length - 1}
              title="다음 페이지"
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
            title={cursorSync ? '커서 동기화 켜짐' : '커서 동기화 꺼짐'}
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

        {/* 줌 컨트롤 */}
        <div className="image-viewer__zoom-controls">
          <button className="image-viewer__zoom-btn" onClick={handleZoomOut} title="축소">
            {icons?.zoomOut
              ? <img src={icons.zoomOut} alt="−" className="image-viewer__zoom-icon" />
              : '−'}
          </button>
          <span
            className="image-viewer__zoom-info"
            onClick={() => setZoom(null)}
            title="맞춤 크기로 초기화"
          >
            {isFitMode ? 'Fit' : `${displayZoom}%`}
          </span>
          <button className="image-viewer__zoom-btn" onClick={handleZoomIn} title="확대">
            {icons?.zoomIn
              ? <img src={icons.zoomIn} alt="+" className="image-viewer__zoom-icon" />
              : '+'}
          </button>
        </div>
      </div>

      {/* 이미지 영역 */}
      <div
        ref={containerRef}
        className="image-viewer__canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{ cursor: dragState ? 'grabbing' : (!isFitMode && displayZoom > 100 ? 'grab' : 'default') }}
      >
        {currentImage && imageDataUrl && (
          <img
            ref={imgRef}
            className={`image-viewer__img${isFitMode ? ' image-viewer__img--fit' : ''}`}
            src={imageDataUrl}
            alt={`Page ${currentImage.page}`}
            style={isFitMode ? undefined : { width: `${displayZoom}%` }}
            draggable={false}
          />
        )}
      </div>

      {/* 하단 상태 바 */}
      <div className="image-viewer__status-bar">
        {currentPageBPInfo ? (
          <>
            <span className={`image-viewer__color-badge ${currentPageBPInfo.isGrayscale ? 'is-grayscale' : 'is-color'}`}>
              {currentPageBPInfo.isGrayscale ? '흑백' : '컬러'}
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
                title="색상값 복사"
              >
                📋
              </button>
            </div>
          </>
        ) : blackPointInfo ? (
          <>
            <span className={`image-viewer__color-badge ${blackPointInfo.isGrayscale ? 'is-grayscale' : 'is-color'}`}>
              {blackPointInfo.isGrayscale ? '흑백' : '컬러'}
            </span>
            <div className="image-viewer__black-point">
              <span
                className="image-viewer__bp-swatch"
                style={{ backgroundColor: blackPointInfo.blackPoint.hex }}
              />
              <span className="image-viewer__bp-hex">BP {blackPointInfo.blackPoint.hex}</span>
              <button
                className="image-viewer__bp-copy"
                onClick={handleCopyBlackPoint}
                title="색상값 복사"
              >
                📋
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

ImageViewer.extractPageFromFilename = extractPageFromFilename;

export default ImageViewer;
