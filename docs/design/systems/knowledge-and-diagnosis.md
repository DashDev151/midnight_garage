# Knowledge and diagnosis: the one system

**Design of record, settled 2026-08-17 in direct session with the maintainer. Every
mechanic below is maintainer-approved; the rulings ledger at the end records each
decision and each rejection. Implemented by sprints 215-218. Amend only with
maintainer approval recorded here.**

## What exists today (the base this builds on)

- Generation rolls every slot's true condition band, every body zone's state, and
  the car's symptoms. `CarSymptom { symptomId, trueCauseId, remainingCauseIds }`.
- A symptom's causes are failure modes `{ id, carPartId, setBand }` with
  probability weights (`symptoms.json`, `failureModes.json`). When generation rolls
  a cause, the cause's part is SET to `setBand`: the fault is the band.
- Paid diagnostic tests partition `remainingCauseIds` (auction inspection minutes;
  owned-car workups). One candidate remaining: the verdict layer names it and
  prices its fix through `taskLaborChain`.
- Removing a part already prunes its candidate causes, silently.
- The UI shows every slot's true band from the moment of ownership.
- Below the expectation band every repair returns at least its cost (economy bible
  Law 1), so repairing everything is always optimal within one car.
- Service-job tasks name a known slot and target band; payout is fixed at accept.

## The problem being solved

After purchase, the player performs a long sequence of actions, none of which
involves a choice: full information plus one dominant strategy. The diagnosis
system is only used before purchase; after purchase nothing reads it.

## Where diagnosis matters, stated honestly

In a full strip-and-fix-everything flip, diagnosis does not matter: fixing every
part necessarily fixes the true cause. Diagnosis matters in exactly three
situations, all situations where the player does not fix everything:

1. **Before purchase**: tests are the only window into a car you cannot yet take
   apart, and what they find reprices the bid (see room pricing below).
2. **Symptom service jobs**: fixed pay, your labour; finding the cause cheaply is
   the margin.
3. **Light flips**: you choose not to open everything; diagnosis finds the one
   fault worth fixing, and the sale side prices what you left alone.

---

## 1. The knowledge model: verified and estimated slots

**State:** `CarInstance.verifiedSlots: CarPartId[]` (new; save version bump, no
migration per directive 19).

**Verified from the start** (no inspection ever needed; eyes suffice): every slot
with `depthClass: 'surface'`, plus `tyres` and `rims`, plus all body zones and
paint (the body model is already visual). Every other slot on an acquired car
starts estimated. Loose parts in the Warehouse are always verified (they are in
hand).

**Estimated display:** the slot's chip shows `priorBand`, a deterministic
computed guess, never the truth: visually distinct (hollow chip, label "est.").

`priorBand(slot) = bandFromMileageSegment(mileageKm) adjusted by provenance
modifier` where the mileage segmentation reuses the existing mileage-factor
curve's segments and the provenance modifier is one band up for garage-kept
one-owner histories, one band down for crash/flood/abandoned histories. Exact
mapping is content (`knowledgePriors` block in economy.json), behaviour-first.

**A slot becomes verified when (exhaustive list):**

1. Its part is REMOVED from the car (the spanner always tells). Bench and machine
   work imply removal and add nothing.
2. A repair is clicked on it. The reveal happens first, free; if truth equals the
   estimate the repair runs in the same click; if not, the corrected band and
   price are shown and the repair waits for one confirming click. No action is
   ever blocked by the knowledge model.
3. A diagnostic CONFIRMATION names its part: a symptom collapsing to a cause on
   that slot verifies it (the fault is the band, so the band is now known).
   ELIMINATION verifies nothing: learning "the smoke is not the breather" says
   nothing about the intake's band, which could be worn for unrelated reasons.

