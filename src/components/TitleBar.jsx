// src/components/TitleBar.jsx
import React, { useState, useEffect } from 'react';
import '../CSS/TitleBar.css';

const { ipcRenderer } = window.require('electron');

function TitleBar({ logoPath, titlePath }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // 초기 상태 확인
    ipcRenderer.invoke('window-is-maximized').then(setIsMaximized);

    const handleMaximized = (_, maximized) => setIsMaximized(maximized);
    ipcRenderer.on('window-maximized', handleMaximized);
    return () => ipcRenderer.removeListener('window-maximized', handleMaximized);
  }, []);

  const handleMinimize = () => ipcRenderer.send('window-minimize');
  const handleMaximize = () => ipcRenderer.send('window-maximize');
  const handleClose = () => ipcRenderer.send('window-close');

  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        {logoPath && <img src={logoPath} alt="Logo" className="titlebar-logo" />}
        {titlePath && <img src={titlePath} alt="Paraglide" className="titlebar-title" />}
      </div>
      <div className="titlebar-drag" />
      <div className="titlebar-buttons">
        <button className="titlebar-btn titlebar-btn-minimize" onClick={handleMinimize} aria-label="최소화">
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button className="titlebar-btn titlebar-btn-maximize" onClick={handleMaximize} aria-label="최대화">
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 0h7v7H8V1H2V0z" fill="currentColor" />
              <rect x="0" y="3" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button className="titlebar-btn titlebar-btn-close" onClick={handleClose} aria-label="닫기">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 0L5 4L9 0L10 1L6 5L10 9L9 10L5 6L1 10L0 9L4 5L0 1Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
