# Machining: the integration map

**Status: INVESTIGATION ONLY, established from the shipped code on 2026-08-02. Nothing here is a
design, a decision or a proposal.** No code, content, lever or test was changed to produce it. Every
claim below cites a file and a symbol; where a design document and the code disagree, this document
follows the code and says so.

**What this is for.** Machining is the last unbuilt avenue of the tuning model
(`tuning-system.md` section 4) and it touches more shipped systems than anything built recently.
This maps where it would have to enter each of them, and what makes each entry awkward, so that the
design is written against the code rather than against documents that have repeatedly been found
stale.

**The baseline data it is being designed against** is `machining-system.md`'s 13-operation table
(maintainer, 2026-07-31, unsigned stand-in figures) and the `machiningCost` contract in
`desirability-system.md` section 3.

---

## 0. The problem in one table

Machining **modifies a part the player already owns** rather than replacing it. Every mechanism the
tuning and desirability models are built on reads the identity of a fitted catalogue SKU. That is
the whole of the collision.

| the quantity | what it reads today | symbol | a machined stock block |
| --- | --- | --- | --- |
| power gain | the fitted SKU's `statModifiers.powerFraction[character]` | `computeDerivedStats`, `derivedStats.ts:725` | reads 0: every stock SKU carries 0 on all three characters |
| support | the fitted SKU's `grade` through `specByGrade` | `slotContribution`, `support.ts:75` | reads `specByGrade.stock` = **0**: contributes no support at all |
| originality | the fitted SKU's `grade === 'stock'` | `stocknessOf`, `derivedStats.ts:130` | reads fully original: costs **nothing** |
| build intensity | the same `powerFraction` sum | `totalGainFractionOf`, `support.ts:114` | reads 0: costs no reliability |
| premium value | `part.grade === 'stock'` is skipped outright | `installedPartsValueYen`, `marketValue.ts:239` | contributes **zero yen** |
| repair bill | `catalogPart.priceYen` | `carCostToBandYen`, `bands.ts:196` | prices as an ordinary stock block |
| resale over the counter | `part.priceYen` | `usedPartSaleValueYen`, `bands.ts:117` | fetches an unmachined block's price |

**So a machined part is, to every one of those seven, indistinguishable from the part it was before
the money was spent.** The seam that exists (`machiningCost`) covers exactly one of the seven.

---

## 1. `machiningCost`: the one seam that exists

| | |
| --- | --- |
| Where | `packages/sim/src/derivedStats.ts:153` |
| Signature | `export function machiningCost(car: CarInstance): number` |
| Body | `void car; return 0` (the parameter is deliberately unread) |
| Callers | **exactly one in production**: `authenticityPercentOf`, `derivedStats.ts:193` |
| Test reference | `packages/sim/tests/authenticity.test.ts:252` asserts it returns 0 for an all-mint car |
| Consumed as | `raw = 100 * stockness - machiningCost(car)`, then `round(clamp(raw * conditionFactor, 0, 100))` |

**The contract, verbatim from `desirability-system.md` section 3 ("The cost mapping"):**

> The stand-in mapping: an operation's 1-to-10 rating IS its cost in authenticity points, summed
> over every operation applied to the car.
>
>     machiningCost(car) = sum of the authenticity rating of every operation applied

Three properties of that contract that bind the design:

| property | consequence |
| --- | --- |
| It takes `CarInstance`, not `PartInstance` | the whole record must be reachable from the car. A loose machined part in `partInventory` is not summed by anything |
| It is a **flat sum**, subtracted before the condition multiply | a full boost build costs 39 points off a base of 100 x stockness. It is not scaled by slot weight, by car, or by how much gain the operation bought |
| It is subtracted, not multiplied | the lower clamp arm in `authenticityPercentOf` becomes live for the first time once this returns a real number (`docs/carstats/authenticity.md` finding F2) |

**What is awkward.** The contract is car-scoped and the operations are part-scoped. A block that is
bored, decked and O-ringed, then pulled off the car and sold, takes 23 authenticity points with it
if the record lives on the part, and leaves them behind if the record lives on the car. Nothing in
the contract says which.

---

## 2. Power

### What it does today

`computeDerivedStats` (`packages/sim/src/derivedStats.ts:650`) is the only derivation of power in the
codebase. Two terms, and nothing else touches the number afterwards:

```text
power = spec.stockPowerPs * (powerConditionFloor + (1 - powerConditionFloor) * powerConditionFraction)
      + SUM over installed parts of
            spec.stockPowerPs * part.statModifiers.powerFraction[engineCharacter] * bandFactor(band)
```

The accumulation loop is `derivedStats.ts:718-726`. `engineCharacter` is resolved once per car by
`engineCharacterOf` (`derivedStats.ts:427`) from `spec.aspiration` and specific output, never from
what is fitted.

The shape a gain must have to enter: **a fraction of the car's own stock power, authored per engine
character, carried by a resolvable catalogue SKU, scaled by that SKU's own band.**

### Where machining would have to enter

There is one honest entry point and one dishonest one.

| route | what it means | cost |
| --- | --- | --- |
| **A third term in `computeDerivedStats`** | `power += stockPowerPs * machiningGainFractionOf(car, model, economy)` beside the existing two | a second power path, which `tuning-system.md` section 15 bans by name ("Must NOT be built: a second power path") |
| **Fold into the existing SUM** | a machined slot's contribution reads `powerFraction + machiningFraction` for that slot | keeps one path, but requires the per-slot machining record to be resolvable inside the loop |

### Does `powerFraction[engineCharacter]` fit the table's figures?

**Partly, and the mismatch is structural rather than a matter of values.**

| the table's shape (`machining-system.md`) | the code's shape | fits? |
| --- | --- | --- |
| two columns: NA gain, turbo gain | three characters: `high-strung-na`, `lazy-na`, `forced` | **no**. The table's single "NA" column has to be split, exactly as `tuning-system.md` 5d had to be corrected to two NA columns (`docs/carstats/power.md` finding 7) |
| a percentage of stock power | a fraction of stock power | **yes**, identical denomination |
| per operation, several operations per slot | per SKU, one SKU per slot | **no**. 13 operations across 7 slots; `camsTiming` has one (regrind), `block` has three (bore, deck, O-ring), `headValvetrain` has three (port, valve job, mill) |
| ranges (`+5-8%`, `+0-1%`) | a single number | **no**. There is no rolled or ranged modifier anywhere in the power model; `machining-system.md`'s own status line calls the figures stand-ins |
| turbo column assumes boost was pushed up because the machining allows it | `powerFraction` is additive and independent of what else is fitted (`docs/carstats/power.md` section 2e) | **no, and this is the deep one.** See below |

**The turbo column is not a gain, it is a permission.** Its own footnote says so: *"The turbo column
assumes boost is pushed up because the machining allows it. The roughly +55% total enabled gain is
divided across components by how much each one enables it."* The power model has no continuous boost
input to push (`tuning-system.md` amendment 5 records this as still missing), and every fraction in
it is independent by construction: `computeDerivedStats` reads whatever fraction the fitted SKU
carries and adds it, with no curve, threshold or unlock anywhere in the code
(`docs/carstats/power.md` section 2e). **An O-ringed deck at "+15% turbo, 0% NA" is not expressible
as a fraction at all**: on an NA car it must be 0, and on a turbo car it is not its own gain, it is
a share of somebody else's.

### The signed constraint machining is carrying

`TODO.md` (machining entry) and `tuning-arc.md` record it as a ruling rather than an aspiration:
the signed fractions cap a parts-only build at **x1.43** high-strung NA, **x1.57** lazy NA and
**x1.95** forced, which is correct for most of the roster and low for the RB26 and the 2JZ. The
same entry rules out the obvious fix by name: *"Raising `powerFraction.forced` to close the gap is
therefore explicitly the wrong lever and must not be proposed as the fix"*, because it corrects two
cars and inflates five. What is called for is **per-engine headroom**, which is a property of the
engine rather than of the part bolted to it.

