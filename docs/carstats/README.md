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

**Not value, and the distinction is finer than it first looks.** `marketValueYen` reads **no derived
stat at all**. A car is never worth more *because* it is faster, and any change that couples the two
is a design error rather than a feature.

**But a fast car is usually worth more, and that is not a contradiction.** Making a car faster means
fitting better parts, and better parts are worth more money in their own right: `installedPartsValueYen`
credits what is bolted to the car, quite separately from what it does. So the parts are a **common
cause** of both, and neither number is reading the other.

That is the shape to hold in mind. **Parts drive power. Parts drive price. Power does not drive
price.** Machining is the same shape again: a machined part makes more power AND is a dearer part,
and the value comes from the second fact rather than the first.

## What they share

**Scale.** Four of the five are integers clamped to 0-100. **Power is the exception**: it is a PS
figure with no clamp, and it reaches x2.60 a car's stock output on a fully machined forced engine.

**Condition reaches all five, but by three different routes**, and conflating them is the most
common mistake:

| route | what it governs | where |
| --- | --- | --- |
| `bands.bandFactors` | the **stat** curve: mint 1.00, fine 0.85, worn 0.65, poor 0.40, scrap 0.15 | power, style, authenticity, and the condition means of all five |
| `statFormulas.condition.bandFactor` | the four physical dials: grip, braking, driveline, downforce | handling, through the physics |
| `statFormulas.condition.gradeBandFactor` | what an installed SKU's own `physicalModifiers` still deliver, per part grade | handling only |

**`bands.bandFactors` is not what a part is worth in yen, and the two are easy to confuse.** It
scales STATS. A part's money value runs on `teardown.resaleBandFactors` (mint 1.00, fine 0.75, worn
0.55, poor 0.10) times `teardown.usedPartSaleFraction` 0.30, so a mint part sells for 30 per cent of
its catalogue price and a poor one for 3. **There is no scrap rung**: `usedPartSaleValueYen` returns
0 for scrap outright, and a scrapped part instead pays `scrapValueYen`, 5 per cent of its STOCK
replacement price rather than a fraction of its own. So a scrap race turbo is worth 5 per cent of a
stock turbo, not 15 per cent of a race one.

**Per-slot weights.** Each stat has its own column in `parts-taxonomy.json`'s `statWeights`, and
`weightedBandFactorForStat` averages a car's part bands using that column. A slot's weight decides
how much its condition matters to that stat, **independently of whether a part in that slot can
contribute anything to it**. That independence is the source of several of the surprises below.

**Support.** Two of the five ask whether the car can cope with what the build makes, about two
different halves of the car, and both models live in `packages/sim/src/support.ts`:

| model | asks | reaches | how |
| --- | --- | --- | --- |
| `supportVerdict` / `coherenceFactorFor` | can the engine's ancillaries take the power it now makes | reliability | five per-subsystem ratios, headline is the weakest link |
| `usableGripFraction` | can the brakes, steering and shell put down the grip it now makes | handling | one proportion of the grip the build GAINED |

Both are exactly neutral on a stock car by construction, both read a fitted part's GRADE rather
than its band, and both are proportional to what the build asks rather than flat. They differ in
where the bill lands, which is worth knowing before reading either: engine support **does not gate
power** (an unsupported build makes every PS and pays in reliability and at the till), while chassis
support takes the grip itself away, so the handling readout and the lap time both fall. Nothing in
either model reaches style or authenticity.

**Machining, the one input that is a property of a physical PART.** Everything else these five read
is a fact about the car (`stockPowerPs`, `aspiration`, `reliabilityBase`) or about a catalogue SKU
(`powerFraction`, `grade`, `statModifiers.style`). `PartInstance.machining` is a list of operations
done to one specific object, and it reaches **three of the five at once**:

| stat | how machining reaches it | where |
| --- | --- | --- |
| power | an operation's own `powerFraction[character]`, scaled by `machining.gradeMultiplier` for the grade of the part machined, inside the same per-slot term the fitted SKU's fraction is in | `computeDerivedStats` |
| authenticity | `machiningCost` sums the operations' ratings, **on stock-grade parts only** | `authenticityPercentOf` |
| reliability | twice: a flat `reliabilityCostPerOperation` per operation inside the build-intensity factor, and an operation's own `spec` lifting its slot's support contribution | `reliabilityIntensityFactor`, `slotContribution` |

It reaches **neither style nor handling**, and that was verified by measurement rather than assumed:
on all 26 shipped cars, at stock grade and at race grade, applying all nine operations left both
stats identical in 52 of 52 cases each.

Because the record lives on the instance rather than on the car's slot, all three effects **travel
with the part**: pull a machined block off a car and that car is original again, fit it to another
and the second car carries the power and the loss.

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
are real.** Six slots hand over 38 race-grade style points while carrying no style condition
weight, so a scrap race exhaust delivers its points in full. `block` and `headValvetrain` make
power but carry zero power weight. `rims` and `chassis` move handling while carrying no handling
weight at all. In the other direction, occupying a weighted slot puts its band into a denominator
whatever the part gives back, so **a part worth zero power can cost real power as it wears**.

