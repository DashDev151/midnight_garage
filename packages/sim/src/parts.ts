import type {
  CarModel,
  ComponentId,
  DayLogEntry,
  GameState,
  Part,
  PartInstance,
  PendingPartOrder,
} from '@midnight-garage/content'
import { PARTS_EXPRESS_SURCHARGE_FRACTION, PARTS_STANDARD_DELIVERY_DAYS } from './constants'
import type { SimContext } from './context'

export type DeliverySpeed = 'standard' | 'express'

/**
 * Sprint 24 fix 2: the one real fit rule (right component slot + every
 * required tag present on the model) - previously only enforced by the UI's
 * own inline copy (`gameStore.installablePartsFor`), so the sim itself (a
 * staged action, or a bot's queued install job) never actually validated
 * fit and would install any part onto any component if asked. Sim-level
 * source of truth now; the UI predicate calls this instead of duplicating it.
 */
export function partFitsCar(part: Part, model: CarModel, componentId: ComponentId): boolean {
  return (
    part.componentId === componentId && part.requiredTags.every((tag) => model.tags.includes(tag))
  )
}

export interface BuyPartResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The buy-part resolver (Sprint 11, split by delivery speed in Sprint 14).
 * Express pays a surcharge and lands in inventory the moment it's bought -
 * installable immediately, exactly like every purchase before this sprint.
 * Standard pays sticker price and creates a `PendingPartOrder` instead; the
 * real `PartInstance` only appears once `advanceDay`'s delivery step reaches
 * `arrivesOnDay` (see `resolvePartDeliveries` below), mirroring how
 * `resolveListForSale` locks in a price now and resolves the sale later.
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
    return {
      state: {
        ...state,
        cashYen: state.cashYen - part.priceYen,
        pendingPartOrders: [...state.pendingPartOrders, order],
      },
      log: [
        {
          type: 'part-ordered',
          orderId: order.id,
          partId: part.id,
          priceYen: order.priceYen,
          arrivesOnDay: order.arrivesOnDay,
        },
      ],
    }
  }

  const priceYen = Math.round(part.priceYen * (1 + PARTS_EXPRESS_SURCHARGE_FRACTION))
  if (state.cashYen < priceYen) return { state, log: [] }

  const partInstance: PartInstance = {
    id: `part-${state.day}-${state.partInventory.length}`,
    partId: part.id,
    conditionPercent: 100,
    genuinePeriod: false,
  }
  return {
    state: {
      ...state,
      cashYen: state.cashYen - priceYen,
      partInventory: [...state.partInventory, partInstance],
    },
    log: [
      {
        type: 'part-bought',
        partId: part.id,
        partInstanceId: partInstance.id,
        priceYen,
      },
    ],
  }
}

export interface PartDeliveryResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Day-boundary resolution for standard-delivery orders (Sprint 14) - modeled
 * directly on `advanceDay`'s existing `activeListings` resolve-loop: orders
 * due today become real `PartInstance`s in `partInventory`; everything else
 * stays pending. No player action required, called once per `advanceDay`.
 *
 * Sprint 25 task 3 (off-by-one fix): `advanceDay` increments `state.day`
 * only at the very end of its own body (see `advanceDay.ts`'s final line),
 * so every call to this function during the day-N-to-N+1 transition still
 * sees `state.day === N`, not the day the player is about to land on. An
 * order placed on day N carries `arrivesOnDay: N + 1` - "in inventory
 * starting day N + 1" - so it must resolve during THIS call (the one that
 * turns N into N + 1), not the next one; comparing against `state.day + 1`
 * (the day about to begin) rather than `state.day` (the day that's ending)
 * is what makes that true. Before this fix the comparison used the ending
 * day, so a "1 day" order only became visible after TWO End Day clicks
 * instead of one. The same pre-increment `state.day`/`next.day` pattern
 * governs listing resolution (`advanceDay.ts`'s step 7, `resolvesOnDay`) and
 * the service-job deadline backstop (step 8b, `dueOnDay`) - both are
 * unaffected by this fix and correct to leave alone (see the comments at
 * those two sites for why).
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
      conditionPercent: 100,
      genuinePeriod: false,
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
