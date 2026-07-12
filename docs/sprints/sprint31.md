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

- [x] Sim: for-sale flag, daily offer draw in advanceDay, acceptance path reuse, listing
  removal, migration + goldens.
- [x] Content: offer tunables (chance, spread, per-tier desirability).
- [x] Game: offers panel, toggle, day-report lines, copy.
- [x] Balance (partial - Claude's lane only): `offers.csv` sim-side telemetry wired
  (`runCareer.ts`/`exportCareers.ts`), bot accept-threshold policies. Report section, the
  two informational invariants, and the actual `pnpm balance:run` + `python -m balance.cli
  check` re-run are the orchestrator's lane per the task brief (not run/edited here).
- [x] Tests: determinism, expiry, flooding interaction (dumping copies of one model degrades
  offers via existing heat), reputation classification on accept; Exit.

## User-only tasks

- [ ] Read the wait-vs-gain table in the report (once the orchestrator wires and runs it) and
  set the final `offerChance`/`spread` values; playtest whether waiting ever feels correct but
  never feels mandatory.

## Exit

**Every file changed** (one line each):

Content:
- `packages/content/src/sale.ts` - `PublicListingSchema` removed; `ForSaleEntrySchema` +
  `PendingSaleOfferSchema` added; `SaleChannelSchema` trimmed to the single `'walk-in-offer'`
  value.
- `packages/content/src/gameState.ts` - `activeListings` removed, `carsForSale`/
  `pendingOffers` added; `listing-created` DayLogEntry removed, `offer-received` added.
- `packages/content/src/economy.ts` + `packages/content/data/economy.json` - new `selling`
  block (offer-draw tunables); `valuation.listingPatiencePremium` removed (dead once
  `listPubliclyAskingPrice` was deleted).
- `packages/content/src/part.ts` - stale `PublicListingSchema` doc-comment reference fixed.
- `packages/content/tests/gameState.test.ts`, `packages/content/tests/schemas.test.ts` -
  fixtures updated for the new state shape and `selling` config coverage.

Sim:
- `packages/sim/src/constants.ts` - `WALK_IN_OFFER_RANGE` and `PUBLIC_LISTING_WAIT_DAYS`
  removed (moved to content / retired).
- `packages/sim/src/selling.ts` - `listPubliclyAskingPrice`/`resolveListForSale` deleted;
  added `offerChanceFor`, `drawDailyOffers`, `resolveSetForSale`; `resolveSellViaWalkIn` now
  consumes today's pre-rolled `pendingOffers` entry instead of rolling one on click.
- `packages/sim/src/actions.ts` - `sellViaWalkIn`/`listForSale` DayActions replaced by
  `acceptOffers`/`setForSale`.
- `packages/sim/src/advanceDay.ts` - listing-creation/resolution steps removed; new
  for-sale-toggle, offer-accept, and daily-offer-draw steps added; steps renumbered.
- `packages/sim/src/newGame.ts` - day-1 state seeds `carsForSale`/`pendingOffers` as `[]`.
- `packages/sim/src/parts.ts` - two stale doc-comment references to the old listing
  resolve-loop fixed.
- `packages/sim/src/bots/sellingHelpers.ts` (new) - `decideSale`, the shared accept-threshold
  policy every bot now calls.
- `packages/sim/src/bots/{flipper,handyman,investor,balancedPlayer,randomStrategy,
  cautiousRestorer,competentPolicy}.ts` - instant-sell/list-publicly branches replaced by
  `decideSale` calls with each archetype's own threshold.
- `packages/sim/src/bots/runCareer.ts` - `OfferSample` telemetry (episode tracking, offer
  finalization on accept/replace/career-end).
- `packages/sim/src/cli/exportCareers.ts` - `offers.csv` + manifest wiring.
- Sim tests: `actions.test.ts`, `advanceDay.test.ts`, `auctions.test.ts`, `bidding.test.ts`,
  `buyoutHelpers.test.ts`, `calendar.test.ts`, `finances.test.ts`, `jobs.test.ts`,
  `laborSlots.test.ts`, `marketHeat.test.ts`, `parts.test.ts`, `selling.test.ts`,
  `stagedWork.test.ts`, `valueModelProbes.test.ts` - fixture updates; `selling.test.ts` and
  `advanceDay.test.ts` gained the new offer-stream test coverage (see below).

Save:
- `packages/game/src/save/saveCodec.ts` - `SAVE_VERSION` 19 -> 20, `migrateV19ToV20`.
- `packages/game/src/save/saveCodec.test.ts` - v19->v20 goldens, golden-v7 cash re-check,
  round-trip test swapped from a listing to a for-sale/offer fixture, stray `SAVE_VERSION`
  canary bumped to 20.

Game:
- `packages/game/src/stores/gameStore.ts` - `activeListings`/`listingEstimate`/`sellWalkIn`/
  `listForSale` removed; added `isForSale`, `offerFor`, `pendingOffersView`, `buyerName`,
  `acceptOffer`, `setForSale`; `walkInEstimate` renamed `estimatedSaleValue` (still a ballpark
  preview, no longer tied to an instant-sell mechanic).
- `packages/game/src/utils/offerCopy.ts` (new) - the one canonical "A tuner is offering ...
  Today only." sentence builder, shared by the day-report line and the live offers panel.
- `packages/game/src/utils/dayLogFormat.ts` - `listing-created` case removed, `offer-received`
  case added (via `offerCopy`); `describeLogEntry` gained a `resolveBuyerName` parameter.
- `packages/game/src/screens/CarDetailScreen.vue` - old walk-in/list-publicly buttons replaced
  by the for-sale toggle + live offer card.
- `packages/game/src/screens/GarageScreen.vue` - the "Listings" panel replaced by an "Offers"
  panel (every live offer across owned cars, with an Accept button).
- `packages/game/src/components/DayReport.vue` - passes `game.buyerName` as the new resolver.
- Game tests: `gameStore.market.test.ts`, `gameStore.stagedWork.test.ts`,
  `gameStore.save.test.ts`, `dayLogFormat.test.ts` - rewritten/updated for the new mechanic.

**Listings grep-clean confirmation:** a repo-wide grep for `PublicListing`, `activeListings`,
`listPubliclyAskingPrice`, `resolveListForSale`, `WALK_IN_OFFER_RANGE`,
`PUBLIC_LISTING_WAIT_DAYS`, `listingEstimate`, `walkInEstimate`, `listing-created`, and
`list-publicly` turns up only: (a) `saveCodec.ts`'s `migrateV19ToV20` itself and its tests,
which legitimately read the OLD field name from old save payloads (that is the migration's
job), and (b) historical/explanatory doc comments describing what was removed and why. No
runtime code path outside the migration reads or writes the old shape.

**Offer tunables chosen** (`packages/content/data/economy.json`'s new `selling` block -
maintainer-tuning bait per the sprint brief):
- `offerChanceBase: 0.65` (decision 2's own proposed value).
- `offerChanceByTier`: shitbox 1.1, common 1.05, uncommon 0.9, rare 0.75, gaisha 0.6,
  legend 0.45 - rarer cars get looked at less often, independent of whether any buyer
  archetype is even interested at all (that gate is separate, unchanged).
- `heatBandColdBelowPercent: 90`, `heatBandHotAtOrAbovePercent: 110`,
  `offerChanceByHeatBand`: cold 0.75, normal 1.0, hot 1.3.
- `offerSpread: [0.82, 1.12]` - decision 2's locked value, replacing the old
  `WALK_IN_OFFER_RANGE` sim constant `[0.85, 1.1]`.
- Bot accept-thresholds (`sellingHelpers.ts`'s `SellDecisionOptions`, per bot):
  flipper 0/0 days (take the first offer, no patience); handyman/investor/balanced-player/
  random-mid 0.85 / 12 days; cautious-restorer/random-restore 0.95 / 20 days;
  competent-policy 0.9 / 15 days (its own distinct measurement-probe constants, per the
  sprint doc's own instruction not to silently share cautious-restorer's).

**v19 -> v20 migration approach:** `migrateV19ToV20` resolves every `activeListings` entry
instantly at its own already-locked `askingPriceYen`, crediting the cash - the "least player
harm" rule from the sprint brief: a pending listing represents real money the player was
always going to get, just paid out now instead of on the original `resolvesOnDay`. The listed
car itself needs no reinsertion anywhere: under the pre-v20 model it already left `ownedCars`
the instant it was listed, so there's no car object to restore, only proceeds. `carsForSale`/
`pendingOffers` need no reconstruction - a pre-v20 save's owned cars were never mid-offer
under a mechanic that didn't exist yet, so both default-fill to `[]` correctly via the schema.
Three new goldens cover it: a single pending listing, zero listings, and two listings summed.

**No-reflex rule:** an offer is drawn once per day (advanceDay's new step 7a2,
`drawDailyOffers`) for the day about to begin, and the WHOLE `pendingOffers` array is replaced
(not merged) every time that step runs - so anything left unaccepted from the day that just
ended is gone the instant the next day starts, never resolved by a timer or mid-screen. Accept
happens only via an explicit player click (`gameStore.ts`'s `acceptOffer`) or a bot's queued
`acceptOffers` action, both processed BEFORE that day's own offer-draw step, so "today's
offer" and "tomorrow's freshly-drawn offer" never collide.

**`offers.csv` columns** (`packages/sim/src/cli/exportCareers.ts`'s `OFFERS_COLUMNS`, sim-side
telemetry from `runCareer.ts`'s new `OfferSample`) - for the orchestrator to wire the report
section against:
- `strategy` (string), `seed` (int64)
- `carEpisodeId` (int64) - a synthetic per-career counter, NOT the real game car id; group by
  `(strategy, seed, carEpisodeId)` to reconstruct one car's full day-by-day offer history
  (median days-to-sell, "beat the first offer by 10% within 5 days").
- `day` (int64) - the day the offer was actually live.
- `tier` (string) - the car's `RarityTier`.
- `offerYen` (int64), `valueYen` (int64) - the raw offer and the best-fit buyer's own
  valuation it was rolled against (so `offerYen / valueYen` reconstructs the ratio without a
  second lookup).
- `accepted` (bool) - true only for the exact offer that was taken; a later, different offer
  on the same car is its own separate row.

**Re-pinned golden hashes** (both re-run and read, not hand-computed):
- `advanceDay.test.ts` scripted 30-day career: `3d7df487` -> `7a45a1e3` (pure state-shape
  change - this career never toggles a car for sale).
- `advanceDay.test.ts` acquisition-and-sale career: `814c2416` -> `7f80a371` (shape change
  plus a genuinely different playthrough: `acquisitionCareer` now plays the real
  setForSale -> wait -> acceptOffers flow instead of an instant `sellViaWalkIn` action).
- `saveCodec.test.ts`'s stray `expect(SAVE_VERSION).toBe(19)` canary (inside an unrelated
  v17 per-part round-trip test) bumped to `20`.

**Final gate summary** (all re-run after every fix, not just once):
- `pnpm typecheck` - `content`/`sim`/`game` all "Done", zero errors.
- `pnpm lint` - clean, zero findings.
- `pnpm format` - clean after one `format:fix` pass (Prettier's own line-wrapping on the new
  files/edits).
- `pnpm test` - **69 test files, 712 tests, all passing.**
- `pnpm test:coverage` - all passing, coverage well above the ratchet floor (89.56%
  statements / 78.2% branches / 91.06% functions / 93.43% lines against the 80/65/78/82
  gate).

**Left for the orchestrator / flagged:**
- Balance: `pnpm balance:run` + `python -m balance.cli report`/`check` re-run; wiring the
  `offers.csv` report section (median days-to-sell for Commons, "beat first offer by 10%
  within 5 days" distribution) and the two new informational invariants into
  `tools/balance/**`; pasting the resulting deltas and wait-vs-gain table into this Exit
  section, per the task brief's own division of labor.
- Design question for the maintainer: the bot accept-threshold values above (0/0.85/0.95/0.9,
  holding-day caps 0/12/20/15) are a first defensible pass, not measured - exactly the "user
  tunes after reading the wait-vs-gain table" step this sprint's own User-only task names.
  competent-policy's 0.9/15 in particular is meant as the tuning dial for note 16's core
  question and should move first once real numbers exist.

### Balance verification (orchestrator-run)

`pnpm balance:run` + `check`: **all hard invariants PASS.** The offer-stream selling is a clear
win on the sell side, Flipper recovered from Sprint 30's -Y115,178 (below Passive) to
**+Y158,342 above Passive** (bots wait for a good offer via the accept-threshold policy instead
of dumping instantly). Days-to-`local` p50=23 (stable), sanity floor healthy (balanced-player
Y1,507,207). The auction-tails "94% steal" number persists (steal 93.1 / mid 1.1 / frenzy 5.8)
- that is the carried-forward Sprint 30 buy-side tuning flag, unchanged and untouched by this
sell-side sprint, not a Sprint 31 regression. `report.md` re-rendered.

The DoD's `offers.csv` report section + the two informational selling invariants (median
days-to-sell for Commons; P(beat first offer by 10% within 5 days)) are deferred, with Sprint
30's auction telemetry render, to a single consolidated balance-tooling follow-up at the start
of the maintainer's playtest tuning phase (the sim-side `offers.csv` data is captured and
committed; only the Python rendering is deferred).
