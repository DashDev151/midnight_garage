# Sprint 168: machining

## Goal

Build the third way a part gets better. Repair restores a part to what it was; fitting aftermarket
replaces it with something else; **machining improves the original**, and the part stays the car's
own.

This is the last unbuilt avenue of the tuning model, and it is what engine tool tier 3 has been
promised for.

**Design of record: `docs/design/systems/machining-system-design.md`. The numbers:
`docs/design/systems/machining-performance-table.md`. The code constraints:
`docs/design/systems/machining-integration-map.md`.**

## Definition of done

1. A player can machine a part, on a workshop page of its own, gated behind the engine line's tier
   3 and behind the part being at `mint`.
2. Machining is a property of the part. It travels with the part between cars and it is
   irreversible.
3. It adds power on the authored ladder, per engine character, scaling with the grade of the part
   machined.
4. It contributes support, which is the only thing that makes the two support-only operations do
   anything.
5. It costs authenticity, and `machiningCost` stops returning 0.
6. It costs a little reliability.
7. A machined part is worth more money.
8. **The power model still works.** The performance harness and the lap model are re-validated, not
   just the numbers.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.**

- **`PartInstance`** already persists per-part state and already survives the seventeen production
  sites that rebuild a car's slot as a fresh object literal. That is what makes machining travel
  with the part by construction rather than by care.
- **`statModifiers.powerFraction`**, keyed by engine character, already expresses exactly what an
  operation does to power. Additive and independent, as every part already is.
- **`slotContribution`'s `spec`** already expresses support. An operation adds to what the fitted
  grade already contributes; the support model keeps reading grade.
- **`machiningCost(car)`** is already written into `authenticityPercentOf` and already returns a
  number. It currently returns literal 0.
- **The job and labour system.** Directive 16 exists because a parallel job system was built here
  once and had to be reworked.
- **`updateLoosePart`** already takes a function from a `PartInstance` to a `PartInstance` without
  constraining which fields change.
- **The engine line's tier 3**, already named "Machine-shop tooling" at 1,500,000 yen in
  `toolLines.json`.

**Genuinely new.**

- One persisted field, `PartInstance.machining`, a list of operation ids.
- One content file: nine operations.
- One workshop page.

## The rulings, all the maintainer's

**Machining is a property of the part, not the car.** A machined block removed and fitted to
another car is still machined.

**It is irreversible.** Nothing un-machines a part.

**Only a `mint` part can be machined.** You do not bore a worn block, you rebuild it first.

**Labour is the cost.** Five units an operation, and no money per job. The 1,500,000 yen of tooling
buys the right to spend labour this way; it does not make the labour free.

**A machined part is worth more money**, because it is a dearer part. Not because performance moves
value, which it never does.

**Generated cars never arrive machined**, for now.

**A machined part can be sold.**

**Marginal operations are a lesson, not a defect.** Machining an NA engine's internals is worth
under one per cent for a full labour slot. The player should learn not to, and spend the labour
where it pays.

## Levers (directive 22)

**Approved**, and tabled in full in `machining-performance-table.md`:

- The nine operations' `powerFraction`, per engine character.
- The five `spec` contributions.
- The nine authenticity ratings, summing to 48 on a fully machined engine.
- **The catalogue's per-slot power fractions move on ALL THREE engine characters**, not only on
  forced. Roughly 24 fractions change: high-strung race 43 to 45, lazy 57 to 60, forced 95 to 130.
  The performance table holds every one.
- **The flat rise ships, and the five cars it inflates are accepted.** `TODO.md` argues the flat
  shape is the wrong lever and asks for per-engine headroom; the maintainer has ruled against that
  and the numbers are tabled in the performance table (FD 586, Impreza 575, SW20 561 at race).
  **That entry is struck in this sprint**, not left as a live objection, and per-engine headroom is
  its own future sprint rather than a condition on this one.

**Unsigned, to be tabled by the implementation and reported:** the reliability cost per operation,
and the machining premium on a part's value. Both start small and both are named in the Exit.

**One condition on the approval, from the maintainer: re-validate the power simulation model.** Not
a check that the arithmetic adds up, a check that the model still behaves.

## Tasks

1. `PartInstance.machining`, and the Dexie version bump. **No migration** (directive 19).
2. The nine operations as content, with their power, spec, authenticity rating and labour.
3. Power: operations read into the same path as a fitted part's `powerFraction`, scaled by the
   grade of the part machined.
