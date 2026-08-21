import {
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  type AssemblyContainer,
  type CarInstance,
  type GameState,
  type Job,
  type PartInstance,
  type ServiceJob,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { resolveBuildAssembly, resolveFitAssemblyMember } from '../src/assemblies'
import { zonePanelPart } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { completeJob, resolveRemovePart } from '../src/jobs'
import { resolveScrapPart, resolveSellPart } from '../src/parts'
import { resolvePipelineInstallPanelAction } from '../src/pipelineActions'
import { makeCarOrigin, makeMarketOrigin } from '../src/provenance'
import { benchHoldingPart, resolvePlaceOnBench } from '../src/repairJobs'
import { resolveServiceJob } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts, testGameState, zonePanelsAtGrade } from './testFixtures'

/**
 * `state.benchParts` says where a loose part physically is. Every site that
 * takes a part out of `partInventory` must therefore clear it off whatever
 * bench was holding it, or the bench keeps showing a row for a part that is
 * bolted into a car, sold, scrapped, or gone home with a customer - and hands
 * that row's job cards an instance no resolver can find.
 *
 * One test per removal site, each one proving the part really was on a bench
 * first (otherwise the assertion after it would pass on an empty bench and
 * prove nothing), plus the control: an unrelated part on the same bench is
 * left exactly where it was.
 */

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  [],
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

/** honda-city-e-aa is 'entry' tier, so every fixture part below is an entry
 * class SKU - the fitment law refuses anything else onto it. */
const MODEL_ID = 'honda-city-e-aa'

const stockEcu = CONTEXT.stockPartByCarPartId.entry!.ignitionEcu!
const stockRims = CONTEXT.stockPartByCarPartId.entry!.rims!
const stockTyres = CONTEXT.stockPartByCarPartId.entry!.tyres!
const stockDampers = CONTEXT.stockPartByCarPartId.entry!.dampers!

function loosePart(id: string, partId: string, band: PartInstance['band']): PartInstance {
  return { id, partId, band, origin: makeMarketOrigin(1) }
}

/** Puts `instance` on its own group's bench through the real placement
 * resolver, and fails loudly if the bench refused it - a test that silently
 * benched nothing would "prove" the release afterwards for free. */
function benched(state: GameState, instanceId: string): GameState {
  const placed = resolvePlaceOnBench(state, instanceId, CONTEXT)
  expect(benchHoldingPart(placed, instanceId)).not.toBeNull()
  return placed
}

describe('a part scrapped leaves the bench it was on', () => {
  it('clears the bench when the scrap merchant takes it', () => {
    const instance = loosePart('pi-scrap-ecu', stockEcu.id, 'scrap')
    const state = benched(testGameState({ partInventory: [instance] }), instance.id)

    const result = resolveScrapPart(state, instance.id, CONTEXT)

    expect(result.state.partInventory.some((p) => p.id === instance.id)).toBe(false)
    expect(benchHoldingPart(result.state, instance.id)).toBeNull()
  })
})

describe('a part sold leaves the bench it was on', () => {
  it('clears the bench when it goes over the counter', () => {
    const instance = loosePart('pi-sold-ecu', stockEcu.id, 'worn')
    const state = benched(testGameState({ partInventory: [instance] }), instance.id)

    const result = resolveSellPart(state, instance.id, CONTEXT)

    expect(result.state.partInventory.some((p) => p.id === instance.id)).toBe(false)
    expect(benchHoldingPart(result.state, instance.id)).toBeNull()
  })
})

