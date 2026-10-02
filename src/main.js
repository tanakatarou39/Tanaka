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
  // pixel budget: phones/tablets get a lower cap (canvas memory + fill-rate); desktops up to ~Full HD
  const smallScreen = (G.matchMedia && G.matchMedia('(pointer: coarse)').matches) || Math.min(screen.width, screen.height) < 700;
  E.maxPixels = qs.has('maxpx') ? parseFloat(qs.get('maxpx')) : (smallScreen ? 1.05e6 : 2.1e6);

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

  /* Quality control. Changing the canvas size makes every scene rebuild its buffers (a visible hitch), so
   * we calibrate ONCE while the start card is showing, and only fall back (at most twice) if playback is
   * clearly struggling afterwards. */
  async function calibrate() {
    if (qs.has('q')) return;
    const heavy = [46, 60, 90, 100, 145, 168, 175];
    const run = () => {
      const ms = [];
      for (const T of heavy) for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        E.renderAt(T + i * 0.05);
        E.ctx.getImageData(0, 0, 1, 1); // force the GPU to finish so we measure real cost
        ms.push(performance.now() - t0);
      }
      ms.sort((a, b) => a - b);
      return ms[Math.floor(ms.length * 0.6)];
    };
    run(); // warm up (lazy sprites, JIT)
    const cost = run();
    G.__calibration = { cost, scale: E.scale };
    if (cost > 19 && E.scale > 0.5) {
      const s = Math.max(0.5, E.scale * Math.sqrt(15 / cost));
      E.setSize(E.cssW, E.cssH, E.dpr, s);
      await E.prepare((p) => { $('prep').style.setProperty('--p', (p * 100) + '%'); });
      G.__calibration.scale = E.scale;
    }
  }
  const q = { acc: 0, n: 0, drops: 0 };
  function adapt(dt) {
    if (qs.has('q') || q.drops >= 2) return;
    q.acc += dt; q.n++;
    if (q.n < 120) return;
    const avg = q.acc / q.n; q.acc = 0; q.n = 0;
    if (avg > 0.042 && E.scale > 0.5) {
      q.drops++;
      E.setSize(E.cssW, E.cssH, E.dpr, Math.max(0.5, E.scale * 0.75));
    }
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
  // after a window resize / rotation: rebuild every scene's buffers while paused, then carry on
  let resizeTimer = 0;
  G.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      const was = clock.playing;
      if (was) api.pause();
      fit();
      await E.prepare();
      clock.dirty = true;
      if (was) api.play();
    }, 300);
  });

  async function boot() {
    Anim.ui.init(api);
    fit();
    await E.prepare((p) => { $('prep').style.setProperty('--p', (p * 100) + '%'); });
    await calibrate();
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) {}
    document.body.classList.add('ready');
    clock.dirty = true;
    G.__ready = true;
    requestAnimationFrame(frame);
    const beginWith = (sound) => {
      document.body.classList.add('started');
      api.setMuted(!sound);
      clock.playing = false;
      api.play(); // starts the audio too (inside this click = user gesture)
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
    renderSolo(id, T) { clock.T = T; E.renderSolo(id, T); },
    renderAt(T, withUI) { clock.T = T; E.renderAt(T); if (withUI) Anim.ui.update(T); },
    setSize(w, h) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; E.setSize(w, h, qs.has('dpr') ? parseFloat(qs.get('dpr')) : 1, qs.has('q') ? parseFloat(qs.get('q')) : 1); },
  };
  boot();
})(window);
