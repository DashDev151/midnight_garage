import {
  BuyerArchetypeSchema,
  FRESH_SCENE_COMMISSIONS,
  fitmentClassForTier,
  type Buyer,
  type BuyerArchetype,
  type DayLogEntry,
  type EconomyConfig,
  type GameState,
  type RequirementSpec,
  type SceneCommission,
  type SceneCommissionBoard,
  type SceneStandingStage,
  type StatKey,
} from '@midnight-garage/content'
import { dissolveAssembliesForCar } from './assemblies'
import { carLedgerFor, deleteCarLedger } from './carLedger'
import type { SimContext } from './context'
import { releaseCarFromShop } from './facilities'
import { bookCashMovements } from './financeLedger'
import type { MissionGradeReport } from './missions'
import { evaluateRequirement } from './requirements'
import type { Rng } from './rng'
import { creditSceneDelivery } from './sceneStanding'
import { clearStagedWork } from './stagedWork'
import { championStatFor, currentPowerExpectationBarPs, valuateCarForBuyer } from './valuation'

export interface SceneCommissionResolution {
  state: GameState
  log: DayLogEntry[]
}

/** A fresh shop's commission board: every scene with nothing live. Mirrors
 * `freshSceneLedger` (sceneStanding.ts) for `createInitialGameState`'s own
 * call-site style. */
export function freshSceneCommissions(): SceneCommissionBoard {
  return FRESH_SCENE_COMMISSIONS
}

/**
 * `state.sceneCommissions`, defaulting to every scene with nothing live -
 * the genuinely-optional-key read (`GameState.sceneCommissions`'s own doc
 * comment): a fixture, bot or pre-existing save that predates this
 * mechanic reads exactly as a shop with no commission anywhere yet.
 */
export function sceneCommissionsFor(state: GameState): SceneCommissionBoard {
  return state.sceneCommissions ?? freshSceneCommissions()
}

/** A scene offers commissions once it is Respected or better - the Shop
 * stage keeps every grant a lower stage earned, so a scene that has gone
 * on to earn its craft operation still gets briefs too. */
const RESPECTED_OR_ABOVE: ReadonlySet<SceneStandingStage> = new Set(['respected', 'shop'])

/**
 * The two scenes whose commissions read the climbing power-expectation
 * chain (`currentPowerExpectationBarPs`, sim/valuation.ts) - power is the
 * top of the market, and only these two are the top of the market. Every
 * other scene's commission never mentions power at all, so a Daily Drivers
 * or Collector brief is never dragged toward a figure that would be absurd
 * for it.
 */
const POWER_HUNGRY_SCENES: readonly BuyerArchetype[] = ['racer', 'touge']

/**
 * The PS a commission's power requirement asks for. A power-hungry scene
 * asks at or near the current power-expectation bar - the player's own best
 * delivered build, discounted as they keep meeting it - but never below
 * that buyer's own ordinary appetite, so the ask can only ever be as
 * demanding as normal or more, never a step down. Every other scene simply
 * reads its own ordinary appetite; the chain is never consulted for it, so
 * the top of the market moves without dragging the general buyer pool
 * behind it.
 */
function powerRequirementPs(
  buyer: Buyer,
  scene: BuyerArchetype,
  state: GameState,
  economy: EconomyConfig,
): number {
  const ordinaryPs = buyer.statTargets.power.target * economy.statFormulas.powerNormalizationCeiling
  if (!POWER_HUNGRY_SCENES.includes(scene)) return Math.round(ordinaryPs)
  const bar = currentPowerExpectationBarPs(state.powerExpectationChain, economy)
  return Math.round(bar !== undefined ? Math.max(bar, ordinaryPs) : ordinaryPs)
}

/**
 * A scene commission's whole requirement set: the scene's own champion
 * stat, at that buyer's authored target, converted onto the raw scale
 * `computeDerivedStats` reports (power in PS via `powerRequirementPs`
 * above, every other stat times 100). A power-hungry scene whose champion
 * ISN'T power (Touge, handling) gets a SECOND requirement asking for power
 * too, so its brief reads exactly as the design names it; Racers' champion
 * is already power, so it gets exactly one requirement, never two.
 */
