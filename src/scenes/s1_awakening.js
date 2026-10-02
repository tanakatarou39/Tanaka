/* STUB — to be replaced by the scene author. Keeps the film playable meanwhile. */
(function () {
  const { util: u, hero } = Anim;
  const pinsIn = Anim.hero.pins.find((p) => p.to === 's1_awakening');
  const pinsOut = Anim.hero.pins.find((p) => p.from === 's1_awakening');
  Anim.defineScene({
    id: 's1_awakening',
    render(g, T, L, env) {
      const { W, H, S } = env;
      const sc = Anim.timeline.byId['s1_awakening'];
      const k = u.clamp(L / sc.dur);
      const top = u.mixc(u.rgb('#000000'), u.rgb('#04142a'), k), bot = u.mixc(u.rgb('#000000'), u.rgb('#010409'), k);
      u.vgrad(g, W, H, [[0, u.css(top)], [1, u.css(bot)]]);
      const p = (k < 0.5 ? pinsIn : pinsOut) || pinsIn || pinsOut || { x: 0.5, y: 0.5, r: 0.012, hue: 190, form: 'orb' };
      hero.draw(g, p.x * W, p.y * H, p.r * S, { hue: p.hue, form: p.form, a: u.smoothstep(0, 4, L) });
    },
  });
})();
