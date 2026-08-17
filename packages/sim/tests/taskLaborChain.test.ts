import { BUYERS, CARS, FACILITIES, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { externalBlockersFor, removeAssemblyLaborSlotsFor } from '../src/assemblies'
import { planPartRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { installLaborSlotsFor, machineGateGroupFor, machineLaborMultiplier } from '../src/jobs'
import { createInitialGameState } from '../src/newGame'
import { taskLaborChain } from '../src/taskLaborChain'
import { buildCarInstance, mintCarParts, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)

describe('taskLaborChain (Sprint 207)', () => {
  it("a deep bench-repair task (camsTiming) prices its whole physical chain - blockers, the engine pull, the climb, and the refit - at the shop's own machine multiplier, matching the sprint finding's ~30/~58 points", () => {
    const startBand = 'poor'
    const targetBand = 'fine'
    const car = buildCarInstance({ parts: mintCarParts({ camsTiming: startBand }) })

    const engineAssembly = CONTEXT.assembliesById.engineAssembly!
    const blockers = externalBlockersFor(engineAssembly, CONTEXT)
    const entry = CONTEXT.partsTaxonomyById.camsTiming!
    const catalogPart = CONTEXT.partsById[car.parts.camsTiming.installed!.partId]!
    const climbPoints = planPartRepair(
      startBand,
      targetBand,
      1,
      entry,
      catalogPart.priceYen,
      CONTEXT.economy.restoration.repairStepFraction,
      CONTEXT.economy.energy.energyPerBandStepByToolTier,
    ).laborSlotsRequired

    const withEngineMachine = {
      ...createInitialGameState(CONTEXT, 1),
      toolTiers: testToolTiers({ engine: 2 }),
    }
    const machineLess = createInitialGameState(CONTEXT, 1)

    for (const state of [withEngineMachine, machineLess]) {
      // Every external blocker is ungated for either operation on real
      // content, so its removal and its (free, unchanged) refit both stand
      // at the base rate regardless of the shop's own engine machine.
      const expectedBlockerPoints = blockers.reduce((sum, blockerId) => {
        const removeMultiplier = machineLaborMultiplier(
          machineGateGroupFor(blockerId, 'remove', CONTEXT),
          state,
          CONTEXT,
        )
        const refitMultiplier = machineLaborMultiplier(
          machineGateGroupFor(blockerId, 'install', CONTEXT),
          state,
          CONTEXT,
        )
        return (
          sum +
          CONTEXT.economy.energy.actionPoints.removePart * removeMultiplier +
          CONTEXT.economy.energy.actionPoints.refitUnchangedMember * refitMultiplier
        )
      }, 0)
      const assemblyMultiplier = machineLaborMultiplier('engine', state, CONTEXT)
      const expectedRemovalPoints =
        removeAssemblyLaborSlotsFor(car, engineAssembly, CONTEXT) * assemblyMultiplier
      // camsTiming is an engineAssembly member, so its refit prices the flat
      // `refitAssembly` figure at the assembly's own gate (sprint212.md task
      // A), not its own class-based install rate - it only coincidentally
      // equals `energyByClass.buried` at the shipped tuning (both 6).
      const expectedRefitPoints =
        CONTEXT.economy.energy.actionPoints.refitAssembly * assemblyMultiplier
      const expectedTotalPoints =
        expectedBlockerPoints + expectedRemovalPoints + climbPoints + expectedRefitPoints

      const chain = taskLaborChain(car, 'camsTiming', targetBand, CONTEXT, state)
      expect(chain.blockerPoints).toBe(expectedBlockerPoints)
      expect(chain.removalPoints).toBe(expectedRemovalPoints)
      expect(chain.workPoints).toBe(climbPoints)
      expect(chain.refitPoints).toBe(expectedRefitPoints)
      expect(chain.totalPoints).toBe(expectedTotalPoints)
      expect(chain.totalSlots).toBeCloseTo(
        expectedTotalPoints / CONTEXT.economy.energy.pointsPerLabour,
      )
    }

    // The finding's own pinned figures (sprint207.md): 30 points with the
    // engine machine line, 58 without, of an 80-point day
    // (economy.energy.basePoolPoints). Sprint213.md item 4 trimmed tier-1's
    // `energyPerBandStepByToolTier` 5 -> 4 - the repair CLIMB is always
    // priced at level 1 regardless of the shop's own tools (`repairClimbPoints`'s
    // own doc comment), so both figures drop by the same 2 points (one fewer
    // point per grade step, over the 2-grade poor->fine climb here).
    expect(
      taskLaborChain(car, 'camsTiming', targetBand, CONTEXT, withEngineMachine).totalPoints,
    ).toBe(28)
    expect(taskLaborChain(car, 'camsTiming', targetBand, CONTEXT, machineLess).totalPoints).toBe(56)
    expect(CONTEXT.economy.energy.basePoolPoints).toBe(80)
  })

  it('a no-blocker bolt-on install task on an empty, non-assembly slot costs exactly the flat install figure serviceJobCostBreakdown always charged - nothing occupies the slot, so there is nothing to pull off or clear blockers for', () => {
    const car = buildCarInstance({ parts: mintCarParts({ ignitionEcu: null }) })
    const state = createInitialGameState(CONTEXT, 1)

    const gateGroup = machineGateGroupFor('ignitionEcu', 'install', CONTEXT)
    const expectedRefitPoints =
      installLaborSlotsFor('ignitionEcu', CONTEXT) *
      machineLaborMultiplier(gateGroup, state, CONTEXT)

    const chain = taskLaborChain(car, 'ignitionEcu', 'install', CONTEXT, state)
    expect(chain.blockerPoints).toBe(0)
    expect(chain.removalPoints).toBe(0)
    expect(chain.workPoints).toBe(0)
    expect(chain.refitPoints).toBe(expectedRefitPoints)
    expect(chain.refitPoints).toBe(installLaborSlotsFor('ignitionEcu', CONTEXT)) // ungated on real content
    expect(chain.totalPoints).toBe(expectedRefitPoints)
  })
})
