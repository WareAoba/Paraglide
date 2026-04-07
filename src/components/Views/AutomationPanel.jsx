import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useEditorStore from '../../stores/useEditorStore';
import '../../CSS/Views/AutomationPanel.css';
import '../../CSS/Controllers/Checkbox.css';

function AutomationPanel({ isOpen, onClose, actions, anchorRef }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [panelPos, setPanelPos] = useState(null);

  // ─── Zustand 스토어에서 상태 구독 ───
  const autoSettings = useEditorStore((s) => s.autoSettings);
  const running = useEditorStore((s) => s.automationRunning);
  const setAutomationRunning = useEditorStore((s) => s.setAutomationRunning);

  // ref로 최신값 노출 (콜백에서 참조)
  const autoSettingsRef = useRef(autoSettings);
  useEffect(() => {
    autoSettingsRef.current = autoSettings;
    if (actions?.onAutoSettingsChange) actions.onAutoSettingsChange(autoSettings);
  }, [autoSettings, actions]);

  const toggleAuto = useCallback((key) => {
    useEditorStore.getState().toggleAutoSetting(key);
  }, []);

  const handleRun = useCallback(async (key) => {
    if (!actions?.[key] || running[key]) return;
    setAutomationRunning((prev) => ({ ...prev, [key]: true }));
    try { await actions[key](); } catch (e) { console.error(`Automation [${key}] 실패:`, e); }
    setAutomationRunning((prev) => ({ ...prev, [key]: false }));
  }, [actions, running, setAutomationRunning]);

  const handleRunAll = useCallback(async () => {
    const keys = ['metadata', 'numbering', 'spread', 'dpi'];
    for (const key of keys) {
      if (!actions?.[key]) continue;
      setAutomationRunning((prev) => ({ ...prev, [key]: true }));
      try { await actions[key](); } catch (e) { console.error(`Automation [${key}] 실패:`, e); }
      setAutomationRunning((prev) => ({ ...prev, [key]: false }));
    }
  }, [actions, setAutomationRunning]);

  // ─── 등장/퇴장 트랜지션 ───
  useEffect(() => {
    if (isOpen) {
      if (anchorRef?.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setPanelPos({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right });
      }
      setVisible(true);
      requestAnimationFrame(() => setAnimating(true));
    } else if (visible) {
      setAnimating(false);
    }
  }, [isOpen]);

  // ─── 뷰포트 경계 보정 (그림자 여유 포함) ───
  useEffect(() => {
    if (!animating || !panelRef.current || !panelPos) return;
    const MARGIN = 20; // 그림자 최대 확장(~18px) + 여유
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bottom = Math.max(MARGIN, Math.min(panelPos.bottom, vh - h - MARGIN));
      const right = Math.max(MARGIN, Math.min(panelPos.right, vw - w - MARGIN));
      if (bottom !== panelPos.bottom || right !== panelPos.right) {
        setPanelPos({ bottom, right });
      }
    });
  }, [animating]);

  const handleTransitionEnd = useCallback(() => {
    if (!animating) setVisible(false);
  }, [animating]);

  // ─── 패널 외부 클릭 닫기 ───
  const panelRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClick); };
  }, [isOpen, onClose]);

  if (!visible) return null;

  const features = [
    { key: 'metadata',  label: t('automation.metadata') },
    { key: 'numbering', label: t('automation.numbering') },
    { key: 'spread',    label: t('automation.spread') },
    { key: 'dpi',       label: t('automation.dpi') },
  ];

  return createPortal(
    <div
      className={`automation-panel${animating ? ' is-open' : ''}`}
      ref={panelRef}
      onTransitionEnd={handleTransitionEnd}
      style={panelPos ? { bottom: `${panelPos.bottom}px`, right: `${panelPos.right}px` } : undefined}
    >
      <div className="automation-panel__header">
        <span className="automation-panel__title">{t('automation.title')}</span>
        <button className="automation-panel__close" onClick={onClose}>×</button>
      </div>
      <div className="automation-panel__body">
        {features.map(({ key, label }) => (
          <div className="automation-panel__row" key={key}>
            <div className="checkbox-wrapper automation-panel__auto-label">
              <input
                type="checkbox"
                id={`auto-${key}`}
                checked={autoSettings[key]}
                onChange={() => toggleAuto(key)}
              />
              <label className="checkbox" htmlFor={`auto-${key}`}>
                <span>
                  <svg width="12" height="10" viewBox="0 0 12 10">
                    <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                  </svg>
                </span>
                <span className="automation-panel__auto-text">{t('automation.auto')}</span>
              </label>
            </div>
            <span className="automation-panel__label">{label}</span>
            <button
              className={`automation-panel__run-btn${running[key] ? ' is-running' : ''}`}
              disabled={running[key] || !actions?.[key]}
              onClick={() => handleRun(key)}
              title={label}
            >
              {running[key] ? '⏳' : '▶'}
            </button>
          </div>
        ))}
      </div>
      <div className="automation-panel__footer">
        <button
          className="automation-panel__run-all"
          onClick={handleRunAll}
          disabled={Object.values(running).some(Boolean)}
        >
          {t('automation.runAll')}
        </button>
      </div>
    </div>,
    document.body
  );
}

// 외부에서 autoSettings를 읽기 위한 헬퍼
AutomationPanel.loadAutoSettings = function () {
  try {
    const saved = JSON.parse(localStorage.getItem('paraglide-automation-auto'));
    if (saved && typeof saved === 'object') return { metadata: false, numbering: false, spread: false, dpi: false, ...saved };
  } catch (_) { /* ignore */ }
  return { metadata: false, numbering: false, spread: false, dpi: false };
};

export default AutomationPanel;
