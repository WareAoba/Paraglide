// src/MainComponent.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { useTranslation } from 'react-i18next';
import '../CSS/MainComponent.css';
import '../CSS/Views/ComponentTransition.css';
import Sidebar from './Sidebar';
import Settings from './Settings';
import Welcome from './Views/Welcome';
import TextEditor from './Views/TextEditor';
import Overview from './Views/Overview';
import ListView from './Views/ListView';
import DragDropOverlay from './Views/DragDropOverlay';
const path = window.require('path');
const { ipcRenderer } = window.require('electron');

const ProgramStatus = {
  READY: 'Ready',
  PROCESS: 'Process',
  PAUSE: 'Pause',
  LOADING: 'Loading',
  EDIT: 'Edit'
};

// MainComponent.js 수정
function MainComponent() {

  const { t } = useTranslation();

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
    viewMode: null,
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
  const [isEditorSaved, setIsEditorSaved] = useState(true);

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
  const [folderIcon, setFolderIcon] = useState(null);
  const [finderIcon, setFinderIcon] = useState(null);
  const [newFileIcon, setNewFileIcon] = useState(null);
  const [fileWorkIcon, setFileWorkIcon] = useState(null);

  const searchRef = useRef(null);

  const handleSearchToggle = useCallback((forceValue = null, fromSidebar = false) => { // 검색 토글, 위치가 여기 있는게 마음에 안들긴 한데 뭐......
    if (state.programStatus !== ProgramStatus.PROCESS) return;

    // boolean 값으로 확실하게 변환 
    const newSearchState = forceValue === null ? !isSearchVisible : Boolean(forceValue);
    
    if (newSearchState === isSearchVisible) {
      // 이미 원하는 상태면 닫기 동작
      if (isSearchVisible) {
        setIsSearchVisible(false);
        if (!state.wasInitiallySidebarOpen) {
          setState(prev => ({
            ...prev,
            isSidebarVisible: false
          }));
        }
      }
      return;
    }
  
    // 상태 업데이트
    setIsSearchVisible(newSearchState);
  
    if (newSearchState) {
      // 검색창 열기
      setState(prev => ({
        ...prev,
        isSidebarVisible: true,
        wasInitiallySidebarOpen: fromSidebar || prev.isSidebarVisible
      }));
    } else {
      // 검색창 닫기
      if (!state.wasInitiallySidebarOpen) {
        setState(prev => ({
          ...prev,
          isSidebarVisible: false,
          wasInitiallySidebarOpen: false
        }));
      }
    }
  }, [state.programStatus, state.isSidebarVisible, state.wasInitiallySidebarOpen, isSearchVisible]);

  const handleCloseEsc = useCallback(() => {
    // 검색이 열려있으면 검색만 닫기
    if (isSearchVisible) {
      handleSearchToggle(false);
      return;
    }
  
    // 사이드바가 열려있으면 사이드바 닫기
    if (state.isSidebarVisible) {
      setState(prev => ({
        ...prev,
        isSidebarVisible: false,
        wasInitiallySidebarOpen: false
      }));
    }
  
    // 설정창 닫기
    setIsSettingsVisible(false);
  
    // 검색 내용 초기화
    if (searchRef.current) {
      searchRef.current.clearSearch();
    }
  }, [isSearchVisible, state.isSidebarVisible]);

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
      setState((prev) => {
        const pageInfo = updatedState.paragraphsMetadata?.[updatedState.currentParagraph]?.pageInfo;
        const display = pageInfo ? {
          text: pageInfo.end !== pageInfo.start ? 
            `${pageInfo.start}-${pageInfo.end}` :  // 합페이지
            `${pageInfo.start}`,                   // 단일 페이지
          isRange: pageInfo.end !== pageInfo.start // 합페이지 여부
        } : null;
    
        return {
          ...prev,
          ...updatedState,
          currentNumber: { ...pageInfo, display }
        };
      });
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
      // 에디터 모드로 변경될 때
      if (newViewMode === 'editor') {
        setState(prev => ({
          ...prev,
          viewMode: newViewMode,
        }));
        ipcRenderer.send('toggle-overlay', false); // 오버레이 윈도우 숨기기
      } 
      // 에디터 모드에서 다른 모드로 변경될 때
      else if (state.viewMode === 'editor') {
        // 이전 상태 복구
        ipcRenderer.invoke('get-state').then(globalState => {
          setState(prev => ({
            ...prev,
            viewMode: newViewMode,
          }));
        });
      }
      // 그 외의 viewMode 변경
      else {
        setState(prev => ({
          ...prev,
          viewMode: newViewMode,
        }));
      }
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
        const filePath = txtFile.path;
  
        // EDIT 모드일 때는 에디터에서 파일 열기
        if (state.programStatus === ProgramStatus.EDIT) {
          const content = await ipcRenderer.invoke('read-file', filePath);
          setState(prev => ({
            ...prev,
            currentFilePath: filePath,
            programStatus: ProgramStatus.EDIT,
            viewMode: 'editor'
          }));
  
          // IPC 상태 업데이트
          ipcRenderer.send('update-state', {
            currentFilePath: filePath,
            programStatus: ProgramStatus.EDIT
          });
        } else {
          // PROCESS 모드 처리
          const result = await ipcRenderer.invoke('open-file', {
            filePath,
            source: 'drag-drop',
          });
  
          if (result.success) {
            const newState = await ipcRenderer.invoke('get-state');
            setState(prev => ({
              ...prev,
              ...newState,
              isSidebarVisible: false
            }));
          }
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
          'folder.svg',
          'finder.svg',
          'new-file.svg',
          'file-work.svg'
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
        setFolderIcon(iconPaths[19]);
        setFinderIcon(iconPaths[20]);
        setNewFileIcon(iconPaths[21]);
        setFileWorkIcon(iconPaths[22]);
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

  const handleNewFile = async () => {
    const newState = {
      programStatus: ProgramStatus.EDIT,  // PROCESS -> EDIT
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      currentFilePath: null,
      paragraphsMetadata: [],
      isPaused: false,
    };
  
    // 1. 로컬 상태 업데이트
    setState(prev => ({
      ...prev,
      ...newState
    }));
  
    // 2. 상태 업데이트 
    ipcRenderer.send('update-state', newState);
  };
  
  // viewMode 변경 시 에디터 보존 로직 추가
  useEffect(() => {
    const handleViewModeUpdate = (event, newViewMode) => {
      // 에디터에서 다른 모드로 전환될 때도 허용
      setState(prev => ({
        ...prev,
        viewMode: newViewMode,
      }));
  
      // 에디터가 아닌 모드로 전환 시 오버레이 상태 복구
      if (newViewMode !== 'editor') {
        ipcRenderer.invoke('get-state').then(globalState => {
        });
      }
    };
  
    ipcRenderer.on('view-mode-update', handleViewModeUpdate);
    return () => {
      ipcRenderer.removeListener('view-mode-update', handleViewModeUpdate);
    };
  }, [state.programStatus]);

  // 파일 로드 핸들러 수정
  const handleLoadFile = async (options = {}) => {
    try {
      console.log('Loading file with options:', options); // 디버깅용
  
      const result = await ipcRenderer.invoke('open-file', {
        source: options.source || 'dialog',
        viewMode: options.viewMode || 'overview',
        filePath: options.filePath,
        programStatus: options.programStatus
      });
  
      if (result.success) {
        // 상태 업데이트
        setState((prev) => ({
          ...prev,
          currentFilePath: options.filePath || prev.currentFilePath,
          programStatus: options.viewMode === 'editor' ? ProgramStatus.EDIT : ProgramStatus.PROCESS,
          viewMode: options.viewMode || 'overview',
          isSidebarVisible: false
        }));
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
  const handleToggleSidebar = useCallback(() => {
    // 사이드바가 닫혀있고 검색이 열려있는 경우
    if (!state.isSidebarVisible && isSearchVisible) {
      setIsSearchVisible(false); // 검색 닫기
    }
  
    // 사이드바 토글
    setState(prev => ({
      ...prev,
      isSidebarVisible: !prev.isSidebarVisible
    }));
  }, [state.isSidebarVisible, isSearchVisible]);

  // 사이드바 닫기 함수
  const handleCloseSidebar = () => {
    // 검색창과 사이드바 모두 닫기
    setIsSearchVisible(false);  // 검색창 닫기
    setState((prev) => ({
      ...prev,
      isSidebarVisible: false,
      wasInitiallySidebarOpen: false
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
  const handleCompleteWork = async () => {
    try {
      // 에디터 모드일 때만 확인
      if (state.programStatus === ProgramStatus.EDIT && !isEditorSaved) {
        // 저장되지 않은 변경사항이 있음을 알림
        ipcRenderer.send('update-saved-state', isEditorSaved);
        const saveChoice = await ipcRenderer.invoke('show-dialog', 'UNSAVED_CHANGES');
        if (saveChoice === 1) return; // 취소
      }
  
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
      setIsSearchVisible(false);
    } catch (error) {
      console.error('작업 종료 중 오류:', error);
    }
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
    const shadowUpVars = {
      h: hsl.h - 3,  // 색조 3도 감소
      s: Math.max(0, hsl.s - 30), // 채도 1% 감소
      l: Math.max(0, hsl.l - 4)  // 명도 4% 감소
    };

    const shadowDownVars = {
      h: hsl.h,      // 색조 유지
      s: Math.max(0, hsl.s - 20), // 채도 20% 감소
      l: Math.min(100, hsl.l + 10) // 명도 5% 증가
    };

    // 즉시 설정할 변수들 적용
    const immediateVars = {
      '--primary-text': combinedBrightness > 0.6 ? '#333' : '#f5f5f5',
      '--primary-filter': combinedBrightness > 0.6 
        ? 'invert(19%) sepia(0%) saturate(2%) hue-rotate(82deg) brightness(96%) contrast(96%)'
        : 'invert(99%) sepia(15%) saturate(70%) hue-rotate(265deg) brightness(113%) contrast(92%)',
        '--primary-color-shadow-up': `hsla(${shadowUpVars.h}, ${shadowUpVars.s}%, ${shadowUpVars.l}%, 1)`,
        '--primary-color-shadow-down': `hsla(${shadowDownVars.h}, ${shadowDownVars.s}%, ${shadowDownVars.l}%, 1)`,
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
        status={state.programStatus}  // 문자열이 아닌 상태값 직접 전달
        ProgramStatus={ProgramStatus}
        theme={theme}
        onClose={handleCloseSidebar}
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
          fileWorkIcon: fileWorkIcon,
          backIcon: backIcon,
          folderIcon: folderIcon,
          finderIcon: finderIcon
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
        wasInitiallySidebarOpen={state.wasInitiallySidebarOpen}
        isEditorSaved={isEditorSaved}
        setState={setState}
      />
      
      <DragDropOverlay isVisible={isDragging} />
  
      <div className="button-group-controls">
  <button className="btn-icon" onClick={handleToggleSidebar}>
    <img src={sidebarIcon} alt="Sidebar Icon" className="icon" />
  </button>
  <button className="btn-icon" onClick={() => setIsSettingsVisible(true)}>
    <img src={settingsIcon} alt="Settings Icon" className="icon" />
    </button>
  {(state.programStatus === ProgramStatus.PROCESS || 
    state.programStatus === ProgramStatus.EDIT) && (
    <>
      <button className="btn-icon" onClick={handleCompleteWork}>
        <img src={homeIcon} alt="작업 종료" className="icon" />
      </button>
      {state.programStatus === ProgramStatus.PROCESS && (
        <>
          <button
          className={`btn-icon ${state.isPaused
          ? 'btn-danger' : 'btn-success'}`}
          onClick={handleTogglePause}>
            {state.isPaused ? <img src={playIcon}
          alt="재생" className="icon" />
          : <img src={pauseIcon}
          alt="일시정지" className="icon" />}
          </button>

          <button
          className={`btn-icon ${state.isOverlayVisible
          ? 'btn-active' : 'btn-outline'}`}
          onClick={handleToggleOverlay}>
            {state.isOverlayVisible ? <img src={eyeIcon}
          alt="오버레이 켜짐" className="icon" />
          : <img src={eyeOffIcon}
          alt="오버레이 꺼짐" className="icon" />}
          </button>
        </>
      )}
    </>
  )}
</div>
  
      <div className="content-area">
      <TransitionGroup component={null}>
        {(() => {
          switch (state.programStatus) {
            case ProgramStatus.READY:
              return (
                <CSSTransition
                key="welcome"
                timeout={500}
                classNames="viewport"
                mountOnEnter
                unmountOnExit
                >
                  <div className="view-wrapper">
                  <Welcome
                  onLoadFile={handleLoadFile}
                  onNewFile={handleNewFile}
                  logoPath={state.logoPath}
                  titlePath={state.titlePath}
                  theme={theme}
                  fileOpenIcon={fileOpenIcon}
                  newFileIcon={newFileIcon}
                  />
                  </div>
                </CSSTransition>
              );

            case ProgramStatus.EDIT:
              return (
                <CSSTransition
                key="editor"
                timeout={500}
                classNames="viewport"
                mountOnEnter
                unmountOnExit
                >
                  <div className="view-wrapper">
                    <TextEditor
                    theme={theme}
                    currentFilePath={state.currentFilePath}
                    onSavedStateChange={setIsEditorSaved}
                    />
                  </div>
                </CSSTransition>
              );

            case ProgramStatus.PROCESS:
              return (
                <CSSTransition
                key="process"
                timeout={500}
                classNames="viewport"
                mountOnEnter
                unmountOnExit>
                  <div className="main-container" data-theme={theme.mode}>
                    <div className="view-container">
                      <TransitionGroup component={null}>
                        {state.viewMode === 'overview' ? (
                          <CSSTransition
                          key="overview"
                          timeout={500}
                          classNames="viewport"
                          mountOnEnter
                          unmountOnExit
                          >
                            <Overview
                            paragraphs={state.paragraphs}
                            currentParagraph={state.currentParagraph}
                            currentNumber={state.currentNumber}
                            onParagraphClick={handleParagraphClick}
                            theme={theme}
                            hoveredSection={hoveredSection}
                            onHoverChange={setHoveredSection}
                            paragraphsMetadata={state.paragraphsMetadata}
                            onCompleteWork={handleCompleteWork}
                            />
                          </CSSTransition>
                        ) : (
                          <CSSTransition
                          key="listview"
                          timeout={500}
                          classNames="viewport"
                          mountOnEnter
                          unmountOnExit>
                            <ListView
                            paragraphs={state.paragraphs}
                            metadata={state.paragraphsMetadata}
                            currentParagraph={state.currentParagraph}
                            onParagraphSelect={handleParagraphSelect}
                            onCompleteWork={handleCompleteWork}
                            theme={theme} />
                          </CSSTransition>
                        )}
                      </TransitionGroup>
                      {state.currentFilePath && (
                        <div className="file-info-container">
                      <div className="file-info-group">
                        <span className="file-name">{path.basename(state.currentFilePath)}</span>
                        <span className="paragraph-info">
                          {(() => {
                            const hasPageNumbers = state.paragraphsMetadata.some(meta => meta?.pageNumber != null);
                            const currentPage = state.paragraphsMetadata[state.currentParagraph]?.pageNumber;
                            
                            if (!hasPageNumbers) {
                              return t('common.pageInfo.none');
                            }
                    
                            const maxPage = Math.max(
                              ...state.paragraphsMetadata
                                .filter(meta => meta?.pageNumber != null)
                                .map(meta => meta.pageNumber)
                            );
                    
                            return t('common.pageInfo.format', { 
                              current: currentPage || '?',
                              total: maxPage 
                            });
                          })()}
                          {t('common.pageInfo.progress', { 
                            percent: Math.round((state.currentParagraph + 1) / state.paragraphs.length * 100)
                          })}
                        </span>
                      </div>
                      <div className="path-group">
                        <span className="file-path">{t('mainComponent.fileInfo.path.separator')}{formatPath(state.currentFilePath)}</span>
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              </CSSTransition>
            );

          default:
            return null;
        }
      })()}
    </TransitionGroup>
  </div>
  
      <Settings
  isVisible={isSettingsVisible}
  onClose={() => setIsSettingsVisible(false)}
  theme={theme}
  programStatus={state.programStatus}
  currentViewMode={state.viewMode}
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
