# Sprint 183: the ladder was measured against a lie

**Status: PLANNED. Nothing implemented. Blocked on sprint 182.**

## Goal

Retune the scene-standing ladder against a definition of MATCHED that means something. **Every
number in it was calibrated when 94 per cent of untouched cars matched a scene**, so a threshold of
"3 matched deliveries" meant "sell three cars to anybody" rather than "build three cars somebody
wanted". Sprint 182 changes that; this sprint makes the ladder honest about it.

## This sprint measures BEFORE it proposes, and that ordering is the point

Directive 22 requires every lever value to be signed by name before implementation, and **no
honest value for any of these can be chosen before sprint 182 has been measured**. So this sprint
runs in two halves with a hard stop between them:

**Half one, measurement, needs no approval.** Re-run the three probes from sprint 182 against the
shipped post-182 content and answer, in numbers:

1. How often does a matched delivery actually happen now, per scene, across a realistic run?
2. How long does a player take to reach 3 and then 10 matched deliveries to one scene?
3. What share of deliveries can a player concentrate into one scene, which is what the rolling
   window's share cap prices?
4. Does the taste band's effect on price survive the change, or is it still swamped by parts bills?
   (The sprint 181 acceptance test found the confound and could not answer it.)

**Half one ends by tabling numbers to the maintainer. Implementation does not begin until they are
signed.** If half one shows the existing values are still right, that is a valid outcome and the
sprint closes without moving a lever.

## Reuse analysis (directive 16)

**No new mechanism at all.** Every system this sprint touches was built in sprints 177 to 179 and
works. This is a calibration pass plus a measurement, and the only code that could change is a
probe test.

**Existing mechanisms, and what each one's calibration now rests on:**

- `economy.sceneStandingProgress.knownDeliveries` / `respectedDeliveries` (3 and 10) - counts of an
  event that is about to become far rarer.
- `economy.sceneStandingProgress.marqueeBarYenByTier` (500k / 1.2m / 3m / 8m) - unaffected by the
  matched change in principle, since it is a price bar, but a Shop-stage promotion now needs a
  matched sale AND that price, so the joint probability moved.
- `economy.sceneStandingProgress.wordOfMouthMultiplierByStage` (1.4 / 1.8 / 2.4) and
  `rollingWindowShareCap` (1.5) - the share term prices concentration, and concentration is
  cheaper to achieve when fewer cars qualify anywhere.
- `economy.sceneStandingProgress.rollingWindowDays` (14).
- `economy.valuation.sceneStanding` bands (known floor 0.92; respected 0.95 / 1.17; shop
  0.95 / 1.25).
- `economy.valuation.matchedTasteScoreThreshold` (0.5) - see the open decision below.
- `economy.sceneCommissions.refreshIntervalDays` (7) and `payoutMultiplier` (1.25).

## Levers (directive 22)

**Deliberately empty at planning time.** Every candidate is named above; **not one carries a
proposed value**, because proposing one before half one runs would be inventing a number and
calling it evidence. The lever table is filled by half one's measurement and signed before half
two starts.

## Definition of done

- The measurement exists and is reproducible, as a committed probe rather than a one-off.
- Every lever that moved is listed by name and value with the maintainer's sign-off recorded.
- Every lever that did NOT move is listed too, with the measured reason it stayed, so a later
  sprint does not re-open a settled number.
- The scene-standing acceptance test from sprint 181 still passes, or its assertions are updated
  under directive 17 case (a) with the new correct behaviour stated.

## Deliberately not here

- **The reputation rework**, sprint 184.
- **Any change to the taste formula itself.** If half one shows sprint 182 overshot, that is a
  finding to report, not a thing to quietly correct here.

## Exit

**Half one only. No lever in `economy.json` moved. Nothing committed - awaiting the maintainer's
sign-off on the proposals below before half two begins.**

