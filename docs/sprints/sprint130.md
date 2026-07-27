# Sprint 130: what aftermarket parts do to performance

**Status: APPROVED, IMPLEMENTING.** Maintainer instruction 2026-07-27: step sanely from stock to
maxed across the grade steps and **document every value as a provisional default**. Verbatim: *"you
know what a maxed build looks like. you know what a stock part looks like. you know how many grade
steps there are between maxed and stock. so just sanely step up on each step."*

## The targets, and where the ladder already stands

The right-hand column is what the maintainer built and drove, so it is the target rather than a
preference:

| Quantity | Stock (roster median) | Maxed build, DRIVEN | Ladder must deliver |
|---|---|---|---|
| mechanical grip | 0.88 | 1.235 (two independent maxed road cars) | **x1.40** |
| power | varies | x1.79 to x1.84 (BMW, F355) | **x1.80** |

**Grip: the tyre half is nearly there already and must not be touched.** `gradeToCompound` maps a
race tyre to the `slick` tier at +0.20, on an era base near 0.905, which is about **x1.22** of stock
grip. That is most of the x1.40 and it arrives through the anchoring ratio with no new mechanism.

**What is missing is everything that is not a tyre.** Suspension and chassis parts carry a
`handling` stat modifier, which moves the abstract readout and reaches physical grip **not at all**.
So the remaining **x1.147** has no path today and this sprint builds it.

**Power: measure before changing anything.** Summing the best race SKU for every engine slot gives
+197 on the power stat, which is PS-denominated, and that would be far more than x1.80 on a small
car. But a real build cannot fit every SKU (fitment classes and required tags bind), and a measured
full build on the 180SX reached only 192 PS from 157. Those two figures cannot both describe the
same ladder. **Task 1 of this sprint is to measure what a maximal LEGAL build actually reaches on
three reference cars, using the real sim rather than by summing the catalogue**, and only then to
decide what has to move. Do not scale a lever against the +197 figure.

Opens after Sprint 129. Last of four in the porting arc, and **the one that makes the model
matter**: until it lands, the game can say precisely what a car does and nothing connects that to
what the player built.

## The gap

The lap model answers "what does a car with this grip and this power do". Nothing answers "what does
fitting this part do to grip and power". Today a part moves four abstract stats. After this sprint
it moves the physical dials, and the lap time follows.

## Reuse analysis (directive 16)

### Genuinely new

- Per-SKU **physical** dial deltas.
- One aero grade above the current top, for GT3-class wings, splitters and diffusers. The ceiling
  that lets it exist is signed in Sprint 128; the part itself is authored here.

### Existing mechanisms reused, unchanged

- **`statModifiers` on each part** (`parts.json`). The mechanism is right, the target changes. This
  is the same move Sprint 129 makes on condition, for the same reason.
- **`statFormulas.aero.byGrade`** already maps an aero grade to a downforce coefficient and a drag
  cost. It is the one place parts already reach a physical dial, and it is the template for the
  rest.
- **The grip anchoring ratio from Sprint 128** already gives a tyre upgrade its effect. Do not add a
  second path for tyres.
- **Economy-bible Law 5** governs what a part does to VALUE, and it is untouched here. A part
  raising performance and a part raising value are two independent effects of the same purchase.

## The ladder (ALL PROVISIONAL)

Four grades: `stock`, `street`, `sport`, `race`. Three steps between stock and maxed, stepped
geometrically so each purchase feels like the same size of move.

**Grip: x1.40 total, and the tyre share of it already exists. DO NOT ADD A SECOND TYRE PATH.**
The compound ladder (`gradeToCompound` race -> `slick`, `tierDelta.slick` +0.20) already delivers
about x1.22 through the anchoring ratio. Adding a tyre modifier on top would count the same upgrade
twice, which is exactly the error corrected in Sprint 129's braking dial.

| Carrier | stock | street | sport | race | Mechanism |
|---|---|---|---|---|---|
| tyres (compound) | 1.000 | - | - | **~1.22** | ALREADY EXISTS via the compound tiers. Untouched by this sprint. |
| suspension (dampers, springs, anti-roll bars) | 1.000 | 1.029 | 1.059 | **1.090** | NEW physical grip modifier |
| chassis stiffening | 1.000 | 1.016 | 1.033 | **1.050** | NEW physical grip modifier |

