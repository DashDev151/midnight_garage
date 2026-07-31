# Sprint 154: a car has a history

**Status: READY TO IMPLEMENT.** Design of record:
`docs/design/systems/generation-damage.md`, layer 2. Layer 3 (damage patterns) is Sprint 155 and
**must not be pre-empted**.

## The defect

**Every car in the game was treated the same way by its previous owner.**

`partsGeneration.upkeepTierWeights` is `neglected 0.25 / average 0.50 / cherished 0.25`, one flat
table applied to a Toyota 2000GT and a Honda Acty alike. Nothing about what a car IS changes how
likely it is to have been looked after.

And **`culture` does not exist in `packages/` at all.** It is authored for all 94 roster rows
(Kei, Drift, Wangan, Kyusha, Rotary, Touge, Exotic, Kurokan, Honest transport, Rally-bred,
Touring car, Front-drive tuner, Oddball) and lives only in the CSV and the roster legend.

The maintainer's framing: *"the off roading culture is more likely to drive their cars hard than
the exotics crowd. Nobody is fucking up a 2000gt, nobody is handling an acty with white gloves."*

## The fix

**A car gets a history, rolled at generation, and the history is the cause of everything else.**

    culture + tier  ->  care profile  ->  history roll  ->  damage grade distribution
                                                        ->  the aftermarket roll

**History is the cause; the damage and the aftermarket parts are both effects.** That direction
matters and an earlier draft had it backwards, inferring "was this driven hard" from the
aftermarket parts fitted. That is circular: the aftermarket roll has no reason to correlate with
anything. Rolling the history first and letting it drive both means a drifted S13 gets drift wear
**and** is likely to carry drift parts, because one caused the other.

It also answers the salaryman problem directly. A Chaser is a drift platform, but one that
commuted for fifteen years rolls `commuted`, gets commuter wear, and carries no drift parts.

### Care profiles

Culture decides the profile; tier shifts it one step (flagship toward cherished, entry toward
worked; everyday and enthusiast sit where culture puts them).

| profile | cultures | tidy | used | rough | project |
| --- | --- | ---: | ---: | ---: | ---: |
| **cherished** | Exotic, Kyusha | 70 | 25 | 5 | 0 |
| **enthusiast** | Wangan, Touge, Rotary, Touring car | 50 | 35 | 13 | 2 |
| **mixed** | Front-drive tuner, Oddball | 45 | 35 | 15 | 5 |
| **hammered** | Drift, Rally-bred, Kurokan | 25 | 35 | 30 | 10 |
| **worked** | Honest transport, Kei | 20 | 35 | 33 | 12 |

These replace the flat `damageGrades.weights` of 45/35/15/5 as the source of the grade roll. The
roster-wide average should land near the old flat table; **check it and report, do not tune it.**

Worked examples: a **2000GT** (Exotic, flagship) is cherished with no project outcome at all. An
**Acty** (Honest transport, entry) is worked. An **R32** (Drift, flagship) is hammered shifted up
to enthusiast, driven hard but expensive enough that someone cared. A **180SX** (Drift,
enthusiast) stays hammered, which is true of every 180SX that ever existed.

### The history roll drives the aftermarket roll

A car whose history says it was driven hard is likelier to carry aftermarket parts, and likelier
to carry parts of the kind that history implies. Keep this simple in this sprint: **history shifts
`aftermarketChance` and nothing more.** Which SPECIFIC parts a history implies is Sprint 155's
damage-pattern work and must not be built here.

## Reuse analysis (directive 16)

### Genuinely new

- `culture` on `CarModel.spec`.
- A care-profile lookup and a history value on the car.
- Per-profile grade weights replacing one flat table.

### Existing mechanisms reused

- **`damageGrades.weights` and `rollDamageGrade`.** The roll stays; what changes is which table it
  reads. Do not write a second roller.
- **`upkeepTierWeights` and `rollUpkeepTier`.** This is the existing "how was it treated" axis and
  history should either subsume it or drive it. **Do not stand up a parallel mechanism beside it:
  decide which one survives and say why.**
- **`aftermarketChance`**, unchanged in meaning, now scaled by history.
- **The roster CSV and its guard**, which already hold `culture` for all 94 rows.
- **`fitmentClassForTier`** for the tier shift.