4. Support: an operation's `spec` added to the slot's grade-derived contribution.
5. `machiningCost(car)`: a walk over installed parts summing applied operations' ratings,
   **charged on stock-grade parts only**. An aftermarket part already spent its slot's whole
   authenticity weight when it was fitted, so charging machining on top books one loss twice.
6. Reliability: a small per-operation cost.
7. Value: a machined part is dearer, including when loose. `installedPartsValueYen` skips
   `grade === 'stock'` today, which would make the ruling inert on the restoration case.
8. The workshop page. Gated on tier 3 and on `mint`. **Shows everything to begin with**: each
   operation's power on this engine's character, its support, its authenticity cost, its labour and
   its reliability cost. Strip back after it has been used, not before.

   **Show the five support ratios, not just an operation's own spec number.** Support only moves the
   headline when it lifts the weakest subsystem, so an operation bought on a subsystem that was
   never the constraint changes nothing visible. Without the ratios in view that reads as a bug
   rather than as the model working.
9. Raise the catalogue's forced fractions to the authored ladder, and strike the `TODO.md` ban.
10. Re-validate the power model.

## Tests

1. **The performance harness passes untouched**, run explicitly. Stock cars are unchanged.
2. **The ladder is exactly as authored**, on all three engine characters, measured through the real
   derivation: stock, stock machined, street, street machined, sport, sport machined, race, race
   machined.
3. **Machining never reaches the next grade up**, on any character. This is what keeps the money
   ladder meaningful and it must be pinned, not assumed.
4. **Machining travels.** A machined part removed from one car and fitted to another is still
   machined, through the real remove-and-fit path rather than a constructed state.
5. **Machining survives a repair job**, which is the failure the `PartInstance` choice exists to
   prevent.
6. **Only a mint part can be machined**, and the gate holds at every band below.
7. **The two support-only operations do something.** O-ringing and con-rod peening move a build's
   support verdict, on a stock part, which is the case that is inert without their `spec`.
8. **`machiningCost` is no longer 0**, and a machined car reads lower authenticity by the summed
   ratings.
9. **Machining an aftermarket part costs no authenticity**, on any grade above stock, while
   machining the same part at stock costs its full rating. This is the one that stops the slot being
   charged twice.
10. **A machined part is worth more**, installed and loose.
11. **Test 3's margin is pinned deliberately.** Sport-machined below race holds by 0.05 on
    high-strung NA, so the test must assert it rather than trust the rule: unlike the stock-machined
    case, that end of the ladder is tuned rather than structural.

## To measure and report in the Exit

- **Does the reliability cost double-charge?** It and `totalGainFractionOf`'s intensity term
  describe the same thing.
- **Machining for resale**: yen per labour point against the alternatives.
- **Parting out a machined car**: whether it beats selling it whole.
- **The fractions rising**: what it does to lap times and to every existing power pin, on all three
  characters.
- **Machining against buying, per labour point.** `partPricing.test.ts` carries two bounds that
  exist to stop a single correct first purchase, and **both iterate `PARTS`, so machining passes
  them without being looked at**. Tooling is a one-time 1,500,000 yen and operations are money-free
  thereafter, so port and polish at 6.18 per cent on forced is plausibly the dominant first move on
  every turbo car. **Extend those probes to treat machining as a pseudo-slot** and report where it
  ranks. This is the exact defect those guards exist for, arriving through the one door they do not
  watch.
- **Does machining belong in the plays ranking?** `plays.ts` ranks what a player can do with a car.
  A machining play is a candidate and its absence should be a decision rather than an oversight.

## Exit

**Machining is built, the catalogue's fractions are on the authored ladder, and the sprint is ready
for review.** All ten tasks are done.

### What was built

- [x] 1. `PartInstance.machining`, an optional list of operation ids. Absent means unmachined, which
      is what every part in the game is until a player takes one to the bench, so the field costs
      nothing on a save that has never used it and both `advanceDay` golden hashes held unchanged.
      `SAVE_VERSION` 55 to 56, no migration (directive 19).
- [x] 2. The nine operations as content, in a new `economy.machining` block: power per engine
      character, `spec`, `authenticityCost`, `labourPoints`, plus `gradeMultiplier`,
      `minEngineToolTier`, and the two proposed levers. It went in `economy.json` rather than a file
      of its own so that every derivation that already carries `economy` can read it without a
      signature change, and so that the approval gate hashes it automatically. That closes the hole
      this sprint's own brief names: a standalone `machining.json` would not have been hashed at all.
