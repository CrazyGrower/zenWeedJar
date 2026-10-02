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

function loadJarSvg() {
  const ctx = vm.createContext({ window: {}, Math, console });
  vm.runInContext(read('jar-svg.js'), ctx);
  return ctx.window.JarSvg;
}

// app.js touches the DOM at load time and inside its render helpers; the stubs
// are only as deep as the pure functions under test need.
function loadApp() {
  const ctx = vm.createContext({
    window: {},
    document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    Math, console, Number, String, Array, Object, JSON, Date,
  });
  vm.runInContext(read('jar-svg.js'), ctx);
  ctx.JarSvg = ctx.window.JarSvg;
  vm.runInContext(read('app.js'), ctx);
  return ctx;
}

// #jarInner clips to the jar outline (#sil), whose top edge — the neck, under
// the cap — is y=11. Contents may fill right up to it; nothing may pass it.
const NECK_TOP = 11;
const JAR_BOTTOM = 44;

function budTops(markup) {
  return [...markup.matchAll(/<use href="#bud\d" x="[-\d.]+" y="([-\d.]+)"/g)].map((m) => Number(m[1]));
}

// --- jar-svg: the fill gauge -------------------------------------------------

test('fillTop maps empty to the jar floor and full to the brim', () => {
  const { fillTop } = loadJarSvg();
  assert.equal(fillTop(0, 50), JAR_BOTTOM);
  assert.equal(fillTop(50, 50), 11.5);
  assert.ok(fillTop(50, 50) >= NECK_TOP, 'a full jar must not fill past the neck');
  assert.ok(fillTop(50, 50) < 14, 'a full jar should reach the neck, not stop at the shoulder');
  assert.equal(fillTop(25, 50), 27.75);
});

test('fillTop clamps out-of-range input instead of overflowing the jar', () => {
  const { fillTop } = loadJarSvg();
  assert.equal(fillTop(999, 50), 11.5);
  assert.equal(fillTop(-5, 50), JAR_BOTTOM);
  assert.equal(fillTop(10, 0), JAR_BOTTOM, 'a zero capacity must not divide by zero');
});

// --- jar-svg: the 50g overflow rule -----------------------------------------

test('a jar at or under capacity renders one jar, over it renders exactly two', () => {
  const { buildJar, CAPACITY_G } = loadJarSvg();
  const backs = (g) => (buildJar({ id: 1, weight_g: g, color_tag: '#e2a04c' }).match(/jar--back/g) || []).length;

  assert.equal(CAPACITY_G, 50);
  for (const g of [0, 1, 25, 49.9, 50]) assert.equal(backs(g), 0, `${g}g should be a single jar`);
  // and it only ever doubles, however far over capacity
  for (const g of [50.1, 77, 100, 500, 10000]) assert.equal(backs(g), 1, `${g}g should be exactly two jars`);
});

test('the second jar holds the overflow, capped at one jar of its own', () => {
  const { buildJar, fillTop } = loadJarSvg();
  const backTop = (g) => {
    const back = buildJar({ id: 1, weight_g: g, color_tag: '#e2a04c' }).split('jar--back')[1];
    return Math.min(...budTops(back.slice(0, back.indexOf('</svg>'))));
  };
  // 77g -> 27g behind; 150g -> the back jar is full, same as 500g
  assert.ok(backTop(77) > backTop(150), '77g should leave the back jar less full than 150g');
  assert.equal(backTop(150), backTop(500), 'past two jars' + ' worth, the back jar stops changing');
  assert.ok(backTop(150) >= fillTop(50, 50), 'the back jar must not overfill either');
});

// --- jar-svg: the clip edge --------------------------------------------------

