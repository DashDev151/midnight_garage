# The workbench: one place where work happens

**Status: DESIGN, unsigned.** Raised by the maintainer 2026-08-06, out of the machining flow being
backwards:

> *"ALL modification on any part (except for the ones where it doesn't make sense like the Chassis
> and the already mentioned setup work) INCLUDING REPAIR gets done on uninstalled parts... The
> workflow is always: part gets removed, goes to inventory (warehouse), player moves to a physical
> repair bench (this means a dedicated UI page), player retrieves the part from inventory and places
> it on the workbench. Repair work gets done on the workbench. Part re-enters inventory. Player
> re-installs part from inventory."*

## What is already true, measured

The mechanical half of this is mostly built, which makes the change smaller than it sounds.

**Of the 28 taxonomy parts, only six are repaired on the car**, and three of those cannot be removed
at all:

| part | group | removable | today |
| --- | --- | --- | --- |
| chassis | body | **no** | on-car |
| bodywork | body | **no** | on-car, via the zone model |
| paint | body | **no** | on-car, via the zone model |
| aero | body | yes | on-car |
| seats | interior | yes | on-car |
| dashGauges | interior | yes | on-car |

**Every other part is repaired straight out of inventory.** `planGroupRepair` skips anything whose
`depthClass` is not `surface`, and the codebase calls that "bench-only" (Sprint 71 put it there).
**That phrase describes an exclusion, not a place.** There is no bench: `recondition-part` operates
on a loose `PartInstance` and `PartCard` offers the control wherever the part is listed. Its own
comment gives the game away: *"the browse inventory is the place to recondition a part."*

**So the warehouse is doing the work**, which is precisely what this design removes. Nothing should
be repaired out of storage.

## What is actually missing

**Two things, and neither is the repair mechanic.**

1. **There is no bench.** Work happens wherever the part happens to be listed, so the sequence the
   maintainer describes is invisible: a player never goes anywhere, a button just appears on a card
   in a list. Storage and workshop are the same screen.
2. **Three removable parts still repair on the car**: `aero`, `seats`, `dashGauges`. They are
   `surface` class, so they are exempt for no reason beyond being easy to reach.

So this is not a rewrite of how repair works. It is **making a place, routing all part work through
it, and moving three parts in.**

## RULINGS (maintainer, 2026-08-06)

1. **Bodywork and paint stay as they are.** Body work remains the deliberate exception alongside the
   chassis. The nine zones do not become removable items and the body pipeline is untouched.
2. **Each station holds ONE part at a time.** Not purchasable, not expandable. Multiple benches are
   a good idea and explicitly deferred, not rejected.
2b. **Repair and machining are different rooms.** General workbenches on the workshop floor do
   repair; the machine shop does machining and nothing else.
3. **Moving a part to the bench is free and instant.** No labour, no day. *"It is scenery, that's
   what I want. It forces physical action from the player."* The cost is the walk, not a number.
4. **`depthClass` gets cleaned up** in the same pass.

**The consequence of ruling 2, worth watching in play rather than arguing now:** one bench
serialises every part-level job in the shop. Rebuilding an engine means carrying parts to the bench
one at a time. Labour is already the binding constraint most days, so this may cost nothing in
practice, or it may make a full rebuild feel like queueing. That is a play question and the answer
is more benches, which ruling 2 already anticipates.

## The shape: storage, and two workshops

**The warehouse holds parts and does no work.** Work happens in one of two rooms, and which one
depends on the discipline (maintainer ruling, 2026-08-06): *"repair work happens at general
workbenches on the shop floor. Machining is a specialised task that happens in the machine shop
only."*

    car ──remove──▶ warehouse ──┬── carry (free) ──▶ WORKSHOP FLOOR ──┬──▶ warehouse ──refit──▶ car
                                │                    repair           │
                                └── carry (free) ──▶ MACHINE SHOP ────┘
                                                     machining

**Every one of these rooms already exists.** `GarageInteriorScreen` draws `alley`,
`workshop-floor`, `warehouse`, `machine-shop`, `body-paint` and `office`, and the machine shop
already has open and derelict states. The design is not inventing a topology; it is giving two
existing rooms the job they are named for.

**Each station holds one part.** The workshop floor has a part on the bench; the machine shop has a
part on the machine. They are separate stations rather than one shared limit, because they are
separate rooms doing separate work: a block can be on the machine while a damper is being rebuilt.

**What collapses is the duplicate, not the distinction.** The recondition control currently appears
wherever a part is listed, which is the thing being removed. Machining keeps its own room, its own
tools and its own tier-3 gate, exactly as it should: it was never wrong that machining is special,
only that repair was not anywhere at all.

## The exceptions, and why each is one

- **Chassis.** Not removable, and welding a shell straight is done to the shell. Named by the
  maintainer.
- **Setup work.** Corner weighting is scales under an assembled car; show fitment is how the wheels
  sit in the arches. Neither can be judged with the part off. These belong on the car's own screen,
  not at a bench (`sprint187.md`).
- **Bodywork and paint: OPEN, and the biggest question here.** Both are `removable: false` carriers
  repaired per zone by the body pipeline. Making body work a bench discipline means making the nine
  zones removable items, which is a far larger change than the rest of this design and reaches into
  the body system, the zone state shape and the one-way body-kit problem already in `TODO.md`.

## `depthClass` after this

With only the three body carriers left on-car, `surface` stops meaning "repaired in place" and
starts meaning "cannot be removed", which is what `removable` already says. The field also drives
removal labour (`energy.energyByClass`: surface 0, bolt-on 3, buried 6), and that job is real and
stays: how deep a part is buried is exactly what it should cost to get at it. So the field keeps its
labour job and loses its repair-venue job, and its name should say the one thing it still does.

## Sequencing: this ABSORBS sprint 187 rather than following it

Sprint 187 was planned to move machining onto the bench and split the two setup operations out. With
the bench now becoming a real place immediately after, doing 187 separately would move machining
onto an inventory list and then move it again a sprint later.

**One sprint does both**: build the bench, route repair and machining through it, move `aero`,
`seats` and `dashGauges` in, send corner weighting and show fitment to the car's own screen, and
clean up `depthClass`. `sprint187.md` is superseded and its venue table and reuse analysis carry
over verbatim; the machining half of it is unchanged, it simply lands in a room instead of a list.
