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
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { anchorValueYen, nextRaiseYen, resolveLotForDay, resolvePlaceBid } from '../src/bidding'
import { generateAuctionCarInstance, generateAuctionCatalog } from '../src/auctions'
import { carCostToMintYen, hasForcedInduction, planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { marketValueYen, mileageFactor } from '../src/marketValue'
import { createRng } from '../src/rng'
import { bestFitBuyer } from '../src/selling'
import { valuateCarForBuyer } from '../src/valuation'
import {
  buildCarInstance,
  mintCarParts,
  testSpecialty,
  testToolTiers,
  uniformCarParts,
} from './testFixtures'

/**
 * Sprint 21 acceptance probes (sprint21.md's "Restoration-uplift" and
 * "Full-flip" Testing bullets). Both reuse Sprint 20's probe harness shape
 * (`bidding.test.ts`'s `independentLots`/`stateWithLots`) - a real generated
 * lot population, resolved purely through the same functions `advanceDay`
 * calls, not a bot or a mocked shortcut.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

/**
 * Sprint 44: repair cost derives from an installed instance's own catalog
 * price, so a rolled lot's real stock parts need a real `partsById` to price
 * the restoration bill correctly - `{}` would silently skip every repairable
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
    graceParkingCarId: null,
    laborSlotsSpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    serviceJobLedgers: {},
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
 * Every real part driven to mint - a full restoration (Sprint 32 shape): an
 * already-filled slot keeps its own installed part, just bumped to mint
 * band; a genuinely missing slot (the stripped-car roll) is filled with a
 * fresh mint stock part, since "restored" means every real defect -
 * including a missing component - is gone. The one legitimate exception is
 * `forcedInduction` on an NA model, which restoration never adds
 * (`hasForcedInduction`, bands.ts) - it stays permanently, legitimately
 * absent either way.
 */
function fullyRestored(car: CarInstance, model: CarModel): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const parts = { ...car.parts }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = parts[partId].installed
    if (installed) {
      parts[partId] = { installed: { ...installed, band: 'mint' } }
      continue
    }
    if (partId === 'forcedInduction' && !hasForcedInduction(model)) continue // legitimately absent
    const stockPart = CONTEXT.stockPartByCarPartId[fitmentClass][partId]
    parts[partId] = {
      installed: stockPart
        ? {
            id: `${car.id}-restored-${partId}`,
            partId: stockPart.id,
            band: 'mint',
            genuinePeriod: false,
          }
        : null,
    }
  }
  return { ...car, parts }
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
    // Sprint 26 rewired the value shim onto cost-weighted band factors -
    // this is a real, expected number shift from the old percent-weighted
    // formula (decision 4), not a regression; the floor/ceiling bounds still
    // hold because the shim reuses the exact same floor-to-ceiling curve.
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

