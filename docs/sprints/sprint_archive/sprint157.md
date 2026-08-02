# Sprint 157: what the week cost

**Status: BUILT and committed** (`ada1da4`, 2026-08-01). Design of record:
`docs/design/systems/financial-summary.md`.

## The defect

**Three cash movements are invisible to every surface in the game.** The auction attendance fee
(`bidding.ts`), the listing fee (`selling.ts`) and body-pipeline materials (`stagedWork.ts`) all
emit `log: []`. A fourth, `part-reconditioned`, logs without its amount. **Money leaves the till
and nothing anywhere records it.**

**And running costs have nowhere to be seen.** The maintainer's ruling:

> Machine-shop hire is NOT a per car fee. you could hire in the engine crane and remove 4 engines
> that day. not accurate to include it as a per car fee. same with rent and bays and staff costs.
> these are running costs. They accrue and should be shown on a overarching, maybe weekly,
> financial summary, but they are not attributed to a specific car. listing fees are however.

`CarLedger` handles per-car costs. Nothing handles the rest.

## Why it cannot be a view over the day log

Four independent reasons, all verified:

1. **The day log is not persisted.** It is a session-scoped Vue ref, zeroed on `hydrate`, and
   autosave writes only `gameState`. Close the tab and the week's history is gone.
2. **No entry carries the day it happened.** A flat session array cannot be bucketed into weeks.
3. **Four cash movements never log their amount**, so a log-derived total would be wrong by exactly
   the listing fees Sprint 150 just fixed on the per-car side.
4. **`lastDayReport.entries` is not the day's log anyway.** `endDay` calls `advanceDay` with empty
   actions, so it holds only the overnight tick; the player's own purchases, sales and repairs
   never reach it, and `cashDeltaYen` is the overnight delta. It already needed a hand-rolled patch
   to reinstate machine hire.

**Point 4 is its own defect and worth fixing regardless of the summary.** The end-of-day report a
player reads omits most of what they did that day.

## The fix

**A small persisted accumulator, and a screen that is a pure derivation over it.**

One additive `GameState` field keyed by `weekIndex`, holding the split below, **bumped at the same
charge sites that already bump `CarLedger`** (the reuse rule Sprint 150 set for listing fees: the
update goes at the existing charge site, never a new one). `SAVE_VERSION` bump, no migration, per
directive 19.

### The classification

The law is already written into `CarLedgerSchema`'s doc comment and must be honoured:

| bucket | contains |
| --- | --- |
| **income** | sales, service-job payouts, mission payouts, part sales, scrap |
| **on cars** | purchase price |
| **stock** | parts bought but not yet fitted |
| **running** | rent, wages, machine-shop hire, auction attendance, inspection travel, staff intro |
| **investment** | bays, tools, equipment |

**`stock` exists because cash leaves at purchase but `CarLedger.partsYen` only bumps at fitting.**
Calling a purchase a car cost lies about which car; deferring it breaks the week's arithmetic.

**`investment` is separate from `running`** because a ¥2m bay in the same line as ¥8k of rent
destroys the figure the maintainer asked for.

### The identity that makes it honest

    income - (onCars + stock + running + investment) == the week's cash movement

**This is the definition of done.** It makes completeness a test rather than a claim, exactly as
the worked example's reconciliation does.

## Also fix, because they are the same defect

**Give the four silent movements their log entries with their amounts.** Attendance fee, listing
fee, pipeline materials, and `part-reconditioned`'s missing yen. Three cash movements being
invisible to every surface is a bug independent of this sprint.

## The screen

The art bible's control vocabulary names a **carbon-paper invoice or clipboard** for documents and
ledgers, and bans generic modals. Note `DayReport.vue` is currently a generic modal and is
therefore **existing debt, not a precedent to copy**.

Hard constraints, all from progression bible Law 4:

- **Must not auto-open.** Auto-opening makes it push, not pull.
- **Must not render on a gameplay screen.**
- **Must not follow the player around**, which rules out extending `DayCashBox.vue`.
- **No percentages.** Real yen against real named periods.

