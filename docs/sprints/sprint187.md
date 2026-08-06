# Sprint 187: the workbench, and the machine shop stops being a list

**Status: IMPLEMENTED, ready for review. Not yet committed.**

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
2. **Machining re-keys off the car and onto the loose part.** This is bigger than the screen and is
   the sim half of the sprint. Today a machining job is
   `machine-${carInstanceId}-${carPartId}-${operationId}` and `completeMachiningJob` writes to
   `installed.machining` on the car. It becomes `machine-${partInstanceId}-${operationId}` writing
   to the loose `PartInstance`, which already carries a `machining` array. Two of
   `machiningGateReason`'s reasons (`not-in-service-bay`, `slot-empty`) cease to exist; `not-mint`
   and `already-applied` read the loose part instead. Nothing downstream moves: `derivedStats.ts`
   sums `machining` over installed parts, and a machined part refitted to a car still carries it.
3. **The workshop floor screen**: what is on the bench, what it needs, and the repair controls that
   currently live on `PartCard`. Empty state offers to fetch a part from the warehouse.
4. **The machine shop screen stops listing a car's slots** and shows the part on the machine. It no
   longer needs a car on the ramp at all.
5. **Remove the repair control from the browse inventory.** The warehouse lists, holds and hands
   over; it does not work. This is the change the sprint exists for.
6. **Move `aero`, `seats` and `dashGauges` to the bench.** They are the only removable parts still
   repaired on the car.
7. **Split the two setup operations out.** Corner weighting is scales under an assembled car and
   show fitment is how the wheels sit in the arches; neither can be judged with the part off.
   They move to the car's own screen and leave the machine shop.
8. **`depthClass` cleanup.** It has **three** jobs, not two, and two of them survive.
   - **Repair venue: dies.** `bands.ts:449` and `:494` skip non-`surface` parts, and
     `jobs.ts:813` refuses one with `'bench-only'`. Venue is now the room.
   - **Install labour: stays.** `energyByClass` (surface 0 / bolt-on 3 / buried 6) prices refitting
     via `installLaborSlotsFor`. How deep a part sits is exactly what it should cost to seat it.
   - **The buried machine-hire gate: stays.** `jobs.ts:413` `removeMachineGateGroup` exempts
     anything that is not `buried`, so pulling a block needs the machine line and pulling a damper
     does not.

   So the field keeps two real jobs and loses one. **And once the venue job is gone, the name is
   correct, so it does not get renamed.** The complaint was that `surface` secretly meant "repaired
   in place", which is a venue meaning the word does not carry. Delete the three venue call sites
   and `surface`/`bolt-on`/`buried` mean exactly what they say: how deep the part is buried. A
   rename on top of that would be churn.

   **Correction to an earlier claim in this doc's own drafting:** removal labour is NOT depth-scaled.
   `removeLaborSlotsFor` (`jobs.ts:44`) charges a flat `actionPoints.removePart` and ignores
   `depthClass` entirely; its `carPartId` parameter is vestigial. `energyByClass` prices the refit,
   not the pull.
9. **A test that walks the whole sequence**: buy a car, pull the block, carry it to the machine
   shop, machine it, carry it back, refit it, and assert the work survived onto the car and into its
   authenticity and value. Nothing asserts that today.

## What does NOT change, decided rather than left open

- **Every machine-line capability gate survives, and none needs new code.** All six tool lines gate
  capability, through three mechanisms, not one: signature slots cover suspension, body and interior
  (`economy.json` `signatureSlotsByGroup`); the buried-slot gate covers engine and drivetrain; and
  wheels has its own tyre-fit gate. `machineLineGroupFor` (`jobs.ts:452`) is
  `removeMachineGateGroup ?? signatureGroupFor`, and `completeJob`'s `install-part` branch
  (`jobs.ts:334`) checks it before the part touches the car.

  So the gate fires on the **refit** rather than on the repair, and since a repaired part is worth
  nothing until it goes back on, it is unavoidable in the loop. On-car repair of `panels` and
  `chassis` keeps its own gate at `jobs.ts:890`. Nothing is lost and nothing is added.

  **This corrects an analysis made while drafting**, which held that moving `seats` and `dashGauges`
  to the bench would silently drop the interior gate. It does not: the gate was never only on the
  repair step.
