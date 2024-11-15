// OverlayComponent.js
import React, { useState, useEffect, useRef } from 'react';
const { ipcRenderer } = window.require('electron');

function OverlayComponent() {
  const [state, setState] = useState({
    previous: [],
    current: null,
    next: [],
    currentNumber: null,
    currentParagraph: null,
    isDarkMode: false,
    isPaused: false
  });
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const containerRef = useRef(null);

  // 상수 정의
  const MAX_ITEMS = 5;  // 최대 표시 단락 수 추가
  const CONTAINER_WIDTH = '96%';  // 너비 축소
  const CONTAINER_HEIGHT = 50;
  const CONTAINER_MARGIN = 0;
  const CONTAINER_TOTAL = CONTAINER_HEIGHT + CONTAINER_MARGIN;
  const CONTAINER_LEFT = '2%';    // 좌측 여백 증가

  // 단락 번호 스타일 정의
  const paragraphNumberStyle = {
    opacity: 0.5,
    marginLeft: '10px',
    fontSize: '0.9em',
    minWidth: '30px',
    textAlign: 'right'
  };

  // 공통 단락 컨테이너 스타일
  const paragraphContainerStyle = {
    minHeight: `${CONTAINER_HEIGHT}px`,
    width: CONTAINER_WIDTH,
    left: CONTAINER_LEFT,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    whiteSpace: 'nowrap',        // 줄바꿈 방지
    overflow: 'hidden',          // 오버플로우 숨김
    textOverflow: 'ellipsis'     // 말줄임표 처리
  };


  useEffect(() => {
    const handleParagraphsUpdate = (event, updatedParagraphs) => {
      setState({
        previous: updatedParagraphs.previous?.map(p => ({
          text: p.text,
          index: p.index
        })) || [],
        current: updatedParagraphs.current,
        next: updatedParagraphs.next?.map(p => ({
          text: p.text,
          index: p.index
        })) || [],
        currentNumber: updatedParagraphs.currentNumber,
        currentParagraph: updatedParagraphs.currentParagraph,
        isDarkMode: updatedParagraphs.isDarkMode,
        isPaused: updatedParagraphs.isPaused
      });
    };

    const handleThemeUpdate = (event, isDarkMode) => {
      setState(prevState => ({ ...prevState, isDarkMode }));
    };

    ipcRenderer.on('paragraphs-updated', handleParagraphsUpdate);
    ipcRenderer.on('theme-updated', handleThemeUpdate);

    // 초기 상태 요청 및 설정
    ipcRenderer.invoke('get-state').then(initialState => {
      const { paragraphs, currentParagraph, isDarkMode, isPaused, isOverlayVisible } = initialState;

      if (isOverlayVisible) {

        const prevParagraphs = [];
        const nextParagraphs = [];

        for (let i = 1; i <= 5; i++) {
          const prevIndex = currentParagraph - i;
          const nextIndex = currentParagraph + i;

          if (prevIndex >= 0) {
            prevParagraphs.unshift({
              text: paragraphs[prevIndex],
              index: prevIndex
            });
          }

          if (nextIndex < paragraphs.length) {
            nextParagraphs.push({
              text: paragraphs[nextIndex],
              index: nextIndex
            });
          }
        }

        const current = paragraphs[currentParagraph] || null;

        setState({
          previous: prevParagraphs,
          current: current,
          next: nextParagraphs,
          currentNumber: currentParagraph,
          isDarkMode: isDarkMode,
          isPaused: isPaused
        });
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('paragraphs-updated');
      ipcRenderer.removeListener('theme-updated', handleThemeUpdate);
    };
  }, []);

  // 텍스트 포맷팅 함수
  const formatText = (text) => {
    if (!text) return null;
    return text.replace(/\n/g, ' ');
  };


  const handleParagraphClick = (index) => {
    if (index !== undefined) {
      ipcRenderer.send('set-current-paragraph', index);
    }
  };


  // 단락 렌더링 수정
  const renderParagraphs = () => (
    <>
      {/* 이전 단락들 */}
      {state.previous.slice(0, 5).map((para, idx) => (
        <div
          key={`prev-${idx}`}
          style={{
            position: 'absolute',
            width: CONTAINER_WIDTH,
            left: CONTAINER_LEFT,
            top: `calc(50% - ${CONTAINER_TOTAL * (state.previous.length - idx)}px - ${CONTAINER_HEIGHT}px)`,
            height: CONTAINER_HEIGHT,
            ...paragraphContainerStyle,
            opacity: 0.7,
            backgroundColor: hoveredIndex === `prev-${idx}` ?
              (state.isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') :
              'transparent'
          }}
          onClick={() => handleParagraphClick(para.index)}
          onMouseEnter={() => setHoveredIndex(`prev-${idx}`)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatText(para.text) || ' '}
          </span>
          <span style={{ marginRight: 10, ...paragraphNumberStyle}}>
            {Number(state.currentParagraph) - (MAX_ITEMS - idx)}</span>
        </div>
      ))}

      {/* 현재 단락 (고정) */}
      <div style={{
        position: 'absolute',
        width: CONTAINER_WIDTH,
        left: CONTAINER_LEFT,
        top: '50%',
        transform: 'translateY(-50%)',
        height: CONTAINER_HEIGHT,
        ...paragraphContainerStyle,
        borderLeft: `4px solid ${state.isDarkMode ? '#fff' : '#000'}`,
        backgroundColor: state.isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(128,128,128,0.4)',
        fontSize: '1.1em',
        fontWeight: 'bold'
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' , marginLeft: 5, marginRight: 10}}>
          {formatText(state.current) || ' '}
        </span>
        <span style={{ marginRight: 10, ...paragraphNumberStyle }}>
          {Number(state.currentParagraph) + 1}
        </span>
      </div>

      {/* 다음 단락들 */}
      {state.next.slice(0, 5).map((para, idx) => (
        <div
          key={`next-${idx}`}
          style={{
            position: 'absolute',
            width: CONTAINER_WIDTH,
            left: CONTAINER_LEFT,
            top: `calc(50% + ${CONTAINER_TOTAL * (idx + 1)}px)`,
            height: CONTAINER_HEIGHT,
            ...paragraphContainerStyle,
            opacity: 0.7,
            backgroundColor: hoveredIndex === `next-${idx}` ?
              (state.isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') :
              'transparent'
          }}
          onClick={() => handleParagraphClick(para.index)}
          onMouseEnter={() => setHoveredIndex(`next-${idx}`)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatText(para.text) || ' '}
          </span>
          <span style={{ marginRight: 10, ...paragraphNumberStyle }}>
            {Number(state.currentParagraph) + Number(idx) + 2}</span>
        </div>
      ))}
    </>
  );

  return (
    <div ref={containerRef} style={{
      backgroundColor: state.isDarkMode ? 'rgba(32,32,32,0.8)' : 'rgba(255,255,255,0.8)',
      color: state.isDarkMode ? '#ffffff' : '#000000',
      padding: '15px 15px 50px 15px',  // 하단 패딩 유지
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      WebkitAppRegion: 'drag',  // 전체 영역을 드래그 가능하게 설정
      WebkitUserSelect: 'none'  // 텍스트 선택 방지
    }}>
      {/* 페이지 번호 컨테이너 */}
      <div style={{
        height: '36px',
        position: 'relative',  // 상대 위치 설정
        borderBottom: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 15px',
        flexShrink: 0
      }}>
        {/* 페이지 번호와 컨트롤을 포함하는 내부 컨테이너 */}
        <div style={{
          position: 'absolute',
          top: '-2.5px',        // 이전 변경 사항 반영
          left: '15px',
          right: '15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {/* 페이지 번호 */}
          <span style={{ 
            fontSize: '1.2em', 
            fontWeight: 'bold',
            marginRight: '15px'  // 간격 유지
          }}>
            {state.currentNumber ? `${state.currentNumber} 페이지` : ''}
          </span>

          {/* 컨트롤 영역 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px'  // 요소 간 간격 유지
          }}>
            {/* 일시정지 상태 표시 */}
            {state.isPaused && (
              <span style={{ 
                color: '#ff4444',
                fontWeight: 'bold',
                padding: '4px 8px',
                backgroundColor: 'rgba(255,68,68,0.1)',
                borderRadius: '4px'
              }}>
                일시정지
              </span>
            )}

            {/* 이전/다음 버튼 */}
            <button onClick={() => ipcRenderer.send('move-to-prev')} style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
              color: state.isDarkMode ? '#fff' : '#000',
              borderRadius: '4px',
              cursor: 'pointer',
              WebkitAppRegion: 'no-drag'  // 버튼 클릭 가능하도록
            }}>
              ◀
            </button>
            <button onClick={() => ipcRenderer.send('move-to-next')} style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: `1px solid ${state.isDarkMode ? '#ffffff33' : '#00000033'}`,
              color: state.isDarkMode ? '#fff' : '#000',
              borderRadius: '4px',
              cursor: 'pointer',
              WebkitAppRegion: 'no-drag'  // 버튼 클릭 가능하도록
            }}>
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* 단락들을 감싸는 컨테이너 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {renderParagraphs()}
      </div>
    </div>
  );
}

export default OverlayComponent;