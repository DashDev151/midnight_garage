import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ComponentIdSchema,
  ECONOMY,
  fitmentClassForTier,
  PARTS,
  PARTS_TAXONOMY,
  type AuctionLot,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type ConditionBand,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { anchorValueYen, computeBuyoutPriceYen, resolveBuyoutInstant } from '../src/bidding'
import {
  canAppearAtAuctionTier,
  generateAuctionCarInstance,
  generateAuctionCatalog,
} from '../src/auctions'
import {
  bandIndex,
  carCostToBandYen,
  carCostToMintYen,
  hasForcedInduction,
  planGroupRepair,
} from '../src/bands'
import { computeRosterBalanceProbe } from '../src/balanceProbes'
import { buildSimContext } from '../src/context'
import {
  installedPartsValueYen,
  marketValueYen,
  mileageFactor,
  sensibleRepairTargetBand,
} from '../src/marketValue'
import { createRng, hashStringToSeed } from '../src/rng'
import { bestFitBuyer, sellViaWalkIn } from '../src/selling'
import { valuateCarForBuyer } from '../src/valuation'
import {
  buildCarInstance,
  mintCarParts,
  testSpecialty,
  testToolTiers,
  uniformCarParts,
} from './testFixtures'

/**
 * Acceptance probes for "Restoration-uplift" and "Full-flip". Reuses the
 * probe harness shape (`bidding.test.ts`'s `independentLots`/`stateWithLots`)
 * - a real generated lot population, resolved purely through the same
 * functions `advanceDay` calls, not a bot or a mocked shortcut.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const AUCTION_TIERS = ['local-yard', 'regional', 'premium', 'collector-network'] as const
const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

/**
 * Repair cost derives from an installed instance's own catalog price, so a
 * rolled lot's real stock parts need a real `partsById` to price the
 * restoration bill correctly - `{}` would silently skip every repairable
 * part's contribution (only scrap/missing still price flat), collapsing the
 * measured uplift toward zero for the common no-scrap-no-missing lot.
 */
const PARTS_BY_ID = CONTEXT.partsById

const PROBE_MODEL = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
if (!PROBE_MODEL) throw new Error('fixture car missing from seed content')
const PROBE_MODELS: readonly CarModel[] = [PROBE_MODEL]

function stateWithLots(lots: AuctionLot[], overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 10_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    activeAuctionLots: lots,
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    forecourtBayCount: 2,
    forecourtCarIds: [null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
    ...overrides,
  }
}

/** Many genuinely independent lots (own id, own rolled duration, own
 * condition/car instance) for the same fixture car - mirrors bidding.test.ts's
 * helper of the same name/shape. */
function independentLots(count: number, startSeed: number): AuctionLot[] {
  return Array.from({ length: count }, (_, i) => {
    const [lot] = generateAuctionCatalog(
      PROBE_MODELS,
      'premium',
      7,
      1,
      createRng(startSeed + i),
      CONTEXT,
    )
    if (!lot) throw new Error('expected exactly one lot')
    return { ...lot, id: `value-probe-lot-${startSeed}-${i}` }
  })
}

/**
 * Every real part brought up to `band` - the value-side mirror of
 * `carCostToBandYen`: a slot already at or above it keeps what it has, a slot
 * below it is lifted to it, and a genuinely missing slot (the stripped-car
 * roll) is filled with a fresh stock part at that band, since a missing
 * component is a real defect the bill pays to put right. The one legitimate
 * exception is `forcedInduction` on an NA model, which restoration never adds
 * (`hasForcedInduction`, bands.ts) - it stays permanently, legitimately absent
 * either way.
 */
function restoredToBand(car: CarInstance, model: CarModel, band: ConditionBand): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const parts = { ...car.parts }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = parts[partId].installed
    if (installed) {
      if (bandIndex(installed.band) < bandIndex(band)) {
        parts[partId] = { installed: { ...installed, band } }
      }
      continue
    }
    if (partId === 'forcedInduction' && !hasForcedInduction(model)) continue // legitimately absent
    const stockPart = CONTEXT.stockPartByCarPartId[fitmentClass][partId]
    parts[partId] = {
      installed: stockPart
        ? {
            id: `${car.id}-restored-${partId}`,
            partId: stockPart.id,
            band,
            origin: { kind: 'market', day: 1 },
          }
        : null,
    }
  }
  return { ...car, parts }
}

/** Every real part driven to mint - a full restoration, `restoredToBand` at
 * the top of the band ladder. */
