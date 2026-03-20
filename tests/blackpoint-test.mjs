/**
 * BlackPointAnalyzer 검증 스크립트
 * sample/1/ 폴더의 모든 이미지에 대해 블랙포인트를 검출한다.
 * 기대값: 모든 이미지에서 #000000
 *
 * 사용법: node tests/blackpoint-test.mjs
 */
import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join } from 'path';

const sampleArg = process.argv[2] || '1';
const expectedHex = process.argv[3] || '#000000';
const SAMPLE_DIR = join(import.meta.dirname, '..', 'sample', sampleArg);

// ── BlackPointAnalyzer 핵심 로직 (Node.js 이식) ──

function detectGrayscale(pixels, totalPixels) {
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
}

function detectBlackPoint(pixels, totalPixels) {
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
    // 보더(lum 0-2) 뒤의 골짜기를 추적하며, 골짜기 대비 3배 이상 + 첨예한
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
        if (smoothed[i] < valleyMin * VALLEY_RATIO) continue;
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

async function analyzeImage(filePath) {
  // sharp로 RGBA raw 픽셀 추출 (800px 다운스케일)
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
  const isGrayscale = detectGrayscale(pixels, totalPixels);

  if (!isGrayscale) {
    return {
      isGrayscale: false,
      blackPoint: { r: 0, g: 0, b: 0, hex: '#000000' },
      isPureBlack: true,
      confidence: 1.0
    };
  }

  const result = detectBlackPoint(pixels, totalPixels);
  return { isGrayscale: true, ...result };
}

// ── 실행 ──

const files = (await readdir(SAMPLE_DIR))
  .filter(f => /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(f))
  .sort();

console.log(`\n=== BlackPoint 검출 테스트 (sample/${sampleArg}, ${files.length}장, expected=${expectedHex}) ===\n`);

let passCount = 0;
let failCount = 0;
const failures = [];

for (const file of files) {
  const filePath = join(SAMPLE_DIR, file);
  const result = await analyzeImage(filePath);
  const hex = result.blackPoint.hex;
  const pass = hex === expectedHex;

  if (pass) {
    passCount++;
  } else {
    failCount++;
    failures.push({ file, hex, ...result });
    console.log(`  FAIL  ${file}  →  ${hex}  (grayscale=${result.isGrayscale}, confidence=${result.confidence?.toFixed(2)})`);
  }
}

console.log(`\n── 결과 ──`);
console.log(`  PASS: ${passCount}/${files.length}`);
console.log(`  FAIL: ${failCount}/${files.length}`);

if (failures.length > 0) {
  console.log(`\n── 실패 목록 ──`);
  for (const f of failures) {
    console.log(`  ${f.file}: ${f.hex} (R=${f.blackPoint.r}, G=${f.blackPoint.g}, B=${f.blackPoint.b}, grayscale=${f.isGrayscale})`);
  }
}

console.log();
