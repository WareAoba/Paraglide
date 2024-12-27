// src/components/Settings.js
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HexColorPicker } from 'react-colorful';
import '../CSS/Settings.css';
import '../CSS/Controllers/Checkbox.css';
import '../CSS/Controllers/RangeSlider.css';
import '../CSS/Controllers/Dropdown.css';
const { ipcRenderer } = window.require('electron');

function Settings({ isVisible, onClose, icons }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({
    windowOpacity: 1.0, // 창 전체 투명도
    contentOpacity: 0.8, // 배경 투명도
    overlayFixed: false,
    loadLastOverlayBounds: true,
    theme: {
      mode: 'auto', // 테마 모드 추가
      accentColor: '#007bff'
    },
    processMode: 'paragraph', // 기본 텍스트 처리 방식
    viewMode: 'overview',
    language: 'auto'  // 기본값 추가
  });
  const [originalSettings, setOriginalSettings] = useState(null);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const themeDropdownRef = useRef(null);  // 이름 변경
  const languageDropdownRef = useRef(null);  // 추가
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef(null);

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
            processMode, // 명시적으로 processMode 설정
            language: savedSettings.language || 'auto'
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
        processMode: newSettings.processMode,
        viewMode: newSettings.viewMode,
        theme: {
          mode: newSettings.theme.mode,
          accentColor: newSettings.theme.accentColor
        }
      });

      if (newSettings.viewMode && newSettings.viewMode !== settings.viewMode) {
        ipcRenderer.send('update-view-mode', newSettings.viewMode);
      }

      if (!result) {
        console.error('[Settings] 설정 적용 실패');
      }
    } catch (error) {
      console.error('[Settings] 설정 변경 중 오류:', error);
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

  useEffect(() => {
    // 설정이 로드되면 슬라이더 값 초기화
    const windowOpacitySlider = document.querySelector('input[type="range"][value="' + (settings.windowOpacity * 100) + '"]');
    const contentOpacitySlider = document.querySelector('input[type="range"][value="' + (settings.contentOpacity * 100) + '"]');

    if (windowOpacitySlider) {
      windowOpacitySlider.style.setProperty('--slider-value', `${settings.windowOpacity * 100}%`);
    }
    if (contentOpacitySlider) {
      contentOpacitySlider.style.setProperty('--slider-value', `${settings.contentOpacity * 100}%`);
    }
  }, [settings.windowOpacity, settings.contentOpacity]);

  // 테마 드롭다운 바깥 클릭 감지
useEffect(() => {
  function handleThemeDropdownOutside(event) {
    if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target)) {
      setShowThemeDropdown(false);
    }
  }

  document.addEventListener('mousedown', handleThemeDropdownOutside);
  return () => {
    document.removeEventListener('mousedown', handleThemeDropdownOutside);
  };
}, []);

