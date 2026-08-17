import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type Grade,
  type Part,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carCostToMintYen } from '../src/bands'
import { zonePanelMassFactor, zonePanelValueYen, PANEL_ZONE_IDS } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { buildFactors } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import {
  expectationForCar,
  installedPartsValueYen,
  marketValueYen,
  retentionFor,
} from '../src/marketValue'
import { carWithGrades, zonePanelsAtGrade } from './testFixtures'

/**
 * What a set of body panels is WORTH and what it WEIGHS - the two things the
 * nine zones could not reach before sprint192.
 *
 * Both terms read the same walk of the zones (`fittedZonePanels`), and both
 * inherit the discounts that already apply to every other fitted part. They
 * differ in shape on purpose:
 *
 * - VALUE SUMS. Nine carbon panels are nine purchases at nine prices, and a
 *   car wearing the whole set has had nine times the money spent on it that a
 *   car wearing only a carbon bonnet has. A mean would price eight of those
 *   purchases at zero.
 * - MASS TAKES THE MEAN, exactly as style does. The nine zones are one shell
 *   between them, and 0.975 is authored as what a whole carbon set saves, not
 *   what one panel saves.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

const PARTS_BY_ID: Readonly<Record<string, Part>> = CONTEXT.partsById
const PARTS_TAXONOMY_BY_ID: Readonly<Record<CarPartId, CarPartTaxonomyEntry>> =
  CONTEXT.partsTaxonomyById

/** The Civic SiR-II: a real shipped car, `everyday` fitment class, and the
 * same one `style.test.ts` walks across its style range. */
const eg6 = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
const EG6_CLASS = fitmentClassForTier(eg6.tier)

/**
 * A mint car of `model` wearing `grade` panels on all nine zones, its stock
 * parts resolved at the model's OWN fitment class (`carWithGrades`) rather
 * than the fixture default - which is what real generation does, and what the
 * value and mass terms lean on: they read the class off the bodywork carrier
 * the car was generated with.
 */
function panelled(model: CarModel, grade: Grade): CarInstance {
  return {
    ...carWithGrades(model, CONTEXT, {}),
    zoneState: zonePanelsAtGrade(grade),
  }
}

/** One zone's own SKU at `grade`, read off the catalogue rather than restated. */
function panelSku(zoneId: string, grade: Grade): Part {
  return PARTS.find(
    (p) => p.zoneId === zoneId && p.fitmentClass === EG6_CLASS && p.grade === grade,
  )!
}

/** Retention at a fully coherent build - panels carry no support weight, so
 * every fixture in this file sits at `coherenceFactor` 1 and the ceiling. */
const RETENTION = retentionFor(1, ECONOMY)

