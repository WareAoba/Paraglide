// components/Views/Search.js
import React, { useState, useEffect } from 'react';
import '../../CSS/Views/Search.css';

const Search = ({ paragraphs, metadata, onSelect, isVisible, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [dragStart, setDragStart] = useState(null);

  const handleMouseDown = (e) => {
    // search-box를 클릭한 경우는 무시
    if (!e.target.closest('.search-box')) {
      setDragStart({
        x: e.clientX,
        y: e.clientY
      });
    }
  };

  const handleMouseUp = (e) => {
    // search-box를 클릭한 경우는 무시
    if (!e.target.closest('.search-box') && dragStart) {
      const dx = Math.abs(e.clientX - dragStart.x);
      const dy = Math.abs(e.clientY - dragStart.y);
      
      if (dx < 5 && dy < 5) {
        onClose();
      }
    }
    setDragStart(null);
  };

  // 검색어 하이라이트 함수 추가
  const highlightMatch = (text, term) => {
    if (!term.trim()) return text;

    try {
      // 검색어를 정규식으로 변환 (특수문자 이스케이프)
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedTerm})`, 'gi');

      // 텍스트를 검색어 기준으로 분할하고 하이라이트 적용
      const parts = text.split(regex);

      return parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="search-highlight">{part}</mark>
        ) : (
          part
        )
      );
    } catch (e) {
      // 정규식 오류 발생시 원본 텍스트 반환
      return text;
    }
  };

  useEffect(() => {
    if (!searchTerm.trim() || !paragraphs) {
      setResults([]);
      return;
    }
  
    const searchNormalized = searchTerm.trim()
      .replace(/[\s\n]+/g, '')
      .toLowerCase();
  
    const searchResults = paragraphs
      .map((paragraph, index) => {
        const paragraphText = typeof paragraph === 'string'
          ? paragraph
          : paragraph?.text || paragraph?.content || '';
  
        const targetNormalized = paragraphText.toString()
          .replace(/[\s\n]+/g, '')
          .toLowerCase();
  
        if (targetNormalized.includes(searchNormalized)) {
          return {
            index,
            text: paragraphText,
            pageInfo: metadata[index]?.pageInfo?.number || index + 1
          };
        }
        return null;
      })
      .filter(Boolean);
  
    setResults(searchResults);
  }, [searchTerm, paragraphs, metadata]);
  
  const checkPagePattern = (text) => {
    const pagePatterns = {
      // 1. 단순 숫자 ("123")
      numberOnly: /^(\d+)$/,
      
      // 2. 한글 스타일 - 캡처 그룹 수정 필요
      koreanStyle: /^\s*(\d+)\s*(?:페이지|페)$|^(?:페이지|페)\s*(\d+)\s*$/,
      
      // 3. 영문 스타일 - 캡처 그룹 수정 필요
      englishStyle: /^\s*(\d+)\s*(?:page|p)$|^(?:page|p)\s*(\d+)\s*$/i,
      
      // 4. 범위 스타일 - 첫 번째 숫자만 필요
      rangeStyle: /^(?:(?:페이지|페|page|p)\s*)?(\d+)(?:\s*[-~]\s*\d+)?$/i
    };
    
    for (const pattern of Object.values(pagePatterns)) {
      const match = text.match(pattern);
      if (match) {
        // 모든 캡처 그룹 중 첫 번째 유효한 숫자 반환
        const number = match.slice(1).find(n => n !== undefined);
        return number ? parseInt(number, 10) : null;
      }
    }
    return null;
  };
  
  const isValidPage = (pageNum) => {
    // 기본 유효성 검사
    if (!pageNum || !metadata) return false;
  
    // metadata가 배열이 아닌 경우 처리
    const metadataArray = Array.isArray(metadata) ? metadata : [metadata];
  
    return metadataArray.some(meta => {
      // pageNumber 속성을 직접 사용
      const metaPageNum = meta.pageNumber;
      
      // null/undefined 체크
      if (metaPageNum == null) return false;
      
      // 문자열로 변환하여 비교
      return String(metaPageNum) === String(pageNum);
    });
  };
  
// 페이지 번호로 해당 단락 찾기
const findParagraphByPage = (pageNum) => {
  // 메타데이터가 없으면 -1 반환
  if (!metadata) return -1;
  
  // pageNumber를 사용하여 해당 페이지의 첫 번째 단락 찾기
  return metadata.findIndex(meta => 
    meta.pageNumber === Number(pageNum)
  );
};

// 페이지 이동 버튼 클릭 핸들러
const handlePageJump = (pageNum) => {
  const paragraphIndex = findParagraphByPage(pageNum);
  if (paragraphIndex !== -1) {
    onSelect(paragraphIndex);
    onClose();
  }
};

  return (
    <div 
      className={`search-overlay ${isVisible ? 'active' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className="search-box">
  <div className="search-header">
    {searchTerm.trim() && results.length > 0 ? (
      <h2 className="search-count">{results.length}개의 검색 결과</h2>
    ) : (
      <h2>검색</h2>
    )}
  </div>
  <div className="search-input-container">
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder={`검색어를 입력하세요… (${paragraphs?.length || 0}개 단락)`}
      autoFocus
    />
    {searchTerm && (
      <button className="clear-button" onClick={() => setSearchTerm('')}>
        ×
      </button>
    )}
  </div>
  <div className="search-results" data-testid="search-results">
  {(() => {
    const pageNum = checkPagePattern(searchTerm.trim());
    if (pageNum && isValidPage(pageNum)) {
      return (
        <div className="page-jump-container">
          <button 
            className="page-jump-button"
            onClick={() => handlePageJump(pageNum)}
          >
            {pageNum}페이지로 이동
          </button>
        </div>
      );
    }
    
    // 검색어가 있고 페이지 이동 버튼이 없을 때만 결과/no-results 표시
    return searchTerm.trim() ? (
      results.length > 0 ? (
        results.map((result) => (
          <div
            key={result.index}
            className="search-result-item"
            onClick={() => {
              onSelect(result.index);
              onClose();
            }}
            data-testid={`search-result-${result.index}`}
          >
            <span className="result-info">{result.pageInfo}페이지</span>
            <span className="result-text">
              {highlightMatch(result.text, searchTerm)}
            </span>
          </div>
        ))
      ) : (
        <div className="no-results" data-testid="no-results">
          검색 결과가 없습니다
        </div>
      )
    ) : null;
  })()}
</div>
</div>
    </div>
  );
};

export default Search;
