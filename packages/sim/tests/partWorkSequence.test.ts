import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats, machiningCost } from '../src/derivedStats'
import {
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveRemoveAssemblyMember,
  resolveSwapAssemblyMember,
} from '../src/assemblies'
import {
  installLaborSlotsFor,
  reconditionGateReason,
  resolveJobLabor,
  resolveReconditionLabor,
  resolveRemovePart,
} from '../src/jobs'
import { machiningOf } from '../src/machining'
import { machiningGateReason, resolveMachiningLabor } from '../src/machiningJobs'
import { installedPartsValueYen, marketValueYen, retentionFor } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { resolvePlaceOnStation, resolveTakeFromStation } from '../src/parts'
import {
  buildCarInstance,
  mintCarParts,
  testToolShopsOwned,
  testToolTiers,
  type CarPartOverride,
} from './testFixtures'

/**
 * The route a part takes to be worked on, walked end to end: off the car, into
 * the warehouse, carried to a room, worked, carried back, and refitted. Storage
 * holds parts and does no work, so this sequence is the only way anything gets
 * better, and nothing shorter than the whole of it proves the work survives the
 * trip.
 *
 * Two routes, one per room. The machine shop's, which ends with an operation on
 * the car's own metal, its originality and its value; and the workshop floor's,
 * which ends with a band that climbed. Every step is the real resolver the
 * screens call.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)
const MODEL = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!
const OPERATION = ECONOMY.machining.operations.find((o) => o.id === 'bore-and-hone')!

/** The three slots the taxonomy puts on top of the engine, which have to be off
 * before the engine assembly can come out. */
const ENGINE_COVER_SLOTS: readonly CarPartId[] = ['intake', 'exhaust', 'cooling']

/**
 * A car filled with the model's OWN fitment class of stock parts, which is what
 * every fit gate on the way back requires, with `emptySlots` genuinely empty and
 * `bands` naming any slot that starts below mint.
 */
function stockCar(
  model: CarModel,
  id: string,
  emptySlots: readonly CarPartId[] = [],
  bands: Partial<Record<CarPartId, 'poor' | 'worn' | 'fine' | 'mint'>> = {},
): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const partId of ALL_CAR_PART_IDS) {
    if (emptySlots.includes(partId)) {
      overrides[partId] = null
      continue
    }
    const part = CONTEXT.stockPartByCarPartId[fitmentClass][partId]
    if (!part) continue
    overrides[partId] = {
      id: `${id}-${partId}`,
      partId: part.id,
      band: bands[partId] ?? 'mint',
      origin: { kind: 'car', carInstanceId: id, carLabel: 'Test Car', day: 0 },
    }
  }
  return buildCarInstance({ id, modelId: model.id, parts: mintCarParts(overrides) })
}

/** A shop holding exactly `car`, in a service bay, with money and tools enough
 * that nothing below refuses for want of either. */
function shopWith(
  car: CarInstance,
  toolShopsOwned = testToolShopsOwned('engine'),
  toolTiers = testToolTiers(),
): GameState {
  return {
    ...createInitialGameState(CONTEXT, 1),
    cashYen: 5_000_000,
    ownedCars: [car],
    serviceBayCarIds: [car.id],
    parkingCarIds: [],
    forecourtCarIds: [],
    graceParkingCarId: null,
    toolShopsOwned,
    toolTiers,
  }
}

function carIn(state: GameState, carId: string): CarInstance {
  const found = state.ownedCars.find((c) => c.id === carId)
  if (!found) throw new Error(`car ${carId} is not in the shop any more`)
  return found
}

