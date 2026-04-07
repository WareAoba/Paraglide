import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useIconStore from '../../stores/useIconStore';
import '../../CSS/Controllers/Checkbox.css';

const PW_MIN = 4;
const PW_MAX = 32;

/**
 * 암호화된 파일 열기 시 비밀번호 입력 커스텀 모달.
 * 
 * @param {boolean} isOpen - 모달 표시 여부
 * @param {function} onSubmit - (password: string, rememberPassword: boolean) => void
 * @param {function} onCancel - () => void
 * @param {string} [errorMessage] - 복호화 실패 시 에러 메시지
 */
function EncryptionModal({ isOpen, onSubmit, onCancel, errorMessage }) {
  const { t } = useTranslation();
  const icons = useIconStore((s) => s.icons);
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setPassword('');
      setRememberPassword(false);
      setShowPassword(false);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setVisible(true);
        inputRef.current?.focus();
      }));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    if (password.length >= PW_MIN && password.length <= PW_MAX) {
      onSubmit(password, rememberPassword);
    }
  }, [password, rememberPassword, onSubmit]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [handleSubmit, onCancel]);

  // 키 전파 차단 (모달 내부 이벤트는 통과)
  const backdropRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const stop = (e) => {
      if (backdropRef.current?.contains(e.target)) return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', stop, true);
    return () => window.removeEventListener('keydown', stop, true);
  }, [isOpen]);

  if (!isOpen && !mounted) return null;

  const isValid = password.length >= PW_MIN && password.length <= PW_MAX;

  return createPortal(
    <div ref={backdropRef} className={`encryption-modal-backdrop${visible ? ' visible' : ''}`}>
      <div className={`encryption-modal${visible ? ' visible' : ''}`}>
        <div className="encryption-modal-header">
          {t('editor.encryption.decryptTitle')}
        </div>
        <div className="encryption-modal-body">
          <p className="encryption-modal-desc">
            {t('editor.encryption.decryptDesc')}
          </p>

          {errorMessage && (
            <p className="encryption-modal-error">{errorMessage}</p>
          )}

          <div className="encryption-modal-input-row">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              className="encryption-modal-input"
              placeholder={t('editor.encryption.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value.slice(0, PW_MAX))}
              onKeyDown={handleKeyDown}
              maxLength={PW_MAX}
              autoComplete="off"
            />
            <button
              type="button"
              className="encryption-modal-toggle-pw"
              onClick={() => setShowPassword(p => !p)}
            >
              <img src={showPassword ? icons?.eyeOff : icons?.eye} alt="" className="encryption-pw-icon" />
            </button>
          </div>

          {/* 비밀번호 저장 체크박스 */}
          <div className="checkbox-wrapper encryption-modal-remember">
            <input
              type="checkbox"
              id="encryption-remember"
              checked={rememberPassword}
              onChange={(e) => setRememberPassword(e.target.checked)}
            />
            <label className="checkbox" htmlFor="encryption-remember">
              <span>
                <svg width="12" height="10" viewBox="0 0 12 10">
                  <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
                </svg>
              </span>
              <span>{t('editor.encryption.rememberPassword')}</span>
            </label>
          </div>
        </div>
        <div className="encryption-modal-footer">
          <button
            type="button"
            className="encryption-modal-btn cancel"
            onClick={onCancel}
          >
            {t('common.buttons.cancel')}
          </button>
          <button
            type="button"
            className="encryption-modal-btn confirm"
            onClick={handleSubmit}
            disabled={!isValid}
          >
            {t('common.buttons.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default EncryptionModal;
