# The weekly cost sheet: what running the shop costs

**Status: BUILT (Sprint 157). Both open rulings were made; see the bottom of this document.**

## The ruling this implements

Maintainer, 2026-07-31:

> Machine-shop hire is NOT a per car fee. you could hire in the engine crane and remove 4 engines
> that day. not accurate to include it as a per car fee. same with rent and bays and staff costs.
> These are running costs. They accrue and should be shown on a overarching, maybe weekly,
> financial summary, but they are not attributed to a specific car. listing fees are however.

## What is wrong

**1. Running costs are invisible in aggregate.** Rent, wages, machine hire, auction admission and
inspection fees all leave the till, and there is no surface anywhere that adds them up. The player
can see what one car cost (the flip ledger) and what today cost (the morning report), and nothing
in between. The business itself is not reported.

**2. Four cash movements leave no record at all.** The auction attendance fee
(`bidding.ts:309-312`), the listing fee (`selling.ts:410-419`) and body-pipeline materials
(`stagedWork.ts:168-177`) all subtract cash and return `log: []`. A fourth, `part-reconditioned`
(`gameState.ts:747-751`), logs the band it reached but not what it cost. **Money leaves the till
and nothing tells the player.**

**3. The classification law is written down three times and implemented nowhere shared.**
`CarLedgerSchema` states it (`gameState.ts:46-53`), `workedExample.ts`'s `CashScope` restates it
(`workedExample.ts:96-100`), and `dayLogFormat.ts:309-311` restates it again for machine hire.
Three prose copies, three separate hand-maintained mappings.

**4. `classifyDayReport` is incomplete.** It already carries the right taxonomy as `earnedYen` /
`onCarsYen` / `billsYen`, and already routes `machine-hired` to bills as a running cost. But
`bay-purchased`, `tool-upgraded`, `equipment-purchased`, `inspection-visit`, `staff-hired`,
`part-bought`, `part-ordered` and `mission-delivered` all fall through its `default` branch into
prose and count towards nothing.

**5. Nothing accumulates yen.** `GameState` holds no running total of anything, and `carLedgers`
are deleted when a car leaves (`carLedger.ts:49-54`). Career spend cannot be reconstructed after
the fact from anything the game keeps.

---

## The fix

**One small persisted accumulator, keyed by week, and a screen that is a pure derivation over it.**

    financeLedger: Record<weekNumber, {
      incomeYen, onCarsYen, stockYen, runningYen, investmentYen
    }>

Additive field on `GameState`, defaulting to `{}`, in the shape `marketLedger` and `carLedgers`
already use. A 100-day career holds about fifteen rows of five integers.

### Why persisted, and not derived from the day log

The day log cannot be the source, for four independent reasons.

- It is a session-scoped Vue ref (`gameStore.ts:1005`) that autosave never writes, so a summary
  over it would empty on reload.
- `hydrate` zeroes it (`gameStore.ts:4350`).
- **No entry carries the day it happened**, so entries cannot be bucketed into weeks.
- `lastDayReport` is not a report of the day: `endDay` calls `advanceDay` with empty actions
  (`gameStore.ts:4288`), so its entries hold only the overnight tick and the player's own instant
  actions never reach it.

### Where the money is posted

**At the charge sites that already bump `CarLedger`**, and nowhere else. That is the rule Sprint 150
set when it added `listingFeesYen`: the update goes where the money already moves, never at a new
site invented for reporting. A charge site that has no `CarLedger` bump (rent, wages, admission)
posts to the accumulator at the point it subtracts cash.

Because the accumulator is bumped at the charge site rather than read from the log, it is correct
even for the four movements that currently log nothing. Their silence is a separate defect, below.

### The classification

A cost attributes to a car when it is charged FOR that car, and accrues to the business when it is
not. That sentence is already law in `CarLedgerSchema`'s doc comment; this table is its full
enumeration.

| Movement | Bucket |
| --- | --- |
| Car sale, service-job payout, story-mission payout and tip, fleet-contract retainer, part sold, part scrapped, shell scrapped | income |
| Auction hammer price, buyout price | on cars |
| Repair charge, body-pipeline materials, listing fee | on cars |
| Repairs and parts fronted on a customer's car (`ServiceJobLedger`) | on cars |
| Part bought, part ordered, loose-part reconditioning | stock |
| Rent, staff wages, staff intro fee, machine-shop hire, auction admission, inspection travel fee | running |
| Double-parking fine | running (**ruling open**) |
| Bay purchase, tool-line upgrade, equipment purchase | investment |

**Why `stock` is its own bucket.** Cash leaves the till when a part is bought, but `CarLedger`'s
`partsYen` only bumps when it is fitted (`jobs.ts:292`, `stagedWork.ts:340`, `assemblies.ts:174`).
Calling a purchase a car cost would lie about which car; deferring it to fitting would mean the
week's figures no longer sum to the week's cash. Stock on the shelf is the honest third answer.

**Why `investment` is split from `running`.** A ¥2,000,000 bay in the same line as ¥8,000 of rent
destroys the figure the maintainer asked for. Separated, the running line answers "what does it
cost me to keep the doors open" and the investment line answers "what did I put into the shop".

**Every yen lands in exactly one bucket**, so income minus the four out-buckets equals the week's
cash movement. That identity is the design's own test.

### Weekly, and the month comes free

`daysPerMonth` is 28, four clean weeks, so weekly and monthly nest exactly and there is no partial
period to handle either way. Store by week:

- A week contains exactly one rent charge (`isRentDay`) and exactly one payday (`isPayday`), so it
  is the natural unit for the costs being reported.
- Monthly is a sum of four stored rows, available whenever it is wanted, at no storage cost.
- The reverse does not hold. Store monthly and the first sheet arrives on day 28, which is far too
  late in a career whose early weeks are the tight ones.

