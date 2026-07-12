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
  type CarPartId,
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
import { SERVICE_JOB_ARRIVAL_DELAY_DAYS } from '../src/constants'
import { buildSimContext } from '../src/context'
import { hasEquipmentForIds } from '../src/equipment'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import {
  deriveServiceJobPayoutYen,
  generateDailyServiceJobOffers,
  isServiceJobInTransit,
  isServiceTaskDone,
  isServiceWorkDone,
  reputationForCompletion,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveServiceJob,
  resolveServiceJobArrivals,
  serviceJobCostBreakdown,
} from '../src/serviceJobs'
import { buildCarInstance, mintCarParts } from './testFixtures'

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

/** Real templates from the content set, referenced by id so a future content
 * edit that changes their SHAPE (not just flavor text) fails these tests
 * loudly instead of silently drifting. */
const singleRepairType = findType('small-bodywork-touchup') // tasks: [repair panels -> fine]
const installType = findType('coilover-install') // tasks: [install dampers >= street]
const twoRepairType = findType('tyres-and-pads-service') // tasks: [repair tyres, repair brakePadsDiscs]
const mixedType = findType('put-her-in-a-ditch') // tasks: [repair panels, repair dampers, install tyres]
const twoInstallType = findType('engine-internals-rebuild') // tasks: [install internals, install headValvetrain]

function findType(id: string): ServiceJobType {
  const type = SERVICE_JOB_TYPES.find((t) => t.id === id)
  if (!type) throw new Error(`fixture template "${id}" missing from content - update the test`)
  return type
}

/** Equipment ids covering every repair task's group in `type` - owned by
 * default in accept/resolve tests so they exercise their own intended gate
 * (parking, unknown offer) rather than the equipment gate, which has its
 * own dedicated tests. */
function equipmentIdsFor(type: ServiceJobType): string[] {
  const groups = new Set(
    type.tasks
      .filter((t) => t.action === 'repair')
      .map((t) => CONTEXT.partsTaxonomyById[t.carPartId]!.group),
  )
  return EQUIPMENT.filter((e) => e.componentIds.some((c) => groups.has(c))).map((e) => e.id)
}

/** An active (accepted) service job carrying a real car, ready to resolve. */
function activeJob(type: ServiceJobType, carOverrides: Partial<CarInstance> = {}): ServiceJob {
  const car = generateAuctionCarInstance(CARS[0]!, `svc-car-${type.id}`, createRng(42), CONTEXT)
  return {
    id: `svc-${type.id}`,
    typeId: type.id,
    customerName: SERVICE_JOB_CUSTOMER_NAMES[0]!,
    description: type.flavorPool[0]!,
    tasks: type.tasks,
    car: { ...car, ...carOverrides },
    payoutYen: 100_000,
    baseReputation: type.baseReputation,
    deadlineDays: type.deadlineDays,
    expiresOnDay: 30,
    arrivesOnDay: null, // an already-arrived, workable job by default in these fixtures
    dueOnDay: 8,
  }
}

function partInstance(partId: string): PartInstance {
  return { id: `pi-${partId}`, partId, band: 'mint', genuinePeriod: false }
}

/** A catalog part addressed to `carPartId`, optionally filtered further -
 * for tests that need a real, fitting part to install. */
function catalogPartFor(carPartId: CarPartId, predicate: (p: Part) => boolean = () => true): Part {
  const part = PARTS.find((p) => p.carPartId === carPartId && predicate(p))
  if (!part) throw new Error(`no catalog part addresses "${carPartId}"`)
  return part
}

function stateWith(job: ServiceJob, overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), activeServiceJobs: [job], ...overrides }
}

