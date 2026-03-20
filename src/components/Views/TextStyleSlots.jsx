import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../stores/useAppStore';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');
const _appBase = process.env.NODE_ENV === 'development'
  ? process.cwd()
  : path.join(process.resourcesPath, 'app.asar');
const { STYLE_NAMES } = window.require(
  path.join(_appBase, 'src', 'store', 'utils', 'ParaFileFormat')
);

const TRANSITION_MS = 200;
const SLOT_COUNT = 10;

function nextCustomName(allSlots) {
  let max = 0;
  for (const s of allSlots) {
    const m = s.match(/^custom(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1]));
  }
  return `custom${max + 1}`;
}

function TextStyleSlots({ isOpen, onClose, onSelect, anchorRef, activeStyleName }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null); // 액션 편집 중인 슬롯 (1-based)
  const [pickerPos, setPickerPos] = useState(null);     // 액션 피커 팝업 위치
  const popupRef = useRef(null);
  const pickerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [popupPos, setPopupPos] = useState(null);

  const psActionList = useAppStore(s => s.psActionList);
  const styleActions = useAppStore(s => s.styleActions);
  const slotOrder = useAppStore(s => s.slotOrder);
  const pluginServer = useAppStore(s => s.pluginServer);
  const pluginModeActive = useAppStore(s => s.pluginModeActive);

  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // 슬롯 순서 (저장된 순서 또는 기본값)
  const slots = useMemo(() => {
    if (Array.isArray(slotOrder) && slotOrder.length === SLOT_COUNT) return slotOrder;
    return [...STYLE_NAMES];
  }, [slotOrder]);

  // 슬롯 표시 이름
  const getSlotName = useCallback((name) => {
    const result = t(`editor.style.${name}`, '');
    if (result) return result;
    const m = name.match(/^custom(\d+)$/);
    if (m) return `${t('editor.style.customPrefix', '커스텀')}${m[1]}`;
    return name;
  }, [t]);

  // ─── 액션 유효성 검사: psActionList에 해당 set/action이 존재하는지 ───
  const invalidSlots = useMemo(() => {
    if (!psActionList || psActionList.length === 0) return {};
    const invalid = {};
    for (const [slotKey, assigned] of Object.entries(styleActions)) {
      if (!assigned) continue;
      const foundSet = psActionList.find(s => s.set === assigned.set);
      if (!foundSet || !foundSet.actions.includes(assigned.action)) {
        invalid[slotKey] = true;
      }
    }
    return invalid;
  }, [styleActions, psActionList]);

  const hasInvalidActions = Object.keys(invalidSlots).length > 0;

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
      setEditingSlot(null);
      setPickerPos(null);
      setDragIdx(null);
      setDragOverIdx(null);
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

  // ─── 외부 클릭 닫기 ───
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      // 피커 팝업이 열려 있으면 피커 내부 클릭은 무시
      if (pickerRef.current && pickerRef.current.contains(e.target)) return;
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

  // ─── 피커 팝업 외부 클릭으로 닫기 ───
  useEffect(() => {
    if (!editingSlot) return;
    const handlePickerOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target) &&
          popupRef.current && !popupRef.current.contains(e.target)) {
        setEditingSlot(null);
        setPickerPos(null);
      }
    };
    document.addEventListener('mousedown', handlePickerOutside);
    return () => document.removeEventListener('mousedown', handlePickerOutside);
  }, [editingSlot]);

  // ─── 액션 피커 뷰포트 경계 보정 ───
  useEffect(() => {
    if (!editingSlot || !pickerRef.current || !pickerPos) return;
    const MARGIN = 20;
    requestAnimationFrame(() => {
      const el = pickerRef.current;
      if (!el) return;
      const h = el.offsetHeight;
      const vh = window.innerHeight;
      const correctedTop = Math.max(MARGIN, Math.min(pickerPos.top, vh - h - MARGIN));
      if (correctedTop !== pickerPos.top) {
        setPickerPos(prev => ({ ...prev, top: correctedTop }));
      }
    });
  }, [editingSlot]);

  // ─── 슬롯 클릭 → 액션 피커 열기 (스타일 적용은 단축키로) ───
  const handleSlotClick = useCallback((e, idx) => {
    const slotNum = idx + 1;
    if (editingSlot === slotNum) {
      setEditingSlot(null);
      setPickerPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setPickerPos({
      top: rect.top,
      left: rect.left - 4,
    });
    setEditingSlot(slotNum);
  }, [editingSlot]);

  // ─── 액션 선택/해제 ───
  const handleActionSelect = useCallback((slotNum, setName, actionName) => {
    const styleName = slots[slotNum - 1];
    const newMapping = { ...styleActions };
    if (!setName || !actionName) {
      delete newMapping[styleName];
    } else {
      newMapping[styleName] = { set: setName, action: actionName };
    }
    useAppStore.getState().setStyleActions(newMapping);
    ipcRenderer.send('save-style-actions', newMapping);
    setEditingSlot(null);
    setPickerPos(null);
  }, [styleActions, slots]);

  // ─── 액션 새로고침 ───
  const handleRefreshActions = useCallback(() => {
    ipcRenderer.send('refresh-ps-action-list');
  }, []);

  // ─── 슬롯 삭제 (커스텀 슬롯으로 대체) ───
  const handleDeleteSlot = useCallback((slotNum) => {
    const idx = slotNum - 1;
    if (idx === 0) return;
    const styleName = slots[idx];
    const newMapping = { ...styleActions };
    delete newMapping[styleName];
    const newSlots = [...slots];
    newSlots.splice(idx, 1);
    newSlots.push(nextCustomName(slots));
    useAppStore.getState().setStyleActions(newMapping);
    useAppStore.getState().setSlotOrder(newSlots);
    ipcRenderer.send('save-style-actions', newMapping);
    ipcRenderer.send('save-slot-order', newSlots);
    setEditingSlot(null);
    setPickerPos(null);
  }, [slots, styleActions]);

  // ─── 드래그 순서 변경 (평문 제외) ───
  const handleDragStart = useCallback((e, idx) => {
    if (idx === 0) { e.preventDefault(); return; }
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    if (idx === 0) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIdx(null);
  }, []);

  const handleDrop = useCallback((e, dropIdx) => {
    e.preventDefault();
    if (dragIdx === null || dropIdx === 0 || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newSlots = [...slots];
    const [moved] = newSlots.splice(dragIdx, 1);
    newSlots.splice(dropIdx, 0, moved);
    useAppStore.getState().setSlotOrder(newSlots);
    ipcRenderer.send('save-slot-order', newSlots);
    setDragIdx(null);
    setDragOverIdx(null);
    setEditingSlot(null);
    setPickerPos(null);
  }, [dragIdx, slots]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  if (!mounted) return null;

  const hasActions = psActionList && psActionList.length > 0;
  const isDisabled = !pluginServer;

  return createPortal(
    <>
      <div
        className={`text-style-popup${visible ? ' visible' : ''}${isDisabled ? ' disabled' : ''}`}
        ref={popupRef}
        style={popupPos ? { top: `${popupPos.top}px`, right: `${popupPos.right}px` } : undefined}
      >
        <div className="text-style-header">
          <span>{t('editor.style.title')}</span>
          {pluginModeActive && (
            <button
              className="text-style-refresh-btn"
              onClick={handleRefreshActions}
              title={t('editor.style.refreshActions', '액션 새로고침')}
            >
              ↻
            </button>
          )}
        </div>
        {isDisabled && (
          <div className="text-style-disabled-msg">
            {t('editor.style.pluginDisabled', 'PS 플러그인이 비활성화되어 있습니다')}
          </div>
        )}
        {hasInvalidActions && (
          <div className="text-style-invalid-msg">
            {t('editor.style.actionInvalid')}
          </div>
        )}
        <div className="text-style-list">
          {slots.map((styleName, idx) => {
            const name = getSlotName(styleName);
            const assigned = styleActions[styleName];
            const isInvalid = assigned && invalidSlots[styleName];
            const isDragging = dragIdx === idx;
            const isDragOver = dragOverIdx === idx && dragIdx !== idx;

            return (
              <div
                key={styleName}
                draggable={idx !== 0}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`text-style-slot-wrapper${isDragOver ? ' drag-over' : ''}${isDragging ? ' dragging' : ''}`}
              >
                <div
                  className={`text-style-slot${assigned ? ' has-action' : ' no-action'}${isInvalid ? ' invalid' : ''}`}
                  onClick={(e) => handleSlotClick(e, idx)}
                  title={`${name} (Alt+${idx === 9 ? '0' : idx + 1})${assigned ? `\n${t('editor.style.action', '액션')}: ${assigned.set} / ${assigned.action}` : ''}${isInvalid ? `\n⚠ ${t('editor.style.actionInvalid')}` : ''}\n${t('editor.style.clickToAssign', '클릭: 액션 지정')}`}
                >
                  <span className="text-style-slot-key">{idx === 9 ? '0' : idx + 1}</span>
                  <div className="text-style-slot-info">
                    <span className="text-style-slot-value">{name}</span>
                    {assigned && (
                      <span className={`text-style-slot-action${isInvalid ? ' invalid' : ''}`}>
                        {assigned.set} / {assigned.action}
                      </span>
                    )}
                  </div>
                  <span className="text-style-slot-shortcut">Alt+{idx === 9 ? '0' : idx + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 액션 피커 팝업 (Portal) ─── */}
      {editingSlot && pickerPos && createPortal(
        <div
          className="text-style-action-picker-popup"
          ref={pickerRef}
          style={{
            position: 'fixed',
            top: `${pickerPos.top}px`,
            left: `${pickerPos.left}px`,
            transform: 'translateX(-100%)',
          }}
        >
          <div className="text-style-action-picker-header">
            {t('editor.style.selectAction')} — {getSlotName(slots[editingSlot - 1])}
          </div>
          <div className="text-style-action-picker-body">
            {/* 액션 해제 */}
            {styleActions[slots[editingSlot - 1]] && (
              <div
                className="text-style-action-item clear"
                onClick={() => handleActionSelect(editingSlot, null, null)}
              >
                {t('editor.style.clearAction', '액션 해제')}
              </div>
            )}
            {/* 슬롯 삭제 (평문 제외) */}
            {editingSlot > 1 && (
              <div
                className="text-style-action-item delete"
                onClick={() => handleDeleteSlot(editingSlot)}
              >
                {t('editor.style.deleteSlot', '슬롯 삭제')}
              </div>
            )}
            {/* 액션 목록 */}
            {!hasActions ? (
              <div className="text-style-action-empty">
                {t('editor.style.noActions', 'PS 액션 없음')}
              </div>
            ) : (
              psActionList.map((actionSet, si) => (
                <div key={si} className="text-style-action-set">
                  <div className="text-style-action-set-name">{actionSet.set}</div>
                  {actionSet.actions.map((actionName, ai) => {
                    const currentAssigned = styleActions[slots[editingSlot - 1]];
                    return (
                      <div
                        key={ai}
                        className={`text-style-action-item${currentAssigned?.set === actionSet.set && currentAssigned?.action === actionName ? ' selected' : ''}`}
                        onClick={() => handleActionSelect(editingSlot, actionSet.set, actionName)}
                      >
                        {actionName}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}

export default TextStyleSlots;
