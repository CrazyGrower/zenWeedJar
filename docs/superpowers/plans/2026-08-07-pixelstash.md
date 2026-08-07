# PixelStash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PixelStash — a cozy pixel-art web app to track jars of stash on a virtual shelf, backed by a central SQLite database, served + containerized so any device on the LAN can use it.

**Architecture:** A single Node/Express process serves both the REST API and the static frontend. Data lives in SQLite (`better-sqlite3`) at `./data/stash.db` (Docker volume). The backend splits into `db.js` (connection + schema + seed), `jars.js` (validated CRUD repository), `app.js` (Express app factory, testable), and `server.js` (entry point). The frontend is dependency-free vanilla JS/CSS/SVG that reuses the validated mockup (`mockups/mockup-2-lofi-room.html`): pixel-art mason jars in SVG with 5 reusable weed-bud sprites, fill proportional to weight, and a native `<dialog>` for detail/edit.

**Tech Stack:** Node 20 LTS (ESM), Express, better-sqlite3, node:test + supertest (dev), vanilla JS/CSS/SVG, native `<dialog>`, Docker + docker-compose.

## Global Constraints

- Node 20 LTS; package is ESM (`"type": "module"`).
- Runtime dependencies limited to `express` and `better-sqlite3`. Dev-only: `supertest`. No frontend dependencies, no build step.
- DB file path is configurable via `DB_PATH` env (default `./data/stash.db`); tests use `:memory:` or a temp file.
- HTTP port configurable via `PORT` env (default `3000`).
- Seed exactly these 4 jars only when the table is empty; total must be **237g**: Mwhs 13/07 77g (`#79a67e`), Mango 23/07 65g (`#e2a04c`), Mango 10/04 40g (`#e2a04c`), Liver 10/04 55g (`#b07d9c`).
- `color_tag` stores the **cap band hex**; the frontend derives the darker disc shade.
- Sync model: refresh-on-load and re-fetch after every create/update/delete. No polling, no WebSocket.
- No authentication.
- Visual direction is locked to the mockup; carry over its palette, fonts (`Silkscreen` + `Press Start 2P`), jar silhouette, and 5 bud sprites verbatim.
- Deferred refinements (noted, not blockers): more realistic dense fill / bud sprites, cat redesign + eyes-follow-mouse. See spec §"Notes d'implémentation".

---

### Task 1: Project scaffolding + Express app factory + health route

**Files:**
- Create: `package.json`
- Create: `app.js`
- Create: `server.js`
- Create: `test/app.test.js`
- Modify: `.gitignore` (ensure `node_modules/` and `data/` are ignored — already present)

**Interfaces:**
- Produces: `createApp(db)` in `app.js` → returns a configured Express `app` (no `.listen`). At this task it only needs `express.json()` + `GET /api/health` → `{ ok: true }`. `db` may be `null` for now.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pixelstash",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "express": "^4.19.0"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `express` and `better-sqlite3` build successfully.

- [ ] **Step 3: Write the failing test** — `test/app.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';

test('GET /api/health returns ok', async () => {
  const app = createApp(null);
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test test/app.test.js`
Expected: FAIL — cannot find `../app.js`.

- [ ] **Step 5: Create `app.js`**

```js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

export function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(__dirname, 'public')));
  return app;
}
```

- [ ] **Step 6: Create `server.js`**

```js
import fs from 'fs';
import path from 'path';
import { createApp } from './app.js';

const DB_PATH = process.env.DB_PATH || './data/stash.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// db wiring is added in Task 2/4; for now db is null
const app = createApp(null);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PixelStash on http://localhost:${PORT}`));
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --test test/app.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json app.js server.js test/app.test.js
git commit -m "feat: scaffold Express app factory with health route"
```

---

### Task 2: Database module — schema + seed (`db.js`)

**Files:**
- Create: `db.js`
- Create: `test/db.test.js`

**Interfaces:**
- Produces: `openDb(path?)` → opens/creates a better-sqlite3 DB at `path` (default `process.env.DB_PATH || './data/stash.db'`), ensures the `jars` table exists, seeds the 4 rows **only when the table is empty**, and returns the `Database` instance. Columns: `id, name, harvest_date, weight_g, thc_percent, indica_pct, notes, color_tag, created_at`.

- [ ] **Step 1: Write the failing test** — `test/db.test.js`

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/db.test.js`
Expected: FAIL — cannot find `../db.js`.

- [ ] **Step 3: Create `db.js`**

