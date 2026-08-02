# Sale-value arc: the lever ledger for review

## RULING: all 38 levers PRELIMINARILY RATIFIED, 2026-07-31

**The maintainer has preliminarily ratified every lever in this document**, after reading the
two-car worked example (`docs/design/systems/worked-example-two-cars.md`). Their words: the
example is "far from perfect" but gives "a much better indication of feel than anything else up
to now", and the numbers "feel quite sane".

**What "preliminarily" means, and it matters.** These values are no longer provisional and no
longer depend on R3, which has expired. They are signed and they are what the game runs on. But
they are signed on **modelled feel, not on played feel**: nobody has yet played a career with
them. They are expected to move again after playtesting, and moving one then is a normal tuning
decision rather than a reversal.

**One row is separately and explicitly ratified**, not preliminarily:
`calendar.rentDayOfWeek`, ruled to 7 on 2026-07-31 so a new player is not charged rent before
they have done anything. It is marked in the Sprint 149 table.

**What still needs signing is anything NOT in this document.** R3 is spent. Every future lever
move needs its own explicit sign-off under directive 22, one at a time, by name and value.

## What this is

Between 2026-07-30 and 2026-07-31 an orchestrator ran sprints 143 to 149 of the sale-value arc.
This document collates every economy lever those sprints moved, sprint by sprint, so the whole
arc can be reviewed in one sitting instead of opening six sprint docs. **It is now a record of
what was ratified rather than a request for ratification.**

**R3, the standing lever grant.** Before going off shift on 2026-07-30 you handed the arc over
verbally, in session: everything designed to that point was signed off, work continued without
you, and the orchestrator got authority to move levers that would normally need per-lever
sign-off, on condition every change is documented for your review and sane defaults are chosen.
**R3 is not a CLAUDE.md directive and not an amendment to directive 22.** It is recorded only in
`docs/design/systems/sale-value-implementation-plan.md` section 4 and in the session transcript.
The grant covers only this handover window and expires once you have reviewed this ledger.

**How to use this document, now that it is ratified.** It is the record of what the arc's numbers
are and why each was chosen. When playtesting says a value is wrong, find its row, read the
reason it was picked, and change it as a normal signed tuning decision. Section 5 still describes
how a value gets moved mechanically, including which tests will name themselves when it does.

Sprint 143 (guards and defects) moved no economy value; its Exit says so explicitly. It is not
included below.

---

## Sprint 144: a build reaches the money

Stage C (coherence discount) and Stage D (retention scales with coherence). Design of record:
`sale-value-system.md` sections 3C/3D. Sprint doc: `docs/sprints/sprint_archive/sprint144.md`.

| lever | old | new | reason |
| --- | --- | --- | --- |
| `valuation.coherenceDiscountWeight` | new | 0.35 | Weight on the Stage C discount: `discount = weight * (1 - coherenceFactor) * tolerance`. |
| `valuation.retentionFloor` | new | 0.30 | Bottom of the parts-retention curve, an incoherent build. |
| `valuation.retentionCeiling` | new | 1.10 | Top of the curve, a perfectly coherent build; parts are worth more than they cost. |
| `valuation.partsRetention` | 0.55 (flat) | RETIRED | Replaced by the floor/ceiling curve above. Deleted, not left inert. |
| `valuation.tolerance.default` | new | 1.0 | The market's own view of the coherence discount; every buyer-agnostic caller (auction, diagnosis, balance probes) reads this. |
| `valuation.tolerance.stancer` | new | 0.0 | The stancer ignores the coherence discount entirely. |
| `valuation.tolerance.tuner` | new | 0.5 | The tuner feels half the discount. Collector, racer, first-timer fall back to `default`. |

**Note:** per the sprint's own Exit, none of these moved a single shipped pin. Every probe car
and every shipped car's stock build has `coherenceFactor` exactly 1.0, so the discount and the
retention curve are currently no-ops on everything the player can already own. The mechanism is
proven to work (`coherenceValuation.test.ts`), just not yet exercised by shipped content.

---

## Sprint 145: a car looks like itself

Per-car `styleBase` replaces the flat `styleCap` of 20. Design of record: `sale-value-system.md`
section 13.2. Sprint doc: `docs/sprints/sprint_archive/sprint145.md`.

