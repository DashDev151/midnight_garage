import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SCRIPTED_SERVICE_JOB,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  type GameState,
  type ServiceJob,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { ownedWorkupGateReason, resolveOwnedWorkup } from '../src/diagnosis'
import { createInitialGameState } from '../src/newGame'
import {
  buildScriptedServiceJob,
  ensureScriptedServiceJob,
  isScriptedServiceJobUnlockClaimed,
} from '../src/scriptedServiceJob'
import { resolveAcceptServiceJob, resolveServiceJob, toolDeficitSummary } from '../src/serviceJobs'
import { isSellingChannelUnlocked } from '../src/selling'
import { freshToolLevels } from '../src/toolLines'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

/** A fresh day-one career state, same footing every other sim test's
 * `createInitialGameState(CONTEXT, seed)` call uses. */
function freshCareer(seed: number): GameState {
  return createInitialGameState(CONTEXT, seed)
}

/** `freshCareer`, carried to the day the scripted job first appears
 * (`SCRIPTED_SERVICE_JOB.appearsOnDay`, sprint210.md task A1) via the real
 * ensure-function - not a full day simulation (rent/market drift are
 * irrelevant to these tests), the same direct call the describe block below
 * already exercises. Every test past this point that needs the offer
 * actually on the board starts here rather than day one. */
function careerWithJobPosted(seed: number): GameState {
  return ensureScriptedServiceJob(freshCareer(seed), CONTEXT, SCRIPTED_SERVICE_JOB.appearsOnDay)
}

describe('buildScriptedServiceJob', () => {
  it('builds the stand owner’s job on the real Acty, carrying the recipe’s fixed fields', () => {
    const job = buildScriptedServiceJob(CONTEXT, 1, freshCareer(1))
    expect(job.id).toBe(SCRIPTED_SERVICE_JOB.jobId)
    expect(job.car.modelId).toBe('honda-acty-ha4')
    expect(job.customerName).toBe(SCRIPTED_SERVICE_JOB.customerName)
    expect(job.tasks).toEqual(SCRIPTED_SERVICE_JOB.tasks)
    expect(job.baseReputation).toBe(SCRIPTED_SERVICE_JOB.baseReputation)
    expect(job.deadlineDays).toBe(SCRIPTED_SERVICE_JOB.deadlineDays)
    expect(job.unlocksSellingChannel).toBe('freeAdsPaper')
    expect(job.payoutYen).toBeGreaterThan(0)
    expect(job.arrivesOnDay).toBeNull()
    expect(job.dueOnDay).toBeNull()
  })

  it('is fully deterministic - no RNG draws, byte-identical under repeated calls and across career seeds', () => {
    const a = buildScriptedServiceJob(CONTEXT, 5, freshCareer(5))
    const b = buildScriptedServiceJob(CONTEXT, 5, freshCareer(5))
    expect(a).toEqual(b)
  })

  it('expiresOnDay tracks the day it is built for, per the recipe’s own offer lifetime', () => {
    const job = buildScriptedServiceJob(CONTEXT, 12, freshCareer(12))
    expect(job.expiresOnDay).toBe(12 + SCRIPTED_SERVICE_JOB.offerLifetimeDays)
  })
})

