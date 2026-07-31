# Generation arc: the lever ledger for review

## What this is

Overnight on 2026-07-31 into 2026-08-01, sprints 153 to 157 ran. This collates every economy
lever, content value and authored table those sprints moved or created, so the lot can be
reviewed in one sitting. **Every value below is PROVISIONAL pending your review**, except where a
row says you already signed it in session.

**R4, the second standing lever grant.** Going off shift with sprints 154 to 157 outstanding, you
gave express verbal permission to move levers again for the rest of the arc: decide a value,
implement, test, document it, and you review in the morning. It is recorded in
`docs/design/systems/sale-value-implementation-plan.md` section R4 and in the session transcript,
and it is **not a CLAUDE.md directive and not an amendment to directive 22**. It expires on your
return; every value moved under it is provisional until you rule.

**One accuracy correction up front: R4 does not cover Sprint 153.** Its own text scopes it to
sprints 154 to 157. Sprint 153 and the three standalone changes that followed it ran on **explicit
in-session approvals from you**, each recorded in `economyApprovalGate.test.ts` as "maintainer
approval, in session, signed by name and value" or "MAINTAINER RULING, explicit and signed". Those
rows are marked SIGNED below and need confirming rather than ratifying.

**Sprint 157 is NOT implemented.** Its Exit reads "_To be completed on implementation._", the
working tree is clean, and no commit exists for it. It moved nothing. It is listed below empty.

**How to use this.** Read the five in "The five worth arguing about" first; they carry the blast
radius. Everything else is either mechanically derived or a small authored table. The guard-value
section is consequences, not decisions: skip it unless a hash matters to you.

---

## Sprint 153: cars stop arriving as wrecks

`generation-damage.md` layer 1. A rolled damage budget in band steps replaces the bill-chasing
floor. Sprint doc: `docs/sprints/sprint153.md`. **Signed in session, not under R4.**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `partsGeneration.minWorkBillFractionByTier` | entry 0.1 / everyday 0.06 / enthusiast 0.05 / flagship 0.04 | **RETIRED**, replaced by `damageGrades` below | It broke parts until the bill hit a fraction of book value, with only a 121-step spin guard as a limit. It authored 62 to 89 per cent of all damage in the game. |
| `partsGeneration.damageGrades.weights` | new | tidy 45 / used 35 / rough 15 / project 5 | The roster-wide grade shares, signed in the design doc. Retired again one sprint later by care profiles. |
| `partsGeneration.damageGrades.bandStepsByGrade` | new | tidy 2 / used 5 / rough 11 / project 20 | What each grade buys in band steps. Shipped PROVISIONAL; moved twice more below. |
| `CarModel.spec.yearTo` | new (no production end year existed) | authored for all 94 roster rows, on the 26 shipped | A Hakosuka built 1969-1972 could generate as a 1977 car. |
| `yearFrom` on four roster rows | blank | MG-001 Honda Today 1985, MG-011 Mira TR-XX L70 1985, MG-078 BCNR33 1995, MG-089 R35 2008 | A window with one end missing cannot be validated. None is a shipped car. |
| the model-year window | hardcoded `rng.int(0, 8)` | `[yearFrom, min(yearTo, currentYear - AUCTION_MIN_AGE_YEARS)]` | `AUCTION_MIN_AGE_YEARS` untouched at 3 and still inside the `max()`. |

**Flagged, not fixed:** MG-074 (Z33 Fairlady Z) carries `yearFrom` 1994 for a car launched in 2002.
Not built, so nothing generates from it. A roster decision.

**No per-venue lever**, per your ruling that a rare wreck at a premium auction is interesting. The
roughness gradient across rooms is emergent from `carTierWeightsByAuctionTier` and is now asserted.

---

## Between 153 and 154: three standalone changes

