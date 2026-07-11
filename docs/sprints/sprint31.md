# Sprint 31: Selling rework: the walk-in offer stream

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, notes 15
(remainder), 16). Status: **designed, ready to implement.** Depends on Sprints 26-27 and 30
(valuation). Single Sonnet implementation agent; read `CLAUDE.md` first; no em dashes.*

## Why (verified diagnosis)

"List publicly" is currently a fixed-term deposit, not a gamble: a guaranteed sale after 5
days at the average interested-buyer valuation times 1.05, locked at listing time, with zero
failure probability (`advanceDay.ts` step 7 comment says "guaranteed sale" outright). Walk-in
is an instant seeded roll at 0.85-1.10 of one weighted-picked buyer's valuation, available
on demand. Neither creates the tension the maintainer wants: take today's offer or pay rent
and tied-up capital to wait for a better one. Note 16's direction is explicit: listings go
away; walk-in becomes a daily offer stream and the tradeoff IS the mechanic.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- `valuateCarForBuyer` (buyer archetypes, taste multiplier, heat) on Sprint 27's transparent
  `instanceValue` with Sprint 30's age/mileage-aware clean value: offers are this value
  times a spread; no new valuation path.
- `bumpPlayerSales`/market-heat flooding, `saleReputationDeltaFor`
  (lemon/clean/concours), and the sale event-log/day-report plumbing from
  `resolveSellViaWalkIn`: the acceptance path is today's walk-in resolution, verbatim.
- Rent (Sprint 23) and parking scarcity as the holding-cost side of the tradeoff: nothing
  new needed; the design leans on them.
- The balance harness CSV pipeline for the new offer telemetry; bots' selling logic
  refactors onto accept-threshold policies.

**Genuinely new mechanisms:**

- A daily offer process: per sellable car per day, an offer may arrive and expires that day.
- An offers panel (car page + day report) and a "for sale" toggle per car.
- Offer-stream telemetry and a wait-vs-gain report section answering note 16's question
  ("when waiting n days, what is the likelihood of getting x% more than the first offer").

## Design decisions (locked)

1. **Listings are removed** (GDD 6.3 delta; the deferred known-buyer channel stays deferred
   and untouched). `PublicListing` state, the advanceDay resolution step, sale-channel
   schema, and all listing UI go. Save migration: any active listing in an old save resolves
   instantly at its locked asking price on load (least player harm), then the shape drops.
   Dexie bump + migration + golden saves.
2. **Cars are marked for sale, offers come to you:** the player toggles "taking offers" on a
   car (replaces both old sell buttons). Each day a for-sale car draws: offer arrives with
   probability `offerChance` = f(tier desirability, heat band) (content, propose base 0.65),
   from a weighted buyer pick as today; `offerYen = valuateCarForBuyer * spread`, spread
   uniform in `[0.82, 1.12]` (content). The offer is valid that day only (decision-paced, no
   reflex: it expires at End Day, never mid-screen). Accepting resolves through the existing
   walk-in path.
3. **The math must be visible to the designer, not the player:** the balance harness gains
   `offers.csv` (car, day, offer/value ratio, accepted?) and a report section: distribution
   of best-offer-in-n-days vs first offer, per tier and heat band. Invariant (informational
   first, hard-gate once tuned): median days-to-sell for Commons at fair value under 4;
   probability of beating the first offer by 10% within 5 days lands in a band that makes
   waiting a real decision (target 25-45%, tune `spread`/`offerChance` until true).
4. **Bots** sell via accept-thresholds (accept if offer clears x% of value, or if holding
   cost pressure passes a limit), replacing their instant-sell calls; competent-policy's
   threshold is the measurement probe.
5. **Copy:** offers read as people, reusing the buyer-archetype names ("A tuner is offering
   1,240,000 for the FC. Today only.").

## Definition of Done

- Listings fully deleted (grep-clean), migration in place, goldens updated.
- Offer stream implemented, seeded-deterministic, all tunables in content.
- Offers panel + day-report integration; both old sell buttons replaced by the toggle +
  offers UI.
- `offers.csv` + report section + the two informational invariants rendering real numbers;
  balance run + check re-run; deltas and the wait-vs-gain table pasted into Exit.
- Full gate green.

## Tasks (Claude-implementable)

- [ ] Sim: for-sale flag, daily offer draw in advanceDay, acceptance path reuse, listing
  removal, migration + goldens.
- [ ] Content: offer tunables (chance, spread, per-tier desirability).
- [ ] Game: offers panel, toggle, day-report lines, copy.
- [ ] Balance: offers.csv, report section, invariants, bot thresholds, re-run.
- [ ] Tests: determinism, expiry, flooding interaction (dumping 3 same-model cars degrades
  offers via existing heat), reputation classification on accept; Exit.

## User-only tasks

- [ ] Read the wait-vs-gain table in the report and set the final `offerChance`/`spread`
  values; playtest whether waiting ever feels correct but never feels mandatory.

## Exit

*(Filled at implementation.)*
