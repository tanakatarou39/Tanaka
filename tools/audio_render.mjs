// Offline render of the generative score (src/audio.js) in headless Chromium -> 44.1 kHz stereo 16-bit WAV,
// plus per-block (default 10 s) level / spectral / pitch statistics and an optional spectrogram PNG.
//   node tools/audio_render.mjs --out $SCRATCH/audio/film.wav [--from 0 --to 180] [--spec spec.png] [--chroma]
// Film time t maps to sample index (t - from) * 44100.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { chromium, parseArgs, ROOT } from './_pw.mjs';

const args = parseArgs(process.argv);
const from = args.from != null ? parseFloat(args.from) : 0;
const to = args.to != null ? parseFloat(args.to) : 180;
const out = args.out || path.join(ROOT, 'film.wav');
const SR = 44100;
const KINDS = args.kinds ? String(args.kinds).split(',') : undefined; // diagnostic: only these event kinds
const BLK = args.block ? parseFloat(args.block) : 10; // stats block length in seconds
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto('about:blank');
await page.addScriptTag({ path: path.join(ROOT, 'src/audio.js') });

const t0 = Date.now();
const info = await page.evaluate(async ({ from, to, SR, BLK, KINDS }) => {
  const len = Math.ceil((to - from) * SR);
  const ctx = new OfflineAudioContext(2, len, SR);
  const t1 = performance.now();
  // schedule in ~10 s chunks (suspend/resume at render-quantum aligned boundaries), exactly like the realtime lookahead
  // scheduler: keeps the offline graph small instead of creating all ~8000 nodes up front.
  const CHUNK = Math.round((10 * SR) / 128) * 128 / SR;
  const rig = Anim.audio.build(ctx, ctx.destination, from, Math.min(to, from + CHUNK), { kinds: KINDS });
  for (let b = from + CHUNK; b < to - 1e-6; b += CHUNK) {
    const bt = b;
    ctx.suspend(bt - from).then(() => {
      Anim.audio.build(ctx, null, bt, Math.min(to, bt + CHUNK), { rig, at: bt - from, carry: false, kinds: KINDS });
      ctx.resume();
    });
  }
  const tb = performance.now() - t1;
  const buf = await ctx.startRendering();
  window.__buf = buf;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let nan = 0, peak = 0, sumL = 0, sumR = 0;
  for (let i = 0; i < len; i++) {
    const a = L[i], b = R[i];
    if (!isFinite(a) || !isFinite(b)) nan++;
    else { peak = Math.max(peak, Math.abs(a), Math.abs(b)); sumL += a; sumR += b; }
  }
  // per 10 s blocks
  const blocks = [];
  const B = BLK * SR;
  for (let s = 0; s < len; s += B) {
    const e = Math.min(len, s + B);
    let pk = 0, ss = 0, sm = 0, sd = 0, ll = 0, rr = 0, lr = 0, mean = 0;
    for (let i = s; i < e; i++) {
      const a = L[i], b = R[i];
      pk = Math.max(pk, Math.abs(a), Math.abs(b));
      ss += (a * a + b * b) * 0.5; ll += a * a; rr += b * b; lr += a * b;
      const m = (a + b) * 0.5, d = (a - b) * 0.5; sm += m * m; sd += d * d; mean += (a + b) * 0.5;
    }
    const n = e - s;
    blocks.push({ t: from + s / SR, peak: pk, rms: Math.sqrt(ss / n), dc: mean / n, side_mid_db: 10 * Math.log10((sd + 1e-20) / (sm + 1e-20)), corr: lr / Math.sqrt(ll * rr + 1e-30) });
  }
  // per-second rms for silence detection
  const sec = [];
  for (let s = 0; s + SR <= len; s += SR) { let ss = 0; for (let i = s; i < s + SR; i++) ss += L[i] * L[i] + R[i] * R[i]; sec.push(Math.sqrt(ss / (2 * SR))); }
  let tot = 0; for (let i = 0; i < len; i++) tot += L[i] * L[i] + R[i] * R[i];
  return { len, nan, peak, dcL: sumL / len, dcR: sumR / len, blocks, sec, rmsAll: Math.sqrt(tot / (2 * len)), tb, stats: Anim.audio.stats() };
}, { from, to, SR, BLK, KINDS });
const renderMs = Date.now() - t0;

