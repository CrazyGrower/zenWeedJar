// The frontend ships as classic <script> files with no module system, so it
// can't be imported. Each file is run in a vm context with the globals it
// expects; top-level function declarations land on that context, which is how
// the pure logic below gets exercised without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

// app.js touches the DOM at load time and inside its render helpers; the stubs
// are only as deep as the pure functions under test need.
function loadApp() {
  const ctx = vm.createContext({
    window: {},
    document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
    Math, console, Number, String, Array, Object, JSON, Date,
  });
  vm.runInContext(read('stash-model.js'), ctx);
  ctx.StashModel = ctx.window.StashModel;
  vm.runInContext(read('app.js'), ctx);
  return ctx;
}

// --- app.js: escaping --------------------------------------------------------

test('escapeHtml neutralises every character that could break out of markup', () => {
  const { escapeHtml } = loadApp();
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('a jar name and notes containing markup are escaped in the detail modal', () => {
  const ctx = loadApp();
  let written = '';
  const stubButton = { set onclick(_) {} };
  const dialog = {
    set innerHTML(v) { written = v; },
    get innerHTML() { return written; },
    querySelector: () => stubButton,
    querySelectorAll: () => [], addEventListener() {},
    showModal() {},
    close() {},
  };
  ctx.document.getElementById = () => dialog;

  ctx.openDetail({
    id: 1, weight_g: 10, color_tag: '#79a67e', thc_percent: null, indica_pct: null,
    name: '<img src=x onerror=alert(1)>',
    harvest_date: '"><b>d</b>',
    notes: '<script>alert(2)<\/script>',
  });

  assert.ok(!written.includes('<img'), 'name must not become an element');
  assert.ok(!written.includes('<b>'), 'harvest_date must not become an element');
  assert.ok(!written.includes('<script'), 'notes must not become an element');
  assert.ok(written.includes('&lt;img'), 'it should appear as escaped text instead');
});

test('a percentage cannot break out of the inline style it is written into', () => {
  const ctx = loadApp();
  let written = '';
  const dialog = {
    set innerHTML(v) { written = v; },
    get innerHTML() { return written; },
    querySelector: () => ({ set onclick(_) {} }),
    querySelectorAll: () => [], addEventListener() {},
    showModal() {}, close() {},
  };
  ctx.document.getElementById = () => dialog;

  ctx.openDetail({
    id: 1, weight_g: 10, color_tag: '#79a67e', notes: null,
    name: 'X', harvest_date: '01/01',
    thc_percent: '50" onmouseover="alert(1)', indica_pct: 999,
  });

  // The crafted value may appear as escaped text in the label — that's inert.
  // What must never appear is an unescaped quote closing the style attribute.
  assert.ok(!written.includes('onmouseover="'), 'a crafted percent must not close the style attribute');
  assert.ok(written.includes('onmouseover=&quot;'), 'it should survive as escaped text in the label');

  const widths = [...written.matchAll(/style="width:([^"]*)%"/g)].map((m) => m[1]);
  assert.ok(widths.length > 0, 'the bars should have been rendered');
  for (const w of widths) {
    const n = Number(w);
    assert.ok(Number.isFinite(n) && n >= 0 && n <= 100, `width "${w}" should be a clamped number`);
  }
});

// --- app.js: the movement journal --------------------------------------------

test('formatDelta signs the movement and keeps grams readable', () => {
  const { formatDelta } = loadApp();
  assert.equal(formatDelta(77), '+77g');
  assert.equal(formatDelta(-2), '-2g');
  assert.equal(formatDelta(-2.26), '-2.3g', 'one decimal is enough on a pixel label');
  assert.equal(formatDelta(0.5), '+0.5g');
  assert.equal(formatDelta('12'), '+12g', 'SQLite REALs can arrive as strings through JSON');
  assert.equal(formatDelta(null), '0g');
});

test('formatStamp reads SQLite timestamps as UTC, not as local time', () => {
  // CURRENT_TIMESTAMP is UTC and carries no zone suffix. Handing that string
  // straight to new Date() makes the browser read it as local time, which
  // shifts every entry in the journal by the local offset.
  const { formatStamp } = loadApp();
  const expected = new Date(Date.UTC(2026, 7, 16, 21, 34, 0));
  const p = (n) => String(n).padStart(2, '0');
  const want = `${p(expected.getDate())}/${p(expected.getMonth() + 1)} ${p(expected.getHours())}:${p(expected.getMinutes())}`;
  assert.equal(formatStamp('2026-08-16 21:34:00'), want);
});

test('formatStamp yields an empty string rather than "Invalid Date"', () => {
  const { formatStamp } = loadApp();
  assert.equal(formatStamp('not a date'), '');
  assert.equal(formatStamp(null), '');
});

test('eventLine reads as a full journal row', () => {
  const { eventLine, formatStamp } = loadApp();
  const line = eventLine({
    created_at: '2026-08-16 21:34:00', delta_g: 77, jar_name: 'MWHS', total_after_g: 237,
  });
  assert.equal(line, `${formatStamp('2026-08-16 21:34:00')} · +77g · MWHS · → 237g`);
});

test('eventLine rounds the running total to whole grams', () => {
  const { eventLine } = loadApp();
  assert.match(eventLine({
    created_at: '2026-08-16 21:34:00', delta_g: -2.5, jar_name: 'Mango', total_after_g: 234.5,
  }), /→ 235g$/);
});

// --- app.js: the full history modal ------------------------------------------

// The history dialog is filled asynchronously, so the stub records what was
// written and whether it was opened.
function historyDialog(ctx) {
  const dlg = {
    innerHTML: '', opened: false,
    querySelector: () => ({ set onclick(_) {} }),
    showModal() { this.opened = true; },
    close() {},
  };
  ctx.document.getElementById = (id) => (id === 'history-dialog' ? dlg : null);
  return dlg;
}

test('the history dialog lists every movement, newest first', async () => {
  const ctx = loadApp();
  const dlg = historyDialog(ctx);
  ctx.Api = { events: async () => [
    { id: 2, created_at: '2026-08-16 21:34:00', delta_g: -2, jar_name: 'Mango', total_after_g: 235 },
    { id: 1, created_at: '2026-08-16 09:00:00', delta_g: 77, jar_name: 'MWHS', total_after_g: 237 },
  ] };

  await ctx.openHistory();

  assert.ok(dlg.opened, 'the dialog should be shown');
  assert.equal((dlg.innerHTML.match(/class="log__line"/g) || []).length, 2);
  assert.ok(dlg.innerHTML.indexOf('Mango') < dlg.innerHTML.indexOf('MWHS'), 'newest first');
  assert.ok(dlg.innerHTML.includes('→ 235g'), 'the running total should be on the line');
});

test('the history dialog says so when the journal is empty', async () => {
  const ctx = loadApp();
  const dlg = historyDialog(ctx);
  ctx.Api = { events: async () => [] };
  await ctx.openHistory();
  assert.ok(dlg.opened);
  assert.ok(dlg.innerHTML.includes('Aucun mouvement'));
  assert.ok(!dlg.innerHTML.includes('log__line'));
});

test('a jar name containing markup is escaped in the history dialog', async () => {
  const ctx = loadApp();
  const dlg = historyDialog(ctx);
  ctx.Api = { events: async () => [{
    id: 1, created_at: '2026-08-16 21:34:00', delta_g: 5,
    jar_name: '<img src=x onerror=alert(1)>', total_after_g: 10,
  }] };
  await ctx.openHistory();
  assert.ok(!dlg.innerHTML.includes('<img'), 'name must not become an element');
  assert.ok(dlg.innerHTML.includes('&lt;img'), 'it should appear as escaped text instead');
});

test('the total sign is a real button, so it is reachable by keyboard', () => {
  // The sign is the only way into the history on mobile, where the garland is
  // hidden — a clickable <div> would leave that path keyboard-inaccessible.
  const html = read('index.html');
  assert.match(html, /<button[^>]*class="hud__tag"[^>]*id="hud-tag"|<button[^>]*id="hud-tag"[^>]*class="hud__tag"/);
  assert.match(html, /<dialog id="history-dialog">/);
});

test('the offline notice is not appended inside the sign button', () => {
  // A <div> inside a <button> is invalid markup; the notice goes on .hud.
  const src = read('app.js');
  const fn = src.slice(src.indexOf('function setOfflineNotice'));
  assert.doesNotMatch(fn.slice(0, fn.indexOf('\n}')), /querySelector\('\.hud__tag'\)/);
});

test('a failed journal load does not stop the jars from rendering', async () => {
  const ctx = loadApp();
  const given = [];
  ctx.window.Scene3D = { isMounted: () => true, setJars: (l) => given.push(l) };
  const hudTotal = { textContent: '' };
  const last = { textContent: 'stale' };
  ctx.document.getElementById = (id) => {
    if (id === 'hud-total') return hudTotal;
    if (id === 'hud-last') return last;
    return null;
  };
  ctx.Api = {
    list: async () => [{ id: 1, name: 'MWHS', weight_g: 10, color_tag: '#79a67e' }],
    events: async () => { throw new Error('offline'); },
  };

  await assert.doesNotReject(ctx.loadAndRender());

  assert.equal(given.length, 1, 'the scene should still get the jars');
  assert.equal(given[0][0].name, 'MWHS');
  assert.equal(last.textContent, '', 'the last-move line is cleared rather than throwing');
});

// --- app.js: stats and runway ---------------------------------------------------

const READY = {
  total_g: 120, ready: true, window_days: 30, consumed_g: 48, per_day_g: 1.6,
  days_left: 75, trend_pct: 12.4,
  daily: Array.from({ length: 14 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 8, 19 + i)).toISOString().slice(0, 10),
    g: i === 13 ? 4 : i === 3 ? 2 : 0,
  })),
  top: [{ name: 'Mango', g: 18 }, { name: 'MWHS', g: 9.25 }],
};