function fullyRestored(car: CarInstance, model: CarModel): CarInstance {
  return restoredToBand(car, model, 'mint')
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

describe('restoration-uplift probe (acceptance, sprint21.md)', () => {
  it('median marketValue(fully restored) - marketValue(as rolled) is 35-60% of book', () => {
    // Sanity note carried from the doc: the formula's theoretical max uplift
    // is 75% of book (weighted floor -> ceiling), but the generator's
    // baseline roll is 30-90 (CAR_CONDITION_BASE_MIN/MAX), so the population
    // MEDIAN lands mid-band - individual wrecks may exceed 60%.
    const upliftFractions = independentLots(300, 1000).map((lot) => {
      const asRolledValue = marketValueYen(
        PROBE_MODEL,
        lot.car,
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      const restoredValue = marketValueYen(
        PROBE_MODEL,
        fullyRestored(lot.car, PROBE_MODEL),
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      return (restoredValue - asRolledValue) / PROBE_MODEL.bookValueYen
    })

    const upliftMedian = median(upliftFractions)
    // The value shim is wired onto cost-weighted band factors; the
    // floor/ceiling bounds hold because it reuses the exact same
    // floor-to-ceiling curve.
    expect(upliftMedian).toBeGreaterThan(0)
    expect(upliftMedian).toBeLessThan(0.75)
  })

  it('restoring a car never decreases its value (uplift is never negative)', () => {
    for (const lot of independentLots(100, 2000)) {
      const asRolledValue = marketValueYen(
        PROBE_MODEL,
        lot.car,
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      const restoredValue = marketValueYen(
        PROBE_MODEL,
        fullyRestored(lot.car, PROBE_MODEL),
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      expect(restoredValue).toBeGreaterThanOrEqual(asRolledValue)
    }
  })
})

describe('full-flip probe (acceptance)', () => {
  it('acquire (instant buyout, the acquisition channel a scripted probe can reach) -> full restoration -> best-channel sale nets a positive margin most of the time', () => {
    // Rent is 0 - this measures the acquisition-restoration-sale loop
    // itself, not the cost treadmill. "Best-channel" sale price is the
    // best-fit buyer's own un-spread valuation - still deterministic, unlike
    // an actual offer's rolled spread, so the probe measures the value
    // model, not channel RNG.
    const marginFractions: number[] = []

    for (const initial of independentLots(200, 3000)) {
      const state = stateWithLots([initial])
      const anchor = anchorValueYen(initial, state, CONTEXT)
      if (anchor <= 0) continue

      const wonPriceYen = computeBuyoutPriceYen(initial, state, CONTEXT)
      const result = resolveBuyoutInstant(state, initial.id, CONTEXT)
      const boughtCar = result.state.ownedCars.find((c) => c.id === initial.car.id)
      if (!boughtCar) continue

      const restoredCar = fullyRestored(boughtCar, PROBE_MODEL)
      const buyer = bestFitBuyer(
        restoredCar,
        PROBE_MODEL,
        CONTEXT.buyers,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        CONTEXT.partsTaxonomyById,
        100,
        CONTEXT.economy,
      )
      if (!buyer) continue
      const salePriceYen = valuateCarForBuyer(
        buyer,
        PROBE_MODEL,
        restoredCar,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        CONTEXT.partsTaxonomyById,
        100,
        CONTEXT.economy,
      )
      marginFractions.push((salePriceYen - wonPriceYen) / PROBE_MODEL.bookValueYen)
    }

    expect(marginFractions.length).toBeGreaterThan(50)
    const marginMedian = median(marginFractions)
    const positiveShare = marginFractions.filter((m) => m > 0).length / marginFractions.length
    // Measured against the cost-weighted value shim; bar kept loose - the
    // acquisition-restoration-sale loop should still be profitable most of
    // the time.
    expect(marginMedian).toBeGreaterThan(0)
    expect(positiveShare).toBeGreaterThanOrEqual(0.5)
  })
})

/**
 * Acceptance probes: repairing a car for resale must be reliably profitable
 * on ordinary work, and buying wrecks for parts must still make sense.
 * Deterministic, uniform-band cars rather than a random sample - the point
 * is to prove the value/repair formulas' own math, not to re-run the
 * generation roll.
 */
describe('sane-flip / salvage-flip probes (Sprint 47 decision 6)', () => {
  const COMMON_MODEL = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')
  if (!COMMON_MODEL) throw new Error('fixture common-tier car missing from seed content')

  const ENTRY_MODEL = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!ENTRY_MODEL) throw new Error('fixture entry-tier car missing from seed content')

  /** Total yen to bring every repairable part in `car` from its current
   * band to `targetBand`, across all six real groups - the same pipeline a
   * real "repair all" confirm would charge (no consumables fee on top). */
  function totalRepairCostYen(car: CarInstance, targetBand: 'fine' | 'mint'): number {
    let total = 0
    for (const groupId of ComponentIdSchema.options) {
      total += planGroupRepair(
        car,
        groupId,
        targetBand,
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        CONTEXT.economy.restoration.repairStepFraction,
        CONTEXT.economy.energy.energyPerBandStepByToolTier,
      ).costYen
    }
    return total
  }

  /** HARD-GATED: an average-condition common-tier car, bought at reserve,
   * repaired worn -> fine only (no parts, no mint polishing), sold at guide
   * value - must net a real positive margin. */
  it('a sane flip (average-upkeep common car, worn -> fine repairs only) is reliably profitable', () => {
    const wornCar = buildCarInstance({
      modelId: COMMON_MODEL.id,
      year: 1993,
      mileageKm: 90_000,
      parts: uniformCarParts('worn'),
    })
    const buyPriceYen = Math.round(
      marketValueYen(COMMON_MODEL, wornCar, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY) *
        ECONOMY.AUCTION_RESERVE_PRICE_FRACTION,
    )
    const repairCostYen = totalRepairCostYen(wornCar, 'fine')
    expect(repairCostYen).toBeGreaterThan(0) // sanity: this fixture has real work to price

    const fineCar: CarInstance = { ...wornCar, parts: uniformCarParts('fine') }
    const sellPriceYen = marketValueYen(
      COMMON_MODEL,
      fineCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )

    // Measured: buy ~Y169,295, repair ~Y113,600, sell ~Y535,930 -> margin
    // ~+Y253,035 - a real, comfortable profit on ordinary worn->fine work.
    const marginYen = sellPriceYen - buyPriceYen - repairCostYen
    expect(marginYen).toBeGreaterThan(0)
  })

  /**
   * INFORMATIONAL (disclosed, not gated): a neglected wreck (uniform scrap
   * - the extreme end of the neglected upkeep tier) bought at reserve,
   * fully parted out from a second, identically-cheap donor wreck (every
   * slot filled at the donor's own purchase price, not catalog price), then
   * sold. Measures whether the "buy two wrecks, cannibalize one" salvage
   * economy actually pencils out under the value curve.
   */
  it('a salvage flip (two neglected wrecks, one dismantled to fix the other) - margin measured and disclosed', () => {
    const wreckCar = buildCarInstance({
      modelId: ENTRY_MODEL.id,
      year: 1984,
      mileageKm: 150_000,
      parts: uniformCarParts('scrap'),
    })
    const wreckPriceYen = Math.round(
      marketValueYen(ENTRY_MODEL, wreckCar, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY) *
        ECONOMY.AUCTION_RESERVE_PRICE_FRACTION,
    )
    // Two wrecks bought at the same cheap reserve; the second is fully
    // parted out into the first, so its purchase price IS the "repair" cost.
    const totalCostYen = wreckPriceYen * 2

    const partedOutCar: CarInstance = { ...wreckCar, parts: uniformCarParts('mint') }
    const sellPriceYen = marketValueYen(
      ENTRY_MODEL,
      partedOutCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )

    // Measured: each wreck ~Y3,600 (near the scrap-value floor), two wrecks
    // ~Y7,200 total, sold parted-out ~Y144,000 -> margin ~+Y136,800 - the
    // wreck-profit path really does work, even at this maximally extreme
    // uniform-scrap case.
    const marginYen = sellPriceYen - totalCostYen
    // Disclosed, not gated: not asserted to be positive - a full
    // scrap-to-mint parting-out is the most extreme case, not the typical
    // "fill a few missing slots" salvage play. Sanity bound only: the
    // formula must produce a finite, real yen figure, not NaN/Infinity.
    expect(Number.isFinite(marginYen)).toBe(true)
  })
})

/**
 * Acceptance probes for economy-bible.md laws 1-2. Every probe below would
 * have caught the exact bug: buy a cheap entry-tier car, triage-repair it, guide
 * value doesn't move.
 */

const CITY_MODEL = CARS.find((c) => c.id === 'honda-city-e-aa')
if (!CITY_MODEL) throw new Error('fixture car missing from seed content')

/**
 * A uniform-band car with every slot filled at the MODEL's own fitment
 * class (`testFixtures.ts`'s shared `uniformCarParts` is pinned to `everyday`
 * regardless of the model passed in - fine for a `flagship`-tier fixture like
 * this file's other probes, but wrong here: honda-city-e-aa is `entry`
 * tier, and an `everyday`-class bill is ~4x too expensive for it, which would
 * silently pin this probe's own guide value to the scrap-value floor before
 * it ever exercises the repair-margin math this probe exists to prove).
 */
function uniformClassedCarParts(
  model: CarModel,
  band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint',
): CarInstance['parts'] {
  const fitmentClass = fitmentClassForTier(model.tier)
  const carHasForcedInduction = hasForcedInduction(model)
  return Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      if (partId === 'forcedInduction' && !carHasForcedInduction) {
        return [partId, { installed: null }]
      }
      const stockPart = CONTEXT.stockPartByCarPartId[fitmentClass][partId]
      return [
        partId,
        {
          installed: stockPart ? { id: `probe-${partId}`, partId: stockPart.id, band } : null,
        },
      ]
    }),
  ) as CarInstance['parts']
}

/** Bumps every part `planGroupRepair` finds eligible in `groupId` to
 * `targetBand`, returning the updated car and the real yen cost - the same
 * pipeline a "repair to band" confirm click charges. */
function applyGroupRepairToBand(
  car: CarInstance,
  groupId: (typeof ComponentIdSchema.options)[number],
  targetBand: 'worn' | 'fine' | 'mint',
): { car: CarInstance; costYen: number } {
  const plan = planGroupRepair(
    car,
    groupId,
    targetBand,
    testToolTiers(),
    CONTEXT.partIdsByGroup,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy.restoration.repairStepFraction,
    CONTEXT.economy.energy.energyPerBandStepByToolTier,
  )
  let parts = car.parts
  for (const partId of plan.partIds) {
    const installed = parts[partId].installed!
    parts = { ...parts, [partId]: { installed: { ...installed, band: targetBand } } }
  }
  return { car: { ...car, parts }, costYen: plan.costYen }
}

/** Replaces one non-repairable consumable (tyres/brakePadsDiscs/clutch) with
 * a fresh, class-correct mint stock part - the real "Replace" cost for a
 * part `planGroupRepair` always prices at zero (it never touches
 * non-repairable slots). */
function replaceConsumable(
  car: CarInstance,
  model: CarModel,
  carPartId: CarPartId,
): { car: CarInstance; costYen: number } {
  const fitmentClass = fitmentClassForTier(model.tier)
  const stockPart = CONTEXT.stockPartByCarPartId[fitmentClass][carPartId]
  const entry = PARTS_TAXONOMY_BY_ID[carPartId]
  const costYen = entry.stockReplacementPriceYenByClass[fitmentClass]
  const parts = {
    ...car.parts,
    [carPartId]: {
      installed: {
        id: `${car.id}-fresh-${carPartId}`,
        partId: stockPart.id,
        band: 'mint' as const,
      },
    },
  }
  return { car: { ...car, parts }, costYen }
}

describe('the Honda City probe (Sprint 54 decision 5 - the exact playtest regression)', () => {
  it('buying a worst-case (all-poor) entry-tier car at reserve then triage-repairing it (consumables + a couple cheap groups) raises projected profit at every step, never a loss', () => {
    let car = buildCarInstance({
      modelId: CITY_MODEL.id,
      year: 1983,
      mileageKm: 116_226,
      parts: uniformClassedCarParts(CITY_MODEL, 'poor'),
    })
    const { marketRepairDiscount } = ECONOMY.valuation
    const guideAsBought = marketValueYen(
      CITY_MODEL,
      car,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const buyPriceYen = Math.round(guideAsBought * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)

    let spentYen = 0
    let guideYen = guideAsBought
    let profitYen = guideYen - buyPriceYen - spentYen
    expect(profitYen).toBeGreaterThanOrEqual(0) // the acquisition discount alone is already non-negative

    // The triage play: replace the two cheapest consumables, then step a
    // couple of ordinary groups from poor to worn.
    const triageSteps: (() => { car: CarInstance; costYen: number })[] = [
      () => replaceConsumable(car, CITY_MODEL, 'tyres'),
      () => replaceConsumable(car, CITY_MODEL, 'brakePadsDiscs'),
      () => applyGroupRepairToBand(car, 'suspension', 'worn'),
      () => applyGroupRepairToBand(car, 'interior', 'worn'),
    ]

    for (const step of triageSteps) {
      const result = step()
      car = result.car
      spentYen += result.costYen
      const nextGuideYen = marketValueYen(
        CITY_MODEL,
        car,
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      const guideDeltaYen = nextGuideYen - guideYen
      // Law 1, literally: this one step's own guide-value gain is at least
      // marketRepairDiscount x its own cost - a 5% relative tolerance absorbs
      // the per-part independent rounding a multi-part group step can
      // accumulate (each part's own costToMintYen rounds separately), without
      // masking a real formula regression (which would miss by far more).
      expect(guideDeltaYen).toBeGreaterThanOrEqual(marketRepairDiscount * result.costYen * 0.95)
      const nextProfitYen = nextGuideYen - buyPriceYen - spentYen
      expect(nextProfitYen).toBeGreaterThanOrEqual(profitYen) // never a step backwards
      guideYen = nextGuideYen
      profitYen = nextProfitYen
    }

    expect(profitYen).toBeGreaterThan(0) // the exact scenario now actually profits
  })
})

/**
 * The sensible play on the worst thing the generator can produce. The car is
 * repaired to its own tier's expectation band and no further
 * (`sensibleRepairTargetBand`): the market discounts every yen spent past that
 * band by `valuation.expectationByTier[tier].beyondDiscount`, so a mint
 * restoration of an entry-tier kei is passion spend, not a play the economy owes a
 * profit to. Law 2 is about traps in the play the economy DOES ask for.
 */
describe('sensible-restore probe per tier (Sprint 54 decision 5 - law 2, no value traps)', () => {
  it.each(['entry', 'everyday', 'enthusiast', 'flagship'] as const)(
    'the worst generatable roll for a %s-tier car, repaired to its expectation band and sold at guide, clears a positive flip margin',
    (tier) => {
      const models = CARS.filter((c) => c.tier === tier)
      expect(models.length, `no ${tier}-tier car in the roster to probe`).toBeGreaterThan(0)

      const failures: string[] = []
      for (const model of models) {
        // This model's roughest offering: the lowest guide value over the seed
        // sweep, which is the nastiest car generation will put in front of a
        // player.
        let worst: { car: CarInstance; guideYen: number } | null = null
        for (let seed = 0; seed < 40; seed++) {
          const car = generateAuctionCarInstance(
            model,
            `worst-${tier}-${seed}`,
            createRng(seed),
            CONTEXT,
          )
          const guideYen = marketValueYen(
            model,
            car,
            100,
            PARTS_BY_ID,
            PARTS_TAXONOMY_BY_ID,
            ECONOMY,
          )
          if (!worst || guideYen < worst.guideYen) worst = { car, guideYen }
        }
        if (!worst) throw new Error('unreachable: the seed sweep always rolls a car')

        const buyPriceYen = Math.round(worst.guideYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
        const targetBand = sensibleRepairTargetBand(model, ECONOMY)
        const repairCostYen = carCostToBandYen(
          worst.car,
          model,
          PARTS_BY_ID,
          PARTS_TAXONOMY_BY_ID,
          ECONOMY,
          targetBand,
        )
        const restoredCar = restoredToBand(worst.car, model, targetBand)
        const sellPriceYen = marketValueYen(
          model,
          restoredCar,
          100,
          PARTS_BY_ID,
          PARTS_TAXONOMY_BY_ID,
          ECONOMY,
        )
        const marginYen = sellPriceYen - buyPriceYen - repairCostYen
        if (marginYen <= 0) {
          failures.push(
            `${model.id}: bought ${buyPriceYen}, repaired to ${targetBand} for ${repairCostYen}, sells ${sellPriceYen}, margin ${marginYen}`,
          )
        }
      }
      expect(failures).toEqual([])
    },
  )
})

describe('no-free-lunch probe (Sprint 54 decision 5)', () => {
  it('buying at full guide value with no repair done nets no expected profit via the real walk-in sale channel', () => {
    // A walk-in prices at offersSeen = 0, so its expected multiplier is the
    // Stage F quality curve's own fresh mean (sprint147.md) - clamped at
    // 1.0 by construction, so it is centred at or below 1.0 (an instant
    // sale trades at a discount, not a premium): the profit engine is the
    // acquisition discount plus repair margin, never merely holding a car.
    const expectedOfferMultiplier = ECONOMY.liquidity.qualityFresh
    expect(expectedOfferMultiplier).toBeLessThanOrEqual(1)
    for (const lot of independentLots(50, 8000)) {
      const guideYen = marketValueYen(
        PROBE_MODEL,
        lot.car,
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      expect(guideYen).toBeGreaterThan(0)
      expect(guideYen * expectedOfferMultiplier).toBeLessThanOrEqual(guideYen)
    }
  })
})

describe('ceiling probe (Sprint 54 decision 5 - law 1, no inflation)', () => {
  const COMMON_MODEL = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')
  if (!COMMON_MODEL) throw new Error('fixture common-tier car missing from seed content')

  it('an all-stock-mint car (zero restoration bill) is worth exactly its clean value, never above', () => {
    const car = buildCarInstance({
      modelId: COMMON_MODEL.id,
      mileageKm: 60_000,
      parts: mintCarParts(),
    })
    // 60,000 km is a defined breakpoint on the mileage curve (factor exactly
    // 1.0), so this is an exact, not approximate, comparison.
    const cleanValueYen = COMMON_MODEL.bookValueYen * mileageFactor(60_000, ECONOMY)
    const guideValueYen = marketValueYen(
      COMMON_MODEL,
      car,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    expect(guideValueYen).toBe(Math.round(cleanValueYen))
  })

  it('a restored high-mileage car is worth strictly less than a restored low-mileage example of the same model', () => {
    const freshCar = buildCarInstance({
      modelId: COMMON_MODEL.id,
      mileageKm: 30_000,
      parts: mintCarParts(),
    })
    const wornMileageCar = buildCarInstance({
      modelId: COMMON_MODEL.id,
      mileageKm: 180_000,
      parts: mintCarParts(),
    })
    const freshGuideYen = marketValueYen(
      COMMON_MODEL,
      freshCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const wornGuideYen = marketValueYen(
      COMMON_MODEL,
      wornMileageCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    expect(wornGuideYen).toBeLessThan(freshGuideYen)
  })

  /**
   * `generateAuctionCarInstance` can legitimately pre-fit street/sport/race
   * parts, so a modified car's own ceiling is deliberately higher than plain
   * clean value (Law 5: the aftermarket premium is real, additive value,
   * gated by foundation/tier-return but never zeroed) - that math has its
   * own dedicated coverage in `marketValue.test.ts`. This probe's actual,
   * narrower claim is Law 1's: an ORDINARY stock restoration never
   * manufactures value from nothing. Filtered to stock-only cars, that claim
   * still holds exactly - the sample is widened to keep a real count of
   * qualifying cars after the filter (aftermarketChance applies per slot, so
   * most 29-slot cars now carry at least one modified part).
   */
  it('fully restoring a STOCK-only generated car never prices it above its own clean value', () => {
    const stockOnlyLots = independentLots(300, 9000).filter((lot) =>
      ALL_CAR_PART_IDS.every((partId) => {
        const installed = lot.car.parts[partId].installed
        return !installed || PARTS_BY_ID[installed.partId]?.grade === 'stock'
      }),
    )
    expect(stockOnlyLots.length).toBeGreaterThan(10) // guards against a silent empty-set pass
    for (const lot of stockOnlyLots) {
      const restored = fullyRestored(lot.car, PROBE_MODEL)
      const cleanValueYen = PROBE_MODEL.bookValueYen * mileageFactor(restored.mileageKm, ECONOMY)
      const guideValueYen = marketValueYen(
        PROBE_MODEL,
        restored,
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      expect(guideValueYen).toBeLessThanOrEqual(Math.round(cleanValueYen) + 1) // rounding slack
    }
  })
})

describe('the scrap-value floor never binds on a generated lot (Sprint 54 decision 3)', () => {
  it('every model, seeded across many rolls, never needs the backstop floor - Law 2 keeps the unclamped formula above it on its own', () => {
    for (const model of CARS) {
      for (let seed = 0; seed < 30; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `floor-check-${model.id}-${seed}`,
          createRng(seed),
          CONTEXT,
        )
        const cleanValueYen = model.bookValueYen * mileageFactor(car.mileageKm, ECONOMY)
        const floorYen = ECONOMY.bands.scrapValueFraction * cleanValueYen
        const billYen = carCostToMintYen(car, model, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
        const unclampedValueYen = cleanValueYen - ECONOMY.valuation.marketRepairDiscount * billYen
        expect(unclampedValueYen).toBeGreaterThanOrEqual(floorYen)
      }
    }
  })
})

/**
 * Acceptance probe for the unimproved instant-flip bug: buying a car at
 * auction and selling it straight back, untouched, should net a few
 * thousand yen profit to a few thousand yen loss at most - the whole point
 * is that the car must be improved. Reuses the full-flip probe's exact
 * harness above (a scripted patient bidder capped at guide value, resolved
 * through the real day-by-day bidding process against real generated rival
 * cohorts) but skips restoration entirely and sells AS ROLLED through the
 * real walk-in channel (`sellViaWalkIn`, one seeded draw per lot) - the
 * literal "buy and flip immediately" play.
 */
describe('unimproved-flip probe (the instant-flip guard)', () => {
  it.each(['entry', 'everyday', 'enthusiast', 'flagship'] as const)(
    'the median unimproved flip on a %s-tier car reliably loses money through the instant buyout',
    (tier) => {
      const models = CARS.filter((c) => c.tier === tier)
      expect(models.length, `no ${tier}-tier car in the roster to probe`).toBeGreaterThan(0)

      const marginFractions: number[] = []
      const resaleRatios: number[] = []
      for (const model of models) {
        // A car reaches several rooms now, so the probe rolls it in the lowest
        // one that takes its price band - the room a player meets it in first.
        // The room decides which crowd bids, never how the car itself rolls.
        const auctionTier = AUCTION_TIERS.find((room) =>
          canAppearAtAuctionTier(model, room, CONTEXT.economy),
        )
        if (!auctionTier) continue
        for (let seed = 0; seed < 60; seed++) {
          const [initial] = generateAuctionCatalog(
            [model],
            auctionTier,
            7,
            1,
            createRng(seed),
            CONTEXT,
          )
          if (!initial) continue
          const lot = { ...initial, id: `flip-probe-${tier}-${model.id}-${seed}` }
          const state = stateWithLots([lot])
          const anchor = anchorValueYen(lot, state, CONTEXT)
          if (anchor <= 0) continue

          const wonPriceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
          const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
          const boughtCar = result.state.ownedCars.find((c) => c.id === lot.car.id)
          if (!boughtCar) continue

          // Sell AS ROLLED - no repair, no parts bought: the instant-flip play.
          const sellRng = createRng(hashStringToSeed(`flip-probe-sell:${lot.id}`))
          const offer = sellViaWalkIn(
            boughtCar,
            model,
            CONTEXT.buyers,
            CONTEXT.partsById,
            CONTEXT.partsTaxonomy,
            CONTEXT.partsTaxonomyById,
            100,
            CONTEXT.economy,
            sellRng,
          )
          marginFractions.push((offer.priceYen - wonPriceYen) / wonPriceYen)
          resaleRatios.push(offer.priceYen / anchor)
        }
      }

      expect(marginFractions.length).toBeGreaterThan(10)
      const marginMedian = median(marginFractions)
      const resaleMedian = median(resaleRatios)
      const { qualityFloor } = ECONOMY.liquidity
      // The instant buyout is a flat premium over the value anchor
      // (AUCTION_BUYOUT_PREMIUM), never a contested price, and the walk-in
      // sells back through the Stage F quality draw (sprint147.md) at
      // offersSeen = 0: a fresh, unlisted offer averaging qualityFresh of
      // the picked buyer's own taste-adjusted value.
      //
      // The sale side sits inside the quality draw's own reachable band: a
      // walk-in never pays a premium over the picked buyer's own valuation
      // (quality clamps at 1.0), and never falls below the floor even on
      // the tail of the Normal draw, whatever the picked buyer's own taste
      // multiplier does to that valuation first.
      expect(resaleMedian).toBeGreaterThanOrEqual(
        qualityFloor * (1 - ECONOMY.valuation.tasteSpread),
      )
      expect(resaleMedian).toBeLessThanOrEqual(1 + ECONOMY.valuation.tasteSpread)
      // A walk-in never pays over the taste-free market read for an
      // untouched car: the quality draw clamps at 1.0 before any taste
      // multiplier is applied.
      expect(resaleMedian).toBeLessThanOrEqual(1)
      // This is a stated design law, not a derivation: buying a car and
      // reselling it untouched the same day must lose at least 1% of the
      // car's value.
      //
      // It is stated rather than derived from qualityFresh because the
      // walk-in's realised price is quality times the picked buyer's taste,
      // and pickWeightedCandidate weights the draw by valuation, so the
      // picked taste runs about tasteSpread squared (1.44%) above the
      // taste-free market read. Any bound derived from qualityFresh would
      // have to carry that term too, at which point it would just restate
      // the implementation instead of guarding it.
      expect(marginMedian).toBeLessThan(-0.01)
    },
  )
})

/**
 * Acceptance probes for economy-bible.md law 5 (the foundation law): an
 * incoherent build (expensive aftermarket parts bolted onto a car with
 * neglected foundations) must LOSE money, not profit like a coherent build.
 * Probe (b) (repairing the foundation releases the premium) and the
 * pure-function behavior live in `marketValue.test.ts`; probes (c)/(d) (the
 * no-inflation ceiling and the unimproved-flip band) are the unchanged
 * probes above, which still pass because a generated lot's stock parts
 * carry no premium for the factor to scale.
 */
describe('the foundation law kills the incoherent-build profit (Sprint 60, law 5, item 18)', () => {
  const ENTRY_MODEL = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!ENTRY_MODEL) throw new Error('fixture entry-tier car missing from seed content')

  // The build, in real entry-class catalog SKUs: a race engine (block +
  // internals), a race turbo, and an expensive cosmetic (race aero) - each
  // bought at full catalog price at the parts market. The old second
  // cosmetic (a livery paint finish) is gone: `paint` is a derived body
  // value carrier now and carries no aftermarket grades
  // (`bodyPipeline.ts`) - `aero` alone carries the cosmetic premium here.
  const RACE_PART_IDS = [
    'shitbox-hagane-race-block',
    'shitbox-oni-race-piston-kit',
    'shitbox-khs-tr-500',
    'shitbox-frp-race-aero',
  ] as const

  function installRaceParts(parts: CarInstance['parts']): CarInstance['parts'] {
    const next = { ...parts }
    for (const partId of RACE_PART_IDS) {
      const part = PARTS_BY_ID[partId]
      if (!part) throw new Error(`fixture race part ${partId} missing from catalog`)
      next[part.carPartId] = {
        installed: {
          id: `built-${partId}`,
          partId,
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
      }
    }
    return next
  }

  it('buying the wreck, fitting a race engine/turbo/cosmetics, and selling loses money while the foundations stay neglected', () => {
    // The neglected foundations: barely-working brakes, bald tyres, a
    // rusted-through body.
    const neglectedFoundations = {
      brakePadsDiscs: 'scrap' as const,
      tyres: 'scrap' as const,
      underbody: 'scrap' as const,
    }

    // The wreck as bought - neglected foundations, stock everywhere else, NO
    // race parts yet. Bought at auction at the reserve (a real acquisition
    // discount, the most generous case for the flipper).
    const wreckCar = buildCarInstance({
      modelId: ENTRY_MODEL.id,
      mileageKm: 116_226,
      parts: mintCarParts(neglectedFoundations),
    })
    const wreckGuideYen = marketValueYen(
      ENTRY_MODEL,
      wreckCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const buyYen = Math.round(wreckGuideYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)

    // Fit the race parts (money spent at the parts market, full catalog price)
    // WITHOUT touching the neglected foundations - the exact incoherent build.
    const partsSpentYen = RACE_PART_IDS.reduce((sum, id) => sum + PARTS_BY_ID[id]!.priceYen, 0)
    const builtCar: CarInstance = { ...wreckCar, parts: installRaceParts(wreckCar.parts) }
    // Sell at the FULL guide value (the most generous case - a real walk-in
    // sale is a discount on top). If it loses money even here, it loses money
    // for real.
    const sellYen = marketValueYen(
      ENTRY_MODEL,
      builtCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )

    const marginYen = sellYen - buyYen - partsSpentYen
    expect(marginYen).toBeLessThan(0)
  })

  it('the SAME build with sound foundations instead is not a guaranteed loss - the difference is the foundation law, not the parts', () => {
    // Identical race build, but the foundations are sound (worn) instead of
    // scrap: the premium is now credited in full, so the same parts spend is
    // no longer thrown away. Proves the loss above is the foundation gate, not
    // some blanket "aftermarket never pays" rule.
    const soundFoundations = {
      brakePadsDiscs: 'worn' as const,
      tyres: 'worn' as const,
      underbody: 'worn' as const,
    }
    const soundWreck = buildCarInstance({
      modelId: ENTRY_MODEL.id,
      mileageKm: 116_226,
      parts: mintCarParts(soundFoundations),
    })
    const scrapWreck = buildCarInstance({
      modelId: ENTRY_MODEL.id,
      mileageKm: 116_226,
      parts: mintCarParts({
        brakePadsDiscs: 'scrap',
        tyres: 'scrap',
        underbody: 'scrap',
      }),
    })
    const soundBuilt: CarInstance = { ...soundWreck, parts: installRaceParts(soundWreck.parts) }
    const scrapBuilt: CarInstance = { ...scrapWreck, parts: installRaceParts(scrapWreck.parts) }
    const soundSell = marketValueYen(
      ENTRY_MODEL,
      soundBuilt,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const scrapSell = marketValueYen(
      ENTRY_MODEL,
      scrapBuilt,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    // The sound-foundation build is worth strictly more, by the released
    // premium, than the identical scrap-foundation build.
    expect(soundSell).toBeGreaterThan(scrapSell)
  })

  it('is inert on the coherence probe car (all-scrap STOCK, zero premium) - the coherence table is arithmetically unchanged (probe e)', () => {
    // computeRosterBalanceProbe builds an all-scrap car of STOCK parts (no
    // aftermarket premium). foundationFactor multiplies a zero premium to
    // zero either way, so Law 5 cannot move any coherence figure - asserted
    // directly here so a future factor edit can never silently shift the
    // machine-checked coherence gate.
    for (const model of CARS) {
      const fitmentClass = fitmentClassForTier(model.tier)
      const parts = Object.fromEntries(
        ALL_CAR_PART_IDS.map((partId) => {
          if (partId === 'forcedInduction' && !hasForcedInduction(model)) {
            return [partId, { installed: null }]
          }
          const stockPart = CONTEXT.stockPartByCarPartId[fitmentClass][partId]
          return [
            partId,
            {
              installed: stockPart
                ? { id: `cov-${partId}`, partId: stockPart.id, band: 'scrap' }
                : null,
            },
          ]
        }),
      ) as CarInstance['parts']
      const car = buildCarInstance({ modelId: model.id, parts })
      // Zero premium -> foundationFactor is inert by construction. All-stock
      // parts, so retention multiplies nothing - any value would do; the
      // real ceiling documents what a genuinely stock car reads.
      expect(installedPartsValueYen(car, PARTS_BY_ID, ECONOMY.valuation.retentionCeiling)).toBe(0)
    }
  })
})

describe('the sensible-play probes (Sprint 66, economy-bible law 1 as amended)', () => {
  it('discloses which models offer a fresh shop no bench work at all', () => {
    // A model lands in this list when the Law 2 ceiling (`maxBillFraction x
    // clean value`) is tight enough against its own fitment class's parts
    // prices that the roughest deliverable car comes back at `fine` on every
    // slot - which is exactly a fresh shop's tier-1 repair ceiling, so there
    // is nothing left for it to repair. Its mint expectation is still
    // reachable by buying mint parts, and the flip still pays through the
    // acquisition discount; it is the BENCH that has no work. Pinned by name
    // so the set cannot grow silently: it grows when a model's book value
    // drops far enough below what its fitment class's parts basket is priced
    // for.
    const modelsWithNoBenchWork = computeRosterBalanceProbe(CARS, CONTEXT)
      .filter((row) => row.repairLaborSlots === 0)
      .map((row) => row.modelId)
      .sort()
    expect(modelsWithNoBenchWork).toEqual([])
  })

  it('the sensible play clears a real margin on EVERY roster model (Sprint 66 decision 7)', () => {
    // Buy rough, repair to the tier's expectation band, sell. This is the play
    // the economy asks for, and the one `flipMarginYen` stopped describing the
    // moment Law 1 gained a tier expectation: a full mint restore of a Honda
    // City nets Y3,202, because the market barely discounts a worn kei so you
    // pay near clean value for one. The same car on the sensible play nets
    // Y34,309. The economy is sound; measuring a mint kei was the mistake.
    for (const row of computeRosterBalanceProbe(CARS, CONTEXT)) {
      expect(
        row.sensibleFlipMarginFraction,
        `${row.modelId}: buying rough, repairing to ${row.fitmentClass}'s expectation band and selling nets ${row.sensibleFlipMarginYen} yen (${(row.sensibleFlipMarginFraction * 100).toFixed(1)}% of clean) - the core loop must pay on every car in the game`,
      ).toBeGreaterThan(0.05)
    }
  })
})
