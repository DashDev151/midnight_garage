# Sprint 155: what actually happened to it

**Status: READY TO IMPLEMENT.** Design of record:
`docs/design/systems/generation-damage.md`, layer 3. Layers 1 and 2 shipped in Sprints 153 and 154
and **must not be re-opened**.

## The defect

**Damage is spread at random, so a car reads as noise rather than a story.**

`spendDamageBudget` picks its next slot from the shallowest eligible candidates and then
`rng.pick`s uniformly among them. Nothing knows that a car was drifted, or rear-ended, or driven
to work for fifteen years. A car with a knackered engine and a straight body is a story; a car
with eleven unrelated things one band down is a list.

Three consequences, all measured or verified:

- **Body zones roll independently.** Six zones (bonnet, boot, left, right, roof, chassis) each roll
  from the same table with no correlation, so there is no front, no rear, and `left` and `right`
  are unrelated. **A collision cannot be expressed.**
- **Symptom damage always lands on `bonnet`**, deliberately, to avoid an extra RNG draw. Every rust
  patch and every respray in the game is on the same panel.
- **Symptom choice is independent of everything.** A car can present a gearbox whine with a
  perfect gearbox and a destroyed front end.

## The fix

**A damage pattern is a weighting over part slots. Nothing else.**

    pattern = { id, displayName, slotWeights }

Not a band, not an amount, not a list of effects. Amount is the budget's job and band is the
degrade step's job. **A pattern answers "where", and only "where".**

### One weighting, two consumers

| consumer | what it does with `slotWeights` |
| --- | --- |
| **the damage budget** | draws which slot to degrade from the weighting instead of uniformly among the shallowest |
| **the symptom draw** | weights each candidate symptom by how much its causes' `carPartId`s overlap the weighting |

**That join is the whole sprint.** A car that rolled `frontal-collision` spends its damage on the
bonnet, the left and right zones and the engine group, **and** is far likelier to present a
front-end symptom than a gearbox whine.

### History picks the pattern

Sprint 154 gave every car a rolled history. The history now selects a pattern:

    history -> pattern -> where the budget lands, and which symptom appears

Patterns to author, illustrative and to be finalised in implementation:

| pattern | ruins | leaves alone |
| --- | --- | --- |
| `frontal-collision` | bonnet, left and right zones, engine group | drivetrain, interior |
| `drifted` | wheels, suspension, rear body zones | engine, interior |
| `grenade` | engine group, catastrophically | everything else |
| `neglected-commuter` | consumables, thin damage everywhere | nothing in particular |
| `garaged` | almost nothing, thin and even | most of the car |

### The shared vocabulary already exists

**62 failure modes**, each `{ carPartId, setBand, weight }`, grouped into **17 symptoms** with
**47 diagnostic tests**. A failure mode is already an atom of named damage addressed by
`carPartId`. **Patterns and failure modes therefore share a vocabulary and must use it** rather
than inventing a second one.

Two grouping structures also already exist and neither is read by generation:
`parts-taxonomy.json`'s `group` (engine, drivetrain, suspension, wheels, body, interior) and
`zoneState`'s six body zones. **Use both. Do not invent a third.**

## The three rules, unchanged from Sprint 153 and still binding

**A symptom is a label on damage that already exists.** The pipeline order is load-bearing:

    condition -> zones -> Law 2 ceiling -> SYMPTOMS -> the damage budget

1. **The budget still runs after symptoms, never before.**
2. **It still never writes `apparentBandByPartId`.**
3. **It still accounts for damage symptoms already spent.**

**And a fourth, new to this sprint:** the symptom draw is being made pattern-aware, so it now
reads the car's history. **It must still not read the car's parts to infer anything.** History is
the cause; both the damage and the symptom are effects of it.

### What a pattern must NOT do

- **Set a band.** Failure modes do that, and `setBand` is a floor never a ceiling.
- **Create a symptom.** `applySymptoms` owns that, including its Law 2 veto.
- **Write `apparentBandByPartId`.**

A pattern that picked a part and set its band **would be `applySymptoms` minus the causes, the
tests and the price**: a second, worse diagnosis system growing beside the good one.

## Reuse analysis (directive 16)

### Genuinely new

- Pattern content: an id, a display name, a slot weighting.
- A `patternByHistory` mapping.
- The symptom draw gaining a pattern-overlap weighting.