test('formatRunway reads as a short pixel label, or nothing when there is no estimate', () => {
  const { formatRunway } = loadApp();
  assert.equal(formatRunway({ ready: true, days_left: 23.6 }), '~24 J');
  assert.equal(formatRunway({ ready: true, days_left: 0.3 }), '<1 J');
  assert.equal(formatRunway({ ready: true, days_left: 900 }), '>1 AN');
  assert.equal(formatRunway({ ready: true, days_left: null }), '');
  assert.equal(formatRunway({ ready: false, days_left: null }), '');
  assert.equal(formatRunway(null), '');
});

test('formatTrend signs the change in ASCII and rounds it', () => {
  const { formatTrend } = loadApp();
  assert.equal(formatTrend(12.4), '+12%');
  assert.equal(formatTrend(-7.6), '-8%');
  assert.equal(formatTrend(0.2), '0%');
  assert.equal(formatTrend(null), '—');
});

test('runwayDate is the local day the stash runs out', () => {
  const { runwayDate } = loadApp();
  assert.equal(runwayDate(10, new Date(2026, 9, 2, 12)), '12/10');
  assert.equal(runwayDate(null, new Date(2026, 9, 2, 12)), '');
});

test('statsBody shows the runway, rate, trend, bars and top varieties', () => {
  const { statsBody } = loadApp();
  const html = statsBody(READY, new Date(2026, 9, 2, 12));
  assert.ok(html.includes('~75 J'));
  assert.ok(html.includes('16/12'), 'the run-out date');
  assert.ok(html.includes('1.6 g/j'));
  assert.ok(html.includes('11.2 g/sem'));
  assert.ok(html.includes('+12%'));
  assert.equal((html.match(/class="stats__bar"/g) || []).length, 14);
  assert.ok(html.includes('height:100%'), 'the biggest day fills its column');
  assert.ok(html.includes('height:50%'));
  assert.ok(html.includes('Mango') && html.includes('9.3g'));
});