// pull PCM in chunks (int16, interleaved)
const len = info.len;
const pcm = new Int16Array(len * 2);
const CH = 10 * SR;
for (let s = 0; s < len; s += CH) {
  const b64 = await page.evaluate(({ s, e }) => {
    const L = window.__buf.getChannelData(0), R = window.__buf.getChannelData(1);
    const o = new Int16Array((e - s) * 2);
    for (let i = s; i < e; i++) {
      let a = L[i], b = R[i];
      a = a > 1 ? 1 : a < -1 ? -1 : a; b = b > 1 ? 1 : b < -1 ? -1 : b;
      o[(i - s) * 2] = Math.round(a * 32767); o[(i - s) * 2 + 1] = Math.round(b * 32767);
    }
    let bin = ''; const u8 = new Uint8Array(o.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { s, e: Math.min(len, s + CH) });
  const bytes = Buffer.from(b64, 'base64');
  pcm.set(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2), s * 2);
}
await browser.close();

// WAV
{
  const data = Buffer.from(pcm.buffer);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(out, Buffer.concat([h, data]));
}

/* ---------------- analysis (node side) ---------------- */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let l = 2; l <= n; l <<= 1) {
    const ang = (-2 * Math.PI) / l, wr = Math.cos(ang), wi = Math.sin(ang), h = l >> 1;
    for (let i = 0; i < n; i += l) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
const NF = 4096, hann = new Float64Array(NF);
for (let i = 0; i < NF; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (NF - 1));
const mono = new Float32Array(len);
for (let i = 0; i < len; i++) mono[i] = (pcm[i * 2] + pcm[i * 2 + 1]) / 65536;
const HOP = Math.round(SR * 0.125), frames = Math.floor((len - NF) / HOP);
const binHz = SR / NF, NB = NF / 2;
const mags = []; // power per frame (Float32Array NB)
{
  const re = new Float64Array(NF), im = new Float64Array(NF);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < NF; i++) { re[i] = mono[f * HOP + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    const p = new Float32Array(NB);
    for (let k = 0; k < NB; k++) p[k] = ((re[k] * re[k] + im[k] * im[k]) * 4) / (NF * NF * 0.375);
    mags.push(p);
  }
}
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(6);
console.log(`rendered ${from}-${to} s in ${(renderMs / 1000).toFixed(1)} s (build ${(info.tb / 1000).toFixed(2)} s) -> ${out}`);
console.log(`events=${info.stats.events} nodesCreated=${info.stats.created} aliveAfterRender=${info.stats.alive} voices=${info.stats.voices} liveVoices=${info.stats.liveVoices}`);
console.log(`peak=${info.peak.toFixed(3)} (${db(info.peak)} dBFS)  overall RMS=${db(info.rmsAll)} dBFS  NaN=${info.nan}  DC L/R=${info.dcL.toExponential(1)}/${info.dcR.toExponential(1)}`);
console.log(' t0    peak    rms(dB)  sub<120 120-1k  >1k   centroid  side/mid corr  top pitch classes >130Hz (share)  off-key%');
info.blocks.forEach((b) => {
  const f0 = Math.floor(((b.t - from) * SR) / HOP), f1 = Math.min(frames, Math.floor(((b.t - from + BLK) * SR) / HOP));
  const avg = new Float64Array(NB);
  for (let f = f0; f < f1; f++) for (let k = 0; k < NB; k++) avg[k] += mags[f][k];
  let num = 0, den = 0, bs = 0, bm = 0, bh = 0; const pc = new Float64Array(12);
  for (let k = 2; k < NB; k++) {
    const hz = k * binHz, p = avg[k] / Math.max(1, f1 - f0);
    if (hz > 40 && hz < 12000) { num += hz * p; den += p; }
    if (hz < 120) bs += p; else if (hz < 1000) bm += p; else bh += p;
    if (hz > 130 && hz < 2200) { const m = Math.round(12 * Math.log2(hz / 440) + 69); pc[((m % 12) + 12) % 12] += p; }
  }
  const tot = pc.reduce((a, x) => a + x, 0) || 1;
  const top = Array.from(pc).map((x, i) => [x / tot, i]).sort((a, b) => b[0] - a[0]).slice(0, 4).map((x) => `${NOTE[x[1]]}${Math.round(x[0] * 100)}`).join(' ');
  const off = [0, 3, 5, 8, 10].reduce((a, i) => a + pc[i], 0) / tot;
  const bd = (x) => (10 * Math.log10(x + 1e-12)).toFixed(0).padStart(5);
  console.log(`${String(b.t).padStart(4)}  ${b.peak.toFixed(3)}  ${db(b.rms)}  ${bd(bs)} ${bd(bm)} ${bd(bh)}  ${den > 0 ? Math.round(num / den).toString().padStart(6) : '     -'}   ${b.side_mid_db.toFixed(1).padStart(6)}  ${b.corr.toFixed(2)}  ${top.padEnd(22)} ${(off * 100).toFixed(0).padStart(3)}`);
});
// silences
{
  const runs = []; let a = -1;
  info.sec.forEach((r, i) => { const T = from + i; const quiet = r < Math.pow(10, -75 / 20); if (quiet && a < 0) a = T; if ((!quiet || i === info.sec.length - 1) && a >= 0) { runs.push([a, quiet ? T + 1 : T]); a = -1; } });
  console.log('quiet (<-75 dB) runs: ' + (runs.length ? runs.map((r) => `${r[0]}-${r[1]}s`).join(', ') : 'none'));
}
if (logs.length) console.log('page logs:\n' + logs.join('\n'));

/* ---------------- spectrogram PNG ---------------- */
if (args.spec) {
  const W = frames, SH = 380, TOP = 90, BOT = 22, H = TOP + SH + BOT;
  const img = Buffer.alloc(W * H * 3, 0);
  const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
  const stops = [[0, [4, 4, 14]], [0.2, [40, 18, 90]], [0.4, [120, 30, 120]], [0.6, [215, 70, 90]], [0.8, [250, 160, 70]], [1, [255, 245, 190]]];
  const cmap = (v) => { v = Math.max(0, Math.min(1, v)); for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]); return a[1].map((c, k) => c + (b[1][k] - c) * t); } return stops[stops.length - 1][1]; };
  const fmin = 30, fmax = 16000;
  const yOf = (hz) => TOP + SH - 1 - Math.round((Math.log(hz / fmin) / Math.log(fmax / fmin)) * (SH - 1));
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < SH; y++) {
      const hz0 = fmin * Math.pow(fmax / fmin, (SH - 1 - y) / SH), hz1 = fmin * Math.pow(fmax / fmin, (SH - y) / SH);
      let k0 = Math.floor(hz0 / binHz), k1 = Math.max(k0 + 1, Math.ceil(hz1 / binHz)); k1 = Math.min(k1, NB - 1);
      let m = 0; for (let k = k0; k <= k1; k++) m = Math.max(m, mags[f][k]);
      const d = 10 * Math.log10(m + 1e-12);
      const c = cmap((d + 100) / 70);
      put(f, TOP + y, c[0], c[1], c[2]);
    }
  }
  // loudness curve (rms per 125 ms, dBFS -70..-6)
  for (let f = 0; f < frames; f++) {
    let ss = 0; for (let i = 0; i < HOP; i++) { const v = mono[f * HOP + i]; ss += v * v; }
    const d = 10 * Math.log10(ss / HOP + 1e-12), h = Math.round(Math.max(0, Math.min(1, (d + 52) / 42)) * (TOP - 12));
    for (let y = 0; y < h; y++) put(f, TOP - 4 - y, 90, 190, 230);
    put(f, TOP - 4 - h, 255, 255, 255);
  }
  // guides: octave lines, time ticks
  for (const hz of [55, 110, 220, 440, 880, 1760, 3520, 7040, 14080]) for (let x = 0; x < W; x += 2) { const y = yOf(hz); put(x, y, 70, 70, 90); }
  const keyT = [14, 44, 60.5, 72, 98, 104, 126, 152, 158, 166, 171, 175];
  const digits = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111' };
  const drawNum = (x, y, s, col) => { for (const ch of String(s)) { const g = digits[ch]; if (g) { for (let i = 0; i < 15; i++) if (g[i] === '1') put(x + (i % 3), y + Math.floor(i / 3), ...col); x += 4; } else if (ch === '.') { put(x, y + 4, ...col); x += 2; } } };
  for (let t = from; t <= to + 1e-6; t += 10) { const x = Math.round(((t - from) * SR) / HOP); for (let y = TOP; y < TOP + SH; y += 3) put(x, y, 120, 120, 150); drawNum(x + 2, TOP + SH + 6, Math.round(t), [220, 220, 230]); }
  keyT.forEach((t) => { if (t < from || t > to) return; const x = Math.round(((t - from) * SR) / HOP); for (let y = 0; y < TOP - 2; y++) put(x, y, 120, 255, 160); drawNum(x + 2, 2, t, [120, 255, 160]); });
  for (const [hz, lab] of [[100, '100'], [1000, '1000'], [10000, '10000']]) drawNum(2, yOf(hz) - 6, lab, [200, 200, 200]);
  // PNG
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len4 = Buffer.alloc(4); len4.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c4 = Buffer.alloc(4); c4.writeUInt32BE(crc(td)); return Buffer.concat([len4, td, c4]); };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(args.spec, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
  console.log(`spectrogram ${W}x${H} -> ${args.spec}`);
}
