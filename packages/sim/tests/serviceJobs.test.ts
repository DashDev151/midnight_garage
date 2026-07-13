import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TECHNIQUES,
  type CarInstance,
  type CarPartId,
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
import { bandIndex } from '../src/bands'
import { SERVICE_JOB_ARRIVAL_DELAY_DAYS } from '../src/constants'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import {
  deriveServiceJobPayoutYen,
  forceTasksOutstanding,
  freshSpecialty,
  generateDailyServiceJobOffers,
  isServiceJobInTransit,
  isServiceTaskDone,
  isServiceWorkDone,
  pickServiceJobTemplate,
  reputationForCompletion,
  reputationForFailure,
  resolveAcceptServiceJob,
  resolveServiceJob,
  resolveServiceJobArrivals,
  serviceJobCostBreakdown,
  isTemplateOfferable,
  shopTitle,
  taskGroup,
  toolDeficitSummary,
  topSpecialtyGroup,
  unlockedTechniques,
  upgradeHintFor,
} from '../src/serviceJobs'
import { buildCarInstance, mintCarParts, testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
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

/** A template's tasks with every `minToolTier` raised to `tier` - the
 * Sprint 36 test knob for exercising the tool-tier accept gate before
 * Sprint 37 authors real ceilings in content. */
function raiseMinToolTier(type: ServiceJobType, tier: 2 | 3): ServiceJobType['tasks'] {
  return type.tasks.map((task) => ({ ...task, minToolTier: tier }))
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
        testToolTiers(),
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
        testToolTiers(),
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
        testToolTiers(),
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
        testToolTiers(),
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

describe('the Sprint 36 offer rule, re-asserted against Sprint 37 real content', () => {
  it('across 300 fresh seeds every offer has max deficit <= 1 and at most one deficient group', () => {
    let sawAnyOffer = false
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      for (const offer of state.serviceJobOffers) {
        sawAnyOffer = true
        const summary = toolDeficitSummary(offer.tasks, state.toolTiers, CONTEXT)
        expect(summary.maxDeficit).toBeLessThanOrEqual(1)
        expect(summary.deficientGroups.length).toBeLessThanOrEqual(1)
      }
    }
    expect(sawAnyOffer).toBe(true) // sanity: the board isn't just always empty
  })

  /**
   * Sprint 37 DoD: the day-one board is diverse, not just honest. All 11
   * tier-1 templates (Sprint 37's authored ladder) have every task at
   * minToolTier 1, so a fresh (all-tier-1) shop has zero deficits on every
   * one of them - between them they touch all six lines, so the board
   * should draw from every discipline, not just one.
   */
  it('the day-one board is diverse: the union of offered templates touches all six groups across 300 seeds', () => {
    const touchedGroups = new Set<string>()
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      for (const offer of state.serviceJobOffers) {
        for (const task of offer.tasks) {
          const group = CONTEXT.partsTaxonomyById[task.carPartId]?.group
          if (group) touchedGroups.add(group)
        }
      }
    }
    expect([...touchedGroups].sort()).toEqual([
      'body',
      'drivetrain',
      'engine',
      'interior',
      'suspension',
      'wheels',
    ])
  })

  it('no single template dominates the day-one board: no id exceeds 40% of all offers pooled across 300 seeds', () => {
    const counts = new Map<string, number>()
    let total = 0
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      for (const offer of state.serviceJobOffers) {
        total += 1
        counts.set(offer.typeId, (counts.get(offer.typeId) ?? 0) + 1)
      }
    }
    expect(total).toBeGreaterThan(0)
    for (const [typeId, count] of counts) {
      expect(
        count / total,
        `"${typeId}" is ${((count / total) * 100).toFixed(1)}% of day-one offers`,
      ).toBeLessThanOrEqual(0.4)
    }
  })

  it('one tier out in one group is offerable (an upgrade-hint offer); two tiers out, or two deficient groups, is not', () => {
    // twoRepairType spans two distinct groups (wheels + suspension);
    // singleRepairType stays within one (body).
    const oneGroupOneTier = singleRepairType.tasks.map((task) => ({
      ...task,
      minToolTier: 2 as const,
    }))
    expect(isTemplateOfferable(oneGroupOneTier, testToolTiers(), CONTEXT)).toBe(true)
    expect(upgradeHintFor(oneGroupOneTier, testToolTiers(), CONTEXT)).toBe(
      `needs ${CONTEXT.toolLines.body.tiers[1]!.displayName}`,
    )

    const oneGroupTwoTiers = singleRepairType.tasks.map((task) => ({
      ...task,
      minToolTier: 3 as const,
    }))
    expect(isTemplateOfferable(oneGroupTwoTiers, testToolTiers(), CONTEXT)).toBe(false)

    const twoGroupsOneTier = twoRepairType.tasks.map((task) => ({
      ...task,
      minToolTier: 2 as const,
    }))
    expect(isTemplateOfferable(twoGroupsOneTier, testToolTiers(), CONTEXT)).toBe(false)

    // The deficit clears (and the hint disappears) once the line is upgraded.
    expect(isTemplateOfferable(oneGroupTwoTiers, testToolTiers({ body: 3 }), CONTEXT)).toBe(true)
    expect(upgradeHintFor(oneGroupOneTier, testToolTiers({ body: 2 }), CONTEXT)).toBeNull()
  })
})

