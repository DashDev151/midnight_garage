import {
  CARS,
  fitmentClassForTier,
  PARTS,
  PARTS_TAXONOMY,
  type CarPartId,
  type ComponentId,
  type PartInstance,
  type ServiceJob,
} from '@midnight-garage/content'
import { makeCarOrigin } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/**
 * The garage logic, updated for instant actions: repair and install resolve
 * the moment they are clicked, spending whatever labour is available right now.
 * The logic is re-based on bands: a "zone" is now a group of real parts, and
 * repair climbs every non-mint, non-scrap part in it to the target band (mint
 * by default) rather than lifting one flat percent. These assert real outcomes
 * (a group actually reaches mint, stats actually change, labour is actually
 * capped), not just that methods run.
 */
describe('garage: grant + detail', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('devGrantCar adds an owned car surfaced with model, name, and stats', () => {
    const game = useGameStore()
    expect(game.ownedCarCount).toBe(0)
    game.devGrantCar(CARS[0]!.id)
    expect(game.ownedCarCount).toBe(1)
    const detailed = game.carsDetailed[0]!
    expect(detailed.model.id).toBe(CARS[0]!.id)
    expect(detailed.displayName.length).toBeGreaterThan(0)
    // Derived stats are present and finite for a granted car.
    expect(Number.isFinite(detailed.stats.power)).toBe(true)
    expect(detailed.stats.authenticity).toBeGreaterThanOrEqual(0)
  })

  it('carDetail returns undefined for a car that is not owned', () => {
    const game = useGameStore()
    expect(game.carDetail('nope')).toBeUndefined()
  })
})

describe('garage: instant repair and labor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('repairing completes and lifts the group to mint, possibly over several days', () => {
    const game = useGameStore()
    // No ownership gate exists anymore - own every shop so this test keeps its
    // old all-equipment pacing (the fastest repair level), staying a test of
    // completion mechanics rather than of tier-1 throughput.
    for (const shop of game.toolShopViews) game.devSetToolShopOwned(shop.id, true)
    // Every removable part is bench work now, so `repair()` refuses all of
    // them: the chassis is the one slot an on-car repair still climbs (it
    // never comes off, and unlike bodywork/paint its band is its own rather than
    // derived from zone state). Correlated band rolls can occasionally land it
    // mint even on a "rough" car, so retry grants until it needs work.
    const chassisBand = (carId: string) =>
      game.gameState.ownedCars.find((c) => c.id === carId)?.parts.chassis.installed?.band
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || chassisBand(car.id) === 'mint'); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car')
    expect(chassisBand(car.id)).not.toBe('mint') // generated cars are rough

    // A dev-granted car lands in parking like any real acquisition - labor
    // only reaches a car in the service bay.
    game.moveCar(car.id, 'service')
    game.repair(car.id, 'body', 'mint', 'chassis')

    // Keep ending days and re-issuing the repair click until the chassis
    // clears mint or we've clearly exceeded any reasonable career length -
    // a real regression (never finishing) fails loudly instead of hanging.
    for (let day = 0; day < 20 && chassisBand(car.id) !== 'mint'; day++) {
      game.endDay()
      game.repair(car.id, 'body', 'mint', 'chassis')
    }

    expect(chassisBand(car.id)).toBe('mint')
    // The job is consumed once complete.
    expect(game.carDetail(car.id)!.jobs).toHaveLength(0)
  })

  it('a repeat click continues the same job for a group, not a duplicate', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.repair(car.id, 'body')
    game.repair(car.id, 'body')
    expect(game.carDetail(car.id)!.jobs.length).toBeLessThanOrEqual(1)
  })

  it('never spends more than the daily labor slots across repairs in one day', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    const perDay = game.laborSlotsPerDay
    // Repair every real group instantly - collectively far more labor than one day.
    for (const componentId of ['engine', 'drivetrain', 'suspension', 'body', 'interior'] as const) {
      game.repair(car.id, componentId)
    }
    expect(game.gameState.energySpentToday).toBeLessThanOrEqual(perDay)
    expect(game.laborSlotsRemainingToday).toBeGreaterThanOrEqual(0)
  })
})

