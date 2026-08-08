import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openDb } from '../db.js';

test('seeds 4 jars totaling 237g on an empty db', () => {
  const db = openDb(':memory:');
  const rows = db.prepare('SELECT * FROM jars').all();
  assert.equal(rows.length, 4);
  assert.equal(rows.reduce((s, j) => s + j.weight_g, 0), 237);
});

test('seeds the exact expected rows', () => {
  const db = openDb(':memory:');
  const rows = db.prepare('SELECT name, harvest_date, weight_g, color_tag FROM jars ORDER BY id').all();
  assert.deepEqual(rows, [
    { name: 'Mwhs',  harvest_date: '13/07', weight_g: 77, color_tag: '#79a67e' },
    { name: 'Mango', harvest_date: '23/07', weight_g: 65, color_tag: '#e2a04c' },
    { name: 'Mango', harvest_date: '10/04', weight_g: 40, color_tag: '#e2a04c' },
    { name: 'Liver', harvest_date: '10/04', weight_g: 55, color_tag: '#b07d9c' },
  ]);
});

test('does not reseed when jars already exist', () => {
  const file = path.join(os.tmpdir(), `stash-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
  try {
    const db1 = openDb(file);
    db1.prepare('DELETE FROM jars WHERE name = ?').run('Liver');
    db1.close();
    const db2 = openDb(file);
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM jars').get().n, 3);
    db2.close();
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}-wal`, { force: true });
    fs.rmSync(`${file}-shm`, { force: true });
  }
});
