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
          hiddenIssues: [{ issueId: 'rusted-rails', revealed: false }],
          authenticityPercent: 88,
          components: {
            engine: {
              condition: 55,
              installed: {
                id: 'pi-0001',
                partId: 'khs-street-ecu',
                conditionPercent: 80,
                genuinePeriod: false,
              },
            },
            forcedInduction: { condition: 100, installed: null },
            drivetrain: { condition: 60, installed: null },
            suspension: { condition: 50, installed: null },
            brakes: { condition: 100, installed: null },
            wheels: { condition: 100, installed: null },
            body: { condition: 40, installed: null },
            interior: { condition: 45, installed: null },
          },
        },
      ],
      partInventory: [
        {
          id: 'pi-0002',
          partId: 'tanuki-street-coilovers',
          conditionPercent: 100,
          genuinePeriod: false,
        },
      ],
      staff: [],
      jobs: [],
      marketHeat: {},
      activeAuctionLots: [],
      activeListings: [],
      serviceJobOffers: [],
      activeServiceJobs: [],
      serviceBayCount: 1,
      parkingBayCount: 3,
      serviceBayCarIds: ['car-0001'],
      laborSlotsSpentToday: 0,
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
      { type: 'lot-inspected', lotId: 'lot-0001' },
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
      { type: 'car-sold', carInstanceId: 'car-0001', channel: 'walk-in-offer', priceYen: 280_000 },
      {
        type: 'part-bought',
        partId: 'khs-street-ecu',
        partInstanceId: 'part-7-0',
        priceYen: 60_000,
      },
      { type: 'car-moved', carInstanceId: 'car-0001', to: 'service' },
      { type: 'cars-swapped', serviceCarId: 'car-0001', parkingCarId: 'car-0002' },
      { type: 'bay-purchased', kind: 'service', priceYen: 300_000 },
      { type: 'acquisition-blocked', kind: 'buyout', reason: 'no-parking' },
    ]

    const parsed = DayLogSchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })
})
