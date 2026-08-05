# Sprint 182: a buyer learns to say no

**Status: PLANNED. Nothing implemented.**

Design of record: `docs/design/systems/sale-value-system.md` Stage E, amendment v5.
Authored data: `docs/design/buyer-culture-affinity.csv`.

## Goal

Make a buyer capable of refusing a car. Today they are not: **94 per cent of generated cars match
at least one scene untouched**, and a bone-stock Supra is simultaneously a perfect Show Crowd car
and a perfect Daily Driver car. Every downstream system in the scene arc rests on MATCHED meaning
something, and it currently means almost nothing.

## What is actually wrong, measured

Three separate probes, all against the shipped content and the real generator:

1. **26 shipped cars, mint stock, no work done.** Matched by scene: collector 26/26, daily-drivers
   26/26, tuner 24/26, show-crowd 21/26, touge 21/26, racer 18/26.
2. **400 real generated auction lots.** 94 per cent match at least one scene on arrival, average
   3.89 scenes of six. After nothing but a restoration to mint: 100 per cent, 5.15 of six.
3. **The Racer arithmetic, worked.** A mint stock Supra has 43 per cent of the power a Racer asked
   for and half the grip, and still scores **0.72** against them, because style and reliability are
   free marks worth 25 per cent of the verdict and every shortfall is proportional.

**The root cause is structural, not a bad number: a weighted average can never disqualify
anything.** That is the finding this sprint is built on, and it is why raising targets alone does
not work.

## Reuse analysis (directive 16)

**New mechanisms, and there are only two:**

- **A champion gate.** One predicate: the buyer's highest-importance stat must clear its target or
  there is no match. It reads `Buyer.statTargets`, which already carries both numbers.
- **`culturePreferences` on `Buyer`.** A per-culture multiplier, authored in
  `buyer-culture-affinity.csv`.

**Existing mechanisms reused, unchanged:**

- **`spec.culture` on every car.** All thirteen values already authored across the full 94-car
  roster and shipped in `cars.json`. No car-side authoring at all. It is currently read only by
  `partsGeneration.damageGrades.careProfileByCulture`, which is untouched.
- **`tierPreferences` is the exact shape precedent** for `culturePreferences`: a per-buyer
  preference map over one car attribute, read both by the taste path and by the channel draw
  (`saleCandidates`, `tierPreferenceWeight`). The new map joins it in the same two places.
- **`tasteMatchFor` (valuation.ts) is not rewritten.** The gate wraps it and the culture multiplier
  scales its output. The shortfall formula, the `upper` handling and the channel band arithmetic
  are all exactly as they are.
- **`championStatFor` already exists** in `sceneCommissions.ts`, where it picks the stat a
  commission asks for. It moves to `valuation.ts` and both callers read the one implementation, so
  the commission and the gate can never disagree about what a buyer is known for.
- **`isTasteMatched` stays the single MATCHED predicate**, so the `matchedOnly` channel gate, the
  scene-standing earn hook and the reputation bonus all keep reading one function.
- **`styleBase`/`styleCeiling` already exist per car** in the roster CSV and in `cars.json`. The
  ceiling corrections are edits to authored values, not a new field.

**Nothing parallel is stood up.** No second taste path, no second culture field, no per-buyer
special cases in code.

## Levers (directive 22)

Every value below is listed by name. **The culture table is 78 values authored by the maintainer**
in `docs/design/buyer-culture-affinity.csv` and is imported verbatim; it is not restated here so
there is exactly one copy.

### Buyer stat targets (`packages/content/data/buyers.json`)

| buyer | field | from | to |
| --- | --- | --- | --- |
| show-crowd | `statTargets.style.target` | 0.65 | **0.85** |
| touge | `statTargets.power.target` | 0.70 | **0.4667** |
| touge | `statTargets.handling.target` | 0.75 | **0.50** |
| touge | `statTargets.power.upper` | absent | **0.55** |
| racer | `statTargets.handling.target` | 0.75 | **0.60** |
| tuner | `statTargets.handling.target` | 0.55 | **0.45** |
| tuner | `statTargets.power.importance` | 0.60 | **0.80** |
| collector | `statTargets.handling.target` | 0.30 | **0.25** |
| collector | `statTargets.power.upper` | 0.50 | **deleted** |
| daily-drivers | `statTargets.handling.target` | 0.30 | **0.25** |

`tuner.statTargets.power.target` stays at **0.65 (390 PS)**, which becomes their gate once the
importance change makes power their champion.

### Roster style ceilings (`docs/design/midnight-garage-roster.csv`, then `cars.json`)

Raised so the new Show Crowd bar of 0.85 is reachable by cars whose whole appeal is how they look:

