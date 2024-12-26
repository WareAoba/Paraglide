// OverlayComponent.js
import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "../CSS/OverlayComponent.css";
import "../CSS/App.css";
const { ipcRenderer } = window.require("electron");

function OverlayComponent() {
  const { t } = useTranslation();
  const [state, setState] = useState({
    previous: [],
    current: null,
    next: [],
    currentNumber: null,
    currentParagraph: null,
    theme: {
      mode: 'light',  // 기본값
      accentColor: '#007bff'
    },
    isPaused: false,
  });
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    // 단락 업데이트 핸들러
    const handleUpdate = (event, data) => {
      if (!data) return;
      
      setState(prevState => ({
        ...prevState,
        ...data,
        theme: data.theme ?? prevState.theme
      }));
    };

    // 테마 업데이트 핸들러
    const handleThemeUpdate = (_, theme) => {
      if (!theme) return;
      
      setState(prevState => ({
        ...prevState,
        theme: {
          mode: theme.mode,
          accentColor: theme.accentColor
        }
      }));
    };

    ipcRenderer.on("paragraphs-updated", handleUpdate);
    ipcRenderer.on("theme-update", handleThemeUpdate);

    // 초기 상태 로드
    ipcRenderer.invoke("get-state").then(initialState => {
      if (initialState) {
        handleUpdate(null, initialState);
      }
    });

    return () => {
      ipcRenderer.removeListener("paragraphs-updated", handleUpdate);
      ipcRenderer.removeListener("theme-update", handleThemeUpdate);
    };
  }, []);

  useEffect(() => {
    // 배경 투명도 업데이트 리스너
    const handleContentOpacityUpdate = (_, opacity) => {
      document.documentElement.style.setProperty("--bg-opacity", opacity);
    };

    ipcRenderer.on("update-content-opacity", handleContentOpacityUpdate);

    return () => {
      ipcRenderer.removeListener(
        "update-content-opacity",
        handleContentOpacityUpdate,
      );
    };
  }, []);

  useEffect(() => {
    // 디버깅을 위한 로그 추가
    const handleThemeVariablesUpdate = (_, variables) => {
      
      const root = document.documentElement;
      if (variables && typeof variables === 'object') {
        Object.entries(variables).forEach(([key, value]) => {
          root.style.setProperty(key, value);
        });
        setState(prev => ({
          ...prev,
          theme: {
            ...prev.theme,
            accentColor: variables['--primary-color'] || prev.theme.accentColor
          }
        }));
      }
    };

    ipcRenderer.on("update-theme-variables", handleThemeVariablesUpdate);
  
    return () => {
      ipcRenderer.removeListener("update-theme-variables", handleThemeVariablesUpdate);
    };
  }, []);

  const handleParagraphClick = (index) => {
    if (index !== undefined) {
      ipcRenderer.send("set-current-paragraph", index);
    }
  };

  return (
    <div className="overlay-wrapper">
      <div
        ref={containerRef}
        className="overlay-window"
        data-theme={state.theme.mode}
      >
        <div className="overlay-header">
          <span className="overlay-page-number">
          {state.currentNumber?.display ? (
    state.currentNumber.display.isRange ?
      state.currentNumber.display.text :  // 합페이지는 그대로 표시
      t('common.pageInfo.pageNumber', { page: state.currentNumber.display.text }) // 단일 페이지는 번역 적용
  ) : t('overlay.paragraphs.empty')}
          </span>
          <div className="header-controls">
            {state.isPaused && (
              <span className="pause-indicator">
                {t('overlay.header.pauseIndicator')}
              </span>
            )}
            <button
              onClick={() => ipcRenderer.send("move-to-prev")}
              className="overlay-nav-button"
            >
              {t('overlay.header.navigation.prev')}
            </button>
            <button
              onClick={() => ipcRenderer.send("move-to-next")}
              className="overlay-nav-button"
            >
              {t('overlay.header.navigation.next')}
            </button>
          </div>
        </div>
        <div className="paragraphs-view">
          {state.previous.slice(0, 5).map((para, idx) => (
            <div
              key={`prev-${idx}`}
              className={`overlay-paragraph overlay-paragraph-previous ${hoveredIndex === `prev-${idx}` ? "hovered" : ""}`}
              style={{
                top: `calc(50% - ${(state.previous.length - idx + 1) * 50}px)`,
              }}
              onClick={() => handleParagraphClick(para.index)}
              onMouseEnter={() => setHoveredIndex(`prev-${idx}`)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="overlay-paragraph-text">
                {para.text?.replace(/\n/g, " ") || " "}
              </span>
              <span className="paragraph-number">
                {para.metadata?.index + 1}
              </span>
            </div>
          ))}

          <div className="overlay-paragraph overlay-paragraph-current">
            <span className="overlay-paragraph-text">
              {state.current?.replace(/\n/g, " ") || " "}
            </span>
            <span className="paragraph-number">
              {state.currentParagraph + 1}
            </span>
          </div>

          {state.next.slice(0, 5).map((para, idx) => (
            <div
              key={`next-${idx}`}
              className={`overlay-paragraph overlay-paragraph-next ${hoveredIndex === `next-${idx}` ? "hovered" : ""}`}
              style={{
                top: `calc(50% + ${(idx + 1) * 50}px)`,
              }}
              onClick={() => handleParagraphClick(para.index)}
              onMouseEnter={() => setHoveredIndex(`next-${idx}`)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="overlay-paragraph-text">
                {para.text?.replace(/\n/g, " ") || " "}
              </span>
              <span className="paragraph-number">
                {state.currentParagraph + idx + 2}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default OverlayComponent;