#!/usr/bin/env node
// Render the whole film frame-by-frame (deterministic) in headless Chromium and encode an MP4 with ffmpeg.
//   node tools/video.mjs --out dist/hitoshizuku.mp4 [--size 1280x720] [--fps 30] [--workers 3] [--audio file.wav]
//                        [--from 0 --to 180] [--crf 21] [--frames /tmp/frames]  [--keep]
// Captions are burned in (DOM overlay is screenshotted). Frames are written as JPEG then encoded.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { open, parseArgs, ROOT } from './_pw.mjs';

const a = parseArgs(process.argv);
const size = a.size || '1280x720', fps = Number(a.fps || 30), workers = Number(a.workers || 3);
const from = Number(a.from ?? 0), to = Number(a.to ?? 180), crf = String(a.crf || 21);
const out = path.resolve(a.out || path.join(ROOT, 'dist', 'hitoshizuku.mp4'));
const frames = path.resolve(a.frames || path.join('/tmp', 'hitoshizuku_frames'));
fs.mkdirSync(frames, { recursive: true }); fs.mkdirSync(path.dirname(out), { recursive: true });
const N = Math.round((to - from) * fps);
console.log(`rendering ${N} frames @${fps}fps ${size} with ${workers} workers -> ${frames}`);

async function worker(w) {
  const { browser, page } = await open({ size });
  await page.addStyleTag({ content: '#bar,#start{display:none!important} body{cursor:none}' });
  await page.evaluate(() => document.body.classList.add('started'));
  let done = 0;
  for (let i = w; i < N; i += workers) {
    const file = path.join(frames, String(i).padStart(5, '0') + '.jpg');
    if (fs.existsSync(file) && !a.force) continue;
    const T = from + i / fps;
    await page.evaluate((t) => window.__anim.renderAt(t, true), T);
    await page.screenshot({ path: file, type: 'jpeg', quality: 93 });
    if (++done % 300 === 0 && w === 0) console.log(`  worker0: ${done} frames (T=${T.toFixed(1)})`);
  }
  await browser.close();
}
await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));

const args = ['-y', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg')];
if (a.audio) args.push('-ss', String(from), '-t', String(to - from), '-i', path.resolve(a.audio));
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
if (a.audio) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest');
args.push(out);
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
if (!a.keep) fs.rmSync(frames, { recursive: true, force: true });
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
