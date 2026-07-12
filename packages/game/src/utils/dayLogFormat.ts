import type { DayLogEntry } from '@midnight-garage/content'
import { formatYen } from './formatYen'
import { offerCopy } from './offerCopy'

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
      return `New ${entry.tier} auction catalog: ${entry.lotCount} lots`
    case 'auction-bid-placed':
      return `Bid ${formatYen(entry.maxBidYen)} on lot ${entry.lotId}`
    case 'auction-outbid':
      return `Outbid overnight on lot ${entry.lotId} - now ${formatYen(entry.newBidYen)}`
    case 'auction-bid-won':
      return `Won lot ${entry.lotId} for ${formatYen(entry.finalPriceYen)}`
    case 'auction-bid-lost':
      return `Lost lot ${entry.lotId} (went for ${formatYen(entry.winningPriceYen)})`
    case 'lot-bought-out':
      return `Bought out lot ${entry.lotId} for ${formatYen(entry.priceYen)}`
    case 'offer-received':
      return offerCopy(
        resolveBuyerName(entry.buyerId),
        resolveModelName(entry.modelId),
        entry.priceYen,
      )
    case 'car-sold': {
      const base = `Sold ${entry.carInstanceId} (${entry.channel}) for ${formatYen(entry.priceYen)}`
      switch (entry.saleQuality) {
        case 'concours':
          return `${base} - sold as a concours example, reputation +${entry.reputationDelta}`
        case 'clean':
          return `${base} - sold as a clean example, reputation +${entry.reputationDelta}`
        case 'lemon':
          return `${base} - sold as a lemon, reputation ${entry.reputationDelta}`
        default:
          return base
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
    case 'service-job-accepted':
      // Sprint 25 task 2: acceptance no longer places the car instantly, so
      // this reads as the customer's own promise, not a status update.
      return `Thanks - I'll drop it off first thing in the morning.`
    case 'service-job-completed':
      return `Service job paid ${formatYen(entry.payoutYen)} (+${entry.reputationGained} rep)`
    case 'service-job-failed':
      return `Service job failed (-${entry.reputationLost} rep)`
    case 'car-moved':
      return `Moved ${entry.carInstanceId} to ${entry.to}`
    case 'cars-swapped':
      return `Swapped ${entry.serviceCarId} and ${entry.parkingCarId}`
    case 'bay-purchased':
      return `Bought a ${entry.kind} bay for ${formatYen(entry.priceYen)}`
    case 'acquisition-blocked':
      return `${entry.kind} blocked - ${
        entry.reason === 'no-parking'
          ? 'no parking space'
          : entry.reason === 'no-cash'
            ? 'not enough cash'
            : 'equipment not owned'
      }`
    case 'equipment-purchased':
      return `Bought equipment ${entry.equipmentId} for ${formatYen(entry.priceYen)}`
  }
}
