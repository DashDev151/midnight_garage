# style

What the game means when it says a car looks good.

---

## The formula

`stylePercentOf`, in `packages/sim/src/derivedStats.ts`. `computeDerivedStats` in the same file
calls it once and passes the result straight through to `StatBlock.style`; nothing rounds, clamps
or adjusts it afterwards.

    fitted   = sum over every installed part of statModifiers.style x bandFactor(part.band)
    reach    = min(1, fitted / statFormulas.styleSaturationPoints)
    styleRaw = spec.styleBase + (spec.styleCeiling - spec.styleBase) x reach
    style    = round(clamp(styleRaw x conditionFactor, 0, 100))

`conditionFactor` is `weightedBandFactorForStat(car, model, 'style', ...)`, the same weighted-mean
walker every derived stat uses, taken over the parts taxonomy's `statWeights.style` column.

`bandFactor` is `economy.bands.bandFactors`: mint 1, fine 0.85, worn 0.65, poor 0.4, scrap 0.15.
The same curve does both jobs, scaling each fitted part's points and forming the condition mean.

**Style is the only derived stat where a part closes a gap rather than adding to a total.** It
never enters `computeDerivedStats`' per-part accumulation loop; only power does.

---

## What it means about a car

Every car has a look it was born with and a best it could ever look, and both are decided by which
car it is. Style says how far along that road this particular example has got, and then knocks it
back by how rough the car is. A tidy stock 2000GT is already beautiful and a body kit barely moves
it. A tired Cefiro is plain and has fifty points of room, so the same kit transforms it. Neither
car is a special case: they are simply different cars.

The second half matters as much as the first. Condition multiplies the **whole** number, not just
the stock part of it, so a rough car does not look good however it is dressed. A dressed-to-the-
ceiling wreck reads below a mint car nobody has touched.

---

## Every input

### Per car: `spec.styleBase` and `spec.styleCeiling`

Two authored integers per car, the only per-car inputs style has.

| | authored range across all 94 roster rows | shipped 26 |
| --- | --- | --- |
| `styleBase` | 15 (Honda Acty) to 88 (Countach), median 52 | 16 to 82, median 54 |
| `styleCeiling` | 42 (Acty) to 96 (FD3S), median 84 | 44 to 96, median 90 |
| headroom (ceiling minus base) | 4 to 67, median 31 | measured per car below |

Authored in `docs/design/midnight-garage-roster.csv` for all 94 rows and promoted into
`packages/content/data/cars.json` for the 26 that ship. The two sources agree exactly on all 26
(measured: zero mismatches). No row has a ceiling below its base; no row has a ceiling equal to
its base, so every car on the roster has at least four points of room to build into.

Two identities hold exactly, on all 26 shipped cars (measured):

- **A stock, mint car reads exactly its `styleBase`.** `reach` is 0 and `conditionFactor` is 1.
- **A mint car with the best style part in every slot reads exactly its `styleCeiling`.**

The schema (`packages/content/src/carModel.ts`) bounds both to 0 to 100 and refuses a ceiling
below its base. `rosterCsvGuard.test.ts` holds every CSV row to the same 0 to 100 band and pins
what the pair means against the buyer table: 23 of the 94 satisfy the stancer stock, seven can
never reach the stancer at any build, and two (Acty, Wagon R) can never reach even the tuner.

### Per part: `statModifiers.style`

A plain point value on each catalogue SKU in `packages/content/data/parts.json`. **This is the
only place in the codebase that reads it**; nothing prices off it, nothing else in the sim
touches it.

144 SKUs carry a non-zero value, spread across **12 slots** and identical at all four fitment
classes (`everyday`, `entry`, `enthusiast`, `flagship`). All stock-grade SKUs are 0. No SKU is
negative, though the schema (`z.number().default(0)`) would allow it.

