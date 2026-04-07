// DragDropOverlay.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../stores/useAppStore';
import useIconStore from '../../stores/useIconStore';
import { ProgramStatus } from '../../constants';
import '../../CSS/Views/DragDropOverlay.css';

function DragDropOverlay() {
  const { t } = useTranslation();
  const isDragging = useAppStore((s) => s.isDragging);
  const programStatus = useAppStore((s) => s.programStatus);
  const theme = useAppStore((s) => s.theme);
  const icons = useIconStore((s) => s.icons);
  const isWorkMode = programStatus === ProgramStatus.PROCESS || programStatus === ProgramStatus.PAUSE;

  const message = isWorkMode ? t('dragDrop.messageText') : t('dragDrop.message');
  const subMessage = isWorkMode ? t('dragDrop.subMessageText') : t('dragDrop.subMessage');

  return (
    <div className={`drag-drop-overlay ${isDragging ? 'visible' : ''}`} data-theme={theme?.mode}>
      <div className="drag-drop-backdrop" />
      <div className="drag-drop-content">
        {icons.textFile && (
          <img 
            src={icons.textFile} 
            alt={t('dragDrop.fileIconAlt')} 
            className="drag-drop-icon"
          />
        )}
        <div className="drag-drop-message">{message}</div>
        <div className="drag-drop-sub">{subMessage}</div>
      </div>
    </div>
  );
}

export default DragDropOverlay;