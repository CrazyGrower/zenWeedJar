import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function load() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(PUBLIC, 'stash-model.js'), 'utf8'), ctx);
  return ctx.window.StashModel;
}
const jar = (id, extra = {}) => ({ id, name: `J${id}`, weight_g: 10, color_tag: '#79a67e', harvest_date: '13/07', ...extra });
// Arrays and objects built inside the vm belong to another realm, which strict
// deepEqual rejects even when they match: compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

test('fillFraction measures against an 80 g jar and clamps', () => {
  const M = load();
  assert.equal(M.CAPACITY_G, 80);
  assert.equal(M.fillFraction(40), 0.5);
  assert.equal(M.fillFraction(0), 0);
  assert.equal(M.fillFraction(80), 1);
  assert.equal(M.fillFraction(120), 1, 'over capacity is simply full');
  assert.equal(M.fillFraction(-3), 0);
  assert.equal(M.fillFraction('abc'), 0);
  assert.equal(M.fillFraction('20'), 0.25, 'SQLite REALs can arrive as strings');
});

test('there are always at least two shelves, then one per three jars', () => {
  const M = load();
  assert.equal(M.shelfCount(0), 2);
  assert.equal(M.shelfCount(6), 2);
  assert.equal(M.shelfCount(7), 3);
  assert.equal(M.shelfCount(13), 5);
});

test('layoutShelves fills from the top shelf, left to right, by id', () => {
  const M = load();
  const { shelves, slots } = M.layoutShelves([jar(5), jar(2), jar(9), jar(1)]);
  assert.equal(shelves, 2);
  assert.deepEqual(plain(slots.map((s) => [s.jar.id, s.shelf, s.col])), [[1, 0, 0], [2, 0, 1], [5, 0, 2], [9, 1, 0]]);
});

test('layoutShelves places every one of 13 jars exactly once', () => {
  const M = load();
  const list = Array.from({ length: 13 }, (_, i) => jar(i + 1));
  const { shelves, slots } = M.layoutShelves(list);
  assert.equal(shelves, 5);
  assert.equal(slots.length, 13);
  assert.equal(new Set(slots.map((s) => `${s.shelf}:${s.col}`)).size, 13, 'no two jars share a spot');
  assert.ok(slots.every((s) => s.shelf < shelves && s.col < M.PER_SHELF));
});

test('editing a jar never moves it', () => {
  const M = load();
  const before = M.layoutShelves([jar(1), jar(2), jar(3), jar(4)]).slots.map((s) => [s.jar.id, s.shelf, s.col]);
  const after = M.layoutShelves([jar(1), jar(2, { weight_g: 0, name: 'Zzz' }), jar(3), jar(4)]).slots.map((s) => [s.jar.id, s.shelf, s.col]);
  assert.deepEqual(plain(after), plain(before));
});

test('layoutShelves accepts an empty or missing list', () => {
  const M = load();
  assert.deepEqual(plain(M.layoutShelves([]).slots), []);
  assert.equal(M.layoutShelves(undefined).shelves, 2);
});

test('capColor keeps a #rrggbb colour and falls back otherwise', () => {
  const M = load();
  assert.equal(M.capColor('#e2a04c'), '#e2a04c');
  assert.equal(M.capColor('#E2A04C'), '#E2A04C');
  for (const bad of ['#abc', 'red', '', null, undefined, ' #e2a04c', '"/><img src=x>']) {
    assert.equal(M.capColor(bad), '#79a67e', `${bad} should fall back`);
  }
});

test('budTint is purple only for plum and violet caps', () => {
  const M = load();
  assert.equal(M.budTint('#b07d9c'), 'purple', 'the Liver plum cap');
  assert.equal(M.budTint('#7d58a6'), 'purple');
  assert.equal(M.budTint('#79a67e'), 'green');
  assert.equal(M.budTint('#e2a04c'), 'green');
  assert.equal(M.budTint('#8fb0d0'), 'green', 'sky blue stays green');
  assert.equal(M.budTint('#d08fa8'), 'green', 'pink is outside the purple band');
  assert.equal(M.budTint('#888888'), 'green', 'grey has no hue');
  assert.equal(M.budTint('nope'), 'green');
});

test('takeGrams removes grams without going below zero', () => {
  const M = load();
  assert.equal(M.takeGrams(65, 1), 64);
  assert.equal(M.takeGrams(65, 0.5), 64.5);
  assert.equal(M.takeGrams(0.3, 2), 0);
  assert.equal(M.takeGrams(10.15, 0.05), 10.1, 'rounded to the tenth');
  assert.equal(M.takeGrams('12', 2), 10);
});

test('tapeLines gives name, weight and date, and clips what would overflow the tape', () => {
  const M = load();
  assert.deepEqual(plain(M.tapeLines(jar(1, { name: 'Mango', weight_g: 12.5, harvest_date: '23/07' }))), { name: 'Mango', weight: '12,5 g', date: '23/07' });
  assert.deepEqual(plain(M.tapeLines(jar(1, { name: 'Gelato 41 Super Long', weight_g: 120 }))), { name: 'Gelato 41 .', weight: '120 g', date: '13/07' });
  assert.equal(M.tapeLines(jar(1, { name: '   ' })).name, 'Sans nom');
  assert.equal(M.tapeLines(jar(1, { harvest_date: null })).date, '');
  assert.equal(M.tapeLines(jar(1, { harvest_date: '2026-07-13' })).date, '2026.');
  assert.equal(M.tapeLines(jar(1, { name: '<img src=x onerror=alert(1)>' })).name.length, 11, 'clipped like any text; it is drawn on a canvas, never parsed');
});

test('dropTargets animates everything once, then only newcomers', () => {
  const M = load();
  const list = [jar(1), jar(2), jar(3)];
  assert.deepEqual(plain(M.dropTargets(null, list, false)), [1, 2, 3], 'first load: every jar drops in');
  assert.deepEqual(plain(M.dropTargets(new Set([1, 2, 3]), list, false)), [], 'a weight edit replays nothing');
  assert.deepEqual(plain(M.dropTargets(new Set([1, 2]), list, false)), [3], 'a new jar drops in on its own');
  assert.deepEqual(plain(M.dropTargets(null, list, true)), [], 'reduced motion: never');
});
