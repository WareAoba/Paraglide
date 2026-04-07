// src/components/Settings.js
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HexColorPicker } from 'react-colorful';
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PROCESS_MODE,
  DEFAULT_VIEW_MODE,
  DEFAULT_LANGUAGE,
  OVERLAY_DEFAULTS,
  PLUGIN_PORT,
  THEME,
  COLOR_PRESETS,
} from '../constants';
import useAppStore from '../stores/useAppStore';
import useIconStore from '../stores/useIconStore';
import useSettingsStore from '../stores/useSettingsStore';
import '../CSS/Settings.css';
import '../CSS/Controllers/Checkbox.css';
import '../CSS/Controllers/Toggle.css';
import '../CSS/Controllers/RangeSlider.css';
import '../CSS/Controllers/Dropdown.css';
const { ipcRenderer } = window.require('electron');

function Settings({ onClose }) {
  const { t } = useTranslation();

  // ─── Zustand 스토어에서 상태 구독 ───
  const isVisible = useAppStore((s) => s.isSettingsVisible);
  const theme = useAppStore((s) => s.theme);
  const programStatus = useAppStore((s) => s.programStatus);
  const icons = useIconStore((s) => s.icons);

  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const pluginStatus = useSettingsStore((s) => s.pluginStatus);
  const setPluginStatus = useSettingsStore((s) => s.setPluginStatus);

  const originalSettings = useSettingsStore((s) => s.originalSettings);
  const setOriginalSettings = useSettingsStore((s) => s.setOriginalSettings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const applySettings = useSettingsStore((s) => s.applySettings);
  const cancelSettings = useSettingsStore((s) => s.cancelSettings);

  const [showThemeDropdown, setShowThemeDropdown] = React.useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = React.useState(false);
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const themeDropdownRef = useRef(null);
  const languageDropdownRef = useRef(null);
  const colorPickerRef = useRef(null);

  const [activeTab, setActiveTab] = React.useState('general');
  const [isWideMode, setIsWideMode] = React.useState(() => window.innerWidth >= 768);

  // 초기 설정 로드
  useEffect(() => {
    if (isVisible) {
      loadSettings();
      ipcRenderer.invoke('get-plugin-status').then(setPluginStatus).catch(() => {});
    }
  }, [isVisible, loadSettings, setPluginStatus]);

  // 로그 파일 정리 핸들러
  const handleClearLogs = async () => {
    if (window.confirm('모든 로그 파일을 정리하시겠습니까?')) {
      await ipcRenderer.invoke('clear-log-files');
    }
  };

  const handleSettingChange = async (newSettings) => {
    await applySettings(newSettings);
  };

  const handleProcessModeChange = async (targetMode) => {
    try {
      if (!targetMode || targetMode === settings.processMode) return;

      const newSettings = {
        ...settings,
        processMode: targetMode
      };

      setSettings(newSettings);
      await ipcRenderer.invoke('apply-settings', newSettings);
      ipcRenderer.send('switch-mode', targetMode);
      setOriginalSettings(newSettings);
    } catch (error) {
      console.error('모드 전환 중 오류:', error);
      if (originalSettings) setSettings(originalSettings);
    }
  };

  // 드롭다운/컬러피커 바깥 클릭 감지 (통합)
  useEffect(() => {
    function handleOutsideClick(event) {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target)) {
        setShowThemeDropdown(false);
      }
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target)) {
        setShowLanguageDropdown(false);
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
        setShowColorPicker(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 와이드 모드 감지 (반응형 탭 UI)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e) => setIsWideMode(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
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
      // 에디터 모드일 때는 토글 비활성화
      if (programStatus === 'Edit') {
        return;
      }
  
      const newMode = settings.viewMode === DEFAULT_VIEW_MODE ? 'listview' : DEFAULT_VIEW_MODE;
  
      const newSettings = {
        ...settings,
        viewMode: newMode
      };
  
      setSettings(newSettings);
      ipcRenderer.send('update-view-mode', newMode);
  
      setOriginalSettings(newSettings);
    } catch (error) {
      console.error('뷰 모드 전환 중 오류:', error);
      setSettings(originalSettings);
    }
  };

  const handleCancel = () => {
    cancelSettings();
    onClose();
  };

  const SETTINGS_TABS = ['general', 'appearance', 'overlay', 'textProcessing', 'editor', 'plugin'];

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
      <div className={`settings-content${isWideMode ? ' settings-content--wide' : ''}`}>
        <h2>{t('settings.title')}</h2>

        {isWideMode && (
          <nav className="settings-tab-nav">
            {SETTINGS_TABS.map((key) => (
              <button
                key={key}
                className={`settings-tab-item${activeTab === key ? ' active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {t(`settings.tabs.${key}`)}
              </button>
            ))}
          </nav>
        )}

        <div className="settings-scroll-area">
          {(!isWideMode || activeTab === 'textProcessing') && (
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
          )}

          {(!isWideMode || activeTab === 'editor') && (
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
          )}

          {/* 오버레이 그룹 */}
          {(!isWideMode || activeTab === 'overlay') && (
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
                style={{ '--slider-value': `${settings.windowOpacity * 100}%` }}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
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
                style={{ '--slider-value': `${settings.contentOpacity * 100}%` }}
                onChange={(e) => {
                  const value = e.target.value;
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
                  <svg width="12" height="10" viewBox="0 0 12 10">
                    <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                </svg>
                </span>
                <span>{t('settings.overlay.remember')}</span>
              </label>
            </div>
          </div>
          )}

          {/* 앱 설정 그룹 */}
          {(!isWideMode || activeTab === 'appearance') && (
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
                    {COLOR_PRESETS.map((color) => (
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
          )}

          {/* 포토샵 모드 그룹 */}
          {(!isWideMode || activeTab === 'plugin') && (
          <div className="settings-group">
            <h3>{t('settings.plugin.title')}</h3>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">{t('settings.plugin.enable')}</span>
              <div className="toggle-switch" onClick={async () => {
                  const enabled = !settings.pluginServer;
                  const newConnected = enabled ? settings.pluginConnected : false;
                  const newSettings = {
                    ...settings,
                    pluginServer: enabled,
                    pluginConnected: newConnected
                  };
                  setSettings(newSettings);
                  await handleSettingChange(newSettings);

                  // 상태 갱신
                  const status = await ipcRenderer.invoke('get-plugin-status');
                  setPluginStatus(status);
                }}>
                <span className={`toggle-slider${settings.pluginServer ? ' active' : ''}`}></span>
              </div>
            </div>
            {settings.pluginServer && (
              <div className="plugin-status">
                <div className="info-item">
                  <p>{t('settings.plugin.port')}: {PLUGIN_PORT}</p>
                  <p>{t('settings.plugin.connected')}: {pluginStatus.plugins?.length || 0}</p>
                  {pluginStatus.plugins?.map((p, i) => (
                    <p key={i} className="plugin-item">└ {p.app} v{p.version}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {(!isWideMode || activeTab === 'general') && (
          <>
          {/* 데이터 관리 그룹 */}
          <div className="settings-group danger-zone">
            <h3>{t('settings.dataManagement.title')}</h3>
            <button onClick={handleClearLogs}>{t('settings.dataManagement.clearLogs')}</button>
          </div>

          {/* 정보 그룹 */}
          <div className="settings-group">
            <h3>{t('settings.info.title')}</h3>
            <div className="info-item">
              <p>Paraglide {__APP_VERSION__}</p>
              <p>{t('settings.info.credits.made')}</p>
              <p>{t('settings.info.credits.contribute')}</p>
            </div>
          </div>
          </>
          )}
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
