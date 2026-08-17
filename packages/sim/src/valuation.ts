import {
  FRESH_SCENE_STANDING,
  type Buyer,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type Part,
  type PowerExpectationChain,
  type SceneStanding,
  type SceneStandingStage,
  type StatKey,
} from '@midnight-garage/content'
import { computeDerivedStats } from './derivedStats'
import { marketValueYen } from './marketValue'

const STAT_KEYS = ['power', 'handling', 'style', 'reliability', 'authenticity'] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Stage C's per-buyer tolerance (the tolerance ruling, sprint144.md): reads
 * `economy.valuation.tolerance` for this buyer's own archetype, falling back
 * to `default` for the archetypes the design leaves unnamed (collector,
 * racer, daily-drivers). Only `valuateCarForBuyer` and
 * `valuateCarForBuyerViaChannel` call this - every other `marketValueYen`
 * caller is buyer-agnostic and uses the function's own default of 1.0.
 *
 * Every named branch here must have a matching key in
 * `economy.valuation.tolerance` (`EconomyConfigSchema`'s own `.strict()`
 * tolerance object) - a renamed archetype whose branch string and JSON key
 * drift apart falls through to `default` with no error anywhere, which is
 * exactly the wrong answer for a scene like the Show Crowd, built to ignore
 * the coherence discount entirely. `coherenceValuation.test.ts`'s
 * authored-value guard iterates every archetype and asserts none resolves to
 * `default` by accident.
 */
function coherenceToleranceFor(buyer: Buyer, economy: EconomyConfig): number {
  const { tolerance } = economy.valuation
  if (buyer.archetype === 'show-crowd' && tolerance['show-crowd'] !== undefined) {
    return tolerance['show-crowd']
  }
  if (buyer.archetype === 'tuner' && tolerance.tuner !== undefined) return tolerance.tuner
  if (buyer.archetype === 'touge' && tolerance.touge !== undefined) return tolerance.touge
  return tolerance.default
}

/**
 * A car's power on the [0, 1] scale the other four derived stats reach by
 * dividing by 100: PS against `statFormulas.powerNormalizationCeiling`. The one
 * expression of that normalisation, for everything that needs power on the same
 * footing as a stat. Uncapped, so a car past the ceiling scores past 1 rather
 * than being flattened onto it.
 */
export function normalizedPowerScore(powerPs: number, economy: EconomyConfig): number {
  return powerPs / economy.statFormulas.powerNormalizationCeiling
}

/**
 * The climbing chain's own derived figure (docs/sprints/sprint_archive/scene-standing-arc.md
 * step 0): how many PS below the player's own best-ever delivered power the
 * top of the market currently sits, given `GameState.powerExpectationChain`.
 * `undefined` before anyone has ever delivered a car - there is no "top of
 * the market" yet to close on. Deliberately separate from
 * `normalizedPowerScore` above: that function is what every buyer's
 * ORDINARY appetite reads, this is what governs only the moving figure at
 * the top, and nothing in shipped content reads this yet
 * (`advancePowerExpectationChain`, sim/selling.ts, is the only writer).
 */
export function currentPowerExpectationBarPs(
  chain: PowerExpectationChain | undefined,
  economy: EconomyConfig,
): number | undefined {
  if (!chain) return undefined
  const steps = economy.statFormulas.powerExpectationChainStepDiscounts
  const stepIndex = Math.min(chain.climbedSteps, steps.length - 1)
  const discount = steps[stepIndex] ?? 0
  return chain.bestPowerPs * (1 - discount)
}

/** A car's five taste stats, already normalized to the same [0, 1] footing
 * `Buyer.statTargets` is authored on - `normalizedPowerScore` for power,
 * `/ 100` for the other four. What `tasteMatchFor` below scores a buyer
 * against. */
type StatScoreByKey = Record<(typeof STAT_KEYS)[number], number>

/** The buyer's own verdict on the car they were handed, and the whole of what
 * a sale pays reputation for (`saleOutcomeFor` below). */
export type SaleOutcome = 'satisfied' | 'delighted' | 'nothing'