**It needs a bible amendment**, approved by the maintainer: Law 4 grants exactly one pull-not-push
screen exception and `StandingScreen.vue` is it. This is the second. **Record the amendment in
`progression-bible.md`'s amendment log**, citing the maintainer's approval, with the reasoning that
the amendment's own justification is *"a shop owner CAN keep a ledger of their own record"* and a
weekly cost sheet is a more literal 1995 artefact than a reputation bar.

## Ruled

- **Weekly, not monthly.** A week holds exactly one rent and one payday, `daysPerMonth` is 28 so a
  month is four clean weeks, and monthly-first would delay the first sheet to day 28.
- **The double-parking fine is a running cost.** It is charged for a named car and its log entry
  carries the car id, but it prices a bay shortage rather than that car.

## Reuse analysis (directive 16)

### Genuinely new

- One `GameState` accumulator keyed by week.
- The sheet screen.
- Four log entries that should always have existed.

### Existing mechanisms reused

- **`calendar.ts`'s `weekIndex`, `isEndOfWeek`, `monthIndex`, `isMonthBoundary`.** `isMonthBoundary`
  is explicitly an unused hook waiting for a consumer.
- **`classifyDayReport`**, which already splits money three ways and already routes `machine-hired`
  to bills as a running cost. It is incomplete: `bay-purchased`, `tool-upgraded`,
  `inspection-visit`, `staff-hired`, `part-bought`, `part-ordered`, `mission-delivered` and
  `equipment-purchased` all fall through to a prose branch.
- **`marketLedger`**, the working precedent for a persisted accumulator bumped at charge sites.
- **`StandingScreen.vue`**, the precedent for a pure-derivation pull-not-push screen with no local
  state.
- **`CarLedger`'s charge sites**, where the accumulator is bumped.

### Must NOT be built

- **A second classification of costs.** The law is written in `CarLedgerSchema`'s doc comment and
  restated in `classifyDayReport` and `workedExample.ts`. **Three copies already exist: share one
  rather than adding a fourth.**
- **Anything that auto-opens or notifies.**
- **A fix to `lastDayReport` being the overnight tick.** Record it; it is its own change.

## Tests

- **The reconciliation identity**, per week, to the yen.
- Machine-shop hire, rent, wages and bays land in running or investment, never on a car.
- Listing fees land on the car, never in running.
- The four previously-silent movements now log their amounts.
- The sheet is a pure derivation: no state of its own.
- Reloading preserves the week's figures.

## Re-derivation

`SAVE_VERSION` and its canaries, the economy approval hash if content changes, both `advanceDay`
goldens, the worked example.

Run `pnpm typecheck`. Run content, sim AND game.

## Exit

**Status: READY FOR REVIEW.** Not committed.

### The reconciliation identity holds, to the yen

    income - (onCars + stock + running + investment) == the week's cash movement

Asserted per week over the scripted two-car career (`packages/sim/tests/financeLedger.test.ts`),
against `state.cashYen` read at each week's edges and never against another total. The career's
weeks all balance exactly, and the sum of every week's net plus the starting cash equals the closing
cash the sim reports. A second assertion rebuilds the same figures from the document's own named
cash lines and requires them to equal the accumulator bucket for bucket, so the sheet and the worked
example are the same reading of the same career.

The proof is not circular. `Run.step` in `workedExample.ts` already threw on any step whose named
lines did not equal the real cash delta; it now names them from `cashMovementFor` alone, with the
three hand-quoted `extra` workarounds deleted. That the run still passes is the evidence that every
yen the sim moves now has a log entry to explain it.

### The four movements that left no record

| Movement | Before | Now |
| --- | --- | --- |
| Auction admission (`bidding.ts`) | `log: []` | `auction-attended` { tier, feeYen } |
| Listing fee (`selling.ts`) | `log: []` | `car-listed` { carInstanceId, channelId, feeYen } |
| Body-pipeline materials (`stagedWork.ts`) | `log: []` | `body-materials-bought` { carInstanceId, zoneId, stage, costYen } |
| Bench recondition (`jobs.ts`) | `part-reconditioned`, band only | `job-created` { kind: `recondition-part`, costYen } at the charge site |

