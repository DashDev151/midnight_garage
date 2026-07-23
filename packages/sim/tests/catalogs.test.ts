import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { refreshCatalogs } from '../src/catalogs'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

describe('refreshCatalogs', () => {
  it('is a pure function of state, context, day, and rng', () => {
    const state = createInitialGameState(CONTEXT, 1)
    const a = refreshCatalogs(state, CONTEXT, 1, createRng(9))
    const b = refreshCatalogs(state, CONTEXT, 1, createRng(9))
    expect(a).toEqual(b)
  })

  it('generates lots for every unlocked tier, but not collector-network (no guarantor mission unlocks it yet)', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.reputationTier).toBe('unknown')
    const { freshLots, lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(freshLots.length).toBeGreaterThan(0)
    expect(lotsByTier.some((t) => t.tier === 'collector-network')).toBe(false)
  })

  it('holds back regional and premium lots until their guarantor mission delivers', () => {
    const state = createInitialGameState(CONTEXT, 1) // no story missions delivered
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'regional')).toBe(false)
    expect(lotsByTier.some((t) => t.tier === 'premium')).toBe(false)
    expect(lotsByTier.some((t) => t.tier === 'local-yard')).toBe(true) // always open
  })

  it('reputation ALONE never opens regional/premium/collector-network - only a delivered guarantor mission does', () => {
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      reputationTier: 'respected' as const,
    }
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'regional')).toBe(false)
    expect(lotsByTier.some((t) => t.tier === 'premium')).toBe(false)
    expect(lotsByTier.some((t) => t.tier === 'collector-network')).toBe(false)
  })

  it('regional opens the moment the-fleet-spare is delivered; premium stays locked until the-showroom-standard delivers', () => {
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      storyMissions: [
        { missionId: 'the-fleet-spare', status: 'delivered' as const, acceptedOnDay: 1 },
      ],
    }
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'regional')).toBe(true)
    expect(lotsByTier.some((t) => t.tier === 'premium')).toBe(false)
  })

  it('premium opens the moment the-showroom-standard is delivered', () => {
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      storyMissions: [
        { missionId: 'the-showroom-standard', status: 'delivered' as const, acceptedOnDay: 1 },
      ],
    }
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'premium')).toBe(true)
  })

  it('collector-network stays locked even with every other mission delivered - no guarantor mission unlocks it yet', () => {
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      reputationTier: 'respected' as const,
      storyMissions: [
        { missionId: 'the-fleet-spare', status: 'delivered' as const, acceptedOnDay: 1 },
        { missionId: 'the-showroom-standard', status: 'delivered' as const, acceptedOnDay: 1 },
      ],
    }
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'collector-network')).toBe(false)
  })

  // Service-job offers don't refresh here (see `refreshCatalogs`'s own doc
  // comment) - they're on a daily cadence, `generateDailyServiceJobOffers`
  // in serviceJobs.ts, with its own dedicated tests (distribution shape,
  // tier gating, equipment filtering) in
  // `serviceJobPayout.test.ts`/`serviceJobs.test.ts`.

  it('never generates a car older than the calendar allows for the current reputation tier', () => {
    // Every model's yearFrom already predates 1995 in the seed content, so at
    // 'unknown' (year 1995) the clamp can't be observed directly here - this
    // guards the wiring itself: no lot's car year ever exceeds the state's
    // currentGameYear.
    const state = createInitialGameState(CONTEXT, 1)
    const { freshLots } = refreshCatalogs(state, CONTEXT, 1, createRng(3))
    for (const lot of freshLots) {
      expect(lot.car.year).toBeLessThanOrEqual(1995)
    }
  })
})
