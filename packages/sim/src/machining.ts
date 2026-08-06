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
 * The catalogue (`economy.machining.operations`) holds two families on one
 * shape: the original four engine-only operations, gated on tool tier alone,
 * and the six scene operations (`docs/design/systems/scene-standing-
 * refactor.md` section 6), each also gated on a scene's Shop-stage standing
 * (`scene`, checked in `machiningJobs.ts`). Both read and write through
 * exactly the same functions below - one chassis, not two.
 *
 * Every figure here is content (`economy.machining`); this file is the
 * arithmetic that spends it. The derivations that consume it are the ones a
 * fitted part already goes through - `computeDerivedStats` for power,
 * handling and style, `slotContribution` for support,
 * `authenticityPercentOf` for originality, `reliabilityBreakdownOf` for
 * reliability's condition and coherence terms, and `installedPartsValueYen`
 * for money - so an operation enters each model through the path a part uses
 * rather than a second one beside it.
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

/**
 * Where an operation is performed, which is also what it is addressed by: a
 * `loose-part` operation is quoted against one `PartInstance` on the machine,
 * a `fitted-part` one against a slot on an assembled car.
 */
export type MachiningVenue = MachiningOperation['performedOn']

/**
 * One operation by id, or `undefined` when the catalogue does not hold it -
 * the one lookup, so an unresolvable id is refused rather than defaulted at
 * each call site. `venue` narrows it to the operations performed there, which
 * is what stops a room quoting work it does not do: the machine shop cannot
 * resolve a corner weight, and the car cannot resolve a bore.
 */
export function machiningOperationById(
  operationId: string | undefined,
  economy: EconomyConfig,
  venue?: MachiningVenue,
): MachiningOperation | undefined {
  if (!operationId) return undefined
  return economy.machining.operations.find(
    (operation) =>
      operation.id === operationId && (venue === undefined || operation.performedOn === venue),
  )
}

/** The operations performed at `venue` on one slot, in catalogue order. Empty
 * for a slot that venue never touches. */
export function machiningOperationsForSlot(
  carPartId: CarPartId,
  economy: EconomyConfig,
  venue: MachiningVenue,
): readonly MachiningOperation[] {
  return economy.machining.operations.filter(
    (operation) => operation.carPartId === carPartId && operation.performedOn === venue,
  )
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
 * `coherenceFactor` (default 1, i.e. no reduction) further scales any applied
 * operation whose own `coherenceSupported` is set - a scene craft that trades
 * on how well the rest of the build hangs together, so it gives up less on a
 * build that fights itself. Every other operation ignores it entirely, which
 * is what the default preserves for every caller that has not computed one.
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
  coherenceFactor = 1,
): number {
  const operations = appliedOperationsOf(instance, economy)
  if (operations.length === 0 || !part) return 0
  const gradeMultiplier = economy.machining.gradeMultiplier[part.grade]
  let fraction = 0
  for (const operation of operations) {
    fraction +=
      operation.powerFraction[character] * (operation.coherenceSupported ? coherenceFactor : 1)
  }
  return fraction * gradeMultiplier
}

/**
 * Handling's counterpart to `machiningPowerFractionOf` above: the extra
 * fraction of the car's own MINT handling the operations on `instance` add,
 * scaled by the same grade multiplier and the same optional coherence factor.
 * Handling has no per-part accumulation of its own the way power does - every
 * fitted part reaches it through `physicalModifiers.grip` inside one whole-car
 * build factor - so `computeDerivedStats` sums this per slot itself rather
 * than folding it into an existing loop.
 *
 * Exactly 0 for an unmachined part or one carrying no `handlingFraction`
 * operation, so a car with no scene craft applied reads its handling
 * untouched.
 */
export function machiningHandlingFractionOf(
  instance: PartInstance | null | undefined,
  part: Part | undefined,
  economy: EconomyConfig,
  coherenceFactor = 1,
): number {
  const operations = appliedOperationsOf(instance, economy)
  if (operations.length === 0 || !part) return 0
  const gradeMultiplier = economy.machining.gradeMultiplier[part.grade]
  let fraction = 0
  for (const operation of operations) {
    fraction += operation.handlingFraction * (operation.coherenceSupported ? coherenceFactor : 1)
  }
  return fraction * gradeMultiplier
}

/**
 * Style's counterpart: the raw style points the operations on `instance` add,
 * on the same scale `Part.statModifiers.style` already uses. Never grade- or
 * coherence-scaled - style reads neither for a catalogue part either
 * (`stylePercentOf`), so an operation does not start reading either just
 * because it lives on the same catalogue as power's operations do. The
 * caller folds this into the fitted part's own style points before applying
 * the slot's band factor, exactly as it already does for the catalogue
 * figure.
 *
 * Exactly 0 for an unmachined part, so an untouched car's style is unchanged.
 */
export function machiningStylePointsOf(
  instance: PartInstance | null | undefined,
  economy: EconomyConfig,
): number {
  let points = 0
  for (const operation of appliedOperationsOf(instance, economy)) points += operation.style
  return points
}

/**
 * Reliability's counterpart, but summed over the WHOLE CAR rather than one
 * slot: the flat addition to reliability's own condition factor every
 * applied `reliabilityConditionBonus` operation grants
 * (`reliabilityBreakdownOf`, derivedStats.ts). Never band- or grade-scaled -
 * a properly sorted subsystem does not un-sort itself as it wears - and
 * deliberately NOT routed through the per-slot weighted mean the way a
 * catalogue part's own condition weight is: a sorted slot's own taxonomy
 * weight is small next to the car's total reliability weight, so diluting
 * the bonus through that mean would make it nearly invisible. The bonus is
 * authored on the SAME scale as a whole band step
 * (`economy.bands.bandFactors`) and lands on the car's condition factor
 * directly instead.
 *
 * Exactly 0 for a car with no such operation applied anywhere, so an
 * unsorted car's reliability is unchanged.
 */
export function machiningReliabilityConditionBonusOf(
  car: CarInstance,
  economy: EconomyConfig,
): number {
  let bonus = 0
  for (const partId of ALL_CAR_PART_IDS) {
    for (const operation of appliedOperationsOf(car.parts[partId].installed, economy)) {
      bonus += operation.reliabilityConditionBonus
    }
  }
  return bonus
}

/**
 * What one operation costs in authenticity on `part`: its own authored rating
 * on a STOCK-grade part, and nothing on anything else.
 *
 * Authenticity asks how much of the car is still what left the factory, and an
 * aftermarket part already lost its slot's whole weight the moment it was
 * fitted (`stocknessOf`, derivedStats.ts). Boring a race block does not make
 * that slot less factory than it already is, and charging for it would book one
 * loss twice. A slot the catalogue cannot resolve is not charged either: an
 * unknown SKU is not a stock part, and is no evidence of originality to take
 * away.
 *
 * The one rule behind the car's own sheet (`machiningCost`) and both previews
 * of it (the machine shop's quote and the car's setup offers), so what a room
 * quotes and what the stat charges can never disagree.
 */
export function machiningAuthenticityCostOf(
  operation: MachiningOperation,
  part: Part | undefined,
): number {
  return part?.grade === 'stock' ? operation.authenticityCost : 0
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
