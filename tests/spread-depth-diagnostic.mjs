// tests/spread-depth-diagnostic.mjs
// 합페 판정 깊이 진단: depths 0~6에서의 분석 결과를 출력
// node tests/spread-depth-diagnostic.mjs

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SpreadDetector } = require('../src/store/utils/SpreadDetector');

const H = SpreadDetector.ANALYSIS_HEIGHT;
const TEST_DEPTHS = [0, 2, 4, 6, 8];

async function loadImageData(filePath) {
  const img = sharp(filePath);
  const meta = await img.metadata();
  const scale = H / meta.height;
  const targetW = Math.max(20, Math.floor(meta.width * scale));
  const { data, info } = await img
    .resize(targetW, H, { fit: 'fill' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, origWidth: meta.width, origHeight: meta.height };
}

function getPixel(buf, w, x, y) {
  const o = (y * w + x) * 3;
  return [buf[o], buf[o + 1], buf[o + 2]];
}

function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

function findCB(imgData, side) {
  const { width, height, data } = imgData;
  const mx = Math.min(SpreadDetector.MARGIN_SCAN_MAX, Math.floor(width * 0.3));
  for (let d = 0; d < mx; d++) {
    const x = side === 'left' ? d : width - 1 - d;
    let u = 0;
    for (let y = 0; y < height; y++) {
      const l = lum(...getPixel(data, width, x, y));
      if (l >= SpreadDetector.SIMPLE_HIGH || l <= SpreadDetector.SIMPLE_LOW) u++;
    }
    if (u / height < SpreadDetector.MARGIN_UNIFORM_RATIO) return d;
  }
  return mx;
}

function getStripFromData(imgData, side, depthFromEdge) {
  const sw = SpreadDetector.STRIP_WIDTH;
  const { width, height, data } = imgData;
  let sx = side === 'left' ? depthFromEdge : width - 1 - depthFromEdge - (sw - 1);
  sx = Math.max(0, Math.min(sx, width - sw));
  const avg = new Uint8ClampedArray(height * 4);
  for (let y = 0; y < height; y++) {
    let rs = 0, gs = 0, bs = 0;
    for (let i = 0; i < sw; i++) {
      const [r, g, b] = getPixel(data, width, sx + i, y);
      rs += r; gs += g; bs += b;
    }
    const o = y * 4;
    avg[o] = Math.round(rs / sw);
    avg[o + 1] = Math.round(gs / sw);
    avg[o + 2] = Math.round(bs / sw);
    avg[o + 3] = 255;
  }
  return avg;
}

async function main() {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const dir = path.resolve('sample', String(n));
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    console.log(`\n${'═'.repeat(60)}\nSample ${n} (${files.length}장)\n${'─'.repeat(60)}`);

    const imgs = [];
    for (const f of files) {
      const fp = path.join(dir, f);
      const pm = f.match(/(\d+)/);
      const pg = pm ? parseInt(pm[1], 10) : imgs.length + 1;
      imgs.push({ page: pg, ...(await loadImageData(fp)) });
    }

    for (let i = 1; i < imgs.length; i++) {
      const a = imgs[i - 1], b = imgs[i];
      const hr = Math.min(a.origHeight, b.origHeight) / Math.max(a.origHeight, b.origHeight);
      if (hr < SpreadDetector.HEIGHT_RATIO_MIN) continue;

      const cbA = findCB(a, 'left'), cbB = findCB(b, 'right');
      if (cbA >= SpreadDetector.MARGIN_REJECT_BOTH && cbB >= SpreadDetector.MARGIN_REJECT_BOTH) continue;

      const maxD = Math.max(...TEST_DEPTHS) + SpreadDetector.STRIP_WIDTH;
      if (cbA + maxD > a.width || cbB + maxD > b.width) continue;

      const res = [];
      for (const d of TEST_DEPTHS) {
        const sA = getStripFromData(a, 'left', cbA + d);
        const sB = getStripFromData(b, 'right', cbB + d);
        res.push({ d, ...SpreadDetector._analyzeColumnPair(sA, sB) });
      }

      // d0에서 match>35% 이거나 corr>40%이면 출력 (TP/FP 후보)
      const d0 = res[0];
      if (d0.matchRatio <= 0.35 && d0.correlation <= 0.40) continue;

      // 현재 알고리즘으로 판정
      let pass02 = 0;
      for (const d of [0, 2]) {
        const r = res.find(x => x.d === d);
        if (r.pass) pass02++;
      }
      const isCurrentSpread =
        (pass02 >= 2 && d0.correlation >= SpreadDetector.SEAM_CORR_MIN) ||
        (d0.pass && d0.matchRatio >= SpreadDetector.MATCH_THRESHOLD && d0.correlation >= SpreadDetector.CORRELATION_THRESHOLD);

      const tag = isCurrentSpread ? '✅' : '  ';
      console.log(`${tag} p${a.page}-p${b.page} [mA=${cbA} mB=${cbB}]`);
      for (const r of res) {
        const m = r.pass ? '✓' : '✗';
        console.log(`    ${m} d=${r.d}: match=${(r.matchRatio * 100).toFixed(1)}% cpx=${(r.complexRatio * 100).toFixed(1)}% corr=${(r.correlation * 100).toFixed(1)}%`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