describe('forceTasksOutstanding (Sprint 40 generation-forcing step)', () => {
  it('a repair task already at/above target is forced to a fresh instance strictly below the target band', () => {
    const task = singleRepairType.tasks[0]!
    if (task.action !== 'repair') throw new Error('fixture task should be a repair task')
    const car = buildCarInstance({ parts: mintCarParts({ [task.carPartId]: task.targetBand }) })
    expect(isServiceTaskDone(car, task, CONTEXT.partsById)).toBe(true)

    const forced = forceTasksOutstanding(car, singleRepairType.tasks, CONTEXT, createRng(1))
    expect(isServiceTaskDone(forced, task, CONTEXT.partsById)).toBe(false)
    const band = forced.parts[task.carPartId].installed!.band
    expect(band).not.toBe('scrap')
    expect(bandIndex(band)).toBeLessThan(bandIndex(task.targetBand))
  })

  it('a repair task on a scrap part is forced onto a repairable band below target (scrap is never re-rolled)', () => {
    const task = singleRepairType.tasks[0]!
    if (task.action !== 'repair') throw new Error('fixture task should be a repair task')
    const car = buildCarInstance({ parts: mintCarParts({ [task.carPartId]: 'scrap' }) })
    expect(isServiceTaskDone(car, task, CONTEXT.partsById)).toBe(true)

    const forced = forceTasksOutstanding(car, singleRepairType.tasks, CONTEXT, createRng(2))
    const installed = forced.parts[task.carPartId].installed
    expect(installed).not.toBeNull()
    expect(installed!.band).not.toBe('scrap')
    expect(isServiceTaskDone(forced, task, CONTEXT.partsById)).toBe(false)
  })

  it('a repair task on a missing (empty) slot is forced onto a freshly filled stock part below target', () => {
    const task = singleRepairType.tasks[0]!
    if (task.action !== 'repair') throw new Error('fixture task should be a repair task')
    const car = buildCarInstance({ parts: mintCarParts({ [task.carPartId]: null }) })
    expect(isServiceTaskDone(car, task, CONTEXT.partsById)).toBe(true)

    const forced = forceTasksOutstanding(car, singleRepairType.tasks, CONTEXT, createRng(3))
    expect(forced.parts[task.carPartId].installed).not.toBeNull()
    expect(isServiceTaskDone(forced, task, CONTEXT.partsById)).toBe(false)
  })

  it('an install task already satisfied is cleared back to an empty slot - real fit work again', () => {
    const task = installType.tasks[0]!
    if (task.action !== 'install') throw new Error('fixture task should be an install task')
    const streetPart = catalogPartFor(task.carPartId, (p) => p.grade === task.minGrade)
    const car = buildCarInstance({
      parts: mintCarParts({ [task.carPartId]: partInstance(streetPart.id) }),
    })
    expect(isServiceTaskDone(car, task, CONTEXT.partsById)).toBe(true)

    const forced = forceTasksOutstanding(car, installType.tasks, CONTEXT, createRng(4))
    expect(forced.parts[task.carPartId].installed).toBeNull()
    expect(isServiceTaskDone(forced, task, CONTEXT.partsById)).toBe(false)
  })

  it('leaves an already-outstanding task untouched - same car reference, no rng spent on it', () => {
    const task = singleRepairType.tasks[0]!
    if (task.action !== 'repair') throw new Error('fixture task should be a repair task')
    const car = buildCarInstance({ parts: mintCarParts({ [task.carPartId]: 'poor' }) })
    expect(isServiceTaskDone(car, task, CONTEXT.partsById)).toBe(false)

    const forced = forceTasksOutstanding(car, singleRepairType.tasks, CONTEXT, createRng(5))
    expect(forced).toBe(car)
  })

  it('a multi-task template only forces the specific tasks that are already satisfied', () => {
    // twoRepairType: repair tyres -> fine, repair brakePadsDiscs -> fine.
    const car = buildCarInstance({
      parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'poor' }),
    })
    const forced = forceTasksOutstanding(car, twoRepairType.tasks, CONTEXT, createRng(6))
    expect(forced.parts.tyres.installed!.band).not.toBe('mint') // forced below fine
    expect(forced.parts.brakePadsDiscs.installed!.band).toBe('poor') // untouched
    expect(isServiceWorkDone({ ...activeJob(twoRepairType), car: forced }, CONTEXT)).toBe(false)
  })
})

