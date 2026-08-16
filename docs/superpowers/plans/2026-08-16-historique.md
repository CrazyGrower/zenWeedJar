# Historique des mouvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Journaliser chaque mouvement de matière (ajout, suppression, ajustement de poids) et l'afficher — guirlande des 10 derniers à gauche des étagères en desktop, historique complet dans une modale ouverte depuis la pancarte STASH TOTAL.

**Architecture:** Une table `jar_events` en append-only, écrite dans la même transaction SQLite que la mutation de `jars` qu'elle décrit. Un endpoint `GET /api/events` la lit. Le front rend une guirlande de mini-étiquettes suspendue sous la pancarte (colonne réservée à gauche des étagères, masquée sous 900px) et une modale d'historique complet.

**Tech Stack:** Node.js + Express, SQLite via `better-sqlite3`, frontend vanilla en `<script>` classiques, tests avec `node --test` + `supertest` + `vm` pour le front.

**Spec:** `docs/superpowers/specs/2026-08-16-historique-design.md`

## Global Constraints

- Aucune nouvelle dépendance npm.
- Pas de modules ES côté front : les fichiers de `public/` sont des `<script>` classiques dont les déclarations de haut niveau sont testées via `vm`.
- Les fonctions pures ajoutées à `public/app.js` doivent être des déclarations de fonction de haut niveau, sinon `vm` ne les voit pas.
- Toute donnée venant de la base et injectée en HTML passe par `escapeHtml`.
- Le plafond d'événements renvoyés par l'API est **500**.
- `kind` vaut exactement `'add'`, `'remove'` ou `'adjust'`.
- **La vue mobile (<900px) doit rester strictement identique à l'actuelle** : mêmes largeurs, mêmes marges, guirlande absente.
- Les tests se lancent avec `npm test` (`node --test`).

---

### Task 1: La table `jar_events`

**Files:**
- Modify: `db.js:12-26` (le `db.exec` de `openDb`)
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: rien
- Produces: la table `jar_events` avec les colonnes `id`, `jar_id`, `jar_name`, `kind`, `delta_g`, `total_after_g`, `created_at`

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `test/db.test.js` :

```js
test('creates the jar_events table on an empty db', () => {
  const db = openDb(':memory:');
  const cols = db.prepare('PRAGMA table_info(jar_events)').all().map((c) => c.name);
  assert.deepEqual(cols, ['id', 'jar_id', 'jar_name', 'kind', 'delta_g', 'total_after_g', 'created_at']);
});

test('seeding jars does not fabricate events', () => {
  // The seeded jars predate the journal; inventing movements for them would
  // put made-up dates in the history.
  const db = openDb(':memory:');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jar_events').get().n, 0);
});

test('adds jar_events to a database that predates it', () => {
  const file = path.join(os.tmpdir(), `stash-ev-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
  try {
    const db1 = openDb(file);
    db1.exec('DROP TABLE jar_events');
    db1.close();
    const db2 = openDb(file);
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM jar_events').get().n, 0);
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM jars').get().n, 4);
    db2.close();
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}-wal`, { force: true });
    fs.rmSync(`${file}-shm`, { force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/db.test.js`
Expected: FAIL — `no such table: jar_events`

- [ ] **Step 3: Create the table**

Dans `db.js`, à la suite du `CREATE TABLE IF NOT EXISTS jars (...)` et **dans le même `db.exec`** :

```sql
    CREATE TABLE IF NOT EXISTS jar_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      jar_id        INTEGER,
      jar_name      TEXT NOT NULL,
      kind          TEXT NOT NULL,
      delta_g       REAL NOT NULL,
      total_after_g REAL NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
```

Ajouter juste au-dessus le commentaire qui explique l'absence de clé étrangère :

