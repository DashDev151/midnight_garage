# Sprint 226: access, hire, slog, the lift, and the classifieds kill

**Status:** Complete, ready for review. Not committed.
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

All nine tasks landed. Access is now one resolver (`accessRoute`), hire is one fee table
bought by the day, the lift is buyable and hirable, the classifieds are gone from the sim,
the schema and the UI, and a tyre fit costs real labour. The old on-car repair path is
untouched and still runs on `machineLaborMultiplier`, exactly as scoped; it dies in 231.

### Files landed

New:

- `packages/sim/tests/accessRoute.test.ts` (230 lines, 6 tests): buried removal 6 slogged /
  2 hired / 2 owned at tier 2; non-buried removal always 2 at every tool state; buried
  install 6 with the rig and 18 slogged; the lift knocking a point off an under-car removal
  and refit, floored at 1, owned or hired alike; the lift never discounting bench work on an
  under-car part; tyre fit 2 on the machine and 6 by hand. Replaces
  `packages/sim/tests/machineGateConversion.test.ts`, deleted.
- `packages/game/src/stores/gameStore.lift.test.ts` (106 lines, 7 tests): the purchase gated
  on reputation then cash, a second purchase refused rather than charged, the day hire
  charged once and free on a repeat the same day, a short-cash refusal that charges nothing,
  owning it ending the hire for good, and the lift never counting against the tool-line hire
  cap.

Modified, sim:

- `packages/sim/src/jobs.ts`: `accessRoute` (`open`/`own`/`hired`/`slog`, multiplier 1 or
  `toolHire.slogMultiplier`) and `accessActionPoints` (the multiplier, then the lift's
  `underCarStepDiscountPoints` on an `underCar` slot, floored at 1) added;
  `machineAssistFeeYen` deleted with every charge site; `resolveHireMachineLine` renamed
  `resolveHireToolLine` and re-priced off `toolHire.feeYenByGroup`, with the new
  `HireMachineLineGateReason` member `'hire-cap'` refusing a second line once
  `toolHire.maxHiredLinesPerDay` (1) is spent on another group; `signatureOpFeeYen` and
  `machineLaborMultiplier` re-pointed at `toolHire` (both values identical, no behaviour
  change).
- `packages/sim/src/repairJobs.ts`: `resolveBuyLift` / `buyLiftGateReason` (already-owned,
  reputation, cash, in that order; books through `bookCashMovements` and the existing
  `equipment-purchased` day-log entry named `'lift'`) and `resolveHireLift` /
  `hireLiftGateReason` (owned or already hired today is a silent success; the only refusal
  is short cash).
- `packages/sim/src/assemblies.ts`: `tyreFitMultiplier` replaces the `machineGateGroupFor`
  bench-fit read - 1 with the wheels line owned or hired today, `toolHire.slogMultiplier`
  otherwise, and only ever for `tyres`. Dismounting stays ungated.
  `resolveRemoveAssembly` / `resolveRefitAssembly` price through `accessRoute`.
- `packages/sim/src/toolLines.ts`: `rollMachineListings`, `isToolTierListed` and
  `isToolShopListed` deleted; `applyToolUpgrade` and `applyToolShopPurchase` keep their
  reputation, cash and not-already-owned gates and lose the listing clause.
- `packages/sim/src/advanceDay.ts`: step 7a3 (the classifieds roll) removed.
- `packages/sim/src/careerReplay.ts`: `resolveHireToolLine` under the unchanged
  `hireMachineLine` event name, plus `lift-bought` / `lift-hired` replay cases.
- `packages/sim/src/newGame.ts`, `packages/sim/src/cafe.ts`: the two retired fields dropped
  from the seeds.

Modified, content:

- `packages/content/data/economy.json`: `energy.actionPoints.benchFitMember` 0 -> 2. The
  only value that moved.
- `packages/content/src/gameState.ts`: `MachineListingSchema`, `machineListing`,
  `nextMachineListingDay` and the `machine-listed` / `tool-shop-listed` day-log kinds
  removed.
- `packages/content/src/sessionEvent.ts`: `lift-hired` and `lift-bought` variants added on
  the dyno's bare optional-number shape.
- `packages/content/src/cashLedger.ts`: the two retired day-log kinds dropped from
  `cashMovementFor`'s no-movement list.

