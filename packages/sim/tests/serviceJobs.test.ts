import {
  BUYERS,
  CARS,
  EQUIPMENT,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  type CarInstance,
  type ComponentId,
  type GameState,
  type Job,
  type Part,
  type PartInstance,
  type ServiceJob,
  type ServiceJobType,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { generateAuctionCarInstance } from '../src/auctions'
import { SERVICE_JOB_ARRIVAL_DELAY_DAYS, SERVICE_JOB_DEADLINE_DAYS } from '../src/constants'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import {
  generateServiceJobOffers,
  isServiceJobInTransit,
  isServiceWorkDone,
  reputationForCompletion,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveServiceJob,
  resolveServiceJobArrivals,
} from '../src/serviceJobs'
import { groupCarParts, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  EQUIPMENT,
)

const repairType = SERVICE_JOB_TYPES.find((t) => t.work.kind === 'repair')!
const installType = SERVICE_JOB_TYPES.find(
  (t) => t.work.kind === 'install' && t.work.componentId === 'suspension',
)!
/** The equipment covering repairType's component - owned by default in accept tests below
 * so they exercise their own intended gate (parking, unknown offer) rather than the new
 * Sprint 13 equipment gate, which has its own dedicated tests. */
const REPAIR_EQUIPMENT = EQUIPMENT.find((e) =>
  e.componentIds.includes(repairType.work.componentId),
)!

/** An active (accepted) service job carrying a real car, ready to resolve. */
function activeJob(type: ServiceJobType, carOverrides: Partial<CarInstance> = {}): ServiceJob {
  const car = generateAuctionCarInstance(
    CARS[0]!,
    `svc-car-${type.id}`,
    createRng(42),
    CONTEXT.economy,
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
    arrivesOnDay: null, // an already-arrived, workable job by default in these fixtures
    dueOnDay: 8,
  }
}

const repairComponent = repairType.work.componentId
const installComponent = installType.work.componentId

function partInstance(partId: string): PartInstance {
  return { id: `pi-${partId}`, partId, band: 'mint', genuinePeriod: false }
}

/** A catalog part belonging to `groupId`, for tests that need a real,
 * fitting part to install. */
function partInGroup(groupId: ComponentId, predicate: (p: Part) => boolean = () => true): Part {
  const part = PARTS.find(
    (p) => CONTEXT.partsTaxonomyById[p.carPartId]?.group === groupId && predicate(p),
  )
  if (!part) throw new Error(`no catalog part fits group "${groupId}"`)
  return part
}

function stateWith(job: ServiceJob, overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), activeServiceJobs: [job], ...overrides }
}

describe('generateServiceJobOffers', () => {
  it('offers the requested count with unique ids, a real car, no deadline yet', () => {
    const result = generateServiceJobOffers(
      SERVICE_JOB_TYPES,
      SERVICE_JOB_CUSTOMER_NAMES,
      CARS,
      CONTEXT.economy,
      7,
      4,
      10,
      createRng(1),
    )
    expect(result).toHaveLength(4)
    expect(new Set(result.map((o) => o.id)).size).toBe(4)
    expect(result.every((o) => o.expiresOnDay === 17)).toBe(true)
    expect(result.every((o) => o.dueOnDay === null)).toBe(true) // deadline is stamped on accept
    expect(result.every((o) => o.car.id.length > 0)).toBe(true)
  })

  it('every offer composes a real type + flavor line + customer name (Sprint 11 pool model)', () => {
    const result = generateServiceJobOffers(
      SERVICE_JOB_TYPES,
      SERVICE_JOB_CUSTOMER_NAMES,
      CARS,
      CONTEXT.economy,
      7,
      20,
      10,
      createRng(2),
    )
    for (const offer of result) {
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
        CONTEXT.economy,
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
        CONTEXT.economy,
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
        CONTEXT.economy,
        7,
        4,
        10,
        createRng(1),
      ),
    ).toEqual([])
  })
})

