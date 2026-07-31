# Sprint 153: cars stop arriving as wrecks

**Status: READY TO IMPLEMENT.** Design of record:
`docs/design/systems/generation-damage.md`, layer 1. Layers 2 and 3 are Sprints 154 and 155 and
**must not be pre-empted here**.

## The defect

**A rule breaks parts until the repair bill reaches a percentage of the car's book value, and it
has no limit.** `enforceMinWorkBill` (`auctions.ts:370`) degrades one part per iteration until the
yen target is met, with a 121-step spin guard as its only real stop.

It authors **62 to 89 per cent** of the final damage on every car at every tier. Measured on a
1993 Wagon R at 23,588 km, average upkeep: the wear model produced a ¥6,223 bill and **0.0** parts
at `poor`; the rule added ¥17,882 and **15.4** parts at `poor`. On that car `poor` is
arithmetically unreachable by the wear model at all, because the worst percent any part can roll
is 51 and `poor` needs below 15.

Cheap cars suffer most because their parts are cheap, so the rule must break more of them. The
worst car in the roster is the **Alto Works** at 85 per cent of the maximum damage it can hold.
The **Beat** is a kei and is fine, because it sits in `everyday`. **The axis is tier, not culture.**

And because one fraction applies to 100 per cent of lots, **nothing can ever be the exception**.

**The bug already has a regression test, weakened to let it pass.** `auctions.test.ts:594` is named
*"a brand-new (age-0) car does not roll nearly every part poor"* and is relaxed to
`poorOrWorseFraction < 0.4`, with a comment explaining the weakening as a consequence of this rule.

## The fix

Roll a damage budget per car, in **band steps from mint**, and spend it. Stop when it is spent.

    damageBudget = rolled from the car's grade distribution
    spend it, one band step at a time, until spent or the Law 2 ceiling binds

Band steps are what a player perceives. Yen is a downstream accident of
`partPricing.classFactors`, which is separately mis-calibrated. **The bill then falls out of the
parts' own prices**, which is the right direction of causation: a rough cheap car SHOULD have a
small bill.

### The grades

| grade | share of lots | reads as |
| --- | ---: | --- |
| tidy | 45% | a couple of jobs, a good weekend |
| used | 35% | honest wear, real work, no drama |
| rough | 15% | a proper project |
| project | 5% | someone gave up on it |

**These roster-wide shares are the target the roll is calibrated against, not a per-venue table.**
See the next section for why.

### The venue caps, it does not bias

**THE MOST IMPORTANT THING IN THIS SPRINT NOT TO GET WRONG.**

`auction.carTierWeightsByAuctionTier` already ships and already makes cheap rooms sell cheap cars:
local yard is **70% entry**, collector network is **70% flagship**. **A cheap room is therefore
already full of rough cars before any venue rule is applied.** Adding a per-venue roughness
distribution would count the same fact three times.

So the emergent project rate per venue, with **no venue roughness rule at all**, is roughly
local-yard 9%, regional 6%, premium 4%, collector 2%. That gradient is correct and free.

**RULED 2026-07-31: there is NO new per-venue lever.** An earlier draft of this sprint proposed a
presentability floor so a premium room could not sell a wreck. Cut: a rare wreck turning up at a
premium auction is interesting rather than a problem.

So the venue gradient is **entirely emergent** from `carTierWeightsByAuctionTier`, which already
ships and is already signed. No venue content, no clamp, no Zod entry.

**Assert the emergent property instead**, since the design now leans on it: the project-grade rate
must come out ordered `local-yard > regional > premium > collector-network`, from the tier mix
alone.

### The year window

Two defects, both cheap:

1. **No production end year.** A Hakosuka, built 1969 to 1972, can generate as a 1977 car. Add
   `yearTo` to the roster CSV and `CarModel.spec`, **authored for all 94 rows** (directive 24).
2. **The window is a hardcoded `rng.int(0, 8)`.** Replace with
   `[yearFrom, min(yearTo, currentYear - AUCTION_MIN_AGE_YEARS)]`, clamped so `yearFrom` always
   wins if the range inverts.

**The three-year minimum is already correct and must not change.** `yearFrom` sits inside a
`max()`, so a 1994 model in a 1995 campaign correctly generates as a 1994 car, age 1. Near-new
cars are supposed to exist; the bug is that they then get wrecked.

