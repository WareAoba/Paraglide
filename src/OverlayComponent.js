// OverlayComponent.js
import React, { useState, useEffect, useRef } from 'react';
import './App.css';
const { ipcRenderer } = window.require('electron');

// 스타일 상수
const STYLES = {
  container: {
    width: '96%',
    height: 50,
    margin: 0,
    left: '2%'
  },
  paragraph: {
    number: {
      opacity: 0.5,
      marginLeft: '10px',
      fontSize: '0.9em',
      minWidth: '30px',
      textAlign: 'right',
      marginRight: '20px'
    },
    container: {
      minHeight: '50px',
      width: '100%',
      left: '2%',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }
};

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
    ipcRenderer.on('theme-updated', (_, isDarkMode) => 
      setState(prev => ({ ...prev, isDarkMode }))
    );

    // 초기 상태 로드
    ipcRenderer.invoke('get-state').then(handleUpdate);

    return () => {
      ipcRenderer.removeAllListeners('paragraphs-updated');
      ipcRenderer.removeAllListeners('theme-updated');
    };
  }, []);

  const handleParagraphClick = (index) => {
    if (index !== undefined) {
      ipcRenderer.send('set-current-paragraph', index);
    }
  };

  const renderParagraphs = () => (
    <>
      {state.previous.slice(0, 5).map((para, idx) => (
        <div
          key={`prev-${idx}`}
          style={{
            ...STYLES.paragraph.container,
            position: 'absolute',
            top: `calc(50% - ${(state.previous.length - idx + 1) * 50}px)`,
            opacity: 0.7,
            backgroundColor: hoveredIndex === `prev-${idx}` ?
              (state.isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') :
              'transparent'
          }}
          onClick={() => handleParagraphClick(para.index)}
          onMouseEnter={() => setHoveredIndex(`prev-${idx}`)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {para.text?.replace(/\n/g, ' ') || ' '}
          </span>
          <span style={STYLES.paragraph.number}>
            {para.metadata?.index + 1} {/* 실제 인덱스 사용 */}
          </span>
        </div>
      ))}

      <div style={{
        ...STYLES.paragraph.container,
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        borderLeft: `4px solid ${state.isDarkMode ? '#fff' : '#000'}`,
        backgroundColor: state.isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(128,128,128,0.4)',
        fontSize: '1.1em',
        fontWeight: 'bold'
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', margin: '0 10px' }}>
          {state.current?.replace(/\n/g, ' ') || ' '}
        </span>
        <span style={STYLES.paragraph.number}>
          {state.currentParagraph + 1}
        </span>
      </div>

      {state.next.slice(0, 5).map((para, idx) => (
        <div
          key={`next-${idx}`}
          style={{
            ...STYLES.paragraph.container,
            position: 'absolute',
            top: `calc(50% + ${(idx + 1) * 50}px)`,
            opacity: 0.7,
            backgroundColor: hoveredIndex === `next-${idx}` ?
              (state.isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') :
              'transparent'
          }}
          onClick={() => handleParagraphClick(para.index)}
          onMouseEnter={() => setHoveredIndex(`next-${idx}`)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {para.text?.replace(/\n/g, ' ') || ' '}
          </span>
          <span style={STYLES.paragraph.number}>
            {state.currentParagraph + idx + 2}
          </span>
        </div>
      ))}
    </>
  );

  return (
    <div ref={containerRef} style={{
      backgroundColor: state.isDarkMode ? 'rgba(32,32,32,0.8)' : 'rgba(255,255,255,0.8)',
      color: state.isDarkMode ? '#ffffff' : '#000000',
      padding: '15px 15px 50px 15px',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      WebkitAppRegion: 'drag',
      WebkitUserSelect: 'none'
    }}>
      <div style={{
        height: '36px',
        borderBottom: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 15px'
      }}>
        <span style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
          {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
        </span>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {state.isPaused && (
            <span style={{ 
              color: '#ff4444',
              fontWeight: 'bold',
              padding: '4px 8px',
              backgroundColor: 'rgba(255,68,68,0.1)',
              borderRadius: '4px'
            }}>
              일시정지
            </span>
          )}
          <button 
            onClick={() => ipcRenderer.send('move-to-prev')} 
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
              color: state.isDarkMode ? '#fff' : '#000',
              borderRadius: '4px',
              cursor: 'pointer',
              WebkitAppRegion: 'no-drag'
            }}
          >
            ◀
          </button>
          <button 
            onClick={() => ipcRenderer.send('move-to-next')}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
              color: state.isDarkMode ? '#fff' : '#000',
              borderRadius: '4px',
              cursor: 'pointer',
              WebkitAppRegion: 'no-drag'
            }}
          >
            ▶
          </button>
        </div>
      </div>
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {renderParagraphs()}
      </div>
    </div>
  );
}

export default OverlayComponent;