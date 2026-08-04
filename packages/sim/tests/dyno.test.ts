import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  SubsystemSchema,
  type CarInstance,
  type CarPartId,
  type GameState,
  type Grade,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import {
  computeDerivedStats,
  effectiveDisplacementCcOf,
  engineCharacterOf,
  reliabilityBreakdownOf,
  specificOutputOf,
} from '../src/derivedStats'
import {
  displayedReliabilitySplit,
  dynoJobIdFor,
  dynoOwned,
  dynoReadingFor,
  dynoSessionCarId,
  dynoSessionGateReason,
  dynoSessionLabourPoints,
  hasDynoAccess,
  resolveBuyDyno,
  resolveDynoSession,
} from '../src/dyno'
import { marketValueYen } from '../src/marketValue'
import { supportRatios, supportVerdict } from '../src/support'
import { carWithGrades, testSceneStanding, testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const ECONOMY = CONTEXT.economy

const SILVIA = CARS.find((c) => c.id === 'nissan-180sx-rps13')!
const FD = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!
/** A naturally aspirated car whose maximal build currently lands where three
 * independent roundings disagree with the base by a point. */
const CITY = CARS.find((c) => c.id === 'honda-city-e-aa')!

/** A big turbo on a factory bottom end - the design's own collapsed build,
 * and the one where every figure the dyno reports is worth reading. */
const BARE_RACE_TURBO: Partial<Record<CarPartId, Grade>> = { forcedInduction: 'race' }

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 3,
    seed: 42,
    cashYen: 1_000_000,
    reputationTier: 'known',
    reputationPoints: 0,
    specialty: testSpecialty(),
    sceneStanding: testSceneStanding(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    forecourtBayCount: 2,
    serviceBayCarIds: [],
    parkingCarIds: [],
    forecourtCarIds: [null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
    ...overrides,
  }
}

/** A shop with one car in its one service bay, ready to go on the rollers. */
function stateWithCarInBay(car: CarInstance, overrides: Partial<GameState> = {}): GameState {
  return baseState({ ownedCars: [car], serviceBayCarIds: [car.id], ...overrides })
}

/** One session's labour, in the same energy points every action spends. */
const SESSION_LABOUR = dynoSessionLabourPoints(ECONOMY)

describe('the dyno never changes the car', () => {
  it('leaves every stat, band and value strictly identical across a session', () => {
    const car = carWithGrades(SILVIA, CONTEXT, BARE_RACE_TURBO, 'worn')
    const state = stateWithCarInBay(car)
    const statsBefore = computeDerivedStats(
      SILVIA,
      car,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    const valueBefore = marketValueYen(
      SILVIA,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    // The build is genuinely collapsed - the case where a slider would have
    // been tempting and where the reliability cost is already being paid.
    expect(supportVerdict(car, SILVIA, CONTEXT.partsById, ECONOMY).band).toBe('dangerous')

    const result = resolveDynoSession(state, car.id, SESSION_LABOUR, CONTEXT)
    expect(result.laborSlotsUsed).toBe(SESSION_LABOUR)
    const after = result.state.ownedCars[0]!

    // The car object itself is untouched, which is stronger than any
    // field-by-field comparison: the session cannot have written to it.
    expect(after).toBe(car)
    expect(
      computeDerivedStats(SILVIA, after, CONTEXT.partsById, CONTEXT.partsTaxonomy, ECONOMY),
    ).toEqual(statsBefore)
    expect(
      marketValueYen(SILVIA, after, 100, CONTEXT.partsById, CONTEXT.partsTaxonomyById, ECONOMY),
    ).toBe(valueBefore)
  })

  it('applies the coherence cost whether or not a session is ever paid for', () => {
    const car = carWithGrades(SILVIA, CONTEXT, BARE_RACE_TURBO, 'mint')
    const neverDynoed = computeDerivedStats(
      SILVIA,
      car,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    const stock = computeDerivedStats(
      SILVIA,
      carWithGrades(SILVIA, CONTEXT, {}, 'mint'),
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    // The always-on warning and its price are already being charged.
    expect(neverDynoed.reliability).toBeLessThan(stock.reliability)

    const run = resolveDynoSession(stateWithCarInBay(car), car.id, SESSION_LABOUR, CONTEXT)
    const dynoed = computeDerivedStats(
      SILVIA,
      run.state.ownedCars[0]!,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    expect(dynoed.reliability).toBe(neverDynoed.reliability)
    // The warning itself reads the same before and after: the dyno adds
    // precision, it is not the thing that makes the problem appear.
    expect(supportVerdict(run.state.ownedCars[0]!, SILVIA, CONTEXT.partsById, ECONOMY)).toEqual(
      supportVerdict(car, SILVIA, CONTEXT.partsById, ECONOMY),
    )
  })
})

describe('a dyno session runs through the job system', () => {
  it('costs exactly one labour slot and cannot run without one', () => {
    const car = carWithGrades(SILVIA, CONTEXT, {}, 'mint')
    const state = stateWithCarInBay(car)

    const starved = resolveDynoSession(state, car.id, SESSION_LABOUR - 1, CONTEXT)
    expect(starved.state).toBe(state)
    expect(starved.laborSlotsUsed).toBe(0)
    expect(starved.state.cashYen).toBe(state.cashYen)
    expect(dynoSessionGateReason(state, car.id, SESSION_LABOUR - 1, CONTEXT)).toBe('no-labour')

    const run = resolveDynoSession(state, car.id, SESSION_LABOUR, CONTEXT)
    expect(run.laborSlotsUsed).toBe(SESSION_LABOUR)
    expect(run.state.energySpentToday).toBe(SESSION_LABOUR)
    // The job opened, completed and closed through the same path every other
    // job takes - nothing is left hanging in `state.jobs`.
    expect(run.state.jobs.find((j) => j.id === dynoJobIdFor(car.id))).toBeUndefined()
    expect(run.log.map((entry) => entry.type)).toContain('job-completed')
    expect(dynoSessionCarId(run.state)).toBe(car.id)
  })

  it('refuses a car that is not in a service bay, without charging', () => {
    const car = carWithGrades(SILVIA, CONTEXT, {}, 'mint')
    const parked = baseState({ ownedCars: [car], parkingCarIds: [car.id] })
    expect(dynoSessionGateReason(parked, car.id, SESSION_LABOUR, CONTEXT)).toBe(
      'not-in-service-bay',
    )
    const result = resolveDynoSession(parked, car.id, SESSION_LABOUR, CONTEXT)
    expect(result.state).toBe(parked)
    expect(result.state.cashYen).toBe(parked.cashYen)
  })
})

describe('hiring one in, and owning one', () => {
  const car = carWithGrades(SILVIA, CONTEXT, {}, 'mint')

  it('charges the hire fee once a day, and never once owned', () => {
    const state = stateWithCarInBay(car)
    const first = resolveDynoSession(state, car.id, SESSION_LABOUR, CONTEXT)
    expect(state.cashYen - first.state.cashYen).toBe(ECONOMY.dyno.hireFeeYen)
    expect(first.log.map((entry) => entry.type)).toContain('dyno-hired')
    expect(hasDynoAccess(first.state)).toBe(true)

    // A second car the same day rides the same hire.
    const other = carWithGrades(FD, CONTEXT, {}, 'mint')
    const twoCars: GameState = {
      ...first.state,
      ownedCars: [...first.state.ownedCars, other],
      serviceBayCarIds: [...first.state.serviceBayCarIds, other.id],
      serviceBayCount: 2,
      energySpentToday: 0,
    }
    const second = resolveDynoSession(twoCars, other.id, SESSION_LABOUR, CONTEXT)
    expect(second.state.cashYen).toBe(twoCars.cashYen)
    expect(second.log.map((entry) => entry.type)).not.toContain('dyno-hired')
  })

  it('stops charging the moment one is bought, hired earlier that day or not', () => {
    const hired = resolveDynoSession(stateWithCarInBay(car), car.id, SESSION_LABOUR, CONTEXT).state
    const bought = resolveBuyDyno(hired, CONTEXT)
    expect(bought.applied).toBe(true)
    expect(hired.cashYen - bought.state.cashYen).toBe(ECONOMY.dyno.purchasePriceYen)
    expect(dynoOwned(bought.state)).toBe(true)

    const tomorrow: GameState = { ...bought.state, day: bought.state.day + 1, energySpentToday: 0 }
    const owned = resolveDynoSession(tomorrow, car.id, SESSION_LABOUR, CONTEXT)
    expect(owned.state.cashYen).toBe(tomorrow.cashYen)
    expect(owned.laborSlotsUsed).toBe(SESSION_LABOUR)
  })

  it('gates the purchase on reputation, and refuses short cash', () => {
    const belowStanding = baseState({ reputationTier: 'local' })
    expect(resolveBuyDyno(belowStanding, CONTEXT).applied).toBe(false)
    expect(dynoOwned(resolveBuyDyno(belowStanding, CONTEXT).state)).toBe(false)

    const short = baseState({ cashYen: ECONOMY.dyno.purchasePriceYen - 1 })
    expect(resolveBuyDyno(short, CONTEXT).applied).toBe(false)

    expect(resolveBuyDyno(baseState(), CONTEXT).applied).toBe(true)
  })

  it('refuses a session with neither a dyno nor the fee', () => {
    const broke = stateWithCarInBay(car, { cashYen: ECONOMY.dyno.hireFeeYen - 1 })
    expect(dynoSessionGateReason(broke, car.id, SESSION_LABOUR, CONTEXT)).toBe('no-cash')
    expect(resolveDynoSession(broke, car.id, SESSION_LABOUR, CONTEXT).state).toBe(broke)
  })
})

describe('what the reading reports', () => {
  it('is the sim its own figures, never a second interpretation', () => {
    const car = carWithGrades(SILVIA, CONTEXT, BARE_RACE_TURBO, 'worn')
    const reading = dynoReadingFor(car, SILVIA, CONTEXT.partsById, CONTEXT.partsTaxonomy, ECONOMY)
    const stats = computeDerivedStats(
      SILVIA,
      car,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )

    expect(reading.ratios).toEqual(supportRatios(car, SILVIA, CONTEXT.partsById, ECONOMY))
    expect(reading.verdict).toEqual(supportVerdict(car, SILVIA, CONTEXT.partsById, ECONOMY))
    expect(reading.powerPs).toBe(stats.power)
    expect(reading.reliabilityStat).toBe(stats.reliability)
    expect(reading.stockPowerPs).toBe(SILVIA.spec.stockPowerPs)
    expect(reading.engineCharacter).toBe(engineCharacterOf(SILVIA, ECONOMY))
    expect(reading.specificOutputPsPerLitre).toBe(specificOutputOf(SILVIA))
  })

  it('reads 1.0 on every subsystem for a stock car, with no shortfall', () => {
    const car = carWithGrades(SILVIA, CONTEXT, {}, 'mint')
    const reading = dynoReadingFor(car, SILVIA, CONTEXT.partsById, CONTEXT.partsTaxonomy, ECONOMY)
    for (const subsystem of SubsystemSchema.options) {
      expect(reading.ratios[subsystem]).toBeCloseTo(1, 10)
    }
    expect(reading.verdict.band).toBe('adequate')
    expect(reading.powerPs).toBe(SILVIA.spec.stockPowerPs)
    // Nothing gained, nothing worn: the car sits exactly on its own ceiling.
    expect(reading.reliabilityStat).toBe(SILVIA.spec.reliabilityBase)
  })

  it('names the weakest link, and it is the minimum of the five', () => {
    const car = carWithGrades(SILVIA, CONTEXT, BARE_RACE_TURBO, 'mint')
    const reading = dynoReadingFor(car, SILVIA, CONTEXT.partsById, CONTEXT.partsTaxonomy, ECONOMY)
    const lowest = Math.min(...SubsystemSchema.options.map((s) => reading.ratios[s]))
    expect(reading.verdict.headline).toBe(lowest)
    expect(reading.ratios[reading.verdict.subsystem]).toBe(lowest)
    // A bare big turbo on a factory bottom end: the block is what gives out.
    expect(reading.verdict.subsystem).toBe('cylinderPressure')
  })

  it('reports a rotary against its equivalent capacity, not its badge', () => {
    const car = carWithGrades(FD, CONTEXT, {}, 'mint')
    const reading = dynoReadingFor(car, FD, CONTEXT.partsById, CONTEXT.partsTaxonomy, ECONOMY)
    expect(reading.rotaryEquivalent).toBe(true)
    expect(reading.displacementCc).toBe(FD.spec.displacementCc)
    expect(reading.effectiveDisplacementCc).toBe(effectiveDisplacementCcOf(FD))
    expect(reading.effectiveDisplacementCc).toBeGreaterThan(reading.displacementCc!)
    // The figure shown is the equivalent-litre one, which is the whole reason
    // the equivalency has to be visible rather than applied behind it.
    expect(reading.specificOutputPsPerLitre).toBeCloseTo(
      FD.spec.stockPowerPs / (reading.effectiveDisplacementCc! / 1000),
      10,
    )

    const piston = dynoReadingFor(
      carWithGrades(SILVIA, CONTEXT, {}, 'mint'),
      SILVIA,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    expect(piston.rotaryEquivalent).toBe(false)
    expect(piston.effectiveDisplacementCc).toBe(piston.displacementCc)
  })
})

describe('the reliability split', () => {
  /** Builds worth splitting: nothing wrong, wear only, build only, and both. */
  const CASES: {
    name: string
    grades: Partial<Record<CarPartId, Grade>>
    band: 'mint' | 'worn'
  }[] = [
    { name: 'stock and mint', grades: {}, band: 'mint' },
    { name: 'stock and worn', grades: {}, band: 'worn' },
    { name: 'bare race turbo, mint', grades: BARE_RACE_TURBO, band: 'mint' },
    { name: 'bare race turbo, worn', grades: BARE_RACE_TURBO, band: 'worn' },
  ]

  it.each(CASES)('adds back to the car own ceiling exactly ($name)', ({ grades, band }) => {
    const car = carWithGrades(SILVIA, CONTEXT, grades, band)
    const split = reliabilityBreakdownOf(
      car,
      SILVIA,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    expect(
      split.reliability +
        split.conditionLossPoints +
        split.coherenceLossPoints +
        split.intensityLossPoints,
    ).toBeCloseTo(split.base, 10)
    expect(split.base).toBe(SILVIA.spec.reliabilityBase)
  })

  it('is the same derivation the stat itself uses', () => {
    for (const { grades, band } of CASES) {
      const car = carWithGrades(SILVIA, CONTEXT, grades, band)
      const split = reliabilityBreakdownOf(
        car,
        SILVIA,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        ECONOMY,
      )
      const stats = computeDerivedStats(
        SILVIA,
        car,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        ECONOMY,
      )
      expect(Math.round(split.reliability)).toBe(stats.reliability)
    }
  })

  it('charges wear to condition and an unsupported build to coherence', () => {
    const worn = reliabilityBreakdownOf(
      carWithGrades(SILVIA, CONTEXT, {}, 'worn'),
      SILVIA,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    expect(worn.conditionLossPoints).toBeGreaterThan(0)
    // A stock car is coherent by construction, whatever state it is in.
    expect(worn.coherenceLossPoints).toBe(0)
    expect(worn.intensityLossPoints).toBe(0)

    const collapsed = reliabilityBreakdownOf(
      carWithGrades(SILVIA, CONTEXT, BARE_RACE_TURBO, 'mint'),
      SILVIA,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    expect(collapsed.conditionLossPoints).toBe(0)
    expect(collapsed.coherenceLossPoints).toBeGreaterThan(0)
    // Even a supported build pays for the power itself; an unsupported one
    // pays that too, independently of what it is short of.
    expect(collapsed.intensityLossPoints).toBeGreaterThan(0)
  })
})

/**
 * The split as the sheet prints it. The underlying identity is exact to about
 * 1e-14, but whole points are what the player reads, and three roundings taken
 * one at a time can quietly lose one between them.
 */
describe('the displayed reliability split', () => {
  /** Every slot in the catalogue that makes power, so the build asks the most
   * of the car that shipped content can ask. */
  const MAXIMAL_GAIN: Partial<Record<CarPartId, Grade>> = {
    block: 'race',
    internals: 'race',
    headValvetrain: 'race',
    camsTiming: 'race',
    intake: 'race',
    exhaust: 'race',
    ignitionEcu: 'race',
    forcedInduction: 'race',
  }
  const SHAPES: Partial<Record<CarPartId, Grade>>[] = [{}, BARE_RACE_TURBO, MAXIMAL_GAIN]
  const BANDS = ['mint', 'fine', 'worn', 'poor', 'scrap'] as const

  it('accounts for the whole base, on every shipped car across every build shape and band', () => {
    for (const model of CARS) {
      for (const grades of SHAPES) {
        for (const band of BANDS) {
          const car = carWithGrades(model, CONTEXT, grades, band)
          const reading = dynoReadingFor(
            car,
            model,
            CONTEXT.partsById,
            CONTEXT.partsTaxonomy,
            ECONOMY,
          )
          const split = displayedReliabilitySplit(reading)
          expect(
            reading.reliabilityStat +
              split.conditionCostPoints +
              split.coherenceCostPoints +
              split.powerCostPoints,
            `${model.id} at ${band}`,
          ).toBe(reading.reliability.base)
          // Reconciling is not licence to invent: every figure still stands
          // within a point of the loss it is reporting.
          expect(
            Math.abs(split.conditionCostPoints - reading.reliability.conditionLossPoints),
            `${model.id} at ${band}: condition`,
          ).toBeLessThan(1)
          expect(
            Math.abs(split.coherenceCostPoints - reading.reliability.coherenceLossPoints),
            `${model.id} at ${band}: coherence`,
          ).toBeLessThan(1)
          expect(
            Math.abs(split.powerCostPoints - reading.reliability.intensityLossPoints),
            `${model.id} at ${band}: the power itself`,
          ).toBeLessThan(1)
        }
      }
    }
  })

  it('closes the case rounding one at a time missed: a maximal build on the City E at mint', () => {
    // WHICH build shows the gap is a property of the power curve rather than
    // of the arithmetic, so the worked example is a car and a band that
    // currently disagree under naive rounding, not a fixed one. The guarantee
    // itself is swept over every car, shape and band above; this is the
    // readable case behind it.
    const car = carWithGrades(CITY, CONTEXT, MAXIMAL_GAIN, 'mint')
    const reading = dynoReadingFor(car, CITY, CONTEXT.partsById, CONTEXT.partsTaxonomy, ECONOMY)
    const independently =
      reading.reliabilityStat +
      Math.round(reading.reliability.conditionLossPoints) +
      Math.round(reading.reliability.coherenceLossPoints) +
      Math.round(reading.reliability.intensityLossPoints)
    expect(reading.reliability.base).toBe(99)
    expect(independently).toBe(98)
    const split = displayedReliabilitySplit(reading)
    expect(
      reading.reliabilityStat +
        split.conditionCostPoints +
        split.coherenceCostPoints +
        split.powerCostPoints,
    ).toBe(99)
  })
})
