# The garage interior

Placeholder pixel art for the six rooms the garage is made of: the alley, the
main workshop floor, the warehouse, the machine shop, the body and paint
shop, and the office. Built the same way the overworld was - by hand, no
artist, no renderer to preview it in while it was drawn. See "How this was
made" below for what that means for its reliability.

## Projection

Elevated three-quarter, top-down oblique - the same Stardew Valley and
Pokemon lineage as `overworld/`, explicitly **not** isometric: you see the
floor, the near edge of the back wall, and the tops of whatever is standing
in the room. Every room shares one shell (a painted-block wall down to a
skirting board, then a concrete floor) drawn with Pixi `Graphics`, the same
division of labour `overworld/overworldMap.ts` uses between broad terrain
and individual buildings.

## Grid

Fixtures sit on the 16px base grid in template-pixel terms, mostly at 16,
32 or 48 template px on a side (a few - the corkboard, the two-post lift,
the lathe - run wider because their real-world counterparts do). Every
template is one character per template pixel, rasterised at 1x exactly like
`overworld/buildings.ts`. `rooms.ts` then scales each fixture by
`DEFAULT_FIXTURE_SCALE` (4, an integer) when it places one, because a room
scene shows one room's worth of furniture rather than a whole town's worth
of buildings - at 1x a 32px corkboard would be a speck on a 960-wide scene,
at 4x it reads as a wall-mounted board. Two fixtures - the alley's parked
cars and the workshop floor's car up on the lift - use a further per-call
scale (8 and 12) for the same reason, at greater intensity: the same 8x5
`CAR_TOP` drawing stands in for a car twice over, small in the alley and
large on the lift, purely by an integer scale factor. All scaling
everywhere is integer-only.

The scene canvas is **960x540**, matching `overworld/`'s own exception to
the usual 640x360 stage, so a room and the map it leads out of render at
the same scale.

## Palette

`garagePalette.ts` imports and re-exports the overworld constants that a
room shares a material with - concrete (`KERB`), timber (`CRATE`, `DOOR`),
dust (`WALL_BASE`, `WALL_SHADE`), dark glass (`GLASS_DARK`), a warm bulb
(`GLASS_LIT`), paper and chrome highlight (`TRIM_LIGHT`) - rather than
defining a second grey or a second brown next to the overworld's. Only
genuinely interior materials get a new constant:

- **Painted block** (`WALL_PAINT_LIGHT`, `WALL_PAINT_SHADE`) - the interior
  wall colour. No exterior equivalent; the street-facing cladding the
  overworld draws is a different substance.
- **Steel** (`STEEL_LIGHT`, `STEEL_SHADE`) - benches, racking, machine tool
  bodies.
- **Corrosion** (`RUST`) - what steel becomes in a derelict room. Never
  used in an open one.
- **Strip light** (`STRIP_LIGHT`) - the cool fluorescent tube over a working
  room, deliberately the opposite temperature from the overworld's warm
  sodium `GLASS_LIT`. A derelict room carries no strip light at all - it
  keeps `GLASS_LIT` for its one bare bulb, so the warm/cool split signals
  open versus derelict before a player reads a single fixture.

## Files

- `garagePalette.ts` - the six new interior colours, plus the overworld
  colours re-exported for `fixtures.ts` and `rooms.ts` to pull from in one
  place.
- `fixtures.ts` - one indexed template per object (bays, benches, racking,
  the lathe, the mill, the booth, the office's three stamps, the derelict
  junk set), a colour map per template, `buildFixtureSprite` /
  `garageFixtureSize` to render one and measure it, and the one
  parameterised fixture, `buildCarTopSprite`, whose paint is supplied at
  build time. `GARAGE_FIXTURE_IDS` lists every static fixture id.
- `rooms.ts` - the nine scenes (six rooms, three of them doubled into an
  open and a derelict variant), `GARAGE_PLACEMENTS` (room id, fixture id,
  centre x, centre y - the fixed furniture a screen can hit-test later),
  and `buildGarageRoomScene(id, officeCounts?)` to assemble any one of
  them.
- `README.md` - this file.

## How a derelict room relates to its open twin

Warehouse, machine shop, and body-and-paint each have an `-open` and a
`-derelict` id. Both call `drawInteriorShell` with the exact same wall
height, so the architecture - the wall, the skirting, the floor, the floor
texture - is pixel-identical between the two. What differs is:

1. **Lighting.** The open variant gets three `STRIP_LIGHT` tubes near the
   ceiling; the derelict variant gets one `bare-bulb` fixture instead,
   which is `GLASS_LIT` - warm where the tubes are cool.
2. **The signature broken object.** The warehouse's racks and the body
   shop's booth reuse their own open-state template with a second, derelict
   colour map rather than a second shape - `RACK_BAY_DERELICT_COLORS` and
   `BOOTH_DERELICT_COLORS` in `fixtures.ts`. Where that map simply omits a
   key (the rack's boxes, the booth's waiting car), that part of the
   fixture draws nothing: the piece that's missing is, literally, missing
   from the render. The machine shop's lathe gets the same treatment
   (`LATHE_DERELICT_COLORS`, its carriage gone) at the same spot in the
   room, rather than a second lathe drawing.