```js
    // No FK to jars: an entry must outlive the jar it describes, so the
    // journal can still show "-77g MWHS" after MWHS is deleted. jar_name is a
    // snapshot for the same reason.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, toute la suite

- [ ] **Step 5: Commit**

```bash
git add db.js test/db.test.js
git commit -m "feat: add the jar_events table"
```

---

### Task 2: Écriture et lecture des événements

**Files:**
- Modify: `jars.js` (les trois mutations + deux nouvelles fonctions)
- Test: `test/jars.test.js`

**Interfaces:**
- Consumes: la table `jar_events` de la Task 1
- Produces:
  - `listEvents(db, { limit } = {})` → tableau de lignes `jar_events`, plus récent en premier, plafonné à 500
  - `createJar`, `updateJar`, `deleteJar` gardent exactement leurs signatures et leurs valeurs de retour actuelles

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `test/jars.test.js` :

```js
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
```

Mettre à jour la ligne d'import en tête du fichier :

```js
import { listJars, getJar, createJar, updateJar, deleteJar, listEvents, ValidationError } from '../jars.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/jars.test.js`
Expected: FAIL — `listEvents is not a function`, et les compteurs d'événements valent 0

- [ ] **Step 3: Implement the journal in `jars.js`**

Ajouter après `getJar` :

```js
const EVENT_CAP = 500;

// COALESCE, not SUM alone: on an empty table SUM returns NULL, which would
// write a null total into the journal instead of 0.
function totalWeight(db) {
  return db.prepare('SELECT COALESCE(SUM(weight_g), 0) AS total FROM jars').get().total;
}

// Always called inside the transaction that performs the mutation, and after
// it, so total_after_g is the real stash total at that instant and an event
// can never exist without the weight change it describes.
function recordEvent(db, { jar_id, jar_name, kind, delta_g }) {
  db.prepare(`
    INSERT INTO jar_events (jar_id, jar_name, kind, delta_g, total_after_g)
    VALUES (@jar_id, @jar_name, @kind, @delta_g, @total_after_g)
  `).run({ jar_id, jar_name, kind, delta_g, total_after_g: totalWeight(db) });
}

// created_at has one-second granularity, so two movements in the same second
// tie; id breaks the tie and keeps the order stable.
export function listEvents(db, { limit } = {}) {
  const n = Math.min(Number(limit) > 0 ? Number(limit) : EVENT_CAP, EVENT_CAP);
  return db.prepare('SELECT * FROM jar_events ORDER BY created_at DESC, id DESC LIMIT ?').all(n);
}
```

Remplacer `createJar` par :

