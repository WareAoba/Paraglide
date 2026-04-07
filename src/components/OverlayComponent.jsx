// OverlayComponent.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import useIconStore from "../stores/useIconStore";
import useOverlayIPC from "../hooks/useOverlayIPC";
import useAppStore from "../stores/useAppStore";
import "../CSS/OverlayComponent.css";
const { ipcRenderer } = window.require("electron");

function OverlayComponent() {
  const { t } = useTranslation();
  const icons = useIconStore((s) => s.icons);
  const loadIcons = useIconStore((s) => s.loadIcons);
  useEffect(() => { loadIcons(); }, [loadIcons]);
  const [pausePhase, setPausePhase] = useState('active'); // 'active' | 'paused' | 'resuming'
  const prevPausedRef = useRef(false);
  const draggedRef = useRef(false);
  const containerRef = useRef(null);

  // ─── IPC→Zustand 동기화 (오버레이 전용) ───
  useOverlayIPC();

  // ─── Zustand 스토어에서 상태 구독 ───
  const theme = useAppStore((s) => s.theme);
  const isPaused = useAppStore((s) => s.isPaused);
  const pluginConnected = useAppStore((s) => s.pluginConnected);
  const pluginModeActive = useAppStore((s) => s.pluginModeActive);
  const pluginServer = useAppStore((s) => s.pluginServer);
  const oc = useAppStore((s) => s.overlayContent);

  // 수동 윈도우 드래그 (transparent frameless window에서 -webkit-app-region 불안정 대응)
  const onClickActionRef = useRef(null);
  const handleDragStart = useCallback((e, onClickAction) => {
    if (e.button !== 0) return;
    e.preventDefault();

    // 창 가장자리 클릭이면 네이티브 리사이즈에 맡김
    const edgeThreshold = 8;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const nearEdge =
        e.clientX - rect.left < edgeThreshold ||
        rect.right - e.clientX < edgeThreshold ||
        e.clientY - rect.top < edgeThreshold ||
        rect.bottom - e.clientY < edgeThreshold;
      if (nearEdge) return;
    }

    // sendSync: OS가 다음 WM_NCHITTEST를 처리하기 전에 resizable을 끔
    ipcRenderer.sendSync('overlay-set-resizable', false);

    draggedRef.current = false;
    onClickActionRef.current = onClickAction || null;
    const startX = e.screenX;
    const startY = e.screenY;
    let dragStarted = false;

    const onMove = (e) => {
      const deltaX = e.screenX - startX;
      const deltaY = e.screenY - startY;

      if (!dragStarted && Math.abs(deltaX) + Math.abs(deltaY) < 4) {
        return;
      }

      if (!dragStarted) {
        dragStarted = true;
        draggedRef.current = true;
        ipcRenderer.send('overlay-drag-start', { x: startX, y: startY });
      }

      ipcRenderer.send('overlay-drag-move', { x: e.screenX, y: e.screenY });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (dragStarted) {
        ipcRenderer.send('overlay-drag-end');
      }

      if (!dragStarted && onClickActionRef.current) {
        onClickActionRef.current();
      }

      onClickActionRef.current = null;
      // 리사이즈 복원
      ipcRenderer.sendSync('overlay-set-resizable', true);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // isPaused 변화 감지 → pausePhase 전환
  useEffect(() => {
    const wasPaused = prevPausedRef.current;
    prevPausedRef.current = isPaused;

    if (isPaused && !wasPaused) {
      setPausePhase('paused');
    } else if (!isPaused && wasPaused) {
      setPausePhase('resuming');
    }
  }, [isPaused]);

  const handleResumeAnimEnd = useCallback(() => {
    if (pausePhase === 'resuming') {
      setPausePhase('active');
    }
  }, [pausePhase]);

  const handleParagraphClick = (index) => {
    if (draggedRef.current) return;
    if (index !== undefined) {
      ipcRenderer.send("move-to-position", index);
    }
  };

  return (
    <div className="overlay-wrapper">
      <div
        ref={containerRef}
        className="overlay-window"
        data-theme={theme.mode}
        onMouseDown={handleDragStart}
      >
        <div className="overlay-header">
          <span className="overlay-page-number">
            {oc.currentNumber?.display ? (
              oc.currentNumber.display.isRange ?
                oc.currentNumber.display.text :
                t('common.pageInfo.pageNumber', { page: oc.currentNumber.display.text })
            ) : t('overlay.paragraphs.empty')}
          </span>
          <div className="overlay-header-icons">
            {pluginServer && (
              <svg
                className={`overlay-header-ps-icon ${pluginConnected ? (pluginModeActive ? 'connected' : 'active') : ''}`}
                viewBox="0 0 34 32"
                xmlns="http://www.w3.org/2000/svg"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => ipcRenderer.send('toggle-plugin-connection')}
              >
                <path d="M3.556 2.845v27.071h27.53v-27.071h-27.53zM28.896 27.763h-23.151v-22.765h23.151v22.765z"/>
                <path d="M16.555 10.442c-0.693-0.599-1.726-0.939-3.173-0.939-1.433 0-3.173 0.046-3.173 0.046l-0 11.103h2.326v-3.568c0 0 0.407-0.005 0.847-0.023 1.593-0.067 2.526-0.549 3.327-1.364 0.616-0.631 0.955-1.53 0.955-2.627s-0.447-2.062-1.109-2.628zM13.32 15.115c-0.375 0.004-0.533 0.016-0.786-0.008v-3.834c0 0 0.493-0.017 0.971 0 1.198 0.044 1.833 0.89 1.833 1.921-0 1.148-0.77 1.906-2.018 1.921z"/>
                <path d="M22.205 15.455c-1.005-0.356-1.324-0.559-1.324-0.949 0-0.423 0.352-0.677 0.972-0.677 0.703 0 1.767 0.454 2.136 0.658v-1.871c-0.502-0.254-1.265-0.566-2.22-0.566-2.027 0-3.334 1.169-3.334 2.728-0.017 0.965 0.636 1.655 2.329 2.231 0.955 0.322 1.206 0.767 1.206 1.191s-0.318 0.695-1.089 0.695c-0.754 0-1.86-0.431-2.329-0.718v0 1.847c0.62 0.338 1.518 0.659 2.329 0.684 2.363 0.074 3.551-1.152 3.551-2.694-0.017-1.22-0.67-2.016-2.228-2.558z"/>
              </svg>
            )}
            <img
              src={isPaused ? icons.play : icons.pause}
              alt={isPaused ? 'play' : 'pause'}
              className={`overlay-header-pause-btn ${isPaused ? 'paused' : ''}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => ipcRenderer.send('toggle-pause')}
            />
          </div>
        </div>
        <div className="paragraphs-container">
          <div className="paragraphs-highlight-frame" />
          <div className={`paragraphs-view ${oc._animDirection}`} key={oc._animKey}>
          <div className="paragraphs-section paragraphs-previous">
            {oc.previous.slice(0, 5).map((para, idx) => (
              <div
                key={`prev-${idx}`}
                className="overlay-paragraph overlay-paragraph-previous"
                onClick={() => handleParagraphClick(para.paragraph)}
              >
                <span className="overlay-paragraph-text">
                  {para.text?.replace(/\n/g, " ") || " "}
                </span>
                <span className="paragraph-number">
                  {para.metadata?.index + 1}
                </span>
              </div>
            ))}
          </div>

          <div
            className="overlay-paragraph overlay-paragraph-current"
            onClick={() => handleParagraphClick(oc.currentParagraph)}
          >
            <span className="overlay-paragraph-text">
              {oc.current?.replace(/\n/g, " ") || " "}
            </span>
            <span className="paragraph-number">
              {oc.currentParagraph + 1}
            </span>
            {oc.currentMetadata?.comments && (
              <svg className="overlay-comment-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                <path d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="32"/>
                <path d="M250.26 166.05L256 288l5.73-121.95a5.74 5.74 0 00-5.79-6h0a5.74 5.74 0 00-5.68 6z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32"/>
                <path d="M256 367.91a20 20 0 1120-20 20 20 0 01-20 20z" fill="currentColor"/>
              </svg>
            )}
          </div>

          <div className="paragraphs-section paragraphs-next">
            {oc.next.slice(0, 5).map((para, idx) => (
              <div
                key={`next-${idx}`}
                className="overlay-paragraph overlay-paragraph-next"
                onClick={() => handleParagraphClick(para.paragraph)}
              >
                <span className="overlay-paragraph-text">
                  {para.text?.replace(/\n/g, " ") || " "}
                </span>
                <span className="paragraph-number">
                  {oc.currentParagraph + idx + 2}
                </span>
              </div>
            ))}
          </div>
          </div>
        </div>

        {/* 일시정지/재생 오버레이 */}
        {pausePhase !== 'active' && (
          <div
            className={`overlay-pause-backdrop ${
              pausePhase === 'paused' ? 'fade-in' : 'fade-out'
            }`}
            onAnimationEnd={handleResumeAnimEnd}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleDragStart(e, () => {
                if (pausePhase === 'paused') ipcRenderer.send('toggle-pause');
              });
            }}
          >
            <img
              src={pausePhase === 'paused' ? icons.pause : icons.play}
              alt={pausePhase === 'paused' ? 'paused' : 'play'}
              className="overlay-pause-center-icon"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default OverlayComponent;