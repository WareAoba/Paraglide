// components/Views/Search.js
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hangul from 'hangul-js';
import '../../CSS/Views/Search.css';
import { debounce } from 'lodash';

// 검색 유틸리티 함수 모음
const SearchUtils = {
  removeSpaces: (text) => text.replace(/\s+/g, ''),
  normalizeText: (text) => text.trim().toLowerCase(),
  isChosung: (str) => /^[ㄱ-ㅎ]+$/.test(str)
};

// 1. 초성 검색 함수
const searchChosung = (text, term) => {
  const termChosung = SearchUtils.removeSpaces(term);
  const textChosung = Hangul.disassemble(SearchUtils.removeSpaces(text), true)
    .map(char => char[0])
    .join('');
  return textChosung.includes(termChosung);
};

// 2. 완전 일치 검색 함수
const searchExactMatch = (text, term) => {
  const cleanText = SearchUtils.removeSpaces(text);
  const cleanTerm = SearchUtils.removeSpaces(term);
  return cleanText.includes(cleanTerm);
};

// 3. 부분 일치 검색 함수
const searchPartialMatch = (text, term) => {
  const termDecomposed = Hangul.disassemble(SearchUtils.removeSpaces(term)).join('');
  const textDecomposed = Hangul.disassemble(SearchUtils.removeSpaces(text)).join('');
  return textDecomposed.includes(termDecomposed);
};

// 4. 초성 하이라이트 함수
const highlightChosung = (text, term) => {
  const tokens = [];
  let lastIndex = 0;
  const termChosung = SearchUtils.removeSpaces(term);

  for (let i = 0; i < text.length; i++) {
    if (text[i].trim() === '') continue;

    let extractedChars = 0;

    for (let j = i; j < text.length && extractedChars < termChosung.length; j++) {
      if (text[j].trim() === '') continue;
      extractedChars++;

      if (extractedChars === termChosung.length) {
        const extracted = text.slice(i, j + 1);
        const extractedChosung = Hangul.disassemble(SearchUtils.removeSpaces(extracted), true)
          .map(char => char[0])
          .join('');

        if (extractedChosung === termChosung) {
          if (i > lastIndex) tokens.push(text.substring(lastIndex, i));
          tokens.push(
            <mark key={`chosung-${i}`} className="search-highlight-chosung">
              {extracted}
            </mark>
          );
          lastIndex = j + 1;
          i = j;
          break;
        }
      }
    }
  }
  if (lastIndex < text.length) tokens.push(text.substring(lastIndex));
  return tokens;
};

// 5. 완전 일치 하이라이트 함수
const highlightExactMatch = (text, term) => {
  const tokens = [];
  let lastIndex = 0;
  const cleanTerm = SearchUtils.removeSpaces(term);

  for (let i = 0; i < text.length; i++) {
    const remainingText = text.slice(i);
    const cleanRemaining = SearchUtils.removeSpaces(remainingText);

    if (cleanRemaining.startsWith(cleanTerm)) {
      let startOffset = 0;
      while (startOffset < remainingText.length && !remainingText[startOffset].trim()) {
        startOffset++;
      }

      let realLength = startOffset;
      let cleanLength = 0;

      while (cleanLength < cleanTerm.length && realLength < remainingText.length) {
        if (remainingText[realLength].trim()) cleanLength++;
        realLength++;
      }

      if (i > lastIndex) tokens.push(text.substring(lastIndex, i));
      tokens.push(
        <mark key={`exact-${i}`} className="search-highlight-exact">
          {text.substring(i + startOffset, i + realLength)}
        </mark>
      );
      lastIndex = i + realLength;
      i = lastIndex - 1;
    }
  }

  if (lastIndex < text.length) tokens.push(text.substring(lastIndex));
  return tokens;
};

// 6. 부분 일치 하이라이트 함수
const highlightPartialMatch = (text, term) => {
  const tokens = [];
  let lastIndex = 0;
  const searchTerm = SearchUtils.removeSpaces(term);
  const searchJamo = Hangul.disassemble(searchTerm);

  for (let i = 0; i < text.length; i++) {
    // 공백 건너뛰기 제거 - 공백도 포함하여 처리
    let matchFound = false;
    const remainingText = text.slice(i);
    
    // 검색을 위한 정규화된 텍스트만 공백 제거
    const cleanRemaining = SearchUtils.removeSpaces(remainingText);
    const maxLen = Math.min(searchTerm.length + 2, cleanRemaining.length);

    for (let len = 1; len <= maxLen; len++) {
      // 정규화된 텍스트로 검색
      const cleanTarget = cleanRemaining.slice(0, len);
      const targetJamo = Hangul.disassemble(cleanTarget);

      if (
        targetJamo.length >= searchJamo.length &&
        searchJamo.every((char, idx) => targetJamo[idx] === char)
      ) {
        // 시작 위치 조정 - 첫 비공백 문자 찾기
        let startOffset = 0;
        while (startOffset < remainingText.length && !remainingText[startOffset].trim()) {
          startOffset++;
        }

        // 실제 길이 계산 (공백 포함)
        let realLength = startOffset;
        let cleanCount = 0;
        
        while (cleanCount < len && realLength < remainingText.length) {
          if (remainingText[realLength].trim()) {
            cleanCount++;
          }
          realLength++;
        }

        // 원본 텍스트 자르기 (공백 포함)
        if (i > lastIndex) {
          tokens.push(text.substring(lastIndex, i + startOffset));
        }
        
        tokens.push( // startOffset부터 시작
          <mark key={`partial-${i}`} className="search-highlight-partial">
            {remainingText.slice(startOffset, realLength)}
          </mark>
        );

        lastIndex = i + realLength;
        i = lastIndex - 1;
        matchFound = true;
        break;
      }
    }

    if (!matchFound && i >= lastIndex) {
      tokens.push(text[i]);
      lastIndex = i + 1;
    }
  }

  if (lastIndex < text.length) {
    tokens.push(text.substring(lastIndex));
  }
  return tokens;
};