```js
export function createJar(db, data) {
  const v = validate(data);
  const row = {
    harvest_date: null, thc_percent: null, indica_pct: null,
    notes: null, color_tag: null, ...v,
  };
  return db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO jars (name, harvest_date, weight_g, thc_percent, indica_pct, notes, color_tag)
      VALUES (@name, @harvest_date, @weight_g, @thc_percent, @indica_pct, @notes, @color_tag)
    `).run(row);
    const jar = getJar(db, info.lastInsertRowid);
    recordEvent(db, { jar_id: jar.id, jar_name: jar.name, kind: 'add', delta_g: jar.weight_g });
    return jar;
  })();
}
```

Remplacer `updateJar` par :

```js
export function updateJar(db, id, data) {
  const existing = getJar(db, id);
  if (!existing) return null;
  const merged = { ...existing, ...validate(data, { partial: true }) };
  const delta = merged.weight_g - existing.weight_g;
  return db.transaction(() => {
    db.prepare(`
      UPDATE jars SET name=@name, harvest_date=@harvest_date, weight_g=@weight_g,
        thc_percent=@thc_percent, indica_pct=@indica_pct, notes=@notes, color_tag=@color_tag
      WHERE id=@id
    `).run({ ...merged, id });
    // Metadata-only edits (name, THC, cap colour) are not movements.
    if (delta !== 0) {
      recordEvent(db, { jar_id: id, jar_name: merged.name, kind: 'adjust', delta_g: delta });
    }
    return getJar(db, id);
  })();
}
```

Remplacer `deleteJar` par :

```js
export function deleteJar(db, id) {
  // Read before the DELETE: afterwards the name and weight are gone.
  const existing = getJar(db, id);
  if (!existing) return false;
  return db.transaction(() => {
    db.prepare('DELETE FROM jars WHERE id = ?').run(id);
    recordEvent(db, {
      jar_id: id, jar_name: existing.name, kind: 'remove', delta_g: -existing.weight_g,
    });
    return true;
  })();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, toute la suite — les tests existants de `jars.test.js` et `api.test.js` doivent rester verts, les signatures n'ayant pas changé

- [ ] **Step 5: Commit**

```bash
git add jars.js test/jars.test.js
git commit -m "feat: record a journal entry for every weight movement"
```

---

### Task 3: `GET /api/events`

**Files:**
- Modify: `app.js` (import + une route, avant `express.static`)
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `listEvents(db, { limit })` de la Task 2
- Produces: `GET /api/events`, `GET /api/events?limit=N` → tableau JSON, plus récent en premier

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `test/api.test.js` :

```js
test('GET /api/events returns an empty array on a fresh db', async () => {
  const res = await request(appWithDb()).get('/api/events');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('a created jar shows up in the journal', async () => {
  const app = appWithDb();
  await request(app).post('/api/jars').send({ name: 'Kush', weight_g: 10 });
  const res = await request(app).get('/api/events');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].kind, 'add');
  assert.equal(res.body[0].jar_name, 'Kush');
  assert.equal(res.body[0].delta_g, 10);
  assert.equal(res.body[0].total_after_g, 247);
});

test('GET /api/events?limit=N returns the N most recent', async () => {
  const app = appWithDb();
  await request(app).post('/api/jars').send({ name: 'One', weight_g: 1 });
  await request(app).post('/api/jars').send({ name: 'Two', weight_g: 2 });
  await request(app).post('/api/jars').send({ name: 'Three', weight_g: 3 });
  const res = await request(app).get('/api/events?limit=2');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((e) => e.jar_name), ['Three', 'Two']);
});

test('GET /api/events rejects a nonsense limit with 400', async () => {
  const app = appWithDb();
  for (const limit of ['abc', '0', '-3', '1.5', '', '9999']) {
    const res = await request(app).get(`/api/events?limit=${limit}`);
    assert.equal(res.status, 400, `limit=${limit} should be rejected`);
    assert.ok(res.body.error);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/api.test.js`
Expected: FAIL — `GET /api/events` renvoie 404 (il tombe dans `express.static`)

- [ ] **Step 3: Add the route**

Dans `app.js`, étendre l'import :

```js
import { listJars, createJar, updateJar, deleteJar, listEvents, ValidationError } from './jars.js';
```

Puis ajouter la route **après** `app.delete('/api/jars/:id', ...)` et **avant** `express.static` — sinon le static middleware répondrait 404 en premier :

```js
  const EVENT_LIMIT_MAX = 500;

  app.get('/api/events', (req, res) => {
    const { limit } = req.query;
    if (limit === undefined) return res.json(listEvents(db));
    // Number('') is 0 and Number('1.5') is 1.5 — both are rejected here rather
    // than silently rounded or treated as "no limit".
    const n = Number(limit);
    if (!Number.isInteger(n) || n <= 0 || n > EVENT_LIMIT_MAX) {
      return res.status(400).json({ error: `limit must be an integer between 1 and ${EVENT_LIMIT_MAX}` });
    }
    res.json(listEvents(db, { limit: n }));
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, toute la suite

- [ ] **Step 5: Commit**

```bash
git add app.js test/api.test.js
git commit -m "feat: expose the journal at GET /api/events"
```

---

### Task 4: Le formatage d'une entrée, côté front

**Files:**
- Modify: `public/app.js` (trois fonctions pures, à ajouter au-dessus de `let jars = [];`)
- Modify: `public/api.js` (une méthode)
- Test: `test/frontend.test.js`

**Interfaces:**
- Consumes: rien
- Produces:
  - `formatDelta(delta_g)` → `'+77g'` / `'-2g'`
  - `formatStamp(created_at)` → `'16/08 21:34'` en heure locale
  - `eventLine(ev)` → `'16/08 21:34 · +77g · MWHS · → 237g'`
  - `Api.events(limit)` → `Promise<Array>`

- [ ] **Step 1: Write the failing tests**

Dans `test/frontend.test.js`, ajouter `Date` au contexte `vm` de `loadApp()` — sans ça `formatStamp` lève `Date is not defined` :

```js
    Math, console, Number, String, Array, Object, JSON, Date,
```

Puis ajouter à la fin du fichier :

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/frontend.test.js`
Expected: FAIL — `formatDelta is not a function`

- [ ] **Step 3: Implement the formatters**

Dans `public/app.js`, ajouter juste au-dessus de `let jars = [];` :

```js
// --- the movement journal ----------------------------------------------------

const LOG_TAGS = 10;

// One decimal: the shelf deals in tenths of a gram and a pixel label has no
// room for more. An ASCII hyphen, not U+2212 — the pixel fonts have no glyph
// for a real minus sign and would render tofu.
function formatDelta(delta_g) {
  const n = Number(delta_g);
  if (!Number.isFinite(n)) return '0g';
  const g = Math.round(n * 10) / 10;
  if (g === 0) return '0g';
  return `${g > 0 ? '+' : '-'}${Math.abs(g)}g`;
}

// SQLite's CURRENT_TIMESTAMP is UTC and has no zone suffix; new Date() would
// read "2026-08-16 21:34:00" as local time and shift the whole journal by the
// local offset. Appending Z makes the parse explicit.
function formatStamp(created_at) {
  const d = new Date(`${String(created_at).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function eventLine(ev) {
  const total = Math.round(Number(ev.total_after_g) || 0);
  return `${formatStamp(ev.created_at)} · ${formatDelta(ev.delta_g)} · ${ev.jar_name} · → ${total}g`;
}
```

Dans `public/api.js`, ajouter à `window.Api`, après `list()` :

```js
  async events(limit) {
    const qs = limit == null ? '' : `?limit=${encodeURIComponent(limit)}`;
    const r = await fetch(`/api/events${qs}`);
    if (!r.ok) throw await apiError(r, 'events failed');
    return r.json();
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, toute la suite

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/api.js test/frontend.test.js
git commit -m "feat: format journal entries on the front end"
```

---

### Task 5: La colonne réservée à gauche des étagères

**Files:**
- Modify: `public/style.css:34-37` (`.scene`), `:72` (`.stack`), `:64-71` (bloc HUD), `:131` (les media queries)
- Test: `test/frontend.test.js`

**Interfaces:**
- Consumes: rien
- Produces: une bande de mur libre de 206px à gauche des étagères en desktop ; `.hud__log` comme conteneur de la guirlande ; retour intégral aux valeurs actuelles sous 900px

Cette tâche ne fait que la mise en page — la guirlande est peuplée à la Task 6. La séparation est volontaire : le décalage de la pièce est ce qui peut casser le rendu existant, et il se relit tout seul.

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `test/frontend.test.js` :

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/frontend.test.js`
Expected: FAIL — `.scene` fait encore 820px

- [ ] **Step 3: Move the room**

Dans `public/style.css`, remplacer les deux largeurs de `.scene` :

```css
    position:relative; width:1000px; min-width:1000px; margin:0 auto; min-height:660px; overflow:hidden;
```

Remplacer le padding de `.stack` :

```css
  /* The 206px on the left is the journal's column: the hanging tags live
     there, so the shelves must not reach into it. The scene grew by the same
     amount, which keeps the six slots at exactly the width they had. */
  .stack{position:relative; z-index:3; padding:182px 26px 0 206px;}
```

Dans le bloc HUD, fixer la largeur de la colonne pour que pancarte et étiquettes s'alignent, et ajouter le conteneur :

```css
  .hud{position:absolute; top:0; left:42px; z-index:5; text-align:center; width:150px;}
```

```css
  .hud__log{margin:0 auto; width:100%;}
```

Enfin, ajouter la media query **avant** celle à 560px :

```css
  /* Under 900px the journal is hidden and the room goes back to exactly the
     numbers it had before the journal existed — the mobile view is unchanged. */
  @media (max-width:900px){
    .scene{width:820px; min-width:820px;}
    .stack{padding-left:26px;}
    .hud{width:auto;}
    .hud__log{display:none;}
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, toute la suite

- [ ] **Step 5: Check it by eye**

Run: `npm start`, ouvrir `http://localhost:3000`
Expected: la fenêtre, le rebord, le chat et le sol sont au même endroit qu'avant ; les étagères ont glissé à droite ; la bande de mur à gauche est vide sous la pancarte ; en réduisant la fenêtre sous 900px la pièce reprend sa largeur d'origine.

- [ ] **Step 6: Commit**

```bash
git add public/style.css test/frontend.test.js
git commit -m "feat: reserve a wall column left of the shelves for the journal"
```

---

### Task 6: La guirlande

**Files:**
- Modify: `public/index.html` (un `<div>` dans `.hud`)
- Modify: `public/app.js` (`renderLog`, `loadAndRender`)
- Modify: `public/style.css` (les mini-étiquettes)
- Test: `test/frontend.test.js`

**Interfaces:**
- Consumes: `formatDelta`, `escapeHtml`, `LOG_TAGS` (Task 4) ; `Api.events(limit)` (Task 4) ; `.hud__log` (Task 5)
- Produces: `renderLog(events)` — écrit dans `#hud-log`, ne renvoie rien

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `test/frontend.test.js` :

```js
// renderLog writes into #hud-log; this stub is the smallest thing that lets
// the pure markup be inspected.
function logBox(ctx) {
  const box = { innerHTML: '' };
  ctx.document.getElementById = (id) => (id === 'hud-log' ? box : null);
  return box;
}

test('renderLog hangs one tag per movement, most recent first', () => {
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/frontend.test.js`
Expected: FAIL — `ctx.renderLog is not a function`

- [ ] **Step 3: Add the container to `public/index.html`**

Dans le bloc `.hud`, après `.hud__tag` :

```html
    <div class="hud__log" id="hud-log"></div>
```

- [ ] **Step 4: Implement `renderLog` in `public/app.js`**

Ajouter après `eventLine` :

```js
function renderLog(events) {
  const box = document.getElementById('hud-log');
  if (!box) return;
  // The tags carry their own borders and the container has no background, so
  // an empty journal leaves no empty frame hanging on the wall.
  box.innerHTML = (events || []).slice(0, LOG_TAGS).map((ev) => {
    const dir = Number(ev.delta_g) < 0 ? 'down' : 'up';
    return `<div class="ev"><span class="d ${dir}">${formatDelta(ev.delta_g)}</span> ` +
      `<span class="n">${escapeHtml(ev.jar_name)}</span></div>`;
  }).join('');
}
```

- [ ] **Step 5: Load the journal in `loadAndRender`**

Remplacer `loadAndRender` par :

```js
async function loadAndRender() {
  try {
    jars = await Api.list();
    renderHud(jars);
    renderShelves(jars);
    setOfflineNotice(false);
  } catch (err) {
    jars = [];
    renderShelves([]);
    renderLog([]);
    setOfflineNotice(true);
    return jars;
  }
  // Its own try: the journal is a garnish, and losing it must not blank the
  // shelves that just loaded fine.
  try {
    renderLog(await Api.events(LOG_TAGS));
  } catch (err) {
    renderLog([]);
  }
  return jars;
}
```

- [ ] **Step 6: Style the tags in `public/style.css`**

Remplacer la règle `.hud__log` posée à la Task 5 par :

```css
  /* Mini kraft tags strung under the sign. Each carries its own border, and
     the top one loses its top edge so the strip reads as one hanging chain. */
  .hud__log{margin:0 auto; width:100%;}
  .hud__log .ev{background:var(--kraft); border:3px solid var(--kraft-lo); border-top:none;
    padding:4px 6px 5px; font-size:8px; letter-spacing:1px; text-align:left;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    box-shadow:0 2px 0 rgba(0,0,0,.18);}
  .hud__log .d{font-weight:700;}
  .hud__log .d.up{color:#3d7a45;}
  .hud__log .d.down{color:#a2453a;}
  .hud__log .n{color:var(--kraft-ink);}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, toute la suite

- [ ] **Step 8: Check it by eye**

Run: `npm start`, ouvrir `http://localhost:3000`, ajouter un bocal puis ajuster son poids
Expected: deux étiquettes apparaissent sous la pancarte, la plus récente en haut, `+Xg` en vert et `-Xg` en rouge. Sur une base vierge, avant toute action, aucune étiquette n'est visible.

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/app.js public/style.css test/frontend.test.js
git commit -m "feat: hang the last ten movements under the total sign"
```

---

### Task 7: La modale d'historique complet

**Files:**
- Modify: `public/index.html` (la pancarte devient un `<button>`, un `<dialog>` de plus)
- Modify: `public/app.js` (`openHistory`, `setOfflineNotice`, le listener au `DOMContentLoaded`)
- Modify: `public/style.css` (styles bouton + liste)
- Test: `test/frontend.test.js`

**Interfaces:**
- Consumes: `eventLine`, `escapeHtml` (Task 4) ; `Api.events()` sans limite (Task 4)
- Produces: `openHistory()` → `Promise<void>`, remplit et ouvre `#history-dialog`

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `test/frontend.test.js` :

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/frontend.test.js`
Expected: FAIL — `ctx.openHistory is not a function`

- [ ] **Step 3: Turn the sign into a button in `public/index.html`**

Remplacer le bloc `.hud` par :

```html
  <div class="hud">
    <div class="hud__string"></div>
    <button class="hud__tag" id="hud-tag" title="Voir le journal">
      <span class="hud__label">STASH TOTAL</span>
      <span class="hud__total" id="hud-total">…</span>
    </button>
    <div class="hud__log" id="hud-log"></div>
  </div>
```

Les `<div>` internes deviennent des `<span>` : un `<button>` ne peut contenir que du contenu phrasé.

Ajouter le dialogue à côté des deux autres :

```html
<dialog id="history-dialog"></dialog>
```

- [ ] **Step 4: Implement `openHistory` and move the offline notice in `public/app.js`**

Ajouter après `renderLog` :

```js
async function openHistory() {
  const dlg = document.getElementById('history-dialog');
  let events;
  try {
    events = await Api.events();
  } catch (err) {
    alert(err.message);
    return;
  }
  const body = events.length === 0
    ? '<div class="log__empty">Aucun mouvement enregistré</div>'
    : `<div class="log">${events
        .map((ev) => `<div class="log__line">${escapeHtml(eventLine(ev))}</div>`)
        .join('')}</div>`;

  dlg.innerHTML = `
    <div class="modal">
      <h2>JOURNAL</h2>
      <div class="sub">MOUVEMENTS DU STASH</div>
      ${body}
      <div class="actions">
        <button class="btn btn--ghost" data-act="close">FERMER</button>
      </div>
    </div>`;
  dlg.querySelector('[data-act="close"]').onclick = () => dlg.close();
  dlg.showModal();
}
```

Dans `setOfflineNotice`, la dernière ligne devient — `.hud__tag` est maintenant un `<button>`, qui ne peut pas contenir un `<div>` :

```js
  document.querySelector('.hud').appendChild(notice);
```

Et brancher le clic, dans le listener `DOMContentLoaded` :

```js
  document.getElementById('hud-tag').addEventListener('click', openHistory);
```

- [ ] **Step 5: Style the button and the list in `public/style.css`**

Le bouton doit ressembler exactement à la pancarte d'avant — il faut donc neutraliser les styles par défaut du navigateur. Remplacer la règle `.hud__tag` par :

```css
  .hud__tag{position:relative; display:block; width:100%; background:var(--kraft); color:var(--kraft-ink);
    border:3px solid var(--kraft-lo); padding:10px 18px 12px; box-shadow:0 5px 0 rgba(0,0,0,.28);
    font-family:inherit; text-align:center; cursor:pointer;}
  .hud__tag:hover{background:#f4e7c6;}
  .hud__label, .hud__total{display:block;}
```

Ajouter les styles de la liste après les autres règles `.modal` :

```css
  .modal .log{max-height:50vh; overflow-y:auto; border:3px solid #7a5f6e; background:rgba(20,14,26,.35); padding:8px;}
  .modal .log__line{font-size:10px; line-height:1.9; color:#efe6cf; white-space:nowrap;}
  .modal .log__empty{font-size:10px; color:#cdb9a6; padding:12px 0;}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, toute la suite

- [ ] **Step 7: Check it by eye**

Run: `npm start`, ouvrir `http://localhost:3000`
Expected: la pancarte réagit au survol, un clic ouvre le journal complet, chaque ligne se lit `16/08 21:34 · +77g · MWHS · → 237g`. En réduisant la fenêtre sous 900px, la guirlande disparaît mais la pancarte reste cliquable. Le total et la mise en page de la pancarte sont inchangés.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/app.js public/style.css test/frontend.test.js
git commit -m "feat: open the full journal from the total sign"
```

---

## Vérification finale

- [ ] `npm test` — toute la suite passe
- [ ] `npm start` puis, sur une base contenant déjà des bocaux : ajouter un bocal, ajuster son poids, le supprimer, et vérifier que les trois mouvements apparaissent dans la guirlande et dans la modale avec les bons totaux
- [ ] Éteindre le serveur et recharger : les étagères disparaissent, la guirlande aussi, la mention hors ligne s'affiche sous la pancarte sans casser la mise en page
- [ ] Sous 900px : pièce à 820px, aucune guirlande, pancarte cliquable
