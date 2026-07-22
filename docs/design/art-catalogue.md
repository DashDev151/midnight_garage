# Art catalogue - the required-asset inventory

**Status: DRAFT for maintainer review** (first cut 2026-07-22, at maintainer request). This is
the planning layer between the art bible (`art-direction.md`, the law) and the future P3
commissioning spec (the contract with an artist). It inventories every asset the game needs,
with specs, states, animation treatment, and status, so the scale of the work is visible and
nothing is discovered missing at commissioning time. The bible always wins on conflict; the
animation doctrine in section 2 is NEW law material and stands as proposed until the maintainer
signs it off.

Sequencing law (maintainer ruling 2026-07-22): base gameplay mechanics and economy come before
any art production. This catalogue is planning, which is free; nothing in it is a licence to
start drawing. When production starts, the cohesion pass (bible Status amendment) is the P1
column below: maintainer-made art and free licensed assets only.

**How to read the entries.** Layer says who renders it (world = Pixi canvas island, object =
bitmap in the DOM, document = styled HTML, no bitmap). Status: MISSING (nothing exists),
PLACEHOLDER (something ships today and must be replaced), BLOCKED(x) (cannot be specified until
decision x lands, section 5). Priority: P1 = cohesion-pass minimum (the game "looks like a
game"), P2 = full v1.0, P3 = post-launch or nice-to-have.

---

## 1. The doctrine in one paragraph (from the bible and the 2026-07-22 session)

Three layers, one fiction: the world layer is pixel art in Pixi islands (640x360 stage, cars
96x48, props on a 16px grid); the object layer is bitmap diegetic controls and chrome living in
the DOM at the same texel size; the document layer is pixel-styled HTML playing the role of
paper. HTML plays paper, bitmaps play things. One texel size on screen at all times,
integer scaling only, palette shared between sprites and CSS tokens (palette decision pending,
section 5).

## 2. Animation doctrine (PROPOSED - needs maintainer sign-off)

What was never written down before: which things move, and in which technology.

**Three treatments, and static is the default.**

1. **Sprite animation** (frame swap: CSS `steps()` in the DOM, ticker in Pixi): the only way a
   *thing* may move. Frame budgets: feedback 2-3 frames, ambient loops 4-8, payoff moments
   8-12. A bitmap never smoothly scales, rotates, or blurs, and a bitmap container never sits
   at a fractional texel: sub-pixel motion reads as shimmer and breaks the one-texel law. This
   rules out CSS-rotating a drawn gauge needle: needles and knob pointers are pre-rendered
   per-position frames (a detent knob is a frame per stop, which is also what makes it click).
2. **Web-space animation** (CSS transitions): document layer only, and only position, opacity,
   and colour. Paper may slide, fade, and settle, because paper is a smooth material in the
   fiction; it may not bounce, spring, or parallax. Bitmap-bearing containers may use it only
   for opacity (fade a whole panel in), never for continuous motion.
3. **Manipulation (input echo - drag and drop):** the exemption that makes dragging legal. A
   held item follows the pointer 1:1 with zero easing or lag, at any position, because this
   motion is the player's HAND, not an animation the game plays; the texel-snap law governs
   authored motion only. The art itself still never scales, rotates, or tilts while held. The
   moment the pointer releases, the hand-off happens: authored motion (treatment 1) takes over
   and obeys its own rules. Spelled out in full below.
4. **Static**: everything not listed below. Most of every screen never moves.

**What earns animation, in tiers:**

- **Feedback (mandatory, bible section 4):** every interactive control has a real pressed,
  thrown, or rotated art state. 2-3 frames, under 100ms, paired with foley. If it cannot
  clunk, it does not ship.
- **Payoff (the big moments, 8-12 frames, one per moment):** the hammer falling, the sale,
  mission complete, the End Day flip-clock cascade. These are the shareable GIF moments and
  the only places saturated motion is welcome.
- **Ambience (garage hero scene only, 2-4 loops per scene, 4-8 frames each):** sign flicker,
  steam from a vent, rain streaks on the shutter window, the boombox cassette turning. Nothing
  ambient in menus, cards, or documents.
- **Never:** decorative motion on the document layer, parallax anywhere, smooth zoom on pixel
  art, attention-seeking idle animations on controls.

Every non-feedback animation needs a reduced-motion path (accessibility suite v2 ties in
here): payoff moments cut to their final frame, ambience stops.

### 2.1 Drag and drop, precisely (parts from inventory, cars between slots)

The mechanics already exist (`useDragAndDrop.ts`: custom pointer-capture drag with a styled
ghost; correctly NOT the native HTML5 drag API, whose untouchable translucent-screenshot ghost
would wreck the aesthetic). This doctrine specifies how the interaction looks and feels in the
final art, phase by phase:

1. **Pickup:** the item swaps to a lifted state (2-frame grab: shadow separates, art rises
   1-2px) and the cursor becomes the holding hand. Foley: a material-true pick-up (clink for a
   part, paper slip for a ticket).
2. **Carry:** the ghost follows the pointer exactly (treatment 3 above): no easing, no trail,
   no tilt. The sprite stays integer-scaled and unrotated; a hard-edged drop shadow beneath it
   carries the "lifted" read.
3. **Targets:** while something is held, legal destinations announce themselves by frame swap,
   not by pulsing: the empty bay's outline lights, the diagram segment's hole brightens, the
   slot "opens". Illegal destinations stay dead; hovering one shows a flat refusal read (the
   fitment law made visible). Two states each, no smooth glow.
4. **Drop (legal):** the snap. The item leaves the hand and seats instantly at its socket,
   then a 2-3 frame settle (part seats, dust puff) with the clunk. Never a smooth glide into
   place: gliding is a phone app, seating is a garage.
5. **Drop (illegal) or cancel:** the item returns to origin instantly (the hand puts it
   back). No floating sad journey home.

**The hand-or-ticket law:** you drag what a hand can hold. A part is hand-sized, so the part
sprite itself is the ghost. A CAR is not: what the hand drags between parking and service is
the car's paper ticket/tag (a document-layer object; the fiction is moving the job card, and
the shop obeys), never a 96x48 car sprite dangling from the cursor. Assemblies sit in between:
either the ticket, or a small hoist-hook token if the crane fiction earns its keep (open,
decide in the repair-loop arc alongside D4).

