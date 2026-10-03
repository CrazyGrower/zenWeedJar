import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function load() {
  const ctx = vm.createContext({ window: {}, Uint8ClampedArray });
  vm.runInContext(fs.readFileSync(path.join(PUBLIC, 'tape-label.js'), 'utf8'), ctx);
  return ctx.window.TapeLabel;
}

test('quantizeToPalette snaps every visible pixel to the nearest palette colour', () => {
  const T = load();
  const data = new Uint8ClampedArray([
    40, 25, 20, 200,     // near ink
    230, 220, 190, 255,  // near tape
    125, 80, 50, 180,    // near date brown
  ]);
  T.quantizeToPalette(data, T.PALETTE);
  assert.deepEqual([...data.slice(0, 4)], [42, 22, 16, 255]);
  assert.deepEqual([...data.slice(4, 8)], [239, 228, 196, 235]);
  assert.deepEqual([...data.slice(8, 12)], [120, 84, 52, 255]);
});

test('quantizeToPalette clears faint anti-aliasing instead of smearing it', () => {
  const T = load();
  const data = new Uint8ClampedArray([42, 22, 16, 60, 42, 22, 16, 110]);
  T.quantizeToPalette(data, T.PALETTE, 110);
  assert.equal(data[3], 0, 'below the cut: transparent');
  assert.equal(data[7], 255, 'at the cut: kept, fully opaque ink');
});

test('the tape is drawn at ×1 and shown at twice its layout size', () => {
  const T = load();
  assert.equal(T.TAPE_W, 64);
  assert.equal(T.TAPE_H, 27);
  assert.equal(T.CSS_SCALE, 2);
  const made = [];
  const doc = { createElement: () => { const c = { style: {} }; made.push(c); return c; } };
  const c = T.createCanvas(doc);
  assert.equal(c.width, 128);
  assert.equal(c.height, 54);
  assert.equal(c.style.width, '128px');
  assert.equal(c.className, 'tape');
});