Committed separately (`78fbca6`, `c80b828`, `aad936b`). **All signed in session, not under R4.**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `damageGrades.bandStepsByGrade` | 2 / 5 / 11 / 20 | **5 / 12 / 26 / 48** | Two signed rises: a clean doubling to 4/10/22/40, then a further 20 per cent. The intermediate never landed on `main` as its own commit. |
| `damageGrades.projectGateMaxAgeYears` | new | 6 | Demotes a rolled `project` to `rough` on a car too young to have earned it. |
| `damageGrades.projectGateMaxMileageKm` | new | 60000 | The second half of that gate; both thresholds must be met. |
| the budget formula | `bandStepsByGrade[grade]` | `x wearExposure(mileageKm)` | The budget was age-blind: a new car rolling `used` took the same steps as a twenty-year-old. Reuses the existing curve; no new number. |
| `damageGrades.minWorkSteps` | new | 10 | Re-implements economy-bible's core-loop clause (every lot carries fixable work), which the retired floor had been the only mechanism for. |
| `valuation.expectationByTier.entry.band` | `worn` | **`fine`** | The only band below `worn` is `poor`, so giving a cheap car real work and ruining it were the same operation. 25.8 per cent of local-yard lots arrived with nothing worth doing. |
| `wont-strand-her` `payoutYen` and `budgetCapYen` | 156000 | **125000** | Mechanically re-derived from the formula: its probe car is the only entry-tier car any mission builds on. No other payout moved. |
| `tutorialLot.json` `baseBand` | `worn` (plus an `internals: fine` override) | `fine`, override dropped, four wear items added at `worn` | "The tutorial car is wrong, not the number." Payout untouched; designed profit 8276, inside its band. |

`flagship` was carried to `fine` in the same ruling and **reverted to `mint`** on your instruction:
at `fine` the dead-lot rate went 13.67% to 17.17% at premium and 6.00% to 20.83% at collector.

---

## Sprint 154: a car has a history

`generation-damage.md` layer 2. Culture and tier pick a care profile; the profile rolls a history;
the history causes everything else. Sprint doc: `docs/sprints/sprint154.md`. **Under R4.**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `damageGrades.weights` | 45 / 35 / 15 / 5 | **RETIRED**, replaced by `careProfiles` | One flat table for a 2000GT and an Acty alike. |
| `partsGeneration.upkeepTierWeights` | neglected 0.25 / average 0.50 / cherished 0.25 | **RETIRED**, replaced by `upkeepTierByGrade` | It asked the same question as the history roll with less information. The three upkeep EFFECT tables are untouched. |
| `damageGrades.careProfiles` | new | cherished 70/25/5/0, enthusiast 50/35/13/2, mixed 45/35/15/5, hammered 25/35/30/10, worked 20/35/33/12 | Exactly the design doc's signed table. Tier shifts one rung; the shift is code, not content. |
| `damageGrades.careProfileByCulture` | new | 13 entries: exotic/kyusha cherished; wangan, touge, rotary, touring-car enthusiast; front-drive-tuner, oddball mixed; drift, rally-bred, kurokan hammered; honest-transport, kei worked | The design's table verbatim. |
| `damageGrades.upkeepTierByGrade` | new | tidy cherished / used average / rough neglected / project neglected | Derives the upkeep tier from the history instead of drawing it beside it. Also stops a given-up-on car printing a "one careful owner" blurb. |
| `damageGrades.aftermarketChanceMultiplierByGrade` | new | 0.6 / 1.0 / 1.6 / 2.0 | The one value the design did not specify. Chosen to redistribute, not inflate: weighted mean 0.995 over 94 cars, 1.054 over the shipped 26, spread 3.33x. `aftermarketChance` stays 0.06. |
| `CarModel.spec.culture` | not present in `packages/` at all | required, 13-value enum, authored on all 26 shipped from the CSV | The other 68 already carried it in the CSV. |
| `diagnosis.symptomChanceByTier` | 0.55 / 0.50 / 0.45 / 0.35 | **0.597 / 0.513 / 0.474 / 0.357** | Amendment. Rougher cars made the Law 2 ceiling veto more symptoms, so the effective rate fell below signed. The INPUT was raised by measured bisection until the EFFECTIVE rate landed back on 0.55/0.50/0.45/0.35. |

