# Sprint 140: stat simplification, aero ceiling, style base

**Status: PART READY, PART AWAITING SIGN-OFF.** Tasks 1 and 2 move no economy value and can
proceed the moment Sprint 135 has shipped. Tasks 3 and 4 need the tables in "The levers"
signed (directive 22).

Opens after Sprint 135. Seventh of nine in the tuning overhaul arc. It does not depend on
Sprints 136 to 140 and may run in parallel with them.

Design reference: `docs/design/systems/tuning-system.md` sections 11 and 12.

## The gaps, stated plainly

**Four separate small defects**, grouped because they are all "a stat that is not carrying
its weight" and splitting them would cost four sprints of overhead for four small changes.

1. **`statModifiers.handling` is a second route to grip.** `physicalModifiers.grip` already
   moves the same quantity, and `PhysicalModifierSchema`'s own comment warns that "a second
   path for either would charge one upgrade twice". This is that second path.
2. **`statModifiers.reliability` is an additive stat the design has decided is derived**
   (section 9): a part does not add reliability; the build supports its own output or it does
   not.
3. **Every car has the same aero potential.** Bolting a GT wing to a Wagon R delivers what it
   delivers on an FD. It should look silly and do very little.
4. **Every stock car has the same style score.** `styleCap` is 20 and `style` is
   `styleFraction * styleCap`, so a mint Wagon R and a mint FD in identical condition score
   identically on taste.

## Reuse analysis (directive 16)

### Genuinely new

- **Two per-car numbers**, `aeroCeiling` and `styleBase`, authored on `CarModel.spec`.

### Existing mechanisms reused, unchanged

- **`physicalModifiers.grip`** already carries everything handling needs, through
  `effectiveGrip` and `gripToDisplay`. Deleting the additive path removes a duplicate, it
  does not remove a capability.
- **`statFormulas.aero.byGrade`** and `effectiveDownforce`, which already resolve what an
  aero SKU delivers. The ceiling multiplies that result; it does not replace the mechanism.
- **`computeDerivedStats`'s existing style line**, which already reads a cap from content.
  The cap becomes per car.
- **`StatBlock` keeps all five stats.** Only the *part modifier* fields go.

### The distinction that must not be got wrong

**Deleting `statModifiers.reliability` does NOT delete `StatBlock.reliability`.** The stat
stays, every buyer weights it through `statWeights`, and `computeDerivedStats` keeps deriving
it from the taxonomy's condition weights. What goes is the ability of a *purchased part* to
add a flat reliability number.

**Whether reliability's derivation moves from condition to the support ratio is Sprint 138's
route 2 and Sprint 139's decision, not this sprint's.** Do not change the derivation here.

## The levers (tasks 3 and 4 only, ALL UNAPPROVED, directive 22)

### Lever 1: `spec.aeroCeiling`

A multiplier, 0 to 1, on the downforce an aero SKU delivers. **1.0 means the part performs as
authored.** This prevents every car eventually becoming a GT3 car, and it is what makes a
wing on a kei van read as the joke it is.

| car | ceiling | reasoning |
| --- | ---: | --- |
| mazda-rx7-fd3s | 1.00 | the roster's aerodynamic reference |
| toyota-supra-rz-jza80 | 1.00 | a real factory wing and a genuine aftermarket behind it |
| nissan-skyline-gtr-bnr32 | 1.00 | homologated for exactly this |
| nissan-fairlady-z-z32 | 0.95 | broad and stable, slightly softer intent |
| subaru-impreza-wrx-sti-gc8 | 0.95 | rally saloon, real downforce, less frontal potential |
| mazda-savanna-rx7-fc3s | 0.90 | the shape wants it |
| toyota-mr2-sw20 | 0.90 | mid-engined, genuinely aero-sensitive |
| nissan-silvia-s13 | 0.85 | the drift-culture staple, plenty fitted in period |
| nissan-silvia-ks-s14 | 0.85 | as S13 |
| nissan-180sx-rps13 | 0.85 | as S13 |
| toyota-mr2-aw11 | 0.75 | small and light, less to work with |
| toyota-sprinter-trueno-ae86 | 0.70 | a 1983 saloon shell; the culture fits wings, physics disagrees |
| honda-crx-sir-ef8 | 0.70 | short and stubby |
| honda-prelude-si-vtec-bb4 | 0.70 | low and wide, but a road coupe |
| toyota-chaser-tourer-v-jzx90 | 0.65 | a saloon with pretensions |
| honda-civic-sir2-eg6 | 0.65 | hot hatch, limited rear potential |
| nissan-cefiro-a31 | 0.60 | a comfortable saloon |
| toyota-aristo-30v-jzs147 | 0.60 | a luxury saloon; fast, not aerodynamic |
| honda-beat-pp1 | 0.50 | tiny mid-engined roadster, better than a kei box and not by much |
| toyota-sera-exy10 | 0.45 | a curiosity with doors, not a wing car |
| nissan-sunny-b12 | 0.40 | an economy saloon |
| toyota-carina-at150 | 0.40 | an economy saloon |
| honda-city-turbo-ii-aa | 0.35 | a tall box, and it knows it |
| honda-city-e-aa | 0.30 | a taller box |
| suzuki-alto-works-ha21s | 0.30 | a kei box |
| suzuki-wagon-r-ct21s | **0.20** | **the joke case, and it should read as one** |

### Lever 2: `spec.styleBase`

Replaces the flat `statFormulas.styleCap` of 20 as the per-car mint ceiling on style, keeping
the same 0 to 20 scale so nothing else in the formula moves.