/**
 * The Stage E match formula in isolation (sale-value-system.md S3 Stage E,
 * amended sprint146.md), pure over an already-normalized score vector: a
 * match, not a mean (sprint146.md). Each stat carries a `target` - clearing
 * it earns full marks on that stat, exceeding it earns nothing more - and
 * an optional `upper`, past which the car starts actively costing the
 * buyer marks instead.
 *
 * Each shortfall is normalized by the room it had to fall short in, not
 * carried as an absolute gap: `low` divides by `target` itself, `high` by
 * the remaining room above `upper`. The amendment this replaces measured
 * `shortfall = max(0, target - score) + max(0, score - upper)` directly in
 * score units, which caps the low shortfall at `target` - a buyer with a
 * modest target could never be badly disappointed, so a car clearing
 * NOTHING still scored a match well above 0 (0.30 to 0.50 across the six
 * shipped archetypes) and read as free money through the walk-in channel's
 * value-weighted buyer draw (`valueModelProbes.test.ts`'s instant-flip
 * guard). Normalizing by the room available makes missing a target
 * entirely cost that stat's full importance, so a car satisfying nothing
 * scores exactly 0 against every buyer - the design's other half, that a
 * specialised car is also somebody's WRONG car.
 *
 * Split out from `normalizedTasteScore` below so the formula itself is
 * directly testable against a buyer's real authored targets without
 * needing a car whose derived stats happen to land on a particular number:
 * the floor test that caught the instant-flip defect scores a hypothetical
 * car that clears nothing on any stat, which only a raw score vector of
 * zeros can express exactly.
 */
export function tasteMatchFor(targets: Buyer['statTargets'], scoreByStat: StatScoreByKey): number {
  let weightedShortfall = 0
  let totalImportance = 0
  for (const key of STAT_KEYS) {
    const { target, upper, importance } = targets[key]
    const score = scoreByStat[key]
    // A target of 0 means the buyer does not care about this stat at all,
    // so it can never contribute a shortfall; an upper of exactly 1 can
    // never be exceeded (only power is uncapped, and no shipped archetype
    // sets a power upper at 1). Both guard the same division by zero.
    const lowShortfall = target > 0 ? Math.max(0, target - score) / target : 0
    const highShortfall =
      upper !== undefined && upper < 1 ? Math.max(0, score - upper) / (1 - upper) : 0
    const shortfall = clamp(lowShortfall + highShortfall, 0, 1)
    weightedShortfall += importance * shortfall
    totalImportance += importance
  }

  if (totalImportance <= 0) return 1
  return clamp(1 - weightedShortfall / totalImportance, 0, 1)
}

/**
 * The single stat this buyer cares about MOST - the highest `importance` in
 * `Buyer.statTargets` - the stat they are known for: authenticity for the
 * Collector, reliability for Daily Drivers, style for the Show Crowd, power
 * for the Racer and the Tuner, handling for Touge. Read by both the champion
 * gate below and `sceneCommissions.ts`'s commission generator, so a
 * commission and the gate can never ask different questions of the same
 * buyer. Ties resolve to the first stat in `STAT_KEYS`; no shipped archetype
 * currently ties for its own highest importance.
 */
export function championStatFor(buyer: Buyer): StatKey {
  return STAT_KEYS.reduce((best, key) =>
    buyer.statTargets[key].importance > buyer.statTargets[best].importance ? key : best,
  )
}

/**
 * This buyer's affinity for `model.spec.culture` (Stage E v5 amendment,
 * sale-value-system.md; authored in `docs/design/buyer-culture-affinity.csv`).
 * Every buyer names all thirteen `CarCulture` values with no default
 * (`BuyerSchema.culturePreferences`), so this always resolves to an authored
 * number for valid content - the fallback of 1 (culture-blind) only guards
 * against content that has not been validated.
 */
export function cultureAffinityFor(buyer: Buyer, model: CarModel): number {
  return buyer.culturePreferences.find((pref) => pref.culture === model.spec.culture)?.weight ?? 1
}

/**
 * This car's five taste stats on the [0, 1] footing `Buyer.statTargets` is
 * authored on - `normalizedPowerScore` for power, `/ 100` for the other four.
 * The one place that normalisation happens, shared by the taste score below
 * and by `saleOutcomeFor`, so a buyer's verdict on a car and the price they
 * pay for it can never be computed from two different score vectors.
 */
function normalizedStatScores(
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): StatScoreByKey {
  const stats = computeDerivedStats(model, instance, partsById, partsTaxonomy, economy)
  return {
    power: normalizedPowerScore(stats.power, economy),
    handling: stats.handling / 100,
    style: stats.style / 100,
    reliability: stats.reliability / 100,
    authenticity: stats.authenticity / 100,
  }
}

