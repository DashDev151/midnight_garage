import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  CarInstanceSchema,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type Grade,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { hasForcedInduction } from '../src/bands'
import { buildSimContext } from '../src/context'
import {
  authenticityPercentOf,
  computeDerivedStats,
  machiningCost,
  stocknessOf,
} from '../src/derivedStats'
import { carWithGrades } from './testFixtures'

/**
 * Authenticity is
 * `round(clamp((100 * stockness - machiningCost) * conditionFactor, 0, 100))`
 * (`docs/design/systems/desirability-system.md` section 3). The stat's whole
 * definition is the first test below: **an all-stock, all-mint car scores
 * exactly 100.**
 *
 * Every fixture is built through `carWithGrades`, which fits the model's own
 * fitment class from the real catalogue, so a "swapped block" here is a SKU a
 * player could genuinely buy rather than a synthetic one.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)

/** The taxonomy's own authenticity weights, read rather than restated - the
 * arithmetic below is then checked against the content, not against a second
 * copy of it. */
const WEIGHT: Readonly<Record<CarPartId, number>> = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry.statWeights.authenticity]),
) as Record<CarPartId, number>

const TOTAL_WEIGHT = ALL_CAR_PART_IDS.reduce((sum, id) => sum + WEIGHT[id], 0)

/** A forced-induction model, so every one of the 29 slots is genuinely
 * present and the denominator is the full authored 100. */
const TURBO_MODEL: CarModel = CARS.find((car) => hasForcedInduction(car))!
/** A naturally aspirated model, whose `forcedInduction` slot is legitimately
 * absent rather than missing. */
const NA_MODEL: CarModel = CARS.find((car) => !hasForcedInduction(car))!

function authenticityOf(car: CarInstance, model: CarModel = TURBO_MODEL): number {
  return computeDerivedStats(model, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY).authenticity
}

function carWith(
  gradesByPartId: Partial<Record<CarPartId, Grade>>,
  band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint' = 'mint',
  model: CarModel = TURBO_MODEL,
): CarInstance {
  return carWithGrades(model, CONTEXT, gradesByPartId, band)
}

/** `car` with `operationIds` recorded on whatever is fitted in `carPartId` -
 * the state a finished machining job leaves behind. */
function machinedCar(car: CarInstance, carPartId: CarPartId, operationIds: string[]): CarInstance {
  const installed = car.parts[carPartId].installed!
  return {
    ...car,
    parts: {
      ...car.parts,
      [carPartId]: {
        ...car.parts[carPartId],
        installed: { ...installed, machining: [...(installed.machining ?? []), ...operationIds] },
      },
    },
  }
}

/** One operation's authored authenticity rating, read from content rather
 * than restated, so this file checks the arithmetic and not a second copy of
 * the table. */
function ratingOf(operationId: string): number {
  return ECONOMY.machining.operations.find((o) => o.id === operationId)!.authenticityCost
}

describe('the authored authenticity weights', () => {
  it('cover all 28 slots and total 99, so stockness reads as a percentage', () => {
    expect(PARTS_TAXONOMY).toHaveLength(28)
    // `underbody`'s single authenticity point left with the slot; nothing
    // replaced it, so the total is one short of the round number rather than
    // exactly 100. `stocknessOf` divides by the real total present, not by a
    // hardcoded 100, so an all-stock car still reads exactly 100 per cent
    // (proved below) - this pin is a sanity count, not the formula's floor.
    expect(TOTAL_WEIGHT).toBe(99)
  })

  it('weights the heart and the skin above everything else, and the consumables at nothing', () => {
    expect(WEIGHT.block).toBe(18)
    expect(WEIGHT.paint).toBe(11)
    expect(WEIGHT.panels).toBe(11)
    expect(WEIGHT.aero).toBe(10)
    expect(WEIGHT.internals).toBe(8)
    expect(WEIGHT.rims).toBe(7)
    for (const consumable of ['tyres', 'brakePadsDiscs', 'clutch'] as const) {
      expect(WEIGHT[consumable]).toBe(0)
    }
  })
})

describe('the definition: all stock and all mint is exactly 100', () => {
  it('holds on every shipped car', () => {
    for (const model of CARS) {
      const car = carWith({}, 'mint', model)
      expect(authenticityOf(car, model), `${model.id} is not perfectly authentic`).toBe(100)
    }
  })

  it('holds through both halves independently: stockness 1 and condition factor 1', () => {
    const car = carWith({})
    expect(stocknessOf(car, TURBO_MODEL, CONTEXT.partsById, PARTS_TAXONOMY)).toBe(1)
    expect(
      authenticityPercentOf(car, TURBO_MODEL, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY),
    ).toBe(100)
  })

  it('holds on a naturally aspirated car whose forced-induction slot is legitimately absent', () => {
    const base = carWith({}, 'mint', NA_MODEL)
    const car: CarInstance = {
      ...base,
      parts: { ...base.parts, forcedInduction: { installed: null } },
    }
    // The slot drops out of BOTH sums, so the denominator is 97 and the car is
    // still perfectly original - a car that never had a turbo is not missing one.
    expect(stocknessOf(car, NA_MODEL, CONTEXT.partsById, PARTS_TAXONOMY)).toBe(1)
    expect(authenticityOf(car, NA_MODEL)).toBe(100)
  })
})

