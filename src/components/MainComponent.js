// src/MainComponent.js
import React, { useState, useEffect } from 'react';
import '../CSS/MainComponent.css';
import Sidebar from './Sidebar';
import Settings from './Settings';
const { ipcRenderer } = window.require('electron');

// MainComponent.js 수정
function MainComponent() {
  const [state, setState] = useState({
    paragraphs: [],
    currentParagraph: 0,
    currentNumber: null,
    isOverlayVisible: false,
    logoPath: null,
    isSidebarVisible: false, // 추가
    programStatus: 'READY', // 추가
    isPaused: false
  });

  const [theme, setTheme] = useState({
    isDarkMode: false,
    mode: 'light',
    accentColor: '#007bff'
  });

  const [logoScale, setLogoScale] = useState(1);
  const [hoveredSection, setHoveredSection] = useState(null);
  const [playIcon, setPlayIcon] = useState(null);
  const [pauseIcon, setPauseIcon] = useState(null);
  const [terminalIcon, setTerminalIcon] = useState(null);
  const [settingsIcon, setSettingsIcon] = useState(null);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  useEffect(() => {

    const initializeTheme = async () => {
      const initialTheme = await ipcRenderer.invoke('get-current-theme');
      setTheme(initialTheme);
    };

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
          isOverlayVisible: initialState.isOverlayVisible
        }));
        initializeTheme();
        loadLogo();
      } catch (error) {
        console.error('초기 상태 로드 실패:', error);
      }
    };

    // 상태 업데이트 핸들러
    const handleStateUpdate = (event, updatedState) => {
      setState(prev => ({
        ...prev,
        ...updatedState,
      }));
    };

    // 테마 변경 핸들러
    const handleThemeUpdate = (_, newTheme) => {
      setTheme(newTheme);
      document.documentElement.style.setProperty('--primary-color', newTheme.accentColor);
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
    if (state.isPaused) {
      // 재개
      ipcRenderer.send('toggle-resume');
    } else {
      // 일시정지
      ipcRenderer.send('toggle-pause');
    }
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

  // MainComponent.js의 웰컴 스크린 return문 수정
  if (state.paragraphs.length === 0) {
    return (
      <div className="app-container" data-theme={theme.mode}>
        <Sidebar 
          isVisible={state.isSidebarVisible}
          onFileSelect={handleSidebarFileSelect}
          theme={theme}
          onClose={handleCloseSidebar}
          currentFilePath={null}
        />
        
        <div className="welcome-screen" data-theme={theme.mode}>
          {/* 사이드바 버튼 */}
          <button className="btn-sidebar" onClick={handleToggleSidebar}>
            <svg
              width="100%"
              height="100%"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
              <path d="M3 5H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
              <path d="M3 12H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
              <path d="M3 19H21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </button>

          {/* 설정 버튼 추가 */}
          <button 
            className="btn-settings"
            onClick={() => setIsSettingsVisible(true)}
          >
            <img src={settingsIcon} alt="설정" className="icon" />
          </button>

          <div className="logo-container">
            {state.logoPath && (
              <img
                src={state.logoPath}
                alt="Paraglide Logo"
                className="logo"
                onClick={handleLogoClick}
                onError={(e) => {
                  console.error('로고 렌더링 실패:', e);
                  e.target.style.display = 'none';
                }}
              />
            )}
            <h1 className="title">Paraglide</h1>
          </div>
          <div className="button-container">
            <button 
              className="btn-primary"
              onClick={handleLoadFile}
            >
              파일 불러오기
            </button>
          </div>
        </div>

        {/* Settings 컴포넌트 추가 */}
        <Settings 
          isVisible={isSettingsVisible}
          onClose={() => setIsSettingsVisible(false)}
          theme={theme}
        />
      </div>
    );
  }

  // MainComponent.js의 return문 부분 수정
  return (
    <div className="app-container" data-theme={theme.mode}>
      <Sidebar 
        isVisible={state.isSidebarVisible}
        onFileSelect={handleSidebarFileSelect}
        theme={theme}
        onClose={handleCloseSidebar}
      />

      <div className="app-container" data-theme={theme.mode}>
        {state.programStatus === 'READY' ? (
          <div className="welcome-screen">
            <div className="logo-container">
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
            </div>
            <div className="button-container">
              <button 
                className="btn-primary"
                onClick={handleLoadFile}
              >
                파일 불러오기
              </button>
            </div>
          </div>
        ) : (
          <div className="main-container" data-theme={theme.mode}>
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

            <div className="page-number">
              {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
            </div>

            <div className="paragraph-section" data-theme={theme.mode}>
              <div className="paragraph-container">
                <div className="paragraph-header" data-theme={theme.mode}>
                  <div>이전 단락</div>
                  <div className="current">현재 단락</div>
                  <div>다음 단락</div>
                </div>
                
                <div className="paragraph-content" data-theme={theme.mode}>
                  <div 
                    className={`paragraph-prev ${hoveredSection === 'prev' ? 'hovered' : ''}`}
                    onClick={() => handleParagraphClick('prev')}
                    onMouseEnter={() => setHoveredSection('prev')}
                    onMouseLeave={() => setHoveredSection(null)}
                    data-theme={theme.mode}
                  >
                    {state.paragraphs[state.currentParagraph - 1] || ''}
                  </div>

                  <div 
                    className="paragraph-current"
                    onClick={() => handleParagraphClick('current')}
                    data-theme={theme.mode}
                  >
                    {state.paragraphs[state.currentParagraph] || ''}
                  </div>

                  <div 
                    className={`paragraph-next ${hoveredSection === 'next' ? 'hovered' : ''}`}
                    onClick={() => handleParagraphClick('next')}
                    onMouseEnter={() => setHoveredSection('next')}
                    onMouseLeave={() => setHoveredSection(null)}
                    data-theme={theme.mode}
                  >
                    {state.paragraphs[state.currentParagraph + 1] || ''}
                  </div>
                </div>
              </div>

              <div className="navigation-buttons">
                <button className="btn btn-outline" onClick={handlePrev}>◀ 이전</button>
                <button className="btn btn-outline" onClick={handleNext}>다음 ▶</button>
              </div>
              
              <div className="button-group">
                <button 
                  className="btn-icon btn-settings"
                  onClick={() => setIsSettingsVisible(true)}
                >
                  <img src={settingsIcon} alt="설정" className="icon" />
                </button>
                
                <button 
                  className="btn btn-complete"
                  onClick={handleCompleteWork}
                >
                  작업 완료
                </button>
                
                <div className="toggle-buttons">
                  <button 
                    className={`btn-icon ${state.isPaused ? 'btn-danger' : 'btn-success'}`}
                    onClick={handleTogglePause}
                  >
                    {state.isPaused ? (
                      <img src={playIcon} alt="재생" className="icon" />
                    ) : (
                      <img src={pauseIcon} alt="일시정지" className="icon" />
                    )}
                  </button>
                  <button 
                    className={`toggle-button ${state.isOverlayVisible ? 'btn-active' : 'btn-outline'}`}
                    onClick={handleToggleOverlay}
                  >
                    {state.isOverlayVisible ? '오버레이' : '오버레이'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Settings 
        isVisible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        theme={theme}
      />
    </div>
  );
}

export default MainComponent;