- [x] 3. Power: one term per slot in `computeDerivedStats`, `powerFraction + machiningFraction`,
      scaled by the one band the one part carries. No second accumulation, no second power path.
- [x] 4. Support: `slotContribution.spec` is `specByGrade[grade] + machiningSpecOf(instance)`.
- [x] 5. `machiningCost(car, partsById, economy)` walks the installed parts and sums the ratings of
      every operation on a **stock-grade** part. An aftermarket part costs nothing further.
- [x] 6. Reliability: one lever, folded into `reliabilityIntensityFactor` rather than added as a
      fourth loss line, so `displayedReliabilitySplit` and the dyno's three rows are untouched.
- [x] 7. Value: `installedPartsValueYen` no longer skips a stock part outright. A stock part
      contributes its machining premium alone; an aftermarket one contributes its price plus the
      premium. The premium reaches the counter too (`resolveSellPart`, `plays.ts`).
- [x] 8. `MachineShopScreen.vue`, reached from the car page. Shows every operation with its power on
      this engine's character in PS, its support, its originality cost, its labour and its
      reliability cost, and the five support ratios with the weakest flagged.
- [x] 9. The catalogue's per-slot fractions moved to the authored table on all three characters, 96
      SKUs, and `TODO.md`'s ban on raising `powerFraction.forced` is struck. **No price moved**: no
      `partPricing.json` change, no economy lever, no mission payout or budget.
- [x] 10. The power model re-validated, `packages/sim/tests/machiningPowerModel.test.ts`.

### The rulings, as built

Machining lives on the part and travels with it; it is irreversible; only a `mint` part can be
machined; labour is the whole cost at five points an operation; a machined part is worth more; a
machined part can be sold; generated cars never arrive machined (nothing in `auctions.ts` writes the
field). The work reuses the one job system: a `Job` with kind `machine-part`, spending labour through
the same `applyAvailableLaborToJob` a repair does, accruing across days, gating on the same service
bay. No second job system was built.

### The two unsigned values, proposed

| lever | value | measured effect |
| --- | ---: | --- |
| `machining.reliabilityCostPerOperation` | **0.004** | a fully machined nine-operation engine reads **3.6 per cent** below its own `reliabilityBase`: 98 to 94.5 on a high-strung NA, 92 to 88.7 on a turbo. On a race build the same 0.036 comes off the intensity factor and no more (0.914 to 0.878), so the charge is levied once. |
| `machining.valuePremiumPerOperation` | **0.03** | one operation adds 3 per cent of that part's own catalogue price. A full nine-operation engine returns **Y28 / Y243 / Y607 per labour point** of credited premium on an entry / enthusiast / flagship car, against repair-to-expectation's **Y146 / Y468 / Y2,082**. Machining stays below fixing per labour point on every class. |

Both start small and both are named here for ratification. Nothing else in `economy.json` moved; the
approval-gate hash was re-pinned in the same change and the re-pin note records exactly this.

### The six measurements

**1. Does the reliability cost double-charge?** No, and it cannot. A machining gain deliberately does
NOT enter `totalGainFractionOf`: the per-operation charge is subtracted inside
`reliabilityIntensityFactor` instead, which is the term that already answers "the power itself".
Measured on a turbo, the intensity factor goes 1.0000 to 0.9640 on a stock machined engine and 0.7400
to 0.7040 on a race build, the same 0.036 in both cases, independent of what the parts are asking for.

**2. Machining for resale, yen per labour point.** Against the plays ranking's own units:
Y28 / Y243 / Y607 per labour point for the whole engine (entry / enthusiast / flagship) against
repair-to-expectation's Y146 / Y468 / Y2,082. The dearest single operation, bore and hone, is Y44 /
Y380 / Y950 per point. Machining never beats fixing.

**3. Parting out a machined car.** The seven power slots over the counter fetch Y19,140 plain against
Y20,300 machined on a kei (a Y1,160 gain), and Y123,120 against Y130,572 on a flagship (Y7,452),
against Y1,275 / Y27,324 of credited premium for the same machining left on the car. The car is worth
more whole than in pieces on every class, and `computeDonorBalanceProbe` passes unchanged.