3. **Everything else is junk**, not furniture: `junk-boxes` and
   `dust-sheet-lump` stand in for whatever the open room would otherwise
   hold there (the mill, the panel stand, the compressor - none of which
   are placed in a derelict scene at all).

That is the whole mechanism the sprint's design doc asks for: the same
walls, the same footprint, different contents.

## The office's three stamps

The corkboard, the photo wall and the certificates are each drawn as one
backing (only the corkboard needs one - photos and certificates pin
straight to the painted wall) plus a repeatable stamp (`card`, `photo`,
`certificate`). `buildOfficeScene(counts?)` places a handful of each
directly, rather than through `GARAGE_PLACEMENTS`, because the real count
of each is live game data - listings, reputation-derived photo coverage,
earned techniques - that `GarageInteriorScreen.vue` reads and hands in as
an `OfficeSceneCounts`. Identity is never drawn: every card, photo and
certificate is the same stamp regardless of which car or technique it
stands for, so the HTML readout beside the canvas is what carries a
technique's name or an exact number past what the wall can show at a
glance.

Each object's stamps lay out in a fixed grid (`officeCardPositions`,
`officePhotoPositions`, `officeCertificatePositions`, all pure functions of
a count - no Pixi or DOM involved, so they are unit-tested directly) inside
a field sized for that object: the corkboard's cards inset from the
corkboard fixture's own placement and size, the photo wall and certificate
frames in their own patch of the painted wall clear of every other office
fixture. Earlier stamps keep their grid slot as a count grows; a caller
with nothing to show draws nothing at all, no fallback minimum, which is a
plain empty state (a bare corkboard, a bare wall) rather than a broken one.
Each field clamps at a maximum - `MAX_LISTING_CARDS` (12),
`MAX_PHOTO_STAMPS` (15, exactly the top reputation tier's own count),
`MAX_CERTIFICATE_STAMPS` (8, more than the game has techniques today) -
past which the true count keeps climbing in the HTML readout while the art
itself stops adding stamps rather than overflowing its own wall. Calling
`buildOfficeScene()` with no argument at all still renders the original
five cards, three photos (matching the design doc's "a new shop has three
curling snapshots") and two certificates, via `DEFAULT_OFFICE_COUNTS`.

## Adding a room or a fixture

**A fixture:** write its indexed template as a `readonly string[]` (every
row the same length, `.` for transparent), reusing the shared index
characters documented at the top of `fixtures.ts` where the role matches;
write its colour map, pulling from `garagePalette.ts` first; add both to
`FIXTURE_ART` and to the `GarageFixtureId` union. If it needs a derelict
recolour, add a second `_DERELICT_COLORS` map against the same template
rather than a second template, and check by hand which characters you want
to omit (rather than recolour) to make a part of it disappear.

**A room:** decide whether it needs its own shell or can reuse
`drawInteriorShell` at `STANDARD_WALL_HEIGHT` (everything except the alley
and the office, which each have reasons of their own); add its id to
`GarageRoomId` and `GARAGE_ROOM_IDS`; add its fixed furniture to
`GARAGE_PLACEMENTS`; write a `buildXScene` function and wire it into
`buildGarageRoomScene`'s switch. If it is one of the three that can start
derelict, give it an `-open` and a `-derelict` id and make sure both call
the shell function with the same wall height.

## How this was made, and what that means for trusting it

Exactly as `overworld/README.md` describes for the map: built and reviewed
without ever seeing it rendered, no dev server, no Pixi canvas, no
screenshot. Every template was drafted as a plain character grid, printed
to a terminal, and read back as ASCII - a bench's silhouette, a lathe's
chuck, a card's pin - repeatedly, fixture by fixture, before any room was
composed out of them. Dimensions and colour-map completeness (every
character used has an entry, no orphaned entries, and each derelict map's
omissions are exactly the ones intended) were checked by script against
the literal file contents, and the three files were additionally run
through `tsc --noEmit` in isolation (this package does not currently
type-check as a whole, for reasons unrelated to this work) to catch
anything the ASCII read-back couldn't. The room compositions were also
checked by script for accidental overlaps and off-canvas placements.

What none of that can catch: actual colour harmony on screen, whether the
strip-light/bare-bulb temperature swap reads as intended rather than as
noise, whether the office's three stamped objects are legible at their
placed size, and whether a 960x540 room holds together as a whole rather
than as a set of individually-reasonable pieces. Treat this as a solid
first pass that a sighted review should still walk through before it ships
past placeholder status - the office most of all, since its three objects
are asked to carry meaning (a sales pipeline, a reputation, a specialty)
that nothing else in the room does.