describe('generateDailyServiceJobOffers', () => {
  it('offers unique ids, a real car, no deadline yet, and a positive derived payout', () => {
    const result = generateDailyServiceJobOffers(CONTEXT, 7, 10, createRng(1))
    expect(result.length).toBeGreaterThan(0) // sanity: this seed rolls at least one offer
    expect(new Set(result.map((o) => o.id)).size).toBe(result.length)
    expect(result.every((o) => o.expiresOnDay === 17)).toBe(true)
    expect(result.every((o) => o.dueOnDay === null)).toBe(true) // deadline is stamped on accept
    expect(result.every((o) => o.arrivesOnDay === null)).toBe(true)
    expect(result.every((o) => o.car.id.length > 0)).toBe(true)
    expect(result.every((o) => o.payoutYen > 0)).toBe(true)
  })

  it('every offer composes a real template + flavor line + customer name + its own task list', () => {
    const seen: ServiceJob[] = []
    for (let day = 1; day < 40; day++) {
      seen.push(...generateDailyServiceJobOffers(CONTEXT, day, 10, createRng(day)))
    }
    expect(seen.length).toBeGreaterThan(0)
    for (const offer of seen) {
      const template = SERVICE_JOB_TYPES.find((t) => t.id === offer.typeId)
      expect(template).toBeDefined()
      expect(template!.flavorPool).toContain(offer.description)
      expect(SERVICE_JOB_CUSTOMER_NAMES).toContain(offer.customerName)
      expect(offer.tasks).toEqual(template!.tasks)
      expect(offer.deadlineDays).toBe(template!.deadlineDays)
      expect(offer.baseReputation).toBe(template!.baseReputation)
    }
  })

  it('returns nothing with no eligible templates, names, or models', () => {
    const noTemplates = buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      [],
      FACILITIES,
      SERVICE_JOB_CUSTOMER_NAMES,
      EQUIPMENT,
    )
    expect(generateDailyServiceJobOffers(noTemplates, 7, 10, createRng(1))).toEqual([])

    const noNames = buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      SERVICE_JOB_TYPES,
      FACILITIES,
      [],
      EQUIPMENT,
    )
    expect(generateDailyServiceJobOffers(noNames, 7, 10, createRng(1))).toEqual([])

    const noModels = buildSimContext(
      [],
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      SERVICE_JOB_TYPES,
      FACILITIES,
      SERVICE_JOB_CUSTOMER_NAMES,
      EQUIPMENT,
    )
    expect(generateDailyServiceJobOffers(noModels, 7, 10, createRng(1))).toEqual([])
  })

  /**
   * Sprint 29 decision 4: a bell curve over 0-4, not a fixed weekly count -
   * statistical, not exact, matching how every other probabilistic sim
   * mechanic in this codebase is tested.
   */
  it('draws a daily offer count roughly matching the content-tunable bell-curve weights', () => {
    const counts = [0, 0, 0, 0, 0]
    const days = 4000
    for (let day = 1; day <= days; day++) {
      const result = generateDailyServiceJobOffers(CONTEXT, day, 10, createRng(day))
      counts[Math.min(result.length, 4)]! += 1
    }
    const weights = CONTEXT.economy.serviceJobs.dailyOfferCountWeights
    for (let i = 0; i < weights.length; i++) {
      const observed = counts[i]! / days
      expect(Math.abs(observed - weights[i]!)).toBeLessThan(0.05)
    }
  })
})

describe('service-job template tier gating (Sprint 29 decision 2)', () => {
  it('a brand-new (unknown-reputation) game only ever offers tier-1 templates', () => {
    let total = 0
    for (let day = 1; day <= 400; day++) {
      const result = generateDailyServiceJobOffers(
        CONTEXT,
        day,
        10,
        createRng(day),
        Infinity,
        [],
        'unknown',
      )
      total += result.length
      for (const offer of result) {
        const template = SERVICE_JOB_TYPES.find((t) => t.id === offer.typeId)!
        expect(template.tier).toBe(1)
      }
    }
    expect(total).toBeGreaterThan(0)
  })

  it('tier-2 templates reappear once reputation reaches local, tier 3 stays gated', () => {
    let sawTier2 = false
    for (let day = 1; day <= 400; day++) {
      const result = generateDailyServiceJobOffers(
        CONTEXT,
        day,
        10,
        createRng(day),
        Infinity,
        [],
        'local',
      )
      for (const offer of result) {
        const template = SERVICE_JOB_TYPES.find((t) => t.id === offer.typeId)!
        expect(template.tier).toBeLessThanOrEqual(2)
        if (template.tier === 2) sawTier2 = true
      }
    }
    expect(sawTier2).toBe(true)
  })

  it('a turbo/FI install (tier 4) can never be a first job: never appears before respected', () => {
    for (let day = 1; day <= 400; day++) {
      const result = generateDailyServiceJobOffers(
        CONTEXT,
        day,
        10,
        createRng(day),
        Infinity,
        [],
        'known',
      )
      for (const offer of result) {
        const template = SERVICE_JOB_TYPES.find((t) => t.id === offer.typeId)!
        expect(template.tier).toBeLessThanOrEqual(3)
      }
    }
  })

  it('tier-4 templates reappear once reputation reaches respected', () => {
    let sawTier4 = false
    for (let day = 1; day <= 400 && !sawTier4; day++) {
      const result = generateDailyServiceJobOffers(
        CONTEXT,
        day,
        10,
        createRng(day),
        Infinity,
        [],
        'respected',
      )
      if (result.some((o) => SERVICE_JOB_TYPES.find((t) => t.id === o.typeId)!.tier === 4))
        sawTier4 = true
    }
    expect(sawTier4).toBe(true)
  })

  it('defaults to unrestricted (legend) when the reputation param is omitted', () => {
    let sawTier4 = false
    for (let day = 1; day <= 300 && !sawTier4; day++) {
      const result = generateDailyServiceJobOffers(CONTEXT, day, 10, createRng(day))
      if (result.some((o) => SERVICE_JOB_TYPES.find((t) => t.id === o.typeId)!.tier === 4))
        sawTier4 = true
    }
    expect(sawTier4).toBe(true)
  })
})

