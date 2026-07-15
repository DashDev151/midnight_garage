import type { DayLogEntry } from '@midnight-garage/content'
import { COMPONENT_DISPLAY_NAMES, TOOL_LINES, componentDisplayName } from '@midnight-garage/content'
import { formatYen, formatYenDelta } from './formatYen'
import { offerCopy } from './offerCopy'

/** `count noun` with an `s` on the noun unless the count is exactly 1 - the
 * one place count copy is pluralised, so "1 lots" can never come back
 * (Sprint 64 decision 2). Handles only regular `-s` plurals, which is every
 * count noun the day report uses. */
export function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Renders one DayLogEntry as a human-readable line for the event log.
 * `resolveModelName`/`resolveBuyerName` (both optional) turn a modelId/
 * buyerId into its display name; when absent, the raw id is shown.
 * Deliberately exhaustive over the discriminated union so a new DayLogEntry
 * type is a compile error here, not a silently-blank line.
 */
export function describeLogEntry(
  entry: DayLogEntry,
  resolveModelName: (modelId: string) => string = (id) => id,
  resolveBuyerName: (buyerId: string) => string = (id) => id,
): string {
  switch (entry.type) {
    case 'rent-paid':
      return `Rent paid: ${formatYen(entry.amountYen)}`
    case 'double-parking-fine':
      return `Double-parking fine (${entry.carInstanceId}): ${formatYen(entry.amountYen)}`
    case 'wage-paid':
      return `Wage paid to ${entry.staffId}: ${formatYen(entry.amountYen)}`
    case 'job-created':
      return `Job started (${entry.kind}) on ${entry.carInstanceId}`
    case 'job-progress':
      return `Job ${entry.jobId}: +${entry.laborSlotsSpent} labour`
    case 'job-completed':
      return `Job complete (${entry.kind}) on ${entry.carInstanceId}`
    case 'job-blocked':
      return `Job ${entry.jobId} blocked (${entry.reason})`
    case 'labor-overbooked':
      return `Labour overbooked: wanted ${entry.requestedSlots}, had ${entry.availableSlots}`
    case 'service-bay-income':
      return `Service bay income: ${formatYen(entry.amountYen)}`
    case 'market-heat-shift':
      return `Market heat: ${resolveModelName(entry.modelId)} ${entry.deltaPercent >= 0 ? '+' : ''}${entry.deltaPercent}%`
    case 'auction-catalog-refreshed':
      return `New ${entry.tier} auction catalog: ${pluralise(entry.lotCount, 'lot')}`
    case 'auction-bid-placed':
      return `Bid ${formatYen(entry.maxBidYen)} on lot ${entry.lotId}`
    case 'auction-outbid':
      return `Outbid overnight on the ${entry.year} ${resolveModelName(entry.modelId)} - now ${formatYen(entry.newBidYen)}`
    case 'auction-bid-won':
      return `Won the ${entry.year} ${resolveModelName(entry.modelId)} for ${formatYen(entry.finalPriceYen)}`
    case 'auction-bid-lost':
      return `Lost the ${entry.year} ${resolveModelName(entry.modelId)} (went for ${formatYen(entry.winningPriceYen)})`
    case 'lot-bought-out':
      return `Bought the ${entry.year} ${resolveModelName(entry.modelId)} for ${formatYen(entry.priceYen)}`
    case 'offer-received':
      return offerCopy(
        resolveBuyerName(entry.buyerId),
        resolveModelName(entry.modelId),
        entry.priceYen,
      )
    case 'offer-rejected':
      return `Turned down ${formatYen(entry.priceYen)} for the ${resolveModelName(entry.modelId)}`
    case 'car-sold': {
      // Sprint 42: profit reads before the reputation clause, once, so it
      // shows regardless of which quality branch (or none) fires below.
      const base = `Sold ${entry.carInstanceId} (${entry.channel}) for ${formatYen(entry.priceYen)}`
      const withProfit =
        entry.profitYen !== undefined ? `${base}, profit ${formatYenDelta(entry.profitYen)}` : base
      switch (entry.saleQuality) {
        case 'concours':
          return `${withProfit} - sold as a concours example, reputation +${entry.reputationDelta}`
        case 'clean':
          return `${withProfit} - sold as a clean example, reputation +${entry.reputationDelta}`
        case 'lemon':
          return `${withProfit} - sold as a lemon, reputation ${entry.reputationDelta}`
        default:
          return withProfit
      }
    }
    case 'part-bought':
      return `Bought ${entry.partId} for ${formatYen(entry.priceYen)}`
    case 'part-ordered':
      return `Ordered ${entry.partId} for ${formatYen(entry.priceYen)} (arrives day ${entry.arrivesOnDay})`
    case 'part-delivered':
      return `Delivery arrived: ${entry.partId}`
    case 'part-scrapped':
      return `Scrapped a part for ${formatYen(entry.priceYen)}`
    case 'part-sold':
      return `Sold a part for ${formatYen(entry.priceYen)}`
    case 'part-reconditioned':
      return `Reconditioned a part to ${entry.band}`
    case 'part-removed':
      return `Removed ${entry.carPartId} from ${entry.carInstanceId}`
    case 'service-job-accepted':
      // Sprint 25 task 2: acceptance no longer places the car instantly, so
      // this reads as the customer's own promise, not a status update.
      return `Thanks - I'll drop it off first thing in the morning.`
    case 'service-job-completed':
      return `Service job paid ${formatYen(entry.payoutYen)} (+${entry.reputationGained} rep), profit ${formatYenDelta(entry.netProfitYen)}`
    case 'service-job-failed':
      return `Service job failed (-${entry.reputationLost} rep), sunk ${formatYen(entry.repairCostYen + entry.partsCostYen)}`
    case 'car-moved':
      return `Moved ${entry.carInstanceId} to ${entry.to}`
    case 'cars-swapped':
      return `Swapped ${entry.serviceCarId} and ${entry.parkingCarId}`
    case 'bay-purchased':
      return `Bought a ${entry.kind} bay for ${formatYen(entry.priceYen)}`
    case 'acquisition-blocked': {
      const reasonText =
        entry.reason === 'no-space'
          ? 'no room anywhere - parking, every bay, and the double-parking spot are all full'
          : entry.reason === 'no-cash'
            ? 'not enough cash'
            : entry.reason === 'technique'
              ? 'needs a technique not yet unlocked'
              : 'needs a tool upgrade'
      return `${entry.kind} blocked - ${reasonText}`
    }
    case 'equipment-purchased':
      return `Bought equipment ${entry.equipmentId} for ${formatYen(entry.priceYen)}`
    case 'tool-upgraded':
      return `Upgraded ${componentDisplayName(entry.componentId, COMPONENT_DISPLAY_NAMES)} to ${
        TOOL_LINES[entry.componentId].tiers[entry.toTier - 1]!.displayName
      } for ${formatYen(entry.priceYen)}`
    case 'machine-listed':
      return `Classifieds: ${
        TOOL_LINES[entry.componentId].tiers[entry.tier - 1]!.displayName
      } listed, ${formatYen(entry.priceYen)}`
    case 'shell-scrapped': {
      const withParts =
        entry.carPartIds.length > 0
          ? `, along with ${pluralise(entry.carPartIds.length, 'part')}`
          : ''
      return `Scrapped the ${resolveModelName(entry.modelId)}'s shell for ${formatYen(entry.priceYen)}${withParts}`
    }
  }
}

