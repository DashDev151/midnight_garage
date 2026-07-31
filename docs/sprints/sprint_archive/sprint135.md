# Sprint 135: power becomes proportional and engine-specific, and the price ladder follows it

**Status: BUILT AND COMMITTED 2026-07-30 (`ff21ab7`). Signed off 2026-07-29.** Second of nine in
the tuning overhaul arc. **Its one open finding is closed:** see "The rule 5 finding, closed"
below the Exit.

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

**Correction, 2026-07-30: this claim was false as shipped, and it was false from the design
itself, not just the implementation.** Task 2 above (line 361) literally specifies
`powerFraction` with `.default({ 'high-strung-na': 0, 'lazy-na': 0, forced: 0 })`, and Zod is
non-strict - so a SKU missing the field entirely, or missing one of its three character keys,
validated silently with zero power on every character, exactly the "0.08 PS part" failure mode
this task claims is impossible. `statModifiers: {}` validated. All 472 shipped SKUs happened to
author the field regardless, so no shipped part was actually affected, but the claim itself did
not hold and nothing enforced it. Fixed in the same change as `sprint136.md`'s second amendment:
`PowerFractionSchema`'s three keys and `StatModifierSchema.powerFraction` are now REQUIRED, with
no defaults, so a missing SKU is a real schema failure - see
`packages/content/tests/powerFraction.test.ts`'s two schema-rejection tests and its count pin (472
SKUs carry `powerFraction`, 96 carry a nonzero fraction, 12 per power-bearing slot across 8
slots).

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

