import {
  BUYERS,
  CARS,
  FACILITIES,
  HIDDEN_ISSUES,
  PARTS,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  type CarInstance,
  type ComponentId,
  type GameState,
  type Job,
  type PartInstance,
  type ServiceJob,
  type ServiceJobType,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { generateAuctionCarInstance } from '../src/auctions'
import { SERVICE_JOB_DEADLINE_DAYS } from '../src/constants'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import {
  generateServiceJobOffers,
  isServiceWorkDone,
  reputationForCompletion,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveServiceJob,
} from '../src/serviceJobs'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  HIDDEN_ISSUES,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

const repairType = SERVICE_JOB_TYPES.find((t) => t.work.kind === 'repair')!
const installType = SERVICE_JOB_TYPES.find(
  (t) => t.work.kind === 'install' && t.work.componentId === 'brakes',
)!

/** An active (accepted) service job carrying a real car, ready to resolve. */
function activeJob(type: ServiceJobType, carOverrides: Partial<CarInstance> = {}): ServiceJob {
  const car = generateAuctionCarInstance(
    CARS[0]!,
    CONTEXT.hiddenIssuesByComponent,
    `svc-car-${type.id}`,
    createRng(42),
  )
  return {
    id: `svc-${type.id}`,
    typeId: type.id,
    customerName: SERVICE_JOB_CUSTOMER_NAMES[0]!,
    description: type.flavorPool[0]!,
    work: type.work,
    car: { ...car, ...carOverrides },
    payoutYen: type.payoutRangeYen[0],
    baseReputation: type.baseReputation,
    expiresOnDay: 30,
    dueOnDay: 8,
  }
}

function emptyComponents(): CarInstance['components'] {
  return {
    engine: { condition: 100, installed: null },
    forcedInduction: { condition: 100, installed: null },
    drivetrain: { condition: 100, installed: null },
    suspension: { condition: 100, installed: null },
    brakes: { condition: 100, installed: null },
    wheels: { condition: 100, installed: null },
    body: { condition: 100, installed: null },
    interior: { condition: 100, installed: null },
  }
}

/** All components stock/full except the given one, at `value`. */
function makeComponents(componentId: ComponentId, value: number): CarInstance['components'] {
  return { ...emptyComponents(), [componentId]: { condition: value, installed: null } }
}

const repairComponent = repairType.work.componentId
const installComponent = installType.work.componentId

function partInstance(partId: string): PartInstance {
  return { id: `pi-${partId}`, partId, conditionPercent: 100, genuinePeriod: false }
}

function stateWith(job: ServiceJob, overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), activeServiceJobs: [job], ...overrides }
}

describe('generateServiceJobOffers', () => {
  it('offers the requested count with unique ids, a real car, no deadline yet', () => {
    const offers = generateServiceJobOffers(
      SERVICE_JOB_TYPES,
      SERVICE_JOB_CUSTOMER_NAMES,
      CARS,
      CONTEXT.hiddenIssuesByComponent,
      7,
      4,
      10,
      createRng(1),
    )
    expect(offers).toHaveLength(4)
    expect(new Set(offers.map((o) => o.id)).size).toBe(4)
    expect(offers.every((o) => o.expiresOnDay === 17)).toBe(true)
    expect(offers.every((o) => o.dueOnDay === null)).toBe(true) // deadline is stamped on accept
    expect(offers.every((o) => o.car.id.length > 0)).toBe(true)
  })

  it('every offer composes a real type + flavor line + customer name (Sprint 11 pool model)', () => {
    const offers = generateServiceJobOffers(
      SERVICE_JOB_TYPES,
      SERVICE_JOB_CUSTOMER_NAMES,
      CARS,
      CONTEXT.hiddenIssuesByComponent,
      7,
      20,
      10,
      createRng(2),
    )
    for (const offer of offers) {
      const type = SERVICE_JOB_TYPES.find((t) => t.id === offer.typeId)
      expect(type).toBeDefined()
      expect(type!.flavorPool).toContain(offer.description)
      expect(SERVICE_JOB_CUSTOMER_NAMES).toContain(offer.customerName)
      expect(offer.payoutYen).toBeGreaterThanOrEqual(type!.payoutRangeYen[0])
      expect(offer.payoutYen).toBeLessThanOrEqual(type!.payoutRangeYen[1])
    }
  })

  it('returns nothing with no types, names, or models', () => {
    expect(
      generateServiceJobOffers(
        [],
        SERVICE_JOB_CUSTOMER_NAMES,
        CARS,
        CONTEXT.hiddenIssuesByComponent,
        7,
        4,
        10,
        createRng(1),
      ),
    ).toEqual([])
    expect(
      generateServiceJobOffers(
        SERVICE_JOB_TYPES,
        [],
        CARS,
        CONTEXT.hiddenIssuesByComponent,
        7,
        4,
        10,
        createRng(1),
      ),
    ).toEqual([])
    expect(
      generateServiceJobOffers(
        SERVICE_JOB_TYPES,
        SERVICE_JOB_CUSTOMER_NAMES,
        [],
        CONTEXT.hiddenIssuesByComponent,
        7,
        4,
        10,
        createRng(1),
      ),
    ).toEqual([])
  })
})