Product at race: 1.22 x 1.090 x 1.050 = **1.396**, against a driven 1.40. Close enough that the
remainder is inside the measurement, and reached without disturbing the tyre path that Sprint 128's
acceptance test depends on.

**Verify the x1.22 empirically before building on it.** It is derived from the era base and the tier
delta, and width adjustment moves it slightly per car. Measure the real stock-to-race grip ratio on
three cars first; if it lands materially away from 1.22, re-derive the suspension and chassis
figures to hit 1.40 rather than keeping these.

**Per SKU, because the group figures above are products and must not be applied per part.** The
suspension figure is spread across its three carriers so that fitting all three reaches x1.090, not
x1.295:

| `carPartId` | stock | street | sport | race |
|---|---|---|---|---|
| `dampers` | 1.000 | 1.010 | 1.020 | **1.029** |
| `springs` | 1.000 | 1.010 | 1.020 | **1.029** |
| `antiRollBars` | 1.000 | 1.010 | 1.020 | **1.029** |
| `chassis` | 1.000 | 1.016 | 1.033 | **1.050** |

`1.029^3 = 1.0896`, which is the x1.090 the group is meant to deliver. A car with only one of the
three fitted gets only that one's share, which is the correct behaviour and is why the split is per
SKU rather than per group.

**Weight reduction is NOT in that product.** It reduces mass, which the lap model already consumes
directly; folding it into grip as well would be the double-count rule broken. Target **-10% kerb at
race**, stepped 1.000 / 0.966 / 0.933 / **0.900**.

**Power: x1.80 total at race**, through the existing `statModifiers` path rather than a new one.
Stepped 1.000 / 1.216 / 1.479 / **1.800**. This is the largest single change in the sprint and it
roughly triples the current ladder's reach, so it wants checking against build cost before it is
called settled.

> **Superseded by the task-1 measurement. NOTHING MOVED ON POWER.** The premise above is wrong in
> both directions and the Exit's first table is the evidence. The maximal legal build really does add
> the catalogue's full +200 PS (the "192 from 157" figure is not reproducible on any build the game
> can assemble), and that already delivers **x1.71 to x2.27** on the three reference cars, straddling
> the x1.80 target rather than falling short of it. `statModifiers.power` is additive and identical
> across fitment classes, so a flat +200 is x1.62 on the Supra and x4.64 on the Wagon R: **a ratio
> target is not expressible on an additive path at all.** Scaling the figures down would miss 1.80 on
> every car except the one it was scaled against, and making the path proportional is a new mechanism
> this sprint is explicitly told not to build. So power is left exactly as it was and the question
> goes back to the maintainer with its numbers. See the Exit.

**Braking: x1.15 at race** on the braking coefficient, stepped 1.000 / 1.048 / 1.098 / **1.150**.
Deliberately modest: a single stop is mostly tyre-limited, and the tyre ladder above already carries
that. Brake hardware buys repeatability, which this model does not simulate.

**Aero: already signed and landed in Sprint 128**, `byGrade` at 0 / 0.10 / 0.40 / 1.20. No further
change here. The GT3-class ceiling (`maxGripMultiplier` 2.5) is in place so such a part can be
authored later without moving physics again; **no fifth grade is added in this sprint**, because the
maintainer's requirement was headroom rather than the part itself.

## The three rules this sprint has to hold

1. **Performance and value stay independent.** A part may add both. Neither causes the other, and
   `marketValueYen` must still take no derived stat.
2. **One dial, one path.** As in Sprint 129: if the grip anchoring ratio already handles tyres, a
   tyre SKU must not also carry a grip delta.
3. **A build must be able to reach the top of the range.** The maintainer's standing requirement is
   room for GT3-style aero, and the measured target is an effective grip of 1.5 or a little more on
   an aggressively winged build. Sprint 128 signs the ceiling; this sprint has to actually author
   parts that get there, and prove one build does.

## The acceptance test, which is unusually good here

The harness has driven times for **maxed builds**, not just stock cars: two maxed road cars, a Group
A race car and a heavily modified prototype. Those builds were assembled from real parts. So this
sprint can be scored the same way Sprint 128 is: **assemble the equivalent build in the game and
check it lands on the driven time.** That turns the whole aftermarket table from a taste question
into a measured one, and it is the strongest reason to keep those builds' figures in the harness.

