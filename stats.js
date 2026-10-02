const DAY_MS = 86400000;
const WINDOW_DAYS = 30;
const TREND_DAYS = 7;
const MIN_DAYS = 7;
const DAILY_BARS = 14;

// Consumption is a downward adjust only. A removal can be a mistake or a gift,
// and counting it would let one deleted jar wreck the estimate; a finished jar
// is adjusted to 0 first, so its last grams are already counted.
const CONSUMED = "kind = 'adjust' AND delta_g < 0";

// SQLite stores created_at as "YYYY-MM-DD HH:MM:SS" in UTC, so cutoffs are
// written the same way and compared as strings.
function sqlStamp(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function consumedSince(db, since) {
  return db.prepare(`
    SELECT COALESCE(-SUM(delta_g), 0) AS g FROM jar_events
    WHERE ${CONSUMED} AND created_at >= ?
  `).get(sqlStamp(since)).g;
}

export function computeStats(db, { now = new Date() } = {}) {
  const total_g = db.prepare('SELECT COALESCE(SUM(weight_g), 0) AS t FROM jars').get().t;

  // The window is as old as the journal, up to 30 days: a two-week-old journal
  // divides by 14, not 30, or the first month would read as a slow one.
  const { oldest } = db.prepare('SELECT MIN(created_at) AS oldest FROM jar_events').get();
  const age = oldest ? (now - new Date(`${oldest.replace(' ', 'T')}Z`)) / DAY_MS : 0;
  const window_days = Math.min(WINDOW_DAYS, Math.max(0, age));

  const since = new Date(now - WINDOW_DAYS * DAY_MS);
  const consumed_g = consumedSince(db, since);
  const per_day_g = window_days > 0 ? consumed_g / window_days : 0;
  const ready = window_days >= MIN_DAYS;
  const days_left = ready && per_day_g > 0 ? total_g / per_day_g : null;

  const trendDays = Math.min(TREND_DAYS, window_days);
  const recent = trendDays > 0 ? consumedSince(db, new Date(now - TREND_DAYS * DAY_MS)) / trendDays : 0;
  const trend_pct = ready && per_day_g > 0 ? ((recent - per_day_g) / per_day_g) * 100 : null;

  // Buckets are UTC days, matching how created_at is stored. Late-evening
  // movements can land on the next day's bar; at this scale that is fine.
  const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (DAILY_BARS - 1) * DAY_MS);
  const perDay = new Map(db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, -SUM(delta_g) AS g FROM jar_events
    WHERE ${CONSUMED} AND created_at >= ?
    GROUP BY day
  `).all(sqlStamp(firstDay)).map((r) => [r.day, r.g]));
  const daily = Array.from({ length: DAILY_BARS }, (_, i) => {
    const day = new Date(firstDay.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return { day, g: perDay.get(day) || 0 };
  });

  const top = db.prepare(`
    SELECT jar_name AS name, -SUM(delta_g) AS g FROM jar_events
    WHERE ${CONSUMED} AND created_at >= ?
    GROUP BY jar_name ORDER BY g DESC LIMIT 3
  `).all(sqlStamp(since));

  return { total_g, ready, window_days, consumed_g, per_day_g, days_left, trend_pct, daily, top };
}
