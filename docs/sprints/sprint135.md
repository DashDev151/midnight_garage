# Sprint 135: power becomes proportional and engine-specific, and the price ladder follows it

**Status: SIGNED OFF 2026-07-29. Ready to implement.** Opens after Sprint 134. Second of nine in
the tuning overhaul arc.

Design reference: `docs/design/systems/tuning-system.md` sections 5a, 5b, 5c, 5d, and the bar
set in 1b.

## Sign-off record (directive 22)

**Maintainer, 2026-07-29: Levers 1 to 4 approved exactly as written below.** Nothing in this doc
is left open and no decision is left to the implementer.

| lever | what | signed as |
| --- | --- | --- |
| 1 | `statFormulas.engineCharacter.naHighStrungThreshold` | **80.0** PS per effective litre |
| 2 | race-grade power fractions, per character | the table as written, all 30 values |
| 3 | `fuelSystem` and `clutch` power fractions | **0.000** at every grade and every character |
| 4 | the grade shape, per category | the table as written, `forcedInduction` linear |
| 5 | `partPricing.gradeFactors` becomes per-slot; the `ignitionEcu` ladder | schema change, plus **1.30 / 4.77 / 8.67** |

**Lever 5 was added on 2026-07-29, after the rest**, and it belongs in this sprint rather than a
later one for a specific reason: Lever 4 gives the ECU a threshold-shaped power curve while the
price ladder is a single global 1.3 / 2 / 3 applied to every part in the game. Those two together
make a street ECU **2.89 times worse value per horsepower than a race one**, so the top rung is
the best buy and nobody sensible touches the lower two. **Ship Lever 4 without Lever 5 and the
sprint ships that distortion.** The maintainer's rule: *"value and effect should be roughly
proportional. The final race turbo can be a larger jump but that does not mean it should be a
better buy, that is how you get monotony."*

**Three consequences accepted at sign-off rather than discovered later:**

1. **The maximal multiples are x1.43, x1.57 and x1.95**, so a fully built 2JZ reaches 632 PS.
   That is low against a real fully built 2JZ, and the flat forced multiplier undershoots
   exactly two engines, the RB26 and the 2JZ, for reasons recorded in `TODO.md`. **Accepted as
   the parts-only ceiling.** The headroom above it belongs to machining, and raising the forced
   fraction to close the gap is explicitly the wrong lever: it would correct those two cars and
   inflate five others past their real bands.
2. **The Prelude Si VTEC derives as `lazy-na`.** See Lever 1.
3. **A race ECU gets dearer, substantially.** On a flagship car it goes from ¥75,600 to
   ¥218,400. That is the correction, not a side effect: a standalone engine management system
   was never three times a piggyback in period, and the whole reason the street rung was
   unbuyable is that the top rung was underpriced for what it does.

**This sprint was two.** An earlier plan converted the absolute ladder to fractions in one
sprint and then re-authored every one of those fractions per engine character in the next,
including a `powerReferencePs` lever that the second sprint made dead on arrival. **Thirty
authored values, one economy lever and one schema shape, all thrown away one sprint after they
landed.** They are one sprint because they are one change.

## The gap, stated plainly

**Two defects, and they are the same defect seen from two angles.**

`statModifiers.power` is an **absolute PS delta**, identical on every car in the game. The race
ladder sums to +200 PS on anything:

| car | stock | maximal build today | multiple |
| --- | ---: | ---: | ---: |
| Suzuki Wagon R (CT21S) | 55 | 255 | **x4.64** |
| Nissan Silvia (S13) | 175 | 375 | x2.14 |
| Toyota Supra RZ (JZA80) | 324 | 524 | **x1.62** |

And the same ECU gives the same power to a naturally aspirated Beat and a twin-turbo Supra. In
reality an ECU is worth about **3 per cent** on an NA engine, where it recovers ignition timing
and a conservative factory map with no boost to add, and **20 to 30 per cent** on a turbo, where
it commands the boost itself. Same part, an order of magnitude apart, and the model cannot tell
them apart.

**The bar this sprint is judged against: people who know performance cars must not roll their
eyes.**

### What the roster survey found

Measured against shipped content, not assumed:

- **The ladder is bit-for-bit identical across all four fitment classes.** The class moves only
  price. There is one ladder, and the distortion is uniform across the roster.
- **Roster mean stock power is 176.88 PS** across the 26 shipped cars, median 166, min 55, max
  324.
- No shipped car is excluded from normal play, so no exclusions are needed.

