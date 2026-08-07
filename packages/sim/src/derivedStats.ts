import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  PhysicalDialSchema,
  type CarInstance,
  type CarModel,
  type CarPartTaxonomyEntry,
  type ConditionBand,
  type EconomyConfig,
  type EngineCharacter,
  type Part,
  type PhysicalDial,
  type StatBlock,
} from '@midnight-garage/content'
import { bandFactor, hasForcedInduction, isPartMissing, isPartPresent } from './bands'
import { panelsAreAllStock, zonePanelMassFactor, zonePanelStylePoints } from './bodyPipeline'
import {
  balanceOf,
  effectiveCompound,
  effectiveDownforce,
  effectiveGrip,
  gripToDisplay,
  STOCK_BUILD_FACTORS,
  type BuildFactors,
  type ConditionFactors,
} from './performance'
import {
  appliedOperationsOf,
  machiningAuthenticityCostOf,
  machiningHandlingFractionOf,
  machiningOperationCountOf,
  machiningPowerFractionOf,
  machiningReliabilityConditionBonusOf,
  machiningStylePointsOf,
} from './machining'
import { supportVerdict, totalGainFractionOf, usableGripFraction } from './support'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

type StatKey = 'power' | 'handling' | 'style' | 'reliability' | 'authenticity'

/**
 * How well one quantity is served by the car's real parts - a weighted mean of
 * a band curve across every taxonomy part that carries a weight for it,
 * weighted by that part's own weight. `weightOf` picks the weight column out of
 * a taxonomy entry and `factorOf` says what a band is worth on that column, so
 * the same traversal answers both an abstract stat and a physical dial rather
 * than either growing its own walker.
 *
 * Self-derives from `parts-taxonomy.json`'s own weights rather than a second,
 * hand-maintained list of "which parts feed power" - one source of truth
 * (content law), so a part's contribution can never drift out of sync between
 * the taxonomy and this formula. A legitimately-empty forced-induction slot
 * (NA car) simply drops out of `power`'s weighted mean. Returns 1 (as if every
 * contributing part were mint) when nothing on the car carries a weight at all,
 * so a quantity no part reaches never divides by zero.
 *
 * A MISSING part (`isPartMissing` - a real defect, not the legitimate
 * NA-forced-induction case) counts at a 0 band factor rather than
 * dropping out of the mean - a stripped exhaust really does hurt `power`,
 * not quietly vanish from the formula the way a car that never had a
 * turbo correctly does.
 */
function weightedBandFactor(
  car: CarInstance,
  model: CarModel,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  weightOf: (entry: CarPartTaxonomyEntry) => number,
  factorOf: (band: ConditionBand) => number,
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const entry of partsTaxonomy) {
    const weight = weightOf(entry)
    if (!weight) continue
    const installed = car.parts[entry.id].installed
    if (!isPartPresent(car, entry.id) && !isPartMissing(car, model, entry.id)) continue
    weightedSum += weight * (installed ? factorOf(installed.band) : 0)
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 1
}

/** `weightedBandFactor` over the taxonomy's `statWeights`, on the value-side
 * band curve - the condition input to every one of the five derived stats. */
function weightedBandFactorForStat(
  car: CarInstance,
  model: CarModel,
  stat: StatKey,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  return weightedBandFactor(
    car,
    model,
    partsTaxonomy,
    (entry) => entry.statWeights[stat],
    (band) => bandFactor(band, economy),
  )
}

