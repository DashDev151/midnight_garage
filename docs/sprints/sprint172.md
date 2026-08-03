# Sprint 172: the body zone model, rebuilt

**Source:** `docs/playtest-notes/playtest-notes-2026-08-03.md`, three notes that turn out to be one
job: the service diagram is wrong, the store still sells a "Left panel set", and bumpers and
sideskirts are unmodelled.

**Design settled with the maintainer 2026-08-03.** The zone change had been planned in an earlier
session, was never implemented and was never written down. This document is that record.

## The model

**Nine zones, two kinds.**

**Metal panels (6):** `bonnet`, `boot`, `left-front`, `left-rear`, `right-front`, `right-rear`

**Trim (3):** `front-bumper`, `rear-bumper`, `skirts`

**Deleted:** `roof`, `chassis`, `left`, `right`.

**Why the roof goes.** Nobody replaces a roof: it is welded and structural, so it fails the test the
other zones pass. Five roster cars have no metal roof at all (Roadster, Beat, Cappuccino, Copen,
S2000) and modelling canvas buys nothing. The "left outside to rot" story it carries in
`neglected-commuter` transfers to the bonnet and boot, which are also horizontal.

**Why skirts are one zone, not two.** Nobody buys a left skirt.

**Why four corners.** `frontal-collision` currently has to spread its hit across `left` and `right`
equally, so the pattern cannot say the thing it exists to say. Corners let damage land where it
actually lands, and the sills and arches that rust are in the corners.

## Two zone shapes

Today every zone carries `metal` (0-4), `surface` (0-2), `finish` (0-3), `panelMissing`, `colour?`,
`primed`.

**Trim carries `finish`, `panelMissing`, `colour?`, `primed` only.** No `metal`, no `surface`,
because the stages that move them do not apply to it.

**`ZoneStates` therefore holds two shapes rather than nine identical ones**, and that has to be
handled deliberately rather than by making fields optional everywhere: a metal-only field read on a
trim zone must fail to compile, not silently read zero.

## What can be done to each

The pipeline has eight stages: `stripPrep`, `beat`, `weld`, `swapPanel`, `fillAndSand`, `prime`,
`paint`, `polish`.

**The rule: `beat`, `weld` and `fillAndSand` are metal-only.** You do not planish plastic, weld it,
or putty it.

| | metal panel | trim |
| --- | --- | --- |
| repair | stripPrep, beat, weld, fillAndSand, prime, paint, polish | stripPrep, prime, paint, polish |
| replace | remove, install, prime, paint, polish | remove, install, prime, paint, polish |

The pipeline is already self-gating and stays that way: a straight, sound panel skips to prime on
its own, and nothing in the list is mandatory.

### `swapPanel` is retired

It is a single atomic action, and swapping is not a thing a person does. **Remove and install are
the actions**, exactly as every other part in the game already works, and the zone-panel SKUs are
already real parts carrying a `zoneId`. Removing puts the old panel on the shelf and sets
`panelMissing`; installing takes one off the shelf. An already-empty zone is an install only.

### Welding becomes rot-only

Metal severity runs 0 straight, 3 rotten or bent, 4 beyond saving, and `MAX_REPAIRABLE_METAL` is 3.
Today `beat` works at severity 1-2 and `weld` works at 1-3, so welding is a legal, slightly dearer
way to fix a dent.

**`weld` now refuses below severity 3.** Beating is for dents, welding is for rot, and the choice on
a rotten panel becomes the one worth having: **hire the welder, or buy the panel.** A rust hole
cannot be beaten out. That also gives the tier-2 body line a story a player can say out loud.

### `fillAndSand` stays one stage

Real bodywork iterates fill, sand, fill. The player's decision is "fill this or replace the panel",
not "sand now or later", so splitting it doubles the clicks and adds no choice.

## Underbody is deleted and merged into chassis

**`underbody` is an orphan.** Its weights are style 2, reliability 1, authenticity 1. Once skirts
leave for their own zone, what remains is underseal and an underglow kit. That is not a slot.

Its aero content was always a duplicate: the splitter and flat floor are covered by `aero`'s
existing Lip Kit and Race Aero Kit, so **no aero SKU is added.**

**The `chassis` part already carries the ladder a floor should have** and is untouched by the
deletion of the chassis ZONE, which was only ever underbody's condition carrier:

| grade | SKU |
| --- | --- |
| street | Seam-Weld Stiffening Kit |
| sport | Sport Chassis Kit |
| race | Tube Chassis Reinforcement Kit |

**Chassis moves from the `drivetrain` group to `body`.** A shell is bodywork; its current grouping
is the odd one out. This changes which specialty it credits and which group-repair sweep picks it
up, and that reach is accepted deliberately rather than discovered later.

