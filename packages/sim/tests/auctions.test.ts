import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarModel,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  auctionTierForRarity,
  generateAuctionCarInstance,
  generateAuctionCatalog,
} from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function stateWithLots(
  lots: ReturnType<typeof generateAuctionCatalog>,
  cashYen = 1_000_000,
): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen,
    reputationTier: 'unknown',
    reputationPoints: 0,
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: lots,
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
  }
}

/** A synthetic Gaisha model - PoC-10 has none, so this proves the exclusion holds even when one exists in the pool. */
const GAISHA_MODEL: CarModel = {
  id: 'bmw-m3-e30',
  displayName: 'BMW M3 (E30)',
  brand: 'BMW',
  parodyName: 'BMV M3 (E30)',
  parodyBrand: 'BMV',
  spec: {
    chassisCode: 'E30',
    engineCode: 'S14',
    yearFrom: 1986,
    curbWeightKg: 1200,
    stockPowerPs: 200,
  },
  tier: 'gaisha',
  tags: ['FR', 'NA', 'Piston', '80s', 'Gaisha'],
  bookValueYen: 5_000_000,
}

describe('auctionTierForRarity', () => {
  it('maps every real tier and excludes gaisha', () => {
    expect(auctionTierForRarity('shitbox')).toBe('local-yard')
    expect(auctionTierForRarity('common')).toBe('local-yard')
    expect(auctionTierForRarity('uncommon')).toBe('regional')
    expect(auctionTierForRarity('rare')).toBe('premium')
    expect(auctionTierForRarity('legend')).toBe('collector-network')
    expect(auctionTierForRarity('gaisha')).toBeNull()
  })
})

describe('generateAuctionCatalog never includes Gaisha', () => {
  const modelsWithGaisha = [...CARS, GAISHA_MODEL]
  const tiers = ['local-yard', 'regional', 'premium', 'collector-network'] as const

  it('across many seeds and all four tiers', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const tier of tiers) {
        const lots = generateAuctionCatalog(modelsWithGaisha, tier, 7, 5, createRng(seed), CONTEXT)
        for (const lot of lots) {
          expect(lot.modelId).not.toBe(GAISHA_MODEL.id)
        }
      }
    }
  })
})

describe('generateAuctionCarInstance', () => {
  const model = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!model) throw new Error('fixture car missing from seed content')

  it('rolls every filled slot to a real band, authenticity within sane bounds', () => {
    const rng = createRng(1)
    const instance = generateAuctionCarInstance(model, 'car-test', rng, CONTEXT)
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = instance.parts[partId].installed
      if (installed) {
        expect(['scrap', 'poor', 'worn', 'fine', 'mint']).toContain(installed.band)
      }
    }
    expect(instance.authenticityPercent).toBeGreaterThanOrEqual(60)
    expect(instance.authenticityPercent).toBeLessThanOrEqual(95)
    expect(instance.year).toBeGreaterThanOrEqual(model.spec.yearFrom)
  })

  it('starts stock - every filled slot holds a real stock-catalog part instance (Sprint 32)', () => {
    const instance = generateAuctionCarInstance(model, 'car-test', createRng(1), CONTEXT)
    let sawFilled = false
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = instance.parts[partId].installed
      if (!installed) continue
      sawFilled = true
      const catalogPart = CONTEXT.partsById[installed.partId]
      expect(catalogPart?.grade).toBe('stock')
    }
    expect(sawFilled).toBe(true) // sanity: at least some slots actually filled at this seed
  })

  it('forcedInduction is installed only on a Turbo/Supercharged-tagged model (Sprint 26 decision 2, Sprint 32 shape)', () => {
    const naModel = model // honda-city-e-aa: NA-tagged
    expect(naModel.tags).not.toContain('Turbo')
    for (let seed = 0; seed < 20; seed++) {
      const instance = generateAuctionCarInstance(naModel, 'car-test', createRng(seed), CONTEXT)
      expect(instance.parts.forcedInduction.installed).toBeNull()
    }

    const turboModel = CARS.find((c) => c.tags.includes('Turbo'))
    if (!turboModel) throw new Error('fixture: expected at least one Turbo-tagged model')
    for (let seed = 0; seed < 20; seed++) {
      const instance = generateAuctionCarInstance(turboModel, 'car-test', createRng(seed), CONTEXT)
      const installed = instance.parts.forcedInduction.installed
      expect(installed).not.toBeNull()
      expect(CONTEXT.partsById[installed!.partId]?.grade).toBe('stock')
    }
  })

  it('is deterministic for the same seed (Sprint 32: the missing-slot roll extends the RNG sequence, but stays reproducible)', () => {
    const a = generateAuctionCarInstance(model, 'car-test', createRng(1), CONTEXT)
    const b = generateAuctionCarInstance(model, 'car-test', createRng(1), CONTEXT)
    expect(a).toEqual(b)
  })

  it('rolls a genuinely missing (non-forcedInduction) slot at least once across many seeds - the stripped-car case is reachable', () => {
    let sawMissing = false
    for (let seed = 0; seed < 50 && !sawMissing; seed++) {
      const instance = generateAuctionCarInstance(model, 'car-test', createRng(seed), CONTEXT)
      for (const partId of ALL_CAR_PART_IDS) {
        if (partId === 'forcedInduction') continue
        if (instance.parts[partId].installed === null) {
          sawMissing = true
          break
        }
      }
    }
    expect(sawMissing).toBe(true)
  })
})