**Worked example (shipped content):** symptom `smokes-on-startup`, candidates
valve-seals (headValvetrain), gunked-breather (intake), head-gasket
(headValvetrain), tired-rings (internals). The breather-check test collapses to
gunked-breather: the intake is verified at the failure mode's `setBand`. The same
test eliminating gunked-breather verifies nothing.

**Player-facing figures:** the player's own value estimate and ledger run off
estimated bands plus their diagnosis knowledge. Offers never reveal a band
(an offer displays only its total).

**Recorded law (standing):** analyst currencies (yen-per-labour-point and any
wage-comparison figure) never appear on a player-facing surface.

## 2. Latent symptoms

**State:** `CarSymptom.latent: boolean` (new).

- Rolled at generation: 0-2 per car. Initial weights: 25% one, 5% two, modified
  by provenance (garage-kept 10%/0%; crash and flood histories higher). Content,
  behaviour-first.
- A latent symptom appears in no list, applies no discount to anyone's estimate,
  and its host slot displays its prior.
- It reveals the moment its true cause's slot becomes verified (any route above):
  it surfaces as an already-identified fault (there is no candidate list to
  narrow: the player is holding the part), and the slot's band corrects to the
  failure mode's `setBand`.
- **Scrap is allowed** (maintainer ruling): a latent may carry a scrap-band
  failure mode. A scrap find forces a replacement purchase, which is
  Law-1-consistent (replacement, not repair). Silent scrap latents are RARE; the
  primary way grenades reach players is section 3.

## 3. Grenades are prevalent and findable before purchase

Maintainer ruling: no new screening mechanic (an earlier proposal to run
screening tests against latent faults at the yard was REJECTED). Instead:

- Severe failure modes (rod knock, worn rings, seized engine: every scrap-band
  mode) get meaningful generation weight inside the candidate lists of ordinary
  VISIBLE symptoms. A grenade usually announces itself as a knock or a smoke the
  card already shows.
- The existing yard tests are the discovery instrument: they narrow toward or
  away from the disaster, before bidding, on the inspection clock.

## 4. Room pricing: the room fears the worst

Maintainer ruling: the room prices an unresolved symptom near its WORST
candidate, not the weighted average, so the player's information edge is large
in both directions.

- `roomSymptomCostYen = fearBias x maxCandidateFixCost + (1 - fearBias) x
  weightedMeanFixCost`, with `fearBias` initial 0.85 (content). Candidate fix
  costs are chain-priced (`taskLaborChain`).
- The player's own estimate uses their actual knowledge: weighted mean over the
  candidates THEY still have open, actual cost once collapsed.
- Consequences, by construction: a diagnosed-cheap fault means the room
  underprices the car and the player can outbid the whole room and still profit;
  a diagnosed-grenade means the player walks, having spent only minutes. Losing
  bad auctions on purpose is the mechanic working.

## 5. Buyer offers: a buyer pays for what they can see

- Verified slots: priced at true band.
- Unverified slots: priced at `priorBand` minus an unverified-slot haircut
  (content, per tier, small): the buyer assumes the standard guess and discounts
  for not being allowed to look.
- Therefore verification itself has sale value: opening a slot that is better
  than the guess raises the offer; a slot worse than the guess costs less shown
  openly than caught (see notice, and the constructional rule there).
- Offers never reveal bands to the seller.

## 6. Buyer notice: unfixed faults are a priced risk

Per offer, per open symptom (revealed, unfixed): a notice roll by buyer
archetype. Initial rates: collector 0.9, racer 0.5, daily 0.25, trade 0.05.
Unrevealed latents roll at half rate. On notice:

- the offer is reduced by `chainFixCost x noticeMultiplier`;
- if the player accepts that reduced offer, reputation -2;
- the offer line states what was noticed ("He heard the idle.").

