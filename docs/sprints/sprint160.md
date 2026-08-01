# Sprint 160: clear the ground under the panel price

## Goal

Sprint 159 made a panel able to be beyond saving or absent, so the repair bill now genuinely reads
the zone-panel price. The price itself is still wrong: a replacement panel costs less than the tin
of filler to repair one (840 yen against 1,900 at entry).

Three things stand between that and a one-line fix, and none of them is a gated number. Clear them,
re-ask the one question the new states change, and leave the price move as two values to sign.

## Definition of done

1. Body kits stop riding the bodyshell price. They get their own basis, pinned so that no price
   moves today.
2. The donor invariant in `balanceProbes.test.ts` either measures something still true, or is
   recorded as an exception with the reason.
3. One copy of the body-line capability rule, not three.
4. The Law 2 question re-asked at the candidate prices with the Sprint 159 states live: does
   generated body damage get quieter, and by how much.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.**

- `resolvePartPriceYen` and its `priceBasisPartId` indirection already exist. Twelve `aero` SKUs
  already point at `panels` through it. Pointing them at a new key is a content edit through
  machinery that already works.
- `baseCostYen` already carries per-basis keys, and `zonePanel` is already one of them. Splitting
  `bodyKit` out is the same move already made once.
- `bodyLineCapability` in `stagedWork.ts` already expresses the rule correctly. The fix is to export
  it, not to write it.
- Sprint 159's generation and bill paths already carry panel prices into `enforceMaxBillFraction`.
  The measurement re-runs them at different content values.

**Genuinely new.**

- One optional `baseCostYen` key, `bodyKit`.

## Design

**The body-kit split is the whole reason the price move looked dangerous.** Twelve `aero` SKUs are
priced from `baseCostYen.panels`, so raising the bodyshell drags every kit with it: at the candidate
value the flagship race kit would go from 75,600 to 405,000 yen. Giving kits their own basis at
today's value means their prices do not move at all, now or when the shell is repriced. The trap
stops existing rather than being tuned around.

`baseCostYen.panels` is currently doing two unrelated jobs: pricing a bodyshell, and pricing a body
kit. That is the defect, not the number.

**The donor probe measures a model that no longer describes these slots.** It asserts a car is worth
more repaired than parted out, using cars built without `zoneState`. The three body carriers are
zone-derived on every real car, so the probe's pricing path is not the one the game runs, and real
bills do not move when the shell price does. It goes red above roughly 50,000 while coherence wants
about 140,000. Re-base it onto cars that carry zone state, so it measures the live model. If it
still fails there, that is a real finding: stop and report rather than recording an exception.

## Levers (directive 22)

**No lever value moves in this sprint.** `baseCostYen.bodyKit` is new, and is set to **28,000**,
exactly today's `baseCostYen.panels`, so that every body-kit price is byte-identical before and
after. This is a refactor of what a number means, not a change to what it is.

The two values that do move, `baseCostYen.zonePanel` 6,000 to 30,000 and `baseCostYen.panels`
28,000 to 140,000, are **not implemented here**. They await the maintainer's signature and land in
their own change.

## Tasks

1. [x] Add the `bodyKit` basis, repoint the twelve `aero` SKUs, prove no price changed.
2. [x] Re-base the donor invariant onto cars carrying zone state.
3. [x] Export `bodyLineCapability`; have `gameStore.ts` read it instead of its inline copy.
4. [x] Measure Law 2 at the candidate prices with Sprint 159's states live.

## User-only tasks

Ratify or reject `baseCostYen.zonePanel` 30,000 and `baseCostYen.panels` 140,000.

Decide what to do about the five gates the re-based probes now fail (task 2 below). They were left
red deliberately: the design section above says to stop and report rather than weaken them.

## Exit

Ready for review. **Five tests are red on purpose** (`balanceProbes.test.ts` 1,
`plays.test.ts` 4); see section 2. Nothing was loosened to make them pass.

### 1. Task 4 first: does the candidate price quieten generated body damage?

**No.** Measured over 10,400 generated lots (26 models x 400 seeds, game year 1995), with Sprint
159's beyond-repair and missing states live, at `zonePanel` 6,000 / `panels` 28,000 against
`zonePanel` 30,000 / `panels` 140,000, same seeds both runs.

