#!/usr/bin/env node
/**
 * Production build — no bundler dependency, only TypeScript.
 *
 *   1. tsc compiles src/ to CommonJS in build/js
 *   2. a 20-line module runtime stitches the modules into one script
 *   3. the CSS and script are inlined into a single index.html
 *
 * Outputs
 *   dist/web/       — deployable website (index.html, PWA manifest, service worker, icons)
 *   dist/android/   — the same game as one self-contained file for the APK
 *   android/app/src/main/assets/www/index.html — copied for the Android projects
 *
 * Usage: node scripts/build.mjs [--dev]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const require = createRequire(import.meta.url);

function log(msg) {
  process.stdout.write(`[build] ${msg}\n`);
}

function tsc() {
  let tscBin;
  try {
    tscBin = require.resolve('typescript/bin/tsc', { paths: [ROOT] });
  } catch {
    console.error('TypeScript is not installed. Run "npm install" first.');
    process.exit(1);
  }
  rmSync(join(ROOT, 'build/js'), { recursive: true, force: true });
  execFileSync(process.execPath, [tscBin, '-p', join(ROOT, 'tsconfig.json')], { stdio: 'inherit' });
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function bundle() {
  const base = join(ROOT, 'build/js');
  const files = walk(base).sort();
  const modules = files.map((file) => {
    const id = relative(base, file).split('\\').join('/');
    const code = readFileSync(file, 'utf8').replace(/^"use strict";\s*/, '');
    return `${JSON.stringify(id)}:function(require,module,exports){"use strict";\n${code}\n}`;
  });
  const runtime = `(function(){var M={${modules.join(',\n')}};var C={};
function res(from,p){var parts=from.split('/');parts.pop();p.split('/').forEach(function(s){if(s==='..')parts.pop();else if(s!=='.')parts.push(s);});var r=parts.join('/');return M[r+'.js']?r+'.js':(M[r+'/index.js']?r+'/index.js':r);}
function R(n){if(C[n])return C[n].exports;var f=M[n];if(!f)throw new Error('Module not found: '+n);var m={exports:{}};C[n]=m;f(function(p){return R(res(n,p));},m,m.exports);return m.exports;}
try{R('main.js');}catch(e){console.error(e);var a=document.getElementById('app');if(a)a.innerHTML='<div class="boot">Something went wrong starting the game. Please reload.<br><small>'+String(e&&e.message||e).replace(/</g,'&lt;')+'</small></div>';}})();`;
  return runtime;
}

function css() {
  const parts = ['src/styles/base.css', 'src/styles/game.css', 'src/styles/mobile.css'].map((p) => readFileSync(join(ROOT, p), 'utf8'));
  let out = parts.join('\n');
  out += '\n.boot{min-height:100vh;display:grid;place-items:center;text-align:center;color:#a3abb6;font:14px system-ui;padding:24px}';
  if (!DEV) {
    out = out.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n/g, '\n').replace(/^\s+/gm, '');
  }
  return out;
}

function page({ js, styles, pwa }) {
  const tpl = readFileSync(join(ROOT, 'src/index.html'), 'utf8');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const pwaHead = pwa
    ? '<link rel="manifest" href="./manifest.webmanifest" />\n  <link rel="icon" href="./icons/icon-192.png" type="image/png" />\n  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />'
    : '';
  const sw = pwa
    ? `<script>if('serviceWorker' in navigator && location.protocol.startsWith('http')){window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(function(){});});}</script>`
    : '';
  const dev = DEV ? `<script>(function(){try{var es=new EventSource('/__reload');es.onmessage=function(){location.reload();};}catch(e){}})();</script>` : '';
  return tpl
    .replace('<!--PWA-->', () => pwaHead)
    .replace('/*CSS*/', () => styles)
    .replace('/*JS*/', () => safeJs)
    .replace('<!--SW-->', () => sw + dev);
}

export function build() {
  const t0 = Date.now();
  tsc();
  const js = bundle();
  const styles = css();
  const web = join(ROOT, 'dist/web');
  const android = join(ROOT, 'dist/android');
  rmSync(web, { recursive: true, force: true });
  rmSync(android, { recursive: true, force: true });
  mkdirSync(web, { recursive: true });
  mkdirSync(android, { recursive: true });
  writeFileSync(join(web, 'index.html'), page({ js, styles, pwa: true }));
  cpSync(join(ROOT, 'public'), web, { recursive: true });
  if (existsSync(join(ROOT, 'assets/icons'))) cpSync(join(ROOT, 'assets/icons'), join(web, 'icons'), { recursive: true });
  const single = page({ js, styles, pwa: false });
  const kb = Math.round(Buffer.byteLength(single) / 1024);
  if (DEV) {
    // Dev builds carry a live-reload hook, so they never go into the Android assets.
    log(`dev build in ${Date.now() - t0} ms — index.html ${kb} KB (dist/web)`);
    return;
  }
  writeFileSync(join(android, 'index.html'), single);
  const assets = join(ROOT, 'android/app/src/main/assets/www');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'index.html'), single);
  log(`done in ${Date.now() - t0} ms — index.html ${kb} KB (dist/web, dist/android, android assets)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
