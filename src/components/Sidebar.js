// src/components/Sidebar.js

import React, { useEffect, useCallback } from 'react';
import { CSSTransition } from 'react-transition-group';
import { Menu, Item, useContextMenu } from 'react-contexify';
import Search from './Views/Search';
import '../CSS/App.css';
import '../CSS/Sidebar.css';
import '../CSS/Views/Search.css';
import '../CSS/Controllers/ReactContexify.css';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');

// icons prop 추가
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

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isThisYear = date.getFullYear() === now.getFullYear();

    if (isThisYear) {
      return new Intl.DateTimeFormat('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }

    return new Intl.DateTimeFormat('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  // 파일 경로 처리 함수 추가
  const formatPath = (fullPath) => {
    const parts = fullPath.split(path.sep);
    const fileName = parts.pop(); // 파일명 제거
    const truncatedPath = parts.slice(-3).join(path.sep); // 상위 3개 폴더만
    return truncatedPath;
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

  // 로그 삭제 핸들러 - 단순히 삭제 요청만
  const handleRemoveFile = async (filePath) => {
    try {
      // 1. CSS 선택자 이스케이프 처리
      const escapedPath = CSS.escape(filePath);
      const element = document.querySelector(`[data-filepath="${escapedPath}"]`);
      
      // 2. 요소를 못찾아도 삭제는 진행
      if (element) {
        element.classList.add('removing');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      
      // 3. 파일 삭제 진행
      await ipcRenderer.invoke('clear-log-files', filePath);
      loadFileHistory();
    } catch (error) {
      console.error('파일 기록 삭제 실패:', error);
    }
  };

  // 파일 선택 핸들러 - 단순히 열기 요청만
  const handleFileSelect = async (filePath) => {
    try {
      // 통합된 open-file 핸들러 사용
      const result = await ipcRenderer.invoke('open-file', {
        filePath,
        source: 'history',
      });

      if (result.success) {
        onClose();
      }
    } catch (error) {
      console.error('파일 열기 실패:', error);
    }
  };

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

  const MENU_ID = 'recent-file-menu';
  const { show } = useContextMenu({
    id: MENU_ID,
  });

  const handleContextMenu = (event, file) => {
    // 우클릭 메뉴 표시
    event.preventDefault();
    show({
      event,
      props: {
        file,
      },
    });
  };

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
            <div>
              {/* 파일 정보 섹션 */}
              {currentFile && (
                <div className="sidebar-section">
                  <h3>현재 파일</h3>
                  <div className="section-content current-file-info">
                    <img src={icons?.textFileIcon} alt="파일" className="current-file-icon" />
                    <div className="current-file-content">
                      <div className="current-file-info-header">
                        <div className="current-file-name-container">
                          <div className="current-file-name-wrapper">
                            <span className="current-file-name">{path.basename(currentFilePath)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="current-page-info">
                        {(() => {
                          const isValidPage = (page) => page && Number.isFinite(page) && page > 0;
                          if (!isValidPage(currentFile.totalPages) || !isValidPage(currentFile.currentPage)) {
                            return "페이지 정보 없음";
                          }
                          return `${currentFile.currentPage}/${currentFile.totalPages}페이지`;
                        })()}
                      </div>
                      <div className="current-file-path">{formatPath(currentFilePath)}</div>
                    </div>
                  </div>
                </div>
              )}
  
              {/* 컨트롤 섹션 */}
              <div className="sidebar-section controls">
                <div className="control-grid">
                  <button
                    className="control-button"
                    data-action="open"
                    onClick={() => ipcRenderer.invoke('open-file')}
                  >
                    <img src={icons?.openIcon} data-action="open" alt="열기" />
                    <span>열기</span>
                  </button>
                  <button
                    className={`control-button ${status === 'ready' ? 'disabled' : ''}`}
                    data-action="edit"
                    onClick={onClose}
                    disabled={true}
                  >
                    <img src={icons?.editIcon} data-action="edit" alt="편집" />
                    <span>편집</span>
                  </button>
                  <button
  className={`control-button ${status === 'ready' ? 'disabled' : ''}`}
  onClick={() => {
    // 사이드바를 통해 검색을 여는 경우 wasInitiallySidebarOpen을 true로 설정
    onToggleSearch(true, true); // 두 번째 파라미터로 사이드바를 통한 열기임을 전달
  }}
  disabled={status === 'ready'}
>
  <img src={icons?.searchIcon} alt="검색" />
  <span>검색</span>
</button>
                  <button
                    className="control-button"
                    onClick={() => {
                      onShowDebugConsole();
                      onClose();
                    }}
                  >
                    <img src={icons?.terminalIcon} alt="콘솔" />
                    <span>콘솔</span>
                  </button>
                </div>
              </div>
  
              {/* 최근 파일 섹션 */}
              <div className="sidebar-section recent-files">
                <h3>최근 작업 파일</h3>
                <div className="recent-file-list">
                  {files.map((file) => (
                    <div
                      key={file.filePath}
                      data-filepath={file.filePath}
                      className="recent-file-item"
                      onClick={() => handleFileSelect(file.filePath)}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                    >
                      <div className="recent-file-main-info">
                        <span className="recent-file-name">{file.fileName}</span>
                        <span className="recent-file-page">
                          {file.currentPageNumber != null && `${file.currentPageNumber}페이지`}
                        </span>
                      </div>
                      <div className="recent-file-sub-info">
                        <span className="recent-file-path">{formatPath(file.filePath)}</span>
                        <span className="recent-file-date">{formatDate(file.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                  {files.length === 0 && <div className="empty-message">최근 작업 기록이 없습니다.</div>}
                </div>
              </div>
              </div>
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
      <Menu id={MENU_ID}>
        <Item onClick={({ props }) => handleRemoveFile(props.file.filePath)}>
          <img src={icons?.deleteIcon} alt="삭제" />
          <span>기록 삭제</span>
        </Item>
      </Menu>
    </>
  );
}

export default Sidebar;