**The stiffening kits require the body line to install**, owned or hired for the day. A kit named
Seam-Weld Stiffening Kit needs a welder, and `removeMachineGateGroup` plus `hasMachineLineFor`
already do exactly this for assemblies, so no new mechanism is built.

**Underglow is cut**, with a note in `TODO.md` for a future cosmetic-lighting expansion.

**Underseal dies with the zone.** Chassis is a normal part and repairs like one. If underseal should
come back as a thing you buy and use, that is the consumables rework, not this sprint.

## Reuse analysis (directive 16)

### Reused, not rebuilt

| concern | what already does it |
| --- | --- |
| Remove a part to the shelf, install one from it | the existing part remove/install path. Panels stop being special |
| Gating an install on a tool line | `removeMachineGateGroup` + `hasMachineLineFor`, own-or-hired |
| Pipeline stage prerequisites | `planPipelineStage` already refuses on severity and capability. Only the weld gate moves |
| A part's condition band | `chassis` is a normal part and already has one, which is why underbody does not need a zone |
| Damage aimed at zones | `damagePatterns.json`'s per-pattern zone weights. Re-authored, not replaced |
| Aftermarket SKU shape | the existing catalogue shape, `zoneId` included. Generated, not hand-authored |

### Genuinely new

- A second zone shape for trim.
- `removePanel` / `installPanel` replacing `swapPanel`.
- The weld severity gate.
- Aftermarket panels carrying a `zoneId`.

## The numbers, counted

| | now | after |
| --- | ---: | ---: |
| zones | 6 | 9 |
| stock zone-panel SKUs | 20 | 36 |
| whole-car stock carrier | 4 | 4 |
| aftermarket panel SKUs | 12 | 108 |
| `panels` slot total | 36 | 148 |
| `underbody` slot | 16 | **0** |
| taxonomy slots | 29 | 28 |
| catalogue total | 484 | **580** |
| damage-pattern zone weights | 25 (5 x 5) | 45 (5 x 9) |

## Aftermarket, all nine zones

| zone | street | sport | race |
| --- | --- | --- | --- |
| bonnet | FRP replica | vented | carbon |
| boot | FRP replica | ducktail | carbon |
| four corners | FRP replica | over-fenders | carbon over-fenders |
| bumpers (2) | replica | kit bumper | carbon |
| skirts | replica | kit skirt | carbon |

**They carry no `physicalModifiers`, and that is not an omission.** The three whole-car body kits
they replace never carried any either: `body-system-analysis.md` records that a "Lightweight Body
Kit" is not lighter, and that no aero, panels, paint or underbody SKU moves a physical dial at all.
Authoring 108 mass values here would be inventing 108 unapproved levers. The weight-reduction work
on the backlog is where FRP and carbon start actually weighing less, across the whole catalogue at
once, and this sprint leaves that decision where it belongs.

## Also in scope

**The legacy `CarInstance.color` field is deleted.** A car has two colour concepts today, a
car-level `color` and a per-zone `colour`, and after the paint work the per-zone one is
authoritative. One system.

**The service diagram is rebuilt** against the nine zones (`workshopViewLayout.ts`,
`WorkshopViews.vue`). This is where the playtest's complaint about it is actually fixed. Its art
stays a deliberate stand-in.

**Save schema is a Dexie version bump and nothing else** (directive 19).

## Levers (directive 22)

**Approved 2026-08-03**, maintainer verbatim: *"reduce the consumable prices across the board to be
basically the same impact as previously. so if 5 panels used to cost 5000Y in total, 9 panels should
now cost 5000Y to paint. so the price per car stays the same for all consumables."*

Going from 5 painted zones to 9 would raise a full respray's materials by 80 per cent by arithmetic
alone, which nobody decided. **Every tin is rescaled to hold the per-car total.** Trim zones skip
fill-and-sand, so filler and paper divide over 6 metal zones while the rest divide over all 9:

| material | now | approved | zones it charges on | whole car, now | whole car, after |
| --- | ---: | ---: | ---: | ---: | ---: |
| `filler` | 1,500 | **1,250** | 6 metal | 7,500 | 7,500 |
| `paper` | 400 | **350** | 6 metal | 2,000 | 2,100 |
| `primer` | 1,200 | **650** | all 9 | 6,000 | 5,850 |
| `paint` | 2,500 | **1,400** | all 9 | 12,500 | 12,600 |
| `paint-metallic` | 5,000 | **2,750** | all 9 | 25,000 | 24,750 |
| `paint-pearl` | 7,500 | **4,150** | all 9 | 37,500 | 37,350 |
| `polish` | 800 | **450** | all 9 | 4,000 | 4,050 |
| `underseal` | 2,000 | **deleted** | was chassis zone | 2,000 | n/a |

**A full solid respray costs 32,000 today and 32,100 after: 0.3 per cent apart.** Values are rounded
to the nearest 50 yen so they read as prices rather than as arithmetic.

