# ひとしずくの旅 — The Journey of a Single Drop of Light

A 3:00 generative film in one HTML file (Canvas 2D, no assets). One continuous story, no cuts:

> A drop of light wakes in the dark deep sea → rises through the water → breaks the surface at dawn →
> turns to vapour and rises into the sky → gathers with other drops into a cloud → falls as rain over
> mountains and forest → sinks into the soil and wakes a seed → the seed becomes a tree that lives through
> the four seasons → at night the tree returns its light to the sky and the drop becomes a star → the star
> falls back into the sea → the ripple closes into the single point of light we began with (the film loops).

The cycle of water and light. Every scene is a *place* the same drop passes through; the drop is the thread.
Captions (Japanese + English, in `src/timeline.js`) narrate it — **scenes never draw text**.

Quality bar: it must be **beautiful** (luminous, soft, layered, harmonious colour) and must **never get
boring** (something new and slightly surprising every ~6 s, constant gentle motion on several depth layers,
one "wow" moment per scene, smooth camera, varied rhythm: calm → swell → release).

---------------------------------------------------------------------------------------------------

## 1. Timeline (global seconds T, total 180)

| id            | name        | start | end | note |
|---------------|-------------|------:|----:|------|
| s1_awakening  | 目ざめ       |   0   |  18 | black void → heartbeat of one point of light |
| s2_deepsea    | 深海         |  14   |  48 | plankton, jellyfish, a whale, fish; rising |
| s3_surface    | 夜明け       |  44   |  76 | caustics, break the surface, dawn sea, vapour |
| s4_sky        | 空と雲       |  72   | 102 | ascent through clouds, drops gather, cloud darkens |
| s5_rain       | 雨           |  98   | 126 | rain, mountains, forest canopy, into the soil |
| s6_tree       | 芽ばえと季節  | 122   | 156 | seed wakes, sapling→tree, four seasons, dusk |
| s7_stars      | 星           | 152   | 170 | petals rise → stars, Milky Way, aurora, constellation |
| s8_return     | 還る         | 166   | 180 | star falls into a starry sea, ripples, dive, one point of light |

