# Sprint 142: grade sensitivity and the provisional condition curves

**Status: BUILT, ready for review** (Lever 1 signed 2026-08-01, exactly the table below). **Gated
on Sprint 134 alone, and that gate is met:
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

- [x] Sprint 134 shipped. Which other sprints have landed is recorded here, because the
      condition review in Task 3 is only worth as much as the system it looks at. **Task 3's
      value question needs Sprint 136 landed**; if it has not, run the grade-sensitivity half
      and record that the review is deferred rather than doing it against half a system.
      **134 to 137 have all landed, so the review ran against the whole system.**
- [x] Lever 1 signed and recorded.
- [x] `gradeBandFactor` in content, with the stock row identical to `bandFactor`.
- [x] `buildFactors` reads it; an unresolvable grade falls back to the stock row.
- [x] A stock-parts build is byte-identical to before this sprint.
- [x] A race part at `poor` is worse than a street part at `mint`, pinned, with the sport case.
- [x] Monotonicity holds across bands and across grades.
- [x] The mass direction proved for all four curves.
- [x] `harnessAcceptance.test.ts` passes untouched.
- [x] The four dial curves reviewed, the lap figures reported beside Sprint 129's, the worn and
      poor price shares reported, and a recommendation given. No curve moved in this sprint.
- [x] Checks run once each, output shown.

## Exit

**Status: ready for review.** A part's grade now decides how sharply its own advantage fades, and
the four dial curves were reviewed rather than moved.

### What landed, and where

| File | Change |
|---|---|
| `packages/content/src/economy.ts` | `GradeBandCurveSchema` (five bands, each bounded to `[0, 1]`) and `statFormulas.condition.gradeBandFactor`, four grades by five bands. The schema comment states the stock-row identity, the mint identity, and the no-wear-rate rule where the table is defined. |
| `packages/content/data/economy.json` | The four rows, exactly as the lever table above. |
| `packages/content/src/stats.ts` | `PhysicalModifierSchema.grip`'s comment now names the formula the interpolation actually runs (`gradeBandFactor[grade][band]`). |
| `packages/sim/src/derivedStats.ts` | `buildFactors` resolves the installed SKU's grade and reads `gradeBandFactor[grade][band]` in place of `bandFactor(band, economy)`; a grade that cannot be read falls back to the `stock` row. `bandFactor` itself is untouched and keeps its other three jobs. |
| `packages/sim/tests/aftermarketPhysics.test.ts` | Eight new tests plus three shared helpers hoisted to module scope (`buildAtBand`, `rawProductOf`, `retainedAdvantage`), so the grade block and the band block share one set rather than each growing its own. |
| `packages/content/tests/economyApprovalGate.test.ts` | Re-pinned for the one signed lever, with its own ledger entry. |

### The design requirement, proved

Measured off the real `enthusiast`-class SKUs, through `buildFactors` rather than by hand:

| part | modifier | band | curve | delivered |
|---|---:|---|---:|---:|
| street coilover | 1.010 | mint | 1.00 | **1.01000** |
| sport coilover | 1.020 | poor | 0.38 | **1.00760** |
| race coilover | 1.029 | poor | 0.25 | **1.00725** |

**The race part at `poor` is worse than the street part at `mint`, and so is the sport part.** The
same ordering holds on the other two dials without being aimed at: race pads at `poor` deliver
1.01810 against a mint street pad's 1.02370, and a race exhaust at `poor` saves 0.52 per cent of
kerb weight against a mint street exhaust's 0.69 per cent. It is a rule across the ladder, not a
coincidence at its ends.

**Monotonicity holds in both directions.** For a fixed grade the retained fraction falls at every
band step; for a fixed band below `mint` it falls at every step UP the ladder, street to sport to
race. The `stock` row is deliberately outside that chain: a stock SKU's modifiers are all exactly
1, so its row can never move a dial however steep it is, and it exists only to hold the
pre-sprint identity.

### The two identities that keep everything else still