**Measured, not tuned:** the emergent roster-wide grade mix is tidy 43.35 / used 32.34 / rough 18.69
/ project 5.62 over all 94, within 3.7 points of the retired flat table with nobody authoring it.
**The shipped 26 sit meaningfully rougher** (36.73 / 34.23 / 22.31 / 6.73) because the built subset
is drift-and-kei-heavy. Left alone, per the sprint's own instruction.

**Two doc-vs-doc disagreements, both flagged in the sprint and unresolved:**

1. `generation-damage.md` says an R32 is "hammered shifted up to enthusiast". Against its own ladder
   that is TWO rungs. Implemented as one rung uniformly, so a flagship drift car lands on `mixed`.
2. That doc names the R32 as Drift culture and the Acty as Honest transport. **The roster CSV
   authors them `touring-car` and `kei`.** The CSV was followed (it is the source of truth), so the
   R32 reads `cherished`, not the doc's `enthusiast`. The Acty is unaffected.

---

## Sprint 155: what actually happened to it

`generation-damage.md` layer 3. A damage pattern is a weighting over part slots and nothing else.
Sprint doc: `docs/sprints/sprint155.md`. **Under R4.**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `damagePatterns.json` | new file | five patterns over six taxonomy groups and five panel zones (table below) | A pattern answers "where", never "how much" or "what band". Now a fourth approval-gated file. |
| `damageGrades.patternWeightsByGrade` | new | tidy 60/25/6/7/2, used 30/40/12/15/3, rough 8/34/24/26/8, project 2/20/33/25/20 over garaged / neglected-commuter / frontal-collision / drifted / grenade | A tidy car mostly has no story; a project car got that way for a reason, and the two reasons are a shunt and a let-go engine. |
| `damageGrades.patternSymptomBias` | new | **0.6** | Linear blend between an even symptom draw (0) and a fully pattern-proportional one (1). Chosen BEFORE measurement and not adjusted after. |
| `diagnosis.symptomChanceByTier` | 0.597 / 0.513 / 0.474 / 0.357 | **0.566 / 0.510 / 0.465 / 0.365** | Moved again, derived not authored: `signed / measured survival`. Concentrating damage made favoured symptoms survive the Law 2 veto more often (survival 0.92 to 0.958-0.980), so the inputs come back down. |

The five patterns, groups (engine / drivetrain / suspension / wheels / body / interior) and zones
(bonnet / boot / left / right / roof), authored to sum to 100 each, no weight ever zero:

| pattern | display name | groups | zones |
| --- | --- | --- | --- |
| `garaged` | Kept in the dry | 17 / 16 / 17 / 17 / 17 / 16 | 20 / 20 / 20 / 20 / 20 |
| `neglected-commuter` | Never serviced | 26 / 12 / 22 / 20 / 14 / 6 | 22 / 22 / 16 / 16 / 24 |
| `frontal-collision` | Went in the front | 30 / 5 / 15 / 10 / 36 / 4 | 40 / 10 / 22 / 22 / 6 |
| `drifted` | Driven sideways | 12 / 22 / 26 / 28 / 9 / 3 | 8 / 34 / 26 / 26 / 6 |
| `grenade` | The engine let go | 62 / 14 / 8 / 6 / 6 / 4 | 20 / 20 / 20 / 20 / 20 |

**A recorded deviation from the sprint's own sketch.** Weighting the SLOT was implemented first and
measured at 2 to 5 per cent effect, because the shallow-first rule finishes a level anyway. The
weighting was moved up to the taxonomy GROUP, which measures 10 to 30 per cent. Reported with the
numbers rather than shipped quietly.

**A number that disagrees with itself.** The sprint doc states twice that at bias 0.6 "nothing ever
drops below **0.4** of an even draw"; the approval-gate ledger comment for the same lever says
"nothing falls below **0.54** of an even draw". 0.4 is the theoretical floor of the blend
(`1 - bias`); 0.54 appears elsewhere in the doc as `frontal-collision`'s measured interior affinity.
Same claim, two numbers. Worth one line from you on which is meant.

---

## Sprint 156: a channel is a buyer base

