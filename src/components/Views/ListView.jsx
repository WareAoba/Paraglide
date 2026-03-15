// src/components/ListView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import '../../CSS/Views/ListView.css';
import SimpleBar from 'simplebar-react';
import '../../CSS/Controllers/Simplebar.css';

function ListView({ paragraphs, metadata, currentParagraph, onParagraphSelect, theme, onCompleteWork }) {
  const { t } = useTranslation();
  const listRef = useRef(null);
  const [commentPopup, setCommentPopup] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const commentCircleRef = useRef(null);

  const currentComments = metadata[currentParagraph]?.comments;

  // currentParagraph 변경 시 팝업 닫기
  useEffect(() => {
    setCommentPopup(false);
  }, [currentParagraph]);

  // SimpleBar 스크롤 시 팝업 닫기
  useEffect(() => {
    const scrollEl = listRef.current?.getScrollElement();
    if (!scrollEl) return;
    const onScroll = () => { if (commentPopup) setCommentPopup(false); };
    scrollEl.addEventListener('scroll', onScroll);
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [commentPopup]);

  // 페이지별 단락 그룹화 - 페이지 번호 없는 단락도 포함
  const groupedParagraphs = useMemo(() => {
    const groups = {};
    
    paragraphs.forEach((paragraph, index) => {
      const pageInfo = metadata[index]?.pageInfo;
      const key = pageInfo ? 
      t('common.pageInfo.pageNumber', { 
        page: pageInfo.end !== pageInfo.start ?
          `${pageInfo.start}-${pageInfo.end}` :  // 합페이지도 "페이지" 문구 포함
          pageInfo.start                         // 단일 페이지
      }) 
      : t('common.pageInfo.none');
      
      if (!groups[key]) {
        groups[key] = [];
      }
      
      groups[key].push({
        content: paragraph,
        index
      });
    });
    
    return groups;
  }, [paragraphs, metadata, t]);

  // 현재 단락으로 자동 스크롤
  useEffect(() => {
    // SimpleBar 스크롤 컨테이너와 타겟 요소 가져오기
    const scrollContainer = listRef.current?.getScrollElement();
    const targetElement = document.querySelector(`[data-paragraph="${currentParagraph}"]`);
    
    if (!scrollContainer || !targetElement) return;
  
    // 스크롤 컨테이너와 타겟 요소의 위치/크기 정보
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    
    // 컨테이너의 중앙으로 스크롤할 위치 계산
    const targetScrollTop = 
      targetElement.offsetTop - 
      (containerRect.height / 2) + 
      (targetRect.height / 2);
  
    // 부드러운 스크롤 애니메이션 적용
    scrollContainer.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  }, [currentParagraph]);

  // CSS 변수 업데이트
  useEffect(() => {
    if (!listRef.current) return;
  
    const currentElement = document.querySelector(`[data-paragraph="${currentParagraph}"]`);
    if (!currentElement) return;
  
    // SimpleBar의 실제 스크롤 컨테이너 접근
    const scrollContainer = listRef.current.getScrollElement();
    const containerRect = scrollContainer.getBoundingClientRect();
    const rect = currentElement.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;
  
    // 정확한 상대 위치 계산
    const actualTop = rect.top - containerRect.top + scrollTop - 16;
    
    // CSS 변수 설정
    scrollContainer.style.setProperty('--current-element-top', `${actualTop}px`);
  }, [currentParagraph]);

  return (
    <SimpleBar className="listview-container" ref={listRef} data-theme={theme?.mode}>
      {Object.entries(groupedParagraphs).map(([pageKey, items], groupIndex, groupArray) => (
        <div key={pageKey} className="listview-section">
          <h2
            className="listview-header"
            data-no-page-number={pageKey === t('common.pageInfo.none') ? '' : undefined}
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
              {index === currentParagraph && currentComments && (
                <div className="listview-comment-alert" onClick={(e) => {
                  e.stopPropagation();
                  if (commentPopup) {
                    setCommentPopup(false);
                  } else {
                    const rect = commentCircleRef.current.getBoundingClientRect();
                    setPopupPos({
                      top: rect.top - 8,
                      right: window.innerWidth - rect.right
                    });
                    setCommentPopup(true);
                  }
                }}>
                  <svg className="listview-comment-icon" ref={commentCircleRef} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                    <path d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="32"/>
                    <path d="M250.26 166.05L256 288l5.73-121.95a5.74 5.74 0 00-5.79-6h0a5.74 5.74 0 00-5.68 6z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32"/>
                    <path d="M256 367.91a20 20 0 1120-20 20 20 0 01-20 20z" fill="currentColor"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
          {createPortal(
            <div
              className={`listview-comment-popup ${commentPopup && currentComments ? 'visible' : ''}`}
              data-theme={theme?.mode}
              style={popupPos ? {
                position: 'absolute',
                top: `${popupPos.top + window.scrollY}px`,
                right: `${popupPos.right}px`,
                transform: commentPopup ? 'translateY(-100%)' : 'translateY(calc(-100% + 4px))'
              } : { position: 'absolute', visibility: 'hidden' }}
              onClick={(e) => { e.stopPropagation(); setCommentPopup(false); }}
            >
              {currentComments?.map((c, i) => (
                <div key={i} className="listview-comment-line">{c.length > 24 ? c.slice(0, 24) + '…' : c}</div>
              )).slice(0, 6)}
            </div>,
            document.body
          )}
          {groupIndex === groupArray.length - 1 && (
            <button 
              className="complete-work-button"
              onClick={onCompleteWork}
            >
              {t('common.buttons.completeWork')}
            </button>
          )}
        </div>
      ))}
    </SimpleBar>
  );
}

export default ListView;