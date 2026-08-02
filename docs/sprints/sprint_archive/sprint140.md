# Sprint 140: stat simplification, aero ceiling, style base

**Status: BUILT, committed (`338de30`) and SIGNED.** The handling deletion (Task 1) and the aero
ceiling (Tasks 0 and 2) both landed, and Lever 1's 94 `aeroCeiling` values were ratified on review
of the authoring pass. Nothing is outstanding.

**Everything below about `styleBase` (Task 0's style half, Lever 2, Task 3, and the
`styleCap`-retirement half of Task 6) landed early, in `docs/sprints/sprint_archive/sprint145.md`, pulled
forward because Sprint 146's buyer targets on style could not be authored while every stock car
scored the same.** All 94 roster rows carry `styleBase`, the schema field is required on
`CarModel.spec`, all 26 shipped cars carry it, `statFormulas.styleCap` is retired, and the
per-mission re-derivation that followed is recorded in that sprint's own Exit. Do not redo any of
it here; what remains of this sprint is `aeroCeiling` (Task 0's other half, Lever 1, Task 2) and
the handling deletion (Task 1).

Opens after Sprint 135. Seventh of nine in the tuning overhaul arc.

**One soft dependency, added 2026-07-29.** This sprint deletes `statModifiers.handling` and
Sprint 136 deletes `statModifiers.reliability`. Both edit `StatModifierSchema` and both face the
same taxonomy schema-sharing question, so **whichever lands first resolves it and the second
follows whatever it did.** They must not run concurrently against the same schema. Otherwise this
sprint is independent of 136 to 139 and can run alongside them.

Design reference: `docs/design/systems/tuning-system.md` sections 11 and 12.

## The gaps, stated plainly

**Three separate small defects**, grouped because they are all "a stat that is not carrying
its weight" and splitting them would cost three sprints of overhead for three small changes.

1. **`statModifiers.handling` is a second route to grip.** `physicalModifiers.grip` already
   moves the same quantity, and `PhysicalModifierSchema`'s own comment warns that "a second
   path for either would charge one upgrade twice". This is that second path.
2. **Every car has the same aero potential.** Bolting a GT wing to a Wagon R delivers what it
   delivers on an FD. It should look silly and do very little.
3. **Every stock car has the same style score.** `styleCap` is 20 and `style` is
   `styleFraction * styleCap`, so a mint Wagon R and a mint FD in identical condition score
   identically on taste.

**A fourth defect left this sprint on 2026-07-29.** `statModifiers.reliability` (an additive
stat design section 9 has decided is derived) is deleted in **Sprint 136** instead, because that
is the sprint that rebuilds what replaces it. The whole reliability model now lands there in one
piece: the additive deletion, the retirement of the flat `statFormulas.reliabilityCap`, the
per-car `spec.reliabilityBase` that replaces it, the severity ceiling, and the coherence term.

## Reuse analysis (directive 16)

### Genuinely new

- **Two per-car numbers**, `aeroCeiling` and `styleBase`, authored on `CarModel.spec`.

**A third, `spec.reliabilityBase`, is authored in Sprint 136 rather than here**, for the same
reason and by the same method: a stat that describes a car cannot be a constant. It sits in 136
because that sprint rebuilds the whole reliability derivation, and splitting the base out would
have 136 pin a table that this sprint then breaks. **Follow whatever 136 did for the schema
shape**, so all three per-car spec fields end up authored identically.

### Existing mechanisms reused, unchanged

- **`physicalModifiers.grip`** already carries everything handling needs, through
  `effectiveGrip` and `gripToDisplay`. Deleting the additive path removes a duplicate, it
  does not remove a capability.
- **`statFormulas.aero.byGrade`** and `effectiveDownforce`, which already resolve what an
  aero SKU delivers. The ceiling multiplies that result; it does not replace the mechanism.
- **`computeDerivedStats`'s existing style line**, which already reads a cap from content.
  The cap becomes per car.
- **`StatBlock` keeps all five stats.** Only the *part modifier* field goes.

### The distinction that must not be got wrong

**Deleting `statModifiers.handling` does NOT delete `StatBlock.handling`.** The stat stays,
every buyer weights it through `statWeights`, and `computeDerivedStats` keeps deriving it from
grip through the existing `mintHandling` expression. What goes is the ability of a *purchased
part* to add a flat handling number on top of the grip it already moves.

**Do not touch reliability in this sprint.** Sprint 136 owns it end to end now: the additive
deletion, the flat cap's retirement, the per-car `spec.reliabilityBase`, the severity ceiling and
the coherence term. Anything here that appears to need reliability changing is a sign the two
sprints have been run out of order.

## The levers (tasks 2 and 3 only, ALL UNAPPROVED, directive 22)

### Where both tables now live (changed 2026-07-29)

**Both levers are authored in `docs/design/midnight-garage-roster.csv`, columns `aeroCeiling`
and `styleBase`, for all 94 roster cars.** They were drafted here for the 26 shipped cars only,
which **directive 24 makes the wrong scope**: a per-car value is decided for the whole roster when
it is introduced, not for whichever subset happens to be in content, because deciding it twice is
how the tier labels drifted.

**`styleBase` is DONE: all 94 rows carry a value, landed in `docs/sprints/sprint_archive/sprint145.md`.** `aeroCeiling` still
holds 26 of 94. Completing it is Task 0's remaining half below and it blocks Task 2. It does not
block Task 1.

### Lever 1: `spec.aeroCeiling` (94 values, 26 authored)

A multiplier, 0 to 1, on the downforce an aero SKU delivers. **1.0 means the part performs as
authored.** This is what stops every car eventually becoming a GT3 car, and what makes a wing on a
kei van read as the joke it is.

The rubric the 26 were authored against, and the 68 must follow:

| ceiling | what earns it |
| ---: | --- |
| 1.00 | a real factory wing and a genuine period aftermarket behind it (FD, Supra, BNR32) |
| 0.85-0.95 | a proper sports shape; real downforce, less frontal potential |
| 0.65-0.80 | coupes and hot hatches: the culture fits wings, the physics disagrees |
| 0.40-0.60 | saloons and small roadsters |
| 0.20-0.35 | boxes. **The Wagon R sits at 0.20 and it should read as a joke** |

**The classics need a deliberate call rather than the rubric.** A Hakosuka or a 2000GT has no
aerodynamic development behind it at all and no period aero aftermarket worth the name, so they
sit low on physics while sitting high on desirability. That is correct and it is worth stating so
nobody "fixes" it.

### Lever 2: `spec.styleBase` (94 values, 26 authored) - LANDED IN SPRINT 145

Replaces the flat `statFormulas.styleCap` of 20 as the per-car mint ceiling on style, keeping the
same 0 to 20 scale so nothing else in the formula moves.

**Style is taste, not physics, and the two must not correlate.** The Sera is a slow car with
butterfly doors and a glass roof and it scores 14; the AE86 scores 16 on culture alone. A fast car
is not a stylish car and the column must not quietly become a second performance ranking.

| base | what sits there |
| ---: | --- |
| 17-20 | the halo shapes: FD, Supra, BNR32, and the exotics |
| 14-16 | desirable coupes and the culturally loaded ones |
| 11-13 | sports saloons and hot hatches |
| 7-10 | ordinary saloons with a sporting grade |
| 4-6 | plain metal and kei boxes |

## Task breakdown

### Task 0: finish authoring both columns to 94 (blocks Task 2; `styleBase` half done)

`docs/design/midnight-garage-roster.csv`: fill `aeroCeiling` for the 68 rows that have none,
against the rubric above. **`styleBase` is complete for all 94 rows (`docs/sprints/sprint_archive/sprint145.md`).**

**This is a design pass, not a data-entry pass**, and it is the maintainer's or the orchestrator's
to do, not an implementation agent's. It is 136 judgements about what cars look like and how much
air they can work, and the style column in particular is a taste call the copy bar applies to.

**Then it goes to the maintainer as one table of 94 rows each**, and only the signed table is
authored into `cars.json`. Directive 22 gates the values; directive 24 gates the scope.

### Task 1: delete `statModifiers.handling` (no sign-off needed)

1. `packages/content/src/stats.ts`: remove `handling` from `StatModifierSchema`.
2. `packages/sim/src/derivedStats.ts`: remove the `handling += part.statModifiers.handling *
   wear` line. Handling now derives from grip alone, through the existing `mintHandling`
   expression, which already reads `physical.grip * build.grip`.
3. `packages/content/data/parts.json`: remove the field from all 472 SKUs.
4. **`statWeights` on the taxonomy also uses `StatModifierSchema`** for a different meaning.
   Removing `handling` removes the condition weighting for the handling stat. **Check what
   `weightedBandFactorForStat(..., 'handling', ...)` does after the deletion**: if it loses
   its weights, handling stops responding to condition, which is a regression, not the
   intent. If the two meanings can no longer share a schema, **split them** into
   `StatModifierSchema` (a part's deltas) and a separate `StatWeightsSchema` (the taxonomy's
   condition weights, five fields). Splitting is the correct answer if the check fails; state
   which happened in the Exit.

   **Sprints 135 and 136 hit this same question first**, for `power` and `reliability`. Read what
   they did and follow it rather than deciding again. **After all three deletions
   `StatModifierSchema` carries `style` and `authenticity` only**, which is what
   `tuning-system.md` section 11 asks for and is the state to verify against at the end.

### Task 2: `spec.aeroCeiling` (needs Lever 1 signed)

1. `packages/content/src/carModel.ts`: add `aeroCeiling: z.number().min(0).max(1)` to the
   spec schema. **Required, not defaulted**, so a car added later cannot silently inherit a
   value nobody chose.
2. `packages/content/data/cars.json`: the 26 values.
3. `packages/sim/src/performance.ts`: `effectiveDownforce` multiplies its resolved
   `downforceCoeff` by the model's ceiling.
4. **A stock car must be unaffected**, because a stock car carries no aero SKU and therefore
   no downforce to scale. Assert it for all 26.

### Task 3: `spec.styleBase` - DONE, landed in Sprint 145

Landed as `styleBase: z.number().min(0).max(100)` (the same bound `reliabilityBase` uses; the
authored 4-to-20 band is enforced by `rosterCsvGuard.test.ts`, not the schema), required, all 26
shipped cars carry it, `style = styleFraction * model.spec.styleBase` replaces
`styleFraction * styleCap`, and `statFormulas.styleCap` is retired and in
`retiredIdentifiers.test.ts`. See `docs/sprints/sprint_archive/sprint145.md`'s Exit for the full record.

### Task 4: tests

1. **No SKU carries a handling modifier**, structurally, from content. Assert the final schema
   shape too: `StatModifierSchema` carries `style` and `authenticity` and nothing else.
2. **Handling still responds to condition and to grip parts.** A car with worn suspension
   reads lower handling than the same car at mint; a car with race coilovers reads higher
   than one without. This is the regression test for Task 1's schema-sharing risk.
3. **Reliability is provably unmoved by this sprint.** Every one of the 26 cars reads the same
   reliability before and after, strict equality. **This sprint must not touch it**, and the
   test exists because Task 1 edits the schema reliability's weights share.
4. **A wing on a Wagon R does very little**, and the same wing on an FD does a lot. Pin both,
   as lap-time deltas as well as downforce, because the lap is what the player feels.
5. **Stock cars are unaffected by the aero ceiling**, all 26.
6. **Stock style now varies across the roster** and matches Lever 2 exactly, all 26.
7. **`harnessAcceptance.test.ts` passes untouched**, which follows from test 5 and the fact
   that stock cars carry no aero.

### Task 5: checks

```text
pnpm test --project content
pnpm test --project sim
pnpm test --project game
```

**Auction-demo warning (2026-07-30, standing rule across this arc):** if this sprint moves any part
price or bill threshold, `enforceMinWorkBill` (`packages/sim/src/auctions.ts` ~370-413) draws a
different number of PRNG steps and reshuffles every later lot in a seeded catalogue -
`packages/game/src/screens/auctionRoom.test.ts`, `auctionRoomDemo.test.ts` and
`AuctionRoomDemoScreen.test.ts` must be re-derived from a fresh seeded run, and
`pnpm test --project game` must be run before this sprint is called done.

### Task 6: re-derive whatever moved

Directive 17 case (a). **The `styleBase`/`styleCap` half of this task is done, in Sprint 145**:
`economyApprovalGate.test.ts` is re-pinned there, and the one moved mission pin
(`low-and-loud`'s style threshold and stancer taste match) is recorded in that sprint's Exit.

**The `aeroCeiling` half is still open.** Downforce moving changes taste-adjusted prices and lap
times across the whole roster, so expect sale-price, valuation and lap pins to move widely when
Task 2 lands, re-derived from a real run.

## Task 4: restore a power readout to the parts market (maintainer ruling 2026-07-30)

Sprint 135 removed the power figure from the parts catalogue badge and did not replace it.
The removal was correct: `statModifiers.power` was an absolute figure, its replacement
`powerFraction` is keyed by engine character, and the catalogue has no car in view to resolve
a character against. So the badge had nothing true left to say. It has said nothing since,
which means a player browsing engine parts cannot see what any of them does.

**The maintainer's ruling: show a power figure only when a specific car is selected, and show
nothing otherwise.** A range across the three characters was offered and rejected. The reasoning
is that a figure the player cannot act on is worse than no figure, and the character split is a
mechanic they meet on a car rather than in a catalogue.

So the readout resolves `powerFraction[engineCharacterOf(car)]` against that car's own
`stockPowerPs`, exactly as `computeDerivedStats` already does, and renders a percentage. With no
car selected the badge omits power entirely rather than showing a placeholder, a dash or a range.

Two things this readout must NOT claim, both settled elsewhere in the arc:

- **Support does not gate power** (Sprint 136 turns the weakest-link ratio into a reliability
  factor and adds no power path, arc rule 8). An unsupported build makes its full power and
  becomes unreliable. The percentage is therefore honest as shown and needs no support caveat.
- **Condition does scale it.** A fitted worn part delivers less than its rating. That belongs to
  the car's build view, which already has the installed band, not to the catalogue.

No new lever, no new content value, no sign-off needed.

## Hard constraints

- **Task 1 may proceed without sign-off. Tasks 2 and 3 may not.** If the levers are unsigned,
  ship task 1 and stop. **Task 4 needs no sign-off** and may ship with task 1.
- **Do not delete `StatBlock.handling`**, and do not touch `StatBlock.reliability` at all.
- **Do not change reliability, in any way.** Sprint 136 owns it end to end.
- **Do not run this sprint's schema edit concurrently with Sprint 136's.** Whichever lands first
  settles the `StatModifierSchema` / `StatWeightsSchema` question for the other.
- **Performance never moves price**, and note that style is taste rather than performance, so
  the style change moving prices is correct and is not a breach.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] `statModifiers.handling` gone from schema, sim and all 472 SKUs.
- [x] `StatModifierSchema` carries `style` and **`powerFraction`** only, asserted. **The line above
      originally read "`style` and `authenticity`" and was stale on both counts**:
      `statModifiers.authenticity` was retired in Sprint 151 and is in the retired-identifier
      ledger, and `powerFraction` is the surviving power path from Sprint 135.
- [x] The parts market shows a power percentage when a car is selected, resolved against that
      car's own character and stock output, and shows nothing at all when none is.
- [x] `StatBlock` still carries all five stats; buyers still weight reliability.
- [x] Handling still responds to condition and to grip parts, proved by test.
- [x] Reliability provably unmoved by this sprint, all 26 cars, strict equality.
- [x] The schema-sharing check done, following whatever Sprints 135 and 136 decided, and its
      outcome recorded in the Exit.
- [x] `styleBase` authored to all 94 rows in the roster CSV (Task 0's style half) - `docs/sprints/sprint_archive/sprint145.md`.
- [x] `aeroCeiling` authored to all 94 rows in the roster CSV (Task 0's remaining half).
- [x] Lever 2 (`styleBase`) signed and landed - `docs/sprints/sprint_archive/sprint145.md`.
- [x] **Lever 1 (`aeroCeiling`) SIGNED.** All 94 values ratified on review of the authoring pass
      below, and recorded as RATIFIED in the approval-gate ledger.
- [x] `aeroCeiling` required on the spec schema and authored for all 26 cars.
- [x] `styleBase` required on the spec schema and authored for all 26 cars - `docs/sprints/sprint_archive/sprint145.md`.
- [x] `statFormulas.styleCap` removed, not orphaned - `docs/sprints/sprint_archive/sprint145.md`.
- [x] A wing on a Wagon R does very little; the same wing on an FD does a lot; both pinned.
- [x] `harnessAcceptance.test.ts` passes untouched.
- [x] Every moved price pin re-derived from a real run (the `styleBase` share of this is done -
      `docs/sprints/sprint_archive/sprint145.md`; the `aeroCeiling` share moved nothing).
- [x] Checks run once each, output shown.

## The `aeroCeiling` authoring pass (68 values, SIGNED)

Authored against the rubric above, calibrated on the 26 that already existed, and ratified on
review of the reasoning below. The values live in the roster CSV; what follows is the reasoning for
the calls the rubric does not make on its own.

**The rule the column is authored to.** `aeroCeiling` asks what a body can be made to DO, which is
a question about shape, floor and the presence of real aerodynamic development. It is not a
question about how good, fast, expensive or desirable the car is, and it must not become a second
performance ranking. Several of the most desirable cars on the roster sit near the bottom.

**The classics ruling, applied.** Hakosuka 0.30, Kenmeri 0.30, 2000GT 0.30, Cosmo Sport 0.35, 510
Bluebird 0.35, Z432 0.40, Mini Cooper S 0.20. No aerodynamic development and no period aero
aftermarket worth the name. Low on physics while high on desirability is the correct reading and
is not a mistake to be fixed.

**One deliberate exception to it: the 240ZG at 0.55.** Unlike the other classics it was a
homologation model built with aero intent, so the G-nose, the over-fenders and the rear spoiler
are real rather than decorative. It earns a place above the classic floor and below the modern
sports shapes.

**The aero homologation specials score on their bodywork, not their tier.** 190E 2.5-16 Evolution
II 0.95, Escort RS Cosworth 0.95, Evo VI Tommi Makinen 0.95, Impreza 22B 0.95, Evo VIII MR 0.95,
E30 M3 0.90, Celica GT-Four ST205 0.90. These are cars whose shells were shaped to make downforce,
and the column should say so.

**The 1.00 club stays at eight**: FD3S, FD3S Spirit R, Supra RZ, BNR32, BCNR33, BNR34, R35, LFA.
The rubric wants a real factory wing AND a genuine period aftermarket behind it. The 190E and the
Escort have the first and, in this game's setting, not the second, so they sit at 0.95 rather than
joining it.

**Two comedy calls, both deliberate.** The Countach sits at 0.50: its aerodynamics were famously
poor and its wing cost more top speed than it bought grip, so it is the exotic equivalent of the
classics ruling. The Pajero Evolution sits at 0.35, the top of the boxes band: genuine Dakar
homologation aero addenda bolted to a brick earns the top of that band and nothing above it.

**The 0.20 floor is the Wagon R's and nothing goes below it**, so it stays the reference joke.
Sharing it: Acty truck, S-Cargo, Delica Star Wagon, Jimny, Safari, Land Cruiser 70, Today, Mini.
A kei truck is arguably worse aerodynamically than a tall hatch, and if the maintainer wants a
true floor beneath the Wagon R that is a one-value change.

**Roadsters are capped by having no roof to work and a short rear deck**: Cappuccino 0.40, Copen
0.40, NA Roadster 0.50, S2000 0.70. The S2000 sits highest because it is the only one of them
developed as a serious circuit car.

**One data oddity noticed while authoring, not fixed**: roster row 74, the Fairlady Z badged
`Z33, '02`, carries `yearFrom` 1994 and `curbWeightKg` 1520, which are row 58's figures for the
Z32 exactly. The Z33 is a 2002 car. Its `dragCd` does differ (0.30 against the Z32's 0.378), so
the row is not a wholesale duplicate. Nothing in this sprint reads either field, so it is reported
rather than changed.

## Exit

**Built, signed and closed.** Lever 1's 94 `aeroCeiling` values were ratified on review of the
authoring pass above, so directive 22 is satisfied and nothing is outstanding.

**The `styleBase` half is not restated here.** It shipped early inside
`docs/sprints/sprint_archive/sprint145.md` and that doc's Exit is its permanent record.

### 1. A wing on a Wagon R is now a bad idea

The whole point of Lever 1, measured with one SKU (`mikoshi-gt-wing`, race grade, downforce 1.2,
drag +0.09) bolted to both ends of the roster:

| | ceiling | downforce delivered | Misaki | Wangan | Hakone | Yatabe |
| --- | ---: | ---: | --- | --- | --- | --- |
| Wagon R (CT21S) | 0.20 | **0.24** | -0.1 | **-0.7** | -0.3 | **-0.7** |
| RX-7 (FD3S) | 1.00 | **1.20** | **+4.2** | **+4.7** | +1.2 | -0.3 |

**The wing is a straight loss on the Wagon R on every course**, because the ceiling scales the
downforce while the drag arrives in full. Without the ceiling the same wing gained the Wagon R
0.71s at Misaki and 0.77s at Hakone. It now costs it time everywhere, which is the joke landing
without anyone having to write a special case for silly cars.

The handling readout follows: with a sport wing the Wagon R reads 13 rather than 18, the S14
(0.85) reads 39 rather than 40, and the FD (1.00) is unmoved at 42.

### 2. Stock cars are untouched, all 26

Asserted directly rather than inferred: a stock mint instance's `effectiveDownforce` equals
`factoryDownforceCoeff` exactly, and is byte-identical with the model's ceiling forced to 0, which
would flatten every factory figure if the two paths were joined. **15 of the 26 carry a measured
factory downforce and 13 of those sit below 1.00**, so the check has teeth rather than passing
vacuously. Shown lap time is asserted identical on all 26 cars across all four courses.
`harnessAcceptance.test.ts` passed untouched, run explicitly.

### 3. The stat simplification, and what it revealed

`statModifiers.handling` is gone from the schema, the sim and all 472 SKUs.

**The schema-sharing risk did not materialise, because Sprint 135 had already resolved it.**
`StatWeightsSchema` (the taxonomy's five condition-weight columns) and `StatModifierSchema` (a
part's own deltas) have been separate objects since then, and Sprint 136 followed that split when
it deleted `reliability`. `weightedBandFactorForStat(..., 'handling', ...)` reads
`entry.statWeights.handling`, which never touched the deleted field. No split was needed and none
was made. Both halves are now asserted, including that `StatWeightsSchema` still carries all five
columns and still rejects an unknown key.

**The measured effect is larger than the sprint expected.** The additive column was saturating the
stat: a full race chassis build read **exactly 100 handling on all 26 cars**, at mint and at worn
alike. It now spreads **42 (Wagon R) to 71 (Supra)** at mint and 15 to 32 at worn, against a stock
spread of 12 to 41. The stat discriminates between cars again instead of pegging at its ceiling,
which is the real reason the second path had to go rather than merely being a duplicate.

Reliability is provably unmoved: the baseline was measured BEFORE the deletion, on a build filling
all 14 slots that carried the field at race grade, and every one of the 26 cars reads strict
equality at mint and at worn.

### 4. What moved

**One pin, and it is not a price.** `street-power-street-manners`'s
`tasteMatch(tuner).minMultiplier` went 1.08 to 1.06, which is `round2At97Percent` of the freshly
measured taste ratio per the probe's own stated formula: handling is a buyer-weighted stat and 148
SKUs stopped contributing to it. Directive 17 case (a), explicitly not hash-gated, and recorded in
the approval-gate ledger.

**Nothing else.** No payout, no budget cap, no `economy.json` or `partPricing.json` value, and no
part price or bill threshold, so `enforceMinWorkBill` drew the same PRNG steps and the three
seeded auction-demo suites pass untouched. No valuation or sale-price pin moved either:
`marketValueYen` takes no stats, so a downforce ceiling cannot reach it.

Five sim fixtures and two reference chassis gained an `aeroCeiling` line. **Neither directive 17
case applies to those**: no test failed and no assertion changed, a newly required schema field
simply stopped incomplete object literals compiling.

### 5. The roster guard grew teeth

Proved by mutation rather than asserted: changing the Wagon R's 0.20 to 0.25 fails the guard, and
the change was reverted. Two checks were added in the same file, because a blank cell would parse
as 0 and silently kill a car's wing: every one of the 94 rows carries an in-band value, and the two
authored ends are pinned (the 0.20 floor is the Wagon R's, and the 1.00 club is eight cars).

### 6. Flagged, deliberately not changed

- **`nissan-fairlady-z-z32` at 0.95** sits above the FC3S and SW20 (0.90) and level with the
  homologation specials, which reads generous for a heavy GT.
- **`toyota-sera-exy10` at 0.45** is the one coupe below the 0.65-0.80 coupe band. Defensible for a
  Starlet-based glasshouse, but it is the single value outside its rubric band.
- **Pre-existing and untouched by this sprint**: `honda-city-e-aa`'s measured lateral pair
  (0.86 rising to 0.97) implies a factory downforce coefficient of **1.004** on a 63 PS 1984 city
  car, which is near race-wing levels. The ceiling deliberately does not scale factory figures, so
  this sprint leaves it exactly as it found it, but it is an artefact worth an eye.