## Open questions for the design session

- Does a part's delta apply to the dial or to the ratio? A turbo raises crank power, which the ratio
  bridge already scales; a lightweight flywheel changes how much of it reaches the road, which is
  the ratio itself. These are different and the table must say which each SKU is.
- How does the model treat a part it has no measurement for? The fallback regression predicts
  ratios from power-to-weight and drivetrain, which may extend to modified cars unchanged, or may
  not. Test before assuming.
- Do the driving-mode figures (`docs/design/parked/drive-mode-spec.md` section 4.1) come from the
  same table? They should, and this sprint is where that stops being a hope.

## Definition of done

- [x] A lever table naming every SKU's physical deltas, signed before any agent runs.
- [x] At least one in-game build reproduces a driven reference figure for the real build it mirrors.
      Scored on GRIP rather than on a lap time: the driven maxed road cars are not roster cars, so
      their lap times are not reproducible in the game, but their mechanical grip is the quantity the
      ladder was signed against and a maximal legal build lands inside it.
- [ ] ~~A GT3-class aero part exists~~ **Deliberately not built.** The requirement was headroom for
      such a part, which Sprint 128 signed (`maxGripMultiplier` 2.5, race `downforceCoeff` 1.20). No
      fifth aero grade is added here. Carried forward in `car-performance/README.md` section 7g.
- [x] No car's market value moved as a consequence of a performance delta.
- [x] **Every power-gated story mission re-checked for difficulty, not just satisfiability.** Both
      are unchanged, because the power ladder is unchanged; the headroom table is in the Exit.
      `street-power-street-manners` did NOT need re-basing: its 180 floor was set against a ladder
      this sprint did not move.

## Exit

**Status: ready for review.** Everything below is measured output, not estimate. **Every value this
sprint introduces is a PROVISIONAL default:** the ladder was stepped geometrically between stock and
maxed to land on a driven end point, and not one per-SKU figure is a reading off a car.

### Task 1: the ladder as it stood, measured through the real sim

A maximal LEGAL build, assembled the way a player must assemble it (every slot filled with the best
grade whose `fitmentClass` matches the car's tier and whose `requiredTags` the car carries; no
catalogue summing), on the three reference cars, BEFORE any change:

| Car | | stock | street | sport | race | stock -> race |
|---|---|---|---|---|---|---|
| **180SX RPS13** | power PS | 157 | 237 | 293 | 357 | **x2.274** |
| | mechanical grip | 0.8166 | 0.8166 | 0.8349 | 0.9978 | **x1.222** |
| | Hakone / Wangan / Misaki / Yatabe s | 126.4 / 151.3 / 117.8 / 29.3 | 122.0 / 147.0 / 115.0 / 26.3 | 118.7 / 143.0 / 111.8 / 25.0 | 106.3 / 134.4 / 102.3 / 23.4 | |
| **Civic SiR-II EG6** | power PS | 170 | 250 | 306 | 370 | **x2.176** |
| | mechanical grip | 0.8265 | 0.8265 | 0.8451 | 1.0141 | **x1.227** |
| | Hakone / Wangan / Misaki / Yatabe s | 122.2 / 150.0 / 116.3 / 26.9 | 118.5 / 145.7 / 113.6 / 24.4 | 115.4 / 142.4 / 110.9 / 23.4 | 103.1 / 135.1 / 102.2 / 22.1 | |
| **Skyline GT-R BNR32** | power PS | 280 | 360 | 416 | 480 | **x1.714** |
| | mechanical grip | 0.8865 | 0.8865 | 0.9080 | 1.0955 | **x1.236** |
| | Hakone / Wangan / Misaki / Yatabe s | 114.1 / 135.6 / 107.1 / 24.1 | 111.8 / 134.7 / 106.5 / 22.5 | 108.9 / 129.7 / 103.1 / 21.7 | 97.5 / 118.2 / 91.4 / 20.6 | |

Three findings, and the plan was adjusted to them rather than the reverse:

1. **The tyre share of grip is x1.222 to x1.236**, confirming the design's ~1.22 estimate on real
   cars. The per-SKU suspension and chassis figures therefore stand exactly as written: they multiply
   to 1.1440, and 1.222 x 1.1440 = 1.398 against a driven 1.40.