test('no bud is drawn above the fill line or past the neck, at any weight or id', () => {
  const { buildJar, fillTop, CAPACITY_G } = loadJarSvg();
  let highest = Infinity;
  for (let id = 1; id <= 60; id++) {
    for (const weight_g of [0.5, 12, 33, 49, 50, 64, 99, 250]) {
      const tops = budTops(buildJar({ id, weight_g, color_tag: '#79a67e' }));
      if (!tops.length) continue;
      const surface = Math.min(...tops);
      const line = fillTop(Math.min(weight_g, CAPACITY_G), CAPACITY_G);
      // the surface may dip below the fill line, never rise above it
      assert.ok(surface >= line - 0.05, `${weight_g}g/id${id}: bud at ${surface} above fill line ${line}`);
      highest = Math.min(highest, surface);
    }
  }
  assert.ok(highest >= NECK_TOP, `highest bud landed at ${highest}, the neck is at ${NECK_TOP}`);
});

test('the contents are clipped to the jar outline, not to a rectangle', () => {
  // A rectangular clip is invisible to the coordinate checks above: the buds
  // are emitted at the right positions and simply get sliced when drawn. So
  // this asserts the markup itself, which is the only place it shows.
  const markup = read('index.html');
  const clip = markup.match(/<clipPath id="jarInner">([\s\S]*?)<\/clipPath>/);
  assert.ok(clip, 'the #jarInner clip path should exist');
  assert.match(clip[1], /<use\s+href="#sil"\s*\/>/, 'it should clip to the jar silhouette');
  assert.doesNotMatch(clip[1], /<rect/, 'a rect clip would put a flat ceiling on the fill');
});

test('body is not pinned to the viewport height, so the page can scroll', () => {
  // Another invariant no coordinate check can see: with `height:100%` on body
  // the document froze at exactly one screen, and on a phone — where the room
  // is taller than the visible area — the add button became unreachable
  // because there was no vertical scroll at all.
  const css = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const bodyRule = css.match(/(^|\})\s*body\s*\{([^}]*)\}/);
  assert.ok(bodyRule, 'the body rule should exist');
  assert.doesNotMatch(bodyRule[2], /(^|;)\s*height\s*:/, 'body must not have a fixed height');
  assert.match(bodyRule[2], /min-height\s*:/, 'body should use min-height instead');
  assert.doesNotMatch(css, /html\s*,\s*body\s*\{[^}]*height\s*:\s*100%/, 'nor via a shared html,body rule');
});

// --- jar-svg: colour handling and XSS ---------------------------------------

test('color_tag is allowlisted to a hex colour, so markup cannot be injected', () => {
  const { buildJar } = loadJarSvg();
  const payload = '"/><img src=x onerror=alert(1)><rect fill="';
  const out = buildJar({ id: 1, weight_g: 20, color_tag: payload });
  assert.ok(!out.includes('<img'), 'payload must not become an element');
  assert.ok(!out.includes('onerror'), 'payload must not become an attribute');
  assert.ok(out.includes('#79a67e'), 'it should fall back to the default cap colour');
});

test('a valid hex cap is kept and a malformed one falls back', () => {
  const { buildJar } = loadJarSvg();
  assert.ok(buildJar({ id: 1, weight_g: 20, color_tag: '#e2a04c' }).includes('fill="#e2a04c"'));
  assert.ok(buildJar({ id: 1, weight_g: 20, color_tag: '#E2A04C' }).includes('fill="#E2A04C"'));
  for (const bad of ['#abc', 'red', '', null, undefined, ' #e2a04c']) {
    assert.ok(buildJar({ id: 1, weight_g: 20, color_tag: bad }).includes('#79a67e'), `${bad} should fall back`);
  }
});

test('the same jar always renders identically, so buds do not jump on re-render', () => {
  const { buildJar } = loadJarSvg();
  const jar = { id: 7, weight_g: 42, color_tag: '#b07d9c' };
  assert.equal(buildJar(jar), buildJar(jar));
  assert.notEqual(buildJar(jar), buildJar({ ...jar, id: 8 }), 'different jars should differ');
});

// --- app.js: escaping --------------------------------------------------------

