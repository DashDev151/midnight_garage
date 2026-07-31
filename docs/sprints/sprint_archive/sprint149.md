# Sprint 149: the week has a shape

**Status: BUILT AND COMMITTED 2026-07-31 (`c17be49`). CLOSED OUT BY SPRINT 150.** Seventh of the
sale value arc. The outstanding per-tier auction cadence recorded below was built in
`sprint150.md`: `calendar.auctionDayOfWeek` is retired into the retired-identifier ledger,
cadence lives on `economy.auction.cadenceByTier`, and the day-1 tutorial bug is closed by
construction (`local-yard` sits on day 1). The "OUTSTANDING" section at the top of the Exit is
kept verbatim as the record of what was ruled and when; read it as history, not as open work.

Design of record: `docs/design/systems/sale-value-system.md` §7.2.

## The defect

**Every day is the same day.** The game has a day counter and nothing else. There is no Tuesday,
no month, no payday. Three separate places independently decide what a week is:

- `packages/sim/src/advanceDay.ts:400` - `if (next.day % 7 === 0)`
- `packages/sim/src/finances.ts:13` - `if (state.day % 7 !== 0)`
- `packages/sim/src/marketHeat.ts:75` - `if (state.day % 7 !== 0)`

Three copies of one rule, in three modules, none of them naming it. That is a DRY defect on its
own terms, and it is also the reason nothing can be scheduled: there is no shared vocabulary to
schedule against. The fixer's monthly appetite, the container's monthly departure and the
rotating auction catalogue are all blocked on a primitive that does not exist.

And there is a design cost, not just an engineering one. **A flat week has no texture.** Every
day offers the same actions, so a day is a resource to spend rather than a place in a rhythm,
and "what shall I do today" never has a wrong answer for reasons of timing.

## There is already a `calendar.ts`, and it is not a calendar

**Read this before touching anything.** `packages/sim/src/calendar.ts` exists, is tracked, and
has four exports. Three of them are reputation mechanics: `reputationAtLeast`,
`deriveReputationTier`, `applyReputationDelta`. Only `currentGameYear` is calendrical, and it
derives the year from the reputation tier rather than from elapsed time.

So the module is misnamed today, and R1 in `sale-value-implementation-plan.md` has already
settled that the campaign year moves off reputation and onto elapsed time through a
`campaignYearCurve`. When that lands, `currentGameYear` stops reading reputation entirely and
this file becomes a genuine calendar with three reputation functions stranded inside it.

**This sprint makes the name true, first, before adding anything to it:**

- **`packages/sim/src/reputation.ts`** takes `reputationAtLeast`, `deriveReputationTier` and
  `applyReputationDelta`. Move them, do not re-export them from `calendar.ts` (guard G1: delete,
  never deprecate, so the compiler finds every caller).
- **`packages/sim/src/calendar.ts`** keeps `currentGameYear` and becomes what this sprint needs.

It is a 70-line file and four symbols, and `pnpm typecheck` is whole-program, so this costs
minutes and it is the difference between a calendar module and a drawer.

## The fix

**One calendar module, then hang the rhythm off it.**

`calendar.ts`, once emptied of reputation, owns every derivation from `state.day` and nothing
else derives them:

- the day of the week
- whether today is the start or end of a week
- the month index and whether today crosses a month boundary

Then the week gets its landmarks:

- **Auction day**, so the catalogue is a thing you wait for rather than a screen you open.
- **The weekend meet**, which already exists as a channel with a `oneDrawNextEndDay` flag and a
  `weekendMeetPending` toggle. It gets a real day instead of an arithmetic accident.
- **Wages on payday**, separated from rent so the two bills do not land as one undifferentiated
  weekly subtraction.
- **The month boundary**, which is the primitive later sprints need and which this sprint
  establishes without yet putting anything on it beyond what already exists.

## Reuse analysis (directive 16)

### Genuinely new

- **The day-of-week and month derivations**, added to `calendar.ts` once it has been emptied of
  reputation. Pure functions of `state.day`, no state of their own.
- **A `calendar` content block** naming which day of the week each landmark falls on.
- **A month boundary**, which the game has never had.

### Existing mechanisms reused

