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

test('tapeScale shrinks a tape only as much as it takes to clear its neighbour', () => {
  const T = load();
  assert.equal(T.tapeScale(200), 1, 'room to spare: native size, never enlarged');
  assert.equal(T.tapeScale(132), 1, 'exactly a tape plus the gap');
  assert.equal(T.tapeScale(66), 0.5);
  assert.equal(T.tapeScale(10), 0.5, 'never below half, where the text stops being legible');
  assert.equal(T.tapeScale(NaN), 1);
});

// A stand-in for canvas measureText, proportional to the font size with the
// advances measured in Chrome for the shipped fonts (Jersey 10 is narrow:
// "59,4 g" at 15px is 29.7, "23/07" 28.9).
const measure = (text, font) => {
  const px = Number(font.match(/(\d+)px/)[1]);
  return String(text).length * px * (font.includes('Jersey') ? 0.36 : 0.47);
};

test('layoutTape keeps the date beside the weight at full size when there is room', () => {
  const T = load();
  const l = T.layoutTape({ name: 'Mango', weight: '40 g', date: '10/04' }, measure);
  assert.equal(l.dateLine, 'weight');
  assert.equal(l.weightFont, T.WEIGHT_FONT);
  assert.equal(l.dateFont, T.DATE_FONT);
});

test('layoutTape shrinks the weight and date a notch so a decimal weight keeps its date', () => {
  const T = load();
  const l = T.layoutTape({ name: 'Mango', weight: '59,4 g', date: '23/07' }, measure);
  assert.equal(l.dateLine, 'weight');
  assert.equal(l.date, '23/07');
  assert.notEqual(l.weightFont, T.WEIGHT_FONT, 'the weight is drawn a little smaller');
  assert.notEqual(l.dateFont, T.DATE_FONT, 'and so is the date');
});

test('layoutTape moves the date beside the name when even the small weight is too wide', () => {
  const T = load();
  const l = T.layoutTape({ name: 'Mango', weight: '1234,5 g', date: '10/04' }, measure);
  assert.equal(l.dateLine, 'name');
  assert.equal(l.name, 'Mango');
});

test('layoutTape drops the date only when no line has room, and never clips the name for it', () => {
  const T = load();
  const l = T.layoutTape({ name: 'Gelato 41', weight: '1234,5 g', date: '01/08' }, measure);
  assert.equal(l.dateLine, null);
  assert.equal(l.name, 'Gelato 41');
});

test('layoutTape clips a name to the tape width, not to a character count', () => {
  const T = load();
  const l = T.layoutTape({ name: 'WWWWWWWWWWW', weight: '1 g', date: '' }, (t, f) => (f.includes('10px') ? t.length * 7 : t.length * 4));
  assert.ok(l.name.endsWith('.'));
  assert.ok(l.name.length * 7 <= T.TAPE_W - 15, `"${l.name}" should fit between the torn ends`);
  assert.equal(l.dateLine, null, 'no date, nothing to place');
});

test('the tape writes its date in Jersey 10, whose digits stay legible at that size', () => {
  const T = load();
  assert.match(T.DATE_FONT, /Jersey 10/);
});
