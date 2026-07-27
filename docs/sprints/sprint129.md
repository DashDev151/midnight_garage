# Sprint 129: what condition does to performance

**Status: APPROVED, IMPLEMENTING.** Maintainer instruction 2026-07-27: pick sane preliminary values
now, ground them in real degradation, err conservative, and **document every one as provisional so
it can be revisited**. Verbatim: *"you know what mint should behave like, scale each down from
there grounding in real world performance degradation principles. air on the conservative side."*

**Every number in section "The curves" below is a provisional default, not a measurement.** None of
it is calibrated against driven data, because no driven data exists for a worn car. They are
first-pass values chosen to be defensible and gentle, and they are expected to be tuned.

Opens after Sprint 128. Third of four in the porting arc.

## The gap, stated plainly

A car's measured figures are the figures of a **stock car in good order**. Today a worn engine and
dead tyres move the four abstract stats and nothing physical: a car with scrap tyres laps exactly as
fast as the same car on fresh ones, because condition never reaches the lap model. After Sprint 128
that is the largest remaining lie in the sim, because the lap model will be precise about a car
whose condition it ignores.

## Reuse analysis (directive 16)

### Genuinely new

Only the mapping: **which physical dial each component group degrades, and by how much at each
band**. Nothing else here is new, and that is the point.

### Existing mechanisms reused, unchanged

- **`weightedBandFactorForStat` and the taxonomy's `statWeights`** (`derivedStats.ts`,
  `parts-taxonomy.json`). This is the whole condition machinery and it already does exactly the
  required job: take a group's parts, weight them, produce a factor. It gets pointed at physical
  dials instead of abstract stats. **Do not build a second condition system.** The Sprint 08
  service-jobs rework is the standing warning against precisely that.
- **The band vocabulary** (scrap through mint) is unchanged.
- **The ratio bridge from Sprint 128.** Condition scales the same ratios a build scales, so the two
  compose without a third mechanism.

## The trap that must be designed around, not discovered

**Double counting.** After Sprint 128, effective power is `rPower x Pw_now`, and `Pw_now` already
carries engine condition through `derivedStats`. If this sprint also applies an engine-condition
factor to `rPower`, worn engines are punished twice and the model quietly stops reproducing its own
measurements.

The rule that avoids it: **each physical dial has exactly one condition path, named in the lever
table.** Anything already flowing through `Pw_now` must not be reapplied. The sprint's first task is
an audit that writes down, dial by dial, where condition already reaches it today.

## The dials and their plausible owners

A starting map for the design session, not a decision:

| Dial | Component group | Why |
|---|---|---|
| mechanical grip `mu` | tyres, suspension | contact patch and how well the car uses it |
| braking `bmu` | brakes (and tyres) | tyres appear twice, which is real and needs one path chosen |
| effective power `pEff` | engine, forced induction, exhaust | **already partly covered via `Pw_now`** |
| driveline loss | drivetrain | today a fixed 0.88 |
| drag / downforce | body, aero | a damaged splitter should cost downforce |

**Tyres and the brakes both wanting `bmu` is the sharpest question in the sprint**, because braking
is measured as one coefficient and the game models the two parts separately.

## The mechanism

`weightedBandFactorForStat` already walks the taxonomy, reads `entry.statWeights[stat]`, and
averages `bandFactor(band)` over the parts that carry a weight. Reuse that traversal exactly.
Two things have to be parameterised rather than shared:

1. **A per-dial weight key.** The taxonomy gains `physicalWeights` alongside `statWeights`.
2. **A per-dial band curve.** The existing `bands.bandFactors` is
   `mint 1.00 / fine 0.85 / worn 0.65 / poor 0.40 / scrap 0.15`, which is right for a stat
   CONTRIBUTION and catastrophic as a multiplier on a physical dial: scrap tyres would give a grip
   coefficient of 0.13 and the car would not move. Physical dials get their own, far gentler
   curves.

## The weights (which part degrades which dial)

| Dial | `physicalWeights` |
|---|---|
| `grip` | tyres 3, dampers 2, springs 2, antiRollBars 2, steering 1, rims 1 |
| `braking` | brakePadsDiscs 3, brakeCalipersLines 2 |
| `driveline` | clutch 2, driveline 2, gearbox 1, differential 1 |
| `aero` | aero 3, panels 1, underbody 1 |

