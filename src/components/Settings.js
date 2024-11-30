// src/components/Settings.js
import React, { useState, useEffect } from 'react';
import '../CSS/Settings.css';
const { ipcRenderer } = window.require('electron');

function Settings({ isVisible, onClose, isDarkMode }) {
  const [settings, setSettings] = useState({
    windowOpacity: 1.0,      // 창 전체 투명도
    contentOpacity: 0.8,     // 배경 투명도
    overlayFixed: false,
    loadLastOverlayBounds: true,
    accentColor: '#007bff',
    processMode: 'paragraph'  // 기본 텍스트 처리 방식
  });
  const [originalSettings, setOriginalSettings] = useState(null);

  // 초기 설정 로드
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await ipcRenderer.invoke('load-settings');
        if (savedSettings) {
          // 기존 processMode를 우선적으로 사용
          const processMode = savedSettings.processMode || 'paragraph';
          
          const newSettings = {
            ...settings,
            ...savedSettings,
            processMode // 명시적으로 processMode 설정
          };
          
          setSettings(newSettings);
          setOriginalSettings(newSettings); // originalSettings도 동일하게 설정
          
          // 디버깅용
          console.log('로드된 설정:', newSettings);
        }
      } catch (error) {
        console.error('설정 로드 중 오류:', error);
      }
    };
    
    if (isVisible) {
      loadSettings();
    }
  }, [isVisible]);
  
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
        windowOpacity: newSettings.windowOpacity,
        contentOpacity: newSettings.contentOpacity,
        overlayFixed: newSettings.overlayFixed,
        loadLastOverlayBounds: newSettings.loadLastOverlayBounds,
        accentColor: newSettings.accentColor,
        processMode: newSettings.processMode
      });
  
      if (!result) {
        console.error('설정 적용 실패');
      }
    } catch (error) {
      console.error('설정 변경 중 오류:', error);
    }
  };

  // 텍스트 처리 방식 토글 핸들러
  const handleProcessModeChange = async () => {
    try {
      const currentMode = settings.processMode;
      const newMode = currentMode === 'paragraph' ? 'line' : 'paragraph';
      
      // 디버깅용
      console.log('모드 전환:', currentMode, '->', newMode);

      const newSettings = {
        ...settings,
        processMode: newMode
      };

      // 먼저 UI 상태 업데이트
      setSettings(newSettings);
      
      // 설정 저장 및 모드 전환 요청
      await ipcRenderer.invoke('apply-settings', newSettings);
      ipcRenderer.send('switch-mode', newMode);
      
      // 성공 시 originalSettings 업데이트
      setOriginalSettings(newSettings);

    } catch (error) {
      console.error('모드 전환 중 오류:', error);
      // 오류 시 이전 상태로 복구
      setSettings(originalSettings);
    }
  };

  // 취소 시 원래 값으로 복원
  const handleCancel = () => {
    if (originalSettings) {
      setSettings(originalSettings);
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
        
        <div className="settings-scroll-area">
          {/* 텍스트 처리 방식 그룹 */}
          <div className="settings-group">
            <h3>텍스트 처리 방식</h3>
            <div className="segment-control" data-mode={settings.processMode}>
               <button 
                 className={settings.processMode === 'paragraph' ? 'active' : ''}
                 onClick={() => handleProcessModeChange('paragraph')}
               >
                 단락 단위로
               </button>
               <button 
                 className={settings.processMode === 'line' ? 'active' : ''}
                 onClick={() => handleProcessModeChange('line')}
               >
                 줄 단위로
               </button>
             </div>
           </div>

          {/* 오버레이 그룹 */}
          <div className="settings-group">
            <h3>오버레이</h3>
            <label>
              전체 투명도
              <input 
                type="range" 
                min="0"
                max="100"
                step="1"
                value={settings.windowOpacity * 100}
                onChange={e => handleSettingChange({
                  ...settings, 
                  windowOpacity: parseFloat(e.target.value) / 100
                })}
              />
            </label>
            <label>
              배경 투명도
              <input 
                type="range" 
                min="0"
                max="100"
                step="1"
                value={settings.contentOpacity * 100}
                onChange={e => handleSettingChange({
                  ...settings, 
                  contentOpacity: parseFloat(e.target.value) / 100
                })}
              />
            </label>
            <label className="checkbox-label">
              오버레이 위치 고정
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

          {/* 앱 설정 그룹 */}
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

          {/* 데이터 관리 그룹 */}
          <div className="settings-group danger-zone">
            <h3>데이터 관리</h3>
            <button onClick={handleClearLogs}>
              로그 파일 정리
            </button>
          </div>
        </div>
        
        <div className="settings-button-group">
          <button className="btn" onClick={handleCancel}>취소</button>
          <button className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}

export default Settings;