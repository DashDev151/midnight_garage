import type {
  Buyer,
  CarInstance,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  EconomyConfig,
  Part,
  PowerExpectationChain,
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
 * The climbing chain's own derived figure (docs/sprints/scene-standing-arc.md
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
 * How well this car satisfies a buyer archetype's taste, normalized to
 * [0, 1] via `tasteMatchFor` above. The shared input every taste band below
 * maps onto its own range - stats never touch `marketValueYen` itself, only
 * who pays a bit more.
 */
function normalizedTasteScore(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  const stats = computeDerivedStats(model, instance, partsById, partsTaxonomy, economy)
  const scoreByStat: StatScoreByKey = {
    power: normalizedPowerScore(stats.power, economy),
    handling: stats.handling / 100,
    style: stats.style / 100,
    reliability: stats.reliability / 100,
    authenticity: stats.authenticity / 100,
  }
  return tasteMatchFor(buyer.statTargets, scoreByStat)
}

/**
 * Bounded taste multiplier: how well a buyer archetype's stat weights fit
 * this car's derived stats, `[1 - tasteSpread, 1 + tasteSpread]`
 * (economy.json's first-pass `tasteSpread` of 0.12 bounds it to [0.88, 1.12],
 * centered near 1.0 for an average car). Stats stop being the value pipeline
 * (`marketValueYen` is stat-blind), but they still decide who pays a bit more,
 * never whether the car is worth anything.
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
  const spread = economy.valuation.tasteSpread
  return 1 - spread + 2 * spread * score
}

/**
 * The listing-channel taste band a selling channel realises: `ceiling` is
 * that channel's own `sellingChannels[*].tasteCeiling`. The low
 * end never moves (`1 - tasteSpread`, every channel's honest floor); the top
 * end either CLAMPS the standard `[1-spread, 1+spread]` band (a ceiling at or
 * below `1 + spread` - the shop front, the free ads paper) or REPLACES it (a
 * ceiling above `1 + spread` - the tuner magazine, the weekend meet), so a
 * matched buyer through one of those two can pay a real premium the standard
 * band never reaches. Same `normalizedTasteScore` either way - the channel
 * only changes which range that score lands in.
 */
function channelTasteMultiplier(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
  ceiling: number,
): number {
  const score = normalizedTasteScore(buyer, model, instance, partsById, partsTaxonomy, economy)
  const spread = economy.valuation.tasteSpread
  const low = 1 - spread
  const normalTop = 1 + spread
  if (ceiling > normalTop) {
    return low + (ceiling - low) * score
  }
  return Math.min(low + (normalTop - low) * score, ceiling)
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
 * `selling.ts` can both price a channel offer with it and read the same
 * number back to decide MATCHED (`>= 1.0` - the buyer's visible want is met)
 * everywhere that definition is needed: the tuner magazine/weekend meet
 * mismatch gate, and the matched-sale reputation bonus at accept time.
 */
export function channelBuyerTaste(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
  tasteCeiling: number,
): number {
  return channelTasteMultiplier(
    buyer,
    model,
    instance,
    partsById,
    partsTaxonomy,
    economy,
    tasteCeiling,
  )
}

/**
 * `valuateCarForBuyer`, but pricing the taste term through one listing
 * channel's own band (`channelBuyerTaste`) instead of the standard
 * `[1-spread, 1+spread]` one - the channel-aware twin every
 * `drawDailyOffers` channel path prices its offer through.
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
  )
  return Math.round(Math.max(0, value * taste))
}