// 언어 드롭다운 바깥 클릭 감지
useEffect(() => {
  function handleLanguageDropdownOutside(event) {
    if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target)) {
      setShowLanguageDropdown(false);
    }
  }

  document.addEventListener('mousedown', handleLanguageDropdownOutside);
  return () => {
    document.removeEventListener('mousedown', handleLanguageDropdownOutside);
  };
}, []);

  useEffect(() => {
    function handleColorpickerOutside(event) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
        setShowColorPicker(false);
      }
    }

    document.addEventListener('mousedown', handleColorpickerOutside);
    return () => document.removeEventListener('mousedown', handleColorpickerOutside);
  }, []);

  const handleLanguageItemClick = async (lang) => {
    try {
      // 1. 드롭다운 즉시 닫기
      setShowLanguageDropdown(false);
  
      // 2. 언어 변경 요청 먼저 실행
      const success = await ipcRenderer.invoke('change-language', lang);
      if (!success) {
        console.error('언어 변경 실패');
        return;
      }
  
      // 3. 성공 시에만 설정 상태 업데이트
      const newSettings = {
        ...settings,
        language: lang
      };
  
      setSettings(newSettings);
      await handleSettingChange(newSettings);
  
    } catch (error) {
      console.error('언어 설정 변경 실패:', error);
    }
  };

  const handleThemeItemClick = async (mode) => {
    // setTimeout 제거하고 즉시 실행하도록 변경
    await handleSettingChange({
      ...settings,
      theme: { ...settings.theme, mode }
    });
    setShowThemeDropdown(false);
  };

  const handleViewModeChange = async () => {
    try {
      const currentMode = settings.viewMode;
      const newMode = currentMode === 'overview' ? 'listview' : 'overview';

      const newSettings = {
        ...settings,
        viewMode: newMode
      };

      setSettings(newSettings);
      await ipcRenderer.invoke('apply-settings', newSettings);
      ipcRenderer.send('update-view-mode', newMode);

      setOriginalSettings(newSettings);
    } catch (error) {
      console.error('뷰 모드 전환 중 오류:', error);
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
    <div
      className={`settings-modal ${isVisible ? 'visible' : ''}`}
      data-theme={settings.theme.mode}
      onClick={(e) => {
        if (typeof e.target.className === 'string' && e.target.className.includes('settings-modal')) {
          onClose();
        }
        if (e.target.classList && e.target.classList.contains('settings-modal')) {
          onClose();
        }
      }}
    >
      <div className="settings-content">
        <h2>{t('settings.title')}</h2>

        <div className="settings-scroll-area">
          <div className="settings-group">
            {/* 텍스트 처리 방식 그룹 */}
            <h3>{t('settings.processMode.title')}</h3>
            <div className="segment-control" data-mode={settings.processMode}>
              <button
                className={settings.processMode === 'paragraph' ? 'active' : ''}
                onClick={() => handleProcessModeChange('paragraph')}
              >
                {t('settings.processMode.paragraph')}
              </button>
              <button
                className={settings.processMode === 'line' ? 'active' : ''}
                onClick={() => handleProcessModeChange('line')}
              >
                {t('settings.processMode.line')}
              </button>
            </div>
          </div>

          <div className="settings-group">
            <h3>{t('settings.viewMode.title')}</h3>
            <div
              className="segment-control"
              data-mode={settings.viewMode}
              onClick={handleViewModeChange} // 전체 영역에 클릭 핸들러 추가
            >
              <button className={settings.viewMode === 'overview' ? 'active' : ''}>
                {t('settings.viewMode.overview')}
              </button>
              <button className={settings.viewMode === 'listview' ? 'active' : ''}>
                {t('settings.viewMode.listview')}
              </button>
            </div>
          </div>

          {/* 오버레이 그룹 */}
          <div className="settings-group">
            <h3>{t('settings.overlay.title')}</h3>
            <div className="slider-wrapper">
              <span>{t('settings.overlay.windowOpacity')}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.windowOpacity * 100}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  e.target.style.setProperty('--slider-value', `${value}%`);
                  handleSettingChange({
                    ...settings,
                    windowOpacity: value / 100
                  });
                }}
              />
            </div>
            <div className="slider-wrapper">
              <span>{t('settings.overlay.contentOpacity')}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.contentOpacity * 100}
                onChange={(e) => {
                  const value = e.target.value;
                  // CSS 변수 업데이트
                  e.target.style.setProperty('--slider-value', `${value}%`);
                  // 기존 설정 업데이트
                  handleSettingChange({
                    ...settings,
                    contentOpacity: parseFloat(value) / 100
                  });
                }}
              />
            </div>
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="overlayFixed"
                checked={settings.overlayFixed}
                onChange={(e) =>
                  handleSettingChange({
                    ...settings,
                    overlayFixed: e.target.checked
                  })
                }
              />
              <label className="checkbox" htmlFor="overlayFixed">
                <span>
                  <svg width="12" height="10" viewBox="0 0 12 10">
                    <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                  </svg>
                </span>
                <span>{t('settings.overlay.fixed')}</span>
              </label>
            </div>
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="loadLastOverlayBounds"
                checked={settings.loadLastOverlayBounds}
                onChange={(e) =>
                  handleSettingChange({
                    ...settings,
                    loadLastOverlayBounds: e.target.checked
                  })
                }
              />
              <label className="checkbox" htmlFor="loadLastOverlayBounds">
                <span>
                  <svg width="12" height="10" viewBox="0 0 12 10"></svg>
                    <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                </span>
                <span>{t('settings.overlay.remember')}</span>
              </label>
            </div>
          </div>

          {/* 앱 설정 그룹 */}
          <div className="settings-group">
            <h3>{t('settings.appearance.title')}</h3>
            <label className="settings-label">
  {t('settings.language.title')}
  <div className="dropdown-wrapper language-dropdown" ref={languageDropdownRef}>
  <button
  className="dropdown-button"
  onClick={(e) => {
    e.stopPropagation();
    setShowLanguageDropdown(!showLanguageDropdown);
  }}
