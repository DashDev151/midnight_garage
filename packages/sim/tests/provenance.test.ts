import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type GameState,
  type ServiceJob,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carOriginLabel, generateAuctionCarInstance, stockInstanceFor } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { installFitGate, resolveRemovePart } from '../src/jobs'
import { resolveBuyPart, resolvePartDeliveries } from '../src/parts'
import {
  describeOrigin,
  isCustomerOriginPart,
  makeCarOrigin,
  makeMarketOrigin,
  partsOriginatingFromCar,
} from '../src/provenance'
import { createRng } from '../src/rng'
import { resolveServiceJob } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts, testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 1_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    graceParkingCarId: null,
    laborSlotsSpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    ...overrides,
  }
}

describe('provenance.ts primitives', () => {
  it('makeCarOrigin stamps the car kind with its id, label, and day', () => {
    expect(makeCarOrigin('car-1', "'95 Corolla", 12)).toEqual({
      kind: 'car',
      carInstanceId: 'car-1',
      carLabel: "'95 Corolla",
      day: 12,
    })
  })

  it('makeMarketOrigin stamps the market kind with just a day', () => {
    expect(makeMarketOrigin(7)).toEqual({ kind: 'market', day: 7 })
  })

  it('describeOrigin reads a car origin as "Pulled from <carLabel>"', () => {
    expect(describeOrigin(makeCarOrigin('car-1', "'95 Corolla", 12))).toBe(
      "Pulled from '95 Corolla",
    )
  })

  it('describeOrigin reads a market origin as "Bought day <n>"', () => {
    expect(describeOrigin(makeMarketOrigin(7))).toBe('Bought day 7')
  })

  it("isCustomerOriginPart is true only for a part whose origin traces to THAT job's car", () => {
    const job = { car: { id: 'car-customer' } } as ServiceJob
    const theirs = { origin: makeCarOrigin('car-customer', 'Their Car', 1) } as never
    const someoneElses = { origin: makeCarOrigin('car-other', 'Other Car', 1) } as never
    const bought = { origin: makeMarketOrigin(1) } as never
    expect(isCustomerOriginPart(theirs, job)).toBe(true)
    expect(isCustomerOriginPart(someoneElses, job)).toBe(false)
    expect(isCustomerOriginPart(bought, job)).toBe(false)
  })

  it('partsOriginatingFromCar filters to exactly the parts born on that car', () => {
    const parts = [
      { id: 'a', origin: makeCarOrigin('car-1', 'Car One', 1) },
      { id: 'b', origin: makeCarOrigin('car-2', 'Car Two', 1) },
      { id: 'c', origin: makeMarketOrigin(1) },
    ] as never
    expect(partsOriginatingFromCar(parts, 'car-1').map((p: { id: string }) => p.id)).toEqual(['a'])
  })
})

describe('birth site: stockInstanceFor (auctions.ts) stamps the passed origin', () => {
  it('stamps the exact origin object it is given', () => {
    const origin = makeCarOrigin('car-1', "'95 Corolla", 3)
    const instance = stockInstanceFor(
      'dampers',
      'mint',
      'test',
      'common',
      CONTEXT.stockPartByCarPartId,
      origin,
    )
    expect(instance?.origin).toEqual(origin)
  })
})

describe('birth site: generateAuctionCarInstance (auctions.ts) stamps a car origin on every part', () => {
  it('every present part on a freshly-generated car carries a car-kind origin pointing at that exact car', () => {
    const model = CARS[0]!
    const car = generateAuctionCarInstance(
      model,
      'car-gen-1',
      createRng(1),
      CONTEXT,
      1996,
      true,
      42,
    )
    const expectedLabel = carOriginLabel(model, car.year)
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = car.parts[partId].installed
      if (!installed) continue
      expect(installed.origin).toEqual({
        kind: 'car',
        carInstanceId: 'car-gen-1',
        carLabel: expectedLabel,
        day: 42,
      })
    }
  })
})

describe("birth site: resolveRemovePart (jobs.ts) backfill instance carries the car's own origin", () => {
  it("a fresh stock instance backfilled after pulling an aftermarket part off a car carries that car's origin", () => {
    const model = CARS.find((m) => m.id === 'honda-city-e-aa')!
    const car: CarInstance = buildCarInstance({
      id: 'car-owned-1',
      modelId: model.id,
      parts: mintCarParts({
        dampers: {
          id: 'pi-aftermarket',
          partId: 'shitbox-tanuki-street-coilovers',
          band: 'worn',
          genuinePeriod: false,
          origin: makeMarketOrigin(1),
        },
      }),
    })
    const state = baseState({ ownedCars: [car], day: 9 })
    const result = resolveRemovePart(state, car.id, 'dampers', CONTEXT)
    const backfilled = result.state.ownedCars[0]!.parts.dampers.installed!
    expect(backfilled.origin).toEqual({
      kind: 'car',
      carInstanceId: car.id,
      carLabel: carOriginLabel(model, car.year),
      day: 9,
    })
  })
})

describe('birth site: resolveBuyPart (parts.ts) stamps a market origin', () => {
  it('an express purchase carries a market origin at the current day', () => {
    const partId = PARTS[0]!.id
    const state = baseState({ day: 5, cashYen: 10_000_000 })
    const result = resolveBuyPart(state, partId, CONTEXT, 'express')
    expect(result.state.partInventory[0]!.origin).toEqual(makeMarketOrigin(5))
  })
})