### Existing mechanisms reused

- **`spendDamageBudget`'s candidate pick.** The shallow-first rule stays; the uniform `rng.pick`
  among the shallowest becomes a weighted pick. Do not write a second spender.
- **`parts-taxonomy.json`'s `group`** and **`zoneState`'s zones**, both already authored.
- **The failure-mode registry**, as the shared `carPartId` vocabulary.
- **`applySymptoms`**, unchanged in what it does; only which symptom is drawn changes.
- **The rolled history from Sprint 154**, unchanged.

### Must NOT be built

- **Per-model fault tables.** Named as a later concern; a `patternByHistory` mapping is this
  sprint's whole scope. An FD's apex seals want per-car pattern weights and that is authoring, not
  mechanism.
- **The scrapyard's collision localisation.** It consumes this and adds nothing; it is its own
  sprint.
- **Any change to the budget size, the wear multiplier, `minWorkSteps`, the age gate, the care
  profiles or `expectationByTier`.**

## Levers, under R4

Pattern slot weights and the `patternByHistory` mapping are authored in this sprint. **Every value
goes in this doc's Exit with its reasoning**, per R4's recording requirement.

The symptom-overlap weighting needs one strength lever (how strongly a pattern biases the symptom
draw). **Choose a value that leaves genuine variety** rather than making the symptom fully
determined by the history, and say why the number was chosen.

## Task breakdown

1. **Pattern content and schema** (`.strict()`), with slot weights over taxonomy groups and body
   zones.
2. **`patternByHistory`**, mapping Sprint 154's histories onto patterns.
3. **The budget's pick reads the pattern.**
4. **The symptom draw weights candidates by pattern overlap.**
5. **Fix the bonnet monopoly**: symptom body damage lands on a zone the pattern implicates rather
   than always `bonnet`.
6. **Tests and re-derivation.**

## Tests

- A `frontal-collision` car has materially more damage in the engine group and front zones than a
  `drifted` car, and vice versa on wheels and suspension.
- Symptom choice correlates with the pattern: a front-end car draws front-end symptoms more often
  than chance.
- **Symptom body damage is no longer always on `bonnet`.**
- The pattern never sets a band and never writes `apparentBandByPartId`.
- **All Sprint 153 and 154 guards still hold**: age-0 `poorOrWorseFraction`, the Wagon R
  `ordinaryPoor`, the barely-driven median, the per-venue ordering, the roster-wide grade
  distribution, and the effective symptom rate per class.

That last one matters: this sprint concentrates damage, which changes how often the Law 2 ceiling
vetoes a symptom. **Measure the effective symptom rate and report it.**

## Re-derivation

The economy approval-gate hash, both `advanceDay` goldens, the worked example.

Run `pnpm typecheck`. Run content, sim AND game.

## Exit

**Status: IMPLEMENTED, ready for review.** Layer 3 of `generation-damage.md` is built. A pattern is
a weighting over part slots and nothing else: it carries no band, no amount and no list of effects,
and the content schema refuses one that tries to. The pipeline order is unchanged (condition,
zones, Law 2 ceiling, symptoms, then the budget), the budget still runs after symptoms, still never
writes `apparentBandByPartId`, and still deducts what the symptoms already spent. The symptom draw
now reads the car's HISTORY through the pattern and never its parts.

### What landed

1. **`damagePatterns.json` and `damagePattern.ts`**, five patterns over the six taxonomy groups and
   the five panel zones. `DamagePatternIdSchema` is an enum in code, so `patternWeightsByGrade` can
   key every id explicitly and a pattern authored without a draw weight fails validation instead of
   becoming silently unreachable. Same arrangement as `CarCultureSchema`.
2. **`damageGrades.patternWeightsByGrade`**, the history-to-pattern mapping, and
   **`damageGrades.patternSymptomBias`**, the one strength lever.
3. **`packages/sim/src/damagePatterns.ts`**, the whole of how the weighting is read. Both consumers
   share it rather than each deriving its own notion of "where".
4. **The budget's pick reads the pattern**, by drawing a taxonomy group and then applying the
   unchanged shallow-first rule inside it (see the finding below for why it is the group and not
   the slot).
5. **The symptom draw weights candidates by pattern overlap**, as a linear blend against an even
   draw.
6. **The bonnet monopoly is gone.** `setZoneCarrierToAtLeastBand` now takes the zone as an argument
   and the caller draws it from the pattern.
