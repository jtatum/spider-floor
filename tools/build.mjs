// Tiny, zero-dependency "build" for publishing. NOT needed for local dev
// (which serves the plain src/ files via tools/dev-server.mjs). This only runs
// at deploy time: it concatenates the ordered src/ scripts into ONE
// content-hashed file and rewrites index.html to point at it, so the published
// site can be cached forever and busts automatically the moment code changes.
//
//   node tools/build.mjs   →   writes dist/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const SRC_FILES = ['data.js', 'sim.js', 'maze.js', 'render.js', 'audio.js', 'main.js'];
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// bundle the JS in load order (same order index.html and the test harness use)
const js = SRC_FILES.map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const jsName = `app.${hash(js)}.js`;
fs.writeFileSync(path.join(dist, jsName), js);

// hash the stylesheet too
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const cssName = `app.${hash(css)}.css`;
fs.writeFileSync(path.join(dist, cssName), css);

// copy audio/ verbatim (referenced by stable path in audio.js; large + rarely
// changes, so we keep the filenames rather than rewriting runtime URL lookups)
let audioCount = 0;
const audioSrc = path.join(root, 'audio');
if (fs.existsSync(audioSrc)) {
  fs.mkdirSync(path.join(dist, 'audio'), { recursive: true });
  for (const f of fs.readdirSync(audioSrc)) {
    fs.copyFileSync(path.join(audioSrc, f), path.join(dist, 'audio', f));
    audioCount++;
  }
}

// rewrite index.html: one hashed script, hashed css, and DROP the no-store meta
// (the hashed filenames are what bust the cache now — the browser may cache them
// immutably, and a code change yields a new filename).
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/\s*<meta http-equiv="Cache-Control"[^>]*>/g, '');
html = html.replace(/\s*<meta http-equiv="Pragma"[^>]*>/g, '');
html = html.replace(/<link rel="stylesheet" href="style\.css[^"]*">/, `<link rel="stylesheet" href="${cssName}">`);
html = html.replace(/\s*<script src="src\/[^"]*"><\/script>/g, '');
html = html.replace('</body>', `<script src="${jsName}"></script>\n</body>`);
fs.writeFileSync(path.join(dist, 'index.html'), html);

console.log(`built dist/ → ${jsName} (${(js.length / 1024).toFixed(1)} KB), ${cssName}, ${audioCount} audio file(s)`);