describe('birth site: resolvePartDeliveries (parts.ts) stamps a market origin', () => {
  it('a standard-delivery part lands in inventory with a market origin on the day it delivers', () => {
    const partId = PARTS[0]!.id
    const ordered = resolveBuyPart(
      baseState({ day: 5, cashYen: 10_000_000 }),
      partId,
      CONTEXT,
      'standard',
    ).state
    const delivered = resolvePartDeliveries(ordered)
    expect(delivered.state.partInventory[0]!.origin).toEqual(makeMarketOrigin(ordered.day))
  })
})

describe('close-out parity (Sprint 68 post-fix baseline, reimplemented over origin)', () => {
  it("a part the player buys and fits to a customer's car survives close-out - it was never the customer's", () => {
    const model = CARS.find((m) => m.id === 'honda-city-e-aa')!
    const customerCar: CarInstance = buildCarInstance({
      id: 'car-customer-1',
      modelId: model.id,
      parts: { ...mintCarParts(), dampers: { installed: null } },
    })
    const job: ServiceJob = {
      id: 'svc-1',
      typeId: 'small-bodywork-touchup',
      customerName: 'Test Customer',
      description: 'Suspension work.',
      tasks: [
        {
          requirement: {
            kind: 'slotCondition',
            carPartId: 'dampers',
            minBand: 'fine',
            minGrade: 'stock',
          },
          minToolTier: 1,
        },
      ],
      car: customerCar,
      payoutYen: 10_000,
      baseReputation: 5,
      deadlineDays: 5,
      expiresOnDay: 30,
      arrivesOnDay: null,
      dueOnDay: 8,
    }
    const bought = resolveBuyPart(
      baseState({ activeServiceJobs: [job], day: 2, cashYen: 10_000_000 }),
      PARTS.find(
        (p) => p.carPartId === 'dampers' && p.fitmentClass === 'shitbox' && p.grade !== 'stock',
      )!.id,
      CONTEXT,
      'express',
    )
    const boughtPart = bought.state.partInventory[0]!
    const installGate = installFitGate(
      bought.state,
      {
        carInstanceId: customerCar.id,
        kind: 'install-part',
        componentId: 'suspension',
        partInstanceId: boughtPart.id,
        laborSlotsRequired: 1,
      },
      CONTEXT,
    )
    expect(installGate.ok).toBe(true)

    // Fit it, then think better of it and pull it back off.
    const withInstalled: GameState = {
      ...bought.state,
      activeServiceJobs: [
        {
          ...job,
          car: {
            ...customerCar,
            parts: { ...customerCar.parts, dampers: { installed: boughtPart } },
          },
        },
      ],
      partInventory: [],
    }
    const removed = resolveRemovePart(withInstalled, customerCar.id, 'dampers', CONTEXT)
    expect(removed.state.partInventory).toHaveLength(1)
    expect(removed.state.partInventory[0]!.id).toBe(boughtPart.id)
    expect(removed.state.partInventory[0]!.origin.kind).toBe('market')

    // Hand the job back - the player's bought part must survive close-out.
    const jobToClose = removed.state.activeServiceJobs[0]!
    const closed = resolveServiceJob(removed.state, jobToClose.id, CONTEXT)
    expect(closed.state.partInventory.map((p) => p.id)).toContain(boughtPart.id)
  })

  it("pulling the customer's own (car-origin) part off any job returns it to them at close-out", () => {
    const model = CARS.find((m) => m.id === 'honda-city-e-aa')!
    const carOrigin = makeCarOrigin('car-customer-2', "'84 City", 0)
    const customerCar: CarInstance = buildCarInstance({
      id: 'car-customer-2',
      modelId: model.id,
      // The customer's own dampers, born on this exact car - unlike the
      // shared fixture's generic default origin, this one must genuinely
      // trace to `customerCar.id` for the close-out reconciliation below to
      // have anything real to key off. `dampers` is bolt-on with no
      // blockers - a plain removal, unrelated to what this test is actually
      // about (origin-based close-out reconciliation).
      parts: mintCarParts({
        dampers: {
          id: 'pi-customers-dampers',
          partId: 'shitbox-stock-dampers',
          band: 'worn',
          genuinePeriod: false,
          origin: carOrigin,
        },
      }),
    })
    const job: ServiceJob = {
      id: 'svc-2',
      typeId: 'small-bodywork-touchup',
      customerName: 'Test Customer',
      description: 'Suspension work.',
      tasks: [
        {
          requirement: { kind: 'slotCondition', carPartId: 'dampers', minBand: 'fine' },
          minToolTier: 1,
        },
      ],
      car: customerCar,
      payoutYen: 10_000,
      baseReputation: 5,
      deadlineDays: 5,
      expiresOnDay: 30,
      arrivesOnDay: null,
      dueOnDay: 8,
    }
    const state = baseState({ activeServiceJobs: [job], day: 3 })
    const removed = resolveRemovePart(state, customerCar.id, 'dampers', CONTEXT)
    expect(removed.state.partInventory).toHaveLength(1)
    const pulled = removed.state.partInventory[0]!
    expect(pulled.origin).toEqual(carOrigin)

    const closed = resolveServiceJob(removed.state, job.id, CONTEXT)
    // The customer's own dampers leave with them, not kept by the player.
    expect(closed.state.partInventory.map((p) => p.id)).not.toContain(pulled.id)
  })
})
