import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const TRANSITION_MS = 200;
const STYLE_COUNT = 10;

function TextStyleSlots({ isOpen, onClose, onSelect, anchorRef, activeStyleIndex }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const popupRef = useRef(null);
  const closeTimerRef = useRef(null);

  // 프리셋 이름 목록 (i18n)
  const presetNames = Array.from({ length: STYLE_COUNT }, (_, i) =>
    t(`editor.style.preset${i + 1}`)
  );

  // ─── 열기/닫기 트랜지션 ───
  useEffect(() => {
    if (isOpen) {
      clearTimeout(closeTimerRef.current);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      closeTimerRef.current = setTimeout(() => setMounted(false), TRANSITION_MS);
    }
    return () => clearTimeout(closeTimerRef.current);
  }, [isOpen]);

  // ─── 외부 클릭 닫기 ───
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  // ─── 슬롯 클릭 → 스타일 선택 ───
  const handleSlotClick = useCallback((idx) => {
    onSelect(idx + 1); // style은 1-based
  }, [onSelect]);

  if (!mounted) return null;

  return (
    <div
      className={`text-style-popup${visible ? ' visible' : ''}`}
      ref={popupRef}
    >
      <div className="text-style-header">
        <span>{t('editor.style.title')}</span>
      </div>
      <div className="text-style-list">
        {presetNames.map((name, idx) => (
          <div
            key={idx}
            className={`text-style-slot${activeStyleIndex === idx + 1 ? ' active' : ''}`}
            onClick={() => handleSlotClick(idx)}
            title={`${name} (Alt+${idx === 9 ? '0' : idx + 1})`}
          >
            <span className="text-style-slot-key">{idx === 9 ? '0' : idx + 1}</span>
            <span className="text-style-slot-value">{name}</span>
            <span className="text-style-slot-shortcut">Alt+{idx === 9 ? '0' : idx + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TextStyleSlots;
