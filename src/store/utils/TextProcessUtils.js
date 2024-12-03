// src/store/utils/TextProcessUtils.js
const TextProcessUtils = {
  pagePatterns: {
    numberOnly: /^(\d+)$/,
    koreanStyle: /^(?:\d+\s*(?:페이지|페)|(?:페이지|페)\s*\d+)$/,
    englishStyle: /^(?:\d+\s*(?:page|p)|(?:page|p)\s*\d+)$/i,
    rangeStyle: /^(?:(?:페이지|페|page|p)\s*)?(\d+)\s*[-~]+\s*(\d+)(?:\s*(?:페이지|페|page|p))?$/i  // 합페 인식
  },

  skipPatterns: {
    separator: /^[=\-]{3,}/,
    comment: /^[\/\/#]/,
  },

  processParagraphs(fileContent, mode = 'paragraph') {
    if (mode === undefined || mode === null) {
      mode = this.detectLineMode(fileContent) ? 'line' : 'paragraph';
    }
  
    // 1. 먼저 줄 단위로 분할
    const normalizedContent = fileContent.replace(/\r\n/g, '\n');
    const allLines = normalizedContent.split(/\n/).map(l => l.trimEnd());
    
    let currentNumber = null;
    const paragraphsMetadata = [];
    const paragraphsToDisplay = [];
    let currentIndex = 0;
    let currentParagraph = [];
    
    // 2. 각 줄 처리
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trimStart();
      const lineStartPos = normalizedContent.indexOf(allLines[i], currentIndex);
      
      // 빈 줄이면 현재 단락 저장하고 초기화
      if (!line) {
        if (currentParagraph.length > 0) {
          const cleanedPart = currentParagraph.join('\n');
          paragraphsToDisplay.push(cleanedPart);
          paragraphsMetadata.push({
            pageNumber: currentNumber?.start,
            pageInfo: currentNumber,
            index: paragraphsToDisplay.length - 1,
            startPos: currentIndex,
            endPos: lineStartPos
          });
          currentParagraph = [];
        }
        continue;
      }
  
      // 페이지 번호 확인
      const pageInfo = this.extractPageNumber(line);
      if (pageInfo) {
        currentNumber = pageInfo;
        currentIndex = lineStartPos + line.length + 1;
        continue;
      }
  
      // 건너뛰어야 할 줄 확인
      if (this.shouldSkipParagraph(line)) {
        currentIndex = lineStartPos + line.length + 1;
        continue;
      }
  
      // 일반 텍스트 줄 추가
      currentParagraph.push(line);
      currentIndex = lineStartPos + line.length + 1;
    }
  
    // 마지막 단락 처리
    if (currentParagraph.length > 0) {
      const cleanedPart = currentParagraph.join('\n');
      paragraphsToDisplay.push(cleanedPart);
      paragraphsMetadata.push({
        pageNumber: currentNumber?.start,
        pageInfo: currentNumber,
        index: paragraphsToDisplay.length - 1,
        startPos: currentIndex - cleanedPart.length,
        endPos: currentIndex
      });
    }
  
    return {
      paragraphsToDisplay,
      paragraphsMetadata,
      currentNumber
    };
  },

  getParagraphByOffset(state, currentIndex, offset) {
    const targetIndex = currentIndex + offset;
    if (targetIndex >= 0 && targetIndex < state.paragraphs.length) {
      return {
        text: String(state.paragraphs[targetIndex] || ''), // 문자열 변환 보장
        metadata: {
          ...state.paragraphsMetadata[targetIndex],
          pageNumber: state.paragraphsMetadata[targetIndex]?.pageNumber || null
        }
      };
    }
    return null;
  },

  extractPageNumber(paragraph) {
    // 페이지 범위 체크
    const rangeMatch = paragraph.match(this.pagePatterns.rangeStyle);
    if (rangeMatch) {
      const [_, start, end] = rangeMatch;
      return {
        start: parseInt(start),
        end: parseInt(end),
        display: `${start}-${end} 페이지`
      };
    }

    // 단일 페이지 번호 처리
    let pageNum = null;

    // 숫자만 있는 경우
    const numberMatch = paragraph.match(this.pagePatterns.numberOnly);
    if (numberMatch) {
      pageNum = parseInt(numberMatch[1]);
    }

    // 한글 스타일
    const koreanMatch = paragraph.match(this.pagePatterns.koreanStyle);
    if (koreanMatch) {
      const numbers = paragraph.match(/\d+/);
      pageNum = numbers ? parseInt(numbers[0]) : null;
    }

    // 영어 스타일
    const englishMatch = paragraph.match(this.pagePatterns.englishStyle);
    if (englishMatch) {
      const numbers = paragraph.match(/\d+/);
      pageNum = numbers ? parseInt(numbers[0]) : null;
    }

    return pageNum ? {
      start: pageNum,
      end: pageNum,
      display: `${pageNum} 페이지`
    } : null;
  },

  shouldSkipParagraph(paragraph) {
    return Object.values(this.skipPatterns).some(pattern =>
      pattern.test(paragraph.trim())
    );
  },
  detectLineMode(fileContent) {

    const lines = fileContent.split('\n');
    
    const longLines = lines.reduce((count, line, index) => {
      const trimmedLength = line.replace(/\s+/g, '').length;
      if (trimmedLength > 20) {
        console.log(`긴 라인 발견 [${index + 1}]: ${trimmedLength}자`);
      }
      return trimmedLength > 20 ? count + 1 : count;
    }, 0);

    const result = longLines >= 5;
    return result;
  },

  mapPositionBetweenModes(oldContent, newContent, oldMetadata, newMetadata, currentIndex, targetMode) {
    const currentMeta = oldMetadata[currentIndex];
    if (!currentMeta) return 0;
  
    const currentStartPos = currentMeta.startPos;
    const currentContent = oldContent[currentIndex];
  
    if (!currentContent) return 0;
  
    if (targetMode === 'line') {
      // paragraph -> line: 현재 단락의 시작 위치와 가장 가까운 라인
      for (let i = 0; i < newMetadata.length; i++) {
        if (newMetadata[i].startPos >= currentStartPos) {
          return i;
        }
      }
    } else {
      // line -> paragraph: 현재 라인이 포함된 단락
      for (let i = 0; i < newMetadata.length; i++) {
        const meta = newMetadata[i];
        if (currentStartPos >= meta.startPos && currentStartPos <= meta.endPos) {
          return i;
        }
      }
    }
  
    return 0;
  },

  getPositionContext(content, metadata, index) {
    return {
      startPos: metadata[index]?.startPos,
      endPos: metadata[index]?.endPos,
      pageNumber: metadata[index]?.pageNumber,
      content: content[index]
    };
  }
};

module.exports = { TextProcessUtils };