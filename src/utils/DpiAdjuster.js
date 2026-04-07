// src/utils/DpiAdjuster.js
// 이미지 파일의 DPI(해상도) 메타데이터를 수정한다.
// JPEG (JFIF APP0), PNG (pHYs 청크) 지원.

// ─── CRC-32 계산 (PNG 청크용) ───
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const DpiAdjuster = {
  /**
   * 이미지 버퍼의 DPI 메타데이터를 변경한다.
   * @param {Buffer} buffer - 이미지 파일 바이너리
   * @param {number} dpi - 목표 DPI (예: 72)
   * @returns {Buffer} DPI가 수정된 버퍼
   */
  setDpi(buffer, dpi) {
    const fmt = this._detectFormat(buffer);
    if (fmt === 'jpeg') return this._setJpegDpi(buffer, dpi);
    if (fmt === 'png') return this._setPngDpi(buffer, dpi);
    return buffer;
  },

  _detectFormat(buffer) {
    if (buffer.length < 8) return null;
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
    return null;
  },

  // ─── JPEG: JFIF APP0 마커의 density 필드 수정 ───
  _setJpegDpi(buffer, dpi) {
    if (buffer.length < 20) return buffer;

    let offset = 2; // SOI(FF D8) 이후
    while (offset < buffer.length - 4) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];

      if (marker === 0xE0) { // APP0 (JFIF)
        if (offset + 14 < buffer.length &&
            buffer[offset + 4] === 0x4A && // 'J'
            buffer[offset + 5] === 0x46 && // 'F'
            buffer[offset + 6] === 0x49 && // 'I'
            buffer[offset + 7] === 0x46 && // 'F'
            buffer[offset + 8] === 0x00) { // '\0'
          const newBuf = Buffer.from(buffer);
          newBuf[offset + 11] = 1; // units = DPI
          newBuf.writeUInt16BE(dpi, offset + 12); // Xdensity
          newBuf.writeUInt16BE(dpi, offset + 14); // Ydensity
          return newBuf;
        }
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
        continue;
      }

      // SOS 또는 EOI에 도달하면 중단
      if (marker === 0xDA || marker === 0xD9) break;

      // 기타 마커: 길이 읽고 건너뛰기
      if (offset + 3 < buffer.length) {
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      } else {
        break;
      }
    }

    // JFIF APP0가 없으면 삽입
    const jfif = Buffer.alloc(18);
    jfif[0] = 0xFF;
    jfif[1] = 0xE0;
    jfif.writeUInt16BE(16, 2);   // 길이 (자기 자신 2바이트 포함)
    jfif[4] = 0x4A; jfif[5] = 0x46; jfif[6] = 0x49; jfif[7] = 0x46; jfif[8] = 0x00; // 'JFIF\0'
    jfif[9] = 1;    // 메이저 버전
    jfif[10] = 1;   // 마이너 버전
    jfif[11] = 1;   // units = DPI
    jfif.writeUInt16BE(dpi, 12); // Xdensity
    jfif.writeUInt16BE(dpi, 14); // Ydensity
    jfif[16] = 0;   // 썸네일 W
    jfif[17] = 0;   // 썸네일 H

    return Buffer.concat([buffer.slice(0, 2), jfif, buffer.slice(2)]);
  },

  // ─── PNG: pHYs 청크 수정 또는 삽입 ───
  _setPngDpi(buffer, dpi) {
    const ppm = Math.round(dpi / 0.0254); // pixels per meter

    let offset = 8; // PNG 시그니처(8바이트) 이후
    let idatOffset = -1;

    while (offset + 12 <= buffer.length) {
      const chunkLen = buffer.readUInt32BE(offset);
      const chunkType = buffer.toString('ascii', offset + 4, offset + 8);

      if (chunkType === 'pHYs' && chunkLen === 9) {
        // 기존 pHYs 수정
        const newBuf = Buffer.from(buffer);
        newBuf.writeUInt32BE(ppm, offset + 8);      // X pixels per unit
        newBuf.writeUInt32BE(ppm, offset + 12);     // Y pixels per unit
        newBuf[offset + 16] = 1;                     // unit = meter

        // CRC 재계산 (type + data 영역)
        const crcData = newBuf.slice(offset + 4, offset + 4 + 4 + chunkLen);
        const crcVal = crc32(crcData);
        newBuf.writeUInt32BE(crcVal, offset + 4 + 4 + chunkLen);
        return newBuf;
      }

      if (chunkType === 'IDAT' && idatOffset === -1) {
        idatOffset = offset;
      }

      offset += 12 + chunkLen; // length(4) + type(4) + data(chunkLen) + crc(4)
    }

    // pHYs가 없으면 IDAT 앞에 삽입
    if (idatOffset === -1) return buffer;

    // pHYs 청크 생성: length(4) + type(4) + data(9) + crc(4) = 21바이트
    const chunk = Buffer.alloc(21);
    chunk.writeUInt32BE(9, 0);                        // data length
    chunk.write('pHYs', 4, 'ascii');                  // type
    chunk.writeUInt32BE(ppm, 8);                      // X pixels per unit
    chunk.writeUInt32BE(ppm, 12);                     // Y pixels per unit
    chunk[16] = 1;                                    // unit = meter

    const crcInput = chunk.slice(4, 17);              // type(4) + data(9)
    chunk.writeUInt32BE(crc32(crcInput), 17);         // CRC

    return Buffer.concat([
      buffer.slice(0, idatOffset),
      chunk,
      buffer.slice(idatOffset)
    ]);
  }
};

module.exports = { DpiAdjuster };