| slot | street | sport | race | best | `statWeights.style` |
| --- | ---: | ---: | ---: | ---: | ---: |
| `aero` | 7 | 13 | 18 | 18 | 2 |
| `rims` | 6 | 10 | 14 | 14 | 3 |
| `panels` | 5 | 9 | 12 | 12 | 2 |
| `seats` | 4 | 7 | 10 | 10 | 2 |
| `dampers` | 4 | 6 | 8 | 8 | 0 |
| `dashGauges` | 3 | 5 | 8 | 8 | 1 |
| `underbody` | 8 | 8 | 6 | **8** | 2 |
| `exhaust` | 3 | 5 | 7 | 7 | 0 |
| `springs` | 3 | 5 | 7 | 7 | 0 |
| `brakeCalipersLines` | 2 | 4 | 6 | 6 | 0 |
| `tyres` | 2 | 4 | 6 | 6 | 0 |
| `intake` | 2 | 3 | 4 | 4 | 0 |
| `paint` | (no SKU) | (no SKU) | (no SKU) | 0 | 2 |
| **totals** | **49** | **79** | **106** | **108** | **14** |

A uniform street-grade dress of all twelve slots reaches 49 points, which is 74 per cent of the
gap. A uniform sport dress reaches 79 and saturates. `underbody` is the one slot whose ladder does
not climb with grade, and it is a deliberate exception (see Findings).

Each part's points are scaled by that part's own band before they are summed, exactly as a
`physicalModifier` is. A scrap bodykit is a bad bodykit and buys less of the gap than a mint one.

### Global: `statFormulas.styleSaturationPoints`

One number in `packages/content/data/economy.json`: **66**. The exchange rate between the
catalogue's points and every car's own headroom. `reach` is `min(1, fitted / 66)`, so 66 mint
points take any car all the way from its base to its ceiling, however wide that gap is.

### Per band: condition, through two separate routes

**Route one, the fitted points.** Each part's contribution is multiplied by
`bandFactor(part.band)`, so wear on a style part reduces how much of the gap it closes.

**Route two, `conditionFactor`.** A weighted mean of `bandFactor(band)` across the seven slots
carrying `statWeights.style`, weighted by those weights, multiplying the whole result. Total
weight 14, so each slot controls a fixed share of the entire number:

| slot | weight | share of style controlled | style on a mint stock EG6 (base 45) if this slot goes scrap | if it goes missing |
| --- | ---: | ---: | ---: | ---: |
| `rims` | 3 | 21.4% | 37 | 35 |
| `panels` | 2 | 14.3% | 40 | 39 |
| `paint` | 2 | 14.3% | 40 | 39 |
| `underbody` | 2 | 14.3% | 40 | 39 |
| `aero` | 2 | 14.3% | 40 | 39 |
| `seats` | 2 | 14.3% | 40 | 39 |
| `dashGauges` | 1 | 7.1% | 42 | 42 |

Missing is worse than scrap: `weightedBandFactor` counts a genuinely missing part at a band factor
of 0 rather than dropping it from the mean. A legitimately absent slot (an NA car's
`forcedInduction`) is skipped entirely, but no legitimately-absent slot carries style weight, so
that case never touches this stat.

A uniformly worn stock car reads its base times the band factor exactly (measured on the EG6, base
45): mint 45, fine 38, worn 29, poor 18, scrap 7.

### The body carriers, and the one route the colour a car wears reaches style

`panels`, `paint` and `underbody` are `removable: false` value carriers. On a car with
`zoneState`, `applyDerivedBodyBands` (`packages/sim/src/bodyPipeline.ts`) is the single writer of
their bands, and derives them from zone state rather than from anything the slot holds:

- **`panels` band** is the worst of `max(metal, surface)` across the five panel zones, and `scrap`
  outright if any panel is missing.
- **`paint` band** is the worst `finish` across the five panel zones, **stepped one band worse when
  two or more painted zones disagree on colour**. This is the only route the colour a car wears
  reaches style. Measured on the EG6, one rung of paint band is worth 1 to 2 points on a stock car
  (45 mint, 44 fine, 43 worn, 41 poor, 40 scrap) and 2 to 3 on a dressed one (92, 90, 87, 84, 81),
  so a two-tone car pays that rung wherever its finish happens to sit.
- **`underbody` band** is `max(metal, finish)` on the chassis zone alone, and can never read
  `scrap`.

The band is written onto whatever SKU the slot holds, so identity and condition stay orthogonal: a
dented widebody is a widebody that is dented. `panels` and `underbody` both carry a real
street/sport/race ladder, so both contribute style points as well as scaling it.