test('statsBody says so when there is not enough history yet', () => {
  const { statsBody } = loadApp();
  const html = statsBody({ ...READY, ready: false, days_left: null, trend_pct: null });
  assert.ok(html.includes('PAS ENCORE ASSEZ'));
  assert.ok(!html.includes('~'));
});

test('statsBody escapes variety names', () => {
  const { statsBody } = loadApp();
  const html = statsBody({ ...READY, top: [{ name: '<img src=x>', g: 1 }] });
  assert.ok(!html.includes('<img'));
});

test('the history dialog carries a stats tab, and still opens when stats fail', async () => {
  const ctx = loadApp();
  const dlg = historyDialog(ctx);
  ctx.Api = { events: async () => [], stats: async () => { throw new Error('boom'); } };
  await ctx.openHistory();
  assert.ok(dlg.opened);
  assert.ok(dlg.innerHTML.includes('data-tab="stats"'));
  assert.ok(dlg.innerHTML.includes('Aucun mouvement'), 'the journal pane is still there');
});

test('the total sign shows the runway once stats load', async () => {
  const ctx = loadApp();
  const eta = { textContent: '' };
  ctx.document.getElementById = (id) => {
    if (id === 'hud-total') return { textContent: '' };
    if (id === 'hud-eta') return eta;
    return null;
  };
  ctx.Api = { list: async () => [], events: async () => [], stats: async () => READY };
  await ctx.loadAndRender();
  assert.equal(eta.textContent, '~75 J');
});