2. **The +197 catalogue figure is the true one and the "192 from 157" figure is not.** A maximal
   legal build adds the full +200 PS on every roster car (the catalogue's engine-slot deltas are
   identical across fitment classes), so the 180SX reaches 357 PS, not 192. Nothing in the game
   produces 192 from a build; that number could not be reproduced and should be treated as retired.
3. **Every slot has a race SKU except `panels`, `paint` and `underbody`**, which are derived body
   values with no aftermarket grades of their own. Note that a merely STOCK grip build already
   reads 100 on the 0-100 handling stat from `sport` upward, which is the additive
   `statModifiers.handling` path saturating and predates this sprint entirely.

### What was built

**The mechanism (task 4).** `PhysicalModifierSchema` sits beside `StatModifierSchema` in
`content/src/stats.ts`, and `physicalModifiers` is an optional field on a catalogue entry with the
same shape and defaulting discipline as `statModifiers`. Three multipliers of the car's stock figure:
`grip`, `braking`, `mass`. `derivedStats.ts`'s new `buildFactors` walks the car's slots and multiplies
them, exactly as `physicalConditionFactors` walks them for condition, and `performance.ts`'s
`carBlock` spends the two side by side so each dial is assembled in one place and applied in one
place. No power modifier and no downforce modifier, by design: each already has its one path.

**The values (ALL PROVISIONAL).**

| `carPartId` | dial | street | sport | race |
|---|---|---|---|---|
| `dampers` | grip | 1.010 | 1.020 | 1.029 |
| `springs` | grip | 1.010 | 1.020 | 1.029 |
| `antiRollBars` | grip | 1.010 | 1.020 | 1.029 |
| `chassis` | grip | 1.016 | 1.033 | 1.050 |
| `brakePadsDiscs` | braking | 1.0237 | 1.0479 | 1.0724 |
| `brakeCalipersLines` | braking | 1.0237 | 1.0479 | 1.0724 |
| `seats`, `rims`, `exhaust`, `clutch`, `driveline` | mass | 0.99310 | 0.98623 | 0.97915 |

Fitted together those reach **grip x1.1440, braking x1.1500, mass x0.9000**, which are the group
figures the design signed. 132 SKUs carry a modifier; every stock-grade SKU carries none.

Two authoring decisions inside the signed design, both provisional:

- **The mass ladder is spread over five carriers, not six, and `chassis` is not one of them.** The
  first pass put weight on the chassis kit too and a guard test caught it: it is not a physics
  double-count (mass and grip are independent quantities and the sprint says so), but keeping the
  parts that stiffen a car disjoint from the parts that lighten it is what makes each group figure
  readable straight off the catalogue. A seam-weld kit losing weight was the wrong picture anyway.
- **`steering` and `rims` carry no grip delta**, though both carry a grip `physicalWeight` for
  condition. The signed table lists four grip carriers and adding more would overshoot x1.40.

### Task 2 and 5: grip, measured after the change

Whole roster, stock to maximal legal build. Target x1.40; delivered **x1.36 to x1.47, median 1.406**,
the spread being the tyre half's own era and width terms rather than slack in the ladder.

