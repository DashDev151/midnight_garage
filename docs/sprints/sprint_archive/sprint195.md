# Sprint 195: mileage stops adding value

**Status: IMPLEMENTED, ready for review.** Lever signed before implementation.

## The defect

`economy.mileageFactorCurve` peaks at **1.05**, so a low-mileage car is worth **more than book**.
The maintainer's ruling:

> *"Mileage on a car can never ADD value. Low mileage can only subtract less."*

A wear axis that can exceed 1.0 is a category error, and it was visible from the schema without
measuring anything. It was never caught because the value was authored and signed, so review checked
that the code honoured it and never asked whether it could express something incoherent.

**It fires hard rather than marginally.** Measured across the real generative chain:

| campaign year | lots under 30,000 km, on the flat 1.05 peak | under 60,000 km, getting something |
| --- | ---: | ---: |
| 1995 | **49.2 per cent** | 76.6 per cent |
| 1997 | 33.9 | 67.2 |
| 1999 | 24.9 | 57.7 |
| 2001 | 16.1 | 44.6 |
| 2003 | 11.5 | 32.5 |

At day one nearly a third of the whole board is under 15,000 km, two thirds of lots are five years
old or younger, and the median lot is four.

## LEVER (directive 22) - SIGNED

**Approved by the maintainer 2026-08-07, by name and value, before any implementing agent launched.**

`economy.mileageFactorCurve`:

| km | from | to |
| --- | ---: | ---: |
| 30,000 | 1.05 | **1.00** |
| 60,000 | 1.00 | **1.00** |
| 120,000 | 0.85 | 0.85, unchanged |
| 180,000 | 0.75 | 0.75, unchanged |

**This is the maintainer's own shape, and it is better than the one first proposed.** The first
proposal divided the whole curve by 1.05, which repriced **every lot in the game** by a flat 4.5 per
cent. This flattens only the part that sits above 1.0 and leaves the tuned high-mileage end exactly
as it is.

**What it costs, measured:**

| campaign year | share of lots affected | mean change |
| --- | ---: | ---: |
| 1995 | 76.6 per cent | **-3.2 per cent** |
| 1997 | 67.2 | -2.6 |
| 1999 | 57.7 | -2.1 |
| 2001 | 44.6 | -1.5 |
| 2003 | 32.5 | **-1.1 per cent** |

**Nothing above 60,000 km moves at all.** That kills the objection raised against the first
proposal: repairs becoming relatively dearer against the car they fix, which bites hardest on old,
cheap, high-mileage cars. Those are untouched. The correction lands only on cars that were being
given something.

## Accepted as quick and dirty, recorded for a better fix later

**Mileage becomes completely inert below 60,000 km.** An 8,000 km car and a 55,000 km car price
identically, and at day one that is three quarters of the board with no mileage signal at all.

The maintainer accepted this knowingly: *"we implement this fix. we note it in TODO to be fixed
better later. This is a quick and dirty, but implement it."* A `TODO.md` entry records what a better
answer would look like, so the flatness is a decision on the record rather than a thing nobody
noticed.

## Reuse analysis (directive 16)

**New: nothing.** One content value moves. Every consumer already reads the curve through
`interpolateCurve`, and the curve's shape is already data.

## Tasks

1. **Move the two values.** Nothing else in any content file.
2. **Re-pin the `economy.json` approval hash**, recording the ruling.
3. **Add a schema floor so the shape cannot come back.** `mileageFactorCurve`'s multipliers should be
   `.max(1)` the way `PhysicalModifierSchema.mass` already is. A wear axis that can exceed 1.0 is
   the defect, not the value that happened to.
4. **Fix the bench note, which is now false.** It reads *"mileage below that ADDS value and mileage
   above it takes value away"*. It must describe the curve as it then is. The figures already read
   from content; the prose does not.
5. **Re-derive every pin this moves, from a real run.** Expect value pins, golden-master hashes and
   any figure derived from `cleanValueYen`. **Note the second-order effect:**
   `enforceMaxBillFraction` sizes the Law 2 bill cap off `cleanValueYen`, so generated cars get a
   very slightly lower cap and arrive marginally softer.
6. **Write the confirming measurement as a test.** The distribution above was computed in closed
   form over the real generative chain rather than by running it. A test that generates lots and
   buckets `mileageKm` turns an exact derivation into a pinned fact.

## Definition of done

- No mileage anywhere produces a multiplier above 1.0, enforced by the schema rather than by care.
- Nothing above 60,000 km changed value.
- The bench's mileage note is true of the new curve.
- Every moved pin re-derived from a real run, with the reason recorded (directive 17 case (a)).
- `pnpm typecheck` clean, all three projects green, pre-push gate green.

## Deliberately not here

- **The age floor.** `AUCTION_MIN_AGE_YEARS` is 3, but `generatedYearRangeFor` clamps with
  `max(yearFrom, youngest)`, so `yearFrom` wins and a car whose production window starts at the
  campaign year generates at **age 0 with as little as 0 km**. Several roster cars can do this at
  several campaign years. The floor does not do what its name says. Separate decision, separate
  change.