test('each daily bar carries its day and grams as a hover tip', () => {
  const { statsBody } = loadApp();
  const html = statsBody(READY, new Date(2026, 9, 2, 12));
  assert.ok(html.includes('data-tip="02/10 · 4g"'), 'the last bar is today');
  assert.ok(html.includes('data-tip="22/09 · 2g"'));
  assert.ok(html.includes('data-tip="20/09 · 0g"'), 'empty days are hoverable too');
  assert.equal((html.match(/tabindex="0"/g) || []).length, 14, 'a tap focuses the column on a phone');
});

// --- vendored assets ---------------------------------------------------------

test('three.js r128 and the two new pixel fonts are served locally', () => {
  const three = read('vendor/three.min.js');
  assert.match(three.slice(0, 400), /REVISION\s*=\s*"128"|r128|"128"/, 'three.js should be r128');
  const css = read('fonts/fonts.css');
  for (const fam of ['Jersey 10', 'Pixelify Sans']) {
    assert.ok(css.includes(`font-family: '${fam}'`), `${fam} should be declared`);
  }
  for (const f of ['jersey-10-400-latin.woff2', 'jersey-10-400-latin-ext.woff2', 'pixelify-sans-latin.woff2', 'pixelify-sans-latin-ext.woff2']) {
    assert.ok(fs.statSync(path.join(PUBLIC, 'fonts', f)).size > 1000, `${f} should exist`);
  }
});

// --- app.js: the 3D page -----------------------------------------------------

test('the page loads three.js and the scene before app.js, and no longer the SVG room', () => {
  const html = read('index.html');
  const order = ['/vendor/three.min.js', '/stash-model.js', '/tape-label.js', '/scene3d/kit.js', '/scene3d/props.js',
    '/scene3d/room.js', '/scene3d/jar.js', '/scene3d/stage.js', '/api.js', '/app.js'];
  let at = -1;
  for (const src of order) {
    const i = html.indexOf(`<script src="${src}"></script>`);
    assert.ok(i > at, `${src} should be loaded, after the previous script`);
    at = i;
  }
  assert.ok(!html.includes('jar-svg.js') && !html.includes('cat.js'), 'the old room scripts are gone');
  assert.match(html, /<canvas id="scene"/);
  assert.match(html, /viewport-fit=cover/);
});

test('without WebGL the jars are listed as buttons that open their card', () => {
  const ctx = loadApp();
  const box = { hidden: true, innerHTML: '', querySelectorAll: () => [] };
  ctx.document.getElementById = (id) => (id === 'fallback' ? box : null);
  ctx.renderJars([{ id: 3, name: 'Mango', weight_g: 12.5 }]);
  assert.equal(box.hidden, false);
  assert.match(box.innerHTML, /<button[^>]*data-id="3"/);
  assert.ok(box.innerHTML.includes('Mango') && box.innerHTML.includes('12,5 g'));
});

test('fallbackHtml escapes jar names and says when the shelf is empty', () => {
  const { fallbackHtml } = loadApp();
  const html = fallbackHtml([{ id: 1, name: '<img src=x onerror=alert(1)>', weight_g: 1 }]);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(fallbackHtml([]).includes('Aucun bocal'));
});

test('renderLastMove shows the newest movement in ASCII, or nothing', () => {
  const ctx = loadApp();
  const last = { textContent: 'x' };
  ctx.document.getElementById = (id) => (id === 'hud-last' ? last : null);
  ctx.renderLastMove([{ delta_g: -2, jar_name: 'Mwhs' }, { delta_g: 5, jar_name: 'Old' }]);
  assert.equal(last.textContent, 'Dernier mouvement : -2g Mwhs');
  ctx.renderLastMove([]);
  assert.equal(last.textContent, '');
});

test('the window preference survives a storage that throws', () => {
  const ctx = loadApp();
  ctx.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(ctx.readPref('pixelstash.window', 'sunset'), 'sunset');
  assert.doesNotThrow(() => ctx.writePref('pixelstash.window', 'night'));
});

// --- app.js: the jar card and the form ---------------------------------------

function captureDialog(ctx) {
  const dlg = { html: '', set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; },
    querySelector: () => ({ set onclick(_) {}, addEventListener() {} }), querySelectorAll: () => [],
    addEventListener() {}, showModal() {}, close() {} };
  ctx.document.getElementById = () => dlg;
  return dlg;
}