describe('job-board equipment hinting (Sprint 16 decision 4, extended to multi-task templates)', () => {
  it('mostly filters a repair-touching template whose equipment is not owned, but not to zero', () => {
    let repairTemplateOffers = 0
    let totalOffers = 0
    for (let day = 1; day <= 700; day++) {
      const result = generateDailyServiceJobOffers(CONTEXT, day, 10, createRng(day), Infinity, [])
      totalOffers += result.length
      repairTemplateOffers += result.filter((o) =>
        o.tasks.some((t) => t.action === 'repair'),
      ).length
    }
    const repairShare = repairTemplateOffers / totalOffers
    expect(repairShare).toBeGreaterThan(0)
    expect(repairShare).toBeLessThan(0.2)
  })

  it('never filters a repair-touching template whose equipment is already owned', () => {
    const ownedIds = EQUIPMENT.map((e) => e.id) // everything owned
    let sawRepairTemplate = false
    for (let day = 1; day <= 300 && !sawRepairTemplate; day++) {
      const result = generateDailyServiceJobOffers(
        CONTEXT,
        day,
        10,
        createRng(day),
        Infinity,
        ownedIds,
      )
      if (result.some((o) => o.tasks.some((t) => t.action === 'repair'))) sawRepairTemplate = true
    }
    expect(sawRepairTemplate).toBe(true)
  })

  it('install-only templates are never filtered by the hinting policy, owned or not', () => {
    const seen: ServiceJob[] = []
    for (let day = 1; day <= 300; day++) {
      seen.push(...generateDailyServiceJobOffers(CONTEXT, day, 10, createRng(day), Infinity, []))
    }
    const installOnlyTemplateCount = SERVICE_JOB_TYPES.filter((t) =>
      t.tasks.every((task) => task.action === 'install'),
    ).length
    expect(seen.filter((o) => o.tasks.every((t) => t.action === 'install')).length).toBeGreaterThan(
      installOnlyTemplateCount,
    ) // sanity: install offers show up plenty across many rolls
  })
})

describe('Sprint 33 decision 2: job board is actionable-or-one-purchase-away', () => {
  /** Every distinct component group `offer` still needs repair equipment
   * for, given `ownedEquipmentIds` - the same public-data computation the
   * sim's own hard filter is built on, kept independent here so this test
   * verifies the observable OUTCOME rather than reaching into a private
   * implementation helper. */
  function missingEquipmentGroups(offer: ServiceJob, ownedEquipmentIds: readonly string[]): number {
    const groups = new Set<ComponentId>()
    for (const task of offer.tasks) {
      if (task.action !== 'repair') continue
      const group = CONTEXT.partsTaxonomyById[task.carPartId]!.group
      if (!hasEquipmentForIds(ownedEquipmentIds, CONTEXT.equipmentById, group)) groups.add(group)
    }
    return groups.size
  }

  it('a fresh (brand-new-game) job board never offers a job needing 2+ equipment purchases', () => {
    let sawAnyOffer = false
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      for (const offer of state.serviceJobOffers) {
        sawAnyOffer = true
        expect(missingEquipmentGroups(offer, state.ownedEquipmentIds)).toBeLessThanOrEqual(1)
      }
    }
    expect(sawAnyOffer).toBe(true) // sanity: the board isn't just always empty
  })

  it('a fresh game’s offers skew heavily toward Replace-only (install) work', () => {
    let installOnly = 0
    let total = 0
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      for (const offer of state.serviceJobOffers) {
        total += 1
        if (offer.tasks.every((task) => task.action === 'install')) installOnly += 1
      }
    }
    expect(total).toBeGreaterThan(0)
    expect(installOnly / total).toBeGreaterThan(0.5)
  })

  it('a template needing two distinct unowned equipment groups is excluded from generation entirely, even unrestricted by tier', () => {
    // tyres-and-pads-service needs wheels (tyres) AND suspension
    // (brakePadsDiscs) - two distinct groups when nothing is owned.
    const template = SERVICE_JOB_TYPES.find((t) => t.id === 'tyres-and-pads-service')!
    let sawTemplate = false
    for (let day = 1; day <= 500; day++) {
      const result = generateDailyServiceJobOffers(CONTEXT, day, 10, createRng(day), Infinity, [])
      if (result.some((o) => o.typeId === template.id)) sawTemplate = true
    }
    expect(sawTemplate).toBe(false)

    // The same template is reachable once ONE of its two groups is owned
    // (down to exactly one missing purchase, decision 2's hint case).
    const tireMachine = EQUIPMENT.find((e) => e.componentIds.includes('wheels'))!
    let sawWithOneOwned = false
    for (let day = 1; day <= 500 && !sawWithOneOwned; day++) {
      const result = generateDailyServiceJobOffers(CONTEXT, day, 10, createRng(day), Infinity, [
        tireMachine.id,
      ])
      if (result.some((o) => o.typeId === template.id)) sawWithOneOwned = true
    }
    expect(sawWithOneOwned).toBe(true)
  })

  it('a day-one player (unknown reputation, no equipment) is never offered a repair needing a machine they cannot buy yet', () => {
    // The Sprint 33 gap: the old filter allowed any job needing <= 1 more
    // machine WITHOUT checking that machine was purchasable now, so a fresh
    // `unknown`-reputation game could be offered a cooling repair needing the
    // Engine Crane (a `known`-tier, Y1.5M machine). On day one the only machine
    // on sale is the tyre machine (wheels); every other machine needs `local`+,
    // so a repair in any non-wheels group must never appear.
    const buyableAtUnknown = (group: ComponentId): boolean =>
      EQUIPMENT.some(
        (e) =>
          e.componentIds.includes(group) &&
          (e.minReputationTier === undefined || e.minReputationTier === 'unknown'),
      )
    let sawAnyOffer = false
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      for (const offer of state.serviceJobOffers) {
        sawAnyOffer = true
        for (const task of offer.tasks) {
          if (task.action !== 'repair') continue
          const group = CONTEXT.partsTaxonomyById[task.carPartId]!.group
          // Nothing is owned on day one, so every offered repair task's group
          // must be one whose machine the player can actually buy right now.
          expect(buyableAtUnknown(group)).toBe(true)
        }
      }
    }
    expect(sawAnyOffer).toBe(true) // sanity: the board isn't just always empty
  })
})

