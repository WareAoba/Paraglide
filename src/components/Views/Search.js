// components/Views/Search.js
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hangul from 'hangul-js';
import '../../CSS/Views/Search.css';
import { debounce } from 'lodash'; // 상단에 추가

const Search = forwardRef((props, ref) => {
  const { paragraphs, metadata, onSelect, isVisible, onClose, icons } = props;

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [removingIndexes, setRemovingIndexes] = useState(new Set());
  const [prevResults, setPrevResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);

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

  const highlightMatch = (text, term) => {
    if (!term.trim()) return text;

    try {
      const normalizedTerm = normalizeText(term);
      const isChosungSearch = isChosung(normalizedTerm);

      if (isChosungSearch) {
        const tokens = [];
        let currentIndex = 0;

        while (currentIndex < text.length) {
          let matchFound = false;

          // 검색어 길이만큼의 글자 범위 검사
          const searchLength = normalizedTerm.length;
          if (currentIndex + searchLength <= text.length) {
            const current = text.slice(currentIndex, currentIndex + searchLength);
            const currentChosung = Hangul.disassemble(current, true)
              .map(arr => arr[0]).join('');

            if (currentChosung === normalizedTerm) {
              tokens.push(
                <mark key={`chosung-${currentIndex}`} className="search-highlight-chosung">
                  {current}
                </mark>
              );
              currentIndex += searchLength;
              matchFound = true;
            }
          }

          if (!matchFound) {
            tokens.push(text[currentIndex]);
            currentIndex++;
          }
        }

        return tokens;
      } else {
        const tokens = [];
        let lastIndex = 0;

        // 완전 일치 검사 (초록색)
        const exactMatch = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        text.replace(exactMatch, (match, p1, offset) => {
          if (offset > lastIndex) {
            const beforeText = text.substring(lastIndex, offset);
            // 부분 일치 검사를 나머지 텍스트에 대해 수행
            tokens.push(...highlightPartialMatches(beforeText, term));
          }
          tokens.push(<mark key={`exact-${offset}`} className="search-highlight-exact">{match}</mark>);
          lastIndex = offset + match.length;
        });

        // 남은 텍스트에 대해 부분 일치 검사
        if (lastIndex < text.length) {
          const remaining = text.substring(lastIndex);
          tokens.push(...highlightPartialMatches(remaining, term));
        }

        return tokens;
      }
    } catch (e) {
      return text;
    }
  };

  // 부분 일치 하이라이트 헬퍼 함수
  const highlightPartialMatches = (text, term) => {
    const tokens = [];
    const decomposedTerm = Hangul.disassemble(term);
    const maxSearchLength = Hangul.disassemble(term).length / 3 + 1;
    let currentIndex = 0;

    while (currentIndex < text.length) {
      let matchFound = false;

      for (let i = 1; i <= maxSearchLength && currentIndex + i <= text.length; i++) {
        const current = text.slice(currentIndex, currentIndex + i);
        const decomposedCurrent = Hangul.disassemble(current);

        if (decomposedCurrent.join('').includes(decomposedTerm.join(''))) {
          tokens.push(
            <mark key={`partial-${currentIndex}`} className="search-highlight-partial">
              {current}
            </mark>
          );
          currentIndex += i;
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        tokens.push(text[currentIndex]);
        currentIndex++;
      }
    }

    return tokens;
  };

  // 공백 제거 함수 분리
  const removeSpaces = (text) => text.replace(/\s+/g, '');

  // 텍스트 정규화 함수 수정
  const normalizeText = (text) => {
    return text.trim().toLowerCase();
  };

  const isChosung = (str) => { // 초성 체크
    const chosungRegex = /^[ㄱ-ㅎ]+$/;
    return chosungRegex.test(str);
  };

  const debouncedSearch = useCallback(
    debounce((term) => {
      if (isAnimating) return;

      if (!term.trim() || !paragraphs) {
        setResults([]);
        return;
      }

      const normalizedSearchTerm = normalizeText(term);
      const isChosungSearch = isChosung(normalizedSearchTerm);

      // 초성 한 글자 검색 방지
      if (isChosungSearch && normalizedSearchTerm.length === 1) {
        setResults([]);
        return;
      }

      const searchResults = paragraphs
        .map((paragraph, index) => {
          // 1. 먼저 paragraph 타입 체크
          const isParagraphMode = typeof paragraph === 'object' && paragraph?.text;
          const isLineMode = typeof paragraph === 'string' || paragraph?.content;

          // 2. 모드에 따라 텍스트와 페이지 정보 추출
          let paragraphText, pageInfo;

          if (isParagraphMode) {
            paragraphText = paragraph.text;
            pageInfo = metadata[index]?.pageInfo?.start || metadata[index]?.pageNumber;
          } else if (isLineMode) {
            paragraphText = typeof paragraph === 'string' ? paragraph : paragraph.content;
            pageInfo = metadata[index]?.lineNumber || metadata[index]?.pageNumber;
          } else {
            return null; // 유효하지 않은 형식
          }

          // 이하 기존 검색 로직...
          const normalizedText = normalizeText(paragraphText.toString());
          let matches = false;

          if (isChosungSearch) {
            // 초성 검색 (초성일 때만)
            const searchChosung = removeSpaces(normalizedSearchTerm);
            const textChosung = Hangul.disassemble(removeSpaces(normalizedText), true)
              .map(arr => arr[0]).join('');
            matches = textChosung.includes(searchChosung);
          } else {
            // 일반 검색 (초성이 아닐 때)
            // 1. 일반 텍스트 매칭 (공백 무시)
            const normalMatch = removeSpaces(normalizedText)
              .includes(removeSpaces(normalizedSearchTerm));

            // 2. 자모 분리 매칭 (공백 무시)
            const searchDecomposed = Hangul.disassemble(removeSpaces(normalizedSearchTerm)).join('');
            const textDecomposed = Hangul.disassemble(removeSpaces(normalizedText)).join('');
            const decomposedMatch = textDecomposed.includes(searchDecomposed);

            matches = normalMatch || decomposedMatch;
          }

          if (matches) {
            return {
              index,
              text: paragraphText,
              pageInfo: pageInfo || '페이지 정보 없음',
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

  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    debouncedSearch(e.target.value);
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
