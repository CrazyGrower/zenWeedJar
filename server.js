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
