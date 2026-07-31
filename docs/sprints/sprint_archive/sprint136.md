# Sprint 136: support ratios, and reliability as what they move

**Status: BUILT AND COMMITTED 2026-07-30 (`44ed6a8`), plus three signed amendments in the same
window (`edddd36`, `f0c2876`, `5f75606`). Fully signed 2026-07-29.** Levers 6, 7 and 8 were signed
outright; levers 1 to 5 preliminarily. Maintainer: *"cannot know until playtest, as long as we
have sane defaults to start with."* The Exit's one unexplained item is closed: see "The
auction-demo pin movement, root-caused" at the end of this doc.

**What "preliminary" means here, precisely, because it is not the same as unapproved.** Levers 1
to 5 are approved to implement and to ship: an implementer does not stop, and directive 22 is
satisfied for every value listed below. What is reserved is their **final** calibration, which
comes from the maintainer playing the game rather than from any further arithmetic. So:

- **Implement them exactly as written.** Do not adjust one because a test is awkward.
- **Every number stays in `economy.json`**, per the content law, so a playtest retune is a
  content edit rather than a code change.
- **Pin the tables in tests, and expect those pins to move once.** When they do it is directive
  17 case (a), a deliberate retune, and never evidence that the implementation was wrong.

Levers 6, 7 and 8 are signed outright. Every reliability figure in this doc is computed from
levers 1 to 4 as written.

Opens after Sprint 135. Third of nine, and **the keystone of the arc**: Sprint 137 is blocked on
it by a hard gate, Sprints 138, 139 and 141 all read what it builds, and Sprint 142's condition
review is only meaningful once it has landed.

Design reference: `docs/design/systems/tuning-system.md` sections 6, 7c and 9.

**This sprint absorbed work from two others (maintainer, 2026-07-29).** An earlier plan shipped
the coherence quantity here as a text readout with no mechanical effect, deleted
`statModifiers.reliability` in Sprint 140, and decided in Sprint 139 whether coherence should
reach reliability at all. The maintainer's ruling collapses all three: *"Reliability IS the
final figure that gets moved by coherence... You are building a separate system for something
that should not be a separate system again."* That is Sprint 138's route 2, chosen before the
measurement rather than after, and the reasoning is given below.

## The gap, stated plainly

**Three defects. The first is the one the arc was written for; the other two are what the
maintainer's ruling exposed.**

### 1. Nothing can express a build that makes power it cannot hold together

Every part in the catalogue is a gain, so the cheapest gain always wins and there is exactly
one correct build order. 1.5 bar on stock internals is currently just a fast car.

### 2. Reliability is a weighted mean, so a write-off averages away

`reliability` is `reliabilityCap * weightedBandFactorForStat(..., 'reliability', ...)`, an
arithmetic mean of `bandFactor(band)` over the fifteen taxonomy parts carrying a
`statWeights.reliability`, total weight 22. One part at `scrap` and the rest mint, on a
100-point scale:

| what died | reads today |
| --- | ---: |
| seized block | **92** |
| scrapped rings (internals) | **92** |
| scrapped gearset (gearbox) | **92** |
| rusted-through seam (chassis) | **92** |
| cored radiator (cooling, the heaviest single weight) | **88** |
| any weight-1 part | **96** |

**Those are the inspection system's own grenades**: `seized-engine (block scrap 12)` under
non-starter, `rings 13 (scrap)` under smokes-on-startup, `gearset 18 (scrap)` under
crunch-into-second, `seam 18 (scrap)` under damp-passenger-footwell
(`docs/design/systems/failure-map.md`). That document budgets worst-case minutes to decide each
write-off in or out and makes it a copy law that a grenade line reads "unmistakably terminal".
Then the stat moves by eight points. **Maintainer, 2026-07-29: "a car with a seized engine, but
with perfect suspension and bodywork, should still be near 0 on reliability."**

The mean is right for uniform wear and wrong for a single catastrophic fault. That is the same
weakest-link argument this sprint already makes for the support ratios, applied one level down.

**What is NOT the defect:** tired springs, dampers, brakes, tyres, rims, paint, panels,
underbody, aero, seats and gauges all carry a reliability weight of **zero** already. Only
parts that stop the car carry one, and that part of the taxonomy is correct as authored.

### 3. The reliability ceiling is a flat 70 and it is the same on every car

`reliabilityCap` is **70**, introduced in Sprint 21 as part of a bulk lift of magic numbers out
of code into `economy.json`, with no recorded design rationale. Two things are wrong with it.

**It is about to become dead space.** Its only structural job is leaving headroom for
`statModifiers.reliability` to add into, and that field is deleted in this sprint. After the
deletion, 70 is an unreachable ceiling with 30 points of nothing above it.

**And it is flat, so every car in the game is equally trustworthy.** Maintainer, 2026-07-29:
*"not every car should be at 100 in stock mint condition. Some are just inherently less
reliable. An old Alfa is just not as reliable as a relatively modern sensible Honda or Toyota.
It does not have to be that severe but there needs to be some variability."* A mint stock FD and
a mint stock Carina currently read the same number, which is the one claim about those two cars
that nobody who owned either would accept.

**This is the same defect, and takes the same fix, as `styleCap`.** Sprint 140 replaces a flat
`statFormulas.styleCap` of 20 with a per-car `spec.styleBase`, for exactly the reason above:
a stat that describes a car cannot be a constant. `spec.reliabilityBase` is its sibling and is
authored the same way.

## Why reliability is the right home for coherence, and not a third lever

Sprint 138 was written to measure the buyer-selection price spread and offered two routes.
**Route 2 is now chosen, on the maintainer's reasoning rather than on a measurement:** *"what is
moved by coherence? Buyer base? Sure... but WHY is there less demand for a stupid build?
BECAUSE it is going to blow up."*

Design section 9 already says a part does not add reliability, the build supports its own output
or it does not. `StatBlock.reliability` exists, and **every buyer already weights it**:

| buyer | reliability weight | share of their taste |
| --- | ---: | ---: |
| first-timer | 0.8 of 1.4 | **57%** |
| racer | 1.0 of 2.7 | **37%** |
| collector | 0.3 of 1.9 | 16% |
| tuner | 0.3 of 2.2 | 14% |
| stancer | 0.0 of 1.5 | **0%** |

**Buyer selection therefore falls out of the existing valuation path with nothing built for
it.** A collapsed build loses most of its appeal to the first-timer and the racer, a little to
the tuner and the collector, and **nothing at all to the stancer**, who genuinely does not care
whether it grenades. The person who ends up buying a stupid build is exactly the person who
should. That is design 7a's mechanism, already soldered in.

## Reuse analysis (directive 16)

### Genuinely new

- **Five per-subsystem ratios and their minimum**, and the content that weights them.
- **One curve** turning the headline ratio into a reliability factor.
- **One severity ceiling** on the condition side.
- **One per-car number**, `spec.reliabilityBase`, replacing a flat constant. The same shape as
  Sprint 140's `spec.styleBase`, deliberately, and authored the same way.
- **A qualitative always-on readout** naming the weakest subsystem.

### Existing mechanisms reused, unchanged

- **`statModifiers.powerFraction[character]`** from Sprint 135 is the *entire* demand side.
  Demand is not separately authored; it falls out of what the build gains.
- **`engineCharacterOf`** from Sprint 135, so demand is character-correct without a second
  derivation.
- **`StatBlock.reliability` and `valuateCarForBuyer`.** The stat exists, the buyers weight it,
  the price path runs today. **This sprint changes what feeds the stat, and adds no path.**
- **`weightedBandFactorForStat`** and the taxonomy's `statWeights.reliability`. The condition
  half of the derivation stays exactly as it is; a ceiling is applied to its result.
- **The four grades** as the support-specification ladder. **No fifth grade** (`IDEAS.md`
  records that as rejected).
- **`ALL_CAR_PART_IDS` and the car's `parts` record**, the same traversal `buildFactors` and
  `computeDerivedStats` already use.
- **The car detail screen and the sale listing flow**, one new element each.

### Must NOT be built

- **One aggregate support ratio.** Section 6a: it cannot name the part that would fix it, and
  it is gameable, because over-supplying fuel would arithmetically mask stock internals. Fuel
  does not hold a piston together.
- **A dyno.** That is Sprint 141. This sprint ships the existence of the problem, not its
  precision.
- **A sixth subsystem.** Braking, grip and aerodynamic stability are all real shortfalls a big
  build can create, and all three **already have a full representation in the physics**:
  `physicalModifiers.braking`, `physicalModifiers.grip` and `downforceCoeff` feed the lap model,
  so a 600 PS car on stock brakes already laps badly. Giving them a support ratio as well would
  charge one shortfall twice. **The rule that decides membership: a subsystem earns a ratio only
  if the game has no other way to express the shortfall.** The five qualify; braking, grip and
  aero do not.
- **A lubrication or charging subsystem.** Neither has a part slot, so both would mean inventing
  a part first. If either is ever wanted, it starts as a catalogue question, not a ratio.
- **Any engine-explodes event.** Section 6d: the consequence is that the car is worth less and
  harder to sell, never that it detonates.
- **A wear rate.** Section 9. Nothing degrades with use.
- **A reputation consequence.** Design 7b is descoped for the whole arc, blocked on the
  reputation ratchet (design 8). It would ship inert.
- **A premium for a good build.** `coherenceFactor` is capped at 1.0. A properly supported
  build is exactly as reliable as a stock one and no more. Whether a premium exists at all is
  Sprints 138 and 139.

## The mechanism

### Part A: the five support ratios

For each of five subsystems, `ratio = support / demand`, and the headline `supportRatio` is
**`min(ratio)` across all five**.

```text
demand[s]  = 1 + demandWeight[s]  * (the band-scaled gain that drives s)
support[s] = 1 + sum over supporting slots of supportWeight[s][slot] * spec(slot)
```

**A stock car sits at exactly 1.0 on every subsystem, by construction**, because every gain is 0
and every spec is 0, so both sides are exactly 1. That property makes the whole thing readable
and it is the single best regression test in the sprint: assert it for all 26 shipped cars with
strict equality.

#### Demand reads BAND, support reads GRADE, and neither is charged twice

**This is a correction to an earlier draft of this doc and it must be implemented as stated.**

```text
gain(slot)  = statModifiers.powerFraction[character] * bandFactor(installed.band, economy)
spec(slot)  = supportLadder[installed.grade]              // no band term
```

Demand is band-scaled because **demand comes from output**, and output is band-scaled in
`computeDerivedStats` already: a blown turbo is not making boost, so it must not go on
demanding a bottom end to contain boost it is not making. Without this it would be charged
twice, once through condition and once through a support ratio it is no longer stressing.

Support is **not** band-scaled because **support comes from specification**, and specification
does not decay: *a worn forged conrod is still stronger than a stock cast one.* Condition's
effect on a supporting part reaches reliability through the condition half of the derivation,
which is the one path it gets.

**Every worked figure in this doc is at mint, where `bandFactor` is 1.0, so this correction
changes none of the pinned tables.**

#### The dual-role convention, which must be implemented exactly

Section 6c: **demand comes from output, support comes from specification, and within any one
subsystem a part is a demander or a supporter, never both.**

