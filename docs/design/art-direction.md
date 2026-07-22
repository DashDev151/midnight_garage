# Midnight Garage - Art & Audio Direction (the art bible)

**Status:** canonical reference for all look-and-feel decisions, locked with the maintainer
2026-07-13. The GDD stays canonical for *mechanics*; this doc is canonical for art, audio, and UI
feel, and refines the GDD's one-word "synthwave" descriptor into the real brief below. It feeds
the P3 asset-spec doc (roadmap Sprint 9) when commissioning starts. The roadmap's gate rule
stands: **no art or audio money is spent before the Fun Gate passes.** Everything here is
planning; placeholder assets stay free until then.

**Amendment (maintainer, 2026-07-22):** the zero-spend rule stands, but a **cohesive, if
unpolished, art pass is required before any outside playtesting**. Outside players must judge
something that generally looks like the game will look; a mixed placeholder surface poisons the
feedback. The pass uses maintainer-made art and free (properly licensed) assets only, and this
requirement sits in front of the playtest milestone, not behind the Fun Gate.

AI-generated renders were used to converge on this direction (moodboarding only). **No
AI-generated art or music ships in the product, ever - and none appears in devlogs or public
marketing either.** The pixel-art indie audience is openly hostile to AI assets; the vibe-led
marketing plan (Vibe Gate, GIF-first itch page) cannot afford that taint.

---

## 1. The one-line brief

> **"Sodium streetlights shining on fresh tarmac, with magenta and teal ad boards glowing over."**

1995 Japan, at night, industrial. Synthwave is seasoning, not the dish: if a screen reads as a
synthwave poster, it has failed the brief. If it reads as a real backstreet in Kanagawa where a
couple of signs happen to be neon, it has passed.

## 2. Palette system

Three tiers with strict area budgets. The tiers are the law; exact hex ramps get fixed in the P3
asset spec with the commissioned artist.

| Tier | Colors | Role | Area budget |
|---|---|---|---|
| Base | Concrete greys, 5-6 ramp steps, warm-shifted (never blue-dead) | Walls, tarmac, panels, most of every screen | Dominant |
| Light | Sodium amber, 4-5 steps | THE light source: glows, streetlight pools, key numbers, signage, active states | Secondary |
| Accent | Magenta + teal, ~3 steps each | Ad-board spill ONLY: small emissive surfaces and their reflections | Small, never a large field |

- Global environment palette cap: ~24-32 colors. Car bodies are excluded - they use the existing
  indexed 4-tone template + runtime palette-swap system (roadmap R1 architecture), so one drawing
  serves every paint color.
- **Wet-tarmac reflections are a first-class technique**, not a flourish: vertical neon smears on
  dark ground are the cheapest vibe multiplier in pixel art and the sanctioned way to get color
  into a scene without saturating it.
- Rule of glow: at most two or three genuinely saturated elements per screen (the sign, the End
  Day button, the cash figure). Everything else stays desaturated so those pop - this is what
  makes screenshots shareable (Vibe Gate).

## 3. Pixel discipline

The game is DOM UI + Pixi canvas islands (locked stack decision), so there are two regimes joined
by one iron rule:

> **Every art pixel on screen renders at the same size at a given zoom, and all scaling is
> integer-only.** Mixed texel densities are the number-one amateur tell and are banned.

### 3.1 Canvas islands (Pixi)

- **Logical stage: 640x360** (integer 3x to 1080p, 2x to 720p-class laptops, clean halves for
  embedded panels). Fallback note: if the garage hero scene ends up a single-bay closeup only,
  480x270 islands are acceptable - decide during P3 compositing tests.
- Nearest-neighbor upscaling only; no fractional zoom anywhere.

### 3.2 Car sprites