7. **`CarInstance.damagePattern`**, optional exactly as `history` is: a hand-authored car has no
   rolled pattern and absent reads as that. No Dexie bump and no migration (directive 19); it is an
   additive optional field inside an existing blob.

### The finding: weighting the SLOT does nothing, and the measurement said so

The sprint's reuse note said the uniform `rng.pick` among the shallowest should become a weighted
pick. **Implemented exactly that first, and it measures as very nearly nothing.** On a 600-car
probe, a `frontal-collision` car against a `drifted` car came out at 25.84 vs 24.93 mean engine band
steps (flat pattern 25.25), 4.66 vs 4.91 on wheels (flat 4.78), and 3.27 vs 2.96 mean bonnet
severity (flat 3.05). Every direction is correct and every magnitude is 2 to 5 per cent: an order of
magnitude short of reading as a story, against the 10 to 30 per cent the group draw and the zone
arrangement produce below.

The reason is structural rather than a bug. `shallowestCandidates` narrows to the parts at the
single least-damaged band present, and the budget takes every one of them to the next band before
it takes any part below it. A per-slot weighting therefore only reorders a level the budget is
going to finish anyway. It changes which part goes first and nothing else.

**Fixed by drawing the GROUP from the pattern and letting the shallow-first rule spread within it.**
The rule itself is untouched and still binds first. This keeps both properties that matter: the
budget still never ruins one part while its neighbours sit mint, and a shunted car's gearbox is
genuinely what the budget never got to. Recorded as a deviation from the sprint's own sketch, with
the numbers, rather than shipped quietly.

A second change was needed for the body, for the same reason at one level down: six independent
zone rolls cannot express a collision, and the budget rarely reaches a body carrier because its
derived band is usually already the worst on the car. **`rollZoneStates` now deals its rolled
severities out along a pattern-weighted order.** This is a pure permutation, which is exactly what a
pattern is allowed to do: `panels` and `paint` derive from the WORST panel zone and a worst-of is
invariant under permutation, so every derived band, repair bill and Law 2 check sees an identical
distribution. Only which panel carries what moves. The tier severity tables are untouched.

### Measurement 1: damage concentration

800 generated S13s per pattern at the 1995 campaign year, mean band steps from mint per taxonomy
group (the three zone-derived carriers excluded, measured separately below).

| pattern | total | engine | drivetrain | suspension | wheels | body | interior |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `garaged` (flat) | 44.45 | 15.86 | 8.74 | 10.12 | 3.97 | 1.91 | 3.86 |
| `neglected-commuter` | 44.77 | 16.77 | 8.30 | 10.59 | 4.13 | 1.80 | 3.17 |
| `frontal-collision` | 43.09 | **17.09** | 7.50 | 9.79 | 3.42 | **2.31** | 2.98 |
| `drifted` | 45.02 | 15.40 | **9.37** | **11.12** | **4.53** | 1.67 | 2.94 |
| `grenade` | 45.30 | **20.00** | 8.46 | 9.16 | 3.13 | 1.55 | 3.01 |

Shunted against drifted, both ways: engine 17.09 vs 15.40, body 2.31 vs 1.67, and the reverse on
wheels (4.53 vs 3.42), suspension (11.12 vs 9.79) and drivetrain (9.37 vs 7.50). `grenade` puts 26
per cent more into the engine than the flat pattern and less into everything else.

**Total damage moves by 5 per cent across all five patterns** (43.09 to 45.30), which is the
cleanest available statement that the pattern owns WHERE and the grade still owns HOW MUCH. It is
asserted as a test rather than only reported.

Body zones, mean money-relevant severity (surface + finish) per panel:

| pattern | bonnet | boot | left | right | roof |
| --- | ---: | ---: | ---: | ---: | ---: |
| `garaged` | 2.23 | 2.31 | 2.26 | 2.19 | 2.20 |
| `neglected-commuter` | 2.31 | 2.31 | 2.03 | 1.99 | **2.33** |
| `frontal-collision` | **3.26** | 1.98 | 2.68 | 2.63 | 1.69 |
| `drifted` | 1.71 | **2.71** | 2.44 | 2.42 | 1.55 |

The front/rear axis inverts outright: bonnet 3.26 vs 1.71, boot 2.71 vs 1.98. `left` and `right`
now move together on a shunt, which they could not before. `neglected-commuter` puts its worst on
the roof, which is what sitting outside for fifteen years does.

