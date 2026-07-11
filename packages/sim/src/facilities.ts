import type {
  BayKind,
  DayLogEntry,
  Facilities,
  GameState,
  ReputationTier,
} from '@midnight-garage/content'
import { reputationAtLeast } from './calendar'
import type { BuyBayAction, MoveCarAction } from './actions'

/**
 * Reads slot `index` from a bay array, treating any index at or beyond the
 * array's actual length as an implicit empty slot. `serviceBayCarIds`/
 * `parkingCarIds` are meant to track their bay count exactly (every mutator
 * below keeps them in sync), but nothing enforces that at the schema level -
 * a shorter array (an older fixture, a hand-built test state) is still
 * handled correctly rather than throwing or under-counting real capacity.
 */
function slotAt(arr: readonly (string | null)[], index: number): string | null {
  return arr[index] ?? null
}

/** Returns a copy of `arr` with `index` set to `value`, padding with `null`
 * first if `index` is beyond the array's current length (see `slotAt`). */
function withSlot(
  arr: readonly (string | null)[],
  index: number,
  value: string | null,
): (string | null)[] {
  const next = [...arr]
  while (next.length <= index) next.push(null)
  next[index] = value
  return next
}

/**
 * How many cars are currently sitting in parking. Sprint 17: `parkingCarIds`
 * is real, index-addressable state now (a specific slot, not "everyone not
 * in a service bay") - occupancy is just its non-null count.
 */
export function parkingOccupancy(state: GameState): number {
  return state.parkingCarIds.filter((id) => id !== null).length
}

/** Whether one more car could be parked right now. */
export function hasParkingSpace(state: GameState): boolean {
  return parkingOccupancy(state) < state.parkingBayCount
}

/**
 * Clears a car's slot - wherever it currently sits, service or parking -
 * called whenever a car leaves the shop entirely (sold, listed, or a
 * service job resolved) so the freed slot is immediately reusable, not
 * haunted by a stale id. Before Sprint 17 this only ever needed to check
 * the service-bay array (parking had no stored slots to leak); now a car
 * can just as easily be leaving from a specific parking slot.
 */
export function releaseCarFromShop(state: GameState, carInstanceId: string): GameState {
  const serviceIndex = state.serviceBayCarIds.indexOf(carInstanceId)
  if (serviceIndex !== -1) {
    return { ...state, serviceBayCarIds: withSlot(state.serviceBayCarIds, serviceIndex, null) }
  }
  const parkingIndex = state.parkingCarIds.indexOf(carInstanceId)
  if (parkingIndex !== -1) {
    return { ...state, parkingCarIds: withSlot(state.parkingCarIds, parkingIndex, null) }
  }
  return state
}

/**
 * Assigns a car that just entered the shop (won at auction, a service-job
 * customer's car, a dev grant) to a parking slot - the first empty one
 * (real or implicit, up to `parkingBayCount`), or a genuinely appended slot
 * beyond that if none is free. Every normal acquisition path already checks
 * `hasParkingSpace` before calling this, so the overflow branch should only
 * ever be reached via a capacity-bypassing path (the dev console) - it
 * exists so a car is never silently unplaced, not as a workaround for real
 * gameplay capacity.
 */
export function assignToParking(state: GameState, carInstanceId: string): GameState {
  if (
    state.serviceBayCarIds.includes(carInstanceId) ||
    state.parkingCarIds.includes(carInstanceId)
  ) {
    return state // already has a slot somewhere - shouldn't happen, but idempotent
  }
  for (let i = 0; i < state.parkingBayCount; i++) {
    if (slotAt(state.parkingCarIds, i) === null) {
      return { ...state, parkingCarIds: withSlot(state.parkingCarIds, i, carInstanceId) }
    }
  }
  return { ...state, parkingCarIds: [...state.parkingCarIds, carInstanceId] }
}

export interface MoveResult {
  state: GameState
  /** False if the car doesn't exist in the shop, is already at `to`, or the destination has no room. */
  changed: boolean
}

/** Which section (if any) currently holds this car, and at what index. */
function locate(state: GameState, carInstanceId: string): { from: BayKind; index: number } | null {
  const serviceIndex = state.serviceBayCarIds.indexOf(carInstanceId)
  if (serviceIndex !== -1) return { from: 'service', index: serviceIndex }
  const parkingIndex = state.parkingCarIds.indexOf(carInstanceId)
  if (parkingIndex !== -1) return { from: 'parking', index: parkingIndex }
  return null
}

/**
 * Moves (or swaps) a car into a SPECIFIC slot - the real positional core
 * behind drag-and-drop (Sprint 17 playtest fix). Dropping a car onto an
 * empty slot moves it there; dropping onto a slot occupied by a DIFFERENT
 * car exchanges their positions (same section or across service/parking
 * alike - "occupied service bay 1 onto occupied service bay 2" is now a
 * real swap, not the no-op it briefly was); dropping onto its own slot is a
 * no-op. Slot position is real, persisted state now - "parking bay 4" means
 * bay 4, not wherever the array used to happen to render a car. `slotIndex`
 * is checked against the bay *count*, not the array's current length -
 * see `slotAt`/`withSlot`.
 */
