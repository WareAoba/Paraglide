// src/components/Settings.js
import React, { useState, useEffect } from 'react';
import './Settings.css';
const { ipcRenderer } = window.require('electron');

function Settings({ isVisible, onClose, isDarkMode }) {
  const [settings, setSettings] = useState({
    overlayOpacity: 0.8,
    overlayFixed: false,
    loadLastOverlayBounds: true,
    accentColor: '#007bff'
  });
  const [originalSettings, setOriginalSettings] = useState(null);

  useEffect(() => {
    ipcRenderer.invoke('load-settings').then(savedSettings => {
      if (savedSettings) {
        setSettings(savedSettings);
        setOriginalSettings(savedSettings);
      }
    });
  }, []);
  
   // 로그 파일 정리 핸들러
   const handleClearLogs = async () => {
    if (window.confirm('모든 로그 파일을 정리하시겠습니까?')) {
      await ipcRenderer.invoke('clear-log-files');
    }
  }; 

  const handleSettingChange = async (newSettings) => {
    try {
      // 설정 상태 업데이트
      setSettings(newSettings);
  
      // 설정 적용 요청
      const result = await ipcRenderer.invoke('apply-settings', {
        overlayOpacity: newSettings.overlayOpacity,
        overlayFixed: newSettings.overlayFixed,
        loadLastOverlayBounds: newSettings.loadLastOverlayBounds,
        accentColor: newSettings.accentColor,
      });
  
      if (!result) {
        console.error('설정 적용 실패');
      }
    } catch (error) {
      console.error('설정 변경 중 오류:', error);
    }
  };

  // 취소 시 원래 값으로 복원
  const handleCancel = () => {
    if (originalSettings) {
      handleSettingChange(originalSettings);
    }
    onClose();
  };

  return (
    <div className={`settings-modal ${isVisible ? 'visible' : ''}`}
    data-theme={isDarkMode ? 'dark' : 'light'}
    >
      <div className="settings-content">
        <h2>설정</h2>
        
        <div className="settings-group">
          <h3>오버레이</h3>
          <label>
            투명도
            <input 
              type="range" 
              min="0"
              max="100"
              step="1"
              value={settings.overlayOpacity * 100}
              onChange={e => handleSettingChange({
                ...settings, 
                overlayOpacity: parseFloat(e.target.value) / 100
              })}
            />
          </label>
          <label className="checkbox-label">
            오버레이 고정
            <input 
              type="checkbox"
              checked={settings.overlayFixed}
              onChange={e => handleSettingChange({
                ...settings, 
                overlayFixed: e.target.checked
              })}
            />
          </label>
          <label className="checkbox-label">
            마지막 오버레이 위치/크기 가져오기
            <input 
              type="checkbox"
              checked={settings.loadLastOverlayBounds}
              onChange={e => handleSettingChange({
                ...settings, 
                loadLastOverlayBounds: e.target.checked
              })}
            />
          </label>
        </div>

        <div className="settings-group">
          <h3>앱 설정</h3>
          <label>
            강조색
            <input 
              type="color"
              value={settings.accentColor}
              onChange={e => handleSettingChange({
                ...settings, 
                accentColor: e.target.value
              })}
            />
          </label>
        </div>

        <div className="settings-group">
          <h3>데이터 관리</h3>
          <button 
            className="btn btn-danger" 
            onClick={handleClearLogs}
          >
            로그 파일 정리
          </button>
        </div>
        
        <div className="button-group">
          <button className="btn" onClick={handleCancel}>취소</button>
          <button className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}

export default Settings;