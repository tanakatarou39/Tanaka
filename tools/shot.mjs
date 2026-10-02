#!/usr/bin/env node
// Render frames of the film to PNG (contact sheet or single files) using headless Chromium.
//
//   node tools/shot.mjs --times 0,5,10 --out /tmp/x.png                      contact sheet (default 3 cols)
//   node tools/shot.mjs --times 40:48:1 --cols 3 --cell 560 --out sheet.png   range start:end:step
//   node tools/shot.mjs --times 12.5 --single --out frame.png                 one full-size frame (with captions: --cap)
//   --solo s3_surface            render that scene alone (no cross-fade) in every cell
//   --triple s1_awakening,s2_deepsea   rows of [A alone | B alone | actual mix] + mean |A-B| difference (0..255) per time
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
    await page.addStyleTag({ content: '#bar,#start{display:none!important}' + (a.cap ? '' : '#captions{display:none!important}') });
    const file = times.length === 1 ? out : out.replace(/(\.png)?$/, `_${T.toFixed(2)}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
  }
} else if (a.triple) {
  const [A, B] = String(a.triple).split(',');
  const cell = Number(a.cell || 480);
  const dataUrl = await page.evaluate(async ({ times, cell, A, B }) => {
    const E = window.__anim.engine;
    const ch = Math.round((cell * E.H) / E.W);
    const sheet = document.createElement('canvas');
    sheet.width = 3 * cell; sheet.height = times.length * ch;
    const s = sheet.getContext('2d');
    s.imageSmoothingQuality = 'high';
    const sm = document.createElement('canvas'); sm.width = 64; sm.height = 36;
    const sx = sm.getContext('2d', { willReadFrequently: true });
    const grab = () => { sx.drawImage(E.canvas, 0, 0, 64, 36); return sx.getImageData(0, 0, 64, 36).data; };
    const res = [];
    times.forEach((T, i) => {
      const y = i * ch;
      window.__anim.renderSolo(A, T); s.drawImage(E.canvas, 0, y, cell, ch); const da = grab();
      window.__anim.renderSolo(B, T); s.drawImage(E.canvas, cell, y, cell, ch); const db = grab();
      window.__anim.renderAt(T); s.drawImage(E.canvas, 2 * cell, y, cell, ch);
      let d = 0; for (let k = 0; k < da.length; k += 4) d += Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]);
      d /= (da.length / 4) * 3;
      res.push(d);
      s.font = '600 15px monospace'; s.fillStyle = 'rgba(0,0,0,.6)'; s.fillRect(4, y + 4, 330, 22);
      s.fillStyle = '#fff'; s.fillText('T=' + T.toFixed(1) + '  A|B  diff=' + d.toFixed(1), 10, y + 20);
      s.fillStyle = 'rgba(0,0,0,.6)'; s.fillRect(cell + 4, y + 4, 40, 22); s.fillStyle = '#fff'; s.fillText('B', cell + 12, y + 20);
      s.fillStyle = 'rgba(0,0,0,.6)'; s.fillRect(2 * cell + 4, y + 4, 60, 22); s.fillStyle = '#fff'; s.fillText('mix', 2 * cell + 10, y + 20);
      s.strokeStyle = 'rgba(255,255,255,.2)'; for (let c = 0; c < 3; c++) s.strokeRect(c * cell + .5, y + .5, cell - 1, ch - 1);
    });
    return { url: sheet.toDataURL('image/png'), res };
  }, { times, cell, A, B });
  fs.writeFileSync(out, Buffer.from(dataUrl.url.split(',')[1], 'base64'));
  console.log('wrote', out, '| mean |A-B| per time:', times.map((t, i) => t + ':' + dataUrl.res[i].toFixed(1)).join('  '));
} else {
  const cols = Number(a.cols || 3), cell = Number(a.cell || 560);
  const dataUrl = await page.evaluate(async ({ times, cols, cell, label, solo }) => {
    const E = window.__anim.engine;
    const ch = Math.round((cell * E.H) / E.W);
    const rows = Math.ceil(times.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * cell; sheet.height = rows * ch;
    const s = sheet.getContext('2d');
    s.fillStyle = '#000'; s.fillRect(0, 0, sheet.width, sheet.height);
    times.forEach((T, i) => {
      if (solo) window.__anim.renderSolo(solo, T); else window.__anim.renderAt(T);
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
  }, { times, cols, cell, label: !a.nolabel, solo: a.solo || null });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', out, `(${times.length} frames)`);
}
const errs = await page.evaluate(() => window.Anim.errors.slice(0, 5));
await browser.close();
const bad = [...logs, ...errs.map((e) => '[scene] ' + e)];
if (bad.length) { console.error('PAGE ERRORS:\n' + bad.join('\n')); process.exit(2); }
