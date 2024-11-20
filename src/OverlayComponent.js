// OverlayComponent.js
import React, { useState, useEffect, useRef } from 'react';
import './CSS/OverlayComponent.css';
import './CSS/App.css';
const { ipcRenderer } = window.require('electron');

function OverlayComponent() {
  const [state, setState] = useState({
    previous: [],
    current: null,
    next: [],
    currentNumber: null,
    currentParagraph: null,
    isDarkMode: false,
    isPaused: false
  });
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleUpdate = (event, data) => {
      setState(prevState => ({
        ...prevState,
        ...data
      }));
    };

    ipcRenderer.on('paragraphs-updated', handleUpdate);
    ipcRenderer.on('theme-changed', (_, isDarkMode) => 
      setState(prev => ({ ...prev, isDarkMode }))
    );
    

    // 초기 상태 로드
    ipcRenderer.invoke('get-state').then(handleUpdate);

    return () => {
      ipcRenderer.removeAllListeners('paragraphs-updated');
      ipcRenderer.removeAllListeners('theme-changed');
    };
  }, []);

  useEffect(() => {
    // 배경 투명도 업데이트 리스너
    const handleContentOpacityUpdate = (_, opacity) => {
      document.documentElement.style.setProperty('--bg-opacity', opacity);
    };

    ipcRenderer.on('update-content-opacity', handleContentOpacityUpdate);

    return () => {
      ipcRenderer.removeListener('update-content-opacity', handleContentOpacityUpdate);
    };
  }, []);

  const handleParagraphClick = (index) => {
    if (index !== undefined) {
      ipcRenderer.send('set-current-paragraph', index);
    }
  };

  return (
    <div className="overlay-wrapper">
      <div ref={containerRef} className="overlay-window" data-theme={state.isDarkMode ? 'dark' : 'light'}>
        <div className="overlay-header">
          <span className="overlay-page-number">
            {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
          </span>
          <div className="header-controls">
            {state.isPaused && (
              <span className="pause-indicator">일시정지</span>
            )}
            <button 
              onClick={() => ipcRenderer.send('move-to-prev')} 
              className="overlay-nav-button"
            >
              ◀
            </button>
            <button 
              onClick={() => ipcRenderer.send('move-to-next')}
              className="overlay-nav-button"
            >
              ▶
            </button>
          </div>
        </div>
        <div className="paragraphs-view">
          {state.previous.slice(0, 5).map((para, idx) => (
            <div
              key={`prev-${idx}`}
              className={`overlay-paragraph overlay-paragraph-previous ${hoveredIndex === `prev-${idx}` ? 'hovered' : ''}`}
              style={{
                top: `calc(50% - ${(state.previous.length - idx + 1) * 50}px)`
              }}
              onClick={() => handleParagraphClick(para.index)}
              onMouseEnter={() => setHoveredIndex(`prev-${idx}`)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="overlay-paragraph-text">
                {para.text?.replace(/\n/g, ' ') || ' '}
              </span>
              <span className="paragraph-number">
                {para.metadata?.index + 1}
              </span>
            </div>
          ))}

          <div className="overlay-paragraph overlay-paragraph-current">
            <span className="overlay-paragraph-text">
              {state.current?.replace(/\n/g, ' ') || ' '}
            </span>
            <span className="paragraph-number">
              {state.currentParagraph + 1}
            </span>
          </div>

          {state.next.slice(0, 5).map((para, idx) => (
            <div
              key={`next-${idx}`}
              className={`overlay-paragraph overlay-paragraph-next ${hoveredIndex === `next-${idx}` ? 'hovered' : ''}`}
              style={{
                top: `calc(50% + ${(idx + 1) * 50}px)`
              }}
              onClick={() => handleParagraphClick(para.index)}
              onMouseEnter={() => setHoveredIndex(`next-${idx}`)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="overlay-paragraph-text">
                {para.text?.replace(/\n/g, ' ') || ' '}
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