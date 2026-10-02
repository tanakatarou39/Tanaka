/* ひとしずくの旅 — s8_return (T 166–180) 還る
 *
 * 166–170  (handoff B7) the night sky and the calm mirror sea of s7: the same stars, the same Milky Way haze, the same
 *          horizon glow at y .78, the hero star (.5,.3) with its cross flare, a few drifting petals, star streaks in the water.
 * 169.8    the star lets go of the sky: a slow falling star with a long soft tail; its mirror twin rises from the water to meet it.
 * 171.0    it touches the sea at (.5,.885): flash, a spire of light, beads that rise and fall (each leaving a tiny ring),
 *          four rings of light widen over the starry mirror and bend the reflections.
 * 173–175.5 the camera tips down: the horizon leaves the top, the ellipses open into circles, the light sinks under the water.
 * 175.4–178 the camera dives with the drop: a silver, shimmering sheet closes overhead and retreats upward; the water goes
 *          from deep blue to black; the drop shrinks.
 * 178.4–180 only the single point of light at (.5,.5) (r .0048 S, hue 190 = the first frame of s1) — the film loops.
 *
 * Pure function of T. Static art (sky/sea base, Milky Way, star lists) is built in init()/resize().
 */
(function () {
  'use strict';
  const { util: u, hero } = Anim;
  const TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, exp = Math.exp, sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor,
    min = Math.min, max = Math.max, hypot = Math.hypot, pow = Math.pow;
  const clamp = u.clamp, lerp = u.lerp, ss = u.smoothstep, sss = u.smootherstep, hash2 = u.hash2;
  const KS = (k, T) => u.keys(k, T, 'spline');
  const hash1 = (n) => hash2(n | 0, 31);

  const PIN_IN = Anim.hero.pins.find((p) => p.to === 's8_return') || { x: 0.5, y: 0.3, r: 0.018, hue: 215, form: 'star' };

  /* ------------------------------------------------------------------ timing */
  const FALL0 = 169.8;       // the star lets go
  const IMPACT = 171.0;      // it touches the water
  const LYF = 0.885;         // impact level (fraction of H) on the mirror sea
  const HZF = 0.78;          // horizon (fraction of H) — matches s7
  const RT = [171.0, 171.62, 172.3, 173.05]; // ring start times
  const RA0 = [1, 0.8, 0.62, 0.5];
  // the camera sinks with the drop: height above the water (1 = start, 0 = at the surface, <0 = under it)
  const HC_KEYS = [[173.0, 1], [174.2, 0.2], [174.75, 0], [175.9, -0.8], [177.4, -1.8], [178.6, -2.5]];
  const YE_KEYS = [[173.0, 0.78], [174.5, 0.58], [175.7, 0.38], [177.3, -0.02], [178.6, -0.4]];   // horizon / waterline (fraction of H)
  
  /* ------------------------------------------------------------------ B7 palettes (identical to s7) */
  const SKY_E = [0, 0.08, 0.2, 0.45, 0.8, 1.6, 3.4];
  const SKY7 = [[20, 33, 74], [14, 24, 60], [10, 18, 48], [6, 10, 30], [2, 3, 12], [2, 3, 10], [1, 2, 8]];
  const SEA7 = [[8, 13, 32], [3, 5, 15]];
  const STAR_RGB = [[200, 218, 255], [255, 250, 240], [255, 224, 188], [255, 205, 225], [175, 215, 255]];
  const STAR_CSS = STAR_RGB.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
  const rgbs = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  /* ------------------------------------------------------------------ Milky Way (same field as s7) */
  const MW_C = [0.0, 0.7], MW_A = 0.54, MW_UW = 5.6, MW_VH = 0.72;
  const mwCa = cos(MW_A), mwSa = sin(MW_A);
  function mwField(uu, vv) {
    const w = 0.2 + 0.08 * (u.fbm1(uu * 0.7 + 3.1, 3) - 0.5) * 2;
    const cv = (u.fbm1(uu * 0.9 + 11.3, 3) - 0.5) * 0.26;
    const dv = (vv - cv) / w;
    const core = exp(-dv * dv * 1.05);
    const clump = 0.25 + 1.1 * u.fbm2(uu * 2.2 + 5, vv * 4.4 + 9, 5);
    return [core, clump, dv];
  }
  const mwBand = (x, y) => {
    const dx = x - MW_C[0], dy = y - MW_C[1];
    const uu = dx * mwCa + dy * mwSa, vv = -dx * mwSa + dy * mwCa;
    return mwField(uu, vv)[0];
  };
  let MWTEX = null;
  function bakeMW() {
    const TW = 336, TH = 44;
    const glow = u.canvas(TW, TH), gc = glow.getContext('2d'), gi = gc.createImageData(TW, TH);
    for (let y = 0; y < TH; y++) {
      const vv = -(y / TH - 0.5) * MW_VH;
      for (let x = 0; x < TW; x++) {
        const uu = (x / TW - 0.5) * MW_UW;
        const f = mwField(uu, vv);
        const n2 = u.fbm2(uu * 6.5 + 20, vv * 11 + 3, 4);
        const bulge = exp(-((uu - 0.45) * (uu - 0.45) / 0.45 + vv * vv / 0.06)) * 0.8;
        let I = f[0] * f[1] * (0.65 + 0.7 * n2) + bulge * (0.5 + 0.5 * n2);
        I = I > 0 ? Math.min(1.6, I) : 0;
        const lane = u.fbm2(uu * 3.8 + 40, vv * 8 + 17, 5), lane2 = u.fbm2(uu * 9 + 7, vv * 15 + 31, 3);
        let d = clamp((lane - 0.5) * 3.4 + (lane2 - 0.5) * 0.7, 0, 1);
        d = d * d * (3 - 2 * d) * exp(-f[2] * f[2] * 0.5) * 0.7;
        I *= 1 - d;
        const ty = y / TH, tx = x / TW;
        I *= ss(0, 0.2, Math.min(ty, 1 - ty)) * ss(0, 0.06, Math.min(tx, 1 - tx));
        const warm = clamp(bulge * 1.05 + f[0] * 0.2, 0, 1);
        const r = lerp(105, 255, warm), gg = lerp(140, 205, warm), b = lerp(255, 160, warm);
        const al = clamp(I * 0.23, 0, 0.55);
        const p = (y * TW + x) * 4;
        const dn = (u.hash2(x, y) - 0.5) * 1.4;
        gi.data[p] = Math.min(255, r + dn); gi.data[p + 1] = Math.min(255, gg + dn); gi.data[p + 2] = Math.min(255, b + dn); gi.data[p + 3] = al * 255 + dn;
      }
    }
    gc.putImageData(gi, 0, 0);
    const UP = 3, big = u.canvas(TW * UP, TH * UP), bc = big.getContext('2d');
    bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = 'high';
    bc.drawImage(glow, 0, 0, TW * UP, TH * UP);
    MWTEX = big;
  }

  /* ------------------------------------------------------------------ sprites */
  let SP = null;
  function bakeSprites() {
    const spr = (key, w, h, f) => u.sprite('s8|' + key, w, h, f);
    SP = {
      gCold: u.glowSprite(212, 80, 70, 'soft'), gWarm: u.glowSprite(40, 90, 66, 'soft'), gPink: u.glowSprite(335, 70, 78, 'soft'),
      gBlue: u.glowSprite(214, 90, 62, 'soft'), coreWhite: u.glowSprite(220, 40, 92, 'core'),
      gCyan: u.glowSprite(195, 75, 70, 'soft'), gSilver: u.glowSprite(205, 45, 80, 'soft'), coreCyan: u.glowSprite(200, 60, 90, 'core'),
    };
    SP.petal = spr('petal', 32, 18, (c) => {
      c.translate(16, 9);
      const gr = c.createRadialGradient(-3, -1, 1, 0, 0, 14);
      gr.addColorStop(0, 'rgba(255,252,246,1)'); gr.addColorStop(0.55, 'rgba(255,226,232,0.95)'); gr.addColorStop(1, 'rgba(255,196,214,0)');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(-14, 0); c.bezierCurveTo(-8, -9, 6, -9, 14, 0); c.bezierCurveTo(6, 9, -8, 9, -14, 0); c.closePath(); c.fill();
    });
    SP.petalWarm = spr('petalWarm', 32, 18, (c) => {
      c.translate(16, 9);
      const gr = c.createRadialGradient(-3, -1, 1, 0, 0, 14);
      gr.addColorStop(0, 'rgba(255,250,232,1)'); gr.addColorStop(0.55, 'rgba(255,232,190,0.95)'); gr.addColorStop(1, 'rgba(255,205,150,0)');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(-14, 0); c.bezierCurveTo(-8, -9, 6, -9, 14, 0); c.bezierCurveTo(6, 9, -8, 9, -14, 0); c.closePath(); c.fill();
    });
    SP.streak = spr('streak', 32, 128, (c) => {
      c.translate(16, 64); c.scale(1, 4);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 16);
      gr.addColorStop(0, 'rgba(235,242,255,1)'); gr.addColorStop(0.35, 'rgba(190,210,255,0.4)'); gr.addColorStop(1, 'rgba(160,190,255,0)');
      c.fillStyle = gr; c.fillRect(-16, -16, 32, 32);
    });
    // vertical beam: soft horizontally, fades to nothing at the top, bright at the foot
    SP.beam = spr('beam', 32, 256, (c) => {
      let gr = c.createLinearGradient(0, 0, 32, 0);
      gr.addColorStop(0, 'rgba(190,220,255,0)'); gr.addColorStop(0.3, 'rgba(200,226,255,0.45)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(0.7, 'rgba(200,226,255,0.45)'); gr.addColorStop(1, 'rgba(190,220,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 32, 256);
      c.globalCompositeOperation = 'destination-in';
      gr = c.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = gr; c.fillRect(0, 0, 32, 256);
    });
    // soft shaft for the underwater light
    SP.shaft = spr('shaft', 64, 256, (c) => {
      let gr = c.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, 'rgba(150,200,240,0)'); gr.addColorStop(0.5, 'rgba(170,215,250,1)'); gr.addColorStop(1, 'rgba(150,200,240,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 256);
      c.globalCompositeOperation = 'destination-in';
      gr = c.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 256);
    });
  }

  /* ------------------------------------------------------------------ per-size state */
  let R = null;      // sizes
  let SKY = null;    // star lists
  let BASE = null;   // sky + sea + horizon glow (cached)
  const UF = { cv: null, cx: null, img: null, cols: 0, rows: 0, dith: null };
  const UO = { cv: null, cx: null, k: 0.5, kx: 0.5, ky: 0.5 };   // half-res target for the underwater body (soft, so it costs a quarter of the pixels)

  function buildSky(env) {
    const { W, H, S } = env;
    const Wr = W / S, Hr = H / S;
    R = { W, H, S, Wr, Hr, yH0: HZF * H };
    const xMax = Wr / 2 + 0.45, yMax = 1.12 * Hr + 0.55;
    const area = 2 * xMax * yMax;
    const pivY = 0.48 * Hr;
    R.pivY = pivY;
    const rnd = u.rng(77123);
    const stars = [];
    const gen = (kind, n, bandBias) => {
      let made = 0, guard = 0;
      while (made < n && guard++ < n * 60) {
        const x = (rnd() * 2 - 1) * xMax, y = rnd() * yMax;
        const bd = mwBand(x, y);
        const pa = (1 - bandBias + bandBias * (0.28 + 0.72 * bd)) * (0.3 + 0.7 * ss(0, 0.3, y));
        if (rnd() > pa) continue;
        const r1 = rnd(), r2 = rnd(), r3 = rnd();
        const s = { x, y, dx: x, dy: y - pivY, kind, ph: rnd() * TAU, f: 0.6 + 2.8 * r1, tone: 0, b: 0.5, tw: 0.4, sz: 1, refl: false };
        const tr = rnd();
        s.tone = tr < 0.5 ? 0 : tr < 0.8 ? 1 : tr < 0.94 ? 2 : tr < 0.97 ? 3 : 4;
        if (kind === 0) { s.b = 0.18 + 0.5 * r2 * r2 + 0.1 * r3; s.tw = 0.35 + 0.35 * r3; s.sz = r2 > 0.86 ? 1.5 : 1; }
        else if (kind === 1) { s.b = 0.5 + 0.38 * r2; s.tw = 0.22 + 0.25 * r3; s.sz = 1.5 + 1.2 * r2; }
        else { s.b = 0.88 + 0.12 * r2; s.tw = 0.14 + 0.12 * r3; s.sz = 2.4 + 1.2 * r2; s.f = 0.5 + 1.1 * r1; }
        s.refl = kind >= 1 && s.y < 0.8;
        stars.push(s); made++;
      }
    };
    gen(0, Math.round(700 * area), 1.0);
    gen(1, Math.round(70 * area), 0.8);
    gen(2, Math.round(7.5 * area), 0.35);
    const byTone = (a, b) => a.tone - b.tone;
    SKY = {
      faint: stars.filter((s) => s.kind === 0).sort(byTone),
      mid: stars.filter((s) => s.kind === 1).sort(byTone),
      bright: stars.filter((s) => s.kind === 2),
      refl: stars.filter((s) => s.refl && s.kind >= 1),
    };
  }

  function buildBase(env) {
    // the cached B7 world: sky gradient (SKY7), sea gradient (SEA7), horizon glow, sheen — same numbers as s7
    const { W, H, S } = env;
    const yH = HZF * H;
    BASE = u.canvas(W, H);
    const c = BASE.getContext('2d');
    // sky
    const gr = c.createLinearGradient(0, 0, 0, yH);
    const eTop = yH / S;
    const colAt = (e) => {
      let i = 0;
      while (i < SKY_E.length - 2 && e > SKY_E[i + 1]) i++;
      const t = clamp((e - SKY_E[i]) / (SKY_E[i + 1] - SKY_E[i]));
      return [lerp(SKY7[i][0], SKY7[i + 1][0], t), lerp(SKY7[i][1], SKY7[i + 1][1], t), lerp(SKY7[i][2], SKY7[i + 1][2], t)];
    };
    const es = [eTop];
    for (const e of SKY_E) if (e < eTop) es.push(e);
    es.sort((a, b) => b - a);
    for (const e of es) gr.addColorStop(clamp(1 - e * S / yH), rgbs(colAt(e)));
    c.fillStyle = gr; c.fillRect(0, 0, W, yH + 1);
    // sea
    const sg = c.createLinearGradient(0, yH, 0, yH + 0.24 * H);
    sg.addColorStop(0, rgbs(SEA7[0])); sg.addColorStop(1, rgbs(SEA7[1]));
    c.fillStyle = sg; c.fillRect(0, yH, W, H - yH);
    // horizon glow + sheen (additive)
    c.globalCompositeOperation = 'lighter';
    let g2 = c.createLinearGradient(0, yH - 0.07 * S, 0, yH + 0.006 * S);
    g2.addColorStop(0, 'rgba(30,48,110,0)'); g2.addColorStop(0.75, 'rgba(40,62,130,0.12)'); g2.addColorStop(0.92, 'rgba(70,95,170,0.09)'); g2.addColorStop(1, 'rgba(60,85,160,0)');
    c.fillStyle = g2; c.fillRect(0, yH - 0.07 * S, W, 0.076 * S);
    g2 = c.createLinearGradient(0, yH, 0, yH + 0.16 * S);
    g2.addColorStop(0, 'rgba(22,36,84,0.22)'); g2.addColorStop(1, 'rgba(10,18,50,0)');
    c.fillStyle = g2; c.fillRect(0, yH, W, 0.16 * S);
  }

  function ufSetup(env) {
    const n = 6500;
    UF.cols = Math.max(32, Math.round(Math.sqrt(n * env.W / env.H)));
    UF.rows = Math.max(32, Math.round(Math.sqrt(n * env.H / env.W)));
    UF.cv = u.canvas(UF.cols, UF.rows); UF.cx = UF.cv.getContext('2d');
    UF.img = UF.cx.createImageData(UF.cols, UF.rows);
    UF.dith = new Float32Array(UF.cols * UF.rows);
    UO.cv = u.canvas(Math.ceil(env.W * UO.k), Math.ceil(env.H * UO.k)); UO.cx = UO.cv.getContext('2d', { alpha: false });
    UO.kx = UO.cv.width / env.W; UO.ky = UO.cv.height / env.H;   // exact, so the buffer maps onto the canvas edge to edge
    const r = u.rng(8088);
    for (let i = 0; i < UF.dith.length; i++) UF.dith[i] = r() - 0.5;
  }

  /* ------------------------------------------------------------------ camera */
  const BW = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], BWP = [0, 0.3, 0.5, 0.72, 1];
  const cam = { yH: 0, hc: 1, eps: 0.2, z: 1, cx: 0, cy: 0, th: 0, dy: 0, hy: 0 };
  function setCam(T, env) {
    const { W, H } = env;
    const hc = clamp(KS(HC_KEYS, T), -3, 1);
    cam.hc = hc;
    cam.yH = KS(YE_KEYS, T) * H;
    cam.dy = cam.yH - HZF * H;
    cam.eps = max(0.008, 0.2 * abs(hc));
    cam.z = lerp(1, 1.45, sss(173, 175.5, T));
    cam.cx = W * 0.5;
    cam.cy = cam.yH + (LYF - HZF) * H * hc;   // where the surface point of impact is seen
    cam.hy = lerp(LYF, 0.5, sss(173.1, 175.9, T)) * H;   // eased, no overshoot: it settles exactly at (.5,.5) and stays
    cam.th = 0.0042 * (T - 152);
  }

  /* ------------------------------------------------------------------ ripples (shared by reflections / rings) */
  const NR = 4;
  const rgR = new Float32Array(NR), rgA = new Float32Array(NR), rgSw = new Float32Array(NR);
  let nAct = 0;
  const RIPPLE_V = 0.5, RIPPLE_TAU = 2.2;
  function ringRadius(a) { return RIPPLE_V * RIPPLE_TAU * (1 - exp(-a / RIPPLE_TAU)); } // S units
  function prepRipples(T) {
    nAct = 0;
    for (let k = 0; k < NR; k++) {
      const a = T - RT[k];
      if (a < 0) continue;
      const amp = RA0[k] * ss(0, 0.08, a) * exp(-a / 2.3) * (1 - ss(2.6, 4.0, a) * 0.0);
      if (amp < 0.02) continue;
      const Rr = ringRadius(a);
      rgR[nAct] = Rr; rgA[nAct] = amp; rgSw[nAct] = 0.03 + 0.03 * Rr; nAct++;
    }
  }
  const WAVE_LAMBDA = 0.075;
  function waveAt(x, y) {
    if (nAct === 0) return 0;
    const dx = (x - cam.cx) / (cam.z * R.S), dy = (y - cam.cy) / (cam.z * cam.eps * R.S);
    const d = hypot(dx, dy);
    let w = 0;
    for (let k = 0; k < nAct; k++) {
      const q = d - rgR[k];
      const e = exp(-q * q / (2 * rgSw[k] * rgSw[k]));
      if (e < 0.01) continue;
      w += rgA[k] * e * cos(q / WAVE_LAMBDA * TAU) / (0.6 + 1.6 * rgR[k]);
    }
    return w;
  }

  /* ------------------------------------------------------------------ the falling star */
  function starPos(T, out) {
    const { W, H, S } = R;
    const uq = (T - FALL0) / (IMPACT - FALL0);
    if (uq < 0) { // the streak the star pulls out of the sky (only the tail ever reaches here): the same curve, continued smoothly backwards
      const q = max(uq, -0.7);
      out[0] = W * 0.5 + S * 0.045 * sin(PI * q) * (1 - 0.3 * q);
      out[1] = PIN_IN.y * H - (LYF - PIN_IN.y) * H * pow(-q, 1.85);
      return out;
    }
    const uu = min(uq, 1);
    const e = pow(uu, 1.85);
    out[0] = W * 0.5 + S * 0.045 * sin(PI * uu) * (1 - 0.3 * uu);
    out[1] = lerp(PIN_IN.y * H, LYF * H, e);
    return out;
  }
  const _sp = [0, 0], _sq = [0, 0];

  /* ================================================================== draw: sky layer */
  function drawMilkyWay(g, T) {
    const a = (0.92 + 0.08 * sin(T * 0.37)) * (1 - 0.3 * ss(164, 168, T));
    const { W, S, pivY } = R;
    g.save();
    g.translate(W / 2, cam.yH - pivY * S); g.rotate(-cam.th);
    g.translate(MW_C[0] * S, -(MW_C[1] - pivY) * S); g.rotate(-MW_A);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = a;
    g.imageSmoothingEnabled = false;
    g.drawImage(MWTEX, -MW_UW * S / 2, -MW_VH * S / 2, MW_UW * S, MW_VH * S);
    g.restore();
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 1;
  }

  const crossLines = (g, x, y, L, a, th) => {
    g.fillStyle = 'rgb(214,226,255)';
    for (let k = 0; k < 3; k++) {
      const l = L * (1 - k * 0.34), al = a * (k === 0 ? 0.3 : k === 1 ? 0.32 : 0.4);
      g.globalAlpha = al > 1 ? 1 : al;
      g.fillRect(x - l, y - th * 0.5, l * 2, th); g.fillRect(x - th * 0.5, y - l, th, l * 2);
    }
  };
  const gl = (g, spr, x, y, r, a) => { if (a <= 0.004 || r < 0.4) return; g.globalAlpha = a > 1 ? 1 : a; g.drawImage(spr, x - r, y - r, r * 2, r * 2); };

  function drawStars(g, T, vis) {
    const { W, H, S, pivY } = R;
    const yH = cam.yH, th = cam.th, cT = cos(th), sT = sin(th);
    const yMaxPx = min(H, yH);
    if (yMaxPx < 2) return;
    const px = W * 0.5, Z1 = max(1, S / 680);
    g.globalCompositeOperation = 'lighter';
    const fvis = ss(-0.3, -0.04, cam.hc); // the hairline stars melt away first as the surface closes over
    let curTone = -1;
    for (let i = 0, n = fvis < 0.02 ? 0 : SKY.faint.length; i < n; i += 2) { // every other faint star (the hairline ones): same sky, half the work
      const s = SKY.faint[i];
      const ry = s.dy * cT + s.dx * sT + pivY;
      const Y = yH - ry * S;
      if (Y < -3 || Y > yMaxPx) continue;
      const X = px + (s.dx * cT - s.dy * sT) * S;
      if (X < -3 || X > W + 3) continue;
      let a = s.b * (1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph)));
      a *= (0.25 + 0.75 * ss(0, 0.3, ry)) * vis * 1.25 * fvis;
      if (a < 0.03) continue;
      if (s.tone !== curTone) { curTone = s.tone; g.fillStyle = STAR_CSS[curTone]; }
      g.globalAlpha = a > 1 ? 1 : a;
      const z = s.sz * Z1;
      g.fillRect(X - z * 0.5, Y - z * 0.5, z, z);
    }
    curTone = -1;
    for (let i = 0, n = SKY.mid.length; i < n; i++) {
      const s = SKY.mid[i];
      const ry = s.dy * cT + s.dx * sT + pivY;
      const Y = yH - ry * S;
      if (Y < -12 || Y > yMaxPx + 6) continue;
      const X = px + (s.dx * cT - s.dy * sT) * S;
      if (X < -12 || X > W + 12) continue;
      let a = s.b * (1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph)));
      a *= (0.3 + 0.7 * ss(0, 0.3, ry)) * vis;
      if (a < 0.03) continue;
      if (s.tone !== curTone) { curTone = s.tone; g.fillStyle = STAR_CSS[curTone]; }
      g.globalAlpha = a > 1 ? 1 : a;
      const z = s.sz * Z1;
      g.fillRect(X - z * 0.5, Y - z * 0.5, z, z);
      if (a > 0.6 && s.b > 0.76) gl(g, s.tone === 2 ? SP.gWarm : s.tone === 3 ? SP.gPink : SP.gCold, X, Y, S * (0.008 + 0.012 * s.b), a * 0.35);
    }
    for (let i = 0, n = SKY.bright.length; i < n; i++) {
      const s = SKY.bright[i];
      const ry = s.dy * cT + s.dx * sT + pivY;
      const Y = yH - ry * S;
      if (Y < -60 || Y > yMaxPx + 20) continue;
      const X = px + (s.dx * cT - s.dy * sT) * S;
      if (X < -60 || X > W + 60) continue;
      let a = s.b * (1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph)));
      a *= (0.4 + 0.6 * ss(0, 0.25, ry)) * vis;
      if (a < 0.04) continue;
      const tone = s.tone;
      gl(g, tone === 2 ? SP.gWarm : tone === 3 ? SP.gPink : tone === 4 ? SP.gBlue : SP.gCold, X, Y, S * (0.03 + 0.012 * s.b), a * 0.5);
      g.globalAlpha = min(1, a);
      g.fillStyle = STAR_CSS[tone];
      const z = s.sz * Z1;
      g.fillRect(X - z * 0.5, Y - z * 0.5, z, z);
      crossLines(g, X, Y, S * (0.05 + 0.045 * s.b) * (0.8 + 0.4 * sin(T * 0.8 + s.ph)), a * 0.9, max(1, S * 0.0016));
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  function drawSkyPetals(g, T) {
    const A = 1 - ss(171.2, 174.0, T);
    if (A < 0.01) return;
    const { W, H, S } = R;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const per = 16 + 8 * hash1(i * 5 + 1);
      const ph = T / per + hash1(i * 5 + 2);
      const f = ph - floor(ph);
      const x = (hash1(i * 7 + 3) + 0.06 * sin(T * 0.18 + i * 2.1) + (f - 0.5) * 0.08) * W;
      const y = (1.08 - f * 1.2) * H + cam.dy;
      const wob = sin(T * 0.9 + i * 1.7) * S * 0.02;
      const al = A * sin(PI * clamp(f * 1.1)) * (0.55 + 0.35 * hash1(i * 11)) * (1 - ss(cam.yH - 0.12 * S, cam.yH - 0.01 * S, y));
      if (al < 0.01) continue;
      const ang = sin(T * 1.1 + i) * 1.0 + i;
      const sz = S * (0.005 + 0.004 * hash1(i * 13));
      const c = cos(ang) * sz, sn = sin(ang) * sz;
      g.setTransform(c, sn, -sn, c, x + wob, y);
      g.globalAlpha = al * 0.8;
      g.drawImage(i % 2 ? SP.petal : SP.petalWarm, -1, -0.56, 2, 1.12);
      g.setTransform(1, 0, 0, 1, 0, 0);
      gl(g, SP.gPink, x + wob, y, sz * 5, 0.16 * al);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /* ================================================================== draw: the sea (reflections bent by ripples) */
  function drawReflections(g, T) {
    const { W, H, S, pivY } = R;
    const yH = cam.yH;
    if (yH > H - 2) return;
    const hc = cam.hc;
    const fadeR = ss(0.04, 0.5, hc);
    if (fadeR < 0.01) return;
    const th = cam.th, cT = cos(th), sT = sin(th);
    g.save();
    g.beginPath(); g.rect(0, max(0, yH), W, H); g.clip();
    g.globalCompositeOperation = 'lighter';
    const seaH = (H - yH) * hc;
    const rip = nAct > 0;
    const NSB = rip ? 5 : 4;
    const refl = SKY.refl;
    const stretch = hc;
    const glitter = 1 + 1.1 * ss(171, 171.9, T) * (1 - ss(173.4, 175, T)); // the landing wakes the whole sea
    for (let i = 0; i < refl.length; i++) {
      const s = refl[i];
      const ry = s.dy * cT + s.dx * sT + pivY;
      if (ry < 0.02) continue;
      const Ym = yH + ry * S * 0.5 * stretch;
      if (Ym > H + 20) continue;
      const X = W / 2 + (s.dx * cT - s.dy * sT) * S;
      if (X < -10 || X > W + 10) continue;
      let a = s.b * (1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph))) * (s.kind === 2 ? 1 : 0.4);
      a *= (0.2 + 0.8 * ss(0, 0.25, ry)) * fadeR * glitter;
      if (a < 0.03) continue;
      const len = S * (0.035 + 0.075 * s.b) * (s.kind === 2 ? 1.5 : 1) * (0.35 + 0.65 * hc);
      const wd = S * (s.kind === 2 ? 0.05 : 0.03);
      const NS = s.kind === 2 || !rip ? NSB : 3;
      const sl = len / NS;
      for (let q = 0; q < NS; q++) {
        const fq = (q + 0.5) / NS;
        const fl = 0.45 + 0.55 * sin(T * (1.7 + 0.5 * q) + s.ph * 3 + q * 2.3);
        const off = sin(T * 0.9 + s.ph * 2 + q * 1.9) * S * 0.004;
        const y0 = Ym - len / 2 + q * sl;
        let dx = 0, dy = 0, boost = 1;
        if (rip) {
          const w = waveAt(X, y0 + sl * 0.5);
          dx = w * S * 0.03; dy = w * S * 0.011; boost = 1 + 1.8 * max(0, w);
        }
        g.globalAlpha = min(1, a * 0.3 * fl * (1 - fq * 0.55) * boost);
        g.drawImage(SP.streak, X + off + dx - wd / 2, y0 + dy, wd, sl * 2.0);
      }
    }
    // quiet glints of the surface
    g.fillStyle = 'rgb(150,180,255)';
    for (let q = 0; q < 22; q++) {
      const t0 = pow(hash1(q * 13 + 5), 1.6);
      const y = yH + (0.01 * H + t0 * (H - yH) * 0.95) * hc;
      const x = (hash1(q * 17 + 9) + 0.02 * sin(T * 0.2 + q)) * W;
      const wd = S * (0.015 + 0.05 * (0.3 + t0));
      const fl = pow(0.5 + 0.5 * sin(T * (0.6 + 0.4 * hash1(q * 3)) + q * 2.7), 2);
      const w = rip ? waveAt(x, y) : 0;
      g.globalAlpha = min(1, fadeR * 0.16 * fl * (0.4 + 0.6 * (1 - t0)) * (1 + 1.6 * max(0, w)));
      g.fillRect(x - wd / 2 + w * S * 0.012, y + w * S * 0.004, wd, max(1, S * (0.0012 + 0.002 * t0)));
    }
    // the star's path of light on the water (the mirror of the hero) — gives way to the falling star's twin
    const hx = W / 2;
    const pa = (1 - ss(169.75, 170.7, T)) * fadeR;
    if (pa > 0.01) {
      for (let q = 0; q < 8; q++) {
        const t0 = q / 8;
        const yy = yH + t0 * seaH;
        const off = sin(T * 1.1 + q * 1.7) * S * 0.007 * (0.4 + t0);
        const fl = 0.55 + 0.45 * sin(T * (1.3 + q * 0.31) + q * 2.1);
        g.globalAlpha = pa * 0.2 * pow(1 - t0 * 0.8, 1.2) * fl;
        const wd = S * (0.02 + 0.07 * t0);
        g.drawImage(SP.streak, hx + off - wd / 2, yy, wd, seaH / 8 * 2.2);
      }
    }
    // the falling star's mirror twin rises from the deep to meet it
    if (T > FALL0 + 0.25 && T < IMPACT + 0.05) {
      starPos(T, _sp);
      const ly = LYF * H;
      const yr = 2 * ly - _sp[1];
      const near = 1 - ss(0.0, 0.16 * H, ly - _sp[1]);
      const al = ss(FALL0 + 0.25, FALL0 + 0.9, T) * (0.55 + 0.45 * near);
      if (yr < H + 0.3 * S) {
        const len = S * 0.22 * (0.6 + 0.8 * near);
        g.globalAlpha = 0.75 * al;
        g.drawImage(SP.streak, _sp[0] - S * 0.03, yr - len / 2, S * 0.06, len);
        gl(g, SP.gCold, _sp[0], yr, S * 0.07, 0.5 * al);
        gl(g, SP.coreWhite, _sp[0], yr, S * 0.022, 0.8 * al * near);
      }
    }
    g.restore();
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /* ================================================================== draw: rings of light */
  function drawRings(g, T) {
    const { W, H, S } = R;
    const { cx, cy, eps, z } = cam;
    const yH = cam.yH, hc = cam.hc;
    if (hc < -1.4) return;
    g.save();
    g.beginPath();
    if (hc >= 0) g.rect(0, max(0, yH), W, H); else g.rect(0, 0, W, max(0, yH));
    g.clip();
    g.globalCompositeOperation = 'lighter';
    // as the camera meets the surface the rings crowd into one bright line; from below they glow quietly on the silver sheet
    const edgeBoost = 1 + 1.1 * exp(-hc * hc / 0.06);
    const under = hc < 0 ? 0.75 * (1 - ss(-0.04, -0.7, hc)) : 1;
    for (let k = 0; k < NR; k++) {
      const a = T - RT[k];
      if (a < 0) continue;
      const amp = RA0[k] * ss(0, 0.08, a) * exp(-a / 2.3) * under * edgeBoost;
      if (amp < 0.015) continue;
      const Rr = ringRadius(a) * S * z;
      if (Rr < 1) continue;
      g.save();
      g.translate(cx, cy); g.scale(1, eps);
      const aa = amp * (0.5 + 0.5 * ss(0.0, 0.5, a));
      const rn = Rr / (S * z);
      // broad soft swell, mid body, thin bright crest
      g.lineWidth = S * z * (0.07 + 0.06 * rn);
      g.strokeStyle = `rgba(70,120,230,${0.085 * aa})`;
      g.beginPath(); g.arc(0, 0, Rr, 0, TAU); g.stroke();
      g.lineWidth = S * z * (0.02 + 0.016 * rn);
      g.strokeStyle = `rgba(140,190,255,${0.26 * aa})`;
      g.beginPath(); g.arc(0, 0, Rr, 0, TAU); g.stroke();
      g.lineWidth = S * z * 0.0055;
      g.strokeStyle = `rgba(215,235,255,${0.5 * aa})`;
      g.beginPath(); g.arc(0, 0, Rr, 0, TAU); g.stroke();
      // light caught on the crests: arcs that drift and flicker, strongest on the far side (it faces the horizon glow)
      g.lineWidth = S * z * 0.011;
      g.lineCap = 'round';
      for (let j = 0; j < 12; j++) {
        const phi = (j + 0.5) / 12 * TAU + 0.35 * sin(T * 0.5 + j * 1.7 + k);
        const far = 0.55 + 0.45 * (-sin(phi));
        const nz = u.noise1(j * 1.7 + T * 0.8 + k * 3.1);
        const al = aa * far * (0.2 + 0.8 * pow(nz, 1.6)) * 0.85;
        if (al < 0.02) continue;
        g.strokeStyle = `rgba(245,250,255,${al})`;
        g.beginPath(); g.arc(0, 0, Rr, phi - 0.2, phi + 0.2); g.stroke();
      }
      g.restore();
      // sparkles on the crest
      for (let j = 0; j < 16; j++) {
        const psi = hash1(k * 40 + j * 3 + 1) * TAU;
        const fl = pow(max(0, sin(T * (1.1 + hash1(k * 40 + j * 3 + 2) * 1.6) + j * 2.3)), 4);
        const al = aa * fl * (0.55 + 0.45 * (-sin(psi)));
        if (al < 0.03) continue;
        const X = cx + cos(psi) * Rr, Y = cy + sin(psi) * Rr * eps;
        gl(g, SP.gSilver, X, Y, S * 0.018, al * 0.7);
        g.globalAlpha = min(1, al); g.fillStyle = '#eef6ff';
        const zq = max(1.2, S * 0.0022);
        g.fillRect(X - zq, Y - zq * 0.35, zq * 2, zq * 0.7);
      }
    }
    g.restore();
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /* ================================================================== the falling star */
  function drawFall(g, T) {
    const { W, H, S } = R;
    if (T < FALL0 - 0.05 || T > IMPACT + 0.55) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    starPos(T, _sp);
    const uu = clamp((T - FALL0) / (IMPACT - FALL0));
    const speed = ss(0.0, 0.45, uu) * (1 - ss(IMPACT, IMPACT + 0.5, T));
    // tail: a long soft streak behind the star, along the direction it came from, with a faint sway
    starPos(min(T + 0.04, IMPACT - 0.001), _sq);
    let vx = _sq[0] - _sp[0], vy = _sq[1] - _sp[1];
    const vl = hypot(vx, vy) || 1;
    const bl = ss(0.0, 0.25, uu);
    let dx = lerp(-0.12, -vx / vl, bl), dy = lerp(-1, -vy / vl, bl);
    const dl = hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const Lt = H * (0.05 + 0.5 * speed);
    const NT = 20;
    const X = [], Y = [];
    const hx0 = _sp[0], hy0 = _sp[1];
    for (let j = 0; j <= NT; j++) {
      const f = j / NT, ff = pow(f, 1.1);
      const sw = sin(f * PI) * S * 0.014 * sin(T * 3 + f * 4) * speed;
      X.push(hx0 + dx * Lt * ff - dy * sw); Y.push(hy0 + dy * Lt * ff + dx * sw);
    }
    const hx = _sp[0], hy = _sp[1];
    const tx = X[NT], ty = Y[NT];
    if (hypot(hx - tx, hy - ty) > 3) {
      const gr = g.createLinearGradient(hx, hy, tx, ty);
      const a0 = 0.95 * speed;
      gr.addColorStop(0, `rgba(235,244,255,${a0})`); gr.addColorStop(0.18, `rgba(170,205,255,${a0 * 0.55})`);
      gr.addColorStop(0.6, `rgba(100,150,240,${a0 * 0.18})`); gr.addColorStop(1, 'rgba(70,110,230,0)');
      g.strokeStyle = gr;
      for (let pass = 0; pass < 3; pass++) {
        g.lineWidth = S * (pass === 0 ? 0.045 : pass === 1 ? 0.016 : 0.005);
        g.globalAlpha = pass === 0 ? 0.13 : pass === 1 ? 0.36 : 0.95;
        g.beginPath(); g.moveTo(X[0], Y[0]);
        for (let j = 1; j <= NT; j++) g.lineTo(X[j], Y[j]);
        g.stroke();
      }
      // dust of light along the tail
      for (let j = 1; j < NT; j += 1) {
        const f = j / NT;
        const al = (1 - f) * (1 - f) * 0.5 * speed;
        gl(g, SP.gCold, X[j], Y[j], S * (0.03 - 0.018 * f), al);
      }
      // sparkling motes shed behind the star
      for (let m = 0; m < 14; m++) {
        const f = (hash1(m * 7 + 2) * 0.9 + 0.05);
        const jj = Math.min(NT, Math.floor(f * NT));
        const tw = pow(max(0, sin(T * 9 + m * 2.7)), 2);
        const off = (hash1(m * 7 + 5) - 0.5) * S * 0.035 * f;
        gl(g, SP.coreWhite, X[jj] + off, Y[jj], S * 0.007, 0.6 * (1 - f) * speed * tw);
      }
    }
    g.restore();
    g.globalAlpha = 1;
  }

  /* ================================================================== impact: flash, spire, beads, motes */
  const BEADS = [];
  const MOTES = [];
  function initBeads() {
    const r = u.rng(5555);
    BEADS.length = 0; MOTES.length = 0;
    for (let i = 0; i < 20; i++) {
      BEADS.push({ phi: r() * TAU, vh: 0.06 + 0.3 * r() * r() + 0.04, v: 0.42 + 0.55 * r(), d: r() * 0.35, hue: 190 + 40 * r(), sz: 0.0045 + 0.004 * r() });
    }
    for (let i = 0; i < 26; i++) {
      MOTES.push({ x: (r() - 0.5) * 0.34, v: 0.05 + 0.1 * r(), d: r() * 1.6, ph: r() * TAU, sz: 0.004 + 0.006 * r(), life: 2.4 + 2.2 * r() });
    }
  }
  function microRing(g, cx, cy, rr, eps, al, S) {
    if (al < 0.02) return;
    g.save();
    g.translate(cx, cy); g.scale(1, eps);
    g.beginPath(); g.arc(0, 0, rr, 0, TAU);
    g.lineWidth = max(2.5, S * 0.012);
    g.strokeStyle = `rgba(120,170,255,${al * 0.25})`; g.stroke();
    g.lineWidth = max(1.1, S * 0.0028);
    g.strokeStyle = `rgba(210,232,255,${al * 0.8})`; g.stroke();
    g.restore();
  }
  function drawImpact(g, T) {
    const a = T - IMPACT;
    if (a < -0.02) return;
    const { W, H, S } = R;
    const { cx, cy, eps, z } = cam;
    const yH = cam.yH;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // --- flash + flat splash light on the water
    const fl = exp(-a / 0.28) * ss(-0.02, 0.02, a);
    if (fl > 0.04) {
      gl(g, SP.gCold, cx, cy, S * 0.34 * z, 0.62 * fl);
      gl(g, SP.coreWhite, cx, cy, S * 0.1 * z, 0.8 * fl);
      g.save();
      g.translate(cx, cy); g.scale(1, 0.14 * (eps / 0.2 > 1.5 ? 1.5 : 1));
      g.globalAlpha = min(1, 0.9 * fl);
      g.drawImage(SP.gSilver, -S * 0.9, -S * 0.9, S * 1.8, S * 1.8);
      g.restore();
    }
    // --- spire of light rising from the surface
    if (a > 0 && a < 1.8) {
      const h = S * 0.5 * (1 - exp(-a * 4.5)) * (1 - ss(0.5, 1.8, a) * 0.5);
      const w = S * (0.026 * exp(-a * 1.2) + 0.006);
      const al = exp(-a / 0.5) * ss(0, 0.05, a);
      if (al > 0.01 && h > 2) {
        g.globalAlpha = min(1, 0.95 * al);
        g.drawImage(SP.beam, cx - w / 2, cy - h, w, h);
        gl(g, SP.gCold, cx, cy - h * 0.2, S * 0.05, 0.4 * al);
      }
    }
    // --- crown + beads: rise on arcs and fall back, each landing makes a tiny ring
    const gG = 1.35;
    for (let i = 0; i < BEADS.length; i++) {
      const b = BEADS[i];
      const t = T - IMPACT - b.d;
      if (t < 0) continue;
      const tl = 2 * b.v / gG;
      const hgt = b.v * t - 0.5 * gG * t * t;
      const hx = cos(b.phi) * b.vh * min(t, tl), hz = sin(b.phi) * b.vh * min(t, tl);
      const gx = cx + hx * S * z, gy = cy + hz * S * z * eps;
      if (t < tl) {
        const Y = gy - hgt * S * z;
        const al = ss(0, 0.06, t) * (0.7 + 0.3 * sin(T * 7 + i));
        // short trail
        for (let q = 1; q <= 3; q++) {
          const tq = t - q * 0.035; if (tq < 0) break;
          const hq = b.v * tq - 0.5 * gG * tq * tq;
          gl(g, SP.gCyan, cx + cos(b.phi) * b.vh * tq * S * z, gy - hq * S * z + (gy - gy) , S * b.sz * 2.2 * (1 - q * 0.22), al * 0.35 * (1 - q * 0.25));
        }
        gl(g, SP.gCold, gx, Y, S * b.sz * 5, al * 0.5);
        gl(g, SP.coreWhite, gx, Y, S * b.sz * 2.2, al);
      } else {
        const ta = t - tl;
        if (ta < 1.0) microRing(g, gx, gy, S * z * (0.012 + 0.07 * (1 - exp(-ta * 2.6))), eps, 0.55 * (1 - ta) * (1 - ta) * b.sz / 0.0065, S);
        if (ta < 0.12) gl(g, SP.gSilver, gx, gy, S * 0.02, 0.6 * (1 - ta / 0.12));
      }
    }
    // --- slow motes of light lifted from the spot (they rise and fade — the light is being returned)
    for (let i = 0; i < MOTES.length; i++) {
      const m = MOTES[i];
      const t = T - IMPACT - 0.2 - m.d;
      if (t < 0 || t > m.life) continue;
      const f = t / m.life;
      const al = sin(PI * f) * (0.55 + 0.45 * sin(T * 3 + m.ph)) * ss(0.02, 0.5, cam.hc);
      const X = cx + (m.x * S + sin(t * 1.3 + m.ph) * S * 0.02) * z;
      const Y = cy - (m.v * t * S * (0.9 + 0.2 * f)) * z;
      gl(g, SP.gSilver, X, Y, S * m.sz * 3, al * 0.5);
      gl(g, SP.coreWhite, X, Y, S * m.sz, al * 0.9);
    }
    // --- light that has sunk into the water: a cool glow that lies under the surface and fades
    const sink = ss(0.1, 0.8, a) * exp(-max(0, a - 0.8) / 3.2);
    if (sink > 0.01) {
      g.save();
      g.translate(cx, cam.hy); g.scale(1, 0.6);
      g.globalAlpha = min(1, 0.7 * sink);
      g.drawImage(SP.gCyan, -S * 0.3 * z, -S * 0.3 * z, S * 0.6 * z, S * 0.6 * z);
      g.restore();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  /* ================================================================== hero */
  function heroState(T) {
    const { S } = R;
    if (T < FALL0) {
      return { x: R.W * 0.5, y: PIN_IN.y * R.H, r: S * PIN_IN.r, hue: PIN_IN.hue, form: 'star', a: 1, pulse: 1 + 0.06 * sin(T * 2.4), glow: 1, flare: 1 };
    }
    if (T < IMPACT) {
      starPos(T, _sp);
      const uu = (T - FALL0) / (IMPACT - FALL0);
      return { x: _sp[0], y: _sp[1], r: S * PIN_IN.r, hue: PIN_IN.hue, form: 'star', a: 1, pulse: 1 + 0.06 * sin(T * 2.4), glow: 1 + 0.5 * ss(0.5, 1, uu), flare: 1 - ss(0.0, 0.85, uu) };
    }
    const rr = KS([[IMPACT, 0.017], [172.5, 0.0135], [175.5, 0.0125], [177, 0.0095], [178.3, 0.0048], [180, 0.0048]], T);
    const hue = KS([[IMPACT, 212], [174, 203], [177, 196], [178.4, 190]], T);
    const calm = ss(176.5, 178.2, T);
    const pulse = (1 + 0.05 * sin(T * 2.4)) * (1 - 0.0 * calm);
    const a = 1 - 0.18 * ss(IMPACT + 0.4, IMPACT + 2.5, T) * (1 - ss(175.0, 176.4, T));
    return { x: cam.cx, y: cam.hy, r: S * rr, hue, form: 'orb', a, pulse, glow: lerp(1, 0.75, calm), flare: 0 };
  }
  function drawHero(g, T) {
    const h = heroState(T);
    if (T < IMPACT) {
      hero.draw(g, h.x, h.y, h.r, { hue: h.hue, form: h.form, a: h.a, pulse: h.pulse, glow: h.glow, flare: h.flare });
      return;
    }
    // surface-bound: a flattened halo shows the drop lying in the water (fades as the camera tips down)
    const fl = ss(0.3, 1, cam.hc) * ss(IMPACT, IMPACT + 0.5, T);
    if (fl > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(h.x, h.y); g.scale(1, 0.32);
      g.globalAlpha = 0.5 * fl;
      g.drawImage(SP.gCyan, -R.S * 0.2, -R.S * 0.2, R.S * 0.4, R.S * 0.4);
      g.restore();
    }
    hero.draw(g, h.x, h.y, h.r, { hue: h.hue, form: 'orb', a: h.a, pulse: h.pulse, glow: h.glow, flare: 0 });
  }

  /* ================================================================== the dive */
  // body of water + the surface seen from below. cam.hc: >0 above the surface, 0 at it, <0 under it.
  function drawUnder(g, T) {
    const hc = cam.hc;
    if (hc > 0.7) return;
    const { W, H, S } = R;
    const dark = 1 - ss(177.2, 178.45, T);
    const yE = cam.yH;
    const depth = max(0, -hc);
    const lit = exp(-depth * 0.5);
    const kd = pow(dark, 1.25);
    const below = ss(0.3, -0.05, hc) * (0.55 + 0.45 * ss(0.0, -0.5, hc)), above = ss(0.08, -0.45, hc);
    const cTop = [18 * lit + 5, 66 * lit + 12, 108 * lit + 24];
    const cMid = [6 * lit + 3, 34 * lit + 9, 64 * lit + 18];
    const cLow = [3, 17 * lit + 6, 34 * lit + 13];
    const y0 = yE - 0.35 * H, y1 = yE + 1.0 * H;
    // the body of water: flat bands (a gradient fill is 5x dearer to rasterise; the steps are below one 8-bit level)
    const wst = BW;
    const sc = (c, f, o) => { o[0] = c[0] * kd * f; o[1] = c[1] * kd * f; o[2] = c[2] * kd * f; };
    sc(cTop, 1, wst[0]); sc(cTop, 0.85, wst[1]); sc(cMid, 0.95, wst[2]); sc(cLow, 0.9, wst[3]); sc(cLow, 0.35, wst[4]);
    const kk = g === UO.cx ? UO.ky : 1;   // device pixels per logical pixel: bands are laid on whole device rows (no seams, no double blending)
    const bandFill = (ya, yb, al) => {
      g.globalAlpha = al;
      const d0 = Math.round(ya * kk), d1 = Math.round(yb * kk), bd = max(2, Math.round(H * kk / 190));
      for (let d = d0; d < d1; d += bd) {
        const t = clamp(((d + bd * 0.5) / kk - y0) / (y1 - y0));
        let i = 0; while (i < 3 && t > BWP[i + 1]) i++;
        const f = (t - BWP[i]) / (BWP[i + 1] - BWP[i]), a = wst[i], b = wst[i + 1];
        g.fillStyle = `rgb(${(a[0] + (b[0] - a[0]) * f) | 0},${(a[1] + (b[1] - a[1]) * f) | 0},${(a[2] + (b[2] - a[2]) * f) | 0})`;
        g.fillRect(0, d / kk, W, min(bd, d1 - d) / kk);
      }
    };
    if (below > 0.004) bandFill(max(0, yE), H, below);
    if (above > 0.004 && yE > 0) bandFill(0, min(H, yE), above);
    g.globalAlpha = 1;
    if (dark <= 0.002) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return; }
    const m = kd;
    g.globalCompositeOperation = 'lighter';
    // the surface from below: a shimmering silver sheet that closes overhead and then retreats upward
    const B = (0.35 + 0.65 * lit) * 0.9;
    if (above > 0.04 && yE > -0.45 * H) drawSheet(g, T, yE, B * m * above);
    // soft shafts from the surface
    const sh = ss(0.1, -0.5, hc);
    for (let i = 0; i < 3; i++) {
      const x = W * (0.12 + 0.76 * hash1(i * 5 + 1)) + sin(T * 0.25 + i * 1.9) * S * 0.05;
      const w = S * (0.12 + 0.1 * hash1(i * 5 + 2));
      const ang = (0.1 + 0.08 * hash1(i * 5 + 3)) * (i % 2 ? 1 : -1);
      const al = m * sh * 0.085 * lit * (0.6 + 0.4 * sin(T * 0.6 + i * 2.2));
      if (al < 0.003) continue;
      g.save();
      g.translate(x, max(yE, -0.1 * H)); g.rotate(ang);
      g.globalAlpha = al;
      g.drawImage(SP.shaft, -w / 2, 0, w, H * 0.85);
      g.restore();
    }
    // motes of the deep drifting up past the sinking drop
    const ma = m * ss(0.5, -0.3, hc);
    if (ma > 0.01) {
      for (let i = 0; i < 44; i++) {
        const zf = 0.3 + 0.7 * hash1(i * 3 + 1);
        const yy = u.wrap(hash1(i * 3 + 2) - (T - 175) * (0.03 + 0.06 * zf), 0, 1.1) - 0.05;
        const xx = hash1(i * 3 + 3) + sin(T * 0.4 + i * 1.7) * 0.012 * zf;
        const tw = 0.5 + 0.5 * sin(T * (0.9 + 1.4 * hash1(i * 5)) + i * 2.1);
        gl(g, SP.gCyan, xx * W, yy * H, S * 0.011 * zf + 1.5, 0.45 * zf * tw * ma);
        g.globalAlpha = 0.6 * zf * tw * ma; g.fillStyle = '#d6f4ff';
        g.fillRect(xx * W - 1, yy * H - 1, 2, 2);
      }
    }
    // bubbles lifted off the drop
    for (let i = 0; i < 9; i++) {
      const per = 2.6 + 1.6 * hash1(i * 7 + 1);
      const f = u.wrap(T / per + hash1(i * 7 + 2), 0, 1);
      const X = W * 0.5 + (hash1(i * 7 + 3) - 0.5) * S * 0.07 + sin(f * 9 + i) * S * 0.012;
      const Y = cam.hy - f * S * (0.25 + 0.2 * hash1(i * 7 + 4));
      const al = sin(PI * f) * 0.7 * m * ss(0.0, -0.6, hc) * (1 - ss(177.6, 178.4, T));
      gl(g, SP.gSilver, X, Y, S * (0.005 + 0.004 * hash1(i * 7 + 5)), al);
    }
    // the drop's own light in the water
    const dl = ss(0.7, -0.1, hc);
    gl(g, SP.gCyan, W * 0.5, cam.hy, S * 0.32, 0.2 * m * dl);
    gl(g, SP.gSilver, W * 0.5, cam.hy, S * 0.16, 0.1 * m * dl);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }

  // the waterline: where the sea plane is seen edge-on every ring, reflection and crest collapses into one bright line
  function drawWaterline(g, T) {
    const hc = cam.hc;
    const w = exp(-hc * hc / 0.05) * (1 - ss(177.0, 178.2, T));
    if (w < 0.01) return;
    const { W, H, S } = R;
    const y = cam.yH;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = min(1, 0.55 * w);
    g.drawImage(SP.gSilver, -W * 0.25, y - S * 0.07, W * 1.5, S * 0.14);
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(190,225,255,0)'); lg.addColorStop(0.15, 'rgba(200,230,255,0.5)'); lg.addColorStop(0.5, 'rgba(245,250,255,1)');
    lg.addColorStop(0.85, 'rgba(200,230,255,0.5)'); lg.addColorStop(1, 'rgba(190,225,255,0)');
    g.fillStyle = lg; g.globalAlpha = min(1, 0.85 * w);
    g.fillRect(0, y - max(1, S * 0.0022), W, max(2, S * 0.0044));
    for (let i = 0; i < 26; i++) {
      const x = (hash1(i * 5 + 1) + 0.03 * sin(T * 0.4 + i)) * W;
      const fl = pow(max(0, sin(T * (1.4 + hash1(i * 5 + 2) * 2) + i * 2.4)), 3);
      gl(g, SP.gSilver, x, y, S * (0.012 + 0.02 * hash1(i * 5 + 3)), 0.7 * fl * w);
    }
    g.restore();
  }

  function drawSheet(g, T, ys, B) {
    if (B < 0.004) return;
    const { W, H, S } = R;
    const cols = UF.cols, rows = UF.rows, d = UF.img.data;
    const asp = W / S;
    const t = T * 0.2;
    const dsc = clamp(-cam.hc, 0.3, 1.4);
    const yTop = clamp(ys + 0.09 * H, 6, H);   // the field only covers the part of the screen the sheet can reach
    let p = 0, q = 0;
    for (let j = 0; j < rows; j++) {
      const y = (j + 0.5) / rows * yTop;
      const pp = (ys - y) / S;   // depth below the sheet in S units: the pattern keeps its proportions in portrait
      const edge = pp >= 0 ? 1 : pow(ss(-0.075, 0.0, pp), 1.6);
      const ppp = max(pp, 0);
      const pvr = 0.12 * dsc / (ppp + 0.07);
      const pv = pvr > 1.0 ? 1.0 : pvr < 0.4 ? 0.4 : pvr;
      const hush = 1 - 0.55 * ss(0.65, 1.2, pvr);          // too fine to resolve near the far edge -> melts into a soft sheen
      const near = 0.35 + 0.65 * exp(-ppp * 1.5);
      for (let i = 0; i < cols; i++) {
        const xx = ((i + 0.5) / cols - 0.5) * asp;
        const X = xx * pv * 7 * 0.8 + t * 1.3, Z = (pvr > 2.4 ? 2.4 : pvr) * 7 * 1.2 + t * 1.1 - min(0, pp) * 14;
        const n1 = u.fbm2(X + 3.7, Z + t * 1.7, 3);
        const n2 = u.fbm2(X * 1.7 - Z * 0.5 + 19.1, Z * 1.7 - t * 1.4 + 7.3, 2);
        let r1 = 1 - abs(2 * n1 - 1); r1 *= r1; r1 *= r1; r1 *= r1 * 0.9 + 0.1;
        let r2 = 1 - abs(2 * n2 - 1); r2 *= r2; r2 *= r2;
        const cb = 0.5 + 0.55 * exp(-xx * xx * 1.5);
        let I = edge * near * cb * (0.04 + 1.05 * r1 * hush + 0.5 * r2 * hush + 0.18 * (1 - hush)) * B * 0.55;
        if (I > 1.2) I = 1.2;
        const dz = UF.dith[q++];
        d[p++] = 205 * I + dz; d[p++] = 228 * I + dz; d[p++] = 244 * I + dz; d[p++] = 255;
      }
    }
    UF.cx.putImageData(UF.img, 0, 0);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 1;
    if (g !== UO.cx) {
      // full-res target (the surface is still closing): smooth-upscale the field to the half-res buffer, then add it with a cheap 2x copy
      const c = UO.cx, hh = yTop * UO.ky;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.fillStyle = '#000'; c.fillRect(0, 0, UO.cv.width, Math.ceil(hh) + 1);
      c.imageSmoothingEnabled = true; c.drawImage(UF.cv, 0, 0, UO.cv.width, hh);
      g.imageSmoothingEnabled = false;
      g.drawImage(UO.cv, 0, 0, UO.cv.width, hh, 0, 0, W, yTop);
    } else { g.imageSmoothingEnabled = true; g.drawImage(UF.cv, 0, 0, W, yTop); }
    // the bright lip of the surface (total internal reflection sheen)
    const lip = g.createLinearGradient(0, ys - 0.1 * H, 0, ys + 0.1 * H);
    lip.addColorStop(0, 'rgba(160,200,235,0)'); lip.addColorStop(0.5, `rgba(190,225,250,${0.14 * B})`); lip.addColorStop(1, 'rgba(120,170,220,0)');
    g.fillStyle = lip; g.fillRect(0, ys - 0.1 * H, W, 0.2 * H);
    g.restore();
  }

  /* ================================================================== scene */
  Anim.defineScene({
    id: 's8_return',

    init(env) {
      bakeMW();
      initBeads();
    },

    resize(env) {
      bakeSprites();
      buildSky(env);
      buildBase(env);
      ufSetup(env);
    },

    fx(T) {
      return {
        bloom: KS([[166, 0.86], [170, 0.86], [171.1, 1.05], [172.5, 0.95], [175, 0.8], [177.5, 0.8], [180, 0.9]], T),
        vignette: lerp(0.52, 0.55, ss(170, 176, T)),
      };
    },

    render(g, T, L, env) {
      const { W, H, S } = env;
      if (!R || R.W !== W || R.H !== H || !SKY) { bakeSprites(); buildSky(env); buildBase(env); ufSetup(env); }
      setCam(T, env);
      prepRipples(T);
      const hc = cam.hc;

      const dive = hc <= -0.36;
      if (!dive) {
        // ---- B7 world (sinking to the surface)
        const dy = cam.dy; // BASE covers the canvas except a strip the camera has uncovered
        if (dy > 0.5 || dy < -0.5) { g.fillStyle = rgbs(SEA7[1]); if (dy > 0) g.fillRect(0, 0, W, dy + 1); else g.fillRect(0, H + dy - 1, W, 1 - dy); }
        g.drawImage(BASE, 0, dy);
        if (cam.yH > 4) {
          if (hc > -0.2) drawMilkyWay(g, T);
          drawStars(g, T, 1);
          drawSkyPetals(g, T);
        }
        drawReflections(g, T);
        drawFall(g, T);
        drawImpact(g, T);
      }
      if (dive) { // the world is gone: the underwater body is painted at half resolution and laid over the canvas in one pass
        const c = UO.cx;
        c.setTransform(UO.kx, 0, 0, UO.ky, 0, 0);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        drawUnder(c, T);
        c.setTransform(1, 0, 0, 1, 0, 0);
        g.imageSmoothingEnabled = true;
        g.drawImage(UO.cv, 0, 0, W, H);
      } else drawUnder(g, T);
      drawRings(g, T);
      drawWaterline(g, T);
      // ---- the end: pure black + the point of light
      if (T > 178.5) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
      drawHero(g, T);
    },
  });
})();
