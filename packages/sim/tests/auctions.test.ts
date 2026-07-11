import {
  CARS,
  ECONOMY,
  HIDDEN_ISSUES,
  type CarModel,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  auctionTierForRarity,
  generateAuctionCarInstance,
  generateAuctionCatalog,
  groupHiddenIssuesByComponent,
  inspectLot,
  resolveInspectLot,
  revealIssuesAtHandover,
} from '../src/auctions'
import { createRng } from '../src/rng'

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
    activeListings: [],
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

const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent(HIDDEN_ISSUES)

/** A synthetic Gaisha model — PoC-10 has none, so this proves the exclusion holds even when one exists in the pool. */
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
  hiddenIssueWeights: [],
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
        const lots = generateAuctionCatalog(
          modelsWithGaisha,
          tier,
          HIDDEN_ISSUES_BY_COMPONENT,
          7,
          5,
          createRng(seed),
          ECONOMY,
        )
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

  const COMPONENT_IDS = [
    'engine',
    'forcedInduction',
    'drivetrain',
    'suspension',
    'brakes',
    'wheels',
    'body',
    'interior',
  ] as const

  it('rolls condition and authenticity within sane bounds', () => {
    const rng = createRng(1)
    const instance = generateAuctionCarInstance(model, HIDDEN_ISSUES_BY_COMPONENT, 'car-test', rng)
    for (const componentId of COMPONENT_IDS) {
      expect(instance.components[componentId].condition).toBeGreaterThanOrEqual(0)
      expect(instance.components[componentId].condition).toBeLessThanOrEqual(100)
    }
    expect(instance.authenticityPercent).toBeGreaterThanOrEqual(60)
    expect(instance.authenticityPercent).toBeLessThanOrEqual(95)
    expect(instance.year).toBeGreaterThanOrEqual(model.spec.yearFrom)
  })

  it('rolled component conditions cluster around a shared per-car baseline (Sprint 12 decision 5)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const instance = generateAuctionCarInstance(
        model,
        HIDDEN_ISSUES_BY_COMPONENT,
        'car-test',
        createRng(seed),
      )
      const conditions = COMPONENT_IDS.map((id) => instance.components[id].condition)
      const spread = Math.max(...conditions) - Math.min(...conditions)
      // Two components' conditions can each swing +/-15 from the shared
      // baseline, so the worst-case spread within one car is 30 — never the
      // near-100 spread independent rolls could produce (e.g. 100 vs 1).
      expect(spread).toBeLessThanOrEqual(30)
    }
  })

  it('starts stock — every component has nothing installed', () => {
    const instance = generateAuctionCarInstance(
      model,
      HIDDEN_ISSUES_BY_COMPONENT,
      'car-test',
      createRng(1),
    )
    for (const componentId of COMPONENT_IDS) {
      expect(instance.components[componentId].installed).toBeNull()
    }
  })

  it('hidden issues start unrevealed', () => {
    const instance = generateAuctionCarInstance(
      model,
      HIDDEN_ISSUES_BY_COMPONENT,
      'car-test',
      createRng(2),
    )
    for (const issue of instance.hiddenIssues) {
      expect(issue.revealed).toBe(false)
    }
  })
})

describe('currentYear clamp — the rolling chronology (Sprint 10 item 6)', () => {
  const model = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!model) throw new Error('fixture car missing from seed content')

  /** yearFrom 2005 — released well after a 1995 campaign start. */
  const FUTURE_MODEL: CarModel = {
    ...model,
    id: 'future-test-model',
    spec: { ...model.spec, yearFrom: 2005 },
  }

  it('generateAuctionCarInstance never rolls a year past currentYear', () => {
    for (let seed = 0; seed < 30; seed++) {
      const instance = generateAuctionCarInstance(
        model,
        HIDDEN_ISSUES_BY_COMPONENT,
        'car-test',
        createRng(seed),
        1996,
      )
      expect(instance.year).toBeLessThanOrEqual(1996)
    }
  })

  it('generateAuctionCatalog excludes a model whose yearFrom postdates currentYear', () => {
    const lots = generateAuctionCatalog(
      [FUTURE_MODEL],
      'local-yard',
      HIDDEN_ISSUES_BY_COMPONENT,
      7,
      5,
      createRng(1),
      ECONOMY,
      1995,
    )
    expect(lots).toHaveLength(0)
  })

  it('generateAuctionCatalog includes that same model once the calendar reaches its release year', () => {
    const lots = generateAuctionCatalog(
      [FUTURE_MODEL],
      'local-yard',
      HIDDEN_ISSUES_BY_COMPONENT,
      7,
      5,
      createRng(1),
      ECONOMY,
      2005,
    )
    expect(lots.length).toBeGreaterThan(0)
    for (const lot of lots) {
      expect(lot.car.year).toBeLessThanOrEqual(2005)
    }
  })

  it('defaults to unrestricted (Infinity) when currentYear is omitted', () => {
    const lots = generateAuctionCatalog(
      [FUTURE_MODEL],
      'local-yard',
      HIDDEN_ISSUES_BY_COMPONENT,
      7,
      5,
      createRng(1),
      ECONOMY,
    )
    expect(lots.length).toBeGreaterThan(0)
  })
})

