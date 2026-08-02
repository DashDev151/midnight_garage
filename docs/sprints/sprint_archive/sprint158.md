# Sprint 158: the style axis was three parts long and the patterns barely moved

**Status: READY FOR REVIEW.** Two defects found by measurement after the desirability and
generation arcs shipped, plus one naming correction. Both defects are structural: neither is a
number that needed nudging.

## Reuse analysis (directive 16)

**New mechanisms.** Exactly one: `patternConditionOffsets` (`sim/damagePatterns.ts`), a per-part
condition offset derived from the damage pattern's existing group weights, and its one content
lever `partsGeneration.patternConditionSwingPercent`.

**Existing mechanisms reused.**

| concern | what already existed and was reused |
| --- | --- |
| where damage sits, per group | `relativeGroupWeight` - already the normalised reading of a pattern's group row, already exactly 1 for an even pattern. The offset is a linear function of it and nothing else. |
| the pattern reaching the shell | `zoneDamageOrder` - untouched. The offset is its counterpart one layer in, and the two are deliberately different mechanisms for different substrates (see below). |
| the pattern reaching the budget | `spendDamageBudget` / `pickPatternGroup` - untouched. Measurement showed they were already correct. |
| the style formula | `stylePercentOf` - untouched. Only the catalogue it reads and the saturation lever changed. |
| the buyer archetype | `BuyerArchetypeSchema` and `buyers.json` - a rename, no new field, no value moved. |
| the retirement ledger | `retiredIdentifiers.test.ts` - the old archetype name goes in the existing table. |

Nothing new was stood up beside anything that already worked. In particular the damage BUDGET was
left exactly as it is, because the diagnosis showed it was not the problem.

---

## Defect 2: damage patterns barely worked

### The reported symptom

Measured across five forced patterns, 400 Silvia S13 lots each: the widest per-group shift against
the flat `garaged` baseline was **1.26x** (`grenade`, engine), while the body zones moved **1.47x**
(`frontal-collision`, bonnet). A pattern is supposed to say WHERE a car is damaged, and on the
mechanical groups it was close to saying nothing.

### The suspected cause, and why it was wrong

The standing suspicion was that `spendDamageBudget` spends shallow-first across the whole car and
flattens the group weighting on its way through, the same way it had previously flattened a
per-slot weighting.

**It does not, and it has not since Sprint 155.** `spendDamageBudget` already draws the GROUP first
(`pickPatternGroup`) and only then lets shallow-first level within it. Measured directly, by
generating each car twice off the same seed - once with `allowSymptoms: false`, which returns the
car before symptoms and before the budget, and once in full - the budget's own allocation lands
almost exactly on the authored weights:

| pattern | engine share of ADDED steps | authored engine weight |
| --- | --- | --- |
| `garaged` | 25.2% | 17 of 100 |
| `neglected-commuter` | 33.2% | 26 of 100 |
| `frontal-collision` | 43.2% | 30 of 100 |
| `drifted` | 19.0% | 12 of 100 |
| `grenade` | 61.8% | 62 of 100 |

The budget is doing its job. Nothing in it needed changing, and nothing in it was changed.

### The actual cause: the pattern was steering a fifth of the car

The same measurement, split by generation stage, per group, mean band steps per car:

| stage | steps | share |
| --- | --- | --- |
| condition roll (baseline, per part, pattern-blind) | 34.16 | **77.6%** |
| symptoms plus the damage budget (pattern-directed) | 9.88 | 22.4% |
| total | 44.04 | |

**The pattern only ever reached 22 per cent of a car's band steps.** The other 78 per cent came
from the per-part condition roll, which jitters every slot around one car-wide baseline with no
reference to what happened to the car. Perfect concentration of the entire budget into one group
would have moved engine from 15.80 to 13.30 + 9.88 = 23.18, a hard ceiling of **1.47x** - and the
budget achieved 1.26x of that.

This is also exactly why the zones moved further with no extra effort. `rollZoneStates` deals
**all** of the shell's rolled severity along `zoneDamageOrder`, so 100 per cent of body damage is
pattern-arranged. The parts were the half of the car still being filled in blind.

### Why rearranging the roll is not enough either