/**
 * How much of the car is still the parts it left the factory with
 * (desirability-system.md section 3): `sum(weight_s * isStock(s)) /
 * sum(weight_s)` over every slot, weighted by the taxonomy's own
 * `statWeights.authenticity` column. 1 for a car nothing has been swapped
 * on, 0 for one where every weight-carrying slot is aftermarket.
 *
 * `isStock` is the fitted SKU's `grade === 'stock'` and nothing else - a
 * part's grade already answers "is this the original", so no second per-part
 * field is involved. **An EMPTY slot counts as NOT stock**: a missing part is
 * not an original part, and a car with its wheels gone is not more authentic
 * for it. A slot the catalogue cannot resolve counts as not stock for the
 * same reason - an unknown SKU is not evidence of originality.
 *
 * **`bodywork` is the one exception**, on a car that has a `zoneState` (the
 * zone model - see `bodyPipeline.ts`): every non-stock panel SKU is
 * zone-scoped and can never reach `car.parts.bodywork.installed.partId` (the
 * whole-car carrier slot only ever accepts a stock SKU, `partFitsCar`
 * refuses the rest), so that field can never answer "is this stock" for a
 * zone-model car. `panelsAreAllStock` reads the zones directly instead -
 * worst-governs, the same rule `deriveBodyworkBand` already uses for the
 * carrier's condition: any single aftermarket panel drops the WHOLE slot's
 * contribution to zero, same as an aftermarket carrier SKU would on every
 * other slot.
 *
 * **Damage does not enter this.** A dented original wing is still the wing the
 * car left the factory with: damaged, not replaced. An all-original car that
 * has been kicked about reads perfectly authentic and poor on condition, which
 * is exactly how the trade talks about one. Its damage is already charged
 * twice over elsewhere, through style (bodywork and paint carry the style
 * condition weight between them) and through value (`marketValueYen` subtracts
 * the repair bill at a premium), so charging it here as well would be a third
 * penalty for one fact. Missing and aftermarket are the two things that make a
 * body less original, and both are handled above.
 *
 * The one slot that drops out of BOTH sums is a legitimately absent one (an
 * NA car's `forcedInduction`), exactly as it does in `weightedBandFactor`
 * above: a car that never had a turbo is not missing one. On such a car the
 * denominator is 97 rather than 100, so the remaining slots simply share the
 * whole scale out between them.
 *
 * Returns 1 (perfectly original) when no slot on the car carries authenticity
 * weight at all, mirroring `weightedBandFactor`'s own divide-by-zero guard.
 */
export function stocknessOf(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
): number {
  let stockWeight = 0
  let totalWeight = 0
  for (const entry of partsTaxonomy) {
    const weight = entry.statWeights.authenticity
    if (!weight) continue
    const installed = car.parts[entry.id].installed
    if (!installed && !isPartMissing(car, model, entry.id)) continue // legitimately absent
    totalWeight += weight
    if (entry.id === 'bodywork' && car.zoneState) {
      if (installed && panelsAreAllStock(car.zoneState)) stockWeight += weight
      continue
    }
    if (installed && partsById[installed.partId]?.grade === 'stock') stockWeight += weight
  }
  return totalWeight > 0 ? stockWeight / totalWeight : 1
}

/**
 * The machining term of the authenticity formula
 * (desirability-system.md section 3): the summed authenticity cost of every
 * machining operation applied to this car. The ratings are fractions of an
 * authenticity point, ordered so a deeper cut costs more originality than a
 * lighter one and sized so the whole catalogue applied to a single original
 * car still leaves it inside a collector's tolerance.
 *
 * **Charged on STOCK-grade parts only**, and never on a slot the catalogue
 * cannot resolve - `machiningAuthenticityCostOf` (machining.ts) is the whole of
 * that rule, shared with the machine shop's own quotes so a room and this sheet
 * can never price the same cut differently. Machining an original block costs
 * its operations' full ratings and leaves the slot's remaining originality
 * intact; machining a race block costs nothing, because that slot has nothing
 * left to lose.
 */
export function machiningCost(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  let cost = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    for (const operation of appliedOperationsOf(installed, economy)) {
      cost += machiningAuthenticityCostOf(operation, part)
    }
  }
  return cost
}

/**
 * The whole of authenticity (desirability-system.md section 3):
 *
 *     authenticity = round(clamp((100 * stockness - machiningCost) * conditionFactor, 0, 100))
 *
 * `conditionFactor` is `weightedBandFactorForStat` over the SAME authenticity
 * weights `stocknessOf` uses, so a slot weighted 0 leaves both terms at once.
 * That is intended and is what the zeros are for: nobody marks a car down for
 * new tyres, a fresh clutch or a recent radiator, so neither their grade nor
 * their condition should touch this number.
 *
 * **All stock, all mint and unmachined is exactly 100.** That is the
 * definition of the stat, not a calibration of it: both factors are exactly 1
 * there and the machining term is 0, so the identity holds by construction.
 *
 * Exported because the machining preview (`machiningJobs.ts`) needs the same
 * figure the radar chart shows, and must never derive its own.
 */
export function authenticityPercentOf(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  const stockness = stocknessOf(car, model, partsById, partsTaxonomy)
  const conditionFactor = weightedBandFactorForStat(
    car,
    model,
    'authenticity',
    partsTaxonomy,
    economy,
  )
  const raw = 100 * stockness - machiningCost(car, partsById, economy)
  return Math.round(clamp(raw * conditionFactor, 0, 100))
}