| lever | old | new | reason |
| --- | --- | --- | --- |
| `CarModel.spec.styleBase`, 91 roster cars | already authored in the roster CSV | unchanged, now wired live | The values existed in the research pass; this sprint is the first time the game reads them. |
| `CarModel.spec.styleBase`, 3 missing cars | new | Honda Civic 1.5 EF2 6, Nissan S-Cargo 12, Nissan Laurel Club S C33 11 | Completes all 94 roster rows so the guard test can hold every car. |
| `statFormulas.styleCap` | 20 (flat, every car) | RETIRED, replaced by per-car `styleBase` | A 2000GT and an S-Cargo scored identically on style before this. The 4-20 authored range it left behind was rescaled to 15-88 in Sprint 152, alongside a new per-car `styleCeiling`. |

---

## Sprint 146: taste becomes a match

`Buyer.statWeights` (a weighted mean) replaced by `Buyer.statTargets` (target / optional upper /
importance per stat). Design of record: `sale-value-system.md` section 3 Stage E. Sprint doc:
`docs/sprints/sprint_archive/sprint146.md`. Abbreviations below: t = target, u = upper, i = importance, all on
the normalised 0-1 stat scale; blank u means no upper bound.

| lever | old | new | reason |
| --- | --- | --- | --- |
| `BuyerSchema` shape | `statWeights` (weighted mean of 5 stats) | `statTargets` (target/upper/importance match) | A mean of 5 deliberately anti-correlated stats could never reach a match near 1.0. Exceeding a target now earns nothing, so a real car can be someone's perfect match. |
| `buyers.json` first-timer | statWeights formula | power t.25/u.55/i.30, handling t.30/i.20, style t.20/i.15, reliability t.75/i1.00, authenticity t.50/i.20 | Wants a sensible car that starts every morning; the power upper actively penalises a caged race car. |
| `buyers.json` racer | statWeights formula | power t.75/i1.00, handling t.75/i.90, style t.10/i.05, reliability t.60/i.60, authenticity t0/i0 | Wants it fast and it has to finish. |
| `buyers.json` stancer | statWeights formula | power t.20/i.10, handling t.10/i.05, style t.65/i1.00, reliability t0/i0, authenticity t0/i0 | Style only; his `tolerance` of 0.0 from sprint144 says the same thing twice, deliberately. |
| `buyers.json` tuner | statWeights formula | power t.65/i.90, handling t.55/i.60, style t.45/i.40, reliability t.45/i.40, authenticity t0/i0 | Wants a platform someone has already built on. |
| `buyers.json` collector | statWeights formula | power t.30/u.50/i.15, handling t.30/i.15, style t.50/i.40, reliability t.60/i.30, authenticity t.90/i1.00 | The power upper makes a big-turbo build worse to a collector than a stock car, not merely no better. |
| `buyers.json` kei-specialist | new archetype | power t.15/u.50/i.40, handling t.50/i.70, style t.55/i.80, reliability t.60/i.60, authenticity t.60/i.50; `tierPreferences`: entry and everyday only | New. The Cappuccino/Beat/AZ-1 scene; low absolute power target plus a tier preference keeps small cars from being locked out. |

A same-sprint amendment fixed a normalisation defect in the match formula (shortfall now divides
by the room the stat had to fall short in). **No target/upper/importance value moved in that
amendment**, so it is a formula fix, not a lever, and is not listed as a separate row.

---

## Sprint 147: the door that actually closes

The flat `offerSpread` band replaced by a listing-age curve keyed on `offersSeen` (never a day
count). Design of record: `sale-value-system.md` section 4. Sprint doc: `docs/sprints/sprint_archive/sprint147.md`.

| lever | old | new | reason |
| --- | --- | --- | --- |
| `liquidity.stalenessFloor` | new | 0.35 | Offer chance never falls below 35% of its base, however stale the listing. |
| `liquidity.stalenessHalfLifeOffers` | new | 3.5 | How many offers-seen it takes to halve the way toward the staleness floor. |
| `liquidity.qualityFresh` | new | 0.98, then re-pinned in the same sprint to **0.96** | See note below: the 0.96 value is what actually closed the instant-flip guard. |
| `liquidity.qualityFloor` | new | 0.86 | Floor of the offer-quality curve on a long-stale listing. |
| `liquidity.qualityHalfLifeOffers` | new | 3.0 | How many offers-seen it takes to halve toward the quality floor. |
| `liquidity.qualitySpread` | new | 0.04 | Spread of the normal draw around the quality mean. |
| `liquidity.relistRecovery` | new | 0.70 | Relisting recovers `offersSeen` toward fresh by 70% (keeps 30% of accumulated staleness), closing the free-relist exploit. |
| `selling.offerSpread` | flat uniform band, 0.93-1.05 | RETIRED, replaced by the quality draw above | A flat band did not vary with how long a car had been listed; waiting cost nothing. |

