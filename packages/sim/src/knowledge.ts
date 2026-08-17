import {
  ALL_CAR_PART_IDS,
  ConditionBandSchema,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
} from '@midnight-garage/content'
import { bandIndex } from './bands'
import type { SimContext } from './context'

/**
 * The knowledge model (docs/design/systems/knowledge-and-diagnosis.md
 * section 1): what the player actually knows about an owned car's slots,
 * separate from the truth every economic and mechanical calculation still
 * reads unchanged. A slot is either VERIFIED (the player has confirmed its
 * real band - by removal, a repair click, or a diagnostic confirmation) or
 * ESTIMATED (a deterministic, mileage/provenance guess, `priorBand`, never
 * the truth). Nothing here ever gates an action; it only decides what a
 * display or a player-facing estimate is allowed to read.
 */

/** Worst to best, the same order `bands.ts`'s own `BAND_ORDER` uses -
 * re-read off the schema rather than re-declared, since `bands.ts` does not
 * export its private copy. */
const CONDITION_BAND_ORDER: readonly ConditionBand[] = ConditionBandSchema.options

/**
 * Every slot verified "from the start" on an acquired car: eyes suffice, no
 * inspection ever needed. `depthClass: 'surface'` slots (the shell/trim,
 * already visual) plus `tyres` and `rims` - the two bolt-on slots the design
 * doc calls out by name because a look at the tread and the wheels tells the
 * whole story without a spanner. Every other real part starts estimated.
 */
export function defaultVerifiedSlots(context: SimContext): CarPartId[] {
  const surface = context.partsTaxonomy
    .filter((entry) => entry.depthClass === 'surface')
    .map((entry) => entry.id)
  const extra: CarPartId[] = ['tyres', 'rims']
  return [...new Set([...surface, ...extra])]
}

/**
 * Seeds `verifiedSlots` at acquisition (bidding.ts's `settleLotPurchase`) -
 * the normal case: only the always-visible slots start known, everything
 * else on the car the player just bought is estimated until they earn it.
 */
export function seedVerifiedSlots(car: CarInstance, context: SimContext): CarInstance {
  return { ...car, verifiedSlots: defaultVerifiedSlots(context) }
}

/**
 * Every slot verified outright - the dev-grant and tutorial-lot exception
 * (sprint215.md task A3): a dev convenience and a scripted script are not
 * knowledge gameplay, so both start fully known rather than estimated.
 */
export function fullyVerifiedCar(car: CarInstance): CarInstance {
  return { ...car, verifiedSlots: [...ALL_CAR_PART_IDS] }
}

/**
 * Whether the player has confirmed `partId`'s real band on `car`. Absent
 * `verifiedSlots` (a hand-authored fixture, a bot/probe car, a customer's
 * service-job car this sprint does not touch) defensively reads as verified
 * - the pre-Sprint-215 behaviour, and the safe default: no surface here ever
 * hides truth that was visible before this sprint landed.
 */
export function isSlotVerified(car: CarInstance, partId: CarPartId): boolean {
  return car.verifiedSlots?.includes(partId) ?? true
}

/** Idempotent: adds `partId` to `car.verifiedSlots` if it is not already
 * there. A no-op (returns `car` unchanged) once verified, or on a car the
 * knowledge model has not been seeded onto - see `isSlotVerified`'s own
 * doc comment for why that reads safely rather than needing a seed here. */
export function verifySlot(car: CarInstance, partId: CarPartId): CarInstance {
  if (!car.verifiedSlots || car.verifiedSlots.includes(partId)) return car
  return { ...car, verifiedSlots: [...car.verifiedSlots, partId] }
}

/**
 * The deterministic guess an estimated slot's chip shows (design section 1):
 * `bandFromMileageSegment(mileageKm)` adjusted by a provenance modifier,
 * clamped to `[poor, mint]` - the guess is never as bad as `scrap`, since a
 * genuinely wrecked part is exactly the kind of fact the player is meant to
 * have to go find out.
 *
 * The mileage segment reuses `valuation.mileageFactorCurve`'s own
 * breakpoints (`knowledgePriors.mileageBandBySegment` is parallel to it, one
 * band per breakpoint, so the two curves can never disagree about where a
 * segment boundary falls) rather than a step-shaped guess at THIS particular
 * slot: the formula names no per-slot term at all, so every estimated slot
 * on the same car currently reads the same guess. `partId` stays a parameter
 * for signature stability against a future per-slot term, unused today.
 *
 * The provenance modifier reads `car.damagePattern` (generation-damage.md
 * layer 3, the closest existing fact to the design doc's "garage-kept" /
 * "crash, flood, abandoned" framing) - `knowledgePriors.
 * provenanceModifierByDamagePattern`, zero for a car with no rolled pattern.
 */
export function priorBand(
  car: CarInstance,
  _partId: CarPartId,
  context: SimContext,
): ConditionBand {
  const { mileageBandBySegment, provenanceModifierByDamagePattern } =
    context.economy.knowledgePriors
  const breakpoints = context.economy.valuation.mileageFactorCurve
  let segmentIndex = mileageBandBySegment.length - 1
  for (let i = 0; i < breakpoints.length; i++) {
    if (car.mileageKm <= breakpoints[i]![0]) {
      segmentIndex = Math.min(i, mileageBandBySegment.length - 1)
      break
    }
  }
  const baseBand = mileageBandBySegment[segmentIndex]!
  const modifier = car.damagePattern ? provenanceModifierByDamagePattern[car.damagePattern] : 0
  const poorIndex = bandIndex('poor')
  const mintIndex = bandIndex('mint')
  const clampedIndex = Math.max(poorIndex, Math.min(mintIndex, bandIndex(baseBand) + modifier))
  return CONDITION_BAND_ORDER[clampedIndex]!
}

/**
 * The car as the player's own knowledge sees it: every UNVERIFIED slot's
 * installed part is masked back to the fitment class's stock SKU at
 * `priorBand`, exactly mirroring `diagnosis.ts`'s `apparentViewOf` (the
 * room's own "car as it presents" view). Used by every player-facing figure
 * that must run off knowledge rather than truth - the estimated chip, the
 * player's own value estimate and ledger (sprint215.md task B). Pure, never
 * mutates `car`. A genuinely empty slot is left alone: an absent part is
 * visible by eye, not a condition question the knowledge model has any say
 * over.
 *
 * Masking part IDENTITY as well as band is what makes section 9's hidden
 * non-stock roll (task E) work with no separate flag: an ordinary unverified
 * slot's true part already IS the stock one, so masking it to "the expected
 * stock part" changes nothing observable; the rare slot whose true part is a
 * hidden non-stock SKU is the one case where this substitution actually
 * differs from the truth, and verifying the slot reveals both the real name
 * and the real band together, in one step.
 *
 * A car the knowledge model has not been seeded onto (`verifiedSlots`
 * absent) returns `car` unchanged - see `isSlotVerified`'s own doc comment.
 */
export function knowledgeViewOf(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): CarInstance {
  if (!car.verifiedSlots) return car
  const fitmentClass = fitmentClassForTier(model.tier)
  const parts = { ...car.parts }
  for (const partId of ALL_CAR_PART_IDS) {
    if (isSlotVerified(car, partId)) continue
    const installed = car.parts[partId].installed
    if (!installed) continue
    const stockPart = context.stockPartByCarPartId[fitmentClass]?.[partId]
    parts[partId] = {
      ...car.parts[partId],
      installed: {
        ...installed,
        partId: stockPart ? stockPart.id : installed.partId,
        band: priorBand(car, partId, context),
      },
    }
  }
  return { ...car, parts }
}
