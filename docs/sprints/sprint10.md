# Sprint 10 — Auction realism, pacing, and feedback

*Source: the maintainer's direct playtest notes (2026-07-09) after actually running the game through
Sprint 09. Eleven items reported; this sprint covers the ones fixable without an architecture or
data-model change (items 1, 2, 3, 4, 5, 6, 10, 11 of that list). Items 7/8/9 are their own sprints —
see `TODO.md` and the roadmap note added this session. Status: **implemented, ready for review.***

## Goal

The maintainer's framing: "not looking for polish or perfect balance... the goal is just to land on
something playable and fun to interact with." This sprint is a bugfix-and-tuning pass, not a rebuild:
every item here is a contained fix to an existing mechanic, provable by playing the game differently
afterward. No `GameState` shape change beyond one small addition (day-1 seeding needs no new fields
at all — it reuses the weekly-refresh generators verbatim).

## Reuse analysis (directive 15 — read before any code)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprint uses it |
|---|---|---|
| Auction catalog generation | `generateAuctionCatalog` + `AUCTION_LOTS_PER_TIER` + `AUCTION_LOT_EXPIRY_DAYS` (already called at the day-7 boundary in `advanceDay`) | **Day-1 seeding calls the exact same function** — extracted into one shared `refreshCatalogs` helper both `createInitialGameState` and `advanceDay`'s weekly branch call, so the "which tiers, how many, how long" logic exists once. |
| Service-job offer generation | `generateServiceJobOffers` (already called weekly) | Same extraction — day-1 seeding is not a new generator, it's the existing one called once more. |
| Sell-side valuation | `valuateCarForBuyer` (used by walk-in offers, listings, AND rival bids today) | The function itself is **untouched** — it keeps its hard-won correctness history (Sprint 03's "capped below book" bug). What changes is that rival *bids* stop calling it directly and call a thin new `auctionBidValueFor` wrapper (`× discipline`) instead, so selling stays full-retail while bidding drops below it. One formula, two clearly-named entry points. |
| Per-bidder noise | `biddingNoiseFactor` (deterministic per-bidder aggression) | **Untouched** — still layered on, now on top of the disciplined bid value. |
| Reputation ordering | `ReputationTierSchema` (content) | The calendar year formula reads tier index straight from `ReputationTierSchema.options` — no new ordering array (there's already a private, unexported `REPUTATION_ORDER` inside `advanceDay.ts`; this sprint replaces it with the schema-derived read so there's one source of tier order, not two). |
| Day's event log | `DayLogEntry` / `dayLog` | Job-completion feedback reads the existing `service-job-completed` / `service-job-failed` log entries' payload — extended with two new optional numbers, not a parallel reporting system. |
| Feedback-modal precedent | `DayReport.vue` (a full-screen overlay driven by a store ref, dismissed by a button) | The new job-completion modal **copies this exact component shape** (overlay + store ref + dismiss button) rather than inventing a different popup pattern. |

### Genuinely new mechanisms (and why nothing existing covers them)

The auction is the bulk of this sprint — the maintainer's playtest called it "so fucked" across
three notes (#4, #5, #10) and, on review, asked for a calibrated **bell curve of outcomes** (steal
rare, mid common, frenzy rare) and an **average field of 3–9 bidders**. Five distinct root causes:

1. **The rival field is 1:1 with the 5 named archetypes (#4's "5 rivals on everything").** Nothing
   varies how many bidders show up; the model literally uses the buyer list as the room. So a lot
   draws at most 5, always the same 5, always reading "frenzy" — and 3–9 average is unreachable by
   construction. Fix: a **variable, bell-distributed field of anonymous bidders** sampled from the
   archetypes interested in that car (decisions 4b/4c). This is the structural change everything else
   rides on.
2. **Auction-bid value ≠ resale value — the core economic bug (#5's "can only be bought outright").**
   `valuateCarForBuyer` is used for two contradictory jobs: what a customer pays for the player's
   *finished* car (full retail — Sprint 03 deliberately raised this ceiling) AND what a rival dealer
   bids to *acquire a rough car at auction* (must be well BELOW retail — a dealer needs flip margin).
   Rivals currently bid full retail (up to ~1.9× book), so there is no buy-low/sell-high gap and
   buyout is the only path. `auctionBidValueFor = valuateCarForBuyer × discipline` restores the gap;
   sell-side valuation untouched (decision 4a).
3. **The interest gate is inert (#4's "every buyer wants every car").** `tierPreferences` exists but
   every buyer falls back to a nonzero default for tiers they never listed, so it gates nothing today.
   Requiring an *explicit* entry turns it into the real "who is interested" filter that shapes each
   lot's field composition (decision 4c).
4. **The interest estimate answers the wrong question (#5's "bid above the high and still lost").**
   The shown range centers on the *second-highest* bid (clearing price), but winning means beating the
   *highest*. Re-center on the top expected bid: "bid ~X to win" (decision 4d).
5. **No buyout ceiling on rival bids (#10).** Nothing stops a rival's noised valuation from exceeding
   what buyout would have cost — the maintainer literally lost a car to a bid above buyout. Cap every
   rival bid at the lot's buyout price (decision 4e).
6. **A calendar (`currentGameYear`) (#6).** GDD §2.2 already specifies this ("1995 → 2005 over a full
   campaign, ~2 years per rep tier") but nothing computes or reads it today. New, small, pure function.
7. **A job-completion feedback modal (#11).** `DayReport` only fires on End Day; service-job
   completion is already instant (Sprint 08) and has no feedback surface of its own.

## Definition of Done

- A brand-new career has auction lots **and** service-job offers on day 1 — no "skip a week" ritual.
- Service-job flavor text never names a car the offer didn't actually roll.
- Every accepted-but-not-yet-committed job offer is visibly labeled as queued, not silently pending.
- **Auctions are winnable at a profit, not just via buyout.** A rival's auction bid is a *fraction*
  of a finished car's resale value (discipline), so there's a real buy-low margin; the average win
  price lands ~0.80×book, well under the 1.1×book buyout.
- **The rival field is a variable, bell-distributed count** — a typical lot draws several rivals
  (average ≈ 6, mostly in the 3–9 band), not a fixed 5-or-nothing, and the field size scales with how
  many archetypes want the car.
- **The win-price distribution is a bell**, verified by a harness report bucket, not just by feel:
  STEAL (near reserve) ≈ 5–10%, MID (mid-range) the majority, FRENZY (near buyout) ≈ 5–10%.
- **No rival bid ever exceeds the lot's buyout price** — a property test across seeds (fixes losing a
  car for more than buyout would have cost).
- **The interest read predicts what wins.** Bidding at or above the number the auction screen shows
  reliably wins the lot — re-centered on the top expected bid, not the clearing price.
- A lot's contender count and interest level reflect real tier fit — a car nobody wants can read
  "quiet" and be stolen near reserve, and "frenzy" is genuinely rare.
- No auction car (or its individual rolled `year`) predates or postdates the current in-game calendar
  year, which advances with reputation tier per GDD §2.2.
- Completing a service job (paid or failed) shows an immediate modal: a flavor line, the payout,
  the reputation change, and (for paid installs) the part cost and resulting profit.
- All checks green; new/updated tests cover every fix above; golden masters re-pinned only if they
  legitimately change (day-1 seeding, disciplined bids, and the calendar all touch `advanceDay`'s
  output, so expect it).

## Decisions (approve / adjust before implementation)

1. **Day-1 seeding reuses the weekly-refresh path via one shared helper**, not a parallel generator.
   `createInitialGameState` calls it once with `day=1`; `advanceDay`'s day-7-boundary branch keeps
   calling it every 7 days after. Collector Network stays gated behind `respected` reputation on day 1
   too (nobody starts with it).
2. **Service-job descriptions become generic — no hardcoded car names.** The actual resolved car name
   is already shown separately in the UI (`offer.carName`); the flavor text just needs to stop
   contradicting it. E.g. "Brakes are shot — sort them out." All 8 templates get rewritten; this is a
   content-only change (`serviceJobs.json`), zero code.
3. **Item 3 gets a two-stage fix.** Sprint 10 (this one) only clarifies the *existing* queued mechanic:
   an offer the player has clicked Accept on but not yet committed via End Day shows "queued — arrives
   after End Day," and it stays visually distinct from a genuinely-arrived car. The **real** fix — an
   explicit `arrivesOnDay` field and an instant accept that shows "arriving tomorrow" from the moment
   of the click — is Sprint 11's job, because accept needs to become an instant action first (its
   current mechanic is entangled with the whole `pending`/`commitDay` machinery Sprint 11 replaces).
   Shipping a half-fix now and the real one next sprint is better than blocking this sprint on
   Sprint 11's architecture.

4. **The auction rework (decisions 4a–4f) is the heart of this sprint.** One principle: the number the
player sees, the number a rival bids, and the number that wins must all be consistent with each other
and with the fantasy of "hunt a bargain, win it, flip it." The old model tied the rival field 1:1 to
the 5 named buyer archetypes (so a lot drew at most 5, and every lot drew all of them → permanent
frenzy). The revised model treats the 5 archetypes as *valuation profiles*, not the literal room:
each lot draws a **variable, bell-distributed field** of anonymous bidders sampled from the archetypes
who care about that car. This is what makes both the maintainer's asks reachable — a genuine bell
curve of outcomes, and an average field that can scale to 3–9.

4a. **Rivals bid to flip, not to keep — the core economic fix (#5's "can only be bought outright").**
   `valuateCarForBuyer` currently does two contradictory jobs with one number: what a customer pays
   for the player's *finished* car (full retail — Sprint 03 deliberately raised this) and what a rival
   dealer bids for a *rough car at auction* (must be below retail — dealers need resale margin). We
   split them: `auctionBidValueFor(buyer, model, car, parts) = valuateCarForBuyer × discipline`, a new
   tunable `AUCTION_BIDDER_DISCIPLINE` (first pass **0.70**). The sell-side valuation is **untouched**.
   Discipline is the primary lever for *where the winning price centers* and *how fat the frenzy tail
   is* — higher discipline = pricier wins + more frenzy.

4b. **A variable, bell-distributed rival field (#4's "5 rivals on everything," and the vehicle for the
   maintainer's 3–9 target and bell curve).** Each lot draws `N` anonymous rival bidders, where `N` is
   a **seeded bell-shaped roll** (normal-ish; implement as a deterministic sum-of-uniforms tuned to
   the target SD) around a mean that scales with how many archetypes want the car:
   `fieldMean = AUCTION_FIELD_BASE + AUCTION_FIELD_PER_INTEREST × interestBreadth`, `N ~ round(normal(
   fieldMean, AUCTION_FIELD_SIZE_SD))` clamped `≥ 0`, seeded on `hashStringToSeed(lot.id)`.
   `interestBreadth` = the sum of tier-preference weights across archetypes with an explicit interest
   in this car's tier (the gate, 4c). First-pass constants: **BASE 3, PER_INTEREST 1.5, SD 3.5** →
   fieldMean ≈ 4.5 (niche tiers) to ≈ 6.3 (popular tiers), N mostly in **3–9** (the target), and the
   SD is what sets the **steal-tail fatness** (a small field = a cheap win). A lot with *zero*
   interested archetypes draws no rivals and passes / goes at reserve.

4c. **The interest gate shapes WHO bids, not how many (#4's "every buyer wants every car").** An
   archetype is in a lot's *interested pool* only if it has an **explicit** `tierPreferences` entry
   for that model's tier — no more `DEFAULT_TIER_PREFERENCE_WEIGHT` fallback, which is what makes
   everyone want everything today. Each of the `N` anonymous bidders (4b) is assigned an archetype
   sampled from that pool **weighted by preference strength**, then bids `auctionBidValueFor × noise`
   (per-bidder noise seeded on `lot.id + ':' + index`). So a niche car draws both a *smaller* field
   (low breadth → low `fieldMean`) and a *cheaper* one (its few interested archetypes value it less);
   a broadly-loved car draws a bigger, richer, pricier field. `computeLotInterest` and `resolveAuction`
   run the identical seeded field construction, so the shown read and the real resolution never differ.

4d. **The interest estimate predicts what WINS, not the clearing price (#5's "bid above the high and
   still lost by 16 yen").** Today `computeLotInterest` centers on `bids[1]` (the second-price
   *clearing* number), but winning means beating `bids[0]`, the *top* bid. Re-center the shown read on
   the top expected bid of the constructed field and relabel it the winning threshold ("bid ~X to
   win"). Because the field is seeded and deterministic per lot, this estimate is near-exact (lightly
   fuzzed for uncertainty). Bid above it → win; second-price then usually charges a little less.

4e. **A hard buyout-price ceiling on every rival bid (#10: "lost to a bid that paid MORE than
   buyout").** Each rival's effective max is `min(auctionBidValueFor × noise, buyoutPriceYen)`,
   `buyoutPriceYen` via the same helper the auction-screen buyout button uses. Invariant: **no rival
   ever pays more than buyout**. This also becomes the natural top of the bell — a "frenzy" lot is one
   whose second-price clearing lands near the buyout cap.

4f. **The calibration target is an explicit bell, measured by the harness, tuned by three knobs.**
   Target distribution of the **price to win**, expressed as position within a lot's
   `[reserve = 0.4×book, buyout = 1.1×book]` range: **STEAL** (bottom ~20%, near reserve) ≈ **5–10%**;
   **MID** (middle ~60%) = the majority peak; **FRENZY** (top ~20%, near buyout) ≈ **5–10%**. A Monte
   Carlo of the model above with **fieldMean 6 / SD 3.5 / discipline 0.70** produces **STEAL 10% ·
   MID 82% · FRENZY 8%**, average field ≈ 6, average win price ≈ 0.80×book — squarely on target. The
   three knobs are orthogonal: **fieldMean** sets average bidder count, **SD** sets the steal-tail
   fatness, **discipline** sets the price center + frenzy-tail fatness. These are first-pass numbers;
   the harness gets a new report bucket (win price as fraction-of-range: steal/mid/frenzy) so the bell
   is *verified against data*, not eyeballed, and re-tuned by nudging one knob at a time.
   `AUCTION_BUYOUT_PREMIUM` and `AUCTION_BIDDER_NOISE_RANGE` are left alone this sprint.

**Deferred to a later "auction depth" sprint (per the maintainer):** *more distinct buyer archetypes*
(the current 5 profiles are thin — richer valuation variety makes the field's composition, not just
its size, more interesting) and any further magnitude tuning toward the upper end of the 3–9 band.
The variable-field model built here is the vehicle both ride on; nothing built now is thrown away.
5. **Calendar formula: `currentGameYear = 1995 + 2 * reputationTierIndex`**, read from
   `ReputationTierSchema.options.indexOf(tier)` (5 tiers → 1995/1997/1999/2001/2003 — a first-pass
   number matching GDD's "~2 years per tier," explicitly tunable later same as every other first-pass
   constant in this codebase). Auction generation gets a `currentYear` parameter: **eligible models**
   are filtered to `yearFrom <= currentYear` (today's roster only loses one car, the 1996 JZX90, until
   `local` reputation — verified against the actual seed content, not a guess), and **rolled instance
   years** are clamped to `min(yearFrom + 8, currentYear)` so an individual car can't roll a
   still-impossible year even when its model is already unlocked.
6. **Job-completion feedback is a new small modal, not folded into `DayReport`.** Job completion is
   already instant (doesn't wait for End Day), so it needs its own trigger. One paid flavor line, one
   failed flavor line (generic phrasing — no garage-name templating; there's no such field on
   GameState yet and adding one is out of scope here). Numbers shown: `payoutYen`, the reputation
   delta, and for install jobs the installed part's price and the resulting profit (payout − part
   cost) — derivable from the already-resolved car's build sheet at the moment of resolution, no new
   state needed. "Labor/time spent" is approximated as `daysSpent = state.day - (dueOnDay -
   SERVICE_JOB_DEADLINE_DAYS)` — good enough for a first pass; exact per-job labor accounting would
   need retaining job history, which is a bigger ask than this sprint's scope.

## Task breakdown

### A. Content (`packages/content`)

- [x] `data/serviceJobs.json`: rewrite all 8 `description` strings to be generic (no hardcoded car
  model references), keeping each template's `customerName`/`work`/`payoutYen`/`baseReputation`
  unchanged.

### B. Sim (`packages/sim`)

- [x] `newGame.ts` / a new small `catalogs.ts`: extract `refreshCatalogs(state, context, rng) ->
  { activeAuctionLots, serviceJobOffers }` from `advanceDay`'s day-7 branch; `createInitialGameState`
  calls it once for day 1; `advanceDay`'s weekly branch calls the same function.
- [x] `constants.ts`: four tunable auction knobs, first-pass values — `AUCTION_BIDDER_DISCIPLINE 0.70`,
  `AUCTION_FIELD_BASE 3`, `AUCTION_FIELD_PER_INTEREST 1.5`, `AUCTION_FIELD_SIZE_SD 3.5`. Comment them
  as the bell-calibration levers (fieldMean = count, SD = steal tail, discipline = price + frenzy tail).
- [x] `valuation.ts`: `auctionBidValueFor(buyer, model, car, parts) = valuateCarForBuyer × discipline`
  (4a). `valuateCarForBuyer` itself is **not touched** — selling stays full retail.
- [x] `bidding.ts` — the variable-field model (4b/4c/4d/4e), a single seeded field constructor shared
  by resolution and the interest read so they never disagree:
  - `interestedArchetypes(model)` — archetypes with an **explicit** `tierPreferences` entry for the
    model's tier; `interestBreadth` = the sum of their weights.
  - `buildRivalField(lot, model, parts)` — rolls `N ~ round(bellNormal(fieldMean, SD))` clamped `≥ 0`
    (seeded on `lot.id`), assigns each of the `N` anonymous bidders an interested archetype
    (preference-weighted sample), and returns each bid = `min(auctionBidValueFor × noise,
    buyoutPriceYen)` (per-bidder noise seeded on `lot.id + ':' + index`). Empty interested pool → `N = 0`.
  - `resolveAuction` consumes `buildRivalField` + the player's bid, second-price as today.
  - `computeLotInterest` consumes the **same** `buildRivalField`, reports the field's *count* and a
    winning-threshold estimate centered on the **top** bid (`bids[0]`, lightly fuzzed). Recalibrate the
    quiet/warm/hot/frenzy level thresholds for the new (larger, variable) field sizes.
  - `bellNormal(mean, sd, rng)` — a small deterministic normal-ish sampler (sum-of-uniforms scaled to
    `sd`); lives in `rng.ts` next to the existing helpers.
- [x] New `calendar.ts` (or added to `constants.ts`): `currentGameYear(reputationTier): number`.
- [x] `auctions.ts`: `generateAuctionCarInstance` / `generateAuctionCatalog` gain a `currentYear`
  parameter — filters eligible models, clamps rolled instance years. `generateServiceJobOffers`
  threads the same parameter through (it also calls `generateAuctionCarInstance`).
- [x] `serviceJobs.ts`: `resolveServiceJob`'s paid branch returns the part cost + profit numbers (for
  install jobs) alongside the existing payout/reputation, for the store to surface.
- [x] Golden masters: re-pin — day-1 seeding, the variable field, disciplined bids, and the calendar
  all change the acquisition career's hash (and possibly the job-loop career's); flag which changed.
  Both `advanceDay.test.ts` hashes re-pinned (`49b9eb4a` → `62ad3fbb`, `afc3eaf7` → `9caa0d4f`).
- [x] Harness (`exportCareers.ts` + Python side): a new per-won-auction metric — the win price as a
  fraction of `[reserve, buyout]`, bucketed steal/mid/frenzy — so the bell target (5–10% / majority /
  5–10%) is **verified against data**, plus the average rival field size (target 3–9). This is how the
  three knobs get tuned; runs locally, not in CI (same deferral as the rest of the harness).
  `runCareer` now returns `{ snapshots, auctionWins }`; a new `sampleFieldSizes` helper samples
  `computeLotInterest` on every newly-appeared lot. `exportCareers.ts` writes two new files
  (`auctionWins.csv`, `auctionFieldSizes.csv` + manifests); `report.py` renders a new "Auction
  calibration" section. `pnpm balance:run` initially failed on a pre-existing, unrelated
  infrastructure bug (`@midnight-garage/content`'s `package.json` `exports` field pointed straight at
  `src/index.ts`, which plain Node can't resolve/execute) — fixed same-session (`tsconfig.cli.json` now
  compiles `content/src/index.ts` as an explicit root; a new `scripts/fixContentRequires.cjs` rewrites
  the compiled bare-specifier `require`s to the dist-local path). **Run end-to-end for real**: 600,000
  career rows, 126,093 auction-win rows, 24,000 field-size rows. Result: average field size 6.2 (target
  3-9, on target); win-price bell STEAL 8.2% / MID 91.8% / FRENZY 0.0% (target 5-10% each tail — STEAL
  is on target, FRENZY essentially never fires in real bot play against the unit-level Monte Carlo's
  ~8% prediction). **Not retuned this sprint** — logged as a follow-up calibration item in `TODO.md`.
- [x] Bots: with disciplined rival bids, a bot bidding its own full valuation now reliably out-bids
  the (lower) AI field — check the harness still produces sane careers (a bot shouldn't suddenly win
  every auction at a loss). Adjust bot bid fractions only if the harness shows a degenerate result.
  Verified against the real harness run above — all 4 gated `python -m balance.cli check` invariants
  pass, no strategy shows a degenerate result.

### C. Game (`packages/game`)

- [x] `ServiceJobsScreen.vue`: an accepted-but-uncommitted offer shows "queued — arrives after End
  Day" distinctly from an unaccepted one.
- [x] Store: a `lastJobResult` ref populated by `completeServiceJob`'s resolution (outcome, payout,
  reputation delta, part cost/profit if applicable, days spent); a new `JobCompleteModal.vue` (mirrors
  `DayReport.vue`'s overlay/dismiss shape) renders it.
- [x] `AuctionScreen.vue`: relabel the interest read from the clearing-price framing ("likely sells
  X–Y") to the winning-threshold framing 4c produces ("bid ~X to win"). The level badge + contender
  count stay; only the number's meaning and label change. Otherwise the screen already consumes
  `computeLotInterest` — no structural rework.

### D. Testing

- [x] Sim — pacing/calendar: `refreshCatalogs` produces day-1 content (no more empty first week);
  `currentGameYear` matches the GDD table for all 5 tiers; auction generation never produces a model
  or an instance year beyond the current calendar year (checked against the real 10-model roster).
  (`calendar.test.ts`, `catalogs.test.ts`, and a new "currentYear clamp" describe block in
  `auctions.test.ts`.)
- [x] Sim — the auction fixes, each with its own assertion:
  - **4a (discipline):** `auctionBidValueFor` is strictly below `valuateCarForBuyer` for the same
    inputs; and a property test — a rough lot with an empty/small interested pool is winnable by the
    player at a bid below its resale valuation (the buy-low gap exists).
  - **4b/4c (variable gated field):** `interestedArchetypes` excludes an archetype with no explicit
    preference for the model's tier (a legend-only collector never bids on a shitbox); `buildRivalField`
    field size varies across lots and its mean scales with `interestBreadth`; a Monte-Carlo-style test
    (many seeded lots) confirms the win-price bell lands in the target bands (STEAL 5–10% / MID
    majority / FRENZY 5–10%) and the average field is in 3–9 — this is the calibration regression that
    guards the whole rework.
  - **4d (winnability read):** the number `computeLotInterest` surfaces as the winning threshold,
    when bid by the player, wins the lot in `resolveAuction` — estimate and resolution agree (the
    direct regression for "bid above the shown high and still lost").
  - **4e (buyout cap):** across many seeded lots, no rival's effective bid — and no realized
    `finalPriceYen` a rival wins at — exceeds the lot's buyout price.
  (`bidding.test.ts` and `lotInterest.test.ts`, fully rewritten — all five assertions above pass.)
- [x] Content: `serviceJobs.json` still validates; a lint-style check (or just a test) that no
  description string contains a car's `displayName` other than via the resolved offer (cheap
  regression guard against the bug recurring). (New test in `naming.test.ts`.)
- [x] Store/component: an accepted offer shows the queued label before commit; `lastJobResult` is
  populated correctly for both paid and failed outcomes.

## Claude-implementable vs user-only

**Claude-implementable:** all of A-D. No new dependencies.

**User-only:** play a fresh career from day 1 — confirm there's something to do immediately, the
auction doesn't feel rigged, and job completion actually feels like something happened.

## Exit

This sprint doesn't add depth — it removes friction and fixes math that was actively working against
the player. The real depth (instant actions, the component/equipment economy, a real parts market) is
Sprints 11-14. This is the "stop actively fighting the player" pass before those land.
