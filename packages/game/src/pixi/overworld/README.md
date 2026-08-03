# The overworld

Placeholder pixel art for the map you travel on: the garage and its
neighbours, and the four far corners the roads run out to. Built by hand, no
artist, no renderer to preview it in while it was drawn - see "How this was
made" below for what that means for its reliability.

## Projection

Elevated three-quarter, top-down oblique: the Stardew Valley and Pokemon
lineage. You see a building's roof and a little of its front face, never a
45-degree cube - this is explicitly **not** isometric. Every building here
follows one of two roof recipes to keep that read consistent across fourteen
otherwise unrelated drawings:

- **Gable**: a ridge line down the centre, a lit pitch to one side, a shaded
  pitch to the other, widening from the ridge cap down to the eave. Used for
  the cosier buildings and the garage itself.
- **Flat parapet**: a plain roof slab with a dark border, lit toward the top
  edge and shaded toward the eave. Used for the more institutional,
  industrial or open-air lot buildings.

Neither recipe ships as code: what is here is the literal, hand-corrected
output, as plain indexed string arrays - the same convention `carSprite.ts`
uses. A future template does not need to reuse the recipe mechanically, only
the proportions and vocabulary it settled on (see "Adding a location"
below).

## Grid

Props sit on the art bible's 16px base grid: every building canvas here is
32, 48, 64 or 96 pixels on a side. Scaling is integer-only throughout - one
template pixel is one scene pixel at 1x, and the screen that eventually
consumes this scene may apply a further integer zoom (x2, x3), never a
fractional one.

The scene canvas is **960x540**, a maintainer-approved exception to the
usual 640x360 stage: this map holds fourteen locations plus a dense centre,
and 640x360 cannot fit that without the buildings collapsing below the 16px
grid. 960x540 still scales cleanly to 1920x1080 at 2x, so the integer-only
rule holds.

## Palette

`overworldPalette.ts` holds the local terrain and structure colours,
organised by the art bible's three tiers:

- **Base** (dominant): concrete and tarmac tones, warm-shifted - outline,
  eave, kerb, wall, road, grass.
- **Light** (the one glow source): sodium amber - signage and lit glass.
- **Accent** (small, twice only): magenta on the cafe's awning, teal on the
  international raceway's floodlight. The art bible's rule of glow: at most
  a couple of saturated elements, not a glow on every building.

A handful of names are deliberately reused for more than one role (a
concrete kerb doubles as chain-link fence grey, a wood crate doubles as
packed dirt) because at this scale the two materials read as the same flat
tone - spending a separate hex on a difference nobody sees would only widen
the palette for nothing.

Where a real colour fits, it is reused rather than invented: the local
yard's stacked wrecks, the two auction lots' bunting, and the wangan's bay
water are all literal `PAINT_COLOURS` hexes from `@midnight-garage/content`
(see `overworldPalette.ts`'s `YARD_CAR_COLOURS`, `BUNTING_COLOURS` and
`WATER`). Car paint is excluded from the art bible's environment palette cap
for the same reason a car itself is a separate swappable system.

The full environment palette (structure and terrain tones, counting each
reused name once) comes to a little under thirty colours, plus the reused
`PAINT_COLOURS` entries. The art bible caps a single screen's environment
palette at 24-32; this is a much larger scene than that guideline was
written for (fourteen locations across 960x540 rather than one 640x360
screen), so the count runs close to the top of that range rather than
comfortably inside it. It was not padded - every colour above earns its keep
by marking a district (cosy shops, civic buildings, industrial yard,
open-air lots) or a material a neighbour doesn't share.

## Files

- `overworldPalette.ts` - the colour constants, with a comment on why each
  exists.
- `buildings.ts` - one indexed template per location, a colour map per
  template, and `buildLocationSprite`/`overworldLocationSize` to render one
  and measure it. `OVERWORLD_LOCATION_IDS` lists all fourteen ids;
  `INERT_LOCATIONS` flags the two that are drawn but go nowhere yet (the
  cafe and the bank).
- `overworldMap.ts` - the 960x540 scene: ground, water, the road network,
  a treeline, every building placed, and a distance haze over the four far
  corners. Exports `OVERWORLD_PLACEMENTS` (id, x, y - x and y are each
  location's CENTRE) for the screen that will hit-test against it, and
  `buildOverworldScene()` to assemble the whole thing.

## Adding a location

1. Decide its canvas size (a multiple of 16 - 32, 48, 64 or 96) and which
   roof recipe reads right for it, if it is a roofed building at all (the
   local yard and the mountains are not - they are ground-level and terrain
   respectively, built as bespoke templates the same way).
2. Write the indexed template as a `readonly string[]`: every row the same
   length, `.` for transparent. Reuse the shared index characters documented
   at the top of `buildings.ts` where the role matches (roof, wall, door,
   window) so the vocabulary stays legible across buildings; introduce a new
   character only for a genuinely new feature.
3. Write its colour map, pulling from `overworldPalette.ts` where a role
   already has a name, from `PAINT_COLOURS` where a real colour fits, and
   adding a new palette constant only when neither does.
4. Add the id to the `OverworldLocationId` union, to `BUILDING_ART`, and to
   `OVERWORLD_LOCATION_IDS`. If the location has no destination screen yet,
   add it to `INERT_LOCATIONS` too and make sure its template reads as
   closed (shuttered glass, a dark door) rather than as an ordinary
   building.
5. Add its placement to `OVERWORLD_PLACEMENTS` in `overworldMap.ts`: the
   centre coordinate, snapped to the 16px grid.

## How this was made, and what that means for trusting it

This was built and reviewed without ever seeing it rendered: no dev server,
no Pixi canvas, no screenshot. Every template was drafted as a plain
character grid, printed to a terminal, and read back as ASCII - a roof's
silhouette, a window's position, a door reaching the ground - the same
discipline `carSprite.ts` was built with. Dimensions and colour-map
completeness (every character used has an entry, no orphaned entries) were
checked by script against the literal file contents, not just the draft.

What that check cannot catch: actual colour harmony on screen, whether the
haze overlay reads as distance rather than as a grey smear, and whether the
960x540 composition holds together as a whole rather than as fourteen
individually-reasonable pieces. Treat this as a solid first pass a sighted
review should still walk through before it ships past placeholder status.
