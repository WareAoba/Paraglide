// src/MainComponent.js
import React, { useState, useEffect } from 'react';
import './App.css';
const { ipcRenderer } = window.require('electron');

function MainComponent() {
  const [state, setState] = useState({
    paragraphs: [],
    currentParagraph: 0,
    currentNumber: null,
    isDarkMode: false,
    isPaused: false,
    isOverlayVisible: false,
    logoPath: null
  });

  const [logoScale, setLogoScale] = useState(1);
  const MIN_SCALE = 2; // 최소 2배
  const MAX_SCALE = 4; // 최대 4배

  useEffect(() => {
    // 로고 로드 함수 수정
    const loadLogo = async () => {
      try {
        const logoData = await ipcRenderer.invoke('get-logo-path');
        if (logoData) {
          setState(prev => ({ ...prev, logoPath: logoData }));
        }
      } catch (error) {
        console.error('로고 로드 실패:', error);
      }
    };

    // 초기 상태 로드
    const initializeState = async () => {
      try {
        const initialState = await ipcRenderer.invoke('get-state');
        setState(prev => ({
          ...prev,
          isDarkMode: initialState.isDarkMode,
          isOverlayVisible: initialState.isOverlayVisible
        }));
        loadLogo();
      } catch (error) {
        console.error('초기 상태 로드 실패:', error);
      }
    };

    // 상태 업데이트 핸들러
    const handleStateUpdate = (event, updatedState) => {
      setState(prev => ({ ...prev, ...updatedState }));
    };

    // 테마 변경 핸들러
    const handleThemeUpdate = (event, isDarkMode) => {
      setState(prev => ({ ...prev, isDarkMode }));
      loadLogo();
    };

    // 이벤트 리스너 등록
    ipcRenderer.on('state-update', handleStateUpdate);
    ipcRenderer.on('theme-update', handleThemeUpdate);
    
    // 초기화
    initializeState();

    // 클린업
    return () => {
      ipcRenderer.removeListener('state-update', handleStateUpdate);
      ipcRenderer.removeListener('theme-update', handleThemeUpdate);
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

  // 파일 로드 핸들러 수정
  const handleLoadFile = async () => {
    try {
      const filePath = await ipcRenderer.invoke('open-file-dialog');
      if (!filePath) return;

      const content = await ipcRenderer.invoke('read-file', filePath);
      if (!content) return;

      const result = await ipcRenderer.invoke('process-file-content', content, filePath);
      if (result.success) {
        const newState = await ipcRenderer.invoke('get-state');
        setState(prev => ({ ...prev, ...newState }));
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  const getThemeStyles = () => ({
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: state.isDarkMode ? '#1e1e1e' : '#ffffff',
      color: state.isDarkMode ? '#ffffff' : '#000000',
      transition: 'background-color 0.3s, color 0.3s'
    },
    content: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px',
      maxWidth: '90vw', // 뷰포트 너비의 90%로 제한
      padding: '20px'
    },
    logo: {
      width: 'auto',
      height: 'auto',
      maxWidth: '80vw', // 뷰포트 너비의 80%로 제한
      maxHeight: '50vh', // 뷰포트 높이의 50%로 제한
      objectFit: 'contain',
      marginBottom: '20px',
      cursor: 'zoom-in',
      transition: 'transform 0.3s ease'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      marginBottom: '20px',
      color: 'inherit',
      textAlign: 'center'
    },
    button: {
      padding: '12px 24px',
      fontSize: '16px',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      backgroundColor: state.isDarkMode ? '#0066cc' : '#007AFF', // 파란색으로 변경
      color: '#ffffff', // 텍스트는 항상 흰색
      transition: 'background-color 0.3s, transform 0.1s',
      '&:hover': {
        backgroundColor: state.isDarkMode ? '#0052a3' : '#0066cc',
        transform: 'scale(1.02)'
      }
    }
  });

  const handleLogoClick = () => {
    setLogoScale(prev => {
      const newScale = prev >= 2 ? 1 : prev + 0.5;
      return newScale;
    });
  };

  // 파일이 로드되지 않은 상태일 때 표시할 대기 화면
  if (state.paragraphs.length === 0) {
    const styles = getThemeStyles();
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          {state.logoPath && (
            <img
              src={state.logoPath}
              alt="Paraglide Logo"
              style={styles.logo}
              onClick={handleLogoClick}
              onError={(e) => {
                console.error('로고 렌더링 실패:', e);
                e.target.style.display = 'none';
              }}
            />
          )}
          <h1 style={styles.title}>Paraglide</h1>
          <button 
            onClick={handleLoadFile}
            style={styles.button}
          >
            파일 불러오기
          </button>
        </div>
      </div>
    );
  }

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