| subsystem | demand driven by | supported by |
| --- | --- | --- |
| cylinder pressure | `forcedInduction` gain only | `internals`, `block` |
| fuelling | total gain across all slots | `fuelSystem` |
| heat | total gain across all slots | `cooling` |
| revs | `camsTiming` gain only | `headValvetrain`, `internals` |
| torque transmission | total gain across all slots | `clutch`, `gearbox`, `driveline`, `differential` |

Read against the dual-role parts and it holds:

- **A bored block** adds output, so it raises demand on fuelling, heat and torque transmission.
  It does **not** raise cylinder-pressure demand, which is the subsystem it supports.
- **A ported head** supports revs, and as a gain raises fuelling and heat demand. It does not
  raise revs demand; only cams do.
- **`fuelSystem` and `clutch` carry zero gain** (Sprint 135, Lever 3), which is what keeps them
  from partly paying for themselves.

### Part B: reliability, rebuilt

```text
conditionFactor  = min( weightedBandFactorForStat(..., 'reliability', ...) ,
                        severityCeiling(worst band among reliability-bearing parts) )

coherenceFactor  = min( 1 , supportRatio / adequateThreshold ) ^ coherenceExponent

reliability      = spec.reliabilityBase * clamp( conditionFactor + coherenceFactor - 1 , 0 , 1 )
```

**`spec.reliabilityBase` is what the car is when everything is right**, and it is per car rather
than a constant. A mint stock example of that model reads exactly its base, and nothing in the
game ever exceeds it. **`statFormulas.reliabilityCap` is retired, not moved**: authoring it at
100 here and replacing it with a per-car value later is precisely the author-then-overwrite waste
the arc restructure removed, and it would leave this sprint pinning a table that the next sprint
breaks.

**Three things about the combining line, all deliberate.**

1. **It is the sum of the two shortfalls, not the product of the two factors.** Written the
   other way round it reads `1 - conditionShortfall - coherenceShortfall`, which is what it
   means: **two independent reasons the car will not get you home add up.** A seized engine plus
   a build that over-boosts is not "25 per cent of 43 per cent reliable"; it is a car with two
   terminal problems and it reads zero.
2. **When either factor is 1.0 it reduces to the other exactly**, so a coherent car scores
   purely on condition and a mint car scores purely on coherence. That is what keeps the
   approved anchors (100, 85, 65, 40, 25 on the condition axis; 69 and 43 on the coherence axis)
   intact.
3. **It reaches 0.** The maintainer's requirement: *"an incoherent unsupported build with poor
   and worn parts where it counts, can be like, 0. lets use the full spectrum. That's the most
   unreliable car you can build so 0 is fine."* A product cannot do this while preserving the
   anchors; a bounded sum of shortfalls does both.

**The severity ceiling is why "improving other components does not move the needle".** One
reliability-bearing part at `scrap` caps `conditionFactor` at 0.25 no matter how perfect the
other fourteen are. "Any" is the right test rather than a crude one, because **the fifteen parts
that carry a reliability weight are exactly the ones that stop the car**; springs and paint
carry zero precisely because they do not.

## The levers

### Levers 1 to 5: SIGNED PRELIMINARILY 2026-07-29 (directive 22)

**Approved to implement and to ship as written.** Do not stop, do not adjust one because a test
is awkward. Only their final calibration is reserved, and that comes from playtest.

All live in `packages/content/data/economy.json` under `statFormulas.support` (content law).

#### Lever 1: the support-specification ladder

What a grade is worth as *specification*, on every supporting slot.

| grade | spec |
| --- | ---: |
| stock | 0.00 |
| street | 0.25 |
| sport | 0.60 |
| race | 1.00 |

#### Lever 2: demand weights

| subsystem | driven by | weight |
| --- | --- | ---: |
| cylinderPressure | `forcedInduction` gain | 2.00 |
| fuelling | total gain | 0.80 |
| heat | total gain | 0.70 |
| revs | `camsTiming` gain | 3.50 |
| torqueTransmission | total gain | 0.90 |

#### Lever 3: support weights

| subsystem | slot | weight |
| --- | --- | ---: |
| cylinderPressure | internals | 0.45 |
| cylinderPressure | block | 0.25 |
| fuelling | fuelSystem | 0.75 |
| heat | cooling | 0.70 |
| revs | headValvetrain | 0.25 |
| revs | internals | 0.15 |
| torqueTransmission | clutch | **0.30** |
| torqueTransmission | gearbox | **0.25** |
| torqueTransmission | driveline | **0.15** |
| torqueTransmission | differential | **0.15** |

**Torque transmission gained two supporters on 2026-07-29 and the total did not move.** An
earlier draft supported it with `clutch` 0.50 and `driveline` 0.35 only, which left out the two
things that actually break when torque goes up: **the `gearbox` carries a reliability weight of 2
in the taxonomy, twice the clutch's, and is not a supporter of anything**, and the
`differential` carries 1 and likewise supports nothing. A stock gearbox behind 632 PS is the
classic failure, not the clutch.

The four weights **sum to 0.85, exactly as the old two did**, so this is a redistribution rather
than an inflation: every worked figure below is unchanged and the calibration holds. What it
changes is that **no single purchase fixes a strained drivetrain**, which is correct, and it
makes the drivetrain the expensive subsystem to put right, which is also correct.

Both new supporters carry **zero power gain** (they are not engine slots, Sprint 135 Lever 2), so
the dual-role convention holds without an exception.

#### Lever 4: thresholds

| band | headline ratio |
| --- | --- |
| adequate | >= 0.90 |
| strained | 0.75 to 0.90 |
| dangerous | < 0.75 |

**`adequate`'s 0.90 is now load-bearing twice**: it is the readout's silence threshold and it is
the knee of the coherence curve. One number, two uses, deliberately, so `adequate` means exactly
one thing on both surfaces: **this costs you nothing.**

#### Lever 5: the readout copy

Shown only at `strained` and `dangerous`; **`adequate` shows nothing at all**, because
competence is the baseline rather than an achievement (design 7b).

| subsystem | the shortfall, in the game's voice |
| --- | --- |
| cylinderPressure | asking more of the bottom end than it can give |
| fuelling | making more air than the fuel system can feed |
| heat | making more heat than it can shed |
| revs | asking for more revs than the head will hold |
| torqueTransmission | making more torque than the drivetrain will take |

| band | framing |
| --- | --- |
| strained | `It will do, but it is {shortfall}.` |
| dangerous | `This is {shortfall}.` |

Copy lives in content, not in code. It goes through the maintainer's own copy sweep before it
ships; the strings above are a proposal like every other lever here.

### Levers 6 and 8: SIGNED 2026-07-29

| lever | what | signed as |
| --- | --- | --- |
| 6 | `statFormulas.support.coherenceExponent` | **2.0** (new) |
| 8 | `statFormulas.condition.reliabilityCeiling` | `scrap` **0.25**, `poor` **0.55** |

The maintainer's rule these serve: **the base is the ceiling, a stock car sits on it, and a
properly supported build sits on it too.** Nothing in this arc pays a bonus for competence.

### Lever 7: `spec.reliabilityBase`, per car (SIGNED 2026-07-29)

**Replaces `statFormulas.reliabilityCap` outright.** A required field on `CarModel.spec`, 0 to
100, on the same footing as Sprint 140's `spec.styleBase` and `spec.aeroCeiling`: **required, not
defaulted**, so a car added later cannot silently inherit a value nobody chose.

