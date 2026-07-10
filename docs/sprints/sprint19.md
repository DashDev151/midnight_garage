# Sprint 19 — Auction system rework: multi-day bidding

*Source: 2026-07-10 playtest session (`docs/playtest-notes-2026-07-10.md`, item #2) — the largest,
most detailed single item in that note dump, and the one raised with the most urgency. Sequenced last
of the five sprints from that session (Sprints 15/16 make reputation real and gate who can even reach
which auction tier; this sprint reworks what happens once they're there) purely because of size and
blast radius, not
because it matters less — see the maintainer's own framing before treating the ordering as a verdict
on priority. Status: **designed, pending review.**

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

- [ ] `auction.ts`: `AuctionLotSchema` gains a duration concept (replacing/reinterpreting
  `expiresOnDay`'s meaning per decision 4) — exact field shape (a `durationDays` at creation vs. just
  repurposing `expiresOnDay` semantics) is an implementation-time call.
- [ ] New `ActiveBidSchema`: `lotId`, `playerMaxBidYen`, current standings snapshot as needed for the
  UI read, `resolvesOnDay`.
- [ ] `gameState.ts`: `GameState` gains `activeBids: ActiveBidSchema[]` (new array, matching the
  established one-array-per-commitment-type pattern — `activeAuctionLots`, `activeListings`,
  `pendingPartOrders` are the precedent).
- [ ] New `DayLogEntry` variants as needed for escalation/resolution events (e.g. an active bid being
  outbid by a rival mid-auction, distinct from the existing entries — exact names, verified:
  `auction-bid-won` / `auction-bid-lost` / `lot-bought-out` — which now only fire at final
  resolution), plus the `no-cash` reason on `acquisition-blocked` (decision 7).
- [ ] **Save law (missing from the first draft):** `activeBids` is new persisted `GameState` and
  `AuctionLotSchema` (nested in `activeAuctionLots`) changes shape — `SAVE_VERSION` bump (next in
  sequence after Sprints 15/18) + migration-or-additive-default + golden-save test, same PR.

### B. Sim (`packages/sim`)

- [ ] `constants.ts`: duration-by-rarity constants, escalation probability/step-size constants (both
  decisions 1-2), all first-pass and clearly marked adjustable.
- [ ] `bidding.ts`: `resolveBidInstant` reworked into a "place or raise an active bid" resolver
  (creates/updates an `ActiveBid`, no resolution) — the existing name likely needs to change since
  "instant" no longer describes what it does; `resolveAuction`'s actual math is called only from the
  new day-boundary resolution step, unchanged internally.
- [ ] New escalation-resolution logic, called once per active bid per day from `advanceDay` (decision 2).
- [ ] New gauge-computation function (decision 3), following `computeLotInterest`'s existing shape.
- [ ] `advanceDay.ts`: new day-boundary step resolving active bids whose duration has elapsed today
  (modeled directly on the existing public-listing-resolution step), plus the daily escalation pass
  for bids not yet due.
- [ ] All 6 bidding bots (`flipper`/`balancedPlayer`/`cautiousRestorer`/`randomStrategy`/`handyman`/
  `investor`) updated for day-to-day raise decisions (decision 6) — likely a shared helper, mirroring
  the `equipmentHelpers.ts`/`buyoutHelpers.ts` precedent rather than six bespoke implementations.
- [ ] `runCareer.ts`/`exportCareers.ts`: the win-price bucket telemetry (Sprint 10) and the new
  buyout-vs-bid telemetry (2026-07-09 work) both need re-checking against the new multi-day timing —
  likely still valid conceptually (they read final outcomes), but worth explicit verification since
  this sprint changes *when* those outcomes happen.

### C. Game (`packages/game`)

- [ ] `AuctionScreen.vue`: new "My Active Bids" section/tab, showing current-highest/who's-winning/
  gauge/days-remaining per active bid.
- [ ] Bid UI: placing a bid on a fresh lot vs. raising an existing active bid — likely the same
  control, behaving differently based on whether a lot already has a player active bid.
- [ ] `gameStore.ts`: new computed views for active bids, wired to the reworked resolver.

### D. Testing

- [ ] Sim: duration-by-rarity assignment; escalation probability produces the expected statistical
  shape over many samples (matching how every other probabilistic auction mechanic in this codebase is
  tested — Monte Carlo-style, not exact-value assertions); a short/flash auction demonstrably produces
  more "player wins below a rival's real ceiling" outcomes than a long auction, proving the "rarely
  win low" property is real and not just claimed; buyout still cleanly removes any active bid; a
  winning bid the player can no longer afford on resolution day forfeits with no money spent
  (decision 7), mirroring the existing no-parking forfeit tests.
- [ ] Sim: all 6 bots' harness tests updated to confirm none go inert under the new timing (mirroring
  the standing bar every equipment/buyout change has already had to clear).
- [ ] Content: schema/fixture updates for `ActiveBid` and the reworked `AuctionLot`.
- [ ] Game: `AuctionScreen.test.ts` extended for the active-bids view and raise-vs-fresh-bid flow.
- [ ] Golden masters re-pinned (this sprint changes RNG consumption shape significantly, given
  escalation happens across multiple days instead of one resolution call — expect this to be the
  largest golden-master re-pin of the five sprints).

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies, no data-layer access.

**User-only:** this is the sprint where playtesting the actual *feel* matters most — whether the
escalation pacing reads as tense-but-fair or just confusing, whether the gauge actually communicates
what it's meant to, can only be judged by playing it. `pnpm balance:run` afterward to sanity-check the
win-price bucket and buyout-vs-bid telemetry still land in reasonable ranges under the new timing.

## Exit

*To be filled in once implemented.*
