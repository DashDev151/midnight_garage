# The tuning system, from the ground up

**Status: DESIGNED, not scheduled. Drafted 2026-07-28.**

Every number here is a proposal and unapproved. Every mechanism is designed against
what the shipped data model can and cannot express, which is stated precisely
rather than assumed.

---

## 1. What is wrong, measured

**The system is solved.** There is one correct build order and a player who works it
out never deviates. Three defects produce that, and they compound.

### 1a. A part's effect does not depend on the car

`StatModifierSchema` is five signed numbers (`power`, `handling`, `style`,
`reliability`, `authenticity`) and they are **absolute additive deltas**. The
catalogue is 472 SKUs, 118 per fitment class, and **the class moves only price**.
Every SKU's effect is byte-identical on every car in the game.

The race-grade power ladder, from `parts.json`:

| slot | PS | slot | PS |
| --- | ---: | --- | ---: |
| forcedInduction | 45 | camsTiming | 22 |
| block | 32 | headValvetrain | 20 |
| internals | 26 | ignitionEcu | 16 |
| exhaust | 13 | intake | 12 |
| fuelSystem | 11 | clutch | 3 |

Sum: **+200 PS, on anything.** That is x1.62 on a Supra and **x4.64 on a Wagon R**.
A ratio target cannot be expressed on an additive path at all.

### 1b. Nothing is grounded in how engines actually respond

The same +16 PS ECU applies to a naturally aspirated Beat and a twin-turbo Supra.
In reality an ECU on an NA engine is worth about **3 per cent** (recovering ignition
timing and a conservative factory map, with no boost to add) and on a turbo engine
**20 to 30 per cent** (raising boost and fuelling for it). Same part, same slot, an
order of magnitude apart, and the model cannot express the difference.

The same applies down the list: a cat-back is 3 to 4 per cent on an NA and 10 to 15
on a turbo, because on a turbo it is backpressure and spool rather than noise. A
panel filter is worth almost nothing on either. Cams and capacity are where NA power
actually lives, and they cost driveability.

**The maintainer's bar is explicit: people who know performance cars must not roll
their eyes.** Today they would.

### 1c. Every part is a gain, so the cheapest gain always wins

Exhaust at +13 PS costs a fraction of block at +32 PS. Per yen, exhaust wins
outright, and the same holds down the whole ladder. **There is no reason to ever
buy the block**, which is the maintainer's own question and it has no good answer
today.

### 1d. And a fourth, found while surveying: condition does not reach half the model

`computeDerivedStats` scales every `statModifiers` value by
`bandFactor(installed.band)`. But `buildFactors` in the same file reads only
`installed.partId`, resolves its `physicalModifiers`, and multiplies:

```
factors.grip *= modifiers.grip
factors.braking *= modifiers.braking
factors.mass *= modifiers.mass
```

**It never reads the band.** So a `scrap` race coilover delivers the identical
1.029 grip multiplier as a mint one, and a destroyed big brake kit brakes like a new
one. Two parallel modifier systems, and only one of them respects condition. This is
almost certainly the root of the maintainer's dissatisfaction with how condition
affects performance, and it is a bug rather than a tuning question.

---

## 2. What the data model can and cannot express today

Precision here decides how much of this is new schema versus new numbers.

**Can express:** an absolute PS delta; an absolute delta to handling, style,
reliability, authenticity; a multiplicative grip, braking or mass factor
(`physicalModifiers`, product across slots); a downforce and drag change, but ONLY
by being one of three `aeroFunctional` grades which replace the car's factory figure
outright; a compound-tier change, but only through the `tyres` slot's grade.

**Cannot express, at all:**

- a proportional (per cent of stock) power change
- any torque-curve or rev-range change
- gear ratios, final drive, redline
- weight distribution, wheelbase, centre of mass
- drivetrain layout or aspiration
- **any effect that depends on the car it is fitted to**

That last line is the whole problem in one sentence.

**And a related trap:** `spec.redlineRpm`, `peakTorqueNm`, `torqueRpm`, `powerRpm`
and `displacementCc` all exist on the model and **the physics reads none of them**.
`formulas.md` section 2 says so plainly: "Display data; the physics does not read
them." Any design that reaches for a torque curve is inventing data, not using it.

---

## 3. The design

Three part roles, one response model, four anti-dominance mechanisms.

### 3a. Parts have roles, not just numbers

| role | does | example |
| --- | --- | --- |
| **Gain** | adds output directly | exhaust, intake, cams, ECU on a turbo |
| **Enabler** | adds nothing alone, raises what gains can deliver | fuel system, cooling, internals, clutch |
| **Trade-off** | buys one thing at the cost of another | race cams, aggressive springs, a large turbo |

