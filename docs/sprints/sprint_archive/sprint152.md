# Sprint 152: style becomes an axis a car can climb

**Status: BUILT and committed** (`4f75ed0`, 2026-07-31). Design of record:
`docs/design/systems/desirability-system.md` section 2. Values:
`docs/design/systems/style-authoring-proposal.md`, already authored for all 94 roster rows.

## The defect

**A stock car cannot satisfy anyone who cares how it looks.**

    style = weightedBandFactor(...) * styleBase + sum of installed part statModifiers.style

`styleBase` is authored 4 to 20, so a **stock mint car scores 4 to 20 out of 100**. Every buyer
style target sits above that: stancer 65, kei-specialist 55, collector 50, tuner 45. Only 7 of 29
taxonomy slots carry any style weight at all, totalling 14 points.

So a mint, numbers-matching 2000GT scores about 20 on looks, and the upper 80 per cent of the axis
is reachable only by bolting things on. That is backwards for half the roster.

## The fix

A car has a **base** (how it looks stock) and a **ceiling** (how good it could ever look).
Aftermarket parts do not add points, they **close the gap between the two**.

    fitted   = sum of statModifiers.style over installed parts
    reach    = min(1, fitted / styleSaturationPoints)
    styleRaw = styleBase + (styleCeiling - styleBase) * reach
    style    = round(clamp(styleRaw * conditionFactor, 0, 100))

`conditionFactor` is the existing `weightedBandFactorForStat(car, model, 'style', ...)`, unchanged.
A rough car does not look good however it is dressed.

### Why this shape

Same part, two cars, different result, with no special case:

| car | base | ceiling | headroom | a bodykit is worth |
| --- | ---: | ---: | ---: | --- |
| Toyota 2000GT | 80 | 85 | **5** | almost nothing |
| Nissan 350Z | 45 | 96 | **51** | a great deal |

A rocket bunny kit on a 2000GT still *works*, it just fits into a five-point gap, so it is never
the play. And the 2000GT is no longer stuck at 20, which was the thing that felt wrong.

## The values

**Authored for all 94 roster rows**, in `docs/design/midnight-garage-roster.csv` columns
`styleBaseProposed` and `styleCeiling`. Verified on delivery: 94 rows, no blanks, no row where
ceiling is below base, and **zero rank inversions against the existing `styleBase` across the 90
rows that were not declared departures** (four departures are named in the proposal).

**Promote `styleBaseProposed` into `styleBase`** in this sprint and delete the proposal column.
Two columns for one value is a duplicate answer to one question. The proposal was reviewed and
accepted as preliminary-but-sane, so this is adopting an approved proposal rather than overriding
authored work.

The shipped 26 cars take both values into `cars.json`; the other 68 wait in the CSV as usual.

### The one new lever

`statFormulas.styleSaturationPoints` = **60**, preliminary.

Fitting the best style part in every slot totals about 82 points. A saturation of 60 means a
**focused, coherent build reaches its car's ceiling without needing literally every style part**,
and the last 22 points are wasted on an already-maxed car, which is a sensible diminishing return.
Setting it at 82 would mean only a maximal build ever reaches a ceiling, which punishes taste.

Not signed under directive 22. Recorded here as the value implemented so a later pass can move it.

## Calibration this must hit

The proposal's own sanity checks, which the implementation should confirm still hold once wired:

- **23 of 94 cars satisfy the stancer (65) stock**, and all but one cost ¥850,000 or more. No entry
  car can, and nothing in the lower two thirds of `everyday`. A beautiful car straight out of the
  box is a late-game purchase; everyone else builds.
- **2 of 94 can never reach the tuner (45) at any build**: Acty and Wagon R. Neither has a
  performance case either.
- Seven entry cars can never reach the stancer at any build.

**If those numbers come out materially different once the formula is live, stop and report**,
because it means the formula and the authoring disagree about what the numbers mean.

## Reuse analysis (directive 16)

### Genuinely new

- `styleCeiling` on `CarModel.spec`.
- One economy lever, `styleSaturationPoints`.
- The gap-closing arithmetic, replacing an addition.

### Existing mechanisms reused

- **`styleBase`**, which already exists on `CarModel.spec` and is already schema-validated
  `min(0).max(100)`. The new range fits inside it; only the authored values change.
