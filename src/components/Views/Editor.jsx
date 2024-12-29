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
    const [lastPosition, setLastPosition] = useState(null);
    const backupTimeoutRef = useRef(null);
    
    const [documentInfo, setDocumentInfo] = useState({ // 문서 분석 정보
      totalPages: 0,
      currentPage: 0,
      paragraphCount: 0
    });


    const analyzeDocument = useCallback(() => {
      if (!content) return;
      
      ipcRenderer.invoke('process-paragraphs', content).then(response => {
        if (!response?.paragraphsMetadata) return;
        
        const cursorPosition = textareaRef.current?.selectionStart ?? 0;
        const currentMeta = response.paragraphsMetadata.find(meta => 
          meta?.startPos <= cursorPosition && cursorPosition <= meta?.endPos
        );
        
        const docInfo = {
          totalPages: Math.max(
            ...response.paragraphsMetadata
              .filter(meta => meta?.pageInfo)
              .map(meta => meta.pageInfo.start)
          ) || 0,
          currentPage: currentMeta?.pageInfo?.start || 0,
          paragraphCount: response.paragraphsToDisplay.length,
          fileName: path.basename(currentFilePath || ''),
          filePath: currentFilePath || ''
        };
  
        setDocumentInfo(docInfo);
        ipcRenderer.send('get-editor-info', {
          type: 'response',
          data: docInfo
        });
      });
    }, [content, currentFilePath]);
  
      // 내용 변경시 분석 실행
      useEffect(() => {
        const debounceTimer = setTimeout(analyzeDocument, 300);
        return () => clearTimeout(debounceTimer);
      }, [content, analyzeDocument]);
  
      useEffect(() => {
        const handleEditorInfoRequest = (_, { type }) => {
          if (type === 'request') {
            ipcRenderer.send('get-editor-info', {
              type: 'response',
              data: documentInfo
            });
          }
        };
      
        ipcRenderer.on('get-editor-info', handleEditorInfoRequest);
        return () => {
          ipcRenderer.removeListener('get-editor-info', handleEditorInfoRequest);
        };
      }, [documentInfo]);

        // 커서 위치의 페이지 번호 계산
        const getCursorPageNumber = (position, metadata) => {
          if (!position || !metadata) return 0;
          const currentMeta = metadata.find(meta => 
            meta?.startPos <= position && position <= meta?.endPos
          );
          return currentMeta?.pageInfo?.start || 0;
        };

 // 커서 위치 저장을 위한 핸들러 추가
 const handleSelectionChange = useCallback(() => {
  if (!textareaRef.current || !content) return;
  const cursorPosition = textareaRef.current.selectionStart;
  if (lastPosition?.position === cursorPosition) return;
  analyzeDocument();
  setLastPosition({ position: cursorPosition });
}, [content, lastPosition, analyzeDocument]);

  // 파일 로드 시 스크롤 위치 복원
  const restoreScrollPosition = useCallback((content, position) => {
    if (!textareaRef.current) return;
  
    requestAnimationFrame(() => {
      // 1. 포커스 설정
      textareaRef.current.focus();
      
      // 2. 커서 위치 설정
      textareaRef.current.setSelectionRange(position, position);
      
      // 3. 스크롤 위치 계산 및 설정
      const lines = content.substring(0, position).split('\n');
      const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight);
      const targetLine = lines.length;
      const scrollTop = (targetLine - 1) * lineHeight;
      
      textareaRef.current.scrollTop = scrollTop;
    });
  }, []);

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
      if (!currentFilePath) return;

      try {
        const content = await ipcRenderer.invoke('read-file', currentFilePath);
        
        // 기본 상태 업데이트
        setContent(content);
        setFileName(path.basename(currentFilePath));
        updateWindowTitle(path.basename(currentFilePath), true);
        setIsSaved(true);

        const response = await ipcRenderer.invoke('process-paragraphs', content);
        
        // 위치 복원 및 문서 정보 설정
        const { logData } = await ipcRenderer.invoke('get-file-history');
        const fileLog = logData[currentFilePath];
        
        let position = 0;
        if (fileLog?.lastPosition?.metadata) {
          const matchingMeta = response.paragraphsMetadata.find(meta =>
            meta?.startPos === fileLog.lastPosition.metadata.startPos &&
            meta?.endPos === fileLog.lastPosition.metadata.endPos
          );
          if (matchingMeta) {
            position = matchingMeta.endPos;
          }
        }

        // 위치 및 스크롤 복원 (한 번만 실행)
        if (textareaRef.current) {
          requestAnimationFrame(() => {
            restoreScrollPosition(content, position);
            // 초기 selection 이벤트 발생
            const event = new Event('select', { bubbles: true });
            textareaRef.current.dispatchEvent(event);
          });
        }

        // 초기 문서 정보 설정
        const docInfo = {
          totalPages: Math.max(...response.paragraphsMetadata
            .filter(meta => meta?.pageInfo)
            .map(meta => meta.pageInfo.start)) || 0,
          currentPage: getCursorPageNumber(position, response.paragraphsMetadata),
          paragraphCount: response.paragraphsToDisplay.length,
          fileName: path.basename(currentFilePath),
          filePath: currentFilePath
        };

        setDocumentInfo(docInfo);
        setLastPosition({ position, metadata: response.paragraphsMetadata[0] });

      } catch (error) {
        console.error('파일 로드 실패:', error);
      }
    };

    loadFile();
  }, [currentFilePath, restoreScrollPosition, updateWindowTitle]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('mouseup', handleSelectionChange);
      textarea.addEventListener('keyup', handleSelectionChange);
      textarea.addEventListener('scroll', () => {
        // 스크롤 위치 저장
        textarea.dataset.scrollTop = textarea.scrollTop;
      });

      return () => {
        textarea.removeEventListener('mouseup', handleSelectionChange);
        textarea.removeEventListener('keyup', handleSelectionChange);
        textarea.removeEventListener('scroll', () => {});
      };
    }
  }, [handleSelectionChange]);

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