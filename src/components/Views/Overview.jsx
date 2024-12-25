// src/components/Views/Overview.js
import React from 'react';
import '../../CSS/Views/Overview.css';

function Overview({ paragraphs, currentParagraph, onParagraphClick, theme, hoveredSection, onHoverChange, paragraphsMetadata, onCompleteWork }) {
  
  const isFirstParagraph = currentParagraph === 0;
  const isLastParagraph = currentParagraph === paragraphs.length - 1;

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
    <div style={{ visibility: isFirstParagraph ? 'hidden' : 'visible' }}>이전 단락</div>
    <div className="current">현재 단락</div>
    <div style={{ visibility: isLastParagraph ? 'hidden' : 'visible' }}>다음 단락</div>
    </div>
    
    <div className="paragraph-content" data-theme={theme.mode}>
    <div 
      className={`paragraph-prev ${!isFirstParagraph ? '' : 'paragraph-empty'} ${hoveredSection === 'prev' ? 'hovered' : ''}`}
      onClick={!isFirstParagraph ? () => onParagraphClick('prev') : undefined}
      onMouseEnter={!isFirstParagraph ? () => onHoverChange('prev') : undefined}
      onMouseLeave={!isFirstParagraph ? () => onHoverChange(null) : undefined}
      data-theme={theme.mode}
    >
      <div className="overview-paragraph-wrapper">
      {!isFirstParagraph && paragraphs[currentParagraph - 1]}
      </div>
      <div className="overview-paragraph-number">
      {!isFirstParagraph && getPageParagraphInfo(currentParagraph - 1)}
      </div>
    </div>

    <div 
      className={`paragraph-current ${isFirstParagraph ? 'paragraph-current-first' : ''}`}
      onClick={() => onParagraphClick('current')}
      data-theme={theme.mode}
    >
      <div className="overview-paragraph-wrapper">
      {paragraphs[currentParagraph]}
      </div>
      <div className="overview-paragraph-number">
      {getPageParagraphInfo(currentParagraph)}
      </div>
    </div>

    {isLastParagraph ? (
      <div className="paragraph-next complete-work-container">
      <button 
        className="overview-complete-work-button"
        onClick={onCompleteWork}
      >
        작업 완료
      </button>
      </div>
    ) : (
      <div 
      className={`paragraph-next ${hoveredSection === 'next' ? 'hovered' : ''}`}
      onClick={() => onParagraphClick('next')}
      onMouseEnter={() => onHoverChange('next')}
      onMouseLeave={() => onHoverChange(null)}
      data-theme={theme.mode}
      >
      <div className="overview-paragraph-wrapper">
        {paragraphs[currentParagraph + 1]}
      </div>
      <div className="overview-paragraph-number">
        {getPageParagraphInfo(currentParagraph + 1)}
      </div>
      </div>
    )}
    </div>
  </div>
  );
}

export default Overview;
