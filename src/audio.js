/* ひとしずくの旅 — generative score  (Web Audio only, no samples, fully deterministic)
 *
 * Contract (shape fixed by the engine):
 *   Anim.audio.supported            boolean
 *   Anim.audio.start(T)             (user gesture) create/resume context and play from T seconds
 *   Anim.audio.stop()               pause (keeps context)
 *   Anim.audio.seek(T)              jump while playing
 *   Anim.audio.setMuted(bool)       smooth (0.3 s) mute/unmute, scheduler keeps running
 *   Anim.audio.build(ctx, dest, fromT, toT, opts)   schedule the score for film time [fromT, toT) into ANY BaseAudioContext
 *
 * build() convention
 *   Film time t (0..180 s) maps to context time   ctx = opts.at + (t - fromT)      (opts.at defaults to 0)
 *   so an OfflineAudioContext rendering the whole film just calls build(ctx, ctx.destination, 0, 180) and the
 *   rendered buffer index i corresponds to film time i / sampleRate. Events that start in [fromT, toT) are created
 *   (their tails may ring past toT). With opts.carry !== false, long-held layers (pads, drones, noise beds, whale
 *   calls) that began before fromT but are still sounding are started mid-way, so a seek lands inside a full texture.
 *   opts.rig = {master, sess} (as returned by build) lets a lookahead scheduler append consecutive chunks to the
 *   same session graph; without it build() makes its own master chain -> dest and returns the rig.
 *
 * Signal path
 *   voices -> dry bus ---------------------------\
 *          -> reverb send (5 s stereo IR) -> hp/lp ->  tone lowpass (film-time automated, closes 175-178 s)
 *          -> ping-pong delay send ----------------/                 -> film fade (0-2 s in, 177-180 s out)
 *   hi bus (final tone, heartbeat) bypasses the tone filter -----------^
 *   -> session gain -> master: hp 24 Hz -> compressor -> cubic soft clip (|y| <= 0.85) -> mute gain -> destination
 *
 * Music: one home key (D major / D Lydian, pentatonic motifs), beat = 1.2 s (the heart beats every 2.4 s = 2 beats).
 * Leitmotif of the drop ("M"): A4 D5 E5 F#5 E5  (pentatonic degrees 3 5 6 7 6) that returns transformed in every
 * place: augmented glass bells (deep sea), harp/music-box (rising), cello (dawn), stretto bells (cloud), felt piano
 * (rain), pure bell + heartbeat of the seed, music-box ostinato / cello (seasons), constellation (stars), reversed
 * retrograde ripples (return).  The film ends on the same A5 it starts with.
 */