`weekIndex` and `monthIndex` already exist in `calendar.ts` and are the only permitted derivations
(`calendarOwnershipGuard.test.ts`). No new week arithmetic anywhere.

---

## What the screen is

**A carbon-copy cost sheet on a clipboard**, one sheet per week, older weeks behind the current
one. That is the art bible's own object for this job: *Lists / documents (jobs, ledger): clipboard,
carbon-paper invoice* (section 4.1). Figures in yen, ruled lines, nothing else.

It shows, per week: money in, on cars, stock, running the shop, shop investment, and the net. The
week in progress shows as a running total and is marked open, never presented as a result.

### Hard constraints

- **Never auto-opens.** Pull, not push. No badge, no nudge, no end-of-week interruption.
- **Never renders on a gameplay screen.** Its own route, like `/standing`.
- **Never follows the player around.** This rules out extending `DayCashBox.vue`, which is mounted
  at the app root and fixed to the viewport on every screen (`DayCashBox.vue:6-16`). That component
  is a status display and stays one.
- **No percentages.** Progression bible Law 4's "no percentage" clause survives both amendments
  literally, and `StandingScreen.test.ts` guards it. Yen only.
- **No trends, no charts, no advice.** It reports what happened. It never tells the player they are
  spending too much on anything: that would be a judgement instrument, and it would be push.
- **No per-car breakdown.** That is the flip ledger's job and duplicating it here would be a second
  place pricing the same fact.

`DayReport.vue` is currently a generic overlay (`DayReport.vue:45`), which the art bible bans
outright (section 4.3). It is existing debt, **not a precedent to copy**.

---

## What must NOT change

- **`CarLedgerSchema` and the flip ledger panel.** The summary sits beside them, not over them. Per-car
  reporting is unchanged.
- **The classification law itself.** The accumulator implements the sentence already in
  `CarLedgerSchema`'s doc comment; it does not restate it or fork it.
- **The morning report stays a day view.** It shares the taxonomy, never the aggregation.
- **No new cash movements, no new fees, no changed amounts.** This is reporting only. Directive 22
  is untouched because no lever moves.

## The separate defects, fixed separately

**1. Four silent cash movements.** Auction attendance, listing fee, body-pipeline materials, and
`part-reconditioned`'s missing amount. Worth fixing whatever happens to this summary: the player
watches cash fall with nothing to explain it. Not folded in here, because a log-entry change touches
the `DayLogEntry` union, `describeLogEntry`'s exhaustive switch, and the harness.

**2. The end-of-day report is not a report of the day.** `endDay` passes empty actions to
`advanceDay`, so instant player actions never reach `lastDayReport`, and `cashDeltaYen` is the
overnight delta only. It already needed a hand-rolled patch to reinstate machine hire
(`gameStore.ts:4291-4301`), which is the shape of a workaround, not a fix. **This is unverified in
play** and needs its own sprint.

---

## Both rulings, made

### 1. It needs a bible amendment - GRANTED

Progression bible Law 4 grants exactly one pull-not-push screen exception, and `StandingScreen.vue`
is it. A financial summary would be the second. The amendment's own justification reads:

> the player asked for a place to see their granular standing, and a shop owner CAN keep a ledger
> of their own record. It is a pull-not-push page the player chooses to open.

A weekly cost sheet is a more literal 1995 artefact than a reputation bar: shops kept them, the
Standing screen's "ledger" is a metaphor and this one is not. Law 4's litmus (*could a 1995 shop
owner perceive this signal in the real world?*) passes cleanly.

**Granted by the maintainer and recorded** as Law 4's third amendment, in
`progression-bible.md`'s amendment log (2026-08-01).

### 2. The double-parking fine - RUNNING COST

Charged for a named car, and its log entry carries `carInstanceId` (`facilities.ts`), so the
schema's own test ("charged FOR that car") reads per-car. Against that: it prices a bay shortage, not
that car. The car is the one that happened to be last through the gate; park a different car there
and the same fine falls.

**Ruled: running cost.** `cashMovementFor` books it to `running`, and it stays off the named car's
ledger exactly as it always did.

---

## What moves when this lands

| What | Where |
| --- | --- |
| `SAVE_VERSION` 52 to 53, bump only, no migration (directive 19) | `saveCodec.ts` |
| One additive `GameState` field and its default | `gameState.ts` |
| The bucket table, authored once, replacing three prose copies | `gameState.ts:46-53`, `workedExample.ts:96-112`, `dayLogFormat.ts:309-311` |
| `classifyDayReport` refactored onto the shared table, closing its `default` fall-through | `dayLogFormat.ts:253-344` |
| Posting calls at the existing charge sites | `bidding.ts`, `selling.ts`, `jobs.ts`, `stagedWork.ts`, `assemblies.ts`, `finances.ts`, `facilities.ts`, `toolLines.ts`, `diagnosis.ts`, `staff.ts` |
| `weekIndex` gains its second consumer | `calendar.ts:91` |
| New route and nav entry | router, nav |

`isMonthBoundary`'s "nothing is hung on it yet" comment stands: weekly storage does not consume it.

## Definition of done

1. A week's five figures sum to that week's cash movement, asserted as a test over a seeded career.
2. Machine hire, rent, wages, bays and staff appear on the summary and on no car's ledger.
3. Listing fees appear on the car's ledger and in the summary's on-cars line.
4. The summary survives a save/reload cycle and a car being sold and deleted.
5. `classifyDayReport` has no `default` fall-through: every `DayLogEntry` type with an amount is
   classified.
6. The screen opens only when the player opens it, renders on no gameplay screen, and contains no
   percentage.
