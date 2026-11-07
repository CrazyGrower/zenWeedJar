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
      bud_color    TEXT,
      owner        TEXT NOT NULL DEFAULT 'self',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- No FK to jars: an entry must outlive the jar it describes, so the
    -- journal can still show "-77g MWHS" after MWHS is deleted. jar_name is a
    -- snapshot for the same reason.
    CREATE TABLE IF NOT EXISTS jar_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      jar_id        INTEGER,
      jar_name      TEXT NOT NULL,
      kind          TEXT NOT NULL,
      delta_g       REAL NOT NULL,
      total_after_g REAL NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Databases created before the weed colour existed get the column here;
  // their jars keep NULL and the front falls back to the cap tint.
  const cols = db.prepare('PRAGMA table_info(jars)').all().map((c) => c.name);
  if (!cols.includes('bud_color')) db.exec('ALTER TABLE jars ADD COLUMN bud_color TEXT');
  // Whose weed the jar holds: 'self' or 'other'. Older jars are all yours.
  if (!cols.includes('owner')) db.exec("ALTER TABLE jars ADD COLUMN owner TEXT NOT NULL DEFAULT 'self'");

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
