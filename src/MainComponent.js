// src/MainComponent.js
import React, { useState, useEffect } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
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

  const [logoScale, setLogoScale] = useState(1);
  const [hoveredSection, setHoveredSection] = useState(null);
  const [playIcon, setPlayIcon] = useState(null);
  const [pauseIcon, setPauseIcon] = useState(null);
  const [terminalIcon, setTerminalIcon] = useState(null);
  const [settingsIcon, setSettingsIcon] = useState(null);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

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
        const [playIconPath, pauseIconPath, terminalIconPath, settingsIcon ] = await Promise.all([
          ipcRenderer.invoke('get-icon-path', 'play-solid.svg'),
          ipcRenderer.invoke('get-icon-path', 'pause-solid.svg'),
          ipcRenderer.invoke('get-icon-path', 'terminal-tag.svg'),
          ipcRenderer.invoke('get-icon-path', 'settings.svg')
        ]);
        setPlayIcon(playIconPath);
        setPauseIcon(pauseIconPath);
        setTerminalIcon(terminalIconPath);
        setSettingsIcon(settingsIcon);
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
        ipcRenderer.send('copy-to-clipboard', currentContent);  // 이 부분이 제대로 호출되는지 확인
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
    // 먼저 메인 프로세스에 상태 변경을 알림
    ipcRenderer.send('update-state', {
      programStatus: 'READY',
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      isPaused: false,
      isOverlayVisible: false
    });

    // 그 다음 로컬 상태 업데이트
    setState(prevState => ({
      ...prevState,
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      isPaused: false,
      isOverlayVisible: false,
      programStatus: 'READY'
    }));
  };

  // 디버그 콘솔 표시 핸들러 추가
  const handleShowDebugConsole = () => {
    ipcRenderer.send('show-debug-console');
  };

  // 파일이 로드되지 않은 상태일 때 표시할 대기 화면
  if (state.paragraphs.length === 0) {
    return (
      <div className={`container ${state.isDarkMode ? 'dark-mode' : ''}`}>
        <Sidebar 
          isVisible={state.isSidebarVisible}
          onFileSelect={handleSidebarFileSelect}
          isDarkMode={state.isDarkMode}
          onClose={handleCloseSidebar}
          currentFilePath={null}
        />
        <button className="btn-sidebar" onClick={handleToggleSidebar}>
          <svg
            width="100%" // Use 100% to make the SVG take up 100% of the button size
            height="100%" // Use 100% to make the SVG take up 100% of the button size
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24" // Set the viewBox to match the natural dimensions of the icon
          >
            <path d="M3 5H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M3 12H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M3 19H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </button>

        <div className="content">
          {state.logoPath && (
            <img
              src={state.logoPath}
              alt="Paraglide Logo"
              className="logo"
              style={{ transform: `scale(${logoScale})` }}
              onClick={handleLogoClick}
              onError={(e) => {
                console.error('로고 렌더링 실패:', e);
                e.target.style.display = 'none';
              }}
            />
          )}
          <h1 className="title">Paraglide</h1>
          <div className="button-container">
            <button 
              onClick={handleLoadFile}
              className="button"
            >
              파일 불러오기
            </button>
            {/* 디버그 콘솔 버튼 추가 */}
            {/* <button
              className="btn btn-icon"
              onClick={handleShowDebugConsole}
            >
              {terminalIcon && <img src={terminalIcon} alt="" className="icon" />}
              <span>디버그 콘솔</span>
            </button> */}
          </div>
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
            <button className="btn-sidebar" onClick={handleToggleSidebar}>
              <svg 
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                width="100%" // Use 100% to make the SVG take up 100% of the button size
                height="100%" // Use 100% to make the SVG take up 100% of the button size
                viewBox="0 0 24 24" // Set the viewBox to match the natural dimensions of the icon
              >
                <path d="M3 5H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M3 12H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M3 19H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
            </button>
            <div className="control-panel">
              <div className="button-group">
                {/* <button 
                  className="btn btn-icon"
                  onClick={handleToggleSidebar}
                >
                  {state.isSidebarVisible ? '사이드바 숨기기' : '사이드바 표시'}
                </button> */}
                <button className="btn btn-primary" onClick={handleLoadFile}>
                  파일 불러오기
                </button>
                {/* 디버그 콘솔 버튼 추가 */}
                {/* <button
                  className="btn btn-icon"
                  onClick={handleShowDebugConsole}
                >
                  {terminalIcon && <img src={terminalIcon} alt="" className="icon" />}
                  <span>디버그 콘솔</span>
                </button> */}
               <button 
              className="btn-icon"
              onClick={() => setIsSettingsVisible(true)}
              title="설정"
            >
              <img src={settingsIcon} alt="설정" />
            </button>
              </div>
              
              <div className="button-group">
                <button 
                  className={`btn-icon ${state.isPaused ? 'btn-danger' : 'btn-success'}`}
                  onClick={handleTogglePause}
                >
                  {state.isPaused ? (
                    <>
                      {playIcon && <img src={playIcon} alt="" className="icon" />}
                      <svg
                        width="30px"
                        height="30px"
                        stroke-width="1.3"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        color="#000000"
                      >
                        <path d="M6.90588 4.53682C6.50592 4.2998 6 4.58808 6 5.05299V18.947C6 19.4119 6.50592 19.7002 6.90588 19.4632L18.629 12.5162C19.0211 12.2838 19.0211 11.7162 18.629 11.4838L6.90588 4.53682Z" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                        </path>
                      </svg>
                      {/* <span>재개</span> */}
                    </>
                  ) : (
                    <>
                      {pauseIcon && <img src={pauseIcon} alt="" className="icon" />}
                      {/* <span>일시정지</span> */}
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
      <Settings 
        isVisible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        isDarkMode={state.isDarkMode}
      />
    </div>
  );
}

export default MainComponent;