**There is nowhere on `spec` to put that today.** The roster CSV's 58 columns
(`docs/design/midnight-garage-roster.csv`) carry `reliabilityBase`, `styleBase`, `styleCeiling` and
`aeroCeiling` but no machining or headroom column. Directive 24 means any such value is authored for
all 94 rows before a line of code is written.

---

## 3. Support

### What it does today

`supportRatios` (`packages/sim/src/support.ts:145`) computes five ratios, `support / demand`, and
`supportVerdict` (`:209`) takes the minimum. Both sides are assembled from one walk,
`computeContributions` (`:86`), whose per-slot atom is:

```ts
// packages/sim/src/support.ts:63
function slotContribution(car, partId, partsById, economy, engineCharacter): SlotContribution {
  const installed = car.parts[partId].installed
  if (!installed) return ZERO_CONTRIBUTION
  const part = partsById[installed.partId]
  if (!part) return ZERO_CONTRIBUTION
  const gain = part.statModifiers.powerFraction[engineCharacter]
  const spec = economy.statFormulas.support.specByGrade[part.grade]
  return { gain, spec }
}
```

`specByGrade` (`economy.json`, `statFormulas.support`): `stock 0, street 0.25, sport 0.60, race 1.0`.
Support is then `stockSupport(s) + SUM(supportWeights[s][slot] * contributions[slot].spec)`
(`support.ts:174-192`), with the supporting slots hard-named in that object literal.

### The answer to the brief's question

**No. The current shape does not allow a non-SKU to contribute spec at all.** `spec` has exactly one
source, `specByGrade[part.grade]`, and `grade` has exactly four values, of which a machined original
part necessarily reads `stock` = 0. There is no second term, no per-instance override, and no
content hook: `supportWeights` names slots, not sources.

This is the hardest of the eleven, for three separate reasons.

| reason | detail |
| --- | --- |
| **Five of the thirteen operations are support-only** | decking, O-ringing, full balance, con-rod peening, journal polish. Two of those (O-ring, rod peening) are marked "Supports only" with **0% direct gain on both columns**, so if support cannot receive them they do literally nothing |
| **Support is read as GRADE, deliberately, and never as band** | the doc comment at `support.ts:47-51` states the law: *"specification does not decay, a worn forged conrod is still stronger than a stock cast one"*. Machining is a permanent specification change to an existing part, which is the same category, and it has no field |
| **The headline is a minimum** | support added to a subsystem that was not the weak link buys exactly nothing (`docs/carstats/reliability.md` finding 2, measured: six race support parts left the headline at 0.6994 and the stat at 52, unchanged). So machining support that lands on the wrong subsystem is invisible, which is correct under the design and will read as a bug to a player |

**Where it would have to enter, concretely.** `slotContribution`'s `spec` would have to become
`specByGrade[part.grade] + machiningSpecFor(car, partId, economy)`, or `computeContributions` would
have to take a per-slot machining record. Everything downstream (`supportRatios`, `supportVerdict`,
`coherenceFactorFor`, `marketValue.ts`'s Stage C and Stage D, `reliabilityBreakdownOf`, the dyno's
five ratio rows) then follows for free, because all of them read the verdict rather than the parts.

**One property that survives and should be stated: the stock-car identity.** `supportRatios`'s doc
comment (`support.ts:130-137`) records that a stock car sits at exactly 1.0 on every subsystem *by
construction*, because every gain is 0, so `demand = 1`, the margin term is `margin * 0`, and every
spec is 0. Any machining support term must be 0 on an unmachined car or that identity breaks.

---

## 4. Reliability

### What it does today

`reliabilityBreakdownOf` (`packages/sim/src/derivedStats.ts:570`):

```text
reliability = spec.reliabilityBase
            * clamp(conditionFactor + coherenceFactor - 1, 0, 1)
            * intensityFactor
```

`intensityFactor = clamp(1 - stressCoefficient * totalGainFractionOf(car), 0, 1)`
(`reliabilityIntensityFactor`, `derivedStats.ts:527`; `stressCoefficient` 0.20).
`totalGainFractionOf` (`support.ts:114`) is the same `computeContributions` walk, summing
`powerFraction[engineCharacter]` over all 29 slots.

### Would machining gains feed it?

**Only if the machining gain enters `totalGainFractionOf`.** Today it cannot: that function sums
per-SKU fractions and a machined stock SKU carries 0.

Both answers have a real cost, and neither is obviously right.

| if machining gains DO feed intensity | if they DO NOT |
| --- | --- |
| the identity holds: "even a perfectly supported build moves more energy through the car than stock did" (`derivedStats.ts:508-520`) stays true of machined power as well as bought power | a fully machined engine reads its full `reliabilityBase` while making 40 per cent more power, which contradicts the doc comment above in the one case the doc comment was written for |
| machining becomes strictly worse per PS than an aftermarket part on reliability, because it also costs authenticity | machining becomes strictly better per PS than an aftermarket part on **every** axis at once: more power, no reliability cost, no authenticity cost from stockness, no support demand |
| `intensityFactor` at the ceiling: a maximal parts build already sits at 0.81 (measured, `docs/carstats/reliability.md` section 5). Adding machining gain on top drives it lower and the whole build toward the `budget` clamp | the second column is the "machining is strictly dominant" failure `desirability-system.md` Q4 already flagged for authenticity, arriving through reliability instead |