/**
 * The whole of style (desirability-system.md section 2):
 *
 *     fitted   = sum of statModifiers.style over installed parts
 *     reach    = min(1, fitted / styleSaturationPoints)
 *     styleRaw = styleBase + (styleCeiling - styleBase) * reach
 *     style    = round(clamp(styleRaw * conditionFactor, 0, 100))
 *
 * An aftermarket part does not ADD style, it CLOSES THE GAP between what the
 * car looks like stock and the best it could ever look. That is what lets one
 * kit be transformative on a car with sixty points of headroom and near
 * worthless on one with five, with no special case anywhere: the two cars are
 * simply different cars. A stock car reads exactly its own `styleBase`,
 * because `reach` is 0 there.
 *
 * Each part's points are scaled by its own band before they are summed, the
 * same way `buildFactors` scales a `physicalModifier`: a scrap bodykit is a
 * bad bodykit, and it buys less of the gap than a mint one. A slot's own
 * operation points (`machiningStylePointsOf`) join the fitted part's own
 * points before that same band scaling, so a show-fitment operation on a worn
 * wheel buys less than one on a mint wheel, exactly as the catalogue points
 * beside it already do.
 *
 * `conditionFactor` multiplies the WHOLE result, not just the base, so a
 * rough car does not look good however it is dressed and a poor-condition
 * maxed-out build always reads below a mint one.
 *
 * **`bodywork` is the one slot read off the car rather than off its carrier
 * SKU**, on a car that has a `zoneState` - the same exception `stocknessOf`
 * already makes for the same reason. Every non-stock panel SKU is zone-scoped
 * and reaches a car through `zoneState[zoneId].panelGrade`, never through
 * `car.parts.bodywork.installed.partId`, so the carrier's own SKU cannot answer
 * what the body looks like. `zonePanelStylePoints` (bodyPipeline.ts) answers
 * it from the nine zones instead, and the points still scale by the carrier's
 * own band, which is the worst of those same zones: sport body panels with a
 * bent wing among them are bent sport body panels.
 */
export function stylePercentOf(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  const { styleBase, styleCeiling } = model.spec
  let fitted = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue
    const zonePoints =
      partId === 'bodywork' && car.zoneState
        ? zonePanelStylePoints(car.zoneState, partsById, fitmentClassForTier(model.tier))
        : 0
    const carrierPoints = partId === 'bodywork' && car.zoneState ? 0 : part.statModifiers.style
    const points = carrierPoints + zonePoints + machiningStylePointsOf(installed, economy)
    fitted += points * bandFactor(installed.band, economy)
  }
  const reach = Math.min(1, fitted / economy.statFormulas.styleSaturationPoints)
  const raw = styleBase + (styleCeiling - styleBase) * reach
  const conditionFactor = weightedBandFactorForStat(car, model, 'style', partsTaxonomy, economy)
  return Math.round(clamp(raw * conditionFactor, 0, 100))
}

/**
 * The same traversal over the taxonomy's `physicalWeights`, on each dial's own
 * far gentler curve: how much grip, braking, driveline and downforce the car
 * still delivers from CONDITION ALONE - the flat, part-agnostic weighted mean
 * every car runs on regardless of what grade is fitted anywhere.
 *
 * This is not condition's only route into the performance model. `buildFactors`
 * below is the other one: an installed SKU's own `physicalModifiers`, scaled by
 * that SAME part's own band. Both apply, deliberately: a worn aftermarket
 * suspension or brake part loses both its share of this weighted-mean
 * baseline AND its own fitted advantage, each in proportion to how worn it
 * is. That is one condition value doing two different jobs on the same part
 * - the car's baseline physical state, and how much of THIS part's own
 * upgrade survives its own wear - not the same job charged twice. Engine
 * condition is absent by design - it reaches the model through the car's
 * current power instead.
 *
 * Every dial is exactly 1.0 for a car whose relevant parts are all mint, so a
 * car in good order runs on its measured figures untouched.
 */
export function physicalConditionFactors(
  car: CarInstance,
  model: CarModel,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): ConditionFactors {
  const curves = economy.statFormulas.condition.bandFactor
  const factors = {} as Record<PhysicalDial, number>
  for (const dial of PhysicalDialSchema.options) {
    factors[dial] = weightedBandFactor(
      car,
      model,
      partsTaxonomy,
      (entry) => entry.physicalWeights[dial],
      (band) => curves[dial][band],
    )
  }
  return factors
}

