import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  fitmentClassForTier,
  type BuyerArchetype,
  type CarInstance,
  type ComponentId,
  type MachiningOperation,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats, machiningCost } from '../src/derivedStats'
import {
  machiningHandlingFractionOf,
  machiningOf,
  machiningPowerFractionOf,
} from '../src/machining'
import {
  craftOperationCapabilityGateReason,
  fittedMachiningGateReason,
  fittedMachiningOffersFor,
  machiningGateReason,
  machiningReadingFor,
  resolveFittedMachiningLabor,
} from '../src/machiningJobs'
import { installedPartsValueYen, retentionFor } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import {
  buildCarInstance,
  mintCarParts,
  testToolLevels,
  testToolShopsOwned,
  testToolTiers,
} from './testFixtures'

/**
 * The six scene operations: one chassis (`machining.ts`, generalised) and six
 * authored parameter sets. This file checks the three claims specific to them -
 * the tool gate, the ladder it must never let a lower level defeat, and that
 * value still follows the metal through the one existing pricing path - rather
 * than restating what `machining.test.ts` already covers for the chassis
 * itself.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, SERVICE_JOB_TYPES, FACILITIES)
const SCENE_OPERATIONS = ECONOMY.machining.operations.filter(
  (o): o is MachiningOperation & { scene: BuyerArchetype } => o.scene !== undefined,
)

const MODEL = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!

function groupOf(operation: MachiningOperation): ComponentId {
  return PARTS_TAXONOMY.find((entry) => entry.id === operation.carPartId)!.group
}

/** A fresh career with one stock, all-mint car in the service bay - the one
 * fixture every gate and workshop test below is measured on. Scene standing is
 * left at the new-career floor throughout, because no operation reads it. */
function shopWith(toolShopsOwned: string[] = [], toolTiers = testToolTiers()) {
  const car = buildCarInstance({ id: 'craft-car-0001', modelId: MODEL.id })
  const state = {
    ...createInitialGameState(CONTEXT, 1),
    cashYen: 5_000_000,
    ownedCars: [car],
    serviceBayCarIds: [car.id],
    parkingCarIds: [],
    forecourtCarIds: [],
    graceParkingCarId: null,
    toolTiers,
    toolShopsOwned,
  }
  return { car, state }
}

/**
 * A car with a race-grade turbo fitted and nothing else supporting it, so
 * cylinder pressure is the weakest link - the one fixture a `spec`-only
 * operation (nothing else the ladder test writes) has anything to move,
 * mirroring `machining.test.ts`'s own `strainedCar` for the same reason: a
 * support gain bought on a subsystem that was never the constraint changes
 * nothing visible, on a stock car or otherwise.
 */
function strainedCar(): CarInstance {
  const fitmentClass = fitmentClassForTier(MODEL.tier)
  const turbo = PARTS.find(
    (part) =>
      part.carPartId === 'forcedInduction' &&
      part.grade === 'race' &&
      part.fitmentClass === fitmentClass &&
      part.zoneId == null,
  )!
  return buildCarInstance({
    modelId: MODEL.id,
    parts: mintCarParts({
      forcedInduction: {
        id: 'strain-turbo',
        partId: turbo.id,
        band: 'mint',
        origin: { kind: 'market', day: 1 },
      },
    }),
  })
}

/** The base car one operation's own ladder check should start from - the
 * plain stock car for every operation that writes a headline stat directly;
 * the strained car above for the one that only writes `spec`, which needs a
 * real constraint to move at all; and a car with some ordinary wear for
 * sorting, whose whole point is a slot reading better than a fully-mint car
 * would already show. */
function baseCarFor(operation: MachiningOperation): CarInstance {
  if (operation.id === 'period-correct-restoration') return strainedCar()
  if (operation.id === 'sorting') {
    return buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ block: 'worn', internals: 'worn' }),
    })
  }
  return buildCarInstance({ modelId: MODEL.id })
}

/** `car` with `operationId` recorded on whatever is fitted in its own slot -
 * the state a finished operation leaves behind. */