The deliverable is `packages/sim/tests/sceneStandingRetuneProbes.test.ts` (17 tests, all passing),
closed-form throughout: real `isTasteMatched`/`valuateCarForBuyer`/`valuateCarForBuyerViaChannel`/
`wordOfMouthMultiplierFor` calls against the 26 shipped cars and 400 generated auction lots (cycling
the roster exactly as `tasteMatchGradient.test.ts`, sprint182.md, does), at five build levels (stock
mint, street, sport, race, and a scene-targeted build - race-grade parts in only the slots that carry
a positive taxonomy weight on that scene's champion stat, mint elsewhere). No bot career, no RNG-driven
selling simulation anywhere (directive 21). `pnpm typecheck` clean, `npx eslint .` clean, all three
Vitest projects green (content 610/610, sim 2327/2327, game 945/945).

### 1. Match rate per scene, per build level (26 shipped cars / 400 generated lots)

| scene | arrival (lots) | stock mint | street | sport | race | targeted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| collector | 0.0% | 19.2% / 19.3% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 19.2% / 19.3% |
| tuner | 0.0% | 0.0% / 0.0% | 19.2% / 19.3% | 34.6% / 34.8% | 46.2% / 46.3% | 42.3% / 42.5% |
| show-crowd | 0.0% | 3.8% / 4.0% | 38.5% / 39.0% | 80.8% / 80.8% | 80.8% / 80.8% | 80.8% / 80.8% |
| racer | 0.0% | 0.0% / 0.0% | 7.7% / 7.8% | 26.9% / 27.0% | 42.3% / 42.5% | 26.9% / 26.8% |
| daily-drivers | 3.8% | 34.6% / 34.3% | 34.6% / 34.3% | 26.9% / 26.8% | 23.1% / 23.0% | 34.6% / 34.3% |
| touge | 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 26.9% / 27.0% | 61.5% / 61.8% | 73.1% / 73.3% |

(cell format: roster / lots; arrival is lots-only, the population `tasteMatchGradient.test.ts` already
measures in aggregate - 3.8% "any scene" there, reproduced here per-scene and attributable entirely to
daily-drivers, the only scene that ever matches an unrestored lot.)

Collector is a special case worth naming on its own: authenticity clears for almost every mint-stock
car (stockness is 1 with no aftermarket fitted, regardless of culture), so the champion GATE passes
broadly, but the OVERALL weighted mean (style importance 0.4, second only to authenticity's 1) still
fails most of the roster - low-`styleBase` shipped cars and low-affinity cultures both drag the final
score under 0.5. Any aftermarket at all (street/sport/race, uniform) destroys stockness and collapses
the match to 0%: **there is no build lever that helps a Collector car** - the only thing that helps is
not touching it, which is why `targeted` and `stock` are identical for this scene by construction.
Daily-drivers has the same shape for the same underlying reason (reliability is best at zero build
intensity), and its `race`-level dip (23.0%, below even `sport`) is the aftermarket stress tax on
reliability actually biting.

For Tuner and Racer, the uniform `race` build outperforms the isolated `targeted` build (46.3% vs
42.5%; 42.5% vs 26.8%) - both buyers weight handling heavily too (Racer: 0.9, second only to power's
1), so a full build clears the OVERALL threshold more often than a champion-only build even though
both clear the gate equally. For Touge the reverse holds (73.3% targeted vs 61.8% race) because Touge's
power `upper` (0.55) punishes the extra power a uniform race build adds. **Item 2 below uses the best
of all five measured levels per scene, not the isolated targeted figure, for exactly this reason.**

### 2. What knownDeliveries (3) and respectedDeliveries (10) now mean in cars

| scene | best rate (level) | reachable at all (roster) | cars for Known (3) | cars for Respected (10) |
| --- | ---: | ---: | ---: | ---: |
| collector | 19.3% (stock) | 19.2% | 16 | 52 |
| tuner | 46.3% (race) | 46.2% | 7 | 22 |
| show-crowd | 80.8% (sport) | 80.8% | 4 | 13 |
| racer | 42.5% (race) | 42.3% | 8 | 24 |
| daily-drivers | 34.3% (stock) | 34.6% | 9 | 30 |
| touge | 73.3% (targeted) | 73.1% | 5 | 14 |

Every scene is reachable in principle (no 0% row), so no threshold is literally impossible - but
Collector's 52-cars-for-Respected is a different game than Show Crowd's 13, and the ladder was
calibrated as one shared pair of numbers (3 and 10) for all six scenes alike. "Cars" here means
cars that reach the best available build for that scene and are then sold MATCHED - not cars
bought, since a player who misses still owns the car and can try again; it is the number of
deliberately-built-and-delivered attempts the base rate implies, at 100% build-execution.

### 3. The Shop stage's joint condition (matched AND clears the marquee bar)

| scene | shipped cars clearing both (of 26) |
| --- | ---: |
| collector | **0** |
| tuner | 9 |
| show-crowd | 10 |
| racer | 6 |
| daily-drivers | 1 |
| touge | 5 |

Price used is `valuateCarForBuyer` (this buyer's own uncapped valuation) - a CEILING on a real sale
price, since an actual walk-in offer is priced through a channel band and a quality-draw fraction
that can only price it lower. So this measures whether the joint condition is reachable AT ALL, not
that a real sale would clear it - the true figures can only be equal or worse.

**Collector's Shop stage is a dead top rung on the shipped 26-car subset: 0 of 26.** Diagnosis, not
just a number: the shipped roster has no genuine collector-culture flagship (no kyusha/exotic
classic), and the highest-value shipped cars are 90s performance icons like the Supra/GT-R/RX-7,
which are poor authenticity matches for a buyer whose champion is authenticity at 0.9. This reads as
much like a **roster scope gap** as a threshold-calibration problem: the wider 94-car roster
(`midnight-garage-roster.md`) does carry cars built for exactly this scene, they are simply not
shipped in `cars.json` yet. Daily-drivers is nearly as thin (1 of 26): the one qualifying car both
matches on reliability and clears the entry-tier bar (500k) once built up, but the margin for error
is a single car.

### 4. The rolling window's share cap (rollingWindowShareCap 1.5, rollingWindowDays 14)

Structurally confirmed (two tests): a single matched delivery, alone in its 14-day window, already
reaches the FULL 1.5x cap - this held before sprint182.md too (`sceneStanding.test.ts`'s own
"exclusive" case). What changed is the denominator: the cap is only DILUTED when a second scene also
lands a matched sale inside the same window, and item 1's own numbers say a matched sale to any one
scene is now the rare event (arrival match rates of 0.0-3.8% per scene). No selling-cadence figure is
estimated (that would need a bot-career-shaped simulation, forbidden by directive 21), but the
structural conclusion is real: **reaching the full cap now requires LESS deliberate single-scene focus
than the cap was calibrated to price.** A player who happens to land one matched sale, to whichever
scene, inside two weeks reads as "worked exclusively" by the formula, because there is usually nothing
else recent to dilute it against.

### 5. Standing's per-stage effect on a REALISED sale price (yen)

One matched exemplar per scene (the shipped model with the highest culture affinity among those whose
scene-targeted build genuinely clears the gate), priced through the shop front channel
(`tasteCeiling` 1.0) via `valuateCarForBuyerViaChannel`, standing held fixed except for the stage under
test - so, unlike sprint181.md's own acceptance test, there is NO parts-bill confound here: it is the
same physical car in all four columns.

| scene | model | none | known | respected | shop | swing (shop vs none) | parts-bill delta, same car |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| collector | Toyota Sera (EXY10) | Y340,000 | Y340,000 | Y384,699 | Y407,135 | +19.7% (Y67,135) | Y0 |
| tuner | Toyota Supra RZ (JZA80) | Y3,549,614 | Y3,549,614 | Y4,082,991 | Y4,341,485 | +22.3% (Y791,871) | Y397,004 |
| show-crowd | Nissan 180SX (RPS13) | Y957,900 | Y957,900 | Y1,120,743 | Y1,197,375 | +25.0% (Y239,475) | Y207,900 |
| racer | Nissan Skyline GT-R (BNR32) | Y3,786,144 | Y3,786,144 | Y4,233,800 | Y4,465,423 | +17.9% (Y679,279) | Y286,144 |
| daily-drivers | Honda City E (AA) | Y130,000 | Y130,000 | Y149,410 | Y158,832 | +22.2% (Y28,832) | Y0 |
| touge | Honda Civic SiR-II (EG6) | Y713,426 | Y713,426 | Y818,621 | Y869,846 | +21.9% (Y156,420) | Y63,426 |

**Yes, visible - a real 18-25% swing in yen on a fixed car, comparable in size to (and for four of the
six scenes, larger than) the parts-bill cost of the build itself.** The mechanism is now genuinely
readable, not swamped. One nuance the table itself shows: `none` and `known` are IDENTICAL in every
row. `known`'s only lever is a higher floor (0.92 vs the standard 0.88), which only matters for a
car scoring low enough that the floor binds; every exemplar here scores high enough that the channel's
own ceiling (1.0) clamps both stages to the same number. **The standing price effect is concentrated
at Respected and Shop** (where the scene's own ceiling, 1.17/1.25, finally exceeds the channel's and
stops being clamped) - Known currently buys a genuinely matched, high-scoring car nothing in price at
all.

### 6. What the gate touches beyond the matched predicate

- **Scene commissions' champion requirement is algebraically identical to the gate's champion check**
  - proved directly (not just asserted) across 6 shipped models x 5 build levels x 6 scenes: the
  raw-scale `statThreshold >= target*100` (or `target*powerNormalizationCeiling` for power) and the
  normalized `scoreByStat[champion] >= target` never disagreed once. A commission-eligible car is
  always also gate-matched for that scene, and vice versa - by construction, not coincidence.
- **Commissions are not zeroed by culture, only nudged.** The gate can zero the matched PREDICATE
  outright, but a commission never calls it - it only checks the raw champion threshold. Once that
  passes, the payout (`payoutMultiplier x valuateCarForBuyer`) still reads culture through
  `tasteMultiplier`, which is bounded to [1 - tasteSpread, 1 + tasteSpread] = [0.88x, 1.12x]
  regardless of how bad the culture match is. A Collector commission on a worst-culture
  (honest-transport, 0.2) car still pays at worst 0.88x fair value, never zero.
- **Word of mouth is inert (flat 1x) for exactly as long as item 2's "cars for Known" column says** -
  4 to 16 delivered cars depending on scene, before the 1.4x Known multiplier can even begin. This is
  the same fact as item 2, restated as a pacing consequence rather than re-measured.
- **The Racer scene commission can demand strictly more power than the plain taste gate once the
  power-expectation chain has climbed** (measured: ordinary gate requirement 450 PS vs a climbed-chain
  bar of 594 PS after a 600 PS delivery held for two steps) - a pre-existing interaction
  (`currentPowerExpectationBarPs`), unaffected by sprint182.md, but worth naming: commission and gate
  are only guaranteed to ask the same thing at the START of a career.

---

## UNSIGNED PROPOSALS (not implemented - for maintainer sign-off before half two)

For every lever named in the sprint brief, with the measured reason:

| lever | current | recommendation | measured reason |
| --- | --- | --- | --- |
| `sceneStandingProgress.knownDeliveries` | 3 | **RAISE, but only after the roster scope question below is answered** | Item 2's 3-figure now ranges 4 (show-crowd) to 16 (collector) delivered cars depending on scene - the SAME number of matched deliveries buys wildly different standing depending on which scene a player happens to be building for. A flat 3 was calibrated when match was ~94%; it is not obviously still the right shared number, but the honest fix may be per-scene rather than a single new flat value, which needs a design call, not just an arithmetic one. |
| `sceneStandingProgress.respectedDeliveries` | 10 | **Same open question as above, more acutely** - 13 (show-crowd) to 52 (collector) cars | 52 deliberately-built Collector cars to reach Respected is a materially different game than 13 Show Crowd cars for the identical stage name. Whether that spread is acceptable (each scene earns its own pacing) or needs correcting is a design decision the maintainer should make with these numbers in hand, not one this measurement should pre-empt. |
| `marqueeBarYenByTier` (500k/1.2m/3m/8m) | as shipped | **DO NOT move on this evidence alone** | The bars themselves are not shown to be wrong - Collector's 0/26 joint-clear is better explained by a roster CONTENT gap (no shipped kyusha/exotic flagship) than by the yen bar being miscalibrated. Lowering the bar to rescue Collector's Shop stage would be tuning around a missing car rather than fixing the actual gap; shipping more of the already-authored 94-car roster is the fix this evidence points to. |
| `wordOfMouthMultiplierByStage` (1.4/1.8/2.4) | as shipped | **DO NOT move** | Nothing measured here shows these three numbers are wrong in themselves - what changed is how LONG it takes to reach the stage that unlocks them (item 2/6), not what they're worth once unlocked. That is a `knownDeliveries`/`respectedDeliveries` question, not a multiplier question. |
| `rollingWindowShareCap` (1.5) | as shipped | **DO NOT move on this evidence alone, but flag for design attention** | The cap is now trivially reachable by a single isolated sale (item 4) rather than requiring genuine sustained concentration - that is a real behavioural change, but whether the fix is a smaller cap, a minimum-delivery-count gate before the cap applies, or leaving it (concentration is still directionally rewarded, just cheaply) is a design call this measurement surfaces rather than settles. |
| `rollingWindowDays` (14) | as shipped | **DO NOT move** | No measurement here shows 14 days specifically is wrong; the share-cap finding above is about the formula's reachability, not the window length. |
| `valuation.sceneStanding` bands (known 0.92; respected 0.95/1.17; shop 0.95/1.25) | as shipped | **DO NOT move; but note Known's floor is currently invisible on a well-scoring matched car** | Item 5 shows `none` and `known` producing an IDENTICAL price whenever the channel's own ceiling (commonly 1.0-1.12) clamps both stages before the 0.92 floor would ever bind. This is a real dead step for a car that scores well, but it is a fact about how the channel ceiling and the Known floor interact, not evidence the 0.92 number itself is wrong - raising it further would only matter for the low-scoring cars it already helps. |
| `matchedTasteScoreThreshold` (0.5) | as shipped | **DO NOT move** | This was ruled explicitly by the maintainer in sprint182.md ("RULED: the folded formulation, one threshold") and re-measured there against the approved figures (9/37/89 per cent). Nothing in this file's measurement bears on that threshold specifically - the base-rate change it produced is exactly the expected, approved effect, not a new problem with the number itself. |
| `sceneCommissions.refreshIntervalDays` (7) | as shipped | **DO NOT move** | Commissions are gated on reaching Respected, which item 2 already shows is now slow (13-52 cars) - but once a scene IS Respected, nothing measured here says a 7-day refresh cadence for an unaccepted offer is now wrong. That is a question about content variety at the board, unrelated to the champion gate. |
| `sceneCommissions.payoutMultiplier` (1.25) | as shipped | **DO NOT move** | Item 6 shows a commission's payout is bounded to [0.88x, 1.12x] of fair value by culture regardless of the gate, and the gate does not touch the multiplier itself at all (1.25 is untouched arithmetic). Nothing measured connects sprint182.md's change to this specific number. |

**The one thing this half cannot settle on its own:** whether `knownDeliveries`/`respectedDeliveries`
should become PER-SCENE values (closing the 4-vs-16 and 13-vs-52 spreads) or stay a single shared pair
that different scenes simply climb at different speeds (which is arguably fine - Collector was always
meant to be the slow, rare scene). That is a design call, not an arithmetic one, and it is the
recommended first question to put to the maintainer before any specific replacement number is proposed
for either lever.
