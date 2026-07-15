import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import componentDisplayNames from '../data/componentDisplayNames.json'
import economy from '../data/economy.json'
import facilities from '../data/facilities.json'
import partPricing from '../data/partPricing.json'
import parts from '../data/parts.json'
import partsTaxonomy from '../data/parts-taxonomy.json'
import toolLines from '../data/toolLines.json'
import traits from '../data/traits.json'
import {
  BuyersSchema,
  CarModelsSchema,
  CarPartTaxonomyContentSchema,
  ComponentDisplayNamesSchema,
  ComponentIdSchema,
  EconomyConfigSchema,
  FacilitiesSchema,
  PartCatalogEntriesSchema,
  PartPricingSheetSchema,
  ToolLinesSchema,
  TraitDefinitionsSchema,
} from '../src'

describe('seed content validates against schemas', () => {
  it('cars.json', () => {
    const result = CarModelsSchema.safeParse(cars)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  /** Sprint 53: the raw catalog is identity-only, no `priceYen` - that's
   * resolved at content-load time (data.ts) from `partPricing.json`. */
  it('parts.json', () => {
    const result = PartCatalogEntriesSchema.safeParse(parts)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  /** Sprint 53: the centralised pricing sheet every SKU's price resolves from. */
  it('partPricing.json', () => {
    const result = PartPricingSheetSchema.safeParse(partPricing)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.overrides).toEqual({})
  })

  it('buyers.json', () => {
    const result = BuyersSchema.safeParse(buyers)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  /**
   * Sprint 26: the 29-part taxonomy replaces hidden-issues.json (archived,
   * not deleted - the paused feature's data, not this sprint's schema).
   * Sprint 53: the raw content has no price field - `stockReplacementPriceYenByClass`
   * is derived at content-load time (data.ts) from the resolved parts catalog.
   */
  it('parts-taxonomy.json', () => {
    const result = CarPartTaxonomyContentSchema.safeParse(partsTaxonomy)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(29)
  })

  it('traits.json', () => {
    const result = TraitDefinitionsSchema.safeParse(traits)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  /** Sprint 36: the six always-owned tool lines replace equipment.json. */
  it('toolLines.json', () => {
    const result = ToolLinesSchema.safeParse(toolLines)
    if (!result.success) throw new Error(result.error.message)
    // Exactly the 6 ComponentIds as keys.
    expect(Object.keys(result.data).sort()).toEqual([...ComponentIdSchema.options].sort())
    for (const id of ComponentIdSchema.options) {
      const line = result.data[id]
      // Exactly 3 tiers per line.
      expect(line.tiers).toHaveLength(3)
      // Tier 1 is owned from the start - price 0.
      expect(line.tiers[0]!.upgradePriceYen).toBe(0)
      // Upgrade prices strictly ascend within the line.
      expect(line.tiers[1]!.upgradePriceYen).toBeGreaterThan(line.tiers[0]!.upgradePriceYen)
      expect(line.tiers[2]!.upgradePriceYen).toBeGreaterThan(line.tiers[1]!.upgradePriceYen)
    }
  })

  /**
   * Sprint 25 task 6: the raw camelCase ComponentId must never reach player
   * copy - this map is the fix, so it must cover every real component and
   * never contain a camelCase token itself (a display name that's just the
   * id back again would defeat the whole point).
   */
  it('componentDisplayNames.json', () => {
    const result = ComponentDisplayNamesSchema.safeParse(componentDisplayNames)
    if (!result.success) throw new Error(result.error.message)
    for (const id of ComponentIdSchema.options) {
      const label = result.data[id]
      expect(label, `${id} has no display name`).toBeTruthy()
      expect(label, `${id}'s display name "${label}" is a raw camelCase token`).not.toMatch(
        /[a-z][A-Z]/,
      )
    }
    // Sprint 58: the schema's own key set is exactly the 6 real groups - no
    // dead pre-Sprint-26 entries (`brakes`, `forcedInduction`) survive.
    expect(Object.keys(result.data).sort()).toEqual([...ComponentIdSchema.options].sort())
  })

  it('facilities.json', () => {
    const result = FacilitiesSchema.safeParse(facilities)
    if (!result.success) throw new Error(result.error.message)
    // Sprint 16: minReputationTier must line up one-for-one with bayPricesYen
    // for every bay kind - the schema's own refine already enforces this at
    // parse time; this just names the invariant for anyone reading the test.
    expect(result.data.service.minReputationTier.length).toBe(
      result.data.service.bayPricesYen.length,
    )
    expect(result.data.parking.minReputationTier.length).toBe(
      result.data.parking.bayPricesYen.length,
    )
  })

  it('economy.json', () => {
    const result = EconomyConfigSchema.safeParse(economy)
    if (!result.success) throw new Error(result.error.message)
    // Sprint 20's own bidding rework (stage B) deliberately changes these
    // two values from stage A's pure-relocation pins: rent zeroed until the
    // reworked auction economy worked end-to-end, buyout premium re-pointed
    // at the value anchor and raised from 1.1x book to 1.25x anchor. Sprint
    // 23 decision 4 restores rent as a tuned knob (0.3x measured median
    // weekly gross margin, rounded to the nearest Y10,000 - see economy.ts's
    // own doc comment for the full derivation).
    expect(result.data.WEEKLY_RENT_YEN).toBe(20_000)
    // Sprint 45: the daily fine for leaving a car in the grace/"double
    // parking" overflow slot - first-pass number, explicit tuning bait.
    expect(result.data.DOUBLE_PARKING_FINE_YEN).toBe(8_000)
    expect(result.data.AUCTION_BUYOUT_PREMIUM).toBe(1.25)
    // Sprint 59 (playtest item 12): derived from real roster medians, not
    // asserted - see STARTING_CASH_YEN's own schema doc comment.
    expect(result.data.STARTING_CASH_YEN).toBe(300_000)
    // Sprint 59 (playtest item 19): the reserve is a pure seller floor, not
    // the price-setter - see AUCTION_RESERVE_PRICE_FRACTION's own doc comment.
    expect(result.data.AUCTION_RESERVE_PRICE_FRACTION).toBe(0.6)
    // New Sprint 20 auction-rework knobs, born in JSON from day one.
    // Auction-close + rival-contest knobs, retuned by the 2026-07-12
    // auction fix (anti-snipe + longer visible window + more contest), then
    // retuned again by Sprint 55 decision 3 (economy-bible.md law 4's retune
    // pass): the wholesale center moved back down once Sprint 54's gentler
    // value law raised anchorValueYen enough that the same contestation
    // rules were overshooting into a frenzy tail instead of a steal one.
    // Retuned again by Sprint 59 (playtest item 19, the ~156k unimproved
    // instant-flip bug): rivals now price near guide value instead of
    // wholesale, so a contested close converges on fair value.
    expect(result.data.AUCTION_WHOLESALE_FRACTION).toBe(0.97)
    expect(result.data.AUCTION_QUIET_DAYS_TO_HAMMER).toBe(3)
    expect(result.data.AUCTION_BID_INCREMENT_FRACTION).toBe(0.05)
    // Sprint 30 (living auctions): daily arrivals + the bidder-interest
    // process knobs replacing the Sprint 20/25 demand-ceiling family above.
    // Sprint 66 (playtest item 15): the board turns over roughly twice as
    // fast - rates above 1 mean a guaranteed lot plus a fractional chance.
    expect(result.data.AUCTION_DAILY_SPAWN_RATE['local-yard']).toBe(1.3)
    // Sprint 66 (item 6a): no current-model-year car at a backyard auction.
    expect(result.data.AUCTION_MIN_AGE_YEARS).toBe(3)
    expect(result.data.auctionInterest.perCohortBidChance['local-yard']).toBe(0.55)
    expect(result.data.auctionInterest.turnoutBidderCounts.packed).toEqual([5, 7])
    expect(result.data.auctionInterest.turnoutBandWeights).toEqual([0.2, 0.45, 0.35])
    expect(result.data.auctionInterest.maxIncrementsPerNight).toBe(3)
    expect(result.data.auctionInterest.cohortValuationSpreadByTurnout.thin).toBeGreaterThan(
      result.data.auctionInterest.cohortValuationSpreadByTurnout.packed,
    )
    // Sprint 21 (value model): new valuation/marketPressure/statFormulas
    // blocks, born in JSON from day one.
    expect(result.data.valuation.tasteSpread).toBe(0.12)
    // Sprint 30 decision 1: mileage curve inside clean value (the matching
    // age curve was dropped by a post-Sprint-30 maintainer decision - car
    // age no longer factors into value at all).
    expect(result.data.valuation.mileageFactorCurve[1]).toEqual([60000, 1.0])
    // Sprint 54 decision 1 (economy-bible.md law 1): replaces Sprint 47's
    // two-slope premium with ONE slope, always above 1, plus the same small
    // scrap-value backstop floor (bands.scrapValueFraction, unchanged).
    // Sprint 66 (economy-bible.md law 6, the wage law): raised 1.2 -> 1.5 so
    // repair work pays a real wage. This number IS the entire return on a
    // repair (cost and bill reduction are the same product), and it is
    // jointly constrained with maxBillFraction below - their product must
    // stay under 1 or the scrap floor binds. Asserted together, deliberately.
    expect(result.data.valuation.marketRepairDiscount).toBe(1.5)
    expect(
      result.data.valuation.marketRepairDiscount * result.data.partsGeneration.maxBillFraction,
    ).toBeLessThan(1)
    expect(result.data.valuation.walkAwaySpread).toBe(0.05)
    // Sprint 60 (economy-bible.md law 5, the foundation law): the aftermarket
    // premium is scaled by the worst foundational part's factor. Foundational
    // parts are safety/structure; the factor table is monotonic and capped at
    // 1 (the schema enforces both), withholding premium for a bad foundation
    // and never inflating it.
    expect(result.data.valuation.foundation.parts).toContain('brakePadsDiscs')
    expect(result.data.valuation.foundation.factorByState.scrap).toBe(0.15)
    expect(result.data.valuation.foundation.factorByState.worn).toBe(1.0)
    // Sprint 54 decision 4 (economy-bible.md law 2): the generation-time
    // bill-vs-clean-value ceiling every generated car is softened to satisfy.
    // Sprint 66: pulled 0.7 -> 0.6 as the other half of the wage law's (D, F)
    // pair (see marketRepairDiscount above).
    expect(result.data.partsGeneration.maxBillFraction).toBe(0.6)
    // Sprint 66 (item 6a): upkeep wear can only express in proportion to the
    // car's own mileage - a brand-new car is mint whoever owned it.
    expect(result.data.partsGeneration.wearExposureByMileageKm[0]).toEqual([0, 0])
    // Sprint 47 decision 2 (maintainer, 2026-07-13: "repairs in general are
    // too expensive"): retuned down from Sprint 44's 0.15.
    expect(result.data.restoration.repairStepFraction).toBe(0.1)
    expect(result.data.marketPressure.HEAT_MIN).toBe(70)
    expect(result.data.marketPressure.HEAT_MAX).toBe(140)
    expect(result.data.marketPressure.LEDGER_DECAY).toBe(0.75)
    expect(result.data.statFormulas.powerNormalizationCeiling).toBe(300)
    // Sprint 23 decision 1: the clean/concours sale-quality bars and bonuses.
    // Sprint 26: clean's bar is a band now, not a condition percent.
    expect(result.data.reputation.cleanSaleMinBand).toBe('fine')
    expect(result.data.reputation.cleanSaleBonus).toBe(2)
    expect(result.data.reputation.concoursSaleMinAuthenticityPercent).toBe(85)
    expect(result.data.reputation.concoursSaleBonus).toBe(4)
    // Sprint 26: the banded parts model's own tunables, born in JSON.
    expect(result.data.bands.bandFactors.mint).toBe(1.0)
    expect(result.data.bands.bandFactors.scrap).toBe(0.15)
    expect(result.data.bands.migrationThresholds.poor).toBe(15)
    expect(result.data.bands.scrapValueFraction).toBe(0.05)
    // Sprint 31 (the walk-in offer stream): the daily offer-draw tunables,
    // born in JSON from day one.
    expect(result.data.selling.offerChanceBase).toBe(0.65)
    expect(result.data.selling.offerChanceByTier.shitbox).toBeGreaterThan(
      result.data.selling.offerChanceByTier.legend,
    )
    expect(result.data.selling.offerChanceByHeatBand.hot).toBeGreaterThan(
      result.data.selling.offerChanceByHeatBand.cold,
    )
    // Sprint 55 decision 3 (economy-bible.md law 4's retune pass): raised
    // from [0.82, 1.12] so a bad walk-in roll can no longer erase the
    // worst-case flip margin the Law 2 generation guard still permits; the
    // upper edge came down to keep the spread's own mean at/below 1.0 (the
    // Sprint 54 no-free-lunch invariant). Narrowed again to [0.93, 1.05] by
    // Sprint 59 (playtest item 19): the mean stays 0.99, but the tails can no
    // longer let a lucky roll manufacture profit on an unimproved flip.
    expect(result.data.selling.offerSpread).toEqual([0.93, 1.05])
    // Sprint 55 (economy-bible.md law 4): the roster-coherence "brake pads
    // vs car price" cap - a content anchor, not a hardcoded check constant.
    expect(result.data.coherence.maxConsumablesShareOfBookValue).toBe(0.15)
  })

  /**
   * Sprint 55 (economy-bible.md law 4 - one derived ledger, machine-checked):
   * every top-level `economy.json` group is a hand-authored anchor, listed in
   * the bible's Anchor Inventory section. This is the machine half of that
   * claim - a new top-level field added here without updating the bible's
   * table (or this list) fails loudly instead of silently drifting, exactly
   * the "if two prices drifted apart, would a test catch it" litmus the law
   * itself poses.
   */
  it('economy.json top-level anchors match the bible audit table', () => {
    const expectedTopLevelKeys = [
      'STARTING_CASH_YEN',
      'WEEKLY_RENT_YEN',
      'DOUBLE_PARKING_FINE_YEN',
      'AUCTION_RESERVE_PRICE_FRACTION',
      'AUCTION_LOTS_PER_TIER',
      'AUCTION_DURATION_STANDARD_RANGE_DAYS',
      'AUCTION_DURATION_LONG_RANGE_DAYS',
      'AUCTION_DURATION_FLASH_DAYS',
      'AUCTION_FLASH_CHANCE',
      'AUCTION_LONG_CHANCE_UNCOMMON_RARE',
      'AUCTION_TRAVEL_FEE_YEN',
      'AUCTION_BUYOUT_PREMIUM',
      'AUCTION_WHOLESALE_FRACTION',
      'AUCTION_QUIET_DAYS_TO_HAMMER',
      'AUCTION_BID_INCREMENT_FRACTION',
      'AUCTION_DAILY_SPAWN_RATE',
      'AUCTION_MIN_AGE_YEARS',
      'auctionInterest',
      'restoration',
      'valuation',
      'marketPressure',
      'statFormulas',
      'bands',
      'partsGeneration',
      'reputation',
      'serviceJobs',
      'selling',
      'toolCeilings',
      'specialty',
      'machineListings',
      'coherence',
    ].sort()
    expect(Object.keys(economy).sort()).toEqual(expectedTopLevelKeys)
  })
})

describe('seed content ids are unique', () => {
  it('car ids', () => {
    const ids = CarModelsSchema.parse(cars).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('part ids', () => {
    const ids = PartCatalogEntriesSchema.parse(parts).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('buyer ids', () => {
    const ids = BuyersSchema.parse(buyers).map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('parts-taxonomy ids cover exactly the 29 real parts, no duplicates', () => {
    const ids = CarPartTaxonomyContentSchema.parse(partsTaxonomy).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(29)
  })
})
