import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { listJars, getJar, createJar, updateJar, deleteJar, listEvents, ValidationError } from '../jars.js';

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

test('createJar rejects non-numeric types for weight_g', () => {
  const db = freshDb();
  // Number(true) is 1 and Number([]) is 0, so these coerce to valid weights
  // without a typeof guard.
  for (const weight_g of [true, false, [], [5], {}]) {
    assert.throws(() => createJar(db, { name: 'X', weight_g }), ValidationError);
  }
  assert.equal(listJars(db).length, 4);
});

test('createJar accepts numeric strings for weight_g (the form submits strings)', () => {
  const db = freshDb();
  assert.equal(createJar(db, { name: 'X', weight_g: '12.5' }).weight_g, 12.5);
});

test('createJar rejects non-string types for optional string fields', () => {
  const db = freshDb();
  for (const harvest_date of [{}, [], 42, true]) {
    assert.throws(() => createJar(db, { name: 'X', weight_g: 1, harvest_date }), ValidationError);
  }
  // null stays a legitimate "clear this field" value
  assert.equal(createJar(db, { name: 'X', weight_g: 1, harvest_date: null }).harvest_date, null);
});

test('createJar rejects non-numeric types for thc_percent', () => {
  const db = freshDb();
  assert.throws(() => createJar(db, { name: 'X', weight_g: 1, thc_percent: [] }), ValidationError);
  assert.throws(() => createJar(db, { name: 'X', weight_g: 1, indica_pct: true }), ValidationError);
  // '' and null still mean "no value"
  assert.equal(createJar(db, { name: 'X', weight_g: 1, thc_percent: '' }).thc_percent, null);
});

// --- the movement journal ----------------------------------------------------

const eventsOf = (db) => db.prepare('SELECT * FROM jar_events ORDER BY id').all();

test('createJar records an add event with the new weight and the new total', () => {
  const db = freshDb(); // 4 seeds, 237g
  const jar = createJar(db, { name: 'Kush', weight_g: 12 });
  const evs = eventsOf(db);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].kind, 'add');
  assert.equal(evs[0].jar_id, jar.id);
  assert.equal(evs[0].jar_name, 'Kush');
  assert.equal(evs[0].delta_g, 12);
  assert.equal(evs[0].total_after_g, 249);
});

test('deleteJar records a remove event with a negative delta', () => {
  const db = freshDb();
  const jar = listJars(db).find((j) => j.name === 'Mwhs'); // 77g
  assert.equal(deleteJar(db, jar.id), true);
  const evs = eventsOf(db);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].kind, 'remove');
  assert.equal(evs[0].jar_name, 'Mwhs');
  assert.equal(evs[0].delta_g, -77);
  assert.equal(evs[0].total_after_g, 160);
});

test('the journal survives the jar it describes', () => {
  const db = freshDb();
  const jar = createJar(db, { name: 'Ghost', weight_g: 5 });
  deleteJar(db, jar.id);
  const names = eventsOf(db).map((e) => e.jar_name);
  assert.deepEqual(names, ['Ghost', 'Ghost'], 'the name must survive as a snapshot');
});

test('updateJar records an adjust event with the signed difference', () => {
  const db = freshDb();
  const jar = listJars(db).find((j) => j.name === 'Mwhs'); // 77g
  updateJar(db, jar.id, { weight_g: 75 });
  const evs = eventsOf(db);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].kind, 'adjust');
  assert.equal(evs[0].delta_g, -2);
  assert.equal(evs[0].total_after_g, 235);
});

test('updateJar records nothing when the weight does not change', () => {
  const db = freshDb();
  const jar = listJars(db).find((j) => j.name === 'Mwhs');
  updateJar(db, jar.id, { name: 'Renamed', thc_percent: 21, color_tag: '#8fb0d0' });
  updateJar(db, jar.id, { weight_g: 77 }); // same weight, resent
  assert.equal(eventsOf(db).length, 0);
});

test('an adjust event carries the name as it is after the update', () => {
  const db = freshDb();
  const jar = listJars(db).find((j) => j.name === 'Mwhs');
  updateJar(db, jar.id, { name: 'Mwhs v2', weight_g: 70 });
  assert.equal(eventsOf(db)[0].jar_name, 'Mwhs v2');
});

test('a mutation on an unknown id records nothing', () => {
  const db = freshDb();
  assert.equal(updateJar(db, 9999, { weight_g: 1 }), null);
  assert.equal(deleteJar(db, 9999), false);
  assert.equal(eventsOf(db).length, 0);
});

test('a rejected mutation records nothing', () => {
  const db = freshDb();
  assert.throws(() => createJar(db, { name: 'X', weight_g: -1 }), ValidationError);
  assert.equal(eventsOf(db).length, 0);
});

test('listEvents returns the most recent first', () => {
  const db = freshDb();
  createJar(db, { name: 'First', weight_g: 1 });
  createJar(db, { name: 'Second', weight_g: 2 });
  createJar(db, { name: 'Third', weight_g: 3 });
  assert.deepEqual(listEvents(db).map((e) => e.jar_name), ['Third', 'Second', 'First']);
});

test('listEvents honours limit and caps at 500', () => {
  const db = freshDb();
  createJar(db, { name: 'First', weight_g: 1 });
  createJar(db, { name: 'Second', weight_g: 2 });
  assert.equal(listEvents(db, { limit: 1 }).length, 1);
  assert.equal(listEvents(db, { limit: 1 })[0].jar_name, 'Second');
  assert.equal(listEvents(db, { limit: 10000 }).length, 2, 'a huge limit must not throw');
});

test('deleting the last jar records a total of 0, not null', () => {
  const db = freshDb();
  for (const j of listJars(db)) deleteJar(db, j.id);
  const evs = eventsOf(db);
  assert.equal(evs[evs.length - 1].total_after_g, 0);
});
