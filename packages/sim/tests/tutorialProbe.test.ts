import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  STORY_MISSIONS,
  TUTORIAL_LOT,
  fitmentClassForTier,
  type CarInstance,
  type ConditionBand,
  type PartFitmentClass,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carCostToBandYen, hasForcedInduction } from '../src/bands'
import { reserveYen, settleAuctionHammer } from '../src/bidding'
import { buildSimContext } from '../src/context'
import { expectedTrueValueYen, sheetGuideValueYen } from '../src/diagnosis'
import { gradeMissionCar } from '../src/missions'
import { createInitialGameState } from '../src/newGame'
import { buildTutorialLot, installTutorial } from '../src/tutorial'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

const FOUR_WHEELS = STORY_MISSIONS.find((m) => m.id === 'four-wheels')!
const RECIPE = TUTORIAL_LOT
const MODEL = CARS.find((c) => c.id === RECIPE.modelId)!
const FITMENT: PartFitmentClass = fitmentClassForTier(MODEL.tier)

/** A full stock parts map at `band`, with per-slot overrides - the same shape
 * `stockCarPartsAt` in `storyMissionProbes.test.ts` uses, kept local so this
 * probe is self-contained. The Wagon R is naturally aspirated, so its
 * forcedInduction slot is left legitimately empty - the honest NA build the
 * tutorial car itself uses (`buildTutorialLot`), no phantom turbo, which
 * `roadworthy` grades as sound. */
function stockPartsAt(
  band: ConditionBand,
  overrides: Partial<Record<string, ConditionBand>> = {},
): CarInstance['parts'] {
  const result = {} as CarInstance['parts']
  for (const partId of ALL_CAR_PART_IDS) {
    if (partId === 'forcedInduction' && !hasForcedInduction(MODEL)) {
      result[partId] = { installed: null }
      continue
    }
    const stockPart = CONTEXT.stockPartByCarPartId[FITMENT][partId]
    result[partId] = {
      installed: {
        id: `probe-${partId}`,
        partId: stockPart.id,
        band: overrides[partId] ?? band,
        genuinePeriod: false,
        origin: { kind: 'market', day: 1 },
      },
    }
  }
  return result
}

/**
 * The tutorial satisfiability probe. Closed-form, no bot careers
 * (directive 21) - the scripted recipe's whole economics recomputed from
 * shipped content and asserted, so the tutorial can never quietly drift
 * unwinnable and the four-wheels budget/payout it rides on stay honest.
 *
 * The build the tutorial teaches: buy the scripted lot AT RESERVE, pull the
 * wheel assembly and fit fresh stock tyres (part + hiring the wheels line for
 * the day), pull the engine assembly with machine-shop assist to repair the
 * buried head/valvetrain (one engine line hire covering the whole round trip
 * + the banded repair), refit. Everything else is already worn+, so the car
 * is roadworthy the moment those two faults are cleared.
 */
