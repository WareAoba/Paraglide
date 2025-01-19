import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import SunEditor from 'suneditor-react';
import 'suneditor/dist/css/suneditor.min.css';
import '../../CSS/Views/Editor.css';

const { ipcRenderer } = window.require('electron');
const path = window.require('path');  // path 모듈 추가

function TextEditor({
  theme,
  currentFilePath,
  onSavedStateChange
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const initialContentRef = useRef('');
  const isLoadingRef = useRef(true);
  const [lastPosition, setLastPosition] = useState(null);
  const editorRef = useRef(null);
  const [initialContent, setInitialContent] = useState(''); // 초기 내용 저장용
  const [rawContent, setRawContent] = useState(''); // 원본 텍스트
  const [displayContent, setDisplayContent] = useState(''); // HTML 변환본
  
  const [documentInfo, setDocumentInfo] = useState({ // 문서 분석 정보
    totalPages: 0,
    currentPage: 0,
    paragraphCount: 0
  });

  const PAGE_NUMBER_PATTERN = /^\s*(\d+)\s*$/;
  const STYLED_DIV_PATTERN = /<div[^>]*>(.*?)<\/div>/g;

  const handleEditorLoad = (sunEditor) => {
    if (!sunEditor?.core) {
      console.log('[디버그] 에디터 코어 없음');
      return;
    }
      
    // ref로 직접 할당
    editorRef.current = sunEditor;
    isLoadingRef.current = false;
    setIsInitialLoad(false);
    
    console.log('[디버그] 에디터 초기화 완료');
  };

  const analyzeDocument = useCallback(() => {
    if (!content || !editorRef.current?.core) return;
    
    ipcRenderer.invoke('process-paragraphs', content).then(response => {
      if (!response?.paragraphsMetadata) return;
      
      try {
        const selection = editorRef.current.core.getSelection();
        const cursorPosition = selection?.focusOffset ?? 0;
      
        // getCursorPageNumber 사용하여 현재 페이지 계산
        const currentPage = getCursorPageNumber(cursorPosition, response.paragraphsMetadata);
        
        const docInfo = {
          totalPages: Math.max(
            ...response.paragraphsMetadata
              .filter(meta => meta?.pageInfo)
              .map(meta => meta.pageInfo.start)
          ) || 0,
          currentPage,
          paragraphCount: response.paragraphsToDisplay.length,
          fileName: path.basename(currentFilePath || ''),
          filePath: currentFilePath || ''
        };
    
        setDocumentInfo(docInfo);
        ipcRenderer.send('get-editor-info', {
          type: 'response',
          data: docInfo
        });
      } catch (error) {
        console.error('에디터 선택 영역 가져오기 실패:', error);
      }
    });
  }, [content, currentFilePath, editorRef]);

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
    
    // 현재 커서 위치가 포함된 메타데이터 찾기
    const currentMeta = metadata.find(meta => 
      meta?.startPos <= position && position <= meta?.endPos
    );
    
    // 해당 위치의 페이지 번호 반환
    return currentMeta?.pageInfo?.start || 0;
  };

  // 커서 위치 저장을 위한 핸들러 추가
  const handleSelectionChange = useCallback(() => {
    if (!editorRef.current?.core?.getSelection) return;
    
    try {
      const selection = editorRef.current.core.getSelection();
      const cursorPosition = selection?.focusOffset;
      
      if (lastPosition?.position === cursorPosition) return;
      
      analyzeDocument();
      setLastPosition({ position: cursorPosition });
    } catch (error) {
      console.error('선택 영역 변경 처리 실패:', error);
    }
  }, [content, lastPosition, analyzeDocument, editorRef]);

  const restoreScrollPosition = useCallback((content, position = 0, lines) => {
    if (!editorRef.current?.core) return;
  
    const tryRestore = () => {
      try {
        const editorCore = editorRef.current.core;
        if (!editorCore.context?.element) {
          setTimeout(tryRestore, 100);
          return;
        }
  
        // HTML 내용 설정
        const htmlContent = lines
          .map(line => line.isEmpty ? '<div><br></div>' : `<div>${line.text}</div>`)
          .join('');
  
        editorCore.setContents(htmlContent);
  
        setTimeout(() => {
          try {
            const wysiwyg = editorCore.context.element.wysiwyg;
            applyPageNumberStyles(editorCore);
            
            const selection = editorCore.getSelection();
            const range = document.createRange();
        
            const targetLine = lines.find(line => 
              line.htmlStart <= position && position <= line.htmlEnd
            );
            
            if (targetLine) {
              const divs = wysiwyg.getElementsByTagName('div');
              const targetDiv = divs[targetLine.lineNumber - 1];
              
              if (targetDiv?.firstChild) {
                // 노드 길이 체크 추가
                const nodeLength = targetDiv.firstChild.textContent.length;
                const offset = Math.min(position - targetLine.htmlStart, nodeLength);
                
                console.log('커서 설정:', {
                  노드길이: nodeLength,
                  계산된오프셋: offset,
                  원래목표위치: position - targetLine.htmlStart
                });
        
                range.setStart(targetDiv.firstChild, offset);
                range.setEnd(targetDiv.firstChild, offset);
        
                selection.removeAllRanges();
                selection.addRange(range);
                
                targetDiv.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center'
                });
              }
            }
        
            wysiwyg.focus();
          } catch (error) {
            console.error('커서 복원 실패:', error);
          }
        }, 100);
  
      } catch (error) {
        console.error('복원 실패:', error);
      }
    };
  
    setTimeout(tryRestore, 300);
  }, [editorRef]);

  // 파일명 변경 핸들러
  const handleFileNameChange = (e) => {
    const newFileName = e.target.value || 'Untitled';
    setFileName(newFileName);
    setIsSaved(false);
  };

  // 파일명 입력 핸들러 
  const handleFileNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editorRef.current?.core) {
        editorRef.current.core.focus();
      }
    }
  };

  const normalizeContent = (text) => {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\s+$/g, '')
      .trim();
  };

  // HTML -> 텍스트 변환
  const toRawContent = (html) => {
    return html
      // 빈 div 먼저 처리
      .replace(/<div><br\s*\/?><\/div>/gi, '\n')
      // div 내용 처리 - 줄바꿈 추가
      .replace(/<div>(.*?)<\/div>/gi, '$1\n')
      // 나머지 br 태그 처리
      .replace(/<br\s*\/?>/gi, '\n')
      // 남은 HTML 태그 제거
      .replace(/<[^>]*>/g, '')
      // HTML 엔티티 변환
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      // 연속된 줄바꿈 정규화
      .replace(/\n\s*\n/g, '\n\n')
      // 앞뒤 공백 제거
      .replace(/\n+$/, '\n')        // 마지막 줄바꿈 정규화
      .trimEnd();                   // trim() 대신 trimEnd() 사용
  };

  const applyPageNumberStyles = useCallback((editorCore) => {
    if (!editorCore?.context?.element?.wysiwyg) return;
    
    const divElements = editorCore.context.element.wysiwyg.getElementsByTagName('div');
    Array.from(divElements).forEach(div => {
      const text = div.textContent.trim();
      if (PAGE_NUMBER_PATTERN.test(text)) {
        if (!div.classList.contains('editor-page-number')) {
          div.classList.add('editor-page-number');
        }
      } else {
        div.classList.remove('editor-page-number');
      }
    });
  }, []);

  // 파일 로드
  useEffect(() => {
    const loadFile = async () => {
      if (!currentFilePath || !editorRef.current) {
        console.log('[디버그] 파일 로드 실패: 필수 값 누락', { currentFilePath, editorRef: !!editorRef.current });
        return;
      }
  
      try {
        isLoadingRef.current = true;
        setIsInitialLoad(true);
    
        // 1. 파일 로드
        const fileContent = await ipcRenderer.invoke('read-file', currentFilePath);

          // 파일 로드 직후 에디터 상태 업데이트
  ipcRenderer.send('update-editor-state', {
    saved: true,
    filePath: currentFilePath,
    isEditing: true  // 편집 모드 표시
  });
        
        // 2. 유효 행만 필터링하여 매핑
        const lines = fileContent.split('\n')
          .map((line, index, array) => {
            const prevLines = array.slice(0, index);
            const startPos = prevLines.join('\n').length + (index > 0 ? 1 : 0);
            
            return {
              lineNumber: index + 1,
              text: line,
              isEmpty: line.trim().length === 0,
              originalStart: startPos,
              originalEnd: startPos + line.length,
              htmlStart: startPos + (prevLines.filter(l => l.length > 0).length * 3),
              htmlEnd: startPos + line.length + (prevLines.filter(l => l.length > 0).length * 3)
            };
          });
    
        // 3. HTML 변환 및 스타일 적용
        const displayHTML = fileContent.split('\n')
          .map(line => line.trim().length === 0 ? '<div><br></div>' : `<div>${line}</div>`)
          .join('');
    
        // editorCore 가져오기
        const editorCore = editorRef.current.core;
        if (!editorCore) {
          throw new Error('에디터 코어가 초기화되지 않음');
        }
  
        // 내용 설정 후 스타일 적용
        editorCore.setContents(displayHTML);
        applyPageNumberStyles(editorCore);

console.log('파일 로드 시 내용 비교:', {
  원본: fileContent,
  HTML변환: displayHTML,
  다시텍스트로: toRawContent(displayHTML),
  일치여부: fileContent === toRawContent(displayHTML)
});
        
        // 4. 히스토리에서 위치 복원
        const { logData } = await ipcRenderer.invoke('get-file-history');
        const fileLog = logData[currentFilePath];
        
        let position = 0;
        if (fileLog?.lastPosition?.metadata) {
          const targetLine = lines.find(line => 
            line.originalStart <= fileLog.lastPosition.metadata.endPos &&
            fileLog.lastPosition.metadata.endPos <= line.originalEnd
          );
          
          if (targetLine) {
            position = targetLine.htmlEnd;
          }
        }

        // 5. 상태 업데이트
        await Promise.all([
          new Promise(resolve => {
            const newFileName = path.basename(currentFilePath);

            setFileName(newFileName);

            const normalizedFileContent = normalizeContent(fileContent);
            initialContentRef.current = normalizedFileContent;
            
            // 1. 초기 컨텐츠 설정
            setInitialContent(normalizedFileContent); 
            
            // 2. 상태 업데이트 전 시점 체크
            console.log('[디버그] 초기 설정:', {
              파일명: newFileName,
              초기내용: normalizedFileContent
            });
        
            // 3. 나머지 상태 업데이트
            setContent(displayHTML);
            setFileName(newFileName);
            setRawContent(normalizedFileContent);
            setIsSaved(true);
            setLastPosition({ position });
            onSavedStateChange(true);
        
            // 4. 로딩 상태 해제 
            isLoadingRef.current = false;
            setIsInitialLoad(false);
            
            resolve();
          })
        ]);
  
        await restoreScrollPosition(displayHTML, position, lines);
        isLoadingRef.current = false;
        setIsInitialLoad(false);
        console.log('[디버그] 파일 로드 완료:', { isInitialLoad: false });
  
      } catch (error) {
        console.error('파일 로드 실패:', error);
        isLoadingRef.current = false;
        setIsInitialLoad(false);
      }
    };

    loadFile();
  }, [currentFilePath, editorRef]);

  const handleContentChange = useCallback((value) => {
    if (isLoadingRef.current) return;
    const editorCore = editorRef.current?.core;
    if (!editorCore) return;
  
    // 현재 선택 영역 저장
    const selection = window.getSelection();
    const currentNode = selection.focusNode;
    const currentOffset = selection.focusOffset;
    const parentDiv = currentNode?.parentElement;
    const divIndex = parentDiv ? Array.from(editorCore.context.element.wysiwyg.children)
      .indexOf(parentDiv) : -1;
  
    // 변경 감지 로직 통합
    const newRawContent = toRawContent(value);
    const hasChanged = newRawContent !== initialContentRef.current;
    
    setContent(value);
    setRawContent(newRawContent);
    setIsSaved(!hasChanged);
    onSavedStateChange(!hasChanged);
  
    // 상태 업데이트
    ipcRenderer.send('update-editor-state', {
      saved: !hasChanged,
      filePath: currentFilePath,
      isEditing: true
    });

    try {
      applyPageNumberStyles(editorCore);
      
      // 커서 복원
      if (divIndex !== -1 && currentNode) {
        const targetDiv = editorCore.context.element.wysiwyg.children[divIndex];
        if (targetDiv?.firstChild) {
          const range = document.createRange();
          range.setStart(targetDiv.firstChild, currentOffset);
          range.setEnd(targetDiv.firstChild, currentOffset);
          selection.removeAllRanges();
          selection.addRange(range);
          targetDiv.firstChild.parentElement.focus();
        }
      }
    } catch (error) {
      console.error('스타일 업데이트 실패:', error);
    }

}, [currentFilePath, toRawContent]);

  // 저장 처리
  const handleSave = useCallback(async () => {
    try {
      // 현재 에디터의 내용을 직접 가져옴
      const currentContent = editorRef.current?.core?.getContents() || '';
      const currentRawContent = toRawContent(currentContent);
  
      console.log('저장 시도:', { currentRawContent }); 
  
      const result = await ipcRenderer.invoke('save-text-file', {
        content: currentRawContent,  // rawContent 대신 현재 내용 사용
        fileName,
        currentFilePath,
        saveType: currentFilePath ? 'overwrite' : 'new'
      });
  
      // 3. 결과 처리
      if (result.success) {
        setIsSaved(true);
        onSavedStateChange(true);
        initialContentRef.current = currentRawContent;
        // 새 파일 경로 업데이트
        if (!currentFilePath && result.filePath) {
          ipcRenderer.send('update-current-file-path', result.filePath);
        }
        // 상태 업데이트
        ipcRenderer.send('update-editor-state', {
          saved: true,
          filePath: result.filePath || currentFilePath
        });
      }
    } catch (error) {
      console.error('저장 실패:', error);
    }
  }, [fileName, currentFilePath, toRawContent]);

  useEffect(() => {
    const handleIsSavedCheck = () => {
      try {
        // 현재 컨텐츠
        const currentHTML = editorRef.current?.core?.getContents() || '';
        const currentRaw = toRawContent(currentHTML);
        
        // 초기 컨텐츠와 동일한 방식으로 처리
        const isContentSaved = currentRaw === initialContentRef.current;
        
        console.log('[디버그] 저장 상태 체크:', {
          현재내용: currentRaw,
          초기내용: initialContentRef.current,
          저장여부: isContentSaved
        });
  
        ipcRenderer.send('editor-is-saved-result', isContentSaved);
      } catch (error) {
        console.error('저장 상태 체크 실패:', error);
        ipcRenderer.send('editor-is-saved-result', true);
      }
    };
  
    ipcRenderer.on('editor-is-saved-check', handleIsSavedCheck);
    return () => {
      ipcRenderer.removeListener('editor-is-saved-check', handleIsSavedCheck);
    };
  }, [toRawContent]);

  // 단축키 처리
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        // 이벤트 전파 중지 추가
        e.stopPropagation();
        e.preventDefault();
        
        // 약간의 지연 후 저장 실행
        setTimeout(() => {
          handleSave();
        }, 0);
      }
    };
  
    // 캡처 단계에서 이벤트 처리
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
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
  type="button"  // type 추가
  className={`save-button ${!isSaved ? 'unsaved' : ''}`}
  onClick={(e) => {  // 이벤트 핸들러 수정
    e.preventDefault();
    handleSave();
  }}
>
  {t('editor.save')}
</button>
        </div>
      </div>
      <div className="suneditor-container">
      <SunEditor
  setContents={content}
  onChange={handleContentChange}
  onSelect={handleSelectionChange}
  hideToolbar={true}
  getSunEditorInstance={handleEditorLoad}
  setOptions={{
    shortcuts: { // 단축키 설정 추가
      save: false // Ctrl+S 기본 동작 비활성화
    },
    defaultStyle: 'font-family: inherit;',
    mode: 'classic',
    resizingBar: false,
    charCounter: false,
    buttonList: [],
    width: '100%',
    height: '100%',
    styleWithCSS: true
  }}
/>
      </div>
    </div>
  );
}

export default TextEditor;