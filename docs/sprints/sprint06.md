# Sprint 06 - Auction & market screens

*Source: roadmap Phase 2 (Ugly MVP), Sprint 6: "Auction & market screens: catalog, inspection, live
bid escalation, mail/rumors, sell flow with buyer offers." Builds on Sprint 04's shell and Sprint
05's garage. GDD 6.1-6.6 (economy, buyers, auctions, failure pressure), 4.5 (imports). Status:
**implemented and locally verified - ready for review.***

## Goal

Supply the other half of the loop: **buy** cars at auction and **sell** them to buyers, plus a lean
**parts market** so the build half from Sprint 05 has something to install. After this sprint the
full buy -> build -> sell arc is playable end to end (the *persistence* that makes it a durable game
is Sprint 07). Like Sprint 05, most of this is wiring an already-built, already-tested sim to
screens - auctions, second-price bidding, the sliding-scale lemon rule, and both sell channels all
shipped and unit-tested in Sprint 03. The one genuinely new mechanic is buying parts.

## Definition of Done

- An auction screen lists the current catalog grouped by tier (`activeAuctionLots`), shows each
  lot's book value, reserve, travel/inspection fees, and inspection state, and lets the player
  **inspect** a lot (reveals hidden issues, costs a labor slot + travel fee) and place a **max bid**.
- End Day resolves bids through the existing second-price `resolveAuction`; a won lot becomes an
  owned car (with the lemon rule applied at handover), a lost one reports the clearing price.
- The car-detail screen gains a **sell flow**: sell via walk-in (shows the estimated buyer offer,
  resolves same day) or list publicly (shows asking price, resolves after the wait). Active listings
  are visible.
