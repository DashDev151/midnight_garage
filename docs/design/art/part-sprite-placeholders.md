# Part sprite placeholders - design spec (Sprint 88)

Orchestrator-authored spec for the service-diagram component sprites. These are
DEVELOPMENT PLACEHOLDERS (playtest 2026-07-18 item 12, maintainer commission): they must
never appear in a public build, screenshot, devlog or marketing material; commissioned
art replaces them before launch (TODO.md carries the entry). Within that boundary the
maintainer's bar is explicit: "make something nice". This spec is how.

## System rules (binding on every sprite)

1. **Grid and scale.** Standard parts: 24x16 authored pixels. Large units (block,
   gearbox, chassis, panels, underbody, the three assembly composites): 32x22. Rendered
   at 4x, nearest-neighbour, no anti-aliasing anywhere.
2. **Palette.** Five indexed colours only, taken from the live UI tokens so sprites sit
   inside the panels they render on: outline `#101113` (night-deep), dark `#26272b`
   (panel), mid `#3d3f45` (panel-edge), light `#9b9da3` (text-dim), accent `#d29a5a`
   (the warm amber "light" tier). Amber is a GARNISH: one small emissive or identity
   detail per sprite at most (a cam lobe highlight, a gauge needle, a brake disc's hot
   face), never a fill. Template characters: `.` transparent, `0` outline, `1` dark,
   `2` mid, `3` light, `a` amber.
3. **Silhouette first.** Every sprite must be identifiable from its outline alone at 1x.
   If the silhouette needs a caption to read, redraw it. Interior detail is secondary
   and sparse: 2-4 interior strokes, not texture.
4. **One light, one outline.** Light from top-left: top/left edges pick up `3`,
   bottom/right shade to `1`. Full 1px `0` outline on every sprite, closed, no gaps.
   No dithering.
5. **Consistent projection.** Side profile is the default (cars are read in profile).
   Face-on ONLY where the face is the identity: rims, tyres, cooling (radiator grid),
   clutch (disc), brake disc, dash binnacle, seats (front three-quarter reads better;
   see notes). Never mix projections inside one sprite.
6. **No text, no emoji, no brand marks** inside sprites. Parody-safety and the naming
   layer apply to pixels too.

## Per-part silhouette notes (the identity of each sprite)

**Engine group:** block = ribbed rectangle with a crank bulge low-right; internals =
crankshaft line with two piston columns above it; headValvetrain = low wide cam cover
with three plug wells; camsTiming = two parallel shafts with offset egg lobes and a
belt run linking their ends; intake = plenum loaf with three runner fingers curving
down; exhaust = header pipes merging into a muffler box with a tip; fuelSystem = small
tank with a rail line and pump barrel; ignitionEcu = flat box with a loom of three
leads leaving one edge; cooling = face-on radiator: fin grid with top and bottom tanks;
forcedInduction = the snail: volute spiral with an inlet trumpet.

**Drivetrain:** gearbox = bellhousing cone stepping to a ribbed tail; clutch = face-on
disc with four spring windows and a splined hub; differential = pumpkin with two stub
axles; driveline = long shaft with two universal-joint knuckles; chassis = twin rails
with three crossmembers (large grid).

**Suspension and brakes:** dampers = strut body with piston rod and a spring seat;
springs = four clean coil turns, slight barrel; antiRollBars = wide U-bar with end
links; steering = rack tube with bellows and two tie-rod ends; brakePadsDiscs = face-on
vented disc with a calliper clamped at ten o'clock (amber on the disc face);
brakeCalipersLines = calliper block with a braided line looping to a banjo fitting.

**Wheels:** rims = face-on five-spoke with a centre cap; tyres = face-on tread ring,
empty centre (the rim shows through the hole when composited in the wheel assembly).

**Body:** panels = door skin with handle recess and a swage line (large grid); paint =
the same door skin with a masked diagonal sheen band of `3` (surface, not a tool);
underbody = floor pan with ribs and a transmission tunnel (large grid); aero = side
profile wing on two stands.

**Interior:** seats = front three-quarter bucket with side bolsters and a headrest
hole; dashGauges = binnacle arc with two round dials, amber needle on one.

**Assemblies (composites, large grid):** wheelAssembly = tyre ring seated over the rim
face; engineAssembly = block + cam cover + intake silhouette as one unit;
gearboxAssembly = bellhousing/tail with the clutch disc peeking at the bell face.
Composites are drawn, not programmatically stacked: they must read as one object.

**Ghost state:** the diagram renders vacancies as the same sprite at low opacity via
CSS; no separate ghost art. Do not bake transparency into the templates.

## Authoring and review loop (blocking)

Templates live in one module as indexed character rows (the art-spike technique,
Pixi-free rasteriser, data-URL output for the DOM diagram). The implementer renders a
CONTACT SHEET (all sprites at 4x, labelled) to a PNG in the session scratchpad after
every authoring pass. The sheet background MUST be the night-deep `#101113` the in-game
diagram stage actually uses, never panel `#26272b`: token `1` fills are invisible
against panel-dark, and art must be reviewed on the background it ships on (spec
correction 2026-07-18, after exactly that false-negative in the round-two review). The orchestrator reviews the sheet
visually and issues per-sprite corrections; iterate until the orchestrator signs off.
No sprite ships unreviewed. Expected: at least one full correction round.
