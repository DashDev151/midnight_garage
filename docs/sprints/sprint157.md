# Sprint 157: what the week cost

**Status: READY TO IMPLEMENT.** Design of record: `docs/design/systems/financial-summary.md`.

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

_To be completed on implementation._
