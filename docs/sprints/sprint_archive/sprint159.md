# Sprint 159: a panel can be beyond saving

## Goal

A body panel can be ruined past repair, and it can be absent altogether. Both states force a
replacement rather than offering one. Today neither exists: `derivePanelsBand` bottoms out at
`poor`, `panelMissing` is never written true by anything, and so the repair route always works and
buying a panel is always optional.

That is what makes a head-on collision read as a bonnet you could buff out, and it is what makes
the zone-panel price decorative. Fixing it is the prerequisite for pricing panels at all: the bill
reads the panel price only inside the `panelMissing` branch, so until that branch can fire, any
price sits outside the economy.

## Definition of done

1. A zone's `metal` axis can reach a level above weldable, meaning beyond repair.
2. `beat` and `weld` cannot clear that level. `swapPanel` is the only route out of it.
3. `panelMissing` can be true on a generated car.
4. `derivePanelsBand` can return `scrap`, from either state.
5. The repair bill quotes the panel price for both states, not just for missing.
6. Both states are rare and legible: the player is told the panel is beyond saving rather than
   being offered a stage that silently does nothing.
7. Generated body damage does not get quieter. `enforceMaxBillFraction` now sees panel prices in
   the bill, so it can clip. Measured, not assumed.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse. Nothing here is rebuilt.**

- `ZoneState.panelMissing` already exists, is already read by `derivePanelsBand` (the sole route to
  a `scrap` panels band) and by `panelsRepairBillYen` (the sole place a zone panel price enters a
  bill). The state is modelled and switched off, not absent.
- The `scrap` band already exists in the ladder and every consumer already handles it.
- `swapPanel` already replaces a zone panel, already charges the panel, already harvests the old
  one back to inventory.
- `severityThresholdForBand` already maps a severity to a band.
- The damage-grade ladder (`damageGrades`, `bandStepsByGrade`) already rolls how badly hurt a car
  is, and `damagePatterns` already decides where the damage lands. Both states hang off these.
- `enforceMaxBillFraction` already caps a generated bill against value.

**Genuinely new.**

- One severity level on the `metal` axis above the current worst, meaning beyond repair.
- A gate stopping `beat` and `weld` at that level.
- Generation paths that can write that level and `panelMissing`.

## Design

**Scrap is a severity, not a flag.** `metal` runs 0-3 today and 3 is still weldable. The band
ladder has five rungs and the axis has four, which is exactly why `scrap` is unreachable. Adding a
fifth severity makes `derivePanelsBand` return `scrap` on its own, with no new branch and no second
concept to keep in sync. Surface and finish do not grow: ruined paint is repaintable, which is
correct.

**Missing stays a flag**, because it is a different fact. A ruined panel is present and worthless;
an absent one is not there. Both force a purchase, and they are not the same thing to look at.

**Both hang off the existing damage grade.** Neither gets its own roll against the world. A panel
goes beyond repair only on the heaviest damage grades and only where the pattern has already
concentrated damage, so the car that arrives with a ruined bonnet is the car whose history says it
was hit. This reuses the grade and pattern ladders rather than standing a third one beside them.

**The scrapyard is the eventual home of missing panels** and does not exist yet. Build the
capability, keep the rate low, and let the scrapyard raise it when it lands.

## Levers (directive 22)

These are new content values, ratified on the measurements in this sprint's Exit.

| lever | proposed | what it does |
| --- | --- | --- |
| `partsGeneration.zoneStates.zoneBeyondRepairChance` | **0.18** | chance a maximal metal step on a heavy-grade car escalates past weldable |
| `partsGeneration.zoneStates.zonePanelMissingChance` | **0.25** | chance a beyond-repair panel is absent instead of ruined in place |

Neither is a bare probability against the world. The escalation is gated first, structurally:
the car's rolled history must be `rough` or `project`, and the panel must be the one the damage
pattern put at the front of the severity order with its metal already at the weldable maximum. So
at most ONE panel per car can ever reach the state, and the chance above is what happens after
those gates hold.

No pricing lever moves in this sprint. `baseCostYen.zonePanel` and `baseCostYen.panels` stay
exactly where they are; they are priced in a later sprint against the system this one produces.

## Tasks

1. [x] Extend the `metal` severity axis by one level and make the band derivation return `scrap`
   from it.
2. [x] Gate `beat` and `weld` so neither acts on the new level, with a reason the UI can show.
3. [x] Let generation write the new level and `panelMissing`, off the damage grade and pattern.
4. [x] Make `panelsRepairBillYen` quote the panel for beyond-repair zones as well as missing ones.
5. [x] Surface both states in the workshop so the player sees "replace" rather than a dead button.
6. [x] Measure the Law 2 interaction and the resulting rates.

## User-only tasks

None.

## Exit

Both levers above are RATIFIED on the measurements below, and the economy approval gate is re-pinned
in the same change recording that status.

### 1. Definition of done 7 first: did generated body damage get quieter?

No. It got louder in every fitment class, and nothing was clipped.

