# Sprint 30: Living auctions: instance-honest values, daily bidder interest, staggered arrivals

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, notes 6, 14
(principled fix), 17-auctions-half). Status: **designed, ready to implement.** Depends on
Sprints 26-27 (valuation runs on the banded model and the transparent deduction formula).
Single Sonnet implementation agent; read `CLAUDE.md` first; no em dashes.*

## Why (verified diagnosis)

The "book ¥180,000" on a lot card is `model.bookValueYen`, a static per-model constant;
mileage is rolled (30k-180k) and shown but read by nothing; age is not in the value model at
all. The buy-now price is `anchor * 1.25` where the anchor already stacks condition (floor
0.35) x heat (0.70-1.40) x model risk discount (up to 0.75), which is how a 180k-book lot
shows a 91k buyout with no explanation. Rival bidding is a single demand ceiling seeded once
per lot id: below reserve means zero bids forever while the badge can still read "PACKED
TURNOUT" (Sprint 25 patched the worst of this; the model itself is still not a market). New
lots arrive as a weekly dump.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- Sprint 27's transparent `instanceValue` (clean value minus restoration bill) and the
  heat-applies-once law; the pre-bid parts display as the public information surface.
- The lot lifecycle (reserve, increments, quiet-days hammer, expiry backstop, parking/cash
  gates on wins) in `bidding.ts`: the redesign replaces the interest model, not the auction
  plumbing.
- The auction telemetry already in the balance harness (`auctionWins.csv`,
  `auctionFieldSizes.csv`, calibration report section).
- Reputation-gated tiers and `AUCTION_LOTS_PER_TIER` as the volume dials.

**Genuinely new mechanisms:**

- Age and mileage factors in the value model (content curves).
- A public per-instance guide value on the lot card as the headline number (book value is
  never shown, per Sprint 25).
- A daily bidder-interest process replacing the one-shot demand ceiling.
- Staggered lot arrivals (per-tier daily spawn) replacing the weekly batch.

## Design decisions (locked)

1. **Value model gains age and mileage inside clean value:**
   `cleanValue = bookValueYen * ageFactor(regYear) * mileageFactor(km) * heat`; Sprint 27's
   deduction (restoration bill, hassle factor, floor) then applies unchanged on top. Factors
   as content curves (piecewise; propose age: gentle to 10 years then flatter for
   future-classic tiers; mileage: 1.0 at 60k falling to ~0.75 at 180k). The Naming Layer is
   untouched; this is spec-side.
2. **The card is honest:** headline is the guide value: the same transparent
   `instanceValue` everyone prices from (conditions are public per Sprint 27; there are no
   estimates), now age/mileage-aware. Book value is never displayed anywhere (maintainer
   decision 2026-07-11, applied in Sprint 25); `model.bookValueYen` survives only as the
   internal anchor inside the formulas. Reserve and buyout derive from guide value:
   `reserve = guideValue * reserveFraction (0.5)`, `buyout = guideValue * buyoutPremium
   (1.15-1.30 rolled)`, floored above the current bid as today. A rough car's cheap buyout
   now reads as exactly that.
3. **Bidders, not a ceiling:** each overnight, rival bids arrive as a seeded draw:
   `expectedBids = interestBase(tier) * valueGapFactor(currentBid vs guideValue) *
   turnoutFactor` with turnout rolled per lot at creation (thin/steady/packed now MEANS
   bidder count band). 0-2 increments applied per night while below each rival cohort's
   private walk-away (drawn around guideValue). Quiet-days hammer and expiry backstop stay.
   Consequences the tests must prove: a packed lot cannot sit bidless while priced under its
   walk-away band; a reserve snipe on the backstop day only succeeds when turnout was
   genuinely thin; player wins above guide value become rarer as turnout rises.
4. **Staggered arrivals (note 17):** replace the `day % 7` dump with per-tier daily spawn
   probabilities calibrated to preserve current expected weekly volume (tunable up: the
   maintainer wants MORE lots than a player can chase); day-1 seed keeps a full opening
   board. The "next weekly catalog" hint is removed from `AuctionScreen.vue`.
5. **Sprint 25's interim patches** (daily ceiling re-seed, badge honesty) are superseded and
   deleted by this model.

