// src/components/Sidebar.js

import React from 'react';
import '../CSS/App.css';
import '../CSS/Sidebar.css';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');

// icons prop 추가
function Sidebar({ isVisible, onClose, currentFilePath, isDarkMode, icons }) {
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
      <div 
        className={`sidebar ${isVisible ? 'visible' : ''} ${isDarkMode ? 'dark' : ''}`}
        data-theme={isDarkMode ? 'dark' : 'light'}
      >
        <div className="sidebar-header">
          <h2>최근 작업 파일</h2>
          <button className="sidebar-close-button" onClick={onClose}>
            <img 
              src={icons?.menuUnfold} 
              alt="닫기" 
              className="sidebar-icon-button"
            />
          </button>
        </div>
        <div className="sidebar-content">
          <div className="file-list">
            {files.length > 0 ? (
              files.map((file, index) => (
                <div 
                  key={index} 
                  className="file-item"
                  onClick={() => handleFileSelect(file.filePath)}
                >
                  <div className="file-main-info">
                    <span className="file-name">{file.fileName}</span>
                    <span className="file-page">
                      {file.currentPageNumber != null && `${file.currentPageNumber}페이지`}
                    </span>
                    <button 
                      className="btn-remove"
                      onClick={(e) => handleRemoveFile(e, file.filePath)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="file-sub-info">
                    <span className="file-path">{formatPath(file.filePath)}</span>
                    <span className="file-date">{formatDate(file.timestamp)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-message">최근 작업 기록이 없습니다.</div>
            )}
          </div>
        </div>
      </div>
      {isVisible && <div className="sidebar-overlay" onClick={onClose} />}
      </>
  );
}

export default Sidebar;