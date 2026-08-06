import { BUYERS, CARS, ECONOMY, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeRosterDonorBalanceProbe } from '../src/balanceProbes'
import { buildSimContext } from '../src/context'
import { mileageFactor } from '../src/marketValue'

/**
 * The value stack's own acceptance gate for Stage C (the coherence discount)
 * and Stage D (coherence-scaled retention): a car with no aftermarket parts
 * must value EXACTLY as it does under Stage A/B alone - proved here as a
 * mathematical property rather than a captured snapshot.
 *
 * Coherence reads fitted GRADE, never band (`support.ts`'s `SlotContribution`)
 * - every slot on an all-stock car carries `specByGrade.stock = 0` and zero
 * power gain regardless of condition, so `coherenceFactor` is exactly 1.0 on
 * ANY all-stock car (mint or wrecked alike). That makes Stage C's discount
 * exactly zero (`coherenceDiscountWeight * (1 - 1) * tolerance = 0`) and
 * makes Stage D's retention curve multiply nothing, because
 * `installedPartsValueYen` only ever credits a non-`stock`-grade part. So a
 * stock car's value reduces to Stage A/B alone - and at 0 km, all-mint,
 * Stage B's restoration bill is zero too, leaving exactly `bookValueYen x
 * mileageFactor(0)`.
 *
 * `computeRosterDonorBalanceProbe`'s `wholeSaleYen` is precisely this figure
 * (`computeDonorBalanceProbe`'s doc comment: "a clean, all-mint example of
 * this model... valued whole through the real marketValueYen"), built via the
 * real generation-grade `stockInstanceFor`, for every roster model - so this
 * reuses the existing probe rather than hand-building a car instance per model.
 */
describe('stock-car valuation invariant (Sprint 144 acceptance gate)', () => {
  const context = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

  it('has the full 48-car shipped roster to guard', () => {
    expect(CARS.length).toBe(48)
  })

  it('every shipped car with no aftermarket parts values at exactly bookValueYen x mileageFactor(0) - Stage C and Stage D touch nothing here', () => {
    const rows = computeRosterDonorBalanceProbe(CARS, context)
    expect(rows).toHaveLength(48)
    const modelsById = Object.fromEntries(CARS.map((car) => [car.id, car]))
    for (const row of rows) {
      const model = modelsById[row.modelId]!
      const expectedYen = Math.round(model.bookValueYen * mileageFactor(0, ECONOMY))
      expect(row.wholeSaleYen, `${row.modelId} stock value moved off its Stage A/B figure`).toBe(
        expectedYen,
      )
    }
  })
})
