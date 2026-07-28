import { describe, expect, it } from 'vitest'
import partPricing from '../data/partPricing.json'
import { PartPricingSheetSchema, resolvePartPriceYen } from '../src'

const SHEET = PartPricingSheetSchema.parse(partPricing)

describe('resolvePartPriceYen priceBasisPartId defaulting', () => {
  it('an entry without priceBasisPartId prices identically to the same entry with it set explicitly to its own carPartId', () => {
    const entry = {
      id: 'stock-panels',
      carPartId: 'panels' as const,
      fitmentClass: 'everyday' as const,
      grade: 'stock' as const,
    }
    const withoutBasis = resolvePartPriceYen(entry, SHEET)
    const withBasis = resolvePartPriceYen({ ...entry, priceBasisPartId: 'panels' }, SHEET)
    expect(withoutBasis).toBe(withBasis)
    // The panels reference base (28,000) x the everyday class factor, rounded
    // to the nearest Y100 by `resolvePartPriceYen`.
    expect(withoutBasis).toBe(Math.round((28_000 * SHEET.classFactors.everyday) / 100) * 100)
  })

  it('a zonePanel-basis entry prices from the new basis, independent of its own carPartId base', () => {
    const price = resolvePartPriceYen(
      {
        id: 'zone-panel-bonnet',
        carPartId: 'panels' as const,
        fitmentClass: 'everyday' as const,
        grade: 'stock' as const,
        priceBasisPartId: 'zonePanel',
      },
      SHEET,
    )
    // The zonePanel reference base (6,000) x everyday class x stock grade x
    // global - distinct from the panels carPartId base (28,000), which is what
    // this entry would otherwise have priced from.
    expect(price).toBe(Math.round((6_000 * SHEET.classFactors.everyday) / 100) * 100)
    expect(price).toBeLessThan(
      resolvePartPriceYen(
        { id: 'stock-panels', carPartId: 'panels', fitmentClass: 'everyday', grade: 'stock' },
        SHEET,
      ),
    )
  })
})