const Search = forwardRef((props, ref) => {
  const { paragraphs, metadata, onSelect, isVisible, onClose, icons, theme } = props;

  // 상태 변수 선언
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [removingIndexes, setRemovingIndexes] = useState(new Set());
  const [prevResults, setPrevResults] = useState([]);
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

  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    debouncedSearch(e.target.value);
  };

  // 디바운스된 검색 함수
  const debouncedSearch = useCallback(
    debounce((term) => {
      if (isAnimating || !term.trim() || !paragraphs) {
        setResults([]);
        return;
      }

      const normalizedSearchTerm = SearchUtils.normalizeText(term);
      const isChosungSearch = SearchUtils.isChosung(normalizedSearchTerm);

      if (isChosungSearch && normalizedSearchTerm.length === 1) {
        setResults([]);
        return;
      }

      const searchResults = paragraphs
        .map((paragraph, index) => {
          const isParagraphMode = typeof paragraph === 'object' && paragraph?.text;
          const paragraphText = isParagraphMode ? paragraph.text : paragraph;
          const pageInfo = metadata[index]?.pageNumber || '페이지 정보 없음';

          const normalizedText = SearchUtils.normalizeText(paragraphText.toString());

          let matches = false;

          if (isChosungSearch) {
            matches = searchChosung(normalizedText, normalizedSearchTerm);
          } else {
            matches =
              searchExactMatch(normalizedText, normalizedSearchTerm) ||
              searchPartialMatch(normalizedText, normalizedSearchTerm);
          }

          if (matches) {
            return {
              index,
              text: paragraphText,
              pageInfo,
              matchType: isChosungSearch ? 'chosung' : 'normal',
              mode: isParagraphMode ? 'paragraph' : 'line'
            };
          }
          return null;
        })
        .filter(Boolean);

      setResults(searchResults);
    }, 200),
    [paragraphs, metadata, isAnimating]
  );

  // 검색 결과 하이라이트 처리 함수
  const highlightMatch = (text, term) => {
    if (!term.trim()) return text;

    const normalizedTerm = SearchUtils.normalizeText(term);
    const isChosungSearch = SearchUtils.isChosung(normalizedTerm);

    try {
      if (isChosungSearch) {
        return highlightChosung(text, term);
      } else {
        const exactTokens = highlightExactMatch(text, term);
        if (exactTokens.some(token => token.props && token.props.className.includes('search-highlight-exact'))) {
          return exactTokens;
        }
        return highlightPartialMatch(text, term);
      }
    } catch (e) {
      console.error('Highlight error:', e);
      return text;
    }
  };

  const checkPagePattern = (text) => {
    const pagePatterns = {
      // 1. 단순 숫자 ("123")
      numberOnly: /^(\d+)$/,
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

  // 결과 업데이트 및 애니메이션 처리
  useEffect(() => {
    if (removingIndexes.size > 0) {
      setIsAnimating(true);
      setTimeout(() => {
        setFilteredResults(results);
        setRemovingIndexes(new Set());
        setIsAnimating(false);
      }, 300); // 애니메이션 시간과 동일하게
    } else {
      setFilteredResults(results);
    }
  }, [results]);

  const clearSearch = useCallback(() => { // 검색 초기화
    setSearchTerm('');
    setResults([]);
    setFilteredResults([]);
    setPrevResults([]);
    setRemovingIndexes(new Set());
    setIsAnimating(false);
  }, []);

  // 컴포넌트 반환문 앞에 ref 추가
  useEffect(() => {
    if (!isVisible) {
      setIsAnimating(false); // 애니메이션만 리셋
    }
  }, [isVisible]);

  useImperativeHandle(ref, () => ({
    clearSearch
  }), [clearSearch]);

  return (
    <div
      className={`search-overlay ${isVisible ? 'active' : ''}`}
      data-theme={theme.mode}
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
          <img src={icons?.searchIcon} alt="" className="search-icon" />
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
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
                    <button className="page-jump-button" onClick={() => handlePageJump(pageNum)}>
                      <img src={icons?.pageJumpIcon} alt="" className="page-jump-icon" />
                      <span>{pageNum}페이지로 이동</span>
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
});

export default Search;