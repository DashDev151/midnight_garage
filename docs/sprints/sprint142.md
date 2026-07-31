# Sprint 142: grade sensitivity and the provisional condition curves

**Status: NOT STARTED, AWAITING SIGN-OFF.** **Gated on Sprint 134 alone, and that gate is met:
134 shipped 2026-07-29.** Its grade-sensitivity half is independent of power, support and value,
so it may run now; it is numbered last because its second half, the review of the four condition
curves, is most useful once the rest has landed, and 135 to 137 have since landed too.
Last of nine in the tuning overhaul arc.

Design reference: `docs/design/systems/tuning-system.md` section 10, and
`docs/design/car-performance/README.md` section 7b.

## The gap, stated plainly

**Two things, and they are different sizes. Say so rather than blurring them.**

### 1. A race part and a stock part wear identically, and they should not

Sprint 134 made a build's physical modifiers scale with condition, using the single
`bandFactor` curve. So a race coilover and a street coilover both retain 40 per cent of their
advantage at `poor`.

Real parts do not behave that way. **A race part is highly strung and runs to a service
interval; a stock part is under-stressed and tolerates a decade of neglect.** The property
the game lacks is the one design section 10 names: **a race damper at `poor` should be worse
than a street damper at `mint`**, and a blown race turbo should not be something anyone wants.

**No wear rate is implied, and this must not be reintroduced.** A race part is not more
*fragile over time*, because nothing here degrades over time: `degradeBand` exists only
inside `auctions.ts`, applied at generation time before the player ever sees the car, and the
only thing that moves condition during play is the player repairing it. A race part is more
**sensitive**: at a given band it has lost more of its advantage than a stock part at the same
band would have. **That is a curve shape, not a process.**

### 2. The four physical dial curves are flagged PROVISIONAL, and mostly still are

`car-performance/README.md` 7b flags `statFormulas.condition.bandFactor` as provisional and
calls that "the most important sentence in this section". Sprint 129 authored them by
judgement and its own Exit records that they are "not calibrated against a driven worn car,
because no such measurement exists".

**That is still true and this sprint does not change it.** The arc doc says "re-derive them,
with the whole system in place", which overstates what is available: there is no new
measurement to derive from, only a system that is now complete enough to judge them against.

**So the honest scope is a review, not a derivation.** Run the whole system, look at what a
worn car now does end to end, and report whether anything justifies moving the four curves.
**Moving them is a lever change and needs its own sign-off; leaving them alone is a perfectly
good outcome and must be reported as a finding rather than as a sprint that failed.**

## Reuse analysis (directive 16)

### Genuinely new

- **One content table**: the band curve varies by part grade.

### Existing mechanisms reused, unchanged

- **`buildFactors`'s interpolation** from Sprint 134,
  `effective = 1 + (modifier - 1) * factor`. Only the source of `factor` changes: from
  `bandFactor(band)` to `gradeBandFactor[grade][band]`.
- **The four grades** and the five bands. No new vocabulary.
- **`physicalConditionFactors` and `statFormulas.condition.bandFactor`**, the separate
  condition-of-the-car path, which this sprint reviews and does not restructure.

### Must NOT be built

- **A wear rate, a service interval, or anything denominated in days of use.**
- **A fifth grade.**
- **A second condition model.** Grade sensitivity is a lookup on the existing curve, not a
  parallel system.

## The levers (ALL UNAPPROVED, directive 22)

### Lever 1: `statFormulas.condition.gradeBandFactor`

Replaces the single `bandFactor` inside `buildFactors` only. **`bandFactor` itself is
untouched** and keeps doing its existing jobs everywhere else: `weightedBandFactorForStat` for
all four condition-derived stats, the `style` part modifier in `computeDerivedStats`, and the
band-scaled demand side of `supportRatios` (Sprint 136).

**Three condition paths now exist and this sprint touches exactly one of them.** They are
deliberately separate and must not be conflated:

| path | curve | what it governs |
| --- | --- | --- |
| `statFormulas.condition.bandFactor` | four physical dials | grip, braking, driveline, downforce |
| `statFormulas.condition.reliabilityCeiling` (Sprint 136) | a severity cap, not a curve | one write-off dominating the reliability mean |
| **`gradeBandFactor` (this sprint)** | **per grade** | **what an installed SKU's own `physicalModifiers` still deliver** |

| grade | mint | fine | worn | poor | scrap |
| --- | ---: | ---: | ---: | ---: | ---: |
| stock | 1.00 | 0.85 | 0.65 | 0.40 | 0.15 |
| street | 1.00 | 0.90 | 0.75 | 0.52 | 0.22 |
| sport | 1.00 | 0.86 | 0.65 | 0.38 | 0.13 |
| race | 1.00 | **0.80** | **0.52** | **0.25** | **0.05** |

**The `stock` row is today's `bandFactor` exactly**, so a car built from stock parts behaves
identically to before this sprint. **Every row is 1.00 at mint**, so the calibration is
untouched at the top of the band and this sprint cannot disturb the harness.

Design section 10's requirement, checked arithmetically:

| part | modifier | band | delivered |
| --- | ---: | --- | ---: |
| street coilover | 1.010 | mint | **1.01000** |
| race coilover | 1.029 | poor | **1.00725** |

