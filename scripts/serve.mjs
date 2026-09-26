#!/usr/bin/env node
/**
 * Tiny static server with no dependencies.
 *
 *   node scripts/serve.mjs            serve dist/web on http://localhost:5173
 *   node scripts/serve.mjs --dev      rebuild on every change in src/ and live-reload the page
 *   PORT=8080 node scripts/serve.mjs  choose another port
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const DIR = join(ROOT, 'dist/web');
const PORT = Number(process.env.PORT || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const clients = new Set();

async function rebuild() {
  const { build } = await import(`./build.mjs?t=${Date.now()}`);
  try {
    build();
    for (const res of clients) res.write('data: reload\n\n');
  } catch (e) {
    console.error('[dev] build failed:', e.message);
  }
}

if (DEV) {
  process.argv.push('--dev');
  await rebuild();
  let timer = null;
  watch(join(ROOT, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  });
} else if (!existsSync(join(DIR, 'index.html'))) {
  console.error('No build found. Run "npm run build" first.');
  process.exit(1);
}

createServer((req, res) => {
  if (DEV && req.url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(DIR, url));
  if (!file.startsWith(DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(file));
}).listen(PORT, () => {
  console.log(`Car Dealership Manager Tycoon → http://localhost:${PORT}${DEV ? '  (dev: live reload)' : ''}`);
});
