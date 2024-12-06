// components/Views/Search.js
import React, { useState, useEffect } from 'react';
import Hangul from 'hangul-js';
import '../../CSS/Views/Search.css';

const Search = ({ paragraphs, metadata, onSelect, isVisible, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [removingIndexes, setRemovingIndexes] = useState(new Set());
  const [prevResults, setPrevResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);

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
      // 초성 검색어인지 확인
      const isChosung = Hangul.isChosung(term);
      
      if (isChosung) {
        // 초성 검색일 경우 단어 단위로 분리하여 하이라이트
        const words = text.split(/(\s+)/);
        return words.map((word, i) => {
          const wordChosung = Hangul.disassemble(word, true)
            .map(arr => arr[0]).join('');
          return wordChosung.includes(term) ? 
            <mark key={i} className="search-highlight">{word}</mark> : word;
        });
      } else {
        // 일반 검색의 경우 기존 로직 사용
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
          regex.test(part) ? 
            <mark key={i} className="search-highlight">{part}</mark> : part
        );
      }
    } catch (e) {
      return text;
    }
  };

  const normalizeText = (text) => {
    return text
      .trim()
      .replace(/\s+/g, ' ') // 연속된 공백을 하나로
      .toLowerCase();
  };

  const isChosung = (str) => { // 초성 체크
    const chosungRegex = /^[ㄱ-ㅎ]+$/;
    return chosungRegex.test(str);
  };
  
  useEffect(() => {
    if (!searchTerm.trim() || !paragraphs) {
      setResults([]);
      return;
    }
  
    const normalizedSearchTerm = normalizeText(searchTerm);
    const isChosungSearch = isChosung(normalizedSearchTerm.replace(/\s+/g, '')); 
  
    const searchResults = paragraphs
      .map((paragraph, index) => {
        const paragraphText = typeof paragraph === 'string'
          ? paragraph
          : paragraph?.text || paragraph?.content || '';
  
        const normalizedText = normalizeText(paragraphText.toString());
  
        let matches = false;
  
        if (isChosungSearch) {
          // 초성 검색 (초성일 때만)
          const searchChosung = normalizedSearchTerm.replace(/\s+/g, '');
          const textChosung = Hangul.disassemble(normalizedText.replace(/\s+/g, ''), true)
            .map(arr => arr[0]).join('');
          matches = textChosung.includes(searchChosung);
        } else {
          // 일반 검색 (초성이 아닐 때)
          // 1. 일반 텍스트 매칭
          const normalMatch = normalizedText.includes(normalizedSearchTerm);
          
          // 2. 자모 분리 매칭
          const searchDecomposed = Hangul.disassemble(normalizedSearchTerm).join('');
          const textDecomposed = Hangul.disassemble(normalizedText).join('');
          const decomposedMatch = textDecomposed.includes(searchDecomposed);
  
          matches = normalMatch || decomposedMatch;
        }
  
        if (matches) {
          return {
            index,
            text: paragraphText,
            pageInfo: metadata[index]?.pageInfo?.number || index + 1,
            matchType: isChosung ? 'chosung' : 'normal'
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

// 검색 결과 필터링 처리
useEffect(() => {
  // 새로 추가/제거된 항목 찾기
  const removedItems = prevResults.filter(
    prev => !results.some(curr => curr.index === prev.index)
  );

  if (removedItems.length > 0) {
    // 제거될 항목들 마킹
    setRemovingIndexes(new Set(removedItems.map(item => item.index)));
    
    // 애니메이션 후 실제 결과 업데이트
    setTimeout(() => {
      setFilteredResults(results);
      setRemovingIndexes(new Set());
    }, 300);
  } else {
    // 변경사항이 없거나 새로운 결과만 있는 경우
    setFilteredResults(results);
  }

  setPrevResults(results);
}, [results]);

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
    
    return (
      <>
       {/* 페이지 이동 버튼 (조건 충족 시 표시) */}
{pageNum && isValidPage(pageNum) && (
  <div className="page-jump-container">
    <button 
      className="page-jump-button"
      onClick={() => handlePageJump(pageNum)}
    >
      {pageNum}페이지로 이동
    </button>
  </div>
)}

{/* 검색 결과 항상 표시 */}
{searchTerm.trim() && filteredResults.length > 0 && 
 filteredResults.map((result) => (
  <div
    key={result.index}
    className={`search-result-item ${removingIndexes.has(result.index) ? 'removing' : ''}`}
    onClick={() => {
      onSelect(result.index);  // 선택한 단락으로 이동
      onClose();  // 검색창 닫기
    }}
    data-testid={`search-result-${result.index}`}
  >
    <span className="result-info">{result.pageInfo}페이지</span>
    <span className="result-text">
      {highlightMatch(result.text, searchTerm)}
    </span>
  </div>
  ))
}

{/* 검색어 있고 결과 없고 페이지 이동 버튼도 없을 때만 "검색 결과 없음" 표시 */}
{searchTerm.trim() && 
 filteredResults.length === 0 && 
 !(pageNum && isValidPage(pageNum)) && (
  <div className="no-results" data-testid="no-results">
    검색 결과가 없습니다
  </div>
)}
      </>
    );
  })()}
</div>
</div>
    </div>
  );
};

export default Search;