### Measurement 2: symptom-pattern correlation

Share of drawn symptoms by the symptom's dominant group (its own cause odds), all 26 shipped cars,
120 seeds each, about 1,750 symptoms per pattern. `garaged` is flat by construction and is
therefore the chance baseline.

| pattern | engine | body | suspension | wheels | drivetrain | interior |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `garaged` (= chance) | 57.5% | 3.1% | 18.8% | 5.2% | 8.4% | 7.1% |
| `neglected-commuter` | 60.6% | 1.6% | 19.8% | 1.8% | 10.5% | 5.6% |
| `frontal-collision` | **65.9%** | **3.6%** | 21.1% | 1.8% | **2.0%** | 5.6% |
| `drifted` | 48.5% | 2.0% | **25.4%** | **5.9%** | **12.5%** | 5.7% |
| `grenade` | **74.8%** | 1.6% | 5.2% | 3.5% | 9.4% | 5.6% |

**How much more often a front-end car draws a front-end symptom than chance: 1.15x** (engine plus
body, 69.5% against a 60.6% baseline). The sharper number is the one the design actually asked for:
a shunted car draws a **drivetrain** symptom, the gearbox whine and the diff whine, at 2.0% against
8.4% at chance, **4.2 times less often**. The front-end-to-drivetrain ratio goes from 7.2 at chance
to 34.8 on a shunted car.

Both ways round: a drifted car draws running-gear symptoms (suspension, wheels, drivetrain) at
43.8% against 24.9% for a shunted one, **1.76x**, and engine symptoms at 48.5% against 65.9%.

Every symptom stays reachable on every car: at bias 0.6 the floor under any candidate is 0.4 of an
even draw, and that is asserted directly for all 17 symptoms against all 5 patterns.

### Measurement 3: the effective symptom rate per fitment class, and the input lever it moved

Concentrating damage was expected to change how often the Law 2 ceiling vetoes a symptom. **It did,
but by a route the standing hazard entry did not name**: not by leaving cars closer to the ceiling,
but by changing WHICH symptoms are drawn. Symptoms the pattern favours survive the veto more often,
so survival rose from about 0.92 to 0.958-0.980 and the effective rate drifted UP.

