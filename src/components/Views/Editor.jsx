import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../../CSS/Views/Editor.css';

const { ipcRenderer } = window.require('electron');

function Editor({ theme }) {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [fileName, setFileName] = useState('');
    const [isSaved, setIsSaved] = useState(true);
    const textareaRef = useRef(null);
    const backupTimeoutRef = useRef(null);

       // 파일명 변경 핸들러
    const handleFileNameChange = (e) => {
        const newFileName = e.target.value;
        setFileName(newFileName);
        setIsSaved(false);
        
        // 프로그램 제목 업데이트
        ipcRenderer.invoke('set-window-title', newFileName);
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

  // 저장 처리
  const handleSave = useCallback(async () => {
    try {
      await ipcRenderer.invoke('save-text-file', {
        content,
        fileName
      });
      setIsSaved(true);
    } catch (error) {
      console.error('저장 실패:', error);
    }
  }, [content, fileName]);

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
        className="editor-content"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setIsSaved(false);
        }}
        placeholder={t('editor.placeholder')}
      />
    </div>
  );
}

export default Editor;