**Constructional rule, probe-enforced:** `noticeMultiplier >
marketRepairDiscount(tier)` always. An honestly-shown fault (a verified-worse
slot, priced at the tier's normal project discount) must always cost less than a
caught one, or honesty would be for suckers.

## 7. The diagnosis expansion: yard and workshop tests

The existing system is designed around quick yard checks; repair-depth diagnosis
needs tools and access. Tests split by venue.

**Schema:** each test gains `venue: 'yard' | 'workshop'`; workshop tests may
carry `requiresToolTier { component, tier }`, `requiresVacatedSlot: CarPartId`,
and `laborPoints`.

- **Yard tests** = the existing set, unchanged: near-toolless, minute-costed at
  the auction inspection, deliberately coarse: they separate cause families and
  often cannot reach a single deep cause.
- **Workshop tests** (new): require the car in the player's shop; cost labour
  points; partition finer; some unlock only once an access slot is vacated.
- **Worked example:** yard compression-test narrows smokes-on-startup to
  {tired-rings, head-gasket} and stops: at auction that pair stays ambiguous and
  the bid stays a gamble. In the shop, leak-down test (engine tool tier 2, 4
  labour points) partitions [[tired-rings], [head-gasket]]: single cause, no
  teardown.
- **Coverage commitment:** every symptom has at least one workshop path to a
  single cause that is cheaper than opening the most expensive candidate.

## 8. Symptom service jobs

New task kind `resolveSymptom { symptomId }`: a customer car arrives with one
visible symptom and 2-4 candidate causes.

- **Payout, fixed at accept:** `(sum over candidates of weight x chainFixCost)
  x marginRoll + calloutFee`: the expected cost at market rates. (The customer
  pays the going quote, i.e. the weighted mean: the room's fear pricing is an
  auction phenomenon, not a service-counter one. Decided.)
- **Completion:** the symptom is collapsed and the true cause's part is at fine
  or better.
- **The margin is the order:** three moves, priced differently: run a workshop
  test (labour, information, fixes nothing), open a candidate slot (more labour,
  information + verification + the fix if it is there), or fix the likeliest
  blind. Good order (high probability per labour point first, tests where they
  are cheaper than teardown) spends less than the payout assumed; bad order
  spends more. Same payout either way.

## 9. Hidden non-stock parts

Separate generation roll, initial 5% per car, weighted up for tuner/enthusiast
cultures and modified-history provenance: one estimated slot's true installed
part is a non-stock catalogue SKU at a rolled band. Before verification the slot
displays the expected stock part's name at the prior band. On verification: true
SKU and band; the existing keep/harvest/sell controls carry the decision;
coherence and value effects already exist for a revealed non-stock part.

## 10. Light flips must be viable, probe-pinned

The forces that make not-maximising sometimes right already exist: a car
occupies a bay for its whole build; rent is weekly and parts money leaves up
front; market heat has windows; every labour point on this car is a point not on
the phone or the other car. The commitment, probe-enforced: at entry tier, a
light flip's yen-per-day and a deep flip's yen-per-day land within +-30% of each
other, so the right choice is situational (bay pressure, cash, heat), never
dominated. If the probe cannot reach that band with existing levers, the
shortfall is REPORTED, not silently patched with a new lever.

## The decision surface this creates (the point of all of it)

- Buying: minutes against certainty; the fearful room mispricing both ways.
- Teardown: every removal answers a question; order matters wherever the player
  will not open everything.
- Depth: verify-and-fix-everything versus fix-what-shows-and-sell, with the
  buyer-notice roll giving the second a computable expected cost.
- Service counter: symptom jobs, where opening order is the margin.
- Selling: an unfixed or unfound fault is a per-buyer-type probability with a
  stated cost.

## Rulings ledger (maintainer, 2026-08-17)

1. Plan-then-execute automation: OUT of the manual loop; future staff mechanic
   (`staff-run-builds.md`).
2. The manual loop is not fixed by automation, bundling, or juice: mechanics
   must carry it. Strip-the-corner PARKED. Ceremony/wash beats out of scope.
3. Latents: approved at 0-2 per car. Scrap-band latents ALLOWED.
4. Grenades: more prevalent, discoverable through the EXISTING yard flow;
   screening-test mechanic REJECTED.
5. Room fear pricing: near-worst-case (the fearBias formula), approved.
6. Buyer notice at sale incl. reputation cost: approved.
7. Hidden non-stock parts: IN (restored after a wrong unilateral cut).
8. Diagnosis must expand (yard vs workshop venues): approved.
9. Symptom service jobs: approved; the labour-order margin is the design.
10. Verified/estimated knowledge model incl. reveal-then-confirm repair click:
    approved.
11. Analyst currency on player surfaces: banned, standing.
12. All numeric values above are initial, content-held, behaviour-first, tuned
    by playtest.

## Arc summary: values as shipped (sprint218.md close)

The knowledge arc (215-218) is complete. Every value below is content
(`economy.json` unless noted) and behaviour-first per the 2026-08-13
governance amendment - none of it was pre-ratified as a bare number; the
maintainer signed the SHAPE (this document) and validates the values by
playtest.

- **Verified/estimated (section 1):** surface-depth slots plus `tyres`/`rims`
  verified from the start; `knowledgePriors.mileageBandBySegment` (mint/
  fine/worn/poor, parallel to the mileage-factor curve's own breakpoints);
  `provenanceModifierByDamagePattern` +-1 band by history;
  `unverifiedHaircutByTier` 0/0/1/1 bands (entry/everyday/enthusiast/
  flagship).
- **Latents (section 2):** `latentRoll.oneChance` 0.25, `twoChance` 0.05, per
  -damage-pattern modifiers -0.15..+0.15, `scrapCauseWeightFraction` 0.15.
- **Room fear (section 4):** `diagnosis.fearBias` 0.85.
- **Buyer notice (section 6):** `noticeChanceByArchetype` 0.1-0.9 by
  archetype, `noticeChanceLatentMultiplier` 0.5, `noticeMultiplier` 1.75
  (constructional: exceeds every tier's `marketRepairDiscount`, probe-
  enforced), `noticeReputationPenalty` 2.
- **Test venues (section 7, sprint218.md task A):** every pre-sprint test
  defaults `venue: 'yard'`, zero behaviour change. 17 new workshop tests
  (one per symptom), `laborPoints` 2-6, four gated by `requiresVacatedSlot`,
  eleven by `requiresToolTier` (tier 1 or 2, spanning all six tool lines).
  The worked example (`leak-down`, engine tier 2, 4 labour, unlocked by
  `compression-test` group 1) shipped verbatim as specified.
- **Symptom service jobs (section 8, sprint218.md task C):** payout =
  weighted-mean chain-priced candidate cost x margin roll (same
  `[marginMin, marginMax]` = [1.18, 1.35] every service job rolls in) +
  `calloutFeeYen`; eligible symptom pool capped at 4 candidates;
  `serviceJobs.symptomJobOfferWeight` 0.5 (roughly half as likely as an
  easiest, no-deficit slot template to be the one the daily draw picks - a
  distinctive, occasional job rather than the median phone call). Measured
  on the `clunk-over-bumps` fixture: a ¥14,936 payout, best-value-first
  opening spends ¥5,060 (well under payout), worst-value-first spends
  ¥42,790 (nearly 3x payout) - the order-matters mechanic verified against
  real numbers, not just asserted (`packages/sim/tests/resolveSymptomJob.test.ts`).

Outstanding, deliberately not this arc's problem: the four physical dial
curves (`car-performance` README) remain PROVISIONAL, unrelated to
diagnosis; and per directive 21, no bot-career measurement of how the AI
strategies actually use workshop tests or symptom jobs exists or is
authorised until the harness is rebuilt - the closed-form content probes in
this arc (route shape, resolution accounting, the C5 order-matters test) are
the whole of its automated evidence.