```js
import Database from 'better-sqlite3';

const SEED = [
  { name: 'Mwhs',  harvest_date: '13/07', weight_g: 77, color_tag: '#79a67e' },
  { name: 'Mango', harvest_date: '23/07', weight_g: 65, color_tag: '#e2a04c' },
  { name: 'Mango', harvest_date: '10/04', weight_g: 40, color_tag: '#e2a04c' },
  { name: 'Liver', harvest_date: '10/04', weight_g: 55, color_tag: '#b07d9c' },
];

export function openDb(dbPath = process.env.DB_PATH || './data/stash.db') {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS jars (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      harvest_date TEXT,
      weight_g     REAL NOT NULL,
      thc_percent  REAL,
      indica_pct   REAL,
      notes        TEXT,
      color_tag    TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM jars').get();
  if (n === 0) {
    const insert = db.prepare(
      'INSERT INTO jars (name, harvest_date, weight_g, color_tag) VALUES (@name, @harvest_date, @weight_g, @color_tag)'
    );
    const seed = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
    seed(SEED);
  }
  return db;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/db.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add db.js test/db.test.js
git commit -m "feat: sqlite schema + idempotent 237g seed"
```

---

### Task 3: Jars repository — validated CRUD (`jars.js`)

**Files:**
- Create: `jars.js`
- Create: `test/jars.test.js`

**Interfaces:**
- Consumes: `openDb` from `db.js`.
- Produces (all take the `db` instance as first arg):
  - `listJars(db)` → array ordered by `created_at, id`
  - `getJar(db, id)` → row or `undefined`
  - `createJar(db, data)` → created row; throws `ValidationError` on bad input
  - `updateJar(db, id, data)` → updated row, or `null` if id not found; throws `ValidationError` on bad field
  - `deleteJar(db, id)` → `true` if a row was deleted, else `false`
  - `ValidationError` (exported class)
- Validation rules: `name` required non-empty string (trimmed); `weight_g` finite number ≥ 0; `thc_percent`/`indica_pct` optional finite numbers (empty string/null → null); `harvest_date`/`notes`/`color_tag` optional strings. On update, only provided fields are validated/changed (partial).

- [ ] **Step 1: Write the failing test** — `test/jars.test.js`

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/jars.test.js`
Expected: FAIL — cannot find `../jars.js`.

- [ ] **Step 3: Create `jars.js`**

```js
export class ValidationError extends Error {}

const STRING_FIELDS = ['harvest_date', 'notes', 'color_tag'];
const NUMBER_FIELDS = ['thc_percent', 'indica_pct'];

function validate(data, { partial = false } = {}) {
  const out = {};

  if (!partial || 'name' in data) {
    if (typeof data.name !== 'string' || !data.name.trim()) {
      throw new ValidationError('name is required');
    }
    out.name = data.name.trim();
  }

  if (!partial || 'weight_g' in data) {
    const w = Number(data.weight_g);
    if (!Number.isFinite(w) || w < 0) {
      throw new ValidationError('weight_g must be a number >= 0');
    }
    out.weight_g = w;
  }

  for (const f of STRING_FIELDS) {
    if (f in data) out[f] = data[f] == null ? null : String(data[f]);
  }
  for (const f of NUMBER_FIELDS) {
    if (f in data) {
      if (data[f] == null || data[f] === '') { out[f] = null; continue; }
      const n = Number(data[f]);
      if (!Number.isFinite(n)) throw new ValidationError(`${f} must be a number`);
      out[f] = n;
    }
  }
  return out;
}

export function listJars(db) {
  return db.prepare('SELECT * FROM jars ORDER BY created_at, id').all();
}

export function getJar(db, id) {
  return db.prepare('SELECT * FROM jars WHERE id = ?').get(id);
}

export function createJar(db, data) {
  const v = validate(data);
  const row = {
    harvest_date: null, thc_percent: null, indica_pct: null,
    notes: null, color_tag: null, ...v,
  };
  const info = db.prepare(`
    INSERT INTO jars (name, harvest_date, weight_g, thc_percent, indica_pct, notes, color_tag)
    VALUES (@name, @harvest_date, @weight_g, @thc_percent, @indica_pct, @notes, @color_tag)
  `).run(row);
  return getJar(db, info.lastInsertRowid);
}

export function updateJar(db, id, data) {
  const existing = getJar(db, id);
  if (!existing) return null;
  const merged = { ...existing, ...validate(data, { partial: true }) };
  db.prepare(`
    UPDATE jars SET name=@name, harvest_date=@harvest_date, weight_g=@weight_g,
      thc_percent=@thc_percent, indica_pct=@indica_pct, notes=@notes, color_tag=@color_tag
    WHERE id=@id
  `).run({ ...merged, id });
  return getJar(db, id);
}

