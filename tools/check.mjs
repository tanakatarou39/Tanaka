#!/usr/bin/env node
// Determinism + error check: every frame must be a pure function of T.
//   node tools/check.mjs [--size 1280x720] [--from 0 --to 180 --step 4.5]
// Renders the sample times forward, then in reverse, then again forward-after-a-seek-storm, and compares
// pixel hashes. Also fails on any scene exception / console error. Exit code 0 = OK.
import { open, parseArgs } from './_pw.mjs';
const a = parseArgs(process.argv);
const from = Number(a.from ?? 0), to = Number(a.to ?? 180), step = Number(a.step ?? 4.5);
const times = []; for (let t = from; t <= to + 1e-9; t += step) times.push(Math.round(t * 100) / 100);
const { browser, page, logs } = await open({ size: a.size || '1280x720' });
const res = await page.evaluate((times) => {
  const E = window.__anim.engine;
  const hash = () => {
    const d = new Uint32Array(E.ctx.getImageData(0, 0, E.W, E.H).data.buffer);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < d.length; i += 7) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
    return h;
  };
  const pass = (list) => { const m = {}; for (const T of list) { window.__anim.renderAt(T); m[T] = hash(); } return m; };
  const A = pass(times);
  const B = pass([...times].reverse());
  for (let i = 0; i < 20; i++) window.__anim.renderAt((i * 37.7) % 180); // storm of unrelated seeks
  const C = pass(times);
  const bad = times.filter((T) => A[T] !== B[T] || A[T] !== C[T]);
  // flat/black frame detection (except the very first/last frames)
  return { bad, n: times.length, errors: window.Anim.errors.slice(0, 5) };
}, times);
await browser.close();
let fail = false;
if (res.bad.length) { fail = true; console.error('NON-DETERMINISTIC at T =', res.bad.join(', ')); }
if (res.errors.length) { fail = true; console.error('SCENE ERRORS:\n' + res.errors.join('\n')); }
if (logs.length) { fail = true; console.error('CONSOLE:\n' + logs.join('\n')); }
console.log(fail ? 'CHECK FAILED' : `OK: ${res.n} frames deterministic, no errors`);
process.exit(fail ? 1 : 0);