describe('the machine shop route: car, warehouse, machine, warehouse, car', () => {
  it('carries the block out, bores it, puts it back, and the work is on the car', () => {
    const car = stockCar(MODEL, 'car-sequence-0001', ENGINE_COVER_SLOTS)
    const before = shopWith(car)
    const retention = retentionFor(1, ECONOMY)
    const blockPartId = car.parts.block.installed!.partId
    const blockSku = CONTEXT.partsById[blockPartId]!
    const valueBefore = installedPartsValueYen(car, CONTEXT.partsById, retention, ECONOMY)
    const statsBefore = computeDerivedStats(MODEL, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    const marketBefore = marketValueYen(
      MODEL,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )

    // 1. The block is an engine-assembly member, so it comes off as part of the
    //    engine and is then dismounted from the container into the warehouse.
    const pulled = resolveRemoveAssembly(before, car.id, 'engineAssembly', CONTEXT)
    expect(pulled.ok, 'the engine came off').toBe(true)
    const containerId = pulled.state.assemblyInventory![0]!.id
    const dismounted = resolveRemoveAssemblyMember(pulled.state, containerId, 'block', CONTEXT)
    expect(dismounted.ok, 'the block came off the engine').toBe(true)
    const blockId = car.parts.block.installed!.id
    expect(dismounted.state.partInventory.some((p) => p.id === blockId)).toBe(true)

    // 2. In the warehouse it is still just stored. Storage does no work.
    expect(machiningGateReason(dismounted.state, blockId, OPERATION.id, CONTEXT)).toBe(
      'not-on-machine',
    )

    // 3. Carried to the machine, and cut.
    const onMachine = resolvePlaceOnStation(dismounted.state, 'machine', blockId)
    const machined = resolveMachiningLabor(onMachine, blockId, OPERATION.id, 600, CONTEXT)
    expect(machined.laborSlotsUsed).toBe(OPERATION.labourPoints)
    expect(machiningOf(machined.state.partInventory.find((p) => p.id === blockId))).toEqual([
      OPERATION.id,
    ])

    // 4. Back to the warehouse, back onto the engine, and the engine back on
    //    the car - the real bench route a member takes, not a bare install.
    const offMachine = resolveTakeFromStation(machined.state, 'machine')
    const remounted = resolveSwapAssemblyMember(offMachine, containerId, 'block', blockId, CONTEXT)
    expect(remounted.ok, 'the block went back on the engine').toBe(true)
    const refitted = resolveRefitAssembly(remounted.state, containerId, CONTEXT)
    expect(refitted.ok, 'the engine went back on the car').toBe(true)
    expect(refitted.state.assemblyInventory ?? []).toHaveLength(0)

    // 5. The work is on the car's own fitted part, and reached both derivations
    //    that read machining.
    const after = carIn(refitted.state, car.id)
    const installed = after.parts.block.installed!
    expect(installed.id, 'the same block went back on').toBe(blockId)
    expect(machiningOf(installed)).toEqual([OPERATION.id])

    expect(machiningCost(after, CONTEXT.partsById, ECONOMY)).toBe(OPERATION.authenticityCost)
    const statsAfter = computeDerivedStats(MODEL, after, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    expect(
      statsAfter.authenticity,
      `originality ${statsBefore.authenticity} -> ${statsAfter.authenticity}`,
    ).toBeLessThan(statsBefore.authenticity)

    const valueAfter = installedPartsValueYen(after, CONTEXT.partsById, retention, ECONOMY)
    const marketAfter = marketValueYen(
      MODEL,
      after,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    expect(
      valueAfter - valueBefore,
      `fitted-parts value ${valueBefore} -> ${valueAfter}, whole car ${marketBefore} -> ${marketAfter}`,
    ).toBe(Math.round(blockSku.priceYen * ECONOMY.machining.valuePremiumPerOperation * retention))
    expect(marketAfter, `whole car ${marketBefore} -> ${marketAfter}`).toBeGreaterThan(marketBefore)
  })
})

describe('the workshop floor route: car, warehouse, bench, warehouse, car', () => {
  it('carries the steering out, rebuilds it, puts it back, and the band climbed on the car', () => {
    const car = stockCar(MODEL, 'car-sequence-0002', [], { steering: 'poor' })
    const before = shopWith(car, [], testToolTiers({ suspension: 2 }))
    const steeringId = car.parts.steering.installed!.id

    const pulled = resolveRemovePart(before, car.id, 'steering', CONTEXT, 600)
    expect(pulled.laborSlotsUsed).toBe(ECONOMY.energy.actionPoints.removePart)
    expect(carIn(pulled.state, car.id).parts.steering.installed).toBeNull()

    // The warehouse holds it and does no work: the bench is a place to go.
    expect(reconditionGateReason(pulled.state, steeringId)).toBe('not-on-workbench')
    const onBench = resolvePlaceOnStation(pulled.state, 'workbench', steeringId)
    expect(reconditionGateReason(onBench, steeringId)).toBeNull()

    const rebuilt = resolveReconditionLabor(onBench, steeringId, 'mint', 600, CONTEXT)
    expect(rebuilt.laborSlotsUsed).toBeGreaterThan(0)
    expect(rebuilt.state.partInventory.find((p) => p.id === steeringId)!.band).toBe('mint')

    const offBench = resolveTakeFromStation(rebuilt.state, 'workbench')
    const refitted = resolveJobLabor(
      offBench,
      {
        carInstanceId: car.id,
        kind: 'install-part',
        componentId: 'suspension',
        partInstanceId: steeringId,
        laborSlotsRequired: installLaborSlotsFor('steering', CONTEXT),
      },
      600,
      CONTEXT,
    )

    const after = carIn(refitted.state, car.id)
    const installed = after.parts.steering.installed!
    expect(installed.id, 'the same steering went back on').toBe(steeringId)
    expect(installed.band, 'poor came off, mint went back on').toBe('mint')
    expect(refitted.state.partInventory.some((p) => p.id === steeringId)).toBe(false)
    // The part left the warehouse for a car slot, so the bench is clear again.
    expect(refitted.state.workbenchPartId).toBeNull()
  })
})