**The fourth is not what the sprint text asked for, and deliberately so.** The brief said to give
`part-reconditioned` its amount. `part-reconditioned` fires at COMPLETION; the money leaves at
CREATION, which can be days earlier. Putting the amount on the completion entry would have dated the
charge to the wrong day and, on a recondition that spans a week boundary, to the wrong week - the
one thing this sprint exists to get right. So the charge is logged where it happens, through the
`job-created` entry an on-car repair already uses (directive 16: the mechanism exists, reuse it).
`resolveReconditionLabor` had been creating a job and taking cash without ever emitting
`job-created`; that was the actual defect. `part-reconditioned` keeps its band and gains nothing, so
no second place prices the same fact.

`job-created`'s `costYen` is now also RENDERED ("Job started (repair-zone) on car-1 for ¥8,000"), so
an on-car repair charge is legible too; it was in the entry but never on screen.

### Authored values and their reasoning (R4)

**No economy lever moved.** `economy.json` is untouched, no payout, budget, price or formula
changed, and `economyApprovalGate.test.ts` passes unmodified. This sprint is reporting only. The
values below are structural decisions, not tunables.

| Decision | Value | Reasoning |
| --- | --- | --- |
| Accumulator period | week (`weekIndex`) | A week holds exactly one rent charge and one payday. `daysPerMonth` is 28, so a month is four clean weeks and monthly comes free from four rows; the reverse does not hold, and monthly-first would delay the first sheet to day 28. As designed. |
| Ledger key type | `Record<string, FinanceWeek>` | Matches `marketLedger`/`carLedgers`. JSON-safe, sparse: a week with no money in it has no row. About fifteen rows of five integers over a 100-day career. |
| Field optionality | `.optional()`, not `.default({})` | The genuinely-optional-key pattern `attendanceFeePaidDayByTier`, `venueNameByTier`, `assemblyInventory` and `uiSettings` already use, and for its stated reason: no existing `GameState` literal needs touching, so twenty unrelated test fixtures stay as they are. `createInitialGameState` seeds `{}` explicitly; readers treat absent as an empty sheet. A deviation from the design doc's `.default({})`, recorded here. |
| Buckets | income / onCars / stock / running / investment | The design's own table, unchanged. |
| Double-parking fine | `running` | The design's open ruling, taken as recommended. It names a car but prices a bay shortage: park a different car in the overflow slot and the same fine falls. |
| Bench recondition | `stock` | It is spend on a loose part on the shelf, not on any car. It reaches a car's ledger later, through the part's `pricePaidYen`, if and when it is fitted. |
| `equipment-purchased` | `investment` | The action is retired but the entry decodes from old logs; classifying it costs nothing and leaves no hole. |
| Route and nav | `/costs`, nav entry "Costs" | Its own route beside `/standing`, per Law 4. Reached only from the header nav. |
| Screen name | "What the week cost" | Says what it is. No jargon, no metaphor. |
| `SAVE_VERSION` | 52 to 53 | Additive field. No migration, no golden save (directive 19). Six canaries re-derived. |

### Where the money is posted

`bookCashMovements(state, log, economy)` (`sim/financeLedger.ts`) folds a log through
`cashMovementFor` and bumps `weekIndex(state.day)`'s row. **The rule it enforces, written into its
doc comment: every resolver books exactly the entries it CONSTRUCTS, and a caller that forwards a
nested log books nothing.** That is what keeps `advanceDay` from double-counting the same
`resolveSellViaWalkIn` or `resolveServiceJob` a player's click also drives. Seventeen sites book:
`finances`, `facilities` (x2), `advanceDay` (contract income, and the bot job-creation loop),
`bidding` (x2), `parts` (x4), `selling` (x3), `serviceJobs`, `missions`, `staff`, `toolLines`,
`jobs` (x3), `stagedWork`, `diagnosis`.

`applyBayPurchase`/`applyBayPurchases` gained an `economy` parameter; every other charge site
already had one.

### The classification is shared, not copied

`cashMovementFor` (`content/cashLedger.ts`) is the one enumeration of the law stated in
`CarLedgerSchema`'s doc comment, exhaustive over the whole `DayLogEntry` union so a new entry type
is a compile error rather than a yen that quietly falls out of the arithmetic. Three copies
collapsed onto it:

