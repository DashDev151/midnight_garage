# The power ladder, parts and machining

**Status: APPROVED (maintainer, directive 22).** The ladder, the per-slot parts figures, the nine
operations and their support contributions are all signed. Replaces the preliminary figures in
`machining-system.md`, which were an investigation rather than content.

**One condition attaches to the approval: the implementing sprint must re-validate the power
simulation model**, not merely check that the numbers add up.

## The ladder

The maintainer set the target on the 2JZ: a fully built race-spec turbo makes about **750 PS on
pump fuel**, against 324 stock. That is x2.3 for parts and x2.6 fully machined.

Everything else follows from **one rule: machining on a stock part is worth half the street step,
and it scales with the grade of the part being machined** (stock 1.0, street 1.0, sport 1.25, race
1.5). A better part can use more of what machining unlocks.

That rule reproduces the maintainer's eight forced figures exactly and generalises to the other two
characters without inventing anything: half of forced's +40 street step is +20, and 20 x 1.0 / 1.0
/ 1.25 / 1.5 gives +20 / +20 / +25 / +30, which is the ladder as given.

| build | high-strung-na | lazy-na | forced |
| --- | ---: | ---: | ---: |
| stock | x1.000 | x1.000 | x1.000 |
| stock machined | x1.080 | x1.105 | **x1.200** |
| street | x1.160 | x1.210 | **x1.400** |
| street machined | x1.240 | x1.315 | **x1.600** |
| sport | x1.300 | x1.400 | **x1.800** |
| sport machined | x1.400 | x1.531 | **x2.050** |
| race | x1.450 | x1.600 | **x2.300** |
| race machined | x1.570 | x1.758 | **x2.600** |

**Machining never skips a grade**, on any character: a machined part always sits below the next
grade up. That is what keeps the money ladder meaningful while machining stays worth doing.

**It is guaranteed at the bottom and tuned at the top, and the difference matters.** Stock-machined
below street falls out of the rule for free, since the base is half that very step. Sport-machined
below race only holds because 1.25 times the base is smaller than the sport-to-race step, and on
high-strung NA that is **1.400 against 1.450, a margin of 0.05**. It is pinned by test, not
structural. **Anyone compressing the NA grade steps later must re-check it**, because the property
is not free up there.

On the Supra RZ (324 PS): stock machined 389, street 454, street machined 518, sport 583, sport
machined 664, race 745, race machined 842.

## Why the NA ceilings are so much lower

A turbo car gains from boost, and machining is largely what permits more of it. A naturally
aspirated engine has to find its power in airflow and compression, and a high-strung one has
already had most of that taken by the factory. x1.45 for a fully built high-strung NA and x1.60 for
a lazy one are the honest ceilings; **the forced ceiling of x2.30 is not generosity, it is what a
2JZ actually does.**

## The parts, per slot

Percentage of the car's own stock power, added by the fitted part. Additive and independent, as
every part already is.

On the two NA characters the `forcedInduction` row is a **conversion**, so it sits outside the
fitted total and outside the ladder. That is the shipped convention rather than a new one:
`proportionalPower.test.ts` caps an NA character with no turbo fitted (x1.45 and x1.60) and
pins the bolt-on-turbo build as its own separate figure (x1.65 and x1.88).

**The street and sport rows are not a uniform rescale of race, and that is load-bearing.** Each
slot keeps its own grade shape, because the catalogue's price ladders are bespoke per slot (the ECU
runs x8.67 to race, the turbo x6.5, cams x4.5, everything else x3) and a flat power shape against a
bespoke price shape puts one part far ahead on power per yen. An earlier uniform rescale did exactly
that: it made a street ECU 2.1 times the power per yen of anything else on a boosted car, which is
the one-correct-first-purchase defect `partPricing.test.ts` exists to catch.

The turbo's own column is pinned to its price ladder's ratios first and the other seven slots absorb
the slack. **Every race figure, every ladder total and the 101-of-130 shape are exactly as
approved**; street and sport move, and so do the NA conversion rows, the largest single move being
8.3 points on the turbo's forced sport figure.

### high-strung-na

| slot | street | sport | race |
| --- | ---: | ---: | ---: |
| `forcedInduction` (conversion) | 4.0 | 9.0 | 20.0 |
| `block` | 5.1 | 8.5 | 13.0 |
| `camsTiming` | 2.8 | 6.9 | 11.0 |
| `headValvetrain` | 3.7 | 6.5 | 9.0 |
| `exhaust` | 1.8 | 3.1 | 4.0 |
| `internals` | 1.6 | 2.6 | 4.0 |
| `ignitionEcu` | 0.5 | 1.6 | 3.0 |
| `intake` | 0.5 | 0.8 | 1.0 |
| **fitted total, no conversion fitted** | **16.0** | **30.0** | **45.0** |

### lazy-na

