// src/components/Views/Overview.js
import React from 'react';
import '../../CSS/Views/Overview.css';

function Overview({ paragraphs, currentParagraph, onParagraphClick, theme, hoveredSection, onHoverChange }) {
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
          onClick={() => onParagraphClick('prev')}
          onMouseEnter={() => onHoverChange('prev')}
          onMouseLeave={() => onHoverChange(null)}
          data-theme={theme.mode}
        >
          {paragraphs[currentParagraph - 1] || ''}
        </div>

        <div 
          className="paragraph-current"
          onClick={() => onParagraphClick('current')}
          data-theme={theme.mode}
        >
          {paragraphs[currentParagraph] || ''}
        </div>

        <div 
          className={`paragraph-next ${hoveredSection === 'next' ? 'hovered' : ''}`}
          onClick={() => onParagraphClick('next')}
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