**Tyres belong to `grip` alone, and `grip` and `braking` must stay disjoint part sets.** The
original table had tyres on both dials, justified as "one path each into two dials". That reasoning
was wrong, and it was corrected during implementation: it assumed the two dials were independent,
and they are not. The model DERIVES the braking coefficient from mechanical grip
(`bmu = rBrake x mu`), so a tyre weighted on both would reach braking twice, once through `mu` and
once through the dial (about 9.8% for scrap tyres where the honest figure is about 5.5%). The `mu`
path already carries the tyre at the right magnitude, because braking and cornering both scale
roughly proportionally with tyre grip in reality; the `braking` dial carries what the brake
HARDWARE contributes on top, which is what its name says.

**There is deliberately no `power` dial here.** Engine condition already reaches the model through
`Pw_now`, because the ratio bridge scales effective power by the car's CURRENT power and
`derivedStats` already applies engine condition to that. Adding a second factor would punish a worn
engine twice and stop the model reproducing its own measurements.

## The curves (ALL PROVISIONAL)

`statFormulas.condition.bandFactor`:

| Dial | mint | fine | worn | poor | scrap | Grounding |
|---|---|---|---|---|---|---|
| `grip` | 1.000 | 0.975 | 0.935 | 0.875 | **0.800** | A bald or perished tyre loses roughly a fifth of its dry grip. The steepest curve here, because tyres carry the most weight and degrade the most honestly. |
| `braking` | 1.000 | 0.980 | 0.950 | 0.900 | **0.840** | A single stop from 97 km/h is mostly tyre-limited; worn pads and discs cost less on one stop than intuition suggests. Fade over repeated stops is not modelled at all. |
| `driveline` | 1.000 | 0.995 | 0.980 | 0.960 | **0.930** | A slipping clutch and a tired diff cost mostly drivability, not steady-state thrust. The gentlest curve on purpose. |
| `aero` | 1.000 | 0.990 | 0.960 | 0.900 | **0.800** | A cracked splitter or a damaged wing loses real downforce, and body damage is visible, so it should read. |

Every one is a first-pass judgement, not a measurement. The honest ceiling on all of them: **at mint
every factor is exactly 1.000**, so a car in good order reproduces its measured figures to the last
bit and this sprint cannot disturb the calibration.

## Scope line

Condition only. What an aftermarket part does is Sprint 130. A worn part and a better part are
different questions and mixing them makes both untestable.

## Definition of done

- [x] A lever table naming every dial, its single condition path, and its factor at each band,
      signed before any agent runs. ("The weights" and "The curves" above; both landed verbatim.)
- [x] An audit proving no dial is degraded twice. It found one: the weights table's own
      tyres-on-both-dials rule was a double count, and the weights were corrected. See "The
      correction the audit found" in the Exit, the audit table beside it, and the tests that prove
      both the engine and the braking cases rather than asserting them.
- [x] A car at mint reproduces its measured figures **exactly**, so the model's calibration is
      untouched by this sprint at the top of the band. This is the acceptance test.
- [x] Values and prices unmoved: performance and value are independent. No pricing lever, formula
      or part price moved. One knock-on is real and is disclosed below: buyer taste reads the
      handling stat, and a worn car's handling stat is now lower.

## Exit

**Status: ready for review.** Condition reaches the physics. A car on scrap tyres no longer laps
like a car on fresh ones, and a car in good order still reproduces its measured figures to the bit.

### What landed, and where

| File | Change |
|---|---|
| `packages/content/src/tags.ts` | `PhysicalDialSchema` / `PhysicalDial`: the four-dial vocabulary (`grip`, `braking`, `driveline`, `aero`), with the no-`power`-dial rule stated where the vocabulary is defined. |
| `packages/content/src/carPart.ts` | `PhysicalWeightsSchema` and the taxonomy entry's optional `physicalWeights` (defaults to zero on every dial, so the parts that move nothing need no data). |
| `packages/content/data/parts-taxonomy.json` | The 15 weighted entries, exactly as the weights table above. |
| `packages/content/src/economy.ts` | `statFormulas.condition.bandFactor`, one five-band curve per dial, documented as PROVISIONAL in the schema itself. |
| `packages/content/data/economy.json` | The four curves, exactly as the curves table above. |
| `packages/sim/src/derivedStats.ts` | `weightedBandFactorForStat`'s traversal generalised to `weightedBandFactor(car, model, taxonomy, weightOf, factorOf)`; the stat version is now a two-line caller of it and the new `physicalConditionFactors` is the other. No second walker. |
| `packages/sim/src/performance.ts` | `ConditionFactors` + `MINT_CONDITION_FACTORS`; `effectiveGrip` gains a condition factor; `carBlock` spends all four; `lapTime` takes them, defaulting to mint. |
| `packages/sim/src/lapModel.ts` | `lapTimeSecondsFor` computes the car's factors and passes them, so the game-facing lap sees real condition. |
| `packages/sim/tests/conditionPhysics.test.ts` | New: 12 tests covering the mint identity, the single power path, grip/braking disjointness, monotonicity, magnitude, and the game-facing entry point. |

