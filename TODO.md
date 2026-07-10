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
- [x] **Sprint 12 — Component model refactor.** Implemented, ready for review — see
  `docs/sprints/sprint12.md`. The zones+slots split (5 `condition` zones + 7 `buildSheet` slots, no
  shared identity between them) is gone, replaced by one unified 8-key `components` map
  (`{condition, installed}` per component: engine/forcedInduction/drivetrain/suspension/brakes/wheels/
  body/interior) on `CarInstanceSchema` — the foundation Sprint 13's repair-vs-replace economy needs.
  Ripple touched `computeDerivedStats` (condition-to-stat feed deliberately stays scoped to the same 4
  components as before — brakes/wheels/forcedInduction stay inert on stats this sprint, an explicit
  anti-balance-change guard), auction/service-job car generation, the job/labor core, all 5 bots +
  service-grinder, the car-detail UI (collapsed into one 8-row Components list), and the parts catalog
  (`wheelsInterior`'s 3 parts reclassified by name: `enkai-mesh-15`/`vulk-ve37` → `wheels`,
  `zashiki-bucket-seat` → `interior`). Two decisions were revised mid-flow at the maintainer's explicit
  direction: **no save migration** ("nuke" — no existing saves worth preserving, so `SAVE_VERSION` 4→5
  ships with no `MIGRATIONS[4]` transform; a pre-v5 save with a car now fails `decodeSave` cleanly and
  the store's existing hydrate/import fallback already handles it), and **correlated condition rolls**
  (a car's 8 components now roll around one shared per-car baseline ± jitter instead of fully
  independently, fixing a "pristine engine, wrecked transmission" realism gap that existed even in the
  old 5-zone model). Also split the old `install-wheels-interior` service-job type's mixed-theme
  flavor pool into separate `install-wheels`/`install-interior` types (13 types total, up from 12) —
  a real instance of the exact flavor/work mismatch class Sprint 11's type+pool model exists to
  prevent, surfaced by giving wheels and interior real separate identities. Both golden-master hashes
  re-pinned (`27aa1230`/`a7dc17af`). 301 tests (was 296; two content/resolution coverage gaps found in
  self-review after the fact and closed — see the two open items directly below). All checks green.
- [ ] **Sprint 12 follow-up: manually verify `CarDetailScreen.vue`'s unified Components list in a
  browser.** Never visually checked — `pnpm dev` is long-running and the maintainer's to run, not
  Claude's. Component-mount tests (`CarDetailScreen.test.ts`) confirm the right elements exist with the
  right `data-test` hooks, not that the 8-row layout actually reads well replacing the old two-section
  Condition/Build-sheet view. Check on next playtest pass.
- [ ] **Sprint 12 follow-up: run `pnpm balance:run` to check the correlated-condition-roll change
  (decision 5) at population scale.** Unit tests confirm the mechanics (shared per-car baseline +
  bounded jitter) are correct in isolation, but components now more often need the *same* number of
  repair labor slots (they cluster near one baseline instead of rolling independently) — this is
  exactly what broke one `gameStore.garage.test.ts` assertion during implementation, fixed there, but
  never checked against real bot economy behavior at the 100-day-career scale the harness exercises.
  Per Sprint 10/11's own precedent: unit tests passing isn't proof the economy is still right. Can be
  folded into Sprint 13's own harness work if that's more efficient than a standalone run now.
- [x] **Sprint 13 — Equipment & repair-vs-replace economy.** Implemented, ready for review — see
  `docs/sprints/sprint13.md`. The maintainer called this **critical, not a nice-to-have**
  (2026-07-09). A new 7-item `equipment.json` catalog gates REPAIR: `findOrCreateJob` refuses to open
  a new repair-zone job (logging `job-blocked`/`equipment-missing`) without the component's equipment,
  and charges a flat one-time consumables cost on successful creation; `resolveAcceptServiceJob`
  applies the same gate to repair-kind service-job offers (install-kind is never gated). Buying
  equipment is instant for the player and bot-batchable, following the `applyBayPurchase` template
  exactly. REPLACE (buy a part + install) is untouched and stays equipment-free, as a fix found
  mid-implementation (`applyJobToCar`'s install branch never restored `condition` — a pre-Sprint-12
  gap, closed since Sprint 13 is exactly the sprint that makes Replace a complete alternative to
  Repair). **Reversed mid-implementation:** the original design reputation-gated the 3 priciest items,
  but `reputationTier` turned out to never be mutated anywhere in the sim — gating on it would be
  permanent denial, not a climbable ladder, so all 7 items shipped cash-only (see the follow-up item
  below). All 5 pre-existing bots got a shared `bots/equipmentHelpers.ts` gate (mirroring
  `bayHelpers.ts`); two new bots, Handyman (buys equipment aggressively, then repairs) and Investor
  (never buys equipment, replace-only), exist specifically to make the payback curve measurable.
  Testing surfaced a genuine balance finding, not a bug: Service Grinder's repair-only income can't
  currently pay back real equipment prices within a 100-day career — resolved the same way Sprint 03
  handled Cautious Restorer's honest negative result (the test asserts the mechanism works, not a
  profitability claim that isn't true yet), tracked as its own follow-up below rather than patched
  away. Also fixed, opportunistically, a pre-existing and unrelated bug found while wiring the harness
  CLI: `cli/exportCareers.ts` had been silently generating zero service-job offers in every real
  `pnpm balance:run` since Sprint 11 shipped (stale `SERVICE_JOB_TEMPLATES` import, missing customer
  names). `SAVE_VERSION` 5→6, purely additive. 336 tests (was 301); all checks green.
- [ ] **Sprint 13 follow-up: manually verify the equipment UI in a browser.** Never visually
  checked — `pnpm dev` is the maintainer's to run, not Claude's, and not currently possible from
  mobile (2026-07-09). Covers `GarageScreen.vue`'s new Equipment section (owned/unowned, price, buy
  button), `CarDetailScreen.vue`'s disabled-repair-button + "needs `<equipment>`" hint, and
  `ServiceJobsScreen.vue`'s disabled-accept + hint for repair-kind offers. Component-mount tests
  (`gameStore.equipment.test.ts`, `CarDetailScreen.test.ts`) confirm the right elements exist with the
  right `data-test` hooks and the right disabled state under the right game-state conditions, not that
  the buy/gate flow actually reads well or that the "why is repair disabled" messaging is clear in
  practice — same caveat as the still-open Sprint 12 Components-list check directly above. Check on
  next desktop session.
