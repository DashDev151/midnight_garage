# Sprint 11 - Instant actions, a real content-authoring system, and round-2 playtest fixes

*Source: the maintainer's second direct playtest pass (after Sprint 10 shipped), nine numbered notes,
combined with the already-planned "Sprint 11: instant action resolution" from `TODO.md`. Status:
**implemented, ready for review.***

## Goal

Two things land together because they're the same underlying problem: the game still makes the
player wait until End Day to find out what happened, and the content model can't scale past a
handful of hand-paired customer lines. This sprint removes both frictions, plus fixes four concrete
bugs the second playtest found (three of them introduced by Sprint 10's own work - called out
honestly below, not glossed over).

## Reuse analysis (directive 15 - read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Instant-action pattern | `moveCar` / `applyBayPurchase` / `resolveServiceJob` (Sprint 08/09): a pure resolver core the store calls directly on click AND `advanceDay` calls in a loop for bots' queued actions | **The template for every new instant resolver this sprint.** Nine actions currently trapped behind `pending`/`commitDay` (repair, install, inspect, bid, buyout, buy part, accept service job, sell walk-in, list for sale) each get the identical shape - one pure function, two call sites. |
| Job/labor core | `createJob`, `applyLaborToJob`, `isJobComplete`, `completeJob` (`jobs.ts`) | **Fully reused, untouched.** Repair/install becoming instant is a wiring change (who calls these and when), not a rewrite - these four functions already do exactly what's needed. |
| Auction resolution | `resolveAuction`, `computeLotInterest`, `buildRivalField` (`bidding.ts`) | **Untouched, and already instant-capable.** `buildRivalField` is seeded purely on `lot.id`, never on the day or a bid's timing - resolving a bid or buyout the instant it's placed produces an *identical* outcome to resolving it at End Day. Nothing about the auction math needs to change to make bidding instant. |
| Tier-interest gate | `interestedBuyers` (`bidding.ts`, Sprint 10): explicit `tierPreferences` entry required, no default fallback | **Extended to the sell side.** Exported and reused by `sellViaWalkIn`/`listPubliclyAskingPrice`/`bestFitBuyer` instead of building a second gate - the auction fix and the sell-side fix are the same rule, applied in the second place it was missing. |
| Selling formulas | `sellViaWalkIn`, `listPubliclyAskingPrice` (`selling.ts`) | **Formulas untouched** - only the buyer *pool* they draw from changes (gated, not every buyer). |
| Parking/service-bay accounting | `parkingOccupancy`, `hasParkingSpace`, `releaseCarFromServiceBay` (`facilities.ts`) | **Reused as-is** by the new swap function and by every newly-instant action that moves a car in or out of the shop. |
| Day-boundary effects | Weekly rent/wages, market-heat drift, catalog refresh, auction/offer expiry, service-job deadline backstop - all already isolated, ordered steps inside `advanceDay` | **Reused verbatim**, just relocated: `advanceDay` shrinks to *only* these steps (see decision 1) plus resolving bots' batched `DayActions` through the same new instant resolvers. |
| Feedback-modal precedent | `JobCompleteModal.vue` (Sprint 10): overlay + store ref + dismiss button, mirroring `DayReport.vue` | **Reused for the new instant bid/buyout result** - same shape, new content, not a new UI pattern. |
| Service-job data model | `work: ServiceJobWorkSchema` discriminated union (repair zone / install slot); `ServiceJobSchema` (the *generated* offer) | **Untouched.** Only *how a template becomes an offer* changes (decision 5) - the generated `ServiceJob` shape stays identical, so nothing downstream (accept, resolve, complete, the UI) needs to change for this piece. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **A live, persisted daily labor counter.** Today "how much labor is left today" exists nowhere in
   `GameState` - it's computed transiently by the store's `planActions()` from the ephemeral `pending`
   queue at commit time. Once repair/install/inspect resolve instantly and independently, the *state*
   itself needs to know how much labor has already been spent today so the next click can be validated
   against what's left. New field: `laborSlotsSpentToday`.
