import {
  BuyerArchetypeSchema,
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

const BUYER_ARCHETYPES = BuyerArchetypeSchema.options

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
 * compared against `economy.sceneStandingProgress`'s thresholds for THIS
 * scene, because everything is a tally underneath
 * (docs/sprints/sprint_archive/scene-standing-arc.md) and a scene the market rarely matches
 * asks for fewer deliveries than one it matches easily, so the same rung
 * costs comparable WORK everywhere (sprint186.md). Monotonic
 * (`higherStage`): a stage never regresses, so a quiet scene keeps every
 * stage it already earned.
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
  scene: BuyerArchetype,
  currentStage: SceneStandingStage,
  totalDeliveries: number,
  deliveryPriceYen: number,
  fitmentClass: PartFitmentClass | undefined,
  economy: EconomyConfig,
): SceneStandingStage {
  const progress = economy.sceneStandingProgress
  let countStage: SceneStandingStage = 'none'
  if (totalDeliveries >= progress.respectedDeliveries[scene]) countStage = 'respected'
  else if (totalDeliveries >= progress.knownDeliveries[scene]) countStage = 'known'

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
 * The one hook every earn event calls (docs/sprints/sprint_archive/scene-standing-arc.md
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
    scene,
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

/**
 * Word of mouth's rolling-window term (docs/sprints/sprint_archive/scene-standing-arc.md
 * step 5): how much of the last `rollingWindowDays`' worth of matched
 * deliveries, across every scene, went to THIS one. A scene worked
 * exclusively over the window reaches `rollingWindowShareCap`; a scene
 * untouched in the window reads a flat 1 (no bonus, never a penalty) - this
 * is what lets pivoting scenes move the draw within days rather than
 * requiring a second climb. Linear in recent share: `1 + share * (cap - 1)`.
 */
function recentDeliveryShareMultiplier(
  scene: BuyerArchetype,
  ledger: SceneLedger,
  currentDay: number,
  economy: EconomyConfig,
): number {
  const { rollingWindowDays, rollingWindowShareCap } = economy.sceneStandingProgress
  const recentCountFor = (s: BuyerArchetype): number =>
    recentSceneLedgerEntries(ledger, s, currentDay, rollingWindowDays).length
  const totalRecent = BUYER_ARCHETYPES.reduce((sum, s) => sum + recentCountFor(s), 0)
  if (totalRecent === 0) return 1
  const share = recentCountFor(scene) / totalRecent
  return 1 + share * (rollingWindowShareCap - 1)
}

/**
 * Word of mouth itself (the Known payload, docs/sprints/sprint_archive/scene-standing-arc.md
 * step 5): how much more of `scene` turns up across every one of the
 * player's channels right now. A flat 1 (no change at all) below Known;
 * from Known on, that stage's own multiplier
 * (`economy.sceneStandingProgress.wordOfMouthMultiplierByStage`) is further
 * scaled by `recentDeliveryShareMultiplier` above. Applied MULTIPLICATIVELY
 * on a channel's own authored `buyerPoolWeights` wherever this is read
 * (`saleCandidates`, sim/selling.ts) - never additive, so a channel that
 * barely carries a scene still barely carries it, only more than before.
 */
export function wordOfMouthMultiplierFor(
  scene: BuyerArchetype,
  state: GameState,
  economy: EconomyConfig,
): number {
  const stage = state.sceneStanding[scene]
  if (stage === 'none') return 1
  const stageMultiplier = economy.sceneStandingProgress.wordOfMouthMultiplierByStage[stage]
  return (
    stageMultiplier *
    recentDeliveryShareMultiplier(scene, sceneLedgerFor(state), state.day, economy)
  )
}

/**
 * Every scene's word-of-mouth multiplier at once
 * (`wordOfMouthMultiplierFor` above) - computed once per day's offer draw
 * (`drawDailyOffers`, sim/selling.ts) rather than once per for-sale car,
 * since nothing it reads changes within that pass.
 */
export function wordOfMouthMultipliers(
  state: GameState,
  economy: EconomyConfig,
): Readonly<Record<BuyerArchetype, number>> {
  const result = {} as Record<BuyerArchetype, number>
  for (const scene of BUYER_ARCHETYPES) {
    result[scene] = wordOfMouthMultiplierFor(scene, state, economy)
  }
  return result
}