/**
 * Sprint 64 (playtest pass-2 item 13): the morning report's structured view,
 * derived entirely in the game layer from a day's `DayLogEntry[]` (the sim is
 * untouched). Winning a car opens the report as a celebration, not a red
 * number; the recurring money is summed into one honest line; the meaningful
 * shop/market lines are ordered (outbid alerts first, they're actionable);
 * and the pure noise (heat drift, catalogue refreshes, per-tick labour) is
 * aggregated into a couple of quiet, correctly-pluralised lines instead of
 * flooding the list.
 */
export interface DayReportWin {
  modelName: string
  year: number
  priceYen: number
  /** `won` = a contested auction win, `bought` = an instant buyout. */
  kind: 'won' | 'bought'
}

export interface DayReportMoney {
  /** Money in: sales, service-job payouts, passive bay income, scrapped/sold
   * parts, and a scrapped shell. */
  earnedYen: number
  /** Money out on acquiring cars: auction wins + buyouts. */
  onCarsYen: number
  /** Recurring costs: rent, wages, double-parking fines. */
  billsYen: number
}

export interface DayReportView {
  wins: DayReportWin[]
  money: DayReportMoney
  /** The meaningful, individually-worth-reading lines, outbid alerts first. */
  notable: string[]
  /** Aggregated quiet lines - grammar-correct, low decision value. */
  noise: string[]
}