function withOperationApplied(car: CarInstance, operation: MachiningOperation): CarInstance {
  const carPartId = operation.carPartId
  const installed = car.parts[carPartId].installed!
  return {
    ...car,
    parts: {
      ...car.parts,
      [carPartId]: {
        ...car.parts[carPartId],
        installed: { ...installed, machining: [...machiningOf(installed), operation.id] },
      },
    },
  }
}

describe('the six scene operations', () => {
  it('is exactly one operation per scene, each on its own slot', () => {
    expect(SCENE_OPERATIONS).toHaveLength(6)
    expect(new Set(SCENE_OPERATIONS.map((o) => o.scene)).size).toBe(6)
  })

  it('costs the same labour as the original operations, and no money at all', () => {
    for (const operation of SCENE_OPERATIONS) {
      expect(operation.labourPoints, operation.id).toBe(5)
    }
  })

  it('offers the matching service job for every one of the six', () => {
    for (const operation of SCENE_OPERATIONS) {
      const template = SERVICE_JOB_TYPES.find((t) => t.requiresOperationId === operation.id)
      expect(template, `${operation.id} has no matching service job`).toBeDefined()
    }
  })
})

describe('the gate: tools, and nothing else', () => {
  for (const operation of SCENE_OPERATIONS) {
    const group = groupOf(operation)

    it(`${operation.id}: refuses below level 3 of ${group}`, () => {
      for (const level of [1, 2] as const) {
        const reason = craftOperationCapabilityGateReason(
          operation,
          testToolLevels({ [group]: level }),
          CONTEXT,
        )
        expect(reason, `${operation.id} at level ${level}`).toBe('tool-tier')
      }
    })

    it(`${operation.id}: unlocks on the tools alone, with the scene still at none`, () => {
      const { state } = shopWith(testToolShopsOwned(group))
      expect(state.sceneStanding[operation.scene], 'the scene is untouched').toBe('none')
      expect(
        craftOperationCapabilityGateReason(operation, testToolLevels({ [group]: 3 }), CONTEXT),
      ).toBeNull()
    })
  }

  it('the same reasons surface through the part-specific gate the workshop actually uses', () => {
    const operation = SCENE_OPERATIONS[0]!
    const { state } = shopWith()
    // The machine shop works a loose part, so the gate is asked about one
    // sitting on the machine rather than about a car.
    const sku = CONTEXT.stockPartByCarPartId[fitmentClassForTier(MODEL.tier)][operation.carPartId]!
    const instance = {
      id: 'pi-craft-part',
      partId: sku.id,
      band: 'mint' as const,
      origin: { kind: 'market' as const, day: 1 },
    }
    const onMachine = { ...state, partInventory: [instance], machinePartId: instance.id }
    expect(machiningGateReason(onMachine, instance.id, operation.id, CONTEXT)).toBe('tool-tier')
  })
})

