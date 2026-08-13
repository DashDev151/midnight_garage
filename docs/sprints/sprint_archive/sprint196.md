# Sprint 196: the auction age floor does what its name says

**Status: IMPLEMENTED, ready for review.** No lever; no content value moved.

## The defect

`AUCTION_MIN_AGE_YEARS` is 3, and its stated purpose is that a current-model-year car does not reach
a backyard auction. It does not do that.

`generatedYearRangeFor` clamps with `max(model.spec.yearFrom, min(yearTo, currentYear - 3))`, so
**`yearFrom` wins**. A car whose production window starts at or after the campaign year generates at
its own launch year, age 0, and age 0's mileage range is `[0, 3000]`. A delivery-mileage car reaches
a yard that exists to move tired metal.

The eligibility filter is `yearFrom <= currentYear`, which admits a car the year it launches.

**Measured over 80,000 generated lots**, share arriving under age 3:

| campaign year | local-yard | regional | premium | collector-network |
| --- | ---: | ---: | ---: | ---: |
| 1995 | 26.5 | 33.5 | **35.7** | 16.1 |
| 1997 | 3.1 | 10.7 | 13.2 | 5.8 |
| 1999 | 0.2 | 4.1 | 12.7 | 25.7 |
| 2001 | 0.1 | 2.2 | 9.6 | 22.4 |
| 2003 | 0.1 | 2.4 | 11.4 | **27.4** |

The low rooms clean themselves as the calendar passes 1998, because the roster's `yearFrom` clusters
around 1993 to 1995. **The top rooms get worse**: at 2003 the collector network runs **26.3 per cent
age-zero** lots, one in four a delivery-mileage car.

## The ruling

**Blanket fix**, maintainer 2026-08-08. The eligibility filter tightens from
`yearFrom <= currentYear` to `yearFrom <= currentYear - AUCTION_MIN_AGE_YEARS`, so a model is not
drawn at all until it can produce a car the floor allows.

**Measured: this takes under-age-3 to exactly 0.00 per cent in all twenty cells**, because with the
tightened filter every eligible model's `yearFrom` is at or below `currentYear - 3` and the `max` in
`generatedYearRangeFor` can no longer be won by `yearFrom`.

**The per-room alternative was considered and rejected.** Admitting near-new cars at premium and
collector only, where a consignment sale genuinely does move new metal, costs nothing at the top and
takes the bottom two rooms to zero. It was rejected because it leaves 26 to 36 per cent near-new at
the top rooms, which reads as a new-car dealer rather than an auction.

## The cost, measured, and why it is acceptable

**The tier mix a player sees does not change at all.** `rollCarTier` draws the price band from the
room's fixed weights first and only then picks a model within it, so as long as every weighted band
keeps at least one model the mix is mathematically unchanged. Confirmed across all twenty cells,
every delta inside Monte Carlo noise.

**No band anywhere empties**, so the draw cannot break. The thinnest point is the **1995 enthusiast
band falling from 11 models to 5**, which at the premium room is 55 per cent of the board drawn from
five cars.

**That cost lands where players rarely stand.** Auction rooms are mission-gated and the campaign
year advances with reputation, so a player in a premium room during a 1995 campaign is a
configuration that barely occurs: by the time premium is unlocked, the calendar has moved on.

Models dropping from the pool, by campaign year: **1995 eleven, 1997 four, 1999 four, 2001 two, 2003
two.** They return as the calendar advances, which gives the early game a progression it currently
gets for nothing: you start on older metal and the newer cars arrive as you climb.

## Reuse analysis (directive 16)

**New: nothing.** One predicate in one filter gains a term that already exists in the same file, and
which `generatedYearRangeFor` five lines away already reads.

## Tasks

1. **Tighten the eligibility filter** in `generateAuctionCatalog`.
2. **Pin the zero.** A test asserting no generated lot at any campaign year arrives under
   `AUCTION_MIN_AGE_YEARS`. That is the fact worth guarding, and it is the one this sprint creates.
3. **Re-derive whatever pins move**, from real runs, with reasons recorded (directive 17 case (a)).
   Expect golden masters to shift: the eligible pool changes, so catalogues differ from day one.
4. **Check `generatedYearRangeFor`'s `max` is now unreachable.** With the filter tightened,
   `yearFrom` can never win it. If that makes the clamp dead defensive code, say so rather than
   leaving a reader to wonder which case it guards.

## Definition of done

- No generated lot at any campaign year is younger than `AUCTION_MIN_AGE_YEARS`, pinned by a test.
- The tier mix per room is unchanged.
- No weighted band is left empty at any campaign year.
- No content value moves.
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Deliberately not here, and recorded for the maintainer

**Three roster models have `yearFrom == yearTo`, so they can never generate old**, whatever the
filter does:

- **Honda S2000 AP1, 2003 to 2003.** At the 2003 campaign it is 37 per cent of the flagship band,
  being the only `common` rarity flagship among six `rare` ones, and that single car is essentially
  the whole 26.3 per cent age-zero figure at collector-network. The real AP1 ran from 1999.
- **Honda Integra Type R DC2, 2001 to 2001, and the row is named `'99`.** A '99 car with a
  2001-only window contradicts itself and looks like an authoring error rather than a decision.
- **Subaru Impreza 22B-STi, 1998 to 1998.** Genuinely a one-year car; this one is honest.

After this sprint those models simply do not appear until three years after their window, which is
correct behaviour given the data. Whether the data is right is a roster question, and fixing the two
suspicious windows would let those cars appear earlier and older rather than not at all.

## Exit

One predicate changed, in `generateAuctionCatalog`. `Infinity - 3` is still `Infinity`, so the
unrestricted default is untouched. No content file moved.

### The zero, measured

80,000 lots through the real two-stage draw, 200 seeds by 20 lots by 4 rooms by 5 campaign years.
Share under age 3, and share at age zero:

| | local-yard | regional | premium | collector |
| --- | --- | --- | --- | --- |
| before, 1995 | 25.5 / 0.3 | 32.3 / 2.9 | 36.1 / 5.8 | 16.1 / 2.6 |
| before, 2003 | 0.1 / 0.0 | 2.5 / 1.2 | 12.4 / 9.5 | 27.6 / **26.1** |
| **after, all twenty cells** | **0.00 / 0.00** | **0.00 / 0.00** | **0.00 / 0.00** | **0.00 / 0.00** |

The before figures reproduce the pre-sprint measurement to within sampling noise, which is the check
that the probe was measuring the same thing.

### The cost, verified rather than trusted

**No weighted band emptied**, checked across all twenty cells. The new pin asserts a lot count as
well as an age, so a room that quietly stopped filling its board would fail rather than pass
vacuously.

**Tier mix unchanged, and provably so.** `rollCarTier` renormalises over the bands with a non-empty
pool; no band emptied and none was newly stocked, so that set is identical and the band draw is
distributionally the same by construction. Measured at 4,000 lots per cell, the largest
before-to-after delta was 1.68 points against a standard error of 1.11, which is noise.

Thinnest band, as predicted: **1995 enthusiast, 11 models to 5.**

### The clamp is not dead, and the code now says which callers it guards

`generatedYearRangeFor`'s `max(yearFrom, ...)` is unreachable **from an auction catalogue**, but it
stays live for three callers that generate a car without that filter: `serviceJobs.ts` (customer
cars, filtered on `yearFrom <= currentYear` with no floor), `plays.ts` (sweeps the roster at a fixed
year), and the dev bench. `devGrantCar` passes `Infinity` and takes the non-finite branch.

Kept, with its doc comment rewritten to name those callers, and `generateAuctionCatalog`'s rewritten
to state that every model its filter keeps satisfies the clamp outright. **No reader is left
wondering which case it guards.**

### Pins moved

Two golden masters, both case (a), both measured from the same seed with the predicate reverted and
restored rather than accepted on faith.

| pin | before | after |
| --- | --- | --- |
| 30-day job loop | `b656e85d` | `8e9b10d8` |
| acquisition and sale | `7118cd29` | `8689e249` |

The second shows the change working in one line: the day-one lot was a **21,744 km 1993 Wagon R,
buyout 184,334, sold for 157,575 on a day-10 offer**; it is now a **40,799 km 1991 Corolla AE91,
buyout 147,301, same buyer, 124,021, day-5 offer**. The Wagon R's window opens in 1993, which a 1995
campaign cannot put three years behind it.

Three behavioural tests were re-derived and **none was loosened**. The auction chronology test now
asserts both halves rather than one: the release year is still excluded, and inclusion is asserted
at the floor with an age assertion rather than a bare year bound. Two tutorial-isolation tests moved
their campaign year to 1997, the first year that would offer the scripted car at all, rather than
dropping the guard they carry.

**No case (b).** Nothing depended on near-new lots existing.

### A content consequence this doc did not name

**The tutorial teaches on a Wagon R, and a 1995 campaign can no longer offer one at auction.** Its
window opens in 1993, so it becomes eligible at 1996, and the calendar jumps 1995 to 1997 with
reputation. A player therefore learns on a car they cannot buy until reputation tier 2.

The tutorial itself is unaffected: `buildTutorialLot` is RNG-free and never goes through the
catalogue. But "here is how to fix one of these" followed by never meeting one is a content question
rather than a mechanical one, and it belongs to the maintainer.

Relatedly, `excludedAuctionModelIds` is now belt-and-braces at the only campaign year the tutorial
runs at. The mechanism was left in place because it is roster-dependent rather than structurally
dead.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 626 passed |
| `pnpm test --project sim` | 2,788 passed |
| `pnpm test --project game` | 1,035 passed |
| `npx eslint` / `prettier --check` | clean |
| content diff | empty |