**This is the answer to "why would anyone buy the block".** The block and internals
are not power parts, they are **ceiling parts**: they decide how much boost or how
many revs the engine survives. Fit a large turbo to stock internals and you should
get the power *and* watch reliability collapse, because that is what actually
happens. The block earns its place without ever being a better power-per-yen buy,
and build *order* becomes a real thing rather than a shopping list sorted by
efficiency.

### 3b. Power becomes proportional, and response depends on the engine

Two changes, and they must land together.

**Proportional.** `statModifiers.power` becomes a fraction of the car's own stock
output rather than an absolute PS figure. That alone kills the x4.64 kei case.

**Response.** A pure proportional ladder is still boring, because every engine then
responds identically in shape. Real engines do not: **an engine's headroom depends
on what it is.** Proposal, a per-engine `tuningResponse` derived from facts the
model already carries:

| engine character | derived from | headroom | why |
| --- | --- | --- | --- |
| Forced induction | the induction tag | **high** | boost is power until fuel, cooling or internals run out |
| High-strung NA | high specific output for its capacity | **low** | a 10,000 rpm B16A left almost nothing on the table |
| Lazy NA | low specific output for its capacity | **medium** | detuned from the factory, and it gives some back |

Specific output is `stockPowerPs / (displacementCc / 1000)`, both of which already
exist on `spec`. So this needs no new authored content, only a derivation, and it
gets the right answer for free: a Beat (64 PS from 656 cc, 98 PS/litre, kei-limited)
reads high-strung; a Cefiro's RB20DET reads forced; a Carina's 1.5 reads lazy.

**Per-part response multipliers keyed on that character** are where the realism
lands:

| part | NA | forced | note |
| --- | --- | --- | --- |
| ignitionEcu | ~0.03 | ~0.25 | the flagship case; timing versus boost |
| exhaust | ~0.04 | ~0.14 | noise versus backpressure and spool |
| intake | ~0.02 | ~0.05 | almost nothing either way, correctly |
| camsTiming | ~0.10 | ~0.05 | where NA power lives; a turbo cares less |
| headValvetrain | ~0.08 | ~0.06 | porting and valves |
| block | ~0.12 | ~0.02 | capacity on NA; a ceiling part on turbo |
| forcedInduction | n/a | ~0.35 | fitting one to an NA car is an aspiration change, see section 5 |

Illustrative, not signed. The shape is the claim: **the same part is worth wildly
different amounts depending on what it is bolted to, and that is realistic.**

### 3c. The four anti-dominance mechanisms

**1. Enablers gate gains.** A gain part delivers its full value only if the enablers
behind it are present. Below that, it delivers a fraction and the shortfall shows up
as reliability loss rather than as a smaller number. So the cheap-parts-only build
hits a wall it can feel.

**2. Diminishing returns within a category.** The second thing you do to the intake
tract is worth less than the first. Prevents stacking one axis.

**3. Course dependence, which we already own and do not use.** Four courses with
published weights (Misaki 0.40, Hakone 0.35, Wangan 0.20, Yatabe 0.05) and genuinely
different characters: Hakone is corners, Wangan is top speed, Yatabe is a standing
kilometre. A grip build and a power build should win different courses. **This is
the strongest structural reason for there to be no single right answer, and it costs
nothing to exploit because the courses already exist.**

**4. Reliability as the price of unsupported power.** The stat exists and currently
does nothing but track condition. Give it the job of expressing consequence.

### 3d. Suspension, briefly, so it cannot dominate either

Grounded the same way. **Tyres are the big grip lever** and already deliver it
through the compound tier. Dampers, springs and anti-roll bars are modest on
absolute grip and mostly about balance and consistency; the shipped ladder
(1.01/1.02/1.029 each, compounding to about 1.09 fitted together) is roughly the
right order of magnitude and should stay modest. Aero only pays above about
100 km/h, which the model already handles correctly through the speed-squared term.

---

## 4. Condition, redesigned

Two changes.

**Fix the bug first (section 1d).** `physicalModifiers` must scale with the
installed part's band, exactly as `statModifiers` already do. Until that lands,
nothing about condition and performance can be reasoned about.

**Then make condition bite harder at the top of the ladder.** The realistic and
more interesting rule: **the higher the grade, the more condition matters.** A race
part is highly strung, runs to a service interval, and degrades badly. A stock part
is under-stressed and tolerates neglect for a decade.

That produces the property the maintainer wanted and the game currently lacks: **a
race damper at `poor` should be worse than a street damper at `mint`.** It also
creates a maintenance decision on a built car, which is a whole loop the game does
not currently have: the fast car needs looking after, and the cheap one does not.