- **Two sprite classes per car (amended 2026-07-22, maintainer approval in session,
  superseding the original "no second hero sprite" rule):**
  1. **The side-view master, 96x48 canvas** - the car's identity portrait, styled like a
     listing photo: auction cards, detail pages, anywhere the player inspects or compares.
     This is the layered-compositing set (body + wheels + aero + ride height, palette-swap
     paint) and the only class that renders mods.
  2. **The garage-scene overworld sprite** - a dedicated FRONT-FACING drawing per model in
     the scene's elevated three-quarter view, flat body + palette swap only (no part
     compositing; mods read on the master). **Exactly two classes per car, locked
     (maintainer, 2026-07-22):** every scene context, including the lift bay, reuses the
     front-facing sprite; a third angle class was considered and rejected (each angle class
     costs one drawing per roster model forever).
  (Controlled integer-ratio mixing - big hero car, 1x props - remains standard practice and
  reads as intentional.)
- **Length varies inside the canvas by class:** a kei car occupies ~70px, a JZA80 ~92px.
  Relative size between models is free identity - never normalize it away.
- Why 96 and not 80: wheels. At 96px car length, wheels run 18-20px diameter - the minimum where
  spoke patterns read (a TE37-alike vs a Watanabe-alike vs steelies). Wheels are a player-facing
  mod category and half the JDM fantasy; 80px collapses them to noise. 96-100px is also the
  historic pixel-car community size class, so reference material and the commission market are
  deep at exactly this spec.
- Layered compositing per roadmap R1: base body + wheel layer + aero overlay layers + ride-height
  y-offset; paint via palette swap. Parts are drawn once per body family, never per configuration.

### 3.3 Props, tiles, and wheels

- Props on a **16px base grid** (16/32/48 canvases).
- Wheel library masters at ~20px diameter, shared across all cars (2-3 sizes only if compositing
  tests demand it).
- Set-dressing priorities (cheap, static, high-vibe): vending machine, telephone pole + wires, oil
  stains, tire stacks, chalkboard, kanji signage. Maintain a props list; each is drawn once.

### 3.4 DOM UI

- Pixel-*styled*, not resolution-locked. Pixel display font for headers and numbers at integer
  multiples of its native em; a genuinely readable font for body/help text (font scaling is in the
  launch DoD - pure pixel fonts at small sizes fail accessibility).
- Borders, bevels, and panel chrome drawn at the same visual chunk scale as the art so the two
  regimes feel like one machine.
- Open call for P3: the exact display/body font pairing (OFL-licensed only, per R8's same-rule
  for fonts).

### 3.5 Rendering conventions (defaults; the P3 artist spec may refine)

- Selective outlines in a dark warm tone, not pure black.
- Dithering restrained to large gradients (sky, fog); never on small objects.
- No anti-aliasing against transparency; no drop shadows except as drawn pixels.

## 4. Diegetic, tactile UI (the visceral-feedback law)

**Principle: every interactive control is an in-world object. The screen IS the shop, not a
website about the shop.** No control may read as a default browser widget. In technical terms:
diegetic skins over standard accessible semantics - the *skin* is a physical object, the
*component* underneath remains a proper Vue control with keyboard focus, ARIA role, and
reduced-motion compliance (both are launch DoD items; the skin never replaces the semantics).

### 4.1 Control vocabulary

| Interaction | In-world object | Never |
|---|---|---|
| Momentary action (End Day, confirm, buy) | Physical push button: arcade dome, register key. 2-3 frame press animation (art shifts down 1-2px, shadow collapses) | Flat rectangle with hover tint |
| Toggle (for sale, radio on) | Flip switch / breaker lever with thrown states | Checkbox |
| Level / choice selection (target band, volume, station) | **Rotary knob or dial with detents** - discrete clicks per stop, pointer rotates, label window updates | Slider track, dropdown |
| Progress / gauges (labor, condition, dyno) | Analog needle gauge, segmented LED bar, flip counter | Plain CSS progress bar |
| Status displays (day, cash, rep, tallies) | Flip clock, register/LED marquee, dot-matrix VFD, chalkboard | Text in a box |
| Navigation | Diegetic tab objects, exact object TBD (cassette rack retired 2026-07-22: too nostalgia-forward; candidates in section 7) | Browser-y tab strip |
| Lists / documents (jobs, ledger) | Clipboard, carbon-paper invoice, cassette rack | Default table chrome |

The volume control is the canonical example: not a UI slider, but a drawn knob on the boombox
that rotates through detents with a click per stop. Under the hood it is still `role="slider"`
with arrow-key support; the player just sees a knob.

