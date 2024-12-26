// DragDropOverlay.js
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../CSS/Views/DragDropOverlay.css';
const { ipcRenderer } = window.require('electron');

function DragDropOverlay({ isVisible, theme }) {
  const { t } = useTranslation();
  const [fileIcon, setFileIcon] = useState(null);

  useEffect(() => {
    const loadIcon = async () => {
      const iconPath = await ipcRenderer.invoke('get-icon-path', 'text-file.svg');
      setFileIcon(iconPath);
    };
    loadIcon();
  }, []);

  return (
    <div className={`drag-drop-overlay ${isVisible ? 'visible' : ''}`} data-theme={theme?.mode}>
      <div className="drag-drop-backdrop" />
      <div className="drag-drop-content">
        {fileIcon && (
          <img 
            src={fileIcon} 
            alt={t('dragDrop.fileIconAlt')} 
            className="drag-drop-icon"
          />
        )}
        <div className="drag-drop-message">{t('dragDrop.message')}</div>
        <div className="drag-drop-sub">{t('dragDrop.subMessage')}</div>
      </div>
    </div>
  );
}

export default DragDropOverlay;