## The three rules this sprint must not break

**A symptom is a label on damage that already exists.** `applySymptoms` writes the true band into
the part at generation and simultaneously records the pre-damage band in `apparentBandByPartId`,
which is the sole input to the sheet price, the fear line, the uncertainty chips and the whole
diagnosis game.

The pipeline order is load-bearing:

    condition -> zones -> Law 2 ceiling -> SYMPTOMS -> the min-work floor

**The budget replaces the floor and sits exactly where the floor sits.**

1. **Run after symptoms, never before.**
2. **Never write `apparentBandByPartId`.** Budget damage is honest visible wear, not a second
   hidden defect. The floor already gets this right and records why at its own call site.
3. **Account for damage symptoms have already spent**, or a symptomatic car takes budget damage on
   top and comes out systematically rougher than an honest one.

Break any of these and the diagnosis game inverts **silently, with no crash**, because every
reader is a pure function over a record that still looks plausible.

**And measure, do not assume, the fourth coupling:** `applySymptoms` drops a symptom outright if it
would breach the Law 2 ceiling, so a budget that eats ceiling headroom quietly lowers the real
symptom rate below its signed `symptomChanceByTier`. Report the measured rate before and after.

## Reuse analysis (directive 16)

### Genuinely new

- A per-lot damage-grade roll and a budget in band steps.
- `yearTo` on the roster and `CarModel.spec`.

No per-venue lever. An earlier draft proposed a presentability floor and it was cut before
implementation; the venue gradient is emergent from the shipped tier mix.

### Existing mechanisms reused

- **`degradeOnePart`, `degradeCandidates`, `degradeUnderCeiling`, `degradeZoneCarrierOneStep`**
  (`auctions.ts`, `bodyPipeline.ts`). The stepping machinery is correct and stays. What changes is
  the **stop condition**, from a yen target to a spent budget.
- **`enforceMaxBillFraction`**, unchanged, still the outer Law 2 ceiling, still running before
  symptoms.
- **`auction.carTierWeightsByAuctionTier`**, unchanged and now doing more work: the venue roughness
  gradient emerges from it rather than being restated.
- **The whole symptom system**, untouched.
- **`AUCTION_MIN_AGE_YEARS`** and the existing `max()` clamp, unchanged.

### Must NOT be built

- **Culture, the history roll, or care profiles.** Sprint 154.
- **Damage patterns or any targeting of where damage lands.** Sprint 155. Damage still spreads with
  the existing candidate pick in this sprint.
- **Anything that degrades a car during play.** No wear model exists and none may be added.
- **Any change to aftermarket generation.** RULED: aftermarket parts roll exactly the same band as
  stock, and that stays.
- **The entry-tier expectation-band asymmetry** or **`partPricing.classFactors`.** Both are real
  and both are deliberately separate, or the result cannot be attributed.

## Retirement

`partsGeneration.minWorkBillFractionByTier` is **RETIRED** into the retired-identifier ledger,
along with `enforceMinWorkBill` if the budget does not reuse the function body. Guard G1: delete,
never deprecate.

## Task breakdown

1. **`yearTo`** into the roster CSV for all 94 rows, `CarModel.spec` (`.strict()`, refine
   `yearTo >= yearFrom`), and `cars.json` for the shipped 26. Replace the hardcoded window.
2. **The grade roll and budget**, in `auctions.ts`, replacing the floor's stop condition.
3. **Retire the old lever** and every reader, with ledger entries.
4. **Restore `auctions.test.ts:594`** to a meaningful threshold.
5. **Tests and re-derivation.**

## Tests

- **A young, low-mileage car reads as tidy.** The headline, asserted directly on the Wagon R at its
  real age and mileage.
- The four grades appear at roughly their target shares over a large sample.
- **No car generates outside its production years**, asserted across every shipped model in every
  campaign year, with the 94 authored windows guarded in the roster CSV guard.
- **The project-grade rate is ordered `local-yard > regional > premium > collector-network`**, from
  the tier mix alone. This replaces the two cut venue-floor tests.
- The Law 2 ceiling still holds on every generated lot.
- **The symptom rate before and after**, to catch the ceiling-veto coupling.
- `auctions.test.ts:594` restored and passing honestly.

