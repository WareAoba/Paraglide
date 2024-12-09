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

const ProgramStatus = {
  READY: 'Ready',
  PROCESS: 'Process',
  PAUSE: 'Pause',
  LOADING: 'Loading'
};

// MainComponent.js 수정
function MainComponent() {
  const [state, setState] = useState({
    paragraphs: [],
    currentParagraph: 0,
    currentNumber: null,
    isOverlayVisible: false,
    logoPath: null,
    titlePath: null,
    isSidebarVisible: false,
    programStatus: ProgramStatus.READY,
    isPaused: false,
    viewMode: 'overview',
  });

  const [theme, setTheme] = useState({
    mode: null,
    accentColor: '#007bff',
  });
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
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
  const [searchIcon, setSearchIcon] = useState(null);
  const [pageJumpIcon, setPageJumpIcon] = useState(null);
  const [textFileIcon, setTextFileIcon] = useState(null);
  const [deleteIcon, setDeleteIcon] = useState(null);

  const searchRef = useRef(null);

  const handleSearchToggle = useCallback(() => { // 검색 토글, 위치가 여기 있는게 마음에 안들긴 한데 뭐......
    if (state.programStatus !== ProgramStatus.PROCESS) {
      return;
    }
    setIsSearchVisible(prev => !prev);
    setState(prev => ({
      ...prev,
      isSidebarVisible: false,
    }));
  }, [state.programStatus]);

  const handleCloseEsc = useCallback(() => {
    // 사이드바
    setState(prev => ({
      ...prev,
      isSidebarVisible: false
    }));
    
    // 검색창
    setIsSearchVisible(false);
    
    // 설정창
    setIsSettingsVisible(false);
    
    // 검색 내용 초기화 (필요한 경우)
    if (searchRef.current) {
      searchRef.current.clearSearch();
    }
  }, []);

  useEffect(() => {
    const initializeTheme = async () => {
      const initialTheme = await ipcRenderer.invoke('get-current-theme');
      setTheme(initialTheme);
    };

    // 로고 로드 함수 수정
    const loadLogo = async () => {
      try {
        const [logoData, titleData] = await Promise.all([
          ipcRenderer.invoke('get-logo-path', 'logo'),
          ipcRenderer.invoke('get-logo-path', 'title')
        ]);
    
        setState(prev => ({
          ...prev,
          logoPath: logoData,
          titlePath: titleData
        }));
      } catch (error) {
        console.error('로고/타이틀 로드 실패:', error);
      }
    };

    // 초기 상태 로드
    const initializeState = async () => {
      try {
        const initialState = await ipcRenderer.invoke('get-state');
        const savedSettings = await ipcRenderer.invoke('load-settings');

        setState((prev) => ({
          ...prev,
          programStatus: initialState.programStatus,
          isOverlayVisible: initialState.isOverlayVisible,
          viewMode: savedSettings.viewMode || 'overview',
        }));
        initializeTheme();
        loadLogo();
      } catch (error) {
        console.error('초기 상태 로드 실패:', error);
      }
    };

    // 상태 업데이트 핸들러
    const handleStateUpdate = (event, updatedState) => {
      setState((prev) => ({
        ...prev,
        ...updatedState,
        currentNumber:
          updatedState.paragraphsMetadata?.[updatedState.currentParagraph]?.pageInfo ||
          null,
      }));
    };

    const clearSearchHandler = () => {
      // 검색창 초기화 핸들러
      if (searchRef.current) {
        searchRef.current.clearSearch(); // Search 컴포넌트의 clearSearch 메서드 호출
      }
    };

    // 테마 변경 핸들러
    const handleThemeUpdate = (_, newTheme) => {
      setTheme(newTheme);
      loadLogo(newTheme);
      document.documentElement.style.setProperty('--primary-color', newTheme.accentColor);
    };

    const handleViewModeUpdate = (event, newViewMode) => {
      setState((prev) => ({
        ...prev,
        viewMode: newViewMode,
      }));
    };

    // 이벤트 리스너 등록
    ipcRenderer.on('state-update', handleStateUpdate);
    ipcRenderer.on('theme-update', handleThemeUpdate);
    ipcRenderer.on('view-mode-update', handleViewModeUpdate);
    ipcRenderer.on('clear-search', clearSearchHandler);
    ipcRenderer.on('trigger-load-file', handleLoadFile);
    ipcRenderer.on('toggle-search', handleSearchToggle);
    ipcRenderer.on('toggle-settings', handleSettingsToggle);
    ipcRenderer.on('close-esc', handleCloseEsc);

    // 초기화
    initializeState();

    // 클린업
    return () => {
      ipcRenderer.removeListener('state-update', handleStateUpdate);
      ipcRenderer.removeListener('theme-update', handleThemeUpdate);
      ipcRenderer.removeListener('view-mode-update', handleViewModeUpdate);
      ipcRenderer.removeListener('clear-search', clearSearchHandler);
      ipcRenderer.removeListener('trigger-load-file', handleLoadFile);
      ipcRenderer.removeListener('toggle-search', handleSearchToggle);
      ipcRenderer.removeListener('toggle-settings', handleSettingsToggle);
      ipcRenderer.removeListener('close-esc', handleCloseEsc);
    };
  }, [handleSearchToggle]);

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
    setDragCounter((prev) => {
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
    setDragCounter((prev) => {
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
    const txtFile = files.find((file) => file.name.endsWith('.txt'));

    if (txtFile) {
      try {
        // 파일 경로 추출 (Electron의 경우)
        const filePath = txtFile.path;

        // 기존 open-file 핸들러 재사용
        const result = await ipcRenderer.invoke('open-file', {
          filePath,
          source: 'drag-drop',
        });

        if (result.success) {
          const newState = await ipcRenderer.invoke('get-state');
          setState((prev) => ({ ...prev, ...newState }));
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
          'play.svg',
          'pause.svg',
          'terminal-tag.svg',
          'settings.svg',
          'sidebar.svg',
          'home.svg',
          'eyes.svg',
          'eyes-off.svg',
          'sidebar-unfold.svg',
          'search.svg',
          'page-jump.svg',
          'text-file.svg',
          'delete.svg',
        ];

        const iconPaths = await Promise.all(
          iconNames.map((name) => ipcRenderer.invoke('get-icon-path', name))
        );

        setPlayIcon(iconPaths[0]);
        setPauseIcon(iconPaths[1]);
        setTerminalIcon(iconPaths[2]);
        setSettingsIcon(iconPaths[3]);
        setSidebarIcon(iconPaths[4]);
        setHomeIcon(iconPaths[5]);
        setEyeIcon(iconPaths[6]);
        setEyeOffIcon(iconPaths[7]);
        setsidebarUnfoldIcon(iconPaths[8]);
        setSearchIcon(iconPaths[9]);
        setPageJumpIcon(iconPaths[10]);
        setTextFileIcon(iconPaths[11]);
        setDeleteIcon(iconPaths[12]);
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
    setState((prev) => ({
      ...prev,
      isOverlayVisible: !prev.isOverlayVisible,
    }));
    ipcRenderer.send('toggle-overlay');
  };

  // 파일 로드 핸들러 수정
  const handleLoadFile = async () => {
    try {
      // 통합된 open-file 핸들러 사용
      const result = await ipcRenderer.invoke('open-file', {
        source: 'dialog', // 다이얼로그를 통한 파일 열기임을 명시
      });

      if (result.success) {
        const newState = await ipcRenderer.invoke('get-state');
        setState((prev) => ({ ...prev, ...newState }));
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
    setState((prev) => ({
      ...prev,
      isSidebarVisible: !prev.isSidebarVisible,
    }));
  };

  // 사이드바 닫기 함수
  const handleCloseSidebar = () => {
    setState((prev) => ({
      ...prev,
      isSidebarVisible: false,
    }));
  };

  const handleSettingsToggle = () => { // 설정 토글
    setIsSettingsVisible((prev) => !prev);
    setState(prev => ({
      ...prev,
      isSidebarVisible: false,
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
        setState((prev) => ({
          ...prev,
          isSidebarVisible: false,
        }));
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  // handleCompleteWork 함수 수정
  const handleCompleteWork = () => {
    ipcRenderer.send('update-state', {
      programStatus: ProgramStatus.READY,  // 수정
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      currentFilePath: null,
      isPaused: false,
      isOverlayVisible: false,
    });

    setState(prevState => ({
      ...prevState,
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      currentFilePath: null,
      isPaused: false,
      isOverlayVisible: false,
      programStatus: ProgramStatus.READY,  // 수정
    }));
  };

  // 디버그 콘솔 표시 핸들러 추가
  const handleShowDebugConsole = () => {
    ipcRenderer.send('show-debug-console');
  };

  // MainComponent.js의 웰컴 스크린 return문 수정
  if (state.paragraphs.length === 0 || state.programStatus === ProgramStatus.READY) {
    return (
      <div
        className="app-container"
        data-theme={theme.mode}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Sidebar
          isVisible={state.isSidebarVisible}
          onFileSelect={handleSidebarFileSelect}
          theme={theme}
          onClose={handleCloseSidebar}
          icons={{
            sidebarUnfold: sidebarUnfoldIcon,
            eye: eyeIcon,
            eyeOff: eyeOffIcon,
            searchIcon: searchIcon,
            terminalIcon: terminalIcon,
            deleteIcon: deleteIcon
          }}
          titlePath={state.titlePath}
          currentFilePath={state.programStatus === ProgramStatus.PROCESS ? state.currentFilePath : null}
          onToggleOverlay={handleToggleOverlay}
          onToggleSearch={handleSearchToggle}
          onShowDebugConsole={handleShowDebugConsole}
          isOverlayVisible={state.isOverlayVisible}
        />
        <DragDropOverlay isVisible={isDragging} />

        <div className="welcome-screen" data-theme={theme.mode}>
          <div className="button-group-controls">
            <button className="btn-icon" onClick={handleToggleSidebar}>
              <img src={sidebarIcon} alt="Sidebar Icon" className="icon" />
            </button>
            <button className="btn-icon" onClick={() => setIsSettingsVisible(true)}>
              <img src={settingsIcon} alt="Settings Icon" className="icon" />
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
  {state.titlePath ? (
    <img
      src={state.titlePath}
      alt="Paraglide Title"
      className="title-image"
      onError={(e) => {
        console.error('타이틀 렌더링 실패:', e);
        e.target.style.display = 'none';
      }}
    />
  ) : (
    <h1 className="title">Paraglide</h1>
  )}
</div>
          <div className="button-container">
            <button className="btn-primary" onClick={handleLoadFile}>
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
      onDrop={handleDrop}
    >
      <Sidebar
        isVisible={state.isSidebarVisible}
        onFileSelect={handleSidebarFileSelect}
        theme={theme}
        onClose={handleCloseSidebar}
        icons={{
          sidebarUnfold: sidebarUnfoldIcon,
          eye: eyeIcon,
          eyeOff: eyeOffIcon,
          searchIcon: searchIcon,
          terminalIcon: terminalIcon,
          textFileIcon: textFileIcon,
          deleteIcon: deleteIcon,
        }}
        titlePath={state.titlePath}
        currentFilePath={state.currentFilePath} // programStatus 대신 currentFilePath
        currentFile={{                         // currentFile prop 추가
          name: path.basename(state.currentFilePath || ''),
          path: state.currentFilePath,
          currentPage: state.paragraphsMetadata[state.currentParagraph]?.pageNumber || 1,
          totalPages: Math.max(...state.paragraphsMetadata
            .filter(meta => meta?.pageNumber != null)
            .map(meta => meta.pageNumber)) || 1
        }}
        onToggleOverlay={handleToggleOverlay}
        onToggleSearch={handleSearchToggle}
        onShowDebugConsole={handleShowDebugConsole}
        isOverlayVisible={state.isOverlayVisible}
      />
      <DragDropOverlay isVisible={isDragging} />

      <div className="main-container" data-theme={theme.mode}>
        <div className="button-group-controls">
          {/* 왼쪽 버튼 */}
          <button className="btn-icon" onClick={handleToggleSidebar}>
            <img src={sidebarIcon} alt="Sidebar Icon" className="icon" />
          </button>

          <button className="btn-icon" onClick={() => setIsSettingsVisible(true)}>
            <img src={settingsIcon} alt="Settings Icon" className="icon" />
          </button>

          <button className="btn-icon" onClick={handleCompleteWork}>
            <img src={homeIcon} alt="작업 종료" className="icon" />
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
          <button 
            className={`btn-icon ${state.isOverlayVisible ? 'btn-active' : 'btn-outline'}`}
            onClick={handleToggleOverlay}
          >
            {state.isOverlayVisible ?
              <img src={eyeIcon} alt="일시정지" className="icon" />
               : 
              <img src={eyeOffIcon} alt="일시정지" className="icon" /> }
          </button>
        </div>

        {state.viewMode === 'overview' ? (
  <>
  <div className="page-number">
    {state.currentNumber?.display || '\u00A0'}
  </div>
  <Overview
    paragraphs={state.paragraphs}
    currentParagraph={state.currentParagraph}
    onParagraphClick={handleParagraphClick}
    theme={theme}
    hoveredSection={hoveredSection}
    onHoverChange={setHoveredSection}
  />
</>
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
            icons={{
              searchIcon: searchIcon,
              pageJumpIcon: pageJumpIcon,
            }}
            theme={theme}
          />
        )}
      </div>
      {state.currentFilePath && (
        <div className="file-info-container">
          <div className="file-info-group">
            <span className="file-name">{path.basename(state.currentFilePath)}</span>
            <span className="paragraph-info">
        {` - ${state.paragraphsMetadata[state.currentParagraph]?.pageNumber || '?'}`}
        /
        {`${Math.max(...state.paragraphsMetadata
          .filter(meta => meta?.pageNumber != null)
          .map(meta => meta.pageNumber)) || '?'}`}P.{' '}{' '}
        {`(${state.currentParagraph + 1})`}
      </span>
          </div>
          <div className="path-group">
            <span className="file-path">| {formatPath(state.currentFilePath)}</span>
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
