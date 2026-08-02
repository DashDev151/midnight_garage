# Sprint 162: panels cost what panels cost

## Goal

Apply the two approved price levers, so that a replacement panel stops costing less than the tin of
filler needed to repair one.

## Maintainer approval (directive 22)

Both values below were approved on 2026-08-01, in response to the measurements in
`docs/design/systems/body-system-analysis.md` Parts 5 and 6. This is the record that approval
requires.

| lever | from | to |
| --- | ---: | ---: |
| `baseCostYen.zonePanel` | 6,000 | **30,000** |
| `baseCostYen.panels` | 28,000 | **140,000** |

**No other value moves.** `baseCostYen.bodyKit` stays at 28,000, which is what keeps every body-kit
price unchanged.

## What was measured before approval

- **Repair beats swap on money at every class** once the panel clears about 2,714 yen, while
  swapping still wins on time everywhere. Entry lands at 4,200.
- **Generated body damage does not get quieter.** With the beyond-repair and missing states live,
  three of four classes are byte-identical across 10,400 lots; entry loses 26 band steps across
  2,800 cars. `enforceMaxBillFraction` does not bite, because a zone panel enters a bill only when a
  panel is beyond saving or absent.
- **Body-kit prices do not move**, proven by re-resolving all 472 SKUs against both price sheets.
  This is what the `bodyKit` basis split bought.
- **The lemon threshold barely moves**: 18 cars of 2,600 change status, net 10 fewer lemons, the
  delta two-sided.
- **The shell stays coherent against its own panels**: five zone panels come to 107 per cent of the
  shell, against a measured 103 to 111 per cent today.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.** All of them. `resolvePartPriceYen` already resolves both bases;
the class-factor curve is untouched; the approval gate already pins both files. This sprint edits
two numbers and re-records what they hash to.

**Genuinely new.** Nothing.

## Design note

The blast-radius measurement that justified these values was taken **before** Sprints 159, 160 and
161 landed. Sprint 161 in particular changes how the body bill is computed. **Re-measure rather than
assume**: the lemon-threshold shift, the story-mission drift and the whole-body bill all need
reading again against the code as it now stands. If any of them has moved materially from the
figures above, that is a finding to report, not to absorb.

## Tasks

1. [x] Move the two values in `packages/content/data/partPricing.json`.
2. [x] Re-derive the eight story-mission probes that drift, and re-pin the mission payout pin with
   them.
3. [x] Re-pin the `partPricing.json` hash in `economyApprovalGate.test.ts`, recording this approval.
4. [x] Update the two price literals in `partPricing.test.ts`, including the guard asserting
   `zonePanel < panels`, which is the incoherence this sprint discharges.
5. [x] Re-record the `advanceDay.test.ts` golden masters.
6. [x] Re-measure the lemon threshold, the mission drift and the whole-body bill against the current
   code, and report any material difference from the figures above.

## User-only tasks

None.

## Exit

Ready for review. Both approved values moved and **no third value did**. `baseCostYen.bodyKit` is
untouched at 28,000, `economy.json` and `damagePatterns.json` are untouched and their hashes hold.

Every figure below was re-measured against the code as it now stands (Sprints 159, 160 and 161 all
in the tree), through a throwaway Vitest probe that drove the shipped `generateAuctionCarInstance`,
`enforceMaxBillFraction`, `costWeightedBandFactor`, `marketValueYen`, the three body bill functions,
the stage planners, `computeGeneratedLotPlayRanking` and `deriveServiceJobPayoutYen` against two
real `buildSimContext`s, one per price sheet. The probe asserts that the sheet rebuilt at the
shipped values reproduces all 472 shipped `priceYen` figures exactly before measuring anything. It
has been deleted and left no artefact in the repo.

### 1. What the two values do to the catalogue

