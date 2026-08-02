import {
  ALL_CAR_PART_IDS,
  type CarInstance,
  type CarPartId,
  type EconomyConfig,
  type EngineCharacter,
  type MachiningOperation,
  type Part,
  type PartInstance,
} from '@midnight-garage/content'

/**
 * Machining: what an operation does to a part, and to the car it is fitted to.
 *
 * The third way a part gets better. A repair restores a part to what it was
 * and fitting aftermarket replaces it with something else; machining improves
 * the original, and the part stays the car's own.
 *
 * Every figure here is content (`economy.machining`); this file is the
 * arithmetic that spends it. The derivations that consume it are the ones a
 * fitted part already goes through - `computeDerivedStats` for power,
 * `slotContribution` for support, `authenticityPercentOf` for originality,
 * `reliabilityBreakdownOf` for reliability and `installedPartsValueYen` for
 * money - so machining enters each model through the path a part uses rather
 * than a second one beside it.
 *
 * The workshop half (the gate, the job, the resolver) is `machiningJobs.ts`.
 * This half reads state and never changes it, which is what lets the stat
 * derivations depend on it without depending on the job system.
 */

/** No operations at all - what an unmachined instance reads as. Shared so the
 * common case allocates nothing. */
const NONE: readonly string[] = []

/**
 * The operation ids applied to `instance`. Absent means unmachined, which is
 * every part in the game until a player takes one to the machine shop, so this
 * is the one place the absence is turned into an empty list.
 */
export function machiningOf(instance: PartInstance | null | undefined): readonly string[] {
  return instance?.machining ?? NONE
}

/** How many operations have been applied to `instance` - the count the
 * reliability charge and the value premium are both proportional to. */
export function machiningCountOf(instance: PartInstance | null | undefined): number {
  return machiningOf(instance).length
}

/** The operations the machine shop offers for one slot, in catalogue order.
 * Empty for the twenty-five slots a machinist never touches. */
export function machiningOperationsForSlot(
  carPartId: CarPartId,
  economy: EconomyConfig,
): readonly MachiningOperation[] {
  return economy.machining.operations.filter((operation) => operation.carPartId === carPartId)
}

/** The four slots that hold the engine's own castings, which are the only
 * things a machinist takes metal off. Derived from the operations themselves,
 * never a second list. */
export function machinableSlots(economy: EconomyConfig): readonly CarPartId[] {
  const seen = new Set<CarPartId>(economy.machining.operations.map((o) => o.carPartId))
  return ALL_CAR_PART_IDS.filter((partId) => seen.has(partId))
}

/** The operations actually applied to `instance`, resolved against the
 * catalogue and in catalogue order. An id the catalogue cannot resolve drops
 * out rather than defaulting to something, matching every other unresolvable
 * lookup in the sim. */
export function appliedOperationsOf(
  instance: PartInstance | null | undefined,
  economy: EconomyConfig,
): readonly MachiningOperation[] {
  const applied = machiningOf(instance)
  if (applied.length === 0) return []
  return economy.machining.operations.filter((operation) => applied.includes(operation.id))
}

/**
 * The extra fraction of the car's own STOCK power the machining on `instance`
 * makes, on `character`. Summed over the applied operations and scaled by
 * `machining.gradeMultiplier` for the GRADE of the part machined: better
 * surrounding hardware can use more of what machining unlocks, which is what
 * keeps a machined part below the next grade up.
 *
 * Read by `computeDerivedStats` inside the same per-slot term a fitted part's
 * own `powerFraction` is read in, and band-scaled with it - one power path,
 * and a worn machined part delivers what a worn part delivers.
 *
 * Exactly 0 for an unmachined part, so a car nobody has machined reads its
 * power untouched.
 */
export function machiningPowerFractionOf(
  instance: PartInstance | null | undefined,
  part: Part | undefined,
  character: EngineCharacter,
  economy: EconomyConfig,
): number {
  const operations = appliedOperationsOf(instance, economy)
  if (operations.length === 0 || !part) return 0
  const gradeMultiplier = economy.machining.gradeMultiplier[part.grade]
  let fraction = 0
  for (const operation of operations) fraction += operation.powerFraction[character]
  return fraction * gradeMultiplier
}

/**
 * What the machining on `instance` adds to its slot's support contribution,
 * on `specByGrade`'s own scale. Added to what the fitted grade already
 * contributes rather than replacing it: the support model keeps reading grade,
 * and machining adds to what it reads.
 *
 * Not grade-scaled, unlike power. Specification is what a subsystem can take,
 * and a wire-ringed deck holds the same cylinder pressure whether the block
 * under it left the factory or came from a catalogue.
 *
 * Exactly 0 for an unmachined part, which is what keeps the stock-car identity
 * (every subsystem ratio exactly 1.0) true by construction.
 */
export function machiningSpecOf(
  instance: PartInstance | null | undefined,
  economy: EconomyConfig,
): number {
  let spec = 0
  for (const operation of appliedOperationsOf(instance, economy)) spec += operation.spec
  return spec
}

/**
 * The whole car's machining count, over every slot - what the reliability
 * charge is proportional to. A machined engine runs closer to its limits, and
 * it pays for that once: this feeds the build-intensity factor
 * (`reliabilityIntensityFactor`, derivedStats.ts), which is where the cost of
 * making power already lands, rather than a fourth loss line beside it.
 *
 * The machining gain deliberately does NOT enter `totalGainFractionOf`. That
 * sum and this count describe the same thing, more energy through every part,
 * so charging both would charge one engine twice and make the per-operation
 * lever misleading.
 */
export function machiningOperationCountOf(car: CarInstance): number {
  let count = 0
  for (const partId of ALL_CAR_PART_IDS) count += machiningCountOf(car.parts[partId].installed)
  return count
}

/**
 * The yen one instance's machining adds to what that part is worth:
 * `machining.valuePremiumPerOperation` of the part's own catalogue price, per
 * operation applied. A machined race block is a better object than a race
 * block, on the same axis where a race block already outranks a street one.
 *
 * It is what was DONE to the part that carries the money, never the power it
 * makes: a car is never worth more because it is faster, and this reaches
 * value through the part's own price exactly as the part itself does.
 *
 * Exactly 0 for an unmachined part, so every stock-car value identity holds
 * unchanged.
 */
export function machiningPremiumYenOf(
  instance: PartInstance | null | undefined,
  part: Part | undefined,
  economy: EconomyConfig,
): number {
  const count = machiningCountOf(instance)
  if (count === 0 || !part) return 0
  return part.priceYen * economy.machining.valuePremiumPerOperation * count
}

/**
 * What one instance is worth as a part, machining included - its catalogue
 * price plus its own machining premium. The one figure every price that reads
 * "what is this part worth" should read, so a machined part fetches a machined
 * part's money whether it is on the car, in the bin, or on the counter.
 */
export function machinedPartPriceYen(
  instance: PartInstance | null | undefined,
  part: Part,
  economy: EconomyConfig,
): number {
  return part.priceYen + machiningPremiumYenOf(instance, part, economy)
}