**Fitting a body kit temporarily costs style, and the car now says so.**
`refitCarrierZoneStates` routes a carrier swap through `planSwapPanel`, which leaves every covered
zone with a bare, unpainted finish. A freshly fitted kit therefore reads `poor` on the `paint`
carrier until the car is repainted: **measured**, a fully dressed EG6 drops from 92 to 84 while the
paint is bare, and a stock EG6 with a mint sport kit reads 47 rather than the 51 the kit's own
points would give.

The arithmetic is right (the car really is sitting in primer) and what was missing was the notice.
`unpaintedPanelZoneIds` (`bodyPipeline.ts`) reports the panel zones carrying no paint,
`unpaintedPanelsText` (`packages/game/src/utils/zoneSeverity.ts`) turns the count into a line, and
`CarDetailScreen` renders it directly under the radar, where the drop is:

> Five panels are still unpainted. Style and authenticity read low while the car sits like that,
> and both come back once the paint is on.

No formula changed with it. The same swap costs authenticity a second time in exactly the same
way; see `authenticity.md` finding F5.

---

## The bounds

Everything in this section was measured by running `computeDerivedStats` over shipped content.

### Per car

| bound | what it is | how to get there |
| --- | --- | --- |
| ceiling | exactly `spec.styleCeiling` | any 66 mint points of `statModifiers.style`, with every style-weighted slot mint |
| stock reading | exactly `spec.styleBase` | fit nothing, keep everything mint |
| floor | `styleBase x 0.0643`, rounded | every slot scrap, and the four removable style-weighted slots emptied |

### Across the shipped roster

- **Highest reachable style on any shipped car: 96** (Mazda RX-7 FD3S). The formula's clamp at 100
  is unreachable from content, because the highest `styleCeiling` authored anywhere on the 94-row
  roster is 96.
- **Lowest reachable style on any shipped car: 1** (Honda City E, Wagon R, Carina). Zero is
  unreachable, because three of the seven style-weighted slots (`panels`, `paint`, `underbody`)
  are `removable: false` and so can never fall below scrap's 0.15. The worst achievable
  `conditionFactor` is `(2 + 2 + 2) x 0.15 / 14`, which is 0.0643.
- Per-car floors run 1 to 5 and per-car maxima are each car's own `styleCeiling` exactly, on all
  26.

### What it takes to reach a ceiling

The catalogue offers **108 mint points** best-in-slot against a saturation point of **66**.
Fitting loudest-first, which is the cheapest possible route (anything else takes more parts, never
fewer):

| parts fitted | points | cumulative | share of the gap bought |
| --- | ---: | ---: | ---: |
| aero (race) | 18 | 18 | 27% |
| + rims (race) | 14 | 32 | 48% |
| + panels (race) | 12 | 44 | **67%** |
| + seats (race) | 10 | 54 | **82%** |
| + the first 8-point slot | 8 | 62 | 94% |
| + the second 8-point slot | 8 | 70 | **100%** |

**Three parts buy half a car's headroom, four buy four fifths, six buy all of it.** Six of twelve
slots, and 42 points left on the table.

---

## What saturation does with the other 42 points

`reach` is `min(1, fitted / 66)`. At mint, everything past 66 points buys exactly nothing on this
stat: measured on the EG6 (base 45, ceiling 92), builds of 70, 78, 85, 92, 98, 104 and 108 points
all read 92.

The surplus is not wasted, though. It buys two things.

**It buys freedom of choice.** Any 66 points reaches the ceiling, so a player who wants a clean
car with good wheels, good seats and no wing gets the same style number as one who bolts on
everything. The overshoot is what stops a single mandatory build from existing.

**It buys wear tolerance.** Fitted points are band-scaled, so the points needed to stay saturated
climb as the car ages:

| band on the fitted parts | points needed to saturate | reachable from a 108-point catalogue |
| --- | ---: | --- |
| mint | 66.0 | yes |
| fine | 77.6 | yes |
| worn | 101.5 | only a near-maximal build |
| poor | 165.0 | **no** |
| scrap | 440.0 | **no** |

Measured on the EG6: a full twelve-part kit holds `reach` at exactly 1.000 through fine and worn,
while the minimal six-part 70-point kit drops to 0.902 at fine and 0.689 at worn. The extra parts
are a buffer against condition, not against the ceiling.

