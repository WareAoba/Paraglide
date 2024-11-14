// src/MainComponent.js
import React, { useState, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

function MainComponent() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [paragraphs, setParagraphs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(null);

  // 이전/현재/다음 단락 계산
  const prevParagraph = currentIndex > 0 ? paragraphs[currentIndex - 1] : null;
  const currentParagraph = paragraphs[currentIndex];
  const nextParagraph = currentIndex < paragraphs.length - 1 ? paragraphs[currentIndex + 1] : null;

  // 스킵할 패턴 정의
  // 추가 로직은 좀 더 생각을 해봐야 함...
  const skipPatterns = {
    pageNumber: /^\d+$/,  // 숫자로만 이루어진 단락
    separator: /^[=\-]{3,}/, // === 또는 --- 로 시작하는 단락
    comment: /^[\/\/#]/, // //, # 으로 시작하는 단락
  };

  // 페이지 번호 패턴 정의
  // 여기도 차차 업데이트 예정
  const pagePatterns = {
    numberOnly: /^(\d+)$/,               // "127", "128" 등 숫자로만 이루어진 페이지 번호
    koreanStyle: /^(\d+)(페이지|페)$/,   // "127페이지", "127페" 등 한글이 들어간 페이지 번호
    englishStyle: /^(\d+)(page|p)$/i     // "127page", "127p" 등 영어가 들어간 페이지 번호
  };

  // 페이지 번호 추출 함수
  const extractPageNumber = (paragraph) => {
    const text = paragraph.trim();
    
    for (const pattern of Object.values(pagePatterns)) {
      const match = text.match(pattern);
      if (match) {
        return parseInt(match[1], 10);  // 숫자 부분만 추출
      }
    }
    return null;
  };

  // 현재 페이지 업데이트 함수
  const updateCurrentPage = (paragraphs, currentIndex) => {
    for (let i = currentIndex; i >= 0; i--) {
      const pageNum = extractPageNumber(paragraphs[i]);
      if (pageNum) {
        setCurrentPage(pageNum);
        return;
      }
    }
    setCurrentPage(null);
  };

  // 스킵 검사 함수
  const shouldSkipParagraph = (paragraph) => {
    return Object.values(skipPatterns).some(pattern => pattern.test(paragraph.trim()));
  };

  useEffect(() => {
    ipcRenderer.on('theme-changed', (event, shouldUseDarkColors) => {
      setIsDarkMode(shouldUseDarkColors);
    });

    // 파일 내용이 로드되면 단락으로 분리
    ipcRenderer.on('file-content', (event, fileContent) => {
      console.log('File content received:', fileContent); // 디버깅용 로그 추가
      const splitParagraphs = fileContent
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0)  // 빈 단락 제거
        .filter(p => !shouldSkipParagraph(p));  // 스킵할 패턴 제거
      
      console.log('Filtered paragraphs:', splitParagraphs); // 디버깅용 로그 추가
      setParagraphs(splitParagraphs);
      setCurrentIndex(0);
    });

    return () => {
      ipcRenderer.removeAllListeners('theme-changed');
      ipcRenderer.removeAllListeners('file-content');
    };
  }, []);

  // 현재 단락이 변경될 때마다 오버레이 업데이트
  useEffect(() => {
    if (paragraphs.length > 0) {
      ipcRenderer.send('update-paragraphs', {
        prev: prevParagraph,
        current: currentParagraph,
        next: nextParagraph
      });
    }
  }, [currentIndex, paragraphs, prevParagraph, currentParagraph, nextParagraph]);

  useEffect(() => {
    if (paragraphs.length > 0) {
      updateCurrentPage(paragraphs, currentIndex);
    }
  }, [currentIndex, paragraphs]);

  const handleFileOpen = async () => {
    try {
      const filePath = await ipcRenderer.invoke('open-file-dialog');
      console.log('Selected file:', filePath);

      if (filePath) {
        const content = await ipcRenderer.invoke('read-file', filePath);
        if (content) {
          // 단락 분리 및 필터링
          const splitParagraphs = content
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .filter(p => !shouldSkipParagraph(p));
          
          setParagraphs(splitParagraphs);
          setCurrentIndex(0);
          
          // 페이지 번호 즉시 업데이트
          const firstPageNum = splitParagraphs.find(p => extractPageNumber(p));
          if (firstPageNum) {
            setCurrentPage(extractPageNumber(firstPageNum));
          }
        }
      }
    } catch (error) {
      console.error('Error in handleFileOpen:', error);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < paragraphs.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <div style={{
      backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
      color: isDarkMode ? '#ffffff' : '#000000',
      height: '100vh',
      padding: '20px',
    }}>
      <button 
        onClick={handleFileOpen}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          backgroundColor: isDarkMode ? '#333' : '#eee',
          color: isDarkMode ? '#fff' : '#000',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        파일 불러오기
      </button>
      
      <div style={{ marginTop: '20px' }}>
        {paragraphs.length > 0 && (
          <>
            {currentPage && (
              <div style={{
                padding: '10px',
                marginBottom: '10px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>
                페이지: {currentPage}
              </div>
            )}
            <h3>현재 단락: {currentIndex + 1} / {paragraphs.length}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {prevParagraph && (
                <div style={{ opacity: 0.5 }}>
                  [ {prevParagraph} ]
                </div>
              )}
              <div style={{ 
                fontWeight: 'bold',
                padding: '10px',
                border: `1px solid ${isDarkMode ? '#fff' : '#000'}`,
                borderRadius: '5px'
              }}>
                { currentParagraph }
              </div>
              {nextParagraph && (
                <div style={{ opacity: 0.5 }}>
                  [ {nextParagraph} ]
                </div>
              )}
            </div>
            <div style={{ marginTop: '20px' }}>
              <button 
                onClick={handlePrev}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  backgroundColor: isDarkMode ? '#333' : '#eee',
                  color: isDarkMode ? '#fff' : '#000',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
              >
                &lt;&lt;
              </button>
              <button 
                onClick={handleNext}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  backgroundColor: isDarkMode ? '#333' : '#eee',
                  color: isDarkMode ? '#fff' : '#000',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                &gt;&gt;
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MainComponent;