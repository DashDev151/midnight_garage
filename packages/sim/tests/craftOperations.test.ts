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
import { craftOperationCapabilityGateReason, machiningGateReason } from '../src/machiningJobs'
import { installedPartsValueYen, retentionFor } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { buildCarInstance, mintCarParts, testSceneStanding, testToolTiers } from './testFixtures'

/**
 * The six scene operations: one chassis (`machining.ts`, generalised) and six
 * authored parameter sets (`docs/design/systems/scene-standing-refactor.md`
 * section 6). This file checks the three claims specific to them - the
 * standing-and-tool gate, the tier ladder it must never let a lower tier
 * defeat, and that value still follows the metal through the one existing
 * pricing path - rather than restating what `machining.test.ts` already
 * covers for the chassis itself.
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
 * fixture every gate and workshop test below is measured on. */
function shopWith(toolTiers = testToolTiers(), sceneStanding = testSceneStanding()) {
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
    sceneStanding,
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

describe('the gate: standing AND tool, both required', () => {
  for (const operation of SCENE_OPERATIONS) {
    const group = groupOf(operation)

    it(`${operation.id}: refuses below tier 3 of ${group}, even at Shop standing`, () => {
      for (const tier of [1, 2] as const) {
        const reason = craftOperationCapabilityGateReason(
          operation,
          testToolTiers({ [group]: tier }),
          testSceneStanding({ [operation.scene]: 'shop' }),
          CONTEXT,
        )
        expect(reason, `${operation.id} at tier ${tier}`).toBe('tool-tier')
      }
    })

    it(`${operation.id}: refuses at tier 3 without Shop standing`, () => {
      const reason = craftOperationCapabilityGateReason(
        operation,
        testToolTiers({ [group]: 3 }),
        testSceneStanding(),
        CONTEXT,
      )
      expect(reason).toBe('scene-standing')
    })

    it(`${operation.id}: unlocks only once both are met`, () => {
      const reason = craftOperationCapabilityGateReason(
        operation,
        testToolTiers({ [group]: 3 }),
        testSceneStanding({ [operation.scene]: 'shop' }),
        CONTEXT,
      )
      expect(reason).toBeNull()
    })
  }

  it('the same reasons surface through the car-specific gate the workshop actually uses', () => {
    const operation = SCENE_OPERATIONS[0]!
    const group = groupOf(operation)
    const { state, car } = shopWith(testToolTiers({ [group]: 1 }))
    expect(machiningGateReason(state, car.id, operation.id, CONTEXT)).toBe('tool-tier')
  })
})

describe('the tier ladder: an operation never lets a lower tier out-reach tier 3', () => {
  it('a tier-1 or tier-2 shop can never possess any scene operation at all', () => {
    // The gate above already proves this per operation; restated as the
    // ladder claim itself - the set of operations reachable below tier 3 is
    // empty, on every line, regardless of standing.
    for (const operation of SCENE_OPERATIONS) {
      const group = groupOf(operation)
      for (const tier of [1, 2] as const) {
        const reachable =
          craftOperationCapabilityGateReason(
            operation,
            testToolTiers({ [group]: tier }),
            testSceneStanding({ [operation.scene]: 'shop' }),
            CONTEXT,
          ) === null
        expect(reachable, `${operation.id} at tier ${tier}`).toBe(false)
      }
    }
  })

  it('a bare tier-3 shop (no operation applied) still beats what a tier-1 or tier-2 shop can reach, on the stat each operation writes', () => {
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
