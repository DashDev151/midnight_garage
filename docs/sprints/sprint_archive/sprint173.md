# Sprint 173: the overworld

**Design of record:** `docs/design/systems/world-and-rooms.md`, agreed with the maintainer
2026-08-03.

The garage interior is Sprint 174. This sprint builds the map you travel on and the one destination
that does not exist yet.

## Goal

**The game becomes a place.** A player opens the map, sees a back street with their garage in the
middle of it, and clicks where they want to go.

**The tab bar stays, in full.** This is additive. The world is built alongside the tabs and they are
retired later, deliberately, rather than the world shipping half-finished as the only way to reach a
screen.

## Reuse analysis (directive 16)

### Reused, not rebuilt

| concern | what already does it |
| --- | --- |
| Going to a screen | Vue Router. A map hotspot is a router link, so travelling is navigation and nothing else changes |
| Rendering pixel art at integer scale | `carSprite.ts`'s indexed-template plus palette-swap approach, and `renderLayer` with `scaleMode: 'nearest'` |
| A lap time from a car and a course | the locked performance model, `packages/sim/src/performance.ts`, and `courses.json`'s four calibrated courses |
| Picking a car and a course, showing four times | `PerformanceSandboxScreen.vue` already does this as a dev tool. The test track is a slimmed, player-facing version |
| Colour discipline | `paintColours.json` and the palette work from Sprints 169-170 |

**Not stood up in parallel:** no second navigation system, no second lap model, no second sprite
pipeline.

### Genuinely new

- A map scene and its building sprites.
- A player-facing test track screen.

## What the art bible locks, and this obeys

- **Elevated three-quarter, top-down oblique, the Stardew and Pokemon lineage, explicitly NOT
  isometric.** Locked 2026-07-22.
- **Props on a 16px base grid (16/32/48 canvases). Integer-only scaling.** Locked 2026-07-13.

**One scoped exception, maintainer-approved 2026-08-03** ("I'm okay with a slightly larger canvas
here if you need it"): the overworld scene is **960x540**, not the 640x360 stage. It holds twelve
locations plus a dense centre, and 640x360 cannot do that without the buildings collapsing below the
16px grid. **960x540 preserves integer scaling** (x2 to 1920x1080) and the 16px grid is unchanged.
This is a scene-specific canvas, not a change to the locked stage size.

## The map

**A tourist map, not a survey map.** Scale is deliberately non-uniform: the central
industrial-adjacent district is geographically tiny and occupies most of the canvas, because that is
where every day is spent. Everything else compresses toward the edges.

**Distance is conveyed by compression and depth, never by empty tarmac.** Far places sit smaller and
hazier, behind a treeline or a bridge, with the road narrowing toward them.

| where | location | destination |
| --- | --- | --- |
| centre | **the garage** | the garage screen |
| across the street | **cafe** | **nothing. Building only** |
| nearby | tool hire | existing screen |
| nearby | parts shop | existing screen |
| a little out | local yard | existing screen |
| a little out | staff centre | existing screen |
| a little out | **bank** | **nothing. Building only** |
| top left | mountains, the touge | test track |
| top right | regional auction | existing screen |
| bottom right | the highway and the wangan | test track |
| bottom right, far | premium auction | existing screen |
| bottom left, the larger city | dealer network | existing screen |
| bottom left, the larger city | collector network | existing screen |
| bottom left, the larger city | international raceway | test track |

**Travel costs nothing.** Not time, not labour. Making it cost something would turn navigation into
a mechanic and that is a separate decision.

**The bank and the cafe are drawn and inert.** They must not be clickable into a stub screen: a
building that does nothing yet should read as a building that is not open to you, not as a broken
link.

## The test track

Take a car there, pick a course, get a time from the locked performance model.

**This is why the hard design rule was amended** (CLAUDE.md, 2026-08-03): "no driving gameplay"
became "no MANDATORY driving; nothing may require driving to progress; optional driving for fun is
allowed". **The reflex-input ban is untouched and absolute.**

`PerformanceSandboxScreen.vue` already does the work as a dev tool. The player-facing version picks
from **cars you actually own**, runs the model, and shows the time. It does not expose the sandbox's
slot editors, build codes or research cars.

## Tasks

**A. The art.** The 960x540 map scene and its building sprites, on the 16px grid, top-down oblique.
This is the hard part and it gets its own agent.

**B. The map screen.** The scene, the hotspots, the routing, the inert buildings.

**C. The test track screen.** Own cars, four courses, a time.

## Definition of done

1. A player can reach every existing destination from the map without touching a tab.
2. The bank and the cafe are visible and clearly not open.
3. A car the player owns can be taken to a track and given a time.
4. The tab bar still works exactly as it does today.
5. Integer scaling holds; no sprite is drawn at a fractional scale.
6. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Levers (directive 22)

**None.** No economy value, price, payout or sim formula is touched. The lap model is read, never
modified.

## Deferred

- **Bank loans**, a real new mechanic and a real exception to the v1.0 feature freeze.
- **The cafe's function**, including the labour-restoring coffee.
- **Travel cost.**
- **Retiring the tab bar.**
- **Final art.** These are placeholder sprites, made as good as they can be made without an artist.

## Exit

**Built. Typecheck clean across all three packages; game 927 passing, content 600, sim 2212.**

- [x] **The map.** `OverworldScreen.vue` hosts the 960x540 scene and hit-tests all 14 placements.
      The routing table lives in `overworldNav.ts` as pure logic, so it is testable without mounting
      Pixi.
- [x] **Every destination resolves to a real route**, read from the router rather than guessed:
      tool hire to `upgrades`, parts shop to `parts`, staff centre to `staff`, the garage to the new
      interior. **Five locations front the one auction screen** (local yard, regional, premium,
      collector network, dealer network), because `AuctionTierSchema` already names four of them as
      tiers and the fifth has no tier of its own.
- [x] **The bank and the cafe refuse the click** and say so, rather than navigating to an empty page.
- [x] **The test track**, reached from three locations, each preselecting its own course: the touge
      to Hakone, the wangan to Wangan, the raceway to Misaki. It offers only cars the player owns and
      the four shipped courses, and calls the same `lapTimeSecondsFor` and `lapBlockers` the dev
      sandbox uses. No slot editors, no build codes, no research cars.
- [x] **The tab bar is untouched.** One tab was added, `World`. Everything else works as before.

**Travel costs nothing**, as designed.

### Not verified

**Nobody has seen the map render.** The haze over the four far corners is flat-alpha rectangles and
it carries the entire distance cue; whether it reads as depth or as grey boxes stamped on the corners
is the first thing to look at. The premium auction is not actually drawn smaller, only placed further
out and hazed, which was an over-cautious call at draw time and is a cheap fix. The local yard's
chain-link and the highway gantry are the two sprites their author was least confident in.

**There are no mount tests for the Pixi screens.** Mounting a real Pixi `Application` throws from its
own ticker in this test environment, which is why `PaintPaletteScreen.vue` has no test file either.
Coverage rests on pure-logic tests plus typecheck.
