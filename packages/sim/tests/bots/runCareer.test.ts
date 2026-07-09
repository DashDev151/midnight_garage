import {
  BUYERS,
  CARS,
  FACILITIES,
  HIDDEN_ISSUES,
  PARTS,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { balancedPlayerStrategy } from '../../src/bots/balancedPlayer'
import { cautiousRestorerStrategy } from '../../src/bots/cautiousRestorer'
import { flipperStrategy } from '../../src/bots/flipper'
import { passiveGrinderStrategy } from '../../src/bots/passiveGrinder'
import { randomStrategy } from '../../src/bots/randomStrategy'
import { serviceGrinderStrategy } from '../../src/bots/serviceGrinder'
import { runCareer, type BotStrategy } from '../../src/bots/runCareer'
import { buildSimContext } from '../../src/context'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  HIDDEN_ISSUES,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

const STRATEGIES: Record<string, BotStrategy> = {
  'passive-grinder': passiveGrinderStrategy,
  flipper: flipperStrategy,
  'cautious-restorer': cautiousRestorerStrategy,
  'balanced-player': balancedPlayerStrategy,
  random: randomStrategy,
  'service-grinder': serviceGrinderStrategy,
}

describe.each(Object.entries(STRATEGIES))('%s strategy', (_name, strategy) => {
  it('runs 100 days without throwing and produces sane output', () => {
    const { snapshots } = runCareer(strategy, 1, 100, CONTEXT)
    expect(snapshots).toHaveLength(100)
    for (const snapshot of snapshots) {
      expect(Number.isFinite(snapshot.cashYen)).toBe(true)
      expect(Number.isFinite(snapshot.netWorthEstimateYen)).toBe(true)
      expect(snapshot.carsOwned).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic for the same seed', () => {
    const a = runCareer(strategy, 5, 60, CONTEXT)
    const b = runCareer(strategy, 5, 60, CONTEXT)
    expect(a).toEqual(b)
  })
})

describe('Passive Grinder', () => {
  it('never buys a car — it has none by day 100', () => {
    const { snapshots } = runCareer(passiveGrinderStrategy, 1, 100, CONTEXT)
    for (const snapshot of snapshots) {
      expect(snapshot.carsOwned).toBe(0)
    }
  })
})

describe('Service Grinder (the Act 1 floor)', () => {
  it('earns from service jobs — out-earns the do-nothing Passive Grinder by day 100', () => {
    const grinder = runCareer(serviceGrinderStrategy, 1, 100, CONTEXT).snapshots
    const passive = runCareer(passiveGrinderStrategy, 1, 100, CONTEXT).snapshots
    // Both start equal and pay the same rent; the difference is job income.
    expect(grinder[99]!.cashYen).toBeGreaterThan(passive[99]!.cashYen)
    // ...and it never owns a car (service work is on cars it doesn't own).
    expect(grinder.every((s) => s.carsOwned === 0)).toBe(true)
  })
})

describe('auction win-price samples (Sprint 10 harness metric)', () => {
  it('every sample lands inside [0, 1] and buckets consistently with its fraction', () => {
    const { auctionWins } = runCareer(flipperStrategy, 1, 100, CONTEXT)
    for (const win of auctionWins) {
      expect(win.fraction).toBeGreaterThanOrEqual(0)
      expect(win.fraction).toBeLessThanOrEqual(1)
      const expectedBucket = win.fraction < 0.2 ? 'steal' : win.fraction > 0.8 ? 'frenzy' : 'mid'
      expect(win.bucket).toBe(expectedBucket)
    }
  })
})