**Nothing else moves.** No payout, no part price, no sim formula.

## Definition of done

1. Nine zones, two shapes, with a metal-only field unreadable on a trim zone at compile time.
2. `swapPanel` is gone; remove and install work through the same path every other part uses.
3. Welding refuses below severity 3; beating still handles 1-2.
4. `underbody` is gone, `chassis` is in the body group, and the stiffening kits need the welder.
5. The service diagram draws the nine zones.
6. No car carries two colour concepts.
7. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deferred

- **The respray cost lever**, above.
- **Underglow**, cut with a `TODO.md` note.
- **Underseal as a purchasable consumable**, which belongs to the consumables rework.
- **The service diagram's real art**, sprites and highlighting. The maintainer has accepted the
  current version as a stand-in.

## Work breakdown

Scoped by FILE, not by concept, because the three groups below cannot touch each other's files and
the dependency between them is real: the vocabulary has to exist before the sim reads it, and the
sim's signatures have to exist before the UI calls them.

**A. Content** (`packages/content` only): the nine zones and two shapes, `ZoneStates`, the deleted
`CarInstance.color`, material prices, the taxonomy (delete `underbody`, move `chassis` to body), the
panel SKUs, and the damage patterns re-authored to nine zones.

**B. Sim** (`packages/sim` only): `bodyPipeline.ts` rebuilt on the new zones, the weld severity gate,
`swapPanel` replaced by remove and install, `underbody`'s band derivation deleted, the machine gate
on the stiffening kits, and generation.

**C. Game** (`packages/game` only): the service diagram rebuilt on nine zones, `CarDetailScreen`,
`zoneSeverity`, the store, and the save version bump.

## Exit

**All three groups landed. Typecheck clean across content, sim and game; content 600, sim 2212,
game 910, zero failures.**

- [x] **A, content.** Nine zones in two shapes, with `zoneState['skirts'].metal` failing to compile
      rather than reading zero. Materials rescaled to the approved table and `underseal` deleted.
      `underbody` deleted from the taxonomy and `chassis` moved to the body group. Catalogue 484 to
      **580**, panels 36 to **148**, slots 29 to **28**, damage-pattern weights 25 to **45**. Every
      projected number came out exactly.
- [x] **B, sim.** `bodyPipeline` rebuilt on both shapes; `planMetalPipelineStage` is typed on
      `MetalZoneState` so trim cannot reach beat, weld or fill. **Welding refuses below severity
      3.** `swapPanel` retired for `pipeline-remove-panel` and `pipeline-install-panel`, harvesting
      to and consuming from `partInventory` exactly as part removal already does. `underbody`'s band
      derivation deleted. The chassis stiffening kits gate on the body line through the existing
      `hasMachineLineFor`, which group A's taxonomy move wired for free.
- [x] **C, game.** The service diagram rebuilt front-at-left as a fully tiled plan: bumper caps at
      each end, bonnet and boot down the centre, four corners flanking, skirts as one zone drawn
      both sides. **A trim zone renders one severity row where a metal zone renders three**, so the
      UI never offers metal work on plastic. Remove and install replace the swap button, both
      reading `disabled` from the sim's own plan. `SAVE_VERSION` 57 to 58, no migration.

### Two faults found, one fixed and one deliberately not

**Fixed, and it was hiding a real difference:** a `Math.ceil` rounding artefact made a genuine
tier-1 versus tier-3 labour gap invisible in a test, which now asserts raw labour slots. B also
found and fixed a crash in `rollZoneStates` that a pre-existing fixture had been exposing.

**Not fixed, and carried in `TODO.md`: the `panels` carrier is now vestigial.** All 144 zone-scoped
panel SKUs are correctly refused for the whole-car slot, and the carrier holds only four stock SKUs.
So **a car with a full carbon body reads as perfectly original**, worth 11 of authenticity's 100
points, where before the zone model a body kit cost them. The whole-car Replace affordance is dead
for the same reason. The consistent repair is to derive the carrier's grade from its zone panels the
way its band already derives from them, but that is a decision about a core stat with several
defensible answers and it was not invented unreviewed at implementation time.

### Levers

The approved consumable rescale went in as signed. **Three mission payouts moved by under one per
cent** (`wont-strand-her` 123,000 to 124,000, `the-fleet-spare` 481,000 to 482,000,
`the-column-clock` 996,000 to 997,000) as a mechanical consequence of a slot leaving
`ALL_CAR_PART_IDS`; they are formula-derived, not authored, and the gate was re-pinned with a ledger
entry. `chassisMetalWeightsByTier` was deleted, its subject having ceased to exist.

### Not verified

**Nobody has seen the service diagram render.** Its layout is asserted by tests and reasoned from
coordinates. Whether nine zones read as a car from above is the one thing that needs an eye.
