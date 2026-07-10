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
   * Sprint 16 finding, investigated and fixed (not just disclosed) rather
   * than papered over: gating equipment by reputation (decision 1) initially
   * created a genuine catch-22 for this archetype, not just a harder economy.
   * Service Grinder only ever works repair-kind service jobs, and content
   * only defines repair-kind types for 5 of 8 components (engine/drivetrain/
   * suspension/body/interior — confirmed by grep, `serviceJobs.json`); its
   * only reputation source is completing one of those. Gating all 5 of their
   * equipment items meant it could never complete a first job to earn the
   * reputation needed to unlock the equipment to complete a first job —
   * verified empirically (0/30 seeds ever bought equipment, cash flat at
   * the exact rent-only floor every time — not rare, permanent). Fixed by
   * leaving `upholstery-bench` (interior) ungated, mirroring exactly how
   * Sprint 13 first discovered and resolved this same class of problem
   * (see TODO.md) — this is that fix's real-content counterpart. A real
   * player who only ever works customer jobs and never buys/sells a car
   * would hit the identical dead end without it.
   *
   * What's left, and genuinely probabilistic, is *when* within a career the
   * bootstrap happens: a repair-interior offer still needs to survive the
   * job-board hint roll (`JOB_HINT_OFFER_CHANCE`) before Service Grinder can
   * see one to accept. Re-sampled across seeds (Sprint 13's own precedent —
   * "Cautious Restorer's day100 result is honestly negative" — is to report
   * a real distribution, not force one seed to look healthy), a clear
   * majority break into the repair economy within 100 days; a single fixed
   * seed is the wrong bar for a mechanic that's deliberately probabilistic.
   */
  const SEED_SAMPLE_SIZE = 30

  it('a clear majority of 100-day careers bootstrap into equipment ownership via the ungated component', () => {
    let successes = 0
    for (let seed = 1; seed <= SEED_SAMPLE_SIZE; seed++) {
      const grinder = runCareer(serviceGrinderStrategy, seed, 100, CONTEXT).snapshots
      if (grinder.some((s) => s.equipmentOwnedCount > 0)) successes++
    }
    expect(successes).toBeGreaterThan(SEED_SAMPLE_SIZE / 2)
  })

  it('a successful career actually gets a job worked and paid, not just equipment bought', () => {
    // Find a seed that bootstraps (the majority do, per the test above) and
    // confirm the payoff is real: cash moves up at least once (a completed,
    // paid job), and it never owns a car (service work is on cars it doesn't own).
    let grinder: ReturnType<typeof runCareer>['snapshots'] | undefined
    for (let seed = 1; seed <= SEED_SAMPLE_SIZE; seed++) {
      const candidate = runCareer(serviceGrinderStrategy, seed, 100, CONTEXT).snapshots
      if (candidate.some((s) => s.equipmentOwnedCount > 0)) {
        grinder = candidate
        break
      }
    }
    if (!grinder) throw new Error('no seed in range bootstrapped — see the majority test above')
    const cashDeltas = grinder.slice(1).map((s, i) => s.cashYen - grinder[i]!.cashYen)
    expect(cashDeltas.some((delta) => delta > 0)).toBe(true)
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

describe('acquisitions telemetry (external review 2026-07 finding 2)', () => {
  it('every strategy that actually bids records at least some real acquisitions, each a valid channel', () => {
    // A bidding-heavy strategy across a full career should win at least one
    // lot by some channel — otherwise the telemetry itself would be silently
    // broken (nothing to measure), not just a low buyout share.
    const { acquisitions } = runCareer(flipperStrategy, 1, 100, CONTEXT)
    expect(acquisitions.length).toBeGreaterThan(0)
    for (const acquisition of acquisitions) {
      expect(['bid', 'buyout']).toContain(acquisition.channel)
      expect(acquisition.day).toBeGreaterThanOrEqual(1)
      expect(acquisition.day).toBeLessThanOrEqual(100)
    }
  })

  it('every bid-channel acquisition is a subset of auctionWins (which also includes losses)', () => {
    // auctionWins tracks every bid outcome (won AND lost); bid-channel
    // acquisitions are only the wins, so it can never exceed auctionWins.
    const { auctionWins, acquisitions } = runCareer(flipperStrategy, 1, 100, CONTEXT)
    const bidAcquisitions = acquisitions.filter((a) => a.channel === 'bid')
    expect(bidAcquisitions.length).toBeLessThanOrEqual(auctionWins.length)
    expect(bidAcquisitions.length).toBeGreaterThan(0)
  })
})
