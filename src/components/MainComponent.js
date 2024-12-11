// src/MainComponent.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CSSTransition } from 'react-transition-group';
import '../CSS/MainComponent.css';
import '../CSS/Views/ComponentTransition.css'
import Sidebar from './Sidebar';
import Settings from './Settings';
import Overview from './Views/Overview';
import ListView from './Views/ListView';
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
  const [themeAutoIcon, setThemeAutoIcon] = useState(null);
  const [themeLightIcon, setThemeLightIcon] = useState(null);
  const [themeDarkIcon, setThemeDarkIcon] = useState(null);
  const [fileOpenIcon, setFileOpenIcon] = useState(null);
  const [editIcon, setEditIcon] = useState(null);
  const [backIcon, setBackIcon] = useState(null);

  const searchRef = useRef(null);

  const handleSearchToggle = useCallback(() => { // 검색 토글, 위치가 여기 있는게 마음에 안들긴 한데 뭐......
    if (state.programStatus !== ProgramStatus.PROCESS) return;

  // 검색 상태가 유지된 채로 사이드바가 닫혀있는 경우
  if (isSearchVisible && !state.isSidebarVisible) {
    // 사이드바만 열기
    setState(prev => ({
      ...prev,
      isSidebarVisible: true
    }));
    return;
  }

  // 사이드바가 닫혀있으면 열기
  if (!state.isSidebarVisible) {
    setState(prev => ({
      ...prev,
      isSidebarVisible: true
    }));
  }
  
  // 검색 토글
  setIsSearchVisible(prev => !prev);
}, [state.programStatus, state.isSidebarVisible, isSearchVisible]);

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
      try {
        const initialTheme = await ipcRenderer.invoke('get-current-theme');
        setTheme(initialTheme);
        themeCalc(initialTheme.accentColor);
        loadLogo(initialTheme);
      } catch (error) {
        console.error('[MainComponent] 초기 테마 설정 실패:', error);
      }
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
      if (!newTheme) return;
      
      setTheme(newTheme);
      loadLogo(newTheme);
      themeCalc(newTheme.accentColor);
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
    ipcRenderer.on('toggle-sidebar', handleToggleSidebar);
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
      ipcRenderer.removeListener('toggle-sidebar', handleToggleSidebar);
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

  const handleParagraphSelect = useCallback((index) => {
    console.log('MainComponent - handleParagraphSelect called with index:', index);
    
    if (typeof index !== 'number') {
      console.error('Invalid paragraph index:', index);
      return;
    }
  
    try {
      // move-to-position 이벤트로 변경
      ipcRenderer.send('move-to-position', index);
      
      // 상태 업데이트는 IPC 응답을 통해 처리되도록 함
      setState(prev => ({
        ...prev,
        isPaused: true  // 이동 시 일시정지 상태로 전환
      }));
  
      console.log('Position update request sent:', index);
    } catch (error) {
      console.error('Failed to update position:', error);
    }
  }, []);

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
          'theme-auto.svg',
          'theme-light.svg',
          'theme-dark.svg',
          'file-open.svg',
          'edit.svg',
          'go-back.svg',
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
        setThemeAutoIcon(iconPaths[13]);
        setThemeLightIcon(iconPaths[14]);
        setThemeDarkIcon(iconPaths[15]);
        setFileOpenIcon(iconPaths[16]);
        setEditIcon(iconPaths[17]);
        setBackIcon(iconPaths[18]);
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
    // 사이드바가 닫혀있고 검색이 열려있는 상태라면
    if (!state.isSidebarVisible && isSearchVisible) {
      // 사이드바만 열기
      setState(prev => ({
        ...prev,
        isSidebarVisible: true
      }));
      return;
    }
  
    // 사이드바가 열려있고 검색이 열려있는 상태라면
    if (state.isSidebarVisible && isSearchVisible) {
      // 검색을 먼저 닫기
      setIsSearchVisible(false);
      return;
    }
  
    // 그 외의 경우는 일반적인 사이드바 토글
    setState(prev => ({
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
    // 공통 상태 객체 정의
    const resetState = {
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      currentFilePath: null,
      isPaused: false,
      isOverlayVisible: false,
      programStatus: ProgramStatus.READY
    };
  
    // IPC로 상태 업데이트 전송
    ipcRenderer.send('update-state', resetState);
  
    // 로컬 상태 업데이트
    setState(prev => ({
      ...prev,
      ...resetState
    }));
  };

// themeCalc 함수 수정
const themeCalc = (accentColor, defaultColor = '#007bff') => {
  try {
    const root = document.documentElement;
    
    // 기본 색상 설정
    root.style.setProperty('--primary-color', accentColor);

    // RGB/HSL 계산...
    const rgb = hexToRgb(accentColor);
    const hsl = hexToHSL(accentColor);
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    const combinedBrightness = (luminance + (hsl.l / 100)) / 2;

    // 즉시 설정할 변수들 적용
    const immediateVars = {
      '--primary-text': combinedBrightness > 0.6 ? '#333' : '#f5f5f5',
      '--primary-filter': combinedBrightness > 0.6 
        ? 'invert(19%) sepia(0%) saturate(2%) hue-rotate(82deg) brightness(96%) contrast(96%)'
        : 'invert(99%) sepia(15%) saturate(70%) hue-rotate(265deg) brightness(113%) contrast(92%)',
      '--primary-color-shadow-up': `hsla(${hsl.h}, ${hsl.s}%, ${Math.min(hsl.l + 5, 100)}%, 0.2)`,
      '--primary-color-shadow-down': `hsla(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 5, 0)}%, 0.2)`,
      '--logo-filter': `hue-rotate(${hsl.h - hexToHSL(defaultColor).h}deg) saturate(${(hsl.s / hexToHSL(defaultColor).s) * 100}%) brightness(${(hsl.l / hexToHSL(defaultColor).l) * 100}%)`
    };

    // 즉시 적용
    Object.entries(immediateVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

// IPC를 통해 필터 값 가져오기
ipcRenderer.invoke('generate-css-filter', accentColor, {
  acceptanceLossPercentage: 1,
  maxChecks: 10
}).then(colorFilter => {
  if (colorFilter && colorFilter.filter) {
    const filterValue = colorFilter.filter.replace(/;$/, '').trim();
    root.style.setProperty('--primary-color-filter', filterValue);    // CSS 변수 설정
    
    ipcRenderer.send('update-theme-variables', {
      '--primary-color': accentColor,
      '--primary-color-filter': filterValue,
      ...immediateVars
    });
  }
}).catch(error => {
  console.error('[MainComponent] CSS 필터 생성 실패:', error);
});

  } catch (error) {
    console.error('[MainComponent] CSS 변수 업데이트 실패:', error);
  }
};

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const hexToHSL = (hex) => {
    const rgb = hexToRgb(hex);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
  
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
  
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
  
    return {
      h: h * 360,
      s: s * 100,
      l: l * 100
    };
  };

  // 디버그 콘솔 표시 핸들러 추가
  const handleShowDebugConsole = () => {
    ipcRenderer.send('show-debug-console');
  };

  // MainComponent.js의 웰컴 스크린 return문 수정
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
        isSidebarVisible={state.isSidebarVisible}
        isSearchVisible={isSearchVisible}
        onFileSelect={handleSidebarFileSelect}
        theme={theme}
        onClose={handleCloseSidebar}
        status={state.programStatus === ProgramStatus.READY ? 'ready' : 'process'}
        icons={{
          sidebarUnfold: sidebarUnfoldIcon,
          eye: eyeIcon,
          eyeOff: eyeOffIcon,
          searchIcon: searchIcon,
          pageJumpIcon: pageJumpIcon,
          terminalIcon: terminalIcon,
          textFileIcon: textFileIcon,
          deleteIcon: deleteIcon,
          openIcon: fileOpenIcon,
          editIcon: editIcon,
          backIcon: backIcon,
        }}
        titlePath={state.titlePath}
        currentFilePath={state.currentFilePath}
        currentFile={state.programStatus === ProgramStatus.PROCESS ? {
          name: path.basename(state.currentFilePath || ''),
          path: state.currentFilePath,
          currentPage: state.paragraphsMetadata[state.currentParagraph]?.pageNumber || 1,
          totalPages: Math.max(...state.paragraphsMetadata
            .filter(meta => meta?.pageNumber != null)
            .map(meta => meta.pageNumber)) || 1
        } : null}
        currentParagraph={state.currentParagraph}
        paragraphs={state.paragraphs}
        metadata={state.paragraphsMetadata}
        onSelect={handleParagraphSelect}
        onToggleOverlay={handleToggleOverlay}
        onToggleSearch={handleSearchToggle}
        onShowDebugConsole={handleShowDebugConsole}
        isOverlayVisible={state.isOverlayVisible}
      />
      
      <DragDropOverlay isVisible={isDragging} />
  
      <div className="button-group-controls">
        <button className="btn-icon" onClick={handleToggleSidebar}>
          <img src={sidebarIcon} alt="Sidebar Icon" className="icon" />
        </button>
        <button className="btn-icon" onClick={() => setIsSettingsVisible(true)}>
          <img src={settingsIcon} alt="Settings Icon" className="icon" />
        </button>
        {state.programStatus === ProgramStatus.PROCESS && (
          <>
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
                <img src={eyeIcon} alt="오버레이 켜짐" className="icon" />
                : 
                <img src={eyeOffIcon} alt="오버레이 꺼짐" className="icon" />
              }
            </button>
          </>
        )}
      </div>
  
      <CSSTransition
        in={state.programStatus === ProgramStatus.READY}
        appear={true}
        timeout={500}
        classNames="viewport" // 여기서 classNames를 "viewport"로 변경
        mountOnEnter
        unmountOnExit
      >
        <div className="welcome-screen" data-theme={theme.mode}>
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
              <img src={fileOpenIcon} alt="파일 불러오기" className="icon-primary" />
              <span>파일 불러오기</span>
            </button>
          </div>
        </div>
      </CSSTransition>
  
      <CSSTransition
        in={state.programStatus === ProgramStatus.PROCESS}
        timeout={500}
        classNames="viewport"
        mountOnEnter
        unmountOnExit
      >
        <div className="main-container" data-theme={theme.mode}>
          <div className="view-container">
            <CSSTransition
              in={state.viewMode === 'overview'}
              timeout={500} // timeout을 500ms로 설정하여 리스트뷰와 통일
              classNames="viewport" // classNames를 'viewport'로 변경하여 동일한 효과 적용
              mountOnEnter
              unmountOnExit
            >
              <div className="view-wrapper">
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
              </div>
            </CSSTransition>
  
            <CSSTransition
              in={state.viewMode === 'listview'}
              timeout={300}
              classNames="view-transition"
              mountOnEnter
              unmountOnExit
            >
              <div className="view-wrapper">
                <ListView
                  paragraphs={state.paragraphs}
                  metadata={state.paragraphsMetadata}
                  currentParagraph={state.currentParagraph}
                  onParagraphSelect={handleParagraphSelect}
                  onCompleteWork={handleCompleteWork}
                  theme={theme}
                />
              </div>
            </CSSTransition>
          </div>
  
          {state.currentFilePath && (
            <div className="file-info-container">
              <div className="file-info-group">
                <span className="file-name">{path.basename(state.currentFilePath)}</span>
                <span className="paragraph-info">
                  {(() => {
                    // 페이지 메타데이터 유효성 검사
                    const hasPageNumbers = state.paragraphsMetadata.some(meta => meta?.pageNumber != null);
                    const currentPage = state.paragraphsMetadata[state.currentParagraph]?.pageNumber;
                    
                    if (!hasPageNumbers) {
                      return " - 페이지 정보 없음 ";
                    }

                    const maxPage = Math.max(
                      ...state.paragraphsMetadata
                        .filter(meta => meta?.pageNumber != null)
                        .map(meta => meta.pageNumber)
                    );

                    return ` - ${currentPage || '?'}/${maxPage}P.`;
                  })()}
                  {` (${Math.round((state.currentParagraph + 1) / state.paragraphs.length * 100)}%)`}
                </span>
              </div>
              <div className="path-group">
                <span className="file-path">| {formatPath(state.currentFilePath)}</span>
              </div>
            </div>
          )}
        </div>
      </CSSTransition>
  
      <Settings
        isVisible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        theme={theme}
        icons={{
          themeAuto: themeAutoIcon,
          themeLight: themeLightIcon,
          themeDark: themeDarkIcon,
        }}
      />
    </div>
  );
};

export default MainComponent;