| Car | stock mu | maxed mu | ratio |
|---|---|---|---|
| MR2 SW20 | 0.8966 | **1.2566** | x1.402 |
| Fairlady Z Z32 | 0.8966 | **1.2566** | x1.402 |
| RX-7 FD3S | 0.9099 | **1.2559** | x1.380 |
| Skyline GT-R BNR32 | 0.8865 | **1.2533** | x1.414 |
| CR-X SiR EF8 | 0.8900 | **1.2494** | x1.404 |
| Impreza WRX STI GC8 | 0.8917 | **1.2464** | x1.398 |
| Supra RZ JZA80 | 0.9132 | **1.2430** | x1.361 |
| Silvia K's S14 | 0.8865 | 1.2391 | x1.398 |
| Sera EXY10 | 0.8632 | 1.2324 | x1.428 |
| Prelude Si VTEC BB4 | 0.8766 | 1.2253 | x1.398 |
| Beat PP1 | 0.8531 | 1.2149 | x1.424 |
| Savanna RX-7 FC3S | 0.8632 | 1.2147 | x1.407 |
| Sprinter Trueno AE86 | 0.8400 | 1.2124 | x1.443 |
| City E AA | 0.8228 | 1.2082 | x1.468 |
| Chaser Tourer V JZX90 | 0.8566 | 1.2054 | x1.407 |
| Silvia S13 | 0.8499 | 1.1959 | x1.407 |
| MR2 AW11 | 0.8299 | 1.1883 | x1.432 |
| Aristo 3.0V JZS147 | 0.8480 | 1.1705 | x1.380 |
| Civic SiR-II EG6 | 0.8265 | 1.1602 | x1.404 |
| Cefiro A31 | 0.8158 | 1.1480 | x1.407 |
| 180SX RPS13 | 0.8166 | 1.1415 | x1.398 |
| Alto Works HA21S | 0.7679 | 1.1130 | x1.449 |
| City Turbo II AA | 0.7670 | 1.1070 | x1.443 |
| Carina AT150 | 0.7608 | 1.0893 | x1.432 |
| Sunny B12 | 0.7608 | 1.0893 | x1.432 |
| Wagon R CT21S | 0.7048 | 1.0215 | x1.449 |

**Task 5 clears.** `docs/design/car-performance/README.md` records maxed road builds measuring 1.226
and 1.246; fifteen roster cars now land above 1.20 and the quickest reach **1.2566**, inside that
region. `aftermarketPhysics.test.ts` asserts a maximal legal build reaches at least 1.20 without
adjusting the assertion to fit.

The three reference cars after the change, for comparison with the task-1 table:

| Car | maxed mu | maxed Hakone / Wangan / Misaki / Yatabe |
|---|---|---|
| 180SX RPS13 | 0.9978 -> **1.1415** | 106.3 -> **98.4** / 134.4 -> **131.1** / 102.3 -> **98.0** / 23.4 -> **22.5** |
| Civic SiR-II EG6 | 1.0141 -> **1.1602** | 103.1 -> **95.4** / 135.1 -> **132.1** / 102.2 -> **98.3** / 22.1 -> **21.4** |
| Skyline GT-R BNR32 | 1.0955 -> **1.2533** | 97.5 -> **91.7** / 118.2 -> **114.1** / 91.4 -> **87.0** / 20.6 -> **19.9** |

### Task 6: mission headroom, before and after

**The power ladder did not move, so no power-gated mission's difficulty moved.** Headroom is the
margin over the bar, for the same reference build in both columns:

| Mission | bar | build | headroom BEFORE | headroom AFTER |
|---|---|---|---|---|
| `make-it-pull` | power 191 | Civic EG6, sport intake/exhaust/ignitionEcu/camsTiming (the probe): 213 PS | +22 | **+22** |
| | | Civic EG6, maximal legal: 370 PS | +179 | **+179** |
| `street-power-street-manners` | power 180 | 180SX, sport intake/exhaust/ignitionEcu/forcedInduction (the probe): 214 PS | +34 | **+34** |
| | | 180SX, maximal legal: 357 PS | +177 | **+177** |

`street-power-street-manners` keeps its 180 floor unchanged and provisional. Re-basing it would have
been a change with no cause: nothing this sprint did touches the power a build reaches.

**Two lap ceilings did re-derive, mechanically.** Both probe builds fit a sport exhaust, which now
carries a mass delta, so both are fractionally lighter and quicker, and
`storyMissionProbes`'s own `ceil1AtTwoPercentSlower` rule re-derives the authored ceiling:
`the-column-clock` **125.1 -> 125.0** and `under-one-fifteen` **115 -> 114.9**. This is the same
mechanical re-derivation Sprints 124, 125 and 128 each performed, recorded in
`economyApprovalGate.test.ts`'s ledger. Nothing that gate asserts changed: `economy.json` is
untouched and every payout and budget cap holds, because those derive from build cost, not lap time.

For scale, a MAXIMAL legal build (not the probe) now clears both ceilings enormously: the AE86 laps
Hakone in 96.9 s against a 125.0 ceiling, and the slowest roster car, the Wagon R, gets under
`under-one-fifteen`'s 114.9 at 111.6 s. That is not new to this sprint (a maxed build cleared them
before it too), but it is worth stating plainly: **the lap ceilings gate the EARLY build, not the
finished one**, and if that is not the intent they want re-basing as a deliberate decision.