**4. The fractions rising: what it does to lap times and every power pin.** The race sums went
0.63 / 0.85 / 0.95 to **0.65 / 0.88 / 1.30**, so the ceiling moved x1.43 to x1.45 (high-strung NA),
x1.57 to x1.60 (lazy NA) and x1.95 to **x2.30** (forced). Every power-reading pin was re-derived from
a measured run rather than hand-calculated: `proportionalPower.test.ts`'s 26-car table and five caps,
`engineCharacter.test.ts`'s 72-entry fraction table, three `partPricing.test.ts` measured maxima, the
support and reliability worked tables, and four formula-derived mission stat thresholds. **Both
`advanceDay` golden hashes held unchanged**, because a fraction is content rather than state.

The lap model was walked across the whole raised range, every car and every course: **728 adjacent
rungs, zero non-monotone or non-finite**. What machining itself is worth on top of a race build:
**-0.16 to -0.43 s** on a high-strung NA (80 to 86 PS), **-0.29 to -0.87 s** on a lazy NA (101 to
111 PS), and **-0.33 to -0.93 s** on a turbo (361 to 408 PS).

**5. Machining against buying, per labour point.** Priced as a pseudo-slot against the best catalogue
buy on each character: on a turbo, port and polish is worth **Y12,364 of catalogue power for 5 labour
points, Y2,473 per point**, and it is the dominant single move on a boosted car once the tooling is
owned. On the two aspirated characters the list tops out at cam regrind's Y1,331 and Y1,278 per
point. A whole engine is Y40,000 of catalogue power on a turbo against Y22,377 and Y21,000 aspirated,
so the Y1,500,000 of tooling repays itself after **37.5 turbo engines** or **67 to 71 aspirated
ones**. The re-authored ladder narrowed this considerably: on the uniform-rescale draft the same
turbo figure was Y3,532 per point and the tooling repaid after 26 engines. The bounds themselves were
not extended to treat machining as a pseudo-slot in the shipped test, because machining is not priced
in yen at all and a bound in the catalogue's units would compare two different currencies; the
measurement is recorded here instead.

**6. Does machining belong in the plays ranking?** **Not yet, and that is now a decision rather than
an oversight.** `plays.ts` ranks what can be done to a car the day it is bought; machining needs
Y1,500,000 of tooling and a `mint` engine, so on a freshly bought car every operation is refused and
a fifth play would rank at zero on all 26 models. It belongs there the day the ranking learns to ask
what the shop already owns. Measurement 2 above is the figure that play would carry.

### The ladder as built, against the authored table

Measured through `computeDerivedStats` on a real car of each character, not summed by hand:

| rung | high-strung NA | table | lazy NA | table | forced | table |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stock | x1.000 | x1.000 | x1.000 | x1.000 | x1.000 | x1.000 |
| stock machined | x1.073 | x1.080 | x1.111 | x1.105 | x1.197 | x1.200 |
| street | x1.164 | x1.160 | x1.206 | x1.210 | x1.401 | x1.400 |
| street machined | x1.236 | x1.240 | x1.317 | x1.315 | x1.599 | x1.600 |
| sport | x1.291 | x1.300 | x1.397 | x1.400 | x1.803 | x1.800 |
| sport machined | x1.400 | x1.400 | x1.524 | x1.531 | x2.051 | x2.050 |
| race | x1.455 | x1.450 | x1.603 | x1.600 | x2.299 | x2.300 |
| race machined | x1.564 | x1.570 | x1.762 | x1.758 | x2.599 | x2.600 |

Worst deviation 0.0091 on the 55 PS Wagon R, 0.0072 on the 63 PS City E and 0.0025 on the 157 PS
180SX, which is whole-PS rounding on a small denominator and nothing else: the deviation shrinks as
stock power rises. **The Supra, the car the ladder was set on, reads its authored figures exactly**:
324 / 389 / 454 / 518 / 583 / 664 / 745 / 842 PS.

Machining never reaches the next grade up, on any character, and the tuned high-strung margin at the
top (sport machined against race) is asserted rather than trusted.

### The power model, re-validated

`packages/sim/tests/harnessAcceptance.test.ts` passes untouched, 27 tests, all 26 cars on all four
courses within a tenth of the calibration harness. Nothing in `performance.ts`, `courses.json` or
`harnessReferenceTimes.json` was touched, and `git diff` on those four is empty.

The harness only covers STOCK power, so it cannot see a ladder movement at all. `machiningPowerModel.test.ts`
is what does, and it re-checks six properties, each measured rather than asserted:

1. Machining is **exactly inert** on every unmachined shipped car, and every one still laps its
   measured stock time on all four courses.
2. Power stays **order-independent** and monotonic in operations, on all three characters.
3. A machining gain is a fraction of **STOCK** power, so it adds the same PS to a stock engine and a
   fully built one, per grade.