describe('tutorial satisfiability probe', () => {
  const state = createInitialGameState(CONTEXT, 1)
  const lot = buildTutorialLot(CONTEXT, 1)

  // Purchase: the pinned rival ceiling means the player wins at the reserve.
  const reserve = reserveYen(lot, state, CONTEXT)

  // Wheel beat: one fresh stock tyre + hiring the wheels line for the day to
  // fit it (neither owned at the fresh tier-1 tutorial start).
  const stockTyre = CONTEXT.stockPartByCarPartId[FITMENT].tyres
  const stockTyreYen = stockTyre.priceYen
  const wheelsHireYen = CONTEXT.economy.machineShopAssist.feeYenByGroup.wheels

  // Engine beat: pull + refit the engine assembly - one engine line hire for
  // the day covers both operations (not two separate fees) - plus the
  // banded repair of the buried head/valvetrain one rung, poor to worn -
  // exactly the roadworthy bar, the taught lesson being "repair to what the
  // job needs".
  const engineHireYen = CONTEXT.economy.machineShopAssist.feeYenByGroup.engine
  const hvRepairYen = carCostToBandYen(
    { ...lot.car, parts: stockPartsAt('worn', { headValvetrain: 'poor' }) },
    MODEL,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy,
    'worn',
  )

  const partsYen = stockTyreYen
  // What actually posts to the car's own ledger - the banded repair only.
  // The wheels/engine line hires are a running cost, the same treatment as
  // rent, never charged to a car's ledger, so they never enter here.
  const repairYen = hvRepairYen
  // What actually leaves the player's cash: the ledger repair cost plus the
  // two machine-line hires, spent once each for the day.
  const totalSpendYen = reserve + partsYen + repairYen + wheelsHireYen + engineHireYen

  // The one player mistake the budget must still absorb: buying sport rubber
  // instead of the stock tyres the copy points at.
  const sportTyreYen = CONTEXT.aftermarketPartByCarPartId[FITMENT].tyres.sport!.priceYen
  const oneMistakeYen = sportTyreYen - stockTyreYen

  it('the scripted lot is flagged excludable and priced through the fear-discounted reserve', () => {
    expect(lot.scripted).toBe(true)
    // The sleeper lesson, quantified: the room prices the tick at the odds,
    // so pre-knowledge its sheet value IS the honest expectation - the
    // cause-weighted average across all four possible causes, from the minor
    // lifter tick through to the feared rod-knock. Certainty about which one
    // it is is what the inspection buys.
    const sheet = sheetGuideValueYen(lot.car, MODEL, state, CONTEXT)
    const honest = expectedTrueValueYen(lot.car, MODEL, state, CONTEXT)
    expect(sheet).toBe(honest)
    // And the reserve is a genuine bargain: bought at ~0.6x the honest value.
    expect(reserve).toBeGreaterThan(0)
    expect(reserve).toBeLessThanOrEqual(Math.round(honest * 0.65))
  })

  it('the taught build stays completable after one mistake, and clears a small deliberate profit', () => {
    // Her budget and her pay are one figure (¥130,000); the mission is not
    // "spend under a cap higher than she pays" - it is "build within her
    // money and keep what is left". So the guarantee is that a single
    // wrong-band purchase still completes (spend + mistake within her
    // money), not that a fat cap absorbs it. profit IS the slack on this
    // lean intro job.
    expect(totalSpendYen + oneMistakeYen).toBeLessThanOrEqual(FOUR_WHEELS.budgetCapYen)
    // The intro mission is deliberately not a big earner: the payout covers
    // her costs with a modest margin, guarded both ways so a payout bump can
    // never quietly turn Yuki's first job into a fat flip. The bound keeps a
    // slice of headroom over the real closed-form margin rather than pinning
    // it exactly.
    const profitYen = FOUR_WHEELS.payoutYen - totalSpendYen
    expect(profitYen).toBeGreaterThan(0)
    expect(profitYen).toBeLessThanOrEqual(15_000)
  })

  it('the taught build grades roadworthy AND under the budget cap through the real mission grader', () => {
    const afterCar: CarInstance = {
      ...lot.car,
      id: 'tutorial-after-car',
      symptoms: [],
      apparentBandByPartId: null,
      parts: stockPartsAt('worn', { tyres: 'mint', headValvetrain: 'worn' }),
    }
    const graded = {
      ...state,
      ownedCars: [afterCar],
      carLedgers: {
        'tutorial-after-car': { purchaseYen: reserve, repairYen, partsYen },
      },
    }
    const report = gradeMissionCar(graded, 'four-wheels', 'tutorial-after-car', CONTEXT)
    expect(report.pass, JSON.stringify(report.lines)).toBe(true)
  })

  it('settles through the live-room hammer seam at reserve', () => {
    const s = installTutorial(state, CONTEXT)
    expect(s.activeAuctionLots.some((l) => l.id === RECIPE.lotId)).toBe(true)

    const settled = settleAuctionHammer(s, RECIPE.lotId, reserve, CONTEXT)
    expect(settled.state.activeAuctionLots.some((l) => l.id === RECIPE.lotId)).toBe(false)
    expect(settled.state.ownedCars.some((c) => c.id === RECIPE.carId)).toBe(true)
    expect(settled.state.carLedgers[RECIPE.carId]?.purchaseYen).toBe(reserve)
  })
})