| car | `styleCeiling` from | to |
| --- | --- | --- |
| Toyota Sera (EXY10) | 68 | **88** |
| Honda City Turbo II (AA) | 72 | **88** |
| Honda Beat (PP1) | 76 | **88** |
| Toyota MR2 (AW11) | 82 | **88** |
| Suzuki Alto Works (HA21S) | 66 | **80** |

Deliberately NOT raised, because these cars should not be show cars: Wagon R (44), Carina (60),
City E (66), Sunny (68).

**Directive 24 applies: `styleCeiling` is a per-car value and any change is authored in the roster
CSV for all 94 rows first.** Only the five above move; the rest are already authored and stay.

## Tasks

1. **`culturePreferences` on the buyer schema** (`packages/content/src/buyer.ts`), an array of
   `{ culture, weight }` mirroring `tierPreferences`. Every buyer names all thirteen cultures;
   **a missing entry is a schema error rather than a default**, because a silent 1.0 would make an
   unauthored buyer invisibly culture-blind.
2. **Author the six buyers' `culturePreferences`** into `buyers.json` from the CSV, verbatim.
3. **Move `championStatFor` into `valuation.ts`** and have `sceneCommissions.ts` import it.
4. **The gate and the culture multiplier, both inside `normalizedTasteScore`**, in that order:
   champion shortfall zeroes the score, then affinity scales it. One function, so every consumer
   (the taste band, the matched predicate, commissions) reads the same number and they cannot drift.
5. **Culture weights the channel draw** in `saleCandidates` (selling.ts), multiplied alongside
   `tierPreferenceWeight` and the word-of-mouth multiplier.
6. **Apply the ten target changes** and the five style ceilings.
7. **The measurement test**, which is the deliverable that proves the sprint: match rate per scene
   across 400 generated lots at arrival, after restoration, and after a sport build. It asserts a
   real gradient rather than a fixed number, so it cannot be satisfied by the old behaviour.

## RULED: the folded formulation, one threshold (maintainer, 2026-08-05)

`matchedTasteScoreThreshold` (0.5) **stays**, and the gate folds into the score rather than
standing beside it:

    if score[champion] < target[champion]: match = 0
    final = match * cultureAffinity[buyer][car.spec.culture]
    matched = final >= matchedTasteScoreThreshold

One number, one test, and it reproduces the approved measurement **exactly**: a gate failure gives
`final = 0`, which is below any positive threshold, and a gate pass gives `match x affinity` tested
against 0.5, which is precisely what was measured (9 per cent of arrivals matching, 37 after
restoration, 89 after a sport build).

Keeping the bar matters because **the gate alone does not read culture.** Drop the threshold and a
mint Carina goes straight back to matching a Collector on authenticity alone, which is the case the
culture table exists to fix.

**The one live consequence, which must be measured rather than assumed: the gate now reaches
PRICE.** `normalizedTasteScore` feeds `channelTasteMultiplier` as well as the matched predicate, so
a buyer who fails the champion has taste 0 and pays the band floor. That is coherent, and arguably
the point: routing to the right crowd should pay, not merely register. But the shop front carries
no `matchedOnly` gate and will still draw those buyers, so **this can move prices broadly and it is
a change the maintainer has seen no numbers for.** It is in the definition of done below as a
measurement, so it cannot ship unnoticed.

## Definition of done

- A generated car no longer matches most scenes on arrival, and the arrival, restored and built
  stages read as a genuine progression rather than three flat 100s.
- A Collector refuses an `honest-transport` Carina, a Daily Driver refuses a race-built GT-R, and
  a Show Crowd buyer refuses a stock car.
- A mint stock Toyota 2000GT still matches a Collector (verified at 0.97 against the proposed
  table), so the mechanism rewards the right car rather than refusing everything.
- **The price effect of the gate is MEASURED and reported**, not assumed: what the folded
  formulation does to realised sale prices across the same 400 generated lots, before and after.
  A broad price collapse is a finding to table, not something to absorb quietly.
- `pnpm typecheck` clean (directive 20's carve-out applies: `Buyer` gains a required field).
- `npx eslint .` clean.

## Deliberately not here

- **The standing ladder retune.** Its thresholds (3 and 10 matched deliveries) and its price band
  were calibrated when matched was nearly free. They are wrong after this sprint and they are
  sprint 183's whole subject, because they cannot be retuned until this has been measured.
- **The reputation rework**, sprint 184. It reads the buyer's importance vector, which this sprint
  changes, so it must land after.
- **Re-spacing the grade ladder** so street and sport handling parts carry real grip. Logged in
  `TODO.md` with the maintainer's four constraints; it moves `physicalModifiers.grip` across the
  suspension catalogue and is its own signed lever sweep.
- **Splitting mechanical from effective grip** so touge and racer read different numbers. Logged
  in `TODO.md` as deferred investigation.

## Exit

*(Filled on completion.)*
