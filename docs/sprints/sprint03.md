# Sprint 03 - Markets, Auctions & the Balance Harness

*Source: roadmap Phase 1, Sprint 3. GDD sections 6.1-6.6 (economy, buyers, market heat, auctions,
failure pressure), roadmap risk R4 (economy might not be fun). Status: **implemented and locally
verified - CI wiring deliberately deferred by user decision (2026-07-08); see group E and Exit.***

## Goal

Make the economy playable end-to-end (buy at auction -> build -> sell) and prove it's *sane*, not
just functional: a headless balance harness plays thousands of simulated careers and a Python
report answers "what does day 40 look like for a flipper?" with real numbers, gating CI on the
pacing invariants from `docs/economy-v0.md`.

This is the largest sprint yet - it has real cross-language plumbing (TypeScript sim -> Python
analysis) and several places where the roadmap's one-line bullets hide design decisions the GDD
doesn't fully specify. Section below flags every one of those for your review before I start
implementing.

## Definition of Done (from roadmap)

The invariant assertions pass, and you can answer "what does day 40 look like for a flipper?"
with a chart.

## Decisions reviewed and approved (2026-07-08), with refinements

All seven were approved as proposed. The user's own refinements are folded in below (marked
**refinement**) - these are now the spec, not open questions.

1. **CSV + manifest, no new dependency.** The sim/analysis boundary is the contract, not the file
   format - Parquet matters where the analysis lives (Python/polars), not in transit. TS emits
   CSV (compiled via the `typescript` we already have, run with plain `node` - no `tsx`).
   **Refinement:** emit a schema/manifest file alongside the CSV (`careers.manifest.json`:
   column names, types, sim version) so polars parses **strictly** (explicit dtypes), not by
   inference - that's the one real thing raw CSV loses versus Parquet, and it's cheap to restore.
2. **Flipper / Cautious Restorer / Passive Grinder** - approved as a valid strategy spread for
   the systems that currently exist; Passive Grinder as a do-nothing control group is correct
   experimental design, not a lesser substitute. **Refinement:** service-grinder and event-chaser
   bots are logged now as explicit future checklist items (see "Deferred to future sprints"
   below) so they're not forgotten when Sprints 13/16 land the systems they depend on.
3. **Proxy invariants now, literal rep-tier invariants deferred** - approved; never quietly fake
   a mechanic to make a test pass. **Refinement:** add a second proxy invariant - the Flipper
   must **survive** (never enter the missed-rent debt spiral, GDD 6.6) at default tuning.
   Solvency is the real Act 1 gate; the cash-separation-from-Passive-Grinder invariant is the
   growth signal on top of that.
4. **Second-price sealed-bid resolution** - approved as the textbook-correct headless model; AI
   max-willingness from the shared valuation function plus a reserve price is exactly right, and
   it makes the eventual Sprint 6 bidding UI a pure reveal of an already-fair resolution.
   **Refinements:** (a) each AI bidder gets a **persistent, seeded per-bidder noise/aggression
   factor** - without it the same car always clears at the same price, which both kills the
   "personalities" flavor GDD 6.5 wants and removes the variance that makes sniping possible
   (feeding directly into the sliding-scale-steal mechanic, decision 9); (b) the winner pays
   **second-highest bid + a small increment**, not their own max, so the player occasionally
   wins well under what they were willing to pay - that "I stole it" moment is the whole point
   of the auction system.
5. **One `valuateCarForBuyer` function for both bidding and selling** - approved without
   reservation, the DRY call. **Refinement:** `valuateCarForBuyer` stays **pure and
   deterministic** - any bidder noise from decision 4 lives on the bidder wrapper (e.g. a
   `biddingNoiseFactor` applied outside the valuation call), never inside the valuation function
   itself, or the golden-master tests flake.
6. **List-publicly + walk-in-offer only, contact channel deferred** - approved; a contact channel
   without the meets system that creates contacts would itself be a faked mechanic, same
   principle as decision 3.
7. **Gaisha excluded from auction generation** - approved, and worth stating so this absence
   reads as intentional design, not a gap to "fix" later. **Refinement:** back it with a real
   test - `generateAuctionCatalog` (or the tier-mapping function) gets a unit test asserting no
   Gaisha-tier model ever appears in a generated lot, so the invariant is enforced, not just
   documented in prose.

## Deferred to future sprints (logged now, not forgotten)

