import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarPartId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { marketValueYen } from '../src/marketValue'
import { channelBuyerTaste } from '../src/valuation'
import {
  buildCarInstance,
  mintCarParts,
  testSceneStanding,
  type CarPartOverride,
} from './testFixtures'

/**
 * The scene-standing arc's own acceptance test (docs/sprints/
 * scene-standing-arc.md, docs/sprints/sprint181.md): give two players with
 * different scene standings the same auction sheet, and their shortlists
 * should differ - the Show Crowd shop wants the rust-free shell, the Touge
 * shop wants the tired chassis with good bones.
 *
 * There is no literal "shortlist" feature to call, and there is no honest
 * way to compare the two cars by final SALE PRICE either: `marketValueYen`
 * is deliberately stat-blind (the money law this whole arc leaves
 * untouched), so a build's own parts bill moves the price by exactly how
 * expensive fitting race-grade suspension against race-grade wheels
 * happens to be, a fact with nothing to do with scene standing at all -
 * measured and rejected as the test's own metric below, not assumed. What
 * scene standing actually touches, named as such in the design of record,
 * is TASTE - "who pays a bit more, and through which channel"
 * (`channelBuyerTaste`, the design's own single insertion point for
 * standing). That is what this test compares: for the same two builds, does
 * a shop's own scene standing change which one that shop's own buyer rates
 * higher.
 *
 * Built from real content throughout - real buyer stat targets
 * (`buyers.json`), the real taste formula (`tasteMatchFor`/
 * `normalizedTasteScore`), real derived stats off real fitted parts
 * (`computeDerivedStats`), and the real scene-standing band
 * (`channelBuyerTaste`'s own `sceneStandingBandFor`) - so this proves the
 * pipeline coheres end to end rather than asserting a formula in isolation.
 *
 * `tasteMatchFor` gives no credit for clearing a target further than
 * exactly clearing it, so a build that is merely neutral on the axis it
 * doesn't chase still clears a buyer's own modest target and the two
 * builds stop reading as different cars at all. Both builds below actively
 * ruin the axis they don't chase (stock parts rolled to `poor`) rather than
 * leaving it at the neutral mint-stock baseline, for exactly that reason.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const MODEL = CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!
const FITMENT_CLASS = fitmentClassForTier(MODEL.tier)
const SHOW_CROWD_BUYER = BUYERS.find((b) => b.archetype === 'show-crowd')!
const TOUGE_BUYER = BUYERS.find((b) => b.archetype === 'touge')!

// Pure-style slots (parts-taxonomy.json: style weight > 0, handling weight 0)
// and pure-handling slots (handling weight > 0, style weight 0).
const STYLE_SLOTS: readonly CarPartId[] = ['rims', 'bodywork', 'paint', 'seats', 'dashGauges']
const HANDLING_SLOTS: readonly CarPartId[] = [
  'dampers',
  'springs',
  'antiRollBars',
  'steering',
  'brakePadsDiscs',
  'brakeCalipersLines',
  'tyres',
]

/** Fits race-grade, mint parts into every slot in `upSlots` and rolls every
 * slot in `downSlots` down to a neglected, stock-grade `poor` - everything
 * else stays the plain mint-stock baseline `mintCarParts` gives. */
function buildTunedCar(
  upSlots: readonly CarPartId[],
  downSlots: readonly CarPartId[],
): CarInstance {
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const partId of upSlots) {
    const part = CONTEXT.aftermarketPartByCarPartId[FITMENT_CLASS][partId]?.race
    if (!part) continue
    overrides[partId] = {
      id: `up-${partId}`,
      partId: part.id,
      band: 'mint',
      origin: { kind: 'market', day: 1 },
    }
  }
  for (const partId of downSlots) {
    const part = CONTEXT.stockPartByCarPartId[FITMENT_CLASS][partId]
    if (!part) continue
    overrides[partId] = {
      id: `down-${partId}`,
      partId: part.id,
      band: 'poor',
      origin: { kind: 'market', day: 1 },
    }
  }
  return buildCarInstance({ modelId: MODEL.id, parts: mintCarParts(overrides) })
}

/** The rust-free shell: built up for show, and its mechanical side left to
 * rot - a real car a Show Crowd buyer wants and a Touge buyer does not. */
const styleCar = buildTunedCar(STYLE_SLOTS, HANDLING_SLOTS)

/** The tired chassis with good bones: built up for the pass, its cosmetics
 * left neglected - a real car a Touge buyer wants and a Show Crowd buyer
 * does not. */
const handlingCar = buildTunedCar(HANDLING_SLOTS, STYLE_SLOTS)

const SHOP_FRONT_CEILING = ECONOMY.sellingChannels.shopFront.tasteCeiling!

/** The taste multiplier `sceneStanding` earns selling `car` to `buyer` off
 * the plain shop front (tasteCeiling 1.0 - the channel itself contributes
 * no ceiling of its own, so the whole effect measured is the scene's own
 * band). This is `channelBuyerTaste`, the exact function the design of
 * record names as the one insertion point for per-scene standing - never
 * the final yen price, which also carries the two builds' own unrelated
 * parts bill (see the module doc above). */
