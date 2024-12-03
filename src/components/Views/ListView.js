// src/components/ListView.js
import React, { useEffect, useRef, useMemo } from 'react';
import '../../CSS/Views/ListView.css';

function ListView({ paragraphs, metadata, currentParagraph, onParagraphSelect, theme, onCompleteWork }) {
  const listRef = useRef(null);

  const renderPageNumber = (meta) => {
    return meta?.pageInfo?.display || '';  // pageInfo.display 사용
  };

  // 페이지별 단락 그룹화 - 페이지 번호 없는 단락도 포함
  const groupedParagraphs = useMemo(() => {
    return paragraphs.reduce((acc, para, idx) => {
      const pageInfo = metadata[idx]?.pageInfo;
      
      // 페이지 정보가 없는 경우 "기타" 그룹으로 분류
      const pageKey = pageInfo ? 
        (pageInfo.display || `${pageInfo.start} 페이지`) : 
        '페이지 번호 없음';
      
      if (!acc[pageKey]) {
        acc[pageKey] = [];
      }
      
      acc[pageKey].push({ content: para, index: idx });
      return acc;
    }, {});
  }, [paragraphs, metadata]);

  // 현재 단락으로 자동 스크롤
  useEffect(() => {
    const currentElement = document.querySelector(`[data-paragraph="${currentParagraph}"]`);
    if (currentElement) {
      currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentParagraph]);

  // CSS 변수 업데이트
  useEffect(() => {
    if (listRef.current) {
      const currentElement = document.querySelector(`[data-paragraph="${currentParagraph}"]`);
      if (currentElement) {
        const rect = currentElement.getBoundingClientRect();
        const containerRect = listRef.current.getBoundingClientRect();
        const scrollTop = listRef.current.scrollTop;
  
        // 정확한 상대 위치 계산
        const actualTop = rect.top - containerRect.top + scrollTop - 16;
        
        listRef.current.style.setProperty('--current-element-top', `${actualTop}px`);
      }
    }
  }, [currentParagraph]);

  return (
    <div className="listview-container" ref={listRef} data-theme={theme?.mode}>
      {Object.entries(groupedParagraphs).map(([pageKey, items], groupIndex, groupArray) => (
        <div key={pageKey} className="listview-section">
          <h2
            className="listview-header"
            data-no-page-number={pageKey === '페이지 번호 없음' ? '' : undefined}
          >
            {pageKey}
          </h2>
          {items.map(({ content, index }) => (
            <div
              key={index}
              className={`listview-item ${index === currentParagraph ? 'current' : ''}`}
              data-paragraph={index}
              onClick={() => onParagraphSelect(index)}
            >
              {content}
            </div>
          ))}
       {groupIndex === groupArray.length - 1 && (
            <button 
              className="complete-work-button"
              onClick={onCompleteWork}
            >
              작업 완료
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default ListView;