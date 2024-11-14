// OverlayComponent.js
import React, { useState, useEffect, useRef } from 'react';
const { ipcRenderer } = window.require('electron');

function OverlayComponent() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [paragraphs, setParagraphs] = useState({ prev: null, current: null, next: null });

  useEffect(() => {
    ipcRenderer.on('file-content', (event, fileContent) => {
      setContent(fileContent);
    });

    // 테마 변경 리스너
    ipcRenderer.on('theme-changed', (event, shouldUseDarkColors) => {
      setIsDarkMode(shouldUseDarkColors);
    });

    ipcRenderer.on('update-paragraphs', (event, newParagraphs) => {
      setParagraphs(newParagraphs);
    });

    // 초기 테마 상태 요청
    ipcRenderer.send('request-theme');

    // 창 이동을 위한 마우스 이벤트 리스너
    const handleMouseMove = (e) => {
      if (isDragging && dragStartRef.current) {
        e.preventDefault();
        const deltaX = e.screenX - dragStartRef.current.x;
        const deltaY = e.screenY - dragStartRef.current.y;
        
        // 좌표를 정수로 변환하여 전송
        const newX = Math.round(dragStartRef.current.windowX + deltaX);
        const newY = Math.round(dragStartRef.current.windowY + deltaY);
        
        ipcRenderer.send('move-overlay', {
          x: newX,
          y: newY
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      ipcRenderer.removeAllListeners('file-content');
      ipcRenderer.removeAllListeners('theme-changed');
      ipcRenderer.removeAllListeners('update-paragraphs');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = async (e) => {
    if (e.target === containerRef.current) {
      setIsDragging(true);
      const position = await ipcRenderer.invoke('get-window-position');
      dragStartRef.current = {
        x: e.screenX,
        y: e.screenY,
        windowX: Math.round(position.x),  // 정수로 변환
        windowY: Math.round(position.y)   // 정수로 변환
      };
    }
    e.stopPropagation();
  };


  const styles = {
    container: {
      backgroundColor: isDarkMode ? 
        'rgba(26, 26, 26, 0.8)' : 
        'rgba(255, 255, 255, 0.8)',
      color: isDarkMode ? '#ffffff' : '#000000',
      padding: '20px',
      height: '100vh',
      width: '100vw',
      cursor: 'default',
      userSelect: 'none',
      position: 'relative',
      transition: 'background-color 0.3s, color 0.3s',
      overflow: 'hidden',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
      '&::-webkit-scrollbar': {
        display: 'none'
      }
    },
    content: {
      color: isDarkMode ? '#ffffff' : '#000000',
      transition: 'color 0.3s',
      overflow: 'hidden',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
      '&::-webkit-scrollbar': {
        display: 'none'
      }
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        WebkitAppRegion: 'no-drag'
      }}
      onMouseDown={(e) => {
        if (e.target === containerRef.current) {
          handleMouseDown(e);
        }
      }}
    >
      <div style={styles.content}>
        {paragraphs.prev && (
          <div style={{ opacity: 0.5, marginBottom: '10px' }}>
            {paragraphs.prev}
          </div>
        )}
        <div style={{ margin: '10px 0' }}>
          {paragraphs.current}
        </div>
        {paragraphs.next && (
          <div style={{ opacity: 0.5, marginTop: '10px' }}>
            {paragraphs.next}
          </div>
        )}
      </div>
    </div>
  );
}

export default OverlayComponent;