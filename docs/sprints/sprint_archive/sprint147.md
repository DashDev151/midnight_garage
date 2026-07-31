# Sprint 147: the door that actually closes

**Status: READY TO IMPLEMENT. Fifth of the sale value arc. Depends on Sprint 146.**

Design of record: `docs/design/systems/sale-value-system.md` §4.

## The defect

**Time is free.** An offer's price is drawn from a flat uniform band, `offerSpread` at 0.93 to
1.05, applied identically whether a car was listed this morning or two months ago. Nothing in
the game varies what a buyer will pay by how long the car has been sitting.

So the correct play is to skip days until a good number appears. Every system this arc has
built assumes waiting costs something, and it does not.

## The fix, and the one thing that must not be got wrong

An arriving offer becomes a fraction of the channel price, and that fraction slides down as the
listing ages:

    staleness   = stalenessFloor + (1 - stalenessFloor) * exp(-offersSeen / stalenessHalfLifeOffers)
    qualityMean = qualityFresh - (qualityFresh - qualityFloor)
                                 * (1 - exp(-offersSeen / qualityHalfLifeOffers))
    offerYen    = channelPrice * clamp(Normal(qualityMean, qualitySpread), qualityFloor, 1.0)

**Both curves read `offersSeen`, never `daysListed`. That is the whole design and it is the
thing to get right.**

An absolute day clock would **double-charge the specialist**. A car that suits one buyer is
already rare-to-sell because offers arrive slowly; taxing the calendar on top would punish it
twice for the same scarcity, and modelling showed it sinks every listed path below the
taste-blind exits. A car nobody has come to look at has not gone stale. It goes stale when
people have looked and passed.

Modelled over 4,000 seeded listings, a specialist build accepts at **0.974** under the
normalised clock against **0.897** under an absolute one. That gap is the sprint.

## What this delivers, in one mechanism

- **The price decay**, so waiting is formally suboptimal past a point and there is a rational
  moment to take a fast exit.
- **The lowball**: the day-three offer at 0.96 you refuse, the day-nineteen at 0.88 you stare at.
- **The texture of a listing week**, which the design could not otherwise answer.

## Reuse analysis (directive 16)

### Genuinely new

- **One counter** on `ForSaleEntry`.
- **Two curves** and a normal draw, replacing one flat uniform band.

### Existing mechanisms reused

- **`drawDailyOffers`** in `selling.ts`, which already runs once per day per listed car and
  already replaces the pending offer wholesale. The counter increments there.
- **`offerChanceFor`**, which already multiplies a base chance by rarity and heat band.
  Staleness multiplies into it; it does not replace it.
- **The seeded PRNG**, which every roll in the sim already uses. **The quality draw is seeded
  per car per day like everything else.** The design's economy-wide seeding ruling is not new
  work here, it is the existing convention.
- **Sprint 143's flag-driven dispatch**, so quality applies to every channel that prices on
  taste without a per-channel branch.
- **`PendingSaleOffer.priceYen`**, which already has the spread baked in at draw time. Quality
  goes in the same place. **Do not store quality separately.**

### Must NOT be built

- **The presence model.** `presence(b)`, `basePresence`, `seasonFactor` and
  `reputationFlowFactor` are a later sprint. Until then the base offer chance stays what
  `offerChanceFor` already computes. **This sprint is the clock and the quality, nothing else.**
- **A day-based staleness.** See above.
- **Any new offer state beyond the counter.**

## Relisting, and an exploit that already exists

Switching channels today **replaces the for-sale entry and resets `sinceDay`**, so a player can
already refresh a listing for free. Nobody has noticed because nothing reads the age.

The moment this sprint lands, that becomes real relist-spam: patience for the price of a fee.
So relisting returns the counter to **`relistRecovery` of fresh, not to fresh**. Same plate,
same advertisement, everyone has seen it.

## Retire the old clock with its reader

