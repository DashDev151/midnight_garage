# Sprint 42 - The flip ledger: per-car money in, projected money out

**Source:** `docs/playtest-notes-2026-07-13.md` item 7, maintainer decision 2 (no sale-price
control - the ledger IS the feedback mechanism). Goal: every owned car shows what you paid, what
you have sunk into it, what it is worth now, and the projected profit - live, so the
buy-repair-upgrade-sell loop is visible and visceral.

## Reuse analysis (directive 16)

**New mechanisms:**

- `carLedgers` on GameState (per-owned-car spend record) + `pricePaidYen` on PartInstance.
- The financial panel on CarDetailScreen; a realized-profit line at sale.

**Existing mechanisms that MUST be reused:**

- Valuation: `anchorValueYen` + `carCostToMintYen` are ALREADY computed for auction lots
  (`gameStore.lotDetail`, `gameStore.ts:824-850`) - the owned-car panel exposes the same two
  numbers through `carDetail`; zero new valuation math. `estimatedSaleValue` stays the
  buyer-facing ballpark it already is.
- Money events already happen in exactly the right resolvers with the right amounts in scope:
  auction win (`resolveLotForDay`, `bidding.ts:493-502`, `lot.car.id` + `currentBidYen` both in
  hand), buyout (`resolveBuyoutInstant`), repair charges (`chargeRepairWork` callers - the
  car-scoped path already knows `carInstanceId`; Sprint 40 sanctioned the `'job-created'` costYen
  field), part purchase (`resolveBuyPart` logs `priceYen` already), install
  (`applyJobToCar`'s install branch), sale (`resolveSellViaWalkIn` logs `car-sold` with
  `carInstanceId` + `priceYen`). The ledger is bookkeeping bolted onto existing events - no new
  flows.
- Save law machinery: Dexie version bump + migration + golden-save test, the same pattern as every
  schema change since Sprint 07.
- DayReport already renders sale lines - the profit figure extends an existing entry, not a new
  report system.

## Decisions

1. **State shape.** `GameState.carLedgers: Record<carInstanceId, CarLedger>` with
   `CarLedger = { purchaseYen: number | null, repairYen: number, partsYen: number }`
   (Zod, default `{}`). `purchaseYen: null` means unknown (pre-migration cars, dev grants).
   `PartInstance.pricePaidYen: number optional` - what this instance actually cost, set at
   purchase, incremented by bench-recondition charges (a reconditioned part "cost" its buy price
   plus the work).
2. **Wiring (all in existing resolvers, sim-side):**
   - Auction win / buyout: create the car's ledger with `purchaseYen` = hammer/buyout price.
   - Car-scoped repair job creation (the `chargeRepairWork` path with a `carInstanceId`):
     `repairYen += totalCostYen` (consumables included - it is money spent on this car).
   - Bench recondition (car-less): `pricePaidYen += totalCostYen` on the loose instance.
   - `resolveBuyPart`: set `pricePaidYen` (express at charge; standard orders at their locked order
     price on delivery).
   - Install (`applyJobToCar` install branch): `partsYen += pricePaidYen ?? 0` on the target car's
     ledger. Customer cars (service jobs) get NO ledger - not owned. Removing a part does NOT
     refund the ledger (spend is spend; the pulled instance keeps its own `pricePaidYen`).
   - Sale (`resolveSellViaWalkIn`): extend the `'car-sold'` log entry with optional
     `profitYen` = price minus (purchase + repairs + parts) when the ledger is known; delete the
     ledger entry. Scrap-sale/departure paths likewise clean up their ledger entry.
3. **Save law.** `SAVE_VERSION` 24 -> 25. Additive (`carLedgers` default `{}`, `pricePaidYen`
   absent = unknown); no data migration needed beyond defaults, but the golden-save test for v24
   -> v25 lands in the same PR per the law. Existing careers simply show "unknown" purchase on
   already-owned cars.
