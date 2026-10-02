#!/usr/bin/env node
// Inline index.html + src/*.js into self-contained files:
//   dist/hitoshizuku.html   complete standalone page (open it anywhere, offline except for the optional web fonts)
//   dist/artifact.html      same page as a fragment (no doctype/html/head/body tags) for hosts that wrap the page themselves
import fs from 'fs';
import path from 'path';
import { ROOT } from './_pw.mjs';

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(ROOT, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${js}\n</script>`;
});
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'hitoshizuku.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');

const frag = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<\/html>\s*/i, '');
const out2 = path.join(ROOT, 'dist', 'artifact.html');
fs.writeFileSync(out2, frag);
console.log('wrote', out2, (frag.length / 1024).toFixed(0) + ' KB');