describe('the ladder: an operation never lets a lower level out-reach level 3', () => {
  it('a line still on its own rungs can never possess any scene operation at all', () => {
    // The gate above already proves this per operation; restated as the
    // ladder claim itself - the set of operations reachable below level 3 is
    // empty, on every line.
    for (const operation of SCENE_OPERATIONS) {
      const group = groupOf(operation)
      for (const level of [1, 2] as const) {
        const reachable =
          craftOperationCapabilityGateReason(
            operation,
            testToolLevels({ [group]: level }),
            CONTEXT,
          ) === null
        expect(reachable, `${operation.id} at level ${level}`).toBe(false)
      }
    }
  })

  it('a shop with no operation applied still beats what a rung-only line can reach, on the stat each operation writes', () => {
    // Even setting the gate aside, the raw magnitude a lower tier COULD
    // reach (nothing, since it cannot apply the operation) is naturally
    // below what tier 3 reaches once it can - checked directly on the
    // derived stat rather than assumed from the gate alone.
    for (const operation of SCENE_OPERATIONS) {
      const base = baseCarFor(operation)
      const withOp = withOperationApplied(base, operation)
      const before = computeDerivedStats(MODEL, base, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
      const after = computeDerivedStats(MODEL, withOp, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
      const moved =
        after.power !== before.power ||
        after.handling !== before.handling ||
        after.style !== before.style ||
        after.reliability !== before.reliability
      expect(moved, `${operation.id} moved nothing`).toBe(true)
    }
  })
})

describe('value follows the metal, through the one existing pricing path', () => {
  const retention = retentionFor(1, ECONOMY)

  for (const operation of SCENE_OPERATIONS) {
    it(`${operation.id}: raises the part's own price by exactly the authored premium, on the car`, () => {
      const plain = buildCarInstance({ modelId: MODEL.id })
      const withOp = withOperationApplied(plain, operation)
      const plainValue = installedPartsValueYen(plain, CONTEXT.partsById, retention, ECONOMY)
      const machinedValue = installedPartsValueYen(withOp, CONTEXT.partsById, retention, ECONOMY)
      const part = CONTEXT.partsById[plain.parts[operation.carPartId].installed!.partId]!
      const expectedPremium = Math.round(
        part.priceYen * ECONOMY.machining.valuePremiumPerOperation * retention,
      )
      expect(machinedValue - plainValue).toBe(expectedPremium)
    })

    it(`${operation.id}: costs its authored authenticity rating on a stock part, nothing more`, () => {
      const plain = buildCarInstance({ modelId: MODEL.id })
      const withOp = withOperationApplied(plain, operation)
      expect(machiningCost(withOp, CONTEXT.partsById, ECONOMY)).toBe(operation.authenticityCost)
    })
  }
})

describe('sorting: reliability past what the condition band implies', () => {
  const sorting = SCENE_OPERATIONS.find((o) => o.id === 'sorting')!

  it('raises reliability on an otherwise-worn car without touching any band', () => {
    const worn = buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts({ block: 'worn', internals: 'worn' }),
    })
    const before = computeDerivedStats(MODEL, worn, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    const sorted = withOperationApplied(worn, sorting)
    const after = computeDerivedStats(MODEL, sorted, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    expect(after.reliability).toBeGreaterThan(before.reliability)
  })
})

/**
 * Setup work: the operations that can only be judged with the car assembled,
 * so they are addressed by car and slot rather than by a part on the machine.
 * One mechanism, two address kinds - what changes is where the work happens
 * and what it is quoted against, never what it costs or what it does.
 *
 * Underglow is the one that carries no `scene`, so it is read from the whole
 * catalogue below rather than from `SCENE_OPERATIONS`.
 */
describe('setup work is done on the car, not at the machine', () => {
  const SETUP_IDS = ['corner-weighting', 'show-fitment', 'underglow'] as const

  it('is exactly those three operations, and every other one is done with the part off', () => {
    const fitted = ECONOMY.machining.operations.filter((o) => o.performedOn === 'fitted-part')
    expect(fitted.map((o) => o.id).sort()).toEqual([...SETUP_IDS].sort())
    for (const operation of ECONOMY.machining.operations) {
      if ((SETUP_IDS as readonly string[]).includes(operation.id)) continue
      expect(operation.performedOn, operation.id).toBe('loose-part')
    }
  })

  for (const operationId of SETUP_IDS) {
    const operation = ECONOMY.machining.operations.find((o) => o.id === operationId)!
    const group = groupOf(operation)

    it(`${operationId}: the machine shop will not quote it, whatever is on the machine`, () => {
      const { state } = shopWith(testToolShopsOwned(group, 'engine'))
      const sku =
        CONTEXT.stockPartByCarPartId[fitmentClassForTier(MODEL.tier)][operation.carPartId]!
      const instance = {
        id: 'pi-setup-part',
        partId: sku.id,
        band: 'mint' as const,
        origin: { kind: 'market' as const, day: 1 },
      }
      const onMachine = { ...state, partInventory: [instance], machinePartId: instance.id }
      // Not a cut this room makes: the part is the right one and the tools are
      // there, and the machine still refuses it.
      expect(machiningGateReason(onMachine, instance.id, operationId, CONTEXT)).toBe(
        'unknown-operation',
      )
      expect(
        machiningReadingFor(onMachine, CONTEXT)!.offers.map((o) => o.operation.id),
      ).not.toContain(operationId)
    })

    it(`${operationId}: answers to its own tool line, never the engine's`, () => {
      const { car, state } = shopWith(testToolShopsOwned(group))
      expect(fittedMachiningGateReason(state, car.id, operationId, CONTEXT)).toBeNull()

      const noLine = shopWith(testToolShopsOwned('engine'), testToolTiers({ [group]: 2 }))
      expect(fittedMachiningGateReason(noLine.state, noLine.car.id, operationId, CONTEXT)).toBe(
        'tool-tier',
      )
    })

    it(`${operationId}: needs the tools, the car in a bay, and something fitted in the slot`, () => {
      const shops = testToolShopsOwned(group)
      const bare = shopWith()
      expect(fittedMachiningGateReason(bare.state, bare.car.id, operationId, CONTEXT)).toBe(
        'tool-tier',
      )

      const parked = shopWith(shops)
      expect(
        fittedMachiningGateReason(
          { ...parked.state, serviceBayCarIds: [], parkingCarIds: [parked.car.id] },
          parked.car.id,
          operationId,
          CONTEXT,
        ),
      ).toBe('not-in-service-bay')

      const empty = shopWith(shops)
      const stripped: CarInstance = {
        ...empty.car,
        parts: { ...empty.car.parts, [operation.carPartId]: { installed: null } },
      }
      expect(
        fittedMachiningGateReason(
          { ...empty.state, ownedCars: [stripped] },
          stripped.id,
          operationId,
          CONTEXT,
        ),
      ).toBe('slot-empty')

      const worn = shopWith(shops)
      const tired: CarInstance = {
        ...worn.car,
        parts: mintCarParts({ [operation.carPartId]: 'worn' }),
      }
      expect(
        fittedMachiningGateReason(
          { ...worn.state, ownedCars: [tired] },
          tired.id,
          operationId,
          CONTEXT,
        ),
      ).toBe('not-mint')

      expect(fittedMachiningGateReason(parked.state, 'no-such-car', operationId, CONTEXT)).toBe(
        'no-car',
      )
    })

    it(`${operationId}: lands on the fitted part, and will not be done twice`, () => {
      const { car, state } = shopWith(testToolShopsOwned(group))
      const before = computeDerivedStats(MODEL, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
      const done = resolveFittedMachiningLabor(state, car.id, operationId, 600, CONTEXT)
      expect(done.laborSlotsUsed).toBe(operation.labourPoints)
      expect(done.state.cashYen, 'setup work costs labour and no money').toBe(state.cashYen)
      expect(done.state.jobs, 'the job opened, finished and closed').toHaveLength(0)
      expect(done.log.some((entry) => entry.type === 'part-machined')).toBe(true)

      const worked = done.state.ownedCars[0]!
      expect(machiningOf(worked.parts[operation.carPartId].installed)).toEqual([operationId])
      const after = computeDerivedStats(MODEL, worked, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
      expect(
        after.handling !== before.handling || after.style !== before.style,
        `${operationId} moved nothing on the car`,
      ).toBe(true)
      expect(machiningCost(worked, CONTEXT.partsById, ECONOMY)).toBe(operation.authenticityCost)

      expect(fittedMachiningGateReason(done.state, car.id, operationId, CONTEXT)).toBe(
        'already-applied',
      )
      const again = resolveFittedMachiningLabor(done.state, car.id, operationId, 600, CONTEXT)
      expect(again.laborSlotsUsed).toBe(0)
    })

    it(`${operationId}: a car out of the bay stalls the work rather than losing it`, () => {
      const { car, state } = shopWith(testToolShopsOwned(group))
      // One point in, then the car rolls out: the job stays open, spends
      // nothing, and finishes when the car comes back.
      const started = resolveFittedMachiningLabor(state, car.id, operationId, 1, CONTEXT)
      expect(started.laborSlotsUsed).toBe(1)
      expect(started.state.jobs).toHaveLength(1)
      const parked = {
        ...started.state,
        serviceBayCarIds: [],
        parkingCarIds: [car.id],
      }
      const stalled = resolveFittedMachiningLabor(parked, car.id, operationId, 600, CONTEXT)
      expect(stalled.laborSlotsUsed).toBe(0)
      expect(stalled.log.some((entry) => entry.type === 'job-blocked')).toBe(true)
      expect(machiningOf(stalled.state.ownedCars[0]!.parts[operation.carPartId].installed)).toEqual(
        [],
      )

      const finished = resolveFittedMachiningLabor(started.state, car.id, operationId, 600, CONTEXT)
      expect(
        machiningOf(finished.state.ownedCars[0]!.parts[operation.carPartId].installed),
      ).toEqual([operationId])
    })
  }

  it('offers each one only on its own slot, priced with what it costs and what it gives', () => {
    const { car, state } = shopWith(testToolShopsOwned('suspension', 'wheels', 'body'))
    const springs = fittedMachiningOffersFor(state, car.id, 'springs', CONTEXT)
    expect(springs.map((o) => o.operation.id)).toEqual(['corner-weighting'])
    expect(springs[0]!.handlingFraction).toBeGreaterThan(0)
    expect(springs[0]!.stylePoints).toBe(0)
    expect(springs[0]!.authenticityCost).toBe(0.25)
    expect(springs[0]!.labourPoints).toBe(5)
    expect(springs[0]!.gateReason).toBeNull()

    const rims = fittedMachiningOffersFor(state, car.id, 'rims', CONTEXT)
    expect(rims.map((o) => o.operation.id)).toEqual(['show-fitment'])
    expect(rims[0]!.stylePoints).toBe(5)
    expect(rims[0]!.handlingFraction).toBe(0)

    // Underglow answers to the body line, because `chassis` is a body part -
    // the same derivation every other operation's gate uses.
    const chassis = fittedMachiningOffersFor(state, car.id, 'chassis', CONTEXT)
    expect(chassis.map((o) => o.operation.id)).toEqual(['underglow'])
    expect(chassis[0]!.stylePoints).toBe(6)
    expect(chassis[0]!.handlingFraction).toBe(0)
    expect(chassis[0]!.authenticityCost).toBe(0.3)
    expect(chassis[0]!.gateReason).toBeNull()

    // Every other slot has nothing to set up, including the ones the machine
    // shop works.
    expect(fittedMachiningOffersFor(state, car.id, 'block', CONTEXT)).toEqual([])
    expect(fittedMachiningOffersFor(state, car.id, 'dampers', CONTEXT)).toEqual([])
  })
})

describe('race prep: coherence-supported', () => {
  const racePrep = SCENE_OPERATIONS.find((o) => o.id === 'race-prep')!
  const stockDampers = mintCarParts().dampers.installed!
  const dampersPart = PARTS.find((p) => p.id === stockDampers.partId)!

  it('scales its power and handling fractions by the coherence factor it is given', () => {
    const machined = { ...stockDampers, machining: [racePrep.id] }
    const full = machiningPowerFractionOf(machined, dampersPart, 'forced', ECONOMY, 1)
    const half = machiningPowerFractionOf(machined, dampersPart, 'forced', ECONOMY, 0.5)
    expect(half).toBeCloseTo(full / 2, 9)

    const fullHandling = machiningHandlingFractionOf(machined, dampersPart, ECONOMY, 1)
    const halfHandling = machiningHandlingFractionOf(machined, dampersPart, ECONOMY, 0.5)
    expect(halfHandling).toBeCloseTo(fullHandling / 2, 9)
  })

  it('does not scale a non-coherence-supported operation the same way', () => {
    const cornerWeighting = SCENE_OPERATIONS.find((o) => o.id === 'corner-weighting')!
    const stockSprings = mintCarParts().springs.installed!
    const springsPart = PARTS.find((p) => p.id === stockSprings.partId)!
    const machined = { ...stockSprings, machining: [cornerWeighting.id] }
    const full = machiningHandlingFractionOf(machined, springsPart, ECONOMY, 1)
    const half = machiningHandlingFractionOf(machined, springsPart, ECONOMY, 0.5)
    expect(half).toBe(full)
  })
})