- [ ] **Sprint 13 (staff system):** add a real "service grinder" bot strategy once staff hiring
  and a customer service-job mechanic exist - the do-nothing Passive Grinder is *not* what a
  service grinder should look like once the system is real.
- [ ] **Sprint 16 (events II):** add a real "event chaser" bot strategy once touge nights /
  meets / magazine features exist and grant measurable rep or cash.

## Design decisions (lower-stakes, proceeding as stated)

1. **Auction tier is derived from `CarModel.tier`, not a new field**: shitbox/common -> Local
   Yard, uncommon -> Regional, rare -> Premium, legend -> Collector Network (rep-gated),
   gaisha -> excluded (approved decision 7 above). One mapping function, no seed-data duplication.
2. **The sliding-scale lemon rule applies at handover, not at generation.** A lot's hidden issues
   are rolled at generation time (weighted by `CarModel.hiddenIssueWeights`) but stay unresolved
   until the car changes hands: inspected lots apply their issues at full rolled severity (no
   surprise - you saw them coming); uninspected lots run the issues through a discount-scaled
   variance roll at purchase (fair-or-over price -> dampened, capped downside; steep discount ->
   wide swing, lemon or goldmine). First-pass formula, explicitly tunable like Sprint 02's.
3. **Weekly catalog refresh reuses the existing 7-day cadence** (`day % 7 === 0`, same boundary
   as rent and market-heat drift) - one new batch of lots per tier per week, old unsold lots
   expire. No new time system.
