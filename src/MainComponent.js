// src/MainComponent.js
import React, { useState, useEffect, useCallback } from 'react';
const { ipcRenderer } = window.require('electron');

function MainComponent() {
  const [state, setState] = useState({
    paragraphs: [],
    currentIndex: 0,
    currentNumber: null,
    isDarkMode: false,
    isOverlayVisible: false,
    isPaused: false
  });

  // 상태 동기화
  useEffect(() => {
    ipcRenderer.invoke('get-state').then(setState);

    ipcRenderer.on('state-updated', (event, newState) => {
      // 타임스탬프로 최신 상태만 반영
      if (!state.timestamp || newState.timestamp > state.timestamp) {
        setState(newState);
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('state-updated');
    };
  }, [state.timestamp]);

  const handleFileOpen = async () => {
    try {
      const filePath = await ipcRenderer.invoke('open-file-dialog');
      if (filePath) {
        const content = await ipcRenderer.invoke('read-file', filePath);
        if (content) {
          await ipcRenderer.invoke('process-file-content', content);
        }
      }
    } catch (error) {
      console.error('Error in handleFileOpen:', error);
    }
  };

  // 버튼 핸들러 최적화
  const handlePrev = useCallback(() => {
    const currentIndex = state.currentIndex;
    if (currentIndex > 0) {
      requestAnimationFrame(() => {
        setState(prev => ({
          ...prev,
          currentIndex: currentIndex - 1,
          timestamp: Date.now()
        }));
        ipcRenderer.send('move-to-prev');
      });
    }
  }, [state.currentIndex]);

  const handleNext = useCallback(() => {
    const currentIndex = state.currentIndex;
    if (currentIndex < state.paragraphs.length - 1) {
      requestAnimationFrame(() => {
        setState(prev => ({
          ...prev,
          currentIndex: currentIndex + 1,
          timestamp: Date.now()
        }));
        ipcRenderer.send('move-to-next');
      });
    }
  }, [state.currentIndex, state.paragraphs.length]);

  const handleToggleOverlay = () => {
    ipcRenderer.send('toggle-overlay');
  };

  const handleTogglePause = useCallback(() => {
    ipcRenderer.send('toggle-pause');
    // 즉시 로컬 상태 업데이트
    setState(prev => ({
      ...prev,
      isPaused: !prev.isPaused,
      timestamp: Date.now()
    }));
  }, []);

  // JSX에서는 state에서 직접 값을 읽음
  const { paragraphs, currentIndex, currentNumber, isDarkMode } = state;
  const prevParagraph = currentIndex > 0 ? paragraphs[currentIndex - 1] : null;
  const currentParagraph = paragraphs[currentIndex];
  const nextParagraph = currentIndex < paragraphs.length - 1 ? paragraphs[currentIndex + 1] : null;

  return (
    <div style={{
      backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
      color: isDarkMode ? '#ffffff' : '#000000',
      height: '100vh',
      padding: '20px',
    }}>
      {/* 컨트롤 패널 추가 */}
      <div style={{
        marginBottom: '20px',
        padding: '10px',
        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        borderRadius: '8px'
      }}>
        <label style={{ marginRight: '20px' }}>
          오버레이 표시
          <input
            type="checkbox"
            checked={state.isOverlayVisible}
            onChange={handleToggleOverlay}
            style={{ marginLeft: '10px' }}
          />
        </label>
        <button
          onClick={handleTogglePause}
          style={{
            padding: '5px 10px',
            backgroundColor: state.isPaused ? '#ff4444' : '#44ff44',
            color: '#000000',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          {state.isPaused ? '재개' : '일시정지'}
        </button>
      </div>
      
      <button onClick={handleFileOpen}>파일 불러오기</button>
      
      <div style={{ marginTop: '20px' }}>
        {paragraphs.length > 0 && (
          <>
            <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
              페이지: {currentNumber !== null ? currentNumber : '없음'}
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              현재 단락: {currentIndex + 1} / {paragraphs.length}
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '20px',
              minHeight: '200px'
            }}>
              {/* 이전 단락 */}
              <div style={{ 
                flex: 1,
                padding: '15px',
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                borderRadius: '8px',
              }}>
                <div style={{
                  padding: '5px 10px',
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  borderRadius: '4px',
                  marginBottom: '10px',
                  fontSize: '0.8em'
                }}>
                  이전 단락
                </div>
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                  fontSize: '0.9em',
                  opacity: prevParagraph ? 1 : 0.3
                }}>
                  {prevParagraph || '이전 단락 없음'}
                </pre>
              </div>

              {/* 현재 단락 */}
              <div style={{ 
                flex: 1.5,
                padding: '15px',
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                borderRadius: '8px',
                border: `1px solid ${isDarkMode ? '#fff' : '#000'}`
              }}>
                <div style={{
                  padding: '5px 10px',
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                  borderRadius: '4px',
                  marginBottom: '10px',
                  fontSize: '0.8em',
                  fontWeight: 'bold'
                }}>
                  현재 단락
                </div>
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                  fontSize: '0.9em'
                }}>
                  {currentParagraph || '현재 단락 없음'}
                </pre>
              </div>

              {/* 다음 단락 */}
              <div style={{ 
                flex: 1,
                padding: '15px',
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                borderRadius: '8px',
              }}>
                <div style={{
                  padding: '5px 10px',
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  borderRadius: '4px',
                  marginBottom: '10px',
                  fontSize: '0.8em'
                }}>
                  다음 단락
                </div>
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                  fontSize: '0.9em',
                  opacity: nextParagraph ? 1 : 0.3
                }}>
                  {nextParagraph || '다음 단락 없음'}
                </pre>
              </div>
            </div>

            {/* 이전/다음 버튼 */}
            <div style={{ marginTop: '20px' }}>
              <button onClick={handlePrev} style={{ /* 기존 스타일 유지 */ }}>&lt;&lt;</button>
              <button onClick={handleNext} style={{ /* 기존 스타일 유지 */ }}>&gt;&gt;</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MainComponent;