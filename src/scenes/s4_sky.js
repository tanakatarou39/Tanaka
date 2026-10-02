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
    [73, ['#7390c1', '#9298b4', '#b8a4a5', '#e1b297', '#f7c097', '#face9d', '#fcdea4', '#fee5a7']],
    [74, ['#708ebf', '#8896b6', '#a6a1ad', '#c5ada4', '#ddb99f', '#e8c6a0', '#f2d3a2', '#f8dba2']],
    [75, ['#6c89b9', '#7e92b5', '#949db0', '#aba8ab', '#c0b3a6', '#d2bfa3', '#e4c9a1', '#efd0a0']],
    [76, ['#6a87b6', '#7b90b2', '#8e9aaf', '#a2a5ac', '#b6b0a8', '#cabba5', '#dec6a1', '#e9cca0']],
    [80, ['#5a86c8', '#6c92cb', '#86a3d0', '#a1b3d1', '#bfc2cd', '#dccec4', '#f2d9b8', '#fbdfb2']],
    [86, ['#3f7cd2', '#5189d4', '#6e9ad6', '#8eaed9', '#afc2dd', '#d0d3de', '#efdcc6', '#fbe3b8']],
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
      a = rows[rows.length - 1][1]; b = SKY97; s = ss(91, 97.2, T);
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
  const sunPow = (T) => (0.1 + 0.9 * sss(76, 83, T)) * (1 - ss(91, 97, T));
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
  const COOL_B = { sh: [156, 168, 204], mid: [226, 234, 250], lit: [255, 255, 255] };
  const WARM_B = { sh: [168, 146, 188], mid: [255, 218, 196], lit: [255, 236, 186] };
  const COOL_D = { sh: [130, 144, 190], mid: [202, 214, 240], lit: [244, 247, 255] };
  const WARM_D = { sh: [134, 116, 172], mid: [230, 196, 186], lit: [252, 226, 192] };
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
    const fine = (x, y) => blobF(x, y) * 0.85 + (u.fbm2(x * 3.1 + ox, y * 3.1 + oy, 5) - 0.5) * 0.85 + (u.fbm2(x * 7.5 + oy, y * 7.5 + ox, 3) - 0.5) * 0.16 - 0.12;
    const bm = new Float32Array(PS * PS), am = new Uint8ClampedArray(PS * PS);
    for (let j = 0; j < PS; j++) {
      const y = ((j + 0.5) / PS) * 2 - 1;
      for (let i = 0; i < PS; i++) {
        const x = ((i + 0.5) / PS) * 2 - 1;
        const E = fine(x, y);
        const idx = j * PS + i;
        const m = 1 - ss(0.66, 0.97, sqrt(x * x + y * y));
        const a = ss(0.0, 0.34, E) * m;
        am[idx] = pow(a, 1.15) * 255;
        if (a < 0.004) { bm[idx] = 0.5; continue; }
        const Es = coarse(x, y);
        const Es1 = coarse(x + LDIR[0] * 0.13, y + LDIR[1] * 0.13);
        const Es2 = coarse(x + LDIR[0] * 0.3, y + LDIR[1] * 0.3);
        const El = fine(x + LDIR[0] * 0.05, y + LDIR[1] * 0.05);
        let b = 0.84 + 1.2 * (Es - Es1) + 0.55 * (Es - Es2) + 0.55 * (E - El) - 0.2 * clamp(Es, 0, 1.2) + 0.2 * (-y) + 0.06 * (-x);
        bm[idx] = b < 0 ? 0 : b > 1 ? 1 : b;
      }
    }
    // soften the lighting map (removes crunchy chips)
    const tmp = new Float32Array(PS * PS);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < PS; j++) for (let i = 0; i < PS; i++) {
        let acc = 0, n = 0;
        for (let k = -2; k <= 2; k++) { const ii = i + k; if (ii < 0 || ii >= PS) continue; acc += bm[j * PS + ii]; n++; }
        tmp[j * PS + i] = acc / n;
      }
      for (let j = 0; j < PS; j++) for (let i = 0; i < PS; i++) {
        let acc = 0, n = 0;
        for (let k = -2; k <= 2; k++) { const jj = j + k; if (jj < 0 || jj >= PS) continue; acc += tmp[jj * PS + i]; n++; }
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
      const li = ((bm[i] * (LUTN - 1)) | 0) * 3;
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
      const luts = [makeLUT(mixSet(COOL_D, WARM_D, w)), makeLUT(mixSet(COOL_B, WARM_B, w))];
      SPR[s] = [[], []];
      for (let b = 0; b < 2; b++) for (let v = 0; v < NV; v++) SPR[s][b][v] = colorize(maps[v], luts[b]);
    }
  }
  const wispSprite = () => u.sprite('s4_wisp', 256, 48, (c, w, h) => {
    c.save(); c.translate(w / 2, h / 2); c.scale(1, h / w);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(-w / 2, -w / 2, w, w); c.restore();
  });
  const sparkSprite = (hue) => u.sprite('s4_spark' + hue, 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 12);
    g.addColorStop(0, `hsla(${hue},40%,99%,1)`); g.addColorStop(0.4, `hsla(${hue},80%,85%,0.5)`); g.addColorStop(1, `hsla(${hue},80%,75%,0)`);
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    for (let k = 0; k < 2; k++) {
      c.save(); c.translate(32, 32); c.rotate(k * Math.PI / 2);
      const lg = c.createLinearGradient(-30, 0, 30, 0);
      lg.addColorStop(0, `hsla(${hue},60%,95%,0)`); lg.addColorStop(0.5, `hsla(${hue},60%,97%,0.9)`); lg.addColorStop(1, `hsla(${hue},60%,95%,0)`);
      c.fillStyle = lg; c.fillRect(-30, -0.9, 60, 1.8);
      c.restore();
    }
  });

  /* ------------------------------------------------------------------ static data */
  let motes = [], towers = [], nearBands = [], strands = [], heroPuffs = [], rain = [], birds = [], seaGl = [];

  function genCumulus(seed, n, hgt) {
    const R = u.rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const x = (R() + R() - 1) * 0.5 * 1.05;
      const prof = hgt * pow(max(0, 1 - pow(2 * x, 2)), 0.55) * (0.8 + 0.4 * R());
      const t = R();
      const yy = -prof * (0.1 + 0.9 * pow(t, 0.75));
      const r = (0.1 + 0.13 * R()) * (1.05 - 0.4 * t) * (0.55 + 0.45 * prof / hgt);
      out.push({ x, y: min(yy, -r * 0.5), r, v: (R() * NV) | 0, b: t > 0.34 ? 1 : 0, ph: R() * TAU, t, sy: yy > -r * 0.9 ? 0.66 : 1 });
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
      m.conv = Q() < 0.9;
      m.s = 79.2 + 10.6 * pow(Q(), 0.9);
      m.dur = 4.0 + 2.8 * Q();
      m.spin = 2.2 + 2.8 * Q();
      m.cy = Q() < 0.25 ? 190 : 46 + Q() * 8;
      m.fadeT = 86 + 6 * Q();
      m.sea = 0;
    }
    // cumulus towers standing in the cloud sea: screen x at T=90 (fraction of W), distance below the horizon at T=90 (H units)
    const td = [
      { xf: 0.33, dy: 0.1, size: 0.58, h: 0.85, n: 64, seed: 11 },
      { xf: 0.86, dy: 0.075, size: 0.5, h: 0.95, n: 60, seed: 12 },
      { xf: 0.6, dy: 0.02, size: 0.3, h: 0.55, n: 34, seed: 13 },
      { xf: 1.05, dy: 0.03, size: 0.34, h: 0.8, n: 38, seed: 14 },
      { xf: 0.05, dy: 0.045, size: 0.38, h: 0.7, n: 40, seed: 15 },
      { xf: 0.7, dy: 0.2, size: 0.8, h: 0.4, n: 40, seed: 16 },
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
    ].map((b) => Object.assign({ puffs: genCumulus(b.seed * 3331, 20, 0.28) }, b, { ph: N() * TAU }));
    // thin sky strands (cirrus)
    strands = Array.from({ length: 18 }, (_, i) => ({ x: N(), q: 0.04 + (i / 18) * 0.82 + N() * 0.04, w: 0.3 + N() * 0.55, h: 0.012 + N() * 0.02, sp: 0.004 + N() * 0.01, ph: N() * TAU, a: 0.3 + N() * 0.4 }));
    // hero cloud puffs
    const R = u.rng(9071);
    heroPuffs = [];
    for (let i = 0; i < 118; i++) {
      const th = R() * TAU, rho = pow(R(), 0.55);
      const x = rho * cos(th) * 1.12, yy = rho * sin(th);
      const y = yy < 0 ? yy * 1.0 : yy * 0.55;
      const r = (0.17 + 0.17 * R()) * (1.12 - 0.5 * rho);
      heroPuffs.push({ x, y, r, rho, ph: R() * TAU, v: (R() * NV) | 0, b: y < -0.12 + 0.3 * (R() - 0.5) ? 1 : 0, front: R() < 0.26 && rho < 0.78 ? 1 : 0, sy: 1 });
    }
    heroPuffs.sort((a, b) => b.y - a.y);
    // rain streaks
    rain = Array.from({ length: 56 }, () => ({ x: R(), y: R(), z: 0.4 + R() * 0.6, sp: 0.8 + R() * 0.5, l: 0.05 + R() * 0.06 }));
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
  let FOG = null;
  let G_ENV = { W: 1, H: 1, S: 1 };

  function mkCV(name, W, H) {
    const c = u.canvas(Math.ceil(W * CS), Math.ceil(H * CS));
    CV[name] = { c, x: c.getContext('2d') };
  }

  const SK = 0.12, SE = 0.012;
  const tOfDy = (dy) => SK / (dy + SE);
  const seaScroll = (T) => cam(T) * 3.2 + T * 0.05;
  const seaDrift = (T) => T * 0.035 + cam(T) * 0.25;
  // world point of something that sits at screen (xf, dy) at T=90
  function seaWorld(o, asp) {
    const t90 = tOfDy(o.dy);
    o.Z0 = t90 * 3 + seaScroll(90);
    o.X0 = (o.xf - 0.5) * asp * t90 * 1.6 + seaDrift(90);
    o.t90 = t90;
  }
  const SPJ = { x: 0, y: 0, t: 1 };
  function seaProj(o, T, env, out) {
    const { W, H, S } = env;
    const t = (o.Z0 - seaScroll(T)) / 3;
    if (t < 0.08) { out.t = 0; out.x = -9999; out.y = -9999; return out; }
    const dy = SK / t - SE;
    out.t = t;
    out.y = (horizonY(T) + dy) * H;
    out.x = (0.5 + (o.X0 - seaDrift(T)) / ((W / S) * t * 1.6)) * W;
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
        conv: G() < 0.55, s: 84.6 + 5.6 * G(), dur: 4 + 2.5 * G(), spin: 2.2 + 2.8 * G(), cy: G() < 0.3 ? 190 : 46 + G() * 8, fadeT: 90 + 4 * G() };
      seaWorld(o, W / S);
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
    anchor(m, m.s, A0);
    const dx = A0.x - hx, dy = A0.y - hy;
    const rho0 = hypot(dx, dy), th0 = atan2(dy, dx);
    q = q < 0 ? 0 : q > 1 ? 1 : q;
    const rho = rho0 * (1 - pow(q, 1.75));
    const th = th0 + m.spin * pow(q, 1.3);
    out.x = hx + cos(th) * rho; out.y = hy + sin(th) * rho * 0.92;
    return out;
  }

  /* ------------------------------------------------------------------ cloud drawing */
  function stageFor(px, py, T, bonus) {
    const { S } = G_ENV;
    const sp = SUN;
    const dist = hypot(px - sp.x * G_ENV.W, py - sp.y * G_ENV.H) / S;
    const w = dawn(T) * clamp(0.18 + 0.95 * exp(-dist / 0.85) + (bonus || 0), 0, 1);
    return floor(w * (NS - 1) + 0.5);
  }
  function puff(x, px, py, r, stage, v, b, a, sy) {
    if (a <= 0.01 || r < 0.5) return;
    x.globalAlpha = a > 1 ? 1 : a;
    r *= 1.22;
    const h = r * 2 * sy;
    x.drawImage(SPR[stage][b][v], px - r, py - h * 0.5, r * 2, h);
  }
  function clearCV(cv) {
    const x = cv.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.clearRect(0, 0, cv.c.width, cv.c.height);
    x.setTransform(CS, 0, 0, CS, 0, 0);
  }
  function tint(cv, W, H, fill, a) {
    const x = cv.x;
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = a;
    x.fillStyle = fill;
    x.fillRect(0, 0, W, H);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }

  function drawCumulus(x, cl, T, cx, base, wpx, T0b, a, forceStage) {
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
  const V0 = [104, 112, 172], V1 = [200, 204, 236], V2 = [252, 244, 236], WARMC = [255, 212, 148], STORMC = [112, 126, 152];
  function cloudH(nx, nz, lod) {
    const b = u.fbm2(nx, nz, lod > 0.5 ? 3 : 2);
    if (lod < 0.05) return b;
    // humps with sharp creases between them (cumulus cauliflower)
    const r1 = abs(2 * u.noise2(nx * 2.4 + 9.1, nz * 2.4 + 4.3) - 1);
    const r2 = abs(2 * u.noise2(nx * 5.3 + 2.2, nz * 5.3 + 7.7) - 1);
    return b * 0.46 + (r1 * 0.34 + r2 * 0.2 * lod) * lod + (1 - lod) * 0.54 * 0.5;
  }
  function drawSeaField(g, T, env, sky, stm) {
    const { W, H, S } = env;
    const yh = horizonY(T);
    if (yh >= 0.985 || !SEAF) return false;
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
      const al = ss(0, 0.02, dy);
      const t = SK / (max(dy, 0) + SE);
      const Z = (t * 3 + zs) * 0.9;
      const lod = ss(0.015, 0.1, dy);
      const hf = (1 - ss(0.0, 0.2, dy)) * 0.78;
      const xk = asp * t * 1.6 * 0.9;
      for (let i = 0; i < fw; i++) {
        const xn = (i + 0.5) / fw;
        const nx = (xn - 0.5) * xk + xs * 0.9;
        const h = cloudH(nx, Z, lod);
        const hl = cloudH(nx + sdx, Z + sdz, lod);
        let b = 0.68 + (h - 0.5) * 0.8 + (h - hl) * 5 * (0.35 + 0.65 * lod);
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
    g.drawImage(F.c, 0, max(0, j0 - 1), fw, fh - max(0, j0 - 1), 0, max(0, j0 - 1) / fh * H, W, H - max(0, j0 - 1) / fh * H);
    return true;
  }

  function drawTowers(g, T, env, sky, stm) {
    const { W, H, S } = env;
    const cv = CV.sea, x = cv.x;
    const yh = horizonY(T);
    if (yh >= 1.0) return;
    clearCV(cv);
    let any = false;
    // far to near
    const order = towers.slice().sort((a, b) => a.dy - b.dy);
    const hzc = u.css(mixc(sky[7], [232, 214, 226], 0.3));
    for (let k = 0; k < order.length; k++) {
      const tw = order[k];
      seaProj(tw, T, env, SPJ);
      if (SPJ.t <= 0) continue;
      const wpx = tw.size * S * (tw.t90 / SPJ.t);
      const base = SPJ.y + wpx * 0.03, cx = SPJ.x;
      if (base - tw.h * wpx > H || cx + wpx * 0.7 < 0 || cx - wpx * 0.7 > W) continue;
      drawCumulus(x, tw, T, cx, base, wpx, 0, 1, null);
      any = true;
      // distance haze: tints everything drawn so far (far towers get more)
      if (tw.dy < 0.1) tint(cv, W, H, hzc, 0.26 - tw.dy * 1.4);
    }
    if (!any) return;
    if (stm > 0.005) tint(cv, W, H, 'rgb(100,116,142)', stm * 0.85);
    g.drawImage(cv.c, 0, 0, W, H);
  }

  /* ------------------------------------------------------------------ the scene */
  Anim.defineScene({
    id: 's4_sky',

    init() { buildSprites(); genStatic(); Anim._s4dbg = { SPR }; /*DBG*/ },

    resize(env) {
      const { W, H } = env;
      genSea(env);
      mkCV('sea', W, H); mkCV('hero', W, H); mkCV('front', W, H);
      {
        const fh = 100, fw = clamp(Math.round(fh * W / H), 120, 200);
        const c2 = u.canvas(fw, fh), x2 = c2.getContext('2d');
        SEAF = { c: c2, x: x2, w: fw, h: fh, img: x2.createImageData(fw, fh) };
      }
      const fh = 64, fw = clamp(Math.round(fh * W / H), 40, 150);
      const c = u.canvas(fw, fh);
      FOG = { c, x: c.getContext('2d'), w: fw, h: fh, img: c.getContext('2d').createImageData(fw, fh) };
    },

    fx(T, L) {
      const fl = flashAmt(T);
      const b = K([[72, 0.04], [76, 0.05], [80, 0.1], [86, 0.12], [92, 0.16], [96, 0.26], [102, 0.3]], T);
      return { bloom: b + 0.45 * fl };
    },

    render(g, T, L, env) {
      const { W, H, S } = env;
      G_ENV = env;
      const sp = sunPos(T);
      const sx = sp.x * W, sy = sp.y * H;
      const stm = storm(T);
      const sky = skyAt(T);

      /* ---- sky ---- */
      const gr = g.createLinearGradient(0, 0, 0, H);
      for (let k = 0; k < 8; k++) gr.addColorStop(SKY_STOPS[k], u.css(sky[k]));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);

      /* ---- sun glow, god rays ---- */
      drawSun(g, T, W, H, S, sx, sy, sky);

      /* ---- far strands ---- */
      drawStrands(g, T, W, H, S);

      /* ---- cloud sea (height-field) + towers (sprites) ---- */
      if (T < 97.8) {
        drawSeaField(g, T, env, sky, stm);
        drawTowers(g, T, env, sky, stm);
      }
      // light grazing across the cloud sea
      const sa = sunPow(T);
      if (sa > 0.01) {
        u.glow(g, sx, sy, S * 0.8, 34, 95, 62, 0.12 * sa);
        u.glow(g, sx, sy, S * 0.2, 44, 70, 92, 0.3 * sa, 'core');
      }

      /* ---- glints in the clouds ---- */
      drawSeaGlints(g, T, W, H, S);

      /* ---- birds ---- */
      drawBirds(g, T, W, H, S);

      /* ---- the hero cloud (back) ---- */
      const hx = heroX(T) * W, hy = heroY(T) * H, hr = heroR(T) * S;
      const P = sss(85.5, 96, T);
      drawHeroCloud(g, T, env, hx, hy, P, stm, false);

      /* ---- converging drops + hero ---- */
      const pulse = drawDrops(g, T, W, H, S, hx, hy);
      drawHero(g, T, hx, hy, hr, pulse, P);

      /* ---- hero cloud (front veil) + near layers ---- */
      drawFront(g, T, env, hx, hy, P, stm);

      /* ---- fog / engulf ---- */
      drawFog(g, T, env, hx, hy);

      /* ---- rain, lightning ---- */
      drawRain(g, T, W, H, S);
      drawFlash(g, T, W, H, S, hx, hy);

      // the hero again, crisp on top of the fog (the cloud swallows everything but the drop)
      if (T > 93.5) drawHero(g, T, hx, hy, hr, 0, P);
    },
  });

  /* ------------------------------------------------------------------ sun */
  function drawSun(g, T, W, H, S, sx, sy, sky) {
    const sa = sunPow(T);
    const early = 0.18 * (1 - ss(73, 76, T)) * ss(72, 73.5, T) * 0.0; // s3 already supplies the faint glow
    if (sa < 0.01 && early < 0.01) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // big warm halo
    u.glow(g, sx, sy, S * 1.5, 30, 90, 58, 0.14 * sa);
    u.glow(g, sx, sy, S * 0.65, 38, 90, 66, 0.16 * sa);
    // crepuscular beams fanning up-right from the sun
    const nb = 9;
    for (let i = 0; i < nb; i++) {
      const f = i / (nb - 1);
      const ang = -1.32 + f * 1.15 + 0.05 * sin(T * 0.11 + i * 1.7);
      const wd = 0.07 + 0.08 * u.noise1(i * 3.1 + 5);
      const len = S * (1.5 + 0.8 * u.noise1(i * 1.7));
      const a = (0.018 + 0.026 * u.noise1(T * 0.1 + i * 2.3)) * sa * (1 - 0.3 * abs(f - 0.4));
      const ex = sx + cos(ang) * len, ey = sy + sin(ang) * len;
      const nx = -sin(ang), ny = cos(ang);
      const gl = g.createLinearGradient(sx, sy, ex, ey);
      gl.addColorStop(0, `rgba(255,226,170,${a})`); gl.addColorStop(0.5, `rgba(255,226,180,${a * 0.5})`); gl.addColorStop(1, 'rgba(255,226,190,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.moveTo(sx + nx * S * 0.01, sy + ny * S * 0.01);
      g.lineTo(ex + nx * len * wd, ey + ny * len * wd);
      g.lineTo(ex - nx * len * wd, ey - ny * len * wd);
      g.lineTo(sx - nx * S * 0.01, sy - ny * S * 0.01);
      g.fill();
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ strands */
  function drawStrands(g, T, W, H, S) {
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
      g.globalAlpha = s.a * 0.5 * (0.75 + 0.25 * sin(T * 0.2 + s.ph)) * a0 * fadeEdge * (0.5 + 0.5 * ss(72, 77, T));
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
  function drawHeroCloud(g, T, env, hx, hy, P, stm, front) {
    const { W, H, S } = env;
    if (P < 0.004 || T > 98.5) return;
    const cv = CV.hero, x = cv.x;
    clearCV(cv);
    const wx = (env.portrait ? 0.82 : 1) * (1 + 0.45 * clamp(env.aspect - 1.3, 0, 1.2));
    const Rc = S * (0.04 + 0.5 * pow(P, 1.15)) + S * 1.4 * ss(96, 100.5, T);
    const fadeAll = 1 - ss(96.8, 99, T);
    const lift = (T - 94) > 0 ? -(T - 94) * 0.01 * S : 0;
    for (let i = 0; i < heroPuffs.length; i++) {
      const p = heroPuffs[i];
      if (p.front) continue;
      drawHeroPuff(x, p, T, hx, hy + lift, Rc, wx, P, fadeAll, W, H);
    }
    // sun-lit crown rim (additive, on the canvas so it stays cloud-shaped)
    x.globalCompositeOperation = 'lighter';
    const dw = dawn(T) * (1 - stm);
    if (dw > 0.02) {
      for (let i = 0; i < heroPuffs.length; i += 3) {
        const p = heroPuffs[i];
        if (p.rho < 0.55 || p.x * 0.6 + p.y * 0.8 > -0.1) continue;
        const g_ = ss(p.rho * 0.62, p.rho * 0.62 + 0.38, P * 1.15);
        const px = hx + p.x * Rc * wx - p.r * Rc * 0.45, py = hy + lift + p.y * Rc - p.r * Rc * 0.5;
        const rr = p.r * Rc * 0.55;
        x.globalAlpha = 0.5 * dw * g_ * fadeAll;
        x.drawImage(u.glowSprite(44, 90, 80, 'soft'), px - rr, py - rr, rr * 2, rr * 2);
      }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    if (stm > 0.005) tint(cv, W, H, 'rgb(98,114,140)', stm * 0.8);
    g.drawImage(cv.c, 0, 0, W, H);
    // bright interior
    const ia = (0.26 * pow(P, 0.8)) * (1 - ss(93, 97, T));
    if (ia > 0.01) {
      u.glow(g, hx, hy, S * (0.1 + 0.42 * P), 44, 80, 84, ia);
    }
  }
  function drawHeroPuff(x, p, T, hx, hy, Rc, wx, P, fadeAll, W, H) {
    const gi = ss(p.rho * 0.62, p.rho * 0.62 + 0.38, P * 1.15);
    if (gi < 0.012) return;
    const br = 1 + 0.035 * sin(T * 0.55 + p.ph);
    const px = hx + (p.x * Rc * wx) * br + sin(T * 0.3 + p.ph) * 0.008 * Rc;
    const py = hy + p.y * Rc * br + sin(T * 0.37 + p.ph * 1.4) * 0.008 * Rc;
    const r = p.r * Rc * (0.35 + 0.65 * gi) * (wx > 1 ? 1 + (wx - 1) * 0.35 : 1);
    if (px + r < 0 || px - r > W || py + r < 0 || py - r > H) return;
    const st = stageFor(px, py, T, 0.3 * (-p.x) + 0.3 * (-p.y));
    puff(x, px, py, r, st, p.v, p.b, 0.96 * gi * fadeAll, p.sy);
  }
  function drawFront(g, T, env, hx, hy, P, stm) {
    const { W, H, S } = env;
    const cv = CV.front;
    const needNear = T < 88;
    const needHero = P > 0.004 && T < 98.5;
    if (!needNear && !needHero) return;
    clearCV(cv);
    const x = cv.x;
    if (needNear) {
      const cm = cam(T);
      const wisp = wispSprite();
      for (let i = 0; i < nearBands.length; i++) {
        const b = nearBands[i];
        const cy = (b.yc * H) + (cm - cam(b.Tc)) * S * b.pz;
        const wpx = b.w * S;
        if (cy - wpx * 0.5 > H || cy + wpx * 0.5 < 0) continue;
        const cx = b.xf * W + sin(T * 0.15 + b.ph) * 0.02 * W;
        const fa = b.a * ss(75.5, 77.5, T) * (1 - ss(84, 88, T));
        // soft sheet under the puffs
        x.globalAlpha = fa * 0.45;
        x.drawImage(wisp, cx - wpx * 1.1, cy - wpx * 0.13, wpx * 2.2, wpx * 0.26);
        drawCumulus(x, b, T, cx, cy + wpx * 0.12, wpx, 0, fa, null);
      }
    }
    if (needHero) {
      const wx = (env.portrait ? 0.82 : 1) * (1 + 0.45 * clamp(env.aspect - 1.3, 0, 1.2));
      const Rc = S * (0.04 + 0.5 * pow(P, 1.15)) + S * 1.4 * ss(96, 100.5, T);
      const fadeAll = 1 - ss(96.8, 99, T);
      const lift = (T - 94) > 0 ? -(T - 94) * 0.01 * S : 0;
      for (let i = 0; i < heroPuffs.length; i++) {
        const p = heroPuffs[i];
        if (!p.front) continue;
        const gi = ss(p.rho * 0.62, p.rho * 0.62 + 0.38, P * 1.15);
        if (gi < 0.012) continue;
        const px = hx + p.x * Rc * wx + sin(T * 0.3 + p.ph) * 0.008 * Rc, py = hy + lift + p.y * Rc + sin(T * 0.37 + p.ph * 1.4) * 0.008 * Rc;
        const r = p.r * Rc * (0.35 + 0.65 * gi);
        puff(x, px, py, r, stageFor(px, py, T, 0.3 * (-p.x) + 0.3 * (-p.y)), p.v, 1, 0.42 * gi * fadeAll, 1);
      }
    }
    if (stm > 0.005) tint(cv, W, H, 'rgb(98,114,140)', stm * 0.8);
    g.drawImage(cv.c, 0, 0, W, H);
  }

  /* ------------------------------------------------------------------ drops */
  function drawMoteGlow(g, m, x, y, W, H, S, a) {
    u.glow(g, x, y, S * (0.0028 + 0.0045 * m.z), m.h, 65, 82, a);
  }
  const hxy = { x: 0, y: 0 };
  function drawDrops(g, T, W, H, S, hx, hy) {
    g.save();
    g.globalCompositeOperation = 'source-over';
    let pulse = 0;
    const e2 = 1;
    const spk = sparkSprite(46), spkC = sparkSprite(190);
    // vapour motes (identical to s3's ambient field in the window)
    const all = motes;
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? motes : seaGl;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (pass === 1 && !m.conv) continue; // plain sea glints are drawn elsewhere
        const tw = 0.6 + 0.4 * sin(T * 1.4 + m.ph * 3);
        if (!m.conv || T < m.s) {
          if (pass === 1) continue;
          const fadeOut = m.conv ? 1 : 1 - ss(m.fadeT - 4, m.fadeT, T);
          if (fadeOut < 0.01) continue;
          anchor(m, T, DP);
          if (DP.x < -10 || DP.x > W + 10 || DP.y < -10 || DP.y > H + 10) continue;
          const a = 0.5 * tw * (0.4 + 0.6 * m.z) * fadeOut * (1 + 0.5 * ss(m.s - 1.5, m.s, T) * (m.conv ? 1 : 0));
          g.globalCompositeOperation = 'lighter';
          drawMoteGlow(g, m, DP.x, DP.y, W, H, S, a);
          continue;
        }
        const q = (T - m.s) / m.dur;
        if (q > 1) { const dt = T - (m.s + m.dur); pulse += exp(-dt * 2.2); continue; }
        // in flight
        g.globalCompositeOperation = 'lighter';
        dropPath(m, q, hx, hy, DP);
        const px = DP.x, py = DP.y;
        const arr = 1 - ss(0.9, 1, q);
        const grow = ss(0, 0.18, q);
        const sz = S * (0.0036 + 0.0045 * m.z) * (1 + 0.8 * grow);
        // trail
        for (let k = 5; k >= 1; k--) {
          const qq = q - k * 0.022;
          if (qq <= 0) break;
          dropPath(m, qq, hx, hy, hxy);
          const fk = 1 - k / 6;
          u.glow(g, hxy.x, hxy.y, sz * (0.7 + 0.9 * fk), m.cy, 70, 84, 0.55 * fk * fk * grow * arr);
        }
        u.glow(g, px, py, sz * 2.4, m.cy, 70, 84, 0.55 * (0.35 + 0.65 * grow) * arr);
        if (grow > 0.2) {
          const rs = S * 0.016 * (0.7 + 0.5 * m.z);
          g.globalAlpha = 0.85 * grow * arr;
          g.drawImage(m.cy > 100 ? spkC : spk, px - rs, py - rs, rs * 2, rs * 2);
          g.globalAlpha = 1;
        }
      }
    }
    g.restore();
    void all; void e2;
    return min(pulse, 6);
  }

  /* ------------------------------------------------------------------ hero */
  function drawHero(g, T, hx, hy, hr, pulse, P) {
    const m = ss(93, 97.5, T); // orb -> teardrop
    const pul = 1 + 0.06 * sin(T * 2.4);
    const hue = lerp(PIN_IN.hue, PIN_OUT.hue, ss(91, 97.5, T));
    const sat = lerp(90, 30, sin(m * Math.PI * ss(91, 97.5, T) * 0.98 + 0.0001)) ;
    const glow = 1 + min(0.7, pulse * 0.09);
    // extra warm glow while the cloud forms (bright core), fading before the B4 handoff
    const extra = ss(84, 90, T) * (1 - ss(94, 97.2, T));
    if (extra > 0.01) u.glow(g, hx, hy, hr * 22, 44, 80, 82, 0.12 * extra * (1 + pulse * 0.05));
    const s = clamp(sat, 20, 95);
    if (m < 0.999) hero.draw(g, hx, hy, hr, { hue, sat: s, form: 'orb', a: 1 - m * 0.0, pulse: pul, glow });
    if (m > 0.001) hero.draw(g, hx, hy, hr, { hue, sat: s, form: 'drop', a: m, pulse: pul, glow, angle: 0 });
  }

  /* ------------------------------------------------------------------ fog */
  const FOGK_TOP = [[93, rgb('#dfe5ef')], [95, rgb('#8b9ab2')], [97.4, rgb('#34465f')]];
  const FOGK_BOT = [[93, rgb('#eef0f3')], [95, rgb('#aab5c6')], [97.4, rgb('#6d8199')]];
  function ck(keys, T) {
    const n = keys.length;
    if (T <= keys[0][0]) return keys[0][1];
    if (T >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (T > keys[i + 1][0]) i++;
    let s = (T - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
    s = s * s * (3 - 2 * s);
    return mixc(keys[i][1], keys[i + 1][1], s);
  }
  function flashAmt(T) {
    if (T < 98.5 || T > 101) return 0;
    const pl = (t0, w) => (T < t0 ? exp(-pow((T - t0) / 0.035, 2)) : exp(-(T - t0) / w));
    return min(1, 0.7 * pl(98.93, 0.09) + 1.0 * pl(99.27, 0.22) + 0.22 * pl(99.27, 0.8));
  }
  function drawFog(g, T, env, hx, hy) {
    const { W, H, S } = env;
    const prog = ss(93.2, 97.4, T);
    if (prog < 0.003 || !FOG) return;
    const top = ck(FOGK_TOP, T), bot = ck(FOGK_BOT, T);
    const { w, h, img } = FOG, d = img.data;
    const asp = W / H;
    const fl = flashAmt(T);
    const fxn = (hx / W + 0.12) * asp * 1.0, fyn = 0.3;
    const drift = T * 0.022;
    for (let j = 0; j < h; j++) {
      const ny = j / (h - 1);
      for (let i = 0; i < w; i++) {
        const nx = (i / (w - 1)) * asp;
        const v = u.fbm2(nx * 1.6 + 3.1 + T * 0.006, ny * 1.6 + drift, 3);
        const v2 = u.noise2(nx * 0.9 + 11 - T * 0.004, ny * 0.9 + drift * 0.7);
        const a = clamp((prog * 2.3 - (ny * 0.7 + (1 - v) * 0.6)) / 0.5, 0, 1);
        const lum = 0.84 + 0.34 * v + 0.08 * (v2 - 0.5);
        let r = lerp(top[0], bot[0], ny) * lum, gg = lerp(top[1], bot[1], ny) * lum, b = lerp(top[2], bot[2], ny) * lum;
        if (fl > 0.002) {
          const dx = nx - fxn, dy = (ny - fyn) / asp * 1.2;
          const f = fl * exp(-(dx * dx + dy * dy) * 3.2) * (0.5 + 0.9 * v);
          r += 110 * f; gg += 120 * f; b += 170 * f;
        }
        const o = (j * w + i) * 4;
        d[o] = r > 255 ? 255 : r; d[o + 1] = gg > 255 ? 255 : gg; d[o + 2] = b > 255 ? 255 : b; d[o + 3] = a * 255;
      }
    }
    FOG.x.putImageData(img, 0, 0);
    g.save();
    g.imageSmoothingEnabled = true;
    g.drawImage(FOG.c, 0, 0, W, H);
    g.restore();
  }

  /* ------------------------------------------------------------------ rain + lightning */
  function drawRain(g, T, W, H, S) {
    const e = ss(96.2, 100, T) * 0.11;
    if (e < 0.004) return;
    g.save();
    g.fillStyle = '#d6e2f2';
    for (let i = 0; i < rain.length; i++) {
      const r = rain[i];
      const y = u.wrap(r.y + T * r.sp * 0.55 * S / H, -0.15, 1.1);
      const l = r.l * S * r.z;
      g.globalAlpha = e * r.z;
      g.fillRect(r.x * W, y * H, max(1, S * 0.0016 * r.z), l);
    }
    g.restore();
  }
  function drawFlash(g, T, W, H, S, hx, hy) {
    const f = flashAmt(T);
    if (f < 0.01) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const fx = hx + S * 0.2 + W * 0.0, fy = hy - S * 0.16;
    u.glow(g, fx, fy, S * 1.25, 225, 55, 80, 0.42 * f);
    u.glow(g, fx, fy, S * 0.5, 215, 45, 90, 0.5 * f, 'core');
    g.restore();
  }
})();
