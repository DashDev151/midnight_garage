# TODO

Deliberately deferred items that are **not** tied to any specific future sprint number, so they
won't surface again just by reading `docs/sprints/sprintXX.md` in order. Check this file
separately when planning a new sprint. (Deferrals that already have a sprint number attached — e.g.
the service-grinder bot in Sprint 13, the event-chaser bot in Sprint 16, Cloudflare Pages secrets
before Sprint 8 — live in their sprint docs instead and aren't duplicated here.)

Remove an item once it's actioned; note which sprint/commit picked it up.

## Next focus (agreed 2026-07-08)

- [ ] **Interactive service / walk-in jobs — the next major feature.** A customer brings in a car
  with a request (repair a body panel, fit these wheels, diagnose+fix a drivetrain issue); the
  player accepts, the car takes a bay, labor + parts go in, the job completes, and the player is paid
  a **guaranteed profit** — the player never owns the car (Car Mechanic Sim / PC Building Sim style).
  **Why it matters:** it's the Act 1 early-game floor (carries the player when capital is scarce) and
  the natural tutorial vehicle; right now the player is auction-only, which is punishing early. Only
  *passive* service-bay income exists in code (needs staff nobody has yet). **Economy design goal:**
  service jobs carry the early game, then auction flipping should overtake them in profitability by
  the midgame — the balance harness can pin the crossover. Needs a dedicated sprint; **sequencing vs.
  Sprint 07 (persistence) is a user call** — the user said "focus on this next," which may reorder
  the roadmap. The GDD already scopes Act 1 service jobs + the landlord tutorial, so this is
  elaborating planned scope, not new scope.

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

- [ ] **Skill / XP progression** — learn-by-doing growth for staff *and* the player character; skill
  *optimizes* (efficiency/quality), never *unlocks* tiers (tools + rep do that). Staff skill lands
  with the staff system (Sprint 13); player-character skill is new v1.0 scope, slotted against the
  service-jobs feature. Full design: `docs/design/skill-progression.md`.

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