| car | base | | car | base |
| --- | ---: | --- | --- | ---: |
| mazda-rx7-fd3s | 18 | | toyota-chaser-tourer-v-jzx90 | 13 |
| toyota-supra-rz-jza80 | 17 | | honda-crx-sir-ef8 | 13 |
| nissan-skyline-gtr-bnr32 | 17 | | honda-prelude-si-vtec-bb4 | 13 |
| nissan-fairlady-z-z32 | 16 | | toyota-mr2-aw11 | 13 |
| toyota-sprinter-trueno-ae86 | 16 | | honda-city-turbo-ii-aa | 12 |
| subaru-impreza-wrx-sti-gc8 | 15 | | honda-civic-sir2-eg6 | 12 |
| nissan-silvia-s13 | 15 | | toyota-aristo-30v-jzs147 | 12 |
| nissan-180sx-rps13 | 15 | | nissan-cefiro-a31 | 11 |
| mazda-savanna-rx7-fc3s | 15 | | suzuki-alto-works-ha21s | 9 |
| toyota-mr2-sw20 | 15 | | nissan-sunny-b12 | 7 |
| nissan-silvia-ks-s14 | 14 | | toyota-carina-at150 | 6 |
| toyota-sera-exy10 | 14 | | honda-city-e-aa | 6 |
| honda-beat-pp1 | 14 | | suzuki-wagon-r-ct21s | 4 |

The Sera at 14 is deliberate: it is a slow car with butterfly doors and a glass roof, and
style is taste rather than physics. The AE86 at 16 is the same argument from the other end.

## Task breakdown

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
   `StatModifierSchema` (a part's deltas, two fields) and a separate `StatWeightsSchema` (the
   taxonomy's condition weights, five fields). Splitting is the correct answer if the check
   fails; state which happened in the Exit.

### Task 2: delete `statModifiers.reliability` (no sign-off needed)

Same four steps. **`StatBlock.reliability` stays. The taxonomy's reliability condition
weights stay. Buyers keep weighting it.** Only the part-delta field goes.

### Task 3: `spec.aeroCeiling` (needs Lever 1 signed)

1. `packages/content/src/carModel.ts`: add `aeroCeiling: z.number().min(0).max(1)` to the
   spec schema. **Required, not defaulted**, so a car added later cannot silently inherit a
   value nobody chose.
2. `packages/content/data/cars.json`: the 26 values.
3. `packages/sim/src/performance.ts`: `effectiveDownforce` multiplies its resolved
   `downforceCoeff` by the model's ceiling.
4. **A stock car must be unaffected**, because a stock car carries no aero SKU and therefore
   no downforce to scale. Assert it for all 26.

### Task 4: `spec.styleBase` (needs Lever 2 signed)

1. `packages/content/src/carModel.ts`: `styleBase: z.number().min(0).max(20)`, required.
2. `packages/content/data/cars.json`: the 26 values.
3. `packages/sim/src/derivedStats.ts`: `style = styleFraction * model.spec.styleBase`
   replaces `styleFraction * styleCap`.
4. `packages/content/data/economy.json`: retire `statFormulas.styleCap`. **Remove it rather
   than leaving it unread**, so no future reader treats a dead lever as live.

### Task 5: tests

1. **No SKU carries a handling or reliability modifier**, structurally, from content.
2. **Handling still responds to condition and to grip parts.** A car with worn suspension
   reads lower handling than the same car at mint; a car with race coilovers reads higher
   than one without. This is the regression test for Task 1's schema-sharing risk.
3. **Reliability still responds to condition**, and no purchasable part moves it.
4. **A wing on a Wagon R does very little**, and the same wing on an FD does a lot. Pin both,
   as lap-time deltas as well as downforce, because the lap is what the player feels.
5. **Stock cars are unaffected by the aero ceiling**, all 26.
6. **Stock style now varies across the roster** and matches Lever 2 exactly, all 26.
7. **`harnessAcceptance.test.ts` passes untouched**, which follows from tests 5 and the fact
   that stock cars carry no aero.

### Task 6: checks

```text
pnpm test --project content
pnpm test --project sim
pnpm test --project game
```

### Task 7: re-derive whatever moved

Directive 17 case (a). **Style moving changes taste-adjusted prices across the whole roster**,
so expect sale-price and valuation pins to move widely. This is the largest fallout in the
arc after Sprint 135, and every pin is re-derived from a real run.

`economyApprovalGate.test.ts` moves (`styleCap` retired); re-pin in the same change as the
recorded sign-off.

## Hard constraints

- **Tasks 1 and 2 may proceed without sign-off. Tasks 3 and 4 may not.** If the levers are
  unsigned, ship tasks 1 and 2 and stop.
- **Do not delete `StatBlock.reliability` or `StatBlock.handling`.**
- **Do not change reliability's derivation.** That is Sprint 139's decision.
- **Performance never moves price**, and note that style is taste rather than performance, so
  the style change moving prices is correct and is not a breach.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] `statModifiers.handling` gone from schema, sim and all 472 SKUs.
- [ ] `statModifiers.reliability` gone from the same three places.
- [ ] `StatBlock` still carries all five stats; buyers still weight reliability.
- [ ] Handling still responds to condition and to grip parts, proved by test.
- [ ] The schema-sharing check done, and its outcome recorded in the Exit.
- [ ] Levers 1 and 2 signed and recorded, or tasks 3 and 4 deferred with that stated.
- [ ] `aeroCeiling` and `styleBase` required on the spec schema and authored for all 26 cars.
- [ ] `statFormulas.styleCap` removed, not orphaned.
- [ ] A wing on a Wagon R does very little; the same wing on an FD does a lot; both pinned.
- [ ] `harnessAcceptance.test.ts` passes untouched.
- [ ] Every moved price pin re-derived from a real run.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
