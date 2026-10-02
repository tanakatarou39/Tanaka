/* ひとしずくの旅 — core: utilities + engine (compositor / post-fx)
 *
 * Everything here is a pure function of the global time T (seconds). No scene may
 * keep per-frame simulation state: positions must be analytic f(seed, T) so that the
 * film can be seeked, looped, and rendered frame-by-frame for verification.
 */
(function (G) {
  'use strict';
  const Anim = (G.Anim = G.Anim || {});
  Anim.DURATION = 180;
  Anim.scenes = {}; // id -> scene definition
  Anim.errors = [];
  const u = (Anim.util = {});
  const TAU = Math.PI * 2;
  u.TAU = TAU;

  /* ---------- numeric helpers ---------- */
  u.clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  u.lerp = (a, b, t) => a + (b - a) * t;
  u.invLerp = (a, b, x) => (x - a) / (b - a);
  /** remap x from [a,b] to [c,d], clamped */
  u.remap = (x, a, b, c, d) => c + (d - c) * u.clamp((x - a) / (b - a));
  u.smoothstep = (a, b, x) => {
    const t = u.clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  u.smootherstep = (a, b, x) => {
    const t = u.clamp((x - a) / (b - a));
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  /** wrap x into [a,b) */
  u.wrap = (x, a, b) => {
    const r = b - a;
    return a + ((((x - a) % r) + r) % r);
  };
  /** 0..1 -> 0..1 ease functions */
  u.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };
  /**
   * Keyframe interpolation. keys = [[t, v], ...] sorted by t. Clamped outside range.
   * mode: 'smooth' (smoothstep per segment, stops at every key) | 'linear' |
   *       'spline' (C1 cubic Hermite, finite-difference tangents; good for camera paths)
   */
  u.keys = (keys, t, mode = 'smooth') => {
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (t > keys[i + 1][0]) i++;
    const t0 = keys[i][0], v0 = keys[i][1], t1 = keys[i + 1][0], v1 = keys[i + 1][1];
    const h = t1 - t0, s = (t - t0) / h;
    if (mode === 'linear') return v0 + (v1 - v0) * s;
    if (mode === 'smooth') return v0 + (v1 - v0) * (s * s * (3 - 2 * s));
    const pa = i > 0 ? keys[i - 1] : keys[i];
    const pb = i + 2 < n ? keys[i + 2] : keys[i + 1];
    const m0 = pa[0] === t0 ? (v1 - v0) / h : ((v1 - pa[1]) / (t1 - pa[0]));
    const m1 = pb[0] === t1 ? (v1 - v0) / h : ((pb[1] - v0) / (pb[0] - t0));
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1;
  };

  /* ---------- randomness / noise (all deterministic) ---------- */
  /** seeded PRNG: const r = u.rng(42); r() -> [0,1) */
  u.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hash2i = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  /** deterministic hash of a number -> [0,1) */
  u.hash = (n) => hash2i(Math.floor(n), 7919) ;
  u.hash2 = hash2i;
  const fade = (t) => t * t * (3 - 2 * t);
  /** smooth value noise 1D, returns [0,1) */
  u.noise1 = (x) => {
    const i = Math.floor(x), f = x - i;
    return hash2i(i, 101) * (1 - fade(f)) + hash2i(i + 1, 101) * fade(f);
  };
  /** smooth value noise 2D, returns [0,1) */
  u.noise2 = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
    const a = hash2i(ix, iy), b = hash2i(ix + 1, iy), c = hash2i(ix, iy + 1), d = hash2i(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  /** fractal noise, returns ~[0,1) */
  u.fbm1 = (x, oct = 4) => {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * u.noise1(x * f + i * 13.7); n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
  u.fbm2 = (x, y, oct = 4) => {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * u.noise2(x * f + i * 17.3, y * f + i * 5.1); n += a; a *= 0.5; f *= 2; }
    return s / n;
  };

  /* ---------- colour ---------- */
  u.rgb = (hex) => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  u.mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  /** [r,g,b] (+alpha) -> css string */
  u.css = (c, a = 1) =>
    a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a < 0 ? 0 : a})`;
  /** colour keyframes: keys = [[t,[r,g,b]],...] -> [r,g,b] (accepts hex strings too) */
  u.keyc = (keys, t, mode = 'smooth') => {
    const k = keys.map(([tt, c]) => [tt, typeof c === 'string' ? u.rgb(c) : c]);
    const n = k.length;
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0;
    while (t > k[i + 1][0]) i++;
    let s = (t - k[i][0]) / (k[i + 1][0] - k[i][0]);
    if (mode === 'smooth') s = s * s * (3 - 2 * s);
    return u.mixc(k[i][1], k[i + 1][1], s);
  };
  u.hsl = (h, s, l, a = 1) => `hsla(${(((h % 360) + 360) % 360).toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a < 0 ? 0 : a})`;

  /* ---------- canvas helpers ---------- */
  u.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  };
  const _sprites = new Map();
  /** cached offscreen sprite: u.sprite(key, w, h, (ctx,w,h)=>{...}) */
  u.sprite = (key, w, h, draw) => {
    let c = _sprites.get(key);
    if (!c) {
      c = u.canvas(w, h);
      draw(c.getContext('2d'), c.width, c.height);
      _sprites.set(key, c);
    }
    return c;
  };
  /** whole-canvas vertical gradient fill. stops = [[0,'#...'],[1,'#...']] */
  u.vgrad = (g, W, H, stops, y0 = 0, y1 = H) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  u.grad = (g, x0, y0, x1, y1, stops) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    return gr;
  };
  /** cached radial glow sprite (white-hot core -> hue halo), 128px */
  u.glowSprite = (h, s, l, kind = 'soft') => {
    const hq = ((Math.round(h / 3) * 3) % 360 + 360) % 360;
    const sq = Math.round(s / 2) * 2, lq = Math.round(l / 2) * 2;
    return u.sprite(`glow|${kind}|${hq}|${sq}|${lq}`, 128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      const C = (a, ll = lq, ss = sq) => `hsla(${hq},${ss}%,${Math.min(100, ll)}%,${a})`;
      if (kind === 'core') {
        g.addColorStop(0, C(1, 98, sq * 0.3));
        g.addColorStop(0.1, C(0.95, lq + 18, sq * 0.6));
        g.addColorStop(0.28, C(0.5));
        g.addColorStop(0.6, C(0.12));
        g.addColorStop(1, C(0));
      } else if (kind === 'ring') {
        g.addColorStop(0, C(0));
        g.addColorStop(0.7, C(0));
        g.addColorStop(0.88, C(0.9));
        g.addColorStop(0.97, C(0.15));
        g.addColorStop(1, C(0));
      } else {
        g.addColorStop(0, C(1));
        g.addColorStop(0.15, C(0.55));
        g.addColorStop(0.4, C(0.18));
        g.addColorStop(0.7, C(0.04));
        g.addColorStop(1, C(0));
      }
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    });
  };
  /** additive glow: u.glow(g, x, y, radiusPx, hue, sat, light, alpha, kind='soft'|'core'|'ring') */
  u.glow = (g, x, y, r, h, s, l, a = 1, kind = 'soft') => {
    if (a <= 0.002 || r < 0.3) return;
    const op = g.globalCompositeOperation, pa = g.globalAlpha;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a > 1 ? 1 : a;
    g.drawImage(u.glowSprite(h, s, l, kind), x - r, y - r, r * 2, r * 2);
    if (a > 1) { g.globalAlpha = a - 1 > 1 ? 1 : a - 1; g.drawImage(u.glowSprite(h, s, l, kind), x - r, y - r, r * 2, r * 2); }
    g.globalAlpha = pa;
    g.globalCompositeOperation = op;
  };

  /* ====================================================================
   *  ENGINE
   * ==================================================================== */
  const E = (Anim.engine = {
    canvas: null, ctx: null,
    W: 0, H: 0, scale: 1, dpr: 1, cssW: 0, cssH: 0,
    maxPixels: 2.4e6,
    env: { W: 0, H: 0, S: 0, aspect: 1, portrait: false, scale: 1, dpr: 1 },
    stats: { frames: 0, lastMs: 0 },
    noFx: false, // perf diagnostics: skip bloom/vignette/grain/fade
  });
  let L0, L1, g0, g1, B1, B2, B3, b1c, b2c, b3c, vign, grainPat;

  E.attach = (canvas) => {
    E.canvas = canvas;
    E.ctx = canvas.getContext('2d', { alpha: false });
  };

  E.setSize = (cssW, cssH, dpr, scale) => {
    if (scale != null) E.scale = scale;
    E.cssW = cssW; E.cssH = cssH; E.dpr = dpr;
    const k = Math.min(dpr, 2) * E.scale;
    let W = Math.round(cssW * k), H = Math.round(cssH * k);
    if (W * H > E.maxPixels) { const f = Math.sqrt(E.maxPixels / (W * H)); W = Math.round(W * f); H = Math.round(H * f); }
    W = Math.max(96, W); H = Math.max(96, H);
    if (W === E.W && H === E.H) return false;
    E.W = W; E.H = H;
    E.canvas.width = W; E.canvas.height = H;
    L0 = u.canvas(W, H); L1 = u.canvas(W, H);
    g0 = L0.getContext('2d', { alpha: false }); g1 = L1.getContext('2d', { alpha: false });
    B1 = u.canvas(W / 4, H / 4); B2 = u.canvas(W / 8, H / 8); B3 = u.canvas(W / 8, H / 8);
    b1c = B1.getContext('2d'); b2c = B2.getContext('2d'); b3c = B3.getContext('2d');
    for (const c of [b1c, b2c, b3c]) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low'; }
    b2c.imageSmoothingQuality = 'medium';
    // vignette
    vign = u.canvas(W, H);
    const vg = vign.getContext('2d');
    const rg = vg.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.6, 'rgba(0,0,0,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0.78)');
    vg.fillStyle = rg; vg.fillRect(0, 0, W, H);
    // grain tile (additive, sparse so black stays near-black)
    const gt = u.canvas(256, 256), gx = gt.getContext('2d'), id = gx.createImageData(256, 256), r = u.rng(1234);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.floor(Math.pow(r(), 1.6) * 255); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    gx.putImageData(id, 0, 0);
    grainPat = E.ctx.createPattern(gt, 'repeat');
    const env = E.env;
    env.W = W; env.H = H; env.S = Math.min(W, H); env.aspect = W / H; env.portrait = H > W; env.scale = E.scale; env.dpr = dpr;
    for (const id2 in Anim.scenes) Anim.scenes[id2]._sizeKey = null;
    return true;
  };

  Anim.defineScene = (def) => { Anim.scenes[def.id] = def; return def; };

  const ensure = (def) => {
    if (!def._inited) { def._inited = true; if (def.init) def.init(E.env); }
    const key = E.W + 'x' + E.H;
    if (def._sizeKey !== key) { def._sizeKey = key; if (def.resize) def.resize(E.env); }
  };
  /** run init/resize of every scene up front (chunked, yields to the event loop) */
  E.prepare = async (onProgress) => {
    const ids = Anim.timeline.scenes.map((s) => s.id);
    for (let i = 0; i < ids.length; i++) {
      const def = Anim.scenes[ids[i]];
      if (def) { try { ensure(def); } catch (e) { E.report(ids[i], e); } }
      if (onProgress) onProgress((i + 1) / ids.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  E.report = (id, e) => {
    Anim.errors.push(`${id}: ${e && e.stack ? e.stack : e}`);
    if (Anim.errors.length < 6) console.error('[scene ' + id + ']', e);
  };

  const drawScene = (g, a, T) => {
    const def = Anim.scenes[a.id];
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, E.W, E.H);
    if (def) {
      try { ensure(def); def.render(g, T, T - a.start, E.env); } catch (e) { E.report(a.id, e); }
    }
    g.restore();
  };

  const sceneFx = (a, T) => {
    const def = Anim.scenes[a.id];
    return def && def.fx ? def.fx(T, T - a.start) : null;
  };

  E.renderAt = (T) => {
    const t0 = performance.now();
    const d = E.ctx, W = E.W, H = E.H;
    const act = Anim.timeline.active(T);
    const base = Anim.timeline.fx(T);
    let fx = { bloom: base.bloom, vignette: base.vignette, grain: base.grain, fade: base.fade };
    if (act.length === 1) {
      drawScene(d, act[0], T);
      const f = sceneFx(act[0], T);
      if (f) Object.assign(fx, f);
    } else {
      drawScene(g0, act[0], T);
      drawScene(g1, act[1], T);
      d.save();
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalAlpha = 1; d.globalCompositeOperation = 'source-over';
      d.drawImage(L0, 0, 0);
      d.globalAlpha = act[1].w;
      d.drawImage(L1, 0, 0);
      d.restore();
      const fa = sceneFx(act[0], T), fb = sceneFx(act[1], T);
      if (fa || fb) {
        for (const k of ['bloom', 'vignette', 'grain']) {
          const va = fa && fa[k] != null ? fa[k] : fx[k], vb = fb && fb[k] != null ? fb[k] : fx[k];
          fx[k] = va + (vb - va) * act[1].w;
        }
      }
    }
    if (!E.noFx) E.post(d, fx, T);
    E.stats.frames++;
    E.stats.lastMs = performance.now() - t0;
  };

  E.post = (d, fx, T) => {
    const W = E.W, H = E.H;
    d.save();
    d.setTransform(1, 0, 0, 1, 0, 0);
    // bloom: highlights only (blur then square)
    if (fx.bloom > 0.005) {
      b1c.globalCompositeOperation = 'copy'; b1c.drawImage(E.canvas, 0, 0, B1.width, B1.height);
      b2c.globalCompositeOperation = 'copy'; b2c.drawImage(B1, 0, 0, B2.width, B2.height);
      b3c.globalCompositeOperation = 'copy'; b3c.drawImage(B2, 0, 0);
      b2c.globalCompositeOperation = 'multiply'; b2c.drawImage(B3, 0, 0);
      b2c.globalCompositeOperation = 'source-over';
      b1c.globalCompositeOperation = 'copy'; b1c.drawImage(B2, 0, 0, B1.width, B1.height);
      d.globalCompositeOperation = 'lighter';
      let s = fx.bloom;
      while (s > 0.001) { d.globalAlpha = Math.min(1, s); d.drawImage(B1, 0, 0, W, H); s -= 1; }
    }
    d.globalCompositeOperation = 'source-over';
    if (fx.vignette > 0.005) { d.globalAlpha = fx.vignette; d.drawImage(vign, 0, 0); }
    if (fx.grain > 0.001 && grainPat) {
      const k = Math.floor(T * 24);
      const ox = Math.floor(u.hash2(k, 11) * 256), oy = Math.floor(u.hash2(k, 23) * 256);
      d.globalCompositeOperation = 'lighter';
      d.globalAlpha = fx.grain;
      d.translate(-ox, -oy);
      d.fillStyle = grainPat;
      d.fillRect(0, 0, W + 256, H + 256);
      d.setTransform(1, 0, 0, 1, 0, 0);
    }
    d.globalCompositeOperation = 'source-over';
    if (fx.fade < 0.999) { d.globalAlpha = 1 - fx.fade; d.fillStyle = '#000'; d.fillRect(0, 0, W, H); }
    d.restore();
  };

  /** benchmark: average ms per renderAt (forces a pixel readback so GPU/raster work is counted) */
  E.bench = (times, reps = 8) => {
    const out = [];
    for (const T of times) {
      const ms = [];
      for (let i = 0; i < reps; i++) {
        const t0 = performance.now();
        E.renderAt(T + i * 0.033);
        E.ctx.getImageData(0, 0, 1, 1);
        ms.push(performance.now() - t0);
      }
      ms.sort((a, b) => a - b);
      out.push({ T, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p90: ms[Math.floor(ms.length * 0.9)] });
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
