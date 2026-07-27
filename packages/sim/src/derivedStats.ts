import {
  ALL_CAR_PART_IDS,
  PhysicalDialSchema,
  type CarInstance,
  type CarModel,
  type CarPartTaxonomyEntry,
  type ConditionBand,
  type EconomyConfig,
  type Part,
  type PhysicalDial,
  type StatBlock,
} from '@midnight-garage/content'
import { bandFactor, isPartMissing, isPartPresent } from './bands'
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

type StatKey = 'power' | 'handling' | 'style' | 'reliability'

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
 * The same traversal over the taxonomy's `physicalWeights`, on each dial's own
 * far gentler curve: how much grip, braking, driveline and downforce the car
 * still delivers. This is the ONLY route condition takes into the performance
 * model, and each dial has exactly one path into it, so nothing is charged
 * twice. Engine condition is absent by design - it reaches the model through
 * the car's current power instead.
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
 * product of every installed SKU's own `physicalModifiers`. The counterpart of
 * `physicalConditionFactors` above, and the second half of the same idea - one
 * traversal of the car's slots per concern, each dial assembled exactly once.
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
): BuildFactors {
  const factors = { ...STOCK_BUILD_FACTORS }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    const modifiers = partsById[installed.partId]?.physicalModifiers
    if (!modifiers) continue
    factors.grip *= modifiers.grip
    factors.braking *= modifiers.braking
    factors.mass *= modifiers.mass
  }
  return factors
}

/**
 * Transparent linear formula (GDD 4.2: "no hidden math the player can't
 * reason about"). `partsById` resolves each installed PartInstance's
 * statModifiers from the parts catalog - sim has no data loader of its
 * own, so the caller supplies it.
 *
 * The magic numbers below (power's condition floor, style's cap,
 * reliability's cap) live in `economy.json.statFormulas`; handling's whole
 * model lives in `statFormulas.grip` and is applied through `performance.ts`.
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
 * and rims. A part's `band` is the single, un-adjusted truth this formula
 * reads.
 */
export function computeDerivedStats(
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): StatBlock {
  const { powerConditionFloor, styleCap, reliabilityCap, grip, aero } = economy.statFormulas

  const powerFraction = weightedBandFactorForStat(instance, model, 'power', partsTaxonomy, economy)
  const powerConditionScale = powerConditionFloor + (1 - powerConditionFloor) * powerFraction
  let power = model.spec.stockPowerPs * powerConditionScale

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
  const build = buildFactors(instance, partsById)
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
  let style = styleFraction * styleCap

  const reliabilityFraction = weightedBandFactorForStat(
    instance,
    model,
    'reliability',
    partsTaxonomy,
    economy,
  )
  let reliability = reliabilityCap * reliabilityFraction

  let authenticity = instance.authenticityPercent

  for (const partId of ALL_CAR_PART_IDS) {
    const installed = instance.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue

    const wear = bandFactor(installed.band, economy)
    power += part.statModifiers.power * wear
    handling += part.statModifiers.handling * wear
    style += part.statModifiers.style * wear
    reliability += part.statModifiers.reliability * wear
    // GDD 5.3: genuine period parts add authenticity; reproductions never
    // add it, though a non-genuine part's *penalty* (a negative modifier)
    // still applies - modification away from stock hurts either way.
    authenticity += installed.genuinePeriod
      ? part.statModifiers.authenticity
      : Math.min(0, part.statModifiers.authenticity)
  }

  return {
    power: Math.round(Math.max(0, power)),
    handling: Math.round(clamp(handling, 0, 100)),
    style: Math.round(clamp(style, 0, 100)),
    reliability: Math.round(clamp(reliability, 0, 100)),
    authenticity: Math.round(clamp(authenticity, 0, 100)),
  }
}