2. **A swap primitive.** `moveCar` requires a free slot at the destination; there is no existing
   operation that exchanges two cars' locations atomically. Needed because a shop that's exactly full
   (services + parking = total shop cars, zero slack) can legitimately happen and currently soft-locks.
3. **A service-job type + flavor-pool catalog.** The current model is one baked
   `{customerName, description, work, payoutYen, baseReputation}` template per offer - 8 hand-paired
   instances, already missing 7 of the 12 possible zone/slot combinations (no drivetrain repair; no
   engine/forcedInduction/bodyAero installs), and structurally guaranteed to keep producing
   flavor-vs-work mismatches like #6 below, because nothing ties a description's *words* to its
   `work` field except the content author's memory. Replaced by a small catalog - one entry per job
   *type* (repair-zone × 5, install-slot × 7), each carrying a pool of flavor lines that are safe by
   construction (authored for that type, never shared across types) plus its own payout range and
   base reputation. Customer names become their own independent pool. Generation composes: pick a
   type, pick a name, pick a flavor line, roll a payout in range.
4. **Recalibrated interest-level thresholds** (quiet/warm/hot/frenzy) - not a new mechanism, but the
   existing `computeLotInterest` thresholds were never re-tuned for Sprint 10's new average field size
   (~6.2, up from a hard max of 5), so "frenzy" (`contenders > 5`) now fires on roughly half of every
   auction. Pure constant-tuning, called out explicitly since it's an honest miss in Sprint 10's own
   work, not something round-2 playtesting revealed as new.

## Definition of Done

- **No action waits for End Day except things that are genuinely multi-day** (a public listing's
  wait, a job needing more labor than today's budget, an auction lot/service offer's own expiry).
  Repair, install, inspect, bid, buyout, buy part, accept a service job, sell walk-in, and create a
  listing all resolve the instant they're clicked.
- **End Day is purely a day-boundary tick**: labor resets to full, weekly rent/wages and market-heat
  drift fire on the 7-day boundary, auction/offer expiry + weekly catalog refresh happen, the service-
  job deadline backstop runs, the day increments. No player action is *decided* there anymore.
- **Bidding and buyout give immediate win/lose feedback** - no more "bid queued, find out tomorrow."
- **Inspecting a lot reveals its hidden issues immediately**, and no longer spends a labor slot (just
  the existing cash travel fee) - playtest's own read: labor is the tightest resource in the game,
  and spending it on a look-before-you-buy action was never worth it once labor became this scarce.
- **A full shop (services + parking exactly at capacity) is never a soft-lock** - a swap always frees
  up a move, even with zero slack anywhere.
- **The "feeding frenzy" badge is genuinely rare again** - recalibrated so its trigger rate roughly
  matches the *actual* frenzy win-price bucket target (5-10%), not ~50% of all lots.
