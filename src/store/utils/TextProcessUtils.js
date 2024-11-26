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
          // 줄 단위로 분할
          splitParts = fileContent
              .split(/\n/)
              .map(l => l.trimEnd())
              .filter(l => l.length > 0);
      } else {
          // 단락 단위로 분할
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
                  pageNumber: currentNumber,
                  index: paragraphsToDisplay.length - 1,
                  startPos: partStartPos
              });
              previousWasPageNumber = false;
          }
      });

      // endPos 계산
      paragraphsMetadata.forEach((meta, i) => {
          meta.endPos = paragraphsMetadata[i + 1]
              ? paragraphsMetadata[i + 1].startPos - 1
              : fileContent.length;
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
  },

  // 위치 매핑 함수 추가
  mapLineToParagraph(lineMetadata, paragraphMetadata, currentLineIndex) {
      const lineStartPos = lineMetadata[currentLineIndex]?.startPos || 0;

      for (let i = 0; i < paragraphMetadata.length; i++) {
          const paraMeta = paragraphMetadata[i];
          if (lineStartPos >= paraMeta.startPos && lineStartPos <= paraMeta.endPos) {
              return i; // 단락 인덱스 반환
          }
      }
      return 0;
  },

  mapParagraphToLine(paragraphMetadata, lineMetadata, currentParagraphIndex) {
      const paraStartPos = paragraphMetadata[currentParagraphIndex]?.startPos || 0;

      for (let i = 0; i < lineMetadata.length; i++) {
          const lineMeta = lineMetadata[i];
          if (lineMeta.startPos >= paraStartPos) {
              return i; // 줄 인덱스 반환
          }
      }
      return 0;
  }
};

module.exports = { TextProcessUtils };