**The overshoot is not free.** Every extra style part costs money, costs authenticity through
`statWeights.authenticity` (rims 7, panels 11, aero 10, seats 4, underbody 1, dashGauges 1), and,
on a rough car, actively lowers style: a bigger kit occupies more style-weighted slots, so more of
`conditionFactor` is dragged down while `reach` is already capped. Measured on the EG6 at scrap
across the fitted parts, the twelve-part kit reads **15** and the six-part kit reads **17**.

Related and easier to hit: **fitting one rough aftermarket part can lower style below stock.** A
best-in-slot set of rims at scrap on an otherwise mint stock EG6 reads 38 against the stock 45,
because the 2.1 fitted points it contributes buy less gap than the rims slot's own 21.4 per cent
share of `conditionFactor` costs.

---

## Style against performance

**The formula is completely orthogonal to performance.** `stylePercentOf` reads
`spec.styleBase`, `spec.styleCeiling`, `statModifiers.style` and band factors, and nothing else.
It sees no power figure, no weight, no grip, no lap time. A part's `physicalModifiers` never reach
style and a part's style points never reach the lap model. Nothing a player does to make a car
faster moves style except insofar as the parts they fit happen to carry style points.

**The authored column is not orthogonal.** Measured across all 94 roster rows:

| relationship | Pearson r | Spearman rho |
| --- | ---: | ---: |
| `styleBase` against PS per tonne | 0.60 | 0.54 |
| `styleCeiling` against PS per tonne | 0.56 | 0.59 |
| `styleBase` against `stockPowerPs` | 0.55 | 0.50 |
| `styleCeiling` against top speed | 0.66 | 0.62 |
| `styleBase` against `priceYen` | 0.49 | 0.66 |

On the 26 shipped cars, which are the ones a player currently sees, the coupling is tighter still:
`styleBase` against PS per tonne measures r 0.69 and `styleCeiling` against PS per tonne r 0.77.

**Most of that is price, not physics.** Holding `log(priceYen)` constant, the partial correlation
between `styleBase` and PS per tonne falls to **0.16**, and between `styleCeiling` and PS per tonne
to **0.30**. Expensive cars are both faster and prettier, which is true of the real world too. What
remains after price is weak for the base and modest for the ceiling.

The counterexamples are real and there are plenty of them. The Suzuki Jimny is the fifth slowest
car on the roster on power-to-weight and reaches a ceiling of 88. The Land Cruiser 70 is the third
slowest and reaches 82. The 2000GT sits 60th of 88 on power-to-weight and holds the seventh
highest `styleBase` in the game. The Countach outscores the LFA on style while the LFA outguns it
by a fifth.

**But a reader should not treat the two axes as independent when reading a radar chart.** They
share a driver (price), and on the shipped subset they track each other closely enough that style
does partly read as a second ranking of the same cars. See Findings.

---

## What does NOT affect style

- **Performance, in any form.** Power, grip, downforce, mass, lap time, tyre compound as a
  physical quantity, and every one of the four `physicalConditionFactors` dials. None reaches this
  stat, at all.
- **A part's `physicalModifiers`.** Grip, braking and mass move the lap model and nothing else.
- **A part's `grade`, directly.** Grade reaches style only because higher-grade SKUs happen to be
  authored with more points; the formula reads the number, not the rung. `underbody` proves the
  point by breaking the pattern.
- **`gradeBandFactor`.** Style uses the flat value-side `bands.bandFactors` curve for both its
  jobs. The sharper per-grade wear curves are the physics model's alone, so a race style part does
  not decay faster on this axis than a street one.
- **Mileage, model year, `CarInstance.color`, `provenanceNote` and symptoms.** Measured: a
  480,000 km 1971 example in an odd colour with an unusual provenance note reads exactly the same
  as a fresh one.
- **The condition of any slot with `statWeights.style` of 0.** An engine block at scrap, an
  exhaust at scrap and a set of tyres at scrap all leave style untouched at 45 on a mint stock
  EG6, even though the exhaust and tyres both carry style POINTS. Points and condition weight are
  two separate columns and six slots have one without the other.
- **`marketValueYen`.** It reads no derived stat at all. Style reaches money only through
  `normalizedTasteScore` in `packages/sim/src/valuation.ts`, which divides the stat by 100 and
  matches it against a buyer's own `statTargets.style`, and from there through `tasteSpread` into
  what that buyer will pay. A car is never worth more on the buy side for being beautiful.
- **The concours gate.** It reads authenticity, not style.
- **`machiningCost`, `coherenceFactor` and the support ratios.** All reliability's concern.

