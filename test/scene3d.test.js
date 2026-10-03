import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SCENE_FILES = ['scene3d/kit.js', 'scene3d/props.js', 'scene3d/room.js', 'scene3d/jar.js', 'scene3d/stage.js'];

test('every scene file parses', () => {
  for (const f of SCENE_FILES) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(PUBLIC, f), 'utf8'), { filename: f }), f);
  }
});

test('without three.js the scene files define nothing and do not throw', () => {
  const ctx = vm.createContext({ window: {} });
  for (const f of SCENE_FILES) vm.runInContext(fs.readFileSync(path.join(PUBLIC, f), 'utf8'), ctx);
  assert.equal(ctx.window.S3, undefined);
});

test('without three.js there is no Scene3D, so app.js takes the fallback path', () => {
  const ctx = vm.createContext({ window: {} });
  for (const f of SCENE_FILES) vm.runInContext(fs.readFileSync(path.join(PUBLIC, f), 'utf8'), ctx);
  assert.equal(ctx.window.Scene3D, undefined);
});

// --- the stage, mounted on real three.js with a stand-in renderer ------------

// three.js builds scenes fine without a GPU; only WebGLRenderer needs one. The
// fake renderer keeps the scene it is asked to draw so the test can inspect it.
function mountStage() {
  const listeners = {};
  const classes = new Set();
  const canvas = {
    clientWidth: 390, clientHeight: 844,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
  };
  const ctx2d = { measureText: (t) => ({ width: String(t).length * 5 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) };
  const ctx2dProxy = new Proxy(ctx2d, { get: (o, k) => (k in o ? o[k] : () => {}) });
  const doc = { createElement: () => ({ style: {}, getContext: () => ctx2dProxy, remove() {} }) };
  const frames = [];
  const ctx = vm.createContext({ console, Math, Uint8ClampedArray, Float32Array, performance, document: doc, innerWidth: 390, innerHeight: 844,
    addEventListener() {}, matchMedia: () => ({ matches: false }), requestAnimationFrame: (f) => frames.push(f) });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(PUBLIC, 'vendor/three.min.js'), 'utf8'), ctx);
  let drawn = null;
  ctx.THREE.WebGLRenderer = class { setPixelRatio() {} setSize() {} render(scene) { drawn = scene; } };
  for (const f of ['stash-model.js', 'tape-label.js', ...SCENE_FILES]) vm.runInContext(fs.readFileSync(path.join(PUBLIC, f), 'utf8'), ctx);
  const S = ctx.Scene3D;
  assert.equal(S.mount(canvas, { appendChild() {} }), true);
  return { S, listeners, classes, scene: () => drawn };
}

const JARS = [1, 2, 3, 4].map((id) => ({ id, name: `J${id}`, weight_g: 20 * id, color_tag: '#b07d9c', harvest_date: '13/07' }));

function gpuResources(scene) {
  const out = new Set();
  scene.traverse((o) => {
    if (o.geometry) out.add(o.geometry);
    for (const m of [].concat(o.material || [])) out.add(m);
  });
  return out;
}

test('rebuilding the room releases every geometry and material it no longer uses', () => {
  const { S, scene } = mountStage();
  S.setJars(JARS);
  const before = gpuResources(scene());
  const disposed = new Set();
  before.forEach((r) => r.addEventListener('dispose', () => disposed.add(r)));
  S.setMode('night');
  const after = gpuResources(scene());
  const orphans = [...before].filter((r) => !after.has(r) && !disposed.has(r));
  assert.equal(orphans.length, 0, `${orphans.length} resources left on the GPU, e.g. ${orphans.slice(0, 3).map((r) => r.type).join(', ')}`);
  const sharedKept = [...before].filter((r) => after.has(r));
  assert.ok(sharedKept.every((r) => !disposed.has(r)), 'shared bud/glass resources are still in use and must not be disposed');
});

test('removing a jar releases its lid, rings and shine', () => {
  const { S, scene } = mountStage();
  S.setJars(JARS);
  const before = gpuResources(scene());
  const disposed = new Set();
  before.forEach((r) => r.addEventListener('dispose', () => disposed.add(r)));
  S.setJars(JARS.slice(0, 3));
  const after = gpuResources(scene());
  assert.equal([...before].filter((r) => !after.has(r) && !disposed.has(r)).length, 0);
});

test('a cancelled touch does not leave the shelf stuck mid-drag', () => {
  const { listeners, classes } = mountStage();
  listeners.pointerdown({ clientX: 100, clientY: 100, pointerId: 1 });
  listeners.pointermove({ clientX: 160, clientY: 100, pointerId: 1 });
  assert.ok(classes.has('dragging'));
  listeners.pointercancel({ pointerId: 1 });
  assert.ok(!classes.has('dragging'));
});

test('refit reads the overlay heights again', () => {
  const { S } = mountStage();
  assert.equal(typeof S.refit, 'function');
  assert.doesNotThrow(() => S.refit());
});
