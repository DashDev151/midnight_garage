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

  it('generates lots for every eligible tier, but not collector-network below the rep gate', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.reputationTier).toBe('unknown')
    const { freshLots, lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(freshLots.length).toBeGreaterThan(0)
    expect(lotsByTier.some((t) => t.tier === 'collector-network')).toBe(false)
  })

  it('holds back regional and premium lots below their Sprint 16 reputation gates', () => {
    const state = createInitialGameState(CONTEXT, 1) // reputationTier: 'unknown'
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'regional')).toBe(false)
    expect(lotsByTier.some((t) => t.tier === 'premium')).toBe(false)
    expect(lotsByTier.some((t) => t.tier === 'local-yard')).toBe(true) // always open
  })

  it('regional resumes once reputation reaches local; premium stays gated until known', () => {
    const state = { ...createInitialGameState(CONTEXT, 1), reputationTier: 'local' as const }
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'regional')).toBe(true)
    expect(lotsByTier.some((t) => t.tier === 'premium')).toBe(false)
  })

  it('premium resumes once reputation reaches known', () => {
    const state = { ...createInitialGameState(CONTEXT, 1), reputationTier: 'known' as const }
    const { lotsByTier } = refreshCatalogs(state, CONTEXT, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'premium')).toBe(true)
  })

  it('generates collector-network lots once reputation clears the gate', () => {
    // The seed roster has no 'legend'-tier car yet (see CLAUDE.md's easter
    // egg note), so exercise the gate itself with a synthetic legend model -
    // this guards refreshCatalogs's rep check, not the roster's content.
    const baseModel = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
    if (!baseModel) throw new Error('fixture car missing from seed content')
    const legendModel = { ...baseModel, id: 'test-legend-car', tier: 'legend' as const }
    const context = buildSimContext(
      [...CARS, legendModel],
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      SERVICE_JOB_TYPES,
      FACILITIES,
      SERVICE_JOB_CUSTOMER_NAMES,
    )
    const state = { ...createInitialGameState(context, 1), reputationTier: 'respected' as const }
    const { lotsByTier } = refreshCatalogs(state, context, 1, createRng(1))
    expect(lotsByTier.some((t) => t.tier === 'collector-network')).toBe(true)
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
