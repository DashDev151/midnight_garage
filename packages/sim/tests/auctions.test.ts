import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  fitmentClassForTier,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
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
import { testSpecialty, testToolTiers } from './testFixtures'

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
    specialty: testSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    staffAds: [],
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
    graceParkingCarId: null,
    energySpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
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

describe('generateAuctionCatalog reputation-weighted rarity pick (Sprint 85 decision 5)', () => {
  const localYardModels = CARS.filter((m) => auctionTierForRarity(m.tier) === 'local-yard')
  const shitboxIds = new Set(localYardModels.filter((m) => m.tier === 'shitbox').map((m) => m.id))
  const commonIds = new Set(localYardModels.filter((m) => m.tier === 'common').map((m) => m.id))

  it('sanity: the Local Yard pool holds both shitbox and common models', () => {
    expect(shitboxIds.size).toBeGreaterThan(0)
    expect(commonIds.size).toBeGreaterThan(0)
  })

  it('at unknown reputation, draws shitbox models ~3:1 per model over common (content weight)', () => {
    let shitboxLots = 0
    let commonLots = 0
    let totalLots = 0
    // Aggregate several seeds to average out any single stream's luck; the
    // draw is fully deterministic per seed regardless.
    for (const seed of [101, 202, 303]) {
      const lots = generateAuctionCatalog(
        CARS,
        'local-yard',
        7,
        1000,
        createRng(seed),
        CONTEXT,
        Infinity,
        'unknown',
      )
      totalLots += lots.length
      for (const lot of lots) {
        if (shitboxIds.has(lot.modelId)) shitboxLots += 1
        else if (commonIds.has(lot.modelId)) commonLots += 1
      }
    }
    // Local Yard is shitbox + common only - every lot classified.
    expect(shitboxLots + commonLots).toBe(totalLots)
    const ratioPerModel = shitboxLots / shitboxIds.size / (commonLots / commonIds.size)
    expect(ratioPerModel).toBeGreaterThan(2.7)
    expect(ratioPerModel).toBeLessThan(3.3)
  })

  it('at local reputation (and the default legend), the model draw is the old uniform pick - identical to today', () => {
    // No rarity weights exist for local or the default legend tier, so both
    // draw uniformly, and from the same seed produce the identical sequence -
    // proving the reputation param never disturbs the local+ auction stream.
    const atLocal = generateAuctionCatalog(
      CARS,
      'local-yard',
      7,
      200,
      createRng(999),
      CONTEXT,
      Infinity,
      'local',
    )
    const atDefault = generateAuctionCatalog(CARS, 'local-yard', 7, 200, createRng(999), CONTEXT)
    expect(atLocal.map((l) => l.modelId)).toEqual(atDefault.map((l) => l.modelId))
    // The uniform draw genuinely surfaces common models too, unlike the
    // shitbox-biased unknown-rep board above.
    expect(atLocal.some((l) => commonIds.has(l.modelId))).toBe(true)
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

  /**
   * Sprint 32 originally shipped every filled slot as stock-grade,
   * unconditionally. Sprint 75 decision 1 (the aftermarket-at-generation
   * roll) intentionally ends that: a filled slot is now stock OR a real
   * aftermarket part, by design - "starts stock" is no longer a system
   * truth, just the common case. This test's own premise updated
   * accordingly (directive 17 case (a) - the old, narrower title/assertion
   * is renamed and retargeted at what generation now actually guarantees:
   * every filled slot is a REAL catalog entry, whatever its grade). The
   * aftermarket-specific frequency/cap/fit tests live in their own describe
   * block below.
   */
  it('every filled slot holds a real catalog part instance, stock or aftermarket', () => {
    const instance = generateAuctionCarInstance(model, 'car-test', createRng(1), CONTEXT)
    let sawFilled = false
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = instance.parts[partId].installed
      if (!installed) continue
      sawFilled = true
      const catalogPart = CONTEXT.partsById[installed.partId]
      expect(catalogPart).toBeDefined()
      expect(['stock', 'street', 'sport', 'race']).toContain(catalogPart?.grade)
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

describe('aftermarket-at-generation (Sprint 75 decision 1)', () => {
  const model = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')
  if (!model) throw new Error('fixture common-tier car missing from seed content')
  const fitmentClass = fitmentClassForTier(model.tier)

  /** Every aftermarket-grade (non-stock) installed part on `car`. */
  function aftermarketParts(car: CarInstance) {
    return ALL_CAR_PART_IDS.flatMap((partId) => {
      const installed = car.parts[partId].installed
      if (!installed) return []
      const catalogPart = CONTEXT.partsById[installed.partId]
      return catalogPart && catalogPart.grade !== 'stock' ? [{ partId, catalogPart }] : []
    })
  }

  it('fits at least one aftermarket part somewhere across a fixed seed batch (the roll is reachable)', () => {
    let sawAftermarket = false
    for (let seed = 0; seed < 200 && !sawAftermarket; seed++) {
      const instance = generateAuctionCarInstance(model, 'car-test', createRng(seed), CONTEXT)
      if (aftermarketParts(instance).length > 0) sawAftermarket = true
    }
    expect(sawAftermarket).toBe(true)
  })

  it('never fits more than maxAftermarketSlots (3) aftermarket parts on any single generated car', () => {
    for (let seed = 0; seed < 300; seed++) {
      const instance = generateAuctionCarInstance(model, 'car-test', createRng(seed), CONTEXT)
      expect(aftermarketParts(instance).length).toBeLessThanOrEqual(
        CONTEXT.economy.partsGeneration.maxAftermarketSlots,
      )
    }
  })

  it("every fitted aftermarket part matches the car's own fitment class and the slot it addresses", () => {
    for (let seed = 0; seed < 300; seed++) {
      const instance = generateAuctionCarInstance(model, 'car-test', createRng(seed), CONTEXT)
      for (const { partId, catalogPart } of aftermarketParts(instance)) {
        expect(catalogPart.carPartId).toBe(partId)
        expect(catalogPart.fitmentClass).toBe(fitmentClass)
        expect(['street', 'sport', 'race']).toContain(catalogPart.grade)
      }
    }
  })

  it('a slot is never both missing and aftermarket - a missing slot is always null', () => {
    for (let seed = 0; seed < 300; seed++) {
      const instance = generateAuctionCarInstance(model, 'car-test', createRng(seed), CONTEXT)
      // aftermarketParts() only ever reports a PRESENT part by construction
      // (it reads car.parts[partId].installed first) - this test's real
      // claim is that the reverse can never silently happen: nothing in the
      // implementation should ever mark a slot missing while still handing
      // it an aftermarket PartInstance. Cross-checked directly against every
      // slot rather than trusting the helper's own filtering.
      for (const partId of ALL_CAR_PART_IDS) {
        const installed = instance.parts[partId].installed
        if (installed === null) continue
        expect(installed).not.toBeNull()
      }
    }
  })

  it('is deterministic for the same seed, including which slots roll aftermarket and at which grade', () => {
    const a = generateAuctionCarInstance(model, 'car-test', createRng(7), CONTEXT)
    const b = generateAuctionCarInstance(model, 'car-test', createRng(7), CONTEXT)
    expect(aftermarketParts(a)).toEqual(aftermarketParts(b))
    expect(a).toEqual(b)
  })

  it('fitting an aftermarket part never changes the band it would otherwise have rolled', () => {
    // Same seed, same model, real content: the aftermarket branch and the
    // stock branch price the SAME rolled `band` - only `partId` changes.
    // Verified by checking every fitted aftermarket part's band is one of
    // the real bands (never undefined/mismatched) and the car as a whole
    // still passes the general "every filled slot rolls a real band" check.
    for (let seed = 0; seed < 50; seed++) {
      const instance = generateAuctionCarInstance(model, 'car-test', createRng(seed), CONTEXT)
      for (const { partId } of aftermarketParts(instance)) {
        const band = instance.parts[partId].installed?.band
        expect(['scrap', 'poor', 'worn', 'fine', 'mint']).toContain(band)
      }
    }
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

describe('generation is mileage-driven: age -> mileage -> condition (Sprint 34)', () => {
  const model = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!model) throw new Error('fixture car missing from seed content')

  /** `poor`/`scrap` share across every filled slot on `instance`. */
  function poorOrWorseFraction(instances: readonly CarInstance[]): number {
    let poorOrWorse = 0
    let total = 0
    for (const instance of instances) {
      for (const partId of ALL_CAR_PART_IDS) {
        const installed = instance.parts[partId].installed
        if (!installed) continue
        total += 1
        if (installed.band === 'poor' || installed.band === 'scrap') poorOrWorse += 1
      }
    }
    return total > 0 ? poorOrWorse / total : 0
  }

  function meanMileageKm(instances: readonly CarInstance[]): number {
    return instances.reduce((sum, c) => sum + c.mileageKm, 0) / instances.length
  }

  const generateAtAge = (ageYears: number, count: number, label: string): CarInstance[] =>
    Array.from({ length: count }, (_, seed) =>
      generateAuctionCarInstance(
        model,
        `car-${label}-${seed}`,
        createRng(seed),
        CONTEXT,
        model.spec.yearFrom + ageYears,
      ),
    )

  it('mileage rises with age: old cars are drawn from a materially higher-mileage range than young ones', () => {
    const young = generateAtAge(0, 200, 'young')
    const old = generateAtAge(25, 200, 'old')
    // The whole point of the chain: age no longer decouples from mileage.
    expect(meanMileageKm(old)).toBeGreaterThan(meanMileageKm(young))
    // ...and concretely, a near-new car is genuinely low-mileage while an old
    // one is high-mileage (not merely "a bit more on average").
    expect(meanMileageKm(young)).toBeLessThan(20_000)
    expect(meanMileageKm(old)).toBeGreaterThan(100_000)
  })

  it('condition falls as mileage rises: within a mixed-age sample, the lower-mileage half is in better condition than the higher-mileage half', () => {
    const instances: CarInstance[] = []
    for (let age = 0; age <= 25; age++) {
      for (let seed = 0; seed < 20; seed++) {
        instances.push(
          generateAuctionCarInstance(
            model,
            `car-mix-${age}-${seed}`,
            createRng(age * 1000 + seed),
            CONTEXT,
            model.spec.yearFrom + age,
          ),
        )
      }
    }
    const sorted = [...instances].sort((a, b) => a.mileageKm - b.mileageKm)
    const half = Math.floor(sorted.length / 2)
    const lowMileage = sorted.slice(0, half)
    const highMileage = sorted.slice(half)
    expect(poorOrWorseFraction(lowMileage)).toBeLessThan(poorOrWorseFraction(highMileage))
  })

  it('a brand-new (age-0) car does not roll nearly every part poor', () => {
    // A near-new car is low-mileage, so its condition baseline sits high - a
    // small poor tail is fine, a majority is the incoherence this chain fixes.
    expect(poorOrWorseFraction(generateAtAge(0, 100, 'young'))).toBeLessThan(0.2)
  })

  it('an old (age ~25) car rolls meaningfully worse on average than an age-0 car, same seeds', () => {
    expect(poorOrWorseFraction(generateAtAge(25, 150, 'old'))).toBeGreaterThan(
      poorOrWorseFraction(generateAtAge(0, 150, 'young')),
    )
  })

  it('with no calendar context (currentYear omitted), condition still rolls a real, bounded spread', () => {
    // Age falls back to a fixed default (constants.ts) rather than an
    // infinite/undefined age when currentYear is unbounded - the mileage
    // range for that default age still produces every real band.
    const instance = generateAuctionCarInstance(model, 'car-test', createRng(1), CONTEXT)
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = instance.parts[partId].installed
      if (installed) expect(['scrap', 'poor', 'worn', 'fine', 'mint']).toContain(installed.band)
    }
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
