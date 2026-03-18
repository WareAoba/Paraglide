// src/store/utils/SpreadDetector.js
// 합페(스프레드 페이지) 자동 감지 유틸리티 — 렌더러 프로세스 Canvas API 기반
//
// 역할:
//   일본 만화(RTL 읽기 방향)의 연속 페이지 쌍을 분석하여
//   합페(두 페이지가 하나의 그림을 이루는 스프레드)를 자동 감지한다.
//   RTL 기준, 이전 페이지(오른쪽)의 왼쪽 가장자리와
//   다음 페이지(왼쪽)의 오른쪽 가장자리를 비교하여 연속성을 판정한다.
//
// 알고리즘:
//   1. 연속된 두 페이지의 높이 비율 확인
//   2. 양쪽 가장자리에서 콘텐츠 경계(흰/검 여백이 끝나는 지점)를 탐색
//   3. 콘텐츠 경계 부근에서 N-pixel 스트립의 행 평균을 산출
//   4. 복잡도 필터: 양쪽 모두 단색인 행은 비정보적으로 제외
//   5. 그라데이션 다양성 검증: 단순 패턴을 걸러냄
//   6. 다중 깊이(depth)에서 스트립 비교 — 우연 일치 방지
//   7. 임계값 이상의 유사도 + 복잡도 → 합페로 판정

