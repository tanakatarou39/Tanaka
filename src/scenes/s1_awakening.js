/* ひとしずくの旅 — s1_awakening (T 0–18) 目ざめ
 *
 * Black void. A single point of light fades in, then beats like a heart. Every beat sends a thin ring
 * through the dark; dust that the ring passes lights up and fades. A teal haze swells around the light,
 * the beats soften, the dust starts to sink, and the world settles into the B1 deep-water state that
 * s2_deepsea continues (the "B1 world" block below is byte-identical in both files).
 *
 * Cost note: the opaque background, haze, halos and the soft part of every ring are painted into a
 * low-resolution layer and blitted once; only hairline rings, dust and the hero are drawn at full size.
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

  /* ====================================== s1 =========================================== */
  const BEAT_T0 = 2.3, BEAT_P = 2.4;           // lub of beat k at BEAT_T0 + k*BEAT_P
  const ampEnv = (T) => u.keys([[2, 0.18], [4.7, 0.78], [7.1, 1], [9.5, 1], [11.9, 0.4], [13.6, 0]], T, 'smooth');
  /* every beat is a little different: the first ring is small, the second wider, the third a pronounced lub-dub, then the full ring */
  const RING_SC = [0.52, 0.80, 1.0, 1.0, 1.05, 0.9], DUB_A = [0.35, 0.45, 0.95, 0.55, 0.55, 0.4];
  const ringSc = (k) => RING_SC[k < 5 ? k : 5], dubA = (k) => DUB_A[k < 5 ? k : 5];
  const RING_D = 2.4, RING_R = 0.4;            // ring lifetime (s), radius (xS)

  let ringSoft = null, ringFill = null;
  function buildSprites() {
    ringFill = u.sprite('s1|ringfill', 256, 256, (c) => {
      const gr = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(40,140,190,0)'); gr.addColorStop(0.55, 'rgba(40,140,190,0.05)');
      gr.addColorStop(0.9, 'rgba(60,170,215,0.22)'); gr.addColorStop(1, 'rgba(50,150,200,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    });
    ringSoft = u.sprite('s1|ringsoft', 256, 256, (c) => {
      const gr = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(60,170,210,0)'); gr.addColorStop(0.55, 'rgba(60,170,210,0)');
      gr.addColorStop(0.86, 'rgba(70,185,225,0.7)'); gr.addColorStop(0.95, 'rgba(60,160,210,0.2)'); gr.addColorStop(1, 'rgba(50,140,200,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    });
  }

  /* extra dust that only exists while the world is waking (fades out by 13.4 s, before the B1 hand-off) */
  let XM = { N: 0 };
  function extraSetup() {
    const N = Math.round(MO.N * 0.9);
    XM = { N, x0: new Float32Array(N), y0: new Float32Array(N), z: new Float32Array(N), ph: new Float32Array(N), vx: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
      XM.x0[i] = (u.hash2(i, 61) - 0.5) * MO.Wd; XM.y0[i] = (u.hash2(i, 62) - 0.5) * MO.Hd;
      XM.z[i] = u.hash2(i, 63); XM.ph[i] = u.hash2(i, 64) * TAU; XM.vx[i] = (u.hash2(i, 65) - 0.5) * 0.006;
    }
  }

  const tealSpr = () => u.sprite('s1|teal', 64, 64, (c) => {
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(235,255,245,1)'); gr.addColorStop(0.14, 'rgba(150,250,215,0.8)');
    gr.addColorStop(0.4, 'rgba(60,200,170,0.2)'); gr.addColorStop(1, 'rgba(30,150,140,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  });
  const ringRad = (t, R) => R * (1 - (1 - clamp(t / RING_D)) * (1 - clamp(t / RING_D)));
  const ringList = [];

  Anim.defineScene({
    id: 's1_awakening',

    init(env) { buildSprites(); },
    resize(env) { buildSprites(); hazeSetup(env); worldSetup(env); extraSetup(); },

    render(g, T, L, env) {
      const { W, H, S } = env;
      const cx = W * 0.5, cy = H * 0.5;
      const pin = hero.pins[0];

      /* ---- global envelopes ---- */
      const amp = ampEnv(T);                                      // heartbeat strength
      const bt = hero.beat(T - (BEAT_T0 - 0.144), BEAT_P) * amp;   // current beat 0..1
      const floorV = sstep(8.5, 13.5, T);                         // dust visible everywhere by 13.5
      const heroA = sstep(1.5, 4.2, T);
      const bgA = sstep(5.5, 13, T);                              // deep-water gradient fades in

      /* ---- active rings (lub k and its dub echo) ---- */
      const kNow = Math.floor((T - BEAT_T0) / BEAT_P);
      ringList.length = 0;
      for (let k = kNow; k >= kNow - 2; k--) {
        if (k < 0) continue;
        const tk = BEAT_T0 + k * BEAT_P, a = ampEnv(tk);
        if (a < 0.01) continue;
        const sc = ringSc(k);
        if (T - tk < RING_D + 1.6) ringList.push({ t: T - tk, a, R: RING_R * sc, kind: 0 });
        if (T - (tk + 0.43) > 0 && T - (tk + 0.43) < RING_D * 0.8 + 1.4) ringList.push({ t: T - tk - 0.43, a: a * dubA(k), R: RING_R * 0.62 * (k === 2 ? 1.25 : sc), kind: 1 });
      }

      /* ================= low-res layer: background, haze, halos, soft rings ================= */
      {
        const q = llBegin(env);
        const top = [BG_TOP[0] * bgA, BG_TOP[1] * bgA, BG_TOP[2] * bgA], bot = [BG_BOT[0] * bgA, BG_BOT[1] * bgA, BG_BOT[2] * bgA];
        u.vgrad(q, W, H, [[0, u.css(top)], [1, u.css(bot)]]);
        const hzA = sstep(6, 13, T);
        const hzTint = u.mixc([12, 62, 128], HAZE_TINT, sstep(6.5, 13.5, T));   // the haze starts cold blue and warms to B1's teal
        hazeDraw(q, env, T, 0.21 * hzA * (1 + 0.10 * bt), hzTint, pin.x, pin.y, 3.2);
        q.globalCompositeOperation = 'lighter';
        // heart glow: wide breathing halo that lifts the black around the point
        const lift = heroA * (0.05 + 0.10 * bt) * (1 - 0.6 * sstep(9, 13.5, T)) * (1 - sstep(11, 14, T));
        u.glow(q, cx, cy, S * 0.55, 195, 80, 45, lift, 'soft');
        u.glow(q, cx, cy, S * 0.20, 190, 80, 55, heroA * (0.07 + 0.22 * bt) * (1 - sstep(10.5, 13.8, T)), 'soft');
        // faint out-of-focus discs close to the lens
        const bk = bokehSpr();
        for (let i = 0; i < BK.N; i++) {
          const x = u.wrap(BK.x0[i] + 0.01 * Math.sin(T * 0.11 + BK.ph[i]), -BK.Wb / 2, BK.Wb / 2);
          const y = u.wrap(BK.y0[i] + 1.9 * camY(T), -BK.Hb / 2, BK.Hb / 2);
          const dn = Math.hypot(x, y);
          const v = Math.max(floorV * 0.9, Math.exp(-dn * dn * 2.2) * heroA * (0.42 + 0.58 * bt) * 0.7) * BK.al[i] * (0.7 + 0.3 * Math.sin(T * 0.4 + BK.ph[i]));
          if (v < 0.004) continue;
          const rr = BK.sz[i] * S;
          q.globalAlpha = v;
          q.drawImage(bk, cx + x * S - rr, cy + y * S - rr, rr * 2, rr * 2);
        }
        // the soft glow of every ring (fill inside + diffuse band)
        for (let i = 0; i < ringList.length; i++) {
          const rg = ringList[i];
          if (rg.t < 0 || rg.t > RING_D) continue;
          const rr = ringRad(rg.t, rg.R) * S;
          const a = rg.a * Math.pow(1 - rg.t / RING_D, 1.5) * clamp(rg.t / 0.08) * (rg.kind ? 0.7 : 1);
          if (a < 0.004 || rr < 2) continue;
          const sf = sstep(0.06, 0.5, rg.t);
          q.globalAlpha = Math.min(1, a * 0.7 * sf);
          q.drawImage(ringFill, cx - rr / 0.9, cy - rr / 0.9, rr / 0.9 * 2, rr / 0.9 * 2);
          q.globalAlpha = Math.min(1, a * 0.8 * sf);
          const R2 = rr / 0.86 * 1.02;
          q.drawImage(ringSoft, cx - R2, cy - R2, R2 * 2, R2 * 2);
        }
        q.globalAlpha = 1;
        llEnd(g, env);
      }

      g.save();
      g.globalCompositeOperation = 'lighter';

      /* ---- dust motes: visible only where the light reaches ---- */
      {
        const dot = dotSpr();
        const reach = u.lerp(0.26, 0.52, sstep(3, 12, T));
        const lightLvl = heroA * (0.42 + 0.58 * bt);              // dust brightens with every beat
        const N = MO.N, NT = N + XM.N;
        const xFade = 1 - sstep(9.5, 13.4, T);
        for (let i = 0; i < NT; i++) {
          const ex = i >= N, j = ex ? i - N : i;
          let x, y, z, ph;
          if (!ex) { x = moteX(i, T); y = moteY(i, T); z = MO.z[i]; ph = MO.ph[i]; }
          else {
            if (xFade < 0.003) continue;
            z = XM.z[j]; ph = XM.ph[j];
            x = u.wrap(XM.x0[j] + XM.vx[j] * T + 0.012 * (0.55 + 0.9 * z) * Math.sin(T * 0.21 + ph), -MO.Wd / 2, MO.Wd / 2);
            y = u.wrap(XM.y0[j] + (0.55 + 0.9 * z) * camY(T) + 0.004 * Math.sin(T * 0.17 + ph * 1.3), -MO.Hd / 2, MO.Hd / 2);
          }
          const dn = Math.hypot(x, y);
          const rd = dn / reach;
          const vis = Math.exp(-rd * rd * 1.6) * lightLvl;
          let lit = 0;
          for (let q = 0; q < ringList.length; q++) {
            const rg = ringList[q];
            if (dn > rg.R) continue;
            const tp = RING_D * (1 - Math.sqrt(1 - dn / rg.R));    // moment the front crosses this mote
            const dt = rg.t - tp;
            if (dt > 0) lit += Math.exp(-dt / (1.0 + 0.4 * z)) * rg.a * (1 - 0.5 * dn / rg.R);
            else if (dt > -0.14) lit += (1 + dt / 0.14) * rg.a * 1.0;
          }
          const a = (0.16 + 0.34 * z) * (0.6 + 0.4 * Math.sin(T * (0.5 + ph * 0.2) + ph));
          let v = (ex ? 0 : Math.max(floorV, vis)) * a + lit * (0.4 + 0.6 * z);
          if (ex) v = (vis * a * 0.8 + lit * (0.4 + 0.6 * z)) * xFade;
          if (v < 0.01) continue;
          const rr = S * (0.0016 + 0.0036 * z) * (1 + lit * 1.1) * 2.4;
          g.globalAlpha = v > 1 ? 1 : v;
          g.drawImage(dot, cx + x * S - rr, cy + y * S - rr, rr * 2, rr * 2);
        }

        /* ---- a slow stream of plankton glints drifts through (9.5-14.5 s): the first hint of the life that waits in B1/s2 ---- */
        const gE = sstep(9.6, 11.8, T) * (1 - sstep(13.2, 14.6, T));
        if (gE > 0.01) {
          const tl = tealSpr(), span = (W / S + 0.5);
          for (let i = 0; i < 34; i++) {
            const h1 = u.hash2(i, 301), h2 = u.hash2(i, 302), h3 = u.hash2(i, 303);
            const sp = u.wrap(i / 34 + 0.012 * (T - 9.5) * (0.8 + 0.5 * h3), 0, 1);
            const x = (sp - 0.5) * span, bx = 0.18 * Math.sin(sp * 5.0 + 0.6) + 0.15 * (0.5 - sp);
            const y = bx + (h1 - 0.5) * 0.07 + 0.012 * Math.sin(T * 0.9 + h2 * TAU);
            const edge = Math.sin(Math.PI * sp);
            const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(T * (1.6 + 2 * h2) + h1 * 20), 2);
            const aa = gE * edge * tw * (0.5 + 0.4 * h3);
            if (aa < 0.01) continue;
            const rr = S * (0.0045 + 0.004 * h2) * 2.4;
            g.globalAlpha = aa > 1 ? 1 : aa;
            g.drawImage(tl, cx + x * S - rr, cy + y * S - rr, rr * 2, rr * 2);
          }
        }

        /* ---- beat rings: crisp hairline on top of the soft glow ---- */
        g.lineCap = 'butt';
        for (let q = 0; q < ringList.length; q++) {
          const rg = ringList[q];
          if (rg.t < 0 || rg.t > RING_D) continue;
          const rr = ringRad(rg.t, rg.R) * S;
          const a = rg.a * Math.pow(1 - rg.t / RING_D, 1.5) * clamp(rg.t / 0.08) * (rg.kind ? 0.7 : 1);
          if (a < 0.004 || rr < 2) continue;
          g.beginPath(); g.arc(cx, cy, rr, 0, TAU);
          const soft = sstep(0.06, 0.5, rg.t);                        // the broad glow only grows in once the ring has left the hero
          g.globalAlpha = Math.min(1, a * 0.16 * soft); g.strokeStyle = 'rgb(80,180,228)'; g.lineWidth = Math.min(Math.max(14, S * 0.040), rr * 0.8); g.stroke();
          g.globalAlpha = Math.min(1, a * 0.22 * soft); g.strokeStyle = 'rgb(100,200,238)'; g.lineWidth = Math.min(Math.max(8, S * 0.016), rr * 0.6); g.stroke();
          g.globalAlpha = Math.min(1, a * 0.38); g.strokeStyle = 'rgb(140,225,247)'; g.lineWidth = Math.min(Math.max(3.5, S * 0.0055), rr * 0.4); g.stroke();
          g.globalAlpha = Math.min(1, a * 0.95); g.strokeStyle = 'rgb(225,252,255)'; g.lineWidth = Math.min(Math.max(1.3, S * 0.0021), rr * 0.25); g.stroke();
        }

        /* ---- sparks born from each beat, drifting outward like fireflies ---- */
        const sparkFade = 1 - sstep(13.0, 14.8, T);
        for (let k = Math.max(0, kNow - 1); k <= kNow && sparkFade > 0.003; k++) {
          const tk = BEAT_T0 + k * BEAT_P, a0 = ampEnv(tk);
          if (a0 < 0.05) continue;
          const t = T - tk;
          if (t < 0 || t > 4.2) continue;
          const f = t / 4.2;
          for (let j = 0; j < 14; j++) {
            const ang = u.hash2(k * 31 + j, 91) * TAU + 0.35 * f * (j % 2 ? 1 : -1);
            const dist = (0.06 + 0.26 * u.hash2(k * 31 + j, 92)) * S * (1 - Math.pow(1 - f, 2.2));
            const al = a0 * Math.sin(Math.PI * Math.pow(f, 0.6)) * (0.5 + 0.5 * Math.sin(T * 3 + j * 1.7)) * 0.9 * sparkFade;
            if (al < 0.01) continue;
            const rr = S * (0.0035 + 0.003 * u.hash2(k * 31 + j, 93)) * 2.4;
            g.globalAlpha = al > 1 ? 1 : al;
            g.drawImage(dot, cx + Math.cos(ang) * dist - rr, cy + Math.sin(ang) * dist - rr, rr * 2, rr * 2);
          }
        }
      }
      g.restore();

      /* ---- the hero ---- */
      {
        const rS = u.lerp(0.4, 1, sstep(2, 9, T));
        const wob = 1 + 0.06 * Math.sin(T * 2.4) * sstep(11, 14, T);
        const pulse = rS * (1 + 0.9 * bt) * wob;
        hero.draw(g, cx, cy, pin.r * S, {
          hue: pin.hue, form: pin.form, a: heroA, pulse, glow: 0.7 + 0.3 * heroA + 1.3 * bt, flare: 0.5 * bt * bt,
        });
      }
    },
  });
})();