describe('garage: instant part install', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('installs a compatible part instantly, moving it to the build sheet and changing stats', () => {
    const game = useGameStore()
    // Find a real power part and a model whose tags satisfy its requiredTags.
    // Power has no upper clamp, so an install is guaranteed to move that axis.
    let pair:
      | { partId: string; componentId: ComponentId; carPartId: CarPartId; modelId: string }
      | undefined
    for (const part of PARTS) {
      // Any nonzero powerFraction (for any engine character) marks a real
      // power part - the fraction is authored per character, but every
      // power slot's non-stock SKU carries a positive value on all three.
      if (Object.values(part.statModifiers.powerFraction).every((v) => v === 0)) continue
      // An assembly member (block/internals, rims/tyres, gearbox/clutch) never
      // comes off the car per-part, so `removePart` can no longer open its slot
      // for this generic install mechanic. Pick a per-part-removable
      // (non-member) slot instead.
      if (game.isAssemblyMember(part.carPartId)) continue
      const model = CARS.find(
        (c) =>
          fitmentClassForTier(c.tier) === part.fitmentClass &&
          part.requiredTags.every((t) => c.tags.includes(t)),
      )
      const componentId = game.groupForCarPart(part.carPartId)
      if (model && componentId) {
        pair = { partId: part.id, componentId, carPartId: part.carPartId, modelId: model.id }
        break
      }
    }
    if (!pair) throw new Error('seed content has no compatible power part/model pair')

    game.devGrantCar(pair.modelId)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    // Clear the target slot's own blockers first (a generated car starts every
    // slot filled), and satisfy the buried-engine/drivetrain machine gate if
    // the target happens to sit behind one. Neither concerns this generic
    // "install a compatible part" mechanic, which just needs the slot open.
    const taxonomyEntry = PARTS_TAXONOMY.find((e) => e.id === pair.carPartId)!
    for (const blockerId of taxonomyEntry.blockedBy) {
      game.removePart(car.id, blockerId)
    }
    if (taxonomyEntry.depthClass === 'buried') {
      game.devSetToolTier(pair.componentId, 2)
    }
    // Every slot starts filled with a stock part by default. Empty this one
    // first so the group-level install has somewhere to land.
    game.removePart(car.id, pair.carPartId)
    // A buried target plus its blockers can spend more than one day's labour
    // budget on removal alone. End the day so the install below gets a fresh
    // budget rather than silently starving.
    game.endDay()
    game.devGrantPart(pair.partId)
    const partInstance = game.gameState.partInventory.at(-1)!

    const powerBefore = game.carDetail(car.id)!.stats.power
    // The compatibility filter offers exactly this part for its group.
    const offered = game.installablePartsFor(car.id, pair.componentId)
    expect(offered.some((pi) => pi.id === partInstance.id)).toBe(true)

    game.install(car.id, pair.componentId, partInstance.id) // a single-part job, completes instantly

    const after = game.gameState.ownedCars[0]!
    expect(after.parts[pair.carPartId].installed?.partId).toBe(pair.partId)
    // Consumed from inventory - only the displaced stock part (dropped by
    // removePart above) is left.
    expect(game.gameState.partInventory.some((pi) => pi.id === partInstance.id)).toBe(false)
    expect(game.carDetail(car.id)!.stats.power).toBeGreaterThan(powerBefore)
  })

  it('installablePartsFor is empty while every slot in the group is occupied, and offers a fitting part once one opens up', () => {
    const game = useGameStore()
    // CARS[0] (honda-city-e-aa) is 'entry' tier - the part must match.
    const part = PARTS.find(
      (p) => p.carPartId === 'seats' && p.grade !== 'stock' && p.fitmentClass === 'entry',
    )!
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    // Interior work is body-shop work (sprint212.md: interior and aero
    // belong to the body bay), not the service bay.
    game.moveCarToSlot(car.id, 'body', 0)
    // Generation fills every slot by default - the whole `interior` group
    // (seats, dashGauges) starts fully occupied.
    expect(game.installablePartsFor(car.id, 'interior')).toEqual([])

    game.removePart(car.id, 'seats')
    game.devGrantPart(part.id)
    const partInstance = game.gameState.partInventory.at(-1)!
    // `seats` is open again - the group as a whole now accepts a fitting install.
    expect(
      game.installablePartsFor(car.id, 'interior').some((pi) => pi.id === partInstance.id),
    ).toBe(true)

    // seats is an interior signature slot - the install needs the line
    // hired for today (a fresh shop owns nothing at tier 2).
    game.hireToolLine('interior')
    game.install(car.id, 'interior', partInstance.id)
    // Filled again - `dashGauges` is still occupied too, so the group is
    // fully occupied once more.
    expect(game.installablePartsFor(car.id, 'interior')).toEqual([])
  })

  it("installablePartsFor excludes a customer-owned tagged part on any car but the owning job's own (the close-out escape TODO.md flagged)", () => {
    const game = useGameStore()
    // CARS[0] (honda-city-e-aa) is 'entry' tier - the part must match.
    const part = PARTS.find(
      (p) => p.carPartId === 'seats' && p.grade !== 'stock' && p.fitmentClass === 'entry',
    )!
    game.devGrantCar(CARS[0]!.id)
    const ownCar = game.gameState.ownedCars[0]!
    game.devGrantCar(CARS[0]!.id)
    const customerCar = game.gameState.ownedCars[1]!
    game.removePart(ownCar.id, 'seats')
    game.removePart(customerCar.id, 'seats')
    game.devGrantPart(part.id)
    const granted = game.gameState.partInventory.at(-1)!
    // Ownership is read from the instance's own `origin` against every active
    // service job, not a mutable `customerJobId` tag. The instance's origin
    // must trace to the owning job's car for the "not this car" refusal below
    // to have anything real to refuse.
    const tagged: PartInstance = {
      ...granted,
      origin: makeCarOrigin(customerCar.id, 'Customer Car', 0),
    }

    const fakeJob: ServiceJob = {
      id: 'svc-fake',
      typeId: 'small-bodywork-touchup',
      customerName: 'Test Customer',
      description: 'test fixture',
      tasks: [],
      car: customerCar,
      payoutYen: 1,
      baseReputation: 1,
      deadlineDays: 1,
      expiresOnDay: 999,
      arrivesOnDay: null,
      dueOnDay: 1,
    }
    game.gameState = {
      ...game.gameState,
      partInventory: [tagged],
      activeServiceJobs: [fakeJob],
    }

    expect(game.installablePartsFor(ownCar.id, 'interior').some((pi) => pi.id === tagged.id)).toBe(
      false,
    )
    expect(
      game.installablePartsFor(customerCar.id, 'interior').some((pi) => pi.id === tagged.id),
    ).toBe(true)
  })
})

