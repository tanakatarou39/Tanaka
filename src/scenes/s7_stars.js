/* ひとしずくの旅 — s7_stars (T 152–170) 星
 *
 * 152–156  (handoff B6) dusk-night over the meadow: the big blossoming tree glows, petals lift up from the canopy,
 *          the hero is the golden heart of the canopy at (.5,.46).
 * 156–158  the camera begins to tilt up (the near ground / tree slide away faster than the far sky = parallax),
 *          petal streams climb in curling lanes.
 * 157.5–162 THE CLIMAX: every petal that arrives becomes a star; a ring of light leaves the hero and the whole sky
 *          blooms — thousands of stars, the Milky Way, aurora curtains; shooting stars.
 * 161–165  the brightest stars join with faint lines into a drop-shaped constellation; the hero is its tip.
 * 163–170  the camera tilts back down to the calm mirror sea (horizon y .78) that reflects the stars (handoff B7).
 *
 * Everything is a pure function of T. Static art (tree, Milky Way, sprites) is baked in init()/resize();
 * stars / petals / aurora / shooting stars are analytic f(seed, T).
 */
(function () {
  'use strict';
  const { util: u, hero } = Anim;
  const TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, exp = Math.exp, sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor,
    min = Math.min, max = Math.max, hypot = Math.hypot, atan2 = Math.atan2, pow = Math.pow;
  const clamp = u.clamp, lerp = u.lerp, ss = u.smoothstep, hash2 = u.hash2;
  const KS = (k, T) => u.keys(k, T, 'spline');

  const PIN_IN = hero.pins.find((p) => p.to === 's7_stars') || { x: 0.5, y: 0.46, r: 0.016, hue: 48, form: 'orb' };
  const PIN_OUT = hero.pins.find((p) => p.from === 's7_stars') || { x: 0.5, y: 0.3, r: 0.018, hue: 215, form: 'star' };

  /* ------------------------------------------------------------------ camera (pure functions of T) */
  // far sky / sea horizon height (fraction of H): 0.74 at the start (B6) -> 1.1 (looking far up, T~162) -> 0.781 (B7, reached by T=166).
  // Two smootherstep arcs (no spline overshoot): the tilt up is slow and eased over ~6 s, the way back down finishes a second before B7.
  const sst = u.smootherstep;
  const hyAt = (T) => 0.74 + 0.36 * sst(155.8, 162.0, T) - 0.319 * sst(162.8, 166.0, T);
  // near ground (meadow, hills, tree) sinks faster than the far sky: shift in units of H (one long, eased slide 156 -> 162.6)
  const gsAt = (T) => 1.25 * sst(155.9, 162.6, T);
  // hero screen y (fraction of H)
  const HEROY = [[152, 0.46], [156, 0.46], [158, 0.447], [160.5, 0.415], [162.7, 0.39], [164.4, 0.345], [165.6, 0.305], [166.2, 0.3], [170, 0.3]];
  const heroYAt = (T) => KS(HEROY, T);
  const thetaAt = (T) => 0.0042 * (T - 152); // slow rotation of the sky about its pole (rad)

  /* ------------------------------------------------------------------ palettes */
  const SKY_E = [0, 0.08, 0.2, 0.45, 0.8, 1.6, 3.4];
  const SKY6 = [[58, 42, 90], [48, 36, 82], [32, 28, 70], [18, 20, 56], [10, 16, 48], [8, 12, 40], [6, 9, 32]];
  const SKY7 = [[20, 33, 74], [14, 24, 60], [10, 18, 48], [6, 10, 30], [2, 3, 12], [2, 3, 10], [1, 2, 8]];
  const SKYN = [[15, 24, 60], [11, 18, 49], [8, 13, 38], [5, 8, 26], [2, 3, 12], [2, 3, 10], [1, 2, 8]];
  const SEA6 = [[40, 38, 88], [12, 12, 38]], SEA7 = [[8, 13, 32], [3, 5, 15]];
  const STAR_RGB = [[200, 218, 255], [255, 250, 240], [255, 224, 188], [255, 205, 225], [175, 215, 255]];
  const STAR_CSS = STAR_RGB.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);

  /* ------------------------------------------------------------------ Milky Way field (shared by the baked texture and the star density) */
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

  let MWTEX = null; // {glow}
  function bakeMW() {
    const TW = 560, TH = 72;
    const glow = u.canvas(TW, TH);
    const gc = glow.getContext('2d');
    const gi = gc.createImageData(TW, TH);
    for (let y = 0; y < TH; y++) {
      const vv = -(y / TH - 0.5) * MW_VH;
      for (let x = 0; x < TW; x++) {
        const uu = (x / TW - 0.5) * MW_UW;
        const f = mwField(uu, vv);
        const n2 = u.fbm2(uu * 6.5 + 20, vv * 11 + 3, 4);
        const bulge = exp(-((uu - 0.45) * (uu - 0.45) / 0.45 + vv * vv / 0.06)) * 0.8;
        let I = f[0] * f[1] * (0.65 + 0.7 * n2) + bulge * (0.5 + 0.5 * n2);
        I = I > 0 ? Math.min(1.6, I) : 0;
        // dust lanes darken the glow
        const lane = u.fbm2(uu * 3.8 + 40, vv * 8 + 17, 5);
        const lane2 = u.fbm2(uu * 9 + 7, vv * 15 + 31, 3);
        let d = clamp((lane - 0.5) * 3.4 + (lane2 - 0.5) * 0.7, 0, 1);
        d = d * d * (3 - 2 * d) * exp(-f[2] * f[2] * 0.5) * 0.7;
        I *= 1 - d;
        const ty = y / TH, tx = x / TW;
        I *= ss(0, 0.2, Math.min(ty, 1 - ty)) * ss(0, 0.06, Math.min(tx, 1 - tx));
        // colour: warm core -> cool violet-blue edges
        const warm = clamp(bulge * 1.05 + f[0] * 0.2, 0, 1);
        const r = lerp(105, 255, warm), gg = lerp(140, 205, warm), b = lerp(255, 160, warm);
        // premultiplied-style: colour is the band tint, alpha the glow strength (source-over is much cheaper than 'lighter' when scaled)
        const al = clamp(I * 0.23, 0, 0.55);
        const p = (y * TW + x) * 4;
        const dn = (u.hash2(x, y) - 0.5) * 1.4;
        gi.data[p] = Math.min(255, r + dn); gi.data[p + 1] = Math.min(255, gg + dn); gi.data[p + 2] = Math.min(255, b + dn); gi.data[p + 3] = al * 255 + dn;
      }
    }
    gc.putImageData(gi, 0, 0);
    // one-off smooth upsample (x4) + dither, so the per-frame draw can use cheap nearest-neighbour sampling
    const UP = 4, big = u.canvas(TW * UP, TH * UP), bc = big.getContext('2d');
    bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = 'high';
    bc.drawImage(glow, 0, 0, TW * UP, TH * UP);
    const bi = bc.getImageData(0, 0, TW * UP, TH * UP), bd = bi.data;
    for (let i = 0, n = bd.length, x = 0; i < n; i += 4, x++) { const d = (u.hash2(x & 2047, (x >> 11) + 5) - 0.5) * 1.6; bd[i + 3] = Math.max(0, bd[i + 3] + d); }
    bc.putImageData(bi, 0, 0);
    MWTEX = { glow: big };
  }

  /* ------------------------------------------------------------------ sprites */
  let SP = null;
  function bakeSprites() {
    const mk = (w, h, f) => { const c = u.canvas(w, h); f(c.getContext('2d'), w, h); return c; };
    SP = {
      gCold: u.glowSprite(212, 80, 70, 'soft'), gNeutral: u.glowSprite(220, 30, 82, 'soft'), gWarm: u.glowSprite(40, 90, 66, 'soft'),
      gPink: u.glowSprite(335, 70, 78, 'soft'), gBlue: u.glowSprite(214, 90, 62, 'soft'), gGold: u.glowSprite(46, 95, 64, 'soft'),
      coreWhite: u.glowSprite(220, 40, 92, 'core'), gWarmHalo: u.glowSprite(48, 82, 66, 'soft'),
    };
    // petal (pale pink-white teardrop), 32x18
    SP.petal = mk(32, 18, (c) => {
      c.translate(16, 9);
      const gr = c.createRadialGradient(-3, -1, 1, 0, 0, 14);
      gr.addColorStop(0, 'rgba(255,252,246,1)'); gr.addColorStop(0.55, 'rgba(255,226,232,0.95)'); gr.addColorStop(1, 'rgba(255,196,214,0)');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(-14, 0); c.bezierCurveTo(-8, -9, 6, -9, 14, 0); c.bezierCurveTo(6, 9, -8, 9, -14, 0); c.closePath(); c.fill();
    });
    SP.petalWarm = mk(32, 18, (c) => {
      c.translate(16, 9);
      const gr = c.createRadialGradient(-3, -1, 1, 0, 0, 14);
      gr.addColorStop(0, 'rgba(255,250,232,1)'); gr.addColorStop(0.55, 'rgba(255,232,190,0.95)'); gr.addColorStop(1, 'rgba(255,205,150,0)');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(-14, 0); c.bezierCurveTo(-8, -9, 6, -9, 14, 0); c.bezierCurveTo(6, 9, -8, 9, -14, 0); c.closePath(); c.fill();
    });
    // aurora curtain strips (16x256): bright sharp lower fringe, fading violet rays above, soft horizontal edges
    const aur = (stops) => mk(16, 256, (c) => {
      const lg = c.createLinearGradient(0, 0, 0, 256);
      for (const [p, col] of stops) lg.addColorStop(p, col);
      c.fillStyle = lg; c.fillRect(0, 0, 16, 256);
      c.globalCompositeOperation = 'destination-in';
      const hg = c.createLinearGradient(0, 0, 16, 0);
      hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.5, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hg; c.fillRect(0, 0, 16, 256);
    });
    SP.aur = [
      aur([[0, 'rgba(150,90,255,0)'], [0.32, 'rgba(130,100,255,0.07)'], [0.6, 'rgba(60,215,190,0.20)'], [0.82, 'rgba(70,255,150,0.46)'], [0.92, 'rgba(120,255,175,0.66)'], [1, 'rgba(120,255,190,0)']]),
      aur([[0, 'rgba(110,120,255,0)'], [0.32, 'rgba(100,140,255,0.07)'], [0.6, 'rgba(50,220,220,0.20)'], [0.83, 'rgba(60,245,190,0.42)'], [0.93, 'rgba(120,255,215,0.6)'], [1, 'rgba(120,255,220,0)']]),
      aur([[0, 'rgba(190,90,255,0)'], [0.3, 'rgba(190,90,255,0.10)'], [0.58, 'rgba(210,100,230,0.18)'], [0.82, 'rgba(90,210,200,0.30)'], [0.95, 'rgba(110,250,190,0.45)'], [1, 'rgba(110,250,190,0)']]),
    ];
    SP.streakG = mk(32, 128, (c) => {
      c.translate(16, 64); c.scale(1, 4);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 16);
      gr.addColorStop(0, 'rgba(120,255,200,1)'); gr.addColorStop(0.4, 'rgba(60,220,180,0.35)'); gr.addColorStop(1, 'rgba(40,200,170,0)');
      c.fillStyle = gr; c.fillRect(-16, -16, 32, 32);
    });
    // soft vertical streak for sea reflections (32x128)
    SP.streak = mk(32, 128, (c) => {
      c.translate(16, 64); c.scale(1, 4);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 16);
      gr.addColorStop(0, 'rgba(235,242,255,1)'); gr.addColorStop(0.35, 'rgba(190,210,255,0.4)'); gr.addColorStop(1, 'rgba(160,190,255,0)');
      c.fillStyle = gr; c.fillRect(-16, -16, 32, 32);
    });
  }

  /* ------------------------------------------------------------------ module state built in resize() */
  let R = null;       // derived sizes
  let SKY = null;     // star arrays
  let GRASS = null;   // baked grass strip
  let GROUND = null;  // baked far hills + mist + meadow
  const SHOOT = [
    // t0, x0 (frac W), y0 (frac H), angle (rad, screen), len (S), speed (S/s), dur, hue-class
    [158.7, 0.78, 0.12, 2.75, 0.34, 1.15, 1.05],
    [160.15, 0.30, 0.20, 0.42, 0.38, 1.25, 1.0],
    [162.4, 0.88, 0.30, 2.60, 0.30, 1.05, 1.1],
    [164.15, 0.18, 0.10, 0.62, 0.34, 1.2, 1.0],
  ];
  const CONS = [ // drop-shaped constellation (S units relative to the hero; height ~0.62)
    [0, 0], [-0.075, 0.125], [0.07, 0.13], [-0.145, 0.265], [0.15, 0.255], [-0.19, 0.405], [0.195, 0.4],
    [-0.15, 0.535], [0.145, 0.54], [0.005, 0.625], [-0.01, 0.405],
  ];
  const CHAIN_A = [0, 1, 3, 5, 7, 9], CHAIN_B = [0, 2, 4, 6, 8, 9];
  const CONS_T0 = 160.9;

  /* ================================================================== build: sky */
  function buildSky(env) {
    const { W, H, S } = env;
    const Wr = W / S, Hr = H / S;
    R = { W, H, S, Wr, Hr };
    const xMax = Wr / 2 + 0.45, yMax = 1.12 * Hr + 0.55;
    const area = 2 * xMax * yMax;
    const pivY = 0.48 * Hr;
    R.pivY = pivY;
    const heartSy = 0.28 * Hr;
    const cwy = hyAt(158.3) * Hr - 0.43 * Hr;
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
        const s = { x, y, dx: x, dy: y - pivY, kind, ph: rnd() * TAU, f: 0.6 + 2.8 * r1, tone: 0, b: 0.5, tw: 0.4, sz: 1, ta: 0, fd: 0.5, pk: 0, pet: null, refl: false };
        const tr = rnd();
        s.tone = tr < 0.5 ? 0 : tr < 0.8 ? 1 : tr < 0.94 ? 2 : tr < 0.97 ? 3 : 4;
        if (kind === 0) { s.b = 0.18 + 0.5 * r2 * r2 + 0.1 * r3; s.tw = 0.35 + 0.35 * r3; s.sz = r2 > 0.86 ? 1.5 : 1; }
        else if (kind === 1) { s.b = 0.5 + 0.38 * r2; s.tw = 0.22 + 0.25 * r3; s.sz = 1.5 + 1.2 * r2; }
        else { s.b = 0.88 + 0.12 * r2; s.tw = 0.14 + 0.12 * r3; s.sz = 2.4 + 1.2 * r2; s.f = 0.5 + 1.1 * r1; }
        stars.push(s); made++;
      }
    };
    gen(0, Math.round(700 * area), 1.0);
    gen(1, Math.round(70 * area), 0.8);
    gen(2, Math.round(7.5 * area), 0.35);
    // arrival times: stars bloom outward from the hero's place in the sky
    const tWave = (d) => 155.5 + 6.2 * pow(1 - exp(-d / 0.9), 0.95);
    const pets = [];
    let nInit = 0;
    for (const s of stars) {
      const d = hypot(s.x, s.y - cwy);
      s.ta = tWave(d) + (rnd() - 0.5) * (0.5 + 1.1 * min(d, 1.8));
      s.fd = s.kind === 0 ? 0.7 : 0.35;
      s.pk = s.kind === 0 ? 0 : s.kind === 1 ? 0.7 : 1.1;
      s.refl = s.kind >= 1 && s.y < 0.8;
      // a few stars are already there at the start (B6: "first few stars")
      if (s.kind === 0 && s.y < 0.74 * Hr && s.y > 0.06 && rnd() < 0.11) { s.ta = -100; s.pk = 0; nInit++; }
      else if (s.kind === 1 && s.y < 0.74 * Hr && s.y > 0.2 && rnd() < 0.05) { s.ta = -100; s.pk = 0; }
      else {
        const eligible = s.y > heartSy + 0.12 && (s.kind === 2 || (s.kind === 1 && rnd() < 0.42) || (s.kind === 0 && rnd() < 0.03));
        if (eligible) pets.push(s);
      }
    }
    // petal flights: from a point in the canopy to the star's place
    const flights = [];
    pets.forEach((s, i) => {
      const r = u.rng(900 + i * 7);
      let tl = s.ta - 4.2;
      let x0 = 0, y0 = 0, dst = 0, D = 4;
      const canopy = (T) => {
        const a = r() * TAU, rr = sqrt(r());
        return [Math.cos(a) * rr * 0.30, -(Math.abs(Math.sin(a)) * 0.6 + 0.1) * rr * 0.26 * (r() < 0.8 ? 1 : -0.4)]; // x, up-offset (S)
      };
      const off = canopy();
      for (let pass = 0; pass < 3; pass++) {
        const cyScreen = (0.46 + gsAt(tl)) * H - off[1] * S; // canopy point (screen y)
        x0 = off[0];
        y0 = (hyAt(tl) * H - cyScreen) / S;
        dst = hypot(s.x - x0, s.y - y0);
        D = clamp(2.3 + 1.2 * dst, 2.8, 6.4);
        tl = s.ta - D;
      }
      if (tl < 149.2) { tl = 149.2; D = max(2.2, s.ta - tl); }
      s.pet = { x0, y0, tl, d: D, g: i % 7, amp: (0.03 + 0.07 * r()) * (0.6 + 0.4 * clamp(D / 6)), jit: r() * 50, sz: 0.0065 + 0.006 * r(), spin: (r() - 0.5) * 6, warm: r() < 0.4 };
      flights.push(s);
    });
    // sort by tone so fillStyle changes are rare
    const byTone = (a, b) => a.tone - b.tone;
    SKY = {
      faint: stars.filter((s) => s.kind === 0).sort(byTone),
      mid: stars.filter((s) => s.kind === 1).sort(byTone),
      bright: stars.filter((s) => s.kind === 2),
      flights,
      refl: stars.filter((s) => s.refl && s.kind >= 1),
      cwy,
    };
    // the constellation (hero-anchored, screen space)
    const avail = (0.78 - 0.3 - 0.1) * H;
    const hgt = min(avail, 0.52 * S);
    const cs = hgt / 0.625;
    R.cs = cs;
  }

  function buildGrass(env) {
    const { W, H, S } = env;
    const gh = Math.ceil(0.2 * H), gw = Math.ceil(W + 0.1 * S);
    const c = u.canvas(gw, gh), g = c.getContext('2d');
    const rnd = u.rng(404);
    for (let layer = 0; layer < 3; layer++) {
      const n = Math.round(gw / (layer === 0 ? 4 : 6));
      const col = layer === 0 ? 'rgba(10,14,22,0.9)' : layer === 1 ? 'rgba(6,9,16,0.95)' : 'rgb(3,5,10)';
      g.fillStyle = col;
      const baseY = gh * (0.55 + layer * 0.17);
      for (let i = 0; i < n; i++) {
        const x = rnd() * gw, hgt = (0.01 + 0.03 * rnd()) * S * (0.7 + layer * 0.5), lean = (rnd() - 0.5) * 0.02 * S, wd = (0.0012 + 0.0016 * rnd()) * S;
        g.beginPath(); g.moveTo(x - wd, baseY + 0.02 * H); g.quadraticCurveTo(x + lean * 0.3, baseY - hgt * 0.5, x + lean, baseY - hgt); g.quadraticCurveTo(x + lean * 0.3 + wd, baseY - hgt * 0.5, x + wd, baseY + 0.02 * H); g.closePath(); g.fill();
      }
      g.fillRect(0, baseY + 0.005 * H, gw, gh);
    }
    GRASS = { c, gw, gh };
  }

  function buildGround(env) {
    const { W, H, S } = env;
    const topY = Math.floor(0.64 * H), gh = Math.ceil(H * 1.0 - topY) + 4;
    const c = u.canvas(W, gh), g = c.getContext('2d');
    g.translate(0, -topY);
    const hy0 = 0.74 * H;
    // a thin strip of distant sea on the horizon (fades out towards the left; the right ridge sits just below it)
    {
      const sy0 = 0.742 * H, sy1 = 0.764 * H;
      const sg = g.createLinearGradient(0, sy0, 0, sy1);
      sg.addColorStop(0, 'rgba(46,58,120,0)'); sg.addColorStop(0.25, 'rgb(40,52,110)'); sg.addColorStop(0.7, 'rgb(30,40,92)'); sg.addColorStop(1, 'rgb(24,32,78)');
      g.fillStyle = sg; g.fillRect(0, sy0, W, sy1 - sy0);
      g.globalCompositeOperation = 'destination-in';
      const hg = g.createLinearGradient(0, 0, W, 0);
      hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.42, 'rgba(0,0,0,0)'); hg.addColorStop(0.7, 'rgba(0,0,0,0.75)'); hg.addColorStop(1, 'rgba(0,0,0,0.95)');
      g.fillStyle = hg; g.fillRect(0, sy0 - 2, W, sy1 - sy0 + 4);
      g.globalCompositeOperation = 'source-over';
    }
    const hill = (yBase, amp, x0, wdt, col0, col1, seed, bumps) => {
      g.beginPath(); g.moveTo(-5, H * 1.2);
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const x = -5 + (i / N) * (W + 10), xf = x / W;
        let y = yBase - amp * exp(-pow((xf - x0) / wdt, 2)) - amp * 0.35 * exp(-pow((xf - x0 - 0.45) / (wdt * 0.8), 2));
        y -= bumps * S * (u.noise1(xf * 9 + seed) - 0.4) * 0.05;
        g.lineTo(x, y);
      }
      g.lineTo(W + 5, H * 1.2); g.closePath();
      const gr = g.createLinearGradient(0, yBase - amp, 0, yBase + 0.08 * H);
      gr.addColorStop(0, col0); gr.addColorStop(1, col1);
      g.fillStyle = gr; g.fill();
    };
    hill(hy0 + 0.012 * H, 0.05 * H, 0.14, 0.2, rgbas(mixArr([30, 26, 62], [14, 18, 40], 0.25), 1), rgbas(mixArr([14, 14, 36], [8, 10, 26], 0.25), 1), 3.1, 0.35);
    const mist = g.createLinearGradient(0, hy0 - 0.03 * H, 0, hy0 + 0.1 * H);
    mist.addColorStop(0, 'rgba(70,56,112,0)'); mist.addColorStop(0.45, 'rgba(70,56,112,0.34)'); mist.addColorStop(1, 'rgba(40,36,84,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = mist; g.fillRect(0, hy0 - 0.03 * H, W, 0.14 * H); g.globalCompositeOperation = 'source-over';
    hill(hy0 + 0.05 * H, 0.025 * H, 0.82, 0.3, rgbas(mixArr([12, 12, 30], [8, 9, 22], 0.25), 1), rgbas(mixArr([7, 8, 20], [4, 5, 13], 0.25), 1), 8.3, 0.5);
    const my = 0.805 * H;
    const mg = g.createLinearGradient(0, my - 0.02 * H, 0, H * 1.15);
    mg.addColorStop(0, rgbs(mixArr([14, 16, 34], [8, 10, 24], 0.25))); mg.addColorStop(0.3, rgbs(mixArr([8, 10, 22], [5, 6, 16], 0.25))); mg.addColorStop(1, 'rgb(3,4,9)');
    g.fillStyle = mg;
    g.beginPath(); g.moveTo(-5, H * 1.3);
    for (let i = 0; i <= 24; i++) { const x = -5 + (i / 24) * (W + 10); g.lineTo(x, my + 0.012 * H * sin(i * 0.55 + 1) + 0.008 * H * sin(i * 1.3)); }
    g.lineTo(W + 5, H * 1.3); g.closePath(); g.fill();
    GROUND = { c, topY, gh };
  }

  let LAND_KEY = '';
  function ensureLand(env) {
    const key = env.W + 'x' + env.H;
    if (GROUND && LAND_KEY === key) return;
    buildGrass(env); buildGround(env);
    LAND_KEY = key;
  }
  /* the dusk meadow (ridges, mist, sea strip, dark foreground grass) is shared with s6_tree, which fades it in over its own ground at the end
   * of the cross-fade so that both scenes show the very same horizon. o: { T, alpha } */
  (Anim.shared = Anim.shared || {}).nightLand = {
    ground(g, env, o) {
      ensureLand(env);
      const { W, H } = env, T = o.T, a = o.alpha == null ? 1 : o.alpha;
      if (a < 0.004) return;
      g.save(); g.globalAlpha = a;
      g.drawImage(GROUND.c, 0, GROUND.topY);
      const dk = 0.42 * ss(153, 158.5, T);
      if (dk > 0.01) { g.fillStyle = `rgba(3,4,12,${dk})`; g.fillRect(0, GROUND.topY, W, GROUND.gh); }
      g.restore();
    },
    fore(g, env, o) {
      ensureLand(env);
      const { W, H, S } = env, T = o.T, a = o.alpha == null ? 1 : o.alpha;
      if (a < 0.004) return;
      g.save(); g.globalAlpha = a;
      g.drawImage(GRASS.c, Math.round(-0.05 * S + sin(T * 0.8) * 1.6), H - GRASS.gh + 0.02 * H);
      g.restore();
    },
  };

  /* ================================================================== draw helpers */
  const mixArr = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgbs = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const rgbas = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const hash1 = (n) => hash2(n | 0, 31);
  // thin 4-point flare from solid rects (3 stacked lengths ~ a soft falloff) — far cheaper than a big mostly-empty sprite
  const crossLines = (g, x, y, L, a, th) => {
    g.fillStyle = 'rgb(214,226,255)';
    for (let k = 0; k < 3; k++) {
      const l = L * (1 - k * 0.34), al = a * (k === 0 ? 0.3 : k === 1 ? 0.32 : 0.4);
      g.globalAlpha = al > 1 ? 1 : al;
      g.fillRect(x - l, y - th * 0.5, l * 2, th); g.fillRect(x - th * 0.5, y - l, th, l * 2);
    }
  };
  const gl = (g, spr, x, y, r, a) => { if (a <= 0.004 || r < 0.4) return; g.globalAlpha = a > 1 ? 1 : a; g.drawImage(spr, x - r, y - r, r * 2, r * 2); };

  const _skyc = [0, 0, 0];
  function skyColorAt(e, k1, k2, bump, out) {
    // piecewise-linear palette lookup by elevation e (S units)
    let i = 0;
    while (i < SKY_E.length - 2 && e > SKY_E[i + 1]) i++;
    const t = clamp((e - SKY_E[i]) / (SKY_E[i + 1] - SKY_E[i]));
    for (let c = 0; c < 3; c++) {
      const a0 = SKY6[i][c] + (SKYN[i][c] - SKY6[i][c]) * k1, a1 = SKY6[i + 1][c] + (SKYN[i + 1][c] - SKY6[i + 1][c]) * k1;
      const b0 = a0 + (SKY7[i][c] - a0) * k2, b1 = a1 + (SKY7[i + 1][c] - a1) * k2;
      out[c] = b0 + (b1 - b0) * t;
    }
    const w = bump * 0.8 * exp(-e * 0.9);
    out[0] += 14 * w; out[1] += 26 * w; out[2] += 62 * w;
    return out;
  }
  function drawSky(g, T, cam) {
    // cheap banded gradient: thin solid bands (each step is <= 1 colour level, like an 8-bit gradient)
    const { W, H, S } = R;
    const yH = cam.yH;
    const k1 = ss(153, 160, T), k2 = ss(162, 167, T);
    const bump = sin(PI * clamp((T - 157.3) / 5.4)) * 0.75;
    const bh = max(3, Math.round(H / 200));
    const yEnd = min(H, Math.ceil(yH));
    const c = _skyc;
    for (let y = 0; y < yEnd; y += bh) {
      const e = (yH - (y + bh * 0.5)) / S;
      skyColorAt(e < 0 ? 0 : e, k1, k2, bump, c);
      g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      g.fillRect(0, y, W, bh + 1);
    }
  }

  function drawMilkyWay(g, T, cam) {
    const a = ss(157.2, 162.2, T) * (0.92 + 0.08 * sin(T * 0.37)) * (1 - 0.3 * ss(164, 168, T));
    if (a < 0.01) return;
    const { W, H, S, pivY } = R;
    const yH = cam.yH, th = cam.th;
    g.save();
    g.translate(W / 2, yH - pivY * S); g.rotate(-th);
    g.translate(MW_C[0] * S, -(MW_C[1] - pivY) * S); g.rotate(-MW_A);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = a;
    g.imageSmoothingEnabled = false;
    g.drawImage(MWTEX.glow, -MW_UW * S / 2, -MW_VH * S / 2, MW_UW * S, MW_VH * S);
    g.restore();
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // clip the part that falls under the horizon: redrawn by the sea afterwards (see render order)
  }

  function drawStars(g, T, cam, boost) {
    const { W, H, S, pivY } = R;
    const yH = cam.yH, th = cam.th, cT = cos(th), sT = sin(th);
    const yMaxPx = min(H, yH);
    const px = W * 0.5, Z1 = max(1, S / 680);
    const vis0 = 0.45 + 0.55 * ss(152, 161, T);
    g.globalCompositeOperation = 'lighter';
    const sky = SKY;
    // ----- faint
    let curTone = -1;
    for (let i = 0, n = sky.faint.length; i < n; i++) {
      const s = sky.faint[i];
      let a = s.b;
      if (s.ta > -50) { const dt = T - s.ta; if (dt <= 0) continue; a *= dt > s.fd ? 1 : ss(0, s.fd, dt); } else a *= vis0;
      const ry = s.dy * cT + s.dx * sT + pivY;
      const Y = yH - ry * S;
      if (Y < -3 || Y > yMaxPx) continue;
      const X = px + (s.dx * cT - s.dy * sT) * S;
      if (X < -3 || X > W + 3) continue;
      a *= 1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph));
      a *= 0.25 + 0.75 * ss(0, 0.3, ry);
      if (a < 0.03) continue;
      if (s.tone !== curTone) { curTone = s.tone; g.fillStyle = STAR_CSS[curTone]; }
      g.globalAlpha = a > 1 ? 1 : a;
      const z = s.sz * Z1;
      g.fillRect(X - z * 0.5, Y - z * 0.5, z, z);
    }
    // ----- medium
    curTone = -1;
    for (let i = 0, n = sky.mid.length; i < n; i++) {
      const s = sky.mid[i];
      let a = s.b, pop = 0;
      if (s.ta > -50) { const dt = T - s.ta; if (dt <= 0) continue; a *= dt > s.fd ? 1 : ss(0, s.fd, dt); if (dt < 2) pop = s.pk * exp(-dt * 2.6); } else a *= vis0;
      const ry = s.dy * cT + s.dx * sT + pivY;
      const Y = yH - ry * S;
      if (Y < -12 || Y > yMaxPx + 6) continue;
      const X = px + (s.dx * cT - s.dy * sT) * S;
      if (X < -12 || X > W + 12) continue;
      a *= 1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph));
      a *= 0.3 + 0.7 * ss(0, 0.3, ry);
      a *= boost;
      const aa = a + pop;
      if (aa < 0.03) continue;
      if (s.tone !== curTone) { curTone = s.tone; g.fillStyle = STAR_CSS[curTone]; }
      g.globalAlpha = aa > 1 ? 1 : aa;
      const z = s.sz * Z1 * (1 + pop * 0.7);
      g.fillRect(X - z * 0.5, Y - z * 0.5, z, z);
      if (aa > 0.6 && s.b > 0.76) { gl(g, s.tone === 2 ? SP.gWarm : s.tone === 3 ? SP.gPink : SP.gCold, X, Y, S * (0.008 + 0.012 * s.b) * (1 + pop * 1.4), aa * 0.35); }
    }
    // ----- bright
    for (let i = 0, n = sky.bright.length; i < n; i++) {
      const s = sky.bright[i];
      let a = s.b, pop = 0;
      if (s.ta > -50) { const dt = T - s.ta; if (dt <= 0) continue; a *= dt > s.fd ? 1 : ss(0, s.fd, dt); if (dt < 2.4) pop = s.pk * exp(-dt * 2.0); }
      const ry = s.dy * cT + s.dx * sT + pivY;
      const Y = yH - ry * S;
      if (Y < -60 || Y > yMaxPx + 20) continue;
      const X = px + (s.dx * cT - s.dy * sT) * S;
      if (X < -60 || X > W + 60) continue;
      a *= 1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph));
      a *= 0.4 + 0.6 * ss(0, 0.25, ry);
      const aa = (a + pop * 0.6) * boost;
      if (aa < 0.04) continue;
      const tone = s.tone;
      gl(g, tone === 2 ? SP.gWarm : tone === 3 ? SP.gPink : tone === 4 ? SP.gBlue : SP.gCold, X, Y, S * (0.03 + 0.012 * s.b) * (1 + pop * 0.9), aa * 0.5);
      g.globalAlpha = min(1, aa);
      g.fillStyle = STAR_CSS[tone];
      const z = s.sz * Z1;
      g.fillRect(X - z * 0.5, Y - z * 0.5, z, z);
      const fl = S * (0.05 + 0.045 * s.b) * (1 + pop * 0.8) * (0.8 + 0.4 * sin(T * 0.8 + s.ph));
      const xr = ss(156.8, 158.8, T);   // the big cross flares fade in over ~2 s instead of popping
      if (xr > 0.02) crossLines(g, X, Y, fl * (0.5 + 0.5 * xr), aa * 0.9 * xr, max(1, S * 0.0016));
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  const AUR = [
    { base: 0.34, hgt: 0.70, spr: 0, ph: 0.0, spd: 1.0, amp: 0.05, a: 0.8, cx: -0.12, hw: 0.95 },
    { base: 0.64, hgt: 0.80, spr: 1, ph: 2.1, spd: 0.8, amp: 0.06, a: 0.72, cx: 0.34, hw: 0.85 },
    { base: 0.98, hgt: 0.66, spr: 2, ph: 4.2, spd: 1.2, amp: 0.05, a: 0.6, cx: -0.4, hw: 0.8 },
  ];
  // The aurora is baked into a few low-res frames (sky space, half resolution) and cross-faded: a slow curtain does not need
  // per-frame geometry, and two nearest-neighbour blits are far cheaper than ~160 stretched gradient strips.
  const AF_T0 = 157.9, AF_DT = 1.4, AF_N = 7, AF_SY_LO = 0.12, AF_SY_HI = 2.05, AF_RES = 0.4;   // 7 frames cover 157.9-166.3 (the aurora is gone by 166)
  let AFR = null;
  function bakeAurora(env) {
    const { W, H, S } = env, Wr = W / S;
    const halfW = Wr / 2 + 0.12;
    const pw = Math.ceil(2 * halfW * S * AF_RES), ph = Math.ceil((AF_SY_HI - AF_SY_LO) * S * AF_RES);
    AFR = { frames: [], pw, ph, halfW };
    const k = S * AF_RES; // px per S-unit
    for (let f = 0; f < AF_N; f++) {
      const c = u.canvas(pw, ph), ac = c.getContext('2d');
      ac.globalCompositeOperation = 'lighter';
      const T0 = AF_T0 + f * AF_DT;
      for (let j = 0; j < AUR.length; j++) {
        const r = AUR[j];
        const spr = SP.aur[r.spr];
        const tt = T0 * r.spd;
        const hw = r.hw * (0.6 + 0.4 * min(1.6, Wr) / 1.6), xl = r.cx - hw, xr = r.cx + hw;
        const nS = Math.max(30, Math.round((xr - xl) / 0.016));
        for (let q = 0; q < nS; q++) {
          const uu = (q + 0.5) / nS;
          const warp = 0.06 * sin(uu * 6.1 + tt * 0.12 + r.ph) + 0.03 * sin(uu * 13.3 - tt * 0.19 + r.ph * 2);
          const xs = xl + (xr - xl) * (uu + warp);
          if (xs < -halfW - 0.1 || xs > halfW + 0.1) continue;
          const fold = 1 + (0.06 * 6.1 * cos(uu * 6.1 + tt * 0.12 + r.ph) + 0.03 * 13.3 * cos(uu * 13.3 - tt * 0.19 + r.ph * 2));
          const wdt = ((xr - xl) / nS) * 2.4 * clamp(fold, 0.5, 1.6);
          const ripple = u.noise1(q * 0.31 + tt * 0.3 + r.ph * 3);
          const rays = u.noise1(q * 1.7 + tt * 0.7 + r.ph * 7);
          const br = pow(0.25 + 0.75 * ripple, 1.5) * (0.35 + 0.65 * rays) * (0.7 + 0.5 * clamp(1.5 - fold, 0, 1.2));
          const env2 = pow(sin(PI * clamp(uu)), 1.1);
          const al = r.a * br * env2;
          if (al < 0.008) continue;
          const sb = r.base + r.amp * sin(uu * 4.4 + tt * 0.09 + r.ph) + r.amp * 0.5 * sin(uu * 9.7 - tt * 0.23 + r.ph * 1.7) + 0.05 * (u.noise1(q * 0.13 + tt * 0.12 + r.ph * 11) - 0.5) + 0.018 * (rays - 0.5);
          const hh = r.hgt * (0.45 + 0.9 * u.noise1(q * 0.19 + tt * 0.17 + r.ph * 5)) * (0.55 + 0.45 * env2);
          ac.globalAlpha = al > 1 ? 1 : al;
          ac.drawImage(spr, (xs + halfW - wdt / 2) * k, (AF_SY_HI - sb - hh) * k, wdt * k, hh * k);
        }
      }
      AFR.frames.push(c);
    }
  }
  function drawAurora(g, T, cam) {
    const A = ss(159.3, 162.3, T) * (1 - ss(163.2, 166.0, T));
    if (A < 0.01 || !AFR) return;
    const { W, H, S } = R;
    const f = clamp((T - AF_T0) / AF_DT, 0, AF_N - 1.001), i = floor(f), w = f - i;
    // sky-space texture -> screen: top of the texture sits at sy = AF_SY_HI
    const dx0 = W / 2 - AFR.halfW * S, dy0 = cam.yH - AF_SY_HI * S;
    const sc = 1 / AF_RES;
    // visible part of the texture (source rows) for this camera position
    const r0 = Math.max(0, Math.floor(-dy0 / sc) - 1), r1 = Math.min(AFR.ph, Math.ceil((H - dy0) / sc) + 1);
    if (r1 <= r0) return;
    const c0 = Math.max(0, Math.floor(-dx0 / sc) - 1), c1 = Math.min(AFR.pw, Math.ceil((W - dx0) / sc) + 1);
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = false;
    for (let q = 0; q < 2; q++) {
      const al = A * (q === 0 ? 1 - w : w);
      if (al < 0.01) continue;
      g.globalAlpha = al;
      g.drawImage(AFR.frames[i + q], c0, r0, c1 - c0, r1 - r0, dx0 + c0 * sc, dy0 + r0 * sc, (c1 - c0) * sc, (r1 - r0) * sc);
    }
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  function drawShooting(g, T) {
    const { W, H, S } = R;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 0; i < SHOOT.length; i++) {
      const s = SHOOT[i];
      const tau = T - s[0];
      if (tau < 0 || tau > s[6]) continue;
      const dirx = cos(s[3]), diry = sin(s[3]);
      const v = s[5] * S;
      const x = s[1] * W + dirx * v * tau, y = s[2] * H + diry * v * tau;
      const env = ss(0, 0.12, tau) * (1 - ss(s[6] * 0.55, s[6], tau));
      const len = s[4] * S * (0.35 + 0.65 * ss(0, 0.35, tau));
      const tx = x - dirx * len, ty = y - diry * len;
      const gr = g.createLinearGradient(tx, ty, x, y);
      gr.addColorStop(0, 'rgba(160,200,255,0)'); gr.addColorStop(0.7, `rgba(205,225,255,${0.35 * env})`); gr.addColorStop(1, `rgba(255,255,255,${0.95 * env})`);
      g.strokeStyle = gr; g.lineWidth = max(1.2, S * 0.0024); g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y); g.stroke();
      g.strokeStyle = gr; g.globalAlpha = 0.25; g.lineWidth = max(3, S * 0.008); g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y); g.stroke();
      g.globalAlpha = 1;
      gl(g, SP.gCold, x, y, S * 0.03, 0.8 * env);
      gl(g, SP.coreWhite, x, y, S * 0.012, 0.9 * env);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /* ---- ground layer (meadow, hills, tree) — drawn with a shift that sinks faster than the sky */
  function drawLand(g, T, cam, env0) {
    const { W, H, S } = R;
    const gsPx = Math.round(cam.gs * H);
    if (gsPx > H * 1.35) return;
    g.save();
    g.translate(0, gsPx);
    const k = ss(153, 166, T);
    // baked hills + mist + meadow, darkened as the dusk deepens
    if (GROUND.topY + gsPx < H) Anim.shared.nightLand.ground(g, env0, { T, alpha: 1 });
    // the tree: the very same tree s6 ends with (shared night tree: crown light, cached skeleton, live sparkles)
    const cxp = W * 0.5, G7 = PIN_IN.y * H + 0.42 * H;   // = s6's ground line (.88 H): the hero is the heart of the crown at (.5,.46)
    const glowK = (1 - 0.55 * ss(155.5, 158.4, T)) * (0.92 + 0.08 * sin(T * 2.4));
    const hcy = PIN_IN.y * H;
    const NT = Anim.shared && Anim.shared.nightTree;
    if (NT && hcy - 0.5 * S + gsPx < H) {
      const o = { cx: cxp, G: G7, T, k: 1, glow: glowK };
      gl(g, SP.gWarmHalo, cxp, hcy, S * 0.4, 0.07 * glowK);
      NT.crown(g, env0, o);
      NT.skeleton(g, env0, o);
      NT.sparkles(g, env0, o);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    // grass in front
    if (H - GRASS.gh + 0.02 * H + gsPx < H) Anim.shared.nightLand.fore(g, env0, { T, alpha: 1 });
    // fireflies
    const ffA = 1 - ss(156.5, 158.2, T);
    if (ffA > 0.01) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const x = (hash1(i * 11) + 0.04 * sin(T * 0.3 + i)) * W + sin(T * 0.7 + i * 2.1) * S * 0.02;
        const y = (0.84 + 0.14 * hash1(i * 17)) * H + sin(T * 0.5 + i * 1.3) * S * 0.015;
        const tw = pow(0.5 + 0.5 * sin(T * (0.8 + hash1(i * 23)) + i * 3.1), 2);
        gl(g, SP.gWarm, x, y, S * 0.012, 0.55 * tw * ffA);
        g.globalAlpha = 0.7 * tw * ffA; g.fillStyle = 'rgb(220,240,120)'; g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // petals lifting from the canopy (ground-attached, they fade as the tree leaves)
    const envA = (1 - ss(157.0, 158.8, T)) * ss(148, 151, T);
    if (envA > 0.01) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 44; i++) {
        const per = 5.5 + 3 * hash1(i * 5 + 1);
        const ph = T / per + hash1(i * 5 + 2) * 10;
        const cyc = floor(ph), f = ph - cyc;
        const sd = i * 31 + cyc * 17;
        const ax = hash2(sd, 5) - 0.5, ay = hash2(sd, 9);
        const x0 = cxp + ax * 0.6 * S, y0 = hcy - ay * 0.2 * S - 0.02 * S;
        const rise = f * (0.5 + 0.5 * hash2(sd, 13)) * 0.95 * S;
        const lat = sin(f * 5.5 + hash2(sd, 17) * 6) * 0.045 * S + (hash2(sd, 21) - 0.5) * 0.18 * S * f;
        const X = x0 + lat, Y = y0 - rise;
        const al = pow(sin(PI * f), 0.8) * envA;
        if (al < 0.03) continue;
        const ang = sin(f * 7 + i) * 0.9 + (hash2(sd, 29) - 0.5) * 2;
        const sz = S * (0.0055 + 0.004 * hash2(sd, 33));
        const c = cos(ang) * sz, sn = sin(ang) * sz;
        g.setTransform(c, sn, -sn, c, X, Y + gsPx);
        g.globalAlpha = 0.9 * al;
        g.drawImage(hash2(sd, 37) < 0.5 ? SP.petal : SP.petalWarm, -1, -0.56, 2, 1.12);
        g.setTransform(1, 0, 0, 1, 0, gsPx);
        gl(g, SP.gWarm, X, Y, sz * 3.2, 0.2 * al);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  function drawSea(g, T, cam) {
    const { W, H, S } = R;
    const yH = cam.yH;
    if (yH > H + 4) return;
    const k = ss(153, 166, T);
    const glow = 0.5 + 0.5 * k;
    {
      const top = mixArr(SEA6[0], SEA7[0], k), bot = mixArr(SEA6[1], SEA7[1], k);
      const ys = max(0, yH);
      const bh = max(3, Math.round(H / 160));
      const yEndSea = Math.min(H, (0.84 + cam.gs) * H + 8);
      for (let y = Math.floor(ys); y < yEndSea; y += bh) {
        const t = clamp((y + bh * 0.5 - yH) / (0.24 * H));
        g.fillStyle = `rgb(${(top[0] + (bot[0] - top[0]) * t) | 0},${(top[1] + (bot[1] - top[1]) * t) | 0},${(top[2] + (bot[2] - top[2]) * t) | 0})`;
        g.fillRect(0, y, W, bh + 1);
      }
    }
    g.globalCompositeOperation = 'lighter';
    // horizon glow line + soft sheen (the mirror reflects the horizon glow)
    const y0 = yH;
    let gr = g.createLinearGradient(0, y0 - 0.07 * S, 0, y0 + 0.006 * S);
    gr.addColorStop(0, 'rgba(30,48,110,0)'); gr.addColorStop(0.75, `rgba(40,62,130,${0.12 * glow})`); gr.addColorStop(0.92, `rgba(70,95,170,${0.09 * glow})`); gr.addColorStop(1, 'rgba(60,85,160,0)');
    g.fillStyle = gr; g.fillRect(0, y0 - 0.07 * S, W, 0.076 * S);
    gr = g.createLinearGradient(0, y0, 0, y0 + 0.16 * S);
    gr.addColorStop(0, `rgba(22,36,84,${0.22 * glow})`); gr.addColorStop(1, 'rgba(10,18,50,0)');
    g.fillStyle = gr; g.fillRect(0, y0, W, 0.16 * S);
    g.globalCompositeOperation = 'source-over';
  }

  function drawReflections(g, T, cam, boost, hx0, hy0) {
    const { W, H, S, pivY } = R;
    const yH = cam.yH;
    if (yH > H - 2) return;
    const ra = ss(162.5, 166.5, T);
    if (ra < 0.01) return;
    const th = cam.th, cT = cos(th), sT = sin(th);
    g.globalCompositeOperation = 'lighter';
    const seaH = H - yH;
    const refl = SKY.refl;
    const NS = 4;
    for (let i = 0; i < refl.length; i++) {
      const s = refl[i];
      const ry = s.dy * cT + s.dx * sT + pivY;
      if (ry < 0.02) continue;
      const Ym = yH + ry * S * 0.5;
      if (Ym > H + 20) continue;
      const X = W / 2 + (s.dx * cT - s.dy * sT) * S;
      if (X < -10 || X > W + 10) continue;
      let a = s.b * (1 - s.tw * (0.5 + 0.5 * sin(T * s.f + s.ph))) * (s.kind === 2 ? 1 : 0.4);
      a *= ra * (0.2 + 0.8 * ss(0, 0.25, ry));
      if (a < 0.03) continue;
      const len = S * (0.035 + 0.075 * s.b) * (s.kind === 2 ? 1.5 : 1);
      const wd = S * (s.kind === 2 ? 0.05 : 0.03);
      const sl = len / NS;
      for (let q = 0; q < NS; q++) {
        const fq = (q + 0.5) / NS;
        const fl = 0.45 + 0.55 * sin(T * (1.7 + 0.5 * q) + s.ph * 3 + q * 2.3);
        const off = sin(T * 0.9 + s.ph * 2 + q * 1.9) * S * 0.004;
        g.globalAlpha = a * 0.3 * fl * (1 - fq * 0.55);
        g.drawImage(SP.streak, X + off - wd / 2, Ym - len / 2 + q * sl, wd, sl * 2.0);
      }
    }
    // faint aurora glow in the water + a few quiet glints of the surface
    const AA = ss(159.3, 162.3, T) * (1 - ss(163.2, 166.0, T)) * ss(163.0, 165, T);
    if (AA > 0.02) {
      for (let q = 0; q < 10; q++) {
        const x = W * (0.08 + 0.84 * hash1(q * 7 + 3)) + sin(T * 0.3 + q) * S * 0.02;
        const fl = 0.5 + 0.5 * sin(T * (0.5 + 0.1 * q) + q * 2.3);
        const wd = S * (0.06 + 0.05 * hash1(q * 5 + 1));
        g.globalAlpha = AA * 0.22 * fl;
        g.drawImage(SP.streakG, x - wd / 2, yH + 0.004 * S, wd, min(seaH, S * 0.22));
      }
    }
    g.fillStyle = 'rgb(150,180,255)';
    for (let q = 0; q < 22; q++) {
      const t0 = pow(hash1(q * 13 + 5), 1.6);
      const y = yH + 0.01 * H + t0 * seaH * 0.95;
      const x = (hash1(q * 17 + 9) + 0.02 * sin(T * 0.2 + q)) * W;
      const wd = S * (0.015 + 0.05 * (0.3 + t0));
      const fl = pow(0.5 + 0.5 * sin(T * (0.6 + 0.4 * hash1(q * 3)) + q * 2.7), 2);
      g.globalAlpha = ra * 0.16 * fl * (0.4 + 0.6 * (1 - t0));
      g.fillRect(x - wd / 2, y, wd, max(1, S * (0.0012 + 0.002 * t0)));
    }
    // the constellation, mirrored in the water
    const cs = R.cs, cra = ra * ss(163.5, 166, T) * (1 - ss(165.0, 166.8, T));
    for (let i = 0; i < CONS.length; i++) {
      const X = hx0 + CONS[i][0] * cs, Y = hy0 + CONS[i][1] * cs;
      const Ym = yH + (yH - Y) * 0.5;
      if (Ym < yH || Ym > H + 20) continue;
      const fl = 0.55 + 0.45 * sin(T * (1.4 + i * 0.23) + i * 1.9);
      const off = sin(T * 0.8 + i * 2.3) * S * 0.004;
      const wd = S * 0.04, len = S * 0.08;
      for (let q = 0; q < 3; q++) {
        const fq = (q + 0.5) / 3;
        g.globalAlpha = cra * 0.34 * fl * (1 - fq * 0.6);
        g.drawImage(SP.streak, X + off * (q + 1) * 0.5 - wd / 2, Ym - len / 2 + q * len / 3, wd, len / 3 * 2.0);
      }
    }
    // the hero's path of light on the water: a broad soft column with glints
    const hx = W / 2;
    const pa = ss(163.8, 167, T);
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
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  const _fp = [0, 0, 0, 0, 0];
  // petal flight position in sky coordinates (x, y) + path direction (dx, dy) at time Tq
  function flightXY(s, p, Tq, cT, sT, pivY) {
    const tau = clamp((Tq - p.tl) / p.d, 0, 1);
    const e0 = tau * tau * (3 - 2 * tau);
    const e = lerp(tau, e0, 0.85);
    const ex = s.dx * cT - s.dy * sT, ey = s.dy * cT + s.dx * sT + pivY;
    const dx = ex - p.x0, dy = ey - p.y0, L = hypot(dx, dy) || 1;
    const nz = (u.noise1(p.g * 9.1 + e * 2.6 + Tq * 0.3 + p.jit) * 2 - 1) + 0.35 * sin(e * 11 + p.jit);
    const w = sin(PI * e) * p.amp * nz;
    _fp[0] = p.x0 + dx * e - dy / L * w; _fp[1] = p.y0 + dy * e + dx / L * w; _fp[2] = dx; _fp[3] = dy; _fp[4] = nz;
    return _fp;
  }
  function drawFlights(g, T, cam) {
    const { W, H, S, pivY } = R;
    const yH = cam.yH, th = cam.th, cT = cos(th), sT = sin(th);
    const fl = SKY.flights, ramp = 0.25 + 0.9 * ss(153, 157, T);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0, n = fl.length; i < n; i++) {
      const s = fl[i], p = s.pet;
      const tau = (T - p.tl) / p.d;
      if (tau <= 0 || tau >= 1) continue;
      const vis = clamp((ramp - hash1(i * 13 + 7)) / 0.15, 0, 1);   // the stream thickens gradually from T=153 (25 % -> 100 % by 157)
      if (vis < 0.01) continue;
      const a = flightXY(s, p, T, cT, sT, pivY);
      const X = W / 2 + a[0] * S, Y = yH - a[1] * S;
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const nz = a[4];
      const m = ss(0.5, 1, tau), sz = S * p.sz * (1 - 0.55 * ss(0.15, 1, tau));
      const aP = ss(0, 0.08, tau) * (1 - m) * vis;
      if (aP > 0.01) {
        const ang = sin(T * 2 + p.jit) * 0.8 + p.spin * tau * 2 + nz * 0.8;
        const c = cos(ang) * sz, sn = sin(ang) * sz;
        g.setTransform(c, sn, -sn, c, X, Y);
        g.globalAlpha = 0.95 * aP;
        g.drawImage(p.warm ? SP.petalWarm : SP.petal, -1, -0.56, 2, 1.12);
        g.setTransform(1, 0, 0, 1, 0, 0);
        if ((i & 3) === 0 && sz > S * 0.0036) gl(g, p.warm ? SP.gWarm : SP.gPink, X, Y, sz * 3.6, 0.5 * aP);
      }
      if (m > 0.01) {
        gl(g, SP.gCold, X, Y, sz * 3.4 + S * 0.004, 0.55 * m * vis);
        g.globalAlpha = min(1, 0.9 * m * vis); g.fillStyle = '#eaf0ff';
        const z = max(1.2, sz * 0.5); g.fillRect(X - z / 2, Y - z / 2, z, z);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  function drawSkyPetals(g, T, cam) {
    // a few petals drifting through the night sky (B7: "a few drifting petals")
    const A = ss(159.5, 163, T);
    if (A < 0.01) return;
    const { W, H, S } = R;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const per = 16 + 8 * hash1(i * 5 + 1);
      const ph = T / per + hash1(i * 5 + 2);
      const f = ph - floor(ph);
      const x = (hash1(i * 7 + 3) + 0.06 * sin(T * 0.18 + i * 2.1) + (f - 0.5) * 0.08) * W;
      const y = (1.08 - f * 1.2) * H;
      const wob = sin(T * 0.9 + i * 1.7) * S * 0.02;
      const al = A * sin(PI * clamp(f * 1.1)) * (0.55 + 0.35 * hash1(i * 11)) * (1 - ss(cam.yH - 0.12 * S, cam.yH - 0.01 * S, y));
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

  function drawBloomWave(g, T, hx, hy) {
    const { S, W, H } = R;
    const t = clamp((T - 157.4) / 3.6);
    if (t <= 0 || t >= 1) return;
    // a gentle, wide breath of light leaving the hero (feathered on both edges, never a hard ring)
    const Rw = S * (0.16 + 1.25 * (1 - pow(1 - t, 2)));
    const a1 = 0.1 * pow(1 - t, 1.5) * ss(0, 0.25, t);
    g.globalCompositeOperation = 'lighter';
    if (a1 > 0.004) {
      const wd = 0.07 * S + Rw * 0.1, A0 = clamp(a1 * 1.9, 0, 1);
      const gr = g.createRadialGradient(hx, hy, max(0, Rw - wd), hx, hy, Rw + wd);
      gr.addColorStop(0, 'rgba(255,200,140,0)');
      gr.addColorStop(0.3, `rgba(255,215,170,${A0 * 0.3})`);
      gr.addColorStop(0.55, `rgba(190,212,255,${A0})`);
      gr.addColorStop(0.8, `rgba(110,146,255,${A0 * 0.3})`);
      gr.addColorStop(1, 'rgba(80,120,255,0)');
      g.strokeStyle = gr; g.lineWidth = wd * 2; g.globalAlpha = 1;
      g.beginPath(); g.arc(hx, hy, Rw, 0, TAU); g.stroke();
    }
    const fl = exp(-pow((T - 158.1) / 0.55, 2));
    gl(g, SP.gGold, hx, hy, S * 0.3, 0.75 * fl);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  function drawConstellation(g, T, hx, hy, pulse) {
    const { S, W, H } = R;
    const cs = R.cs;
    const ptx = [], pty = [];
    for (let i = 0; i < CONS.length; i++) { ptx.push(hx + CONS[i][0] * cs); pty.push(hy + CONS[i][1] * cs); }
    const lineA = ss(161.0, 162.0, T) * (1 - ss(164.6, 166.4, T)), cf = 1 - ss(165.0, 166.8, T);
    if (cf < 0.01) return;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const lw = max(1, S * 0.0018);
    const chain = (ch, delay) => {
      for (let s = 0; s < ch.length - 1; s++) {
        const t0 = CONS_T0 + 0.5 + delay + s * 0.62;
        const p = u.ease.inOutSine(clamp((T - t0) / 0.62));
        if (p <= 0.001) continue;
        const ax = ptx[ch[s]], ay = pty[ch[s]], bx = ptx[ch[s + 1]], by = pty[ch[s + 1]];
        const x = ax + (bx - ax) * p, y = ay + (by - ay) * p;
        g.strokeStyle = `rgba(120,160,255,${0.12 * lineA})`; g.lineWidth = lw * 4;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(x, y); g.stroke();
        g.strokeStyle = `rgba(190,215,255,${0.5 * lineA})`; g.lineWidth = lw;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(x, y); g.stroke();
        if (p < 0.999) gl(g, SP.gCold, x, y, S * 0.02, 0.7 * cf);
      }
    };
    chain(CHAIN_A, 0); chain(CHAIN_B, 0.12);
    // the stars of the constellation: each pops with a ring
    for (let i = 1; i < CONS.length; i++) {
      const j = i % 2 ? (i + 1) >> 1 : i >> 1; // order along the chains
      const t0 = CONS_T0 + 0.25 + (i <= 9 ? floor((i + 1) / 2) * 0.62 + (i % 2 ? 0 : 0.12) : 2.4);
      const dt = T - t0;
      if (dt < 0) continue;
      const a = ss(0, 0.5, dt) * cf;
      const pop = exp(-dt * 1.7);
      const tw = 0.82 + 0.18 * sin(T * (1.1 + i * 0.37) + i * 2.3);
      const X = ptx[i], Y = pty[i];
      const big = i === 9 || i === 5 || i === 6 ? 1.15 : 1;
      gl(g, SP.gCold, X, Y, S * 0.04 * big * (1 + pop * 1.2), a * 0.55 * tw);
      gl(g, SP.coreWhite, X, Y, S * 0.018 * big * (1 + pop * 0.8), a * 0.95 * tw);
      if (i === 5 || i === 6 || i === 9 || i === 3 || i === 4) crossLines(g, X, Y, S * (i === 9 ? 0.06 : 0.04) * (1 + pop * 0.6), a * 0.8 * tw, max(1, S * 0.0014));
      if (dt < 1.6) gl(g, SP.gCold, X, Y, S * (0.05 + 0.08 * dt / 1.6), 0.5 * pow(1 - dt / 1.6, 2) * cf);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  function drawHero(g, T, hx, hy) {
    const { S } = R;
    const pulse = 1 + 0.06 * sin(T * 2.4);
    const rr = S * KS([[152, PIN_IN.r], [156, PIN_IN.r], [158.2, 0.0175], [160.2, 0.0178], [162.4, 0.0178], [165, 0.0182], [166.4, PIN_OUT.r], [170, PIN_OUT.r]], T);
    const m = ss(157.8, 162.6, T); // gold -> warm white -> cool blue-white (the hue is interpolated directly, saturation dips to near-white half-way)
    const hue = PIN_IN.hue + (PIN_OUT.hue - PIN_IN.hue) * ss(0.4, 0.6, m);   // the switch happens where the colour is (almost) white
    const sat = 90 * (1 - 0.9 * pow(sin(PI * m), 0.7));
    const flare = ss(158.3, 160.6, T) * lerp(0.6, 1.0, ss(163.5, 166.2, T));
    hero.draw(g, hx, hy, rr, { hue, sat, form: 'star', a: 1, pulse, glow: 1, flare });
  }

  /* ================================================================== scene */
  Anim.defineScene({
    id: 's7_stars',

    init(env) {
      bakeMW();
    },

    resize(env) {
      bakeSprites();
      buildSky(env);
      ensureLand(env);
      bakeAurora(env);
    },

    fx(T) {
      return { bloom: KS([[152, 0.78], [156, 0.8], [158, 1.0], [160.2, 1.2], [162.6, 1.1], [165, 0.95], [167, 0.88], [170, 0.86]], T), vignette: 0.52 };
    },

    render(g, T, L, env) {
      const { W, H, S } = env;
      if (!R || R.W !== W || R.H !== H) { buildSky(env); }
      const hy = hyAt(T);
      const cam = { hy, yH: hy * H, gs: gsAt(T), th: thetaAt(T) };
      const heroX = W * 0.5, heroY = heroYAt(T) * H;
      const boost = 1 + 0.35 * exp(-pow((T - 160.0) / 1.6, 2)); // the sky "blooms"

      drawSky(g, T, cam);
      drawMilkyWay(g, T, cam);
      drawStars(g, T, cam, boost);
      drawAurora(g, T, cam);
      drawSea(g, T, cam);
      drawReflections(g, T, cam, boost, heroX, heroY);
      drawShooting(g, T);
      drawLand(g, T, cam, env);
      drawBloomWave(g, T, heroX, heroY);
      drawSkyPetals(g, T, cam);
      drawFlights(g, T, cam);
      drawConstellation(g, T, heroX, heroY, 1);
      drawHero(g, T, heroX, heroY);
    },
  });
})();