**Accessibility law:** drag is an accelerator, never the sole path. Every drag action keeps a
click-click or button equivalent, and the reduced-motion path skips settle frames (the state
change remains instant and visible). Auditing the current screens for missing click
equivalents belongs to accessibility suite v2.

## 3. The catalogue

### 3.1 World layer (Pixi canvas islands, 640x360, 16px prop grid)

| # | Asset | Spec and states | Animation | Status | Priority |
|---|---|---|---|---|---|
| W1 | Garage hero scene, base | 640x360, elevated three-quarter view - LOCKED (maintainer, 2026-07-22; the Stardew/Pokemon lineage, not isometric): interior bay + exterior parking apron in one composition. Diegetic status row above it (flip-clock day, register, VFD cash, CRT reputation, chalkboard tally - the bible 4.1 vocabulary made literal). Layered so machine/prop overlays composite on. Crop/bay-count still open (D3) | 2-4 ambient loops | MISSING | P1 |
| W2 | Garage machine overlays | The visible form of progression: 6 tool lines (engine, drivetrain, suspension, wheels, body, interior) x 3 tiers. Not every tier needs a distinct sprite; propose tier-2 and tier-3 silhouettes only where the fiction is iconic (engine crane, two-post lift, tyre machine, paint corner). Facility upgrades (service bays, parking) widen or add bays | Static; the crane earns a payoff animation when first used | MISSING | P2 (P1: crane + lift only) |
| W3a | Car side-view masters | 26 models today x 96x48: the car's identity portrait, styled like a listing photo. Auction cards, detail pages, anywhere the player inspects. Layered per the roadmap R1 architecture: base body + wheel layer + aero overlay + ride-height offset; paint via indexed 4-tone palette swap. Wheels from the shared library, never drawn onto bodies. The ONLY class that renders mods | Static | PLACEHOLDER (one programmatic spike car) | P1 (the current roster), grows with roster |
| W3b | Car garage-scene sprites | 26 models today x ONE front-facing oblique drawing - LOCKED (maintainer, 2026-07-22): every scene context reuses it, including the lift bay (D9 resolved, third angle rejected). Flat body + 4-tone palette swap only, NO part compositing: mods read on the master, the scene reads ownership and paint. Sized to the scene (~48-72px footprint) | Static (arrive/depart = texel-step translation) | MISSING | P1 (the scene needs whatever the player can own) |
| W4 | Wheel library | ~20px diameter masters, 4-6 designs (steelie, period mesh, five-spoke, kei stock), shared across all bodies | Static | MISSING | P1 |
| W5 | Car condition overlays | OPEN DECISION (section 5): 2-3 grunge states (dirt, patina, rust flecks) as overlay layers so a shitbox looks bought-from-a-field and a finished car gleams. High feel value, multiplies with body count | Static | BLOCKED(D6) | P2 |
| W6 | Props set | 16px grid: vending machine, telephone pole + wires, tyre stacks, oil stains, chalkboard, kanji signage, shelving, toolbox trolley, kerosene heater, boombox. Each drawn once | Vending machine and boombox may join the ambient budget | MISSING | P1 (6-8 of them), rest P2 |
| W7 | Yuki | Presentation open (section 5, D5): dialogue portrait bust vs in-scene sprite vs both. She is the tutorial's voice and the tone-setter; some visual identity is P1-adjacent | Portrait: static with 2-3 expression variants; sprite: idle loop | BLOCKED(D5) | P2 |
| W8 | Staff archetypes | Staff are generated from name/bio pools, so art is per-archetype, not per-person: 4-6 archetype sprites (or portrait chips) x idle/working state | 2-frame working loop at most | BLOCKED(D5) | P2 |
| W9 | Auction room presence | Today the room is abstract (text and numbers). OPEN DECISION (D5): do dealers get visual form (a row of silhouettes/paddles above the floor), or does the room stay abstract-with-great-typography? | Paddle raise = 2 frames | BLOCKED(D5) | P2 |
| W10 | Recurring cast (landlord, bazaar auntie, the Rival) | No character design exists (TODO standing item); art cannot start before names and personalities do | Portraits, static | BLOCKED(cast design) | P2 |
| W11 | Overworld town map | Maintainer-proposed navigation rework; needs its own design pass first (TODO). If it lands: one wide illustration + per-building lit/locked states | Ambient budget shared with W1 | BLOCKED(design pass) | P2/P3 |

