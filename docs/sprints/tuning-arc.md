# The tuning overhaul arc: sprints 134 to 143

**The implementation plan for `docs/design/systems/tuning-system.md`.** That document
is the design of record; this one is how it gets built. Read it first. Section
references below are to it.

**Every sprint here is written to be implemented without design decisions.** Where a
decision is genuinely still open, the sprint says so and stops rather than inviting
one. Where a number is unapproved, it is marked and the sprint does not proceed past
it.

---

## The arc at a glance

| sprint | what | gated by | ships alone? |
| --- | --- | --- | --- |
| **134** | Fix the condition bug | nothing | yes |
| **135** | Proportional power | 134 | yes |
| **136** | Engine response character | 135 | yes |
| **137** | Support ratios and the always-on readout | 136 | yes |
| **138** | Return curves, including forced induction | **137, hard** | yes |
| **139** | Measure the buyer-selection spread | 137 | measurement only |
| **140** | Cohesion into buyer selection | **139, hard** | yes |
| **141** | Stat simplification, aero ceiling, style base | 135 | yes |
| **142** | The dyno screen | 137 | yes |
| **143** | Re-derive the condition curves | all of the above | yes |

### Two hard gates, and why they exist

**138 must not ship before 137.** Increasing returns on forced induction, on its own,
is a dominant strategy: buy the biggest turbo, ignore everything else. What makes it
safe is the support cost rising alongside it. Shipping 138 first builds a *stronger*
version of the defect this arc exists to remove.

**140 must not ship before 139 passes.** The entire value half rests on an unverified
assumption: that routing cohesion through buyer selection produces a price spread
large enough to feel. 139 measures it. **If 139 fails, 140 does not proceed and the
result goes to the maintainer**, because the fallback options are a Law 5 question
rather than an implementation choice.

### What is NOT in this arc

Reputation (design 7b), because it is blocked on the reputation ratchet (design 8) and
would ship inert. Machining (design 4), course-character job variety, and fitting a
turbo to an NA car, all of which are separate features with their own TODO entries.

---

## Sprint 134: fix the condition bug

**Design reference: 1d and 10. This is a defect, not a feature.**

### The defect

`buildFactors` in `packages/sim/src/derivedStats.ts` reads a part's id, resolves its
`physicalModifiers`, and multiplies grip, braking and mass. **It never reads
`installed.band`.** So a `scrap` race coilover delivers the identical 1.029 grip
multiplier as a mint one.

`computeDerivedStats`, in the same file, does scale `statModifiers` by
`bandFactor(installed.band, economy)`. Two parallel modifier systems, one respects
condition and one does not.

### What to build

Make `buildFactors` scale each modifier by the installed part's band, using
**`bandFactor`, the same function `computeDerivedStats` already uses.** Do not
introduce a second curve in this sprint; sensitivity-by-grade is design 10 and lands
in 143.

**The interpolation must be toward 1.0, not toward 0.** A `physicalModifier` is a
multiplier around unity: 1.029 means "2.9 per cent better than stock". A worn part
should deliver *less of its advantage*, not less grip than a bare hub. So:

```text
effective = 1 + (modifier - 1) * bandFactor(band)
```

At mint, `bandFactor` is 1.0 and `effective == modifier` exactly. At scrap it is 0.15,
so a 1.029 race coilover delivers 1.0044. **A part never drops below stock capability
through this path**, which is correct: a knackered coilover is a bad coilover, not an
absent one. Parts that are genuinely absent are already handled by
`scrapDisablesCar` and `isPartMissing`.

`physicalModifiers.mass` is below 1 (a lighter part is 0.979), so the same formula
correctly moves it back toward 1.0 as it wears. Verify that direction explicitly in a
test; it is the one place the sign could be got wrong.

### Acceptance

1. A mint build produces byte-identical factors to today. **`harnessAcceptance.test.ts`
   must pass untouched**; if it does not, the interpolation is wrong.
2. A `scrap` race coilover delivers less grip than a mint one, and more than stock.
3. A `scrap` lightweight part delivers less mass saving than a mint one, and never more
   mass than stock.
4. A new test pins the formula shape at all five bands for one grip part and one mass
   part.

### Expected fallout

Any car carrying non-mint aftermarket parts changes its physics, so lap times and
therefore values move for those cars. **Every affected pin is directive 17 case (a):
re-derive from a real run, never iterate toward a pass.** Expect the golden-master
hashes and any auction-room clearing pins to move.

**Do not touch any economy value.** This sprint moves no lever.

---

## Sprint 135: proportional power

**Design reference: 5a.**

### The problem

`statModifiers.power` is an absolute PS delta, identical across all four fitment
classes, so a maximal build adds a flat +200 PS: x1.62 on a Supra and **x4.64 on a
Wagon R**.

### What to build