| class | zone panel | shell (`panels` slot) | five panels as a share of the shell |
| --- | --- | --- | --- |
| entry | 800 -> **4,200** | 3,900 -> **19,600** | 102.6% -> **107.1%** |
| everyday | 1,000 -> **4,800** | 4,500 -> **22,400** | 111.1% -> **107.1%** |
| enthusiast | 2,400 -> **12,000** | 11,200 -> **56,000** | 107.1% -> **107.1%** |
| flagship | 5,400 -> **27,000** | 25,200 -> **126,000** | 107.1% -> **107.1%** |

Of 472 SKUs, **24 move**: the 20 zone panels and the 4 shell SKUs. Nothing else.

### 2. The re-measured figures against the approved ones

| claim | approved figure | re-measured | difference |
| --- | --- | --- | --- |
| lemon threshold | 18 of 2,600 change status, net 10 fewer, two-sided | **7 of 2,600 change, net 7 fewer, one-sided (0 new)** | smaller and strictly favourable |
| body-kit prices | 472 SKUs compared, 0 moved | **472 compared, 0 of the 12 kits moved** | none |
| generated body damage | 3 of 4 classes byte-identical, entry LOSES 26 band steps | **3 of 4 byte-identical, entry GAINS 6** | sign reversed, favourable |
| repair against swap | repair wins on money at every class, swap wins on time | **money confirmed on every class; time is a tie in one row** | one row is a tie, not a win |

**The lemon threshold.** 26 models x 100 seeds = 2,600 real generated cars, each priced both ways so
the delta is the levers' alone. By the factor clause (the only clause that reads a price): entry
119 -> 118, everyday 49 -> 44, enthusiast 21 -> 16, flagship 1 -> 1. Median factor delta by class
-0.0120 / -0.0076 / -0.0054 / -0.0048, largest absolute move anywhere 0.0555. Cars sitting within
0.02 of the line at the new prices: 27 / 14 / 10 / 1. Not one car becomes a lemon that was not one
before, so the approved "delta two-sided" reading no longer holds: it is one-sided in the safe
direction. Worth stating because the doc comment on `costWeightedBandFactor` claims it is "the same
figure that feeds valuation" and it is not: `carCondition.ts` is its only consumer, so the lemon
rule is the whole of `baseCostYen.panels`'s reach into how a car is priced.

**Generated body damage.** 26 models x 400 seeds = 10,400 lots, generated under both sheets from the
same seeds. Everyday (3,200), enthusiast (3,600) and flagship (800) are byte-identical on every car.
Entry differs on 17 of 2,800 and comes out **6 band steps louder in total** (231,996 -> 232,002):
9 cars lose steps to `enforceMaxBillFraction`, 6 gain them where a refused candidate hands the step
to another slot. So the ceiling brushes the entry class rather than biting it, and the direction is
the opposite of the approved figure's. Only the cars that carry a panel past saving or absent pay a
panel at all: **3.36% of entry lots, 0.88% everyday, 0.22% enthusiast, 0.00% flagship**.

**The whole-body bill, as a share of the car's own `marketValueYen`.** 26 models x 200 seeds.

| class | to expectation, median | p90 | to mint, median | p90 |
| --- | --- | --- | --- | --- |
| entry | 7.63% -> **7.66%** | 30.25% -> **31.82%** | 11.18% -> **11.22%** | 40.03% -> **40.05%** |
| everyday | 1.30% -> **1.31%** | 2.85% -> **2.86%** | 2.58% -> **2.59%** | 4.31% -> **4.32%** |
| enthusiast | 0.31% -> **0.31%** | 1.07% -> **1.09%** | 0.97% -> **0.97%** | 1.95% -> **1.95%** |
| flagship | 0.25% -> **0.25%** | 0.41% -> **0.41%** | 0.25% -> **0.25%** | 0.41% -> **0.41%** |

The bill is capped by the repair route, so a dearer panel cannot inflate it: the median entry car's
body job moves by 3 hundredths of a percentage point.

