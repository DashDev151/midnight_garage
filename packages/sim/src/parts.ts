import {
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
import { scrapValueYen } from './bands'
import { PARTS_EXPRESS_SURCHARGE_FRACTION, PARTS_STANDARD_DELIVERY_DAYS } from './constants'
import type { SimContext } from './context'

export type DeliverySpeed = 'standard' | 'express'

/** A grade's position on the stock -> street -> sport -> race ladder, read
 * straight from the schema so there is exactly one source of grade order in
 * the codebase (mirrors `calendar.ts`'s `reputationTierIndex`). */
function gradeIndex(grade: Grade): number {
  return GradeSchema.options.indexOf(grade)
}

/** Whether `grade` meets or exceeds `min` on the stock/street/sport/race
 * ladder - the install-task completion and payout-derivation check
 * (Sprint 29: "at least this grade," never an exact-only match). */
export function gradeAtLeast(grade: Grade, min: Grade): boolean {
  return gradeIndex(grade) >= gradeIndex(min)
}

/**
 * Sprint 24 fix 2: the one real fit rule (right group slot + every required
 * tag present on the model) - previously only enforced by the UI's own
 * inline copy (`gameStore.installablePartsFor`), so the sim itself (a
 * staged action, or a bot's queued install job) never actually validated
 * fit and would install any part onto any component if asked. Sim-level
 * source of truth now; the UI predicate calls this instead of duplicating it.
 *
 * Sprint 26: a catalog part's group is derived from `carPartId` via the
 * taxonomy (decision 13's "bridge" - a part addresses one specific
 * `CarPartId`, but staging/jobs still address the 6-way group it belongs
 * to), not stored redundantly on `Part` itself. Note: this only checks
 * catalog-level fit (tags/group); a `PartInstance`'s own `band` (scrap is
 * universally uninstallable, decision 6) is checked separately by the
 * caller (`jobs.ts`'s `installFitGate`), since this function only ever sees
 * the catalog `Part`, never a specific owned instance.
 *
 * Sprint 28: an optional `carPartId` narrows the check from "fits somewhere
 * in this group" to "addresses this exact part" - the per-part Replace
 * drawer's own fit predicate. Omitted, this is exactly the pre-Sprint-28
 * group-level check.
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
    taxonomyEntry.group === componentId &&
    (!carPartId || part.carPartId === carPartId) &&
    part.requiredTags.every((tag) => model.tags.includes(tag))
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
 * `arrivesOnDay` (see `resolvePartDeliveries` below) - the same "commit now,
 * resolve later" shape a standard-delivery order has always had.
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
    band: 'mint',
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
 * Day-boundary resolution for standard-delivery orders (Sprint 14) - the
 * same "due today resolves, the rest stays pending" shape every other
 * day-boundary resolve-loop in `advanceDay` uses: orders due today become
 * real `PartInstance`s in `partInventory`; everything else stays pending. No
 * player action required, called once per `advanceDay`.
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
      band: 'mint',
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

export interface ScrapPartResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Sprint 26 decision 6: the only action available on a scrap `PartInstance`
 * sitting in inventory (put there by removing it from a car being
 * replaced) - it can never be reinstalled anywhere (`installFitGate`
 * rejects it universally), so selling it for `scrapValueYen` ("pennies on
 * the yen" against its stock-equivalent replacement cost) is the only way
 * to recover any value from it. A no-op if the instance doesn't exist or
 * isn't actually scrap.
 *
 * Sprint 35 decision 3: a customer-owned part (`customerJobId` set - pulled
 * off a customer's car and awaiting close-out) is locked from scrap too. It
 * was never ours to sell; scrapping it is refused (a silent no-op here, gated
 * with a visible reason in the UI). This is the sell/scrap half of the tag's
 * two locks - the other being that it can only leave via close-out
 * reconciliation (`resolveServiceJob`), never our hands.
 */
export function resolveScrapPart(
  state: GameState,
  partInstanceId: string,
  context: SimContext,
): ScrapPartResult {
  const instance = state.partInventory.find((p) => p.id === partInstanceId)
  if (!instance || instance.band !== 'scrap' || instance.customerJobId) return { state, log: [] }
  const part = context.partsById[instance.partId]
  const taxonomyEntry = part ? context.partsTaxonomyById[part.carPartId] : undefined
  if (!taxonomyEntry) return { state, log: [] }

  const priceYen = scrapValueYen(taxonomyEntry, context.economy)
  return {
    state: {
      ...state,
      cashYen: state.cashYen + priceYen,
      partInventory: state.partInventory.filter((p) => p.id !== partInstanceId),
    },
    log: [{ type: 'part-scrapped', partInstanceId, priceYen }],
  }
}