export function moveCarToSlot(
  state: GameState,
  carInstanceId: string,
  to: BayKind,
  slotIndex: number,
): MoveResult {
  const inShop =
    state.ownedCars.some((c) => c.id === carInstanceId) ||
    state.activeServiceJobs.some((sj) => sj.car.id === carInstanceId)
  if (!inShop) return { state, changed: false }

  const source = locate(state, carInstanceId)
  if (!source) return { state, changed: false }

  const destCount = to === 'service' ? state.serviceBayCount : state.parkingBayCount
  if (slotIndex < 0 || slotIndex >= destCount) return { state, changed: false }
  if (source.from === to && source.index === slotIndex) return { state, changed: false }

  const destArray = to === 'service' ? state.serviceBayCarIds : state.parkingCarIds
  const occupant = slotAt(destArray, slotIndex)

  if (source.from === to) {
    // Same-section reorder or swap - one array, mutated twice.
    const arr = withSlot(withSlot(destArray, source.index, occupant), slotIndex, carInstanceId)
    return {
      state:
        to === 'service' ? { ...state, serviceBayCarIds: arr } : { ...state, parkingCarIds: arr },
      changed: true,
    }
  }

  // Cross-section move or swap. Targeting a specific empty slot within
  // `destCount` already proves room exists, so (unlike the old exclusion-
  // based model) there's no separate capacity check to duplicate here.
  const newDest = withSlot(destArray, slotIndex, carInstanceId)
  const sourceArray = source.from === 'service' ? state.serviceBayCarIds : state.parkingCarIds
  const newSource = withSlot(sourceArray, source.index, occupant)

  const next: GameState =
    to === 'service'
      ? { ...state, serviceBayCarIds: newDest, parkingCarIds: newSource }
      : { ...state, serviceBayCarIds: newSource, parkingCarIds: newDest }

  return { state: next, changed: true }
}

/**
 * Moves a car into the FIRST available slot of `to` - for callers that
 * don't care which specific slot (every bot, and the plain "→ parking"/
 * "→ service bay" buttons that don't require a drag gesture). A thin
 * wrapper over `moveCarToSlot` so there's exactly one resolution path.
 */
export function moveCar(state: GameState, carInstanceId: string, to: BayKind): MoveResult {
  const destArray = to === 'service' ? state.serviceBayCarIds : state.parkingCarIds
  const destCount = to === 'service' ? state.serviceBayCount : state.parkingBayCount
  for (let i = 0; i < destCount; i++) {
    if (slotAt(destArray, i) === null) return moveCarToSlot(state, carInstanceId, to, i)
  }
  return { state, changed: false }
}

/**
 * Atomically exchanges a service-bay car and a parking car's positions
 * (Sprint 11, round-2 playtest #3) - the fix for a shop that's exactly full
 * (services + parking cars == total capacity, zero slack): neither
 * direction of `moveCar` has anywhere to go, but a swap's net occupancy
 * change in each location is zero, so it always succeeds. A thin wrapper
 * over `moveCarToSlot` (Sprint 17): resolves `parkingCarId`'s current slot
 * and moves `serviceCarId` there, which - since that slot is occupied by a
 * different car - is exactly a swap. No-op (not an error) if either car
 * isn't where the caller claims.
 */
export function swapCars(state: GameState, serviceCarId: string, parkingCarId: string): MoveResult {
  if (!state.serviceBayCarIds.includes(serviceCarId)) return { state, changed: false }
  const parkingIndex = state.parkingCarIds.indexOf(parkingCarId)
  if (parkingIndex === -1) return { state, changed: false }
  return moveCarToSlot(state, serviceCarId, 'parking', parkingIndex)
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

/**
 * The reputation tier required for the next bay of this kind (Sprint 16
 * decision 2), or null if it's already met (or there's no gate, or the
 * ladder is maxed). Kept separate from `nextBayPriceYen` - same as cash
 * affordability, which `nextBayPriceYen` also doesn't check - so a UI can
 * tell "not enough reputation yet" apart from "maxed out" instead of both
 * collapsing into the same null.
 */
export function nextBayMinReputationTier(
  state: GameState,
  kind: BayKind,
  facilities: Facilities,
): ReputationTier | null {
  const cfg = facilities[kind]
  const owned = currentCount(state, kind)
  if (owned >= cfg.maxCount) return null
  const required = cfg.minReputationTier[owned - cfg.startCount]
  if (!required || reputationAtLeast(state.reputationTier, required)) return null
  return required
}

export interface BayPurchaseResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * The pure "buy one more bay" core - same instant-for-the-player /
 * DayAction-for-bots pattern as moveCar. A no-op (not an error) if the price
 * is unknown (at the max), unaffordable, or (Sprint 16) the required
 * reputation tier hasn't been reached yet. Appends a new empty slot to the
 * relevant indexed array (Sprint 17) so array length keeps tracking the
 * purchased count exactly under normal play.
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
  if (nextBayMinReputationTier(state, kind, facilities) !== null) {
    return { state, log: [], applied: false }
  }
  const next: GameState =
    kind === 'service'
      ? {
          ...state,
          cashYen: state.cashYen - priceYen,
          serviceBayCount: state.serviceBayCount + 1,
          serviceBayCarIds: [...state.serviceBayCarIds, null],
        }
      : {
          ...state,
          cashYen: state.cashYen - priceYen,
          parkingBayCount: state.parkingBayCount + 1,
          parkingCarIds: [...state.parkingCarIds, null],
        }
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
