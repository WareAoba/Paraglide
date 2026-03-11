// src/components/MainComponent.jsx
import React, { useCallback, useRef } from 'react';
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

import useAppStore, { ProgramStatus } from '../stores/useAppStore';
import useIcons from '../hooks/useIcons';
import useTheme from '../hooks/useTheme';
import useDragDrop from '../hooks/useDragDrop';
import useIPC from '../hooks/useIPC';

const path = window.require('path');
const { ipcRenderer } = window.require('electron');

function MainComponent() {
  const { t } = useTranslation();
  const searchRef = useRef(null);

  // ─── Zustand 스토어에서 상태 구독 ───
  const programStatus = useAppStore((s) => s.programStatus);
  const paragraphs = useAppStore((s) => s.paragraphs);
  const paragraphsMetadata = useAppStore((s) => s.paragraphsMetadata);
  const currentParagraph = useAppStore((s) => s.currentParagraph);
  const currentNumber = useAppStore((s) => s.currentNumber);
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const isPaused = useAppStore((s) => s.isPaused);
  const isOverlayVisible = useAppStore((s) => s.isOverlayVisible);
  const viewMode = useAppStore((s) => s.viewMode);
  const logoPath = useAppStore((s) => s.logoPath);
  const titlePath = useAppStore((s) => s.titlePath);
  const isSidebarVisible = useAppStore((s) => s.isSidebarVisible);
  const wasInitiallySidebarOpen = useAppStore((s) => s.wasInitiallySidebarOpen);
  const isSettingsVisible = useAppStore((s) => s.isSettingsVisible);
  const isSearchVisible = useAppStore((s) => s.isSearchVisible);
  const isDragging = useAppStore((s) => s.isDragging);
  const hoveredSection = useAppStore((s) => s.hoveredSection);
  const isEditorSaved = useAppStore((s) => s.isEditorSaved);
  const theme = useAppStore((s) => s.theme);

  // ─── 스토어 액션 ───
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const toggleSearch = useAppStore((s) => s.toggleSearch);
  const setSettingsVisible = useAppStore((s) => s.setSettingsVisible);
  const setHoveredSection = useAppStore((s) => s.setHoveredSection);
  const setEditorSaved = useAppStore((s) => s.setEditorSaved);
  const setOverlayVisible = useAppStore((s) => s.setOverlayVisible);
  const resetToReady = useAppStore((s) => s.resetToReady);

  // ─── 커스텀 훅 ───
  const icons = useIcons();
  const { themeCalc } = useTheme();
  const { handleDragOver, handleDragEnter, handleDragLeave, handleDrop } = useDragDrop();
  useIPC(themeCalc, searchRef);

  // ─── 유틸 ───
  const formatPath = (fullPath) => {
    if (!fullPath) return '';
    const dir = path.dirname(fullPath);
    const parts = dir.split(path.sep);
    return parts.slice(-2).join(path.sep);
  };

  // ─── 핸들러 ───
  const handleParagraphSelect = useCallback((index) => {
    if (typeof index !== 'number') {
      console.error('Invalid paragraph index:', index);
      return;
    }
    ipcRenderer.send('move-to-position', index);
  }, []);

  const handleNext = () => ipcRenderer.send('move-to-next');
  const handlePrev = () => ipcRenderer.send('move-to-prev');

  const handleTogglePause = () => {
    if (isPaused) {
      ipcRenderer.send('toggle-resume');
    } else {
      ipcRenderer.send('toggle-pause');
    }
  };

  const handleToggleOverlay = () => {
    setOverlayVisible(!isOverlayVisible);
    ipcRenderer.send('toggle-overlay');
  };

  const handleNewFile = async () => {
    const newState = {
      programStatus: ProgramStatus.EDIT,
      paragraphs: [],
      currentParagraph: 0,
      currentNumber: null,
      currentFilePath: null,
      paragraphsMetadata: [],
      isPaused: false,
    };

    useAppStore.setState(newState);
    ipcRenderer.send('update-state', newState);
  };

  const handleLoadFile = async (options = {}) => {
    try {
      const result = await ipcRenderer.invoke('open-file', {
        source: options.source || 'dialog',
        viewMode: options.viewMode || 'overview',
        filePath: options.filePath,
        programStatus: options.programStatus
      });

      if (result.success) {
        useAppStore.setState({
          currentFilePath: options.filePath || currentFilePath,
          programStatus: options.viewMode === 'editor' ? ProgramStatus.EDIT : ProgramStatus.PROCESS,
          viewMode: options.viewMode || 'overview',
          isSidebarVisible: false
        });
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  const handleParagraphClick = (type) => {
    if (type === 'prev') handlePrev();
    else if (type === 'next') handleNext();
    else if (type === 'current') ipcRenderer.send('toggle-resume');
  };

  const handleSidebarFileSelect = async (filePath, lastPosition) => {
    try {
      const content = await ipcRenderer.invoke('read-file', filePath);
      if (!content) return;

      const result = await ipcRenderer.invoke('process-file-content', content, filePath);
      if (result.success) {
        ipcRenderer.send('move-to-position', lastPosition);
        useAppStore.setState({ isSidebarVisible: false });
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  const handleCompleteWork = async () => {
    try {
      if (programStatus === ProgramStatus.EDIT && !isEditorSaved) {
        ipcRenderer.send('update-saved-state', isEditorSaved);
        const saveChoice = await ipcRenderer.invoke('show-dialog', 'UNSAVED_CHANGES');
        if (saveChoice === 1) return;
      }

      const resetState = {
        paragraphs: [],
        currentParagraph: 0,
        currentNumber: null,
        currentFilePath: null,
        isPaused: false,
        isOverlayVisible: false,
        programStatus: ProgramStatus.READY
      };

      ipcRenderer.send('update-state', resetState);
      resetToReady();
    } catch (error) {
      console.error('작업 종료 중 오류:', error);
    }
  };

  const handleShowDebugConsole = () => {
    ipcRenderer.send('show-debug-console');
  };

  // ─── 렌더링 ───
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
        isVisible={isSidebarVisible}
        isSidebarVisible={isSidebarVisible}
        isSearchVisible={isSearchVisible}
        onFileSelect={handleSidebarFileSelect}
        status={programStatus}
        ProgramStatus={ProgramStatus}
        theme={theme}
        onClose={closeSidebar}
        icons={{
          sidebarUnfold: icons.sidebarUnfold,
          eye: icons.eye,
          eyeOff: icons.eyeOff,
          searchIcon: icons.search,
          pageJumpIcon: icons.pageJump,
          terminalIcon: icons.terminal,
          textFileIcon: icons.textFile,
          deleteIcon: icons.delete,
          openIcon: icons.fileOpen,
          editIcon: icons.edit,
          fileWorkIcon: icons.fileWork,
          backIcon: icons.back,
          folderIcon: icons.folder,
          finderIcon: icons.finder
        }}
        titlePath={titlePath}
        currentFilePath={currentFilePath}
        currentFile={programStatus === ProgramStatus.PROCESS ? {
          name: path.basename(currentFilePath || ''),
          path: currentFilePath,
          currentPage: paragraphsMetadata[currentParagraph]?.pageNumber || 1,
          totalPages: Math.max(...paragraphsMetadata
            .filter(meta => meta?.pageNumber != null)
            .map(meta => meta.pageNumber)) || 1
        } : null}
        currentParagraph={currentParagraph}
        paragraphs={paragraphs}
        metadata={paragraphsMetadata}
        onSelect={handleParagraphSelect}
        onToggleOverlay={handleToggleOverlay}
        onToggleSearch={toggleSearch}
        onShowDebugConsole={handleShowDebugConsole}
        isOverlayVisible={isOverlayVisible}
        wasInitiallySidebarOpen={wasInitiallySidebarOpen}
        isEditorSaved={isEditorSaved}
        setState={(updater) => {
          if (typeof updater === 'function') {
            const current = useAppStore.getState();
            const updates = updater(current);
            useAppStore.setState(updates);
          } else {
            useAppStore.setState(updater);
          }
        }}
      />

      <DragDropOverlay isVisible={isDragging} />

      <div className="button-group-controls">
        <button className="btn-icon" onClick={toggleSidebar}>
          <img src={icons.sidebar} alt="Sidebar Icon" className="icon" />
        </button>
        <button className="btn-icon" onClick={() => setSettingsVisible(true)}>
          <img src={icons.settings} alt="Settings Icon" className="icon" />
        </button>
        {(programStatus === ProgramStatus.PROCESS ||
          programStatus === ProgramStatus.EDIT) && (
          <>
            <button className="btn-icon" onClick={handleCompleteWork}>
              <img src={icons.home} alt="작업 종료" className="icon" />
            </button>
            {programStatus === ProgramStatus.PROCESS && (
              <>
                <button
                  className={`btn-icon ${isPaused ? 'btn-danger' : 'btn-success'}`}
                  onClick={handleTogglePause}>
                  {isPaused
                    ? <img src={icons.play} alt="재생" className="icon" />
                    : <img src={icons.pause} alt="일시정지" className="icon" />}
                </button>
                <button
                  className={`btn-icon ${isOverlayVisible ? 'btn-active' : 'btn-outline'}`}
                  onClick={handleToggleOverlay}>
                  {isOverlayVisible
                    ? <img src={icons.eye} alt="오버레이 켜짐" className="icon" />
                    : <img src={icons.eyeOff} alt="오버레이 꺼짐" className="icon" />}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="content-area">
        <TransitionGroup component={null}>
          {(() => {
            switch (programStatus) {
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
                        logoPath={logoPath}
                        titlePath={titlePath}
                        theme={theme}
                        fileOpenIcon={icons.fileOpen}
                        newFileIcon={icons.newFile}
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
                        currentFilePath={currentFilePath}
                        onSavedStateChange={setEditorSaved}
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
                          {viewMode === 'overview' ? (
                            <CSSTransition
                              key="overview"
                              timeout={500}
                              classNames="viewport"
                              mountOnEnter
                              unmountOnExit
                            >
                              <Overview
                                paragraphs={paragraphs}
                                currentParagraph={currentParagraph}
                                currentNumber={currentNumber}
                                onParagraphClick={handleParagraphClick}
                                theme={theme}
                                hoveredSection={hoveredSection}
                                onHoverChange={setHoveredSection}
                                paragraphsMetadata={paragraphsMetadata}
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
                                paragraphs={paragraphs}
                                metadata={paragraphsMetadata}
                                currentParagraph={currentParagraph}
                                onParagraphSelect={handleParagraphSelect}
                                onCompleteWork={handleCompleteWork}
                                theme={theme} />
                            </CSSTransition>
                          )}
                        </TransitionGroup>
                        {currentFilePath && (
                          <div className="file-info-container">
                            <div className="file-info-group">
                              <span className="file-name">{path.basename(currentFilePath)}</span>
                              <span className="paragraph-info">
                                {(() => {
                                  const hasPageNumbers = paragraphsMetadata.some(meta => meta?.pageNumber != null);
                                  const currentPage = paragraphsMetadata[currentParagraph]?.pageNumber;

                                  if (!hasPageNumbers) {
                                    return t('common.pageInfo.none');
                                  }

                                  const maxPage = Math.max(
                                    ...paragraphsMetadata
                                      .filter(meta => meta?.pageNumber != null)
                                      .map(meta => meta.pageNumber)
                                  );

                                  return t('common.pageInfo.format', {
                                    current: currentPage || '?',
                                    total: maxPage
                                  });
                                })()}
                                {t('common.pageInfo.progress', {
                                  percent: Math.round((currentParagraph + 1) / paragraphs.length * 100)
                                })}
                              </span>
                            </div>
                            <div className="path-group">
                              <span className="file-path">{t('mainComponent.fileInfo.path.separator')}{formatPath(currentFilePath)}</span>
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
        onClose={() => setSettingsVisible(false)}
        theme={theme}
        programStatus={programStatus}
        currentViewMode={viewMode}
        icons={{
          themeAuto: icons.themeAuto,
          themeLight: icons.themeLight,
          themeDark: icons.themeDark,
        }}
      />
    </div>
  );
}

export default MainComponent;