test('escapeHtml neutralises every character that could break out of markup', () => {
  const { escapeHtml } = loadApp();
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('a jar name or date containing markup is escaped on the shelf', () => {
  const { filledSlot } = loadApp();
  const html = filledSlot({
    id: 1, weight_g: 10, color_tag: '#79a67e',
    name: '<img src=x onerror=alert(1)>', harvest_date: '"><b>x</b>',
  });
  assert.ok(!html.includes('<img'), 'name must not become an element');
  assert.ok(!html.includes('<b>'), 'harvest_date must not become an element');
  assert.ok(html.includes('&lt;img'), 'it should appear as escaped text instead');
});

test('a jar name and notes containing markup are escaped in the detail modal', () => {
  const ctx = loadApp();
  let written = '';
  const stubButton = { set onclick(_) {} };
  const dialog = {
    set innerHTML(v) { written = v; },
    get innerHTML() { return written; },
    querySelector: () => stubButton,
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

// --- app.js: shelf placement -------------------------------------------------

test('every jar is placed exactly once, inside the grid', () => {
  const { placeJars } = loadApp();
  const jars = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, weight_g: 10 }));
  const slots = placeJars(jars, 2, 6);

  assert.equal(slots.length, 12);
  const placed = slots.filter(Boolean);
  assert.equal(placed.length, 9, 'no jar may be dropped');
  assert.equal(new Set(placed.map((j) => j.id)).size, 9, 'no jar may be placed twice');
});

test('jars are dealt across shelves rather than filling the first one', () => {
  const { placeJars } = loadApp();
  const jars = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, weight_g: 10 }));
  const slots = placeJars(jars, 2, 6);
  const perRow = [slots.slice(0, 6), slots.slice(6)].map((r) => r.filter(Boolean).length);
  assert.deepEqual(perRow, [2, 2], 'four jars over two shelves should be two and two');
});

test('placement is stable, so editing one jar does not move the others', () => {
  const { placeJars } = loadApp();
  const jars = [{ id: 3, weight_g: 10 }, { id: 8, weight_g: 20 }, { id: 5, weight_g: 30 }];
  const idsOf = (slots) => slots.map((j) => (j ? j.id : null));

  const first = idsOf(placeJars(jars, 2, 6));
  // same jars, one edited, and handed over in a different order
  const edited = [jars[2], { ...jars[0], weight_g: 999 }, jars[1]];
  assert.deepEqual(idsOf(placeJars(edited, 2, 6)), first);
});

test('a full shelf spills onto the next instead of dropping jars', () => {
  const { placeJars } = loadApp();
  const jars = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, weight_g: 10 }));
  const slots = placeJars(jars, 2, 6);
  assert.equal(slots.filter(Boolean).length, 12);
  assert.equal(slots.filter((s) => s === null).length, 0, 'a full grid should have no gaps');
});

test('an empty shelf renders no jars and does not throw', () => {
  const { placeJars } = loadApp();
  assert.deepEqual(placeJars([], 2, 6).filter(Boolean), []);
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

test('the room reserves a left column for the journal, and gives it back on mobile', () => {
  // The room is a fixed-size composition, so the garland cannot simply flow
  // beside it: the wall has to grow by exactly the width of the reserved
  // column. And the mobile view must land back on today's numbers to the
  // pixel — that parity is the whole reason the query exists.
  const css = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const scene = css.match(/(^|\})\s*\.scene\s*\{([^}]*)\}/);
  const stack = css.match(/(^|\})\s*\.stack\s*\{([^}]*)\}/);
  assert.ok(scene && stack);
  assert.match(scene[2], /width\s*:\s*1000px/);
  assert.match(scene[2], /min-width\s*:\s*1000px/);
  assert.match(stack[2], /padding\s*:\s*182px\s+26px\s+0\s+206px/);

  const query = css.match(/@media\s*\(max-width:\s*900px\)\s*\{([\s\S]*?\n\s*\})\s*\n/);
  assert.ok(query, 'a 900px query should restore the mobile layout');
  assert.match(query[1], /\.scene\s*\{[^}]*width\s*:\s*820px/);
  assert.match(query[1], /\.scene\s*\{[^}]*min-width\s*:\s*820px/);
  assert.match(query[1], /\.stack\s*\{[^}]*padding-left\s*:\s*26px/);
  assert.match(query[1], /\.hud__log\s*\{[^}]*display\s*:\s*none/);
  assert.match(query[1], /\.hud\s*\{[^}]*width\s*:\s*auto/);
});

