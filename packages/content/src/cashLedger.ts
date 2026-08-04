import type { DayLogEntry, FinanceWeek } from './gameState'

/**
 * The five lines every yen the shop moves lands on, exactly one of them.
 * `income` is money in; the other four are money out, split so the figures
 * stay readable: what went on cars, what went on stock sitting on the shelf,
 * what it costs to keep the doors open, and what was put into the shop
 * itself.
 */
export const CASH_BUCKETS = ['income', 'onCars', 'stock', 'running', 'investment'] as const

export type CashBucket = (typeof CASH_BUCKETS)[number]

/** One classified cash movement. `amountYen` is a magnitude, never a signed
 * delta - the bucket already says which way the money went. */
export interface CashMovement {
  bucket: CashBucket
  amountYen: number
}

/**
 * Which line a day-log entry's money belongs on, or `null` for an entry that
 * moves no cash.
 *
 * This is the single enumeration of the attribution law stated in
 * `CarLedgerSchema`'s doc comment: a cost attributes to a car when it is
 * charged FOR that car, and accrues to the business when it is not. Nothing
 * else may decide a bucket; the weekly cost sheet and the morning report both
 * read this one function, so the two surfaces can never drift apart.
 *
 * Deliberately exhaustive over the discriminated union, like
 * `describeLogEntry`: a new `DayLogEntry` type is a compile error here rather
 * than a yen that quietly falls out of the week's arithmetic.
 *
 * Four entries need a word. `job-created` carries the whole banded-repair
 * charge for both an on-car repair and a bench recondition, and its `kind` is
 * what separates a car cost from stock. `part-reconditioned` carries no
 * amount on purpose: the recondition was already charged and booked when its
 * job opened, which may have been days earlier. `part-machined` moves no
 * money at any point: the tooling was bought once as shop investment, and an
 * operation costs labour and nothing else after that. `body-materials-used`
 * likewise moves no money at the moment it fires: the tin it draws from was
 * paid for when it was bought (`consumable-bought`, which DOES move money),
 * so drawing it down a second time would double-charge the same yen.
 */
export function cashMovementFor(entry: DayLogEntry): CashMovement | null {
  switch (entry.type) {
    // Money in.
    case 'car-sold':
      return { bucket: 'income', amountYen: entry.priceYen }
    case 'service-job-completed':
      return { bucket: 'income', amountYen: entry.payoutYen }
    case 'mission-delivered':
      return { bucket: 'income', amountYen: entry.payoutYen + entry.tipYen }
    case 'scene-commission-delivered':
      return { bucket: 'income', amountYen: entry.payoutYen }
    case 'contract-income':
      return { bucket: 'income', amountYen: entry.amountYen }
    case 'part-sold':
    case 'part-scrapped':
    case 'shell-scrapped':
      return { bucket: 'income', amountYen: entry.priceYen }

    // Money out, on a named car.
    case 'auction-hammer-won':
    case 'lot-bought-out':
      return { bucket: 'onCars', amountYen: entry.priceYen }
    case 'car-listed':
      return { bucket: 'onCars', amountYen: entry.feeYen }
    case 'job-created':
      if (entry.costYen === undefined) return null
      return {
        bucket: entry.kind === 'recondition-part' ? 'stock' : 'onCars',
        amountYen: entry.costYen,
      }

    // Money out, on stock that is nobody's car yet.
    case 'part-bought':
    case 'part-ordered':
    case 'consumable-bought':
      return { bucket: 'stock', amountYen: entry.priceYen }

    // Money out, on keeping the doors open. Rent and wages are stored as
    // negative deltas; every other running charge is stored as a magnitude.
    case 'rent-paid':
    case 'wage-paid':
      return { bucket: 'running', amountYen: Math.abs(entry.amountYen) }
    case 'double-parking-fine':
      return { bucket: 'running', amountYen: entry.amountYen }
    case 'machine-hired':
    case 'dyno-hired':
    case 'coffee-bought':
      return { bucket: 'running', amountYen: entry.priceYen }
    case 'auction-attended':
      return { bucket: 'running', amountYen: entry.feeYen }
    case 'inspection-visit':
      return { bucket: 'running', amountYen: entry.feeYen }
    case 'staff-hired':
      return { bucket: 'running', amountYen: entry.introFeeYen }

    // Money out, into the shop itself.
    case 'bay-purchased':
    case 'tool-upgraded':
    case 'dyno-bought':
    case 'equipment-purchased':
      return { bucket: 'investment', amountYen: entry.priceYen }

    // Everything else records something that happened without money moving,
    // or repeats a charge already booked at the entry that made it.
    case 'job-progress':
    case 'job-completed':
    case 'job-blocked':
    case 'labor-overbooked':
    case 'market-heat-shift':
    case 'auction-catalog-refreshed':
    case 'service-job-accepted':
    case 'service-job-failed':
    case 'service-parts-returned':
    case 'offer-received':
    case 'offer-rejected':
    case 'part-delivered':
    case 'part-reconditioned':
    case 'part-machined':
    case 'part-removed':
    case 'body-materials-used':
    case 'car-moved':
    case 'cars-swapped':
    case 'acquisition-blocked':
    case 'machine-listed':
    case 'car-workup':
    case 'mission-accepted':
    case 'scene-commission-accepted':
    case 'staff-ads-refreshed':
    case 'staff-dismissed':
      return null
  }
}

/** A week's net cash movement: what came in, less everything that went out.
 * The figure the shop's own bank balance has to agree with, to the yen. */
export function netCashYen(week: FinanceWeek): number {
  return week.incomeYen - (week.onCarsYen + week.stockYen + week.runningYen + week.investmentYen)
}

/** A week that has seen no money at all - the starting point every accumulated
 * week is folded onto, and what an unreported week reads as. */
export const EMPTY_FINANCE_WEEK: FinanceWeek = {
  incomeYen: 0,
  onCarsYen: 0,
  stockYen: 0,
  runningYen: 0,
  investmentYen: 0,
}

/** Which `FinanceWeek` field each bucket totals into - the one place the
 * bucket names and the stored field names are tied together. */
export const FINANCE_WEEK_FIELD_BY_BUCKET: Record<CashBucket, keyof FinanceWeek> = {
  income: 'incomeYen',
  onCars: 'onCarsYen',
  stock: 'stockYen',
  running: 'runningYen',
  investment: 'investmentYen',
}

/** Folds one classified movement onto a week's totals. Pure: returns a new
 * record, never mutates the one handed in. */
export function addCashMovement(week: FinanceWeek, movement: CashMovement): FinanceWeek {
  const field = FINANCE_WEEK_FIELD_BY_BUCKET[movement.bucket]
  return { ...week, [field]: week[field] + movement.amountYen }
}