/**
 * What the grades a car is BUILT from deliver on each physical dial: the
 * product of every installed SKU's own `physicalModifiers`, each first scaled
 * by that part's own installed band. The counterpart of
 * `physicalConditionFactors` above, and the second half of the same idea - one
 * traversal of the car's slots per concern, each dial assembled exactly once.
 *
 * A `physicalModifier` is a multiplier around unity (1.029 is "2.9 per cent
 * better than stock"), so a worn part must deliver less of its advantage, not
 * less than stock: `effective = 1 + (modifier - 1) *
 * gradeBandFactor[grade][band]`. Every grade's curve is 1.0 at `mint`, so
 * `effective` equals the modifier exactly there and a mint build is unchanged
 * from the raw product. Below mint the modifier is pulled back toward 1.0 but
 * never past it, so a knackered part is a bad part, never an absent one (an
 * absent part is `scrapDisablesCar`/`isPartMissing`'s concern, not this one).
 * The same expression handles a sub-1 mass modifier without a second case:
 * `modifier - 1` is negative for a weight-saving part, so the factor pulls it
 * back toward 1.0 from below and a worn lightweight part never adds mass over
 * stock.
 *
 * The curve is keyed by the fitted SKU's own GRADE, which is what makes a race
 * damper at `poor` deliver less than a street damper at `mint`: a highly
 * strung part has given up more of its advantage at a given band than an
 * under-stressed one has. It is a curve shape rather than a rate, since
 * nothing here degrades with use. The `stock` row is the value-side band
 * curve exactly, so a car built from stock parts is untouched by the grade
 * split.
 *
 * The product is what makes a group figure the group's, not each member's: three
 * suspension SKUs at 1.029 apiece reach 1.090 fitted together and a car with one
 * of them fitted gets only that one's share.
 *
 * A slot the catalog cannot resolve contributes nothing rather than defaulting
 * to something, so an unknown part id can never silently move the physics.
 *
 * **`bodywork`'s MASS is read off the car's nine zones rather than off its
 * carrier SKU**, on a car that has a `zoneState` - the same exception
 * `stylePercentOf` above makes, for the same reason: every panel SKU is
 * zone-scoped and reaches a car through `zoneState[zoneId].panelGrade`, never
 * through `car.parts.bodywork.installed.partId`, so the carrier cannot answer
 * what the body is made of. `zonePanelMassFactor` (bodyPipeline.ts) answers it
 * from the nine, and the carrier's own band and (stock) grade still choose the
 * wear row, so a set of carbon panels on a battered shell delivers less of its
 * saving than the same set on a clean one.
 */
export function buildFactors(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): BuildFactors {
  const curves = economy.statFormulas.condition.gradeBandFactor
  const factors = { ...STOCK_BUILD_FACTORS }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue
    const modifiers = part.physicalModifiers
    const wear = curves[part.grade][installed.band]
    const mass =
      partId === 'bodywork' && car.zoneState
        ? zonePanelMassFactor(car.zoneState, partsById, part.fitmentClass)
        : modifiers.mass
    factors.grip *= 1 + (modifiers.grip - 1) * wear
    factors.braking *= 1 + (modifiers.braking - 1) * wear
    factors.mass *= 1 + (mass - 1) * wear
  }
  return factors
}

/** Everything the performance model needs to know about one car's parts: what
 * condition still delivers, and what the build delivers once the grip it
 * cannot use has been taken off it. */
export interface PhysicalFactors {
  condition: ConditionFactors
  build: BuildFactors
}

/**
 * The ONE assembly of a car's physical factors, and the only place the
 * chassis-support loss (`usableGripFraction`, support.ts) is ever applied.
 * `physicalConditionFactors` and `buildFactors` above each answer half of what
 * a car's parts do; this puts the two together and takes off the share of the
 * gain the fitted brakes, steering and chassis cannot put down.
 *
 * The loss lands on the build's own GRIP factor rather than on any readout,
 * because `effectiveGrip` is linear in that factor and both the handling stat
 * and the lap model corner on what it returns. So the number the player reads
 * and the number the car laps on are the same number, and they cannot be kept
 * in step by hand because they were never apart.
 *
 * Every caller that evaluates a real car goes through here - the derived
 * stats, the lap model, and the performance sandbox - so a build cannot reach
 * the physics with the loss missing.
 */
export function physicalFactorsFor(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): PhysicalFactors {
  const condition = physicalConditionFactors(car, model, partsTaxonomy, economy)
  const build = buildFactors(car, partsById, economy)
  const usable = usableGripFraction(car, model, partsById, economy, condition, build)
  return { condition, build: { ...build, grip: build.grip * usable } }
}

/**
 * The displacement a car's specific output is measured against: its literal
 * cc, with a rotary's scaled 1.8x (the equivalency factor motorsport bodies
 * use for exactly this comparison - a 13B is 1308cc by convention but
 * breathes like roughly 2.6 litres, and without the factor every rotary reads
 * as implausibly high-strung). `undefined` when the model carries no
 * displacement at all.
 *
 * Exported so the dyno's readout can SHOW the equivalency rather than have it
 * applied silently behind a figure the owner of an RX-7 would otherwise read
 * as wrong. It is the one place the factor and the rotary test live.
 */
