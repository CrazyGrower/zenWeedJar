import fs from 'fs';
import path from 'path';
import { createApp } from './app.js';

const DB_PATH = process.env.DB_PATH || './data/stash.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// db wiring is added in Task 2/4; for now db is null
const app = createApp(null);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PixelStash on http://localhost:${PORT}`));