function valueOf(car: CarInstance): number {
  return marketValueYen(eg6, car, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
}

describe('a set of body panels is worth what it cost, discounted like any other part', () => {
  it('sums the nine zones rather than averaging them - a full set is nine panels of money', () => {
    for (const grade of ['street', 'sport', 'race'] as const) {
      const oneEach = panelSku('bonnet', grade).priceYen
      expect(zonePanelValueYen(zonePanelsAtGrade(grade), PARTS_BY_ID, EG6_CLASS)).toBe(
        PANEL_ZONE_IDS.reduce((total, zoneId) => total + panelSku(zoneId, grade).priceYen, 0),
      )
      // Every zone prices off the same `bodyKit` basis at this grade, so the
      // sum is literally nine times one panel.
      expect(zonePanelValueYen(zonePanelsAtGrade(grade), PARTS_BY_ID, EG6_CLASS)).toBe(oneEach * 9)
    }
  })

  it('pays nothing for a stock shell or for a zone whose panel is gone', () => {
    expect(zonePanelValueYen(zonePanelsAtGrade('stock'), PARTS_BY_ID, EG6_CLASS)).toBe(0)
    const missingBonnet: ZoneStates = {
      ...zonePanelsAtGrade('race'),
      bonnet: { ...zonePanelsAtGrade('race').bonnet, panelMissing: true },
    }
    expect(zonePanelValueYen(missingBonnet, PARTS_BY_ID, EG6_CLASS)).toBe(
      panelSku('bonnet', 'race').priceYen * 8,
    )
  })

  it('reaches installedPartsValueYen at the caller’s own retention, exactly as a fitted part does', () => {
    const stock = panelled(eg6, 'stock')
    const carbon = panelled(eg6, 'race')
    expect(installedPartsValueYen(stock, PARTS_BY_ID, RETENTION, ECONOMY)).toBe(0)
    expect(installedPartsValueYen(carbon, PARTS_BY_ID, RETENTION, ECONOMY)).toBe(
      Math.round(zonePanelValueYen(carbon.zoneState!, PARTS_BY_ID, EG6_CLASS) * RETENTION),
    )
  })

  /**
   * The three measured figures on a mint Civic SiR-II (book ¥650,000,
   * `everyday` class): stock ¥715,000, a full street set ¥749,452, a full
   * carbon set ¥794,596. The ¥120,600 of carbon returns ¥79,596 of itself,
   * which is the existing model doing exactly what it does for a fitted
   * damper: retention credits the catalogue price in full on a coherent build
   * (`retentionCeiling` 1.1), and the tier's own `aftermarketReturn` then says
   * how much anyone really pays extra for a modified Civic (0.6). Both
   * discounts, no third rule.
   *
   * Sprint213.md item 3 adds a flat ¥65,000 (book x `everyday`'s own
   * `excellenceByTier` 0.10) to all three: every fixture here is mint,
   * coherent and at the mileage curve's own neutral point (0 km), so all
   * three clear the excellence gate identically - it rides on top of the
   * panel premium rather than competing with it.
   */
  it('walks a Civic from ¥715,000 stock to ¥749,452 in street panels to ¥794,596 in carbon', () => {
    expect(valueOf(panelled(eg6, 'stock'))).toBe(715_000)
    expect(valueOf(panelled(eg6, 'street'))).toBe(749_452)
    expect(valueOf(panelled(eg6, 'race'))).toBe(794_596)
  })

  it('returns exactly retention x the tier’s own aftermarketReturn, so a different car returns a different share', () => {
    const shareOn = (model: CarModel) => {
      const fitmentClass = fitmentClassForTier(model.tier)
      const carbon = panelled(model, 'race')
      const spentYen = zonePanelValueYen(carbon.zoneState!, PARTS_BY_ID, fitmentClass)
      const priceOf = (car: CarInstance) =>
        marketValueYen(model, car, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
      return (priceOf(carbon) - priceOf(panelled(model, 'stock'))) / spentYen
    }
    const expectedShare = (model: CarModel) =>
      RETENTION * expectationForCar(model, ECONOMY).aftermarketReturn

    const gtr = CARS.find((c) => c.id === 'nissan-skyline-gtr-bnr32')!
    expect(shareOn(eg6)).toBeCloseTo(expectedShare(eg6), 3)
    expect(shareOn(gtr)).toBeCloseTo(expectedShare(gtr), 3)
    expect(shareOn(gtr)).not.toBeCloseTo(shareOn(eg6), 3)
  })

  /**
   * The double-count guard. A panel's catalogue price reaches value through
   * exactly one term. The restoration bill quotes a STOCK panel and only for a
   * zone that needs one at all, so fitting carbon changes nothing about it;
   * `pricePaidYen` posts to the car's `partsYen` ledger, which is what the car
   * has cost its owner and is never read by any price.
   */
  it('does not also reach the restoration bill - the bill quotes stock panels whatever is fitted', () => {
    const billOf = (car: CarInstance) =>
      carCostToMintYen(car, eg6, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
    expect(billOf(panelled(eg6, 'race'))).toBe(billOf(panelled(eg6, 'stock')))
  })
})

describe('carbon body panels save weight, and it is worth almost nothing in lap time', () => {
  it('reads the authored 0.975 for a full carbon set and 1.0 for everything below race', () => {
    expect(zonePanelMassFactor(zonePanelsAtGrade('race'), PARTS_BY_ID, EG6_CLASS)).toBeCloseTo(
      0.975,
      6,
    )
    for (const grade of ['stock', 'street', 'sport'] as const) {
      expect(zonePanelMassFactor(zonePanelsAtGrade(grade), PARTS_BY_ID, EG6_CLASS)).toBe(1)
    }
  })

  it('pays a partial set its share: four carbon corners read about 0.989', () => {
    const corners: ZoneStates = { ...zonePanelsAtGrade('stock') }
    const race = zonePanelsAtGrade('race')
    for (const zoneId of ['left-front', 'right-front', 'left-rear', 'right-rear'] as const) {
      corners[zoneId] = { ...race[zoneId] }
    }
    expect(zonePanelMassFactor(corners, PARTS_BY_ID, EG6_CLASS)).toBeCloseTo((5 + 4 * 0.975) / 9, 6)
    expect(zonePanelMassFactor(corners, PARTS_BY_ID, EG6_CLASS)).toBeCloseTo(0.9889, 4)
  })

  it('reaches buildFactors through the bodywork carrier, so the car actually runs lighter', () => {
    expect(buildFactors(panelled(eg6, 'stock'), PARTS_BY_ID, ECONOMY).mass).toBe(1)
    expect(buildFactors(panelled(eg6, 'race'), PARTS_BY_ID, ECONOMY).mass).toBeCloseTo(0.975, 6)
  })

  /**
   * The honest figure, on a mint Civic SiR-II. `build.mass` reaches exactly two
   * quantities in `carBlock` - net acceleration and terminal speed - and
   * nothing else: cornering solves on `mu` and braking on `brakeMu`, both
   * mass-free. So 2.5 per cent off the kerb weight buys about two tenths of a
   * second over a two-minute lap, which is a fifth of a per cent:
   *
   *   Hakone     122.245 -> 122.007   0.238s
   *   Wangan     150.038 -> 149.857   0.181s
   *   Misaki     116.322 -> 116.198   0.124s
   *   Yatabe      26.888 ->  26.749   0.139s (a standing kilometre, so all of
   *                                           it is acceleration)
   *
   * It scales linearly with the mass saved: the whole existing race-mass
   * ladder is 10 per cent and worth 0.954s around Hakone, so carbon panels are
   * a quarter of that for a quarter of the weight. The public readout rounds
   * to a tenth, so what a player sees is one or two tenths.
   */
  it('is worth about two tenths of a second on a Civic around Hakone, and less everywhere else', () => {
    const lapOf = (grade: Grade, courseId: string) =>
      lapTimeSecondsFor(panelled(eg6, grade), eg6, CONTEXT, courseId)!
    for (const courseId of ['hakone', 'wangan', 'misaki', 'yatabe']) {
      const gain = lapOf('stock', courseId) - lapOf('race', courseId)
      expect(gain, courseId).toBeGreaterThan(0)
      expect(gain, courseId).toBeLessThan(0.3)
    }
    expect(lapOf('stock', 'hakone')).toBeCloseTo(122.2, 5)
    expect(lapOf('race', 'hakone')).toBeCloseTo(122.0, 5)
  })
})