- `classifyDayReport` (`dayLogFormat.ts`) now sums buckets instead of hand-mapping types. Its
  `default` fall-through is gone: `bay-purchased`, `tool-upgraded`, `equipment-purchased`,
  `inspection-visit`, `staff-hired`, `part-bought`, `part-ordered` and `mission-delivered` all
  counted towards nothing before and count now.
- `cashLinesFromLog` (`workedExample.ts`) takes bucket and amount from the shared function and keeps
  only its own display `category` and label. `CashLine` gained `bucket`.
- `CarLedgerSchema`'s doc comment points at it rather than restating it.

### The screen, as built

`CostSheetScreen.vue` at `/costs`: a stack of carbon copies on a clipboard, one sheet per week,
newest clipped on top, ruled lines under six rows of yen. Drawn entirely from existing tokens, no
assets. The week in progress is marked "still running" and its net reads "So far", never a result.
Pure renderer over `game.costSheetView`, which is a pure derivation over `financeLedger` - no state,
no local refs, no writes. `CostSheetScreen.test.ts` guards each Law 4 clause, including that
mounting it leaves `gameState` byte-identical and that no `%` reaches the page.

### Checks

    pnpm typecheck                content, sim, game - Done
    pnpm test --project content   Test Files  26 passed (26)   Tests  569 passed (569)
    pnpm test --project sim       Test Files  77 passed (77)   Tests  2038 passed (2038)
    pnpm test --project game      Test Files  63 passed (63)   Tests  847 passed (847)

Run once each, per directive 20. No bot careers were run (directive 21): the reconciliation is
arithmetic over one scripted, hand-written career, the same footing `workedExample.ts` already
stands on.

### Re-derived pins

| Pin | Old | New |
| --- | --- | --- |
| `SAVE_VERSION` (+ 6 canaries in `saveCodec.test.ts`) | 52 | 53 |
| `advanceDay` golden, 30-day career | `90b8b963` | `f419f088` |
| `advanceDay` golden, acquisition to sale | `5f377288` | `964ca42d` |
| `worked-example-two-cars.md` | - | regenerated (`WORKED_EXAMPLE_WRITE=1`) |

Both goldens moved for the same reason and it is a shape change, not a behavioural one: `GameState`
carries a new field and `hashState` serialises the whole thing. No cash figure, rng draw or derived
stat moved. Unlike a `CarLedger`, `financeLedger` survives the sale, so the acquisition-to-sale
golden moved too - a sold car's week still has to add up.

The economy approval hash is UNCHANGED: no content value moved.

### Scope fences held

- `lastDayReport` being the overnight tick is untouched and recorded in `TODO.md` as its own change,
  with the fix named (a session-scoped per-day log the store appends to, not a change to
  `advanceDay`'s contract).
- Generation, channels and `expectationByTier` untouched.

### Bible amendment

Law 4's THIRD amendment recorded in `progression-bible.md` (2026-08-01, maintainer-approved), with
the reasoning the sprint specified: the amendment's own justification is that a shop owner can keep
a ledger of their own record, and a weekly cost sheet is a more literal 1995 artefact than a
reputation bar. `financial-summary.md` moves to BUILT and both its open rulings are recorded as
made.

### Tasks

- [x] `FinanceWeekSchema` + `GameState.financeLedger`, and three new `DayLogEntry` types.
- [x] `cashMovementFor` in content: one enumeration of the law, exhaustive over the union.
- [x] `bookCashMovements` in sim, called at all seventeen charge sites.
- [x] The four silent movements log their amounts, on the day the money leaves.
- [x] `classifyDayReport` rebuilt on the shared table, `default` fall-through closed.
- [x] `workedExample.ts` rebuilt on it too, all three `extra` workarounds deleted.
- [x] `CostSheetScreen.vue`, its route, and its nav entry.
- [x] Reconciliation identity asserted per week, to the yen.
- [x] Law 4 amendment recorded.
- [x] `SAVE_VERSION` and both goldens re-derived.