describe('reputation helpers', () => {
  it('a pricier grade earns more reputation on completion', () => {
    expect(reputationForCompletion(3, null)).toBe(3)
    expect(reputationForCompletion(3, 'sport')).toBeGreaterThan(reputationForCompletion(3, 'stock'))
    expect(reputationForCompletion(3, 'race')).toBeGreaterThan(reputationForCompletion(3, 'sport'))
  })

  it('failure costs reputation, scaled by the job base', () => {
    expect(reputationForFailure(3)).toBeGreaterThan(0)
    expect(reputationForFailure(3)).toBeGreaterThan(reputationForFailure(1))
  })
})

describe('resolveServiceJob (the single resolution path)', () => {
  it('pays out + grants reputation when the work is done, and the car leaves', () => {
    const job = activeJob(repairType, { components: makeComponents(repairComponent, 100) })
    const leftover: Job = {
      id: 'job-x',
      carInstanceId: job.car.id,
      kind: 'repair-zone',
      componentId: repairComponent,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const state = stateWith(job, { jobs: [leftover] })
    const cashBefore = state.cashYen

    const { state: next, outcome, log } = resolveServiceJob(state, job.id, CONTEXT)
    expect(outcome).toBe('paid')
    expect(next.cashYen).toBe(cashBefore + job.payoutYen)
    expect(next.reputationPoints).toBe(job.baseReputation)
    expect(next.activeServiceJobs).toHaveLength(0)
    expect(next.ownedCars).toHaveLength(0) // never owned
    expect(next.jobs).toHaveLength(0) // leftover jobs on the departed car dropped
    expect(log[0]).toMatchObject({ type: 'service-job-completed', payoutYen: job.payoutYen })
  })

  it('fails (no pay, reputation penalty) when the work is not done', () => {
    const job = activeJob(repairType, { components: makeComponents(repairComponent, 40) })
    const state = stateWith(job, { reputationPoints: 50 })
    const cashBefore = state.cashYen

    const { state: next, outcome, log } = resolveServiceJob(state, job.id, CONTEXT)
    expect(outcome).toBe('failed')
    expect(next.cashYen).toBe(cashBefore) // no pay
    expect(next.reputationPoints).toBe(50 - reputationForFailure(job.baseReputation))
    expect(next.activeServiceJobs).toHaveLength(0) // car still leaves
    expect(log[0]).toMatchObject({ type: 'service-job-failed' })
  })

  it('clamps the reputation penalty at zero', () => {
    const job = activeJob(repairType, { components: makeComponents(repairComponent, 40) })
    const state = stateWith(job) // reputationPoints starts at 0
    const { state: next } = resolveServiceJob(state, job.id, CONTEXT)
    expect(next.reputationPoints).toBe(0)
  })

  it('is a no-op for an unknown job id', () => {
    const job = activeJob(repairType)
    const state = stateWith(job)
    const { state: next, outcome } = resolveServiceJob(state, 'nope', CONTEXT)
    expect(outcome).toBe('not-found')
    expect(next).toBe(state)
  })

  it('an install job pays; a pricier installed grade earns more reputation', () => {
    const budget = PARTS.find((p) => p.componentId === installComponent && p.grade === 'stock')!
    const pricey = PARTS.find((p) => p.componentId === installComponent && p.grade !== 'stock')!

    function repWith(part: (typeof PARTS)[number]): number {
      const job = activeJob(installType, {
        components: {
          ...emptyComponents(),
          [installComponent]: { condition: 100, installed: partInstance(part.id) },
        },
      })
      return resolveServiceJob(stateWith(job), job.id, CONTEXT).state.reputationPoints
    }

    expect(repWith(pricey)).toBeGreaterThan(repWith(budget))
  })

  /**
   * Sprint 12: the old `install-wheels-interior` type (one mixed-theme
   * flavor pool covering both wheels and interior parts) was split into
   * separate `install-wheels`/`install-interior` types once wheels and
   * interior became real, distinct components. The "install job pays" test
   * above only exercises `brakes` (a pre-existing install type) — this
   * covers every install type in the real catalog, including the two new
   * ones, so a broken split (e.g. componentId pointing at the wrong
   * component, or a missing content entry) fails here instead of silently
   * passing type-checks and schema validation alone.
   */
  it('every install job type in the real catalog resolves work-done correctly for its own component', () => {
    const installTypes = SERVICE_JOB_TYPES.filter((t) => t.work.kind === 'install')
    expect(installTypes.some((t) => t.work.componentId === 'wheels')).toBe(true)
    expect(installTypes.some((t) => t.work.componentId === 'interior')).toBe(true)

    for (const type of installTypes) {
      const componentId = type.work.componentId
      const part = PARTS.find((p) => p.componentId === componentId)
      if (!part) throw new Error(`no catalog part fits component "${componentId}"`)

      const unfinished = activeJob(type)
      expect(isServiceWorkDone(unfinished)).toBe(false)

      const finished = activeJob(type, {
        components: {
          ...emptyComponents(),
          [componentId]: { condition: 100, installed: partInstance(part.id) },
        },
      })
      expect(isServiceWorkDone(finished)).toBe(true)

      const { outcome } = resolveServiceJob(stateWith(finished), finished.id, CONTEXT)
      expect(outcome).toBe('paid')
    }
  })
})

describe('resolveAcceptServiceJob (Sprint 11 instant resolver)', () => {
  it('moves the offer into activeServiceJobs and stamps the deadline instantly', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const state = { ...createInitialGameState(CONTEXT, 1), serviceJobOffers: [offer] }
    const result = resolveAcceptServiceJob(state, offer.id)
    expect(result.state.serviceJobOffers).toHaveLength(0)
    expect(result.state.activeServiceJobs).toHaveLength(1)
    expect(result.state.activeServiceJobs[0]!.dueOnDay).toBe(state.day + SERVICE_JOB_DEADLINE_DAYS)
    expect(result.log).toEqual([
      { type: 'service-job-accepted', jobId: offer.id, carInstanceId: offer.car.id },
    ])
  })

  it('is a no-op for an unknown offer id', () => {
    const state = createInitialGameState(CONTEXT, 1)
    const result = resolveAcceptServiceJob(state, 'no-such-offer')
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('leaves the offer on the board (no state change) when parking is full', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      parkingBayCount: 0,
    }
    const result = resolveAcceptServiceJob(state, offer.id)
    expect(result.state.serviceJobOffers).toHaveLength(1)
    expect(result.state.activeServiceJobs).toHaveLength(0)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-parking' },
    ])
  })
})

