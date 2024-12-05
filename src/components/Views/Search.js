// components/Views/Search.js
import React, { useState, useEffect } from 'react';
import '../../CSS/Views/Search.css';

const Search = ({ paragraphs, onSelect, isVisible, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
  
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
            pageInfo: `${index + 1}번째 단락`
          };
        }
        return null;
      })
      .filter(Boolean);
  
    setResults(searchResults);
  }, [searchTerm, paragraphs]);
  
    // 3. 디버깅용 렌더링
    if (!isVisible) return null;
  
    return (
        <div className="search-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();  // 검색창 닫기 함수
            }
          }}>
        <div className="search-box">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`검색어를 입력하세요... (${paragraphs?.length || 0}개 단락)`}
            autoFocus
          />
          <div className="search-results" data-testid="search-results">
            {searchTerm.trim() && (
              results.length > 0 ? (
                results.map((result) => (
                  <div 
                    key={result.index}
                    className="search-result-item"
                    onClick={() => onSelect(result.index)}
                    data-testid={`search-result-${result.index}`}
                  >
                    <span className="result-info">#{result.pageInfo}</span>
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
            )}
          </div>
        </div>
      </div>
    );
  };

export default Search;