describe('inspectLot', () => {
  it('reveals every hidden issue and marks the lot inspected', () => {
    const model = CARS.find((c) => c.id === 'honda-city-e-aa')
    if (!model) throw new Error('fixture car missing from seed content')
    const lots = generateAuctionCatalog(
      CARS,
      'local-yard',
      HIDDEN_ISSUES_BY_COMPONENT,
      7,
      10,
      createRng(3),
      ECONOMY,
    )
    const lotWithIssue = lots.find((lot) => lot.car.hiddenIssues.length > 0)
    if (!lotWithIssue) return // seed happened to roll no issues this run — nothing to assert
    const inspected = inspectLot(lotWithIssue)
    expect(inspected.inspected).toBe(true)
    for (const issue of inspected.car.hiddenIssues) {
      expect(issue.revealed).toBe(true)
    }
  })
})

describe('resolveInspectLot (Sprint 11 instant resolver)', () => {
  const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
  if (!model) throw new Error('fixture car missing from seed content')

  const sampleLot = (seed: number) => {
    const [lot] = generateAuctionCatalog(
      [model],
      'premium',
      HIDDEN_ISSUES_BY_COMPONENT,
      7,
      1,
      createRng(seed),
      ECONOMY,
    )
    if (!lot) throw new Error('expected a lot')
    return lot
  }

  it('reveals the lot and charges only the cash travel fee — no labor cost (decision 4)', () => {
    const lot = sampleLot(1)
    const fee = ECONOMY.AUCTION_TRAVEL_FEE_YEN[lot.tier]
    const state = stateWithLots([lot], 1_000_000)
    const result = resolveInspectLot(state, lot.id, ECONOMY)
    expect(result.state.activeAuctionLots[0]?.inspected).toBe(true)
    expect(result.state.cashYen).toBe(1_000_000 - fee)
    expect(result.state.laborSlotsSpentToday).toBe(0) // untouched — inspect never spends labor
    expect(result.log).toEqual([{ type: 'lot-inspected', lotId: lot.id }])
  })

  it('is a no-op when the fee is unaffordable', () => {
    const lot = sampleLot(2)
    const state = stateWithLots([lot], 0)
    const result = resolveInspectLot(state, lot.id, ECONOMY)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('is a no-op for an already-inspected lot', () => {
    const lot = inspectLot(sampleLot(3))
    const state = stateWithLots([lot])
    const result = resolveInspectLot(state, lot.id, ECONOMY)
    expect(result.state).toBe(state)
  })

  it('is a no-op for an unknown lot id', () => {
    const state = stateWithLots([sampleLot(4)])
    const result = resolveInspectLot(state, 'no-such-lot', ECONOMY)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

describe('revealIssuesAtHandover (Sprint 22 — severity is fixed at generation, handover never mutates condition)', () => {
  const model = CARS.find((c) => c.id === 'mazda-savanna-rx7-fc3s')
  if (!model) throw new Error('fixture car missing from seed content')

  const lotWithIssue = (seed: number) => {
    let attempt = seed
    for (let i = 0; i < 20; i++) {
      const [lot] = generateAuctionCatalog(
        [model],
        'regional',
        HIDDEN_ISSUES_BY_COMPONENT,
        7,
        1,
        createRng(attempt),
        ECONOMY,
      )
      if (lot && lot.car.hiddenIssues.length > 0) return lot
      attempt += 1000
    }
    throw new Error('could not roll a lot with a hidden issue in 20 attempts')
  }

  it('never changes any component condition, inspected or not', () => {
    const lot = lotWithIssue(1)
    const inspectedResult = revealIssuesAtHandover(inspectLot(lot), true)
    const uninspectedResult = revealIssuesAtHandover(lot, false)
    expect(inspectedResult.car.components).toEqual(lot.car.components)
    expect(uninspectedResult.car.components).toEqual(lot.car.components)
  })

  it('every issue is revealed after handover, inspected or not', () => {
    const lot = lotWithIssue(3)
    const { car } = revealIssuesAtHandover(lot, false)
    for (const issue of car.hiddenIssues) {
      expect(issue.revealed).toBe(true)
    }
  })

  it('logs a discovery beat only when uninspected AND at least one issue rolled', () => {
    const lot = lotWithIssue(4)
    const uninspected = revealIssuesAtHandover(lot, false)
    expect(uninspected.log).toEqual([
      {
        type: 'issues-discovered',
        carInstanceId: lot.car.id,
        issueIds: lot.car.hiddenIssues.map((i) => i.issueId),
      },
    ])

    const inspected = revealIssuesAtHandover(inspectLot(lot), true)
    expect(inspected.log).toEqual([])
  })
})