A channel gains a buyer pool and a reach; two channels lock behind named missions. Sprint doc:
`docs/sprints/sprint156.md`. **Under R4.**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `sellingChannels[*].buyerPoolWeights` | new (no per-channel buyer pool existed) | table below, four persona channels x six archetypes | The magazine and the meet produced byte-identical prices on both worked-example cars. Multiplied INTO the valuation-weighted draw, never in place of it. |
| `sellingChannels[*].poolWidening` | new | freeAdsPaper 0.5, weekendMeet 0.4, shopFront 0.35, tunerMagazine 0.25 | The weight an archetype with no stated tier interest still draws at. Finally makes `Buyer.tierPreferences[].weight` (authored 0.3-1.0, read by nothing until now) a probability instead of a wall. |
| `selling.channelStandingFocusByReputationTier` | new | unknown 1, local 1.2, known 1.45, respected 1.7, legend 2 | The exponent `buyerPoolWeights` is raised to. Standing sharpens a channel's crowd without opening a door or adding a yen. A flat pool is exponent-invariant, so the free shop front never improves. |
| `StoryMission.unlocksSellingChannel` | new | `low-and-loud` opens `weekendMeet`; `street-power-street-manners` opens `tunerMagazine` | Cash may not gate clientele quality (progression bible), so a named event does. Both missions' `deliveredCopy` gains the sentence handing the introduction over. |

| channel | collector | tuner | stancer | racer | first-timer | kei-specialist |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `shopFront` | 1 | 1 | 1 | 1 | 1 | 1 |
| `freeAdsPaper` | 0.4 | 0.5 | 0.5 | 0.2 | 1.6 | 1.4 |
| `tunerMagazine` | 0.15 | 1.8 | 0.6 | 1.4 | 0.05 | 0.05 |
| `weekendMeet` | 0.3 | 1.2 | 1.8 | 0.5 | 0.1 | 0.8 |

`tradeNetwork` carries no pool: no persona, and the schema forbids one on a `priceBand` channel.

**Two of those weights were corrected by measurement**, disclosed in the sprint: `tunerMagazine`
collector 0.4 to **0.15** (at 0.4 the magazine's likeliest buyer for a mint original kei was a
collector, the wrong readership), and `freeAdsPaper` collector 0.2 to **0.4** (combing small ads for
a survivor is exactly what a collector does).

**Deliberately NOT moved**, though R4 covered it: `tasteCeiling` on any channel, including the shop
front's 1.00, on your own note that "widening who appears may be the better half of the answer". No
fee, no cadence, no `matchedOnly` and no `requiresForecourt` moved anywhere.

---

## Sprint 157: what the week cost

**NOTHING MOVED. NOT IMPLEMENTED.** Its Exit reads "_To be completed on implementation._", there is
no commit for it, and the working tree is clean. Its Levers section is not yet written; the sprint's
plan calls for a `SAVE_VERSION` bump, one new `GameState` accumulator and four missing log entries,
none of which exist yet.

---

## The five worth arguing about

Chosen on blast radius and how much of a judgement call each was.

**1. `valuation.expectationByTier.entry.band`, `worn` to `fine`.** The single largest-radius move in
the window. It changes what every entry-tier car is valued against, what counts as repairable work,
and what a repair pays; it re-derived one mission payout (`wont-strand-her` 156000 to 125000) and
forced the tutorial car to be re-authored. You signed it explicitly and it closed a measured defect
(a quarter of the first room a player ever sees held nothing worth doing). **If you reject it:**
`entry` goes back to `worn`, the mission payout re-derives back to 156000, the tutorial lot reverts,
and the "cheap cars have nothing worth doing" defect is open again with no other lever aimed at it.

**2. `bandStepsByGrade` 2/5/11/20 to 5/12/26/48, plus the `wearExposure` multiplier and
`minWorkSteps` 10.** This trio is the roughness dial for every car the player ever sees. **Be
clear-eyed about the sequence**, because it is the one place in this window that comes near
test-chasing: three guards went red at the doubled steps and were left red, deliberately; the
further 20 per cent left them red and that was recorded too; then the `wearExposure` multiplier
turned all three green at once. That change has an independent justification (the budget was
age-blind, so grade meant "how rough" rather than "how rough for its age") and the commit says so,
but it was reached after tuning had failed and the red guards are what prompted it. **If you reject
it:** every generated car's roughness moves, both `advanceDay` goldens move, and the age-0, Wagon R
and barely-driven-car guards go red again.

