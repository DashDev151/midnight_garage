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
  wordOfMouthMultiplierFor,
  wordOfMouthMultipliers,
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

  it("reaches Known at exactly that scene's own knownDeliveries, not one short", () => {
    const { knownDeliveries } = CONTEXT.economy.sceneStandingProgress
    const almost = deliverN(fresh, 'tuner', knownDeliveries.tuner - 1, 100_000)
    expect(almost.sceneStanding.tuner).toBe('none')
    const there = deliverN(fresh, 'tuner', knownDeliveries.tuner, 100_000)
    expect(there.sceneStanding.tuner).toBe('known')
  })

  it("reaches Respected at exactly that scene's own respectedDeliveries, never before", () => {
    const { respectedDeliveries } = CONTEXT.economy.sceneStandingProgress
    const almost = deliverN(fresh, 'racer', respectedDeliveries.racer - 1, 100_000)
    expect(almost.sceneStanding.racer).toBe('known')
    const there = deliverN(fresh, 'racer', respectedDeliveries.racer, 100_000)
    expect(there.sceneStanding.racer).toBe('respected')
  })

  it("reads each scene's own thresholds, so one delivery count buys different standing in different scenes", () => {
    // The point of the per-scene maps (sprint186.md): the scenes' match rates
    // differ by more than a factor of two, so the same tally cannot mean the
    // same thing everywhere. Collector asks for the fewest deliveries of the
    // six and Show Crowd the most, so a run of deliveries that has already
    // made a shop Respected among Collectors leaves it merely Known among the
    // Show Crowd.
    const { knownDeliveries, respectedDeliveries } = CONTEXT.economy.sceneStandingProgress
    expect(knownDeliveries.collector).toBeLessThan(knownDeliveries['show-crowd'])
    expect(respectedDeliveries.collector).toBeLessThan(respectedDeliveries['show-crowd'])

    const n = respectedDeliveries.collector
    expect(deliverN(fresh, 'collector', n, 100_000).sceneStanding.collector).toBe('respected')
    expect(deliverN(fresh, 'show-crowd', n, 100_000).sceneStanding['show-crowd']).toBe('known')
  })

  it('never reaches The Shop below Respected, however far above the marquee bar the price sits', () => {
    const { knownDeliveries, marqueeBarYenByTier } = CONTEXT.economy.sceneStandingProgress
    const model = CONTEXT.modelsById[MODEL_ID]!
    const marqueeBarYen = marqueeBarYenByTier[fitmentClassForTier(model.tier)]
    // Only the Collector's own `knownDeliveries` deliveries - its Respected
    // threshold is not yet cleared - each priced at twice the marquee bar,
    // which must not matter yet.
    const state = deliverN(fresh, 'collector', knownDeliveries.collector, marqueeBarYen * 2)
    expect(state.sceneStanding.collector).toBe('known')
  })

  it('reaches The Shop on a marquee-priced delivery once Respected is cleared, never on a single cheap sale from nothing', () => {
    const { respectedDeliveries, marqueeBarYenByTier } = CONTEXT.economy.sceneStandingProgress
    const model = CONTEXT.modelsById[MODEL_ID]!
    const marqueeBarYen = marqueeBarYenByTier[fitmentClassForTier(model.tier)]
    const state = deliverN(fresh, 'show-crowd', respectedDeliveries['show-crowd'], marqueeBarYen)
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
    const respected = deliverN(fresh, 'touge', respectedDeliveries.touge, 100_000)
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
    expect(ECONOMY.sceneStandingProgress.rollingWindowDays).toBe(10)
  })
})

