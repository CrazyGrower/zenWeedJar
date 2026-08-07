import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listJars, createJar, updateJar, deleteJar, ValidationError } from './jars.js';

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
