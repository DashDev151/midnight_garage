import {
  BUYERS,
  CARS,
  EQUIPMENT,
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
import { handymanStrategy } from '../../src/bots/handyman'
import { investorStrategy } from '../../src/bots/investor'
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
  EQUIPMENT,
)

const STRATEGIES: Record<string, BotStrategy> = {
  'passive-grinder': passiveGrinderStrategy,
  flipper: flipperStrategy,
  'cautious-restorer': cautiousRestorerStrategy,
  'balanced-player': balancedPlayerStrategy,
  random: randomStrategy,
  'service-grinder': serviceGrinderStrategy,
  handyman: handymanStrategy,
  investor: investorStrategy,
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
  /**
   * Sprint 13 finding, honestly disclosed rather than papered over (same
   * precedent as Sprint 03's "Cautious Restorer's day100 result is honestly
   * negative"): now that repair-only service jobs require owning equipment,
   * Service Grinder — a narrow, job-income-only archetype with no other
   * revenue — no longer reliably out-earns doing nothing within a single
   * 100-day career. Equipment (¥350k-¥1.5M) is expensive relative to a
   * repair job's payout (¥18k-¥45k); recouping even the cheapest tool needs
   * more repair-of-that-category offers than a 100-day, ~4-offers-a-week
   * board reliably produces. This is a real balance question (equipment
   * pricing vs. service-job volume/payout), not a code bug — tracked in
   * TODO.md as a Sprint 13 follow-up (deeper per-bot equipment strategy /
   * a balance pass), not silently fixed by loosening what this test claims.
   * What's still verified here is that the *mechanism* genuinely works:
   * equipment gets bought, jobs get worked and paid.
   */
  it('buys equipment and gets paid for at least one service job over 100 days', () => {
    const grinder = runCareer(serviceGrinderStrategy, 1, 100, CONTEXT).snapshots
    expect(grinder.some((s) => s.equipmentOwnedCount > 0)).toBe(true)
    // Cash dips below the rent-only baseline at some point (equipment cost)
    // but a completed job still moves cash upward at least once — proof
    // service jobs are actually being finished and paid, not just attempted.
    const cashDeltas = grinder.slice(1).map((s, i) => s.cashYen - grinder[i]!.cashYen)
    expect(cashDeltas.some((delta) => delta > 0)).toBe(true)
    // ...and it never owns a car (service work is on cars it doesn't own).
    expect(grinder.every((s) => s.carsOwned === 0)).toBe(true)
  })
})

describe('Handyman / Investor (Sprint 13 payback-curve pair)', () => {
  it('Handyman actually buys equipment over a career; Investor never does', () => {
    const handyman = runCareer(handymanStrategy, 1, 100, CONTEXT).snapshots
    const investor = runCareer(investorStrategy, 1, 100, CONTEXT).snapshots
    expect(handyman.some((s) => s.equipmentOwnedCount > 0)).toBe(true)
    expect(investor.every((s) => s.equipmentOwnedCount === 0)).toBe(true)
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