- **Walk-in offers and public listings only ever come from a buyer archetype that's actually
  interested in the car's tier** - no more a collector making an offer on a shitbox - and the
  "slow, market price" listing channel is no longer structurally worse than the "fast, convenience"
  walk-in channel (GDD 6.3's stated design intent, currently inverted).
- **Service-job offers are generated from a job-type + flavor-pool catalog**, not fixed 1:1 templates
  - every repair zone and install slot can appear (12 types, not 8 incomplete ones), each with several
  flavor variants, and a flavor line can never be paired with a `work` it wasn't written for.
- **Save law honored**: `laborSlotsSpentToday` is additive → `SAVE_VERSION` 3 → 4, migration, golden-
  save test, same PR.
- All checks green; new/updated tests cover every fix above; both `advanceDay.test.ts` golden masters
  re-pinned (this sprint's `advanceDay` shape changes completely, so expect it).

## Decisions (approve / adjust before implementation)

1. **`advanceDay` shrinks to a day-boundary tick.** Everything currently resolved inline in
   `advanceDay` for a *player-originated* action moves into a standalone pure resolver function next
   to its existing domain logic (`jobs.ts`, `auctions.ts`, `bidding.ts`, `selling.ts`, `serviceJobs.ts`).
   `advanceDay` keeps calling these same resolvers, in a loop, for **bots' queued `DayActions`** -
   bots still decide once per day-tick (they're headless, they can't click), so the batch-resolution
   need doesn't go away, it just now shares code with the instant path instead of duplicating it (the
   exact pattern step 0 already established for `moveCars`/`buyBays`). What's left inside `advanceDay`
   itself: labor reset, weekly rent/wages, market-heat drift, catalog refresh + expiry, the service-job
   deadline backstop, day increment.

2. **Repair/install: a click spends whatever labor is available right now, up to what the job needs.**
   Clicking "repair suspension" on a car with no open job for that zone creates one and immediately
   applies `min(remaining labor today, slots required)`. If that finishes it, the effect applies
   instantly (zone → 100 / part installed) exactly like today's End-Day completion. If it doesn't,
   the job sits open at partial progress - clicking the **same button again** (today or tomorrow) adds
   more labor to the **existing** job rather than creating a duplicate. No separate "add labor"
   control; the repair/install button already shown on the car detail screen becomes idempotent.
   Labor itself doesn't carry over - unspent slots are lost at day's end, same as today.

3. **Bid and buyout resolve instantly with a result surfaced inline on `AuctionScreen`**, not a modal.
   A modal per bid would get noisy if a player is bidding on several lots in one visit; the lot's own
   card is the natural place to show "you won at ¥X" / "lost to ¥X" the instant it happens - replacing
   today's "bid ¥X queued" text with the real outcome. (Contrast with job completion, which stays a
   modal - it's a rarer, heavier event with real numbers worth pausing on.)

4. **Inspect drops its labor cost, keeps its cash travel fee.** Per the maintainer's explicit read:
   labor is the tightest resource, and gating a look-before-you-buy action behind it wasn't
   contributing tension, just friction. `AUCTION_TRAVEL_FEE_YEN` (cash) stays as the real cost of
   inspecting.

5. **Service-job generation moves to a job-type + flavor-pool catalog.** New content shape (replacing
   `ServiceJobTemplateSchema`'s 8 fixed entries):
   ```
   ServiceJobTypeSchema: { work: ServiceJobWorkSchema, payoutRangeYen: [min, max],
                            baseReputation: number, flavorPool: string[] (min 2) }
   ```
   plus a flat `SERVICE_JOB_CUSTOMER_NAMES: string[]` pool, decoupled entirely from job type (a name
   has nothing to do with what's broken). One catalog entry per repair zone (5: engine, drivetrain,
   suspension, body, interior) and per install slot (7: engine, forcedInduction, drivetrain,
   suspension, brakes, bodyAero, wheelsInterior) - 12 types total, each seeded with 3-4 flavor lines
   (drivetrain repair and most installs have none today; this sprint writes them). `generateServiceJobOffers`
   picks a type, a name, and a flavor line independently (each `rng.pick`), then rolls a payout in the
   type's range - composing an offer instead of copying a template wholesale. This can never reproduce
   #6's bug class: a flavor line lives *only* in the pool of the type it was written for.

6. **Swap is a new, explicit `swapCars(state, serviceCarId, parkingCarId)` core.** Atomically
   exchanges a service-bay car and a parking car's positions - the two moves that individually fail
   the capacity check (each needs a free destination slot) succeed together because the *net* change
   in each location is zero. Surfaced on `GarageScreen`: when a direct move is illegal because the
   destination is full, the move control offers "swap with..." against the other side's cars instead
   of just disabling.

7. **Interest-level thresholds recalibrated against the real field-size distribution**, not
   re-derived from scratch. Average field size is confirmed ~6.2 (real harness data, `TODO.md`).
   Empirically measured via a 2,000-sample probe of `computeLotInterest`'s own `contenders`
   distribution on a broadly-wanted tier (not just eyeballed): thresholds land at `quiet: 0`,
   `warm: <=3`, `hot: <=11`, `frenzy: >11` - `contenders > 11` measured at ~7% of lots, squarely in
   the 5-10% economic frenzy target (same calibration discipline as Sprint 10 decision 4f).

## Task breakdown

### A. Content (`packages/content`)

- [x] Replace `data/serviceJobs.json`'s 8 fixed templates with the job-type + flavor-pool catalog
  (decision 5): 12 types (5 repair zones + 7 install slots), 3-4 flavor lines each, payout ranges
  scaled roughly to today's numbers per zone/slot. New `data/serviceJobCustomerNames.json` (or inline
  array) for the name pool.
- [x] `ServiceJobTemplateSchema` → `ServiceJobTypeSchema` in `serviceJob.ts` (payoutYen → payoutRangeYen
  tuple, description → flavorPool array). `ServiceJobSchema` (the generated offer) is unchanged
  (only its `templateId` field renamed to `typeId`).

### B. Sim (`packages/sim`)

- [x] `gameState.ts`: add `laborSlotsSpentToday: z.number().int().nonnegative().default(0)`.
- [x] New instant resolver functions, one per currently-queued action, living next to their existing
  domain logic:
  - `jobs.ts`: `findOrCreateJob` + `applyAvailableLaborToJob` (the shared single-job core, reused by
    both the instant path and `advanceDay`'s bot batch loop) composed into `resolveJobLabor(state,
    spec, laborAvailable) -> {state, log, laborSlotsUsed}` - find-or-create the job, apply available
    labor, complete if done.
  - `auctions.ts`: `resolveInspectLot(state, lotId) -> {state, log}`.
  - `bidding.ts`: `resolveBidInstant`/`resolveBuyoutInstant`, adding the cash/car/parking-space/log
    side effects `advanceDay` used to do inline around `resolveAuction`/buyout math.
  - `selling.ts`: `resolveSellViaWalkIn`/`resolveListForSale` instant wrappers.
  - `serviceJobs.ts`: `resolveAcceptServiceJob` instant wrapper (parking-space check, deadline stamp).
  - `parts.ts` (new file): `resolveBuyPart` instant resolver.
- [x] `bidding.ts` / `selling.ts`: exported and reused `interestedBuyers` so `sellViaWalkIn`,
  `listPubliclyAskingPrice`, and `bestFitBuyer` all filter to a genuinely-interested buyer pool - no
  more `DEFAULT_TIER_PREFERENCE_WEIGHT` fallback on the sell side.
- [x] `facilities.ts`: new `swapCars(state, serviceCarId, parkingCarId)`.
- [x] `bidding.ts`: recalibrated `computeLotInterest`'s level thresholds (decision 7); verified against
  a real 2,000-sample probe, landing "frenzy" at ~7%.
- [x] Dropped the labor cost from inspection (decision 4) - there was never a standalone constant for
  it (the old "1 slot" cost was implicit in `advanceDay`'s/the store's inline logic), so this was
  simply not reintroduced when writing `resolveInspectLot`.
- [x] `serviceJobs.ts`: rewrote `generateServiceJobOffers` to compose from the type/name/flavor pools
  instead of picking a whole template.
- [x] `advanceDay.ts`: stripped down to the day-boundary steps + a loop over each queued action type
  calling the new instant resolvers (mirrors the existing step-0 `moveCars`/`buyBays` pattern). Job
  *creation* for bots keeps its own `job-${day}-${i}` id scheme (unchanged) since bots predict ids
  within one tick - deliberately not unified with the player's car+zone/slot-derived scheme (see the
  new comment in `advanceDay.ts`'s step 1).
- [x] Golden masters: re-pinned both `advanceDay.test.ts` hashes (the function's shape changed
  completely).

### C. Game (`packages/game`)

- [x] `gameStore.ts`: removed `pending`/`planActions`/`commitDay`; every `queueX` became an instant
  `resolveX`-backed method (`repair`, `install`, `inspectLot`, `placeBid`, `buyout`, `buyPart`,
  `acceptServiceJob`, `sellWalkIn`, `listForSale`, `swapCars`) - same shape as existing `moveCar`/
  `buyBay`. `endDay()` is now the only day-advance entry point for the player (bots keep passing a
  full `DayActions` batch via `runCareer`, unchanged). New `laborSlotsRemainingToday` computed from
  `gameState.laborSlotsSpentToday`.
- [x] `AuctionScreen.vue`: bid shows an inline instant result (won/lost/no-sale, decision 3); buyout
  and inspect resolve instantly with no queued state; inspect shows no labor cost.
- [x] `ServiceJobsScreen.vue`: accept is instant - the car appears in the shop immediately, removed the
  now-superseded "queued - arrives after End Day" label from Sprint 10.
- [x] `CarDetailScreen.vue`: repair/install buttons resolve instantly; the same button re-applies labor
  to an existing open job (decision 2) or shows "Continue repair"/"installing…"; the old
  queued-vs-in-progress job split collapsed into one live `jobs` list.
- [x] `PartsMarketScreen.vue`: buy resolves instantly.
- [x] `GarageScreen.vue`: a swap affordance ("swap with…" picker) appears whenever a direct move would
  be illegal (decision 6), plus a shop-at-capacity banner.
- [x] `DayReport.vue`: unchanged - it already renders whatever's in `lastDayReport.entries` generically
  via `describeLogEntry`, so it naturally shows less now that most log entry types fire at click-time.

### D. Testing

- [x] Sim: one test file/block per new instant resolver (creates-or-continues a job correctly,
  parking/capacity gates still apply, log entries match) - `jobs.test.ts` (`findOrCreateJob`/
  `applyAvailableLaborToJob`/`resolveJobLabor`), `auctions.test.ts` (`resolveInspectLot`),
  `bidding.test.ts` (`resolveBidInstant`/`resolveBuyoutInstant`), `selling.test.ts`
  (`resolveSellViaWalkIn`/`resolveListForSale`), `serviceJobs.test.ts` (`resolveAcceptServiceJob`), new
  `parts.test.ts` (`resolveBuyPart`); `facilities.test.ts` (`swapCars` - succeeds when a direct move
  wouldn't, no-ops on invalid pairs, preserves total occupancy); recalibrated interest-level thresholds
  (statistical, matching Sprint 10's calibration test style - a direct frenzy-rarity regression);
  sell-side buyer gate (a collector never appears as the walk-in buyer, or contributes to the listing
  average, for a shitbox).
- [x] Content: the new job-type catalog validates; a new `integrity.test.ts` regression (mirroring
  Sprint 10's `naming.test.ts` car-name-leak check) confirms no repair-zone flavor pool names a
  *different* zone or "brakes" - the structural guard against Sprint 10's own bug class recurring.
- [x] Store/component: instant resolution end-to-end for each converted action, across
  `gameStore.garage.test.ts`, `gameStore.jobs.test.ts`, `gameStore.market.test.ts`,
  `AuctionScreen.test.ts`, `ServiceJobsScreen.test.ts`, `PartsMarketScreen.test.ts`.
- [x] Save: golden-save test updated for `SAVE_VERSION` 4 (a new pinned v3 code + v1/v2 codes all
  asserting `laborSlotsSpentToday` default-fills to 0).

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies.

**User-only:** play a fresh career - confirm repair/install/inspect/bid/buyout/sell/accept all feel
instant and legible, the frenzy badge reads as rare again, walk-in vs. listing feels right, and the
new flavor-pool variety doesn't feel repetitive at typical playtest volume.

## Exit

This sprint doesn't add new systems - it finishes moving the game off the "queue everything, resolve
at End Day" scaffold that made sense for a batch-simulation prototype but reads as broken now that the
game is meant to be played turn-by-turn, click-by-click. The content-authoring fix (job types +
flavor pools) is what makes service jobs actually scale past a handful of hand-paired lines. Staff
(#9) and the parts-market cart/checkout overhaul (#7) stay out of scope - already tracked as their own
future sprints in `TODO.md`.