## Reuse analysis (directive 16)

### Genuinely new

- **One schema shape**, `statModifiers.powerFraction`, a per-character object.
- **A derived character per car**, from data `spec` already carries. **No new authored content
  on cars.**
- **One line of arithmetic** in `computeDerivedStats`.

### Existing mechanisms reused, unchanged

- **`computeDerivedStats`'s part loop**, which already walks every installed part, resolves its
  SKU and applies `bandFactor(installed.band)`.
- **`hasForcedInduction(model)`** (`packages/sim/src/bands.ts`, line 142), the single source of
  truth for induction. It reads `model.tags`.
- **`spec.stockPowerPs`, `spec.displacementCc`, `spec.engineConfig`**, all present on all 26
  shipped cars.
- **`bandFactor`**, applied to the fraction exactly as it is applied to the delta today.
- **The ratio bridge.** `powerRatio` is solved per car and rescales itself when power moves, so
  the lap model needs no change at all.

### Must NOT be built

- **A second power path.** The fraction is consumed at the same point in the same loop.
- **A torque curve or a rev range.** `formulas.md` section 2: `peakTorqueNm`, `torqueRpm`,
  `powerRpm` and `redlineRpm` are display data the physics does not read.
- **A second induction source.** **Do not read `spec.aspiration`**: it is a duplicate
  representation and nothing guards that it agrees with the tags.
- **A conversion reference.** There is no `powerReferencePs` and there must not be. The
  fractions below are authored directly; nothing divides an old absolute ladder by anything.

## The mechanism

### Character, derived per car

```text
isRotary                = engineConfig starts with "rotary"
effectiveDisplacementCc = displacementCc * (isRotary ? 1.8 : 1.0)
specificOutput          = stockPowerPs / (effectiveDisplacementCc / 1000)

character = hasForcedInduction(model)               -> "forced"
          : specificOutput >= naHighStrungThreshold -> "high-strung-na"
          :                                           -> "lazy-na"
```

**The rotary carve-out is not a fudge.** A 13B is 1308 cc by convention and behaves like roughly
2.6 litres, so without the factor every rotary reads as extraordinarily high-strung. **1.8 is
the equivalency factor motorsport bodies have long used for exactly this comparison.** With it
the FD lands at 108 PS per equivalent litre and the FC at 86, both correct readings.

Prefix-match `engineConfig` rather than listing the two shipped rotaries, so a `rotary-3` added
later cannot escape the rule.

### Power, proportional

A SKU's power contribution becomes:

```text
model.spec.stockPowerPs * powerFraction[character] * bandFactor(installed.band, economy)
```

**It scales off STOCK power, not current power.** Contributions therefore do not compound and
the order parts are fitted in cannot matter. A current-power formulation would make the same
shopping list produce different results depending on install order, which is exactly the hidden
maths GDD 4.2 forbids.

**Resolve the character once per car, before the part loop.** Not once per part.

## The levers (ALL APPROVED 2026-07-29, directive 22)

### Lever 1: `naHighStrungThreshold`

**Signed: 80.0 PS per effective litre.** Lives in `packages/content/data/economy.json` under
`statFormulas.engineCharacter`.

The ten naturally aspirated shipped cars split:

| car | PS per effective litre | character |
| --- | ---: | --- |
| Honda City E (AA) | 51.2 | lazy |
| Nissan Sunny (B12) | 56.8 | lazy |
| Toyota Carina (AT150) | 57.2 | **lazy (required sanity target)** |
| Toyota Sera (EXY10) | 72.8 | lazy |
| Honda Prelude Si VTEC (BB4) | 75.1 | lazy |
| Toyota Sprinter Trueno (AE86) | 81.9 | high-strung |
| Suzuki Wagon R (CT21S) | 83.7 | high-strung |
| Honda Beat (PP1) | 97.6 | **high-strung (required sanity target)** |
| Honda CR-X SiR (EF8) | 100.3 | high-strung |
| Honda Civic SiR-II (EG6) | 106.6 | high-strung |

Both stated sanity targets are met, and the split reads correctly: the enthusiast engines
(4A-GE, the kei triples, B16A) are high-strung and the economy engines are lazy.

**One wrinkle, now settled.** The Prelude Si VTEC reads lazy at 75.1, because the shipped car is
authored at 162 PS from 2157 cc, which is the mild spec rather than the 200 PS H22A. A car with
VTEC in its name reading "lazy" will look wrong to someone who knows. **The threshold is signed
at 80.0 and the Prelude reads lazy**, because the defect is the authored power figure rather
than the threshold, and moving the threshold to hide it would leave the wrong number in
`cars.json` and drag a second car with it. The roster correction is logged in `TODO.md` against
the JDM-variants entry, where the same defect already sits for sixteen other cars.