- **`calendar.ts` itself.** It exists; this sprint gives it its real job rather than standing up
  a second time module beside it. `currentGameYear` stays exactly as it is (R1 changes what it
  reads, in a later sprint, and this sprint must not pre-empt that).
- **`packages/sim/src/reputation.ts` as the new home for the three moved functions.** If a
  reputation module already exists by the time this runs, move them there rather than creating a
  second one. Check before creating.
- **The three `% 7` sites**, which are replaced by calls, not supplemented by them. This sprint
  removes as much code as it adds.
- **`weekendMeetPending` and `oneDrawNextEndDay`**, which are the meet's mechanism already. The
  sprint changes WHEN the flag is set, never what it does.
- **`finances.ts`'s weekly charge**, which becomes a payday charge and a rent charge on their
  own named days rather than one `% 7` branch.
- **`marketHeat.ts`'s weekly drift**, which keeps its cadence and loses its private copy of the
  week rule.
- **The day log**, which already carries `rent-paid`; wages get the same treatment rather than a
  new reporting channel.
- **The seeded PRNG and `advanceDay`'s existing ordering**, untouched. Nothing here is random.

### Must NOT be built

- **A date type, a real 1995 calendar, or leap years.** The game counts days from day one. The
  month is `floor((day - 1) / daysPerMonth)`, a game month, not a Gregorian one. Anything more
  is a trap that buys nothing.
- **The fixer, the container, or a rotating catalogue.** Those are Sprints 150 and later. This
  sprint builds the primitive they need and stops. Establishing the month boundary is in scope;
  putting a monthly event on it is not.
- **Any change to how many days an action takes.** Labour, repair and travel timings are
  untouched.
- **A second week length.** `daysPerWeek` is 7 and lives in content once.

## The one thing to get right

**`calendar.ts` must be the only place `state.day` is turned into a week or a month.** A guard
test asserts that no file under `packages/*/src` outside `calendar.ts` contains `day % 7` or an
equivalent, using the same grep mechanism Sprint 143's ledger and duplicate-formula guards
already use. Without that, the fourth copy appears within two sprints and the sprint has bought
nothing permanent.

## Levers

**Signed under the standing lever grant recorded as R3 in
`docs/design/systems/sale-value-implementation-plan.md`, provisional until the maintainer
ratifies it.** A new `economy.calendar` block. These are scheduling positions, not economic values: no yen figure changes in this
sprint, and the weekly totals charged are identical to today's.

| lever | value | note |
| --- | ---: | --- |
| `calendar.daysPerWeek` | **7** | replaces three literals |
| `calendar.daysPerMonth` | **28** | four clean weeks, so a month boundary is always also a week boundary |
| `calendar.auctionDayOfWeek` | **3** | midweek, so a won car has the rest of the week to be worked on |
| `calendar.meetDayOfWeek` | **7** | the weekend, which is what the channel is called |
| `calendar.paydayOfWeek` | **5** | Friday, per the design |
| `calendar.rentDayOfWeek` | **7** | the maintainer ruled 2026-07-31 that charging rent before a new player has done anything is wrong; day 7 restores the pre-sprint behaviour exactly (see "AMENDED" below) |

Rent and wages both fall inside every seven-day span exactly once, so **the amount charged per
week does not change**; only which day it lands on does. Say so in the Exit, because a reviewer
seeing a golden hash move will want to know the total did not.

## Task breakdown

0. **Split `calendar.ts` first.** Move `reputationAtLeast`, `deriveReputationTier` and
   `applyReputationDelta` to `reputation.ts`, with no re-exports left behind. Run `pnpm
   typecheck` immediately after; it is whole-program and will name every caller. Do this as its
   own step before writing a line of the calendar itself, so a compile error is unambiguously
   about the move.
1. **The calendar derivations** in `calendar.ts`, plus its content block and Zod entries
   (`.strict()`, guard G5).
2. **Replace all three `% 7` sites** with calendar calls. Delete the literals.
3. **The guard test** pinning `calendar.ts` as the only deriver.
4. **Split rent and wages onto their named days** in `finances.ts`, with a `wages-paid` day-log
   entry beside the existing `rent-paid`. If wages are currently folded into another line, give
   them their own; the morning report should be able to say what each cost.
