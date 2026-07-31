# Sprint 151: authenticity becomes a fact about the car

**Status: READY TO IMPLEMENT.** Design of record: `docs/design/systems/desirability-system.md`
section 3. Weights: `docs/design/systems/authenticity-weights-proposal.md`.

## The defect

**Authenticity is a dice roll no player action can move.** `CarInstance.authenticityPercent` is
set once at generation as `rng.int(60, 95)` (`auctions.ts:759`) and never written again. The
derived stat is adjusted by two dead mechanisms: all **472** parts carry
`statModifiers.authenticity` of exactly 0, and **no shipped content ever sets `genuinePeriod`
true** (six sites hardcode `false`).

So the collector, who wants authenticity 0.90 at importance 1.00, is satisfied or not by a dice
roll at auction. `concoursSaleMinAuthenticityPercent` (85) gates a reputation bonus on a number no
player can influence.

## The fix

    stockness    = sum(weight_s * isStock(s)) / sum(weight_s)   over every slot s
    authRaw      = 100 * stockness - machiningCost(car)
    authenticity = round(clamp(authRaw * conditionFactor, 0, 100))

- `isStock(s)` is true when the slot's fitted part has `grade === 'stock'`. An empty slot counts as
  NOT stock: a missing part is not an original part.
- `weight_s` is a new per-slot authenticity weight in `parts-taxonomy.json`.
- `conditionFactor` is the existing `weightedBandFactorForStat`, over the authenticity weights.
- `machiningCost(car)` is **0 in this sprint**, because machining does not exist. Specify the term,
  wire it as a function returning 0, and do not invent operations.

**All stock and all mint is exactly 100.** That is the maintainer's own definition and the test
that proves this sprint works.

## The weights

From the proposal, which totals exactly 100 so `stockness` reads as a percentage. On an NA car
`forcedInduction` drops out of both numerator and denominator, giving 97.

| band | slots |
| --- | --- |
| the heart and the skin (48) | `block` 18, `paint` 11, `panels` 11, `internals` 8 |
| significant (35) | `aero` 10, `rims` 7, `headValvetrain` 6, `gearbox` 6, `camsTiming` 4, `seats` 4, `forcedInduction` 3 |
| noticed then shrugged at (17) | `springs` 2; `steering`, `chassis`, `differential`, `dampers`, `brakeCalipersLines`, `underbody`, `exhaust`, `ignitionEcu`, `intake`, `dashGauges` all 1 |
| zero | `tyres`, `brakePadsDiscs`, `clutch`, `cooling`, `fuelSystem`, `driveline`, `antiRollBars` |

The zeros are things that perish with use or are invisible. Weight 0 also removes a slot from the
condition factor, which is intended: nobody marks a car down for new tyres.

**These are preliminary figures, accepted as sane defaults.** They are not signed under directive
22 and the sprint doc records them as the values implemented, so a later pass can move them.

## The known gap, which ships with it

**`paint`, `panels` and `underbody` have no non-stock SKU in `parts.json`.** Verified: 4, 24 and 4
SKUs respectively, every one `grade: "stock"`. Those three slots are **zone-derived**, computed by
the body pipeline from `zoneState` rather than fitted as parts, so `isStock` is always true for
them.

**Consequence: 23 of the 100 points can never be lost. A respray reads as fully original.**

That is wrong and it is recorded as its own follow-up: originality for those three should read
from zone state, with a per-zone refinished flag set when the player does paint or panel work and
rolled at generation. **It is NOT in this sprint.** Authenticity going from 0 per cent functional
to 77 per cent functional is the win; do not grow the sprint to chase the rest.

**Say so in the Exit, prominently.**

## Reuse analysis (directive 16)

### Genuinely new

- Per-slot authenticity weights in `parts-taxonomy.json`.
- A `stockness` derivation.
- A `machiningCost` seam returning 0.

### Existing mechanisms reused

- **`weightedBandFactorForStat`** (`derivedStats.ts`), which already computes a weighted condition
  factor for a stat from taxonomy weights. `style` already uses it. Do not write a second one.
- **`statWeights` in `parts-taxonomy.json`**, which already carries per-slot weights per stat. The
  authenticity weights go in the existing shape, not a new file or a new field.
- **`StatBlock.authenticity`**, which already exists, is already in all six buyer target tables and
  already gates the concours bonus. Nothing in `buyers.json` changes.
- **`part.grade`**, which already distinguishes stock from street/sport/race. That is the whole
  originality signal; no new per-part field is needed.

### Must NOT be built

