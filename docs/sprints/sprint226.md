# Sprint 226: access, hire, slog, the lift, and the classifieds kill

**Status:** Planned
**Arc:** `repair-refactor-arc.md` sprint 3 of 9. Depends on 225.
**Scope:** sim, plus the minimal game-package edits required to keep the app compiling and
truthful (store getters, the UpgradesScreen classifieds section, day-log branches). This
sprint CHANGES LIVE BEHAVIOUR on shared paths (removal, assembly work, hire fees, tyre
fitting, tool purchases); the old on-car repair path itself stays untouched until 231.

One amendment to sprint 225's locked model, recorded there too: the lift discount applies
only to work done ON THE CAR - remove/refit actions on `underCar` parts and repair steps
whose target is installed. Bench work is never lift-discounted.

## Reuse analysis (directive 16)

New mechanisms: `accessRoute` (one resolver for "can I move/fit this part and at what
multiplier"), the lift purchase/hire resolvers, the hire cap. Existing mechanisms reused:
`resolveHireMachineLine`'s day-stamp storage (`machineHirePaidDayByGroup`) is kept as-is;
`state.lift` (landed 225) mirrors the dyno's `{ owned, hirePaidDay }` shape; the tyre gate
reuses the same `accessRoute` logic; `applyToolUpgrade`/`applyToolShopPurchase` keep their
rep+cash gates and lose only the listing clause. Nothing new is invented for fees: the
`toolHire` block (224) becomes the single fee table.

## Locked model

### accessRoute (new, in `packages/sim/src/repairJobs.ts`)

```ts
accessRoute(state, context, entry) -> { route: 'open' | 'own' | 'hired' | 'slog'; multiplier: 1 | 3 }
```
- `entry.depthClass !== 'buried'` -> `{ route: 'open', multiplier: 1 }` (no rig needed).
- buried: group level >= 2 (via `toolLevelsFor`) -> `'own'` x1; `machineHiredToday(group)`
  -> `'hired'` x1; else `'slog'` x `toolHire.slogMultiplier` (3).
- Removal is never blocked by tools (spec section 4: all removal is sloggable).

Consumers switched this sprint: `resolveRemovePart` (labour = `removePart` action points x
`accessRoute` multiplier, replacing `machineGateGroupFor(carPartId, 'remove')` +
`machineLaborMultiplier`); the install/refit labour sizing (buried installs multiply by
`accessRoute`, all non-buried installs are x1 - the old `install` machine gates on
dampers/springs/seats/dashGauges/chassis are DROPPED, their tier-1 tools are on the
board); `resolveRemoveAssembly`/`resolveRefitAssembly` (same rule via the assembly's
governing entry). Lift: after the multiplier, if `entry.underCar` and
(`state.lift.owned` or `state.lift.hirePaidDay === state.day`), subtract
`economy.lift.underCarStepDiscountPoints` from the action's points, floor 1.

### Hire (tool lines)

- `resolveHireMachineLine` renamed `resolveHireToolLine` (same file, all sim callers
  updated; the store action keeps its name until 228). Fee now
  `economy.toolHire.feeYenByGroup[group]`. New refusal reason `'hire-cap'`: refuse when
  any OTHER group's `machineHirePaidDayByGroup` stamp equals `state.day` and
  `economy.toolHire.maxHiredLinesPerDay` (1) is reached. Re-hiring the same group same day
  stays a silent success. Day-lapse stays implicit (stamp vs day), unchanged.
- Per-operation assist fees RETIRE: delete `machineAssistFeeYen` and every charge site
  (remove/install/repair gated-op fees). Access is now paid by the day (hire) or in
  energy (slog), never per op.
- `signatureOpFeeYen` (machining signature service jobs) is UNCHANGED in behaviour but
  re-points its fee-table read from `machineShopAssist.feeYenByGroup` to
  `toolHire.feeYenByGroup` (engine fee is identical at 15,000, so `make-it-pull`'s probe
  numbers do not move). This clears `machineShopAssist`'s last live read ahead of 231.
- `machineLaborMultiplier` (still used by the old repair path until 231) re-points its
  multiplier read to `toolHire.slogMultiplier` (same value, 3). No behaviour change.

### The lift

- `resolveBuyLift(state, context)`: gates in order: already owned (silent success),
  reputation below `economy.lift.minReputationTier` -> refuse `'reputation'`, cash short
  -> refuse `'no-cash'`; else `cashYen -= purchasePriceYen`, `lift.owned = true`, book
  via `bookCashMovements`, emit `equipment-purchased` (reuse the existing event with the
  lift's name; follow the dyno-purchase call shape).
- `resolveHireLift(state, context)`: mirrors the tool-line hire (owned -> silent success,
  already hired today -> silent success, cash gate) at `economy.lift.hireFeeYen`; sets
  `lift.hirePaidDay = state.day`. The lift does NOT count against
  `maxHiredLinesPerDay` (it is bay equipment, not a tool line).
- Session events mirror the dyno's pair exactly: new kinds `lift-hired` (fee) and
  `lift-bought` (price) in sessionEvent.ts; the day-log formatter branches land with
  sprint 228.
- Effect is already wired: 225's `energyPlanFor` step 5 and this sprint's `accessRoute`
  discount.

### Classifieds kill (D-A2)

- `applyToolUpgrade` and `applyToolShopPurchase` (toolLines.ts): delete the
  `machineListing` requirement clause; rep + cash + not-already-owned remain.
- Delete `rollMachineListings` and its `advanceDay` step (7a3).
- Retire state fields `machineListing` and `nextMachineListingDay` from gameState.ts
  (remove fields; bump `SAVE_VERSION` and Dexie version).
- Remove `MachineListingSchema` and the `machine-listed` / `tool-shop-listed` event kinds
  (sessionEvent.ts) and their `dayLogFormat.ts` branches.
- UpgradesScreen.vue: delete the Classifieds section (`data-test="machine-listing"`) and
  the `needs-listing-*` tooltips/gate copy; the buy buttons now gate on rep and cash only.
  (Full page redesign is sprint 228; this is the minimal truthful cut.)
- Store: delete the getters/actions that exist only for listings.

### Tyre fitting

- `economy.json`: `energy.actionPoints.benchFitMember` 0 -> 2 (lever ledger R1; re-pin the
  economy hash with a ledger paragraph in the same change).
- `resolveFitAssemblyMember`'s tyre gate: replace the `machineGateGroupFor(memberSlot,
  'bench-fit')` read with: wheels group level >= 2 or hired today -> x1, else x3. Cost is
  therefore 2 points on the machine, 6 by hand. Dismounting stays ungated.

### Store getter truth-fixes (minimal, no redesign)

- `machineLineFeeYen(group)` reads `toolHire.feeYenByGroup`.
- New getter `hireCapReachedToday: boolean` (for 228's panel).
- `removeMachineNoteFor` / `installMachineNoteFor` / `repairMachineNoteFor`: the fee
  figure is gone; the note copy becomes (locked, in `dayLogFormat.ts`'s
  `machineLineGateCopy`): "Without the {machine name} this is triple the labour. Hire it
  for the day, or buy your own." Notes appear only when `accessRoute` returns `'slog'`
  for the part in question (buried parts, level 1, unhired). The old
  `repairMachineNoteFor`/`repair-ceiling` captions on the OLD repair path may keep their
  current text until the path dies in 231; do not spend effort there.

## Tasks

1. `accessRoute` + consumer switches (`resolveRemovePart`, install/refit sizing,
   `resolveRemoveAssembly`, `resolveRefitAssembly`) + lift discount on those actions.
2. Hire rename + `toolHire` fees + `'hire-cap'` + assist-fee retirement +
   `signatureOpFeeYen`/`machineLaborMultiplier` re-points.
3. Lift resolvers + store actions `buyLift()` / `hireLift()` (instant resolvers, same
   pattern as `buyDyno`/`hireMachineLine`).
4. Classifieds kill, exactly as listed, including the schema field removals and version
   bumps.
5. Tyre gate + `benchFitMember` value + economy re-pin (ledger paragraph: the R1
   `benchFitMember` row).
6. Store getter truth-fixes as listed.
7. Tests:
   - `machineGateConversion.test.ts`: RETIRE the file; replace with
     `packages/sim/tests/accessRoute.test.ts`: buried x removal at level 1 = 6 points,
     hired = 2, level 2 = 2; non-buried removal always 2; buried install 6 -> 18 slogged;
     lift knocks 1 point off under-car removal (floor 1); tyre fit 2 vs 6; lift never
     discounts bench work.
   - `jobs.test.ts`: rewrite the machine-assist fee describe block (fees no longer
     charged per op - assert the removal cash flow has NO fee component and the day-hire
     charge stands alone); update removal-labour cases to the accessRoute figures; the
     old-path repair cases stay untouched.
   - `toolLines.test.ts`: delete listing-gated purchase cases; add: purchase succeeds
     with rep+cash and no listing state; hire cap refuses a second line same day; lift
     purchase rep/cash gates.
   - `assemblies.test.ts`: update multiplier expectations to accessRoute; tyre-fit
     energy cases to 2/6.
   - UpgradesScreen tests: drop listing cases.
   - dayLogFormat tests: drop `machine-listed`/`tool-shop-listed` cases.
8. Golden masters: hashes move (state fields removed; hire fees changed; removal
   multipliers re-based). Re-pin both suites with trace comments naming the three causes.
   The careerReplay "machine hire preceding gated removal" test's assertions about
   RELATIVE behaviour (hire changes the day's spend) must still hold; if the relative
   behaviour breaks, STOP and report.
9. `pnpm typecheck` (fields retired: the carve-out applies).

## Checks

`accessRoute.test.ts`, then `pnpm test --project sim`, then affected game-package test
files (`UpgradesScreen`, `dayLogFormat`, store tool-line tests) individually, then
`pnpm typecheck`.

## Exit

(Fill on completion.)
