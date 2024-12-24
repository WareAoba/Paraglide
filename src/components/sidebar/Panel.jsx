// src/components/Views/Panel.js
import React, { useEffect } from 'react';
import { useContextMenu, Menu, Item } from 'react-contexify';
import { createPortal } from 'react-dom';
import '../../CSS/App.css';
import '../../CSS/Sidebar/Panel.css';
const { ipcRenderer } = window.require('electron');
const path = window.require('path');
const os = window.require('os');

function Panel({
  currentFile,
  currentFilePath,
  status,
  icons,
  onToggleSearch,
  onShowDebugConsole,
  onClose,
  files,
  theme,
  loadFileHistory
}) {

  const isMac = os.platform() === 'darwin';

  // 1. 포맷팅 유틸리티
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

  const formatPath = (fullPath) => {
    const dirPath = path.dirname(fullPath);
    const parts = dirPath.split(path.sep);
    const truncatedPath = parts.slice(-3).join(path.sep);
    return truncatedPath;
  };

  // 2. 파일 관련 핸들러
  const handleRemoveFile = async (filePath) => {
    try {
      const escapedPath = CSS.escape(filePath);
      const element = document.querySelector(`[data-filepath="${escapedPath}"]`);
      
      if (element) {
        element.classList.add('removing');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      
      await ipcRenderer.invoke('clear-log-files', filePath);
      loadFileHistory();
    } catch (error) {
      console.error('파일 기록 삭제 실패:', error);
    }
  };

  const handleFileSelect = async (filePath) => {
    try {
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

  const handleShowInFolder = async (filePath) => {
    try {
      await ipcRenderer.invoke('show-in-folder', filePath);
    } catch (error) {
      console.error('파일 탐색기에서 열기 실패:', error);
    }
  };

  // 3. 컨텍스트 메뉴
const RECENT_FILE = 'recent-file-menu';
const CURRENT_FILE = 'current-file-menu';

const { show: showRecentMenu } = useContextMenu({
  id: RECENT_FILE,
});

const { show: showCurrentMenu } = useContextMenu({
  id: CURRENT_FILE,
});

const handleRecentContextMenu = (event, file) => {
  event.preventDefault();
  showRecentMenu({
    event,
    props: {
      file,
    },
  });
};

const handleCurrentContextMenu = (event) => {
  event.preventDefault();
  if (!currentFilePath) return;
  
  showCurrentMenu({
    event,
    props: {
      file: { filePath: currentFilePath },
    },
  });
};

  // ControlButton 컴포넌트
  const ControlButton = ({ icon, label, action, isDisabled, actionType = false }) => (
    <button
      className={`control-button ${isDisabled ? 'disabled' : ''}`}
      onClick={action}
      disabled={isDisabled}
    >
      <img 
        src={icon} 
        alt={label} 
        data-action={actionType}
      />
      <span>{label}</span>
    </button>
  );
  
  // RecentFileItem 컴포넌트
  const RecentFileItem = ({ file, onSelect, onContextMenu, formatPath, formatDate }) => (
    <div
      data-filepath={file.filePath}
      className="recent-file-item"
      onClick={() => onSelect(file.filePath)}
      onContextMenu={(e) => onContextMenu(e, file)}
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
  );


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

  return (
    <div className="panel-container">
      {/* 1. 현재 파일 섹션 */}
      {currentFile && (
        <section
        className="sidebar-section current-file"
        onContextMenu={handleCurrentContextMenu}>
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
                  return (!isValidPage(currentFile.totalPages) || !isValidPage(currentFile.currentPage))
                    ? "페이지 정보 없음"
                    : `${currentFile.currentPage}/${currentFile.totalPages}페이지`;
                })()}
              </div>
              <div className="current-file-path">{formatPath(currentFilePath)}</div>
            </div>
          </div>
        </section>
      )}
  
      {/* 2. 컨트롤 섹션 */}
      <section className="sidebar-section controls">
        <div className="control-grid">
          <ControlButton
            icon={icons?.openIcon}
            label="열기"
            actionType="open"
            action={() => ipcRenderer.invoke('open-file')}
          />
          <ControlButton
            icon={icons?.editIcon}
            label="편집"
            actionType="edit"
            action={onClose}
            isDisabled={true}
          />
          <ControlButton
            icon={icons?.searchIcon}
            label="검색"
            action={() => onToggleSearch(true, true)}
            isDisabled={status === 'ready'}
          />
          <ControlButton
            icon={icons?.terminalIcon}
            label="콘솔"
            action={() => {
              onShowDebugConsole();
              onClose();
            }}
          />
        </div>
      </section>
  
      {/* 3. 최근 파일 섹션 */}
      <section className="sidebar-section recent-files">
        <h3>최근 작업 파일</h3>
        <div className="recent-file-list">
          {files.length > 0 ? (
            files.map((file) => (
              <RecentFileItem
                key={file.filePath}
                file={file}
                onSelect={handleFileSelect}
                onContextMenu={handleRecentContextMenu}
                formatPath={formatPath}
                formatDate={formatDate}
              />
            ))
          ) : (
            <div className="empty-message">최근 작업 기록이 없습니다.</div>
          )}
        </div>
      </section>
  
      {/* 4. 컨텍스트 메뉴 */}
      {createPortal(
        <>
        <Menu id={RECENT_FILE} data-theme={theme.mode}>
          <Item onClick={({ props }) => handleShowInFolder(props.file.filePath)}>
            <img 
              src={isMac ? icons?.finderIcon : icons?.folderIcon} 
              alt={isMac ? "Finder" : "탐색기"} 
            />
            <span>{isMac ? "Finder에서 열기" : "파일 탐색기에서 열기"}</span>
          </Item>
          <Item onClick={({ props }) => handleRemoveFile(props.file.filePath)}
            data-action="delete">
            <img src={icons?.deleteIcon} alt="삭제" />
            <span>기록 삭제</span>
          </Item>
        </Menu>

        <Menu id={CURRENT_FILE} data-theme={theme.mode}>
          <Item onClick={({ props }) => handleShowInFolder(props.file.filePath)}>
            <img 
              src={isMac ? icons?.finderIcon : icons?.folderIcon} 
              alt={isMac ? "Finder" : "탐색기"} 
            />
            <span>{isMac ? "Finder에서 열기" : "파일 탐색기에서 열기"}</span>
          </Item>
        </Menu>
      </>,
      document.body
    )}
    </div>
  );
}

export default Panel;