describe('serviceJobCostBreakdown / deriveServiceJobPayoutYen (Sprint 29 decision 1)', () => {
  it('a repair task on an already-mint part contributes nothing to cost or labor', () => {
    const car = buildCarInstance({ parts: mintCarParts() })
    const model = CARS[0]!
    const breakdown = serviceJobCostBreakdown(singleRepairType.tasks, car, model, CONTEXT)
    expect(breakdown.taskCostYen).toBe(0)
    expect(breakdown.laborSlots).toBe(0)
  })

  it('a repair task charges banded-steps cost proportional to how far the part is from target', () => {
    const car = buildCarInstance({ parts: mintCarParts({ panels: 'poor' }) })
    const model = CARS[0]!
    const breakdown = serviceJobCostBreakdown(singleRepairType.tasks, car, model, CONTEXT)
    const entry = CONTEXT.partsTaxonomyById.panels!
    // poor -> fine is 2 grades (poor, worn, fine order: poor < worn < fine).
    expect(breakdown.taskCostYen).toBe(2 * entry.stepCostYen)
    expect(breakdown.laborSlots).toBeGreaterThan(0)
  })

  it('a repair task on a scrap part contributes nothing (unrepairable, already "done")', () => {
    const car = buildCarInstance({ parts: mintCarParts({ panels: 'scrap' }) })
    const model = CARS[0]!
    const breakdown = serviceJobCostBreakdown(singleRepairType.tasks, car, model, CONTEXT)
    expect(breakdown.taskCostYen).toBe(0)
    expect(breakdown.laborSlots).toBe(0)
  })

  it('a repair task on a missing (empty) slot contributes nothing - same treatment as scrap (Sprint 32)', () => {
    const car = buildCarInstance({ parts: mintCarParts({ panels: null }) })
    const model = CARS[0]!
    const breakdown = serviceJobCostBreakdown(singleRepairType.tasks, car, model, CONTEXT)
    expect(breakdown.taskCostYen).toBe(0)
    expect(breakdown.laborSlots).toBe(0)
  })

  it('an install task prices off the median fitting-part cost at (or above) minGrade', () => {
    const car = buildCarInstance({ parts: mintCarParts() })
    const model = CARS[0]!
    const breakdown = serviceJobCostBreakdown(installType.tasks, car, model, CONTEXT)
    expect(breakdown.taskCostYen).toBeGreaterThan(0)
    expect(breakdown.laborSlots).toBeGreaterThan(0)
  })

  it('a higher margin roll yields a strictly higher payout for the same tasks/car', () => {
    const car = buildCarInstance({ parts: mintCarParts({ panels: 'poor' }) })
    const model = CARS[0]!
    const low = deriveServiceJobPayoutYen(singleRepairType.tasks, car, model, CONTEXT, 1.2)
    const high = deriveServiceJobPayoutYen(singleRepairType.tasks, car, model, CONTEXT, 1.45)
    expect(high).toBeGreaterThan(low)
  })
})

