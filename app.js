import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listJars, createJar, updateJar, deleteJar, listEvents, EVENT_CAP, ValidationError } from './jars.js';
import { computeStats } from './stats.js';

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

  app.get('/api/events', (req, res) => {
    const { limit } = req.query;
    if (limit === undefined) return res.json(listEvents(db));
    // Number('') is 0 and Number('1.5') is 1.5 — both are rejected here rather
    // than silently rounded or treated as "no limit".
    const n = Number(limit);
    if (!Number.isInteger(n) || n <= 0 || n > EVENT_CAP) {
      return res.status(400).json({ error: `limit must be an integer between 1 and ${EVENT_CAP}` });
    }
    res.json(listEvents(db, { limit: n }));
  });

  app.get('/api/stats', (req, res) => res.json(computeStats(db)));

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}
