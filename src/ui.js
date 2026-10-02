/* ひとしずくの旅 — DOM layer: captions, start card, transport bar. */
(function (G) {
  'use strict';
  const Anim = (G.Anim = G.Anim || {});
  const u = Anim.util;
  const $ = (id) => document.getElementById(id);

  const UI = (Anim.ui = {});
  let capEl, enEl, jpEl, titleEl, cueIndex = -1, chars = [];
  let hideTimer = 0;

  const fmt = (t) => {
    t = Math.max(0, Math.floor(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };

  UI.init = (api) => {
    capEl = $('captions');
    UI.api = api;
    const bar = $('bar'), seek = $('seek'), play = $('play'), snd = $('snd'), fs = $('fs');
    // chapter ticks
    const ticks = $('ticks');
    for (const s of Anim.timeline.scenes) {
      const el = document.createElement('i');
      el.style.left = (s.start / Anim.DURATION) * 100 + '%';
      el.title = s.name;
      ticks.appendChild(el);
    }
    seek.max = String(Anim.DURATION);
    seek.addEventListener('input', () => api.seek(parseFloat(seek.value)));
    play.addEventListener('click', (e) => { e.stopPropagation(); api.toggle(); });
    snd.addEventListener('click', (e) => { e.stopPropagation(); api.toggleMute(); });
    fs.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = document;
      if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen();
      else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
    });
    $('stage').addEventListener('click', () => { api.toggle(); UI.poke(); });
    G.addEventListener('mousemove', UI.poke);
    G.addEventListener('touchstart', UI.poke, { passive: true });
    G.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); api.toggle(); }
      else if (e.code === 'ArrowRight') api.seek(api.time() + 5);
      else if (e.code === 'ArrowLeft') api.seek(api.time() - 5);
      else if (e.key === 'm' || e.key === 'M') api.toggleMute();
      else if (e.key === 'f' || e.key === 'F') fs.click();
      UI.poke();
    });
    UI.poke();
  };

  UI.poke = () => {
    document.body.classList.add('active');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (UI.api && UI.api.playing()) document.body.classList.remove('active');
    }, 2800);
  };

  UI.setPlaying = (p) => { $('play').setAttribute('aria-label', p ? '一時停止' : '再生'); $('play').dataset.state = p ? 'pause' : 'play'; if (!p) document.body.classList.add('active'); };
  UI.setMuted = (m) => { $('snd').dataset.state = m ? 'off' : 'on'; $('snd').setAttribute('aria-label', m ? '音を出す' : '音を消す'); };

  let boxEl;
  function buildCue(i) {
    capEl.textContent = '';
    cueIndex = i;
    chars = [];
    if (i < 0) return;
    const c = Anim.timeline.cues[i];
    const kind = c.kind || 'line';
    capEl.className = 'cap-' + kind;
    boxEl = document.createElement('div'); boxEl.className = 'box';
    jpEl = document.createElement('div'); jpEl.className = 'jp';
    // group characters into phrases (split after 、 and 。) so line breaks only happen between phrases
    const phrases = c.jp.match(/[^、。]+[、。]?|[、。]/g) || [c.jp];
    for (const ph of phrases) {
      const p = document.createElement('span'); p.className = 'ph';
      for (const ch of Array.from(ph)) {
        const s = document.createElement('span');
        s.className = 'c'; s.textContent = ch;
        p.appendChild(s);
        chars.push(s);
      }
      jpEl.appendChild(p);
    }
    enEl = document.createElement('div'); enEl.className = 'en'; enEl.textContent = c.en;
    boxEl.appendChild(jpEl); boxEl.appendChild(enEl);
    capEl.appendChild(boxEl);
  }

  /** called every frame with global time */
  UI.update = (T) => {
    const cues = Anim.timeline.cues;
    let idx = -1;
    for (let i = 0; i < cues.length; i++) if (T >= cues[i].t0 && T <= cues[i].t1) { idx = i; break; }
    if (idx !== cueIndex) buildCue(idx);
    if (idx >= 0) {
      const c = cues[idx];
      const tin = T - c.t0, tout = c.t1 - T;
      const n = chars.length, stagger = c.kind === 'title' ? 0.16 : 0.055;
      const fadeOut = u.smoothstep(0, 1.1, tout);
      for (let i = 0; i < n; i++) {
        const k = u.smoothstep(i * stagger, i * stagger + 1.0, tin);
        const s = chars[i];
        s.style.opacity = (k * fadeOut).toFixed(3);
        s.style.transform = `translateY(${((1 - k) * 0.35).toFixed(3)}em)`;
        s.style.filter = k < 0.98 ? `blur(${((1 - k) * 6).toFixed(2)}px)` : 'none';
      }
      const en = u.smoothstep(0.6 + n * stagger * 0.5, 1.8 + n * stagger * 0.5, tin) * fadeOut;
      enEl.style.opacity = (en * 0.95).toFixed(3);
      boxEl.style.setProperty('--scrim', (u.smoothstep(0, 0.9, tin) * fadeOut).toFixed(3));
    }
    const seek = $('seek');
    if (!UI.dragging) seek.value = String(T);
    $('time').textContent = fmt(T) + ' / ' + fmt(Anim.DURATION);
    seek.style.setProperty('--p', ((T / Anim.DURATION) * 100).toFixed(2) + '%');
  };
})(window);
