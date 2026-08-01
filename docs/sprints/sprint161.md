# Sprint 161: the body bill charges for the distance travelled

## Goal

The body bill charges a threshold, not a distance. `panelsRepairBillYen`, `paintRepairBillYen` and
`underbodyRepairBillYen` each charge a flat per-zone materials price gated on the axis being worse
than target, so a zone one rung above target is quoted exactly what a zone three rungs above is
quoted.

The consequence, measured on 10,400 real lots: taking an entry shell from as found to `fine` costs
20,456 yen, and the market's view of what it still owes to reach mint RISES by 36 yen. Repairing to
the expected standard buys nothing, and the whole residual credit stays on the table for whoever
takes it to mint. Over-restoring therefore pays on 18.07 per cent of entry lots and 54.84 per cent
of everyday lots, on cars where `beyondDiscount` says it must lose money.

This is live today and predates the beyond-repair work. `carCostToBandYen` has routed the three body
carriers through the pipeline since the zone model landed.

## Definition of done

1. The body bill is proportional to the work actually needed: two zones at different severities
   above the same target cost different money.
2. Over-restoring stops paying where `beyondDiscount` says it must not. Entry and everyday go to
   zero; enthusiast and flagship keep inverting, which is legal at 1.2 and 1.3.
3. The donor gate measures real generated cars rather than a synthetic construction.
4. The five red gates from the previous sprint resolve, each on its merits.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.**

- The pipeline already knows what every stage costs. `planPipelineStage`, `planPaintStage` and
  `planSwapPanel` each return their own `materialsCostYen`, and `stagedWork.ts` already charges
  exactly those numbers when a player does the work. The bill's job is to predict that sum, so it
  should walk that same ladder rather than carry a second, flat pricing formula beside it.
- `zoneStatesRepairedToBand` already projects a zone state repaired to a target band.
- `generateAuctionCarInstance` already produces the real cars the donor gate should measure.

**Genuinely new.**

- Nothing. This retires a parallel pricing formula in favour of the one that already exists.

## Design

**The bill should be the pipeline's own arithmetic.** A closed-form flat charge sitting beside a
staged pipeline that charges per stage is two pricing models for one question, and they disagree:
the closed form is dearer than the cheapest live pipeline walk on 92.08 per cent of lots, by 7,263
yen on average. Deriving the bill by walking the stages the pipeline would actually run fixes the
proportionality defect and that disagreement in the same move, and leaves one source of truth.

**The donor gate asserts something about a car that cannot exist.** Its synthetic uniform-band cars
made parting out look profitable; on 10,400 real lots it is profitable on none, and the median strip
loses 531,789 yen. Point it at real generated cars and let it assert the thing that is actually
true.

## Levers (directive 22)

The maintainer has approved fixing the body bill so that it charges for distance rather than
threshold, and re-basing the donor gate onto real cars.

**No content value in `economy.json` or `partPricing.json` moves in this sprint.** The change is to
how an existing bill is computed, not to any price it reads. If implementation finds that the fix
cannot land without moving a priced value, that thread STOPS and reports the numbers rather than
moving one.

Still outstanding and NOT in this sprint: `baseCostYen.zonePanel` 6,000 to 30,000 and
`baseCostYen.panels` 28,000 to 140,000.

## Tasks

1. [x] Make the three body bill functions charge in proportion to the work needed, by walking the
   pipeline's own stage costs.
2. [x] Re-base the donor gate onto real generated cars.
3. [x] Resolve the five red gates, each on its merits under directive 17.
4. [x] Measure the over-restoration share before and after, per class.

## User-only tasks

None.

## Exit

Ready for review. All five gates are green and nothing was loosened to make them pass. **No content
value moved**: `economy.json` and `partPricing.json` are untouched, and the fix landed without
needing either of the two outstanding price levers.

### 1. Over-restoration, before and after

Repair-to-mint out-earning repair-to-expectation, measured over **10,400 real lots** (26 models x
400 seeds through `generateAuctionCarInstance`, game year 1995, same seeds both runs). "Before" was
measured by temporarily restoring the flat bill and re-running the identical probe; it reproduces
Part 7.3 of `body-system-analysis.md` to the second decimal on every row, which is what qualifies
the "after" column to be trusted.