**3. `diagnosis.symptomChanceByTier`, moved twice.** 0.55/0.50/0.45/0.35 to 0.597/0.513/0.474/0.357
to 0.566/0.510/0.465/0.365. **These four are not authored values any more, they are derived**:
`signed / measured survival`, because the Law 2 ceiling vetoes some symptoms and the roll rate and
the rate a player meets are now two different numbers on purpose. That is a genuine conceptual
change and it is a standing hazard: anything touching generation roughness or which symptoms are
drawn reopens the gap. Recorded in `TODO.md`. **If you reject it:** the input goes back to the signed
value and the effective rate a player meets drops roughly 3 to 5 points below what is signed on the
entry class.

**4. Sprint 154's care profiles and the 13-culture map.** Five grade distributions plus thirteen
culture assignments plus a one-rung tier shift: the densest authored table in the window and all
judgement. Two things to weigh. The full 94-car roster lands within 3.7 points of the old flat table
by itself, which is a good sign. **But the shipped 26 come out meaningfully rougher** (tidy 36.7 vs
45), because the built subset is drift-and-kei-heavy. That was measured and left alone rather than
tuned. **If you reject it:** the flat 45/35/15/5 comes back, `upkeepTierWeights` has to be
un-retired with it, and cars stop having histories at all, which sprints 155's patterns are built on.

**5. Sprint 156's `buyerPoolWeights` and the standing exponent to 2 at `legend`.** Twenty-four
authored numbers deciding who sees each car, plus an exponent that at `legend` squares every pool
weight (a 1.8 becomes 3.24, a 0.05 becomes 0.0025). The magazine and the meet now genuinely differ
and which pays more depends on the car. The exponent is the least-tested value here: nothing in the
measurements exercises a `legend`-tier career. **If you reject it:** channels revert to fee
and taste ceiling, and become interchangeable again; `tierPreferences[].weight` goes back to being
authored and inert. The instant-flip guard was re-measured and stays green either way (worst tier +1.87 per cent
against a bound of 0.10).