describe('generation-time task validation (Sprint 40 DoD)', () => {
  it('across 300 fresh seeds, every generated offer has every task genuinely outstanding on its car', () => {
    let sawOffer = false
    for (let seed = 1; seed <= 300; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      for (const offer of state.serviceJobOffers) {
        sawOffer = true
        expect(isServiceWorkDone(offer, CONTEXT)).toBe(false)
      }
    }
    expect(sawOffer).toBe(true) // sanity: the board isn't just always empty
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

    // Sprint 37: put-her-in-a-ditch's install task only requires a `stock`+
    // tyre (any installed tyre satisfies it - "sort all of it" doesn't imply
    // an upgrade), so a MISSING tyres slot (not merely a stock one) is what
    // actually exercises "the install task isn't done yet".
    const missingInstall = activeJob(mixedType, {
      parts: mintCarParts({ panels: 'fine', dampers: 'fine', tyres: null }),
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

  /**
   * Sprint 40 defense-in-depth guard: `resolveServiceJob` refuses outright
   * while the customer car is still in transit, even though this path is
   * currently unreachable through normal play (the deadline backstop only
   * fires once `dueOnDay`, always >= `arrivesOnDay`, has passed). Accept on
   * day N, attempt resolve on day N (still in transit) -> refused, no state
   * change; advance to N + 1 (arrived) -> resolves normally.
   */
  it("refuses (outcome 'in-transit') while the customer car hasn't arrived yet; resolves normally once it has", () => {
    const offer = {
      ...activeJob(twoRepairType, {
        parts: mintCarParts({ tyres: 'mint', brakePadsDiscs: 'mint' }),
      }),
      dueOnDay: null,
    }
    const dayN = 5
    const state = { ...createInitialGameState(CONTEXT, 1), day: dayN, serviceJobOffers: [offer] }
    const { state: accepted } = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    const job = accepted.activeServiceJobs[0]!
    expect(isServiceJobInTransit(job, accepted.day)).toBe(true)

    const refused = resolveServiceJob(accepted, job.id, CONTEXT)
    expect(refused.outcome).toBe('in-transit')
    expect(refused.state).toBe(accepted)
    expect(refused.log).toEqual([])

    const { state: nextDay } = advanceDay(accepted, DayActionsSchema.parse({}), dayN, CONTEXT)
    expect(isServiceJobInTransit(nextDay.activeServiceJobs[0]!, nextDay.day)).toBe(false)
    const resolved = resolveServiceJob(nextDay, job.id, CONTEXT)
    expect(resolved.outcome).toBe('paid')
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

describe('specialty (Sprint 38, the progression bible horizontal axis)', () => {
  describe('earning, split evenly across every distinct task group', () => {
    it("completion splits reputationGained across put-her-in-a-ditch's three groups (body/suspension/wheels)", () => {
      const job = activeJob(mixedType, { parts: mintCarParts({ panels: 'fine', dampers: 'fine' }) })
      const { state: next, outcome } = resolveServiceJob(stateWith(job), job.id, CONTEXT)
      expect(outcome).toBe('paid')
      const perGroup = Math.round(next.reputationPoints / 3)
      expect(next.specialty.body).toBe(perGroup)
      expect(next.specialty.suspension).toBe(perGroup)
      expect(next.specialty.wheels).toBe(perGroup)
      // Untouched groups are never affected.
      expect(next.specialty.engine).toBe(0)
      expect(next.specialty.drivetrain).toBe(0)
      expect(next.specialty.interior).toBe(0)
    })

    it('failure splits the penalty across the same three groups, subtracting from whatever specialty was already there', () => {
      const job = activeJob(mixedType, { parts: mintCarParts({ panels: 'poor' }) }) // undone -> failed
      const starting = testSpecialty({ body: 50, suspension: 50, wheels: 50 })
      const { state: next, outcome } = resolveServiceJob(
        stateWith(job, { specialty: starting }),
        job.id,
        CONTEXT,
      )
      expect(outcome).toBe('failed')
      const penalty = reputationForFailure(job.baseReputation)
      const perGroup = Math.round(penalty / 3)
      expect(next.specialty.body).toBe(50 - perGroup)
      expect(next.specialty.suspension).toBe(50 - perGroup)
      expect(next.specialty.wheels).toBe(50 - perGroup)
      expect(next.specialty.engine).toBe(0) // untouched group, unaffected either way
    })

    it("the per-group floor clamps at 0, mirroring applyReputationDelta's own clamp", () => {
      const job = activeJob(mixedType, { parts: mintCarParts({ panels: 'poor' }) })
      const { state: next } = resolveServiceJob(stateWith(job), job.id, CONTEXT) // starts all-zero
      expect(next.specialty.body).toBe(0)
      expect(next.specialty.suspension).toBe(0)
      expect(next.specialty.wheels).toBe(0)
    })
  })

  describe('topSpecialtyGroup', () => {
    it('defaults to engine (first in declared order) at all-zero', () => {
      expect(topSpecialtyGroup(freshSpecialty())).toBe('engine')
    })

    it('picks the strict max, breaking ties by declared order (engine, drivetrain, suspension, wheels, body, interior)', () => {
      expect(topSpecialtyGroup(testSpecialty({ wheels: 30, body: 50 }))).toBe('body')
      // A tie between suspension and wheels: suspension declared first, wins.
      expect(topSpecialtyGroup(testSpecialty({ suspension: 40, wheels: 40 }))).toBe('suspension')
    })
  })

  describe('pickServiceJobTemplate, the offer bias', () => {
    it('at all-zero specialty is mathematically identical to a plain rng.pick (same single draw, same mapping)', () => {
      const candidates = SERVICE_JOB_TYPES.filter((t) => t.tier === 1)
      for (let seed = 1; seed <= 50; seed++) {
        const picked = pickServiceJobTemplate(
          candidates,
          freshSpecialty(),
          CONTEXT,
          createRng(seed),
        )
        const expected = createRng(seed).pick(candidates)
        expect(picked.id).toBe(expected.id)
      }
    })

    it('measurably favors the top specialty line: engine-primary templates draw more often at high engine specialty (> 1.2x, a conservative bound)', () => {
      const candidates = SERVICE_JOB_TYPES.filter((t) => t.tier === 1)
      const isEnginePrimary = (t: ServiceJobType) => taskGroup(t.tasks[0]!, CONTEXT) === 'engine'
      const N = 2000
      let zeroCount = 0
      let highCount = 0
      for (let seed = 1; seed <= N; seed++) {
        if (
          isEnginePrimary(
            pickServiceJobTemplate(candidates, freshSpecialty(), CONTEXT, createRng(seed)),
          )
        ) {
          zeroCount++
        }
        if (
          isEnginePrimary(
            pickServiceJobTemplate(
              candidates,
              testSpecialty({ engine: 100 }),
              CONTEXT,
              createRng(seed),
            ),
          )
        ) {
          highCount++
        }
      }
      expect(zeroCount).toBeGreaterThan(0) // sanity: engine templates are actually in the tier-1 pool
      expect(highCount / zeroCount).toBeGreaterThan(1.2)
    })

    it('never excludes anything: every template still weighs >= 1 regardless of specialty', () => {
      const candidates = SERVICE_JOB_TYPES.filter((t) => t.tier === 1)
      const isEnginePrimary = (t: ServiceJobType) => taskGroup(t.tasks[0]!, CONTEXT) === 'engine'
      const picked = new Set<ServiceJobType>()
      for (let seed = 1; seed <= 500; seed++) {
        picked.add(
          pickServiceJobTemplate(
            candidates,
            testSpecialty({ engine: 100 }),
            CONTEXT,
            createRng(seed),
          ),
        )
      }
      // A non-engine tier-1 template must still appear sometimes - bias
      // reweights, it never zeroes anything out.
      expect([...picked].some((t) => !isEnginePrimary(t))).toBe(true)
    })
  })

  describe('the in-lane payout premium and specialty-copy flavor swap', () => {
    /** A context whose only candidate template is `templateId` - eliminates
     * template-choice randomness entirely (a 1-candidate pool always picks
     * that candidate, see the pickServiceJobTemplate unit test above), so
     * every other rng draw (model, car generation) stays byte-identical
     * across two runs and only the margin/description can differ. */
    function singleTemplateContext(templateId: string) {
      const only = SERVICE_JOB_TYPES.filter((t) => t.id === templateId)
      return buildSimContext(
        CARS,
        PARTS,
        BUYERS,
        PARTS_TAXONOMY,
        only,
        FACILITIES,
        SERVICE_JOB_CUSTOMER_NAMES,
      )
    }

    it('multiplies payout and swaps the flavor line when the offer stays wholly in the top line, above threshold (single-group template)', () => {
      // cooling-system-service: engine-only (repair cooling), tier 1.
      const context = singleTemplateContext('cooling-system-service')
      let sawHigherPayout = false
      for (let day = 1; day <= 30; day++) {
        const zero = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          testToolTiers(),
          'legend',
          freshSpecialty(),
        )
        const high = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          testToolTiers(),
          'legend',
          testSpecialty({ engine: 100 }),
        )
        expect(high.length).toBe(zero.length) // the count roll is unaffected by specialty
        for (let i = 0; i < zero.length; i++) {
          expect(context.specialtyCopy.engine.lines).toContain(high[i]!.description)
          // Some rolled cars already have a fine+ cooling part (nothing to
          // charge, payout floors at the flat calloutFeeYen either way) -
          // the premium has nothing to multiply on those days, so only
          // assert strictly-higher where there was real cost to begin with.
          if (zero[i]!.payoutYen > context.economy.serviceJobs.calloutFeeYen) {
            expect(high[i]!.payoutYen).toBeGreaterThan(zero[i]!.payoutYen)
            sawHigherPayout = true
          }
        }
      }
      expect(sawHigherPayout).toBe(true) // sanity: this seed range actually rolled real cost
    })

    it('does not apply below premiumThresholdPoints', () => {
      const context = singleTemplateContext('cooling-system-service')
      const belowThreshold = context.economy.specialty.premiumThresholdPoints - 1
      let compared = false
      for (let day = 1; day <= 30; day++) {
        const zero = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          testToolTiers(),
          'legend',
          freshSpecialty(),
        )
        const justUnder = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          testToolTiers(),
          'legend',
          testSpecialty({ engine: belowThreshold }),
        )
        for (let i = 0; i < zero.length; i++) {
          expect(justUnder[i]!.payoutYen).toBe(zero[i]!.payoutYen)
          compared = true
        }
      }
      expect(compared).toBe(true)
    })

    it('does not apply to a template spanning more than one group, even with that specialty maxed', () => {
      // put-her-in-a-ditch: body + suspension + wheels - never "in lane" for
      // any single specialty, however high. Its repair tasks are minToolTier
      // 2 in both touched groups (Sprint 37 content), so the tool-tier
      // ceiling must actually be met or the offer rule excludes it entirely.
      const context = singleTemplateContext('put-her-in-a-ditch')
      const readyTiers = testToolTiers({ body: 2, suspension: 2 })
      let compared = false
      for (let day = 1; day <= 30; day++) {
        const zero = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          readyTiers,
          'legend',
          freshSpecialty(),
        )
        const high = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          readyTiers,
          'legend',
          testSpecialty({ body: 100 }),
        )
        for (let i = 0; i < zero.length; i++) {
          expect(high[i]!.payoutYen).toBe(zero[i]!.payoutYen)
          compared = true
        }
      }
      expect(compared).toBe(true)
    })
  })

  describe('zero-specialty regression: byte-identical to pre-Sprint-38 behavior', () => {
    it('generateDailyServiceJobOffers with all-zero specialty produces the identical sequence as omitting the parameter (its default)', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const withDefault = generateDailyServiceJobOffers(CONTEXT, seed, 10, createRng(seed))
        const explicitZero = generateDailyServiceJobOffers(
          CONTEXT,
          seed,
          10,
          createRng(seed),
          Infinity,
          testToolTiers(),
          'legend',
          freshSpecialty(),
        )
        expect(explicitZero).toEqual(withDefault)
      }
    })
  })
})

