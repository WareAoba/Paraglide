// src/components/Sidebar.js
import React, { useEffect, useCallback } from 'react';
import { CSSTransition } from 'react-transition-group';
import Panel from './Views/Panel';
import Search from './Views/Search';
import '../CSS/App.css';
import '../CSS/Sidebar.css';
import '../CSS/Views/Search.css';
import '../CSS/Controllers/ReactContexify.css';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');

function Sidebar({
  isVisible,
  onClose,
  currentFilePath,
  theme,
  status,
  icons,
  titlePath,
  currentFile,
  onToggleSearch,
  onShowDebugConsole,
  paragraphs,
  metadata,
  isSearchVisible,
  onSelect,
  wasInitiallySidebarOpen
}) {
  const [files, setFiles] = React.useState([]);
  const [shouldRender, setShouldRender] = React.useState(false);

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
          timestamp: data.timestamp,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setFiles(processedFiles);
    } catch (error) {
      console.error('파일 기록 로드 실패:', error);
      setFiles([]);
    }
  };

  useEffect(() => {
    const container = document.querySelector('.current-file-name-container');
    const wrapper = document.querySelector('.current-file-name-wrapper');
    
    if (container && wrapper) {
      const containerWidth = container.offsetWidth;
      const wrapperWidth = wrapper.offsetWidth;
      
      // 텍스트가 컨테이너보다 길 경우에만 애니메이션 활성화
      if (wrapperWidth > containerWidth) {
        container.setAttribute('data-needs-animation', 'true');
        container.style.setProperty('--container-width', `${containerWidth}px`);
      } else {
        container.setAttribute('data-needs-animation', 'false');
      }
    }
  }, [currentFilePath]);

  const handleSearchSelect = useCallback((result) => {
    if (typeof result === 'number') {
      onSelect(result);
      onToggleSearch(false);
      onClose();
    }
  }, [onSelect, onToggleSearch, onClose]);

  const handleClose = () => {
    // 검색이 열려있을 때
    if (isSearchVisible) {
      // 사이드바를 통해 검색을 열었다면 검색만 닫기
      if (wasInitiallySidebarOpen) {
        onToggleSearch(false);
        return;
      }
      // 직접 검색을 열었다면 모두 닫기
      onToggleSearch(false);
      onClose();
      return;
    }
    
    // 검색이 닫혀있을 때는 사이드바 닫기
    onClose();
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
    src={isSearchVisible && wasInitiallySidebarOpen ? icons?.backIcon : icons?.sidebarUnfold}
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
  currentFilePath={currentFilePath}
  status={status}
  icons={icons}
  onToggleSearch={onToggleSearch}
  onShowDebugConsole={onShowDebugConsole}
  onClose={onClose}
  files={files}
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
      paragraphs={paragraphs}
      onSelect={(index) => handleSearchSelect(index)}
      metadata={metadata}
      isVisible={isSearchVisible}
      onClose={() => {
        onToggleSearch(false);
        onClose();
      }}
      icons={icons}
      theme={theme}
      isSidebarVisible={isVisible}
    />
  </div>
</div>
</CSSTransition>
        </div>
      </div>

      <div className={`sidebar-overlay ${isVisible ? 'visible' : ''}`} onClick={onClose} />
    </>
  );
}

export default Sidebar;
