/* ひとしずくの旅 — s2_deepsea (T 14–48) 深海
 *
 * The camera rises through the dark water. 18–28 a plankton swarm spirals round the light as if greeting
 * it; 23–40 jellyfish drift past; 28–44 a whale, huge and slow, crosses behind the hero; 36–48 the water
 * brightens, light shafts reach down and a silver school sweeps through. Opens on the B1 world shared with
 * s1_awakening (block below is identical in both files) and ends on the B2 world that s3_surface continues.
 */
(function () {
  const { util: u, hero } = Anim;

  /* ===================== shared "B1 world" (identical in s1 and s2) ===================== */
  const TAU = u.TAU, sstep = u.smoothstep, clamp = u.clamp;
  const BG_TOP = [4, 20, 42], BG_BOT = [1, 4, 9];
  const HAZE_TINT = [20, 105, 125];
  const CAM_DT = 0.05;
  const camV = (t) => 0.02 * sstep(9, 14, t) + 0.03 * sstep(18, 40, t);
  const CAM = new Float32Array(Math.ceil(70 / CAM_DT) + 2);
  (() => { let acc = 0; for (let i = 1; i < CAM.length; i++) { acc += 0.5 * (camV((i - 1) * CAM_DT) + camV(i * CAM_DT)) * CAM_DT; CAM[i] = acc; } })();
  const camY = (T) => { const x = clamp(T, 0, 69.9) / CAM_DT, i = x | 0; return CAM[i] + (CAM[i + 1] - CAM[i]) * (x - i); };

  const dotSpr = () => u.sprite('s12|dot', 64, 64, (c) => {
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(240,255,255,1)'); gr.addColorStop(0.14, 'rgba(170,240,250,0.8)');
    gr.addColorStop(0.4, 'rgba(70,180,210,0.2)'); gr.addColorStop(1, 'rgba(30,120,170,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  });
  const bokehSpr = () => u.sprite('s12|bokeh', 96, 96, (c) => {
    const gr = c.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, 'rgba(120,210,230,0.55)'); gr.addColorStop(0.6, 'rgba(110,200,225,0.6)');
    gr.addColorStop(0.82, 'rgba(150,225,240,0.85)'); gr.addColorStop(0.93, 'rgba(110,200,225,0.25)'); gr.addColorStop(1, 'rgba(90,180,210,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 96, 96);
  });

  const HZ = { cols: 0, rows: 0, cv: null, cx: null, img: null, dith: null };
  function hazeSetup(env) {
    const n = 2000;
    HZ.cols = Math.max(24, Math.round(Math.sqrt(n * env.W / env.H)));
    HZ.rows = Math.max(24, Math.round(Math.sqrt(n * env.H / env.W)));
    HZ.cv = u.canvas(HZ.cols, HZ.rows); HZ.cx = HZ.cv.getContext('2d');
    HZ.img = HZ.cx.createImageData(HZ.cols, HZ.rows);
    HZ.dith = new Float32Array(HZ.cols * HZ.rows);
    const r = u.rng(777);
    for (let i = 0; i < HZ.dith.length; i++) HZ.dith[i] = r() - 0.5;
  }
  /** teal volumetric haze: low-res fbm field, brightest around (hx,hy) (normalised), drawn additively */
  function hazeDraw(g, env, T, amp, tint, hx, hy, spread) {
    if (amp <= 0.002) return;
    const { W, H, S } = env, cols = HZ.cols, rows = HZ.rows, d = HZ.img.data;
    const t1 = T * 0.021, t2 = T * 0.017;
    let p = 0, q = 0;
    for (let j = 0; j < rows; j++) {
      const yy = ((j + 0.5) / rows * H - hy * H) / S;
      for (let i = 0; i < cols; i++) {
        const xx = ((i + 0.5) / cols * W - hx * W) / S;
        const wx = xx + 0.22 * (u.noise2(xx * 1.1 + t1 * 1.7 + 5.3, yy * 1.1 + 2.1) - 0.5);
        const wy = yy + 0.22 * (u.noise2(xx * 1.1 + 9.7, yy * 1.1 - t2 * 1.9 + 4.4) - 0.5);
        const xr = wx * 0.866 - wy * 0.5, yr = wx * 0.5 + wy * 0.866;
        const n = u.fbm2(xr * 1.7 + t1 + 3.1, yr * 1.7 - t2 + 7.7, 2);
        const s = clamp((n - 0.3) / 0.45);
        const d2 = xx * xx + yy * yy;
        const I = amp * (Math.exp(-d2 * spread) * (0.5 + 0.75 * s) + 0.40 * Math.exp(-Math.sqrt(d2) * 1.05) * (0.30 + 0.85 * s));
        const dz = HZ.dith[q++];
        d[p++] = tint[0] * I + dz; d[p++] = tint[1] * I + dz; d[p++] = tint[2] * I + dz; d[p++] = 255;
      }
    }
    HZ.cx.putImageData(HZ.img, 0, 0);
    g.save();
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.globalAlpha = 1;
    g.drawImage(HZ.cv, 0, 0, W, H);
    g.restore();
  }

  /** low-res "light layer": opaque background / haze / glows are painted at ~1/3 resolution and blitted once (cheap) */
  const LLC = { cv: null, g: null, w: 0, h: 0 };
  function llSetup(env) {
    const k = Math.min(0.5, 340 / Math.max(env.W, env.H));
    LLC.w = Math.max(16, Math.round(env.W * k)); LLC.h = Math.max(16, Math.round(env.H * k));
    LLC.cv = u.canvas(LLC.w, LLC.h); LLC.g = LLC.cv.getContext('2d', { alpha: false });
  }
  /** begin: returns the layer context with a transform so that full-resolution coordinates can be used */
  function llBegin(env) {
    const q = LLC.g;
    q.setTransform(LLC.w / env.W, 0, 0, LLC.h / env.H, 0, 0);
    q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
    return q;
  }
  function llEnd(g, env) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true;
    g.drawImage(LLC.cv, 0, 0, env.W, env.H);
    g.restore();
  }

  let MO = null, BK = null;
  function worldSetup(env) {
    llSetup(env);
    const { W, H, S } = env;
    const Wd = W / S + 0.5, Hd = H / S + 0.5;
    const N = Math.min(360, Math.round(78 * Wd * Hd));
    MO = { N, Wd, Hd, x0: new Float32Array(N), y0: new Float32Array(N), z: new Float32Array(N), ph: new Float32Array(N), vx: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
      MO.x0[i] = (u.hash2(i, 1) - 0.5) * Wd; MO.y0[i] = (u.hash2(i, 2) - 0.5) * Hd;
      MO.z[i] = u.hash2(i, 3); MO.ph[i] = u.hash2(i, 4) * TAU; MO.vx[i] = (u.hash2(i, 5) - 0.5) * 0.006;
    }
    const nb = 10, Wb = W / S + 0.3, Hb = H / S + 0.3;
    BK = { N: nb, Wb, Hb, x0: [], y0: [], sz: [], al: [], ph: [] };
    for (let i = 0; i < nb; i++) {
      BK.x0.push((u.hash2(i, 41) - 0.5) * Wb); BK.y0.push((u.hash2(i, 42) - 0.5) * Hb);
      BK.sz.push(0.03 + 0.045 * u.hash2(i, 43)); BK.al.push(0.035 + 0.04 * u.hash2(i, 44)); BK.ph.push(u.hash2(i, 45) * TAU);
    }
  }
  /** mote i position in S units relative to the screen centre */
  const moteX = (i, T) => u.wrap(MO.x0[i] + MO.vx[i] * T + 0.012 * (0.55 + 0.9 * MO.z[i]) * Math.sin(T * 0.21 + MO.ph[i]), -MO.Wd / 2, MO.Wd / 2);
  const moteY = (i, T) => u.wrap(MO.y0[i] + (0.55 + 0.9 * MO.z[i]) * camY(T) + 0.004 * Math.sin(T * 0.17 + MO.ph[i] * 1.3), -MO.Hd / 2, MO.Hd / 2);
  /* ================================ end shared block ================================ */

  /* ====================================== s2 =========================================== */
  const lerp = u.lerp;
  const WTOP = [[14, [4, 20, 42]], [20, [5, 26, 48]], [27, [7, 34, 58]], [33, [9, 46, 74]], [39, [12, 78, 106]], [44, [15, 104, 136]]];
  const WBOT = [[14, [1, 4, 9]], [20, [2, 7, 15]], [27, [3, 12, 23]], [33, [4, 18, 32]], [39, [5, 31, 50]], [44, [6, 41, 62]]];

  const heroY = (T) => 0.5 + 0.06 * sstep(30, 44, T);

  /* ---------- sprites ---------- */
  const spr = {};
  const TK = 0.64;
  function buildSprites() {
    spr.dot = dotSpr();
    spr.bokeh = bokehSpr();
    spr.teal = u.sprite('s2|dotteal', 64, 64, (c) => {
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(235,255,245,1)'); gr.addColorStop(0.14, 'rgba(150,250,215,0.8)');
      gr.addColorStop(0.4, 'rgba(60,200,170,0.2)'); gr.addColorStop(1, 'rgba(30,150,140,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    });
    spr.shaft = u.sprite('s2|shaft', 128, 512, (c, w, h) => {
      const gx = c.createLinearGradient(0, 0, w, 0);
      gx.addColorStop(0, 'rgba(190,240,255,0)'); gx.addColorStop(0.3, 'rgba(190,240,255,0.32)');
      gx.addColorStop(0.5, 'rgba(220,250,255,0.85)'); gx.addColorStop(0.7, 'rgba(190,240,255,0.32)'); gx.addColorStop(1, 'rgba(190,240,255,0)');
      c.fillStyle = gx; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'destination-in';
      const gy = c.createLinearGradient(0, 0, 0, h);
      gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.07, 'rgba(0,0,0,1)'); gy.addColorStop(0.42, 'rgba(0,0,0,0.42)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gy; c.fillRect(0, 0, w, h);
    });
    // tight versions of the two mote sprites: the same core and halo, compressed so that the faint outer tail is cut (drawn at TK x the radius) -> ~60% less fill
    spr.dotT = u.sprite('s2|dotT', 48, 48, (c) => {
      const gr = c.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, 'rgba(240,255,255,1)'); gr.addColorStop(0.14 / TK, 'rgba(170,240,250,0.8)');
      gr.addColorStop(0.4 / TK, 'rgba(70,180,210,0.22)'); gr.addColorStop(1, 'rgba(30,120,170,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 48, 48);
    });
    spr.tealT = u.sprite('s2|tealT', 48, 48, (c) => {
      const gr = c.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, 'rgba(235,255,245,1)'); gr.addColorStop(0.14 / TK, 'rgba(150,250,215,0.8)');
      gr.addColorStop(0.4 / TK, 'rgba(60,200,170,0.22)'); gr.addColorStop(1, 'rgba(30,150,140,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 48, 48);
    });
    // fish: tapered body, forked tail at the left, bright back and a glint near the head (drawn heading +x)
    spr.fish = u.sprite('s2|fish2', 64, 16, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(200,228,248,0)'); gr.addColorStop(0.22, 'rgba(215,238,252,0.55)'); gr.addColorStop(0.6, 'rgba(240,252,255,0.95)'); gr.addColorStop(0.9, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(230,245,255,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(w * 0.99, h * 0.5);
      c.bezierCurveTo(w * 0.88, h * 0.16, w * 0.60, h * 0.13, w * 0.30, h * 0.44);
      c.lineTo(w * 0.02, h * 0.10); c.quadraticCurveTo(w * 0.12, h * 0.5, w * 0.02, h * 0.90); c.lineTo(w * 0.30, h * 0.56);
      c.bezierCurveTo(w * 0.60, h * 0.87, w * 0.88, h * 0.84, w * 0.99, h * 0.5);
      c.fill();
      c.globalCompositeOperation = 'lighter';
      const lg = c.createLinearGradient(0, h * 0.2, 0, h * 0.5);
      lg.addColorStop(0, 'rgba(255,255,255,0.55)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = lg; c.beginPath(); c.ellipse(w * 0.66, h * 0.34, w * 0.2, h * 0.12, 0, 0, TAU); c.fill();
    });
    spr.bubble = u.sprite('s2|bubble', 48, 48, (c) => {
      const gr = c.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, 'rgba(150,220,240,0.04)'); gr.addColorStop(0.62, 'rgba(150,225,245,0.10)'); gr.addColorStop(0.86, 'rgba(210,248,255,0.62)'); gr.addColorStop(0.95, 'rgba(160,230,248,0.20)'); gr.addColorStop(1, 'rgba(150,225,245,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 48, 48);
      const hg = c.createRadialGradient(16, 15, 0, 16, 15, 7);
      hg.addColorStop(0, 'rgba(255,255,255,0.9)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg; c.fillRect(0, 0, 48, 48);
    });
  }

  /* ---------- plankton swarm data (resolution independent) ---------- */
  const NP = 330;
  const PK = { a: new Uint8Array(NP), p: new Float32Array(NP), j1: new Float32Array(NP), j2: new Float32Array(NP), ph: new Float32Array(NP), sz: new Float32Array(NP), ang: new Float32Array(NP), teal: new Uint8Array(NP), dsp: new Float32Array(NP) };
  /* extra marine snow that thickens towards B2 */
  const NS = 170;
  const SN = { x0: new Float32Array(NS), y0: new Float32Array(NS), z: new Float32Array(NS), ph: new Float32Array(NS), t: new Float32Array(NS) };
  /* flashers */
  const NF = 28;
  const FL = { x: new Float32Array(NF), y: new Float32Array(NF), per: new Float32Array(NF), ph: new Float32Array(NF), sz: new Float32Array(NF) };
  /* fish */
  const NFISH = 110;
  const FS = { a: new Float32Array(NFISH), b: new Float32Array(NFISH), ph: new Float32Array(NFISH), sz: new Float32Array(NFISH), sp: new Float32Array(NFISH) };
  /* the surge before B2: a nearer school, falling streaks, rising bubbles */
  const NFS2 = 34, NSK = 34, NBB = 12;
  const FS2 = { a: new Float32Array(NFS2), b: new Float32Array(NFS2), ph: new Float32Array(NFS2), sz: new Float32Array(NFS2) };
  const SKS = { x0: new Float32Array(NSK), y0: new Float32Array(NSK), z: new Float32Array(NSK) };
  const BUB = { x0: new Float32Array(NBB), y0: new Float32Array(NBB), r: new Float32Array(NBB), v: new Float32Array(NBB), ph: new Float32Array(NBB) };
  /* whale trail glints */
  const NTR = 44;

  /* ---------- jellyfish layout ---------- */
  // t0,t1 life; p0->p1 path in S units from screen centre (landscape reference); R bell radius (S); hue; z layer 0 far,1 mid,2 near
  const JBASE = [
    { t0: 21.0, t1: 37.5, p0: [-0.66, 0.78], p1: [-0.40, -0.70], R: 0.135, hue: 312, z: 2, ph: 0.0 },
    { t0: 22.0, t1: 36.5, p0: [0.58, 0.86], p1: [0.50, -0.62], R: 0.105, hue: 192, z: 1, ph: 0.7 },
    { t0: 23.0, t1: 35.5, p0: [0.24, 1.0], p1: [0.18, -0.55], R: 0.075, hue: 268, z: 1, ph: 1.4 },
    { t0: 24.0, t1: 36.0, p0: [-0.26, 0.95], p1: [-0.16, -0.60], R: 0.062, hue: 335, z: 1, ph: 0.3 },
    { t0: 24.5, t1: 38.5, p0: [0.98, 1.0], p1: [0.82, -0.50], R: 0.19, hue: 278, z: 2, ph: 1.0, soft: true },
    { t0: 21.5, t1: 34.0, p0: [-0.92, 0.40], p1: [-0.80, -0.50], R: 0.034, hue: 188, z: 0, ph: 0.2 },
    { t0: 22.5, t1: 33.5, p0: [0.92, 0.55], p1: [0.74, -0.30], R: 0.030, hue: 300, z: 0, ph: 1.1 },
    { t0: 23.5, t1: 35.0, p0: [0.05, 0.12], p1: [0.0, -0.62], R: 0.038, hue: 200, z: 0, ph: 0.6 },
  ];
  let JEL = JBASE;

  /* ---------- whale ---------- */
  const WH = { cv: null, cw: 0, ch: 0, sc: 0.5, L: 0, oy: 0 };
  // outline control points in body space: x 0 (tail tip) .. 1 (nose), y in units of body length (+ down)
  const TOP = [[1.0, 0.021], [0.995, 0.009], [0.985, -0.001], [0.965, -0.011], [0.94, -0.021], [0.91, -0.031], [0.88, -0.042], [0.845, -0.052], [0.80, -0.061], [0.75, -0.069], [0.69, -0.075], [0.61, -0.077], [0.52, -0.072], [0.44, -0.062], [0.375, -0.051], [0.340, -0.046], [0.318, -0.054], [0.298, -0.048], [0.265, -0.039], [0.21, -0.031], [0.15, -0.026], [0.10, -0.022]];
  const BOT = [[1.0, 0.030], [0.996, 0.038], [0.985, 0.048], [0.965, 0.060], [0.94, 0.072], [0.90, 0.084], [0.86, 0.092], [0.82, 0.096], [0.76, 0.097], [0.70, 0.094], [0.62, 0.086], [0.53, 0.075], [0.44, 0.061], [0.36, 0.048], [0.28, 0.037], [0.20, 0.029], [0.14, 0.024], [0.10, 0.020]];
  const topY = (xn) => ptsY(TOP, xn), botY = (xn) => ptsY(BOT, xn);
  function ptsY(P, xn) { // P sorted x descending, linear interpolation
    if (xn >= P[0][0]) return P[0][1];
    for (let i = 0; i < P.length - 1; i++) if (xn <= P[i][0] && xn >= P[i + 1][0]) { const f = (P[i][0] - xn) / (P[i][0] - P[i + 1][0]); return P[i][1] + (P[i + 1][1] - P[i][1]) * f; }
    return P[P.length - 1][1];
  }
  function trace(c, P, X, Y, rev) { // catmull-rom through points -> bezier (current point must be the first point)
    const n = P.length, pts = rev ? P.slice().reverse() : P;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      c.bezierCurveTo(X(p1[0] + (p2[0] - p0[0]) / 6), Y(p1[1] + (p2[1] - p0[1]) / 6), X(p2[0] - (p3[0] - p1[0]) / 6), Y(p2[1] - (p3[1] - p1[1]) / 6), X(p2[0]), Y(p2[1]));
    }
  }
  /** sample the dorsal spline (same Catmull-Rom as the drawn outline) -> flat [x,y,...] in body space */
  function rimPoints() {
    const out = [], n = TOP.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = TOP[Math.max(0, i - 1)], p1 = TOP[i], p2 = TOP[i + 1], p3 = TOP[Math.min(n - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      for (let k = 0; k < 4; k++) {
        const t = k / 4, mt = 1 - t;
        out.push(mt * mt * mt * p1[0] + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p2[0], mt * mt * mt * p1[1] + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p2[1]);
      }
    }
    out.push(TOP[n - 1][0], TOP[n - 1][1]);
    return out;
  }
  const RIM = rimPoints();
  function whalePath(c, X, Y) {
    c.beginPath();
    c.moveTo(X(1.0), Y(BOT[0][1]));
    c.quadraticCurveTo(X(1.006), Y((BOT[0][1] + TOP[0][1]) / 2), X(1.0), Y(TOP[0][1]));
    trace(c, TOP, X, Y, false);
    // flukes: curved blades with a median notch; near blade large and swept up, far blade foreshortened (3/4 view)
    c.bezierCurveTo(X(0.080), Y(-0.030), X(0.052), Y(-0.058), X(0.014), Y(-0.097));
    c.bezierCurveTo(X(0.030), Y(-0.082), X(0.040), Y(-0.034), X(0.057), Y(-0.002));
    c.bezierCurveTo(X(0.050), Y(0.012), X(0.030), Y(0.040), X(0.016), Y(0.061));
    c.bezierCurveTo(X(0.040), Y(0.052), X(0.074), Y(0.036), X(0.10), Y(0.020));
    trace(c, BOT, X, Y, true);
    c.closePath();
  }
  /** pectoral fin in its own frame: root at the origin, pointing down (+y), curving back (-x); length in body lengths */
  function finPath(c, L) {
    c.beginPath();
    c.moveTo(L * 0.016, -L * 0.012);
    c.bezierCurveTo(L * 0.026, L * 0.028, L * 0.014, L * 0.074, -L * 0.026, L * 0.134);
    c.quadraticCurveTo(-L * 0.040, L * 0.140, -L * 0.040, L * 0.126);
    c.bezierCurveTo(-L * 0.048, L * 0.084, -L * 0.044, L * 0.038, -L * 0.036, -L * 0.006);
    c.closePath();
  }
  function buildWhale(env) {
    const { W, H, S } = env;
    const L = Math.min(Math.max(1.5 * W, 2.4 * S), 4.2 * H, 3400);   // never shorter than 1.5 W (or 2.4 S in portrait)
    const sc = Math.min(0.62, 1.3 * LLC.w / W);                       // the body is painted into the low-res layer: cache it at ~that resolution (avoids aliasing from big down-scales)
    WH.L = L; WH.sc = sc;
    WH.cw = Math.ceil(L * sc); WH.ch = Math.ceil(L * 0.24 * sc); WH.oy = Math.round(0.128 * L * sc);
    const cw = WH.cw, ch = WH.ch, Ls = L * sc;
    const cv = u.canvas(cw, ch), c = cv.getContext('2d');
    const X = (x) => x * cw, Y = (y) => WH.oy + y * Ls;
    const fillBody = (ctx, XX, YY) => {
      const gr = ctx.createLinearGradient(0, YY(-0.085), 0, YY(0.10));
      gr.addColorStop(0, 'rgba(12,38,58,0.97)'); gr.addColorStop(0.28, 'rgba(4,18,32,0.985)'); gr.addColorStop(0.6, 'rgba(3,13,25,0.985)'); gr.addColorStop(0.86, 'rgba(9,32,50,0.975)'); gr.addColorStop(1, 'rgba(18,56,80,0.96)');
      ctx.fillStyle = gr;
      whalePath(ctx, XX, YY);
      ctx.fill();
    };
    // soft pass: draw tiny, upscale => penumbra
    const k = 0.22;
    const sw = Math.ceil(cw * k), sh = Math.ceil(ch * k);
    const small = u.canvas(sw, sh), s = small.getContext('2d');
    fillBody(s, (x) => x * sw, (y) => WH.oy * k + y * Ls * k);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(small, 0, 0, cw, ch);
    c.globalAlpha = 0.7;
    fillBody(c, X, Y);
    c.globalAlpha = 1;
    // details clipped to the body
    c.save();
    whalePath(c, X, Y); c.clip();
    // ventral pleats: grooves run from the chin back towards the navel, following the belly curve
    c.lineWidth = Math.max(1, Ls * 0.0016);
    for (let i = 0; i < 16; i++) {
      const x0 = 0.985 - 0.04 * u.hash2(i, 201), x1 = 0.46 + 0.22 * u.hash2(i, 202);
      const pg = c.createLinearGradient(X(x1), 0, X(x0), 0);
      const pa = 0.05 + 0.04 * u.hash2(i, 203);
      pg.addColorStop(0, 'rgba(150,215,238,0)'); pg.addColorStop(0.3, `rgba(150,215,238,${pa})`); pg.addColorStop(0.85, `rgba(150,215,238,${pa * 0.8})`); pg.addColorStop(1, 'rgba(150,215,238,0)');
      c.strokeStyle = pg;
      c.beginPath();
      for (let x = x0, f = true; x >= x1; x -= 0.015) { const yb = botY(x), yt = topY(x); const y = yb - (yb - yt) * (0.035 + 0.019 * i) + Math.sin(x * 40 + i) * 0.0016; if (f) { c.moveTo(X(x), Y(y)); f = false; } else c.lineTo(X(x), Y(y)); }
      c.stroke();
    }
    // mottling on the flanks (pale scars / barnacle patches)
    for (let i = 0; i < 70; i++) {
      const xn = 0.14 + 0.82 * u.hash2(i, 211), yb = botY(xn), yt = topY(xn), yn = yt + (yb - yt) * (0.18 + 0.55 * u.hash2(i, 212));
      c.fillStyle = `rgba(110,170,195,${0.025 + 0.035 * u.hash2(i, 213)})`;
      c.beginPath(); c.ellipse(X(xn), Y(yn), Ls * (0.006 + 0.012 * u.hash2(i, 214)), Ls * (0.002 + 0.004 * u.hash2(i, 215)), (u.hash2(i, 216) - 0.5) * 0.6, 0, TAU); c.fill();
    }
    // soft sheen along the back, fading towards head and tail (moonlight from above)
    const dg = c.createLinearGradient(0, Y(-0.085), 0, Y(-0.005));
    dg.addColorStop(0, 'rgba(90,175,205,0.30)'); dg.addColorStop(0.35, 'rgba(80,160,190,0.10)'); dg.addColorStop(1, 'rgba(80,160,190,0)');
    c.fillStyle = dg; c.fillRect(0, Y(-0.085), cw, Y(-0.005) - Y(-0.085));
    // lighter belly / throat
    const bgr = c.createLinearGradient(0, Y(0.03), 0, Y(0.1));
    bgr.addColorStop(0, 'rgba(120,190,215,0)'); bgr.addColorStop(1, 'rgba(120,190,215,0.10)');
    c.fillStyle = bgr; c.fillRect(X(0.40), Y(0.03), cw, Y(0.1) - Y(0.03));
    // mouth line: from the tip, along the lower jaw, curling up at the corner under the eye
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(125,205,230,0.34)'; c.lineWidth = Math.max(1, Ls * 0.0026);
    c.beginPath(); c.moveTo(X(0.997), Y(0.032)); c.bezierCurveTo(X(0.95), Y(0.046), X(0.88), Y(0.056), X(0.81), Y(0.046)); c.quadraticCurveTo(X(0.785), Y(0.040), X(0.776), Y(0.028)); c.stroke();
    // lower-jaw edge light
    c.strokeStyle = 'rgba(120,195,220,0.12)'; c.lineWidth = Math.max(1, Ls * 0.0035);
    c.beginPath(); c.moveTo(X(0.99), Y(0.046)); c.bezierCurveTo(X(0.96), Y(0.068), X(0.91), Y(0.086), X(0.84), Y(0.094)); c.stroke();
    c.restore();
    WH.cv = cv;
  }
  /** vertical displacement (in body lengths) at body coordinate xn (0 tail .. 1 head) */
  const whaleWave = (xn, T) => {
    const f = 1 - xn;
    return 0.05 * Math.pow(f, 1.7) * Math.sin(TAU * (f * 0.6 - T / 6.4)) - 0.08 * xn * (1 - xn) * (0.7 + 0.3 * Math.sin(T * 0.17)) + 0.012 * (xn - 0.5) * Math.sin(T * 0.21);
  };
  const WHALE_T0 = 27, WHALE_V = 0.0867;              // head speed in body lengths per second
  /** the whale glides, then flicks away to the right (faster) so that it has left the frame by ~43 s */
  const whaleHead = (T, L) => (T - WHALE_T0) * WHALE_V * L + 0.46 * L * sstep(35.5, 43.8, T);
  const whaleAxis = (T, H) => H * (0.46 + 0.012 * (T - 35));

  Anim.defineScene({
    id: 's2_deepsea',

    init(env) {
      buildSprites();
      for (let i = 0; i < NP; i++) {
        PK.a[i] = i % 3; PK.p[i] = ((i / 3 | 0) + 0.7 * u.hash2(i, 11)) / (NP / 3); PK.j1[i] = u.hash2(i, 12) - 0.5; PK.j2[i] = u.hash2(i, 13) - 0.5;
        PK.ph[i] = u.hash2(i, 14) * TAU; PK.sz[i] = 0.5 + u.hash2(i, 15); PK.ang[i] = u.hash2(i, 16) * TAU; PK.teal[i] = u.hash2(i, 17) < 0.35 ? 1 : 0; PK.dsp[i] = 0.5 + u.hash2(i, 18);
      }
      for (let i = 0; i < NS; i++) { SN.x0[i] = u.hash2(i, 21) - 0.5; SN.y0[i] = u.hash2(i, 22) - 0.5; SN.z[i] = u.hash2(i, 23); SN.ph[i] = u.hash2(i, 24) * TAU; SN.t[i] = u.hash2(i, 25); }
      for (let i = 0; i < NF; i++) { FL.x[i] = u.hash2(i, 31) - 0.5; FL.y[i] = u.hash2(i, 32) - 0.5; FL.per[i] = 2.6 + 4 * u.hash2(i, 33); FL.ph[i] = u.hash2(i, 34) * 10; FL.sz[i] = 0.5 + u.hash2(i, 35); }
      for (let i = 0; i < NFS2; i++) { FS2.a[i] = u.hash2(i, 151) + u.hash2(i, 152) - 1; FS2.b[i] = u.hash2(i, 153) + u.hash2(i, 154) - 1; FS2.ph[i] = u.hash2(i, 155) * TAU; FS2.sz[i] = 0.7 + 0.7 * u.hash2(i, 156); }
      for (let i = 0; i < NSK; i++) { SKS.x0[i] = u.hash2(i, 161) - 0.5; SKS.y0[i] = u.hash2(i, 162) - 0.5; SKS.z[i] = u.hash2(i, 163); }
      for (let i = 0; i < NBB; i++) { BUB.x0[i] = u.hash2(i, 171) - 0.5; BUB.y0[i] = u.hash2(i, 172); BUB.r[i] = 0.006 + 0.011 * u.hash2(i, 173) * u.hash2(i, 173); BUB.v[i] = 0.05 + 0.05 * u.hash2(i, 174); BUB.ph[i] = u.hash2(i, 175) * TAU; }
      for (let i = 0; i < NFISH; i++) { FS.a[i] = (u.hash2(i, 51) + u.hash2(i, 52) - 1); FS.b[i] = (u.hash2(i, 53) + u.hash2(i, 54) - 1); FS.ph[i] = u.hash2(i, 55) * TAU; FS.sz[i] = 0.6 + 0.8 * u.hash2(i, 56); FS.sp[i] = 0.8 + 0.4 * u.hash2(i, 57); }
    },

    resize(env) {
      buildSprites(); hazeSetup(env); worldSetup(env); buildWhale(env);
      const { W, H, S } = env;
      const sx = clamp(W / S / 1.78, 0.75, 1.5), sy = Math.max(1, 0.9 * H / S);
      JEL = JBASE.map((j) => Object.assign({}, j, { p0: [j.p0[0] * sx, j.p0[1] * sy], p1: [j.p1[0] * sx, j.p1[1] * sy] }));
      if (W / S > 2.0) {
        JEL.push({ t0: 24.5, t1: 40.0, p0: [-1.18, 0.9], p1: [-1.02, -0.6], R: 0.09, hue: 198, z: 1, ph: 0.9 });
        JEL.push({ t0: 25.5, t1: 40.5, p0: [1.28, 0.9], p1: [1.12, -0.6], R: 0.10, hue: 315, z: 1, ph: 0.2 });
      }
      if (H / S > 1.4) {
        JEL.push({ t0: 23.5, t1: 38.0, p0: [0.34, 1.5], p1: [0.28, 0.45], R: 0.085, hue: 205, z: 1, ph: 1.2 });
        JEL.push({ t0: 26.0, t1: 40.0, p0: [-0.30, 1.7], p1: [-0.32, 0.7], R: 0.10, hue: 290, z: 1, ph: 0.4 });
        JEL.push({ t0: 24.0, t1: 37.0, p0: [0.30, -0.1], p1: [0.22, -1.0], R: 0.045, hue: 320, z: 0, ph: 0.8 });
      }
      buildBells(env);
    },

    fx(T, L) { return { bloom: u.lerp(0.8, 0.55, sstep(30, 44, T)) }; },

    render(g, T, L, env) {
      const { W, H, S } = env;
      const cx = W * 0.5, hY = heroY(T), cy = H * hY;
      jellyPoses(T, env);

      /* ===== low-res layer: water, haze, glows, shafts, mist, halos (one cheap blit) ===== */
      {
        const q = llBegin(env);
        const top = u.keyc(WTOP, T), bot = u.keyc(WBOT, T);
        const m = (f) => u.css(u.mixc(top, bot, f));
        u.vgrad(q, W, H, [[0, u.css(top)], [0.3, m(0.24)], [0.65, m(0.64)], [1, u.css(bot)]]);
        const hzTint = u.mixc(HAZE_TINT, [28, 150, 176], sstep(18, 44, T));
        hazeDraw(q, env, T, lerp(0.21, 0.0, sstep(18, 44, T)), hzTint, 0.5, hY, 3.2);
        q.globalCompositeOperation = 'lighter';
        // broad soft brightening from the upper left (the surface is far above)
        const bright = sstep(24, 46, T);
        if (bright > 0.01) {
          u.glow(q, W * 0.15, -H * 0.06, Math.max(W, H) * 0.95, 180, 70, 55, 0.085 * bright, 'soft');
          u.glow(q, W * 0.78, H * 0.05, Math.max(W, H) * 0.7, 192, 70, 38, 0.04 * bright, 'soft');
        }
        // light shafts, 15 degrees off vertical, from the upper left (fade in from ~34)
        const sh = sstep(34, 46, T);
        if (sh > 0.005) {
          const len = H * 1.7;
          for (let k = 0; k < 4; k++) {
            const xT = (k === 0 ? 0.15 : 0.26 + 0.2 * k) * W + 0.045 * W * Math.sin(T * 0.15 + k * 2.1);
            const wd = S * (k === 0 ? 0.12 : 0.26 + 0.05 * (k % 2));
            q.save();
            q.translate(xT, -H * 0.12);
            q.rotate(-0.24 + 0.025 * Math.sin(T * 0.09 + k * 1.3));
            q.globalAlpha = sh * (1 + 0.45 * sstep(38, 44, T)) * (k === 0 ? 0.10 : 0.034 + 0.01 * k) * (0.75 + 0.25 * Math.sin(T * 0.23 + k * 1.9));
            q.drawImage(spr.shaft, -wd / 2, 0, wd, len);
            q.restore();
          }
        }
        // faint out-of-focus discs close to the camera
        for (let i = 0; i < BK.N; i++) {
          const x = u.wrap(BK.x0[i] + 0.01 * Math.sin(T * 0.11 + BK.ph[i]), -BK.Wb / 2, BK.Wb / 2);
          const y = u.wrap(BK.y0[i] + 1.9 * camY(T), -BK.Hb / 2, BK.Hb / 2);
          const rr = BK.sz[i] * S;
          q.globalAlpha = 0.9 * BK.al[i] * (0.7 + 0.3 * Math.sin(T * 0.4 + BK.ph[i])) * (1 - 0.5 * sstep(30, 46, T));
          q.drawImage(spr.bokeh, cx + x * S - rr, H * 0.5 + y * S - rr, rr * 2, rr * 2);
        }
        q.globalAlpha = 1;
        // whale: backlit mist + wake glow
        whaleGlow(q, T, env);
        // the whale's body lives in the low-res layer too: distant, soft, dark
        whaleBody(q, T, env);
        // plankton stream haze
        const sw = sstep(17.2, 20.5, T) * (1 - sstep(24.5, 28.5, T));
        if (sw > 0.003) { q.globalAlpha = sw * 0.25; const R = S * 0.55; q.drawImage(spr.dot, cx - R, cy - R * 0.8, R * 2, R * 1.6); q.globalAlpha = 1; }
        // jellyfish halos
        for (let i = 0; i < NPOSE; i++) { const p = POSE[i]; if (p.j.z === 0 || p.y - 3.4 * p.R > H || p.y + 3.4 * p.R < 0 || p.x + 3.4 * p.R < 0 || p.x - 3.4 * p.R > W) continue; u.glow(q, p.x, p.y - p.h * 0.3, p.R * 3.2, p.j.hue, 85, 52, 0.20 * p.dim, 'soft'); u.glow(q, p.x, p.y - p.h * 0.5, p.R * 0.7, p.j.hue + 10, 80, 70, 0.16 * p.dim * (0.75 + 0.5 * p.c), 'soft'); }
        // shimmer at the very top edge (the surface, far above)
        const ta = sstep(36, 46, T);
        if (ta > 0.01) {
          const hh = H * 0.16;
          const gr = q.createLinearGradient(0, 0, 0, hh);
          gr.addColorStop(0, `rgba(120,215,235,${0.09 * ta})`); gr.addColorStop(1, 'rgba(120,215,235,0)');
          q.fillStyle = gr; q.fillRect(0, 0, W, hh);
          for (let i = 0; i < 16; i++) {
            const x = u.wrap((u.hash2(i, 81) * 1.3 - 0.15) * W + Math.sin(T * 0.3 + i) * 0.05 * W + T * 0.012 * W, -0.1 * W, 1.1 * W);
            const y = (0.01 + 0.07 * u.hash2(i, 82)) * H;
            const w2 = S * (0.10 + 0.16 * u.hash2(i, 83));
            q.globalAlpha = ta * (0.06 + 0.08 * Math.pow(0.5 + 0.5 * Math.sin(T * (0.7 + u.hash2(i, 84)) + i * 2.3), 2));
            q.drawImage(spr.dot, x - w2, y - w2 * 0.06, w2 * 2, w2 * 0.12);
          }
          q.globalAlpha = 1;
        }
        llEnd(g, env);
      }

      const dotS = spr.dot;
      const hLit = sstep(18, 24, T);
      g.save();
      g.globalCompositeOperation = 'lighter';

      /* ---- far marine snow (the far half of the shared B1 motes) ---- */
      {
        const N = MO.N;
        for (let i = 0; i < N; i++) {
          const z = MO.z[i];
          if (z > 0.55) continue;
          const mx = cx + moteX(i, T) * S, my = H * 0.5 + moteY(i, T) * S;
          const hl = heroLight(mx - cx, my - cy, S, hLit);
          const r = S * (0.0016 + 0.0036 * z) * 2.4 * (1 + 0.5 * hl);
          g.globalAlpha = (0.16 + 0.34 * z) * (0.6 + 0.4 * Math.sin(T * (0.5 + MO.ph[i] * 0.2) + MO.ph[i])) * (1 + 1.1 * hl);
          g.drawImage(dotS, mx - r, my - r, r * 2, r * 2);
        }
      }
      g.restore();

      drawJellies(g, T, env, 0);        // far jellyfish
      drawFish(g, T, env);              // fish school (mid-far)
      drawWhale(g, T, env, cx, cy);     // the whale

      g.save();
      g.globalCompositeOperation = 'lighter';
      /* ---- near marine snow, thickening snow, flashes ---- */
      {
        const N = MO.N;
        for (let i = 0; i < N; i++) {
          const z = MO.z[i];
          if (z <= 0.55) continue;
          const mx = cx + moteX(i, T) * S, my = H * 0.5 + moteY(i, T) * S;
          const hl = heroLight(mx - cx, my - cy, S, hLit);
          const r = S * (0.0016 + 0.0036 * z) * 2.4 * (1 + 0.5 * hl);
          g.globalAlpha = (0.16 + 0.34 * z) * (0.6 + 0.4 * Math.sin(T * (0.5 + MO.ph[i] * 0.2) + MO.ph[i])) * (1 + 1.1 * hl);
          g.drawImage(dotS, mx - r, my - r, r * 2, r * 2);
        }
        const sa = sstep(28, 46, T);
        if (sa > 0.01) {
          const Wd = MO.Wd, Hd = MO.Hd;
          const lowCol = sstep(36, 46, T);
          for (let i = 0; i < NS; i++) {
            const z = SN.z[i];
            if (SN.t[i] > sa) continue;
            const zf = 0.5 + 1.0 * z;
            const x = u.wrap(SN.x0[i] * Wd + 0.010 * zf * Math.sin(T * 0.19 + SN.ph[i]), -Wd / 2, Wd / 2);
            const y = u.wrap(SN.y0[i] * Hd + zf * camY(T) * 1.08, -Hd / 2, Hd / 2);
            const mx = cx + x * S, my = H * 0.5 + y * S, hl = heroLight(mx - cx, my - cy, S, hLit);
            const r = S * (0.0012 + 0.0024 * z) * 2.4 * (1 + 0.35 * lowCol) * (1 + 0.5 * hl);
            g.globalAlpha = (0.10 + 0.26 * z) * (0.55 + 0.45 * Math.sin(T * (0.4 + SN.ph[i] * 0.15) + SN.ph[i])) * (1 + 0.5 * lowCol) * (1 + 1.1 * hl);
            g.drawImage(spr.dotT, mx - r * TK, my - r * TK, r * TK * 2, r * TK * 2);
          }
        }
        // bioluminescent flashes (pops of light that fade as the water brightens)
        const fa = sstep(19, 24, T) * (1 - sstep(36, 44, T));
        if (fa > 0.01) {
          for (let i = 0; i < NF; i++) {
            const ph = (T + FL.ph[i]) / FL.per[i];
            const f = ph - Math.floor(ph);
            if (f > 0.12) continue;
            const x = FL.x[i] * (W / S + 0.2) * S + W / 2, y = FL.y[i] * (H / S + 0.2) * S + H / 2;
            const r = S * 0.014 * FL.sz[i] * (0.6 + 0.8 * f / 0.12);
            g.globalAlpha = Math.sin(Math.PI * f / 0.12) * 0.55 * fa;
            g.drawImage(spr.tealT, x - r * TK, y - r * TK, r * TK * 2, r * TK * 2);
          }
        }
      }
      g.restore();

      drawSurge(g, T, env);             // 40-46 s: nearer school, streaks, bubbles
      drawPlankton(g, T, env, cx, cy);  // plankton swarm
      drawJellies(g, T, env, 1);        // mid jellyfish

      /* ---- hero ---- */
      {
        const swarm = sstep(17.5, 20.5, T) * (1 - sstep(24.5, 28.5, T));
        hero.draw(g, cx, cy, lerp(0.012, 0.014, sstep(18, 44, T)) * S, { hue: lerp(190, 186, sstep(18, 44, T)), form: 'orb', a: 1, pulse: 1 + 0.06 * Math.sin(T * 2.4), glow: 1 + 0.35 * swarm });
      }

      drawJellies(g, T, env, 2);        // near jellyfish, in front of the hero
    },
  });

  /** the hero lights the marine snow around it (0..1) */
  const heroLight = (dx, dy, S, k) => { if (k < 0.01) return 0; const d2 = (dx * dx + dy * dy) / (S * S * 0.078); return d2 > 6 ? 0 : k * Math.exp(-d2); };

  /* ================================ plankton swarm ================================ */
  const _pk = [0, 0, 0, 0];
  /** position of swarm mote i at time T (relative to the hero), plus depth factor and edge fade; ahead = look-behind offset along the ribbon */
  function pkPos(i, T, S, disp, ahead, out) {
    const tt = T - 17;
    const p = u.wrap(PK.p[i] - 0.030 * tt * PK.dsp[i] + ahead, 0, 1);
    const edge = Math.pow(Math.sin(Math.PI * p), 0.5);
    const rr = S * (0.07 + 0.50 * Math.pow(p, 1.18)) + PK.j1[i] * S * (0.012 + 0.04 * p);
    const th = PK.a[i] * (TAU / 3) + Math.pow(1 - p, 0.82) * TAU * 1.5 + 0.28 * tt + PK.j2[i] * 0.10 * (0.4 + p);
    const flat = 0.80 + 0.12 * Math.sin(T * 0.31), psi = 0.35 * Math.sin(T * 0.19 + 0.8);
    const ux = Math.cos(th) * rr, uy = Math.sin(th) * rr * flat;
    let x = ux * Math.cos(psi) - uy * Math.sin(psi), y = ux * Math.sin(psi) + uy * Math.cos(psi);
    const dd = S * 0.8 * Math.pow(disp, 1.5) * PK.dsp[i];
    x += Math.cos(PK.ang[i]) * dd + Math.sin(T * 0.9 + PK.ph[i]) * S * 0.005;
    y += Math.sin(PK.ang[i]) * dd + Math.cos(T * 0.8 + PK.ph[i] * 1.3) * S * 0.005;
    out[0] = x; out[1] = y; out[2] = 0.8 + 0.25 * Math.sin(th); out[3] = edge * Math.exp(-rr / (S * 0.18));
  }
  function drawPlankton(g, T, env, cx, cy) {
    const env0 = sstep(17.2, 20.5, T) * (1 - sstep(24.5, 28.5, T));
    if (env0 < 0.003) return;
    const { S } = env;
    const disp = sstep(24.2, 29.0, T);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NP; i++) {
      pkPos(i, T, S, disp, 0, _pk);
      const x = _pk[0], y = _pk[1], depth = _pk[2], near = _pk[3];
      const edge = Math.pow(Math.sin(Math.PI * u.wrap(PK.p[i] - 0.030 * (T - 17) * PK.dsp[i], 0, 1)), 0.5);
      const tw = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(T * (2.2 + 3 * PK.dsp[i]) + PK.ph[i] * 7), 2);
      const a = env0 * edge * tw * (0.42 + 0.35 * near) * depth * (1 - 0.7 * disp);
      if (a < 0.02) continue;
      const r = S * (0.0032 + 0.0042 * PK.sz[i]) * depth * (1 + 0.5 * near) * 2.4;
      const sp = PK.teal[i] ? spr.tealT : spr.dotT;
      g.globalAlpha = a > 1 ? 1 : a;
      const rt = r * TK;
      g.drawImage(sp, cx + x - rt, cy + y - rt, rt * 2, rt * 2);
      if (i % 4 === 0) { // comet tail: the same mote a moment ago, further out along its ribbon
        pkPos(i, T, S, disp, 0.014, _pk);
        const r2 = r * 0.7;
        g.globalAlpha = a * 0.5;
        const r2t = r2 * TK;
        g.drawImage(sp, cx + _pk[0] - r2t, cy + _pk[1] - r2t, r2t * 2, r2t * 2);
      }
    }
    g.restore();
  }

  /* ================================== jellyfish =================================== */
  const POSE = [];
  for (let i = 0; i < 16; i++) POSE.push({ x: 0, y: 0, R: 0, h: 0, c: 0, dim: 0, j: null, k: 0, vis: true });
  let NPOSE = 0;
  const HRS = [0.74, 0.84, 0.95];
  /** the bell (dome, soft fill, rim light, ribs, lip beads) is painted once per jelly into a sprite and then only scaled */
  function buildBells(env) {
    const { S } = env;
    for (let k = 0; k < JEL.length; k++) {
      const j = JEL[k], bs = j.z === 0 ? 0.42 : j.soft ? 0.5 : 1, R = Math.max(8, j.R * S * bs), hue = j.hue, hr = HRS[((j.ph * 10) | 0) % 3];
      const w = R * 0.92, h = R * (hr + 0.07) * 1.05, eh = R * 0.175, pad = Math.ceil(R * 0.22) + 3;
      const cw = Math.ceil(2 * w + 2 * pad), ch = Math.ceil(h * 1.15 + eh + 2 * pad), oy = pad + h * 1.15;
      const cv = u.canvas(cw, ch), g = cv.getContext('2d');
      g.translate(cw / 2, oy);
      g.globalCompositeOperation = 'lighter';
      const path = new Path2D();
      path.moveTo(-w, 0);
      path.bezierCurveTo(-w * 1.08, -h * 0.55, -w * 0.62, -h * 1.12, 0, -h * 1.1);
      path.bezierCurveTo(w * 0.62, -h * 1.12, w * 1.08, -h * 0.55, w, 0);
      path.ellipse(0, 0, w, eh, 0, 0, Math.PI);
      path.closePath();
      const gr = g.createRadialGradient(0, -h * 0.55, 0, 0, -h * 0.25, w * 1.2);
      gr.addColorStop(0, u.hsl(hue, 75, 72, 0.40)); gr.addColorStop(0.5, u.hsl(hue, 85, 58, 0.15));
      gr.addColorStop(0.82, u.hsl(hue, 90, 52, 0.12)); gr.addColorStop(1, u.hsl(hue + 10, 95, 66, 0.36));
      g.fillStyle = gr; g.fill(path);
      const gv = g.createLinearGradient(0, -h * 1.1, 0, eh);
      gv.addColorStop(0, u.hsl(hue + 10, 80, 80, 0.20)); gv.addColorStop(0.45, u.hsl(hue, 80, 60, 0.0)); gv.addColorStop(1, u.hsl(hue + 15, 90, 70, 0.20));
      g.fillStyle = gv; g.fill(path);
      g.beginPath(); g.ellipse(0, 0, w * 0.95, eh * 0.9, 0, 0, TAU); g.fillStyle = u.hsl(hue + 12, 80, 50, 0.16); g.fill();
      g.lineWidth = Math.max(1, R * 0.022); g.strokeStyle = u.hsl(hue + 12, 90, 78, 0.50);
      g.beginPath(); g.moveTo(-w, 0);
      g.bezierCurveTo(-w * 1.08, -h * 0.55, -w * 0.62, -h * 1.12, 0, -h * 1.1);
      g.bezierCurveTo(w * 0.62, -h * 1.12, w * 1.08, -h * 0.55, w, 0);
      g.stroke();
      g.lineWidth = Math.max(2.5, R * 0.10); g.strokeStyle = u.hsl(hue + 12, 90, 60, 0.07); g.stroke();
      g.lineWidth = Math.max(1, R * 0.03); g.strokeStyle = u.hsl(hue + 18, 92, 82, 0.72);
      g.beginPath(); g.ellipse(0, 0, w, eh, 0, 0, Math.PI); g.stroke();
      g.lineWidth = Math.max(0.8, R * 0.012); g.strokeStyle = u.hsl(hue + 18, 85, 70, 0.22);
      g.beginPath(); g.ellipse(0, 0, w, eh, 0, Math.PI, TAU); g.stroke();
      if (j.z > 0) {
        g.lineWidth = Math.max(0.8, R * 0.008); g.strokeStyle = u.hsl(hue, 85, 75, 0.14);
        g.beginPath();
        for (let i = -3; i <= 3; i++) { g.moveTo(0, -h * 1.0); g.quadraticCurveTo(i * w * 0.24, -h * 0.55, i * w * 0.30, -h * 0.02); }
        g.stroke();
        const sp = u.glowSprite(hue + 25, 90, 80, 'soft'), nb = j.z === 2 ? 14 : 9;
        g.globalAlpha = 0.4;
        for (let i = 0; i < nb; i++) { const th = Math.PI * (i + 0.5) / nb, r = R * 0.07; g.drawImage(sp, Math.cos(th) * w - r, Math.sin(th) * eh - r, r * 2, r * 2); }
      }
      j.bell = { cv, cw, ch, oy, hr, R, k: 1 / bs };
    }
  }
  function jellyPoses(T, env) {
    const { W, H, S } = env;
    NPOSE = 0;
    for (let k = 0; k < JEL.length && NPOSE < POSE.length; k++) {
      const j = JEL[k];
      const a = sstep(j.t0, j.t0 + 3.0, T) * (1 - sstep(j.t1 - 3.5, j.t1, T));
      if (a < 0.01) continue;
      const f = (T - j.t0) / (j.t1 - j.t0);
      const fe = f * 0.85 + 0.15 * sstep(0, 1, f);
      const x = lerp(j.p0[0], j.p1[0], fe) + 0.035 * Math.sin(T * 0.23 + j.ph * 3) * (0.5 + j.z * 0.5);
      let y = lerp(j.p0[1], j.p1[1], fe);
      const c = Math.pow(0.5 + 0.5 * Math.sin(TAU * T / 3.5 + j.ph), 2.2);
      y -= j.R * 0.22 * c;
      const p = POSE[NPOSE++];
      p.j = j; p.R = j.R * S; p.c = c; p.x = W / 2 + x * S; p.y = H / 2 + y * S;
      p.h = p.R * (j.bell.hr + 0.14 * c) * 1.05;
      p.dim = (j.z === 0 ? 0.55 : j.z === 2 ? 0.88 : 1) * (j.soft ? 0.72 : 1) * a;
      // cull: bell below the frame, tentacles ended above it, or fully beside it
      p.vis = p.y - 1.2 * p.R < H && p.y + 8.2 * p.R > 0 && p.x + 1.7 * p.R > 0 && p.x - 1.7 * p.R < W;
    }
  }
  function drawJellies(g, T, env, layer) {
    for (let i = 0; i < NPOSE; i++) if (POSE[i].j.z === layer && POSE[i].vis) jelly(g, T, POSE[i]);
  }

  const TT = new Float32Array(13 * 14 * 2);
  function jelly(g, T, p) {
    const j = p.j, layer = j.z, R = p.R, c = p.c, hue = j.hue, dim = p.dim, B = j.bell;
    const w = R * (1.0 - 0.16 * c), eh = R * (0.15 + 0.05 * (1 - c));
    const tilt = 0.14 * Math.sin(T * 0.31 + j.ph * 2.0) + 0.06 * Math.sin(j.ph * 9);
    g.save();
    g.translate(p.x, p.y);
    g.globalCompositeOperation = 'lighter';
    const spA = u.glowSprite(hue + 25, 90, 80, 'soft'), spB = u.glowSprite(hue + 10, 80, 70, 'soft');
    const gl = (sp, x, y, r, a) => { g.globalAlpha = a > 1 ? 1 : a; g.drawImage(sp, x - r, y - r, r * 2, r * 2); };
    /* tentacles (behind the bell), batched: three strokes per jelly */
    const nT = layer === 0 ? 4 : layer === 1 ? 6 : 9;
    const M = layer === 0 ? 8 : layer === 1 ? 10 : 12;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const seed = (j.ph * 10) | 0;
    for (let t = 0; t < nT; t++) {
      const th = Math.PI * ((t + 0.5) / nT);
      const bx = Math.cos(th) * w * 0.9, by = Math.sin(th) * eh * 0.9;
      const Lt = R * (3.4 + 3.8 * u.hash2(t, 5 + seed)) * (0.92 + 0.12 * (1 - c));
      const sw = R * (0.30 + 0.45 * u.hash2(t, 9 + seed));
      const ph = j.ph * 4 + t * 1.3;
      for (let m = 0; m < M; m++) {
        const s = m / (M - 1), o = (t * M + m) * 2;
        TT[o] = bx * (1 - 0.4 * s) + tilt * Lt * s * 0.6 + sw * Math.sin(T * 0.95 - s * 4.6 + ph) * s + 0.45 * sw * Math.sin(T * 1.7 - s * 9.0 + ph * 2.1) * s * s + R * 0.14 * Math.sin(T * 0.4 + ph) * s * s;
        TT[o + 1] = by + Lt * s + R * 0.35 * Math.sin(T * 1.8 - s * 3.2 + ph) * s * 0.6 - R * 0.5 * c * s;
      }
    }
    const blurK = B.k > 1 ? 1.9 : 1, lw = Math.max(0.7, R * (layer === 2 ? 0.014 : 0.011)) * blurK;
    const e1 = Math.round(4 * (M - 1) / 11);
    const bands = [[0, e1, 0.52, 1.15], [e1, M - 1, 0.22, 0.85]];
    g.globalAlpha = 1;
    for (let q = 0; q < 2; q++) {
      const s0 = bands[q][0], s1 = bands[q][1];
      g.beginPath();
      for (let t = 0; t < nT; t++) {
        let o = (t * M + s0) * 2;
        g.moveTo(TT[o], TT[o + 1]);
        for (let m = s0 + 1; m <= s1; m++) { o = (t * M + m) * 2; g.lineTo(TT[o], TT[o + 1]); }
      }
      g.strokeStyle = u.hsl(hue + 8, 85, 72, bands[q][2] * dim / (blurK > 1 ? 1.6 : 1));
      g.lineWidth = lw * bands[q][3];
      g.stroke();
    }
    if (layer > 0) {
      for (let t = 0; t < nT; t += 3) {                         // beads of light travelling along the tentacles
        const q = u.wrap(u.hash2(t, 33) + T * 0.045, 0, 1);
        const mm = q * (M - 1), m0 = Math.min(M - 2, mm | 0), fr = mm - m0, o = (t * M + m0) * 2;
        gl(spA, TT[o] + (TT[o + 2] - TT[o]) * fr, TT[o + 1] + (TT[o + 3] - TT[o + 1]) * fr, R * 0.09, 0.55 * dim * Math.sin(Math.PI * q));
      }
      g.beginPath();                                            // frilly oral arms
      for (let t = 0; t < 3; t++) {
        const bx = (t - 1) * w * 0.26;
        g.moveTo(bx, 0);
        for (let m = 1; m <= 8; m++) { const s = m / 8; g.lineTo(bx + R * 0.20 * Math.sin(T * 1.2 - s * 5.5 + t * 1.9) * s, eh * 0.4 + R * 1.7 * s * (0.9 + 0.2 * (1 - c))); }
      }
      g.globalAlpha = 1;
      g.strokeStyle = u.hsl(hue + 25, 85, 74, 0.30 * dim); g.lineWidth = Math.max(1.5, R * 0.045); g.stroke();
    }
    /* bell: pre-painted sprite, squashed by the pulse */
    const sx = (1 - 0.16 * c) / 0.92, sy = (B.hr + 0.14 * c) / (B.hr + 0.07);
    g.globalAlpha = dim > 1 ? 1 : dim;
    g.drawImage(B.cv, -B.cw / 2 * sx * B.k, -B.oy * sy * B.k, B.cw * sx * B.k, B.ch * sy * B.k);
    if (layer > 0) {
      const pu = 0.75 + 0.5 * c, h = p.h;
      for (let i = 0; i < 2; i++) {                             // gonads: soft lobes
        const a = i * Math.PI + 0.6;
        gl(spA, Math.cos(a) * w * 0.22, -h * 0.30 + Math.sin(a) * h * 0.12, R * 0.34, 0.30 * dim * pu);
      }
      for (let i = 0; i < 3; i++) {                             // twinkling beads on the lip
        const th = Math.PI * (i + 0.5) / 3;
        gl(spA, Math.cos(th) * w, Math.sin(th) * eh, R * 0.075, 0.5 * dim * (0.5 + 0.5 * Math.sin(T * 2 + i * 1.9 + j.ph)));
      }
    }
    g.restore();
  }


  /* =================================== fish school ================================= */
  /** the school crosses left to right in the mid-distance; from 44 s on it follows the same stream s3_surface continues */
  function fishPos(i, T, W, H, S, out) {
    const a = FS.a[i], b = FS.b[i];
    const xc = W * (0.28 + 0.075 * (T - 44));
    const yc = H * (0.62 + 0.05 * Math.sin(T * 0.22));
    const px = xc + a * 0.17 * W * (1 + 0.12 * Math.sin(T * 0.5)) + 0.012 * S * Math.sin(T * 0.7 * FS.sp[i] + FS.ph[i]);
    const curve = Math.sin((px / W) * 3.1 + T * 0.25) * 0.045;
    out[0] = px;
    out[1] = yc + (b * 0.045 + curve) * H + 0.010 * S * Math.sin(T * 1.3 * FS.sp[i] + FS.ph[i]);
  }
  const _p0 = [0, 0], _p1 = [0, 0];
  function drawFish(g, T, env) {
    const e = sstep(37.5, 41.5, T) * (1 - sstep(52, 56, T));
    if (e < 0.01) return;
    const { W, H, S } = env;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NFISH; i++) {
      fishPos(i, T, W, H, S, _p0);
      if (_p0[0] < -0.1 * W || _p0[0] > 1.1 * W) continue;
      fishPos(i, T + 0.06, W, H, S, _p1);
      const ang = Math.atan2(_p1[1] - _p0[1], _p1[0] - _p0[0]);
      const flash = 0.5 + 0.5 * Math.sin(T * 3.1 - FS.a[i] * 6.0 + FS.ph[i]);
      const al = e * (0.14 + 0.46 * flash * flash * flash);
      const len = S * 0.024 * FS.sz[i];
      g.globalAlpha = al > 1 ? 1 : al;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      g.setTransform(cs, sn, -sn, cs, _p0[0], _p0[1]);
      g.drawImage(spr.fish, -len * 0.5, -len * 0.12, len, len * 0.24);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.restore();
  }

  /* ================= the surge towards the light (T 40-46): a nearer school rushes through, snow streaks past, bubbles rise ================= */
  function drawSurge(g, T, env) {
    if (T < 39.4 || T > 47.9) return;
    const { W, H, S } = env;
    g.save();
    g.globalCompositeOperation = 'lighter';
    /* nearer school, right to left across the hero */
    const e = sstep(39.6, 41.2, T) * (1 - sstep(44.4, 45.6, T));
    if (e > 0.01) {
      const xc = W * (1.30 - 0.30 * (T - 40)), yc = H * (0.50 + 0.03 * Math.sin(T * 0.6));
      for (let i = 0; i < NFS2; i++) {
        const a = FS2.a[i], b = FS2.b[i];
        const px = xc + a * 0.15 * W * (1 + 0.1 * Math.sin(T * 0.5)) + 0.014 * S * Math.sin(T * 0.8 + FS2.ph[i]);
        const py = yc + b * 0.075 * H + Math.sin((px / W) * 3.4 + T * 0.3) * 0.05 * H + 0.012 * S * Math.sin(T * 1.4 + FS2.ph[i]);
        if (px < -0.1 * W || px > 1.1 * W) continue;
        const dy = Math.cos((px / W) * 3.4 + T * 0.3) * 0.05 * H * 3.4 / W * -0.3 + 0.012 * S * 1.4 * Math.cos(T * 1.4 + FS2.ph[i]) * 0.06;
        const ang = Math.atan2(dy, -1);
        const flash = 0.5 + 0.5 * Math.sin(T * 3.3 - a * 6 + FS2.ph[i]);
        const len = S * 0.046 * FS2.sz[i];
        g.globalAlpha = Math.min(1, e * (0.22 + 0.55 * flash * flash * flash));
        const cs = Math.cos(ang), sn = Math.sin(ang);
        g.setTransform(cs, sn, -sn, cs, px, py);
        g.drawImage(spr.fish, -len * 0.5, -len * 0.125, len, len * 0.25);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    /* snow streaks: the camera is speeding up, near motes fall past quickly */
    const sk = sstep(39.6, 42.4, T) * (1 - sstep(44.2, 46.4, T));
    if (sk > 0.01) {
      const Wd = MO.Wd, Hd = MO.Hd;
      for (let i = 0; i < NSK; i++) {
        const z = SKS.z[i], v = 0.10 + 0.16 * z;
        const x = u.wrap(SKS.x0[i] * Wd + 0.01 * Math.sin(T * 0.4 + i), -Wd / 2, Wd / 2);
        const y = u.wrap(SKS.y0[i] * Hd + v * (T - 38), -Hd / 2, Hd / 2);
        const rw = S * (0.0022 + 0.0030 * z) * 1.6, rh = rw + S * v * 0.12;
        const mx = W * 0.5 + x * S, my = H * 0.5 + y * S;
        g.globalAlpha = sk * (0.18 + 0.30 * z);
        g.drawImage(spr.dotT, mx - rw, my - rh, rw * 2, rh * 2);
      }
    }
    /* bubbles rising */
    const be = sstep(40.2, 43.0, T) * (1 - sstep(46.0, 47.8, T));
    if (be > 0.01) {
      const Hd = H / S + 0.3;
      for (let i = 0; i < NBB; i++) {
        const r = BUB.r[i] * S;
        const y = u.wrap(BUB.y0[i] * Hd - BUB.v[i] * (T - 40), -0.5 * Hd, 0.5 * Hd) ;
        const x = BUB.x0[i] * (W / S + 0.1) + 0.012 * Math.sin(T * 0.9 + BUB.ph[i]) + 0.004 * Math.sin(T * 2.3 + BUB.ph[i] * 2);
        g.globalAlpha = be * (0.5 + 0.3 * Math.sin(T * 0.7 + BUB.ph[i]));
        g.drawImage(spr.bubble, W * 0.5 + x * S - r, H * 0.5 + y * S - r, r * 2, r * 2);
      }
    }
    g.restore();
  }

  /* =================================== the whale =================================== */
  const whalePres = (T) => sstep(26.6, 29.8, T) * (1 - sstep(40.6, 43.0, T));
  const finAng = (T) => 0.36 + 0.09 * Math.sin(T * 0.55);
  /** soft light for the low-res layer: backlit mist behind the whale (so the silhouette reads) + glow wake behind the tail */
  function whaleGlow(q, T, env) {
    const pres = whalePres(T);
    if (pres < 0.004) return;
    const { W, H } = env, L = WH.L;
    const yAxis = whaleAxis(T, H);
    q.save();
    q.translate(W * 0.5, yAxis - H * 0.02);
    q.scale(1, 0.40);
    u.glow(q, 0, 0, Math.max(W * 0.85, L * 0.45), 190, 65, 34, 0.30 * pres, 'soft');
    q.restore();
    const xTail = whaleHead(T, L) - L;
    q.save();
    q.translate(xTail - L * 0.06, yAxis + whaleWave(0.0, T) * L);
    q.scale(1, 0.22);
    u.glow(q, 0, 0, L * 0.22, 185, 70, 40, 0.22 * pres, 'soft');
    q.restore();
  }

  /** the dark body (and the flipper tucked behind it): drawn into the low-res layer, so edges are naturally soft */
  function whaleBody(q, T, env) {
    const pres = whalePres(T);
    if (pres < 0.004) return;
    const { W, H } = env, L = WH.L;
    const xHead = whaleHead(T, L), xTail = xHead - L;
    if (xTail > W + 0.2 * L || xHead < -0.05 * L) return;
    const yAxis = whaleAxis(T, H);
    const offY = (xn) => whaleWave(xn, T) * L;
    // pectoral fin (behind the body): soft leaf with a lighter tip
    q.save();
    q.globalCompositeOperation = 'source-over';
    q.globalAlpha = pres * 0.98;
    q.translate(xTail + 0.73 * L, yAxis + offY(0.73) + 0.066 * L);
    q.rotate(finAng(T));
    finPath(q, L);
    const fg = q.createLinearGradient(0, 0, 0, L * 0.135);
    fg.addColorStop(0, 'rgb(4,16,29)'); fg.addColorStop(0.6, 'rgb(6,24,40)'); fg.addColorStop(1, 'rgb(14,46,68)');
    q.fillStyle = fg; q.fill();
    q.restore();
    // body: vertical strips, each sheared so that the undulation is a continuous polyline (no stair-steps)
    q.save();
    q.globalCompositeOperation = 'source-over';
    q.globalAlpha = pres;
    q.imageSmoothingEnabled = true;
    const k = WH.sc, kx = LLC.w / W, ky = LLC.h / H, y00 = yAxis - WH.oy / k, dh = WH.ch / k;
    let i = Math.floor(Math.max(xTail, 0) * kx);
    const iEnd = Math.ceil(Math.min(W + 20, xHead) * kx);
    while (i < iEnd) {
      const xnm = (i / kx - xTail) / L;
      const m = Math.max(2, Math.ceil((xnm < 0.2 ? 0.02 : 0.035) * L * kx));   // ~35 sheared segments: the displacement is smooth, so this is a continuous polyline
      let D0 = i / kx, D1 = (i + m) / kx;
      i += m;
      if (D0 < xTail) D0 = xTail;
      if (D1 > xHead) D1 = xHead;
      if (D1 <= D0) continue;
      const a0 = (D0 - xTail) / L, a1 = (D1 - xTail) / L;
      const o0 = offY(a0), o1 = offY(a1);
      q.setTransform(kx, ky * (o1 - o0) / (D1 - D0), 0, ky, kx * D0, ky * (y00 + o0));
      q.drawImage(WH.cv, a0 * WH.cw, 0, (a1 - a0) * WH.cw, WH.ch, 0, 0, D1 - D0, dh);
    }
    q.setTransform(kx, 0, 0, ky, 0, 0);
    q.restore();
  }

  /** full-resolution details on top: plankton trail, rim light on the back, bioluminescent speckles, eye */
  function drawWhale(g, T, env, hx, hy) {
    const { W, H, S } = env;
    const pres = whalePres(T);
    if (pres < 0.004) return;
    const L = WH.L;
    const xHead = whaleHead(T, L);
    const xTail = xHead - L;
    if (xTail > W + 0.2 * L || xHead < -0.05 * L) return;
    const yAxis = whaleAxis(T, H);
    const offY = (xn) => whaleWave(xn, T) * L;

    g.save();
    g.globalCompositeOperation = 'lighter';
    /* trail of luminous plankton disturbed by the passage */
    for (let i = 0; i < NTR; i++) {
      const d = 0.5 + 5.5 * u.hash2(i, 91);
      const Tp = T - d;
      if (Tp < WHALE_T0) continue;
      const xx = whaleHead(Tp, L) - L + (u.hash2(i, 93) - 0.5) * L * 0.03;
      if (xx < -S * 0.1 || xx > W + S * 0.1) continue;
      const yy = whaleAxis(Tp, H) + whaleWave(0.02, Tp) * L + (u.hash2(i, 92) - 0.5) * L * 0.05 * (1 + d * 0.25) + d * S * 0.025;
      const a = pres * (1 - d / 6.2) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(T * 2.3 + i * 1.9), 2)) * 0.8;
      if (a < 0.01) continue;
      const r = S * 0.0065 * (0.6 + u.hash2(i, 95)) * 2.4;
      g.globalAlpha = a;
      g.drawImage(i % 3 ? spr.dotT : spr.tealT, xx - r * TK, yy - r * TK, r * TK * 2, r * TK * 2);
    }
    /* rim light along the back: three widths, brightest over the shoulders and fading to nothing at head and tail */
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < RIM.length; i += 2) {
      const X = xTail + RIM[i] * L, Y = yAxis + offY(RIM[i]) + RIM[i + 1] * L;
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    const rg = g.createLinearGradient(xTail + 0.10 * L, 0, xHead, 0);
    rg.addColorStop(0, 'rgba(95,205,230,0)'); rg.addColorStop(0.16, 'rgba(95,205,230,0.55)'); rg.addColorStop(0.5, 'rgba(110,215,238,1)');
    rg.addColorStop(0.82, 'rgba(95,205,230,0.7)'); rg.addColorStop(1, 'rgba(95,205,230,0)');
    g.strokeStyle = rg;
    g.globalAlpha = pres * 0.11; g.lineWidth = Math.max(3, L * 0.0048); g.stroke();
    g.globalAlpha = pres * 0.20; g.lineWidth = Math.max(1.1, L * 0.0011); g.stroke();
    const NSP = 72;
    for (let i = 0; i < NSP; i++) {
      const hsh = u.hash2(i, 101);
      const xn = 0.30 + 0.68 * u.hash2(i, 102);
      const row = u.hash2(i, 103);
      let yn;
      const yb = botY(xn), yt = topY(xn);
      if (row < 0.55) yn = yb - (yb - yt) * (0.06 + 0.22 * u.hash2(i, 104));       // belly band
      else if (row < 0.8) yn = yt + (yb - yt) * (0.46 + 0.12 * u.hash2(i, 104));     // lateral line
      else yn = yb - (yb - yt) * (0.02 + 0.05 * u.hash2(i, 104));                    // lower jaw / edge
      const X = xTail + xn * L, Y = yAxis + offY(xn) + yn * L;
      if (X < -20 || X > W + 20) continue;
      const wave = 0.5 + 0.5 * Math.sin(TAU * (xn * 1.6 - T / 3.3) + hsh * 2);
      const near = Math.exp(-(Math.pow((X - hx) / (S * 0.5), 2) + Math.pow((Y - hy) / (S * 0.35), 2)));
      const a = pres * (0.22 + 0.60 * wave * wave + 0.5 * near) * (0.55 + 0.45 * Math.sin(T * (1 + hsh) + hsh * 20));
      if (a < 0.02) continue;
      const r = S * (0.0045 + 0.004 * u.hash2(i, 105)) * 2.4;
      g.globalAlpha = a > 1 ? 1 : a;
      g.drawImage(hsh < 0.3 ? spr.tealT : spr.dotT, X - r * TK, Y - r * TK, r * TK * 2, r * TK * 2);
    }
    // flipper speckles (a line of dots along the leading edge)
    {

      const th0 = finAng(T), cs = Math.cos(th0), sn = Math.sin(th0);
      const rx = xTail + 0.73 * L, ry = yAxis + offY(0.73) + 0.066 * L;
      for (let i = 0; i < 9; i++) {
        const s2 = (i + 0.5) / 9, lx = L * (0.018 * (1 - s2) - 0.045 * s2 * s2) , ly = L * 0.134 * s2;
        const fx = rx + lx * cs - ly * sn, fy = ry + lx * sn + ly * cs;
        g.globalAlpha = pres * 0.5 * (0.5 + 0.5 * Math.sin(T * 1.3 + i));
        const r = S * 0.0075 * TK; g.drawImage(spr.dotT, fx - r, fy - r, r * 2, r * 2);
      }
    }
    // eye
    {
      const X = xTail + 0.918 * L, Y = yAxis + offY(0.918) + 0.030 * L;
      g.globalAlpha = pres * 0.6; const r = S * 0.012 * TK; g.drawImage(spr.dotT, X - r, Y - r, r * 2, r * 2);
    }
    g.restore();
  }
})();