**The `qualityFresh` amendment, in the sprint's own words:** signed initially at 0.98 (a listing's
first offer averages 98% of channel price). Measured against the instant-flip guard (buy a car,
resell it untouched the same day, must lose at least 1%), 0.98 still left every tier with a small
guaranteed profit. **The lever that closed the guard: 0.96.** This is the one lever in the arc
explicitly chosen to make a failing test pass, though the sprint doc gives it an independent
economic justification too (a walk-in buyer should pay somewhat under true value for the
convenience of an instant sale). See "the four worth arguing about" below.

---

## Sprint 148: somewhere to put it

A third bay kind (`forecourt`) and rent that scales with bay count, replacing the flat
`WEEKLY_RENT_YEN`. Design of record: `sale-value-system.md` section 7.1. Sprint doc:
`docs/sprints/sprint_archive/sprint148.md`. **Implementation is still running as this ledger is written; the
Levers section is final in the doc, the Exit is not yet filled in.**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `WEEKLY_RENT_YEN` | flat 20,000/week (implied unchanged at day one, per the sprint doc's own arithmetic) | RETIRED, replaced by `economy.rent` below | A flat rent made an extra bay free to own forever; capacity had no ongoing cost. |
| `rent.baseWeeklyYen` | new | 6,000 | Base charge, independent of bay count. |
| `rent.perBayWeeklyYen.service` | new | 5,000 | Per service bay, per week. |
| `rent.perBayWeeklyYen.parking` | new | 2,000 | Per parking bay, per week. |
| `rent.perBayWeeklyYen.forecourt` | new | 1,500 | Per forecourt bay, per week. |
| `facilities.json` forecourt block | new | `startCount` 2, `maxCount` 8, `bayPricesYen` [150000, 220000, 320000, 450000, 620000, 800000], `minReputationTier` [local, local, known, known, respected, respected] | Priced above parking, below a service bay; starting at 2 forces a decision from week one. |
| `economy.sellingChannels.*.requiresForecourt` | new | true on every channel except `trade-network` (false) | A viewing needs a forecourt slot; a collected/shipped sale (the trade network) does not. |

Day one is arithmetically unchanged at exactly 20,000 (6000 + 5000x1 + 2000x3 + 1500x2), by
design. A fully built-out yard (service 5, parking 15, forecourt 8) pays 73,000/week, 3.65x the
start.

---

## Sprint 149: the week has a shape

A `calendar.ts` module and a content block naming which day of the week each landmark falls on.
Design of record: `sale-value-system.md` section 7.2. Sprint doc: `docs/sprints/sprint_archive/sprint149.md`.
**Implementation had not reached this sprint as this ledger is written; the Levers section is
final in the doc, the Exit is not yet filled in.**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `calendar.daysPerWeek` | 7 (three separate `% 7` literals in code) | 7, single content value | Replaces three uncoordinated copies of the same rule with one. |
| `calendar.daysPerMonth` | new (no month boundary existed) | 28 | Four clean weeks, so a month boundary is always also a week boundary. |
| `calendar.auctionDayOfWeek` | new | 3 | Midweek, so a won car has the rest of the week to be worked on. |
| `calendar.meetDayOfWeek` | new | 7 | The weekend, matching what the channel is called. |
| `calendar.paydayOfWeek` | new | 5 | Friday, per the design. |
| `calendar.rentDayOfWeek` | new | 7 | **RATIFIED, 2026-07-31 maintainer ruling ("rent starts on day 7. like current."), not provisional under R3.** Shipped provisionally at 1 (start of the week); reviewing this ledger, the maintainer rejected that value - a brand-new player's first End Day took 20,000 off their 300,000 starting cash before they had bought, fixed or sold anything. Day 7 restores the pre-sprint behaviour exactly. |

These are scheduling positions, not economic values: the sprint doc states no yen figure changes
and the same total is charged per week, only on different days. `calendar.rentDayOfWeek` is the
one lever in this whole arc the maintainer has explicitly ratified by name and value; every other
row on this page remains provisional under the R3 standing grant until reviewed.

---

## Sprint 150: the rooms keep their own hours

Two shape changes and no new yen figure. Sprint doc: `docs/sprints/sprint_archive/sprint150.md`. **Signed by
name and value BEFORE implementation, under directive 22 and NOT under R3 (which had already
expired).**

| lever | old | new | reason |
| --- | --- | --- | --- |
| `calendar.auctionDayOfWeek` | 3 | **RETIRED** | One global auction day gave a player who had earned four rooms exactly one buying day a week, which is backwards, and sent a brand-new player to a shuttered auction house on day 1. Cadence is a property of the VENUE. |
| `auction.cadenceByTier['local-yard']` | new | `openDaysOfWeek` [1, 3, 5, 7], `weeksBetween` 1 | Signed as tabled. Opens on day 1, which closes the day-1 tutorial bug by construction. |
| `auction.cadenceByTier.regional` | new | `openDaysOfWeek` [2, 4], `weeksBetween` 1 | Signed as tabled. |
| `auction.cadenceByTier.premium` | new | `openDaysOfWeek` [6], `weeksBetween` 1 | Signed as tabled. |
| `auction.cadenceByTier['collector-network']` | new | `openDaysOfWeek` [6, 7], `weeksBetween` 2 | Signed as tabled. Week 1 is an open week, so it first sits on days 6 and 7 of week 1. Its day-6 overlap with `premium` is deliberate and pinned by test. |
| `auctionRoom.reserveFraction` | 0.55 | **RETIRED**, unified into `AUCTION_RESERVE_PRICE_FRACTION` (already 0.6, unmoved) | The ruling in full: "set the reserve to 0.6 everywhere." One idea had two authored numbers over the same base, so the live room opened five points BELOW the reserve its own auction card printed. |

**The one consequence worth stating, because it is a real narrowing and no other lever moved to
offset it:** `clearingFractionFor` draws a cold ("bargain") room uniformly between the reserve
fraction and the turnout band's `clearMin`. Raising the floor from 0.55 to 0.6 narrows that band
by five points, so a bargain room is slightly less of a bargain. That is entailed by the ruling,
not a separate change.

`CarLedger.listingFeesYen` is NOT a lever: it is a new state field carrying money that already
moved, so no yen figure changes anywhere. It is here for completeness because the worked example's
per-car net now includes it.

---

## The four worth arguing about

Chosen on blast radius (how much of the game they touch) and how much of a judgement call each
was, not on sprint order.

**1. Sprint 144's coherence discount and retention curve** (`coherenceDiscountWeight` 0.35,
`retentionFloor`/`retentionCeiling` 0.30/1.10). This is the arc's headline promise: build well
and your parts are worth more than you paid; build badly and the car itself gets discounted. If
you reject it: revert to the flat `partsRetention` 0.55 and drop the discount term. Low risk to
revert today, because no shipped car or mission currently exercises it (every shipped build is
either stock or fully supported), but it removes the mechanism the rest of the design leans on.

