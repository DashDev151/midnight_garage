import type { DayActions } from '../src/actions'
import type { GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { advanceDay } from '../src/advanceDay'
import { hashState } from '../src/hashState'

const POC_10_MODEL_IDS = [
  'honda-city-e-aa',
  'suzuki-wagon-r-ct21s',
  'honda-civic-sir2-eg6',
  'toyota-sprinter-trueno-ae86',
  'nissan-180sx-rps13',
  'toyota-chaser-tourer-v-jzx90',
  'nissan-silvia-ks-s14',
  'mazda-savanna-rx7-fc3s',
  'mazda-rx7-fd3s',
  'toyota-supra-rz-jza80',
]

function initialState(): GameState {
  return {
    day: 1,
    seed: 42,
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
          engine: null,
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
        id: 'pi-0001',
        partId: 'tanuki-street-coilovers',
        conditionPercent: 100,
        genuinePeriod: false,
      },
    ],
    staff: [],
    jobs: [],
    marketHeat: Object.fromEntries(POC_10_MODEL_IDS.map((id) => [id, 100])),
  }
}

const noActions: DayActions = { createJobs: [], laborAssignments: [] }

/**
 * Scripted 30-day career: day 1 opens a repair-zone job (body, 3 slots)
 * and works it to completion, then opens an install-part job for the
 * spare coilovers and completes it; the remaining days pass idle so
 * weekly rent (days 7/14/21/28) and market-heat drift exercise on
 * schedule. Seed 42 per the roadmap's own golden-master example.
 */
function scriptedActionsForDay(day: number): DayActions {
  if (day === 1) {
    return {
      createJobs: [
        { carInstanceId: 'car-0001', kind: 'repair-zone', zone: 'body', laborSlotsRequired: 3 },
      ],
      laborAssignments: [{ jobId: 'job-1-0', laborSlots: 2 }],
    }
  }
  if (day === 2) {
    return { createJobs: [], laborAssignments: [{ jobId: 'job-1-0', laborSlots: 1 }] }
  }
  if (day === 3) {
    return {
      createJobs: [
        {
          carInstanceId: 'car-0001',
          kind: 'install-part',
          slot: 'suspension',
          partInstanceId: 'pi-0001',
          laborSlotsRequired: 1,
        },
      ],
      laborAssignments: [{ jobId: 'job-3-0', laborSlots: 1 }],
    }
  }
  return noActions
}

function runCareer(days: number): GameState {
  let state = initialState()
  for (let day = 1; day <= days; day++) {
    const actions = scriptedActionsForDay(day)
    const result = advanceDay(state, actions, state.seed + state.day)
    state = result.state
  }
  return state
}

describe('advanceDay golden master', () => {
  it('a scripted 30-day career reproduces an exact state hash', () => {
    const finalState = runCareer(30)
    expect(finalState.day).toBe(31)
    expect(hashState(finalState)).toBe('0349eea8')
  })

  it('the same 30-day script from the same seed is fully deterministic', () => {
    const a = hashState(runCareer(30))
    const b = hashState(runCareer(30))
    expect(a).toBe(b)
  })

  it('the repair-zone job completes and restores the body zone', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.condition.body).toBe(100)
  })

  it('the install-part job moves the spare coilovers into the build sheet', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.buildSheet.suspension?.partId).toBe('tanuki-street-coilovers')
    expect(finalState.partInventory).toHaveLength(0)
  })

  it('rent is deducted on every 7-day boundary through day 30', () => {
    const finalState = runCareer(30)
    const rentPayments = 4 // days 7, 14, 21, 28
    expect(finalState.cashYen).toBe(1_200_000 - rentPayments * 90_000)
  })
})
