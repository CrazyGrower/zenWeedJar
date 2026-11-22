// Renders the still icon files from the pixel grid in public/favicon.js:
// favicon.png (64px, crisp on retina tabs) and apple-touch-icon.png (180px,
// what the iPhone home screen shows). Run `npm run icons` after changing the
// drawing, then `npm run stamp`.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function loadIcon() {
  const ctx = {};
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(publicDir, 'favicon.js'), 'utf8'), ctx);
  return ctx.StashIcon;
}

const CRC = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = ~0; for (const v of buf) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (~c) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

// The grid scaled to size x size. A size that is not a multiple of the grid
// (180) averages the grid pixels each output pixel straddles.
export function renderPng(grid, size) {
  const S = grid.length, SUB = 8;
  const rgb = grid.map((row) => row.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))));
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) {
        const c = rgb[Math.floor((y + (j + 0.5) / SUB) * S / size)][Math.floor((x + (i + 0.5) / SUB) * S / size)];
        sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(sum[k] / (SUB * SUB));
    }
  }
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export const ICON_FILES = { 'favicon.png': 64, 'apple-touch-icon.png': 180 };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const grid = loadIcon().draw(0);
  for (const [name, size] of Object.entries(ICON_FILES)) {
    fs.writeFileSync(path.join(publicDir, name), renderPng(grid, size));
    console.log(`${name} ${size}px`);
  }
}