- **Labour costs are not being retuned.** One consequence is worth naming: `aero`, `seats` and
  `dashGauges` now cost a removal (a flat `actionPoints.removePart`) plus a refit
  (`energyByClass.surface`, which is 0) that they did not pay before. That is the routing charging
  what the routing costs, not a lever being pulled.
- **`recondition-part` itself.** It already operates on a loose `PartInstance` and already ignores
  `depthClass`. Only its entry point moves.

## Levers (directive 22)

**One lever, approved by the maintainer 2026-08-06, before any agent implementing it launched.**

| lever | file | value | why |
| --- | --- | --- | --- |
| `machining.operations[].performedOn` | `packages/content/data/economy.json` | `'fitted-part'` on `corner-weighting` and `show-fitment`; every other operation takes the schema default `'loose-part'` | Task 2 re-keys machining to a loose part, which is right for the thirteen bench operations and wrong for these two: corner weighting is scales under an assembled car and show fitment is how the wheels sit in the arches. Neither can be judged with the part off. |

**It is a structural fact, not a tunable.** No price, payout, labour figure or formula moves; the
field says where an operation physically happens. It earns a lever entry only because
`economy.json` is hash-pinned by `economyApprovalGate.test.ts`, and that pin is re-cut in the same
change as this record.

**Why not a constant in sim.** A named list of the two operations in code would avoid the re-pin
entirely, and was rejected: it puts a classification of content into code, where content law says
it does not belong and where nobody will look for it again.

**Why a defaulted enum rather than a boolean.** The default keeps the `economy.json` diff to the two
operations that are genuinely different, and the code branches on an address kind (`loose-part` vs
`fitted-part`), which is exactly what the enum names.

## Definition of done

- No part can be repaired from the browse inventory, and none from the car except the exceptions.
- A part on the bench is being repaired; a part on the machine is being machined; each room holds
  one.
- The machine shop opens without a car in the bay.
- Corner weighting and show fitment appear only on the car's screen.
- The full sequence test passes.
- `pnpm typecheck` clean (directive 20 carve-out: `GameState` gains fields and the machining and
  recondition gate unions are reshaped), `npx eslint .` clean, all three projects green.
  `SAVE_VERSION` bumped, no migration (directive 19).
- The `economy.json` approval hash re-pinned in the same change as the lever record above.

## Deliberately not here

- **Body work.** Chassis, panels and paint stay on the car. The nine zones do not become removable
  items; the body pipeline is untouched. Ruled.
- **More than one bench per room.** Explicitly deferred rather than rejected, and the likely answer
  if a full engine rebuild starts to feel like queueing.
- **The machining authenticity budget** (49 points against a 10-point collector allowance) and the
  **break-even sweep across every money sink**. Both recorded, both their own work.

## Exit

Every task landed. Built in three waves: sim and content, then the screens, then the setup-work
split and the sequence test.

### Definition of done, checked

- [x] No part is repaired from the browse inventory. The control and its `showRecondition` prop are
      deleted from `PartCard.vue`, and the bench-recondition control is deleted from
      `CarDetailScreen.vue`. A part on a station stays listed in the warehouse with a chip saying
      where it is, so it can still be found; it just cannot be worked from there.
- [x] On-car repair narrows to the parts that never come off. `bands.ts` and `jobs.ts` key off
      `removable` where they keyed off `depthClass !== 'surface'`, so `chassis`, `panels` and
      `paint` keep repairing in place and `aero`, `seats` and `dashGauges` go to the bench with
      everything else.
- [x] Each room holds one part, as separate stations. `workbenchPartId` and `machinePartId` on
      `GameState`; placing and taking back is free, instant and unlogged.
