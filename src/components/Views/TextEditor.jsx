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

        // 1. HTML 내용 생성
        const htmlContent = lines
          .map(line => line.isEmpty ? '<div><br></div>' : `<div>${line.text}</div>`)
          .join('');

        console.log('1. 내용 설정:', {
          HTML길이: htmlContent.length,
          목표위치: position
        });

        // 2. 내용 설정 먼저 실행
        editorCore.setContents(htmlContent);

        // 3. 위치 복원은 약간의 지연 후 실행
        setTimeout(() => {
          try {
            const wysiwyg = editorCore.context.element.wysiwyg;
            const selection = editorCore.getSelection();
            const range = document.createRange();
        
            // 목표 행과 노드 찾기
            const targetLine = lines.find(line => 
              line.htmlStart <= position && position <= line.htmlEnd
            );
            
            if (targetLine) {
              const divs = wysiwyg.getElementsByTagName('div');
              const targetDiv = divs[targetLine.lineNumber - 1];
              
              if (targetDiv?.firstChild) {
                const offset = position - targetLine.htmlStart;
                
                console.log('2. 커서 설정 시도:', {
                  현재위치: selection?.focusOffset,
                  목표위치: position,
                  노드내용: targetDiv.firstChild.textContent,
                  상대위치: offset
                });
        
                // range 설정
                range.setStart(targetDiv.firstChild, offset);
                range.setEnd(targetDiv.firstChild, offset);
        
                // selection 적용
                selection.removeAllRanges();
                selection.addRange(range);
                
                console.log('3. 커서 설정 후:', {
                  설정위치: editorCore.getSelection()?.focusOffset,
                  목표위치: position
                });
        
                // 스크롤 이동
                targetDiv.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center'
                });
                setIsInitialLoad(false);
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

  const updateWindowTitle = useCallback((name, saved = true) => {
    const title = name + (saved ? '' : ' *');
    ipcRenderer.invoke('set-window-title', title);
  }, []);

  // 파일명 변경 핸들러
  const handleFileNameChange = (e) => {
    const newFileName = e.target.value;
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
      ipcRenderer.invoke('set-window-title', fileName);
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

  // 파일 로드
  useEffect(() => {
    const loadFile = async () => {
      if (!currentFilePath || !editorRef.current?.core) return;

      try {
        isLoadingRef.current = true;
        setIsInitialLoad(true);
        // 1. 파일 로드
        const fileContent = await ipcRenderer.invoke('read-file', currentFilePath);
        
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
    
        // 3. HTML 변환
        const displayLines = fileContent.split('\n').map(line => 
          line.trim().length === 0 ? '<div><br></div>' : `<div>${line}</div>`
        );
        const displayHTML = displayLines.join('');

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
            updateWindowTitle(newFileName, true);
        
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
    if (isLoadingRef.current) {
      console.log('[디버그] 로딩 중 변경 무시');
      return;
    }
  
    const newRawContent = toRawContent(value);
    const currentNormalized = normalizeContent(newRawContent);
    const initialNormalized = normalizeContent(initialContentRef.current);
    
    const hasChanged = currentNormalized !== initialNormalized;
    
    console.log('[디버그] 내용 변경:', {
      현재: currentNormalized.slice(0, 20),
      초기: initialNormalized.slice(0, 20),
      변경됨: hasChanged
    });
    
    setContent(value);
    setRawContent(newRawContent);
    setIsSaved(!hasChanged);
    
    if (hasChanged) {
      updateWindowTitle(fileName, false);
    }
  }, [fileName, toRawContent]);

  // isSaved 상태가 변경될 때마다 전역 변수 업데이트
  useEffect(() => {
    // isSaved 상태가 변경될 때마다 부모에게 알림
    onSavedStateChange?.(isSaved);
    ipcRenderer.send('update-saved-state', isSaved);
  }, [isSaved, onSavedStateChange]);

  // 저장 처리
  const handleSave = useCallback(async () => {
    try {
      // HTML을 순수 텍스트로 변환
      const plainText = content
        .replace(/<br\s*\/?>/g, '\n')  // <br> 태그를 개행으로
        .replace(/<[^>]*>/g, '')       // 모든 HTML 태그 제거
        .replace(/&nbsp;/g, ' ')       // &nbsp;를 공백으로
        .replace(/&lt;/g, '<')         // HTML 엔티티 변환
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
  
      const result = await ipcRenderer.invoke('save-text-file', {
        content: plainText,            // 변환된 텍스트 저장
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
  }, [content, fileName, currentFilePath]);

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
      <div className="suneditor-container">
        <SunEditor
          setContents={content}
          onChange={handleContentChange}
          onSelect={handleSelectionChange}
          hideToolbar={true}
          getSunEditorInstance={handleEditorLoad}
          setOptions={{
            defaultStyle: 'font-family: inherit;',
            mode: 'classic',
            resizingBar: false,
            charCounter: false,
            buttonList: [],
            width: '100%',
            maxHeight: 'calc(100vh - 50px)',
            styleWithCSS: true,
          }}
        />
      </div>
    </div>
  );
}

export default TextEditor;