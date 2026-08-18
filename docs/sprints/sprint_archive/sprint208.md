# Sprint 208: the body shop is a room with a bay

**Status: APPROVED (fix arc wave 2, playtest notes 2026-08-16, S2-8; body-bay and
stick-welder rulings 2026-08-16).** Supersedes the body UI shipped by the 201-203
cleanup where the facts below contradict it. `body-system-analysis.md` remains the
analysis of record for the underlying zone model, which is NOT reworked here; this
sprint fixes where the work happens, what gates it, and how it reads.

## The verified indictment

- Body work is reachable from any car page; the "Body and paint" station gates
  nothing real. The refusal copy ("Buy the body line first") overstates a gate that
  the working screen never mentions.
- Weld is a silent wall: disabled with no reason shown, gated on a Y700,000 tool line
  the player has never been told exists.
- The bench repairs a panel's structure through the generic part path, bypassing
  beat/weld entirely and silently deleting the panel's captured paint state: two
  systems for one job, one of them a trap.
- Panel install charged 9 labour: bolt-on 3 x the machine-less multiplier 3, because
  panel bolts are booth-gated. Bolting a wing is not booth work.
- Priced sentences sit inside buttons, against the standing ruling.

## The design

**One room, one bay, one system.**

1. **The body bay.** The garage gains a dedicated body bay beside the service bays,
   same slot idiom: drag a car in (or "move..." and place). ALL body work requires
   the car in the body bay - zone actions exist nowhere else. The bay is the gate;
   the room is the surface.
