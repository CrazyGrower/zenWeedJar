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
