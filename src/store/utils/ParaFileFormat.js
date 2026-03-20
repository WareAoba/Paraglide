// src/store/utils/ParaFileFormat.js
// .para 파일 포맷 처리 — 메타데이터 파싱/직렬화, 암호화/복호화
//
// .para 포맷 구조:
//   $integral{ image: filename.jpg }
//   $integral{ timestamp: 1710000000000 }
//   $integral{ encrypted: false }
//   
//   1
//   $page{ blackpoint: #1a1a1a }
//   
//   대사 텍스트
//   $paragraph{ align: center }
//   $paragraph{ style: plain }
//
// 메타데이터 문법: $<scope>{ <key> : <value> }
//   scope: integral | page | paragraph

const crypto = require('crypto');

// ─── 스타일 이름 상수 (순서 고정, 협업 호환) ───
const STYLE_NAMES = [
  'plain', 'emphasis', 'monologue', 'thought', 'announce',
  'excited', 'surprise', 'angry', 'custom1', 'custom2'
];

// ─── 메타데이터 기본값 ───
const METADATA_DEFAULTS = {
  integral: {
    image: null,
    timestamp: null,     // 저장 시 현재 시각으로 기록
    encrypted: false
  },
  page: {
    blackpoint: '#000000'
  },
  paragraph: {
    align: 'center',
    style: 'plain'
  }
};

// 메타데이터 라인 패턴: $scope{ key : value }
const META_LINE_REGEX = /^\$\s*(integral|page|paragraph)\s*\{\s*(.+?)\s*:\s*(.+?)\s*\}$/;

