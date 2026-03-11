// src/store/utils/SearchUtils.js — 검색 유틸리티 함수 (Search.jsx에서 추출)
import Hangul from 'hangul-js';

export const SearchUtils = {
  removeSpaces: (text) => text.replace(/\s+/g, ''),
  normalizeText: (text) => text.trim().toLowerCase(),
  isChosung: (str) => /^[ㄱ-ㅎ]+$/.test(str),

  // 초성 검색
  searchChosung(text, term) {
    const termChosung = this.removeSpaces(term);
    const textChosung = Hangul.disassemble(this.removeSpaces(text), true)
      .map(char => char[0])
      .join('');
    return textChosung.includes(termChosung);
  },

  // 완전 일치 검색
  searchExactMatch(text, term) {
    const cleanText = this.removeSpaces(text);
    const cleanTerm = this.removeSpaces(term);
    return cleanText.includes(cleanTerm);
  },

  // 부분 일치 검색 (자모 분해 기반)
  searchPartialMatch(text, term) {
    const termDecomposed = Hangul.disassemble(this.removeSpaces(term)).join('');
    const textDecomposed = Hangul.disassemble(this.removeSpaces(text)).join('');
    return textDecomposed.includes(termDecomposed);
  },

  // 통합 검색: 초성/완전일치/부분일치 자동 판단
  search(text, term) {
    const normalizedTerm = this.normalizeText(term);
    if (!normalizedTerm) return false;

    const normalizedText = this.normalizeText(text);

    if (this.isChosung(normalizedTerm)) {
      return this.searchChosung(normalizedText, normalizedTerm);
    }

    return this.searchExactMatch(normalizedText, normalizedTerm) ||
           this.searchPartialMatch(normalizedText, normalizedTerm);
  }
};