**What was NOT test-chased, for contrast.** R3's ledger had to flag `qualityFresh` 0.96 as a value
a failing test put in play. Nothing in this window is that clean a case. Several values here went
the other way and were explicitly **corrected by measurement rather than tuned**: both
`symptomChanceByTier` moves (bisected against a measured survival rate, and the second one disclosed
that the first probe's smaller sample had been wrong on three of four classes), the two Sprint 156
collector weights, and Sprint 155's group-versus-slot weighting, which was implemented as specified,
measured at 2 to 5 per cent, and changed. That distinction is worth keeping.

---

## Guard values re-pinned (consequences, not decisions)

Nobody chose these. They are what the hash function produced.

**`economy.json` approval hash** (`packages/content/tests/economyApprovalGate.test.ts`). The full
chain, read from `git`, is unbroken:

| after | old | new |
| --- | --- | --- |
| sprint153 | `3f3d4565...` | `82d5f3b9...` |
| steps + age gate | `82d5f3b9...` | `b0eafaf8...` |
| `minWorkSteps` | `b0eafaf8...` | `a1038d92...` |
| entry expectation | `a1038d92...` | `b0165684...` |
| sprint154 (incl. its amendment) | `b0165684...` | `7b4edda1...` |
| sprint155 | `7b4edda1...` | `35c62a03...` |
| sprint156 | `35c62a03...` | `a43d34af...` (current) |

**Other pinned content files:**

| file | old | new |
| --- | --- | --- |
| `damagePatterns.json` | did not exist | NEW pin `7b0bdc45...` (sprint155) |
| `partPricing.json` | `1fa0f99b...` | unchanged all window |

**`advanceDay` golden hashes** (`packages/sim/tests/advanceDay.test.ts`):

| after | 30-day career | acquisition to sale |
| --- | --- | --- |
| sprint153 | `0460fdc2` -> `ca96a465` | `5c5614ec` -> `0a55e42e` |
| steps + age gate | `ca96a465` -> `dc007267` | `0a55e42e` -> `3c84008d` |
| `minWorkSteps` | `dc007267` -> `7037aa01` | `3c84008d` -> `25ecff09` |
| entry expectation | held | `25ecff09` -> `dba0a979` |
| sprint154 | `7037aa01` -> `08ce1be6` | `dba0a979` -> `81133d36` |
| sprint155 | `08ce1be6` -> `90b8b963` | `81133d36` -> `5f377288` |
| sprint156 | held | held |

**`SAVE_VERSION`: 52, unchanged across the whole window.** Sprints 154 and 155 both added optional
additive fields (`CarInstance.history`, `CarInstance.damagePattern`) inside an existing blob, so no
Dexie bump and no migration (directive 19). Sprint 156 did not change `ForSaleEntry`'s shape.
Sprint 157's plan calls for a bump; it has not happened.

**Mission payouts and budget caps:** one entry moved in the whole window, `wont-strand-her` 156000
to 125000 (payout and cap together). All nine others hold at their pinned values.

**Test bounds re-derived** (each is a bound, not a lever):

| test | old | new |
| --- | --- | --- |
| `auctions.test.ts` age-0 fraction | `< 0.4` (weakened for the old bug) | `< 0.05` (measures 0.0131) |
| `auctions.test.ts` Wagon R fine-or-mint | `> 14` | `> 12` (measures 12.89) |
| `auctions.test.ts` grade-ladder upper bound | `<= authoredGap` | `< 2 x authoredGap` (measures 45.5 vs 43) |
| `auctions.test.ts` symptom-rate guard | compared against `ECONOMY.diagnosis.symptomChanceByTier` | compared against a named `SIGNED_SYMPTOM_RATE` (0.55/0.50/0.45/0.35) |
| `generationCoherence.test.ts` barely-driven bar | `median === 0` | zero share > 0.4, median <= 1, p90 <= 3, mean < 1.5 |
| `schemas.test.ts` lever pin | `minWorkBillFractionByTier` | `damageGrades` (grades, profiles, patterns, bias) across four re-pins |

**Three documentation gaps found, none of them a wrong lever value:**

1. **Sprint 153's "Re-derived pins" table is stale.** It records the hashes from its first pass
   only; the three amendments beneath it moved all five pins further and the table was never
   updated. Sprint 154's Exit correctly picks up the chain from where the standalone commits left
   it, so nothing downstream is wrong.
2. **`5a0f898f...` never existed on `main`.** Sprint 154's Exit records it as an intermediate
   economy hash before its own amendment; `git` shows a single commit going `b0165684` to
   `7b4edda1`. The intermediate was a working-tree state, not a landed one.
3. **Sprint 153's amendment records golden hashes for the doubled `bandStepsByGrade`** (`e37069f7`,
   `4ae2f761`) that likewise never landed, because the doubling and the 20 per cent rise were
   committed together.

---

## What happens on rejection

Any lever above reverts by changing its value in `packages/content/data/economy.json` (or
`damagePatterns.json`, `storyMissions.json`, `tutorialLot.json`, `cars.json`, or the roster CSV for
the rows that live there) back to the "old" column, or to a value you choose instead.

`packages/content/tests/economyApprovalGate.test.ts` then fails on the hash mismatch: re-run it,
take the hash it reports, and re-pin it in the same change as a comment recording your decision.
Every other test pinned to a specific number will fail and name itself, so you do not have to hunt
for what else needs re-deriving. Expect at minimum: both `advanceDay` goldens, `schemas.test.ts`'s
lever pin, and, for anything touching generation, `auctions.test.ts` and
`generationCoherence.test.ts`. The worked example (`docs/design/systems/worked-example-two-cars.md`)
is regenerated from a real run, never hand-edited.