describe('job-board equipment hinting (Sprint 16 decision 4)', () => {
  it('mostly filters a repair-kind type whose equipment is not owned, but not to zero', () => {
    const rng = createRng(7)
    let repairOffers = 0
    let totalOffers = 0
    for (let week = 0; week < 100; week++) {
      const result = generateServiceJobOffers(
        SERVICE_JOB_TYPES,
        SERVICE_JOB_CUSTOMER_NAMES,
        CARS,
        CONTEXT.economy,
        week * 7,
        4,
        10,
        rng,
        Infinity,
        [], // nothing owned - every repair-kind candidate is filtered/hinted
        CONTEXT.equipmentById,
      )
      totalOffers += result.length
      repairOffers += result.filter((o) => o.work.kind === 'repair').length
    }
    // Statistical, not exact - matching how every other probabilistic sim
    // mechanic in this codebase is tested. "Mostly filtered, rarely not":
    // real share should land well under an even (types-weighted) split, but
    // still clearly nonzero across a large sample.
    const repairShare = repairOffers / totalOffers
    expect(repairShare).toBeGreaterThan(0)
    expect(repairShare).toBeLessThan(0.2)
  })

  it('never filters a repair-kind type whose equipment is already owned', () => {
    const rng = createRng(7)
    const ownedIds = EQUIPMENT.map((e) => e.id) // everything owned
    let sawRepairOfEquippedComponent = false
    for (let week = 0; week < 40 && !sawRepairOfEquippedComponent; week++) {
      const result = generateServiceJobOffers(
        SERVICE_JOB_TYPES,
        SERVICE_JOB_CUSTOMER_NAMES,
        CARS,
        CONTEXT.economy,
        week * 7,
        4,
        10,
        rng,
        Infinity,
        ownedIds,
        CONTEXT.equipmentById,
      )
      if (result.some((o) => o.work.kind === 'repair')) sawRepairOfEquippedComponent = true
    }
    // With everything owned, no candidate is ever a "needs unowned equipment"
    // case, so repair types appear at their normal, unfiltered rate.
    expect(sawRepairOfEquippedComponent).toBe(true)
  })

  it('install-kind types are never filtered by the hinting policy, owned or not', () => {
    const rng = createRng(3)
    const result = generateServiceJobOffers(
      SERVICE_JOB_TYPES,
      SERVICE_JOB_CUSTOMER_NAMES,
      CARS,
      CONTEXT.economy,
      7,
      200,
      10,
      rng,
      Infinity,
      [],
      CONTEXT.equipmentById,
    )
    const installTypeCount = SERVICE_JOB_TYPES.filter((t) => t.work.kind === 'install').length
    expect(result.filter((o) => o.work.kind === 'install').length).toBeGreaterThan(
      installTypeCount, // sanity: install offers show up plenty across 200 rolls
    )
  })

  it('defaults to nothing owned when the new params are omitted (existing call sites unaffected)', () => {
    const withDefaults = generateServiceJobOffers(
      SERVICE_JOB_TYPES,
      SERVICE_JOB_CUSTOMER_NAMES,
      CARS,
      CONTEXT.economy,
      7,
      4,
      10,
      createRng(1),
    )
    expect(withDefaults).toHaveLength(4)
  })
})

/**
 * Sprint 25 task 10: install-kind offers ("the parts market and a wrench")
 * only start appearing at INSTALL_OFFER_MIN_REPUTATION ('local') or above -
 * the playtest note this closes was literally a turbo-build offer on a
 * brand-new game's first day.
 */