| class | n | body band steps/car | Law 2 clipped share | Law 2 steps removed/car | beyond repair | panel absent | mean bill | p90 bill |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| entry | 2800 | 10.0243 -> 10.0229 | 11.18% -> 11.18% | 1.7800 -> 1.7893 | 2.68% -> 2.61% | 0.75% -> 0.71% | 66,183 -> 66,266 | 90,220 -> 90,400 |
| everyday | 3200 | 8.4475 -> 8.4475 | 0.00% -> 0.00% | 0.0000 -> 0.0000 | 0.78% -> 0.78% | 0.13% -> 0.13% | 59,442 -> 59,472 | 87,410 -> 87,410 |
| enthusiast | 3600 | 7.2892 -> 7.2892 | 0.00% -> 0.00% | 0.0000 -> 0.0000 | 0.58% -> 0.58% | 0.08% -> 0.08% | 97,909 -> 97,965 | 160,440 -> 160,560 |
| flagship | 800 | 6.3637 -> 6.3637 | 0.00% -> 0.00% | 0.0000 -> 0.0000 | 0.13% -> 0.13% | 0.00% -> 0.00% | 145,996 -> 146,023 | 255,330 -> 255,330 |

Three of the four classes are byte-identical: not one car in 7,600 differs. Entry loses 26 band
steps across 2,800 cars (5 cars, 0.18 per cent, 0.0093 steps per car). The clipped share is
measured absolutely, not by A/B: each price was run against a fourth context with the Law 2 ceiling
lifted out of reach, so "clipped" means the guard genuinely removed damage that the roll produced.
It removes 1.78 steps per entry car today and 1.7893 at the candidates - the whole of the
difference is those 26 steps. Everyday, enthusiast and flagship are never clipped at all, at either
price.

The reason it is this quiet is worth stating for the pricing decision: **a zone panel enters a bill
only when a panel is beyond saving or absent**, which is 2.6 per cent of entry lots and under 1 per
cent everywhere else, so a 5x panel price moves the mean entry bill by 83 yen. The price move is
immaterial to generated damage in both directions.

One consequence outside the question asked, flagged rather than acted on: `baseCostYen.panels` also
sets `stockReplacementPriceYenByClass.panels`, which is a WEIGHT in `costWeightedBandFactor`. A 5x
shell price therefore changes what a car's panels condition is worth in its market value, on every
car, which is a valuation question rather than a damage one.

### 2. Task 2: the donor invariant, re-based, and what it now says

The prior finding was verified before anything was changed. The probe cars carried no `zoneState`;
every real generated car does. Raising `baseCostYen.panels` 28,000 to 140,000 moved **0 of 208**
real generated cars' bills and **26 of 26** probe cars'.

`buildUniformBandCar` now builds a `zoneState` at the requested band and derives the three body
carriers from it through `applyDerivedBodyBands`, so every probe car is on the live model. After
the re-base, **0 of 26 probe bills move** when the shell is repriced, matching the real cars
exactly. The blocker the sprint set out to clear is gone: the donor invariant no longer reacts to
`baseCostYen.panels` at all.

Two consequential changes came with it, neither optional:

- `computeModelBalanceProbe` charges the pipeline's own money for the three carriers
  (`bodyPartRepairBillYen`, the same call `carCostToBandYen` makes) and `repairRoughProbeCar`
  repairs the zone state rather than writing a derived band, so money and value still describe the
  same work and `applyDerivedBodyBands` stays the single writer.
- `plays.ts`'s `restoreToBand` did write those bands directly. Left alone it would have charged a
  body bill against a zone state it had already paid to repair, so it now takes the same route. It
  is a probe, not game code: nothing outside `plays.test.ts` calls it.
- The zone-repair projection lives once, in `bodyPipeline.ts` as `zoneStatesRepairedToBand`, read
  by both probes.

**It still fails, and now it fails at BOTH prices identically**, so per the design section above it
is reported rather than weakened:

| gate | failure |
| --- | --- |
| `balanceProbes.test.ts`: parting out never beats repairing | `honda-city-e-aa` parted 29,425 against sensible repair 16,923; `nissan-sunny-b12` 30,425 against 17,141 |
| `plays.test.ts`: full ordering by profit on entry and everyday | repair-to-mint out-earns repair-to-expectation on Wagon R, Carina, Sunny, Alto Works, City Turbo II and Sera |
| `plays.test.ts`: full ordering by yen per labour point | City E strips at 118/pt against 78/pt to fix it; Sunny 112/pt against 80/pt |
| `plays.test.ts`: the one inversion is enthusiast and flagship only | entry now inverts too, at `beyondDiscount` 0.4 |
| `plays.test.ts`: the cheapest car in every tier is not strippable | City E strips as found for +5,667 against a floor of zero |

Two mechanisms, both real:

1. **A body restoration is materials-only money.** `panelsRepairBillYen`'s own contract is that
   beating and welding are labour and never yen, so a shell goes from poor to mint for filler,
   primer, paint and underseal, on any car at any tier. That is what makes over-restoring pay where
   `beyondDiscount` says it should not.
2. **The Law 2 softening pass has finer granularity on the zone model**: it improves one zone one
   step at a time instead of lifting a whole part, so it stops nearer the ceiling instead of
   overshooting past it. The rough Honda City's guide value falls 37,400 to 34,978 and its buy
   price with it, which is what lifts stripping above zero. Its worst-case bill sits at 57,200
   against a 58,500 ceiling; the Sunny's at 66,700 against 67,500. Before the re-base both models
   softened to the same 57,370, well under either.

Neither depends on the panel price. Both are statements about the economy as it stands.

### 3. Task 1: the body-kit split, with the proof

`baseCostYen.bodyKit` enters `partPricing.json` at **28,000**, exactly today's `baseCostYen.panels`,
and the twelve `aero` body-kit SKUs repoint to it. No SKU addresses `panels` through
`priceBasisPartId` any more.

Proved by re-resolving the WHOLE catalogue against both sheets, not asserted: **472 SKUs compared,
0 prices moved.**

| kit | entry | everyday | enthusiast | flagship |
| --- | --- | --- | --- | --- |
| FRP Lightweight Body Kit (street) | 5,100 -> 5,100 | 5,800 -> 5,800 | 14,600 -> 14,600 | 32,800 -> 32,800 |
| FRP Sport Body Kit (sport) | 7,800 -> 7,800 | 9,000 -> 9,000 | 22,400 -> 22,400 | 50,400 -> 50,400 |
| FRP Carbon Body Kit (race) | 11,800 -> 11,800 | 13,400 -> 13,400 | 33,600 -> 33,600 | 75,600 -> 75,600 |

`zonePanel` was already a separate basis key and the split follows it exactly: an optional key on
`ByPriceBasisIdPriceSchema`, resolved by the `priceBasisPartId` indirection that already existed.
`partPricing.test.ts` gains a describe block pinning the twelve resolved prices and the fact that
nothing prices from `panels` by name.

### 4. Task 3: one copy of the capability rule

`bodyLineCapability` is exported from `stagedWork.ts` and `gameStore.ts`'s `pipelineActionPlan`
calls it. Swept afterwards: the only occurrence of the derivation left in the repo is the function
itself. `packages/sim/tests/beyondRepairPanels.test.ts`'s `FULL_CAPABILITY` is a fixture literal,
not a reading of `GameState`, and stays.

### 5. Levers

`baseCostYen.bodyKit` 28,000 is NEW and changes no price. `economyApprovalGate.test.ts` re-pins the
`partPricing.json` hash in the same change with that recorded; `economy.json` is untouched and its
hash holds. `baseCostYen.zonePanel` 30,000 and `baseCostYen.panels` 140,000 were measured against
locally-overridden content and **are not in the repo**.

### 6. Checks

`pnpm typecheck` clean across content, sim and game (directive 20's carve-out: this reshapes a
content schema key). Tests run file by file:

- Green: `partPricing.test.ts`, `economyApprovalGate.test.ts`, `integrity.test.ts`,
  `beyondRepairPanels.test.ts`, `storyMissionProbes.test.ts`, `valueModelProbes.test.ts`,
  `valueLedger.test.ts`, `stockCarValuationInvariant.test.ts`, `diagnosisFlows.test.ts`,
  `marketValue.test.ts`, `aftermarketPhysics.test.ts`, `gameStore.jobs.test.ts`.
- Red on purpose: `balanceProbes.test.ts` (1), `plays.test.ts` (4), all listed in section 2.

### 7. Tests changed, with directive 17's case for each

- `economyApprovalGate.test.ts`, the `partPricing.json` hash - **case (a)**. The file gained
  `baseCostYen.bodyKit`; the ledger entry above it records the key, the value and the proof that no
  price moved.
- `partPricing.test.ts` - **NEW describe block**, three tests pinning the split. Nothing existing
  was edited: the ladder assertions already grouped by price BASIS rather than by slot, so the
  twelve kits moving to their own basis needed no change there.
- `balanceProbes.test.ts` and `plays.test.ts` - **case (b), and NOT fixed.** These caught a real
  statement about the live model, which is exactly what the re-base was for. Fixing the code means
  moving economy levers, which is the maintainer's call under directive 22, so the assertions are
  untouched and the numbers are reported instead.
