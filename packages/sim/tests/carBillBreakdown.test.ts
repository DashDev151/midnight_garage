import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type CarInstance } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carOriginLabel, enforceMaxBillFraction, generateAuctionCarInstance } from '../src/auctions'
import { buildWorstCaseRawCar } from '../src/balanceProbes'
import { carCostToBandBreakdown, carCostToBandYen } from '../src/bands'
import { buildSimContext } from '../src/context'
import { expectationForCar, isOnScrapFloor } from '../src/marketValue'
import { makeCarOrigin } from '../src/provenance'
import { createRng } from '../src/rng'
import { valueLedgerFor } from '../src/valueLedger'

/**
 * The two exactness claims the opening block of a value read stands on: the
 * restoration bill really does decompose per slot (and per zone for the body),
 * and a car pinned to the scrap floor really is identifiable, because on one
 * of those every per-slot figure describes arithmetic the car is no longer
 * priced by.
 *
 * Built on `valueLedger.test.ts`'s model: the same roster sweep, the same
 * `toBe` with no tolerance, and the same two car sources (a really generated
 * lot, and the worst case the generator could produce before and after the
 * Law 2 softening pass).
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function expectBreakdownSumsToBill(car: CarInstance, modelId: string, label: string): void {
  const model = CONTEXT.modelsById[modelId]!
  for (const targetBand of ['mint', expectationForCar(model, CONTEXT.economy).band] as const) {
    const breakdown = carCostToBandBreakdown(
      car,
      model,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
      targetBand,
    )
    const billYen = carCostToBandYen(
      car,
      model,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
      targetBand,
    )
    const where = `${label} to ${targetBand}`
    expect(breakdown.totalYen, `${where}: totalYen`).toBe(billYen)
    expect(
      breakdown.lines.reduce((sum, line) => sum + line.yen, 0),
      `${where}: line sum`,
    ).toBe(billYen)
    for (const line of breakdown.lines) {
      if (!line.zones) continue
      expect(
        line.zones.reduce((sum, zone) => sum + zone.yen, 0),
        `${where}: ${line.partId} zone sum`,
      ).toBe(line.yen)
    }
  }
}

describe('carCostToBandBreakdown sums exactly to carCostToBandYen', () => {
  it.each(CARS.map((model) => [model.id] as const))(
    'the worst-case rolled %s, softened and raw',
    (modelId) => {
      const model = CONTEXT.modelsById[modelId]!
      const rawCar = buildWorstCaseRawCar(model, CONTEXT)
      const softened = enforceMaxBillFraction(
        rawCar,
        model,
        CONTEXT,
        makeCarOrigin(rawCar.id, carOriginLabel(model, rawCar.year), 0),
      )
      expectBreakdownSumsToBill(rawCar, modelId, `${modelId} raw`)
      expectBreakdownSumsToBill(softened, modelId, `${modelId} softened`)
    },
  )

  it.each(CARS.map((model) => [model.id] as const))(
    'really generated %s lots across seeds',
    (modelId) => {
      const model = CONTEXT.modelsById[modelId]!
      for (let seed = 0; seed < 5; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `bill-${modelId}-${seed}`,
          createRng(seed),
          CONTEXT,
        )
        expectBreakdownSumsToBill(car, modelId, `${modelId} seed ${seed}`)
      }
    },
  )

  it('splits the body carriers across the nine zones and nothing else', () => {
    const model = CONTEXT.modelsById[CARS[0]!.id]!
    const car = buildWorstCaseRawCar(model, CONTEXT)
    expect(car.zoneState, 'a generated car is on the zone model').toBeDefined()
    const breakdown = carCostToBandBreakdown(
      car,
      model,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
      'mint',
    )
    const zoned = breakdown.lines.filter((line) => line.zones)
    expect(zoned.map((line) => line.partId).sort()).toEqual(['bodywork', 'paint'])
    for (const line of zoned) expect(line.zones).toHaveLength(9)
  })
})

describe('isOnScrapFloor', () => {
  /** The ledger emits its 'floor' line on exactly the cars whose raw formula
   * fell under the backstop, and `valueLedger.test.ts` already holds that
   * ledger to `marketValueYen` to the yen - so agreeing with it is agreeing
   * with the price itself. */
  function ledgerShowsFloor(car: CarInstance, modelId: string): boolean {
    const model = CONTEXT.modelsById[modelId]!
    return valueLedgerFor(
      car,
      model,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    ).lines.some((line) => line.id === 'floor')
  }

  function onFloor(car: CarInstance, modelId: string): boolean {
    const model = CONTEXT.modelsById[modelId]!
    return isOnScrapFloor(
      model,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
  }

  it('agrees with the value ledger about which cars are pinned to the floor', () => {
    let anyOnFloor = false
    for (const model of CARS) {
      const rawCar = buildWorstCaseRawCar(model, CONTEXT)
      const softened = enforceMaxBillFraction(
        rawCar,
        model,
        CONTEXT,
        makeCarOrigin(rawCar.id, carOriginLabel(model, rawCar.year), 0),
      )
      for (const car of [rawCar, softened]) {
        const pinned = onFloor(car, model.id)
        expect(pinned, `${model.id}: predicate vs ledger`).toBe(ledgerShowsFloor(car, model.id))
        anyOnFloor ||= pinned
      }
    }
    expect(anyOnFloor, 'at least one roster car reaches the floor, so this is not vacuous').toBe(
      true,
    )
  })

  it('is false for every really generated lot, which the Law 2 bill guard keeps clear of it', () => {
    for (const model of CARS) {
      for (let seed = 0; seed < 5; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `floor-${model.id}-${seed}`,
          createRng(seed),
          CONTEXT,
        )
        expect(onFloor(car, model.id), `${model.id} seed ${seed}`).toBe(false)
      }
    }
  })
})
