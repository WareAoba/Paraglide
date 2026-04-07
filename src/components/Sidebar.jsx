// src/components/Sidebar.js
import React, { useEffect, useCallback } from 'react';
import { CSSTransition } from 'react-transition-group';
import Panel from './sidebar/Panel';
import Search from './sidebar/Search';
import useAppStore from '../stores/useAppStore';
import useIconStore from '../stores/useIconStore';
import { ProgramStatus } from '../constants';
import '../CSS/Sidebar.css';
import '../CSS/Controllers/ReactContexify.css';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');

function Sidebar({
  onFileSelect,
  onSelect,
  onShowDebugConsole,
}) {
  // ─── Zustand 스토어에서 상태 구독 ───
  const isVisible = useAppStore((s) => s.isSidebarVisible);
  const isSearchVisible = useAppStore((s) => s.isSearchVisible);
  const wasInitiallySidebarOpen = useAppStore((s) => s.wasInitiallySidebarOpen);
  const theme = useAppStore((s) => s.theme);
  const programStatus = useAppStore((s) => s.programStatus);
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const titlePath = useAppStore((s) => s.titlePath);
  const paragraphs = useAppStore((s) => s.paragraphs);
  const paragraphsMetadata = useAppStore((s) => s.paragraphsMetadata);
  const currentParagraph = useAppStore((s) => s.currentParagraph);
  const isEditorSaved = useAppStore((s) => s.isEditorSaved);
  const recentFiles = useAppStore((s) => s.recentFiles);
  const setRecentFiles = useAppStore((s) => s.setRecentFiles);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const toggleSearch = useAppStore((s) => s.toggleSearch);
  const icons = useIconStore((s) => s.icons);

  const [shouldRender, setShouldRender] = React.useState(false);

  const currentFile = (programStatus === ProgramStatus.PROCESS || programStatus === ProgramStatus.PAUSE) ? {
    name: path.basename(currentFilePath || ''),
    path: currentFilePath,
    currentPage: paragraphsMetadata[currentParagraph]?.pageNumber || 1,
    totalPages: Math.max(...paragraphsMetadata
      .filter(meta => meta?.pageNumber != null)
      .map(meta => meta.pageNumber)) || 1
  } : null;

  React.useEffect(() => {
    if (isVisible) {
      loadFileHistory();
      setShouldRender(true);
    } else {
      // 사이드바가 닫힐 때 0.5초 후 렌더링 해제
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 250);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  const loadFileHistory = async () => {
    try {
      const { logData, currentFile } = await ipcRenderer.invoke('get-file-history');

      const processedFiles = Object.entries(logData)
        .filter(([filePath, data]) => {
          // currentFile이 없으면 모든 파일 표시
          if (!currentFile || !currentFile.path) return true;

          // 현재 작업 중인 파일만 제외
          return filePath !== currentFile.path;
        })
        .map(([filePath, data]) => ({
          fileName: path.basename(filePath),
          filePath: filePath,
          currentPageNumber: data.lastPosition?.pageNumber || null,
          currentParagraph: data.lastPosition?.currentParagraph,
          encrypted: !!data.encrypted,
          hasSavedPassword: !!data.savedPassword,
          timestamp: data.timestamp,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setRecentFiles(processedFiles);
    } catch (error) {
      console.error('파일 기록 로드 실패:', error);
      setRecentFiles([]);
    }
  };

  const handleSearchSelect = useCallback((result) => {
    if (typeof result === 'number') {
      onSelect(result);
      toggleSearch(false);
      closeSidebar();
    }
  }, [onSelect, toggleSearch, closeSidebar]);

  const handleClose = () => {
    if (isSearchVisible) {
      if (wasInitiallySidebarOpen) {
        toggleSearch(false);
        return;
      }
      toggleSearch(false);
      closeSidebar();
      return;
    }
    closeSidebar();
  };

  useEffect(() => {
    // 파일 기록 변경 감지
    const handleStateUpdate = (_, newState) => {
      if (newState.fileHistory) {
        loadFileHistory(); // 기존 loadFileHistory 함수 재사용
      }
    };

    // 리스너 등록
    ipcRenderer.on('state-update', handleStateUpdate);

    // 클린업
    return () => {
      ipcRenderer.removeListener('state-update', handleStateUpdate);
    };
  }, []);

  return (
    <>
      <div className={`sidebar ${isVisible ? 'visible' : ''}`} data-theme={theme.mode}>
        <div className="sidebar-header">
          <button className="sidebar-close-button" onClick={handleClose}>
            <img 
              src={isSearchVisible && wasInitiallySidebarOpen ? icons?.back : icons?.sidebarUnfold}
              alt="닫기" 
              className="sidebar-icon-button"
              style={isSearchVisible && wasInitiallySidebarOpen ? { transform: 'scale(0.9)' } : undefined}
            />
          </button>
          <div className="header-title-group">
            {titlePath ? (
              <img src={titlePath} alt="Paraglide" className="header-title-image" />
            ) : (
              <h2>Paraglide</h2>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          {shouldRender && ( // 사이드바가 보일 때만 내용 렌더링
            <>
              <CSSTransition
                in={!isSearchVisible}
                timeout={250}
                classNames="sidebar-transition"
                mountOnEnter
                unmountOnExit
              >
                <Panel
                  currentFile={currentFile}
                  onShowDebugConsole={onShowDebugConsole}
                  onClose={closeSidebar}
                  loadFileHistory={loadFileHistory}
                />
              </CSSTransition>
            </>
          )}
          <CSSTransition
            in={isSearchVisible}
            timeout={250}
            classNames="search-transition"
            mountOnEnter
            unmountOnExit
          >
            <div className="search-wrapper">
              <div className="search-wrapper-wrapper">
                <Search
                  onSelect={(index) => handleSearchSelect(index)}
                />
              </div>
            </div>
          </CSSTransition>
        </div>
      </div>

      <div className={`sidebar-overlay ${isVisible ? 'visible' : ''}`} onClick={closeSidebar} />
    </>
  );
}

export default Sidebar;