Measured the only way that isolates the question: same seeds, same code, both chances at 0 against
both at the values above. Both runs draw the same rolls, so a car differs between them only where
the escalation actually landed. Mean band steps per car, 400 seeds per model across the whole
26-car roster (10,400 cars):

| class | n | levers off | levers on |
| --- | --- | --- | --- |
| entry | 2800 | 53.4518 | **53.4854** |
| everyday | 3200 | 44.4122 | **44.4184** |
| enthusiast | 3600 | 38.2022 | **38.2078** |
| flagship | 800 | 31.2813 | **31.2813** |

Zero cars in those 10,400 lost a band step. A second sweep over a different seed prefix (1,560
cars) found exactly one: a `nissan-sunny-b12` that lost 2 band steps of 75. The mechanism is
understood and is not new: `enforceMaxBillFraction` lifts EVERY part sharing the car's single worst
band, so a car that already had another part at `scrap` sees that part climb alongside the panel
being walked back. Roughly 1 car in 12,000, losing under 3 per cent of its own damage. Immaterial,
and the aggregate moved the other way in every class.

A second measurement, over 3,000 cars per class with a different generator sweep, agrees: mean zone
severity per car 26.442 -> 26.478 (entry), 18.137 -> 18.149 (everyday), 13.496 -> 13.500
(enthusiast), 10.706 -> 10.706 (flagship), with 0 cars quieter and 161 cars louder.

The reason the interaction is mild is worth recording for the pricing sprint: a zone panel costs
`baseCostYen.zonePanel` 6000 times the class factor, so 840 yen at entry and 960 at everyday,
against a mean entry restoration bill of 66,000. It replaces the fill-and-sand materials that zone
would otherwise have owed, so the mean entry bill actually moved 66,280 -> 66,233. **At entry and
everyday class a replacement panel currently costs less than the filler to repair one**, which is
exactly the decorative-price problem this sprint was the prerequisite for.

### 2. The realised rates

Share of generated cars carrying at least one such panel (same 10,400-car sweep):

| class | beyond repair | of which absent |
| --- | --- | --- |
| entry | 3.04% | 1.04% |
| everyday | 0.63% | 0.13% |
| enthusiast | 0.56% | 0.22% |
| flagship | 0.00% | 0.00% |

The wider 3,000-per-class sweep reads entry 3.67% / 1.20%, everyday 1.27% / 0.40%, enthusiast
0.43% / 0.20%, flagship 0.03% / 0.00%.

The gradient is emergent rather than authored: it falls out of `careProfileByCulture`, because a
flagship's culture rarely rolls a heavy history at all. Nobody wrecks an FD and walks away, so a
flagship essentially never arrives with a ruined panel. At the local yard, where roughly 70 per
cent of lots are entry cars, a panel past saving turns up about once every thirty lots.

### 3. The repair route is genuinely shut

`planPipelineStage` refuses `beat` and `weld` on a beyond-repair panel with a new `needs-panel`
reason (the weldable rung below is still ordinary work), and refuses ALL SIX generic stages plus
`paint` on a zone with no panel on it. `planSwapPanel` clears both states outright, and the zone is
workable again the moment a panel is fitted. `packages/sim/tests/beyondRepairPanels.test.ts` holds
every one of those.

`fillAndSand`, `prime` and `paint` were already shut on a beyond-repair panel by their own
prerequisites (`metal !== 0`), so only the two metal stages needed a gate. `stripPrep` and `polish`
still work on a panel that is present but ruined, which is honest: the paint on a bent wing is
still paint, and the `paint` band is a separate carrier from `panels`.

### 4. `derivePanelsBand` returns `scrap`, and nothing downstream goes strange

It reaches `scrap` from severity alone now, with no new branch: the axis and the band ladder have
the same number of rungs, so `bandForSeverity(4)` is `scrap`. A missing panel still forces it
separately, because an absent panel is a different fact from a ruined one.

Downstream consumers were checked rather than assumed. `planGroupRepair` already skips every
zone-derived carrier, so no repair job is ever created against it. `carCostToBandYen` routes
`panels` through `bodyPartRepairBillYen`, which now quotes exactly one panel price for either state
and never also charges filler for a zone getting a fresh panel. `hasZoneImproveHeadroom` reports the
state as headroom and `improveZoneCarrierOneStep` clears both in one step, which is what keeps Law 2
enforceable at all: without it a beyond-repair panel would have been a cost the softening pass could
see and not reach. The whole sim and game suites were run file by file and are green.

One consequence is real and worth stating: a car whose panel is past saving reads `scrap` on the
`panels` carrier, so its market value drops and its `body` group band cannot be lifted by the repair
route. That last point broke a store test whose fixture selection quietly depended on the opposite;
see the test notes below.

### 5. Levers, states and the save

- `packages/content/data/economy.json` gains the two chances above under
  `partsGeneration.zoneStates`. No other economy value moves; `partPricing.json` is untouched and
  its hash holds.
- `ZoneStateSchema.metal` widens from 0-3 to 0-4. Per directive 19 that is a `SAVE_VERSION` bump
  (53 -> 54) and nothing else: every pre-v54 zone state is already a valid v54 one, so there is no
  migration to write.
