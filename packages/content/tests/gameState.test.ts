import { describe, expect, it } from 'vitest'
import { DayLogSchema, GameStateSchema } from '../src'

describe('GameState / DayLog round-trip', () => {
  it('a hand-built GameState with one car and one installed part parses unchanged', () => {
    const fixture = {
      day: 1,
      seed: 1995,
      cashYen: 1_200_000,
      reputationTier: 'unknown',
      ownedCars: [
        {
          id: 'car-0001',
          modelId: 'honda-city-e-aa',
          year: 1984,
          mileageKm: 128_000,
          color: 'Sodium Amber',
          provenanceNote: 'one-owner, garage kept, Gunma plates',
          condition: { engine: 55, drivetrain: 60, suspension: 50, body: 40, interior: 45 },
          hiddenIssues: [{ issueId: 'rusted-rails', revealed: false }],
          authenticityPercent: 88,
          buildSheet: {
            engine: {
              id: 'pi-0001',
              partId: 'khs-street-ecu',
              conditionPercent: 80,
              genuinePeriod: false,
            },
            forcedInduction: null,
            drivetrain: null,
            suspension: null,
            brakes: null,
            bodyAero: null,
            wheelsInterior: null,
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
    }

    const parsed = GameStateSchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })

  it('a DayLog with one entry per event type parses unchanged', () => {
    const fixture = [
      { type: 'rent-paid', amountYen: -90_000 },
      { type: 'wage-paid', staffId: 'staff-0001', amountYen: -45_000 },
      { type: 'job-progress', carInstanceId: 'car-0001', slot: 'engine', laborSlotsSpent: 1 },
      { type: 'service-bay-income', amountYen: 15_000 },
      { type: 'market-heat-shift', modelId: 'toyota-supra-rz-jza80', deltaPercent: 12.5 },
    ]

    const parsed = DayLogSchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })
})