- [x] **Sprint 13 follow-up: filter repair-kind service-job offers by owned equipment at generation
  time, not just block them at accept time.** Maintainer's read (2026-07-09): "these jobs should not
  even be showing up if the player can not complete them yet." Correct critique — Sprint 13 shipped
  the simpler accept-time block per the maintainer's own "leave as is for now" call at the time.
  **Implemented by Sprint 16** (`docs/sprints/sprint16.md`, 2026-07-10, ready for review — not yet
  committed) — with real nuance added beyond a hard filter: mostly hides offers the player can't act
  on, but lets a rare one through anyway (`JOB_HINT_OFFER_CHANCE = 0.15`) as a "here's what's next"
  hint rather than filtering to zero.
- [ ] **Sprint 13 follow-up: deeper per-bot equipment strategy, if the harness shows the minimal
  buy-if-affordable logic isn't good enough.** Every repair-touching bot (5, including Service
  Grinder) gets a working equipment-purchase gate in Sprint 13 itself — no bot goes inert. What's
  deferred is *strategic* depth: an existing bot (Flipper, Cautious Restorer, Balanced Player,
  Random Strategy) deliberately timing a purchase against its own payback math, the way the new
  Handyman bot does. Only pick this up if `pnpm balance:run` after Sprint 13 shows the plain
  buy-if-affordable heuristic produces bad-looking economics for one of the existing archetypes.
