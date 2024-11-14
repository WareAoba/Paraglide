// src/MainComponent.js
import React, { useState, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

function MainComponent() {
  const [state, setState] = useState({
    paragraphs: [],
    currentParagraph: 0,
    currentNumber: null,
    isDarkMode: false,
    isPaused: false,
    isOverlayVisible: false
  });

  useEffect(() => {
    // 상태 업데이트 핸들러 정의
    const handleStateUpdate = (event, updatedState) => {
      setState(prev => ({ ...prev, ...updatedState }));
    };

    // 초기 테마 상태 요청
    const initializeState = async () => {
      try {
        const initialState = await ipcRenderer.invoke('get-state');
        setState(prev => ({
          ...prev,
          isDarkMode: initialState.isDarkMode,
          isOverlayVisible: initialState.isOverlayVisible
        }));
      } catch (error) {
        console.error('초기 상태 로드 실패:', error);
      }
    };
    
    initializeState();

    // 상태 업데이트 이벤트 구독
    ipcRenderer.on('state-updated', handleStateUpdate);
    ipcRenderer.on('theme-changed', (event, isDark) => {
      setState(prev => ({ ...prev, isDarkMode: isDark }));
    });

    // 클린업: 이벤트 리스너 제거
    return () => {
      ipcRenderer.removeAllListeners('state-updated');
      ipcRenderer.removeAllListeners('theme-changed');
    };
  }, []);

  const handleNext = () => {
    ipcRenderer.send('move-to-next');
  };

  const handlePrev = () => {
    ipcRenderer.send('move-to-prev');
  };

  const handleTogglePause = () => {
    setState(prev => ({
      ...prev,
      isPaused: !prev.isPaused
    }));
    ipcRenderer.send('toggle-pause');
  };

  const handleToggleOverlay = () => {
    setState(prev => ({
      ...prev,
      isOverlayVisible: !prev.isOverlayVisible
    }));
    ipcRenderer.send('toggle-overlay');
  };

  const handleLoadFile = async () => {
    try {
      const filePath = await ipcRenderer.invoke('open-file-dialog');
      if (filePath) {
        const content = await ipcRenderer.invoke('read-file', filePath);
        if (content) {
          await ipcRenderer.invoke('process-file-content', content, filePath);
        }
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  return (
    <div style={{
      backgroundColor: state.isDarkMode ? '#262626' : '#fff',
      color: state.isDarkMode ? '#fff' : '#000',
      padding: '20px',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: state.paragraphs.length === 0 ? 'center' : 'flex-start',
      alignItems: state.paragraphs.length === 0 ? 'center' : 'stretch',
      gap: '20px'
    }}>
      {state.paragraphs.length === 0 ? (
        // 파일이 로드되지 않은 상태
        <button 
          onClick={handleLoadFile} 
          style={{
            padding: '15px 30px',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1.2em'
          }}
        >
          파일 불러오기
        </button>
      ) : (
        // 파일이 로드된 상태
        <>
          {/* 상단 컨트롤 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '60px',  // 고정 높이
            padding: '0 20px'
          }}>
            <button 
              onClick={handleLoadFile} 
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              파일 불러오기
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleTogglePause}
                style={{
                  padding: '10px 20px',
                  minWidth: '100px',  // 최소 너비 설정
                  backgroundColor: state.isPaused ? '#dc3545' : '#28a745',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'  // 부드러운 색상 전환
                }}
              >
                {state.isPaused ? '재개' : '일시정지'}
              </button>

              <button 
                onClick={handleToggleOverlay}
                style={{
                  padding: '10px 20px',
                  minWidth: '100px',  // 최소 너비 설정
                  backgroundColor: state.isOverlayVisible ? 'rgba(108, 117, 125, 0.8)' : 'rgba(108, 117, 125, 0.3)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                {state.isOverlayVisible ? '오버레이 숨김' : '오버레이 표시'}
              </button>
            </div>
          </div>

          {/* 페이지 번호 */}
          <div style={{
            fontSize: '1.5em',
            fontWeight: 'bold',
            textAlign: 'center',
            borderBottom: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
            paddingBottom: '10px'
          }}>
            {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
          </div>

          {/* 단락 섹션 */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '400px',  // 최소 높이 설정
            margin: 'auto 0'     // 상하 자동 여백
          }}>
            {/* 단락 컨테이너 */}
            <div style={{
              width: '80%',
              height: '50vh',  // 뷰포트 높이의 50%
              margin: '0 auto',
              backgroundColor: state.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              borderRadius: '8px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {/* 단락 헤더 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                borderBottom: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
                paddingBottom: '10px'
              }}>
                <div style={{
                  flex: 1,
                  padding: '10px',
                  textAlign: 'center',
                  opacity: 0.7
                }}>
                  이전 단락
                </div>
                <div style={{
                  flex: 1,
                  padding: '10px',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  borderBottom: `2px solid ${state.isDarkMode ? '#fff' : '#000'}`
                }}>
                  현재 단락
                </div>
                <div style={{
                  flex: 1,
                  padding: '10px',
                  textAlign: 'center',
                  opacity: 0.7
                }}>
                  다음 단락
                </div>
              </div>

              {/* 단락 내용 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '20px',
                flex: 1,
                minHeight: 0  // flex child 오버플로우 허용
              }}>
                <div style={{
                  flex: 1,
                  opacity: 0.7,
                  padding: '15px',
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    height: '100%'
                  }}>
                    {state.paragraphs[state.currentParagraph - 1] || ''}
                  </div>
                </div>

                <div style={{
                  flex: 1.5,
                  padding: '15px',
                  borderLeft: `3px solid ${state.isDarkMode ? '#fff' : '#000'}`,
                  backgroundColor: state.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    height: '100%'
                  }}>
                    {state.paragraphs[state.currentParagraph] || ''}
                  </div>
                </div>

                <div style={{
                  flex: 1,
                  opacity: 0.7,
                  padding: '15px',
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    height: '100%'
                  }}>
                    {state.paragraphs[state.currentParagraph + 1] || ''}
                  </div>
                </div>
              </div>
            </div>

            {/* 이전/다음 버튼 */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              marginTop: '20px',
              height: '50px'  // 버튼 영역 고정 높이
            }}>
              <button onClick={handlePrev} style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                border: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
                color: state.isDarkMode ? '#fff' : '#000',
                borderRadius: '4px',
                cursor: 'pointer'
              }}>
                ◀ 이전
              </button>
              <button onClick={handleNext} style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                border: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
                color: state.isDarkMode ? '#fff' : '#000',
                borderRadius: '4px',
                cursor: 'pointer'
              }}>
                다음 ▶
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default MainComponent;