export function deleteJar(db, id) {
  return db.prepare('DELETE FROM jars WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/jars.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add jars.js test/jars.test.js
git commit -m "feat: validated jars CRUD repository"
```

---

### Task 4: REST API routes wired into the app

**Files:**
- Modify: `app.js` (add routes, accept a real `db`)
- Modify: `server.js` (open db, pass to `createApp`)
- Create: `test/api.test.js`

**Interfaces:**
- Consumes: `openDb` (`db.js`), repository functions + `ValidationError` (`jars.js`).
- Produces routes on the app from `createApp(db)`:
  - `GET /api/jars` → 200, array
  - `POST /api/jars` → 201 created row; 400 `{error}` on `ValidationError`
  - `PUT /api/jars/:id` → 200 updated row; 404 `{error}` if missing; 400 on `ValidationError`
  - `DELETE /api/jars/:id` → 204 no body; 404 `{error}` if missing

- [ ] **Step 1: Write the failing test** — `test/api.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

function appWithDb() { return createApp(openDb(':memory:')); }

test('GET /api/jars returns the seeds', async () => {
  const res = await request(appWithDb()).get('/api/jars');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 4);
});

test('POST /api/jars creates a jar', async () => {
  const app = appWithDb();
  const res = await request(app).post('/api/jars').send({ name: 'Kush', weight_g: 10 });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Kush');
  const list = await request(app).get('/api/jars');
  assert.equal(list.body.length, 5);
});

test('POST /api/jars rejects invalid payload with 400', async () => {
  const res = await request(appWithDb()).post('/api/jars').send({ weight_g: 5 });
  assert.equal(res.status, 400);
});

test('PUT /api/jars/:id updates a jar', async () => {
  const app = appWithDb();
  const first = (await request(app).get('/api/jars')).body[0];
  const res = await request(app).put(`/api/jars/${first.id}`).send({ weight_g: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body.weight_g, 1);
});

test('PUT /api/jars/:id returns 404 for unknown id', async () => {
  const res = await request(appWithDb()).put('/api/jars/9999').send({ weight_g: 1 });
  assert.equal(res.status, 404);
});

test('DELETE /api/jars/:id removes a jar', async () => {
  const app = appWithDb();
  const first = (await request(app).get('/api/jars')).body[0];
  const res = await request(app).delete(`/api/jars/${first.id}`);
  assert.equal(res.status, 204);
  const list = await request(app).get('/api/jars');
  assert.equal(list.body.length, 3);
});

test('DELETE /api/jars/:id returns 404 for unknown id', async () => {
  const res = await request(appWithDb()).delete('/api/jars/9999');
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/api.test.js`
Expected: FAIL — routes return 404 / not implemented.

- [ ] **Step 3: Update `app.js`** — replace its contents with:

```js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listJars, getJar, createJar, updateJar, deleteJar, ValidationError } from './jars.js';

export function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/api/jars', (req, res) => res.json(listJars(db)));

  app.post('/api/jars', (req, res) => {
    try {
      res.status(201).json(createJar(db, req.body || {}));
    } catch (e) {
      if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  app.put('/api/jars/:id', (req, res) => {
    try {
      const jar = updateJar(db, Number(req.params.id), req.body || {});
      if (!jar) return res.status(404).json({ error: 'jar not found' });
      res.json(jar);
    } catch (e) {
      if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  app.delete('/api/jars/:id', (req, res) => {
    if (!deleteJar(db, Number(req.params.id))) return res.status(404).json({ error: 'jar not found' });
    res.status(204).end();
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(__dirname, 'public')));
  return app;
}
```

- [ ] **Step 4: Update `server.js`** — wire the real db:

```js
import fs from 'fs';
import path from 'path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const DB_PATH = process.env.DB_PATH || './data/stash.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = openDb(DB_PATH);
const app = createApp(db);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PixelStash on http://localhost:${PORT}`));
```

- [ ] **Step 5: Run all tests**

Run: `node --test`
Expected: PASS across `app`, `db`, `jars`, `api` test files.

- [ ] **Step 6: Commit**

```bash
git add app.js server.js test/api.test.js
git commit -m "feat: REST API for jars CRUD"
```

---

### Task 5: Frontend shell — HTML + CSS ported from the mockup

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

**Interfaces:**
- Produces the static shell served at `/`: the room `.scene`, the reusable SVG `<defs>` (jar silhouette `#sil`, `#jarInner` clip, 5 bud symbols `#bud1`–`#bud5`), the HUD tag (empty total span `#hud-total`), an empty shelves container `#shelves`, a "+ Nouveau Bocal" button `#add-btn`, and two empty `<dialog>` elements `#detail-dialog` and `#form-dialog`. Renders nothing dynamic yet.

- [ ] **Step 1: Create `public/style.css`**

Copy the entire contents of the `<style>` block from `mockups/mockup-2-lofi-room.html` into `public/style.css` (drop the surrounding `<style>`/`</style>` tags). Then apply these adaptations:
- Remove the `.cap` rules (the mockup caption is not part of the app).
- Keep everything else (`:root` tokens, `.scene`, `.window`, `.beam`, `.dust`, `.hud`, `.stack`, `.shelf`, `.slot`, `.jar`, `.jarwrap`, `.label`, `.cat`, `.add`, media queries).
- Add dialog styling at the end:

```css
dialog{ border:none; padding:0; background:transparent; color:var(--cream); }
dialog::backdrop{ background:rgba(20,14,26,.66); }
.modal{ background:var(--wall-hi); border:5px solid #1d1626; box-shadow:inset 0 0 0 3px #7a5f6e;
  padding:22px 22px 20px; width:min(92vw,340px); font-family:'Silkscreen',monospace; }
.modal h2{ font-family:'Press Start 2P'; font-size:14px; color:var(--peach); margin-bottom:4px; }
.modal .sub{ font-size:9px; color:#cdb9a6; letter-spacing:1px; margin-bottom:16px; }
.modal .row{ margin-bottom:12px; }
.modal .row label{ display:block; font-size:8px; letter-spacing:2px; color:#cdb9a6; margin-bottom:5px; }
.modal input, .modal textarea{ width:100%; font-family:'Silkscreen',monospace; font-size:11px;
  background:#f6efdb; color:var(--kraft-ink); border:3px solid var(--kraft-lo); padding:8px; }
.bar{ height:14px; background:#d8cbaa; border:2px solid var(--kraft-lo); position:relative; overflow:hidden; }
.bar>span{ position:absolute; top:0; bottom:0; left:0; background:var(--ember); }
.ratio>.i{ position:absolute; left:0; top:0; bottom:0; background:#b58fd6; }
.ratio>.s{ position:absolute; right:0; top:0; bottom:0; background:#8fc0a0; }
.modal .actions{ display:flex; flex-direction:column; gap:8px; margin-top:16px; }
.btn{ font-family:'Silkscreen'; font-weight:700; font-size:10px; padding:10px; cursor:pointer; border:3px solid; letter-spacing:1px; }
.btn--primary{ background:var(--peach); border-color:#b87a34; color:#4a3510; box-shadow:0 4px 0 #935e26; }
.btn--edit{ background:#9ac48f; border-color:#5f8a63; color:#204028; box-shadow:0 4px 0 #5f8a63; }
.btn--del{ background:#e79a9a; border-color:#c26a6a; color:#5a2020; box-shadow:0 4px 0 #c26a6a; }
.btn--ghost{ background:transparent; border-color:#7a5f6e; color:#cdb9a6; box-shadow:none; }
.btn:active{ transform:translateY(3px); box-shadow:none; }
```

- [ ] **Step 2: Create `public/index.html`**

Base the markup on `mockups/mockup-2-lofi-room.html` with these concrete changes:
- Link the external stylesheet instead of inline CSS: in `<head>` keep the Google Fonts links and add `<link rel="stylesheet" href="/style.css">`.
- Keep the hidden `<svg>` `<defs>` block **verbatim** (contains `#jarInner`, `#sil`, and `#bud1`–`#bud5`).
- Keep `.scene`, `.beam`, `.dust`, `.window`, `.sill`, `.floor`, `.cat`, and `.add` markup.
- Replace the hardcoded HUD total with a span: `<div class="hud__total" id="hud-total">…</div>` (no emoji in `.hud__label`, text `STASH TOTAL`).
- Replace the two hardcoded `.shelf` blocks with a single empty container: `<div class="stack" id="shelves"></div>`.
- Give the add button an id: `<button class="add__btn" id="add-btn">+ NOUVEAU BOCAL</button>`.
- Remove the `.cap` block and the inline bud-packing `<script>` (packing moves to `jar-svg.js`).
- Before `</body>`, add the two dialogs and the script includes:

```html
<dialog id="detail-dialog"></dialog>
<dialog id="form-dialog"></dialog>

<script src="/api.js"></script>
<script src="/jar-svg.js"></script>
<script src="/app.js"></script>
```

- [ ] **Step 3: Verify the shell serves**

Run: `npm start` (in another shell) then `curl -s localhost:3000/ | grep -c 'id="shelves"'`
Expected: prints `1`. Also open `http://localhost:3000` in a browser: the empty room (window, beam, cat, HUD tag, add button) renders; the shelves area is empty (JS not wired yet). Stop the server.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: static frontend shell ported from mockup"
```

---

### Task 6: Frontend jar renderer + API client

**Files:**
- Create: `public/api.js`
- Create: `public/jar-svg.js`

**Interfaces:**
- Produces global `window.Api` with async methods: `list()`, `create(data)`, `update(id, data)`, `remove(id)` — thin `fetch` wrappers returning parsed JSON (or `null` for 204).
- Produces global `window.JarSvg` with:
  - `fillTop(weight, maxWeight)` → number in `[17, 44]` (SVG y of the fill surface; full = 17, empty = 44).
  - `buildJar(jar, maxWeight)` → HTML string for a `<svg class="jar" data-id>` with buds packed to the fill line, cap coloured from `jar.color_tag`, using a per-jar seeded RNG so buds are stable across re-renders.
  - `darken(hex, amt)` helper (used for the cap disc shade).

- [ ] **Step 1: Create `public/api.js`**

```js
window.Api = {
  async list() { return (await fetch('/api/jars')).json(); },
  async create(data) {
    const r = await fetch('/api/jars', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'create failed');
    return r.json();
  },
  async update(id, data) {
    const r = await fetch(`/api/jars/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'update failed');
    return r.json();
  },
  async remove(id) {
    const r = await fetch(`/api/jars/${id}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 204) throw new Error('delete failed');
    return null;
  },
};
```

- [ ] **Step 2: Create `public/jar-svg.js`**

```js
(function (global) {
  const BUDS = ['bud1', 'bud2', 'bud3', 'bud4', 'bud5'];

  function darken(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
    const g = Math.max(0, ((n >> 8) & 255) * (1 - amt));
    const b = Math.max(0, (n & 255) * (1 - amt));
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  // deterministic RNG so a jar's buds stay put across re-renders
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fillTop(weight, maxWeight) {
    const frac = maxWeight > 0 ? Math.min(1, Math.max(0, weight / maxWeight)) : 0;
    return 44 - frac * 27; // full (frac 1) -> 17, empty -> 44
  }

  function buildJar(jar, maxWeight) {
    const cap = jar.color_tag || '#79a67e';
    const disc = darken(cap, 0.18);
    const top = fillTop(jar.weight_g, maxWeight);
    const rnd = mulberry32((jar.id || 1) * 2654435761);

    let buds = '';
    const cols = [4, 9, 14, 19, 24];
    let row = 0;
    for (let y = 44 - 9; y > top - 5; y -= 4) {
      const off = row % 2 ? 2.5 : 0;
      for (const cx of cols) {
        const size = (9 + rnd() * 2).toFixed(1);
        const x = (cx + off + (rnd() * 2 - 1)).toFixed(1);
        const yy = (y + (rnd() * 2 - 1)).toFixed(1);
        const b = BUDS[Math.floor(rnd() * BUDS.length)];
        buds += `<use href="#${b}" x="${x}" y="${yy}" width="${size}" height="${size}"/>`;
      }
      row++;
    }

    return `
      <svg class="jar" data-id="${jar.id}" viewBox="0 0 32 46" shape-rendering="crispEdges">
        <use href="#sil" fill="#e4f1ec" stroke="#b3ccc5" stroke-width="0.7"/>
        <g clip-path="url(#jarInner)">${buds}
          <rect x="8" y="21" width="2" height="18" fill="#fff" opacity=".3"/>
        </g>
        <rect x="9" y="2" width="14" height="3" fill="${disc}"/>
        <rect x="7" y="5" width="18" height="6" fill="${cap}"/>
        <rect x="7" y="7" width="18" height="1" fill="${disc}" opacity=".6"/>
        <rect x="7" y="9" width="18" height="1" fill="${disc}" opacity=".6"/>
        <rect x="8" y="5.6" width="12" height="1" fill="#fff" opacity=".3"/>
      </svg>`;
  }

  global.JarSvg = { fillTop, buildJar, darken };
})(window);
```

- [ ] **Step 3: Sanity-check `fillTop` in the browser console**

Run: `npm start`, open `http://localhost:3000`, open DevTools console, run:
`JarSvg.fillTop(77, 77)` → expect `17`; `JarSvg.fillTop(0, 77)` → expect `44`; `JarSvg.fillTop(38.5, 77)` → expect `30.5`.
Also `JarSvg.darken('#e2a04c', 0.18)` returns a valid `#rrggbb` string. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add public/api.js public/jar-svg.js
git commit -m "feat: api client + seeded pixel-jar renderer"
```

---

### Task 7: Frontend orchestration — load, render shelves, HUD total

**Files:**
- Create: `public/app.js`

**Interfaces:**
- Consumes: `window.Api`, `window.JarSvg`.
- Produces global helpers used by later tasks:
  - `loadAndRender()` — fetches jars, stores them in module state, renders shelves + HUD, returns the jars.
  - `renderShelves(jars)` — lays jars out into rows of 6, padding each row with ghost slots up to a minimum grid, wires jar click → `openDetail(jar)` (stub added in Task 8).
  - HUD total = sum of `weight_g` rounded to a whole number + `g`, no emoji.
- Layout rule: show at least 2 rows of 6 slots; grow to fit all jars (`ceil(jars.length / 6)` rows, min 2). Filled slots first (in list order), remaining are ghost slots.

- [ ] **Step 1: Create `public/app.js`**

```js
let jars = [];

function maxWeight() { return jars.reduce((m, j) => Math.max(m, j.weight_g), 0); }

function ghostSlot() {
  return `<div class="slot"><svg class="jar ghost" viewBox="0 0 32 46" shape-rendering="crispEdges">
    <use href="#sil" fill="none" stroke="rgba(247,233,207,.20)" stroke-width="0.7"/></svg></div>`;
}

function filledSlot(jar, max) {
  return `<div class="slot"><div class="jarwrap" data-id="${jar.id}">
    ${JarSvg.buildJar(jar, max)}
    <div class="label"><span class="n">${escapeHtml(jar.name)}</span>
      <span class="d">${escapeHtml(jar.harvest_date || '')}</span></div>
  </div></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderShelves(list) {
  const PER_ROW = 6;
  const rows = Math.max(2, Math.ceil(list.length / PER_ROW));
  const max = maxWeight();
  const cells = list.map((j) => filledSlot(j, max));
  while (cells.length < rows * PER_ROW) cells.push(ghostSlot());

  let html = '';
  for (let r = 0; r < rows; r++) {
    const slots = cells.slice(r * PER_ROW, r * PER_ROW + PER_ROW).join('');
    html += `<div class="shelf"><div class="shelf__row">${slots}</div><div class="shelf__plank"></div></div>`;
  }
  const container = document.getElementById('shelves');
  container.innerHTML = html;

  container.querySelectorAll('.jarwrap').forEach((el) => {
    el.addEventListener('click', () => {
      const jar = jars.find((j) => j.id === Number(el.dataset.id));
      if (jar) openDetail(jar); // defined in Task 8
    });
  });
}

function renderHud() {
  const total = Math.round(jars.reduce((s, j) => s + j.weight_g, 0));
  document.getElementById('hud-total').textContent = `${total}g`;
}

async function loadAndRender() {
  jars = await Api.list();
  renderHud();
  renderShelves(jars);
  return jars;
}

document.addEventListener('DOMContentLoaded', () => {
  loadAndRender();
  document.getElementById('add-btn').addEventListener('click', () => openForm()); // defined in Task 9
});
```

Note: `openDetail` and `openForm` are added in Tasks 8–9; until then, guard them so the page doesn't error — add temporary no-op stubs at the top of `app.js` that will be replaced:

```js
function openDetail() {}
function openForm() {}
```

- [ ] **Step 2: Verify in the browser**

Run: `npm start`, open `http://localhost:3000`.
Expected: the 4 seed jars render on the top shelf (Mwhs / Mango / Liver filled, one Mango half on row 2), foot labels show name + date, remaining slots are ghosts, HUD shows `237g`. Take a screenshot with headless Chrome:
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --window-size=900,860 --virtual-time-budget=1500 --screenshot=/tmp/pixelstash.png http://localhost:3000` and open `/tmp/pixelstash.png` to confirm. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: render shelves and HUD total from API"
```

---

### Task 8: Detail modal on jar click

**Files:**
- Modify: `public/app.js` (replace the `openDetail` stub)

**Interfaces:**
- Consumes: `#detail-dialog`, `jars` state, `loadAndRender`, and (for its buttons) `openForm`, `adjustWeight`, `removeJar` — the latter three are finalized in Task 9; wire the buttons to call them.
- Produces: `openDetail(jar)` — fills and shows `#detail-dialog` with name, harvest date, weight, THC (bar if present), indica/sativa ratio bar (from `indica_pct`), notes, and three action buttons.

- [ ] **Step 1: Replace the `openDetail` stub in `public/app.js`**

```js
function openDetail(jar) {
  const dlg = document.getElementById('detail-dialog');
  const indica = jar.indica_pct == null ? null : Math.max(0, Math.min(100, jar.indica_pct));
  const thc = jar.thc_percent == null ? null : jar.thc_percent;

  dlg.innerHTML = `
    <div class="modal">
      <h2>${escapeHtml(jar.name)}</h2>
      <div class="sub">RÉCOLTE ${escapeHtml(jar.harvest_date || '—')}</div>

      <div class="row"><label>POIDS</label>
        <div style="font-family:'Press Start 2P';font-size:16px;">${jar.weight_g} g</div></div>

      ${thc == null ? '' : `<div class="row"><label>THC · ${thc}%</label>
        <div class="bar"><span style="width:${Math.max(0, Math.min(100, thc))}%"></span></div></div>`}

      ${indica == null ? '' : `<div class="row"><label>INDICA ${indica}% / SATIVA ${100 - indica}%</label>
        <div class="bar ratio"><div class="i" style="width:${indica}%"></div>
        <div class="s" style="width:${100 - indica}%"></div></div></div>`}

      ${!jar.notes ? '' : `<div class="row"><label>NOTES</label>
        <div style="font-size:10px;line-height:1.6;color:#efe6cf;">${escapeHtml(jar.notes)}</div></div>`}

      <div class="actions">
        <button class="btn btn--primary" data-act="adjust">AJUSTER POIDS</button>
        <button class="btn btn--edit" data-act="edit">EDITER</button>
        <button class="btn btn--del" data-act="delete">SUPPRIMER</button>
        <button class="btn btn--ghost" data-act="close">FERMER</button>
      </div>
    </div>`;

  dlg.querySelector('[data-act="close"]').onclick = () => dlg.close();
  dlg.querySelector('[data-act="edit"]').onclick = () => { dlg.close(); openForm(jar); };
  dlg.querySelector('[data-act="adjust"]').onclick = () => { dlg.close(); adjustWeight(jar); };
  dlg.querySelector('[data-act="delete"]').onclick = () => { dlg.close(); removeJar(jar); };
  dlg.showModal();
}
```

- [ ] **Step 2: Verify in the browser**

Run: `npm start`, open the app, click a jar (e.g. Mango). The dialog opens showing weight; THC/ratio/notes rows appear only if present (seeds have none, so only weight + actions show); Échap and FERMER close it. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: jar detail modal"
```

---

### Task 9: Add / edit form, adjust weight, delete

**Files:**
- Modify: `public/app.js` (replace `openForm` stub; add `adjustWeight`, `removeJar`)

**Interfaces:**
- Consumes: `#form-dialog`, `Api.create/update/remove`, `loadAndRender`.
- Produces:
  - `openForm(jar?)` — opens `#form-dialog`; no arg = create, with a jar = edit (prefilled). On submit, calls `Api.create`/`Api.update` then `loadAndRender()`.
  - `adjustWeight(jar)` — prompts for a delta in grams (e.g. `-2`), computes the new non-negative weight, `Api.update(jar.id, {weight_g})`, then `loadAndRender()`.
  - `removeJar(jar)` — confirms, `Api.remove(jar.id)`, then `loadAndRender()`.

- [ ] **Step 1: Replace the `openForm` stub and add the two helpers in `public/app.js`**

```js
const CAP_COLORS = ['#79a67e', '#e2a04c', '#b07d9c', '#8fb0d0', '#d08fa8'];

function openForm(jar) {
  const dlg = document.getElementById('form-dialog');
  const editing = !!jar;
  const j = jar || { name: '', harvest_date: '', weight_g: '', thc_percent: '', indica_pct: '', notes: '', color_tag: CAP_COLORS[0] };

  dlg.innerHTML = `
    <form method="dialog" class="modal">
      <h2>${editing ? 'EDITER' : 'NOUVEAU BOCAL'}</h2>
      <div class="row"><label>NOM *</label><input name="name" value="${escapeHtml(j.name)}" required></div>
      <div class="row"><label>RÉCOLTE (ex 13/07)</label><input name="harvest_date" value="${escapeHtml(j.harvest_date || '')}"></div>
      <div class="row"><label>POIDS (g) *</label><input name="weight_g" type="number" step="0.1" min="0" value="${j.weight_g}" required></div>
      <div class="row"><label>THC %</label><input name="thc_percent" type="number" step="0.1" min="0" value="${j.thc_percent ?? ''}"></div>
      <div class="row"><label>% INDICA (0-100)</label><input name="indica_pct" type="number" step="1" min="0" max="100" value="${j.indica_pct ?? ''}"></div>
      <div class="row"><label>COULEUR BOUCHON</label><input name="color_tag" value="${escapeHtml(j.color_tag || CAP_COLORS[0])}"></div>
      <div class="row"><label>NOTES</label><textarea name="notes" rows="2">${escapeHtml(j.notes || '')}</textarea></div>
      <div class="actions">
        <button class="btn btn--primary" value="save">${editing ? 'ENREGISTRER' : 'AJOUTER'}</button>
        <button class="btn btn--ghost" value="cancel" formnovalidate>ANNULER</button>
      </div>
    </form>`;

  const form = dlg.querySelector('form');
  form.addEventListener('submit', async (e) => {
    if (form.returnValue === 'cancel') return;
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    try {
      if (editing) await Api.update(jar.id, data);
      else await Api.create(data);
      dlg.close();
      await loadAndRender();
    } catch (err) {
      alert(err.message);
    }
  });
  dlg.showModal();
}

async function adjustWeight(jar) {
  const input = prompt(`Ajuster le poids de ${jar.name} (ex -2 pour retirer 2g, +5 pour ajouter)`, '-2');
  if (input == null) return;
  const delta = Number(input);
  if (!Number.isFinite(delta)) return alert('Valeur invalide');
  const next = Math.max(0, jar.weight_g + delta);
  await Api.update(jar.id, { weight_g: next });
  await loadAndRender();
}

async function removeJar(jar) {
  if (!confirm(`Supprimer le bocal "${jar.name}" (${jar.weight_g}g) ?`)) return;
  await Api.remove(jar.id);
  await loadAndRender();
}
```

Note: remove the temporary `openForm`/`openDetail` no-op stubs added in Task 7 — all real implementations now exist.

- [ ] **Step 2: Verify the full CRUD loop in the browser**

Run: `npm start`, open the app.
- Click **+ NOUVEAU BOCAL**, add `Kush / 15/08 / 30g / cap #8fb0d0` → new jar appears, HUD total increases by 30.
- Click the new jar → **AJUSTER POIDS**, enter `-5` → jar weight becomes 25, fill drops, HUD decreases by 5.
- Click it → **EDITER**, change name → updates in place.
- Click it → **SUPPRIMER**, confirm → jar disappears, HUD returns.
Refresh the page (Cmd-R): state persisted from SQLite. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add/edit form, adjust weight, delete"
```

---

### Task 10: Dockerfile, docker-compose, .dockerignore, README

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `README.md`

**Interfaces:**
- Produces a runnable container: `docker compose up` builds the image, mounts `./data` for persistence, serves on host port `3000`.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
data
.git
docs
mockups
npm-debug.log
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:20-bookworm-slim

# build toolchain for better-sqlite3 native module
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=3000
ENV DB_PATH=/app/data/stash.db
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  pixelstash:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3000
      - DB_PATH=/app/data/stash.db
    restart: unless-stopped
```

- [ ] **Step 4: Create `README.md`**

```markdown
# PixelStash 🫙

Cozy pixel-art tracker for your jars on a virtual shelf. Node + Express + SQLite,
vanilla frontend, Dockerized for your home server.

## Run locally
```
npm install
npm start           # http://localhost:3000
```

## Run tests
```
npm test
```

## Run with Docker
```
docker compose up --build
```
The SQLite database persists in `./data/stash.db` (mounted volume). On first boot
the shelf is seeded with 4 jars totaling 237g.

## API
| Method | Route            | Purpose            |
|--------|------------------|--------------------|
| GET    | /api/jars        | list jars          |
| POST   | /api/jars        | create a jar       |
| PUT    | /api/jars/:id    | update a jar       |
| DELETE | /api/jars/:id    | delete a jar       |
```

- [ ] **Step 5: Verify the container end-to-end**

Run: `docker compose up --build -d`, then `curl -s localhost:3000/api/jars | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length, JSON.parse(s).reduce((a,j)=>a+j.weight_g,0)))"`
Expected: prints `4 237`. Open `http://localhost:3000` in a browser to confirm the shelf renders. Then `docker compose down`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore README.md
git commit -m "feat: docker packaging + readme"
```

---

## Self-Review

**Spec coverage:**
- Tech stack (Express, SQLite/better-sqlite3, vanilla FE, Docker) → Tasks 1–4, 5–9, 10 ✓
- Data model `jars` with all columns → Task 2 ✓
- Seed 4 jars = 237g, only when empty → Task 2 ✓
- REST API GET/POST/PUT/DELETE → Task 4 ✓
- HUD total (sum weights, no emoji) → Task 7 ✓
- Shelf view + fill proportional to weight + cap colour per strain → Tasks 6–7 ✓
- Compact foot label (name + date) that lifts with jar on hover → Task 5 (CSS `.jarwrap:hover`) + Task 7 ✓
- Detail modal on click (weight, THC, indica/sativa, notes) → Task 8 ✓
- CRUD: add, adjust weight (−Xg), edit, delete; independent jars → Tasks 8–9 ✓
- Refresh-on-load and after each action → Task 7 `loadAndRender`, re-called in Tasks 8–9 ✓
- Ghost slots for empties → Task 7 ✓
- Visual direction (palette, fonts, jar/bud sprites, sunset beam, black cat) → Tasks 5–6 ✓
- Docker volume persistence, port 3000 → Task 10 ✓
- Deferred refinements documented, not implemented → carried as notes ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. Frontend CSS/HTML "port from mockup" references real committed content in `mockups/mockup-2-lofi-room.html` with an explicit adaptation list, not a placeholder.

**Type consistency:** `createApp(db)`, `openDb(path)`, `listJars/getJar/createJar/updateJar/deleteJar(db, …)`, `ValidationError`, `Api.{list,create,update,remove}`, `JarSvg.{fillTop,buildJar,darken}`, `loadAndRender`, `openDetail`, `openForm`, `adjustWeight`, `removeJar` — names are consistent across all tasks.
