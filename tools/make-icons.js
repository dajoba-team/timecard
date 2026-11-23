// 앱 아이콘 만들기 (v41): 파란 바탕 + 흰 시계 PNG → public/icons/ (외부 도구 없이 Node만으로)
// 실행: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x2A, 0x3F, 0xC7], FG = [0xFF, 0xFF, 0xFF], ACC = [0xFF, 0xD1, 0x66];
function crc32(buf){ let c, crc = 0xFFFFFFFF; for (const b of buf){ c = (crc ^ b) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data){ const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, pixel){
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++){ raw[y * (size * 3 + 1)] = 0; for (let x = 0; x < size; x++){ const [r, g, b] = pixel(x, y); const o = y * (size * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level:9 })), chunk('IEND', Buffer.alloc(0))]);
}
// 선분까지 거리
function segDist(px, py, ax, ay, bx, by){ const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
// 한 점(0~1 좌표)의 색: 0 바탕, 1 흰색, 2 노랑
function shape(u, v){
  const cx = 0.5, cy = 0.5, r = Math.hypot(u - cx, v - cy);
  if (r <= 0.045) return 2;                                   // 가운데 점
  if (r >= 0.255 && r <= 0.315) return 1;                     // 시계 테두리
  for (let i = 0; i < 12; i++){ const a = i * Math.PI / 6, x = cx + Math.sin(a) * 0.215, y = cy - Math.cos(a) * 0.215; if (Math.hypot(u - x, v - y) <= (i % 3 === 0 ? 0.02 : 0.011)) return 1; }   // 눈금
  if (segDist(u, v, cx, cy, cx, cy - 0.19) <= 0.026) return 1;                                        // 분침 (12시)
  if (segDist(u, v, cx, cy, cx + 0.115, cy + 0.065) <= 0.03) return 1;                                // 시침 (4시쯤)
  return 0;
}
function draw(size){
  const S = 4;   // 4×4 표본으로 부드럽게
  return png(size, (x, y) => {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++){
      const k = shape((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size), c = k === 1 ? FG : k === 2 ? ACC : BG;
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
    }
    return acc.map(v => Math.round(v / (S * S)));
  });
}
const out = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive:true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]){
  fs.writeFileSync(path.join(out, name), draw(size));
  console.log('만듦', name, size);
}