**And the demand side is separate from the intensity side.** `demandDrivers` (content,
`economy.json`) routes `cylinderPressure` off the `forcedInduction` slot alone and `revs` off
`camsTiming` alone. So a bored block that adds capacity adds demand to `fuelling`, `heat` and
`torqueTransmission` (all `kind: 'total'`) but **not** to cylinder pressure, which is exactly what
`tuning-system.md` 6c says should happen ("Boring that block adds capacity, which adds output, which
raises demand on fuelling, heat and torque transmission. It does not raise its own cylinder pressure
demand"). That much falls out for free **if and only if** the machining gain reaches `totalGain`.

### The four-term identity

`ReliabilityBreakdown` returns three loss terms and guarantees
`reliability + conditionLoss + coherenceLoss + intensityLoss === base` exactly (measured to 2.8e-14
over 3,250 combinations). `displayedReliabilitySplit` (`packages/sim/src/dyno.ts:354`) hands out
whole points by largest remainder over **exactly three** terms, and `DynoScreen.vue:150-163` renders
exactly three rows ("Wear", "The build not adding up", "The power itself"). A fourth machining loss
line means touching that arithmetic and that panel; folding machining into "The power itself" means
it needs no change at all.

---

## 5. State

### What exists today

`CarInstance` (`packages/content/src/carInstance.ts:132`) carries `parts` (29 explicit keys),
`symptoms`, `apparentBandByPartId`, `zoneState`, `history`, `damagePattern`.

```ts
// packages/content/src/carInstance.ts:28-36
const PartBaselineSchema = z.object({ partId: z.string().min(1), band: ConditionBandSchema })
const CarPartStateSchema = z.object({
  installed: PartInstanceSchema.nullable().default(null),
  vacatedBaseline: PartBaselineSchema.optional(),
})
```

```ts
// packages/content/src/part.ts:116
const PartInstanceSchema = z.object({
  id, partId, band, origin, pricePaidYen?
})
```

**A `PartInstance` has five fields and zero arrays.** There is no history, no operation list, no
per-instance modifier of any kind.

### Is there precedent for a list of applied operations?

**Exactly one, and it is not on a part.** `CarSymptom.runTestIds`
(`packages/content/src/carInstance.ts:90`, `z.array(z.string().min(1)).default([])`) is an
append-only list of operation ids applied to a sub-object of a `CarInstance`, written at
`packages/sim/src/diagnosis.ts:551` and `:687` and never removed. It is read derivationally:
`availableTestIdsFor` (`diagnosis.ts:462`) computes what is offerable from `runTestIds` plus content,
and the doc comment at `:456` states the law that the derived answer is never stored.

**That is the closest shape in the codebase to "this car's block has been bored and decked."**

Everything else that looks similar is not: `stagedCarWork` is a cart of *intent* wiped at Confirm;
`history` and `damagePattern` are single enums; `vacatedBaseline` is a single overwritten record;
`ServiceJob.tasks` is a list of required end states, explicitly "not what the player must DO"
(`serviceJob.ts:6-9`); `DayLog` is session-scoped and not persisted.

### The trap: where the record CANNOT live

**If a machining record is added as a sibling of `installed` on `CarPartState`, seventeen production
sites silently erase it.** Every one of these writes a fresh `{ installed: ... }` object literal
rather than spreading the existing `CarPartState`:

| site | what it does |
| --- | --- |
| `packages/sim/src/jobs.ts:189` | repair-zone completion, per part |
| `packages/sim/src/jobs.ts:222` | install completion |
| `packages/sim/src/stagedWork.ts:588, 593, 601, 620` | staged repair, assembly remove, assembly refit, panel swap |
| `packages/sim/src/serviceJobs.ts:517` | customer-car repair |
| `packages/sim/src/bodyPipeline.ts:185` | derived body band write |
| `packages/sim/src/assemblies.ts:393` | assembly member refit |
| `packages/sim/src/diagnosis.ts:43, 97` | `apparentViewOf`, cause application |
| `packages/sim/src/auctions.ts:317, 1114, 1134` | generation wear, workup climb, fresh part |
| `packages/sim/src/plays.ts:188` | probe repair |
| `packages/game/src/stores/gameStore.ts:1439, 1636` | store-side cause and band writes |

Two sites write a second key, and both write `vacatedBaseline` explicitly: `jobs.ts:640`
(`resolveRemovePart`) and `assemblies.ts:277` (a member pulled into a container). **A record on
`PartInstance` survives all of these**, because every one of those sites
either spreads `...installed` or replaces the instance outright, and replacing the instance is the
correct semantics: a new part is not a machined part.

### Save schema

`SAVE_VERSION` is **55** (`packages/game/src/save/saveCodec.ts:650`). Directive 19 suspends
migrations pre-launch: a new optional field is a version bump and nothing else.

---

## 6. Tool tiers

### What tier 3 buys today, per group, verified against content

The design documents' claim, in two places, is that tier 3 buys nothing:

> `repairBandCeilingByTier` is `{1: "fine", 2: "mint", 3: "mint"}`. **Tier 3 currently
> buys nothing over tier 2.** (`tuning-system.md` 4c)

> `repairBandCeilingByTier` is `{1: fine, 2: mint, 3: mint}`, so tier 3 today buys nothing at all
> over tier 2. (`TODO.md`, machining entry)

**The premise is true and the conclusion is false.** `repairBandCeilingByTier` genuinely does not
differ at index 3. Three other tier-keyed mechanisms do.

| mechanism | file | literal | differs at 3? |
| --- | --- | --- | --- |
| `repairBandCeilingByTier` | `economy.json` | `{1:"fine", 2:"mint", 3:"mint"}` | **no** |
| `energy.energyPerBandStepByToolTier` | `economy.json` | `{1:5, 2:4, 3:3}` | **yes**, 25 per cent less labour per band step, all six groups |
| `toolCeilings.naToTurboConversionEngineTier` | `economy.json` | `3` | **yes**, engine only: tier 3 is what unlocks the first NA to forced-induction fit (`naToTurboConversionBlocked`, `jobs.ts:895`) |
| service-job `minToolTier` | `serviceJobTemplates.json` | per task | **yes**: 10 templates need tier 3 somewhere |
| body polish floor via `fullCapability` | `stagedWork.ts:121`, `bodyPipeline.ts:614` | floor 0 vs 1 | **yes**, body only |

Service-job templates needing tier 3, by group: engine 7 tasks across 4 templates
(forced-induction-conversion, engine-internals-rebuild, full-restoration, full-blueprint-build);
body 6 tasks across 4; suspension 4 tasks across 2; drivetrain 1 task across 1; **wheels 0,
interior 0**.

**So the claim is only near-true for `wheels` (¥350,000) and `interior` (¥700,000)**, where tier 3
buys the labour-speed step and nothing else. It is plainly false for engine and body.
`docs/design/systems/tooling-system.md` already carries the accurate account.

### The fiction is already in the content

`toolLines.json`, engine tier 3: **`"displayName": "Machine-shop tooling", "upgradePriceYen":
1500000, "minReputationTier": "known"`**. The engine line's top rung is already named for this
feature.

### What a facility would cost to add

There is no owned "room" today. The three existing facility shapes:

| shape | state | precedent value |
| --- | --- | --- |
| bays | `serviceBayCount` / `parkingBayCount` / `forecourtBayCount`, `BayKindSchema` is a closed enum of three (`facilities.ts:11`) | adding a fourth kind needs new `GameState` fields plus one `case` in each of four accessors (`facilities.ts:39-46`) |
| tool line | `toolTiers[group]`, own-only, bought via a rolled classified listing | the only own/upgrade ladder |
| dyno | `DynoStateSchema` `{owned, hirePaidDay, sessionCarId}` (`gameState.ts:255`), `economy.dyno` = hire ¥15,000 / buy ¥750,000 / rep `known` | **the closest precedent**: a facility that is not a tool line and not a bay, own-or-hire, with its own reputation gate. Its own doc comment (`dyno.ts:36-41`) frames it as "structurally a workshop tool that is not a tool line" |

---

## 7. The work itself: which pipeline machining should reuse

Three existing ways work happens. All established in code.

| | (a) Job | (b) Staged work | (c) Recondition (bench) |
| --- | --- | --- | --- |
| type | `Job`, `packages/content/src/job.ts:27` | `StagedAction`, `packages/content/src/stagedWork.ts:27` | `Job` with `kind: 'recondition-part'` |
| state | `GameState.jobs` | `GameState.stagedCarWork`, wiped at Confirm | `GameState.jobs` |
| resolver | `resolveJobLabor`, `jobs.ts:1131` | `confirmStagedWork`, `stagedWork.ts:406` | `resolveReconditionLabor`, `jobs.ts:1312` |
| addresses | a car | a car (every resolver starts `findWorkableCar`) | **a loose `PartInstance`**, bin or bench container (`findLoosePart`, `jobs.ts:1160`) |
| multi-day | **yes**, `laborSlotsSpent` accrues on a persisted job | no, each action is atomic within a day | **yes**, same mechanism |
| charged | once, at job creation (`repairJobGate`, `jobs.ts:774`) | at Confirm, per action | once, at creation; the spend lands on the instance's own `pricePaidYen` (`jobs.ts:1337`) |
| service bay | required | required | **exempt** (`applyAvailableLaborToJob`, `jobs.ts:1065`) |
| can carry a named operation? | no: `kind` + address + one `targetBand` | **yes**: a 7-member discriminated union with per-kind payloads (`colour`, `zoneId`, `partInstanceId`) | no |
| result it can express | a `ConditionBand` (capped at `mint` by `climbBand`, `bands.ts:41`), a slot occupancy flip, or nothing at all | a zone severity mutation, a slot flip, a band climb | a `ConditionBand`, capped at `mint` |

### The assessment

**Machining should reuse the recondition path's shape: a `Job` with a new `kind`, addressing a loose
`PartInstance`.** Four reasons, each from the code:

1. **It is the only path that addresses a part rather than a car.** `findLoosePart` /
   `updateLoosePart` (`jobs.ts:1160`, `:1177`) already handle both the parts bin and an open
   assembly container's members. Staged work has no loose-part addressing at all.
2. **The precedent for a job kind that is not a band climb already exists.** `dyno-session`
   (`JobKindSchema`, `job.ts:20`) costs labour, completes, and writes state that is neither a band
   nor a slot (`recordDynoSession`, `dyno.ts:86`). Its own doc comment says why it was built that
   way: *"there is one job system and this is it"* (`dyno.ts:227-231`).
3. **The cost sink exists.** A bench recondition adds its charge to the instance's own
   `pricePaidYen` rather than a car ledger, because there is no car (`jobs.ts:1332-1340`). Machining
   a loose part has the same problem and the same answer.
4. **Directive 16.** `workshop-topology.md` section 2 names machining, the dyno, engine swaps and
   the scrapyard as four features that each invent a physical act with nowhere to perform it, and
   says building any of them separately is "exactly the failure directive 16 exists to prevent, and
   it is the failure the Sprint 08 service-jobs rework was caused by."

**What that reuse does not give, and what makes it awkward.** A `Job` cannot carry which operation
was chosen: it has `kind`, one address, one optional `targetBand`, and two integers. Thirteen
operations across seven slots need either thirteen job kinds (absurd), or a new field on `Job`, or
the operation chosen at staging time and the job merely executing it. **The staged-work union is the
only structure in the codebase that carries a named operation with its own payload**, and it is
car-scoped. That is the tension: the addressing is right in (c) and the payload shape is right in
(b).

Cost of adding a kind: one enum member in `JobKindSchema`, refines in `JobSchema`, a branch in
`completeJob` (`jobs.ts:279`), a resolver modelled on `resolveReconditionLabor`, and a `DayLogEntry`
type (which forces a `cashMovementFor` case, section 11).

---

## 8. `machineShopAssist`

### What it actually gates

| | |
| --- | --- |
| Content | `economy.json`: `feeYenByGroup` = engine 15,000, drivetrain 18,000, suspension 5,000, wheels 3,000, body 14,000, interior 7,000; `signatureSlotsByGroup` = suspension `[dampers, springs]`, body `[panels, underbody]`, interior `[seats, dashGauges]`; `probeAmortisationOps` 40 |
| Granularity | **per day, per group, shop-wide.** State is `machineHirePaidDayByGroup` (`gameState.ts:535`); predicate `machineHiredToday` (`jobs.ts:427`) is `machineHirePaidDayByGroup?.[group] === state.day` |
| Universal gate | `hasMachineLineFor(group, state)` (`jobs.ts:437`) = `toolTiers[group] >= 2 \|\| machineHiredToday(group, state)` |
| Charging | `resolveHireMachineLine` (`jobs.ts:531`). Booked as a **running cost** (bucket `running`, `cashLedger.ts:84`), never on a car ledger |

Three structural predicates funnel through it: buried engine and drivetrain slots
(`removeMachineGateGroup`, `jobs.ts:383`), the six signature slots (`signatureGroupFor`, `:399`),
and a bench tyre fit (`benchSwapGateGroup`, `assemblies.ts:139`). Plus the body pipeline's weld
stage and better paint finish (`stagedWork.ts:222`).

Notably it **cannot** substitute for a tool tier on a service job: `resolveAcceptServiceJob`
(`serviceJobs.ts:730`) reads `state.toolTiers` only.

### The design docs' claim, verified

> **`machineShopAssist` is NOT the home for this.** That is basic tool hire, for bringing in an
> engine crane for a day, and it is priced and scoped as such. (`tuning-system.md` 4b)

**Confirmed by the code.** `machineShopAssist` is a per-day access gate over existing operations; it
does not appear in any stat, value, or support derivation, and its fee attaches to no part and no
car. It shares the tier-2 threshold with tool ownership, so it is the *tier-2* rental, not a tier-3
capability. There is no reading of it under which it could carry a per-operation permanent
modification of a part.

**One naming hazard worth recording.** The maintainer's standing instruction (`TODO.md`) is that
prose must not say "machine line" or "hire the line"; the identifiers may stay. A machining feature
sitting next to `machineShopAssist`, `machineHirePaidDayByGroup`, `hasMachineLineFor`,
`machineLineGroupFor`, `machineListings` and a `blockedReason` of the literal string
`machine-line` will make every one of those ambiguous.

---

## 9. Value

### What the valuation path reads about part identity

`marketValueYen` (`packages/sim/src/marketValue.ts:304`) is `stagedValue + creditedPremiumYen`. Four
places read part identity or grade.

| symbol | file:line | what it reads | a machined stock part |
| --- | --- | --- | --- |
| `installedPartsValueYen` | `marketValue.ts:228` | skips `installed.band === 'scrap'`; skips `part.grade === 'stock'`; else `part.priceYen * retention` | **contributes exactly zero yen.** Every yen of machining spend vanishes from the premium |
| `foundationFactor` | `marketValue.ts:255` | the worst band across `valuation.foundation.parts` (`tyres, brakePadsDiscs, brakeCalipersLines, steering, chassis, underbody`) | none of the six is a machinable slot, so machining never disturbs it |
| `costWeightedBandFactor` | `bands.ts:282` | weights each part's band factor by `stockReplacementPriceYenByClass[carFitmentClass]` | invisible: the weight is the taxonomy's generic stock price, not the instance's |
| `carCostToBandYen` | `bands.ts:196` | `costToMintYen(band, entry, catalogPart.priceYen, ...)` | a machined block's restoration bill is an ordinary block's |

**The premium rule is the collision.** `installedPartsValueYen`'s own doc comment states it as law:

> A `grade === 'stock'` installed part contributes NOTHING here - stock is the baseline every slot
> starts from, not an upgrade, so an all-stock-mint car's value is exactly clean value and only
> street/sport/race aftermarket pushes above book, regardless of `retention`'s value.

So the numbers-matching machined build, which `tuning-system.md` 4a exists to give a real
performance path, is worth **exactly book value**. It has spent money, gained power, kept its
authenticity, and moved the price by zero.

The one thing that could carry it is already sitting there and already documented as a placeholder
for exactly this. From `TODO.md`:

> `valuation.expectationByTier.flagship.beyondDiscount` is 1.3, the return on work done BEYOND a
> car's expected condition band. A flagship's expected band is `mint`, and `billAboveYen` is
> computed as `billToMintYen - billToExpectedBandYen`, so for a flagship that subtraction is always
> zero and the 1.3 multiplies nothing. [...] **It is a placeholder, not a mistake.** [...] When
> machining lands, that lever becomes live and flagships gain the one thing their expectation
> currently forbids: somewhere to spend past perfect.

Verified in content: `expectationByTier.flagship` = `{band: "mint", beyondDiscount: 1.3,
aftermarketReturn: 1}`, and `mint` is the top `ConditionBand` (`tags.ts:98`).

### The two leaks off the car

| path | symbol | consequence |
| --- | --- | --- |
| selling a loose part over the counter | `usedPartSaleValueYen(partPriceYen, band, economy)`, `bands.ts:117` | a machined block fetches an unmachined block's price. Machining is a one-way money burn on any part that later leaves the car |
| scrapping it | `scrapValueYen(taxonomyEntry, ...)`, `bands.ts:129` | prices off `stockReplacementPriceYenByClass`, entirely blind to the instance |

`computeDonorBalanceProbe` (`balanceProbes.ts:618`) asserts the donor-economy law that a clean car
must never be worth more parted out than sold whole; it reads `usedPartSaleValueYen` directly.

### The hard constraint that binds all of it

`car-performance/README.md` 7a, restated in `tuning-system.md` 16: *"it does not move prices...
treat 'the handling number moved, so the price should move' as a bug, not a feature."* And the
maintainer's own standing ruling: **a car is never worth more because it is faster.**
`marketValueYen` takes no derived stat at all. So machining cannot reach value through the power it
makes. It can only reach it through what was spent, what condition the part is in, or what a buyer's
taste says about the resulting authenticity and style.

---

## 10. The dyno

### What it reports today

`DynoReading` (`packages/sim/src/dyno.ts:278`) is a projection of four existing derivations and
nothing else: `engineCharacterOf` / `specificOutputOf`, `computeDerivedStats`, `supportRatios` /
`supportVerdict`, `reliabilityBreakdownOf`. `DynoScreen.vue` renders four panels:

| panel | `data-test` | what it shows |
| --- | --- | --- |
| How it responds | `dyno-character` | engine character, PS per litre, rotary equivalency note |
| What it makes | `dyno-power` | `powerPs` against `stockPowerPs`, and the delta |
| What holds it together | `dyno-support` | five ratio rows, weakest flagged, headline band, shortfall copy |
| What it is carrying | `dyno-reliability` | the stat against `reliabilityBase`, then three loss rows |

### Where machining would appear

**Everywhere, and mostly for free.** Every panel reads a derivation rather than the parts, so a
machining term that enters `computeDerivedStats`, `supportRatios` and `totalGainFractionOf` shows up
in all four without the screen changing. That is the property `dyno.ts:274-277` was built for: *"This
interface is a projection of those four; if any of them moves, this moves with it, which is the
point."*

**Two places have no room.**

1. **The reliability split is exactly three terms and the arithmetic depends on it.**
   `displayedReliabilitySplit` (`dyno.ts:354`) distributes whole points by largest remainder over a
   three-element array, against what the rounded stat leaves to explain, and the four displayed
   integers are guaranteed to sum to `base` (measured over 3,250 combinations, worst deviation 0).
   A fourth machining line is a change to that function, its guarantee and the panel.
2. **Nothing tells the player what a machined part IS.** The support panel names a subsystem; the
   power panel names a delta. Neither can say "this block has been bored and O-ringed", because
   nothing in `DynoReading` carries an operation. `tuning-system.md` 7c's law is that a consequence
   the player could not have foreseen is a punish; if machining costs authenticity permanently, the
   readout that explains the trade has to exist somewhere, and the dyno is where precision lives.

---

## 11. The integration points nobody has listed

These are the ones not on the brief, found by walking the code outward from the seven collisions in
section 0.

### 11a. `cashMovementFor` is exhaustive and will not compile without a decision

`packages/content/src/cashLedger.ts:41` switches over every `DayLogEntry` type with no default. Its
own doc comment: *"Deliberately exhaustive over the discriminated union [...] a new `DayLogEntry`
type is a compile error here rather than a yen that quietly falls out of the week's arithmetic."*

Machining's charge must land on exactly one of the five buckets: `income`, `onCars`, `stock`,
`running`, `investment`. The attribution law is stated in `CarLedgerSchema`'s doc comment
(`gameState.ts:78-89`): *"a cost attributes to a car when it is charged FOR that car, and accrues to
the business when it is not."* A machined block on the car is `onCars`; a machined block on the
bench is `stock`; the facility itself is `investment`. **The same operation is two different buckets
depending on whether the part is fitted**, which is the same split `job-created` already handles by
branching on `entry.kind` (`cashLedger.ts:65-70`).

The weekly cost sheet reconciles to the till to the yen (`netCashYen`, `cashLedger.ts:131`), so
this is not cosmetic.

### 11b. `CarLedger` has three spend lines and machining is none of them

`CarLedgerSchema` (`gameState.ts:91`): `purchaseYen`, `repairYen`, `partsYen`, `listingFeesYen`.
Machining is not a repair (it does not climb a band) and not a part (nothing was bought). It either
takes a fourth line or is filed under one of the three, and the Finances panel on
`CarDetailScreen.vue` renders these by name (`data-test="finance-repairs"`, `:1694`).

### 11c. Generation

`generateAuctionCarInstance` (`packages/sim/src/auctions.ts`) already fits aftermarket SKUs at up to
`maxAftermarketSlots` (3) per car, off `partsGeneration.aftermarketChance` (0.06) scaled by the car's
rolled `history`. It can therefore already produce an incoherent build.

**A machined lot is a new decision, not a default.** `tuning-system.md` 18 question 2 asks the
equivalent question about incoherent builds and rules that it *"must be a deliberate decision, and
if taken, the pre-purchase inspection routes need some way to smell it."* A machined engine on an
auction lot is strictly harder than that, because machining is invisible: `apparentViewOf`
(`diagnosis.ts:37`) swaps bands, and there is no band to swap.

### 11d. The concours gate becomes reachable and then loseable

`economy.json` `reputation.concoursSaleMinAuthenticityPercent` is 85, read by
`saleReputationDeltaFor` (`packages/sim/src/carCondition.ts`) via the exported
`authenticityPercentOf`. With every part mint the condition factor is exactly 1, so at the gate
authenticity IS stockness: **a concours car may give up at most 15 of the 100 authored points**
(`docs/carstats/authenticity.md` section 5).

On the stand-in scale, a "careful freshen" (valve job 1 + full balance 1 + journal polish 1) costs 3
and holds concours. A "mild road port" costs 15 and lands exactly on the boundary. A full boost
build costs 39 and does not. That threshold is currently gating on a number no player can influence;
machining is what makes it a choice, and the three worked examples land on both sides of it.

### 11e. Part provenance and the free-refit rule

`PartOrigin` (`part.ts:93`) is stamped at birth and immutable; `provenance.ts` routes every
ownership question through it. Machining does not create a part, so origin is untouched. But
`refitLaborSlotsFor` (`jobs.ts:66`) compares a refitted instance against the slot's
`vacatedBaseline` on `{partId, band}` **only**. A machined block pulled and refitted matches on both,
so the refit is free, which is correct; but if machining ever changed the effective `partId`, the
free refit would silently stop working.

### 11f. Story-mission and service-job requirements

`packages/content/src/requirement.ts` carries stat floors, and `serviceJobTemplates.json` carries
`minToolTier` per task. Machining moves power and authenticity, so mission satisfiability shifts
even with no new integration. `packages/sim/tests/storyMissionProbes.test.ts` holds closed-form
satisfiability probes over these; it is the place a machining power ceiling would first show up as a
failure.

### 11g. The taste pipeline, which is where the money actually is

`tasteMatchFor` (`packages/sim/src/valuation.ts`) normalises all five stats and matches against
`buyers.json` `statTargets`. `collector` weights authenticity 1.00 at target 0.90; `stancer`,
`tuner` and `racer` weight it 0.00. `tasteSpread` is 0.12.

So machining's authenticity cost reaches money **only through the collector**, and only within a
+/-12 per cent band. On the stand-in scale a full boost build costs 39 points, which takes a mint
stock car from 100 to 61 and puts the collector's 0.90 target out of reach entirely. **The
authenticity half of machining is a collector-only mechanic** with the current buyer table.

### 11h. Aspiration, character, and the operation that is only meaningful on a turbo

`engineCharacterOf` reads `spec.aspiration` and never what is fitted, so a converted NA car keeps its
NA fraction column permanently (`docs/carstats/power.md` finding 3, pinned by
`proportionalPower.test.ts`). Milling is "usually skipped on turbo builds" and O-ringing is
turbo-only; both are conditioned on the state of the car's induction, and the model's one answer to
that question is a property of the MODEL that a fitted turbo does not change.

### 11i. Rotational inertia does not exist

The lightened flywheel operation ("faster rev pickup; no change to peak power") has no term anywhere
in the performance model. `packages/sim/src/performance.ts` derives acceleration from power and
mass; there is no inertia, no rev-rate and no gearing. `PhysicalModifierSchema` (`stats.ts:110`) is
`grip`, `braking`, `mass`, and a flywheel is a few kilos against a kerb weight. See section 13.

---

## 12. What breaks if machining ships as "just another SKU"

`tuning-system.md` 4b proposes exactly this: *"A machined block is still one SKU in one slot. Only
the route differs."* Here is what that costs, specifically.

| # | breakage | why |
| --- | --- | --- |
| 1 | **Authenticity inverts.** A machined-block SKU has a `grade`. If `stock`, `machiningCost` is the only cost and `stocknessOf` charges nothing, so the SKU's grade is doing no work. If anything else, `stocknessOf` charges the **full** 18 points for `block` and machining costs *more* authenticity than fitting an aftermarket block, which is the exact opposite of the design | `stocknessOf`, `derivedStats.ts:130`; weights in `parts-taxonomy.json` |
| 2 | **The `machiningCost` seam becomes dead on arrival.** If the SKU carries the cost through its grade, the summed-operations contract in `desirability-system.md` section 3 never fires, and the 13-operation table cannot be expressed at all: one SKU per slot means one operation per slot | `derivedStats.ts:153`; one slot holds one part |
| 3 | **The combinatorics are impossible.** 13 operations, several per slot, freely combinable. `block` alone has bore x deck x O-ring = 8 states, before the four fitment classes and four grades the catalogue already multiplies by. The catalogue is 472 SKUs at 4 classes x 4 grades x 29 slots; machining SKUs would multiply that, not add to it | `parts.json`; `PartCatalogEntrySchema`, `part.ts:19` |
| 4 | **The pricing ladder rule is violated by construction.** `partPricing` and its guard hold "climbing a ladder never improves value per yen" (`tuning-system.md` amendment 4). A machining SKU's price is machine time, not a catalogue rung, so it sits outside the ladder it would have to be priced against | `packages/content/tests/partPricing.test.ts` |
| 5 | **The part it replaces is destroyed.** Installing a SKU into an occupied slot is refused unless the target is `panels`/`paint`/`underbody` (`applyJobToCar`, `jobs.ts`), so machining-as-install means remove, then install a different SKU. The original part is now a loose instance in inventory and the car is carrying a different part. **That is a replacement, which is the one thing machining is defined as not being** | `resolveRemovePart`, `jobs.ts:589` |
| 6 | **Value double-counts or under-counts.** A non-stock machining SKU contributes `priceYen * retention` to the premium, so machining gets aftermarket-grade value credit while claiming to preserve originality. A stock one contributes zero, so the spend evaporates | `installedPartsValueYen`, `marketValue.ts:239` |
| 7 | **`chassis` is unreachable and `paint` has no ladder.** Two slots already cannot receive a fitted SKU through the player's own flow (`docs/carstats/authenticity.md` findings F1a and F3). Neither is a machining slot, but they are evidence that "one SKU in one slot" is already not a universal rule | `removeBlockReason`, `jobs.ts:709` |
| 8 | **`aftermarketReturn` withholds it by tier.** The premium is scaled by the car's tier: entry 0.3, everyday 0.6, enthusiast 0.9, flagship 1.0. A machining SKU on an entry car returns 30 per cent of what was spent, which is correct for a bought part and wrong for machine time, and `desirability-system.md` section 4 rules `aftermarketReturn` unmovable | `expectationForCar`, `marketValue.ts:161` |

**The one thing the SKU route does get right** and any alternative must preserve: it keeps the
support model working, because `slotContribution` reads the fitted SKU's grade, and a machining SKU
with a non-stock grade contributes real `spec`. Every non-SKU design has to solve section 3
explicitly.

---

## 13. Which of the 13 operations the model can express today

`Direct` = a power gain; `Supports` = a `spec` contribution to a subsystem.

| operation | slot | direct | supports | expressible today? |
| --- | --- | --- | --- | --- |
| Port & polish, gasket match | headValvetrain | +5-8% NA, +12% turbo | yes | **direct: yes** as a fraction. **support: no** (`revs`, needs a non-SKU spec source) |
| 3/5-angle valve job | headValvetrain | +1-3% / +3% | no | **yes**, cleanly. The single easiest operation to express |
| Milling / skimming | headValvetrain | +2-4% / ~0% | no | **partly.** The `~0%` turbo case is a conditional on aspiration, which `powerFraction`'s three columns can carry (`forced` = 0) |
| Deshrouding / blending | headValvetrain | +1-2% / +2% | no | **yes** |
| Bore & hone | block | +1-2% / +5% | yes | **direct: yes. support: no.** Also the operation whose real point is capacity, and `displacementCc` is display data the physics never reads (`tuning-system.md` 2) |
| Decking | block | +1% / +5% | yes | **direct: yes. support: no** |
| O-ringing the deck | block | **0% / +15%** | **supports only** | **NO HOME AT ALL.** Zero direct on both columns, and its entire effect is a `cylinderPressure` spec contribution, which `specByGrade` cannot receive from a non-SKU |
| Full balance | rotating assembly | +0-1% / +4% | yes | **direct: marginal.** 0-1% NA is below the rounding floor on most cars. **support: no.** And "rotating assembly" is not a slot: the taxonomy has `internals`, and a flywheel is not in it |
| Con rod shot peen & polish | internals | **0% / +4%** | **supports only** | **NO DIRECT HOME.** Same shape as O-ringing: support-only, and support is closed |
| Journal polish | crankshaft | ~0% / +1% | yes | **NO HOME.** `crankshaft` is not a `CarPartId`; it falls inside `internals`. Direct effect rounds to nothing |
| Knife-edging | crankshaft | +0-1% / +1% | no ("direct, tiny") | **NO SLOT.** Same as above. Sub-1% on a 55 PS kei car is 0.55 PS, which rounds away (`docs/carstats/power.md` section 4) |
| **Flywheel lightening** | flywheel | **0% / 0%** | **neither ("feel")** | **NO HOME AND NO SLOT.** There is no flywheel slot, no rotational inertia in `performance.ts`, and no dial in `PhysicalModifierSchema` it could move. Its authored effect is explicitly zero on both power columns |
| Camshaft regrind | camsTiming | +5-10% / +3% | no | **yes.** And it drives `revs` demand for free, because `demandDrivers.revs` reads the `camsTiming` slot |

### Summary

| category | count | operations |
| --- | --- | --- |
| Expressible as a `powerFraction`-shaped gain today | 5 | valve job, milling, deshrouding, cam regrind, and the direct halves of port & polish / bore / decking |
| Have a direct effect but no slot | 3 | full balance, journal polish, knife-edging (`rotating assembly`, `crankshaft` and `flywheel` are not `CarPartId`s) |
| **Support-only, and support has no non-SKU entry** | 2 | O-ringing the deck, con-rod shot peening. **These two do literally nothing under any design that does not solve section 3** |
| **No expressible effect of any kind** | 1 | flywheel lightening |

**Three of the thirteen name a component the game has no slot for.** `ALL_CAR_PART_IDS` is a closed
29-member enum (`tags.ts:54`); `internals` is the nearest home for all three, and putting three
different operations on one slot is precisely what "one SKU in one slot" forbids.

---

## 14. Guards and invariants machining must satisfy or change

### 14a. The three stock-car identities, which are design constraints wearing test clothes

**A machined car is still an all-stock-parts car.** Three shipped assertions say what an all-stock
car is worth and what it reads, in exact equalities, and each of them is a statement of the design
rather than a calibration.

| assertion | file | the exact claim |
| --- | --- | --- |
| authenticity | `packages/sim/tests/authenticity.test.ts` | all stock and all mint is **exactly 100** on all 26 shipped cars. `authenticityPercentOf`'s own doc comment calls it "the definition of the stat, not a calibration of it" |
| value | `packages/sim/tests/stockCarValuationInvariant.test.ts:37` | every shipped car with no aftermarket parts values at **exactly** `round(model.bookValueYen * mileageFactor(0, ECONOMY))`, "Stage C and Stage D touch nothing here" |
| support and reliability | `packages/sim/tests/reliabilityModel.test.ts`, `supportRatios.test.ts` | a stock car sits at exactly 1.0 on all five subsystem ratios and reads exactly its own `spec.reliabilityBase` |

**Each predicate is "no aftermarket parts", not "unmachined".** So every one of them either gains an
explicit "and unmachined" clause, or machining is neutral on that axis. That is not a test-editing
decision, it is three design decisions, and directive 17 applies to all three.

### 14b. The designed landing site

`packages/sim/tests/authenticity.test.ts` carries, verbatim:

```ts
describe('the machining seam', () => {
  it('costs zero on every car, because no machining operation exists to apply', () => {
    for (const model of CARS) {
      expect(machiningCost(carWith({}, 'mint', model))).toBe(0)
    }
  })
})
```

**This is the one test written to be replaced.** Its title becomes false the day an operation
exists. Everything else in that file must hold unchanged: the 82 / 83 / 58 pins are unmachined
builds, the authenticity weight column still sums to exactly 100, and the `paint` 11-point floor is
reserved for a paint-ladder change and must not move here.

### 14c. Guards that machining would break, by cost

**High: re-pins that need real measured runs, not hand edits.**

| guard | what it pins | why machining moves it |
| --- | --- | --- |
| `packages/sim/tests/proportionalPower.test.ts` | the five caps (x1.43 / x1.57 / x1.95 / x1.63 / x1.85) and a per-car `EXPECTED_MAX_POWER_PS` table for all 26 cars; power is order-independent with no compounding | machining raises the maximal build on every car. The no-compounding property is the structural one: several table operations read as multiplicative and the model is a sum |
| `packages/sim/tests/advanceDay.test.ts:245, :413` | two `hashState` goldens, `'e254326b'` (30-day career) and `'4dcee9b0'` (acquisition to sale) | `hashState` is FNV-1a over key-sorted JSON of the whole `GameState`. **Any new persisted field moves both, with zero behaviour change** |
| `packages/game/src/save/saveCodec.test.ts` | `SAVE_VERSION === 55` (verified at `saveCodec.ts:650`) | any persisted machining field bumps to 56. Directive 19: version bump, no migration |
| `packages/sim/tests/valueModelProbes.test.ts` | the ceiling probe (an all-stock-mint car is worth exactly clean value, never above); the unimproved-flip median margin `< 0.1` per tier; Law 1 step-wise | a machining premium is value added to an otherwise stock car, which is what the ceiling probe forbids by name |
| `packages/sim/tests/plays.test.ts` | the four plays ranked per model; **"fixing is the best use of a day on every car"** by yen per labour point | machining is a fifth play in exactly those units. `tuning-system.md` 4 calls it "avenue 3 alongside repair and fitting aftermarket". A profitable machining operation is the claim this test exists to falsify |
| `packages/sim/tests/balanceProbes.test.ts` | economy Laws 1, 2 and 3, the donor invariants, symptom blind-buy EV bands | every law re-measures if a day of labour returns something new |
| `packages/sim/tests/supportRatios.test.ts`, `reliabilityModel.test.ts` | `statFormulas.support` in full, the 26 `reliabilityBase` values, the severity ceiling | five of the thirteen operations are support-side, which is exactly this mechanism's currency |
| `packages/content/tests/partPricing.test.ts` | 288 generated value-per-yen cases bounded `[0.5, 1.35]` (measured max 1.334961, 39 above parity); cross-slot power-per-yen lead `<= 0.25` (measured max 0.180233) | see 14e |
| `packages/sim/tests/storyMissionProbes.test.ts` | every mission's payout re-derived by `payoutYenFor(probeCost)`, and the stat thresholds | if any probe build machines, its cost and figures move, which re-pins the payout map inside `economyApprovalGate.test.ts` |

**High: gates that would fail outright on a SKU-shaped design.**

| guard | the hard count |
| --- | --- |
| `packages/content/tests/powerFraction.test.ts` | `PARTS.length === 472`; exactly 96 non-zero `powerFraction` SKUs; exactly 12 per power-bearing slot; only the eight named slots non-zero |
| `packages/content/tests/integrity.test.ts` | every non-`paint` slot has **exactly 16** SKUs (4 classes x 4 grades); 20 zone panels; 472 total; every stock SKU's price equals its taxonomy `stockReplacementPriceYenByClass` |
| `packages/content/tests/statModifierShape.test.ts` | `Object.keys(StatModifierSchema.shape).sort() === ['powerFraction', 'style']`, asserted on the schema **and** on all 472 parsed SKUs |
| `packages/sim/tests/derivedStats.test.ts` | **no installed SKU can adjust authenticity**: an unresolvable SKU reads the same authenticity as a known one |

**These four together are the codebase's own answer to section 12.** Machining as `CarInstance`
state leaves all four untouched; machining as SKUs fails all four.

**Medium and mechanical.**

| guard | cost |
| --- | --- |
| `packages/content/tests/schemas.test.ts` | asserts the **exact 41-key top-level key set** of `economy.json` (it already contains `machineListings` and `machineShopAssist`), and an exact-equality `toEqual` over `energy.actionPoints`. A new machining lever block and a new action-point key each need an entry here **and** a row in `economy-bible.md`'s Anchor Inventory (law 4) |
| `packages/content/tests/economyApprovalGate.test.ts` | hashes exactly three files: `economy.json` (`0a3bca64...`), `damagePatterns.json`, `partPricing.json`, plus the 10 mission payout pairs. **A standalone `machining.json` would not be hashed at all**, which is precisely the hole the `partPricing.json` entry was added to close |
| `packages/content/tests/retiredIdentifiers.test.ts` | 24 banned identifiers, matched on word boundary across all three packages' `src`, **including comments and string literals**. Three bite: `statModifiers.authenticity`, `authenticityPercent` (note `authenticityPercentOf` escapes the boundary), and `genuinePeriod` / `genuinePeriodMultiplier` |
| ~25 sim and game test fixtures | every `GameState` literal carrying `machineListing: null` needs the new field if machining lands on `GameState`. `packages/content/tests/gameState.test.ts:317` is one |
| `packages/game/src/screens/PerformanceSandboxScreen.test.ts` | 29 `component-*` elements and a build code of `v1\|car\|class\|<29 chars>`; a machining dimension changes its shape |
| `packages/content/tests/noEmDash.test.ts` | zero U+2014 under `packages/`, **no extension filter**, so a new content JSON is scanned |
| `packages/content/tests/commentHygieneGuard.test.ts` | no comment under `packages/` may contain a sprint number, a date, "decision N", "playtest" or "maintainer". `machiningCost`'s doc comment is compliant today and must stay so when it is filled in |
| `packages/content/tests/spellingGuard.test.ts` | field-targeted, not blanket. **New machining copy in content is not automatically covered**: `findOffenses()` would need a new block, or the guard reads as passing while missing the surface |
| `packages/content/tests/calendarOwnershipGuard.test.ts` | only `calendar.ts` may turn a day into a week or a month. A machining turnaround clock must read it |
| `packages/content/tests/duplicateFormulaBan.test.ts` | only `marketValue.ts` may mention `bookValueYen` and `mileageFactor(` together |
| `packages/sim/tests/valueStatIndependence.test.ts` | value does not read performance. **This is the wall**: a machining value premium is legal only if it is not routed through the performance stats |
| `packages/sim/tests/aftermarketPhysics.test.ts` | "one upgrade is never charged twice": no SKU carries both grip and braking, no mass-saving SKU also carries grip. An operation that moves power **and** a physical dial is the second-path defect by construction |
| eslint `midnight-garage/sim-boundary-law`; coverage thresholds (statements 80 / branches 65 / functions 78 / lines 82) | machining logic in `packages/sim/src` is clean by construction |

### 14d. What is NOT guarded, and matters

- **`parts-taxonomy.json` is hashed by nothing.** No test asserts its 29 `statWeights.reliability`
  values as a table; the reliability suite derives them from content and would follow a change rather
  than catch it (`docs/carstats/reliability.md` finding 11). If machining touches slot weights, the
  guard has to be written first.
- **`parts.json` is hashed by nothing either**, only shape- and count-guarded.
- **`rosterCsvGuard.test.ts` covers the four tuning-arc constants only where the field exists on the
  shipped model.** A new per-car machining value needs a CSV column for all 94 rows and an entry in
  that file's `CONSTANTS` array, or it is unguarded.

### 14e. The one guard that would pass while its invariant broke

`packages/content/tests/partPricing.test.ts` holds two acceptance bounds that exist to prevent a
single correct first purchase: value per yen normalised to the race rung inside `[0.5, 1.35]` (288
cases), and cross-slot power-per-yen lead at most 0.25 (measured 0.180233).

**Both loops iterate `PARTS`.** A machining operation priced outside the catalogue is not in that
array, so the counts and the measured maxima **hold numerically while the invariant they exist to
protect is silently broken.** The table's own figures put port and polish at +5 to +8 per cent NA at
machine-shop labour rates, which is very likely to beat every catalogue slot on power per yen. That
is the exact one-correct-build-order defect `tuning-system.md` section 1 was written against, and no
shipped test would report it.

### 14f. Two collisions of naming and margin

- **The tutorial already teaches "machine shop hire".** `packages/sim/tests/tutorialProbe.test.ts`
  derives the taught Wagon R build's spend live and holds it, plus one sanctioned mistake, inside the
  ¥142,000 mission cap, with the wheels (¥3,000) and engine (¥15,000) hires in it. The measured spend
  is ¥134,912, recorded in `economyApprovalGate.test.ts`'s re-pinning note: that is ¥7,088 of
  headroom and a player who has just been taught the phrase.
- **`economy.json` already contains `machineShopAssist`, `machineListings` and
  `machineHirePaidDayByGroup`**, and `blockedReason` carries the literal string `machine-line`, which
  `dayLogFormat.ts` renders raw to the player. A machining feature next to all of that makes every one
  of those ambiguous (see section 8).

---

## 15. The design decisions this forces

**Open questions with their trade-offs. Not answered here: these are the maintainer's and the
reviewing agent's to make.**

### D1. Where does the record of a machining operation live?

| option | consequence |
| --- | --- |
| On `PartInstance` (a new array or record field) | survives every existing write site (section 5); follows the part off the car, into inventory, onto another car, and into a sale; but `machiningCost(car)` is car-scoped and would have to walk the 29 slots to sum it |
| On `CarPartState`, beside `installed` | matches `machiningCost`'s signature directly; **silently erased by seventeen production write sites** unless every one is changed |
| On `CarInstance` as a flat list, like `symptoms` | matches the `runTestIds` precedent and `machiningCost`'s signature exactly; but a machined part pulled off the car leaves its machining behind, which contradicts "you machine a part you own" |

### D2. Does machining survive the part leaving the car?

Bound up with D1 but a separate question. If yes, `usedPartSaleValueYen` and `scrapValueYen` are both
blind to it (section 9) and a machined block can be sold for an unmachined block's price. If no,
pulling an engine to work on it destroys the work, which is the opposite of how a machine shop
operates.

### D3. Does a machining gain enter `totalGainFractionOf`, and therefore reliability?

Section 4 states both costs. The trade is between machining being strictly dominant on every axis at
once, and machining being penalised twice (reliability plus authenticity) for the same power an
aftermarket part gets penalised once for.

### D4. How does support receive a non-SKU contribution?

Five operations support and two do nothing else. The candidate shapes, each with a cost:

| shape | cost |
| --- | --- |
| a second additive term in `slotContribution.spec` | one more source for a quantity whose doc comment says specification comes from grade |
| a fifth `Grade` above `race`, or a `machined` grade | `GradeSchema` is read by `specByGrade`, `gradeBandFactor`, `gradeRankOf`, `partPricing` ladders and `stocknessOf`; a fifth grade is a whole-model change. Note `tuning-system.md` 15 already bans a fifth grade *below* stock |
| machining raises the slot's effective grade for support only | keeps `stocknessOf` reading `stock` (authenticity preserved) while `specByGrade` reads higher. Two different answers to "what grade is this part", which is the sort of thing that produces a two-sprint bug |
| support-only operations are cut from the feature | the table loses O-ringing and rod peening, which are two of the three highest-authenticity-cost operations and the ones that make the boost build a boost build |

### D5. Is machining a `Grade`, a `ConditionBand` above mint, or neither?

`ConditionBand` tops out at `mint` and `climbBand` clamps there (`bands.ts:41`). `TODO.md` records
that `flagship.beyondDiscount` 1.3 is reserved for "an above-mint state". An above-mint band would
make that lever live and give the flagship somewhere to spend past perfect; it would also touch
`repairBandCeilingByTier`, `bandFactors`, every band curve, `costToMintYen`, `resaleBandFactors` and
the whole condition model. Neither option is cheap and the placeholder lever is explicit that
somebody owns this.

### D6. Where does the money go, and whose cost is it?

Four sub-questions, all forced by `cashMovementFor`'s exhaustive switch (section 11a):

- which of the five cash buckets, and does it differ for a fitted part versus a loose one?
- does it post to `CarLedger`, and under which of the three existing lines, or a fourth?
- does it reach `installedPartsValueYen`, which currently gives a stock part zero premium?
- does the facility itself cost money (`investment`, like a bay or a dyno) and is it own-only or
  own-or-hire (the dyno's `{owned, hirePaidDay}` shape is the precedent)?

### D7. What is the per-engine headroom, and where is it authored?

`TODO.md` rules that a flat machining multiplier is the wrong shape (it corrects two engines and
inflates five) and that headroom is a property of the engine. There is no column for it on the 94-row
roster CSV. Directive 24 means the value is decided for all 94 cars before implementation, and the
open part is what the value is a property of: the engine code, the car, the tier, or the culture.

### D8. Which job kind, and how does an operation get named?

Section 7's tension: the recondition path has the right addressing (a loose `PartInstance`) and the
wrong payload (one `targetBand`); the staged-work union has the right payload (a named operation with
its own fields) and the wrong addressing (car-scoped). Either `Job` gains an operation field, or
staged work gains loose-part addressing, or machining is car-scoped and only ever done to a fitted
part.

### D9. Does a generated car ever arrive machined?

Generation already produces modified and incoherent cars. A machined lot is invisible to
`apparentViewOf` because machining is not a band. If lots can arrive machined, the inspection and
workup routes need a way to smell it; if they cannot, machining is a purely player-side mechanic and
the authenticity cost only ever falls on cars the player has worked on.

### D10. Where does machining physically happen?

`workshop-topology.md` section 7 already names this as one of two things that want deciding before
the systems arc finishes, "because they are cheap now and expensive later". `toolLines.json` already
names engine tier 3 "Machine-shop tooling" at ¥1,500,000. The dyno is the closest precedent for a
facility that is neither a bay nor a tool line. The other half of the same entry, "whether parts have
a location", is state and therefore more expensive the later it lands.

### D11. What does the player see, and when?

`tuning-system.md` 7c's law is that a consequence the player could not have foreseen is a punish and
one they were shown is a choice. Machining is permanent and its cost is authenticity, which is
invisible until a collector declines to bid. The dyno's four panels read derivations rather than
parts, so machining shows up in the numbers for free (section 10), but nothing in `DynoReading`
can name an operation.

### D12. What happens to the three stock-car identities?

Section 14a. A machined car is an all-stock-parts car, and three exact equalities say what such a car
reads and what it is worth. Either each predicate gains an explicit "and unmachined" clause, or
machining is neutral on that axis. The trade-off is stark: neutral on value means the money vanishes
(section 9); not neutral means the ceiling probe's own claim, that a stock car is never worth more
than clean value, stops being true.

### D13. How is machining priced against the parts catalogue?

`partPricing.test.ts`'s two acceptance bounds exist to prevent one correct first purchase, and both
iterate `PARTS`. A machining operation priced outside the catalogue passes them while breaking what
they protect (section 14e).

| option | cost |
| --- | --- |
| price machining inside `partPricing.json` | it joins the ladder and the guard, and moves that file's hash |
| price it in `economy.json` as its own block, and extend the acceptance probes to treat machining as a pseudo-slot | honest, and re-pins 288, 1.334961, 39 and 0.180233 from a real run |
| price it outside both and leave the probes alone | the cheapest, and the one that reintroduces the defect `tuning-system.md` section 1 was written against, invisibly |

### D14. Is machining a fifth "play"?

`plays.test.ts` ranks four plays per model by yen per labour point and asserts that **fixing is the
best use of a day on every car**. `tuning-system.md` 4 calls machining "avenue 3 alongside repair and
fitting aftermarket", which is the same vocabulary. Either machining joins `PLAY_IDS` and
`computeRosterPlayRanking` and is measured against that claim, or the claim quietly stops covering
the whole game.

### D15. Do the two documents that say "tier 3 buys nothing" get corrected?

`tuning-system.md` 4c and `TODO.md` both state it; section 6 shows it is true only of
`repairBandCeilingByTier`, and false in general for engine and body. The decision this forces is not
about machining: it is whether machining is still the *purpose* tier 3 lacks, given that engine tier
3 already gates four service-job templates and the NA-to-turbo conversion.