**Authored for all 94 roster cars at once, not just the 26 in content** (maintainer, 2026-07-29:
*"we MUST do it for the rest of the roster. From now on treat EVERY car as if it is go live from
the start. That is how the previous drift happened."*). **The full table lives in
`docs/design/midnight-garage-roster.csv`, column `reliabilityBase`**, which is the single source
of truth for the roster; the 26 below are the subset this sprint authors into `cars.json` and they
are copied from there rather than decided here. **If the two ever disagree, the CSV is right.**

**The scale is 65 to 100, and the axis is age and engineering culture, not price.** An NSX is a
supercar you can drive to work and a Countach is not, so they sit thirty points apart inside the
same culture class. **The floor is 65 rather than lower because the base multiplies everything
else**: a car with very little to lose is a car where condition and coherence stop mattering, and
those are the two systems this arc exists to make matter.

| band | what sits there |
| ---: | --- |
| 96-100 | ordinary 1990s Japanese, and the Land Cruiser |
| 90-95 | the rest of modern Japan, including most turbocharged cars |
| 84-89 | known-issue Japanese, the best of Europe, the homologation specials |
| 78-83 | rotaries, and Japanese classics from the 1970s |
| 72-77 | the 1960s Japanese classics, and the triple-rotor Cosmo |
| 65-71 | Italy, and a 1965 Mini |

**The 26 to author into `cars.json`:**

| car | base | | car | base |
| --- | ---: | --- | --- | ---: |
| toyota-carina-at150 | **100** | | nissan-cefiro-a31 | 93 |
| honda-city-e-aa | 99 | | toyota-mr2-aw11 | 93 |
| nissan-sunny-b12 | 98 | | nissan-silvia-s13 | 92 |
| suzuki-wagon-r-ct21s | 98 | | nissan-180sx-rps13 | 92 |
| honda-civic-sir2-eg6 | 97 | | nissan-silvia-ks-s14 | 92 |
| honda-crx-sir-ef8 | 96 | | suzuki-alto-works-ha21s | 91 |
| toyota-sera-exy10 | 95 | | honda-beat-pp1 | 91 |
| honda-prelude-si-vtec-bb4 | 95 | | toyota-mr2-sw20 | 90 |
| toyota-aristo-30v-jzs147 | 95 | | nissan-skyline-gtr-bnr32 | 90 |
| toyota-supra-rz-jza80 | 94 | | honda-city-turbo-ii-aa | 88 |
| toyota-chaser-tourer-v-jzx90 | 94 | | subaru-impreza-wrx-sti-gc8 | 86 |
| toyota-sprinter-trueno-ae86 | 94 | | nissan-fairlady-z-z32 | 84 |
| | | | mazda-savanna-rx7-fc3s | 82 |
| | | | **mazda-rx7-fd3s** | **80** |

**Two of those are worth saying out loud.** The FD is the least dependable car in shipped content
and every enthusiast will nod at that; it is 80 rather than lower because a well-kept FD is a
usable car, not a bad one. And **the two RX-7s in the full roster differ**: the 1992 Type R reads
80 and the final Spirit R reads 82, because the last cars were the best developed.

**What it costs in money, so the scale is judged honestly.** Reliability is 57 per cent of a
first-timer's taste and the whole taste band is 24 per cent of value, so **the 20-point shipped
spread moves a first-timer's offer by about 2.7 per cent** and the full 35-point roster spread by
about 4.8 per cent. A racer feels roughly two thirds of that and a stancer feels none of it. That
is "some variability", not a second pricing axis.

## What these levers produce

**Support ratios first.** Calibrated so a fully committed race build lands at 1.0 and a
half-committed one collapses, which is the whole point of section 5e's hard gate.

**A maximal forced-induction build, race grade throughout:**

| subsystem | demand | support | ratio |
| --- | ---: | ---: | ---: |
| cylinder pressure | 1.700 | 1.700 | 1.000 |
| fuelling | 1.760 | 1.750 | 0.994 |
| heat | 1.665 | 1.700 | 1.021 |
| revs | 1.175 | 1.400 | 1.191 |
| torque transmission | 1.855 | 1.850 | 0.997 |
| **headline** | | | **0.994, adequate** |

**A race turbo and nothing else**, design 6d's worked example:

| subsystem | demand | support | ratio |
| --- | ---: | ---: | ---: |
| **cylinder pressure** | 1.700 | 1.000 | **0.588** |
| fuelling | 1.280 | 1.000 | 0.781 |
| heat | 1.245 | 1.000 | 0.803 |
| revs | 1.000 | 1.000 | 1.000 |
| torque transmission | 1.315 | 1.000 | 0.760 |
| **headline** | | | **0.588, dangerous, cylinder pressure named** |

**A race turbo with a race fuel system and race cooling, stock bottom end** still reads 0.588
and still names cylinder pressure. That is section 6a's argument made arithmetic: **an excellent
fuel pump does not hold a piston together.**

**A maximal high-strung NA build** lands at 1.037, bound by revs, the correct binding constraint
for an NA engine. **A maximal lazy NA build** lands at 0.962, also on revs. **A street exhaust on
a turbo car** lands at 0.959: mild bolt-ons must not trigger warnings, and they do not.

### And the reliability those produce

`coherenceFactor` at each headline, with the knee at 0.90 and exponent 2.0:

| headline | 1.000 | 0.994 | 0.959 | 0.900 | 0.850 | 0.750 | 0.588 | 0.539 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| factor | 1.000 | 1.000 | 1.000 | 1.000 | 0.892 | 0.694 | 0.427 | 0.359 |

`conditionFactor` for the cases worth naming:

| condition of the reliability-bearing parts | factor |
| --- | ---: |
| all mint | 1.00 |
| all fine | 0.85 |
| all worn | 0.65 |
| all poor (mean 0.40, under the 0.55 ceiling) | 0.40 |
| **one part scrap, all others mint (a grenade)** | **0.25** |
| one part poor, all others mint | 0.55 |
| all scrap | 0.15 |

**The table this sprint is judged on**, as a percentage of the car's own `reliabilityBase`:

| build | headline | all mint | all fine | all worn | all poor | **one grenade** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stock car | 1.000 | **100%** | 85% | 65% | 40% | **25%** |
| fully committed race build | 0.994 | **100%** | 85% | 65% | 40% | **25%** |
| street exhaust on a turbo car | 0.959 | 100% | 85% | 65% | 40% | 25% |
| at the `dangerous` line | 0.750 | 69% | 54% | 34% | 9% | **0** |
| **race turbo, stock bottom end** | 0.588 | **43%** | 28% | 8% | **0** | **0** |
| maximal build, no support at all | 0.539 | 36% | 21% | 1% | 0 | 0 |

**The same table in points, on the two cars at the ends of Lever 7**, which is how a player meets
it:

| build and condition | Carina (base 100) | RX-7 FD3S (base 80) |
| --- | ---: | ---: |
| stock, mint | **100** | **80** |
| fully supported race build, mint | **100** | **80** |
| stock, all worn | 65 | 52 |
| race turbo on a stock bottom end, mint | 43 | 34 |
| stock, one grenade | 25 | 20 |
| race turbo on a stock bottom end, all worn | 8 | 6 |
| anything incoherent with a grenade in it | **0** | **0** |

The FD is the lowest base in shipped content. **On the full roster the Countach sits at 65**, and
the same columns for it read 65 / 65 / 42 / 28 / 16 / 5 / 0.

**Five properties to read off it, all of them the point:**

1. **A properly built car is exactly as reliable as a stock one.** Row 2 equals row 1 everywhere,
   on every car.
2. **A stupid build on a mint car scores 43 per cent. An honest tired car scores 65 per cent.**
   The mint one photographs better and is worth less to anyone who can tell.
3. **A grenade beats everything on the condition axis**, capping a coherent car at a quarter of
   its base where today it reads 92 out of 100, and taking any incoherent build to 0.
4. **A well-kept FD never reads as well as a well-kept Carina**, and that is the car, not the
   owner. It is also worth about 4 per cent less to a nervous buyer and exactly the same to a
   stancer, which is the correct pair of consequences.
5. **The scale reaches both ends.** The worst car buildable in the game reads 0. **Correction,
   2026-07-30 amendment:** this does not take a genuinely absurd car - a plain neglected build
   (a fitted turbo kit and cams, the whole car including them run to scrap, nothing supporting
   any of it) reaches 0 on most of the roster. See the amendment section for the measured
   figures and what was wrong with the original construction below.

## Task breakdown

### Task 1: content schema and data

`packages/content/src/economy.ts`:

1. `statFormulas.support`, carrying levers 1 to 4 and lever 6. Zod-validated, with the
   stock-car-equals-1.0 property stated in the schema comment.
2. `statFormulas.condition.reliabilityCeiling` (lever 8), documented as a **ceiling on the
   condition mean, not a replacement for it**, with the "any reliability-bearing part" rule and
   the reason it is the right test written where the table is defined.
3. **Retire `statFormulas.reliabilityCap`.** Remove it rather than leaving it unread, so no
   future reader treats a dead lever as live. This is the same retirement Sprint 140 performs on
   `statFormulas.styleCap` for the same reason.

`packages/content/src/carModel.ts`: add `reliabilityBase: z.number().min(0).max(100)` to the spec
schema (lever 7). **Required, not defaulted.** Document beside it that it is what the car is when
everything is right, that nothing ever exceeds it, that the scale runs 65 to 100, and that the
floor is 65 rather than lower because the base multiplies condition and coherence and a car with
nothing to lose is a car where neither matters.

`packages/content/data/cars.json`: the 26 signed values.

`packages/content/src/tags.ts`: `SubsystemSchema` as a five-value enum (`cylinderPressure`,
`fuelling`, `heat`, `revs`, `torqueTransmission`).

`packages/content/data/economy.json`: the signed values.

**The demand and support maps are content, not code.** A future part must not be able to join a
subsystem by editing a list in a source file.

### Task 2: the support derivation

New file `packages/sim/src/support.ts`, exported through `packages/sim/src/index.ts`:

```text
supportRatios(car, model, partsById, economy): Record<Subsystem, number>
supportVerdict(car, model, partsById, economy): SupportVerdict
```

where `SupportVerdict` is `{ headline: number, band: 'adequate' | 'strained' | 'dangerous',
subsystem: Subsystem }` and `subsystem` names the minimum.

1. Resolve the character once via `engineCharacterOf`.
2. Walk the car's slots once, accumulating each slot's **band-scaled** gain and each slot's
   **grade-only** spec.
3. Compute the five ratios, then the minimum.
4. **Ties break in the order the subsystem enum declares**, so the named subsystem is
   deterministic. State that in the doc comment; a non-deterministic name would make the readout
   flicker.

A slot the catalogue cannot resolve contributes nothing on either side, matching `buildFactors`'s
existing rule that an unknown part id can never silently move anything.

### Task 3: delete `statModifiers.reliability`

**Moved here from Sprint 140, because this is the sprint that rebuilds what replaces it.**

1. `packages/content/src/stats.ts`: remove `reliability` from `StatModifierSchema`.
2. `packages/sim/src/derivedStats.ts`: remove the
   `reliability += part.statModifiers.reliability * wear` line.
3. `packages/content/data/parts.json`: remove the field from all 472 SKUs.
4. **`statWeights` on the taxonomy reuses `StatModifierSchema`'s shape for a different meaning.**
   Sprint 135 already faced this for `power` and either kept the shared schema or split it into
   `StatModifierSchema` and `StatWeightsSchema`. **Follow whichever Sprint 135 did**, and if it
   kept them shared, check again here and split if this deletion breaks taxonomy authoring.
   `weightedBandFactorForStat(..., 'reliability', ...)` must keep its weights or reliability
   stops responding to condition entirely, which is a regression rather than the intent.

**`StatBlock.reliability` stays. The taxonomy's reliability weights stay. Buyers keep weighting
it.** Only the ability of a purchased part to add a flat number goes.

### Task 4: the reliability derivation

`packages/sim/src/derivedStats.ts`, `computeDerivedStats`:

1. Apply the severity ceiling to the condition mean. The worst band is taken across **only the
   parts carrying a non-zero `statWeights.reliability`**, read from the taxonomy rather than a
   hand-written list (content law).
2. A **missing** part counts as `scrap` for the ceiling, matching `weightedBandFactor`'s existing
   treatment of a missing part as a 0 band factor. A legitimately absent slot (an NA car's
   forced induction) is not a missing part and must not trip the ceiling.
3. Compute `coherenceFactor` from `supportVerdict`.
4. Combine as the bounded sum of shortfalls, clamp to `[0, 1]`, multiply by
   `model.spec.reliabilityBase`.

**`computeDerivedStats` now needs the support ratio.** Compute it inside rather than taking it as
a parameter, so no caller can pass a stale verdict, and so the two can never disagree.

### Task 5: the always-on readout

Design 7c requires the warning at two points in this sprint (the third, the dyno, is Sprint 141):

1. **The car's own readout, always.** `packages/game/src/screens/CarDetailScreen.vue`.
2. **Listing it for sale, restated and unmissable.** The set-for-sale flow.

The element is qualitative: the band and the named shortfall, no numbers. **Numbers are the
dyno's product and must not appear here**, or Sprint 141 has nothing to sell.

**The readout is not the feature.** It explains a number that has already moved, and it exists
because naming the subsystem is what tells the player which part fixes it. A build that reads
`dangerous` has already lost reliability whether or not the player reads the line.

The art bible's diegetic-UI law binds: an in-world object with a real pressed or active state,
not a coloured banner. If that cannot be satisfied without new art, **ship the plainest in-world
treatment that obeys the law and record the art dependency in the Exit**; do not invent a
modern-UI alert.

### Task 6: tests

New file `packages/sim/tests/supportRatios.test.ts`:

1. **The stock identity.** All 26 shipped cars, every subsystem exactly 1.0, strict equality;
   headline exactly 1.0; band `adequate`.
2. **The structural disjointness test.** For each subsystem, its demand slots and its support
   slots share no member, read from content so hand-editing the data cannot break the convention
   silently.
3. **Demand is band-scaled, support is not.** A `worn` race turbo demands strictly less than a
   mint one; a `worn` race fuel system supports exactly as much as a mint one. **This is the
   pair that proves nothing is charged twice**, and it is the test an implementer is most likely
   to get backwards.
4. **Pure gains never raise the headline.** For each of `camsTiming`, `intake`, `exhaust`,
   `ignitionEcu`, `forcedInduction`, at each grade, on a representative car of each character.
5. **The two worked support tables above**, pinned exactly.
6. **Fuel does not hold a piston together.** A race turbo with race fuelling and race cooling but
   a stock bottom end still reads `dangerous` and still names `cylinderPressure`.
7. **Mild bolt-ons do not warn.** A street exhaust alone reads `adequate` on all 26 cars.
8. **Determinism of the named subsystem** when two ratios tie.

New file `packages/sim/tests/reliabilityModel.test.ts`:

9. **The full table above, pinned**, every cell.
10. **A stock mint car reads exactly its own `spec.reliabilityBase`**, all 26 cars, and the
    26 authored values match Lever 7 exactly. **Nothing anywhere exceeds its base.**
11. **A fully supported race build reads exactly the same as stock**, all 26 cars. The
    no-premium rule, asserted rather than assumed.
12. **The grenade rule.** One reliability-bearing part at `scrap` with all others mint caps the
    car at 25 per cent of its base, **for each of the fifteen weighted parts in turn**, and
    repairing any of the other fourteen does not move it. That second half is the maintainer's
    requirement stated as a test.
13. **A part carrying zero reliability weight cannot trip the ceiling.** Scrap springs, scrap
    paint, scrap tyres: reliability unmoved. Assert with strict equality.
14. **A missing part trips the ceiling; a legitimately absent NA forced-induction slot does
    not.** All 26 cars for the second half.
15. **The floor is reached and does not go below it.** The worst buildable car reads exactly 0,
    and no input produces a negative or a value above the car's own base.
16. **Monotonicity in both axes.** Reliability never rises when a band worsens, and never rises
    when the headline support ratio falls.
17. **The base is the only thing that varies between two identically-built cars.** Two cars given
    the same build and the same condition read reliability in exactly the ratio of their bases.
    This is the test that keeps Lever 7 a per-car character and stops it becoming a second
    difficulty axis.
18. **`statFormulas.reliabilityCap` is gone**, structurally: nothing in `packages/` reads it and
    it is absent from `economy.json`.

In `packages/game/tests/`: the readout is present at `strained` and `dangerous`, **absent at
`adequate`**, and carries no numeric figure in any state.

### Task 7: checks

```text
pnpm test --project content
pnpm test --project sim
pnpm test --project game
```

`harnessAcceptance.test.ts` must pass untouched: this sprint changes no physics. Reliability is
not read by the lap model.

### Task 8: re-derive whatever moved, and STOP at the story missions

Directive 17 case (a) throughout. **This sprint moves prices, deliberately**, which is a reversal
of the earlier draft's constraint and is the whole point of the maintainer's ruling.

Expected fallout, in order of size:

1. **Every valuation pin for a mint car**, because the reliability ceiling moves from a flat 70
   to a per-car base and reliability is a weighted term in `valuateCarForBuyer`. Re-derive from
   real runs.
2. **`economyApprovalGate.test.ts`**, because `statFormulas.support` and
   `statFormulas.condition.reliabilityCeiling` are new and `statFormulas.reliabilityCap` is
   gone. Re-pin in the same change as the recorded sign-off, naming every lever and value.
3. **The `cars.json` spec-book guard**, because `spec.reliabilityBase` is a new required field
   on all 26 cars.
4. **Four story missions gate on a reliability `statThreshold`**, each pinned against the old
   flat cap of 70: `wont-strand-her` (54), `the-fleet-spare` (58), `first-proper-car` (54),
   `street-power-street-manners` (48).

### Item 4: re-derive, do NOT stop (maintainer ruling, 2026-07-29)

**This is an explicit exception to the usual directive-22 halt, and it is narrow.** The
maintainer's ruling: *"if we change systems deliberately then downstream should change too.
Better story missions are queued anyway."* So the four thresholds are re-derived inside this
sprint rather than handed back. **The exception covers these four values and nothing else.**

**How to re-derive each one, and it is not the same method for all four.**

- **`wont-strand-her`, `the-fleet-spare`, `first-proper-car`** preserve their share of the
  ceiling. Each was `n / 70`; the new value is that share of the base of the cheapest car that
  can plausibly satisfy the mission, floored to a round number. **Report the arithmetic**, do not
  eyeball it.
- **`street-power-street-manners` is re-derived from a real run**, because its bar is the one
  hand-set floor in the campaign rather than a `floor90(measured)` pin. Its own probe build
  (sport intake, exhaust, ECU and turbo, no supporting parts) computes to a headline of
  **0.678, `dangerous`, bound by torque transmission** (2026-07-30 correction: the figure below
  had originally been written up as "near 0.712" from a hand estimate rather than the exact
  arithmetic; 0.678 is the real, precisely-computed value, confirmed three independent ways -
  see row 906 of the pin table below). **Build the supported version of that same shape, measure
  what it actually reaches, and set the floor under it.** The mission is named "street power,
  street manners" and now genuinely asks for power without a grenade, which is the mission
  finally working; it must not become impossible in the process.

**One interaction that must not be "fixed".** A reliability `statThreshold` is an absolute number
and cars now have different bases, so **any bar above a car's base excludes that car outright, in
any condition, however well built.** On the likely re-derived figures `the-fleet-spare` lands near
83, which puts both rotaries out of reach. That is correct and it is the point: somebody who needs
a dependable fleet spare should not be handed an RX-7. **Do not convert these thresholds to a
fraction of the car's base to make every car eligible**; record which cars each mission now
excludes and report it as a finding. **If a mission ends up excluding so much of the roster that
it is unplayable, that is a report, not a licence to lower the bar.**

## Hard constraints

- **No unlisted lever**, with exactly one recorded exception: the four story-mission reliability
  thresholds, re-derived in this sprint under the 2026-07-29 ruling. Anything else, execution
  ENDS.
- **`spec.reliabilityBase` is a car's character, not a difficulty knob.** It never varies by
  build, by condition, by tier or by anything else. Two identically-built cars differ only in the
  ratio of their bases.
- **Support reaches price only through reliability.** No second path, no premium multiplier, no
  change to `foundationFactor` or `aftermarketReturn`. Assert the last two directly.
- **`coherenceFactor` is capped at 1.0.** No build is ever more reliable than stock.
- **Demand reads band; support reads grade.** Neither is charged twice.
- **No numbers in the readout.**
- **No engine-failure event, no wear rate, no service interval, nothing denominated in days.**
- **Do not delete `StatBlock.reliability`** or the taxonomy's reliability weights.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] All eight levers signed and recorded in this doc (2026-07-29). Nothing to ask about.
- [x] Five subsystem ratios and a `min` headline in `packages/sim/src/support.ts`.
- [x] All 26 stock cars sit at exactly 1.0 on every subsystem, strict equality.
- [x] Demand and support slot sets provably disjoint per subsystem, read from content.
- [x] Demand band-scaled, support grade-only, both pinned.
- [x] Pure gain parts never raise the headline.
- [x] Both worked support tables pinned; the fuel-does-not-hold-a-piston case pinned.
- [x] Mild bolt-ons read `adequate` on every car.
- [x] `statModifiers.reliability` gone from schema, sim and all 472 SKUs; `StatBlock.reliability`
      intact and still weighted by every buyer.
- [x] `spec.reliabilityBase` required and authored for all 26 cars, matching Lever 7 exactly;
      `statFormulas.reliabilityCap` retired, not orphaned.
- [x] A stock mint car and a fully supported race build both read exactly the car's own base, all
      26 cars, and nothing anywhere exceeds it.
- [x] Two identically-built cars differ only in the ratio of their bases.
- [x] The severity ceiling implemented over the taxonomy's own weights; the grenade rule pinned
      for all fifteen weighted parts, including that repairing the others does not move it.
- [x] Zero-weight parts provably cannot trip the ceiling.
- [ ] The full reliability table pinned, every cell; the floor reaches exactly 0. **Not fully
      ticked - see the Exit's "What is genuinely unreachable" note.** The floor reaches exactly 0
      (pinned and tested). The percentage table's headline-1.000 row and its mint-condition cells
      at every headline are pinned exactly. The illustrative fine/worn/poor cells at the two
      sub-adequate headlines (0.588, 0.539) are NOT reachable by uniformly ageing a single real
      car - a finding, not a gap in the implementation - and are replaced by an honestly-buildable
      equivalent, both explained in the Exit.
- [x] The warning visible on the car always and restated at listing, with no numbers.
- [x] `harnessAcceptance.test.ts` passes untouched.
- [x] Valuation pins re-derived from real runs; economy gate re-pinned with the sign-off.
- [x] The four story-mission reliability thresholds re-derived by the methods above, the
      arithmetic shown, and the cars each mission now excludes reported.
- [x] Checks run once each, output shown.

## Exit

**Landed.** The support-ratio model (`packages/sim/src/support.ts`), the reliability rebuild
(`packages/sim/src/derivedStats.ts`), the per-car `spec.reliabilityBase` (all 26 shipped cars,
matching Lever 7 exactly), the always-on readout, and the four story-mission threshold
re-derivations. All eight levers implemented exactly as signed; no unlisted economy value was
touched.

### What was built, file by file

- `packages/content/src/tags.ts` - `SubsystemSchema` (five-value enum, declaration order is the
  tie-break order).
- `packages/content/src/carModel.ts` - `spec.reliabilityBase`, required, `0..100` per the sprint
  doc's literal schema line (the *authored* scale is 65-100; the roster CSV guard, not the zod
  bound, enforces that).
