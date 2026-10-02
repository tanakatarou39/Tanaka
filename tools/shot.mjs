#!/usr/bin/env node
// Render frames of the film to PNG (contact sheet or single files) using headless Chromium.
//
//   node tools/shot.mjs --times 0,5,10 --out /tmp/x.png                      contact sheet (default 3 cols)
//   node tools/shot.mjs --times 40:48:1 --cols 3 --cell 560 --out sheet.png   range start:end:step
//   node tools/shot.mjs --times 12.5 --single --out frame.png                 one full-size frame (with captions: --cap)
//   options: --size 1280x720 (viewport; try 720x1280 and 1920x800)   --cols N   --cell px (sheet cell width)
//            --dpr 1     --q 1 (render scale)    --label (default on; --nolabel)
//
// Prints console errors / scene exceptions and exits non-zero if the page logged any.
import fs from 'fs';
import path from 'path';
import { open, parseArgs, parseTimes } from './_pw.mjs';

const a = parseArgs(process.argv);
const times = parseTimes(a.times || '0,30,60,90,120,150,175');
const out = a.out || '/tmp/shot.png';
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const { browser, page, logs, w, h } = await open({ size: a.size || '1280x720', dpr: Number(a.dpr || 1), extra: a.q ? '&q=' + a.q : '' });

if (a.single) {
  for (const T of times) {
    await page.evaluate((t) => { window.__anim.renderAt(t, true); }, T);
    if (!a.cap) await page.addStyleTag({ content: '#captions,#bar,#start{display:none!important}' });
    const file = times.length === 1 ? out : out.replace(/(\.png)?$/, `_${T.toFixed(2)}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
  }
} else {
  const cols = Number(a.cols || 3), cell = Number(a.cell || 560);
  const dataUrl = await page.evaluate(async ({ times, cols, cell, label }) => {
    const E = window.__anim.engine;
    const ch = Math.round((cell * E.H) / E.W);
    const rows = Math.ceil(times.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * cell; sheet.height = rows * ch;
    const s = sheet.getContext('2d');
    s.fillStyle = '#000'; s.fillRect(0, 0, sheet.width, sheet.height);
    times.forEach((T, i) => {
      window.__anim.renderAt(T);
      const x = (i % cols) * cell, y = Math.floor(i / cols) * ch;
      s.imageSmoothingQuality = 'high';
      s.drawImage(E.canvas, x, y, cell, ch);
      if (label) {
        s.font = '600 15px monospace'; s.fillStyle = 'rgba(0,0,0,.55)'; s.fillRect(x + 4, y + 4, 86, 22);
        s.fillStyle = '#fff'; s.fillText('T=' + T.toFixed(1), x + 10, y + 20);
      }
      s.strokeStyle = 'rgba(255,255,255,.18)'; s.strokeRect(x + .5, y + .5, cell - 1, ch - 1);
    });
    return sheet.toDataURL('image/png');
  }, { times, cols, cell, label: !a.nolabel });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', out, `(${times.length} frames)`);
}
const errs = await page.evaluate(() => window.Anim.errors.slice(0, 5));
await browser.close();
const bad = [...logs, ...errs.map((e) => '[scene] ' + e)];
if (bad.length) { console.error('PAGE ERRORS:\n' + bad.join('\n')); process.exit(2); }