- **`weightedBandFactorForStat`**, unchanged, still supplying the condition factor.
- **`statModifiers.style` on parts**, unchanged. The 19 style-bearing SKUs keep their points; what
  changes is what those points buy.
- **`rosterCsvGuard.test.ts`**, which already holds every row inside an authored band. Its
  `STYLE_CEILING` constant of 20 moves; the mechanism does not.
- **Nothing in `buyers.json`.** The targets are authored and ratified.

### Must NOT be built

- **Any change to authenticity.** Sprint 151 shipped it; leave it alone.
- **Any new style-bearing SKU**, or any change to the 19 that exist.
- **A per-car style ceiling derived from `aeroCeiling` or `culture`.** Ruled: authored fresh, and
  it is authored.

## Task breakdown

1. **Promote `styleBaseProposed` to `styleBase`** in the CSV, delete the proposal column, keep
   `styleCeiling`. Verify the file stays RFC-4180 valid and the row and column counts hold.
2. **`styleCeiling` onto `CarModelSchema.spec`**, required, `.strict()`, with a refine that
   `styleCeiling >= styleBase`.
3. **Both values into `cars.json`** for all 26 shipped cars, from the CSV.
4. **`styleSaturationPoints` into `statFormulas`** with its Zod entry.
5. **The formula** in `derivedStats.ts`, replacing the addition. Keep it beside the authenticity
   derivation that landed in Sprint 151 and follow its shape.
6. **`rosterCsvGuard.test.ts`**: the authored band moves, and it should now also hold
   `styleCeiling >= styleBase` on all 94 rows.
7. **Tests and re-derivation.**

## Tests

- A stock mint car scores exactly its `styleBase`.
- A fully dressed car scores its `styleCeiling`, and fitting more style parts past saturation
  changes nothing.
- A half-dressed car lands between the two, proportionally.
- **The 2000GT case**: fitting the same parts to a 2000GT and a 350Z produces very different style
  gains, and the 2000GT's is small.
- Condition scales the whole result, not just the base: a poor-condition maxed car scores below a
  mint maxed car.
- Every one of the 26 shipped cars has both values and `ceiling >= base`.
- The three calibration counts above.

## Re-derivation

The economy approval-gate hash, the `advanceDay` golden hashes, and the worked example. Expect
buyer valuations to move on every car, because style stops being near-zero on stock cars.

Run `pnpm typecheck` before reporting (directive 20 carve-out: this adds a required schema field).
Run `pnpm test --project sim` once at the end.

## Exit

**Status: IMPLEMENTED, ready for review. Not committed. THREE TESTS ARE DELIBERATELY LEFT
FAILING** and they are the finding, not an oversight: see "The thing that must go to the
maintainer" below.

### The one thing that proves it

**A stock mint car scores exactly its own `styleBase`, and a fully dressed mint car scores
exactly its own `styleCeiling`.** Both asserted directly on all 26 shipped cars in
`packages/sim/tests/style.test.ts`. Both identities are structural rather than tuned: `reach` is
exactly 0 with nothing fitted and exactly 1 past saturation, and the condition factor is exactly 1
when everything is mint, so a car sits on each end of its own authored range by construction.

The 2000GT case, measured through the live formula on one identical build:

| car | base | ceiling | style fully built | gain |
| --- | ---: | ---: | ---: | ---: |
| Toyota 2000GT (MG-093) | 80 | 85 | 85 | **+5** |
| Nissan Fairlady Z (Z33, MG-074) | 45 | 96 | 96 | **+51** |

Same parts, same condition, ten times the return, with no special case anywhere. A kit on a
2000GT still works and is still never the play, which is exactly what the design asked for.

### The calibration, measured against the live formula

All three of the authoring pass's predictions hold exactly. They are pinned in
`rosterCsvGuard.test.ts` so the roster and `buyers.json` cannot drift apart quietly.

