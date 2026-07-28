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

**Corrected by the maintainer 2026-07-28.** The first pass below was far too mild for what the bands
actually mean. The bands are condition percentages (mint 90+, fine 70-90, worn 40-70, poor 15-40,
scrap under 15), and the curves are now scaled to that: a `worn` part is HALF WORN OUT and should
read as a car that needs parts, `poor` is genuinely degraded and past any legal limit, and `scrap` is
junk. `statFormulas.condition.bandFactor`:

| Dial | mint | fine | worn | poor | scrap | Grounding |
|---|---|---|---|---|---|---|
| `grip` | 1.000 | 0.960 | 0.880 | 0.740 | **0.550** | Rubber is what a lap is made of and it degrades the most honestly. A `worn` tyre is half worn out; a `scrap` one is perished, cracked or bald. |
| `braking` | 1.000 | 0.950 | 0.860 | 0.700 | **0.500** | Brake HARDWARE only: the rubber's share of stopping already arrives through `mu`. See below - this curve falls faster than grip at every band, deliberately. |
| `driveline` | 1.000 | 0.985 | 0.950 | 0.890 | **0.800** | The gentlest curve, on purpose. A slipping clutch and a tired diff cost mostly drivability, not steady-state thrust. |
| `aero` | 1.000 | 0.980 | 0.930 | 0.840 | **0.680** | A cracked splitter or a damaged wing loses real downforce, and body damage is visible, so it should read. |

**The braking curve, corrected a second time in the same change, and why it now falls faster than
grip.** The first justification was that a single stop is mostly tyre-limited and brake hardware
mainly buys repeatability the model does not simulate. That does not survive contact with what the
model is used for. **The braking coefficient here is a LAP-AVERAGE, not a first-stop figure.** A lap
of these courses is nine to eleven braking events in a few minutes; worn pads, tired fluid and
heat-cycled discs fade across that, and fade arrives early and easily on exactly the hardware a
`worn` or `poor` car is carrying. A lap-average coefficient therefore degrades considerably harder
than a single measured stop would suggest. That is the correct reading of the quantity the model
consumes, not a thumb on the scale.

**Two of the scrap entries are unreachable by construction**, and are kept only so the curves are
complete rather than because there is anything in them to tune: `braking`'s, because both its
carriers (`brakePadsDiscs`, `brakeCalipersLines`) are in the `scrapDisablesCar` set below, and
`driveline`'s, because all four of its carriers are. Any car that would contribute either is already
gated as undrivable. `grip`'s scrap entry IS reached, through dampers, springs, anti-roll bars and
rims, none of which gate; `aero`'s is reached throughout. A test pins all four findings.

Every one is STILL a first-pass judgement, not a measurement, and nothing here is calibrated against
a driven worn car. The honest ceiling on all of them: **at mint every factor is exactly 1.000**, so a
car in good order reproduces its measured figures to the last bit and this sprint cannot disturb the
calibration. That is what makes the rest of it safe to tune.

## Wear is gradual until it is not (added by the same correction)

The curves above assume every component fades. Many do not. **Some are binary: they work or they do
not.** A dead ignition system does not leave a car down on power, it leaves it not starting. A
cracked block is not 57% power, it is a dead engine. So the rule is **gradual until scrap, then
binary for the components that are genuinely function-or-fail**, and both halves are true of the same
part: worn plugs misfire under load, which is a real and gradual power loss the stat curves already
carry, and scrap ignition does not start.

The taxonomy gains `scrapDisablesCar`, set on fifteen entries, and `lapTimeSecondsFor` returns no
time when any of them is scrap-band, missing or unresolvable (an absent part being strictly worse
than a ruined one). The flag is read from the content, never from a list in code, so a part cannot be
added to the game and silently escape the rule.

| Group | Parts | Physical reason |
|---|---|---|
| Engine, will not run | `block`, `internals`, `headValvetrain`, `camsTiming`, `fuelSystem`, `ignitionEcu`, `cooling` | Cracked and losing oil and coolant; a spun bearing or a holed piston; a dropped valve; a snapped belt, terminal on an interference engine; a dead pump and no fuel; no spark; seizes within minutes. |
| Drivetrain, no drive reaches the road | `gearbox`, `clutch`, `differential`, `driveline` | Nothing left inside to transmit anything. |
| Cannot be controlled or stopped | `steering`, `brakePadsDiscs`, `brakeCalipersLines`, `tyres` | Nothing to point it with, nothing to stop it with, nothing to grip the road with. |

