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
