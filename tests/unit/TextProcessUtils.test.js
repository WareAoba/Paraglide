// tests/unit/TextProcessUtils.test.js
import { describe, it, expect } from 'vitest';

// TextProcessUtils는 CommonJS 모듈이므로 동적으로 로드
const { TextProcessUtils } = require('../../src/store/utils/TextProcessUtils');

// ═══════════════ extractPageNumber ═══════════════
describe('extractPageNumber', () => {
  it('숫자만 있는 경우 페이지 번호로 인식', () => {
    const result = TextProcessUtils.extractPageNumber('42');
    expect(result).toEqual({ start: 42, end: 42, display: '42 페이지' });
  });

  it('한글 스타일 (X페이지)', () => {
    const result = TextProcessUtils.extractPageNumber('5페이지');
    expect(result).toEqual({ start: 5, end: 5, display: '5 페이지' });
  });

  it('한글 스타일 (페이지X)', () => {
    const result = TextProcessUtils.extractPageNumber('페이지 10');
    expect(result).toEqual({ start: 10, end: 10, display: '10 페이지' });
  });

  it('한글 스타일 (X페)', () => {
    const result = TextProcessUtils.extractPageNumber('7페');
    expect(result).toEqual({ start: 7, end: 7, display: '7 페이지' });
  });

  it('영어 스타일 (page X)', () => {
    const result = TextProcessUtils.extractPageNumber('page 15');
    expect(result).toEqual({ start: 15, end: 15, display: '15 페이지' });
  });

  it('영어 스타일 (p X)', () => {
    const result = TextProcessUtils.extractPageNumber('p 3');
    expect(result).toEqual({ start: 3, end: 3, display: '3 페이지' });
  });

  it('영어 스타일 (Xp)', () => {
    const result = TextProcessUtils.extractPageNumber('20p');
    expect(result).toEqual({ start: 20, end: 20, display: '20 페이지' });
  });

  it('합페이지 범위 (X-Y)', () => {
    const result = TextProcessUtils.extractPageNumber('10-11');
    expect(result).toEqual({ start: 10, end: 11, display: '10-11 페이지' });
  });

  it('합페이지 범위 (X~Y페이지)', () => {
    const result = TextProcessUtils.extractPageNumber('5~6페이지');
    expect(result).toEqual({ start: 5, end: 6, display: '5-6 페이지' });
  });

  it('합페이지 범위 (page X-Y)', () => {
    const result = TextProcessUtils.extractPageNumber('page 3-4');
    expect(result).toEqual({ start: 3, end: 4, display: '3-4 페이지' });
  });

  it('일반 텍스트는 null 반환', () => {
    expect(TextProcessUtils.extractPageNumber('안녕하세요')).toBeNull();
  });

  it('빈 문자열은 null 반환', () => {
    expect(TextProcessUtils.extractPageNumber('')).toBeNull();
  });
});

// ═══════════════ shouldSkipParagraph ═══════════════
describe('shouldSkipParagraph', () => {
  it('구분선(===)은 건너뜀', () => {
    expect(TextProcessUtils.shouldSkipParagraph('===')).toBe(true);
  });

  it('구분선(---)은 건너뜀', () => {
    expect(TextProcessUtils.shouldSkipParagraph('---')).toBe(true);
  });

  it('긴 구분선도 건너뜀', () => {
    expect(TextProcessUtils.shouldSkipParagraph('==================')).toBe(true);
  });

  it('주석(// 시작)은 shouldSkipParagraph에서 건너뛰지 않음 (별도 처리)', () => {
    expect(TextProcessUtils.shouldSkipParagraph('// 이것은 주석')).toBe(false);
  });

  it('#으로 시작하는 줄은 건너뜀', () => {
    expect(TextProcessUtils.shouldSkipParagraph('# 헤더')).toBe(true);
  });

  it('일반 텍스트는 건너뛰지 않음', () => {
    expect(TextProcessUtils.shouldSkipParagraph('일반 텍스트입니다.')).toBe(false);
  });

  it('공백 포함 구분선은 건너뜀', () => {
    expect(TextProcessUtils.shouldSkipParagraph('  ---  ')).toBe(true);
  });
});

