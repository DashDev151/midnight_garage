import { BUYERS, CARS, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { carCostToMintYen } from '../src/bands'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'
import { restorationValueLinesFor, valueLedgerFor } from '../src/valueLedger'
import { carWithGrades } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

/**
 * The per-slot decomposition of the ledger's 'wear' and 'polish' lines. Both
 * halves come out of the same two `carCostToBandBreakdown` reads the whole-car
 * figures come out of, so a slot's line and the total can never disagree about
 * which side of the expectation band a yen of work falls on.
 *
 * Rounding is the only slack: this rounds per line, the ledger rounds two
 * telescoping cumulative checkpoints, so the two sums agree to within a few yen
 * rather than exactly. The tolerance is a line count, not a fraction.
 */
const ROUNDING_TOLERANCE_YEN = 2

describe('restorationValueLinesFor', () => {
  for (const model of CONTEXT.models) {
    it(`decomposes the wear and polish lines for ${model.id}`, () => {
      const car = generateAuctionCarInstance(
        model,
        `probe-${model.id}`,
        createRng(31),
        CONTEXT,
        1995,
      )
      const breakdown = restorationValueLinesFor(
        car,
        model,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        CONTEXT.economy,
      )
      const ledger = valueLedgerFor(
        car,
        model,
        100,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        CONTEXT.economy,
      )
      const wearPlusPolish = ledger.lines
        .filter((line) => line.id === 'wear' || line.id === 'polish')
        .reduce((sum, line) => sum + line.yen, 0)

      // The bill half is exact, with no tolerance at all.
      expect(breakdown.totalBillYen).toBe(
        carCostToMintYen(car, model, CONTEXT.partsById, CONTEXT.partsTaxonomyById, CONTEXT.economy),
      )
      expect(breakdown.lines.reduce((sum, line) => sum + line.billYen, 0)).toBe(
        breakdown.totalBillYen,
      )
      // Each slot's two halves always add back up to its own bill.
      for (const line of breakdown.lines) {
        expect(line.belowBandBillYen + line.aboveBandBillYen).toBe(line.billYen)
        expect(line.valueYen).toBeLessThanOrEqual(0)
      }
      // And the value half reproduces the ledger's own two lines.
      expect(Math.abs(breakdown.totalValueYen - wearPlusPolish)).toBeLessThanOrEqual(
        ROUNDING_TOLERANCE_YEN * breakdown.lines.length,
      )
    })
  }

  it('reports nothing to do on a car with no bill at all', () => {
    const model = CONTEXT.models[0]!
    const breakdown = restorationValueLinesFor(
      carWithGrades(model, CONTEXT, {}, 'mint'),
      model,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    expect(breakdown.totalBillYen).toBe(0)
    expect(breakdown.totalValueYen).toBe(0)
  })
})