/** Types that become celebration cards, not list lines. */
const WIN_TYPES = new Set<DayLogEntry['type']>(['auction-bid-won', 'lot-bought-out'])
/** Types represented in the money split only - no individual list line. */
const MONEY_ONLY_TYPES = new Set<DayLogEntry['type']>([
  'rent-paid',
  'wage-paid',
  'service-bay-income',
])
/** Types folded into aggregated noise lines rather than shown one-per-entry. */
const NOISE_TYPES = new Set<DayLogEntry['type']>([
  'market-heat-shift',
  'auction-catalog-refreshed',
  'job-progress',
])

export function classifyDayReport(
  entries: readonly DayLogEntry[],
  resolveModelName: (modelId: string) => string = (id) => id,
  resolveBuyerName: (buyerId: string) => string = (id) => id,
): DayReportView {
  const wins: DayReportWin[] = []
  const money: DayReportMoney = { earnedYen: 0, onCarsYen: 0, billsYen: 0 }
  const outbid: string[] = []
  const rest: string[] = []
  let heatShifts = 0
  let labourTicked = 0

  for (const entry of entries) {
    switch (entry.type) {
      case 'auction-bid-won':
        wins.push({
          modelName: resolveModelName(entry.modelId),
          year: entry.year,
          priceYen: entry.finalPriceYen,
          kind: 'won',
        })
        money.onCarsYen += entry.finalPriceYen
        break
      case 'lot-bought-out':
        wins.push({
          modelName: resolveModelName(entry.modelId),
          year: entry.year,
          priceYen: entry.priceYen,
          kind: 'bought',
        })
        money.onCarsYen += entry.priceYen
        break
      case 'car-sold':
        money.earnedYen += entry.priceYen
        rest.push(describeLogEntry(entry, resolveModelName, resolveBuyerName))
        break
      case 'service-job-completed':
        money.earnedYen += entry.payoutYen
        rest.push(describeLogEntry(entry, resolveModelName, resolveBuyerName))
        break
      case 'part-scrapped':
      case 'part-sold':
      case 'shell-scrapped':
        money.earnedYen += entry.priceYen
        rest.push(describeLogEntry(entry, resolveModelName, resolveBuyerName))
        break
      case 'service-bay-income':
        money.earnedYen += entry.amountYen
        break
      case 'rent-paid':
      case 'wage-paid':
        money.billsYen += Math.abs(entry.amountYen)
        break
      case 'double-parking-fine':
        money.billsYen += Math.abs(entry.amountYen)
        rest.push(describeLogEntry(entry, resolveModelName, resolveBuyerName))
        break
      case 'auction-outbid':
        outbid.push(describeLogEntry(entry, resolveModelName, resolveBuyerName))
        break
      // Sprint 69 item 5: swallowed on purpose. The sim still logs the entry
      // (the day log and the harness both read it); the morning report simply
      // stops narrating inventory churn the player can go and look at.
      case 'auction-catalog-refreshed':
        break
      case 'market-heat-shift':
        heatShifts += 1
        break
      case 'job-progress':
        labourTicked += entry.laborSlotsSpent
        break
      default:
        if (
          !WIN_TYPES.has(entry.type) &&
          !MONEY_ONLY_TYPES.has(entry.type) &&
          !NOISE_TYPES.has(entry.type)
        ) {
          rest.push(describeLogEntry(entry, resolveModelName, resolveBuyerName))
        }
    }
  }

  const noise: string[] = []
  if (heatShifts > 0) noise.push(`Market prices moved on ${pluralise(heatShifts, 'car')}`)
  if (labourTicked > 0) noise.push(`${pluralise(labourTicked, 'labour slot')} spent in the shop`)

  return { wins, money, notable: [...outbid, ...rest], noise }
}
