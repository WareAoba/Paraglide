// tests/spread-test-samples-1-3.mjs
// sample/1, sample/2, sample/3 폴더에서 합페(스프레드) 검출을 실행한다.
// sharp 기반으로 Canvas API 없이 Node.js에서 직접 실행.
//
// 실행: node tests/spread-test-samples-1-3.mjs

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SpreadDetector } = require('../src/store/utils/SpreadDetector');

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

async function analyzeFolder(sampleDir, label) {
  if (!fs.existsSync(sampleDir)) {
    console.log(`⚠ ${label}: 폴더 없음 (${sampleDir})\n`);
    return;
  }

  const files = fs.readdirSync(sampleDir)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📁 ${label} (${sampleDir}): ${files.length}장`);
  console.log(`   파라미터: STRIP_WIDTH=${SpreadDetector.STRIP_WIDTH} PIXEL_TOLERANCE=${SpreadDetector.PIXEL_TOLERANCE} MATCH_THRESHOLD=${SpreadDetector.MATCH_THRESHOLD} DEPTHS=[${SpreadDetector.DEPTHS}]`);
  console.log(`${'─'.repeat(60)}`);

  const images = [];
  for (const f of files) {
    const filePath = path.join(sampleDir, f);
    const pageMatch = f.match(/(\d+)/);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : images.length + 1;
    const imgData = await loadImageData(filePath);
    images.push({ filePath: f, page, ...imgData });
  }

  const spreads = [];
  for (let i = 1; i < images.length; i++) {
    const prev = images[i - 1];
    const curr = images[i];

    const heightRatio = Math.min(prev.origHeight, curr.origHeight)
                      / Math.max(prev.origHeight, curr.origHeight);

    if (heightRatio < SpreadDetector.HEIGHT_RATIO_MIN) {
      continue;
    }

    const cbA = findContentBoundary(prev, 'left');
    const cbB = findContentBoundary(curr, 'right');

    if (cbA >= SpreadDetector.MARGIN_REJECT_BOTH && cbB >= SpreadDetector.MARGIN_REJECT_BOTH) {
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

    // Path 1
    let isSpread = false;
    let confidence = 0;
    let pth = '';
    let rejectReason = '';

    if (passingDepths >= SpreadDetector.MIN_DEPTHS_PASS
        && depthDetails[0].correlation >= SpreadDetector.SEAM_CORR_MIN) {
      confidence = totalConfidence / passingDepths;

      if (confidence < SpreadDetector.MIN_CONFIDENCE) {
        rejectReason = 'low_confidence';
      } else if (confidence >= SpreadDetector.AUTO_PASS_CONFIDENCE) {
        isSpread = true;
        pth = 'P1';
      } else {
        // Borderline 검증
        if (depthDetails[0].correlation < SpreadDetector.BORDERLINE_CORR_MIN) {
          rejectReason = 'borderline_low_corr';
        } else {
          // 심층 깊이 검증 (d=8)
          const deepMaxD = SpreadDetector.DEEP_VERIFY_DEPTH + SpreadDetector.STRIP_WIDTH;
          let deepPass = true;
          if (cbA + deepMaxD <= prev.width && cbB + deepMaxD <= curr.width) {
            const deepA = getStrip(prev, 'left', cbA + SpreadDetector.DEEP_VERIFY_DEPTH);
            const deepB = getStrip(curr, 'right', cbB + SpreadDetector.DEEP_VERIFY_DEPTH);
            const deepR = SpreadDetector._analyzeColumnPair(deepA, deepB);
            if (deepR.matchRatio < SpreadDetector.DEEP_VERIFY_MIN_MATCH) {
              deepPass = false;
              rejectReason = 'deep_verify_fail';
            }
          }
          if (deepPass) {
            isSpread = true;
            pth = 'P1';
          }
        }
      }
    }

    // Path 2
    if (!isSpread && !rejectReason && depthDetails.length > 0) {
      const seam = depthDetails[0];
      if (seam.pass &&
          seam.matchRatio >= SpreadDetector.MATCH_THRESHOLD &&
          seam.correlation >= SpreadDetector.CORRELATION_THRESHOLD) {
        const d2Corr = depthDetails.length > 1 ? depthDetails[1].correlation : 1;
        if (d2Corr >= SpreadDetector.PATH2_D2_CORR_MIN) {
          isSpread = true;
          confidence = seam.matchRatio;
          pth = 'P2';
        } else {
          rejectReason = 'path2_d2_corr_low';
        }
      }
    }

    if (isSpread) {
      spreads.push({ pageA: prev.page, pageB: curr.page, confidence, path: pth });
      console.log(`  ✅ p${prev.page}-p${curr.page}: 합페 [${pth}] (신뢰도 ${(confidence * 100).toFixed(1)}%) [margin: A=${cbA} B=${cbB}]`);
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

  console.log(`\n  📊 ${label} 결과: 전체 ${files.length}장 중 합페 ${spreads.length}건 감지`);
  for (const s of spreads) {
    console.log(`     p${s.pageA}-p${s.pageB}  [${s.path}] (신뢰도 ${(s.confidence * 100).toFixed(1)}%)`);
  }

  return spreads;
}

// ── 메인 ──
async function main() {
  const baseDir = path.resolve('sample');
  const allResults = {};

  const targets = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 3];
  for (const num of targets) {
    const dir = path.join(baseDir, String(num));
    const spreads = await analyzeFolder(dir, `Sample ${num}`);
    allResults[num] = spreads || [];
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📋 전체 요약');
  console.log(`${'═'.repeat(60)}`);
  for (const [num, spreads] of Object.entries(allResults)) {
    console.log(`  Sample ${num}: 합페 ${spreads.length}건`);
    for (const s of spreads) {
      console.log(`    p${s.pageA}-p${s.pageB} [${s.path}] (${(s.confidence * 100).toFixed(1)}%)`);
    }
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