---

## Where the content levers live

| lever | file | key | scope |
| --- | --- | --- | --- |
| how a car looks stock | `docs/design/midnight-garage-roster.csv` and `packages/content/data/cars.json` | `styleBase` / `spec.styleBase` | per car, all 94 rows |
| the best a car could look | same two files | `styleCeiling` / `spec.styleCeiling` | per car, all 94 rows |
| what a part is worth | `packages/content/data/parts.json` | `statModifiers.style` | per SKU, 144 non-zero |
| points to a full ceiling | `packages/content/data/economy.json` | `statFormulas.styleSaturationPoints` | one global value, 66 |
| how much each slot's condition matters | `packages/content/data/parts-taxonomy.json` | `statWeights.style` | per slot, 7 non-zero, total 14 |
| the wear curve both routes use | `packages/content/data/economy.json` | `bands.bandFactors` | global, shared with car value and repair |
| who cares how a car looks | `packages/content/data/buyers.json` | `statTargets.style` | per archetype: stancer 0.65, hobbyist 0.55, collector 0.50, tuner 0.45, first-timer 0.20, racer 0.10 |
| how much taste is worth in yen | `packages/content/data/economy.json` | `valuation.tasteSpread` | global |

`statFormulas.styleSaturationPoints` is gated by `economyApprovalGate.test.ts`. Both style columns
are gated by `rosterCsvGuard.test.ts`, which also pins the three counts against the buyer table.
`packages/sim/tests/style.test.ts` holds the two identities on every shipped car and the shape of
the catalogue ladder.

---

## Findings

### 1. Style does partly read as a second performance ranking, on the cars that ship

The formula is orthogonal, but the authored values are not: `styleBase` against PS per tonne
measures r 0.60 across the 94-row roster and r 0.69 across the 26 shipped cars, and `styleCeiling`
against PS per tonne measures r 0.77 on the shipped subset. Holding price constant drops the
partial correlations to 0.16 and 0.30, so most of the coupling is the ordinary fact that expensive
cars are both quick and handsome. What is left is a real, if modest, tendency for the pretty column
to rank the cars the way the fast column does, and it is strongest exactly where a player looks.
It is an authoring observation, not a defect in the formula, and it is not a lever question either:
nothing here is a number to turn, it is 188 authored integers.

### 2. `paint` can scale style but can never contribute to it

`paint` carries 2 of the 14 style condition weight, so it controls 14.3 per cent of the whole
number, but `parts.json` ships no non-stock `paint` SKU at any fitment class. It is the only
style-weighted slot in that position: the other six all have a ladder. So paint is a pure
subtraction on this axis. A car can lose 14 per cent of its style to bad paint and can never gain
a point back by respraying it in something better, only by returning the band to mint. `TODO.md`
tracks the same gap on the authenticity side and lists two candidate routes; neither has been
chosen.

### 3. Six slots carry style points but no style condition weight, and one carries the reverse

`dampers`, `springs`, `exhaust`, `intake`, `brakeCalipersLines` and `tyres` all contribute to
`fitted` (38 points between them at race grade, just over a third of the ladder) but carry
`statWeights.style` of 0, so their condition never scales style. A scrap race exhaust still hands
over its 7 x 0.15 points and its wretched state costs the car nothing on this axis. `paint` is the
mirror image, per finding 2. This is not obviously wrong (a rusty exhaust is not what a stancer is
looking at), but the two columns are easy to conflate and the asymmetry is not written down
anywhere else.

### 4. The `underbody` ladder does not climb with grade, deliberately

Neon underglow is the street rung and the loudest thing on the slot at 8 points; the
skirt-and-splitter kit is the sport rung at the same 8; the race flat floor is the quietest at 6.
Every other style-bearing slot sells showiness up the same ladder it sells capability, and
`style.test.ts` guards that rule with `underbody` written in as an explicit exception. `TODO.md`
holds the open question: either the three values are re-authored to climb, or the carve-out is
accepted as a statement that an underside dress ladder measures function rather than volume.
Confirmed by measurement: street 8, sport 8, race 6, at all four fitment classes.

### 5. `economy.json`'s own schema comment describes a catalogue that no longer exists