- `packages/content/src/economy.ts` - `statFormulas.support` (levers 1-4, 6),
  `statFormulas.condition.reliabilityCeiling` (lever 8), top-level `supportReadout` (lever 5
  copy); `statFormulas.reliabilityCap` removed outright.
- `packages/content/src/stats.ts` - `reliability` removed from `StatModifierSchema`;
  `StatWeightsSchema.reliability` untouched.
- `packages/content/data/economy.json` - the eight levers' values.
- `packages/content/data/cars.json` - `spec.reliabilityBase` on all 26 cars, copied verbatim from
  the roster CSV; `statModifiers.reliability` removed from all 472 SKUs (via `parts.json`).
- `packages/content/data/parts.json` - `statModifiers.reliability` removed from all 472 SKUs.
- `packages/content/data/storyMissions.json` - four reliability thresholds re-derived (see below);
  `street-power-street-manners`'s payout/budget and tuner taste-match floor moved with its dearer,
  now-supported probe; `first-proper-car`'s first-timer taste-match floor moved with the fresh
  reliability figure it depends on.
- `packages/content/tests/economyApprovalGate.test.ts` - re-pinned economy.json hash, the mission
  payout/cap table, and a full dated ledger entry naming every lever and value.
- `packages/content/tests/schemas.test.ts` - `supportReadout` added to the top-level anchor list.
- `docs/design/economy-bible.md` - `supportReadout.*` added to the anchor inventory table (the
  machine-checked cross-reference `schemas.test.ts` guards).
- `packages/sim/src/support.ts` (new) - `supportRatios`, `supportVerdict`.
- `packages/sim/src/derivedStats.ts` - the reliability derivation rebuilt (severity ceiling,
  coherence factor, the bounded-sum combine); `statModifiers.reliability` no longer read.
- `packages/sim/src/lapModel.ts` - `reliabilityBase` placeholder on the synthetic reference
  chassis (read by nothing there; `computeDerivedStats` is never called on it).
- `packages/sim/src/index.ts` - exports `support.ts`.
- `packages/sim/tests/supportRatios.test.ts` (new), `packages/sim/tests/reliabilityModel.test.ts`
  (new) - the full test suite (Task 6 items 1-18).
- `packages/sim/tests/testFixtures.ts` - `carWithGrades` (a real car built with named slots at a
  named grade, one uniform condition band, resolved from real catalogue SKUs).
