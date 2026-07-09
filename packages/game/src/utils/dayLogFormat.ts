import type { DayLogEntry } from '@midnight-garage/content'
import { formatYen } from './formatYen'

/**
 * Renders one DayLogEntry as a human-readable line for the event log.
 * `resolveModelName` (optional) turns a modelId into its Naming-Layer
 * display name; when absent, the raw id is shown. Deliberately exhaustive
 * over the discriminated union so a new DayLogEntry type is a compile
 * error here, not a silently-blank line.
 */
export function describeLogEntry(
  entry: DayLogEntry,
  resolveModelName: (modelId: string) => string = (id) => id,
): string {
  switch (entry.type) {
    case 'rent-paid':
      return `Rent paid: ${formatYen(entry.amountYen)}`
    case 'wage-paid':
      return `Wage paid to ${entry.staffId}: ${formatYen(entry.amountYen)}`
    case 'job-created':
      return `Job started (${entry.kind}) on ${entry.carInstanceId}`
    case 'job-progress':
      return `Job ${entry.jobId}: +${entry.laborSlotsSpent} labor`
    case 'job-completed':
      return `Job complete (${entry.kind}) on ${entry.carInstanceId}`
    case 'job-blocked':
      return `Job ${entry.jobId} blocked (${entry.reason})`
    case 'labor-overbooked':
      return `Labor overbooked: wanted ${entry.requestedSlots}, had ${entry.availableSlots}`
    case 'service-bay-income':
      return `Service bay income: ${formatYen(entry.amountYen)}`
    case 'market-heat-shift':
      return `Market heat: ${resolveModelName(entry.modelId)} ${entry.deltaPercent >= 0 ? '+' : ''}${entry.deltaPercent}%`
    case 'auction-catalog-refreshed':
      return `New ${entry.tier} auction catalog: ${entry.lotCount} lots`
    case 'lot-inspected':
      return `Inspected lot ${entry.lotId}`
    case 'auction-bid-won':
      return `Won lot ${entry.lotId} for ${formatYen(entry.finalPriceYen)}`
    case 'auction-bid-lost':
      return `Lost lot ${entry.lotId} (went for ${formatYen(entry.winningPriceYen)})`
    case 'lot-bought-out':
      return `Bought out lot ${entry.lotId} for ${formatYen(entry.priceYen)}`
    case 'listing-created':
      return `Listed ${entry.carInstanceId} at ${formatYen(entry.askingPriceYen)} (resolves day ${entry.resolvesOnDay})`
    case 'car-sold':
      return `Sold ${entry.carInstanceId} (${entry.channel}) for ${formatYen(entry.priceYen)}`
    case 'part-bought':
      return `Bought ${entry.partId} for ${formatYen(entry.priceYen)}`
    case 'part-ordered':
      return `Ordered ${entry.partId} for ${formatYen(entry.priceYen)} (arrives day ${entry.arrivesOnDay})`
    case 'part-delivered':
      return `Delivery arrived: ${entry.partId}`
    case 'service-job-accepted':
      return `Service job accepted — customer car ${entry.carInstanceId} in the shop`
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
      return `${entry.kind} blocked — ${entry.reason === 'no-parking' ? 'no parking space' : 'equipment not owned'}`
    case 'equipment-purchased':
      return `Bought equipment ${entry.equipmentId} for ${formatYen(entry.priceYen)}`
  }
}
