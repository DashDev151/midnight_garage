# Sprint 149: the week has a shape

**Status: READY TO IMPLEMENT. Seventh of the sale value arc. Depends on Sprint 148.**

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
| `calendar.rentDayOfWeek` | **1** | the start of the week, so a new week opens with its fixed cost visible |

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

_To be completed on implementation._