export function effectiveDisplacementCcOf(model: CarModel): number | undefined {
  const { displacementCc, engineConfig } = model.spec
  if (displacementCc === undefined) return undefined
  const isRotary = engineConfig?.startsWith('rotary') ?? false
  return displacementCc * (isRotary ? 1.8 : 1.0)
}

/**
 * PS per litre of EFFECTIVE displacement (`effectiveDisplacementCcOf` above).
 * Exported because the dyno screen displays this figure directly and must not
 * recompute it.
 *
 * `displacementCc` is optional on `spec`; this returns `NaN` when it is
 * absent; `engineCharacterOf` below is the one caller in this codebase and
 * guards the absence itself rather than trusting this return value.
 */
export function specificOutputOf(model: CarModel): number {
  const effectiveDisplacementCc = effectiveDisplacementCcOf(model)
  if (effectiveDisplacementCc === undefined) return NaN
  return model.spec.stockPowerPs / (effectiveDisplacementCc / 1000)
}

/**
 * A car's engine response character, resolved once per car (never once per
 * part) and consumed by every installed SKU's `powerFraction` in the part
 * loop below. `hasForcedInduction` decides outright - a car with forced
 * induction is `forced` regardless of specific output. Otherwise the split
 * is `specificOutputOf` against
 * `economy.statFormulas.engineCharacter.naHighStrungThreshold`.
 *
 * Two content gaps are handled as absence, not thrown: `engineConfig`
 * missing reads as non-rotary (only relevant while forced induction is
 * false, since `hasForcedInduction` never reads it), and `displacementCc`
 * missing returns `lazy-na` outright, before a specific output is even
 * computed. Every shipped car carries `displacementCc`, so this fallback is
 * unreachable in shipped content - a test pins that rather than assuming it.
 */
export function engineCharacterOf(model: CarModel, economy: EconomyConfig): EngineCharacter {
  if (hasForcedInduction(model)) return 'forced'
  if (model.spec.displacementCc === undefined) return 'lazy-na'
  const specificOutput = specificOutputOf(model)
  return specificOutput >= economy.statFormulas.engineCharacter.naHighStrungThreshold
    ? 'high-strung-na'
    : 'lazy-na'
}

/**
 * One reliability-bearing part's own base ceiling, keyed to its band. Only
 * `scrap` and `poor` carry a real ceiling; every better band reads 1
 * (unconstrained), since the condition mean is already at or below 1 there
 * and a ceiling would do nothing.
 */
function reliabilityCeilingBaseFor(band: ConditionBand, economy: EconomyConfig): number {
  const { reliabilityCeiling } = economy.statFormulas.condition
  if (band === 'scrap') return reliabilityCeiling.scrap
  if (band === 'poor') return reliabilityCeiling.poor
  return 1
}

/**
 * The severity ceiling (lever 8, rebalanced): a cap on reliability's
 * condition mean, taken as the MINIMUM across every reliability-bearing
 * part on the car of that part's own band ceiling, softened by how much
 * reliability relevance the part actually carries: `cap = 1 - (1 -
 * reliabilityCeilingBaseFor(band)) * min(1, statWeights.reliability /
 * reliabilityCeilingWeightReference)`. A flat lookup on the worst band
 * alone throws away the magnitude - it used to cap a weight-1 propshaft
 * exactly as hard as weight-3 cooling; this keeps a light part's failure
 * from costing the car as much headroom as a heavy one's.
 *
 * A part carrying the taxonomy's own maximum reliability weight
 * (`reliabilityCeilingWeightReference`, cooling's 3) takes the ceiling's
 * full, unscaled bite. A MISSING part counts as `scrap`, matching
 * `weightedBandFactor`'s existing treatment of a missing part as a 0 band
 * factor; a legitimately absent slot (an NA car's empty `forcedInduction`)
 * is not missing and is skipped rather than counted. Reads 1 (unconstrained)
 * when nothing on the car carries the weight.
 */