4. **UI.** CarDetailScreen financial panel (above the sell section): Purchase (or "-" when
   unknown), Repairs, Parts, Total spent; Guide value (the same `anchorValueYen` the auction house
   uses) and Restoration bill remaining; Projected profit = guide value minus total spent, colored
   by sign. Reactive - confirming staged work or installing a part updates it immediately (that is
   the visceral loop the maintainer asked for). DayReport's sale line gains "profit Y..." when
   `profitYen` is present. No sale-price control anywhere (maintainer decision 2).
5. **Behavior neutrality.** The ledger must not change a single economic outcome - it only records.
   Golden hashes will move (GameState shape changed) - re-pin only after verifying day-by-day cash
   is byte-identical pre/post change on the fixed-seed careers (the Sprint 38 verification
   pattern). Bots and harness untouched.

## Tasks

1. Content: `CarLedgerSchema` + `carLedgers` on GameState, `pricePaidYen` on PartInstance,
   `'car-sold'` profitYen extension; schema tests.
2. Sim: resolver wiring per decision 2; unit tests per event (win, buyout, repair, recondition,
   buy, install, sale, removal non-refund, customer-car exclusion).
3. Game: saveCodec v25 + golden-save test; financial panel + DayReport profit line + tests.
4. Verification: full gate; cash-neutrality check vs pre-sprint fixed-seed careers, then re-pin
   hashes; harness sanity run. Update this doc's Exit.

## Definition of done

- Buy a car at auction, repair it, install a part, sell it: every step visibly moves the panel,
  and the sale reports realized profit consistent with the panel's numbers.
- Ledger records exist only for owned cars; unknown-purchase cars degrade gracefully.
- v24 saves load cleanly with empty ledgers (golden test).
- Zero economic behavior change (verified, not asserted); full gate + harness invariants green.

## Exit

### Files touched

Content:
- `packages/content/src/gameState.ts` - `CarLedgerSchema` (`purchaseYen: number | null`, `repairYen`/`partsYen` default 0); `GameState.carLedgers: Record<string, CarLedger>` default `{}`; `'car-sold'` DayLogEntry gained optional `profitYen`.
- `packages/content/src/part.ts` - `PartInstanceSchema` gained optional `pricePaidYen`.
- `packages/content/tests/gameState.test.ts` - `CarLedgerSchema` tests (required-but-nullable `purchaseYen`, defaults); a `carLedgers`-default test off a pre-v25-shaped fixture; `'car-sold'` `profitYen` round-trip; `PartInstance.pricePaidYen` round-trip; existing fixtures updated to carry the new fields.

