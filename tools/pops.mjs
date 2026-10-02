#!/usr/bin/env node
// Pop / flicker detector: renders the whole film at 8 fps (small size) and flags frames whose change from the previous frame
// is much bigger than the local norm (a sudden brightness/colour/layout jump).   node tools/pops.mjs [--size 640x360] [--step 0.125]
import { open, parseArgs } from './_pw.mjs';
const a = parseArgs(process.argv);
const step = Number(a.step || 0.125);
const { browser, page, logs } = await open({ size: a.size || '640x360' });
const res = await page.evaluate((step) => {
  const E = window.__anim.engine;
  const sm = document.createElement('canvas'); sm.width = 48; sm.height = 27;
  const sx = sm.getContext('2d', { willReadFrequently: true });
  const out = []; let prev = null;
  for (let T = 0; T <= 180; T += step) {
    window.__anim.renderAt(T);
    sx.drawImage(E.canvas, 0, 0, 48, 27);
    const d = sx.getImageData(0, 0, 48, 27).data;
    let lum = 0; for (let i = 0; i < d.length; i += 4) lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    lum /= d.length / 4;
    let diff = 0; if (prev) { for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); diff /= (d.length / 4) * 3; }
    out.push([T, lum, diff]); prev = d;
  }
  return out;
}, step);
await browser.close();
const diffs = res.map((r) => r[2]);
const med = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const flagged = [];
for (let i = 3; i < res.length - 3; i++) {
  const loc = med(diffs.slice(i - 8 >= 0 ? i - 8 : 0, i + 9));
  const ratio = diffs[i] / Math.max(0.25, loc);
  if (diffs[i] > 1.2 && ratio > 3.2) flagged.push({ T: res[i][0], diff: diffs[i], loc, ratio, lum: res[i][1], dl: res[i][1] - res[i - 1][1] });
}
console.log(`frames: ${res.length}, median diff ${med(diffs).toFixed(2)}, p99 ${[...diffs].sort((x, y) => x - y)[Math.floor(diffs.length * 0.99)].toFixed(2)}`);
console.log('flagged pops (T, frame diff, local median, ratio, dLum):');
for (const f of flagged) console.log(`  T=${f.T.toFixed(3).padStart(8)}  diff ${f.diff.toFixed(2).padStart(6)}  local ${f.loc.toFixed(2).padStart(5)}  x${f.ratio.toFixed(1).padStart(5)}  dLum ${f.dl.toFixed(1)}`);
if (!flagged.length) console.log('  none');
// biggest raw jumps too
console.log('top 12 raw frame diffs:', res.map((r, i) => [r[0], r[2]]).sort((x, y) => y[1] - x[1]).slice(0, 12).map((x) => x[0].toFixed(2) + ':' + x[1].toFixed(1)).join('  '));
if (logs.length) console.error(logs.join('\n'));
