import type { BayKind, DayLogEntry, Facilities, GameState } from '@midnight-garage/content'
import type { BuyBayAction, MoveCarAction } from './actions'

/**
 * How many cars are currently sitting in parking — every shop car (owned or
 * an active service job's) that is NOT in a service bay. Parking and service
 * bays are mutually exclusive locations: a car in a service bay does not
 * also occupy a parking spot.
 */
export function parkingOccupancy(state: GameState): number {
  const totalShopCars = state.ownedCars.length + state.activeServiceJobs.length
  return totalShopCars - state.serviceBayCarIds.length
}

/** Whether one more car could be parked right now. */
export function hasParkingSpace(state: GameState): boolean {
  return parkingOccupancy(state) < state.parkingBayCount
}

/**
 * Drops a car from serviceBayCarIds if it's there — called whenever a car
 * leaves the shop entirely (sold, listed, or a service job resolved) so a
 * freed bay is immediately usable, not haunted by a stale id.
 */
export function releaseCarFromServiceBay(state: GameState, carInstanceId: string): GameState {
  if (!state.serviceBayCarIds.includes(carInstanceId)) return state
  return {
    ...state,
    serviceBayCarIds: state.serviceBayCarIds.filter((id) => id !== carInstanceId),
  }
}

export interface MoveResult {
  state: GameState
  /** False if the car doesn't exist in the shop, is already at `to`, or the destination has no room. */
  changed: boolean
}

/**
 * The pure "move one car between parking and a service bay" core — the
 * single resolution path shared by the player's instant click (a direct
 * store call) and advanceDay's resolution of bots' queued `moveCars`
 * actions. Moving into a full service bay, or out into full parking, is a
 * no-op rather than an error: the caller decides how to surface that (the
 * store can show "bay full"; advanceDay just silently skips it, exactly
 * like every other capacity-gated DayAction in this codebase).
 */
export function moveCar(state: GameState, carInstanceId: string, to: BayKind): MoveResult {
  const inShop =
    state.ownedCars.some((c) => c.id === carInstanceId) ||
    state.activeServiceJobs.some((sj) => sj.car.id === carInstanceId)
  if (!inShop) return { state, changed: false }

  const inServiceBay = state.serviceBayCarIds.includes(carInstanceId)

  if (to === 'service') {
    if (inServiceBay) return { state, changed: false }
    if (state.serviceBayCarIds.length >= state.serviceBayCount) return { state, changed: false }
    return {
      state: { ...state, serviceBayCarIds: [...state.serviceBayCarIds, carInstanceId] },
      changed: true,
    }
  }

  // to === 'parking'
  if (!inServiceBay) return { state, changed: false }
  // Pulling a car OUT of a service bay increases parking occupancy by one —
  // if parking is already full, there's nowhere for it to go.
  if (parkingOccupancy(state) >= state.parkingBayCount) return { state, changed: false }
  return {
    state: {
      ...state,
      serviceBayCarIds: state.serviceBayCarIds.filter((id) => id !== carInstanceId),
    },
    changed: true,
  }
}

/** Applies a batch of moves in order, logging only the ones that actually changed something. */
export function applyMoves(
  state: GameState,
  moves: readonly MoveCarAction[],
): { state: GameState; log: DayLogEntry[] } {
  let next = state
  const log: DayLogEntry[] = []
  for (const move of moves) {
    const result = moveCar(next, move.carInstanceId, move.to)
    next = result.state
    if (result.changed) {
      log.push({ type: 'car-moved', carInstanceId: move.carInstanceId, to: move.to })
    }
  }
  return { state: next, log }
}

/** The current owned count for a bay kind. */
function currentCount(state: GameState, kind: BayKind): number {
  return kind === 'service' ? state.serviceBayCount : state.parkingBayCount
}

/** Price of the next bay of this kind, or null if already at the max count. */
export function nextBayPriceYen(
  state: GameState,
  kind: BayKind,
  facilities: Facilities,
): number | null {
  const cfg = facilities[kind]
  const owned = currentCount(state, kind)
  if (owned >= cfg.maxCount) return null
  return cfg.bayPricesYen[owned - cfg.startCount] ?? null
}

export interface BayPurchaseResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * The pure "buy one more bay" core — same instant-for-the-player /
 * DayAction-for-bots pattern as moveCar. A no-op (not an error) if the price
 * is unknown (at the max) or unaffordable.
 */
export function applyBayPurchase(
  state: GameState,
  kind: BayKind,
  facilities: Facilities,
): BayPurchaseResult {
  const priceYen = nextBayPriceYen(state, kind, facilities)
  if (priceYen === null || state.cashYen < priceYen) {
    return { state, log: [], applied: false }
  }
  const next: GameState =
    kind === 'service'
      ? { ...state, cashYen: state.cashYen - priceYen, serviceBayCount: state.serviceBayCount + 1 }
      : { ...state, cashYen: state.cashYen - priceYen, parkingBayCount: state.parkingBayCount + 1 }
  return { state: next, log: [{ type: 'bay-purchased', kind, priceYen }], applied: true }
}

/** Applies a batch of bay purchases in order (each affects the next one's price/affordability). */
export function applyBayPurchases(
  state: GameState,
  purchases: readonly BuyBayAction[],
  facilities: Facilities,
): { state: GameState; log: DayLogEntry[] } {
  let next = state
  const log: DayLogEntry[] = []
  for (const purchase of purchases) {
    const result = applyBayPurchase(next, purchase.kind, facilities)
    next = result.state
    log.push(...result.log)
  }
  return { state: next, log }
}