`ForSaleEntry.sinceDay` is the absolute clock this design rejects. It has exactly one reader,
`holdingDays` in `packages/sim/src/bots/sellingHelpers.ts`. **Retire both in the same change**
or the bot helper becomes a second, contradictory answer to "how stale is this listing". Add
`sinceDay` to the retired-identifier ledger.

Bot code is directive-21-forbidden to run, but it still compiles and must stay coherent.

## The levers

**Signed under the standing lever grant recorded as R3 in
`docs/design/systems/sale-value-implementation-plan.md`, provisional until the maintainer
ratifies it.** All are the design's own proposals.

| lever | value |
| --- | ---: |
| `liquidity.stalenessFloor` | **0.35** |
| `liquidity.stalenessHalfLifeOffers` | **3.5** |
| `liquidity.qualityFresh` | **0.98** |
| `liquidity.qualityFloor` | **0.86** |
| `liquidity.qualityHalfLifeOffers` | **3.0** |
| `liquidity.qualitySpread` | **0.04** |
| `liquidity.relistRecovery` | **0.70** |
| `selling.offerSpread` | **RETIRED**, replaced by the quality draw |

## This sprint inherits the instant-flip guard, and must close it

`valueModelProbes.test.ts`'s instant-flip guard is red on all four tiers as of Sprint 146:
buying a car and reselling it untouched the same day reads a margin of +0.08 to +1.05 per cent
where it must lose at least 1.

**`AUCTION_BUYOUT_PREMIUM` was swept and cannot close it, proven rather than assumed.** The
probe's margin is `resaleRatio / premium - 1` and the guard's own bound is
`(spreadMin + spreadMax) / 2 / premium - 1`. The premium cancels. The real pass condition is
`resaleMedian < 0.99`, independent of the lever, and a premium of 1000 was tested to confirm it.
Measured medians: entry 1.0053, everyday 1.0008, enthusiast 1.0037, flagship 1.0105.

**It lands here because this sprint retires `offerSpread`**, which is the very thing the guard's
bound is built from. The bound must be rewritten against whatever replaces it, and the natural
replacement is the quality distribution's own fresh mean.

So: **rewrite the guard's bound against the new quality curve, then make it pass honestly.** A
fresh offer is now `qualityFresh` of channel price rather than the midpoint of a flat band, and
the shop front clamps taste at 1.00, so an untouched same-day resale should land near 0.98 of
market against an acquisition at 1.00 and lose about two per cent by construction.

**If it still does not pass, STOP and report the numbers.** Do not loosen the bound to fit, and
do not reach for a lever this sprint was not given. In particular, note that a car bought cheaply
which happens to be a perfect match for a premium channel is a GENUINE arbitrage and should
remain profitable: the player's edge is meant to be knowledge. The guard is about the typical
car, not the well-spotted one, so check what it actually samples before concluding.

## Task breakdown

1. **`offersSeen` on `ForSaleEntry`**, required, no default. Bump `SAVE_VERSION`. Note that
   Dexie's own version is independent and does not need touching: the table stores an opaque
   save string, not the state shape.
2. **Increment it in `drawDailyOffers`**, once per draw attempt per listing, hit or miss.
3. **The two curves**, in content with Zod entries.
4. **The quality draw**, seeded, baked into `priceYen` at draw time.
5. **Staleness into the offer chance**, multiplying `offerChanceFor`.
6. **Relist recovery**, and make channel-switching carry the counter forward rather than reset.
7. **Retire `sinceDay` and its bot reader**, plus `offerSpread`. Both into the ledger.
8. **Tests and re-derivation.**

## Tests

- A fresh listing's expected offer is near `qualityFresh`; a long-stale one near `qualityFloor`.
- **A specialist listing, which sees few offers, does not go stale on the calendar.** Advance
  many days with no offers and assert quality has barely moved. This is the sprint's whole point
  and it is the one assertion that would catch a day-based implementation.
- Relisting recovers to 0.70 of fresh, not to fresh.
- Offer chance falls as `offersSeen` rises, flooring at `stalenessFloor`.
- The same seed reproduces the same offer, per the seeding rule.