- The workshop names both states. The car screen's docked zone panel carries a line ("Panel is past
  saving. Beating and welding will not pull it back: fit a replacement." / "Panel is off the car.
  Fit a replacement."), and the workshop view tags the region `past saving` or `panel off`. The
  metal pip row grew to four pips and the readout to "metal n of 4".

### 6. Tests changed, with directive 17's case for each

- `packages/sim/tests/beyondRepairPanels.test.ts` - NEW, 17 tests: the axis, the gates, the bill,
  the generation gates, the customer-car exclusion, and the Law 2 measurement above.
- `auctions.test.ts`, the signed symptom-rate test - **case (a), and the diagnosis is the
  interesting one.** It failed at entry 0.4919 against a signed 0.55. Nothing about symptom
  generation changed; the two new rolls sit upstream of the symptom roll, so the draw sequence
  moved by two. That should be harmless, and it was not, because the test seeded every one of the
  26 models with the IDENTICAL `seed * 31 + 7` stream: its effective sample was 300 draws, not
  7800, and mulberry32 advances its state by a constant, so every car's symptom roll sat at one
  fixed offset into 300 fixed streams. Removing the two draws entirely put the rate at 0.5700;
  adding them put it at 0.4919; neither is the generator's actual rate. Hashing the model into the
  seed makes the 7800 cars 7800 independent samples, and the measured rate is then entry 0.5455,
  everyday 0.4968, enthusiast 0.4610, flagship 0.3483 against signed 0.55/0.50/0.45/0.35 - inside
  0.011 on every class, and it holds at 1200 seeds per model too. The assertion and its 0.05
  tolerance are untouched; only the sampling was corrected. **No economy lever was moved for this**,
  and `diagnosis.symptomChanceByTier` is exactly where it was.
- `advanceDay.test.ts`, both golden hashes - **case (a)**. Two more draws per generated car shift
  every board's rng stream. Re-derived from real runs: `808948e0` -> `aa1dccba` and `1bb7d3b7` ->
  `2b7f8b16`.
- `saveCodec.test.ts`, six `SAVE_VERSION` pins - **case (a)**. The bump is this sprint's.
- `economyApprovalGate.test.ts` - **case (a)**, re-pinned with the two proposed levers and the
  measurements recorded against them.
- `WorkshopViews.test.ts` - **case (a)** for the pip count and readout (the metal axis grew a rung:
  eight pips became nine, "metal 2 of 3" became "metal 2 of 4"), plus a NEW test that a panel ruined
  past welding tags differently from one that is off the car.
- `CarDetailScreen.test.ts` - **case (a)** for the same readout, plus two NEW tests: the docked
  panel states that a panel is past saving and disables the metal stages, and states that a panel is
  off the car and disables the whole zone pipeline.
- `gameStore.garage.test.ts`, "repairing completes and lifts the group to mint" - **case (a), and it
  was already fragile.** It granted cars until the `body` group was non-mint, then repaired it to
  mint. But three of `body`'s four slots read their band off zone state and `repair()` has never
  targeted those, so the test only ever passed when the granted car's non-mint body slot happened to
  be `aero` and its three derived carriers happened to be clean. The rng shift handed it a car with
  a panel past saving, which `repair()` correctly cannot lift, and the coincidence broke. The probe
  group moves to `interior`, whose two slots are both surface parts and neither derived, so the
  completion mechanic under test is exercised end to end rather than by luck. Nothing about repair
  changed.

### 7. Checked and unaffected

- **The tutorial.** `buildTutorialLot` constructs its car from the `tutorialLot.json` recipe with no
  `zoneState` at all, so no zone rule can reach it and the scripted Wagon R cannot acquire an
  unfixable panel. `tutorialProbe.test.ts` and `tutorialIsolation.test.ts` both pass untouched.
- **Customer cars.** `serviceJobs.ts` passes `allowMissingSlots: false`, which now also keeps a
  customer's panel on the car; a service job can never arrive as a hole in the bodywork.
- `stockReplacementPricesByClass` and `indexStockPartsByCarPartId` still filter `zoneId == null`.
  Zone panels remain deliberately outside the taxonomy weights, exactly as before.
- No fourth copy of the body-line capability rule was added; `gameStore.ts`'s inline copy is
  untouched and remains the standing duplicate noted in the brief.

### 8. Found in passing, NOT fixed (out of scope)

`derivePaintBand`'s colour-mismatch penalty is inverted. It reads
`idx <= 0 ? 'scrap' : SEVERITY_BAND_ORDER[idx - 1]`, and `SEVERITY_BAND_ORDER` runs best-first, so a
mismatched car with `mint` paint is penalised all the way to `scrap` while one with `poor` paint is
IMPROVED to `worn`. The doc comment above it says "stepped one band worse", which is the opposite of
what the code does. No test covers it. Appending `scrap` to the ladder does not change its behaviour
either way (the band it reads always comes from `finish`, which still tops out at 3), so it is left
exactly as it was rather than fixed inside an unrelated sprint. It needs its own change, and it will
move valuation numbers when it lands.