describe('install-offer reputation gate (Sprint 25 task 10)', () => {
  it('a brand-new (unknown-reputation) game never offers an install-kind job', () => {
    const rng = createRng(11)
    let totalOffers = 0
    for (let week = 0; week < 60; week++) {
      const result = generateServiceJobOffers(
        SERVICE_JOB_TYPES,
        SERVICE_JOB_CUSTOMER_NAMES,
        CARS,
        CONTEXT.economy,
        week * 7,
        4,
        10,
        rng,
        Infinity,
        [],
        CONTEXT.equipmentById,
        'unknown',
      )
      totalOffers += result.length
      expect(result.every((o) => o.work.kind !== 'install')).toBe(true)
    }
    expect(totalOffers).toBeGreaterThan(0) // sanity: this ran real generation, not a no-op
  })

  it('install-kind offers reappear once reputation reaches local', () => {
    const rng = createRng(12)
    let sawInstall = false
    for (let week = 0; week < 60 && !sawInstall; week++) {
      const result = generateServiceJobOffers(
        SERVICE_JOB_TYPES,
        SERVICE_JOB_CUSTOMER_NAMES,
        CARS,
        CONTEXT.economy,
        week * 7,
        4,
        10,
        rng,
        Infinity,
        [],
        CONTEXT.equipmentById,
        'local',
      )
      if (result.some((o) => o.work.kind === 'install')) sawInstall = true
    }
    expect(sawInstall).toBe(true)
  })

  it('defaults to unrestricted (legend) when the reputation param is omitted', () => {
    const rng = createRng(13)
    let sawInstall = false
    for (let week = 0; week < 40 && !sawInstall; week++) {
      const result = generateServiceJobOffers(
        SERVICE_JOB_TYPES,
        SERVICE_JOB_CUSTOMER_NAMES,
        CARS,
        CONTEXT.economy,
        week * 7,
        4,
        10,
        rng,
      )
      if (result.some((o) => o.work.kind === 'install')) sawInstall = true
    }
    expect(sawInstall).toBe(true)
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
    const job = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'mint' }) })
    const leftover: Job = {
      id: 'job-x',
      carInstanceId: job.car.id,
      kind: 'repair-zone',
      componentId: repairComponent,
      targetBand: 'mint',
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
    const job = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'worn' }) })
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
    const job = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'worn' }) })
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

  it('drops the car’s staged work (Sprint 18) whether the job pays or fails', () => {
    const paidJob = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'mint' }) })
    const paidState = stateWith(paidJob, {
      stagedCarWork: {
        [paidJob.car.id]: [{ kind: 'repair', componentId: 'wheels', targetBand: 'mint' }],
      },
    })
    const paid = resolveServiceJob(paidState, paidJob.id, CONTEXT)
    expect(paid.outcome).toBe('paid')
    expect(paid.state.stagedCarWork[paidJob.car.id]).toBeUndefined()

    const failedJob = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'worn' }) })
    const failedState = stateWith(failedJob, {
      stagedCarWork: {
        [failedJob.car.id]: [{ kind: 'repair', componentId: 'wheels', targetBand: 'mint' }],
      },
    })
    const failed = resolveServiceJob(failedState, failedJob.id, CONTEXT)
    expect(failed.outcome).toBe('failed')
    expect(failed.state.stagedCarWork[failedJob.car.id]).toBeUndefined()
  })

  it('an install job pays; a pricier installed grade earns more reputation', () => {
    const budget = partInGroup(installComponent, (p) => p.grade === 'stock')
    const pricey = partInGroup(installComponent, (p) => p.grade !== 'stock')

    function repWith(part: Part): number {
      const job = activeJob(installType, {
        parts: mintCarParts({ [part.carPartId]: { installed: partInstance(part.id) } }),
      })
      return resolveServiceJob(stateWith(job), job.id, CONTEXT).state.reputationPoints
    }

    expect(repWith(pricey)).toBeGreaterThan(repWith(budget))
  })

  /**
   * Sprint 12: the old `install-wheels-interior` type (one mixed-theme
   * flavor pool covering both wheels and interior parts) was split into
   * separate `install-wheels`/`install-interior` types once wheels and
   * interior became real, distinct components. This covers every install
   * type in the real catalog, including those two, so a broken split fails
   * here instead of silently passing type-checks and schema validation alone.
   */
  it('every install job type in the real catalog resolves work-done correctly for its own group', () => {
    const installTypes = SERVICE_JOB_TYPES.filter((t) => t.work.kind === 'install')
    expect(installTypes.some((t) => t.work.componentId === 'wheels')).toBe(true)
    expect(installTypes.some((t) => t.work.componentId === 'interior')).toBe(true)

    for (const type of installTypes) {
      const groupId = type.work.componentId
      const part = partInGroup(groupId)

      const unfinished = activeJob(type)
      expect(isServiceWorkDone(unfinished, CONTEXT)).toBe(false)

      const finished = activeJob(type, {
        parts: mintCarParts({ [part.carPartId]: { installed: partInstance(part.id) } }),
      })
      expect(isServiceWorkDone(finished, CONTEXT)).toBe(true)

      const { outcome } = resolveServiceJob(stateWith(finished), finished.id, CONTEXT)
      expect(outcome).toBe('paid')
    }
  })
})