4. **`GameState` gains `activeAuctionLots: AuctionLot[]` and `activeSaleListings: SaleListing[]`**
   - both in `packages/content` (additive schema extension, same pattern as Sprint 02's `jobs`).

## Implementation-time findings (not in the design doc - discovered while building)

These surfaced only once real numbers ran through the system. Flagged here per the same rule as
Sprints 01-02: never quietly fix or hide something without saying so.

1. **The original valuation formula had a hard ceiling below book value.** First-pass
   `valuateCarForBuyer` (fitComponent maxing at 1.0, priceSensitivity only ever subtracting)
   meant the *best possible* buyer valuation for a *perfectly restored* car topped out at ~86% of
   book value. Since auction clearing prices are driven by these same valuations, nothing -
   flipping, restoring, sniping - could ever be profitable: every car was worth less than what
   any rational buyer would pay for it, by construction. Fixed to let a well-matched, well-kept
   car reach or exceed book value (see `valuation.ts`'s comment for the exact formula change).
   This is a correctness fix to a Sprint 03 formula, not a rebalance of anything from Sprint 02.
2. **`sellViaWalkIn` picked a uniformly random buyer regardless of fit.** GDD 6.3 calls it "fast,
   variable," but uniform selection meant a car was routinely offered to a buyer who didn't want
   it at all, on top of the walk-in discount - a double penalty that made every flip's resale
   leg unprofitable independent of the buy side. Changed to a value-weighted pick (a buyer who
   wants this car more is more likely to be the one who walks in) - still variable, not
   guaranteed-best, but no longer punishing by construction.
3. **Starting capital (economy-v0.md's Y1,200,000) left zero operating margin.** 100 days of
   `WEEKLY_RENT_YEN` alone is Y1,260,000 - more than the original starting cash. *Any* strategy,
   including a perfectly profitable one, would look insolvent purely from not having enough
   capital to survive a slow start. Bumped to Y1,500,000 in `runCareer.ts`; `docs/economy-v0.md`
   updated to match. This is the harness doing exactly its intended job - the roadmap always
   expected Sprint 00's draft numbers to get corrected here, not to survive untouched.
4. **Cautious Restorer's original tier target was unaffordable by its own rule.** It inspected
   regional/premium lots every day but its `CASH_BUFFER_MULTIPLIER` (1.4x) made even the
   cheapest regional lot's book value exceed available capital - it never won a single auction in
   any seed, despite "working" every day. Narrowed to regional only, buffer lowered to 1.15,
   and its bid raised to 1.1x book (an inspected buyer has real information an uninspected AI
   bidder doesn't, so paying a small premium is justified, not reckless).
5. **Cautious Restorer's day100 result stayed negative after all of the above (~-Y255,000
   median) - left as a genuine, reported finding, not chased further.** Full restoration (up to
   5 zone-repair jobs + a 5-day public-listing wait) is a slow cycle; a 100-day career doesn't
   complete enough of them to demonstrate profitability at this time horizon. Confirmed this
   isn't a tuning artifact: widening its tier pool to include local-yard made results *worse*
   (more volume on a strategy whose per-cycle margin isn't reliably positive just compounds
   losses faster), so the fix isn't "let it transact more." A future balance pass - likely once
   content waves add more mid-tier cars, or once a longer time horizon is tested - is the right
   next step, not more parameter search this sprint. **User's own framing, and the right one:**
   the balance is imperfect, but the point of this sprint was building a way to *measure* that,
   not to hand-tune every number to a specific outcome before shipping the tool.
6. **User-requested addition mid-sprint: two more bots.** After reviewing the first 3-bot run,
   the user asked for (a) a genuine control that picks legal actions uniformly at random - "does
   the game reward or punish having no strategy at all" - since Passive Grinder (do-nothing) only
   answers a different question; and (b) a "completely average" player: mid-priced cars only,
   fixes the two worst zones (not a full restoration), sells to the first walk-in offer instead
   of waiting on a public listing. Added as `randomStrategy` and `balancedPlayerStrategy`.
7. **Both first-pass bots were corrected on review, before commit.** Two problems the user caught
   in the first-draft implementation: (a) Balanced Player took *literally* the first walk-in offer
   regardless of price - not "average," just gullible. Fixed to only accept a walk-in offer that
   clears 85% of the car's book value (`ACCEPTABLE_WALKIN_FRACTION` in `balancedPlayer.ts`,
   estimated from the best-fit buyer's valuation, the closest proxy available without previewing
   the actual walk-in roll); below that floor it lists the car publicly instead of dumping it
   cheap. (b) The original Random bot gated each of 4 action types independently behind its own
   coin flip, per day - which could buy a car one day and, with no memory of *why* it bought it,
   sell it at an instant loss the next: not "an inconsistent player," just broken input. Redesigned
   so each car's playstyle (quick flip / careful restoration / mid - the same three postures the
   other bots use) is derived deterministically from the car's own instance id, the same hashing
   trick as `biddingNoiseFactor` in `bidding.ts`, so a given car is played out coherently start to
   finish while different cars still land on different, arbitrarily-assigned approaches. The
   randomness now lives in *which* playstyle governs *which* car, never in whether the bot bothers
   to act sensibly at all. Re-ran the full 5-bot, 500,000-row harness after both fixes: Random
   remains the clear worst performer of all five (day100 median ~-Y448,298, confirmed worst-of-5 by
   the invariant check itself), and Balanced Player now closes day100 positive (~Y127,600, between
   Flipper's ~Y195,677 and Cautious Restorer's ~-Y255,000 - exactly where "completely average"
   should land). Both findings survive the redesign; they're just honest now instead of
   accidentally cheating (Balanced Player) or accidentally incoherent (Random).
8. **Why Random loses so much: a diagnosed selection effect, not noise.** The user asked for a
   direct breakdown, not just the headline day100 number. A one-off diagnostic (500 seeds, per-car
   trade tracking by archetype, deleted after use - not part of the committed CLI surface) found
   that Random's three archetypes get assigned to roughly *equal* numbers of bid attempts
   (~2,400-2,800 each - the assignment itself isn't skewed), but win auctions at wildly different
   rates: flip and mid (both bid 1.0x book) win ~10% of their bids, while restore (bids 1.1x book,
   same premium Cautious Restorer uses deliberately) wins **77.6%** - meaning 78% of every car
   Random ever actually owns ends up played as a "careful restoration," not because that playstyle
   was picked more, but because a 10% bid premium is enough to beat the AI field almost every time
   in this second-price system (a sharper bid-sensitivity curve than expected - worth remembering
   for future tuning). Winning nearly every auction you enter is itself a winner's-curse signal:
   restore-archetype trades lose money on 98.7% of attempts (avg -Y34,408/trade) because, unlike
   the real Cautious Restorer bot, this archetype carries no tier cap or cash discipline - it bids
   1.1x on cheap and expensive lots alike, then sells via public listing at the *average* valuation
   across all buyer archetypes (dragging the price down from what a well-matched buyer would pay).
   Flip and mid trades lose money too, for the ordinary reason those channels have a built-in
   discount (avg -Y40,378 and -Y34,258/trade respectively), but they're only ~11% and ~10% of
   trades each. Net effect: Random's overall loss is driven disproportionately by the one archetype
   that happens to win almost everything it bids on, precisely because winning almost everything is
   evidence of overpaying. Confirms the intended finding (no consistent judgment about strategy
   selection is punished) through a sharper, more specific mechanism than assumed. **This surfaced a
   real design flaw, corrected in finding 9 below** - the initial write-up of this finding treated
   restore's 1.1x premium as flavor; the user correctly challenged it as unjustified.
9. **The 1.1x restore bid premium was a design bug, not a personality trait - fixed on user
   challenge.** Cautious Restorer's real 1.1x premium is earned: it always inspects a lot before
   bidding, so the premium pays for genuine information an uninspected AI bidder doesn't have.
   Random's `restore` archetype copied the number without the reason - its inspect step (one random
   uninspected lot/day) and its bid step (one random affordable lot/day) are independent random
   picks, so a "restore"-flavored bid has no guarantee, or even likelihood, of targeting a lot it
   actually inspected. Bidding more with no informational edge doesn't express a preference for
   different cars, it just wins auctions it should be losing - exactly the winner's-curse mechanism
   finding 8 diagnosed. Fixed: bid size (`BID_MULTIPLIER` in `randomStrategy.ts`) is now uniform
   across all three archetypes; only repair depth and sell channel still vary. Re-ran the full
   5-bot, 500,000-row harness: bid win rates are now genuinely uniform (flip 10.0%, restore 10.4%,
   mid 10.7% - versus the old 10.2% / 77.6% / 10.9%), and the trade split across archetypes is now
   close to the honest 1/3 each (36% / 33% / 32% of 875 completed trades, versus the old 78%
   restore share of 2,519). A second, non-obvious result fell out of the fix: restore is now the
   *least* unprofitable archetype per trade (avg -Y16,313, versus flip's -Y41,245 and mid's
   -Y37,082) - once it's not also overpaying to win, a full restoration genuinely preserves more
   value than the faster channels' built-in discount, which is the sane ordering you'd actually
   expect. Random's day100 median moved from ~-Y448,298 to ~-Y535,292 - slightly *worse* in raw
   cash, not better, because total completed trades dropped roughly 3x (875 vs 2,519 - restore's
   inflated win rate had been carrying most of Random's volume) and the trades that do still happen
   are still losing money on 87-93% of attempts; fewer trades on top of the same fixed rent/wage
   drain every bot pays doesn't help when the trades themselves are still bad. **Caveat for reading
   these two numbers side by side:** `advanceDay` draws from one deterministic RNG stream per day,
   so a different bid amount changes whether a bid wins, which changes how many `rng` calls happen
   before the day's later steps (weekly catalog generation, hidden-issue rolls) - shifting every
   downstream random draw for that seed onward. The day100 headline before/after isn't a clean
   apples-to-apples delta because of that; the archetype-level comparisons *within* the corrected
   run (win rate, relative profitability) are the reliable read.
10. **CI wiring deliberately deferred (user decision, this review).** The design doc's group E
   originally planned to wire `pnpm balance:run` + the Python report into `.github/workflows/ci.yml`
   on every push. The user wants to run the harness locally for a while first before committing to
   running it on every commit. Nothing in `ci.yml` changed this sprint; `pnpm balance:run` and
   `python -m balance.cli report|check` are run by hand, locally, whenever wanted.

## Task breakdown

### A. Content schema additions (`packages/content`)

- [x] `src/auction.ts`: `AuctionTierSchema`, `AuctionLotSchema` (id, tier, modelId, `car`: a
  freshly generated `CarInstance`, `bookValueYen` snapshot, `inspected: boolean`,
  `expiresOnDay: number`).
- [x] `src/sale.ts`: `SaleChannelSchema` (`list-publicly` | `walk-in-offer`), `PublicListingSchema`
  (id, carInstanceId, `askingPriceYen` snapshot, `resolvesOnDay: number`) - only the
  list-publicly channel needs persisted state; walk-in resolves same-day.
- [x] Extended `GameStateSchema`: `activeAuctionLots`, `activeListings` (both default `[]`).
- [x] Extended `DayLogEntrySchema`: `auction-catalog-refreshed`, `lot-inspected`,
  `auction-bid-won`, `auction-bid-lost`, `listing-created`, `car-sold`.

### B. Sim: valuation, auctions, selling (`packages/sim/src`)

- [x] `valuation.ts`: `valuateCarForBuyer(buyer, model, instance, partsById): yen` (decision 5) -
  see implementation-time finding 1 for the formula correction. **Pure and deterministic** - no
  RNG, no noise; bidder-side variance is layered on by the caller in `bidding.ts`.
- [x] `auctions.ts`: `auctionTierForRarity(tier)`, `generateAuctionCatalog(models, tier,
  hiddenIssuesByZone, day, count, expiresInDays, rng)`, `generateAuctionCarInstance(...)` (rolls
  year/mileage/condition/authenticity + weighted hidden-issue draw), `inspectLot(lot)`,
  `resolveHandoverCondition(lot, finalPriceYen, hiddenIssueCatalog, rng)` (the sliding-scale
  lemon rule), `groupHiddenIssuesByZone(...)` helper.
- [x] `bidding.ts`: `resolveAuction(lot, model, playerMaxBidYen, aiBidders, partsById)` -
  second-price sealed-bid resolution with a reserve price floor (40% of book). Each AI bidder's
  effective max bid is `valuateCarForBuyer(...) * biddingNoiseFactor(bidderId)`, where the noise
  factor is deterministically derived from the bidder's id (not re-rolled per lot) via its own
  seeded RNG - refinement (a). Winner pays second-highest bid + a fixed increment, capped at
  their own max - refinement (b).
- [x] `selling.ts`: `sellViaWalkIn(car, model, buyers, partsById, rng)` (value-weighted buyer
  pick - implementation-time finding 2), `listPubliclyAskingPrice(...)`, `bestFitBuyer(...)`.
- [x] Extended `actions.ts`: `bidsOnLots`, `inspectLots`, `sellViaWalkIn`, `listForSale` action
  lists in `DayActionsSchema`.
- [x] Extended `advanceDay.ts`: labor-shared lot inspection, bid resolution, walk-in sales,
  public listing creation/resolution, weekly catalog refresh + lot expiry, all wired into the
  existing day-tick order. Also added `SimContext` (see below) as `advanceDay`'s 4th parameter -
  an implementation-time addition the design doc didn't anticipate: valuation/generation need the
  static car/part/buyer/hidden-issue catalogs, which the sim has no data loader of its own to
  build, so the caller now passes them in once per call.
- [x] **New: `context.ts`** - `SimContext` + `buildSimContext(models, parts, buyers, hiddenIssues)`
  bundling the static content catalogs (with id-indexed lookup maps) that auction generation and
  valuation need throughout `advanceDay` and the bots.
- [x] **New: `packages/content/src/data.ts`** - parsed, schema-validated seed content
  (`CARS`, `PARTS`, `BUYERS`, `HIDDEN_ISSUES`, `TRAITS`) exported from content's main entry
  point. Sprint 01/02 only exported schemas, not data; this sprint's bots, tests, and CLI export
  all need the actual seed content, not just the ability to validate it.

### C. Bot strategies & career runner (`packages/sim/src/bots`)

- [x] `flipper.ts`, `cautiousRestorer.ts`, `passiveGrinder.ts` - see implementation-time findings
  1-5 for the real tuning story behind each.
- [x] **`balancedPlayer.ts`, `randomStrategy.ts`** - added mid-sprint at user request (finding 6).
- [x] `runCareer.ts`: `runCareer(strategy, seed, days, context): CareerSnapshot[]` - one row per
  day (day, cashYen, carsOwned, netWorth estimate, reputationTier); `createInitialCareerState`
  holds the shared starting state (finding 3's Y1,500,000 starting cash).
- [x] `tests/bots/runCareer.test.ts`: all 5 strategies run 100 days without throwing, produce
  finite cash/net-worth and non-negative car counts, and are deterministic for a fixed seed.

### D. CSV export & locally-runnable career sweep

- [x] `packages/sim/src/cli/exportCareers.ts`: a compiled entry point (`tsconfig.cli.json`,
  CommonJS + bundler-mode resolution so it can still see `@midnight-garage/content`'s
  TS-source `exports` mapping, then run via plain `node` - no new runtime dependency) that runs
  1,000 seeded careers per strategy (now 5 strategies) over 100 days and writes
  `tools/balance/data/careers.csv`.
- [x] **`tools/balance/data/careers.manifest.json`** written alongside it: column names, types,
  the sim version, and the run parameters (strategies, careers-per-strategy, days-per-career).
- [x] `pnpm balance:run` (root and `packages/sim`) wires build + run together. **Not wired into
  CI** - see implementation-time finding 10. Run by hand whenever you want fresh numbers.

### E. Python balance harness (`tools/balance`)

- [x] `src/balance/data.py`: shared `load_careers(data_dir)` - reads the manifest, builds an
  explicit polars dtype schema from it, parses the CSV strictly rather than by inference.
- [x] `src/balance/report.py`: per-strategy cash/car-count distributions (p10/median/p90) at
  checkpoint days (25/40/70/100), rendered as a markdown table to `tools/balance/report.md` and
  printed to stdout. No chart library added - the table itself answers "what does day 40 look
  like for a flipper?" directly; a real chart is easy to add later if wanted, not needed for the
  DoD.
- [x] `src/balance/invariants.py`: the actual assertion set, adapted from the design doc's
  aspirational one once real numbers existed (see findings 1-9 for why): Passive Grinder and
  Flipper solvency baselines, Flipper's day100 divergence from Passive Grinder (moved from day25
  - see the file's own docstring for why day25 didn't hold up at full scale), a sanity floor
  across all 5 strategies, and reported (not gated) day100 numbers for Cautious Restorer,
  Balanced Player, and Random.
- [ ] CI wiring - **deliberately not done this sprint** (finding 10). `.github/workflows/ci.yml`
  is untouched.

### F. First real tuning pass

- [x] Ran the harness repeatedly during implementation (not guessed up front): the valuation
  formula, `sellViaWalkIn`'s buyer selection, starting capital, and Cautious Restorer's tier/
  buffer settings were all corrected against real 1,000-seed output until the invariants passed
  honestly - see implementation-time findings 1-5 for the full story of what changed and why.

## Testing

- [x] Unit tests per new sim module: `valuation.test.ts` (4 tests: purity, tier-fit comparison,
  price-sensitivity direction, non-negative floor), `auctions.test.ts` (9 tests, including the
  Gaisha-exclusion sweep across 50 seeds x 4 tiers), `bidding.test.ts` (6 tests, including the
  purity assertion and the second-price payment cap), `selling.test.ts` (6 tests).
- [x] Bot strategy smoke tests (group C): 11 tests across all 5 strategies (100-day run sanity +
  determinism per strategy) plus a Passive-Grinder-specific "never buys a car" check.
- [x] Schema validation + round-trip tests for the new content types (existing pattern) -
  `Job`/`GameState`/`DayLogEntry` round-trip test extended to cover the 6 new event types.
- [x] The balance harness itself is a test suite (R4's own framing): `python -m balance.cli check`
  against the real 500,000-row (5 strategies x 1,000 seeds x 100 days) run - all 5 invariants
  pass, including the empirical confirmation that Random is the worst-performing strategy of all
  five.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (97 tests, 20 files), `pnpm build`
  all green. `pnpm balance:run` + `python -m balance.cli report` + `python -m balance.cli check`
  all run locally and shown before calling this ready for review.

## Hygiene and docs

- [x] CLAUDE.md's current-state note and Commands section updated (`pnpm balance:run`, the two
  Python commands, and the CI-deferral note).
- [x] `docs/economy-v0.md`'s invariant list updated to reflect decision 3's proxy invariants
  (done at design time) and the starting-cash correction (finding 3, done during implementation).
- [x] Ten implementation-time findings flagged above, plus the two schema/API additions
  (`SimContext` as `advanceDay`'s 4th parameter, `packages/content/src/data.ts`) called out in
  group B rather than left as unannounced scope changes.
- [x] **New: `TODO.md`** (repo root) - deliberately deferred items with no sprint number attached
  (CI wiring, two unchecked economy-v0.md invariants, the spreadsheet-pass open questions, the
  Naming Layer parody-flag decision, and Sprint 00's leftover user-only tasks - Aseprite,
  trademark search, private `IDEAS.md`), so they don't require combing every sprint doc to
  rediscover. Cross-referenced from CLAUDE.md's sprint workflow and Commands section.

## Exit

DoD met **without CI wiring**, which the user deferred by explicit request during review (finding
10) - the invariants pass locally (`python -m balance.cli check`, 5/5), and the report
(`tools/balance/report.md`) answers "day 40, flipper, what's cash and car count look like" with
real numbers from the 5,000-career run. CI wiring (originally group E's last item) is a clean
follow-up whenever the user wants it - nothing else in this sprint depends on it. Commit pending
user approval per the git-safety rule. Sprint 04 (Vue shell & state bridge) is the first sprint
with anything on screen beyond the Sprint 00 art spike - it wires this sim into a real,
clickable loop.