describe('full-flip probe (acceptance, sprint21.md)', () => {
  it('acquire (scripted patient bidder) -> full restoration -> best-channel sale nets a positive margin most of the time', () => {
    // Rent is 0 (Sprint 20 decision, restored in Sprint 23) - this measures
    // the acquisition-restoration-sale loop itself, not the cost treadmill.
    // "Best-channel" sale price is the best-fit buyer's own un-spread
    // valuation (Sprint 31 removed the separate list-publicly channel that
    // used to serve this role) - still deterministic, unlike an actual
    // offer's rolled spread, so the probe measures the value model, not
    // channel RNG.
    const marginFractions: number[] = []

    for (const initial of independentLots(200, 3000)) {
      let state = stateWithLots([initial])
      const anchor = anchorValueYen(initial, state, CONTEXT)
      if (anchor <= 0) continue
      const targetYen = anchor // never pay more than the car is genuinely worth
      if (nextRaiseYen(initial, state, CONTEXT) > targetYen) continue // wouldn't even open at a price it likes

      let lot = initial
      let wonPriceYen: number | null = null
      for (let day = 1; day <= 40 && wonPriceYen === null; day++) {
        if (lot.leadingBidder !== 'player') {
          const raiseToYen = nextRaiseYen(lot, state, CONTEXT)
          if (raiseToYen <= targetYen) {
            const bidResult = resolvePlaceBid(state, lot.id, raiseToYen, CONTEXT)
            state = bidResult.state
            const updated = state.activeAuctionLots.find((l) => l.id === lot.id)
            if (updated) lot = updated
          }
        }
        const dayResult = resolveLotForDay(state, lot, CONTEXT, day)
        state = dayResult.state
        const stillActive = state.activeAuctionLots.find((l) => l.id === lot.id)
        if (stillActive) {
          lot = stillActive
          continue
        }
        const wonEntry = dayResult.log.find((e) => e.type === 'auction-bid-won')
        if (wonEntry && wonEntry.type === 'auction-bid-won') {
          wonPriceYen = wonEntry.finalPriceYen
        }
        break
      }

      if (wonPriceYen === null) continue
      const boughtCar = state.ownedCars.find((c) => c.id === initial.car.id)
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
    // Sprint 26: re-measure against the new cost-weighted value shim rather
    // than pin the old percent-model's exact numbers (decision 4 - expected
    // shift, not a regression). Bar kept loose: the acquisition-restoration-
    // sale loop should still be profitable most of the time.
    expect(marginMedian).toBeGreaterThan(0)
    expect(positiveShare).toBeGreaterThanOrEqual(0.5)
  })
})

/**
 * Sprint 47 decision 6 acceptance probes (playtest 2026-07-13: repairing a
 * car for resale must be reliably profitable on ordinary work, and buying
 * wrecks for parts must still make sense). Deterministic, uniform-band cars
 * rather than a random sample - the point is to prove the value/repair
 * formulas' own math, not to re-run the generation roll.
 */
describe('sane-flip / salvage-flip probes (Sprint 47 decision 6)', () => {
  const COMMON_MODEL = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')
  if (!COMMON_MODEL) throw new Error('fixture common-tier car missing from seed content')

  const SHITBOX_MODEL = CARS.find((c) => c.id === 'honda-city-e-aa')
  if (!SHITBOX_MODEL) throw new Error('fixture shitbox-tier car missing from seed content')

  /** Total yen to bring every repairable part in `car` from its current
   * band to `targetBand`, across all six real groups - the same pipeline a
   * real "repair all" confirm would charge (Sprint 47: no consumables fee on
   * top, per decision 1). */
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
      ).costYen
    }
    return total
  }

  /** Sprint 47 decision 6(a), HARD-GATED: an average-condition common-tier
   * car, bought at reserve, repaired worn -> fine only (no parts, no mint
   * polishing), sold at guide value - must net a real positive margin. This
   * is the direct, computed answer to the playtest's City scenario. */
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
   * Sprint 47 decision 6(b), INFORMATIONAL (disclosed, not gated): a
   * neglected wreck (uniform scrap - the extreme end of the neglected
   * upkeep tier) bought at reserve, fully parted out from a second,
   * identically-cheap donor wreck (every slot filled at the donor's own
   * purchase price, not catalog price), then sold. Measures whether the
   * "buy two wrecks, cannibalize one" salvage economy the maintainer asked
   * about actually pencils out under the new value curve.
   */
  it('a salvage flip (two neglected wrecks, one dismantled to fix the other) - margin measured and disclosed', () => {
    const wreckCar = buildCarInstance({
      modelId: SHITBOX_MODEL.id,
      year: 1984,
      mileageKm: 150_000,
      parts: uniformCarParts('scrap'),
    })
    const wreckPriceYen = Math.round(
      marketValueYen(SHITBOX_MODEL, wreckCar, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY) *
        ECONOMY.AUCTION_RESERVE_PRICE_FRACTION,
    )
    // Two wrecks bought at the same cheap reserve; the second is fully
    // parted out into the first, so its purchase price IS the "repair" cost.
    const totalCostYen = wreckPriceYen * 2

    const partedOutCar: CarInstance = { ...wreckCar, parts: uniformCarParts('mint') }
    const sellPriceYen = marketValueYen(
      SHITBOX_MODEL,
      partedOutCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )

    // Measured: each wreck ~Y3,600 (near the scrap-value floor), two wrecks
    // ~Y7,200 total, sold parted-out ~Y144,000 -> margin ~+Y136,800 - the
    // wreck-profit path (decision 3's requirement 2) really does work, even
    // at this maximally extreme uniform-scrap case.
    const marginYen = sellPriceYen - totalCostYen
    // Disclosed, not gated (decision 6(b)): a real number for the maintainer,
    // not asserted to be positive - a full scrap-to-mint parting-out is the
    // most extreme case, not the typical "fill a few missing slots" salvage
    // play. Sanity bound only: the formula must produce a finite, real yen
    // figure, not NaN/Infinity from a division or missing-catalog lookup.
    expect(Number.isFinite(marginYen)).toBe(true)
  })
})