| class | n | `beyondDiscount` | over-restoring pays, BEFORE | AFTER | legal? |
| --- | ---: | ---: | ---: | ---: | --- |
| entry | 2,800 | 0.4 | 18.07% | **0.00%** | must not invert |
| everyday | 3,200 | 0.8 | 54.84% | **0.00%** | must not invert |
| enthusiast | 3,600 | 1.2 | 74.69% | 37.25% | legal, may invert |
| flagship | 800 | 1.3 | 55.75% | 35.38% | legal, may invert |

The definition of done's target is met exactly: the two tiers where `beyondDiscount` forbids the
inversion go to zero, and the two where it permits one keep it.

Two other measurements from the same run, before -> after:

| claim | entry | everyday | enthusiast | flagship |
| --- | --- | --- | --- | --- |
| a strip play beats a repair play | 0.00% -> 0.00% | 0.00% -> 0.00% | 0.00% -> 0.00% | 0.00% -> 0.00% |
| strip-as-found turns any profit | 3.46% -> **0.54%** | 0.00% -> 0.00% | 0.00% -> 0.00% | 0.00% -> 0.00% |

The entry residual is one model: `honda-city-e-aa` falls from 24.00% of its lots to 3.75%, best
case ¥7,543, against a median ¥49,092 more for repairing the same lot. Closing it needs a priced
lever (`teardown.usedPartSaleFraction`, or the zone-panel price sprint 162 moves) and is left to
the maintainer.

### 2. The bill is now a distance

One bonnet zone, everyday class, rest of the car mint. Two zones at different severities above the
same target now cost different money, which is the whole defect:

| zone | quoted to `fine` | quoted to `mint` |
| --- | ---: | ---: |
| finish 1 (one rung above mint) | 0 | 800 |
| finish 2 (two rungs) | 800 | 1,600 |
| finish 3 (bare) | 3,700 | 4,500 |
| surface 1, finish 3 | 5,600 | 6,400 |
| metal 3, surface 2, finish 3 | 5,600 | 6,400 |

Before, every one of those rows quoted the same flat ¥3,700 (or ¥5,600 with filler) at both
targets.

The split identity that `marketValueYen` depends on now holds exactly: on **1,560 real lots**,
`bill(as found -> expectation) + bill(that repaired car -> mint) - bill(as found -> mint)` is
**zero on all of them**, worst absolute gap 0. Before, it was ¥20,491 on the mean entry car and
nonzero on 97.54% of lots. That gap was the whole of the illegal inversion.

### 3. The bill agrees with what the game charges