function reliabilitySeverityCeiling(
  car: CarInstance,
  model: CarModel,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  const { reliabilityCeilingWeightReference } = economy.statFormulas.condition
  let cap = 1
  for (const entry of partsTaxonomy) {
    const weight = entry.statWeights.reliability
    if (!weight) continue
    const missing = isPartMissing(car, model, entry.id)
    if (!isPartPresent(car, entry.id) && !missing) continue // legitimately absent
    const band = missing ? 'scrap' : car.parts[entry.id].installed!.band
    const base = reliabilityCeilingBaseFor(band, economy)
    const relevance = Math.min(1, weight / reliabilityCeilingWeightReference)
    const partCap = 1 - (1 - base) * relevance
    if (partCap < cap) cap = partCap
  }
  return cap
}

/**
 * The coherence factor (design section 9, lever 6): how far the build's own
 * headline support ratio falls short of `adequate`, curved by
 * `coherenceExponent` and capped at 1 so no build is ever MORE reliable than
 * stock. At or above the `adequate` knee this is exactly 1 - competence is
 * the baseline, not a bonus.
 *
 * Exported for `marketValue.ts`'s Stage C (the coherence discount) and Stage
 * D (coherence-scaled parts retention) - the sale-value design's own
 * `coherenceFactor`, read from the same support verdict this file already
 * computes reliability from. `marketValue.ts` never re-derives it.
 */
export function coherenceFactorFor(headline: number, economy: EconomyConfig): number {
  const { adequateAtOrAbove } = economy.statFormulas.support.thresholds
  const { coherenceExponent } = economy.statFormulas.support
  return Math.min(1, headline / adequateAtOrAbove) ** coherenceExponent
}

/**
 * One car's own coherence factor: `coherenceFactorFor` above, read off that
 * build's own headline support ratio (`supportVerdict`, support.ts).
 *
 * The one place a build's coherence is derived from a car. Reliability's
 * breakdown, every coherence-supported operation, Stage C's value discount and
 * Stage D's parts retention all scale on this single figure, so it is read once
 * here rather than spelled out at each of them - a build cannot be one thing to
 * the dyno and another to the price.
 */
export function coherenceFactorForCar(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  return coherenceFactorFor(supportVerdict(car, model, partsById, economy).headline, economy)
}

/**
 * The build-intensity factor: an OUTER multiplier on the
 * condition-plus-coherence budget, structurally independent of
 * `coherenceFactor` above - even a fully and properly supported build moves
 * more energy through every part of the car than stock does, and pays for
 * that in proportion to how much more power it makes, never in proportion
 * to how well it is supported (that stays `coherenceFactor`'s job alone).
 * Folding this into the additive shortfall `coherenceFactor` shares with
 * `conditionFactor` was measured and rejected: it would subtract an
 * identical flat amount from a supported and an unsupported build alike,
 * collapsing the unsupported case toward an uninteresting floor.
 *
 * Machining lands here too, as `machining.reliabilityCostPerOperation` per
 * applied operation, and here is the whole of what it costs. A machined engine
 * runs closer to its limits for the same reason a built one does, so the
 * charge belongs on the term that already answers "the power itself" rather
 * than on a fourth loss line the readout has no room for. It is the reason a
 * machining gain is deliberately kept OUT of `totalGainFraction`: that sum and
 * this count describe the same energy, and charging both would charge one
 * engine twice.
 *
 * Exactly 1 at zero total gain on an unmachined car, so a stock car (and a
 * build whose fitted parts carry no `powerFraction` at all) pays nothing here
 * - the stock-car-reads-exactly-its-base identity holds by construction.
 * Defensively clamped to `[0, 1]` so a future content change to
 * `stressCoefficient`, the power ladder or the machining charge can never push
 * this negative (more reliable than the unmultiplied budget) or leave
 * reliability negative.
 */
export function reliabilityIntensityFactor(
  totalGainFraction: number,
  machiningOperationCount: number,
  economy: EconomyConfig,
): number {
  const { stressCoefficient } = economy.statFormulas.support
  const { reliabilityCostPerOperation } = economy.machining
  return clamp(
    1 -
      stressCoefficient * totalGainFraction -
      reliabilityCostPerOperation * machiningOperationCount,
    0,
    1,
  )
}