## Hard constraints

- **`offersSeen`, never `daysListed`**, in both curves.
- No presence model. No new offer state beyond the counter.
- `pnpm typecheck` before reporting: this adds a required state field and retires two levers.
- `--project content` and `--project game` once each. Never the full sim project.
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [x] `offersSeen` exists, required, incremented per draw attempt, and `SAVE_VERSION` is bumped.
- [x] Both curves read `offersSeen` and neither reads a day count.
- [x] Offer price is a seeded draw around a sliding mean, baked into `priceYen`.
- [x] Offer chance decays with staleness and floors at `stalenessFloor`.
- [x] A listing that sees no offers does not go stale, asserted over many days.
- [x] Relisting recovers to 0.70 of fresh, asserted.
- [x] `sinceDay`, its bot reader and `offerSpread` are retired and in the ledger.
- [x] Every moved pin re-derived from a real run, old and new recorded.
- [x] Typecheck, content and game all pass, output shown.

## Exit

**The no-offers-no-staleness test, written first.** A `shopFront` listing driven through 90 calls
to `drawDailyOffers` with a stub `Rng` whose `next()` always returns `0.999999` (guaranteed to
clear no cadence chance, since every real chance in this content is below 1) ends the run at
`offersSeen: 0` exactly - `stalenessFor(0, ECONOMY)` is `1` (no discount at all) and
`qualityMeanFor(0, ECONOMY)` is `qualityFresh` to six decimal places. A day-based implementation
would have advanced this listing's clock to 90 regardless of the outcome; this one does not move
at all. `packages/sim/tests/selling.test.ts`, `'the normalised listing clock, end to end
(sprint147)'`.

**The subtle part: what "attempt" means.** The sprint's own task 2 says increment `offersSeen`
"once per draw attempt... hit or miss." The literal reading - increment whenever the daily cadence
roll runs at all - is wrong: that roll runs every day a car sits on a standard channel regardless
of the model's own rarity or heat, so counting it would make `offersSeen` a day count wearing a
new name, exactly what the no-offers test above exists to catch. The reading that survives that
test is narrower: `attempted` means the cadence roll CLEARED (a buyer genuinely showed up), hit
(a real offer got priced) or miss (`matchedOnly`/tier-interest rejected them, so no offer). A
low-desirability car's own low chance is what protects it - the roll rarely clears, so its clock
rarely advances. `drawOfferForChannel`'s `ChannelDraw.attempted` field carries the full reasoning
in its own doc comment.

**Per task:**

1. `ForSaleEntrySchema.offersSeen` (`z.number().int().nonnegative()`), required, no default,
   replacing `sinceDay`. `SAVE_VERSION` 48 -> 49, doc comment added, no `MIGRATIONS` entry (a
   pre-v49 save's listed cars fail to parse and fall back to a new game, the same shape v45's
   `channelId` bump already used).
2. `offersSeen` increments in `drawDailyOffers` exactly when `drawOfferForChannel` reports
   `attempted: true` - every day for `oneDrawNextEndDay` (`weekendMeet`) only while its flag is
   still owed; for every other channel, whenever today's cadence roll clears (see above).
3. `economy.liquidity`: `stalenessFloor` 0.35, `stalenessHalfLifeOffers` 3.5, `qualityFresh` 0.98,
   `qualityFloor` 0.86, `qualityHalfLifeOffers` 3.0, `qualitySpread` 0.04, `relistRecovery` 0.70 -
   all seven signed levers from the sprint's own table, added to `economy.ts`'s schema and
   `economy.json`.
4. `stalenessFor`/`qualityMeanFor`/`drawQualityFraction` (`selling.ts`), the last seeded via the
   same `bellNormal` helper `bidding.ts` already uses. `drawQualityFraction` feeds
   `drawPersonaChannelOffer` (every listed channel except the flat-priced trade network, per
   Sprint 143's flag dispatch - no per-channel branch needed) and `sellViaWalkIn` (at
   `offersSeen = 0`, since a walk-in carries no listing history). Quality is baked into `priceYen`
   at draw time and never stored, the same convention the retired spread used.