describe('ensureScriptedServiceJob (deterministic injection, never twice)', () => {
  it('a fresh career (day 1) has no stand offer - it has not arrived yet', () => {
    const state = freshCareer(1)
    expect(state.serviceJobOffers.some((o) => o.id === SCRIPTED_SERVICE_JOB.jobId)).toBe(false)
  })

  it('stays absent on every day before appearsOnDay, and posts exactly on it (sprint210.md task A1)', () => {
    let state = freshCareer(1)
    for (let day = 1; day < SCRIPTED_SERVICE_JOB.appearsOnDay; day++) {
      state = ensureScriptedServiceJob(state, CONTEXT, day)
      expect(state.serviceJobOffers.some((o) => o.id === SCRIPTED_SERVICE_JOB.jobId)).toBe(false)
    }
    state = ensureScriptedServiceJob(state, CONTEXT, SCRIPTED_SERVICE_JOB.appearsOnDay)
    const scripted = state.serviceJobOffers.filter((o) => o.id === SCRIPTED_SERVICE_JOB.jobId)
    expect(scripted).toHaveLength(1)
    expect(scripted[0]?.customerName).toBe(SCRIPTED_SERVICE_JOB.customerName)
  })

  it('a second call the same day is a no-op - same state reference, no duplicate offer', () => {
    const state = careerWithJobPosted(2)
    const again = ensureScriptedServiceJob(state, CONTEXT, SCRIPTED_SERVICE_JOB.appearsOnDay)
    expect(again).toBe(state)
    expect(again.serviceJobOffers.filter((o) => o.id === SCRIPTED_SERVICE_JOB.jobId)).toHaveLength(
      1,
    )
  })

  it('re-running it across many later days never posts a second copy', () => {
    let state = careerWithJobPosted(3)
    for (
      let day = SCRIPTED_SERVICE_JOB.appearsOnDay + 1;
      day <= SCRIPTED_SERVICE_JOB.appearsOnDay + 30;
      day++
    ) {
      state = ensureScriptedServiceJob(state, CONTEXT, day)
      expect(
        state.serviceJobOffers.filter((o) => o.id === SCRIPTED_SERVICE_JOB.jobId),
      ).toHaveLength(1)
    }
  })

  it('once accepted (moved to activeServiceJobs), it is never re-posted as a fresh offer', () => {
    const state = careerWithJobPosted(4)
    const accepted = resolveAcceptServiceJob(state, SCRIPTED_SERVICE_JOB.jobId, CONTEXT).state
    expect(accepted.activeServiceJobs.some((j) => j.id === SCRIPTED_SERVICE_JOB.jobId)).toBe(true)
    expect(accepted.serviceJobOffers.some((o) => o.id === SCRIPTED_SERVICE_JOB.jobId)).toBe(false)
    const reEnsured = ensureScriptedServiceJob(accepted, CONTEXT, accepted.day + 1)
    expect(reEnsured.serviceJobOffers.some((o) => o.id === SCRIPTED_SERVICE_JOB.jobId)).toBe(false)
    expect(
      reEnsured.activeServiceJobs.filter((j) => j.id === SCRIPTED_SERVICE_JOB.jobId),
    ).toHaveLength(1)
  })

  it('once its unlock is claimed, it never comes back - even absent from both lists', () => {
    const claimed: GameState = {
      ...careerWithJobPosted(5),
      serviceJobOffers: [],
      activeServiceJobs: [],
      serviceJobChannelUnlocks: ['freeAdsPaper'],
    }
    const result = ensureScriptedServiceJob(claimed, CONTEXT, claimed.day + 1)
    expect(result).toBe(claimed)
    expect(result.serviceJobOffers).toHaveLength(0)
  })
})

describe('day-one completability (sprint205.md task B2)', () => {
  it('every task clears a fresh, day-one shop’s tool ceiling with zero deficit', () => {
    const summary = toolDeficitSummary(SCRIPTED_SERVICE_JOB.tasks, freshToolLevels(), CONTEXT)
    expect(summary.maxDeficit).toBe(0)
    expect(summary.deficientGroups).toHaveLength(0)
  })

  it('every task is authored at minToolTier 1 by construction - no rung above the day-one floor', () => {
    for (const task of SCRIPTED_SERVICE_JOB.tasks) {
      expect(task.minToolTier).toBe(1)
    }
  })

  it('a brand-new career can accept, complete and get paid for it with no upgrades at all', () => {
    const state = careerWithJobPosted(6)
    const accepted = resolveAcceptServiceJob(state, SCRIPTED_SERVICE_JOB.jobId, CONTEXT)
    expect(accepted.log).toEqual([
      {
        type: 'service-job-accepted',
        jobId: SCRIPTED_SERVICE_JOB.jobId,
        carInstanceId: SCRIPTED_SERVICE_JOB.carId,
      },
    ])
    const job = accepted.state.activeServiceJobs.find((j) => j.id === SCRIPTED_SERVICE_JOB.jobId)
    expect(job).toBeDefined()

    // Simulate the day-one shop actually doing the two repair tasks: bring
    // both broken slots up to the tasks' own `minBand` - the same "job done"
    // shape `serviceJobs.test.ts` fixtures use directly, rather than
    // replaying the labour system.
    const workedCar: ServiceJob = {
      ...job!,
      arrivesOnDay: null,
      car: {
        ...job!.car,
        parts: {
          ...job!.car.parts,
          ignitionEcu: { installed: { ...job!.car.parts.ignitionEcu.installed!, band: 'fine' } },
          fuelSystem: { installed: { ...job!.car.parts.fuelSystem.installed!, band: 'fine' } },
        },
      },
    }
    const readyState: GameState = {
      ...accepted.state,
      activeServiceJobs: [workedCar],
    }
    const resolution = resolveServiceJob(readyState, SCRIPTED_SERVICE_JOB.jobId, CONTEXT)
    expect(resolution.outcome).toBe('paid')
    expect(resolution.state.cashYen).toBe(readyState.cashYen + workedCar.payoutYen)
  })
})