### The correction the audit found

The design table above put `tyres` on both `grip` and `braking`, justified as "one path each into
two dials". **That justification was wrong and the weights were changed during implementation.** The
two dials are not independent: the model derives the braking coefficient from mechanical grip, so a
tyre weighted on both reaches braking twice. It is invisible on a uniformly-banded car (every factor
sits at its own floor whatever the weights are), and shows only when tyres and brakes are in
different bands, which is the normal case: scrap tyres with mint brakes were costing about 9.8% of
braking where the honest figure is about 5.5%. `tyres` now belongs to `grip` alone, `braking` is
brake hardware only, and three tests pin it, including the structural one (no taxonomy part may
carry weight on both dials) so it cannot come back by hand-editing content.

Not one figure in the scrap-versus-mint table below moved: the fully scrap braking factor is 0.840
either way, because a weighted mean of a constant is that constant.

### The audit: one dial, one path

| Dial | Parts that reach it | Where it lands | Reached anywhere else? |
|---|---|---|---|
| `grip` | tyres 3, dampers 2, springs 2, antiRollBars 2, steering 1, rims 1 | inside `effectiveGrip`, so the lap and the handling readout share it | No. Braking and launch traction scale off `mu` structurally (the ratio bridge, exactly as a change of tyre does), which is the model's own shape, not a second condition path. |
| `braking` | brakePadsDiscs 3, brakeCalipersLines 2 | `carBlock`'s `brakeMu`, on top of `mu` | No, and this is where the design table was wrong and got fixed. Tyres were on this dial too; since `bmu` derives FROM `mu`, that reached braking twice. Tyres now belong to `grip` alone and the two part sets are disjoint. |
| `driveline` | clutch 2, driveline 2, gearbox 1, differential 1 | `carBlock`'s crank-to-wheel conversion (so it costs both acceleration and top speed) | No. Disjoint from the engine parts that carry `statWeights.power`. |
| `aero` | aero 3, panels 1, underbody 1 | `carBlock`'s `downforceCoeff`, and the same factor on the displayed downforce | No. |
| power | (none by design) | already in the car's CURRENT power via `derivedStats`, which the ratio bridge scales | Proven, not assumed: see below. |

**Interpretation call worth reviewing.** The instruction named the display explicitly for `grip`
("both the lap and the displayed handling stat see it"), and was silent for `aero`. The aero factor
is applied to the displayed downforce as well, on the same reasoning: the handling readout is
effective grip at a reference speed, so leaving downforce undegraded there would let the readout and
the lap disagree about a damaged wing, which is the exact divergence the grip rule exists to
prevent. Trivial in practice, since no stock car carries factory downforce.

### The mint identity, proved

- `physicalConditionFactors` on a fully mint car returns exactly `{grip: 1, braking: 1,
  driveline: 1, aero: 1}` (strict equality, not a tolerance).
- For all 26 shipped cars on all 4 shipped courses, the lap computed WITH those factors is
  bit-identical (`toBe`) to the lap computed with no condition argument at all.
- `harnessAcceptance.test.ts` passes **unchanged**: not one shipped lap time moved.

### The single power path, proved

A Civic with its whole engine group at `worn` and everything else mint:

- returns all four physical factors at exactly 1.000 (no dial answers to the engine at all);
- its derived power falls to 140 PS from 170 PS stock (the one path);
- the lap at that power WITH its factors is bit-identical to the lap at that power with mint
  factors, on every course, and both are slower than the same car at stock power.

So engine condition is charged once, through `Pw_now`, and never again.

### What a fully scrap car loses, versus mint

Every part at `scrap`, at stock power and stock compound, so only the four dials vary
(factors: grip 0.800, braking 0.840, driveline 0.930, aero 0.800). Representative rows, and the
range across the whole 26-car roster:

| Car | Hakone | Wangan | Misaki | Yatabe (standing km) |
|---|---|---|---|---|
| Honda City E | 131.81 -> 147.49 (+11.9%) | 195.95 -> 202.74 (+3.5%) | 143.74 -> 150.44 (+4.7%) | 34.90 -> 36.47 (+4.5%) |
| Civic SiR-II | 122.24 -> 137.58 (+12.6%) | 150.04 -> 162.15 (+8.1%) | 116.32 -> 128.52 (+10.5%) | 26.89 -> 28.15 (+4.7%) |
| Silvia K's S14 | 117.96 -> 132.40 (+12.2%) | 139.07 -> 154.87 (+11.4%) | 109.58 -> 122.32 (+11.6%) | 26.40 -> 27.51 (+4.2%) |
| RX-7 FD3S | 113.69 -> 128.10 (+12.7%) | 134.78 -> 149.84 (+11.2%) | 106.18 -> 118.79 (+11.9%) | 24.29 -> 25.40 (+4.6%) |
| Skyline GT-R BNR32 | 114.06 -> 128.29 (+12.5%) | 135.60 -> 150.53 (+11.0%) | 107.10 -> 119.48 (+11.6%) | 24.11 -> 25.12 (+4.2%) |
| **Roster range** | **+11.9% to +13.2%** | **+3.5% to +11.4%** | **+4.7% to +11.9%** | **+4.2% to +6.6%** |

Reading it: Hakone is tight and grip-limited, so it is where a ruined car is punished hardest, and
uniformly so. Wangan splits the roster honestly, from +3.5% for a kei car that is power-limited on
the straights whatever its tyres are doing, to +11.4% for a fast car living in the sweepers. Yatabe
is a standing kilometre, so only launch traction and driveline can touch it.

**Whether ~12.5% on a touge is right for a car with bald tyres, dead dampers, worn steering, worn
brakes and a slipping clutch is the judgement to review.** It is defensible and it errs gentle: a
real car in that state would struggle to be within 12% of its own best. The guard test pins the
whole-roster spread at 3% to 15%, which catches a dial that stops reaching the physics (the loss
collapses) or one applied twice (it roughly doubles).

The braking chain, stated plainly, because it is the one that had to be corrected. Tyre condition
reaches braking ONLY through `mu`; brake hardware condition reaches it only through the braking
dial; the two part sets are disjoint and a test pins that. A fully scrap car therefore ends at
grip 0.800 x braking 0.840 = 0.672 of stock braking, which is the model's own shape (braking derives
from mechanical grip, exactly as it does for a change of tyre) plus one condition path for the
hardware. It lands close to reality, where bald tyres cost far more stopping distance than tired
pads do.

### The knock-on that is not a lap time

Handling is the grip readout, and the grip it reads is now the degraded one, so a worn car reads
lower than it did. A uniformly-banded Civic, 0-100 handling stat:

| Band | Before | After |
|---|---|---|
| mint | 25 | 25 |
| fine | 20.8 | 19 |
| worn | 16.6 | 13 |
| poor | 10.2 | 6 |
| scrap | 3.5 | 1 |

Buyer taste reads that stat, so a worn car's taste-adjusted offer moves with it. No pricing lever,
formula or part price changed; this is the intended consequence of the readout telling the truth
about grip, and it is disclosed here rather than buried.

### Directive 17 calls (both case (a): the test asserted a value the change deliberately moves)

1. `packages/sim/tests/advanceDay.test.ts`'s acquisition-to-sale state hash `870d2e11` ->
   `cab6fe88`. That pin's own comment states the rule: it is re-derived from a real run whenever the
   rolled condition, the derived stats or the taste-adjusted price deliberately change. The
   generated car's parts are not mint, so its handling stat and therefore its sale price moved. Not
   a regression: the golden master itself (`advanceDay` day-by-day) and all 1,476 other sim tests
   passed untouched.
2. `packages/content/tests/economyApprovalGate.test.ts`'s economy hash, re-pinned in the same change
   as this doc's recorded approval of `statFormulas.condition.bandFactor`, per directive 22. The
   re-pin comment names the specific lever and every value.

### Still provisional

Every number in "The curves" is a first-pass judgement, not a measurement, and the code says so in
the schema comment as well as here. Nothing here is calibrated against a driven worn car, because no
such measurement exists. The mint end is exact and cannot drift; everything below it is a tuning
knob waiting for a reason to move.

### Checks

`pnpm test`: **141 files, 2,376 tests, all passing.** `pnpm typecheck` clean across content, sim and
game; ESLint and Prettier clean on every touched file.

```text
 Test Files  141 passed (141)
      Tests  2376 passed (2376)
   Duration  55.39s
```
