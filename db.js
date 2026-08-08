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
