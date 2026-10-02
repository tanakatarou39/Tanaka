/* ひとしずくの旅 — generative score (placeholder; replaced by the audio author).
 * Contract (do not change the shape):
 *   Anim.audio.supported            boolean
 *   Anim.audio.start(T)             (user gesture) create/resume context and play from T seconds
 *   Anim.audio.stop()               pause (keeps context)
 *   Anim.audio.seek(T)              jump while playing
 *   Anim.audio.setMuted(bool)       smooth mute/unmute
 *   Anim.audio.build(ctx, dest, fromT, toT, opts)  schedule the score for [fromT,toT) into ANY BaseAudioContext
 *                                   (so OfflineAudioContext can render it for verification)
 */
(function (G) {
  'use strict';
  const Anim = (G.Anim = G.Anim || {});
  Anim.audio = {
    supported: false,
    start() {}, stop() {}, seek() {}, setMuted() {}, build() {},
  };
})(typeof window !== 'undefined' ? window : globalThis);
