// src/components/Views/Overview.js
import React from 'react';
import '../../CSS/Views/Overview.css';

function Overview({ paragraphs, currentParagraph, onParagraphClick, theme, hoveredSection, onHoverChange }) {
  // 클릭 시 스크롤을 최상단으로 리셋하는 함수
const resetScrollTop = () => {
  const paragraphs = document.querySelectorAll('.paragraph-content .paragraph-prev, .paragraph-content .paragraph-current, .paragraph-content .paragraph-next');
  paragraphs.forEach(paragraph => {
    paragraph.scrollTop = 0; // 모든 단락의 스크롤을 최상단으로 이동
  });
};


  return (
    <div className="paragraph-container">
      <div className="paragraph-header" data-theme={theme.mode}>
        <div>이전 단락</div>
        <div className="current">현재 단락</div>
        <div>다음 단락</div>
      </div>
      
      <div className="paragraph-content" data-theme={theme.mode}>
        <div 
          className={`paragraph-prev ${hoveredSection === 'prev' ? 'hovered' : ''}`}
          onClick={(e) => {
            onParagraphClick('prev');
            resetScrollTop(e.target); // 이전 단락 클릭 시 스크롤 리셋
          }}
          onMouseEnter={() => onHoverChange('prev')}
          onMouseLeave={() => onHoverChange(null)}
          data-theme={theme.mode}
        >
          {paragraphs[currentParagraph - 1] || ''}
        </div>

        <div 
          className="paragraph-current"
          onClick={(e) => {
            onParagraphClick('current');
            resetScrollTop(e.target); // 현재 단락 클릭 시 스크롤 리셋
          }}
          data-theme={theme.mode}
        >
          {paragraphs[currentParagraph] || ''}
        </div>

        <div 
          className={`paragraph-next ${hoveredSection === 'next' ? 'hovered' : ''}`}
          onClick={(e) => {
            onParagraphClick('next');
            resetScrollTop(e.target); // 다음 단락 클릭 시 스크롤 리셋
          }}
          onMouseEnter={() => onHoverChange('next')}
          onMouseLeave={() => onHoverChange(null)}
          data-theme={theme.mode}
        >
          {paragraphs[currentParagraph + 1] || ''}
        </div>
      </div>
    </div>
  );
}

export default Overview;