2. **The body shop room.** Clicking the bay (or the garage's body-and-paint station)
   opens the body shop with the car in its bay: the zone diagram and the one action
   panel, moved OUT of the car detail screen. The car page's diagram keeps showing
   zone condition read-only, with a door: "To the body shop".
3. **The stick welder.** The starting shop owns a cheap stick welder: weld works from
   day one at the machine-less rate, named on the control ("by hand with the stick
   welder"), exactly the rate-not-wall shape every machine gate has had since Sprint
   202. The body line buys speed (multiplier 1) and the better paint finish, and the
   room says so where the work happens, not in a station tile two screens away.
4. **The bench is out of the body business.** A harvested panel can be fitted or sold,
   never bench-reconditioned: `reconditionGateReason` refuses panel instances with a
   reason that names the body shop. Structure is fixed on the car (beat, weld, fill),
   paint on the car (prep, prime, paint, polish). The bench-bypass and the
   paint-destroying trap both die with one refusal.
5. **Panel bolts are hand work.** Panel install/remove stop being machine-gated:
   install returns to its honest bolt-on 3. The booth gates booth work (weld rate,
   finish tier), not spanners.
6. **Controls go standard.** Every action is a fixed verb button with the figures
   beside it (the workbench idiom): no priced sentences inside buttons. A disabled
   control states its reason where every other refused control does.
7. **The carriers are transformations, not swaps (closes 206-B6).** Chassis, bodywork
   and paint never exist in the Warehouse: fitting a body kit consumes the kit and
   transforms the car (the old shell has no off-car form), a respray is work, not a
   part. Controls read "Fit kit" / "Respray"; the word replace appears nowhere. This
   is the recorded design decision for the replace-in-place path the audit flagged.

## Art direction (maintainer ruling 2026-08-16, for the art pass, not this build)

The body shop reads as a **Japanese auction sheet**: the top-down damage diagram with
its letter codes (A scratch, U dent, S/C rust, W repair mark, XX panel exchanged) IS
the zone display. One outline convention abstracts the whole roster (a small set of
silhouettes at most, never per-car art); the codes map one-to-one onto the existing
zone model; and the same sheet serves both ends of the loop: the condition report
read at the auction block and the live sheet cleaned up in the body shop are one
visual language, codes clearing as the work lands. Diagram art is hand-made by the
maintainer per the art bible. Cheap early step available before any art: the zone
why-chips adopt the sheet's letter vocabulary.

## Reuse analysis (directive 16)

**Reused:** the whole zone model and pipeline (`bodyPipeline.ts`, `pipelineActions.ts`)
unchanged in mechanics; the bay/slot machinery (`ShopSlot`, `moveCarToSlot`) for the
body bay; `machineLaborMultiplier` for the weld rate; the machine-note disclosure
idiom for naming the stick welder; `WorkshopViews` zone regions, re-hosted in the room;
the Warehouse fit mode for panel installs.

**New:** the body bay slot on `GameState` (Dexie bump, no migration), the body shop
screen, the bench refusal for panels, and the panel-gate content change. No new
mechanics.

## The API contract (both halves build to this)

- `GameState.bodyBayCarId: string | null` (Dexie bump, no migration). One bay.
- Sim exports `carInBodyBay(state, carId): boolean`. Every zone/pipeline plan and
  resolver refuses with a new reason kind `'not-in-body-bay'` when the car is not in
  the bay; the game store surfaces that reason as the disabled caption.
- The car moves there through the existing slot machinery: `moveCarToSlot(carId,
  'body', 0)` with capacity 1, freeing whatever slot it left, same as parking and
  service moves.
- Weld: `planPipelineStage` drops its `'machine-line'` refusal for weld; the stage's
  labour is points x `machineLaborMultiplier('body', ...)`. The stick welder is
  copy on the control ("by hand with the stick welder"), not state. The finish-tier
  gate on paint is unchanged.
- Panel install/remove: no machine multiplier (hand work at the flat class figure).
- Bench: `reconditionGateReason` returns `'body-shop-work'` for a zone-panel
  instance; the workbench states it in words.
- Game: new `BodyShopScreen.vue`, route name `body-shop`, reached from the garage's
  body-and-paint station and from the bay itself; the zone diagram and zone action
  panel move there from `CarDetailScreen.vue`, whose diagram keeps zone condition
  read-only plus a door.

## Tasks

- A. The bay: state, garage UI, drag/move, and the "work needs the car here" gate.
- B. The room: screen, route from bay and station, zone diagram and action panel
  moved in; car page diagram becomes read-only with the door.
- C. Weld to rate; stick-welder copy; body line named at the point of use; finish
  tier unchanged.
- D. Bench refusal for panels; panel install/remove ungated (9 to 3); button idiom
  sweep; disabled reasons surfaced.
- E. Tests move with the surfaces; guard re-pin for the panel-gate content change
  with the felt statement: "bolting a panel is shop-floor work; the booth prices the
  booth".

## Definition of done

- No body action is reachable outside the body shop room; the room is unreachable
  without the car in the body bay.
- Weld works day one, slower by hand, and says why; nothing body-related is a silent
  wall.
- A panel cannot be bench-repaired; the pipeline is the one structure-and-paint
  system.
- Panel install charges 3; no button carries a sentence.
- `pnpm typecheck` (state shape moves); narrowest tests once; pre-push gate is the
  evidence.

## Exit

**Implemented 2026-08-16 by two agents against the contract, lead mesh pass on top.
All green.**

- **The bay.** `GameState.bodyBayCarId` (SAVE_VERSION 72, no migration); the slot
  machinery gained a `SlotKind` beside `BayKind`, deliberately NOT a rentable bay
  kind so the rent formula never silently gained a lever. `moveCarToSlot(carId,
  'body', 0)` swaps like any other slot; the garage renders the bay beside the
  service bays with the full drag idiom.
- **The room.** `BodyShopScreen` (route `body-shop`) hosts the zone diagram and the
  whole action panel, moved out of the car page, which is now read-only condition
  plus a door ("To the body shop" in the bay, "Move her into the body bay first."
  otherwise). All four pipeline resolvers refuse `'not-in-body-bay'` off-bay, and
  the plans surface the caption. The fictional derelict gate module is deleted.
- **The stick welder.** Weld's machine-line wall is gone: points x the body machine
  rate (3x by hand, named on the control; 1x owned or hired). The paint finish-tier
  gate is unchanged: the body line buys speed and finish, exactly what it says.
- **Panel bolts are hand work.** Install/remove at flat bolt-on 3 (was 9);
  `bodywork`'s taxonomy `machineGate` keeps only `repair` (still read by group
  repair pricing). Felt statement recorded: bolting a panel is shop-floor work; the
  booth prices the booth.
- **The bench is out of the body business.** `reconditionGateReason` refuses a
  zone-panel instance (`'body-shop-work'`); the workbench states "Body work. Take it
  to the body shop." on its fixed control (lead-wired, with a test); the
  now-unreachable panelState-strip branch was removed rather than left dead.
- **Button idiom.** Fixed verbs with figures beside them throughout the room; every
  disabled control carries its reason.
- **Art direction recorded** (section above): the room reads as a Japanese auction
  sheet at the art pass; the maintainer draws the sheets.
- **Fallout:** all directive-17 case (a): fixtures moved cars into the bay, and the
  golden hashes re-pinned for the new state field (pure shape change, recorded in
  the pin comments).

**Evidence:** typecheck clean across all three packages; full suite green at the
close-out (228 files, 4,703 tests after the two bay-fixture reconciliations, plus
the new bay/weld/panel/bench tests). The pre-push gate re-verifies at push.