- [x] The machine shop opens with no car in a bay. The one-car-in-a-service-bay gate on
      `machineShopSheet` is gone and nothing replaced it.
- [x] Corner weighting and show fitment appear only on the car. `machiningReadingFor` filters to
      `loose-part`, so the machine shop cannot offer them even with springs on the machine and
      `touge` standing at Shop.
- [x] The full sequence test passes (`packages/sim/tests/partWorkSequence.test.ts`).
- [x] `SAVE_VERSION` 65 to 66, no migration, no legacy-compat branch (directive 19).
- [x] The `economy.json` hash re-pinned in the same change as the lever record.

### What the sequence test observed

Both routes run through the real resolvers, not helpers.

**Machine shop.** Grant a Supra, pull the engine assembly (8 labour), pull the block, confirm the
warehouse refuses the work (`not-on-machine`), place it on the machine, bore and hone it (5 labour),
carry it back, refit. The same instance returns to the slot carrying `['bore-and-hone']`;
`machiningCost` 8, originality 96 to 88; fitted-parts value nil to 4,752 yen (144,000 x 0.03 x 1.1
retention); whole-car value 2,805,760 to 2,810,512 yen.

**Bench.** A `poor` steering rack, pulled (2 labour), refused in the warehouse
(`not-on-workbench`), allowed on the bench, reconditioned, refitted. The same instance returns at
`mint`, and the refit clears `workbenchPartId`.

### Rulings and corrections made during the work

- **`depthClass` is not renamed.** Once the venue job is deleted the name is accurate. It keeps two
  real jobs: install labour via `energyByClass`, and the buried machine-hire gate.
- **The venue reads are replaced, not deleted.** Deleting them outright would have let on-car group
  repair reach every part, making the bench bypassable. `removable` is the correct predicate and is
  what the design doc prescribes.
- **A fourth venue site existed** that the plan did not list: `balanceProbes.ts:479`, which
  compensated for `planGroupRepair`'s exclusion by separately pricing bench repairs. Left alone it
  would have double-counted. Inverted to `!entry.removable`, reproducing the old partition exactly:
  no probe number moves.
- **No capability gate was lost.** `machineLineGroupFor` is checked on `install-part` before the
  part touches the car, so every machine-line gate fires on the refit. A drafting analysis holding
  that the interior gate would silently vanish was wrong and is corrected in the section above.
- **A benched assembly member can no longer be reconditioned in place.** Routing only: pull it
  (0 labour), bench it, work it, put it back (0 labour). Every binding total in `assemblies.test.ts`
  is unchanged. `benchMemberReconditionStep` in the store was already dead after the sim change and
  went with it, along with a comment beside it that was false.
- **An incoherence fixed in passing.** Corner weighting and show fitment shipped inside a room gated
  on `toolTiers.engine`, though one is a suspension operation and the other a wheels operation. On
  the car screen they answer only to their own tool line.

### Found and fixed while working

A pre-existing fixture bug in `assemblies.test.ts`: gearbox, clutch and internals fixtures used
`everyday`-class stock parts on an `entry`-class car. It never mattered because the old path ran no
fitment check; the new routing does.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 30 files, 610 passed |
| `pnpm test --project sim` | 95 files, 2484 passed |
| `pnpm test --project game` | 76 files, 963 passed |
| `npx eslint` on changed files | exit 0 |
| `npx prettier --check` on changed files | clean |
| `packages/content/data/` diff | two lines, both the approved lever |

Diff: 63 files, 2510 insertions, 1289 deletions.

**The pre-push gate has not run**, because nothing is committed yet. It is the sprint's real gate
(directive 20) and its output belongs here; this Exit is completed when the push runs it.

### Deferred out of this sprint

- More than one bench per room. Deferred, not rejected, and the answer if a full engine rebuild
  starts to feel like queueing.
- Benching an assembly member in place, if the extra pull and put-back proves annoying in play. One
  line in `reconditionGateReason`.
- The machining authenticity budget and the break-even sweep across every money sink. Both their
  own work.
