import { describe, expect, it } from 'vitest'
import {
  CarLedgerSchema,
  DayLogEntrySchema,
  DayLogSchema,
  GameStateSchema,
  PartInstanceSchema,
} from '../src'

describe('GameState / DayLog round-trip', () => {
  it('a hand-built GameState with one car and one installed part parses unchanged', () => {
    const fixture = {
      day: 1,
      seed: 1995,
      cashYen: 1_200_000,
      reputationTier: 'unknown',
      reputationPoints: 0,
      ownedCars: [
        {
          id: 'car-0001',
          modelId: 'honda-city-e-aa',
          year: 1984,
          mileageKm: 128_000,
          color: 'Sodium Amber',
          provenanceNote: 'one-owner, garage kept, Gunma plates',
          authenticityPercent: 88,
          parts: {
            block: {
              installed: {
                id: 'p-block',
                partId: 'stock-block',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            internals: {
              installed: {
                id: 'p-internals',
                partId: 'stock-internals',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            headValvetrain: {
              installed: {
                id: 'p-headValvetrain',
                partId: 'stock-head-valvetrain',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            camsTiming: {
              installed: {
                id: 'p-camsTiming',
                partId: 'stock-cams-timing',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            intake: {
              installed: {
                id: 'p-intake',
                partId: 'stock-intake',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            exhaust: {
              installed: {
                id: 'p-exhaust',
                partId: 'stock-exhaust',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            fuelSystem: {
              installed: {
                id: 'p-fuelSystem',
                partId: 'stock-fuel-system',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            ignitionEcu: {
              installed: {
                id: 'pi-0001',
                partId: 'khs-street-ecu',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            cooling: {
              installed: {
                id: 'p-cooling',
                partId: 'stock-cooling',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            forcedInduction: { installed: null },
            gearbox: {
              installed: {
                id: 'p-gearbox',
                partId: 'stock-gearbox',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            clutch: {
              installed: {
                id: 'p-clutch',
                partId: 'stock-clutch',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            differential: {
              installed: {
                id: 'p-differential',
                partId: 'stock-differential',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            driveline: {
              installed: {
                id: 'p-driveline',
                partId: 'stock-driveline',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            chassis: {
              installed: {
                id: 'p-chassis',
                partId: 'stock-chassis',
                band: 'fine',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            dampers: {
              installed: {
                id: 'p-dampers',
                partId: 'stock-dampers',
                band: 'poor',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            springs: {
              installed: {
                id: 'p-springs',
                partId: 'stock-springs',
                band: 'poor',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            antiRollBars: {
              installed: {
                id: 'p-antiRollBars',
                partId: 'stock-anti-roll-bars',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            steering: {
              installed: {
                id: 'p-steering',
                partId: 'stock-steering',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            brakePadsDiscs: {
              installed: {
                id: 'p-brakePadsDiscs',
                partId: 'stock-brake-pads-discs',
                band: 'mint',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            brakeCalipersLines: {
              installed: {
                id: 'p-brakeCalipersLines',
                partId: 'stock-brake-calipers-lines',
                band: 'mint',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            rims: {
              installed: {
                id: 'p-rims',
                partId: 'stock-rims',
                band: 'mint',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            tyres: {
              installed: {
                id: 'p-tyres',
                partId: 'stock-tyres',
                band: 'mint',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            panels: {
              installed: {
                id: 'p-panels',
                partId: 'stock-panels',
                band: 'poor',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            paint: {
              installed: {
                id: 'p-paint',
                partId: 'stock-paint',
                band: 'poor',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            underbody: {
              installed: {
                id: 'p-underbody',
                partId: 'stock-underbody',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            aero: {
              installed: {
                id: 'p-aero',
                partId: 'stock-aero',
                band: 'mint',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            seats: {
              installed: {
                id: 'p-seats',
                partId: 'stock-seats',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
            dashGauges: {
              installed: {
                id: 'p-dashGauges',
                partId: 'stock-dash-gauges',
                band: 'worn',
                genuinePeriod: false,
                origin: { kind: 'market', day: 1 },
              },
            },
          },
          symptoms: [],
          apparentBandByPartId: null,
        },
      ],
      partInventory: [
        {
          id: 'pi-0002',
          partId: 'tanuki-street-coilovers',
          band: 'mint',
          genuinePeriod: false,
          origin: { kind: 'market', day: 1 },
          pricePaidYen: 78_000,
        },
      ],
      staff: [],
      jobs: [],
      marketHeat: {},
      activeAuctionLots: [],
      carsForSale: [{ carInstanceId: 'car-0002', sinceDay: 4 }],
      pendingOffers: [{ carInstanceId: 'car-0002', buyerId: 'tuner', priceYen: 500_000 }],
      serviceJobOffers: [],
      activeServiceJobs: [],
      serviceBayCount: 1,
      parkingBayCount: 3,
      serviceBayCarIds: ['car-0001'],
      parkingCarIds: [null, null, null],
      graceParkingCarId: null,
      energySpentToday: 0,
      toolTiers: {
        engine: 1,
        drivetrain: 1,
        suspension: 1,
        wheels: 1,
        body: 1,
        interior: 1,
      },
      specialty: {
        engine: 0,
        drivetrain: 0,
        suspension: 0,
        wheels: 0,
        body: 0,
        interior: 0,
      },
      pendingPartOrders: [],
      cartPartIds: [],
      stagedCarWork: {},
      marketLedger: { lotSupply: {}, playerSales: {} },
      carLedgers: { 'car-0001': { purchaseYen: 900_000, repairYen: 45_000, partsYen: 60_000 } },
      machineListing: null,
      nextMachineListingDay: null,
      serviceJobLedgers: {},
      inspectionVisit: null,
      storyMissions: [],
      staffAds: [],
    }

    const parsed = GameStateSchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })

  it('a DayLog with one entry per event type parses unchanged', () => {
    const fixture = [
      { type: 'rent-paid', amountYen: -90_000 },
      { type: 'double-parking-fine', carInstanceId: 'car-0001', amountYen: 8_000 },
      { type: 'wage-paid', staffId: 'staff-0001', amountYen: -45_000 },
      { type: 'job-created', jobId: 'job-0001', carInstanceId: 'car-0001', kind: 'repair-zone' },
      { type: 'job-progress', jobId: 'job-0001', laborSlotsSpent: 1 },
      { type: 'job-completed', jobId: 'job-0001', carInstanceId: 'car-0001', kind: 'repair-zone' },
      { type: 'job-blocked', jobId: 'job-0002', reason: 'slot-occupied' },
      { type: 'labor-overbooked', requestedSlots: 5, availableSlots: 2 },
      { type: 'contract-income', amountYen: 15_000 },
      { type: 'market-heat-shift', modelId: 'toyota-supra-rz-jza80', deltaPercent: 12.5 },
      { type: 'auction-catalog-refreshed', tier: 'local-yard', lotCount: 3 },
      {
        type: 'auction-bid-won',
        lotId: 'lot-0001',
        finalPriceYen: 150_000,
        modelId: 'honda-city-e-aa',
        year: 1984,
      },
      {
        type: 'auction-bid-lost',
        lotId: 'lot-0002',
        winningPriceYen: 200_000,
        modelId: 'honda-city-e-aa',
        year: 1984,
      },
      {
        type: 'lot-bought-out',
        lotId: 'lot-0003',
        priceYen: 240_000,
        modelId: 'honda-city-e-aa',
        year: 1984,
      },
      {
        type: 'service-job-completed',
        jobId: 'svc-0001',
        payoutYen: 42_000,
        reputationGained: 4,
        repairCostYen: 8_000,
        partsCostYen: 0,
        specialtyGained: {
          engine: 4,
          drivetrain: 0,
          suspension: 0,
          wheels: 0,
          body: 0,
          interior: 0,
        },
        netProfitYen: 34_000,
      },
      {
        type: 'offer-received',
        carInstanceId: 'car-0001',
        modelId: 'honda-city-e-aa',
        buyerId: 'tuner',
        priceYen: 300_000,
      },
      {
        type: 'car-sold',
        carInstanceId: 'car-0001',
        channel: 'walk-in-offer',
        priceYen: 280_000,
        reputationDelta: 3,
        profitYen: 40_000,
      },
      {
        type: 'part-bought',
        partId: 'khs-street-ecu',
        partInstanceId: 'part-7-0',
        priceYen: 60_000,
      },
      {
        type: 'part-ordered',
        orderId: 'order-7-0',
        partId: 'khs-street-ecu',
        priceYen: 54_000,
        arrivesOnDay: 8,
      },
      {
        type: 'part-delivered',
        orderId: 'order-7-0',
        partId: 'khs-street-ecu',
        partInstanceId: 'part-8-0',
      },
      { type: 'part-scrapped', partInstanceId: 'part-8-0', priceYen: 4_000 },
      {
        type: 'part-removed',
        carInstanceId: 'car-0001',
        carPartId: 'dampers',
        partInstanceId: 'part-8-1',
      },
      { type: 'car-moved', carInstanceId: 'car-0001', to: 'service' },
      { type: 'cars-swapped', serviceCarId: 'car-0001', parkingCarId: 'car-0002' },
      { type: 'bay-purchased', kind: 'service', priceYen: 300_000 },
      { type: 'acquisition-blocked', kind: 'buyout', reason: 'no-space' },
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'tool-tier' },
      { type: 'equipment-purchased', equipmentId: 'tire-machine', priceYen: 150_000 },
      { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: 150_000 },
    ]

    const parsed = DayLogSchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })

  it("'job-created' accepts an optional nonnegative costYen (Sprint 40 sanction)", () => {
    const withCost = DayLogEntrySchema.parse({
      type: 'job-created',
      jobId: 'job-0001',
      carInstanceId: 'car-0001',
      kind: 'repair-zone',
      costYen: 15_000,
    })
    expect(withCost).toEqual({
      type: 'job-created',
      jobId: 'job-0001',
      carInstanceId: 'car-0001',
      kind: 'repair-zone',
      costYen: 15_000,
    })

    const withoutCost = DayLogEntrySchema.parse({
      type: 'job-created',
      jobId: 'job-0002',
      carInstanceId: 'car-0002',
      kind: 'install-part',
    })
    expect(withoutCost).not.toHaveProperty('costYen')
  })

  it('Sprint 42: CarLedgerSchema requires purchaseYen (nullable) and defaults repair/parts to 0', () => {
    const known = CarLedgerSchema.parse({
      purchaseYen: 900_000,
      repairYen: 45_000,
      partsYen: 60_000,
    })
    expect(known).toEqual({ purchaseYen: 900_000, repairYen: 45_000, partsYen: 60_000 })

    const unknown = CarLedgerSchema.parse({ purchaseYen: null })
    expect(unknown).toEqual({ purchaseYen: null, repairYen: 0, partsYen: 0 })

    expect(() => CarLedgerSchema.parse({})).toThrow() // purchaseYen has no default - must be stated
  })

  it('Sprint 42: GameState.carLedgers defaults to {} for a pre-v25 shape', () => {
    const withoutLedgers: Record<string, unknown> = {
      day: 1,
      seed: 1,
      cashYen: 0,
      reputationTier: 'unknown',
      reputationPoints: 0,
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
      energySpentToday: 0,
      toolTiers: {
        engine: 1,
        drivetrain: 1,
        suspension: 1,
        wheels: 1,
        body: 1,
        interior: 1,
      },
      specialty: {
        engine: 0,
        drivetrain: 0,
        suspension: 0,
        wheels: 0,
        body: 0,
        interior: 0,
      },
      pendingPartOrders: [],
      cartPartIds: [],
      stagedCarWork: {},
      marketLedger: { lotSupply: {}, playerSales: {} },
    }
    const parsed = GameStateSchema.parse(withoutLedgers)
    expect(parsed.carLedgers).toEqual({})
  })

  it("'car-sold' accepts an optional profitYen (Sprint 42) and omits it when absent", () => {
    const withProfit = DayLogEntrySchema.parse({
      type: 'car-sold',
      carInstanceId: 'car-0001',
      channel: 'walk-in-offer',
      priceYen: 900_000,
      profitYen: -20_000,
    })
    expect(withProfit).toMatchObject({ profitYen: -20_000 })

    const withoutProfit = DayLogEntrySchema.parse({
      type: 'car-sold',
      carInstanceId: 'car-0002',
      channel: 'walk-in-offer',
      priceYen: 500_000,
    })
    expect(withoutProfit).not.toHaveProperty('profitYen')
  })

  it('Sprint 42: PartInstance.pricePaidYen is optional and round-trips when present', () => {
    const priced = PartInstanceSchema.parse({
      id: 'pi-1',
      partId: 'khs-street-ecu',
      band: 'mint',
      genuinePeriod: false,
      origin: { kind: 'market', day: 1 },
      pricePaidYen: 60_000,
    })
    expect(priced.pricePaidYen).toBe(60_000)

    const unpriced = PartInstanceSchema.parse({
      id: 'pi-2',
      partId: 'khs-street-ecu',
      band: 'mint',
      genuinePeriod: false,
      origin: { kind: 'market', day: 1 },
    })
    expect(unpriced.pricePaidYen).toBeUndefined()
  })
})
