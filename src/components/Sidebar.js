// src/components/Sidebar.js

import React from 'react';
import '../CSS/App.css';
import '../CSS/Sidebar.css';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');

// icons prop 추가
function Sidebar({ 
  isVisible, 
  onClose, 
  currentFilePath,
  theme,
  icons,
  // 추가되는 props
  titlePath,
  currentFile,
  onToggleOverlay,
  onToggleSearch,
  onShowDebugConsole,
  isOverlayVisible,
}) {
  const [files, setFiles] = React.useState([]);

  React.useEffect(() => {
    if (isVisible) {
      loadFileHistory();
    }
  }, [isVisible, currentFilePath]); 

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
          timestamp: data.timestamp
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
        hour12: false
      }).format(date);
    }
    
    return new Intl.DateTimeFormat('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  };

  // 파일 경로 처리 함수 추가
  const formatPath = (fullPath) => {
    const parts = fullPath.split(path.sep);
    const fileName = parts.pop(); // 파일명 제거
    const truncatedPath = parts.slice(-3).join(path.sep); // 상위 3개 폴더만
    return truncatedPath;
  };

  // 로그 삭제 핸들러 - 단순히 삭제 요청만
  const handleRemoveFile = async (e, filePath) => {
    e.stopPropagation(); // 클릭 이벤트 전파 방지
    try {
      await ipcRenderer.invoke('clear-log-files', filePath);
      loadFileHistory(); // 목록 새로고침
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
        source: 'history'
      });
      
      if (result.success) {
        onClose();
      }
    } catch (error) {
      console.error('파일 열기 실패:', error);
    }
  };

  return (
    <>
      <div className={`sidebar ${isVisible ? 'visible' : ''}`} data-theme={theme.mode}>
        {/* 헤더 섹션 */}
        <div className="sidebar-header">
          <div className="header-title-group">
            {titlePath ? (
              <img src={titlePath} alt="Paraglide" className="header-title-image" />
            ) : (
              <h2>Paraglide</h2>
            )}
          </div>
          <button className="sidebar-close-button" onClick={onClose}>
            <img src={icons?.sidebarUnfold} alt="닫기" className="sidebar-icon-button" />
          </button>
        </div>

        <div className="sidebar-content">
          {/* 파일 정보 섹션 */}
          {currentFile && (
            <div className="sidebar-section">
              <h3>현재 파일</h3>
              <div className="section-content current-file-info">
                <img src={icons?.textFileIcon} alt="파일" className="current-file-icon" />
                <div className="current-file-content">
                  <div className="current-file-info-header">
                    <span className="current-file-name">{path.basename(currentFilePath)}</span>
                  </div>
                  <div className="current-page-info">
                    {currentFile.currentPage}/{currentFile.totalPages}페이지
                  </div>
                  <div className="current-file-path">{formatPath(currentFilePath)}</div>
                </div>
              </div>
            </div>
          )}

          {/* 컨트롤 섹션 */}
          <div className="sidebar-section controls">
            <div className="control-grid">
              <button className="control-button" onClick={onToggleOverlay}>
                <img 
                  src={isOverlayVisible ? icons?.eyeIcon : icons?.eyeOffIcon} 
                  alt="오버레이" 
                />
                <span>{isOverlayVisible ? '오버레이' : '오버레이'}</span>
              </button>
              <button className="control-button" onClick={() => {
                onToggleSearch();
                onClose();
              }}>
                <img src={icons?.searchIcon} alt="검색" />
                <span>검색</span>
              </button>
              <button className="control-button" onClick={() => {
                onShowDebugConsole();
                onClose();
              }}>
                <img src={icons?.terminalIcon} alt="콘솔" />
                <span>콘솔</span>
              </button>
            </div>
          </div>

          {/* 최근 파일 섹션 */}
          <div className="sidebar-section recent-files">
            <h3>최근 작업 파일</h3>
            <div className="recent-file-list">
              {files.length > 0 ? (
                files.map((file, index) => (
                  <div 
                    key={index} 
                    className="recent-file-item"
                    onClick={() => handleFileSelect(file.filePath)}
                  >
                    <div className="recent-file-main-info">
                      <span className="recent-file-name">{file.fileName}</span>
                      <span className="recent-file-page">
                        {file.currentPageNumber != null && 
                          `${file.currentPageNumber}페이지`}
                      </span>
                      <button 
                        className="btn-remove"
                        onClick={(e) => handleRemoveFile(e, file.filePath)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="recent-file-sub-info">
                      <span className="recent-file-path">
                        {formatPath(file.filePath)}
                      </span>
                      <span className="recent-file-date">
                        {formatDate(file.timestamp)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-message">최근 작업 기록이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      {isVisible && <div className="sidebar-overlay" onClick={onClose} />}
    </>
  );
}

export default Sidebar;