**A new field, not a repurposed one.** `statModifiers.power` stays for now to keep the
diff reviewable; add `statModifiers.powerFraction`, a fraction of the car's **stock**
output. A SKU carries one or the other, never both, and a schema refinement enforces
that.

In `computeDerivedStats`, a SKU's power contribution becomes:

```text
model.spec.stockPowerPs * powerFraction * bandFactor(installed.band)
```

Note it scales off **stock** power, not current power, so contributions do not compound
with each other and the order parts are fitted in cannot matter.

### Authoring the ladder

The current absolute ladder, `everyday` class, is the reference:

| slot | street | sport | race |
| --- | ---: | ---: | ---: |
| block | 14 | 22 | 32 |
| internals | 10 | 18 | 26 |
| headValvetrain | 8 | 14 | 20 |
| camsTiming | 9 | 16 | 22 |
| intake | 5 | 8 | 12 |
| exhaust | 5 | 9 | 13 |
| fuelSystem | 4 | 7 | 11 |
| ignitionEcu | 5 | 10 | 16 |
| forcedInduction | 20 | 30 | 45 |
| clutch | 0 | 2 | 3 |

**Convert by dividing each figure by a reference stock power, and the reference is a
maintainer decision, not an implementation one.** Two candidates:

- **The roster mean stock power.** Every car lands near today's absolute figures, so the
  mid-roster feels unchanged and only the extremes move.
- **A named reference car.** More legible, arbitrary in a different way.

**STOP AND ASK.** The choice sets what "unchanged" means for the whole roster, and it is
an economy lever under directive 22.

### Acceptance

1. No car's maximal build exceeds a maintainer-signed ratio of its stock power. **That
   ratio is unsigned; the previous target was x1.80 and was never reachable. Confirm it
   before building.**
2. The Wagon R and the Supra reach the *same* multiple of their own stock power from the
   same build.
3. A SKU carrying both fields fails schema validation.

---

## Sprint 136: engine response character

**Design reference: 5b, 5c, 5d.**

### What to build

**A derived character per car**, from data `spec` already carries. No new content.

```text
specificOutput = stockPowerPs / (effectiveDisplacementCc / 1000)
effectiveDisplacementCc = displacementCc * (isRotary ? 1.8 : 1.0)
isRotary = engineConfig starts with "rotary"
```

Character resolves as: **forced** if `hasForcedInduction(model)`, otherwise
**high-strung NA** above a specific-output threshold and **lazy NA** below it.

**The 1.8 rotary factor is not a fudge**: it is the equivalency factor motorsport
bodies use, and without it every rotary reads as extraordinarily high-strung (an RX-8
at 191 PS per nominal litre). With it, the RX-8 lands at about 106, which is correct.

**The specific-output threshold is unsigned. STOP AND ASK.** Sanity targets from the
design: the Beat (98 PS/litre, kei-limited) must read high-strung; a Carina 1.5 must
read lazy.

### Per-part response

Each engine SKU gains a response multiplier per character. The design's illustrative
table (5d) has ECU at 0.03 NA against 0.25 forced, exhaust 0.04 against 0.14, intake
0.02 against 0.05, cams 0.10 against 0.05, block 0.12 against 0.02.

**Every one of those numbers is illustrative and unsigned. STOP AND ASK** before
authoring. The shape is the claim, not the values.

### Acceptance

1. An ECU on an NA car is worth roughly a tenth of the same ECU on a turbo car.
2. Every rotary in the roster reads as a plausible character, not as high-strung.
3. `hasForcedInduction` remains the single source of truth for induction. **Do not read
   `spec.aspiration`**: it is a duplicate representation and nothing guards that the two
   agree (see `engine-swaps.md`).

---

## Sprint 137: support ratios and the readout

**Design reference: 6 and 7c. This is the arc's keystone.**

### What to build

Five subsystem ratios per car, and a headline that is their minimum.

| subsystem | demanded by | supported by |
| --- | --- | --- |
| cylinder pressure | boost, compression | internals, block |
| fuelling | airflow | fuelSystem |
| heat | sustained output | cooling |
| revs | cams, ported head | headValvetrain, internals |
| torque transmission | total output | clutch, driveline |

`ratio[s] = support[s] / demand[s]`; `supportRatio = min(ratio)`.

**A stock, unmodified car must sit at exactly 1.0 on every subsystem, by construction.**
Assert this for all 26 cars; it is the property that makes everything else readable, and
it is the single best regression test in the sprint.

### The dual-role convention, which must be implemented exactly

**Demand comes from output. Support comes from specification. Within any one subsystem,
a part is a demander or a supporter, never both.**

**A part never supports the subsystem its own gain demands.** A bored block adds output,
raising demand on fuelling, heat and torque transmission, but **not** on cylinder
pressure, which is the subsystem it supports. Implemented correctly, no upgrade can pay
for itself by existing. **Assert that** with a test: adding any single gain part must
never raise that car's headline ratio.