Modified, game:

- `packages/game/src/save/saveCodec.ts`: `SAVE_VERSION` 77 -> 78, no `MIGRATIONS[77]` entry
  (directive 19). `packages/game/src/save/saveDb.ts`: Dexie `version(5)`, table shape
  unchanged.
- `packages/game/src/stores/gameStore.ts`: `machineLineFeeYen` and the hire-panel fee reads
  re-pointed at `toolHire.feeYenByGroup`; new `hireCapReachedToday`, `liftOwned`,
  `liftAvailableToday`, `liftHireFeeYen`, `liftPurchasePriceYen`, `liftMinReputationTier`,
  `liftPurchaseGateReason`, `buyLift()`, `hireLift()`; `machineListingView` and the
  listing-only getters deleted; the three machine notes collapsed onto one
  `slogAccessNoteFor` that fires only when `accessRoute` reads `'slog'`.
- `packages/game/src/utils/dayLogFormat.ts`: `machineLineGateCopy` becomes "Without the
  {machine name} this is triple the labour. Hire it for the day, or buy your own."; the two
  classifieds branches removed; `equipment-purchased` names the two-post lift.
- `packages/game/src/screens/UpgradesScreen.vue`: the Classifieds section and every
  `needs-listing-*` gate removed; buy buttons gate on reputation and cash only.
  `CarDetailScreen.vue`, `BodyShopScreen.vue` and `dev/economyBenchActions.ts` follow the
  renamed resolver and the new note.

### Behaviour changes, with figures

- **Removal.** A non-buried part is 2 points at every tool state. A buried part is 2 owned
  at tier 2 or hired today, 6 slogged (`removePart` 2 x `slogMultiplier` 3). Removal is
  never refused.
- **Install and refit.** A buried install of a 6-point part is 6 with the rig and 18
  slogged. Every non-buried install is x1: the old `install` gates on `dampers`, `springs`,
  `seats`, `dashGauges` and `chassis` are dropped, since all five are `surface` or plain
  removable slots whose tier-1 tools are on the board.
- **The lift.** `underCarStepDiscountPoints` 1 comes off each remove or refit action on an
  `underCar` slot, floored at 1, whether the lift is owned or hired for the day. It never
  touches bench work.
- **Hire fees.** engine 15,000 (unchanged), drivetrain 18,000 -> 13,750, suspension 5,000 ->
  7,500, wheels 3,000 -> 6,250, body 6,500 -> 10,000, interior 7,000 (unchanged). One line
  per day. Per-operation assist fees are gone entirely: access is paid by the day or in
  energy, never per op.
- **Tyre fitting.** 2 points with the wheels line owned at tier 2 or hired today, 6 by hand.
  Dismounting is still free.
- **Classifieds.** A rung or a shop is buyable the moment reputation and cash allow.

### Economy re-pin

One value moved, so one hash moved. `economy.json`
`84de5a0884ee4523613b714b6075ad48a8e897b9854ffd709c0aef04d1a85a5f` ->
`75050c706b5e74155426f177f19e98e4c30cce705fe43c51abbce1dd7239d62e`. The other five pinned
files were re-hashed and every one matches its existing pin unchanged:

| File | Hash | Moved |
| --- | --- | --- |
| `economy.json` | `75050c70...` | yes |
| `damagePatterns.json` | `6a393662...` | no |
| `partPricing.json` | `27b1b29d...` | no |
| `toolLines.json` | `154114c1...` | no |
| `toolShops.json` | `614b8470...` | no |
| `workbench.json` | `a96b72c3...` | no |

The mission payout and budget cap pin is unchanged: `benchFitMember` is labour, and a payout
derives from build cost rather than from labour.

The ledger paragraph appended to `packages/content/tests/economyApprovalGate.test.ts`'s
header, verbatim:

