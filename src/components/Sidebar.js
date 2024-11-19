// src/components/Sidebar.js

import React from 'react';
import '../CSS/App.css';
import '../CSS/Sidebar.css';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');

function Sidebar({ isVisible, onClose, isDarkMode, currentFilePath }) {
  const [files, setFiles] = React.useState([]);

  React.useEffect(() => {
    loadFileHistory();
  }, [isVisible]);

  const loadFileHistory = async () => {
    try {
      // 원본 로그 데이터와 현재 파일 정보 수신
      const { logData, currentFile } = await ipcRenderer.invoke('get-file-history');
      
      // 사이드바 내부에서 데이터 가공
      const processedFiles = Object.entries(logData)
        .filter(([filePath, data]) => {
          // 현재 파일 필터링 (경로 또는 해시값으로 비교)
          if (!currentFile) return true;
          const isSamePath = filePath === currentFile.path;
          const isSameHash = data.fileHash === currentFile.hash;
          return !isSamePath && !isSameHash;
        })
        .map(([filePath, data]) => ({
          fileName: path.basename(filePath),
          filePath: filePath,
          currentPageNumber: data.currentPageNumber,
          currentParagraph: data.currentParagraph,
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
    const truncatedPath = parts.slice(-2).join(path.sep); // 상위 2개 폴더만
    return truncatedPath;
  };

  // 로그 삭제 핸들러 - 단순히 삭제 요청만
  const handleRemoveFile = async (e, filePath) => {
    e.stopPropagation(); // 클릭 이벤트 전파 방지
    try {
      await ipcRenderer.invoke('remove-history-file', filePath);
      loadFileHistory(); // 목록 새로고침
    } catch (error) {
      console.error('파일 기록 삭제 실패:', error);
    }
  };

  // 파일 선택 핸들러 - 단순히 열기 요청만
  const handleFileSelect = async (filePath) => {
    try {
      const content = await ipcRenderer.invoke('read-file', filePath);
      const result = await ipcRenderer.invoke('process-file-content', content, filePath);
      if (result.success) {
        onClose();
      }
    } catch (error) {
      console.error('파일 열기 실패:', error);
    }
  };

  return (
    <>
      {isVisible && (
        <div className="sidebar-overlay" onClick={onClose} />
      )}
      <div 
        className={`sidebar ${isVisible ? 'visible' : ''}`}
        data-theme={isDarkMode ? 'dark' : 'light'}
      >
        <div className="sidebar-header">
          <h3>최근 작업 파일</h3>
          <button className="btn-close" onClick={onClose}>×</button>
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
    </>
  );
}

export default Sidebar;