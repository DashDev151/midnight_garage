import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type Buyer,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { marketValueYen } from '../src/marketValue'
import { channelBuyerTaste, tasteMatchFor, valuateCarForBuyer } from '../src/valuation'
import { buildCarInstance, carWithGrades, mintCarParts, uniformCarParts } from './testFixtures'

const PARTS_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]))
const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

// The real, shipped archetypes (buyers.json) - reused rather than hand-rolled,
// so a fixture can never quietly drift from what the game actually ships.
const collector = BUYERS.find((b) => b.id === 'collector')!
const firstTimer = BUYERS.find((b) => b.id === 'first-timer')!
const stancer = BUYERS.find((b) => b.id === 'stancer')!
const hobbyist = BUYERS.find((b) => b.id === 'hobbyist')!
const tuner = BUYERS.find((b) => b.id === 'tuner')!
const racer = BUYERS.find((b) => b.id === 'racer')!

const model: CarModel = {
  id: 'toyota-supra-rz-jza80',
  displayName: 'Toyota Supra RZ (JZA80)',
  brand: 'Toyota',
  parodyName: 'Suprema RZ (JZA80)',
  parodyBrand: 'Toyoda',
  spec: {
    chassisCode: 'JZA80',
    engineCode: '2JZ-GTE',
    culture: 'wangan',
    yearFrom: 1993,
    yearTo: 1993,
    curbWeightKg: 1590,
    stockPowerPs: 280,
    reliabilityBase: 94,
    styleBase: 74,
    styleCeiling: 95,
    aeroCeiling: 1,
  },
  tier: 'flagship',
  rarity: 'rare',
  origin: 'jdm',
  tags: ['FR', 'Turbo', 'Piston', '90s', 'JDM'],
  bookValueYen: 4_200_000,
}

const stockInstance: CarInstance = buildCarInstance({
  modelId: model.id,
  year: 1994,
  parts: uniformCarParts('fine'),
})

function valuate(buyer: Buyer, instance: CarInstance, heatPercent = 100) {
  return valuateCarForBuyer(
    buyer,
    model,
    instance,
    {},
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    heatPercent,
    ECONOMY,
  )
}

/** `valuate` against the REAL parts catalogue - needed by any fixture whose
 * point is what grade is fitted, since an unresolvable SKU reads as neither
 * stock nor anything else. */
function valuateWithCatalogue(buyer: Buyer, instance: CarInstance, heatPercent = 100) {
  return valuateCarForBuyer(
    buyer,
    model,
    instance,
    PARTS_BY_ID,
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    heatPercent,
    ECONOMY,
  )
}

