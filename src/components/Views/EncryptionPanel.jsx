import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useEditorStore from '../../stores/useEditorStore';
import useIconStore from '../../stores/useIconStore';
import '../../CSS/Controllers/Checkbox.css';
import '../../CSS/Controllers/Toggle.css';

const TRANSITION_MS = 200;
const PW_MIN = 4;
const PW_MAX = 32;

function EncryptionPanel({ anchorRef }) {
  const { t } = useTranslation();
  const icons = useIconStore((s) => s.icons);

  const isOpen = useEditorStore((s) => s.encryptionOpen);
  const setEncryptionOpen = useEditorStore((s) => s.setEncryptionOpen);
  const encryptionEnabled = useEditorStore((s) => s.encryptionEnabled);
  const setEncryptionEnabled = useEditorStore((s) => s.setEncryptionEnabled);
  const encryptionPassword = useEditorStore((s) => s.encryptionPassword);
  const setEncryptionPassword = useEditorStore((s) => s.setEncryptionPassword);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const popupRef = useRef(null);
  const closeTimerRef = useRef(null);
  const inputRef = useRef(null);

  // ─── 열기/닫기 트랜지션 ───
  useEffect(() => {
    if (isOpen) {
      clearTimeout(closeTimerRef.current);
      if (anchorRef?.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setPopupPos({ top: rect.top, right: window.innerWidth - rect.left + 8 });
      }
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      setShowPassword(false);
      closeTimerRef.current = setTimeout(() => setMounted(false), TRANSITION_MS);
    }
    return () => clearTimeout(closeTimerRef.current);
  }, [isOpen]);

  // ─── 뷰포트 경계 보정 ───
  useEffect(() => {
    if (!visible || !popupRef.current || !popupPos) return;
    const MARGIN = 20;
    requestAnimationFrame(() => {
      const el = popupRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = Math.max(MARGIN, Math.min(popupPos.top, vh - h - MARGIN));
      const right = Math.max(MARGIN, Math.min(popupPos.right, vw - w - MARGIN));
      if (top !== popupPos.top || right !== popupPos.right) {
        setPopupPos({ top, right });
      }
    });
  }, [visible]);

  // ─── 외부 클릭 닫기 ───
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) {
        setEncryptionOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, setEncryptionOpen, anchorRef]);

  // ─── 키 전파 차단 (팝업 내부 이벤트는 통과) ───
  useEffect(() => {
    if (!isOpen) return;
    const stopPropagation = (e) => {
      if (popupRef.current?.contains(e.target)) return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', stopPropagation, true);
    return () => window.removeEventListener('keydown', stopPropagation, true);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    const next = !encryptionEnabled;
    setEncryptionEnabled(next);
    if (!next) {
      setEncryptionPassword('');
    }
  }, [encryptionEnabled, setEncryptionEnabled, setEncryptionPassword]);

  const handlePasswordChange = useCallback((e) => {
    const val = e.target.value.slice(0, PW_MAX);
    setEncryptionPassword(val);
  }, [setEncryptionPassword]);

  const handlePasswordKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (encryptionPassword.length >= PW_MIN && encryptionPassword.length <= PW_MAX) {
        setEncryptionOpen(false);
      }
    }
  }, [encryptionPassword, setEncryptionOpen]);

  const isPasswordValid = !encryptionEnabled || (encryptionPassword.length >= PW_MIN && encryptionPassword.length <= PW_MAX);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`encryption-panel-popup${visible ? ' visible' : ''}`}
      ref={popupRef}
      style={popupPos ? { top: `${popupPos.top}px`, right: `${popupPos.right}px` } : undefined}
    >
      <div className="encryption-panel-header">
        <span>{t('editor.encryption.title')}</span>
      </div>
      <div className="encryption-panel-body">
        {/* 암호화 토글 */}
        <div className="encryption-panel-row">
          <span className="encryption-panel-label">{t('editor.encryption.enable')}</span>
          <div className="toggle-switch" onClick={handleToggle}>
            <span className={`toggle-slider${encryptionEnabled ? ' active' : ''}`}></span>
          </div>
        </div>

        {/* 비밀번호 입력 */}
        {encryptionEnabled && (
          <div className="encryption-panel-password-section">
            <div className="encryption-panel-input-row">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                className={`encryption-panel-input${!isPasswordValid && encryptionPassword.length > 0 ? ' invalid' : ''}`}
                placeholder={t('editor.encryption.passwordPlaceholder')}
                value={encryptionPassword}
                onChange={handlePasswordChange}
                onKeyDown={handlePasswordKeyDown}
                maxLength={PW_MAX}
                autoComplete="off"
              />
              <button
                type="button"
                className="encryption-panel-toggle-pw"
                onClick={() => setShowPassword(p => !p)}
                title={showPassword ? t('editor.encryption.hidePassword') : t('editor.encryption.showPassword')}
              >
                <img src={showPassword ? icons?.eyeOff : icons?.eye} alt="" className="encryption-pw-icon" />
              </button>
            </div>
            {!isPasswordValid && encryptionPassword.length > 0 && (
              <span className="encryption-panel-hint">
                {t('editor.encryption.passwordHint')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default EncryptionPanel;
