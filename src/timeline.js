/* ひとしずくの旅 — timeline: chapters, caption cues, global post-fx.
 * Scene intervals overlap by 4 s; inside an overlap the two scenes are cross-faded, and BOTH must
 * draw the same hero state / matching background (see docs/DESIGN.md "Handoff contract").
 */
(function (G) {
  'use strict';
  const Anim = (G.Anim = G.Anim || {});
  const u = Anim.util;

  const scenes = [
    { id: 's1_awakening', name: '目ざめ', en: 'Awakening', start: 0, end: 18 },
    { id: 's2_deepsea', name: '深海', en: 'Deep Sea', start: 14, end: 48 },
    { id: 's3_surface', name: '夜明け', en: 'Dawn', start: 44, end: 76 },
    { id: 's4_sky', name: '空と雲', en: 'Sky', start: 72, end: 102 },
    { id: 's5_rain', name: '雨', en: 'Rain', start: 98, end: 126 },
    { id: 's6_tree', name: '芽ばえと季節', en: 'Seasons', start: 122, end: 156 },
    { id: 's7_stars', name: '星', en: 'Stars', start: 152, end: 170 },
    { id: 's8_return', name: '還る', en: 'Return', start: 166, end: 180 },
  ];

  /* Captions (DOM, drawn by ui.js). kind: 'title' (centre, large) | 'line' (bottom) | 'end' */
  const cues = [
    { t0: 8.0, t1: 15.8, kind: 'title', jp: 'ひとしずくの旅', en: 'The Journey of a Single Drop of Light' },
    { t0: 17.5, t1: 23.2, jp: '音のない、いちばん深い場所で。', en: 'In the deepest place, where there is no sound,' },
    { t0: 23.8, t1: 30.0, jp: 'ひとしずくの光が、ゆっくりと目をさました。', en: 'a single drop of light slowly awoke.' },
    { t0: 32.0, t1: 39.5, jp: '大きな影が、静かに通りすぎていく。', en: 'A vast shadow drifts past, without a sound.' },
    { t0: 41.0, t1: 48.5, jp: '上へ、上へ。あかるい方へ。', en: 'Up, and further up, toward the light.' },
    { t0: 58.0, t1: 64.5, jp: '水面のむこうに、朝があった。', en: 'Beyond the surface, there was morning.' },
    { t0: 65.0, t1: 71.5, jp: 'ひとしずくは光にとけて、空へのぼる。', en: 'Melting into the light, it rose into the sky.' },
    { t0: 77.0, t1: 84.0, jp: '空では、たくさんのしずくが待っていた。', en: 'Up there, countless drops were waiting.' },
    { t0: 85.0, t1: 92.5, jp: 'ひとつ、またひとつ。集まって、雲になった。', en: 'One by one they gathered, and became a cloud.' },
    { t0: 93.5, t1: 101.0, jp: '雲は、すこしずつ重くなっていく。', en: 'The cloud grew heavier, little by little.' },
    { t0: 103.0, t1: 110.0, jp: 'そして、雨になって、落ちていく。', en: 'And then it fell, as rain.' },
    { t0: 111.0, t1: 119.0, jp: '山をこえ、森をぬけて、大地のなかへ。', en: 'Over the mountains, through the forest, into the earth.' },
    { t0: 123.0, t1: 130.0, jp: 'そこには、眠りつづける小さな種があった。', en: 'There, a small seed had been sleeping.' },
    { t0: 131.0, t1: 138.0, jp: 'ひとしずくに触れて、種は目をさます。', en: 'Touched by the drop, the seed awoke.' },
    { t0: 139.0, t1: 147.5, jp: '春、夏、秋、冬。いくつもの季節をこえて、', en: 'Spring, summer, autumn, winter — season after season,' },
    { t0: 148.0, t1: 154.0, jp: '木は、空にむかってのびていった。', en: 'the tree reached up toward the sky.' },
    { t0: 155.5, t1: 160.5, jp: '夜が来て、木は光を空へ返した。', en: 'When night came, the tree gave its light back to the sky.' },
    { t0: 161.0, t1: 166.0, jp: 'ひとしずくは、星になった。', en: 'The drop became a star.' },
    { t0: 167.0, t1: 172.0, jp: '星はやがて、海へと帰っていく。', en: 'And in time, the star returns to the sea.' },
    { t0: 173.2, t1: 179.2, kind: 'end', jp: 'ひとしずくの旅は、また、はじまる。', en: 'The journey begins again.' },
  ];

  const byId = {};
  scenes.forEach((s, i) => { s.index = i; s.dur = s.end - s.start; byId[s.id] = s; });

  /** overlap windows [a,b] between scene i and i+1 */
  const windows = [];
  for (let i = 0; i + 1 < scenes.length; i++) windows.push({ a: scenes[i + 1].start, b: scenes[i].end, from: scenes[i].id, to: scenes[i + 1].id });

  /** Which scenes are drawn at T. Returns [{id,start,end,w}] (w = layer weight; 1 for the first) */
  function active(T) {
    const out = [];
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (T >= s.start && T <= s.end) out.push({ id: s.id, start: s.start, end: s.end, w: 1 });
    }
    if (out.length === 0) {
      const s = T < scenes[0].start ? scenes[0] : scenes[scenes.length - 1];
      return [{ id: s.id, start: s.start, end: s.end, w: 1 }];
    }
    if (out.length > 1) {
      const nxt = byId[out[1].id], prv = byId[out[0].id];
      out[1].w = u.smootherstep(nxt.start, prv.end, T);
    }
    return out;
  }

  /** global post-fx (scenes may override bloom/vignette/grain through an optional scene.fx(T, L)) */
  function fx(T) {
    return {
      bloom: u.keys([[0, 0.9], [14, 0.8], [44, 0.55], [60, 0.8], [76, 0.5], [100, 0.4], [126, 0.5], [156, 0.75], [162, 1.0], [170, 0.85], [180, 0.9]], T),
      vignette: 0.55,
      grain: 0.022,
      fade: u.smoothstep(0, 1.2, T) * (1 - u.smoothstep(178.4, 180, T)),
    };
  }

  Anim.timeline = { scenes, byId, cues, windows, active, fx, DURATION: Anim.DURATION };
})(typeof window !== 'undefined' ? window : globalThis);