(function (G) {
  'use strict';
  const Anim = (G.Anim = G.Anim || {});
  const DUR = 180;
  const AC = G.AudioContext || G.webkitAudioContext;

  /* ------------------------------------------------------------------ helpers */
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hstr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const P5 = [0, 2, 4, 7, 9];
  /** pentatonic degree p (0 = D4) -> midi */
  const pent = (p) => 62 + 12 * Math.floor(p / 5) + P5[((p % 5) + 5) % 5];
  /** piecewise-linear interpolation of [[x,y],...] */
  function keyed(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1e-9); }
    }
    return pts[pts.length - 1][1];
  }
  const keyedLog = (pts, x) => Math.exp(keyed(pts.map((p) => [p[0], Math.log(p[1])]), x));

  const stats = { created: 0, alive: 0, voices: 0, liveVoices: 0, sessions: 0 };

  /* ------------------------------------------------------------------ harmony */
  const CH = {
    Dsus: { root: 38, pad: [38, 45, 50, 57, 64], arp: [57, 62, 64, 66, 69, 74, 76] },
    D: { root: 38, pad: [38, 50, 57, 62, 66, 69], arp: [62, 66, 69, 74, 76, 78, 81] },
    DF: { root: 42, pad: [42, 50, 57, 62, 66, 69], arp: [62, 66, 69, 74, 76, 78, 81] },
    AC: { root: 45, pad: [49, 57, 61, 64, 69], arp: [57, 61, 64, 69, 71, 73, 76] },
    Asus: { root: 45, pad: [45, 52, 57, 62, 64], arp: [57, 59, 62, 64, 69, 71, 74] },
    Bm7: { root: 47, pad: [47, 54, 57, 62, 66], arp: [59, 62, 66, 69, 71, 74, 78] },
    Bq: { root: 47, pad: [47, 54, 57, 61, 64], arp: [59, 61, 64, 66, 69, 71, 73] },
    Gl: { root: 43, pad: [43, 50, 59, 62, 66], arp: [55, 59, 62, 66, 71, 73, 74] },
    Em9: { root: 40, pad: [40, 52, 55, 59, 62, 66], arp: [59, 62, 64, 66, 71, 74, 76] },
    Fs7: { root: 42, pad: [42, 54, 57, 61, 64], arp: [57, 61, 64, 66, 69, 73, 76] },
    Gm: { root: 43, pad: [43, 50, 58, 62, 69], arp: [55, 58, 62, 65, 67, 70, 74] },
  };
  /** harmonic spine (film time, chord) — used by arpeggios to follow the harmony */
  const SPINE = [
    [0, 'Dsus'], [14, 'Bm7'], [26, 'Gl'], [38, 'Em9'], [44, 'D'], [49.5, 'AC'], [54.5, 'Bm7'], [58.3, 'Asus'],
    [60.5, 'D'], [65, 'Gl'], [69.5, 'Bm7'], [72, 'Fs7'], [78, 'Gl'], [84, 'DF'], [90, 'Em9'], [94.5, 'Gm'],
    [104.2, 'Bm7'], [109, 'Gl'], [113.8, 'DF'], [118.4, 'Dsus'],
    [127.2, 'D'], [131.5, 'AC'], [133.8, 'Bm7'], [136, 'D'], [138.5, 'AC'], [141, 'Gl'], [142.8, 'D'],
    [144.5, 'Bm7'], [146.3, 'Em9'], [148, 'Bq'], [150, 'Asus'], [151.5, 'D'], [153.5, 'AC'], [155.2, 'Bm7'], [157, 'Gl'],
    [158, 'D'], [161, 'Bm7'], [163.2, 'Gl'], [165.2, 'Asus'], [166.2, 'D'], [169, 'Dsus'],
  ];
  function chordAt(t) { let c = SPINE[0][1]; for (let i = 0; i < SPINE.length; i++) { if (SPINE[i][0] <= t) c = SPINE[i][1]; else break; } return c; }

  /* ------------------------------------------------------------------ composition (pure data, deterministic) */
  let SCORE = null;
  function compose() {
    const EV = [];
    const rg = {};
    const R = (n) => rg[n] || (rg[n] = mulberry32(hstr(n)));
    const add = (k, t, o) => { o = o || {}; o.k = k; o.t = t; EV.push(o); return o; };
    const N = (t, m, inst, v, o) => add('note', t, Object.assign({ f: mtof(m), inst, v }, o || {}));
    const PN = (t, p, inst, v, o) => N(t, pent(p), inst, v, o);
    const PAD = (t0, t1, ch, type, v, o) => add('pad', t0, Object.assign({ d: t1 - t0, notes: CH[ch].pad, type, v, a: 2.5, r: 3, carry: true }, o || {}));
    const DRONE = (t0, t1, m, v, env, o) => add('drone', t0, Object.assign({ d: t1 - t0, f: mtof(m), v, env, carry: true }, o || {}));
    const BED = (t0, t1, o) => add('bed', t0, Object.assign({ d: t1 - t0, carry: true, q: 0.7, type: 'bandpass' }, o));
    const sparkle = (t0, t1, d0, d1, inst, pmin, pmax, v0, v1, rn, o) => {
      const r = R(rn);
      for (let t = t0; t < t1;) {
        const dens = lerp(d0, d1, (t - t0) / (t1 - t0));
        t += -Math.log(1 - r() * 0.999) / Math.max(0.02, dens);
        if (t >= t1) break;
        const p = o && o.set ? o.set[Math.floor(r() * o.set.length)] : pmin + Math.floor(r() * (pmax - pmin + 1));
        PN(t, p, inst, lerp(v0, v1, (t - t0) / (t1 - t0)) * (0.6 + 0.8 * r()), Object.assign({ pan: (r() * 2 - 1) * 0.8, rev: 0.7, dly: 0.35 }, o || {}));
      }
    };
    const arp = (t0, t1, step, pat, inst, v0, v1, o) => {
      o = o || {};
      const r = R(o.rng || 'arp' + inst + t0);
      let i = 0;
      for (let t = t0; t < t1 - 1e-6; t += step, i++) {
        if (r() < (o.skip || 0)) continue;
        const A = CH[chordAt(t)].arp, idx = pat[i % pat.length];
        let m = A[idx % 7] + 12 * Math.floor(idx / 7) + 12 * (o.oct || 0);
        while (m > 88) m -= 12;
        const acc = i % pat.length === 0 ? 1.25 : 1;
        N(t + (r() - 0.5) * 0.02, m, inst, lerp(v0, v1, (t - t0) / (t1 - t0)) * acc * (0.8 + 0.4 * r()),
          { pan: (r() * 2 - 1) * (o.w == null ? 0.5 : o.w), rev: o.rev == null ? 0.5 : o.rev, dly: o.dly == null ? 0.3 : o.dly, tau: o.tau });
      }
    };
    const MOT = [[0, 3], [1, 5], [2, 6], [3, 7], [4.4, 6]];
    /** the drop's leitmotif.  o: sh (pentatonic shift), s (seconds per beat), inst, v, form 'o'|'i'|'r', vs, rev, dly, pan */
    const motif = (t0, o) => {
      const ps = MOT.map((x) => x[1]);
      let seq = ps;
      if (o.form === 'i') seq = ps.map((p) => 6 - p);
      if (o.form === 'r') seq = ps.slice().reverse();
      MOT.forEach((x, i) => {
        PN(t0 + x[0] * o.s, seq[i] + (o.sh || 0), o.inst, o.v * (1 + (o.vs || 0) * i),
          { rev: o.rev == null ? 0.6 : o.rev, dly: o.dly == null ? 0.3 : o.dly, pan: o.pan || 0, d: o.s * (i === 4 ? 2.4 : 0.95), tau: o.tau });
      });
    };
    const heart = (t, v, dub) => add('heart', t, { v, dub: !!dub, hi: true });
    const thump = (t, v, o) => add('thump', t, Object.assign({ v }, o || {}));

    /* ============ 0-14  awakening: near silence -> heartbeat ============ */
    const HB = [0, 0.12, 0.3, 0.5, 0.72, 0.8, 0.55, 0.25, 0.08];
    for (let k = 1; k < HB.length; k++) { heart(k * 2.4 + 0.144, HB[k] * 0.62, false); heart(k * 2.4 + 0.576, HB[k] * 0.62 * 0.62, true); }
    PN(3.6, 8, 'pure', 0.05, { rev: 0.9, dly: 0.4, tau: 1.3 }); // A5: the point of light appears (the film ends on this same note)
    [[4.94, 8], [5.03, 10], [5.12, 12], [5.21, 15]].forEach((x, i) => PN(x[0], x[1], 'glass', 0.04 - i * 0.004, { rev: 0.9, dly: 0.45, pan: (i - 1.5) * 0.3 }));
    PN(9.74, 10, 'glass', 0.025, { rev: 0.9, dly: 0.5, pan: 0.3 });
    PN(12.14, 12, 'glass', 0.02, { rev: 0.9, dly: 0.5, pan: -0.3 });
    PAD(5, 24, 'Dsus', 'dark', 0.09, { cut: [[0, 200], [14, 330], [19, 300]], a: 6, r: 5 });
    PAD(6.5, 22, 'Dsus', 'glass', 0.05, { notes: [81, 86, 90, 93], a: 6, r: 6 });
    DRONE(3, 28, 38, 0.12, [[0, 0], [8, 0.25], [14, 0.6], [20, 1], [25, 0.5]]);
    BED(7, 20, { buf: 'brown', f: [[0, 120], [13, 260]], type: 'lowpass', v: 0.1, env: [[0, 0], [6, 1], [10, 1], [13, 0]] });

    /* ============ 14-44  deep sea ============ */
    PAD(14, 26.5, 'Bm7', 'dark', 0.11, { cut: [[0, 260], [6, 420], [12, 340]] });
    PAD(25, 38.5, 'Gl', 'dark', 0.11, { cut: [[0, 320], [6, 470], [13, 400]] });
    PAD(37, 46, 'Em9', 'warm', 0.1, { cut: [[0, 380], [9, 1200]] });
    PAD(18, 40, 'Bm7', 'glass', 0.03, { notes: [74, 81, 83, 90], a: 7, r: 7 });
    DRONE(24, 52, 38, 0.18, [[0, 0], [6, 0.6], [15, 1], [22, 1], [28, 0]]);
    BED(14, 49, { buf: 'brown', f: [[0, 220], [17, 460], [35, 700]], type: 'lowpass', lfo: { f: 0.06, depth: 90 }, v: 0.12, env: [[0, 0], [4, 0.7], [17, 1], [30, 0.9], [35, 0]] });
    BED(20, 44, { buf: 'pink', f: [[0, 300], [24, 700]], type: 'bandpass', q: 1.2, lfo: { f: 0.04, depth: 120 }, v: 0.025, env: [[0, 0], [6, 1], [18, 1], [24, 0]] });
    {
      const r = R('seabells');
      let t = 15.6;
      while (t < 44) { PN(t, [-2, 0, 1, 2, 3, 5, 6][Math.floor(r() * 7)], 'bell', 0.05 + 0.025 * r(), { rev: 1, dly: 0.55, pan: (r() * 2 - 1) * 0.6, tau: 1.2 }); t += 3.2 + r() * 3.6; }
    }
    // jellyfish: gently pulsing music-box triads
    for (let t = 24.2, i = 0; t < 34.5; t += 2.4, i++) [[0, 12], [0.2, 10], [0.4, 8]].forEach((x, j) => PN(t + x[0] + R('jelly')() * 0.03, x[1] - (i % 2) * 2, 'box', 0.03 - j * 0.004, { rev: 0.9, dly: 0.5, pan: Math.sin(i + j) * 0.6 }));
    // the motif, slowly awake, in low glass bells
    motif(24.0, { sh: -5, s: 2.2, inst: 'bell', v: 0.07, rev: 1, dly: 0.5, tau: 1.5 });
    // plankton / bubbles
    [16.5, 20.3, 26.0, 31.0, 35.5, 40.2, 42.6, 46.0, 50.5, 53.0].forEach((t0, ci) => {
      const r = R('bub' + ci); let t = t0;
      for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) { add('bub', t, { f: 380 + r() * 900, v: 0.012 + r() * 0.012, pan: (r() * 2 - 1) * 0.7 }); t += 0.05 + r() * 0.22; }
    });
    // whale-song: three calls
    add('whale', 28.4, { d: 7.2, notes: [[0, 110], [1.2, 110], [2.8, 146.8], [4.4, 185], [5.6, 164.8], [7.2, 147]], v: 0.07, form: [450, 850], pan: [-0.7, 0.1], carry: true });
    add('whale', 33.0, { d: 8.4, notes: [[0, 73.4], [1.6, 110], [3.8, 146.8], [5.4, 220], [6.9, 185], [8.4, 146.8]], v: 0.1, form: [380, 760], pan: [0.0, 0.7], carry: true });
    add('whale', 38.2, { d: 6.4, notes: [[0, 220], [2, 293.7], [3.6, 247], [6.4, 220]], v: 0.045, form: [600, 1100], pan: [0.6, -0.4], carry: true });
    // plankton greeting the drop: faint twinkles
    sparkle(18.5, 27.5, 0.5, 1.5, 'glass', 8, 14, 0.012, 0.022, 'plank', { rev: 0.9, dly: 0.5, tau: 0.5 });
    // fish school
    sparkle(38, 47.5, 0.8, 3.5, 'box', 8, 14, 0.015, 0.03, 'fish', { rev: 0.8 });
    // light begins to open: first harp
    arp(40, 44.2, 0.6, [0, 2, 4, 2, 5, 4, 2, 1], 'harp', 0.02, 0.05, { rng: 'h0', oct: 0 });

    /* ============ 44-60.5  turquoise brightening ============ */
    PAD(44, 50.5, 'D', 'warm', 0.11, { cut: [[0, 900], [6, 1600]], a: 3.5 });
    PAD(49, 55.5, 'AC', 'warm', 0.11, { cut: [[0, 1500], [6, 2400]] });
    PAD(54, 59, 'Bm7', 'warm', 0.11, { cut: [[0, 2400], [5, 3200]] });
    PAD(57.5, 61.2, 'Asus', 'string', 0.16, { env: [[0, 0], [2, 0.5], [3.7, 1.2]], r: 1 });
    DRONE(48, 76, 38, 0.16, [[0, 0], [5, 0.7], [12, 1], [20, 0.9], [28, 0]]);
    arp(44, 60.2, 0.6, [0, 2, 4, 2, 5, 4, 2, 1, 0, 3, 5, 3, 6, 5, 3, 1], 'harp', 0.045, 0.1, { rng: 'h1', skip: 0.06, w: 0.6 });
    arp(52, 60.2, 0.3, [7, 9, 11, 9, 8, 10, 12, 10], 'box', 0.015, 0.045, { rng: 'b1', skip: 0.25, w: 0.8, rev: 0.7 });
    motif(46.8, { sh: 0, s: 0.6, inst: 'harp', v: 0.1, rev: 0.5, dly: 0.35 });
    motif(52.2, { sh: 2, s: 0.6, inst: 'box', v: 0.07, rev: 0.7, dly: 0.45, pan: 0.2 });
    BED(44, 62, { buf: 'pink', f: [[0, 700], [10, 1500], [16, 2200]], type: 'bandpass', q: 0.8, lfo: { f: 0.08, depth: 300 }, v: 0.03, env: [[0, 0], [5, 1], [14, 1], [18, 0]] });
    // rise to the surface
    BED(52, 60.55, { buf: 'pink', f: [[0, 300], [8.5, 6500]], type: 'bandpass', q: 0.9, v: 0.12, env: [[0, 0], [4, 0.25], [7.5, 1], [8.3, 1.2], [8.55, 0]] });
    add('gliss', 52.5, { d: 8.0, f0: 147, f1: 880, v: 0.035, env: [[0, 0], [5, 0.5], [7.6, 1], [8, 0]], rev: 0.6, dly: 0.2 });
    thump(60.5, 0.34, { f0: 120, f1: 36, d: 1.3 });
    BED(60.5, 64.5, { buf: 'white', f: [[0, 7500], [1.2, 1800], [4, 900]], type: 'bandpass', q: 0.6, v: 0.15, env: [[0, 0], [0.025, 1], [0.35, 0.6], [1.3, 0.2], [4, 0]], carry: false });
    BED(60.5, 66, { buf: 'pink', f: [[0, 1400], [5.5, 300]], type: 'lowpass', v: 0.17, env: [[0, 0], [0.06, 1], [1.2, 0.55], [3, 0.2], [5.5, 0]], carry: false });
    [86, 81, 90, 88, 93, 78].forEach((m, i) => N(60.52 + i * 0.045, m, 'bell', 0.075 - i * 0.006, { rev: 0.95, dly: 0.5, pan: (i - 2.5) * 0.28, tau: 1.9 }));
    {
      const r = R('crown');
      for (let i = 0; i < 16; i++) PN(60.75 + i * 0.16 + r() * 0.1, 8 + Math.floor(r() * 9), 'box', 0.035 * (1 - i / 22), { rev: 0.8, dly: 0.5, pan: (r() * 2 - 1) * 0.9 });
    }
    PAD(60.2, 66.5, 'D', 'string', 0.16, { cut: [[0, 2800], [6, 2000]], a: 1.2, r: 3.5 });

    /* ============ 60.5-72  dawn ============ */
    PAD(65, 70.5, 'Gl', 'string', 0.14, { cut: [[0, 2200], [5, 1900]], a: 3 });
    PAD(69.4, 74.5, 'Bm7', 'warm', 0.1, { cut: [[0, 2000], [5, 2400]], r: 4 });
    DRONE(60.5, 76, 38, 0.18, [[0, 0], [1.5, 1], [8, 0.8], [15, 0]], { carry: true });
    arp(61.5, 72, 0.6, [0, 2, 4, 6, 4, 2, 5, 3], 'harp', 0.05, 0.035, { rng: 'h2', skip: 0.3, w: 0.7 });
    motif(62.2, { sh: -5, s: 1.4, inst: 'cello', v: 0.11, rev: 0.7, dly: 0.2, pan: -0.15 });
    motif(67.8, { sh: -3, s: 1.3, inst: 'cello', v: 0.1, rev: 0.7, dly: 0.2, pan: 0.15 });
    [[63.5, 3, 3300, 4700], [64.1, 2, 3900, 5200], [66.8, 4, 3000, 4300], [69.3, 3, 3500, 4900], [70.5, 2, 4200, 5400]].forEach((c, i) =>
      add('chirp', c[0], { n: c[1], f0: c[2], f1: c[3], v: 0.011, pan: i % 2 ? 0.7 : -0.7, gap: 0.11 + 0.02 * (i % 3) }));
    PAD(66, 84, 'Dsus', 'glass', 0.045, { notes: [81, 86, 90, 93], a: 6, r: 5 });
    sparkle(65, 76, 0.6, 1.4, 'box', 9, 15, 0.012, 0.025, 'vap', { rev: 0.8 });

    /* ============ 72-98  sky ============ */
    PAD(72, 78.5, 'Fs7', 'warm', 0.08, { shift: 12, cut: [[0, 1800], [6, 2600]], a: 3.5 });
    PAD(77.5, 84.5, 'Gl', 'warm', 0.09, { shift: 12, cut: [[0, 2000], [6, 2800]] });
    PAD(83.5, 90.5, 'DF', 'warm', 0.09, { shift: 12, cut: [[0, 2200], [6, 2800]] });
    PAD(89.5, 95.5, 'Em9', 'warm', 0.09, { shift: 12, cut: [[0, 2300], [5, 1800]], r: 3 });
    PAD(94, 104, 'Gm', 'dark', 0.15, { cut: [[0, 260], [5, 480], [9, 350]], env: [[0, 0], [2.5, 0.5], [5, 1], [8, 1], [10, 0]] });
    PAD(84, 99, 'Dsus', 'glass', 0.05, { notes: [81, 86, 90, 93, 98], env: [[0, 0], [8, 0.7], [11, 1], [15, 0]] });
    DRONE(74, 100, 38, 0.1, [[0, 0], [5, 0.7], [20, 0.7], [26, 0]]);
    // slow pulse (bass, every 2.4 s)
    for (let t = 74.4, i = 0; t < 94; t += 2.4, i++) N(t, CH[chordAt(t)].root + 12, 'piano', 0.1 * (0.85 + 0.3 * R('pulse')()), { rev: 0.6, dly: 0.25, pan: -0.1 });
    BED(72, 100, { buf: 'pink', f: [[0, 700], [14, 1200], [28, 900]], type: 'bandpass', q: 0.5, lfo: { f: 0.05, depth: 400 }, v: 0.02, env: [[0, 0], [6, 1], [22, 1], [28, 0]] });
    // tiny glints stream towards the hero
    arp(76, 85, 0.3, [0, 1, 2, 3, 4, 5, 6, 7, 9, 11], 'harp', 0.02, 0.045, { rng: 'h3', skip: 0.3, w: 0.8, oct: 1, rev: 0.7 });
    sparkle(76, 86, 0.6, 2.0, 'box', 8, 15, 0.012, 0.03, 'glint', {});
    [[80.3, 3, 3800, 5200], [80.9, 2, 4400, 5800]].forEach((c, i) => add('chirp', c[0], { n: c[1], f0: c[2], f1: c[3], v: 0.008, pan: i ? 0.6 : -0.6, gap: 0.12 }));
    // gather
    motif(85.4, { sh: 5, s: 0.8, inst: 'bell', v: 0.07, rev: 0.9, dly: 0.5, pan: -0.3 });
    motif(87.0, { sh: 3, s: 0.8, inst: 'bell', v: 0.065, rev: 0.9, dly: 0.5, pan: 0.3 });
    motif(88.8, { sh: 7, s: 0.8, inst: 'bell', v: 0.06, rev: 0.9, dly: 0.5, pan: -0.1 });
    motif(90.6, { sh: 5, s: 0.7, inst: 'glass', v: 0.06, rev: 0.9, dly: 0.5, pan: 0.5 });
    sparkle(85, 94.8, 0.8, 3.2, 'bell', 8, 15, 0.025, 0.05, 'gather', { tau: 0.9 });
    sparkle(86, 94.8, 1.5, 4.5, 'box', 9, 16, 0.012, 0.03, 'gather2', {});
    // darkening, rumble, thunder
    BED(93, 110, { buf: 'brown', f: [[0, 100], [6, 190], [12, 120], [17, 90]], type: 'lowpass', v: 0.2, env: [[0, 0], [5, 0.7], [9, 1], [13, 0.5], [17, 0]] });
    DRONE(95, 104, 31, 0.2, [[0, 0], [4, 1], [9, 0]]);
    BED(98.6, 108, { buf: 'brown', f: [[0, 260], [3, 120], [8, 70]], type: 'lowpass', v: 0.26, env: [[0, 0], [1.2, 1], [3.5, 0.5], [9, 0]], carry: false });
    add('drone', 98.8, { d: 7, f: 41.2, v: 0.2, env: [[0, 0], [1.4, 1], [3, 0.5], [7, 0]], carry: false });

    /* ============ 98-126  rain ============ */
    thump(104.2, 0.38, { f0: 95, f1: 36, d: 1.2 });
    BED(98, 126, { buf: 'white', f: [[0, 2500], [6.2, 900]], type: 'highpass', f2: [[0, 7000], [20, 7500], [22, 2500], [26, 900]], type2: 'lowpass', v: 0.055, env: [[0, 0], [3, 0.25], [6.2, 0.3], [8, 1], [19, 1], [21, 0.4], [25, 0.12], [28, 0]] });
    BED(98, 126, { buf: 'pink', f: [[0, 1200], [6, 1800], [20, 1800], [26, 600]], type: 'bandpass', q: 0.6, lfo: { f: 0.06, depth: 500 }, v: 0.05, env: [[0, 0], [4, 0.3], [8, 1], [19, 1], [24, 0.2], [28, 0]], off: 1.7 });
    BED(104, 126, { buf: 'brown', f: [[0, 220]], type: 'lowpass', v: 0.05, env: [[0, 0], [5, 1], [14, 1], [22, 0.5], [22, 0]] });
    // rain drips in the scale
    sparkle(100, 104.2, 0.5, 1.0, 'box', 8, 17, 0.012, 0.02, 'drip0', { rev: 0.7, tau: 0.5, set: [8, 10, 11, 13] }); // only notes that sit in the dark Gm chord
    sparkle(104.2, 118, 1.0, 2.6, 'box', 8, 17, 0.018, 0.03, 'drip', { rev: 0.7, tau: 0.5 });
    PAD(104, 110, 'Bm7', 'warm', 0.075, { cut: [[0, 700], [5, 950]], a: 3 });
    PAD(109, 115, 'Gl', 'warm', 0.075, { cut: [[0, 800], [6, 1000]] });
    PAD(114, 120, 'DF', 'warm', 0.075, { cut: [[0, 800], [6, 900]], r: 4 });
    PAD(118, 128, 'Dsus', 'dark', 0.1, { cut: [[0, 300], [8, 240]], a: 4, r: 3 });
    DRONE(102, 130, 38, 0.18, [[0, 0], [5, 0.6], [16, 0.8], [24, 1.1], [28, 0.3]]);
    // felt-piano rain melody (descending raindrops, then the motif, then its inversion sinking into the soil)
    {
      const s = 104.4, b = 1.2;
      [[0, 7, 0.14], [1, 6, 0.11], [2, 5, 0.1], [3, 4, 0.1]].forEach((x) => PN(s + x[0] * b, x[1], 'piano', x[2], { rev: 0.7, dly: 0.3, pan: 0.1 }));
      motif(s + 4.5 * b, { sh: 0, s: b, inst: 'piano', v: 0.14, rev: 0.7, dly: 0.35, vs: 0, pan: 0.1 });
      motif(s + 10 * b, { sh: 0, s: b, inst: 'piano', v: 0.1, form: 'i', rev: 0.8, dly: 0.4, vs: -0.06, pan: -0.1 });
      // soft rolled left hand
      for (let t = s, i = 0; t < s + 14 * b; t += b, i++) {
        const pad = CH[chordAt(t + 0.3)].pad;
        const q = [0, 2, 1, 2][i % 4];
        N(t + 0.02, pad[q + (i % 4 === 0 ? 0 : 1)] + (i % 4 === 0 ? 12 : 0), 'piano', 0.05, { rev: 0.7, dly: 0.2, pan: -0.25 });
      }
    }
    // a faint rainbow blooms: a rising glass arpeggio
    for (let i = 0; i < 8; i++) PN(108.6 + i * 0.36, 3 + i, 'glass', 0.026 + i * 0.002, { rev: 1, dly: 0.5, pan: -0.6 + i * 0.17, tau: 0.8 });
    // canopy tapping
    {
      const r = R('canopy');
      for (let t = 112.2; t < 118.2;) {
        PN(t, 7 + Math.floor(r() * 10), 'tick', 0.03 + 0.05 * r(), { rev: 0.5, pan: (r() * 2 - 1) * 0.9 });
        t += 0.07 + r() * (r() < 0.3 ? 0.9 : 0.28);
      }
    }
    // sinking into the soil: falling pings, then hush
    for (let i = 0; i < 8; i++) PN(118.6 + i * 0.85 + R('sink')() * 0.1, 9 - i, 'bell', 0.04 * (1 - i * 0.08), { rev: 1, dly: 0.4, tau: 0.8, pan: (i % 2 ? 0.4 : -0.4) });
    N(119.7, 50, 'piano', 0.07, { rev: 0.9, dly: 0.2 });
    N(122.4, 57, 'piano', 0.06, { rev: 0.9, dly: 0.2 });

    /* ============ 122-156  seed, tree, seasons ============ */
    BED(124.6, 127.1, { buf: 'pink', f: [[0, 250], [2.5, 2800]], type: 'bandpass', q: 0.8, v: 0.06, env: [[0, 0], [1.5, 0.5], [2.4, 1], [2.5, 0]] });
    add('gliss', 124.8, { d: 2.3, f0: 440, f1: 880, v: 0.03, env: [[0, 0], [1.5, 0.6], [2.2, 1], [2.3, 0]], rev: 0.7, dly: 0.3 });
    PN(127.0, 8, 'pure', 0.1, { rev: 1, dly: 0.45, tau: 2.6 });
    N(127.0, 93, 'pure', 0.012, { rev: 1 });
    PAD(126.6, 137, 'D', 'glass', 0.05, { notes: [69, 76, 81, 86], a: 2.5, r: 3 });
    PAD(127.2, 139.5, 'D', 'string', 0.12, { cut: [[0, 700], [4, 1500], [10, 2100]], env: [[0, 0], [3, 0.6], [8, 1], [12, 0.8]], a: 2, r: 3 });
    DRONE(126, 160, 38, 0.2, [[0, 0], [4, 0.9], [20, 0.9], [34, 1.2]]);
    thump(127.0, 0.3, { f0: 70, f1: 40, d: 1.0 });
    const SEEDHB = [0.12, 0.18, 0.26, 0.34, 0.4, 0.3, 0.18];
    SEEDHB.forEach((a, i) => { const k = 53 + i; heart(k * 2.4 + 0.144, a, false); heart(k * 2.4 + 0.576, a * 0.62, true); });
    // roots & shoot
    for (let i = 0; i < 9; i++) PN(129 + i * 0.5, -4 + i, 'harp', 0.04 + i * 0.006, { rev: 0.7, dly: 0.4, pan: Math.sin(i * 1.7) * 0.5 });
    motif(133.0, { sh: 5, s: 0.7, inst: 'box', v: 0.07, rev: 0.8, dly: 0.4 });
    [86, 90, 93].forEach((m, i) => N(133.0 + i * 0.12, m, 'bell', 0.04, { rev: 1, dly: 0.5, pan: (i - 1) * 0.4 }));
    // the time-lapse ostinato: spring -> summer -> autumn -> winter -> spring
    arp(134, 148, 0.3, [0, 2, 4, 2, 5, 4, 2, 1], 'box', 0.02, 0.055, { rng: 'o1', skip: 0.12, w: 0.7, oct: 1, rev: 0.6 });
    arp(137, 148, 0.6, [0, 2, 4, 6, 4, 2], 'harp', 0.035, 0.07, { rng: 'o2', skip: 0.1, w: 0.5 });
    arp(142, 148, 0.6, [7, 9, 11, 9, 8, 10], 'piano', 0.03, 0.06, { rng: 'o3', skip: 0.1, w: 0.5, oct: 0 });
    for (let t = 141, i = 0; t < 148; t += 1.2, i++) N(t, CH[chordAt(t + 0.2)].root + 12, 'piano', 0.1, { rev: 0.6, dly: 0.2, pan: -0.2 });
    sparkle(141, 144.5, 1.5, 2.0, 'box', 11, 17, 0.01, 0.018, 'firefly', { rev: 0.9 });
    // autumn: warm cello
    motif(144.6, { sh: -1, s: 0.8, inst: 'cello', v: 0.11, form: 'r', rev: 0.7, dly: 0.2, pan: -0.1 });
    for (let i = 0; i < 6; i++) PN(145.3 + i * 0.55 + R('fall')() * 0.15, 8 - i, 'harp', 0.03, { rev: 0.8, dly: 0.4, pan: 0.5 - i * 0.2 });
    // winter: sparse and glassy
    motif(148.2, { sh: 5, s: 0.9, inst: 'glass', v: 0.05, rev: 1, dly: 0.55, form: 'i', pan: 0.2, tau: 0.8 });
    [[148.0, 6], [149.4, 9], [150.6, 7]].forEach((x, i) => PN(x[0], x[1] + 5, 'bell', 0.035, { rev: 1, dly: 0.6, pan: i - 1 ? 0.5 : -0.5 }));
    // spring returns, fuller
    motif(151.6, { sh: 0, s: 0.9, inst: 'piano', v: 0.14, rev: 0.7, dly: 0.35 });
    motif(151.8, { sh: 0, s: 0.9, inst: 'cello', v: 0.1, rev: 0.7, dly: 0.2, pan: -0.2 });
    arp(151.5, 158, 0.3, [0, 2, 4, 2, 5, 4, 2, 1, 0, 3, 5, 3, 6, 5, 3, 7], 'box', 0.04, 0.05, { rng: 'o4', skip: 0.1, w: 0.7, oct: 1, rev: 0.6 });
    arp(151.5, 158, 0.6, [0, 2, 4, 6, 4, 2], 'harp', 0.06, 0.08, { rng: 'o5', skip: 0.05, w: 0.5 });
    PAD(149.5, 158.5, 'D', 'string', 0.13, { env: [[0, 0], [3, 0.5], [6, 1], [9, 0]], cut: [[0, 900], [6, 2200]], a: 2, r: 3 });
    PAD(147.8, 152.6, 'Bq', 'glass', 0.05, { notes: [78, 81, 85, 88], a: 1.5, r: 2.5 });
    // winter / dusk pads follow the spine
    PAD(143, 148.8, 'D', 'string', 0.1, { cut: [[0, 1400], [5, 1800]], a: 2, r: 2 });
    PAD(141, 144.2, 'Gl', 'warm', 0.07, { a: 1, r: 1.5, cut: [[0, 1300], [3, 1700]] });
    PAD(144.2, 150, 'Bm7', 'warm', 0.09, { cut: [[0, 800], [5, 700]], a: 1.5, r: 2 });
    PAD(136, 141.5, 'D', 'warm', 0.07, { cut: [[0, 1400], [5, 1800]], a: 1.5, r: 1.5 });

    /* ============ 152-170  stars ============ */
    PAD(152, 159.5, 'D', 'choir', 0.14, { env: [[0, 0], [3, 0.35], [6, 0.8], [7, 1], [7.5, 0]], a: 3, r: 2 });
    PAD(158, 161.6, 'D', 'choir', 0.2, { shift: 12, a: 1.2, r: 1.5 });
    PAD(158, 161.6, 'D', 'string', 0.17, { a: 1.2, r: 1.6, cut: [[0, 2600], [3, 3000]] });
    PAD(161, 164.2, 'Bm7', 'choir', 0.2, { a: 1.2, r: 1.5, shift: 12 });
    PAD(161, 164.2, 'Bm7', 'string', 0.16, { a: 1.2, r: 1.6, cut: [[0, 2600], [3, 3000]] });
    PAD(163.2, 166.2, 'Gl', 'choir', 0.22, { a: 1.2, r: 1.5, shift: 12 });
    PAD(163.2, 166.2, 'Gl', 'string', 0.17, { a: 1.2, r: 1.5, cut: [[0, 2800], [3, 3200]] });
    PAD(165.2, 171, 'D', 'choir', 0.16, { a: 1.2, r: 3.5, shift: 12, env: [[0, 0], [1.2, 1], [2.5, 0.9], [5.8, 0]] });
    PAD(165.2, 171, 'D', 'string', 0.13, { a: 1.2, r: 3.5, cut: [[0, 2800], [5, 1200]], env: [[0, 0], [1.2, 1], [2.5, 0.8], [5.8, 0]] });
    PAD(158, 168, 'D', 'glass', 0.06, { notes: [81, 86, 90, 93, 98], a: 2, r: 3 });
    DRONE(156, 172, 38, 0.32, [[0, 0], [2, 0.6], [4, 1], [10, 1.2], [12, 0.6], [14, 0.4], [16, 0]]);
    BED(150, 160, { buf: 'pink', f: [[0, 600], [9, 7000]], type: 'bandpass', q: 0.7, v: 0.065, env: [[0, 0], [5, 0.3], [8, 1], [9.4, 1.2], [9.7, 0]] });
    // petals rise, brighten into stars: a climbing shimmer
    {
      const r = R('rise');
      for (let t = 152.5; t < 158;) {
        const f = (t - 152.5) / 5.5;
        PN(t, Math.floor(lerp(0, 9, f) + r() * 6), r() < 0.5 ? 'bell' : 'box', lerp(0.018, 0.05, f) * (0.7 + 0.6 * r()), { rev: 0.9, dly: 0.5, pan: (r() * 2 - 1) * 0.8, tau: 0.9 });
        t += -Math.log(1 - r() * 0.999) / lerp(1.0, 4.0, f);
      }
    }
    // climax hit
    thump(158.0, 0.4, { f0: 110, f1: 36, d: 2.0 });
    [74, 78, 81, 86, 90, 93].forEach((m, i) => N(158.0 + i * 0.05, m, 'bell', 0.07, { rev: 1, dly: 0.55, pan: (i - 2.5) * 0.3, tau: 2.4 }));
    arp(158.2, 166.2, 0.3, [7, 9, 11, 9, 8, 10, 12, 10], 'bell', 0.05, 0.045, { rng: 'cl1', skip: 0.08, w: 0.8, oct: 1, rev: 0.8, dly: 0.5, tau: 0.8 });
    arp(158.2, 166.2, 0.6, [0, 2, 4, 6, 4, 2], 'harp', 0.07, 0.06, { rng: 'cl2', skip: 0.0, w: 0.5, rev: 0.7 });
    for (let t = 158, i = 0; t < 166; t += 1.2, i++) N(t, CH[chordAt(t + 0.1)].root + 12, 'piano', 0.12, { rev: 0.7, dly: 0.2, pan: -0.2 });
    // constellation: the motif lights five stars, the brightest is the hero
    [[161.0, 8], [162.1, 10], [163.2, 11], [164.3, 12]].forEach((x, i) => PN(x[0], x[1], 'bell', 0.075, { rev: 1, dly: 0.5, tau: 2.2, pan: (i - 1.5) * 0.3 }));
    PN(165.4, 10, 'bell', 0.1, { rev: 1, dly: 0.5, tau: 3.2 });
    N(165.4, 98, 'pure', 0.03, { rev: 1, tau: 3 });
    // shooting stars
    [[159.3, 0.5], [160.5, -0.4], [162.6, 0.6], [164.7, -0.5]].forEach((x, i) => {
      add('gliss', x[0], { d: 0.9, f0: 3200 - i * 150, f1: 1250, v: 0.012, env: [[0, 0], [0.08, 1], [0.7, 0.4], [0.9, 0]], rev: 0.8, dly: 0.5, pan: x[1] });
      for (let j = 0; j < 7; j++) PN(x[0] + j * 0.085, 15 - j, 'glass', 0.03 * (1 - j * 0.1), { rev: 0.9, dly: 0.5, pan: x[1] * (1 - j * 0.12), tau: 0.5 });
    });
    // release: lullaby
    motif(167.0, { sh: 0, s: 1.2, inst: 'piano', v: 0.09, rev: 0.9, dly: 0.45, pan: 0.0 });
    N(166.4, 50, 'piano', 0.08, { rev: 0.8, dly: 0.2 });

    /* ============ 166-180  return ============ */
    add('gliss', 169.8, { d: 1.25, f0: 2349, f1: 587, v: 0.045, env: [[0, 0], [0.12, 1], [0.9, 0.7], [1.25, 0]], rev: 0.8, dly: 0.5, pan: 0.0 });
    for (let i = 0; i < 9; i++) PN(169.85 + i * 0.13, 15 - i, 'glass', 0.034 * (1 - i * 0.07), { rev: 0.95, dly: 0.5, pan: (i % 2 ? 0.3 : -0.3), tau: 0.6 });
    // impact: single deep water-drop, reverberant bell, rings
    add('plunk', 171.0, { v: 0.3 });
    thump(171.0, 0.38, { f0: 150, f1: 42, d: 1.5 });
    PN(171.0, 5, 'bell', 0.075, { rev: 1, dly: 0.5, tau: 2.8 });
    PN(171.06, 8, 'bell', 0.05, { rev: 1, dly: 0.5, tau: 2.4, pan: -0.2 });
    PN(171.12, 10, 'bell', 0.035, { rev: 1, dly: 0.5, tau: 2.2, pan: 0.2 });
    motif(171.8, { sh: 5, s: 1.0, inst: 'bell', v: 0.04, vs: -0.14, form: 'r', rev: 1, dly: 0.5, tau: 1.8, pan: 0.0 });
    PAD(170.5, 180, 'Dsus', 'dark', 0.11, { cut: [[0, 380], [4, 340], [7, 160]], env: [[0, 0], [2, 1], [4, 0.8], [6.5, 0.12], [9.5, 0]], a: 2, r: 4 });
    DRONE(170, 180, 38, 0.2, [[0, 0], [1.5, 1], [3.5, 0.7], [6, 0.15], [8, 0]]);
    BED(173, 180, { buf: 'brown', f: [[0, 700], [3, 500], [4.5, 160]], type: 'lowpass', v: 0.14, env: [[0, 0], [2, 1], [4, 0.9], [5.5, 0.3], [7, 0]] });
    BED(174, 179, { buf: 'pink', f: [[0, 1400], [2, 900], [4, 300]], type: 'lowpass', v: 0.06, env: [[0, 0], [1.5, 1], [3, 0.7], [5, 0]], off: 2.9 });
    // the point of light: one pure high tone (the same A5 that opened the film) and the heart, fading
    add('note', 177.0, { f: 880, inst: 'pure', v: 0.06, rev: 0.9, dly: 0.3, hi: true, tau: 2.0 });
    heart(177.744, 0.2, false); heart(178.176, 0.12, true);

    // mix arcs: per-layer gain (dB) over film time — shapes the story's loudness (hushed start, swells, climax, release)
    const ARC = {
      drone: [[0, -10], [20, -10], [60, -10], [100, -9], [126, -9], [150, -9], [156, -6], [168, -7], [176, -10]],
      pad: [[0, -9], [10, -6], [20, -2], [40, 0], [58, 1], [66, 1], [72, 0], [98, 1], [106, -2], [118, -2], [130, 1], [145, 1], [150, 0], [155, 2], [158, 4], [166, 4], [170, 0], [176, -4]],
      heart: [[0, -4], [180, -4]],
      bed: [[0, 0], [95, 0], [100, 3], [125, 3], [128, 0], [180, 0]],
    };
    EV.forEach((e) => {
      const a = ARC[e.k];
      if (a) e.v *= Math.pow(10, keyed(a, e.t + (e.k === 'pad' ? e.d * 0.5 : 0)) / 20);
    });
    // order: by time, stable
    EV.forEach((e, i) => { e.i = i; });
    EV.sort((a, b) => a.t - b.t || a.i - b.i);
    return EV;
  }
  function score() { return SCORE || (SCORE = compose()); }

  /* ------------------------------------------------------------------ DSP resources (per context, cached) */
  const BUFS = new WeakMap();
  function getBufs(ctx) {
    let b = BUFS.get(ctx);
    if (b) return b;
    const sr = ctx.sampleRate;
    b = { waves: {} };
    const N = Math.floor(sr * 5), X = Math.floor(sr * 0.3);
    const mk = (kind, seed) => {
      const buf = ctx.createBuffer(2, N, sr);
      for (let c = 0; c < 2; c++) {
        const r = mulberry32(seed + c * 977), g = new Float32Array(N + X);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, y = 0;
        for (let i = 0; i < N + X; i++) {
          const w = r() * 2 - 1;
          if (kind === 'white') g[i] = w;
          else if (kind === 'pink') {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            g[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
          } else { y = (y + 0.02 * w) / 1.02; g[i] = y; }
        }
        const d = buf.getChannelData(c);
        for (let i = 0; i < N; i++) {
          if (i < X) { const a = (i / X) * Math.PI * 0.5; d[i] = g[i] * Math.sin(a) + g[N + i] * Math.cos(a); } else d[i] = g[i];
        }
        let s2 = 0; for (let i = 0; i < N; i++) s2 += d[i] * d[i];
        const k = 0.25 / Math.sqrt(s2 / N);
        for (let i = 0; i < N; i++) d[i] *= k;
      }
      return buf;
    };
    b.white = mk('white', 11); b.pink = mk('pink', 23); b.brown = mk('brown', 37);
    // reverb impulse response (stereo, ~5.4 s, darkening tail)
    const secs = 5.4, n = Math.floor(sr * secs), ir = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const r = mulberry32(991 + c * 313), d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.exp((-6.9 * t) / 5.0) * Math.min(1, t / 0.035);
        const co = 0.5 * Math.exp(-t / 1.6) + 0.07;
        lp += ((r() * 2 - 1) - lp) * co;
        d[i] = lp * env;
      }
    }
    b.ir = ir;
    BUFS.set(ctx, b);
    return b;
  }
  function wave(ctx, B, name) {
    if (B.waves[name]) return B.waves[name];
    const W = { felt: [1, 0.42, 0.18, 0.07, 0.03], harp: [1, 0.55, 0.3, 0.16, 0.09, 0.05], whale: [1, 0.5, 0.26, 0.12, 0.06] }[name];
    const re = new Float32Array(W.length + 1), im = new Float32Array(W.length + 1);
    W.forEach((a, i) => { im[i + 1] = a; });
    return (B.waves[name] = ctx.createPeriodicWave(re, im));
  }

  /* ------------------------------------------------------------------ voice container (node bookkeeping) */
  class Voice {
    constructor(P) { this.ctx = P.ctx; this.P = P; this.nodes = []; this.srcs = []; this.pend = 0; this.freed = false; stats.voices++; stats.liveVoices++; if (P.sess.voices) P.sess.voices.add(this); }
    add(n) { this.nodes.push(n); stats.created++; stats.alive++; return n; }
    gain(v) { const g = this.add(this.ctx.createGain()); if (v !== undefined) g.gain.value = v; return g; }
    filt(type, f, q) { const n = this.add(this.ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; return n; }
    osc(type, f) { const o = this.add(this.ctx.createOscillator()); if (type) o.type = type; o.frequency.value = f; this._src(o); return o; }
    buf(b, loop) { const s = this.add(this.ctx.createBufferSource()); s.buffer = b; s.loop = !!loop; this._src(s); return s; }
    pan(p) { if (!this.ctx.createStereoPanner) return null; const n = this.add(this.ctx.createStereoPanner()); n.pan.value = p; return n; }
    _src(s) { this.srcs.push(s); this.pend++; s.onended = () => { if (--this.pend <= 0) this.free(); }; }
    kill(when) { this.srcs.forEach((s) => { try { s.stop(when); } catch (e) { /* not started */ } }); }
    free() {
      if (this.freed) return; this.freed = true;
      for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* */ } }
      stats.alive -= this.nodes.length; stats.liveVoices--;
      if (this.P.sess.voices) this.P.sess.voices.delete(this);
      this.nodes = this.srcs = null;
    }
  }
  /** end a voice that has no source left (defensive: zero sources) */
  function route(v, node, e) {
    const P = v.P, s = P.sess;
    let last = node;
    if (e.pan) { const p = v.pan(e.pan); if (p) { node.connect(p); last = p; } }
    last.connect(e.hi ? s.hi : s.dry);
    if (e.rev > 0) last.connect(s.send('rev', e.rev));
    if (e.dly > 0) last.connect(s.send('dly', e.dly));
  }
  /** schedule piecewise [[rel,val],..] on a param, resuming inside the shape if skip > 0 */
  function sched(param, P, t0, skip, pts, exp, mul) {
    mul = mul == null ? 1 : mul;
    const v0 = (exp ? keyedLog(pts, skip) : keyed(pts, skip)) * mul;
    param.setValueAtTime(exp ? Math.max(1e-5, v0) : v0, P.at(t0 + skip));
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][0] > skip + 1e-6) {
        const v = pts[i][1] * mul;
        if (exp) param.exponentialRampToValueAtTime(Math.max(1e-5, v), P.at(t0 + pts[i][0]));
        else param.linearRampToValueAtTime(v, P.at(t0 + pts[i][0]));
      }
    }
  }
  /** make sure an amplitude envelope ends at 0 exactly at t = d */
  function finish(pts, d) {
    const p = pts.map((x) => x.slice());
    const last = p[p.length - 1];
    if (last[1] !== 0) { if (last[0] < d) p.push([d, 0]); else last[1] = 0; }
    return p;
  }
  /** attack/release shape (sine curves) as [[rel,val],..] */
  function shape(d, a, r) {
    const pts = [[0, 0]];
    for (let i = 1; i <= 6; i++) pts.push([(a * i) / 6, Math.sin((i / 6) * Math.PI * 0.5)]);
    if (d - r > a) pts.push([d - r, 1]);
    for (let i = 1; i <= 6; i++) pts.push([Math.max(a, d - r) + (Math.min(r, d - a) * i) / 6, Math.cos((i / 6) * Math.PI * 0.5)]);
    return pts;
  }

  /* ------------------------------------------------------------------ voices */
  const INST = {
    bell: { parts: [[1, 1, 1], [2, 0.24, 0.5], [2.756, 0.2, 0.3], [4.07, 0.06, 0.12]], tau: 2.1, atk: 0.004, k: 0.28 },
    glass: { parts: [[1, 1, 1], [3, 0.12, 0.25]], tau: 2.4, atk: 0.004, k: 0.28 },
    pure: { parts: [[1, 1, 1], [2, 0.04, 0.3]], tau: 3.0, atk: 0.012, k: 0.1 },
    box: { parts: [[1, 1, 1], [4, 0.16, 0.22]], tau: 0.85, atk: 0.003, k: 0.3 },
    tick: { parts: [[1, 1, 1], [2.4, 0.3, 0.5]], tau: 0.05, atk: 0.001, k: 0 },
  };
  function playNote(P, e) {
    const ctx = P.ctx, v = new Voice(P), t = P.at(e.t), f = e.f, inst = e.inst;
    const vel = e.v * (f > 900 ? Math.pow(900 / f, 0.35) : 1); // the ear is most sensitive up here: tame very high notes
    const mix = v.gain(1);
    const reg = Math.pow(440 / f, 0.3);
    if (inst === 'piano' || inst === 'harp') {
      const tau = (inst === 'piano' ? 1.6 : 1.0) * clamp(reg, 0.5, 1.8) * (e.tau || 1), atk = inst === 'piano' ? 0.008 : 0.003;
      const o = v.osc('sine', f); o.setPeriodicWave(wave(ctx, P.bufs, inst === 'piano' ? 'felt' : 'harp'));
      const lp = v.filt('lowpass', Math.min(f * (inst === 'piano' ? 7 : 10), 9000), 0.5);
      lp.frequency.setTargetAtTime(Math.min(f * 2.4, 6000), t + 0.01, tau * 0.3);
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + atk);
      g.gain.exponentialRampToValueAtTime(Math.max(1e-5, vel * 0.0055), t + atk + tau * 5.2);
      o.connect(lp); lp.connect(g); g.connect(mix);
      o.start(t); o.stop(t + atk + tau * 5.2 + 0.05);
    } else if (inst === 'cello') {
      const d = e.d || 1.2, atk = 0.32, rel = 0.7;
      const lp = v.filt('lowpass', Math.min(f * 3.2 + 500, 5000), 0.7);
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + atk); g.gain.setValueAtTime(vel, t + Math.max(atk, d - rel * 0.4));
      g.gain.linearRampToValueAtTime(0, t + d + rel);
      const vib = v.osc('sine', 5.1), vg = v.gain(0);
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(7, t + 0.8);
      vib.connect(vg); vib.start(t); vib.stop(t + d + rel + 0.05);
      [-5, 5].forEach((dt) => {
        const o = v.osc('sawtooth', f); o.detune.value = dt; vg.connect(o.detune);
        o.connect(lp); o.start(t); o.stop(t + d + rel + 0.05);
      });
      lp.connect(g); g.connect(mix);
      mix.gain.value = 0.55;
    } else {
      const I = INST[inst] || INST.bell;
      const tau = I.tau * (I.k ? clamp(reg, 0.45, 1.8) : 1) * (e.tau || 1);
      I.parts.forEach((p) => {
        if (f * p[0] > 14000) return;
        const o = v.osc('sine', f * p[0]);
        const g = v.gain(0), pk = vel * p[1], life = tau * p[2] * 5.2;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + I.atk);
        g.gain.exponentialRampToValueAtTime(Math.max(1e-6, pk * 0.0055), t + I.atk + life);
        o.connect(g); g.connect(mix);
        o.start(t); o.stop(t + I.atk + life + 0.05);
      });
    }
    route(v, mix, e);
  }

  function playPad(P, e, skip) {
    const ctx = P.ctx, d = e.d;
    if (d - skip < 0.5) return;
    const v = new Voice(P), t0 = P.at(e.t + skip), t1 = P.at(e.t + d), type = e.type;
    const notes = Array.from(new Set(e.notes.map((m) => { m += e.shift || 0; return m < (e.lowest || 50) ? m + 12 : m; })));
    const nn = notes.length;
    const amp = { dark: 0.5, warm: 0.42, string: 0.36, choir: 0.34, glass: 0.55 }[type] || 0.4;
    const L = v.gain(amp / Math.sqrt(nn)), Rb = v.gain(amp / Math.sqrt(nn));
    let vg = null;
    if (type === 'string') {
      const vib = v.osc('sine', 5.3); vg = v.gain(0);
      vg.gain.setValueAtTime(0, t0); vg.gain.linearRampToValueAtTime(6, t0 + 2.5);
      vib.connect(vg); vib.start(t0); vib.stop(t1 + 0.1);
    }
    const spec = {
      dark: [['sawtooth', -7, 'L'], ['sawtooth', 7, 'R']],
      warm: [['sawtooth', -6, 'L'], ['sawtooth', 6, 'R'], ['triangle', 0, 'L'], ['triangle', 0, 'R']],
      string: [['sawtooth', -9, 'L'], ['sawtooth', 9, 'R']],
      choir: [['sawtooth', -5, 'L'], ['sawtooth', 5, 'R'], ['sine', 0, 'L'], ['sine', 0, 'R']],
      glass: [['sine', -4, 'L'], ['sine', 4, 'R'], ['triangle', 0, 'L']],
    }[type];
    notes.forEach((m) => {
      const f = mtof(m);
      spec.forEach((s) => {
        const o = v.osc(s[0], f); o.detune.value = s[1];
        if (vg) vg.connect(o.detune);
        o.connect(s[2] === 'L' ? L : Rb); o.start(t0); o.stop(t1 + 0.1);
      });
    });
    const cut = e.cut || { dark: [[0, 420], [d, 650]], warm: [[0, 900], [d, 1600]], string: [[0, 2200], [d, 2200]], choir: [[0, 3000], [d, 3000]], glass: [[0, 7000], [d, 7000]] }[type];
    const cutMid = keyedLog(cut, d * 0.5);
    const lfo = v.osc('sine', 0.045 + (hstr(String(e.t)) % 60) / 1000), lg = v.gain(cutMid * 0.1);
    lfo.connect(lg); lfo.start(t0); lfo.stop(t1 + 0.1);
    const eg = v.gain(0);
    const sides = [[L, -0.55], [Rb, 0.55]];
    sides.forEach((sd) => {
      const lp = v.filt('lowpass', cut[0][1], 0.6);
      sched(lp.frequency, P, e.t, skip, cut, true);
      lg.connect(lp.frequency);
      sd[0].connect(lp);
      let outN = lp;
      if (type === 'choir') {
        const sum = v.gain(1.6);
        [[800, 1.0, 520], [1150, 0.55, 880], [2900, 0.2, 2600]].forEach((fm) => {
          const bp = v.filt('bandpass', fm[2], 5);
          sched(bp.frequency, P, e.t, skip, [[0, fm[2]], [d * 0.5, fm[0]], [d, fm[2] * 1.05]], true);
          const bg = v.gain(fm[1]); lp.connect(bp); bp.connect(bg); bg.connect(sum);
        });
        outN = sum;
      }
      const pn = v.pan(sd[1]);
      if (pn) { outN.connect(pn); pn.connect(eg); } else outN.connect(eg);
    });
    sched(eg.gain, P, e.t, skip, e.env ? finish(e.env, d) : shape(d, e.a, e.r), false, e.v);
    route(v, eg, { rev: e.rev == null ? 0.45 : e.rev, dly: e.dly || 0, hi: e.hi });
  }

  function playDrone(P, e, skip) {
    const d = e.d;
    if (d - skip < 0.5) return;
    const v = new Voice(P), t0 = P.at(e.t + skip), t1 = P.at(e.t + d), f = e.f;
    const eg = v.gain(0), mix = v.gain(1);
    [['sine', f, 0.5], ['sine', f / 2, 0.3], ['sine', f * 2, 0.26], ['triangle', f * 3, 0.07], ['sine', f * 4.004, 0.05]].forEach((p) => {
      const o = v.osc(p[0], p[1]); const g = v.gain(p[2]); o.connect(g); g.connect(mix); o.start(t0); o.stop(t1 + 0.1);
    });
    const lp = v.filt('lowpass', 700, 0.5); mix.connect(lp); lp.connect(eg);
    const lfo = v.osc('sine', 0.055 + (hstr(String(e.t)) % 40) / 1000), lg = v.gain(e.v * 0.12);
    lfo.connect(lg); lg.connect(eg.gain); lfo.start(t0); lfo.stop(t1 + 0.1);
    sched(eg.gain, P, e.t, skip, e.env ? finish(e.env, d) : shape(d, 3, 4), false, e.v);
    route(v, eg, { rev: 0.3 });
  }

  function playHeart(P, e) {
    const v = new Voice(P), t = P.at(e.t);
    const f0 = e.dub ? 68 : 60, f1 = e.dub ? 44 : 38;
    const g = v.gain(0), mix = v.gain(1);
    [[1, 1, 0.6], [2, 0.3, 0.25]].forEach((p) => {
      const o = v.osc('sine', f0 * p[0]);
      o.frequency.setValueAtTime(f0 * p[0], t); o.frequency.exponentialRampToValueAtTime(f1 * p[0], t + 0.16);
      const pg = v.gain(0);
      pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(e.v * p[1], t + 0.012);
      pg.gain.exponentialRampToValueAtTime(Math.max(1e-5, e.v * p[1] * 0.001), t + p[2]);
      o.connect(pg); pg.connect(mix); o.start(t); o.stop(t + p[2] + 0.05);
    });
    mix.connect(g); g.gain.value = 1;
    route(v, g, { hi: e.hi, rev: 0.12 });
  }

  function playThump(P, e) {
    const v = new Voice(P), t = P.at(e.t), mix = v.gain(1);
    const o = v.osc('sine', e.f0); o.frequency.setValueAtTime(e.f0, t); o.frequency.exponentialRampToValueAtTime(e.f1, t + 0.5);
    const g = v.gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + 0.02); g.gain.exponentialRampToValueAtTime(Math.max(1e-5, e.v * 0.001), t + e.d);
    o.connect(g); g.connect(mix); o.start(t); o.stop(t + e.d + 0.05);
    route(v, mix, { rev: 0.35 });
  }

  function playBed(P, e, skip) {
    const d = e.d;
    if (d - skip < 0.5) return;
    const v = new Voice(P), t0 = P.at(e.t + skip), t1 = P.at(e.t + d);
    const src = v.buf(P.bufs[e.buf], true);
    const off = ((e.off != null ? e.off : (hstr(String(e.t) + e.buf) % 400) / 100) + skip) % 4.5;
    const f1 = v.filt(e.type, e.f[0][1], e.q);
    sched(f1.frequency, P, e.t, skip, e.f, true);
    let last = f1;
    src.connect(f1);
    if (e.lfo) {
      const l = v.osc('sine', e.lfo.f), lg = v.gain(e.lfo.depth); l.connect(lg); lg.connect(f1.frequency); l.start(t0); l.stop(t1 + 0.1);
    }
    if (e.f2) {
      const f2 = v.filt(e.type2, e.f2[0][1], 0.7); sched(f2.frequency, P, e.t, skip, e.f2, true); f1.connect(f2); last = f2;
    }
    const eg = v.gain(0);
    sched(eg.gain, P, e.t, skip, finish(e.env, d), false, e.v);
    last.connect(eg);
    src.start(t0, off); src.stop(t1 + 0.1);
    route(v, eg, { rev: e.rev == null ? 0.2 : e.rev, dly: e.dly || 0 });
  }

  function playWhale(P, e, skip) {
    const d = e.d;
    if (d - skip < 0.8) return;
    const v = new Voice(P), t0 = P.at(e.t + skip), t1 = P.at(e.t + d);
    const o = v.osc('sine', e.notes[0][1]); o.setPeriodicWave(wave(P.ctx, P.bufs, 'whale'));
    const nts = e.notes;
    o.frequency.setValueAtTime(keyedLog(nts, skip), t0);
    nts.forEach((n) => { if (n[0] > skip + 1e-6) o.frequency.exponentialRampToValueAtTime(n[1], P.at(e.t + n[0])); });
    const vib = v.osc('sine', 4.4), vg = v.gain(2.6); // ~ +/- 2.6 Hz wobble on ~150 Hz
    vib.connect(vg); vg.connect(o.frequency); vib.start(t0); vib.stop(t1 + 0.1);
    const bp = v.filt('bandpass', e.form[0], 1.6);
    sched(bp.frequency, P, e.t, skip, [[0, e.form[0]], [d * 0.45, e.form[1]], [d, e.form[0]]], true);
    const lp = v.filt('lowpass', 1400, 0.5);
    const eg = v.gain(0);
    sched(eg.gain, P, e.t, skip, [[0, 0], [1.6, 1], [d - 2.2, 0.8], [d, 0]], false, e.v);
    o.connect(bp); bp.connect(lp); lp.connect(eg);
    o.start(t0); o.stop(t1 + 0.1);
    const pn = v.pan(e.pan[0]);
    if (pn) {
      pn.pan.setValueAtTime(lerp(e.pan[0], e.pan[1], skip / d), t0); pn.pan.linearRampToValueAtTime(e.pan[1], t1);
      eg.connect(pn); route(v, pn, { rev: 0.95, dly: 0.2 });
    } else route(v, eg, { rev: 0.95, dly: 0.2 });
  }

  function playBub(P, e) {
    const v = new Voice(P), t = P.at(e.t);
    const o = v.osc('sine', e.f); o.frequency.setValueAtTime(e.f, t); o.frequency.exponentialRampToValueAtTime(e.f * 1.9, t + 0.09);
    const g = v.gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + 0.006); g.gain.exponentialRampToValueAtTime(1e-5, t + 0.16);
    o.connect(g); o.start(t); o.stop(t + 0.2);
    route(v, g, { pan: e.pan, rev: 0.6, dly: 0.2 });
  }

  function playChirp(P, e) {
    for (let i = 0; i < e.n; i++) {
      const v = new Voice(P), t = P.at(e.t + i * e.gap), up = i % 2 === 0, a = up ? e.f0 : e.f1, b = up ? e.f1 : e.f0;
      const o = v.osc('sine', a); o.frequency.setValueAtTime(a, t); o.frequency.exponentialRampToValueAtTime(b, t + 0.075);
      const m = v.osc('sine', a * 1.5), mg = v.gain(a * 0.25); m.connect(mg); mg.connect(o.frequency);
      m.frequency.setValueAtTime(a * 1.5, t); m.frequency.exponentialRampToValueAtTime(b * 1.5, t + 0.075);
      const g = v.gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v * (1 - i * 0.12), t + 0.012); g.gain.exponentialRampToValueAtTime(1e-5, t + 0.09);
      o.connect(g); o.start(t); o.stop(t + 0.11); m.start(t); m.stop(t + 0.11);
      route(v, g, { pan: e.pan, rev: 0.45, dly: 0.15 });
    }
  }

  function playGliss(P, e, skip) {
    const d = e.d;
    if (d - skip < 0.2) return;
    const v = new Voice(P), t0 = P.at(e.t + skip), t1 = P.at(e.t + d);
    const f0 = e.f0 * Math.pow(e.f1 / e.f0, skip / d);
    const mix = v.gain(1);
    [[1, 1], [2.01, 0.2]].forEach((p) => {
      const o = v.osc('sine', f0 * p[0]);
      o.frequency.setValueAtTime(f0 * p[0], t0); o.frequency.exponentialRampToValueAtTime(e.f1 * p[0], t1);
      const g = v.gain(p[1]); o.connect(g); g.connect(mix); o.start(t0); o.stop(t1 + 0.05);
    });
    const eg = v.gain(0);
    sched(eg.gain, P, e.t, skip, finish(e.env, d), false, e.v);
    mix.connect(eg);
    route(v, eg, { pan: e.pan, rev: e.rev, dly: e.dly });
  }

  function playPlunk(P, e) {
    const v = new Voice(P), t = P.at(e.t), mix = v.gain(1);
    const o = v.osc('sine', 330); o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.45);
    const g = v.gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + 0.004); g.gain.exponentialRampToValueAtTime(e.v * 0.25, t + 0.09); g.gain.exponentialRampToValueAtTime(1e-5, t + 0.55);
    o.connect(g); g.connect(mix); o.start(t); o.stop(t + 0.6);
    const o2 = v.osc('sine', 120); o2.frequency.setValueAtTime(150, t); o2.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    const g2 = v.gain(0); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(e.v * 0.8, t + 0.01); g2.gain.exponentialRampToValueAtTime(1e-5, t + 0.45);
    o2.connect(g2); g2.connect(mix); o2.start(t); o2.stop(t + 0.5);
    route(v, mix, { rev: 0.7, dly: 0.25 });
  }

  const PLAY = { note: playNote, pad: playPad, drone: playDrone, heart: playHeart, thump: playThump, bed: playBed, whale: playWhale, bub: playBub, chirp: playChirp, gliss: playGliss, plunk: playPlunk };

  /* ------------------------------------------------------------------ master chain / session graph */
  function makeMaster(ctx, dest) {
    const m = { nodes: [] };
    const mk = (n) => { m.nodes.push(n); return n; };
    m.in = mk(ctx.createGain());
    const hp = mk(ctx.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 24; hp.Q.value = 0.5;
    const comp = mk(ctx.createDynamicsCompressor());
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.012; comp.release.value = 0.4;
    const sh = mk(ctx.createWaveShaper());
    const cv = new Float32Array(2049);
    for (let i = 0; i < 2049; i++) { const x = (i / 1024) - 1; cv[i] = x * (1 - 0.15 * x * x); } // gentle cubic soft clip, |y| <= 0.85
    sh.curve = cv; try { sh.oversample = '2x'; } catch (e) { /* */ }
    m.mute = mk(ctx.createGain());
    m.in.connect(hp); hp.connect(comp); comp.connect(sh); sh.connect(m.mute); m.mute.connect(dest);
    m.comp = comp;
    return m;
  }
  function makeSession(ctx, B, masterIn, o) {
    o = o || {};
    stats.sessions++;
    const s = { ctx, voices: new Set(), nodes: [], disposed: false };
    const mk = (n) => { s.nodes.push(n); stats.created++; stats.alive++; return n; };
    const g = (v) => { const n = mk(ctx.createGain()); n.gain.value = v; return n; };
    s.out = g(o.fadeIn ? 0 : 1);
    if (o.fadeIn) { const now = ctx.currentTime; s.out.gain.setValueAtTime(0, now); s.out.gain.linearRampToValueAtTime(1, now + o.fadeIn); }
    s.fade = g(1); s.fade.connect(s.out); s.out.connect(masterIn);
    s.tone = mk(ctx.createBiquadFilter()); s.tone.type = 'lowpass'; s.tone.frequency.value = 18000; s.tone.Q.value = 0.5; s.tone.connect(s.fade);
    s.dry = g(1); s.dry.connect(s.tone);
    s.hi = g(1); s.hi.connect(s.fade);
    // reverb
    s.rev = g(1);
    const pre = mk(ctx.createDelay(0.2)); pre.delayTime.value = 0.03;
    const conv = mk(ctx.createConvolver()); conv.buffer = B.ir;
    const rhp = mk(ctx.createBiquadFilter()); rhp.type = 'highpass'; rhp.frequency.value = 220; rhp.Q.value = 0.5;
    const rlp = mk(ctx.createBiquadFilter()); rlp.type = 'lowpass'; rlp.frequency.value = 7200; rlp.Q.value = 0.5;
    const rret = g(0.62);
    s.rev.connect(pre); pre.connect(conv); conv.connect(rhp); rhp.connect(rlp); rlp.connect(rret); rret.connect(s.tone);
    // ping-pong delay (0.6 s = half a beat), darkening feedback
    s.dly = g(1);
    const dA = mk(ctx.createDelay(1.5)), dB = mk(ctx.createDelay(1.5)); dA.delayTime.value = 0.6; dB.delayTime.value = 0.6;
    const lA = mk(ctx.createBiquadFilter()), lB = mk(ctx.createBiquadFilter());
    lA.type = lB.type = 'lowpass'; lA.frequency.value = 2800; lB.frequency.value = 2200; lA.Q.value = lB.Q.value = 0.4;
    const fA = g(0.58), fB = g(0.58), dout = g(0.5);
    s.dly.connect(dA); dA.connect(lA); lA.connect(fA); fA.connect(dB); dB.connect(lB); lB.connect(fB); fB.connect(dA);
    if (ctx.createStereoPanner) {
      const pL = mk(ctx.createStereoPanner()), pR = mk(ctx.createStereoPanner()); pL.pan.value = -0.7; pR.pan.value = 0.7;
      lA.connect(pL); lB.connect(pR); pL.connect(dout); pR.connect(dout);
    } else { lA.connect(dout); lB.connect(dout); }
    dout.connect(s.tone); dout.connect(s.rev);
    // shared send buses at a few quantised levels (saves two gain nodes per voice)
    const LEV = [0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0], sends = {};
    s.send = function (kind, amt) {
      let k = 0;
      for (let i = 1; i < LEV.length; i++) if (Math.abs(LEV[i] - amt) < Math.abs(LEV[k] - amt)) k = i;
      const key = kind + k;
      if (!sends[key]) { const n = g(LEV[k]); n.connect(kind === 'rev' ? s.rev : s.dly); sends[key] = n; }
      return sends[key];
    };
    s.dispose = function (fade) {
      if (s.disposed) return; s.disposed = true;
      const now = ctx.currentTime;
      try { s.out.gain.cancelScheduledValues(now); s.out.gain.setValueAtTime(s.out.gain.value, now); s.out.gain.linearRampToValueAtTime(0, now + fade); } catch (e) { /* */ }
      const vs = Array.from(s.voices);
      setTimeout(() => {
        vs.forEach((v) => { try { v.kill(0); } catch (e) { /* */ } v.free(); });
        s.nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* */ } });
        stats.alive -= s.nodes.length; stats.sessions--;
      }, fade * 1000 + 120);
    };
    return s;
  }

  /* film-time automation that lives on the session: fade in/out and the closing "dive" lowpass */
  /* overall loudness arc (dB, every 5 s) — mastering automation tuned from offline renders so the film breathes:
   * hush -> swell -> surface -> sky -> rain -> seed -> seasons -> climax (158-166) -> release */
  const MACRO = /*MACRO*/[[0,-8],[2.5,-8],[7.5,-11.6],[12.5,-10.9],[17.5,-8],[22.5,-7],[27.5,-7.8],[32.5,-7.3],[37.5,-5.6],[42.5,-4.5],[47.5,-3.4],[52.5,-2.4],[57.5,-1.1],[62.5,-0.1],[67.5,0.2],[72.5,-0.4],[77.5,-0.3],[82.5,0.2],[87.5,-0.3],[92.5,0],[97.5,0.8],[102.5,0.2],[107.5,-0.7],[112.5,-1.9],[117.5,-3.4],[122.5,-4],[127.5,-3.5],[132.5,-2.2],[137.5,-0.8],[142.5,-1.3],[147.5,-2.4],[152.5,-1.8],[157.5,-1.6],[162.5,-2.8],[167.5,-4.7],[172.5,-4.3],[177.5,0],[180,0]]/*END*/;
  const macro = (t) => Math.pow(10, keyed(MACRO, t) / 20);
  const filmGain = (t) => sstep(0, 2, t) * (1 - sstep(177, 180, t)) * macro(t);
  const toneHz = (t) => (t < 175 ? 18000 : Math.exp(lerp(Math.log(18000), Math.log(240), sstep(175, 178.2, t))));
  function scheduleGlobal(P, from, to) {
    const s = P.sess;
    s.fade.gain.setValueAtTime(filmGain(from), P.at(from));
    s.tone.frequency.setValueAtTime(toneHz(from), P.at(from));
    const stepT = 0.05, fadeZ = [[0, 2], [177, 180]], toneZ = [[175, 180]];
    // slow macro automation on a 0.25 s grid; dense (50 ms) inside the fade-in / fade-out zones
    const ts = [];
    for (let t = Math.ceil(from / 0.25) * 0.25; t < to; t += 0.25) if (t > from) ts.push(t);
    fadeZ.forEach((z) => { const a = Math.max(from, z[0]), b = Math.min(to, z[1]); for (let t = Math.ceil(a / stepT) * stepT; t <= b + 1e-9; t += stepT) if (t > from) ts.push(t); });
    ts.push(to);
    ts.sort((a, b) => a - b);
    let last = from;
    ts.forEach((t) => { if (t > last + 1e-6) { s.fade.gain.linearRampToValueAtTime(filmGain(t), P.at(t)); last = t; } });
    toneZ.forEach((z) => {
      const a = Math.max(from, z[0]), b = Math.min(to, z[1]);
      for (let t = Math.ceil(a / 0.1) * 0.1; t <= b + 1e-9; t += 0.1) if (t > from) s.tone.frequency.exponentialRampToValueAtTime(toneHz(t), P.at(t));
    });
  }

  /* ------------------------------------------------------------------ build */
  function build(ctx, dest, fromT, toT, opts) {
    opts = opts || {};
    fromT = clamp(+fromT || 0, 0, DUR); toT = clamp(toT == null ? DUR : +toT, 0, DUR);
    const B = getBufs(ctx);
    let rig = opts.rig;
    if (!rig) { const master = makeMaster(ctx, dest); rig = { master, sess: makeSession(ctx, B, master.in, {}) }; }
    const at0 = opts.at != null ? opts.at : 0;
    const P = { ctx, sess: rig.sess, bufs: B, at: (t) => at0 + (t - fromT) };
    scheduleGlobal(P, fromT, toT);
    const ev = score();
    // binary search first event with t >= fromT
    let lo = 0, hi = ev.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ev[mid].t < fromT) lo = mid + 1; else hi = mid; }
    if (opts.carry !== false && fromT > 0) {
      for (let i = 0; i < lo; i++) { const e = ev[i]; if (opts.kinds && opts.kinds.indexOf(e.k) < 0) continue; if (e.carry && e.t + e.d > fromT + 0.4) { try { PLAY[e.k](P, e, fromT - e.t); } catch (err) { if (G.console) console.error('audio carry', err); } } }
    }
    const only = opts.kinds ? new Set(opts.kinds) : null; // diagnostic: render only some event kinds
    for (let i = lo; i < ev.length && ev[i].t < toT; i++) {
      const e = ev[i];
      if (only && !only.has(e.k)) continue;
      try { PLAY[e.k](P, e, 0); } catch (err) { if (G.console) console.error('audio event', e.k, err); }
    }
    return rig;
  }

  /* ------------------------------------------------------------------ realtime (lookahead scheduler) */
  const RT = { ctx: null, master: null, sess: null, T0: 0, at0: 0, next: 0, timer: 0, muted: false, playing: false, first: true, susp: 0 };
  const AHEAD = 2.8, LEAD = 0.12;
  function ensure() {
    if (!RT.ctx) {
      try { RT.ctx = new AC({ latencyHint: 'playback' }); } catch (e) { RT.ctx = new AC(); }
      RT.master = makeMaster(RT.ctx, RT.ctx.destination);
      RT.master.mute.gain.value = RT.muted ? 0 : 1;
    }
    return RT.ctx;
  }
  const nowFilm = () => RT.T0 + (RT.ctx.currentTime - RT.at0);
  function pump() {
    if (!RT.playing || !RT.sess) return;
    const ctx = RT.ctx, nT = nowFilm();
    if (RT.next < nT - 0.3) { RT.next = nT + 0.05; RT.first = false; } // tab was throttled: skip what we missed
    const horizon = Math.min(DUR, nT + AHEAD);
    if (horizon > RT.next + 0.01) {
      build(ctx, null, RT.next, horizon, { rig: { master: RT.master, sess: RT.sess }, at: RT.at0 + (RT.next - RT.T0), carry: RT.first });
      RT.first = false; RT.next = horizon;
    }
  }
  function begin(T) {
    const ctx = ensure();
    if (RT.timer) { clearInterval(RT.timer); RT.timer = 0; }
    if (RT.sess) RT.sess.dispose(0.25);
    clearTimeout(RT.susp);
    T = clamp(+T || 0, 0, DUR - 0.05);
    RT.T0 = T; RT.at0 = ctx.currentTime; RT.next = Math.min(DUR, T + LEAD); RT.first = true; RT.playing = true;
    RT.sess = makeSession(ctx, getBufs(ctx), RT.master.in, { fadeIn: 0.3 });
    pump();
    RT.timer = setInterval(pump, 200);
  }
  Anim.audio = {
    supported: !!AC,
    start(T) {
      if (!AC) return;
      const ctx = ensure();
      try { if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* */ }
      if (RT.playing && RT.sess && Math.abs(nowFilm() - T) < 0.4) return; // already playing here
      begin(T);
    },
    stop() {
      if (!RT.ctx) return;
      RT.playing = false;
      if (RT.timer) { clearInterval(RT.timer); RT.timer = 0; }
      if (RT.sess) { RT.sess.dispose(0.18); RT.sess = null; }
      clearTimeout(RT.susp);
      RT.susp = setTimeout(() => { if (!RT.playing && RT.ctx && RT.ctx.suspend) { try { RT.ctx.suspend(); } catch (e) { /* */ } } }, 700);
    },
    seek(T) { if (!AC || !RT.ctx || !RT.playing) return; begin(T); },
    setMuted(m) {
      RT.muted = !!m;
      if (!RT.master) return;
      const g = RT.master.mute.gain, now = RT.ctx.currentTime;
      try { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(RT.muted ? 0 : 1, now + 0.3); } catch (e) { g.value = RT.muted ? 0 : 1; }
    },
    build,
    /* diagnostics (not part of the engine contract) */
    stats: () => Object.assign({}, stats, { events: score().length }),
    score,
    state: () => ({ playing: RT.playing, T: RT.ctx && RT.playing ? nowFilm() : RT.T0, muted: RT.muted, ctxState: RT.ctx && RT.ctx.state }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