- **The stock row is `bands.bandFactors` verbatim.** Asserted by strict equality on the table
  itself, and separately on all 26 shipped cars at all five bands: a car built entirely from stock
  parts returns exactly `STOCK_BUILD_FACTORS`.
- **Every row is exactly 1.00 at `mint`.** Asserted directly on the table and on real builds at all
  four grades, so `harnessAcceptance.test.ts` passes untouched (27 tests) and every story-mission
  payout, budget cap, lap ceiling, power floor, reliability threshold and taste floor is unchanged
  against a fresh `storyMissionProbes.test.ts` run. Every probe builds at mint, where this table is
  the identity.

No part price and no bill threshold moved, so `enforceMinWorkBill` draws the same PRNG steps and
the seeded auction catalogues are untouched: `auctions.test.ts`, `advanceDay.test.ts` and
`hashState.test.ts` all pass unchanged and the auction-demo benches needed no re-derivation.

---

## Task 3: the review of the four dial curves

**Recommendation: leave `statFormulas.condition.bandFactor` exactly as it is. No curve moved in
this sprint, and none should move on the strength of these numbers.** The reasoning is below, and
so are the two things that would change the answer.

### 1. What a worn car does, beside Sprint 129's figures

The whole car through the game-facing `lapTimeSecondsFor`, every slot at the same band, the
model's own fitment class. **Every figure is identical to Sprint 129's Exit table, to the tenth of
a second, on all three cars and all four courses.** The arc moved nothing about what a worn STOCK
car does on track, which is the expected result: 134 and 137 touch aftermarket parts only, 135's
`powerFraction` is zero on every stock SKU, and 136 moved reliability, which the lap model does not
read.

| Car | Band | Hakone | Wangan | Misaki | Yatabe (standing km) |
|---|---|---|---|---|---|
| Honda City E | mint | 131.8 | 196.0 | 143.7 | 34.9 |
| | fine | 135.8 (+3.0%) | 197.9 (+1.0%) | 145.4 (+1.2%) | 36.0 (+3.2%) |
| | worn | 143.7 (+9.0%) | 201.8 (+3.0%) | 148.6 (+3.4%) | 37.9 (+8.6%) |
| | poor | 160.1 (+21.5%) | 218.6 (+11.5%) | 162.0 (+12.7%) | 41.2 (+18.1%) |
| | scrap | **no time** | **no time** | **no time** | **no time** |
| Silvia K's S14 | mint | 118.0 | 139.1 | 109.6 | 26.4 |
| | fine | 121.4 (+2.9%) | 142.8 (+2.7%) | 112.5 (+2.6%) | 27.2 (+3.0%) |
| | worn | 128.6 (+9.0%) | 150.5 (+8.2%) | 118.7 (+8.3%) | 28.6 (+8.3%) |
| | poor | 143.5 (+21.6%) | 166.0 (+19.3%) | 131.3 (+19.8%) | 31.1 (+17.8%) |
| | scrap | **no time** | **no time** | **no time** | **no time** |
| Skyline GT-R BNR32 | mint | 114.1 | 135.6 | 107.1 | 24.1 |
| | fine | 117.5 (+3.0%) | 139.3 (+2.7%) | 110.0 (+2.7%) | 24.8 (+2.9%) |
| | worn | 124.5 (+9.1%) | 146.8 (+8.3%) | 116.1 (+8.4%) | 26.1 (+8.3%) |
| | poor | 139.0 (+21.8%) | 162.0 (+19.5%) | 128.4 (+19.9%) | 28.3 (+17.4%) |
| | scrap | **no time** | **no time** | **no time** | **no time** |

The four dials ALONE, power held at stock, across the whole 26-car roster. **Also identical to
Sprint 129's table in every cell.**