describe('garage: assembly remove/refit gate on labour, not just structure', () => {
  beforeEach(() => setActivePinia(createPinia()))

  // Both ops are atomic (`resolveRemoveAssembly`/`resolveRefitAssembly` refuse
  // outright over budget, never partially completing), so a row that only
  // checked structure would enable a button whose click then did nothing at
  // all - the bug this closes.

  it('canRemove is false and the row names the shortfall when today has less labour than removal costs', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    // Drain the day's whole labour pool before ever touching the assembly.
    game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }

    const row = game.assemblyRowsFor(car.id).find((r) => r.assemblyId === 'wheelAssembly')!
    expect(row.onBench).toBe(false)
    expect(row.removeLabourPoints).toBeGreaterThan(0) // rims + tyres both present
    expect(row.canRemove).toBe(false)
    expect(row.blockedReason).toBe(`Needs ${row.removeLabourPoints} labour, only 0 left today`)

    // The button being disabled is only half the fix - the click itself must
    // still refuse, not silently spend what it cannot afford.
    expect(game.removeAssembly(car.id, 'wheelAssembly')).toBe(false)
    expect(game.gameState.ownedCars[0]!.parts.rims.installed).not.toBeNull()
    expect(game.gameState.ownedCars[0]!.parts.tyres.installed).not.toBeNull()
  })

  it('canRefit is false and the row names the shortfall when a changed member makes today refuse the refit', () => {
    const game = useGameStore()
    // Retry until the granted car's rims start below mint, so there is a real
    // rung to recondition - a mint rim would leave nothing to change and the
    // refit would price free by equivalence, proving nothing about labour.
    // (Rims, not tyres: tyres are a non-repairable consumable and never offer
    // a recondition step at any band.)
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || car.parts.rims.installed!.band === 'mint'); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car')
    game.moveCar(car.id, 'service')

    expect(game.removeAssembly(car.id, 'wheelAssembly')).toBe(true)
    const container = game.benchContainersFor(car.id).find((c) => c.assemblyId === 'wheelAssembly')!
    const rimsMember = container.members.find((m) => m.carPartId === 'rims')!
    const rimsId = rimsMember.instance!.id
    // A stand is not a bench: the member comes out into the warehouse, goes on
    // the workshop floor's bench, is worked there, and goes back into the
    // assembly. Reconditioning moves it off its vacated baseline, so the refit
    // can no longer price this member free by equivalence.
    expect(game.removeAssemblyMember(container.id, 'rims')).toBe(true)
    game.gameState = { ...game.gameState, workbenchPartId: rimsId }
    game.reconditionPart(rimsId, game.nextReconditionStep(rimsId)!.targetBand)
    game.gameState = { ...game.gameState, workbenchPartId: null }
    expect(game.fitAssemblyMember(container.id, 'rims', rimsId)).toBe(true)

    // Drain the rest of the day's labour before attempting the refit.
    game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }

    const row = game.assemblyRowsFor(car.id).find((r) => r.assemblyId === 'wheelAssembly')!
    expect(row.onBench).toBe(true)
    expect(row.refitLabourPoints).toBeGreaterThan(0)
    expect(row.canRefit).toBe(false)
    expect(row.blockedReason).toBe(`Needs ${row.refitLabourPoints} labour, only 0 left today`)

    expect(game.refitAssembly(car.id, 'wheelAssembly')).toBe(false)
    // Still on the bench - the refit never happened.
    expect(game.benchContainersFor(car.id).some((c) => c.assemblyId === 'wheelAssembly')).toBe(true)
    const afterCar = game.gameState.ownedCars.find((c) => c.id === car.id)!
    expect(afterCar.parts.rims.installed).toBeNull()
  })
})
