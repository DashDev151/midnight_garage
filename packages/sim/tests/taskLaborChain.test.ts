import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  WORKBENCH,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { externalBlockersFor, removeAssemblyLaborSlotsFor } from '../src/assemblies'
import { buildSimContext } from '../src/context'
import { installLaborSlotsFor } from '../src/jobs'
import { taskLaborChain } from '../src/taskLaborChain'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)

describe('taskLaborChain', () => {
  it('a deep bench-repair task (camsTiming) prices its whole physical chain - blockers, the engine pull, the rebuild recipe, and the refit - at base rate', () => {
    const car = buildCarInstance({ parts: mintCarParts({ camsTiming: 'poor' }) })
    const engineAssembly = CONTEXT.assembliesById.engineAssembly!
    const { actionPoints, energyPerStepPoints, pointsPerLabour } = CONTEXT.economy.energy

    const expectedBlockerPoints = externalBlockersFor(engineAssembly, CONTEXT).reduce(
      (sum) => sum + actionPoints.removePart + actionPoints.refitUnchangedMember,
      0,
    )
    const expectedRemovalPoints = removeAssemblyLaborSlotsFor(car, engineAssembly, CONTEXT)
    // The bench job IS its recipe: camsTiming's Rebuild is two steps.
    const expectedWorkPoints = WORKBENCH.recipes.camsTiming!.rebuild.length * energyPerStepPoints
    // camsTiming is an engineAssembly member, so its refit prices the flat
    // `refitAssembly` figure the whole unit costs to put back, not its own
    // class-based install rate.
    const expectedRefitPoints = actionPoints.refitAssembly
    const expectedTotalPoints =
      expectedBlockerPoints + expectedRemovalPoints + expectedWorkPoints + expectedRefitPoints

    const chain = taskLaborChain(car, 'camsTiming', 'rebuild', CONTEXT)
    expect(chain.blockerPoints).toBe(expectedBlockerPoints)
    expect(chain.removalPoints).toBe(expectedRemovalPoints)
    expect(chain.workPoints).toBe(expectedWorkPoints)
    expect(chain.refitPoints).toBe(expectedRefitPoints)
    expect(chain.totalPoints).toBe(expectedTotalPoints)
    expect(chain.totalSlots).toBeCloseTo(expectedTotalPoints / pointsPerLabour)

    // 28 points of an 80-point day: 6 clearing the three external blockers, 8
    // pulling the engine, 8 on the two Rebuild steps, 6 putting it back.
    expect(chain.totalPoints).toBe(28)
    expect(CONTEXT.economy.energy.basePoolPoints).toBe(80)
  })

  it('the chain never reads the shop: a Restore and a Rebuild differ only by their own recipes', () => {
    const car = buildCarInstance({ parts: mintCarParts({ camsTiming: 'poor' }) })
    const { energyPerStepPoints } = CONTEXT.economy.energy
    const rebuild = taskLaborChain(car, 'camsTiming', 'rebuild', CONTEXT)
    const restore = taskLaborChain(car, 'camsTiming', 'restore', CONTEXT)
    expect(restore.totalPoints - rebuild.totalPoints).toBe(
      (WORKBENCH.recipes.camsTiming!.restore.length -
        WORKBENCH.recipes.camsTiming!.rebuild.length) *
        energyPerStepPoints,
    )
    expect(restore.blockerPoints).toBe(rebuild.blockerPoints)
    expect(restore.removalPoints).toBe(rebuild.removalPoints)
    expect(restore.refitPoints).toBe(rebuild.refitPoints)
  })

  it('a no-blocker bolt-on install task on an empty, non-assembly slot costs exactly the flat install figure - nothing occupies the slot, so there is nothing to pull off or clear blockers for', () => {
    const car = buildCarInstance({ parts: mintCarParts({ ignitionEcu: null }) })
    const expectedRefitPoints = installLaborSlotsFor('ignitionEcu', CONTEXT)

    const chain = taskLaborChain(car, 'ignitionEcu', 'install', CONTEXT)
    expect(chain.blockerPoints).toBe(0)
    expect(chain.removalPoints).toBe(0)
    expect(chain.workPoints).toBe(0)
    expect(chain.refitPoints).toBe(expectedRefitPoints)
    expect(chain.totalPoints).toBe(expectedRefitPoints)
  })

  it('a buried buy-new slot prices the same flat install figure an open one does: depth is a labour rate, never a charge', () => {
    const empty = buildCarInstance({ parts: mintCarParts({ internals: null }) })
    expect(CONTEXT.partsTaxonomyById.internals!.depthClass).toBe('buried')
    // Reaching a buried slot with no rig owned and no hire booked costs
    // `toolHire.slogMultiplier` times the labour and no money at all
    // (`accessRoute`, jobs.ts), so nothing here buys a day to get at one and
    // the chain carries no yen to buy it with.
    const chain = taskLaborChain(empty, 'internals', 'install', CONTEXT)
    expect(chain.totalPoints).toBe(installLaborSlotsFor('internals', CONTEXT))
  })
})