| Band | Hakone | Wangan | Misaki | Yatabe |
|---|---|---|---|---|
| fine | +2.1% to +2.3% | +0.6% to +2.0% | +0.8% to +2.1% | +0.8% to +1.1% |
| worn | +6.8% to +7.5% | +2.0% to +6.4% | +2.5% to +6.7% | +2.6% to +3.8% |
| poor | +17.3% to +19.3% | +5.0% to +16.9% | +6.9% to +17.0% | +6.4% to +9.6% |
| scrap (dials only, unreachable in play) | +40.1% to +45.2% | +11.7% to +37.5% | +18.1% to +38.6% | +14.0% to +22.7% |

### 2. Condition against the aftermarket ladder, which is new information

The measurement Sprint 129 could not make, because the ladder did not exist: a full chassis build
(race dampers, springs, anti-roll bars, chassis, both brake lines, exhaust, rims and tyres, engine
untouched) at each band, against the same car stock and mint, on Hakone.

| Car | stock, mint | built, mint | built, fine | built, worn | built, poor |
|---|---:|---:|---:|---:|---:|
| Honda City E | 131.8 | 112.7 (-14.5%) | 116.8 (-11.4%) | 125.5 (-4.8%) | 141.5 (**+7.4%**) |
| Skyline GT-R BNR32 | 114.1 | 97.8 (-14.3%) | 100.8 (-11.7%) | 108.8 (-4.6%) | 123.5 (**+8.2%**) |

**A neglected race build crosses below a healthy stock car between `worn` and `poor`.** That is
design section 10's stated goal reached end to end ("a blown race turbo is not something anyone
wants"), and it is produced by the two paths together: the dial curves take the car's baseline
down, and the new grade curve takes the fitted parts' own advantage down harder because they are
race parts. It is the strongest argument in the review that the dial curves are already steep
enough, since making them steeper would push the crossover up into `worn`, where the market
expects most of the roster to be sold.

### 3. What a worn car is worth, beside the same figures from before the arc

Every shipped car, all stock, uniform band, at neutral mileage and 100 heat, so book value is the
clean value and the share is condition's own work. `bestOffer` is the highest of the six shipped
buyer archetypes through `valuateCarForBuyer`; `pre-arc` recomputes the same offer with the
pre-Sprint-136 reliability (`70 x bandFactor`, which for a uniform-band car is exact, since a
weighted mean of a constant is that constant).

| Band | Guide value, share of book (median) | Best offer (median) | Best offer, pre-arc (median) | Reliability | Reliability, pre-arc |
|---|---|---|---|---|---|
| mint | 100.0% (100.0%) | 109.0% to 112.0% (111.6%) | 108.2% to 112.0% (111.6%) | 80 to 100 | 70 |
| fine | 91.4% to 98.1% (96.4%) | 100.7% to 109.0% (106.2%) | 100.7% to 108.5% (105.5%) | 68 to 85 | 60 |
| **worn** | **66.2% to 92.4% (87.4%)** | **71.0% to 98.4% (94.3%)** | **69.0% to 97.7% (92.5%)** | **52 to 65** | **46** |
| **poor** | **47.2% to 88.7% (81.4%)** | **47.5% to 91.3% (83.4%)** | **46.5% to 90.5% (82.1%)** | **32 to 40** | **28** |
| scrap | 5.0% to 61.8% (38.1%) | 4.7% to 61.1% (36.7%) | 4.6% to 60.9% (36.6%) | 12 to 15 | 11 |

**The guide-value column did not move across the arc at all, and could not have.**
`marketValueYen` takes no derived stat as an argument; the one arc mechanism that reaches it,
Stage C's coherence discount, is exactly zero on a stock car at every band, because
`supportRatios` reads the fitted GRADE and never the band, so a stock car's headline is 1
whatever state it is in. **The widened reliability band therefore reaches price only through the
taste multiplier**, bounded to `[0.88, 1.12]` and shared across all five stats: a worn car's best
offer rises 1.8 points of book (92.5% to 94.3% median) and a poor car's 1.3 points. That is the
whole of Sprint 136's price effect on a worn car, and it is small by construction.

### 4. Does any of that argue for moving the four dial curves?

**No, on four counts.**

1. **There is nothing to correct.** Every figure the curves produce reproduces Sprint 129's own
   Exit tables exactly, on every car and every course. The arc did not drift them; it did not
   touch them.
