import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  STORY_MISSIONS,
  TUTORIAL_LOT,
  fitmentClassForTier,
  type CarInstance,
  type CarPartId,
  type ConditionBand,
  type PartFitmentClass,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carCostToBandYen } from '../src/bands'
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

/** The scripted car's OWN parts map with per-slot bands overridden - taken
 * from `buildTutorialLot` rather than synthesised, so the probe tracks the
 * recipe (`tutorialLot.json`) automatically instead of restating it. The
 * Wagon R is naturally aspirated, so its forcedInduction slot is legitimately
 * empty and stays that way, which `roadworthy` grades as sound. */
function scriptedPartsWith(
  car: CarInstance,
  overrides: Partial<Record<CarPartId, ConditionBand>>,
): CarInstance['parts'] {
  const result = { ...car.parts }
  for (const [partId, band] of Object.entries(overrides) as Array<[CarPartId, ConditionBand]>) {
    const installed = result[partId].installed
    if (!installed) throw new Error(`scripted car has no part in slot "${partId}"`)
    result[partId] = { installed: { ...installed, band } }
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
 * the day), then Service the buried head/valvetrain where it sits in the car,
 * one rung, poor to worn (the banded repair alone, no hire day). Everything
 * else is already worn+, so the car is roadworthy the moment those two faults
 * are cleared.
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
  const wheelsHireYen = CONTEXT.economy.toolHire.feeYenByGroup.wheels

  // Engine beat: the buried head/valvetrain is Serviced in situ, one rung,
  // poor to worn - exactly the roadworthy bar, the taught lesson being
  // "repair to what the job needs". A Service on the head is two hand steps
  // (`workbench.json`), neither of them machine work, so `forcedHireDayFor`
  // names no line and the beat buys no hire day at all: reaching a buried slot
  // costs energy, never yen.
  // The scripted car with its scrap tyres already discounted to the roadworthy
  // bar: the taught wheel beat BUYS a fresh stock tyre (priced above as
  // `stockTyreYen`), it never repairs the old one, so charging the rubber here
  // as well would bill it twice. What is left below `worn` is the buried
  // head/valvetrain alone.
  const hvRepairYen = carCostToBandYen(
    { ...lot.car, parts: scriptedPartsWith(lot.car, { tyres: 'worn' }) },
    MODEL,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy,
    'worn',
  )

  const partsYen = stockTyreYen
  // What actually posts to the car's own ledger - the banded repair only.
  // The wheels line hire is a running cost, the same treatment as rent, never
  // charged to a car's ledger, so it never enters here.
  const repairYen = hvRepairYen
  // What actually leaves the player's cash: the ledger repair cost plus the
  // one machine-line hire the taught build cannot avoid, the wheels line for
  // pressing her fresh tyres onto the rims.
  const totalSpendYen = reserve + partsYen + repairYen + wheelsHireYen

  // The one player mistake the budget must still absorb: buying sport rubber
  // instead of the stock tyres the copy points at.
  const sportTyreYen = CONTEXT.aftermarketPartByCarPartId[FITMENT].tyres.sport!.priceYen
  const oneMistakeYen = sportTyreYen - stockTyreYen

  it("the scripted lot is flagged excludable and priced honestly - fully disclosed, exempt from the room's fear", () => {
    expect(lot.scripted).toBe(true)
    // Fear prices UNCERTAINTY about which candidate is true; a scripted lot
    // carries none - sprint215.md's own `fullyVerifiedCar` already treats it
    // as fully disclosed the moment it is bought, and `AuctionLot.scripted`
    // is the exact flag that decision reads. `sheetGuideValueYen`'s `feared`
    // parameter is the room-pricing side of the same call: `anchorValueYen`
    // (`bidding.ts`) passes `!lot.scripted`, so the reserve this test uses
    // below prices the plain cause-weighted expectation, not the near-worst
    // fear formula.
    const honest = expectedTrueValueYen(lot.car, MODEL, state, CONTEXT)
    const exemptSheet = sheetGuideValueYen(lot.car, MODEL, state, CONTEXT, false)
    expect(exemptSheet).toBe(honest)
    // Named for contrast, not used by anything downstream: an ordinary
    // (non-scripted) lot carrying this exact symptom WOULD read fear-priced,
    // strictly below the honest expectation - the sleeper lesson the design
    // doc describes still holds for every real lot, just not this teaching
    // artefact.
    const fearedSheet = sheetGuideValueYen(lot.car, MODEL, state, CONTEXT)
    expect(fearedSheet).toBeLessThan(honest)
    // And the reserve is a genuine bargain: bought well under the honest value.
    expect(reserve).toBeGreaterThan(0)
    expect(reserve).toBeLessThanOrEqual(Math.round(honest * 0.65))
  })

  it('the taught build stays completable after one mistake, and clears a small deliberate profit', () => {
    // Her budget and her pay are one figure (¥142,000); the mission is not
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
    //
    // The taught build clears about 24,700 of her 142,000: the reserve, one
    // stock tyre, the head's banded Service, and the wheels line for the day
    // to press her tyres on. That is the only hire it buys, because the head
    // is Serviced where it sits and hand work costs energy rather than yen.
    // The ceiling sits 5,275 above that closed-form margin, the same slice of
    // headroom it has always carried, so a payout bump or a cheaper reserve
    // still trips this before a player sees her first job pay like a flip.
    //
    // The fearful room (knowledge-and-diagnosis.md section 4) briefly broke
    // this ceiling when it first landed - a scripted lot has no real
    // uncertainty to fear, so charging it the near-worst-case fix cost
    // anyway priced the reserve too cheap and inflated profit past 26,000.
    // Fixed by scope correction, not by moving `four-wheels`'s payout: fear
    // prices what nobody has looked at, and this lot's condition is fully
    // disclosed by design (`sheetGuideValueYen`'s `feared` parameter,
    // `AuctionLot.scripted`), so its reserve prices the honest
    // cause-weighted expectation exactly as it did before the fearful room
    // existed, and the designed margin holds unchanged.
    const profitYen = FOUR_WHEELS.payoutYen - totalSpendYen
    expect(profitYen).toBeGreaterThan(0)
    expect(profitYen).toBeLessThanOrEqual(30_000)
  })

  it('the taught build grades roadworthy AND under the budget cap through the real mission grader', () => {
    const afterCar: CarInstance = {
      ...lot.car,
      id: 'tutorial-after-car',
      symptoms: [],
      apparentBandByPartId: null,
      parts: scriptedPartsWith(lot.car, { tyres: 'mint', headValvetrain: 'worn' }),
    }
    const graded = {
      ...state,
      ownedCars: [afterCar],
      carLedgers: {
        'tutorial-after-car': { purchaseYen: reserve, repairYen, partsYen, listingFeesYen: 0 },
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
