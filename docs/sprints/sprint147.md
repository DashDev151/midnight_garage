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

**Signed under the maintainer's standing authority of 2026-07-30.** All are the design's own
proposals.

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

- [ ] `offersSeen` exists, required, incremented per draw attempt, and `SAVE_VERSION` is bumped.
- [ ] Both curves read `offersSeen` and neither reads a day count.
- [ ] Offer price is a seeded draw around a sliding mean, baked into `priceYen`.
- [ ] Offer chance decays with staleness and floors at `stalenessFloor`.
- [ ] A listing that sees no offers does not go stale, asserted over many days.
- [ ] Relisting recovers to 0.70 of fresh, asserted.
- [ ] `sinceDay`, its bot reader and `offerSpread` are retired and in the ledger.
- [ ] Every moved pin re-derived from a real run, old and new recorded.
- [ ] Typecheck, content and game all pass, output shown.

## Exit

_To be completed at the end of the sprint._
