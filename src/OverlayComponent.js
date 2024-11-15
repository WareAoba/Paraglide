// OverlayComponent.js
import './App.css';
import React, { useState, useEffect, useRef } from 'react';
const { ipcRenderer } = window.require('electron');

function OverlayComponent({isOverlayVisible, toggleOverlay}) {
  
  const [state, setState] = useState({
    previous: [],
    current: null,
    next: [],
    currentNumber: null,
    isDarkMode: false,
    isPaused: false
  });
  const containerRef = useRef(null);

  useEffect(() => {
    const handleParagraphsUpdate = (event, updatedParagraphs) => {
      console.log('[오버레이] 단락 업데이트:', updatedParagraphs);
      setState({
        previous: updatedParagraphs.previous || [],
        current: updatedParagraphs.current || null,
        next: updatedParagraphs.next || [],
        currentNumber: updatedParagraphs.currentNumber,
        isDarkMode: updatedParagraphs.isDarkMode,
        isPaused: updatedParagraphs.isPaused
      });
    };

    // 단락 업데이트 구독
    ipcRenderer.on('paragraphs-updated', handleParagraphsUpdate);

    // 초기 상태 요청 및 설정
    ipcRenderer.invoke('get-state').then(initialState => {
      const { paragraphs, currentParagraph, currentNumber, isDarkMode, isPaused, visibleRanges, paragraphsMetadata, isOverlayVisible } = initialState;

      if (isOverlayVisible) {
        const before = visibleRanges.overlay.before;
        const after = visibleRanges.overlay.after;

        const prevParagraphs = [];
        const nextParagraphs = [];

        for (let i = 1; i <= before; i++) {
          const index = currentParagraph - i;
          if (index >= 0) {
            prevParagraphs.push({
              text: paragraphs[index],
              metadata: paragraphsMetadata[index]
            });
          }
        }

        for (let i = 1; i <= after; i++) {
          const index = currentParagraph + i;
          if (index < paragraphs.length) {
            nextParagraphs.push({
              text: paragraphs[index],
              metadata: paragraphsMetadata[index]
            });
          }
        }

        const current = paragraphs[currentParagraph] || null;

        setState({
          previous: prevParagraphs,
          current: current,
          next: nextParagraphs,
          currentNumber: currentNumber,
          isDarkMode: isDarkMode,
          isPaused: isPaused
        });
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('paragraphs-updated');
    };
  }, []);

  // 텍스트 포맷팅 함수
  const formatText = (text) => {
    if (!text) return null;
    return text.replace(/\n/g, ' ');
  };

  // 프로그램 종료 버튼 핸들러 (필요 시 편집)
  const handleExit = () => {
    ipcRenderer.send('exit-program');
  };

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
        padding: '10px 0'
      }}>
        {/* 이전 단락들 */}
        <div style={{
          marginBottom: '25px',
          display: 'flex',
          flexDirection: 'column',
          marginRight: 'auto',
        }}>
          {state.previous.map((para, idx) => (
            <div key={`prev${idx}`} style={{
              opacity: 0.7,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              padding: '0px 10px',
              fontSize: '1em'
            }}>
              {formatText(para.text)}
            </div>
          ))}
        </div>

        {/* 현재 단락 */}
        <div style={{
          width: '92%',
          height: '27px',
          padding: '12px 15px',
          borderLeft: `4px solid ${state.isDarkMode ? '#fff' : '#000'}`,
          backgroundColor: state.isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(128,128,128,0.4)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '1.1em',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center'
        }}>
          {formatText(state.current) || ''}
        </div>

        {/* 다음 단락들 */}
        <div style={{
          marginTop: '25px',
          display: 'flex',
          flexDirection: 'column',
          marginRight: 'auto',
        }}>
          {state.next.map((para, idx) => (
            <div key={`next${idx}`} style={{
              opacity: 0.7,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              padding: '0px 10px',
              fontSize: '1em'
            }}>
              {formatText(para.text)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default OverlayComponent;