- [x] **`reputationTier` is never derived from `reputationPoints` anywhere in the sim — a real gap,
  surfaced as load-bearing by Sprint 13.** Confirmed by grep: `reputationTier` is read (auction
  calendar, service-bay income) but nothing ever mutates it from `unknown`. Harmless while nothing
  gated on it mattered much; Sprint 13 originally gated the 3 priciest equipment items behind
  reputation tiers and found Service Grinder permanently stuck at `unknown`, locked out of 3 of 5
  repair components forever, going net-negative over 100 days — so Sprint 13 shipped with **no**
  reputation gate on equipment (all 7 items cash-only) rather than gate on a value that can't climb.
  **Implemented by Sprint 15** (`docs/sprints/sprint15.md`, 2026-07-10, ready for review — not yet
  committed) — the exact "own scoped design" this item called for: `deriveReputationTier` now derives
  the tier from `reputationPoints` on every change (a first-pass, openly-adjustable point ladder), plus
  two real new reputation sources beyond service jobs alone (a quality-car-sale bonus, a lemon-sale
  penalty). **Sprint 16 (also implemented, 2026-07-10, ready for review) spends the now-real tier** on
  equipment/facility/auction gating and the Collector Network caveat mentioned here — and found a real
  catch-22 doing it: gating every one of Service Grinder's five possible repair-kind equipment targets
  left it with no way to ever earn its first point of reputation. Fixed by leaving `upholstery-bench`
  ungated (see sprint16.md's decision 1 revision), the real-content counterpart to this item's own
  "gate on a value that can't climb" lesson from Sprint 13.
- [x] **Sprint 14 — Parts market: cart, checkout & delivery timing.** Implemented, ready for review —
  see `docs/sprints/sprint14.md`. **Scope corrected 2026-07-09**: the previous version of this bullet
  added "more grades (a junk/scrapyard tier), multiple vendors" — traced back through the docs and
  found to be scope invented in an earlier session, not the GDD's 4-grade system
  (Stock/Street/Sport/Race) nor any sourced playtest note. Moved to `IDEAS.md` as an unapproved idea.
  Actual scope, grounded directly with the maintainer same day: the real, sourced playtest ask (#7)
  turned out to be a genuine misclick-safety problem (accidentally bought a ¥500k part in one click
  during playtesting) — `PartsMarketScreen.vue` now has a real cart (Add to cart, running total, one
  deliberate Checkout click; nothing spends cash until then) plus a delivery-speed choice at checkout:
  **express** (a 10% surcharge, arrives same-day, today's old behavior) or **standard** (sticker price,
  arrives next day via a new `pendingPartOrders` queue resolved by `advanceDay`, modeled directly on
  `PublicListingSchema`'s `resolvesOnDay` pattern) — a deliberate narrow pull-forward of what the
  roadmap assigned to Sprint 16 ("order deliveries / lead times / parts scouts"), plus sorting/filtering
  the catalog. **The cart is persistent** (maintainer's explicit call, reversing the original
  ephemeral-ref proposal): it lives on `GameState` (`cartPartIds`), riding the existing autosave/
  save-code mechanism for free rather than a new persistence layer. **A design assumption was revised
  mid-implementation**: the planned deadline-aware bot `decideDeliverySpeed` helper turned out to have
  exactly one real caller (`investor.ts`), whose existing same-tick install mechanic structurally can't
  use standard delivery at all — so Investor is pinned to express with a comment instead of shipping an
  unused generic helper (tracked as its own follow-up below). `SAVE_VERSION` 6→7, purely additive.
  361 tests (was 336); all checks green. Deliberately sequenced last in the 10→11→12→13→14 run — it
  targets `componentId` (Sprint 12) and is instant-buy (Sprint 11), so building it earlier would have
  meant redoing it.
- [ ] **Sprint 14 follow-up: manually verify the cart/checkout/delivery-timing flow in a browser.**
  Never visually checked — not currently possible from mobile (2026-07-09), same recurring blocker as
  Sprints 12/13. Component-mount tests confirm the right elements exist and the right state transitions
  happen, not that the cart *feels* like a safeguard, that the "On order" pending-deliveries section is
  discoverable, or that the checkout-disabled-when-unaffordable state reads clearly. Check on next
  desktop session — this is also the first thing the upcoming playtesting sprint should exercise.
- [ ] **Sprint 14 follow-up: a deadline-aware bot delivery-speed helper, once a second part-buying bot
  actually needs it.** Sprint 14's design originally planned a shared `decideDeliverySpeed` helper
  (standard by default, express only under real time pressure) for every part-buying bot. Implementation
  found `buyParts`/`resolveBuyPart` has exactly one bot caller today — `investor.ts` — and its existing
  mechanic structurally requires express (it predicts a part's `partInstanceId` and installs it the same
  tick; a standard order wouldn't create that `PartInstance` until a later day). Building a deadline-aware
  helper for a single caller that can't use its "wait" branch would be dead generality, so Investor is
  pinned to express with a comment instead. Revisit if/when a future bot (e.g. one that installs parts for
  service jobs, which have real `dueOnDay` deadlines) actually needs the standard/express trade-off.

Sequencing (10 → 11 → 12 → 13 → 14) is the maintainer-facing recommendation in `sprint10.md`'s intro.
10 through 14 are all done. **The 2026-07-10 playtest happened** (`docs/playtest-notes-2026-07-10.md`,
11 raw notes) and turned directly into five designed sprints — **15 (reputation system), 16
(progression gating + Upgrades tab), 17 (drag-and-drop foundation + garage UI), 18 (parts inventory +
staged install/repair workflow), 19 (auction rework)** — sequenced by dependency, not by which item
felt most urgent in the notes (Sprint 19, the auction rework, was flagged with the most urgency but
sequenced last on size and blast radius — 15/16 reshape the auction population feeding it, so doing 19
first would mean recalibrating it twice; 17/18 are genuinely independent of 19, so that pair and 19
could swap order if the auction pain becomes unbearable first). All five designed 2026-07-10, reviewed
and corrected 2026-07-10 (factual claims verified against the codebase; logic gaps fixed in the docs).
**Sprints 15 and 16 implemented 2026-07-10** (`docs/sprints/sprint15.md`/`sprint16.md`, ready for
review — Sprint 15 committed, Sprint 16 not yet); 17-19 remain designed, pending maintainer review
before implementation starts. **Four**
items from that playtest are in none of the five sprints — tracked directly below so they don't vanish
(the review found the first draft of this paragraph claimed only two, and claimed they were listed
here when they weren't):

- [ ] **Playtest 2026-07-10 #1: End-Day cart warning.** Clicking "End Day" with items still in the
  parts cart should warn ("you have unordered items in your cart — check out first?"). Small,
  self-contained UI guard; fold into whichever of Sprints 15-19 ships first, or the next playtest-fix
  pass.
- [ ] **Playtest 2026-07-10 #9: British spelling — "tyre," not "tire," throughout; sweep for other
  Americanisms while at it.** Mechanical but wide (game copy, content JSON display strings — note the
  `tire-machine` equipment id: rename the *display* string, keep the id stable unless a migration is
  deliberately chosen). No sprint assigned.
- [ ] **Playtest 2026-07-10 #11: real main/pause menu** (Continue / Settings / New Game / Load Game,
  "nice looking landing page"). Explicitly lower priority per the maintainer ("at some stage").
- [ ] **Playtest 2026-07-10 #3 (deferred part): salvage & restore parts mechanic.** Maintainer said
  they'll expand on this separately — parked until that expansion exists; don't design it unprompted.

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
- [x] **Pre-commit/pre-push hooks and test coverage gating — added 2026-07-09** (maintainer request, a
  self-assessment turned up both as real gaps versus a typical Python `uv`/`ruff`/`prek`/`pytest`
  toolchain). Husky + lint-staged: `pre-commit` runs ESLint --fix + Prettier --write on staged files
  only (fast); `pre-push` runs the full local gate (`typecheck` → `lint` → `format` → `test:coverage`)
  so a broken push is caught locally, not only by CI. Coverage via `@vitest/coverage-v8`, configured at
  the root `vitest.config.ts` (workspace/projects mode aggregates coverage at the root, not per
  package) — thresholds (statements 80 / branches 65 / functions 78 / lines 82) are ratcheted to the
  real measured baseline (86.19/70.97/84.59/89.41 at the time), not an aspirational number picked in
  advance; a handful of legitimately-untestable files are excluded with a reason each (Pixi rendering,
  the Sprint 00 art-spike/dev-sandbox screens, the dev-only console tree-shaken from prod, and
  `saveDb.ts` — deliberately a thin Dexie wrapper by Sprint 07 design so tests don't need
  fake-indexeddb). CI's `pnpm test` step swapped for `pnpm test:coverage` so the same threshold gates
  pushes there too; the HTML/lcov report uploads as a build artifact. No coverage backfill work was
  done to hit a higher number — the point was making regression visible, not retroactively maximizing
  the metric.
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

- [x] **Wire the balance harness into CI — DONE 2026-07-09** (external review 2026-07, finding 1;
  originally deadlined "before Phase 5," landed well ahead of that). A new path-filtered `balance` job
  in `.github/workflows/ci.yml` (`packages/sim/**` / `packages/content/data/**`) runs `pnpm balance:run`
  → `python -m balance.cli report` → `python -m balance.cli check`, uploading `report.md` as a build
  artifact; skipped (not failed) on pushes/PRs that don't touch sim or content data. `deploy` now needs
  both `check` and `balance` (a skipped `balance` still counts as passing). CLAUDE.md's Test law +
  Commands updated. **Immediately useful**: the first real run under this job showed Flipper's day100
  cash had gone solidly negative since the last committed report (Sprint 10) — see the item below for
  why that's a data point worth having, not a "regression" (no baseline was ever validated as correct).
- [x] **Buyout premium needs a leash + telemetry — DONE 2026-07-09** (external review 2026-07, finding
  2). Every auction-bidding bot (all 6: flipper, balanced-player, cautious-restorer, random, handyman,
  investor) now runs a shared `shouldBuyout` decision (`sim/bots/buyoutHelpers.ts`) before queuing a
  bid: buy out only when the guaranteed price is within a small tolerance
  (`AUCTION_BUYOUT_TOLERANCE_FRACTION = 0.05`, first-pass/adjustable) of the lot's own "bid this high
  to win" estimate — the same read a player sees on the auction screen, not the bot's personal bid
  ceiling, so the decision means the same thing regardless of which strategy is asking. `runCareer`/`exportCareers.ts` now export a
  new `acquisitions.csv` (channel: bid/buyout per successful acquisition); `report.py` renders a
  buyout-vs-bid share per strategy. **Honest real-data finding: no convergence.** Across the full
  1000-career-per-strategy run, buyout accounts for only 0.7-5.3% of acquisitions depending on
  strategy (cautious-restorer highest at 5.3%, since it already inspects and bids closest to buyout
  price) — bots do **not** converge on always-buyout under this model, so `AUCTION_BUYOUT_PREMIUM`
  (currently 1.1) doesn't look obviously too cheap. Not proof the premium is perfectly tuned (a
  different buyout heuristic could behave differently), but a real, reassuring data point against the
  original concern. See `tools/balance/report.md`'s "Buyout vs. bid" section.

- [ ] **Real-data observation (2026-07-09): Flipper's day100 median cash is now solidly negative
  (¥-256,650, 1000-seed run) — not a regression, since no prior number was ever validated as correct.**
  The last *committed* report (Sprint 10) showed Flipper at +¥820,475, and the original Sprint 03
  invariant hard-gated `> 0`. **Maintainer's correction (2026-07-09), and the right read:** "regression"
  implies a known-good baseline that broke; nothing here was ever confirmed as correct in the first
  place — the sim produced a number in Sprint 10, several sprints of real logic changes landed since
  (equipment/consumables costs, delivery timing, correlated condition rolls, and more), and the sim now
  produces a different number. That's expected behavior for a simulation nobody has validated against
  real play yet, not evidence of breakage — directly consistent with the standing, sharpening concern
  (see the "balance harness proves gameplay" item above) that this harness's output isn't yet proven to
  reflect real behavior at all. **Accordingly, the invariant itself was softened to informational**
  (`tools/balance/src/balance/invariants.py`), matching Cautious Restorer's existing precedent exactly
  — report the number, don't assert a target nobody has actually confirmed. `check` is green again.
  **Verified, for the record, that today's buyout/CI work isn't the cause** (Flipper A/B-tested with
  and without the new buyout logic across 300 seeds each, both deeply negative) — kept here not as
  proof of a bug, just so the number isn't mistaken for noise from today's changes specifically. No
  further action implied; revisit only if/when there's an actual validated target to check against.

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

- [ ] **User doubts the balance harness proves anything about real gameplay — a standing, sharpening
  concern, scope still not defined.** First stated 2026-07-08 (after Sprint 03): "there is still a LOT
  of refinement that needs to be done here... I dont agree yet with how we are simulating, its too
  simplified." Restated more sharply 2026-07-09 (after Sprint 13): "the simulation is a strong
  framework, but does not yield any useful or valuable results. I'm not convinced yet that we are
  simulating any real gameplay behaviour." The concern has moved from "the numbers feel simple" to a
  construct-validity doubt about the bot archetypes themselves — do Flipper/Cautious Restorer/Balanced
  Player/etc. actually resemble how a real player plays, or just behave consistently with each other?
  Explicitly not blocking — the framework (auctions, valuation, bots, harness) is good enough to keep
  building on — but "N invariants pass" / "all checks green" is evidence the mechanism works, never
  evidence the game is fun or the bots are realistic; don't conflate the two when this comes up again.
  See the recorded-play idea directly below, the user's own proposed way to actually close this gap.

- [ ] **Idea (2026-07-09, user-proposed, refined same day, not scoped or sprint-assigned): record real
  play sessions and *parse* them into per-archetype statistical rulesets, not literal replay.** Raised
  in the same breath as the concern above: "if you could record my actions playing the game to get real
  representative samples of actions every player archetype might take." Refined once the user clarified
  intent: **not** 100%-replicating a session — the goal is deriving *rates and biases* from the action
  log (e.g. "bids X% below book, wins Y% of contested lots," "does these types of repairs, buys that
  type of part") and turning those into a **more specific ruleset than today's hand-authored bot
  heuristics** — genuinely more granular archetype behavior, calibrated against evidence instead of
  guessed. Explicit second requirement: the derived ruleset must be **phase-aware, not one static
  profile per archetype** — a real career can *drift* mid-run (the user's own example: "start heavy in
  jobs and gradually transition to only restorations"), and today's bots don't model that at all (each
  one plays the same fixed heuristic day 1 through day 100). Feasible with the existing architecture —
  Sprint 11 already made every player action an instant, self-contained resolver call (`repair`/
  `install`/`placeBid`/`buyout`/`buyPart`/`sellWalkIn`/`listForSale`/`acceptServiceJob`/`moveCar`/
  `buyBay`/`buyEquipment`/`inspectLot` in `gameStore.ts`), so capturing a session is "wrap each call
  site, append `{day, actionType, params, outcome}` to a log, export it," not a new architecture. Still
  needs its own scoped design before it's a sprint: recording format, how many real sessions before a
  derived rate is trustworthy (one session is an anecdote, not a distribution), how phase-drift gets
  detected and encoded (a fixed day-range split? a rolling window? explicit player-declared phases?),
  and how a derived ruleset plugs into the existing bot-strategy shape (`(state, context) => DayActions`)
  without a parallel bot architecture. Blocked on there being enough real play data to parse in the
  first place — the user hasn't logged a full career yet, so this stays an idea, not a backlog item
  with a target sprint.

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
  with the staff system, still unscheduled (playtest #9, deferred by Sprint 11 — see the Next focus
  section above); player-character skill is new v1.0 scope, slotted against the service-jobs feature.
  Full design: `docs/design/skill-progression.md`.

## Design decisions

- [ ] **Naming Layer parody-flag default is undecided.** GDD explicitly defers whether the game
  ships with real brand names or parody names by default to closer to release — "nothing is lost
  by building real-first." Revisit once a release date is in sight.

- [ ] **The recurring cast (landlord, bazaar auntie, the Rival) has no actual character design —
  outright rejected by the maintainer, 2026-07-09.** GDD §2.3/§8 only ever gives roles, never names:
  "the retired mechanic landlord," "the parts bazaar auntie," and a shop name ("Garage Tempest") with
  no name for the person running it. Zero named individuals exist anywhere in the design docs — buyer
  archetypes (Collector/Tuner/Stancer/Racer/First-timer/Gaisha) and staff traits are categories, not
  characters either. Needs real character design (names, personality, at minimum) — the maintainer's
  call on direction and timing, not something to invent unprompted.

- [ ] **Hall of Legends acquisition cadence — the core "always chasing the next car" design is not yet
  specified, 2026-07-09.** GDD §9.2 names the Hall of Legends as the explicit v1.0 win condition (10
  Legend cars, Enshrine mechanic), but only 1 of the 10 (the Toyota 2000GT) ever had an acquisition
  trigger written down, and that framing ("the grail... capstone enshrinement") was just corrected out
  — order across all 10 is now explicitly undecided (`midnight-garage-roster.md`), not backloaded to
  endgame. The maintainer's direction: surface Legend-acquisition chances at regular intervals across a
  run, gated by some combination of rep/skill/staff/money — a Blacklist-style (NFS Most Wanted) "always
  chasing the next car" structure, not an endgame dump. Real design work still needed: which specific
  combination gates each of the 10, and the actual "story lead" writing/delivery (the phrase appears
  twice in the roadmap, Sprint 22, and is undesigned both times). The 4-Act / 5-rep-tier structure
  already provides a natural cadence spine (no new system needed for the gating backbone), and the
  landlord/bazaar-auntie/Rival cast are the natural mouthpieces for leads once the character-design
  item above is resolved. Also needs its own storytelling justification for *why* the player character
  cares about collecting these specifically, per the maintainer's own framing.

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
