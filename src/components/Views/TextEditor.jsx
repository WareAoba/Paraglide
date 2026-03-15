import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TextMacro from './TextMacro';
import '../../CSS/Views/Editor.css';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');
const { TextProcessUtils } = window.require(
  path.join(process.cwd(), 'src', 'store', 'utils', 'TextProcessUtils')
);

const FONT_SCALE_OPTIONS = [10, 15, 20, 25, 35, 50, 65, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function TextEditor({ theme, currentFilePath, onSavedStateChange, icons }) {
  const { t } = useTranslation();
  const editorRef = useRef(null);

  const isLoadingRef = useRef(false);
  const initialContentRef = useRef('');
  const isSavedRef = useRef(true);
  const rafRef = useRef(null);
  const [fontScale, setFontScale] = useState(100);
  const [macroOpen, setMacroOpen] = useState(false);
  const macroButtonRef = useRef(null);
  const macroSlotsRef = useRef(['…', '―', '♡', '♥']);

  // ─── 에디터 DOM에서 plain text 추출 ───
  const getPlainText = useCallback(() => {
    const el = editorRef.current;
    if (!el || el.childNodes.length === 0) return '';

    const lines = [];
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        lines.push(child.textContent);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          lines.push('');
        } else {
          const isBrOnly = child.childNodes.length === 1 && child.firstChild.nodeName === 'BR';
          lines.push(isBrOnly ? '' : child.textContent);
        }
      }
    }
    return lines.join('\n').replace(/\u00A0/g, ' ');
  }, []);

  // ─── plain text → 에디터 DOM ───
  const setEditorContent = useCallback((text) => {
    const el = editorRef.current;
    if (!el) return;
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = text.split('\n')
      .map(line => line ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>')
      .join('');
  }, []);

  // ─── bare text 노드 → div 래핑 (초기 입력 시 발생하는 문제 수정) ───
  const normalizeNodes = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const sel = window.getSelection();
    const focusNode = sel.rangeCount > 0 ? sel.focusNode : null;
    const focusOffset = sel.rangeCount > 0 ? sel.focusOffset : 0;

    for (const child of [...el.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent) {
        const div = document.createElement('div');
        div.textContent = child.textContent;
        el.replaceChild(div, child);
        if (focusNode === child) {
          try {
            const range = document.createRange();
            range.setStart(div.firstChild, Math.min(focusOffset, div.firstChild.length));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (_) {}
        }
      }
    }
  }, []);

  // ─── 시각적 데코레이션 (CSS 클래스만, 콘텐츠 변경 없음) ───
  const applyDecorations = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    normalizeNodes();

    const divs = el.children;
    let paragraphIdx = 0;
    let inParagraph = false;

    for (let i = 0; i < divs.length; i++) {
      const div = divs[i];
      const text = div.textContent;
      const trimmed = text.trim();
      const isEmpty = !trimmed;
      const isComment = !isEmpty && TextProcessUtils.isCommentLine(text);
      const isPage = !isEmpty && !isComment && !!TextProcessUtils.extractPageNumber(trimmed);

      div.classList.toggle('line-page-number', isPage);
      div.classList.toggle('line-empty', isEmpty);
      div.classList.toggle('line-comment', isComment);

      if (isPage || isEmpty) {
        div.classList.remove('line-paragraph-first');
        div.removeAttribute('data-paragraph');
        div.removeAttribute('data-paragraph-number');
        if (inParagraph) { paragraphIdx++; inParagraph = false; }
      } else {
        const isFirst = !inParagraph;
        div.classList.toggle('line-paragraph-first', isFirst);
        div.setAttribute('data-paragraph', paragraphIdx);
        if (isFirst) {
          div.setAttribute('data-paragraph-number', paragraphIdx + 1);
        } else {
          div.removeAttribute('data-paragraph-number');
        }
        inParagraph = true;
      }
    }

    el.classList.toggle('is-empty', !el.textContent.trim());
  }, [normalizeNodes]);

  const scheduleDecorations = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(applyDecorations);
  }, [applyDecorations]);

  // ─── 입력 핸들러 ───
  const handleInput = useCallback(() => {
    if (isLoadingRef.current) return;

    const currentText = getPlainText();
    const changed = currentText !== initialContentRef.current;

    if (isSavedRef.current === changed) {
      isSavedRef.current = !changed;
      onSavedStateChange(!changed);
      ipcRenderer.send('update-editor-state', {
        saved: !changed,
        filePath: currentFilePath,
        isEditing: true
      });
    }

    scheduleDecorations();
  }, [currentFilePath, getPlainText, onSavedStateChange, scheduleDecorations]);

  // ─── 붙여넣기: plain text만 허용 ───
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // ─── 저장 ───
  const handleSave = useCallback(async () => {
    try {
      const content = getPlainText();
      const fileName = currentFilePath ? path.basename(currentFilePath) : 'Untitled.txt';

      const result = await ipcRenderer.invoke('save-text-file', {
        content,
        fileName,
        currentFilePath,
        saveType: currentFilePath ? 'overwrite' : 'new'
      });

      if (result.success) {
        isSavedRef.current = true;
        initialContentRef.current = content;
        onSavedStateChange(true);
        if (!currentFilePath && result.filePath) {
          ipcRenderer.send('update-current-file-path', result.filePath);
        }
        ipcRenderer.send('update-editor-state', {
          saved: true,
          filePath: result.filePath || currentFilePath
        });
      }
    } catch (error) {
      console.error('저장 실패:', error);
    } finally {
      editorRef.current?.focus();
    }
  }, [currentFilePath, getPlainText, onSavedStateChange]);

  const handleFontScaleChange = useCallback((event) => {
    setFontScale(Number(event.target.value));
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const handleZoomIn = useCallback(() => {
    setFontScale(prev => {
      const idx = FONT_SCALE_OPTIONS.indexOf(prev);
      return idx < FONT_SCALE_OPTIONS.length - 1 ? FONT_SCALE_OPTIONS[idx + 1] : prev;
    });
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const handleZoomOut = useCallback(() => {
    setFontScale(prev => {
      const idx = FONT_SCALE_OPTIONS.indexOf(prev);
      return idx > 0 ? FONT_SCALE_OPTIONS[idx - 1] : prev;
    });
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  // ─── 매크로 슬롯 로드 ───
  useEffect(() => {
    const loadMacros = async () => {
      try {
        const saved = await ipcRenderer.invoke('load-text-macros');
        if (Array.isArray(saved) && saved.length > 0) {
          macroSlotsRef.current = saved.slice(0, 10);
        }
      } catch (_) { /* 기본값 사용 */ }
    };
    loadMacros();

    const handleMacroUpdate = (_, macros) => {
      if (Array.isArray(macros)) macroSlotsRef.current = macros;
    };
    ipcRenderer.on('text-macros-updated', handleMacroUpdate);
    return () => ipcRenderer.removeListener('text-macros-updated', handleMacroUpdate);
  }, []);

  // ─── 매크로 텍스트 삽입 ───
  const handleMacroInsert = useCallback((text) => {
    const el = editorRef.current;
    if (!el || !text) return;
    el.focus();
    document.execCommand('insertText', false, text);
  }, []);

  // ─── Ctrl+S 및 Ctrl+숫자 단축키 ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.stopPropagation();
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl+숫자(1~9, 0) → 매크로 삽입
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const key = e.key;
        let slotIdx = -1;
        if (key >= '1' && key <= '9') {
          slotIdx = parseInt(key, 10) - 1;
        } else if (key === '0') {
          slotIdx = 9;
        }
        if (slotIdx >= 0 && slotIdx < macroSlotsRef.current.length) {
          const value = macroSlotsRef.current[slotIdx];
          if (value) {
            e.stopPropagation();
            e.preventDefault();
            handleMacroInsert(value);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleSave, handleMacroInsert]);

  // ─── Enter 시 <div> 생성 보장 ───
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'div');
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ─── 파일 로드 ───
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    if (!currentFilePath) {
      el.innerHTML = '';
      el.classList.add('is-empty');
      initialContentRef.current = '';
      isSavedRef.current = true;
      onSavedStateChange(true);
      setTimeout(() => el.focus(), 50);
      return;
    }

    const loadFile = async () => {
      try {
        isLoadingRef.current = true;

        const fileContent = await ipcRenderer.invoke('read-file', currentFilePath);
        const normalized = fileContent.replace(/\r\n/g, '\n');

        initialContentRef.current = normalized;
        setEditorContent(normalized);
        applyDecorations();

        isSavedRef.current = true;
        onSavedStateChange(true);
        ipcRenderer.send('update-editor-state', {
          saved: true,
          filePath: currentFilePath,
          isEditing: true
        });

        // 히스토리에서 스크롤 위치 복원
        try {
          const { logData } = await ipcRenderer.invoke('get-file-history');
          const fileLog = logData?.[currentFilePath];
          if (fileLog?.lastPosition?.metadata) {
            const targetPos = fileLog.lastPosition.metadata.endPos;
            const lines = normalized.split('\n');
            let pos = 0;
            let targetIdx = 0;
            for (let i = 0; i < lines.length; i++) {
              if (pos + lines[i].length >= targetPos) {
                targetIdx = i;
                break;
              }
              pos += lines[i].length + 1;
            }
            if (el.children[targetIdx]) {
              setTimeout(() => {
                el.children[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 200);
            }
          }
        } catch (_) { /* 히스토리 없음 */ }

        isLoadingRef.current = false;
        setTimeout(() => el.focus(), 150);
      } catch (error) {
        console.error('파일 로드 실패:', error);
        isLoadingRef.current = false;
      }
    };

    loadFile();
  }, [currentFilePath, setEditorContent, applyDecorations, onSavedStateChange]);

  // ─── IPC: 에디터 정보 응답 ───
  useEffect(() => {
    const handleRequest = (_, { type }) => {
      if (type !== 'request') return;

      const text = getPlainText();
      const lines = text.split('\n');
      const pageNumbers = lines
        .map(l => TextProcessUtils.extractPageNumber(l.trim()))
        .filter(Boolean)
        .map(p => p.start);

      ipcRenderer.send('get-editor-info', {
        type: 'response',
        data: {
          fileName: currentFilePath ? path.basename(currentFilePath) : '',
          filePath: currentFilePath || '',
          currentPage: 0,
          totalPages: pageNumbers.length > 0 ? Math.max(...pageNumbers) : 0,
          paragraphCount: lines.filter(l => l.trim()).length,
          isValid: pageNumbers.length > 0,
        }
      });
    };

    ipcRenderer.on('get-editor-info', handleRequest);
    return () => ipcRenderer.removeListener('get-editor-info', handleRequest);
  }, [currentFilePath, getPlainText]);

  // ─── IPC: 저장 상태 체크 ───
  useEffect(() => {
    const handle = () => {
      ipcRenderer.send('editor-is-saved-result', getPlainText() === initialContentRef.current);
    };
    ipcRenderer.on('editor-is-saved-check', handle);
    return () => ipcRenderer.removeListener('editor-is-saved-check', handle);
  }, [getPlainText]);

  // ─── 렌더링 ───
  return (
    <div className="text-editor" data-theme={theme.mode}>
      <div
        ref={editorRef}
        className="editor-body is-empty"
        style={{ '--editor-font-scale': fontScale }}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        spellCheck={false}
        data-placeholder={t('editor.placeholder')}
      />
      <div className="editor-toolbar">
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={handleZoomOut}
          title={t('editor.toolbar.fontSize')}
          disabled={fontScale <= FONT_SCALE_OPTIONS[0]}
        >
          <img src={icons?.zoomOut} alt="Zoom Out" className="icon" />
        </button>
        <span className="editor-toolbar-scale">{fontScale}%</span>
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={handleZoomIn}
          title={t('editor.toolbar.fontSize')}
          disabled={fontScale >= FONT_SCALE_OPTIONS[FONT_SCALE_OPTIONS.length - 1]}
        >
          <img src={icons?.zoomIn} alt="Zoom In" className="icon" />
        </button>
        <div className="editor-toolbar-divider" />
        <button
          type="button"
          className="editor-toolbar-icon"
          onClick={handleSave}
          title={t('editor.toolbar.save')}
        >
          <img src={icons?.save} alt="Save" className="icon" />
        </button>
        <div className="editor-toolbar-divider" />
        <button
          ref={macroButtonRef}
          type="button"
          className="editor-toolbar-icon"
          onClick={() => setMacroOpen(prev => !prev)}
          title={t('editor.toolbar.textMacro')}
        >
          <img src={icons?.textAdd} alt="Text Macro" className="icon" />
        </button>
      </div>
      <TextMacro
        isOpen={macroOpen}
        onClose={() => setMacroOpen(false)}
        onInsert={(text) => { setMacroOpen(false); handleMacroInsert(text); }}
        anchorRef={macroButtonRef}
      />
    </div>
  );
}

export default TextEditor;