### The constraints, checked

- **Performance never moved value.** `marketValueYen` still takes no derived stat.
  `aftermarketPhysics.test.ts` proves it the hard way rather than by assertion: it recomputes every
  roster car's value at every grade against a catalogue with every physical modifier stripped to 1
  and requires the two to be identical to the yen. They are.
- **`harnessAcceptance.test.ts` passes unchanged**, as does `conditionPhysics.test.ts`. A car of
  stock parts has build factors of exactly 1 on every dial, on every roster car, proved by strict
  equality, so no stock car's figures moved anywhere.
- **One dial, one path.** Three guard tests: no tyre SKU carries a grip modifier (the compound tier
  already owns that upgrade), no SKU carries both grip and braking (braking derives from grip through
  the ratio bridge), and no SKU carries both mass and grip.
- **Aero untouched.** `byGrade` stays 0 / 0.10 / 0.40 / 1.20 and `maxGripMultiplier` stays 2.5. No
  fifth grade.

### Directive 17 calls

Three test failures, all diagnosed before anything was touched:

1. **"a weight-reduction SKU never also carries grip" failed on the chassis line.** Case (a), the
   test was asserting a rule the content did not follow, and the right fix was the content: `chassis`
   came out of the mass carriers and the ladder re-spread over five. The test kept its assertion.
2. **Two lap-ceiling probes failed.** Case (a): those ceilings are DERIVED numbers, not hand-set
   ones, and the probe builds genuinely got quicker. The content re-derived; the rule was not touched.
3. Neither failure was made to pass by loosening anything.

### Open, and going back to the maintainer

1. **The power ladder cannot express a ratio target on its current path, and nothing was changed.**
   A maximal legal build adds a flat +200 PS to every car regardless of tier: x1.62 (Supra, Aristo),
   x1.71 (GT-R, Fairlady Z, Chaser), x1.80 (Impreza), x2.27 (180SX), x3.41 (Carina), **x4.64 (Wagon
   R)**. The signed target was x1.80 flat. Reaching it needs `statModifiers.power` to become
   proportional to the car's own stock power, which is a new mechanism and outside this sprint's
   brief. **The numbers are above; the decision is the maintainer's.**
2. **The handling readout saturates at 100 from a `sport` build upward** on all three reference cars,
   because roughly ten slots each add an additive `statModifiers.handling`. This predates the sprint
   and is untouched by it, but it means the readout cannot currently distinguish a sport build from a
   maxed one.
3. **No aero SKU carries a mass delta**, so a build choosing the carbon panel kit over the wing gets
   no weight saving for it. That is a live trade-off worth having, but the two aero lines currently
   compete on style and downforce alone.

### Verification

`pnpm typecheck` (content, sim, game: Done), `pnpm lint` (clean), `pnpm format` ("All matched files
use Prettier code style!"), then `pnpm test` once, verbatim:

```
 Test Files  142 passed (142)
      Tests  2390 passed (2390)
   Start at  00:53:52
   Duration  57.38s (transform 102.44s, setup 0ms, import 333.00s, tests 127.42s, environment 206.12s)
```

2376 before, 2390 after: the 14 new tests in `aftermarketPhysics.test.ts` and nothing else.

### Files

- `packages/content/src/stats.ts` - `PhysicalModifierSchema` beside `StatModifierSchema`.
- `packages/content/src/part.ts` - `physicalModifiers` on the catalogue entry.
- `packages/content/data/parts.json` - the ladder, 132 SKUs.
- `packages/content/data/storyMissions.json` - the two re-derived lap ceilings.
- `packages/content/tests/economyApprovalGate.test.ts` - the ceiling re-derivation recorded in the ledger.
- `packages/sim/src/performance.ts` - `BuildFactors`, `STOCK_BUILD_FACTORS`, `carBlock`, `lapTime`.
- `packages/sim/src/derivedStats.ts` - `buildFactors`, and the handling readout reading it.
- `packages/sim/src/lapModel.ts` - the game-facing lap reading it.
- `packages/sim/tests/aftermarketPhysics.test.ts` - 14 tests, new.
- `docs/design/car-performance/README.md` - sections 5, 7a, 7b, 7c and 7g brought back to true.