describe('service jobs in advanceDay', () => {
  it('accepting brings the car into the shop and stamps the deadline', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const state = { ...createInitialGameState(CONTEXT, 1), serviceJobOffers: [offer] }
    const actions = DayActionsSchema.parse({ acceptServiceJobs: [{ offerId: offer.id }] })
    const { state: next } = advanceDay(state, actions, 1, CONTEXT)

    expect(next.activeServiceJobs).toHaveLength(1)
    expect(next.activeServiceJobs[0]!.dueOnDay).toBe(1 + SERVICE_JOB_DEADLINE_DAYS)
    expect(next.ownedCars).toHaveLength(0)
  })

  it('the deadline backstop pays a finished job and fails an unfinished one', () => {
    const done = activeJob(repairType, { components: makeComponents(repairComponent, 100) })
    const paidState = { ...createInitialGameState(CONTEXT, 1), day: 8, activeServiceJobs: [done] }
    const paidBefore = paidState.cashYen
    const paid = advanceDay(paidState, DayActionsSchema.parse({}), 8, CONTEXT).state
    expect(paid.cashYen).toBe(paidBefore + done.payoutYen)
    expect(paid.activeServiceJobs).toHaveLength(0)

    const undone = activeJob(repairType, { components: makeComponents(repairComponent, 40) })
    const failState = {
      ...createInitialGameState(CONTEXT, 1),
      day: 8,
      reputationPoints: 50,
      activeServiceJobs: [undone],
    }
    const failBefore = failState.cashYen
    const failed = advanceDay(failState, DayActionsSchema.parse({}), 8, CONTEXT).state
    expect(failed.cashYen).toBe(failBefore) // no pay
    expect(failed.reputationPoints).toBe(50 - reputationForFailure(undone.baseReputation))
    expect(failed.activeServiceJobs).toHaveLength(0)
  })

  it('stale offers expire', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null, expiresOnDay: 1 }
    const state = { ...createInitialGameState(CONTEXT, 1), day: 1, serviceJobOffers: [offer] }
    const { state: next } = advanceDay(state, DayActionsSchema.parse({}), 1, CONTEXT)
    expect(next.serviceJobOffers).toHaveLength(0)
  })
})
