# Sprint 186: the standing ladder, retuned and re-spaced

**Status: IMPLEMENTED, ready for review.** Completes `sprint183.md`, whose half one measured and
deliberately moved nothing.

## Goal

Two defects in the same ladder, fixed together because they live in the same lever block and are
answered by the same measurement.

1. **The thresholds mean six different things.** 3 and 10 matched deliveries are flat across every
   scene, but the scenes have base rates from 30.8% to 75.5%, so Respected costs **14 cars of work
   for the Show Crowd and 33 for a Collector**.
2. **The Known rung pays nothing on price.** Measured across all six scenes: `none` and `known`
   realise the **same yen, to the yen**. A four-stage ladder has three real stages.

## The measurement this is built on

Re-run against the 48-car roster (`sceneStandingRetuneProbes.test.ts`), so these supersede sprint
183's figures, which were taken on 26 cars.

| scene | best match rate | cars for Known (3) | cars for Respected (10) |
| --- | ---: | ---: | ---: |
| show-crowd | 75.5% (sport) | 4 | **14** |
| touge | 57.0% (targeted) | 6 | 18 |
| daily-drivers | 42.8% (stock) | 8 | 24 |
| tuner | 36.0% (race) | 9 | 28 |
| racer | 32.0% (race) | 10 | 32 |
| collector | 30.8% (stock) | 10 | **33** |

And the price ladder, every scene, matched exemplar:

| stage | shop front realises |
| --- | --- |
| none | 1.00 |
| **known** | **1.00, identical** |
| respected | 1.17 |
| shop | 1.25 |

## Reuse analysis (directive 16)

**No new mechanism at all.** Both fixes are values in blocks that already exist, plus one schema
widening to let a per-scene number be authored where a flat one is today.

- `economy.sceneStandingProgress.knownDeliveries` / `respectedDeliveries` become **per-scene maps**
  keyed by `BuyerArchetype`, exactly as `marqueeBarYenByTier` is already keyed by fitment class.
  The shape precedent is in the same block.
- `economy.valuation.sceneStanding.known` gains a `ceiling`, a field its two siblings already carry.
  `sceneStandingBandFor` already reads an optional ceiling and already handles its absence, so the
  code path exists.
- `nextSceneStandingStage` (sceneStanding.ts) changes from reading two numbers to reading two maps.
  Nothing else moves.

## Levers (directive 22)

### Thresholds, per scene

Set so that every scene costs roughly the same **work**, not the same **count**. The target is
about 5 cars of deliberate building to Known and about 20 to Respected, with the Collector
deliberately cheapest in count because it is an endgame scene and the maintainer's ruling is that
endgame growth should be faster rather than slower.

| scene | `knownDeliveries` | `respectedDeliveries` | cars to Known | cars to Respected |
| --- | ---: | ---: | ---: | ---: |
| collector | 3 to **2** | 10 to **8** | 7 | 33 to **26** |
| racer | 3 to **3** | 10 to **8** | 9 | 32 to **25** |
| tuner | 3 to **3** | 10 to **9** | 8 | 28 to **25** |
| daily-drivers | 3 to **4** | 10 to **11** | 9 | 24 to **26** |
| touge | 3 to **4** | 10 to **13** | 7 | 18 to **23** |
| show-crowd | 3 to **6** | 10 to **17** | 8 | 14 to **23** |

**Respected averages 25 cars of deliberate work and spans 23 to 26**, against a 14-to-33 spread
today. Known lands around 8 cars, a third of the way, which keeps the two rungs proportionate.

Variance survives, as ruled, and the Collector is deliberately cheapest in count because it is an
endgame scene where growth should accelerate rather than stall. What stops is one scene being a
different game from another.

### The Known rung gains a ceiling

Standing's price effect is **per-scene, and it is never reputation**: reputation touches price
nowhere in the game. A scene's ceiling competes with the listing channel's own via `Math.max`, so it
lifts every channel rather than one.

| stage | floor | ceiling | shop front realises |
| --- | --- | --- | --- |
| none | 0.88 | the channel's own | 1.00 |
| **known** | 0.92 | **1.08 (new)** | **1.08** |
| respected | 0.95 | 1.17 | 1.17 |
| shop | 0.95 | 1.25 | 1.25 |