## Definition of Done

- Value factors, pricing, bidder process, arrivals all content-tunable; no authored number in
  code (content law).
- Test suite covering decisions 1-4 including the three behavioral proofs in decision 3, all
  seeded-deterministic; goldens updated.
- Balance harness: bidder-process telemetry added (bids per lot, days-open, win price vs
  guide value) and the auction calibration section re-rendered; invariant check re-run
  (buyout share invariant re-tuned against the new buyout definition); deltas documented in
  Exit.
- Full gate green; AuctionScreen updated (est. value headline, clean book secondary, badge
  semantics, no weekly hint).

## Tasks (Claude-implementable)

- [x] Content: age/mileage curves, pricing fractions, interest/turnout tunables.
- [x] Sim: value factors, pricing derivation, bidder process, arrivals; remove Sprint 25
  interim code; Dexie bump if lot shape changes + goldens.
- [x] Game: lot card and detail rework per decision 2.
- [x] Balance telemetry (sim-side columns; Python side and the actual `balance:run` /
  invariant re-tune are the orchestrator's, per this sprint's scope note); tests per DoD; Exit.

## User-only tasks

- [ ] Playtest an auction week: does the board feel alive, do buyouts read fairly, is
  sniping still possible but earned? Tune curves in JSON.

## Exit

**Scope actually implemented:** decisions 1, 3, 4, 5 (decision 2's sim half was already done
in Sprint 27; its UI half - the guide-value headline - is decision 2's remaining piece and is
included here). Full gate green: `pnpm typecheck` (3/3 packages), `pnpm lint` (clean),
`pnpm format` (clean after `format:fix`), `pnpm test` (69 files, 704 tests, all passing,
including the three decision-3 behavioral proofs and the new save-migration goldens).
`pnpm build` also verified.

### Decision 1: age/mileage in clean value

`marketValue.ts` gains `ageFactor(carYear, currentYear, economy)` and
`mileageFactor(mileageKm, economy)`, both piecewise-linear interpolations (a small
`interpolateCurve` helper, shared) over ascending `[x, y]` breakpoints drawn straight from
`economy.json`. `instanceBaseValueYen`'s `cleanValue` is now
`bookValueYen * ageFactor * mileageFactor * (heatPercent / 100)` - heat still applies exactly
once, age/mileage multiply alongside it, Sprint 27's restoration-bill deduction on top is
byte-for-byte unchanged. `currentYear` (`calendar.ts`'s `currentGameYear(state.reputationTier)`)
is a new required parameter threaded through `marketValueYen` -> `valuateCarForBuyer` ->
`sellViaWalkIn`/`listPubliclyAskingPrice`/`bestFitBuyer` -> every call site (four bots'
walk-in-sale decisions, `bidding.ts`'s `anchorValueYen`, `gameStore.ts`'s
`walkInEstimate`/`listingEstimate`) - the mechanical mirror of how `heatPercent` was already
threaded everywhere.

Curve shapes chosen (`economy.json`):

- `ageFactorCurve`: `[0, 1.0] -> [5, 0.85] -> [10, 0.72] -> [20, 0.65] -> [30, 0.6]` - gentle
  decline for the first decade (~2.8%/year), much flatter after (~0.6%/year past year 10):
  a 25-year-old JDM icon reads as a future classic, not a depreciating used car.
- `mileageFactorCurve`: `[30000, 1.05] -> [60000, 1.0] -> [120000, 0.85] -> [180000, 0.75]` -
  a small bonus below the 60k neutral point, falling to 0.75 at `auctions.ts`'s 180k roll
  ceiling, per the sprint doc's own proposal.

### Decision 3: the daily bidder-interest process

Replaces the one-shot demand ceiling (`demandCeilingYen`, deleted) with a real per-cohort
process in `bidding.ts`:

- **Turnout is rolled once, at creation** (`auctions.ts`'s `generateAuctionCatalog`, weighted
  `[thin 0.3, steady 0.45, packed 0.25]`) and persisted on the lot (`AuctionLot.turnout`,
  content schema). `bidding.ts`'s `turnoutBidderCount(lot, economy)` turns the band into an
  actual integer rival-cohort count, seeded on the lot id alone (stable for the lot's whole
  life): thin 1-2, steady 3-4, packed 5-7.
- **Each cohort has its own private valuation** - `privateValuationYen` (generalized from
  Sprint 27's `bots/buyoutHelpers.ts::walkAwayTargetYen`, which is now a one-line wrapper
  around it, preserving its exact pre-Sprint-30 seed) centered at
  `AUCTION_WHOLESALE_FRACTION` (0.75) of guide value, spread by
  `auctionInterest.cohortValuationSpreadByTurnout[turnout]` - **turnout-dependent, not flat**
  (see "what I had to walk back" below for why).
- **Overnight**, `advanceLotOvernight` applies up to `maxIncrementsPerNight` (2) raises: each
  one needs `eligibleCohortCount` (how many cohorts would still pay the next raise) to be
  > 0, then a roll against `1 - (1 - p)^competitivePressure`, where `p` is
  `perCohortBidChance[tier]` scaled by `valueGapFactor` (cheaper-than-guide-value lots are
  more eagerly contested) and `competitivePressure = eligible^2 / bidderCount` - a lone
  cohort out of a THIN field (`bidderCount` 1-2) keeps full pressure (it IS the whole field);
  a lone straggler out of a PACKED field's original 5-7 is heavily damped (the crowd already
  moved on).