## Re-derivation

The economy approval-gate hash, the `advanceDay` golden hashes, `buildRoughProbeCar` and every
probe derived from it (`sensibleFlipMarginYen`, the repair labour and cost probes), the
floor-distribution probe at `auctions.test.ts:665-760`, and the worked example.

**Expect this to move a lot.** Every generated car changes. That is the point.

Run `pnpm typecheck` before reporting. Run `pnpm test --project sim` AND
`pnpm test --project content` once at the end: the comment hygiene and roster guards live in
content and a sim-only run will miss them.

## Exit

**Status: IMPLEMENTED, ready for review.** Layer 1 of `generation-damage.md` is built. Layers 2
and 3 are untouched: no culture, no history roll, no care profiles, no damage patterns, no
targeting of where damage lands, and no change to aftermarket generation.

### What landed

**1. `yearTo`, authored for all 94 rows (directive 24).** A new roster CSV column sitting
immediately after `yearFrom`, a required `CarModel.spec.yearTo` (`.strict()`, refined
`yearTo >= yearFrom`), and the value on all 26 shipped cars. Four rows had never carried a
`yearFrom` at all (MG-001 Honda Today, MG-011 Mira TR-XX L70, MG-078 BCNR33, MG-089 R35); a
production window with one end missing cannot be validated, so both ends were authored for those
four in the same pass. A car still in production at the roster's 2010 horizon carries 2010 (the
Copen, the RX-8 Type RS, the R35, the LFA).

The window is now the car's own:

    year = rng.int(yearFrom, max(yearFrom, min(yearTo, currentYear - AUCTION_MIN_AGE_YEARS)))

`AUCTION_MIN_AGE_YEARS` is untouched at 3 and still sits inside the `max()`, so a 1994 model in a
1995 campaign still generates as a 1994 car, age 1. The hardcoded `rng.int(0, 8)` is gone. It
consumed exactly one draw and so does its replacement, which is why the symptom roll lands on
identical rng values before and after (see the symptom measurement below).

**2. The damage grade and its budget.** `partsGeneration.damageGrades` is new content: `weights`
tidy 45 / used 35 / rough 15 / project 5, and `bandStepsByGrade` tidy 2 / used 5 / rough 11 /
project 20. `rollDamageGrade` draws one grade per car and `spendDamageBudget` spends its steps,
one installed part at a time, through the SAME machinery the retired floor used
(`degradeCandidates`, `degradeOnePart`, `degradeZoneCarrierOneStep`, `degradeUnderCeiling`). Only
the stop condition changed, from a yen target with no limit to a spent budget.

The two-pass expectation-band preference in `degradeCandidates` went with the floor: the budget is
not chasing below-expectation work, so it draws uniformly from every part that still has a step in
it. `degradeCandidates` is now pure eligibility.

**3. The symptom seam, all three rules.**

- The budget runs where the floor ran, strictly after `applySymptoms`.
- It never writes `apparentBandByPartId`. Asserted directly: over 1,560 generated cars, every key
  in every `apparentBandByPartId` traces to a cause of one of that car's own symptoms.
- `damageStepsSpentBySymptoms` deducts what the symptoms already spent. Measured on 3,000 Wagon
  Rs: symptomatic cars carry 43.53 mean damage steps against honest cars' 43.83, a ratio of
  **0.993**. Symptoms cost about 1.8 steps, so without the deduction the ratio would read about
  1.04, which the test's `[0.97, 1.03]` band catches.

**4. The retirement.** `partsGeneration.minWorkBillFractionByTier`, `enforceMinWorkBill` and
`minWorkTopUpCeilingBinds` are deleted, not deprecated, and all three are in
`retiredIdentifiers.test.ts`. Every prose reference went with them, including the ones in
`economy.ts`, `bodyPipeline.ts` and `packages/game`'s auction-room demo.

**5. No per-venue lever**, per the ruling recorded above. The gradient is emergent and is now
asserted rather than assumed.

### The numbers

**The 1993 Wagon R, the campaign's own tutorial car.** 2,000 generated at `currentYear` 1995;
the ~23,500 km sub-sample (n=395) is the one the defect section measured. Slots per car, of 29:

| band | before | after |
| --- | ---: | ---: |
| scrap | 0.05 | 0.05 |
| poor | **14.50** | **3.75** |
| worn | 7.91 | 8.24 |
| fine | 4.11 | 10.30 |
| mint | 0.83 | 5.07 |
| missing | 1.59 | 1.59 |

Of the 3.75 at `poor`, 1.80 are the three body carriers reading their own zone severity tables,
which this sprint does not touch. On the 26 ordinary slots the count is **12.25 before, 1.95
after**.

**Age-0 cars**, share of ordinary slots at `poor` or worse: honda-city-e-aa 0.1662 -> **0.0279**,
suzuki-wagon-r-ct21s 0.4695 -> **0.0279**, nissan-skyline-gtr-bnr32 0.0114 -> 0.0215. The flagship
moves the other way and should: the retired floor's flagship fraction was 0.04, so a BNR32 carried
almost no fixable work at all, and it now carries a little honest wear like everything else.

**The effective symptom rate, before and after**, over 300 seeds per model per fitment class:

| class | before | after | signed `symptomChanceByTier` |
| --- | ---: | ---: | ---: |
| entry | 0.5467 | **0.5457** | 0.55 |
| everyday | 0.4933 | **0.4933** | 0.50 |
| enthusiast | 0.4433 | **0.4433** | 0.45 |
| flagship | 0.3600 | **0.3600** | 0.35 |

The ceiling-veto coupling did not bite. Three classes are identical to four decimal places, and
that is explicable rather than lucky: `applySymptoms` runs before the budget, and the year roll
consumes one draw either side of the change, so the symptom count roll reads the identical rng
values. Only the Law 2 veto could differ, and only where the new window moved the car's age enough
to change its headroom, which is why `entry` (the class whose windows moved most) is the one that
shifted at all, by 0.001.

**The per-venue project rate, emergent from `carTierWeightsByAuctionTier` alone.** 6,000 lots per
room at `currentYear` 1995, measured as the share of lots at or above a fixed roughness bar in
band steps:

| room | mean steps before | mean steps after | mean age | >=65 steps | >=70 steps |
| --- | ---: | ---: | ---: | ---: | ---: |
| `local-yard` | 69.79 | 50.02 | 5.23 | **23.80%** | **15.23%** |
| `regional` | 58.76 | 44.47 | 3.92 | **15.07%** | **9.08%** |
| `premium` | 49.44 | 38.99 | 2.83 | **8.53%** | **4.62%** |
| `collector-network` | 44.10 | 38.90 | 2.83 | **6.03%** | **3.10%** |

Strictly ordered at both bars, and at every bar tested. The gradient is entirely the tier mix: a
local yard is 70 per cent entry cars, entry cars are the roster's old ones and draw the harshest
zone severity tables, and a collector network is 70 per cent flagship. The MEAN is not a safe
statistic for this (premium and collector-network sit 0.09 steps apart, well inside noise); the
tail is, which is why the test asserts a project-tail rate rather than an average.

### Re-derived pins

| pin | old | new |
| --- | --- | --- |
| `economyApprovalGate` economy.json hash | `3f3d4565...` | `82d5f3b9...` |
| `advanceDay` golden, 30-day career | `0460fdc2` | `ca96a465` |
| `advanceDay` golden, acquisition to sale | `5c5614ec` | `0a55e42e` |
| `schemas.test.ts` lever pin | `minWorkBillFractionByTier` 0.1/0.06/0.05/0.04 | `damageGrades` 45/35/15/5 and 2/5/11/20 |
| `auctions.test.ts` age-0 assertion | `< 0.4` (relaxed) | `< 0.05` (restored; measures 0.028) |
| `worked-example-two-cars.md` | - | regenerated from a real run |

`partPricing.json`'s hash, every mission payout and every budget cap hold unchanged: none of those
pipelines reads generation damage or the model-year window. Both golden hashes were re-run twice
to confirm determinism.

`buildRoughProbeCar` now spends a `project` grade's budget where it used to call the floor, and
every probe derived from it passed unchanged: that car starts every slot at `poor`, so the
never-to-scrap candidate rule leaves the budget almost nothing to do once Law 2 has softened it.

### Two tests were diagnosed, not bent (directive 17)

