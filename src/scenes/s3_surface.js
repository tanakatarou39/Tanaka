/* s3_surface (T 44-76) -- 夜明け.  Bright turquoise water, god-rays and caustics, the silver underside of the
 * surface with its Snell window, the slow-motion crown splash at T=60.5, a dawn sea with a glitter path, then the
 * drop dissolves into rising vapour while the camera tilts up into the open sky (handoff B3 -> s4_sky).
 * Everything is a pure function of T: analytic particles, low-res fields rewritten each frame, no carried state.
 */
(function () {
  'use strict';
  const { util: u, hero } = Anim;
  const TAU = Math.PI * 2;
  const K = u.keys, cl = u.clamp, ss = u.smoothstep, sss = u.smootherstep, lerp = u.lerp;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, sqrt = Math.sqrt, pow = Math.pow, exp = Math.exp;
  const T_BREAK = 60.5;
  const SLOW = 0.62; // slow-motion factor of the splash clock

  /* ------------------------------------------------------------------ colour helpers */
  const rgb = u.rgb;
  const mk = (stops, n = 64) => {
    const out = new Uint8ClampedArray(n * 3);
    const st = stops.map(([p, c]) => [p, typeof c === 'string' ? rgb(c) : c]);
    for (let i = 0; i < n; i++) {
      const p = i / (n - 1);
      let k = 0;
      while (k < st.length - 2 && p > st[k + 1][0]) k++;
      const a = st[k], b = st[k + 1];
      const t = cl((p - a[0]) / (b[0] - a[0]));
      for (let c = 0; c < 3; c++) out[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * t;
    }
    return out;
  };
  // refracted sky seen through the Snell window: 0 = zenith ... 1 = horizon
  const LUT_WINDOW = mk([[0, '#2c3a86'], [0.3, '#5a63ae'], [0.55, '#b98bb8'], [0.75, '#f4a7a2'], [0.9, '#ffd09a'], [1, '#fff0cc']]);
  // mirror (total internal reflection of the water body): 0 = grazing/horizon ... 1 = steep (dark)
  const LUT_MIRROR = mk([[0, '#f4fffb'], [0.1, '#c2f4ef'], [0.35, '#5fcbd3'], [0.7, '#2796ac'], [1, '#146f93']]);
  // dawn sea: by depression below the horizon (0 = at horizon, 1 = near)
  const LUT_SEA = mk([[0, '#ffd6a0'], [0.1, '#f7c0a0'], [0.28, '#c996a8'], [0.55, '#5f79a8'], [0.8, '#2d6890'], [1, '#1c5f86']]);

  /* ------------------------------------------------------------------ story curves (all f(T)) */
  const heroKeys = [[44, 0.56], [52, 0.56], [56, 0.50], [58.5, 0.455], [60.5, 0.42], [64, 0.40], [70, 0.44], [72, 0.48], [76, 0.48]];
  const heroY = (T) => K(heroKeys, T, 'spline');
  const heroR = (T) => K([[44, 0.014], [58, 0.014], [60.6, 0.0175], [64, 0.0175], [72, 0.016], [76, 0.016]], T, 'smooth');
  const heroWarm = (T) => ss(62.5, 68.5, T); // 0 cyan -> 1 gold
  // camera pitch while underwater (deg, + = looking up)
  const pitchKeys = [[44, -52], [50, -46], [53, -37], [56, -11], [58.5, 22], [60.5, 52], [62, 58]];
  const pitch = (T) => K(pitchKeys, T, 'spline');
  // world drift (in S units, downward) as the camera rises; speed 0.05 S/s at the start, quickening towards the surface
  const sink = (T) => 0.05 * (T - 44) + 0.4 * sss(52, 60.5, T);
  // above-water camera: horizon height (fraction of H), camera height factor, sun
  const yhKeys = [[60.5, 0.30], [61.5, 0.325], [63, 0.385], [65, 0.495], [67, 0.615], [69, 0.74], [71, 0.865], [72.5, 0.97], [74, 1.06], [76, 1.18]];
  const horizonY = (T) => K(yhKeys, T, 'spline');
  const camC = (T) => K([[60.5, 0.14], [64, 0.17], [68, 0.215], [72, 0.27], [76, 0.3]], T, 'smooth');
  const sunX = (T) => K([[60.5, 0.31], [66, 0.27], [72, 0.21], [76, 0.2]], T, 'smooth');
  const sunY = (T) => {
    const a = horizonY(T) - K([[60.5, 0.0], [64, 0.014], [68, 0.03], [72, 0.036]], T, 'smooth');
    return lerp(a, 0.95, ss(71, 73.5, T));
  };
  const above = (T) => ss(60.5, 60.9, T); // visibility of the above-water world
  const flashEnv = (T) => (T < T_BREAK ? sss(60.2, T_BREAK, T) : exp(-(T - T_BREAK) * 2.4));

  /* ------------------------------------------------------------------ static data */
  let snow = [], fish = [], bub = [], wake = [], shafts = [], gulls = [], stars = [], glints = [], strands = [], crown = [], motesA = [], motesB = [], sparkles = [];
  const MANTA = [
    { t0: 49.0, t1: 63.5, y: 0.27, size: 0.24, ph: 0.0, dir: 1, a: 0.62, par: 0.55 },
    { t0: 53.5, t1: 66.0, y: 0.5, size: 0.11, ph: 2.1, dir: 1, a: 0.4, par: 0.85 },
  ];
  // low-res fields
  const US = { c: null, g: null, img: null, w: 0, h: 0 }; // underside of the surface
  const SE = { c: null, g: null, img: null, w: 0, h: 0 }; // dawn sea
  const CA = { c: null, g: null, img: null, w: 0, h: 0 }; // caustics
  const SH = { c: null, g: null, k: 0.25 }; // low-res layer for the soft god-rays
  const BM = { c: null, g: null, k: 0.15 }; // low-res layer for the sunrise beams

  const mkField = (F, W, H, budget) => {
    const k = sqrt(budget / (W * H));
    F.w = Math.max(24, Math.round(W * k)); F.h = Math.max(24, Math.round(H * k));
    F.c = u.canvas(F.w, F.h); F.g = F.c.getContext('2d');
    F.img = F.g.createImageData(F.w, F.h);
  };

  /* ------------------------------------------------------------------ sprites */
  const shaftSprite = () => u.sprite('s3_shaft', 64, 256, (c, w, h) => {
    const gx = c.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.28, 'rgba(255,255,255,0.35)');
    gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(0.72, 'rgba(255,255,255,0.35)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gx; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    const gy = c.createLinearGradient(0, 0, 0, h);
    gy.addColorStop(0, 'rgba(0,0,0,0.9)'); gy.addColorStop(0.18, 'rgba(0,0,0,0.75)'); gy.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gy; c.fillRect(0, 0, w, h);
  });
  const bubbleSprite = () => u.sprite('s3_bubble', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, 'rgba(200,255,255,0.03)'); g.addColorStop(0.72, 'rgba(210,255,255,0.08)');
    g.addColorStop(0.9, 'rgba(235,255,255,0.75)'); g.addColorStop(1, 'rgba(235,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    const h = c.createRadialGradient(22, 21, 0, 22, 21, 8);
    h.addColorStop(0, 'rgba(255,255,255,0.95)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h; c.fillRect(0, 0, 64, 64);
  });
  const strandSprite = (rgbs) => u.sprite('s3_strand' + rgbs, 256, 32, (c, w, h) => {
    c.save(); c.translate(w / 2, h / 2); c.scale(1, h / w);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, `rgba(${rgbs},0.9)`); g.addColorStop(0.35, `rgba(${rgbs},0.45)`); g.addColorStop(0.7, `rgba(${rgbs},0.12)`); g.addColorStop(1, `rgba(${rgbs},0)`);
    c.fillStyle = g; c.fillRect(-w / 2, -w / 2, w, w); c.restore();
  });
  const glintSprite = () => u.sprite('s3_glint', 48, 10, (c, w, h) => {
    c.save(); c.translate(w / 2, h / 2); c.scale(1, h / w);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.3, 'rgba(255,235,190,0.6)'); g.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = g; c.fillRect(-w / 2, -w / 2, w, w); c.restore();
  });
  const beamSprite = () => u.sprite('s3_beam', 32, 256, (c, w, h) => {
    const gx = c.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gx; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    const gy = c.createLinearGradient(0, 0, 0, h);
    gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(0.5, 'rgba(0,0,0,0.45)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gy; c.fillRect(0, 0, w, h);
  });

  /* ------------------------------------------------------------------ scene */
  Anim.defineScene({
    id: 's3_surface',

    init() {
      const R = u.rng(4401);
      snow = Array.from({ length: 150 }, () => ({ x: R(), y: R(), z: 0.25 + R() * 0.95, ph: R() * TAU, h: 175 + R() * 25, w: R() }));
      fish = Array.from({ length: 46 }, () => ({ a: (R() - 0.5) * 0.9, b: (R() - 0.5) * 0.9, ph: R() * TAU, s: 0.7 + R() * 0.6, d: R() }));
      bub = Array.from({ length: 63 }, (_, i) => ({ col: i % 3, x: (R() - 0.5), y: R(), sp: 0.7 + R() * 0.6, r: 0.5 + R(), ph: R() * TAU }));
      wake = Array.from({ length: 34 }, () => ({ ph: R(), x: R() - 0.5, r: 0.5 + R(), sw: R() * TAU, sp: 0.6 + R() * 0.8 }));
      shafts = Array.from({ length: 11 }, (_, i) => ({ x: (i + R() * 0.8) / 11 - 0.12, w: 0.07 + R() * 0.2, ph: R() * TAU, big: i % 3 === 0 ? 1 : 0, sp: 0.15 + R() * 0.25, e: R() }));
      stars = Array.from({ length: 150 }, () => ({ x: R(), q: 0.45 + R() * 0.55, ph: R() * TAU, s: 0.5 + R() }));
      glints = Array.from({ length: 340 }, () => ({ u: (R() + R() + R() - 1.5) / 1.5, v: R(), ph: R() * TAU, f: 0.6 + R() * 1.6, s: 0.5 + R() }));
      sparkles = Array.from({ length: 120 }, () => ({ x: R(), v: R(), ph: R() * TAU, f: 0.5 + R() * 1.2 }));
      strands = Array.from({ length: 12 }, (_, i) => ({ x: R(), q: 0.08 + (i / 12) * 0.78 + R() * 0.05, w: 0.3 + R() * 0.55, h: 0.012 + R() * 0.02, sp: 0.004 + R() * 0.01, ph: R() * TAU, a: 0.35 + R() * 0.4 }));
      gulls = [
        { t0: 61.2, t1: 73.5, x0: -0.1, x1: 1.12, q: 0.46, s: 0.036, ph: 0.0, f: 2.3 },
        { t0: 62.0, t1: 75.0, x0: 1.12, x1: -0.1, q: 0.34, s: 0.026, ph: 1.7, f: 2.0 },
        { t0: 62.6, t1: 74.5, x0: -0.15, x1: 1.1, q: 0.6, s: 0.02, ph: 3.1, f: 2.6 },
        { t0: 63.4, t1: 76.0, x0: 1.1, x1: -0.1, q: 0.52, s: 0.03, ph: 4.4, f: 2.1 },
        { t0: 64.2, t1: 76.0, x0: -0.2, x1: 1.1, q: 0.22, s: 0.017, ph: 5.2, f: 2.8 },
      ];
      // crown of droplets: ballistic in splash-plane coordinates (units of S per slow-motion second)
      const C = u.rng(9001);
      crown = [];
      const NP = 24; // primary crown arcs
      for (let i = 0; i < NP; i++) {
        const th = ((i + (C() - 0.5) * 0.6) / NP) * TAU;
        crown.push({ th, r0: 0.018 + C() * 0.01, vh: 0.13 + C() * 0.14, vy: 0.55 + C() * 0.38, h0: 0.0, size: 1.0 + C() * 0.6, k: 0, hue: C() * 30 });
      }
      for (let i = 0; i < 46; i++) { // secondary droplets
        const th = C() * TAU;
        crown.push({ th, r0: 0.01 + C() * 0.04, vh: 0.05 + C() * 0.3, vy: 0.3 + C() * 0.9, h0: 0.0, size: 0.4 + C() * 0.5, k: 1, hue: C() * 40 });
      }
      for (let i = 0; i < 10; i++) { // central jet beads: follow the hero upward
        const th = C() * TAU;
        crown.push({ th, r0: C() * 0.012, vh: C() * 0.035, vy: 0.9 + C() * 0.55, h0: 0.0, size: 0.7 + C() * 0.6, k: 2, hue: C() * 30 });
      }
      for (const d of crown) {
        d.cx = cos(d.th); d.cz = sin(d.th);
        d.tl = (d.vy + sqrt(d.vy * d.vy + 2 * 0.95 * d.h0)) / 0.95; // landing time (slow-motion seconds)
      }
      const M = u.rng(777);
      motesA = Array.from({ length: 110 }, () => ({ ph: M(), dx: M() - 0.5, sp: 0.55 + M() * 0.9, s: 0.5 + M(), sw: M() * TAU, h: 36 + M() * 18 }));
      motesB = Array.from({ length: 150 }, () => ({ x: M(), y: M(), z: 0.3 + M() * 0.9, ph: M() * TAU, h: 36 + M() * 16 }));
    },

    resize(env) {
      const { W, H } = env;
      mkField(US, W, H, 8000);
      mkField(SE, W, H, 5200);
      mkField(CA, W, H, 5000);
      for (const L of [SH, BM]) { L.c = u.canvas(Math.max(8, Math.round(W * L.k)), Math.max(8, Math.round(H * L.k))); L.g = L.c.getContext('2d'); }
    },

    fx(T) {
      return { bloom: K([[44, 0.5], [52, 0.3], [58, 0.22], [60.2, 0.22], [60.7, 0.3], [62, 0.05], [66, 0.03], [72, 0.03], [76, 0.03]], T, 'smooth') };
    },

    render(g, T, L, env) {
      const { W, H, S } = env;
      const A = above(T);
      const flash = flashEnv(T);
      const wob = 1 + 0.06 * sin(T * 2.4);

      if (A < 0.999) drawUnderwater(g, T, env, 1 - A);
      if (A > 0.001) drawAbove(g, T, env, A);

      // ----- the hero (always on top of the world, under the flash)
      drawHeroAndSplashTop(g, T, env, wob, A);

      // ----- breaking flash: warm white bloom of the whole frame
      if (flash > 0.003) {
        const hy = heroY(T) * H, hx = 0.5 * W;
        u.glow(g, hx, hy, S * (0.6 + 0.7 * flash), 40, 70, 82, 0.7 * flash, 'soft');
        u.glow(g, hx, hy, S * 0.3 * (0.5 + flash), 45, 40, 92, 0.7 * flash, 'core');
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,214,150,${(0.12 * flash).toFixed(3)})`;
        g.fillRect(0, 0, W, H);
        g.restore();
      }
    },
  });

  /* ================================================================== UNDERWATER */
  function drawUnderwater(g, T, env, vis) {
    const { W, H, S } = env;
    const k = (a, b, c) => ss(a, b, c);
    // 1. water body ---------------------------------------------------------------------------
    const top = u.keyc([[44, '#0f6a8a'], [48, '#0f6a8a'], [52, '#1892a6'], [56, '#2bb0b8'], [60, '#52c8c8']], T);
    const bot = u.keyc([[44, '#06293f'], [48, '#06293f'], [52, '#0a5068'], [56, '#0e6d88'], [60, '#18879f']], T);
    const mid = u.mixc(top, bot, 0.5);
    u.vgrad(g, W, H, [[0, u.css(top)], [0.45, u.css(u.mixc(top, mid, 0.55))], [1, u.css(bot)]]);
    // sun-lit glow high up in the water: the light intensifies as we near the surface
    const lit = k(46, 58, T);
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (lit > 0.01) {
      u.glow(g, W * 0.15, -H * 0.06, S * 1.1, 175, 70, 62, 0.28 * lit, 'soft');
    }
    // 2. god-rays from upper-left (about 15 deg off vertical) -----------------------------------
    drawShafts(g, T, env, lit);
    // 3. caustic net -----------------------------------------------------------------------------
    drawCaustics(g, T, env);
    if (_anyShaft || anyShaftFlag()) { g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true; g.drawImage(SH.c, 0, 0, W, H); }
    g.restore();
    // 4. far layer: marine snow, school of silver fish -------------------------------------------
    drawSnow(g, T, env, 0);
    drawFish(g, T, env);
    // 5. underside of the surface ---------------------------------------------------------------
    drawUnderside(g, T, env);
    // 6. cameo: mantas -------------------------------------------------------------------------
    drawMantas(g, T, env);
    // 7. near layer: bubbles, snow --------------------------------------------------------------
    drawBubbles(g, T, env);
    drawSnow(g, T, env, 1);
    // top-edge shimmer
    const sh = 0.5 + 0.5 * sin(T * 0.9);
    const gr = g.createLinearGradient(0, 0, 0, H * 0.06);
    gr.addColorStop(0, `rgba(190,245,245,${(0.1 + 0.08 * sh).toFixed(3)})`); gr.addColorStop(1, 'rgba(190,245,245,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.06);
    // dissolve out: handled by the above layer painting over; nothing else needed
  }

  let _anyShaft = false;
  const anyShaftFlag = () => _anyShaft;
  function drawShafts(g0, T, env, lit) {
    const { W, H, S } = env;
    const g = SH.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, SH.c.width, SH.c.height);
    g.setTransform(SH.c.width / W, 0, 0, SH.c.height / H, 0, 0);
    g.globalCompositeOperation = 'lighter';
    const spr = shaftSprite();
    const tilt = Math.tan(15 * Math.PI / 180);
    const nS = Math.min(shafts.length, 5 + Math.round(6 * ss(47, 54, T)));
    const boost = 0.75 + 1.25 * ss(47, 55, T);
    const fade = 1 - ss(56.5, 59, T);
    const wideBoost = Math.max(1, env.aspect * 0.6);
    _anyShaft = false;
    let anyShaft = false;
    for (let i = 0; i < nS; i++) {
      const s = shafts[i];
      const vis = i < 4 ? 1 : ss(47 + i * 0.5, 52 + i * 0.5, T);
      const sway = sin(T * s.sp + s.ph);
      const x0 = (s.x + 0.04 * sway) * W * 1.12 - W * 0.05;
      const wTop = (s.big ? 0.2 : s.w) * S * (1.0 + 0.2 * sway) * (0.9 + 0.3 * wideBoost * 0.3);
      const al = (s.big ? 0.24 : 0.15) * boost * (0.7 + 0.3 * sin(T * (0.3 + s.sp) + s.ph * 2)) * vis * fade;
      if (al < 0.004) continue;
      anyShaft = true; _anyShaft = true;
      const len = H * 1.45;
      g.save();
      g.globalAlpha = Math.min(1, al);
      g.transform(1, 0, tilt + 0.03 * sway, 1, x0, -H * 0.08);
      g.drawImage(spr, -wTop * 0.5, 0, wTop, len);
      g.restore();
    }
    g.globalAlpha = 1;

  }

  function drawCaustics(g, T, env) {
    const { W, H } = env;
    const amt = ss(46.5, 52, T) * (1 - ss(55, 57.5, T));
    if (amt < 0.01) return;
    const w = CA.w, h = CA.h, d = CA.img.data;
    const asp = W / H;
    const tm = T * 0.42 + 23;
    const ts = [tm * (1 - 3.5), tm * (1 - 3.5 / 2), tm * (1 - 3.5 / 3), tm * (1 - 3.5 / 4)];
    const SC = 6.28 * 1.25;
    let o = 0;
    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) / h;
      if (y > 0.86) { for (let i = 0; i < w; i++, o += 4) d[o + 3] = 0; continue; }
      const fall = pow(1 - y, 1.2);
      const py = y * SC - 250;
      for (let i = 0; i < w; i++, o += 4) {
        const px = ((i + 0.5) / w) * asp * SC - 250;
        let ix = px, iy = py, c = 1.0;
        for (let n = 0; n < 4; n++) {
          const t = ts[n];
          const nx = px + (cos(t - ix) + sin(t + iy));
          const ny = py + (sin(t - iy) + cos(t + ix));
          ix = nx; iy = ny;
          const sx = sin(ix + t) / 0.005, cy = cos(iy + t) / 0.005;
          { const qa = px / sx, qb = py / cy; c += 1 / sqrt(qa * qa + qb * qb); }
        }
        c /= 4;
        c = 1.17 - pow(c, 1.4);
        const v = Math.min(1, pow(Math.abs(c), 9) * 3.0 * fall);
        d[o] = 215; d[o + 1] = 255; d[o + 2] = 245; d[o + 3] = Math.min(255, v * 255 * amt);
      }
    }
    CA.g.putImageData(CA.img, 0, 0);
    const gl = SH.g;
    gl.save(); gl.globalAlpha = 0.5; gl.imageSmoothingEnabled = true; gl.globalCompositeOperation = 'lighter';
    gl.drawImage(CA.c, 0, 0, W, H);
    gl.restore();
    _anyShaft = true;
    }

  function drawSnow(g, T, env, layer) {
    const { W, H, S } = env;
    const sk = sink(T) * S / H;
    const bright = 0.55 + 0.7 * ss(46, 58, T);
    const fade = 1 - ss(58.6, 60.4, T);
    const count = Math.min(snow.length, Math.round(snow.length * Math.min(1.4, env.aspect * 0.7 + 0.3)));
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < snow.length; i++) {
      const m = snow[i];
      if ((m.z > 0.95) !== (layer === 1)) continue;
      if (m.w > count / snow.length) continue;
      const y = u.wrap(m.y + sk * m.z, 0, 1);
      const x = m.x + sin(T * 0.25 + m.ph) * 0.012 * m.z;
      const tw = 0.55 + 0.45 * sin(T * 1.7 + m.ph * 3);
      const r = S * (0.0022 + 0.0045 * m.z * m.z) + 0.7;
      const a = (0.2 + 0.4 * m.z * m.z) * tw * bright * fade;
      u.glow(g, x * W, y * H, r * 2.4, m.h, 55, 78, a);
    }
    g.restore();
  }

  function drawFish(g, T, env) {
    const { W, H, S } = env;
    const fade = ss(43.5, 44.5, T) * (1 - ss(52, 55, T));
    if (fade < 0.01) return;
    const sk = (sink(T) - sink(44)) * S / H;
    // loose school crossing from left to right in the mid-distance, in a gently curving stream
    const cx = (0.28 + (T - 44) * 0.075) * W;
    const cy = (0.62 + 0.05 * sin(T * 0.22) + sk * 0.35) * H;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const lag = f.a * 0.5; // along the stream
      const px = cx + f.a * W * 0.34 + sin(T * 0.7 + f.ph) * S * 0.015;
      const curve = sin((px / W) * 3.1 + T * 0.25) * 0.045;
      const py = cy + (f.b * 0.07 + curve) * H + sin(T * 1.3 + f.ph) * S * 0.01;
      const ang = Math.atan(0.045 * 3.1 * cos((px / W) * 3.1 + T * 0.25) * H / W) + sin(T * 2.1 + f.ph) * 0.18;
      const len = S * (0.012 + 0.008 * f.d) * f.s;
      // shimmer: bodies flash as they turn
      const fl = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(T * 3.2 + f.ph * 2 + f.a * 6), 3);
      g.save();
      g.translate(px, py); g.rotate(ang);
      g.fillStyle = `rgba(215,245,250,${(0.4 * fl * fade).toFixed(3)})`;
      g.beginPath(); g.ellipse(0, 0, len, len * 0.22, 0, 0, TAU); g.fill();
      g.restore();
      if (fl > 0.6) u.glow(g, px, py, len * 2.2, 190, 40, 85, 0.25 * (fl - 0.5) * fade);
    }
    g.restore();
  }

  function drawBubbles(g, T, env) {
    const { W, H, S } = env;
    const spr = bubbleSprite();
    const fade = ss(48.5, 50.5, T) * (1 - ss(58.5, 60.3, T));
    if (fade < 0.01) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // 3 bubble streams rising on the left / right
    const cols = [0.2, 0.8, 0.9];
    const ds = sink(T) * S / H;
    for (const b of bub) {
      const cx = cols[b.col] * W + (b.col === 0 ? -0.0 : 0);
      const rise = 0.17 * b.sp;
      const y = u.wrap(b.y - (T - 44) * rise * S / H + ds * 0.8, -0.05, 1.05);
      const age = 1 - (y + 0.05) / 1.1; // 0 at the bottom -> 1 at the top
      const x = cx + b.x * S * 0.11 + sin(T * 1.1 * b.sp + b.ph) * S * (0.006 + 0.012 * age);
      const r = S * (0.003 + 0.005 * b.r) * (0.7 + age * 0.8);
      g.globalAlpha = Math.min(1, 0.7 * fade * (0.5 + 0.5 * b.r));
      g.drawImage(spr, x - r, y * H - r, r * 2, r * 2);
    }
    // a wake of tiny bubbles and light motes behind the rising drop
    const w0 = ss(47.5, 50, T) * (1 - ss(60.0, 60.6, T));
    if (w0 > 0.01) {
      const life = 3.4;
      for (const m of wake) {
        const age = u.wrap(T * m.sp * 0.5 + m.ph * life, 0, life) / life; // 0..1
        const tb = T - age * life;
        const yb = heroY(tb) * H + S * 0.02;
        const y = yb + (sink(T) - sink(tb)) * S - age * S * 0.02;
        const x = 0.5 * W + m.x * S * 0.05 * (0.4 + age * 1.5) + sin(T * 1.3 + m.sw) * S * 0.01 * age;
        const r = S * (0.0022 + 0.0035 * m.r) * (0.6 + age);
        g.globalAlpha = Math.min(1, w0 * 0.8 * (1 - age) * ss(0, 0.08, age));
        g.drawImage(spr, x - r, y - r, r * 2, r * 2);
      }
    }
    g.restore();
  }

  /* ---- the mirror underside of the surface with its Snell window -------------------------------- */
  let _w2 = 0;
  function waves(X, Z, tt) {
    _w2 = sin(X * 5.1 + Z * 4.3 + tt * 1.6 + 2 * sin(X * 1.3 - tt * 0.5)) * 0.5 + 0.5 * sin(-X * 3.3 + Z * 6.1 - tt * 1.1);
    return 0.5 * sin(X * 2.3 + Z * 1.1 + tt * 0.9) + 0.32 * sin(-X * 1.7 + Z * 2.9 - tt * 1.25) + 0.2 * sin(X * 0.7 - Z * 3.7 + tt * 0.7 + 1.3 * sin(Z * 0.5 + tt * 0.2));
  }
  const UF = 0.66; // focal length of the under-water camera (in H units): wide lens
  const ZC = 0.8482; // critical angle from the zenith (48.6 deg)
  const SUNV = [sin(-0.45) * cos(0.1), sin(0.1), cos(-0.45) * cos(0.1)];

  function drawUnderside(g, T, env) {
    const p0 = pitch(T);
    const { W, H } = env;
    const F = UF, D = 1.0;
    const hz = 0.5 + F * Math.tan(p0 * Math.PI / 180);
    if (hz < -0.04) return;
    const w = US.w, h = US.h, d = US.img.data;
    const p = p0 * Math.PI / 180, sp = sin(p), cp = cos(p);
    const asp = W / H;
    const bright = 0.88 + 0.12 * ss(54, 60, T);
    const lut = LUT_WINDOW, mir = LUT_MIRROR;
    const tt = T;
    let o = 0;
    for (let j = 0; j < h; j++) {
      const v = 0.5 - (j + 0.5) / h;
      const dy = v * cp + F * sp, dz = F * cp - v * sp;
      for (let i = 0; i < w; i++, o += 4) {
        const dx = ((i + 0.5) / w - 0.5) * asp;
        const len = sqrt(dx * dx + dy * dy + dz * dz);
        const ce = dy / len; // sin(elevation) = cos(zeta)
        if (ce < 0.002) { d[o + 3] = 0; continue; }
        const t = D / dy;
        const X = dx * t, Z = dz * t;
        const amp = 1 / (1 + t * 0.2);
        const wv = waves(X, Z, tt), wv2 = _w2;
        const zeta = abs(Math.acos(ce > 1 ? 1 : ce) + (0.075 * wv + 0.025 * wv2) * amp);
        const mw = ss(ZC - 0.024, ZC + 0.034, zeta);
        let r, gg, b;
        // --- Snell window (refracted sky)
        if (mw < 0.999) {
          const so = Math.min(1, 1.333 * sin(zeta));
          const to = Math.asin(so); // refracted angle from the zenith
          const kk = Math.min(1, to / 1.5708);
          const li = ((kk * 63) | 0) * 3;
          const rho = sqrt(dx * dx + dz * dz) + 1e-6;
          const sT = sin(to), cT = cos(to);
          const dot = sT * (dx / rho) * SUNV[0] + cT * SUNV[1] + sT * (dz / rho) * SUNV[2];
          const dm = Math.max(0, dot);
          const sg = pow(dm, 90) * 1.1 + pow(dm, 14) * 0.3;
          const ripple = 1 + 0.1 * wv * amp;
          r = lut[li] * ripple + 255 * sg; gg = lut[li + 1] * ripple + 240 * sg; b = lut[li + 2] * ripple + 205 * sg;
        } else { r = gg = b = 0; }
        // --- mirror (total internal reflection of the water body)
        if (mw > 0.001) {
          const el = Math.min(1, (1.5708 - zeta) / 0.72);
          const li = ((el * 63) | 0) * 3;
          let mr = mir[li], mg = mir[li + 1], mb = mir[li + 2];
          // thin ridged ripple lines (wave fronts seen from below) + soft crests
          const l1 = 1 - abs(sin(X * 1.7 + Z * 0.9 + tt * 0.8 + 2.6 * wv + 1.5 * sin(Z * 0.9 + tt * 0.3)));
          const l2 = 1 - abs(sin(-X * 1.2 + Z * 2.3 - tt * 1.0 + 2.2 * wv2 + 1.2 * sin(X * 0.7)));
          const lines = (pow(l1, 8) * 0.55 + pow(l2, 8) * 0.45) * amp * 0.7;
          const crest = Math.max(0, wv + 0.3 * wv2);
          const band = 0.5 + 0.5 * sin(Z * 2.2 + 1.4 * sin(X * 0.8 + tt * 0.35) + tt * 0.5);
          const bm = (1 + 0.16 * wv * amp) * (1 - 0.14 * band * (1 - el));
          const sh = lines * 0.55 + pow(crest, 2.4) * 0.22 * amp;
          mr = mr * bm + 255 * sh; mg = mg * bm + 255 * sh; mb = mb * bm + 250 * sh;
          if (mw >= 0.999) { r = mr; gg = mg; b = mb; } else { r += (mr - r) * mw; gg += (mg - gg) * mw; b += (mb - b) * mw; }
        }
        d[o] = r * bright; d[o + 1] = gg * bright; d[o + 2] = b * bright;
        d[o + 3] = 255 * ss(0.002, 0.07, ce);
      }
    }
    US.g.putImageData(US.img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(US.c, 0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'lighter';
    // soft silver sheen along the horizon of the surface
    if (hz > 0 && hz < 1.05) {
      const hh = H * 0.05;
      const gr = g.createLinearGradient(0, hz * H - hh, 0, hz * H + hh * 0.7);
      gr.addColorStop(0, 'rgba(220,255,250,0)'); gr.addColorStop(0.65, 'rgba(220,255,250,0.16)'); gr.addColorStop(1, 'rgba(220,255,250,0)');
      g.fillStyle = gr; g.fillRect(0, hz * H - hh, W, hh * 1.7);
    }
    // the crisp bright rim of the Snell window
    drawRim(g, T, env, sp, cp);
    g.restore();
  }

  function drawRim(g, T, env, sp, cp) {
    const { W, H, S } = env;
    const F = UF, D = 1.0, e0 = 1.5708 - ZC;
    const N = 160;
    let started = false;
    const xs = [], ys = [];
    const pts = _rimPts;
    let n = 0;
    for (let k = 0; k <= N; k++) {
      const a = -Math.PI + (k / N) * TAU;
      // wobble sampled at the unperturbed ring point
      const dx0 = cos(e0) * sin(a), dy0 = sin(e0), dz0 = cos(e0) * cos(a);
      const t = D / dy0, X = dx0 * t, Z = dz0 * t;
      const amp = 1 / (1 + t * 0.2);
      const wv = waves(X, Z, T), wv2 = _w2;
      const e = e0 + (0.075 * wv + 0.025 * wv2) * amp;
      const dx = cos(e) * sin(a), dy = sin(e), dz = cos(e) * cos(a);
      const fc = dy * sp + dz * cp, vc = dy * cp - dz * sp;
      if (fc < 0.08) { pts[n++] = NaN; pts[n++] = NaN; continue; }
      pts[n++] = W * 0.5 + (F * dx / fc) * H;
      pts[n++] = (0.5 - F * vc / fc) * H;
    }
    const pass = (lw, al, col) => {
      g.lineWidth = lw; g.strokeStyle = col.replace('A', al.toFixed(3));
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      let pen = false;
      for (let i = 0; i < n; i += 2) {
        const x = pts[i], y = pts[i + 1];
        if (x !== x) { pen = false; continue; }
        if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      }
      g.stroke();
    };
    const vis = ss(57.4, 59.2, T);
    pass(S * 0.03, 0.05 * vis, 'rgba(255,225,190,A)');
    pass(S * 0.011, 0.14 * vis, 'rgba(255,240,215,A)');
    pass(S * 0.0035, 0.5 * vis, 'rgba(255,252,240,A)');
  }
  const _rimPts = new Array(400);

  /* ---- manta ray silhouettes gliding across the window -------------------------------------------- */
  function drawMantas(g, T, env) {
    const { W, H, S } = env;
    const fade = 1 - ss(59.5, 60.4, T);
    if (fade < 0.01) return;
    for (const m of MANTA) {
      const k = (T - m.t0) / (m.t1 - m.t0);
      if (k < -0.1 || k > 1.1) continue;
      const kk = k;
      const x = lerp(-0.25, 1.25, kk) * W;
      const y = (m.y + 0.02 * sin(T * 0.4 + m.ph) + (sink(T) - sink(m.t0 + 2)) * S / H * m.par * 0.6) * H;
      const sz = m.size * S;
      const al = m.a * fade * ss(-0.1, 0.1, k) * (1 - ss(0.9, 1.1, k));
      const flap = sin(T * 1.7 + m.ph);
      drawManta(g, x, y, sz, flap, al, m.dir, T);
    }
  }
  function drawManta(g, x, y, sz, flap, al, dir, T) {
    g.save();
    g.translate(x, y);
    g.rotate(0.05 * sin(T * 0.5 + sz) );
    g.scale(sz * dir, sz);
    const wing = 0.9 - 0.12 * Math.abs(flap), tipx = -0.18 + 0.1 * flap, bend = 0.22 * flap;
    const mkp = (s) => {
      const p = new Path2D();
      p.moveTo(0.55, 0);
      p.bezierCurveTo(0.5, -0.1 * s, 0.38, -0.34 * s, 0.1, -(wing * 0.6 + bend) * s);
      p.bezierCurveTo(-0.02, -(wing * 0.82 + bend) * s, tipx + 0.05, -(wing + bend * 0.6) * s * 1.0, tipx - 0.02, -(wing + bend) * s);
      p.bezierCurveTo(tipx - 0.2, -(wing * 0.55) * s, -0.3, -0.22 * s, -0.36, -0.07 * s);
      p.lineTo(-1.15, 0.0);
      p.lineTo(-0.36, 0.07 * s);
      p.bezierCurveTo(-0.3, 0.22 * s, tipx - 0.2, (wing * 0.55) * s, tipx - 0.02, (wing + bend) * s);
      p.bezierCurveTo(tipx + 0.05, (wing + bend * 0.6) * s * 1.0, -0.02, (wing * 0.82 + bend) * s, 0.1, (wing * 0.6 + bend) * s);
      p.bezierCurveTo(0.38, 0.34 * s, 0.5, 0.1 * s, 0.55, 0);
      p.closePath();
      return p;
    };
    const path = mkp(1);
    // soft body: a few offset translucent fills fake a blur; colour tracks the water, darker than it
    for (let i = 3; i >= 0; i--) {
      const sc = 1 + i * 0.045;
      g.save(); g.scale(sc, sc);
      g.fillStyle = `rgba(7,58,84,${(al * (i === 0 ? 0.62 : 0.14)).toFixed(3)})`;
      g.fill(path);
      g.restore();
    }
    // paler belly sheen
    g.fillStyle = `rgba(150,220,230,${(al * 0.12).toFixed(3)})`;
    g.beginPath(); g.ellipse(0.12, 0, 0.32, 0.1, 0, 0, TAU); g.fill();
    g.restore();
  }

  /* ================================================================== ABOVE WATER */
  function drawAbove(g, T, env, A) {
    const { W, H, S } = env;
    const yh = horizonY(T), c = camC(T);
    const sx = sunX(T) * W, sy = sunY(T) * H;
    // ---- sky ----
    const top = u.keyc([[60, '#1f2c70'], [63, '#3a4b98'], [67, '#5879c0'], [72, '#6f8fc4']], T);
    const mid = u.keyc([[60, '#c47c9e'], [64, '#e39ca8'], [68, '#efab9c'], [72, '#f3b58f']], T);
    const hor = u.keyc([[60, '#ffc890'], [66, '#ffd2a0'], [72, '#ffd9a0']], T);
    const yhp = Math.max(0.05, yh) * H;
    const gr = g.createLinearGradient(0, 0, 0, yhp);
    gr.addColorStop(0, u.css(top));
    gr.addColorStop(0.22, u.css(u.mixc(top, mid, 0.42)));
    gr.addColorStop(0.5, u.css(mid));
    gr.addColorStop(0.78, u.css(u.mixc(mid, hor, 0.55)));
    gr.addColorStop(0.93, u.css(u.mixc(mid, hor, 0.9)));
    gr.addColorStop(1, u.css(hor));
    g.save();
    g.globalAlpha = A;
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.restore();

    g.save();
    g.globalAlpha = A;
    // ---- last stars fading ----
    const sa = 1 - ss(60.8, 66, T);
    if (sa > 0.01) {
      g.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const q = s.q;
        const y = yhp * (1 - q * 1.02);
        const tw = 0.5 + 0.5 * sin(T * (1.1 + s.s) + s.ph);
        const a = sa * ss(0.5, 0.95, q) * (0.25 + 0.6 * tw) * 0.8;
        if (a > 0.01) u.glow(g, s.x * W, y, S * 0.006 * s.s + 1, 220, 40, 90, a);
      }
    }
    g.restore();

    // ---- sun, crepuscular beams, haze ----
    g.save();
    g.globalAlpha = A;
    g.globalCompositeOperation = 'lighter';
    const swell = 1 + 0.25 * ss(60.5, 64, T);
    u.glow(g, sx, sy, S * 0.62 * swell, 22, 90, 60, 0.22 + 0.14 * ss(69, 73, T), 'soft');
    u.glow(g, sx, sy, S * 0.3 * swell, 32, 95, 68, 0.32 + 0.25 * ss(69, 73, T), 'soft');
    // wide horizon streak
    if (yh < 1.1) {
      const spr = strandSprite('255,224,170');
      g.globalAlpha = A * 0.22;
      g.drawImage(spr, sx - W * 0.45, yh * H - S * 0.02, W * 0.9, S * 0.04);
      g.globalAlpha = A * 0.08;
      g.drawImage(spr, W * 0.5 - W * 0.9, yh * H - S * 0.018, W * 1.8, S * 0.04);
    }
    g.restore();

    // sun disc (half-risen) -- core glow plus a soft-edged disc
    g.save();
    g.globalAlpha = A * (1 - ss(68.5, 73, T));
    const sr = S * 0.05;
    const sgr = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 1.1);
    sgr.addColorStop(0, 'rgba(255,253,244,1)'); sgr.addColorStop(0.55, 'rgba(255,238,196,0.98)'); sgr.addColorStop(0.85, 'rgba(255,214,150,0.6)'); sgr.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = sgr; g.beginPath(); g.arc(sx, sy, sr * 1.1, 0, TAU); g.fill();
    g.restore();

    // ---- far islands on the horizon (atmospheric perspective: pale, violet) ----
    if (yh < 1.02) drawIslands(g, T, env, A, yh);

    // ---- cloud strands (ride the sky mapping) ----
    drawStrands(g, T, env, A, yhp);

    // ---- sea ----
    if (yh < 1.0) drawSea(g, T, env, A, yh, c, sx, sy);

    // ---- gulls ----
    drawGulls(g, T, env, A, yhp);
  }

  function drawIslands(g, T, env, A, yh) {
    const { W, H, S } = env;
    const yb = yh * H + 1;
    const hs = S * 0.05;
    const defs = [[0.72, 0.28, 0.5, 'rgba(176,150,196,', 0.5], [0.8, 0.2, 0.9, 'rgba(150,128,176,', 0.62], [0.12, 0.16, 0.35, 'rgba(184,158,198,', 0.42]];
    g.save();
    for (const [cx, wd, ht, col, al] of defs) {
      const x0 = (cx - wd / 2) * W, x1 = (cx + wd / 2) * W, n = 18;
      g.globalAlpha = A * al * (1 - ss(66, 71, T));
      if (g.globalAlpha < 0.01) continue;
      g.fillStyle = col + '1)';
      g.beginPath(); g.moveTo(x0, yb);
      for (let i = 0; i <= n; i++) {
        const k = i / n, e = Math.sin(k * Math.PI);
        const y = yb - hs * ht * Math.pow(e, 0.8) * (0.55 + 0.7 * u.fbm1(k * 5 + cx * 17, 3));
        g.lineTo(x0 + (x1 - x0) * k, y);
      }
      g.lineTo(x1, yb); g.closePath(); g.fill();
    }
    g.restore();
  }

  function drawBeams(g0, T, env, sx, sy, A) {
    const { W, H, S } = env;
    const g = BM.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, BM.c.width, BM.c.height);
    g.setTransform(BM.c.width / W, 0, 0, BM.c.height / H, 0, 0);
    g.globalCompositeOperation = 'lighter';
    const spr = beamSprite();
    const n = 9;
    const base = 0.016 + 0.016 * ss(60.5, 64, T);
    for (let i = 0; i < n; i++) {
      const a = -1.2 + (i / (n - 1)) * 1.9 + 0.08 * sin(T * 0.13 + i * 1.7);
      const len = S * (1.6 + 0.4 * ((i * 7) % 3));
      const wd = S * (0.16 + 0.12 * ((i * 5) % 4) / 3);
      g.save();
      g.translate(sx, sy);
      g.rotate(a + Math.PI * 0.5 * 0); // angle measured from straight up
      g.globalAlpha = 8 * base * (0.6 + 0.4 * sin(T * 0.3 + i * 2.3));
      g.drawImage(spr, -wd / 2, -len, wd, len);
      g.restore();
    }
    g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(255,214,160)'; g.fillRect(0, 0, W, H);
    g0.save(); g0.globalAlpha = A / 8; g0.imageSmoothingEnabled = true; g0.drawImage(BM.c, 0, 0, W, H); g0.restore();
  }

  function drawStrands(g, T, env, A, yhp) {
    const { W, H, S } = env;
    const warm = strandSprite('255,214,168'), lilac = strandSprite('236,206,232');
    g.save();
    g.globalCompositeOperation = 'source-over';
    const n = env.portrait ? strands.length : strands.length - 2;
    for (let i = 0; i < n; i++) {
      const s = strands[i];
      const y = yhp * (1 - s.q);
      const x = u.wrap(s.x + T * s.sp, -0.5, 1.5) * W;
      const w = s.w * W * (0.7 + s.q * 0.7);
      const h = Math.max(2, s.h * S * (1.2 + 0.8 * s.q));
      g.globalAlpha = A * s.a * 0.5 * (0.75 + 0.25 * sin(T * 0.2 + s.ph));
      g.drawImage(s.q > 0.55 ? lilac : warm, x - w / 2, y - h / 2, w, h);
    }
    g.restore();
  }

  function drawSea(g, T, env, A, yh, c, sx, sy) {
    const { W, H, S } = env;
    const w = SE.w, h = SE.h, d = SE.img.data;
    const asp = W / H;
    const t = T;
    const sxn = sx / W;
    const lut = LUT_SEA;
    const sunPow = 0.85 + 0.35 * ss(60.5, 66, T);
    const WS = W / S;
    let o = 0;
    for (let j = 0; j < h; j++) {
      const yy = (j + 0.5) / h;
      const dyn = yy - yh;
      if (dyn <= 0) { for (let i = 0; i < w; i++, o += 4) d[o + 3] = 0; continue; }
      const Z = c / dyn;
      const depth = Math.min(1, dyn / 0.55);
      const li = ((pow(depth, 0.8) * 63) | 0) * 3;
      const baseR = lut[li], baseG = lut[li + 1], baseB = lut[li + 2];
      const pathW = 0.014 + 0.5 * dyn;
      const edge = ss(0, 0.012, dyn);
      // level of detail: fade octaves whose screen period is below ~3 rows
      const rp = 6.2832 * dyn * dyn / c * h;
      const l1 = cl((rp / 6 - 2.5) / 4), l2 = cl((rp / 18 - 2.5) / 4), l3 = cl((rp / 55 - 2.5) / 4), l4 = cl((rp / 130 - 2.5) / 4);
      for (let i = 0; i < w; i++, o += 4) {
        const sxp = (i + 0.5) / w;
        const X = Z * (sxp - 0.5) * WS;
        const sw = 0.5 * l1 * sin(Z * 6 + 1.4 * sin(X * 1.1 + t * 0.3) + t * 0.8)
          + 0.3 * l2 * sin(Z * 18 - X * 2.3 + 1.1 * sin(X * 2.0 - t * 0.5) - t * 0.9)
          + 0.22 * l3 * sin(Z * 55 + X * 3 + 1.2 * sin(X * 5 + t * 0.4) + t * 1.3)
          + 0.16 * l4 * sin(Z * 130 - X * 7 + 1.5 * sin(X * 9 - t * 0.6) + t * 1.7);
        const crest = Math.max(0, sw);
        let r = baseR, gg = baseG, b = baseB;
        // swell shading: light sky-reflecting crests, dim troughs
        const sh = 1 + 0.2 * sw * (0.4 + depth);
        r *= sh; gg *= sh; b *= sh;
        // glitter path under the sun
        const dxs = Math.abs(sxp - sxn) * asp;
        const pa = exp(-(dxs * dxs) / (pathW * pathW)) * sunPow;
        const gl = pa * (0.07 + 0.5 * pow(crest, 1.5));
        r += 255 * gl * 0.8; gg += 205 * gl * 0.75; b += 145 * gl * 0.6;
        // warm crest light on the sun side
        const warm = crest * crest * 0.3 * exp(-dxs * dxs * 0.9);
        r += 255 * warm; gg += 190 * warm; b += 140 * warm;
        d[o] = r; d[o + 1] = gg; d[o + 2] = b;
        d[o + 3] = 255 * edge;
      }
    }
    SE.g.putImageData(SE.img, 0, 0);
    g.save();
    g.globalAlpha = A;
    g.imageSmoothingEnabled = true;
    g.drawImage(SE.c, 0, 0, W, H);
    g.restore();

    // horizon haze line
    g.save();
    g.globalAlpha = A;
    g.globalCompositeOperation = 'lighter';
    const yhp = yh * H;
    const hh = S * 0.03;
    const gr = g.createLinearGradient(0, yhp - hh, 0, yhp + hh * 1.2);
    gr.addColorStop(0, 'rgba(255,214,160,0)'); gr.addColorStop(0.45, 'rgba(255,222,170,0.2)'); gr.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = gr; g.fillRect(0, yhp - hh, W, hh * 2.2);

    // glitter glints (crisp little horizontal slivers under the sun)
    const spr = glintSprite();
    const room = 1.0 - yh;
    if (room > 0.02) {
      const ng = Math.round(glints.length * Math.min(1, room * 3));
      for (let i = 0; i < ng; i++) {
        const q = glints[i];
        const dd = pow(q.v, 1.5) * room * 1.02 + 0.004;
        const yy = (yh + dd) * H;
        const pw = 0.014 + 0.5 * dd;
        const x = sx + q.u * pw * H * 0.95 * (1 + 0.2 * sin(T * 0.4 + q.ph));
        const tw = pow(Math.max(0, sin(T * q.f * 2.1 + q.ph)), 4);
        const a = tw * (1 - ss(0.0, 0.03, 0.03 - dd) * 0.0) * (0.9 - 0.45 * Math.abs(q.u));
        if (a < 0.03) continue;
        const gw = S * (0.008 + 0.06 * dd) * (0.6 + q.s * 0.7);
        g.globalAlpha = A * Math.min(1, a);
        g.drawImage(spr, x - gw, yy - gw * 0.1, gw * 2, Math.max(1.5, gw * 0.2));
      }
    }
    g.restore();
  }

  function drawGulls(g, T, env, A, yhp) {
    const { W, H, S } = env;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const b of gulls) {
      const k = (T - b.t0) / (b.t1 - b.t0);
      if (k < 0 || k > 1) continue;
      const x = lerp(b.x0, b.x1, k) * W;
      const y = yhp * (1 - b.q) + sin(T * 0.6 + b.ph) * S * 0.006;
      const sz = b.s * S;
      const dir = b.x1 > b.x0 ? 1 : -1;
      const fl = sin(T * b.f * 2.6 + b.ph) * 0.5 + 0.2 * sin(T * b.f * 5.2);
      const al = A * ss(0, 0.08, k) * (1 - ss(0.88, 1, k)) * 0.8;
      const tint = u.mixc([88, 60, 92], [120, 90, 110], cl(b.q * 1.2));
      g.strokeStyle = u.css(tint, al);
      g.lineWidth = Math.max(1.2, sz * 0.12);
      g.beginPath();
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const ex = sgn * sz * 0.55, ey = -sz * (0.18 + 0.5 * fl) * 0.7;
        const tx = sgn * sz * 1.15, ty = -sz * 0.05 + sz * 0.55 * fl * -0.9 + sz * 0.22;
        g.moveTo(x, y);
        g.quadraticCurveTo(x + ex, y + ey, x + tx, y + ty);
      }
      g.stroke();
    }
    g.restore();
  }

  /* ================================================================== hero, crown splash, rings, vapour */
  function drawHeroAndSplashTop(g, T, env, wob, A) {
    const { W, H, S } = env;
    const hx = 0.5 * W, hy = heroY(T) * H, hr = heroR(T) * S;
    const warm = heroWarm(T);
    const yh = horizonY(T), c = camC(T);
    const xa = 0.5 * W, ya = (yh + c) * H;
    const q = cl(c * 1.5, 0.15, 0.5);
    const tb = T_BREAK;
    const dt = T - tb;

    // splash-plane items (rings, landing ripples, droplets) -- only after the break
    if (dt > -0.05 && T < 70) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      drawRings(g, T, env, xa, ya, q, dt);
      drawCrown(g, T, env, xa, ya, q, dt);
      g.restore();
    }

    // vapour: the drop dissolves into rising motes
    drawVapour(g, T, env);

    // the hero itself
    const flare = 0.55 * exp(-((T - T_BREAK) * (T - T_BREAK)) / 0.35);
    const hl = 1 + 0.2 * ss(60.5, 62, T) * (1 - ss(66, 72, T)); // vapour-bright glow
    const dissolve = 1 - 0.18 * sin(Math.PI * ss(65, 71, T));
    const wobv = wob + 0.12 * exp(-((T - T_BREAK) * (T - T_BREAK)) / 0.2);
    const o = { form: 'orb', pulse: wobv, glow: hl, flare };
    // hue travels 186 -> (violet, rose) -> 48 with a dip in saturation: a dawn-coloured warm-up, one draw only
    const hh = (186 + 222 * warm) % 360;
    hero.draw(g, hx, hy, hr, Object.assign(o, { hue: hh, sat: 92 - 38 * sin(Math.PI * warm), a: dissolve }));
    // the jet of water that carries the drop up out of the sea
    if (dt > 0 && dt < 3.0 && yh < 1) {
      const e = exp(-dt * 1.2) * ss(0, 0.12, dt);
      if (e > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const gr = g.createLinearGradient(0, hy, 0, ya);
        gr.addColorStop(0, 'rgba(255,240,210,0)'); gr.addColorStop(0.35, `rgba(255,236,200,${(0.55 * e).toFixed(3)})`); gr.addColorStop(1, `rgba(255,255,255,${(0.8 * e).toFixed(3)})`);
        g.fillStyle = gr;
        const jw = S * 0.012 * (0.6 + e);
        g.fillRect(xa - jw / 2, hy, jw, Math.max(0, ya - hy));
        g.restore();
      }
    }
  }

  function drawRings(g, T, env, xa, ya, q, dt) {
    const { W, H, S } = env;
    // foam disc of light at the impact
    const disc = exp(-Math.max(0, dt) * 0.9) * ss(-0.05, 0.1, dt);
    if (disc > 0.01) {
      g.save();
      g.translate(xa, ya); g.scale(1, q);
      u.glow(g, 0, 0, S * (0.18 + 0.2 * Math.min(1, dt)), 42, 80, 82, 0.7 * disc, 'soft');
      g.restore();
    }
    const rings = [[0, 0.34, 1.0], [0.22, 0.3, 0.8], [0.55, 0.26, 0.6], [1.0, 0.22, 0.45], [1.6, 0.18, 0.3]];
    for (let i = 0; i < rings.length; i++) {
      const [dl, sp, wgt] = rings[i];
      const a = (dt - dl) * SLOW * 1.35;
      if (a <= 0) continue;
      const rad = S * (0.01 + sp * Math.pow(a, 0.8) * 0.75);
      const fade = Math.max(0, 1 - a / 3.6);
      const al = wgt * fade * fade * ss(0, 0.12, a);
      if (al < 0.01) continue;
      const lw = S * (0.0045 - 0.0006 * i) * (0.6 + 0.8 * fade);
      g.save();
      g.translate(xa, ya); g.scale(1, q);
      g.lineWidth = lw * 3.2;
      g.strokeStyle = `rgba(255,214,160,${(al * 0.1).toFixed(3)})`;
      g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke();
      g.lineWidth = lw;
      g.strokeStyle = `rgba(255,246,228,${(al * 0.55).toFixed(3)})`;
      g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke();
      g.restore();
    }
  }

  function drawCrown(g, T, env, xa, ya, q, dt) {
    const { W, H, S } = env;
    if (dt < 0) return;
    const tau = dt * SLOW;
    const gA = 0.95;
    const hueBase = lerp(192, 46, ss(60.5, 63.8, T));
    // ---- the coronet: a thin translucent wall of water rising round the drop, with jagged beaded teeth
    const hw = 0.5 * S * (1 - exp(-6 * tau)) * exp(-1.9 * tau);
    const wa = ss(0, 0.04, tau) * exp(-tau * 1.35);
    if (wa > 0.01 && hw > 1) {
      const rr = (0.03 + 0.1 * (1 - exp(-2.2 * tau))) * S, rb = (0.024 + 0.065 * (1 - exp(-2 * tau))) * S;
      const gr = g.createLinearGradient(0, ya, 0, ya - hw);
      gr.addColorStop(0, `rgba(255,250,235,${(0.2 * wa).toFixed(3)})`);
      gr.addColorStop(0.7, `rgba(255,236,200,${(0.09 * wa).toFixed(3)})`);
      gr.addColorStop(1, `rgba(255,226,180,${(0.03 * wa).toFixed(3)})`);
      for (let side = 0; side < 2; side++) { // back wall (dim), then front wall
        const a0 = side === 0 ? Math.PI : 0, a1 = side === 0 ? TAU : Math.PI;
        g.fillStyle = gr; g.globalAlpha = side === 0 ? 0.55 : 1;
        g.beginPath();
        g.ellipse(xa, ya, rb, rb * q, 0, a0, a1, false);
        g.lineTo(xa + (side === 0 ? -rr : rr), ya - hw);
        g.ellipse(xa, ya - hw, rr, rr * q, 0, a1, a0, true);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      // bright rim and teeth
      g.lineWidth = Math.max(1, S * 0.0028);
      g.strokeStyle = `rgba(255,248,228,${(0.55 * wa).toFixed(3)})`;
      g.beginPath(); g.ellipse(xa, ya - hw, rr, rr * q, 0, 0, TAU); g.stroke();
      const nT = 22;
      for (let k = 0; k < nT; k++) {
        const th = (k / nT) * TAU + 0.3 * sin(k * 12.9898);
        const lh = hw * (0.1 + 0.2 * u.hash(k * 7 + 3)) * (0.4 + wa);
        const tx = xa + rr * cos(th), ty = ya - hw + rr * q * sin(th);
        g.lineWidth = Math.max(1, S * 0.0022);
        g.strokeStyle = `rgba(255,244,220,${(0.45 * wa).toFixed(3)})`;
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + cos(th) * lh * 0.35, ty - lh); g.stroke();
        u.glow(g, tx + cos(th) * lh * 0.35, ty - lh, S * 0.0075, 44, 70, 86, 0.75 * wa, 'core');
      }
    }
    // ---- ballistic droplets: a bead of light with a very short curved streak
    for (let i = 0; i < crown.length; i++) {
      const d = crown[i];
      const t = tau - (d.k === 2 ? 0.03 : 0);
      if (t < 0) continue;
      const hh = d.vy * t - 0.5 * gA * t * t;
      const rr = d.r0 + d.vh * t;
      if (hh < 0) {
        // landed: a small ripple on the water
        const age = (t - d.tl) / SLOW;
        if (age > 0 && age < 1.6 && d.k < 2) {
          const X = (d.r0 + d.vh * d.tl) * d.cx, Zd = (d.r0 + d.vh * d.tl) * d.cz;
          const rx = xa + X * S, ry = ya + Zd * S * q;
          const rad = S * (0.005 + 0.03 * Math.pow(age, 0.7)) * (0.6 + d.size * 0.5);
          const al = Math.pow(1 - age / 1.6, 2) * 0.55 * (d.k === 0 ? 1 : 0.7);
          g.lineWidth = Math.max(1, S * 0.0018);
          g.strokeStyle = `rgba(255,240,215,${al.toFixed(3)})`;
          g.beginPath(); g.ellipse(rx, ry, rad, rad * q, 0, 0, TAU); g.stroke();
        }
        continue;
      }
      const px = xa + rr * d.cx * S, py = ya + rr * d.cz * S * q - hh * S;
      const rad = S * 0.0042 * d.size * (1 + 0.2 * d.cz);
      const hue = hueBase + d.hue * 0.4;
      // short curved streak along the recent path
      let ppx = px, ppy = py;
      for (let s2 = 1; s2 <= 2; s2++) {
        const t2 = Math.max(0, t - s2 * 0.022 * (d.k === 0 ? 1.3 : 1));
        const h2 = d.vy * t2 - 0.5 * gA * t2 * t2;
        const r2 = d.r0 + d.vh * t2;
        const qx = xa + r2 * d.cx * S, qy = ya + r2 * d.cz * S * q - Math.max(0, h2) * S;
        g.lineCap = 'round';
        g.lineWidth = Math.max(0.9, rad * (1.5 - s2 * 0.38));
        g.strokeStyle = `hsla(${hue.toFixed(0)},80%,88%,${(0.5 * (1 - s2 / 3.6)).toFixed(3)})`;
        g.beginPath(); g.moveTo(ppx, ppy); g.lineTo(qx, qy); g.stroke();
        ppx = qx; ppy = qy;
      }
      u.glow(g, px, py, rad * 4.4, hue, 85, 78, 0.9, 'core');
    }
  }

  function drawVapour(g, T, env) {
    const { W, H, S } = env;
    const e = ss(63.8, 66.5, T);
    if (e < 0.003) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // stream born at the hero: gold-white motes rise with curl-noise sway
    const life = 7.0;
    for (let i = 0; i < motesA.length; i++) {
      const m = motesA[i];
      const age = u.wrap(T * 0.9 * m.sp + m.ph * life, 0, life);
      const tb = T - age / (0.9 * m.sp);
      const k = age / life;
      if (tb < 63.6) continue;
      const hb = heroY(tb) * H;
      const y = hb - age * S * 0.055 * (0.6 + m.sp * 0.5);
      const curl = sin(age * 0.85 + m.sw) * 0.7 + sin(age * 1.9 + m.sw * 2.3) * 0.3;
      const x = 0.5 * W + (m.dx * 0.03 * (1 + age * 0.45) + curl * 0.026 * Math.pow(age, 0.8)) * S;
      const a = e * ss(0, 0.1, k) * (1 - ss(0.5, 1, k)) * 0.85 * ss(63.6, 65.2, tb);
      if (a < 0.01) continue;
      u.glow(g, x, y, S * (0.0035 + 0.0065 * m.s) * (1 + 0.7 * k), m.h, 70, 80, a, 'soft');
    }
    // a faint tall column of warm air above the drop (heat shimmer)
    const hs = ss(65, 68, T) * (1 - ss(72, 76, T));
    if (hs > 0.01) {
      const hyc = heroY(T) * H;
      g.save();
      g.translate(0.5 * W, hyc - S * 0.2); g.scale(1, 3.2);
      u.glow(g, 0, 0, S * 0.09 * (1 + 0.1 * sin(T * 0.9)), 42, 80, 80, 0.2 * hs);
      g.restore();
    }
    // ambient vapour field: fills the sky so it matches the open-sky handoff
    const e2 = ss(66, 72, T);
    if (e2 > 0.01) {
      for (let i = 0; i < motesB.length; i++) {
        const m = motesB[i];
        const y = u.wrap(m.y - T * 0.04 * m.z * S / H, -0.05, 1.05);
        const x = m.x + sin(T * 0.3 + m.ph) * 0.01 * m.z + sin(y * 6 + m.ph) * 0.006;
        const tw = 0.6 + 0.4 * sin(T * 1.4 + m.ph * 3);
        u.glow(g, x * W, y * H, S * (0.0028 + 0.0045 * m.z), m.h, 65, 82, 0.5 * e2 * tw * (0.4 + 0.6 * m.z));
      }
    }
    g.restore();
  }
})();