```text
Re-pinned 2026-08-20 for sprint226.md task 5 (the tyre gate), under the same
behaviour-first governance amendment: the value is Claude's own choice, stated here by
felt behaviour and recorded in docs/sprints/repair-refactor-lever-ledger.md (R1, the
Energy table), validated by playtest rather than pre-ratified. Exactly one value moves.

`economy.energy.actionPoints.benchFitMember` 0 -> 2. Felt behaviour: fitting a tyre is
finally work - two points on the machine, six by hand with levers, since the wheels gate
slogs at x3 when the line is neither owned to tier 2 nor hired for the day. At 0 the gate
was decorative: it named a machine and then charged nothing either way, so mounting a set
of rubber by hand cost the same nothing as mounting it on the balancer.

Nothing else moves. `toolLines.json`, `toolShops.json`, `workbench.json`,
`partPricing.json` and `damagePatterns.json` are all untouched, so their five hashes hold
unchanged, and no mission payout or budget cap moves: `benchFitMember` is labour, and a
payout derives from build cost rather than from labour.
```

### Golden master re-pins, with their causes

Three candidate causes were in play: the two retired state fields, the removed
`rollMachineListings` step (which could shift the per-day RNG stream), and the changed hire
fees and labour figures. Each golden's movement was decomposed by RE-RUNNING the same script
against a context whose economy carries the OLD values, and re-adding the two retired keys
as `null` before hashing. Where that reproduces the previous hash exactly, the causes are
proved rather than argued.

**`advanceDay.test.ts`, the 30-day scripted career: `31707bd5` -> `f1441261`.** Two causes.
`GameState` loses `machineListing` and `nextMachineListingDay`, which `hashState` serialises;
and the script's two hires (body on day 1, suspension on day 3) now read `toolHire`, so the
career ends 6,000 yen poorer. Arithmetic: (10,000 - 6,500) + (7,500 - 5,000) = 6,000, and
1,063,540 - 6,000 = 1,057,540, which is the measured figure to the yen. Re-running with the
old fee table and the two keys re-added hashes to exactly `31707bd5`, which also proves the
other two candidates move nothing here: the removed classifieds step drew no RNG in this
career (reputation never leaves `unknown`, so `eligibleMachineListingCandidates` was empty
every day and the roll never drew), and re-basing removal and install labour onto
`accessRoute` changes no figure this state carries at day 31.

**`advanceDay.test.ts`, the rent-cadence cash assertion: 1,063,540 -> 1,057,540.** Not a
re-pin. The test reconciles closed-form and read its two hire fees off
`machineShopAssist.feeYenByGroup`, which is no longer the table a hire is priced from
(directive 17 case (a): the assertion went stale when the implementation deliberately moved
the read). The READ was corrected to `toolHire.feeYenByGroup`; the assertion stays a
reconciliation rather than a literal, and it now passes against the same formula.

**`advanceDay.test.ts`, the acquisition-to-sale career: `bd89d46a` -> `4f33444b`.** A pure
SHAPE change. Re-adding the two retired keys as `null` reproduces `bd89d46a` exactly, and
the final cash figure is identical either way (4,978,502). This script hires no tool line
and fits no assembly member, so neither the fee table nor the fitting cost can reach it, and
the classifieds roll never drew here for the same reputation reason.

**`careerReplay.test.ts`, all ten smoke-script hashes, and `smoke.script.json`'s three
checkpoints.** Two causes: the same two retired keys leaving every day's snapshot, and
`benchFitMember` 0 -> 2. The room's chain-priced sheet walks the same labour chain a fit
now costs points in, so the day-1 buyout of `lot-1-local-yard-0` is struck at 44,364 ->
43,704, a 660-yen fall. The script's other two money events are unmoved to the yen (the
express `stock-block` at 28,160, its resale at 7,680), so cash runs 660 richer from day 1
onward: 235,156 -> 235,816 on days 1 to 4, 215,156 -> 215,816 on days 5 to 9 (one 20,000
rent), 195,156 -> 195,816 on day 10. Re-running with `benchFitMember` back at 0 and the two
keys re-added reproduces all ten previous hashes and the old day-7 cash of 215,156 exactly,
which again proves the removed classifieds step drew no RNG here.