### 4.2 The feedback stack (what "clunk" means, precisely)

Every interaction produces three things within ~100ms:

1. **Visual travel:** a real pressed/rotated/thrown art state (frame swap, not a CSS tint).
2. **Mechanical sound:** a short (<100ms) foley hit - clunk, click, flap, detent tick - with
   slight random pitch variance (a few percent) so repeated presses never machine-gun the same
   sample. Every control family owns a paired sound; audio IS art direction here.
3. **State change:** the thing it does, visibly (number flips, needle moves, chalk tally added).

Heavy actions earn heavier feedback: End Day gets the flip-clock flap cascade and a register
kachunk; a sale gets the cha-ching. Light actions stay light. Feedback is *response*, never
*challenge*: no timing, no reflex component, per the hard design rules - animations telegraph
state, they never gate input.

### 4.3 Anti-patterns (banned)

- Native scrollbars visible in primary UI; default focus rings (replace with a visible custom
  focus treatment - visible is non-negotiable, accessibility DoD); browser tooltips (use in-world
  tags and label windows); generic modal dialogs (use paper slips, clipboards, stamped forms).
- Any control whose art has no pressed/active state. If it cannot clunk, it does not ship.

## 5. Audio direction

### 5.1 The shop radio (diegetic music system) - decided 2026-07-13

- Music is diegetic: a boombox/FM radio object in the garage plays it. Lo-fi, band-limited mixes
  are the genre, so aggressive compression sounds intentional; gaps between songs read as real
  radio, making silence a feature; the player controls it in-fiction (knob, station dial, off
  switch) - settings as diegesis.
- **Bundled licensed "stations"** (curated playlists of loop tracks) are the default. Plus a
  **manual-tuning dial: the player may paste their own stream URL** ("tuning past the presets").
  A player-supplied stream is legally equivalent to them opening a browser tab: no bundled
  third-party URLs, no curation, no endorsement, zero maintenance. HTTPS streams only (mixed
  content is browser-blocked). **No real station ships as a preset without written permission**,
  treated with full R8 licensing discipline. Rationale for not bundling real radio: station ToS,
  the conservative licensing posture that keeps the Steam door open, and streamer safety - real
  radio plays copyrighted music, which forces streamers to mute the game.
- Implementation notes for later: Howler `html5: true` streaming for radio, Web Audio for SFX;
  iOS gesture unlock is satisfied by the title/menu interaction; skip ICY now-playing metadata
  (CORS mess) - the dial fiction replaces it.

### 5.2 Music content plan

- ~5-6 loopable tracks of 2-3 minutes + 1 night-city ambience bed (distant traffic, occasional
  train). Ambience carries most of the runtime; music rotates in sparsely.
- Lo-fi bitrates (96-112kbps) - the aesthetic forgives them. Total shipped audio budget
  ~10-12MB (music 8-10, SFX 1-2) against the <25MB launch DoD; music lazy-loads after the first
  user gesture so it never touches initial load.
- Saturated synth moments are reserved for short high-stakes beats: auction close, the sale,
  End Day, the dyno pull. Day-to-day is ambience plus quiet radio.
- Era anchor for commissioned work: FM-synth timbres (OPN/OPL, the OutRun lineage) - authentic
  1995 Japan and compresses beautifully.

### 5.3 Sourcing rules (binding)

- Licenses: **CC0 or CC-BY with commercial use only.** No NC variants (Steam-door rule), no
  "free for personal use" packs, no AI-generated audio in the shipped build.
- Free pool now (pre-Fun-Gate): Pixabay Music (commercial-ok, no attribution), Free Music
  Archive and OpenGameArt (filter CC0/CC-BY). SFX: freesound CC0 + own foley.
- Post-Fun-Gate: commission 3-5 original tracks per roadmap R8 ($50-200/track) to replace the
  placeholder pool. **The title theme is commissioned first** - it doubles as the
  trailer/devlog audio identity.
- Attribution screen ships regardless (already planned; fonts and SFX credits live there too).

