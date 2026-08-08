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
    Math, console, Number, String, Array, Object, JSON,
  });
  vm.runInContext(read('jar-svg.js'), ctx);
  ctx.JarSvg = ctx.window.JarSvg;
  vm.runInContext(read('app.js'), ctx);
  return ctx;
}

const CLIP_TOP = 19;   // #jarInner starts here; anything above is sliced flat
const JAR_BOTTOM = 44;

function budTops(markup) {
  return [...markup.matchAll(/<use href="#bud\d" x="[-\d.]+" y="([-\d.]+)"/g)].map((m) => Number(m[1]));
}

// --- jar-svg: the fill gauge -------------------------------------------------

test('fillTop maps empty to the jar floor and full to just inside the clip', () => {
  const { fillTop } = loadJarSvg();
  assert.equal(fillTop(0, 50), JAR_BOTTOM);
  assert.equal(fillTop(50, 50), 19.5);
  assert.ok(fillTop(50, 50) > CLIP_TOP, 'a full jar must stay below the clip edge');
  assert.equal(fillTop(25, 50), 31.75);
});

test('fillTop clamps out-of-range input instead of overflowing the jar', () => {
  const { fillTop } = loadJarSvg();
  assert.equal(fillTop(999, 50), 19.5);
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

test('no bud is ever drawn above the clip edge, at any weight or id', () => {
  const { buildJar } = loadJarSvg();
  let highest = Infinity;
  for (let id = 1; id <= 60; id++) {
    for (const weight_g of [0.5, 12, 33, 49, 50, 64, 99, 250]) {
      const tops = budTops(buildJar({ id, weight_g, color_tag: '#79a67e' }));
      if (tops.length) highest = Math.min(highest, ...tops);
    }
  }
  assert.ok(highest > CLIP_TOP, `highest bud landed at ${highest}, clip edge is ${CLIP_TOP}`);
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
