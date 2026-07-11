import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import economy from '../data/economy.json'
import equipment from '../data/equipment.json'
import facilities from '../data/facilities.json'
import hiddenIssues from '../data/hidden-issues.json'
import parts from '../data/parts.json'
import traits from '../data/traits.json'
import {
  BuyersSchema,
  CarModelsSchema,
  EconomyConfigSchema,
  EquipmentsSchema,
  FacilitiesSchema,
  HiddenIssuesSchema,
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

  it('hidden-issues.json', () => {
    const result = HiddenIssuesSchema.safeParse(hiddenIssues)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
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

  it('facilities.json', () => {
    const result = FacilitiesSchema.safeParse(facilities)
    if (!result.success) throw new Error(result.error.message)
    // Sprint 16: minReputationTier must line up one-for-one with bayPricesYen
    // for every bay kind — the schema's own refine already enforces this at
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
    // reworked auction economy works end-to-end (restored as a tuned knob
    // in Sprint 23), buyout premium re-pointed at the value anchor and
    // raised from 1.1x book to 1.25x anchor.
    expect(result.data.WEEKLY_RENT_YEN).toBe(0)
    expect(result.data.AUCTION_BUYOUT_PREMIUM).toBe(1.25)
    expect(result.data.STARTING_CASH_YEN).toBe(1_500_000)
    // New Sprint 20 auction-rework knobs, born in JSON from day one.
    expect(result.data.AUCTION_WHOLESALE_FRACTION).toBe(0.75)
    expect(result.data.AUCTION_DEMAND_SPREAD_SD).toBe(0.12)
    expect(result.data.AUCTION_THIN_TURNOUT_CHANCE).toBe(0.15)
    expect(result.data.AUCTION_THIN_TURNOUT_FACTOR).toBe(0.6)
    expect(result.data.AUCTION_COUNTER_CHANCE).toBe(0.7)
    expect(result.data.AUCTION_QUIET_DAYS_TO_HAMMER).toBe(2)
    expect(result.data.AUCTION_BID_INCREMENT_FRACTION).toBe(0.05)
    expect(result.data.AUCTION_TURNOUT_BANDS).toEqual([0.85, 1.12])
    // Sprint 21 (value model): new valuation/marketPressure/statFormulas
    // blocks, born in JSON from day one.
    expect(result.data.valuation.conditionFloor).toBe(0.35)
    expect(result.data.valuation.conditionCeiling).toBe(1.1)
    expect(result.data.valuation.conditionExponent).toBe(1.3)
    expect(result.data.valuation.tasteSpread).toBe(0.12)
    expect(result.data.valuation.listingPatiencePremium).toBe(1.05)
    const weightSum = Object.values(result.data.valuation.componentValueWeights).reduce(
      (sum, w) => sum + w,
      0,
    )
    expect(weightSum).toBeCloseTo(1, 6)
    expect(result.data.marketPressure.HEAT_MIN).toBe(70)
    expect(result.data.marketPressure.HEAT_MAX).toBe(140)
    expect(result.data.marketPressure.LEDGER_DECAY).toBe(0.75)
    expect(result.data.statFormulas.powerNormalizationCeiling).toBe(300)
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

  it('hidden issue ids', () => {
    const ids = HiddenIssuesSchema.parse(hiddenIssues).map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('equipment ids', () => {
    const ids = EquipmentsSchema.parse(equipment).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