/**
 * Reliability, and the three independent things that took it below the car's
 * own `spec.reliabilityBase`. `reliability` here is the whole derivation,
 * unrounded; `computeDerivedStats` reads exactly this and rounds it, so there
 * is one reliability formula and the dyno's own readout cannot drift from the
 * stat every buyer weights.
 *
 * The three loss figures are in the same points the stat is in, and the
 * identity `reliability + conditionLossPoints + coherenceLossPoints +
 * intensityLossPoints === base` holds exactly, which is what lets a readout
 * say how much of a poor number is the wear and how much is the build:
 *
 *     base - reliability = base * (1 - intensity)                     (the power itself)
 *                        + base * intensity * (1 - conditionFactor)   (wear)
 *                        + base * intensity * (1 - coherenceFactor)   (the build)
 *
 * `share` handles the one case where those three do not already sum to the
 * real loss: when the two shortfalls together exceed the whole budget, the
 * derivation's own clamp floors it at zero, and the two are then scaled by
 * how much of the budget there actually was to lose. It is exactly 1 whenever
 * the clamp is not biting, so the unclamped decomposition is untouched.
 *
 * A sorting-type operation's `reliabilityConditionBonus`
 * (`machiningReliabilityConditionBonusOf`) is added to the raw condition mean
 * before the severity ceiling clamps it - a properly sorted car reads closer
 * to what its own condition band would give a mint example, but a genuinely
 * ruined part elsewhere still holds the whole car back exactly as it always
 * has.
 */
export interface ReliabilityBreakdown {
  /** The car's own `spec.reliabilityBase` - the ceiling nothing exceeds. */
  base: number
  conditionFactor: number
  coherenceFactor: number
  intensityFactor: number
  conditionLossPoints: number
  coherenceLossPoints: number
  intensityLossPoints: number
  /** The unrounded reliability; the stat is this rounded and clamped. */
  reliability: number
}

export function reliabilityBreakdownOf(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): ReliabilityBreakdown {
  const base = model.spec.reliabilityBase
  const conditionMean = weightedBandFactorForStat(car, model, 'reliability', partsTaxonomy, economy)
  const sortingBonus = machiningReliabilityConditionBonusOf(car, economy)
  const conditionFactor = Math.min(
    conditionMean + sortingBonus,
    reliabilitySeverityCeiling(car, model, partsTaxonomy, economy),
  )
  const coherenceFactor = coherenceFactorForCar(car, model, partsById, economy)
  const intensityFactor = reliabilityIntensityFactor(
    totalGainFractionOf(car, model, partsById, economy),
    machiningOperationCountOf(car),
    economy,
  )
  const budget = clamp(conditionFactor + coherenceFactor - 1, 0, 1)
  const shortfall = 1 - conditionFactor + (1 - coherenceFactor)
  const share = shortfall > 0 ? (1 - budget) / shortfall : 0
  return {
    base,
    conditionFactor,
    coherenceFactor,
    intensityFactor,
    conditionLossPoints: base * intensityFactor * (1 - conditionFactor) * share,
    coherenceLossPoints: base * intensityFactor * (1 - coherenceFactor) * share,
    intensityLossPoints: base * (1 - intensityFactor),
    reliability: base * budget * intensityFactor,
  }
}

/**
 * Transparent linear formula (GDD 4.2: "no hidden math the player can't
 * reason about"). `partsById` resolves each installed PartInstance's
 * statModifiers from the parts catalog - sim has no data loader of its
 * own, so the caller supplies it.
 *
 * The magic number below (power's condition floor) lives in
 * `economy.json.statFormulas`; handling's whole model lives in
 * `statFormulas.grip` and is applied through `performance.ts`. Style is
 * `stylePercentOf` above, whole: a car's own `spec.styleBase` walked toward
 * its own `spec.styleCeiling` by what is fitted, times condition.
 * Reliability's own three-factor derivation (condition, coherence, and an
 * outer build-intensity term, scaled by the car's own `spec.reliabilityBase`)
 * is described where it is computed below. Authenticity is
 * `authenticityPercentOf` above, whole: originality times condition, both read
 * off the taxonomy's one authenticity weight column.
 *
 * **Only power accumulates per-part.** Handling, style, reliability and
 * authenticity are each derived whole above and never enter the loop, so the
 * loop below reads a car's fitted SKUs for exactly one quantity.
 *
 * Handling's mint base is the grip readout (`gripToDisplay`) at the fitted
 * tyre's effective compound and the downforce the car is actually running, less
 * a balance penalty; the taxonomy's condition weighting then scales it. A
 * fitted part reaches handling ONLY through the grip and the downforce it
 * moves, never as a flat addition on top: `physicalModifiers.grip` already
 * carries the whole of what a suspension upgrade does, and a second additive
 * column would charge one upgrade twice. The grip it reads is `effectiveGrip`, the same
 * quantity the lap model corners on, through the same `physicalFactorsFor` the
 * lap runs on - which is also where the share of the gain the car's brakes,
 * steering and chassis cannot put down comes off - so a car whose grip was
 * measured cannot show a handling number its own lap time disagrees with, worn
 * or built.
 *
 * Every condition input is `weightedBandFactorForStat` above, self-derived
 * from the taxonomy's own `statWeights` rather than a fixed per-stat
 * component list - power from engine parts (ignitionEcu, camsTiming,
 * intake, exhaust, internals, FI when fitted), handling from suspension
 * and tyres, reliability from engine and drivetrain with cooling
 * emphasized (its own higher authored weight), style from body, interior,
 * and rims, authenticity from everything a purist would notice with the
 * consumables weighted out. A part's `band` is the single, un-adjusted truth
 * this formula reads.
 */
