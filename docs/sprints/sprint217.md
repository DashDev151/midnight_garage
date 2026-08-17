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