| prediction | measured |
| --- | --- |
| 23 of 94 satisfy the stancer (65) stock and mint | **23 of 94**, none of them `entry`, and the AZ-1 at 720,000 yen is the only one under 850,000 |
| 2 of 94 can never reach the tuner (45) at any build | **2**: Honda Acty (15/42) and Suzuki Wagon R (16/44) |
| seven entry cars can never reach the stancer at any build | **7**, every one `entry`: Acty 42, Wagon R 44, S-Cargo 51, Today 58, Carina 60, Corolla 62, Mira Avanzato 64 |

The proposal's other counts also hold unchanged: collector (50) stock 52, tuner (45) stock 63,
first-timer (20) missed stock by three (Acty 15, Wagon R 16, Corolla 18), kei-specialist (55)
reached by nine of the eleven keis.

### The CSV promotion

`styleBaseProposed` was promoted into `styleBase` and the proposal column deleted, leaving
`styleCeiling`. The rewrite operated on RAW field substrings, so every untouched field kept its
original quoting byte for byte. Verified after writing, with a character-state RFC-4180 parser
rather than a comma split: **94 data rows, 57 columns on every row (was 58), zero rows where the
ceiling sits below the base, every uid in its original position, and every promoted value equal to
the proposal it came from.** `styleBaseProposed` no longer appears anywhere in the file.

### What landed

1. **The CSV promotion**, as above. `styleBase` now runs 15 to 88 (was 4 to 20) and `styleCeiling`
   42 to 96, authored for all 94 rows.
2. **`spec.styleCeiling`** on `CarModelSchema`, required and not defaulted, with a model-level
   refine that it cannot sit below `styleBase`. `spec` is now `.strict()`, so a misspelt or
   invented spec key fails validation instead of being silently stripped.
3. **Both values into `cars.json`** for all 26 shipped cars, straight from the CSV, written
   line-wise so prettier's own formatting of every other line survived untouched.
4. **`statFormulas.styleSaturationPoints` = 60**, with its Zod entry. PRELIMINARY, recorded here
   as the value implemented rather than signed under directive 22.
5. **The formula**, as `stylePercentOf` in `derivedStats.ts`, beside Sprint 151's
   `authenticityPercentOf` and following its shape: derived whole, never accumulated. Style,
   reliability and authenticity are now all derived above the part loop, so that loop reads a
   car's fitted SKUs for exactly two quantities, power and handling.
6. **Each part's style points are scaled by its own band before they are summed**, the same way
   `buildFactors` scales a `physicalModifier`. A scrap bodykit buys less of the gap than a mint
   one. The condition factor then multiplies the WHOLE result, base included, so a rough car does
   not look good however it is dressed.
7. **`rosterCsvGuard.test.ts`** holds both columns inside 0 to 100, both present and integral on
   all 94 rows, `styleCeiling >= styleBase` on all 94, `styleCeiling` against `cars.json` in the
   tuning-arc constants block, and the three calibration counts above.
8. **`packages/sim/tests/style.test.ts`**, the 75th sim file: 12 tests over both ends of the
   range, saturation, proportionality, wear, the 2000GT case and the condition factor.
9. **The sandbox generator** gained a `styleCeiling` placeholder and `sandboxCars.ts` was
   regenerated (59 research entries; the 26 in-game cars read the real model).
10. **The performance sandbox's style row** now reads "45 stock to 92 fully built, this car's own
    pair" instead of quoting the base as if it were a ceiling.

### Re-derived pins

| pin | old | new |
| --- | --- | --- |
| `economy.json` approval-gate hash | `b0144125...27922b0` | `3f3d4565...cc72536` |
| `first-proper-car` `tasteMatch(first-timer).minMultiplier` | 1.07 | **1.08** |
| `low-and-loud` `statThreshold(style).min` | 50 | **74** |
| `low-and-loud` `tasteMatch(stancer).minMultiplier` | 1.06 | **1.09** |
| `street-power-street-manners` `tasteMatch(tuner).minMultiplier` | 1.05 | **1.08** |
| `worked-example-two-cars.md` | - | regenerated from a real run |
| `advanceDay` golden master (job loop) | `0460fdc2` | **unchanged** |
| `advanceDay` golden master (acquisition to sale) | `5c5614ec` | **unchanged** |
| `partPricing.json` hash | - | **unchanged** |
| every mission `payoutYen` / `budgetCapYen` | - | **unchanged** |
| `SAVE_VERSION` | - | **unchanged** |

