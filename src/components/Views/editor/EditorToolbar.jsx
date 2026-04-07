import React from 'react';
import { useTranslation } from 'react-i18next';

const FONT_SCALE_OPTIONS = [10, 15, 20, 25, 35, 50, 65, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];

function EditorToolbar({
  icons,
  fontScale,
  hasImages,
  isParaFileLoaded,
  metaPanelOpen,
  encryptionEnabled,
  macroButtonRef,
  styleButtonRef,
  metaButtonRef,
  encryptionButtonRef,
  onZoomIn,
  onZoomOut,
  onLoadFile,
  onSave,
  onOpenImageFiles,
  onCloseImageViewer,
  onToggleMacro,
  onToggleStyle,
  onToggleMetaPanel,
  onToggleEncryption,
}) {
  const { t } = useTranslation();

  return (
    <div className="editor-toolbar">
      <button
        type="button"
        className="editor-toolbar-icon"
        onClick={onZoomOut}
        title={t('editor.toolbar.fontSize')}
        disabled={fontScale <= FONT_SCALE_OPTIONS[0]}
      >
        <img src={icons?.zoomOut} alt="Zoom Out" className="icon" />
      </button>
      <span className="editor-toolbar-scale">{fontScale}%</span>
      <button
        type="button"
        className="editor-toolbar-icon"
        onClick={onZoomIn}
        title={t('editor.toolbar.fontSize')}
        disabled={fontScale >= FONT_SCALE_OPTIONS[FONT_SCALE_OPTIONS.length - 1]}
      >
        <img src={icons?.zoomIn} alt="Zoom In" className="icon" />
      </button>
      <div className="editor-toolbar-divider" />
      <button
        type="button"
        className="editor-toolbar-icon"
        onClick={onLoadFile}
        title={t('editor.toolbar.load')}
      >
        <img src={icons?.folder} alt="Load" className="icon" />
      </button>
      <button
        type="button"
        className="editor-toolbar-icon"
        onClick={onSave}
        title={t('editor.toolbar.save')}
      >
        <img src={icons?.save} alt="Save" className="icon" />
      </button>
      <div className="editor-toolbar-divider" />
      <button
        type="button"
        className="editor-toolbar-icon"
        onClick={onOpenImageFiles}
        title={t('editor.toolbar.imageViewer')}
      >
        <img src={icons?.imageAdd} alt="Image Folder" className="icon" />
      </button>
      {hasImages && (
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={onCloseImageViewer}
          title={t('editor.toolbar.closeViewer')}
        >
          <img src={icons?.delete} alt="Close Viewer" className="icon" />
        </button>
      )}
      <div className="editor-toolbar-divider" />
      <button
        ref={macroButtonRef}
        type="button"
        className="editor-toolbar-icon"
        onClick={onToggleMacro}
        title={t('editor.toolbar.textMacro')}
      >
        <img src={icons?.textAdd} alt="Text Macro" className="icon" />
      </button>
      <button
        ref={styleButtonRef}
        type="button"
        className="editor-toolbar-icon"
        onClick={onToggleStyle}
        title={t('editor.toolbar.textStyle')}
      >
        <img src={icons?.fontStyle} alt="Text Style" className="icon" />
      </button>
      {isParaFileLoaded && (
        <>
          <div className="editor-toolbar-divider" />
          <button
            ref={metaButtonRef}
            type="button"
            className={`editor-toolbar-icon${metaPanelOpen ? ' active' : ''}`}
            onClick={onToggleMetaPanel}
            title={t('editor.toolbar.metadata')}
          >
            <img src={icons?.database} alt="Metadata" className="icon" />
          </button>
        </>
      )}
      <div className="editor-toolbar-divider" />
      <button
        ref={encryptionButtonRef}
        type="button"
        className={`editor-toolbar-icon${encryptionEnabled ? ' active' : ''}`}
        onClick={onToggleEncryption}
        title={t('editor.toolbar.encryption')}
      >
        <span className="editor-toolbar-icon-text">
          {encryptionEnabled ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
          )}
        </span>
      </button>
    </div>
  );
}

export default React.memo(EditorToolbar);
