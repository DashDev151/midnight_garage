import { describe, expect, it } from 'vitest'
import { DayLogSchema, GameStateSchema } from '../src'

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
            block: { band: 'fine', installed: null, fitted: true },
            internals: { band: 'fine', installed: null, fitted: true },
            headValvetrain: { band: 'worn', installed: null, fitted: true },
            camsTiming: { band: 'fine', installed: null, fitted: true },
            intake: { band: 'fine', installed: null, fitted: true },
            exhaust: { band: 'worn', installed: null, fitted: true },
            fuelSystem: { band: 'fine', installed: null, fitted: true },
            ignitionEcu: {
              band: 'mint',
              installed: {
                id: 'pi-0001',
                partId: 'khs-street-ecu',
                band: 'fine',
                genuinePeriod: false,
              },
              fitted: true,
            },
            cooling: { band: 'worn', installed: null, fitted: true },
            forcedInduction: { band: 'mint', installed: null, fitted: false },
            gearbox: { band: 'worn', installed: null, fitted: true },
            clutch: { band: 'worn', installed: null, fitted: true },
            differential: { band: 'fine', installed: null, fitted: true },
            driveline: { band: 'fine', installed: null, fitted: true },
            chassis: { band: 'fine', installed: null, fitted: true },
            dampers: { band: 'poor', installed: null, fitted: true },
            springs: { band: 'poor', installed: null, fitted: true },
            antiRollBars: { band: 'worn', installed: null, fitted: true },
            steering: { band: 'worn', installed: null, fitted: true },
            brakePadsDiscs: { band: 'mint', installed: null, fitted: true },
            brakeCalipersLines: { band: 'mint', installed: null, fitted: true },
            rims: { band: 'mint', installed: null, fitted: true },
            tyres: { band: 'mint', installed: null, fitted: true },
            panels: { band: 'poor', installed: null, fitted: true },
            paint: { band: 'poor', installed: null, fitted: true },
            underbody: { band: 'worn', installed: null, fitted: true },
            aero: { band: 'mint', installed: null, fitted: true },
            seats: { band: 'worn', installed: null, fitted: true },
            dashGauges: { band: 'worn', installed: null, fitted: true },
          },
        },
      ],
      partInventory: [
        {
          id: 'pi-0002',
          partId: 'tanuki-street-coilovers',
          band: 'mint',
          genuinePeriod: false,
        },
      ],
      staff: [],
      jobs: [],
      marketHeat: {},
      activeAuctionLots: [],
      activeListings: [
        {
          id: 'listing-1-car-0002',
          carInstanceId: 'car-0002',
          modelId: 'honda-city-e-aa',
          askingPriceYen: 500_000,
          resolvesOnDay: 6,
          reputationDeltaOnSale: -5,
        },
      ],
      serviceJobOffers: [],
      activeServiceJobs: [],
      serviceBayCount: 1,
      parkingBayCount: 3,
      serviceBayCarIds: ['car-0001'],
      parkingCarIds: [null, null, null],
      laborSlotsSpentToday: 0,
      ownedEquipmentIds: [],
      pendingPartOrders: [],
      cartPartIds: [],
      stagedCarWork: {},
      marketLedger: { lotSupply: {}, playerSales: {} },
    }

    const parsed = GameStateSchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })

  it('a DayLog with one entry per event type parses unchanged', () => {
    const fixture = [
      { type: 'rent-paid', amountYen: -90_000 },
      { type: 'wage-paid', staffId: 'staff-0001', amountYen: -45_000 },
      { type: 'job-created', jobId: 'job-0001', carInstanceId: 'car-0001', kind: 'repair-zone' },
      { type: 'job-progress', jobId: 'job-0001', laborSlotsSpent: 1 },
      { type: 'job-completed', jobId: 'job-0001', carInstanceId: 'car-0001', kind: 'repair-zone' },
      { type: 'job-blocked', jobId: 'job-0002', reason: 'slot-occupied' },
      { type: 'labor-overbooked', requestedSlots: 5, availableSlots: 2 },
      { type: 'service-bay-income', amountYen: 15_000 },
      { type: 'market-heat-shift', modelId: 'toyota-supra-rz-jza80', deltaPercent: 12.5 },
      { type: 'auction-catalog-refreshed', tier: 'local-yard', lotCount: 3 },
      { type: 'auction-bid-won', lotId: 'lot-0001', finalPriceYen: 150_000 },
      { type: 'auction-bid-lost', lotId: 'lot-0002', winningPriceYen: 200_000 },
      { type: 'lot-bought-out', lotId: 'lot-0003', priceYen: 240_000 },
      {
        type: 'service-job-completed',
        jobId: 'svc-0001',
        payoutYen: 42_000,
        reputationGained: 4,
      },
      {
        type: 'listing-created',
        listingId: 'listing-0001',
        carInstanceId: 'car-0001',
        askingPriceYen: 300_000,
        resolvesOnDay: 10,
      },
      {
        type: 'car-sold',
        carInstanceId: 'car-0001',
        channel: 'walk-in-offer',
        priceYen: 280_000,
        reputationDelta: 3,
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
      { type: 'car-moved', carInstanceId: 'car-0001', to: 'service' },
      { type: 'cars-swapped', serviceCarId: 'car-0001', parkingCarId: 'car-0002' },
      { type: 'bay-purchased', kind: 'service', priceYen: 300_000 },
      { type: 'acquisition-blocked', kind: 'buyout', reason: 'no-parking' },
    ]

    const parsed = DayLogSchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })
})
