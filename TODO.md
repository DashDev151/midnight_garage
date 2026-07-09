# TODO

Deliberately deferred items that are **not** tied to any specific future sprint number, so they
won't surface again just by reading `docs/sprints/sprintXX.md` in order. Check this file
separately when planning a new sprint. (Deferrals that already have a sprint number attached — e.g.
the service-grinder bot in Sprint 13, the event-chaser bot in Sprint 16, Cloudflare Pages secrets
before Sprint 8 — live in their sprint docs instead and aren't duplicated here.)

Remove an item once it's actioned; note which sprint/commit picked it up.

## Next focus (agreed 2026-07-08)

- [x] **Interactive service / walk-in jobs.** **In progress as Sprint 08** — see
  `docs/sprints/sprint08.md`. A customer brings a request (some jobs pure repair, no part needed;
  others require installing a part of a given slot, bought at the real parts market — the job pays a
  fixed amount regardless of part choice, so a pricier part trades profit for a reputation-gain
  multiplier); the player never owns the car. Carries the early game; flipping should overtake it by
  the midgame (harness-validated). Bays are deliberately NOT capped this sprint (see
  `docs/design/facilities-bays.md`, its own sprint directly after).

## Engineering

- [ ] **Wire the balance harness into CI — DEADLINE: before Phase 5 (Sprint 19) content waves.**
  `pnpm balance:run` + `python -m balance.cli check` only run locally by hand (user deferred CI
  wiring in Sprint 03). **External review (2026-07, finding 1) flags this as high priority:** without
  it, a content PR can silently break the economy, and Phase 5 is exactly when roster/parts PRs pile
  up. Recommended shape: a CI job **path-filtered to `packages/sim/**` and `packages/content/data/**`**
  that runs `balance:run` + the invariants and **uploads `report.md` as a build artifact**. Revisit
  the Sprint-03 deferral before Phase 5. Update CLAUDE.md's Test law + Commands when it lands. See
  `docs/reviews/external-review-2026-07.md`.

- [ ] **Buyout premium needs a leash + telemetry (external review 2026-07, finding 2).**
  `AUCTION_BUYOUT_PREMIUM = 1.1` may make instant certainty too cheap and hollow out the bidding
  game. Add a balance-report column for **fraction of acquisitions via buyout vs. won bids**; if
  bots converge on always-buyout, raise the premium. **Blocker:** the harness bots only bid today
  (never buy out), so the fraction is 0 by construction — a bot must first model the buyout decision
  (bid vs. buy-out-if-cheap). Target: the Fun Gate (Sprint 08) tuning pass. Also noted in
  `docs/economy-v0.md`.

- [ ] **Split `gameStore` into domain stores when staff/events land (external review, finding 5a).**
  It's a fine façade now, but trending toward a god-store; at Sprint 13+ (staff, events) consider
  `useGarageStore` / `useAuctionStore` / `useStaffStore` behind the current surface rather than one
  growing store.

## Balance / economy (from `docs/economy-v0.md`)

- [ ] **Parts acquisition has no sim mechanic yet.** The sim can install parts (`install-part` jobs)
  but there is no way to *buy* a part into inventory — no `buyParts` action, no parts market. Sprint
  05 exercises the install flow against dev-granted parts; Sprint 06 is slotted to add the real
  parts market alongside car auctions (`docs/sprints/sprint05.md` decision 1). The richer "order
  deliveries / lead times / parts scouts" layer is separately Sprint 16. Flagged so the Sprint 06
  design remembers to carry parts, not just cars.

- [ ] **User considers the Sprint 03 economy simulation too simplified — a real refinement pass is
  wanted, scope not yet defined.** Stated on 2026-07-08 review: "there is still a LOT of refinement
  that needs to be done here... I dont agree yet with how we are simulating, its too simplified."
  Explicitly not blocking — the framework (auctions, valuation, bots, harness) is good enough to
  build on for now — but don't mistake Sprint 03 passing its own invariants for the economy being
  actually right. No specific complaint was scoped yet (which mechanic, what "too simple" means
  concretely); ask before guessing when this comes up again.

- [ ] **Invariant #5 (lemon cap) is only verified at the unit-test level.** `auctions.test.ts`
  asserts `resolveHandoverCondition`'s dampened-multiplier behavior directly, but no bot currently
  buys uninspected and reports the outcome in a way the CSV captures — so there's no
  population-level harness invariant for "a fair-price uninspected purchase never loses more than
  50% of purchase price to hidden issues." Needs a bot (or a harness variant) that deliberately
  buys uninspected.
- [ ] **Invariant #6 (first-timer resale speed) is not yet checked at all.** "First-timer buyers
  keep sub-¥500k Commons sellable within 7 days at book value or better" has no bot modeling
  first-timer-specific selling behavior this sprint.
- [ ] **Forced-loan interest rate and repayment cadence** (GDD 6.6 says "painful," doesn't specify
  how painful) — open question for the spreadsheet pass.
- [ ] **Parts pricing curve per grade** (Stock/Street/Sport/Race) relative to car book value — open
  question for the spreadsheet pass.

## Planned systems (designed, not yet scheduled)

- [ ] **Facilities & bays — the sprint DIRECTLY AFTER service jobs.** Two-tier bay system: *service
  bays* (work capacity — a car must be in one to receive labor; start 1 → 2 → ~5) vs *parking bays*
  (storage — hold owned + accepted-job cars; start 3 → ~10-15), a move-between-bays action, and
  bay expansion as a purchase (the "Tools, not levels" spine). Cross-cutting: gates owned-car builds
  *and* service jobs. Models the labor↔bays↔staff growth loop. Full requirements:
  `docs/design/facilities-bays.md`. Detailed end-to-end design finalized when the sprint starts.

- [ ] **Skill / XP progression** — learn-by-doing growth for staff *and* the player character; skill
  *optimizes* (efficiency/quality), never *unlocks* tiers (tools + rep do that). Staff skill lands
  with the staff system (Sprint 13); player-character skill is new v1.0 scope, slotted against the
  service-jobs feature. Full design: `docs/design/skill-progression.md`.

- [ ] **Repair vs. Replace equipment progression — fully designed, targets the Sprint 14 slot.**
  Every part category has two paths: *replace* (buy the part + labor — available from day one) and
  *repair* (labor only, but requires owning that category's repair equipment). Early game forces
  replacement (parts cost = the pain); buying equipment converts that opex to capex; post-investment,
  repair dominates restoration and replacement becomes the *upgrade* path. Equipment unlocks in
  real-world-difficulty order (tire machine → brake lathe → ... → machine-shop/full engine rebuild),
  doubling as act progression. Does NOT block Sprint 08 (its repair-only vs. part-install job split
  is this system's seam). Full design incl. the zone/slot reconciliation question, economic
  guardrails, and harness columns: `docs/design/repair-replace-progression.md`.

## Design decisions

- [ ] **Naming Layer parody-flag default is undecided.** GDD explicitly defers whether the game
  ships with real brand names or parody names by default to closer to release — "nothing is lost
  by building real-first." Revisit once a release date is in sight.

## User-only tasks (air-gapped / purchases / accounts / legal)

- [ ] Buy Aseprite; (optional, whenever convenient) draw a real car sprite to replace the
  programmatic placeholder from the Sprint 00 art spike.
- [ ] Trademark search on the final title ("Midnight Garage" vs. alternates in the GDD); register
  a domain if the search comes back clean.
- [x] Create an `IDEAS.md` scope-creep parking lot (risk R3) — new mechanic ideas go there, not into
  the GDD. **Done 2026-07-08.** Tracked in the repo (the maintainer chose visible over private).
  First entry: a **wanted, purely-optional, zero-gameplay-weight** driving minigame
  (top-down/isometric, Super-Woden-GP-simplified). It conflicts with the hard "no driving gameplay"
  and "no reflex input" pillars, but the maintainer signed that off as an explicit opt-in exception;
  parked as a post-launch/expansion addition (not a v1.0 sprint).