describe('valuateCarForBuyer', () => {
  it('is pure: identical inputs produce an identical value', () => {
    const a = valuate(collector, stockInstance)
    const b = valuate(collector, stockInstance)
    expect(a).toBe(b)
  })

  it('never returns a negative value', () => {
    const wornOut = buildCarInstance({
      modelId: model.id,
      parts: uniformCarParts('scrap'),
    })
    const value = valuate(firstTimer, wornOut)
    expect(value).toBeGreaterThanOrEqual(0)
  })

  describe('taste (marketValue x bounded taste multiplier)', () => {
    const spread = ECONOMY.valuation.tasteSpread

    it('stays within [1 - tasteSpread, 1 + tasteSpread] of marketValueYen for any buyer', () => {
      const value = marketValueYen(model, stockInstance, 100, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
      for (const buyer of [collector, firstTimer]) {
        const valuation = valuate(buyer, stockInstance)
        expect(valuation).toBeGreaterThanOrEqual(Math.round(value * (1 - spread)))
        expect(valuation).toBeLessThanOrEqual(Math.round(value * (1 + spread)))
      }
    })

    /**
     * A swing, not an absolute ranking: the old "a high-authenticity car is
     * worth more to a Collector than a First-timer" assertion does not hold
     * in general - this stock Supra actually values HIGHER to the
     * first-timer, because the collector's own style target (0.5) and power
     * upper (0.5) also bite on a car authored with styleBase 20 and 280+ PS,
     * and neither buyer's overall match is authenticity alone.
     *
     * The swing can no longer be a PURE authenticity delta, and that is a
     * fact about the stat rather than a gap in the fixture: authenticity is
     * derived from which parts are fitted, and no taxonomy slot carries
     * authenticity weight alone, so any car that is less original is also a
     * different car in some other way. The two fixtures below are therefore
     * the same platform at the same band, one untouched and one heavily
     * built, which is the comparison the authored tables actually have to
     * get right: the collector's authenticity importance (1.0, target 0.9)
     * dwarfs the first-timer's (0.2, target 0.5), so building the car costs
     * the collector's price far more than the first-timer's.
     */
    it('modifying a car swings the Collector price far more than the First-timer price', () => {
      const authentic = carWithGrades(model, CONTEXT, {}, 'fine')
      const built = carWithGrades(
        model,
        CONTEXT,
        {
          block: 'race',
          internals: 'race',
          headValvetrain: 'race',
          camsTiming: 'race',
          gearbox: 'race',
          aero: 'race',
          rims: 'race',
          seats: 'race',
        },
        'fine',
      )
      // The catalogue has to be resolvable here, or neither car's grades can
      // be read and both would score identically.
      const collectorSwing =
        valuateWithCatalogue(collector, authentic) - valuateWithCatalogue(collector, built)
      const firstTimerSwing =
        valuateWithCatalogue(firstTimer, authentic) - valuateWithCatalogue(firstTimer, built)
      expect(collectorSwing).toBeGreaterThan(firstTimerSwing * 4)
    })
  })
})

describe('Sprint 146: taste is a match, not a mean', () => {
  const spread = ECONOMY.valuation.tasteSpread
  const ceiling = 1 + spread

  const silvia = CARS.find((c) => c.id === 'nissan-silvia-s13')!

  /**
   * The stancer's only real target is style (0.65, importance 1.00); power
   * and handling barely count (importance 0.10/0.05) and reliability/
   * authenticity are ignored outright (importance 0). This build clears
   * style comfortably (0.71) while genuinely being loud (a race aero kit
   * and forged wheels), no longer original (a kit, the wheels and the seats
   * are all somebody else's, and the seats are past their best) and
   * unreliable (a worn valvetrain and cooling system) - the archetype's
   * "loud, low, unreliable car" made concrete.
   */
  function buildLoudLowUnreliableSilvia(): CarInstance {
    return buildCarInstance({
      modelId: silvia.id,
      parts: mintCarParts({
        aero: {
          id: 'x-aero',
          partId: 'frp-race-aero',
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
        rims: {
          id: 'x-rims',
          partId: 'ronin-race-forged',
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
        seats: {
          id: 'x-seats',
          partId: 'zashiki-race-buckets',
          band: 'poor',
          origin: { kind: 'market', day: 1 },
        },
        headValvetrain: 'poor',
        cooling: 'poor',
      }),
    })
  }

  it('SMOKE: a loud, low, unreliable car reaches a match of 1.0 against the stancer', () => {
    const loudLowUnreliable = buildLoudLowUnreliableSilvia()
    // Sanity: this really is the loud/low/unreliable build the archetype
    // describes, not an accidentally-tidy one.
    const stats = computeDerivedStats(
      silvia,
      loudLowUnreliable,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    expect(stats.style).toBeGreaterThanOrEqual(65)
    // Modified enough to have given up any claim to being original: it fails
    // the concours gate outright. It does not go lower because three body
    // slots have no aftermarket SKU to fit, so 23 of the 100 authenticity
    // points are currently unreachable by modification.
    expect(stats.authenticity).toBeLessThan(ECONOMY.reputation.concoursSaleMinAuthenticityPercent)
    expect(stats.reliability).toBeLessThan(80)

    const value = marketValueYen(
      silvia,
      loudLowUnreliable,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
      // The stancer's own coherence tolerance (coherenceToleranceFor,
      // valuation.ts): economy.json's tolerance.stancer if set, else default.
      ECONOMY.valuation.tolerance.stancer ?? ECONOMY.valuation.tolerance.default,
    )
    const valuation = valuateCarForBuyer(
      stancer,
      silvia,
      loudLowUnreliable,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      PARTS_TAXONOMY_BY_ID,
      100,
      ECONOMY,
    )
    // A match of 1.0 is the top of the standard taste band: value x (1 + tasteSpread).
    expect(valuation).toBe(Math.round(value * ceiling))
  })

  it('exceeding a target earns nothing: a bigger style excess prices identically to a smaller one', () => {
    const atTarget = buildCarInstance({
      modelId: silvia.id,
      parts: mintCarParts({
        aero: {
          id: 'x-aero',
          partId: 'frp-race-aero',
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
        rims: {
          id: 'x-rims',
          partId: 'ronin-race-forged',
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
      }),
    })
    // The same build plus one more style-bearing slot, and deliberately a
    // slot that carries NOTHING else: a race dash is 11 style points with no
    // power fraction and no physical modifier at all, so the only thing
    // separating these two cars is how far each has closed its own style gap.
    // (Style is no longer additive, so "more excess" cannot be manufactured
    // by fitting a worn part: condition scales the whole result, and a poor
    // part drags the number DOWN however many points it carries.)
    const wellOverTarget = buildCarInstance({
      modelId: silvia.id,
      parts: mintCarParts({
        aero: {
          id: 'x-aero',
          partId: 'frp-race-aero',
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
        rims: {
          id: 'x-rims',
          partId: 'ronin-race-forged',
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
        dashGauges: {
          id: 'x-dash',
          partId: 'sokudo-digital-race-dash',
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
      }),
    })

    const atTargetStats = computeDerivedStats(
      silvia,
      atTarget,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    const overStats = computeDerivedStats(
      silvia,
      wellOverTarget,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    expect(atTargetStats.style).toBeGreaterThanOrEqual(65) // clears the stancer's target...
    expect(overStats.style).toBeGreaterThan(atTargetStats.style) // ...this build clears it by more...

    const tasteAtTarget = channelBuyerTaste(
      stancer,
      silvia,
      atTarget,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    const tasteOverTarget = channelBuyerTaste(
      stancer,
      silvia,
      wellOverTarget,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    // ...and yet the stancer pays exactly the same for both.
    expect(tasteOverTarget).toBe(tasteAtTarget)
  })

  it('an upper bound actively reduces a match: a caged, fully-built engine costs more with the First-timer than the stock car it started from', () => {
    const cityTurbo = CARS.find((c) => c.id === 'honda-city-turbo-ii-aa')!
    // The same "maximal forced-induction build, race grade throughout" shape
    // coherenceValuation.test.ts pins as genuinely coherent - reused here so
    // the caged car's reliability loss is the real reliabilityIntensityFactor
    // cost of that much power, not an artefact of an unsupported build.
    const ALL_RACE_SUPPORTED: Partial<Record<CarPartId, 'race'>> = {
      block: 'race',
      internals: 'race',
      headValvetrain: 'race',
      camsTiming: 'race',
      intake: 'race',
      exhaust: 'race',
      fuelSystem: 'race',
      ignitionEcu: 'race',
      cooling: 'race',
      forcedInduction: 'race',
      gearbox: 'race',
      clutch: 'race',
      driveline: 'race',
      differential: 'race',
    }
    const stockCar = carWithGrades(cityTurbo, CONTEXT, {}, 'mint')
    const cagedCar = carWithGrades(cityTurbo, CONTEXT, ALL_RACE_SUPPORTED, 'mint')

    const { power: stockPower } = computeDerivedStats(
      cityTurbo,
      stockCar,
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    const { power: cagedPower } = computeDerivedStats(
      cityTurbo,
      cagedCar,
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    const powerUpper = firstTimer.statTargets.power.upper!
    expect(stockPower / ECONOMY.statFormulas.powerNormalizationCeiling).toBeLessThanOrEqual(
      powerUpper,
    )
    expect(cagedPower / ECONOMY.statFormulas.powerNormalizationCeiling).toBeGreaterThan(powerUpper)

    const stockTaste = channelBuyerTaste(
      firstTimer,
      cityTurbo,
      stockCar,
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    const cagedTaste = channelBuyerTaste(
      firstTimer,
      cityTurbo,
      cagedCar,
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    expect(cagedTaste).toBeLessThan(stockTaste)
  })

  it('a specialised car beats a generalist one for the buyer it was built for, and loses for the buyer it was not', () => {
    const stockSilvia = buildCarInstance({ modelId: silvia.id, parts: uniformCarParts('mint') })
    const specialisedSilvia = buildLoudLowUnreliableSilvia()

    const stockVsStancer = channelBuyerTaste(
      stancer,
      silvia,
      stockSilvia,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    const specialisedVsStancer = channelBuyerTaste(
      stancer,
      silvia,
      specialisedSilvia,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    expect(specialisedVsStancer).toBeGreaterThan(stockVsStancer)

    const stockVsFirstTimer = channelBuyerTaste(
      firstTimer,
      silvia,
      stockSilvia,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    const specialisedVsFirstTimer = channelBuyerTaste(
      firstTimer,
      silvia,
      specialisedSilvia,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    expect(specialisedVsFirstTimer).toBeLessThan(stockVsFirstTimer)
  })

  /**
   * The Cappuccino itself (roster uid MG-028) isn't in the shipped
   * `cars.json` subset yet (builtInContent: no in
   * midnight-garage-roster.csv - it's still missing measured performance
   * figures), so this uses the Honda Beat PP1, the other shipped kei the
   * archetype's own flavour text names, against the flagship Supra.
   */
  it('the hobbyist prefers a small kei car to a fast flagship one', () => {
    const beat = CARS.find((c) => c.id === 'honda-beat-pp1')!
    const supra = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!
    const beatInstance = buildCarInstance({ modelId: beat.id, parts: uniformCarParts('mint') })
    const supraInstance = buildCarInstance({ modelId: supra.id, parts: uniformCarParts('mint') })

    const beatTaste = channelBuyerTaste(
      hobbyist,
      beat,
      beatInstance,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    const supraTaste = channelBuyerTaste(
      hobbyist,
      supra,
      supraInstance,
      PARTS_BY_ID,
      PARTS_TAXONOMY,
      ECONOMY,
      ceiling,
    )
    expect(beatTaste).toBeGreaterThan(supraTaste)
  })
})

describe('Sprint 146 amendment: shortfall normalisation', () => {
  /**
   * A car that clears NOTHING: every stat reads 0 against every buyer's
   * target. Under an absolute (unnormalized) shortfall, a target is
   * the shortfall's own ceiling, so a buyer whose targets are modest can
   * never be badly disappointed - measured floor per archetype, old
   * formula: collector 0.315, racer 0.298, stancer 0.413, tuner 0.446,
   * first-timer 0.451, hobbyist 0.497 (all `1 - importance-weighted
   * mean target`, the closed form of scoring every stat at 0). That is free
   * money on an unimproved car through a value-weighted buyer draw, and the
   * root cause `valueModelProbes.test.ts`'s instant-flip guard caught.
   *
   * Normalising each shortfall by the room it had to fall short in fixes
   * it structurally: missing a target entirely now costs that stat's full
   * importance, so a car satisfying nothing scores exactly 0 against every
   * archetype, not merely "worse than a car that satisfies something."
   */
  const nothingSatisfied = { power: 0, handling: 0, style: 0, reliability: 0, authenticity: 0 }

  it.each([
    ['collector', collector],
    ['racer', racer],
    ['stancer', stancer],
    ['tuner', tuner],
    ['first-timer', firstTimer],
    ['hobbyist', hobbyist],
  ] as const)(
    'a car satisfying nothing scores a match of exactly 0 against the %s',
    (_name, buyer) => {
      expect(tasteMatchFor(buyer.statTargets, nothingSatisfied)).toBe(0)
    },
  )
})