### 3.2 Object layer (bitmap UI chrome in the DOM, `image-rendering: pixelated`)

| # | Asset | Spec and states | Animation | Status | Priority |
|---|---|---|---|---|---|
| O1 | Nine-slice frame set | The foundation kit the maintainer named: panel frame, paper/card frame, modal slip, inset well, button chrome, list rail. ~6 frames, drawn once, stretched everywhere via `border-image`. Corner language kills the current 6px radius | Static | MISSING | P1 (this single item does the most cohesion work per pixel) |
| O2 | End Day button | The flagship control (bible 4.1): arcade dome or register key. States: idle, hover-lit, pressed (art drops 1-2px, shadow collapses), disabled. Remains a real `<button>` underneath | 2-3 frame press; End Day payoff cascade lives in W1/O6 | MISSING (currently styled HTML) | P1 |
| O3 | Control vocabulary set | Flip switch (2 states + travel frame), rotary detent knob (frame per stop, 8-12), needle gauge (pre-rendered needle positions over a drawn face), segmented LED bar, flip-counter digits (0-9 + flap frames) | Feedback tier | MISSING | P2 (P1: switch + one gauge, to prove the kit) |
| O4 | Navigation tab object | BLOCKED(D2): cassette rack retired 2026-07-22. Candidates: manila index-folder tabs, pegboard tags, filing-drawer labels | Selected-state swap, 2 frames | BLOCKED(D2) | P1 |
| O5 | Grade and status stamps | The auction sheet's grade boxes, band chips redrawn as stamped marks, SOLD/NO SALE slams, inspector scribble ticks for the checklist | Stamp thunk: 2-3 frames + settle | PLACEHOLDER (CSS chips) | P1 |
| O6 | Payoff moment pieces | Hammer (fall + bounce), register drawer (cha-ching), flip-clock (End Day cascade), mission-complete stamp | Payoff tier, 8-12 frames each | MISSING | P2 (P1: hammer only) |
| O7 | Icon set | Part-category icons (29 taxonomy entries), event-log glyphs, labour/cash glyphs, severity cues that do not lean on colour alone (accessibility v2) | Static | PLACEHOLDER (text/emoji-free CSS) | P2 |
| O8 | Service diagram artwork | THE BIG ONE - see section 4. One cohesive segmented car art piece replacing the 29 + 3 placeholder tile sprites | Segment state swaps; open/missing reads as removed art, not a tint | PLACEHOLDER (`partSprites.ts`, explicitly launch-blocking in TODO) | P1 |
| O9 | Auction sheet chrome | Direction confirmed by the maintainer's 2026-07-22 card reference render (AI, moodboard only): aged manila sheet, foxing/stains, torn edge, red circular overall-grade seal + boxed EXT/INT stamps, the car in a white listing-photo frame, physical action buttons on the right rail. Corrections that bind the real card: ONE ledger (the render duplicates it); NO countdown timers anywhere on a card (lots expire in days; the fuse in the live room is the game's only clock); any kanji seal/marks must be real, correct, vetted Japanese, never decorative mush; the photo frame holds the side-view master (W3a). Grading semantics settled same day (Sprint 112, shipped): four stamps - OVERALL priced as the apparent restoration bill over book value, plus MECH/EXT/INT impression letters - so the naive read of the stamps is the correct read; the sheet art carries four stamp positions, not three. Stamps are printed ink, frozen at listing (the house's public read); the player's diagnosis NEVER reprints them - confirmed knowledge may later appear as PENCIL annotations beside the affected stamp ("rod knock" by a clean MECH, "polishes out" by a scary EXT), flavour-reinforcing what the you-say figure already carries | Stamp thunk on reveal (O5) | MISSING | P1 (pencil annotations P2) |
| O10 | Spotlight / walkthrough chrome | Current CSS ring is fine (document-layer motion); optional future: a drawn chalk circle | Web-space | exists (CSS) | P3 |
| O11 | Cursor set | Bitmap cursors: arrow, hover-hand, grab/holding, refuse. Small, classic, and they carry the whole manipulation fiction (section 2.1) | State swaps only | MISSING (system cursors today) | P2 |
| O12 | Drag-state kit | Per draggable family: lifted frame (+shadow), slot-open highlight states for legal targets, refusal read for illegal ones, seat/settle 2-3 frames + dust puff; the car TICKET/tag object for slot moves (hand-or-ticket law) | Feedback tier | MISSING (CSS ghost today) | P1 (parts + car ticket), P2 (polish) |

### 3.3 Document layer (pixel-styled HTML; design work, no bitmaps)

| # | Asset | Spec | Status | Priority |
|---|---|---|---|---|
| H1 | Palette tokens | `style.css` custom properties re-pointed at the locked palette once the CC-29-extension vs Apollo-subset decision lands | BLOCKED(D1, section 5) | P1 |
| H2 | Type system | DONE (interim): DotGothic16 display at on-grid sizes, M PLUS Rounded 1c reading (500/700). Remaining: the rollout sweep (TODO), and the final P3 pairing call | landed 2026-07-22 | P1 |
| H3 | Corner and border retrofit | Square/stepped corners, 1-2px borders at chunk scale, O1 frames replacing box CSS | MISSING | P1 |
| H4 | Paper treatment | Subtle dither/grain data-URI backgrounds for document surfaces, custom visible focus treatment, styled scrollbars (native ones are a bible anti-pattern) | MISSING | P2 |

## 4. The service diagram redesign (captured intent, not yet designed)

Maintainer intent (2026-07-22, verbatim in spirit): replace the disjointed per-component
placeholder sprites with **one cohesive, segmented art piece: an undercarriage and engine
view of the car** where the segments ARE the slots. The diagram stops being a grid of tiles
and becomes a drawing of a car you take apart.

This belongs to the maintainer's deferred service-diagram/repair-loop redesign arc; the
catalogue records the constraints that art must answer when that arc opens:

- **Generic car vs per-body-family:** the single most expensive decision in this catalogue. A
  generic diagram is one artwork; per-family multiplies it by every silhouette in the roster.
  A middle path exists: one generic underside/engine drawing + a per-family header silhouette.
- **View layout:** one composite view, or two panes (engine bay from above + undercarriage as
  on a lift)? The lift view is the diegetic answer (it is what a mechanic actually sees) and
  pairs with the garage's two-post lift (W2).
- **Slot mapping:** 29 part slots + 3 assemblies must each be a hit-target segment with the
  full state vocabulary the current diagram already renders: band tint, open/missing
  (`pd-wash-open`), selected, staged, disassembled-to-bench. States should read as art (a
  missing gearbox is a HOLE with a hoist strap, not a red tile).
- **Interaction unchanged:** the diagram is presentation; `PartsDiagram.vue`'s data contract
  (groups, bands, incomplete, staged) stays, so the redesign is skinnable without touching sim
  logic.

## 5. Open decisions blocking art (each one gates entries above)

1. **D1 Palette:** CC-29 + glow extension vs Apollo subset (parked from the 2026-07-21
   session). Gates D1 tokens, and ALL sprite work (sprites are drawn in-palette).
2. **D2 Navigation object:** cassette rack retired; candidates listed in the bible's open
   calls. Gates O4.
3. **D3 Hero-scene composition:** the VIEW is locked (elevated three-quarter, 2026-07-22);
   still open: crop, bay count, how much parking apron. Gates W1's final drawing, W2
   placement, and whether 480x270 islands exist.
4. **D4 Service diagram shape:** generic vs per-family, one view vs two (section 4; the
   repair-loop arc's call). Gates O8, the largest single art system.
5. **D5 Character presentation:** portraits vs in-scene sprites vs abstract; whether dealers
   are visualised at all. Gates W7, W8, W9, W10.
6. **D6 Car condition visualisation:** do cars wear their band visually (grunge overlays)?
   Gates W5.
7. **Cast design** (existing TODO item): gates W10, and later the legend-lead delivery.
8. **Overworld map design pass** (existing TODO item): gates W11.
9. **D9 Car angle classes: RESOLVED (maintainer, 2026-07-22).** Exactly two drawings per car:
   the side master and one front-facing oblique scene sprite, reused everywhere in-scene
   including the lift bay. A third (rear-on-lift) angle was rejected on cost: every angle
   class is one drawing per roster model forever.

## 6. The honest scale count

At single-diagram scope (generic service diagram, no condition overlays, abstract dealers,
two car angle classes): roughly **200-250 hand-drawn assets** for full v1.0: the car system
is now the largest single block at ~66-70 drawings (26 side masters, 26 garage-scene
sprites, the wheel library, aero overlays), then one hero scene + ~10 machine overlays +
~12 props, ~6
nine-slices, ~10 control families at 2-12 frames each, ~40 icons, ~32 diagram segments in one
composite artwork, the drag/cursor kit, a handful of characters, and 4-6 payoff moment
pieces. The P1 cohesion-pass floor: **on the order of 70-90 assets**, and it grew for an
unavoidable reason: the garage scene shows whatever the player owns, so BOTH car classes for
the live roster are P1 (hero scene base, 26+26 car sprites, the nine-slice kit, End Day,
hammer, stamps, sheet chrome, the diagram v1, 6-8 props).

Per-family service diagrams, condition overlays, visualised dealers, and additional car angle
classes are the four multipliers that can double the total; each is a deliberate decision
(D4, D6, D5, D9), never a default.

Audio is deliberately NOT in this catalogue: the bible's section 5.4 SFX priority list is the
audio equivalent, and the mechanics-first ruling parks both.