describe('what a modification costs', () => {
  it('costs nothing to replace the consumables: tyres, pads and clutch are weighted 0', () => {
    const car = carWith({ tyres: 'race', brakePadsDiscs: 'race', clutch: 'race' })
    expect(authenticityOf(car)).toBe(100)
  })

  it('costs nothing to replace everything a sane owner replaces without apology', () => {
    // The zeros in full: the three consumables above plus cooling, fuel
    // system, driveline and anti-roll bars.
    const car = carWith({
      tyres: 'race',
      brakePadsDiscs: 'race',
      clutch: 'race',
      cooling: 'race',
      fuelSystem: 'race',
      driveline: 'race',
      antiRollBars: 'race',
    })
    expect(authenticityOf(car)).toBe(100)
  })

  it('drops a block swap alone to 82, below the concours gate of 85', () => {
    const car = carWith({ block: 'race' })
    expect(authenticityOf(car)).toBe(100 - WEIGHT.block)
    expect(authenticityOf(car)).toBe(82)
    expect(authenticityOf(car)).toBeLessThan(ECONOMY.reputation.concoursSaleMinAuthenticityPercent)
  })

  it('drops a kit-and-wheels build to 83, also below the concours gate', () => {
    const car = carWith({ aero: 'race', rims: 'race' })
    expect(authenticityOf(car)).toBe(100 - WEIGHT.aero - WEIGHT.rims)
    expect(authenticityOf(car)).toBe(83)
    expect(authenticityOf(car)).toBeLessThan(ECONOMY.reputation.concoursSaleMinAuthenticityPercent)
  })

  it('drops a full engine swap with its ancillaries to 58', () => {
    // The long block plus what a real swap always drags with it.
    const car = carWith({
      block: 'race',
      internals: 'race',
      headValvetrain: 'race',
      camsTiming: 'race',
      intake: 'race',
      exhaust: 'race',
      ignitionEcu: 'race',
      forcedInduction: 'race',
      fuelSystem: 'race',
      cooling: 'race',
    })
    expect(authenticityOf(car)).toBe(58)
  })

  it('leaves a tuner exactly the body it did not touch', () => {
    // Every engine, drivetrain, suspension, wheel and interior slot swapped;
    // paint, panels, aero and chassis untouched.
    const gradesByPartId: Partial<Record<CarPartId, Grade>> = {}
    for (const partId of ALL_CAR_PART_IDS) {
      if (partId === 'paint' || partId === 'panels' || partId === 'aero') continue
      if (partId === 'chassis') continue
      gradesByPartId[partId] = 'race'
    }
    const kept = WEIGHT.paint + WEIGHT.panels + WEIGHT.aero + WEIGHT.chassis
    expect(authenticityOf(carWith(gradesByPartId))).toBe(kept)
  })
})

describe('an empty slot is not an original part', () => {
  /**
   * A missing part is not an original part, so it loses its slot's whole
   * weight out of `stockness` exactly as an aftermarket one does. It is then
   * ALSO the worst possible condition - `weightedBandFactor` scores a missing
   * part at a 0 band factor - so a stripped car reads below a modified one on
   * the same slot. Both charges are real and different: one says the car is
   * not the car it claims to be, the other says the wheels are gone.
   */
  it('counts a missing part as NOT stock, exactly like an aftermarket one', () => {
    const stock = carWith({})
    const stripped: CarInstance = {
      ...stock,
      parts: { ...stock.parts, rims: { installed: null } },
    }
    const swapped = carWith({ rims: 'race' })
    const strippedStockness = stocknessOf(stripped, TURBO_MODEL, CONTEXT.partsById, PARTS_TAXONOMY)
    expect(strippedStockness).toBeCloseTo((TOTAL_WEIGHT - WEIGHT.rims) / TOTAL_WEIGHT, 10)
    expect(strippedStockness).toBeCloseTo(
      stocknessOf(swapped, TURBO_MODEL, CONTEXT.partsById, PARTS_TAXONOMY),
      10,
    )
    expect(authenticityOf(swapped)).toBe(100 - WEIGHT.rims)
    expect(authenticityOf(stripped)).toBeLessThan(authenticityOf(swapped))
  })

  it('counts a slot the catalogue cannot resolve as NOT stock either', () => {
    const stock = carWith({})
    const unknown: CarInstance = {
      ...stock,
      parts: {
        ...stock.parts,
        rims: { installed: { ...stock.parts.rims.installed!, partId: 'no-such-sku' } },
      },
    }
    expect(authenticityOf(unknown)).toBe(100 - WEIGHT.rims)
  })
})

