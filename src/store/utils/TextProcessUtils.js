// src/store/utils/TextProcessUtils.js
const TextProcessUtils = {
  pagePatterns: {
      numberOnly: /^(\d+)$/,
      koreanStyle: /^(?:\d+(페이지|페)|(?:페이지|페)\d+)$/,
      englishStyle: /^(?:\d+(page|p)|(?:page|p)\d+)$/i
  },

  skipPatterns: {
      separator: /^[=\-]{3,}/,
      comment: /^[\/\/#]/,
  },

  processParagraphs(fileContent, mode = 'paragraph') {
    let splitParts;
    if (mode === 'line') {
        splitParts = fileContent
            .split(/\n/)
            .map(l => l.trimEnd())
            .filter(l => l.length > 0);
    } else {
        splitParts = fileContent
            .split(/\n\s*\n/)
            .map(p => p.trimEnd())
            .filter(p => p.length > 0);
    }

    let currentNumber = null;
    const paragraphsMetadata = [];
    const paragraphsToDisplay = [];
    let previousWasPageNumber = false;
    let currentIndex = 0;

    splitParts.forEach((part) => {
        const trimmedPart = part.trimStart();
        const partStartPos = fileContent.indexOf(part, currentIndex);
        currentIndex = partStartPos + part.length;

        const pageNum = this.extractPageNumber(trimmedPart);

        if (pageNum) {
            currentNumber = pageNum;
            previousWasPageNumber = true;
        } else if (!this.shouldSkipParagraph(trimmedPart)) {
            paragraphsToDisplay.push(trimmedPart);
            paragraphsMetadata.push({
                isPageChange: previousWasPageNumber,
                pageNumber: currentNumber, // 현재 페이지 번호 유지
                index: paragraphsToDisplay.length - 1,
                startPos: partStartPos,
                endPos: partStartPos + trimmedPart.length
            });
            previousWasPageNumber = false;
        }
    });

    // 마지막 endPos 계산은 유지
    return { 
        paragraphsToDisplay, 
        paragraphsMetadata, 
        currentNumber: currentNumber // 마지막 확인된 페이지 번호
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
      for (const pattern of Object.values(this.pagePatterns)) {
          const match = paragraph.trim().match(pattern);
          if (match) return parseInt(match[1], 10);
      }
      return null;
  },

  shouldSkipParagraph(paragraph) {
      return Object.values(this.skipPatterns).some(pattern =>
          pattern.test(paragraph.trim())
      );
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