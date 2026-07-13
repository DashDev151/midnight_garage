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

(filled at completion)
