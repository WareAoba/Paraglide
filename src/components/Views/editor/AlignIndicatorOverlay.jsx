import React, { memo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../../stores/useAppStore';

const ALIGN_BTNS = [
  { key: 'left', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '←' },
  { key: 'center', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="3.5" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="3.5" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '↑' },
  { key: 'right', icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="6" y="5.75" width="9" height="1.5" rx="0.75" fill="currentColor"/><rect x="1" y="9.5" width="14" height="1.5" rx="0.75" fill="currentColor"/><rect x="6" y="13.25" width="9" height="1.5" rx="0.75" fill="currentColor"/></svg>, shortcut: '→' },
];

const CIRCLED_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];

const AlignIndicatorOverlay = memo(function AlignIndicatorOverlay({
  alignOverlayRef,
  alignIndicators,
  alignExpandHover,
  alignExpandTimerRef,
  pluginServer,
  styleNames,
  theme,
  onAlignClick,
  onSetAlignExpandHover,
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="align-indicator-overlay" ref={alignOverlayRef}>
        {alignIndicators.map(({ paragraphIdx, top, align, style }) => {
          const activeBtn = ALIGN_BTNS.find(b => b.key === align) || ALIGN_BTNS[1];
          const editorSlotOrder = useAppStore.getState().slotOrder;
          const editorSlots = Array.isArray(editorSlotOrder) && editorSlotOrder.length === 10 ? editorSlotOrder : styleNames;
          const styleIdx = editorSlots.indexOf(style);
          const currentActions = useAppStore.getState().styleActions;
          const hasAction = style && currentActions[style];
          // 명시적 스타일이 없으면 비표시, 있으면 액션 여부로 활성/비활성
          const hasExplicitStyle = !!style;
          return (
            <div
              key={paragraphIdx}
              className={`para-indicator${!pluginServer ? ' disabled' : ''}`}
              style={{ top: `${top}px` }}
            >
              {/* 단락 번호 */}
              <span className="para-indicator-num">{paragraphIdx + 1}</span>
              {/* 정렬 아이콘 (기본: 활성만, 호버: 포탈로 전체 표시) */}
              <span
                className={`para-indicator-align${alignExpandHover?.paragraphIdx === paragraphIdx ? ' expand-open' : ''}`}
                title={`${t(`editor.align.${align}`)} (Alt+${activeBtn.shortcut})`}
                onMouseEnter={(e) => {
                  clearTimeout(alignExpandTimerRef.current);
                  const rect = e.currentTarget.getBoundingClientRect();
                  onSetAlignExpandHover({ paragraphIdx, rect, align });
                }}
                onMouseLeave={() => {
                  alignExpandTimerRef.current = setTimeout(() => onSetAlignExpandHover(null), 80);
                }}
              >
                <span className="para-indicator-align-active">{activeBtn.icon}</span>
              </span>
              {/* 스타일 번호: 명시적 스타일이 없으면 비표시, 액션 없으면 비활성 */}
              {hasExplicitStyle && (
                <span
                  className={`para-indicator-style${!hasAction ? ' inactive' : ''}`}
                  title={`${t(`editor.style.${style}`)} (Alt+${styleIdx === 9 ? '0' : styleIdx + 1})`}
                >
                  {CIRCLED_NUMS[styleIdx] || styleIdx + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* ── 정렬 확장 팝업 (포탈) ── overflow:hidden 탈출을 위해 body에 렌더링 */}
      {alignExpandHover && (() => {
        const { paragraphIdx, rect, align } = alignExpandHover;
        return createPortal(
          <div
            className="para-indicator-align-expand portal"
            data-theme={theme.mode}
            style={{
              position: 'fixed',
              left: `${rect.left + rect.width / 2}px`,
              top: `${rect.top + rect.height / 2}px`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseEnter={() => clearTimeout(alignExpandTimerRef.current)}
            onMouseLeave={() => onSetAlignExpandHover(null)}
          >
            {ALIGN_BTNS.map(({ key, icon, shortcut }) => (
              <span
                key={key}
                className={`para-indicator-align-btn${align === key ? ' active' : ''}`}
                title={`${t(`editor.align.${key}`)} (Alt+${shortcut})`}
                onMouseDown={(e) => { e.preventDefault(); onAlignClick(paragraphIdx, key); onSetAlignExpandHover(null); }}
              >
                {icon}
              </span>
            ))}
          </div>,
          document.body
        );
      })()}
    </>
  );
});

export default AlignIndicatorOverlay;