Scenes overlap by 4 s (the *windows*). In a window both scenes render and the engine dissolves
A→B with `smootherstep` (B's weight rises 0→1 across the window). Window k = `Anim.timeline.windows[k]`:
B1 14–18, B2 44–48, B3 72–76, B4 98–102, B5 122–126, B6 152–156, B7 166–170.

Loop: T=180 is black with nothing on screen; T=0 is black. `fade` in `timeline.js` handles 0→1.2 s and 178.4→180 s.

## 2. Engine contract (what a scene file is)

```js
(function () {
  const { util: u, hero } = Anim;
  Anim.defineScene({
    id: 's2_deepsea',                  // EXACT id from the table
    init(env) {},                       // once: seeded static data (never Math.random)
    resize(env) {},                     // whenever W/H change: (re)build cached offscreen buffers
    fx(T, L) { return { bloom: 0.6 }; },// OPTIONAL post-fx override {bloom,vignette,grain}
    render(g, T, L, env) {},            // g = CanvasRenderingContext2D, T = global s, L = T - start (s)
  });
})();
```
* `env = {W,H,S,aspect,portrait,scale,dpr}`; pixel units; `S = min(W,H)`.
* **Pure function of T.** No state carried frame to frame. No `Math.random()`, `Date`, `performance.now()`.
  Use `u.rng(seed)` / `u.hash` / `u.noise*` at init time, and *analytic* particles `pos = f(seed_i, T)`
  (`u.wrap` for endless drift). Seeking, looping and frame-exact capture all rely on this. `tools/check.mjs` enforces it.
* **Paint the whole canvas** (opaque). The layer is pre-filled black, but you own every pixel.
* `L` can be a little negative or beyond the scene length while cross-fading — keep rendering sensibly (clamp envelopes, keep motion going).
* Scenes must work for aspect ratios from **9:16 (portrait phone) to 21:9**. Size things with `S`, spread across the long axis with `W`/`H`,
  keep the hero and the key subject inside the centre ~60 % × 80 %, and add content (not just stretch) when the screen is tall or wide.
* **No text** on the canvas (captions are DOM). **No external assets** (no images/fonts/audio files). Everything is procedural.
* Use the shared hero: `Anim.hero.draw(g, xPx, yPx, rPx, {hue, form, a, pulse, glow, flare, angle})`.
* Post-fx (bloom of highlights, vignette, grain) is applied by the engine on top. Bright, additive glows will bloom — don't double up. If your scene is very bright (day sky) lower `bloom` through `fx()`.
* Helpers in `Anim.util`: `clamp lerp invLerp remap smoothstep smootherstep wrap ease.* keys(spline/smooth/linear) rng hash hash2 noise1 noise2 fbm1 fbm2 rgb mixc css keyc hsl canvas sprite vgrad grad glow glowSprite`.
  Read `src/core.js` (≈300 lines) before you start; `src/scenes/_template.js` shows the idioms.

### Performance (must hold on a phone)
* Target ≤ ~12 ms/frame on a mid phone GPU. Rule of thumb: ≤ ~12 full-screen-equivalent overdraw passes per scene per frame,
  ≤ ~1500 sprite draws, **no** `ctx.filter`, **no** `shadowBlur`, **no** `getImageData` of the full canvas, no per-pixel JS loop over the full canvas.
* Allowed and encouraged: precompute static art into offscreen canvases in `resize()`; cached `u.glow` sprites; gradients created once per frame (not per particle);
  low-res procedural fields (e.g. a 96×54 `ImageData` of fbm noise written each frame, ≤ 6 000 px, then `drawImage` upscaled with smoothing) for clouds/caustics/aurora/haze.
* Measure with `node tools/perf.mjs --nofx --times <list>`: headless software raster is ~4–8× slower than a GPU.
  Budget in this sandbox at 1280×720: **scene alone (`--nofx`) p90 ≤ 30 ms outside windows, ≤ 45 ms inside windows** (two scenes run). Empty stub ≈ 9 ms.
* Avoid per-frame allocation in hot loops (GC hitches): reuse arrays/objects, precompute colour strings per bucket.

## 3. Handoff contract (this is what makes it one unbroken film)

In every window **both** scenes must show the same hero state and a matching world, so the dissolve is invisible.
Inside a window the hero is **pinned** (stationary on screen; the world may keep moving) — values in `Anim.hero.pins`:

| window | T | hero (x,y) | r (×S) | hue | form |
|---|---|---|---|---|---|
| B1 s1→s2 | 14–18  | .50,.50 | .012 | 190 | orb  |
| B2 s2→s3 | 44–48  | .50,.56 | .014 | 186 | orb  |
| B3 s3→s4 | 72–76  | .50,.48 | .016 |  48 | orb (a vapour-bright glow) |
| B4 s4→s5 | 98–102 | .50,.40 | .015 | 205 | drop |
| B5 s5→s6 | 122–126| .50,.56 | .014 | 200 | drop |
| B6 s6→s7 | 152–156| .50,.46 | .016 |  48 | orb (golden heart of the tree) |
| B7 s7→s8 | 166–170| .50,.30 | .018 | 215 | star |

Pulse inside a window: `pulse = 1 + 0.06 * Math.sin(T * 2.4)` in **both** scenes (global T, so identical), no other hero motion.
Start-of-film: hero fades in at (.5,.5); end-of-film: hero is a point at (.5,.5) fading to black (loop → s1).

World match at the windows (what must be on screen in BOTH scenes; match colours within ~8 %, motion direction/speed, and particle character):

* **B1 (14–18)** deep water *darkness*: vertical gradient top `#04142a` → bottom `#010409`; faint teal haze brightest around the hero; sparse dim plankton motes (cyan-white, tiny) drifting **down** at ≈0.02 S/s (the camera is starting to rise). No light shafts yet. No jellyfish yet.
* **B2 (44–48)** mid-depth: top `#0f6a8a` → bottom `#06293f`; 3–4 broad soft light shafts from the upper-left (≈15° off vertical); fine marine snow drifting down ≈0.05 S/s; a loose school of small silver fish crossing in the far/mid distance; no big creatures; faint shimmer at the very top edge.
* **B3 (72–76)** dawn sky above the sea (the sea has sunk out of frame; at most a faint glowing haze at the very bottom): top `#6f8fc4` (soft blue) → middle `#f3b58f` (peach) → bottom `#ffd9a0` (gold); low sun glow at bottom-left (x≈.2,y≈.95); thin horizontal cloud strands; vapour motes (gold-white) rising **up** ≈0.04 S/s (the world flows downward past the rising hero).
* **B4 (98–102)** inside a heavy cloud: top `#34465f` → bottom `#6d8199` soft fog with large slow billows (fbm), a few very faint vertical rain streaks starting; hero is already a teardrop; fog drifts slowly **up** (the drop begins to fall).
* **B5 (122–126)** underground: top `#1a1210` → bottom `#0b0807`, warm brown-black; fine soil specks/grains; a few pale roots; a dim, unlit **seed** (oval, ~0.05 S tall) at (.5,.66) just *below* the hovering drop; everything stationary except a slow shimmer.
* **B6 (152–156)** dusk→night over a meadow: sky top `#0a1030` → violet `#3a2a5a` at y≈.72 → dark ground `#060810`; the **tree**: a big silhouette, trunk base at the bottom centre, canopy centred at (.5,.46) with radius ≈ .30 S; blossoms/petals glowing warm-white; some petals drifting *upward*; first few stars in the upper sky; a thin strip of distant sea on the horizon (far right/left, y≈.74).
* **B7 (166–170)** night sky: top `#02030c` → `#0a1230` (y≈.6) → horizon glow `#14214a` at y≈.78; dense stars; faint residue of aurora fading; **the sea** below the horizon (y .78→1): dark mirror (`#070c1e`→`#03050f`) reflecting stars as soft vertical streaks; the hero is the brightest star at (.5,.3) with a cross flare; a few drifting petals.
* Pre-window (s1 start, s8 end): pure black `#000`.

## 4. Visual language
* Luminous, soft, painterly-minimal. Depth through **layered silhouettes with atmospheric perspective** (far = lighter, bluer, lower contrast; near = darker, larger, faster), additive glows, rim light, mist. Generous empty space — the drop is small and the world is large.
* Palette per place (do not all drift to the same teal): void black; deep-sea navy/teal with magenta-violet jellyfish; turquoise → silver; dawn peach/rose/gold; azure and cream clouds → slate grey; rain blue-grey with green mountains and a warm rim of light; earth brown with gold seed; fresh greens, blossom pink, deep summer green, amber/crimson autumn, blue-white winter; night indigo/violet with aurora green-teal; ink-blue starry sea.
* Hard geometry only when it reads as intentional; soften edges (gradients, blur-by-scale, additive overlays). No visible banding (the engine adds grain; still prefer gradients with 4+ stops and noise modulation).
* Motion is *breathing*: slow drifts, easing, sinusoid sway with per-object phase. Camera moves are splines (`u.keys(...,'spline')`), never abrupt. Nothing ever stops completely, except where the contract pins the hero.
* Variety: every scene has ≥ 4 depth layers, ≥ 3 distinct particle/element types, and a timeline of events (below). Don't hold one look for more than ~8 s without something evolving (new element, colour shift, camera change, light change).

## 5. Scene briefs (global T). Beats are guidance; improve them, keep the handoffs.

### s1_awakening (0–18) — 目ざめ
Black. 1.5–4 s: a single point of light fades in at the centre. It beats like a heart (`Anim.hero.beat(T, 2.4)` → pulse radius ×(1+0.9·beat) and glow), each beat emits a thin expanding ring (to ≈0.35 S over ≈2.2 s, fading) that gently lights what it passes: dim dust motes (marine snow) are visible only inside the light's reach (radial falloff), drifting very slowly. 6–13 s: a soft nebulous teal-blue volumetric haze (fbm) fades in, brightest near the hero, slowly churning. Title caption (DOM, upper third) 8–15.8 s. 12–18 s: beats soften (amplitude → ~0.1 so it matches B1), dust begins to drift downward, haze settles into the B1 gradient. Wow: the first ring revealing the dust field, T≈4–6.

### s2_deepsea (14–48) — 深海
Camera slowly rises (world drifts down; speed 0.02 → 0.06 S/s). Events: **18–26** bioluminescent plankton swarm (hundreds of cyan/teal twinkling motes) forms a gentle stream that spirals around the hero as if greeting it, then disperses. **24–34** a group of 5–8 **jellyfish** (translucent glowing bells that pulse, long trailing tentacle ribbons with beaded light; magenta/violet/cyan; three depth layers incl. small blurry far ones) drifts through, synchronous-ish pulsing. **30–40** the **whale**: an enormous soft silhouette gliding slowly across the mid-distance (≥ 1.4 W long, a dark body against slightly lighter water, dotted bioluminescent markings along belly/flippers, a long faint glow trail, fluke undulation); passes behind the hero and plankton. Caption "大きな影" lines up at 32–39.5. **38–48** water brightens toward B2: light shafts emerge from the top-left, silver **fish school** (analytic flocking: a curving stream of ~120 tiny glints/slivers with shimmer) sweeps across, marine snow thickens.

### s3_surface (44–76) — 夜明け
Bright turquoise water, dancing caustic light, bold god-rays, bubble streams; optional cameo (sea turtle / manta silhouette). **54–60** the mirror-like *underside of the surface* descends into view (silver, rippled, with a bright "Snell's window" disc of sky), light intensifies. **≈60.5** the hero **breaks the surface** in a slow-motion crown splash: arcs of glowing droplets, expanding rings; time feels slowed (ease the hero up). **60.5–68** above water at dawn: horizon, sun half-risen at x≈.3 with a glittering path of light on the sea, sky gradient indigo→rose→gold, last stars fading, thin cloud strands, 3–5 gull silhouettes crossing; hero warms cyan → gold. **66–76** the hero dissolves into rising vapour (a stream of tiny glowing motes; heat shimmer); camera tilts up — horizon and sea sink out of frame — into the open sky of B3. Hero y: .56 (T≤52) → .5 (56) → .42 (60.5) → .40 (64) → .44 (70) → .48 (T≥72).

### s4_sky (72–102) — 空と雲
Ascent through cloud layers (soft procedural cumulus built from many gradient puffs; lit gold on the sun side, lilac in shadow; 3–4 parallax layers; a sea of clouds below with the sun rising across it). The sky shifts peach → azure at the top as the sun climbs. **76–86** tiny glints (other drops, like dew) twinkle in the clouds and stream toward the hero. **80** birds cross. **85–93** drops spiral in and *gather*; **86–96** a cumulus billows out around the hero, bright inside, sun-lit crown. **94–102** the cloud grows heavy: white → blue-grey, descends and fills the view; a soft silent lightning glow inside at ≈99; ends inside dense grey (B4) with the hero as a teardrop at (.5,.4) and the first rain streaks.

### s5_rain (98–126) — 雨
**98–104** inside the grey cloud, fog billows, rain begins. **≈104** the cloud base opens: below, a vast landscape in rain: 5–6 layers of mountain ridges (atmospheric perspective blue-grey → green), a forest valley, a silver river winding to a **thin sea at the horizon**, a warm rim of sunlight breaking through at one side. The camera falls with the drop (hero parked at y≈.32) so the world rushes up and enlarges; rain = 3 parallax layers of long glinting streaks + splash glints. **108–114** a faint rainbow arc blooms where light meets rain. **112–118** plunge through the forest canopy: layered dark-green leaf silhouettes sweep past with water beads, tiny ring-ripples where the hero touches a leaf. **117–122** reach the ground, sink into the soil: darkening brown strata, grains, roots; the drop slows and hovers at (.5,.56) (pinned for B5), rain-beads sinking around as faint glints.

### s6_tree (122–156) — 芽ばえと季節
**122–127** underground: the drop descends onto the dim seed (below it). **≈127** touch: a ring of light spreads, the drop's light is absorbed, the seed glows gold-green (hero hue 200 → 55 across 126–129, form drop → seed → glow). **129–136** germination: a luminous root filament branches downward, a shoot pushes up; the camera rises through soil strata (glowing mycelium threads) to ground level at ≈133; the sprout breaks the soil into a misty dawn meadow, distant hills, a thin strip of sea on the horizon; first leaves unfurl; the hero is now a sap-light travelling up the stem. **136–152** *time-lapse*: the tree grows (procedural recursive branching driven by a growth parameter; trunk thickens; leaf clusters as soft blobs) while days and nights race (sun/moon arcs, sky colour cycle) and **seasons turn**: spring blossom & falling petals (≈136–141) → deep-green summer with cumulus, fireflies at dusk (141–144.5) → autumn crimson/gold leaves falling (144.5–148) → winter bare branches, snow, blue-white (148–151.5) → spring bloom again (151.5–156). Grass blades sway. The camera slowly pulls back as the tree grows. **150–156** dusk: sky to violet, the huge blossoming tree glows, petals begin to lift *upward*; hero = golden heart of the canopy (.5,.46) for B6.

### s7_stars (152–170) — 星
**152–158** night; petals/blossom motes rise in streams from the canopy and brighten into stars as they climb; the camera tilts up following them — the tree slides down out of frame. **158–164** the sky fills: Milky Way band (noise + thousands of tiny stars with twinkle), aurora curtains (green-teal with violet fringes, slowly rippling), 3–4 shooting stars at irregular times, slow rotation of the sky. **161–165** the brightest stars link with faint lines into a drop-shaped constellation ("ひとしずく座"); the hero is its brightest star (.5,.3) with a cross flare. **164–170** release: the camera tilts down toward a horizon; aurora fades; a calm mirror sea appears at y≈.78 reflecting the stars (B7). Climax of the film: bloom is highest here.

### s8_return (166–180) — 還る
**166–170** (pinned) star over the sea. **≈169.8** the star leaves the sky: a slow shooting star (long soft tail) falls to the water at (.5,.78), arriving at **≈171**. **171–175** impact: concentric rings of light spread across the mirror sea in perspective (ellipses), distorting the star reflections; a few rising droplet beads; a final soft flash; light sinks into the water. **175–178** the camera dives through the surface following the drop: the surface closes overhead as a shimmering silver sheet, darkness deepens (towards s1's void); the drop shrinks. **178–180** only the single point of light at (.5,.5) (r ≈ .004–.008 S) remains, then the global fade takes it to black at T=180 → the film loops into s1.

## 6. Verifying your work (every author must do this, and look at the images)
```
node tools/shot.mjs --times 18:46:2 --cols 4 --cell 480 --out $SCRATCH/s2_overview.png   # contact sheet (Read the PNG)
node tools/shot.mjs --times 13:19:0.5 --cols 4 --out $SCRATCH/B1.png                       # a window at 0.5 s steps
node tools/shot.mjs --times 30 --single --out $SCRATCH/f30.png                             # full-size frame (add --cap for captions)
node tools/shot.mjs --times 18:46:4 --size 720x1280 --cols 4 --cell 300 --out $SCRATCH/s2_portrait.png
node tools/shot.mjs --times 18:46:4 --size 1920x800 --cols 3 --out $SCRATCH/s2_wide.png
node tools/check.mjs --from 14 --to 48 --step 2                                            # determinism + errors
node tools/perf.mjs --nofx --times 16,24,32,40,46                                           # cost
```
Open the PNGs with the Read tool and judge them as an art director: is it beautiful? is it interesting at every second? does motion
read? is anything flat, muddy, banded, overexposed, cluttered, or clipped? Then fix and look again. Iterate until you would be proud of it.
`$SCRATCH` = your scratchpad dir (put images there, **never inside the repo**).

## 7. Ownership
Edit only your own scene file(s). Do **not** edit `core.js timeline.js hero.js ui.js main.js index.html tools/*` — if you need a core
change, say so in your final report (`core_requests`) and work around it locally. Wrap your file in an IIFE, add no globals.
