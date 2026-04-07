// src/components/Views/Overview.js
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../stores/useAppStore';
import '../../CSS/Views/Overview.css';

function Overview({ onParagraphClick, onCompleteWork }) {
  
  const { t } = useTranslation();

  // ─── Zustand 스토어에서 상태 구독 ───
  const paragraphs = useAppStore((s) => s.paragraphs);
  const currentNumber = useAppStore((s) => s.currentNumber);
  const currentParagraph = useAppStore((s) => s.currentParagraph);
  const theme = useAppStore((s) => s.theme);
  const hoveredSection = useAppStore((s) => s.hoveredSection);
  const setHoveredSection = useAppStore((s) => s.setHoveredSection);
  const paragraphsMetadata = useAppStore((s) => s.paragraphsMetadata);
  const [commentPopup, setCommentPopup] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const commentCircleRef = useRef(null);
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

  const getRemainingParagraphsText = () => { // 남은 페이지 or 페이지 번호 힌트트
    const currentMeta = paragraphsMetadata[currentParagraph];
    if (!currentMeta?.pageNumber) {
      return t('mainComponent.paragraphInfo.pageNumberHint');
    }

    const nextPageIndex = paragraphsMetadata.findIndex(
      (meta) => meta?.pageNumber > currentMeta.pageNumber
    );

    const remainingParagraphs = nextPageIndex !== -1 ? 
      nextPageIndex - currentParagraph : 
      0;

    return remainingParagraphs > 0
      ? t('mainComponent.paragraphInfo.toNextPage', { count: remainingParagraphs })
      : t('mainComponent.paragraphInfo.lastParagraph');
  };

  const currentComments = paragraphsMetadata[currentParagraph]?.comments;

  // currentParagraph 변경 시 팝업 닫기
  useEffect(() => {
    setCommentPopup(false);
  }, [currentParagraph]);

  const handleCommentClick = (e) => {
    e.stopPropagation();
    if (commentPopup) {
      setCommentPopup(false);
    } else {
      const rect = commentCircleRef.current.getBoundingClientRect();
      setPopupPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2
      });
      setCommentPopup(true);
    }
  };

  return (
    <div className='overview-container' data-theme={theme.mode}>
      <div className="page-number">
  {currentNumber?.display ? 
    t('common.pageInfo.pageNumber', { 
      page: currentNumber.display.text
    }) 
    : t('common.pageInfo.none')}
</div>
    <div className="paragraph-container">
      <div className="paragraph-header">
        <div style={{ visibility: isFirstParagraph ? 'hidden' : 'visible' }}>
          {t('common.navigation.prev')}
        </div>
        <div className="current">
        {t('common.navigation.current')}
        </div>
        <div style={{ visibility: isLastParagraph ? 'hidden' : 'visible' }}>
          {t('common.navigation.next')}
        </div>
      </div>
      
      <div className="paragraph-content" data-theme={theme.mode}>
        <div 
          className={`paragraph-prev ${!isFirstParagraph ? '' : 'paragraph-empty'} ${hoveredSection === 'prev' ? 'hovered' : ''}`}
          onClick={!isFirstParagraph ? () => onParagraphClick('prev') : undefined}
          onMouseEnter={!isFirstParagraph ? () => setHoveredSection('prev') : undefined}
          onMouseLeave={!isFirstParagraph ? () => setHoveredSection(null) : undefined}
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
          {currentComments && (
            <div className="overview-comment-alert" onClick={handleCommentClick}>
              <svg className="overview-comment-icon" ref={commentCircleRef} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                <path d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="32"/>
                <path d="M250.26 166.05L256 288l5.73-121.95a5.74 5.74 0 00-5.79-6h0a5.74 5.74 0 00-5.68 6z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32"/>
                <path d="M256 367.91a20 20 0 1120-20 20 20 0 01-20 20z" fill="currentColor"/>
              </svg>
            </div>
          )}
          {createPortal(
            <div
              className={`overview-comment-popup ${commentPopup && currentComments ? 'visible' : ''}`}
              data-theme={theme.mode}
              style={popupPos ? {
                position: 'absolute',
                top: `${popupPos.top + window.scrollY}px`,
                left: `${popupPos.left}px`,
                transform: commentPopup ? 'translateX(-50%) translateY(-100%)' : 'translateX(-50%) translateY(calc(-100% + 4px))'
              } : { position: 'absolute', visibility: 'hidden' }}
              onClick={(e) => { e.stopPropagation(); setCommentPopup(false); }}
            >
              {currentComments?.map((c, i) => (
                <div key={i} className="overview-comment-line">{c.length > 24 ? c.slice(0, 24) + '…' : c}</div>
              )).slice(0, 6)}
            </div>,
            document.body
          )}
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
          {t('common.buttons.completeWork')}
        </button>
      </div>
    ) : (
          <div 
            className={`paragraph-next ${hoveredSection === 'next' ? 'hovered' : ''}`}
            onClick={() => onParagraphClick('next')}
            onMouseEnter={() => setHoveredSection('next')}
            onMouseLeave={() => setHoveredSection(null)}
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
      <div className="remaining-paragraphs">
        {getRemainingParagraphsText()}
      </div>
    </div>
    </div>
    
  );
}

export default Overview;