**What is deliberately NOT gated**, and why the line is drawn on physics rather than on importance:
`dampers` and `springs` (a car on blown dampers genuinely drives, unpleasantly and unsafely at speed,
and the steepened grip curve already charges scrap dampers about 8% of mechanical grip), `intake`,
`exhaust`, `forcedInduction` (a destroyed turbo still runs, badly), `chassis`, `antiRollBars`,
`rims`, and every body and interior part.

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
| `packages/sim/src/lapModel.ts` | `lapTimeSecondsFor` computes the car's factors and passes them, so the game-facing lap sees real condition. The tyres-only refusal becomes `lapBlockers(car, context)`, driven off `scrapDisablesCar`, and the lap refuses on exactly that predicate so a refusal and its reason can never disagree. |
| `packages/sim/src/requirements.ts` | `evaluateLapTimeCeiling` reports the parts responsible instead of a bare "no time set": the verdict comes from the worst-affected group and the parts are named, or counted past three. |
| `packages/sim/tests/conditionPhysics.test.ts` | 47 tests: the mint identity, the single power path, grip/braking disjointness, monotonicity, magnitude, the game-facing entry point, one gate test per disabling slot in both the scrap and the missing case, the two non-gating counter-cases, which dials can see a scrap contribution at all, and the power-floor reachability proof. |

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

Not one figure in a uniformly-banded car's table moved: at any uniform band the braking factor is
that band's own value either way, because a weighted mean of a constant is that constant.

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

### What a worn car loses, versus mint (ALL PROVISIONAL)

The whole car through the game-facing `lapTimeSecondsFor`, every part at the same band, so this is
what a player's car actually does: the four dials plus the power the engine's own condition costs it.
Three cars spanning the roster, seconds and per cent slower than the same car at mint.

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

**Uniform `scrap` is no time on every car and every course**, which is the gate doing exactly what it
is meant to: fifteen parts are ruined, seven of which mean the engine will not run at all. That is
the intended answer, not a hole in the table.

The four dials ALONE, holding power at stock so only the curves vary, across the whole 26-car roster
(the same measurement the old table made, so the correction is directly comparable):

| Band | Hakone | Wangan | Misaki | Yatabe |
|---|---|---|---|---|
| fine | +2.1% to +2.3% | +0.6% to +2.0% | +0.8% to +2.1% | +0.8% to +1.1% |
| worn | +6.8% to +7.5% | +2.0% to +6.4% | +2.5% to +6.7% | +2.6% to +3.8% |
| poor | +17.3% to +19.3% | +5.0% to +16.9% | +6.9% to +17.0% | +6.4% to +9.6% |
| scrap (dials only, unreachable in play) | +40.1% to +45.2% | +11.7% to +37.5% | +18.1% to +38.6% | +14.0% to +22.7% |

Reading it: Hakone is tight and grip-limited, so it is where a worn car is punished hardest, and
uniformly so. Wangan splits the roster honestly, from the low end for a kei car that is power-limited
on the straights whatever its tyres are doing, to the high end for a fast car living in the sweepers.
Yatabe is a standing kilometre, so only launch traction and driveline can touch the dials there; the
larger whole-car figure on that course is mostly the engine's own power loss.

### Grip versus braking, on the course where it shows

Hakone is the corner-heavy one, so it is where the balance between the two dials is judged. Each
column is that dial degraded ALONE with the other three at mint, so the split is visible rather than
buried in one number:

| Car | Band | Both plus the rest | Grip alone | Braking alone |
|---|---|---|---|---|
| Honda City E | fine | +2.1% | +1.7% | +0.2% |
| | worn | +6.8% | +5.6% | +0.5% |
| | poor | +17.3% | +14.5% | +1.3% |
| Silvia K's S14 | fine | +2.2% | +1.8% | +0.2% |
| | worn | +7.1% | +5.8% | +0.7% |
| | poor | +18.1% | +14.7% | +1.7% |
| Skyline GT-R BNR32 | fine | +2.2% | +1.8% | +0.2% |
| | worn | +7.2% | +5.9% | +0.7% |
| | poor | +18.5% | +15.0% | +1.9% |

**The two do not sum to the whole, and that is the model's shape, not an error.** Braking derives
FROM mechanical grip (`bmu = brakeRatio x mu x braking`), so the grip column already carries a
proportional share of the car's stopping, and the braking column is only what the HARDWARE fade adds
on top of the rubber. That is also why the braking dial reads small even at these steeper values: a
`poor` car has already lost 26% of its grip, which costs it stopping distance as well as apex speed,
and the hardware's own 30% fade is charged after that. A uniformly `poor` car ends at
grip 0.740 x braking 0.700 = 0.518 of stock braking.

The guard test pins the dials-only whole-roster scrap spread at 10% to 50%, which still catches a
dial that stops reaching the physics (the loss collapses) or one applied twice (it roughly doubles).
It measures through `lapTime` directly rather than the game-facing entry point, because a fully scrap
car sets no time at all now and the dials cannot otherwise be read at the bottom of the range, which
makes it a probe of the curves rather than of a reachable state.