2. **They do not reach price**, so the price question this review inherited is not theirs to
   answer. Their only route to money is the `handling` term inside a bounded taste multiplier, so
   moving them would be a change to PACE alone, dressed up as a change to value.
3. **The band that matters most is the one they treat most gently.** `valuation.expectationByTier`
   expects `fine` on three tiers and `mint` on the fourth, so the state a car is SOLD in costs
   2.1% to 2.3% of Hakone pace. `worn` and `poor` are the states a car is BOUGHT in, where the
   curves' job is to make a rough car feel rough on the reference board, and at +7% and +18% they
   do that unambiguously.
4. **The new crossover measurement points the other way.** A race build at `poor` is already 7 to
   8 per cent slower than a stock mint car. Steeper curves would move that crossover into `worn`,
   which would make the market's own expectation band a state in which a built car is worse than
   an unbuilt one.

**And the honest reason not to touch them regardless: no measurement exists.** Sprint 129 recorded
that they were "not calibrated against a driven worn car, because no such measurement exists", and
that is still true. Any new value would be exactly as unmeasured as the current one, minus the
advantage that the current one is what the whole arc was built and validated against. They stay
**PROVISIONAL**, and the schema still says so.

**Two things would change this answer**, and each is a lever request with numbers rather than a
judgement call:

- A driven lap on a genuinely worn car, which is the only thing that turns this review into a
  derivation.
- Playtesting showing that the crossover sits in the wrong place: if a player who buys a rough
  built car and repairs it to `fine` finds the build reads as no better than stock, the grade
  curve (this sprint's table) is the one to look at first, not the dial curves.

### Directive 17: every test touched

| Test | Case | Why |
|---|---|---|
| `aftermarketPhysics.test.ts`, "the five-band shape is pinned for one grip part and one mass part" | **(a)** stale assertion | It read `ECONOMY.bands.bandFactors[band]` for two RACE-grade probe parts. That was the correct source before this sprint and is the wrong one after it; it now reads `gradeBandFactor.race[band]`, which is what those parts actually run on. The implementation deliberately changed what is correct. |
| `aftermarketPhysics.test.ts`, the shared helpers and `BANDS_BEST_FIRST` | neither | Structural only: `buildAtBand` was hoisted out of one describe block so both blocks share it, the raw-product loop became `rawProductOf`, and two inline band arrays became one module constant. No assertion changed. |
| `economyApprovalGate.test.ts` | **(a)** stale pin | `economy.json` gained the signed table, so the hash moved by construction. Re-pinned in the same change as the recorded approval, with its own ledger entry naming the lever and all twenty values. |

Every other test in the suite passed **unchanged**, including the two that would have caught a
mistake fastest: `harnessAcceptance.test.ts` (the calibration guard) and
`storyMissionProbes.test.ts` (every formula-derived payout and threshold).

### Checks run

```text
pnpm typecheck                                    3 projects, Done
pnpm test --project content                       26 files, 573 tests passed
aftermarketPhysics.test.ts                        28 tests passed (20 before, 8 new)
harnessAcceptance.test.ts                         27 tests passed, untouched
conditionPhysics / derivedStats / lapModel /
  lapModelPace / aero / proportionalPower /
  engineCharacter                                 268 tests passed
reliabilityModel / supportRatios / valueModelProbes /
  coherenceValuation / valueStatIndependence /
  marketValue / valuation / style / plays          212 tests passed
advanceDay / hashState / auctions / requirements /
  missions / tutorialProbe / balanceProbes /
  referenceBoard                                   141 tests passed
storyMissionProbes.test.ts                        19 tests passed
sandboxCars.test.ts (game, the one file reading
  `buildFactors`)                                 86 tests passed
```

The sim suite is run file by file rather than whole, per the standing rule. `pnpm typecheck` is
the directive 20 carve-out run: this sprint reshapes a schema block, and the whole-program check is
the cheapest thing that catches a `.vue` template still reading the old shape.