**The brakes-and-steering case is the one that closed.** Both slots carried handling condition
weight while no SKU in either could contribute a point, which read as an authoring slip. It was
not: they are SUPPORT. Measured now, on an unsupported race build, both brake slots are worth 5 to
9 handling points and a race steering rack 4 to 7, on every one of the 26 cars, and the first brake
part bought is worth 3 to 5 rather than nothing. On a car with nothing else fitted they are still
worth exactly 0, because there is no gained grip to support. Neither carries a grip modifier and
neither should.

**Fitting a body kit charges twice, and the second charge is now stated.** The carrier swap leaves
every panel zone bare, so the `paint` band re-derives to `poor` and drags both the style and
authenticity condition factors down on top of the stockness loss the kit already costs. Measured
through the real swap: authenticity 100 to 83 where stockness alone predicts 89, and style 92 to 84
on a dressed EG6. The maths was always right and the silence was the defect; the car now carries a
note under its radar naming the unpainted panels and saying both stats come back with the paint. No
formula moved, so both figures are unchanged.

**Engine support buys nothing unless it is the weakest link, and it never gates power.** An
unsupported build makes its full power and becomes unreliable
instead. Measured twice, independently: a Supra at `dangerous` support makes 745 PS and the
identical build fully supported makes exactly 745 PS; and on a 180SX, adding six race support parts
to the wrong subsystems left headline, power and reliability all bit-for-bit unchanged. Only
reliability moves, and only when the support that moves is the weakest link.

**Reliability's condition factor is usually decided by its worst part alone, and repairs to
anything else do nothing.** The severity ceiling, not the weighted mean, governs almost every
damaged car: one part at `poor` or `scrap` caps the whole car between 0.90 and 0.40 of its base
while the mean (0.94 to 0.99 for a single defect) is simply discarded. **It does not stack**, so
three poor light parts cap identically to one, and repairing them while a heavier part is still
poor moves the number by exactly zero. A player who fixes three things and sees no change is not
imagining it.

**Two long-standing dead seams closed together, and one of them made a clamp live.**
`machiningCost` returned a literal 0 with its parameter explicitly discarded, and authenticity's
lower clamp arm could never bite because nothing was ever subtracted from `100 * stockness`. Both
were recorded here as unreachable. Machining filled the first, and the second followed: the nine
shipped operations sum to 48 authenticity points and are charged only where stockness has NOT
already been spent, so a car kept on its original castings and fully machined reads `raw = 36 - 48`
and clamps to **0** (measured, on a Supra). Authenticity's true floor moved from 11 to 0, while the
fully-modified floor of 11 is unchanged, because a fully modified car has no stock part left to
charge. **The two floors are reached from opposite directions and neither can reach the other's.**

**Superseded, and marked rather than rewritten because this folder is a measurement snapshot.** The
per-operation `authenticityCost` values were rescaled after that was measured, and six operations
outside the engine joined them; the whole set now costs under seven points. So the machining route
no longer drives the stat anywhere near 0 and the lower clamp arm is out of reach again. The seam
itself is exactly as described. Current values: `economy.json` under `machining.operations`, and the
note at the head of [authenticity.md](authenticity.md).

**Style and performance correlate more than the design intends.** The formula is fully orthogonal
and reads no performance figure at all, but the authored columns are not: `styleBase` against
PS/tonne is r 0.69 across the shipped cars, `styleCeiling` r 0.77. Most of it is price rather than
speed (the partials fall to 0.16 and 0.30 holding price constant), and real counterexamples exist,
but on the cars a player actually meets the two axes partly rank together.

**The design docs have caught up with the code, and two code comments have not.** Every
design-document drift these files recorded has since been corrected in the document itself:
`tuning-system.md` now gives style as gap-closing per car, two NA power columns, the ECU as an
increasing curve that unlocks nothing, the reliability formula with its intensity term, and
`spec.aspiration` as what makes a car forced; `desirability-system.md` now says 66 against 108; the
authenticity weights proposal now says 11 unloseable points rather than 23. What is still stale is
in the source: `economy.ts`'s own comment on `styleSaturationPoints` describes ten slots and 88
points against a measured twelve and 108, and `valuation.test.ts` still explains an assertion with
the retired 23. Where a doc and the code disagree, these files document the code.

## How to use these files

Each stat's file gives the real formula with its file and symbol named, a plain-language reading,
every input with its size and scope, the true bounds and what it takes to reach them, what does
**not** affect the stat where a reader would assume otherwise, where the content levers live, and
its own findings.

They describe what the code does today. When the code changes, these change with it, and a claim
here that no longer holds is a bug in this folder.
