# Sprint 20 — Auction rework II: open bidding at real clearing prices

*Source: maintainer direction, 2026-07-11, opening the foundational-economy arc (auction structure
first, then valuation, inspection/hidden issues, progression pacing, and a human-playtest/debt sprint
— see the arc discussion of 2026-07-10/11). Trigger: the first post-Sprint-19c balance run plus a
first-principles review showed the Sprint 19 bidding system is economically bypassed (77-95% of bot
acquisitions via buyout, 100% of won bids in the "frenzy" bucket) and experientially inert (the
player is never actually outbid — the whole war happens inside a hidden per-rival array, with two
gauge subsystems built just to hint at it). Maintainer: "design the system from scratch where it
feels like you are organically in a real bidding war, but where it is worth it to bid and wait most
of the time but not always." Status: **implemented; all checks green; committed (`a0c6e79`).***

## Goal

Replace sealed proxy bidding + hidden rival escalation with an open, visible bidding war a player
responds to day by day, clearing at wholesale-anchored prices so patient bidding beats buyout most
of the time — grounded in how a real 1995 dealer auction behaves: dealers bid up to resale minus
recon minus margin, price climbs in increments, the hammer falls when the raising stops.

## Reuse analysis (directive 15)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Lot supply | `generateAuctionCatalog`/`refreshCatalogs`, `AUCTION_LOTS_PER_TIER`, tier-by-rarity mapping, weekly cadence | Logic unchanged — this sprint reworks how a lot *sells*, not how it appears. (One mechanical touch: the `AuctionLot` literal in `generateAuctionCatalog` emits the new bid-state fields — see tasks.) |
| Lot velocity variation | `rollAuctionDurationDays` (flash/standard/long bands) | Kept per maintainer decision 4 — `expiresOnDay` becomes the *backstop* close ("this lot leaves the board no later than day N"); the activity rule below usually closes lots earlier. Flash lots stay the "decide today" events. |
| Value anchor | `valuateCarForBuyer` + `interestedBuyers` (Sprint 03/10) | The demand ceiling anchors to the best interested buyer's valuation of the actual rolled car. Sprint 21 replaces that formula's internals; this sprint treats it as an opaque anchor so the room… the *turnout* re-anchors automatically when 21 lands. |
| Reserve | `AUCTION_RESERVE_PRICE_FRACTION` (0.4 x book) | Unchanged: bidding opens at reserve; a lot whose demand ceiling sits below reserve never opens (nobody came for it). |
| Tier access gates | `AUCTION_TIER_MIN_REPUTATION` (Sprint 16) | Unchanged. |
| Inspection | `resolveInspectLot` + travel fees | Unchanged this sprint — its economic meaning (information edge vs. the average-risk price) lands in Sprint 22. |
| Handover condition | `resolveHandoverCondition` (sliding-scale lemon rule) | Unchanged this sprint, reworked in Sprint 22 — which also fixes the discovered inversion where inspecting *guarantees* full severity while a blind at-book buy averages half. |
| First-price principle | Sprint 19b's "you pay what you bid" | Strengthened: the winner pays the literal number on the board. |
| No-escrow + forfeits | Sprint 19 decision 7 (`no-cash`/`no-parking` forfeit at resolution) | Unchanged: cash is checked at the hammer, not while bidding. |
| Resolver/action shape | `resolvePlaceBid`/`resolveBuyoutInstant` signatures, advanceDay step 8 slot, DayActions | Same resolver pattern, same pipeline position — internals change, plumbing doesn't. |
| Save migrations | `saveCodec.ts` `MIGRATIONS` + golden-save tests | `AuctionLot` schema changes ride the existing machinery (save law: bump + migration + golden-save test, same commit). |
| Bot call-site shape | one `acquireLot`-style helper shared by all bidding bots | Same shape, far simpler internals (see below). |
| Telemetry pipeline | `auctionWins`/`acquisitions` CSVs + Python report | Kept; the win-price bucket basis is redefined (hammer / value anchor) since [reserve, buyout] no longer bounds outcomes. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **Visible open bidding state on a lot** (`currentBidYen` + `leadingBidder` + `quietDays`).
   Nothing existing represents "the price on the board and who holds it" — Sprint 19 stored a sealed
   player max plus hidden rival positions, and needed two gauge subsystems (`computeLotInterest`'s
   fuzzy win-range, `computeBidHeadroom`'s buckets) precisely because the real state was invisible.
   Making the state itself visible deletes both.
2. **The demand ceiling** — ONE hidden number per lot (derived from the lot's seed, never stored):
   what the assembled dealers will pay, anchored at wholesale. Replaces the per-rival ceiling array +
   nightly per-rival escalation machine. This is the load-bearing economics fix: rivals currently bid
   0.95 x *retail*, so contested lots clear at ~book, which is why buyout (1.1 x book) dominates.
3. **Activity-based closing** ("going once, going twice"): a lot hammers after 2 consecutive quiet
   days. No existing mechanic ends anything based on behavior rather than a timer; this is also the
   structural fix for the measured duration-sensitivity problem (frenzy share swinging ~140x between
   2- and 4-day auctions), because auctions now end when the bidding stops, not when a clock says so.
4. **The overnight counter step** — one seeded probability that the standing dealers raise one
   increment toward their ceiling. Replaces `applyDailyEscalation` (per-rival chance + step fraction
   + reserve-floor sentinel logic) with a single rule the player can feel.
5. **Turnout** — a subtle pre-bid flavor read ("thin / steady / packed": how many dealers came to
   look), a coarse band derived from the demand ceiling. Price is king; this is one word of texture,
   not a gauge. (Maintainer decision 3: flavor yes, but no "room" framing — wording is theirs to
   polish.)

### Deleted outright (the overcomplication being removed)

`buildRivalField`'s per-rival ceiling array, `applyDailyEscalation`, `computeBidHeadroom` (+ its 3
threshold constants), `computeLotInterest`'s fuzzy win-range (+ `AUCTION_INTEREST_BASE_BAND`),
`resolveAuction`/`resolveTopBidAuction`'s sealed-bid resolution core, dynamic
`computeBuyoutPriceYen`'s leading-bid coupling, `AUCTION_ESCALATION_DAILY_CHANCE`,
`AUCTION_ESCALATION_STEP_FRACTION`, `AUCTION_FIELD_BASE/PER_INTEREST/SIZE_SD`,
`AUCTION_BIDDER_DISCIPLINE`, `AUCTION_BIDDER_NOISE_RANGE`, `AUCTION_BUYOUT_TOLERANCE_FRACTION`,
`auctionBidValueFor`. Known bugs that die structurally with them: the exact-tie "shows winning,
loses anyway" mismatch; the duration-sensitivity calibration problem; the quirk where the player's
own sealed bid raised their own buyout price.

## Maintainer decisions (2026-07-11, as given)

1. **Hammer pacing: 2 consecutive quiet days** ("start with 2").
2. **Buyout available on ALL lots** — "player must be able to buy out any car even if very expensive
   and stupid to do so." Deterrent is price, not availability: flat premium over the value anchor,
   floored at one increment above the current bid so it always ends the auction, never undercuts it.
3. **Price is king; subtle flavor allowed** — one coarse turnout descriptor, no "room" wording, no
   numeric gauges.
4. **Keep lot-velocity variation** — some lots must move really fast, some slow; satisfied by keeping
   the existing flash/standard/long duration roll as the backstop close.

## Design

### Lot state (schema change, SAVE_VERSION 11 -> 12)

Removed: `playerMaxBidYen`, `rivalEscalatedBidsYen`.
Added: `currentBidYen: number` (0 = no bids yet), `leadingBidder: 'player' | 'rival' | null`,
`quietDays: number`, and `playerHasBid: boolean` — set true on the player's first raise, never
reset. `playerHasBid` is load-bearing, not bookkeeping: it gates the "My Active Bids" panel
(`gameStore.ts`'s `myActiveBids` filters on the deleted `playerMaxBidYen !== null` today — the new
filter is `playerHasBid && lot still active`, which deliberately INCLUDES lots the player is
currently losing, since "you're being outbid, go raise" is the panel's whole point), the
`auction-outbid` log gate, and the loss-logging gate (an AI win only logs when `playerHasBid`,
matching today's only-log-if-the-player-had-skin rule).
Migration for in-flight lots: `currentBidYen = max(playerMaxBidYen ?? 0, ...rivalEscalatedBidsYen)`,
`leadingBidder` = whichever side held that max (`'player'` on an exact tie — consistent with the
ties-go-to-player rule below; `null` if 0), `quietDays = 0`,
`playerHasBid = playerMaxBidYen !== null`. Golden-save test in the same commit (save law).

### The demand ceiling (derived, never stored)

First, one exported anchor: `anchorValueYen(lot, state, context)` = best interested buyer's
`valuateCarForBuyer` of the rolled car. The demand ceiling, the buyout price and the turnout bands
ALL call this one function — that isolation is a hard requirement: Sprint 21 swaps this single
body for its taste-free `marketValueYen` and everything re-anchors at once.

`demandCeilingYen(lot, ...)` = `anchorValueYen` x `AUCTION_WHOLESALE_FRACTION` x lot-seeded spread
(`bellNormal`, sd `AUCTION_DEMAND_SPREAD_SD`), with a `AUCTION_THIN_TURNOUT_CHANCE` roll that
multiplies by `AUCTION_THIN_TURNOUT_FACTOR` (some days nobody comes for a Carina). Seeded on
`lot.id` alone — deterministic, reproducible, identical every time it's computed, invisible to the
save file. The ceiling prices the car's *visible* condition; hidden issues are the player's Sprint
22 edge.

### The daily loop

- **Player, during the day:** raise to at least `currentBidYen + increment` (resets `quietDays`,
  takes the lead, sets `playerHasBid: true`), buy out instantly, or hold. Raises only — never
  retract (kept rule).
- **Overnight (advanceDay), per active lot, seeded on `lot.id:day`:**
  - Not yet open: if `demandCeiling >= reserve`, the dealers open the bidding at reserve
    (`leadingBidder: 'rival'`). Otherwise the lot stays bidless (it can still be bought out, or bid
    on by the player at >= reserve).
  - Open, `currentBidYen < demandCeiling`: with probability `AUCTION_COUNTER_CHANCE` the dealers
    raise one increment (capped at the ceiling), take the lead, reset `quietDays`. This rule is
    deliberately UNCONDITIONAL on who currently leads: the dealers also bid among themselves, so an
    untouched lot climbs toward its ceiling and hammers to the trade like any other — that IS the
    background market selling to itself, and it's why steals come from weak-turnout ceilings, not
    from the dealers forgetting to bid. The **"you were outbid overnight" beat** (`auction-outbid`
    log entry) fires ONLY when the leader this raise displaced was the player
    (`leadingBidder === 'player'` before the raise); dealer-vs-dealer raises log nothing.
    Otherwise silence: `quietDays + 1`.
  - Open, `currentBidYen >= demandCeiling`: silence, `quietDays + 1`. (Player raises equal to the
    ceiling win — visible-price ties go to the player, matching what the board shows.)
  - **Hammer:** `quietDays >= 2`, or `day >= expiresOnDay` (backstop, preserves velocity variation)
    — whoever leads wins at `currentBidYen` (first-price, the literal board number). Player wins run
    the existing no-cash/no-parking forfeit rules and handover. A dealer win logs the loss
    (`auction-bid-lost` shape) only when `playerHasBid` — today's only-log-if-the-player-had-skin
    rule, carried over. No leader = silent no-sale (kept behavior).
- **Increment:** `max(Y10,000, 5% of book rounded to Y10k)` — one ladder for player, dealers, and
  bots.
- **Buyout, all lots:** `max(anchorValueYen x AUCTION_BUYOUT_PREMIUM, currentBidYen + increment)`
  — the same exported anchor the ceiling uses. Instant, ends the lot. With
  wholesale clearing ~0.6-0.8 x value and buyout at ~1.25 x value, buyout is always available and
  almost never rational — decision 2's intent, priced rather than forbidden.

### Step 0 — the tuning surface moves to content (maintainer ask, 2026-07-11)

The content law says designer-tunable numbers live in JSON under `packages/content`; in practice the
system parameters live in `packages/sim/src/constants.ts` (298 lines of code), with strays beyond it
(`STARTING_CASH_YEN` in `newGame.ts`, flavor pools in `auctions.ts`). This sprint opens by fixing
that for the economy family: a Zod-validated `packages/content/data/economy.json` + schema, threaded
through the existing `SimContext` like every other content file. Existing auction/economy constants
move verbatim (identical values -> golden-master hashes must not move, which *proves* the move was
behaviorally inert); the new auction knobs below are born there, never in code. Deliberate
boundaries: bot strategy multipliers stay in code (test instruments, not design); structural
constants stay in code (component lists, id schemes); `valuation.ts`/`derivedStats.ts` formula
internals get parameterized in Sprint 21 when those formulas are redesigned, not before.

### First-pass values (all in `economy.json` from day one)

- `AUCTION_WHOLESALE_FRACTION = 0.75` — dealers pay resale minus recon minus margin.
- `AUCTION_DEMAND_SPREAD_SD = 0.12` — lot-to-lot turnout strength.
- `AUCTION_THIN_TURNOUT_CHANCE = 0.15`, `AUCTION_THIN_TURNOUT_FACTOR = 0.6` — the weak-day tail
  where steals genuinely live.
- `AUCTION_COUNTER_CHANCE = 0.7` — how often the dealers answer overnight.
- `AUCTION_QUIET_DAYS_TO_HAMMER = 2` (decision 1).
- `AUCTION_BID_INCREMENT_FRACTION = 0.05` (of book, Y10k floor/rounding).
- `AUCTION_BUYOUT_PREMIUM = 1.25` — re-pointed at the value anchor (was 1.1 x book).
- `AUCTION_TURNOUT_BANDS = [0.85, 1.12]` — over `demandCeiling / (anchorValueYen x
  AUCTION_WHOLESALE_FRACTION)` (i.e. the lot's rolled spread multiplier): thin < 0.85, steady
  0.85-1.12, packed > 1.12. Flavor only.
- Which existing constants move in step 0, enumerated: `STARTING_CASH_YEN`, `WEEKLY_RENT_YEN`, and
  the surviving auction family — `AUCTION_RESERVE_PRICE_FRACTION`, `AUCTION_LOTS_PER_TIER`,
  `AUCTION_DURATION_STANDARD/LONG/FLASH`, `AUCTION_FLASH_CHANCE`,
  `AUCTION_LONG_CHANCE_UNCOMMON_RARE`, `AUCTION_TRAVEL_FEE_YEN`, `AUCTION_BUYOUT_PREMIUM`. Every
  other `constants.ts` family (reputation, condition rolls, stat formulas, service/parts/facility
  numbers) stays put and moves in the sprint that owns it (21: valuation/stat/condition; 23:
  reputation/rent value) — the rule is "a constant moves when its owning sprint touches it", so no
  big-bang migration.
- `WEEKLY_RENT_YEN = 90_000 -> 0` — maintainer decision 2026-07-10: rent off until the economy
  works end-to-end; returns as a *tuned* pressure knob in Sprint 23. Doc comment must say exactly
  that so it can't silently ship as-is.

### Bots

Bots stop reading estimates and play the same board the player sees: each sets a walk-away target
(anchor x its strategy multiplier); each day, if not leading and `currentBid + increment <= target`,
raise one increment; otherwise hold or walk. Note the basis change: today's bot multipliers are
fractions OF BOOK VALUE (`bookValueYen x BID_FRACTION_OF_BOOK`); the new targets are fractions of
the anchor (best-buyer valuation, typically ~0.9-1.1x book), so keeping each bot's numeric
multiplier shifts behavior somewhat — accepted and observed via telemetry (bots are instruments,
not evidence; real retuning happens against Sprint 23's invariants). Bots never buy out (buyout is a player-impatience
valve; a bot has no impatience) — `shouldBuyout`/`AUCTION_BUYOUT_TOLERANCE_FRACTION` logic deleted,
`acquireLot` becomes "join/continue a war under your target". Buyout-vs-bid telemetry stays to
verify bids genuinely win.

### UI (`AuctionScreen.vue`)

The board: current bid + who holds it, turnout word, "no new bids yesterday (hammer at 2)" state,
raise control (pre-filled to minimum increment), always-visible Buy Now price, backstop date.
Removed: headroom gauge, fuzzy win-range. Day report gains the outbid beat ("Outbid overnight on
the RX-7 — now Y1,240,000") plus hammer win/loss lines through the existing log pipeline.

## Task breakdown

### Sim (`packages/sim`) and content (`packages/content`)

- [x] Step 0: `EconomyConfigSchema` (Zod) + `packages/content/data/economy.json`; thread through
  `SimContext`; move existing auction/economy tunables (incl. `STARTING_CASH_YEN`) verbatim —
  golden-master hashes must not move, which is the proof the move was behaviorally inert. New knobs
  below are born in the JSON, never in `constants.ts`.
- [x] `content/src/auction.ts` schema: lot fields swap (above); SAVE_VERSION 12 migration +
  golden-save test (`packages/game/src/save/`).
- [x] `bidding.ts` rewrite: exported `anchorValueYen` (the single anchor — a Sprint 21 hard
  requirement), `demandCeilingYen`, overnight step, hammer resolution, buyout price, turnout band
  helper; delete the subsystems listed in the reuse analysis.
- [x] `valuation.ts`: delete `auctionBidValueFor` (+ its `AUCTION_BIDDER_DISCIPLINE` import) — it
  is on the deleted list but lives in this file, which no other bullet touches.
- [x] `auctions.ts` `generateAuctionCatalog`: the `AuctionLot` literal emits
  `currentBidYen: 0, leadingBidder: null, quietDays: 0, playerHasBid: false` in place of the two
  deleted fields.
- [x] `resolvePlaceBid` -> open-raise semantics (>= current + increment, >= reserve to open; sets
  `playerHasBid`).
- [x] `advanceDay.ts` step 8: overnight step + hammer/backstop replaces due-lot filter + escalation.
- [x] `finances.ts` `applyWeeklyRentAndWages(state)`: gains a context/economy argument (it imports
  `WEEKLY_RENT_YEN` from `constants.ts` directly today) + its `advanceDay.ts` call site.
- [x] `context.ts` `buildSimContext`: gains the economy parameter — update ALL call sites (grep at
  implementation: `gameStore.ts`, `cli/exportCareers.ts`, and the ~16 sim test files that call it
  positionally; consider making economy the last parameter with a default to keep the test churn
  mechanical).
- [x] Log entries: `auction-outbid` (new, gated on displacing the player), hammer win/loss reusing
  existing entry types where shapes fit (loss gated on `playerHasBid`).
- [x] Bots: rewrite `buyoutHelpers.ts` -> war helper; update all 6 bidding bots' call sites.
- [x] `WEEKLY_RENT_YEN` -> 0 (in economy.json) with the restore-in-Sprint-23 comment.
- [x] Telemetry: `bots/runCareer.ts`'s `bucketFor`/fraction computation switches to hammer/anchor
  ratio (it hardcodes the old `[reserve, buyout]`-fraction basis today); keep CSV shape. Python
  side: `tools/balance/src/balance/report.py`'s `BUCKET_TARGETS`/`render_auction_section` get the
  new bucket definitions — steal < 0.65, mid 0.65-0.9, frenzy > 0.9 of hammer/anchor; first-pass
  targets steal 10-25% / mid majority / frenzy 5-15% — plus the doc line explaining the basis.

### Game (`packages/game`)

- [x] `gameStore.ts`: `lotDetail` exposes board state (current bid, leader, turnout, quiet count,
  buyout, backstop); `myActiveBids` re-filters on `playerHasBid` (keeps showing lots the player is
  currently LOSING — that view is the panel's point); bid action validates the increment ladder.
- [x] `AuctionScreen.vue` board rework; `dayLogFormat.ts` outbid/hammer lines; remove gauge UI.

### Testing

- [x] `bidding.test.ts` rewrite: determinism of the overnight step; hammer-on-quiet; backstop;
  reserve/no-sale; ceiling-tie goes to player; buyout floor always > current bid; increment
  enforcement.
- [x] Distribution probes (the sprint's real acceptance evidence, sim-level, no bots): across a
  generated lot population — hammer/anchor lands mostly in ~0.6-0.85 with a real upper tail; a
  scripted patient bidder (raises to a fair target, walks above it) acquires cheaper than buyout on
  >= 70% of lots it pursues.
- [x] Test suites owned by deleted/rewritten code: `packages/sim/tests/lotInterest.test.ts`
  (deleted with `computeLotInterest` — remove or rewrite against turnout bands),
  `packages/sim/tests/buyoutHelpers.test.ts` (rewritten with the war helper),
  `packages/game/src/screens/AuctionScreen.test.ts` (selectors/labels for the old gauge and bid
  controls all change).
- [x] Golden masters re-pinned once, at the end.
- [x] Migration golden-save test (with in-flight bids).

## Claude-implementable vs user-only

**Claude-implementable:** all of the above, including `pnpm balance:run` re-run (standing
permission, 2026-07-10) — read as mechanism telemetry, not fun-validation.

**User-only:** browser feel-test of the new board (the "does it feel like a bidding war" question is
the whole point and only a human can answer it); wording pass on turnout/board copy; GDD 6.5 needs a
maintainer-approved edit to match the new mechanism (GDD is frozen — this rework is maintainer-
directed, so the edit is sanctioned, but the GDD text itself is the maintainer's).

## Definition of done

All checks green (`typecheck`/`lint`/`format`/`test:coverage`/`build`); both distribution probes
pass as tests; save migration golden-tested; the auction screen plays the new model end to end;
sprint doc Exit section written honestly, including anything that deviated.

## Exit

Implemented in three staged sub-agent passes (A: config foundation, B: sim core + bots + telemetry,
C: game layer), plus this closeout (D). The pre-existing uncommitted 2026-07-10 batch (cautiousRestorer
bootstrap fix and related changes already sitting in the working tree) was preserved and edited on top
of rather than reverted or stashed, and will be committed together with this sprint since the touched
files are entangled.

**Stage A — the tuning surface moves to content.** Existing economy/auction tunables (including
`STARTING_CASH_YEN`) moved verbatim into `packages/content/data/economy.json` behind a new
`EconomyConfigSchema`, threaded through the sim via a new `economy` field on `SimContext`
(`buildSimContext`'s economy parameter, defaulted so existing call sites keep compiling). Golden-master
hashes were unchanged by this move, which is the actual proof it was behaviorally inert, not just an
assertion. 515/515 tests green at the end of this stage.

**Stage B — sim core rewrite.** `AuctionLot`'s schema swapped `playerMaxBidYen`/`rivalEscalatedBidsYen`
for `currentBidYen`/`leadingBidder`/`quietDays`/`playerHasBid` (`SAVE_VERSION` 11 -> 12, migration, and
golden-save tests covering in-flight bids). `bidding.ts` was rewritten around open bidding:
`anchorValueYen`, `demandCeilingYen`, `turnoutBand`, `bidIncrementYen`, `nextRaiseYen`,
`computeBuyoutPriceYen`, `advanceLotOvernight`, and `resolveLotForDay` (renamed from the old
`resolveDueAuctionLot` because it now runs every active lot every day, not just lots due on that day),
plus `resolvePlaceBid` reworked to open-raise semantics and a new `resolveBuyoutInstant`. Deleted
outright: `buildRivalField`, `applyDailyEscalation`, `computeBidHeadroom`, `computeLotInterest`,
`resolveAuction`, `resolveTopBidAuction`, `auctionBidValueFor`, plus 10 dead constants. New economy
knobs were born directly in `economy.json`: wholesale fraction 0.75, demand-spread sd 0.12, thin-turnout
chance/factor 0.15/0.6, counter chance 0.7, quiet-days-to-hammer 2, bid increment fraction 0.05, turnout
bands [0.85, 1.12], buyout premium 1.25. `WEEKLY_RENT_YEN` moved to 0 with a restore-in-Sprint-23
comment, per the 2026-07-10 maintainer decision to turn rent off until the economy works end to end.
All 6 bidding bots were rewritten onto a shared war helper, replacing `buyoutHelpers.ts`; a real
behavior change from Sprint 19, implied but not spelled out verbatim by the design doc's "if not
leading... raise" framing, is that bots can now re-raise a lot they're currently losing (not just enter
once and wait). Telemetry (`runCareer.ts`'s bucket computation, `report.py`'s bucket definitions) was
re-based from the old `[reserve, buyout]` fraction basis to hammer/anchor ratio buckets (steal < 0.65,
mid 0.65-0.9, frenzy > 0.9); `auctionFieldSizes.csv` and its export pipeline were deleted outright since
its subject, the per-lot rival field, no longer exists as a concept. Golden masters were re-pinned once
at the end of this stage (`9a805efb`, `f120f5fb`). 341/341 sim+content tests green; `pnpm balance:run`
completed clean; all 5 Python balance invariants pass.

**Stage C — game layer.** `gameStore.ts`'s `lotDetail` now exposes board state (current bid, leader,
turnout word, quiet-day count, buyout price, backstop date); `myActiveBids` re-filters on
`playerHasBid` — deliberately still includes lots the player is currently losing, since surfacing "you
were outbid, go raise" is the panel's whole point, not an incidental side effect. `AuctionScreen.vue`
was reworked into the open board: current bid + leader, turnout word, quiet-state line, a raise control
pre-filled to the minimum legal increment, an always-visible Buy Now, and the backstop date; the old
headroom gauge and fuzzy win-range UI were removed. `dayLogFormat.ts` gained an `auction-outbid` case;
it uses lot-id phrasing rather than the design doc's illustrative "{car}" example, a deliberate
deviation kept for consistency with how every other auction log line in the file already formats.
Tests across `gameStore`/`AuctionScreen` were rewritten to match. **Final gate, run at the end of Stage
C:** `pnpm typecheck` + `pnpm lint` + `pnpm format` + `pnpm test` (520/520 across 56 files) + `pnpm
build` — all green.

**Real open finding, disclosed and deliberately not fixed here.** The hammer/anchor bucket
distribution measured by `pnpm balance:run` lands at steal 85.4% / mid 14.6% / frenzy 0.0%, well off
this doc's own first-pass targets (steal 10-25% / mid the majority / frenzy 5-15%). Root cause: at
`AUCTION_COUNTER_CHANCE` 0.7 and `AUCTION_QUIET_DAYS_TO_HAMMER` 2, most wars hammer after only ~2-4
real days of back-and-forth, well before the price climbs anywhere near the demand ceiling — so most
lots clear cheap by construction, not just when a bidder gets lucky. This is the good news for the
sprint's actual design goal (patient bidding beats buyout emphatically), but the bucket *shape* itself
doesn't match the doc's guessed prose band. Deliberately NOT retuned as part of this sprint: feel and
tuning is the maintainer's call, informed by a real browser playtest and revisited against Sprint 23's
invariants, not something to guess twice in a row. The sim-level distribution-probe tests in
`bidding.test.ts` pin the real measured numbers (median hammer/anchor ~0.54), not the doc's guessed
band, following the project's established precedent of reporting the measured number rather than
asserting an unvalidated target (see Cautious Restorer's and Flipper's precedent in `TODO.md`). Tracked
as an open finding in `TODO.md` under "Auction calibration, real-data finding (2026-07-11, Sprint 20
auction rework II)".

Definition of done: all checks green; both distribution probes pass as tests; save migration
golden-tested; the auction screen plays the new model end to end. Outstanding: the three user-only
items (browser feel-test, turnout/board copy wording pass, GDD 6.5 maintainer edit) — left unticked
above, not Claude's to do.
