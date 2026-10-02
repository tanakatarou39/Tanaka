/* ひとしずくの旅 — boot, playback clock, adaptive quality, test hooks. */
(function (G) {
  'use strict';
  const Anim = G.Anim, E = Anim.engine, u = Anim.util;
  const qs = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);

  const clock = { T: 0, playing: false, last: 0, started: false };
  let muted = false;
  const canvas = $('c');
  E.attach(canvas);
  if (qs.has('maxpx')) E.maxPixels = parseFloat(qs.get('maxpx'));

  function fit() {
    const w = G.innerWidth, h = G.innerHeight, dpr = G.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const q = qs.has('q') ? parseFloat(qs.get('q')) : undefined;
    E.setSize(w, h, qs.has('dpr') ? parseFloat(qs.get('dpr')) : dpr, q);
    E.renderAt(clock.T);
  }

  const api = {
    time: () => clock.T,
    playing: () => clock.playing,
    seek(T) {
      clock.T = u.clamp(T, 0, Anim.DURATION - 0.001);
      if (clock.playing && Anim.audio.supported) Anim.audio.seek(clock.T);
      E.renderAt(clock.T);
      Anim.ui.update(clock.T);
    },
    play() {
      if (clock.playing) return;
      clock.playing = true; clock.last = performance.now();
      if (Anim.audio.supported && !muted) Anim.audio.start(clock.T);
      Anim.ui.setPlaying(true);
    },
    pause() {
      clock.playing = false;
      if (Anim.audio.supported) Anim.audio.stop();
      Anim.ui.setPlaying(false);
    },
    toggle() { clock.playing ? api.pause() : api.play(); },
    toggleMute() {
      muted = !muted;
      if (Anim.audio.supported) {
        Anim.audio.setMuted(muted);
        if (!muted && clock.playing) Anim.audio.start(clock.T);
      }
      Anim.ui.setMuted(muted);
    },
    setMuted(m) { muted = m; Anim.ui.setMuted(m); if (Anim.audio.supported) Anim.audio.setMuted(m); },
  };

  /* adaptive resolution: keep the frame loop near 60 fps on weak devices */
  const q = { acc: 0, n: 0, cool: 0 };
  function adapt(dt) {
    if (qs.has('q')) return;
    q.acc += dt; q.n++;
    if (q.cool > 0) q.cool--;
    if (q.n < 45) return;
    const avg = q.acc / q.n; q.acc = 0; q.n = 0;
    if (q.cool > 0) return;
    if (avg > 0.0225 && E.scale > 0.5) { E.setSize(E.cssW, E.cssH, E.dpr, Math.max(0.5, E.scale * 0.82)); q.cool = 2; }
    else if (avg < 0.0125 && E.scale < 1) { E.setSize(E.cssW, E.cssH, E.dpr, Math.min(1, E.scale * 1.12)); q.cool = 4; }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (clock.playing) {
      const dt = Math.min(0.1, (now - clock.last) / 1000);
      clock.last = now;
      clock.T += dt;
      if (clock.T >= Anim.DURATION) {
        clock.T = 0;
        if (Anim.audio.supported && !muted) Anim.audio.seek(0);
      }
      adapt(dt);
    }
    if (clock.playing || clock.dirty) {
      E.renderAt(clock.T);
      Anim.ui.update(clock.T);
      clock.dirty = false;
    }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden && clock.playing) api.pause(); });
  G.addEventListener('resize', () => { fit(); clock.dirty = true; });

  async function boot() {
    Anim.ui.init(api);
    fit();
    await E.prepare((p) => { $('prep').style.setProperty('--p', (p * 100) + '%'); });
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) {}
    document.body.classList.add('ready');
    clock.dirty = true;
    G.__ready = true;
    requestAnimationFrame(frame);
    const beginWith = (sound) => {
      document.body.classList.add('started');
      api.setMuted(!sound);
      if (sound && Anim.audio.supported) Anim.audio.start(clock.T);
      clock.playing = false; api.play();
      if (!sound || !Anim.audio.supported) { /* silent playback */ }
    };
    $('go').addEventListener('click', () => beginWith(true));
    $('goquiet').addEventListener('click', () => beginWith(false));
    if (!Anim.audio.supported) { $('go').textContent = 'はじめる'; $('goquiet').hidden = true; }
    // test / capture hooks
    if (qs.has('t')) {
      clock.T = parseFloat(qs.get('t'));
      document.body.classList.add('started', 'active');
      if (qs.get('cap') === '0') document.body.classList.add('nocap');
      clock.dirty = true; E.renderAt(clock.T); Anim.ui.update(clock.T);
    }
    if (qs.has('autoplay')) beginWith(false);
  }

  G.__anim = {
    api, clock, engine: E,
    renderAt(T, withUI) { clock.T = T; E.renderAt(T); if (withUI) Anim.ui.update(T); },
    setSize(w, h) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; E.setSize(w, h, qs.has('dpr') ? parseFloat(qs.get('dpr')) : 1, qs.has('q') ? parseFloat(qs.get('q')) : 1); },
  };
  boot();
})(window);
