import { CARS, ECONOMY, PARTS, type StaffMember } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { useGameStore } from './gameStore'

/** A benched crew member with a given body skill and trait. */
function benchedBody(id: string, body: number, trait: StaffMember['trait']): StaffMember {
  return {
    id,
    displayName: `Name ${id}`,
    stats: { engine: 1, chassis: 1, body },
    laborSlotsPerDay: 2,
    assignment: 'bench',
    pendingAssignment: null,
    weeklyWageYen: 20000,
    trait,
  }
}

/**
 * An aftermarket (non-stock) catalog part for this slot. Every part fits any
 * car of the right CLASS now, so this just needs to avoid the stock grade
 * (already occupying every slot by default). Pinned to `shitbox` - every car
 * this file grants (honda-city-e-aa and suzuki-wagon-r-ct21s) is that tier.
 */
function untaggedPartFor(carPartId: string) {
  return PARTS.find(
    (p) => p.carPartId === carPartId && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
  )!
}

describe('staged repair/install work', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('staging and unstaging a repair cost nothing', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const cashBefore = game.cashYen

    expect(
      game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' }),
    ).toBe(true)
    expect(game.stagedActionsFor(carId)).toEqual([
      { kind: 'repair', componentId: 'body', targetBand: 'mint' },
    ])
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.jobs).toHaveLength(0) // nothing real yet

    game.unstageAction(carId, 'body')
    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(game.cashYen).toBe(cashBefore)
  })

  it('the planned estimate sums the labour the planned work will actually cost', () => {
    const game = useGameStore()
    // A car whose body group has a real tier-1 repair step (below the fine
    // ceiling), so a genuine plan exists. A `fine` group has no further "+" at
    // tier 1, so gate on the step existing, not merely on the band being
    // non-mint.
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || game.nextRepairStep(car.id, 'body') == null); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car needing body repair')
    const carId = car.id

    expect(game.carDetail(carId)!.plannedEstimate).toBeNull() // nothing planned yet

    const step = game.nextRepairStep(carId, 'body')!
    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: step.targetBand })

    const estimate = game.carDetail(carId)!.plannedEstimate!
    // The estimate's planned labour equals the plan's own labour figure (the
    // same accounting confirmStagedWork uses), and rides beside the yen total.
    expect(estimate.plannedLaborSlots).toBe(step.laborSlotsRequired)
    expect(estimate.plannedLaborSlots).toBeGreaterThan(0)
    expect(estimate.plannedRepairCostYen).toBe(step.costYen)
  })

  it('refuses to stage over a component with an open job', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // Inject an open job directly rather than depending on this car's rolled
    // bands and today's labor budget happening to leave one incomplete.
    game.gameState = {
      ...game.gameState,
      jobs: [
        {
          id: 'job-test-body',
          carInstanceId: carId,
          kind: 'repair-zone',
          componentId: 'body',
          targetBand: 'mint',
          laborSlotsRequired: 3,
          laborSlotsSpent: 1,
        },
      ],
    }

    expect(
      game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' }),
    ).toBe(false)
  })

  it('re-staging over an already-staged component replaces it', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const componentId = 'suspension'
    game.removePart(carId, 'dampers')
    const partA = untaggedPartFor('dampers')
    game.devGrantPart(partA.id)
    const partAInstanceId = game.gameState.partInventory.at(-1)!.id

    game.stageAction(carId, { kind: 'install', componentId, partInstanceId: partAInstanceId })
    expect(game.isPartStagedAnywhere(partAInstanceId)).toBe(true)

    // Staging a repair over the same component displaces the install stage -
    // the displaced part becomes stageable again.
    game.stageAction(carId, { kind: 'repair', componentId, targetBand: 'mint' })
    expect(game.stagedActionsFor(carId)).toEqual([
      { kind: 'repair', componentId, targetBand: 'mint' },
    ])
    expect(game.isPartStagedAnywhere(partAInstanceId)).toBe(false)
  })

  it('a part staged on one car is unavailable to stage on another until unstaged', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
    const [carA, carB] = game.gameState.ownedCars
    const componentId = 'suspension'
    game.removePart(carA!.id, 'dampers')
    game.removePart(carB!.id, 'dampers')
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory.at(-1)!.id

    expect(game.stageAction(carA!.id, { kind: 'install', componentId, partInstanceId })).toBe(true)
    expect(game.stageableParts.some((p) => p.instance.id === partInstanceId)).toBe(false)
    expect(game.stageAction(carB!.id, { kind: 'install', componentId, partInstanceId })).toBe(false)

    game.unstageAction(carA!.id, componentId)
    expect(game.stageableParts.some((p) => p.instance.id === partInstanceId)).toBe(true)
    expect(game.stageAction(carB!.id, { kind: 'install', componentId, partInstanceId })).toBe(true)
  })

  it('confirmCarWork resolves every staged action through the real job/labor system, then clears the list', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'service')

    const componentId = 'suspension'
    game.removePart(carId, 'dampers')
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory.at(-1)!.id
    game.stageAction(carId, { kind: 'install', componentId, partInstanceId })

    game.confirmCarWork(carId)

    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(game.gameState.ownedCars[0]!.parts.dampers.installed?.id).toBe(partInstanceId)
    // Only the displaced stock dampers instance (dropped by removePart
    // above) is left - the confirmed install consumed the granted part.
    expect(game.gameState.partInventory.some((pi) => pi.id === partInstanceId)).toBe(false)
  })

  it('confirmCarWork starts a staged repair at tier 1 with nothing upgraded', () => {
    const game = useGameStore()
    // Correlated band rolls can land a group with no tier-1 repair step even on
    // a rough car. Retry grants until the body group has a real "+" step below
    // the fine ceiling. A `fine` group offers none at tier 1.
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || game.nextRepairStep(car.id, 'body') == null); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car')
    game.moveCar(car.id, 'service')
    const cashBefore = game.cashYen
    // A tier-1 repair finishes at fine, so stage to the reachable ceiling. The
    // claim under test is unchanged - the repair really starts and charges cash,
    // no equipment gate blocks it.
    game.stageAction(car.id, { kind: 'repair', componentId: 'body', targetBand: 'fine' })

    game.confirmCarWork(car.id)

    expect(game.stagedActionsFor(car.id)).toEqual([])
    // The repair really started: the group's repair bill was charged (no
    // consumables fee). No refusal path exists anymore - nothing gets
    // job-blocked.
    expect(game.cashYen).toBeLessThan(cashBefore)
    expect(game.dayLog.some((e) => e.type === 'job-blocked')).toBe(false)
  })

  it('selling the car drops its staged work', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })

    // Selling now goes through a live pending offer rather than an instant
    // roll. Inject one directly (same pattern the "open job" test above uses)
    // rather than depending on the probabilistic daily draw.
    game.gameState = {
      ...game.gameState,
      carsForSale: [{ carInstanceId: carId, sinceDay: game.gameState.day }],
      pendingOffers: [{ carInstanceId: carId, buyerId: 'first-timer', priceYen: 300_000 }],
    }
    game.acceptOffer(carId)

    expect(game.gameState.stagedCarWork[carId]).toBeUndefined()
  })

  it('refuses to stage a part onto a component it does not fit', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // An engine-only part staged onto suspension - a real mismatch.
    const wrongPart = PARTS.find((p) => p.carPartId === 'ignitionEcu')!
    game.devGrantPart(wrongPart.id)
    const partInstanceId = game.gameState.partInventory[0]!.id

    expect(
      game.stageAction(carId, { kind: 'install', componentId: 'suspension', partInstanceId }),
    ).toBe(false)
    expect(game.stagedActionsFor(carId)).toEqual([])
  })

  it('the staged-work map survives a save round-trip', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })

    const decoded = decodeSave(encodeSave(game.gameState))
    expect(decoded.stagedCarWork).toEqual(game.gameState.stagedCarWork)
  })
})

