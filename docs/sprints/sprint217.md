# Sprint 217: the sale side of knowledge

**Status: APPROVED.** Implements sections 5, 6 and 10 of
`docs/design/systems/knowledge-and-diagnosis.md`. Depends on 215 (verified/
estimated) and 216 (latents).

## Reuse analysis (directive 16)

**Reused:** the offer machinery end to end (`drawPersonaChannelOffer`, buyer
archetypes, the 213-reconciled affinity/quality stack): notice is a step inside
it, not a parallel path; `marketValueYen` (gains the knowledge view, not a
sibling); `taskLaborChain` for notice deductions; the reputation delta plumbing
(reputation events exist); the offer line idiom for "He heard the idle.";
`marketRepairDiscount` per tier (213) as the constructional lower bound for the
notice multiplier; the flipEconomyProbes file as the home for the new probes.

**New:** the buyer knowledge view of a car, the unverified-slot haircut, the
notice roll + deduction + reputation tick, the light-flip viability probe.

## Tasks

### A. Buyer offers price the demonstrable (spec section 5)

- A1. Offers value the car through a knowledge view: verified slots at true
  band; unverified slots at `priorBand` minus `unverifiedHaircut` (content, per
  tier, small). One function produces the view; `marketValueYen` consumes it
  unchanged.
- A2. Offers surface totals only; no band ever leaks to the seller (guard test).

### B. Notice (spec section 6)

- B1. Per offer, per open symptom: notice roll by archetype (initial: collector
  0.9, racer 0.5, daily 0.25, trade 0.05; content table). Unrevealed latents at
  half rate.
- B2. On notice: offer minus `chainFixCost x noticeMultiplier`; acceptance of a
  noticed offer logs reputation -2; the offer line names the symptom's card
  ("He heard the idle.").
- B3. **Constructional rule, probe-enforced:** `noticeMultiplier >
  marketRepairDiscount(tier)` for every tier: shown honestly always costs less
  than caught. The probe fails the build if any tier violates it.

### C. Light-flip viability (spec section 10)

- C1. Probe: at entry tier, a representative light flip (buy, fix the visible +
  the one diagnosed fault, sell unopened elsewhere) and a representative deep
  flip land within +-30% yen-per-day of each other under fair buys and expected
  notice outcomes.
- C2. If the band cannot be reached with existing levers, the probe documents
  the shortfall and the sprint REPORTS it to the maintainer: no new lever is
  added silently (rulings ledger item 12; directive 22).

### D. Fallout

- Directive 17 discipline; selling tests that assumed truth-priced offers on
  unverified fixtures are case (a): verify the fixture's slots or assert the
  knowledge-view price.

## Definition of done

- A buyer pays for what they can see, catches what they can catch, and the
  probes hold: notice above honest discount everywhere, light flips inside the
  band or the shortfall reported.
- `pnpm typecheck`; narrowest tests once.

## Exit

**Status: DONE**, with task C's own commitment measured and REPORTED as a
genuine shortfall rather than forced to pass (see below - this is C2's
sanctioned outcome, not a gap in the implementation). `pnpm typecheck` clean
across content/sim/game. `pnpm test --project sim --project content`:
3592/3593 real tests pass, 1 skipped (the pre-existing golden-session skip,
untouched), zero red. `pnpm test --project game`: 1239/1239 pass, zero red -
tree is fully green (see "Task E - closing the arc gate" below for the three
that needed fixing first).

### Task E - closing the arc gate: sprint216's own fallout in auctionRoom.test.ts

Three `auctionRoom.test.ts` failures (dealer-name mismatches) were first
mis-triaged as pre-existing and out of scope, on the evidence that they also
fail against a tree with only this sprint's own changes stashed out. That
evidence was insufficient: it only proved the failures predate SPRINT 217,
not that they predate the arc - sprint216's own targeted test runs never
included this file, so its fallout sat uncaught since that sprint landed.
Corrected before close, per directive 17:

