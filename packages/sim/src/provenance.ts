import type { PartInstance, PartOrigin, ServiceJob } from '@midnight-garage/content'

/**
 * The single module every ownership question in the codebase routes
 * through: a part's origin is stamped once, at birth, and every caller
 * asks it here rather than re-deriving ownership from a side channel.
 */

/** A part's origin when it was pulled from (or generated already installed
 * on) `carInstanceId` - `carLabel` is denormalised at birth so it still
 * reads correctly after the donor car is sold or scrapped. */
export function makeCarOrigin(carInstanceId: string, carLabel: string, day: number): PartOrigin {
  return { kind: 'car', carInstanceId, carLabel, day }
}

/** A part's origin when the player bought it, on `day`. */
export function makeMarketOrigin(day: number): PartOrigin {
  return { kind: 'market', day }
}

/**
 * Whether `part` is the specific customer's own property under `job` - it
 * originated from that exact job's car and was never bought by the player.
 * The one predicate `installFitGate`, `resolveScrapPart`, close-out, and the
 * UI all call instead of re-deriving ownership locally.
 */
export function isCustomerOriginPart(part: PartInstance, job: ServiceJob): boolean {
  return part.origin.kind === 'car' && part.origin.carInstanceId === job.car.id
}

/** Every part in `parts` that originated from `carInstanceId` - the close-out
 * reconciliation basis (which loose inventory parts leave with a departing
 * customer). */
export function partsOriginatingFromCar(
  parts: readonly PartInstance[],
  carInstanceId: string,
): PartInstance[] {
  return parts.filter(
    (part) => part.origin.kind === 'car' && part.origin.carInstanceId === carInstanceId,
  )
}

/** The player-facing origin line a `PartCard` shows beneath the part
 * name - reused by the teardown system as well, hence living here rather
 * than in a UI component. */
export function describeOrigin(origin: PartOrigin): string {
  return origin.kind === 'car' ? `Pulled from ${origin.carLabel}` : `Bought day ${origin.day}`
}