Four evenly spaced rungs of roughly 8 per cent each. `1.08` sits below `1 + tasteSpread` (1.12), so
Known takes the CLAMP branch and the existing arithmetic needs no change: it clamps where the other
two replace.

**Standing pays most on the cheapest channels, which is the intended shape.** At The Shop: shop
front 1.00 to 1.25, free ads 1.05 to 1.25, magazine and meet 1.17 to 1.25, collector network 1.20 to
1.25. A famous shop stops needing to pay for reach, because its own forecourt now beats the
advertisement it used to buy.

**A known limit of the Known rung, recorded rather than discovered later.** 1.08 is below the
magazine's 1.17, the meet's 1.17 and the collector network's 1.20, so Known pays **nothing** to a
player selling through any of those three. It pays on the shop front and the free ads paper only.
That is defensible, since Known is an early stage and the premium channels are mid-game tools, but
it means the rung is worth something to a young shop and nothing to an impatient one.

### Not moving, with the measured reason

- `marqueeBarYenByTier` (500k / 1.2m / 3m / 8m). The Collector's joint condition is now reachable
  at **2 of 48 cars** where it was 0 of 26, so the roster fixed this rather than the bar being
  wrong. Daily Drivers sit at 3 of 48 and want watching, not moving.
- `wordOfMouthMultiplierByStage` (1.4 / 1.8 / 2.4). Nothing measured says the multipliers are wrong,
  only that reaching them took too long, which the thresholds above fix directly.
- `rollingWindowDays` (14) and `sceneCommissions.*`. Untouched.

### Named and NOT fixed here

`rollingWindowShareCap` (1.5) is now trivially reached: any single matched delivery with nothing
else recent takes the full cap, so a number meant to reward concentration rewards having sold
anything at all. **Fixing it needs a mechanism, not a value** (a minimum-delivery floor before the
term engages), which is a design question rather than a retune. Recorded in `TODO.md`.

## Definition of done

- Every scene reaches Respected within roughly 23 to 27 cars of deliberate work, averaging near 25,
  measured rather than asserted. (This bound was first written as 17 to 22, which was left over from
  an earlier draft of the threshold table and contradicted the signed lever table two sections above
  it. The signed table is what the values were set from and what the result is judged against.)