**Repair against swap**, both representative zone states, both tool tiers that have a route:

| tier | zone | class | repair | swap, before -> after | money | time |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 0\|1\|3 | entry | ¥5,600 / 12E | ¥4,260 -> ¥6,640 / 11E | SWAP -> **repair by 1,040** | SWAP by 1E |
| 2 | 0\|1\|3 | everyday | ¥5,600 / 12E | ¥4,400 -> ¥7,060 / 11E | SWAP -> **repair by 1,460** | SWAP by 1E |
| 2 | 0\|1\|3 | enthusiast | ¥5,600 / 12E | ¥5,380 -> ¥12,100 / 11E | SWAP -> **repair by 6,500** | SWAP by 1E |
| 2 | 3\|2\|3 | entry | ¥5,600 / 20E | ¥4,476 -> ¥7,774 / 11E | SWAP -> **repair by 2,174** | SWAP by 9E |
| 2 | 3\|2\|3 | everyday | ¥5,600 / 20E | ¥4,670 -> ¥8,356 / 11E | SWAP -> **repair by 2,756** | SWAP by 9E |
| 2 | 3\|2\|3 | enthusiast | ¥5,600 / 20E | ¥6,028 -> ¥15,340 / 11E | repair -> repair by 9,740 | SWAP by 9E |
| 3 | 0\|1\|3 | entry | ¥5,600 / 9E | ¥4,260 -> ¥6,640 / 9E | SWAP -> **repair by 1,040** | **tie** |
| 3 | 3\|2\|3 | entry | ¥5,600 / 15E | ¥4,476 -> ¥7,774 / 9E | SWAP -> **repair by 2,174** | SWAP by 6E |
| 3 | 3\|2\|3 | flagship | ¥6,400 / 18E | ¥9,738 -> ¥30,690 / 12E | repair -> repair by 24,290 | SWAP by 6E |

Repair wins on money on every class and both states, by ¥1,040 to ¥24,290. Swapping still wins on
time everywhere at tool tier 2 (1 to 9 points), and at tool tier 3 on a rotted panel (6 points); on
light damage at tool tier 3 the two routes **tie** at 9 points, because the swap's flat bolt-on
fitting charge equals the fill stage it saves once the tier-3 rate is 3 points a unit. That is the
one place the approved "swapping still wins on time everywhere" is not exactly true, and it is a tie
rather than a loss. Flagship at tool tier 2 has no route by either road, which is the pre-existing
polish-floor defect and is unchanged by this sprint.

### 3. The Honda City E strip sign did NOT close

`honda-city-e-aa`, 400 real lots through `computeGeneratedLotPlayRanking`:

| | before | after |
| --- | --- | --- |
| strip-as-found turns a profit on | 15 lots (3.75%) | **15 lots (3.75%)** |
| best case | ¥7,543 | **¥7,543** |
| median repair-to-expectation advantage | ¥50,958 | **¥50,958** |
| strip beats repair on | 0 lots | 0 lots |

Only **10 of the 400 lots** see their buy price or strip profit move at all, and none of them is one
of the 15. A strip's takings never include the body carriers (`panels` is `removable: false` and a
zone panel is not a slot), and the buy price moves only on the handful of lots carrying a forced
panel. Per the sprint's own instruction, no other lever was tried.

### 4. Mission payouts, re-derived

The same eight probes drift as before, and by almost the same amounts at 140,000 as the earlier
measurement found at 150,000. Every figure is what `storyMissionProbes`'s own `payoutYenFor` rule
yields against a fresh run; each budget cap moves with its own payout.

