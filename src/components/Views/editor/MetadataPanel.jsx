import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

function MetadataPanel({ metaPanelOpen, metaImage, onMetaImageChange, onClose }) {
  const { t } = useTranslation();
  const [editingIdx, setEditingIdx] = useState(-1);
  const [isAdding, setIsAdding] = useState(false);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef(null);
  const addRef = useRef(null);

  const items = metaImage
    ? metaImage.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    if (editingIdx >= 0 && editRef.current) editRef.current.focus();
  }, [editingIdx]);

  useEffect(() => {
    if (isAdding && addRef.current) addRef.current.focus();
  }, [isAdding]);

  const commitList = useCallback((newItems) => {
    const joined = newItems.filter(Boolean).join(', ');
    onMetaImageChange?.(joined);
  }, [onMetaImageChange]);

  const handleStartEdit = (idx) => {
    setIsAdding(false);
    setEditingIdx(idx);
    setEditValue(items[idx]);
  };

  const handleConfirmEdit = () => {
    if (editingIdx < 0) return;
    const trimmed = editValue.trim();
    const next = [...items];
    if (trimmed) {
      next[editingIdx] = trimmed;
    } else {
      next.splice(editingIdx, 1);
    }
    commitList(next);
    setEditingIdx(-1);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingIdx(-1);
    setEditValue('');
  };

  const handleConfirmAdd = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      commitList([...items, trimmed]);
    }
    setIsAdding(false);
    setEditValue('');
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setEditValue('');
  };

  const handleDelete = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    commitList(next);
    if (editingIdx === idx) { setEditingIdx(-1); setEditValue(''); }
  };

  const handleAdd = () => {
    setEditingIdx(-1);
    setIsAdding(true);
    setEditValue('');
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleConfirmEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCancelEdit(); }
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleConfirmAdd(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCancelAdd(); }
  };

  return (
    <div className={`meta-panel${metaPanelOpen ? ' visible' : ''}`}>
      <div className="meta-panel-header">
        <span className="meta-panel-title">{t('editor.metadata.title')}</span>
        <button className="meta-panel-close-btn" onClick={onClose} title={t('editor.metadata.close')}>✕</button>
      </div>
      <div className="meta-panel-body">
        <div className="meta-panel-field">
          <span className="meta-panel-label">{t('editor.metadata.image')}</span>
          {items.length > 0 ? (
            <ul className="meta-panel-tree">
              {items.map((name, i) => (
                <li key={i} className="meta-panel-tree-item" title={name}>
                  {editingIdx === i ? (
                    <input
                      ref={editRef}
                      className="meta-panel-inline-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={handleConfirmEdit}
                      onKeyDown={handleEditKeyDown}
                    />
                  ) : (
                    <>
                      <span className="meta-panel-tree-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </span>
                      <span className="meta-panel-tree-name">{name}</span>
                      <span className="meta-panel-tree-actions">
                        <button
                          className="meta-panel-action-btn"
                          title={t('editor.metadata.edit')}
                          onClick={() => handleStartEdit(i)}
                        >✎</button>
                        <button
                          className="meta-panel-action-btn meta-panel-action-delete"
                          title={t('editor.metadata.delete')}
                          onClick={() => handleDelete(i)}
                        >✕</button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="meta-panel-empty">{t('editor.metadata.noImage')}</span>
          )}
          {isAdding && (
            <input
              ref={addRef}
              className="meta-panel-inline-input"
              placeholder={t('editor.metadata.newImageName')}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleConfirmAdd}
              onKeyDown={handleAddKeyDown}
            />
          )}
          <button className="meta-panel-add-btn" onClick={handleAdd}>
            + {t('editor.metadata.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(MetadataPanel);
