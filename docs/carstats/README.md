# The five car stats

Every car in the game is described to the player by five numbers: **power, handling, reliability,
style, authenticity**. This folder holds one file per stat, and each one says exactly what feeds
that number, in the code as it actually runs rather than as any design doc describes it.

| stat | what it means | file |
| --- | --- | --- |
| power | what the engine makes, in PS | [power.md](power.md) |
| handling | how much grip the car can use | [handling.md](handling.md) |
| reliability | whether it will get home | [reliability.md](reliability.md) |
| style | whether the scene wants to look at it | [style.md](style.md) |
| authenticity | how much of it is still the car that left the factory | [authenticity.md](authenticity.md) |

All five live on `StatBlock` and all five are computed by `computeDerivedStats` in
`packages/sim/src/derivedStats.ts`. That function is the single entry point; if something claims to
move a stat and does not reach that file, it does not move the stat.

## What they are for

**Buyers.** Each buyer weights the five differently through its own taste model, and a car's price
to a given buyer is a match between what they want and what the car is. A stat that no buyer
weights is decoration.

**Not value.** `marketValueYen` reads **no derived stat at all**. A car is never worth more because
it is faster. This surprises almost everyone who reads the code for the first time, and it is
deliberate: performance and price are independent axes, and any change that couples them is a
design error rather than a feature.

## What they share

**Scale.** Four of the five are integers clamped to 0-100. **Power is the exception**: it is a PS
figure with no clamp, and it can exceed a car's stock output by nearly double.

**Condition reaches all five, but by three different routes**, and conflating them is the most
common mistake:

| route | what it governs | where |
| --- | --- | --- |
| `bands.bandFactors` | the value-side curve: mint 1.00, fine 0.85, worn 0.65, poor 0.40, scrap 0.15 | power, style, authenticity, and the condition means of all five |
| `statFormulas.condition.bandFactor` | the four physical dials: grip, braking, driveline, downforce | handling, through the physics |
| `statFormulas.condition.gradeBandFactor` | what an installed SKU's own `physicalModifiers` still deliver, per part grade | handling only |

**Per-slot weights.** Each stat has its own column in `parts-taxonomy.json`'s `statWeights`, and
`weightedBandFactorForStat` averages a car's part bands using that column. A slot's weight decides
how much its condition matters to that stat, **independently of whether a part in that slot can
contribute anything to it**. That independence is the source of several of the surprises below.

**Per-car spec fields.** `reliabilityBase`, `styleBase`, `styleCeiling` and `aeroCeiling` are
authored once per car for all 94 roster rows in `midnight-garage-roster.csv`, which is the single
source of truth. Nothing else may hold a second copy.

## The cross-cutting findings

These emerged from documenting the five separately and only become visible side by side. Each is
recorded in full in its own file.

**Paint is the biggest hole in the model, and it hits two stats at once.** `paint` carries 11 of
authenticity's 100 points and 2 of style's 14 condition weight, and it is **the only slot in the
game with no aftermarket SKU at any fitment class**. So it is pure subtraction on both: bad paint
costs a car an eighth of its style and can drag its authenticity down, and a respray can never win
a point back on either. A resprayed car still reads as wearing its factory colour. Deferred
deliberately and recorded in `TODO.md`, but the cost is larger than one stat's worth.

**A slot's condition weight and its ability to contribute are set independently, and the mismatches
are real.** A big brake kit and a race steering rack move handling by exactly zero on all 26 cars
while both slots carry handling weight. Six slots hand over 38 race-grade style points while
carrying no style condition weight, so a scrap race exhaust delivers its points in full. `block`
and `headValvetrain` make power but carry zero power weight. In the other direction, occupying a
weighted slot puts its band into a denominator whatever the part gives back, so **a part worth zero
power can cost real power as it wears**.

**Fitting a body kit charges twice.** The carrier swap leaves every panel zone bare, so the `paint`
band re-derives to `poor` and drags both the style and authenticity condition factors down on top
of the stockness loss the kit already costs. Measured: authenticity 100 to 83 where stockness alone
predicts 89, and style 92 to 84 on a dressed EG6. The two are unconnected in the UI, and the second
charge is invisible.

**Support does not gate power.** An unsupported build makes its full power and becomes unreliable
instead. Measured twice, independently: a Supra at `dangerous` support makes 632 PS and the
identical build fully supported makes exactly 632 PS; and on a 180SX, adding six race support parts
to the wrong subsystems left headline, power and reliability all bit-for-bit unchanged. Only
reliability moves, and only when the support that moves is the weakest link.

**Reliability's condition factor is usually decided by its worst part alone, and repairs to
anything else do nothing.** The severity ceiling, not the weighted mean, governs almost every
damaged car: one part at `poor` or `scrap` caps the whole car between 0.90 and 0.40 of its base
while the mean (0.94 to 0.99 for a single defect) is simply discarded. **It does not stack**, so
three poor light parts cap identically to one, and repairing them while a heavier part is still
poor moves the number by exactly zero. A player who fixes three things and sees no change is not
imagining it.

**Style and performance correlate more than the design intends.** The formula is fully orthogonal
and reads no performance figure at all, but the authored columns are not: `styleBase` against
PS/tonne is r 0.69 across the shipped cars, `styleCeiling` r 0.77. Most of it is price rather than
speed (the partials fall to 0.16 and 0.30 holding price constant), and real counterexamples exist,
but on the cars a player actually meets the two axes partly rank together.

**The design docs have drifted from the code in a dozen places**, each recorded as a finding in the
relevant file. `tuning-system.md` describes style as additive and cites a retired lever, shows one
NA power column where the code has two, and calls the ECU a threshold that unlocks other parts when
no unlock exists. `economy.ts`'s own comment on `styleSaturationPoints` describes ten slots and 88
points against a measured twelve and 108. Where a doc and the code disagreed, these files document
the code.

## How to use these files

Each stat's file gives the real formula with its file and symbol named, a plain-language reading,
every input with its size and scope, the true bounds and what it takes to reach them, what does
**not** affect the stat where a reader would assume otherwise, where the content levers live, and
its own findings.

They describe what the code does today. When the code changes, these change with it, and a claim
here that no longer holds is a bug in this folder.