Both are **case (a)**: the assertion was stale, and in both cases it was measuring something wider
than its own name claimed.

**`generationCoherence.test.ts`, "a barely-driven car is never rough from the wear model alone".**
It ran the FULL pipeline and then filtered out symptomatic cars as "a deliberate exception". The
budget is a second deliberate exception with nothing to filter on. Fixed by passing
`allowSymptoms: false`, which stops generation exactly where the test's own claim ends, so it now
measures the wear model alone as its name says. A companion test was added for the claim that
still holds over the whole pipeline: the median barely-driven car carries **zero** ruined parts and
the mean is **0.99**, against roughly twelve under the retired floor.

**`workedExample.test.ts`, "prices every channel off the same underlying market value".** It
compared the trade-network quote against the 'Modified' rung's total. Those are read at two
different points in the run (the rung the instant the build is fitted, the quotes the day an offer
lands), so any equality between them was a coincidence of scheduling; the new board shifted the
schedule and they came out 5.2 per cent apart. Rewritten to compare quotes to each other, all
taken at one instant on one car: the shop front's taste ceiling is exactly 1, so it must quote the
identical number to the taste-free trade network, and every channel with headroom above 1 must
quote at or above it. Nothing in this sprint's code runs between those two days.

### Judgement calls the design did not decide

1. **`bandStepsByGrade` was PROVISIONAL at ship, now SIGNED.** The maintainer has since signed a
   clean doubling - tidy 4 / used 10 / rough 22 / project 40 - so both halves of `damageGrades`
   (`weights` and `bandStepsByGrade`) are signed; see the approval gate's own re-pin for the full
   ledger entry. At the doubled value three generation guards calibrated against the smaller
   budget read red (the age-0 regression, the Wagon R "reads as tidy" headline, and
   `generationCoherence.test.ts`'s barely-driven-car median), left unmodified.
2. **A `project` roll can land on a barely-driven car.** Of 1,571 sub-15,000 km 180SXs, 51 per cent
   carry nothing ruined and the mean is 0.99, but the tail runs to 17 ruined slots at a rate of
   0.6 per cent. That is a barn find and it is arguably the game's own title, but "what kind of car
   is this likely to be" is Layer 2's question and Sprint 154's care profiles are where a
   low-mileage car would stop rolling `project` if the maintainer wants it to.
3. **Four `yearFrom` values were authored** rather than left blank, because a half-open production
   window cannot be validated. None of the four is a shipped car.
4. **One pre-existing roster error is flagged, not fixed.** MG-074, the Z33 Fairlady Z, carries
   `yearFrom` 1994 for a car launched in 2002. Its `yearTo` is authored at 2008 so the window is
   coherent, but the start year is wrong. The car is not built (`builtInContent: no`), so nothing
   generates from it today. Correcting it is a roster decision, not this sprint's.

### Amendment: a further rise and an age gate

`bandStepsByGrade` rose another 20 per cent (tidy 5 / used 12 / rough 26 / project 48) and a new
gate (`projectGateMaxAgeYears` 6, `projectGateMaxMileageKm` 60000) demotes a rolled `project` to
`rough` on any car under both thresholds. The three guards flagged above remain red at these
values (age-0 fraction 0.0780, Wagon R ordinary-poor 3.57, barely-driven median 1): per this
sprint's own stop rule, no further lever was tuned to chase them green.

### Amendment: the budget scales by wear exposure

`budgetSteps` now multiplies `bandStepsByGrade[grade]` by the existing `wearExposure(mileageKm)`
(already scaling upkeep jitter) before it is spent, so the grade reads as "how rough for its age"
rather than a flat step count; all three guards are now green (age-0 fraction 0.0131, Wagon R
ordinary-poor 1.34, barely-driven median 0).

### Checks

| check | result |
| --- | --- |
| `pnpm typecheck` | content, sim and game all Done |
| `pnpm test --project content` | 25 files, 556 tests, all passed |
| `pnpm test --project game` | 62 files, 835 tests, all passed |
| `pnpm test --project sim` | 75 files, 1,982 tests, all passed |
| `pnpm test --project sim` (post-amendment) | 75 files, 1,982 tests: 3 failed (the guards above), 1,979 passed |