5. **Auction day.** The auction catalogue is available on `auctionDayOfWeek`. If the auction
   screen is currently always open, gate it and say so in the UI in plain words rather than
   disabling a button with no explanation.
6. **The meet gets its real day**, replacing whatever arithmetic currently sets
   `weekendMeetPending`.
7. **The month boundary**, exposed from `calendar.ts` and covered by tests, with nothing hung on
   it yet.
8. **The morning report and any day-facing UI** name the day of the week. This is the cheapest
   part of the sprint and the part the player actually feels.
9. **Tests and re-derivation.**

## Tests

- Day 1 is week 1 day 1 and month 1; day 28 is the last day of month 1; day 29 opens month 2.
- Each landmark fires exactly once per seven-day span, over a 100-day run.
- Total rent plus wages charged over any 28-day span equals the pre-sprint total. **Assert this
  explicitly**: it is what proves the sprint changed rhythm and not cost.
- The guard test fails when a `day % 7` is planted outside `calendar.ts`.
- Market-heat drift still happens exactly weekly.

## Re-derivation

The golden state hashes in `advanceDay.test.ts` will move, because charges land on different
days even though the weekly totals do not. Re-derive, re-run once to confirm determinism, and
record old and new in the Exit.

Run `pnpm typecheck` before reporting, per the directive 20 carve-out: this sprint retires
literals and adds exported symbols.

## Exit

**Landed as designed, with one outstanding conflict flagged for the maintainer rather than fixed
unilaterally (see below).**

### OUTSTANDING: the auction cadence is decided and NOT built

**This sprint shipped `calendar.auctionDayOfWeek: 3`, a single global auction day. The maintainer
has since ruled a different design, and it is not in this sprint.** Recorded here so nobody reads
the shipped lever as the intended one.

The ruling, given 2026-07-31 and approved as stated: **auction cadence is a property of the
VENUE, not one global day**, because a single weekly day makes the late game wait around, which
is backwards; the player who has earned access should get more to do, not less.

| auction tier | open on | cadence |
| --- | --- | --- |
| `local-yard` | days 1, 3, 5, 7 | every week |
| `regional` | days 2, 4 | every week |
| `premium` | day 6 | every week |
| `collector-network` | days 6 and 7 | every second week, fresh lots each day |

Two rulings ride with it: **the day-6 overlap between `premium` and `collector-network` on
alternate weeks is deliberate, keep it**, and **attending an auction does not cost the day, so a
player may attend more than one room on the same day.** The maintainer noted the cadence may
still have too few overlaps and that more than one room per day is desirable, but ruled it stays
as tabled for now.

**Why it is not in this sprint.** The ruling arrived after this sprint's implementation was
already running, and it is a schema change (per-tier cadence replacing one global day), not a
lever value. `calendar.auctionDayOfWeek` is therefore **shipped-but-superseded** and must be
retired by whichever sprint builds the per-tier cadence, into the retired-identifier ledger, in
the same change.

**A known bug ships with it until then:** day 1 is not `auctionDayOfWeek` 3, so a brand-new
player is sent by the tutorial to an auction house showing a closed sign, and waits two days
before the game's core activity is available. **The per-tier cadence fixes this by construction**
(`local-yard` opens on day 1), which is the main reason it should be built next rather than
later. Also recorded in `TODO.md`.

### AMENDED 2026-07-31: `calendar.rentDayOfWeek` corrected from 1 to 7