The obvious fix, and the one the brief proposed, is to deal the rolled condition percents along a
pattern-weighted part order - the exact counterpart of `zoneDamageOrder`. It was implemented and
measured, and it is **arithmetically incapable of reaching the target**:

| measurement (400 cars, S13) | value |
| --- | --- |
| engine's flat share of the car's band steps | 13.78 |
| engine holding the **ten worst** of the car's twenty-six rolled steps | 16.82 |
| **ceiling on any permutation** | **1.224x** |
| what the weighted deal actually achieved (`grenade`) | 1.166x |

Every part jitters around one baseline, so a car's own spread is narrow: the step histogram over
10,084 slot observations is 0:1656, 1:3948, 2:3718, 3:731, 4:31. There is not enough variance in a
car's condition to redistribute. Moving damage between slots cannot express a shunt; the roll
itself has to move. The deal was reverted rather than kept alongside the fix that works - two
mechanisms answering one question is exactly what directive 16 bans.

### The fix

`patternConditionOffsets` (`sim/damagePatterns.ts`): every offsetable slot takes a condition offset
of `-swing * (relativeGroupWeight(group) - mean)`, where the mean is taken over the same slots, so
**the offsets sum to exactly zero across the car**. Generation adds it to the per-part roll
(`patternOffsetByPartId` in `auctions.ts`) and nothing else changes.

Three properties fall out of the shape rather than being defended by special cases:

1. **A pattern that implicates every group equally offsets nothing.** `relativeGroupWeight` is 1
   for every group there, so every offset is 0 and the condition roll is exactly what it was.
2. **The pattern owns WHERE, the grade owns HOW MUCH.** Because the offsets are centred, an
   implicated group is worse and a spared group is BETTER by exactly as much. A grenaded car's
   engine is destroyed and its interior is tidy, which is the honest reading of the event.
3. **Shallow-first is untouched**, so young cars keep their protection. The offset happens before
   the budget and does not interact with it.

Two slots take no offset, both because a slot whose rolled band is then discarded would break the
sum-to-zero property and let a pattern change how rough its cars are: the three zone-derived body
carriers (`applyDerivedBodyBands` overwrites their band from the zone table) and `forcedInduction`
on a car that never had any.

### Result

