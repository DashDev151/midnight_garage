import {
  fitmentClassForTier,
  GradeSchema,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type ComponentId,
  type DayLogEntry,
  type GameState,
  type Grade,
  type Part,
  type PartInstance,
  type PendingPartOrder,
} from '@midnight-garage/content'
import { scrapValueYen, usedPartSaleValueYen } from './bands'
import { PARTS_EXPRESS_SURCHARGE_FRACTION, PARTS_STANDARD_DELIVERY_DAYS } from './constants'
import type { SimContext } from './context'
import { bookCashMovements } from './financeLedger'
import { machinedPartPriceYen } from './machining'
import { isCustomerOriginPart, makeMarketOrigin } from './provenance'

export type DeliverySpeed = 'standard' | 'express'

/** A grade's position on the stock -> street -> sport -> race ladder, read
 * straight from the schema so there is exactly one source of grade order in
 * the codebase (mirrors `calendar.ts`'s `reputationTierIndex`). */
function gradeIndex(grade: Grade): number {
  return GradeSchema.options.indexOf(grade)
}

/** Whether `grade` meets or exceeds `min` on the stock/street/sport/race
 * ladder - the install-task completion and payout-derivation check ("at
 * least this grade," never an exact-only match). */
export function gradeAtLeast(grade: Grade, min: Grade): boolean {
  return gradeIndex(grade) >= gradeIndex(min)
}

/**
 * The one real fit rule: right group slot + every required tag present on
 * the model. Sim-level source of truth; the UI predicate calls this
 * instead of duplicating it.
 *
 * A catalog part's group is derived from `carPartId` via the taxonomy - a
 * part addresses one specific `CarPartId`, but staging/jobs still address
 * the 6-way group it belongs to - not stored redundantly on `Part` itself.
 * This only checks catalog-level fit (tags/group); a `PartInstance`'s own
 * `band` (scrap is universally uninstallable) is checked separately by the
 * caller (`jobs.ts`'s `installFitGate`), since this function only ever sees
 * the catalog `Part`, never a specific owned instance.
 *
 * An optional `carPartId` narrows the check from "fits somewhere in this
 * group" to "addresses this exact part" - the per-part Replace drawer's
 * own fit predicate. Omitted, this is exactly the group-level check.
 *
 * Economy-bible.md law 3 additionally requires the part's own
 * `fitmentClass` to match the car's (derived from its roster tier) - a
 * kei-class part physically cannot go on a sports car, full stop. This is
 * the one check that makes cross-class repair arbitrage structurally
 * impossible.
 */
export function partFitsCar(
  part: Part,
  model: CarModel,
  componentId: ComponentId,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  carPartId?: CarPartId,
): boolean {
  const taxonomyEntry = partsTaxonomyById[part.carPartId]
  return (
    !!taxonomyEntry &&
    // A zone-scoped SKU (a per-zone replacement panel) addresses a single
    // body zone, never a whole car slot, so it can never slot-fit a car:
    // it is consumed by zone work, not installed as the slot's part.
    part.zoneId == null &&
    taxonomyEntry.group === componentId &&
    (!carPartId || part.carPartId === carPartId) &&
    part.fitmentClass === fitmentClassForTier(model.tier) &&
    part.requiredTags.every((tag) => model.tags.includes(tag))
  )
}

export interface BuyPartResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The buy-part resolver, split by delivery speed. Express pays a surcharge
 * and lands in inventory the moment it's bought - installable immediately.
 * Standard pays sticker price and creates a `PendingPartOrder` instead; the
 * real `PartInstance` only appears once `advanceDay`'s delivery step
 * reaches `arrivesOnDay` (see `resolvePartDeliveries` below) - a "commit
 * now, resolve later" shape.
 */
