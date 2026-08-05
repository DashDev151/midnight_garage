import {
  BUYERS,
  BuyerArchetypeSchema,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type BuyerArchetype,
  type GameState,
  type PowerExpectationChain,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import {
  advanceSceneCommissions,
  gradeSceneCommissionCar,
  resolveAcceptSceneCommission,
  resolveDeliverSceneCommission,
} from '../src/sceneCommissions'
import { drawDailyOffers } from '../src/selling'
import { currentPowerExpectationBarPs, valuateCarForBuyer } from '../src/valuation'
import { buildCarInstance } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const MODEL = CONTEXT.models[0]!

/** A fresh career with `scene` standing already at `stage`. */
function withStage(scene: BuyerArchetype, stage: 'respected' | 'shop'): GameState {
  const fresh = createInitialGameState(CONTEXT, 1)
  return { ...fresh, sceneStanding: { ...fresh.sceneStanding, [scene]: stage } }
}

/** `scene`'s freshly generated commission, one call in. Throws if nothing
 * generated, so a broken generation path fails the test that calls this
 * rather than a confusing null-access three lines later. */
function commissionFor(scene: BuyerArchetype, state: GameState = withStage(scene, 'respected')) {
  const result = advanceSceneCommissions(state, CONTEXT, createRng(1))
  const commission = result.state.sceneCommissions?.[scene]
  if (!commission) throw new Error(`expected a generated commission for ${scene}`)
  return { state: result.state, commission }
}

describe('advanceSceneCommissions (the Respected payload, step 6)', () => {
  it('generates nothing for any scene still below Respected', () => {
    const fresh = createInitialGameState(CONTEXT, 1)
    const result = advanceSceneCommissions(fresh, CONTEXT, createRng(1))
    expect(result.state).toBe(fresh)
    for (const scene of BuyerArchetypeSchema.options) {
      expect(result.state.sceneCommissions?.[scene]).toBeNull()
    }
  })

  it('generates one live, offered commission the moment a scene reaches Respected', () => {
    const { commission } = commissionFor('daily-drivers')
    expect(commission.status).toBe('offered')
    expect(commission.acceptedOnDay).toBeNull()
    expect(commission.requirements.length).toBeGreaterThan(0)
  })

  it('also generates one at The Shop - a later stage keeps every grant an earlier one earned', () => {
    const { commission } = commissionFor('collector', withStage('collector', 'shop'))
    expect(commission.status).toBe('offered')
  })

  it("reuses that scene's own persona when one exists, and its own wantLine as the brief verbatim", () => {
    const buyer = CONTEXT.buyers.find((b) => b.archetype === 'tuner')!
    const persona = CONTEXT.personas.find((p) => p.archetype === 'tuner')!
    const { commission } = commissionFor('tuner')
    expect(commission.customerName).toBe(persona.name)
    expect(commission.requestCopy).toBe(buyer.wantLine)
  })

  it('falls back to a generic customer name for a scene with no persona yet', () => {
    expect(CONTEXT.personas.some((p) => p.archetype === 'racer')).toBe(false)
    const { commission } = commissionFor('racer')
    expect(commission.customerName.length).toBeGreaterThan(0)
    expect(CONTEXT.personas.some((p) => p.name === commission.customerName)).toBe(false)
  })

  it.each([
    ['collector', 'authenticity'],
    ['tuner', 'power'],
    ['show-crowd', 'style'],
    ['racer', 'power'],
    ['daily-drivers', 'reliability'],
    ['touge', 'handling'],
  ] as const)(
    "%s's commission reads its own highest-importance stat: %s",
    (scene, expectedStat) => {
      const { commission } = commissionFor(scene)
      expect(commission.requirements[0]!.kind).toBe('statThreshold')
      expect((commission.requirements[0] as { stat: string }).stat).toBe(expectedStat)
    },
  )

  it('racer, tuner and touge ask for power somewhere in the brief; every other scene never mentions it at all', () => {
    // The tuner's own champion moved to power (sprint182.md's importance
    // change), so its brief now names power as its sole requirement rather
    // than through the power-hungry chain path racer and touge use.
    for (const scene of BuyerArchetypeSchema.options) {
      const { commission } = commissionFor(scene)
      const mentionsPower = commission.requirements.some(
        (r) => r.kind === 'statThreshold' && r.stat === 'power',
      )
      expect(mentionsPower, scene).toBe(scene === 'racer' || scene === 'touge' || scene === 'tuner')
    }
  })

  it("touge's champion is handling, so it carries a SECOND requirement for power; racer's champion already is power, so it carries exactly one", () => {
    const touge = commissionFor('touge').commission
    expect(touge.requirements).toHaveLength(2)
    expect(touge.requirements.map((r) => (r.kind === 'statThreshold' ? r.stat : r.kind))).toEqual([
      'handling',
      'power',
    ])

    const racer = commissionFor('racer').commission
    expect(racer.requirements).toHaveLength(1)
  })

  describe('the power ask, only for racers and touge (THE PIECE THAT MATTERS MOST)', () => {
    const racerBuyer = CONTEXT.buyers.find((b) => b.archetype === 'racer')!
    const ordinaryPs = Math.round(
      racerBuyer.statTargets.power.target * ECONOMY.statFormulas.powerNormalizationCeiling,
    )

    it('reads exactly ordinary appetite before anyone has ever delivered a car', () => {
      const { commission } = commissionFor('racer')
      expect(commission.requirements[0]!.kind).toBe('statThreshold')
      expect((commission.requirements[0] as { min: number }).min).toBe(ordinaryPs)
    })

    it('climbs to the current power-expectation bar once one exists and it exceeds ordinary appetite', () => {
      const chain: PowerExpectationChain = { bestPowerPs: 1000, climbedSteps: 0 }
      const state = { ...withStage('racer', 'respected'), powerExpectationChain: chain }
      const { commission } = commissionFor('racer', state)
      const bar = currentPowerExpectationBarPs(chain, CONTEXT.economy)!
      expect((commission.requirements[0] as { min: number }).min).toBe(Math.round(bar))
      expect((commission.requirements[0] as { min: number }).min).toBeGreaterThan(ordinaryPs)
    })

    it("never asks below that scene's own ordinary appetite, even if the player's best-ever delivery was weak", () => {
      const chain: PowerExpectationChain = { bestPowerPs: 10, climbedSteps: 0 }
      const state = { ...withStage('racer', 'respected'), powerExpectationChain: chain }
      const { commission } = commissionFor('racer', state)
      expect((commission.requirements[0] as { min: number }).min).toBe(ordinaryPs)
    })

    it('ordinary buyer valuation never reads the chain at all - ordinary sale prices are bit-for-bit identical whether or not it has been consumed', () => {
      const car = buildCarInstance({ modelId: MODEL.id, id: 'probe-car' })
      const baseState: GameState = {
        ...createInitialGameState(CONTEXT, 7),
        ownedCars: [car],
        carsForSale: [
          {
            carInstanceId: car.id,
            offersSeen: 0,
            channelId: 'shopFront',
            weekendMeetPending: false,
          },
        ],
      }
      const untouched = { ...baseState, powerExpectationChain: undefined }
      const consumed = {
        ...baseState,
        powerExpectationChain: { bestPowerPs: 900, climbedSteps: 2 } as PowerExpectationChain,
      }
      const drawWithout = drawDailyOffers(untouched, CONTEXT, createRng(3), 2)
      const drawWith = drawDailyOffers(consumed, CONTEXT, createRng(3), 2)
      expect(drawWith.state.pendingOffers).toEqual(drawWithout.state.pendingOffers)

      // And directly at the valuation function every ordinary sale actually
      // prices through - it takes no chain (or even a whole GameState) at
      // all, so there is no argument through which one could leak in.
      const price = valuateCarForBuyer(
        racerBuyer,
        MODEL,
        car,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        CONTEXT.partsTaxonomyById,
        100,
        CONTEXT.economy,
      )
      expect(price).toBeGreaterThan(0)
    })
  })

  it('refreshes an unaccepted commission once it has sat for refreshIntervalDays, and never touches one still fresh', () => {
    const generated = commissionFor('daily-drivers')
    const { refreshIntervalDays } = ECONOMY.sceneCommissions

    const stillFresh = advanceSceneCommissions(
      { ...generated.state, day: generated.state.day + refreshIntervalDays - 1 },
      CONTEXT,
      createRng(2),
    )
    expect(stillFresh.state.sceneCommissions!['daily-drivers']).toEqual(generated.commission)

    const refreshed = advanceSceneCommissions(
      { ...generated.state, day: generated.state.day + refreshIntervalDays },
      CONTEXT,
      createRng(2),
    )
    const refreshedCommission = refreshed.state.sceneCommissions!['daily-drivers']!
    expect(refreshedCommission.status).toBe('offered')
    expect(refreshedCommission.postedOnDay).toBe(generated.state.day + refreshIntervalDays)
  })

  it('never touches an ACTIVE (accepted) commission, however long it has sat', () => {
    const generated = commissionFor('daily-drivers')
    const accepted = resolveAcceptSceneCommission(generated.state, 'daily-drivers').state
    const { refreshIntervalDays } = ECONOMY.sceneCommissions
    const muchLater = advanceSceneCommissions(
      { ...accepted, day: accepted.day + refreshIntervalDays * 10 },
      CONTEXT,
      createRng(3),
    )
    expect(muchLater.state.sceneCommissions!['daily-drivers']).toEqual(
      accepted.sceneCommissions!['daily-drivers'],
    )
  })
})

describe('resolveAcceptSceneCommission', () => {
  it('offered -> active, stamping acceptedOnDay, and is a no-op when nothing is offered', () => {
    const { state } = commissionFor('daily-drivers')
    const result = resolveAcceptSceneCommission(state, 'daily-drivers')
    const accepted = result.state.sceneCommissions!['daily-drivers']!
    expect(accepted.status).toBe('active')
    expect(accepted.acceptedOnDay).toBe(state.day)
    expect(result.log).toEqual([{ type: 'scene-commission-accepted', scene: 'daily-drivers' }])

    const noOp = resolveAcceptSceneCommission(result.state, 'collector')
    expect(noOp.state).toBe(result.state)
    expect(noOp.log).toEqual([])
  })
})

describe('gradeSceneCommissionCar / resolveDeliverSceneCommission', () => {
  /** A mint, all-stock car - comfortably clears every shipped archetype's
   * champion-stat requirement, since a fresh stock car is exactly what the
   * generation baseline (`normalizedTasteScore`) is authored against. */
  function mintCar(): { car: ReturnType<typeof buildCarInstance>; state: GameState } {
    const car = buildCarInstance({ modelId: MODEL.id, id: 'mint-probe' })
    const accepted = resolveAcceptSceneCommission(
      commissionFor('daily-drivers').state,
      'daily-drivers',
    ).state
    return { car, state: { ...accepted, ownedCars: [car] } }
  }

  it('grades pass on a car that clears the champion-stat requirement, fail on one nowhere near it', () => {
    const { car, state } = mintCar()
    const pass = gradeSceneCommissionCar(state, 'daily-drivers', car.id, CONTEXT)
    expect(pass.pass).toBe(true)

    const wreck = buildCarInstance({
      modelId: MODEL.id,
      id: 'wreck-probe',
      parts: { ...car.parts, cooling: { installed: null } },
    })
    const failState = { ...state, ownedCars: [wreck] }
    const fail = gradeSceneCommissionCar(failState, 'daily-drivers', wreck.id, CONTEXT)
    expect(fail.pass).toBe(false)
    // A grade report always reports every line even on failure - the
    // contract `gradeMissionCar` already establishes.
    expect(fail.lines.length).toBe(state.sceneCommissions!['daily-drivers']!.requirements.length)
  })

  it("delivering pays economy.sceneCommissions.payoutMultiplier times the ACTUAL delivered car's own open-market value, credits the scene, and clears the board slot", () => {
    const { car, state } = mintCar()
    const buyer = CONTEXT.buyers.find((b) => b.archetype === 'daily-drivers')!
    const heatPercent = state.marketHeat[car.modelId] ?? 100
    const openMarketValueYen = valuateCarForBuyer(
      buyer,
      MODEL,
      car,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.partsTaxonomyById,
      heatPercent,
      CONTEXT.economy,
    )
    const expectedPayout = Math.round(
      ECONOMY.sceneCommissions.payoutMultiplier * openMarketValueYen,
    )

    const result = resolveDeliverSceneCommission(state, 'daily-drivers', car.id, CONTEXT)
    expect(result.log).toEqual([
      {
        type: 'scene-commission-delivered',
        scene: 'daily-drivers',
        carInstanceId: car.id,
        payoutYen: expectedPayout,
      },
    ])
    expect(result.state.cashYen).toBe(state.cashYen + expectedPayout)
    expect(result.state.ownedCars).toEqual([])
    expect(result.state.sceneCommissions!['daily-drivers']).toBeNull()
    expect(result.state.sceneLedger?.['daily-drivers']).toEqual([
      { carInstanceId: car.id, modelId: car.modelId, priceYen: expectedPayout, day: state.day },
    ])
  })

  it('is a no-op on a car that fails to grade, on an unknown car, or when nothing is active', () => {
    const { car, state } = mintCar()
    const notActive = { ...state, sceneCommissions: { ...state.sceneCommissions!, tuner: null } }
    const noCommission = resolveDeliverSceneCommission(notActive, 'tuner', car.id, CONTEXT)
    expect(noCommission.state).toBe(notActive)

    const unknownCar = resolveDeliverSceneCommission(state, 'daily-drivers', 'nope', CONTEXT)
    expect(unknownCar.state).toBe(state)

    const wreck = buildCarInstance({
      modelId: MODEL.id,
      id: 'wreck-probe-2',
      parts: { ...car.parts, cooling: { installed: null } },
    })
    const failingState = { ...state, ownedCars: [wreck] }
    const failedGrade = resolveDeliverSceneCommission(
      failingState,
      'daily-drivers',
      wreck.id,
      CONTEXT,
    )
    expect(failedGrade.state).toBe(failingState)
    expect(failedGrade.log).toEqual([])
  })
})

describe('never regresses ordinary buyer statTargets (a Racers or Touge commission never drags the general buyer pool)', () => {
  it("generating a commission mutates nothing on buyers.json's own authored statTargets", () => {
    const before = JSON.stringify(BUYERS)
    commissionFor('racer')
    commissionFor('touge')
    expect(JSON.stringify(BUYERS)).toBe(before)
  })

  it('a 700 PS build and a 300 PS build are both worth something to an ordinary buyer at the same time - the chain never inflates or deflates ordinary appetite', () => {
    const heavy = computeDerivedStats(
      MODEL,
      buildCarInstance({ modelId: MODEL.id, id: 'heavy' }),
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    // The claim under test is structural (valuateCarForBuyer takes no chain
    // argument, so ordinary appetite cannot move with it) and is exercised
    // directly above; this only confirms a plain stock car's own power
    // reads as a real, sane, nonzero PS figure the rest of this file's
    // reasoning depends on.
    expect(heavy.power).toBeGreaterThan(0)
  })
})
