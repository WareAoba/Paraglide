// OverlayComponent.js
import React, { useState, useEffect, useRef } from 'react';
const { ipcRenderer } = window.require('electron');

function OverlayComponent() {
  const [state, setState] = useState({
    prev: null,
    current: null,
    next: null,
    currentNumber: null,
    isDarkMode: false,
    isPaused: false
  });
  const containerRef = useRef(null);

  useEffect(() => {
    const handleStateUpdate = (event, newState) => {
      console.log(`[오버레이] 상태 업데이트: ${newState.isPaused ? '일시정지' : '실행 중'}`);
      setState(prev => ({
        ...prev,
        prev: formatText(newState.prev),
        current: formatText(newState.current),
        next: formatText(newState.next),
        currentNumber: newState.currentNumber,
        isDarkMode: newState.isDarkMode,
        isPaused: newState.isPaused
      }));
    };

    // 상태 업데이트 구독 통합
    ipcRenderer.on('state-updated', handleStateUpdate);

    // 초기 상태 요청
    ipcRenderer.invoke('get-state').then(initialState => {
      handleStateUpdate(null, {
        prev: initialState.paragraphs[initialState.currentIndex - 1],
        current: initialState.paragraphs[initialState.currentIndex],
        next: initialState.paragraphs[initialState.currentIndex + 1],
        currentNumber: initialState.currentNumber,
        isDarkMode: initialState.isDarkMode,
        isPaused: initialState.isPaused
      });
    });

    return () => {
      ipcRenderer.removeAllListeners('state-updated');
    };
  }, []);

  // 텍스트 포맷팅 함수
  const formatText = (text) => {
    if (!text) return null;
    return text.replace(/\n/g, ' ');
  };

  return (
    <div 
      ref={containerRef}
      style={{
        backgroundColor: state.isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',
        color: state.isDarkMode ? '#ffffff' : '#000000',
        padding: '15px',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* 페이지 번호와 상태 표시 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`
      }}>
        <span style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
          {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
        </span>
        {state.isPaused && (
          <span style={{ 
            color: '#ff4444',
            fontWeight: 'bold',
            padding: '4px 8px',
            backgroundColor: 'rgba(255,68,68,0.1)',
            borderRadius: '4px',
            fontSize: '0.95em'
          }}>
            일시정지
          </span>
        )}
      </div>

      {/* 단락 컨테이너 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        overflow: 'hidden',
        justifyContent: 'center',  // Center vertically
      }}>
        {/* 이전 단락 */}
        <div style={{
          opacity: 0.7,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {state.prev || ''}
        </div>

        {/* 현재 단락 */}
        <div style={{
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '5px',
          borderLeft: `3px solid ${state.isDarkMode ? '#fff' : '#000'}`
        }}>
          {state.current || ''}
        </div>

        {/* 다음 단락 */}
        <div style={{
          opacity: 0.7,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '0px 0px 20px 0px'
        }}>
          {state.next || ''}
        </div>
      </div>
    </div>
  );
}

export default OverlayComponent;