| mission | pinned | re-derived | drift |
| --- | ---: | ---: | ---: |
| wont-strand-her | 125,000 | **123,000** | -1.60% |
| the-fleet-spare | 483,000 | **481,000** | -0.41% |
| the-column-clock | 999,000 | **996,000** | -0.30% |
| first-proper-car | 686,000 | **684,000** | -0.29% |
| the-showroom-standard | 703,000 | **701,000** | -0.28% |
| street-power-street-manners | 1,497,000 | **1,494,000** | -0.20% |
| low-and-loud | 1,161,000 | **1,159,000** | -0.17% |
| under-one-fifteen | 1,693,000 | **1,690,000** | -0.18% |

`four-wheels` (deliberately off the generic formula) and `make-it-pull` are unchanged. No stat
threshold, lap ceiling or taste-match floor moved: all 19 probes pass with only the payout literals
edited.

### 5. Also measured, and disclosed rather than smoothed over

The three service-job templates carrying a `panels` task quote it off the installed stock `panels`
SKU, so the customer's price rises while the player's real cost (the body pipeline) does not. Mean
payout at `marginMin`, 50 seeds per shipped model, entry/everyday/enthusiast/flagship:
`small-bodywork-touchup` +32.9% / +28.1% / +49.0% / +83.7%, `put-her-in-a-ditch` +15.9% / +12.7% /
+16.8% / +20.0%, `one-off-widebody` +13.5% / +11.9% / +15.4% / +17.0%. Read the other way this is a
defect the lever partly closes: the game used to quote a few hundred yen of materials for a panel
tidy-up whose real fill-and-sand tin costs 1,900. `serviceJobPayout.test.ts`'s 1.15x profitability
invariant holds at the new values, untouched.

### 6. Every test touched, with directive 17's case

| file | what changed | case |
| --- | --- | --- |
| `packages/content/tests/economyApprovalGate.test.ts` | `partPricing.json` hash re-pinned, the eight mission payout/budget pins re-pinned, and the approval recorded in the ledger comment | **(a)** the pins assert the previously approved content; the approval of new values is what re-pins them |
| `packages/content/tests/partPricing.test.ts` | the `panels` literal 28,000 -> 140,000 and the `zonePanel` literal 6,000 -> 30,000, with their comments; the `zonePanel < panels` guard is asserted unchanged and now reads coherently, and the body-kit describe block's stale "the two bases hold the same number today" note is corrected | **(a)** the literals pinned the old approved values; the guard itself was never loosened and still passes on its own terms |
| `packages/sim/tests/advanceDay.test.ts` | the 30-day golden hash `20a6a0c2` -> `e254326b`, comment re-derived | **(a)** `baseCostYen.panels` is the shell's weight in `costWeightedBandFactor`, so every generated car's condition factor re-weights. No draw added or removed; re-run twice for determinism, and the file's own determinism test passes |

Nothing else was edited. `packages/content/data/storyMissions.json` moved eight payout/budget pairs
and `packages/content/data/partPricing.json` moved the two approved values; no test bound was
relaxed anywhere.

### 7. Checks

`pnpm typecheck` clean across content, sim and game (directive 20's carve-out: this reshapes no
field, but the change reprices a content surface every package reads, and it was run once).

Green, run once each: the whole `content` project (26 files, 573 tests), the whole `game` project
(63 files, 850 tests), and 76 of the 77 sim test files (75 under `tests/`, 2 under `tests/bots/`),
including `balanceProbes`, `plays`,
`carCondition`, `bands`, `marketValue`, `valueModelProbes`, `generationCoherence`, `serviceJobPayout`,
`stagedWork`, `beyondRepairPanels`, `tutorialProbe` and `storyMissionProbes`.
`harnessAcceptance.test.ts` alone was not run (pure performance model, reads no price). No bot
career was run (directive 21).

Notable: `balanceProbes.test.ts`'s donor invariant is **green at `panels` 140,000**, where the
pre-sprint-161 measurement had it failing above 45,000. Sprint 161 re-based that gate onto real
generated lots, which carry `zoneState` and so never read the shell's catalogue price; the cliff it
found was an artefact of the retired synthetic probe car.