| Pin | Was | Now |
| --- | --- | --- |
| `advanceDay.test.ts` 30-day career | `31707bd5` | `f1441261` |
| `advanceDay.test.ts` acquisition career | `bd89d46a` | `4f33444b` |
| `careerReplay.test.ts` day 1 to 10 | `94fd8cfb` `8ff7c4c3` `16108814` `05780a49` `1778178a` `880e798f` `607dbd1a` `e943f905` `52808717` `746a821f` | `35a5a263` `263c821b` `f42cc0cb` `ccabc953` `6f360ace` `929854c9` `e01f5555` `c67b53bb` `2e3da848` `b2cff21a` |
| `smoke.script.json` day-1 hash | `94fd8cfb` | `35a5a263` |
| `smoke.script.json` day-7 `cashAtMost` | 215,156 | 215,816 |
| `smoke.script.json` day-10 hash | `746a821f` | `b2cff21a` |

The `careerReplay` test named for a machine hire preceding gated removal work was GREEN
throughout and needed no change: hiring the engine line before pulling `engineAssembly`
still spends strictly less labour than not hiring, and two hiring recordings still reproduce
the same spend. That relative behaviour never broke.

### Other stale assertions found and corrected (directive 17 case (a) in every case)

- `packages/sim/tests/actionPoints.test.ts` and `packages/content/tests/schemas.test.ts`
  both pin the whole `energy.actionPoints` map with `benchFitMember: 0`. Updated to 2, and
  the `actionPoints` test's name corrected (it said "every other action is free").
- `packages/sim/tests/bodyCarrierIdentity.test.ts`, "the chassis stiffening kits price
  against the body line": asserted a hand install at `machinelessLaborMultiplier` x labour.
  `chassis` is a `surface` slot, so the dropped install gate makes it base labour at every
  tool state. Rewritten to assert 2 points rather than 6, and the describe renamed to what
  it now covers.
- `packages/sim/tests/storyMissionProbes.test.ts`, the Sprint 85 coherence block: two tests
  called the deleted `machineAssistFeeYen`. Re-expressed against `accessRoute`, which is the
  live mechanic: `make-it-pull`'s buried `camsTiming` work now costs ONE engine day-hire
  (15,000) rather than two per-op fees, a strictly weaker budget claim that still holds; and
  the eight other authored aftermarket slots are asserted to read route `open` with
  multiplier 1 rather than fee 0. A third test compared `signatureOpFeeYen` against
  `machineShopAssist.feeYenByGroup` while the function had been re-pointed at `toolHire`;
  the reference table was corrected (it failed on suspension, 7,500 against 5,000).
- `packages/game/src/save/saveCodec.test.ts`: three tests round-tripped `machineListing`
  through the codec, including a legacy pre-v27 decode. Deleted with the field (directive 19
  bans legacy-compat coverage outright).
- `packages/sim/tests/financeLedger.test.ts` read the engine hire fee off
  `machineShopAssist` while asserting `resolveHireToolLine`'s booking. It passed only
  because both tables carry 15,000 for engine. Re-pointed at `toolHire`.

Two of these were RED at HEAD, before this sprint touched anything, and are recorded here
because this task fixed them rather than because it caused them: `saveCodec.test.ts` pinned
`SAVE_VERSION` at 76 in five places against a shipped 77 (sprint 225 bumped without
re-pinning), and `packages/content/tests/gameState.test.ts`'s hand-built fixture never
gained sprint 225's `benchParts` and `lift`, so the parse filled them in and the
round-trip failed. The five pins now read 78 and the fixture carries both fields.

### Evidence

Each command run once.

```text
$ pnpm typecheck
Scope: 3 of 4 workspace projects
packages/content typecheck$ tsc --noEmit
packages/content typecheck: Done
packages/sim typecheck$ tsc --noEmit
packages/sim typecheck: Done
packages/game typecheck$ vue-tsc --noEmit
packages/game typecheck: Done
```

```text
$ pnpm test --project sim
 Test Files  118 passed (118)
      Tests  3031 passed | 1 skipped (3032)
   Duration  136.67s
```

```text
$ pnpm test --project game
 Test Files  91 passed (91)
      Tests  1329 passed (1329)
   Duration  59.76s
```

```text
$ pnpm test --project content
 Test Files  32 passed (32)
      Tests  649 passed (649)
   Duration  11.08s
```

One test file, `packages/sim/tests/financeLedger.test.ts`, was corrected after that sim run
and re-run on its own rather than re-running the whole project for a one-line reference fix:
`pnpm test packages/sim/tests/financeLedger.test.ts` - 1 file, 18 tests, all passing.