**MAINTAINER RULING, explicit and signed: "rent starts on day 7. like current."** This sprint
shipped `rentDayOfWeek: 1` (Monday, "the start of the week, so a new week opens with its fixed
cost visible" - the rationale the Levers table originally gave). Reviewing
`sale-value-arc-lever-ledger.md`, the maintainer rejected it: at day 1, a brand-new player's very
first End Day took 20,000 off their 300,000 starting cash before they had bought, fixed or sold
anything. Day 7 restores the pre-sprint `day % 7 === 0` cadence exactly, and is now the only
value the calendar has ever shipped with in practice.

This is the only lever that moved; `paydayOfWeek`, `meetDayOfWeek`, `auctionDayOfWeek`,
`daysPerWeek` and `daysPerMonth` are untouched, and no yen value in `economy.rent` moved either.
Rent day 7 now coincides with meet day 7 - ruled fine and expected, since one is a charge and the
other is a selling-channel draw; not "fixed."

Both `advanceDay.test.ts` golden-master hashes moved back to exactly their pre-sprint values
(job-loop `db7f2695` -> `8cf486eb`; acquisition-to-sale `0d29ca19` -> `634d4493`), confirming the
correction restores the prior state bit for bit, not merely the rent day. Its "rent is charged
again" count reverted from 5 to 4 (the 30-day script's rent days move from 1/8/15/22/29 back to
7/14/21/28). `finances.test.ts`'s 28-day total-unchanged tests passed untouched throughout, proving
the weekly total was never at risk. The economy approval-gate hash was re-pinned in the same
change, under this explicit ruling rather than the R3 standing grant (R3 expired once the
maintainer reviewed the ledger). Full detail and the re-derivation record: the re-pin comment in
`packages/content/tests/economyApprovalGate.test.ts`.

**Task 0, run first as its own step.** `reputationAtLeast`, `deriveReputationTier` and
`applyReputationDelta` moved from `calendar.ts` to a new `packages/sim/src/reputation.ts` (none
existed beforehand - checked first, per the instruction), no re-exports left behind.
`pnpm typecheck` immediately after named **13 errors across 7 files**: `TS2305` "has no exported
member" at `packages/sim/src/bots/cautiousRestorer.ts:12` (`reputationAtLeast`),
`facilities.ts:9` (`reputationAtLeast`), `missions.ts:8` (`applyReputationDelta`),
`selling.ts:17` (`applyReputationDelta`), `serviceJobs.ts:22` (both, one line), `toolLines.ts:9`
(`reputationAtLeast`), and `packages/sim/tests/calendar.test.ts:9,11,12` (all three). The
remaining 3 of the 13 (`selling.ts:836-838`, `TS7006` implicit-any) were not separate callers:
they were the SAME broken `applyReputationDelta` import cascading into an inferred `any` for
`resolveSellViaWalkIn`'s `released` state, confirmed by disappearing the moment the import was
fixed. All 7 files' imports repointed at `./reputation` (or `../reputation` for the one file
under `bots/`); `index.ts` gained `export * from './reputation'` beside its existing
`calendar.ts` line. `currentGameYear` stayed in `calendar.ts` untouched, still reading
reputation tier, exactly as instructed (R1 changes what it reads later, not this sprint).
`calendar.test.ts` was itself split the same way its source was: reputation describe blocks moved
verbatim to a new `packages/sim/tests/reputation.test.ts`, `calendar.test.ts` kept only
`currentGameYear` (then gained the new calendar-derivation tests below) - the doc's own checklist
names "the calendar/reputation tests" as two things to run, so the test split matches the source
split rather than leaving a `calendar.test.ts` that imports from two modules.

**The calendar itself (`calendar.ts`), built only after task 0's typecheck came back clean.**
Ten new exports, every one a pure function of `(day: number, economy: EconomyConfig)`, matching
`deriveReputationTier`'s own existing parameter shape rather than threading a new `CalendarConfig`
type everywhere: `dayOfWeek` (1-indexed position in the week), `dayOfWeekName` (display only,
falls back to `` `day ${n}` `` if `daysPerWeek` ever outgrows the named list), `isStartOfWeek`,
`isEndOfWeek` (the exact days the retired `day % 7 === 0` fired on, kept for the two cadences this
sprint does not move to a named landmark), `isAuctionDay`, `isMeetDay`, `isPayday`, `isRentDay`
(the four named landmarks), `monthIndex` (`floor((day - 1) / daysPerMonth) + 1`) and
`isMonthBoundary` (true on the first day of a new month: 1, 29, 57, ...). Weekday names are
Monday..Sunday, ISO-ordered, inferred from the lever table's own prose (`auctionDayOfWeek: 3`
"midweek" = Wednesday, `meetDayOfWeek: 7` "the weekend" = Sunday, `paydayOfWeek: 5` "Friday",
`rentDayOfWeek: 1` "the start of the week" = Monday) since the doc names the positions but not
the words - a judgement call, flagged.

