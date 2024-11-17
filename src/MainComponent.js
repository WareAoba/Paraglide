// src/MainComponent.js
import React, { useState, useEffect } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
const { ipcRenderer } = window.require('electron');

// MainComponent.js 수정
function MainComponent() {
  const [state, setState] = useState({
    paragraphs: [],
    currentParagraph: 0,
    currentNumber: null,
    isDarkMode: false,
    isPaused: false,
    isOverlayVisible: false,
    logoPath: null,
    isSidebarVisible: false, // 추가
    programStatus: 'READY' // 추가
  });

  const setLogoScale = useState(1);
  const [hoveredSection, setHoveredSection] = useState(null);
  const [playIcon, setPlayIcon] = useState(null);
  const [pauseIcon, setPauseIcon] = useState(null);

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
      setState(prevState => ({ ...prevState, isDarkMode }));
      loadLogo();
    };

    // 이벤트 리스너 등록
    ipcRenderer.on('state-update', handleStateUpdate);
    ipcRenderer.on('theme-updated', handleThemeUpdate);
    
    // 초기화
    initializeState();

    // 클린업
    return () => {
      ipcRenderer.removeListener('state-update', handleStateUpdate);
      ipcRenderer.removeListener('theme-updated', handleThemeUpdate);
    };
  }, []);

  useEffect(() => {
    const loadIcons = async () => {
      try {
        const playIconPath = await ipcRenderer.invoke('get-icon-path', 'play-solid.svg');
        const pauseIconPath = await ipcRenderer.invoke('get-icon-path', 'pause-solid.svg');
        setPlayIcon(playIconPath);
        setPauseIcon(pauseIconPath);
      } catch (error) {
        console.error('아이콘 로드 실패:', error);
      }
    };
    
    loadIcons();
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

  // MainComponent.js에서 복사 함수
  const handleParagraphClick = (type) => {
    if (type === 'current') {
      const currentContent = state.paragraphs[state.currentParagraph];
      if (currentContent) {
        ipcRenderer.send('copy-content', currentContent);  // 이 부분이 제대로 호출되는지 확인
      }
    }
    if (type === 'prev') {
      handlePrev();
    } else if (type === 'next') {
      handleNext();
    } else {
      // 현재 단락 재복사 및 재개
      const currentContent = state.paragraphs[state.currentParagraph];
      if (currentContent) {
        ipcRenderer.send('copy-to-clipboard', currentContent);
      }
      if (state.isPaused) {
        handleTogglePause();
      }
    }
  };

  const getParagraphStyle = (type) => ({
    flex: type === 'current' ? 1.5 : 1,
    opacity: type === 'current' ? 1 : 0.7,
    padding: '15px',
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    backgroundColor: hoveredSection === type ?
      (state.isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') :
      (state.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')
  });

  // 사이드바 토글 함수
  const handleToggleSidebar = () => {
    setState(prev => ({
      ...prev,
      isSidebarVisible: !prev.isSidebarVisible
    }));
  };

  // 사이드바 닫기 함수
  const handleCloseSidebar = () => {
    setState(prev => ({
      ...prev,
      isSidebarVisible: false
    }));
  };

  // 파일 선택 핸들러 수정
  const handleSidebarFileSelect = async (filePath, lastPosition) => {
    try {
      const content = await ipcRenderer.invoke('read-file', filePath);
      if (!content) return;

      const result = await ipcRenderer.invoke('process-file-content', content, filePath);
      if (result.success) {
        // 파일 로드 후 저장된 위치로 이동
        ipcRenderer.send('move-to-position', lastPosition);
        setState(prev => ({ 
          ...prev,
          isSidebarVisible: false
        }));
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  // handleCompleteWork 함수 수정
  const handleCompleteWork = () => {
    // 상태 초기화
    setState(prevState => ({
      ...prevState,
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      isPaused: false,
      isOverlayVisible: false,
      programStatus: 'READY'
    }));

    // 메인 프로세스에 상태 변경 알림
    ipcRenderer.send('update-state', {
      programStatus: 'READY',
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      isPaused: false,
      isOverlayVisible: false
    });
  };

  // 파일이 로드되지 않은 상태일 때 표시할 대기 화면
  if (state.paragraphs.length === 0) {
    const styles = getThemeStyles();
    return (
      <div style={styles.container}>
        <Sidebar 
          isVisible={state.isSidebarVisible}
          onFileSelect={handleSidebarFileSelect}
          isDarkMode={state.isDarkMode}
          onClose={handleCloseSidebar}
          currentFilePath={null}
        />
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
            className="btn btn-icon"
            onClick={handleToggleSidebar}
          >
            {state.isSidebarVisible ? '사이드바 숨기기' : '사이드바 표시'}
          </button>
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

  // MainComponent.js의 return문 부분 수정
  return (
    <div className="app-container">
      <Sidebar 
        isVisible={state.isSidebarVisible}
        onFileSelect={handleSidebarFileSelect}
        isDarkMode={state.isDarkMode}
        onClose={handleCloseSidebar}
      />
      <div className={`app-container ${state.isDarkMode ? 'dark-mode' : ''}`} data-theme={state.isDarkMode ? 'dark' : 'light'}>
        {state.programStatus === 'READY' ? (
          <div className="welcome-screen">
            <button className="btn btn-primary" onClick={handleLoadFile}>
              파일 불러오기
            </button>
          </div>
        ) : (
          <div className="main-container">
            <div className="control-panel">
              <button 
                className="btn btn-icon"
                onClick={handleToggleSidebar}
              >
                {state.isSidebarVisible ? '사이드바 숨기기' : '사이드바 표시'}
              </button>
              <button className="btn btn-primary" onClick={handleLoadFile}>
                파일 불러오기
              </button>
              
              <div className="button-group">
                <button 
                  className={`btn btn-icon ${state.isPaused ? 'btn-danger' : 'btn-success'}`}
                  onClick={handleTogglePause}
                >
                  {state.isPaused ? (
                    <>
                      {playIcon && <img src={playIcon} alt="" className="icon" />}
                      <span>재개</span>
                    </>
                  ) : (
                    <>
                      {pauseIcon && <img src={pauseIcon} alt="" className="icon" />}
                      <span>일시정지</span>
                    </>
                  )}
                </button>
                <button 
                  className={`btn ${state.isOverlayVisible ? 'btn-active' : 'btn-outline'}`}
                  onClick={handleToggleOverlay}
                >
                  {state.isOverlayVisible ? '오버레이 숨김' : '오버레이 표시'}
                </button>
              </div>
            </div>

            <div className="page-number">
              {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
            </div>

            <div className="paragraph-section">
              <div className="paragraph-container">
                <div className="paragraph-header">
                  <div>이전 단락</div>
                  <div className="current">현재 단락</div>
                  <div>다음 단락</div>
                </div>
                
                <div className="paragraph-content">
                  <div 
                    className={`paragraph prev ${hoveredSection === 'prev' ? 'hovered' : ''}`}
                    onClick={() => handleParagraphClick('prev')}
                    onMouseEnter={() => setHoveredSection('prev')}
                    onMouseLeave={() => setHoveredSection(null)}
                  >
                    {state.paragraphs[state.currentParagraph - 1] || ''}
                  </div>

                  <div 
                    className="paragraph current"
                    onClick={() => handleParagraphClick('current')}
                  >
                    {state.paragraphs[state.currentParagraph] || ''}
                  </div>

                  <div 
                    className={`paragraph next ${hoveredSection === 'next' ? 'hovered' : ''}`}
                    onClick={() => handleParagraphClick('next')}
                    onMouseEnter={() => setHoveredSection('next')}
                    onMouseLeave={() => setHoveredSection(null)}
                  >
                    {state.paragraphs[state.currentParagraph + 1] || ''}
                  </div>
                </div>
              </div>

              <div className="navigation-buttons">
                <button className="btn btn-outline" onClick={handlePrev}>◀ 이전</button>
                <button className="btn btn-outline" onClick={handleNext}>다음 ▶</button>
              </div>
              <button 
                className="btn btn-primary"
                onClick={handleCompleteWork}
              >
                작업 완료
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MainComponent;