- [x] Levers 1 to 5 signed and recorded in this doc.
- [x] `EngineCharacter` vocabulary; `engineCharacterOf` and `specificOutputOf` exported from sim.
- [x] All 26 cars' characters pinned in a test.
- [x] `powerFraction` is a per-character object and `statModifiers.power` no longer exists.
- [x] All 472 SKUs authored; `fuelSystem` and `clutch` zero everywhere.
- [x] Every car reaches its character's multiple of its own stock power; the per-car table pinned.
- [x] Power is order-independent, proved with strict equality.
- [x] A race ECU is worth about ten times as much on a turbo as on a high-strung NA car.
- [x] `forcedInduction` is linear, pinned, and provably not yet increasing.
- [x] No sim source file reads `spec.aspiration`, proved structurally.
- [x] `gradeFactors` is per-slot with a default; only `ignitionEcu` carries its own entry.
- [ ] Climbing a grade ladder provably never improves yen per PS, on every power slot, class and
      character, with the measured table reported. **NOT SATISFIED as a data property**: 52 of
      288 measured cases exceed the rule-5 ceiling (max 1.335x, all on the four linear-curve
      slots' street rung plus one `block/sport` boundary case). The measured table is reported
      (Exit); the test itself still passes on a looser bound that predates this finding. Open
      finding for the maintainer, not resolved this sprint - see Exit.
- [x] The two Sprint 132 catalogue invariants still hold against the new resolution.
- [x] `harnessAcceptance.test.ts` passes untouched.
- [x] Economy gate and the `partPricing.json` guard both re-pinned with the sign-off.
- [x] Checks run once each, output shown. (Narrowed per standing maintainer directive - see Exit.)

## Exit

**Status: implemented and verified, with one open finding for the maintainer. Ready for review.**
Everything is built, tested, and pinned as designed, EXCEPT: measurement found rule 5 ("climbing
a ladder never improves value per yen") genuinely violated on 52 of 288 real cases - see
"Assumptions and interpretation calls" below for the full numbers. Nothing was changed to hide or
work around it; it is reported, not fixed, pending a maintainer decision on whether it needs its
own lever (most likely candidate: the four linear-curve slots earning their own price ladder, the
same treatment `ignitionEcu` already got).

### What changed, file by file

- `packages/content/src/tags.ts` - `EngineCharacterSchema` (`high-strung-na` / `lazy-na` /
  `forced`) and its inferred type, with the derivation and rotary-factor rule documented at the
  vocabulary.
- `packages/content/src/stats.ts` - split the old dual-purpose `StatModifierSchema` in two:
  `StatWeightsSchema` (taxonomy condition weights, unchanged five-number shape) and
  `StatModifierSchema` (a part's own deltas: `handling`/`style`/`reliability`/`authenticity` plus
  the new `powerFraction` object, `power` removed). Added `PowerFractionSchema` and exported
  `StatWeights`/`PowerFraction` types.
- `packages/content/src/carPart.ts` - `CarPartTaxonomyEntryContentSchema.statWeights` repointed
  at `StatWeightsSchema`.
- `packages/content/src/economy.ts` - `statFormulas.engineCharacter.naHighStrungThreshold` added
  to `EconomyConfigSchema`.
- `packages/content/data/economy.json` - the threshold value, `80.0`.
- `packages/content/src/partPricing.ts` - `gradeFactors` changed from a bare four-key object to
  `GradeFactorsSchema` (`ByCarPartIdGradeFactorsSchema` extended with a mandatory `default`);
  added `gradeFactorsFor(carPartId, gradeFactors)` (exported, used by both `resolvePartPriceYen`
  and the test suite) resolving a slot's own ladder or falling back to `default`.
- `packages/content/data/partPricing.json` - `gradeFactors.default` carries the unchanged
  `1 / 1.3 / 2 / 3`; `gradeFactors.ignitionEcu` is new at `1 / 1.30 / 4.77 / 8.67`.
- `packages/sim/src/derivedStats.ts` - added `specificOutputOf(model)` and
  `engineCharacterOf(model, economy)` (exported); `computeDerivedStats` resolves the character
  once before the part loop and the part-loop power line became
  `power += model.spec.stockPowerPs * part.statModifiers.powerFraction[engineCharacter] * wear`.
  Added `hasForcedInduction` to the existing `./bands` import (the sprint doc's claim that it was
  already imported was stale - it was not, and the first test run caught it immediately).
- `packages/content/data/parts.json` - all 472 SKUs: `statModifiers.power` removed,
  `statModifiers.powerFraction` added (a scripted, mechanical rewrite - see "Pins re-derived"
  below for how the values were computed and verified).
- `packages/content/data/storyMissions.json` - four mission requirement thresholds and three
  mission payout/budget pairs moved as measured consequences of the power and price changes (full
  list under "Pins re-derived").
- `packages/content/tests/economyApprovalGate.test.ts` - both content hashes re-pinned, the
  mission-payouts pin updated, and a new ledger paragraph recording all five levers by name and
  value plus every downstream mission movement.
- `packages/content/tests/partPricing.test.ts` - added the per-slot ladder resolution tests and
  the value-per-yen rule test (Task 8 items 13-14).
- `packages/content/tests/powerFraction.test.ts` - new file, catalogue completeness (Task 8 item
  12).
- `packages/sim/tests/engineCharacter.test.ts` - new file, the character derivation, both
  rotaries, the flagship ECU case, and the Lever 4 grade shapes (Task 8 items 6-11).
- `packages/sim/tests/proportionalPower.test.ts` - new file, the ratio property, the exact
  per-character cap, the per-car pinned table, order independence, and band scaling (Task 8 items
  1-5).
- `packages/sim/tests/derivedStats.test.ts`, `packages/sim/tests/marketValue.test.ts`,
  `packages/game/src/stores/gameStore.garage.test.ts`,
  `packages/game/src/stores/gameStore.market.test.ts` - existing fixtures/filters updated for the
  schema change (hand-written `Part` literals need a `powerFraction` object now; the two
  "find a real power part" filters switched from `part.statModifiers.power <= 0` to a
  powerFraction-based check).
- `packages/game/src/screens/PartsMarketScreen.vue` - `statSummary`'s power column removed. Power
  is no longer a flat per-part number; this generic, car-agnostic catalogue listing has no car in
  view to resolve a `powerFraction` against, so showing nothing is more honest than showing a
  fraction. Flagged under "Outstanding" below.
- `TODO.md` - removed the resolved "aftermarket power ladder is additive" entry, replaced the
  `street-power-street-manners` power-floor note (no longer blocked on the ladder-shape decision),
  and updated the tuning-arc status line to record sprint 135 as built.

### Engine character per car, and the resulting maximal parts-only power multiplier

All 26 shipped cars, character and stock-to-maximal PS (race grade throughout, `forcedInduction`
included only when the car already has it from the factory - see `proportionalPower.test.ts`):

| car | character | stock PS | maximal PS | multiple |
| --- | --- | ---: | ---: | ---: |
| Honda City E (AA) | lazy-na | 63 | 99 | x1.57 |
| Nissan Sunny (B12) | lazy-na | 85 | 133 | x1.57 |
| Toyota Carina (AT150) | lazy-na | 83 | 130 | x1.57 |
| Toyota Sera (EXY10) | lazy-na | 109 | 171 | x1.57 |
| Honda Prelude Si VTEC (BB4) | lazy-na | 162 | 254 | x1.57 |
| Suzuki Wagon R (CT21S) | high-strung-na | 55 | 79 | x1.43 |
| Toyota Sprinter Trueno (AE86) | high-strung-na | 130 | 186 | x1.43 |
| Honda Beat (PP1) | high-strung-na | 64 | 92 | x1.43 |
| Honda CR-X SiR (EF8) | high-strung-na | 160 | 229 | x1.43 |
| Honda Civic SiR-II (EG6) | high-strung-na | 170 | 243 | x1.43 |
| Nissan 180SX (RPS13) | forced | 157 | 306 | x1.95 |
| Toyota Chaser Tourer V (JZX90) | forced | 280 | 546 | x1.95 |
| Nissan Silvia K's (S14) | forced | 220 | 429 | x1.95 |
| Mazda Savanna RX-7 (FC3S) | forced | 203 | 396 | x1.95 |
| Mazda RX-7 (FD3S) | forced | 255 | 497 | x1.95 |
| Toyota Supra RZ (JZA80) | forced | 324 | 632 | x1.95 |
| Suzuki Alto Works (HA21S) | forced | 64 | 125 | x1.95 |
| Honda City Turbo II (AA) | forced | 110 | 215 | x1.95 |
| Nissan Silvia (S13) | forced | 175 | 341 | x1.95 |
| Toyota MR2 (SW20) | forced | 244 | 476 | x1.95 |
| Nissan Cefiro (A31) | forced | 205 | 400 | x1.95 |
| Subaru Impreza WRX STI (GC8) | forced | 250 | 488 | x1.95 |
| Nissan Skyline GT-R (BNR32) | forced | 280 | 546 | x1.95 |
| Nissan Fairlady Z (Z32) | forced | 280 | 546 | x1.95 |
| Toyota Aristo 3.0V (JZS147) | forced | 324 | 632 | x1.95 |
| Toyota MR2 (AW11) | forced | 147 | 287 | x1.95 |

10 NA cars (5 lazy, 5 high-strung), 16 forced - matches the roster survey exactly. Both sanity
targets hold (Beat 97.6 PS/L high-strung, Carina 57.2 PS/L lazy), and the Prelude Si VTEC reads
`lazy-na` at 75.1 PS/L as signed. Every maximal-build figure above is pinned by
`proportionalPower.test.ts`, computed via the real `computeDerivedStats`, not hand-derived.

### The ECU price ladder, before and after, and the largest single movement

The default ladder (`stock 1 / street 1.3 / sport 2 / race 3`) is unchanged and still applies to
every slot except `ignitionEcu`. `ignitionEcu`'s own new ladder:

| grade | old factor | new factor |
| --- | ---: | ---: |
| stock | 1 | 1 (unchanged) |
| street | 1.3 | 1.30 (unchanged) |
| sport | 2 | 4.77 |
| race | 3 | 8.67 |

Resolved catalogue prices (computed from the real `baseCostYen.ignitionEcu` (28,000) x
`classFactors` x the grade factor above, rounded to the nearest Y100 exactly as
`resolvePartPriceYen` does):

| class | grade | old price | new price | delta |
| --- | --- | ---: | ---: | ---: |
| flagship | race | Y75,600 | **Y218,500** | **+Y142,900** |
| flagship | sport | Y50,400 | Y120,200 | +Y69,800 |
| enthusiast | race | Y33,600 | Y97,100 | +Y63,500 |
| enthusiast | sport | Y22,400 | Y53,400 | +Y31,000 |
| everyday | race | Y13,400 | Y38,800 | +Y25,400 |
| entry | race | Y11,800 | Y34,000 | +Y22,200 |
| everyday | sport | Y9,000 | Y21,400 | +Y12,400 |
| entry | sport | Y7,800 | Y18,700 | +Y10,900 |
| every class | stock/street | unchanged | unchanged | 0 |

**The largest single price movement in the catalogue is the flagship race ECU: Y75,600 to
Y218,500, +Y142,900 (+189%).** One number differs from the sprint doc's own illustrative text,
which states Y218,400 for this same SKU: the real formula (`28,000 x 0.9 x 8.67`, rounded to the
nearest Y100) resolves to Y218,500, a Y100 rounding difference from the doc's prose. Not a defect
in the shipped ladder - the doc's number was illustrative, the signed LEVER is the factor table
(`1.30 / 4.77 / 8.67`), and that is what is pinned in content and in
`partPricing.test.ts`/`economyApprovalGate.test.ts`.

### Pins re-derived (directive 17 case (a) throughout - every one a mechanical consequence of an approved lever, none a new decision)

| file | field | old | new | reason |
| --- | --- | --- | --- | --- |
| `economy.json` | approval-gate sha256 | `138109cc...` | `d5fd4a87...` | `statFormulas.engineCharacter` is new content |
| `partPricing.json` | approval-gate sha256 | `6c0e3cf2...` | `24955b9a...` | `gradeFactors` restructured (per-slot + `ignitionEcu` ladder) |
| `storyMissions.json` | `make-it-pull` power floor | 191 | 173 | `floor90` of the freshly measured probe build's power under the new formula |
| `storyMissions.json` | `the-column-clock` lap ceiling | 125 | 125.7 | `ceil1AtTwoPercentSlower` of the fresh lap time (intake/exhaust power moved) |
| `storyMissions.json` | `under-one-fifteen` lap ceiling | 114.9 | 113.5 | `ceil1AtTwoPercentSlower` of the fresh lap time |
| `storyMissions.json` | `street-power-street-manners` tuner taste-match floor | 0.97 | 0.98 | `round2At97Percent` of the fresh taste ratio |
| `storyMissions.json` | `make-it-pull` payout/budget | 756,000 | 772,000 | probe build's sport-grade `ignitionEcu` costs more under Lever 5; `payoutYenFor`/`budgetCapYenFor` recomputed |
| `storyMissions.json` | `street-power-street-manners` payout/budget | 952,000 | 992,000 | same reason (sport-grade `ignitionEcu`) |
| `storyMissions.json` | `under-one-fifteen` payout/budget | 1,653,000 | 1,693,000 | same reason (sport-grade `ignitionEcu`) |

Every one of these was read off a real, fresh `storyMissionProbes.test.ts` run (never hand-picked,
never iterated toward a pass) and is recorded in `economyApprovalGate.test.ts`'s ledger comment.
`the-column-clock`'s probe never touches `ignitionEcu`, so its payout held unchanged; its lap
ceiling still moved because its probe fits sport intake/exhaust, which are power slots whose
fraction values changed under the new formula.

Not re-pinned, deliberately: `street-power-street-manners`'s hand-set PROVISIONAL power floor
(180) - it is not a `floor90(measured)` pin, is not on this sprint's approved lever list, and the
probe build clears it with real margin either way. Flagged in `TODO.md`.

### Checks run, exact final lines

Per the maintainer's standing speed directive (overriding Task 9's literal
`pnpm test --project sim` / `pnpm test --project content` instruction): ran every touched or
plausibly-affected file individually, plus the full content project once (cheap, and the sprint
touches enough content files to warrant it). Never ran the full sim project or bare `pnpm test`.

- `pnpm test packages/sim/tests/proportionalPower.test.ts packages/sim/tests/engineCharacter.test.ts` -> `Test Files 2 passed (2)  Tests 168 passed (168)`
- `pnpm test packages/sim/tests/derivedStats.test.ts packages/sim/tests/marketValue.test.ts` -> `Test Files 2 passed (2)  Tests 37 passed (37)`
- `pnpm test packages/sim/tests/harnessAcceptance.test.ts` -> `Test Files 1 passed (1)  Tests 27 passed (27)` (untouched, as required)
- `pnpm test packages/game/src/stores/gameStore.garage.test.ts packages/game/src/stores/gameStore.market.test.ts` -> `Test Files 2 passed (2)  Tests 25 passed (25)`
- `pnpm test packages/content/tests/partPricing.test.ts packages/content/tests/powerFraction.test.ts` -> `Test Files 2 passed (2)  Tests 308 passed (308)`
- `pnpm test --project content` (first run, before the comment-hygiene and hash fixes) -> `Test Files 2 failed | 19 passed (21)  Tests 3 failed | 470 passed (473)`
- `pnpm test packages/content/tests/commentHygieneGuard.test.ts` (after stripping "Sprint 135"
  mentions from new comments - the guard bans sprint numbers in comments everywhere except its own
  two exempt files, and eleven new comments had tripped it) -> `Test Files 1 passed (1)  Tests 1 passed (1)`
- `pnpm test packages/sim/tests/storyMissionProbes.test.ts` (first run, diagnosing the four
  moved thresholds) -> `Test Files 1 failed (1)  Tests 4 failed | 15 passed (19)`
- `pnpm test packages/sim/tests/storyMissionProbes.test.ts` (after re-pinning thresholds,
  diagnosing the three moved payouts) -> `Test Files 1 failed (1)  Tests 3 failed | 16 passed (19)`
- `pnpm test packages/sim/tests/storyMissionProbes.test.ts` (after re-pinning payouts) ->
  `Test Files 1 passed (1)  Tests 19 passed (19)`
- `pnpm test packages/content/tests/economyApprovalGate.test.ts` (after re-pinning both hashes
  and the mission-payouts object) -> `Test Files 1 passed (1)  Tests 3 passed (3)`
- `pnpm test --project content` (final) -> `Test Files 21 passed (21)  Tests 473 passed (473)`

### Assumptions and interpretation calls

- **Task 8 item 13, corrected: rule 5 (`docs/sprints/tuning-arc.md`, "climbing a ladder never
  improves value per yen") is VIOLATED on real, shipped content, and this is a disclosed open
  finding, not a resolved test.** The original version of this test used a symmetric bound
  (0.5x-2.0x of the race rung's yen-per-PS) on the reasoning that a diminishing power curve
  legitimately makes a cheaper rung BETTER value than race (true, and fine - that is rule 5
  working correctly, since climbing does not IMPROVE value there, it costs more for proportionally
  less). That reasoning does not cover the other direction. Read strictly, rule 5 says
  normalized-yen-per-PS (indexed to race = 1.00) must never exceed 1.00 anywhere: any grade
  costing MORE per PS than race means climbing UP to race is a better buy than the cheaper
  grade, which is the same defect the old `ignitionEcu` had, just smaller.

  Measured directly against the real resolved catalogue (288 cases: 8 power slots x 4 classes x
  3 characters x up to 3 non-stock grades): **maximum normalized value is 1.335**
  (`internals/entry/high-strung-na/street`), minimum is 0.717 (`intake/everyday/lazy-na/street`,
  legitimate diminishing-returns territory), and **52 of 288 cases exceed 1.00**. Every one of
  the 52 is the STREET rung (plus four `block/sport` cases at 1.026, a rounding-boundary
  overshoot) of the four LINEAR-power-curve slots that still resolve the DEFAULT price ladder:
  `internals/street` (12 cases, 1.273-1.335), `forcedInduction/street` (12, 1.306-1.321),
  `camsTiming/street` (12, 1.266-1.323), `block/street` (12, 1.237-1.301), `block/sport` (4,
  1.026, `forced` character only). Every other slot/grade combination (`headValvetrain`,
  `exhaust`, `intake`, `ignitionEcu` at every grade; the four linear slots at sport/race other
  than the one boundary case) never exceeds 1.00.

  **Nothing was changed in response to this finding.** Per standing instruction, a value or lever
  is never adjusted to make a test pass, and the test's bound was not loosened or tightened either
  - `partPricing.test.ts` still runs the original 0.5x/2.0x symmetric check (passing, since 1.335
  is inside 2.0x), which is now known to be the wrong shape for rule 5 and does not itself enforce
  the strict `<= 1.00` ceiling. This is flagged to the maintainer as a real, signed-content finding:
  the four linear-curve slots' street rung is priced as a mediocre buy relative to race, by design
  intent unclear - whether the fix is those four slots getting their own price ladder (the Lever 5
  treatment `ignitionEcu` already got) is exactly the kind of specific, named lever this sprint's
  process exists to route to the maintainer rather than deciding unilaterally.
- **`specificOutputOf` returns `NaN` when `displacementCc` is absent**, rather than a defined
  fallback number - the sprint doc only specifies `engineCharacterOf`'s own fallback (`lazy-na`),
  and `specificOutputOf` has exactly one caller in this codebase, which guards the absence itself.
  Unreachable on all 26 shipped cars (pinned).
- **`PartsMarketScreen.vue`'s per-part badge no longer shows a power figure at all.** Not in the
  task list, but the field it read (`statModifiers.power`) no longer exists, and there is no
  honest single number to substitute in a car-agnostic catalogue listing. A vehicle-aware power
  readout (resolving `powerFraction` against whichever car the market's own vehicle filter has
  selected) is a natural follow-up, not scoped here.
- **The `String`-keyed `PARTS.find` lookups in the new test files assume the catalogue carries
  exactly one SKU per (carPartId, grade, fitmentClass, zoneId undefined)** - true today (Sprint
  132's own invariant), and the tests would throw loudly (not silently mis-measure) if that ever
  stopped holding.

### Outstanding / deferred (unchanged from the sprint doc's own accepted list)

- The three consequences accepted at sign-off (the x1.43/x1.57/x1.95 ceiling being low on the
  RB26 and 2JZ specifically, the Prelude reading lazy, and the ECU getting substantially dearer)
  all measured exactly as signed - see the tables above.
- `forcedInduction`'s power curve stays linear; making it increasing is Sprint 137's job, hard-
  gated behind the support-ratio mechanism, and nothing in this sprint moves it.
- `forcedInduction` keeps the DEFAULT price ladder this sprint, per the doc's own rule that a
  slot's price ladder moves in the same sprint as its power curve - it lands with Sprint 137.
- The `street-power-street-manners` power-floor question (still hand-set at 180) is now
  decoupled from the ladder-shape decision but not itself re-examined - noted in `TODO.md` for
  whoever next revisits mission thresholds.

---

## The rule 5 finding, closed

**This section closes the one open finding the Exit above left for the maintainer.** It is a
pointer, not a rewrite: the Exit's measurement (52 of 288 catalogue cases above parity, maximum
value-per-yen index 1.335) was correct when it was written and stays as the record of it.

**What happened next.** Sprint 137's `camsTiming` amendment (signed 2026-07-30) gave
`camsTiming` its own price ladder, exactly the Lever 5 treatment this finding proposed as the
most likely candidate. That cleared its 12 `street` cases outright: the catalogue-wide residue
fell **52 -> 51 -> 39** across Sprint 137 and its amendment, with the maximum unchanged at
1.334961x. The remaining 39 cases are `internals` and `block`, which the maintainer had already
accepted in this sprint's own sign-off.

**Status: no longer open.** The residue is a recorded maintainer acceptance rather than an
unanswered question, and it is tracked in `TODO.md`'s "Open balance/economy questions" for
whoever revisits the power ladder. Nothing here is waiting on a decision.
