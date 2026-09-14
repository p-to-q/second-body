// Minimal PNG decode (8-bit RGB/RGBA, non-interlaced) and RGB encode. No deps.
import { inflateSync, deflateSync } from 'node:zlib';

export function decodePng(buf) {
  let off = 8, w = 0, h = 0, ctype = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9]; }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 0 ? 1 : 4;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 3);
  const stride = w * ch;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 3;
      if (ch === 1) { out[d] = out[d + 1] = out[d + 2] = line[s]; } else { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; }
    }
    prev = line;
  }
  return { w, h, rgb: out };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export function encodePng(w, h, rgb) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** mean luma 0..255, spread (stddev of luma), mean rgb hex */
export function stats({ w, h, rgb }) {
  let sum = 0, sq = 0, r = 0, g = 0, b = 0; const n = w * h;
  for (let i = 0; i < n; i++) {
    const R = rgb[i * 3], G = rgb[i * 3 + 1], B = rgb[i * 3 + 2];
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B; sum += l; sq += l * l; r += R; g += G; b += B;
  }
  const mean = sum / n;
  const hex = '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  return { luma: Math.round(mean), spread: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean))), hex };
}

/** horizontal strip of frames (all same size), 4px dark gutters */
export function strip(frames) {
  if (!frames.length) return null;
  const { w, h } = frames[0]; const gap = 4;
  const W = frames.length * w + (frames.length - 1) * gap;
  const rgb = Buffer.alloc(W * h * 3, 128);
  frames.forEach((f, i) => {
    const x0 = i * (w + gap);
    for (let y = 0; y < Math.min(h, f.h); y++) f.rgb.copy(rgb, (y * W + x0) * 3, y * f.w * 3, (y * f.w + Math.min(w, f.w)) * 3);
  });
  return encodePng(W, h, rgb);
}
