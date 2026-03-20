import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const { ipcRenderer } = window.require('electron');

const MAX_SLOTS = 10;
const DEFAULT_MACROS = ['…', '―', '♡', '♥'];
const TRANSITION_MS = 200;

function TextMacro({ isOpen, onClose, onInsert, anchorRef }) {
  const { t } = useTranslation();
  const [slots, setSlots] = useState(DEFAULT_MACROS);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editValue, setEditValue] = useState('');
  const [dragIdx, setDragIdx] = useState(-1);
  const [dragOverIdx, setDragOverIdx] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const popupRef = useRef(null);
  const editInputRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [popupPos, setPopupPos] = useState(null);

  // ─── config에서 로드 ───
  useEffect(() => {
    const loadMacros = async () => {
      try {
        const saved = await ipcRenderer.invoke('load-text-macros');
        if (Array.isArray(saved) && saved.length > 0) {
          setSlots(saved.slice(0, MAX_SLOTS));
        }
      } catch (_) { /* 기본값 사용 */ }
    };
    loadMacros();
  }, []);

  // ─── 실시간 저장 ───
  const saveMacros = useCallback((newSlots) => {
    ipcRenderer.send('save-text-macros', newSlots);
  }, []);

  // ─── 열기/닫기 트랜지션 (마운트 유지) ───
  useEffect(() => {
    if (isOpen) {
      clearTimeout(closeTimerRef.current);
      // anchorRef 기준 위치 계산
      if (anchorRef?.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setPopupPos({ top: rect.top, right: window.innerWidth - rect.left + 8 });
      }
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      closeTimerRef.current = setTimeout(() => setMounted(false), TRANSITION_MS);
    }
    return () => clearTimeout(closeTimerRef.current);
  }, [isOpen]);

  // ─── 뷰포트 경계 보정 (그림자 여유 포함) ───
  useEffect(() => {
    if (!visible || !popupRef.current || !popupPos) return;
    const MARGIN = 20; // 그림자 최대 확장(~18px) + 여유
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

  // ─── 닫힐 때: 빈 슬롯 정리 + 편집 종료 ───
  const handleClose = useCallback(() => {
    if (editingIdx >= 0) {
      const newSlots = [...slots];
      newSlots[editingIdx] = editValue;
      const cleaned = newSlots.filter(s => s.trim() !== '');
      setSlots(cleaned);
      saveMacros(cleaned);
      setEditingIdx(-1);
      setEditValue('');
    } else {
      const cleaned = slots.filter(s => s.trim() !== '');
      if (cleaned.length !== slots.length) {
        setSlots(cleaned);
        saveMacros(cleaned);
      }
    }
    onClose();
  }, [editingIdx, editValue, slots, saveMacros, onClose]);

  // ─── 외부 클릭 닫기 ───
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClose, anchorRef]);

  // ─── 편집 중 키 입력이 에디터로 전파되지 않도록 차단 ───
  useEffect(() => {
    if (!isOpen) return;
    const stopPropagation = (e) => {
      if (popupRef.current?.contains(e.target)) {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', stopPropagation, true);
    return () => window.removeEventListener('keydown', stopPropagation, true);
  }, [isOpen]);

  // ─── 편집 시작 시 input 포커스 ───
  useEffect(() => {
    if (editingIdx >= 0 && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIdx]);

  // ─── 슬롯 클릭 → 에디터에 삽입 ───
  const handleSlotClick = useCallback((idx) => {
    if (editingIdx >= 0) return;
    const value = slots[idx];
    if (value) {
      onInsert(value);
    }
  }, [slots, editingIdx, onInsert]);

  // ─── 편집 모드 진입 ───
  const startEdit = useCallback((idx, e) => {
    e.stopPropagation();
    setEditingIdx(idx);
    setEditValue(slots[idx] || '');
  }, [slots]);

  // ─── 편집 실시간 저장 (onChange마다) ───
  const handleEditChange = useCallback((e) => {
    const val = e.target.value;
    setEditValue(val);
    const newSlots = [...slots];
    newSlots[editingIdx] = val;
    setSlots(newSlots);
    saveMacros(newSlots);
  }, [editingIdx, slots, saveMacros]);

  // ─── 편집 종료 ───
  const finishEdit = useCallback(() => {
    setEditingIdx(-1);
    setEditValue('');
  }, []);

  // ─── 편집 키 핸들러 ───
  const handleEditKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      finishEdit();
    }
  }, [finishEdit]);

  // ─── 슬롯 삭제 ───
  const handleDelete = useCallback((idx, e) => {
    e.stopPropagation();
    const newSlots = slots.filter((_, i) => i !== idx);
    setSlots(newSlots);
    saveMacros(newSlots);
    if (editingIdx === idx) {
      setEditingIdx(-1);
      setEditValue('');
    } else if (editingIdx > idx) {
      setEditingIdx(editingIdx - 1);
    }
  }, [slots, editingIdx, saveMacros]);

  // ─── 슬롯 추가 ───
  const handleAdd = useCallback(() => {
    if (slots.length >= MAX_SLOTS) return;
    const newSlots = [...slots, ''];
    setSlots(newSlots);
    setEditingIdx(newSlots.length - 1);
    setEditValue('');
  }, [slots]);

  // ─── 드래그 앤 드롭 (stopPropagation으로 파일 드롭 오버레이 차단) ───
  const handleDragStart = useCallback((idx, e) => {
    e.stopPropagation();
    if (editingIdx >= 0) { e.preventDefault(); return; }
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  }, [editingIdx]);

  const handleDragOver = useCallback((idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx >= 0 && idx !== dragIdx) {
      setDragOverIdx(idx);
    }
  }, [dragIdx]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.stopPropagation();
    setDragOverIdx(-1);
  }, []);

  const handleDrop = useCallback((targetIdx, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIdx < 0 || dragIdx === targetIdx) {
      setDragIdx(-1);
      setDragOverIdx(-1);
      return;
    }
    const newSlots = [...slots];
    const [moved] = newSlots.splice(dragIdx, 1);
    newSlots.splice(targetIdx, 0, moved);
    setSlots(newSlots);
    saveMacros(newSlots);
    setDragIdx(-1);
    setDragOverIdx(-1);
  }, [dragIdx, slots, saveMacros]);

  const handleDragEnd = useCallback((e) => {
    e.stopPropagation();
    setDragIdx(-1);
    setDragOverIdx(-1);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`text-macro-popup${visible ? ' visible' : ''}`}
      ref={popupRef}
      style={popupPos ? { top: `${popupPos.top}px`, right: `${popupPos.right}px` } : undefined}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragLeave={(e) => { e.stopPropagation(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="text-macro-header">
        <span>{t('editor.toolbar.textMacro')}</span>
        <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>Ctrl+#</span>
      </div>
      <div className="text-macro-list">
        {slots.map((value, idx) => (
          editingIdx === idx ? (
            <div key={idx} className="text-macro-slot-edit">
              <span className="text-macro-slot-key">{idx + 1 === 10 ? 0 : idx + 1}</span>
              <input
                ref={editInputRef}
                value={editValue}
                onChange={handleEditChange}
                onKeyDown={handleEditKeyDown}
                onBlur={finishEdit}
                placeholder={t('editor.macro.inputPlaceholder')}
                maxLength={50}
              />
            </div>
          ) : (
            <div
              key={idx}
              className={`text-macro-slot${dragIdx === idx ? ' dragging' : ''}${dragOverIdx === idx ? ' drag-over' : ''}`}
              onClick={() => handleSlotClick(idx)}
              title={value ? `Ctrl+${idx + 1 === 10 ? 0 : idx + 1}: ${value}` : ''}
              draggable
              onDragStart={(e) => handleDragStart(idx, e)}
              onDragOver={(e) => handleDragOver(idx, e)}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(idx, e)}
              onDragEnd={handleDragEnd}
            >
              <span className="text-macro-slot-drag">⠿</span>
              <span className="text-macro-slot-key">{idx + 1 === 10 ? 0 : idx + 1}</span>
              <span className={`text-macro-slot-value${value ? '' : ' empty'}`}>
                {value || t('editor.macro.empty')}
              </span>
              <span className="text-macro-slot-actions">
                <button
                  className="text-macro-slot-btn"
                  onClick={(e) => startEdit(idx, e)}
                  title={t('editor.macro.edit')}
                >✎</button>
                <button
                  className="text-macro-slot-btn delete"
                  onClick={(e) => handleDelete(idx, e)}
                  title={t('editor.macro.delete')}
                >×</button>
              </span>
            </div>
          )
        ))}
      </div>
      {slots.length < MAX_SLOTS && (
        <button className="text-macro-add" onClick={handleAdd}>
          + {t('editor.macro.add')}
        </button>
      )}
    </div>,
    document.body
  );
}

export default TextMacro;