function tasteFor(
  buyer: typeof SHOW_CROWD_BUYER,
  car: CarInstance,
  sceneStanding: ReturnType<typeof testSceneStanding>,
): number {
  return channelBuyerTaste(
    buyer,
    MODEL,
    car,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomy,
    ECONOMY,
    SHOP_FRONT_CEILING,
    sceneStanding,
  )
}

describe('the arc acceptance test: two players, different standing, different shortlist', () => {
  it('measures a real style/handling split between the two builds (sanity, not assumed)', () => {
    const styleStats = computeDerivedStats(
      MODEL,
      styleCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    const handlingStats = computeDerivedStats(
      MODEL,
      handlingCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      ECONOMY,
    )
    expect(styleStats.style).toBeGreaterThan(handlingStats.style)
    expect(handlingStats.handling).toBeGreaterThan(styleStats.handling)
    // Each build clears the modest target its OWN scene cares about and
    // misses the other's - real stat points (0-100) against buyers.json.
    expect(styleStats.style / 100).toBeGreaterThanOrEqual(SHOW_CROWD_BUYER.statTargets.style.target)
    expect(handlingStats.style / 100).toBeLessThan(SHOW_CROWD_BUYER.statTargets.style.target)
  })

  it('measures why final SALE PRICE would be the wrong metric: the stat-blind base value the two builds carry already differs before any taste is applied', () => {
    // Recorded so choosing `channelBuyerTaste` over a price comparison above
    // is a measured decision, not an assumed one. `marketValueYen` is
    // deliberately stat-blind (the money law this arc leaves untouched): it
    // prices condition and installed parts, never style or handling. Fitting
    // seven race-grade suspension/brake parts against five race-grade
    // cosmetic ones is a real, unrelated difference in what is bolted to the
    // car, and it shows up here - exactly why a price comparison would have
    // conflated "who this car suits" with "what this car cost to fit."
    const styleCarValue = marketValueYen(
      MODEL,
      styleCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    const handlingCarValue = marketValueYen(
      MODEL,
      handlingCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    expect(styleCarValue).not.toBe(handlingCarValue)
  })

  it('the Show Crowd shop (standing at Shop in show-crowd only) rates the style build higher than the handling build', () => {
    const showCrowdShop = testSceneStanding({ 'show-crowd': 'shop' })
    const onStyleCar = tasteFor(SHOW_CROWD_BUYER, styleCar, showCrowdShop)
    const onHandlingCar = tasteFor(SHOW_CROWD_BUYER, handlingCar, showCrowdShop)
    expect(onStyleCar).toBeGreaterThan(onHandlingCar)
  })

  it('the Touge shop (standing at Shop in touge only) rates the handling build higher than the style build', () => {
    const tougeShop = testSceneStanding({ touge: 'shop' })
    const onHandlingCar = tasteFor(TOUGE_BUYER, handlingCar, tougeShop)
    const onStyleCar = tasteFor(TOUGE_BUYER, styleCar, tougeShop)
    expect(onHandlingCar).toBeGreaterThan(onStyleCar)
  })

  it('the two shops disagree on which of the two cars is the better build to have bid on', () => {
    // Each shop's own scene, raised to Shop, rating BOTH cars - the actual
    // choice a shop weighs staring at the same auction sheet: "of these
    // two, which is worth more to ME."
    const showCrowdShop = testSceneStanding({ 'show-crowd': 'shop' })
    const tougeShop = testSceneStanding({ touge: 'shop' })

    const showCrowdOnStyle = tasteFor(SHOW_CROWD_BUYER, styleCar, showCrowdShop)
    const showCrowdOnHandling = tasteFor(SHOW_CROWD_BUYER, handlingCar, showCrowdShop)
    const tougeOnStyle = tasteFor(TOUGE_BUYER, styleCar, tougeShop)
    const tougeOnHandling = tasteFor(TOUGE_BUYER, handlingCar, tougeShop)

    // Each shop's own better-rated car, named rather than left as a bool -
    // the actual "shortlist" claim is that these two names differ.
    const showCrowdShopPicks = showCrowdOnStyle > showCrowdOnHandling ? 'style' : 'handling'
    const tougeShopPicks = tougeOnStyle > tougeOnHandling ? 'style' : 'handling'

    expect(showCrowdShopPicks).toBe('style')
    expect(tougeShopPicks).toBe('handling')
    expect(showCrowdShopPicks).not.toBe(tougeShopPicks)
  })

  it("a fresh shop (no standing anywhere) rates the same matched car lower than a shop standing at Shop in that car's own scene", () => {
    // Anti-lock-in check (design section 8): the effect measured above is
    // standing's, not some quirk of the two builds or the plain shop front -
    // raising a scene's own standing rates a MATCHED car higher than a
    // fresh shop (every scene at none) rates the identical car.
    const freshShop = testSceneStanding()
    const showCrowdOnStyleFresh = tasteFor(SHOW_CROWD_BUYER, styleCar, freshShop)
    const showCrowdOnStyleRaised = tasteFor(
      SHOW_CROWD_BUYER,
      styleCar,
      testSceneStanding({ 'show-crowd': 'shop' }),
    )
    expect(showCrowdOnStyleRaised).toBeGreaterThan(showCrowdOnStyleFresh)
  })
})