describe('condition bites on top of originality', () => {
  it('reads a rough all-stock car below a mint all-stock one', () => {
    const mint = carWith({}, 'mint')
    const worn = carWith({}, 'worn')
    expect(authenticityOf(worn)).toBeLessThan(authenticityOf(mint))
  })

  it('scales exactly by the value-side band factor on an all-stock car', () => {
    for (const band of ['fine', 'worn', 'poor', 'scrap'] as const) {
      expect(authenticityOf(carWith({}, band))).toBe(
        Math.round(100 * ECONOMY.bands.bandFactors[band]),
      )
    }
  })

  it('does not let a weight-0 slot move it at all, however ruined that slot is', () => {
    const mint = carWith({})
    const scrapTyres: CarInstance = {
      ...mint,
      parts: {
        ...mint.parts,
        tyres: { installed: { ...mint.parts.tyres.installed!, band: 'scrap' } },
      },
    }
    expect(authenticityOf(scrapTyres)).toBe(100)
  })
})

describe('the machining term', () => {
  it('costs zero on every car nobody has machined, so the all-stock identity is untouched', () => {
    for (const model of CARS) {
      expect(machiningCost(carWith({}, 'mint', model), CONTEXT.partsById, ECONOMY)).toBe(0)
    }
  })

  it("sums the applied operations' own ratings on the car's own parts", () => {
    const bored = machinedCar(carWith({}), 'block', ['bore-and-hone', 'decking'])
    expect(machiningCost(bored, CONTEXT.partsById, ECONOMY)).toBe(
      ratingOf('bore-and-hone') + ratingOf('decking'),
    )
    expect(authenticityOf(bored)).toBe(100 - ratingOf('bore-and-hone') - ratingOf('decking'))
  })

  it('costs 48 of the 100 points for a full engine on its own original castings', () => {
    let car = carWith({})
    for (const operation of ECONOMY.machining.operations) {
      car = machinedCar(car, operation.carPartId, [operation.id])
    }
    expect(machiningCost(car, CONTEXT.partsById, ECONOMY)).toBe(48)
    expect(authenticityOf(car)).toBe(52)
  })

  it('charges nothing at all on an aftermarket part, on every grade above stock', () => {
    for (const grade of ['street', 'sport', 'race'] as const) {
      const car = machinedCar(carWith({ block: grade }), 'block', [
        'bore-and-hone',
        'decking',
        'deck-o-ring',
      ])
      expect(machiningCost(car, CONTEXT.partsById, ECONOMY), grade).toBe(0)
    }
  })

  it("charges the full rating for the same three operations on the car's own block", () => {
    const car = machinedCar(carWith({}), 'block', ['bore-and-hone', 'decking', 'deck-o-ring'])
    expect(machiningCost(car, CONTEXT.partsById, ECONOMY)).toBe(
      ratingOf('bore-and-hone') + ratingOf('decking') + ratingOf('deck-o-ring'),
    )
  })
})

describe('no car carries a stored authenticity roll any more', () => {
  it('the schema has no field for one, so a save carrying it is stripped on parse', () => {
    const car = carWith({})
    const parsed = CarInstanceSchema.parse({ ...car, authenticityPercent: 12 })
    expect(Object.keys(parsed)).not.toContain('authenticityPercent')
    expect(authenticityOf(parsed)).toBe(100)
  })

  it('two cars with identical parts read identical authenticity, whatever else differs', () => {
    const a = carWith({ block: 'sport' })
    const b: CarInstance = { ...a, id: 'other-car', mileageKm: 250_000, provenanceNote: 'rough' }
    expect(authenticityOf(b)).toBe(authenticityOf(a))
  })
})

/**
 * A body carrier's BAND is derived from `zoneState`, but what is FITTED there
 * is a real choice, so a modified body reads as modified. `panels` and
 * `paint` both carry a real aftermarket ladder: fitting either of their
 * non-stock grades costs the slot's whole authenticity weight, and refitting
 * the stock grade wins it back. Paint's stock SKU is the car's own factory
 * finish, so the "stock grade" that wins the weight back is specifically a
 * factory-correct respray, not merely any paint job.
 */
describe('a modified body reads as modified', () => {
  it('ships an aftermarket ladder for panels and paint', () => {
    for (const carPartId of ['panels', 'paint'] as const) {
      const nonStock = PARTS.filter(
        (part) => part.carPartId === carPartId && part.grade !== 'stock',
      )
      expect(nonStock.length, `${carPartId} has no aftermarket SKU`).toBeGreaterThan(0)
    }
  })

  it('costs a fitted body kit or respray the whole authenticity weight of its slot', () => {
    expect(authenticityOf(carWith({ panels: 'sport' }))).toBe(100 - WEIGHT.panels)
    expect(authenticityOf(carWith({ paint: 'street' }))).toBe(100 - WEIGHT.paint)
    expect(authenticityOf(carWith({ panels: 'race', paint: 'street' }))).toBe(
      100 - WEIGHT.panels - WEIGHT.paint,
    )
  })

  it('wins the 11 points back by refitting the stock (factory-correct) grade', () => {
    expect(authenticityOf(carWith({ paint: 'race' }))).toBe(100 - WEIGHT.paint)
    expect(authenticityOf(carWith({ paint: 'stock' }))).toBe(100)
  })
})
