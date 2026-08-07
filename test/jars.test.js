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

test('updateJar changes only provided fields (adjust weight)', () => {
  const db = freshDb();
  const first = listJars(db)[0];
  const updated = updateJar(db, first.id, { weight_g: first.weight_g - 2 });
  assert.equal(updated.weight_g, first.weight_g - 2);
  assert.equal(updated.name, first.name);
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