### Must NOT be built

- **Damage patterns, or any targeting of WHERE damage lands.** Sprint 155.
- **Per-culture or per-model fault tables.** Sprint 155.
- **Any change to the damage budget arithmetic, the wear multiplier, the age gate, or
  `minWorkSteps`.**
- **Any change to `expectationByTier`.** It has just moved and must settle.

## Task breakdown

1. **`culture` onto `CarModelSchema.spec`** (`.strict()`), authored into `cars.json` for the
   shipped 26 from the CSV. The other 68 already carry it.
2. **The care-profile table** in content with Zod entries, keyed by culture, with the tier shift.
3. **A `history` value on the generated car**, rolled from the profile.
4. **The grade roll reads the profile's weights** instead of the flat table.
5. **History scales `aftermarketChance`.**
6. **Resolve the overlap with `upkeepTier`** and record the decision.
7. **Tests and re-derivation.**

## Tests

- Every shipped car has a culture and it matches the roster CSV.
- A 2000GT never rolls `project`; an Acty rolls it far more often than a 2000GT.
- The roster-wide grade distribution stays near 45/35/15/5.
- The tier shift moves a flagship Drift car off the hammered profile.
- A hard-driven history raises the aftermarket rate above a garaged one.
- **The guards from Sprint 153 all still hold**: age-0 `poorOrWorseFraction < 0.05`, the Wagon R
  `ordinaryPoor < 3`, the barely-driven median, the per-venue ordering.

## Re-derivation

The economy approval-gate hash, both `advanceDay` goldens, the worked example, and the roster CSV
guard if the culture column's shape changes.

Run `pnpm typecheck` before reporting. Run content, sim AND game at the end.

## Exit

**Status: IMPLEMENTED, ready for review.** Layer 2 of `generation-damage.md` is built. Layer 3 is
untouched: no damage patterns, no per-culture or per-model fault tables, nothing deciding WHERE
damage lands. The damage budget arithmetic, the wear multiplier, the age gate, `minWorkSteps` and
`expectationByTier` are all unmoved.

### The ruling on `upkeepTier`: history SUBSUMES it

**`rollUpkeepTier` and `partsGeneration.upkeepTierWeights` are retired. The history survives as the
only roll, and the upkeep tier is DERIVED from it** through a new
`damageGrades.upkeepTierByGrade` (tidy cherished, used average, rough neglected, project
neglected).