/**
 * What the person who bought this car got out of it (progression bible, fifth
 * amendment): `satisfied` when the buyer's champion stat cleared its target,
 * `delighted` when EVERY stat they care about did, `nothing` otherwise. The
 * whole of what reputation now reads at a sale.
 *
 * Satisfied deliberately asks exactly the question the champion gate inside
 * `normalizedTasteScore` already asks - the stat this buyer is known for,
 * `championStatFor` - so the sale that pleases a buyer and the sale that
 * qualifies for their taste band are testing the same fact rather than two
 * definitions of "good enough" that can drift apart.
 *
 * A stat at importance 0 is one the buyer never asked about, so it can never
 * hold a sale back: selling a rough-engined show car to the Show Crowd is
 * honest work and reads `delighted` when their style target is met, while the
 * same car sold to a Daily Driver reads `nothing`, because reliability is the
 * only thing they came for. Culture affinity is deliberately NOT read here:
 * it prices who turns up and what they pay, not whether the person standing
 * in front of the car got what they wanted.
 */
export function saleOutcomeFor(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): SaleOutcome {
  const scoreByStat = normalizedStatScores(model, instance, partsById, partsTaxonomy, economy)
  const meetsTarget = (key: StatKey): boolean => scoreByStat[key] >= buyer.statTargets[key].target
  /**
   * Within the band, not merely above its floor. `upper` is the point past
   * which a buyer starts actively losing interest (`tasteMatchFor` charges a
   * shortfall for overshooting it), so a car that has blown through it has not
   * given that buyer what they wanted however far it cleared the target. Daily
   * Drivers and Touge both author a power `upper`, and without this a 400 PS
   * commuter reads as the ideal daily driver.
   */
  const isRight = (key: StatKey): boolean => {
    const { upper } = buyer.statTargets[key]
    return meetsTarget(key) && (upper === undefined || scoreByStat[key] <= upper)
  }
  /**
   * The champion gate asks only whether they got the thing they came for, so it
   * reads the target alone: a buyer is still SATISFIED by a car that overdoes
   * their signature stat. Being DELIGHTED is the stricter claim, and that is
   * where overshooting counts against the car.
   */
  if (!meetsTarget(championStatFor(buyer))) return 'nothing'
  const wanted = STAT_KEYS.filter((key) => buyer.statTargets[key].importance > 0)
  return wanted.every(isRight) ? 'delighted' : 'satisfied'
}

/**
 * How well this car satisfies a buyer archetype's taste, normalized to
 * [0, 1]. The shared input every taste band below maps onto its own range -
 * stats never touch `marketValueYen` itself, only who pays a bit more.
 *
 * Two things wrap the plain `tasteMatchFor` average (Stage E v5 amendment):
 * the champion gate zeroes the whole match when the buyer's own signature
 * stat falls short of its target, whatever else the car scores, and culture
 * then multiplies what is left. A weighted average alone can never
 * disqualify anything - every buyer has stats it does not care about, which
 * a clean stock car clears for free - so the gate is what lets a buyer
 * refuse a car outright, and culture is what makes an otherwise-qualifying
 * car still the wrong one for this buyer's own scene.
 */
export function normalizedTasteScore(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  const scoreByStat = normalizedStatScores(model, instance, partsById, partsTaxonomy, economy)
  const champion = championStatFor(buyer)
  if (scoreByStat[champion] < buyer.statTargets[champion].target) return 0
  const match = tasteMatchFor(buyer.statTargets, scoreByStat)
  return match * cultureAffinityFor(buyer, model)
}

/**
 * Whether this buyer's want is genuinely met by this car - MATCHED,
 * tested on the underlying [0, 1] taste score rather than on any priced
 * multiplier. This is deliberate: `economy.valuation.matchedTasteScoreThreshold`
 * is the score that prices at exactly 1.0 under the standard, no-standing
 * band, so a sale is MATCHED by the same yardstick at every scene-standing
 * stage. Testing the price instead (the old `channelBuyerTaste(...) >= 1`
 * definition) drifted as standing rose - a raised floor lowers the score a
 * mismatched car needs to clear the ceiling, which quietly made MATCHED
 * easier to earn the more of it a scene already had. Buyer/car-only, so it
 * never reads a channel or a scene's own standing: what a buyer wants does
 * not depend on where the car is advertised. Governs the `matchedOnly`
 * channel gate and the scene-standing delivery credit alike (`selling.ts`).
 * Reputation is a separate, stricter-in-one-direction question and reads
 * `saleOutcomeFor` above, never this.
 */
export function isTasteMatched(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): boolean {
  const score = normalizedTasteScore(buyer, model, instance, partsById, partsTaxonomy, economy)
  return score >= economy.valuation.matchedTasteScoreThreshold
}