**Neither golden hash moved, and that is the expected result rather than a lucky one.** Nothing
was added to or removed from the rng stream: no draw was gained, none retired, and no generation
path changed. Sprint 151's hashes moved because a draw left the stream; this sprint changes only
what a number MEANS once drawn.

The four mission requirements are MECHANICAL re-derivations from a fresh
`storyMissionProbes.test.ts` run against each probe's own unchanged build, never hand-picked, on
the same footing as Sprints 145 and 146. No payout or budget cap moves: style reaches value only
through buyer taste and never through `marketValueYen`. `low-and-loud`'s style floor moving 50 to
74 is the largest single move and is simply the S14 going from `styleBase` 14 to 57.

The worked example moved in exactly the place it should: the two listing-channel tables and the
stancer's own offers on the S13 (roughly 453,000 yen to 485,000 yen a time). Every other buyer's
offers on the same lot are unchanged, because style importance is low for them. The reconciliation
identity still holds to the yen.

### THE THING THAT MUST GO TO THE MAINTAINER

**The unimproved instant flip became profitable on the top two tiers, and NOTHING WAS TUNED.**
`valueModelProbes.test.ts`'s unimproved-flip guard fails on three of its four tiers, and those
three failures are in the tree deliberately. Under directive 22 and this sprint's own brief, the
only lever authorised here is `styleSaturationPoints`, and it provably cannot fix this.

| tier | median flip margin | share of flips profitable | verdict |
| --- | ---: | ---: | --- |
| `entry` | below -1% | - | **passes** |
| `everyday` | **-0.99%** | 42.3% | fails a -1% bar by a hair |
| `enthusiast` | **+0.19%** | 51.5% | fails |
| `flagship` | **+1.05%** | 65.0% | fails |

**The cause is arithmetic and it is this sprint's own intended effect.** Median stock style by
tier moved 7 to 24 (`entry`), 13 to 53 (`everyday`), 15 to 64 (`enthusiast`), 17 to 74
(`flagship`). Buyer style targets are stancer 65, kei-specialist 55, collector 50, tuner 45. Under
the old 4-to-20 scale no stock car cleared any of them, so an untouched car's taste multiplier was
always below 1 and the guard held for free. A mint stock flagship now clears all four. The guard's
own comment ("a walk-in never pays over the taste-free market read for an untouched car") was true
only because of that, and is now false.

**`styleSaturationPoints` has no leverage here and is not a candidate.** An unimproved car has
fitted style points near zero, so its `reach` is near zero and its style is `styleBase` times
condition, entirely independent of the saturation lever. Moving it in either direction cannot
touch these four numbers.

**The structural asymmetry underneath is the real question, and it is a lever decision.**
`marketValueYen` takes no stats at all (a locked ruling: a car is never worth more because it is
faster), so the BUY side does not price beauty while the sell side does, through buyer taste, and
style just became the largest taste term on an untouched car. Candidate levers, none pulled and
none signed: `liquidity.qualityFresh`, `valuation.tasteSpread`, the auction buyout premium, or the
six buyer `statTargets.style` values.

`desirability-system.md` section 6 predicted precisely this: "buyer style targets were authored
against the old scale and should be re-checked against the new one, though not necessarily moved."
The re-check is the table above. Recorded in `TODO.md` under open balance/economy questions and in
that design doc's own open list.

### Failing tests, diagnosed (directive 17)

Six sim failures and one content failure. Four were case (a); three are the escalation above and
are neither.

- **`economyApprovalGate` (case a).** One key ENTERED `economy.json`. Re-pinned with a full ledger
  entry naming the lever and its value, recording that all 52 style values in `cars.json` were
  replaced or added from the CSV, and stating that no payout, no budget cap and no part price
  moves.
- **`derivedStats.test.ts`, "an installed part fully applies its modifiers at mint" (case a).** It
  asserted `style === stock.style + 3`, which is the retired addition stated literally. Rewritten
  to assert the gap-closing value the design specifies, expressed as the formula rather than as a
  magic number, plus the weaker claim that fitting the part still raises style.
