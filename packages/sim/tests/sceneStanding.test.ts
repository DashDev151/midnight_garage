import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type BuyerArchetype,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import {
  creditSceneDelivery,
  freshSceneLedger,
  recentSceneLedgerEntries,
  sceneLedgerFor,
} from '../src/sceneStanding'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const MODEL_ID = CARS[0]!.id
const FITMENT_CLASS = fitmentClassForTier(CONTEXT.modelsById[MODEL_ID]!.tier)

/** Credits `n` matched deliveries to `scene`, each at `priceYen`, on
 * consecutive days from `startDay`. Pure - never mutates `state`. */
function deliverN(
  state: GameState,
  scene: BuyerArchetype,
  n: number,
  priceYen: number,
  startDay = 1,
): GameState {
  let result = state
  for (let i = 0; i < n; i++) {
    result = creditSceneDelivery(
      result,
      scene,
      {
        carInstanceId: `car-${scene}-${i}`,
        modelId: MODEL_ID,
        priceYen,
        day: startDay + i,
        fitmentClass: FITMENT_CLASS,
      },
      CONTEXT.economy,
    )
  }
  return result
}

describe('creditSceneDelivery (scene-standing-arc.md step 4)', () => {
  const fresh = createInitialGameState(CONTEXT, 1)

  it('appends the car, scene, price and day to the permanent ledger, and touches no other scene', () => {
    const result = creditSceneDelivery(
      fresh,
      'tuner',
      {
        carInstanceId: 'car-x',
        modelId: MODEL_ID,
        priceYen: 500_000,
        day: 3,
        fitmentClass: FITMENT_CLASS,
      },
      CONTEXT.economy,
    )
    expect(result.sceneLedger?.tuner).toEqual([
      { carInstanceId: 'car-x', modelId: MODEL_ID, priceYen: 500_000, day: 3 },
    ])
    expect(result.sceneLedger?.collector).toEqual([])
    expect(result.sceneStanding.collector).toBe('none')
  })

  it('reaches Known at exactly knownDeliveries matched deliveries, not one short', () => {
    const { knownDeliveries } = CONTEXT.economy.sceneStandingProgress
    const almost = deliverN(fresh, 'tuner', knownDeliveries - 1, 100_000)
    expect(almost.sceneStanding.tuner).toBe('none')
    const there = deliverN(fresh, 'tuner', knownDeliveries, 100_000)
    expect(there.sceneStanding.tuner).toBe('known')
  })

  it('reaches Respected at exactly respectedDeliveries, never before', () => {
    const { respectedDeliveries } = CONTEXT.economy.sceneStandingProgress
    const almost = deliverN(fresh, 'racer', respectedDeliveries - 1, 100_000)
    expect(almost.sceneStanding.racer).toBe('known')
    const there = deliverN(fresh, 'racer', respectedDeliveries, 100_000)
    expect(there.sceneStanding.racer).toBe('respected')
  })

  it('never reaches The Shop below Respected, however far above the marquee bar the price sits', () => {
    const { knownDeliveries, marqueeBarYenByTier } = CONTEXT.economy.sceneStandingProgress
    const model = CONTEXT.modelsById[MODEL_ID]!
    const marqueeBarYen = marqueeBarYenByTier[fitmentClassForTier(model.tier)]
    // Only `knownDeliveries` deliveries - Respected (10) is not yet cleared -
    // each priced at twice the marquee bar, which must not matter yet.
    const state = deliverN(fresh, 'collector', knownDeliveries, marqueeBarYen * 2)
    expect(state.sceneStanding.collector).toBe('known')
  })

  it('reaches The Shop on a marquee-priced delivery once Respected is cleared, never on a single cheap sale from nothing', () => {
    const { respectedDeliveries, marqueeBarYenByTier } = CONTEXT.economy.sceneStandingProgress
    const model = CONTEXT.modelsById[MODEL_ID]!
    const marqueeBarYen = marqueeBarYenByTier[fitmentClassForTier(model.tier)]
    const state = deliverN(fresh, 'show-crowd', respectedDeliveries, marqueeBarYen)
    expect(state.sceneStanding['show-crowd']).toBe('shop')

    // The same marquee price, alone, from a scene that has never heard of the
    // shop: nowhere near enough - the count never clears, so the price alone
    // can never vault it to the top.
    const single = creditSceneDelivery(
      fresh,
      'show-crowd',
      {
        carInstanceId: 'one-off',
        modelId: MODEL_ID,
        priceYen: marqueeBarYen,
        day: 1,
        fitmentClass: FITMENT_CLASS,
      },
      CONTEXT.economy,
    )
    expect(single.sceneStanding['show-crowd']).toBe('none')
  })

  it('never regresses a stage once earned, even when a later delivery is cheap', () => {
    const { respectedDeliveries } = CONTEXT.economy.sceneStandingProgress
    const respected = deliverN(fresh, 'touge', respectedDeliveries, 100_000)
    expect(respected.sceneStanding.touge).toBe('respected')
    const afterCheapSale = creditSceneDelivery(
      respected,
      'touge',
      {
        carInstanceId: 'cheap',
        modelId: MODEL_ID,
        priceYen: 1,
        day: 999,
        fitmentClass: FITMENT_CLASS,
      },
      CONTEXT.economy,
    )
    expect(afterCheapSale.sceneStanding.touge).toBe('respected')
  })
})

describe('recentSceneLedgerEntries (the rolling window - recorded, unconsumed this sprint)', () => {
  it('keeps entries strictly within the window and drops older ones, inclusive of today', () => {
    const ledger = {
      ...freshSceneLedger(),
      'daily-drivers': [
        { carInstanceId: 'too-old', modelId: MODEL_ID, priceYen: 1, day: 1 },
        { carInstanceId: 'excluded-boundary', modelId: MODEL_ID, priceYen: 1, day: 6 },
        { carInstanceId: 'included-boundary', modelId: MODEL_ID, priceYen: 1, day: 7 },
        { carInstanceId: 'today', modelId: MODEL_ID, priceYen: 1, day: 20 },
      ],
    }
    const recent = recentSceneLedgerEntries(ledger, 'daily-drivers', 20, 14)
    expect(recent.map((e) => e.carInstanceId)).toEqual(['included-boundary', 'today'])
  })

  it('matches the shipped rollingWindowDays lever', () => {
    expect(ECONOMY.sceneStandingProgress.rollingWindowDays).toBe(14)
  })
})

describe('sceneLedgerFor (the genuinely-optional-key read)', () => {
  it('reads a fresh, all-empty ledger when GameState.sceneLedger is absent (a pre-existing fixture or save)', () => {
    const withoutLedger = { ...createInitialGameState(CONTEXT, 1), sceneLedger: undefined }
    expect(sceneLedgerFor(withoutLedger)).toEqual(freshSceneLedger())
  })
})
