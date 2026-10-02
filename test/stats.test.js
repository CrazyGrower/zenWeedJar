import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { computeStats } from '../stats.js';

// Seeds jars (237g) but no events: the seed bypasses createJar.
function freshDb() { return openDb(':memory:'); }

const NOW = new Date('2026-10-02T12:00:00Z');

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

function event(db, { name = 'Mango', kind = 'adjust', delta_g, at }) {
  db.prepare(`
    INSERT INTO jar_events (jar_id, jar_name, kind, delta_g, total_after_g, created_at)
    VALUES (1, ?, ?, ?, 0, ?)
  `).run(name, kind, delta_g, at);
}

test('an empty journal is not ready and gives no estimate', () => {
  const s = computeStats(freshDb(), { now: NOW });
  assert.equal(s.total_g, 237);
  assert.equal(s.ready, false);
  assert.equal(s.days_left, null);
  assert.equal(s.per_day_g, 0);
});

test('under seven days of history is not ready', () => {
  const db = freshDb();
  event(db, { delta_g: -3, at: daysAgo(5) });
  const s = computeStats(db, { now: NOW });
  assert.equal(s.ready, false);
  assert.equal(s.days_left, null);
});

test('rate is consumption over the days actually covered, capped at 30', () => {
  const db = freshDb();
  event(db, { delta_g: -10, at: daysAgo(10) });
  event(db, { delta_g: -10, at: daysAgo(2) });
  const s = computeStats(db, { now: NOW });
  assert.equal(s.ready, true);
  assert.equal(s.window_days, 10);
  assert.equal(s.consumed_g, 20);
  assert.equal(s.per_day_g, 2);
  assert.equal(s.days_left, 237 / 2);
});

test('events older than 30 days only stretch the window, never the consumption', () => {
  const db = freshDb();
  event(db, { delta_g: -50, at: daysAgo(60) });
  event(db, { delta_g: -30, at: daysAgo(3) });
  const s = computeStats(db, { now: NOW });
  assert.equal(s.window_days, 30);
  assert.equal(s.consumed_g, 30);
  assert.equal(s.per_day_g, 1);
});

test('restocks, removals and upward adjusts are not consumption', () => {
  const db = freshDb();
  event(db, { kind: 'add', delta_g: 20, at: daysAgo(20) });
  event(db, { kind: 'remove', delta_g: -15, at: daysAgo(10) });
  event(db, { kind: 'adjust', delta_g: 4, at: daysAgo(5) });
  event(db, { kind: 'adjust', delta_g: -6, at: daysAgo(1) });
  const s = computeStats(db, { now: NOW });
  assert.equal(s.consumed_g, 6);
});

test('a history with no consumption is ready but has no end date', () => {
  const db = freshDb();
  event(db, { kind: 'add', delta_g: 20, at: daysAgo(20) });
  const s = computeStats(db, { now: NOW });
  assert.equal(s.ready, true);
  assert.equal(s.per_day_g, 0);
  assert.equal(s.days_left, null);
});

test('trend compares the last 7 days to the 30-day rate', () => {
  const db = freshDb();
  event(db, { delta_g: -10, at: daysAgo(30) });
  event(db, { delta_g: -14, at: daysAgo(3) });
  const s = computeStats(db, { now: NOW });
  // 30 days: 24g → 0.8 g/d. Last 7: 14g → 2 g/d. +150%.
  assert.equal(Math.round(s.trend_pct), 150);
});

test('daily holds 14 oldest-first buckets ending today', () => {
  const db = freshDb();
  event(db, { delta_g: -2, at: '2026-10-02 08:00:00' });
  event(db, { delta_g: -1.5, at: '2026-10-02 09:00:00' });
  event(db, { delta_g: -4, at: '2026-09-19 10:00:00' });
  event(db, { delta_g: -9, at: '2026-09-18 10:00:00' });
  const s = computeStats(db, { now: NOW });
  assert.equal(s.daily.length, 14);
  assert.deepEqual(s.daily[0], { day: '2026-09-19', g: 4 });
  assert.deepEqual(s.daily[13], { day: '2026-10-02', g: 3.5 });
  assert.equal(s.daily[5].g, 0);
});

test('top lists the three most consumed varieties over 30 days', () => {
  const db = freshDb();
  event(db, { name: 'Mango', delta_g: -5, at: daysAgo(2) });
  event(db, { name: 'Mango', delta_g: -5, at: daysAgo(3) });
  event(db, { name: 'Mwhs', delta_g: -8, at: daysAgo(4) });
  event(db, { name: 'Liver', delta_g: -1, at: daysAgo(4) });
  event(db, { name: 'Kush', delta_g: -0.5, at: daysAgo(4) });
  event(db, { name: 'Old', delta_g: -99, at: daysAgo(40) });
  const s = computeStats(db, { now: NOW });
  assert.deepEqual(s.top, [
    { name: 'Mango', g: 10 }, { name: 'Mwhs', g: 8 }, { name: 'Liver', g: 1 },
  ]);
});