**2. Sprint 146's six buyer `statTargets` tables**, especially the upper bounds (first-timer
power 0.55, collector power 0.50, kei-specialist power 0.50). This is by far the densest set of
individually authored numbers in the arc, roughly sixty target/upper/importance values across six
archetypes, all judgement calls about what each buyer type wants. It drives every sale price and
every taste-gated mission requirement in the game. If you reject any archetype's table: that
buyer reverts to matching nothing sensibly (there is no fallback formula; you would need to
re-author the table or accept the one shipped).

**3. Sprint 147's `qualityFresh` 0.98 to 0.96.** Flagged plainly because a failing test is what
put this lever in play: the instant-flip guard requires that buying and instantly reselling a car
always loses money, and at 0.98 it did not. What the guard actually exposed was a headroom
problem. A fresh mean of 0.98 leaves two points between the offer and market value, and
`pickWeightedCandidate` draws the buyer in proportion to their own valuation, which is
size-biased sampling and silently eats about `tasteSpread` squared, 1.44 points, of those two.

The value was then chosen on design grounds rather than by sweeping for whichever number passed:
0.96 puts the draw's 1.0 clamp at one standard deviation rather than half of one, so roughly 16
per cent of fresh offers land near full value instead of 31 per cent piling on the ceiling, and
it is a truer reading of `sellViaWalkIn`'s own stated contract, a buyer "offering somewhat under
their true valuation for the convenience of an instant sale". Two per cent was never "somewhat
under". It passed the guard on the first attempt and was not iterated. **But be clear-eyed: had
the guard not gone red, nobody would have looked at this lever at all**, so treat it as a number
the test found and design justified rather than one design proposed on its own.

If you reject it and revert to 0.98: the guard goes red on all four tiers again (entry -1.07 per
cent, everyday -1.22, enthusiast -0.55, flagship -0.06, against a required loss of 1 per cent)
and needs a different fix. `offerSpread` is retired and `AUCTION_BUYOUT_PREMIUM` is proven
incapable of moving it (the premium cancels from both the margin and the bound), so the only
remaining lever is `pickWeightedCandidate`'s size bias itself, which is also the mechanism that
makes a specialised build find its buyer. That is a considerably worse thing to touch.