describe('the unlock: freeAdsPaper is shut before delivery, open after, others unaffected', () => {
  it('is shut on a fresh career, while shopFront is open (tradeNetwork is now Ebisu-claimed, sprint209.md)', () => {
    const state = freshCareer(7)
    expect(isSellingChannelUnlocked(state, CONTEXT, 'freeAdsPaper')).toBe(false)
    expect(isSellingChannelUnlocked(state, CONTEXT, 'shopFront')).toBe(true)
    expect(isSellingChannelUnlocked(state, CONTEXT, 'tradeNetwork')).toBe(false)
    expect(isScriptedServiceJobUnlockClaimed(state)).toBe(false)
  })

  it('opens only once the job is actually PAID, not merely accepted or left unfinished', () => {
    const state = careerWithJobPosted(8)
    const accepted = resolveAcceptServiceJob(state, SCRIPTED_SERVICE_JOB.jobId, CONTEXT).state
    expect(isSellingChannelUnlocked(accepted, CONTEXT, 'freeAdsPaper')).toBe(false)

    const job = accepted.activeServiceJobs.find((j) => j.id === SCRIPTED_SERVICE_JOB.jobId)!
    // Left unfinished: fails, and the channel stays shut.
    const failedState: GameState = {
      ...accepted,
      activeServiceJobs: [{ ...job, arrivesOnDay: null }],
    }
    const failed = resolveServiceJob(failedState, SCRIPTED_SERVICE_JOB.jobId, CONTEXT)
    expect(failed.outcome).toBe('failed')
    expect(isSellingChannelUnlocked(failed.state, CONTEXT, 'freeAdsPaper')).toBe(false)

    // Actually done: pays out, and the channel opens for good.
    const workedCar: ServiceJob = {
      ...job,
      arrivesOnDay: null,
      car: {
        ...job.car,
        parts: {
          ...job.car.parts,
          ignitionEcu: { installed: { ...job.car.parts.ignitionEcu.installed!, band: 'fine' } },
          fuelSystem: { installed: { ...job.car.parts.fuelSystem.installed!, band: 'fine' } },
        },
      },
    }
    const doneState: GameState = { ...accepted, activeServiceJobs: [workedCar] }
    const paid = resolveServiceJob(doneState, SCRIPTED_SERVICE_JOB.jobId, CONTEXT)
    expect(paid.outcome).toBe('paid')
    expect(paid.state.serviceJobChannelUnlocks).toEqual(['freeAdsPaper'])
    expect(isSellingChannelUnlocked(paid.state, CONTEXT, 'freeAdsPaper')).toBe(true)
    // Never closes again, same law as a delivered story mission.
    expect(
      isSellingChannelUnlocked({ ...paid.state, day: 900, cashYen: 0 }, CONTEXT, 'freeAdsPaper'),
    ).toBe(true)
  })
})

describe('the diagnosis beat (sprint210.md task A3)', () => {
  it('the built car carries exactly one unresolved non-starter symptom, true cause flat-battery', () => {
    const job = buildScriptedServiceJob(CONTEXT, SCRIPTED_SERVICE_JOB.appearsOnDay, freshCareer(9))
    expect(job.car.symptoms).toHaveLength(1)
    const symptom = job.car.symptoms[0]!
    expect(symptom.symptomId).toBe('non-starter')
    expect(symptom.trueCauseId).toBe('flat-battery')
    // Fresh, unresolved: every one of the symptom's own causes is still live.
    expect(symptom.remainingCauseIds.length).toBeGreaterThan(1)
    expect(symptom.remainingCauseIds).toContain('flat-battery')
    expect(job.car.apparentBandByPartId).toEqual({ ignitionEcu: 'fine' })
    // The true band the override already set - the fault the player will find.
    expect(job.car.parts.ignitionEcu.installed?.band).toBe('worn')
  })

  it('is workable through the same owned-car diagnosis flow once the job is in the shop - a full workup resolves it', () => {
    const state = careerWithJobPosted(10)
    const accepted = resolveAcceptServiceJob(state, SCRIPTED_SERVICE_JOB.jobId, CONTEXT).state
    const job = accepted.activeServiceJobs.find((j) => j.id === SCRIPTED_SERVICE_JOB.jobId)!
    expect(ownedWorkupGateReason(accepted, job.car.id, CONTEXT)).toBeNull()

    const result = resolveOwnedWorkup(accepted, job.car.id, CONTEXT)
    expect(result.outcome).toBe('done')
    const workedJob = result.state.activeServiceJobs.find(
      (j) => j.id === SCRIPTED_SERVICE_JOB.jobId,
    )!
    expect(workedJob.car.symptoms[0]!.remainingCauseIds).toEqual(['flat-battery'])
  })
})

describe('the unlock copy (sprint210.md task A4)', () => {
  it('threads handbackCopy and unlockFacts from the recipe onto the live job, verbatim', () => {
    const job = buildScriptedServiceJob(CONTEXT, SCRIPTED_SERVICE_JOB.appearsOnDay, freshCareer(11))
    expect(job.handbackCopy).toBe(SCRIPTED_SERVICE_JOB.handbackCopy)
    expect(job.unlockFacts).toEqual(SCRIPTED_SERVICE_JOB.unlockFacts)
  })
})
