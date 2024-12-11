// DragDropOverlay.js
import React, { useEffect, useState } from 'react';
import '../CSS/DragDropOverlay.css';
const { ipcRenderer } = window.require('electron');

function DragDropOverlay({ isVisible, theme }) {
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
            alt="Text file" 
            className="drag-drop-icon"
          />
        )}
        <div className="drag-drop-message">텍스트 파일을 여기에 드롭하세요</div>
        <div className="drag-drop-sub">*.txt 파일만 지원됩니다</div>
      </div>
    </div>
  );
}

export default DragDropOverlay;