export function resolveBuyPart(
  state: GameState,
  partId: string,
  context: SimContext,
  deliverySpeed: DeliverySpeed = 'express',
): BuyPartResult {
  const part = context.partsById[partId]
  if (!part) return { state, log: [] }

  if (deliverySpeed === 'standard') {
    if (state.cashYen < part.priceYen) return { state, log: [] }
    const order: PendingPartOrder = {
      id: `order-${state.day}-${state.pendingPartOrders.length}`,
      partId: part.id,
      priceYen: part.priceYen,
      purchasedOnDay: state.day,
      arrivesOnDay: state.day + PARTS_STANDARD_DELIVERY_DAYS,
    }
    // Cash leaves now and the part arrives later, so the spend is stock the
    // day it is ordered - a car's own ledger only sees it if and when it is
    // fitted.
    const log: DayLogEntry[] = [
      {
        type: 'part-ordered',
        orderId: order.id,
        partId: part.id,
        priceYen: order.priceYen,
        arrivesOnDay: order.arrivesOnDay,
      },
    ]
    return {
      state: bookCashMovements(
        {
          ...state,
          cashYen: state.cashYen - part.priceYen,
          pendingPartOrders: [...state.pendingPartOrders, order],
        },
        log,
        context.economy,
      ),
      log,
    }
  }

  const priceYen = Math.round(part.priceYen * (1 + PARTS_EXPRESS_SURCHARGE_FRACTION))
  if (state.cashYen < priceYen) return { state, log: [] }

  const partInstance: PartInstance = {
    id: `part-${state.day}-${state.partInventory.length}`,
    partId: part.id,
    band: 'mint',
    origin: makeMarketOrigin(state.day),
    pricePaidYen: priceYen,
  }
  const log: DayLogEntry[] = [
    {
      type: 'part-bought',
      partId: part.id,
      partInstanceId: partInstance.id,
      priceYen,
    },
  ]
  return {
    state: bookCashMovements(
      {
        ...state,
        cashYen: state.cashYen - priceYen,
        partInventory: [...state.partInventory, partInstance],
      },
      log,
      context.economy,
    ),
    log,
  }
}