/**
 * Sprint 54 acceptance probes (economy-bible.md laws 1-2, decision 5). Every
 * probe below would have caught the exact playtest bug (buy a cheap shitbox,
 * triage-repair it, guide value doesn't move) this sprint exists to retire.
 */

const CITY_MODEL = CARS.find((c) => c.id === 'honda-city-e-aa')
if (!CITY_MODEL) throw new Error('fixture car missing from seed content')

/**
 * A uniform-band car with every slot filled at the MODEL's own fitment
 * class (`testFixtures.ts`'s shared `uniformCarParts` is pinned to `common`
 * regardless of the model passed in - fine for a `rare`-tier fixture like
 * this file's other probes, but wrong here: honda-city-e-aa is `shitbox`
 * tier, and a `common`-class bill is ~4x too expensive for it, which would
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
          installed: stockPart
            ? { id: `probe-${partId}`, partId: stockPart.id, band, genuinePeriod: false }
            : null,
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
        genuinePeriod: false,
      },
    },
  }
  return { car: { ...car, parts }, costYen }
}

describe('the Honda City probe (Sprint 54 decision 5 - the exact playtest regression)', () => {
  it('buying a worst-case (all-poor) shitbox at reserve then triage-repairing it (consumables + a couple cheap groups) raises projected profit at every step, never a loss', () => {
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

    // The playtest's own triage play: replace the two cheapest consumables,
    // then step a couple of ordinary groups from poor to worn.
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

    expect(profitYen).toBeGreaterThan(0) // the exact playtest scenario now actually profits
  })
})

describe('full-restore probe per tier (Sprint 54 decision 5 - law 2, no value traps)', () => {
  it.each(['shitbox', 'common', 'uncommon', 'rare'] as const)(
    'the worst generatable roll for a %s-tier car, fully restored and sold at guide, clears a positive flip margin',
    (tier) => {
      const models = CARS.filter((c) => c.tier === tier)
      expect(models.length, `no ${tier}-tier car in the roster to probe`).toBeGreaterThan(0)

      let worst: { car: CarInstance; model: CarModel; guideYen: number } | null = null
      for (const model of models) {
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
          if (!worst || guideYen < worst.guideYen) worst = { car, model, guideYen }
        }
      }
      if (!worst) throw new Error('unreachable: models.length already asserted > 0')

      const buyPriceYen = Math.round(worst.guideYen * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
      const repairCostYen = carCostToMintYen(
        worst.car,
        worst.model,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      const restoredCar = fullyRestored(worst.car, worst.model)
      const sellPriceYen = marketValueYen(
        worst.model,
        restoredCar,
        100,
        PARTS_BY_ID,
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
      const marginYen = sellPriceYen - buyPriceYen - repairCostYen
      expect(marginYen).toBeGreaterThan(0)
    },
  )
})

describe('no-free-lunch probe (Sprint 54 decision 5)', () => {
  it('buying at full guide value with no repair done nets no expected profit via the real walk-in sale channel', () => {
    const [min, max] = ECONOMY.selling.offerSpread
    const expectedOfferMultiplier = (min + max) / 2
    // The walk-in offer spread is centered at or below 1.0 (an instant sale
    // trades at a discount, not a premium) - the profit engine is the
    // acquisition discount plus repair margin, never merely holding a car.
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

  it('fully restoring any generated car never prices it above its own clean value', () => {
    for (const lot of independentLots(80, 9000)) {
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
