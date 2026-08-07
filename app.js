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