| slot | street | sport | race |
| --- | ---: | ---: | ---: |
| `forcedInduction` (conversion) | 5.6 | 12.6 | 28.0 |
| `block` | 6.1 | 10.2 | 16.0 |
| `camsTiming` | 3.9 | 8.9 | 14.0 |
| `headValvetrain` | 4.3 | 7.9 | 11.0 |
| `exhaust` | 2.5 | 4.6 | 6.0 |
| `internals` | 2.0 | 3.2 | 5.0 |
| `ignitionEcu` | 0.7 | 2.7 | 5.0 |
| `intake` | 1.5 | 2.5 | 3.0 |
| **fitted total, no conversion fitted** | **21.0** | **40.0** | **60.0** |

### forced

| slot | street | sport | race |
| --- | ---: | ---: | ---: |
| `forcedInduction` | 10.0 | 22.5 | 50.0 |
| `ignitionEcu` | 5.6 | 19.5 | 33.0 |
| `exhaust` | 10.1 | 15.3 | 18.0 |
| `headValvetrain` | 4.1 | 6.4 | 8.0 |
| `intake` | 4.7 | 6.4 | 7.0 |
| `camsTiming` | 2.3 | 4.3 | 6.0 |
| `internals` | 1.6 | 2.8 | 4.0 |
| `block` | 1.6 | 2.8 | 4.0 |
| **fitted total** | **40.0** | **80.0** | **130.0** |

**Read the forced street column against the race one.** The exhaust gives 10.1 of the 40 at street
and only 18 of the 130 at race, while the turbo gives 10.0 and then 50. That is the shape of tuning
a turbo car: bolt-ons first, then the turbo itself is what takes it somewhere. The uniform rescale
flattened exactly this and broke the guards for it.

**The shape is the point.** A turbo car finds 101 of its 130 points in the turbo, the ECU and the
exhaust, and almost nothing in the block. An NA car finds its power the opposite way round, in the
block, the cams and the head. Machining follows that, which is why it is worth so much more on a
turbo engine and why it is not a bug that it is.

## Machining

**Base is half the street step**, applied to a stock part, and it scales with the grade of the part
being machined.

| character | base on a stock part | grade multiplier |
| --- | ---: | --- |
| high-strung-na | +8.0% | stock 1.0, street 1.0, sport 1.25, race 1.5 |
| lazy-na | +10.5% | as above |
| forced | +20.0% | as above |

**Machining a better part is worth more**, because the surrounding hardware can use what it
unlocks. That is the 1.25 and 1.5.

### Per slot, on a stock part

| slot | high-strung-na | lazy-na | forced |
| --- | ---: | ---: | ---: |
| `headValvetrain` | 1.95 | 2.51 | **7.27** |
| `camsTiming` | 2.38 | 3.20 | **5.45** |
| `block` | 2.81 | 3.65 | 3.64 |
| `internals` | 0.86 | 1.14 | 3.64 |

## The operations, revised

**Thirteen becomes nine.** At a flat 5 labour an operation, several of the preliminary list were
too small to be worth doing: journal polishing was worth 0.17 per cent on a high-strung NA engine,
which nobody would spend a labour slot on. **An operation that is not worth its labour is dead
content**, so the small ones are consolidated into the job a machinist would actually quote.

| # | operation | slot | hs-na | lazy-na | forced | spec | auth |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Port and polish | `headValvetrain` | 1.17 | 1.51 | **6.18** | - | 0.70 |
| 2 | Milling / skimming | `headValvetrain` | 0.49 | 0.63 | **0.00** | - | 0.60 |
| 3 | Multi-angle valve job | `headValvetrain` | 0.29 | 0.38 | 1.09 | - | 0.10 |
| 4 | Bore and hone | `block` | 1.69 | 2.19 | 2.18 | 0.15 | 0.90 |
| 5 | Decking | `block` | 1.12 | 1.46 | 1.46 | 0.20 | 0.70 |
| 6 | O-ring the deck | `block` | **0** | **0** | **0** | 0.35 | 1.00 |
| 7 | Balance and polish | `internals` | 0.86 | 1.14 | 3.64 | 0.20 | 0.50 |
| 8 | Con-rod shot peening | `internals` | **0** | **0** | **0** | 0.25 | 0.25 |
| 9 | Cam regrind | `camsTiming` | 2.38 | 3.20 | **5.45** | - | 0.80 |
| | **total on a stock engine** | | **8.00** | **10.50** | **20.00** | | **5.55** |

**The authenticity column is a copy for reading alongside the power figures. The values live in
`economy.json` under `machining.operations[].authenticityCost`**, which is the single source, and
`machiningCost(car)` sums them. The six operations added outside the engine (`race-prep`,
`corner-weighting`, `show-fitment`, `sorting`, `blueprint-building`, `period-correct-restoration`)
carry their own costs there and are not in this table, which is the engine machine shop's.

The ordering is the argument: the operations a restoration shop performs on a numbers-matching
engine sit at the cheap end, and the ones that prepare a block for boost sit at the dear end.

**It is charged on stock-grade parts only.** Authenticity asks how much of the car is still what
left the factory, and an aftermarket part already lost its slot's whole weight the moment it was
fitted. Boring a race block does not make it less factory than it already was, and charging for it
would book the same loss twice. **So machining an original block costs well under a point per
operation against the slot's own 18.18; machining a race block costs nothing, because that slot has
nothing left to lose.**