Why, in one line: they asked the same question. `upkeepTierWeights` was flat 0.25/0.50/0.25 for
"how was this car treated", and the care profile answers exactly that with more information (the
car's own scene and price band) and four rungs instead of three. Keeping both would have been a
parallel mechanism beside an existing one, which is the directive-16 failure this sprint was warned
about by name.

Three consequences, all wanted:

- **One cause, several effects.** The rolled history now drives the damage budget, the condition
  baseline offset, the per-part jitter range, the missing-slot multiplier, the provenance blurb and
  the aftermarket chance. Nothing reads a car's parts to infer its history.
- **It fixes a real incoherence rather than only removing a roll.** The blurb pool is keyed by
  upkeep tier, so before this change a car someone had given up on could turn up carrying a "one
  careful owner" line. It now cannot.
- **The three upkeep EFFECT tables are untouched.** `upkeepBaselineOffset`, `upkeepJitterRange` and
  `upkeepMissingMultiplier` keep their signed values; only the roll that selected between their
  rows is gone.

Ordering change this forced: the history roll moved from after `applySymptoms` to before the parts
loop, because the upkeep tier and the aftermarket chance are read off it. Age and mileage are
already known there, so `gateProjectGrade` runs unchanged and in the same place in the causal chain.

### What landed

1. **`culture` on `CarModel.spec`**, a required `.strict()` field over a new 13-value
   `CarCultureSchema`, authored for all 26 shipped cars from the roster CSV. The CSV's
   human-readable labels normalise to the kebab ids by one rule (lowercase, spaces to hyphens), so
   the vocabulary lives in exactly one place and the roster guard asserts the normalisation for all
   94 rows plus the value on all 26 shipped ones.
2. **The care-profile table in content**, five rows exactly as the design signed them, plus the
   culture-to-profile map. The tier shift is code, not content, because it is the ladder's own
   ordering rather than a number.
3. **`CarInstance.history`**, the rolled and gated `DamageGrade`, stamped on every generated car.
   Optional on the schema: a hand-authored car (the tutorial lot, a probe, a sandbox fixture)
   genuinely has no rolled history and absent reads as exactly that.
4. **`rollDamageGrade` reads the profile**, taking the model rather than only the economy. There is
   no second roller and no flat table left anywhere.
5. **History scales `aftermarketChance`**, clamped back into [0, 1]. WHICH parts a history implies
   is layer 3 and is deliberately not expressible.

### The levers that moved (R4 grant, 2026-07-31)

Recorded per the grant's own requirement. Full ledger entry with the reasoning is in
`economyApprovalGate.test.ts`.

| lever | old | new |
| --- | --- | --- |
| `partsGeneration.damageGrades.weights` | 45 / 35 / 15 / 5 | **RETIRED** |
| `partsGeneration.upkeepTierWeights` | 0.25 / 0.50 / 0.25 | **RETIRED** |
| `damageGrades.careProfiles` | - | NEW: cherished 70/25/5/0, enthusiast 50/35/13/2, mixed 45/35/15/5, hammered 25/35/30/10, worked 20/35/33/12 |
| `damageGrades.careProfileByCulture` | - | NEW: 13 entries, exactly the design's table |
| `damageGrades.upkeepTierByGrade` | - | NEW: cherished / average / neglected / neglected |
| `damageGrades.aftermarketChanceMultiplierByGrade` | - | NEW: 0.6 / 1.0 / 1.6 / 2.0 |

The multiplier ladder is the one value the design did not specify. It was chosen to REDISTRIBUTE
rather than inflate: weighted by the emergent grade mix its mean is **0.995** over the full 94-car
roster and **1.054** over the shipped 26, so the roster-wide aftermarket rate barely moves while a
hard-driven car is **3.33x** likelier to carry a modified slot than a garaged one. `aftermarketChance`
itself stays 0.06 and `maxAftermarketSlots` stays 3.

### The roster-wide distribution, measured not tuned

Unweighted mean of each car's own profile, against the retired flat table:

| grade | old flat table | all 94 authored | shipped 26 |
| --- | ---: | ---: | ---: |
| tidy | 45% | **43.35%** | 36.73% |
| used | 35% | **32.34%** | 34.23% |
| rough | 15% | **18.69%** | 22.31% |
| project | 5% | **5.62%** | 6.73% |

The full roster lands within 3.7 points of the old table on every grade with nobody authoring that
number: it is what the 94 cultures add up to. **The shipped 26 sit meaningfully rougher**, and that
is content authoring rather than a defect: the built subset is drift-and-kei-heavy (8 of 26 on the
`hammered` profile, 6 on `worked`, only 2 on `cherished`), so the game as it ships today is rougher
than the game the full roster describes. Not tuned, per this sprint's instruction.

Profile counts: all 94 - cherished 25, worked 19, hammered 19, mixed 16, enthusiast 15. Shipped 26 -
enthusiast 9, hammered 8, worked 6, cherished 2, mixed 1.

### The worked examples

| car | culture / tier | profile | tidy / used / rough / project |
| --- | --- | --- | ---: |
| Toyota 2000GT (MF10) | kyusha / flagship | cherished (already top rung, clamped) | 70 / 25 / 5 / **0** |
| Honda Acty (HA4) | kei / entry | worked (already bottom rung, clamped) | 20 / 35 / 33 / **12** |

A 2000GT cannot roll `project` at all: the outcome is unreachable, not merely rare. An Acty rolls it
12 times in 100. Neither is in `cars.json` yet, so both are asserted through their authored
(culture, tier) pair rather than through a shipped model.

### One divergence from the design doc, flagged rather than special-cased

`generation-damage.md` says an R32 is "hammered shifted up to enthusiast". Against its own table
that is **two rungs**: the ladder runs cherished > enthusiast > mixed > hammered > worked, strictly
decreasing in `tidy` share, so one rung up from `hammered` is `mixed`. **Implemented as one rung**,
uniformly, with no profile treated as off-ladder, because a ladder with a skipped rung is a ladder
with an exception. A flagship drift car therefore lands on `mixed` (45/35/15/5), which still
satisfies this sprint's own stated test ("moves a flagship Drift car off the hammered profile").
Maintainer ruling welcome if the two-rung reading was intended.

Separately: the doc's examples name the **R32 as Drift** and the **Acty as Honest transport**. The
roster CSV authors them `touring-car` and `kei`. The Acty is unaffected (both map to `worked`); the
R32 is `touring-car`/flagship, so it reads `cherished` rather than the doc's `enthusiast`. The CSV
is the source of truth and was followed.

### The finding: the ceiling-veto coupling bit, and no lever was moved to hide it

Layer 1 said to measure this rather than assume it. `applySymptoms` drops a symptom outright if it
would breach the Law 2 ceiling, so leaving cars closer to that ceiling silently lowers the effective
symptom rate. Care profiles make entry cars systematically rougher, and it bit:

| class | signed | Sprint 153 | now | drift |
| --- | ---: | ---: | ---: | ---: |
| entry | 0.55 | 0.5457 | **0.5000** | -0.0500 |
| everyday | 0.50 | 0.4933 | **0.4804** | -0.0196 |
| enthusiast | 0.45 | 0.4433 | **0.4163** | -0.0337 |
| flagship | 0.35 | 0.3600 | **0.3400** | -0.0100 |

Every class drifted down and `entry` lands exactly on the test's 0.05 tolerance boundary, so
**`auctions.test.ts`'s symptom-rate guard is RED and was left red.** Moving
`diagnosis.symptomChanceByTier.entry` would be compensating one system for another's side effect
against a veto rate that is not itself stable, which is not a value that is RIGHT, only one that is
green. The test was rewritten to measure and disclose all four classes in one message instead of
stopping at the first mismatch, which is strictly more information than it gave before.

### Amendment: the veto-coupling lever, closed (2026-07-31, R4)

**The finding above is now resolved by raising the input, not by softening the veto.** The ruling:
the signed number describes what a player MEETS, a symptom present or absent, not what goes into
the roll. The veto is an implementation detail between the two, so the input lever is raised until
the EFFECTIVE rate, after the veto, lands back on the signed intent.

| class | old input | new input | measured effective (new) |
| --- | ---: | ---: | ---: |
| entry | 0.55 | **0.597** | 0.5505 |
| everyday | 0.50 | **0.513** | 0.5000 |
| enthusiast | 0.45 | **0.474** | 0.4522 |
| flagship | 0.35 | **0.357** | 0.3533 |

Every new value was found by measurement, not by scaling the drift table above with arithmetic:
`auctions.test.ts`'s own methodology (all 26 shipped cars, seeds 0-299 each, bucketed by fitment
class) run against candidate inputs and bisected per class until the effective rate landed on the
signed target, then rounded to three decimals and re-measured at the rounded value. Classes are
independent (a car's fitment class fixes which table entry it reads), so each was searched on its
own. No second lever moved: `enforceMaxBillFraction`, `maxBillFraction` and every Sprint 154 care
profile and zone table are unchanged.

**The input and the effective rate are now two different numbers on purpose.** That is a standing
hazard, not a one-off fix: anything that changes how rough generated cars are, a care-profile edit,
a zone-severity table, a `maxBillFraction` change, moves how much the Law 2 veto eats and reopens
the gap between what is signed and what a player meets. Recorded as an Open engineering item in
`TODO.md` rather than only here, so the next lever move that touches generation roughness finds it.

Re-derivation: the economy approval-gate hash moved (`5a0f898f...` -> `7b4edda1...`, full ledger
entry in `economyApprovalGate.test.ts`). The 30-day `advanceDay` golden held unchanged; the
acquisition-to-sale golden moved (`4c86d4c9` -> `81133d36`), because the RNG draw sequence inside
symptom generation shifts with the input and that script is the one that rolls and sells a real
lot. `workedExample.test.ts` is unaffected. `partPricing.json` and every mission payout and budget
cap hold.

Checks: `pnpm typecheck` (content, sim, game all Done); `pnpm test --project content` (25 files,
562 tests, all passed at the re-pinned hash); `pnpm test --project sim`, `auctions.test.ts`'s
symptom-rate guard passing along with the rest of the file.

### Tests diagnosed, not bent (directive 17)

All four are **case (a)**: each asserted a property of the retired flat table or of an
under-specified fixture.

1. **`auctions.test.ts`, "rolls the four grades at their authored roster-wide shares".** There is no
   roster-wide table to assert. Rewritten to check each of the five profiles against its own row,
   on a model whose culture selects it at a tier that does not shift it.
2. **`auctions.test.ts`, the Wagon R "fine or mint > 14".** The Wagon R is kei at entry tier, which
   is the `worked` profile, so it is now DESIGNED to be one of the rougher cars rather than an
   average one; it measures 12.89 of 29 slots at fine or mint, against 4.9 under the retired floor.
   Re-derived to `> 12`. **The headline half of that test did not move and was not touched**: under
   3 of its 26 ordinary slots ruined, still passing.
3. **`auctions.test.ts`, "spends what it rolled", upper bound.** The bound was the authored budget
   gap, on the reasoning that the budget was all a grade bought. It is not any more: the history
   also sets the upkeep tier, so a forced `tidy` car is cherished-upkeep and a forced `project` car
   neglected-upkeep before the budget spends a step. Measured gap 45.5 against an authored 43, and
   the excess IS the coupling working. Bounded loosely at twice the authored gap; the ladder-shape
   assertions (tidy < used < rough < project, and the 45 per cent floor) are untouched.
4. **`CarDetailScreen.test.ts`, "shows no foundation warning when the foundations are sound".** The
   fixture lifted the BANDS of foundation slots that happened to be occupied, but a MISSING
   foundation slot reads as the `missing` state, which is itself below 1 in
   `valuation.foundation.factorByState`. It held while an entry car's missing-slot chance was low
   and stopped holding once culture made those cars likelier to be neglected. The fixture now fills
   every foundation slot as well as minting it, which is what its own name always claimed.

### Re-derived pins

| pin | old | new |
| --- | --- | --- |
| `economyApprovalGate` economy.json hash | `b0165684...` | `5a0f898f...` |
| `advanceDay` golden, 30-day career | `7037aa01` | `08ce1be6` |
| `advanceDay` golden, acquisition to sale | `dba0a979` | `4c86d4c9` |
| `schemas.test.ts` lever pin | `damageGrades.weights` 45/35/15/5 | `careProfiles`, `careProfileByCulture`, `upkeepTierByGrade`, `aftermarketChanceMultiplierByGrade` |
| `auctions.test.ts` Wagon R fine-or-mint bar | `> 14` | `> 12` (measures 12.89) |
| `auctions.test.ts` grade-ladder upper bound | `<= authoredGap` | `< 2 x authoredGap` (measures 45.5 vs 43) |
| `worked-example-two-cars.md` | - | regenerated from a real run |

Both golden hashes were re-run twice to confirm determinism. `partPricing.json`'s hash, every
mission payout and every budget cap hold unchanged: none of those pipelines reads how a generated
car was treated.

Three entries were added to the retired-identifier ledger: `upkeepTierWeights`, `rollUpkeepTier`
and `damageGrades.weights` (matched as a dotted path, since bare `weights` is a live local).

### Incidental, in scope

- **The worked example stopped carrying its own copy of `culture`.** `CarScript` hand-typed `'Kei'`
  and `'Drift'`; it now reads `model.spec.culture`, so the doc cannot disagree with the roster.
- **`tools/sandbox/generateCars.mjs`** emits a `culture` placeholder (`oddball`) on the 59
  synthesised research entries, on the same footing as the `reliabilityBase`/`styleBase`
  placeholders already there, and `sandboxCars.ts` was regenerated. A research entry never reaches
  auction generation, so the value is read by nothing.
- **No Dexie version bump and no migration** (directive 19). `CarInstance.history` is optional and
  additive inside an existing blob; an old save loads and its cars simply have no history.

### Checks

| check | result |
| --- | --- |
| `pnpm typecheck` | content, sim and game all Done |
| `pnpm test --project content` | 25 files, 562 tests, all passed |
| `pnpm test --project sim` | 75 files, 1,989 tests: 1 failed (the symptom-rate guard above), 1,988 passed |
| `pnpm test --project game` | 62 files, 835 tests, all passed |