- **Any machining operation.** The cost term is a seam returning 0.
- **The zone-originality fix.** Its own sprint.
- **Any change to `buyers.json`.** The targets are already authored and ratified.
- **Any change to style.** Sprint 152.

## Retirements, all in this change

Guard G1: delete, never deprecate, so the compiler finds every caller. Each goes into the
retired-identifier ledger.

| what | why |
| --- | --- |
| `CarInstance.authenticityPercent` | a stored roll would contradict "all stock and all mint is perfect" |
| `statModifiers.authenticity` on parts | `grade` already answers it; a second per-part number is a duplicate answer |
| `genuinePeriod` on `PartInstance` and `Part` | ruled redundant; re-addable later if it earns its place |
| `valuation.genuinePeriodMultiplier` | dies with the flag it multiplied |

`SAVE_VERSION` bump, no migration (directive 19).

## Task breakdown

1. **Authenticity weights into `parts-taxonomy.json`**, all 29 slots, `.strict()`.
2. **`stockness` and the derived authenticity**, in `derivedStats.ts` beside the style derivation.
3. **`machiningCost(car)` seam**, returning 0, documented as awaiting the machining system.
4. **The four retirements**, with every reader moved in the same change, and ledger entries.
5. **`concoursSaleMinAuthenticityPercent` now reads a derived number.** Confirm the concours path
   still works and say what a concours car now has to be.
6. **Tests and re-derivation.**

## Tests

- **An all-stock, all-mint car scores exactly 100.** The definition, asserted directly.
- A car with only tyres, pads and clutch replaced still scores 100.
- A block swap alone lands around 82, below the concours gate of 85.
- A bodykit-and-wheels build lands around 83.
- An empty slot counts as not stock.
- A rough all-stock car scores below a mint all-stock car (the condition factor bites).
- No shipped car's authenticity depends on a stored roll any more.

## Re-derivation

The economy approval-gate hash, `SAVE_VERSION` and its canaries, the `advanceDay` golden hashes,
and the worked example. Expect buyer valuations to move on every car, because authenticity is now
a real number rather than a constant.

Run `pnpm typecheck` before reporting (directive 20 carve-out: this retires four identifiers and
reshapes `CarInstance`). Run `pnpm test --project sim` once at the end.

## Exit

**Status: IMPLEMENTED, ready for review. Not committed.**

### The one thing that proves it