const SpreadDetector = {
  // ── 분석 파라미터 ──
  ANALYSIS_HEIGHT: 600,     // 비교 시 정규화할 세로 높이(px)
  STRIP_WIDTH: 3,           // 스트립 폭 (px) — 행 평균을 내서 JPEG 노이즈 상쇄
  PIXEL_TOLERANCE: 32,      // 채널당 최대 허용 차이 (JPEG 아티팩트 + 스캔 차이 감안)
  SIMPLE_HIGH: 240,         // 이 이상 휘도 → 흰색 영역으로 간주 (비정보적)
  SIMPLE_LOW: 15,           // 이 이하 휘도 → 검은색 영역으로 간주 (비정보적)
  MIN_COMPLEX_RATIO: 0.12,  // 전체 행 대비 복잡 행 최소 비율 (12%)
  MIN_GRADIENT_DIVERSITY: 0.06, // 최소 그라데이션 다양성
  MATCH_THRESHOLD: 0.37,    // 복잡 행 중 일치 비율 임계값 (37%)
  CORRELATION_THRESHOLD: 0.50, // 접합면 이중 신호 판정 시 피어슨 상관계수 임계값
  HEIGHT_RATIO_MIN: 0.90,   // 두 페이지 높이 비율 최소값 (90%)
  MIN_HEIGHT: 50,           // 분석 가능 최소 높이(px)
  DEPTHS: [0, 2],           // 비교할 가장자리 깊이 (콘텐츠 경계 기준 오프셋)
  MIN_DEPTHS_PASS: 2,       // 최소 통과 깊이 수 (2개 중 2개 — 접합면+확인)
  GRADIENT_STEP: 5,         // 그라데이션 전이 판정 임계값 (휘도 차이)
  MARGIN_SCAN_MAX: 40,      // 여백 탐지 시 최대 스캔 깊이(px)
  MARGIN_UNIFORM_RATIO: 0.92, // 여백 판정 시 단색 비율 임계값 (92%)
  MARGIN_REJECT_BOTH: 10,    // 양쪽 모두 이 이상 여백이면 합페 제외 (진짜 합페 접합면엔 여백 없음)
  SEAM_CORR_MIN: 0.35,        // Path 1 접합면 최소 상관계수 (우연 일치 차단)

  /**
   * 이미지 파일 목록에서 합페 쌍을 감지한다.
   *
   * 모든 연속 페이지 쌍을 빠짐없이 검사한다 (1-2, 2-3, 3-4, ...).
   * 웹 스캔본은 홀짝 페이지 구분이 불가능하므로 건너뛰지 않는다.
   *
   * @param {Array<{filePath: string, page: number}>} imageFiles - 페이지 번호순 정렬된 이미지 목록
   * @param {function(filePath: string): Promise<string>} toDataUrl - 파일 → data URL 변환 함수
   * @returns {Promise<Array<{pageA: number, pageB: number, confidence: number}>>}
   *   pageA: 이전 페이지 번호 (RTL 기준 오른쪽)
   *   pageB: 다음 페이지 번호 (RTL 기준 왼쪽)
   *   confidence: 0~1 범위의 판정 신뢰도
   */
  async detect(imageFiles, toDataUrl) {
    if (imageFiles.length < 2) return [];

    const results = [];
    let prevScaled = null;

    for (let i = 0; i < imageFiles.length; i++) {
      const dataUrl = await toDataUrl(imageFiles[i].filePath);
      const img = await this._loadImage(dataUrl);
      const scaled = this._scaleImage(img);

      if (prevScaled) {
        // 원본 높이 비율 검증: 합페라면 두 페이지 높이가 거의 동일해야 함
        const heightRatio = Math.min(prevScaled.origHeight, scaled.origHeight)
                          / Math.max(prevScaled.origHeight, scaled.origHeight);

        if (heightRatio >= this.HEIGHT_RATIO_MIN
            && prevScaled.origHeight >= this.MIN_HEIGHT
            && scaled.origHeight >= this.MIN_HEIGHT) {
          const result = this._checkScaledPair(prevScaled, scaled);
          if (result.isSpread) {
            results.push({
              pageA: imageFiles[i - 1].page,
              pageB: imageFiles[i].page,
              confidence: result.confidence
            });
          }
        }
      }

      prevScaled = scaled;
    }

    return results;
  },

  /**
   * 두 이미지(data URL)가 합페를 이루는지 검사한다.
   * 개별 쌍 검증이나 테스트에 활용할 수 있는 공개 메서드.
   *
   * @param {string} dataUrlA - 이전 페이지 data URL (RTL 기준 오른쪽)
   * @param {string} dataUrlB - 다음 페이지 data URL (RTL 기준 왼쪽)
   * @returns {Promise<{isSpread: boolean, confidence: number, reason?: string}>}
   */
  async checkPair(dataUrlA, dataUrlB) {
    const imgA = await this._loadImage(dataUrlA);
    const imgB = await this._loadImage(dataUrlB);

    const heightRatio = Math.min(imgA.height, imgB.height) / Math.max(imgA.height, imgB.height);
    if (heightRatio < this.HEIGHT_RATIO_MIN) {
      return { isSpread: false, confidence: 0, reason: 'height_mismatch' };
    }

    if (imgA.height < this.MIN_HEIGHT || imgB.height < this.MIN_HEIGHT) {
      return { isSpread: false, confidence: 0, reason: 'too_small' };
    }

    const scaledA = this._scaleImage(imgA);
    const scaledB = this._scaleImage(imgB);

    return this._checkScaledPair(scaledA, scaledB);
  },

  // ═══════════════════════════════════════════════════════════════
  //  내부 메서드
  // ═══════════════════════════════════════════════════════════════

  /**
   * 스케일링된 두 이미지를 다중 깊이로 비교하여 합페 여부를 판정한다.
   *
   * 판정 경로:
   *   Path 1 (다중 깊이): 모든 깊이에서 픽셀 일치율이 임계값 이상
   *   Path 2 (이중 신호): 접합면(d=0)에서 픽셀 일치율 + 상관계수 모두 충족
   *     → 두 독립 신호가 동시에 높으면 한 깊이만으로도 충분한 증거
   *
   * @param {{ctx: CanvasRenderingContext2D, width: number, height: number}} scaledA
   * @param {{ctx: CanvasRenderingContext2D, width: number, height: number}} scaledB
   * @returns {{isSpread: boolean, confidence: number, reason?: string}}
   */
  _checkScaledPair(scaledA, scaledB) {
    // 콘텐츠 경계 탐색: 여백을 건너뛰고 실제 일러스트가 시작되는 열 위치
    const contentStartA = this._findContentBoundary(scaledA, 'left');
    const contentStartB = this._findContentBoundary(scaledB, 'right');

    // 양쪽 모두 여백이 크면 → 독립 페이지 (진짜 합페 분할면엔 여백 없음)
    if (contentStartA >= this.MARGIN_REJECT_BOTH && contentStartB >= this.MARGIN_REJECT_BOTH) {
      return { isSpread: false, confidence: 0, reason: 'both_margins' };
    }

    const maxDepth = Math.max(...this.DEPTHS) + this.STRIP_WIDTH;
    if (contentStartA + maxDepth > scaledA.width || contentStartB + maxDepth > scaledB.width) {
      return { isSpread: false, confidence: 0, reason: 'too_narrow' };
    }

    let passingDepths = 0;
    let totalConfidence = 0;
    const depthResults = [];

    for (const depth of this.DEPTHS) {
      const stripA = this._getStrip(scaledA, 'left', contentStartA + depth);
      const stripB = this._getStrip(scaledB, 'right', contentStartB + depth);

      const result = this._analyzeColumnPair(stripA, stripB);
      depthResults.push(result);
      if (result.pass) {
        passingDepths++;
        totalConfidence += result.matchRatio;
      }
    }

    // Path 1: 모든 깊이에서 픽셀 일치율 통과 + 접합면 상관계수 충분
    // 상관계수가 낮으면 패턴 연속성이 부족 → 우연 일치이므로 합페 아님
    if (passingDepths >= this.MIN_DEPTHS_PASS) {
      const seamCorr = depthResults[0].correlation;
      if (seamCorr >= this.SEAM_CORR_MIN) {
        return {
          isSpread: true,
          confidence: totalConfidence / passingDepths
        };
      }
    }

    // Path 2: 접합면(d=0) 이중 신호 — match + correlation 모두 충족
    // JPEG 압축이나 미세한 분할 오차로 깊은 depth가 실패해도
    // 접합면에서 두 독립 신호가 동시에 강하면 합페로 판정
    const seam = depthResults[0];
    if (seam.pass &&
        seam.matchRatio >= this.MATCH_THRESHOLD &&
        seam.correlation >= this.CORRELATION_THRESHOLD) {
      return { isSpread: true, confidence: seam.matchRatio };
    }

    return { isSpread: false, confidence: 0, reason: 'low_similarity' };
  },

  /**
   * 이미지를 분석용 높이로 스케일링하여 Canvas 컨텍스트를 반환한다.
   *
   * @param {HTMLImageElement} img
   * @returns {{ctx: CanvasRenderingContext2D, width: number, height: number, origWidth: number, origHeight: number}}
   */
  _scaleImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scale = this.ANALYSIS_HEIGHT / img.height;
    canvas.width = Math.max(this.STRIP_WIDTH + Math.max(...this.DEPTHS) + this.MARGIN_SCAN_MAX,
                            Math.floor(img.width * scale));
    canvas.height = this.ANALYSIS_HEIGHT;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      ctx, width: canvas.width, height: canvas.height,
      origWidth: img.width, origHeight: img.height
    };
  },

  /**
   * 가장자리에서 콘텐츠 경계(여백이 끝나는 지점)를 탐색한다.
   *
   * 흰색/검은색 픽셀이 MARGIN_UNIFORM_RATIO(92%) 이상인 열은 여백으로 판단,
   * 해당 열을 건너뛰고 실제 일러스트가 시작되는 위치를 반환한다.
   *
   * @param {{ctx: CanvasRenderingContext2D, width: number, height: number}} scaled
   * @param {'left'|'right'} side
   * @returns {number} 콘텐츠 시작 깊이 (0 = 가장자리에 바로 콘텐츠)
   */
  _findContentBoundary(scaled, side) {
    const height = this.ANALYSIS_HEIGHT;
    const maxScan = Math.min(this.MARGIN_SCAN_MAX, Math.floor(scaled.width * 0.3));

    for (let d = 0; d < maxScan; d++) {
      const x = side === 'left' ? d : scaled.width - 1 - d;
      const col = scaled.ctx.getImageData(x, 0, 1, height).data;

      let uniformCount = 0;
      for (let y = 0; y < height; y++) {
        const o = y * 4;
        const lum = 0.299 * col[o] + 0.587 * col[o + 1] + 0.114 * col[o + 2];
        if (lum >= this.SIMPLE_HIGH || lum <= this.SIMPLE_LOW) {
          uniformCount++;
        }
      }

      // 이 열이 충분히 다양하면 → 콘텐츠 시작
      if (uniformCount / height < this.MARGIN_UNIFORM_RATIO) {
        return d;
      }
    }

    // 여백이 maxScan까지 이어짐 → 그 지점부터 시작
    return maxScan;
  },

  /**
   * 스케일링된 이미지에서 STRIP_WIDTH 폭의 세로 스트립 평균을 추출한다.
   *
   * 단일 픽셀 열 대신 N-pixel 폭의 평균값을 사용하여
   * JPEG 압축 아티팩트와 미세한 스캔 차이를 상쇄한다.
   *
   * @param {{ctx: CanvasRenderingContext2D, width: number}} scaled
   * @param {'left'|'right'} side - 추출 방향
   * @param {number} depthFromEdge - 이미지 가장자리로부터의 깊이
   * @returns {Uint8ClampedArray} RGBA 픽셀 데이터 (길이 = ANALYSIS_HEIGHT × 4)
   */
  _getStrip(scaled, side, depthFromEdge) {
    const sw = this.STRIP_WIDTH;
    const height = this.ANALYSIS_HEIGHT;
    let startX;

    if (side === 'left') {
      startX = depthFromEdge;
    } else {
      startX = scaled.width - 1 - depthFromEdge - (sw - 1);
    }

    // 범위 클램핑
    startX = Math.max(0, Math.min(startX, scaled.width - sw));

    const stripData = scaled.ctx.getImageData(startX, 0, sw, height).data;
    const averaged = new Uint8ClampedArray(height * 4);

    for (let y = 0; y < height; y++) {
      let rSum = 0, gSum = 0, bSum = 0;
      for (let sx = 0; sx < sw; sx++) {
        const o = (y * sw + sx) * 4;
        rSum += stripData[o];
        gSum += stripData[o + 1];
        bSum += stripData[o + 2];
      }
      const o = y * 4;
      averaged[o]     = Math.round(rSum / sw);
      averaged[o + 1] = Math.round(gSum / sw);
      averaged[o + 2] = Math.round(bSum / sw);
      averaged[o + 3] = 255;
    }

    return averaged;
  },

  // _getColumn: 하위 호환용 (단일 열 추출 — 테스트에서 사용)
  _getColumn(scaled, side, depth) {
    const x = side === 'left' ? depth : scaled.width - 1 - depth;
    return scaled.ctx.getImageData(x, 0, 1, this.ANALYSIS_HEIGHT).data;
  },

  /**
   * 두 세로 픽셀 열의 유사도를 종합 분석한다.
   *
   * 판정 절차:
   *   1. 각 행의 휘도(luminance)를 산출
   *   2. 양쪽 모두 단순 영역(흰색 또는 검은색)이면 → 비정보적, 건너뜀
   *      (이 필터가 "서로가 완벽한 단색일 경우" 오탐을 제거한다)
   *   3. 한쪽이라도 중간톤이면 → 복잡 행(complex row)으로 집계
   *   4. 복잡 행 중 채널당 차이 ≤ PIXEL_TOLERANCE → 일치 행
   *   5. 양쪽 열의 그라데이션 다양성 산출
   *      (이 필터가 "단순 패턴 유사도" 오탐을 제거한다 —
   *       평이한 배경이 비슷할 뿐인 경우를 걸러냄)
   *   6. 복잡 행 비율 · 그라데이션 다양성 · 일치 비율이
   *      모두 임계값 이상 → 해당 깊이 통과
   *
   * @param {Uint8ClampedArray} colA - 열 A의 RGBA 데이터
   * @param {Uint8ClampedArray} colB - 열 B의 RGBA 데이터
   * @returns {{pass: boolean, matchRatio: number, complexRatio: number, correlation: number}}
   */
  _analyzeColumnPair(colA, colB) {
    const height = this.ANALYSIS_HEIGHT;
    let complexRows = 0;
    let matchingRows = 0;
    const lumsA = [];
    const lumsB = [];

    // ── 행별 비교: 복잡도 판별 + 픽셀 일치 + 휘도 수집 ──
    for (let y = 0; y < height; y++) {
      const o = y * 4;
      const rA = colA[o],     gA = colA[o + 1], bA = colA[o + 2];
      const rB = colB[o],     gB = colB[o + 1], bB = colB[o + 2];

      const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
      const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;

      const simpleA = lumA >= this.SIMPLE_HIGH || lumA <= this.SIMPLE_LOW;
      const simpleB = lumB >= this.SIMPLE_HIGH || lumB <= this.SIMPLE_LOW;

      if (simpleA && simpleB) continue;

      complexRows++;
      lumsA.push(lumA);
      lumsB.push(lumB);

      const diff = Math.max(
        Math.abs(rA - rB),
        Math.abs(gA - gB),
        Math.abs(bA - bB)
      );

      if (diff <= this.PIXEL_TOLERANCE) {
        matchingRows++;
      }
    }

    const diversityA = this._gradientDiversity(colA, height);
    const diversityB = this._gradientDiversity(colB, height);
    const minDiversity = Math.min(diversityA, diversityB);

    const complexRatio = complexRows / height;
    const matchRatio = complexRows > 0 ? matchingRows / complexRows : 0;

    // ── 피어슨 상관계수: 절대 밝기 차이가 아닌 패턴 유사성 ──
    // JPEG 압축으로 전체 밝기가 쉬프트돼도 패턴이 같으면 r → 1.0
    const correlation = lumsA.length > 10
      ? this._pearsonCorrelation(lumsA, lumsB) : 0;

    // 통과 조건: 복잡도 + 다양성 + 픽셀 일치율
    // 상관계수는 계산하되, 통과 판정에는 미사용 (Path 2에서 활용)
    const pass =
      complexRatio >= this.MIN_COMPLEX_RATIO &&
      minDiversity >= this.MIN_GRADIENT_DIVERSITY &&
      matchRatio >= this.MATCH_THRESHOLD;

    return { pass, matchRatio, complexRatio, correlation };
  },

  /**
   * 세로 픽셀 열의 그라데이션 다양성을 산출한다.
   *
   * 인접 행 간 휘도 변화가 GRADIENT_STEP을 초과하는 비율.
   *   - 단순 패턴(단색, 2~3색 전환): 다양성 ≈ 0.01~0.05
   *   - 복잡한 일러스트(디테일, 텍스처): 다양성 ≈ 0.1~0.5+
   *
   * @param {Uint8ClampedArray} col - 열의 RGBA 데이터
   * @param {number} height - 행 수
   * @returns {number} 0~1 범위의 다양성 지수
   */
  _gradientDiversity(col, height) {
    if (height <= 1) return 0;

    let transitions = 0;
    for (let y = 1; y < height; y++) {
      const o1 = (y - 1) * 4;
      const o2 = y * 4;
      const lum1 = 0.299 * col[o1] + 0.587 * col[o1 + 1] + 0.114 * col[o1 + 2];
      const lum2 = 0.299 * col[o2] + 0.587 * col[o2 + 1] + 0.114 * col[o2 + 2];
      if (Math.abs(lum1 - lum2) > this.GRADIENT_STEP) {
        transitions++;
      }
    }

    return transitions / (height - 1);
  },

  /**
   * 피어슨 상관계수 (Pearson correlation coefficient).
   * 두 수열의 선형 상관을 -1~1 범위로 반환한다.
   *   r ≈ 1.0: 같은 패턴 (합페 접합면)
   *   r ≈ 0.0: 무관한 패턴 (독립 페이지)
   *   r < 0  : 역패턴
   *
   * @param {number[]} xs
   * @param {number[]} ys
   * @returns {number}
   */
  _pearsonCorrelation(xs, ys) {
    const n = xs.length;
    if (n === 0) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX  += xs[i];
      sumY  += ys[i];
      sumXY += xs[i] * ys[i];
      sumX2 += xs[i] * xs[i];
      sumY2 += ys[i] * ys[i];
    }

    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom === 0) return 0;

    return (n * sumXY - sumX * sumY) / denom;
  },

  /** data URL → Image 로드 */
  _loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
};

module.exports = { SpreadDetector };
