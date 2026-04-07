// tests/unit/SearchUtils.test.js
import { describe, it, expect } from 'vitest';
import { SearchUtils } from '../../src/utils/SearchUtils';

// ═══════════════ removeSpaces ═══════════════
describe('removeSpaces', () => {
  it('공백 제거', () => {
    expect(SearchUtils.removeSpaces('안녕 하세요')).toBe('안녕하세요');
  });

  it('연속 공백 제거', () => {
    expect(SearchUtils.removeSpaces('a   b  c')).toBe('abc');
  });

  it('탭/개행 제거', () => {
    expect(SearchUtils.removeSpaces('a\tb\nc')).toBe('abc');
  });

  it('빈 문자열', () => {
    expect(SearchUtils.removeSpaces('')).toBe('');
  });
});

// ═══════════════ normalizeText ═══════════════
describe('normalizeText', () => {
  it('양쪽 공백 제거 + 소문자 변환', () => {
    expect(SearchUtils.normalizeText('  Hello World  ')).toBe('hello world');
  });

  it('한글은 변환 없이 trim만', () => {
    expect(SearchUtils.normalizeText('  안녕하세요  ')).toBe('안녕하세요');
  });

  it('빈 문자열', () => {
    expect(SearchUtils.normalizeText('')).toBe('');
  });
});

// ═══════════════ isChosung ═══════════════
describe('isChosung', () => {
  it('초성만 있으면 true', () => {
    expect(SearchUtils.isChosung('ㄱ')).toBe(true);
    expect(SearchUtils.isChosung('ㄱㄴㄷ')).toBe(true);
    expect(SearchUtils.isChosung('ㅎㅎ')).toBe(true);
  });

  it('완성형 한글이면 false', () => {
    expect(SearchUtils.isChosung('가')).toBe(false);
    expect(SearchUtils.isChosung('ㄱ가')).toBe(false);
  });

  it('영문이면 false', () => {
    expect(SearchUtils.isChosung('abc')).toBe(false);
  });

  it('빈 문자열이면 false', () => {
    expect(SearchUtils.isChosung('')).toBe(false);
  });
});

// ═══════════════ searchChosung (초성 검색) ═══════════════
describe('searchChosung', () => {
  it('초성이 일치하면 true', () => {
    expect(SearchUtils.searchChosung('안녕하세요', 'ㅇㄴ')).toBe(true);
  });

  it('초성이 일치하지 않으면 false', () => {
    expect(SearchUtils.searchChosung('안녕하세요', 'ㄱㄴ')).toBe(false);
  });

  it('전체 초성 일치', () => {
    expect(SearchUtils.searchChosung('프로그램', 'ㅍㄹㄱㄹ')).toBe(true);
  });

  it('중간 부분 초성 일치', () => {
    expect(SearchUtils.searchChosung('단락 분할 처리', 'ㅂㅎ')).toBe(true);
  });

  it('공백 무시하고 검색', () => {
    expect(SearchUtils.searchChosung('안 녕 하 세 요', 'ㅇㄴ')).toBe(true);
  });
});

// ═══════════════ searchExactMatch (완전 일치 검색) ═══════════════
describe('searchExactMatch', () => {
  it('정확히 포함되면 true', () => {
    expect(SearchUtils.searchExactMatch('안녕하세요 반갑습니다', '안녕')).toBe(true);
  });

  it('포함되지 않으면 false', () => {
    expect(SearchUtils.searchExactMatch('안녕하세요', '감사')).toBe(false);
  });

  it('공백 무시하고 검색', () => {
    expect(SearchUtils.searchExactMatch('안 녕 하세요', '안녕')).toBe(true);
  });

  it('영문 검색', () => {
    expect(SearchUtils.searchExactMatch('Hello World', 'world')).toBe(false); // 대소문자 구분
    expect(SearchUtils.searchExactMatch('Hello World', 'World')).toBe(true);
  });

  it('빈 검색어는 true (includes 동작)', () => {
    expect(SearchUtils.searchExactMatch('텍스트', '')).toBe(true);
  });
});

// ═══════════════ searchPartialMatch (부분 일치 / 자모 분해 검색) ═══════════════
describe('searchPartialMatch', () => {
  it('완성되지 않은 한글도 검색 (자모 분해)', () => {
    // '안녕ㅎ' → 'ㅇㅏㄴㄴㅕㅇㅎ' 로 분해하여 '안녕하세요'에서 매칭
    expect(SearchUtils.searchPartialMatch('안녕하세요', '안녕ㅎ')).toBe(true);
  });

  it('완전한 글자도 부분 일치', () => {
    expect(SearchUtils.searchPartialMatch('프로그램 테스트', '프로그')).toBe(true);
  });

  it('일치하지 않으면 false', () => {
    expect(SearchUtils.searchPartialMatch('안녕하세요', '감사합')).toBe(false);
  });

  it('자음만 입력 시 부분 일치 시도', () => {
    // 'ㅍㄹ' 분해 → 'ㅍㄹ', '프로그램' 분해 → 'ㅍㅡㄹㅗㄱㅡㄹㅏㅁ'
    // 'ㅍㄹ'이 연속으로 나타나지 않으므로 false
    expect(SearchUtils.searchPartialMatch('프로그램', 'ㅍㄹ')).toBe(false);
  });

  it('공백 무시하고 검색', () => {
    expect(SearchUtils.searchPartialMatch('단 락 분 할', '단락')).toBe(true);
  });
});

// ═══════════════ search (통합 검색) ═══════════════
describe('search (통합)', () => {
  it('초성으로 판단되면 초성 검색 수행', () => {
    expect(SearchUtils.search('안녕하세요', 'ㅇㄴ')).toBe(true);
    expect(SearchUtils.search('안녕하세요', 'ㄱㄴ')).toBe(false);
  });

  it('완성형 한글이면 완전일치 → 부분일치 순서로 시도', () => {
    expect(SearchUtils.search('프로그래밍 테스트', '프로그')).toBe(true);
  });

  it('영문 검색 (소문자로 정규화)', () => {
    expect(SearchUtils.search('Hello World', 'hello')).toBe(true);
    expect(SearchUtils.search('Hello World', 'WORLD')).toBe(true);
  });

  it('빈 검색어는 false', () => {
    expect(SearchUtils.search('텍스트', '')).toBe(false);
    expect(SearchUtils.search('텍스트', '   ')).toBe(false);
  });

  it('검색어가 텍스트보다 길면 false', () => {
    expect(SearchUtils.search('짧', '이것은 매우 긴 검색어입니다')).toBe(false);
  });

  it('특수문자 포함 검색', () => {
    expect(SearchUtils.search('버전 0.3.1-beta', '0.3.1')).toBe(true);
  });

  it('초성 한 글자도 동작', () => {
    // isChosung은 true지만, search에서 normalizeText 후 검색
    expect(SearchUtils.search('가나다라', 'ㄱ')).toBe(true);
    expect(SearchUtils.search('마바사아', 'ㄱ')).toBe(false);
  });
});
