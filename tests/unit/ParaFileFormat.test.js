// tests/unit/ParaFileFormat.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const { ParaFileFormat, METADATA_DEFAULTS } = _require('../../src/store/utils/ParaFileFormat');

describe('ParaFileFormat', () => {

  // ═══════════════ parseMetaLine ═══════════════

  describe('parseMetaLine', () => {
    it('integral 메타데이터 파싱', () => {
      const result = ParaFileFormat.parseMetaLine('$integral{ image : test.jpg }');
      expect(result).toEqual({ scope: 'integral', key: 'image', value: 'test.jpg' });
    });

    it('page 메타데이터 파싱', () => {
      const result = ParaFileFormat.parseMetaLine('$page{ blackpoint : #1a1a1a }');
      expect(result).toEqual({ scope: 'page', key: 'blackpoint', value: '#1a1a1a' });
    });

    it('paragraph 메타데이터 파싱', () => {
      const result = ParaFileFormat.parseMetaLine('$paragraph{ align : center }');
      expect(result).toEqual({ scope: 'paragraph', key: 'align', value: 'center' });
    });

    it('일반 텍스트는 null 반환', () => {
      expect(ParaFileFormat.parseMetaLine('안녕하세요')).toBeNull();
      expect(ParaFileFormat.parseMetaLine('// 주석')).toBeNull();
      expect(ParaFileFormat.parseMetaLine('')).toBeNull();
      expect(ParaFileFormat.parseMetaLine('42')).toBeNull();
    });

    it('공백 포함 처리', () => {
      const result = ParaFileFormat.parseMetaLine('  $integral{  timestamp  :  1710000000  }  ');
      expect(result).toEqual({ scope: 'integral', key: 'timestamp', value: '1710000000' });
    });
  });

  // ═══════════════ isMetaLine ═══════════════

  describe('isMetaLine', () => {
    it('메타데이터 라인 식별', () => {
      expect(ParaFileFormat.isMetaLine('$integral{ image : test.jpg }')).toBe(true);
      expect(ParaFileFormat.isMetaLine('$page{ blackpoint : #000000 }')).toBe(true);
      expect(ParaFileFormat.isMetaLine('$paragraph{ align : left }')).toBe(true);
    });

    it('비-메타데이터 라인 거부', () => {
      expect(ParaFileFormat.isMetaLine('hello')).toBe(false);
      expect(ParaFileFormat.isMetaLine('// comment')).toBe(false);
      expect(ParaFileFormat.isMetaLine('$invalid{ key : val }')).toBe(false);
    });
  });

  // ═══════════════ formatMetaLine ═══════════════

  describe('formatMetaLine', () => {
    it('메타데이터 라인 생성', () => {
      expect(ParaFileFormat.formatMetaLine('integral', 'image', 'test.jpg'))
        .toBe('$integral{ image : test.jpg }');
    });

    it('null 값 직렬화', () => {
      expect(ParaFileFormat.formatMetaLine('integral', 'image', null))
        .toBe('$integral{ image : null }');
    });
  });

  // ═══════════════ parse ═══════════════

  describe('parse', () => {
    it('기본 .para 파일 파싱', () => {
      const content = [
        '$integral{ image : cover.jpg }',
        '$integral{ timestamp : 1710000000 }',
        '$integral{ encrypted : false }',
        '',
        '1',
        '$page{ blackpoint : #1a1a1a }',
        '',
        '첫 번째 대사',
        '$paragraph{ align : left }',
        '',
        '두 번째 대사',
        '$paragraph{ align : right }',
        '$paragraph{ style : 3 }'
      ].join('\n');

      const result = ParaFileFormat.parse(content);

      // 평문 검증
      expect(result.plainText).not.toContain('$integral');
      expect(result.plainText).not.toContain('$page');
      expect(result.plainText).not.toContain('$paragraph');
      expect(result.plainText).toContain('첫 번째 대사');
      expect(result.plainText).toContain('두 번째 대사');
      expect(result.plainText).toContain('1');

      // integral 메타데이터 검증
      expect(result.metadata.integral.image).toBe('cover.jpg');
      expect(result.metadata.integral.timestamp).toBe(1710000000);
      expect(result.metadata.integral.encrypted).toBe(false);

      // page 메타데이터 검증
      expect(result.metadata.pages.get(1)).toBeDefined();
      expect(result.metadata.pages.get(1).blackpoint).toBe('#1a1a1a');
    });

    it('메타데이터 없는 순수 텍스트 파싱', () => {
      const content = '1\n\n안녕하세요\n\n감사합니다';
      const result = ParaFileFormat.parse(content);

      expect(result.plainText).toBe(content);
      expect(result.metadata.integral.image).toBeNull();
    });

    it('주석이 포함된 파일 파싱', () => {
      const content = [
        '$integral{ timestamp : 1710000000 }',
        '',
        '1',
        '',
        '// 이것은 주석입니다',
        '대사 텍스트',
        '$paragraph{ align : center }'
      ].join('\n');

      const result = ParaFileFormat.parse(content);
      expect(result.plainText).toContain('// 이것은 주석입니다');
      expect(result.plainText).not.toContain('$integral');
      expect(result.plainText).not.toContain('$paragraph');
    });
  });

  // ═══════════════ serialize ═══════════════

  describe('serialize', () => {
    it('평문 + 메타데이터 → .para 형식 직렬화', () => {
      const plainText = '1\n\n첫 대사\n\n두 번째 대사';
      const metadata = {
        integral: { image: 'img.jpg', timestamp: 1710000000, encrypted: false },
        pages: new Map([[1, { blackpoint: '#1a1a1a' }]]),
        paragraphs: [
          { align: 'left', style: 'emphasis' },
          { align: 'right', style: 'plain' }
        ]
      };

      const result = ParaFileFormat.serialize(plainText, metadata);

      // integral 메타데이터가 최상단에 위치
      expect(result.startsWith('$integral{ image : img.jpg }')).toBe(true);
      expect(result).toContain('$integral{ timestamp : 1710000000 }');
      
      // page 메타데이터가 페이지 번호 뒤에 위치
      const lines = result.split('\n');
      const pageLineIdx = lines.indexOf('1');
      expect(lines[pageLineIdx + 1]).toBe('$page{ blackpoint : #1a1a1a }');

      // paragraph 메타데이터 포함
      expect(result).toContain('$paragraph{ align : left }');
      expect(result).toContain('$paragraph{ style : emphasis }');
    });

    it('빈 메타데이터로 직렬화', () => {
      const plainText = '안녕하세요';
      const metadata = {
        integral: { image: null, timestamp: 1710000000, encrypted: false },
        pages: new Map(),
        paragraphs: []
      };

      const result = ParaFileFormat.serialize(plainText, metadata);
      expect(result).toContain('$integral{ timestamp : 1710000000 }');
      expect(result).toContain('안녕하세요');
      expect(result).not.toContain('$page');
      expect(result).not.toContain('$paragraph');
    });
  });

  // ═══════════════ parse → serialize 왕복 ═══════════════

  describe('roundtrip', () => {
    it('파싱 후 재직렬화하면 평문이 보존됨', () => {
      const original = [
        '$integral{ timestamp : 1710000000 }',
        '',
        '1',
        '$page{ blackpoint : #1a1a1a }',
        '',
        '첫 번째 대사',
        '$paragraph{ align : center }',
        '',
        '두 번째 대사'
      ].join('\n');

      const parsed = ParaFileFormat.parse(original);
      const reserialized = ParaFileFormat.serialize(parsed.plainText, parsed.metadata);
      const reparsed = ParaFileFormat.parse(reserialized);

      expect(reparsed.plainText).toBe(parsed.plainText);
      expect(reparsed.metadata.integral.timestamp).toBe(1710000000);
      expect(reparsed.metadata.pages.get(1).blackpoint).toBe('#1a1a1a');
    });
  });

  // ═══════════════ stripMetadata ═══════════════

  describe('stripMetadata', () => {
    it('모든 메타데이터 라인 제거', () => {
      const content = [
        '$integral{ timestamp : 1710000000 }',
        '1',
        '$page{ blackpoint : #000000 }',
        '텍스트',
        '$paragraph{ align : center }'
      ].join('\n');

      const result = ParaFileFormat.stripMetadata(content);
      expect(result).toBe('1\n텍스트');
    });
  });

  // ═══════════════ 암호화 / 복호화 ═══════════════

  describe('encryption', () => {
    const sampleContent = [
      '$integral{ timestamp : 1710000000 }',
      '$integral{ encrypted : false }',
      '',
      '1',
      '$page{ blackpoint : #1a1a1a }',
      '',
      '비밀 데이터입니다.'
    ].join('\n');

    it('암호화 후 복호화하면 원문이 복원됨', () => {
      const password = 'test1234';
      const encrypted = ParaFileFormat.encrypt(sampleContent, password);
      
      // 암호화된 내용에 encrypted: true 포함
      expect(encrypted).toContain('$integral{ encrypted : true }');
      
      // 원문 텍스트가 보이지 않음
      expect(encrypted).not.toContain('비밀 데이터입니다');

      // 복호화
      const decrypted = ParaFileFormat.decrypt(encrypted, password);
      expect(decrypted.success).toBe(true);
      expect(decrypted.content).toContain('비밀 데이터입니다');
      expect(decrypted.content).toContain('$page{ blackpoint : #1a1a1a }');
    });

    it('잘못된 암호로 복호화 실패', () => {
      const encrypted = ParaFileFormat.encrypt(sampleContent, 'correct123');
      const result = ParaFileFormat.decrypt(encrypted, 'wrong123');
      expect(result.success).toBe(false);
    });

    it('4자 미만 암호는 거부', () => {
      expect(() => ParaFileFormat.encrypt(sampleContent, 'abc')).toThrow();
    });

    it('32자 초과 암호는 거부', () => {
      expect(() => ParaFileFormat.encrypt(sampleContent, 'a'.repeat(33))).toThrow();
    });
  });

  // ═══════════════ isEncrypted ═══════════════

  describe('isEncrypted', () => {
    it('암호화된 파일 식별', () => {
      const content = '$integral{ encrypted : true }\n암호화된내용';
      expect(ParaFileFormat.isEncrypted(content)).toBe(true);
    });

    it('비암호화 파일 식별', () => {
      const content = '$integral{ encrypted : false }\n평문';
      expect(ParaFileFormat.isEncrypted(content)).toBe(false);
    });

    it('메타데이터 없는 파일은 비암호화', () => {
      expect(ParaFileFormat.isEncrypted('일반 텍스트')).toBe(false);
    });
  });

  // ═══════════════ isParaFormat ═══════════════

  describe('isParaFormat', () => {
    it('.para 포맷 식별', () => {
      const content = '$integral{ timestamp : 1710000000 }\n텍스트';
      expect(ParaFileFormat.isParaFormat(content)).toBe(true);
    });

    it('순수 텍스트는 비-para 포맷', () => {
      expect(ParaFileFormat.isParaFormat('안녕하세요')).toBe(false);
      expect(ParaFileFormat.isParaFormat('1\n\n대사')).toBe(false);
    });
  });

  // ═══════════════ 헬퍼 함수들 ═══════════════

  describe('metadata helpers', () => {
    const metadata = {
      integral: { image: null, timestamp: 1710000000, encrypted: false },
      pages: new Map([
        [1, { blackpoint: '#1a1a1a' }],
        [2, { blackpoint: '#000000' }]
      ]),
      paragraphs: [
        { align: 'left', style: 'monologue' },
        { align: 'right', style: 'plain' }
      ]
    };

    it('getPageBlackPoint — 존재하는 페이지', () => {
      expect(ParaFileFormat.getPageBlackPoint(metadata, 1)).toBe('#1a1a1a');
    });

    it('getPageBlackPoint — 존재하지 않는 페이지 → 기본값', () => {
      expect(ParaFileFormat.getPageBlackPoint(metadata, 99)).toBe('#000000');
    });

    it('getParagraphAlign — 존재하는 단락', () => {
      expect(ParaFileFormat.getParagraphAlign(metadata, 0)).toBe('left');
      expect(ParaFileFormat.getParagraphAlign(metadata, 1)).toBe('right');
    });

    it('getParagraphAlign — 존재하지 않는 단락 → 기본값', () => {
      expect(ParaFileFormat.getParagraphAlign(metadata, 99)).toBe('center');
    });

    it('getParagraphStyle — 값 검증', () => {
      expect(ParaFileFormat.getParagraphStyle(metadata, 0)).toBe('monologue');
      expect(ParaFileFormat.getParagraphStyle(metadata, 99)).toBe('plain');
    });

    it('createDefaultMetadata — 기본 구조', () => {
      const defaults = ParaFileFormat.createDefaultMetadata();
      expect(defaults.integral.image).toBeNull();
      expect(defaults.integral.encrypted).toBe(false);
      expect(defaults.pages).toBeInstanceOf(Map);
      expect(defaults.paragraphs).toEqual([]);
    });
  });

  // ═══════════════ 값 역직렬화 ═══════════════

  describe('value deserialization', () => {
    it('null 값', () => {
      const result = ParaFileFormat.parse('$integral{ image : null }');
      expect(result.metadata.integral.image).toBeNull();
    });

    it('boolean 값', () => {
      const result = ParaFileFormat.parse('$integral{ encrypted : true }');
      expect(result.metadata.integral.encrypted).toBe(true);
    });

    it('timestamp 숫자 값', () => {
      const result = ParaFileFormat.parse('$integral{ timestamp : 1710000000 }');
      expect(result.metadata.integral.timestamp).toBe(1710000000);
    });

    it('align enum 검증', () => {
      const result = ParaFileFormat.parse('$integral{ timestamp : 0 }\n\n대사\n$paragraph{ align : invalid }');
      const paraMeta = result.metadata.paragraphs;
      // invalid는 기본값 center로 치환
      expect(paraMeta[0]?.align || 'center').toBe('center');
    });

    it('style 범위 검증', () => {
      const result = ParaFileFormat.parse('$integral{ timestamp : 0 }\n\n대사\n$paragraph{ style : 99 }');
      const paraMeta = result.metadata.paragraphs;
      // 범위 밖은 기본값 plain으로 치환
      expect(paraMeta[0]?.style || 'plain').toBe('plain');
    });
  });
});
