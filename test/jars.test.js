import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { listJars, getJar, createJar, updateJar, deleteJar, ValidationError } from '../jars.js';

function freshDb() { return openDb(':memory:'); }

test('listJars returns the 4 seeds', () => {
  assert.equal(listJars(freshDb()).length, 4);
});

test('createJar inserts and returns the row', () => {
  const db = freshDb();
  const jar = createJar(db, { name: 'Kush', weight_g: 12, color_tag: '#b07d9c' });
  assert.equal(jar.name, 'Kush');
  assert.equal(jar.weight_g, 12);
  assert.equal(listJars(db).length, 5);
});

test('createJar rejects missing name', () => {
  const db = freshDb();
  assert.throws(() => createJar(db, { weight_g: 5 }), ValidationError);
});

test('createJar rejects negative weight', () => {
  const db = freshDb();
  assert.throws(() => createJar(db, { name: 'X', weight_g: -1 }), ValidationError);
});

test('createJar rejects missing weight_g', () => {
  const db = freshDb();
  assert.throws(() => createJar(db, { name: 'X' }), ValidationError);
});

test('createJar rejects empty-string weight_g', () => {
  const db = freshDb();
  assert.throws(() => createJar(db, { name: 'X', weight_g: '' }), ValidationError);
});

test('createJar coerces empty-string thc_percent to null', () => {
  const db = freshDb();
  const jar = createJar(db, { name: 'X', weight_g: 1, thc_percent: '' });
  assert.equal(jar.thc_percent, null);
});

test('createJar coerces null indica_pct to null', () => {
  const db = freshDb();
  const jar = createJar(db, { name: 'X', weight_g: 1, indica_pct: null });
  assert.equal(jar.indica_pct, null);
});

test('createJar rejects non-numeric thc_percent', () => {
  const db = freshDb();
  assert.throws(() => createJar(db, { name: 'X', weight_g: 1, thc_percent: 'abc' }), ValidationError);
});

test('updateJar changes only provided fields (adjust weight)', () => {
  const db = freshDb();
  const first = listJars(db)[0];
  const updated = updateJar(db, first.id, { weight_g: first.weight_g - 2 });
  assert.equal(updated.weight_g, first.weight_g - 2);
  assert.equal(updated.name, first.name);
});

test('updateJar preserves all unmodified fields', () => {
  const db = freshDb();
  const jar = createJar(db, {
    name: 'Full', weight_g: 30, harvest_date: '01/01',
    thc_percent: 18.5, notes: 'earthy', color_tag: '#123456',
  });
  const updated = updateJar(db, jar.id, { weight_g: 25 });
  assert.equal(updated.weight_g, 25);
  assert.equal(updated.name, 'Full');
  assert.equal(updated.harvest_date, '01/01');
  assert.equal(updated.thc_percent, 18.5);
  assert.equal(updated.notes, 'earthy');
  assert.equal(updated.color_tag, '#123456');
});

test('updateJar rejects null weight_g', () => {
  const db = freshDb();
  const first = listJars(db)[0];
  assert.throws(() => updateJar(db, first.id, { weight_g: null }), ValidationError);
});

test('updateJar rejects empty name in partial update', () => {
  const db = freshDb();
  const first = listJars(db)[0];
  assert.throws(() => updateJar(db, first.id, { name: '' }), ValidationError);
});

test('updateJar rejects negative weight in partial update', () => {
  const db = freshDb();
  const first = listJars(db)[0];
  assert.throws(() => updateJar(db, first.id, { weight_g: -1 }), ValidationError);
});

test('updateJar returns null for unknown id', () => {
  assert.equal(updateJar(freshDb(), 9999, { weight_g: 1 }), null);
});

test('deleteJar removes the row', () => {
  const db = freshDb();
  const first = listJars(db)[0];
  assert.equal(deleteJar(db, first.id), true);
  assert.equal(deleteJar(db, first.id), false);
  assert.equal(listJars(db).length, 3);
});
