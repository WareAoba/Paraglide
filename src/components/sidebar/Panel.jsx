// src/components/Views/Panel.js
import React, { useEffect, useState } from 'react';
import { useContextMenu, Menu, Item } from 'react-contexify';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
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
  loadFileHistory,
  isEditorSaved,
  ProgramStatus
}) {

  const { t } = useTranslation();
  const [editorDocInfo, setEditorDocInfo] = useState(null); // 에디터에서 받아올 문서 정보
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
    if (!fullPath) return '';
    
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
      
      const result = await ipcRenderer.invoke('clear-log-files', filePath);
      if (!result.success) {
        console.error('파일 기록 삭제 실패');
      }
    } catch (error) {
      console.error('파일 기록 삭제 실패:', error);
    }
  };
  
  useEffect(() => {
    const handleHistoryUpdate = (_, updatedHistory) => {
      loadFileHistory();
    };
  
    ipcRenderer.on('history-update', handleHistoryUpdate);
  
    return () => {
      ipcRenderer.removeListener('history-update', handleHistoryUpdate);
    };
  }, [loadFileHistory]);

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

  useEffect(() => {
    const handleEditorInfo = (_, { type, data }) => {
      if (type === 'response') {
        setEditorDocInfo(data);
      }
    };
  
    ipcRenderer.on('get-editor-info', handleEditorInfo);
    
    // 문서 정보 요청
    ipcRenderer.send('get-editor-info', { type: 'request' });
  
    return () => {
      ipcRenderer.removeListener('get-editor-info', handleEditorInfo);
    };
  }, []);

  // 파일 정보 렌더링 함수 수정
  const renderCurrentFileInfo = () => {
    console.log('파일 정보 렌더링:', {
      status,
      ProgramStatus: ProgramStatus.EDIT,
      isEditMode: status === ProgramStatus.EDIT,
      editorDocInfo,
      currentFile
    });

    const fileInfo = status === ProgramStatus.EDIT ? editorDocInfo : currentFile;
    if (!fileInfo && !currentFilePath) return null;

    const hasPageInfo = fileInfo?.totalPages > 0;
    const pageInfo = hasPageInfo 
      ? t('common.pageInfo.format', {
          current: fileInfo.currentPage,
          total: fileInfo.totalPages
        })
      : t('common.pageInfo.none');
  
    return (
      <section className="sidebar-section current-file">
        <h3>{t('sidebar.panel.sections.currentFile.title')}</h3>
        <div
          className="current-file-info"
          onContextMenu={handleCurrentContextMenu}
          style={{ cursor: 'context-menu' }}
        >
          <img src={icons?.textFileIcon} alt="파일" className="current-file-icon" />
          <div className="current-file-content">
            <div className="current-file-info-header">
              <div className="current-file-name-container">
                <div className="current-file-name-wrapper">
                <span className="current-file-name">
  {currentFilePath ? 
    path.basename(currentFilePath) : 
    t('common.unknown')
  }
</span>
                </div>
              </div>
            </div>
            <div className="current-page-info">
              {pageInfo}
            </div>
            <div className="current-file-path">
              {formatPath(currentFilePath) || t('common.unknown')}
            </div>
          </div>
        </div>
      </section>
    );
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
          {file.currentPageNumber != null && 
            t('common.pageInfo.pageNumber', { page: file.currentPageNumber })}
        </span>
      </div>
      <div className="recent-file-sub-info">
        <span className="recent-file-path">{formatPath(file.filePath)}</span>
        <span className="recent-file-date">{formatDate(file.timestamp)}</span>
      </div>
    </div>
  );

  const handleEditModeSwitch = async () => {
    const content = await ipcRenderer.invoke('read-file', currentFilePath);
    await ipcRenderer.invoke('process-file-content', content, currentFilePath);
  };

  const handleWorkModeSwitch = async () => {
    if (!isEditorSaved) {
      const saveChoice = await ipcRenderer.invoke('show-dialog', 'UNSAVED_CHANGES');
      if (saveChoice === 1) return false; // 취소 선택
    }
    await ipcRenderer.invoke('open-file', {
      filePath: currentFilePath,
      programStatus: ProgramStatus.PROCESS,
      viewMode: 'overview'
    });
    return true;
  };

  const handleModeSwitch = async () => {
    if (!currentFilePath) return;
    
    try {
      let success = false;
      if (status === ProgramStatus.PROCESS) {
        await handleEditModeSwitch();
        success = true;
      } else if (status === ProgramStatus.EDIT) {
        success = await handleWorkModeSwitch();
      }
      
      if (success) onClose();
    } catch (error) {
      console.error('모드 전환 실패:', error);
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

  return (
    <div className="panel-container">
      {/* 1. 현재 파일 섹션 */}
      {renderCurrentFileInfo()}

      {/* 2. 컨트롤 섹션 */}
      <section className="sidebar-section controls">
        <div className="control-grid">
          <ControlButton
            icon={icons?.openIcon}
            label={t('sidebar.panel.controls.open')}
            actionType="open"
            action={() => ipcRenderer.invoke('open-file')}
          />
          <ControlButton
            icon={status === ProgramStatus.EDIT ? icons?.fileWorkIcon : icons?.editIcon}
            label={status === ProgramStatus.EDIT ? 
              t('sidebar.panel.controls.work') : 
              t('sidebar.panel.controls.edit')
            }
            actionType={status === ProgramStatus.EDIT ? "process" : "edit"}
            action={handleModeSwitch}
            isDisabled={status === ProgramStatus.READY}
          />
          <ControlButton
            icon={icons?.searchIcon}
            label={t('sidebar.panel.controls.search')}
            action={() => onToggleSearch(true, true)}
            isDisabled={status === 'ready'}
          />
          <ControlButton
            icon={icons?.terminalIcon}
            label={t('sidebar.panel.controls.console')}
            action={() => {
              onShowDebugConsole();
              onClose();
            }}
          />
        </div>
      </section>

      {/* 3. 최근 파일 섹션 */}
      <section className="sidebar-section recent-files">
        <h3>{t('sidebar.panel.sections.recentFiles.title')}</h3>
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
            <div className="empty-message">
              {t('sidebar.panel.sections.recentFiles.empty')}
            </div>
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
            <span>
              {t(isMac ? 
                'sidebar.panel.contextMenu.showInFinder' : 
                'sidebar.panel.contextMenu.showInExplorer')}
            </span>
          </Item>
          <Item onClick={({ props }) => handleRemoveFile(props.file.filePath)}
            data-action="delete">
            <img src={icons?.deleteIcon} alt={t('common.buttons.delete')} />
            <span>{t('sidebar.panel.contextMenu.deleteHistory')}</span>
          </Item>
        </Menu>

        <Menu id={CURRENT_FILE} data-theme={theme.mode}>
          <Item onClick={({ props }) => handleShowInFolder(props.file.filePath)}>
            <img 
              src={isMac ? icons?.finderIcon : icons?.folderIcon} 
              alt={isMac ? "Finder" : "탐색기"} 
            />
            <span>
              {t(isMac ? 
                'sidebar.panel.contextMenu.showInFinder' : 
                'sidebar.panel.contextMenu.showInExplorer')}
            </span>
          </Item>
        </Menu>
      </>,
      document.body
    )}
    </div>
  );
}

export default Panel;