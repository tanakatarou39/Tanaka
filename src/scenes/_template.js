/* TEMPLATE — shows the idioms every scene must follow. Not loaded by index.html.
 *
 * Rules recap (full text: docs/DESIGN.md):
 *  - render(g, T, L, env) is a PURE function of time. No state carried between frames
 *    (static precomputed geometry from a seeded rng in init/resize is fine). Particles are analytic:
 *    position = f(seed_i, T). Never use Math.random() or Date.now().
 *  - Paint an OPAQUE background first (the layer is pre-filled black, but you own every pixel).
 *  - Size everything from env: W,H (px), S = min(W,H). Support aspect 9:16 … 21:9.
 *  - L = seconds since your scene's start (can be slightly <0 / >dur while cross-fading).
 *  - Use Anim.hero.draw() for the drop and honour Anim.hero.pins inside your cross-fade windows.
 *  - Use additive 'lighter' glows (Anim.util.glow uses cached sprites => thousands are cheap).
 */
(function () {
  const { util: u, hero } = Anim;

  const N = 160;
  let motes = []; // static seeds, normalised coordinates -> survive resizes

  Anim.defineScene({
    id: 's_template',

    init(env) {
      const r = u.rng(20240601);
      motes = Array.from({ length: N }, () => ({
        x: r(), y: r(), z: 0.15 + r() * 0.85, ph: r() * u.TAU, hue: 175 + r() * 30,
      }));
    },

    resize(env) { /* rebuild any cached offscreen buffers sized from env.W/env.H here */ },

    /** optional: per-scene post-fx override {bloom, vignette, grain} (cross-faded by the engine) */
    fx(T, L) { return { bloom: 0.8 }; },

    render(g, T, L, env) {
      const { W, H, S } = env;
      const dur = Anim.timeline.byId.s_template ? Anim.timeline.byId.s_template.dur : 30;
      const k = u.clamp(L / dur); // 0..1 progress through the scene

      // 1) background (opaque), colours animate with keyframes
      const top = u.keyc([[0, '#04142a'], [1, '#0f6a8a']], k), bot = u.keyc([[0, '#010409'], [1, '#06293f']], k);
      u.vgrad(g, W, H, [[0, u.css(top)], [1, u.css(bot)]]);

      // 2) parallax particle field, analytic: y wraps with time, x sways
      for (const m of motes) {
        const speed = 0.02 + 0.05 * m.z; // fraction of screen height / second
        const y = u.wrap(m.y + L * speed, 0, 1);
        const x = m.x + Math.sin(L * 0.3 + m.ph) * 0.01 * m.z;
        const tw = 0.5 + 0.5 * Math.sin(L * 1.3 + m.ph * 3);
        u.glow(g, x * W, y * H, S * 0.012 * m.z + 1.5, m.hue, 80, 70, 0.35 * m.z * tw);
      }

      // 3) hero — keep it at the pinned state inside overlaps; free elsewhere
      const pin = hero.pins[0];
      hero.draw(g, pin.x * W, pin.y * H, pin.r * S, { hue: pin.hue, form: pin.form, pulse: 1 + 0.08 * Math.sin(L * 2.6) });
    },
  });
})();
