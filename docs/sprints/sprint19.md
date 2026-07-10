# Sprint 19 — Auction system rework: multi-day bidding

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, item #2) — the largest,
most detailed single item in that note dump, and the one raised with the most urgency. Sequenced last
of the five sprints from that session (Sprints 15/16 make reputation real and gate who can even reach
which auction tier; this sprint reworks what happens once they're there) purely because of size and
blast radius, not
because it matters less — see the maintainer's own framing before treating the ordering as a verdict
on priority. Status: **implemented, all checks green, pending review/commit.**

## Goal

Bidding today is fully blind and resolves in one click: place a max bid, find out instantly if you
won, with no visibility into what you were actually up against beyond a fuzzy pre-bid estimate.
This sprint makes an auction a real multi-day event — a lot stays live for a duration that varies by
how desirable the car is (rare flash sales, standard 2-4 day auctions, rare long sales for special
cars), the player can raise their bid day by day, and each day shows a live read of the current
highest bid, who's holding it, and a gauge of how much room rivals still have to escalate. Buyout is
untouched — still an instant, guaranteed purchase at a premium, any time.

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Rival bidder generation | `buildRivalField` (`bidding.ts`, Sprint 10) — a seeded-per-lot-id, archetype-weighted, buyout-capped field of rival max-bid ceilings | **Completely unchanged as the source of rival ceilings.** Every rival still has exactly the same fixed personal maximum they'd ever pay, generated exactly the same way. What's new is *when* and *how eagerly* a rival actually bids up toward that ceiling — see the new escalation mechanism below. |
| Second-price resolution math | `resolveAuction` (top bid wins, pays second-highest + increment) | **Unchanged, just deferred.** The actual win/pay-price math doesn't change at all — it just runs once, on the day a lot's duration elapses, instead of the instant a bid is placed. |
| "Commit now, resolves automatically on a future day" pattern | `PublicListingSchema`/`resolvesOnDay` (Sprint 07), `PendingPartOrder`/`arrivesOnDay` (Sprint 14) | **Third application of the same established pattern**, not a new architecture. An active bid behaves like a listing or a pending order: created/updated instantly by a click, resolved by `advanceDay`'s day-boundary tick once its day arrives. This sprint's size comes from the *auction-specific* mechanics (escalation, the gauge), not from inventing a new "resolves later" primitive — that part is proven three times over already. |
| Buyout | `resolveBuyoutInstant` | **Completely untouched.** Still instant, still guaranteed, still ends the lot immediately — including ending any active bid on it, so there's no dangling state to clean up beyond the existing "remove from `activeAuctionLots`" behavior. |
| Interest/estimate read | `computeLotInterest`'s obfuscated-band technique (`AUCTION_INTEREST_BASE_BAND`, fuzz around a real number rather than showing it directly) | **Direct template for the new "room to escalate" gauge** — same obfuscation *technique* (a band around a real internal number), applied to a new question ("how much headroom do rivals have left") instead of the existing one ("what would it take to win right now"). |
| Bots' instant-bid path | `queuedActions.bidsOnLots` resolved once per day in `advanceDay` | **Extended, not replaced** — bots still queue a bid the same way; what changes is that a bid now creates/raises an *active* bid instead of resolving instantly, and bots need a day-to-day decision about whether to raise an existing active bid (new bot logic, all 6 bidding bots affected — see decision 6). |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Per-lot duration by rarity, replacing the flat `AUCTION_LOT_EXPIRY_DAYS`.** Today every lot gets
   the same 7-day window regardless of what it is. This sprint makes duration meaningful and variable
   (flash/standard/long) — a genuinely new content-driven number, not an extension of an existing one.
2. **Day-by-day rival escalation.** This is the real new mechanic, and the reason this sprint is
   sized the way it is. Today a rival's bid is resolved once, in full, at click time. Multi-day bidding
   needs rivals to *gradually* approach their fixed ceiling over the auction's life instead of
   revealing it all at once — see decision 2 for the proposed model, which turns out to also be where
   the maintainer's "rarely win on a low bid anyway" ask falls out for free (a rival who never got
   around to raising within a short auction simply never shows their real ceiling).
3. **An "active bids" tracking collection + its own UI surface** ("My Active Bids"). Nothing today
   tracks "a lot I'm currently engaged in but hasn't resolved yet" as its own thing — `activeAuctionLots`
   is the browsable catalog, not a bid-status list.
