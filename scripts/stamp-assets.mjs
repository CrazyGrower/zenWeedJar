// Stamps public/index.html with a content hash on every local stylesheet and
// script (?v=…). The proxy in front of the NAS caches static files for half a
// day and phones honour that too; a new URL per deploy is what gets a change
// to them at once. Run `npm run stamp` after touching anything the page loads;
// the frontend tests fail until the stamp matches.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REF = /(<(?:script src|link rel="stylesheet" href)=")(\/[^"?]+)(?:\?v=([^"]*))?(")/g;

export function localAssets(html) {
  return [...html.matchAll(REF)].map((m) => ({ path: m[2], version: m[3] || null }));
}

// One version for the whole page: a hash of every file it loads, in order.
export function assetVersion(publicDir, html) {
  const h = crypto.createHash('sha1');
  for (const { path: p } of localAssets(html)) {
    h.update(p);
    h.update(fs.readFileSync(path.join(publicDir, p)));
  }
  return h.digest('hex').slice(0, 10);
}

export function stamp(html, version) {
  return html.replace(REF, (_, open, p, _v, close) => `${open}${p}?v=${version}${close}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  const file = path.join(publicDir, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const version = assetVersion(publicDir, html);
  fs.writeFileSync(file, stamp(html, version));
  console.log(`index.html stamped ?v=${version}`);
}
