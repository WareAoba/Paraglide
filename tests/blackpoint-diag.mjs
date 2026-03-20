/**
 * 블랙포인트 히스토그램 진단 스크립트
 * 특정 이미지들의 lum 0~80 히스토그램(raw + smoothed)을 출력하여
 * 보더 vs 잉크 피크 분포를 확인한다.
 */
import sharp from 'sharp';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', 'sample');

const targets = [
  { file: join(ROOT, '5', '027.png'), label: 'S5/027 (#190e0c, R=25 expected R=35)' },
  { file: join(ROOT, '5', '249.png'), label: 'S5/249 (#281e1c, R=40 expected R=35)' },
  { file: join(ROOT, '5', '327.png'), label: 'S5/327 (#180e0c, R=24 expected R=35)' },
  { file: join(ROOT, '5', '190.png'), label: 'S5/190 (#221816, R=34 near-miss)' },
  { file: join(ROOT, '5', '100.png'), label: 'S5/100 (PASS sample for comparison)' },
];

async function analyzeHistogram(filePath) {
  const meta = await sharp(filePath).metadata();
  const scale = Math.min(1, 800 / Math.max(meta.width, meta.height));
  const w = Math.floor(meta.width * scale);
  const h = Math.floor(meta.height * scale);

  const { data: pixels } = await sharp(filePath)
    .resize(w, h, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = w * h;
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

  const DARK_LIMIT = 80;
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

  // lum 0-2 mass, lum 3-14 mass, lum 15-40 mass, lum 41-80 mass
  let band0_2 = 0, band3_14 = 0, band15_40 = 0, band41_80 = 0;
  for (let i = 0; i <= 2; i++) band0_2 += histogram[i];
  for (let i = 3; i <= 14; i++) band3_14 += histogram[i];
  for (let i = 15; i <= 40; i++) band15_40 += histogram[i];
  for (let i = 41; i <= 80; i++) band41_80 += histogram[i];

  return { histogram, smoothed, totalOpaque, darkTotal, band0_2, band3_14, band15_40, band41_80, rgbBins, w, h };
}

for (const { file, label } of targets) {
  const d = await analyzeHistogram(file);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}`);
  console.log(`  Size: ${d.w}x${d.h}, Opaque: ${d.totalOpaque}, Dark(0-80): ${d.darkTotal} (${(d.darkTotal/d.totalOpaque*100).toFixed(1)}%)`);
  console.log(`  Band 0-2: ${d.band0_2} (${(d.band0_2/d.totalOpaque*100).toFixed(2)}%)`);
  console.log(`  Band 3-14: ${d.band3_14} (${(d.band3_14/d.totalOpaque*100).toFixed(2)}%)`);
  console.log(`  Band 15-40: ${d.band15_40} (${(d.band15_40/d.totalOpaque*100).toFixed(2)}%)`);
  console.log(`  Band 41-80: ${d.band41_80} (${(d.band41_80/d.totalOpaque*100).toFixed(2)}%)`);
  
  // Print smoothed histogram for lum 0-50
  console.log(`  Smoothed histogram (lum 0-50):`);
  const maxSmoothed = Math.max(...Array.from(d.smoothed).slice(0, 51));
  for (let i = 0; i <= 50; i++) {
    const barLen = Math.round(d.smoothed[i] / maxSmoothed * 50);
    const bar = '#'.repeat(barLen);
    const avgR = d.rgbBins[i].n > 0 ? Math.round(d.rgbBins[i].r / d.rgbBins[i].n) : 0;
    const avgG = d.rgbBins[i].n > 0 ? Math.round(d.rgbBins[i].g / d.rgbBins[i].n) : 0;
    const avgB = d.rgbBins[i].n > 0 ? Math.round(d.rgbBins[i].b / d.rgbBins[i].n) : 0;
    if (d.smoothed[i] > 0.5) {
      console.log(`    lum ${String(i).padStart(2)}: ${String(Math.round(d.smoothed[i])).padStart(6)} ${bar} (RGB ${avgR},${avgG},${avgB})`);
    }
  }
}
