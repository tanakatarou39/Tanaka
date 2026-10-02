#!/usr/bin/env node
// Frame-cost benchmark (headless software raster => pessimistic upper bound for real GPUs).
//   node tools/perf.mjs [--size 1280x720] [--times 5,20,35,...] [--reps 8]
//   --nofx  skip bloom/vignette/grain to isolate the scene's own cost
// Reports avg / p90 ms per full frame (scene(s) + post-fx + pixel readback).
import { open, parseArgs, parseTimes } from './_pw.mjs';
const a = parseArgs(process.argv);
const times = parseTimes(a.times || '5,16,30,46,60,74,88,100,112,124,135,145,154,162,168,175');
const { browser, page, logs } = await open({ size: a.size || '1280x720' });
const res = await page.evaluate(({ times, reps, nofx }) => { window.__anim.engine.noFx = nofx; return window.__anim.engine.bench(times, reps); }, { times, reps: Number(a.reps || 8), nofx: !!a.nofx });
let worst = 0;
for (const r of res) { worst = Math.max(worst, r.p90); console.log(`T=${String(r.T).padStart(6)}  avg ${r.avg.toFixed(1).padStart(6)} ms   p90 ${r.p90.toFixed(1).padStart(6)} ms`); }
console.log('worst p90:', worst.toFixed(1), 'ms');
await browser.close();
if (logs.length) { console.error(logs.join('\n')); process.exit(2); }
