/* STUB — to be replaced by the scene author. Keeps the film playable meanwhile. */
(function () {
  const { util: u, hero } = Anim;
  const pinsIn = Anim.hero.pins.find((p) => p.to === 's7_stars');
  const pinsOut = Anim.hero.pins.find((p) => p.from === 's7_stars');
  Anim.defineScene({
    id: 's7_stars',
    render(g, T, L, env) {
      const { W, H, S } = env;
      const sc = Anim.timeline.byId['s7_stars'];
      const k = u.clamp(L / sc.dur);
      const top = u.mixc(u.rgb('#0a1030'), u.rgb('#02030c'), k), bot = u.mixc(u.rgb('#060810'), u.rgb('#070c1e'), k);
      u.vgrad(g, W, H, [[0, u.css(top)], [1, u.css(bot)]]);
      const p = (k < 0.5 ? pinsIn : pinsOut) || pinsIn || pinsOut || { x: 0.5, y: 0.5, r: 0.012, hue: 190, form: 'orb' };
      hero.draw(g, p.x * W, p.y * H, p.r * S, { hue: p.hue, form: p.form, a: 1 });
    },
  });
})();