const ParaFileFormat = {

  // ═══════════════ 메타데이터 파싱 ═══════════════

  /**
   * 단일 라인이 메타데이터 라인인지 판별한다.
   * @param {string} line - 트리밍된 라인
   * @returns {{ scope: string, key: string, value: string } | null}
   */
  parseMetaLine(line) {
    const trimmed = line.trim();
    const match = trimmed.match(META_LINE_REGEX);
    if (!match) return null;
    return {
      scope: match[1],
      key: match[2].trim().toLowerCase(),
      value: match[3].trim()
    };
  },

  /**
   * 메타데이터 라인인지만 확인 (boolean)
   */
  isMetaLine(line) {
    return META_LINE_REGEX.test(line.trim());
  },

  /**
   * 메타데이터 값을 직렬화한다.
   * @param {string} scope - 'integral' | 'page' | 'paragraph'
   * @param {string} key
   * @param {*} value
   * @returns {string} 메타데이터 라인 문자열
   */
  formatMetaLine(scope, key, value) {
    const strValue = value === null ? 'null' : String(value);
    return `$${scope}{ ${key} : ${strValue} }`;
  },

  /**
   * .para 파일 전체를 파싱하여 평문 + 메타데이터를 분리한다.
   * 
   * @param {string} content - .para 파일 원문
   * @returns {{
   *   plainText: string,
   *   metadata: {
   *     integral: Object,
   *     pages: Map<number, Object>,
   *     paragraphs: Array<Object>
   *   }
   * }}
   */
  parse(content) {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    
    const integralMeta = { ...METADATA_DEFAULTS.integral };
    const pagesMeta = new Map();        // pageNumber → { blackpoint, ... }
    const paragraphsMeta = [];          // 순서대로 수집, 나중에 매핑
    
    const plainLines = [];
    let currentPageNumber = null;
    let currentParagraphIndex = 0;      // 평문 단락 카운터
    let inParagraph = false;

    // TextProcessUtils의 페이지 패턴 재사용
    const pagePatterns = {
      numberOnly: /^(\d+)$/,
      koreanStyle: /^(?:\d+\s*(?:페이지|페)|(?:페이지|페)\s*\d+)$/,
      englishStyle: /^(?:\d+\s*(?:page|p)|(?:page|p)\s*\d+)$/i,
      rangeStyle: /^(?:(?:페이지|페|page|p)\s*)?(\d+)\s*[-~]+\s*(\d+)(?:\s*(?:페이지|페|page|p))?$/i
    };

    const extractPageNumber = (text) => {
      const trimmed = text.trim();
      // 범위
      const rangeMatch = trimmed.match(pagePatterns.rangeStyle);
      if (rangeMatch) return parseInt(rangeMatch[1]);
      // 단일
      for (const pattern of [pagePatterns.numberOnly, pagePatterns.koreanStyle, pagePatterns.englishStyle]) {
        if (pattern.test(trimmed)) {
          const nums = trimmed.match(/\d+/);
          if (nums) return parseInt(nums[0]);
        }
      }
      return null;
    };

    const isCommentLine = (line) => /^\/\//.test(line.trim());
    const isSkipLine = (line) => /^[=\-]{3,}/.test(line.trim()) || /^#/.test(line.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 메타데이터 라인 처리
      const meta = this.parseMetaLine(trimmed);
      if (meta) {
        switch (meta.scope) {
          case 'integral': {
            const val = this._deserializeValue(meta.key, meta.value, 'integral');
            if (val !== undefined) integralMeta[meta.key] = val;
            break;
          }
          case 'page':
            if (currentPageNumber !== null) {
              if (!pagesMeta.has(currentPageNumber)) {
                pagesMeta.set(currentPageNumber, { ...METADATA_DEFAULTS.page });
              }
              const pageVal = this._deserializeValue(meta.key, meta.value, 'page');
              if (pageVal !== undefined) pagesMeta.get(currentPageNumber)[meta.key] = pageVal;
            }
            break;
          case 'paragraph': {
            // paragraph 메타는 직전 단락(또는 현재 빌딩 중인 단락)에 부착
            const targetIndex = inParagraph ? currentParagraphIndex : Math.max(0, currentParagraphIndex - 1);
            if (!paragraphsMeta[targetIndex]) {
              paragraphsMeta[targetIndex] = { ...METADATA_DEFAULTS.paragraph };
            }
            const paraVal = this._deserializeValue(meta.key, meta.value, 'paragraph');
            if (paraVal !== undefined) paragraphsMeta[targetIndex][meta.key] = paraVal;
            break;
          }
        }
        continue; // 메타데이터 라인은 평문에 포함하지 않음
      }

      // 일반 라인 → 평문에 포함
      plainLines.push(line);

      // 페이지 번호 추적 (평문 내에서)
      if (trimmed && !isCommentLine(trimmed) && !isSkipLine(trimmed)) {
        const pageNum = extractPageNumber(trimmed);
        if (pageNum !== null) {
          currentPageNumber = pageNum;
          inParagraph = false;
        } else if (trimmed) {
          // 내용 라인 → 단락 시작 체크
          if (!inParagraph) {
            inParagraph = true;
          }
        }
      }

      // 빈 줄은 단락 경계
      if (!trimmed && inParagraph) {
        currentParagraphIndex++;
        inParagraph = false;
      }
    }

    // 마지막 단락 카운팅
    if (inParagraph) {
      currentParagraphIndex++;
    }

    return {
      plainText: plainLines.join('\n'),
      metadata: {
        integral: integralMeta,
        pages: pagesMeta,
        paragraphs: paragraphsMeta
      }
    };
  },

  /**
   * 평문과 메타데이터를 결합하여 .para 형식으로 직렬화한다.
   * 
   * @param {string} plainText - 평문 (메타데이터 제거된 순수 텍스트)
   * @param {Object} metadata - { integral, pages, paragraphs }
   * @returns {string} .para 포맷 문자열
   */
  serialize(plainText, metadata) {
    const lines = plainText.replace(/\r\n/g, '\n').split('\n');
    const output = [];

    const integral = metadata.integral || {};
    const pages = metadata.pages || new Map();
    const paragraphs = metadata.paragraphs || [];

    // ── integral 메타데이터 (파일 최상단, 모든 필드 항상 기록) ──
    output.push(this.formatMetaLine('integral', 'image', integral.image));
    output.push(this.formatMetaLine('integral', 'timestamp', integral.timestamp || Date.now()));
    output.push(this.formatMetaLine('integral', 'encrypted', !!integral.encrypted));

    // TextProcessUtils의 패턴 재사용
    const pagePatterns = {
      numberOnly: /^(\d+)$/,
      koreanStyle: /^(?:\d+\s*(?:페이지|페)|(?:페이지|페)\s*\d+)$/,
      englishStyle: /^(?:\d+\s*(?:page|p)|(?:page|p)\s*\d+)$/i,
      rangeStyle: /^(?:(?:페이지|페|page|p)\s*)?(\d+)\s*[-~]+\s*(\d+)(?:\s*(?:페이지|페|page|p))?$/i
    };

    const extractPageNumber = (text) => {
      const trimmed = text.trim();
      const rangeMatch = trimmed.match(pagePatterns.rangeStyle);
      if (rangeMatch) return parseInt(rangeMatch[1]);
      for (const pattern of [pagePatterns.numberOnly, pagePatterns.koreanStyle, pagePatterns.englishStyle]) {
        if (pattern.test(trimmed)) {
          const nums = trimmed.match(/\d+/);
          if (nums) return parseInt(nums[0]);
        }
      }
      return null;
    };

    const isCommentLine = (line) => /^\/\//.test(line.trim());
    const isSkipLine = (line) => /^[=\-]{3,}/.test(line.trim()) || /^#/.test(line.trim());

    let paragraphIndex = 0;
    let inParagraph = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      output.push(line);

      // 페이지 번호 라인 뒤에 page 메타데이터 삽입
      if (trimmed && !isCommentLine(trimmed) && !isSkipLine(trimmed)) {
        const pageNum = extractPageNumber(trimmed);
        if (pageNum !== null) {
          // 페이지 번호 바로 아래에 page 메타데이터
          const pageMeta = pages instanceof Map ? pages.get(pageNum) : pages[pageNum];
          if (pageMeta) {
            for (const [key, value] of Object.entries(pageMeta)) {
              if (value !== undefined && value !== null) {
                output.push(this.formatMetaLine('page', key, value));
              }
            }
          }
          inParagraph = false;
        } else if (trimmed && !isCommentLine(trimmed)) {
          // 내용 라인
          if (!inParagraph) {
            inParagraph = true;
          }
        }
      }

      // 빈 줄 → 단락 종료 → paragraph 메타데이터 삽입
      if (!trimmed && inParagraph) {
        // 빈 줄 직전에 paragraph 메타데이터 삽입
        const paraMeta = paragraphs[paragraphIndex];
        if (paraMeta) {
          const metaLines = [];
          for (const [key, value] of Object.entries(paraMeta)) {
            if (value !== undefined) {
              metaLines.push(this.formatMetaLine('paragraph', key, value));
            }
          }
          if (metaLines.length > 0) {
            // 빈 줄을 꺼내고 메타데이터 → 빈 줄 순서로 재삽입
            output.pop(); // 빈 줄 제거
            metaLines.forEach(ml => output.push(ml));
            output.push(''); // 빈 줄 복원
          }
        }
        paragraphIndex++;
        inParagraph = false;
      }
    }

    // 마지막 단락 (파일 끝에 빈 줄 없이 끝날 때)
    if (inParagraph) {
      const paraMeta = paragraphs[paragraphIndex];
      if (paraMeta) {
        for (const [key, value] of Object.entries(paraMeta)) {
          if (value !== undefined) {
            output.push(this.formatMetaLine('paragraph', key, value));
          }
        }
      }
    }

    return output.join('\n');
  },

  // ═══════════════ 암호화 / 복호화 ═══════════════

  /**
   * .para 파일 내용을 암호화한다.
   * integral 섹션은 유지하며, 그 아래의 모든 내용을 AES-256-CBC로 암호화한다.
   * 
   * 흐름: plaintext → Base64 인코딩 → AES-256-CBC 암호화
   * 
   * @param {string} paraContent - 완전한 .para 형식 문자열
   * @param {string} password - 4~32자리 암호
   * @returns {string} 암호화된 .para 형식 문자열
   */
  encrypt(paraContent, password) {
    if (password.length < 4 || password.length > 32) {
      throw new Error('암호는 4~32자 사이여야 합니다.');
    }

    const lines = paraContent.split('\n');
    const integralLines = [];
    let bodyStartIndex = 0;

    // integral 메타데이터 라인 분리
    for (let i = 0; i < lines.length; i++) {
      const meta = this.parseMetaLine(lines[i].trim());
      if (meta && meta.scope === 'integral') {
        integralLines.push(lines[i]);
        bodyStartIndex = i + 1;
      } else if (lines[i].trim() === '') {
        // integral 뒤의 빈 줄은 건너뜀
        if (integralLines.length > 0) {
          bodyStartIndex = i + 1;
        }
      } else {
        break;
      }
    }

    // 본문 추출
    const bodyContent = lines.slice(bodyStartIndex).join('\n');

    // Base64 인코딩 → AES 암호화
    const base64Body = Buffer.from(bodyContent, 'utf8').toString('base64');
    const encrypted = this._aesEncrypt(base64Body, password);

    // encrypted 플래그 업데이트
    const hasEncryptedMeta = integralLines.some(l => {
      const m = this.parseMetaLine(l.trim());
      return m && m.key === 'encrypted';
    });
    
    const outputIntegral = [];
    for (const line of integralLines) {
      const m = this.parseMetaLine(line.trim());
      if (m && m.key === 'encrypted') {
        outputIntegral.push(this.formatMetaLine('integral', 'encrypted', 'true'));
      } else {
        outputIntegral.push(line);
      }
    }
    if (!hasEncryptedMeta) {
      outputIntegral.push(this.formatMetaLine('integral', 'encrypted', 'true'));
    }

    return outputIntegral.join('\n') + '\n' + encrypted;
  },

  /**
   * 암호화된 .para 파일을 복호화한다.
   * 
   * @param {string} paraContent - 암호화된 .para 형식 문자열
   * @param {string} password - 암호
   * @returns {{ success: boolean, content: string, error?: string }}
   */
  decrypt(paraContent, password) {
    const lines = paraContent.split('\n');
    const integralLines = [];
    let bodyStartIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const meta = this.parseMetaLine(lines[i].trim());
      if (meta && meta.scope === 'integral') {
        integralLines.push(lines[i]);
        bodyStartIndex = i + 1;
      } else if (lines[i].trim() === '') {
        if (integralLines.length > 0) {
          bodyStartIndex = i + 1;
        }
      } else {
        break;
      }
    }

    const encryptedBody = lines.slice(bodyStartIndex).join('\n').trim();

    try {
      // AES 복호화 → Base64 디코딩
      const base64Body = this._aesDecrypt(encryptedBody, password);
      const bodyContent = Buffer.from(base64Body, 'base64').toString('utf8');

      // encrypted 플래그를 false로 업데이트
      const outputIntegral = integralLines.map(line => {
        const m = this.parseMetaLine(line.trim());
        if (m && m.key === 'encrypted') {
          return this.formatMetaLine('integral', 'encrypted', 'false');
        }
        return line;
      });

      return {
        success: true,
        content: outputIntegral.join('\n') + '\n' + bodyContent
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: '복호화 실패: 잘못된 암호이거나 파일이 손상되었습니다.'
      };
    }
  },

  /**
   * .para 파일이 암호화되어 있는지 확인한다.
   * @param {string} content - 파일 내용
   * @returns {boolean}
   */
  isEncrypted(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      const meta = this.parseMetaLine(line.trim());
      if (!meta) {
        if (line.trim() === '') continue;
        break; // integral이 아닌 내용이 시작되면 중단
      }
      if (meta.scope === 'integral' && meta.key === 'encrypted') {
        return meta.value.toLowerCase() === 'true';
      }
    }
    return false;
  },

  /**
   * 파일이 .para 포맷인지 확인한다.
   * integral 메타데이터가 하나라도 있으면 .para로 간주한다.
   * @param {string} content
   * @returns {boolean}
   */
  isParaFormat(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      const meta = this.parseMetaLine(line.trim());
      if (meta && meta.scope === 'integral') return true;
      if (line.trim() !== '' && !meta) return false;
    }
    return false;
  },

  // ═══════════════ 메타데이터 조작 헬퍼 ═══════════════

  /**
   * 빈 metadata 구조를 생성한다 (기본값 포함).
   */
  createDefaultMetadata() {
    return {
      integral: {
        image: null,
        timestamp: Date.now(),
        encrypted: false
      },
      pages: new Map(),
      paragraphs: []
    };
  },

  /**
   * 평문에서 자동으로 메타데이터 구조를 생성한다.
   * txt 파일을 로드할 때 사용.
   * 
   * @param {string} plainText
   * @param {Object} [options] - { blackPointPerPage: Map, ... }
   * @returns {Object} metadata
   */
  createMetadataFromPlainText(plainText, options = {}) {
    const metadata = this.createDefaultMetadata();
    
    // 블랙포인트 정보가 있으면 페이지별로 설정
    if (options.blackPointPerPage) {
      for (const [pageNum, bpInfo] of options.blackPointPerPage) {
        metadata.pages.set(pageNum, {
          blackpoint: bpInfo.blackPoint?.hex || '#000000'
        });
      }
    }

    return metadata;
  },

  /**
   * 특정 페이지의 블랙포인트를 가져온다.
   * 해당 페이지에 메타데이터가 없으면 기본값 (#000000) 반환.
   * 
   * @param {Object} metadata
   * @param {number} pageNumber
   * @returns {string} hex color
   */
  getPageBlackPoint(metadata, pageNumber) {
    if (!metadata || !metadata.pages) return METADATA_DEFAULTS.page.blackpoint;
    const pageMeta = metadata.pages instanceof Map 
      ? metadata.pages.get(pageNumber)
      : metadata.pages[pageNumber];
    return pageMeta?.blackpoint || METADATA_DEFAULTS.page.blackpoint;
  },

  /**
   * 특정 단락의 정렬 방향을 가져온다.
   * @param {Object} metadata
   * @param {number} paragraphIndex
   * @returns {string} 'left' | 'center' | 'right'
   */
  getParagraphAlign(metadata, paragraphIndex) {
    if (!metadata || !metadata.paragraphs) return METADATA_DEFAULTS.paragraph.align;
    return metadata.paragraphs[paragraphIndex]?.align || METADATA_DEFAULTS.paragraph.align;
  },

  /**
   * 특정 단락의 스타일 번호를 가져온다.
   * @param {Object} metadata
   * @param {number} paragraphIndex
   * @returns {string} '1'~'10'
   */
  getParagraphStyle(metadata, paragraphIndex) {
    if (!metadata || !metadata.paragraphs) return METADATA_DEFAULTS.paragraph.style;
    return metadata.paragraphs[paragraphIndex]?.style || METADATA_DEFAULTS.paragraph.style;
  },

  /**
   * 평문에서 모든 메타데이터 라인을 제거한다.
   * .txt 저장 시 사용.
   * @param {string} content
   * @returns {string} 메타데이터가 제거된 순수 평문
   */
  stripMetadata(content) {
    return content.split('\n')
      .filter(line => !this.isMetaLine(line))
      .join('\n');
  },

  // ═══════════════ 내부 유틸리티 ═══════════════

  /**
   * 메타데이터 값 역직렬화
   */
  _deserializeValue(key, valueStr, scope) {
    // 알 수 없는 키인 경우 null 반환 (parse에서 무시됨)
    const knownKeys = Object.keys(METADATA_DEFAULTS[scope] || {});
    if (!knownKeys.includes(key)) return undefined;

    if (valueStr === 'null') return null;
    if (valueStr === 'true') return true;
    if (valueStr === 'false') return false;

    // 숫자 (timestamp 등)
    if (scope === 'integral' && key === 'timestamp') {
      const num = Number(valueStr);
      return isNaN(num) ? valueStr : num;
    }

    // style은 이름 문자열 (하위 호환: 숫자 → 이름 변환)
    if (scope === 'paragraph' && key === 'style') {
      const lower = valueStr.toLowerCase();
      if (STYLE_NAMES.includes(lower)) return lower;
      const num = parseInt(valueStr);
      if (num >= 1 && num <= STYLE_NAMES.length) return STYLE_NAMES[num - 1];
      return 'plain';
    }

    // align은 enum
    if (scope === 'paragraph' && key === 'align') {
      const valid = ['left', 'center', 'right'];
      return valid.includes(valueStr.toLowerCase()) ? valueStr.toLowerCase() : 'center';
    }

    return valueStr;
  },

  /**
   * AES-256-CBC 암호화
   * @param {string} text - 평문
   * @param {string} password - 암호
   * @returns {string} iv:encrypted (hex 형식)
   */
  _aesEncrypt(text, password) {
    // 암호에서 256비트 키 유도 (PBKDF2)
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // salt:iv:encrypted 형식으로 반환
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
  },

  /**
   * AES-256-CBC 복호화
   * @param {string} encryptedText - salt:iv:encrypted (hex 형식)
   * @param {string} password - 암호
   * @returns {string} 복호화된 평문
   */
  _aesDecrypt(encryptedText, password) {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('잘못된 암호화 형식');
    }
    
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
};

module.exports = { ParaFileFormat, METADATA_DEFAULTS, STYLE_NAMES };
