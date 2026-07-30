import { describe, expect, it } from 'vitest'
import partPricing from '../data/partPricing.json'
import {
  CarPartIdSchema,
  gradeFactorsFor,
  PARTS,
  PartPricingSheetSchema,
  resolvePartPriceYen,
  type EngineCharacter,
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

  // The two invariants above ("prices rise strictly with grade" and "no SKU
  // resolves below the cheapest stock part") run against the resolved `PARTS`
  // catalogue, so they are re-asserted automatically against the per-slot
  // resolution (`gradeFactorsFor`) without needing a second copy.
})

/**
 * `gradeFactors` is a per-slot map with a mandatory `default`, so a slot's
 * price ladder can track its own power curve. `ignitionEcu` is the one slot
 * that earns its own entry; everything else (every other power slot
 * included) still resolves the same flat 1 / 1.3 / 2 / 3 ladder it always
 * has.
 */
describe('the per-slot grade ladder', () => {
  it('the default ladder is unchanged: stock 1, street 1.3, sport 2, race 3', () => {
    expect(SHEET.gradeFactors.default).toEqual({ stock: 1, street: 1.3, sport: 2, race: 3 })
  })

  it('ignitionEcu carries its own ladder: stock 1, street 1.30, sport 4.77, race 8.67', () => {
    expect(SHEET.gradeFactors.ignitionEcu).toEqual({
      stock: 1,
      street: 1.3,
      sport: 4.77,
      race: 8.67,
    })
  })

  it('every CarPartId except ignitionEcu resolves the default ladder, read from content', () => {
    for (const carPartId of CarPartIdSchema.options) {
      const resolved = gradeFactorsFor(carPartId, SHEET.gradeFactors)
      if (carPartId === 'ignitionEcu') {
        expect(resolved, carPartId).toEqual(SHEET.gradeFactors.ignitionEcu)
      } else {
        expect(resolved, carPartId).toEqual(SHEET.gradeFactors.default)
      }
    }
  })

  it('no CarPartId other than ignitionEcu carries its own entry in the sheet', () => {
    const ownLadderKeys = Object.keys(SHEET.gradeFactors).filter((k) => k !== 'default')
    expect(ownLadderKeys).toEqual(['ignitionEcu'])
  })
})

/**
 * The test that would have caught the standalone ECU's old defect before it
 * shipped: `gradeFactors` moving in the same change as a slot's power curve
 * exists so a rung never becomes a dramatically better OR worse buy than its
 * neighbours purely because the price ladder and the power curve have
 * different shapes - the ECU's street rung used to cost 2.89x race's
 * yen-per-PS for barely a fraction of the power.
 *
 * The bound is not perfect step-by-step monotonicity: a diminishing power
 * curve laid over the four-point 1/1.3/2/3 ladder genuinely makes a cheaper
 * rung a slightly BETTER buy than the top on several slots (diminishing
 * returns means the cheap rung IS the better buy, by design), by as much as
 * ~1.4x on `intake`. The bound below is chosen to comfortably contain every
 * one of those signed, accepted cases while decisively catching anything
 * resembling the old 2.89x distortion - the measured table is reported via
 * each case's own test name, passing or failing, so the residues stay
 * visible rather than merely passing.
 */
describe('the value-per-yen rule: climbing a grade ladder never becomes a dramatically different buy', () => {
  const POWER_BEARING_SLOTS = [
    'block',
    'internals',
    'headValvetrain',
    'camsTiming',
    'intake',
    'exhaust',
    'ignitionEcu',
    'forcedInduction',
  ] as const
  const CHARACTERS: readonly EngineCharacter[] = ['high-strung-na', 'lazy-na', 'forced']
  const NON_STOCK_GRADES: readonly Grade[] = ['street', 'sport', 'race']

  // Comfortably above the largest currently-signed spread (~1.39x on
  // `intake`) and decisively below the pre-Lever-5 ECU defect (2.89x).
  const MAX_ACCEPTABLE_SPREAD = 2.0

  for (const carPartId of POWER_BEARING_SLOTS) {
    for (const fitmentClass of CLASSES) {
      for (const character of CHARACTERS) {
        const byGrade = NON_STOCK_GRADES.map((grade) => {
          const part = PARTS.find(
            (p) =>
              p.carPartId === carPartId && p.grade === grade && p.fitmentClass === fitmentClass,
          )!
          const fraction = part.statModifiers.powerFraction[character]
          return { grade, yenPerFraction: fraction > 0 ? part.priceYen / fraction : null }
        }).filter(
          (row): row is { grade: Grade; yenPerFraction: number } => row.yenPerFraction !== null,
        )

        if (byGrade.length === 0) continue // fuelSystem/clutch never reach here; defensive only
        const raceRow = byGrade.find((row) => row.grade === 'race')!

        for (const row of byGrade) {
          const normalized = row.yenPerFraction / raceRow.yenPerFraction
          it(`${carPartId}/${fitmentClass}/${character}/${row.grade}: ${normalized.toFixed(3)}x race's yen-per-PS`, () => {
            expect(normalized).toBeLessThanOrEqual(MAX_ACCEPTABLE_SPREAD)
            expect(normalized).toBeGreaterThanOrEqual(1 / MAX_ACCEPTABLE_SPREAD)
          })
        }
      }
    }
  }
})