4. **The escalation-headroom gauge.** A new read, distinct from `computeLotInterest`'s existing
   pre-bid estimate — this one answers "given where the bidding stands *right now*, how much room is
   left for it to move against me," which only makes sense once a bid is already live over multiple
   days. Reuses the existing obfuscation technique (mechanism above), but is a new question, not a
   relabeling of the old one.

## Definition of Done

- Every auction lot has a duration (flash / standard / long, driven by rarity) instead of a flat
  7-day window.
- Placing a bid does not resolve anything instantly — it creates or raises an active bid, which
  persists and can be raised again on later days.
- A new "My Active Bids" view shows every lot the player currently has a live bid on: current highest
  bid, whether it's the player's or a rival's, the escalation-headroom gauge, and days remaining.
- A lot resolves (real second-price outcome) exactly once, on the day its duration elapses — never
  earlier, never automatically because a bid was placed.
- Buyout remains completely unchanged: instant, guaranteed, available at any point regardless of
  active-bid state.
- Rival escalation is probabilistic, not deterministic — the maintainer's "rarely win low anyway"
  behavior is a real, observable emergent property of the model, not a bolted-on special case.
- All 6 bidding bots and the harness are updated so none silently break or go inert under the new
  timing model (matching the standing project bar for every prior mechanic change touching bots).
- All checks green; new tests cover duration-by-rarity assignment, day-by-day escalation, the
  gauge's obfuscation, and the harness/bot side.

## Decisions (approve / adjust before implementation — the most open questions of the five)

1. **Duration by rarity — first-pass mapping, openly adjustable:**

   | Car rarity | Typical duration | Notes |
   |---|---|---|
   | shitbox / common | standard (2-4 days) | the common case, most lots |
   | uncommon / rare | standard, with a chance of "long" | nicer cars occasionally get more drama |
   | legend (collector-network) | long (7+ days) | matches its existing rarity-gated auction tier. (Corrected in review, 2026-07-10: the first draft said "legend / gaisha," but gaisha cars never appear at auction at all — `auctionTierForRarity` maps them to no tier; per the roster they arrive via the import broker / Collector's Quarter events, so they get no auction duration.) |
   | any tier | rare chance of "flash" (~1 day) | the maintainer's own framing — a special, occasional event layered on top of the normal tier-driven duration, not tied to any one rarity |

   Exact day counts within each band and the flash-sale roll probability are first-pass tunable
   constants, not locked here.

2. **Rival escalation model — the core new mechanic, proposed for discussion, not yet locked.**
   Each day a lot is active, every rival bidder whose fixed ceiling (from the unchanged
   `buildRivalField`) is above the current top bid has some probability of raising to a new bid
   between the current top and their own ceiling. Rivals who are already winning, or already at their
   ceiling, don't move. On the day the duration elapses, one final escalation pass runs, then the real
   second-price resolution fires using whatever the standings are at that moment. This means: a
   short (flash) auction gives rivals few chances to ever reveal their true ceiling, which is exactly
   where an occasional "won cheap because nobody got around to raising" result comes from naturally —
   no separate "sometimes just let the player win" rule needed. The per-day escalation probability and
   the size of each raise are first-pass tunable constants.
3. **The gauge shows headroom, not raw numbers.** Obfuscated the same way `computeLotInterest`
   already obfuscates its pre-bid estimate — a qualitative read (e.g., "plenty of room to move" /
   "getting tight" / "near the ceiling"), not an exact yen figure for what a rival would pay. Exact
   bucketing is an implementation-time detail once real data exists to calibrate against, same as
   every other qualitative auction read in this codebase.
4. **All lots get a duration and resolve only when it elapses — not just lots the player has bid on.**
   A lot nobody ever bids on simply expires unsold when its duration ends, same conceptual outcome as
   today's `expiresOnDay`, just renamed/repurposed to mean "when this resolves" instead of "when this
   disappears." One timer, one concept, not two.
5. **Buyout ends an active bid cleanly, with no special-case cleanup needed beyond removing the lot**
   — since active bids are keyed by `lotId` and the lot is already removed from `activeAuctionLots` on
   buyout today, the same removal naturally drops any associated active-bid record too.
   (Grounding, verified 2026-07-10: today's lot lifecycle is already per-lot — each lot carries its
   own `expiresOnDay`, expired lots are pruned daily, and the weekly `refreshCatalogs` is purely
   *additive*, appending fresh lots alongside survivors. So variable durations slot into the existing
   lifecycle cleanly; there is no wholesale weekly catalog wipe that a long sale would have to
   survive.)
6. **All 6 bidding bots need day-to-day escalation logic, not just an initial bid.** This is the
   sprint's other major cost center beyond the core mechanic: today a bot places one bid and is done.
   Under this model, a bot needs a policy for "should I raise my active bid today" — likely reusing
   the same kind of headroom read the player sees (decision 3), so a bot raises when it's losing
   ground and stops when it's near its own intended ceiling. Scoped per-bot at implementation time;
   flagging now so it isn't discovered as scope creep mid-sprint — it's real, known cost, not a
   surprise.
7. **What happens when the player can't pay on resolution day (added in review, 2026-07-10 — the
   first draft never addressed it).** Today `resolveBidInstant` deducts cash in the same call that
   wins the auction, so affordability is checked at the moment of commitment. Under multi-day
   bidding that guarantee is gone: bid ¥500k on day 1, spend the cash on day 2, and the lot resolves
   on day 3 against money that no longer exists — and no cash-reservation/escrow concept exists
   anywhere in the codebase (verified). Proposal: **reuse Sprint 09's existing resolution-time
   forfeit pattern** (`acquisition-blocked`, exactly how a won bid with no parking already falls
   through — no money spent, rivals take the car) with a new `no-cash` reason, rather than building
   an escrow mechanism — one precedent, two block reasons, no new money state. The mild
   exploit/annoyance trade-off (a player can technically bid risk-free) is acceptable at this stage
   and mirrored by the existing no-parking behavior; an escrow is the premature-generality path.
   The same forfeit rule applies to bots, whose cash position can likewise drift between bid day and
   resolution day.