Sim:
- `packages/sim/src/carLedger.ts` (new) - `carLedgerFor` (unknown-purchase default when no entry exists), `setCarLedger`, `updateCarLedger`, `deleteCarLedger`. One small module, reused by every resolver below instead of five ad hoc read/write sites.
- `packages/sim/src/index.ts` - exports it.
- `packages/sim/src/bidding.ts` - `carGuideValueYen(car, model, state, context)`: `anchorValueYen`'s own math generalized to any car+model pair (not just a lot's `.car`/`.modelId`); `anchorValueYen` itself is now a thin wrapper over it (pure refactor, proven identical by a direct equivalence test). `resolveLotForDay` (player win) and `resolveBuyoutInstant` both call `setCarLedger` with `{ purchaseYen: <hammer/buyout price>, repairYen: 0, partsYen: 0 }` on a successful handover.
- `packages/sim/src/jobs.ts` - `chargeRepairWork` now returns `totalCostYen` alongside the charged state. `repairJobGate` folds that charge into `repairYen` via `updateCarLedger`, gated on the car actually being in `state.ownedCars` (a customer service-job car still gets charged for real, just never ledgered). `completeJob`'s owned-car branch, on a completed `install-part` job, adds the installed instance's `pricePaidYen ?? 0` to `partsYen`. `resolveReconditionLabor` adds its charge to the loose instance's own `pricePaidYen` instead of any ledger (no car in play).
- `packages/sim/src/parts.ts` - `resolveBuyPart`'s express branch sets `pricePaidYen` to the surcharged charge; `resolvePartDeliveries` sets it to the order's own locked `priceYen` (not the day-of sticker price).
- `packages/sim/src/selling.ts` - `resolveSellViaWalkIn` computes `profitYen = priceYen - (purchaseYen + repairYen + partsYen)` when `purchaseYen` is known, logs it on the `'car-sold'` entry, and deletes the ledger entry via `deleteCarLedger` regardless (nothing to reconcile after a sale either way).
- `packages/sim/src/newGame.ts` - `createInitialGameState` seeds `carLedgers: {}`.
- 13 sim test fixture files (`advanceDay.test.ts`, `auctions.test.ts`, `bidding.test.ts`, `bots/investor.test.ts`, `buyoutHelpers.test.ts`, `calendar.test.ts`, `finances.test.ts`, `jobs.test.ts`, `laborSlots.test.ts`, `marketHeat.test.ts`, `parts.test.ts`, `selling.test.ts`, `stagedWork.test.ts`, `valueModelProbes.test.ts`) - mechanical `carLedgers: {}` added to every hand-built `GameState` literal (the class of fixture-completeness fix every prior GameState-shape sprint has needed).
- `packages/sim/tests/carLedger.test.ts` (new) - unit tests for the helper module itself.
- `packages/sim/tests/jobs.test.ts`, `bidding.test.ts`, `parts.test.ts`, `selling.test.ts` - dedicated Sprint 42 tests per event: auction win/buyout ledger creation (and no-op on a forfeited win), `carGuideValueYen`/`anchorValueYen` equivalence, repair-job-creation `repairYen` accrual (and accumulation across two jobs) gated to owned cars only (a customer car is charged but not ledgered), install-completion `partsYen` accrual (priced part, unpriced part, and the customer-car exclusion), bench-recondition `pricePaidYen` accrual (fresh and cumulative), removal-never-refunds (ledger untouched, pulled instance keeps its own `pricePaidYen`), buy-part `pricePaidYen` (express and standard-delivery), and sale `profitYen` (known purchase, unknown purchase via a missing entry, explicit `purchaseYen: null`, a negative/loss profit, and ledger cleanup).

