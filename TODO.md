# TODO

Deliberately deferred items that are **not** tied to any specific future sprint number, so they
won't surface again just by reading `docs/sprints/sprintXX.md` in order. Check this file
separately when planning a new sprint. (Deferrals that already have a sprint number attached — e.g.
the service-grinder bot in Sprint 13, the event-chaser bot in Sprint 16, Cloudflare Pages secrets
before Sprint 8 — live in their sprint docs instead and aren't duplicated here.)

Remove an item once it's actioned; note which sprint/commit picked it up.

## Next focus (agreed 2026-07-09, playtest-driven)

The maintainer played a full career through Sprint 09 and filed 11 concrete notes (see
`docs/sprints/sprint10.md`'s source line for the verbatim list). Explicit direction: **not chasing
polish or balance — the goal is landing on something playable and fun**, found by playing and noting
what breaks, not by pre-planning. Expect this section to keep churning sprint-to-sprint as more
playtest notes come in; that's the intended workflow now, not a one-time list.

- [x] **Sprint 10 — Auction realism, pacing, feedback.** Implemented, ready for review — see
  `docs/sprints/sprint10.md`. Day-1 content seeding (no more empty first week); service-job
  description/car-mismatch fix; a **full auction rework** — rivals bid a *fraction* of resale value
  (discipline) so bidding is winnable at a profit, a **variable bell-distributed field** of anonymous
  bidders (avg ~6, 3–9 band, replacing the fixed 5) gated by explicit tier interest, a hard buyout
  ceiling on rival bids, and a "bid ~X to win" estimate re-centered on the top bid; the win-price
  distribution is a calibrated bell (STEAL ~10% / MID ~82% / FRENZY ~8%), verified against many
  seeded synthetic lots in `bidding.test.ts`/`lotInterest.test.ts`. Plus a calendar (GDD §2.2: model
  years gated by in-game year, advances with reputation) and an instant job-completion feedback
  modal. 251 tests (was 231); all checks green. The harness got the win-price bucket metric too, but
  couldn't be run end-to-end — see the new Engineering item below.
  **Deferred to a later "auction depth" sprint:** more distinct buyer archetypes (richer valuation
  variety) + magnitude tuning toward the top of the 3–9 band.
- [x] **Sprint 11 — Instant actions, a real content-authoring system, round-2 playtest fixes.**
  Implemented, ready for review — see `docs/sprints/sprint11.md`. Generalized the
  moveCar/buyBay/completeServiceJob pattern (Sprint 08/09) to every remaining action — repair,
  install, inspect, bid, buyout, buy-part, accept-service-job, sell-walk-in, list-for-sale all resolve
  the instant the player clicks (a new `laborSlotsSpentToday` live daily budget on GameState,
  `SAVE_VERSION` 3→4, makes repeated same-day clicks possible). `advanceDay` is now purely a
  day-boundary tick, still resolving bots' queued `DayActions` through the *same* instant resolvers.
  Service-job acceptance is now genuinely instant (the car arrives in parking the moment you click,
  not "next day") — finishes what Sprint 10 only labeled, no separate `arrivesOnDay` field needed since
  there's no longer a queue to arrive *from*. Round-2 playtest fixes bundled in: recalibrated the
  "feeding frenzy" badge (was firing on ~30-50% of auctions, Sprint 10's own miss); dropped inspect's
  labor cost; new `swapCars` fixes a real full-shop soft-lock; the sell-side buyer pool is now gated
  the same way auction bidding already was (fixes backwards walk-in-vs-listing pricing and
  collectors bidding on shitboxes). Replaced the fixed 8-template service-job content model with a
  12-type job-type + flavor-pool catalog (`ServiceJobTypeSchema`) — a real fix for the "brakes on a
  suspension job" bug class, not another one-line patch, after the maintainer found a *second*
  instance of it and asked for a structural fix. 295 tests (was 251); all checks green.
  **Deferred (per the maintainer, tracked as their own future sprints):** staff (playtest #9), the
  parts-market cart/checkout overhaul (playtest #7).
- [ ] **Sprint 12 — Component model refactor.** The zones+slots → unified per-component model from
  `docs/design/repair-replace-progression.md` ("Option B," already fully designed). Foundational,
  major save-law migration, touches nearly every sim module. Not yet written up as a full sprint doc.
- [ ] **Sprint 13 — Equipment & repair-vs-replace economy.** The maintainer called this **critical,
  not a nice-to-have** (2026-07-09) — repair gated by owned equipment, replace always available via
  the parts market. Full design already exists in `docs/design/repair-replace-progression.md`; this
  sprint builds the equipment catalog + purchase actions + gated repair on top of Sprint 12's
  component model.
- [ ] **Sprint 14 — Parts market overhaul.** Sorting/filtering, more grades (a junk/scrapyard tier
  below stock), multiple vendors (scrapyard vs. performance house). Deliberately sequenced last — it
  should target `componentId` (Sprint 12) and be instant-buy (Sprint 11), so building it earlier would
  mean redoing it. Not yet written up as a full sprint doc.

Sequencing (10 → 11 → 12 → 13 → 14) is the maintainer-facing recommendation in `sprint10.md`'s intro.
10 and 11 are both done; 12-14's order past this point is not yet explicitly confirmed — revisit
before writing 12's full doc if it changes.

## Engineering

- [x] **`pnpm balance:run` failed end-to-end — `@midnight-garage/content`'s live-source `exports`
  couldn't be resolved by plain Node.** **Fixed 2026-07-09**, same session as Sprint 10.
  `packages/content/package.json` has `"exports": {".": "./src/index.ts"}` (a raw TypeScript file) so
  Vite/Vitest can resolve it via their own transform, but the CLI runs as compiled, plain `node`, which
  can't execute `.ts` or resolve a bare `require("@midnight-garage/content")`. Fix: `tsconfig.cli.json`
  now includes `content/src/index.ts` as an explicit compile root (so tsc actually emits a real
  `dist/packages/content/src/index.js`, not just the handful of content submodules other files happened
  to reach via type-erased imports), and a new `packages/sim/scripts/fixContentRequires.cjs`
  post-build step rewrites every compiled `require("@midnight-garage/content")` to the correct relative
  path into that dist file. Verified with a real, full `pnpm balance:run` (600,000 career rows, 126,093
  auction-win rows, 24,000 field-size rows) and `python -m balance.cli check` (all 4 gated invariants
  pass).
- [ ] **Auction calibration, real-data finding (2026-07-09): FRENZY essentially never happens.** The
  first real `pnpm balance:run` since the fix above shows STEAL 8.2% / MID 91.8% / FRENZY 0.0% against
  a target of STEAL/FRENZY 5-10% each — MID is winning far more than the unit-level Monte Carlo
  predicted (STEAL 10% / MID 82% / FRENZY 8%), because real bots don't isolate the AI-only clearing
  price the way the unit tests do (a token bid), and apparently rarely push a lot all the way to the
  buyout-capped top of the range. Average field size (6.2) is on target. Not retuned yet — the
  three knobs (`AUCTION_FIELD_BASE`/`PER_INTEREST`/`SD`, `AUCTION_BIDDER_DISCIPLINE`) are still at
  Sprint 10's first-pass values; a frenzy-tail nudge (probably raising discipline, or a bot
  buyout-decision model per the buyout-premium item below) is a candidate for the next auction-tuning
  pass. See `tools/balance/report.md` for the live numbers.

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