export interface PartDeliveryResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Day-boundary resolution for standard-delivery orders - the same "due
 * today resolves, the rest stays pending" shape every other day-boundary
 * resolve-loop in `advanceDay` uses: orders due today become real
 * `PartInstance`s in `partInventory`; everything else stays pending. No
 * player action required, called once per `advanceDay`.
 *
 * `advanceDay` increments `state.day` only at the very end of its own body
 * (see `advanceDay.ts`'s final line), so every call to this function
 * during the day-N-to-N+1 transition still sees `state.day === N`, not the
 * day the player is about to land on. An order placed on day N carries
 * `arrivesOnDay: N + 1` - "in inventory starting day N + 1" - so it must
 * resolve during THIS call (the one that turns N into N + 1), not the next
 * one; comparing against `state.day + 1` (the day about to begin) rather
 * than `state.day` (the day that's ending) is what makes that true. The
 * same pre-increment `state.day`/`next.day` pattern governs listing
 * resolution (`advanceDay.ts`'s step 7, `resolvesOnDay`) and the
 * service-job deadline backstop (step 8b, `dueOnDay`).
 */
export function resolvePartDeliveries(state: GameState): PartDeliveryResult {
  const stillPending: PendingPartOrder[] = []
  const log: DayLogEntry[] = []
  let partInventory = state.partInventory

  for (const order of state.pendingPartOrders) {
    if (order.arrivesOnDay > state.day + 1) {
      stillPending.push(order)
      continue
    }
    const partInstance: PartInstance = {
      id: `part-${state.day}-${partInventory.length}`,
      partId: order.partId,
      band: 'mint',
      origin: makeMarketOrigin(state.day),
      // The order's own locked price (set at purchase time, not today's sticker
      // price) - a standard order's real cost.
      pricePaidYen: order.priceYen,
    }
    partInventory = [...partInventory, partInstance]
    log.push({
      type: 'part-delivered',
      orderId: order.id,
      partId: order.partId,
      partInstanceId: partInstance.id,
    })
  }

  if (log.length === 0) return { state, log: [] }
  return { state: { ...state, partInventory, pendingPartOrders: stillPending }, log }
}

export interface ScrapPartResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The only action available on a scrap `PartInstance` sitting in inventory
 * (put there by removing it from a car being replaced) - it can never be
 * reinstalled anywhere, so selling it for `scrapValueYen` is the only way to
 * recover any value from it. A no-op if the instance doesn't exist or isn't
 * actually scrap.
 *
 * A customer-owned part (pulled off a customer's car and awaiting close-out)
 * is locked from scrap too. It was never ours to sell; scrapping it is
 * refused. Ownership is read from the instance's own `origin` against every
 * active service job (`provenance.ts`), not a mutable tag.
 *
 * Labour is `energy.actionPoints.scrapPart` (0 in shipped content), gated on
 * `laborAvailable` when raised and spent into `energySpentToday`.
 */
export function resolveScrapPart(
  state: GameState,
  partInstanceId: string,
  context: SimContext,
  laborAvailable: number = Infinity,
): ScrapPartResult {
  const instance = state.partInventory.find((p) => p.id === partInstanceId)
  if (!instance || instance.band !== 'scrap') return { state, log: [] }
  if (state.activeServiceJobs.some((job) => isCustomerOriginPart(instance, job))) {
    return { state, log: [] }
  }
  const part = context.partsById[instance.partId]
  const taxonomyEntry = part ? context.partsTaxonomyById[part.carPartId] : undefined
  if (!part || !taxonomyEntry) return { state, log: [] }
  const laborSlotsUsed = context.economy.energy.actionPoints.scrapPart
  if (laborSlotsUsed > laborAvailable) return { state, log: [] }

  const priceYen = scrapValueYen(taxonomyEntry, context.economy, part.fitmentClass)
  const log: DayLogEntry[] = [{ type: 'part-scrapped', partInstanceId, priceYen }]
  return {
    state: reconcileStations(
      bookCashMovements(
        {
          ...state,
          cashYen: state.cashYen + priceYen,
          partInventory: state.partInventory.filter((p) => p.id !== partInstanceId),
          energySpentToday: state.energySpentToday + laborSlotsUsed,
        },
        log,
        context.economy,
      ),
    ),
    log,
  }
}

export interface SellPartResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The teardown game's donor economy: sell a used, non-scrap loose
 * `PartInstance` at `usedPartSaleValueYen` (bands.ts) - its catalogue price
 * plus whatever has been machined into it, scaled by the resale condition
 * curve and the used-part haircut. Instant, no labour - the counterpart to
 * `resolveScrapPart` for a part still worth more than scrap. Machining
 * travels with the part, so a bored block fetches a bored block's money over
 * the counter and not an ordinary one's.
 *
 * Refused (silent no-op) for a `scrap`-band instance (that's
 * `resolveScrapPart`'s route) and for a customer-owned tagged part while
 * its job is still active - it was never ours to sell, same ownership lock
 * `resolveScrapPart` enforces.
 */
export function resolveSellPart(
  state: GameState,
  partInstanceId: string,
  context: SimContext,
): SellPartResult {
  const instance = state.partInventory.find((p) => p.id === partInstanceId)
  if (!instance || instance.band === 'scrap') return { state, log: [] }
  if (state.activeServiceJobs.some((job) => isCustomerOriginPart(instance, job))) {
    return { state, log: [] }
  }
  const part = context.partsById[instance.partId]
  if (!part) return { state, log: [] }

  const priceYen = usedPartSaleValueYen(
    machinedPartPriceYen(instance, part, context.economy),
    instance.band,
    context.economy,
  )
  const log: DayLogEntry[] = [{ type: 'part-sold', partInstanceId, priceYen }]
  return {
    state: reconcileStations(
      bookCashMovements(
        {
          ...state,
          cashYen: state.cashYen + priceYen,
          partInventory: state.partInventory.filter((p) => p.id !== partInstanceId),
        },
        log,
        context.economy,
      ),
    ),
    log,
  }
}

// --- the two work stations -------------------------------------------------

/**
 * The two places a part is worked on, one room each: the bench on the workshop
 * floor, where a part is repaired, and the machine in the machine shop, where
 * it is machined. The warehouse (`GameState.partInventory`) holds parts and
 * does no work, so every piece of part-level work reads one of these.
 */
export type WorkStation = 'workbench' | 'machine'

/** The part on `station`, or `null` when it is clear. */
export function partIdOnStation(state: GameState, station: WorkStation): string | null {
  return station === 'workbench' ? state.workbenchPartId : state.machinePartId
}

/** The station `partInstanceId` is currently sitting on, or `null` when it is
 * on neither - the "a part is never on both stations" fact, on the read side. */
export function stationHoldingPart(state: GameState, partInstanceId: string): WorkStation | null {
  if (state.workbenchPartId === partInstanceId) return 'workbench'
  if (state.machinePartId === partInstanceId) return 'machine'
  return null
}

function withStation(
  state: GameState,
  station: WorkStation,
  partInstanceId: string | null,
): GameState {
  return station === 'workbench'
    ? { ...state, workbenchPartId: partInstanceId }
    : { ...state, machinePartId: partInstanceId }
}

export type PlaceOnStationGateReason =
  /** No such part in the warehouse - installed on a car, sold, or never there. */
  | 'not-found'
  /** Something is already on this station, and each holds one part. */
  | 'station-occupied'
  /** The part is on the other station; take it back before carrying it here. */
  | 'on-other-station'

/**
 * Why `partInstanceId` cannot be carried to `station` right now, or `null` when
 * nothing refuses it. The one predicate: the UI shows the same reason before the
 * click that `resolvePlaceOnStation` enforces after it. A part already on THIS
 * station is not refused - carrying it where it already is is a no-op, not an
 * error.
 */
export function placeOnStationGateReason(
  state: GameState,
  station: WorkStation,
  partInstanceId: string,
): PlaceOnStationGateReason | null {
  if (!state.partInventory.some((p) => p.id === partInstanceId)) return 'not-found'
  const held = stationHoldingPart(state, partInstanceId)
  if (held === station) return null
  if (held) return 'on-other-station'
  return partIdOnStation(state, station) === null ? null : 'station-occupied'
}

/**
 * Carry one warehouse part to `station`. Free and instant: no labour, no cash,
 * no day passes and nothing is logged, because the cost is the walk rather than
 * a number. Any refusal (`placeOnStationGateReason`) is a silent no-op with the
 * same state reference back.
 */
export function resolvePlaceOnStation(
  state: GameState,
  station: WorkStation,
  partInstanceId: string,
): GameState {
  if (placeOnStationGateReason(state, station, partInstanceId)) return state
  return withStation(state, station, partInstanceId)
}

/** Carry whatever is on `station` back to the warehouse - the mirror of
 * `resolvePlaceOnStation`, and free in the same way. A clear station is a
 * no-op. The part never left `partInventory`, so nothing but the station moves. */
export function resolveTakeFromStation(state: GameState, station: WorkStation): GameState {
  return partIdOnStation(state, station) === null ? state : withStation(state, station, null)
}

/**
 * Clears any station whose part is no longer in the warehouse - a part sold,
 * scrapped, fitted to a car, taken into an assembly, consumed by a body stage,
 * or returned to a customer at close-out leaves the station it was on. Called
 * at every site that removes from `partInventory`, so a station can never point
 * at a part that is not there and block the next one from being carried in. A
 * no-op (same state reference) when both stations are already honest, which is
 * every call but the handful that matter.
 */
export function reconcileStations(state: GameState): GameState {
  const gone = (partInstanceId: string | null): boolean =>
    partInstanceId !== null && !state.partInventory.some((p) => p.id === partInstanceId)
  const workbenchGone = gone(state.workbenchPartId)
  const machineGone = gone(state.machinePartId)
  if (!workbenchGone && !machineGone) return state
  return {
    ...state,
    workbenchPartId: workbenchGone ? null : state.workbenchPartId,
    machinePartId: machineGone ? null : state.machinePartId,
  }
}