The four physical dials and their curves stay as the mechanism; their values are
already flagged PROVISIONAL in `car-performance/README.md` section 7b, which calls
that "the most important sentence in this section". They should be re-derived in the
same pass, not before.

---

## 5. What this does NOT cover, deliberately

**Fitting a turbo to an NA car is an aspiration change, not a part.** The
`forcedInduction` slot exists and has SKUs, so it is expressible today, but under
this design an engine's whole response model keys off induction. Bolting a turbo on
therefore changes the car's tuning character, which is a larger claim than a part
should make on its own. It belongs with engine swaps (`engine-swaps.md`), where the
machinery to change an engine's identity has to exist anyway.

**A dyno screen is specified in GDD 5.4** ("2-3 sliders, e.g. Boost versus
Reliability, Camber: Grip versus Tyre wear/Style") and is the natural home for the
trade-off dimension of this design. It is v1.0 scope and it does not exist. Whether
it lands with this system or after it is a scheduling call, but the trade-off
mechanics here are what would give it something to control.

**GT3-class aero.** `car-performance/README.md` 7g records that the headroom was
deliberately opened and the part never authored: "there is still no aero grade above
`race`". The acceptance target if it is ever written is stated there.

---

## 6. Reuse analysis (directive 16)

**Genuinely new:** proportional power on `statModifiers`; the per-engine
`tuningResponse` derivation; the gain/enabler/trade-off role on a SKU; the enabler
gating rule; diminishing returns within a category; reliability consequence.

| Concern | What already exists and must be reused |
| --- | --- |
| Where a part's effect lives | `statModifiers` and `physicalModifiers`, extended not replaced |
| The four physical condition dials | `physicalConditionFactors`, `statFormulas.condition` |
| Power reaching the physics | the two-hop path through `computeDerivedStats` into `carBlock` |
| Rescaling honestly when power moves | `powerRatio`, the ratio bridge, solved per car and cached |
| Grip, braking and mass from a build | `buildFactors`, which needs the band fix but not replacing |
| Aero from a fitted part | `aeroFunctional` plus `statFormulas.aero.byGrade` |
| Whether an engine is forced | `hasForcedInduction`, though see the duplicate-representation note in `engine-swaps.md` |
| Course character | the four shipped courses and their weights |

**Must NOT be built:** a second power path (the schema comment already warns that
"a second path for either would charge one upgrade twice"), a torque curve (there is
no data behind it), a fifth part grade below stock (`IDEAS.md` records that as
rejected on GDD grounds and traced to an earlier session inventing scope), or a
second condition model.

---

## 7. The hard constraint on all of it

`car-performance/README.md` section 7a: **"it does not move prices... Anyone
porting this model should treat 'the handling number moved, so the price should
move' as a bug, not a feature."** Performance and value are independent and must
stay so. A tuning redesign changes what a car *does*, never what it is *worth*.

The one legitimate coupling is the existing one: an installed aftermarket part adds
its own retained value through `installedPartsValueYen`, scaled by the foundation
factor and the tier's `aftermarketReturn`. That is a parts-value path, not a
performance-value path, and it must remain the only one.

---

## 8. Build order

1. **Fix the condition bug** (1d). Small, isolated, and everything else is
   unreasonable-about until it lands.
2. **Proportional power.** The schema change plus re-authoring the ladder as
   fractions. This alone closes the x4.64 case and is independently shippable.
3. **Engine response.** The `tuningResponse` derivation and per-part NA/forced
   multipliers. This is where the realism arrives.
4. **Roles and enabler gating.** The structural anti-dominance work.
5. **Reliability consequence**, and the course-dependence check that no single build
   wins all four.
6. **Re-derive the provisional condition curves** with the whole system in place.

Steps 1 and 2 are worth doing even if the rest is deferred.

---

## 9. Open questions for the maintainer

1. **Is a flat-additive path acceptable anywhere?** This design says no for power.
   Handling, style, reliability and authenticity are stat-space numbers rather than
   physics, and additive may be fine for them. Cheaper to keep them if so.
2. **How hard should reliability bite?** A number, a failure chance, or both? A
   car that can break during an event is a much bigger mechanic than a number that
   lowers its price.
3. **Should the player be able to see the response character** of an engine before
   buying parts for it, or is learning that the game? My instinct is that a dyno
   session is exactly how you find out, which is an argument for building GDD 5.4's
   dyno alongside this rather than after.
4. **How much should a maximal build be worth?** The signed target was x1.80 and it
   was never reachable. With proportional power it becomes expressible for the first
   time, so the number wants re-confirming rather than inheriting.
