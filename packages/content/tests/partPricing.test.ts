import { describe, expect, it } from 'vitest'
import partPricing from '../data/partPricing.json'
import { PartPricingSheetSchema, resolvePartPriceYen } from '../src'

const SHEET = PartPricingSheetSchema.parse(partPricing)

describe('resolvePartPriceYen priceBasisPartId defaulting', () => {
  it('an entry without priceBasisPartId prices identically to the same entry with it set explicitly to its own carPartId', () => {
    const entry = {
      id: 'stock-panels',
      carPartId: 'panels' as const,
      fitmentClass: 'common' as const,
      grade: 'stock' as const,
    }
    const withoutBasis = resolvePartPriceYen(entry, SHEET)
    const withBasis = resolvePartPriceYen({ ...entry, priceBasisPartId: 'panels' }, SHEET)
    expect(withoutBasis).toBe(withBasis)
    expect(withoutBasis).toBe(28_000)
  })

  it('a zonePanel-basis entry prices from the new basis, independent of its own carPartId base', () => {
    const price = resolvePartPriceYen(
      {
        id: 'zone-panel-bonnet',
        carPartId: 'panels' as const,
        fitmentClass: 'common' as const,
        grade: 'stock' as const,
        priceBasisPartId: 'zonePanel',
      },
      SHEET,
    )
    // zonePanel base (6,000) x common class (1.0) x stock grade (1.0) x
    // global (1.0) - distinct from the panels carPartId base (28,000).
    expect(price).toBe(6_000)
  })
})
