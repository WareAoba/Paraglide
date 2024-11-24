// src/store/utils/TextProcessUtils.js
const TextProcessUtils = {
    pagePatterns: {
      numberOnly: /^(\d+)$/,
      koreanStyle: /^(\d+)(페이지|페)$/,
      englishStyle: /^(\d+)(page|p)$/i
    },
  
    skipPatterns: {
      separator: /^[=\-]{3,}/,
      comment: /^[\/\/#]/
    },
  
    processParagraphs(fileContent) {
      const splitParagraphs = fileContent
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
  
      let currentNumber = null;
      const paragraphsMetadata = [];
      const paragraphsToDisplay = [];
      let previousWasPageNumber = false;
  
      splitParagraphs.forEach((p) => {
        const pageNum = this.extractPageNumber(p);
  
        if (pageNum) {
          currentNumber = pageNum;
          previousWasPageNumber = true;
        } else if (!this.shouldSkipParagraph(p)) {
          paragraphsToDisplay.push(p);
          paragraphsMetadata.push({
            isPageChange: previousWasPageNumber,
            pageNumber: currentNumber,
            index: paragraphsToDisplay.length - 1
          });
          previousWasPageNumber = false;
        }
      });
  
      return { paragraphsToDisplay, paragraphsMetadata, currentNumber };
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
    }
  };
  
  module.exports = { TextProcessUtils };