describe('planned estimate crew effects (Sprint 82 decisions 2 + 5)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function stagedBodyToMint() {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars[0]!
    // Deterministic multi-rung body plan: the whole group at poor, climbing to
    // mint, so the base plan is several slots and a discount genuinely bites.
    for (const partId of ['panels', 'paint', 'underbody', 'aero'] as const) {
      const installed = car.parts[partId].installed
      if (installed) car.parts[partId] = { installed: { ...installed, band: 'poor' } }
    }
    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })
    return { game, carId }
  }

  it('a benched skilled hand shaves labour off the estimate and leaves cost untouched', () => {
    const { game, carId } = stagedBodyToMint()

    // No crew: no saving, the base figures.
    const base = game.carDetail(carId)!.plannedEstimate!
    expect(base.crewLaborSaved).toBe(0)
    expect(base.perfectionistCostSavedYen).toBe(0)
    const baseSlots = base.plannedLaborSlots
    const baseCost = base.plannedRepairCostYen
    expect(baseSlots).toBeGreaterThanOrEqual(2)

    game.gameState = { ...game.gameState, staff: [benchedBody('h', 5, 'night-owl')] }
    const withCrew = game.carDetail(carId)!.plannedEstimate!
    // The crew speed discount saves labour ENERGY - the curve value
    // (2 slots at skill 5) scaled by pointsPerLabour, clamped in energy (keep at
    // least half the base and at least one labour's worth).
    const PER = ECONOMY.energy.pointsPerLabour
    const expectedSaved = Math.min(2 * PER, Math.floor(baseSlots / 2), baseSlots - PER)
    expect(withCrew.crewLaborSaved).toBe(expectedSaved)
    expect(withCrew.plannedLaborSlots).toBe(baseSlots - expectedSaved)
    // Speed only: the repair cash cost is unchanged without a perfectionist.
    expect(withCrew.plannedRepairCostYen).toBe(baseCost)
    expect(withCrew.perfectionistCostSavedYen).toBe(0)
  })

  it('a benched perfectionist spends a saved slot and discounts the repair cash cost', () => {
    const { game, carId } = stagedBodyToMint()
    const baseCost = game.carDetail(carId)!.plannedEstimate!.plannedRepairCostYen
    const baseSlots = game.carDetail(carId)!.plannedEstimate!.plannedLaborSlots

    game.gameState = { ...game.gameState, staff: [benchedBody('p', 5, 'perfectionist')] }
    const withPerf = game.carDetail(carId)!.plannedEstimate!
    // Skill 5 saves 2 labour, the perfectionist trims one, scaled to
    // energy by pointsPerLabour and clamped as above.
    const PER = ECONOMY.energy.pointsPerLabour
    const expectedSaved = Math.min(1 * PER, Math.floor(baseSlots / 2), baseSlots - PER)
    expect(withPerf.crewLaborSaved).toBe(expectedSaved)
    const expectedCost = Math.round(baseCost * (1 - ECONOMY.staff.perfectionistPartsDiscount))
    expect(withPerf.plannedRepairCostYen).toBe(expectedCost)
    expect(withPerf.perfectionistCostSavedYen).toBe(baseCost - expectedCost)
  })
})

