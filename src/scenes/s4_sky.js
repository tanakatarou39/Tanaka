/* ひとしずくの旅 — s4_sky (T 72–102) 空と雲
 *
 * The drop rises out of the dawn haze (handoff B3), the camera climbs through thin cloud layers, then tilts
 * down to reveal a sea of cloud with the low sun across it. Other drops (the vapour motes) twinkle in the
 * cloud and spiral in; a cumulus billows around the hero, bright inside, sun-lit crown. It grows heavy,
 * blue-grey, engulfs the view; a silent lightning glow deep inside at ~99; ends inside dense grey fog with
 * the hero as a teardrop at (.5,.4) (handoff B4).
 *
 * Everything is a pure function of T. Clouds = pre-rendered lumpy puff sprites (5 warmth stages x 2 brightness x
 * 6 shapes) composed analytically; cloud layers are drawn into half-res offscreen canvases (4x cheaper fill),
 * tinted with source-atop (haze / storm), then composited.
 */
(function () {
  'use strict';
  const { util: u, hero } = Anim;
  const TAU = Math.PI * 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt,
    exp = Math.exp, pow = Math.pow, floor = Math.floor, atan2 = Math.atan2, hypot = Math.hypot;
  const ss = u.smoothstep, sss = u.smootherstep, clamp = u.clamp, lerp = u.lerp;
  const K = (k, T) => u.keys(k, T, 'smooth');
  const KS = (k, T) => u.keys(k, T, 'spline');
  const mixc = u.mixc;
  const rgb = u.rgb;

  const T0 = 72, T1 = 102;
  const PIN_IN = Anim.hero.pins[2], PIN_OUT = Anim.hero.pins[3];

  /* ------------------------------------------------------------------ palettes */
  const SKY_STOPS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
  // sampled from s3's last seconds (raw, no post-fx), then evolving: dawn haze -> azure -> slate
  const SKY = [
    // 72-76: hold s3's dawn exactly (B3: blue top, peach middle, gold bottom); cooling only starts after the window
    [72, ['#7390c1', '#9098b5', '#b3a2a7', '#d9ad99', '#f4b890', '#f6c194', '#facd9b', '#fcd49f']],
    [76, ['#7490c1', '#8e97b6', '#afa1a9', '#d2ab9b', '#f3b58f', '#f6be93', '#f9ca99', '#fbd19d']],
    [80, ['#6489c6', '#7f9ccb', '#a4afc8', '#cdbbbb', '#eec2a2', '#f5cfa6', '#f9dcae', '#fce3b2']],
    [84, ['#5a86c8', '#6c92cb', '#86a3d0', '#a1b3d1', '#bfc2cd', '#dccec4', '#f2d9b8', '#fbdfb2']],
    [87, ['#3f7cd2', '#5189d4', '#6e9ad6', '#8eaed9', '#afc2dd', '#d0d3de', '#efdcc6', '#fbe3b8']],
    [91, ['#4577c6', '#5a86c8', '#7898cb', '#98aece', '#b4c1d2', '#cdd0da', '#e2d9d0', '#ecdecb']],
].map(([t, a]) => [t, a.map(rgb)]);
  const SKY_STORM_TOP = rgb('#34465f'), SKY_STORM_BOT = rgb('#6d8199');
  const SKY97 = SKY_STOPS.map((f) => mixc(SKY_STORM_TOP, SKY_STORM_BOT, f));
  const skyOut = SKY_STOPS.map(() => [0, 0, 0]);
  function skyAt(T) {
    const rows = SKY;
    let a, b, s;
    if (T <= rows[0][0]) { a = b = rows[0][1]; s = 0; }
    else if (T >= 91) {
      a = rows[rows.length - 1][1]; b = SKY97; s = ss(91.5, 97.6, T);
    } else {
      let i = 0;
      while (T > rows[i + 1][0]) i++;
      a = rows[i][1]; b = rows[i + 1][1]; s = ss(rows[i][0], rows[i + 1][0], T);
    }
    for (let k = 0; k < 8; k++) {
      const o = skyOut[k], p = a[k], q = b[k];
      o[0] = p[0] + (q[0] - p[0]) * s; o[1] = p[1] + (q[1] - p[1]) * s; o[2] = p[2] + (q[2] - p[2]) * s;
    }
    return skyOut;
  }

  /* ------------------------------------------------------------------ camera / sun / horizon */
  const camV = (T) => KS([[60, 0.04], [72, 0.045], [76, 0.07], [79, 0.15], [82, 0.125], [86, 0.05], [90, 0.015], [93, 0.0], [96, -0.02], [100, -0.03], [106, -0.03]], T);
  const CAM_T0 = 60, CAM_DT = 0.02, CAM_N = 2500;
  const camTab = new Float32Array(CAM_N + 2);
  (function () { let c = 0; for (let i = 0; i <= CAM_N + 1; i++) { camTab[i] = c; c += camV(CAM_T0 + i * CAM_DT) * CAM_DT; } })();
  function cam(T) {
    const f = (T - CAM_T0) / CAM_DT;
    const i = clamp(floor(f), 0, CAM_N - 1), a = f - i;
    return camTab[i] * (1 - a) + camTab[i + 1] * a;
  }
  // horizon of the cloud sea (fraction of H). > 1 = below the screen.
  const horizonY = (T) => KS([[72, 1.34], [76, 1.28], [79, 1.17], [82, 1.0], [85, 0.87], [88, 0.74], [92, 0.73], [96, 0.82], [100, 1.0]], T);
  const smin = (a, b, k) => { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
  const SUN = { x: 0.2, y: 0.95 };
  function sunPos(T) {
    SUN.x = K([[72, 0.2], [84, 0.19], [92, 0.17]], T);
    SUN.y = smin(0.95, horizonY(T) - 0.05, 0.14);
    return SUN;
  }
  const sunPow = (T) => (0.85 + 0.15 * sss(76, 83, T)) * (1 - ss(91, 97, T));
  const dawn = (T) => K([[72, 1], [84, 1], [92, 0.45], [97, 0.1]], T);
  const storm = (T) => ss(91.5, 97.3, T);

  /* ------------------------------------------------------------------ hero path */
  const heroX = (T) => 0.5 + 0.012 * sin(T * 0.37) * ss(76, 79.5, T) * (1 - ss(94, 97, T));
  const heroY = (T) => KS([[72, PIN_IN.y], [76, PIN_IN.y], [80, 0.47], [86, 0.455], [92, 0.44], [96, 0.41], [98, PIN_OUT.y], [102, PIN_OUT.y]], T);
  const heroR = (T) => lerp(PIN_IN.r, PIN_OUT.r, ss(78, 98, T));

  /* ------------------------------------------------------------------ cloud sprites */
  const NV = 6, NS = 5, PS = 176;
  let SPR = [];
  // colour ramps: [shadow, mid, lit] for cool (daylight) and warm (dawn, sun side); dim = under-bellies
  const COOL_B = { sh: [176, 188, 222], mid: [232, 238, 252], lit: [255, 255, 255] };
  const WARM_B = { sh: [194, 176, 208], mid: [255, 230, 202], lit: [255, 242, 200] };
  const COOL_D = { sh: [112, 128, 180], mid: [170, 186, 224], lit: [222, 232, 250] };
  const WARM_D = { sh: [130, 114, 168], mid: [214, 184, 178], lit: [246, 222, 190] };
  const mixSet = (a, b, t) => ({ lit: mixc(a.lit, b.lit, t), mid: mixc(a.mid, b.mid, t), sh: mixc(a.sh, b.sh, t) });
  const LDIR = [-0.62, -0.78];
  const LUTN = 64;
  function makeLUT(set) {
    const lut = new Uint8ClampedArray(LUTN * 3);
    for (let i = 0; i < LUTN; i++) {
      const b = i / (LUTN - 1);
      const c = b < 0.5 ? mixc(set.sh, set.mid, b * 2) : mixc(set.mid, set.lit, (b - 0.5) * 2);
      lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2];
    }
    return lut;
  }
  // shape/lighting maps per variant (density-based self-shadowing: lit edges toward the sun, soft lilac in the lee)
  function makeMaps(v) {
    const R = u.rng(1000 + v * 37);
    const blobs = [{ x: 0, y: 0.08, r: 0.5, w: 1 }];
    const k = 7 + ((R() * 4) | 0);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * TAU + R() * 0.8, d = 0.26 + 0.26 * R();
      blobs.push({ x: cos(a) * d, y: sin(a) * d * 0.85 + 0.06, r: 0.2 + 0.2 * R(), w: 0.7 + 0.5 * R() });
    }
    const ox = v * 7.31 + 3.3, oy = v * 4.17 + 1.9;
    const blobF = (x, y) => {
      let F = 0;
      for (let b = 0; b < blobs.length; b++) {
        const q = blobs[b], dx = x - q.x, dy = y - q.y;
        const t = 1 - (dx * dx + dy * dy) / (q.r * q.r);
        if (t > 0) F += q.w * t * sqrt(t);
      }
      return F;
    };
    // coarse thickness (smooth) drives the big shading; fine thickness drives alpha + crisp rims
    const coarse = (x, y) => blobF(x, y) * 0.9 + (u.fbm2(x * 1.9 + ox, y * 1.9 + oy, 2) - 0.5) * 0.7 - 0.1;
    const fine = (x, y) => blobF(x, y) * 0.85 + (u.fbm2(x * 2.4 + ox, y * 2.4 + oy, 3) - 0.5) * 0.72 + (u.fbm2(x * 6 + oy, y * 6 + ox, 2) - 0.5) * 0.06 - 0.1;
    const bm = new Float32Array(PS * PS), am = new Uint8ClampedArray(PS * PS);
    for (let j = 0; j < PS; j++) {
      const y = ((j + 0.5) / PS) * 2 - 1;
      for (let i = 0; i < PS; i++) {
        const x = ((i + 0.5) / PS) * 2 - 1;
        const E = fine(x, y);
        const idx = j * PS + i;
        const m = 1 - ss(0.66, 0.97, sqrt(x * x + y * y));
        const a = ss(-0.04, 0.46, E) * m;
        am[idx] = pow(a, 1.15) * 255;
        if (a < 0.004) { bm[idx] = 0.5; continue; }
        const Es = coarse(x, y);
        const Es1 = coarse(x + LDIR[0] * 0.13, y + LDIR[1] * 0.13);
        const Es2 = coarse(x + LDIR[0] * 0.3, y + LDIR[1] * 0.3);
        const El = fine(x + LDIR[0] * 0.05, y + LDIR[1] * 0.05);
        let b = 0.86 + 0.9 * (Es - Es1) + 0.45 * (Es - Es2) + 0.3 * (E - El) - 0.16 * clamp(Es, 0, 1.2) + 0.2 * (-y) + 0.06 * (-x);
        b = 0.5 + (b - 0.5) * 0.8; // lower contrast: soft, luminous volumes
        bm[idx] = b < 0 ? 0 : b > 1 ? 1 : b;
      }
    }
    // soften the lighting map (removes crunchy chips)
    const tmp = new Float32Array(PS * PS);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < PS; j++) for (let i = 0; i < PS; i++) {
        let acc = 0, n = 0;
        for (let k = -4; k <= 4; k++) { const ii = i + k; if (ii < 0 || ii >= PS) continue; acc += bm[j * PS + ii]; n++; }
        tmp[j * PS + i] = acc / n;
      }
      for (let j = 0; j < PS; j++) for (let i = 0; i < PS; i++) {
        let acc = 0, n = 0;
        for (let k = -4; k <= 4; k++) { const jj = j + k; if (jj < 0 || jj >= PS) continue; acc += tmp[jj * PS + i]; n++; }
        bm[j * PS + i] = acc / n;
      }
    }
    return { bm, am };
  }
  function colorize(maps, lut) {
    const cv = u.canvas(PS, PS), c = cv.getContext('2d');
    const img = c.createImageData(PS, PS), d = img.data;
    const { bm, am } = maps;
    for (let i = 0; i < PS * PS; i++) {
      const li = (((0.3 + 0.7 * bm[i]) * (LUTN - 1)) | 0) * 3;
      d[i * 4] = lut[li]; d[i * 4 + 1] = lut[li + 1]; d[i * 4 + 2] = lut[li + 2]; d[i * 4 + 3] = am[i];
    }
    c.putImageData(img, 0, 0);
    return cv;
  }
  function buildSprites() {
    SPR = [];
    const maps = [];
    for (let v = 0; v < NV; v++) maps.push(makeMaps(v));
    for (let s = 0; s < NS; s++) {
      const w = s / (NS - 1);
      const dim = mixSet(COOL_D, WARM_D, w), bri = mixSet(COOL_B, WARM_B, w);
      const luts = [makeLUT(dim), makeLUT(mixSet(dim, bri, 0.55)), makeLUT(bri)];
      SPR[s] = [[], [], []];
      for (let b = 0; b < 3; b++) for (let v = 0; v < NV; v++) SPR[s][b][v] = colorize(maps[v], luts[b]);
    }
  }
  const wispSprite = () => u.sprite('s4_wisp', 256, 48, (c, w, h) => {
    c.save(); c.translate(w / 2, h / 2); c.scale(1, h / w);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(-w / 2, -w / 2, w, w); c.restore();
  });
  const shadeSprite = () => u.sprite('s4_shade', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(84,100,162,0.95)'); g.addColorStop(0.45, 'rgba(98,114,172,0.6)'); g.addColorStop(0.75, 'rgba(112,126,182,0.2)'); g.addColorStop(1, 'rgba(120,134,188,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
  const sparkSprite = (hue) => u.sprite('s4_spark2' + hue, 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 14);
    g.addColorStop(0, `hsla(${hue},40%,99%,1)`); g.addColorStop(0.3, `hsla(${hue},70%,92%,0.7)`); g.addColorStop(0.65, `hsla(${hue},80%,82%,0.18)`); g.addColorStop(1, `hsla(${hue},80%,75%,0)`);
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    for (let k = 0; k < 2; k++) {
      c.save(); c.translate(32, 32); c.rotate(k * Math.PI / 2);
      const lg = c.createLinearGradient(-15, 0, 15, 0);
      lg.addColorStop(0, `hsla(${hue},60%,95%,0)`); lg.addColorStop(0.5, `hsla(${hue},60%,97%,0.34)`); lg.addColorStop(1, `hsla(${hue},60%,95%,0)`);
      c.fillStyle = lg; c.fillRect(-15, -0.6, 30, 1.2);
      c.restore();
    }
  });

  /* ------------------------------------------------------------------ static data */
  let motes = [], towers = [], nearBands = [], strands = [], heroPuffs = [], rain = [], birds = [], seaGl = [], vap = [], tendrils = [];

  const lightLvl = (sc, a, b) => (sc > b ? 2 : sc > a ? 1 : 0);
  function genCumulus(seed, n, hgt) {
    const R = u.rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const x = clamp((R() + R() + R() - 1.5) * 0.36, -0.5, 0.5);
      const prof = hgt * pow(max(0, 1 - pow(2 * x, 2)), 0.7) * (0.85 + 0.3 * R());
      const t = R();
      const yy = -prof * (0.06 + 0.94 * pow(t, 0.6));
      const r = (0.13 + 0.12 * R()) * (1.02 - 0.35 * t) * (0.6 + 0.4 * prof / hgt);
      out.push({ x, y: min(yy, -r * 0.5), r, v: (R() * NV) | 0, b: lightLvl(-x * 0.9 + (-yy / hgt) * 0.9 + (R() - 0.5) * 0.5, 0.45, 0.95), ph: R() * TAU, t, sy: yy > -r * 0.9 ? 0.66 : 1 });
    }
    out.sort((a, b) => b.y - a.y); // lowest first, crowns last (they overlap the bodies)
    return out;
  }

  function genStatic() {
    // vapour motes: replicate s3's ambient mote field exactly (same seed / formula) => seamless handoff B3
    const M = u.rng(777);
    for (let i = 0; i < 660; i++) M();
    motes = Array.from({ length: 150 }, () => ({ x: M(), y: M(), z: 0.3 + M() * 0.9, ph: M() * TAU, h: 36 + M() * 16 }));
    const Q = u.rng(31337);
    for (const m of motes) {
      m.conv = Q() < 0.86;
      m.s = 79.2 + 10.6 * pow(Q(), 0.9);
      m.dur = 3.6 + 2.6 * Q();
      m.spin = 2.2 + 2.8 * Q();
      m.cy = Q() < 0.25 ? 190 : 46 + Q() * 8;
      m.fadeT = 86 + 6 * Q();
      m.sea = 0;
      m.mspr = u.glowSprite(m.h, 65, 82, 'soft');
      m.spr = u.glowSprite(m.cy, 70, 84, 'soft');
    }
    // cumulus towers standing in the cloud sea: screen x at T=90 (fraction of W), distance below the horizon at T=90 (H units)
    const td = [
      { xf: 0.3, dy: 0.1, size: 0.7, h: 0.6, n: 58, seed: 11 },
      { xf: 0.86, dy: 0.075, size: 0.62, h: 0.7, n: 54, seed: 12 },
      { xf: 0.6, dy: 0.02, size: 0.34, h: 0.45, n: 30, seed: 13 },
      { xf: 1.04, dy: 0.03, size: 0.38, h: 0.6, n: 34, seed: 14 },
      { xf: 0.03, dy: 0.045, size: 0.44, h: 0.55, n: 36, seed: 15 },
      { xf: 0.68, dy: 0.2, size: 0.95, h: 0.34, n: 40, seed: 16 },
      { xf: 0.42, dy: 0.03, size: 0.28, h: 0.4, n: 26, seed: 17 },
    ];
    towers = td.map((t) => Object.assign({ puffs: genCumulus(t.seed * 977, t.n, t.h) }, t));
    // near passing layers (ascent through cloud layers)
    const N = u.rng(4242);
    nearBands = [
      { xf: -0.02, Tc: 77.2, yc: 0.5, w: 0.9, pz: 1.7, a: 0.62, seed: 1 },
      { xf: 1.0, Tc: 78.4, yc: 0.42, w: 1.0, pz: 1.9, a: 0.66, seed: 2 },
      { xf: 0.15, Tc: 79.8, yc: 0.55, w: 0.8, pz: 2.2, a: 0.6, seed: 3 },
      { xf: 0.92, Tc: 81.4, yc: 0.5, w: 0.9, pz: 1.8, a: 0.58, seed: 4 },
      { xf: 0.5, Tc: 80.3, yc: 0.5, w: 1.2, pz: 2.6, a: 0.28, seed: 5 },
      { xf: 0.05, Tc: 83.0, yc: 0.5, w: 0.7, pz: 1.5, a: 0.5, seed: 6 },
      { xf: 0.98, Tc: 84.4, yc: 0.55, w: 0.8, pz: 1.4, a: 0.46, seed: 7 },
      { xf: 0.5, Tc: 78.6, yc: 0.5, w: 1.0, pz: 2.3, a: 0.32, seed: 8, sheet: 1 },
      { xf: 0.4, Tc: 81.6, yc: 0.5, w: 1.0, pz: 2.0, a: 0.28, seed: 9, sheet: 1 },
      { xf: 0.6, Tc: 83.6, yc: 0.5, w: 1.0, pz: 1.7, a: 0.22, seed: 10, sheet: 1 },
      { xf: 0.62, Tc: 77.8, yc: 0.5, w: 0.5, pz: 1.1, a: 0.55, seed: 21 },
      { xf: 0.2, Tc: 80.6, yc: 0.5, w: 0.46, pz: 1.0, a: 0.5, seed: 22 },
      { xf: 0.78, Tc: 82.6, yc: 0.5, w: 0.5, pz: 0.9, a: 0.5, seed: 23 },
    ].map((b) => Object.assign({ puffs: genCumulus(b.seed * 3331, 20, 0.28) }, b, { ph: N() * TAU }));
    // thin sky strands (cirrus)
    strands = Array.from({ length: 18 }, (_, i) => ({ x: N(), q: 0.04 + (i / 18) * 0.82 + N() * 0.04, w: 0.3 + N() * 0.55, h: 0.012 + N() * 0.02, sp: 0.004 + N() * 0.01, ph: N() * TAU, a: 0.3 + N() * 0.4 }));
    // hero cloud puffs
    const R = u.rng(9071);
    heroPuffs = [];
    for (let i = 0; i < 76; i++) {
      const th = R() * TAU, rho = pow(R(), 0.55);
      const x = rho * cos(th) * 1.12, yy = rho * sin(th);
      const y = yy < 0 ? yy * 1.0 : yy * 0.55;
      const r = (0.21 + 0.21 * R()) * (1.12 - 0.5 * rho);
      heroPuffs.push({ x, y, r, rho, ph: R() * TAU, v: (R() * NV) | 0, b: lightLvl(-x * 0.8 - y * 1.0 + (R() - 0.5) * 0.5, 0.1, 0.55), front: R() < 0.26 && rho < 0.78 ? 1 : 0, sy: 1 });
    }
    heroPuffs.sort((a, b) => b.y - a.y);
    // rain streaks
    rain = Array.from({ length: 120 }, () => ({ x: R(), y: R(), z: 0.4 + R() * 0.6, sp: 0.8 + R() * 0.5, l: 0.05 + R() * 0.06, id: R() }));
    // the hero's own rising vapour (B3) and the dark tendrils that stream past it in the storm
    const V = u.rng(5150);
    vap = Array.from({ length: VAPN }, () => ({ u: V(), dx: V() * 2 - 1, v: 0.8 + 0.5 * V(), sz: 0.6 + 0.8 * V(), ph: V() * TAU, w: 0.6 + 0.4 * V() }));
    tendrils = Array.from({ length: 9 }, (_, i) => ({ x: (V() * 2 - 1) * (0.4 + 0.8 * V()), y: V() * 1.8 - 0.2, v: 0.7 + 0.8 * V(), w: 0.06 + 0.08 * V(), h: 0.3 + 0.35 * V(), a: 0.15 + 0.1 * V(), ph: V() * TAU }));
    // birds: a loose V flock
    birds = [];
    const B = u.rng(808);
    for (let i = 0; i < 9; i++) {
      const k = i === 0 ? 0 : ((i + 1) >> 1), side = i & 1 ? 1 : -1;
      birds.push({ ox: k * 0.034 + (B() - 0.5) * 0.01, oy: -side * k * 0.012 + (side * k) * 0.0 + k * 0.016 * (B() - 0.3), ph: B() * TAU, f: 1.5 + B() * 0.7, s: 0.8 + B() * 0.5, ph2: B() * TAU });
    }
    for (let i = 0; i < 3; i++) birds.push({ ox: 0.3 + i * 0.05, oy: 0.09 + B() * 0.03, ph: B() * TAU, f: 2.2 + B() * 0.5, s: 0.5, ph2: B() * TAU });
  }

  /* ------------------------------------------------------------------ per-size buffers */
  const CS = 0.5;
  const CV = {}; // cloud canvases
  let FOG = null, SKYC = null, BG = null, ORDER = [];
  let G_ENV = { W: 1, H: 1, S: 1 };
  const FR = { T: -1, yh: 1, zs: 0, xs: 0, dw: 1, sx: 0, sy: 0 };
  function frameCache(T, env) { FR.T = T; FR.yh = horizonY(T); FR.zs = seaScroll(T); FR.xs = seaDrift(T); FR.dw = dawn(T); const sp = sunPos(T); FR.sx = sp.x * env.W; FR.sy = sp.y * env.H; }

  function mkCV(name, W, H, cs) {
    cs = cs || CS;
    const c = u.canvas(Math.ceil(W * cs), Math.ceil(H * cs));
    CV[name] = { cs, c, x: c.getContext('2d'), x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  }

  const SK = 0.12, SE = 0.012, ZK = 1.5;
  const tOfDy = (dy) => SK / (dy + SE);
  const seaScroll = (T) => cam(T) * 2.0 + T * 0.03;
  const seaDrift = (T) => T * 0.035 + cam(T) * 0.25;
  // world point of something that sits at screen (xf, dy) at T=90
  function seaWorld(o, asp) {
    const t90 = tOfDy(o.dy);
    o.Z0 = t90 * ZK + seaScroll(90);
    o.X0 = (o.xf - 0.5) * asp * t90 * 1.6 + seaDrift(90);
    o.t90 = t90;
  }
  const SPJ = { x: 0, y: 0, t: 1 };
  function seaProj(o, T, env, out) {
    const { W, H, S } = env;
    const cur = T === FR.T;
    const t = (o.Z0 - (cur ? FR.zs : seaScroll(T))) / ZK;
    if (t < 0.08) { out.t = 0; out.x = -9999; out.y = -9999; return out; }
    const dy = SK / t - SE;
    out.t = t;
    out.y = ((cur ? FR.yh : horizonY(T)) + dy) * H;
    out.x = (0.5 + (o.X0 - (cur ? FR.xs : seaDrift(T))) / ((W / S) * t * 1.6)) * W;
    return out;
  }
  function genSea(env) {
    const { W, S } = env;
    for (const t of towers) seaWorld(t, W / S);
    // dew glints that live on the cloud sea; some of them later join the gathering
    const G = u.rng(777001);
    seaGl = [];
    for (let i = 0; i < 46; i++) {
      const o = { sea: 1, xf: G() * 1.1 - 0.05, dy: 0.012 + 0.2 * pow(G(), 1.2), ph: G() * TAU, f: 0.7 + G() * 1.6, z: 0.5 + G() * 0.8, h: 40 + G() * 14,
        conv: G() < 0.7, s: 84.6 + 5.6 * G(), dur: 3.6 + 2.4 * G(), spin: 2.2 + 2.8 * G(), cy: G() < 0.3 ? 190 : 46 + G() * 8, fadeT: 90 + 4 * G() };
      seaWorld(o, W / S);
      o.mspr = u.glowSprite(o.h, 65, 82, 'soft'); o.spr = u.glowSprite(o.cy, 70, 84, 'soft');
      seaGl.push(o);
    }
  }

  /* ------------------------------------------------------------------ geometry helpers */
  function seaGlintPos(o, T, out) {
    seaProj(o, T, G_ENV, SPJ);
    out.x = SPJ.x; out.y = SPJ.y - G_ENV.S * 0.004;
    return out;
  }
  function moteAnchor(m, T, out) {
    const { W, H, S } = G_ENV;
    const y = u.wrap(m.y - T * 0.04 * m.z * S / H, -0.05, 1.05);
    out.x = (m.x + sin(T * 0.3 + m.ph) * 0.01 * m.z + sin(y * 6 + m.ph) * 0.006) * W;
    out.y = y * H;
    return out;
  }
  const A0 = { x: 0, y: 0 }, A1 = { x: 0, y: 0 };
  function anchor(m, T, out) { return m.sea ? seaGlintPos(m, T, out) : moteAnchor(m, T, out); }
  // spiral path of a converging drop; q in [0,1]
  const DP = { x: 0, y: 0 };
  function dropPath(m, q, hx, hy, out) {
    const key = G_ENV.W * 4096 + G_ENV.H;
    if (m._k !== key) { anchor(m, m.s, A0); m._ax = A0.x; m._ay = A0.y; m._k = key; }
    const dx = m._ax - hx, dy = m._ay - hy;
    const rho0 = Math.sqrt(dx * dx + dy * dy), th0 = atan2(dy, dx);
    q = q < 0 ? 0 : q > 1 ? 1 : q;
    const rho = rho0 * (1 - q * sqrt(q) * q);        // ~ q^2.5 : slow start, rushes in at the end
    const th = th0 + m.spin * q * sqrt(q);            // swirl speeds up as the radius shrinks
    out.x = hx + cos(th) * rho; out.y = hy + sin(th) * rho * 0.92;
    return out;
  }

  /* ------------------------------------------------------------------ cloud drawing */
  function stageAt(px, py, dw, sx, sy, S, bonus) {
    const dist = hypot(px - sx, py - sy) / S;
    const w = dw * clamp(0.18 + 0.95 * exp(-dist / 0.85) + (bonus || 0), 0, 1);
    return floor(w * (NS - 1) + 0.5);
  }
  function stageFor(px, py, T, bonus) {
    return stageAt(px, py, FR.dw, FR.sx, FR.sy, G_ENV.S, bonus);
  }
  function puff(cv, px, py, r, stage, v, b, a, sy) {
    if (a <= 0.01 || r < 0.5) return;
    const x = cv.x;
    x.globalAlpha = a > 1 ? 1 : a;
    r *= 1.22;
    const h = r * 2 * sy;
    const y0 = py - h * 0.5;
    x.drawImage(SPR[stage][b][v], px - r, y0, r * 2, h);
    if (px - r < cv.x0) cv.x0 = px - r;
    if (px + r > cv.x1) cv.x1 = px + r;
    if (y0 < cv.y0) cv.y0 = y0;
    if (y0 + h > cv.y1) cv.y1 = y0 + h;
  }
  function clearCV(cv) {
    const x = cv.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    // only the region used last time needs clearing
    x.clearRect(0, 0, cv.c.width, cv.c.height);
    x.setTransform(cv.cs, 0, 0, cv.cs, 0, 0);
    cv.x0 = 1e9; cv.y0 = 1e9; cv.x1 = -1e9; cv.y1 = -1e9;
  }
  // tint what has been drawn (within its bounding box) toward a colour
  function tint(cv, fill, a) {
    if (cv.x1 <= cv.x0) return;
    const x = cv.x;
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = a;
    x.fillStyle = fill;
    x.fillRect(cv.x0, cv.y0, cv.x1 - cv.x0, cv.y1 - cv.y0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }
  // composite the used region of a cloud canvas to the main canvas
  function blit(g, cv, W, H, alpha) {
    if (cv.x1 <= cv.x0) return;
    const x0 = max(0, floor(cv.x0) - 1), y0 = max(0, floor(cv.y0) - 1), x1 = min(W, Math.ceil(cv.x1) + 1), y1 = min(H, Math.ceil(cv.y1) + 1);
    if (x1 <= x0 || y1 <= y0) return;
    g.globalAlpha = alpha == null ? 1 : alpha;
    const k = cv.cs;
    g.drawImage(cv.c, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, x0, y0, x1 - x0, y1 - y0);
    g.globalAlpha = 1;
  }

  function drawCumulus(x, cl, T, cx, base, wpx, T0b, a, forceStage) { // x = cloud canvas record
    const ps = cl.puffs;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const px = cx + p.x * wpx + sin(T * 0.23 + p.ph) * 0.004 * wpx;
      const py = base + p.y * wpx + sin(T * 0.31 + p.ph * 1.3) * 0.006 * wpx;
      const r = p.r * wpx * (1 + 0.035 * sin(T * 0.42 + p.ph));
      const st = forceStage != null ? forceStage : stageFor(px, py, T, 0.2 * (-p.x) + 0.25 * min(1, -p.y / (wpx * 0.5)));
      puff(x, px, py, r, st, p.v, p.b, a, p.sy);
    }
  }

  /* ---- the sea of cloud: perspective height-field, lit from the low sun (low-res, upscaled) ---- */
  let SEAF = null;
  const V0 = [166, 172, 216], V1 = [214, 218, 242], V2 = [252, 246, 238], WARMC = [255, 212, 148], STORMC = [112, 126, 152];
  function cloudH(nx, nz, lod) {
    const b = u.fbm2(nx, nz, lod > 0.5 ? 3 : 2);
    if (lod < 0.05) return b;
    // humps with sharp creases between them (cumulus cauliflower)
    const r1 = sqrt(pow(2 * u.noise2(nx * 2.4 + 9.1, nz * 2.4 + 4.3) - 1, 2) + 0.03);
    const r2 = sqrt(pow(2 * u.noise2(nx * 5.3 + 2.2, nz * 5.3 + 7.7) - 1, 2) + 0.05);
    return b * 0.46 + (r1 * 0.34 + r2 * 0.2 * lod) * lod + (1 - lod) * 0.54 * 0.5;
  }
  function drawSeaField(g, T, env, sky, stm) {
    const { W, H, S } = env;
    const yh = horizonY(T);
    if (yh >= 0.985 || !SEAF || T > 97.2) return false;
    const F = SEAF, fw = F.w, fh = F.h, d = F.img.data;
    const j0 = max(0, floor(yh * fh));
    const zs = seaScroll(T), xs = seaDrift(T), asp = W / S;
    const hzc = mixc(sky[7], [232, 214, 226], 0.3);
    const dw = dawn(T) * (1 - stm);
    const sunx = SUN.x;
    const sdx = -0.075, sdz = 0.03;
    for (let j = 0; j < j0; j++) for (let i = 0; i < fw; i++) d[(j * fw + i) * 4 + 3] = 0;
    for (let j = j0; j < fh; j++) {
      const yn = (j + 0.5) / fh, dy = yn - yh;
      const al = ss(-0.004, 0.05, dy);
      const t = SK / (max(dy, 0) + SE);
      const Z = (t * ZK + zs) * 0.9;
      const lod = ss(0.015, 0.1, dy);
      const hf = (1 - ss(0.0, 0.26, dy)) * 0.7;
      const xk = asp * t * 1.6 * 0.9;
      for (let i = 0; i < fw; i++) {
        const xn = (i + 0.5) / fw;
        const nx = (xn - 0.5) * xk + xs * 0.9;
        const h = cloudH(nx, Z, lod);
        const hl = cloudH(nx + sdx, Z + sdz, lod);
        let b = 0.7 + (h - 0.5) * 0.62 + (h - hl) * 3.4 * (0.35 + 0.65 * lod);
        b = b < 0 ? 0 : b > 1 ? 1 : b;
        let r, gg, bl;
        if (b < 0.45) { const k = b / 0.45; r = V0[0] + (V1[0] - V0[0]) * k; gg = V0[1] + (V1[1] - V0[1]) * k; bl = V0[2] + (V1[2] - V0[2]) * k; }
        else { const k = (b - 0.45) / 0.55; r = V1[0] + (V2[0] - V1[0]) * k; gg = V1[1] + (V2[1] - V1[1]) * k; bl = V1[2] + (V2[2] - V1[2]) * k; }
        // sun-side gold on the lit slopes
        const dxs = (xn - sunx) / 0.5;
        const wf = dw * exp(-dxs * dxs) * ss(0.35, 0.85, b) * 0.8 + dw * 0.12 * ss(0.4, 0.9, b);
        r += (WARMC[0] - r) * wf; gg += (WARMC[1] - gg) * wf; bl += (WARMC[2] - bl) * wf;
        // atmospheric haze toward the horizon
        r += (hzc[0] - r) * hf; gg += (hzc[1] - gg) * hf; bl += (hzc[2] - bl) * hf;
        if (stm > 0.002) {
          const lum = 0.78 + 0.34 * b;
          const k = stm * 0.88;
          r += (STORMC[0] * lum - r) * k; gg += (STORMC[1] * lum - gg) * k; bl += (STORMC[2] * lum - bl) * k;
        }
        const o = (j * fw + i) * 4;
        d[o] = r; d[o + 1] = gg; d[o + 2] = bl; d[o + 3] = al * 255;
      }
    }
    F.x.putImageData(F.img, 0, 0);
    g.globalAlpha = 1 - ss(95.4, 97.2, T);
    g.drawImage(F.c, 0, max(0, j0 - 1), fw, fh - max(0, j0 - 1), 0, max(0, j0 - 1) / fh * H, W, H - max(0, j0 - 1) / fh * H);
    g.globalAlpha = 1;
    return true;
  }

  // towers & passing clouds are composed once (two lighting versions: cool daylight / warm dawn) and then just placed
  function bakeCluster(cl, wpx, hgt, cx90, base90, dwv, env, forceStage) {
    const { W, H, S } = env;
    const wC = Math.ceil(wpx * 1.3 * CS), hC = Math.ceil((hgt * wpx * 1.2 + wpx * 0.3) * CS);
    const c = u.canvas(wC, hC), x = c.getContext('2d');
    x.setTransform(CS, 0, 0, CS, 0, 0);
    const rec = { x, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    const ox = wC / 2 / CS, oy = hC / CS - wpx * 0.12;
    const sp = sunPos(90), sx = sp.x * W, sy = sp.y * H;
    for (let i = 0; i < cl.puffs.length; i++) {
      const p = cl.puffs[i];
      const px = ox + p.x * wpx, py = oy + p.y * wpx;
      const st = forceStage != null ? forceStage : stageAt(cx90 + p.x * wpx, base90 + p.y * wpx, dwv, sx, sy, S, 0.2 * (-p.x) + 0.25 * min(1, -p.y / (wpx * 0.5)));
      puff(rec, px, py, p.r * wpx, st, p.v, p.b, 1, p.sy);
    }
    // a soft gold core-light inside the sun-lit puffs of the warm (dawn) version
    if (dwv >= 1 && forceStage == null) {
      x.globalCompositeOperation = 'lighter';
      const gs = u.glowSprite(44, 85, 76, 'soft');
      for (let i = 0; i < cl.puffs.length; i += 2) {
        const p = cl.puffs[i];
        if (p.b < 1) continue;
        const rr = p.r * wpx * 1.05;
        x.globalAlpha = 0.17;
        x.drawImage(gs, ox + p.x * wpx - rr, oy + p.y * wpx - rr, rr * 2, rr * 2);
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    return { c, ox, oy, w: wC / CS, h: hC / CS };
  }
  function bakeAll(env) {
    const { W, H, S } = env;
    const yh90 = horizonY(90);
    for (const tw of towers) {
      const wpx = tw.size * S, base90 = (yh90 + tw.dy) * H, cx90 = tw.xf * W;
      tw.cool = bakeCluster(tw, wpx, tw.h, cx90, base90, 0.18, env, null);
      tw.warm = bakeCluster(tw, wpx, tw.h, cx90, base90, 1, env, null);
    }
    for (const b of nearBands) {
      if (b.sheet) continue;
      const wpx = b.w * env.S;
      b.img = bakeCluster(b, wpx, 0.28, 0.2 * W, 0.4 * H, 1, env, 2);
    }
  }
  function placeImg(cv, im, cx, base, k, alpha) {
    const dw = im.w * k, dh = im.h * k;
    const dx = cx - im.ox * k, dy = base - im.oy * k;
    cv.x.globalAlpha = alpha;
    cv.x.drawImage(im.c, dx, dy, dw, dh);
    if (dx < cv.x0) cv.x0 = dx;
    if (dx + dw > cv.x1) cv.x1 = dx + dw;
    if (dy < cv.y0) cv.y0 = dy;
    if (dy + dh > cv.y1) cv.y1 = dy + dh;
  }
  function drawTowers(g, T, env, sky, stm, hx, hy) {
    const { W, H, S } = env;
    const cv = CV.sea, x = cv;
    const yh = horizonY(T);
    if (T > 94.9) return;
    clearCV(cv);
    let any = false;
    // far to near
    const order = ORDER;
    const hzc = u.css(mixc(sky[7], [232, 214, 226], 0.3));
    for (let k = 0; k < (yh >= 1.0 ? 0 : order.length); k++) {
      const tw = order[k];
      seaProj(tw, T, env, SPJ);
      if (SPJ.t <= 0) continue;
      const kk = (tw.t90 / SPJ.t) * (1 + 0.01 * sin(T * 0.4 + tw.seed));
      const wpx = tw.size * S * kk;
      const base = SPJ.y + wpx * 0.03, cx = SPJ.x + sin(T * 0.2 + tw.seed) * 0.004 * wpx;
      if (base - tw.h * wpx > H || cx + wpx * 0.7 < 0 || cx - wpx * 0.7 > W) continue;
      const al = 1 - 0.3 * (1 - ss(0.0, 0.09, tw.dy));
      placeImg(cv, tw.cool, cx, base, kk, al);
      const wm = clamp((FR.dw - 0.18) / 0.82, 0, 1);
      if (wm > 0.02) placeImg(cv, tw.warm, cx, base, kk, al * wm);
      any = true;
    }
    drawNear(cv, T, env, hx, hy);
    if (stm > 0.005) tint(cv, 'rgb(100,116,142)', stm * 0.85);
    blit(g, cv, W, H, 1 - ss(93.6, 94.9, T));
  }

  /* ------------------------------------------------------------------ the scene */
  Anim.defineScene({
    id: 's4_sky',

    init() { buildSprites(); genStatic(); },

    resize(env) {
      const { W, H } = env;
      genSea(env);
      // Everything soft (sky, sun, clouds, fog) is composed into ONE half-resolution opaque canvas and upscaled once:
      // one smooth full-screen upscale costs ~4x less than six, and the clouds are soft anyway.
      const bw = Math.ceil(W * CS), bh = Math.ceil(H * CS), bc = u.canvas(bw, bh);
      BG = { c: bc, x: bc.getContext('2d', { alpha: false }), w: bw, h: bh, kx: bw / W, ky: bh / H };
      mkCV('sea', W, H); mkCV('hero', W, H, 0.3);
      bakeAll(env);
      bakeSun(env.S);
      {
        // the sky is a vertical gradient: a 1 x bh strip (written per frame) stretched sideways is almost free
        const c4 = u.canvas(1, bh), x4 = c4.getContext('2d');
        SKYC = { c: c4, x: x4, h: bh, img: x4.createImageData(1, bh) };
        // fine static dither (black/white specks, alpha 2..6/255) breaks the contour bands of the slow gradients
        const nz = u.canvas(bw, bh), nx = nz.getContext('2d'), im = nx.createImageData(bw, bh), rr = u.rng(99);
        for (let i = 0; i < bw * bh; i++) { const v = rr() < 0.5 ? 0 : 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 2 + rr() * 4; }
        nx.putImageData(im, 0, 0);
        SKYC.n = nz;
      }
      ORDER = towers.slice().sort((a, b) => a.dy - b.dy);
      {
        const fh = 84, fw = clamp(Math.round(fh * W / H), 100, 170);
        const c2 = u.canvas(fw, fh), x2 = c2.getContext('2d');
        SEAF = { c: c2, x: x2, w: fw, h: fh, img: x2.createImageData(fw, fh) };
      }
      const fh = 44, fw = clamp(Math.round(fh * W / H), 40, 100);
      const c = u.canvas(fw, fh);
      FOG = { c, x: c.getContext('2d'), w: fw, h: fh, img: c.getContext('2d').createImageData(fw, fh) };
    },

    fx(T, L) {
      const fl = flashAmt(T);
      const b = K([[72, 0.04], [76, 0.05], [80, 0.06], [86, 0.07], [92, 0.1], [96, 0.24], [102, 0.3]], T);
      return { bloom: b + 0.2 * fl };
    },

    render(g, T, L, env) {
      const { W, H, S } = env;
      G_ENV = env; frameCache(T, env);
      const sp = sunPos(T);
      const sx = sp.x * W, sy = sp.y * H;
      const stm = storm(T);
      const sky = skyAt(T);
      const hx = heroX(T) * W, hy = heroY(T) * H, hr = heroR(T) * S;
      const P = sss(85.5, 96, T);
      const b = BG.x;
      heroState(T, pulseAt(T));

      /* ================= half-res background: sky, sun, clouds, fog ================= */
      b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
      paintSky(b, sky);
      b.setTransform(BG.kx, 0, 0, BG.ky, 0, 0); // from here on: full-res coordinates
      drawStrands(b, T, W, H, S, hx, hy);
      drawSun(b, T, W, H, S, sx, sy);
      if (T < 98.3) {
        drawSeaField(b, T, env, sky, stm);
        drawTowers(b, T, env, sky, stm, hx, hy);
      }
      drawHeroCloud(b, T, env, hx, hy, P, stm);
      drawFog(b, T, env, hx, hy);
      drawHeroHalo(b, hx, hy, hr);
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.drawImage(SKYC.n, 0, 0);
      g.drawImage(BG.c, 0, 0, BG.w, BG.h, 0, 0, W, H);

      /* ================= full-res sparkle layer: glints, birds, vapour, drops, hero ================= */
      drawVapour(g, T, W, H, S, hx, hy);
      drawSeaGlints(g, T, W, H, S);
      drawBirds(g, T, W, H, S);
      drawDrops(g, T, W, H, S, hx, hy);
      drawHero(g, hx, hy, hr);
      drawRain(g, T, W, H, S);
    },
  });

  /* ------------------------------------------------------------------ sky strip */
  function paintSky(b, sky) {
    const h = SKYC.h, d = SKYC.img.data;
    let k = 0;
    for (let j = 0; j < h; j++) {
      const t = (j + 0.5) / h;
      while (k < 6 && t > SKY_STOPS[k + 1]) k++;
      const t0 = SKY_STOPS[k], t1 = SKY_STOPS[k + 1];
      const f = t <= t0 ? 0 : t >= t1 ? 1 : (t - t0) / (t1 - t0);
      const a = sky[k], c = sky[k + 1];
      const dz = (u.hash2(j, 5) - 0.5) * 1.1; // 1-level dither against banding
      const o = j * 4;
      d[o] = a[0] + (c[0] - a[0]) * f + dz; d[o + 1] = a[1] + (c[1] - a[1]) * f + dz; d[o + 2] = a[2] + (c[2] - a[2]) * f + dz; d[o + 3] = 255;
    }
    SKYC.x.putImageData(SKYC.img, 0, 0);
    b.drawImage(SKYC.c, 0, 0, 1, h, 0, 0, BG.w, BG.h);
  }

  /* ------------------------------------------------------------------ sun */
  // sun halo + crepuscular rays from cached sprites (source-over with warm alpha: cheap, reads as light)
  const beamSprite = () => u.sprite('s4_beam', 64, 256, (c, w, h) => {
    const gx = c.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(255,238,200,0)'); gx.addColorStop(0.25, 'rgba(255,238,200,0.35)'); gx.addColorStop(0.5, 'rgba(255,238,200,1)');
    gx.addColorStop(0.75, 'rgba(255,238,200,0.35)'); gx.addColorStop(1, 'rgba(255,238,200,0)');
    c.fillStyle = gx; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    const gy = c.createLinearGradient(0, h, 0, 0); // the sun (origin) is at the bottom of the sprite
    gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(0.5, 'rgba(0,0,0,0.5)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gy; c.fillRect(0, 0, w, h);
  });
  // The sun's halo and crepuscular rays are baked once (half-res) and just blitted, shifted to the sun's position.
  let SUNB = null;
  function bakeSun(S) {
    const Lx = S * 0.9, Rx = S * 1.85, Uy = S * 1.85, Dy = S * 0.9;
    const w = Math.ceil((Lx + Rx) * CS), h = Math.ceil((Uy + Dy) * CS);
    const c = u.canvas(w, h), x = c.getContext('2d');
    x.setTransform(CS, 0, 0, CS, 0, 0);
    const ox = Lx, oy = Uy;
    const R = S * 0.85;
    const hg = x.createRadialGradient(ox, oy, 0, ox, oy, R);
    hg.addColorStop(0, 'rgba(255,232,168,0.55)'); hg.addColorStop(0.12, 'rgba(255,222,150,0.38)');
    hg.addColorStop(0.4, 'rgba(255,214,150,0.14)'); hg.addColorStop(0.72, 'rgba(255,214,160,0.04)'); hg.addColorStop(1, 'rgba(255,214,160,0)');
    x.fillStyle = hg; x.fillRect(ox - R, oy - R, R * 2, R * 2);
    const bs = beamSprite();
    const nb = 7;
    for (let i = 0; i < nb; i++) {
      const f = i / (nb - 1);
      const ang = -1.3 + f * 1.12;
      const wd = 0.05 + 0.05 * u.noise1(i * 3.1 + 5);
      const len = S * (1.2 + 0.6 * u.noise1(i * 1.7));
      const a = (0.1 + 0.14 * u.noise1(i * 2.3 + 0.5)) * (1 - 0.3 * abs(f - 0.4));
      x.save();
      x.translate(ox, oy);
      x.rotate(ang + Math.PI / 2);          // beam sprite points "up", origin at its bottom centre
      x.globalAlpha = a * 0.8;
      x.drawImage(bs, -len * wd, -len, len * wd * 2, len);
      x.restore();
    }
    SUNB = { c, ox, oy, w: w / CS, h: h / CS };
  }
  function drawSun(g, T, W, H, S, sx, sy) {
    const sa = sunPow(T);
    if (sa < 0.04 || !SUNB) return;
    g.globalAlpha = min(1, sa * (0.88 + 0.12 * sin(T * 0.9)));
    g.drawImage(SUNB.c, sx - SUNB.ox, sy - SUNB.oy, SUNB.w, SUNB.h);
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ strands */
  function drawStrands(g, T, W, H, S, hx, hy) {
    const sp = wispSprite();
    const a0 = (1 - ss(88, 95, T));
    if (a0 < 0.01) return;
    g.save();
    const n = strands.length;
    const cm = cam(T);
    const dawnW = dawn(T);
    for (let i = 0; i < n; i++) {
      const s = strands[i];
      const par = 0.12 + 0.5 * s.q;
      let y = (s.q + cm * par * S / H) % 1.1; // slide down with the ascent
      y = (y < 0 ? y + 1.1 : y) - 0.05;
      const x = u.wrap(s.x + T * s.sp, -0.5, 1.5) * W;
      const w = s.w * W * (0.7 + s.q * 0.7), h = max(2, s.h * S * (1.2 + 0.8 * s.q));
      const fadeEdge = ss(-0.05, 0.08, y) * (1 - ss(0.9, 1.04, y));
      // never let a strand line up with the hero (it would read as a lens streak off the drop)
      const clear = abs(y * H - hy) / S > 0.1 ? 1 : ss(0.025, 0.1, abs(y * H - hy) / S);
      g.globalAlpha = s.a * 0.5 * (0.75 + 0.25 * sin(T * 0.2 + s.ph)) * a0 * fadeEdge * clear;
      g.drawImage(sp, x - w / 2, y * H - h / 2, w, h);
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ glints */
  function drawSeaGlints(g, T, W, H, S) {
    const e = ss(78, 83, T) * (1 - ss(88, 95, T));
    if (e < 0.01) return;
    const sp = sparkSprite(46);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < seaGl.length; i++) {
      const o = seaGl[i];
      if (o.conv && T >= o.s) continue;
      seaGlintPos(o, T, DP);
      if (DP.x < 0 || DP.x > W || DP.y < 0 || DP.y > H) continue;
      const tw = 0.35 + 0.65 * pow(max(0, sin(T * o.f * 1.8 + o.ph)), 3);
      const fa = (o.conv ? 1 : 1 - ss(o.fadeT - 3, o.fadeT, T)) * e * tw * (0.55 + 0.45 * o.z);
      if (fa < 0.02) continue;
      const r = S * 0.026 * (0.6 + 0.6 * o.z) * (0.5 + 0.5 * tw);
      g.globalAlpha = min(1, fa);
      g.drawImage(sp, DP.x - r, DP.y - r, r * 2, r * 2);
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ birds */
  function drawBirds(g, T, W, H, S) {
    const t0 = 79.0, t1 = 94;
    if (T < t0 - 2 || T > t1 + 2) return;
    const lx = W * (1.14 - (T - 80) * 0.082);
    const ly = H * (0.3 - (T - 80) * 0.006) + sin(T * 0.5) * 0.008 * H;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const bx = lx + b.ox * S * 1.0 + (i >= 9 ? 0 : 0) * 0, by = ly + b.oy * S * 1.0 + sin(T * 0.9 + b.ph) * 0.004 * S;
      if (bx < -S * 0.1 || bx > W + S * 0.1) continue;
      const w = S * 0.017 * b.s;
      const flap = sin(T * b.f * TAU * 0.5 + b.ph) * (0.6 + 0.4 * sin(T * 0.45 + b.ph2));
      const tipY = -flap * w * 0.75;
      const a = 0.78 * (i >= 9 ? 0.6 : 1);
      g.strokeStyle = `rgba(78,70,112,${a})`;
      g.lineWidth = max(1, S * 0.0026 * b.s);
      g.beginPath();
      g.moveTo(bx - w * (1 - 0.2 * abs(flap)), by + tipY);
      g.quadraticCurveTo(bx - w * 0.45, by + tipY * 0.6 - w * 0.34, bx, by);
      g.quadraticCurveTo(bx + w * 0.45, by + tipY * 0.6 - w * 0.34, bx + w * (1 - 0.2 * abs(flap)), by + tipY);
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ hero cloud */
  const RING_T = [87.6, 89.6, 91.4, 93.0];
  const HCG = { Rc: 0, wx: 1, fade: 1, lift: 0 };
  function heroGeom(T, env, P) {
    const { S } = env;
    HCG.wx = (env.portrait ? 0.82 : 1) * (1 + 0.45 * clamp(env.aspect - 1.3, 0, 1.2));
    HCG.Rc = S * (0.04 + 0.5 * pow(P, 1.15)) + S * 1.3 * pow(ss(93.6, 98.4, T), 1.2);
    HCG.fade = 1 - ss(95.4, 97.1, T);
    HCG.lift = -ss(94, 100, T) * 0.05 * S;
    return HCG;
  }
  function drawHeroCloud(g, T, env, hx, hy, P, stm) {
    const { W, H, S } = env;
    if (P < 0.004 || T > 96.7) return;
    const cv = CV.hero, x = cv.x;
    clearCV(cv);
    const { Rc, wx, fade: fadeAll, lift } = heroGeom(T, env, P);
    // once the cloud fills the view every puff is a screen-sized blend: draw every other one, a little denser
    const stride = Rc > S * 0.45 ? 2 : 1, boost = stride > 1 ? 1.22 : 1;
    for (let i = 0; i < heroPuffs.length; i += stride) {
      const p = heroPuffs[i];
      drawHeroPuff(cv, p, T, hx, hy + lift, Rc, wx, P, min(1, fadeAll * boost), W, H);
    }
    // sun-lit crown rim (additive, on the canvas so it stays cloud-shaped)
    const dw = dawn(T) * (1 - stm);
    if (dw > 0.02 && cv.x1 > cv.x0) {
      x.globalCompositeOperation = 'lighter';
      const spr = u.glowSprite(44, 90, 80, 'soft');
      for (let i = 0; i < heroPuffs.length; i += 3) {
        const p = heroPuffs[i];
        if (p.rho < 0.55 || p.x * 0.6 + p.y * 0.8 > -0.1) continue;
        const g_ = ss(p.rho * 0.62, p.rho * 0.62 + 0.38, P * 1.15);
        const px = hx + p.x * Rc * wx - p.r * Rc * 0.45, py = hy + lift + p.y * Rc - p.r * Rc * 0.5;
        const rr = p.r * Rc * 0.55;
        x.globalAlpha = 0.5 * dw * g_ * fadeAll;
        x.drawImage(spr, px - rr, py - rr, rr * 2, rr * 2);
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    }
    if (stm > 0.005) tint(cv, 'rgb(98,114,140)', stm * 0.8);
    blit(g, cv, W, H, 1);
    // growth pulses: soft rings of light leave the core each time a wave of drops arrives
    {
      const ring = u.glowSprite(44, 70, 82, 'ring');
      g.save();
      for (let k = 0; k < RING_T.length; k++) {
        const q = (T - RING_T[k]) / 1.9;
        if (q < 0 || q > 1) continue;
        const rr = S * (0.06 + 0.5 * (1 - pow(1 - q, 2)));
        g.globalAlpha = 0.5 * (1 - q) * (1 - q) * (1 - ss(92, 95, T));
        g.drawImage(ring, hx - rr, hy - rr, rr * 2, rr * 2);
      }
      g.restore();
    }
    // a soft pocket of shade around the drop, so its light reads against the white cloud
    {
      const sh = pow(P, 0.8) * ss(85.5, 88.5, T) * (1 - ss(94, 96.5, T)) * 0.62;
      if (sh > 0.01) {
        const rr = S * (0.09 + 0.17 * P);
        g.globalAlpha = sh;
        g.drawImage(shadeSprite(), hx - rr, hy - rr, rr * 2, rr * 2);
        g.globalAlpha = 1;
      }
    }
  }
  function drawHeroPuff(cv, p, T, hx, hy, Rc, wx, P, fadeAll, W, H) {
    const gi = ss(p.rho * 0.62, p.rho * 0.62 + 0.38, P * 1.15);
    if (gi < 0.012) return;
    const br = 1 + 0.035 * sin(T * 0.55 + p.ph);
    const px = hx + (p.x * Rc * wx) * br + sin(T * 0.3 + p.ph) * 0.008 * Rc;
    const py = hy + p.y * Rc * br + sin(T * 0.37 + p.ph * 1.4) * 0.008 * Rc;
    const r = p.r * Rc * (0.35 + 0.65 * gi) * (wx > 1 ? 1 + (wx - 1) * 0.35 : 1);
    if (px + r * 1.22 < 0 || px - r * 1.22 > W || py + r * 1.22 < 0 || py - r * 1.22 > H) return;
    const st = stageFor(px, py, T, 0.3 * (-p.x) + 0.3 * (-p.y));
    puff(cv, px, py, r, st, p.v, p.rho < 0.3 ? 0 : p.rho < 0.5 ? min(p.b, 1) : p.b, 0.96 * gi * fadeAll, p.sy);
  }
  // thin stratus sheets and cumulus we rise past (76-88): drawn into the cloud-sea canvas, behind the hero
  function drawNear(cv, T, env, hx, hy) {
    const { W, H, S } = env;
    if (T > 88.5) return;
    const cm = cam(T);
    const wisp = wispSprite();
    const x = cv.x;
    for (let i = 0; i < nearBands.length; i++) {
      const b = nearBands[i];
      const cy = (b.yc * H) + (cm - cam(b.Tc)) * S * b.pz;
      const wpx = b.w * S;
      const cx = b.xf * W + sin(T * 0.15 + b.ph) * 0.02 * W;
      let fa = b.a * ss(76.8, 81.5, T) * (1 - ss(84, 88, T));
      if (fa < 0.01) continue;
      // while the hero is still pinned in the clear dawn sky, keep passing clouds off the drop
      if (T < 85) {
        const ex = max(0, abs(cx - hx) - wpx * 0.5) / S, ey = max(0, abs(cy - hy) - wpx * 0.2) / S;
        fa *= 1 - (1 - ss(0.02, 0.2, hypot(ex, ey))) * (1 - ss(80, 85, T));
        if (fa < 0.01) continue;
      }
      if (b.sheet) {
        const hh = wpx * 0.2;
        if (cy - hh > H || cy + hh < 0) continue;
        x.globalAlpha = fa;
        const w2 = W * 1.5;
        x.drawImage(wisp, cx - w2 / 2, cy - hh, w2, hh * 2);
        if (cx - w2 / 2 < cv.x0) cv.x0 = cx - w2 / 2;
        if (cx + w2 / 2 > cv.x1) cv.x1 = cx + w2 / 2;
        if (cy - hh < cv.y0) cv.y0 = cy - hh;
        if (cy + hh > cv.y1) cv.y1 = cy + hh;
        continue;
      }
      if (cy - wpx * 0.5 > H || cy + wpx * 0.5 < 0) continue;
      if (b.img) placeImg(cv, b.img, cx, cy + wpx * 0.12, 1, fa);
    }
  }

  /* ------------------------------------------------------------------ drops */
  const hxy = { x: 0, y: 0 };
  function drawDrops(g, T, W, H, S, hx, hy) {
    if (T > 96.5) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const spk = sparkSprite(46), spkC = sparkSprite(190);
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? motes : seaGl;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (pass === 1 && !m.conv) continue; // plain sea glints are drawn elsewhere
        if (!m.conv || T < m.s) {
          if (pass === 1) continue;
          const fadeOut = m.conv ? 1 : 1 - ss(m.fadeT - 4, m.fadeT, T);
          if (fadeOut < 0.01) continue;
          moteAnchor(m, T, DP);
          if (DP.x < -10 || DP.x > W + 10 || DP.y < -10 || DP.y > H + 10) continue;
          const tw = 0.6 + 0.4 * sin(T * 1.4 + m.ph * 3);
          const a = 0.5 * tw * (0.4 + 0.6 * m.z) * fadeOut * (1 + 0.5 * ss(m.s - 1.5, m.s, T) * (m.conv ? 1 : 0));
          const r = S * (0.0028 + 0.0045 * m.z);
          g.globalAlpha = a > 1 ? 1 : a;
          g.drawImage(m.mspr, DP.x - r, DP.y - r, r * 2, r * 2);
          continue;
        }
        const q = (T - m.s) / m.dur;
        if (q > 1) continue;
        // in flight along its spiral: the comet tail of every drop goes into ONE batched path per hue (a handful of strokes per frame)
        dropPath(m, q, hx, hy, DP);
        const px = DP.x, py = DP.y;
        const arr = 1 - ss(0.9, 1, q);
        const grow = ss(0, 0.18, q);
        // a soft comet tail: one fading glow blob behind the head
        if (grow * arr > 0.1) {
          const ga = grow * arr;
          const rr = S * (0.0085 + 0.007 * m.z) * (0.6 + 0.4 * grow);
          dropPath(m, max(0, q - 0.05), hx, hy, hxy);
          g.globalAlpha = 0.6 * ga;
          g.drawImage(m.spr, hxy.x - rr, hxy.y - rr, rr * 2, rr * 2);
        }
        const rs = S * (0.022 + 0.011 * m.z) * (0.45 + 0.55 * grow);
        g.globalAlpha = min(1, 0.9 * (0.3 + 0.7 * grow) * arr);
        g.drawImage(m.cy > 100 ? spkC : spk, px - rs, py - rs, rs * 2, rs * 2);
      }
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ hero */
  // the arrival pings (each drop that reaches the hero makes its glow swell for a moment)
  function pulseAt(T) {
    if (T > 96.5) return 0;
    let p = 0;
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? motes : seaGl;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m.conv) continue;
        const e = T - m.s - m.dur;
        if (e > 0) p += exp(-e * 2.2);
      }
    }
    return min(p, 6);
  }
  const HS = { m: 0, pul: 1, hue: 48, sat: 90, glow: 1, ao: 1, ad: 0 };
  function heroState(T, pulse) {
    const m = ss(93, 97.5, T); // orb -> teardrop
    HS.m = m;
    HS.pul = 1 + 0.06 * sin(T * 2.4);
    HS.hue = lerp(PIN_IN.hue, PIN_OUT.hue, ss(91, 97.5, T));
    const kk = ss(91, 97.5, T);
    HS.sat = clamp(lerp(90, 30, sin(Math.PI * kk)), 20, 95);
    // in the open sky / against the white cloud the halo is eased right down (the core stays crisp); in the grey it settles at 0.7
    const dd = lerp(0.5 + 0.18 * ss(84, 88, T), 0.3, ss(93.5, 98.4, T));
    HS.glow = (1 + min(0.35, pulse * 0.05)) * (1 - dd * ss(76.5, 79, T));
    HS.ao = m < 0.97 ? (m > 0.001 ? 1 - m * 0.6 : 1) : 0;
    HS.ad = m > 0.001 ? m : 0;
    return HS;
  }
  // the two big soft halos of the hero are drawn into the half-res background (same recipe as Anim.hero.draw): 4x cheaper
  function drawHeroHalo(b, hx, hy, hr) {
    const R = hr * HS.pul, a = HS.ao + HS.ad, gl = HS.glow;
    u.glow(b, hx, hy, R * 18, HS.hue, HS.sat, 58, 0.2 * a * gl, 'soft');
    u.glow(b, hx, hy, R * 7, HS.hue, HS.sat, 62, 0.5 * a * gl, 'soft');
  }
  function drawHero(g, hx, hy, hr) {
    // glow: ~0 => hero.draw skips its two big halos (drawn above in the half-res layer); the crisp core is drawn here
    if (HS.ao > 0) hero.draw(g, hx, hy, hr, { hue: HS.hue, sat: HS.sat, form: 'orb', a: HS.ao, pulse: HS.pul, glow: 0.0001 });
    if (HS.ad > 0) hero.draw(g, hx, hy, hr, { hue: HS.hue, sat: HS.sat, form: 'drop', a: HS.ad, pulse: HS.pul, glow: 0.0001, angle: 0 });
  }

  /* ------------------------------------------------------------------ vapour column (B3): the hero's own rising motes */
  const moteSprite = () => u.sprite('s4_mote', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,252,240,1)'); g.addColorStop(0.28, 'rgba(255,244,214,0.9)'); g.addColorStop(0.55, 'rgba(255,228,170,0.28)'); g.addColorStop(1, 'rgba(255,220,150,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  const VAPN = 90;
  function drawVapour(g, T, W, H, S, hx, hy) {
    const e = 1 - ss(76, 83, T);
    if (e < 0.01) return;
    const len = hy + S * 0.05;
    const spr = moteSprite();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < VAPN; i++) {
      const m = vap[i];
      const s = u.wrap(m.u + T * 0.05 * m.v * S / len, 0, 1);
      const y = hy - s * len;
      const x = hx + (m.dx * (0.02 + 0.075 * s) + sin(T * 0.7 + m.ph) * 0.008) * S;
      const tw = 0.55 + 0.45 * sin(T * 1.9 + m.ph * 3);
      const a = e * tw * (0.95 - 0.5 * s) * ss(0.0, 0.06, s) * (1 - ss(0.86, 1, s)) * m.w;
      if (a < 0.02) continue;
      const r = S * 0.0105 * m.sz * (1 - 0.3 * s);
      g.globalAlpha = a > 1 ? 1 : a;
      g.drawImage(spr, x - r, y - r, r * 2, r * 2);
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ fog */
  const FOGK_TOP = [[94.0, rgb('#8d9db6')], [95.2, rgb('#7788a3')], [96.2, rgb('#5f7491')], [97.2, rgb('#485e7c')], [98.1, rgb('#34465f')]];
  const FOGK_BOT = [[94.0, rgb('#a9b7ca')], [95.2, rgb('#9aa9bf')], [96.2, rgb('#8aa0b8')], [97.2, rgb('#7890aa')], [98.1, rgb('#6d8199')]];
  function ck(keys, T) {
    const n = keys.length;
    if (T <= keys[0][0]) return keys[0][1];
    if (T >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (T > keys[i + 1][0]) i++;
    let s = (T - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
    return mixc(keys[i][1], keys[i + 1][1], s); // linear: no plateau at the keys, the darkening is one even ramp
  }
  // silent lightning inside the cloud: ONE smooth flash (~0.25 s up, ~0.5 s down) with a long soft afterglow, no flicker.
  // NOTE: s5_rain.js carries a numerically identical copy (the B4 window contains it) - keep them in sync.
  function flashAmt(T) {
    if (T < 98.65 || T > 101.7) return 0;
    const t0 = 98.7, tp = 99.35; // start / peak
    let v;
    if (T < tp) { const q = (T - t0) / (tp - t0); v = q <= 0 ? 0 : q * q * (3 - 2 * q); }
    else { const dt = T - tp; v = 0.58 * exp(-pow(dt / 0.5, 1.7)) + 0.42 * exp(-pow(dt / 1.2, 1.4)); }
    return 0.45 * v * (1 - ss(100.9, 101.7, T));
  }
  function drawFog(g, T, env, hx, hy) {
    const { W, H, S } = env;
    const prog = ss(94.0, 97.4, T);
    if (prog < 0.003 || !FOG) return;
    const top = ck(FOGK_TOP, T), bot = ck(FOGK_BOT, T);
    const { w, h, img } = FOG, d = img.data;
    const asp = W / H;
    const fl = flashAmt(T);
    const bil = ss(95.5, 98.2, T);
    const fxn = (hx / W + 0.12) * asp * 1.0, fyn = 0.3;
    const drift = T * 0.026, drift2 = T * 0.05;
    for (let j = 0; j < h; j++) {
      const ny = j / (h - 1);
      for (let i = 0; i < w; i++) {
        const nx = (i / (w - 1)) * asp;
        const v = u.fbm2(nx * 1.6 + 3.1 + T * 0.006, ny * 1.6 + drift, 2);
        const v2 = u.noise2(nx * 0.9 + 11 - T * 0.004, ny * 0.9 + drift * 0.7);
        const a = clamp((prog * 2.3 - (ny * 0.7 + (1 - v) * 0.6)) / 0.5, 0, 1);
        // great dark masses rolling upward past the hero: the cloud has started to fall
        const bm = ss(0.4, 0.72, u.fbm2(nx * 0.8 + 5.2, ny * 0.8 + drift2, 3));
        const lum = 0.86 + 0.28 * v + 0.1 * (v2 - 0.5) + bil * 0.36 * (0.2 - bm);
        let r = lerp(top[0], bot[0], ny) * lum, gg = lerp(top[1], bot[1], ny) * lum, b = lerp(top[2], bot[2], ny) * lum;
        if (fl > 0.002) {
          const dx = nx - fxn, dy = (ny - fyn) / asp * 1.2;
          const f = fl * exp(-(dx * dx + dy * dy) * 2.4) * (0.3 + 1.2 * v * v + 0.4 * bm);
          r += 40 * f; gg += 46 * f; b += 84 * f;
        }
        const o = (j * w + i) * 4;
        d[o] = r > 255 ? 255 : r; d[o + 1] = gg > 255 ? 255 : gg; d[o + 2] = b > 255 ? 255 : b; d[o + 3] = a * 255;
      }
    }
    FOG.x.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(FOG.c, 0, 0, W, H);
    // a slow breathing glow about the drop, and dark vapour tendrils streaming past it
    const ga = ss(95, 97.8, T) * (0.05 + 0.07 * (0.5 + 0.5 * sin(T * 1.25)));
    if (ga > 0.01) { const rr = S * 0.3; g.globalCompositeOperation = 'lighter'; g.globalAlpha = ga; g.drawImage(u.glowSprite(208, 55, 72, 'soft'), hx - rr, hy - rr, rr * 2, rr * 2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    const te = ss(96.6, 99, T);
    if (te > 0.01) {
      const ts = tendrilSprite();
      for (let i = 0; i < tendrils.length; i++) {
        const t = tendrils[i];
        const ty = u.wrap(t.y - T * 0.045 * t.v * S / H, -0.4, 1.4);
        const tx = hx + (t.x * 0.55 + sin(T * 0.25 + t.ph) * 0.04) * S + (t.x > 0 ? 0.05 : -0.05) * S;
        const tw = S * t.w * 1.9, th = S * t.h;
        g.globalAlpha = 0.5 * te * t.a * (0.8 + 0.2 * sin(T * 0.5 + t.ph));
        g.drawImage(ts, tx - tw / 2, ty * H - th / 2, tw, th);
      }
      g.globalAlpha = 1;
    }
    // flash bloom covering a good part of the frame
    if (fl > 0.01) {
      const fx = hx + S * 0.22, fy = hy - S * 0.2, R = S * 1.05;
      const gr = g.createRadialGradient(fx, fy, 0, fx, fy, R);
      gr.addColorStop(0, `rgba(215,225,255,${0.4 * fl})`); gr.addColorStop(0.4, `rgba(175,192,245,${0.22 * fl})`); gr.addColorStop(1, 'rgba(150,170,230,0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = gr;
      g.fillRect(fx - R, fy - R, R * 2, R * 2);
      g.globalCompositeOperation = 'source-over';
    }
  }
  const tendrilSprite = () => u.sprite('s4_tendril', 48, 160, (c, w, h) => {
    c.save(); c.translate(w / 2, h / 2); c.scale(w / h, 1);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, h / 2);
    g.addColorStop(0, 'rgba(26,40,66,0.8)'); g.addColorStop(0.3, 'rgba(28,42,68,0.5)'); g.addColorStop(0.65, 'rgba(30,44,70,0.17)'); g.addColorStop(1, 'rgba(30,44,70,0)');
    c.fillStyle = g; c.fillRect(-h / 2, -h / 2, h, h); c.restore();
  });

  /* ------------------------------------------------------------------ rain */
  function drawRain(g, T, W, H, S) {
    const e = 0.012 * ss(95.5, 98, T) + 0.085 * ss(98, 101.5, T); // faint start of the rain: fades in over ~3 s from 98
    if (e < 0.004) return;
    g.save();
    g.fillStyle = '#d6e2f2';
    const n = rain.length;
    for (let i = 0; i < n; i++) {
      const r = rain[i];
      // the streaks come in one by one: a drop's own start time, so the shower builds
      const vis = ss(95.8 + r.id * 4.6, 96.8 + r.id * 4.6, T);
      if (vis < 0.02) continue;
      const y = u.wrap(r.y + T * r.sp * 0.55 * S / H, -0.15, 1.1);
      const l = r.l * S * r.z;
      g.globalAlpha = e * r.z * vis;
      g.fillRect(r.x * W, y * H, max(1.6, S * 0.0022 * r.z), l);
    }
    g.restore();
  }
})();
