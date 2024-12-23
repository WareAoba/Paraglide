// src/components/Views/Overview.js
import React from 'react';
import '../../CSS/Views/Overview.css';

function Overview({ paragraphs, currentParagraph, onParagraphClick, theme, hoveredSection, onHoverChange, paragraphsMetadata }) {
  // 클릭 시 스크롤을 최상단으로 리셋하는 함수
const resetScrollTop = () => {
  const paragraphs = document.querySelectorAll('.paragraph-content .paragraph-prev, .paragraph-content .paragraph-current, .paragraph-content .paragraph-next');
  paragraphs.forEach(paragraph => {
    paragraph.scrollTop = 0; // 모든 단락의 스크롤을 최상단으로 이동
  });
};

// 페이지 내 단락 번호를 계산하는 함수
const getPageParagraphInfo = (index) => {
  if (!paragraphsMetadata || !paragraphsMetadata[index]) return null;
  
  const currentPageNum = paragraphsMetadata[index].pageNumber;
  if (!currentPageNum) return null;
  
  // 현재 페이지의 같은 번호를 가진 단락들 중 몇 번째인지 계산
  let paragraphCount = 1;
  for (let i = index - 1; i >= 0; i--) {
    if (paragraphsMetadata[i]?.pageNumber === currentPageNum) {
      paragraphCount++;
    } else {
      break;
    }
  }
  
  return `${currentPageNum}-${paragraphCount}`;
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
            resetScrollTop();
          }}
          onMouseEnter={() => onHoverChange('prev')}
          onMouseLeave={() => onHoverChange(null)}
          data-theme={theme.mode}
        >
          <div className="overview-paragraph-wrapper">
            {paragraphs[currentParagraph - 1] || ''}
          </div>
          <div className="overview-paragraph-number">
            {getPageParagraphInfo(currentParagraph - 1)}
          </div>
        </div>

        <div 
          className="paragraph-current"
          onClick={(e) => {
            onParagraphClick('current');
            resetScrollTop();
          }}
          data-theme={theme.mode}
        >
          <div className="overview-paragraph-wrapper">
            {paragraphs[currentParagraph] || ''}
          </div>
          <div className="overview-paragraph-number">
            {getPageParagraphInfo(currentParagraph)}
          </div>
        </div>

        <div 
          className={`paragraph-next ${hoveredSection === 'next' ? 'hovered' : ''}`}
          onClick={(e) => {
            onParagraphClick('next');
            resetScrollTop();
          }}
          onMouseEnter={() => onHoverChange('next')}
          onMouseLeave={() => onHoverChange(null)}
          data-theme={theme.mode}
        >
          <div className="overview-paragraph-wrapper">
            {paragraphs[currentParagraph + 1] || ''}
          </div>
          <div className="overview-paragraph-number">
            {getPageParagraphInfo(currentParagraph + 1)}
          </div>
        </div>
    </div>
  </div>
);
}

export default Overview;