## Task breakdown

### A. Content (`packages/content`)

- [x] `auction.ts`: `AuctionLotSchema` gains `playerMaxBidYen`/`rivalEscalatedBidsYen` — `expiresOnDay`
  kept as the field name but repurposed to mean "the day this lot resolves" (decision 4), not renamed
  (see Exit deviation 2).
- [x] ~~New `ActiveBidSchema`~~ — deliberately not built (see Exit deviation 1).
- [x] ~~`GameState` gains `activeBids`~~ — deliberately not built (see Exit deviation 1).
- [x] New `DayLogEntry` variant `auction-bid-placed` (`lotId`, `maxBidYen`), plus the `no-cash` reason
  on `acquisition-blocked` (decision 7). `auction-bid-won`/`auction-bid-lost`/`lot-bought-out` needed
  no shape changes — verified unchanged, as the design doc predicted.
- [x] **Save law:** `SAVE_VERSION` 10 → 11, purely additive (`playerMaxBidYen`/`rivalEscalatedBidsYen`
  both schema-defaulted), golden-save tests added (`saveCodec.test.ts`).

### B. Sim (`packages/sim`)

- [x] `constants.ts`: `AUCTION_DURATION_STANDARD_RANGE_DAYS`/`AUCTION_DURATION_LONG_RANGE_DAYS`/
  `AUCTION_DURATION_FLASH_DAYS`/`AUCTION_FLASH_CHANCE`/`AUCTION_LONG_CHANCE_UNCOMMON_RARE`/
  `AUCTION_ESCALATION_DAILY_CHANCE`/`AUCTION_ESCALATION_STEP_FRACTION`/three
  `AUCTION_HEADROOM_*_MIN_FRACTION` constants — all first-pass, openly adjustable. Old
  `AUCTION_LOT_EXPIRY_DAYS` removed.
- [x] `bidding.ts`: `resolveBidInstant` renamed `resolvePlaceBid` — places/raises only, never resolves.
  `resolveAuction`'s internals (the extracted `resolveSecondPriceAuction`) are shared, unchanged, by
  both the old calibration surface and the new resolution path (see Exit deviation 3).
- [x] `applyDailyEscalation` — the day-by-day rival-raise pass (decision 2), seeded on `${lotId}:escalate:${day}`.
- [x] `computeBidHeadroom` — the gauge (decision 3), same obfuscation technique as `computeLotInterest`.
- [x] `advanceDay.ts`: day-boundary step splits `activeAuctionLots` into due/still-active, resolving
  due lots via the new `resolveDueAuctionLot` and escalating the rest via `applyDailyEscalation`.