4. A machined part **band-scales** exactly as a fitted part does.
5. Machining moves power and **nothing else the physics reads**: `physicalFactorsFor` is
   byte-identical machined against unmachined, and the lap is reached through `lapTimeSecondsFor`'s
   one path.
6. **New, because the ceiling actually moved this time:** the lap model is walked across the whole
   raised range, every rung of every car's own ladder, machined and not, on every course. **728
   adjacent pairs, zero non-monotone, zero non-finite.** More power never laps slower and nothing
   leaves the model at x2.60.

### Task 9: the catalogue on the authored ladder

The re-authored table keeps **each slot's own grade shape** rather than rescaling street and sport
uniformly off race, which is what makes it work. The catalogue's price ladders are bespoke per slot
(the ECU climbs x8.67 to race, the turbo x6.5, cams x4.5, everything else x3), so a flat power shape
laid over them puts one part far ahead on power per yen. `forcedInduction`'s own column is pinned to
its price ladder's ratios first, because one pricing-sheet entry serves all three engine characters,
and the other seven slots absorb the slack.

**The four pricing probes, measured, with no price movement at all:**

| probe | bound | before | uniform rescale | shipped |
| --- | ---: | ---: | ---: | ---: |
| value per yen, above parity | 1.35 | 1.335 | 1.414 (20/288 breach) | **1.137** |
| value per yen, below parity | 0.50 | 0.717 | 0.420 (12/288 breach) | **0.641** |
| cross-slot power-per-yen lead | 0.25 | 0.180 | 1.128 | **0.141** |
| forced induction price tracks power | 0.005 | 0.003 | 0.780 | **0.003** |

All four land exactly where the investigation predicted. The uniform rescale's cross-slot figure is
the one that mattered: it put a street ECU at 2.1 times the power per yen of anything else on a
boosted car, the one-correct-first-purchase defect that guard exists for.

**The race sums moved from 0.63 / 0.85 / 0.95 to 0.65 / 0.88 / 1.30** including forced induction, so
a `forced` engine's ceiling went x1.95 to **x2.30**. The two engines the old cap was measurably low
for land where they should (2JZ **745 PS** against a real 700 to 900, RB26 **644** against 600 to
800); the three the flat rise inflates (FD 587, Impreza 575, MR2 SW20 561) are accepted rather than
unresolved, per the ruling.

### `docs/carstats/` re-measured

All five files were brought back into line by re-running the code in this tree, never by hand
editing, and re-run a second time once the fractions actually moved. `power.md` gains machining as
input 2f and takes the largest revision of the five: the per-slot ladder tables, the race sums
(0.65 / 0.88 / 1.30), every ceiling (x1.45 / x1.60 / x2.30, and x1.56 / x1.76 / x2.60 machined), all
26 shipped maxima, the support-does-not-gate-power measurement (745 PS at `dangerous` against
exactly 745 PS fully supported) and the threshold-cliff figures. Its condition-ladder and per-slot
scrap-loss tables were re-run and hold unchanged, because neither reads `powerFraction`.

`authenticity.md`'s F1 and F2 both closed: `machiningCost` is live, and the lower clamp arm now
bites (a Supra kept on its castings and fully machined reads `36 - 48` and clamps to 0, so the
stat's true floor moved from 11 to 0 while the fully-modified floor of 11 is unchanged on all 26
cars). `reliability.md` documents the new intensity term, re-pins the per-character charge table and
the lowest reachable coherence factors, and re-verifies the four-term identity over 1,560 machined
combinations at 2.84e-14. `style.md` and `handling.md` each record that machining does not reach
them, verified at 52 of 52 cases rather than assumed. `README.md` gains machining as the one input
that is a property of a physical part and reaches three of the five stats at once.

One correction to the brief: `README.md` never carried a claim about `machiningCost` returning zero
as dead content, so there was nothing there to correct. That claim lived in `authenticity.md`'s F1
and F2, and both are rewritten rather than deleted.

### The test surface

New: `packages/sim/tests/machining.test.ts` (48), `machiningPowerModel.test.ts` (10),
`packages/game/src/screens/MachineShopScreen.test.ts` (8).

Touched, all directive 17 case (a): the content intentionally changed what is correct. Nothing was
loosened, and no bound, tolerance or acceptance threshold moved anywhere.