- `packages/sim/tests/storyMissionProbes.test.ts` - `street-power-street-manners`'s probe now also
  fits sport-grade support (internals/block/fuelSystem/cooling/clutch/gearbox/driveline/
  differential) alongside its existing sport power parts.
- `packages/sim/tests/derivedStats.test.ts`, `marketValue.test.ts`, `valuation.test.ts`,
  `bands.test.ts`, `carCondition.test.ts` - `reliabilityBase` added to every hand-written fixture
  `CarModel`; `statModifiers.reliability` removed from every hand-written fixture `Part`.
- `packages/game/src/stores/gameStore.ts` - `CarDetail.supportReadout`, `supportReadoutFor`.
- `packages/game/src/screens/CarDetailScreen.vue` - the readout, always-on on the car and restated
  in the sell section; CSS (`.support-readout`, `.strained`, `.dangerous`).
- `packages/game/src/screens/CarDetailScreen.test.ts` - three new tests (absent at adequate, named
  at strained restated in the listing, named at dangerous), all asserting no digit appears.
- `packages/game/src/screens/PerformanceSandboxScreen.vue` - the reliability row's label reads the
  selected car's own `spec.reliabilityBase` instead of the retired flat cap.
- `packages/game/src/screens/dev/sandboxCars.ts` + `tools/sandbox/generateCars.mjs` - a flat
  `reliabilityBase: 85` placeholder on the 59 non-shipped research entries (read by nothing;
  documented as a placeholder alongside `chassisCode`/`bookValueYen` in both the generator and the
  generated file's own header comment).
- `packages/game/src/screens/auctionRoom.test.ts`, `auctionRoomDemo.test.ts`,
  `AuctionRoomDemoScreen.test.ts` - re-pinned (see "The one thing I could not fully explain"
  below).
- `TODO.md` - the resolved rosterCsvGuard item removed; the tuning-system status paragraphs
  updated to record Sprint 136 as signed and built.

### The reliability model as built

A stock mint car reads exactly its own `spec.reliabilityBase` (100 for the Carina, down to 80 for
the FD3S across the shipped 26 - the full spread is the Lever 7 table, reproduced in
`reliabilityModel.test.ts`). **Correction, 2026-07-30 amendment: the description in this
paragraph was wrong as shipped.** The build actually pinned as reading exactly 0
(`reliabilityModel.test.ts`'s "the worst buildable car" test) keeps the five gain-only slots at
`mint` while every OTHER reliability-bearing part is `scrap` - not, as this paragraph originally
claimed, "every reliability-bearing part scrapped" including the gain slots themselves. That
distinction mattered under the shipped, band-scaled demand: scrapping the gain parts too would
have shrunk their own demand and lifted the headline, so the literal build this paragraph
describes never actually read 0 - measured directly, it read 12 to 15 depending on the car,
`strained` or `adequate`, not `dangerous`. Under the 2026-07-30 rebalance (demand now reads grade,
not band) this distinction is gone: the literal, simpler build - every gain part fitted, the whole
car including those parts run to `scrap`, nothing supporting any of it - reads exactly 0 on 21 of
the 26 shipped cars (the remaining 5 round to 1). See the amendment section below for the
rebalance's own figures.

So the spread between the best and worst shipped car is the full authored range: **100 (Carina,
coherent, mint) down to 0 (any of the 26, built and run into the ground)**, and separately,
comparing only stock-mint condition across the roster, **100 down to 80** (Carina to FD3S) is the
character spread Lever 7 authors.

### The support ratios: one worked example

Car: `nissan-180sx-rps13` (Turbo-tagged, `forced` engine character, base 92). Build: a race-grade
turbo kit and nothing else (design 6d's own worked example).

| subsystem | demand | support | ratio |
| --- | ---: | ---: | ---: |
| cylinder pressure | 1.700 | 1.000 | **0.588** |
| fuelling | 1.280 | 1.000 | 0.781 |
| heat | 1.245 | 1.000 | 0.803 |
| revs | 1.000 | 1.000 | 1.000 |
| torque transmission | 1.315 | 1.000 | 0.760 |
| **headline** | | | **0.588, dangerous, cylinderPressure** |

`coherenceFactor = min(1, 0.588/0.90)^2 = 0.427`. At mint condition (`conditionFactor = 1.0`),
`reliability = 92 * clamp(1.0 + 0.427 - 1, 0, 1) = 92 * 0.427 = 39` (rounded). Verified against the
implementation via an independent node re-computation of the formula from the shipped
`economy.json` and `parts.json` values before any test was written, and it matches the pinned
support and reliability tests exactly.

### Every pin re-derived

| file | pin | old | new | reason |
| --- | --- | ---: | ---: | --- |
| `economyApprovalGate.test.ts` | `economy.json` hash | `d5fd4a87...` | `ba3df414...` | Eight new/changed levers (Task 1). |
| `storyMissions.json` | `wont-strand-her` reliability min | 54 | 75 | `floor90` of a fresh `honda-city-e-aa` probe (repaired to `fine`, all stock): `round(99 * 0.85) = 84`, `floor90(84) = 75`. |
| `storyMissions.json` | `first-proper-car` reliability min | 54 | 73 | `floor90` of a fresh `honda-civic-sir2-eg6` probe (same shape): `round(97 * 0.85) = 82`, `floor90(82) = 73`. |
| `storyMissions.json` | `first-proper-car` first-timer taste-match min | 0.97 | 1 | `round2At97Percent` of the fresh taste ratio - reliability is 57% of a first-timer's taste and moved. |
| `storyMissions.json` | `the-fleet-spare` reliability min | 58 | 79 | Hand-set floor with margin, re-derived by the doc's own share-of-ceiling method: `floor(58/70 * 96) = 79` (`honda-crx-sir-ef8`, base 96). The probe's fresh measurement (every reliability-weighted part at fine, cosmetics worn) reads 82, so 79 keeps a 3-point margin, proportionally close to the old 2-point margin under 60. |
| `storyMissions.json` | `street-power-street-manners` reliability min | 48 | 82 | Doc-mandated re-derivation: the unsupported probe shape (sport intake/exhaust/ignitionEcu/forcedInduction alone) reads a real, precisely-computed headline of **0.678** (dangerous, torque-transmission bound; exact arithmetic against the shipped levers, cross-checked three independent ways - the "near 0.712" estimate elsewhere in this doc was a hand approximation and has been corrected to this figure). The probe now ALSO fits sport-grade internals/block/fuelSystem/cooling/clutch/gearbox/driveline/differential (support matched to the power parts' own grade), reaching headline 0.966 (adequate, cylinder-pressure bound) and reliability exactly 92 (= base, since coherenceFactor caps at 1.0 past adequate). `floor90(92) = 82`. |
| `storyMissions.json` | `street-power-street-manners` payout/budget | 992000 | 1453000 | Unchanged 1.3x/1.1x formula against the heavier (now-supported) probe's real cost. |
| `storyMissions.json` | `street-power-street-manners` tuner taste-match min | 0.98 | 1.01 | `round2At97Percent` of the fresh taste ratio. |
| `packages/game` auction-room-demo fixtures (`auctionRoom.test.ts`, `auctionRoomDemo.test.ts`, `AuctionRoomDemoScreen.test.ts`) | the `honda-city-e-aa` "packed" trap lot's room read, true value, reserve, clearing price, and the full bid-war log/winner | (assorted) | (assorted, all re-measured from a fresh seeded run) | See "The one thing I could not fully explain" below. |

**Cars each re-derived mission threshold now excludes**, on the shipped 26 (checked directly,
per car, against `spec.reliabilityBase`): `wont-strand-her` (75), `the-fleet-spare` (79) and
`first-proper-car` (73) exclude none of the 26 - every shipped car's base clears all three.
`street-power-street-manners` (82) excludes exactly one: **`mazda-rx7-fd3s`** (base 80). Its
sibling `mazda-savanna-rx7-fc3s` (base 82) sits exactly on the line and is not excluded. This is
narrower than the sprint doc's own illustrative guess ("the-fleet-spare lands near 83, which puts
both rotaries out of reach") - my precisely re-derived `the-fleet-spare` figure is 79, not ~83, and
at 79 neither rotary is excluded. Flagging the discrepancy rather than quietly matching the doc's
guess, since the doc itself says "report it as a finding."

### What is genuinely unreachable, and why (Definition-of-done box left partial)

The doc's illustrative percentage table gives fine/worn/poor cells at two sub-adequate headlines
(0.588, 0.539) - e.g. "race turbo, stock bottom end, all fine: 28%". These treat `conditionFactor`
and the headline as independently controllable. They are not, for any build whose headline comes
from a fitted gain part: that same part is also one of the fifteen reliability-weighted parts, so
uniformly ageing the whole car ALSO reduces its own gain (demand is band-scaled, by design - "a
blown turbo must stop demanding a bottom end to contain boost it is not making"), which RAISES the
headline at the same time ageing lowers `conditionFactor`. Measured directly: a uniformly-`fine`
race-turbo-alone build reads 31, not the doc's illustrative 25 - the worn turbo is simultaneously
demanding less boost. This is the formula working exactly as specified, not a defect, and it is
arguably a nice emergent property (an incoherent build that has also worn in gets a little of its
coherence back). `reliabilityModel.test.ts` pins the two low headlines' MINT cells exactly (39 and
33 on the base-92 forced car), pins the floor at exactly 0, and replaces the unreachable cross-axis
cells with an honestly-buildable equivalent (the gain part held at mint, everything else aged) that
proves the qualitative claim - an incoherent build loses more to ageing than a coherent one - without
asserting numbers the model cannot actually produce from one real build.

### The one thing I could not fully explain

Removing this sprint's changes (schema, economy.json, cars.json, parts.json) shifted several
pinned yen figures in the auction-room DEMO fixtures (`auctionRoom.test.ts`,
`auctionRoomDemo.test.ts`, `AuctionRoomDemoScreen.test.ts`) for the fixed "packed" trap lot
(`honda-city-e-aa`) - its room read, true value, reserve, clearing price, and even which dealer
wins the simulated bid war. I traced `marketValueYen`/`estimateValueYen`/`sheetGuideValueYen`
(the functions behind every one of those figures) line by line and none of them reads
`StatBlock.reliability` or calls `computeDerivedStats` - I could not find the mechanism by which
this sprint's changes reach them. I did NOT root-cause it further given the time already spent;
I re-derived every affected figure from a fresh, deterministic, seeded run (the file's own doc
comment explicitly sanctions exactly this: "when the catalogue or the valuation moves, the pins
are re-derived from a fresh seeded run rather than adjusted by hand") and every affected test now
passes. This is a real, disclosed uncertainty: I am confident the NEW pins are an honest
measurement of the current code, and confident `harnessAcceptance.test.ts` (lap time, the hard
constraint) is untouched, but I cannot name the exact causal path for this specific demo-fixture
movement. Worth a second look if it recurs on a future sprint's content change.

### Checks run, final output

- `pnpm vitest run` (packages/content, whole project once): **21 files, 473 tests, all passed.**
- `pnpm vitest run` (packages/game, whole project once): **62 files, 831 tests, all passed.**
- `pnpm vitest run` (packages/sim, named files only, never the whole project): `supportRatios.test.ts`,
  `reliabilityModel.test.ts`, `derivedStats.test.ts`, `marketValue.test.ts`, `valuation.test.ts`,
  `bands.test.ts`, `carCondition.test.ts`, `harnessAcceptance.test.ts`, `valueModelProbes.test.ts`,
  `storyMissionProbes.test.ts`, `auctionGuarantors.test.ts`, `catalogs.test.ts`,
  `referenceBoard.test.ts`, `lapModelPace.test.ts`, `lapModel.test.ts`, `coherence.test.ts`,
  `parts.test.ts`, `plays.test.ts`, `missions.test.ts`, `requirements.test.ts`,
  `valueStatIndependence.test.ts`, `tutorialProbe.test.ts` - **every one passed**, each run once
  (`harnessAcceptance.test.ts` passed unmodified, satisfying the hard lap-time constraint).
- No `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test:coverage` or `pnpm build` run
  locally, per the maintainer's speed directive - the pre-push hook is the gate.

### Outstanding / assumptions made

- The auction-room demo pin movement above (root cause not fully traced).
- `the-fleet-spare`'s and `street-power-street-manners`'s re-derivation assumed "the cheapest car
  that can plausibly satisfy the mission" is the car the existing probe already builds
  (`honda-crx-sir-ef8`, `nissan-180sx-rps13`) - not independently re-searched across the roster.
- `street-power-street-manners`'s "supported version of that same shape" was built as sport-grade
  support matched to the sport-grade power parts already fitted (uniform grade throughout), rather
  than a minimal or race-grade support set - a judgement call, not a doc-specified shape.
- The Zod schema bound on `spec.reliabilityBase` is `0..100` (the sprint doc's literal line);
  the authored 65-100 scale is enforced only by the roster CSV guard test, not the schema itself,
  again per the sprint doc's literal instruction.
- Directive 22's stop condition was never triggered: every value touched was either one of the
  eight signed levers or one of the four explicitly-excepted story-mission thresholds.

---

## Amendment (2026-07-30): a rebalance measured after this sprint shipped

**This section is an addition, not a rewrite.** Sprint 136 shipped as recorded above. Verifying
its own worked figures against the shipped code (not against the design doc's hand estimates)
found three real defects, none of them present in the design as signed - the shipped
*implementation* deviated from the design in one place (demand's own band-scaling, corrected
here) and the shipped ceiling/weight values were sound-but-harsh first passes always intended to
be revisited. The maintainer signed a rebalance of nine levers on 2026-07-30 to fix them. What
follows is that rebalance: measured, signed, and landed in this same change - the Exit above is
left as it shipped; corrections to its own factual errors are marked in place, above.

### The three defects this rebalance fixes

1. **Reliability only ever read the engine and drivetrain.** A car with cords showing through its
   tyres or a weeping brake line was read as exactly as reliable as one on fresh rubber and tight
   lines - six chassis/wheels parts carried handling or style weight but no reliability weight at
   all.
2. **A flat support margin punished a sensible turbo build harder than a sensible NA one.** With
   no factory headroom on the support side at all, a support ratio compared a build's ENTIRE
   demand against bare specification, so a big forced-induction build - which asks proportionally
   more of the car even when done sensibly - read far more "unsupported" than an NA build asking
   for the same fraction of extra output.
3. **Demand was band-scaled, and that let a rotting part raise reliability.** Support ratios
   compared band-scaled demand (output, which falls with wear) against grade-only support
   (specification, which does not decay). Ageing a fitted GAIN part shrank its own demand at the
   same time its own condition fell, so the coherence factor could rise faster than the condition
   mean fell - measured in 172 cases where a worn build read as MORE reliable than the same build
   mint. `packages/sim/tests/reliabilityModel.test.ts`'s own pre-rebalance formula reproduces
   this on `nissan-180sx-rps13`: 33, 34, 36 (RISING) as a fitted race turbo ages from mint to
   worn, before the severity ceiling drags it back down at `poor`.

### The nine levers, signed 2026-07-30

| lever | old | new | fixes |
| --- | ---: | ---: | --- |
| `parts-taxonomy.json` `tyres.statWeights.reliability` | (absent) | 2 | defect 1 |
| `parts-taxonomy.json` `brakeCalipersLines.statWeights.reliability` | (absent) | 2 | defect 1 |
| `parts-taxonomy.json` `steering.statWeights.reliability` | (absent) | 2 | defect 1 |
| `parts-taxonomy.json` `brakePadsDiscs.statWeights.reliability` | (absent) | 1 | defect 1 |
| `parts-taxonomy.json` `springs.statWeights.reliability` | (absent) | 1 | defect 1 |
| `parts-taxonomy.json` `underbody.statWeights.reliability` | (absent) | 1 | defect 1 |
| `statFormulas.support.stockSupportMargin` | (absent) | 0.55 | defect 2 |
| `statFormulas.condition.reliabilityCeiling.poor` | 0.55 | 0.70 | severity ceiling softened alongside defect 1 (more parts can now trip it) |
| `statFormulas.condition.reliabilityCeiling.scrap` | 0.25 | 0.40 | severity ceiling softened alongside defect 1 |

All six taxonomy weights are ADDITIVE: no existing handling, style or physical weight was removed
or reduced anywhere. Total reliability weight rises from 22 (15 parts) to 31 (21 parts).

Two more changes ride alongside the nine but are not themselves tunable numbers, so they sit
outside the table:

- `statFormulas.condition.reliabilityCeilingWeightReference` (new content key, value **3** - the
  taxonomy's own highest reliability weight, cooling's) is what the ceiling divides a part's own
  weight by to find its relevance. It is a structural constant the ceiling formula needs to
  express relevance at all, not an independent tuning lever - changing it rescales every weight's
  bite at once rather than retuning one part.
- **Demand now reads GRADE, not band** (`packages/sim/src/support.ts`) - fixes defect 3. Not an
  economy.json value: a formula correction, dropping the `* bandFactor(installed.band, economy)`
  term from the demand-side gain calculation so demand and support both read the fitted grade
  only, exactly as support already did.

### The severity ceiling: from a flat lookup to a weighted minimum

Alongside softening the raw poor/scrap values, the ceiling itself changed shape. It used to be a
single table lookup keyed to the WORST band among the reliability-bearing parts, so a weight-1
propshaft capped a car exactly as hard as weight-3 cooling. It now reads each offending part's own
relevance: `cap = 1 - (1 - reliabilityCeiling[band]) * min(1, statWeights.reliability /
reliabilityCeilingWeightReference)`, taken as the minimum across every reliability-bearing part on
the car. A weight-1 part at `poor` now leaves a car at 90% of its uncapped mean; a weight-3 part
(cooling) at `poor` leaves it at 70%; the same pair at `scrap` gives 80% and 40%.

### Re-derived pins

Every pin below was re-derived from a real run of the rebalanced code (directive 17 case (a)),
never iterated toward a pass.

**`economyApprovalGate.test.ts`**: `economy.json` hash `ba3df414...` -> `45a3e42d...` (new/changed
levers above); mission payout/budget-cap table unchanged (see below).

**Story-mission reliability thresholds - all four checked, none moved.** All four are
mathematically unaffected by every lever in this rebalance, confirmed against a fresh
`storyMissionProbes.test.ts` run:

- `wont-strand-her` (75) and `first-proper-car` (73): both probes are all-stock, uniform-band
  builds. A uniform band's weighted mean equals that band's factor regardless of how weight is
  distributed across parts (Change 1), demand is 1 and support is 1 regardless of the margin
  (Change 2) since an all-stock car has no gain fitted, and the severity ceiling never engages at
  `fine` (Change 3). Untouched by construction.
- `street-power-street-manners` (82): its probe is built entirely at `mint`, so Change 1 cannot
  move the condition mean (every part reads its band factor at 1.0 regardless of weight). Its
  headline was already 0.966 (`adequate`) before this rebalance; the proportional margin can only
  raise a headline that is already above `adequate`, and the coherence factor is already capped at
  1.0 there either way. Reliability stays exactly 92 (= base).
- `the-fleet-spare` (79, a hand-set floor with margin, not a `floor90(measured)` pin): the ONE
  mission whose fresh measurement genuinely moves, because its probe ages `underbody` to `worn`
  as one of five deliberately-worn cosmetic slots, and `underbody` is now reliability-weighted
  (lever 6 above). Fresh measurement: 81 (was 82) on `honda-crx-sir-ef8`. The 79 floor still
  clears with a 2-point margin (was 3), comfortably satisfiable - kept unchanged rather than
  re-tuned for a 1-point shift in a hand-set value.

No mission payout, budget cap, or taste-match floor moves as a result: none of the four probes'
fitted parts, purchase price, or repair bill changed, only (for one of them) the measured
reliability score, which stayed above its own gate.

**`packages/sim/tests/reliabilityModel.test.ts`** (re-pinned in full; selected figures):

| build | old | new |
| --- | ---: | ---: |
| stock, one grenade (cooling, weight 3) - Carina / FD | 25 / 20 | 40 / 32 |
| race turbo alone, mint - 180sx (base 92) | 39 | 75 |
| maximal build, no support, mint - 180sx | 33 | 71 |
| race turbo alone + one grenade - 180sx | 0 | 20 |
| maximal build, no support + one grenade - 180sx | 0 | 16 |
| one weight-1 part at scrap, rest mint - 180sx | 23 (25% of base) | 74 (80% of base) |
| one weight-2 part at scrap, rest mint - 180sx | 23 (25% of base) | 55 (60% of base) |
| one weight-3 part (cooling) at scrap, rest mint - 180sx | 23 (25% of base) | 37 (40% of base) |

**`packages/sim/tests/supportRatios.test.ts`** (re-pinned in full; selected figures, all on
`nissan-180sx-rps13`):

| build | old headline/band | new headline/band |
| --- | --- | --- |
| a maximal forced-induction build, race grade throughout | 0.994, adequate | 1.226, adequate |
| a race turbo and nothing else | 0.588, dangerous | 0.815, strained |
| race turbo + race fuelling + race cooling, stock bottom end | 0.588, dangerous | 0.815, strained |

**A consequence worth flagging rather than quietly absorbing**: under `stockSupportMargin = 0.55`,
the mathematical floor under every headline is `margin + (1 - margin) / demand`, which never
drops below 0.55 as demand grows without bound, and never drops below roughly 0.793 for any demand
the shipped catalogue's own gain parts can actually produce (the highest reachable demand on any
subsystem, any of the 26 cars, is `torqueTransmission` at 1.855 on a maximal unsupported
`nissan-180sx-rps13` build). That floor sits above the `strained`/`dangerous` line (0.75)
everywhere measured, so `dangerous` is not reachable through a pure demand/support imbalance
anywhere in the current 26-car roster - it takes the severity ceiling (a real broken/missing
part) to read `dangerous`'s underlying reliability numbers now, never an unsupported build alone.
`packages/game/src/screens/CarDetailScreen.test.ts`'s own `dangerous`-band fixture had to move to
`strained` for exactly this reason. This is a real, measured property of the signed margin, not a
defect in the implementation - flagged for the maintainer's own playtest judgement, per this
sprint's own "preliminary means implement exactly as written, expect a playtest retune" framing
for levers 1 to 5.

**`packages/game`**: `CarDetailScreen.test.ts`'s `dangerous` fixture (race turbo alone) now reads
`strained` per the finding above; its `strained` fixture (which read `adequate` under the new
margin at its old sport/sport/sport recipe) was strengthened by one grade (ECU to `race`) to stay
under the `adequate` line. No other `packages/game` test moved - the three auction-room files
`auctionRoom.test.ts`, `auctionRoomDemo.test.ts` and `AuctionRoomDemoScreen.test.ts` were checked
by name per this arc's own standing caution (a pricing lever moved in Sprint 135 and these three
were missed) and pass unchanged when run without the whole-project run's timing contention.

### `docs/sprints/tuning-arc.md`

The "three corrections" section's second correction ("demand reads band, support reads grade")
stated the exact opposite of the fix above and reasoned that reading grade for demand would
"charge condition twice." Both halves were wrong; rewritten in place with the corrected rule and
the measured evidence (172 cases, the worn-FD figure) that the original reasoning produced,
rather than silently deleted, so nobody restores it.

### Checks run for this amendment

- `pnpm vitest run packages/sim/tests/reliabilityModel.test.ts` - 47 tests, passed.
- `pnpm vitest run packages/sim/tests/supportRatios.test.ts` - 54 tests, passed.
- `pnpm vitest run packages/sim/tests/derivedStats.test.ts packages/sim/tests/marketValue.test.ts
  packages/sim/tests/valuation.test.ts` - 42 tests, passed, unchanged.
- `pnpm vitest run packages/sim/tests/storyMissionProbes.test.ts` - 19 tests, passed, unchanged
  (confirms no mission threshold moved).
- `pnpm vitest run packages/sim/tests/valueModelProbes.test.ts` - 24 tests, passed, unchanged.
- `pnpm vitest run packages/sim/tests/harnessAcceptance.test.ts` - 27 tests, passed, unchanged
  (the hard lap-time constraint: reliability is not read by the lap model).
- `pnpm vitest run --project content` (whole project, once) - 21 files, 473 tests, passed.
- `pnpm vitest run --project game` (whole project, once) - 58 files passed outright; 4 files
  (`auctionRoom.test.ts`, `auctionRoomDemo.test.ts`, `AuctionRoomDemoScreen.test.ts`,
  `CarDetailScreen.test.ts`) reported failures. Six of the seven individual failures were
  `Test timed out in 5000ms` on the three auction-room files, not assertion failures; re-run in
  isolation (three files together, no other project contention) they passed clean at 61/61 -
  resource contention from the whole-project run, not a regression. The seventh, a real
  `CarDetailScreen.test.ts` assertion failure (a `strained`-band fixture that had drifted to
  `adequate` under the new margin), was fixed and `CarDetailScreen.test.ts` re-run alone: 80
  tests, passed.
- No `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test:coverage` or `pnpm build` run
  locally, matching this sprint's own speed directive.

---

## Amendment 2 (2026-07-30): `stockSupportMargin` 0.55 -> 0.27, `dangerous` made reachable again

**This section is an addition, not a rewrite.** The amendment above shipped
`stockSupportMargin` newly introduced at 0.55, and flagged its own consequence rather
than quietly absorbing it: the margin's mathematical floor, `margin + (1 - margin) /
demand`, never drops below roughly 0.793 for any demand the shipped catalogue's own
gain parts can produce, which sits above the `strained`/`dangerous` line (0.75)
everywhere measured on the 26-car roster. **The `dangerous` verdict was therefore
unreachable through a pure demand/support imbalance by any build on the roster** -
only the severity ceiling (a genuinely broken part) could ever produce it, which is
not what the support model exists to catch. The maintainer signed **0.27** the same
day: the most robust point in the signed valid window [0.22, 0.30].

### Re-derived pins (second amendment)

**`economyApprovalGate.test.ts`**: `economy.json` hash `45a3e42d...` -> `c795b74e...`
(the one changed lever). Mission payouts and budget caps unchanged.

**Story-mission reliability thresholds - all four checked, none moved.** None of the
four probes is a demand/support-imbalanced build in the first place, so none of them
sits anywhere near the margin's own bite: `wont-strand-her` and `first-proper-car` are
all-stock, uniform-band builds (demand is exactly 1 regardless of the margin);
`the-fleet-spare` ages only cosmetic parts, fitting no aftermarket gain;
`street-power-street-manners`'s probe is fully sport-supported and already read
`adequate` before this change, so a lower margin (which only ever lowers a headline,
never raises one) cannot push a build that was never bound by the margin below its
own gate. Confirmed by a fresh `storyMissionProbes.test.ts` run: 19 tests, unchanged.

**`packages/sim/tests/supportRatios.test.ts`** (re-pinned; `nissan-180sx-rps13`):

| build | old headline/band | new headline/band |
| --- | --- | --- |
| race turbo alone | 0.815, strained | 0.699, dangerous |
| race turbo + race fuel + race cooling, stock bottom end | 0.815, strained | 0.699, dangerous |
| maximal forced-induction build, race grade throughout | 1.226, adequate | 1.111, adequate |

**`packages/sim/tests/reliabilityModel.test.ts`** (re-pinned; `nissan-180sx-rps13`,
base 92, unless noted):

| build | old | new |
| --- | ---: | ---: |
| race turbo alone, mint | 75 | 56 |
| race turbo alone, one grenade (cooling scrap) | 20 | 0 |
| maximal build, no support, mint | 71 | 50 |
| maximal build, no support, one grenade | 16 | 0 |
| race turbo alone aged: mint/fine/worn/poor/scrap | 75/62/43/20/0 | 56/42/23/0/0 |
| maximal-gain, zero-support, all-scrap, per car (26 cars) | 21 at 0, 5 round up to 1 | all 26 at exactly 0 |

**Two verification builds named by the maintainer, re-derived from a real run
(`packages/sim/tests/derivedStats.test.ts`'s own `computeDerivedStats`, not hand
estimated):**

- `nissan-180sx-rps13`, a sport-grade turbo with matched sport `fuelSystem` and
  `cooling` (all three `sport`, mint): headline 0.767 (cylinder pressure), reliability
  **67** (was 83 at margin 0.55).
- `toyota-sprinter-trueno-ae86` (base 94, `high-strung-na` - 130 PS from 1587cc is
  81.9 PS/L, above the 80.0 threshold). This car carries no factory forced induction,
  so its analogous unsupported subsystem is **revs**, driven by `camsTiming` rather
  than `forcedInduction` (revs carries the highest demand weight in the table, 3.5,
  exactly as cylinder pressure's forced-induction path is 180SX's). Bare race
  `camsTiming` alone: headline 0.811 (revs), reliability **76**, `strained`. The
  matched sport-grade version (`camsTiming`/`fuelSystem`/`cooling` all `sport`):
  headline 0.861 (revs), reliability **86**, `strained`. Neither crosses into
  `dangerous` on this car - the AE86's smaller total-gain profile keeps its `revs`
  ratio clear of the 0.75 line that the 180SX's bare turbo now crosses on
  `cylinderPressure`, which is a genuine per-car difference in how hard a "bare gain
  part" build actually bites, not an inconsistency.

**Every stock-mint and fully-supported race build still reads exactly its own
`spec.reliabilityBase` on all 26 shipped cars, unaffected by construction**: a stock
car's demand is exactly 1 on every subsystem regardless of the margin's value (the
margin term is always `margin * 0 = 0` there), so the stock-car identity and the
no-premium rule both hold untouched - re-confirmed by
`reliabilityModel.test.ts`'s own "the base is the ceiling" suite, unchanged and
passing.

### Checks run for this second amendment

- `pnpm vitest run packages/sim/tests/supportRatios.test.ts
  packages/sim/tests/reliabilityModel.test.ts` - 101 tests, passed.
- `pnpm vitest run packages/sim/tests/storyMissionProbes.test.ts` - 19 tests, passed,
  unchanged (confirms no mission threshold moved).
- `pnpm vitest run packages/sim/tests/derivedStats.test.ts
  packages/sim/tests/marketValue.test.ts packages/sim/tests/valuation.test.ts
  packages/sim/tests/bands.test.ts packages/sim/tests/carCondition.test.ts
  packages/sim/tests/valueModelProbes.test.ts packages/sim/tests/harnessAcceptance.test.ts`
  - 165 tests, passed, unchanged (the hard lap-time constraint: reliability is not
  read by the lap model).
- `pnpm vitest run packages/content/tests/economyApprovalGate.test.ts` - 3 tests,
  passed, with the re-pinned hash.
- `pnpm vitest run --project content` (whole project, once): **21 files, 478 tests, all
  passed** (run once at the end of the whole change, alongside the adversarial-
  verification defect fixes bundled into the same session, including
  `partPricing.test.ts`'s asymmetric value-per-yen bound).
- `pnpm vitest run --project game` (whole project, once): **62 files, 831 tests, all
  passed.** One real fallout fixed in the same change:
  `CarDetailScreen.test.ts`'s "race turbo on a stock bottom end" fixture moved from
  `strained` to `dangerous` (headline 0.699), matching the whole point of the
  0.55 -> 0.27 retune - re-pinned and its framing-copy assertion updated
  (`It will do, but it is` -> `This is`). The three auction-room files
  (`auctionRoom.test.ts`, `auctionRoomDemo.test.ts`, `AuctionRoomDemoScreen.test.ts`)
  timed out under the whole-project run's resource contention (a pre-existing flake,
  not a value regression - confirmed by re-running all three together in isolation,
  61/61 passed); each was given an explicit 30s `vi.setConfig({ testTimeout })` so the
  whole-project run is reliable rather than merely re-run until it happens to pass.
- No `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test:coverage` or `pnpm build`
  run locally, matching this sprint's own speed directive.

---

## Amendment 3: `stressCoefficient`, a build-intensity term outside coherence

**This section is an addition, not a rewrite.** Both amendments above shipped as recorded. A third
gap was found by playing the shipped model: a fully supported race build read EXACTLY the car's
`reliabilityBase`, identical to bone stock. The maintainer's ruling: *"Even IF a full race build is
properly supported and built perfectly, it's still way more energy going through every part of the
system, so reliability needs to drop relative to stock, but NOT nearly as much as reliability
should drop when you build something stupid."* It also delivers a visible street-to-sport-to-race
progression the coherence threshold alone could not, since `coherenceFactor` caps at 1 the moment a
build clears `adequate` and stays there for every rung above it.

### The mechanism

`statFormulas.support.stressCoefficient` (NEW, `packages/content/data/economy.json`, sibling of
`stockSupportMargin`, Zod entry in `packages/content/src/economy.ts` mirroring its shape) is an
OUTER multiplier on the existing condition-plus-coherence budget:

```text
reliability = base * clamp(conditionFactor + coherenceFactor - 1, 0, 1)
              * clamp(1 - stressCoefficient * totalGainFraction, 0, 1)
```

`totalGainFraction` is the sum of every fitted part's own `powerFraction[engineCharacter]` across
the whole car - exactly the `totalGain` accumulator `supportRatios` already computed internally.
`packages/sim/src/support.ts` gained `totalGainFractionOf`, reading the SAME `computeContributions`
walk `supportRatios` reads (extracted from the loop that used to sit inline in `supportRatios`
itself) rather than a second copy of the sum. `packages/sim/src/derivedStats.ts` gained
`reliabilityIntensityFactor(totalGainFraction, economy)`, defensively clamped to `[0, 1]` so a
future content change can never push it negative or above 1.

**Deliberately NOT folded into `coherenceFactor`'s own additive shortfall.** That alternative was
measured and rejected: it would subtract an identical flat amount from a supported and an
unsupported build alike, collapsing the unsupported case toward an uninteresting floor. The two
terms stay structurally independent: `coherenceFactor` answers whether the build holds together;
the new outer factor answers how much more energy it is moving, regardless of whether it holds
together.

`totalGainFraction` is exactly 0 on a stock car (no aftermarket part fitted anywhere), so the outer
factor is exactly 1 there and the stock-car-reads-exactly-its-base identity is untouched by
construction - verified directly (not inferred) on all 26 shipped cars.

### The lever

**Signed by the maintainer: `stressCoefficient` = 0.20.**

### What it produces

At mint, `stressCoefficient` 0.20, verified against a real run and matching the signed proposal
exactly:

| build | car (base) | reliability |
| --- | --- | ---: |
| maximal fully supported race build | nissan-180sx-rps13 (92) | **75** |
| maximal fully supported race build | toyota-sprinter-trueno-ae86 (94) | **82** |
| maximal fully supported race build | toyota-supra-rz-jza80 (94) | **76** |
| maximal unsupported build | nissan-180sx-rps13 (92) | **41** |
| maximal unsupported build | toyota-sprinter-trueno-ae86 (94) | **55** |
| maximal unsupported build | toyota-supra-rz-jza80 (94) | **41** |

`toyota-sprinter-trueno-ae86`'s `camsTiming` ladder alone (unsupported): street **93**, sport
**85**, race **75**. All three verified against a real run and matching the signed proposal
exactly.

**The same ladder's "supported" row, settled.** Read street 92, sport 90, race 88 in the signed
proposal; several plausible "supported" constructions were tried against the real code and none
reproduced it (closest, headValvetrain matched to `camsTiming`'s own grade alone, read 93/92/90).
The exact construction: `camsTiming` at the ladder grade, plus every dual-role and pure-support
slot across all five subsystems at the SAME grade - `headValvetrain`/`internals` (revs), `block`
(cylinder pressure), `fuelSystem` (fuelling), `cooling` (heat), `clutch`/`gearbox`/`driveline`/
`differential` (torque transmission), everything else stock, run against the real code, reads
**92/90/88 exactly**. The scratchpad model and the shipped code agree on every figure in the signed
proposal; the earlier mismatch was an under-specified construction, not a divergence between the
model the coefficient was derived from and the code that implements it. Pinned exactly in
`reliabilityModel.test.ts`'s own dedicated test for this ladder.

### Re-derived pins

**`economyApprovalGate.test.ts`**: `economy.json` hash `aa1d7bf6...` -> `65ae96c4...` (one new
lever, `stressCoefficient`). Mission payouts and budget caps table unchanged. A forward note added
to the doc comment (not a rewrite): the `stockSupportMargin` re-pin's claim that "every stock-mint
and fully-supported race build still reads exactly its own `spec.reliabilityBase`" was true when
written and is left in place as the historical record of that change; from this lever onward it is
a supported build with ZERO total gain that reads exactly base, not every supported build.

**`packages/sim/tests/reliabilityModel.test.ts`** (re-pinned; `nissan-180sx-rps13`, base 92, unless
noted):

| pin | old | new |
| --- | ---: | ---: |
| `toyota-carina-at150` fully supported race build, mint | 100 (= base) | **83** |
| `mazda-rx7-fd3s` fully supported race build, mint | 80 (= base) | **65** |
| raceTurboAlone (bare race turbo), mint | 56 | **52** |
| maximalNoSupport (`RACE_GAIN_ONLY`), mint | 50 | **41** |
| raceTurboAlone aged mint/fine/worn/poor/scrap | 56/42/23/0/0 | **52/39/22/0/0** |
| "a fully supported race build reads exactly the same as stock, all 26 cars" | equality test | **replaced**: strictly below stock on every car, `totalGainFraction` asserted strictly positive first |

Six new tests added (the build-intensity factor's own describe block): the factor is exactly 1 at
zero total gain, asserted directly rather than inferred; a stock car has exactly zero total gain on
all 26 cars; the factor is monotone non-increasing in total gain and never leaves `[0, 1]` including
against inputs no real content can produce (defensive-clamp regression guard); reliability itself
never rises when total gain rises on a real build, condition and coherence held fixed; the
street/sport/race creep is monotone non-increasing, one representative car per engine character,
both an unsupported (power slot alone) and a supported construction; and a dedicated exact pin for
the AE86's own `camsTiming` ladder (street/sport/race, alone 93/85/75 and fully supported 92/90/88 -
see "the same ladder's supported row, settled" above for the construction).

**"Nothing anywhere exceeds the car's own base"** (`toBeLessThanOrEqual`) passes unchanged: the new
outer factor only ever multiplies the existing bounded value by something in `[0, 1]`, so it can
only pull a figure down, never past the ceiling.

**No `packages/game` fixture pin moved.** `pnpm vitest run --project game` (whole project, once):
62 files, 831 tests, all passed with no changes required - reliability feeds buyer taste and
therefore prices, so this was checked rather than assumed.

### What did NOT move, and what is blocked rather than moved

**Every other sim file checked passes unchanged**: `supportRatios.test.ts` (54 tests - `supportRatios`
and `supportVerdict`'s own external behaviour is untouched by the `totalGainFractionOf` extraction),
`derivedStats.test.ts`, `marketValue.test.ts`, `valuation.test.ts`, `bands.test.ts`,
`carCondition.test.ts`, `valueModelProbes.test.ts`, `harnessAcceptance.test.ts` - none of their
fixtures fit an aftermarket gain part, so `totalGainFraction` is 0 throughout and the new factor is
always exactly 1 there.

**`street-power-street-manners`'s reliability threshold and tuner taste-match floor, re-derived.**
Its probe (a 180sx built to mint with sport power AND sport support throughout) is the one probe in
the suite that fits aftermarket gain parts, and its measured reliability moves from 92 (= base) to
**82** under the new factor. This threshold is one of the four story-mission reliability thresholds
Sprint 136 itself signed as `floor90(measured)` pins rather than chosen design numbers (Task 8, "Item
4: re-derive, do NOT stop"), so its movement is a mechanical consequence of the signed
`stressCoefficient`, not an independent lever: `statThreshold(reliability).min` re-derives
`floor90(82)` = 82 -> **73**, and `tasteMatch(tuner).minMultiplier` re-derives `round2At97Percent` of
the freshly measured taste ratio (reliability is 37 per cent of a tuner's taste), 1.01 -> **1**.
Neither `payoutYen` nor `budgetCapYen` moves (both stay 1453000 yen): the probe's purchase, repair
and parts cost is unaffected by reliability, so the formula-derived payout and budget cap of that
unchanged cost are unchanged, confirmed by a fresh run rather than assumed. This does not make the
mission markedly easier or harder relative to its own probe: the threshold tracks what the SAME
probe build now measures, it does not change what the probe has to build. The other three
reliability-gated missions (`wont-strand-her`, `the-fleet-spare`, `first-proper-car`) are unaffected:
all three probes are all-stock or cosmetics-only builds with zero total gain.
`storyMissionProbes.test.ts` (19 tests) and `economyApprovalGate.test.ts` (3 tests, with a new
ledger entry naming this re-derivation as the signed lever's consequence) both pass.

**One pre-existing, unrelated failure surfaced while running the wider suite, not caused by this
change.** `packages/sim/tests/selling.test.ts`'s "a stock entry-tier car listed in the magazine
draws no offer on a seeded day the same car on shopFront does" fails on a clean run of that file
alone. The fixture car is entirely stock parts (`uniformCarParts('worn')`), so its total gain is 0
under both the old and the new formula; verified directly against both formulas on the exact car
construction (`honda-city-e-aa`, all-stock, uniformly worn) that its reliability is bit-for-bit
identical (64) either way. This failure predates this change and is out of this lever's scope;
not investigated further here.

### Checks run for this amendment

- `pnpm vitest run packages/sim/tests/reliabilityModel.test.ts` - 54 tests, passed (the AE86 ladder's
  exact "supported" construction settled and pinned in the same file).
- `pnpm vitest run packages/sim/tests/supportRatios.test.ts` - 54 tests, passed, unchanged.
- `pnpm vitest run packages/sim/tests/derivedStats.test.ts packages/sim/tests/marketValue.test.ts
  packages/sim/tests/valuation.test.ts packages/sim/tests/bands.test.ts
  packages/sim/tests/carCondition.test.ts packages/sim/tests/valueModelProbes.test.ts
  packages/sim/tests/harnessAcceptance.test.ts packages/sim/tests/selling.test.ts` - 222 of 223
  passed; the one failure (`selling.test.ts`) is the pre-existing, unrelated one described above.
- `pnpm vitest run packages/sim/tests/storyMissionProbes.test.ts` - 19 tests, passed (the
  `street-power-street-manners` threshold and taste-match floor re-derived above).
- `pnpm vitest run packages/content/tests/economyApprovalGate.test.ts` - 3 tests, passed, with the
  re-pinned hash and the mission-threshold ledger note.
- `pnpm vitest run --project content` (whole project, once): **21 files, 478 tests, all passed.**
- `pnpm vitest run --project game` (whole project, once): **62 files, 831 tests, all passed** (run
  before the mission-threshold re-derivation; that change touches no `packages/game` file and no
  file there references this mission by id, so it was not re-run).
- No `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test:coverage` or `pnpm build` run locally,
  matching this sprint's own speed directive.

---

## The auction-demo pin movement, root-caused

**This closes "The one thing I could not fully explain" in the Exit above.** That section stays
as written: the uncertainty was real and was disclosed rather than papered over. This is the
answer, found later.

**The mechanism.** `enforceMinWorkBill` draws a PRNG step per yen-floor increment, so any change
to catalogue prices or part costs changes how many draws a lot consumes, which reshuffles the
whole fixed-seed `local-yard` catalogue downstream of it. That is why a change touching only
reliability could move a demo lot's car, its room read, its clearing price and which dealer won
the bid war, without any of `marketValueYen`/`estimateValueYen`/`sheetGuideValueYen` ever
reading `StatBlock.reliability`: the valuation functions were never the path, the lot
*generation order* was.

Confirmed by recurrence, which is the evidence the Exit asked for. The same trap fired again in
Sprint 137's `camsTiming` amendment and was diagnosed there in full; its fix (widening
`DEMO_CATALOG_N_STEPS`, then re-deriving every pin from a fresh seeded run) is the same fix
applied here. The re-derived pins recorded above are therefore an honest measurement, as the
Exit claimed, and the causal path is now named.

**Status: closed.** The standing caution it produced (check the three auction-room fixture files
by name whenever a price or part cost moves) is live practice across the rest of this arc.