- [x] All 6 bidding bots updated — but for room/budget bookkeeping only, not day-to-day raise logic
  (see Exit deviation 4, a real scope reduction from decision 6's estimate).
- [x] `runCareer.ts`/`exportCareers.ts`: verified unchanged — the win-price bucket and buyout-vs-bid
  telemetry both read final resolution outcomes (`auction-bid-won`/`lot-bought-out`), which are
  unaffected by when those events fire.

### C. Game (`packages/game`)

- [x] `AuctionScreen.vue`: new "My Active Bids" section (current bid, winning/outbid, headroom, days
  left) plus per-lot raise-vs-fresh-bid controls (a lot with `myMaxBidYen !== null` shows a raise
  input instead of a fresh-bid input).
- [x] Bid UI: the same per-lot control switches on `d.myMaxBidYen !== null` — a fresh bid vs. a raise,
  as scoped.
- [x] `gameStore.ts`: `myActiveBids` computed (a pure filter over `activeAuctionLots`, not a parallel
  list — see Exit deviation 1), `lotDetail` gained `headroom`/`myMaxBidYen`/`daysLeft`. The old
  `bidResults`/`lastBidResult`/`BidResultView` instant-feedback mechanism is gone entirely — a bid's
  outcome now shows up in the end-of-day report like any other day-boundary event.

### D. Testing

- [x] Sim: duration rolls (`rollAuctionDurationDays`), escalation shape (`applyDailyEscalation`),
  headroom bucketing (`computeBidHeadroom`), `resolvePlaceBid`/`resolveDueAuctionLot` outcomes
  (win/lose/no-sale/no-parking/no-cash forfeit) — `bidding.test.ts` rewritten with new describe blocks
  per function.
- [x] Sim: all 6 bots' tests updated (import + room/budget bookkeeping changes); harness-level bot
  behavior tests (`buyoutHelpers.test.ts`, per-bot files) all pass unchanged in shape.
- [x] Content: n/a — no new schema beyond the two additive `AuctionLot` fields (Exit deviation 1 means
  no `ActiveBid` fixtures were ever needed).
- [x] Game: `AuctionScreen.test.ts` extended (place-then-check-My-Active-Bids, raise control presence);
  `gameStore.market.test.ts` extended (multi-day win-eventually, `myMaxBidYen`/`myActiveBids` reflect a
  placed bid, raise-never-lowers).
- [x] Golden masters re-pinned — both `advanceDay.test.ts` hashes changed (`e36d6952`, `a666f171`), as
  predicted the largest re-pin of the five sprints (multi-day escalation changes RNG consumption shape
  even for careers that never place a bid, via weekly catalog refresh's duration rolls).

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies, no data-layer access.

**User-only:** this is the sprint where playtesting the actual *feel* matters most — whether the
escalation pacing reads as tense-but-fair or just confusing, whether the gauge actually communicates
what it's meant to, can only be judged by playing it. `pnpm balance:run` afterward to sanity-check the
win-price bucket and buyout-vs-bid telemetry still land in reasonable ranges under the new timing.

## Exit

**Status: implemented, all checks green, not yet committed.**

The core mechanic landed as decision 2 described and confirmed (via `AskUserQuestion` before
implementation, matching the maintainer's own proposal exactly): every lot rolls a duration by rarity
(`rollAuctionDurationDays`), rivals escalate probabilistically day by day toward their unchanged fixed
ceilings (`buildRivalField` is completely untouched), and resolution happens exactly once, on the lot's
due day, against whatever the standings are at that moment. Buyout is untouched.

**Four deliberate deviations from the design doc, found and made during implementation, not silent:**

1. **No separate `ActiveBidSchema`/`GameState.activeBids` array**, reversing the design doc's own
   proposal — per directive 15 (never stand up a parallel mechanism when an existing one covers the
   concern). An active bid is fully represented by two new fields directly on `AuctionLot`
   (`playerMaxBidYen`, `rivalEscalatedBidsYen`), since a lot with a bid is still just a lot — "My
   Active Bids" is a pure filter (`gameStore.ts`'s `myActiveBids`) over the existing
   `activeAuctionLots`, not a second source of truth that could drift out of sync with the catalog.
   This also meant no new content fixtures were ever needed (task D's "Content" line).
2. **`expiresOnDay` kept its name**, not renamed to something like `resolvesOnDay` (the newer,
   more-consistent convention `PublicListing`/`PendingPartOrder` use) even though its *meaning* changed
   from "when this disappears" to "when this resolves." A rename of a required field isn't a safe
   additive default — it would have needed a real migration, and this sprint's `SAVE_VERSION` bump was
   already carrying the two new bid fields. Not worth the added risk for a naming nicety alone, per the
   content-layer comment left on the field itself.
3. **`resolveAuction` (full-ceiling resolution) was kept, not deleted**, as a calibration/testing
   surface distinct from the new real resolution path (`resolveDueAuctionLot`, which resolves against
   whatever rivals have *actually escalated to*). Both share one extracted pure-math core,
   `resolveSecondPriceAuction` — the split preserved 100% of the existing, extensive
   `resolveAuction`/`computeLotInterest` test suite unchanged, since the rival-field statistics
   (`buildRivalField`'s bell curve, buyout cap, tier gating) never changed at all.
4. **Bots do not need day-to-day "raise my bid" logic** — a real, reasoned scope reduction from
   decision 6's own estimate, not a shortcut. In a second-price sealed-bid auction, bidding your true
   intended ceiling once is the dominant strategy (raising later never helps: you either already win at
   your true value or you don't); a bot's only real day-to-day obligations under multi-day bidding are
   (a) never re-bid a lot it's already committed to, and (b) budget correctly across several
   simultaneously-pending bids. Both are satisfied by `buyoutHelpers.ts`'s reworked
   `auctionAcquisitionBudget(state)` (now seeds `cashCommitted` from every already-active bid, not just
   this tick's spending) and the new `activeBidCount(state)` (counted the same as an owned car against
   each bot's "room for more cars" budget). All 6 bots (`flipper`/`balancedPlayer`/`cautiousRestorer`/
   `randomStrategy`/`handyman`/`investor`) got this same 3-part mechanical update — no bespoke
   escalation policy per bot, and no shared `raiseHelpers.ts` was needed at all.

Decision 7 (no-cash forfeit on resolution day) shipped exactly as proposed: `resolveDueAuctionLot`
checks `state.cashYen` only at resolution time, forfeiting a won lot with no money spent
(`acquisition-blocked`/`no-cash`) the same way a no-parking forfeit already does — one precedent, two
block reasons, no escrow built.

**Game layer:** `AuctionScreen.vue` gained a "My Active Bids" section (lot name, current bid,
winning/outbid state, the headroom gauge, days remaining) plus per-lot bid controls that switch between
a fresh-bid input and a raise-to input based on whether the lot already carries a player bid. The old
`bidResults`/`lastBidResult`/`BidResultView` instant per-lot win/lose feedback mechanism (Sprint 11) is
gone entirely — since bidding no longer resolves the instant it's clicked, a bid's real outcome now
surfaces through the same end-of-day report every other day-boundary event already uses
(`auction-bid-won`/`auction-bid-lost`/`acquisition-blocked` all already had log entries; nothing new
needed building there).

`SAVE_VERSION` bumped 10 → 11, purely additive (`playerMaxBidYen: null`, `rivalEscalatedBidsYen: []` —
correct defaults, since a pre-v11 save's lots could never have had a bid mid-flight under the old
instant-resolve model). No `MIGRATIONS[10]` step needed.

Both `advanceDay.test.ts` golden-master hashes re-pinned (`e36d6952`, `a666f171`) — as predicted, the
largest re-pin of the five sprints from this playtest session: multi-day escalation changes RNG
consumption shape during weekly catalog refresh (the new duration roll per lot) even for the scripted
30-day career, which never places a bid at all.

509 tests (was 460). All checks green (`pnpm typecheck`/`lint`/`format`/`test:coverage`/`build`).

**Not yet verified with real play** — same standing gap as Sprint 17's UI work: `pnpm dev` is the
maintainer's to run per this project's rule, so the escalation pacing's actual *feel* (tense-but-fair
vs. confusing) and whether the headroom gauge communicates what it's meant to are unverified by hand.
`pnpm balance:run` has likewise not been re-run yet to sanity-check the win-price bucket and
buyout-vs-bid telemetry still land in reasonable ranges under the new multi-day timing — both are
maintainer-run per the human air gap on data, tracked as a follow-up in `TODO.md`.
