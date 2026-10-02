/* ひとしずくの旅 — the hero ("the drop of light"): shared look + handoff table.
 *
 * The hero is drawn by each scene (so it can sit between that scene's depth layers), using
 * Anim.hero.draw(). Inside every cross-fade window the hero MUST be at the pinned state below in
 * BOTH scenes, otherwise the dissolve shows two drops. Elsewhere each scene moves it freely.
 *   x,y : normalised screen position (0..1, y down)      r : core radius in units of S=min(W,H)
 *   hue : HSL hue of the glow                              form: 'orb' | 'drop' | 'seed' | 'star'
 */
(function (G) {
  'use strict';
  const Anim = (G.Anim = G.Anim || {});
  const u = Anim.util;

  /** pinned hero state for each cross-fade window (index = window index, see Anim.timeline.windows) */
  const pins = [
    { id: 'B1', from: 's1_awakening', to: 's2_deepsea', a: 14, b: 18, x: 0.5, y: 0.5, r: 0.012, hue: 190, form: 'orb' },
    { id: 'B2', from: 's2_deepsea', to: 's3_surface', a: 44, b: 48, x: 0.5, y: 0.56, r: 0.014, hue: 186, form: 'orb' },
    { id: 'B3', from: 's3_surface', to: 's4_sky', a: 72, b: 76, x: 0.5, y: 0.48, r: 0.016, hue: 48, form: 'orb' },
    { id: 'B4', from: 's4_sky', to: 's5_rain', a: 98, b: 102, x: 0.5, y: 0.4, r: 0.015, hue: 205, form: 'drop' },
    { id: 'B5', from: 's5_rain', to: 's6_tree', a: 122, b: 126, x: 0.5, y: 0.56, r: 0.014, hue: 200, form: 'drop' },
    { id: 'B6', from: 's6_tree', to: 's7_stars', a: 152, b: 156, x: 0.5, y: 0.46, r: 0.016, hue: 48, form: 'orb' },
    { id: 'B7', from: 's7_stars', to: 's8_return', a: 166, b: 170, x: 0.5, y: 0.3, r: 0.018, hue: 215, form: 'star' },
  ];

  /** lub-dub heart-beat envelope in [0,1]; period seconds */
  function beat(T, period = 2.4) {
    const p = (((T % period) + period) % period) / period;
    const a = Math.exp(-Math.pow((p - 0.06) / 0.05, 2)); // lub
    const b = 0.65 * Math.exp(-Math.pow((p - 0.24) / 0.06, 2)); // dub
    return Math.min(1, a + b);
  }

  /**
   * draw the hero. x,y,r in pixels (r = core radius).
   * o: { hue=190, sat=90, a=1 (intensity), pulse=1 (radius multiplier), glow=1, flare=0 (0..1 cross flare),
   *      form='orb'|'drop'|'seed'|'star', angle=0 (rad; drop tip direction, 0 = tip up) }
   */
  function draw(g, x, y, r, o = {}) {
    const hue = o.hue == null ? 190 : o.hue, sat = o.sat == null ? 90 : o.sat;
    const a = o.a == null ? 1 : o.a, pulse = o.pulse == null ? 1 : o.pulse, gl = o.glow == null ? 1 : o.glow;
    const form = o.form || 'orb';
    const R = r * pulse;
    if (a <= 0.003) return;
    u.glow(g, x, y, R * 18, hue, sat, 58, 0.2 * a * gl, 'soft');
    u.glow(g, x, y, R * 7, hue, sat, 62, 0.5 * a * gl, 'soft');
    if (form === 'drop') {
      // a proper teardrop: long curved taper, bright all the way to the tip, glassy rim, additive core on top
      const D = R * 1.2;
      g.save();
      g.translate(x, y);
      g.rotate(o.angle || 0);
      const p = new Path2D();
      p.moveTo(0, -D * 2.55);
      p.bezierCurveTo(D * 0.12, -D * 1.95, D * 1.02, -D * 1.0, D * 1.02, D * 0.22);
      p.arc(0, D * 0.22, D * 1.02, 0, Math.PI);
      p.bezierCurveTo(-D * 1.02, -D * 1.0, -D * 0.12, -D * 1.95, 0, -D * 2.55);
      p.closePath();
      g.globalAlpha = Math.min(1, a);
      const lg = g.createLinearGradient(0, -D * 2.55, 0, D * 1.25);
      lg.addColorStop(0, u.hsl(hue, sat * 0.35, 97, 0.98));
      lg.addColorStop(0.45, u.hsl(hue, sat * 0.55, 92, 0.97));
      lg.addColorStop(1, u.hsl(hue, sat * 0.9, 78, 0.9));
      g.fillStyle = lg;
      g.fill(p);
      g.lineWidth = Math.max(1, D * 0.1);
      g.strokeStyle = u.hsl(hue, sat * 0.3, 99, 0.85);
      g.stroke(p);
      g.restore();
      u.glow(g, x, y - D * 0.1, D * 2.4, hue, sat * 0.6, 90, 0.55 * a, 'core');
    } else if (form === 'seed') {
      g.save();
      g.translate(x, y);
      g.rotate(o.angle || 0);
      g.globalAlpha = Math.min(1, a);
      g.beginPath();
      g.ellipse(0, 0, R * 1.0, R * 1.55, 0, 0, u.TAU);
      const gr = g.createRadialGradient(-R * 0.2, -R * 0.4, R * 0.1, 0, 0, R * 1.7);
      gr.addColorStop(0, u.hsl(hue, 60, 90, 1));
      gr.addColorStop(0.6, u.hsl(hue, 75, 62, 0.95));
      gr.addColorStop(1, u.hsl(hue, 80, 38, 0.9));
      g.fillStyle = gr;
      g.fill();
      g.restore();
      u.glow(g, x, y, R * 3.6, hue, sat * 0.7, 80, 0.6 * a, 'core');
    } else {
      u.glow(g, x, y, R * 3.0, hue, sat * 0.5, 86, 0.95 * a, 'core');
      g.fillStyle = u.hsl(hue, 40, 97, Math.min(1, a));
      g.beginPath();
      g.arc(x, y, Math.max(0.6, R * 0.5), 0, u.TAU);
      g.fill();
    }
    const fl = form === 'star' ? Math.max(o.flare == null ? 1 : o.flare, 0) : o.flare || 0;
    if (fl > 0.01) {
      const L = R * 34 * fl;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(x, y);
      // [angle, length]: long horizontal, shorter vertical and diagonals (a full-height vertical hairline reads as a stray string)
      const rays = [[0, 1.0, 1.0], [Math.PI, 0, 0], [Math.PI / 2, 0.42, 0.9], [Math.PI / 4, 0.46, 0.55], [-Math.PI / 4, 0.46, 0.55]];
      for (const [ang, kl, ka] of rays) {
        if (kl <= 0) continue;
        const len = L * kl;
        g.save();
        g.rotate(ang + (o.flareRot || 0));
        const lg = g.createLinearGradient(-len, 0, len, 0);
        const c0 = u.hsl(hue, sat * 0.4, 92, 0), c1 = u.hsl(hue, sat * 0.4, 94, 0.75 * a * ka);
        lg.addColorStop(0, c0); lg.addColorStop(0.5, c1); lg.addColorStop(1, c0);
        g.fillStyle = lg;
        g.fillRect(-len, -R * 0.09, len * 2, R * 0.18);
        g.restore();
      }
      g.restore();
    }
  }

  Anim.hero = { pins, beat, draw };
})(typeof window !== 'undefined' ? window : globalThis);