| file | why |
| --- | --- |
| `sim/tests/authenticity.test.ts` | "the machining seam" asserted `machiningCost` is 0 because no operation existed. It now asserts the new correct behaviour: 0 unmachined, the summed ratings machined, 48 for a full engine, nothing on an aftermarket part. |
| `content/tests/schemas.test.ts` | the exact top-level key set of `economy.json` gained `machining`. |
| `content/tests/economyApprovalGate.test.ts` | the `economy.json` hash moved for the machining block. Re-pinned in the same change as the recorded approval, listing the signed and the two proposed values by name. `partPricing.json` and `damagePatterns.json` are untouched, so their hashes hold. |
| `content/tests/partPricing.test.ts` | three measured maxima re-derived from a real run: 1.335 to **1.137** (87 of 288 above parity, was 39), lead 18.023 to **14.074 per cent** with a new leading pair, forced-induction rounding spread 0.317 to **0.297 per cent**. The three BOUNDS (1.35 / 0.50 / 0.25 / 0.005) are untouched. |
| `sim/tests/engineCharacter.test.ts` | the 72-entry per-slot fraction table, re-pinned to the authored numbers. |
| `sim/tests/proportionalPower.test.ts` | the five caps (1.45 / 1.60 / 2.30 / 1.65 / 1.88) and the 26-car `EXPECTED_MAX_POWER_PS` table, every entry taken from a measured run. Its band-scaling case also moved: it re-derived the worn delta by scaling the already-ROUNDED mint delta, inserting a second rounding step `computeDerivedStats` does not have (it accumulates unrounded and rounds once). At the old fraction the two agreed by coincidence; at the new one they differ by a PS. Corrected to scale the unrounded contribution, and it now pins the mint delta as well, so it is strictly tighter. |
| `sim/tests/supportRatios.test.ts` | the two worked tables. A maximal forced race build reads headline **0.985** (was 1.111) and a bare race turbo **0.635** (was 0.699), because the ladder asks x2.30 of the car where the supporting slots' grades are unchanged. Both keep their band (`adequate`, `dangerous`) and their named subsystem. |
| `sim/tests/reliabilityModel.test.ts` | five pinned figures moved with that demand rise (a maximal unsupported forced build 41 to 31, a bare race turbo 52 to 41). Every stated PROPERTY survives: still strictly below base, the headline still never moves across a band sweep, the supported ladder is still flatter than the unsupported one. |
| `sim/tests/dyno.test.ts` | the worked example of the naive-rounding gap. The guarantee is swept over every car, shape and band and passes untouched; the 180SX no longer disagrees under naive rounding at any grade or band, so the demonstration moved to a car that does. Re-pointed with a comment saying which build shows the gap is a property of the power curve, not of the arithmetic. |
| `sim/tests/marketValue.test.ts`, `coherenceValuation.test.ts`, `valueModelProbes.test.ts` | `installedPartsValueYen` gained a trailing `economy` argument. Mechanical; no expected value moved. |
| `game/src/screens/PartsMarketScreen.test.ts` | the race ECU's forced fraction 0.25 to 0.33, so the shop reads "P+33%". |
| `game/src/save/saveCodec.test.ts` | six `SAVE_VERSION` canaries, 55 to 56. |
| `game/src/screens/CarDetailScreen.test.ts` | its stub router gained the `machine-shop` route the new link resolves against. |

Content re-derived rather than authored: four formula-derived stat thresholds in `storyMissions.json`
(`make-it-pull` power 173 to 171, `the-column-clock` 125.8 to 125.9 s, `street-power-street-manners`
reliability 74 to 71, `under-one-fifteen` 113.5 to 112.8 s). These are recomputed from a fresh probe
measurement by `storyMissionProbes.test.ts` and are not gated by the approval hash, the same class of
mechanical re-derivation the gate's own header already records. **Every mission payout and budget cap
holds unchanged**, since probe costs are part prices and no price moved.

**The whole suite: 178 files, 3,648 tests, all passing.** `pnpm typecheck` clean across all three
packages (directive 20's carve-out, since this retires a signature and adds a persisted field),
`pnpm lint` clean, `pnpm format` clean.

### Left open

- **The two proposed levers await ratification**: `reliabilityCostPerOperation` 0.004 and
  `valuePremiumPerOperation` 0.03.
- **Machining as a fifth play**, once the plays ranking can read what the shop already owns.
- **Per-engine headroom**, which is what would separate the legendary blocks from the rest rather
  than one flat multiplier. It needs authoring for all 94 roster rows under directive 24, so it is a
  sprint of its own; `TODO.md` carries it.
- `beyondDiscount` stays dead, exactly as the design said it would.
