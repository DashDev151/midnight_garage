import {
  ALL_CAR_PART_IDS,
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
import { supportVerdict, totalGainFractionOf } from './support'

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
    if (installed && partsById[installed.partId]?.grade === 'stock') stockWeight += weight
  }
  return totalWeight > 0 ? stockWeight / totalWeight : 1
}

/**
 * The machining term of the authenticity formula
 * (desirability-system.md section 3): the summed authenticity cost of every
 * machining operation applied to this car, on the design's 1-to-10 scale
 * (1-2 a purist shrugs, 4-6 a raised eyebrow, 7-9 a collector weeps).
 *
 * **Exactly 0 for every car, because the machining system does not exist.**
 * No operation can be applied, so nothing can have been applied, and the term
 * is honestly zero rather than approximated. This is the seam machining will
 * be built against: when operations become real, this function sums their
 * ratings and nothing else in the authenticity pipeline changes. It is a
 * function rather than a literal 0 so that the formula reads as the design
 * states it and the future change lands in one place.
 *
 * Deliberately NOT a content table: no operation exists to price, and
 * authoring one now would be inventing the system rather than reserving its
 * seat.
 */
export function machiningCost(car: CarInstance): number {
  // Nothing a `CarInstance` carries records machining, so there is nothing
  // here to sum yet. The parameter is the seam, deliberately unread.
  void car
  return 0
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
 * **All stock and all mint is exactly 100.** That is the definition of the
 * stat, not a calibration of it: both factors are exactly 1 there and the
 * machining term is 0, so the identity holds by construction.
 *
 * Exported because the concours gate (`carCondition.ts`) needs the same
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
  const raw = 100 * stockness - machiningCost(car)
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
 * less than stock: `effective = 1 + (modifier - 1) * bandFactor(band,
 * economy)`. At `mint`, `bandFactor` is 1.0 and `effective` equals the
 * modifier exactly, so a mint build is unchanged from the raw product. At
 * `scrap` the modifier is pulled most of the way back to 1.0 but never past
 * it, so a knackered part is a bad part, never an absent one (an absent part
 * is `scrapDisablesCar`/`isPartMissing`'s concern, not this one). The same
 * expression handles a sub-1 mass modifier without a second case: `modifier -
 * 1` is negative for a weight-saving part, so wear pulls it back toward 1.0
 * from below and a worn lightweight part never adds mass over stock.
 *
 * The product is what makes a group figure the group's, not each member's: three
 * suspension SKUs at 1.029 apiece reach 1.090 fitted together and a car with one
 * of them fitted gets only that one's share.
 *
 * A slot the catalog cannot resolve contributes nothing rather than defaulting
 * to something, so an unknown part id can never silently move the physics.
 */
export function buildFactors(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): BuildFactors {
  const factors = { ...STOCK_BUILD_FACTORS }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    const modifiers = partsById[installed.partId]?.physicalModifiers
    if (!modifiers) continue
    const wear = bandFactor(installed.band, economy)
    factors.grip *= 1 + (modifiers.grip - 1) * wear
    factors.braking *= 1 + (modifiers.braking - 1) * wear
    factors.mass *= 1 + (modifiers.mass - 1) * wear
  }
  return factors
}

/**
 * PS per litre of EFFECTIVE displacement - stock power divided by
 * displacement, a rotary's literal cc scaled 1.8x first (the equivalency
 * factor motorsport bodies use for exactly this comparison: a 13B is 1308cc
 * by convention but breathes like roughly 2.6 litres, and without the factor
 * every rotary reads as implausibly high-strung). Exported because the dyno
 * screen displays this figure directly and must not recompute it.
 *
 * `displacementCc` is optional on `spec`; this returns `NaN` when it is
 * absent; `engineCharacterOf` below is the one caller in this codebase and
 * guards the absence itself rather than trusting this return value.
 */
export function specificOutputOf(model: CarModel): number {
  const { stockPowerPs, displacementCc, engineConfig } = model.spec
  if (displacementCc === undefined) return NaN
  const isRotary = engineConfig?.startsWith('rotary') ?? false
  const effectiveDisplacementCc = displacementCc * (isRotary ? 1.8 : 1.0)
  return stockPowerPs / (effectiveDisplacementCc / 1000)
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
 * Exactly 1 at zero total gain, so a stock car (and a build whose fitted
 * parts carry no `powerFraction` at all) pays nothing here - the
 * stock-car-reads-exactly-its-base identity holds by construction.
 * Defensively clamped to `[0, 1]` so a future content change to
 * `stressCoefficient` or the power ladder can never push this negative (more
 * reliable than the unmultiplied budget) or leave reliability negative.
 */
export function reliabilityIntensityFactor(
  totalGainFraction: number,
  economy: EconomyConfig,
): number {
  const { stressCoefficient } = economy.statFormulas.support
  return clamp(1 - stressCoefficient * totalGainFraction, 0, 1)
}

/**
 * Transparent linear formula (GDD 4.2: "no hidden math the player can't
 * reason about"). `partsById` resolves each installed PartInstance's
 * statModifiers from the parts catalog - sim has no data loader of its
 * own, so the caller supplies it.
 *
 * The magic number below (power's condition floor) lives in
 * `economy.json.statFormulas`; handling's whole model lives in
 * `statFormulas.grip` and is applied through `performance.ts`. Style's stock
 * contribution scales the car's own `spec.styleBase`, the same shape
 * reliability's derivation scales `spec.reliabilityBase` by. Reliability's
 * own three-factor derivation (condition, coherence, and an outer build-
 * intensity term, scaled by the car's own `spec.reliabilityBase`) is
 * described where it is computed below. Authenticity is `authenticityPercentOf`
 * above, whole: originality times condition, both read off the taxonomy's
 * one authenticity weight column, so it is the only stat here that no
 * installed SKU can adjust after the fact.
 *
 * Handling's mint base is the grip readout (`gripToDisplay`) at the fitted
 * tyre's effective compound and the downforce the car is actually running, less
 * a balance penalty; condition and part modifiers then scale and adjust it
 * exactly like every other stat. The grip it reads is `effectiveGrip`, the same
 * quantity the lap model corners on, through the same condition AND build
 * factors the lap runs on, so a car whose grip was measured cannot show a
 * handling number its own lap time disagrees with, worn or built.
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
  const physical = physicalConditionFactors(instance, model, partsTaxonomy, economy)
  const build = buildFactors(instance, partsById, economy)
  const mintHandling =
    gripToDisplay(
      effectiveGrip(model, compound, grip, aero, physical.grip * build.grip),
      downforce.downforceCoeff * physical.aero,
      grip,
      aero,
    ) -
    grip.balance.weight * Math.abs(balanceOf(model, grip))
  let handling = mintHandling * handlingFraction

  const styleFraction = weightedBandFactorForStat(instance, model, 'style', partsTaxonomy, economy)
  let style = styleFraction * model.spec.styleBase

  // Reliability is the bounded sum of two independent shortfalls (design
  // section 9): condition (parts wearing out) and coherence (a build
  // outrunning what it is supported by). `conditionFactor` is the
  // taxonomy's own weighted mean, capped by the severity ceiling so one
  // catastrophic part (a seized block, a scrapped gearset) cannot average
  // away against fourteen good ones. `coherenceFactor` reads the build's own
  // support verdict; it is 1.0 for a stock or fully-supported build, so
  // either factor alone reduces the formula to the other exactly. That sum
  // clamps to [0, 1] and scales the car's own base.
  //
  // An OUTER build-intensity factor then scales the result again: even a
  // properly supported build moves more energy through every part of the
  // car than stock, so it pays for that in proportion to how much more
  // power it makes - `reliabilityIntensityFactor` above, structurally
  // independent of `coherenceFactor` so a supported build is never charged
  // twice for the same shortfall. `spec.reliabilityBase` therefore stays an
  // absolute ceiling nothing exceeds, but is no longer a plateau every
  // gain-making build sits on regardless of how much power it adds - a
  // stock mint car still sits exactly on it (both extra factors are 1
  // there), and a car with independent terminal problems still correctly
  // reads 0.
  const reliabilityConditionMean = weightedBandFactorForStat(
    instance,
    model,
    'reliability',
    partsTaxonomy,
    economy,
  )
  const conditionFactor = Math.min(
    reliabilityConditionMean,
    reliabilitySeverityCeiling(instance, model, partsTaxonomy, economy),
  )
  const coherenceFactor = coherenceFactorFor(
    supportVerdict(instance, model, partsById, economy).headline,
    economy,
  )
  const totalGainFraction = totalGainFractionOf(instance, model, partsById, economy)
  const intensityFactor = reliabilityIntensityFactor(totalGainFraction, economy)
  const reliability =
    model.spec.reliabilityBase *
    clamp(conditionFactor + coherenceFactor - 1, 0, 1) *
    intensityFactor

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

    const wear = bandFactor(installed.band, economy)
    power += model.spec.stockPowerPs * part.statModifiers.powerFraction[engineCharacter] * wear
    handling += part.statModifiers.handling * wear
    style += part.statModifiers.style * wear
  }

  return {
    power: Math.round(Math.max(0, power)),
    handling: Math.round(clamp(handling, 0, 100)),
    style: Math.round(clamp(style, 0, 100)),
    reliability: Math.round(clamp(reliability, 0, 100)),
    authenticity,
  }
}