### A refusal that carries its reason

Fifteen parts can now stop a car being driven, so "no time set" on its own would leave a player with
no way to tell whether the rubber is shot, the ignition is dead or the gearbox is finished. The
`lapTimeCeiling` requirement names the culprits instead, off the same `lapBlockers` the lap model
itself refuses on, so the refusal and its reason can never disagree:

| Car | What the checklist says |
|---|---|
| No tyres fitted | `Won't steer or stop: Tyres` |
| Scrap ignition | `Won't run: Ignition & ECU` |
| Scrap gearbox and clutch | `Won't turn a wheel: Gearbox, Clutch` |
| Every part scrap | `Won't run: 15 parts finished` |

The verdict comes from the worst-affected group (an engine that will not start settles the question,
so the brakes are not the headline), and past three dead parts the list becomes a count: a player
reading "15 parts finished" already knows what the car needs.

### The lever question this resolved rather than raised

`powerConditionFloor` is 0.5, which meant a car with every power-weighted part at scrap still
computed 57.5% of stock power: a cracked block and destroyed internals making over half the
horsepower. **That case is now unreachable for any car that can be driven, and it is proved rather
than assumed.** Reaching the floor requires `internals`, `camsTiming` and `ignitionEcu` all at scrap,
and all three carry `scrapDisablesCar`, so such a car sets no time on any course; a test asserts both
halves together (the power stat lands exactly on the floor, and the lap is null on all four courses).
The floor now only ever binds at `worn` and `poor`, where 82.5% and 70% of stock power are what a
tired engine should make. **`powerConditionFloor` is not moved.**

One honest limit on that claim: the gate governs LAP TIMES, not the power stat. A wreck sitting in
the workshop still displays 98 PS on a 170 PS Civic. That is the workshop telling the player what
they have got, and nothing in this sprint touched it.

### The knock-on that is not a lap time

Handling is the grip readout, and the grip it reads is now the degraded one, so a worn car reads
lower than it did. A uniformly-banded Civic, 0-100 handling stat:

| Band | Before this sprint | First pass | Corrected |
|---|---|---|---|
| mint | 25 | 25 | 25 |
| fine | 20.8 | 19 | 18 |
| worn | 16.6 | 13 | 10 |
| poor | 10.2 | 6 | 1 |
| scrap | 3.5 | 1 | 0 |

Buyer taste reads that stat, so a worn car's taste-adjusted offer moves with it. No pricing lever,
formula or part price changed; this is the intended consequence of the readout telling the truth
about grip, and it is disclosed here rather than buried.

### Directive 17 calls (all case (a): the test asserted a value the change deliberately moves)

1. `packages/sim/tests/advanceDay.test.ts`'s acquisition-to-sale state hash `870d2e11` ->
   `cab6fe88` -> `094f84e8`. That pin's own comment states the rule: it is re-derived from a real run
   whenever the rolled condition, the derived stats or the taste-adjusted price deliberately change.
   The generated car's parts are not mint, so its handling stat and therefore its sale price moved.
   Not a regression: the golden master itself (`advanceDay` day-by-day) and every other sim test
   passed untouched.
2. `packages/content/tests/economyApprovalGate.test.ts`'s economy hash, re-pinned in the same change
   as this doc's recorded approval of `statFormulas.condition.bandFactor`, per directive 22. The
   re-pin comment names the specific lever and every value, first pass and correction both.
3. `packages/sim/tests/conditionPhysics.test.ts`'s magnitude guard, 3-15% -> 10-50%. The band is the
   measured spread and the change deliberately moved it; loosening was not the fix, re-measuring was.
4. `packages/sim/tests/requirements.test.ts`'s "fails with actual 'no time set' when the tyres slot is
   empty". The refusal now carries its reason, so the assertion is the reason string. Rewritten as
   four cases (one per verdict group, plus the count form) rather than re-pointed at one value.

**No other test anywhere expected a lap time from a car that can no longer set one.** The full suite
was searched by running it: the four above are every assertion the change moved.

### Still provisional

Every number in "The curves" is a first-pass judgement, corrected once by eye and still not
calibrated against a driven worn car, because no such measurement exists. The code says so in the
schema comment as well as here. The mint end is exact and cannot drift; everything below it is a
tuning knob waiting for a reason to move. `scrapDisablesCar` is not in that category: it is a
statement about what a broken component physically does, not a number to tune.

### Checks

`pnpm test`: **142 files, 2,427 tests, all passing.** `pnpm typecheck` clean across content, sim and
game.

```text
 Test Files  142 passed (142)
      Tests  2427 passed (2427)
   Duration  55.95s
```