**4. Sprint 148's rent block** (`baseWeeklyYen` 6,000, `perBayWeeklyYen` 5,000/2,000/1,500).
This is the first lever in the game that makes an empty bay a bad idea, and it more than triples
weekly overhead at a fully built yard (20,000 to 73,000). It is tuned to be invisible on day one
and to bite only as you expand, which is a real design choice about pacing, not a mechanical
derivation. If you reject it: revert to the flat `WEEKLY_RENT_YEN` 20,000 and the forecourt still
needs its own rent answer (right now `forecourt` bays are free to hold under the reverted
constant, which was never true of any other bay kind).

---

## Guard values re-pinned (consequences, not decisions)

These moved automatically because content shape or state shape changed underneath them. Nobody
chose these numbers; they are what the hash function or the version counter produced.

**Economy approval-gate hash** (`packages/content/tests/economyApprovalGate.test.ts`,
`economy.json`):

| after | hash | note |
| --- | --- | --- |
| sprint144 | not quoted in `docs/sprints/sprint_archive/sprint144.md` itself | inferred only as the value `docs/sprints/sprint_archive/sprint145.md`'s Exit records as its own starting hash (see next row); flagged, not directly sourced |
| sprint145 | `c63987887418659103156de09e48af05c59a8ccad04938819fb3225a3e7ad7ab` -> `c9110158453777a12cd600e5d32a6a3ec373ef8d5d3f671200b0e4665cb1598d` | `styleCap` deleted |
| sprint146 | unchanged | `economy.json` untouched; `buyers.json` is not covered by this hash at all |
| sprint147 (liquidity landing) | `c9110158453777a12cd600e5d32a6a3ec373ef8d5d3f671200b0e4665cb1598d` -> `47c24d8b61889155a07276ab9994912c53f98f0b1acee37b94e436c8c77a8b2d` | `offerSpread` retired, `liquidity` block added |
| sprint147 (`qualityFresh` fix) | -> `7902e54c1533a941755a4de4ea63c35f9c0802f2ed2a71080dd51946ef56b520` | current value, read directly from the test file; not quoted as a literal string in `docs/sprints/sprint_archive/sprint147.md`'s own prose |
| sprint148/149 | not yet re-pinned | implementation in progress at time of writing |

`partPricing.json`'s approval-gate hash did not move at any point in sprints 144-149; nothing in
the arc touches parts pricing.

**`SAVE_VERSION`** (`packages/content/src/saveCodec.ts` and its six canary asserts in
`saveCodec.test.ts`):

| sprint | old | new |
| --- | --- | --- |
| 147 | 48 | 49 (`ForSaleEntry.offersSeen` added, `sinceDay` retired) |
| 148 | 49 | not yet recorded; sprint doc's task list calls for a bump, Exit incomplete |

**Golden state hashes** (`packages/sim/tests/advanceDay.test.ts`, the acquisition-to-sale
scripted career):

| sprint | old | new |
| --- | --- | --- |
| 144 | unchanged | sprint doc's Exit: "nothing moved anywhere in the codebase" beyond the approval-gate hash |
| 145 | unchanged | sprint doc's Exit: "only one pin moved anywhere in the codebase" (the approval-gate hash) |
| 146 | `c4048612` -> `d467f8b9` | taste rewrite; held at `d467f8b9` through the same-sprint normalisation amendment |
| 147 | `d467f8b9` -> `16f084bf` -> `f3ee5dec` | first move: liquidity clock landing; second move: the `qualityFresh` 0.96 fix, both re-run twice to confirm determinism |
| 148/149 | not yet recorded | both sprint docs expect a move (rent inside the day cycle; charges landing on different days) but implementation has not reached these Exits |

**Mission payouts and budget caps:** unchanged throughout sprints 144-149. Every sprint's own
Exit confirms this explicitly, and the current pinned table in `economyApprovalGate.test.ts`
carries no entries newer than sprint137's amendment.

---

## What happens on rejection

Any lever above can be reverted by changing its value in `packages/content/data/economy.json` (or
`facilities.json` for the forecourt block) back to the value in the "old" column, or to a new
value you choose instead. After that edit, `packages/content/tests/economyApprovalGate.test.ts`
will fail on the hash mismatch; re-run it, take the new hash it reports, and re-pin it in the same
change together with a comment recording your decision. Every other test pinned to a specific
number, a mission threshold, a golden-master hash, a `SAVE_VERSION` canary, will fail and name
itself, telling you exactly what else needs re-deriving from the reverted value.