/**
 * Sprint213.md item 1 (the sale-reconciliation defect fix): the shared,
 * two-segment affinity curve both `tasteMultiplier` and
 * `channelTasteMultiplier` build their own `[floor, ceiling]` bands from. The
 * old single straight line priced ANY score below 1.0 strictly under
 * `ceiling`, so even a buyer who genuinely cleared `matchedTasteScoreThreshold`
 * still paid a real discount - stacked again by the offer-quality draw
 * (`selling.ts`'s `qualityMeanFor`), the defect this sprint fixes. This curve
 * front-loads the climb instead: below `threshold` it rises steeply from
 * `floor` to `nearPar` (`floor + (ceiling - floor) * nearParFraction`) - a
 * genuine mismatch is discounted hard - and from `threshold` to a score of 1
 * it climbs the REMAINING distance to `ceiling` - so a buyer who merely
 * clears "matched" already prices close to par, and only real excellence (or
 * a channel/scene premium above 1) earns the rest of the range. Continuous
 * and monotonic in `score` by construction (both segments run the same
 * direction, and they meet exactly at `nearPar` when `score === threshold`).
 */
function affinityMultiplier(
  score: number,
  floor: number,
  ceiling: number,
  threshold: number,
  nearParFraction: number,
): number {
  const nearPar = floor + (ceiling - floor) * nearParFraction
  if (score >= threshold) {
    if (threshold >= 1) return ceiling
    return nearPar + (ceiling - nearPar) * ((score - threshold) / (1 - threshold))
  }
  if (threshold <= 0) return nearPar
  return floor + (nearPar - floor) * (score / threshold)
}

/**
 * Bounded taste multiplier: how well a buyer archetype's stat weights fit
 * this car's derived stats, over `[1 - tasteSpread, 1 + tasteSpread]`
 * (economy.json's `tasteSpread` of 0.12 bounds it to [0.88, 1.12]) through the
 * shared `affinityMultiplier` curve above. Stats stop being the value
 * pipeline (`marketValueYen` is stat-blind), but they still decide who pays a
 * bit more, never whether the car is worth anything.
 */
function tasteMultiplier(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  const score = normalizedTasteScore(buyer, model, instance, partsById, partsTaxonomy, economy)
  const { tasteSpread, matchedTasteScoreThreshold, affinityNearParFraction } = economy.valuation
  return affinityMultiplier(
    score,
    1 - tasteSpread,
    1 + tasteSpread,
    matchedTasteScoreThreshold,
    affinityNearParFraction,
  )
}

/** A fresh shop's scene standing: every scene at `none`, before anything is
 * threaded in from a save. Mirrors `freshToolTiers` (toolLines.ts) for
 * `createInitialGameState`'s call-site style, reading the one content-side
 * default rather than a second copy of the same six-scene shape. */
export function freshSceneStanding(): SceneStanding {
  return FRESH_SCENE_STANDING
}

/**
 * This buyer's own scene, read from the shop's per-scene standing record -
 * `'none'` when `sceneStanding` itself is absent, so every caller that
 * never threads a save's standing through (bidding, and most of the plain
 * `valuateCarForBuyer` callers) prices exactly as it did before this
 * mechanism existed.
 */
function sceneStandingStageFor(
  buyer: Buyer,
  sceneStanding: SceneStanding | undefined,
): SceneStandingStage {
  return sceneStanding?.[buyer.archetype] ?? 'none'
}

/**
 * What this buyer's scene standing contributes to the channel band right
 * now: the floor to price from instead of the standard `1 - tasteSpread`,
 * and a ceiling to compete against the channel's own - `undefined` at
 * `none`, which is the absence of standing rather than a band, and at any
 * authored stage that names no ceiling of its own.
 */
function sceneStandingBandFor(
  buyer: Buyer,
  sceneStanding: SceneStanding | undefined,
  economy: EconomyConfig,
): { floor: number; ceiling: number | undefined } {
  const stage = sceneStandingStageFor(buyer, sceneStanding)
  if (stage === 'none') return { floor: 1 - economy.valuation.tasteSpread, ceiling: undefined }
  const band = economy.valuation.sceneStanding[stage]
  return { floor: band.floor, ceiling: band.ceiling }
}

