import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import componentDisplayNames from '../data/componentDisplayNames.json'
import economy from '../data/economy.json'
import equipment from '../data/equipment.json'
import facilities from '../data/facilities.json'
import parts from '../data/parts.json'
import partsTaxonomy from '../data/parts-taxonomy.json'
import traits from '../data/traits.json'
import {
  BuyersSchema,
  CarModelsSchema,
  CarPartTaxonomySchema,
  ComponentDisplayNamesSchema,
  ComponentIdSchema,
  EconomyConfigSchema,
  EquipmentsSchema,
  FacilitiesSchema,
  PartsSchema,
  TraitDefinitionsSchema,
} from '../src'

describe('seed content validates against schemas', () => {
  it('cars.json', () => {
    const result = CarModelsSchema.safeParse(cars)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('parts.json', () => {
    const result = PartsSchema.safeParse(parts)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('buyers.json', () => {
    const result = BuyersSchema.safeParse(buyers)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  /** Sprint 26: the 29-part taxonomy replaces hidden-issues.json (archived,
   * not deleted - the paused feature's data, not this sprint's schema). */
  it('parts-taxonomy.json', () => {
    const result = CarPartTaxonomySchema.safeParse(partsTaxonomy)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(29)
  })

  it('traits.json', () => {
    const result = TraitDefinitionsSchema.safeParse(traits)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('equipment.json', () => {
    const result = EquipmentsSchema.safeParse(equipment)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
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
    expect(result.data.AUCTION_BUYOUT_PREMIUM).toBe(1.25)
    expect(result.data.STARTING_CASH_YEN).toBe(1_500_000)
    // New Sprint 20 auction-rework knobs, born in JSON from day one.
    expect(result.data.AUCTION_WHOLESALE_FRACTION).toBe(0.75)
    expect(result.data.AUCTION_QUIET_DAYS_TO_HAMMER).toBe(2)
    expect(result.data.AUCTION_BID_INCREMENT_FRACTION).toBe(0.05)
    // Sprint 30 (living auctions): daily arrivals + the bidder-interest
    // process knobs replacing the Sprint 20/25 demand-ceiling family above.
    expect(result.data.AUCTION_DAILY_SPAWN_RATE['local-yard']).toBe(0.6)
    expect(result.data.auctionInterest.perCohortBidChance['local-yard']).toBe(0.35)
    expect(result.data.auctionInterest.turnoutBidderCounts.packed).toEqual([5, 7])
    expect(result.data.auctionInterest.turnoutBandWeights).toEqual([0.3, 0.45, 0.25])
    expect(result.data.auctionInterest.maxIncrementsPerNight).toBe(2)
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
    // Sprint 27 (restoration-bill deduction): replaces the retired
    // conditionFloor/Ceiling/Exponent curve tunables above.
    expect(result.data.valuation.hassleFactor).toBe(1.2)
    expect(result.data.valuation.floorFraction).toBe(0.1)
    expect(result.data.valuation.walkAwaySpread).toBe(0.05)
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
    expect(result.data.selling.offerSpread).toEqual([0.82, 1.12])
  })
})

describe('seed content ids are unique', () => {
  it('car ids', () => {
    const ids = CarModelsSchema.parse(cars).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('part ids', () => {
    const ids = PartsSchema.parse(parts).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('buyer ids', () => {
    const ids = BuyersSchema.parse(buyers).map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('parts-taxonomy ids cover exactly the 29 real parts, no duplicates', () => {
    const ids = CarPartTaxonomySchema.parse(partsTaxonomy).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(29)
  })

  it('equipment ids', () => {
    const ids = EquipmentsSchema.parse(equipment).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