- The four price rungs are distinct on the shop front, and the probe reports all four.
- `sceneStandingRetuneProbes.test.ts` is re-run and its Exit figures updated.
- `pnpm typecheck` clean (directive 20's carve-out: the two threshold fields change shape).

## Exit

**Both levers moved, exactly as tabled above and nothing else.** `pnpm typecheck` clean (directive
20's carve-out: two economy fields changed shape from numbers to maps), `npx eslint .` clean, all
three Vitest projects green: content 599/599, sim 2461/2461, game 945/945. The economy approval
hash is re-pinned in the same change, with both levers recorded by name and value in
`economyApprovalGate.test.ts`'s own approval log (directive 22).

### What changed

- `economy.sceneStandingProgress.knownDeliveries` / `respectedDeliveries` are now
  `Record<BuyerArchetype, number>`, keyed exactly as `marqueeBarYenByTier` is keyed by fitment
  class. The schema's old "known < respected" refine now checks that inequality per scene.
- `economy.valuation.sceneStanding.known` gained `ceiling: 1.08`.
- `nextSceneStandingStage` (sim/sceneStanding.ts) takes the scene it credits and indexes both maps
  with it. Nothing else in the sim reads either field.
- `sceneStandingBandFor` (sim/valuation.ts) lost its `known` special case, which hard-coded
  `ceiling: undefined` and so would have discarded the new authored value. The general branch below
  it already read an optional ceiling, so removing the special case is the whole of the code change
  and no arithmetic moved.

### Cars to Respected, measured, per scene

Re-run of `sceneStandingRetuneProbes.test.ts` (20 tests, 400 generated lots over the 48-car
roster). "Cars" is deliberately-built-and-delivered attempts at 100% build execution, at the best
of the five measured build levels for that scene.

| scene | best rate (level) | `knownDeliveries` -> cars | `respectedDeliveries` -> cars |
| --- | ---: | ---: | ---: |
| collector | 30.8% (stock) | 2 -> 7 | 8 -> **27** |
| tuner | 36.0% (race) | 3 -> 9 | 9 -> **25** |
| show-crowd | 75.5% (sport) | 6 -> 8 | 17 -> **23** |
| racer | 32.0% (race) | 3 -> 10 | 8 -> **25** |
| daily-drivers | 42.8% (stock) | 4 -> 10 | 11 -> **26** |
| touge | 57.0% (targeted) | 4 -> 8 | 13 -> **23** |

**Respected spans 23 to 27 cars with a mean of 24.8**, against 14 to 33 before. Known spans 7 to 10
with a mean of 8.7.

**One row is a car off this doc's own prediction, and the reason is arithmetic in this doc, not in
the game.** The lever tables above computed their car counts from the rounded percentages printed
beside them; the probe divides by the raw fraction. Collector's rate is 123/400 = 0.3075, not
0.308, so `ceil(8 / 0.3075)` is 27 rather than the 26 predicted. The same rounding accounts for
Known landing at 10 rather than 9 for Racer and Daily Drivers, and 8 rather than 7 for Touge. No
lever value differs from the signed table.

**The definition of done's "17 to 22 cars" is not met and never could have been**: it contradicts
this doc's own lever table, which targets about 20 and reports a 23-to-26 span for the very same
values. Read against the table the sprint actually signed, the result lands where it was aimed.
Flagged rather than quietly reinterpreted.

### The four price rungs, shop front, matched exemplar per scene

As a multiple of the same physical car with no standing anywhere:

| scene | none | known | respected | shop |
| --- | ---: | ---: | ---: | ---: |
| collector | 1.000 | 1.080 | 1.142 | 1.212 |
| tuner | 1.000 | 1.080 | 1.139 | 1.208 |
| show-crowd | 1.000 | 1.080 | 1.170 | 1.250 |
| racer | 1.000 | 1.073 | 1.118 | 1.179 |
| daily-drivers | 1.000 | 1.080 | 1.149 | 1.222 |
| touge | 1.000 | 1.080 | 1.139 | 1.208 |

**Four distinct rungs in every scene**, where `none` and `known` were identical to the yen in all
six before. The probe now asserts strict increase rather than non-decrease, which is exactly the
defect this sprint fixed.

The 1.00 / 1.08 / 1.17 / 1.25 shape the lever table names is the ceiling ladder, reached only by a
car whose taste score is a perfect 1.0 - the Show Crowd row, which hits it exactly. Every other
exemplar scores below 1 and so reads lower on the top two rungs, since `respected` and `shop` price
LINEARLY from their floor up to their ceiling. `known` reads a flat 1.080 for five of the six
because its 1.08 ceiling binds at any score at or above 0.8; Racer's exemplar scores 0.765, so it
reads 1.073, just under the clamp.

In yen, on the same matched exemplars (`none` -> `known` -> `respected` -> `shop`):

| scene | model | none | known | respected | shop |
| --- | --- | ---: | ---: | ---: | ---: |
| collector | Datsun 510 Bluebird (PL510) | Y690,000 | Y745,200 | Y788,085 | Y836,297 |
| tuner | Toyota Aristo 3.0V (JZS147) | Y798,367 | Y862,236 | Y909,225 | Y964,053 |
| show-crowd | Nissan Silvia (S13) | Y555,440 | Y599,875 | Y649,865 | Y694,300 |
| racer | Nissan Skyline GT-R (BNR32) | Y3,786,144 | Y4,062,310 | Y4,233,800 | Y4,465,423 |
| daily-drivers | Honda City E (AA) | Y130,000 | Y140,400 | Y149,410 | Y158,832 |
| touge | Eunos Roadster (NA6CE) | Y503,426 | Y543,700 | Y573,529 | Y608,175 |

### The Known rung's limit, measured rather than assumed

New probe item 7 prices each scene's exemplar through every channel that reads a taste band at all,
at each stage. The mean Known gain over the six scenes, per channel:

| channel | own ceiling | Known's 1.08 | mean gain at Known |
| --- | ---: | --- | ---: |
| shop front | 1.00 | RAISES the ceiling | **+7.9%** |
| free ads paper | 1.05 | RAISES the ceiling | **+2.7%** |
| tuner magazine | 1.17 | ceiling inert | +0.4% |
| weekend meet | 1.17 | ceiling inert | +0.4% |
| collector network | 1.20 | ceiling inert | +0.4% |

**The recorded limit holds, with one correction worth keeping.** Known's CEILING is inert on the
three premium channels exactly as predicted: `Math.max` keeps their own higher ceiling, so the new
lever buys nothing there. But Known is not literally worth nothing on them, because its FLOOR
(0.92 against the standard 0.88) already lifted those channels before this sprint and still does,
by a mean 0.4%. The floor's contribution is `(0.92 - 0.88) x (1 - score)`, so it fades to exactly
zero for a perfect-scoring car: Show Crowd's exemplar reads 1.000 on all three premium channels,
literally nothing. **So the honest statement is that Known pays a real premium on the two cheap
channels and a rounding error on the three expensive ones**, which is the shape the lever table
intended ("standing pays most on the cheapest channels").

### Tests changed, with the directive 17 case for each

Every failure was case (a): this sprint intentionally changed what is correct. No case (b): nothing
caught a real regression, and no assertion was loosened.

- `packages/sim/tests/sceneStanding.test.ts`, five tests - read the thresholds as flat numbers
  (`knownDeliveries - 1`). Case (a), shape: each now reads the threshold for the scene it actually
  delivers to. The behaviour asserted (reaches the stage at exactly the threshold, never one short,
  never regresses, never vaults to The Shop on price alone) is unchanged.
- `packages/sim/tests/sceneStanding.test.ts`, one test ADDED - the new correct behaviour needed an
  assertion of its own: the same delivery count now buys different standing in different scenes
  (8 deliveries makes a shop Respected among Collectors and merely Known among the Show Crowd).
- `packages/sim/tests/sceneStandingRetuneProbes.test.ts`, item 2 - same shape change, plus the span
  and mean the sprint is judged on, reported rather than left to be read off six rows.
- `packages/sim/tests/sceneStandingRetuneProbes.test.ts`, item 5's monotonicity test. Case (a): it
  asserted `toBeGreaterThanOrEqual` between rungs, which was correct when `none` and `known` were
  identical and is now too weak to catch the defect returning. Tightened to `toBeGreaterThan`,
  which is structurally sound for any matched car (score >= 0.5) given the shipped band table.
- `packages/sim/tests/sceneStandingRetuneProbes.test.ts`, item 6b - its assertion was the tautology
  `expect(ECONOMY...knownDeliveries).toBe(knownDeliveries)`, comparing a value with itself. Replaced
  with the claim the test's own name makes: word of mouth reads exactly 1 for a scene at `none`.
- `packages/content/tests/economyApprovalGate.test.ts` - hash re-pinned, with both levers named and
  valued in its approval log, in the same change as the move (directive 22).

Housekeeping in the same file: the probe's stale "26 shipped cars" strings now read the roster's
own length, since the roster is 48 and its assertions always used `SHIPPED_MODELS.length` anyway.

### Not moved, as tabled

`marqueeBarYenByTier`, `wordOfMouthMultiplierByStage`, `rollingWindowDays`, `rollingWindowShareCap`
and `sceneCommissions.*` are all untouched. `rollingWindowShareCap`'s open mechanism question is
recorded in `TODO.md` under Open engineering, as this doc directed.

The probe re-run also refreshes item 3's joint Shop condition against the 48-car roster: collector
2, tuner 15, show-crowd 23, racer 11, daily-drivers 3, touge 12. Sprint 183's Collector dead top
rung (0 of 26) is no longer dead, which was the roster-scope diagnosis it recorded rather than a
lever problem. Daily Drivers at 3 of 48 still wants watching.
