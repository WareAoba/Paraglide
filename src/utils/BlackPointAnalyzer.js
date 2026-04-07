// src/utils/BlackPointAnalyzer.js
// 블랙포인트 분석 유틸리티 — 렌더러 프로세스 Canvas API 기반
//
// 역할:
//   만화 이미지의 블랙포인트(잉크/텍스트 색상) 검출
//   흑백/컬러 자동 판별 (JPEG 압축 아티팩트 보정)
//   노이즈 방지를 위한 히스토그램 피크 분석
//   페이지별 개별 분석 + 컬러 페이지 자동 회피

const BlackPointAnalyzer = {
  /**
   * 단일 이미지의 블랙포인트를 분석한다.
   * @param {string} dataUrl - base64 이미지 데이터 URL
   * @returns {Promise<{isGrayscale: boolean, blackPoint: {r,g,b,hex}, isPureBlack: boolean, confidence: number}>}
   */
  async analyze(dataUrl) {
    const img = await this._loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 분석 성능을 위해 최대 800px로 다운스케일
    const scale = Math.min(1, 800 / Math.max(img.width, img.height));
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const totalPixels = canvas.width * canvas.height;

    // 1. 흑백/컬러 판별
    const isGrayscale = this._detectGrayscale(pixels, totalPixels);

    // 2. 컬러 이미지 → 블랙포인트는 항상 순수 블랙
    if (!isGrayscale) {
      return {
        isGrayscale: false,
        blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' },
        isPureBlack: true,
        confidence: 1.0
      };
    }

    // 3. 그레이스케일 → 블랙포인트 검출
    const result = this._detectBlackPoint(pixels, totalPixels);
    return { isGrayscale: true, ...result };
  },

  /**
   * 여러 이미지를 분석하여 대표 블랙포인트를 산출한다.
   *
   * 샘플링 전략:
   *   - 20장 이하: 전체 분석
   *   - 21장 이상: 최대 30장 랜덤 샘플 (컬러 페이지 자동 회피)
   *
   * 컬러 페이지 처리:
   *   만화 앞부분만 컬러인 경우를 고려하여, 랜덤 샘플이 컬러로
   *   판정되면 다른 페이지로 재시도한다 (총 시도 횟수 제한).
   *   컬러 페이지는 개별 결과(perPage)에는 기록되지만,
   *   대표 블랙포인트 산출에는 제외된다.
   *
   * @param {Array<{dataUrl: string, page: number}>} samples - 이미지 목록
   * @param {function(index): Promise<{dataUrl: string, page: number}>} [loadFn] - 추가 로드 함수
   * @param {number} [totalCount] - 전체 이미지 수
   * @returns {Promise<{isGrayscale: boolean, blackPoint: {r,g,b,hex}, isPureBlack: boolean, perPage: Map<number, object>}>}
   */
  async analyzeMultiple(samples, loadFn = null, totalCount = 0) {
    const perPage = new Map();
    const grayscaleResults = [];

    for (const sample of samples) {
      const result = await this.analyze(sample.dataUrl);
      perPage.set(sample.page, result);
      if (result.isGrayscale) {
        grayscaleResults.push(result);
      }
    }

    // 30장 랜덤 샘플링 시 컬러 페이지가 잡히면 재시도 (loadFn 제공된 경우)
    // 이 로직은 analyzeWithSampling에서 처리됨 — 여기서는 수집된 결과만 집계

    return this._aggregateResults(grayscaleResults, perPage);
  },

  /**
   * 전체 이미지 목록에서 적응적 샘플링 + 분석을 수행한다.
   *
   * @param {Array<{filePath: string, page: number}>} imageFiles - 전체 이미지 파일 목록
   * @param {function(filePath: string): Promise<string>} toDataUrl - 파일 → dataUrl 변환 함수
   * @returns {Promise<{isGrayscale: boolean, blackPoint: {r,g,b,hex}, isPureBlack: boolean, perPage: Map<number, object>}>}
   */
  async analyzeWithSampling(imageFiles, toDataUrl) {
    const total = imageFiles.length;
    if (total === 0) {
      return {
        isGrayscale: true,
        blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' },
        isPureBlack: true,
        perPage: new Map()
      };
    }

    const MAX_SAMPLES = 30;
    const perPage = new Map();
    const grayscaleResults = [];
    const analyzedIndices = new Set();

    // ── 20장 이하: 전부 분석 ──
    if (total <= 20) {
      for (let i = 0; i < total; i++) {
        const img = imageFiles[i];
        const dataUrl = await toDataUrl(img.filePath);
        const result = await this.analyze(dataUrl);
        perPage.set(img.page, result);
        if (result.isGrayscale) grayscaleResults.push(result);
        analyzedIndices.add(i);
      }
      return this._aggregateResults(grayscaleResults, perPage);
    }

    // ── 21장 이상: 최대 30장 랜덤 샘플 (컬러 재시도) ──
    // 셔플 인덱스 풀 준비
    const pool = Array.from({ length: total }, (_, i) => i);
    this._shuffle(pool);

    let poolCursor = 0;
    let sampledCount = 0;
    const MAX_TOTAL_ATTEMPTS = total; // 전체 이미지 수 이상 시도하지 않음

    while (sampledCount < MAX_SAMPLES && poolCursor < pool.length && poolCursor < MAX_TOTAL_ATTEMPTS) {
      const idx = pool[poolCursor++];
      if (analyzedIndices.has(idx)) continue;
      analyzedIndices.add(idx);

      const img = imageFiles[idx];
      const dataUrl = await toDataUrl(img.filePath);
      const result = await this.analyze(dataUrl);
      perPage.set(img.page, result);

      if (result.isGrayscale) {
        grayscaleResults.push(result);
        sampledCount++;
      } else {
        // 컬러 페이지 — 기록은 하되 샘플 카운트에 포함하지 않고 다음으로 재시도
        // (풀에 남은 페이지가 있으면 자동으로 다음 반복에서 새 페이지 시도)
      }
    }

    return this._aggregateResults(grayscaleResults, perPage);
  },

  /**
   * 흑백 분석 결과들을 집계하여 "표준" 블랙포인트를 산출한다.
   *
   * 전략:
   *   1. 유효 결과들을 클러스터링하여 최빈 블랙포인트를 "표준"으로 선정
   *   2. 페이지별 블랙포인트를 표준과 비교:
   *      - 채널당 차이 ≤ OVERRIDE_DIST → 표준으로 통일 (사소한 JPEG 노이즈)
   *      - 채널당 차이 > OVERRIDE_DIST → 해당 페이지에만 개별 블랙포인트 유지
   */
  _aggregateResults(grayscaleResults, perPage) {
    // 흑백 샘플이 하나도 없으면 → 전체 컬러
    if (grayscaleResults.length === 0) {
      return {
        isGrayscale: false,
        blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' },
        isPureBlack: true,
        perPage
      };
    }

    const valid = grayscaleResults.filter(r => r.confidence > 0);
    if (valid.length === 0) {
      return {
        isGrayscale: true,
        blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' },
        isPureBlack: true,
        perPage
      };
    }

    // ── 1. 최빈 블랙포인트 클러스터 → 표준 선정 ──
    const CLUSTER_DIST = 5;   // 클러스터링 시 채널당 최대 허용 거리
    const OVERRIDE_DIST = 5;  // 이 이하 차이는 표준으로 통일
    const standard = this._findStandardBlackPoint(valid, CLUSTER_DIST);

    // ── 2. 페이지별 블랙포인트 표준화 ──
    for (const [, pageResult] of perPage) {
      if (!pageResult.isGrayscale) continue;
      const bp = pageResult.blackPoint;
      const maxDiff = Math.max(
        Math.abs(bp.r - standard.r),
        Math.abs(bp.g - standard.g),
        Math.abs(bp.b - standard.b)
      );
      if (maxDiff <= OVERRIDE_DIST) {
        // 사소한 차이 → 표준으로 통일
        pageResult.blackPoint = { ...standard };
        pageResult.usesStandard = true;
      } else {
        // 유의미한 차이 → 개별 블랙포인트 유지
        pageResult.usesStandard = false;
      }
    }

    return {
      isGrayscale: true,
      blackPoint: standard,
      isPureBlack: standard.r <= 2 && standard.g <= 2 && standard.b <= 2,
      perPage
    };
  },

  /**
   * 유효 결과들 중 가장 많은 이웃을 가진 블랙포인트를 기준으로
   * 클러스터 평균을 산출하여 "표준" 블랙포인트를 결정한다.
   */
  _findStandardBlackPoint(results, clusterDist) {
    // 각 결과에 대해 clusterDist 이내에 있는 이웃 수를 세어 최다 이웃 결과를 시드로 선정
    let bestIdx = 0, bestCount = 0;
    for (let i = 0; i < results.length; i++) {
      const a = results[i].blackPoint;
      let count = 0;
      for (let j = 0; j < results.length; j++) {
        const b = results[j].blackPoint;
        if (Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <= clusterDist) {
          count++;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestIdx = i;
      }
    }

    // 시드 주변 클러스터 멤버들의 평균 RGB 산출
    const seed = results[bestIdx].blackPoint;
    const members = results.filter(r => {
      const b = r.blackPoint;
      return Math.max(Math.abs(seed.r - b.r), Math.abs(seed.g - b.g), Math.abs(seed.b - b.b)) <= clusterDist;
    });

    const r = Math.round(members.reduce((s, m) => s + m.blackPoint.r, 0) / members.length);
    const g = Math.round(members.reduce((s, m) => s + m.blackPoint.g, 0) / members.length);
    const b = Math.round(members.reduce((s, m) => s + m.blackPoint.b, 0) / members.length);
    const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    return { r, g, b, hex };
  },

  /** Fisher-Yates 셔플 (in-place) */
  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  _loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  },

  /**
   * 흑백/컬러 판별.
   * JPEG 압축 아티팩트를 고려하여 채도(max-min) 기반으로 판단한다.
   * 극단적 밝기(>250)와 극단적 어두움(<5)은 판별에서 제외.
   * 유효 픽셀 중 채도 15 이상이 5% 미만이면 그레이스케일로 판정.
   */
  _detectGrayscale(pixels, totalPixels) {
    const sampleSize = Math.min(totalPixels, 10000);
    const step = Math.max(1, Math.floor(totalPixels / sampleSize));
    let colorCount = 0;
    let sampled = 0;

    for (let i = 0; i < totalPixels; i += step) {
      const o = i * 4;
      if (pixels[o + 3] < 128) continue;

      const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 250 || lum < 5) { sampled++; continue; }

      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat > 15) colorCount++;
      sampled++;
    }

    if (sampled === 0) return true;
    return (colorCount / sampled) < 0.05;
  },

  /**
   * 그레이스케일 이미지의 블랙포인트 검출.
   *
   * 알고리즘:
   *   1. 전체 픽셀의 휘도 히스토그램(0~255)을 구축
   *   2. 어두운 영역(0~80)을 가우시안 가중 커널로 스무딩
   *   3. 보더(패널 테두리) 유무 판정: smoothed[0] >= threshold
   *   4. PATH A (보더 있음) → 이봉(bimodal) 검사:
   *      - 보더 피크(lum 0) 뒤에 골짜기 + 첨예한 두 번째 피크
   *        → 비순수블랙 잉크 (두 번째 피크 = 실제 잉크 색상)
   *      - 이봉 미검출 → 순수 블랙 잉크 (#000000)
   *   5. PATH B (보더 없음) → 0~INK_LIMIT 글로벌 최대 피크:
   *      - peakLum < 20 → JPEG 아티팩트 의심 → lum 20+에서 재탐색
   *      - peakLum ≥ 20 → 잉크 피크로 채택
   *   6. 피크 bin의 평균 RGB를 산출
   *
   * 왜 보더 유무로 분기하는가:
   *   - 보더 O → lum 0이 주요 피크이므로 "이봉 검사"가 적합.
   *     잉크가 순수블랙이면 보더와 합쳐져 단봉, 비순수블랙이면 이봉.
   *   - 보더 X → lum 0이 미미하므로 "글로벌 최대"가 적합.
   *     잉크 bin이 0~40에서 가장 높은 빈도를 가진다.
   *
   * [히스토리] 전략 변천사:
   *   v1 "첫 피크": lum 0→80 순방향 첫 유의미 피크 → S4(보더 없음)에서
   *       JPEG 아티팩트(lum 7)에 걸림.
   *   v2 "글로벌 최대": 0~40 최대 → S1/00088에서 스크린톤(lum 18)이
   *       보더(lum 0)보다 높아 오검.
   *   v3 "하이브리드"(현재): 보더O→이봉, 보더X→글로벌최대+아티팩트방어.
   */
  _detectBlackPoint(pixels, totalPixels) {
    const histogram = new Uint32Array(256);
    const rgbBins = [];
    for (let i = 0; i < 256; i++) rgbBins.push({ r: 0, g: 0, b: 0, n: 0 });

    let totalOpaque = 0;
    for (let i = 0; i < totalPixels; i++) {
      const o = i * 4;
      if (pixels[o + 3] < 128) continue;
      totalOpaque++;
      const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      histogram[lum]++;
      rgbBins[lum].r += r;
      rgbBins[lum].g += g;
      rgbBins[lum].b += b;
      rgbBins[lum].n++;
    }

    if (totalOpaque === 0) {
      return { blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' }, isPureBlack: true, confidence: 0 };
    }

    const DARK_LIMIT = 80;

    // 가우시안 가중 스무딩 (σ≈1.4, 5-tap)
    const KERNEL = [0.06, 0.24, 0.40, 0.24, 0.06];
    const smoothed = new Float64Array(DARK_LIMIT + 1);
    for (let i = 0; i <= DARK_LIMIT; i++) {
      let val = 0;
      for (let k = -2; k <= 2; k++) {
        const j = Math.min(DARK_LIMIT, Math.max(0, i + k));
        val += histogram[j] * KERNEL[k + 2];
      }
      smoothed[i] = val;
    }

    let darkTotal = 0;
    for (let i = 0; i <= DARK_LIMIT; i++) darkTotal += histogram[i];

    if (darkTotal < totalOpaque * 0.001) {
      // 어두운 영역에 유의미한 픽셀 없음
      return { blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' }, isPureBlack: true, confidence: 0.3 };
    }

    // ── INK_LIMIT: 비순수블랙 잉크는 항상 lum 40 이하 ──
    // S1 테스트에서 스크린톤(lum 42+)이 잉크로 오검되어 도입함.
    // 실제 만화 잉크 색상 예시: #231816(lum27), #221816(lum27), #0f0f0f(lum15).
    // lum 40 이상은 스크린톤/회색 톤 영역이므로 검색 대상에서 제외.
    const INK_LIMIT = 40;
    const threshold = Math.max(darkTotal * 0.005, 1);

    // ── 보더(패널 테두리) 유무 판정 ──
    // 만화 패널 테두리/검정 필은 RGB(0,0,0)으로 그려져 smoothed[0]에 집중된다.
    //
    // [히스토리] 처음에는 "lum 0부터 올라가며 첫 피크"만 찾는 단일 전략이었는데,
    // 보더가 거의 없는 이미지(S4)에서 JPEG 아티팩트(lum 5-7)가 첫 피크가 되어
    // 실제 잉크(lum 27)를 놓쳤음. 그래서 보더 유무에 따라 완전히 다른 전략을 사용.
    //
    // 이어서 "0~40 글로벌 최대"로 바꿨는데, 이번엔 S1/00088에서 스크린톤(lum 18)이
    // 보더(lum 0)보다 높아서 #282828으로 오검. 결국 보더 여부를 먼저 확인하고
    // 보더O → 이봉검사, 보더X → 글로벌최대+아티팩트방어 의 하이브리드로 정착.
    const hasBorder = smoothed[0] >= threshold;

    let peakLum;

    if (hasBorder) {
      // ── PATH A: 보더 있음 → 이봉(bimodal) 검사 ──
      // 보더(lum 0) 뒤의 골짜기를 추적하며, 골짜기 대비 3배 이상 + 첨예한
      // 두 번째 피크가 있으면 그것이 실제 잉크 색상.
      // 순수블랙 잉크: lum 0에서 JPEG tail로 단조감소 → 이봉 미검출 → #000000
      // 비순수블랙 잉크: lum 0(보더) → 골짜기 → 잉크 피크 → 이봉 검출
      //
      // VALLEY_RATIO=3: S1 182장 전수통과 + S2 잉크피크 검출 확인 완료.
      //   너무 낮으면 JPEG tail의 습기 타는 스크린톤을 잉크로 오검.
      //
      // SHARP_RATIO=2, SHARP_OFFSET=5: 잉크는 좁고 뾰족하고 스크린톤은 넓고 완만.
      //   S1/00183에서 스크린톤 피크(ratio 1.99x)가 통과하지 않도록 2.0으로 설정.
      //   S1/00088에서도 lum 18 스크린톤(ratio 1.24x)을 정확히 거부함.
      const VALLEY_RATIO = 3;
      const SHARP_OFFSET = 5;
      const SHARP_RATIO = 2;
      peakLum = 0;
      let valleyMin = smoothed[0];
      let inkPeakLum = -1;

      for (let i = 1; i <= INK_LIMIT; i++) {
        if (smoothed[i] < valleyMin) {
          valleyMin = smoothed[i];
        }
        if (smoothed[i] < threshold) continue;
        const left = smoothed[i - 1];
        const right = i < DARK_LIMIT ? smoothed[i + 1] : 0;
        if (smoothed[i] >= left && smoothed[i] >= right) {
          // 1. 골짜기 대비 충분히 돌출된 피크인가?
          if (smoothed[i] < valleyMin * VALLEY_RATIO) continue;
          // 2. 첨예도 검사: 잉크는 뾰족, 스크린톤은 완만
          const leftShoulder = smoothed[Math.max(0, i - SHARP_OFFSET)];
          const rightShoulder = smoothed[Math.min(DARK_LIMIT, i + SHARP_OFFSET)];
          if (smoothed[i] >= Math.max(leftShoulder, rightShoulder) * SHARP_RATIO) {
            inkPeakLum = i;
            break;
          }
        }
      }

      if (inkPeakLum >= 0) {
        peakLum = inkPeakLum;
      } else {
        // 이봉 미검출 → 순수 블랙 잉크
        const mass = histogram[0] + histogram[1] + histogram[2];
        const confidence = Math.min(1, mass / (totalOpaque * 0.01));
        return { blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' }, isPureBlack: true, confidence };
      }

    } else {
      // ── PATH B: 보더 없음 → 0~INK_LIMIT 글로벌 최대 + 아티팩트 방어 ──
      // 보더가 없으면 lum 0에 유의미한 피크가 없으므로, 이봉검사는 불필요.
      // 0~40에서 가장 높은 bin을 잉크로 채택한다.
      //
      // [히스토리] S4 테스트에서 "첫 피크" 접근법이 JPEG 아티팩트(lum 7)에 멈춤.
      // S4/05_004: smoothed[7]=295 vs 잉크 smoothed[27]=2230.
      // 글로벌 최대를 취하면 사소한 아티팩트를 건너뚸.
      peakLum = 0;
      for (let i = 1; i <= INK_LIMIT; i++) {
        if (smoothed[i] > smoothed[peakLum]) peakLum = i;
      }

      if (smoothed[peakLum] < threshold) {
        return { blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' }, isPureBlack: true, confidence: 0.5 };
      }

      // ── JPEG 아티팩트 방어: peakLum < 20이면 재검증 ──
      // lum 3~19 범위는 잉크→백지 경계의 JPEG 디더링이 만드는
      // 아티팩트 피크가 생기는 영역이다. 실제 비순수블랙 잉크는
      // 대부분 lum 20+ 영역에 있다 (예: #231816=lum27, #221816=lum27).
      //
      // [히스토리] S5/027에서 lum 17의 JPEG 아티팩트 피크(625)가
      // lum 27의 실제 잉크 피크(609)보다 약간 높아서 오검.
      // 둘의 높이 비가 0.975로 거의 같았는데, JPEG 아티팩트는
      // 잉크→백지 경계 디더링에서 발생하므로 항상 잉크 피크보다 낮은 lum에 존재.
      //
      // ARTIFACT_ZONE=20: 가장 어두운 실제 잉크 색도 lum ~15
      //   (예: R=20,G=10,B=8 → lum≈13). lum 20 미만이면
      //   JPEG 아티팩트일 가능성이 있으므로 lum 20+ 영역에서 재탐색.
      //
      // ARTIFACT_RECOVERY_RATIO=0.7: secondary 피크가 primary의 70% 이상이면 재검증.
      //   S5/027: 609/625=0.975 → 통과. S5/327: 136/175=0.777 → 통과.
      //   실제 잉크가 lum 15인 책에서 스크린톤(lum 30)=40%라면 → 미통과, 안전.
      //
      // RECOVERY_SHARP_RATIO=1.3: secondary가 첨예한 잉크인지 검증.
      //   S5/027 lum 27: 609/max(327,358)=1.70 → 통과.
      //   S5/327 lum 28: 136/max(83,91)=1.49 → 통과.
      //   반면 스크린톤은 넓은 고원이라 ratio ≈ 1.0~1.2로 통과 불가.
      //   bimodal 경로의 SHARP_RATIO=2.0보다 느슨한 이유:
      //   보더가 없는 이미지는 잉크 콘텐츠가 적어 피크가 덧 첨예하므로
      //   기준을 낮춰야 검출 가능 (S5/327은 dark 1.9%만 차지).
      const ARTIFACT_ZONE = 20;
      const ARTIFACT_RECOVERY_RATIO = 0.7;
      const RECOVERY_SHARP_RATIO = 1.3;
      const SHARP_OFFSET = 5;

      if (peakLum < ARTIFACT_ZONE) {
        let secondPeak = ARTIFACT_ZONE;
        for (let i = ARTIFACT_ZONE + 1; i <= INK_LIMIT; i++) {
          if (smoothed[i] > smoothed[secondPeak]) secondPeak = i;
        }
        if (smoothed[secondPeak] >= smoothed[peakLum] * ARTIFACT_RECOVERY_RATIO) {
          const ls = smoothed[Math.max(0, secondPeak - SHARP_OFFSET)];
          const rs = smoothed[Math.min(DARK_LIMIT, secondPeak + SHARP_OFFSET)];
          if (smoothed[secondPeak] >= Math.max(ls, rs) * RECOVERY_SHARP_RATIO) {
            peakLum = secondPeak;
          }
        }
      }

      // peakLum ≤ 2로 잘혀진 경우 = 보더도 없고 lum 0이 글로벌 최대
      // → 잉크 자체가 순수 블랙이지만 보더가 없는 페이지
      if (peakLum <= 2) {
        const mass = histogram[0] + histogram[1] + histogram[2];
        const confidence = Math.min(1, mass / (totalOpaque * 0.01));
        return { blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' }, isPureBlack: true, confidence };
      }
    }

    // 피크 휘도 bin의 평균 RGB (인접 bin 미포함 — JPEG 아티팩트 희석 방지)
    const peakBin = rgbBins[peakLum];
    if (peakBin.n === 0) {
      return { blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' }, isPureBlack: true, confidence: 0 };
    }

    const r = Math.round(peakBin.r / peakBin.n);
    const g = Math.round(peakBin.g / peakBin.n);
    const b = Math.round(peakBin.b / peakBin.n);
    const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    const confidence = Math.min(1, peakBin.n / (totalOpaque * 0.01));
    const isPureBlack = r <= 2 && g <= 2 && b <= 2;

    return { blackPoint: { r, g, b, hex }, isPureBlack, confidence };
  }
};

module.exports = { BlackPointAnalyzer };
