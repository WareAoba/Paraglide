// src/MainComponent.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../CSS/MainComponent.css';
import Sidebar from './Sidebar';
import Settings from './Settings';
import Overview from './Views/Overview';
import ListView from './Views/ListView';
import Search from './Views/Search';
import DragDropOverlay from './Views/DragDropOverlay';

const path = window.require('path');
const { ipcRenderer } = window.require('electron');

// MainComponent.js 수정
function MainComponent() {
  const [state, setState] = useState({
    paragraphs: [],
    currentParagraph: 0,
    currentNumber: null,
    isOverlayVisible: false,
    logoPath: null,
    isSidebarVisible: false,
    programStatus: 'READY',
    isPaused: false,
    viewMode: 'overview' 
  });

  const [theme, setTheme] = useState({
    isDarkMode: false,
    mode: 'light',
    accentColor: '#007bff'
  });
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const [hoveredSection, setHoveredSection] = useState(null);
  const [playIcon, setPlayIcon] = useState(null);
  const [pauseIcon, setPauseIcon] = useState(null);
  const [terminalIcon, setTerminalIcon] = useState(null);
  const [settingsIcon, setSettingsIcon] = useState(null);
  const [sidebarIcon, setSidebarIcon] = useState(null);
  const [homeIcon, setHomeIcon] = useState(null);
  const [eyeIcon, setEyeIcon] = useState(null);
  const [eyeOffIcon, setEyeOffIcon] = useState(null);
  const [sidebarUnfoldIcon, setsidebarUnfoldIcon] = useState(null);
  const [menuIcon, setMenuIcon] = useState(null);
  const [searchIcon, setSearchIcon] = useState(null);

  const searchRef = useRef(null);

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
        const savedSettings = await ipcRenderer.invoke('load-settings');

        setState(prev => ({
          ...prev,
          isOverlayVisible: initialState.isOverlayVisible,
          viewMode: savedSettings.viewMode || 'overview'
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
        currentNumber: updatedState.paragraphsMetadata?.[updatedState.currentParagraph]?.pageInfo || null
      }));
    };

    const clearSearchHandler = () => { // 검색창 초기화 핸들러
      if (searchRef.current) {
        searchRef.current.clearSearch(); // Search 컴포넌트의 clearSearch 메서드 호출
      }
    };

    // 테마 변경 핸들러
    const handleThemeUpdate = (_, newTheme) => {
      setTheme(newTheme);
      document.documentElement.style.setProperty('--primary-color', newTheme.accentColor);
    };

    const handleViewModeUpdate = (event, newViewMode) => {
      setState(prev => ({
        ...prev,
        viewMode: newViewMode
      }));
    };

    // 이벤트 리스너 등록
    ipcRenderer.on('state-update', handleStateUpdate);
    ipcRenderer.on('theme-update', handleThemeUpdate);
    ipcRenderer.on('view-mode-update', handleViewModeUpdate);
    ipcRenderer.on('clear-search', clearSearchHandler);
    
    // 초기화
    initializeState();

    // 클린업
    return () => {
      ipcRenderer.removeListener('state-update', handleStateUpdate);
      ipcRenderer.removeListener('theme-update', handleThemeUpdate);
      ipcRenderer.removeListener('view-mode-update', handleViewModeUpdate);
      ipcRenderer.removeListener('clear-search', clearSearchHandler);
    };
  }, []);

  const formatPath = (fullPath) => {
    if (!fullPath) return '';
    const dir = path.dirname(fullPath);
    const parts = dir.split(path.sep);
    return parts.slice(-2).join(path.sep); // 파일명 제외 상위 2개 디렉토리
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => {
      // 카운터를 증가시키고 그 값으로 상태 업데이트
      const newCount = prev + 1;
      if (newCount === 1) {
        setIsDragging(true);
      }
      return newCount;
    });
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(0);
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find(file => file.name.endsWith('.txt'));

    if (txtFile) {
      try {
        // 파일 경로 추출 (Electron의 경우)
        const filePath = txtFile.path;
        
        // 기존 open-file 핸들러 재사용
        const result = await ipcRenderer.invoke('open-file', {
          filePath,
          source: 'drag-drop'
        });

        if (result.success) {
          const newState = await ipcRenderer.invoke('get-state');
          setState(prev => ({ ...prev, ...newState }));
        }
      } catch (error) {
        console.error('파일 로드 실패:', error);
      }
    }
  };

  const handleParagraphSelect = (index) => {
    ipcRenderer.send('move-to-position', index);
  };

  useEffect(() => {
    const loadIcons = async () => {
      try {
        const iconNames = [
          'play.svg', 'pause.svg', 'terminal-tag.svg', 'settings.svg',
          'sidebar.svg', 'home.svg', 'eyes.svg', 'eyes-off.svg',
          'sidebar-unfold.svg', 'menu.svg', 'search.svg'
        ];

        const iconPaths = await Promise.all(iconNames.map(name => ipcRenderer.invoke('get-icon-path', name)));

        setPlayIcon(iconPaths[0]);
        setPauseIcon(iconPaths[1]);
        setTerminalIcon(iconPaths[2]);
        setSettingsIcon(iconPaths[3]);
        setSidebarIcon(iconPaths[4]);
        setHomeIcon(iconPaths[5]);
        setEyeIcon(iconPaths[6]);
        setEyeOffIcon(iconPaths[7]);
        setsidebarUnfoldIcon(iconPaths[8]);
        setMenuIcon(iconPaths[9]);
        setSearchIcon(iconPaths[10]);

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
      // 통합된 open-file 핸들러 사용
      const result = await ipcRenderer.invoke('open-file', {
        source: 'dialog'  // 다이얼로그를 통한 파일 열기임을 명시
      });
  
      if (result.success) {
        const newState = await ipcRenderer.invoke('get-state');
        setState(prev => ({ ...prev, ...newState }));
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  // MainComponent.js에서 복사 함수
  const handleParagraphClick = (type) => {
    if (type === 'prev') {
      handlePrev();
    } else if (type === 'next') {
      handleNext();
    } else if (type === 'current') {
      ipcRenderer.send('toggle-resume');
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

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleSearchToggle = () => {
    setIsSearchVisible(prev => !prev);
    setIsMenuOpen(false);  // 메뉴 닫기
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
      currentFilePath: null,
      isPaused: false,
      isOverlayVisible: false
    });
  
    // 그 다음 로컬 상태 업데이트 - isSidebarVisible 유지
    setState(prevState => ({
      ...prevState,
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      currentFilePath: null,
      isPaused: false,
      isOverlayVisible: false,
      programStatus: 'READY',
    }));
  };

  // 디버그 콘솔 표시 핸들러 추가
  const handleShowDebugConsole = () => {
    ipcRenderer.send('show-debug-console');
  };

  // MainComponent.js의 웰컴 스크린 return문 수정
  if (state.paragraphs.length === 0 || state.programStatus === 'READY') {
    return (
      <div
        className="app-container"
        data-theme={theme.mode}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
          
        <Sidebar 
          isVisible={state.isSidebarVisible}
          onFileSelect={handleSidebarFileSelect}
          theme={theme}
          onClose={handleCloseSidebar}
          icons={{
            sidebarUnfold: sidebarUnfoldIcon
          }}
          currentFilePath={state.programStatus === 'PROCESS' ? state.currentFilePath : null}
        />
        <DragDropOverlay isVisible={isDragging} />
        
        <div className="welcome-screen" data-theme={theme.mode}>
          <div className="button-group-controls">
            <button className="btn-icon" onClick={handleToggleSidebar}>
              <img src={sidebarIcon} alt="Sidebar Icon" className="icon" />
            </button>
            <button 
              className="btn-icon"
              onClick={() => setIsSettingsVisible(true)}
            >
              <img src={settingsIcon} alt="Settings Icon" className="icon"/>
            </button>
          </div>          
  
          <div className="logo-container">
            {state.logoPath && (
              <img
                src={state.logoPath}
                alt="Paraglide Logo"
                className="logo"
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
    <div
      className="app-container"
      data-theme={theme.mode}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>

      <Sidebar 
        isVisible={state.isSidebarVisible}
        onFileSelect={handleSidebarFileSelect}
        theme={theme}
        onClose={handleCloseSidebar}
        icons={{
          sidebarUnfold: sidebarUnfoldIcon
        }}
      />
      <DragDropOverlay isVisible={isDragging} />

      <div className="main-container" data-theme={theme.mode}>
        <div className="button-group-controls">{/* 왼쪽 버튼 */}
        <button className="btn-icon" onClick={handleToggleSidebar}>
          <img src={sidebarIcon} alt="Sidebar Icon" className="icon" />
        </button>

        <button 
          className="btn-icon"
          onClick={() => setIsSettingsVisible(true)}
        >
          <img src={settingsIcon} alt="Settings Icon" className="icon"/>
        </button>

        <button 
          className="btn-icon"
          onClick={handleCompleteWork}
        >
          <img src={homeIcon} alt="작업 종료" className="icon"/>
        </button>

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
      </div>

      <div className="menu-controls">
  <button className="btn-icon" onClick={handleMenuToggle}>
    <img src={menuIcon} alt="Menu" className="icon" />
  </button>
  
  <div className={`menu-dropdown ${isMenuOpen ? 'visible' : ''}`}>
    <button className="menu-item" onClick={handleToggleOverlay}>
      <img 
        src={state.isOverlayVisible ? eyeIcon : eyeOffIcon} 
        alt="Toggle Overlay" 
        className="menu-icon" 
      />
      <span>
        {state.isOverlayVisible ? '오버레이 숨김' : '오버레이 표시'}
      </span>
    </button>
    <button className="menu-item" onClick={handleSearchToggle}>
    <img src={searchIcon} alt="Search" className="menu-icon" />
    <span>검색</span>
  </button>
    <button className="menu-item" onClick={handleShowDebugConsole}>
      <img src={terminalIcon} alt="Debug" className="menu-icon" />
      <span>디버그 콘솔</span>
    </button>
  </div>
</div>
      
        <div className="page-number">
          {state.currentNumber?.display || '\u00A0'}
        </div>
      
        {state.viewMode === 'overview' ? (
          <Overview 
            paragraphs={state.paragraphs}
            currentParagraph={state.currentParagraph}
            onParagraphClick={handleParagraphClick}
            theme={theme}
            hoveredSection={hoveredSection}
            onHoverChange={setHoveredSection}
          />
        ) : (
          <ListView
            paragraphs={state.paragraphs}
            metadata={state.paragraphsMetadata}
            currentParagraph={state.currentParagraph}
            onParagraphSelect={handleParagraphSelect}
            onCompleteWork={handleCompleteWork} 
            theme={theme}
          />
        )}
            {state.paragraphs.length > 0 && (
      <Search
        ref={searchRef}
        paragraphs={state.paragraphs}
        onSelect={handleParagraphSelect}
        isVisible={isSearchVisible}
        onClose={() => setIsSearchVisible(false)}
        metadata={state.paragraphsMetadata}
      />
    )}
      </div>
      {state.currentFilePath && (
       <div className="file-info-container">
       <div className="file-info-group">
         <span className="file-name">
          {path.basename(state.currentFilePath)}
         </span>
         <span className="paragraph-info">
           - {state.currentParagraph + 1}
         </span>
       </div>
       <div className="path-group">
         <span className="file-path">
           | {formatPath(state.currentFilePath)}
         </span>
       </div>
     </div>
      )}
      <Settings 
        isVisible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        theme={theme}
      />
    </div>
  );
}

export default MainComponent;