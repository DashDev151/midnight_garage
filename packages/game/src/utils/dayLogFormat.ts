import type { DayLogEntry } from '@midnight-garage/content'
import {
  COMPONENT_DISPLAY_NAMES,
  PARTS,
  TOOL_LINES,
  componentDisplayName,
  titleCaseFromSlug,
} from '@midnight-garage/content'
import { formatYen, formatYenDelta } from './formatYen'
import { offerCopy } from './offerCopy'

/** Catalogue part id -> its player-facing "Brand Name" label; internal ids
 * (e.g. `shitbox-stock-tyres`) never reach the day report. */
const PART_LABELS = new Map(PARTS.map((p) => [p.id, `${p.brand} ${p.name}`]))

function partLabel(partId: string): string {
  return PART_LABELS.get(partId) ?? partId
}

/** `count noun` with an `s` on the noun unless the count is exactly 1 - the
 * one place count copy is pluralised, so "1 lots" can never come back.
 * Handles only regular `-s` plurals, which is every count noun the day report uses. */
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
    case 'contract-income':
      return `Fleet contract income: ${formatYen(entry.amountYen)}`
    case 'market-heat-shift':
      return `Market heat: ${resolveModelName(entry.modelId)} ${entry.deltaPercent >= 0 ? '+' : ''}${entry.deltaPercent}%`
    case 'auction-catalog-refreshed':
      return `New ${entry.tier} auction catalog: ${pluralise(entry.lotCount, 'lot')}`
    case 'auction-hammer-won':
      return `Won the ${entry.year} ${resolveModelName(entry.modelId)} for ${formatYen(entry.priceYen)}`
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
      // Profit reads before the reputation clause, once, so it shows
      // regardless of which quality branch (or none) fires below.
      const base = `Sold ${entry.carInstanceId} (${entry.channel}) for ${formatYen(entry.priceYen)}`
      const withProfit =
        entry.profitYen !== undefined ? `${base}, profit ${formatYenDelta(entry.profitYen)}` : base
      const withQuality = (() => {
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
      })()
      // One line, appended, no popup - set only when the car still carried an
      // unresolved symptom.
      return entry.saleRevealLine ? `${withQuality} ${entry.saleRevealLine}` : withQuality
    }
    case 'part-bought':
      return `Bought ${partLabel(entry.partId)} for ${formatYen(entry.priceYen)}`
    case 'part-ordered':
      return `Ordered ${partLabel(entry.partId)} for ${formatYen(entry.priceYen)} (arrives day ${entry.arrivesOnDay})`
    case 'part-delivered':
      return `Delivery arrived: ${partLabel(entry.partId)}`
    case 'part-scrapped':
      return `Scrapped a part for ${formatYen(entry.priceYen)}`
    case 'part-sold':
      return `Sold a part for ${formatYen(entry.priceYen)}`
    case 'part-reconditioned':
      return `Reconditioned a part to ${entry.band}`
    case 'part-removed': {
      const base = `Removed ${entry.carPartId} from ${entry.carInstanceId}`
      // Uninstall reveals truth - this removal collapsed one of the car's
      // symptoms to exactly one remaining cause.
      return entry.revealedCauseId
        ? `${base}. Opened it up: ${titleCaseFromSlug(entry.revealedCauseId)}.`
        : base
    }
    case 'service-job-accepted':
      // Acceptance no longer places the car instantly, so this reads as the
      // customer's own promise, not a status update.
      return `Thanks - I'll drop it off first thing in the morning.`
    case 'service-job-completed':
      return `Service job paid ${formatYen(entry.payoutYen)} (+${entry.reputationGained} rep), profit ${formatYenDelta(entry.netProfitYen)}`
    case 'service-job-failed':
      return `Service job failed (-${entry.reputationLost} rep), sunk ${formatYen(entry.repairCostYen + entry.partsCostYen)}`
    case 'service-parts-returned':
      return `Returned with the car: ${entry.parts.join(', ')}`
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
    case 'inspection-visit':
      return `Inspection visit at the ${entry.tier} yard: ${formatYen(entry.feeYen)}, ${entry.minutesGranted} minutes`
    case 'car-workup':
      return `Full workup on ${entry.carInstanceId} - every symptom's cause confirmed`
    case 'mission-accepted':
      return `Mission accepted`
    case 'mission-delivered': {
      const base = `Mission delivered: ${formatYen(entry.payoutYen)}`
      const withTip = entry.tipYen > 0 ? `${base} + ${formatYen(entry.tipYen)} tip` : base
      return `${withTip}, +${entry.reputationGained} rep`
    }
    case 'staff-ads-refreshed':
      return `New calls for the shop: ${entry.count}`
    case 'staff-hired':
      return entry.introFeeYen > 0
        ? `Took ${entry.displayName} on at ${formatYen(entry.weeklyWageYen)}/week (${formatYen(entry.introFeeYen)} to sign)`
        : `Took ${entry.displayName} on at ${formatYen(entry.weeklyWageYen)}/week`
    case 'staff-dismissed':
      return `Let ${entry.displayName} go`
  }
}

/**
 * The morning report's structured view, derived entirely in the game layer from
 * a day's `DayLogEntry[]`. Winning a car opens the report as a celebration, not
 * a red number; the recurring money is summed into one honest line; and noise
 * (heat drift, catalogue refreshes, per-tick labour) is aggregated into quiet,
 * correctly-pluralised lines instead of flooding the list.
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
  /** The meaningful, individually-worth-reading lines. */
  notable: string[]
  /** Aggregated quiet lines - grammar-correct, low decision value. */
  noise: string[]
}

/** Types that become celebration cards, not list lines. */
const WIN_TYPES = new Set<DayLogEntry['type']>(['auction-hammer-won', 'lot-bought-out'])
/** Types represented in the money split only - no individual list line. */
const MONEY_ONLY_TYPES = new Set<DayLogEntry['type']>(['rent-paid', 'wage-paid', 'contract-income'])
/** Types folded into aggregated noise lines rather than shown one-per-entry. */
const NOISE_TYPES = new Set<DayLogEntry['type']>([
  'market-heat-shift',
  'auction-catalog-refreshed',
  'job-progress',
  // The weekly job-ad refresh is board churn the player reads on the Staff
  // Office, same treatment as an auction-catalog refresh.
  'staff-ads-refreshed',
])

export function classifyDayReport(
  entries: readonly DayLogEntry[],
  resolveModelName: (modelId: string) => string = (id) => id,
  resolveBuyerName: (buyerId: string) => string = (id) => id,
): DayReportView {
  const wins: DayReportWin[] = []
  const money: DayReportMoney = { earnedYen: 0, onCarsYen: 0, billsYen: 0 }
  const rest: string[] = []
  let heatShifts = 0
  let labourTicked = 0

  for (const entry of entries) {
    switch (entry.type) {
      case 'auction-hammer-won':
        wins.push({
          modelName: resolveModelName(entry.modelId),
          year: entry.year,
          priceYen: entry.priceYen,
          kind: 'won',
        })
        money.onCarsYen += entry.priceYen
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
      case 'contract-income':
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
      // Swallowed on purpose. The sim still logs the entry (the day log and the
      // harness both read it); the morning report simply stops narrating
      // inventory churn the player can go and look at.
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
  // labourTicked is an integer labour point value, not whole slots.
  if (labourTicked > 0) noise.push(`${labourTicked} labour spent in the shop`)

  return { wins, money, notable: rest, noise }
}