- A **parts market** screen lists catalog parts (with compatibility hints for owned cars) and lets
  the player buy one into inventory; End Day completes the purchase. The Sprint 05 install flow then
  puts it on a car.
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm build` all green; new sim + store
  + component tests pass, with the golden-master re-pinned only if the additive `buyParts` step
  legitimately changes it (it should not - empty by default).

## Decisions (surface the scope call first)

1. **Scope: cars AND a lean parts market, together - with parts as the split-valve.** The roadmap
   pairs auctions and market, and the build loop is hollow without a way to acquire parts (Sprint 05
   installs only dev-granted ones). So this sprint does both, but keeps parts deliberately minimal:
   an **instant catalog buy** (pay yen -> part in inventory), no lead times, no delivery, no scouts
   (that richer layer is Sprint 16). If the sprint runs heavy, the parts market is the clean thing to
   split into a fast follow - it's isolated behind one new action and one screen. **Recommendation:
   include it; it's small and it's what makes the whole loop satisfying.** (This is the decision to
   veto or trim if you'd rather Sprint 06 be cars-only.)
2. **"Live bid escalation" is a Sprint 12 juice item, not this sprint.** The sim resolves auctions as
   a second-price sealed-bid in one deterministic step (Sprint 03 decision 4) - there is no real
   time to escalate through. Sprint 06 does the honest version: set a max bid, End Day, see
   won/lost + the final price (often below your max - the "I stole it" moment). The animated
   ticking-up reveal is pure presentation and belongs with the other juice in Sprint 12.
3. **"Mail/rumors" deferred.** It needs a notification/events substrate that doesn't exist yet
   (market-heat spikes from magazine features etc. are Sprint 15). Flagged, not built; logged so the
   roadmap line isn't silently dropped.
4. **`newGame` stays untouched - no seeded starting catalog.** Seeding an initial catalog on new game
   would change what the balance-harness bots see on day 1 and shift every career result. Not worth
   it. The first catalog arrives on the first weekly refresh; the auction screen shows a "next
   catalog in N days" empty state until then (and the dev console can warp days). This keeps the sim
   deterministic and the harness numbers stable.
5. **The sell flow lives on the existing car-detail screen, not a new screen.** Selling a car is a
   car-detail action (like repair/install); folding it there is DRY and keeps the player where the
   car is. Active listings get a small panel on the garage hub.
6. **`buyParts` goes through `advanceDay` like every other action** (turn-based, deterministic,
   save-safe) - queue a buy, it completes on End Day. Consequence: buy one turn, install the next
   (the install job can't reference a part-instance id that doesn't exist yet). Acceptable for a
   turn-based game; noted so it's a designed cadence, not a surprise.

## Task breakdown

### A. Sim: the one new mechanic - buying parts (`packages/sim`, `packages/content`)

- [x] `content/gameState.ts`: add a `part-bought` `DayLogEntry` (partId, partInstanceId, priceYen).
  Extend the round-trip test to cover it.
- [x] `sim/actions.ts`: add `buyParts: z.array(z.object({ partId }))` to `DayActionsSchema`
  (defaults `[]`, so existing behavior and the golden-master are unchanged).
- [x] `sim/advanceDay.ts`: resolve `buyParts` early in the tick - for each, look up the catalog
  price; if cash covers it, deduct and append a fresh `PartInstance` (deterministic id
  `part-${day}-${i}`, conditionPercent 100, genuinePeriod false) to `partInventory`, logging
  `part-bought`. Skip silently if unaffordable (UI prevents it).
- [x] Re-run the golden-master; re-pin only if it legitimately moved (it should not).

### B. Store: generalize the pending plan (`packages/game/src/stores`)

- [x] Replaced Sprint 05's `pendingJobs`-only model with a full pending `DayActions` (`pending`):
  `createJobs`, `bidsOnLots`, `inspectLots`, `sellViaWalkIn`, `listForSale`, `buyParts`.
  `planActions()` assembles them + auto-planned labor (inspections eat a slot each first, matching
  `advanceDay`'s order). `pendingJobs` stays as a computed for the Sprint-05 car-detail flow;
  `clearPending()` resets the whole plan (a per-index `cancelPending` was dropped - no UI needed it).
- [x] Selectors: `auctionLotsByTier`, `lotDetail(lotId)` (lot + model + book/reserve/fees + resolved
  hidden issues if inspected), `activeListings`, `walkInEstimate(carId)` (best-fit buyer + estimated
  offer via `valuateCarForBuyer`), `listingEstimate(carId)`.
- [x] Actions: `queueInspect(lotId)`, `queueBid(lotId, maxBidYen)`, `queueBuyPart(partId)`,
  `queueSellWalkIn(carId)`, `queueListForSale(carId, waitDays?)`, each with affordability/eligibility
  guards.

### C. Auction screen (`packages/game/src/screens`)

- [x] `AuctionScreen.vue` at `/auctions`: catalog grouped by tier (Gaisha absent by design;
  collector-network shown only when rep-gated in), each lot showing book value, reserve (40% of
  book), travel + inspection fees, inspection state and - once inspected - its revealed hidden
  issues. Controls: inspect (labor + fee) and set-max-bid. Empty state: "next catalog in N days."

### D. Sell flow + listings (`packages/game/src/screens`)

- [x] Extend `CarDetailScreen.vue`: a Sell section - walk-in (shows the estimated buyer archetype +
  offer, "sell now") and list-publicly (shows asking price + wait, "list"). Queue the matching
  action; End Day resolves it.
- [x] Garage hub: a small "Listings" panel showing active `PublicListing`s (asking price,
  resolves-on-day). **Note:** `PublicListing` carries no `modelId`, and the car leaves `ownedCars`
  the moment it's listed, so the panel shows a generic "Listed car" label rather than the model name
  - adding `modelId` to the listing schema is a small future nicety (flagged, not done).

### E. Parts market screen (`packages/game/src/screens`)

- [x] `PartsMarketScreen.vue` at `/parts`: catalog list (brand, name, slot, grade, price, stat
  modifiers), with a compatibility hint against owned cars, and a Buy control (queues `buyParts`,
  guarded by cash). Kept intentionally lean (decision 1).

### F. Shell wiring

- [x] Router: `/auctions`, `/parts` routes (lazy-loaded, memory history). Nav links in `App.vue`.
- [x] Dev console: a "grant reputation" bump is *not* added (rep has no mechanic yet); the existing
  give-cash/grant-car/warp cover what's needed to exercise these screens.

### G. Testing (`packages/game`, `packages/sim`, `packages/content`)

- [x] Sim: `buyParts` resolves - cash deducted, a `PartInstance` added, `part-bought` logged; an
  unaffordable buy is a no-op. Golden-master unchanged (regression guard).
- [x] Content: round-trip covers `part-bought`.
- [x] Store (outcome-asserting): a queued+committed bid at/above market wins the lot and it becomes
  an owned car; a walk-in sell removes the car and adds cash; a listing appears then resolves after
  the wait; a queued part buy lands in inventory and is then installable via the Sprint 05 flow.
- [x] Component (mounted): auction screen renders lots by tier and the inspect/bid controls; a lot
  bid + End Day moves it into the garage; car-detail sell removes the car; parts-market buy control
  queues a purchase.

## Claude-implementable vs user-only

**Claude-implementable:** everything in A-G. The only cross-package change is the small `buyParts`
sim/content addition; no new dependencies.

**User-only:** run `pnpm dev`, warp to a catalog, inspect/bid, buy a part, build, sell - feel the
first full loop. This is also the first sprint where the **economy starts to be assessable by feel**
(the open "too simplified" concern) - worth playing a few careers once it's up.

## Implementation notes & verification

- **DRY refactor discovered mid-build:** adding `buyParts` broke every bot and test that built a
  `DayActions` object literal (each missing the new field). Rather than patch six literals (and hit
  this again next time), added a shared `emptyDayActions()` to `sim/actions.ts` and refactored all
  five bots to use it. Future action additions now touch one place.
- **The exhaustive `describeLogEntry` switch caught the new `part-bought` type at compile time** -
  exactly the payoff of writing it exhaustively in Sprint 04. Added the case + a test sample.
- **Golden-master unchanged:** the additive `buyParts` step is a clean no-op when empty, so the
  Sprint 02 golden career hash held (no re-pin), as predicted.
- **Verification:** `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm build` all green; **150
  tests across 33 files** (was 135/29), ~15 new this sprint (sim `buyParts`, content round-trip,
  store bid/sell/list/buy outcome tests, mounted auction + parts screens). Per-route code-splitting
  intact (auctions/parts lazy chunks, Pixi still isolated to the spike route).

## Post-review additions (2026-07-08): auction Interest meter + buyout

Added after playing through the loop surfaced two things: bidding felt *blind* (no way to know if a
number was sane), and there was no fast "I just want this car" path.

- **Interest meter** (`computeLotInterest` in `sim/bidding.ts`): a fuzzy read on rival demand for a
  lot - a level (`quiet` / `warm` / `hot` / `frenzy`), a rough expected-clearing **range**
  (deliberately fuzzed, not exact), and the rival-contender count. Built from the same deterministic
  AI valuations + per-bidder noise `resolveAuction` uses, so it's honest. A `precision` parameter
  (0..1, default 0) narrows the estimate band - **the hook a future "auction scout" staff trait
  plugs into** for a sharper read (that trait itself waits for the Sprint 13 staff system). This is
  the real fix for the blindness: bidding is now a judgment call, not a coin flip.
- **Instant buyout** (`buyoutLots` action + `advanceDay` resolution): pay `AUCTION_BUYOUT_PREMIUM`
  (1.1x book) to win a lot guaranteed, no contest, resolved on End Day. The premium over the
  expected clearing price is the convenience tax for certainty. New `lot-bought-out` log entry.
- **Rejected: a timed / real-time live bidding war.** It was floated to fix the same blindness, but a
  live clock while the player decides runs straight into the hard "no reflex-based input anywhere /
  no timing bars" accessibility pillar. Dropped entirely (not deferred). The Interest meter delivers
  the "read the room" engagement it was reaching for, without a stopwatch. Recorded so it isn't
  re-proposed.
- **Verification:** all green; **160 tests** (was 150), +10 for the interest calc (purity,
  level/contenders, estimate bracketing, the precision-narrows-band hook) and buyout (guaranteed
  win, unaffordable no-op) plus store + screen coverage. Golden-master still unchanged (`buyoutLots`
  additive/empty by default).

## Deferred (flagged, not dropped)

- **Interactive service / walk-in jobs** - the agreed **next focus** (2026-07-08): customer brings a
  car, player accepts, it takes a bay, labor + parts, guaranteed payout, player never owns it (Car
  Mechanic Sim style). This is the Act 1 early-game floor + the tutorial vehicle, and it fixes the
  current "auction-only" early game. Only passive service-bay income exists in code today. See
  `TODO.md`; needs a dedicated sprint (sequencing vs. Sprint 07 persistence is a user call).
- **Auction-scout ("auction rat") staff trait** -> Sprint 13 (staff system): sending a scout to the
  house sharpens the Interest read (raises `computeLotInterest`'s `precision`). The hook exists now.
- Live bid-escalation *animation* -> Sprint 12 (juice; distinct from the rejected real-time bidding).
- Mail/rumors, magazine-feature heat spikes -> Sprint 15 (events I).
- Parts lead times / deliveries / scouts -> Sprint 16 (events II).
- Import Broker / Gaisha channel -> Sprint 21 (rep-gated; Gaisha stays auction-excluded until then).

## Exit

With Sprint 06 the loop closes: hunt at auction, inspect or gamble, win a car, buy parts, build it up
(the radar climbs), and sell it to the right buyer through the right channel. Sprint 07 makes it
durable - Dexie autosave + versioned schema + export/import (the save law) + an end-of-day report -
and retires the dev-grant crutch for good. Sprint 08 is the Fun Gate: five strangers, 30+ minutes,
"one more day." Everything from Sprint 03's sim to here has been building the thing that gate judges.