// ═══════════════ processParagraphs (paragraph mode) ═══════════════
describe('processParagraphs - paragraph mode', () => {
  it('빈 줄로 구분된 단락을 분할', () => {
    const content = '첫 번째 단락입니다.\n\n두 번째 단락입니다.';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsToDisplay).toEqual([
      '첫 번째 단락입니다.',
      '두 번째 단락입니다.'
    ]);
    expect(result.paragraphsMetadata).toHaveLength(2);
  });

  it('페이지 번호는 단락에 포함되지 않음', () => {
    const content = '1\n\n첫 번째 단락\n\n2\n\n두 번째 단락';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsToDisplay).toEqual([
      '첫 번째 단락',
      '두 번째 단락'
    ]);
  });

  it('페이지 번호가 메타데이터에 올바르게 할당됨', () => {
    const content = '1\n\n첫 번째 단락\n\n2\n\n두 번째 단락';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsMetadata[0].pageNumber).toBe(1);
    expect(result.paragraphsMetadata[1].pageNumber).toBe(2);
  });

  it('구분선은 무시됨', () => {
    const content = '텍스트A\n\n===\n\n텍스트B';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsToDisplay).toEqual(['텍스트A', '텍스트B']);
  });

  it('여러 줄로 이루어진 단락', () => {
    const content = '줄1\n줄2\n줄3\n\n다른 단락';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsToDisplay).toEqual([
      '줄1\n줄2\n줄3',
      '다른 단락'
    ]);
  });

  it('연속된 빈 줄은 하나로 취급', () => {
    const content = '단락A\n\n\n\n단락B';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsToDisplay).toEqual(['단락A', '단락B']);
  });

  it('빈 내용은 빈 배열 반환', () => {
    const result = TextProcessUtils.processParagraphs('', 'paragraph');
    expect(result.paragraphsToDisplay).toEqual([]);
  });

  it('합페이지 번호가 있는 경우', () => {
    const content = '10-11\n\n합페이지 단락 내용';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsMetadata[0].pageInfo).toEqual({
      start: 10, end: 11, display: '10-11 페이지'
    });
  });

  it('첫 시작이 주석이면 아래 단락에 적용', () => {
    const content = '// 주석입니다\n\n본문 단락';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsToDisplay).toEqual(['본문 단락']);
    expect(result.paragraphsMetadata[0].comments).toEqual(['주석입니다']);
  });

  it('여러 주석이 하나의 단락에 연결됨', () => {
    const content = '// 첫 번째 주석\n// 두 번째 주석\n\n본문';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsMetadata[0].comments).toEqual(['첫 번째 주석', '두 번째 주석']);
  });

  it('주석이 없는 단락의 comments는 null', () => {
    const content = '주석 없는 단락';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsMetadata[0].comments).toBeNull();
  });

  it('단락 아래 붙은 주석은 해당 단락의 comments', () => {
    const content = '단락A\n// 메모\n\n단락B';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsMetadata[0].comments).toEqual(['메모']);
    expect(result.paragraphsMetadata[1].comments).toBeNull();
  });

  it('빈 줄로 분리된 주석은 윗 단락에 부착', () => {
    const content = '단락A\n\n// 주석\n\n단락B';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsMetadata[0].comments).toEqual(['주석']);
    expect(result.paragraphsMetadata[1].comments).toBeNull();
  });
});

// ═══════════════ processParagraphs (line mode) ═══════════════
describe('processParagraphs - line mode', () => {
  it('각 줄을 개별 단위로 분할', () => {
    const content = '줄1\n줄2\n줄3';
    const result = TextProcessUtils.processParagraphs(content, 'line');
    expect(result.paragraphsToDisplay).toEqual(['줄1', '줄2', '줄3']);
  });

  it('빈 줄은 무시됨', () => {
    const content = '줄1\n\n줄2\n\n줄3';
    const result = TextProcessUtils.processParagraphs(content, 'line');
    expect(result.paragraphsToDisplay).toEqual(['줄1', '줄2', '줄3']);
  });

  it('페이지 번호는 줄에서 제외됨', () => {
    const content = '1\n본문A\n2\n본문B';
    const result = TextProcessUtils.processParagraphs(content, 'line');
    expect(result.paragraphsToDisplay).toEqual(['본문A', '본문B']);
    expect(result.paragraphsMetadata[0].pageNumber).toBe(1);
    expect(result.paragraphsMetadata[1].pageNumber).toBe(2);
  });

  it('// 주석은 바로 위 줄의 comments에 저장됨 (line 모드)', () => {
    const content = '본문줄\n// 메모';
    const result = TextProcessUtils.processParagraphs(content, 'line');
    expect(result.paragraphsToDisplay).toEqual(['본문줄']);
    expect(result.paragraphsMetadata[0].comments).toEqual(['메모']);
  });

  it('한줄 모드 첫 시작이 주석이면 아래 단락에 적용', () => {
    const content = '// 첫주석\n본문줄';
    const result = TextProcessUtils.processParagraphs(content, 'line');
    expect(result.paragraphsToDisplay).toEqual(['본문줄']);
    expect(result.paragraphsMetadata[0].comments).toEqual(['첫주석']);
  });

  it('한줄 모드 첫 시작 예외 이후에는 위 단락에 적용', () => {
    const content = '// 첫주석\n줄A\n// 줄A의 메모\n줄B';
    const result = TextProcessUtils.processParagraphs(content, 'line');
    expect(result.paragraphsToDisplay).toEqual(['줄A', '줄B']);
    expect(result.paragraphsMetadata[0].comments).toEqual(['첫주석', '줄A의 메모']);
    expect(result.paragraphsMetadata[1].comments).toBeNull();
  });
});