describe('techniques and the derived shop title (Sprint 39)', () => {
  /** A context whose only candidate template is the one real signature
   * template under test - eliminates template-choice randomness (a
   * 1-candidate offerable pool always picks it), matching the Sprint 38
   * single-template-context test pattern. */
  function singleSignatureContext(templateId: string) {
    const only = SERVICE_JOB_TYPES.filter((t) => t.id === templateId)
    return buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      only,
      FACILITIES,
      SERVICE_JOB_CUSTOMER_NAMES,
    )
  }

  describe('requiresTechnique gates offer generation and accept', () => {
    // full-blueprint-build: engine-only, requiresTechnique blueprint-building
    // (threshold 120), every task minToolTier 3.
    const READY_TIERS = testToolTiers({ engine: 3 })

    it('is never offered below the technique threshold, and is offered once it clears', () => {
      const context = singleSignatureContext('full-blueprint-build')
      let sawOfferAbove = false
      for (let day = 1; day <= 100; day++) {
        const below = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          READY_TIERS,
          'legend',
          testSpecialty({ engine: 119 }),
        )
        expect(below).toEqual([])
        const above = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          READY_TIERS,
          'legend',
          testSpecialty({ engine: 120 }),
        )
        if (above.length > 0) sawOfferAbove = true
      }
      expect(sawOfferAbove).toBe(true)
    })

    it('a template whose requiresTechnique points to an unknown id is never offered (fails closed)', () => {
      const brokenTemplate: ServiceJobType = {
        ...SERVICE_JOB_TYPES.find((t) => t.id === 'full-blueprint-build')!,
        id: 'broken-signature',
        requiresTechnique: 'does-not-exist',
      }
      const context = buildSimContext(
        CARS,
        PARTS,
        BUYERS,
        PARTS_TAXONOMY,
        [brokenTemplate],
        FACILITIES,
        SERVICE_JOB_CUSTOMER_NAMES,
      )
      for (let day = 1; day <= 30; day++) {
        const offers = generateDailyServiceJobOffers(
          context,
          day,
          10,
          createRng(day),
          Infinity,
          READY_TIERS,
          'legend',
          testSpecialty({ engine: 999 }),
        )
        expect(offers).toEqual([])
      }
    })

    it("accept refuses (reason 'technique') below the threshold, even for an already-generated offer", () => {
      const context = singleSignatureContext('full-blueprint-build')
      const template = SERVICE_JOB_TYPES.find((t) => t.id === 'full-blueprint-build')!
      const offer = { ...activeJob(template), dueOnDay: null }
      const state = {
        ...createInitialGameState(context, 1),
        toolTiers: READY_TIERS,
        specialty: testSpecialty({ engine: 50 }),
        serviceJobOffers: [offer],
      }
      const result = resolveAcceptServiceJob(state, offer.id, context)
      expect(result.state.activeServiceJobs).toHaveLength(0)
      expect(result.log).toEqual([
        { type: 'acquisition-blocked', kind: 'service-accept', reason: 'technique' },
      ])
    })

    it('accepts once specialty clears the threshold', () => {
      const context = singleSignatureContext('full-blueprint-build')
      const template = SERVICE_JOB_TYPES.find((t) => t.id === 'full-blueprint-build')!
      const offer = { ...activeJob(template), dueOnDay: null }
      const state = {
        ...createInitialGameState(context, 1),
        toolTiers: READY_TIERS,
        specialty: testSpecialty({ engine: 120 }),
        serviceJobOffers: [offer],
      }
      const result = resolveAcceptServiceJob(state, offer.id, context)
      expect(result.state.activeServiceJobs).toHaveLength(1)
    })
  })

  describe('shopTitle', () => {
    it('is null below titleThresholdPoints', () => {
      const state = {
        ...createInitialGameState(CONTEXT, 1),
        specialty: testSpecialty({ engine: 79 }),
      }
      expect(shopTitle(state, CONTEXT)).toBeNull()
    })

    it('is the top group once it clears the threshold', () => {
      const state = {
        ...createInitialGameState(CONTEXT, 1),
        specialty: testSpecialty({ engine: 80 }),
      }
      expect(shopTitle(state, CONTEXT)).toBe('engine')
    })

    it('ties break by declared group order, same as topSpecialtyGroup', () => {
      const state = {
        ...createInitialGameState(CONTEXT, 1),
        specialty: testSpecialty({ suspension: 90, wheels: 90 }),
      }
      expect(shopTitle(state, CONTEXT)).toBe('suspension')
    })

    it('overtaking another line flips the title to the new top group', () => {
      const before = {
        ...createInitialGameState(CONTEXT, 1),
        specialty: testSpecialty({ engine: 90 }),
      }
      expect(shopTitle(before, CONTEXT)).toBe('engine')
      const after = { ...before, specialty: testSpecialty({ engine: 90, body: 100 }) }
      expect(shopTitle(after, CONTEXT)).toBe('body')
    })
  })

  describe('unlockedTechniques', () => {
    it('is empty at all-zero specialty', () => {
      const state = { ...createInitialGameState(CONTEXT, 1), specialty: freshSpecialty() }
      expect(unlockedTechniques(state, CONTEXT)).toEqual([])
    })

    it('includes exactly the techniques whose threshold is cleared, nothing more', () => {
      const state = {
        ...createInitialGameState(CONTEXT, 1),
        specialty: testSpecialty({ engine: 120, drivetrain: 50 }),
      }
      expect(unlockedTechniques(state, CONTEXT).map((t) => t.id)).toEqual(['blueprint-building'])
    })

    it('reflects the real technique catalog', () => {
      expect(TECHNIQUES.length).toBe(6)
    })
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
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.serviceJobOffers).toHaveLength(1)
    expect(result.state.activeServiceJobs).toHaveLength(0)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-parking' },
    ])
  })

  /**
   * Sprint 36: acceptance is gated by tool-tier deficits (the offer rule's
   * accept half) - an upgrade-hint offer is refused until the line is
   * upgraded, then accepted, with the deficit re-checked live.
   */
  it("refuses (reason 'tool-tier') while a task's minToolTier exceeds the line's tier, and accepts once upgraded", () => {
    const template = { ...twoRepairType, tasks: raiseMinToolTier(twoRepairType, 2) }
    const offer = { ...activeJob(template), tasks: template.tasks, dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
    }
    const refused = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(refused.state.serviceJobOffers).toHaveLength(1)
    expect(refused.state.activeServiceJobs).toHaveLength(0)
    expect(refused.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'tool-tier' },
    ])

    const upgraded = {
      ...state,
      toolTiers: testToolTiers({ wheels: 2, suspension: 2 }),
    }
    const accepted = resolveAcceptServiceJob(upgraded, offer.id, CONTEXT)
    expect(accepted.state.activeServiceJobs).toHaveLength(1)
  })

  it('accepts a fresh-game (all-tier-1) offer outright when every task is minToolTier 1', () => {
    // installType (coilover-install) is a real Sprint 37 tier-1 template:
    // every task's minToolTier is 1, so a brand-new shop (all lines at 1)
    // has zero deficits and accept succeeds immediately.
    const offer = { ...activeJob(installType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.activeServiceJobs).toHaveLength(1)
  })

  it("refuses a fresh-game offer whose real content minToolTier exceeds tier 1 (reason 'tool-tier')", () => {
    // mixedType (put-her-in-a-ditch) is a real Sprint 37 tier-2 template:
    // its repair tasks are minToolTier 2, so a brand-new shop can't accept
    // it yet - proof the offer rule is enforced against REAL content, not
    // just the synthetic raiseMinToolTier fixtures above.
    const offer = { ...activeJob(mixedType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
    }
    const result = resolveAcceptServiceJob(state, offer.id, CONTEXT)
    expect(result.state.activeServiceJobs).toHaveLength(0)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'service-accept', reason: 'tool-tier' },
    ])
  })
})

describe('service jobs in advanceDay', () => {
  it('accepting claims a parking slot and stamps the deadline from the (delayed) arrival day', () => {
    const offer = { ...activeJob(twoRepairType), dueOnDay: null }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      serviceJobOffers: [offer],
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