>
  <span>{t(`settings.language.${settings.language}`)}</span>
  <svg width="10" height="6" viewBox="0 0 10 6">
    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
</button>
    <div className={`dropdown-menu ${showLanguageDropdown ? 'show' : ''}`}>
      {['auto', 'ko', 'en', 'ja', 'zh'].map((lang) => (
        <div
          key={lang}
          className={`dropdown-item ${settings.language === lang ? 'active' : ''}`}
          onClick={() => handleLanguageItemClick(lang)}
        >
          {t(`settings.language.${lang}`)}
        </div>
      ))}
    </div>
  </div>
</label>
            <label>
              {t('settings.appearance.accentColor')}
              <div className="color-picker-container" ref={colorPickerRef}>
                <div
                  className="color-preview"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  style={{
                    backgroundColor: settings.theme.accentColor,
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    border: '2px solid var(--border-color)',
                    cursor: 'pointer'
                  }}
                />
                <div className={`color-picker-popup ${showColorPicker ? 'visible' : ''}`}>
                  <HexColorPicker
                    color={settings.theme.accentColor}
                    onChange={(color) => {
                      handleSettingChange({
                        ...settings,
                        theme: {
                          ...settings.theme,
                          accentColor: color
                        }
                      });
                    }}
                  />
                  <div className="color-presets">
                    {['#007bff', '#dc3545', '#28a745', '#ffc107', '#17a2b8', '#6f42c1'].map((color) => (
                      <div
                        key={color}
                        className="color-preset"
                        style={{
                          backgroundColor: color,
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          margin: '4px'
                        }}
                        onClick={() => {
                          handleSettingChange({
                            ...settings,
                            theme: {
                              ...settings.theme,
                              accentColor: color
                            }
                          });
                          setShowColorPicker(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </label>
            <label className="settings-label">
              {t('settings.appearance.theme.title')}
              <div className="dropdown-wrapper" ref={themeDropdownRef}>
                <button
                  className="dropdown-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowThemeDropdown(!showThemeDropdown);
                  }}
                >
                  <img
                    src={
                      settings.theme.mode === 'auto'
                        ? icons?.themeAuto
                        : settings.theme.mode === 'light'
                        ? icons?.themeLight
                        : icons?.themeDark
                    }
                    alt={t('settings.appearance.theme.iconAlt')}
                    className="dropdown-icon"
                  />
                  {t(`settings.appearance.theme.${settings.theme.mode}`)}
                  <svg width="10" height="6" viewBox="0 0 10 6">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                </button>
                <div className={`dropdown-menu ${showThemeDropdown ? 'show' : ''}`}>
                  {['auto', 'light', 'dark'].map((mode) => (
                    <div
                      key={mode}
                      className={`dropdown-item ${settings.theme.mode === mode ? 'active' : ''}`}
                      onClick={() => handleThemeItemClick(mode)}
                    >
                      <img
                        src={icons?.[`theme${mode.charAt(0).toUpperCase() + mode.slice(1)}`]}
                        alt={t(`settings.appearance.theme.${mode}IconAlt`)}
                        className="dropdown-icon"
                      />
                      {t(`settings.appearance.theme.${mode}`)}
                    </div>
                  ))}
                </div>
              </div>
            </label>
          </div>

          {/* 데이터 관리 그룹 */}
          <div className="settings-group danger-zone">
            <h3>{t('settings.dataManagement.title')}</h3>
            <button onClick={handleClearLogs}>{t('settings.dataManagement.clearLogs')}</button>
          </div>

          {/* 정보 그룹 */}
          <div className="settings-group">
            <h3>{t('settings.info.title')}</h3>
            <div className="info-item">
              <p>{t('settings.info.version')}</p>
              <p>{t('settings.info.credits.made')}</p>
              <p>{t('settings.info.credits.contribute')}</p>
            </div>
          </div>
        </div>

        <div className="settings-button-group">
          <button className="btn" onClick={handleCancel}>
            {t('common.buttons.cancel')}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            {t('common.buttons.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
