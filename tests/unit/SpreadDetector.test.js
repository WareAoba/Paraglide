// tests/unit/SpreadDetector.test.js
import { describe, it, expect } from 'vitest';

const { SpreadDetector } = require('../../src/store/utils/SpreadDetector');

// ── 테스트 유틸: 세로 픽셀 열(RGBA) 생성 ──
function makeColumn(height, pixelFn) {
  // pixelFn(y) → {r, g, b} 또는 [r, g, b]
  const data = new Uint8ClampedArray(height * 4);
  for (let y = 0; y < height; y++) {
    const px = pixelFn(y);
    const [r, g, b] = Array.isArray(px) ? px : [px.r, px.g, px.b];
    data[y * 4]     = r;
    data[y * 4 + 1] = g;
    data[y * 4 + 2] = b;
    data[y * 4 + 3] = 255; // alpha
  }
  return data;
}

describe('SpreadDetector', () => {
  const H = SpreadDetector.ANALYSIS_HEIGHT; // 600

  describe('_gradientDiversity', () => {
    it('단색 열 → 다양성 ≈ 0', () => {
      const col = makeColumn(H, () => [128, 128, 128]);
      const diversity = SpreadDetector._gradientDiversity(col, H);
      expect(diversity).toBe(0);
    });

    it('순수 흰색 열 → 다양성 ≈ 0', () => {
      const col = makeColumn(H, () => [255, 255, 255]);
      const diversity = SpreadDetector._gradientDiversity(col, H);
      expect(diversity).toBe(0);
    });

    it('순수 검은색 열 → 다양성 ≈ 0', () => {
      const col = makeColumn(H, () => [0, 0, 0]);
      const diversity = SpreadDetector._gradientDiversity(col, H);
      expect(diversity).toBe(0);
    });

    it('두 색상 단일 전이 → 낮은 다양성', () => {
      // 상반부 흰색, 하반부 회색
      const col = makeColumn(H, (y) =>
        y < H / 2 ? [255, 255, 255] : [100, 100, 100]
      );
      const diversity = SpreadDetector._gradientDiversity(col, H);
      // 전이 지점 1개 → diversity ≈ 1/(H-1) ≈ 0.0017
      expect(diversity).toBeLessThan(0.01);
      expect(diversity).toBeGreaterThan(0);
    });

    it('복잡한 일러스트 패턴 → 높은 다양성', () => {
      // 매 행마다 다른 휘도
      const col = makeColumn(H, (y) => {
        const v = Math.floor((Math.sin(y * 0.3) * 0.5 + 0.5) * 200 + 20);
        return [v, v, v];
      });
      const diversity = SpreadDetector._gradientDiversity(col, H);
      expect(diversity).toBeGreaterThan(0.1);
    });

    it('높이 1 → 다양성 0', () => {
      const col = makeColumn(1, () => [128, 128, 128]);
      expect(SpreadDetector._gradientDiversity(col, 1)).toBe(0);
    });
  });

  describe('_analyzeColumnPair', () => {
    it('양쪽 모두 흰색 → 통과하지 않음 (비정보적)', () => {
      const colA = makeColumn(H, () => [255, 255, 255]);
      const colB = makeColumn(H, () => [255, 255, 255]);
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      expect(result.pass).toBe(false);
      expect(result.complexRatio).toBe(0);
    });

    it('양쪽 모두 검은색 → 통과하지 않음 (비정보적)', () => {
      const colA = makeColumn(H, () => [0, 0, 0]);
      const colB = makeColumn(H, () => [0, 0, 0]);
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      expect(result.pass).toBe(false);
      expect(result.complexRatio).toBe(0);
    });

    it('한쪽 흰색 + 한쪽 검은색 → 통과하지 않음', () => {
      const colA = makeColumn(H, () => [255, 255, 255]);
      const colB = makeColumn(H, () => [0, 0, 0]);
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      // 양쪽 모두 단순 → complexRows = 0
      expect(result.pass).toBe(false);
    });

    it('동일한 복잡 패턴 → 통과 (합페)', () => {
      // 사인파 기반 복잡 패턴 (동일)
      const pattern = (y) => {
        const v = Math.floor((Math.sin(y * 0.15) * 0.5 + 0.5) * 180 + 30);
        return [v, v, v];
      };
      const colA = makeColumn(H, pattern);
      const colB = makeColumn(H, pattern);
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      expect(result.pass).toBe(true);
      expect(result.matchRatio).toBeGreaterThan(0.9);
    });

    it('JPEG 노이즈 범위 내 유사 패턴 → 통과', () => {
      const basePattern = (y) => {
        const v = Math.floor((Math.sin(y * 0.15) * 0.5 + 0.5) * 180 + 30);
        return [v, v, v];
      };
      const colA = makeColumn(H, basePattern);
      // ±10 이내 노이즈 추가
      const colB = makeColumn(H, (y) => {
        const [v] = basePattern(y);
        const noise = Math.floor(Math.random() * 20) - 10;
        return [Math.max(0, Math.min(255, v + noise)),
                Math.max(0, Math.min(255, v + noise)),
                Math.max(0, Math.min(255, v + noise))];
      });
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      expect(result.pass).toBe(true);
    });

    it('완전히 다른 복잡 패턴 → 통과하지 않음', () => {
      const colA = makeColumn(H, (y) => {
        const v = Math.floor((Math.sin(y * 0.15) * 0.5 + 0.5) * 180 + 30);
        return [v, v, v];
      });
      // 완전히 다른 패턴 (위상 반전)
      const colB = makeColumn(H, (y) => {
        const v = Math.floor((Math.cos(y * 0.3 + 2) * 0.5 + 0.5) * 180 + 30);
        return [v, v, v];
      });
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      expect(result.pass).toBe(false);
    });

    it('복잡도 부족 (대부분 흰색, 소량 일치) → 통과하지 않음', () => {
      // 95% 흰색 + 5% 회색 (동일)
      const pattern = (y) =>
        y < H * 0.05 ? [128, 128, 128] : [255, 255, 255];
      const colA = makeColumn(H, pattern);
      const colB = makeColumn(H, pattern);
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      // complexRatio ≈ 0.05 < MIN_COMPLEX_RATIO(0.15) → 통과하지 않음
      expect(result.pass).toBe(false);
      expect(result.complexRatio).toBeLessThan(SpreadDetector.MIN_COMPLEX_RATIO);
    });

    it('단순 그라데이션만 있는 서로 다른 열 → 통과하지 않음', () => {
      // 두 개의 단조로운 그라데이션 (비슷하지만 단순)
      const colA = makeColumn(H, (y) => {
        const v = Math.floor((y / H) * 20 + 100);  // 100 → 120 천천히 변화
        return [v, v, v];
      });
      const colB = makeColumn(H, (y) => {
        const v = Math.floor((y / H) * 20 + 100);
        return [v, v, v];
      });
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      // gradientDiversity가 매우 낮을 수 있음 (변화량 < GRADIENT_STEP)
      // matchRatio는 높겠지만 다양성 부족으로 통과하지 않을 수 있음
      // 이 경우 y 간 차이가 ≈ 0.033으로 GRADIENT_STEP(5) 미만 → transitions ≈ 0
      expect(result.pass).toBe(false);
    });

    it('컬러 이미지 합페 (RGB 채널별 패턴) → 통과', () => {
      const pattern = (y) => {
        const r = Math.floor((Math.sin(y * 0.1) * 0.5 + 0.5) * 150 + 40);
        const g = Math.floor((Math.sin(y * 0.15 + 1) * 0.5 + 0.5) * 150 + 40);
        const b = Math.floor((Math.sin(y * 0.2 + 2) * 0.5 + 0.5) * 150 + 40);
        return [r, g, b];
      };
      const colA = makeColumn(H, pattern);
      const colB = makeColumn(H, pattern);
      const result = SpreadDetector._analyzeColumnPair(colA, colB);
      expect(result.pass).toBe(true);
    });
  });

  describe('_checkScaledPair', () => {
    // Canvas API가 필요한 _scaleImage/_getColumn을 우회하여
    // _checkScaledPair의 로직만 검증하기 위한 간접 테스트

    it('너비가 깊이 이하면 too_narrow 반환', () => {
      const narrow = { ctx: null, width: 2, height: H, origWidth: 2, origHeight: 600 };
      const result = SpreadDetector._checkScaledPair(narrow, narrow);
      expect(result.isSpread).toBe(false);
      expect(result.reason).toBe('too_narrow');
    });
  });

  describe('설정값 검증', () => {
    it('ANALYSIS_HEIGHT는 양수 정수', () => {
      expect(SpreadDetector.ANALYSIS_HEIGHT).toBeGreaterThan(0);
      expect(Number.isInteger(SpreadDetector.ANALYSIS_HEIGHT)).toBe(true);
    });

    it('PIXEL_TOLERANCE는 합리적 범위 (10~50)', () => {
      expect(SpreadDetector.PIXEL_TOLERANCE).toBeGreaterThanOrEqual(10);
      expect(SpreadDetector.PIXEL_TOLERANCE).toBeLessThanOrEqual(50);
    });

    it('MATCH_THRESHOLD는 0~1 범위', () => {
      expect(SpreadDetector.MATCH_THRESHOLD).toBeGreaterThan(0);
      expect(SpreadDetector.MATCH_THRESHOLD).toBeLessThanOrEqual(1);
    });

    it('MIN_DEPTHS_PASS ≤ DEPTHS.length', () => {
      expect(SpreadDetector.MIN_DEPTHS_PASS).toBeLessThanOrEqual(SpreadDetector.DEPTHS.length);
    });

    it('HEIGHT_RATIO_MIN는 0.5~1.0 범위', () => {
      expect(SpreadDetector.HEIGHT_RATIO_MIN).toBeGreaterThanOrEqual(0.5);
      expect(SpreadDetector.HEIGHT_RATIO_MIN).toBeLessThanOrEqual(1.0);
    });
  });
});