function commissionRequirementsFor(
  buyer: Buyer,
  scene: BuyerArchetype,
  state: GameState,
  economy: EconomyConfig,
): RequirementSpec[] {
  const champion = championStatFor(buyer)
  const valueFor = (stat: StatKey): number =>
    stat === 'power'
      ? powerRequirementPs(buyer, scene, state, economy)
      : Math.round(buyer.statTargets[stat].target * 100)
  const requirements: RequirementSpec[] = [
    { kind: 'statThreshold', stat: champion, min: valueFor(champion) },
  ]
  if (POWER_HUNGRY_SCENES.includes(scene) && champion !== 'power') {
    requirements.push({ kind: 'statThreshold', stat: 'power', min: valueFor('power') })
  }
  return requirements
}

/**
 * The commission's named customer - that scene's own persona when one
 * fronts a story mission (`personas.json`'s `archetype`), otherwise a
 * generic customer name off the same pool service jobs already draw from
 * (`serviceJobCustomerNames.json`). Reuses both existing naming pools
 * rather than authoring a third: a scene with no persona yet (Collectors,
 * Racers) still gets a named brief.
 */
function commissionCustomerName(scene: BuyerArchetype, context: SimContext, rng: Rng): string {
  const matchingPersonas = context.personas.filter((p) => p.archetype === scene)
  if (matchingPersonas.length > 0) return rng.pick(matchingPersonas).name
  if (context.serviceJobCustomerNames.length > 0) return rng.pick(context.serviceJobCustomerNames)
  return 'A regular customer'
}

/**
 * One freshly generated commission for `scene` - the customer's name, their
 * own `wantLine` verbatim as the brief (so the ask and the buyer can never
 * drift apart), and the requirement set above. `undefined` only when the
 * scene has no matching `Buyer` at all, which never happens for a shipped
 * archetype.
 */
function generateSceneCommission(
  scene: BuyerArchetype,
  state: GameState,
  context: SimContext,
  rng: Rng,
): SceneCommission | undefined {
  const buyer = context.buyers.find((b) => b.archetype === scene)
  if (!buyer) return undefined
  return {
    customerName: commissionCustomerName(scene, context, rng),
    requestCopy: buyer.wantLine,
    requirements: commissionRequirementsFor(buyer, scene, state, context.economy),
    status: 'offered',
    postedOnDay: state.day,
    acceptedOnDay: null,
  }
}

/**
 * The day-boundary tick for every scene's commission board (docs/sprints/
 * scene-standing-arc.md step 6): a Respected-or-better scene with nothing
 * live gets one generated immediately; an `offered` (never accepted)
 * commission sitting for `economy.sceneCommissions.refreshIntervalDays` or
 * longer is replaced by a fresh one - "refreshing weekly if unaccepted",
 * read as a rolling age check against `postedOnDay` rather than a calendar
 * weekday, so a scene reaching Respected mid-week still gets its first
 * refresh exactly one cadence later. An `active` (accepted) commission is
 * never touched here - like a story mission, it is unfailable and undated
 * once accepted. Offering is silent, the same convention
 * `advanceStoryMissions` uses - the player reads the brief appearing, no
 * log entry.
 */
export function advanceSceneCommissions(
  state: GameState,
  context: SimContext,
  rng: Rng,
): SceneCommissionResolution {
  const board = sceneCommissionsFor(state)
  let next = board
  let changed = false
  for (const scene of BuyerArchetypeSchema.options) {
    if (!RESPECTED_OR_ABOVE.has(state.sceneStanding[scene])) continue
    const existing = next[scene]
    const staleOffer =
      existing !== null &&
      existing.status === 'offered' &&
      state.day - existing.postedOnDay >= context.economy.sceneCommissions.refreshIntervalDays
    if (existing !== null && !staleOffer) continue
    const fresh = generateSceneCommission(scene, state, context, rng)
    if (!fresh) continue
    next = { ...next, [scene]: fresh }
    changed = true
  }
  if (!changed) return { state, log: [] }
  return { state: { ...state, sceneCommissions: next }, log: [] }
}