describe('wordOfMouthMultiplierFor / wordOfMouthMultipliers (the Known payload, step 5)', () => {
  const fresh = createInitialGameState(CONTEXT, 1)
  const { wordOfMouthMultiplierByStage, rollingWindowShareCap, rollingWindowDays } =
    CONTEXT.economy.sceneStandingProgress

  it('is a flat 1 below Known, whatever the day', () => {
    expect(wordOfMouthMultiplierFor('tuner', fresh, CONTEXT.economy)).toBe(1)
  })

  it('matches the shipped per-stage multiplier exactly when nothing is in the recent window', () => {
    for (const stage of ['known', 'respected', 'shop'] as const) {
      const state = { ...fresh, sceneStanding: { ...fresh.sceneStanding, tuner: stage } }
      expect(wordOfMouthMultiplierFor('tuner', state, CONTEXT.economy)).toBeCloseTo(
        wordOfMouthMultiplierByStage[stage],
        9,
      )
    }
  })

  it('rises toward the rolling-window cap with recent share, reaches exactly the cap when worked exclusively, and never moves for a delivery outside the window', () => {
    const known = { ...fresh, sceneStanding: { ...fresh.sceneStanding, tuner: 'known' as const } }
    const day = 100

    const untouched: GameState = { ...known, day, sceneLedger: freshSceneLedger() }
    expect(wordOfMouthMultiplierFor('tuner', untouched, CONTEXT.economy)).toBeCloseTo(
      wordOfMouthMultiplierByStage.known,
      9,
    )

    const halfShare: GameState = {
      ...known,
      day,
      sceneLedger: {
        ...freshSceneLedger(),
        tuner: [{ carInstanceId: 'a', modelId: MODEL_ID, priceYen: 1, day: day - 1 }],
        racer: [{ carInstanceId: 'b', modelId: MODEL_ID, priceYen: 1, day: day - 1 }],
      },
    }
    const halfMultiplier = wordOfMouthMultiplierFor('tuner', halfShare, CONTEXT.economy)
    expect(halfMultiplier).toBeGreaterThan(wordOfMouthMultiplierByStage.known)
    expect(halfMultiplier).toBeCloseTo(
      wordOfMouthMultiplierByStage.known * (1 + 0.5 * (rollingWindowShareCap - 1)),
      6,
    )

    const exclusive: GameState = {
      ...known,
      day,
      sceneLedger: {
        ...freshSceneLedger(),
        tuner: [{ carInstanceId: 'a', modelId: MODEL_ID, priceYen: 1, day: day - 1 }],
      },
    }
    expect(wordOfMouthMultiplierFor('tuner', exclusive, CONTEXT.economy)).toBeCloseTo(
      wordOfMouthMultiplierByStage.known * rollingWindowShareCap,
      9,
    )

    const stale: GameState = {
      ...known,
      day,
      sceneLedger: {
        ...freshSceneLedger(),
        tuner: [
          { carInstanceId: 'a', modelId: MODEL_ID, priceYen: 1, day: day - rollingWindowDays - 1 },
        ],
      },
    }
    expect(wordOfMouthMultiplierFor('tuner', stale, CONTEXT.economy)).toBeCloseTo(
      wordOfMouthMultiplierByStage.known,
      9,
    )
  })

  it('pivots within days: switching who was recently delivered to moves the multiplier without the standing STAGE ever regressing', () => {
    const bothKnown = {
      ...fresh,
      sceneStanding: { ...fresh.sceneStanding, tuner: 'known' as const, racer: 'known' as const },
    }
    const day = 100
    const pivotedToRacer: GameState = {
      ...bothKnown,
      day,
      sceneLedger: {
        ...freshSceneLedger(),
        racer: [{ carInstanceId: 'a', modelId: MODEL_ID, priceYen: 1, day: day - 1 }],
      },
    }
    expect(pivotedToRacer.sceneStanding.tuner).toBe('known')
    const tunerMultiplier = wordOfMouthMultiplierFor('tuner', pivotedToRacer, CONTEXT.economy)
    const racerMultiplier = wordOfMouthMultiplierFor('racer', pivotedToRacer, CONTEXT.economy)
    expect(tunerMultiplier).toBeCloseTo(wordOfMouthMultiplierByStage.known, 9)
    expect(racerMultiplier).toBeGreaterThan(tunerMultiplier)
  })

  it('wordOfMouthMultipliers computes every scene at once, agreeing with the per-scene function', () => {
    const state = {
      ...fresh,
      sceneStanding: { ...fresh.sceneStanding, collector: 'shop' as const },
    }
    const all = wordOfMouthMultipliers(state, CONTEXT.economy)
    for (const scene of Object.keys(all) as BuyerArchetype[]) {
      expect(all[scene]).toBeCloseTo(wordOfMouthMultiplierFor(scene, state, CONTEXT.economy), 9)
    }
  })
})

describe('sceneLedgerFor (the genuinely-optional-key read)', () => {
  it('reads a fresh, all-empty ledger when GameState.sceneLedger is absent (a pre-existing fixture or save)', () => {
    const withoutLedger = { ...createInitialGameState(CONTEXT, 1), sceneLedger: undefined }
    expect(sceneLedgerFor(withoutLedger)).toEqual(freshSceneLedger())
  })
})