**The `economy.calendar` content block**, `.strict()` per guard G5, with a refine pinning every
`*DayOfWeek` lever into `[1, daysPerWeek]`. All six lever values landed exactly as signed in the
doc's table (`daysPerWeek` 7, `daysPerMonth` 28, `auctionDayOfWeek` 3, `meetDayOfWeek` 7,
`paydayOfWeek` 5, `rentDayOfWeek` 1).

**The three `% 7` sites, replaced and the literals deleted, not supplemented:**

- `advanceDay.ts`'s staff-ad refresh (was `next.day % 7 === 0`) now calls `isEndOfWeek(next.day,
  context.economy)` - unmoved cadence (still days 7/14/21/..., a generic weekly cadence the doc
  does not assign a named landmark, so it stays where it was).
- `marketHeat.ts`'s weekly drift (was `state.day % 7 !== 0`) now calls `!isEndOfWeek(state.day,
  context.economy)` - unmoved cadence, same reasoning.
- `finances.ts`'s single combined rent+wages check split into two independent `if`s:
  `isRentDay(state.day, economy)` and `isPayday(state.day, economy)`, each pushing its own log
  entries and only returning a non-empty `log`/mutated `cashYen` when at least one fired.
  `WeeklyFinancesResult.log`'s type was narrowed from the full `DayLogEntry` union to a new
  exported `WeeklyFinanceLogEntry = Extract<DayLogEntry, { type: 'rent-paid' | 'wage-paid' }>`
  (this resolver never produces any other kind) - a clarity improvement the doc didn't ask for but
  the compiler did: a test summing `entry.amountYen` across the log needs the narrower type to
  typecheck without a runtime guard.

`selling.ts`'s `weekendMeet` guaranteed draw now waits for `calendar.isMeetDay`, not "whichever day
happens to be the next End Day after listing": `drawOfferForChannel` and `drawDailyOffers` both
gained a required `day` parameter (the day about to begin, `next.day + 1` at the
`advanceDay.ts` call site - the same convention every other day-boundary generator in that file
already uses), and the `oneDrawNextEndDay` branch now refuses (`attempted: false`, pending flag
left `true`) unless `isMeetDay(day, economy)` is also true. A car listed on a non-meet day simply
waits; the flag is spent, hit or miss, only on the day it actually resolves.

**The guard test**, `packages/content/tests/calendarOwnershipGuard.test.ts`, built from
`retiredIdentifiers.test.ts`'s own file-collection shape (same `SKIP_DIRS`, same colocated-test
exclusion by filename) rather than inventing a second scanner. Bans three regexes outside
`calendar.ts` (matched by basename, the same idiom `duplicateFormulaBan.test.ts` uses for its one
exempt file): the literal `% 7` defect itself, and two "lazy equivalent" patterns
(`% economy.calendar.daysPerWeek`, `% economy.calendar.daysPerMonth`) that would read the
calendar's own constants but still do the modulo locally instead of calling a calendar function -
the ownership this guard protects, not just the magic number. Confirmed by grep before writing it
that the real `% 7` occurrences in `packages/*/src` were exactly the three now-fixed sites, so the
guard's own doc-comment mentions of the retired pattern (`economy.ts`, `calendar.ts`) had to be
reworded off the literal substring `% 7` to avoid tripping on their own prose - the same
word-boundary-vs-prose tension `retiredIdentifiers.test.ts`'s ledger already documents, resolved
the same way (reword the comment, don't loosen the guard).

**Auction day (task 5).** `AuctionScreen.vue`'s entire catalogue - the yard-visit panel, the
capacity-cascade warnings, every tier group and its lots - now renders behind `game.isAuctionDay`
(a new store computed reading `isAuctionDay(gameState.day, context.economy)`); off that day the
screen shows one plain-word message ("The auction house only opens its doors on Wednesday. Come
back then.") naming the real day via `dayOfWeekName`, styled muted like the existing
`.empty`/`.locked-tier` treatment rather than as an error. This is the literal reading of "the
catalogue is a thing you wait for rather than a screen you open," not a narrower reading that
gates only the buy buttons - see the flagged conflict below for the cost of that choice.

**The month boundary (task 7).** `monthIndex`/`isMonthBoundary` exist, are tested, and nothing
reads them yet, exactly as scoped ("establishing the month boundary is in scope; putting a monthly
event on it is not").

**Day-facing UI (task 8).** `DayCashBox.vue` (the always-mounted top-right box) now reads "Day N -
Weekday"; `DayReport.vue`'s three heading variants now read "Day N (Weekday)" for the day the
report is about - deliberately the ENDED day (`report.day`), not `game.day` (already the new day
by the time the modal shows), so `DayReport.vue` imports `dayOfWeekName` directly from
`@midnight-garage/sim` rather than reading the store's `dayOfWeekLabel` (which is always "today").

**Judgement calls not fully dictated by the doc, flagged for review:**

1. **The weekday-name mapping** (Monday=1..Sunday=7) is inferred from the lever table's prose,
   not stated as a literal list anywhere in the doc. Any future re-signing of the four
   `*DayOfWeek` values should keep this mapping in mind if the prose ("midweek", "the weekend",
   "Friday", "the start of the week") is meant to keep matching the number.
2. **Which `day` value each landmark reads.** `finances.ts`, `marketHeat.ts` and
   `advanceDay.ts`'s staff-ad refresh all check `state.day`/`next.day` (the day currently being
   closed, un-incremented) - the same value the OLD `% 7` checks read, so this preserves exact
   prior semantics for the two cadences that didn't move and is the natural reading for "which
   day is a bill due." `selling.ts`'s meet-day gate and the UI-facing `isAuctionDay`/
   `dayOfWeekLabel` computeds instead read the "day about to begin" (`next.day + 1`) or the LIVE
   current day the player is looking at, respectively, matching each site's own pre-existing
   convention rather than forcing one convention everywhere. Not stated explicitly in the sprint
   doc; decided by matching each call site's existing idiom.
3. **AuctionScreen.test.ts's day-1 test was rewritten, not just re-pinned** (directive 17 case
   (a)): "renders lots already on day 1... with no empty first week" asserted behaviour the
   sprint intentionally supersedes. Split into two tests - the closed message shows on day 1 (not
   the auction day), and the original assertion now runs after `warpToCatalog` (extended to also
   wait for `game.isAuctionDay`, not just non-empty lots) lands on the real auction day. Six other
   tests that mounted the screen without warping first (the capacity-cascade pair, the
   locked-tier-copy pair, and the local-yard-is-never-locked test) gained a `warpToCatalog(game)`
   call for the same reason.
4. **`advanceDay.test.ts`'s "rent is charged again, every 7 days" test's own count changed from 4
   to 5, and its title changed too** (case (a) again, but worth stating why the NUMBER moved and
   not just the day): its 30-day script is not a clean multiple of `calendar.daysPerWeek`, so
   which day of the week `rentDayOfWeek` lands on genuinely changes how many times rent fires
   inside a fixed 30-day window (days 1/8/15/22/29 = five, where the old day-7-anchored cadence
   gave four in the same window). This is NOT a violation of "the weekly total is unchanged" -
   that guarantee only holds over spans that are themselves a multiple of `daysPerWeek` (28, not
   30) - `finances.test.ts`'s own dedicated test is what actually proves the total, not this
   script.
5. **UNRESOLVED, flagged rather than fixed: the tutorial's "find" step assumes the Auctions tab
   is always open.** `tutorialSteps.json`'s `find` step (`anchorScreen: "auctions"`,
   `anchorTestId: "inspect-visit-local-yard"`) fires immediately after accepting Yuki's mission,
   which happens on day 1 of every new career; day 1 is not `auctionDayOfWeek` (3), so a fresh
   player now sees the closed message instead of the scripted tutorial lot and is stuck for up to
   two days. No existing test caught this (nothing exercises the tutorial step's timing against a
   live day count) and this sprint intentionally did not invent a fix: exempting the tutorial from
   the gate is a new mechanism outside this sprint's reuse analysis, and moving `auctionDayOfWeek`
   is a lever-value change directive 22 reserves for the maintainer by name. Recorded in
   `TODO.md` under Open engineering, needs a decision before the next auction-adjacent sprint.

**Re-derived pins, old -> new, re-run for determinism where hashed:**

- `economyApprovalGate.test.ts`'s `economy.json` hash:
  `c314c4a3978b91020b171e96fd1fdeeeb96a579cfa5087c64a7a901fde637958` ->
  **`e6ca43bcc9ffbfee538b84507be7988ae71ddfa2f3a76ab77c5a05ff32ab26b8`**. Re-pinned in the same
  change, citing the lever grant as R3 in `docs/design/systems/sale-value-implementation-plan.md`
  per this sprint's own wording rule. `partPricing.json`'s hash and every mission payout/budget
  cap are untouched (confirmed passing unchanged) - none of those pipelines reads the calendar
  block.
- `schemas.test.ts`'s `economy.json` top-level anchor list: `calendar` added.
- `advanceDay.test.ts`'s job-loop golden master: `8cf486eb` -> **`db7f2695`**. Moves because rent
  now lands on day 1/8/15/22/29 instead of 7/14/21/28 within the script's 30-day run (five charges
  instead of four - see judgement call 4 above) and wages (none in this script - `staff: []`)
  would have moved to a different day too had any existed.
- `advanceDay.test.ts`'s acquisition-to-sale golden master: `634d4493` -> **`0d29ca19`**. Moves
  for the same rent-timing reason. Both hashes re-run twice to confirm determinism before pinning.
- `advanceDay.test.ts`'s "rent is charged again" cash assertion: `rentChargeCount` 4 -> **5**
  (judgement call 4 above; not a hash, a re-derived count).
- No `SAVE_VERSION` bump: this sprint reshapes no `GameState` field and adds none, per directive
  19's "say so and move on" - nothing to say, because nothing needed protecting.

**The 28-day honesty test, passing with real figures.** `finances.test.ts`'s new describe block
sums every `rent-paid`/`wage-paid` `amountYen` returned by `applyWeeklyRentAndWages` across days
1-28 and again across a span that does NOT start on day 1 (days 53-80), against one staff member
(`weeklyWageYen` 45,000) and the opening bay counts (rent 20,000/week). Both spans total exactly
**260,000** (`4 x (20,000 + 45,000)`), matching what the old single 7-day-boundary charge would
have summed to over any 28-day span - proving the sprint moved rhythm, not cost.

**Checks, run in the specified order (directive 20 - none re-run beyond what confirming
determinism required):**

1. `pnpm typecheck` immediately after task 0's move - **13 errors named across 7 files** (see
   above), all fixed before writing a line of calendar logic.
2. `pnpm typecheck` at the end - all three packages clean (content, sim, game/`vue-tsc`).
3. `pnpm test --project content` - **540 passed (25 files)**, after fixing the two expected
   directive-22/bible-audit failures (the approval-gate hash, the top-level anchor list).
4. `pnpm test --project game` - **834 passed (62 files)**.
5. Named sim files only: `calendar.test.ts` + `reputation.test.ts` + `finances.test.ts` +
   `marketHeat.test.ts` + `selling.test.ts` + `advanceDay.test.ts` together - **128 passed (6
   files)**; `advanceDay.test.ts` alone re-run twice more after re-pinning its two golden hashes
   to confirm stability (**15 passed** both times).

**A failing test, and which case it was (directive 17).** Every test failure this sprint hit was
case (a) - the implementation intentionally changed what's correct, and the test was updated to
assert the new correct behaviour, never loosened: `finances.test.ts`'s day-7/day-14 rent/wage
tests (rent and wages now land on separate named days, not a shared boundary),
`AuctionScreen.test.ts`'s day-1 catalogue test and the six tests that needed `warpToCatalog`
extended to also wait for the auction day, `advanceDay.test.ts`'s two golden hashes and its
"rent is charged again" count, and `packages/content/tests/schemas.test.ts`/
`economyApprovalGate.test.ts`'s approval-gate pins (directive 22's own re-pin-on-approved-change
path, not a regression).

**Nothing left outstanding from the task breakdown except item 5 above (the tutorial conflict,
deliberately unresolved and flagged, not silently patched or silently ignored).**