test('the jar card offers -0.5, -1 and -2 g in ASCII', () => {
  const ctx = loadApp();
  const dlg = captureDialog(ctx);
  ctx.openDetail({ id: 1, name: 'Mango', weight_g: 65, harvest_date: '23/07', color_tag: '#e2a04c' });
  for (const n of ['0.5', '1', '2']) assert.ok(dlg.html.includes(`data-take="${n}"`), `a ${n} g button`);
  assert.ok(dlg.html.includes('-0,5 g') && !dlg.html.includes('−'), 'ASCII hyphen only');
  assert.ok(dlg.html.includes('65 g'));
});

test('takeFromJar saves the new weight, never below zero, then reloads', async () => {
  const ctx = loadApp();
  const calls = [];
  let reloaded = 0;
  // loadAndRender writes to the HUD; any element will do
  ctx.document.getElementById = () => ({ textContent: '', hidden: true, innerHTML: '', querySelectorAll: () => [] });
  ctx.Api = { update: async (id, data) => { calls.push([id, data]); }, list: async () => { reloaded++; return []; }, events: async () => [], stats: async () => ({}) };
  await ctx.takeFromJar({ id: 7, weight_g: 0.4 }, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[7, { weight_g: 0 }]]);
  assert.equal(reloaded, 1);
});

test('swatchesHtml checks the current cap and keeps a custom one', () => {
  const { swatchesHtml } = loadApp();
  const html = swatchesHtml('#e2a04c');
  assert.equal((html.match(/type="radio"/g) || []).length, 5);
  assert.match(html, /value="#e2a04c" checked/);
  const custom = swatchesHtml('#123456');
  assert.equal((custom.match(/type="radio"/g) || []).length, 6, 'a custom colour is offered too');
  assert.match(custom, /value="#123456" checked/);
  const bad = swatchesHtml('"><img src=x>');
  assert.ok(!bad.includes('<img'), 'a broken colour falls back instead of being injected');
  assert.match(bad, /value="#79a67e" checked/);
});

test('mountScene tells the scene how much of the canvas the HUD and the bottom bar cover', () => {
  const ctx = loadApp();
  let opts = null;
  ctx.window.Scene3D = { mount: (c, l, o) => { opts = o; return true; }, onJarClick() {} };
  ctx.localStorage = { getItem: () => 'night', setItem() {} };
  ctx.document.getElementById = (id) => (id === 'scene' ? {} : id === 'labels' ? {} : null);
  ctx.document.querySelector = (sel) => (sel === '.hud' ? { offsetHeight: 104 } : sel === '.bottom' ? { offsetHeight: 136 } : null);
  assert.equal(ctx.mountScene(), true);
  assert.equal(opts.mode, 'night');
  assert.deepEqual(JSON.parse(JSON.stringify(opts.insets())), { top: 104, bottom: 136 });
});

test('without three.js the canvas is hidden too, so only the fallback list is announced', () => {
  const ctx = loadApp();
  const canvas = { hidden: false };
  ctx.document.getElementById = (id) => (id === 'scene' ? canvas : null);
  assert.equal(ctx.mountScene(), false);
  assert.equal(canvas.hidden, true);
});

test('takeFromJar takes from the freshest weight, not the one the card was opened with', async () => {
  const ctx = loadApp();
  const calls = [];
  ctx.document.getElementById = (id) => (id === 'offline-notice' ? null : { textContent: '', hidden: true, innerHTML: '', querySelectorAll: () => [] });
  ctx.Api = { update: async (id, data) => { calls.push(data.weight_g); }, list: async () => [{ id: 7, weight_g: 3 }], events: async () => [], stats: async () => ({}) };
  await ctx.loadAndRender();
  await ctx.takeFromJar({ id: 7, weight_g: 10 }, 1);
  assert.deepEqual(calls, [2]);
});

test('the scene re-frames when the HUD or the bottom bar changes height', () => {
  const ctx = loadApp();
  const observed = [];
  let fired = 0;
  ctx.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { observed.push(el); this.cb(); } };
  ctx.window.Scene3D = { mount: () => true, onJarClick() {}, refit: () => { fired += 1; } };
  ctx.localStorage = { getItem: () => null, setItem() {} };
  const hud = { offsetHeight: 100 };
  const bottom = { offsetHeight: 130 };
  ctx.document.getElementById = (id) => (id === 'scene' ? {} : null);
  ctx.document.querySelector = (sel) => (sel === '.hud' ? hud : sel === '.bottom' ? bottom : null);
  ctx.mountScene();
  assert.ok(observed.includes(hud) && observed.includes(bottom));
  assert.ok(fired >= 1);
});