describe('resolveAcceptServiceJob (Sprint 11 instant resolver)', () => {
  /**
   * Sprint 25 task 2: acceptance claims the parking slot instantly (unchanged),
   * but the car itself arrives `SERVICE_JOB_ARRIVAL_DELAY_DAYS` later, and the
   * work deadline is counted from that arrival day, not from acceptance.
   */
  it('moves the offer into activeServiceJobs, marks it in transit, and counts the deadline from arrival', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: [REPAIR_EQUIPMENT.id],
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.serviceJobOffers).toHaveLength(0)
    expect(result.state.activeServiceJobs).toHaveLength(1)
    const accepted = result.state.activeServiceJobs[0]!
    expect(accepted.arrivesOnDay).toBe(state.day + SERVICE_JOB_ARRIVAL_DELAY_DAYS)
    expect(accepted.dueOnDay).toBe(
      state.day + SERVICE_JOB_ARRIVAL_DELAY_DAYS + SERVICE_JOB_DEADLINE_DAYS,
    )
    expect(isServiceJobInTransit(accepted, state.day)).toBe(true)
    expect(result.log).toEqual([
      { type: 'service-job-accepted', jobId: offer.id, carInstanceId: offer.car.id },
    ])
  })

  it('is a no-op for an unknown offer id', () => {
    const state = createInitialGameState(CONTEXT, 1)
    const result = resolveAcceptServiceJob(state, 'no-such-offer', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('leaves the offer on the board (no state change) when parking is full', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      parkingBayCount: 0,
      ownedEquipmentIds: [REPAIR_EQUIPMENT.id],
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.serviceJobOffers).toHaveLength(1)
    expect(result.state.activeServiceJobs).toHaveLength(0)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-parking' },
    ])
  })

  /**
   * Sprint 13 decision 2: a repair-kind offer "can't even be accepted"
   * without the matching equipment - install-kind offers are never gated
   * (replace is always available). The offer stays on the board either way
   * (the maintainer's own read is that an unreachable repair offer
   * arguably shouldn't be generated at all - deliberately deferred, see
   * TODO.md - this sprint ships the simpler accept-time block).
   */
  it('refuses a repair-kind offer without the matching equipment, leaving it on the board', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: [],
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.serviceJobOffers).toHaveLength(1)
    expect(result.state.activeServiceJobs).toHaveLength(0)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-equipment' },
    ])
  })

  it('never gates an install-kind offer by equipment', () => {
    const offer = { ...activeJob(installType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: [],
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.activeServiceJobs).toHaveLength(1)
  })
})