`packages/content/src/economy.ts`, on `styleSaturationPoints`, says: "At 66 against the 88 points a
maximal fit-the-best-in-every-slot build totals", "The catalogue holds ten style-bearing slots with
a best-in-slot ladder from 18 (`aero`) down to 4 (`intake`)", and "three parts buy half a car's
headroom, five buy four fifths, and the last of it takes seven."

Measured: **twelve** slots, **108** points, and **three, four and six** parts. The ladder gained
`panels` (12) and `underbody` (8) after that comment was written. The value 66 is correct; the
reasoning attached to it is stale in every particular. `packages/sim/tests/style.test.ts` carries
the same drift in a comment reading "Now 42 of 88" where the measured figure is 44 of 108, though
the assertion it sits above still passes with room to spare (0.407 against a 0.55 bar).

### 6. The design documents that disagreed with the code about style now agree with it

All four claims this finding recorded have been corrected in the documents themselves. **Read**:

- `docs/design/systems/desirability-system.md` records `styleSaturationPoints` as "**IMPLEMENTED**
  at 66, preliminary and unsigned" and its outstanding item reads "Implemented at 66 against the
  108 points fittable across all slots". Shipped: **66** against **108** (**measured**).
- The same document's outstanding item on originality now names `paint` alone and states that
  `panels` and `underbody` can read as modified. **Measured**: both carry street/sport/race SKUs;
  only `paint` has no ladder.
- `docs/design/midnight-garage-roster.md` now describes `styleBase` as "authored 15 to 88, on a
  schema band of 0 to 100", which is the authored range and the guard band exactly.
- `docs/design/systems/tuning-system.md` section 11 now records style's verdict as "gap-closing,
  per car" and names `styleCap` as retired. Style is not additive and `styleCap` is banned by
  `retiredIdentifiers.test.ts`.

Finding 5 is the one drift on this stat that is still live, and it is a code comment rather than a
design document.

### 7. Fitting a style part can make a car look worse, by two different routes

Both measured on the EG6 (base 45, ceiling 92):

- **A rough part in a weighted slot.** Best-in-slot rims at scrap read **38** against a stock 45.
  The 2.1 points of gap they buy are worth less than the 21.4 per cent of `conditionFactor` the
  rims slot surrenders.
- **A bigger kit on a rough car.** With every fitted part at scrap, the full twelve-part kit reads
  **15** and the six-part kit reads **17**, because the larger kit puts scrap parts into more
  style-weighted slots while `reach` is capped either way.

Neither is a bug: both fall straight out of condition multiplying the whole result. They are
counterintuitive enough that a player fitting a cheap used bodykit will see the number go down, and
the UI has no way to explain why from the number alone.

### 8. Style can never read 100, and can never read 0

The clamp is `[0, 100]` and neither end is reachable from shipped content. The highest
`styleCeiling` authored on any of the 94 roster rows is 96, so 97 to 100 is dead range. At the
other end, `panels`, `paint` and `underbody` are `removable: false`, so `conditionFactor` bottoms
out at 0.0643 and the lowest style measured on any shipped car is 1.

### 9. `statWeights.style` defaults to 0, unlike its neighbours

`StatWeightsSchema` (`packages/content/src/stats.ts`) makes `power`, `reliability` and
`authenticity` required so a taxonomy slot that forgets one fails validation loudly, but leaves
`handling` and `style` on `.default(0)`. A new slot that omits `style` silently carries no style
condition weight. The schema is `.strict()`, so a misspelt key is still caught; a missing one is
not.

---

## What was measured and what was read

**Measured** by running `computeDerivedStats` and `stylePercentOf` over shipped content: the two
identities on all 26 cars; the 108-point total and the twelve-slot ladder; the 3/4/6 route; the
overshoot behaviour and the per-band saturation thresholds; every per-slot condition figure; the
per-car floors and maxima; the paint-band and colour-mismatch costs; the bare-panel cost of a
freshly fitted body kit, taken through `refitCarrierZoneStates` and `applyDerivedBodyBands` rather
than a hand-written zone state; the correlations and partial correlations across all 94 roster
rows and the shipped 26; the CSV-to-`cars.json` agreement.

**Read off the source** and not separately re-derived: the derivation order in `stylePercentOf`;
the zone-to-band derivations in `bodyPipeline.ts`; the schema bounds; the list of files that read
`statModifiers.style` (verified by search to be exactly one).