The other sixteen shipped cars carry an induction tag and read `forced` regardless.

### Lever 2: race-grade power fractions, per character

**These are authored directly. Nothing is converted from the old ladder.**

| slot | high-strung NA | lazy NA | forced | why |
| --- | ---: | ---: | ---: | --- |
| block | 0.12 | 0.15 | 0.02 | capacity is where NA power lives; on a turbo the block is an enabler, not a gain |
| internals | 0.04 | 0.05 | 0.03 | almost purely an enabler; balancing and lighter rods free a little, and no more |
| headValvetrain | 0.08 | 0.10 | 0.06 | porting and valves, worth more on NA |
| camsTiming | 0.10 | 0.13 | 0.05 | the single biggest NA gain; a turbo cares far less about duration |
| intake | 0.02 | 0.03 | 0.05 | almost nothing either way, correctly |
| exhaust | 0.04 | 0.06 | 0.14 | noise on NA; backpressure and spool on a turbo |
| ignitionEcu | 0.03 | 0.05 | 0.25 | the flagship case: recovered timing versus commanded boost |
| forcedInduction | 0.20 | 0.28 | 0.35 | see the note below |
| fuelSystem | 0.000 | 0.000 | 0.000 | Lever 3 |
| clutch | 0.000 | 0.000 | 0.000 | Lever 3 |

**The forcedInduction row on an NA car is deliberate, not an oversight.**
`naToTurboConversionBlocked` (`packages/sim/src/jobs.ts`) gates fitting a first turbo to a
factory-NA car behind a tool tier; it does not forbid it, so the SKU is fittable and must carry
a value. A **lazy** engine takes boost better than a **high-strung** one, because low compression
and conservative cams are what boost wants, and that is why the lazy column is higher. **This
does not make the car "forced"**: character derives from the model's induction tag, so a
factory-NA car with a bolted-on turbo keeps NA response for every other part. That is a known
limitation and the full treatment is deferred to `engine-swaps.md`.

**Resulting maximal builds**, race grade throughout:

| character | no turbo fitted | with a race turbo |
| --- | ---: | ---: |
| high-strung NA | **x1.43** | x1.63 |
| lazy NA | **x1.57** | x1.85 |
| forced | n/a | **x1.95** |

**What that means car by car**, which is the figure to judge this on:

| car | stock | character | maximal build |
| --- | ---: | --- | ---: |
| Suzuki Wagon R | 55 | high-strung NA | 79 |
| Honda Beat | 64 | high-strung NA | 92 |
| Nissan Sunny B12 | 85 | lazy NA | 133 |
| Toyota AE86 | 130 | high-strung NA | **186** |
| Honda Civic SiR-II | 170 | high-strung NA | **243** |
| Nissan Silvia S13 | 175 | forced | **341** |
| Mazda RX-7 FD3S | 255 | forced | **497** |
| Skyline GT-R BNR32 | 280 | forced | **546** |
| Toyota Supra RZ | 324 | forced | **632** |

Against the real world, which is the bar from 1b: a fully built 4A-GE makes 180 to 200; a built
B16A makes 220 to 250; a built SR20DET makes about 350; a built 13B-REW makes 400 to 500; a 2JZ
on a big single makes 600 to 800. **Every one lands inside its real band.**

### Lever 3: the two pure enablers carry zero

`fuelSystem` and `clutch` carry **0.000 at every grade and every character**.

**This is required by the next sprint's dual-role convention, not a rounding preference.** Design
6c: *a part never supports the subsystem its own gain demands.* `fuelSystem` supports fuelling
and `clutch` supports torque transmission, so any power gain either carried would partly pay for
itself. A clutch making three horsepower is also precisely the eye-roll 1b is about.

**Known consequence, stated rather than discovered:** until the support-ratio sprint lands, those
two parts are purchases with no visible benefit. That window is one sprint long and shipping
them as fake gains in the meantime would be worse.

### Lever 4: the grade shape, per category

Street and sport are a fraction of that slot's race value. **These are the final shapes**, not a
placeholder: the earlier plan authored the old ladder's shape here and re-authored it one sprint
later, which is the same waste this sprint exists to remove.