describe('service jobs in advanceDay', () => {
  it('accepting claims a parking slot and stamps the deadline from the (delayed) arrival day', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: [REPAIR_EQUIPMENT.id],
    }
    const actions = DayActionsSchema.parse({ acceptServiceJobs: [{ offerId: offer.id }] })
    const { state: next } = advanceDay(state, actions, 1, CONTEXT)

    expect(next.activeServiceJobs).toHaveLength(1)
    expect(next.activeServiceJobs[0]!.dueOnDay).toBe(
      1 + SERVICE_JOB_ARRIVAL_DELAY_DAYS + SERVICE_JOB_DEADLINE_DAYS,
    )
    expect(next.ownedCars).toHaveLength(0)
  })

  /**
   * Sprint 25 task 2 regression, matching the sprint doc's exact required
   * test: accept on day N, run exactly one advanceDay, and the car is
   * already workable (arrivesOnDay cleared) - not still in transit for a
   * second day, same off-by-one class as parts.ts's resolvePartDeliveries.
   */
  it('accept-then-advance places a workable (arrived) car after exactly one advanceDay', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null }
    const dayN = 5
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      day: dayN,
      serviceJobOffers: [offer],
      ownedEquipmentIds: [REPAIR_EQUIPMENT.id],
    }
    const actions = DayActionsSchema.parse({ acceptServiceJobs: [{ offerId: offer.id }] })
    const { state: next } = advanceDay(state, actions, dayN, CONTEXT)

    expect(next.day).toBe(dayN + 1)
    const accepted = next.activeServiceJobs[0]!
    expect(accepted.arrivesOnDay).toBeNull()
    expect(isServiceJobInTransit(accepted, next.day)).toBe(false)
  })

  it('the deadline backstop pays a finished job and fails an unfinished one', () => {
    const done = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'mint' }) })
    const paidState = { ...createInitialGameState(CONTEXT, 1), day: 8, activeServiceJobs: [done] }
    const paidBefore = paidState.cashYen
    const paid = advanceDay(paidState, DayActionsSchema.parse({}), 8, CONTEXT).state
    expect(paid.cashYen).toBe(paidBefore + done.payoutYen)
    expect(paid.activeServiceJobs).toHaveLength(0)

    const undone = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'worn' }) })
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

  it('the deadline backstop drops staged work too (Sprint 18) - the same resolver, not a second path', () => {
    const undone = activeJob(repairType, { parts: groupCarParts({ [repairComponent]: 'worn' }) })
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      day: 8,
      activeServiceJobs: [undone],
      stagedCarWork: {
        [undone.car.id]: [
          { kind: 'repair' as const, componentId: 'wheels' as const, targetBand: 'mint' as const },
        ],
      },
    }
    const { state: next } = advanceDay(state, DayActionsSchema.parse({}), 8, CONTEXT)
    expect(next.activeServiceJobs).toHaveLength(0)
    expect(next.stagedCarWork[undone.car.id]).toBeUndefined()
  })

  it('stale offers expire', () => {
    const offer = { ...activeJob(repairType), dueOnDay: null, expiresOnDay: 1 }
    const state = { ...createInitialGameState(CONTEXT, 1), day: 1, serviceJobOffers: [offer] }
    const { state: next } = advanceDay(state, DayActionsSchema.parse({}), 1, CONTEXT)
    expect(next.serviceJobOffers).toHaveLength(0)
  })
})

describe('isServiceJobInTransit', () => {
  it('is false once the job has no arrivesOnDay set (already arrived)', () => {
    const job = activeJob(repairType) // arrivesOnDay: null by default
    expect(isServiceJobInTransit(job, 100)).toBe(false)
  })

  it('is true while the arrival day is still in the future, false once reached', () => {
    const job = { ...activeJob(repairType), arrivesOnDay: 10 }
    expect(isServiceJobInTransit(job, 9)).toBe(true)
    expect(isServiceJobInTransit(job, 10)).toBe(false)
    expect(isServiceJobInTransit(job, 11)).toBe(false)
  })
})

describe('resolveServiceJobArrivals (Sprint 25 task 2, day arithmetic mirrors resolvePartDeliveries)', () => {
  it('is a no-op when nothing is in transit', () => {
    const job = activeJob(repairType) // already arrived
    const state = { ...createInitialGameState(CONTEXT, 1), activeServiceJobs: [job] }
    const result = resolveServiceJobArrivals(state)
    expect(result.state).toBe(state)
  })

  it('leaves a further-out arrival pending until one day before it', () => {
    const job = { ...activeJob(repairType), arrivesOnDay: 20 }
    const state = { ...createInitialGameState(CONTEXT, 1), day: 18, activeServiceJobs: [job] }
    const result = resolveServiceJobArrivals(state)
    expect(result.state).toBe(state)
    expect(result.state.activeServiceJobs[0]!.arrivesOnDay).toBe(20)
  })

  /**
   * Same off-by-one class as parts.ts's resolvePartDeliveries: advanceDay
   * never mutates state.day until the very end of its own body, so the one
   * call that takes day N to day N + 1 must clear an arrivesOnDay: N + 1
   * job right here, not on the following call.
   */
  it('regression: a job accepted on day N clears in the very next resolveServiceJobArrivals call', () => {
    const dayN = 5
    const job = { ...activeJob(repairType), arrivesOnDay: dayN + SERVICE_JOB_ARRIVAL_DELAY_DAYS }
    const state = { ...createInitialGameState(CONTEXT, 1), day: dayN, activeServiceJobs: [job] }
    const result = resolveServiceJobArrivals(state)
    expect(result.state.activeServiceJobs[0]!.arrivesOnDay).toBeNull()
  })
})