Mean band steps per taxonomy group, 400 S13 lots per forced pattern, each pattern's multiple of the
flat `garaged` baseline in brackets. Body-derived carriers excluded (they are the zone table's).

| pattern | engine | drivetrain | suspension | wheels | body | interior |
| --- | --- | --- | --- | --- | --- | --- |
| `garaged` | 15.99 | 8.62 | 10.15 | 3.88 | 1.89 | 3.83 |
| `neglected-commuter` | 17.70 (1.11x) | 7.60 (0.88x) | 10.68 (1.05x) | 4.05 (1.04x) | 1.76 (0.93x) | 2.81 (0.73x) |
| `frontal-collision` | 18.76 (1.17x) | 6.41 (0.74x) | 9.39 (0.93x) | 3.12 (0.80x) | 2.38 (1.26x) | 2.56 (0.67x) |
| `drifted` | 14.48 (0.91x) | 9.67 (1.12x) | 11.84 (1.17x) | 4.71 (1.21x) | 1.57 (0.83x) | 2.53 (0.66x) |
| `grenade` | **24.38 (1.53x)** | 7.43 (0.86x) | 7.19 (0.71x) | 2.50 (0.64x) | 1.29 (0.68x) | 2.31 (0.60x) |

**Both readings of the target are met.**

| measure | before | after | target |
| --- | --- | --- | --- |
| widest per-group multiple of the flat baseline | 1.26x | **1.53x** | at least as wide as the zones |
| widest body-ZONE multiple, for comparison | 1.47x | 1.49x | - |
| most- against least-implicated group, `neglected-commuter` | 1.28 | **1.51** | 1.5 |
| most- against least-implicated group, `frontal-collision` | 1.59 | **1.89** | 1.5 |
| most- against least-implicated group, `drifted` | 1.52 | **1.83** | 1.5 |
| most- against least-implicated group, `grenade` | 1.61 | **2.52** | 1.5 |

And total damage still does not move with the pattern, which is the property that says a pattern
buys nothing:

| pattern | `garaged` | `neglected` | `frontal` | `drifted` | `grenade` | spread |
| --- | --- | --- | --- | --- | --- | --- |
| total mean band steps | 44.36 | 44.60 | 42.62 | 44.80 | 45.10 | **1.058** (bar: 1.10) |

Measured before the budget runs, the invariance is near-exact: 34.48 / 34.34 / 34.38 / 34.39 /
34.42, a spread of 1.004. The 1.058 above is the Law 2 softener trimming an engine-concentrated
car's bill, which is the softener working.

---

## Defect 1: the style axis was three parts long

### The measurement

`statFormulas.styleSaturationPoints` was **60**. Three SKUs carried 68 points between them: race
aero 30, race rims 20, race seats 18. **A car reached its full style ceiling on three purchases**,
and every style part in the game was then worth exactly nothing on it.

The distribution was the deeper half of it: 19 style-bearing SKU families sat in **five** slots, and
the loudest three held 83 per cent of the points. (The brief's slot list named `panels`, `paint` and
`underbody` as well; those carry no aftermarket SKU at all, so the real count was five, not seven.)

### The fix, half one: flatten the catalogue

Style now sits on **ten** slots, 36 SKU families, 144 rows across the four fitment classes. The
ladder is authored by how much a slot changes how the car LOOKS, in the era's own terms:

| slot | street | sport | race | why it sits where it does |
| --- | --- | --- | --- | --- |
| `aero` | 5/7/8 | 8/9/13 | 6/12/18 | Still the loudest thing you can do to a car's silhouette. Three families per grade, so the numbers are the low/mid/top of each. |
| `rims` | 6 | 10 | 14 | The single most-noticed change in this culture, and the one every photograph is of. |
| `seats` | 4 | 7 | 10 | The interior a buyer actually sits in. |
| `dampers` | 4 | 6 | 8 | Stance. A car that sits right reads completely differently, and coilovers are how it gets there. |
| `dashGauges` | 3 | 5 | 8 | The other half of the interior. |
| `exhaust` | 3 | 5 | 7 | The tip is visible and the car is audible. The classic first modification. |
| `springs` | 3 | 5 | 7 | The other route to the same stance, priced just under coilovers. |
| `brakeCalipersLines` | 2 | 4 | 6 | A big brake kit is seen through the spokes, and only through them. |
| `tyres` | 2 | 4 | 6 | Section and fill. Real, and quieter than a wheel. |
| `intake` | 2 | 3 | 4 | Engine-bay dressing: seen when the bonnet is up, and no further. |

**Best-in-slot total: 88 points** (was 82 on five slots). The loudest three now hold 42 of 88,
**47.7 per cent** (was 83), and they no longer add up to a finished car on their own.

Grade order now holds in every slot, which it did **not** before: `dampers` ran street 3, sport 0,
race 0, so the cheapest coilover was the best-looking one. A test now pins race above sport above
street in every style-bearing slot.

### The fix, half two: the saturation point

`statFormulas.styleSaturationPoints` **60 -> 66**, moved with the catalogue it prices rather than on
its own. Against 88 available points it leaves 22 of headroom, so a focused build reaches its car's
ceiling without needing literally every style part, and the last stretch is spent on an
already-finished car.

**Parts required to reach a car's style gap**, best-in-slot fitted loudest-first, which is the
cheapest possible route to a ceiling (anything else a player does takes more parts, never fewer):

| share of the car's gap | before (68 pts in 3 slots, saturation 60) | after (88 pts in 10 slots, saturation 66) |
| --- | --- | --- |
| 50 per cent | **1 part** | **3 parts** |
| 80 per cent | **2 parts** | **5 parts** |
| 100 per cent | **3 parts** | **7 parts** |

A full sport-grade dress of all ten slots lands at 86 per cent of the gap: you can see the ceiling
without race parts and you cannot quite touch it. Six race-grade parts reach 98.5 per cent, so the
last point genuinely costs a seventh part.

---

## The archetype rename

`kei-specialist` -> **`hobbyist`**, everywhere including its want-line. **No target, importance or
tier-preference value changed.** It was never kei-only - its `tierPreferences` are entry 1.0 AND
everyday 0.6 - and every other archetype is a role-noun: collector, tuner, stancer, racer,
first-timer. The old name is in `retiredIdentifiers.test.ts`.

The want-line claimed otherwise and was rewritten:

> Wants a small, light car that still drives the way it was built to: tidy on its feet, nothing
> shouting. A big turbo does not impress him; it worries him, because that is not what the car was
> for.

---

## Levers moved, and why (R4)

Every value chosen, with its reasoning. All are recorded in `economyApprovalGate.test.ts`'s ledger
alongside the re-pinned hash.

The swing sweep, 400 S13 lots per pattern per value, same seeds throughout. `widest` is the widest
per-group multiple of the flat baseline (the number the defect report gave as 1.26); `weakest
spread` is the most- against least-implicated group on the mildest pattern in the catalogue, which
is the binding constraint:

| swing | widest group multiple | weakest per-pattern spread | total-damage spread |
| --- | --- | --- | --- |
| 0 (the reported state) | 1.262 | 1.28 | 1.051 |
| 5 | 1.453 | 1.44 | 1.057 |
| 6 | 1.489 | 1.48 | 1.056 |
| **7 (shipped)** | **1.525** | **1.51** | 1.058 |
| 8 | 1.557 | 1.55 | 1.056 |

| lever | from | to | reasoning |
| --- | --- | --- | --- |
| `partsGeneration.patternConditionSwingPercent` | (new) | **7** | Sized against the band widths it has to cross. Bands are 20 to 30 condition percent wide and the sharpest authored relative weight is 3.7 (`grenade`, engine), so 7 moves the loudest group about 20 percent: one full band, and no more than one. Swept, same seeds, and **7 is the smallest value that clears BOTH readings of the target on EVERY pattern** (the binding one is `neglected-commuter`, the mildest weighting in the catalogue). Total damage is flat across the whole sweep, so the choice costs nothing elsewhere. |
| `statFormulas.styleSaturationPoints` | 60 | **66** | Set against the whole catalogue, not its loudest few parts. 66 of 88 gives the 3/5/7-part curve above; at 60 the curve is 2/4/6 and two parts still buy half a car; at 72 a full sport-grade dress of every slot reaches only 79 per cent, which punishes a coherent build for not being a maximal one. It also has to sit at or below 84, or the existing "fitting more past saturation changes nothing" test has no strict subset left to fit. |
| `parts.json` `statModifiers.style` | 19 families, 5 slots, 82 pts | **36 families, 10 slots, 88 pts** | Per-slot reasoning in the table above. Total kept near where it was so the saturation move is the only real repricing; grade order enforced; top-three share 83% -> 47.7%. |
| `storyMissions.json` `low-and-loud` style min | 74 | **64** | NOT a design decision. `storyMissionProbes.test.ts` defines this bar as 90 per cent of what its own reference build (sport aero, sport rims, street seats on an S14) achieves, and that three-part build now buys less by design. Re-derived mechanically from a real probe run, exactly as the ledger records the Sprint 152 thresholds being derived. Its stancer `tasteMatch` of 1.09 was re-derived too and did not move. **No payout or budget cap moved.** |
| `buyers.json` archetype id, display name, want-line | `kei-specialist` | `hobbyist` | Naming only. Every stat target, importance and tier preference is byte-identical. |

Not moved, and deliberately: `damagePatterns.json` (the group and zone weights were already
right - the problem was that only a fifth of the car was reading them), `bandStepsByGrade`,
`maxBillFraction`, `partPricing.json`, every mission payout and budget cap.

---

## Pins re-derived

| pin | file | from | to |
| --- | --- | --- | --- |
| economy.json approval hash | `economyApprovalGate.test.ts` | `a43d34af...dcd252d` | `67f82042...c7b0e0b5b` |
| 30-day golden master | `advanceDay.test.ts` | `f419f088` | `808948e0` |
| acquisition-to-sale golden | `advanceDay.test.ts` | `964ca42d` | `1bb7d3b7` |
| `damagePatterns.json` hash | `economyApprovalGate.test.ts` | unchanged | unchanged |
| `partPricing.json` hash | `economyApprovalGate.test.ts` | unchanged | unchanged |
| mission payouts and budget caps | `economyApprovalGate.test.ts` | unchanged | unchanged |

Both golden hashes move for one reason: every generated lot's bands are now arranged by its
pattern. **No rng draw was added or removed** - the offset is a pure function of the pattern and
consumes no randomness - so the move is in the outcomes, not the stream. Re-derived from real runs.

## Tests changed, and which case each was (directive 17)

All four are **case (a)**: the implementation deliberately changed what is correct.

1. **`damagePatterns.test.ts`, the shunt-against-drift bars.** Raised from 1.05/1.15/1.15/1.05/1.1
   to 1.15/1.3/1.3/1.15/1.3 against measured 1.30/1.52/1.51/1.26/1.51. Leaving them where they were
   would let the defect regress silently, which is what they failed to catch the first time.
2. **`damagePatterns.test.ts`, a new test.** `grips the mechanical groups at least as hard as it
   grips the shell`: every non-flat pattern must separate its most- from its least-implicated group
   by at least 1.5x, and the widest group in the catalogue must reach 1.45x of the flat baseline.
   This is the bar the layer previously failed with nothing asserting it.
3. **`generationCoherence.test.ts`, the barely-driven-car tail.** `p90 <= 3` became `p90 <= 4`.
   This is concentration, not damage, and it was verified as such rather than assumed: run against
   the same 4,000 seeds with `patternConditionSwingPercent` at 0, these cars carry **29.73** band
   steps apiece and a p90 of 3; at the shipped 7 they carry **29.98** and a p90 of 4. Same damage,
   fewer slots, which is the whole point of a pattern. The median (1), the nothing-ruined share
   (0.447 -> 0.428, bar 0.4) and the mean (1.211 -> 1.384, bar 1.5) all held without being touched.
4. **`style.test.ts`, three new catalogue-shape tests** plus the stale 82/60 comment corrected to
   88/66. The formula tests were already written against the catalogue rather than against hard
   figures, so none of them needed a number changed.

## Checks

Run once each, narrowest first, per directive 20. The field-shape carve-out applies (an exported
schema key was renamed and a lever added), so `pnpm typecheck` ran before this report.

```text
pnpm typecheck
  packages/content typecheck: Done
  packages/sim typecheck: Done
  packages/game typecheck: Done

pnpm vitest run --project content
  Test Files  26 passed (26)
        Tests  570 passed (570)

pnpm vitest run --project sim
  Test Files  77 passed (77)
        Tests  2042 passed (2042)

pnpm vitest run --project game
  Test Files  63 passed (63)
        Tests  847 passed (847)
```

Lint, format and the coverage gate are left to the pre-push hook, which is the enforced gate.

## Exit

- [x] Defect 2 diagnosed by measurement before anything was changed, and the suspected cause
      (`spendDamageBudget` spending shallow-first) **disproved**: the budget's allocation already
      matches the authored weights to within a few points.
- [x] Real cause established: the pattern reached 22 per cent of a car's band steps, and a
      permutation of the other 78 per cent tops out at 1.22x.
- [x] Mechanical groups now shift 1.53x against the flat baseline, wider than the body zones'
      1.49x, and every pattern separates its extremes by at least 1.51x.
- [x] Total damage still near-constant across patterns (1.058, bar 1.10); shallow-first untouched;
      the age-0 guard (`poorOrWorseFraction < 0.05`) and the barely-driven-car median both hold.
- [x] Style catalogue flattened to ten slots and 88 points, top three at 47.7 per cent, grade order
      restored in every slot.
- [x] Saturation set to 66: three parts to half a car's gap, five to four fifths, seven to all of
      it.
- [x] `kei-specialist` renamed to `hobbyist` everywhere including its want-line, no value moved, old
      name in the retirement ledger.
- [x] Every pin re-derived from a real run; typecheck plus all three test projects green.
- [ ] Maintainer review of the two chosen levers (`patternConditionSwingPercent` 7,
      `styleSaturationPoints` 66) and of the ten-slot style ladder.

## Follow-ups noted, not actioned

- `docs/design/systems/style-authoring-proposal.md`'s per-car analysis of which cars clear which
  buyer target predates this re-author; its `styleBase`/`styleCeiling` conclusions are unaffected
  (neither moved) but its "which build clears 55" arithmetic is now stale.
- `docs/design/systems/arc-showcase.md`'s symptom tables were not re-measured. The symptom draw
  itself is unchanged, but it now runs on differently-banded cars, so those figures may have
  drifted slightly.