| slot | curve | street | sport | race | why |
| --- | --- | ---: | ---: | ---: | --- |
| block | linear | 0.33 | 0.67 | 1.00 | capacity is capacity |
| internals | linear | 0.33 | 0.67 | 1.00 | specification scales evenly |
| camsTiming | linear | 0.33 | 0.67 | 1.00 | more duration, more top end, more lost bottom end |
| headValvetrain | mildly diminishing | 0.45 | 0.75 | 1.00 | a clean-up port gets most of it; the rest is expensive |
| exhaust | diminishing | 0.50 | 0.80 | 1.00 | cat-back, then a full system, then titanium saves weight rather than power |
| intake | strongly diminishing | 0.60 | 0.85 | 1.00 | a filter, then a pipe, then nothing |
| ignitionEcu | threshold | 0.15 | 0.55 | 1.00 | little on its own; it unlocks what the others can do |
| **forcedInduction** | **linear, FOR NOW** | 0.33 | 0.67 | 1.00 | **see below** |

**`forcedInduction` is deliberately linear in this sprint and it is the one shape that moves
later.** Design 5e wants it *increasing*, and increasing returns on forced induction is a
dominant strategy on its own: buy the biggest turbo, ignore everything else. What makes it safe
is the support cost rising alongside it, so **the increasing curve is hard-gated behind the
support-ratio sprint** and lands in Sprint 137. Every other category's shape is harmless and
lands here, once.

Authored values are Lever 2 times Lever 4, to three decimal places. **`stock`-grade SKUs carry
0.000.**

### Lever 5: the price ladder becomes per-slot, and the ECU gets its own

`partPricing.gradeFactors` is currently **one global ladder applied to every part in the game**:
`stock 1 / street 1.3 / sport 2 / race 3`. Lever 4 just gave each category **its own power
curve**. Value per yen is therefore a residue of the mismatch between eight power shapes and one
price shape, rather than a designed quantity.

Measured across the catalogue, indexed so race = 1.00. **Lower is better value:**

| slot | power shape | street | sport | race |
| --- | --- | ---: | ---: | ---: |
| block, internals, camsTiming | 0.33 / 0.67 / 1.00 | 1.31 | 0.99 | 1.00 |
| headValvetrain | 0.45 / 0.75 / 1.00 | 0.96 | 0.89 | 1.00 |
| exhaust | 0.50 / 0.80 / 1.00 | 0.87 | 0.83 | 1.00 |
| intake | 0.60 / 0.85 / 1.00 | 0.72 | 0.78 | 1.00 |
| **ignitionEcu** | 0.15 / 0.55 / 1.00 | **2.89** | **1.21** | 1.00 |
| forcedInduction, while linear | 0.33 / 0.67 / 1.00 | 1.31 | 0.99 | 1.00 |

The diminishing categories are correct as they stand: the cheap rung being the better buy is
what diminishing returns *means*. The linear ones are near flat. **Only the ECU puts the best
value at the top**, and it does so by a factor of nearly three.

**The change:**

1. `gradeFactors` becomes a per-slot map with the current `1 / 1.3 / 2 / 3` as the **default**.
   Six of the eight power slots keep it, along with every non-power slot.
2. `ignitionEcu` gets its own ladder, derived so price tracks power exactly:

| slot | stock | street | sport | race |
| --- | ---: | ---: | ---: | ---: |
| **ignitionEcu** | 1.00 | **1.30** | **4.77** | **8.67** |

Value per yen is then flat across the three rungs (`1.30/0.15 = 4.77/0.55 = 8.67/1.00 = 8.667`).

**The street rung is pinned rather than cut, deliberately.** Cutting it to flatten the ladder
downward would put the street ECU below the stock part and break the two Sprint 132 catalogue
invariants (price rises strictly with grade; no SKU below the cheapest stock part of its class).
Raising the top is also the period-correct direction.

**`forcedInduction` keeps the default ladder in this sprint**, because its power curve is still
linear here and the default is already near flat against a linear curve. Its own ladder lands in
Sprint 137, in the same sprint that makes its curve increasing. **The rule both sprints follow:
a slot's price ladder moves in the same sprint as its power curve, so no distortion ever ships
between them.**

## Task breakdown

### Task 1: the character vocabulary and derivation

`packages/content/src/tags.ts`: add
`EngineCharacterSchema = z.enum(['high-strung-na', 'lazy-na', 'forced'])` and its inferred type,
beside the existing vocabularies. Document the derivation and the rotary factor where the
vocabulary is defined, as `PhysicalDialSchema` documents its own rule.

