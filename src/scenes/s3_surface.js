/* STUB — to be replaced by the scene author. Keeps the film playable meanwhile. */
(function () {
  const { util: u, hero } = Anim;
  const pinsIn = Anim.hero.pins.find((p) => p.to === 's3_surface');
  const pinsOut = Anim.hero.pins.find((p) => p.from === 's3_surface');
  Anim.defineScene({
    id: 's3_surface',
    render(g, T, L, env) {
      const { W, H, S } = env;
      const sc = Anim.timeline.byId['s3_surface'];
      const k = u.clamp(L / sc.dur);
      const top = u.mixc(u.rgb('#0f6a8a'), u.rgb('#6f8fc4'), k), bot = u.mixc(u.rgb('#06293f'), u.rgb('#ffd9a0'), k);
      u.vgrad(g, W, H, [[0, u.css(top)], [1, u.css(bot)]]);
      const p = (k < 0.5 ? pinsIn : pinsOut) || pinsIn || pinsOut || { x: 0.5, y: 0.5, r: 0.012, hue: 190, form: 'orb' };
      hero.draw(g, p.x * W, p.y * H, p.r * S, { hue: p.hue, form: p.form, a: 1 });
    },
  });
})();