`pnpm typecheck` was mandatory here, not optional: this sprint retired schema fields
(`machineListing`, `nextMachineListingDay`) and renamed an exported symbol
(`resolveHireMachineLine` -> `resolveHireToolLine`), which is exactly the directive 20
carve-out. The pre-push hook remains the full gate and was not pre-empted; no lint, format
or coverage run was made by hand.

### Deviations from the doc, with reasons

1. The doc's task 7 lists the test files to touch and does not name
   `storyMissionProbes.test.ts`, `actionPoints.test.ts`, `schemas.test.ts`,
   `bodyCarrierIdentity.test.ts`, `financeLedger.test.ts` or `saveCodec.test.ts`. All six
   assert the mechanics task 2, task 4 and task 5 deliberately changed, so they were
   corrected under directive 17 case (a) rather than left red. Each is itemised above with
   what moved and why.
2. `resolveHireLift` posts no day-log entry, where `resolveHireDyno` (the resolver the doc
   says it mirrors) emits `dyno-hired` and books it through `bookCashMovements`. See the
   open item below: this is recorded as a defect, not accepted as a design choice.
3. The three machine notes the doc lists separately (`removeMachineNoteFor`,
   `installMachineNoteFor`, `repairMachineNoteFor`) landed as one shared
   `slogAccessNoteFor` behind the three named getters, since all three now answer the same
   `accessRoute` question with the same locked copy. The getters keep their names for
   their callers.

### Closed after the Exit

**`resolveHireLift` took cash off the till without booking it. Fixed.** It deducted
`lift.hireFeeYen` (5,000) and stamped `lift.hirePaidDay` but returned an empty log, so
`cashMovementFor` never saw the spend and `financeLedger` never recorded it: a week that hired
the lift was 5,000 short per hire day. It did not fail then because the reconciliation ran a
passive career that never hires, and because no screen called `hireLift()`. The missing piece
was one `DayLogEntry` kind, added now rather than deferred to 228, on the dyno's shape:

- `gameState.ts` gains `lift-hired` (`priceYen`), and `cashLedger.ts` classifies it to
  `running` alongside `machine-hired` and `dyno-hired`. `resolveHireLift` emits it and books
  through `bookCashMovements`, exactly as `resolveHireDyno` does.
- `resolveBuyLift` was checked for the same defect and did NOT have it: it already emitted
  `equipment-purchased` (`equipmentId: 'lift'`) and booked to `investment`. It keeps that
  entry rather than gaining a `lift-bought` twin, since one kind already books and renders the
  purchase correctly.
- `dayLogFormat.ts` gains the hire's locked line, "Hired the two-post lift for the day
  ({fee})"; the purchase already read "Bought the two-post lift ({price})".
- `gameStore.ts`'s `hireLift()` now quotes its session-event fee through
  `loggedYen(result.log, 'lift-hired')` like `hireMachineLine` does, rather than
  re-deriving the charge beside the resolver.
- `financeLedger.test.ts` gains the hire booked to running and off every car, the purchase
  booked to investment, and a three-week career that hires the lift in week 1 and buys it in
  week 2 with the "money in less everything out equals the week it moved" identity holding
  each week.

**The retired `machineGateConversion.test.ts` was re-read against its replacement.** Of its
four cases, two are carried (the ungated-removal case is `accessRoute.test.ts`'s non-buried
removal; the machine-gate sweep is obsolete, since removal and install no longer read
`machineGate` at all and the bench-fit half it still covers is asserted in
`assemblies.test.ts` and the tyre cases). The `machineLaborMultiplier` unit case is obsolete
as written (it reads `machineShopAssist.machinelessLaborMultiplier`, which is no longer the
table the function reads) and the live function is asserted through its consumers until it
dies in 231. The fourth, the whole-car strip-and-rebuild labour budget, tested behaviour that
still exists and was genuinely uncovered, so it is carried into `accessRoute.test.ts`
re-expressed against `accessRoute`: by hand the teardown is 74 points (inside one 80-point
pool) and the whole job 230 (under four pools); with every rig owned it is 134, so the rigs
buy back 96 points, more than a full day. The old "hire buys back at least half" claim no
longer holds and was not carried: the multiplier now applies to buried slots only, where it
used to apply to every `machineGate` entry including the dropped install gates.

### Open

Nothing.