Game:
- `packages/game/src/stores/gameStore.ts` - `CarDetail` gained `ledger: CarLedger` (via `carLedgerFor`, always populated - the unknown-purchase default for a car with no entry) and `guideValueYen: number` (via `carGuideValueYen`, zero new valuation math); `carDetail()` populates both.
- `packages/game/src/screens/CarDetailScreen.vue` - a `Finances` panel (`data-test="finance-panel"`) above the Sell section, owned-cars only (`v-if="!detail.serviceJob"`, mirroring the Sell section's own gate): Purchase (or "-"), Repairs, Parts, Total spent, Guide value, Restoration bill remaining (reused `totalBillYen`), and Projected profit (guide value minus total spent, colored green/red by sign). No sale-price control anywhere (maintainer decision 2, unchanged).
- `packages/game/src/screens/CarDetailScreen.test.ts` - financial-panel tests: full field readout after a real buyout, "-" purchase on a dev-granted (unknown-purchase) car, live update after a staged-and-confirmed repair, and non-rendering for a customer service-job car.
- `packages/game/src/utils/dayLogFormat.ts` - `describeLogEntry`'s `'car-sold'` case inserts `, profit +/-Y...` (via `formatYenDelta`) ahead of the existing quality/reputation clause, when `profitYen` is present; absent otherwise.
- `packages/game/src/utils/dayLogFormat.test.ts` - profit-present (gain and loss), profit-absent, and profit-alongside-a-quality-clause tests.
- `packages/game/src/components/DayReport.test.ts` - a direct-state test proving `DayReport.vue` renders the profit clause (it is a pure passthrough to `describeLogEntry`, no template logic of its own to test beyond that).
- `packages/game/src/screens/GarageScreen.test.ts` - an end-to-end test: buyout -> set for sale -> real offer -> accept -> the recent-activity log (the actual reachable UI surface for a walk-in sale; `DayReport`'s own End Day modal only ever shows day-boundary events, never a player-instant sale - see the deviations note below) shows "Sold ... profit ...".
- `packages/game/src/save/saveCodec.ts` - `SAVE_VERSION` 24 -> 25, additive, no `MIGRATIONS[24]` entry (doc-commented).
- `packages/game/src/save/saveCodec.test.ts` - a real pre-v25 (v24 envelope, no `carLedgers` field) save decodes with empty ledgers; a v25 state with real `carLedgers`/`pricePaidYen` round-trips exactly; a car ledger with `purchaseYen: null` round-trips as `null`, not 0; 3 stray `SAVE_VERSION` canary assertions elsewhere in the file bumped 24 -> 25 (the same class of fixup Sprint 38 needed for its own 2 canaries).

### Verification (real output)

`pnpm typecheck` - clean (content, sim, game all `Done`).
`pnpm lint` - clean, exit 0.
`pnpm format` - clean after `pnpm format:fix` (Prettier reformatted the files this sprint touched).
`pnpm test:coverage` - **890/890 passed, 74/74 files** (up from 846/846 pre-sprint); thresholds cleared (gate: statements 80/branches 65/functions 78/lines 82):
  - Statements 90.78% (3755/4136), Branches 80.37% (2077/2584), Functions 91.51% (841/919), Lines 94.69% (3300/3485).
`pnpm build` - clean, `vite build` succeeds (975 modules transformed).

### Cash-neutrality proof (Sprint 38 verification pattern)

The ledger is bookkeeping bolted onto existing resolvers - the DoD requires proving it changes zero economic outcomes, not just asserting it. Two independent probes, each run once against this working tree (post-Sprint-42) and once against a `git worktree` checked out at HEAD (`f550909`, pre-Sprint-42, the exact prior commit), diffed:

1. **A comprehensive fixed-seed career** (temporary `_cashNeutralityProbe.test.ts`, deleted after verification) exercising every resolver the ledger touches in one run: wait for a local-yard lot, win it over-market (auction win), repair its body group across several days (repair-job creation charge), buy one part express and one standard (purchase charges + delivery), remove a part and install the express one (install completion), wait out the standard delivery, then sell (profit computation). The day-by-day trace (`cashYen`, `ownedCarCount`, `partInventoryCount`, `jobCount`, `reputationPoints` after every single `advanceDay` call) plus a standalone bench-recondition cash-delta check were dumped to JSON and diffed: **byte-identical, `diff` exit 0**.
2. **The exact two golden-master careers** `advanceDay.test.ts` pins by hash (temporary `_goldenCareerCashProbe.test.ts`, deleted after verification) - `initialState`/`scriptedActionsForDay`/`runCareer` (the 30-day scripted career) and `acquisitionCareer` (auction win -> sell), duplicated verbatim from that file, day-by-day `cashYen`/`ownedCarCount`/`partInventoryCount` traces dumped and diffed instead of hashed: **byte-identical, `diff` exit 0**.

Both probes prove the identical claim two different ways (a broad synthetic scenario, and the literal careers being re-pinned) before either golden hash was touched.

### Golden hash re-pins

`GameState`'s SHAPE changed (`carLedgers` added) so both hashes in `packages/sim/tests/advanceDay.test.ts` moved; the cash-neutrality proof above confirms the drift is shape-only, not a cash-flow or sequence change:
- `a scripted 30-day career reproduces an exact state hash`: `ad88a86b` -> `37b5ace7`.
- `reproduces an exact state hash (deterministic acquisition->sale)`: `7317802d` -> `13501bbf`.

### Balance harness (`pnpm balance:run` + `python -m balance.cli check`)

All hard-gated invariants PASS, and every disclosed figure is **identical to Sprint 41's own recorded numbers** (not just "within noise" - the bot population never reads `carLedgers`/`pricePaidYen`/`profitYen` anywhere, so this is the expected, confirmed-not-assumed result at the full 9,000-career harness scale, not just the two hand-scripted golden careers above):
- Days-to-`local` (competent-policy probe): p50 in [10, 35] -> **p50=13.0 days** (883/1000 seeds), unchanged.
- Buyout share of acquisitions < 30% -> **0.0%** (49,570 total acquisitions), unchanged.
- Passive Grinder solvency: day100 median cash Y1,220,000, unchanged.
- Flipper-vs-Passive separation: flipper Y319,648 vs passive Y1,220,000 (diff Y900,352), unchanged.
- Sanity floor: passive Y1,220,000, flipper Y319,648, restorer Y78,453, balanced Y414,014, random Y175,954 - all unchanged.
- Auction win-price tails: steal 19.6%, mid 48.3%, frenzy 32.1% - unchanged.
- Days-to-tier: `local` p10/p50/p90 = 10/13/27 (883/1000); `known` 27/37/54 (818/1000); `respected` 57/64/80 (795/1000) - all unchanged.

No behavior leak detected anywhere; nothing re-based.

### Deviations from the spec / notable calls

- **"DayReport sale line" is, in practice, the recent-activity log (`GarageScreen.vue`), not the End Day modal.** `DayReport.vue` (the End Day overlay) only ever renders the day-boundary `advanceDay` log (rent, wages, market-heat drift, catalog refresh, service-job deadline backstop) - `game.lastDayReport` is overwritten fresh by each `endDay()` call from that call's own result log alone. A walk-in sale resolves instantly via `acceptOffer` (a player click, any time before End Day), which only pushes onto the session-wide `dayLog` (rendered by `GarageScreen.vue`'s "recent activity" feed), never into `lastDayReport`. Both consumers share the exact same `describeLogEntry` formatter, so the profit-line change (`dayLogFormat.ts`) reaches both automatically with one edit - satisfying the spec's actual intent (the sale's profit is visible in the game's log copy) even though the literal component that renders it, for a real player-driven sale, is `GarageScreen.vue`, not `DayReport.vue`. `DayReport.vue` itself is still covered directly (a state-injection test proving it renders the profit clause whenever an entry like it ever does land in `lastDayReport`).
- `carGuideValueYen` reads `state.marketHeat[model.id]` where `anchorValueYen` read `state.marketHeat[lot.modelId]` - provably identical in every real call, since `model` is always resolved via `context.modelsById[lot.modelId]` and `modelsById` is indexed by each model's own `.id` (so `model.id === lot.modelId` whenever `model` is found at all). Covered by the direct equivalence test in `bidding.test.ts`.
- Ledger creation on auction win/buyout unconditionally overwrites (`setCarLedger`, not `updateCarLedger`) rather than folding onto any prior entry - correct by construction, since a freshly-generated `carInstanceId` can never already have one.
- Install completion always upserts a ledger entry for an owned car (even a zero `partsYen` when the part carries no `pricePaidYen`), rather than skipping when the amount is 0 - matches the decision text literally ("`partsYen += pricePaidYen ?? 0`... on the target car's ledger") and is behaviorally inert either way (an all-zero/unknown-purchase entry renders identically to no entry at all in the panel).

### Needs maintainer attention (playtest/tuning, not a defect)

None. The ledger is pure bookkeeping, proven zero-impact by the cash-neutrality probes and the identical balance-harness numbers above; the financial panel is a straightforward reuse of already-computed values (`anchorValueYen`/`totalBillYen`). Nothing here requires a tuning pass.