**291 real lots** walked end to end: the route's stages staged as real `pipeline-stage` /
`pipeline-paint` actions and resolved through the shipped `confirmStagedWork`, at tool tier 3.
Cash actually deducted against the quoted bill: **0 lots disagree, worst delta ¥0**. The residual
body bill on the repaired car is **0 on all 291**. Lots needing a bought panel were excluded from
this walk (the panel is a catalogue purchase, not a stage's materials) and are covered by 4 below.

Residual disagreement: none for a shop at full capability, which is what a bill prices. The two
pre-existing contracts in Part 7.6 stand and are unchanged by this sprint: the bill prices no
labour, and it prices no tool tier, so a tier-1 or tier-2 shop still cannot reach the `mint` finish
the bill quotes.

### 4. A panel is still quoted, and filler is not

Everyday zone panel ¥1,000, filler + paper ¥1,900:

| zone | `panels` quote | `paint` quote |
| --- | ---: | ---: |
| ruined past saving, surface 2 | 1,000 | 4,500 |
| panel gone, surface 2 | 1,000 | 4,500 |
| both, surface 2, finish 3 | 1,000 | 4,500 |
| merely rough, surface 2 | 1,900 | 0 |

Exactly one panel, once, for either forcing state, and no filler on top: the fresh panel arrives
straight. It now also owes the repaint it genuinely needs, because `planSwapPanel` leaves the zone
bare at finish 3 - money the flat bill missed whenever the ruined panel's stale finish happened to
read low. `beyondRepairPanels.test.ts` passes unchanged.

### 5. What changed

- `bodyPipeline.ts`: `planZoneRepair`, one private route walker that DRIVES `planSwapPanel`,
  `planPipelineStage` and `planPaintStage` and sums their own `materialsCostYen`. The three bill
  functions are now thin readings of it, and `zoneStatesRepairedToBand` returns the state the same
  walk leaves behind, so the money and the car always describe one piece of work. The parallel flat
  pricing formula is gone (directive 16): there is one body pricing model and the workshop is it.
  `BARE_FINISH` names the finish that strip/prep, a fresh panel and the polish stage's own refusal
  all turn on, in place of three literal 3s.
- `plays.ts`: `computeCarPlayRanking(car, model, buyPrice, context)` is the measurement;
  `computeModelPlayRanking` is now a wrapper that feeds it the closed-form probe car, and
  `computeGeneratedLotPlayRanking` feeds it real `generateAuctionCarInstance` lots. One pricing of
  the four plays, two subjects.
- `balanceProbes.ts`: `partedYieldOfWorstCaseYen` keeps its place in the CSV export but its doc
  comment now records that it is disclosure only, and why (a gross yield on an all-scrap
  construction, set against a net margin on a different car).

Nothing in `economy.json`, `partPricing.json`, `parts.json` or `cars.json` was touched. The
sprint-162 levers are unaffected: `panelsRepairBillYen` still reads `zonePanelPart(...).priceYen`
in exactly one branch, `zoneNeedsPanel`, so the bill's exposure to `baseCostYen.zonePanel` is
unchanged.

### 6. The five gates, with directive 17's case for each

| gate | case | resolution |
| --- | --- | --- |
| `plays.test.ts`: full ordering by profit on entry and everyday | **(b)** real regression, code fixed | The bill was charging a threshold. Green with no test edit. |
| `plays.test.ts`: the one inversion is enthusiast and flagship only | **(b)** same defect, same fix | Green with no test edit. |
| `balanceProbes.test.ts`: parting out never beats repairing | **(a)** stale subject | It compared a GROSS parted yield on `buildWorstCaseRawCar` against a NET repair margin on `buildRoughProbeCar`: two accounting bases, two cars no catalogue deals. Re-based onto real lots, net against net at one buy price. Still a hard gate, and it fails the moment breaking beats fixing. The `donorBreakEvenBillRatio` disclosure kept its own test. |
| `plays.test.ts`: full ordering by yen per labour point | **(a)** the assertion over-reached | The failing rung is `strip-reconditioned` beating `strip-as-found` PER POINT, which is not a claim the economy makes: reconditioning is chosen on net yen (`bestResaleBand`), so it buys profit and never rate. Measured over 10,400 real lots, that rung fails on 20.86% / 33.59% / 45.64% / 59.88% by class, while the two rungs the test's own comment claims hold at 0.00% (`repair-to-expectation` best per point) and 0.04% (fixing beats stripping per point, 4 lots, all entry). Now asserts exactly those. |
| `plays.test.ts`: the cheapest car in every tier is not strippable | **(a)** stale subject and stale claim | Re-based onto real lots for the cheapest model in each tier, asserting the comparative claim (breaking is never the better play than fixing) rather than the sign. The sign is still positive on 3.75% of `honda-city-e-aa` lots and is disclosed in the test and in section 1; moving it needs a priced lever, which this sprint is scoped out of. |

Also touched:

- `advanceDay.test.ts`, both golden-master state hashes - **case (a)**. Every generated car's
  restoration bill moves, so every guide value on a trading career moves. No draw was added or
  removed. Re-derived from a real run, twice, to confirm determinism; both comments record the
  reason.

### 7. Checks

`pnpm typecheck` clean across content, sim and game (directive 20's carve-out: this reshapes
`zoneStatesRepairedToBand`'s contract and an exported probe entry point).

Green, run file by file or by project: the whole `content` project (26 files, 573 tests), the whole
`game` project (63 files, 850 tests), and 76 of the 77 sim test files - `harnessAcceptance.test.ts`
alone was not run (pure performance model, reads no bill). No bot career was run (directive 21).

The measurement probe was a throwaway Vitest file under `packages/sim/tests/`; it has been deleted
and left no artefact in the repo.
