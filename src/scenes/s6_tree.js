/* ひとしずくの旅 — s6_tree (T 122–156) 芽ばえと季節
 *
 * 122–127  underground (handoff B5): the drop hovers over the dim seed, then sinks onto it.
 * ~127     touch: rings of light, the seed wakes gold-green.
 * 127–133  a luminous root filament branches down, the shoot climbs; the camera rises through glowing strata and
 *          mycelium to the surface (~133) and the sprout breaks into a misty dawn meadow.
 * 133–152  the time-lapse: one deterministic recursive skeleton grows (trunk thickens, limbs, twigs, leaf clusters),
 *          days race (sun / moon arcs), four seasons turn: blossom -> summer -> autumn -> snow -> blossom again.
 *          The camera slowly pulls back while the tree grows.
 * 150–156  dusk: violet night, the huge blossoming tree glows, petals lift upward, the hero is its golden heart
 *          at (.5,.46)  (handoff B6).
 *
 * Everything is a pure function of T: skeleton + sprites are built once in init()/resize(); the camera / growth /
 * day clock are keyframed or tabulated; every particle is analytic f(seed, T).
 */
(function () {
  'use strict';
  const { util: u, hero } = Anim;
  const TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt,
    exp = Math.exp, pow = Math.pow, floor = Math.floor, ceil = Math.ceil, atan2 = Math.atan2;
  const clamp = u.clamp, lerp = u.lerp, ss = u.smoothstep, rgb = u.rgb, mixc = u.mixc;
  const PIN_IN = hero.pins.find((p) => p.to === 's6_tree') || { x: 0.5, y: 0.56, r: 0.014, hue: 200, form: 'drop' };
  const PIN_OUT = hero.pins.find((p) => p.from === 's6_tree') || { x: 0.5, y: 0.46, r: 0.016, hue: 48, form: 'orb' };

  const rgba = (c, a) => `rgba(${c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0] | 0},${c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1] | 0},${c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2] | 0},${a})`;
  const mulc = (c, m) => [c[0] * m[0], c[1] * m[1], c[2] * m[2]];
  const hex = (h) => rgb(h);
  const KS = (k, T) => u.keys(k, T, 'spline');

  /* ------------------------------------------------------------------ timeline of the scene */
  const T_TOUCH = 127.05;      // the drop touches the seed
  const T_STEM = 128.3;        // the shoot starts to rise (camera starts to rise)
  const CACHE_T = 146.4;       // from here on the full-grown skeleton is drawn from a cached bitmap

  /* ------------------------------------------------------------------ seasons + the racing day */
  const SB = [141, 144.5, 148, 151.5];
  const seasonVal = (T) => ss(SB[0] - 0.7, SB[0] + 0.7, T) + ss(SB[1] - 0.7, SB[1] + 0.7, T) + ss(SB[2] - 0.7, SB[2] + 0.7, T) + ss(SB[3] - 0.7, SB[3] + 0.7, T);
  const SW = [1, 0, 0, 0];
  function seasonW(sv) {
    SW[0] = max(0, 1 - sv) + max(0, sv - 3);
    SW[1] = max(0, 1 - abs(sv - 1));
    SW[2] = max(0, 1 - abs(sv - 2));
    SW[3] = max(0, 1 - abs(sv - 3));
  }
  // the racing day: the time of day in "turns" (x.25 = sunrise, x.5 = noon, x.75 = sunset, x+1.0 = midnight), authored per season so that
// every season keeps ONE dominant sky for ~3 s (spring: pink dawn -> bright day -> rose dusk; summer: bright blue; autumn: gold; winter: pale
// blue-white; then the final dusk). The nights between two days are a quick, violet "dip" (the sky never goes darker than dusk-violet until
// the very last dusk), so the light changes slowly instead of strobing.
const TODT = [[122, 1.235], [131.0, 1.235], [134.0, 1.275], [136.0, 1.33], [138.3, 1.45], [140.0, 1.62], [140.7, 1.72], [141.1, 1.77],
  [141.95, 2.235], [143.1, 2.5], [144.6, 2.745],
  [145.35, 3.235], [146.4, 3.5], [148.0, 3.745],
  [148.65, 4.235], [149.45, 4.5], [150.7, 4.75], [152.6, 5.0], [160, 5.0]];
const todAt = (T) => u.keys(TODT, T, 'spline');

/* ------------------------------------------------------------------ colour tables */
  // sky by sun elevation (-1..1): night, twilight, dawn/dusk, low sun, day
  const SKY_RISE = [
    [-0.45, [hex('#0a1030'), hex('#1a1a48'), hex('#3a2a5a')]],
    [-0.20, [hex('#26326e'), hex('#56488a'), hex('#a06a90')]],
    [-0.04, [hex('#5a6f9c'), hex('#c8a6a0'), hex('#f2d3a8')]],
    [0.10, [hex('#6684b8'), hex('#e0b8aa'), hex('#ffdcb0')]],
    [0.35, [hex('#4a80c8'), hex('#8cb4e0'), hex('#e8dcc8')]],
    [0.75, [hex('#3f7ccc'), hex('#7eb0e4'), hex('#c6dcec')]],
  ];
  const SKY_SET = [
    [-0.45, [hex('#0a1030'), hex('#1a1a48'), hex('#3a2a5a')]],
    [-0.20, [hex('#2a306c'), hex('#5c4688'), hex('#a8648a')]],
    [-0.04, [hex('#4c5c96'), hex('#c28e9c'), hex('#ffb882')]],
    [0.10, [hex('#5a78b0'), hex('#e8aea4'), hex('#ffcc98')]],
    [0.35, [hex('#4a80c8'), hex('#8cb4e0'), hex('#ecd8bc')]],
    [0.75, [hex('#3f7ccc'), hex('#7eb0e4'), hex('#c6dcec')]],
  ];
  const SKY_LAPSE_NIGHT = [hex('#222c6a'), hex('#3a4488'), hex('#6a64a2')]; // softer nights during the time-lapse
  const SEASON_SKY_TINT = [[hex('#ffd0e0'), 0.10], [hex('#3c84f0'), 0.10], [hex('#ffb86a'), 0.28], [hex('#7a92b8'), 0.55]];

  // hillside / meadow colours per season (day-lit)
  const GRASS = [hex('#8cd06e'), hex('#46a258'), hex('#bca24c'), hex('#c6d4e8')];
  const HILLC = [hex('#7cc088'), hex('#4a9a64'), hex('#b09a54'), hex('#b4c4dc')];
  const LEAFPAL = [[0, hex('#b6e070')], [1, hex('#2e7a46')], [2, hex('#e6c440')], [3, hex('#e07a2a')], [4, hex('#b0302c')]];
  const NC = 22; // colour steps of the leaf-cluster sprites

  /* ------------------------------------------------------------------ module state (static, built in init/resize) */
  let GEO = null;       // aspect dependent geometry
  let SPR = null;       // sprites
  let SOIL = null;      // underground canvas
  let TR = null;        // tree skeleton
  let HILL = null;      // hills
  let GR = null;        // grass blades
  let CAM = null;       // camera tables
  let TL = null;        // scratch layer (earth dissolve)
  let BGL = null;       // half-resolution background layer (sky + hills + ground)
  let MYC = null, ROOT = null, STEMW = null, PRE = null; // underground glow structures
  let PART = null;      // particle seeds

  /* ================================================================== the tree skeleton (deterministic) */
  const NT = 400; // apex table resolution
  const BCLS = [28, 32, 36, 40, 45, 50, 56, 63, 70, 79, 88, 99, 112, 126]; // blossom sprite size classes (drawn 1:1)
  function buildTree(env) {
    const { S, H } = env;
    const hT = (0.88 * H - 0.46 * H) / S; // crown centre height above the base, in S units
    const r = u.rng(60613);
    const rnd = (a, b) => a + (b - a) * r();
    const asp = clamp((H / S - 1) / 0.78);
    const crown = { cy: hT + 0.02 * asp, rx: 0.335 + 0.1 * asp, ry: 0.285 + 0.2 * asp };
    const areaK = (crown.rx * crown.ry) / (0.335 * 0.285);   // bigger crowns (phones) get proportionally more foliage
    const inside = (x, y, k) => {
      const dx = x / (crown.rx * k), dy = (y - crown.cy) / (crown.ry * k);
      const ang = atan2(dy, dx), lob = 1 + 0.17 * (u.noise1(ang * 1.7 + 40) - 0.5) * 2 + 0.07 * sin(ang * 5 + 1);
      return dx * dx + dy * dy < lob * lob;
    };
    const NN = [16, 11, 9, 7, 6, 5];
    const SPD = [0.07, 0.10, 0.12, 0.13, 0.14, 0.14];
    const TROP = [0.08, 0.055, 0.05, 0.035, 0.0, -0.02];
    const WOB = [0.14, 0.3, 0.3, 0.34, 0.38, 0.42];
    const PK = [0, 0.42, 0.32, 0.24, 0.2, 0];
    const BR = [];

    function mk(par, pj, x, y, a, len, depth, t0) {
      const n = NN[depth];
      const ds = len / (n - 1);
      const b = { depth, par, pj, x: [x], y: [y], a: [a], t: [t0], kids: [], len };
      const ph = r() * 200;
      let px = x, py = y, aa = a;
      for (let i = 1; i < n; i++) {
        aa += (u.noise1(ph + i * 0.6) - 0.5) * WOB[depth];
        let d = PI / 2 - aa; d = atan2(sin(d), cos(d));
        aa += d * TROP[depth];
        if (depth === 0) aa += clamp(-px * 4.0, -0.09, 0.09);   // keep the trunk over its base
        px += cos(aa) * ds; py += sin(aa) * ds;
        if (depth >= 2 && !inside(px, py, 1.07)) break;
        if (depth > 0 && py < 0.05) break;
        b.x.push(px); b.y.push(py); b.a.push(aa); b.t.push(t0 + (i * ds) / SPD[depth]);
      }
      if (b.x.length < 2) return null;
      if (depth === 0) {
        // keep the crown over its base: shear the trunk so that its top sits at x = 0, then rebuild the headings
        const nn0 = b.x.length, dx = b.x[nn0 - 1] + 0.02 * (u.noise1(7.7) - 0.5);
        for (let i = 0; i < nn0; i++) b.x[i] -= dx * pow(i / (nn0 - 1), 1.5);
        for (let i = 0; i < nn0; i++) { const j = min(nn0 - 1, i + 1), k0 = j === i ? i - 1 : i; b.a[i] = atan2(b.y[j === i ? i : j] - b.y[k0], b.x[j === i ? i : j] - b.x[k0]); }
      }
      b.idx = BR.length; BR.push(b);
      const nn = b.x.length;
      const kid = (j, ang, clen, delay) => {
        const c = mk(b, j, b.x[j], b.y[j], ang, clen, depth + 1, b.t[j] + delay);
        if (c) b.kids.push(c);
      };
      if (depth === 0) {
        const L = [0.3, 0.3, 0.33, 0.27, 0.3, 0.23, 0.26, 0.19];
        const spec = [[nn - 1, 0.1], [nn - 1, 0.85], [nn - 2, -0.9], [nn - 3, 1.02], [nn - 4, -1.08], [nn - 5, 1.12], [nn - 6, -1.16], [nn - 7, 1.1]];   // limbs fan upwards (no low, horizontal arms)
        spec.forEach(([j, off], i) => { if (j >= 2) kid(j, b.a[j] + off * rnd(0.8, 1.15), L[i] * rnd(0.85, 1.2), rnd(0.15, 0.5) + i * 0.05); });
      } else if (depth < 5) {
        let side = r() < 0.5 ? 1 : -1;
        for (let j = depth === 1 ? 2 : 1; j < nn - 1; j++) {
          if (r() < PK[depth]) {
            side = -side;
            const jl = j / (nn - 1);
            kid(j, b.a[j] + side * rnd(0.5, 0.98), len * rnd(0.5, 0.74) * (1 - 0.35 * jl), rnd(0.12, 0.4));
          }
        }
        if (depth >= 2 && r() < 0.55) { // tip fork
          kid(nn - 1, b.a[nn - 1] + rnd(0.35, 0.7), len * rnd(0.4, 0.6), rnd(0.05, 0.2));
          if (depth <= 3 && r() < 0.4) kid(nn - 1, b.a[nn - 1] - rnd(0.35, 0.7), len * rnd(0.4, 0.6), rnd(0.05, 0.2));
        }
      }
      return b;
    }

    const trunkLen = max(0.15, hT - 0.17 - 0.16 * asp);
    mk(null, 0, 0, 0, PI / 2 + 0.05, trunkLen, 0, 0);

    // pipe-model widths (children first)
    const WTIP = 0.0016, WS = 1.5;
    for (let bi = BR.length - 1; bi >= 0; bi--) {
      const b = BR[bi], n = b.x.length;
      const add = new Float32Array(n);
      for (const c of b.kids) add[c.pj] += c.w[0] * c.w[0];
      b.w = new Float32Array(n);
      let acc = WTIP * WTIP;
      for (let i = n - 1; i >= 0; i--) { acc += add[i]; b.w[i] = sqrt(acc); }
    }
    // pieces
    let np = 0;
    for (const b of BR) np += b.x.length - 1;
    const NFL = 6;
    np += NFL;
    const P = {
      n: np, x0: new Float32Array(np), y0: new Float32Array(np), x1: new Float32Array(np), y1: new Float32Array(np),
      s0: new Float32Array(np), s1: new Float32Array(np), w: new Float32Array(np), d: new Uint8Array(np), b: new Uint16Array(np),
    };
    let tmax = 0;
    for (const b of BR) tmax = max(tmax, b.t[b.t.length - 1]);
    let pi = 0;
    for (const b of BR) {
      const n = b.x.length;
      for (let i = 1; i < n; i++, pi++) {
        P.x0[pi] = b.x[i - 1]; P.y0[pi] = b.y[i - 1]; P.x1[pi] = b.x[i]; P.y1[pi] = b.y[i];
        P.s0[pi] = b.t[i - 1] / tmax; P.s1[pi] = b.t[i] / tmax;
        let w = (b.w[i - 1] + b.w[i]) * 0.5 * WS * (b.depth === 0 ? 1.65 : b.depth === 1 ? 1.18 : 1);
        if (b.depth === 0 && i <= 4) w *= 1 + 0.45 * (1 - (i - 1) / 4);
        P.w[pi] = w; P.d[pi] = b.depth; P.b[pi] = b.idx;
      }
    }
    // surface roots: the trunk flares into the ground
    {
      const w0 = BR[0].w[0] * WS * 1.45;
      for (let q = 0; q < NFL; q++, pi++) {
        const sg = q % 2 ? 1 : -1, m = floor(q / 2);
        const reach = 0.022 + 0.018 * m + 0.006 * r();
        P.x0[pi] = sg * 0.003; P.y0[pi] = 0.032 - 0.008 * m; P.x1[pi] = sg * reach; P.y1[pi] = -0.006 - 0.004 * m;
        P.s0[pi] = 0.0; P.s1[pi] = 0.05; P.w[pi] = w0 * (0.3 - 0.07 * m); P.d[pi] = 7; P.b[pi] = 0;
      }
    }
    // apex table: height of the highest growing point at growth clock gamma
    const APH = new Float32Array(NT), APX = new Float32Array(NT);
    let hmax = 0, xmax = 0;
    for (let k = 0; k < NT; k++) {
      const gm = k / (NT - 1);
      let best = 0, bx = 0;
      for (let i = 0; i < np - NFL; i++) {
        if (gm <= P.s0[i]) continue;
        const q = min(1, (gm - P.s0[i]) / (P.s1[i] - P.s0[i]));
        const y = P.y0[i] + (P.y1[i] - P.y0[i]) * q;
        if (y > best) { best = y; bx = P.x0[i] + (P.x1[i] - P.x0[i]) * q; }
      }
      hmax = max(hmax, best); APH[k] = hmax; APX[k] = bx; xmax = bx;
    }
    const Htot = APH[NT - 1];

    // foliage: clusters on twig nodes + fillers that give the crown its volume (each filler is tied to its nearest node's birth)
    const nodes = [];
    for (const b of BR) {
      const n = b.x.length;
      if (b.depth < 2) continue;
      for (let j = 1; j < n; j++) nodes.push({ x: b.x[j], y: b.y[j], t: b.t[j] / tmax, d: b.depth, last: j === n - 1 });
    }
    const nearest = (x, y) => {
      let best = 1e9, bn = null;
      for (const nd of nodes) { const d = (nd.x - x) * (nd.x - x) + (nd.y - y) * (nd.y - y); if (d < best) { best = d; bn = nd; } }
      return [bn, sqrt(best)];
    };
    const pickNodes = (count) => {
      const wt = (c) => (c.d >= 4 ? 1 : c.d === 3 ? 0.8 : 0.45) * (c.last ? 1.6 : 1);
      const wsum = nodes.reduce((s, c) => s + wt(c), 0), keep = Math.min(1, count / wsum), out = [];
      for (const c of nodes) if (r() < keep * wt(c)) out.push(c);
      return out;
    };
    const fillers = (count, maxd, k) => {
      const out = [];
      let guard = 0;
      while (out.length < count && guard++ < 4000) {
        const x = rnd(-crown.rx * k, crown.rx * k), y = rnd(crown.cy - crown.ry * k, crown.cy + crown.ry * k);
        if (!inside(x, y, k)) continue;
        const [nd, d] = nearest(x, y);
        if (d > maxd) continue;
        out.push({ x, y, t: nd.t + 0.02 });
      }
      return out;
    };
    const LV = [];
    for (const c of pickNodes(Math.round(150 * Math.sqrt(areaK)))) LV.push({ x: c.x + rnd(-0.012, 0.012), y: c.y + rnd(-0.01, 0.014), b: c.t + 0.012, sz: (c.last ? 1.08 : 1) * rnd(0.078, 0.104), r: r(), z: r() * 0.9, bl: 0, juv: 0 });
    for (const c of fillers(Math.round(110 * areaK), 0.13, 0.92)) LV.push({ x: c.x, y: c.y, b: c.t, sz: rnd(0.088, 0.116), r: r(), z: r() * 0.7, bl: 0, juv: 0 });
    // juvenile leaves: single blades alternating up the young trunk (they fall away once the crown closes)
    {
      const b = BR[0];
      for (let j = 2; j < b.x.length; j++) {
        const sg = j % 2 ? 1 : -1;
        LV.push({ x: b.x[j], y: b.y[j], b: b.t[j] / tmax + 0.004, sz: rnd(0.058, 0.074) * (1 - 0.35 * j / b.x.length), r: r(), z: 0.9, bl: 0, juv: sg });
      }
    }
    // blossoms: their own little clusters along limbs and twigs
    const BV = [];
    for (const c of pickNodes(Math.round(190 * Math.sqrt(areaK)))) BV.push({ x: c.x + rnd(-0.012, 0.012), y: c.y + rnd(-0.006, 0.016), b: c.t + 0.01, sz: rnd(0.05, 0.072), r: r() });
    for (const c of fillers(Math.round(120 * areaK), 0.1, 0.96)) BV.push({ x: c.x, y: c.y, b: c.t, sz: rnd(0.05, 0.07), r: r() });
    const nbl = BV.length;
    const BL = { n: nbl, x: new Float32Array(nbl), y: new Float32Array(nbl), b: new Float32Array(nbl), sz: new Float32Array(nbl), r: new Float32Array(nbl), r2: new Float32Array(nbl), r3: new Float32Array(nbl) };
    const r4 = u.rng(4141);
    BV.forEach((v, i) => { BL.x[i] = v.x; BL.y[i] = v.y; BL.b[i] = v.b; BL.sz[i] = v.sz; BL.r[i] = v.r; BL.r2[i] = r4(); BL.r3[i] = r4(); });
    // order back->front by layer (z), keep deterministic
    LV.sort((a, b) => a.z - b.z);
    const nl = LV.length;
    const L = {
      n: nl, x: new Float32Array(nl), y: new Float32Array(nl), b: new Float32Array(nl), sz: new Float32Array(nl), r: new Float32Array(nl),
      z: new Uint8Array(nl), bl: new Uint8Array(nl), juv: new Int8Array(nl), td: new Float32Array(nl), r2: new Float32Array(nl), r3: new Float32Array(nl),
      zs: [0, 0, 0, 0],
    };
    const r2 = u.rng(777);
    LV.forEach((v, i) => {
      L.x[i] = v.x; L.y[i] = v.y; L.b[i] = v.b; L.sz[i] = v.sz; L.r[i] = v.r; L.bl[i] = v.bl; L.juv[i] = v.juv;
      L.z[i] = v.z < 0.34 ? 0 : v.z < 0.72 ? 1 : 2;
      L.td[i] = 145.7 + 2.5 * v.r;   // autumn leaves are all gone before the snow comes (~148.5)
      L.r2[i] = r2(); L.r3[i] = r2();
    });
    let c0 = 0, c1 = 0;
    for (let i = 0; i < nl; i++) { if (L.z[i] === 0) c0 = i + 1; if (L.z[i] <= 1) c1 = i + 1; }
    L.zs = [0, c0, c1, nl];

    return { hT, crown, P, L, BL, APH, APX, Htot, np, nl, trunkLen, nb: BR.length, WS };
  }
  // growth clock for an apex height (units): first gamma whose apex height reaches h
  function invApex(h) {
    const A = TR.APH;
    if (h <= 0) return 0;
    if (h >= A[NT - 1]) return 1;
    let lo = 0, hi = NT - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] < h) lo = m; else hi = m; }
    const f = (h - A[lo]) / max(1e-6, A[hi] - A[lo]);
    return (lo + f) / (NT - 1);
  }
  function apexAt(gm) {
    const x = clamp(gm, 0, 1) * (NT - 1), i = min(NT - 2, floor(x)), f = x - i;
    return [lerp(TR.APH[i], TR.APH[i + 1], f), lerp(TR.APX[i], TR.APX[i + 1], f)];
  }

  /* ================================================================== sprites */
  const LMLEV = [[1, 1, 1], [0.76, 0.8, 0.9], [0.5, 0.56, 0.78], [0.26, 0.3, 0.52], [0.05, 0.055, 0.14]];
  const NLV = LMLEV.length - 1;
  const LMLUM = LMLEV.map((m) => (m[0] + m[1] + m[2]) / 3);
  function leafSprite(ci, shade, lv) {
    return u.sprite(`s6leaf|${ci}|${shade}|${lv}`, 80, 80, (c) => {
      const pc = (ci / (NC - 1)) * 4;
      const base = u.keyc(LEAFPAL, pc, 'linear');
      const sm = [[0.42, 0.55, 0.82], [0.8, 0.88, 0.94], [1.16, 1.12, 0.96]][shade];
      const col = mulc(mulc(base, sm), LMLEV[lv]);
      const r = u.rng(ci * 31 + shade * 7 + 11 + 1000);   // same lumps for every colour/light (only the tint changes)
      const rs = u.rng(4711);                               // shared silhouette
      // irregular body: a union of a few soft lumps
      const lumps = [];
      for (let i = 0; i < 7; i++) { const a = rs() * TAU, d = rs() * 15; lumps.push([40 + cos(a) * d, 40 + sin(a) * d * 0.85, 9 + rs() * 9]); }
      for (const [lx, ly, lr] of lumps) {
        const g0 = c.createRadialGradient(lx, ly, 1, lx, ly, lr + 6);
        g0.addColorStop(0, rgba(mulc(col, [0.74, 0.78, 0.85]), 0.95));
        g0.addColorStop(0.7, rgba(mulc(col, [0.8, 0.84, 0.9]), 0.8));
        g0.addColorStop(1, rgba(col, 0));
        c.fillStyle = g0; c.fillRect(lx - lr - 6, ly - lr - 6, (lr + 6) * 2, (lr + 6) * 2);
      }
      // leaves: inner (dark, random) then outer sprays pointing outwards (lighter)
      const leaf = (lx, ly, ang, len, wid, v) => {
        const hj = (r() - 0.5) * 0.14;
        const cc = [col[0] * (v + hj), col[1] * (v - hj * 0.4), col[2] * v];
        c.save(); c.translate(lx, ly); c.rotate(ang);
        const lg = c.createLinearGradient(0, -wid, 0, wid);
        lg.addColorStop(0, rgba(mulc(cc, [1.14, 1.12, 1.0]), 1));
        lg.addColorStop(1, rgba(mulc(cc, [0.66, 0.72, 0.86]), 1));
        c.fillStyle = lg;
        c.beginPath(); c.moveTo(-len, 0); c.quadraticCurveTo(0, -wid * 1.6, len, 0); c.quadraticCurveTo(0, wid * 1.6, -len, 0); c.fill();
        c.strokeStyle = rgba(mulc(cc, [0.6, 0.68, 0.8]), 0.4); c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(-len * 0.8, 0); c.lineTo(len * 0.8, 0); c.stroke();
        c.restore();
      };
      for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * 18; leaf(40 + cos(a) * d, 40 + sin(a) * d, r() * TAU, 5 + r() * 3.5, 2.2 + r() * 1.2, 0.7 + r() * 0.3); }
      for (let i = 0; i < 30; i++) {
        const lump = lumps[floor(r() * lumps.length)];
        const a = r() * TAU, d = lump[2] * (0.62 + r() * 0.5);
        const lx = lump[0] + cos(a) * d, ly = lump[1] + sin(a) * d;
        leaf(lx, ly, a + (r() - 0.5) * 1.1, 5.5 + r() * 4.5, 2.4 + r() * 1.6, 0.82 + r() * 0.4);
      }
      // sunlit rims on the upper-left, shade on the lower-right
      for (let i = 0; i < 9; i++) {
        const a = PI + (r() - 0.5) * 2.4, d = 14 + r() * 14;
        c.fillStyle = rgba(mulc(mulc(base, [1.3, 1.25, 1.0]), LMLEV[lv]), 0.2 + 0.22 * shade / 2);
        c.beginPath(); c.ellipse(40 + cos(a) * d, 40 + sin(a) * d, 3.4, 1.4, a + 1.2, 0, TAU); c.fill();
      }
      const sg = c.createRadialGradient(33, 32, 3, 44, 46, 36);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, rgba(mulc([14, 20, 30], LMLEV[lv]), 0.26));
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = sg; c.fillRect(0, 0, 80, 80); c.globalCompositeOperation = 'source-over';
    });
  }
  function bladeSprite(lv) {
    return u.sprite('s6blade|' + lv, 48, 48, (c) => {
      const M = LMLEV[lv];
      c.save(); c.translate(3, 24);
      const g = c.createLinearGradient(0, -9, 0, 9);
      g.addColorStop(0, rgba(mulc(hex('#c4e87a'), M), 1)); g.addColorStop(0.5, rgba(mulc(hex('#86c452'), M), 1)); g.addColorStop(1, rgba(mulc(hex('#4c9446'), M), 1));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(8, -11, 30, -10, 43, 0); c.bezierCurveTo(30, 10, 8, 11, 0, 0); c.fill();
      c.strokeStyle = rgba(mulc([235, 255, 190], M), 0.7); c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(1, 0); c.quadraticCurveTo(22, -1.5, 41, 0); c.stroke();
      c.fillStyle = rgba(mulc([255, 255, 220], M), 0.18);
      c.beginPath(); c.moveTo(4, -1); c.bezierCurveTo(12, -8, 28, -8, 38, -1); c.quadraticCurveTo(22, -3, 4, -1); c.fill();
      c.restore();
    });
  }
  function blossomSprite(v, k, size) {
    return u.sprite(`s6blos|${v}|${k}|${size}`, size, size, (c) => {
      c.scale(size / 64, size / 64);
      const r = u.rng(900 + v * 17 + k * 5);
      // v: 0 day pink-white, 1 evening mauve, 2 night glow (warm white-gold)
      const pet = [[hex('#fff0f4'), hex('#ffb8cd')], [hex('#e4c0d6'), hex('#b884aa')], [hex('#efd09a'), hex('#d8a064')]][v];
      const cen = [hex('#ffd45a'), hex('#e8b050'), hex('#ffe9a0')][v];
      if (v === 2) {
        const hg = c.createRadialGradient(32, 32, 1, 32, 32, 31);
        hg.addColorStop(0, 'rgba(255,206,130,0.22)'); hg.addColorStop(0.5, 'rgba(255,190,110,0.06)'); hg.addColorStop(1, 'rgba(255,190,120,0)');
        c.fillStyle = hg; c.fillRect(0, 0, 64, 64);
      } else {
        const hg = c.createRadialGradient(32, 32, 1, 32, 32, 28);
        hg.addColorStop(0, rgba(pet[1], 0.5)); hg.addColorStop(1, rgba(pet[1], 0));
        c.fillStyle = hg; c.fillRect(0, 0, 64, 64);
      }
      const nf = v === 2 ? 5 : 6;
      for (let i = 0; i < nf; i++) {
        const a = r() * TAU, d = pow(r(), 0.8) * 17;
        const fx = 32 + cos(a) * d, fy = 32 + sin(a) * d, fr = 5.2 + r() * 2.8, rot = r() * TAU;
        for (let p = 0; p < 5; p++) {
          const pa = rot + (p * TAU) / 5;
          const px = fx + cos(pa) * fr * 0.55, py = fy + sin(pa) * fr * 0.55;
          const pg = c.createRadialGradient(px, py, 0.3, px, py, fr * 0.62);
          pg.addColorStop(0, rgba(pet[0], 1)); pg.addColorStop(1, rgba(pet[1], 0.95));
          c.fillStyle = pg;
          c.beginPath(); c.ellipse(px, py, fr * 0.6, fr * 0.42, pa, 0, TAU); c.fill();
        }
        c.fillStyle = rgba(cen, 1);
        c.beginPath(); c.arc(fx, fy, fr * 0.2, 0, TAU); c.fill();
      }
    });
  }
  function petalSprite(v) {
    return u.sprite(`s6petal|${v}`, 24, 24, (c) => {
      const cols = [[hex('#ffeef2'), hex('#ffb6cb')], [hex('#fff6dc'), hex('#ffd89a')]][v];
      const g = c.createLinearGradient(0, 6, 24, 18);
      g.addColorStop(0, rgba(cols[0], 1)); g.addColorStop(1, rgba(cols[1], 1));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(2, 12); c.quadraticCurveTo(10, 1, 22, 11); c.quadraticCurveTo(12, 23, 2, 12); c.fill();
    });
  }
  function autumnLeafSprite(v) {
    return u.sprite(`s6aleaf|${v}`, 28, 28, (c) => {
      const cols = ['#f2c43c', '#e8962c', '#d9611f', '#c13a26', '#a82a2c', '#e0b030'].map(hex);
      const col = cols[v];
      c.save(); c.translate(14, 14);
      const g = c.createLinearGradient(-10, 0, 10, 0);
      g.addColorStop(0, rgba(mulc(col, [1.1, 1.05, 0.9]), 1)); g.addColorStop(1, rgba(mulc(col, [0.72, 0.7, 0.75]), 1));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-11, 0); c.quadraticCurveTo(-3, -9, 11, 0); c.quadraticCurveTo(-3, 9, -11, 0); c.fill();
      c.strokeStyle = 'rgba(70,24,10,0.45)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-11, 0); c.lineTo(8, 0); c.stroke();
      c.restore();
    });
  }
  const CLOUD_TINT = [
    [[255, 255, 255], [172, 188, 222]],   // day
    [[255, 206, 178], [150, 112, 150]],   // dusk / dawn
    [[78, 88, 140], [26, 30, 66]],        // night
  ];
  function cloudSprite(kind, tint) {
    return u.sprite(`s6cloud|${kind}|${tint}`, 320, 140, (c, w, h) => {
      const r = u.rng(5000 + kind * 13);
      const lit = CLOUD_TINT[tint][0], shd = CLOUD_TINT[tint][1];
      const np = 16 + kind * 3;
      for (let i = 0; i < np; i++) {
        const t = r();
        const x = 40 + t * 240, bump = sin(t * PI);
        const rad = 20 + r() * 22 * (0.5 + bump) + bump * 14;
        const y = h * 0.64 - bump * 26 * r() - r() * 8;
        const g = c.createRadialGradient(x, y - rad * 0.25, rad * 0.1, x, y, rad);
        g.addColorStop(0, rgba(lit, 0.96)); g.addColorStop(0.5, rgba(mixc(lit, shd, 0.25), 0.62)); g.addColorStop(1, rgba(shd, 0));
        c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      c.globalCompositeOperation = 'source-atop';
      const sg = c.createLinearGradient(0, h * 0.3, 0, h * 0.85);
      sg.addColorStop(0, rgba(shd, 0)); sg.addColorStop(1, rgba(shd, 0.8));
      c.fillStyle = sg; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
    });
  }
  function buildSprites() {
    SPR = { blade: LMLEV.map((m, i) => bladeSprite(i)), leaf: [], blos: [[], [], []], bcls: BCLS, petal: [petalSprite(0), petalSprite(1)], aleaf: [0, 1, 2, 3, 4, 5].map(autumnLeafSprite), cloud: [], bead: null };
    for (let lv = 0; lv <= NLV; lv++) { const row = []; for (let ci = 0; ci < NC; ci++) row.push([leafSprite(ci, 0, lv), leafSprite(ci, 1, lv), leafSprite(ci, 2, lv)]); SPR.leaf.push(row); }
    for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) SPR.blos[v].push(BCLS.map((s) => blossomSprite(v, k, s)));
    for (let k = 0; k < 3; k++) SPR.cloud.push([cloudSprite(k, 0), cloudSprite(k, 1), cloudSprite(k, 2)]);
    SPR.bead = u.sprite('s6bead', 32, 32, (c) => {
      const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.25, 'rgba(210,235,255,0.5)'); g.addColorStop(1, 'rgba(180,220,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    });
  }

  /* ================================================================== camera + per-frame state */
  // velocity shape of the rise through the earth (S/s, unnormalised); integrated once, then scaled to the real distance
  const VK = [[128.3, 0], [129.3, 0.25], [130.6, 0.45], [132.0, 0.4], [132.8, 0.3], [133.6, 0.14], [135, 0.05], [137, 0.02], [141, 0.01], [144, 0.005], [146.3, 0]];
  const I_T0 = 128.3, I_DT = 1 / 60;
  let ITAB = null;
  function buildI() {
    const n = Math.round((147 - I_T0) / I_DT) + 2;
    ITAB = new Float32Array(n);
    let c = 0;
    for (let i = 1; i < n; i++) { const t = I_T0 + i * I_DT; c += max(0, u.keys(VK, t, 'linear')) * I_DT; ITAB[i] = c; }
    const tot = ITAB[n - 1];
    for (let i = 0; i < n; i++) ITAB[i] /= tot;
  }
  function Inorm(T) {
    if (T <= I_T0) return 0;
    const x = (T - I_T0) / I_DT, i = floor(x);
    if (i + 1 >= ITAB.length) return 1;
    return ITAB[i] + (ITAB[i + 1] - ITAB[i]) * (x - i);
  }
  const KK = [[132, 2.75], [135, 2.55], [138, 2.1], [141, 1.7], [143.5, 1.3], [145.3, 1.07], [146.3, 1.0], [160, 1.0]];
  const HYK = [[133, 0.64], [137, 0.67], [145, 0.71], [151, 0.74], [160, 0.74]];
  const T_FREE = 134.4, T_GEND = 145.4;
  const TIP_Y = 0.545;

  function buildCam(env) {
    const { W, H, S } = env;
    const YS = max(1.2 * S, 0.66 * H + 0.5 * S);          // seed depth in px
    const G0 = 0.66 * H - YS, Gf = 0.88 * H;
    const tipPre = (T) => H * (0.66 + (TIP_Y - 0.66) * ss(128.3, 130.8, T));
    const G = (T) => (T <= I_T0 ? G0 : G0 + (Gf - G0) * Inorm(T));
    let Tb = 132.8;
    for (let t = 128.3; t < 136; t += 1 / 240) { if (G(t) >= tipPre(t)) { Tb = t; break; } }
    CAM = { YS, G0, Gf, Tb, G, tipPre, gf: 0, gslope: 0, p: 1 };
    return CAM;
  }
  const kOf = (T) => max(1, T < 132 ? 2.75 : KS(KK, T));
  function gamInv(T) { // early phase: the sprout's tip stays near the hero height while the ground sweeps down
    const { G } = CAM; const { S, H } = GEO;
    if (T < CAM.Tb) return 0;
    const h = max(0, (G(T) - TIP_Y * H) / (kOf(T) * S));
    return invApex(h);
  }
  function setupGamma() {
    const g1 = gamInv(T_FREE), g0 = gamInv(T_FREE - 0.25);
    CAM.gf = g1; CAM.gslope = max(1e-4, (g1 - g0) / 0.25);
    CAM.p = clamp((CAM.gslope * (T_GEND - T_FREE)) / max(1e-4, 1 - g1), 1, 5);
  }
  function gamma(T) {
    if (T < CAM.Tb) return 0;
    if (T <= T_FREE) return gamInv(T);
    const s = clamp((T - T_FREE) / (T_GEND - T_FREE));
    return CAM.gf + (1 - CAM.gf) * (1 - pow(1 - s, CAM.p));
  }

  const NIGHT_B6 = [0.04, 0.046, 0.13], NIGHT_LAPSE = [0.3, 0.36, 0.62];
  const F = {
    T: 0, G: 0, k: 1, ks: 1, cx: 0, gam: 0, apexH: 0, apexX: 0, tipX: 0, tipY: 0, sv: 0, tod: 0, el: 0, A: 1, nd: 0, warm: 0, hy: 0,
    LM: [1, 1, 1], sky: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], horC: [0, 0, 0], sunX: 0, sunY: 0, moonX: 0, moonY: 0, sunA: 0, moonA: 0,
    swA: 0, swX: 0, lum: 1, lvF: 0, soilVis: 1, surf: 0, curv: 0, snow: 0, summer: 0, hx: 0, hy2: 0, tb: 0,
  };
  function lerpTab(tab, el, out) {
    const n = tab.length;
    if (el <= tab[0][0]) { for (let i = 0; i < 3; i++) out[i] = tab[0][1][i].slice(); return; }
    if (el >= tab[n - 1][0]) { for (let i = 0; i < 3; i++) out[i] = tab[n - 1][1][i].slice(); return; }
    let i = 0; while (el > tab[i + 1][0]) i++;
    const f = (el - tab[i][0]) / (tab[i + 1][0] - tab[i][0]), s = f * f * (3 - 2 * f);
    for (let c = 0; c < 3; c++) out[c] = mixc(tab[i][1][c], tab[i + 1][1][c], s);
  }

  function frameState(T, env) {
    const { W, H, S } = env;
    F.T = T; F.cx = W * 0.5;
    const sv = seasonVal(T); F.sv = sv; seasonW(sv);
    F.summer = SW[1]; F.snow = SW[3];
    // day clock
    const tod = todAt(T); F.tod = tod % 1;
    const phi = TAU * (tod - 0.25);
    F.elT = sin(phi);
    F.nd = ss(149.5, 152.5, T);
    // light / sky use an elevation that dips no lower than dusk-violet while the days race (true night only at the very end)
    F.el = lerp(max(F.elT, -0.12), F.elT, F.nd);
    const el = F.el;
    const floorA = lerp(0.42, 0.02, F.nd);
    F.A = lerp(floorA, 1, ss(-0.12, 0.32, el));
    F.warm = (1 - ss(0.0, 0.5, el)) * ss(-0.25, 0.02, el);
    const nm = mixc(NIGHT_LAPSE, NIGHT_B6, F.nd);
    const dm = mixc([1, 1, 1], [1.14, 0.9, 0.72], F.warm);
    F.LM = mixc(nm, dm, F.A);
    F.lum = (F.LM[0] + F.LM[1] + F.LM[2]) / 3;
    { let i = 0; while (i < NLV - 1 && F.lum < LMLUM[i + 1]) i++; F.lvF = clamp(i + (LMLUM[i] - F.lum) / max(1e-6, LMLUM[i] - LMLUM[i + 1]), 0, NLV); }
    { const wind = (1 + 0.7 * SW[2] + 0.7 * SW[3]) * (0.4 + 0.6 * ss(133, 138, T)), osc = sin(T * 0.8) + 0.55 * sin(T * 1.9 + 1.0), c = ss(CACHE_T - 1.1, CACHE_T, T);
      F.swA = 0.0085 * osc * wind * (1 - c); F.swX = 0.0016 * osc * wind * c; }
    // sky
    lerpTab(F.tod < 0.5 ? SKY_RISE : SKY_SET, el, F.sky);
    const nightness = ss(-0.05, -0.38, el) * (1 - F.nd);
    for (let c = 0; c < 3; c++) F.sky[c] = mixc(F.sky[c], SKY_LAPSE_NIGHT[c], nightness * 0.9);
    const day = ss(-0.1, 0.4, el);
    for (let i = 0; i < 4; i++) {
      const w = SW[i] * SEASON_SKY_TINT[i][1] * day;
      if (w > 0.001) for (let c = 0; c < 3; c++) F.sky[c] = mixc(F.sky[c], SEASON_SKY_TINT[i][0], w);
    }
    // camera
    F.G = CAM.G(T);
    F.k = kOf(T);
    F.hy = H * KS(HYK, T);
    F.gam = gamma(T);
    const ap = apexAt(F.gam);
    F.apexH = ap[0]; F.apexX = ap[1];
    if (F.apexH > 0.001) F.k = min(F.k, max(1, (F.G - 0.1 * H) / (F.apexH * S)));
    F.ks = F.k * S;
    F.tipX = F.cx + F.apexX * F.ks; F.tipY = F.G - F.apexH * F.ks;
    F.soilVis = 1 - ss(134.0, 136.6, T);
    F.curv = 0.1 * ss(133.0, 137.5, T);
    // sun / moon on their arcs
    const R = (F.hy - 0.13 * H) * (0.8 + 0.2 * SW[1] - 0.1 * SW[3]);
    F.sunX = W * (0.5 - 0.47 * cos(phi)); F.sunY = F.hy - sin(phi) * R;
    F.sunA = ss(-0.12, 0.05, F.elT);
    const phm = phi + PI;
    F.moonX = W * (0.5 - 0.42 * cos(phm)); F.moonY = F.hy - sin(phm) * R * 0.95;
    F.moonA = 0; // no moon: the nights of the time-lapse are short violet dips; the last night belongs to the stars
  }

  /* ================================================================== the meadow world */
  const HDEF = [
    // bf: base position between horizon (0) and ground (1); amp in S; f noise freq; mask kind; haze; parallax
    { bf: 0.0, off: 0.006, amp: 0.075, f: 1.3, seed: 3.1, mask: 0, haze: 0.78, p: 0.02, tone: 0.0 },
    { bf: 0.17, off: 0.0, amp: 0.062, f: 1.9, seed: 8.7, mask: 1, haze: 0.55, p: 0.05, tone: 0.08 },
    { bf: 0.42, off: 0.0, amp: 0.05, f: 2.6, seed: 14.2, mask: 2, haze: 0.3, p: 0.1, tone: 0.16 },
  ];
  const NHX = 72;
  function buildHills(env) {
    const { W, H, S } = env;
    HILL = { sh: [] };
    HDEF.forEach((d, li) => {
      const a = new Float32Array(NHX + 1);
      for (let i = 0; i <= NHX; i++) {
        const X = -0.06 * W + (i / NHX) * 1.12 * W, xs = X / S;
        let h = u.fbm1(xs * d.f + d.seed, 4);
        h = clamp((h - 0.28) / 0.55);
        h = h * h * (3 - 2 * h) * 0.8 + 0.2 * u.noise1(xs * d.f * 3.1 + d.seed * 3);
        const xr = X / W;
        let m = 1;
        if (d.mask === 0) m = 1 - 0.96 * ss(0.33, 0.7, xr);
        else if (d.mask === 1) m = 1 - 0.75 * ss(0.58, 0.97, xr) - 0.2 * ss(0.1, 0.0, xr);
        else m = 0.75 + 0.25 * sin(xr * 5 + d.seed);
        a[i] = h * m;
      }
      HILL.sh.push(a);
    });
    // tree lines on the ridges (tiny soft silhouettes)
    const r = u.rng(4242);
    HILL.trees = [[], [], []];
    [0, 36, 60].forEach((n, li) => { for (let i = 0; i < n; i++) HILL.trees[li].push({ x: r() * 1.1 - 0.05, s: 0.55 + r() * 0.9, h: 0.8 + r() * 0.8 }); });
  }

  function buildGrass(env) {
    const { W, H, S } = env;
    const r = u.rng(1357);
    const nb = 520;
    GR = { n: nb, x: new Float32Array(nb), d: new Float32Array(nb), h: new Float32Array(nb), w: new Float32Array(nb), ph: new Float32Array(nb), tone: new Uint8Array(nb), front: new Uint8Array(nb), st: new Float32Array(nb), lean: new Float32Array(nb) };
    for (let i = 0; i < nb; i++) {
      const front = r() < 0.5 ? 1 : 0;
      GR.front[i] = front;
      GR.x[i] = -0.04 * W + r() * 1.08 * W;
      GR.d[i] = front ? 0.04 + pow(r(), 1.5) * 0.13 : r() * 0.04;
      const near = GR.d[i];
      GR.h[i] = (0.012 + pow(r(), 2.2) * 0.042) * (front ? 1 + near * 5 : 0.8);
      GR.w[i] = (0.0018 + r() * 0.0018) * (front ? 1 + near * 4 : 0.85);
      GR.ph[i] = r() * TAU; GR.tone[i] = floor(r() * 4); GR.st[i] = 132.9 + r() * 2.4; GR.lean[i] = (r() - 0.5) * 0.9;
    }
    // big out-of-focus blades framing the bottom corners
    GR.big = [];
    for (let i = 0; i < 16; i++) { const side = i % 2 ? 1 : -1; GR.big.push({ x: 0.5 + side * (0.36 + r() * 0.2), h: 0.1 + r() * 0.16, w: 0.011 + r() * 0.012, ph: r() * TAU, lean: -side * (0.1 + r() * 0.3), st: 134.6 + r() * 2 }); }
    // meadow flowers
    GR.fl = [];
    for (let i = 0; i < 90; i++) GR.fl.push({ x: -0.03 * W + r() * 1.06 * W, d: 0.01 + r() * 0.15, c: floor(r() * 3), s: 0.5 + r(), st: 134.5 + r() * 3 });
  }

  const nearY = (x, G, S, curv, cx) => { const d = (x - cx) / S; return G + curv * S * d * d + 0.012 * S * sin(d * 3.1 + 0.6) * (curv * 10); };

  function seasonMix(tab, out) {
    out[0] = out[1] = out[2] = 0;
    for (let i = 0; i < 4; i++) { const w = SW[i]; out[0] += tab[i][0] * w; out[1] += tab[i][1] * w; out[2] += tab[i][2] * w; }
    return out;
  }
  const _gc = [0, 0, 0], _hc = [0, 0, 0];

  // sky body, big soft glows and clouds: painted into the half-resolution background layer
  function drawSkyBG(g, env) {
    const { W, H, S } = env;
    const hy = F.hy;
    const [top, mid, hor] = F.sky;
    const gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, u.css(top)); gr.addColorStop(0.42, u.css(mixc(top, mid, 0.5))); gr.addColorStop(0.8, u.css(mid)); gr.addColorStop(1, u.css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const hg = F.warm * 0.4 * ss(-0.3, 0.0, F.el);
    if (hg > 0.01) {
      u.glow(g, F.sunX, hy, S * 0.72, 24, 80, 58, hg * 0.46);
      u.glow(g, F.sunX, F.sunY, S * 0.5, 38, 90, 66, hg * 0.4 * F.sunA);
    }
    if (F.sunA > 0.01 && F.sunY < hy + S * 0.06) {
      const low = 1 - ss(0, 0.6, F.el);
      u.glow(g, F.sunX, F.sunY, S * (0.42 + 0.16 * low), 42, 85, 72, 0.2 * F.sunA * (0.6 + 0.4 * F.A));
    }
    if (F.moonA > 0.01) u.glow(g, F.moonX, F.moonY, S * 0.27, 220, 40, 78, 0.28 * F.moonA);
    // slanting rays of the sun
    {
      const ra = F.sunA * ss(0.02, 0.2, F.el) * (1 - ss(0.55, 0.95, F.el)) * (1 - 0.8 * F.snow) * ss(134.5, 137, F.T) * (1 - F.nd);
      if (ra > 0.02) {
        g.save(); g.globalCompositeOperation = 'lighter';
        const L0 = Math.hypot(W, H) * 1.1;
        for (let i = 0; i < 9; i++) {
          const ang = PI * (0.5 + (i - 4) * 0.062) + 0.25 * (F.sunX / W - 0.5) + 0.04 * sin(F.T * 0.5 + i * 1.7);
          const hw = 0.012 + 0.02 * ((i * 37) % 7) / 7;
          const a = ra * (0.5 + 0.5 * sin(F.T * 0.8 + i * 2.3)) * 0.045;
          if (a < 0.003) continue;
          const dx = cos(ang), dy = sin(ang), nx = -dy, ny = dx;
          const rg = g.createLinearGradient(F.sunX, F.sunY, F.sunX + dx * L0, F.sunY + dy * L0);
          rg.addColorStop(0, `rgba(255,236,190,${a})`); rg.addColorStop(1, 'rgba(255,236,190,0)');
          g.fillStyle = rg;
          g.beginPath(); g.moveTo(F.sunX + nx * 4, F.sunY + ny * 4); g.lineTo(F.sunX + dx * L0 + nx * L0 * hw, F.sunY + dy * L0 + ny * L0 * hw);
          g.lineTo(F.sunX + dx * L0 - nx * L0 * hw, F.sunY + dy * L0 - ny * L0 * hw); g.lineTo(F.sunX - nx * 4, F.sunY - ny * 4); g.closePath(); g.fill();
        }
        g.restore();
      }
    }
    // long-exposure light trails of the sun and the moon while the days race
    {
      const T = F.T, k = ss(135.2, 137, T) * (1 - ss(148.5, 150.5, T));
      if (k > 0.02) {
        const sunS = u.glowSprite(44, 85, 76), moonS = u.glowSprite(215, 40, 85);
        g.save(); g.globalCompositeOperation = 'lighter';
        const rk = 0.8 + 0.2 * SW[1] - 0.1 * SW[3];
        for (let i = 1; i <= 24; i++) {
          const tt = T - i * 0.04, ph = TAU * (todAt(tt) - 0.25), eg = sin(ph), hyt = H * KS(HYK, tt), Rr = (hyt - 0.13 * H) * rk;
          const fade = pow(1 - i / 25, 1.5) * k;
          const sA = ss(-0.1, 0.02, eg) * fade, sy = hyt - eg * Rr;
          if (sA > 0.01 && sy < hyt) { const sz = S * 0.045; g.globalAlpha = 0.17 * sA; g.drawImage(sunS, W * (0.5 - 0.47 * cos(ph)) - sz, sy - sz, sz * 2, sz * 2); }
          const em = sin(ph + PI), mA = ss(0.0, -0.14, eg) * ss(0.02, 0.2, em) * fade * 0.8, my = hyt - em * Rr * 0.95;
          if (mA > 0.01 && my < hyt) { const sz = S * 0.035; g.globalAlpha = 0.14 * mA; g.drawImage(moonS, W * (0.5 - 0.42 * cos(ph + PI)) - sz, my - sz, sz * 2, sz * 2); }
        }
        g.restore();
      }
    }
    // clouds (three tints: day / dusk-dawn / night)
    const ca = (0.3 + 0.62 * SW[1] + 0.2 * SW[3] + 0.1 * SW[2]) * (1 - 0.8 * F.nd);
    if (ca > 0.02) {
      const Dd = todAt(F.T) - 1.2;
      const wDay = ss(0.28, 0.8, F.A) * (1 - 0.7 * F.warm), wDusk = F.warm * ss(0.3, 0.8, F.A) * 1.0 + F.warm * (1 - ss(0.3, 0.8, F.A)) * 0.6, wNight = 1 - ss(0.2, 0.7, F.A);
      const ws = [wDay, wDusk, wNight];
      const cwMin = Math.min(wDay, wDusk, wNight) < 0.9 * Math.max(wDay, wDusk, wNight) ? ws.slice().sort((p, q) => p - q)[1] - 1e-6 : 0;
      for (const c of PART.clouds) {
        const wdt = W * 0.3 * c.s * (W / H > 1.2 ? 1 : 1.5);
        const hgt = wdt * 140 / 320;
        const x = u.wrap(c.x * (W + wdt * 2) + Dd * c.v * W * 0.07 + F.T * 0.002 * W, -wdt, W + wdt);
        const y = c.y * hy * 0.62 + 0.03 * H;
        const sp = SPR.cloud[c.k];
        if (x + wdt / 2 < 0 || x - wdt / 2 > W) continue;
        for (let t = 0; t < 3; t++) {
          if (ws[t] < cwMin) continue;   // only the two strongest tints are painted (the third one is below the noise)
          const a = ca * c.a * ws[t] * 0.8;
          if (a < 0.02) continue;
          g.globalAlpha = min(1, a); g.drawImage(sp[t], x - wdt / 2, y - hgt / 2, wdt, hgt);
        }
      }
      g.globalAlpha = 1;
    }
  }
  // crisp sky details on the main canvas: stars, sun, moon
  function drawSkyFront(g, env) {
    const { W, H, S } = env;
    const hy = F.hy;
    const sa = ss(-0.1, -0.4, F.el) * (0.45 + 0.55 * F.nd);
    g.save(); g.globalCompositeOperation = 'lighter';
    if (sa > 0.01) {
      const sp = u.glowSprite(215, 40, 90);
      const thr = lerp(0.62, 0.74, F.nd), sd = todAt(F.T) * 0.03;
      const nst = min(PART.stars.length, Math.round(130 * clamp(env.aspect / 1.78, 1, 1.85)));
      for (let si = 0; si < nst; si++) {
        const s = PART.stars[si];
        if (s.b < thr) continue;
        const tw = 0.65 + 0.35 * sin(F.T * (0.8 + s.b * 1.5) + s.ph);
        const a = sa * tw * (0.35 + 0.65 * s.b) * ss(0.0, 0.28, 1 - s.y);
        if (a < 0.02) continue;
        const sz = S * (0.0045 + 0.006 * s.b);
        g.globalAlpha = a;
        g.drawImage(sp, u.wrap(s.x + sd * (0.5 + s.b), 0, 1) * W - sz, s.y * hy * 0.92 - sz, sz * 2, sz * 2);
      }
      g.globalAlpha = 1;
    }
    if (F.sunA > 0.01 && F.sunY < hy + S * 0.06) {
      const low = 1 - ss(0, 0.6, F.el);
      const sr = S * (0.034 + 0.016 * low);
      u.glow(g, F.sunX, F.sunY, sr * 3.2, 44, 90, 78, 0.5 * F.sunA, 'core');
      g.fillStyle = `rgba(255,${244 - low * 40 | 0},${220 - low * 90 | 0},${F.sunA})`;
      g.beginPath(); g.arc(F.sunX, F.sunY, sr, 0, TAU); g.fill();
    }
    // a flock of birds crosses the summer sky
    {
      const T = F.T, ba = ss(141.0, 141.6, T) * (1 - ss(145.6, 146.4, T)) * ss(0.0, 0.3, F.A - 0.35);
      if (ba > 0.02) {
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = rgba(mulc([40, 48, 70], F.LM), 0.8 * ba); g.lineWidth = max(1, S * 0.0022); g.lineCap = 'round';
        g.beginPath();
        for (const b of PART.birds) {
          const f = (T - b.t0) * b.sp; if (f < -0.1 || f > 1.1) continue;
          const x = (f * 1.25 - 0.12) * W + b.off * W, y = (b.y + b.dy * f + 0.01 * sin(T * 1.3 + b.ph)) * F.hy;
          const wspan = S * 0.014 * b.s, fl = sin(T * 7 + b.ph) * wspan * 0.55;
          g.moveTo(x - wspan, y + fl * 0.3); g.quadraticCurveTo(x - wspan * 0.45, y - wspan * 0.3 - fl, x, y);
          g.quadraticCurveTo(x + wspan * 0.45, y - wspan * 0.3 - fl, x + wspan, y + fl * 0.3);
        }
        g.stroke();
        g.globalCompositeOperation = 'lighter';
      }
    }
    if (F.moonA > 0.01) {
      const mr = S * 0.03, mx = F.moonX, my = F.moonY;
      u.glow(g, mx, my, mr * 4.2, 215, 35, 80, 0.2 * F.moonA);
      const mg = g.createRadialGradient(mx - mr * 0.35, my - mr * 0.35, mr * 0.1, mx, my, mr);
      mg.addColorStop(0, `rgba(250,250,255,${0.95 * F.moonA})`); mg.addColorStop(0.7, `rgba(222,226,246,${0.92 * F.moonA})`); mg.addColorStop(1, `rgba(176,186,226,${0.9 * F.moonA})`);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = `rgba(140,152,196,${0.2 * F.moonA})`;
      g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.3, 0, TAU); g.arc(mx + mr * 0.38, my + mr * 0.3, mr * 0.2, 0, TAU); g.arc(mx + mr * 0.1, my - mr * 0.5, mr * 0.14, 0, TAU); g.fill();
      g.globalCompositeOperation = 'lighter';
    }
    g.restore();
  }

  function hillColor(li, out) {
    seasonMix(HILLC, _hc);
    const lit = mulc(_hc, F.LM);
    const hz = HDEF[li] ? HDEF[li].haze : 0;
    const sh = HDEF[li] ? HDEF[li].tone : 0.25;
    const c = mulc(lit, [1 - sh * 0.3, 1 - sh * 0.2, 1 - sh * 0.05 + (li === 0 ? 0.1 : 0)]);
    const tgt = mixc(mixc(F.sky[2], F.sky[1], 0.5), [150, 170, 205], 0.25 * (1 - F.nd));
    return mixc(c, tgt, hz * 0.8 * (1 - 0.7 * F.nd));
  }

  function drawHills(g, env) {
    const { W, H, S } = env;
    const hy = F.hy, cx = F.cx, G = max(F.G, hy + 0.1 * H);
    // sea strip on the horizon (far right/left)
    const sea0 = hy - 0.004 * H, sea1 = hy + 0.032 * H;
    const seaBase = mulc([52, 120, 160], F.LM);
    const seaC = mixc(seaBase, F.sky[2], 0.5);
    const sg = g.createLinearGradient(0, sea0, 0, sea1);
    sg.addColorStop(0, u.css(mixc(seaC, F.sky[2], 0.55))); sg.addColorStop(0.35, u.css(seaC)); sg.addColorStop(1, u.css(mulc(seaC, [0.72, 0.8, 0.9])));
    g.fillStyle = sg; g.fillRect(0, sea0, W, sea1 - sea0);
    // shimmer on the sea
    { g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(255,248,230,${0.1 + 0.2 * F.A})`;
    g.fillRect(0, hy - 0.0015 * H, W, Math.max(1, 0.0025 * H));
    const gs = u.glowSprite(45, 60, 85);
    for (const s of PART.glints) {
      const tw = pow(0.5 + 0.5 * sin(F.T * s.f + s.ph), 5);
      const a = tw * (0.15 + 0.5 * F.A) * (0.4 + 0.6 * (1 - abs(s.x - F.sunX / W)) * ss(-0.1, 0.2, F.el));
      if (a < 0.02) continue;
      g.globalAlpha = a; const sz = S * 0.008 * s.s;
      g.drawImage(gs, s.x * W - sz * 2, hy + s.y * 0.026 * H - sz * 0.5, sz * 4, sz);
    }
    g.restore(); }
    // distant ridges
    for (let li = 0; li < HDEF.length; li++) {
      const d = HDEF[li], sh = HILL.sh[li];
      const zl = 1 + (F.k - 1) * d.p;
      const base = hy + d.bf * (G - hy) + d.off * H;
      const amp = d.amp * S * zl * (li === 2 ? 1 : 1);
      const col = hillColor(li);
      const gr = g.createLinearGradient(0, base - amp, 0, base + 0.14 * S);
      gr.addColorStop(0, u.css(mixc(col, F.sky[2], 0.18)));
      gr.addColorStop(0.5, u.css(col)); gr.addColorStop(1, u.css(mulc(col, [0.8, 0.84, 0.88])));
      g.fillStyle = gr;
      const nextBase = li < HDEF.length - 1 ? hy + HDEF[li + 1].bf * (G - hy) + HDEF[li + 1].off * H : nearY(0, F.G, S, F.curv, cx) + 4;
      const botY = min(H + 2, max(nextBase, base) + 0.012 * S + (li === HDEF.length - 1 ? 0.02 * S : 0));
      g.beginPath(); g.moveTo(-0.07 * W, botY);
      let px = 0, py = 0;
      for (let i = 0; i <= NHX; i++) {
        const X = -0.06 * W + (i / NHX) * 1.12 * W;
        const x = cx + (X - cx) * zl, y = base - amp * sh[i];
        if (i === 0) g.lineTo(x, y); else g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        px = x; py = y;
      }
      g.lineTo(px, py); g.lineTo(1.07 * W, botY); g.closePath(); g.fill();
      // the sun-side rim
      if (F.sunA > 0.05 && F.A > 0.3) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.07 * F.sunA * (li === 2 ? 1 : 0.6);
        g.strokeStyle = 'rgb(255,214,150)'; g.lineWidth = max(1, S * 0.0022);
        g.beginPath(); px = 0;
        for (let i = 0; i <= NHX; i++) { const X = -0.06 * W + (i / NHX) * 1.12 * W; const x = cx + (X - cx) * zl, y = base - amp * sh[i] - 1; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke(); g.restore();
      }
      // tree line along the ridge
      if (HILL.trees[li].length) {
        g.fillStyle = u.css(mixc(mulc(col, [0.82, 0.9, 0.88]), F.sky[2], 0.06));
        g.beginPath();
        for (const b of HILL.trees[li]) {
          const X = b.x * W, xi = clamp(((X + 0.06 * W) / (1.12 * W)) * NHX, 0, NHX - 0.001), i0 = floor(xi), f = xi - i0;
          const hh = lerp(sh[i0], sh[i0 + 1], f);
          if (hh < 0.12) continue;
          const x = cx + (X - cx) * zl, y = base - amp * hh + S * 0.003;
          const rx = S * (li === 1 ? 0.0036 : 0.005) * b.s * zl, ry = rx * 1.9 * b.h;
          g.moveTo(x + rx, y - ry * 0.8); g.ellipse(x, y - ry * 0.8, rx, ry, 0, 0, TAU);
        }
        g.fill();
      }
    }
    // morning / evening mist over the meadow
    const mist = (0.3 * (1 - ss(135.2, 138.2, F.T)) + 0.2 * F.warm + 0.05 * F.nd) * ss(132.5, 134, F.T);
    if (mist > 0.01) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const mc = mixc(F.sky[2], [255, 255, 255], 0.4), ms = u.glowSprite(0, 0, 70);
      for (let i = 0; i < 2; i++) {
        const y = lerp(hy, G, 0.3 + i * 0.3), wdt = W * (1.0 + i * 0.1), hgt = S * (0.09 + i * 0.03);
        const x = F.cx + sin(F.T * 0.05 + i * 2) * W * 0.06 + (i - 1.5) * W * 0.12;
        g.globalAlpha = mist * (0.55 - i * 0.12);
        g.drawImage(ms, x - wdt / 2, y - hgt / 2, wdt, hgt);
      }
      g.restore();
    }
  }

  // the near hill (the tree's ground) + back grass; returns after painting
  function drawGround(g, env) {
    const { W, H, S } = env;
    const G = F.G, cx = F.cx, cv = F.curv;
    seasonMix(GRASS, _gc);
    const lit = mulc(_gc, F.LM);
    const top = mixc(lit, F.sky[2], 0.06), bot = mulc(lit, [0.55, 0.62, 0.7]);
    const gr = g.createLinearGradient(0, G - 0.03 * S, 0, min(H, G + 0.2 * S));
    gr.addColorStop(0, u.css(mulc(top, [1.06, 1.06, 1.0]))); gr.addColorStop(0.35, u.css(top)); gr.addColorStop(1, u.css(bot));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-5, H + 2);
    const N = 40;
    for (let i = 0; i <= N; i++) { const x = -5 + (i / N) * (W + 10); g.lineTo(x, nearY(x, G, S, cv, cx)); }
    g.lineTo(W + 5, H + 2); g.closePath(); g.fill();
    // soft light on the crest + ground shadow of the tree
    g.save(); g.globalCompositeOperation = 'lighter';
    const sl = F.sunA * ss(0.0, 0.3, F.el) * 0.09;
    if (sl > 0.005) u.glow(g, F.sunX * 0.3 + cx * 0.7, G + 0.01 * S, S * 0.36, 48, 80, 65, sl * 1.4);
    g.restore();
  }

  function drawGrass(g, env, front) {
    const { W, H, S } = env;
    const G = F.G, cx = F.cx, T = F.T;
    seasonMix(GRASS, _gc);
    const lit = mulc(_gc, F.LM);
    const winter = F.snow;
    const hs = 1 - 0.7 * winter;
    const gust = 0.5 + 0.5 * sin(T * 0.35);
    const gate = front ? 1 - ss(0.35, 0.85, F.soilVis) : ss(132.6, 133.8, T);   // back blades poke through the soil edge as the sprout breaks the surface
    for (let tone = 0; tone < 4; tone++) {
      const k = [0.62, 0.84, 1.04, 1.22][tone];
      const c = mulc(lit, [k, k * 1.02, k * 0.95]);
      g.fillStyle = u.css(front ? mulc(c, [0.92, 0.95, 1]) : mulc(c, [0.82, 0.88, 0.95]));
      g.beginPath();
      for (let i = 0; i < GR.n; i++) {
        if (GR.front[i] !== front || GR.tone[i] !== tone) continue;
        const grow = ss(GR.st[i], GR.st[i] + 1.8, T) * gate;
        if (grow < 0.02) continue;
        const bx = GR.x[i];
        const by = nearY(bx, G, S, F.curv, cx) + GR.d[i] * S * (front ? 0.95 : 0.4) + S * 0.004;
        const hh = GR.h[i] * S * grow * hs, wd = GR.w[i] * S;
        const sw = sin(T * (1.1 + 0.4 * GR.ph[i]) + GR.ph[i] + bx * 0.01) * hh * (0.16 + 0.2 * gust) + GR.lean[i] * hh * 0.5;
        g.moveTo(bx - wd, by);
        g.lineTo(bx - wd * 0.35 + sw * 0.35, by - hh * 0.55);
        g.lineTo(bx + sw, by - hh);
        g.lineTo(bx + wd * 0.35 + sw * 0.35, by - hh * 0.55);
        g.lineTo(bx + wd, by);
      }
      g.fill();
    }
    if (front) {
      // big soft blades in the corners (depth framing)
      const k = [0.34, 0.4, 0.36], bc = mulc(lit, k);
      g.fillStyle = u.css(bc); g.globalAlpha = 0.92 * (1 - ss(151.0, 152.6, T));
      g.beginPath();
      for (const b of GR.big) {
        const grow = ss(b.st, b.st + 1.8, T) * gate; if (grow < 0.02) continue;
        const bx = b.x * W, by = H + 0.02 * S, hh = b.h * S * grow * (1 - 0.55 * winter), wd = b.w * S;
        const sw = sin(T * 0.8 + b.ph) * hh * (0.12 + 0.14 * gust) + b.lean * hh;
        g.moveTo(bx - wd, by);
        g.quadraticCurveTo(bx - wd * 0.5 + sw * 0.3, by - hh * 0.55, bx + sw, by - hh);
        g.quadraticCurveTo(bx + wd * 0.5 + sw * 0.35, by - hh * 0.5, bx + wd, by);
      }
      g.fill(); g.globalAlpha = 1;
      // tiny flowers in spring
      const fa = (SW[0] * ss(135, 137.5, T) + SW[1] * 0.4) * (1 - F.snow);
      if (fa > 0.03) {
        const cols = [['255,244,250', '255,200,225'], ['255,236,150', '255,214,110'], ['236,226,255', '210,196,255']];
        for (let ci = 0; ci < 3; ci++) {
          g.fillStyle = `rgba(${mulc(rgb('#ffffff'), [1, 1, 1]).join(',')},0)`;
          const col = cols[ci][0].split(',').map(Number);
          g.fillStyle = rgba(mulc(col, F.LM), 0.9 * fa);
          g.beginPath();
          for (const f of GR.fl) {
            if (f.c !== ci) continue;
            const grow = ss(f.st, f.st + 1.5, T); if (grow < 0.05) continue;
            const x = f.x, y = nearY(x, G, S, F.curv, cx) + f.d * S * 0.95 - GR.h[0] * S;
            const rr = S * 0.0036 * f.s * grow;
            g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU);
          }
          g.fill();
        }
      }
    }
  }

  /* ================================================================== drawing the tree */
  const NWB = 30, WBQ = 1.5;       // width buckets
  let BKT = null;                  // bucket scratch
  let SK = null;                   // cached full-grown skeleton (three light variants + snow)
  function ensureBuckets(np) {
    BKT = { tmp: new Float32Array(np * 4), out: new Float32Array(np * 4), id: new Int16Array(np), cnt: new Int32Array(NWB * 3 + 1), off: new Int32Array(NWB * 3 + 2) };
  }
  // wind: the whole tree leans (rigid-ish), leaves flutter on top of that
  const swayX = (y) => y * F.swA + F.swX;

  const BARK_THIN = [124, 90, 68], BARK_THICK = [56, 41, 36], BARK_MID = [118, 150, 84], BARK_YOUNG = [140, 192, 104];
  function barkColor(cls, w, juv) {
    let base = mixc(BARK_THIN, BARK_THICK, clamp(w / 11));
    if (juv > 0.01) base = mixc(base, [128, 168, 92], juv * (1 - clamp(w / 20)) * 0.85);
    if (cls === 0) return mixc(BARK_YOUNG, base, clamp(w / 14) * 0.3);
    if (cls === 1) return mixc(BARK_MID, base, 0.55 + 0.4 * clamp(w / 8));
    return base;
  }

  /* c: { gam, ks, bx, by, swA, LM, snowOnly, snow, sunSide, fh } -> strokes the skeleton onto context t */
  function strokeBranches(t, c) {
    const P = TR.P, np = P.n, B = BKT;
    const gam = c.gam, ks = c.ks, bx = c.bx, by = c.by, swA = c.swA, swX = c.swX || 0, fh = c.fh;
    const tf = 0.03 + 0.97 * pow(fh, 1.5), juv = 1 - ss(0.12, 0.45, fh);
    B.cnt.fill(0);
    const AGE_FULL = 0.55;
    for (let i = 0; i < np; i++) {
      const s0 = P.s0[i];
      if (gam <= s0) { B.id[i] = -1; continue; }
      const q = min(1, (gam - s0) / (P.s1[i] - s0));
      const age = gam - s0;
      const th = 0.3 + 0.7 * ss(0, AGE_FULL, age);
      let w = P.w[i] * th * tf * ks;
      if (w < 0.7) w = 0.7;
      let y0 = P.y0[i], y1 = P.y0[i] + (P.y1[i] - P.y0[i]) * q;
      let x0 = P.x0[i], x1 = P.x0[i] + (P.x1[i] - P.x0[i]) * q;
      if (P.d[i] === 7) { const fs = 0.22 + 0.78 * fh; x0 *= fs; x1 *= fs; y0 *= fs; y1 *= fs; }
      const k4 = i * 4;
      B.tmp[k4] = bx + (x0 + y0 * swA + swX) * ks; B.tmp[k4 + 1] = by - y0 * ks;
      B.tmp[k4 + 2] = bx + (x1 + y1 * swA + swX) * ks; B.tmp[k4 + 3] = by - y1 * ks;
      const cls = P.d[i] === 7 ? 2 : age < 0.035 ? 0 : age < 0.1 ? 1 : 2;
      const wb = min(NWB - 1, floor(w * WBQ));
      const id = cls * NWB + wb;
      B.id[i] = id; B.cnt[id]++;
    }
    let acc = 0;
    for (let b = 0; b < NWB * 3; b++) { B.off[b] = acc; acc += B.cnt[b]; }
    B.off[NWB * 3] = acc;
    const pos = B.cnt;
    for (let b = 0; b < NWB * 3; b++) pos[b] = B.off[b];
    for (let i = 0; i < np; i++) {
      const id = B.id[i]; if (id < 0) continue;
      const o = pos[id]++ * 4, k4 = i * 4;
      B.out[o] = B.tmp[k4]; B.out[o + 1] = B.tmp[k4 + 1]; B.out[o + 2] = B.tmp[k4 + 2]; B.out[o + 3] = B.tmp[k4 + 3];
    }
    t.lineJoin = 'round';
    const sunSide = c.sunSide, LM = c.LM;
    for (let id = 0; id < NWB * 3; id++) {
      const a = B.off[id], b = B.off[id + 1];
      if (b <= a) continue;
      const cls = floor(id / NWB), wb = id % NWB;
      const w = (wb + 0.5) / WBQ;
      const path = new Path2D();
      for (let j = a; j < b; j++) { const o = j * 4; path.moveTo(B.out[o], B.out[o + 1]); path.lineTo(B.out[o + 2], B.out[o + 3]); }
      t.lineCap = w > 3 ? 'round' : 'butt';
      if (!c.snowOnly) {
        t.strokeStyle = u.css(mulc(barkColor(cls, w, juv), LM));
        t.lineWidth = w;
        t.stroke(path);
        if (w > 2.4 && cls > 0) {
          t.save();
          t.translate(sunSide * w * 0.2, 0);
          t.lineWidth = w * 0.42; t.strokeStyle = rgba(mulc([170, 132, 98], LM), 0.5);
          t.stroke(path);
          t.translate(-sunSide * w * 0.46, 0);
          t.lineWidth = w * 0.3; t.strokeStyle = rgba(mulc([24, 16, 18], LM), 0.32);
          t.stroke(path);
          t.restore();
        }
      }
      if (c.rim && w > 1.4) {
        // faint violet rim light on the side that faces the sky glow
        t.save();
        t.translate(-sunSide * w * 0.24, -w * 0.1);
        t.lineWidth = max(0.8, w * 0.2); t.strokeStyle = c.rim;
        t.stroke(path);
        t.restore();
      }
      if (c.snow > 0.04 && cls > 0) {
        t.save();
        t.translate(0, -w * 0.32 - 0.4);
        t.lineWidth = max(0.8, w * 0.5); t.strokeStyle = rgba([240, 246, 255], 0.92 * c.snow);
        t.stroke(path);
        t.restore();
      }
    }
  }

  /* the full-grown skeleton is cached in three light variants (day / lapse-night / deep night) + a snow overlay */
  const SK_LM = [[1, 1, 1], NIGHT_LAPSE, NIGHT_B6];
  const lumOf = (m) => (m[0] + m[1] + m[2]) / 3;
  function buildSkeletonCache(env) {
    const { W, H, S } = env;
    const hw = (TR.crown.rx + 0.17) * S, top = (TR.Htot + 0.1) * S, bot = 0.06 * S;
    const cw = ceil(hw * 2), ch = ceil(top + bot);
    SK = { cw, ch, bx: hw, by: top, v: [], snow: null };
    for (let v = 0; v < 3; v++) {
      const c = u.canvas(cw, ch), t = c.getContext('2d');
      strokeBranches(t, { gam: 1, ks: S, bx: hw, by: top, swA: 0, LM: SK_LM[v], snowOnly: false, snow: 0, sunSide: 1, fh: 1, rim: v === 2 ? 'rgba(150,126,228,0.2)' : v === 1 ? 'rgba(150,130,220,0.08)' : null });
      SK.v.push(c);
    }
    const c = u.canvas(cw, ch), t = c.getContext('2d');
    strokeBranches(t, { gam: 1, ks: S, bx: hw, by: top, swA: 0, LM: [1, 1, 1], snowOnly: true, snow: 1, sunSide: 1, fh: 1 });
    SK.snow = c;
  }

  /* ================================================================== the night tree (shared with s7_stars)
   * The same tree must be on screen on both sides of the B6 window: s6 draws it for T >= ~151 and s7 for T <= ~160, through these
   * three calls (crown light behind the limbs, the cached skeleton, live sparkles in front). Everything is baked once per size. */
  let NCR = null;       // baked crown light
  let TREE_KEY = '';
  function ensureTree(env) {
    const key = env.W + 'x' + env.H;
    if (TR && TREE_KEY === key) return;
    if (!SPR) buildSprites();
    TR = buildTree(env);
    ensureBuckets(TR.np);
    buildSkeletonCache(env);
    buildNightCrown(env);
    TREE_KEY = key;
  }
  function buildNightCrown(env) {
    const { S } = env, cr = TR.crown;
    const rx = cr.rx * S, ry = cr.ry * S, mx = 0.17 * S;
    const w = ceil(2 * (rx + mx)), h = ceil(2 * (ry + mx)), ox = w / 2, oy = h / 2;
    const c = u.canvas(w, h), lc = c.getContext('2d');
    const rnd = u.rng(5150);
    const edge = (a) => 1 + 0.17 * (u.noise1(a * 1.7 + 40) - 0.5) * 2 + 0.07 * sin(a * 5 + 1);   // the very outline the twigs were grown inside
    const lobes = [];
    for (let i = 0; i < 34; i++) { const a = (i / 34) * TAU + (rnd() - 0.5) * 0.18, e = edge(a), rr = 0.8 + 0.1 * rnd(); lobes.push([cos(a) * rx * rr * e, -sin(a) * ry * rr * e, (0.05 + 0.028 * rnd()) * S]); }
    for (let i = 0; i < 70; i++) { const a = rnd() * TAU, rr = sqrt(rnd()) * 0.72; lobes.push([cos(a) * rx * rr, -sin(a) * ry * rr, (0.05 + 0.04 * rnd()) * S]); }
    const dens = (x, y) => { let d = 0; for (let i = 0; i < lobes.length; i++) { const l = lobes[i], dx = x - l[0], dy = y - l[1], q = (dx * dx + dy * dy) / (l[2] * l[2]); if (q < 2.2) d += exp(-q * 1.1); } return d; };
    lc.save(); lc.translate(ox, oy);
    const order = lobes.map((l, i) => i).sort((i, j) => Math.hypot(lobes[j][0] / rx, lobes[j][1] / ry) - Math.hypot(lobes[i][0] / rx, lobes[i][1] / ry));
    for (const li of order) {
      const l = lobes[li], dn = Math.hypot(l[0] / rx, l[1] / ry), r = l[2] * 1.25;
      const fx = l[0] * 0.65, fy = l[1] * 0.65;
      const gr = lc.createRadialGradient(fx + (l[0] - fx) * 0.15, fy + (l[1] - fy) * 0.15, r * 0.05, l[0], l[1], r);
      const warm = clamp(1 - dn * 1.1, 0, 1), rim = clamp((dn - 0.55) * 2.2, 0, 1);
      const c0 = [255, lerp(196, 222, warm), lerp(140 + 30 * rim, 134, warm)], c1 = [lerp(244, 252, warm), lerp(138, 168, warm) - 8 * rim, lerp(118 + 30 * rim, 104, warm)];
      const al = 0.5 + 0.08 * warm;
      gr.addColorStop(0, `rgba(${c0[0] | 0},${c0[1] | 0},${c0[2] | 0},${al})`);
      gr.addColorStop(0.62, `rgba(${c1[0] | 0},${c1[1] | 0},${c1[2] | 0},${al * 0.8})`);
      gr.addColorStop(0.9, `rgba(${(c1[0] * 0.9) | 0},${(c1[1] * 0.85) | 0},${(c1[2] * 0.95) | 0},${al * 0.45})`);
      gr.addColorStop(1, `rgba(${c1[0] | 0},${c1[1] | 0},${c1[2] | 0},0)`);
      lc.fillStyle = gr; lc.beginPath(); lc.arc(l[0], l[1], r, 0, TAU); lc.fill();
    }
    for (let i = 0; i < 70; i++) {   // shade pockets between the lobes
      const a = rnd() * TAU, rr = sqrt(rnd()) * 0.92, x = cos(a) * rx * rr, y = -sin(a) * ry * rr;
      if (dens(x, y) < 0.9) continue;
      const r = (0.012 + 0.03 * rnd()) * S, gr = lc.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(130,60,80,0.34)'); gr.addColorStop(1, 'rgba(130,60,80,0)');
      lc.fillStyle = gr; lc.beginPath(); lc.arc(x, y, r, 0, TAU); lc.fill();
    }
    lc.globalCompositeOperation = 'lighter';
    // the real blossoms of the tree, on its real twigs
    const B = TR.BL;
    for (let i = 0; i < B.n; i++) {
      const sz = B.sz[i] * S * 1.05, ci = clamp(Math.round(Math.log(sz / 28) / 0.1157), 0, 13), cs = BCLS[ci];
      const x = B.x[i] * S, y = -(B.y[i] - cr.cy) * S;
      lc.globalAlpha = 0.34;
      lc.drawImage(SPR.blos[0][floor(B.r2[i] * 3) % 3][ci], x - cs * 0.5, y - cs * 0.5, cs, cs);
    }
    lc.globalAlpha = 1;
    let placed = 0, guard = 0;
    const NB = Math.round(2600 * (S / 720) * (S / 720) * 0.6 * (rx * ry) / (0.33 * 0.265 * S * S) + 1400);
    while (placed < NB && guard++ < NB * 14) {   // fine blossom dust
      const x = (rnd() * 2 - 1) * rx * 1.12, y = (rnd() * 2 - 1) * ry * 1.12, d = dens(x, y);
      if (rnd() > clamp(d * 0.6 - 0.05, 0, 1)) continue;
      const dn = Math.hypot(x / rx, y / ry);
      const lit = clamp((0.5 + 0.7 * u.fbm2(x / S * 7 + 3, y / S * 7 + 8, 3)) * (0.7 + 0.4 * (1 - dn)), 0.2, 1.1);
      const r = (0.0026 + 0.0034 * rnd()) * S, pr = rnd();
      let cg, cb;
      if (pr < 0.03 + 0.16 * dn * dn) { cg = 190 + 24 * rnd(); cb = 196 + 20 * rnd(); } else if (pr < 0.6) { cg = 232 + 16 * rnd(); cb = 196 + 24 * rnd(); } else { cg = 214 + 16 * rnd(); cb = 140 + 30 * rnd(); }
      lc.fillStyle = `rgba(255,${cg | 0},${cb | 0},${clamp(0.28 * lit + 0.22 * rnd(), 0, 0.6)})`;
      lc.beginPath(); lc.arc(x, y, r, 0, TAU); lc.fill();
      placed++;
    }
    lc.restore();
    lc.globalCompositeOperation = 'destination-in';   // underside of the canopy a little shaded
    const shade = lc.createLinearGradient(0, oy - ry, 0, oy + ry * 1.1);
    shade.addColorStop(0, 'rgba(0,0,0,1)'); shade.addColorStop(0.55, 'rgba(0,0,0,0.95)'); shade.addColorStop(1, 'rgba(0,0,0,0.4)');
    lc.fillStyle = shade; lc.fillRect(0, 0, w, h);
    NCR = { c, w, h, ox, oy, cyPx: cr.cy * S, rx, ry, spk: [] };
    // sparkle spots: a fixed subset of the blossoms
    for (let i = 0; i < B.n; i += 6) NCR.spk.push([B.x[i] * S, B.y[i] * S, B.r[i], B.r3[i]]);
  }
  // wind sway of the cached tree (px), identical in both scenes
  const nightSway = (T, S) => S * 0.0016 * (sin(T * 0.8) + 0.55 * sin(T * 1.9 + 1.0));
  const NT_API = {
    ready(env) { ensureTree(env); },
    /** o: { cx, G (ground y, px), T, k (bloom 0..1), glow (0..1) } */
    crown(g, env, o) {
      ensureTree(env);
      const k = o.k; if (k < 0.005) return;
      const e = u.ease.outCubic(clamp(k)), sc = lerp(0.86, 1, e), pulse = 0.94 + 0.06 * sin(o.T * 2.4);
      const cx = o.cx + nightSway(o.T, env.S) * 0.6, cy = o.G - NCR.cyPx;
      g.save();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp(0.47 * (o.glow == null ? 1 : o.glow) * e * (0.94 + 0.06 * pulse), 0, 1);
      g.imageSmoothingEnabled = true;
      g.drawImage(NCR.c, cx - NCR.ox * sc, cy - NCR.oy * sc, NCR.w * sc, NCR.h * sc);
      g.restore();
    },
    skeleton(g, env, o) {
      ensureTree(env);
      g.save();
      g.globalAlpha = o.alpha == null ? 1 : o.alpha;
      g.translate(Math.round(o.cx + nightSway(o.T, env.S)), Math.round(o.G));
      g.drawImage(SK.v[2], -Math.round(SK.bx), -Math.round(SK.by));
      g.restore();
    },
    sparkles(g, env, o) {
      ensureTree(env);
      const k = o.k; if (k < 0.02) return;
      const S = env.S, T = o.T, cx = o.cx + nightSway(T, S);
      const pk = u.glowSprite(335, 60, 86), wm = u.glowSprite(44, 90, 70);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < NCR.spk.length; i++) {
        const q = NCR.spk[i];
        const tw = pow(0.5 + 0.5 * sin(T * (1.1 + q[3] * 1.8) + q[2] * 40), 3);
        const a = 0.6 * tw * k * (o.glow == null ? 1 : o.glow);
        if (a < 0.02) continue;
        const r = S * (0.011 + 0.012 * q[3]);
        g.globalAlpha = a;
        g.drawImage(q[2] > 0.45 ? wm : pk, cx + q[0] - r, o.G - q[1] - r, r * 2, r * 2);
      }
      g.restore();
    },
  };
  (Anim.shared = Anim.shared || {}).nightTree = NT_API;

  /* leaves: light-level sprite pick (dithered per leaf), colour from the season */
  function drawLeaves(g, env, z0, z1) {
    const { W, H, S } = env;
    const L = TR.L, gam = F.gam, ks = F.ks, G = F.G, cx = F.cx, T = F.T;
    const spring1 = 0.72 + 0.28 * ss(136, 142, T);
    const flutter = 0.002 + 0.0025 * SW[2];
    const lvF = F.lvF;
    const a0 = L.zs[z0], a1 = L.zs[z1];
    let smooth = true;
    g.imageSmoothingEnabled = true;
    for (let i = a0; i < a1; i++) {
      const b = L.b[i];
      if (gam < b) continue;
      const grow = ss(b, b + 0.06, gam);
      if (grow < 0.02) continue;
      const r = L.r[i], r2 = L.r2[i];
      let alive, pcv;
      if (L.juv[i]) {
        alive = 1 - ss(140.8 + r * 1.4, 142.4 + r * 1.4, T);   // the young blades stay until the crown has closed (no bare-tree gap)
        if (alive < 0.02) continue;
        const y = L.y[i], sg = L.juv[i];
        const x = L.x[i] + swayX(y);
        const lsz = L.sz[i] * (0.2 + 0.8 * grow) * alive * ks;
        if (lsz < 3) continue;
        const droop = 0.5 + 0.25 * sin(T * 1.3 + r * 6) + 0.35 * (1 - grow);
        const ang = sg > 0 ? -droop : PI + droop;
        const c1 = cos(ang), s1 = sin(ang), k1 = lsz / 48, fl = sg > 0 ? 1 : -1;
        g.setTransform(c1 * k1, s1 * k1, -s1 * k1 * fl, c1 * k1 * fl, cx + x * ks, G - y * ks);
        g.drawImage(SPR.blade[min(NLV, floor(lvF + L.r3[i]))], 0, -24, 48, 48);
        g.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      } else {
        const sh = 1 - ss(L.td[i], L.td[i] + 0.55, T);
        const re = 0;
        if (sh < 0.02 && re < 0.02) continue;
        if (sh >= re) {
          alive = sh;
          const o = (r2 - 0.5) * 3.0;
          pcv = ss(139.6 + o, 141.6 + o, T) + ss(143.9 + o, 145.3 + o, T) + ss(145.2 + o * 1.1, 146.7 + o * 1.1, T) + ss(146.4 + o, 148.0 + o, T);
        } else { alive = re; pcv = 0; }
      }
      const sz = L.sz[i] * (0.35 + 0.65 * grow) * alive * spring1 * ks;
      if (sz < 2) continue;
      const y = L.y[i], x = L.x[i] + swayX(y) + sin(T * 2.1 + r * TAU) * flutter + sin(T * 3.7 + r2 * TAU) * flutter * 0.4;
      const px = cx + x * ks, py = G - y * ks + sin(T * 1.7 + r * 9) * flutter * ks * 0.6;
      const ci = clamp(Math.round((pcv * (NC - 1)) / 4) + (pcv > 1.2 && pcv < 3.8 ? floor((L.r3[i] - 0.5) * 3.2) : 0), 0, NC - 1);
      let sd = L.z[i];
      if (L.r3[i] > 0.82) sd = min(2, sd + 1); else if (L.r3[i] < 0.16) sd = max(0, sd - 1);
      const lv = min(NLV, floor(lvF + L.r3[i]));
      const wantSmooth = sz > 100 || sz < 44;
      if (wantSmooth !== smooth) { smooth = wantSmooth; g.imageSmoothingEnabled = smooth; }
      const dx = Math.round(px - sz * 0.5), dy = Math.round(py - sz * 0.5), dsz = Math.round(sz);
      if (r2 > 0.5) g.drawImage(SPR.leaf[lv][ci][sd], dx, dy, dsz, dsz);
      else g.drawImage(SPR.leaf[lv][ci][sd], dx + dsz, dy, -dsz, dsz);
    }
    g.imageSmoothingEnabled = true;
  }

  // blossoms (drawn with their own light: they keep a glow at night)
  function blossomEnv(i, T) {
    const r = TR.BL.r[i];
    const b1 = ss(137.9 + r * 1.2, 139.4 + r * 1.2, T) * (1 - ss(141.6 + r * 1.6, 143.0 + r * 1.6, T));
    return b1;   // (the second bloom of the year, at dusk, is the shared night tree)
  }
  function drawBlossoms(g, env) {
    const { W, H, S } = env;
    const B = TR.BL, gam = F.gam, ks = F.ks, G = F.G, cx = F.cx, T = F.T;
    if (!(T > 137.8 && T < 143.8)) return;
    const glowK = ss(151.3, 153.5, T);
    let smoothB = false;
    g.imageSmoothingEnabled = false;
    for (let i = 0; i < B.n; i++) {
      if (gam < B.b[i]) continue;
      let e = blossomEnv(i, T);
      if (e < 0.02) continue;
      const r = B.r[i], r2 = B.r2[i], r3 = B.r3[i];
      if (T > 151) e *= 0.65 + 0.35 * (0.5 + 0.5 * sin(T * 1.1 + r * 40));
      const y = B.y[i], x = B.x[i] + swayX(y) + sin(T * 2.3 + r * TAU) * 0.002;
      const px = cx + x * ks, py = G - y * ks;
      const sz = B.sz[i] * (0.4 + 0.6 * e) * ks * ss(B.b[i], B.b[i] + 0.06, gam);
      if (sz < 2) continue;
      let v = glowK > 0.08 + 0.84 * r3 ? 2 : (F.A > 0.58 + 0.28 * r3 ? 0 : 1);
      g.globalAlpha = min(1, e * 1.2);
      let ci = Math.round(Math.log(sz / 28) / 0.1157); ci = ci < 0 ? 0 : ci > 13 ? 13 : ci;
      const cs = BCLS[ci];
      const sm = abs(sz / cs - 1) > 0.12;
      if (sm !== smoothB) { smoothB = sm; g.imageSmoothingEnabled = sm; }
      g.drawImage(SPR.blos[v][floor(r2 * 3) % 3][ci], Math.round(px - cs * 0.5), Math.round(py - cs * 0.5), cs, cs);
    }
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 1;
  }
  // soft emissive light of the blossoms at night (the "glowing tree")
  function drawBlossomGlow(g, env) {
    const { W, H, S } = env;
    const B = TR.BL, ks = F.ks, G = F.G, cx = F.cx, T = F.T;
    const k = ss(151.3, 154.0, T) * (1 - F.A * 0.4);
    if (k < 0.02) return;
    const sp = u.glowSprite(40, 90, 70);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < B.n; i += 9) {
      const e = blossomEnv(i, T); if (e < 0.05) continue;
      const y = B.y[i], x = B.x[i] + swayX(y);
      const tw = 0.7 + 0.3 * sin(T * 1.3 + B.r[i] * 40);
      const sz = B.sz[i] * ks * 2.0;
      g.globalAlpha = 0.1 * k * e * tw;
      g.drawImage(sp, cx + x * ks - sz * 0.5, G - y * ks - sz * 0.5, sz, sz);
    }
    g.restore();
  }

  function drawTree(g, env) {
    const { W, H, S } = env;
    if (F.gam <= 0.0005 && F.T < CAM.Tb) return;
    const ks = F.ks, G = F.G, cx = F.cx, T = F.T;
    // ground shadow
    const shadowR = (0.05 + 0.3 * min(1, F.apexH / TR.Htot)) * ks;
    g.save();
    const grd = g.createRadialGradient(cx, G + 0.012 * S, 0, cx, G + 0.012 * S, shadowR);
    grd.addColorStop(0, 'rgba(6,10,6,0.42)'); grd.addColorStop(1, 'rgba(6,10,6,0)');
    g.translate(0, G + 0.012 * S); g.scale(1, 0.18); g.translate(0, -(G + 0.012 * S));
    g.fillStyle = grd; g.fillRect(cx - shadowR, G + 0.012 * S - shadowR, shadowR * 2, shadowR * 2);
    g.restore();
    drawLeaves(g, env, 0, 1);
    if ((T >= CACHE_T || F.gam >= 0.985) && SK) {
      // cached skeleton (the last 1.5 % of the growth is invisible), leaned by the wind (shear) / shifted; light = blend of the neighbouring variants
      const lum = F.lum;
      g.save();
      g.translate(Math.round(cx + F.swX * ks), Math.round(G));
      if (F.swA > 1e-5 || F.swA < -1e-5) g.transform(1, 0, -F.swA, 1, 0, 0);
      const draw = (v, a) => { g.globalAlpha = a; g.drawImage(SK.v[v], -Math.round(SK.bx), -Math.round(SK.by)); };
      const l0 = lumOf(SK_LM[2]), l1 = lumOf(SK_LM[1]);
      const mixd = (vb, vt, a) => { if (a < 0.02) draw(vb, 1); else if (a > 0.98) draw(vt, 1); else { draw(vb, 1); draw(vt, a); } };
      if (lum <= l1) mixd(2, 1, clamp((lum - l0) / (l1 - l0)));
      else mixd(1, 0, clamp((lum - l1) / (1 - l1)));
      const sa = F.snow * (0.3 + 0.7 * clamp((lum - l0) / (1 - l0)));
      if (sa > 0.02) { g.globalAlpha = sa; g.drawImage(SK.snow, -Math.round(SK.bx), -Math.round(SK.by)); }
      g.restore();
      g.globalAlpha = 1;
    } else {
      const fh = clamp(F.apexH / TR.Htot);
      strokeBranches(g, { gam: F.gam, ks, bx: cx, by: G, swA: F.swA, swX: F.swX, LM: F.LM, snowOnly: false, snow: F.snow, sunSide: F.sunX < F.cx ? -1 : 1, fh });
    }
    drawLeaves(g, env, 1, 3);
  }

  /* ================================================================== particles (all analytic) */
  const _pr = [0, 0];
  function proj(x, y, T, amp) { _pr[0] = F.cx + (x + swayX(y, T, amp)) * F.ks; _pr[1] = F.G - y * F.ks; return _pr; }

  function drawPetalLike(g, spr, px, py, size, rot, flip, alpha) {
    const c = cos(rot), s = sin(rot), k1 = size / 24 * (0.35 + 0.65 * abs(flip)), k2 = size / 24 * 0.8;
    g.setTransform(c * k1, s * k1, -s * k2, c * k2, px, py);
    g.globalAlpha = alpha;
    g.drawImage(spr, -12, -12, 24, 24);
  }

  function drawFalling(g, env) {
    const { W, H, S } = env;
    const T = F.T, L = TR.L, ks = F.ks, G = F.G, cx = F.cx;
    const amp = 0.011 * (1 + 0.7 * SW[2] + 0.7 * SW[3]);
    // blossom petals in spring
    if (T > 138.6 && T < 146.5) {
      const sp = SPR.petal[0];
      for (const p of PART.petals) {
        const t = T - p.t0; if (t < 0) continue;
        const v = 0.085 + 0.06 * p.r;
        const li = p.li, B = TR.BL;
        const y = B.y[li] - v * t - 0.01 * sin(t * 2.3 + p.ph);
        if (y < -0.004) continue;
        const x = B.x[li] + p.dx + 0.05 * sin(1.3 * t + p.ph) + 0.028 * t * (1 + p.r);
        proj(x, y, T, amp);
        const a = ss(0, 0.35, t) * ss(-0.004, 0.05, y) * (0.5 + 0.5 * F.A);
        if (a < 0.02) continue;
        drawPetalLike(g, sp, _pr[0], _pr[1] + p.dz * 0.0, ks * 0.0165 * p.s, p.ph + t * 2.1, cos(t * 3 + p.ph), a);
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }
    // autumn leaves
    if (T > 145.3 && T < 153) {
      for (const p of PART.fall) {
        const li = p.li, td = L.td[li];
        const t = T - td; if (t < 0) continue;
        const v = 0.1 + 0.07 * p.r;
        const y0 = L.y[li];
        const tl = (y0 - 0.004) / v;
        let y, a, flat = 0;
        const x = L.x[li] + 0.075 * sin(1.15 * t + p.ph) * (1 - ss(tl - 0.6, tl, t)) + 0.03 * t * (0.5 + p.r) * (t < tl ? 1 : 0) + (t >= tl ? 0.03 * tl * (0.5 + p.r) : 0);
        if (t < tl) { y = y0 - v * t; a = ss(0, 0.2, t); }
        else { y = 0.004; a = 1 - ss(tl + 0.8, tl + 3.2, t); flat = 1; }
        a *= 1 - ss(150.4, 151.7, T);   // no litter left on the ground by the time the dusk blossoms open
        if (a < 0.02) continue;
        proj(x, y, T, amp);
        const py = _pr[1] + (flat ? p.dz * S * 0.055 : 0);
        drawPetalLike(g, SPR.aleaf[p.c], _pr[0], py, ks * 0.021 * p.s, p.ph + t * (flat ? 0 : 2.4), flat ? 0.9 : cos(t * 2.1 + p.ph), a * (flat ? 0.8 : 1));
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }
  }

  function drawSnow(g, env) {
    const { W, H, S } = env;
    const T = F.T;
    const env1 = ss(147.8, 149.2, T) * (1 - ss(151.0, 152.4, T));
    if (env1 < 0.01) return;
    const sp = u.glowSprite(210, 30, 96);
    g.save(); g.globalCompositeOperation = 'lighter';
    const wind = 0.02 * sin(T * 0.3);
    for (const f of PART.snow) {
      const lay = f.l, v = [0.045, 0.08, 0.13][lay], sz = S * [0.0045, 0.0075, 0.012][lay] * f.s;
      const y = u.wrap(f.y + (T - 148) * v * (0.8 + 0.4 * f.r), 0, 1);
      const x = u.wrap(f.x + sin(T * 0.5 + f.ph) * 0.02 * (1 + lay) + (T - 148) * (0.012 + wind) * (1 + lay * 0.5), 0, 1);
      g.globalAlpha = env1 * [0.45, 0.6, 0.75][lay] * (0.6 + 0.4 * sin(T * 2 + f.ph));
      g.drawImage(sp, x * W - sz, y * H - sz, sz * 2, sz * 2);
    }
    g.restore();
  }

  function drawFireflies(g, env) {
    const { W, H, S } = env;
    const T = F.T;
    const k = (1 - F.A) * SW[1] * ss(133, 138, T);
    if (k < 0.03) return;
    const sp = u.glowSprite(72, 90, 62, 'core');
    g.save(); g.globalCompositeOperation = 'lighter';
    const ffX = 1 - ss(150.6, 152.4, T);   // the dusk meadow's own (s7) fireflies take over
    for (let fi = 0; fi < PART.ff.length; fi++) {
      const f = PART.ff[fi];
      const x = f.x * W + sin(T * 0.5 + f.ph) * S * 0.04 + sin(T * 1.3 + f.ph * 2) * S * 0.01;
      const y = lerp(F.hy + 0.04 * H, H * 0.97, f.y) + sin(T * 0.7 + f.ph * 1.7) * S * 0.03;
      const bl = pow(0.5 + 0.5 * sin(T * (1.1 + f.r) + f.ph * 3), 3);
      const a = k * (0.15 + 0.85 * bl) * ffX;
      if (a < 0.02) continue;
      const sz = S * 0.014 * (0.7 + 0.5 * f.r);
      g.globalAlpha = a;
      g.drawImage(sp, x - sz, y - sz, sz * 2, sz * 2);
    }
    g.restore();
  }

  function drawMotes(g, env) {
    const { W, H, S } = env;
    const T = F.T;
    const k = F.A * (1 - F.nd) * (0.5 + 0.5 * (1 - SW[3])) * ss(133.5, 136, T) * 0.55;
    if (k < 0.02) return;
    const sp = u.glowSprite(46, 70, 80);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of PART.motes) {
      const y = u.wrap(m.y - T * m.v, 0, 1) * H, x = u.wrap(m.x + sin(T * 0.4 + m.ph) * 0.02 + T * 0.004, 0, 1) * W;
      const a = k * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(T * 0.9 + m.ph * 2), 2)) * ss(0.0, 0.15, y / H) * ss(1.0, 0.7, y / H);
      const sz = S * 0.006 * m.s;
      g.globalAlpha = a;
      g.drawImage(sp, x - sz, y - sz, sz * 2, sz * 2);
    }
    g.restore();
  }

  function drawRising(g, env) {
    const { W, H, S } = env;
    const T = F.T, L = TR.L;
    if (T < 150.2) return;
    const amp = 0.011;
    const spP = SPR.petal[0];
    const gs = u.glowSprite(335, 55, 84);
    for (const p of PART.rise) {
      const t = T - p.t0; if (t < 0) continue;
      const li = p.li, B = TR.BL;
      const v = 0.035 + 0.05 * p.r + 0.012 * t;
      const y = B.y[li] + v * t, x = B.x[li] + p.dx + sin(0.9 * t + p.ph) * 0.03 + 0.012 * t * (p.r - 0.5);
      proj(x, y, T, amp);
      const a = ss(0, 0.7, t) * (1 - ss(3.4, 5.2, t)) * (0.55 + 0.45 * sin(T * 2 + p.ph));
      if (a < 0.02) continue;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a * 0.55;
      const gz = F.ks * 0.03 * p.s;
      g.drawImage(gs, _pr[0] - gz, _pr[1] - gz, gz * 2, gz * 2);
      g.globalCompositeOperation = 'source-over';
      drawPetalLike(g, spP, _pr[0], _pr[1], F.ks * 0.014 * p.s, p.ph + t * 1.1, cos(t * 2 + p.ph), min(1, a * 1.3));
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /* ================================================================== underground */
  function rootPath(x, r, x0, y0, ang, len, wid, alpha, depth, S) {
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
      x.beginPath(); x.moveTo(pts[i][0], pts[i][1]); x.lineTo(pts[i + 1][0], pts[i + 1][1]); x.stroke();
      if (depth < 2 && i > 2 && r() < 0.22) rootPath(x, r, pts[i][0], pts[i][1], a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.6), len * (0.35 + r() * 0.25), wid * 0.6, alpha * 0.8, depth + 1, S);
    }
  }

  function buildSoil(env) {
    const { W, H, S } = env;
    const YS = CAM.YS, pad = 0.05 * S;
    const k = (W * (CAM.YS + 0.65 * H + 0.15 * S) > 4.2e6) ? 0.75 : 1;
    const worldH = YS + 0.55 * H + 0.1 * S;
    const cw = ceil(W * k), ch = ceil((worldH + pad) * k);
    const c = u.canvas(cw, ch), x = c.getContext('2d');
    x.scale(cw / W, ch / (worldH + pad)); x.translate(0, pad);
    const r = u.rng(5151);
    const ya = YS - 0.66 * H, yb = YS + 0.34 * H;
    const amt = (y) => 1 - ss(ya - 0.5 * S, ya + 0.15 * S, y);
    // earth silhouette: wavy surface at y = 0, everything above is transparent
    x.save();
    x.beginPath(); x.moveTo(-5, -pad - 2);
    for (let px = -5; px <= W + 5; px += 10) x.lineTo(px, 0.004 * S * sin(px / S * 4.3 + 1) + (u.noise1(px / S * 9) - 0.5) * 0.006 * S);
    x.lineTo(W + 5, worldH + 5); x.lineTo(-5, worldH + 5); x.closePath(); x.clip();
    const bg = x.createLinearGradient(0, 0, 0, worldH);
    const st = (y, col) => bg.addColorStop(clamp(y / worldH, 0, 1), col);
    st(0, '#3c291b'); st(0.06 * S, '#2d1f16'); st(max(0.1 * S, ya - 0.5 * S), '#27190f'); st(ya, '#1a1210'); st(yb, '#0b0807'); st(worldH, '#070505');
    x.fillStyle = bg; x.fillRect(0, -pad, W, worldH + pad);
    // strata: soft painterly bands (gradient body, feathered edge, grainy texture)
    let y = 0.03 * S, bi = 0;
    const tones = [[92, 64, 40], [70, 48, 32], [110, 80, 48], [54, 40, 30], [82, 60, 44], [126, 96, 62], [74, 72, 66], [98, 70, 52]];
    const edge = (y0, am, f, ph, off, nz) => { const pts = []; for (let px = 0; px <= W; px += 10) pts.push(y0 + am * sin(px / S * f + ph + off) + (u.noise1(px / S * 3 + ph + nz) - 0.5) * am); return pts; };
    while (y < ya + 0.2 * S) {
      const th = (0.035 + r() * 0.085 + bi * 0.004) * S, ph = r() * 9, f = 1.5 + r() * 2.5, am = (0.006 + r() * 0.02) * S;
      const a = amt(y + th * 0.5);
      if (a > 0.02) {
        const tone = tones[floor(r() * tones.length)];
        const top = edge(y, am, f, ph, 0, 0), bot = edge(y + th, am, f, ph, 1.1, 5);
        const band = (grow, alpha) => {
          x.beginPath();
          for (let i = 0; i < top.length; i++) i ? x.lineTo(i * 10, top[i] - grow) : x.moveTo(0, top[i] - grow);
          for (let i = top.length - 1; i >= 0; i--) x.lineTo(i * 10, bot[i] + grow);
          x.closePath();
          const gr = x.createLinearGradient(0, y - grow, 0, y + th + grow);
          gr.addColorStop(0, `rgba(${tone[0] * 1.22 | 0},${tone[1] * 1.2 | 0},${tone[2] * 1.15 | 0},${alpha * a})`);
          gr.addColorStop(1, `rgba(${tone[0] * 0.78 | 0},${tone[1] * 0.76 | 0},${tone[2] * 0.78 | 0},${alpha * a * 0.9})`);
          x.fillStyle = gr; x.fill();
        };
        band(th * 0.12, 0.26); band(0, 0.5);
        // lit rim along the top, shadow along the bottom
        x.strokeStyle = `rgba(255,226,180,${0.09 * a})`; x.lineWidth = 1.5;
        x.beginPath(); for (let i = 0; i < top.length; i++) i ? x.lineTo(i * 10, top[i]) : x.moveTo(0, top[i]); x.stroke();
        x.strokeStyle = `rgba(10,6,4,${0.22 * a})`; x.lineWidth = 2.2;
        x.beginPath(); for (let i = 0; i < bot.length; i++) i ? x.lineTo(i * 10, bot[i] + 1.5) : x.moveTo(0, bot[i] + 1.5); x.stroke();
        // grain
        const ng = floor(W * th / (S * S * 0.0014));
        for (let k2 = 0; k2 < ng; k2++) {
          const px = r() * W, py = y + r() * th, ln = 5 + r() * 20, lt = r() < 0.5;
          x.strokeStyle = lt ? `rgba(${tone[0] * 1.5 | 0},${tone[1] * 1.45 | 0},${tone[2] * 1.4 | 0},${(0.05 + r() * 0.08) * a})` : `rgba(10,6,4,${(0.06 + r() * 0.1) * a})`;
          x.lineWidth = 0.9 + r() * 0.9;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + ln, py + (r() - 0.5) * 3); x.stroke();
        }
      } else { for (let q2 = 0; q2 < 12; q2++) r(); }
      y += th; bi++;
    }
    // pale clay lenses and mineral glints
    for (let i = 0; i < 14; i++) {
      const px = r() * W, py = 0.1 * S + r() * (ya - 0.1 * S), a = amt(py), rw = (0.05 + r() * 0.1) * S, rh = rw * (0.12 + r() * 0.1);
      if (a < 0.1) continue;
      const lg = x.createRadialGradient(px, py, 0, px, py, rw);
      lg.addColorStop(0, `rgba(190,170,130,${0.16 * a})`); lg.addColorStop(1, 'rgba(190,170,130,0)');
      x.save(); x.translate(px, py); x.scale(1, rh / rw); x.translate(-px, -py); x.fillStyle = lg; x.beginPath(); x.arc(px, py, rw, 0, TAU); x.fill(); x.restore();
    }
    for (let i = 0; i < 160; i++) {
      const px = r() * W, py = 0.05 * S + r() * (ya + 0.3 * S), a = 0.25 + 0.75 * amt(py);
      x.fillStyle = `rgba(255,236,190,${(0.12 + r() * 0.25) * a})`;
      const sz = 0.8 + r() * 1.4; x.fillRect(px, py, sz, sz);
    }
    // dark humus under the surface
    const hg = x.createLinearGradient(0, 0, 0, 0.08 * S);
    hg.addColorStop(0, 'rgba(28,16,10,0.85)'); hg.addColorStop(1, 'rgba(28,16,10,0)');
    x.fillStyle = hg; x.fillRect(0, 0, W, 0.08 * S);
    // moisture blotches
    for (let i = 0; i < 70; i++) {
      const px = r() * W, py = r() * (ya + 0.3 * S), rad = (0.03 + r() * 0.08) * S;
      const a = amt(py); if (a < 0.05) continue;
      const rg = x.createRadialGradient(px, py, 0, px, py, rad);
      rg.addColorStop(0, `rgba(10,6,4,${0.3 * a})`); rg.addColorStop(1, 'rgba(10,6,4,0)');
      x.fillStyle = rg; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // pebbles
    for (let i = 0; i < 190; i++) {
      const py = 0.05 * S + r() * (ya + 0.2 * S), px = r() * W;
      const a = amt(py), rw = (0.003 + pow(r(), 2) * 0.012) * S, rh = rw * (0.55 + r() * 0.3), b = 80 + r() * 60, rot = r() * 3;
      if (a < 0.08) continue;
      x.fillStyle = `rgba(${b | 0},${b * 0.78 | 0},${b * 0.58 | 0},${0.9 * a})`;
      x.beginPath(); x.ellipse(px, py, rw, rh, rot, 0, TAU); x.fill();
      x.fillStyle = `rgba(255,235,200,${0.22 * a})`;
      x.beginPath(); x.ellipse(px - rw * 0.25, py - rh * 0.3, rw * 0.5, rh * 0.4, 0, 0, TAU); x.fill();
    }
    // pale roots hanging from the surface
    const rr = u.rng(7070);
    for (let i = 0; i < 9; i++) rootPath(x, rr, rr() * W, 0.006 * S, (rr() - 0.5) * 0.7, (0.2 + rr() * 0.3) * S, (1.8 + rr() * 2.0) * (S / 720), 0.5, 0, S);
    for (const [fx, ang, ln] of [[0.16, 0.25, 0.42], [0.82, -0.3, 0.5], [0.66, 0.1, 0.3]]) rootPath(x, rr, fx * W, ya - 0.02 * H, ang, ln * H, 1.6 * (S / 720), 0.2, 1, S);
    // grains
    const r2 = u.rng(6262);
    for (let i = 0; i < 3600; i++) {
      const px = r2() * W, py = r2() * worldH;
      const a = 0.3 + 0.7 * amt(py);
      const dk = lerp(1, 0.42, clamp((py - ya) / (yb - ya)));
      x.fillStyle = `rgba(${150 * dk | 0},${118 * dk | 0},${86 * dk | 0},${(0.1 + r2() * 0.26) * a})`;
      const sz = 1 + r2() * 1.6; x.fillRect(px, py, sz, sz);
    }
    // wet shine along the surface + fringe of tiny rootlets
    const sg = x.createLinearGradient(0, -3, 0, 5);
    sg.addColorStop(0, 'rgba(210,190,140,0)'); sg.addColorStop(0.4, 'rgba(220,196,140,0.4)'); sg.addColorStop(1, 'rgba(220,196,140,0)');
    x.fillStyle = sg; x.fillRect(0, -3, W, 8);
    for (let i = 0; i < 110; i++) {
      const px = r2() * W, l = (0.01 + r2() * 0.04) * S;
      x.strokeStyle = `rgba(215,200,160,${0.18 + r2() * 0.22})`; x.lineWidth = 0.9;
      x.beginPath(); x.moveTo(px, 2); x.quadraticCurveTo(px + (r2() - 0.5) * 14, l * 0.5, px + (r2() - 0.5) * 22, l); x.stroke();
    }
    x.restore();
    SOIL = { c, cw, ch, pad, worldH, k: cw / W };
  }

  function buildGlow(env) {
    const { W, H, S } = env;
    const YS = CAM.YS, r = u.rng(8088);
    const cxw = W * 0.5;
    // mycelium: pale branching threads that light up as the seed's glow spreads
    MYC = [];
    const addThread = (x, y, ang, len, depth) => {
      const n = 6 + floor(r() * 4), pts = [[x, y]];
      let a = ang, px = x, py = y;
      for (let i = 0; i < n; i++) {
        a += (r() - 0.5) * 0.9;
        const l = (len / n) * (0.8 + 0.4 * r());
        px += cos(a) * l; py += sin(a) * l; pts.push([px, py]);
      }
      const dS = (p) => Math.hypot(p[0], p[1] - YS);
      if (dS(pts[pts.length - 1]) < dS(pts[0])) pts.reverse();      // grow outwards from the seed
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      let ymin = 1e9, ymax = -1e9, sx = 0, sy = 0;
      for (const p of pts) { ymin = min(ymin, p[1]); ymax = max(ymax, p[1]); sx += p[0]; sy += p[1]; }
      MYC.push({ pts, cum, len: cum[cum.length - 1], ymin, ymax, cx: sx / pts.length, cy: sy / pts.length, ph: r() * 6, depth, d0: dS(pts[0]) / S });
      if (depth < 2 && r() < 0.5) addThread(pts[3][0], pts[3][1], a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.7), len * 0.55, depth + 1);
    };
    for (let i = 0; i < 30; i++) addThread((r() - 0.5) * W * 1.1, 0.12 * YS + r() * (YS * 0.95 + 0.4 * H), (r() < 0.5 ? 0 : PI) + (r() - 0.5) * 1.3, (0.2 + r() * 0.3) * S, 0);
    for (let i = 0; i < 12; i++) addThread((r() - 0.5) * 0.04 * S, YS + (r() - 0.3) * 0.05 * S, (i / 12) * TAU + r() * 0.4, (0.22 + r() * 0.3) * S, 1);
    // roots: relative to the seed centre (px), growing down
    ROOT = [];
    const addRoot = (x, y, ang, len, depth, t0, spd) => {
      const n = 12, pts = [[x, y]];
      let a = ang, px = x, py = y;
      for (let i = 0; i < n; i++) {
        a += (r() - 0.5) * 0.55 + (depth === 0 ? 0 : 0.0);
        const l = len / n;
        px += sin(a) * l; py += cos(a) * l; pts.push([px, py]);
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const rt = { pts, cum, len: cum[n], t0, dur: cum[n] / spd, depth };
      ROOT.push(rt);
      if (depth < 3) {
        const nk = depth === 0 ? 7 : depth === 1 ? 3 : 2;
        for (let k = 0; k < nk; k++) {
          const j = 2 + floor(r() * (n - 3));
          const side = (k % 2 ? 1 : -1);
          const tj = t0 + (cum[j] / spd) + 0.1;
          addRoot(pts[j][0], pts[j][1], a + side * (0.7 + r() * 0.7) * (depth === 0 ? 1.1 : 1), len * (0.4 + r() * 0.25) * (depth === 0 ? 1 : 0.85), depth + 1, tj, spd * 0.9);
        }
      }
    };
    addRoot(0, 0.026 * S, 0.0, 0.85 * S, 0, 127.55, 0.3 * S);
    addRoot(0, 0.024 * S, -0.5, 0.45 * S, 1, 127.7, 0.26 * S);
    addRoot(0, 0.024 * S, 0.55, 0.5 * S, 1, 127.8, 0.26 * S);
    STEMW = { amp: 0.022 * S };
    // pre-touch life: a few pale threads around the dim seed, each carrying slow travelling light dots (offsets from the seed, px)
    PRE = [];
    const rp = u.rng(3131);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1, a0 = (side > 0 ? 0 : PI) + (rp() - 0.5) * 1.5 + (i < 4 ? 0.5 : -0.4) * side * -1;
      let px = side * (0.04 + rp() * 0.05) * S, py = (rp() - 0.4) * 0.06 * S, a = a0;
      const pts = [[px, py]], cum = [0], n = 9 + floor(rp() * 4);
      for (let k = 0; k < n; k++) {
        a += (rp() - 0.5) * 0.8;
        const l = (0.03 + rp() * 0.024) * S;
        px += cos(a) * l; py += sin(a) * l * 0.9 + 0.004 * S; pts.push([px, py]); cum.push(cum[k] + l);
      }
      PRE.push({ pts, cum, len: cum[n], ph: rp() * 6, sp: 0.016 + rp() * 0.012 });
    }
  }
  const stemX = (y, YS, S, cx) => cx + 0.022 * S * sin(PI * clamp(y / YS)) * sin(y / S * 5.4 + 1.1);

  function pointOnPoly(pts, cum, s, out) {
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const f = clamp((s - cum[i - 1]) / max(1e-6, cum[i] - cum[i - 1]));
    out[0] = lerp(pts[i - 1][0], pts[i][0], f); out[1] = lerp(pts[i - 1][1], pts[i][1], f);
  }
  const _pp = [0, 0];

  function drawUnder(g, env, hs) {
    const { W, H, S } = env;
    const T = F.T, G = F.G, cx = F.cx, YS = CAM.YS, sv = F.soilVis;
    if (sv < 0.003) return;
    // the earth
    const k = SOIL.k, dy0 = Math.round(G - SOIL.pad);
    const c0 = max(0, -dy0 * k), c1 = min(SOIL.ch, (H - dy0) * k);
    if (c1 > c0) {
      if (sv > 0.999) {
        g.drawImage(SOIL.c, 0, c0, SOIL.cw, c1 - c0, 0, dy0 + c0 / k, W, (c1 - c0) / k);
      } else {
        // the earth dissolves from its top edge downwards while the camera leaves it
        const t = TL.ctx, pf = 1 - sv, y0 = max(0, floor(G - 2)), hh = H - y0;
        t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
        t.clearRect(0, y0, W, hh);
        t.drawImage(SOIL.c, 0, c0, SOIL.cw, c1 - c0, 0, dy0 + c0 / k, W, (c1 - c0) / k);
        t.globalCompositeOperation = 'destination-in';
        const gm = t.createLinearGradient(0, G, 0, H);
        gm.addColorStop(0, `rgba(0,0,0,${clamp(1 - 1.9 * pf)})`); gm.addColorStop(1, `rgba(0,0,0,${clamp(1 - pf * 0.9 + 0.05)})`);
        t.fillStyle = gm; t.fillRect(0, y0, W, hh);
        t.globalCompositeOperation = 'source-over';
        g.drawImage(TL.c, 0, y0, W, hh, 0, y0, W, hh);
      }
    }
    // morning mist lying over the cut edge of the earth (no razor-straight soil / sky seam)
    {
      const mk = ss(130.4, 131.8, T) * (1 - ss(134.2, 136.4, T)) * sv;
      if (mk > 0.04 && G > -0.2 * H && G < H + 0.1 * S) {
        const mc = mixc(F.sky[2], [255, 244, 232], 0.45), y0 = G - 0.085 * S, y1 = G + 0.05 * S;
        const mg = g.createLinearGradient(0, y0, 0, y1);
        mg.addColorStop(0, rgba(mc, 0)); mg.addColorStop(0.5, rgba(mc, 0.26 * mk)); mg.addColorStop(0.66, rgba(mc, 0.4 * mk)); mg.addColorStop(1, rgba(mc, 0));
        g.fillStyle = mg; g.fillRect(0, y0, W, y1 - y0);
      }
    }
    const seedY = G + YS, rx = 0.0165 * S, ry = 0.025 * S;
    const wake = ss(T_TOUCH + 0.05, T_TOUCH + 1.6, T);
    const relax = 1 - 0.5 * ss(130.5, 133.5, T);
    g.save();
    g.globalCompositeOperation = 'lighter';
    // grains of light in the earth (B5 world: a slow shimmer)
    const spS = u.glowSprite(35, 40, 70);
    for (const s of PART.specks) {
      const y = G + YS - 0.66 * H + s.y * H;
      if (y < -10 || y > H + 10) continue;
      const tw = pow(0.5 + 0.5 * sin(T * s.f + s.ph), 4);
      const sz = S * 0.005;
      g.globalAlpha = 0.5 * tw * sv;
      g.drawImage(spS, s.x * W - sz, y - sz, sz * 2, sz * 2);
    }
    // the living dark before the touch (fades in while the previous scene is still dominant, then hands over to the awakening)
    {
      const lv = ss(122.3, 124.6, T) * sv;
      if (lv > 0.01) {
        // a warm halo around the sleeping seed, breathing slowly
        u.glow(g, cx, seedY, S * 0.27, 40, 80, 58, 0.075 * lv * (0.78 + 0.22 * sin(T * 0.9)) * (1 - wake));
        // pale threads with travelling dots
        const pa = lv * (1 - ss(127.2, 128.5, T));
        if (pa > 0.01) {
          const gl2 = u.glowSprite(44, 70, 78);
          g.lineCap = 'round'; g.lineJoin = 'round';
          for (const th of PRE) {
            const path = new Path2D(), p0 = th.pts;
            path.moveTo(cx + p0[0][0], seedY + p0[0][1]);
            for (let i = 1; i < p0.length; i++) path.lineTo(cx + p0[i][0], seedY + p0[i][1]);
            g.globalAlpha = pa * (0.12 + 0.05 * sin(T * 0.7 + th.ph)); g.strokeStyle = 'rgb(236,222,176)'; g.lineWidth = max(0.8, S * 0.0013); g.stroke(path);
            const sz = S * 0.0065;
            for (let q = 0; q < 2; q++) {
              pointOnPoly(p0, th.cum, u.wrap(T * th.sp * S / th.len + th.ph * 0.17 + q * 0.5, 0, 1) * th.len, _pp);
              g.globalAlpha = pa * 0.34 * (0.6 + 0.4 * sin(T * 1.3 + th.ph + q * 2));
              g.drawImage(gl2, cx + _pp[0] - sz, seedY + _pp[1] - sz, sz * 2, sz * 2);
            }
          }
        }
        // dust grains drifting up on two or three parallax layers
        const ds = u.glowSprite(36, 22, 72), dl = lv * (1 - ss(130.5, 133.5, T));
        if (dl > 0.01) for (const d of PART.dust) {
          const v = [0.006, 0.01, 0.015][d.l] * S, y = u.wrap(d.y * H - T * v, -0.02 * H, 1.02 * H);
          const x = d.x * W + sin(T * 0.3 + d.ph) * S * (0.008 + 0.006 * d.l);
          const sz = S * (0.0022 + 0.0016 * d.l) * d.s;
          g.globalAlpha = dl * (0.16 + 0.07 * d.l) * (0.6 + 0.4 * sin(T * 0.8 + d.ph)) * ss(0, 0.12, y / H) * ss(1, 0.88, y / H);
          g.drawImage(ds, x - sz * 2, y - sz * 2, sz * 4, sz * 4);
        }
      }
    }
    // the seed breathes very faintly
    u.glow(g, cx, seedY, S * 0.06, 40, 50, 40, (0.04 + 0.025 * sin(T * 0.9) + 0.22 * ss(126.1, 127.0, T)) * (1 - wake) * sv);
    // hero light on the soil before the touch
    if (T < T_TOUCH + 0.3) {
      const hf = sv * (1 - ss(T_TOUCH, T_TOUCH + 0.3, T));
      u.glow(g, hs.x, hs.dropY, S * 0.5, 200, 55, 55, 0.085 * hf);
      u.glow(g, hs.x, hs.dropY, S * 0.22, 195, 50, 70, 0.105 * hf);
    }
    // the touch: rings, flash, sparks
    const tau = T - T_TOUCH;
    const ty = seedY - ry * 0.9;
    if (tau > -0.1 && tau < 2.4) {
      const ring = u.glowSprite(160, 60, 85, 'ring'), softS = u.glowSprite(175, 55, 80);
      for (let m = 0; m < 3; m++) {
        const t2 = tau - m * 0.2;
        if (t2 < 0 || t2 > 1.9) continue;
        const rr = S * (0.02 + 0.3 * pow(t2, 0.58));
        const fa = pow(1 - t2 / 1.9, 1.6) * sv;
        g.globalAlpha = fa * 0.5; g.drawImage(ring, cx - rr, ty - rr * 0.38, rr * 2, rr * 0.76);
        g.globalAlpha = fa * 0.26; g.drawImage(ring, cx - rr * 1.14, ty - rr * 0.44, rr * 2.28, rr * 0.88);
        g.globalAlpha = fa * 0.1; g.drawImage(softS, cx - rr * 1.2, ty - rr * 0.5, rr * 2.4, rr);
      }
      u.glow(g, cx, ty, S * 0.22, lerp(190, 62, ss(0, 1, tau)), 70, 78, 0.8 * exp(-pow(tau / 0.42, 2)) * sv);
      const sb = SPR.bead;
      for (let i = 0; i < 18; i++) {
        const a = -PI * (0.1 + 0.8 * ((i * 0.618) % 1)), sp = (0.09 + 0.12 * ((i * 0.37) % 1)) * S;
        const tt = tau * 1.0; if (tt < 0) continue;
        const px = cx + cos(a) * sp * tt, py = ty + sin(a) * sp * tt + 0.5 * S * 0.22 * tt * tt;
        const al = (1 - ss(0.2, 1.5, tt)) * 0.9 * sv;
        if (al < 0.02) continue;
        const sz = S * 0.007 * (1.4 - 0.5 * ((i * 0.53) % 1));
        g.globalAlpha = al; g.drawImage(sb, px - sz, py - sz, sz * 2, sz * 2);
      }
    }
    // mycelium: threads grow outwards from the seed as the light spreads
    const Rw = (T - 127.3) * 0.4; // in S units
    if (Rw > 0) {
      const fadeM = 1 - ss(133.5, 135.8, T);
      const gl = u.glowSprite(75, 70, 72);
      for (const th of MYC) {
        const y0 = G + th.ymin, y1 = G + th.ymax;
        if (y1 < -20 || y0 > H + 20) continue;
        const gf = clamp((Rw - th.d0) / (th.len / S * 0.9 + 0.1));
        if (gf < 0.01) continue;
        const e = 1 - pow(1 - gf, 1.7), sl = e * th.len;
        const pul = 0.55 + 0.45 * sin(T * 1.1 + th.ph);
        const a = min(1, gf * 4) * pul * fadeM * sv;
        const path = new Path2D();
        const p0 = th.pts;
        path.moveTo(cx + p0[0][0], G + p0[0][1]);
        let i = 1;
        for (; i < p0.length && th.cum[i] <= sl; i++) path.lineTo(cx + p0[i][0], G + p0[i][1]);
        pointOnPoly(p0, th.cum, sl, _pp); path.lineTo(cx + _pp[0], G + _pp[1]);
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.globalAlpha = a * 0.2; g.strokeStyle = 'rgb(190,230,120)'; g.lineWidth = S * 0.0052; g.stroke(path);
        g.globalAlpha = a * 0.6; g.strokeStyle = 'rgb(255,246,200)'; g.lineWidth = max(0.8, S * 0.0014); g.stroke(path);
        // the growing tip and travelling pulses
        const sz = S * 0.011;
        if (gf < 0.98) { g.globalAlpha = a * 1.0; g.drawImage(gl, cx + _pp[0] - sz * 1.3, G + _pp[1] - sz * 1.3, sz * 2.6, sz * 2.6); }
        for (let q = 0; q < 2; q++) {
          const s = u.wrap(T * (0.2 + 0.08 * q) + th.ph * 0.3 + q * 0.5, 0, 1) * sl;
          pointOnPoly(th.pts, th.cum, s, _pp);
          g.globalAlpha = a * 0.95;
          g.drawImage(gl, cx + _pp[0] - sz, G + _pp[1] - sz, sz * 2, sz * 2);
        }
      }
      // other buried seeds wake as the light passes
      const sdS = u.glowSprite(66, 75, 74, 'core');
      for (const sd of PART.seeds) {
        const wy = sd.y * (YS + 0.45 * H), y = G + wy;
        if (y < -20 || y > H + 20) continue;
        const x = cx + sd.x * W * 0.5;
        const dist = Math.hypot(sd.x * W * 0.5 / S, (wy - YS) / S);
        const lit = ss(0, 0.3, Rw - dist);
        if (lit < 0.01) continue;
        const a = lit * fadeM * sv, rr = S * 0.0075 * sd.s;
        g.globalAlpha = a * 0.7; g.fillStyle = 'rgb(96,74,44)';
        g.beginPath(); g.ellipse(x, y, rr * 0.7, rr, sd.rot, 0, TAU); g.fill();
        const pu = 0.65 + 0.35 * sin(T * 1.7 + sd.ph);
        const gz = S * 0.05 * sd.s;
        g.globalAlpha = a * 0.55 * pu; g.drawImage(sdS, x - gz, y - gz, gz * 2, gz * 2);
        // a tiny sprout filament
        const gr2 = ss(0.25, 0.9, Rw - dist);
        if (gr2 > 0.02) { g.globalAlpha = a * 0.8; g.strokeStyle = 'rgb(236,250,170)'; g.lineWidth = max(0.9, S * 0.0016); g.beginPath(); g.moveTo(x, y - rr); g.quadraticCurveTo(x + sd.rot * rr * 4, y - rr * 3, x + sd.rot * rr * 2, y - rr * (1 + 5 * gr2)); g.stroke(); }
      }
      // luminous spores rising
      const sb = u.glowSprite(70, 80, 80);
      for (const s of PART.spores) {
        const wy = u.wrap(s.y * (YS + 0.5 * H) - (T - 128) * s.v * S, -0.1 * S, YS + 0.5 * H);
        const y = G + wy; if (y < -10 || y > H + 10) continue;
        const x = cx + s.x * W + sin(T * 0.5 + s.ph) * S * 0.015;
        const dist = Math.hypot(s.x * W / S, (wy - YS) / S);
        const lit = ss(0, 0.4, Rw - dist);
        const a = lit * (0.4 + 0.6 * pow(0.5 + 0.5 * sin(T * 1.4 + s.ph * 3), 2)) * fadeM * sv;
        if (a < 0.02) continue;
        const sz = S * 0.007 * s.s;
        g.globalAlpha = a * 0.8; g.drawImage(sb, x - sz, y - sz, sz * 2, sz * 2);
      }
    }
    g.restore();

    // roots: luminous filaments growing down from the seed
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    const tipSp = u.glowSprite(65, 80, 82, 'core');
    const rootDim = lerp(1, 0.38, ss(131, 134.5, T)) * sv;
    for (const rt of ROOT) {
      const q = clamp((T - rt.t0) / rt.dur);
      if (q <= 0) continue;
      const e = 1 - pow(1 - q, 1.6);
      const sl = e * rt.len;
      const ox = cx, oy = seedY;
      if (oy + rt.pts[0][1] - 20 > H && oy + rt.pts[0][1] + rt.len < -20) continue;
      const path = new Path2D();
      path.moveTo(ox + rt.pts[0][0], oy + rt.pts[0][1]);
      let i = 1;
      for (; i < rt.pts.length && rt.cum[i] <= sl; i++) path.lineTo(ox + rt.pts[i][0], oy + rt.pts[i][1]);
      pointOnPoly(rt.pts, rt.cum, sl, _pp);
      path.lineTo(ox + _pp[0], oy + _pp[1]);
      const wd = [0.0055, 0.0038, 0.0028, 0.002][rt.depth] * S;
      g.globalAlpha = 0.22 * rootDim; g.strokeStyle = 'rgb(170,225,110)'; g.lineWidth = wd * 3.2; g.stroke(path);
      g.globalAlpha = 0.85 * rootDim; g.strokeStyle = 'rgb(255,244,196)'; g.lineWidth = max(0.9, wd * 0.55); g.stroke(path);
      if (q < 1) {
        const sz = S * 0.022 * (1 - 0.15 * rt.depth);
        g.globalAlpha = 0.9 * sv; g.drawImage(tipSp, ox + _pp[0] - sz, oy + _pp[1] - sz, sz * 2, sz * 2);
      }
    }
    g.restore();

    // the stem: a glowing filament climbing from the seed to the surface, with sap-light pulses
    if (T > T_STEM) {
      const dTip = max(0, hs.under ? hs.y - G : 0);        // tip depth in px
      const yTop = (T >= CAM.Tb) ? 0 : dTip;
      const y0 = YS - ry * 0.85;
      if (y0 > yTop) {
        const path = new Path2D();
        const N = 44;
        for (let i = 0; i <= N; i++) { const yy = lerp(y0, yTop, i / N); const xx = stemX(yy, YS, S, cx); i ? path.lineTo(xx, G + yy) : path.moveTo(xx, G + yy); }
        g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
        const fade = (1 - ss(133.4, 135.6, T)) * sv;
        g.globalAlpha = 0.26 * fade; g.strokeStyle = 'rgb(170,230,110)'; g.lineWidth = S * 0.02; g.stroke(path);
        g.globalAlpha = 0.5 * fade; g.strokeStyle = 'rgb(210,245,150)'; g.lineWidth = S * 0.0085; g.stroke(path);
        g.globalAlpha = 0.95 * fade; g.strokeStyle = 'rgb(255,250,214)'; g.lineWidth = max(1.2, S * 0.003); g.stroke(path);
        const gl = u.glowSprite(68, 80, 80, 'core');
        for (let q = 0; q < 4; q++) {
          const s = u.wrap(T * 0.55 + q * 0.25, 0, 1);
          const yy = lerp(y0, yTop, s);
          const xx = stemX(yy, YS, S, cx);
          const sz = S * 0.02;
          g.globalAlpha = 0.8 * fade * sin(s * PI);
          g.drawImage(gl, xx - sz, G + yy - sz, sz * 2, sz * 2);
        }
        g.restore();
      }
    }
    // the seed itself
    g.save();
    g.translate(cx, seedY); g.rotate(0.12);
    g.globalAlpha = sv;
    const sgr = g.createRadialGradient(-rx * 0.35, -ry * 0.4, ry * 0.1, 0, 0, ry * 1.1);
    sgr.addColorStop(0, '#5a482c'); sgr.addColorStop(0.55, '#3d2f1b'); sgr.addColorStop(1, '#1e150c');
    g.fillStyle = sgr; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(190,160,100,0.12)'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(0, 0, rx * 0.98, ry * 0.98, 0, PI * 1.05, PI * 1.6); g.stroke();
    g.strokeStyle = 'rgba(20,12,6,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -ry * 0.95); g.quadraticCurveTo(rx * 0.3, 0, 0, ry * 0.95); g.stroke();
    if (wake > 0.01) {
      g.globalCompositeOperation = 'lighter';
      const pulse = 0.82 + 0.18 * sin(T * 2.6);
      const ig = g.createRadialGradient(0, 0, 0, 0, 0, ry * 1.2);
      ig.addColorStop(0, `rgba(255,244,170,${0.85 * wake * relax * pulse})`); ig.addColorStop(0.5, `rgba(200,235,110,${0.5 * wake * relax})`); ig.addColorStop(1, 'rgba(120,200,80,0)');
      g.fillStyle = ig; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,248,200,${0.9 * wake * relax})`; g.lineWidth = max(1.1, S * 0.0022);
      g.beginPath(); g.moveTo(0, -ry * 0.95); g.quadraticCurveTo(rx * 0.3, 0, 0, ry * 0.95); g.stroke();
    }
    g.restore();
    if (wake > 0.01) {
      g.save(); g.globalCompositeOperation = 'lighter';
      u.glow(g, cx, seedY, S * 0.16, 62, 80, 66, 0.55 * wake * relax * sv);
      u.glow(g, cx, seedY, S * 0.45, 70, 70, 52, 0.2 * wake * relax * sv);
      g.restore();
    }
  }

  /* ================================================================== the hero */
  const HS = { x: 0, y: 0, under: false, tipX: 0, tipY: 0 };
  function heroPos(T, env) {
    const { W, H, S } = env;
    const cx = W * 0.5, G = F.G, YS = CAM.YS;
    const seedY = G + YS, ry = 0.025 * S;
    HS.under = false;
    // the falling drop (B5: pinned at (.5,.56) until 126, then sinks onto the seed)
    {
      const r = PIN_IN.r * S, y0 = PIN_IN.y * H, ytouch = seedY - ry - 1.15 * r;
      const f = ss(126.0, T_TOUCH, T), f2 = ss(T_TOUCH, T_TOUCH + 0.5, T);
      HS.dropY = lerp(y0, ytouch, f) + (seedY - ry * 0.3 - ytouch) * f2;
    }
    if (T < T_STEM) { HS.x = cx; HS.y = seedY - ry * 0.1; return HS; }
    if (T < CAM.Tb) {
      const y = CAM.tipPre(T);
      HS.under = true; HS.y = y; HS.x = stemX(y - G, YS, S, cx);
      return HS;
    }
    // sprout tip -> heart of the canopy
    const w = ss(135.4, 139.6, T);
    const hc = F.apexH * (TR.hT / TR.Htot);
    const cxp = F.cx + swayX(hc) * F.ks, cyp = G - hc * F.ks;
    let x = lerp(F.tipX, cxp, w), y = lerp(F.tipY, cyp, w);
    const wp = ss(149.0, 151.6, T);
    x = lerp(x, PIN_OUT.x * W, wp); y = lerp(y, PIN_OUT.y * H, wp);
    HS.x = x; HS.y = y;
    return HS;
  }

  function drawHero(g, env) {
    const { W, H, S } = env;
    const T = F.T, cx = W * 0.5, G = F.G, YS = CAM.YS;
    const pulse = 1 + 0.06 * sin(T * 2.4);
    const seedY = G + YS, ry = 0.025 * S;
    const hue = lerp(PIN_IN.hue, 55, ss(126, 129, T));
    if (T < T_TOUCH + 0.6) {
      const r = PIN_IN.r * S;
      const f2 = ss(T_TOUCH, T_TOUCH + 0.5, T);
      const y = HS.dropY;
      const a = 1 - ss(T_TOUCH + 0.05, T_TOUCH + 0.55, T);
      hero.draw(g, cx, y, r * (1 - 0.35 * f2), { hue, form: 'drop', pulse, a, glow: a });
    }
    if (T > T_TOUCH + 0.2) {
      const ramp = ss(T_TOUCH + 0.2, T_TOUCH + 1.6, T);
      const r = S * lerp(0.0075, 0.014, ss(T_TOUCH, T_STEM + 1.5, T)) + S * 0.002 * ss(130, 150, T);
      const h2 = lerp(58, PIN_OUT.hue, ss(133, 150, T));
      const hp = HS;
      // sap-light riding up the stem
      if (T > CAM.Tb - 0.2 && T < 139.5 && F.gam > 0.002) {
        const sa = ss(CAM.Tb - 0.2, CAM.Tb + 0.6, T) * (1 - ss(137.5, 139.5, T));
        g.save(); g.globalCompositeOperation = 'lighter';
        const gl = u.glowSprite(72, 85, 78);
        for (let q = 0; q < 4; q++) {
          const s = u.wrap(T * 0.7 + q * 0.25, 0, 1);
          const px = lerp(F.cx, F.tipX, s), py = lerp(G, F.tipY, s);
          const sz = S * 0.018;
          g.globalAlpha = 0.7 * sa * sin(s * PI);
          g.drawImage(gl, px - sz, py - sz, sz * 2, sz * 2);
        }
        g.restore();
      }
      const tweak = T > 149 ? 1 : 0;
      const rr = T >= 150.5 ? PIN_OUT.r * S : r;
      // the seed's heartbeat (echo of the opening; the score's lub is at 127.344 + 2.4k, dub +0.432 s)
      const bt = hero.beat(T - 127.2, 2.4) * ss(127.8, 129.2, T) * (1 - ss(139.0, 141.7, T));
      hero.draw(g, hp.x, hp.y, rr, { hue: T >= 150.5 ? PIN_OUT.hue : h2, form: 'orb', pulse: pulse * (1 + 0.5 * bt), a: ramp, glow: 1 + 0.35 * ss(139, 148, T) * (1 - ss(149, 151.6, T)) + 0.9 * bt });
    }
  }

  // each turn of the season is announced by a soft ring of light travelling out from the heart of the tree
  const SEASON_PULSE = [[141.0, 345, 80, 86], [144.5, 100, 70, 74], [148.0, 28, 85, 70]];
  function drawSeasonPulse(g, env) {
    const { S } = env, T = F.T;
    for (const [t0, hue, sat, lig] of SEASON_PULSE) {
      for (let m = 0; m < 2; m++) {
        const tt = (T - t0 - m * 0.16) / 1.7;
        if (tt <= 0 || tt >= 1) continue;
        const e = 1 - pow(1 - tt, 2.2), rr = S * (0.05 + 0.7 * e), a = pow(1 - tt, 1.6) * (m ? 0.12 : 0.22);
        // a feathered ring from three stacked strokes (a full-size ring sprite costs ~10 ms of fill)
        g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'butt';
        g.beginPath(); g.arc(HS.x, HS.y, rr * 0.87, 0, TAU);
        g.lineWidth = rr * 0.3; g.strokeStyle = u.hsl(hue, sat, lig, a * 0.2); g.stroke();
        g.lineWidth = rr * 0.16; g.strokeStyle = u.hsl(hue, sat, lig, a * 0.34); g.stroke();
        g.lineWidth = rr * 0.06; g.strokeStyle = u.hsl(hue, sat, lig, a * 0.5); g.stroke();
        g.restore();
      }
    }
  }

  // light of the canopy: a warm glow behind (and a little in front of) the leaves
  function drawCanopyHalo(g, env, front) {
    const { W, H, S } = env;
    const T = F.T;
    const k = ss(138, 150, T) * (1 - 0.35 * SW[3]);
    const night = 1 - F.A;
    const hc = F.apexH * (TR.hT / TR.Htot);
    const x = F.cx, y = F.G - hc * F.ks, rad = TR.crown.rx * F.ks * (0.7 + 0.5 * min(1, F.apexH / TR.Htot));
    g.save(); g.globalCompositeOperation = 'lighter';
    if (!front) {
      const a = (0.1 + 0.4 * night) * k * (0.5 + 0.5 * ss(150, 153, T) + 0.3 * SW[0]) * (1 - 0.8 * ss(151, 153, T));
      u.glow(g, x, y, rad * 0.95, 48, 82, 66, a * 0.55);
    }
    g.restore();
  }

  /* ================================================================== particle seeds */
  function initPart() {
    const r = u.rng(2468);
    PART = { stars: [], clouds: [], glints: [], petals: [], fall: [], snow: [], ff: [], motes: [], rise: [], specks: [], spores: [] };
    for (let i = 0; i < 130; i++) PART.stars.push({ x: r(), y: pow(r(), 0.8) * 0.97, b: r(), ph: r() * TAU });
    for (let i = 0; i < 9; i++) PART.clouds.push({ x: r(), y: 0.1 + r() * 0.85, s: 0.55 + r() * 0.75, k: floor(r() * 3), v: 0.4 + r() * 1.1, a: 0.55 + r() * 0.45 });
    for (let i = 0; i < 26; i++) PART.glints.push({ x: r(), y: r(), s: 0.6 + r() * 1.2, f: 1.2 + r() * 3, ph: r() * TAU });
    for (let i = 0; i < 200; i++) PART.snow.push({ x: r(), y: r(), l: i % 3, s: 0.6 + r() * 0.8, r: r(), ph: r() * TAU });
    for (let i = 0; i < 38; i++) PART.ff.push({ x: r(), y: pow(r(), 0.7), ph: r() * TAU, r: r() });
    for (let i = 0; i < 48; i++) PART.motes.push({ x: r(), y: r(), v: 0.006 + r() * 0.012, ph: r() * TAU, s: 0.5 + r() });
    for (let i = 0; i < 46; i++) PART.specks.push({ x: r(), y: 0.05 + r() * 0.9, ph: r() * TAU, f: 0.4 + r() * 0.9 });
    PART.seeds = [];
    for (let i = 0; i < 18; i++) { const sg = r() < 0.5 ? -1 : 1; PART.seeds.push({ x: sg * (0.14 + r() * 0.5), y: 0.2 + r() * 0.95, s: 0.7 + r() * 0.7, ph: r() * TAU, rot: (r() - 0.5) * 1.2 }); }
    PART.birds = [];
    for (let i = 0; i < 9; i++) PART.birds.push({ t0: 141.2 + r() * 1.4, y: 0.16 + r() * 0.2, dy: (r() - 0.5) * 0.06, sp: 0.2 + r() * 0.05, s: 0.7 + r() * 0.5, ph: r() * 6, off: (r() - 0.5) * 0.05 });
    PART.dust = [];
    for (let i = 0; i < 56; i++) PART.dust.push({ x: r(), y: r(), l: i % 3, ph: r() * TAU, s: 0.6 + r() * 0.8 });
    { const rx = u.rng(8642); for (let i = 0; i < 110; i++) PART.stars.push({ x: rx(), y: pow(rx(), 0.8) * 0.97, b: rx(), ph: rx() * TAU }); }   // extra stars, only used on ultra-wide screens
    for (let i = 0; i < 70; i++) PART.spores.push({ x: r() - 0.5, y: r(), v: 0.012 + r() * 0.03, ph: r() * TAU, s: 0.5 + r() });
  }
  function initLeafParts() {
    const r = u.rng(97531), L = TR.L, B = TR.BL;
    const bls = [], fl = [];
    for (let i = 0; i < B.n; i++) bls.push(i);
    for (let i = 0; i < L.n; i++) if (!L.juv[i] && L.r3[i] < 0.34) fl.push(i);
    PART.petals = []; PART.fall = []; PART.rise = [];
    for (let i = 0; i < 100; i++) PART.petals.push({ li: bls[floor(r() * bls.length)], t0: 138.9 + r() * 4.2, dx: (r() - 0.5) * 0.04, ph: r() * TAU, r: r(), s: 0.7 + r() * 0.7, dz: r() });
    for (const li of fl) PART.fall.push({ li, ph: r() * TAU, r: r(), c: floor(pow(r(), 0.8) * 6) % 6, s: 0.75 + r() * 0.6, dz: r() });
    for (let i = 0; i < 80; i++) PART.rise.push({ li: bls[floor(r() * bls.length)], t0: 150.2 + r() * 6.4, dx: (r() - 0.5) * 0.05, ph: r() * TAU, r: r(), s: 0.7 + r() * 0.7 });
  }

  /* ================================================================== the scene */
  Anim.defineScene({
    id: 's6_tree',

    init(env) {
      buildI(); initPart(); buildSprites();
    },

    resize(env) {
      const { W, H, S } = env;
      GEO = { W, H, S };
      buildCam(env);
      ensureTree(env);
      setupGamma();
      initLeafParts();
      buildHills(env); buildGrass(env); buildSoil(env); buildGlow(env);
      const c = u.canvas(W, H);
      TL = { c, ctx: c.getContext('2d') };
      { const bw = Math.round(W / 2), bh = Math.round(H / 2); const bc = u.canvas(bw, bh); BGL = { c: bc, ctx: bc.getContext('2d') }; }
    },

    fx(T, L) {
      // the hero is pinned (and the bloom constant, like s5's) through the B5 window; it swells only after the cross-fade is over
      const bloom = T < 126.0 ? 0.5 : T < 127.2 ? 0.5 + 0.4 * ss(126.0, 127.2, T) : T < 134 ? u.keys([[127.2, 0.9], [130, 0.8], [134, 0.5]], T, 'spline') : u.keys([[134, 0.5], [140, 0.36], [148, 0.38], [151, 0.5], [153.2, 0.74], [156, 0.78]], T, 'spline');
      return { bloom, vignette: 0.55 - 0.05 * ss(126.5, 129, T) };
    },

    render(g, T, L, env) {
      const { W, H, S } = env;
      frameState(T, env);
      const hs = heroPos(T, env);
      g.fillStyle = '#0b0807'; g.fillRect(0, 0, W, H);
      const above = F.G > -0.04 * H;
      if (above) {
        const b = BGL.ctx;
        // exact W/H -> layer scale (W/2 may be fractional: a 0.5 scale would leave a half-covered, history-dependent last column)
        b.setTransform(BGL.c.width / W, 0, 0, BGL.c.height / H, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
        drawSkyBG(b, env);
        if (F.gam > 0.0004 || T >= CAM.Tb) drawCanopyHalo(b, env, false);
        b.setTransform(1, 0, 0, 1, 0, 0);
        g.imageSmoothingEnabled = false;
        g.drawImage(BGL.c, 0, 0, W, H);
        g.imageSmoothingEnabled = true;
        drawSkyFront(g, env);
        if (T < 152.6) { drawHills(g, env); drawGround(g, env); }
      }
      drawUnder(g, env, hs);
      if (above && T < 152.6) drawGrass(g, env, 0);
      const NL = Anim.shared && Anim.shared.nightLand, nl = ss(150.8, 152.6, T);
      if (NL && nl > 0.004) NL.ground(g, env, { T, alpha: nl });
      const nk = ss(150.9, 153.4, T);
      if (nk > 0.004) NT_API.crown(g, env, { cx: W * 0.5, G: F.G, T, k: nk });
      if (F.gam > 0.0004 || T >= CAM.Tb) {
        drawTree(g, env);
      }
      if (nk > 0.004) NT_API.sparkles(g, env, { cx: W * 0.5, G: F.G, T, k: ss(151.6, 153.8, T) });
      if (NL && nl > 0.004) NL.fore(g, env, { T, alpha: nl });
      if (above) {
        drawGrass(g, env, 1);
        drawFalling(g, env);
        drawBlossoms(g, env);
        drawMotes(g, env); drawSnow(g, env); drawFireflies(g, env); drawRising(g, env);
      }
      drawSeasonPulse(g, env);
      drawHero(g, env);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    },
  });
})();
