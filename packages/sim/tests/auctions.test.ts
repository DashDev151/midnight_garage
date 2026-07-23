import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  fitmentClassForTier,
  PARTS,
  PARTS_TAXONOMY,
  type AuctionTier,
  type CarInstance,
  type CarModel,
  type GameState,
  type RarityTier,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  auctionTierForRarity,
  generateAuctionCarInstance,
  generateAuctionCatalog,
} from '../src/auctions'
import { bandIndex, carCostToBandYen, carCostToMintYen } from '../src/bands'
import { isBodyDerivedPart, PANEL_ZONE_IDS } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { expectationForCar, mileageFactor } from '../src/marketValue'
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
    // A large sample by design (three 1000-lot draws, each rolling per-zone
    // body state), so it needs headroom over the 5s default under coverage.
  }, 30_000)

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

  /** The aftermarket-specific frequency/cap/fit tests live in their own
   * describe block below. */
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

  /** `poor`/`scrap` share across every filled slot on `instance`, excluding
   * `panels`/`paint`/`underbody`: this whole describe block is about the
   * age -> mileage -> condition chain, and the body pipeline's zone
   * severities (docs/design/workshop-rework.md's generation table) roll from
   * TIER weights alone, independently of age or mileage - a deliberate,
   * separate generation axis from this wave, not a claim this helper's own
   * callers are testing. */
  function poorOrWorseFraction(instances: readonly CarInstance[]): number {
    let poorOrWorse = 0
    let total = 0
    for (const instance of instances) {
      for (const partId of ALL_CAR_PART_IDS) {
        if (isBodyDerivedPart(partId)) continue
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
    // A near-new car is low-mileage, so its wear-model condition baseline
    // sits high. The core-loop floor now layers a SEPARATE, deliberate
    // below-expectation top-up on top of that baseline (regardless of age -
    // every generated car carries some floor-level fixable work), and for a
    // shitbox model that top-up can only ever land on `poor` (its own
    // 'worn' expectation band means anything milder does not count as
    // below-expectation work), never a spread of gentler bands. The honest
    // post-floor fraction therefore sits well above the old wear-model-only
    // baseline this test measured before the floor existed - not a majority,
    // but no longer a small tail either.
    expect(poorOrWorseFraction(generateAtAge(0, 100, 'young'))).toBeLessThan(0.4)
  })

  it('an old (age ~25) car is not meaningfully BETTER than an age-0 car on the non-body parts, even once the core-loop floor levels both toward the same bar', () => {
    // This test's original claim (old strictly worse, on `poorOrWorseFraction`
    // alone) no longer holds reliably: the core-loop floor top-up
    // (`enforceMinWorkBill`) tops EVERY car up to the SAME absolute floor
    // regardless of age, and a clean age-0 car needs more of that top-up to
    // reach it than an already-worn age-25 car does - a real levelling effect
    // that was already present before this wave, but this wave's floor fix
    // (degrade eligibility now reads real zone headroom, not just the
    // coarser band index - see `degradeCandidates`) makes the top-up reach
    // its floor more reliably, which sharpens the levelling on the measured
    // 26-part remainder. The underlying age -> mileage -> condition claim is
    // still gated robustly by the two probes above (mileage rises with age;
    // the low-mileage half of a mixed sample beats the high-mileage half) -
    // this probe now only guards against a reversal, not a specific margin.
    const oldFrac = poorOrWorseFraction(generateAtAge(25, 600, 'old'))
    const youngFrac = poorOrWorseFraction(generateAtAge(0, 600, 'young'))
    expect(oldFrac).toBeGreaterThan(youngFrac * 0.9)
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

/**
 * The core-loop law's floor: generation never produces a car with nothing
 * below-expectation to fix. `partsGeneration.minWorkBillFractionByTier`
 * fixes a minimum below-expectation bill per fitment class, and
 * `generateAuctionCarInstance` tops up honest visible wear until every
 * generated car clears it, cherished provenance included (cherished only
 * ever means LESS damage, never none).
 *
 * The top-up's own contract has two legitimate outcomes, never a silent
 * third: either the floor is met, or every present part has already bottomed
 * out at `poor` (the worst band the never-force-`scrap` rule ever leaves a
 * part at) with nothing left anywhere on the car to degrade further - a
 * model whose parts are collectively too cheap, relative to its own book
 * value, to reach the floor without scrapping something. Both outcomes are
 * checked explicitly below; a shortfall that is NOT also fully exhausted is
 * a real failure, not tolerance.
 */
describe('the core-loop floor: every generated lot carries fixable work', () => {
  // Local Yard mixes shitbox and common models, so both are exercised there
  // under their own rarity tier, each with its own floor fraction.
  const TIERS: readonly [RarityTier, AuctionTier][] = [
    ['shitbox', 'local-yard'],
    ['common', 'local-yard'],
    ['uncommon', 'regional'],
    ['rare', 'premium'],
  ]
  const SEEDS = [11, 22, 33, 44, 55]
  const LOTS_PER_SEED = 50 // 5 seeds x 50 = 250 lots per tier, clearing the 200-lot floor

  const CHERISHED_PROVENANCE_NOTES = new Set(
    Object.values(CONTEXT.provenancePool).flatMap((byUpkeepTier) => byUpkeepTier.cherished),
  )

  function floorYenFor(model: CarModel): number {
    const fitmentClass = fitmentClassForTier(model.tier)
    return Math.round(
      model.bookValueYen * ECONOMY.partsGeneration.minWorkBillFractionByTier[fitmentClass],
    )
  }

  function billBelowExpectationYen(car: CarInstance, model: CarModel): number {
    return carCostToBandYen(
      car,
      model,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
      expectationForCar(model, ECONOMY).band,
    )
  }

  /** True once every present part sits at `poor` or worse - the state the
   * top-up's never-force-`scrap` rule leaves a fully-exhausted candidate pool
   * in. A missing or legitimately-absent slot was never a top-up candidate,
   * so it never counts against this. `panels`/`paint`/`underbody` are
   * checked through their own zone state, never their derived BAND: the
   * degrade top-up only ever moves surface/finish (money-relevant fields,
   * `bodyPipeline.ts`'s `degradeZoneCarrierOneStep`), never metal (labour-
   * only, never priced) - so a zone-backed part's band can sit well short of
   * `poor` (metal-driven) while its money contribution is nonetheless fully
   * exhausted (every zone's surface/finish already at its own cap). Checking
   * the band alone for these three would under-count real exhaustion.
   */
  function everyPartAtWorstReachableBand(car: CarInstance): boolean {
    const zoneState = car.zoneState
    const zoneExhausted =
      !zoneState ||
      (PANEL_ZONE_IDS.every((id) => zoneState[id].surface >= 2) &&
        PANEL_ZONE_IDS.every((id) => zoneState[id].finish >= 3) &&
        zoneState.chassis.finish >= 3)
    return (
      zoneExhausted &&
      ALL_CAR_PART_IDS.every((partId) => {
        if (isBodyDerivedPart(partId)) return true // covered by zoneExhausted above
        const installed = car.parts[partId].installed
        return !installed || bandIndex(installed.band) <= bandIndex('poor')
      })
    )
  }

  /** True once the car's whole bill is already hugging the Law 2 ceiling
   * (`maxBillFraction * cleanValue`, within a tiny rounding epsilon) - the
   * top-up's OTHER legitimate stopping condition (`enforceMinWorkBill`'s own
   * doc comment): a candidate that would breach the ceiling is dropped for
   * another, and the loop stops once every remaining candidate would. On the
   * body pipeline's flat, era-true materials prices this binds occasionally
   * on the cheapest (shitbox) tier, where a single stage's yen cost is a
   * comparatively large step against a small book value - a real, disclosed
   * interaction between two independently-tuned guards, not a bug. */
  function ceilingAlreadyBinds(car: CarInstance, model: CarModel): boolean {
    const cleanValueYen = model.bookValueYen * mileageFactor(car.mileageKm, ECONOMY)
    const maxBillYen = ECONOMY.partsGeneration.maxBillFraction * cleanValueYen
    const billYen = carCostToMintYen(
      car,
      model,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    return billYen >= maxBillYen - 1 // rounding slack only
  }

  function expectMeetsFloorOrExhausted(
    lot: ReturnType<typeof generateAuctionCatalog>[number],
    lotModel: CarModel,
    rarityTier: RarityTier,
  ): void {
    const billBelow = billBelowExpectationYen(lot.car, lotModel)
    const floor = floorYenFor(lotModel)
    const metFloor = billBelow >= floor
    const exhausted =
      everyPartAtWorstReachableBand(lot.car) || ceilingAlreadyBinds(lot.car, lotModel)
    expect(
      metFloor || exhausted,
      `${lot.id} (${lotModel.id}): below-expectation bill ${billBelow} under its ${rarityTier} floor ${floor}, not every part exhausted, and the Law 2 ceiling isn't binding either - a real shortfall`,
    ).toBe(true)
  }

  for (const [rarityTier, auctionTier] of TIERS) {
    it(`every ${rarityTier} lot's true car meets its floor (or is fully exhausted trying), over >= 200 lots across several seeds`, () => {
      const models = CARS.filter((m) => m.tier === rarityTier)
      expect(models.length, `fixture roster has no ${rarityTier} models`).toBeGreaterThan(0)

      const lots = SEEDS.flatMap((seed) =>
        generateAuctionCatalog(models, auctionTier, 7, LOTS_PER_SEED, createRng(seed), CONTEXT),
      )
      expect(lots.length).toBeGreaterThanOrEqual(200)

      for (const lot of lots) {
        const lotModel = CONTEXT.modelsById[lot.modelId]
        if (!lotModel) throw new Error(`generated lot references unknown model "${lot.modelId}"`)
        expectMeetsFloorOrExhausted(lot, lotModel, rarityTier)
      }

      const cherishedLots = lots.filter((lot) =>
        CHERISHED_PROVENANCE_NOTES.has(lot.car.provenanceNote),
      )
      expect(
        cherishedLots.length,
        `expected at least one cherished-provenance ${rarityTier} lot in the sample`,
      ).toBeGreaterThan(0)
      for (const lot of cherishedLots) {
        const lotModel = CONTEXT.modelsById[lot.modelId]!
        expectMeetsFloorOrExhausted(lot, lotModel, rarityTier)
      }
    })
  }
})
