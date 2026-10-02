/* ひとしずくの旅 — s5_rain (T 98–126) 雨
 *
 * 98–104  inside the heavy grey cloud (handoff B4: same fog field as s4), the first rain streaks.
 * ~104    the cloud base opens: a vast rainy landscape appears below — six layers of ridges in atmospheric
 *         perspective, a forest valley with a silver river winding to a thin sea on the horizon, a warm rim of
 *         sunlight under the cloud at the right, light shafts through the rain.  The camera falls with the drop.
 * 108–114 a faint rainbow blooms in the rain.
 * 112–118 plunge through the forest canopy: wet leaf clusters sweep upward, ring ripples where the drop touches.
 * 117–122 through the ground: strata, roots, grains, rain-beads sinking; the world decelerates and the drop
 *         hovers at (.5,.56) above the dim seed (handoff B5).
 *
 * Pure function of T: the fall is an analytic velocity profile integrated into a table at load time; streaks,
 * glints, leaves and beads are all f(seed, T).  Static art is pre-rendered into offscreen canvases in resize().
 */
(function () {
  'use strict';
  const { util: u, hero } = Anim;
  const TAU = Math.PI * 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt,
    exp = Math.exp, pow = Math.pow, floor = Math.floor, ceil = Math.ceil, PI = Math.PI;
  const ss = u.smoothstep, clamp = u.clamp, lerp = u.lerp, rgb = u.rgb, mixc = u.mixc;
  const KS = (k, T) => u.keys(k, T, 'spline');
  const CSS = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  const PIN_IN = hero.pins.find((p) => p.to === 's5_rain') || { x: 0.5, y: 0.4, r: 0.015, hue: 205, form: 'drop' };
  const PIN_OUT = hero.pins.find((p) => p.from === 's5_rain') || { x: 0.5, y: 0.56, r: 0.014, hue: 200, form: 'drop' };

  /* ------------------------------------------------------------------ the fall (analytic, tabulated) */
  // camera fall speed in S/s (for the depth plane p = 1)
  // (eased off from ~115.4 on, so the drop visibly slows as the ground comes up to meet it)
  const VC = [[96, 0], [102, 0], [103.5, 0.03], [105, 0.07], [107, 0.13], [109, 0.22], [111, 0.34], [113, 0.55], [114.6, 0.71], [115.8, 0.66],
    [117, 0.46], [118.3, 0.3], [119.7, 0.16], [121, 0.06], [122, 0.0], [130, 0]];
  const vcam = (T) => max(0, KS(VC, T));
  // on-screen vertical speed of the rain streaks (S/s at depth 1, + = down). It starts as s4's gentle downpour, and as the drop
  // drops away from the rain it turns into a steady upward rush (the drop falls faster than the rain).
  const VYR = [[96, 0.5], [102, 0.5], [103.6, 0.22], [104.6, -0.02], [105.4, -0.14], [107, -0.2], [109, -0.28], [111, -0.4], [113, -0.55], [115, -0.7],
    [116.6, -0.75], [118.2, -0.45], [119.8, -0.2], [121.2, -0.05], [122.5, 0], [130, 0]];
  const vyRel = (T) => KS(VYR, T);
  const TB0 = 94, TB1 = 130, TBD = 1 / 30;
  let ZTAB = null, YRTAB = null;
  function buildTables() {
    const n = Math.round((TB1 - TB0) / TBD) + 2;
    ZTAB = new Float32Array(n); YRTAB = new Float32Array(n);
    let z = 0, y = 0;
    for (let i = 0; i < n; i++) {
      const T = TB0 + i * TBD;
      ZTAB[i] = z; YRTAB[i] = y;
      const v = vcam(T + TBD * 0.5);
      z += v * TBD;
      y += vyRel(T + TBD * 0.5) * TBD;
    }
  }
  const ensureTables = () => { if (!ZTAB) buildTables(); if (!GTAB) buildGround(); };
  const tabAt = (tab, T) => {
    const f = clamp((T - TB0) / TBD, 0, tab.length - 1.001), i = floor(f);
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
  };
  const Zf = (T) => tabAt(ZTAB, T);
  const Yr = (T) => tabAt(YRTAB, T);

  /* the ground: its own eased scroll (speed in H/s).  The grass line enters from below the frame at ~116.2, crosses it in ~1.8 s
   * at <= 0.62 H/s, meets the drop at ~117.6 and then the strata keep sinking ever more slowly until everything stops at 122. */
  const GV = [[115.0, 0], [115.8, 0.16], [116.7, 0.5], [117.5, 0.62], [118.4, 0.5], [119.5, 0.31], [120.7, 0.14], [121.7, 0.04], [122.4, 0], [130, 0]];
  const GSURF0 = 1.24, RS_H = 0.25;            // ground-line y (in H) before it appears; grass/soil line row inside the strata canvas (in H)
  const GB0 = 114, GB1 = 130;
  let GTAB = null, GTOT = 0;
  function buildGround() {
    const n = Math.round((GB1 - GB0) / TBD) + 2;
    GTAB = new Float32Array(n);
    let d = 0;
    for (let i = 0; i < n; i++) { GTAB[i] = d; d += max(0, KS(GV, GB0 + i * TBD + TBD * 0.5)) * TBD; }
    GTOT = GTAB[n - 1];
  }
  const groundSurfH = (T) => GSURF0 - tabAt2(GTAB, GB0, T);      // grass line, in H from the top
  const tabAt2 = (tab, t0, T) => {
    const f = clamp((T - t0) / TBD, 0, tab.length - 1.001), i = floor(f);
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
  };

  /* ------------------------------------------------------------------ hero path */
  const HY = [[98, 0.4], [102, 0.4], [104.4, 0.328], [106.5, 0.318], [116.2, 0.322], [118.3, 0.39], [120.4, 0.51], [122, 0.56], [130, 0.56]];
  const heroY = (T) => KS(HY, T);
  const heroXoff = (T) => 0.011 * sin(T * 0.9 + 1.0) * ss(103.2, 106, T) * (1 - ss(118.6, 121.4, T)); // S units
  const heroR = (T) => lerp(PIN_IN.r, PIN_OUT.r, ss(102, 122, T));
  const heroHue = (T) => lerp(PIN_IN.hue, PIN_OUT.hue, ss(102, 122, T));
  const heroPulse = (T) => 1 + 0.06 * sin(T * 2.4);

  /* ------------------------------------------------------------------ palettes */
  const FOG_TOP = rgb('#34465f'), FOG_BOT = rgb('#6d8199');
  const SKY_STOPS = [[0, '#34465f'], [0.2, '#47596f'], [0.34, '#65768a'], [0.43, '#8996a2'], [0.485, '#aaa9a6'], [0.53, '#bdb3a4']];

  /* ------------------------------------------------------------------ state built in init/resize */
  let RAIN = [];
  let CL = [];            // leaf clusters
  let TOUCH = [];
  let SPL = [];           // splashes on the valley floor
  let BEADS = [];         // beads sinking underground
  let GLINT = [];         // river glints
  let SPECK = [];         // shimmering specks (final underground)
  let SHAFT = [];
  let CURT = [];
  let CLOUDB = [];
  let BOKEH = [];
  let FOG = null;
  let LY = {};            // pre-rendered layers
  let SOIL = null, FLAT = null;
  let RIVER = null;
  let T_SURF = 117.6;
  let MYC = [];           // mycelium filaments
  let LEAFG = [];

  /* ------------------------------------------------------------------ shared sprites */
  const shaftSprite = () => u.sprite('s5shaft', 96, 400, (c, w, h) => {
    const g1 = c.createLinearGradient(0, 0, w, 0);
    g1.addColorStop(0, 'rgba(255,226,175,0)'); g1.addColorStop(0.5, 'rgba(255,232,190,0.9)'); g1.addColorStop(1, 'rgba(255,226,175,0)');
    c.fillStyle = g1; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    const g2 = c.createLinearGradient(0, 0, 0, h);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.1, 'rgba(0,0,0,0.85)'); g2.addColorStop(0.2, 'rgba(0,0,0,1)'); g2.addColorStop(0.55, 'rgba(0,0,0,0.4)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g2; c.fillRect(0, 0, w, h);
  });
  const curtainSprite = () => u.sprite('s5curtain', 160, 256, (c, w, h) => {
    const id = c.createImageData(w, h), d = id.data;
    for (let x = 0; x < w; x++) {
      const n = 0.25 + 0.75 * pow(u.noise1(x * 0.11 + 3.3) * 0.65 + u.noise1(x * 0.37 + 9) * 0.35, 1.3);
      const ex = pow(sin(PI * (x + 0.5) / w), 0.7);
      for (let y = 0; y < h; y++) {
        const vy = pow(sin(PI * (y + 0.5) / h), 0.9);
        const a = n * ex * vy * 0.7;
        const o = (y * w + x) * 4;
        d[o] = 206; d[o + 1] = 221; d[o + 2] = 238; d[o + 3] = a * 255;
      }
    }
    c.putImageData(id, 0, 0);
  });
  const cloudDarkSprite = () => u.sprite('s5clouddark', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(58,72,96,0.55)'); g.addColorStop(0.45, 'rgba(58,72,96,0.28)'); g.addColorStop(1, 'rgba(58,72,96,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  const beadSprite = () => u.sprite('s5bead', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(220,240,255,0.0)'); g.addColorStop(0.7, 'rgba(180,215,235,0.16)'); g.addColorStop(1, 'rgba(230,248,255,0.4)');
    c.fillStyle = g; c.beginPath(); c.arc(16, 16, 15, 0, TAU); c.fill();
    const h = c.createRadialGradient(11, 10, 0, 11, 10, 6);
    h.addColorStop(0, 'rgba(255,255,255,0.8)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h; c.beginPath(); c.arc(11, 10, 6, 0, TAU); c.fill();
  });

  /* ------------------------------------------------------------------ leaf cluster sprites */
  function leafGeom(v) {
    const r = u.rng(900 + v * 31);
    const leaves = [], beads = [];
    const addBeads = (L) => {
      const nb = floor(r() * 3);
      for (let k = 0; k < nb; k++) {
        const f = 0.3 + r() * 0.5, lat = (r() - 0.5) * L.wid * 0.7, rad = 3.2 + r() * 4.5;
        const lx = f * L.len, ly = lat;
        beads.push({ x: 128 + L.ox + cos(L.ang) * lx - sin(L.ang) * ly, y: 128 + L.oy + sin(L.ang) * lx + cos(L.ang) * ly, r: rad });
      }
    };
    let stem = null;
    if (v < 3) {
      // rosette of leaves around a point
      const n = 6 + floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + (r() - 0.5) * 0.7;
        const L = { ang, len: 78 + r() * 44, wid: 17 + r() * 14, ox: (r() - 0.5) * 14, oy: (r() - 0.5) * 14, bend: (r() - 0.5) * 0.5 };
        leaves.push(L); addBeads(L);
      }
    } else {
      // a twig with leaves in alternating pairs, gently curved
      const flip = v === 4 ? -1 : 1, rot = (v - 3) * 0.9 + 0.4;
      const P0 = [28, 176], P1 = [96, 40 + (v - 3) * 24], P2 = [228, 92];
      const pt = (t) => { const a = (1 - t) * (1 - t), b2 = 2 * (1 - t) * t, c2 = t * t; return [a * P0[0] + b2 * P1[0] + c2 * P2[0], a * P0[1] + b2 * P1[1] + c2 * P2[1]]; };
      const tg = (t) => { const d0 = 2 * (1 - t), d1 = 2 * t; return Math.atan2(d0 * (P1[1] - P0[1]) + d1 * (P2[1] - P1[1]), d0 * (P1[0] - P0[0]) + d1 * (P2[0] - P1[0])); };
      stem = { P0, P1, P2 };
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = 0.1 + (i / (n - 1)) * 0.85, p0 = pt(t), a0 = tg(t);
        for (const sd of [-1, 1]) {
          if (i === n - 1 && sd === 1) continue;
          const ang = a0 + sd * (0.75 + r() * 0.35) * flip * (i === n - 1 ? 0.25 : 1);
          const L = { ang, len: (64 - 22 * t + r() * 16) * (i === n - 1 ? 1.1 : 1), wid: 14 + r() * 8 - 4 * t, ox: p0[0] - 128, oy: p0[1] - 128, bend: (r() - 0.5) * 0.4 };
          leaves.push(L); addBeads(L);
        }
      }
    }
    leaves.sort((a, b) => a.len - b.len);
    return { leaves, beads, stem };
  }
  const TONES = [
    { base: [34, 84, 70], tip: [96, 150, 124], rib: 'rgba(190,225,205,0.16)', rim: 'rgba(225,248,238,0.1)' },
    { base: [10, 42, 24], tip: [44, 100, 58], rib: 'rgba(130,190,130,0.18)', rim: 'rgba(205,243,215,0.12)' },
    { base: [3, 16, 9], tip: [16, 52, 28], rib: 'rgba(70,120,80,0.2)', rim: 'rgba(170,225,190,0.1)' },
  ];
  function paintLeaves(c, v, tone) {
    const G = LEAFG[v], T = TONES[tone];
    if (G.stem) {
      c.strokeStyle = CSS(mixc(T.base, [70, 60, 40], 0.45), 1); c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(G.stem.P0[0], G.stem.P0[1]); c.quadraticCurveTo(G.stem.P1[0], G.stem.P1[1], G.stem.P2[0], G.stem.P2[1]); c.stroke();
    }
    for (const L of G.leaves) {
      c.save();
      c.translate(128 + L.ox, 128 + L.oy);
      c.rotate(L.ang);
      const len = L.len, wid = L.wid, b = L.bend * wid;
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(len * 0.22, -wid * 0.95 + b, len * 0.7, -wid * 0.8 + b, len, b * 1.6);
      c.bezierCurveTo(len * 0.7, wid * 0.8 + b, len * 0.22, wid * 0.95 + b, 0, 0);
      const gr = c.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, CSS(T.base, 1)); gr.addColorStop(1, CSS(T.tip, 1));
      c.fillStyle = gr; c.fill();
      c.save(); c.clip();
      const gl = c.createLinearGradient(0, -wid, 0, wid);
      gl.addColorStop(0, 'rgba(255,255,255,0.10)'); gl.addColorStop(0.5, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.28)');
      c.fillStyle = gl; c.fillRect(0, -wid * 1.5, len, wid * 3);
      // soft rim light along the upper edge (a few wide faint strokes inside the clip: a glow, not an outline)
      c.strokeStyle = T.rim; c.lineCap = 'round';
      for (const [lw, k] of [[wid * 0.5, 0.5], [wid * 0.28, 0.8], [wid * 0.12, 1]]) {
        c.lineWidth = lw; c.globalAlpha = k;
        c.beginPath(); c.moveTo(len * 0.12, -wid * 0.95 + b * 0.5); c.bezierCurveTo(len * 0.3, -wid * 1.3 + b, len * 0.62, -wid * 1.2 + b, len * 0.9, -wid * 0.2 + b); c.stroke();
      }
      c.globalAlpha = 1;
      c.restore();
      c.strokeStyle = T.rib; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(len * 0.04, 0); c.quadraticCurveTo(len * 0.5, b * 0.5, len * 0.92, b * 1.5); c.stroke();
      c.restore();
    }
    if (tone > 0) {
      const bs = beadSprite();
      for (const B of G.beads) c.drawImage(bs, B.x - B.r, B.y - B.r, B.r * 2, B.r * 2);
    }
  }
  /** a leaf cluster painted at `res` x its display size `px`.  res = 1 gives a 1:1 blit (the fast path) for the many mid leaves;
   *  the few huge, out-of-focus front leaves are painted small and upscaled (soft by construction). */
  function leafCanvas(v, tone, px, res, blur, scratch) {
    const pi = max(16, Math.round(px * res)), c = u.canvas(pi, pi), x = c.getContext('2d');
    x.scale(pi / 256, pi / 256);
    if (v === 4) { x.translate(256, 0); x.scale(-1, 1); }
    if (v === 5) { x.translate(128, 128); x.rotate(-0.75); x.scale(0.84, 0.84); x.translate(-128, -128); }
    paintLeaves(x, v, tone);
    if (blur > 1) {
      // depth-of-field for the far leaves: down- and up-sample through one shared scratch canvas
      const sm = max(8, Math.round(pi / blur)), sx = scratch.getContext('2d');
      sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, scratch.width, scratch.height);
      sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high'; sx.drawImage(c, 0, 0, sm, sm);
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, pi, pi);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(scratch, 0, 0, sm, sm, 0, 0, pi, pi);
    }
    c.dw = px;
    return c;
  }

  /* ------------------------------------------------------------------ fog / lightning (matches s4 at B4) */
  function flashAmt(T) {
    if (T < 98.5 || T > 101) return 0;
    const pl = (t0, w) => (T < t0 ? exp(-pow((T - t0) / 0.035, 2)) : exp(-(T - t0) / w));
    return min(1, 0.5 * pl(98.93, 0.09) + 0.7 * pl(99.27, 0.2) + 0.12 * pl(99.27, 0.8));
  }
  const YE = [[101.8, 1.7], [103.0, 1.38], [103.8, 1.08], [104.7, 0.82], [105.6, 0.6], [106.7, 0.4], [107.9, 0.27], [109.2, 0.15], [111.0, -0.05], [112.6, -0.5]];
  const fogEdge = (T) => KS(YE, T);

  function drawFog(g, T, env, hx, hy) {
    const { W, H, S } = env;
    const Ye = fogEdge(T);
    if (Ye < -0.45 || !FOG) return;
    const { w, h, img } = FOG, d = img.data;
    const asp = W / H;
    const fl = flashAmt(T);
    const fxn = (hx / W + 0.12) * asp, fyn = 0.3;
    const drift = T * 0.022;
    const open = ss(102.4, 103.7, T);
    // large slow billows: visible fbm contrast (+-6 %) that ramps in from 98 and rises ~0.02 S/s, plus two darker lobes drifting up beside the drop
    const bamp = ss(98.0, 101.0, T) * 0.26, hxn = (hx / W) * asp, up = T * 0.02;
    const lobe1y = u.wrap(0.78 - (T - 98) * 0.024, -0.35, 1.25), lobe2y = u.wrap(1.12 - (T - 98) * 0.017, -0.35, 1.25);
    for (let j = 0; j < h; j++) {
      const ny = j / (h - 1);
      for (let i = 0; i < w; i++) {
        const xr = i / (w - 1), nx = xr * asp;
        const v = u.fbm2(nx * 1.6 + 3.1 + T * 0.006, ny * 1.6 + drift, 2);
        const v2 = u.noise2(nx * 0.9 + 11 - T * 0.004, ny * 0.9 + drift * 0.7);
        const o = (j * w + i) * 4;
        let a = 1, under = 0;
        if (open > 0) {
          const edge = Ye - 0.26 * (xr - 0.5) * open + (0.36 * (v - 0.5) + 0.14 * (v2 - 0.5)) * open;
          const dist = edge - ny;
          a = ss(-0.012, 0.055, dist);
          under = exp(-max(dist, 0) / 0.09) * open;
          if (a <= 0.002) { d[o + 3] = 0; continue; }
        }
        let lum = 0.86 + 0.28 * v + 0.1 * (v2 - 0.5);
        if (bamp > 0.001) {
          const vb = u.fbm2(nx * 1.7 + 21, (ny + up) * 1.7 + 4, 3);
          const l1x = nx - (hxn - 0.34 * asp * 0.7), l1y = (ny - lobe1y) * 1.3, l2x = nx - (hxn + 0.42 * asp * 0.7), l2y = (ny - lobe2y) * 1.3;
          lum += bamp * ((vb - 0.5) * 0.9 - 0.2 * exp(-(l1x * l1x + l1y * l1y) * 7) - 0.16 * exp(-(l2x * l2x + l2y * l2y) * 6));
        }
        if (open > 0) lum *= 1 + open * 0.5 * (v - 0.5);
        let r = lerp(FOG_TOP[0], FOG_BOT[0], ny) * lum, gg = lerp(FOG_TOP[1], FOG_BOT[1], ny) * lum, b = lerp(FOG_TOP[2], FOG_BOT[2], ny) * lum;
        if (open > 0 && ny > 0.45) {
          // light pooling under the cloud before it opens
          const gl = open * ss(0.45, 1, ny) * (0.25 + 0.75 * xr) * (0.55 + 0.9 * v) * (1 - ss(104.0, 105.4, T)) * 0.55;
          r += 90 * gl; gg += 76 * gl; b += 60 * gl;
        }
        if (under > 0.004) {
          const wm = under * (0.3 + 0.7 * xr);
          r += 150 * wm + 34 * under; gg += 104 * wm + 38 * under; b += 52 * wm + 44 * under;
        }
        if (fl > 0.002) {
          const dx = nx - fxn, dy = (ny - fyn) / asp * 1.2;
          const f = fl * exp(-(dx * dx + dy * dy) * 2.6) * (0.12 + 1.7 * v * v * v);
          r += 62 * f; gg += 70 * f; b += 104 * f;
        }
        d[o] = r > 255 ? 255 : r; d[o + 1] = gg > 255 ? 255 : gg; d[o + 2] = b > 255 ? 255 : b; d[o + 3] = a * 255;
      }
    }
    FOG.x.putImageData(img, 0, 0);
    g.save();
    // bilinear up to a quarter-res buffer (cheap), then a plain 4x blit: the fog is so smooth the steps are below 8-bit noise
    const rowsMax = min(h, ceil((Ye + 0.5) * h)), mh = ceil(rowsMax * FOG.mh / h);
    FOG.mx.clearRect(0, 0, FOG.mw, mh + 1);
    FOG.mx.drawImage(FOG.c, 0, 0, w, rowsMax, 0, 0, FOG.mw, rowsMax * FOG.mh / h);
    g.imageSmoothingEnabled = false;
    g.drawImage(FOG.m, 0, 0, FOG.mw, rowsMax * FOG.mh / h, 0, 0, W, rowsMax * H / h);
    if (fl > 0.01) {
      const fx = hx + S * 0.2, fy = hy - S * 0.16, R = S * 0.8;
      const gr = g.createRadialGradient(fx, fy, 0, fx, fy, R);
      gr.addColorStop(0, `rgba(205,215,255,${0.30 * fl})`); gr.addColorStop(0.35, `rgba(170,185,240,${0.14 * fl})`); gr.addColorStop(1, 'rgba(150,170,230,0)');
      g.fillStyle = gr; g.fillRect(fx - R, fy - R, R * 2, R * 2);
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ rain */
  const RAINDEF = [
    { n: 300, zf: 0.42, l0: 0.016, lk: 0.07, w: 0.0005, a: 0.26, wa: 0.34 },
    { n: 190, zf: 0.8, l0: 0.03, lk: 0.1, w: 0.0007, a: 0.34, wa: 0.5 },
    { n: 66, zf: 1.5, l0: 0.05, lk: 0.16, w: 0.0012, a: 0.42, wa: 0.58 },
  ];
  const TILT = 0.1;
  function drawRainLayer(g, T, env, li, amul) {
    if (amul < 0.01) return;
    const { W, H, S } = env, R = RAIN[li], D = RAINDEF[li];
    const off = Yr(T) * D.zf, sp = vyRel(T) * D.zf;
    // signed tail: it passes smoothly through zero length while the drop's speed matches the rain's (the ~104.6 s turnaround),
    // instead of flipping the streaks over
    const len = (D.l0 + D.lk * abs(sp)) * S * clamp(sp / 0.07, -1, 1);
    const dir = 1;
    const n = R.n;
    g.save();
    if (T > 115.4 && SOIL) {
      // rain only exists above the ground
      const surf = groundSurfH(T) * H;
      if (surf < H) { g.beginPath(); g.rect(0, 0, W, max(0, surf)); g.clip(); }
    }
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      for (let i = 0; i < n; i++) {
        if (R.warm[i] !== pass) continue;
        const y = u.wrap(R.y[i] + off * R.sv[i], -0.3, 1.2) * H;
        const x = R.x[i] * W;
        const l = len * R.l[i], dx = l * TILT, w = D.w * S * R.w[i];
        const tx = x - dir * dx, ty = y - dir * l;
        g.moveTo(x - w, y); g.lineTo(x + w, y); g.lineTo(tx, ty); g.closePath();
      }
      g.fillStyle = pass ? `rgba(255,232,196,${D.wa * amul})` : `rgba(206,224,243,${D.a * amul})`;
      g.fill();
    }
    // glints on the head of a few streaks
    if (li > 0) {
      g.globalCompositeOperation = 'lighter';
      const sprW = u.glowSprite(45, 80, 80), sprC = u.glowSprite(205, 70, 80);
      const gs = D.zf * S * 0.006;
      const tw = T * 7;
      for (let i = 0; i < n; i += 5) {
        const y = u.wrap(R.y[i] + off * R.sv[i], -0.3, 1.2) * H, x = R.x[i] * W;
        const a = amul * (0.25 + 0.5 * (0.5 + 0.5 * sin(tw * R.sv[i] + i * 1.7)));
        g.globalAlpha = a * (R.warm[i] ? 0.8 : 0.5);
        g.drawImage(R.warm[i] ? sprW : sprC, x - gs, y - gs, gs * 2, gs * 2);
      }
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ pre-rendered layers */
  const treeTone = (cDark, cLite, r) => {
    const k = 0.75 + r * 0.5;
    return [cDark[0] * k, cDark[1] * k, cDark[2] * k, cLite[0] * k, cLite[1] * k, cLite[2] * k];
  };
  function drawTree(x, px, py, w, h, tone, kind) {
    // px,py = base centre; kind 0 conifer, 1 round
    if (kind === 0) {
      x.fillStyle = `rgb(${tone[0] | 0},${tone[1] | 0},${tone[2] | 0})`;
      x.beginPath(); x.moveTo(px, py - h); x.quadraticCurveTo(px + w * 0.2, py - h * 0.4, px + w * 0.5, py); x.lineTo(px - w * 0.5, py); x.quadraticCurveTo(px - w * 0.2, py - h * 0.4, px, py - h); x.fill();
      x.fillStyle = `rgba(${tone[3] | 0},${tone[4] | 0},${tone[5] | 0},0.55)`;
      x.beginPath(); x.moveTo(px + w * 0.02, py - h * 0.96); x.quadraticCurveTo(px + w * 0.2, py - h * 0.4, px + w * 0.5, py); x.lineTo(px + w * 0.1, py); x.quadraticCurveTo(px + w * 0.1, py - h * 0.5, px + w * 0.02, py - h * 0.96); x.fill();
    } else {
      x.fillStyle = `rgb(${tone[0] | 0},${tone[1] | 0},${tone[2] | 0})`;
      x.beginPath(); x.ellipse(px, py - h * 0.45, w * 0.5, h * 0.5, 0, 0, TAU); x.fill();
      x.fillStyle = `rgba(${tone[3] | 0},${tone[4] | 0},${tone[5] | 0},0.3)`;
      x.beginPath(); x.ellipse(px + w * 0.12, py - h * 0.55, w * 0.3, h * 0.32, 0, 0, TAU); x.fill();
    }
  }

  /* Tree stamps: a few tiny pre-shaded sprites per palette (4 brightness steps x cone/round), blitted thousands of times.
   * Much cheaper than a path + two colour parses per tree, and the soft resampling suits the misty far forests. */
  const TNB = 4;
  function treeSet(cd, cl) {
    const set = { cone: [], round: [] };
    for (let b = 0; b < TNB; b++) {
      const tone = treeTone(cd, cl, (b + 0.5) / TNB);
      for (const kind of [0, 1]) {
        const c = u.canvas(24, 40);
        drawTree(c.getContext('2d'), 12, 38, 20, 36, tone, kind);
        (kind ? set.round : set.cone).push(c);
      }
    }
    return set;
  }
  const tBucket = (r) => (r * TNB) | 0;
  function stamp(x, spr, px, py, w, h) {
    const sx = w / 20, sy = h / 36;
    x.imageSmoothingEnabled = false;
    x.drawImage(spr, px - 12 * sx, py - 38 * sy, 24 * sx, 40 * sy);
  }

  const RT = new Float32Array(65536 * 3);
  { const r = u.rng(31337); for (let i = 0; i < RT.length; i++) RT[i] = r(); }
  const noiseCrest = (seed, f, xs) => u.fbm1(xs * f + seed, 5);
  function ridgeCrestFn(env, d) {
    const { W, H, S } = env, cx = W / 2;
    return (x) => {
      const xs = (x - cx) / S;
      const n = noiseCrest(d.seed, d.f, xs);
      const hgt = pow(clamp((n - 0.3) / 0.42, 0, 1), 1.3);
      const jag = (u.fbm1(xs * d.f * 3.3 + d.seed * 2, 3) - 0.5) * 0.2;
      const fine = (u.fbm1(xs * 9 + d.seed * 5, 3) - 0.5) * 0.035;
      let y = d.cb * H - d.amp * S * (hgt + jag * (0.4 + hgt)) + fine * S;
      if (d.floor) {
        const wgt = exp(-pow(abs(xs - (d.sx || 0)) / d.sw, 3));
        const bump = (u.fbm1(xs * 4.2 + d.seed * 7, 3) * 1.5 - 0.45) * 0.035 * S;
        y = lerp(y, max(y, d.floor * H) - bump, wgt);
      }
      return y;
    };
  }

  /** an offscreen layer for a w x h (full-resolution px) picture, stored at scale k (<1 for soft layers that are blitted upscaled).
   *  The context is pre-scaled, so all painting code keeps using full-resolution coordinates. */
  /** a vertical colour ramp as n solid bands over [y0,y1] (clipped to the frame).  A solid fill is ~15x cheaper than a
   *  full-screen gradient fill in a software raster, and the band steps stay below one 8-bit level for the gentle ramps used here.
   *  stops = [[pos, [r,g,b,a]], ...] (pos 0..1 over y0..y1) */
  function bandFill(g, W, H, y0, y1, n, stops, aMul) {
    const hh = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const ya = y0 + i * hh;
      if (ya > H) break;
      if (ya + hh < 0) continue;
      const t = (i + 0.5) / n;
      let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const a = stops[k], b = stops[k + 1], f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
      g.fillStyle = `rgba(${lerp(a[1][0], b[1][0], f) | 0},${lerp(a[1][1], b[1][1], f) | 0},${lerp(a[1][2], b[1][2], f) | 0},${(lerp(a[1][3], b[1][3], f) * aMul).toFixed(4)})`;
      const ra = Math.round(ya);
      g.fillRect(0, ra, W, Math.round(ya + hh) - ra);
    }
  }
  const VEIL = [[0, [172, 190, 212, 0.8]], [0.32, [172, 190, 212, 0.72]], [1, [176, 194, 214, 0.26]]];
  const CANOPY_TINT = [[0, [70, 120, 96, 0.55]], [0.5, [18, 48, 32, 0.2]], [1, [4, 16, 10, 0.55]]];
  const FLAT_EARTH = [[0, [26, 18, 16, 1]], [1, [11, 8, 7, 1]]];
  function mkLayerCanvas(w, h, k = 1) {
    const c = u.canvas(ceil(w * k), ceil(h * k)), x = c.getContext('2d');
    if (k !== 1) { x.scale(c.width / w, c.height / h); x.imageSmoothingEnabled = true; }
    return { c, x };
  }

  /* ---- painted canopy: two octaves of soft round tree crowns (jittered-grid cells, domain-warped so nothing looks tiled), lit
   *      from the upper right, a little darker in the creases between them.  The canvas alpha is the mask; RGB is overwritten. */
  let WL_d1 = 0, WL_d2 = 0, WL_vx = 0, WL_vy = 0, WL_bb = 0;
  function wlTable(ox, oy, nx, ny, seed) {
    const fx = new Float32Array(nx * ny), fy = new Float32Array(nx * ny), fb = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      fx[k] = i + 0.1 + 0.8 * u.hash2(ox + i + seed, oy + j); fy[k] = j + 0.1 + 0.8 * u.hash2(oy + j + 977 + seed, ox + i - 311); fb[k] = u.hash2(ox + i + 4001, oy + j + 61 + seed) - 0.5;
    }
    return { fx, fy, fb, nx, ox, oy };
  }
  function wl(t, gx, gy) {
    const nx = t.nx, ci = floor(gx), cj = floor(gy), fx = t.fx, fy = t.fy;
    let d1 = 9, d2 = 9, vx = 0, vy = 0, bb = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const k = j * nx + i, dx = gx - fx[k], dy = gy - fy[k], dd = dx * dx + dy * dy;
      if (dd < d1) { d2 = d1; d1 = dd; vx = dx; vy = dy; bb = t.fb[k]; } else if (dd < d2) d2 = dd;
    }
    WL_d1 = d1; WL_d2 = d2; WL_vx = vx; WL_vy = vy; WL_bb = bb;
  }
  function paintCanopy(cv, o) {
    const x = cv.getContext('2d'), w = cv.width, h = cv.height;
    const img = x.getImageData(0, 0, w, h), d = img.data;
    const con = o.contrast == null ? 1 : o.contrast;
    const M2 = 2.15;
    let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      const cs = o.cs(cy), gx = (cx * 0.88 - cy * 0.48) / cs + 11.3, gy = (cx * 0.48 + cy * 0.88) / cs + 5.7;
      gx0 = min(gx0, gx); gx1 = max(gx1, gx); gy0 = min(gy0, gy); gy1 = max(gy1, gy);
    }
    gx0 -= 1.2; gy0 -= 1.2; gx1 += 1.2; gy1 += 1.2;
    const ox = floor(gx0) - 2, oy = floor(gy0) - 2, nx = floor(gx1) - ox + 4, ny = floor(gy1) - oy + 4;
    const t1 = wlTable(ox, oy, nx, ny, 0);
    const ox2 = floor(gx0 * M2) - 2, oy2 = floor(gy0 * M2) - 2, nx2 = floor(gx1 * M2) - ox2 + 4, ny2 = floor(gy1 * M2) - oy2 + 4;
    const t2 = wlTable(ox2, oy2, nx2, ny2, 5000);
    const R = 0.9, iR = 1 / R, Lx = 0.988, Ly = -0.18;
    for (let y = 0; y < h; y++) {
      const cs = o.cs(y), col = o.cols(y);
      const dr = col[0], dg = col[1], db = col[2], lr = col[3], lg = col[4], lb = col[5];
      for (let px = 0; px < w; px++) {
        const o4 = (y * w + px) * 4;
        if (d[o4 + 3] === 0) continue;
        let gx = (px * 0.88 - y * 0.48) / cs + 11.3, gy = (px * 0.48 + y * 0.88) / cs + 5.7;
        gx += 0.55 * (u.noise2(gx * 0.55 + 3, gy * 0.55 + 1) - 0.5); gy += 0.55 * (u.noise2(gx * 0.55 + 9, gy * 0.55 + 6) - 0.5);
        wl(t1, gx - ox, gy - oy);
        let r1 = sqrt(WL_d1) * iR, hgt = r1 < 1 ? 1 - r1 * r1 : 0;
        let lit = (WL_vx * Lx + WL_vy * Ly) * iR, edge = clamp((sqrt(WL_d2) - sqrt(WL_d1)) * 5, 0, 1), bb = WL_bb;
        const sh1 = (0.26 + 0.44 * hgt + 0.3 * lit * (0.3 + r1) + bb * 0.22) * (0.62 + 0.38 * edge);
        wl(t2, gx * M2 - ox2, gy * M2 - oy2);
        r1 = sqrt(WL_d1) * iR; hgt = r1 < 1 ? 1 - r1 * r1 : 0;
        lit = (WL_vx * Lx + WL_vy * Ly) * iR;
        const sh2 = (0.3 + 0.4 * hgt + 0.3 * lit * (0.3 + r1) + WL_bb * 0.3) * (0.7 + 0.3 * clamp((sqrt(WL_d2) - sqrt(WL_d1)) * 5, 0, 1));
        let sh = (sh1 * 0.66 + sh2 * 0.34 - 0.5) * con + 0.5;
        sh += (RT[((px * 7 + y * 13) & 65535) * 3] - 0.5) * 0.06;
        sh = sh < 0 ? 0 : sh > 1 ? 1 : sh;
        d[o4] = dr + (lr - dr) * sh; d[o4 + 1] = dg + (lg - dg) * sh; d[o4 + 2] = db + (lb - db) * sh;
      }
    }
    x.putImageData(img, 0, 0);
  }

  function buildRidge(env, d) {
    const { W, H, S } = env;
    const crest = ridgeCrestFn(env, d);
    const cr = [];
    let top = 1e9, mx = -1e9;
    for (let x = 0; x <= W + 1; x += 1) { const y = crest(x); cr.push(y); if (y < top) top = y; if (y > mx) mx = y; }
    top -= 6;
    const bottom = mx + d.span * H + 8;
    const h = ceil(bottom - top);
    const { c, x } = mkLayerCanvas(W, h);
    x.translate(0, -top);
    const cTop = rgb(d.top), cMid = rgb(d.mid), cHz = rgb(d.haze);
    const spBase = d.span * H;
    for (let i = 0; i < cr.length; i++) {
      const y = cr[i], px = i;
      const pk = clamp((d.floor * H - y) / (0.13 * S), 0, 1);
      const sp = spBase * (0.45 + 0.55 * pk);
      const gr = x.createLinearGradient(0, y, 0, y + sp);
      gr.addColorStop(0, CSS(cTop, 1)); gr.addColorStop(0.28, CSS(cMid, 1)); gr.addColorStop(0.62, CSS(mixc(cMid, cHz, 0.55), 0.7)); gr.addColorStop(1, CSS(cHz, 0));
      x.fillStyle = gr; x.fillRect(px, y, 1.5, sp);
    }
    const r = u.rng(d.seed * 77 + 5);
    if (d.trees) {
      const set = treeSet(rgb(d.tdark), rgb(d.tlite));
      const n = floor(d.trees * W / S), arr = [];
      for (let i = 0; i < n; i++) { const px = r() * W, py = crest(px) + (0.012 + pow(r(), 1.3) * 0.12) * H; arr.push([px, py]); }
      arr.sort((a, b) => a[1] - b[1]);
      const ts = d.ts * S;
      for (const [px, py] of arr) { const w = ts * (0.8 + r() * 0.5), h = ts * (1.3 + r() * 0.7); stamp(x, set.cone[tBucket(r())], px, py, w, h); }
    }
    x.globalCompositeOperation = 'source-atop';
    const wr = x.createLinearGradient(W, 0, W * 0.38, 0);
    wr.addColorStop(0, `rgba(255,208,150,${0.42 * d.rim})`); wr.addColorStop(1, 'rgba(255,208,150,0)');
    x.fillStyle = wr; x.fillRect(0, top, W, bottom - top);
    return { c, h, row: d.cb * H - top, ay: d.cb * H, p: d.p, g: d.g, solid: null, d };
  }

  // wing (foothill) layers framing the valley
  function buildWing(env, d) {
    const { W, H, S } = env, cx = W / 2;
    const yBot = H + d.pad * S;
    const hwAt = (y, side) => {
      const t = clamp((y - d.yTop * H) / (yBot - d.yTop * H), 0, 1);
      const wob = (u.fbm1(y / S * 3.4 + d.seed * 3 + side * 7, 3) - 0.5) * 0.34;
      return W * (d.hw0 + (d.hwB - d.hw0) * pow(t, 0.78)) + wob * W * (0.4 + t * 0.6);
    };
    const crestAt = (x) => {
      const xs = abs(x - cx) / W;
      const t = ss(d.hw0, d.hw0 + 0.5, xs);
      const side = x < cx ? 0 : 1;
      const n = u.fbm1((x - cx) / S * d.f + d.seed + side * 31, 5);
      return d.yTop * H - d.rise * H * t - d.amp * S * (n * 1.5 - 0.35) * t * t * 1.4 - d.amp * S * 0.15 * (n - 0.5);
    };
    let top = 1e9;
    for (let x = 0; x <= W; x += 4) top = min(top, crestAt(x));
    top -= 0.06 * S;
    const h = ceil(yBot - top);
    const { c, x } = mkLayerCanvas(W, h);
    x.translate(0, -top);
    const cT = rgb(d.top), cM = rgb(d.mid), cB = rgb(d.bot);
    const gr = x.createLinearGradient(0, top, 0, yBot);
    gr.addColorStop(0, CSS(cT, 1)); gr.addColorStop(0.3, CSS(cM, 1)); gr.addColorStop(1, CSS(cB, 1));
    const r = u.rng(d.seed * 131 + 9);
    const xin = (side, y) => (side === 0 ? cx - hwAt(y, 0) : cx + hwAt(y, 1));
    const inside = (px, py) => abs(px - cx) >= hwAt(py, px < cx ? 0 : 1) && py >= crestAt(px);
    x.fillStyle = gr;
    for (let side = 0; side < 2; side++) {
      const pts = [];
      const x0 = xin(side, d.yTop * H);
      if (side === 0) {
        for (let px = 0; px <= x0; px += 4) pts.push([px, crestAt(px)]);
        pts.push([x0, d.yTop * H]);
        for (let py = d.yTop * H; py <= yBot; py += 6) pts.push([xin(0, py), py]);
        pts.push([xin(0, yBot), yBot]); pts.push([0, yBot]);
      } else {
        pts.push([W, yBot]); pts.push([xin(1, yBot), yBot]);
        for (let py = yBot; py >= d.yTop * H; py -= 6) pts.push([xin(1, py), py]);
        for (let px = x0; px <= W; px += 4) pts.push([px, crestAt(px)]);
      }
      x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fill();
    }
    const set = treeSet(rgb(d.tdark), rgb(d.tlite));
    const area = (W * (yBot - d.yTop * H)) * 0.5;
    const n = min(10000, floor(area / (d.ts * S * d.ts * S * 0.7)));
    const arr = [];
    let tries = 0;
    while (arr.length < n && tries < n * 3) {
      tries++;
      const px = r() * W, pyc = crestAt(px);
      const py = pyc + 0.004 * S + r() * (yBot - pyc);
      if (!inside(px, py)) continue;
      arr.push([px, py]);
    }
    arr.sort((a, b) => a[1] - b[1]);
    for (const [px, py] of arr) {
      const grow = 1 + d.tg * clamp((py - d.yTop * H) / (0.55 * H), 0, 2);
      const ts = d.ts * S * grow;
      const w = ts * (0.85 + r() * 0.45), h = ts * (1.25 + r() * 0.6), tb = tBucket(r());
      stamp(x, (r() < d.round ? set.round : set.cone)[tb], px, py, w, h);
    }
    x.globalCompositeOperation = 'destination-out';
    x.lineJoin = 'round';
    for (let side = 0; side < 2; side++) {
      for (const [wd, al] of [[0.07, 0.3], [0.045, 0.35], [0.026, 0.45], [0.012, 0.6]]) {
        x.strokeStyle = `rgba(0,0,0,${al})`; x.lineWidth = wd * S;
        x.beginPath();
        for (let py = d.yTop * H; py <= yBot; py += 8) { const px = xin(side, py); py === d.yTop * H ? x.moveTo(px, py) : x.lineTo(px, py); }
        x.stroke();
      }
    }
    x.globalCompositeOperation = 'source-atop';
    const wr = x.createRadialGradient(W, top + 0.12 * H, 0, W, top + 0.12 * H, max(0.7 * S, W * 0.5));
    wr.addColorStop(0, `rgba(255,196,130,${0.2 * d.rim})`); wr.addColorStop(1, 'rgba(255,196,130,0)');
    x.fillStyle = wr; x.fillRect(0, top, W, yBot - top);
    const ag = x.createLinearGradient(0, top, 0, top + 0.2 * H);
    ag.addColorStop(0, `rgba(176,196,206,${d.haze})`); ag.addColorStop(1, 'rgba(176,196,206,0)');
    x.fillStyle = ag; x.fillRect(0, top, W, 0.2 * H);
    return { c, h, row: d.yTop * H - top, ay: d.yTop * H, p: d.p, g: d.g, solid: d.solid, d };
  }

  // valley floor with forest and the river
  function riverX(env, d) {
    const { W, S } = env, cx = W / 2, Wm = min(W, 1.7 * S);
    return cx + Wm * (0.17 * d * sin(d * 5.0 + 0.5) + 0.05 * d * sin(d * 11.5 + 1.4) + 0.012 * sin(d * 23));
  }
  function riverHW(env, d) { const S = env.S; return S * (0.0022 + 0.019 * pow(d, 1.35)); }

  function buildValley(env) {
    const { W, H, S } = env, cx = W / 2;
    const K = 0.5;
    const yh = 0.5 * H, vTop = 0.528 * H, vBot = H + 0.4 * S;
    const h = ceil(vBot - vTop);
    const dOf = (y) => (y - yh) / (H - yh);
    const { c, x } = mkLayerCanvas(W, h);
    x.translate(0, -vTop);
    const sPos0 = (y) => (y - vTop) / (vBot - vTop);
    const gr0 = x.createLinearGradient(0, vTop, 0, vBot);
    gr0.addColorStop(0, '#8fa7a2'); gr0.addColorStop(sPos0(0.62 * H), '#5e8878'); gr0.addColorStop(sPos0(0.8 * H), '#3b6a52'); gr0.addColorStop(sPos0(H), '#244f38'); gr0.addColorStop(1, '#183a27');
    x.fillStyle = gr0; x.fillRect(0, vTop, W, vBot - vTop);
    {
      const r0 = u.rng(7002), arr = [];
      for (let y = vTop + 1; y < vBot;) {
        const dd = dOf(y);
        const ts = S * (0.0069 + 0.0325 * pow(max(dd, 0), 1.4));
        const nx = floor(W / (ts * 0.8));
        for (let i = 0; i < nx; i++) {
          const px = (i + r0()) * (W / nx), py = y + r0() * ts * 0.45;
          const rcx = riverX(env, dd), rhw = riverHW(env, dd) * 1.5 + ts * 0.5;
          if (abs(px - rcx) < rhw) continue;
          if (r0() < 0.12) continue;
          arr.push([px, py, ts]);
        }
        y += ts * 0.5;
      }
      const nb = 10, pal = [];
      for (let b2 = 0; b2 < nb; b2++) {
        const t = b2 / (nb - 1);
        const dk = mixc(mixc(rgb('#6f908c'), rgb('#2f5e4e'), pow(t, 0.7)), rgb('#122e1e'), pow(max(0, t - 0.55) / 0.45, 1.2));
        const lt = mixc(mixc(rgb('#9dbab0'), rgb('#5d9376'), pow(t, 0.8)), rgb('#3a7a4e'), pow(max(0, t - 0.6) / 0.4, 1));
        pal.push(treeSet(dk, mixc(lt, dk, 0.5)));
      }
      for (const [px, py, ts] of arr) {
        const dd = dOf(py), b2 = clamp(floor(dd / 1.5 * nb), 0, nb - 1);
        const w = ts * (0.8 + r0() * 0.5), h = ts * (1.3 + r0() * 0.7), tb = tBucket(r0());
        stamp(x, (r0() < 0.3 ? pal[b2].round : pal[b2].cone)[tb], px, py, w, h);
      }
    }
    const r = u.rng(7001);
    // meadow / field patches
    for (let i = 0; i < 40; i++) {
      const py = vTop + pow(r(), 1.5) * (H - vTop) * 1.1, d = dOf(py);
      const rx = (0.03 + r() * 0.1) * S * (0.4 + d), ry = rx * (0.18 + r() * 0.12);
      const px = r() * W;
      const rg = x.createRadialGradient(px, py, 0, px, py, rx);
      const lit = r() < 0.5 ? '170,200,128' : '140,186,128';
      rg.addColorStop(0, `rgba(${lit},0.22)`); rg.addColorStop(1, `rgba(${lit},0)`);
      x.save(); x.translate(px, py); x.scale(1, ry / rx); x.translate(-px, -py);
      x.fillStyle = rg; x.fillRect(px - rx, py - rx, rx * 2, rx * 2); x.restore();
    }
    // river
    const pts = [];
    for (let y = vTop; y <= vBot; y += 2) { const d = dOf(y); pts.push([riverX(env, d), y, riverHW(env, d)]); }
    RIVER = { pts, vTop };
    const sPos = (y) => (y - vTop) / (vBot - vTop);
    // a sky-tinted ribbon: it tapers toward the horizon, is translucent (the forest shows through), and melts into the mist at both ends
    x.fillStyle = 'rgba(14,40,34,0.2)';
    x.beginPath();
    for (const p of pts) x.lineTo(p[0] - p[2] * 1.7, p[1]);
    for (let i = pts.length - 1; i >= 0; i--) x.lineTo(pts[i][0] + pts[i][2] * 1.7, pts[i][1]);
    x.closePath(); x.fill();
    const rg = x.createLinearGradient(0, vTop, 0, vBot);
    rg.addColorStop(0, 'rgba(214,224,228,0)'); rg.addColorStop(sPos(0.545 * H), 'rgba(206,220,228,0.42)'); rg.addColorStop(sPos(0.62 * H), 'rgba(176,200,214,0.6)');
    rg.addColorStop(sPos(H), 'rgba(132,166,188,0.74)'); rg.addColorStop(1, 'rgba(120,156,180,0.78)');
    x.fillStyle = rg;
    x.beginPath();
    for (const p of pts) x.lineTo(p[0] - p[2], p[1]);
    for (let i = pts.length - 1; i >= 0; i--) x.lineTo(pts[i][0] + pts[i][2], pts[i][1]);
    x.closePath(); x.fill();
    x.globalCompositeOperation = 'source-atop';
    const wr = x.createLinearGradient(W, 0, W * 0.3, 0);
    wr.addColorStop(0, 'rgba(255,214,150,0.30)'); wr.addColorStop(1, 'rgba(255,214,150,0)');
    x.fillStyle = wr; x.fillRect(0, vTop, W, vBot - vTop);
    const hz = x.createLinearGradient(0, vTop, 0, 0.7 * H);
    hz.addColorStop(0, 'rgba(176,186,194,0.22)'); hz.addColorStop(1, 'rgba(176,186,194,0)');
    x.fillStyle = hz; x.fillRect(0, vTop, W, 0.7 * H - vTop);
    // melt the top edge of the plate into the mist (no ruler-straight horizon)
    x.globalCompositeOperation = 'destination-out';
    const tf = x.createLinearGradient(0, vTop, 0, vTop + 0.07 * H);
    tf.addColorStop(0, 'rgba(0,0,0,1)'); tf.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = tf; x.fillRect(0, vTop, W, 0.07 * H);
    return { c, h, row: 0, ay: vTop, p: 0.1, solid: null, vTop };
  }

  // foreground tree-tops (solid dark green once we are inside).  Built at half resolution and always blitted with smoothing
  // (it swells while the camera falls, and a nearest-neighbour blit would crawl).
  function buildTreeTops(env) {
    const { W, H, S } = env;
    const K = 0.5;
    const yb = 0.93 * H, band = 0.4 * S;
    const top = yb - 0.05 * S, bottom = yb + 0.5 * S;
    const h = ceil(bottom - top);
    const deep = rgb('#0f2619');
    const { c, x } = mkLayerCanvas(W, h, K);
    const sxk = c.width / W, syk = c.height / h;
    // mask: a bumpy upper edge, solid below
    x.translate(0, -top);
    x.fillStyle = '#000';
    x.beginPath(); x.moveTo(-4, bottom + 2);
    for (let px = -4; px <= W + 4; px += 4) {
      const xs = px / S;
      const e = (u.fbm1(xs * 5.5 + 3, 4) - 0.5) * 0.07 + (u.fbm1(xs * 17, 2) - 0.5) * 0.025;
      x.lineTo(px, yb + e * S);
    }
    x.lineTo(W + 4, bottom + 2); x.closePath(); x.fill();
    x.setTransform(1, 0, 0, 1, 0, 0);
    const cA = rgb('#0c2617'), cB = deep, lA = rgb('#4a8556'), lB = rgb('#235232');
    paintCanopy(c, {
      cs: (y) => S * (0.03 + 0.012 * clamp((top + y / syk - yb) / band, 0, 1.5)) * syk,
      cols: (y) => {
        const t = clamp((top + y / syk - yb) / band, 0, 1);
        const a = mixc(cA, cB, pow(t, 0.7) * 0.95), b = mixc(lA, lB, pow(t, 0.6));
        return [a[0], a[1], a[2], b[0], b[1], b[2]];
      },
      contrast: 0.85,
    });
    x.setTransform(sxk, 0, 0, syk, 0, 0);
    // everything well below the band becomes solid deep green
    const sg = x.createLinearGradient(0, yb - top + band * 0.55, 0, bottom - top);
    sg.addColorStop(0, 'rgba(15,38,25,0)'); sg.addColorStop(1, 'rgba(15,38,25,1)');
    x.fillStyle = sg; x.fillRect(0, yb - top + band * 0.55, W, bottom - top);
    x.globalCompositeOperation = 'source-atop';
    const ag = x.createLinearGradient(0, 0, 0, yb - top + 0.12 * S);
    ag.addColorStop(0, 'rgba(150,182,176,0.16)'); ag.addColorStop(1, 'rgba(150,182,176,0)');
    x.fillStyle = ag; x.fillRect(0, 0, W, yb - top + 0.2 * S);
    const wr = x.createRadialGradient(W * 0.96, yb - top, 0, W * 0.96, yb - top, min(W * 0.45, S * 0.3));
    wr.addColorStop(0, 'rgba(255,214,150,0.24)'); wr.addColorStop(1, 'rgba(255,214,150,0)');
    x.fillStyle = wr; x.fillRect(0, 0, W, h);
    return { c, h, row: yb - top, ay: yb, p: 0.3, g: 0.1, solid: CSS(deep, 1) };
  }

  /* ------------------------------------------------------------------ soil */
  function rootPath(x, r, x0, y0, ang, len, wid, alpha, depth) {
    const segs = 14;
    let px = x0, py = y0, a = ang;
    const pts = [[px, py]];
    for (let i = 0; i < segs; i++) {
      a += (r() - 0.5) * 0.7;
      const l = len / segs;
      px += sin(a) * l; py += cos(a) * l;
      pts.push([px, py]);
    }
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      x.strokeStyle = `rgba(222,208,170,${alpha * (1 - t * 0.6)})`;
      x.lineWidth = max(0.7, wid * (1 - t * 0.8));
      x.beginPath(); x.moveTo(pts[i][0], pts[i][1]);
      x.lineTo(pts[i + 1][0], pts[i + 1][1]); x.stroke();
      if (depth < 2 && i > 2 && r() < 0.15) rootPath(x, r, pts[i][0], pts[i][1], a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.6), len * (0.35 + r() * 0.25), wid * 0.6, alpha * 0.8, depth + 1);
    }
  }
  // The strata strip: grass above the line, then banded earth fading into the flat deep-earth colour at rEnd.  Built at half
  // resolution (soft, and it only ever scrolls past); the flat B5 world below it (specks, roots, seed) is drawn live.
  function buildSoil(env) {
    const { W, H, S } = env;
    const rs = RS_H * H, rEnd = ceil((GTOT - GSURF0 + RS_H) * H);
    const { c, x } = mkLayerCanvas(W, rEnd + 2);
    const r = u.rng(5151);
    const sc = S / 720;
    // grass / fern blades above the surface
    for (let i = 0; i < 300; i++) {
      const px = r() * W, hgt = (0.02 + pow(r(), 2) * 0.12) * H, bend = (r() - 0.5) * hgt * 0.7, wd = (0.004 + r() * 0.008) * S;
      const g0 = 8 + r() * 14;
      x.fillStyle = `rgba(${g0 * 0.6 | 0},${(g0 * 2.2) | 0},${(g0 * 1.2) | 0},0.96)`;
      x.beginPath(); x.moveTo(px - wd, rs + 4); x.quadraticCurveTo(px - wd * 0.3 + bend * 0.2, rs - hgt * 0.5, px + bend, rs - hgt); x.quadraticCurveTo(px + wd * 0.3 + bend * 0.2, rs - hgt * 0.5, px + wd, rs + 4); x.fill();
    }
    // earth
    const eg = x.createLinearGradient(0, rs, 0, rEnd);
    eg.addColorStop(0, '#1d150f'); eg.addColorStop(0.04, '#3a281b'); eg.addColorStop(0.5, '#33241a'); eg.addColorStop(1, '#271b14');
    x.fillStyle = eg; x.fillRect(0, rs, W, rEnd - rs + 2);
    // strata: soft-edged wavy bands that run past both screen edges
    const X0 = -24, X1 = W + 24;
    let y = rs + 0.05 * H, bi = 0;
    while (y < rEnd + 0.05 * H) {
      const th = (0.06 + r() * 0.12 + bi * 0.01) * H, ph = r() * 9, f = 1.5 + r() * 2.5, am = (0.006 + r() * 0.02) * H;
      const t = clamp((y - rs) / (rEnd - rs), 0, 1);
      const tone = [[74, 52, 34], [58, 40, 28], [88, 62, 40], [46, 32, 24], [66, 48, 36], [98, 74, 50], [70, 56, 44]][floor(r() * 7)];
      const dark = lerp(1, 0.5, t), fadeK = 1 - 0.85 * ss(0.45, 1.05, t);
      const cc = `${tone[0] * dark | 0},${tone[1] * dark | 0},${tone[2] * dark | 0}`, al = 0.62 * fadeK;
      const gr = x.createLinearGradient(0, y - am * 1.2, 0, y + th + am * 1.2);
      gr.addColorStop(0, `rgba(${cc},0)`); gr.addColorStop(0.2, `rgba(${cc},${al})`); gr.addColorStop(0.8, `rgba(${cc},${al})`); gr.addColorStop(1, `rgba(${cc},0)`);
      x.fillStyle = gr;
      x.beginPath();
      for (let px = X0; px <= X1; px += 12) { const yy = y + am * sin(px / S * f + ph) + (u.noise1(px / S * 3 + ph) - 0.5) * am; px > X0 ? x.lineTo(px, yy) : x.moveTo(px, yy); }
      for (let px = X1; px >= X0; px -= 12) { const yy = y + th + am * sin(px / S * f + ph + 1.1) + (u.noise1(px / S * 3 + ph + 5) - 0.5) * am; x.lineTo(px, yy); }
      x.closePath(); x.fill();
      y += th; bi++;
    }
    const hg = x.createLinearGradient(0, rs, 0, rs + 0.07 * H);
    hg.addColorStop(0, 'rgba(8,10,6,0.95)'); hg.addColorStop(1, 'rgba(8,10,6,0)');
    x.fillStyle = hg; x.fillRect(0, rs, W, 0.07 * H);
    // moisture blotches (dark) and sandy glints (light)
    for (let i = 0; i < 110; i++) {
      const px = r() * W, py = rs + r() * (rEnd - rs), rad = (0.04 + r() * 0.1) * S;
      const dk = r() < 0.75;
      const rg = x.createRadialGradient(px, py, 0, px, py, rad);
      rg.addColorStop(0, dk ? 'rgba(10,6,4,0.2)' : 'rgba(150,115,80,0.09)'); rg.addColorStop(1, dk ? 'rgba(10,6,4,0)' : 'rgba(150,115,80,0)');
      x.fillStyle = rg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // stones and pebbles (irregular, softly lit from above-right)
    for (let i = 0; i < 260; i++) {
      const big = r() < 0.04;
      const px = r() * W, py = rs + 0.06 * H + r() * (rEnd - rs - 0.35 * H), rw = (big ? 0.014 + r() * 0.02 : 0.004 + pow(r(), 2) * 0.01) * S;
      const dk = lerp(1, 0.5, clamp((py - rs) / (rEnd - rs), 0, 1)), b0 = 70 + r() * 56, rot = r() * 3, flat = 0.5 + r() * 0.35;
      const nPts = 9, pts = [];
      for (let q = 0; q < nPts; q++) { const a2 = (q / nPts) * TAU, rr = rw * (0.78 + 0.45 * r()); pts.push([cos(a2) * rr, sin(a2) * rr * flat]); }
      x.save(); x.translate(px, py); x.rotate(rot);
      x.beginPath();
      for (let q = 0; q < nPts; q++) { const p0 = pts[q], p1 = pts[(q + 1) % nPts]; const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; q ? x.quadraticCurveTo(p0[0], p0[1], mx, my) : x.moveTo(mx, my); }
      x.closePath();
      const rg = x.createRadialGradient(-rw * 0.3, -rw * flat * 0.4, rw * 0.1, 0, 0, rw * 1.1);
      rg.addColorStop(0, `rgba(${b0 * 1.2 * dk | 0},${b0 * 0.98 * dk | 0},${b0 * 0.74 * dk | 0},0.9)`); rg.addColorStop(1, `rgba(${b0 * 0.5 * dk | 0},${b0 * 0.4 * dk | 0},${b0 * 0.3 * dk | 0},0.9)`);
      x.fillStyle = rg; x.fill();
      x.restore();
    }
    // roots
    for (let i = 0; i < 9; i++) {
      rootPath(x, r, (0.05 + 0.9 * (i + r() * 0.6) / 9) * W, rs + 0.01 * H, (r() - 0.5) * 0.6, (0.5 + r() * 0.9) * H, (1.8 + r() * 1.8) * sc, 0.3, 0);
    }
    // grains
    for (let i = 0; i < 3600; i++) {
      const px = r() * W, py = rs + r() * (rEnd - rs);
      const dk = lerp(1, 0.4, clamp((py - rs) / (rEnd - rs), 0, 1));
      x.fillStyle = `rgba(${150 * dk | 0},${118 * dk | 0},${86 * dk | 0},${0.1 + r() * 0.26})`;
      const sz = (1.8 + r() * 2.2) * max(1, sc); x.fillRect(px, py, sz, sz);
    }
    // rain seeping down: faint cool threads with tiny beads
    for (let i = 0; i < 20; i++) {
      const px0 = r() * W, py0 = rs + r() * 0.6 * H, len = (0.15 + r() * 0.4) * H;
      x.strokeStyle = `rgba(150,200,230,${0.03 + r() * 0.045})`; x.lineWidth = (1.2 + r() * 1.2) * sc;
      x.beginPath(); x.moveTo(px0, py0);
      let qx = px0;
      for (let j = 1; j <= 10; j++) { qx += (r() - 0.5) * 22 * sc; x.lineTo(qx, py0 + len * j / 10); }
      x.stroke();
      for (let j = 0; j < 2 + floor(r() * 3); j++) {
        const by = py0 + r() * len;
        x.fillStyle = `rgba(190,225,245,${0.2 + r() * 0.3})`;
        x.beginPath(); x.arc(qx, by, (1.8 + r() * 2.4) * sc, 0, TAU); x.fill();
      }
    }
    // wet shine along the surface + rootlets hanging
    const sg = x.createLinearGradient(0, rs - 6, 0, rs + 8);
    sg.addColorStop(0, 'rgba(170,205,170,0)'); sg.addColorStop(0.45, 'rgba(190,220,180,0.3)'); sg.addColorStop(1, 'rgba(190,220,180,0)');
    x.fillStyle = sg; x.fillRect(0, rs - 6, W, 14);
    for (let i = 0; i < 150; i++) {
      const px = r() * W, l = (0.01 + r() * 0.05) * H;
      x.strokeStyle = `rgba(215,205,170,${0.22 + r() * 0.28})`; x.lineWidth = 1.5 * max(1, sc);
      x.beginPath(); x.moveTo(px, rs + 2); x.quadraticCurveTo(px + (r() - 0.5) * 14, rs + l * 0.5, px + (r() - 0.5) * 22, rs + l); x.stroke();
    }
    // strata fade to the flat deep-earth colour (the B5 world)
    const f0 = max(rs, rEnd - 0.62 * H);
    const tg = x.createLinearGradient(0, f0, 0, rEnd);
    tg.addColorStop(0, 'rgba(26,18,16,0)'); tg.addColorStop(0.55, 'rgba(26,18,16,0.12)'); tg.addColorStop(0.85, 'rgba(26,18,16,0.5)'); tg.addColorStop(1, 'rgba(26,18,16,1)');
    x.fillStyle = tg; x.fillRect(0, f0, W, rEnd - f0);
    x.fillStyle = '#1a1210'; x.fillRect(0, rEnd - 1, W, 4);
    return { c, rs, rEnd, full: rEnd + 2 };
  }

  // the flat B5 world: specks, a few dim roots and the unlit seed; all positions are relative to the top of the flat region
  function buildFlat(env) {
    const { W, H, S } = env;
    const sc = max(1, S / 720), r2 = u.rng(6262), r = u.rng(8181);
    // specks, bucketed by (alpha, lightness) so each bucket is one fill
    const NB = 12, bk = [];
    for (let i = 0; i < NB; i++) bk.push({ a: 0.1 + (floor(i / 3) + 0.5) / 4 * 0.26, lt: 0.4 + 0.6 * (0.2 + 0.3 * (i % 3)), x: [], y: [], s: [] });
    for (let i = 0; i < 900; i++) {
      const px = r2() * W, yn = r2(), sz = (0.8 + r2() * 1.6) * sc, a = r2();
      const k2 = bk[min(3, floor(a * 4)) * 3 + min(2, floor((1 - yn) * 3))];
      k2.x.push(px); k2.y.push(yn * H); k2.s.push(sz);
    }
    for (const b of bk) { b.fill = `rgba(${130 * b.lt | 0},${98 * b.lt | 0},${72 * b.lt | 0},${b.a})`; }
    // roots
    const roots = [];
    for (const [fx, ang, ln] of [[0.16, 0.25, 0.46], [0.82, -0.3, 0.52], [0.66, 0.1, 0.34], [0.33, -0.2, 0.3]]) {
      const pts = [[fx * W, -0.02 * H]];
      let px = pts[0][0], py = pts[0][1], a = ang;
      const segs = 22;
      for (let i = 0; i < segs; i++) { a += (r2() - 0.5) * 0.5; px += sin(a) * ln * H / segs; py += cos(a) * ln * H / segs; pts.push([px, py]); }
      roots.push(pts);
    }
    return { bk, roots, sc, seedY: 0.66 * H, rx: 0.0165 * S, ry: 0.025 * S };
  }

  /* ------------------------------------------------------------------ scene */

  /* ------------------------------------------------------------------ pre-rendered atmosphere (all blitted 1:1) */
  function glowE(g, x, y, rx, ry, h, s, l, a, kind) {
    g.save(); g.translate(x, y); g.scale(1, ry / rx); u.glow(g, 0, 0, rx, h, s, l, a, kind); g.restore();
  }

  function buildSky(env) {
    const { W, H, S } = env;
    const pad = ceil(0.08 * H), hs = ceil(0.62 * H);
    const { c, x } = mkLayerCanvas(W, hs);
    const gr = x.createLinearGradient(0, 0, 0, H * 0.53);
    for (const [p, col] of SKY_STOPS) gr.addColorStop(p, col);
    x.fillStyle = gr; x.fillRect(0, 0, W, H * 0.53 + 1);
    x.fillStyle = '#bdb3a4'; x.fillRect(0, H * 0.53, W, hs - H * 0.53);
    const hg2 = x.createLinearGradient(0, 0, W, 0);
    hg2.addColorStop(0, 'rgba(34,52,82,0.34)'); hg2.addColorStop(0.55, 'rgba(34,52,82,0.08)'); hg2.addColorStop(1, 'rgba(255,190,130,0.06)');
    x.fillStyle = hg2; x.fillRect(0, 0, W, H * 0.53);
    const sx = W * 0.9, sy = H * 0.488;
    glowE(x, sx, sy, S * 0.95, S * 0.2, 24, 85, 48, 0.5);
    glowE(x, sx, sy, S * 0.5, S * 0.07, 34, 90, 58, 0.5);
    glowE(x, sx - S * 0.05, sy, S * 0.26, S * 0.03, 42, 85, 70, 0.4);
    return { c, pad, h: hs, H: H + pad };
  }

  function buildClouds(env) {
    const { W, H, S } = env;
    const P = ceil(W * 1.5), h = ceil(0.5 * H);
    const { c, x } = mkLayerCanvas(P, h, 0.25);
    const cd = cloudDarkSprite();
    for (const b of CLOUDB) {
      const bw = b.w * S, bh = b.h * S, bx = b.x * P, by = b.y * H;
      x.globalAlpha = b.a * 0.7;
      for (const o of [-P, 0, P]) x.drawImage(cd, bx + o - bw * 0.5, by - bh * 0.5, bw, bh);
    }
    x.globalAlpha = 1;
    return { c, P, h };
  }

  function buildRainbow(env) {
    const { W, H, S } = env;
    const R = min(0.72 * S, W * 0.6), cxr = W * 0.16, cyr = H > W ? H * 0.19 + R * 1.06 : H * 0.88;
    const left = max(0, floor(cxr - R * 1.3)), right = min(W, ceil(cxr + R * 1.3)), top = max(0, floor(cyr - R * 1.3));
    const w = right - left, h = ceil(cyr - top);
    const { c, x } = mkLayerCanvas(w, h);
    x.translate(-left, -top);
    const A = 1;
    let rg = x.createRadialGradient(cxr, cyr, R * 0.72, cxr, cyr, R * 1.18);
    rg.addColorStop(0, 'rgba(210,220,255,0)'); rg.addColorStop(0.5, 'rgba(214,226,250,0.06)'); rg.addColorStop(1, 'rgba(210,220,255,0)');
    x.fillStyle = rg; x.fillRect(left, top, w, h);
    rg = x.createRadialGradient(cxr, cyr, R * 0.84, cxr, cyr, R * 1.03);
    rg.addColorStop(0, 'rgba(150,100,255,0)');
    rg.addColorStop(0.13, `rgba(140,100,235,${0.34 * A})`);
    rg.addColorStop(0.3, `rgba(70,140,240,${0.40 * A})`);
    rg.addColorStop(0.46, `rgba(70,200,150,${0.40 * A})`);
    rg.addColorStop(0.62, `rgba(240,225,90,${0.44 * A})`);
    rg.addColorStop(0.8, `rgba(250,150,80,${0.42 * A})`);
    rg.addColorStop(0.93, `rgba(235,80,90,${0.30 * A})`);
    rg.addColorStop(1, 'rgba(235,80,90,0)');
    x.fillStyle = rg; x.fillRect(left, top, w, h);
    rg = x.createRadialGradient(cxr, cyr, R * 1.15, cxr, cyr, R * 1.27);
    rg.addColorStop(0, 'rgba(255,120,120,0)'); rg.addColorStop(0.3, 'rgba(255,170,130,0.07)'); rg.addColorStop(0.55, 'rgba(160,230,190,0.07)'); rg.addColorStop(0.8, 'rgba(130,150,255,0.07)'); rg.addColorStop(1, 'rgba(130,150,255,0)');
    x.fillStyle = rg; x.fillRect(left, top, w, h);
    return { c, left, top, cyr, w, h };
  }

  function buildShafts(env) {
    const { W, H, S } = env;
    const top = floor(0.36 * H), h = ceil(H - top);
    const spr = shaftSprite();
    const { c, x } = mkLayerCanvas(W, h);
    x.globalCompositeOperation = 'lighter';
    for (const sh of SHAFT) {
      const ang = 0.18 + sh.a * 0.78, len = H * (1.15 + 0.2 * sh.a), wd = S * sh.w;
      x.save(); x.translate(W * 0.9, H * 0.47 - top); x.rotate(ang);
      x.globalAlpha = sh.al * 0.6;
      x.drawImage(spr, -wd * 0.5, 0, wd, len);
      x.restore();
    }
    return { c, top, h };
  }

  function buildCurtains(env) {
    const { W, H, S } = env;
    const spr = curtainSprite(), out = [];
    for (const [ws, hs] of [[0.55, 0.5], [0.8, 0.62], [1.05, 0.72]]) {
      const w = ceil(ws * S), h = ceil(hs * H), sk = 0.14, cw = ceil(w + sk * h);
      const { c, x } = mkLayerCanvas(cw, h);
      x.transform(1, 0, -sk, 1, sk * h + 0, 0);
      x.drawImage(spr, 0, 0, w, h);
      out.push({ c, w: cw, h });
    }
    // a warm, sun-lit rain curtain near the break in the cloud
    {
      const w = ceil(0.5 * S), h = ceil(0.6 * H), sk = 0.14, cw = ceil(w + sk * h);
      const { c, x } = mkLayerCanvas(cw, h);
      x.transform(1, 0, -sk, 1, sk * h, 0);
      x.drawImage(spr, 0, 0, w, h);
      x.setTransform(c.width / cw, 0, 0, c.height / h, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      const wg = x.createLinearGradient(0, 0, 0, h);
      wg.addColorStop(0, 'rgba(255,226,170,1)'); wg.addColorStop(1, 'rgba(255,200,140,0.6)');
      x.fillStyle = wg; x.fillRect(0, 0, cw, h);
      out.warm = { c, w: cw, h };
    }
    return out;
  }

  function buildMist(env) {
    const { W, H, S } = env;
    const spr = u.glowSprite(205, 18, 92, 'soft'), out = [];
    for (let k = 0; k < 2; k++) {
      const P = ceil(W * 1.6), h = ceil(0.22 * S);
      const { c, x } = mkLayerCanvas(P, h, 0.25);
      const r = u.rng(4100 + k * 17);
      for (let i = 0; i < 4; i++) {
        const bw = (0.5 + r() * 0.6) * S, bx = r() * P, by = h * (0.35 + r() * 0.3);
        x.globalAlpha = 0.16 + r() * 0.14;
        for (const o of [-P, 0, P]) x.drawImage(spr, bx + o - bw * 0.6, by - bw * 0.11, bw * 1.2, bw * 0.22);
      }
      out.push({ c, P, h, y: k ? 0.8 : 0.62, sp: k ? 0.012 : 0.007, p: k ? 0.2 : 0.12 });
    }
    return out;
  }

  function buildFlare(env) {
    const { W, H, S } = env;
    const top = floor(0.12 * H), h = ceil(0.72 * H);
    const { c, x } = mkLayerCanvas(W, h, 0.25);
    glowE(x, W * 0.9, H * 0.48 - top, S * 1.4, S * 0.5, 34, 90, 55, 1);
    return { c, top, h };
  }

  function buildLeaves(env) {
    const { S, H } = env;
    const lf = 1 + 0.3 * clamp(H / S - 1, 0, 1);
    const scratch = u.canvas(Math.ceil(0.4 * S * lf / 2.2) + 8, Math.ceil(0.4 * S * lf / 2.2) + 8);
    const mk = (tone, sizes, shapes, res, blur) => sizes.map((sz) => { const px = max(24, round(sz * S * lf)); return shapes.map((v) => leafCanvas(v, tone, px, res, blur, scratch)); });
    const sh = [0, 1, 2, 3, 4, 5];
    return {
      back: (() => { const one = mk(0, [0.38], sh, 1, 2.2)[0]; return [one, one]; })(),
      mid: mk(1, [0.42, 0.58], sh, 1, 0),
      front: mk(2, [0.8], sh.slice(0, 5), 0.25, 0),
    };
  }
  const round = Math.round;

  /* ------------------------------------------------------------------ scene */
  let FLARE = null, SKY = null, CLOUDS = null, RB = null, SH = null, CUR = null, MIST = null, LEAFS = null;

  Anim.defineScene({
    id: 's5_rain',

    init(env) {
      ensureTables();
      T_SURF = 117.9;
      for (let t = 114; t < 121; t += 0.01) if (groundSurfH(t) <= heroY(t)) { T_SURF = t; break; }
      const r = u.rng(5005);
      RAIN = RAINDEF.map((D) => {
        const n = D.n * 2;
        const o = { n, x: new Float32Array(n), y: new Float32Array(n), sv: new Float32Array(n), l: new Float32Array(n), w: new Float32Array(n), warm: new Uint8Array(n) };
        for (let i = 0; i < n; i++) {
          o.x[i] = r(); o.y[i] = r() * 1.5 - 0.3; o.sv[i] = 0.85 + r() * 0.3; o.l[i] = 0.55 + r() * 0.9; o.w[i] = 0.6 + r() * 0.8;
          o.warm[i] = o.x[i] > 0.6 + r() * 0.12 ? 1 : 0;
        }
        return o;
      });
      LEAFG = [0, 1, 2, 3, 4, 5].map(leafGeom);
      const rc = u.rng(7717);
      CL = [];
      const addLayer = (layer, n, t0, t1, nCls, nShape, p, extra) => {
        for (let i = 0; i < n; i++) {
          const tc = lerp(t0, t1, (i + rc() * 0.9) / n);
          CL.push({ layer, p, extra, x: -0.06 + rc() * 1.12, tc, v: floor(rc() * nShape), cls: i % nCls, ph: rc() * TAU, touch: -1, zc: Zf(tc), dy: (rc() - 0.5) * 0.1, sw: (rc() - 0.5) * 2 });
        }
      };
      addLayer(0, 14, 110.2, 117.4, 2, 6, 0.5, false);
      addLayer(1, 13, 111.0, 117.2, 2, 6, 1.0, false);
      addLayer(2, 4, 112.6, 116.0, 1, 5, 1.75, false);
      // extra clusters that only appear on tall (portrait) screens, where the leaves have more height to fill
      addLayer(0, 12, 110.4, 117.2, 2, 6, 0.5, true);
      addLayer(1, 10, 111.2, 117.0, 2, 6, 1.0, true);
      addLayer(2, 2, 113.4, 115.4, 1, 5, 1.75, true);
      TOUCH = [{ t: 113.35, dx: -0.04 }, { t: 114.75, dx: 0.035 }, { t: 115.85, dx: -0.03 }, { t: 116.85, dx: 0.04 }];
      TOUCH.forEach((tc, k) => {
        CL.push({ layer: 1, p: 1.0, x: 0.5, tc: tc.t, v: (k + 1) % 6, cls: 1, ph: k * 2.1, touch: k, zc: Zf(tc.t), dy: 0.0, sw: 0 });
      });
      SPL = [];
      for (let i = 0; i < 30; i++) SPL.push({ x: r(), d: 0.12 + pow(r(), 0.8) * 0.9, per: 0.6 + r() * 0.9, ph: r() * 5, big: r() < 0.25 ? 1 : 0 });
      GLINT = [];
      for (let i = 0; i < 20; i++) GLINT.push({ i: r(), ph: r() * TAU, f: 1.4 + r() * 2.6, sx: r() - 0.5 });
      BEADS = [];
      for (let i = 0; i < 36; i++) BEADS.push({ x: 0.05 + r() * 0.9, y: r() * 1.2, v: 0.025 + r() * 0.06, s: 0.5 + r() * 0.9, ph: r() * TAU });
      SPECK = [];
      for (let i = 0; i < 26; i++) SPECK.push({ x: r(), y: 0.05 + r() * 0.9, ph: r() * TAU, f: 0.4 + r() * 0.9 });
      MYC = [];
      for (let i = 0; i < 10; i++) MYC.push({ x: 0.06 + 0.88 * (i + r() * 0.8) / 10, y0: r(), len: 0.32 + r() * 0.34, amp: 0.012 + r() * 0.03, f: 0.9 + r() * 1.3, ph: r() * TAU, sp: 0.007 + r() * 0.011, al: 0.08 + r() * 0.07, w: 0.8 + r() * 0.8 });
      SHAFT = [
        { a: 0.30, w: 0.22, al: 0.24, ph: 0.2, sp: 0.22 }, { a: 0.52, w: 0.15, al: 0.2, ph: 1.9, sp: 0.17 },
        { a: 0.74, w: 0.26, al: 0.17, ph: 3.3, sp: 0.2 }, { a: 0.95, w: 0.13, al: 0.15, ph: 4.4, sp: 0.15 },
        { a: 0.12, w: 0.11, al: 0.18, ph: 5.1, sp: 0.19 },
      ];
      CURT = [];
      for (let i = 0; i < 6; i++) CURT.push({ x: r(), k: i % 3, al: 0.16 + r() * 0.12, sp: (r() - 0.5) * 0.012, lay: i < 2 ? 0 : i < 4 ? 1 : 2 });
      BOKEH = [];
      for (let i = 0; i < 16; i++) BOKEH.push({ x: r(), y: r(), r: 0.07 + r() * 0.15, hue: 80 + r() * 70, al: 0.07 + r() * 0.1, ph: r() * 5 });
      CLOUDB = [];
      for (let i = 0; i < 9; i++) CLOUDB.push({ x: r(), y: 0.08 + r() * 0.3, w: 0.5 + r() * 0.7, h: 0.1 + r() * 0.1, a: 0.5 + r() * 0.5 });
    },

    resize(env) {
      const { W, H, S } = env;
      const fh = 38, fw = clamp(Math.round(fh * W / H), 36, 80);
      const c = u.canvas(fw, fh);
      const mw = ceil(W / 4), mh = ceil(H / 4), mc = u.canvas(mw, mh), mx = mc.getContext('2d');
      mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high';
      FOG = { c, x: c.getContext('2d'), w: fw, h: fh, img: c.getContext('2d').createImageData(fw, fh), m: mc, mx, mw, mh };
      const k = clamp((W / H) / (16 / 9), 0.55, 2.0);
      RAIN.forEach((o, li) => { o.n = min(o.x.length, floor(RAINDEF[li].n * k)); });
      LY = {};
      // on tall screens the far ranges are drawn taller and the valley floor narrower, so no flat horizon line shows
      const pk = clamp(H / S - 1, 0, 1.2), ampM = 1 + 0.8 * pk, swM = 1 - 0.45 * pk;
      const mk = (d) => buildRidge(env, Object.assign(d, { amp: d.amp * ampM, sw: d.sw * swM }));
      LY.L0 = mk({ cb: 0.49, amp: 0.21, f: 1.35, seed: 11, floor: 0.548, sw: 0.3, sx: 0.0, top: '#7a90ad', mid: '#a6b7cb', haze: '#c4cfda', span: 0.2, p: 0.02, rim: 1, trees: 0 });
      LY.L1 = mk({ cb: 0.525, amp: 0.17, f: 1.9, seed: 23, floor: 0.58, sw: 0.34, sx: 0.08, top: '#5a7595', mid: '#8aa1ba', haze: '#b2c1d0', span: 0.17, p: 0.035, rim: 0.9, trees: 0 });
      LY.L2 = mk({ cb: 0.565, amp: 0.13, f: 2.6, seed: 37, floor: 0.615, sw: 0.38, sx: -0.06, top: '#3f6483', mid: '#7494ab', haze: '#a2b6c6', span: 0.15, p: 0.06, rim: 0.8, trees: 1100, ts: 0.0052, tdark: '#6a8ca0', tlite: '#7fa0b0' });
      LY.V = buildValley(env);
      LY.W1 = buildWing(env, { yTop: 0.64, rise: 0.09, amp: 0.05, f: 2.6, seed: 51, hw0: 0.13, hwB: 0.62, pad: 0.38, top: '#4f7f77', mid: '#386a5f', bot: '#285445', tdark: '#2a5a4e', tlite: '#6a9c88', ts: 0.0086, tg: 0.5, round: 0.35, haze: 0.5, p: 0.16, rim: 0.9, solid: '#285445' });
      LY.W2 = buildWing(env, { yTop: 0.77, rise: 0.1, amp: 0.05, f: 2.2, seed: 67, hw0: 0.19, hwB: 0.6, pad: 0.38, top: '#356248', mid: '#27523a', bot: '#193b29', tdark: '#1b4430', tlite: '#4f8858', ts: 0.0135, tg: 0.5, round: 0.45, haze: 0.28, p: 0.24, rim: 0.7, solid: '#193b29' });
      LY.T = buildTreeTops(env);
      SOIL = buildSoil(env); FLAT = buildFlat(env);
      SKY = buildSky(env); CLOUDS = buildClouds(env); RB = buildRainbow(env); SH = buildShafts(env); CUR = buildCurtains(env);
      MIST = buildMist(env); FLARE = buildFlare(env); LEAFS = buildLeaves(env);
      for (const b of BOKEH) b.spr = u.glowSprite(b.hue, 60, 52);
    },

    fx(T, L) {
      return { bloom: u.keys([[98, 0.28], [102, 0.3], [105, 0.2], [111, 0.16], [116, 0.3], [122, 0.5], [126, 0.5]], T) + 0.2 * flashAmt(T) };
    },

    render(g, T, L, env) {
      const { W, H, S } = env;
      ensureTables();
      const Z = Zf(T);
      const hy = heroY(T) * H, hx = W * 0.5 + heroXoff(T) * S, hr = heroR(T) * S;

      g.fillStyle = '#34465f'; g.fillRect(0, 0, W, H);

      if (T > 101.9) {
        // the world starts a little low and rises into place as the cloud base lifts (no wipe: the land climbs out of the mist)
        const Zl = Z - 0.55 * (1 - u.smootherstep(103.0, 107.2, T));
        if (T < 114.8) {
          // the cloud still hides the upper part of the land: don't paint what the fog will cover anyway
          const cy0 = max(0, (fogEdge(T) - 0.46) * H);
          if (cy0 > 4) { g.save(); g.beginPath(); g.rect(0, cy0, W, H - cy0); g.clip(); }
          drawLandscape(g, T, env, Zl);
          if (cy0 > 4) g.restore();
        }
        else if (T < 119.8) drawLy(g, LY.T, Z, env);
        if (T > 110 && T < 119.5) drawCanopy(g, T, env, Z, hx, hy, 0);
      }
      if (T > 115.2) drawSoil(g, T, env, Z, hx, hy);

      if (fogEdge(T) > -0.45) drawFog(g, T, env, hx, hy);

      const aRainIn = lerp(0.1, 1, u.smootherstep(100.8, 105.0, T));
      drawRainLayer(g, T, env, 1, aRainIn * (1 - ss(116.4, 118.4, T)));

      // the big near leaves sweep by behind the drop (it is the one thing that must never be hidden)
      if (T > 111 && T < 119.5) drawCanopy(g, T, env, Z, hx, hy, 1);
      drawHero(g, T, env, hx, hy, hr);
      drawRainLayer(g, T, env, 2, aRainIn * (1 - ss(116.8, 119, T)));

      if (T > 117) drawUnder(g, T, env, hx, hy);
    },
  });

  /* ------------------------------------------------------------------ drawing */
  function drawLy(g, ly, Z, env) {
    const { W, H, S } = env;
    const sc = 1 + max(0, Z) * (ly.g || 0), shift = Z * ly.p * H;
    if (!(ly.g > 0)) {
      const y0 = round(ly.ay - shift - ly.row), bot = y0 + ly.h;
      if (bot <= 0) { if (ly.solid) { g.fillStyle = ly.solid; g.fillRect(0, 0, W, H); } return; }
      if (y0 >= H) return;
      g.drawImage(ly.c, 0, y0, W, ly.h);
      if (ly.solid && bot < H) { g.fillStyle = ly.solid; g.fillRect(0, bot - 1, W, H - bot + 1); }
      return;
    }
    // the near layers also swell a little as the camera falls toward them (bilinear, so only used where it matters)
    const x0 = W * 0.5 * (1 - sc), y0 = ly.ay - shift - ly.row * sc, bot = y0 + ly.h * sc;
    if (bot <= 0) { if (ly.solid) { g.fillStyle = ly.solid; g.fillRect(0, 0, W, H); } return; }
    if (y0 >= H) return;
    g.imageSmoothingEnabled = true;
    g.drawImage(ly.c, x0, y0, W * sc, ly.h * sc);
    g.imageSmoothingEnabled = true;
    if (ly.solid && bot < H) { g.fillStyle = ly.solid; g.fillRect(0, bot - 1, W, H - bot + 1); }
  }
  const layerXY = (ly, Z, env, px, py) => { const sc = 1 + Z * (ly.g || 0); return [env.W * 0.5 + (px - env.W * 0.5) * sc, ly.ay - Z * ly.p * env.H + (py - ly.vTop) * sc]; };

  function drawSky(g, T, env, Z) {
    const { W, H, S } = env;
    const sh = round(max(0, Z) * 0.012 * H);
    g.drawImage(SKY.c, 0, -sh, W, SKY.h);
    g.fillStyle = '#bdb3a4'; g.fillRect(0, SKY.h - sh - 1, W, H - SKY.h + sh + 2);
    g.save(); g.globalCompositeOperation = 'lighter';
    glowE(g, W * 0.9, H * 0.488 - sh, S * 0.4, S * 0.06, 38, 90, 60, 0.14 * (0.5 + 0.5 * sin(T * 0.7)));
    g.restore();
    const off = round(u.wrap(T * 0.004 * CLOUDS.P, 0, CLOUDS.P)), cy = round(H * 0.04 - sh * 3);
    g.drawImage(CLOUDS.c, -off, cy, CLOUDS.P, CLOUDS.h);
    if (CLOUDS.P - off < W) g.drawImage(CLOUDS.c, CLOUDS.P - off, cy, CLOUDS.P, CLOUDS.h);
  }

  function drawSea(g, T, env, Z) {
    const { W, H, S } = env;
    const y0 = round(0.5 * H - Z * 0.008 * H), y1 = round(0.545 * H - Z * 0.008 * H);
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#d7d9d4'); gr.addColorStop(0.2, '#b4c6d2'); gr.addColorStop(1, '#7d9bb2');
    g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0);
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff6dc';
    for (let i = 0; i < 14; i++) {
      const hsh = u.hash(i * 7 + 3);
      const x = W * (0.5 + 0.25 * u.hash(i * 3 + 1)), y = y0 + (y1 - y0) * (0.1 + 0.8 * hsh);
      g.globalAlpha = 0.5 * pow(0.5 + 0.5 * sin(T * (1.3 + hsh * 2.5) + i * 2.1), 6);
      g.fillRect(round(x), round(y), S * (0.01 + 0.025 * hsh), max(1, S * 0.0016));
    }
    g.restore();
  }

  function drawRainbow(g, T, env, Z) {
    const a = ss(107.4, 111.2, T) * (1 - ss(112.6, 114.6, T));
    if (a < 0.004) return;
    g.globalAlpha = a;
    g.drawImage(RB.c, RB.left, RB.top - round(Z * 0.012 * env.H), RB.w, RB.h);
    g.globalAlpha = 1;
  }

  function drawShafts(g, T, env, Z) {
    const a0 = ss(103.6, 105.4, T) * (1 - ss(111.0, 113.6, T));
    if (a0 < 0.004) return;
    const burst = 1 + 1.3 * exp(-pow((T - 104.5) / 0.55, 2));
    const m = 0.5 + 0.5 * sin(T * 0.21);
    g.save(); g.globalCompositeOperation = 'lighter';
    const dy = -round(Z * 0.012 * env.H);
    g.globalAlpha = min(1, a0 * burst * (0.62 + 0.38 * m) * 1.6); g.drawImage(SH.c, round(sin(T * 0.19) * env.W * 0.004), SH.top + dy);
    g.restore();
  }

  function drawCurtains(g, T, env, Z, lay) {
    const { W, H, S } = env;
    const a0 = ss(104.2, 106.2, T) * (1 - ss(112, 114, T));
    if (a0 < 0.004) return;
    const shift = Z * (lay === 0 ? 0.05 : 0.2) * H;
    for (const c of CURT) {
      if (c.lay !== lay) continue;
      const q = CUR[c.k];
      const x = round(u.wrap(c.x + T * c.sp, -0.4, 1.4) * W - q.w * 0.5);
      const y = round((lay === 0 ? 0.2 : 0.3 + lay * 0.08) * H - shift);
      g.globalAlpha = c.al * a0 * (lay === 0 ? 1 : 1.4);
      g.drawImage(q.c, x, y, q.w, q.h);
    }
    g.globalAlpha = 1;
  }

  function drawMist(g, T, env, Z, a0) {
    const { W, H, S } = env;
    if (a0 < 0.01) return;
    for (const m of MIST) {
      const off = round(u.wrap(T * m.sp * m.P / 1.0, 0, m.P)), y = round(m.y * H - Z * m.p * H);
      g.globalAlpha = a0 * 0.8;
      g.drawImage(m.c, -off, y, m.P, m.h); if (m.P - off < W) g.drawImage(m.c, m.P - off, y, m.P, m.h);
    }
    g.globalAlpha = 1;
  }

  function drawValleyLife(g, T, env, Z) {
    const { W, H, S } = env;
    const V = LY.V;
    const a0 = ss(104, 106, T) * (1 - ss(110.5, 113, T));
    if (a0 < 0.01) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    if (RIVER) {
      const sp = u.glowSprite(45, 70, 88), pts = RIVER.pts;
      for (const gl of GLINT) {
        const idx = floor((0.1 + gl.i * 0.9) * (pts.length - 1)), p = pts[idx];
        const tw = pow(0.5 + 0.5 * sin(T * gl.f + gl.ph), 5);
        if (tw < 0.05) continue;
        const [sx, sy] = layerXY(V, Z, env, p[0] + gl.sx * p[2], p[1]);
        if (sy < 0 || sy > H) continue;
        const sz = S * 0.005 + p[2] * 0.9;
        g.globalAlpha = tw * 0.9 * a0;
        g.drawImage(sp, sx - sz * 2.5, sy - sz * 0.5, sz * 5, sz);
      }
    }
    const ring = u.glowSprite(205, 40, 85, 'ring');
    for (const sp of SPL) {
      const ph = u.wrap(T / sp.per + sp.ph, 0, 1);
      const yy = 0.5 * H + sp.d * 0.5 * H;
      const px = sp.x * W, rr = (0.004 + 0.02 * sp.d) * S * (0.4 + ph * 1.6) * (sp.big ? 1.6 : 1);
      const [sx, sy] = layerXY(V, Z, env, px, yy);
      if (sy < H * 0.5 || sy > H + 20) continue;
      g.globalAlpha = (1 - ph) * (1 - ph) * 0.55 * a0;
      g.drawImage(ring, sx - rr, sy - rr * 0.32, rr * 2, rr * 0.64);
    }
    g.restore();
  }

  function drawLandscape(g, T, env, Z) {
    const { W, H, S } = env;
    drawSky(g, T, env, Z);
    drawSea(g, T, env, Z);
    drawLy(g, LY.V, Z, env);
    drawLy(g, LY.L0, Z, env);
    drawLy(g, LY.L1, Z, env);
    drawLy(g, LY.L2, Z, env);
    drawRainbow(g, T, env, Z);
    drawCurtains(g, T, env, Z, 0);
    drawRainLayer(g, T, env, 0, u.smootherstep(102.4, 106, T) * (1 - ss(111, 113, T)));
    drawValleyLife(g, T, env, Z);
    drawMist(g, T, env, Z, ss(104, 106, T) * (1 - ss(111, 113.5, T)));
    drawLy(g, LY.W1, Z, env);
    drawCurtains(g, T, env, Z, 1);
    drawLy(g, LY.W2, Z, env);
    drawCurtains(g, T, env, Z, 2);
    {
      const wa = ss(104.0, 105.6, T) * (1 - ss(110.5, 113, T));
      if (wa > 0.01) {
        const q = CUR.warm;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * wa * (0.8 + 0.2 * sin(T * 0.7));
        g.drawImage(q.c, round(W * 0.8 - q.w * 0.5 + sin(T * 0.23) * W * 0.02), round(0.4 * H - Z * 0.2 * H), q.w, q.h);
        g.restore();
      }
    }
    drawShafts(g, T, env, Z);
    drawLy(g, LY.T, Z, env);
    // residue of cloud: a veil of mist hugging the cloud base and thinning below it; it clears slowly as the camera leaves the
    // cloud, so the land emerges out of it rather than being uncovered
    const va = ss(102.8, 103.9, T) * (1 - ss(104.3, 107.8, T));
    if (va > 0.004) {
      const ey = fogEdge(T) * H;
      bandFill(g, W, H, ey - 0.34 * H, ey + 0.7 * H, 22, VEIL, va);
    }
    // the warm flare under the cloud base swells in over ~1 s and fades more gently
    const fl = exp(-pow((T - 104.5) / (T < 104.5 ? 0.9 : 0.62), 2));
    if (fl > 0.01) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.24 * fl;
      const fx0 = floor(W * 0.25), kx = FLARE.c.width / W;       // the glow is gone by 25 % of the width: skip those pixels
      g.drawImage(FLARE.c, fx0 * kx, 0, FLARE.c.width - fx0 * kx, FLARE.c.height, fx0, FLARE.top, W - fx0, FLARE.h);
      g.restore();
    }
  }

  function drawHero(g, T, env, hx, hy, hr) {
    const { S } = env;
    const sp = vcam(T) / 0.78;
    const hue = heroHue(T);
    if (sp > 0.01) {
      const tl = S * (0.08 + 0.3 * sp);
      g.save(); g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55 * sp;
      g.drawImage(u.glowSprite(hue, 60, 78), hx - hr * 1.6, hy - tl - hr * 2, hr * 3.2, tl + hr * 2);
      g.restore();
    }
    // in the bright rain-lit sky the halo is kept a little lower so the drop itself stays readable (full strength at both handoffs)
    const glow = 1 - 0.36 * ss(104, 106, T) * (1 - ss(110, 113, T));
    hero.draw(g, hx, hy, hr, { hue, form: 'drop', pulse: heroPulse(T), a: 1, angle: 0, glow });
  }

  /* ---- canopy */
  const heroXoffAt = (t) => heroXoff(t);
  function drawCanopy(g, T, env, Z, hx, hy, pass) {
    const { W, H, S } = env;
    const hy0 = 0.322 * H, tall = H / S > 1.25;
    const crestY = LY.T.ay - Z * LY.T.p * H - 0.05 * S;
    const fade = 1 - ss(117.4, 119.2, T);
    if (fade < 0.01) return;
    if (pass === 0) {
      const a0 = ss(111, 113.4, T) * fade;
      g.globalAlpha = 0.55 * a0;
      bandFill(g, W, H, 0, H, 28, CANOPY_TINT, 1);
      g.save(); g.globalCompositeOperation = 'lighter';
      const oy = Z * 0.35 * H, ba = min(1, a0 * (0.8 + 0.2 * sin(T * 0.6))) * 1.6;
      for (const b of BOKEH) {
        const rr = b.r * S * 0.7, by = u.wrap(b.y * 1.6 * H - oy, -rr, 1.6 * H - rr);
        if (by > H + rr) continue;
        g.globalAlpha = min(1, b.al * ba);
        g.drawImage(b.spr, b.x * W - rr, by - rr, rr * 2, rr * 2);
      }
      g.restore();
      g.globalAlpha = 1;
    }
    for (const c of CL) {
      if ((c.layer === 2) !== (pass === 1)) continue;
      if (c.extra && !tall) continue;
      const y = hy0 + (c.zc - Z) * c.p * H + c.dy * S;
      const set = c.layer === 0 ? LEAFS.back : c.layer === 1 ? LEAFS.mid : LEAFS.front;
      const spr = set[c.cls][c.v];
      const half = spr.dw * 0.5;
      if (y < -half || y > H + half) continue;
      let x = c.x * W + c.sw * S * 0.008 * sin(T * 1.1 + c.ph), yy = y;
      if (c.touch >= 0) {
        const tc = TOUCH[c.touch];
        x = W * 0.5 + (heroXoffAt(tc.t) + tc.dx) * S;
        const tau = T - tc.t;
        if (tau > 0) yy += S * 0.012 * exp(-tau * 2.6) * sin(tau * 13);
      }
      let al = fade;
      if (c.layer < 2) al *= ss(crestY - 0.12 * H, crestY + 0.05 * H, yy);
      if (al < 0.01) continue;
      g.globalAlpha = al;
      g.drawImage(spr, round(x - half), round(yy - half), spr.dw, spr.dw);
    }
    g.globalAlpha = 1;
    if (pass === 0) drawTouches(g, T, env, hx, hy);
  }

  function drawTouches(g, T, env, hx, hy) {
    const { W, H, S } = env;
    const ring = u.glowSprite(170, 40, 88, 'ring');
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < TOUCH.length; k++) {
      const tau = T - TOUCH[k].t;
      if (tau < -0.05 || tau > 1.7) continue;
      const cxr = W * 0.5 + (heroXoffAt(TOUCH[k].t) + TOUCH[k].dx) * S, cyr = H * 0.322 + S * 0.012;
      for (let m = 0; m < 3; m++) {
        const t2 = tau - m * 0.22;
        if (t2 < 0 || t2 > 1.35) continue;
        const rr = S * (0.012 + 0.075 * pow(t2, 0.65));
        g.globalAlpha = pow(1 - t2 / 1.35, 1.6) * (m === 0 ? 0.8 : 0.5);
        g.drawImage(ring, cxr - rr, cyr - rr * 0.36, rr * 2, rr * 0.72);
      }
      if (tau > 0 && tau < 0.9) {
        const sp = u.glowSprite(190, 50, 90);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * PI + u.hash(k * 31 + i) * 0.3, v = (0.12 + 0.2 * u.hash(k * 17 + i * 5)) * S;
          const px = cxr + cos(a + PI) * v * tau * 1.4 * (i % 2 ? 1 : -1) * 0.8, py = cyr - sin(a) * v * tau * 1.6 + 0.6 * S * tau * tau;
          const sz = S * 0.006;
          g.globalAlpha = (1 - tau / 0.9) * 0.9;
          g.drawImage(sp, px - sz, py - sz, sz * 2, sz * 2);
        }
      }
    }
    g.restore();
  }

  /* ---- soil */
  function drawSoil(g, T, env, Z, hx, hy) {
    const { W, H, S } = env;
    const surf = groundSurfH(T) * H;
    if (surf > H + 6) return;
    // a soft shadow gathers over the leaves just above the ground line (no hard seam between canopy and earth)
    {
      const y0 = surf - 0.22 * H;
      if (y0 < H) {
        const gr = g.createLinearGradient(0, y0, 0, surf + 2);
        gr.addColorStop(0, 'rgba(7,14,9,0)'); gr.addColorStop(0.6, 'rgba(7,14,9,0.34)'); gr.addColorStop(1, 'rgba(10,12,8,0.62)');
        g.fillStyle = gr; g.fillRect(0, max(0, y0), W, min(H, surf + 2) - max(0, y0));
      }
    }
    const yTop = round(surf - SOIL.rs), yE = yTop + SOIL.rEnd;
    if (yE > 0) {
      // blit only the visible rows of the tall strata strip (1:1, integer offset)
      const sy = max(0, -yTop), dy = max(0, yTop), hh = min(SOIL.full - sy, H - dy);
      if (hh > 0) g.drawImage(SOIL.c, 0, sy, W, hh, 0, dy, W, hh);
    }
    if (yE < H) {
      bandFill(g, W, H, yE, yE + H, 20, FLAT_EARTH, 1);
      drawFlat(g, T, env, yE);
    }
    const hg = ss(T_SURF - 0.1, T_SURF + 0.6, T);
    g.save(); g.globalCompositeOperation = 'lighter';
    u.glow(g, hx, hy, S * 0.5, 200, 55, 55, 0.075 * hg);
    u.glow(g, hx, hy, S * 0.22, 195, 50, 70, 0.09 * hg);
    g.restore();
  }

  // the flat deep-earth world: fine specks, a few pale roots and the dim, unlit seed (y relative to the top of the region)
  function drawFlat(g, T, env, yE) {
    const { W, H, S } = env;
    const F = FLAT, bks = F.bk;
    for (let b = 0; b < bks.length; b++) {
      const k = bks[b];
      g.globalAlpha = 0.86 + 0.14 * sin(T * 0.55 + b * 1.3);
      g.fillStyle = k.fill;
      g.beginPath();
      for (let i = 0; i < k.x.length; i++) { const yy = yE + k.y[i]; if (yy > -3 && yy < H + 3) g.rect(k.x[i], yy, k.s[i], k.s[i]); }
      g.fill();
    }
    g.globalAlpha = 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pts of F.roots) {
      const n = pts.length - 1;
      if (yE + pts[0][1] > H + 4) continue;
      for (let q = 0; q < 4; q++) {
        const i0 = floor(q * n / 4), i1 = floor((q + 1) * n / 4), t = (q + 0.5) / 4;
        g.strokeStyle = `rgba(222,208,170,${0.2 * (1 - t * 0.6)})`; g.lineWidth = max(0.8, 1.7 * F.sc * (1 - t * 0.7));
        g.beginPath(); g.moveTo(pts[i0][0], yE + pts[i0][1]);
        for (let i = i0 + 1; i <= i1; i++) g.lineTo(pts[i][0], yE + pts[i][1]);
        g.stroke();
      }
    }
    // the seed
    const sy = yE + F.seedY, rx = F.rx, ry = F.ry;
    if (sy < H + ry * 2) {
      g.save(); g.translate(W * 0.5, sy); g.rotate(0.12);
      const sg = g.createRadialGradient(-rx * 0.35, -ry * 0.4, ry * 0.1, 0, 0, ry * 1.1);
      sg.addColorStop(0, '#523d1f'); sg.addColorStop(0.55, '#36281a'); sg.addColorStop(1, '#1b1209');
      g.fillStyle = sg; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(190,160,100,0.12)'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(0, 0, rx * 0.98, ry * 0.98, 0, PI * 1.05, PI * 1.6); g.stroke();
      g.strokeStyle = 'rgba(20,12,6,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -ry * 0.95); g.quadraticCurveTo(rx * 0.3, 0, 0, ry * 0.95); g.stroke();
      g.restore();
    }
  }

  function drawUnder(g, T, env, hx, hy) {
    const { W, H, S } = env;
    const surf = groundSurfH(T) * H, yE = surf - RS_H * H + SOIL.rEnd;
    const tau = T - T_SURF;
    g.save(); g.globalCompositeOperation = 'lighter';
    if (tau > -0.2 && tau < 1.8) {
      const ring = u.glowSprite(185, 55, 85, 'ring');
      for (let m = 0; m < 3; m++) {
        const t2 = tau - m * 0.16;
        if (t2 < 0 || t2 > 1.4) continue;
        const rr = S * (0.02 + 0.2 * pow(t2, 0.6));
        g.globalAlpha = pow(1 - t2 / 1.4, 1.5) * 0.7;
        g.drawImage(ring, hx - rr, surf - rr * 0.22, rr * 2, rr * 0.44);
      }
      u.glow(g, hx, surf, S * 0.16, 195, 60, 80, 0.5 * exp(-pow(tau / 0.3, 2)));
      // mud-splash glints thrown up from the contact
      if (tau > 0 && tau < 1.0) {
        const sp = u.glowSprite(45, 55, 82);
        for (let i = 0; i < 9; i++) {
          const dir = (i % 2 ? 1 : -1), v = (0.1 + 0.2 * u.hash(i * 13 + 5)) * S, up = (0.18 + 0.22 * u.hash(i * 7 + 2)) * S;
          const px = hx + dir * v * tau * (0.7 + 0.3 * u.hash(i * 3)), py = surf - up * tau + 0.55 * S * tau * tau;
          const sz = S * (0.0045 + 0.004 * u.hash(i * 11));
          g.globalAlpha = pow(1 - tau, 1.3) * 0.85;
          g.drawImage(sp, px - sz, py - sz, sz * 2, sz * 2);
        }
      }
    }
    const ba = ss(117.8, 119.4, T) * (0.42 + 0.58 * (1 - ss(121.4, 124.4, T)));
    if (ba > 0.01) {
      const bs = beadSprite(), tl = u.glowSprite(200, 50, 80);
      for (const b of BEADS) {
        const y = u.wrap(b.y + (T - 118) * b.v, -0.1, 1.15) * H;
        const x = b.x * W + sin(T * 0.4 + b.ph) * S * 0.01;
        const dd = sqrt(((x - hx) / S) ** 2 + ((y - hy) / S) ** 2);
        const a = ba * (0.3 + 0.55 * exp(-dd * 1.8)) * (0.65 + 0.35 * sin(T * 1.7 + b.ph * 3));
        const sz = S * 0.0065 * b.s;
        g.globalAlpha = a * 0.5;
        g.drawImage(tl, x - sz * 0.9, y - sz * 7, sz * 1.8, sz * 7.5);
        g.globalAlpha = a;
        g.drawImage(bs, x - sz, y - sz, sz * 2, sz * 2);
      }
    }
    // pale mycelium filaments drifting slowly upward
    const ma = ss(119.4, 122.6, T);
    if (ma > 0.01) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const m of MYC) {
        const len = m.len * H, yc = u.wrap(m.y0 - T * m.sp * S / H, -m.len, 1.1) * H;
        if (yc > H || yc + len < 0) continue;
        const gr = g.createLinearGradient(0, yc, 0, yc + len), a = m.al * ma * (0.75 + 0.25 * sin(T * 0.7 + m.ph));
        gr.addColorStop(0, 'rgba(226,214,178,0)'); gr.addColorStop(0.35, `rgba(226,214,178,${a})`); gr.addColorStop(0.7, `rgba(226,214,178,${a * 0.8})`); gr.addColorStop(1, 'rgba(226,214,178,0)');
        g.strokeStyle = gr; g.lineWidth = m.w * max(1, S / 720);
        g.beginPath();
        for (let j = 0; j <= 14; j++) {
          const t = j / 14, xx = m.x * W + m.amp * S * sin(t * m.f * TAU * 0.5 + m.ph + T * 0.22) + 0.03 * S * (t - 0.5) * sin(m.ph * 3);
          j ? g.lineTo(xx, yc + t * len) : g.moveTo(xx, yc + t * len);
        }
        g.stroke();
      }
    }
    const sa = ss(120.5, 122.2, T);
    if (sa > 0.01) {
      const sp = u.glowSprite(35, 40, 70);
      for (const s of SPECK) {
        const tw = pow(0.5 + 0.5 * sin(T * s.f + s.ph), 4);
        const sz = S * 0.005;
        g.globalAlpha = sa * 0.5 * tw;
        g.drawImage(sp, s.x * W - sz, s.y * H - sz, sz * 2, sz * 2);
      }
    }
    // a soft warm breath of light gathers around the (still unlit) seed, so the beat the caption names can be seen
    {
      const sx = W * 0.5, sy = yE + FLAT.seedY, breathe = 0.5 + 0.5 * sin(T * 1.05 - 0.6);
      const ga = ss(120.4, 123.0, T);
      if (ga > 0.01 && sy < H + S * 0.3) {
        u.glow(g, sx, sy, S * 0.26, 38, 60, 52, ga * (0.07 + 0.075 * breathe));
        u.glow(g, sx, sy, S * 0.075, 42, 70, 62, ga * (0.07 + 0.06 * breathe));
        // faint rim light on the seed's upper edge
        g.globalAlpha = ga * (0.18 + 0.12 * breathe);
        g.strokeStyle = 'rgba(236,196,120,1)'; g.lineWidth = max(1, S * 0.0016);
        g.beginPath(); g.ellipse(sx, sy, FLAT.rx * 1.04, FLAT.ry * 1.04, 0.12, PI * 1.05, PI * 1.7); g.stroke();
      }
    }
    // water travelling down the thin roots: tiny pulses of light
    const ra = ss(119, 120.6, T) * (1 - ss(124, 126, T));
    if (ra > 0.01) {
      const sp = u.glowSprite(190, 50, 80);
      for (let k = 0; k < FLAT.roots.length; k++) {
        const pts = FLAT.roots[k];
        for (let j = 0; j < 2; j++) {
          const t = u.wrap(T * (0.045 + 0.012 * k) + j * 0.5 + k * 0.23, 0, 1);
          const f = t * (pts.length - 1), i = min(pts.length - 2, floor(f)), q = f - i;
          const px = lerp(pts[i][0], pts[i + 1][0], q), py = yE + lerp(pts[i][1], pts[i + 1][1], q);
          const sz = S * 0.007 * (1 - 0.4 * t);
          g.globalAlpha = ra * 0.7 * sin(PI * t);
          g.drawImage(sp, px - sz, py - sz, sz * 2, sz * 2);
        }
      }
    }
    g.restore();
  }
})();