/**
 * Offered -> active for `scene`'s live commission, stamping `acceptedOnDay`
 * only - there is no deadline to count from, mirroring
 * `resolveAcceptMission`. A no-op when nothing is offered for that scene.
 */
export function resolveAcceptSceneCommission(
  state: GameState,
  scene: BuyerArchetype,
): SceneCommissionResolution {
  const board = sceneCommissionsFor(state)
  const commission = board[scene]
  if (!commission || commission.status !== 'offered') return { state, log: [] }
  const accepted: SceneCommission = { ...commission, status: 'active', acceptedOnDay: state.day }
  return {
    state: { ...state, sceneCommissions: { ...board, [scene]: accepted } },
    log: [{ type: 'scene-commission-accepted', scene }],
  }
}

/**
 * Pure, free, repeatable - every one of `scene`'s active commission
 * requirements against `carInstanceId`, mirroring `gradeMissionCar`'s own
 * contract exactly (no state change; an unresolvable commission or car
 * reports an outright fail with no lines rather than throwing).
 */
export function gradeSceneCommissionCar(
  state: GameState,
  scene: BuyerArchetype,
  carInstanceId: string,
  context: SimContext,
): MissionGradeReport {
  const commission = sceneCommissionsFor(state)[scene]
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!commission || !car) return { pass: false, lines: [] }

  const model = context.modelsById[car.modelId]
  const ledger = carLedgerFor(state, carInstanceId)
  const lines = commission.requirements.map((requirement) =>
    evaluateRequirement(requirement, car, ledger, state.day, context, model),
  )
  return { pass: lines.every((line) => line.pass), lines }
}

/**
 * Requires `gradeSceneCommissionCar` to pass; removes the car (the same
 * release/staged-work/assembly/ledger cleanup every other car-exit path
 * uses), pays `economy.sceneCommissions.payoutMultiplier` times what the
 * ACTUAL delivered car would fetch on the open market for that scene's own
 * buyer (`valuateCarForBuyer` - never a flat authored figure, so the
 * commission can never under- or over-quote a car nobody had chosen yet),
 * and credits the scene exactly as a matched sale does
 * (`creditSceneDelivery`). Clears the board slot back to `null` so
 * `advanceSceneCommissions` can generate a fresh brief from the next day
 * onward. A no-op when the commission isn't `active`, the car doesn't
 * exist, or grading fails.
 */
export function resolveDeliverSceneCommission(
  state: GameState,
  scene: BuyerArchetype,
  carInstanceId: string,
  context: SimContext,
): SceneCommissionResolution {
  const board = sceneCommissionsFor(state)
  const commission = board[scene]
  if (!commission || commission.status !== 'active') return { state, log: [] }
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  const buyer = context.buyers.find((b) => b.archetype === scene)
  if (!model || !buyer) return { state, log: [] }

  const grade = gradeSceneCommissionCar(state, scene, carInstanceId, context)
  if (!grade.pass) return { state, log: [] }

  const heatPercent = state.marketHeat[car.modelId] ?? 100
  const openMarketValueYen = valuateCarForBuyer(
    buyer,
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
  )
  const payoutYen = Math.round(
    context.economy.sceneCommissions.payoutMultiplier * openMarketValueYen,
  )

  const clearedState = dissolveAssembliesForCar(
    clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId),
    carInstanceId,
  )
  const withScene = creditSceneDelivery(
    clearedState,
    scene,
    {
      carInstanceId,
      modelId: car.modelId,
      priceYen: payoutYen,
      day: state.day,
      fitmentClass: fitmentClassForTier(model.tier),
    },
    context.economy,
  )

  const log: DayLogEntry[] = [
    { type: 'scene-commission-delivered', scene, carInstanceId, payoutYen },
  ]

  return {
    state: bookCashMovements(
      deleteCarLedger(
        {
          ...withScene,
          cashYen: withScene.cashYen + payoutYen,
          ownedCars: withScene.ownedCars.filter((c) => c.id !== carInstanceId),
          sceneCommissions: { ...board, [scene]: null },
        },
        carInstanceId,
      ),
      log,
      context.economy,
    ),
    log,
  }
}
