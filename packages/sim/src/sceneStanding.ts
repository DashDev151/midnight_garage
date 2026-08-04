import {
  FRESH_SCENE_LEDGER,
  SceneStandingStageSchema,
  type BuyerArchetype,
  type EconomyConfig,
  type GameState,
  type PartFitmentClass,
  type SceneLedger,
  type SceneLedgerEntry,
  type SceneStandingStage,
} from '@midnight-garage/content'

/**
 * A fresh shop's ledger: every scene's delivery history empty. Mirrors
 * `freshSceneStanding` (valuation.ts) for `createInitialGameState`'s own
 * call-site style, reading the one content-side default rather than a
 * second copy of the same six-scene shape.
 */
export function freshSceneLedger(): SceneLedger {
  return FRESH_SCENE_LEDGER
}

/**
 * `state.sceneLedger`, defaulting to every scene empty - the genuinely-
 * optional-key read (`GameState.sceneLedger`'s own doc comment): a fixture,
 * bot or pre-existing save that never recorded a delivery reads exactly as a
 * shop that has delivered nothing anywhere yet.
 */
export function sceneLedgerFor(state: GameState): SceneLedger {
  return state.sceneLedger ?? freshSceneLedger()
}

/**
 * The last `windowDays` days of matched deliveries to `scene`, read straight
 * off the permanent ledger rather than a second copy of the same history -
 * the future word-of-mouth draw reads this on top of a channel's own
 * authored weights; nothing shipped consumes it yet. `currentDay` is
 * inclusive, so a delivery made today always counts.
 */
export function recentSceneLedgerEntries(
  ledger: SceneLedger,
  scene: BuyerArchetype,
  currentDay: number,
  windowDays: number,
): readonly SceneLedgerEntry[] {
  return ledger[scene].filter((entry) => entry.day > currentDay - windowDays)
}

const STAGE_ORDER = SceneStandingStageSchema.options

function stageIndex(stage: SceneStandingStage): number {
  return STAGE_ORDER.indexOf(stage)
}

/** The higher of two stages on the ladder - standing only ever climbs. */
function higherStage(a: SceneStandingStage, b: SceneStandingStage): SceneStandingStage {
  return stageIndex(a) >= stageIndex(b) ? a : b
}

/**
 * The next scene-standing stage given the CURRENT stage and the scene's
 * whole delivery count AFTER this delivery is appended - deeds tallied and
 * compared against `economy.sceneStandingProgress`'s thresholds, because
 * everything is a tally underneath (docs/sprints/scene-standing-arc.md).
 * Monotonic (`higherStage`): a stage never regresses, so a quiet scene keeps
 * every stage it already earned.
 *
 * The Shop needs the scene ALREADY at (or newly reaching, on this same
 * delivery) Respected, on top of `deliveryPriceYen` clearing that fitment
 * class's marquee bar - `fitmentClass` is `undefined` only when the
 * delivered car's model cannot be resolved, in which case the marquee check
 * is skipped and the count-based stage still applies. Both conditions
 * reading off the SAME post-append count is deliberate: `respectedDeliveries`
 * can never be cleared by a single delivery, so a scene cannot vault from
 * `none` straight to The Shop in one sale regardless of price.
 */
function nextSceneStandingStage(
  currentStage: SceneStandingStage,
  totalDeliveries: number,
  deliveryPriceYen: number,
  fitmentClass: PartFitmentClass | undefined,
  economy: EconomyConfig,
): SceneStandingStage {
  const progress = economy.sceneStandingProgress
  let countStage: SceneStandingStage = 'none'
  if (totalDeliveries >= progress.respectedDeliveries) countStage = 'respected'
  else if (totalDeliveries >= progress.knownDeliveries) countStage = 'known'

  let stage = higherStage(currentStage, countStage)
  const marqueeBarYen = fitmentClass ? progress.marqueeBarYenByTier[fitmentClass] : undefined
  if (
    stageIndex(stage) >= stageIndex('respected') &&
    marqueeBarYen !== undefined &&
    deliveryPriceYen >= marqueeBarYen
  ) {
    stage = 'shop'
  }
  return stage
}

/** What one credited delivery carries - the same four fields
 * `SceneLedgerEntry` persists, plus the delivered car's fitment class (its
 * roster tier) for the marquee-bar check, `undefined` only when the model
 * cannot be resolved. */
export interface SceneDeliveryDetails {
  carInstanceId: string
  modelId: string
  priceYen: number
  day: number
  fitmentClass: PartFitmentClass | undefined
}

/**
 * The one hook every earn event calls (docs/sprints/scene-standing-arc.md
 * step 4): a matched walk-in sale (`resolveSellViaWalkIn`, selling.ts) or a
 * delivered story mission (`resolveDeliverMission`, missions.ts) crediting
 * `scene`, always the buyer's or persona's own archetype - there is no tag
 * for either caller to disagree with. Appends the permanent shop-ledger
 * entry (never pruned - standing never decays, so neither does the record
 * of how it was earned) and advances that scene's stage from the resulting
 * deed count. Every other scene's ledger and stage are untouched.
 */
export function creditSceneDelivery(
  state: GameState,
  scene: BuyerArchetype,
  details: SceneDeliveryDetails,
  economy: EconomyConfig,
): GameState {
  const ledger = sceneLedgerFor(state)
  const entry: SceneLedgerEntry = {
    carInstanceId: details.carInstanceId,
    modelId: details.modelId,
    priceYen: details.priceYen,
    day: details.day,
  }
  const entriesForScene = [...ledger[scene], entry]
  const sceneLedger: SceneLedger = { ...ledger, [scene]: entriesForScene }
  const nextStage = nextSceneStandingStage(
    state.sceneStanding[scene],
    entriesForScene.length,
    details.priceYen,
    details.fitmentClass,
    economy,
  )
  return {
    ...state,
    sceneLedger,
    sceneStanding: { ...state.sceneStanding, [scene]: nextStage },
  }
}