This is what makes the restoration route the interesting one. A player keeping the car's own
castings pays in originality for every point of power. A player who has already fitted aftermarket
has bought their way out of that conversation.

"Balance and polish" is a merge of three jobs, and it is rated for the knife-edged crank a purist
would spot rather than for the balancing, which nobody would.

**A fully machined engine on its own original castings costs 5.55 of the car's 100 authenticity
points, taking a stock mint car to 94.** That is the character of the feature in one number: the
originality it takes is real and small, because the parts are still the car's own. **Machining the
whole block costs 2.6 against the 18.18 that binning it for a race block costs**, which is the
relationship the mechanic exists to express. On an already-aftermarket engine the same work costs
nothing further, because those slots were spent when the parts went in.

Rounded to a hundredth, so the lazy-na column sums to 10.51 against an exact 10.50; the per-slot
allocation above carries the exact figure.

**What was merged and why:**

- **Deshrouding folded into port and polish.** Both are a cylinder head on a bench having metal
  taken out of it for airflow. Nobody quotes them separately.
- **Journal polishing and knife-edging folded into "balance and polish".** The rotating assembly
  comes out as one job and goes back as one job. Separately they were 0.17 and 0.34 per cent.
- **Flywheel lightening cut.** Zero power on every character (the model has no rotational inertia),
  and it belongs to the parked weight-reduction work.

**Two operations carry no power at all** and exist entirely for support: O-ringing the deck and
con-rod shot peening. That is what they are for on a real engine and it is what stops machining
being paid twice for one job.

**Milling is zero on forced.** Raising static compression is what you do *instead* of running
boost, not as well as it. Its share moves to port and polish on that character, which is why the
forced figure there is 6.18 rather than 4.36.

## Support

`spec` uses the same scale as `specByGrade` (stock 0, street 0.25, sport 0.6, race 1.0) and is
**added to** whatever the fitted part's grade already contributes.

| slot | fully machined, stock part | a street part | a sport part | a race part |
| --- | ---: | ---: | ---: | ---: |
| `block` | 0.70 | 0.25 | 0.60 | 1.00 |
| `internals` | 0.45 | 0.25 | 0.60 | 1.00 |

**A fully machined stock block never out-supports a race one**, which is the comparison that
matters, but it does beat a sport part (0.70 against 0.60). That is correct rather than an
oversight: three separate operations on a block, one of which exists solely to let a head gasket
survive boost, should out-support a single bought part two rungs down.

A fully machined **race** block contributes 1.70, which is headroom rather than a stat: the support
model only asks whether supply meets demand.

**This is the only thing that makes operations 6 and 8 exist.** A machined stock part carries grade
`stock`, whose `specByGrade` is 0, so without an operation's own spec contribution those two jobs
would be literally inert.

## Which slots can be machined at all

**Four: `block`, `internals`, `headValvetrain`, `camsTiming`.** Machining is metal coming off the
engine's own castings, and those are the four slots that hold them.

Deliberately excluded, with reasons, so nobody adds them by accident:

- **`intake` and `exhaust`**: port-matching a manifold is real, but these are bolt-on slots where
  the answer is a better part, and on an NA engine the gain is a fraction of a per cent.
- **`forcedInduction`**: clipping a compressor wheel is real and is exactly the same idea, but a
  turbo is the one slot where buying the bigger one IS the mod.
- **`chassis`**: seam welding is genuinely machining-shaped and genuinely valuable, but it is
  stiffness rather than power, so it belongs with the chassis support model rather than here. Worth
  revisiting once that has been played.
- **Everything else**: a machinist does not touch it.

## What the maintainer should look at again

**The catalogue's fractions rise on all three characters**, not only on forced: high-strung race 43
to 45, lazy 57 to 60, forced 95 to 130. `TODO.md` forbids the forced rise by name; that is approved
and the ban is struck in the implementing sprint.

### The flat-rise ruling (maintainer, 2026-08-02)

`TODO.md` argued that a flat rise in the forced fractions is the wrong lever, because it corrects
two cars and inflates five, and asked for per-engine headroom instead. **The maintainer has ruled:
the flat shape ships, and these are the numbers it produces.**

| car | race | race machined |
| --- | ---: | ---: |
| Supra RZ (2JZ) | 745 | 842 |
| Skyline GT-R (RB26) | 644 | 728 |
| **RX-7 FD** | **587** | **663** |
| **Impreza WRX STi** | **575** | **650** |
| **MR2 SW20** | **561** | **634** |

The two cars the target was set on land where it wanted them. **The three in bold land above the
figures that entry rejected, and that is accepted rather than unresolved.** A 587 PS race-spec FD is
a serious build and defensible on its own terms.

Per-engine headroom remains the tool that would separate them, and remains unbuilt. It would take
authoring for all 94 roster rows under directive 24, which is a sprint of its own and not this one.
**This ruling closes the question rather than deferring it**: the `TODO.md` entry is struck in the
implementing sprint and does not survive as a live objection.

**The implementing sprint must re-validate the power model** against the lap and performance
harness, not merely check the arithmetic.