- **`derivedStats.test.ts`, the whole "styleBase replaces the flat styleCap" describe (case a, and
  deleted rather than updated).** Its smoke test was "a car authored at 20 reads exactly 20",
  which pinned a fixture to the value of a cap retired two sprints ago, and its second test
  asserted 2000GT 15 and S-Cargo 12, both superseded by this sprint's authoring. Everything it
  claimed is now covered better by `style.test.ts` across all 26 shipped cars, so keeping a second
  copy would have been a duplicate answer to one question.
- **`valuation.test.ts`, "exceeding a target earns nothing" (case a).** Its "bigger excess" build
  was the loud/low/unreliable Silvia, whose race buckets are at `poor`. Under addition a worn part
  still added points on net; under the new model condition scales the whole result, so that build
  now reads 86 against the at-target build's 90 and is no longer the bigger excess at all. The
  claim under test is untouched and still true, so the fixture was rebuilt to make it testable:
  the over-target car is now the at-target car plus a race dash, deliberately the one style slot
  that carries no handling modifier and no physical modifier, so the ONLY difference between the
  two cars is how far each has closed its own style gap. Both still clear 65 and the stancer still
  pays exactly the same for both.
- **`valueModelProbes.test.ts` x3: NOT case (a) and NOT case (b), and left failing on purpose.**
  Not (a), because the guard still means exactly what it meant: buying a car and reselling it
  untouched must lose money, and it now does not. Not (b) in the usual sense either, because the
  code is doing what this sprint was asked to make it do. It is a third thing: a correct change
  that moved a number a lever was calibrated against. Directive 22 ends the thread here rather
  than letting an implementation agent pick a lever, so the numbers go to the maintainer above.

### Checks

| check | result |
| --- | --- |
| `pnpm typecheck` (directive 20 carve-out: a new required schema field) | clean, no errors |
| `pnpm test --project content` | 25 files, 551 tests, all pass |
| `pnpm test --project game` | 62 files, 835 tests, all pass |
| `pnpm test --project sim` | 75 files, 1975 tests, **1972 pass, 3 fail** (the escalation above, and only that) |

### Judgement calls the doc did not decide

1. **The style derivation is module-private, where authenticity's is exported.**
   `authenticityPercentOf` is exported because the concours gate re-reads it; nothing outside
   `computeDerivedStats` needs style, so exporting it would have been API surface for no caller.
2. **The guard's authored band is 0 to 100 rather than a tight fence around the authored spread.**
   The old band (4 to 20) matched a retired cap exactly and had to be edited the moment authoring
   moved. A band that has to be re-adjudicated every time someone authors a car is not a guard, it
   is a second copy of the authoring. This one catches a typo and a stale scale, which is its job;
   the calibration counts are what pin the actual shape.
3. **The two Supra test fixtures took the roster's real 74/95 instead of keeping `styleBase` 20.**
   Both declare `id: 'toyota-supra-rz-jza80'` and carry the real spec everywhere else, so leaving
   them on a style pair no Supra has is exactly the drift the CSV is canonical to prevent. The
   synthetic `test-model` fixtures took 20/80 instead, since there is no car to be honest about.
4. **`spec` became `.strict()`**, per the task list. Verified safe first: every key on every
   shipped car's `spec` is already in the schema, so nothing was being silently stripped today
   and nothing changes except that a future misspelling now fails loudly.
5. **The proposal document was NOT rewritten, only re-headed.** Its body still says
   `styleBaseProposed`; the new header states that the column was promoted into `styleBase` and
   that the reader should substitute. Rewriting a reviewed authoring document to match a mechanical
   column rename would have made it harder, not easier, to check the values against what was
   reviewed. Its section 6 (the ten calls to review first, headed by the Z33 at 45 against the
   worked example's own 30) remains fully open.
6. **Two `TODO.md` items were removed outright**, per that file's own policy: the Sprint 145
   "RESOLVED IN PART, stock style still tops out at 20" item and the "style cannot do the job the
   buyer tables ask of it" item. Both are now done. The lever ledger's `styleCap` row was corrected
   in the same pass, since it still promised the rescale was deferred.
7. **The values are implemented, not signed.** Both style columns and `styleSaturationPoints` are
   recorded here as the values implemented, per this doc's own instruction, and are flagged the
   same way in `desirability-system.md`'s authoring table and the proposal's header.
