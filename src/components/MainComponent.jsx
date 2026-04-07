// src/components/MainComponent.jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { useTranslation } from 'react-i18next';
import '../CSS/MainComponent.css';
import '../CSS/Views/ComponentTransition.css';
import Sidebar from './Sidebar';
import Settings from './Settings';
import Welcome from './Views/Welcome';
import TextEditor from './Views/editor';
import EncryptionModal from './Views/EncryptionModal';
import Overview from './Views/Overview';
import ListView from './Views/ListView';
import DragDropOverlay from './Views/DragDropOverlay';
import TitleBar from './TitleBar';

import useAppStore from '../stores/useAppStore';
import useEditorStore from '../stores/useEditorStore';
import useIconStore from '../stores/useIconStore';
import { ProgramStatus } from '../constants';
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
  const pluginServer = useAppStore((s) => s.pluginServer);
  const pluginConnected = useAppStore((s) => s.pluginConnected);
  const pluginModeActive = useAppStore((s) => s.pluginModeActive);

  // ─── 스토어 액션 ───
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const toggleSearch = useAppStore((s) => s.toggleSearch);
  const setSettingsVisible = useAppStore((s) => s.setSettingsVisible);
  const setHoveredSection = useAppStore((s) => s.setHoveredSection);
  const setEditorSaved = useAppStore((s) => s.setEditorSaved);
  const setOverlayVisible = useAppStore((s) => s.setOverlayVisible);
  const resetToReady = useAppStore((s) => s.resetToReady);
  const resetEditor = useEditorStore((s) => s.resetEditor);

  // ─── 토스트 알림 ───
  const toastMessage = useAppStore((s) => s.toastMessage);
  const setToastMessage = useAppStore((s) => s.setToastMessage);
  const toastVisible = useAppStore((s) => s.toastVisible);
  const setToastVisible = useAppStore((s) => s.setToastVisible);

  useEffect(() => {
    if (toastMessage) {
      setToastVisible(true);
      const timer = setTimeout(() => {
        setToastVisible(false);
        setTimeout(() => setToastMessage(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, setToastMessage, setToastVisible]);

  // ─── 아이콘 스토어 ───
  const icons = useIconStore((s) => s.icons);
  const loadIcons = useIconStore((s) => s.loadIcons);
  useEffect(() => { loadIcons(); }, [loadIcons]);
  const { themeCalc } = useTheme();
  const { handleDragOver, handleDragEnter, handleDragLeave, handleDrop } = useDragDrop();
  useIPC(themeCalc, searchRef);

  // ─── 복호화 모달 상태 ───
  const [decryptModalOpen, setDecryptModalOpen] = useState(false);
  const [decryptError, setDecryptError] = useState('');
  const decryptResolveRef = useRef(null);

  useEffect(() => {
    const handler = (_event, { requestId }) => {
      setDecryptError('');
      setDecryptModalOpen(true);
      decryptResolveRef.current = (password, rememberPassword) => {
        ipcRenderer.send('para-decrypt-modal-response', { requestId, password, rememberPassword });
      };
    };
    ipcRenderer.on('para-decrypt-modal-request', handler);
    return () => ipcRenderer.removeListener('para-decrypt-modal-request', handler);
  }, []);

  const handleDecryptSubmit = useCallback((password, rememberPassword) => {
    setDecryptModalOpen(false);
    decryptResolveRef.current?.(password, rememberPassword);
    decryptResolveRef.current = null;
  }, []);

  const handleDecryptCancel = useCallback(() => {
    setDecryptModalOpen(false);
    decryptResolveRef.current?.(null);
    decryptResolveRef.current = null;
  }, []);

  // ─── 미저장 경고 확인 헬퍼 ───
  const confirmIfUnsaved = useCallback(async () => {
    const { programStatus, isEditorSaved } = useAppStore.getState();
    if (programStatus === ProgramStatus.EDIT && !isEditorSaved) {
      ipcRenderer.send('update-saved-state', isEditorSaved);
      const saveChoice = await ipcRenderer.invoke('show-dialog', 'UNSAVED_CHANGES');
      if (saveChoice === 1) return false;
    }
    return true;
  }, []);

  // ─── Portal 팝업용 body 테마 동기화 ───
  useEffect(() => {
    document.body.dataset.theme = theme.mode;
  }, [theme.mode]);

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
    if (!await confirmIfUnsaved()) return;

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
      if (!await confirmIfUnsaved()) return;

      const result = await ipcRenderer.invoke('open-file', {
        source: options.source || 'dialog',
        filePath: options.filePath,
        programStatus: options.programStatus
      });

      if (result?.success) {
        // main process의 updateState가 state-update를 브로드캐스트하므로
        // 사이드바 닫기만 처리 (나머지 상태는 syncFromMain에서 동기화)
        useAppStore.setState({ isSidebarVisible: false });
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
      if (!await confirmIfUnsaved()) return;

      // EDIT 모드면 에디터에서 파일 내용을 로드해서 열기
      if (programStatus === ProgramStatus.EDIT) {
        const readResult = await ipcRenderer.invoke('read-file-decrypted', filePath);
        if (!readResult.success) return;
        await ipcRenderer.invoke('process-file-content', readResult.content, filePath);
        useAppStore.setState({ isSidebarVisible: false });
        return;
      }

      const result = await ipcRenderer.invoke('open-file', { filePath });
      if (result.success) {
        useAppStore.setState({ isSidebarVisible: false });
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  const handleCompleteWork = async () => {
    try {
      if (!await confirmIfUnsaved()) return;

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
      resetEditor();
    } catch (error) {
      console.error('작업 종료 중 오류:', error);
    }
  };

  const handleShowDebugConsole = () => {
    ipcRenderer.send('show-debug-console');
  };

  const handleTogglePluginConnection = async () => {
    await ipcRenderer.invoke('apply-settings', {
      pluginConnected: !pluginConnected
    });
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
        onFileSelect={handleSidebarFileSelect}
        onSelect={handleParagraphSelect}
        onShowDebugConsole={handleShowDebugConsole}
      />

      <DragDropOverlay />

      <TitleBar />

      <div className="button-group-controls">
        <button className="btn-icon" onClick={toggleSidebar}>
          <img src={icons.sidebar} alt="Sidebar Icon" className="icon" />
        </button>
        <button className="btn-icon" onClick={() => setSettingsVisible(true)}>
          <img src={icons.settings} alt="Settings Icon" className="icon" />
        </button>
        {(programStatus === ProgramStatus.PROCESS ||
          programStatus === ProgramStatus.PAUSE ||
          programStatus === ProgramStatus.EDIT) && (
          <>
            <button className="btn-icon" onClick={handleCompleteWork}>
              <img src={icons.home} alt="작업 종료" className="icon" />
            </button>
            {(programStatus === ProgramStatus.PROCESS ||
              programStatus === ProgramStatus.PAUSE) && (
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
                {pluginServer && (
                  <button
                    className={`btn-icon ${pluginConnected ? (pluginModeActive ? 'btn-ps-connected' : 'btn-ps-active') : 'btn-ps-inactive'}`}
                    onClick={handleTogglePluginConnection}>
                    <img src={icons.photoshop} alt="Photoshop" className="icon" />
                  </button>
                )}
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
                      <TextEditor />
                    </div>
                  </CSSTransition>
                );

              case ProgramStatus.PAUSE:
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
                                onParagraphClick={handleParagraphClick}
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
                                onParagraphSelect={handleParagraphSelect}
                                onCompleteWork={handleCompleteWork}
                              />
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
        onClose={() => setSettingsVisible(false)}
      />

      {toastMessage && (
        <div className={`para-toast ${toastVisible ? 'visible' : ''}`}>
          {toastMessage}
        </div>
      )}

      <EncryptionModal
        isOpen={decryptModalOpen}
        onSubmit={handleDecryptSubmit}
        onCancel={handleDecryptCancel}
        errorMessage={decryptError}
      />
    </div>
  );
}

export default MainComponent;
