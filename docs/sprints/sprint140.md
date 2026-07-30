# Sprint 140: stat simplification, aero ceiling, style base

**Status: PART READY, PART BLOCKED ON AUTHORING.** Task 1 moves no economy value and can proceed
the moment Sprint 135 has shipped. **Tasks 2 and 3 are blocked twice over**: both levers are
authored for 26 of the 94 roster cars, which directive 24 makes the wrong scope, and neither is
signed (directive 22). Task 0 closes the first; the maintainer closes the second.

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

**Both columns currently hold 26 of 94.** Completing them is Task 0 below and it blocks Tasks 2
and 3. It does not block Task 1.

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

### Lever 2: `spec.styleBase` (94 values, 26 authored)

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

### Task 0: finish authoring both columns to 94 (blocks Tasks 2 and 3)

`docs/design/midnight-garage-roster.csv`: fill `aeroCeiling` and `styleBase` for the 68 rows that
have neither, against the rubrics above.

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

### Task 3: `spec.styleBase` (needs Lever 2 signed)

1. `packages/content/src/carModel.ts`: `styleBase: z.number().min(0).max(20)`, required.
2. `packages/content/data/cars.json`: the 26 values.
3. `packages/sim/src/derivedStats.ts`: `style = styleFraction * model.spec.styleBase`
   replaces `styleFraction * styleCap`.
4. `packages/content/data/economy.json`: retire `statFormulas.styleCap`. **Remove it rather
   than leaving it unread**, so no future reader treats a dead lever as live.

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

Directive 17 case (a). **Style moving changes taste-adjusted prices across the whole roster**,
so expect sale-price and valuation pins to move widely. This is the largest fallout in the
arc after Sprint 135, and every pin is re-derived from a real run.

`economyApprovalGate.test.ts` moves (`styleCap` retired); re-pin in the same change as the
recorded sign-off.

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

- [ ] `statModifiers.handling` gone from schema, sim and all 472 SKUs.
- [ ] `StatModifierSchema` carries `style` and `authenticity` only, asserted.
- [ ] The parts market shows a power percentage when a car is selected, resolved against that
      car's own character and stock output, and shows nothing at all when none is.
- [ ] `StatBlock` still carries all five stats; buyers still weight reliability.
- [ ] Handling still responds to condition and to grip parts, proved by test.
- [ ] Reliability provably unmoved by this sprint, all 26 cars, strict equality.
- [ ] The schema-sharing check done, following whatever Sprints 135 and 136 decided, and its
      outcome recorded in the Exit.
- [ ] Both columns authored to all 94 rows in the roster CSV (Task 0).
- [ ] Levers 1 and 2 signed and recorded, or tasks 2 and 3 deferred with that stated.
- [ ] `aeroCeiling` and `styleBase` required on the spec schema and authored for all 26 cars.
- [ ] `statFormulas.styleCap` removed, not orphaned.
- [ ] A wing on a Wagon R does very little; the same wing on an FD does a lot; both pinned.
- [ ] `harnessAcceptance.test.ts` passes untouched.
- [ ] Every moved price pin re-derived from a real run.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