**An all-stock, all-mint car scores exactly 100.** Asserted directly, on all 26 shipped cars,
in `packages/sim/tests/authenticity.test.ts` ("the definition: all stock and all mint is exactly
100"). It holds through both halves independently: `stocknessOf` returns exactly 1 and the
condition factor returns exactly 1, so the identity is structural rather than tuned. It also
holds on a naturally aspirated car whose `forcedInduction` slot is legitimately absent: that
slot drops out of BOTH sums, so the denominator is 97 and the car is still perfectly original.

### The four cross-checks

| build | authenticity | note |
| --- | ---: | --- |
| consumables replaced (tyres, pads, clutch, all race grade) | **100** | the four zero-weight slots cost nothing |
| widened to everything replaced without apology (+ cooling, fuel system, driveline, anti-roll bars) | **100** | all seven zeros |
| block swap alone | **82** | fails the 85 concours gate on its own, as the weight was calibrated to |
| kit and wheels (`aero` + `rims`) | **83** | also fails concours |
| empty `rims` slot | **86** | see below |
| aftermarket `rims` fitted | **93** | the same 7 points of stockness lost |
| full engine swap with its ancillaries | **58** | long block plus intake, exhaust, ECU, turbo |
| tuner build, body untouched | **34** | exactly `paint` + `panels` + `aero` + `underbody` + `chassis` |
| all-stock at `fine`/`worn`/`poor`/`scrap` | **85 / 65 / 40 / 15** | exactly `100 x bandFactor` |

**An empty slot counts as NOT stock**, and it costs the car twice, which is correct and worth
stating plainly. Stripping the rims and fitting aftermarket rims produce the IDENTICAL stockness
(0.93 either way, asserted). The stripped car then reads lower (86 against 93) because a missing
part also scores a 0 band factor in the condition mean, which is `weightedBandFactor`'s existing
and unchanged treatment of a missing part. One charge says the car is not the car it claims to
be; the other says the wheels are gone. A slot the catalogue cannot resolve counts as not stock
for the same reason: an unknown SKU is not evidence of originality.

### What a concours car now has to be

`concoursSaleMinAuthenticityPercent` (85) is unchanged and now reads the derived number through
`authenticityPercentOf`, the same figure the radar chart shows. `saleReputationDeltaFor` gained
`partsById` and `partsTaxonomy` so it can derive it rather than read a stored roll. Since
concours already demands every part mint, every condition factor is 1 there, so what the bar
actually measures is ORIGINALITY: **a concours car may have given up at most 15 of the
taxonomy's 100 authenticity points.** An aftermarket block (18) fails it outright; so does a kit
and wheels together (17); a full set of new consumables costs nothing at all. It is now
something a player builds toward rather than a property of the lot they happened to win.

### THE KNOWN LIMITATION THAT SHIPS WITH THIS SPRINT

**`paint`, `panels` and `underbody` can never read as non-original, so 23 of the 100 points
cannot be lost to modification and a resprayed car scores as untouched.** Those three slots are
zone-derived: the body pipeline computes their bands from `zoneState` and fills them with the
one stock SKU, and `parts.json` ships no non-stock SKU for any of them (verified: 4, 24 and 4
SKUs respectively, every one `grade: "stock"`). `isStock` is therefore always true there.

Their weight is NOT dead. The same column drives authenticity's condition factor, where it is
load-bearing and correct: rough paint, dented panels and a rusty floor sink authenticity harder
than anything else on the list. Only the ORIGINALITY half is inert.

This was known and accepted before implementation, and the sprint was deliberately not grown to
chase it. Authenticity going from 0 per cent functional to 77 per cent functional is the win.
The fix is a per-zone refinished flag, set when the player does paint or panel work and rolled
at generation, read by `stocknessOf` instead of the carrier part's grade; it is recorded in
`TODO.md` as its own item. `authenticity.test.ts`'s last describe block pins the limitation and
FAILS the moment a non-stock body SKU is added, which is the signal to delete it.

### What landed

1. **29 authenticity weights** in `parts-taxonomy.json`'s existing `statWeights`, exactly as
   tabled above, totalling 100. `StatWeightsSchema.authenticity` is now REQUIRED (no default)
   and the schema is `.strict()`, so an unauthored or misspelt weight fails validation instead
   of silently reading as zero - which matters more here than for any other column, because
   this one is read twice (originality AND the condition factor). `statWeightsCompleteness.test.ts`
   covers all three required columns now.
2. **`stocknessOf`, `machiningCost` and `authenticityPercentOf`** in `derivedStats.ts`, beside
   the style derivation. `weightedBandFactorForStat` was REUSED, not duplicated: the only change
   it needed was widening its `StatKey` union to include `authenticity`.
3. **`machiningCost(car)` returns 0**, documented as the seam awaiting the machining system. No
   operation, no content, no table.
4. **The four retirements**, delete-not-deprecate, every reader moved in the same change, all
   four in `retiredIdentifiers.test.ts`.
5. **`SAVE_VERSION` 51 -> 52**, no migration (directive 19). Six canaries in `saveCodec.test.ts`
   moved with it.

### Re-derived pins

| pin | old | new |
| --- | --- | --- |
| `economy.json` approval-gate hash | `2699aa1f...06a3052` | `b0144125...27922b0` |
| `SAVE_VERSION` | 51 | 52 |
| `advanceDay` golden master (job loop) | `3ff6dc44` | `0460fdc2` |
| `advanceDay` golden master (acquisition to sale) | `634d4493` | `5c5614ec` |
| `worked-example-two-cars.md` | - | regenerated from a real run |

Both golden hashes moved for one reason, and it is not authenticity's arithmetic: generation
stopped drawing `rng.int(60, 95)`, and that draw sat between the provenance pick and the
zone-state roll, so every draw after it in the stream shifts and every generated board with it.
Re-run twice to confirm determinism. `partPricing.json`'s hash holds and **no mission payout or
budget cap moves**: authenticity reaches value only through buyer taste, never through
`marketValueYen`.

The worked example's own figures moved with the boards (Wagon R net 57,977 -> 65,217; S13 net
210,393 -> 166,444). It also surfaced a defect worth naming: the renderer HARD-CODED "Both lots
came up honest (no symptoms)", which the shifted stream made false. The S13 now arrives with a
symptom, so its guide value is a `sheetGuideValueYen` read and correctly no longer equals its own
first value rung. `CarRunReport` gained `symptomsAtPurchase`, the renderer now writes what the
run actually did, and the reconciliation test scopes its equality claim to honest lots (and
fails if BOTH lots come up symptomatic, so it cannot go vacuous).

### Failing tests, diagnosed (directive 17)

Seven sim failures and two content failures. Every one was case (a), a test asserting behaviour
this sprint deliberately changed, except one which was case (b) against my own writing:

- **`commentHygieneGuard` (case b, a real regression I introduced).** Six comments I had just
  written carried sprint numbers or the word "maintainer", which directive 10 bans. Fixed the
  comments, not the test.
- **`economyApprovalGate` (case a).** `genuinePeriodMultiplier` left `economy.json`. Re-pinned
  with a full ledger entry recording the retirement, the 29 new taxonomy weights by name and
  value, and why no payout moves.
- **`advanceDay` goldens x2, `auctions.test.ts` (case a).** The retired generation draw. The
  auction test's "authenticity within sane bounds" assertion was replaced with the real claim:
  a generated car stores no authenticity of its own.
- **`selling.test.ts` x4, `valuation.test.ts` x2 (case a).** Fixtures that DECLARED an
  authenticity by setting `authenticityPercent: 95` or `20`, and passed `{}` as the parts
  catalogue. A fixture that wants a particular authenticity now has to BE that car, so they were
  rebuilt from real catalogue SKUs (`authenticCar`, `modifiedCar`, `strippedShell`) against the
  real `partsById`.
- **`valuation.test.ts`'s "authenticity swings the Collector price" (case a, and it lost
  something real).** A PURE authenticity delta is no longer constructible: no taxonomy slot
  carries authenticity weight alone, so any car that is less original is a different car in some
  other way too. The test is now "modifying a car swings the Collector price far more than the
  First-timer price", which is the claim the authored tables actually have to get right.
- **`symptomGeneration.test.ts` seed 11 (case a, an under-specified carve-out).** The Law 2 drop
  rule test exempted a surviving symptom whose cause targets `panels`, because `panels`' money
  bill rides on `surface` and metal damage is free. The shifted stream produced
  `rotted-subframe-mount` on `underbody` instead, which adds no money for a different reason:
  `setZoneCarrierToAtLeastBand` is a no-op when the zone already carries that severity. The guard
  itself is intact - the test's own per-part loop independently asserts no zone-derived carrier
  has money-improve headroom left, and it passed. The carve-out was broadened to any
  zone-derived body part, with both routes documented.

### Checks

| check | result |
| --- | --- |
| `pnpm typecheck` (directive 20 carve-out: four retirements and a `CarInstance` reshape) | clean, no errors |
| `pnpm test --project content` | 25 files, 546 tests, all pass |
| `pnpm test --project game` | 62 files, 835 tests, all pass |
| `pnpm test --project sim` | 74 files, 1965 tests, all pass |

`packages/sim/tests/authenticity.test.ts` is the 74th sim file: 21 tests covering the definition,
the weights, what each modification costs, the empty slot, the condition factor, the machining
seam, the retired roll, and the recorded limitation.

### Judgement calls the doc did not decide

1. **A missing part is charged twice** (stockness AND a 0 band factor), so a stripped slot reads
   below a modified one. Both terms are the design of record applied literally, and the split is
   right: originality and condition are different questions about the same slot. Recorded rather
   than smoothed.
2. **A slot the catalogue cannot resolve counts as NOT stock.** The literal reading of "isStock
   is true when the fitted part has `grade === 'stock'`". Consequence worth knowing: a test that
   passes `{}` as `partsById` now reads authenticity 0, which is what surfaced several of the
   fixture failures above.
3. **`installedPartsValueYen` lost its `EconomyConfig` parameter.** `genuinePeriodMultiplier` was
   the only lever it read; leaving a dead parameter that advertises "this function reads economy
   config" would have been misleading. Mechanical, and typecheck caught every call site.
4. **`machiningCost` keeps its unused parameter** with an explicit `void car`, because the
   parameter IS the seam and `@typescript-eslint/no-unused-vars` rejects a bare `_car`.
5. **`economy-bible.md` was NOT edited, and needs a maintainer decision.** Its lever-inventory
   row (line 225) still names `valuation.genuinePeriodMultiplier`, which no longer exists - and
   `valuation.partsRetention`, which has not existed since Sprint 144. A bible needs explicit
   approval to amend, so this is flagged rather than fixed. `economy-legibility.md` line 78 names
   both too; it is a superseded planning doc and was left alone on the same footing Sprint 144
   left it.
6. **`engine-swaps.md` was corrected** (two lines): it is a live, unbuilt design that named
   `authenticityPercent` as existing machinery. A swap now tanks authenticity for free, which is
   exactly what its section 7 asked for, so the correction is also good news for that design.
7. **The weights are implemented, not signed.** Recorded here as the values implemented and in
   the proposal's own header, per this doc's own instruction. Its sections 3 and 4 (the
   structural findings and the calls it is least confident about) remain open.