describe('isServiceTaskDone / isServiceWorkDone (Sprint 29 multi-task, per-part)', () => {
  it('a repair task is done once its part reaches targetBand, or if it is scrap (unrepairable)', () => {
    const task = singleRepairType.tasks[0]!
    if (task.action !== 'repair') throw new Error('fixture task should be a repair task')
    const notThere = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: 'poor' }),
    })
    expect(isServiceTaskDone(notThere, task, CONTEXT.partsById)).toBe(false)
    const there = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: task.targetBand }),
    })
    expect(isServiceTaskDone(there, task, CONTEXT.partsById)).toBe(true)
    const scrapped = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: 'scrap' }),
    })
    expect(isServiceTaskDone(scrapped, task, CONTEXT.partsById)).toBe(true)
  })

  it('a repair task on a missing (empty) slot counts as done too - nothing left to repair (Sprint 32)', () => {
    const task = singleRepairType.tasks[0]!
    if (task.action !== 'repair') throw new Error('fixture task should be a repair task')
    const missing = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: null }),
    })
    expect(isServiceTaskDone(missing, task, CONTEXT.partsById)).toBe(true)
  })

  it('an install task is done once its slot holds a part graded at least minGrade - overdelivering still passes', () => {
    const task = installType.tasks[0]!
    if (task.action !== 'install') throw new Error('fixture task should be an install task')
    const empty = buildCarInstance({ parts: mintCarParts({ [task.carPartId]: null }) })
    expect(isServiceTaskDone(empty, task, CONTEXT.partsById)).toBe(false)

    const stockPart = catalogPartFor(task.carPartId, (p) => p.grade === 'stock')
    const withStock = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: partInstance(stockPart.id) }),
    })
    expect(isServiceTaskDone(withStock, task, CONTEXT.partsById)).toBe(false) // stock < street

    const streetPart = catalogPartFor(task.carPartId, (p) => p.grade === task.minGrade)
    const withStreet = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: partInstance(streetPart.id) }),
    })
    expect(isServiceTaskDone(withStreet, task, CONTEXT.partsById)).toBe(true)

    const racePart = catalogPartFor(task.carPartId, (p) => p.grade === 'race')
    const withRace = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: partInstance(racePart.id) }),
    })
    expect(isServiceTaskDone(withRace, task, CONTEXT.partsById)).toBe(true)
  })

  it('isServiceWorkDone requires every task in a multi-task job done, not just one', () => {
    const job = activeJob(twoRepairType, {
      parts: mintCarParts({ tyres: 'worn', brakePadsDiscs: 'worn' }),
    })
    expect(isServiceWorkDone(job, CONTEXT)).toBe(false)

    const oneDone = activeJob(twoRepairType, {
      parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'worn' }),
    })
    expect(isServiceWorkDone(oneDone, CONTEXT)).toBe(false)

    const bothDone = activeJob(twoRepairType, {
      parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'mint' }),
    })
    expect(isServiceWorkDone(bothDone, CONTEXT)).toBe(true)
  })

  it('a mixed repair+install job needs every kind of task done', () => {
    const streetTyres = catalogPartFor('tyres', (p) => p.grade === 'street')
    const done = activeJob(mixedType, {
      parts: mintCarParts({
        panels: 'fine',
        dampers: 'fine',
        tyres: partInstance(streetTyres.id),
      }),
    })
    expect(isServiceWorkDone(done, CONTEXT)).toBe(true)

    const missingInstall = activeJob(mixedType, {
      parts: mintCarParts({ panels: 'fine', dampers: 'fine' }),
    })
    expect(isServiceWorkDone(missingInstall, CONTEXT)).toBe(false)
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

describe('resolveServiceJob (the single resolution path, Sprint 29 multi-task)', () => {
  it('pays out + grants reputation (stock rate) when a repair-only job is fully done, and the car leaves', () => {
    const job = activeJob(twoRepairType, {
      parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'mint' }),
    })
    const leftover: Job = {
      id: 'job-x',
      carInstanceId: job.car.id,
      kind: 'repair-zone',
      componentId: 'wheels',
      targetBand: 'mint',
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const state = stateWith(job, { jobs: [leftover] })
    const cashBefore = state.cashYen

    const { state: next, outcome, log } = resolveServiceJob(state, job.id, CONTEXT)
    expect(outcome).toBe('paid')
    expect(next.cashYen).toBe(cashBefore + job.payoutYen)
    expect(next.reputationPoints).toBe(job.baseReputation) // stock/1.0 rate: no install task
    expect(next.activeServiceJobs).toHaveLength(0)
    expect(next.ownedCars).toHaveLength(0) // never owned
    expect(next.jobs).toHaveLength(0) // leftover jobs on the departed car dropped
    expect(log[0]).toMatchObject({ type: 'service-job-completed', payoutYen: job.payoutYen })
    expect(log[0]).not.toMatchObject({ partCostYen: expect.anything() })
  })

  it('fails (no pay, reputation penalty) when at least one task is not done', () => {
    const job = activeJob(twoRepairType, {
      parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'worn' }),
    })
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
    const job = activeJob(twoRepairType, { parts: mintCarParts({ tyres: 'worn' }) })
    const state = stateWith(job) // reputationPoints starts at 0
    const { state: next } = resolveServiceJob(state, job.id, CONTEXT)
    expect(next.reputationPoints).toBe(0)
  })

  it('is a no-op for an unknown job id', () => {
    const job = activeJob(twoRepairType)
    const state = stateWith(job)
    const { state: next, outcome } = resolveServiceJob(state, 'nope', CONTEXT)
    expect(outcome).toBe('not-found')
    expect(next).toBe(state)
  })

  it('drops the car’s staged work whether the job pays or fails', () => {
    const paidJob = activeJob(twoRepairType, {
      parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'mint' }),
    })
    const paidState = stateWith(paidJob, {
      stagedCarWork: {
        [paidJob.car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }],
      },
    })
    const paid = resolveServiceJob(paidState, paidJob.id, CONTEXT)
    expect(paid.outcome).toBe('paid')
    expect(paid.state.stagedCarWork[paidJob.car.id]).toBeUndefined()

    const failedJob = activeJob(twoRepairType, { parts: mintCarParts({ tyres: 'worn' }) })
    const failedState = stateWith(failedJob, {
      stagedCarWork: {
        [failedJob.car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }],
      },
    })
    const failed = resolveServiceJob(failedState, failedJob.id, CONTEXT)
    expect(failed.outcome).toBe('failed')
    expect(failed.state.stagedCarWork[failedJob.car.id]).toBeUndefined()
  })

  describe('close-out reconciliation of customer-owned parts (Sprint 35 decision 5)', () => {
    const playerOwned: PartInstance = {
      id: 'pi-mine',
      partId: 'khs-street-ecu',
      band: 'mint',
      genuinePeriod: false,
    }
    const taggedWith = (id: string, jobId: string): PartInstance => ({
      id,
      partId: 'khs-street-ecu',
      band: 'poor',
      genuinePeriod: false,
      customerJobId: jobId,
    })

    it('a PAID job removes its own tagged parts, leaving player-owned and other jobs’ parts', () => {
      const job = activeJob(twoRepairType, {
        parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'mint' }),
      })
      const ours = taggedWith('pi-this', job.id)
      const otherJob = taggedWith('pi-other', 'svc-some-other-job')
      const state = stateWith(job, { partInventory: [ours, playerOwned, otherJob] })

      const { state: next, outcome } = resolveServiceJob(state, job.id, CONTEXT)
      expect(outcome).toBe('paid')
      // Our pulled part left with the customer; the player's part and a
      // different job's part are untouched.
      expect(next.partInventory).toEqual([playerOwned, otherJob])
    })

    it('a FAILED (not-paid) job likewise removes its own tagged parts; player-owned survives', () => {
      const job = activeJob(twoRepairType, { parts: mintCarParts({ tyres: 'worn' }) }) // undone -> failed
      const ours = taggedWith('pi-this', job.id)
      const state = stateWith(job, { partInventory: [ours, playerOwned] })

      const { state: next, outcome } = resolveServiceJob(state, job.id, CONTEXT)
      expect(outcome).toBe('failed')
      expect(next.partInventory).toEqual([playerOwned])
    })

    it('drops an in-flight recondition job on a customer part that leaves at close-out (no orphan job)', () => {
      const job = activeJob(twoRepairType, {
        parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'mint' }),
      })
      const ours = taggedWith('pi-this', job.id)
      const reconJob: Job = {
        id: 'recondition-pi-this',
        carInstanceId: ours.id, // a recondition job holds the part id here, not a car
        kind: 'recondition-part',
        componentId: 'suspension',
        partInstanceId: ours.id,
        targetBand: 'mint',
        laborSlotsRequired: 2,
        laborSlotsSpent: 1,
      }
      const state = stateWith(job, { partInventory: [ours, playerOwned], jobs: [reconJob] })

      const { state: next } = resolveServiceJob(state, job.id, CONTEXT)
      expect(next.partInventory).toEqual([playerOwned])
      expect(next.jobs).toHaveLength(0) // the orphaned recondition job is gone too
    })
  })

  it('a paid install job reports the installed part’s cost and profit; a pricier grade earns more reputation', () => {
    const installTask = installType.tasks[0]!
    if (installTask.action !== 'install') throw new Error('fixture task should be an install task')
    const carPartId = installTask.carPartId
    // Both must actually satisfy the task's own minGrade floor - a
    // below-floor "budget" part would leave the job undone, not paid.
    const budget = catalogPartFor(carPartId, (p) => p.grade === installTask.minGrade)
    const pricey = catalogPartFor(carPartId, (p) => p.grade === 'race')

    function resolveWith(part: Part) {
      const job = activeJob(installType, {
        parts: mintCarParts({ [carPartId]: partInstance(part.id) }),
      })
      const resolution = resolveServiceJob(stateWith(job), job.id, CONTEXT)
      return { resolution, payoutYen: job.payoutYen }
    }

    const budgetResult = resolveWith(budget)
    const priceyResult = resolveWith(pricey)
    expect(budgetResult.resolution.outcome).toBe('paid')
    expect(budgetResult.resolution.log[0]).toMatchObject({
      partCostYen: budget.priceYen,
      profitYen: budgetResult.payoutYen - budget.priceYen,
    })
    expect(priceyResult.resolution.state.reputationPoints).toBeGreaterThan(
      budgetResult.resolution.state.reputationPoints,
    )
  })

  it('a multi-install job scales reputation off its priciest installed grade, and sums every part cost', () => {
    const [internalsTask, headTask] = twoInstallType.tasks as {
      action: 'install'
      carPartId: CarPartId
      minGrade: string
    }[]
    const internalsPart = catalogPartFor(internalsTask!.carPartId, (p) => p.grade === 'sport')
    const headPart = catalogPartFor(headTask!.carPartId, (p) => p.grade === 'race')
    const job = activeJob(twoInstallType, {
      parts: mintCarParts({
        [internalsTask!.carPartId]: partInstance(internalsPart.id),
        [headTask!.carPartId]: partInstance(headPart.id),
      }),
    })
    const { state: next, log } = resolveServiceJob(stateWith(job), job.id, CONTEXT)
    expect(log[0]).toMatchObject({
      partCostYen: internalsPart.priceYen + headPart.priceYen,
    })
    // race beats sport - the completion reputation should match a pure-race grade.
    expect(next.reputationPoints).toBe(reputationForCompletion(job.baseReputation, 'race'))
  })
})