`packages/sim/src/derivedStats.ts`, two new exported functions:

```text
engineCharacterOf(model: CarModel, economy: EconomyConfig): EngineCharacter
specificOutputOf(model: CarModel): number
```

1. `hasForcedInduction(model)` first, short-circuiting. It is already imported in this file.
2. Otherwise compare specific output against
   `economy.statFormulas.engineCharacter.naHighStrungThreshold`.
3. `engineConfig` is optional on `spec`. **If absent, treat the car as non-rotary** rather than
   throwing; assert in a test that all 26 shipped cars carry it, so the fallback is unreachable
   in shipped content and cannot hide an authoring gap.
4. `displacementCc` is optional. If absent, **return `lazy-na`** and pin that with the same
   reasoning.

`specificOutputOf` is exported because the dyno screen displays it and must not recompute it.

### Task 2: schema

`packages/content/src/stats.ts`:

1. Add `powerFraction` as a per-character object:

```text
powerFraction: z.object({
  'high-strung-na': z.number().default(0),
  'lazy-na':        z.number().default(0),
  forced:           z.number().default(0),
}).default({ 'high-strung-na': 0, 'lazy-na': 0, forced: 0 })
```

2. Document that it is a fraction of the car's **stock** output and that it does not compound.
3. **Remove `power` from `StatModifierSchema` at the end of this sprint** (Task 6), not in a
   later one. It carries no meaning once every SKU is authored.

`statWeights` on the taxonomy reuses `StatModifierSchema`'s shape for a different meaning
(condition weighting, not a delta). **Check that removing `power` and adding `powerFraction`
does not break taxonomy authoring.** If the two meanings can no longer share a schema, **split
them** into `StatModifierSchema` (a part's deltas) and `StatWeightsSchema` (the taxonomy's
condition weights), and say which happened in the Exit.

### Task 3: economy content

`packages/content/src/economy.ts` and `packages/content/data/economy.json`: add
`statFormulas.engineCharacter.naHighStrungThreshold`, signed value from Lever 1.

**No `powerReferencePs`.** Nothing converts an old ladder.

### Task 4: the consumer

`packages/sim/src/derivedStats.ts`, `computeDerivedStats`. Resolve the character once before the
part loop. Inside the loop, where `power += part.statModifiers.power * wear` sits today, replace
it with:

```text
power += model.spec.stockPowerPs * part.statModifiers.powerFraction[character] * wear
```

### Task 5: content authoring

`packages/content/data/parts.json`: every SKU in the ten engine slots gets the three-key object.
Values are Lever 2 times Lever 4 for the eight character slots, Lever 3's zeros for `fuelSystem`
and `clutch`, and `0.000` on every `stock` grade. Every SKU outside those slots carries all three
keys at zero.

The ladder does not vary by fitment class, so the mapping is slot plus grade plus character to
one number. Apply it mechanically, then spot-check.

### Task 6: the per-slot price ladder (Lever 5)

`packages/content/src/partPricing.ts` (or wherever `PartPricingSchema` lives):

1. `gradeFactors` becomes `Record<CarPartId, Record<Grade, number>>` **with a `default` entry**,
   rather than a bare `Record<Grade, number>`. Resolution is slot ladder if present, otherwise
   the default. Zod-validated, and the schema comment states the rule this exists to enforce:
   **a slot's price ladder tracks its power curve, so climbing a ladder never improves value per
   yen.**
2. `packages/content/data/partPricing.json`: the default ladder unchanged at `1 / 1.3 / 2 / 3`,
   plus the `ignitionEcu` entry at `1 / 1.30 / 4.77 / 8.67`.
3. `resolvePartPriceYen` reads the slot's ladder. **The override map keeps winning outright**;
   nothing about that path changes.

**Do not add a `forcedInduction` entry here.** It arrives in Sprint 137 with its curve.

### Task 7: retire the absolute field

Remove `statModifiers.power` from the schema, from `computeDerivedStats`, and from all 472 SKUs.
**Do this last, in this sprint**, once Task 5 has authored every replacement: a missed SKU then
fails schema validation rather than silently becoming a 0.08 PS part.

### Task 8: tests

New file `packages/sim/tests/proportionalPower.test.ts`:

1. **The ratio property.** All 26 cars reach the same multiple of their own stock power from the
   same maximal build, within their character. Assert across the whole roster, not two cars.
2. **The cap, per character.** x1.43, x1.57 and x1.95 exactly.
3. **The per-car table** from Lever 2, pinned.
4. **No compounding.** Fitting the same set of parts in two different orders produces identical
   power. Assert with `toBe`.