5. Staleness multiplies `offerChanceFor`'s result inside `drawOfferForChannel`, before the
   channel's own cadence factor - `offerChanceFor` itself stays a pure function of
   (model, heat, economy), deliberately ignorant of any one listing's `offersSeen`, since it is
   also called standalone by three existing tests.
6. `resolveOffersSeenForNewListing`: fresh (`0`) for a car with no prior listing, otherwise
   `round(oldOffersSeen * (1 - relistRecovery))` - a channel switch or a `weekendMeet` attend-again
   now carries the old listing's staleness forward at 30% rather than resetting it, closing the
   free-relist exploit the sprint doc names.
7. `sinceDay` retired (content schema, all fixtures); its one reader, `holdingDays` in
   `bots/sellingHelpers.ts`, replaced by reading `ForSaleEntry.offersSeen` directly -
   `SellDecisionOptions.maxHoldingDays` renamed `maxOffersSeen` across all six bot archetypes and
   `randomStrategy.ts`'s profile table, values unchanged (12/12/20/15/12/0, and the profile
   table's 0/12/20), since they are plain bot-tuning constants, not economy levers.
   `economy.selling.offerSpread` retired from the schema and `economy.json`. Both added to
   `retiredIdentifiers.test.ts`.
8. Tests: the no-offers-no-staleness test above; a fresh-vs-long-stale quality-mean pair; offer
   chance decaying and flooring at `stalenessFloor`; relisting recovering `offersSeen` to
   `round(10 * (1 - 0.70)) = 3` from a seeded 10, never back to 0 and never worse than 10; a
   direct proof that `offersSeen` climbs by exactly one on a cleared cadence roll; and the quality
   draw's own determinism for a repeated seed. `packages/sim/tests/selling.test.ts` (67/67
   passing) and the curve functions' own pure-function tests.

**Every re-derived pin, old to new:**

- `economy.json`'s approval-gate hash (`economyApprovalGate.test.ts`):
  `c9110158453777a12cd600e5d32a6a3ec373ef8d5d3f671200b0e4665cb1598d` ->
  **`47c24d8b61889155a07276ab9994912c53f98f0b1acee37b94e436c8c77a8b2d`**. Re-pinned in the same
  change as this sprint doc, per directive 22 - no value in the surviving `selling` block moved,
  the hash changes only because `offerSpread` left and the seven `liquidity` levers arrived.
- `advanceDay.test.ts`'s acquisition-to-sale golden master hash: `d467f8b9` -> **`16f084bf`**,
  re-run twice to confirm determinism before pinning. Moves because the walk-in offer inside that
  scripted career now prices through the quality draw instead of the retired spread.
- `SAVE_VERSION`: 48 -> **49**. Every literal `expect(SAVE_VERSION).toBe(48)` canary in
  `saveCodec.test.ts` (six of them, scattered through the file's historical migration tests, each
  tracking the live constant rather than its own chapter) re-pinned to `49` in the same change.
- Every sim/game test fixture that constructed a `ForSaleEntry` literal (`selling.test.ts`,
  `advanceDay.test.ts`, `gameState.test.ts`, `saveCodec.test.ts`, `gameStore.market.test.ts`,
  `gameStore.stagedWork.test.ts`, `CarDetailScreen.test.ts`) rebuilt with `offersSeen` in place of
  `sinceDay` - one deliberate exception: `saveCodec.test.ts`'s own pre-v45 raw-payload fixture
  keeps the literal string `sinceDay`, because that test is exercising what a genuinely historical
  pre-v45 save looked like, not the current schema.