### 5.4 SFX priority list (these do more for feel than the soundtrack)

Register cha-ching (sale), flip-clock flap (End Day), shutter, ratchet, air-wrench, detent ticks
(every knob), switch thunk, chalk scratch (tally), vending machine clunk, distant train.

## 6. Decisions log & cut list

- **City map: cut for v1.0** (2026-07-13). Tabs are the navigation. It was the single most
  expensive possible asset and made navigation slower. If map flavor is ever wanted post-launch,
  the sanctioned cheap form is a **paper wall map pinned in the shop office** (one static
  illustration, business cards/polaroids as location pins) - parked, not planned.
- **Subtle synthwave** (2026-07-13): palette tiers above; magenta/teal never large-field.
- **96x48 car masters / 640x360 stage / 16px prop grid / integer-only scaling** (2026-07-13).
- **Diegetic radio with bundled stations + player-URL tuning dial** (2026-07-13).
- **Visceral-feedback law** (2026-07-13): section 4 is binding on all future UI work.
- **Cohesive-before-playtest amendment** (maintainer, 2026-07-22): a cohesive, if unpolished,
  art pass (maintainer-made art + free licensed assets, zero spend) is required before outside
  playtesting. See the Status amendment at the top of this doc.
- **Cassette-tab rack retired** (maintainer, 2026-07-22): navigation stays diegetic, but the
  cassette rack tried too hard for the nostalgia note. Replacement object is an open call
  (section 7).
- **Top-down oblique locked; two car sprite classes locked** (maintainer, 2026-07-22): the
  garage scene renders in elevated three-quarter view (Stardew/Pokemon lineage); each car gets
  exactly two drawings - the 96x48 side master (listing-photo identity, the only class that
  renders mods) and a front-facing oblique scene sprite reused everywhere in-scene, including
  the lift bay. A third angle class was rejected on cost (one drawing per roster model,
  forever). The auction-sheet card direction was confirmed the same day via a second reference
  render (AI, moodboard only): aged-paper sheet, red grade stamps, listing-photo frame,
  physical action buttons - with the corrections recorded in `art-catalogue.md` O9 (no
  countdown timers on cards, one ledger, real vetted kanji only, the photo is the side master).
- **Interim font pairing landed** (2026-07-22): DotGothic16 (the era Japanese 16-dot gothic) as
  the pixel display/default face; M PLUS Rounded 1c (maru gothic) as the reading face for
  long-form copy and anything below 16px, where a bitmap grid smears. Both OFL, licences shipped
  beside the files. This is the free placeholder pairing; the final pairing remains a P3 open
  call with the artist.
- Standing rules restated from GDD/roadmap: parody parts brands from day one; Naming Layer flip
  must hold for any art containing brand marks (draw badges as separate swappable layers); no
  reflex-based input anywhere; era-authentic yen everywhere.

## 7. Open calls (deliberately undecided)

- Exact hex ramps per palette tier, and the display/body font pairing (P3, with the artist).
- Outline/dither/AA per-asset conventions beyond section 3.5's defaults (P3 asset spec).
- Hero-scene composition: the VIEW is now LOCKED (maintainer, 2026-07-22): elevated
  three-quarter (top-down oblique, the Stardew/Pokemon lineage, NOT isometric), compositing
  the interior bay and the exterior parking apron in one scene, with the diegetic status row
  (flip-clock day, register, VFD cash panel, CRT reputation, chalkboard tally) above it -
  direction set via a maintainer reference render (AI moodboard only, never ships, never
  appears publicly, per this doc's standing law). Still open: exact composition, crop, bay
  count, and whether 480x270 islands exist. The render's cassette tabs predate the cassette
  retirement and are superseded.
- Which existing screens get the diegetic-control retrofit first once P3 starts (candidate order:
  garage status row, End Day, radio, band-picker dial).
- The navigation tab object (cassette rack retired 2026-07-22). Candidates that fit "HTML plays
  paper, bitmaps play things" without leaning on nostalgia: manila index-folder tabs on the
  shop's paperwork, a pegboard with hanging tags, filing-cabinet drawer labels, parts-drawer
  labels. Decide during the cohesion pass.
