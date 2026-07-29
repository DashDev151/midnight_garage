import { describe, expect, it } from 'vitest'
import partPricing from '../data/partPricing.json'
import {
  PARTS,
  PartPricingSheetSchema,
  resolvePartPriceYen,
  type Grade,
  type Part,
  type PartFitmentClass,
} from '../src'

const SHEET = PartPricingSheetSchema.parse(partPricing)

const GRADES: readonly Grade[] = ['stock', 'street', 'sport', 'race']
const CLASSES: readonly PartFitmentClass[] = ['entry', 'everyday', 'enthusiast', 'flagship']

/** A SKU's price basis, which is its `priceBasisPartId` when it carries one and
 * its own `carPartId` otherwise - the same rule `resolvePartPriceYen` applies.
 * The ladder assertions below group by this rather than by `carPartId`, because
 * two SKUs in the same slot can legitimately price from different bases (a
 * zone-panel SKU against a whole-panel one) and comparing across those would be
 * comparing different ladders. */
function basisOf(part: Part): string {
  return part.priceBasisPartId ?? part.carPartId
}

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

/**
 * The ladder, asserted over the RESOLVED catalog rather than over hand-worked
 * examples. A hand-worked example proves the formula; these prove that what the
 * shop actually sells reads correctly after every base, factor and the round to
 * the nearest Y100 have all been applied. The pricing sheet is five knobs and one
 * multiplication, so a lever movement lands on all 472 SKUs at once and a ladder
 * that stopped reading would otherwise be found by a player rather than by CI.
 */
describe('the resolved parts catalog ladder', () => {
  it('prices rise strictly with grade, within a price basis and fitment class', () => {
    const groups = new Map<string, Part[]>()
    for (const part of PARTS) {
      const key = `${basisOf(part)}|${part.fitmentClass}`
      const group = groups.get(key)
      if (group) group.push(part)
      else groups.set(key, [part])
    }

    const failures: string[] = []
    for (const [key, group] of groups) {
      const byGrade = new Map(group.map((part) => [part.grade, part.priceYen]))
      const present = GRADES.filter((grade) => byGrade.has(grade))
      for (let i = 1; i < present.length; i += 1) {
        const lowerGrade = present[i - 1]
        const higherGrade = present[i]
        if (!lowerGrade || !higherGrade) continue
        const lower = byGrade.get(lowerGrade) as number
        const higher = byGrade.get(higherGrade) as number
        if (higher <= lower) {
          failures.push(
            `${key}: ${higherGrade} (Y${higher}) does not exceed ${lowerGrade} (Y${lower})`,
          )
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('prices rise strictly with fitment class, within a price basis and grade', () => {
    const groups = new Map<string, Part[]>()
    for (const part of PARTS) {
      const key = `${basisOf(part)}|${part.grade}`
      const group = groups.get(key)
      if (group) group.push(part)
      else groups.set(key, [part])
    }

    const failures: string[] = []
    for (const [key, group] of groups) {
      const byClass = new Map(group.map((part) => [part.fitmentClass, part.priceYen]))
      const present = CLASSES.filter((fitmentClass) => byClass.has(fitmentClass))
      for (let i = 1; i < present.length; i += 1) {
        const lowerClass = present[i - 1]
        const higherClass = present[i]
        if (!lowerClass || !higherClass) continue
        const lower = byClass.get(lowerClass) as number
        const higher = byClass.get(higherClass) as number
        if (higher <= lower) {
          failures.push(
            `${key}: ${higherClass} (Y${higher}) does not exceed ${lowerClass} (Y${lower})`,
          )
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('no SKU resolves below the cheapest stock part of its own fitment class', () => {
    for (const fitmentClass of CLASSES) {
      const inClass = PARTS.filter((part) => part.fitmentClass === fitmentClass)
      const stockPrices = inClass
        .filter((part) => part.grade === 'stock')
        .map((part) => part.priceYen)
      expect(stockPrices.length, `no stock SKUs in the ${fitmentClass} class`).toBeGreaterThan(0)
      const floor = Math.min(...stockPrices)
      const below = inClass.filter((part) => part.priceYen < floor)
      expect(below.map((part) => `${part.id} Y${part.priceYen} < Y${floor}`)).toEqual([])
    }
  })

  it('the brake cliff survives the round to the nearest Y100', () => {
    // Caliper-and-line sets sit at three times pads-and-discs in the sheet
    // (45,000 against 15,000). That step is what makes a brake overhaul a real
    // decision rather than a rounding difference, and rounding every resolved
    // price to Y100 is the one thing that could quietly flatten it on the
    // cheapest classes.
    let compared = 0
    for (const fitmentClass of CLASSES) {
      for (const grade of GRADES) {
        const pads = PARTS.find(
          (part) =>
            part.carPartId === 'brakePadsDiscs' &&
            part.fitmentClass === fitmentClass &&
            part.grade === grade,
        )
        const calipers = PARTS.find(
          (part) =>
            part.carPartId === 'brakeCalipersLines' &&
            part.fitmentClass === fitmentClass &&
            part.grade === grade,
        )
        if (!pads || !calipers) continue
        compared += 1
        const ratio = calipers.priceYen / pads.priceYen
        expect(
          ratio,
          `${fitmentClass}/${grade}: calipers Y${calipers.priceYen} against pads Y${pads.priceYen}`,
        ).toBeGreaterThan(2.9)
        expect(ratio).toBeLessThan(3.1)
      }
    }
    expect(compared, 'no brake pairs were compared, so this test proved nothing').toBeGreaterThan(0)
  })

  it('the overrides map is empty, so every SKU prices from the formula', () => {
    // Its own schema comment: "ships EMPTY; every entry is a deliberate,
    // individually-justified decision". An override wins outright, so a
    // non-empty map would silently exempt a SKU from every ladder assertion
    // above. The map is keyed by SKU id and valued in absolute yen, so it
    // cannot express a multiplier for a class of car at all.
    expect(SHEET.overrides).toEqual({})
  })
})
