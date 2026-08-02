import { CARS, ECONOMY, PARTS, PARTS_TAXONOMY, SubsystemSchema } from '@midnight-garage/content'
import { computeDerivedStats, supportRatios, supportVerdict } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

const PARTS_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part]))

/** A rotary, so the sheet's equivalent-capacity line has something to say. */
const FD = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!

type Store = ReturnType<typeof useGameStore>

/** Grants `modelId`, puts it in the service bay, and returns its id - the
 * two steps every session below needs before the rollers will take it. */
function grantCarInBay(game: Store, modelId?: string): string {
  game.devGrantCar(modelId)
  const car = game.gameState.ownedCars[game.gameState.ownedCars.length - 1]!
  game.moveCar(car.id, 'service')
  return car.id
}

describe('the rolling road in the store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a new shop has no dyno, nothing hired, and nothing on the rollers', () => {
    const game = useGameStore()
    expect(game.dynoOwned).toBe(false)
    expect(game.dynoHiredToday).toBe(false)
    expect(game.dynoSessionCarId).toBeNull()
    expect(game.dynoSheet).toBeNull()
    expect(game.dynoHireFeeYen).toBe(ECONOMY.dyno.hireFeeYen)
    expect(game.dynoPurchasePriceYen).toBe(ECONOMY.dyno.purchasePriceYen)
    expect(game.dynoMinReputationTier).toBe(ECONOMY.dyno.minReputationTier)
  })

  it('a session charges the hire, spends a labour slot, and changes nothing about the car', () => {
    const game = useGameStore()
    const carId = grantCarInBay(game)
    const before = game.gameState.ownedCars.find((c) => c.id === carId)!
    const statsBefore = game.carDetail(carId)!.stats
    const valueBefore = game.carDetail(carId)!.guideValueYen
    const warningBefore = game.carDetail(carId)!.supportReadout
    const cashBefore = game.cashYen
    const labourBefore = game.laborSlotsRemainingToday

    expect(game.runDynoSession(carId)).toBe(true)

    expect(cashBefore - game.cashYen).toBe(ECONOMY.dyno.hireFeeYen)
    expect(game.laborSlotsRemainingToday).toBe(labourBefore - game.pointsPerLabour)
    expect(game.dynoHiredToday).toBe(true)
    expect(game.dynoSessionCarId).toBe(carId)
    // The car object itself is untouched - the strongest form of "the dyno
    // never changes the car" there is.
    expect(game.gameState.ownedCars.find((c) => c.id === carId)).toBe(before)
    expect(game.carDetail(carId)!.stats).toEqual(statsBefore)
    expect(game.carDetail(carId)!.guideValueYen).toBe(valueBefore)
    expect(game.carDetail(carId)!.supportReadout).toEqual(warningBefore)
  })

  it('refuses a session with no labour left, and charges nothing for the refusal', () => {
    const game = useGameStore()
    const carId = grantCarInBay(game)
    game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }
    const cashBefore = game.cashYen

    expect(game.dynoSessionGateReason(carId)).toBe('no-labour')
    expect(game.runDynoSession(carId)).toBe(false)
    expect(game.cashYen).toBe(cashBefore)
    expect(game.dynoSessionCarId).toBeNull()
  })

  it('refuses a car that is not in a service bay', () => {
    const game = useGameStore()
    game.devGrantCar()
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'parking')
    expect(game.dynoSessionGateReason(carId)).toBe('not-in-service-bay')
    expect(game.runDynoSession(carId)).toBe(false)
  })

  it('owning one ends the fee, and buying it after hiring stops the charge', () => {
    const game = useGameStore()
    const carId = grantCarInBay(game)
    game.devGiveCash(ECONOMY.dyno.purchasePriceYen)
    game.devSetReputationTier(ECONOMY.dyno.minReputationTier)

    expect(game.runDynoSession(carId)).toBe(true)
    expect(game.dynoHiredToday).toBe(true)

    expect(game.buyDyno()).toBe(true)
    expect(game.dynoOwned).toBe(true)
    expect(game.dayLog).toContainEqual({
      type: 'dyno-bought',
      priceYen: ECONOMY.dyno.purchasePriceYen,
    })

    // A fresh day, a fresh labour pool: the session now costs labour only.
    game.gameState = { ...game.gameState, day: game.gameState.day + 1, energySpentToday: 0 }
    const cashBefore = game.cashYen
    expect(game.runDynoSession(carId)).toBe(true)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('gates the purchase on reputation', () => {
    const game = useGameStore()
    game.devGiveCash(ECONOMY.dyno.purchasePriceYen)
    game.devSetReputationTier('unknown')
    expect(game.dynoPurchaseGateReason).toBe('reputation')
    expect(game.buyDyno()).toBe(false)
    expect(game.dynoOwned).toBe(false)

    game.devSetReputationTier(ECONOMY.dyno.minReputationTier)
    expect(game.dynoPurchaseGateReason).toBeNull()
    expect(game.buyDyno()).toBe(true)
  })

  it("the sheet's numbers are the sim's numbers, never a second interpretation", () => {
    const game = useGameStore()
    const carId = grantCarInBay(game, FD.id)
    expect(game.runDynoSession(carId)).toBe(true)

    const sheet = game.dynoSheet!
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    const ratios = supportRatios(car, FD, PARTS_BY_ID, ECONOMY)
    const verdict = supportVerdict(car, FD, PARTS_BY_ID, ECONOMY)
    const stats = computeDerivedStats(FD, car, PARTS_BY_ID, PARTS_TAXONOMY, ECONOMY)

    expect(sheet.carId).toBe(carId)
    expect(sheet.rows).toHaveLength(SubsystemSchema.options.length)
    for (const row of sheet.rows) {
      expect(row.ratio).toBe(ratios[row.subsystem])
      expect(row.weakest).toBe(row.subsystem === verdict.subsystem)
      // Labelled, never a raw id.
      expect(row.label).not.toBe(row.subsystem)
    }
    expect(sheet.headlineRatio).toBe(verdict.headline)
    expect(sheet.band).toBe(verdict.band)
    expect(sheet.powerPs).toBe(stats.power)
    expect(sheet.stockPowerPs).toBe(FD.spec.stockPowerPs)
    expect(sheet.powerDeltaPs).toBe(stats.power - FD.spec.stockPowerPs)
    expect(sheet.reliability).toBe(stats.reliability)
    expect(sheet.reliabilityBase).toBe(FD.spec.reliabilityBase)
  })

  it("shows a rotary's equivalent capacity rather than applying it silently", () => {
    const game = useGameStore()
    const carId = grantCarInBay(game, FD.id)
    expect(game.runDynoSession(carId)).toBe(true)

    const sheet = game.dynoSheet!
    expect(sheet.rotaryEquivalent).toBe(true)
    expect(sheet.displacementCc).toBe(FD.spec.displacementCc)
    expect(sheet.effectiveDisplacementCc).toBeGreaterThan(sheet.displacementCc!)
    expect(sheet.specificOutputPsPerLitre).toBeCloseTo(
      FD.spec.stockPowerPs / (sheet.effectiveDisplacementCc! / 1000),
      10,
    )
  })

  it('splits the reliability the build is carrying, and the split adds back', () => {
    const game = useGameStore()
    const carId = grantCarInBay(game)
    expect(game.runDynoSession(carId)).toBe(true)

    const sheet = game.dynoSheet!
    const total =
      sheet.reliability +
      sheet.conditionCostPoints +
      sheet.coherenceCostPoints +
      sheet.powerCostPoints
    // Every figure is presented in whole points, so the four tie to the car's
    // own ceiling within one point of rounding; the exact identity is pinned
    // on the unrounded derivation in `packages/sim/tests/dyno.test.ts`.
    expect(Math.abs(total - sheet.reliabilityBase)).toBeLessThanOrEqual(1)
  })

  it('takes the car off the rollers at the day boundary', () => {
    const game = useGameStore()
    const carId = grantCarInBay(game)
    expect(game.runDynoSession(carId)).toBe(true)
    expect(game.dynoSessionCarId).toBe(carId)

    game.endDay()
    expect(game.dynoSessionCarId).toBeNull()
    expect(game.dynoSheet).toBeNull()
    expect(game.dynoHiredToday).toBe(false)
  })
})
