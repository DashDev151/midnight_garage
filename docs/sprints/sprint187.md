# Sprint 187: the workbench, and the machine shop stops being a list

**Status: PLANNED. Nothing implemented.**

Design of record: `docs/design/systems/the-workbench.md`.

**This sprint absorbed its own earlier draft.** 187 was first planned as "machining moves to the
bench". The bench then became a real place, so moving machining onto an inventory list and moving it
again a sprint later would have been building the same thing twice. One sprint does both.

## Goal

**Storage stops doing work.** Today a part is repaired wherever it happens to be listed: bolt-on and
buried parts straight out of the warehouse, three surface parts on the car. There is no workshop.
After this, a part comes off the car, goes into storage, and is carried to a room to be worked on.

## What is true today, measured

| where work happens now | parts |
| --- | --- |
| **on the car** | chassis, panels, paint (all `removable: false`), plus `aero`, `seats`, `dashGauges` |
| **straight out of the warehouse** | every other part |

`planGroupRepair` skips anything whose `depthClass` is not `surface`, and the codebase calls that
"bench-only". **That names an exclusion, not a place.** `recondition-part` operates on a loose
`PartInstance` and `PartCard` offers the control in the browse list, whose own comment reads *"the
browse inventory is the place to recondition a part."*

## The shape

    car ──remove──▶ warehouse ──┬── carry (free) ──▶ WORKSHOP FLOOR ──┬──▶ warehouse ──refit──▶ car
                                │                    repair           │
                                └── carry (free) ──▶ MACHINE SHOP ────┘
                                                     machining

## Reuse analysis (directive 16)

**New: two station slots on `GameState`, and one screen.**

- A station is `{ partInstanceId } | null`. Two of them: the workshop floor's bench and the machine
  shop's machine. One part each.
- One new screen for the workshop floor. The machine shop already has one.

**Existing mechanisms reused, and this is nearly all of it:**

- **Every room already exists.** `GarageInteriorScreen` draws `workshop-floor`, `warehouse`,
  `machine-shop`, `body-paint`, `alley` and `office`, and the machine shop already has open and
  derelict states. No topology is invented.
- **`recondition-part` is the repair mechanic and does not change.** It already operates on a loose
  `PartInstance`. What changes is where it can be started from.
- **`GameState.partInventory` is the warehouse** and already survives a part coming off a car.
- **`machining` already lives on `PartInstance`**, so a part carries its work with it between rooms
  with no new bookkeeping.
- **The tool gates, the labour costs and the scene gates are untouched.** An operation still costs
  its labour, still needs its tier, and a scene operation still needs Shop standing.

**Nothing parallel is stood up.** No second inventory, no second job kind, no per-room part store:
the stations hold an id into `partInventory`.

## Tasks

1. **Two station slots on `GameState`**, one per room, each holding at most one part id. Free and
   instant to place or take back: the cost is the walk, not a number (maintainer ruling).
2. **The workshop floor screen**: what is on the bench, what it needs, and the repair controls that
   currently live on `PartCard`. Empty state offers to fetch a part from the warehouse.
3. **The machine shop screen stops listing a car's slots** and shows the part on the machine. It no
   longer needs a car on the ramp at all.
4. **Remove the repair control from the browse inventory.** The warehouse lists, holds and hands
   over; it does not work. This is the change the sprint exists for.
5. **Move `aero`, `seats` and `dashGauges` to the bench.** They are the only removable parts still
   repaired on the car.
6. **Split the two setup operations out.** Corner weighting is scales under an assembled car and
   show fitment is how the wheels sit in the arches; neither can be judged with the part off.
   They move to the car's own screen and leave the machine shop.
7. **`depthClass` cleanup.** It has two jobs and only one survives. It decides repair venue (going
   away: venue is now the room) and it drives removal labour (`energyByClass` surface 0 / bolt-on 3
   / buried 6), which stays, because how deep a part is buried is exactly what it should cost to get
   at it. Rename it for the job it still does.
8. **A test that walks the whole sequence**: buy a car, pull the block, carry it to the machine
   shop, machine it, carry it back, refit it, and assert the work survived onto the car and into its
   authenticity and value. Nothing asserts that today.

## Definition of done

- No part can be repaired from the browse inventory, and none from the car except the exceptions.
- A part on the bench is being repaired; a part on the machine is being machined; each room holds
  one.
- The machine shop opens without a car in the bay.
- Corner weighting and show fitment appear only on the car's screen.
- The full sequence test passes.
- `pnpm typecheck` clean (directive 20: `GameState` gains fields and `depthClass` is renamed),
  `npx eslint .` clean, all three projects green. `SAVE_VERSION` bumped, no migration (directive 19).

## Deliberately not here

- **Body work.** Chassis, panels and paint stay on the car. The nine zones do not become removable
  items; the body pipeline is untouched. Ruled.
- **More than one bench per room.** Explicitly deferred rather than rejected, and the likely answer
  if a full engine rebuild starts to feel like queueing.
- **The machining authenticity budget** (49 points against a 10-point collector allowance) and the
  **break-even sweep across every money sink**. Both recorded, both their own work.

## Exit

*(Filled on completion.)*
