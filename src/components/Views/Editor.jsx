import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../../CSS/Views/Editor.css';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');  // path 모듈 추가

function Editor({
  theme,
  currentFilePath,
  onSavedStateChange
}) {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [fileName, setFileName] = useState('');
    const [isSaved, setIsSaved] = useState(true);
    const textareaRef = useRef(null);
    const backupTimeoutRef = useRef(null);

    const updateWindowTitle = useCallback((name, saved = true) => {
      const title = `${name}${saved ? '' : '*'}`;
      ipcRenderer.invoke('set-window-title', title);
    }, []);

       // 파일명 변경 핸들러
       const handleFileNameChange = (e) => {
        const newFileName = e.target.value;
        setFileName(newFileName);
        setIsSaved(false);
        updateWindowTitle(newFileName, false);
      };

    // 파일명 입력 핸들러 
    const handleFileNameKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            textareaRef.current?.focus();
            // Enter 입력 시에도 제목 업데이트
            ipcRenderer.invoke('set-window-title', fileName);
        }
    };

  // 파일 로드
  useEffect(() => {
    const loadFile = async () => {
      if (currentFilePath) {
        try {
          const { logData } = await ipcRenderer.invoke('get-file-history');
          const fileLog = logData[currentFilePath];
          const content = await ipcRenderer.invoke('read-file', currentFilePath);
          
          // IPC로 문단 처리 요청
          const { paragraphs, paragraphsMetadata } = await ipcRenderer.invoke('process-paragraphs', content);
          const lastPosition = fileLog?.lastPosition;
  
          setContent(content);
          setFileName(path.basename(currentFilePath));
          updateWindowTitle(path.basename(currentFilePath), true);
          setIsSaved(true);
  
          if (lastPosition?.currentParagraph !== undefined) {
            const targetMeta = paragraphsMetadata[lastPosition.currentParagraph];
            // endPos로 커서 위치 설정
            const position = targetMeta?.endPos || 0;
  
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(position, position);
                // 스크롤 위치 조정
                const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight);
                const lines = content.substring(0, position).split('\n').length;
                textareaRef.current.scrollTop = lines * lineHeight;
              }
            });
          }
        } catch (error) {
          console.error('파일 로드 실패:', error);
        }
      }
    };
    loadFile();
  }, [currentFilePath, updateWindowTitle]);

    // 커서 위치 저장을 위한 핸들러 추가
    const handleSelectionChange = () => {
      if (textareaRef.current) {
        const cursorPosition = textareaRef.current.selectionStart;
        ipcRenderer.send('update-cursor-position', cursorPosition);
      }
    };

  const handleContentChange = (e) => {
    setContent(e.target.value);
    setIsSaved(false);
    updateWindowTitle(fileName, false);
  };

//   // 자동 백업 (임시 저장)
//   useEffect(() => {
//     if (!isSaved) {
//         backupTimeoutRef.current = setTimeout(async () => {
//             try {
//                 // 임시 파일에 자동 저장
//                 await ipcRenderer.invoke('backup-text-content', {
//                     content,
//                     fileName
//                 });
//                 console.log('임시 저장 완료');
//             } catch (error) {
//                 console.error('임시 저장 실패:', error);
//             }
//         }, 3000);
//     }

//     return () => {
//         if (backupTimeoutRef.current) {
//             clearTimeout(backupTimeoutRef.current);
//         }
//     };
// }, [content, fileName, isSaved]);

// // 컴포넌트 마운트 시 임시 저장 파일 복원
// useEffect(() => {
//     const restoreBackup = async () => {
//         try {
//             const backup = await ipcRenderer.invoke('restore-backup');
//             if (backup) {
//                 setContent(backup.content);
//                 setFileName(backup.fileName);
//                 setIsSaved(false);
//             }
//         } catch (error) {
//             console.error('백업 복원 실패:', error);
//         }
//     };
//     restoreBackup();
// }, []);

  // isSaved 상태가 변경될 때마다 전역 변수 업데이트
  useEffect(() => {
    // isSaved 상태가 변경될 때마다 부모에게 알림
    onSavedStateChange?.(isSaved);
    ipcRenderer.send('update-saved-state', isSaved);
  }, [isSaved, onSavedStateChange]);

  // 저장 처리
  const handleSave = useCallback(async () => {
    try {
      const result = await ipcRenderer.invoke('save-text-file', { // 저장 요청 전송
        content,
        fileName,
        currentFilePath,
        saveType: currentFilePath ? 'overwrite' : 'new'
      });

      if (result.success) {
        setIsSaved(true);
        updateWindowTitle(fileName, true);
        if (!currentFilePath && result.filePath) {
          ipcRenderer.send('update-current-file-path', result.filePath);
        }
      }
    } catch (error) {
      console.error('저장 실패:', error);
    }
  }, [content, fileName, currentFilePath, updateWindowTitle]);

  useEffect(() => {
    // 저장 상태 체크 이벤트 리스너
    const handleIsSavedCheck = () => {
      ipcRenderer.send('editor-is-saved-result', isSaved);
    };
  
    ipcRenderer.on('editor-is-saved-check', handleIsSavedCheck);
    return () => {
      ipcRenderer.removeListener('editor-is-saved-check', handleIsSavedCheck);
    };
  }, [isSaved]);

  // 단축키 처리
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            handleSave();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="text-editor" data-theme={theme.mode}>
      <div className="editor-header">
        <input
          type="text"
          value={fileName}
          onChange={handleFileNameChange}
          onKeyDown={handleFileNameKeyDown}
          className="file-name-input"
          placeholder={t('editor.fileName')}
        />
        <div className="editor-controls">
          <button 
            className={`save-button ${!isSaved ? 'unsaved' : ''}`}
            onClick={handleSave}
          >
            {t('editor.save')}
          </button>
        </div>
      </div>
      <textarea
      ref={textareaRef}
      className="editor-content"
      value={content}
      onChange={handleContentChange}
      onSelect={handleSelectionChange}
      placeholder={t('editor.placeholder')}
      spellCheck="false"
    />
    </div>
  );
}

export default Editor;