describe('resolveAcceptServiceJob (Sprint 11 instant resolver, Sprint 29 multi-task)', () => {
  /**
   * Sprint 25 task 2: acceptance claims the parking slot instantly (unchanged),
   * but the car itself arrives `SERVICE_JOB_ARRIVAL_DELAY_DAYS` later, and the
   * work deadline is counted from that arrival day using the OFFER's own
   * `deadlineDays` (Sprint 29), not a flat sim constant.
   */
  it('moves the offer into activeServiceJobs, marks it in transit, and counts the deadline from arrival', () => {
    const offer = { ...activeJob(twoRepairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: equipmentIdsFor(twoRepairType),
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.serviceJobOffers).toHaveLength(0)
    expect(result.state.activeServiceJobs).toHaveLength(1)
    const accepted = result.state.activeServiceJobs[0]!
    expect(accepted.arrivesOnDay).toBe(state.day + SERVICE_JOB_ARRIVAL_DELAY_DAYS)
    expect(accepted.dueOnDay).toBe(state.day + SERVICE_JOB_ARRIVAL_DELAY_DAYS + offer.deadlineDays)
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
    const offer = { ...activeJob(twoRepairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      parkingBayCount: 0,
      ownedEquipmentIds: equipmentIdsFor(twoRepairType),
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.serviceJobOffers).toHaveLength(1)
    expect(result.state.activeServiceJobs).toHaveLength(0)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-parking' },
    ])
  })

  /**
   * Sprint 13 decision 2, extended by Sprint 29: a job with ANY repair task
   * "can't even be accepted" without that task's group equipment -
   * install-only tasks are never gated (replace is always available).
   */
  it('refuses when ANY repair task in the job needs equipment the shop does not own, leaving it on the board', () => {
    const offer = { ...activeJob(mixedType), dueOnDay: null } // repair panels + repair dampers + install tyres
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: [], // owns nothing
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.serviceJobOffers).toHaveLength(1)
    expect(result.state.activeServiceJobs).toHaveLength(0)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-equipment' },
    ])
  })

  it('accepts once every repair task’s group is equipped, even with several tasks', () => {
    const offer = { ...activeJob(mixedType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: equipmentIdsFor(mixedType),
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.activeServiceJobs).toHaveLength(1)
  })

  it('never gates a pure-install offer by equipment', () => {
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
    const offer = { ...activeJob(twoRepairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
      ownedEquipmentIds: equipmentIdsFor(twoRepairType),
    }
    const actions = DayActionsSchema.parse({ acceptServiceJobs: [{ offerId: offer.id }] })
    const { state: next } = advanceDay(state, actions, 1, CONTEXT)

    expect(next.activeServiceJobs).toHaveLength(1)
    expect(next.activeServiceJobs[0]!.dueOnDay).toBe(
      1 + SERVICE_JOB_ARRIVAL_DELAY_DAYS + offer.deadlineDays,
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
    const offer = { ...activeJob(twoRepairType), dueOnDay: null }
    const dayN = 5
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      day: dayN,
      serviceJobOffers: [offer],
      ownedEquipmentIds: equipmentIdsFor(twoRepairType),
    }
    const actions = DayActionsSchema.parse({ acceptServiceJobs: [{ offerId: offer.id }] })
    const { state: next } = advanceDay(state, actions, dayN, CONTEXT)

    expect(next.day).toBe(dayN + 1)
    const accepted = next.activeServiceJobs[0]!
    expect(accepted.arrivesOnDay).toBeNull()
    expect(isServiceJobInTransit(accepted, next.day)).toBe(false)
  })

  it('the deadline backstop pays a finished job and fails an unfinished one', () => {
    const done = activeJob(twoRepairType, {
      parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'mint' }),
    })
    const paidState = { ...createInitialGameState(CONTEXT, 1), day: 8, activeServiceJobs: [done] }
    const paidBefore = paidState.cashYen
    const paid = advanceDay(paidState, DayActionsSchema.parse({}), 8, CONTEXT).state
    expect(paid.cashYen).toBe(paidBefore + done.payoutYen)
    expect(paid.activeServiceJobs).toHaveLength(0)

    const undone = activeJob(twoRepairType, { parts: mintCarParts({ tyres: 'worn' }) })
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

  it('the deadline backstop drops staged work too - the same resolver, not a second path', () => {
    const undone = activeJob(twoRepairType, { parts: mintCarParts({ tyres: 'worn' }) })
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      day: 8,
      activeServiceJobs: [undone],
      stagedCarWork: {
        [undone.car.id]: [
          { kind: 'repair' as const, componentId: 'body' as const, targetBand: 'mint' as const },
        ],
      },
    }
    const { state: next } = advanceDay(state, DayActionsSchema.parse({}), 8, CONTEXT)
    expect(next.activeServiceJobs).toHaveLength(0)
    expect(next.stagedCarWork[undone.car.id]).toBeUndefined()
  })

  it('stale offers expire', () => {
    const offer = { ...activeJob(twoRepairType), dueOnDay: null, expiresOnDay: 1 }
    const state = { ...createInitialGameState(CONTEXT, 1), day: 1, serviceJobOffers: [offer] }
    const { state: next } = advanceDay(state, DayActionsSchema.parse({}), 1, CONTEXT)
    // Sprint 29: this same advanceDay call can also add fresh offers (the
    // new daily cadence, step 8a) - the stale one is specifically gone, not
    // necessarily the whole board.
    expect(next.serviceJobOffers.some((o) => o.id === offer.id)).toBe(false)
  })

  /** Sprint 29: replaces the old weekly-dump refresh - fresh offers can land
   * on ANY day now, not just every 7th. */
  it('a plain day (no week boundary) can still add fresh offers to the board', () => {
    const state = createInitialGameState(CONTEXT, 1)
    let sawGrowth = false
    let current = state
    for (let day = 1; day <= 30 && !sawGrowth; day++) {
      const before = current.serviceJobOffers.length
      const result = advanceDay(current, DayActionsSchema.parse({}), day, CONTEXT)
      current = result.state
      if (current.serviceJobOffers.length > before) sawGrowth = true
    }
    expect(sawGrowth).toBe(true)
  })
})

