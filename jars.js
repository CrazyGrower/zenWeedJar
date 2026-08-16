export class ValidationError extends Error {}

const STRING_FIELDS = ['harvest_date', 'notes', 'color_tag'];
const NUMBER_FIELDS = ['thc_percent', 'indica_pct'];

// Clients send JSON, so a field can arrive as any JSON type. Only numbers and
// numeric strings (what the HTML form submits) are meaningful here — without
// this guard Number(true) is 1 and Number([]) is 0, so booleans and arrays
// would silently become valid weights.
function toNumber(value, message) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new ValidationError(message);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(message);
  return n;
}

function validate(data, { partial = false } = {}) {
  const out = {};

  if (!partial || 'name' in data) {
    if (typeof data.name !== 'string' || !data.name.trim()) {
      throw new ValidationError('name is required');
    }
    out.name = data.name.trim();
  }

  if (!partial || 'weight_g' in data) {
    const message = 'weight_g must be a number >= 0';
    if (data.weight_g == null || data.weight_g === '') throw new ValidationError(message);
    const w = toNumber(data.weight_g, message);
    if (w < 0) throw new ValidationError(message);
    out.weight_g = w;
  }

  for (const f of STRING_FIELDS) {
    if (f in data) {
      if (data[f] == null) { out[f] = null; continue; }
      // String({}) yields "[object Object]" — store only real text.
      if (typeof data[f] !== 'string') throw new ValidationError(`${f} must be a string`);
      out[f] = data[f];
    }
  }
  for (const f of NUMBER_FIELDS) {
    if (f in data) {
      if (data[f] == null || data[f] === '') { out[f] = null; continue; }
      out[f] = toNumber(data[f], `${f} must be a number`);
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

export const EVENT_CAP = 500;

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
  const asked = Math.floor(Number(limit));
  const n = Number.isFinite(asked) && asked > 0 ? Math.min(asked, EVENT_CAP) : EVENT_CAP;
  return db.prepare('SELECT * FROM jar_events ORDER BY created_at DESC, id DESC LIMIT ?').all(n);
}

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
