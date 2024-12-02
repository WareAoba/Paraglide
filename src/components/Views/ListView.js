// src/components/ListView.js
import React, { useEffect, useRef } from 'react';
import '../../CSS/Views/ListView.css';

function ListView({ paragraphs, metadata, currentParagraph, onParagraphSelect, theme }) {
  const listRef = useRef(null);

  // 페이지별 단락 그룹화
  const groupedParagraphs = React.useMemo(() => {
    return paragraphs.reduce((acc, para, idx) => {
      const pageNum = metadata[idx]?.pageNumber || 'Unknown';
      if (!acc[pageNum]) acc[pageNum] = [];
      acc[pageNum].push({ content: para, index: idx });
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
      {Object.entries(groupedParagraphs).map(([pageNum, items]) => (
        <div key={pageNum} className="listview-section">
          <h2 className="listview-header">{pageNum} 페이지</h2>
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
        </div>
      ))}
    </div>
  );
}

export default ListView;