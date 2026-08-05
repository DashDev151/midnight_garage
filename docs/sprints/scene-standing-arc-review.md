# The scene standing arc: what landed, and what to look at

**Built overnight 2026-08-04 into 08-05 under blanket lever authority.** Seven sprints, all
committed and pushed, every gate green. This page is for the review: what moved, what I decided on
your behalf, and what I would look at first.

## What shipped

| sprint | commit | what |
| --- | --- | --- |
| 176 | `28452a8` | the six scenes, channels, the Collector Network |
| 175 | `dd5138a` | power expectation: ceiling 600, the climbing chain |
| 177 | `0724113` | standing moves the band; matched tests fit, not price |
| 178 | `3128ca1` | the earn event, personas, the shop ledger |
| 179 | `ae7eea8` | word of mouth, commissions, the chain consumed |
| 180 | `3823cfd` | the six craft operations, and the commission UI |
| 181 | `d4864de` | the old specialty system deleted; the bible amended |

**Final state:** typecheck clean across all three packages, `npx eslint .` clean, **3,860 tests
across 197 files, all green.**

## The three findings that changed the design

**Matched meant almost nothing.** The old test was on the output price (`taste >= 1.0`), and
measuring it over 156 real buyer-and-model pairs showed **95 to 97 per cent of pairs already
counted as matched with no standing at all**, rising to 100 per cent by the top stage because
standing raises the floor. More standing made matching easier and matching is what earns standing:
a compounding loop nobody designed. Testing fit instead (`normalizedTasteScore >= 0.5`) holds it
flat at **87.2 per cent at every stage**.

**Raising the power ceiling does not help a built car.** Measuring before and after showed the
fully built Supra moved **zero per cent for all six buyers**, because it already cleared every
target at the old ceiling too. So 175 moved the wall from 225 PS to 450 and did not remove it.
Removing it is the climbing chain, which 179 wired into commissions only.

**The arc's acceptance test cannot be written against sale price.** `marketValueYen` is
deliberately stat-blind, so a style build and a handling build carry different parts bills that
swamp the taste signal entirely. The test measures that confound explicitly and then compares what
standing actually touches, `channelBuyerTaste`. **It passes**: a Show Crowd shop rates a style-built
AE86 above a handling-built one, a Touge shop rates it the other way, and their preferred cars
differ.

## What I would look at first

**1. Standing's effect on money may be smaller than the noise.** This follows directly from the
acceptance-test finding. Standing moves the taste band by a few per cent; parts bills move value by
far more. **Whether being The Shop for a scene is FELT in the till is an open question** and the
honest answer is that nobody has played it.

**2. Three signature service jobs were deleted.** Only three of the six old techniques became craft
operations in 180. Dog-box conversion, one-off fabrication and bespoke trim had no successor, so
their templates had nothing left to gate them: ungated would have handed everyone three tier-4 jobs,
gated by the dead mechanism would have made them unreachable. **They went with the mechanism.** That
is real content loss and it should be a deliberate decision rather than an accepted one.

**3. The shop title is gone with nothing in its place.** Nothing in the arc replaced it. Removed
rather than half-kept, and noted in the bible amendment as open.

**4. The weekend meet now prices lowest of four channels on a stock kei.** Raising the Show Crowd to
2.2 there makes them the likely buyer even for cars they do not want. Arguably correct, since a car
meet is the wrong place to sell a commuter, but it was measured rather than intended.

**5. Nobody has seen any of the new UI.** The Scenes panel, the ledger, the commission flow and the
operation controls were all built by agents that cannot see what they draw.

## Every value I set

**176, the scenes.** Channel weights: free ads 0.4 / 0.7 / 0.5 / 0.2 / 2.0 / 0.3, magazine 0.2 /
1.6 / 0.3 / 1.8 / 0.05 / 1.4, meet 0.3 / 1.5 / 2.2 / 0.4 / 0.4 / 1.0, Collector Network 3.0 / 0.2 /
0.1 / 0.2 / 0.05 / 0.1 (collector, tuner, show-crowd, racer, daily-drivers, touge). Collector
Network: fee 20,000, ceiling 1.20, matched-only, widening 0.3. Tuner importances: power 0.6,
handling 0.7, style 0.6, reliability 0.6, **authenticity untouched at 0**. Touge: handling 0.75 at
importance 1.0, power target 0.7 at 0.6, style 0.3 at 0.2, reliability 0.6 at 0.5, authenticity 0,
tolerance 1.0.

**175, power.** `powerNormalizationCeiling` 300 to **600**. Chain steps **10 / 5 / 1 per cent**.

**177, the band.** Known floor 0.92; Respected floor 0.95 ceiling 1.17; The Shop ceiling 1.25.
`matchedTasteScoreThreshold` **0.5**.

**178, earning.** Known **3** matched deliveries, Respected **10**, The Shop needs Respected plus a
marquee sale at **500k / 1.2m / 3m / 8m** by class. Rolling window **14 days**.

**179, word of mouth.** Stage multipliers **1.4 / 1.8 / 2.4**, rolling-window cap **1.5**,
commission refresh **7 days**, payout **1.25x**.

**180, operations.** All six at **labour 5, zero yen** (machining's own precedent). Authenticity
costs 1 to 3. Magnitudes measured from the catalogue's own grade ladders rather than chosen, one
operation being worth about one grade step on its axis.

## Deliberately not built

**The tool ladder** (`docs/design/systems/tier-three-unlocks.md`) is designed in full and not
started. It is a separate feature with its own behaviour change (race grade gating on tier 2), and
starting it unreviewed at the end of an eight-hour autonomous run would have been worse than
stopping cleanly. **It is the obvious next thing** and it complements the arc: body and interior
tier 3 get no craft operation, and the chassis jig, widebody and the cage are exactly what fills
that gap.
