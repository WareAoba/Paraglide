// tests/spread-edge-inspect.mjs
// 합페 후보 쌍의 가장자리 픽셀을 시각화하여 알고리즘 튜닝에 활용한다.
// 실행: node tests/spread-edge-inspect.mjs

import sharp from 'sharp';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SpreadDetector } = require('../src/utils/SpreadDetector');

const SAMPLE_DIR = path.resolve('sample');
const H = SpreadDetector.ANALYSIS_HEIGHT;

async function loadImageData(filePath) {
  const img = sharp(filePath);
  const meta = await img.metadata();
  const scale = H / meta.height;
  const targetW = Math.max(20, Math.floor(meta.width * scale));
  const { data, info } = await img
    .resize(targetW, H, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, origWidth: meta.width, origHeight: meta.height };
}

function getPixel(imgData, x, y) {
  const o = (y * imgData.width + x) * 3;
  return { r: imgData.data[o], g: imgData.data[o + 1], b: imgData.data[o + 2] };
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// 가장자리 열의 휘도 분포를 요약
function summarizeColumn(imgData, x) {
  let white = 0, black = 0, mid = 0;
  const lumSamples = [];
  for (let y = 0; y < H; y++) {
    const { r, g, b } = getPixel(imgData, x, y);
    const lum = luminance(r, g, b);
    if (lum >= 240) white++;
    else if (lum <= 15) black++;
    else mid++;
    if (y % 60 === 0) lumSamples.push(Math.round(lum)); // 10개 샘플
  }
  return { white, black, mid, lumSamples };
}

async function inspectPair(pageA, pageB) {
  const fileA = path.join(SAMPLE_DIR, String(pageA).padStart(5, '0') + '.jpeg');
  const fileB = path.join(SAMPLE_DIR, String(pageB).padStart(5, '0') + '.jpeg');

  const imgA = await loadImageData(fileA);
  const imgB = await loadImageData(fileB);

  console.log(`\n${'━'.repeat(60)}`);
  console.log(`📖 p${pageA} (${imgA.origWidth}×${imgA.origHeight}) → p${pageB} (${imgB.origWidth}×${imgB.origHeight})`);
  console.log(`   스케일링: A=${imgA.width}×${imgA.height}, B=${imgB.width}×${imgB.height}`);

  // A의 왼쪽 가장자리 (접합면 후보 — 현재 알고리즘)
  console.log(`\n   ── A(p${pageA}) 왼쪽 가장자리 ──`);
  for (let x = 0; x < Math.min(20, imgA.width); x++) {
    const s = summarizeColumn(imgA, x);
    const bar = `W:${s.white} B:${s.black} M:${s.mid}`;
    const lumStr = s.lumSamples.join(',');
    console.log(`   x=${String(x).padStart(2)}: ${bar.padEnd(20)} lum=[${lumStr}]`);
  }

  // B의 오른쪽 가장자리 (접합면 후보 — 현재 알고리즘)
  console.log(`\n   ── B(p${pageB}) 오른쪽 가장자리 ──`);
  for (let d = 0; d < Math.min(20, imgB.width); d++) {
    const x = imgB.width - 1 - d;
    const s = summarizeColumn(imgB, x);
    const bar = `W:${s.white} B:${s.black} M:${s.mid}`;
    const lumStr = s.lumSamples.join(',');
    console.log(`   d=${String(d).padStart(2)}: ${bar.padEnd(20)} lum=[${lumStr}]`);
  }

  // A의 오른쪽 가장자리 (반대 접합면)
  console.log(`\n   ── A(p${pageA}) 오른쪽 가장자리 ──`);
  for (let d = 0; d < Math.min(20, imgA.width); d++) {
    const x = imgA.width - 1 - d;
    const s = summarizeColumn(imgA, x);
    const bar = `W:${s.white} B:${s.black} M:${s.mid}`;
    const lumStr = s.lumSamples.join(',');
    console.log(`   d=${String(d).padStart(2)}: ${bar.padEnd(20)} lum=[${lumStr}]`);
  }

  // B의 왼쪽 가장자리 (반대 접합면)
  console.log(`\n   ── B(p${pageB}) 왼쪽 가장자리 ──`);
  for (let x = 0; x < Math.min(20, imgB.width); x++) {
    const s = summarizeColumn(imgB, x);
    const bar = `W:${s.white} B:${s.black} M:${s.mid}`;
    const lumStr = s.lumSamples.join(',');
    console.log(`   x=${String(x).padStart(2)}: ${bar.padEnd(20)} lum=[${lumStr}]`);
  }

  // ── 양방향 일치율 테스트 (뎁스별) ──
  console.log(`\n   ── 일치율 비교 ──`);

  for (const [label, sideA, sideB] of [['A.left↔B.right', 'left', 'right'], ['A.right↔B.left', 'right', 'left']]) {
    console.log(`\n   ${label}:`);
    for (let depth = 0; depth < 15; depth++) {
      const xA = sideA === 'left' ? depth : imgA.width - 1 - depth;
      const xB = sideB === 'left' ? depth : imgB.width - 1 - depth;
      if (xA < 0 || xA >= imgA.width || xB < 0 || xB >= imgB.width) break;

      let complex = 0, matching = 0;
      for (let y = 0; y < H; y++) {
        const pA = getPixel(imgA, xA, y);
        const pB = getPixel(imgB, xB, y);
        const lumA = luminance(pA.r, pA.g, pA.b);
        const lumB = luminance(pB.r, pB.g, pB.b);
        const simA = lumA >= 240 || lumA <= 15;
        const simB = lumB >= 240 || lumB <= 15;
        if (simA && simB) continue;
        complex++;
        const diff = Math.max(Math.abs(pA.r - pB.r), Math.abs(pA.g - pB.g), Math.abs(pA.b - pB.b));
        if (diff <= 25) matching++;
      }
      const ratio = complex > 0 ? (matching / complex * 100).toFixed(1) : '0.0';
      const cRatio = (complex / H * 100).toFixed(1);
      console.log(`     depth=${String(depth).padStart(2)}: match=${ratio.padStart(5)}% complex=${cRatio.padStart(5)}%`);
    }
  }
}

async function main() {
  // 가장 유력한 후보들 검사
  const pairs = [[28, 29], [50, 51], [9, 10], [43, 44]];
  for (const [a, b] of pairs) {
    await inspectPair(a, b);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