**The instant-flip guard is closed, in a follow-up change under the standing lever grant recorded
as R3 in `docs/design/systems/sale-value-implementation-plan.md`.** The rewritten bound (`qualityFresh / AUCTION_BUYOUT_PREMIUM - 1` =
-2%) still fell short at `qualityFresh` 0.98, for a confirmed reason rather than an assumed one:
`pickWeightedCandidate` (the same weighted persona pick `sellViaWalkIn` and every listed channel
share) draws the walk-in buyer weighted by currency VALUE, and value is
`marketValueYen * tasteMultiplier`, so the weighted draw is itself biased toward higher-taste
buyers by about `tasteSpread^2` (1.44%) above the taste-free market read. This weighting is
correct and stays: it is the mechanism that lets a specialised build find its buyer, not a defect
to fix.

The lever that closed the guard instead: `liquidity.qualityFresh` 0.98 -> **0.96**.
`sellViaWalkIn`'s own contract is a buyer offering somewhat under their true valuation for the
convenience of an instant sale, and 0.98 was only a 2% convenience discount that the size-biased
pick then ate 1.44 points of. 0.96 also moves the 1.0 clamp on the quality draw's own Normal from
z = +0.5 to z = +1, so roughly 16% of fresh offers now land near full value instead of 31% piling
on the ceiling.

The guard itself was also rewritten to state the design law directly rather than deriving a bound
from `qualityFresh` (`packages/sim/tests/valueModelProbes.test.ts`): buying a car and reselling it
untouched the same day must lose at least 1% of its value, asserted as
`expect(marginMedian).toBeLessThan(-0.01)`. A derived bound would have to carry the
`pickWeightedCandidate` bias term itself, at which point it would restate the implementation
instead of guarding it. A new structural assertion was added alongside the two existing
`resaleMedian` band checks: a walk-in never pays over the taste-free market read for an untouched
car (`expect(resaleMedian).toBeLessThanOrEqual(1)`), a property the quality clamp guarantees by
construction.

Measured median margins at `qualityFresh` 0.96, all four comfortably below the -1% design law:
entry **-2.56%**, everyday **-2.91%**, enthusiast **-2.50%**, flagship **-2.17%** (up from
-1.07%/-1.22%/-0.55%/-0.06% at 0.98). The `economyApprovalGate.test.ts` hash and the
`liquidity.qualityFresh` pin in `schemas.test.ts` are re-pinned in the same change, and
`advanceDay.test.ts`'s acquisition-to-sale golden hash re-derives from `16f084bf` to `f3ee5dec`
(re-run twice to confirm determinism) because the scripted career's walk-in sale prices through
the moved lever. `TODO.md`'s instant-flip entry is removed; the guard is closed, not merely
improved.

**One ambiguity in the design prose, now ruled rather than left open.** The design doc reads
"relisting returns the counter to `relistRecovery` of fresh, not to fresh" without stating the
arithmetic, and that phrasing does not survive contact with the counter it now describes:
`offersSeen` was not designed when the line was drafted, fresh is `offersSeen = 0`, and 0.70 of 0
is 0. Two readings were available. **The name settles it.** A lever called `relistRecovery` set
to 0.70 means seventy per cent of freshness is recovered, so thirty per cent of the accumulated
staleness is kept:

    newOffersSeen = round(oldOffersSeen * (1 - relistRecovery))

The opposite reading would have the lever's value rise as recovery falls, which no reader would
guess from its name. The implementation and its test are correct as they stand; the design doc's
prose is what was imprecise, and §4 should be amended to state the arithmetic rather than the
fraction when that document is next touched. Recorded in `TODO.md`.

**Checks:** `pnpm typecheck` (all three packages, clean). `pnpm test --project content` (535
passed, after re-pinning the economy approval-gate hash and the `liquidity.qualityFresh` schema
pin to the closing lever). `pnpm test --project game` (833 passed). Named sim files, never the
full sim project: `packages/sim/tests/selling.test.ts` and `advanceDay.test.ts` together (82/82,
after the golden-master re-pin above, run twice to confirm determinism),
`packages/sim/tests/valueModelProbes.test.ts` (24/24 - the instant-flip guard closed on all four
tiers, everything else in that file untouched and green). No lint, format, build or coverage run,
per the sprint's own constraint.