describe('plannedStepFor (Sprint 67 decision 1, playtest item 7)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it("reports the ROW's whole planned total, not the next rung's increment", () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars[0]!
    // Put the whole body group at `poor`, so a plan to `fine` is unambiguously
    // multi-rung (poor -> worn -> fine) - the exact shape that produced the bug.
    for (const partId of ['panels', 'paint', 'underbody', 'aero'] as const) {
      const installed = car.parts[partId].installed
      if (installed) car.parts[partId] = { installed: { ...installed, band: 'poor' } }
    }

    expect(game.plannedStepFor(carId, 'body')).toBeNull() // nothing planned yet

    // The increment ONE click buys - the number the row used to show while
    // Confirm charged for the whole plan.
    const oneRung = game.nextRepairStep(carId, 'body')
    expect(oneRung).not.toBeNull()

    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'fine' })
    const step = game.plannedStepFor(carId, 'body')
    expect(step).not.toBeNull()

    // The row's figure IS what Confirm will charge for it. With `body` the
    // only planned action, the per-car total and the per-address total are the
    // same number by construction - that is the property the decision rests
    // on. Asserted against `plannedEstimate`, which is the exact object the
    // Confirm button renders from.
    const estimate = game.carDetail(carId)!.plannedEstimate!
    expect(step!.costYen).toBe(estimate.plannedRepairCostYen)
    expect(step!.laborSlots).toBe(estimate.plannedLaborSlots)

    // And it is genuinely the multi-rung total, not one rung: strictly more
    // than the single increment the row used to display.
    expect(step!.costYen).toBeGreaterThan(oneRung!.costYen)
  })

  it('per-address totals sum to what Confirm charges across every planned row', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id

    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })
    game.stageAction(carId, { kind: 'repair', componentId: 'interior', targetBand: 'mint' })

    const rows = (['body', 'interior'] as const).map((id) => game.plannedStepFor(carId, id))
    expect(rows.every((r) => r !== null)).toBe(true)

    const summedCost = rows.reduce((n, r) => n + r!.costYen, 0)
    const summedLabor = rows.reduce((n, r) => n + r!.laborSlots, 0)
    const estimate = game.carDetail(carId)!.plannedEstimate!
    expect(summedCost).toBe(estimate.plannedRepairCostYen)
    expect(summedLabor).toBe(estimate.plannedLaborSlots)
  })

  it('addresses a per-part plan separately from its group', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id

    game.stageAction(carId, {
      kind: 'repair',
      componentId: 'body',
      targetBand: 'mint',
      carPartId: 'paint',
    })
    // The plan lives at the per-part address, so the group address is empty -
    // otherwise a group row would double-count its own part's work.
    expect(game.plannedStepFor(carId, 'body', 'paint')).not.toBeNull()
    expect(game.plannedStepFor(carId, 'body')).toBeNull()
  })
})
