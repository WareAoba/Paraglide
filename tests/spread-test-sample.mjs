// tests/spread-test-sample.mjs
// sample 폴더의 실제 만화 이미지로 SpreadDetector 알고리즘을 테스트한다.
// sharp 기반으로 Canvas API 없이 Node.js에서 직접 실행.
//
// 실행: node tests/spread-test-sample.mjs

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SpreadDetector } = require('../src/utils/SpreadDetector');

const SAMPLE_DIR = path.resolve('sample');
const H = SpreadDetector.ANALYSIS_HEIGHT;

// ── sharp 기반 이미지 데이터 추출 ──
async function loadImageData(filePath) {
  const img = sharp(filePath);
  const meta = await img.metadata();
  const origWidth = meta.width;
  const origHeight = meta.height;

  const targetH = H;
  const scale = targetH / origHeight;
  const targetW = Math.max(20, Math.floor(origWidth * scale));

  const { data, info } = await img
    .resize(targetW, targetH, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, origWidth, origHeight };
}

function getPixel(imgData, x, y) {
  const o = (y * imgData.width + x) * 3;
  return [imgData.data[o], imgData.data[o + 1], imgData.data[o + 2]];
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ── 콘텐츠 경계 탐색 (sharp 데이터 기반) ──
function findContentBoundary(imgData, side) {
  const { width, height } = imgData;
  const maxScan = Math.min(SpreadDetector.MARGIN_SCAN_MAX, Math.floor(width * 0.3));

  for (let d = 0; d < maxScan; d++) {
    const x = side === 'left' ? d : width - 1 - d;
    let uniformCount = 0;
    for (let y = 0; y < height; y++) {
      const [r, g, b] = getPixel(imgData, x, y);
      const lum = luminance(r, g, b);
      if (lum >= SpreadDetector.SIMPLE_HIGH || lum <= SpreadDetector.SIMPLE_LOW) {
        uniformCount++;
      }
    }
    if (uniformCount / height < SpreadDetector.MARGIN_UNIFORM_RATIO) {
      return d;
    }
  }
  return maxScan;
}

// ── 스트립 평균 추출 (sharp 데이터 기반) ──
function getStrip(imgData, side, depthFromEdge) {
  const sw = SpreadDetector.STRIP_WIDTH;
  const { width, height } = imgData;
  let startX;

  if (side === 'left') {
    startX = depthFromEdge;
  } else {
    startX = width - 1 - depthFromEdge - (sw - 1);
  }
  startX = Math.max(0, Math.min(startX, width - sw));

  const averaged = new Uint8ClampedArray(height * 4);
  for (let y = 0; y < height; y++) {
    let rSum = 0, gSum = 0, bSum = 0;
    for (let sx = 0; sx < sw; sx++) {
      const [r, g, b] = getPixel(imgData, startX + sx, y);
      rSum += r; gSum += g; bSum += b;
    }
    const o = y * 4;
    averaged[o]     = Math.round(rSum / sw);
    averaged[o + 1] = Math.round(gSum / sw);
    averaged[o + 2] = Math.round(bSum / sw);
    averaged[o + 3] = 255;
  }
  return averaged;
}

// ── 메인 ──
async function main() {
  const files = fs.readdirSync(SAMPLE_DIR)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();

  console.log(`\n📁 sample 폴더: ${files.length}장`);
  console.log(`   파라미터: STRIP_WIDTH=${SpreadDetector.STRIP_WIDTH} PIXEL_TOLERANCE=${SpreadDetector.PIXEL_TOLERANCE} MATCH_THRESHOLD=${SpreadDetector.MATCH_THRESHOLD} DEPTHS=[${SpreadDetector.DEPTHS}]\n`);

  // 이미지 로드
  const images = [];
  for (const f of files) {
    const filePath = path.join(SAMPLE_DIR, f);
    const pageMatch = f.match(/(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : images.length + 1;
    const imgData = await loadImageData(filePath);
    images.push({ filePath, page, ...imgData });
  }

  // 연속 페이지 쌍 비교
  const spreads = [];
  for (let i = 1; i < images.length; i++) {
    const prev = images[i - 1];
    const curr = images[i];

    const heightRatio = Math.min(prev.origHeight, curr.origHeight)
                      / Math.max(prev.origHeight, curr.origHeight);

    if (heightRatio < SpreadDetector.HEIGHT_RATIO_MIN) {
      console.log(`  p${prev.page}-p${curr.page}: 높이 불일치 (${(heightRatio * 100).toFixed(1)}%) — 건너뜀`);
      continue;
    }

    // 콘텐츠 경계 탐색
    const cbA = findContentBoundary(prev, 'left');
    const cbB = findContentBoundary(curr, 'right');

    // 양쪽 모두 여백이 크면 → 독립 페이지
    if (cbA >= SpreadDetector.MARGIN_REJECT_BOTH && cbB >= SpreadDetector.MARGIN_REJECT_BOTH) {
      const maxMatch = 0;
      console.log(`  ⬜ p${prev.page}-p${curr.page}: 양쪽 여백 → 건너뜀 [margin: A=${cbA} B=${cbB}]`);
      continue;
    }

    const maxDepth = Math.max(...SpreadDetector.DEPTHS) + SpreadDetector.STRIP_WIDTH;
    if (cbA + maxDepth > prev.width || cbB + maxDepth > curr.width) continue;

    let passingDepths = 0;
    let totalConfidence = 0;
    const depthDetails = [];

    for (const depth of SpreadDetector.DEPTHS) {
      const stripA = getStrip(prev, 'left', cbA + depth);
      const stripB = getStrip(curr, 'right', cbB + depth);
      const result = SpreadDetector._analyzeColumnPair(stripA, stripB);
      depthDetails.push({ depth, ...result });
      if (result.pass) {
        passingDepths++;
        totalConfidence += result.matchRatio;
      }
    }

    // Path 1: 다중 깊이 통과 + 접합면 상관계수 충분
    let isSpread = passingDepths >= SpreadDetector.MIN_DEPTHS_PASS
                && depthDetails[0].correlation >= SpreadDetector.SEAM_CORR_MIN;
    let confidence = isSpread ? totalConfidence / passingDepths : 0;
    let path = 'P1';

    // Path 2: 접합면(d=0) 이중 신호 — match + correlation 모두 충족
    if (!isSpread && depthDetails.length > 0) {
      const seam = depthDetails[0];
      if (seam.pass &&
          seam.matchRatio >= SpreadDetector.MATCH_THRESHOLD &&
          seam.correlation >= SpreadDetector.CORRELATION_THRESHOLD) {
        isSpread = true;
        confidence = seam.matchRatio;
        path = 'P2';
      }
    }

    if (isSpread) {
      spreads.push({ pageA: prev.page, pageB: curr.page, confidence });
      console.log(`  ✅ p${prev.page}-p${curr.page}: 합페 [${path}] (신뢰도 ${(confidence * 100).toFixed(1)}%) [margin: A=${cbA} B=${cbB}]`);
      for (const d of depthDetails) {
        const mark = d.pass ? '✓' : '✗';
        console.log(`     ${mark} depth=${d.depth}: match=${(d.matchRatio * 100).toFixed(1)}% complex=${(d.complexRatio * 100).toFixed(1)}% corr=${(d.correlation * 100).toFixed(1)}%`);
      }
    } else {
      const maxMatch = Math.max(...depthDetails.map(d => d.matchRatio));
      const maxCorr = Math.max(...depthDetails.map(d => d.correlation || 0));
      if (maxMatch > 0.3 || maxCorr > 0.3) {
        console.log(`  ❌ p${prev.page}-p${curr.page}: 비합페 (pass=${passingDepths}/${SpreadDetector.DEPTHS.length}) [margin: A=${cbA} B=${cbB}]`);
        for (const d of depthDetails) {
          const mark = d.pass ? '✓' : '✗';
          console.log(`     ${mark} depth=${d.depth}: match=${(d.matchRatio * 100).toFixed(1)}% complex=${(d.complexRatio * 100).toFixed(1)}% corr=${(d.correlation * 100).toFixed(1)}%`);
        }
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 결과: 전체 ${files.length}장 중 합페 ${spreads.length}건 감지\n`);
  for (const s of spreads) {
    console.log(`   p${s.pageA}-p${s.pageB}  (신뢰도 ${(s.confidence * 100).toFixed(1)}%)`);
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