describe('currentYear clamp - the rolling chronology (Sprint 10 item 6)', () => {
  const model = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!model) throw new Error('fixture car missing from seed content')

  /** yearFrom 2005 - released well after a 1995 campaign start. */
  const FUTURE_MODEL: CarModel = {
    ...model,
    id: 'future-test-model',
    spec: { ...model.spec, yearFrom: 2005 },
  }

  it('generateAuctionCarInstance never rolls a year past currentYear', () => {
    for (let seed = 0; seed < 30; seed++) {
      const instance = generateAuctionCarInstance(model, 'car-test', createRng(seed), CONTEXT, 1996)
      expect(instance.year).toBeLessThanOrEqual(1996)
    }
  })

  it('generateAuctionCatalog excludes a model whose yearFrom postdates currentYear', () => {
    const lots = generateAuctionCatalog(
      [FUTURE_MODEL],
      'local-yard',
      7,
      5,
      createRng(1),
      CONTEXT,
      1995,
    )
    expect(lots).toHaveLength(0)
  })

  it('generateAuctionCatalog includes that same model once the calendar reaches its release year', () => {
    const lots = generateAuctionCatalog(
      [FUTURE_MODEL],
      'local-yard',
      7,
      5,
      createRng(1),
      CONTEXT,
      2005,
    )
    expect(lots.length).toBeGreaterThan(0)
    for (const lot of lots) {
      expect(lot.car.year).toBeLessThanOrEqual(2005)
    }
  })

  it('defaults to unrestricted (Infinity) when currentYear is omitted', () => {
    const lots = generateAuctionCatalog([FUTURE_MODEL], 'local-yard', 7, 5, createRng(1), CONTEXT)
    expect(lots.length).toBeGreaterThan(0)
  })
})

describe('lot transparency (Sprint 26 decision 10 - no reveal machinery)', () => {
  it('a generated lot carries its true, plain-state car with no inspected flag', () => {
    const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
    if (!model) throw new Error('fixture car missing from seed content')
    const [lot] = generateAuctionCatalog([model], 'premium', 7, 1, createRng(1), CONTEXT)
    if (!lot) throw new Error('expected a lot')
    expect(lot).not.toHaveProperty('inspected')
    const state = stateWithLots([lot])
    expect(state.activeAuctionLots[0]!.car.parts).toEqual(lot.car.parts)
  })
})
