import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SCENE_FILES = ['scene3d/kit.js', 'scene3d/props.js', 'scene3d/room.js', 'scene3d/jar.js'];

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