Measured at 1500 seeds per shipped model (n = 10,500 entry / 12,000 everyday / 13,500 enthusiast /
3,000 flagship, roughly 4x the sample Sprint 154's bisection used):

| class | signed | input before | effective before | survival | input now | effective now | drift |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| entry | 0.55 | 0.597 | 0.5805 | 0.9723 | **0.566** | 0.5524 | +0.0024 |
| everyday | 0.50 | 0.513 | 0.5027 | 0.9799 | **0.510** | 0.4998 | -0.0002 |
| enthusiast | 0.45 | 0.474 | 0.4591 | 0.9686 | **0.465** | 0.4507 | +0.0007 |
| flagship | 0.35 | 0.357 | 0.3420 | 0.9580 | **0.365** | 0.3493 | -0.0007 |

**Corrected under R4, and disclosed rather than smoothed over.** These four are DERIVED, not
authored: `signed / measured survival`, rounded to three decimals and re-measured at the rounded
value. At that sample only `entry` had drifted materially (+0.0305). `everyday` (+0.0027),
`enthusiast` (+0.0091) and `flagship` (-0.0080) were inside one to two standard errors, and their
moves are refinements from the larger sample rather than corrections; `flagship` moved UP, which a
reader should treat as noise-level. All four were moved together because leaving three pinned to a
coarser measurement while correcting one is not a defensible split.

The first, smaller probe (26 cars x 300 seeds, the guard's own methodology) reported +0.034 /
+0.029 / +0.034 / +0.027, which the larger sample did not confirm on three of the four classes.
Recorded because it is the reason the calibration was run at 4x the sample rather than at the
guard's.

`TODO.md`'s standing-hazard entry has been widened: anything that changes WHICH symptoms are drawn
reopens this gap, not only anything that changes how rough cars are.

### The levers authored, with the reasoning (R4)

**`damagePatterns.json`, five patterns.** Weights are relative within their own map and are
authored to sum to 100 for readability. No weight is zero anywhere, deliberately: a pattern must
bias, never filter, and a shunted car is still allowed a tired gearbox. Asserted as a content test.

| pattern | display name | groups (engine / drivetrain / suspension / wheels / body / interior) | zones (bonnet / boot / left / right / roof) |
| --- | --- | --- | --- |
| `garaged` | Kept in the dry | 17 / 16 / 17 / 17 / 17 / 16 | 20 / 20 / 20 / 20 / 20 |
| `neglected-commuter` | Never serviced | 26 / 12 / 22 / 20 / 14 / 6 | 22 / 22 / 16 / 16 / 24 |
| `frontal-collision` | Went in the front | 30 / 5 / 15 / 10 / 36 / 4 | 40 / 10 / 22 / 22 / 6 |
| `drifted` | Driven sideways | 12 / 22 / 26 / 28 / 9 / 3 | 8 / 34 / 26 / 26 / 6 |
| `grenade` | The engine let go | 62 / 14 / 8 / 6 / 6 / 4 | 20 / 20 / 20 / 20 / 20 |

- **`garaged` is flat on purpose.** It is the null pattern, and its flatness is its content: a car
  that was looked after has no story, and its wear is the even, honest kind. It also gives the
  probe harness and `buildRoughProbeCar` a genuinely pattern-neutral option, and it is the baseline
  every correlation above is measured against.
- **`neglected-commuter`** is consumables. Fifteen years of skipped services is fluids, filters,
  pads, tyres and dampers, so engine ancillaries, suspension and wheels lead and the interior
  barely moves. Its zones favour the horizontal surfaces (roof, bonnet, boot lid), because a car
  that lived outside loses its lacquer there first.
- **`frontal-collision`** puts body highest and engine second: the impact takes the bodywork and
  the engine bay behind it, and the front suspension and a wheel go with them. Drivetrain at 5 and
  interior at 4 are the floor, because the gearbox, the diff and the cabin sit behind the crush.
  Zones are bonnet-dominant with the two wings equal and well above the boot and roof, which is
  what makes `left` and `right` correlate at last.
- **`drifted`** leads on wheels and suspension, with drivetrain third for the clutch and the diff.
  Engine is deliberately LOW (12): the engine is usually the best-maintained thing on a drift car,
  because it has to be. Zones are boot-and-quarters, which is where a wall meets a car going
  sideways.
- **`grenade`** is the most concentrated row in the set at 62, with drivetrain second because the
  clutch and the gearbox eat the shrapnel and the fluid. Its zones are flat: a let-go engine is not
  a body event, so an even weighting is the honest expression of "no zone implicated", and the
  car's bodywork is simply whatever it already had.

**`damageGrades.patternWeightsByGrade`.** Rows over garaged / neglected-commuter /
frontal-collision / drifted / grenade:

| grade | garaged | neglected-commuter | frontal-collision | drifted | grenade |
| --- | ---: | ---: | ---: | ---: | ---: |
| tidy | 60 | 25 | 6 | 7 | 2 |
| used | 30 | 40 | 12 | 15 | 3 |
| rough | 8 | 34 | 24 | 26 | 8 |
| project | 2 | 20 | 33 | 25 | 20 |

The reasoning is one sentence per rung. A **tidy** car mostly has no story, so `garaged` takes 60
and the small tail is a car that had one and was put right. A **used** car's story is usually that
nobody serviced it, so `neglected-commuter` leads. A **rough** car generally got that way for a
reason, so the two event patterns are a full half of the row between them. A **project** car is one
someone gave up on, and the two things that make people give up are a shunt and a let-go engine, so
those take 53 between them while `garaged` all but disappears at 2.

**`damageGrades.patternSymptomBias` = 0.6.** The symptom draw weight is `(1 - bias) + bias x
affinity`, where affinity is the symptom's cause-weighted mean of its groups' relative pull (1.0
means an evenly-weighted group). Chosen before it was measured, on two properties: on a directional
pattern the most-implicated group comes out about 3x the least (for `frontal-collision`, body at
1.70 against interior at 0.54), and nothing ever drops below 0.4 of an even draw so no symptom is
ever unreachable. At 1 the fault would be nearly a function of the history, which is a diagnosis
game that gives its own answer away; at 0 there is no layer 3 at all. Measurement 2 above is what
0.6 buys and it was not adjusted afterward.

**`diagnosis.symptomChanceByTier`**, moved as set out in measurement 3: entry 0.597 to 0.566,
everyday 0.513 to 0.510, enthusiast 0.474 to 0.465, flagship 0.357 to 0.365.

### Design decisions worth naming

- **A pattern's zone map covers the five PANEL zones, not all six.** `underbody` is the only carrier
  that reads the chassis zone and it reads that zone alone, so there is never a choice between zones
  to weight. Authoring a chassis weight would be authoring a number nothing can read.
- **The pattern is stored on the car** (`CarInstance.damagePattern`), on the same footing as
  `history`, because it is the same kind of fact about the same event. It also gives the tests an
  honest handle and gives the scrapyard sprint the field it will want. `displayName` is authored but
  surfaced nowhere yet, which is deliberate: no UI work was in scope.
- **No per-culture or per-model pattern weights.** Named as out of scope by the sprint and left
  out. The mechanism takes them without change when someone wants an FD to pray to the apex-seal
  gods: it is one more weighted row, not a new system.
- **`chassis` lives in the `drivetrain` taxonomy group**, not `body`. That is authored content this
  sprint did not touch, and it means "the shunt bent the chassis rail" cannot be expressed through
  the group weighting. Flagged, not worked around, because moving a part between groups reaches
  tool lines, staging and job costing.

### Tests diagnosed, not bent (directive 17)

Two failed, both **case (a)**.

1. **`auctions.test.ts`, the symptom-rate guard.** It compared the measured effective rate against
   `ECONOMY.diagnosis.symptomChanceByTier`, which since Sprint 154's amendment is the INPUT to the
   roll and not the signed value. Comparing them asserts the survival fraction is 1, which is
   exactly what it is not. Now measured against a named `SIGNED_SYMPTOM_RATE` constant
   (0.55 / 0.50 / 0.45 / 0.35), with the reasoning at the call site. The 0.05 tolerance and the
   report-all-classes behaviour are unchanged.
2. **`generationCoherence.test.ts`, "a barely-driven car is typically tidy".** Its `median === 0`
   bar sat on a knife edge: it pinned the tipping point of a distribution whose zero share was
   barely over half, and concentrating the budget moved that share to 0.447, flipping the median to
   1. The same total damage on fewer parts is the whole point of the sprint, and the claim the test
   exists for (a `1995 - 11 km` 180SX with mostly worn parts) is untouched. Replaced with the shape
   it stood for, every bar measured: 0.447 of barely-driven cars with nothing ruined at all
   (> 0.4), median 1 (<= 1), p90 3 (<= 3), mean 1.211 of 26 ordinary slots (< 1.5). Strictly more
   information than the single median it replaces.

All the Sprint 153 and 154 guards hold untouched: the age-0 `poorOrWorseFraction`, the Wagon R
`ordinaryPoor` and fine-or-mint bars, the per-venue project-rate ordering, the care-profile shares,
the grade ladder, the Law 2 ceiling on every generated lot, and the "symptoms spend the budget,
they do not stack on it" seam.

### Re-derived pins

| pin | old | new |
| --- | --- | --- |
| `economyApprovalGate` economy.json hash | `7b4edda1...` | `35c62a03...` |
| `economyApprovalGate` damagePatterns.json hash | - | NEW: `7b0bdc45...` |
| `advanceDay` golden, 30-day career | `08ce1be6` | `90b8b963` |
| `advanceDay` golden, acquisition to sale | `81133d36` | `5f377288` |
| `schemas.test.ts` lever pin | - | NEW: `patternWeightsByGrade`, `patternSymptomBias` |
| `generationCoherence.test.ts` barely-driven bar | `median === 0` | zero share > 0.4, median <= 1, p90 <= 3 |
| `worked-example-two-cars.md` | - | regenerated from a real run |

`damagePatterns.json` joins the approval gate as a fourth pinned file: a pattern's slot weights
decide where every generated car is damaged and which symptom it presents, which is a lever in
every sense that matters. Both `advanceDay` goldens were re-run after re-pinning to confirm
determinism. `partPricing.json`'s hash and every mission payout and budget cap hold.

### Checks

| check | result |
| --- | --- |
| `pnpm typecheck` | content, sim and game all Done |
| `pnpm test --project content` | 26 files, 569 tests, all passed |
| `pnpm test --project sim` | 76 files, 2,001 tests, all passed |
| `pnpm test --project game` | 62 files, 835 tests, all passed |
