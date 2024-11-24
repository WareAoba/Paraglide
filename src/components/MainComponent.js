// src/MainComponent.js
import React, { useState, useEffect } from 'react';
import '../CSS/MainComponentTest.css';
import Sidebar from './Sidebar';
import Settings from './Settings';
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
  const [sidebarIcon, setSidebarIcon] = useState(null);
  const [endIcon, setEndIcon] = useState(null);
  const [eyeIcon, setEyeIcon] = useState(null);
  const [eyeOffIcon, setEyeOffIcon] = useState(null);


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
    const handleThemeChanged = (event, isDarkMode) => {
      setState(prevState => ({ ...prevState, isDarkMode }));
      loadLogo();
    };

    // 이벤트 리스너 등록
    ipcRenderer.on('state-update', handleStateUpdate);
    ipcRenderer.on('theme-changed', handleThemeChanged);
    
    // 초기화
    initializeState();

    // 클린업
    return () => {
      ipcRenderer.removeListener('state-update', handleStateUpdate);
      ipcRenderer.removeListener('theme-changed', handleThemeChanged);
    };
  }, []);

  useEffect(() => {
    const loadIcons = async () => {
      try {
        const [playIconPath, pauseIconPath, terminalIconPath, settingsIcon ] = await Promise.all([
          ipcRenderer.invoke('get-icon-path', 'play.svg'),
          ipcRenderer.invoke('get-icon-path', 'pause.svg'),
          ipcRenderer.invoke('get-icon-path', 'terminal-tag.svg'),
          ipcRenderer.invoke('get-icon-path', 'settings.svg'),
        ]);
        const sidebarIcon = await ipcRenderer.invoke('get-icon-path', 'menu.svg');
        const endIcon = await ipcRenderer.invoke('get-icon-path', 'save.svg')
        const eyeIcon = await ipcRenderer.invoke('get-icon-path', 'eyes.svg')
        const eyeOffIcon = await ipcRenderer.invoke('get-icon-path', 'eyes-off.svg')
        
        setPlayIcon(playIconPath);
        setPauseIcon(pauseIconPath);
        setTerminalIcon(terminalIconPath);
        setSettingsIcon(settingsIcon);
        setSidebarIcon(sidebarIcon);
        setEndIcon(endIcon);
        setEyeIcon(eyeIcon);
        setEyeOffIcon(eyeOffIcon);
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
      <div className="app-container">
        <Sidebar 
          isVisible={state.isSidebarVisible}
          onFileSelect={handleSidebarFileSelect}
          isDarkMode={state.isDarkMode}
          onClose={handleCloseSidebar}
          currentFilePath={null}
        />

        <div className = "button-group-controls">
          <button className="btn-icon" onClick={handleToggleSidebar}>
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

          <button 
            className="btn-icon"
            onClick={() => setIsSettingsVisible(true)}
          >
            <img src={settingsIcon} alt="설정" className="icon" />
          </button>
        </div>

        <div className="welcome-screen" data-theme={state.isDarkMode ? 'dark' : 'light'}>
          

          {/* 설정 버튼 추가 */}
          

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
          isDarkMode={state.isDarkMode}
        />
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
          <div className="main-container">

            <div className="button-group-controls">
                <button className="btn-icon" onClick={handleToggleSidebar}>
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

                <button 
                  className="btn-settings"
                  onClick={() => setIsSettingsVisible(true)}
                >
                  <svg 
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                    width="100%" // Use 100% to make the SVG take up 100% of the button size
                    height="100%" // Use 100% to make the SVG take up 100% of the button size
                    viewBox="0 0 24 24" // Set the viewBox to match the natural dimensions of the icon
                  >
                    <path fill="currentColor" d="M8.013 4.389c0-.767.621-1.389 1.389-1.389h1.196c.767 0 1.39.622 1.39 1.389v.66c0 .153.101.33.307.436.141.074.278.155.411.241.196.128.402.13.536.052l.576-.332a1.389 1.389 0 0 1 1.897.508l.599 1.037a1.39 1.39 0 0 1-.509 1.897l-.621.359c-.131.075-.232.249-.225.477a5.135 5.135 0 0 1-.004.427c-.012.233.09.412.223.489l.627.362c.665.384.892 1.233.509 1.897l-.599 1.037a1.39 1.39 0 0 1-1.897.508l-.672-.388c-.132-.076-.332-.076-.526.045a4.928 4.928 0 0 1-.325.185c-.206.108-.308.284-.308.437v.778a1.39 1.39 0 0 1-1.389 1.39h-1.196a1.389 1.389 0 0 1-1.39-1.39v-.778c0-.153-.102-.33-.307-.437a4.96 4.96 0 0 1-.325-.185c-.194-.121-.395-.12-.526-.045l-.672.388a1.39 1.39 0 0 1-1.898-.508l-.598-1.037a1.389 1.389 0 0 1 .509-1.897l.627-.362c.133-.077.235-.256.223-.49a5.03 5.03 0 0 1-.004-.426c.007-.228-.094-.401-.225-.477l-.621-.359a1.389 1.389 0 0 1-.509-1.897l.598-1.037a1.389 1.389 0 0 1 1.898-.508l.576.332c.133.078.34.076.535-.052a4.81 4.81 0 0 1 .412-.24c.205-.108.308-.284.308-.437v-.66Zm1.987 7.611a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
                  </svg>
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

            <div className="page-number">
              {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
            </div>
              <div className="paragraph-container">
                <div className="paragraph-header">
                  <div>이전 단락</div>
                  <div className="current">현재 단락</div>
                  <div>다음 단락</div>
                </div>
                
                <div className="paragraph-content">
                  <div 
                    className={`paragraph-prev ${hoveredSection === 'prev' ? 'hovered' : ''}`}
                    onClick={() => handleParagraphClick('prev')}
                    onMouseEnter={() => setHoveredSection('prev')}
                    onMouseLeave={() => setHoveredSection(null)}
                  >
                    {state.paragraphs[state.currentParagraph - 1] || ''}
                  </div>

                  <div 
                    className="paragraph-current"
                    onClick={() => handleParagraphClick('current')}
                  >
                    {state.paragraphs[state.currentParagraph] || ''}
                  </div>

                  <div 
                    className={`paragraph-next ${hoveredSection === 'next' ? 'hovered' : ''}`}
                    onClick={() => handleParagraphClick('next')}
                    onMouseEnter={() => setHoveredSection('next')}
                    onMouseLeave={() => setHoveredSection(null)}
                  >
                    {state.paragraphs[state.currentParagraph + 1] || ''}
                  </div>
                </div>
              </div>
                
              {/* <div className="navigation-buttons">
                <button className="btn btn-outline" onClick={handlePrev}>◀ 이전</button>
                <button className="btn btn-outline" onClick={handleNext}>다음 ▶</button>
              </div> */}
              
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