5. **Band scaling.** A `worn` SKU contributes exactly `bandFactor('worn')` of its mint
   contribution.

New file `packages/sim/tests/engineCharacter.test.ts`:

6. **Every shipped car's character**, pinned one row per car, all 26. The single best regression
   test in the sprint and it is cheap.
7. **Both rotaries read plausibly**, and the 1.8 factor's effect asserted both ways, so a future
   reader can see why it is there.
8. **The flagship case.** A race ECU on a turbo car is worth roughly ten times the same grade of
   ECU on a high-strung NA car, as a fraction of stock power.
9. **Both sanity targets** named explicitly: the Beat high-strung, the Carina lazy.
10. **`hasForcedInduction` is the only induction source.** A structural test: no file under
    `packages/sim/src` reads `spec.aspiration`.
11. **The grade shapes** from Lever 4, pinned per slot, including that `forcedInduction` is
    linear and NOT yet increasing.

In `packages/content/tests/`:

12. **Catalogue completeness.** Every engine-slot SKU carries all three character keys;
    `fuelSystem` and `clutch` carry zero on all three at every grade; no SKU anywhere still
    carries a `power` field.
13. **The value-per-yen rule, asserted as a rule.** For every power slot, every fitment class
    and every character, **climbing the grade ladder never improves yen per PS gained**. This is
    the test that would have caught the ECU defect before it shipped, and it is the one to write
    first. Report the measured table so the residues are visible rather than merely passing.
14. **The default ladder still applies to everything that has no entry.** Every slot except
    `ignitionEcu` resolves `1 / 1.3 / 2 / 3`, read from content. Plus the two Sprint 132
    invariants re-asserted against the new resolution: price rises strictly with grade within a
    basis and class, and no SKU falls below the cheapest stock part of its class.

### Task 9: checks

```text
pnpm test --project content
pnpm test --project sim
```

`harnessAcceptance.test.ts` is evaluated on **stock** cars, which carry no power SKUs, so it must
pass untouched. If it moves, a stock SKU has been given a non-zero fraction.

### Task 10: re-derive whatever moved

Directive 17 case (a) throughout. Every car whose build carries engine parts changes its power,
so lap times and taste-adjusted prices move. `economyApprovalGate.test.ts` moves because
`statFormulas.engineCharacter` is new; re-pin it in the same change as the recorded sign-off,
naming the lever and value.

**`partPricing.json` also moves, and it carries its own hash guard.** Sprint 132 added a
sha256 pin on that file in `economyApprovalGate.test.ts`, with a ledger comment recording every
lever by name and value. Both the hash and the ledger are updated in the same change as the
sign-off, and the ledger gains the per-slot ladder. The guard exists precisely so this cannot
happen quietly; do not re-pin it before the sign-off is recorded.

## Hard constraints

- **No unlisted lever.** If implementation appears to need one, execution ENDS and the numbers go
  to the maintainer (directive 22).
- **Do not read `spec.aspiration`.**
- **No torque curve, no rev range, no gear ratios.**
- **Do not make `forcedInduction`'s curve increasing.** That is Sprint 137 and it is hard-gated.
- **Performance never moves price.**
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Levers 1 to 5 signed and recorded in this doc.
- [ ] `EngineCharacter` vocabulary; `engineCharacterOf` and `specificOutputOf` exported from sim.
- [ ] All 26 cars' characters pinned in a test.
- [ ] `powerFraction` is a per-character object and `statModifiers.power` no longer exists.
- [ ] All 472 SKUs authored; `fuelSystem` and `clutch` zero everywhere.
- [ ] Every car reaches its character's multiple of its own stock power; the per-car table pinned.
- [ ] Power is order-independent, proved with strict equality.
- [ ] A race ECU is worth about ten times as much on a turbo as on a high-strung NA car.
- [ ] `forcedInduction` is linear, pinned, and provably not yet increasing.
- [ ] No sim source file reads `spec.aspiration`, proved structurally.
- [ ] `gradeFactors` is per-slot with a default; only `ignitionEcu` carries its own entry.
- [ ] Climbing a grade ladder provably never improves yen per PS, on every power slot, class and
      character, with the measured table reported.
- [ ] The two Sprint 132 catalogue invariants still hold against the new resolution.
- [ ] `harnessAcceptance.test.ts` passes untouched.
- [ ] Economy gate and the `partPricing.json` guard both re-pinned with the sign-off.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