export function computeDerivedStats(
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): StatBlock {
  const { powerConditionFloor, grip, aero } = economy.statFormulas

  // Read once and threaded into every coherence-supported operation below
  // (currently power and handling) rather than recomputed per part - the
  // same support verdict `reliabilityBreakdownOf` derives its own coherence
  // factor from further down, so a build that fights itself gets less out of
  // a coherence-supported operation everywhere that operation reaches.
  const coherenceFactor = coherenceFactorForCar(instance, model, partsById, economy)

  const powerConditionFraction = weightedBandFactorForStat(
    instance,
    model,
    'power',
    partsTaxonomy,
    economy,
  )
  const powerConditionScale =
    powerConditionFloor + (1 - powerConditionFloor) * powerConditionFraction
  let power = model.spec.stockPowerPs * powerConditionScale
  const engineCharacter = engineCharacterOf(model, economy)

  const handlingFraction = weightedBandFactorForStat(
    instance,
    model,
    'handling',
    partsTaxonomy,
    economy,
  )
  const compound = effectiveCompound(instance, model, partsById, grip)
  const downforce = effectiveDownforce(instance, model, partsById, aero)
  const { condition: physical, build } = physicalFactorsFor(
    instance,
    model,
    partsById,
    partsTaxonomy,
    economy,
  )
  const mintHandling =
    gripToDisplay(
      effectiveGrip(model, compound, grip, aero, physical.grip * build.grip),
      downforce.downforceCoeff * physical.aero,
      grip,
      aero,
    ) -
    grip.balance.weight * Math.abs(balanceOf(model, grip))
  // A scene operation's own handling fraction is a further, separate
  // addition on top of this (`handlingBoost`, accumulated in the per-part
  // loop below) - handling past catalogue, not a replacement for it.
  let handling = mintHandling * handlingFraction

  // Style takes no per-part addition at all: an installed part closes part of
  // the gap between the car's own base and its own ceiling rather than adding
  // points to a total, so it is derived whole by `stylePercentOf` above and
  // never enters the accumulation loop below.
  const style = stylePercentOf(instance, model, partsById, partsTaxonomy, economy)

  // Reliability is the bounded sum of two independent shortfalls (design
  // section 9): condition (parts wearing out) and coherence (a build
  // outrunning what it is supported by), scaled again by an outer
  // build-intensity factor, all of it derived whole by
  // `reliabilityBreakdownOf` above - the one implementation, shared with the
  // dyno's own readout so the two can never disagree about what a car is
  // carrying or why.
  const { reliability } = reliabilityBreakdownOf(instance, model, partsById, partsTaxonomy, economy)

  // Authenticity takes no per-part modifier at all: it is a fact about which
  // parts are on the car and what state they are in, derived whole by
  // `authenticityPercentOf` above, so it never enters the accumulation loop
  // below.
  const authenticity = authenticityPercentOf(instance, model, partsById, partsTaxonomy, economy)

  for (const partId of ALL_CAR_PART_IDS) {
    const installed = instance.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue

    // One power term per slot, and machining is inside it rather than beside
    // it: what the fitted SKU gives plus what the metal taken off it gives,
    // scaled by the one band the one part carries. A second accumulation would
    // be the second power path the tuning model bans by name.
    const wear = bandFactor(installed.band, economy)
    const fraction =
      part.statModifiers.powerFraction[engineCharacter] +
      machiningPowerFractionOf(installed, part, engineCharacter, economy, coherenceFactor)
    power += model.spec.stockPowerPs * fraction * wear

    // Handling's own past-catalogue addition, on the same slot loop: a scene
    // operation's `handlingFraction` is a fraction of the car's own MINT
    // handling, wear- and grade-scaled exactly like the power term above.
    const handlingFractionFromOps = machiningHandlingFractionOf(
      installed,
      part,
      economy,
      coherenceFactor,
    )
    handling += mintHandling * handlingFractionFromOps * wear
  }

  return {
    power: Math.round(Math.max(0, power)),
    handling: Math.round(clamp(handling, 0, 100)),
    style,
    reliability: Math.round(clamp(reliability, 0, 100)),
    authenticity,
  }
}