### The readout ships in this sprint, not with the dyno

Design 7c requires that a build which cannot support itself is visible **always**, not
only after a dyno session. Ship a minimal always-on qualitative indicator on the car:
something does not add up, and it is legible without any purchase.

**Precision is the dyno's job (142). Existence of the problem is not.** If prices later
move on a number the player cannot see, that is the punish the design forbids.

### Unsigned and blocking

Every demand and support weight, and the thresholds for "adequate" and "dangerous".
**STOP AND ASK** with the full table before authoring.

---

## Sprint 138: return curves

**Design reference: 5e. HARD GATE: 137 must have shipped.**

Per-category curves: forced induction **increasing**, block and cams roughly linear,
intake strongly diminishing, exhaust diminishing, ECU threshold-shaped.

**Read 5e before implementing.** Increasing returns on forced induction is not an
anti-dominance mechanism; on its own it is a dominant strategy. It is safe only because
support cost rises alongside it, which is why 137 is a hard gate.

### Acceptance

1. A maximal forced-induction build with no supporting parts has a **collapsed** headline
   support ratio.
2. No single category is the best power-per-yen at every rung.

All curve parameters unsigned. **STOP AND ASK.**

---

## Sprint 139: measure the buyer-selection spread

**Design reference: 7a. This is a MEASUREMENT SPRINT. Build nothing.**

Determine whether routing cohesion through buyer selection can produce a price spread
large enough to be felt, without touching `foundationFactor` or `aftermarketReturn`.

Measure, across the roster: the price a coherent build achieves against an incoherent one
carrying the same parts, under the existing buyer-taste machinery, expressed as a share of
book value.

**Report the numbers. Do not tune toward a target.** If the spread is too small to feel,
**stop and report**: the fallback options are to withhold premium from incoherent builds
within Law 5, or to amend Law 5 openly, and both are maintainer decisions.

---

## Sprint 140: cohesion into buyer selection

**HARD GATE: 139 passed and the maintainer has accepted its numbers.**

Wire the headline support ratio into which buyers bid and what they pay. Design 7a.

**Never inflate a premium multiplier.** Cohesion changes *who is buying*. Assert in a test
that `foundationFactor` and `aftermarketReturn` are untouched by this sprint.

---

## Sprint 141: stat simplification, aero ceiling, style base

**Design reference: 11 and 12.**

1. **Delete `statModifiers.handling`.** It is a second route to what
   `physicalModifiers.grip` already does; the schema's own comment warns that a second
   path charges one upgrade twice. Handling derives from grip alone.
2. **Delete `statModifiers.reliability`.** Derived now (design 9).
3. **Per-car aero ceiling.** One number per car capping what aero can deliver, so an FD
   can carry real aero and a Wagon R cannot.
4. **A car-level style base.** `styleCap` is 20, so every stock car scores identically
   today.

Items 3 and 4 need signed values. **STOP AND ASK.** Items 1 and 2 move no lever and can
proceed.

---

## Sprint 142: the dyno screen

**Design reference: 14. GDD 5.4 specifies it: one labour slot, two or three sliders.**

Shows engine response character, actual power as built, and the support ratios **by
subsystem** with the shortfall named.

**The dyno sells precision, not the existence of a problem.** The always-on warning from
137 already exists; this replaces vagueness with numbers.

Open: whether it costs money as well as a labour slot. **STOP AND ASK.**

---

## Sprint 143: re-derive the condition curves

**Design reference: 10.**

The four physical dials' band curves are flagged PROVISIONAL in
`car-performance/README.md` 7b, which calls that "the most important sentence in this
section". With the whole system in place, re-derive them, and implement design 10's
grade sensitivity: **a race damper at `poor` should be worse than a street damper at
`mint`.**

**No wear rate.** A race part is not more fragile over time, because nothing here
degrades over time. It is more *sensitive*: at a given band it has lost more of its
advantage. A curve shape, not a process.

All values unsigned. **STOP AND ASK.**

---

## Rules that bind every sprint in this arc

1. **Directive 22.** No economy value moves without the maintainer signing that specific
   lever by name and value. Every sprint above marks its unsigned values. When one is
   hit, execution stops and the numbers go to the maintainer.
2. **Directive 17.** A failing test is a diagnosis. Re-derive pins from real runs; never
   iterate a number toward a pass; never loosen a threshold to make something go green.
3. **Performance never moves price.** `car-performance/README.md` 7a. A faster car is not
   worth more for being faster.
4. **No second paths.** No second power path, no torque curve, no fifth part grade, no
   second condition model, no second job system.
5. **British spelling, no em dashes, no emoji, no process-narrative comments.**