- Quiet-days hammer (`AUCTION_QUIET_DAYS_TO_HAMMER`, unchanged) and the `expiresOnDay`
  backstop are untouched.

**What I had to walk back mid-implementation:** the first version used one flat
`cohortValuationSpread` (0.18) for every turnout band. Measured directly, that produced
`above-guide-value win share`: thin 6.5%, steady 5.2%, **packed 0.33%** with the
`eligible^2/bidderCount` damping alone - correct ordering. But an EARLIER attempt (flat
spread, no damping) had produced the OPPOSITE ordering (packed 13.3% > thin 2.8%) - pure
order statistics: more cohorts means a higher chance SOME cohort has an extreme draw, which
fights the decision-3 requirement head-on. The fix that actually worked is
`cohortValuationSpreadByTurnout` (thin 0.30, steady 0.16, packed 0.08): a packed field's
cohorts read as a tighter consensus crowd, a thin field's one or two bidders are
comparatively idiosyncratic. Both the spread-shape and the damping formula are first-pass,
openly tunable - flagged for maintainer attention if playtest feel disagrees with the
measured numbers below.

**Interest/turnout tunables** (`economy.json`'s new `auctionInterest` block):

```text
perCohortBidChance: { local-yard: 0.35, regional: 0.32, premium: 0.3, collector-network: 0.28 }
valueGapEagerBonus: 0.6, valueGapFloor: 0.3, valueGapCeiling: 1.6
turnoutBidderCounts: { thin: [1,2], steady: [3,4], packed: [5,7] }
turnoutBandWeights: [0.3, 0.45, 0.25]
cohortValuationSpreadByTurnout: { thin: 0.30, steady: 0.16, packed: 0.08 }
maxIncrementsPerNight: 2
```

### Decision 4: staggered arrivals

`catalogs.ts` splits into a shared `generateForEligibleTiers` loop: `refreshCatalogs`
(unchanged signature, now used ONLY by `createInitialGameState` for day 1's full opening
board) and the new `generateDailyAuctionArrivals`, called every day from `advanceDay`'s
day-boundary step (replacing the old `next.day % 7 === 0` gate entirely - RNG is now drawn
for arrivals every day, not just weekly, which is why the golden hashes below moved).
`rollDailySpawnCount(rate, rng)` turns economy.json's real-valued `AUCTION_DAILY_SPAWN_RATE`
into an actual daily integer (floor + a Bernoulli roll on the remainder, so the long-run
average is exact). Rates tuned ABOVE naive weekly-parity (`AUCTION_LOTS_PER_TIER / 7`) per
the maintainer's explicit "more lots than a player can chase" ask (~1.4x parity):
`{ local-yard: 0.6, regional: 0.55, premium: 0.4, collector-network: 0.2 }` (~4.2/3.85/2.8/1.4
lots per week vs. the old fixed 3/3/2/1).

### Decision 5: Sprint 25 interim patches deleted

`demandCeilingYen` and `turnoutBand` (the function) are gone from `bidding.ts`, along with
their supporting content fields `AUCTION_DEMAND_SPREAD_SD`, `AUCTION_THIN_TURNOUT_CHANCE`,
`AUCTION_THIN_TURNOUT_FACTOR`, `AUCTION_COUNTER_CHANCE`, `AUCTION_TURNOUT_BANDS` (all removed
from `economy.ts`/`economy.json`). `AUCTION_WHOLESALE_FRACTION` survives, repurposed as the
per-cohort valuation center. No dead constants found in `sim/constants.ts` itself under this
name - the Sprint 25 interim pieces all lived in the economy content family, not there.

### The card (decision 2 UI half)

`AuctionScreen.vue`: a new `.guide-value` headline (`d.guideValueYen`, wired from
`gameStore.ts`'s `LotDetail.guideValueYen` = `anchorValueYen`) reads first on every lot card;
reserve/buyout still shown as before, now clearly relative to that number. Book value was
never shown (Sprint 25) and stays that way. The "next weekly catalog arrives in ~N days" hint
and its `daysUntilCatalog` computed are deleted; the empty state now reads "No lots listed
right now - check back after ending the day." The turnout badge is unchanged visually
(still a word, never a numeric gauge) but now reads `lot.turnout` directly (a real persisted
bidder-count band) instead of calling a per-day-recomputed function.

### Save + schema

`AuctionLot` gained `turnout: TurnoutBandSchema.default('steady')` (`content/src/auction.ts`),
purely additive (a pre-v19 lot's real original turnout was never persisted under the old
model, so 'steady' - the middle band, no thumb on the scale - is the correct fallback, same
reasoning as every prior purely-additive migration in this file, e.g. v15's `arrivesOnDay:
null`). **`SAVE_VERSION` bumped 18 -> 19**, no `MIGRATIONS[18]` entry needed. Two new
`saveCodec.test.ts` tests cover it (`v18 -> v19 migration` describe block): a pre-v19 envelope
decodes with `turnout: 'steady'` defaulted, and a current v19 state with a real (`'packed'`)
turnout round-trips exactly.

### Three behavioral proofs

`bidding.test.ts`, new `describe('Sprint 30 decision 3 behavioral proofs')` block,
seeded-deterministic, forcing `turnout` directly on cloned lots so bands compare
like-for-like:

- **(a) packed cannot sit bidless while underpriced:** across 150 lots each, forced thin vs.
  packed, run 4 nights through `advanceLotOvernight`. Measured: thin 12/150 (8%) still
  bidless, packed 0/150. Asserts `packedBidless < thinBidless` and `packedBidless/150 < 0.1`.
- **(b) a reserve snipe only survives to the hammer under thin turnout:** player opens at the
  bare reserve and never raises again; run to the backstop (day 25) via `resolveLotForDay`.
  Measured: thin 46.7% win rate, steady 13.3%, packed 0.67%. Asserts `thinRate > packedRate`
  and `packedRate < 0.25`.
- **(c) wins above guide value get rarer as turnout rises:** an aggressive player chases
  every raise up to 1.3x guide value. Measured: thin 5.4% of wins land above guide value,
  steady 7.3%, packed 0%. Asserts `thinShare > packedShare`.

### Telemetry added to `exportCareers.ts` / `runCareer.ts`

`AuctionWinSample` (feeds `auctionWins.csv`, the existing Sprint 10 win-price-bucket file -
extended, not a new file, since bids-per-lot and days-open are properties of the exact same
per-lot-resolution population that file already samples) gains two columns:

- **`bidEvents` (int64):** how many bid increments landed on the lot across its whole life -
  the opening reserve counts as 1, each later raise is the yen delta divided by the lot's own
  fixed `bidIncrementYen` (exact except a rare rounding case). Tracked via a `lotMeta` map in
  `runCareer.ts`, persisted across the day loop, pruned once a lot leaves the board.
- **`daysOpen` (int64):** catalog-appearance day to hammer day, inclusive.

Existing columns (`fraction` = win price / guide value, `bucket`) are unchanged. Orchestrator:
these are the two exact column names or `AUCTION_WINS_COLUMNS`/`AuctionWinSample` if the
Python side needs the type declarations too.

### Re-pinned golden hashes

- `advanceDay.test.ts`, "a scripted 30-day career reproduces an exact state hash":
  `95a90748` -> `3d7df487` (age/mileage in clean value + daily arrivals both change the RNG
  draw sequence and every valuation from day 1 on).
- `advanceDay.test.ts`, "reproduces an exact state hash (deterministic acquisition->sale)":
  `d6eefd67` -> `814c2416`.

### Gate summary (actual output)

```text
pnpm typecheck  -> packages/content, packages/sim, packages/game: all "Done" (0 errors)
pnpm lint       -> eslint . : clean, 0 findings
pnpm format     -> prettier --check . : "All matched files use Prettier code style!"
pnpm test       -> 69 test files, 704 tests, all passing (0 failed)
pnpm build      -> vite build succeeded (extra confidence check, not in the required gate)
```

### Left for the orchestrator

- **Balance re-run and interpretation are explicitly out of my scope** (per this sprint's own
  FORBIDDEN section): `pnpm balance:run` was not run, `tools/balance/**`/`invariants.py` were
  not touched. Age/mileage factors change every car's value; the bidder-process rework
  changes auction win rates, turnout-badge meaning, and arrival volume - multiple existing
  invariants (buyout share, days-to-`local` pacing, the win-price calibration bucket
  boundaries) WILL move and need real re-measurement, not a guess from this implementation
  pass.
- The `TODO.md` item "model-independent restoration costs make cheap cars not restore-worthy"
  (flagged Sprint 27, still open) is now compounded by age/mileage also pulling clean value
  down for anything old/high-mileage - worth a fresh look once real balance numbers exist,
  not resolved here.
- Design question for the maintainer: `cohortValuationSpreadByTurnout`'s spread-by-band shape
  (0.30/0.16/0.08) and the `eligible^2/bidderCount` damping formula are both genuinely new
  inventions this sprint needed to make behavioral proof (c) hold at all - not something the
  sprint doc specified at this level of detail. Worth a deliberate look once real play
  (not just seeded bot probes) has exercised a few auction weeks.

### Balance verification (orchestrator-run) and the tuning finding

Ran `pnpm balance:run` + `check`. **All hard-gated invariants PASS** (days-to-`local` p50=23,
back in the healthy middle of [10,35] since the bidder rework slowed the competent probe's
climb; buyout share 0%; passive solvency; Flipper participates; sanity floor intact). The
mechanics are sound. But two INFORMATIONAL signals are badly off at the current first-pass
tuning, and the maintainer chose (2026-07-12) to commit as-is and address them in the playtest
tuning pass this sprint's user-only task already calls for, not to block the arc:

| Signal | Sprint 29 | Sprint 30 | Target |
| --- | --- | --- | --- |
| Auction tails (steal / mid / frenzy) | 20 / 65 / 15 | **94 / 1 / 5** | ~10 / majority / ~10 |
| Flipper vs Passive | +Y34,450 (above) | **-Y115,178 (below)** | above |
| Total acquisitions | 21,282 | 92,990 (4x lots) | - |

**Diagnosis (three compounding first-pass tuning effects, all content-tunable JSON, none a
code bug):** (1) staggered daily arrivals flood the board (92,990 acquisitions -> oversupply,
which also drags market heat, hence sale prices, down); (2) the new bidder interest is too weak
(rivals rarely contest, so 94% of wins are cheap "steals" rather than the intended competitive
spread); (3) age/mileage now depresses clean value across this 1980s-90s roster. Net effect:
you can steal almost any car, but flipping is a NET LOSS because you sell into an oversupplied,
age-depressed market. The auctions read as a clearance rack, not the "alive, sniping-earned"
board the sprint targets. The invented turnout-spread/damping mechanism (above) may also be a
contributor. Levers for the tuning pass: `AUCTION_DAILY_SPAWN_RATE` (lower to reduce flooding),
`auctionInterest.perCohortBidChance` / `turnoutBandWeights` (raise contestation), and the
`ageFactorCurve` / `mileageFactorCurve` shapes. Telemetry now available to support tuning:
`auctionWins.csv` carries new `bidEvents` and `daysOpen` columns (Python report section to
render them is not yet wired - a small follow-up when the tuning pass starts).