/**
 * The listing-channel taste band a selling channel realises: `ceiling` is
 * that channel's own `sellingChannels[*].tasteCeiling`. The low end is
 * `1 - tasteSpread`, every channel's honest floor, UNLESS this buyer's own
 * scene standing (`sceneStanding`, absent = every scene at `none`) raises
 * it - `docs/sprints/sprint_archive/scene-standing-arc.md`'s per-scene band, applied here
 * because this is the one place a taste band is built. A scene's own
 * ceiling (from `known` on) competes against the channel's rather than
 * adding to it (`Math.max` - stacking would compound: a respected scene in
 * the magazine would otherwise reach past both ceilings combined). Once the
 * effective ceiling is settled, the shape is unchanged: it either CLAMPS
 * the standard `[1-spread, 1+spread]` band (an effective ceiling at or below
 * `1 + spread`) or REPLACES it (above `1 + spread`), so a matched buyer
 * through a wide-open channel or a well-standing scene can pay a real
 * premium the standard band never reaches. Same `normalizedTasteScore`
 * either way - the channel and the scene only change which range that score
 * lands in.
 */
function channelTasteMultiplier(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
  ceiling: number,
  sceneStanding: SceneStanding | undefined,
): number {
  const score = normalizedTasteScore(buyer, model, instance, partsById, partsTaxonomy, economy)
  const scene = sceneStandingBandFor(buyer, sceneStanding, economy)
  const low = scene.floor
  const { tasteSpread, matchedTasteScoreThreshold, affinityNearParFraction } = economy.valuation
  const normalTop = 1 + tasteSpread
  const effectiveCeiling = scene.ceiling !== undefined ? Math.max(ceiling, scene.ceiling) : ceiling
  if (effectiveCeiling > normalTop) {
    return affinityMultiplier(
      score,
      low,
      effectiveCeiling,
      matchedTasteScoreThreshold,
      affinityNearParFraction,
    )
  }
  return Math.min(
    affinityMultiplier(score, low, normalTop, matchedTasteScoreThreshold, affinityNearParFraction),
    effectiveCeiling,
  )
}

/**
 * What a buyer archetype would pay for a car (GDD 6.3), shared by bidding
 * (as an AI competitor's true value) and selling (as an offer). Stays pure
 * and deterministic - no RNG, no side effects. Computed as `marketValue x
 * taste`, where `marketValueYen` (marketValue.ts) is the taste-free "what is
 * this car worth" answer shared by every price in the game (condition,
 * installed parts, market heat), and `tasteMultiplier` above is the only
 * place stat fit still matters, bounded so it can only nudge the price.
 */
export function valuateCarForBuyer(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
): number {
  const value = marketValueYen(
    model,
    instance,
    heatPercent,
    partsById,
    partsTaxonomyById,
    economy,
    coherenceToleranceFor(buyer, economy),
  )
  const taste = tasteMultiplier(buyer, model, instance, partsById, partsTaxonomy, economy)
  return Math.round(Math.max(0, value * taste))
}

/**
 * A buyer's taste multiplier for a car AS ONE LISTING CHANNEL WOULD REALISE
 * IT - `channelTasteMultiplier`'s clamp/extend band, exported so
 * `selling.ts` can both price a channel offer with it and (via `valuation.
 * isTasteMatched` for the actual MATCHED test) read the same buyer/car pair
 * for the mismatch gate and the matched-sale reputation bonus. `sceneStanding`
 * is this PLAYER'S shop's own standing (absent = every scene at `none`,
 * today's behaviour) - never pass a save's standing into a caller that is
 * pricing what a rival pays, only into a caller pricing what the player is
 * offered.
 */
export function channelBuyerTaste(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
  tasteCeiling: number,
  sceneStanding?: SceneStanding,
): number {
  return channelTasteMultiplier(
    buyer,
    model,
    instance,
    partsById,
    partsTaxonomy,
    economy,
    tasteCeiling,
    sceneStanding,
  )
}

/**
 * `valuateCarForBuyer`, but pricing the taste term through one listing
 * channel's own band (`channelBuyerTaste`) instead of the standard
 * `[1-spread, 1+spread]` one - the channel-aware twin every
 * `drawDailyOffers` channel path prices its offer through. `sceneStanding`
 * carries the same player-only caveat `channelBuyerTaste` above documents.
 */
export function valuateCarForBuyerViaChannel(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
  tasteCeiling: number,
  sceneStanding?: SceneStanding,
): number {
  const value = marketValueYen(
    model,
    instance,
    heatPercent,
    partsById,
    partsTaxonomyById,
    economy,
    coherenceToleranceFor(buyer, economy),
  )
  const taste = channelBuyerTaste(
    buyer,
    model,
    instance,
    partsById,
    partsTaxonomy,
    economy,
    tasteCeiling,
    sceneStanding,
  )
  return Math.round(Math.max(0, value * taste))
}