describe('isServiceJobInTransit', () => {
  it('is false once the job has no arrivesOnDay set (already arrived)', () => {
    const job = activeJob(twoRepairType) // arrivesOnDay: null by default
    expect(isServiceJobInTransit(job, 100)).toBe(false)
  })

  it('is true while the arrival day is still in the future, false once reached', () => {
    const job = { ...activeJob(twoRepairType), arrivesOnDay: 10 }
    expect(isServiceJobInTransit(job, 9)).toBe(true)
    expect(isServiceJobInTransit(job, 10)).toBe(false)
    expect(isServiceJobInTransit(job, 11)).toBe(false)
  })
})

describe('resolveServiceJobArrivals (Sprint 25 task 2, day arithmetic mirrors resolvePartDeliveries)', () => {
  it('is a no-op when nothing is in transit', () => {
    const job = activeJob(twoRepairType) // already arrived
    const state = { ...createInitialGameState(CONTEXT, 1), activeServiceJobs: [job] }
    const result = resolveServiceJobArrivals(state)
    expect(result.state).toBe(state)
  })

  it('leaves a further-out arrival pending until one day before it', () => {
    const job = { ...activeJob(twoRepairType), arrivesOnDay: 20 }
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
    const job = { ...activeJob(twoRepairType), arrivesOnDay: dayN + SERVICE_JOB_ARRIVAL_DELAY_DAYS }
    const state = { ...createInitialGameState(CONTEXT, 1), day: dayN, activeServiceJobs: [job] }
    const result = resolveServiceJobArrivals(state)
    expect(result.state.activeServiceJobs[0]!.arrivesOnDay).toBeNull()
  })
})