- **Root cause, diagnosed as case (a) on all three:** `auctionRoomDemo.ts`'s
  two demo lots (`buildStealLot`/`buildTrapLot`) price `roomReadYen` through
  `sheetGuideValueYen` directly - the exact function sprint216.md task C
  rewrote onto the fear-biased `roomSymptomCostYen` formula. A repriced
  `roomReadYen` moves `reserveYen`/`clearingYen`/`incrementYen`
  (`incrementYenFor` scales off it too), which moves how many rungs
  `auctionRoom.ts`'s bidding war climbs before the fuse burns out. The
  round-robin dealer cursor (`advanceToNextActiveDealer`) and the thinning
  curve (`targetActive`) are both completely unmoved - pure mechanism, no
  business rule tied to a specific dealer ever winning - but a different
  rung COUNT lands that same fixed rotation on a different dealer. No
  ordering INVARIANT broke (case (b) would have been, for instance, "dealers
  no longer thin from the back of the row" or "the cursor skips an active
  dealer") - only a downstream numeric consequence of an already-approved
  valuation change.
- Re-derived from a real run (`packages/game/src/screens/auctionRoom.test.ts`):
  the thin-room war (and its determinism-guard duplicate) now hammers to
  Endo rather than Mrs. Sakaki; the packed-room war also now hammers to
  Endo, and its last two drop-lines land on Mrs. Sakaki and Ogata rather
  than Ogata and Endo (the first three drops are unmoved). All three sites
  carry an inline comment naming sprint216.md and the mechanism, matching
  the file's own established re-pin convention.
- The file's own top-of-file doc comment claiming "dealer names and win
  order are seed-driven, not price-driven, and stay literal too" was itself
  wrong (the win order and later drops plainly are price-driven, as above) -
  corrected to say so, splitting out what genuinely IS seed-only (dealer
  names, the opening bidder) from what isn't.
- Verified via the coordinator's own instruction: `auctionRoom.test.ts`
  alone (40/40 pass), then `pnpm test --project game` once more (89 files,
  1239/1239 pass, zero red).

### Task A - buyer offers price the demonstrable

- `packages/sim/src/knowledge.ts`: `knowledgeViewOf` refactored onto a shared
  `maskedKnowledgeView(car, model, context, bandFor)` helper (no behaviour
  change - same masking loop, parameterised over which band function each
  caller reads); new `buyerKnowledgeViewOf(car, model, context)` calls the
  same helper with `unverifiedHaircutBand(priorBand(...), model, context)` -
  `priorBand` marked down by `unverifiedHaircutByTier[fitmentClass]` band
  steps, floored at `poor` exactly like `priorBand` itself. Verified slots are
  untouched either way (true band, no haircut on top of honesty).
- `packages/content/src/economy.ts` / `economy.json`:
  `knowledgePriors.unverifiedHaircutByTier` - entry 0, everyday 0, enthusiast
  1, flagship 1 band steps. Felt behaviour: small money buys little scrutiny
  (an entry/everyday buyer already prices the ordinary mileage guess and asks
  no further discount for what they weren't shown); real money at
  enthusiast/flagship tiers makes a buyer discount a whole band harder for
  what they weren't allowed to verify.
- `packages/sim/src/selling.ts`: `drawPersonaChannelOffer` and
  `drawTradeNetworkOffer` now price `buyerKnowledgeViewOf(car, model,
  context)` instead of `car` directly; `channelPriceBandRangeFor` (the
  trade-network price-band preview) does the same, so the preview and the
  real draw can never disagree. Deliberately OUT of scope: the DRAW-WEIGHT
  calculation (`pickWeightedCandidate`/`saleCandidates`, who shows up and how
  keen they are) still reads the true car - task A is about what a buyer
  OFFERS, not who is curious enough to visit; widening that would touch bot
  accept-thresholds, `likelyChannelBuyer`, `bestFitBuyer` and
  `channelArrivalOddsFor` for a question this sprint doesn't ask.
- Guard (task A2), `packages/sim/tests/selling.test.ts`: a drawn offer and its
  `offer-received` day-log line carry exactly their documented key set, never
  a band-shaped field, on a real seeded draw. `packages/sim/tests/
  knowledge.test.ts` proves the mechanism directly: a verified-worse slot
  still reads true band (no double discount); an unverified slot never reads
  worse than `priorBand - haircut`, floored at `poor`.

### Task B - notice

- `packages/sim/src/diagnosis.ts`: `candidateFixCostYen` exported (was
  private) so notice and the room's own fear pricing can never price the same
  fix two different ways; new `rollBuyerNotice(car, model, noticeChance,
  state, context, rng)` - per open symptom, skips outright if its true
  cause's own slot is already VERIFIED (honesty already prices at true band,
  nothing left to catch), rolls at `noticeChance` (halved via
  `noticeChanceLatentMultiplier` for a still-latent symptom), and on a hit
  sums `candidateFixCostYen(trueCause) x noticeMultiplier` into the
  deduction and renders the FIRST noticed symptom's own `noticeCopy` line
  (deterministic array order).
- `packages/sim/src/selling.ts`: `drawPersonaChannelOffer` rolls notice at
  the picked buyer's own `noticeChanceByArchetype`; `drawTradeNetworkOffer`
  at the flat `noticeChanceTradeNetwork`; both thread the same seeded `rng`
  the rest of the draw already consumes (one `rng.next()` per open symptom
  regardless of hit or miss, so the draw count never depends on the chance
  compared against - what makes the paired-economy test below exact rather
  than a seed hunt). `state: GameState` threaded through
  `drawOfferForChannel`/`drawFlaggedChannelOffer` to reach
  `taskLaborChain` inside `candidateFixCostYen`.
- `packages/content/src/economy.ts` / `economy.json`: `diagnosis.
  noticeChanceByArchetype` (collector 0.9, tuner 0.8, show-crowd 0.1, racer
  0.5, daily-drivers 0.25, touge 0.4), `noticeChanceTradeNetwork` 0.05,
  `noticeChanceLatentMultiplier` 0.5, `noticeMultiplier` 1.75,
  `noticeReputationPenalty` 2, `noticeCopy` (the `<symptom>` template). Felt
  behaviour recorded in `economyApprovalGate.test.ts`'s own doc comment
  alongside the re-pinned hash (behaviour-first governance, directive 22's
  2026-08-13 amendment): collector/tuner both go over a car closely; racer
  drives it hard enough to feel most of what's wrong; touge less
  methodically; daily-drivers barely past the paperwork; show-crowd and the
  trade fax barely at all.
- `packages/content/src/sale.ts`: `PendingSaleOffer.noticeLine?: string` -
  the accept-time signal AND the ready-to-render line, one field for both,
  mirroring `car-sold`'s existing `saleRevealLine` convention.
  `packages/content/src/gameState.ts`: `offer-received` gains the same
  optional `noticeLine`; `car-sold` gains `noticeLine` and its
  `reputationDelta` widens from `.nonnegative()` to plain `.int()` (can now
  go negative - the one deliberate exception to "nothing lowers reputation").
- `packages/sim/src/selling.ts`'s `resolveSellViaWalkIn`: reputation delta is
  now `saleReputationBonusFor(outcome) - (offer.noticeLine ?
  noticeReputationPenalty : 0)`, still routed through the existing
  `applyReputationDelta` zero floor - unchanged plumbing, a wider input.
- **Task B3, the constructional rule (probe-enforced,
  `packages/sim/tests/diagnosis.test.ts`):** `noticeMultiplier` (1.75) is
  asserted `>` `marketRepairDiscount[fitmentClass]` for all four tiers (tops
  out at 1.5, entry) - green. Getting caught always costs strictly more than
  the worst honest tier's own rate.
- `packages/game/src/stores/gameStore.ts`: `PendingOfferView`/
  `SaleResultView` both gain optional `noticeLine`, populated from the
  matching sim field. `packages/game/src/utils/dayLogFormat.ts`: the
  `car-sold` reputation clause is now explicitly signed
  (`delta >= 0 ? '+' : ''`) rather than a hardcoded `+` - a real display bug
  fix, since `reputationDelta` can now be negative; both `offer-received` and
  `car-sold` append `noticeLine` when present ("He heard the idle.", in
  spirit - the shipped copy is "They noticed something on the way round:
  `<symptom>`").

### Task C - light-flip viability

- `packages/sim/tests/flipEconomyProbes.test.ts`, probe (e): entry tier, deep
  flip reused verbatim from probe (a)'s own `computeModelBalanceProbe`
  (buy the worst-case-generatable rough car, repair to expectation band,
  sell openly); light flip built fresh on the SAME `buildRoughProbeCar` base
  with two real symptoms added, only the first diagnosed and fixed
  (`planPartRepair` to `sensibleRepairTargetBand`, verified via
  `defaultVerifiedSlots + the fixed slot`), sold through
  `buyerKnowledgeViewOf` less an EXPECTED (closed-form, not rolled) notice
  deduction for the second, undiagnosed symptom. Both sides convert labour
  points to days the same way (one acquisition day + `points /
  basePoolPoints` + `1 / offerChanceFor` expected wait-to-sell).
- **Measured, and reported per C2 rather than forced to pass:** light
  -5,743 yen/day (margin -14,446 over 2.52 days, 4 labour points) vs deep
  +5,400 yen/day (margin +20,872 over 3.87 days, 112 labour points) - ratio
  -1.06, wants [0.7, 1.3]. **Root cause, diagnosed:** `buildRoughProbeCar`
  (the worst-case-generatable car every flip probe in this file already
  treats as the standard subject) is not uniformly poor - its Law-2 bill-
  fraction softening lifts whole groups well above poor (measured: the
  entire engine group to `fine`) while leaving others at `poor`.
  `priorBand` is an explicitly FLAT per-car guess with no per-slot term (its
  own doc comment, unchanged since sprint215.md), so it reads `poor` for
  EVERY unverified slot regardless. A light flip that verifies only the one
  diagnosed part is priced by a buyer who assumes the whole rest of the car
  is `poor`, when roughly two-thirds of it is actually much better - a real,
  structural undervaluation of an unevenly-conditioned unverified sale, not a
  tunable number. The deep flip never hits this because it verifies
  (repairs) everything.
- **This is reported, not fixed, on purpose:** the fix would be a per-slot
  `priorBand` term, a real design-shape change (directive 23: never design
  around an adjacent tunable's current value, but this is a SHAPE question -
  a new estimator dimension - which directive 22 reserves for explicit
  approval, not a value this sprint is free to pick). The probe's own
  assertions were converted from a hard gate to a disclosed measurement
  (mirroring `balanceProbes.ts`'s own retired `blindBuyEvYen` gate,
  `packages/sim/tests/balanceProbes.test.ts`), with the full numbers and
  root cause recorded in its own comment so a future per-slot-prior design
  can re-gate it honestly.

### Task D - fallout (directive 17)

Every failure below was diagnosed before touching anything; all were case
(a) - a stale fixture/pin asserting behaviour this sprint intentionally
changed - except the two noted as pre-existing and untouched.

- `packages/sim/tests/advanceDay.test.ts`: the acquisition-and-sale golden
  hash moved (`b0d8a03b` -> `96621a26`) - this is the one script that both
  acquires and sells a real car through the real offer pipeline, so its
  accepted price genuinely moves once offers price the demonstrable rather
  than the truth. Re-derived from a real run, documented inline per the
  file's own established convention. The 30-day master hash held unchanged
  (it never completes a sale).
- `packages/content/tests/economyApprovalGate.test.ts`: economy.json hash
  re-pinned with the new felt-behaviour paragraph (see task A/B above).
- `packages/game/src/screens/dev/economyBench.test.ts` ("THE GUARD: the sale
  side agrees too"): `bandPricedChannelsFor` diverged between the dev-bench
  car and a normally-acquired one for the first time, because
  `channelPriceBandRangeFor` now reads `verifiedSlots` and the two
  construction paths disagreed about it - a real acquisition seeds the
  ordinary partial `defaultVerifiedSlots`, while a hand-specified bench car
  had none at all (reading "verified" only by the absent-array safe
  default). Fixed at the root: `benchCarInstance`
  (`packages/game/src/screens/dev/economyBench.ts`) now returns
  `fullyVerifiedCar(...)` explicitly - a spec the bench itself assembled by
  hand has nothing left to estimate, matching the same dev-grant convention
  `fullyVerifiedCar` already exists for. Zero behaviour change (the absent-
  array default already priced identically); the guard test itself now also
  puts `normalCar` on the same fully-known footing before comparing, since
  its own purpose is proving the READOUT MATH agrees across construction
  paths, not re-testing the (separately covered) knowledge model.
- `packages/game/src/screens/auctionRoom.test.ts` (3 dealer-name-order
  assertions): initially mis-triaged here as pre-existing/out of scope on a
  `git stash` check that only proved the failures predate sprint217, not the
  arc. Corrected and fixed - see "Task E - closing the arc gate" below.

### Save

`SAVE_VERSION` 74 -> 75 (`packages/game/src/save/saveCodec.ts`): a plain
additive `.optional()` bump per directive 19 (no migration, no golden-save
test) for `PendingSaleOffer.noticeLine`. Five stale `SAVE_VERSION` sanity
pins in `saveCodec.test.ts` bumped alongside; one new round-trip test for a
live offer carrying `noticeLine`.

### Verification

`pnpm typecheck` (content/sim/game, clean). `pnpm test --project sim
--project content` (145 files, 3592 pass, 1 pre-existing skip, untouched).
`pnpm test --project game` (89 files, 1239 pass, zero red - see task E for
the three that needed fixing first). Narrowest-first throughout per
directive 20; no manual lint/format/coverage run (pre-push hook's job). Tree
is fully green: the arc gate at sprint218 starts clean.