- **A better mileage model** than a flat band. Recorded in `TODO.md`.

## Exit

One content value moved: `[30000, 1.05]` to `[30000, 1]`. The curve is now flat at 1.00 from zero to
60,000 km and the two high-mileage points are untouched.

### The schema is the real fix

The value being 1.05 was the symptom. The reason it survived review is that the schema let a wear
axis exceed 1.0, so nobody reading it had cause to stop. `mileageFactorCurve` now takes a
`WearFactorCurveSchema` rather than the generic one, and its doc comment explains the constraint
rather than just imposing it:

> The ceiling of 1 is the whole constraint, and it is what makes this a wear curve rather than a
> generic one. Wear only ever subtracts, so a car that has done less of it is worth up to book and
> never more; a breakpoint above 1 would price the car above the guide its book value already is,
> which is a claim about desirability rather than about wear, arriving through the wrong axis. Heat,
> scene standing and a buyer's own taste are where a car earns more than book.

**Proven rather than asserted:** a negative test feeds the old curve back in and requires the schema
to reject it.

### The blast radius, measured

**Two pins moved. That is all.**

| pin | before | after |
| --- | --- | --- |
| `economy.json` approval hash | `2ba6e11c` | `2a95a55b` |
| `advanceDay` acquisition-and-sale golden | `c7a0c3be` | `7118cd29` |

**Nothing else.** Not the 30-day golden master, not one valuation or generation probe, not a mission
payout, budget cap or stat threshold. The reason is worth recording: **nearly every pinned fixture
already sits at or above 60,000 km**, on the part of the curve this change does not touch. The
probes build their cars at 120,000 km.

The one golden that moved was measured under both curves from the same seed rather than assumed:
identical lot, car, year, mileage and all 28 bands, still bought on day 1. Buyout **195,834 to
184,334**, offer accepted **164,458 to 157,575**, and the first offer arriving on **day 10 rather
than day 3**.

### The second-order effect fired, and barely

`enforceMaxBillFraction` sizes the Law 2 bill cap off `cleanValueYen`, so a lower clean value means a
lower cap. Generating **5,760 cars** under each curve from identical seeds, **13 differ, 0.23 per
cent.** Every one is under 60,000 km and all but one are on the two cheapest models, where a cap
sized off a very small clean value is what binds.

Net they arrive softer, 24 band steps better against 12 worse. Not uniformly softer per car, because
the freed budget is partly respent by the damage stage.

### The measurement is now a test, not a derivation

`generationCoherence.test.ts` draws 1,000 lots per campaign year through `generateAuctionCatalog`,
the rooms' own two-stage draw, rather than sweeping the roster evenly.

**The pinned fact is the zero: no lot at any campaign year can have a mileage factor above 1.** Two
deliberately loose bars sit beside it on the flat-band share, so a real regression trips the test
but adding a car to the roster does not.

Measured as shipped, the share of lots inside the flat band: **0.734 / 0.679 / 0.623 / 0.493 /
0.398** from 1995 to 2003. That is the known cost of a flat band, quoted in the test's own doc
comment.

### The bench note needed more rewriting than the one false clause

`mileageNoteFor` found its neutral point with `curve.find(factor === 1)`, which would now return
30,000 km and call it a crossing point. **The curve does not cross 1.00 any more, it is flat through
it**, so two fields were renamed and redefined: `neutralKm` became `discountFromKm`, the highest
breakpoint at 1.0 where discounting starts, and `youngestLotAddsValue` became
`youngestLotUndiscounted`, a name that can never be true again.

> Mileage multiplier at this figure: x1.000. The curve is flat at 1.00 up to 60,000 km and falls
> away above it, so mileage never adds value: a car below that figure has had nothing taken off
> rather than something added on.

> The youngest lot generation will ever produce is 3 years old and rolls 8,500 to 42,500 km, all of
> it inside the flat band. A large share of generated lots therefore carry no mileage discount at
> all, and price the same whether they have covered 8,000 km or 55,000.

That second paragraph states the accepted cost on the screen, so it is visible in play rather than
only in `TODO.md`.

Two doc comments in `marketValue.ts` and the schema also described "a small low-mileage bonus" and
were false as of this change; both now describe the flat band.

### Evidence

| check | result |
| --- | --- |
| `pnpm typecheck` | clean, all three projects |
| `pnpm test --project content` | 626 passed |
| `pnpm test --project sim` | 2,786 passed |
| `pnpm test --project game` | 1,035 passed |
| `npx eslint` / `prettier --check` | clean |
| content value diff | one number |

Four test expectations moved and **every one was case (a)**: the two hashes, and the two bench-note
tests whose prose contract this change deliberately rewrote. **No case (b)**, which on a value change
is the result that matters: a (b) would have meant something read the curve in a way nobody expected.
