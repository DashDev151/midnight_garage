import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type CarInstance } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carOriginLabel, enforceMaxBillFraction, generateAuctionCarInstance } from '../src/auctions'
import { carGuideValueYen } from '../src/bidding'
import { buildWorstCaseRawCar } from '../src/coherence'
import { buildSimContext } from '../src/context'
import { expectedTrueValueYen, playerEstimateYen, sheetGuideValueYen } from '../src/diagnosis'
import { marketValueYen } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { makeCarOrigin } from '../src/provenance'
import { createRng } from '../src/rng'
import { buildTutorialLot } from '../src/tutorial'
import { roomLedgerFor, valueLedgerFor, type ValueLedger } from '../src/valueLedger'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function ledgerSumYen(ledger: ValueLedger): number {
  return ledger.lines.reduce((sum, line) => sum + line.yen, 0)
}

/** Asserts the one law the ledger exists for: its lines and its total both
 * equal `marketValueYen` for the same car, to the yen, no tolerance. */
function expectLedgerMatchesMarketValue(
  car: CarInstance,
  modelId: string,
  heatPercent: number,
): void {
  const model = CONTEXT.modelsById[modelId]!
  const ledger = valueLedgerFor(
    car,
    model,
    heatPercent,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy,
  )
  const valueYen = marketValueYen(
    model,
    car,
    heatPercent,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy,
  )
  const label = `${modelId} at heat ${heatPercent}`
  expect(ledger.totalYen, `${label}: totalYen`).toBe(valueYen)
  expect(ledgerSumYen(ledger), `${label}: line sum`).toBe(valueYen)
}

describe('valueLedgerFor sums exactly to marketValueYen', () => {
  // The worst car the generator could hand a real lot (the coherence probes'
  // own worst-case construction, softened by the live generation guard), plus
  // the unsoftened all-scrap roll - the latter drives the raw formula below
  // the scrap-value backstop, so the 'floor' line is exercised too.
  it.each(CARS.map((model) => [model.id] as const))(
    'the worst-case rolled %s, softened and raw, at heat 100 and off-100',
    (modelId) => {
      const model = CONTEXT.modelsById[modelId]!
      const rawCar = buildWorstCaseRawCar(model, CONTEXT)
      const softened = enforceMaxBillFraction(
        rawCar,
        model,
        CONTEXT,
        makeCarOrigin(rawCar.id, carOriginLabel(model, rawCar.year), 0),
      )
      for (const car of [rawCar, softened]) {
        for (const heatPercent of [100, 83]) {
          expectLedgerMatchesMarketValue(car, modelId, heatPercent)
        }
      }
    },
  )

  it.each(CARS.map((model) => [model.id] as const))(
    'really generated %s lots (aftermarket rolls included), across seeds and heats',
    (modelId) => {
      const model = CONTEXT.modelsById[modelId]!
      for (let seed = 0; seed < 5; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `ledger-${modelId}-${seed}`,
          createRng(seed),
          CONTEXT,
        )
        for (const heatPercent of [100, 91, 117]) {
          expectLedgerMatchesMarketValue(car, modelId, heatPercent)
        }
      }
    },
  )

  it('emits the heat line only when heat is off 100, and keeps the stable id order', () => {
    const model = CONTEXT.modelsById[CARS[0]!.id]!
    const car = buildWorstCaseRawCar(model, CONTEXT)
    const atPar = valueLedgerFor(
      car,
      model,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    expect(atPar.lines.some((line) => line.id === 'heat')).toBe(false)
    const offPar = valueLedgerFor(
      car,
      model,
      83,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    expect(offPar.lines.map((line) => line.id).slice(0, 3)).toEqual(['book', 'mileage', 'heat'])
  })
})

describe('roomLedgerFor on the tutorial lot', () => {
  const state = createInitialGameState(CONTEXT, 1)
  const lot = buildTutorialLot(CONTEXT, 1)
  const model = CONTEXT.modelsById[lot.modelId]!

  it('sums exactly to carGuideValueYen, fear line included', () => {
    const ledger = roomLedgerFor(lot.car, model, state, CONTEXT)
    const roomYen = carGuideValueYen(lot.car, model, state, CONTEXT)
    expect(ledger.totalYen).toBe(roomYen)
    expect(ledgerSumYen(ledger)).toBe(roomYen)
  })

  it('carries exactly one fear line, negative, as its last entry', () => {
    const ledger = roomLedgerFor(lot.car, model, state, CONTEXT)
    const fearLines = ledger.lines.filter((line) => line.id === 'fear')
    expect(fearLines).toHaveLength(1)
    expect(ledger.lines.at(-1)!.id).toBe('fear')
    expect(fearLines[0]!.yen).toBeLessThan(0)
  })
})

describe('pre-knowledge equality: the room and the player read the same number', () => {
  it('sheetGuideValueYen === expectedTrueValueYen === playerEstimateYen on the untested tutorial lot', () => {
    const state = createInitialGameState(CONTEXT, 1)
    const lot = buildTutorialLot(CONTEXT, 1)
    const model = CONTEXT.modelsById[lot.modelId]!
    const sheet = sheetGuideValueYen(lot.car, model, state, CONTEXT)
    expect(expectedTrueValueYen(lot.car, model, state, CONTEXT)).toBe(sheet)
    expect(playerEstimateYen(lot.car, model, state, CONTEXT)).toBe(sheet)
  })
})