**The race part at `poor` is worse than the street part at `mint`**, with margin. The sport
part at `poor` delivers 1.00760, also worse than a mint street part. The property holds
across the ladder rather than only at its extremes, which is what makes it a rule rather than
a coincidence.

## Task breakdown

### Task 1: content

`packages/content/src/economy.ts` and `packages/content/data/economy.json`: add
`statFormulas.condition.gradeBandFactor`, four grades by five bands. Document in the schema
comment that the `stock` row is deliberately identical to `bandFactor` and why, and state the
no-wear-rate rule where the table is defined so it is read by anyone tempted to add one.

### Task 2: the consumer

`packages/sim/src/derivedStats.ts`, `buildFactors`: resolve the installed SKU's grade and
read `gradeBandFactor[grade][band]` in place of `bandFactor(band, economy)`.

**A SKU whose grade cannot be resolved uses the `stock` row**, matching the file's existing
rule that an unresolvable part can never silently move the physics.

### Task 3: the review of the four dial curves

Not a code change. Measure and report:

1. What a `worn`, `poor` and `scrap` car now does end to end, across the roster and all four
   courses, with the whole system in place. Sprint 129's Exit has the comparable tables from
   before the arc; put the new figures beside them.
2. **What a worn car is now worth**, which is a new question this review inherits. Sprint 136
   changed reliability's ceiling from 70 to 100 and put a severity cap under it, so condition
   reaches price through a wider band than it did when the four dial curves were authored.
   Report the price of a `worn` and a `poor` car as a share of book value, beside the same
   figures from before the arc.
3. Whether anything in those numbers argues for moving `statFormulas.condition.bandFactor`.
4. A recommendation, with reasoning.

**Do not move the four curves in this sprint.** If the review finds a case, it goes to the
maintainer as its own lever request. Leaving them exactly as they are is an acceptable and
likely outcome, and the report says so plainly rather than manufacturing a change.

### Task 4: tests

1. **The stock row is the identity.** A car built entirely from stock parts produces
   byte-identical build factors to before this sprint, strict equality.
2. **The mint identity, again.** Every grade at `mint` delivers its modifier exactly. This is
   what keeps `harnessAcceptance.test.ts` green and it must be asserted directly, not
   inferred.
3. **The design requirement, pinned.** A race coilover at `poor` delivers strictly less than
   a street coilover at `mint`. Add the sport case in the same test.
4. **Monotonicity in both directions.** For a fixed grade, delivered advantage falls as the
   band worsens. For a fixed band below `mint`, delivered advantage falls as the grade rises.
   The second is the new property and it is the one worth stating explicitly.
5. **The mass direction, again.** A race lightweight part at `poor` saves less weight than a
   street one at `mint`, and no part at any grade or band adds mass over stock. Sprint 134
   proved the sign for one curve; this sprint has four and the test must cover them.
6. **No curve produces a factor above 1.0 or below 0.**

### Task 5: checks

```text
pnpm test --project content
pnpm test --project sim
```

`harnessAcceptance.test.ts` must pass untouched: every car in it is at mint.

**Auction-demo warning (2026-07-30, standing rule across this arc):** if this sprint moves any part
price or bill threshold, `enforceMinWorkBill` (`packages/sim/src/auctions.ts` ~370-413) draws a
different number of PRNG steps and reshuffles every later lot in a seeded catalogue -
`packages/game/src/screens/auctionRoom.test.ts`, `auctionRoomDemo.test.ts` and
`AuctionRoomDemoScreen.test.ts` must be re-derived from a fresh seeded run, and
`pnpm test --project game` must be run before this sprint is called done.

### Task 6: re-derive whatever moved

Directive 17 case (a). Any car carrying non-mint aftermarket parts moves again, and this time
the size of the move depends on the grade of what is fitted. `economyApprovalGate.test.ts`
moves; re-pin in the same change as the recorded sign-off.

## Hard constraints

- **No wear rate. No service interval. Nothing denominated in days.** If a future reader
  proposes one, section 9 requires them to answer two questions first: when does the player
  live with the car, and what moves condition during play.
- **`bandFactor` itself is not modified.** Only `buildFactors`'s use of it changes.
- **The four dial curves are reviewed, not moved.**
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Sprint 134 shipped. Which other sprints have landed is recorded here, because the
      condition review in Task 3 is only worth as much as the system it looks at. **Task 3's
      value question needs Sprint 136 landed**; if it has not, run the grade-sensitivity half
      and record that the review is deferred rather than doing it against half a system.
- [ ] Lever 1 signed and recorded.
- [ ] `gradeBandFactor` in content, with the stock row identical to `bandFactor`.
- [ ] `buildFactors` reads it; an unresolvable grade falls back to the stock row.
- [ ] A stock-parts build is byte-identical to before this sprint.
- [ ] A race part at `poor` is worse than a street part at `mint`, pinned, with the sport case.
- [ ] Monotonicity holds across bands and across grades.
- [ ] The mass direction proved for all four curves.
- [ ] `harnessAcceptance.test.ts` passes untouched.
- [ ] The four dial curves reviewed, the lap figures reported beside Sprint 129's, the worn and
      poor price shares reported, and a recommendation given. No curve moved in this sprint.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