// ═══════════════ CRLF 처리 ═══════════════
describe('CRLF 처리', () => {
  it('\\r\\n을 \\n으로 정규화', () => {
    const content = '줄1\r\n\r\n줄2';
    const result = TextProcessUtils.processParagraphs(content, 'paragraph');
    expect(result.paragraphsToDisplay).toEqual(['줄1', '줄2']);
  });
});

// ═══════════════ detectLineMode ═══════════════
describe('detectLineMode', () => {
  it('긴 줄이 5개 이상이면 true', () => {
    // 21자 이상의 줄 5개
    const content = Array(5).fill('가나다라마바사아자차카타파하마바사아자차카').join('\n');
    expect(TextProcessUtils.detectLineMode(content)).toBe(true);
  });

  it('긴 줄이 5개 미만이면 false', () => {
    const content = '짧은 줄\n두번째 줄\n세번째 줄\n네번째 줄';
    expect(TextProcessUtils.detectLineMode(content)).toBe(false);
  });

  it('빈 내용은 false', () => {
    expect(TextProcessUtils.detectLineMode('')).toBe(false);
  });
});

// ═══════════════ mapPositionBetweenModes ═══════════════
describe('mapPositionBetweenModes', () => {
  it('paragraph → line 변환 시 가장 가까운 라인 인덱스 반환', () => {
    const oldMetadata = [{ startPos: 0, endPos: 20 }, { startPos: 22, endPos: 40 }];
    const newMetadata = [
      { startPos: 0 }, { startPos: 5 }, { startPos: 10 },
      { startPos: 22 }, { startPos: 30 }
    ];
    const result = TextProcessUtils.mapPositionBetweenModes(1, oldMetadata, newMetadata, 'paragraph', 'line');
    expect(result).toBe(3); // startPos 22와 가장 가까운 인덱스
  });

  it('line → paragraph 변환 시 해당 라인이 포함된 단락 반환', () => {
    const oldMetadata = [{ startPos: 5 }, { startPos: 25 }];
    const newMetadata = [{ startPos: 0, endPos: 20 }, { startPos: 22, endPos: 40 }];
    const result = TextProcessUtils.mapPositionBetweenModes(0, oldMetadata, newMetadata, 'line', 'paragraph');
    expect(result).toBe(0); // startPos 5는 단락0(0~20) 범위 내
  });

  it('잘못된 인덱스는 0 반환', () => {
    expect(TextProcessUtils.mapPositionBetweenModes(99, [], [], 'paragraph', 'line')).toBe(0);
  });
});

// ═══════════════ getParagraphByOffset ═══════════════
describe('getParagraphByOffset', () => {
  const mockState = {
    paragraphs: ['단락A', '단락B', '단락C'],
    paragraphsMetadata: [
      { pageNumber: 1, index: 0 },
      { pageNumber: 1, index: 1 },
      { pageNumber: 2, index: 2 }
    ]
  };

  it('다음 단락 가져오기', () => {
    const result = TextProcessUtils.getParagraphByOffset(mockState, 0, 1);
    expect(result.text).toBe('단락B');
  });

  it('이전 단락 가져오기', () => {
    const result = TextProcessUtils.getParagraphByOffset(mockState, 2, -1);
    expect(result.text).toBe('단락B');
  });

  it('범위 초과 시 null 반환', () => {
    expect(TextProcessUtils.getParagraphByOffset(mockState, 0, -1)).toBeNull();
    expect(TextProcessUtils.getParagraphByOffset(mockState, 2, 1)).toBeNull();
  });

  it('metadata의 pageNumber 반환', () => {
    const result = TextProcessUtils.getParagraphByOffset(mockState, 2, 0);
    expect(result.metadata.pageNumber).toBe(2);
  });
});