describe('a part fitted to a car leaves the bench it was on', () => {
  const instance = loosePart('pi-fit-ecu', stockEcu.id, 'fine')

  function installJob(carInstanceId: string): Job {
    return {
      id: `job-install-${carInstanceId}`,
      carInstanceId,
      kind: 'install-part',
      componentId: 'engine',
      partInstanceId: instance.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
  }

  it('clears the bench when the install completes on an owned car', () => {
    const car: CarInstance = buildCarInstance({
      id: 'car-owned-1',
      modelId: MODEL_ID,
      parts: mintCarParts({ ignitionEcu: null }),
    })
    const state = benched(
      testGameState({
        ownedCars: [car],
        serviceBayCarIds: [car.id],
        partInventory: [instance],
      }),
      instance.id,
    )

    const result = completeJob(state, installJob(car.id), CONTEXT)

    expect(result.blockedReason).toBeNull()
    expect(result.state.ownedCars[0]?.parts.ignitionEcu.installed?.id).toBe(instance.id)
    expect(result.state.partInventory.some((p) => p.id === instance.id)).toBe(false)
    expect(benchHoldingPart(result.state, instance.id)).toBeNull()
  })

  it("clears the bench when the install completes on a customer's car", () => {
    const customerCar: CarInstance = buildCarInstance({
      id: 'car-customer-1',
      modelId: MODEL_ID,
      parts: mintCarParts({ ignitionEcu: null }),
    })
    const state = benched(
      testGameState({
        activeServiceJobs: [serviceJobFor(customerCar, 'svc-install')],
        serviceBayCarIds: [customerCar.id],
        partInventory: [instance],
      }),
      instance.id,
    )

    const result = completeJob(state, installJob(customerCar.id), CONTEXT)

    expect(result.blockedReason).toBeNull()
    expect(result.state.activeServiceJobs[0]?.car.parts.ignitionEcu.installed?.id).toBe(instance.id)
    expect(result.state.partInventory.some((p) => p.id === instance.id)).toBe(false)
    expect(benchHoldingPart(result.state, instance.id)).toBeNull()
  })

  /**
   * The symptom a stale bench entry actually produces. A part keeps its
   * instance id across a fit and a later pull (`resolveRemovePart` puts the
   * very same instance back), so a bench that never let go would take the part
   * back the moment it returned to the warehouse - laid out on a bench nobody
   * carried it to, and hidden from the warehouse browse list, which shows a
   * benched part on its bench instead.
   */
  it('does not take the part back when it is later pulled off the car again', () => {
    const car: CarInstance = buildCarInstance({
      id: 'car-roundtrip-1',
      modelId: MODEL_ID,
      parts: mintCarParts({ ignitionEcu: null }),
    })
    const state = benched(
      testGameState({
        ownedCars: [car],
        serviceBayCarIds: [car.id],
        partInventory: [instance],
      }),
      instance.id,
    )

    const fitted = completeJob(state, installJob(car.id), CONTEXT)
    const pulled = resolveRemovePart(fitted.state, car.id, 'ignitionEcu', CONTEXT)

    expect(pulled.state.partInventory.some((p) => p.id === instance.id)).toBe(true)
    expect(benchHoldingPart(pulled.state, instance.id)).toBeNull()
  })
})

describe('a part taken into an assembly leaves the bench it was on', () => {
  const rims = loosePart('pi-asm-rims', stockRims.id, 'fine')
  const tyres = loosePart('pi-asm-tyres', stockTyres.id, 'fine')

  it('clears the bench when a member is fitted into a benched assembly', () => {
    const container: AssemblyContainer = {
      id: 'assembly-build-test',
      assemblyId: 'wheelAssembly',
      members: { rims, tyres: null },
      sourceCarId: null,
    }
    const state = benched(
      testGameState({ partInventory: [tyres], assemblyInventory: [container] }),
      tyres.id,
    )

    const result = resolveFitAssemblyMember(state, container.id, 'tyres', tyres.id, CONTEXT)

    expect(result.ok).toBe(true)
    expect(result.state.partInventory.some((p) => p.id === tyres.id)).toBe(false)
    expect(benchHoldingPart(result.state, tyres.id)).toBeNull()
  })

  it('clears the bench for EVERY member a bench-built assembly takes, not just the first', () => {
    // rims and tyres both answer to the wheels line, so both are laid out on
    // the same bench - the case a single-id release would half-fix.
    const withRims = benched(testGameState({ partInventory: [rims, tyres] }), rims.id)
    const state = benched(withRims, tyres.id)

    const result = resolveBuildAssembly(
      state,
      'wheelAssembly',
      { rims: rims.id, tyres: tyres.id },
      CONTEXT,
    )

    expect(result.ok).toBe(true)
    expect(result.state.partInventory).toHaveLength(0)
    expect(benchHoldingPart(result.state, rims.id)).toBeNull()
    expect(benchHoldingPart(result.state, tyres.id)).toBeNull()
  })
})

describe('a panel hung on a body zone leaves the bench it was on', () => {
  it('clears the bench when the panel is consumed by the zone', () => {
    const bonnetPanel = zonePanelPart(CONTEXT.partsById, 'bonnet', 'entry')!
    const instance = loosePart('pi-panel-bonnet', bonnetPanel.id, 'mint')
    const zoneState: ZoneStates = {
      ...zonePanelsAtGrade('stock'),
      bonnet: { metal: 0, surface: 0, finish: 0, panelMissing: true, primed: false },
    }
    const car: CarInstance = buildCarInstance({
      id: 'car-body-1',
      modelId: MODEL_ID,
      parts: mintCarParts(),
      zoneState,
    })
    const state = benched(
      testGameState({
        ownedCars: [car],
        serviceBayCarIds: [car.id],
        bodyBayCarId: car.id,
        partInventory: [instance],
      }),
      instance.id,
    )

    const result = resolvePipelineInstallPanelAction(
      state,
      car.id,
      { kind: 'pipeline-install-panel', zoneId: 'bonnet', partInstanceId: instance.id },
      CONTEXT,
      100,
    )

    expect(result.state.partInventory.some((p) => p.id === instance.id)).toBe(false)
    expect(benchHoldingPart(result.state, instance.id)).toBeNull()
  })
})

/** A customer's own dampers, born on their own car - what the close-out
 * reconciliation keys off (`partsOriginatingFromCar`). */
function customerCarWithOwnDampers(id: string): CarInstance {
  return buildCarInstance({
    id,
    modelId: MODEL_ID,
    // springs and rims are dampers' own blockers, vacated so the pull below
    // is unblocked - nothing this test is about.
    parts: mintCarParts({
      dampers: {
        id: 'pi-customers-dampers',
        partId: stockDampers.id,
        band: 'worn',
        origin: makeCarOrigin(id, 'Test Car', 0),
      },
      springs: null,
      rims: null,
    }),
  })
}

function serviceJobFor(car: CarInstance, id: string): ServiceJob {
  return {
    id,
    typeId: 'small-bodywork-touchup',
    customerName: 'Test Customer',
    description: 'Suspension work.',
    tasks: [
      {
        kind: 'slotCondition',
        requirement: { kind: 'slotCondition', carPartId: 'ignitionEcu', minBand: 'fine' },
      },
    ],
    car,
    payoutYen: 10_000,
    baseReputation: 5,
    deadlineDays: 5,
    expiresOnDay: 30,
    arrivesOnDay: null,
    dueOnDay: 8,
  }
}

describe("a customer's part returned at close-out leaves the bench it was on", () => {
  /** Pulls the customer's own dampers off and lays them on the suspension
   * bench, which is where a player mid-job would have them. */
  function jobWithBenchedCustomerPart(jobId: string): {
    state: GameState
    jobId: string
    partInstanceId: string
  } {
    const car = customerCarWithOwnDampers(`car-${jobId}`)
    const job = serviceJobFor(car, jobId)
    const accepted = testGameState({
      activeServiceJobs: [job],
      serviceBayCarIds: [car.id],
    })
    const removed = resolveRemovePart(accepted, car.id, 'dampers', CONTEXT)
    const pulled = removed.state.partInventory[0]!
    return { state: benched(removed.state, pulled.id), jobId, partInstanceId: pulled.id }
  }

  it('clears the bench on the paid hand-back', () => {
    const { state, jobId, partInstanceId } = jobWithBenchedCustomerPart('svc-paid')

    const result = resolveServiceJob(state, jobId, CONTEXT)

    expect(result.outcome).toBe('paid')
    expect(result.state.partInventory.some((p) => p.id === partInstanceId)).toBe(false)
    expect(benchHoldingPart(result.state, partInstanceId)).toBeNull()
  })

  it('clears the bench on the failed hand-back too', () => {
    const { state, jobId, partInstanceId } = jobWithBenchedCustomerPart('svc-failed')
    // Break the one task so the job hands back unfinished: the customer's car
    // and their parts still leave, and the bench must still let go.
    const unfinished: GameState = {
      ...state,
      activeServiceJobs: state.activeServiceJobs.map((job) => ({
        ...job,
        car: {
          ...job.car,
          parts: { ...job.car.parts, ignitionEcu: { installed: null } },
        },
      })),
    }

    const result = resolveServiceJob(unfinished, jobId, CONTEXT)

    expect(result.outcome).toBe('failed')
    expect(result.state.partInventory.some((p) => p.id === partInstanceId)).toBe(false)
    expect(benchHoldingPart(result.state, partInstanceId)).toBeNull()
  })
})

describe('the control: a part still legitimately on a bench is left alone', () => {
  it('keeps the neighbouring part on the same bench when another one is sold', () => {
    const sold = loosePart('pi-neighbour-sold', stockEcu.id, 'worn')
    const staying = loosePart('pi-neighbour-staying', stockRims.id, 'poor')
    const withSold = benched(testGameState({ partInventory: [sold, staying] }), sold.id)
    const state = benched(withSold, staying.id)
    const stayingBench = benchHoldingPart(state, staying.id)

    const result = resolveSellPart(state, sold.id, CONTEXT)

    expect(benchHoldingPart(result.state, sold.id)).toBeNull()
    expect(benchHoldingPart(result.state, staying.id)).toBe(stayingBench)
    expect(result.state.partInventory.map((p) => p.id)).toEqual([staying.id])
  })

  it('leaves benchParts untouched, by reference, when the part leaving was never benched', () => {
    const onBench = loosePart('pi-untouched-bench', stockEcu.id, 'worn')
    const neverBenched = loosePart('pi-untouched-loose', stockRims.id, 'worn')
    const state = benched(testGameState({ partInventory: [onBench, neverBenched] }), onBench.id)

    const result = resolveSellPart(state, neverBenched.id, CONTEXT)

    expect(result.state.benchParts).toBe(state.benchParts)
    expect(benchHoldingPart(result.state, onBench.id)).toBe(benchHoldingPart(state, onBench.id))
  })
})
