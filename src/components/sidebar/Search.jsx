// components/Views/Search.js
import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import Hangul from 'hangul-js';
import '../../CSS/App.css';
import '../../CSS/Sidebar/Search.css';
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
    let matchFound = false;
    const remainingText = text.slice(i);
    const cleanRemaining = SearchUtils.removeSpaces(remainingText);
    const maxLen = Math.min(searchTerm.length + 2, cleanRemaining.length);

    for (let len = 1; len <= maxLen; len++) {
      const cleanTarget = cleanRemaining.slice(0, len);
      const targetJamo = Hangul.disassemble(cleanTarget);

      if (
        targetJamo.length >= searchJamo.length &&
        searchJamo.every((char, idx) => targetJamo[idx] === char)
      ) {
        let startOffset = 0;
        while (startOffset < remainingText.length && !remainingText[startOffset].trim()) {
          startOffset++;
        }

        let realLength = startOffset;
        let cleanCount = 0;

        while (cleanCount < len && realLength < remainingText.length) {
          if (remainingText[realLength].trim()) {
            cleanCount++;
          }
          realLength++;
        }

        if (i > lastIndex) {
          tokens.push(text.substring(lastIndex, i + startOffset));
        }

        tokens.push(
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

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [pointer, setPointer] = useState(-1);
  const searchInputRef = useRef(null);

  const handleSearchChange = (e) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);
    
    // 초성 한 글자 검사를 debounce 이전에 수행
    const normalizedTerm = SearchUtils.normalizeText(newTerm);
    if (SearchUtils.isChosung(normalizedTerm) && normalizedTerm.length === 1) {
      setResults([]);
      return;
    }
    
    debouncedSearch(newTerm);
  };

  const debouncedSearch = useCallback(
    debounce((term) => {

      const normalizedSearchTerm = SearchUtils.normalizeText(term);
      const isChosungSearch = SearchUtils.isChosung(normalizedSearchTerm);

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
    [paragraphs, metadata]
  );

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

  const isValidPage = (pageNum) => {
    // 0이나 음수는 유효하지 않은 페이지로 처리
    if (!pageNum || pageNum <= 0 || !metadata) return false;
  
    const metadataArray = Array.isArray(metadata) ? metadata : [metadata];
  
    return metadataArray.some(meta => {
      const metaPageNum = meta.pageNumber;
      // null, undefined, 0 체크 추가
      if (metaPageNum == null || metaPageNum <= 0) return false;
      return String(metaPageNum) === String(pageNum);
    });
  };
  
  const checkPagePattern = (text) => {
    const pagePatterns = {
      // 1 이상의 숫자만 매칭하도록 수정
      numberOnly: /^([1-9]\d*)$/
    };
  
    for (const pattern of Object.values(pagePatterns)) {
      const match = text.match(pattern);
      if (match) {
        const number = match.slice(1).find(n => n !== undefined);
        return number ? parseInt(number, 10) : null;
      }
    }
    return null;
  };

  const findParagraphByPage = (pageNum) => {
    if (!metadata) return -1;
    return metadata.findIndex(meta =>
      meta.pageNumber === Number(pageNum)
    );
  };

  const handlePageJump = (pageNum) => {
    const paragraphIndex = findParagraphByPage(pageNum);
    if (paragraphIndex !== -1) {
      onSelect(paragraphIndex);
      onClose();
    }
  };

  const resultItemsRef = useRef([]);

  const handleKeyDown = useCallback((e) => {
    if (!isVisible || !results.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setPointer(prev => {
          if (prev === results.length - 1) {
            return -1;
          }
          const newPointer = prev + 1;
          resultItemsRef.current[newPointer]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
          return newPointer;
        });
        break;

      case 'ArrowUp':
        e.preventDefault();
        setPointer(prev => {
          if (prev === -1) {
            const lastIndex = results.length - 1;
            resultItemsRef.current[lastIndex]?.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest'
            });
            return lastIndex;
          }
          if (prev === 0) {
            return -1;
          }
          const newPointer = prev - 1;
          resultItemsRef.current[newPointer]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
          return newPointer;
        });
        break;

      case 'Enter':
        e.preventDefault();
        if (pointer >= 0) {
          onSelect(results[pointer].index);
          onClose();
        }
        break;
    }
  }, [isVisible, results, pointer, onSelect, onClose]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setResults([]);
    setresults([]);
  }, []);

  useImperativeHandle(ref, () => ({
    clearSearch
  }), [clearSearch]);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          const length = searchInputRef.current.value.length;
          searchInputRef.current.setSelectionRange(length, length);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, handleKeyDown]);

  useEffect(() => {
    setPointer(-1);
  }, [searchTerm, results, isVisible]);

  return (
    <div className="search-container" data-theme={theme.mode}>
      <div className="search-header">
        <h2>
          {searchTerm.trim() && results.length > 0
            ? `${results.length}개의 검색 결과`
            : '검색'}
        </h2>
      </div>

      <div className="search-content">
        <div className="search-input-container">
          <img src={icons?.searchIcon} alt="" className="search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="검색어를 입력하세요"
          />
          {searchTerm && (
            <button className="clear-button" onClick={() => setSearchTerm('')}>
              <img 
                src={icons?.deleteIcon} 
                alt="지우기"
                className="clear-icon"
              />
            </button>
          )}
        </div>
        
        <div className="search-results" data-testid="search-results">
          {(() => {
            const pageNum = checkPagePattern(searchTerm.trim());
  
            return (
              <>
                {pageNum && isValidPage(pageNum) && (
                  <div className="page-jump-container">
                    <button className="page-jump-button" onClick={() => handlePageJump(pageNum)}>
                      <span>{pageNum}페이지로 이동</span>
                    </button>
                  </div>
                )}
  
                {searchTerm.trim() && results.length > 0 ? (
                  results.map((result, index) => (
                    <div
                      key={result.index}
                      ref={el => resultItemsRef.current[index] = el}
                      className={`search-result-item ${pointer === index ? 'pointed' : ''}`}
                      onClick={() => {
                        console.log('Search result clicked:', result.index);
                        
                        // 순서 중요
                        const selectedIndex = result.index;
                        
                        // 먼저 이동
                        if (typeof selectedIndex === 'number') {
                          onSelect(selectedIndex);
                          console.log('Called onSelect with index:', selectedIndex);
                        }
                        
                        // UI 정리
                        if (onClose) {
                          onClose();
                          console.log('Called onClose');
                        }
                      }}
                    >
                      <div className="result-text">
                        {highlightMatch(result.text, searchTerm)}
                      </div>
                      <div className="result-info">{result.pageInfo}페이지</div>
                    </div>
                  ))
                ) : (
                  searchTerm.trim() && 
                  !isValidPage(pageNum) && 
                  <div className="no-results">검색 결과가 없습니다</div>
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