// renderLog writes into #hud-log; this stub is the smallest thing that lets
// the pure markup be inspected.
function logBox(ctx) {
  const box = { innerHTML: '' };
  ctx.document.getElementById = (id) => (id === 'hud-log' ? box : null);
  return box;
}

test('renderLog hangs one tag per movement, in the order given', () => {
  const ctx = loadApp();
  const box = logBox(ctx);
  ctx.renderLog([
    { id: 3, delta_g: 77, jar_name: 'MWHS' },
    { id: 2, delta_g: -2, jar_name: 'Mango' },
  ]);
  const tags = box.innerHTML.match(/class="ev"/g) || [];
  assert.equal(tags.length, 2);
  assert.ok(box.innerHTML.indexOf('MWHS') < box.innerHTML.indexOf('Mango'), 'order must be preserved');
  assert.ok(box.innerHTML.includes('+77g'));
  assert.ok(box.innerHTML.includes('-2g'));
});

test('renderLog never hangs more than ten tags', () => {
  const ctx = loadApp();
  const box = logBox(ctx);
  const many = Array.from({ length: 25 }, (_, i) => ({ id: i, delta_g: 1, jar_name: `J${i}` }));
  ctx.renderLog(many);
  assert.equal((box.innerHTML.match(/class="ev"/g) || []).length, 10);
});

test('renderLog draws nothing at all when there is no history', () => {
  const ctx = loadApp();
  const box = logBox(ctx);
  box.innerHTML = '<div class="ev">stale</div>';
  ctx.renderLog([]);
  assert.equal(box.innerHTML, '', 'an empty journal must leave no empty frame behind');
});

test('a tag marks additions and removals differently', () => {
  const ctx = loadApp();
  const box = logBox(ctx);
  ctx.renderLog([{ id: 1, delta_g: 5, jar_name: 'Up' }, { id: 2, delta_g: -5, jar_name: 'Down' }]);
  assert.match(box.innerHTML, /class="d up"/);
  assert.match(box.innerHTML, /class="d down"/);
});

test('a jar name containing markup is escaped on its hanging tag', () => {
  const ctx = loadApp();
  const box = logBox(ctx);
  ctx.renderLog([{ id: 1, delta_g: 5, jar_name: '<img src=x onerror=alert(1)>' }]);
  assert.ok(!box.innerHTML.includes('<img'), 'name must not become an element');
  assert.ok(box.innerHTML.includes('&lt;img'), 'it should appear as escaped text instead');
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
  const shelves = { innerHTML: '', querySelectorAll: () => [] };
  const hudTotal = { textContent: '' };
  const log = { innerHTML: '' };
  ctx.document.getElementById = (id) => {
    if (id === 'shelves') return shelves;
    if (id === 'hud-total') return hudTotal;
    if (id === 'hud-log') return log;
    return null;
  };
  ctx.Api = {
    list: async () => [{ id: 1, name: 'MWHS', weight_g: 10, color_tag: '#79a67e' }],
    events: async () => { throw new Error('offline'); },
  };

  await assert.doesNotReject(ctx.loadAndRender());

  assert.ok(shelves.innerHTML.length > 0, 'the shelves should still render');
  assert.equal(log.innerHTML, '', 'the log should be left empty rather than throwing');
});

// --- app.js: stats and runway ---------------------------------------------------

const READY = {
  total_g: 120, ready: true, window_days: 30, consumed_g: 48, per_day_g: 1.6,
  days_left: 75, trend_pct: 12.4,
  daily: Array.from({ length: 14 }, (_, i) => ({ day: `2026-09-${String(19 + i).padStart(2, '0')}`, g: i === 13 ? 4 : i === 3 ? 2 : 0 })),
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
    if (id === 'shelves') return { innerHTML: '', querySelectorAll: () => [] };
    if (id === 'hud-total') return { textContent: '' };
    if (id === 'hud-eta') return eta;
    return null;
  };
  ctx.Api = { list: async () => [], events: async () => [], stats: async () => READY };
  await ctx.loadAndRender();
  assert.equal(eta.textContent, '~75 J');
});
