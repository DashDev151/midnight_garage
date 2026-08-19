import type { CarPartId, CashBucket, ComponentId, DayLogEntry } from '@midnight-garage/content'
import {
  COMPONENT_DISPLAY_NAMES,
  CONSUMABLE_TINS,
  ComponentIdSchema,
  ECONOMY,
  PAINT_COLOURS,
  PARTS,
  PARTS_TAXONOMY,
  TOOL_LINES,
  TOOL_SHOPS,
  cashMovementFor,
  componentDisplayName,
  titleCaseFromSlug,
} from '@midnight-garage/content'
import { formatYen, formatYenDelta } from './formatYen'
import { offerCopy } from './offerCopy'
import { SELLING_CHANNEL_LABELS } from './sellingChannelLabels'

/** Catalogue part id -> its player-facing "Brand Name" label; internal ids
 * (e.g. `shitbox-stock-tyres`) never reach the day report. */
const PART_LABELS = new Map(PARTS.map((p) => [p.id, `${p.brand} ${p.name}`]))

function partLabel(partId: string): string {
  return PART_LABELS.get(partId) ?? partId
}

/** `CarPartId` -> its taxonomy display name - the knowledge model's
 * elimination line reads a real part name ("The intake is clean.") rather
 * than the internal slot id. */
const CAR_PART_LABELS = new Map(PARTS_TAXONOMY.map((entry) => [entry.id, entry.displayName]))

function carPartLabel(carPartId: CarPartId): string {
  return CAR_PART_LABELS.get(carPartId) ?? carPartId
}

/** Machining operation id -> the name the shop calls that job; internal ids
 * (e.g. `bore-and-hone`) never reach the day report. */
const MACHINING_OPERATION_LABELS = new Map(
  ECONOMY.machining.operations.map((operation) => [operation.id, operation.displayName]),
)

function machiningOperationLabel(operationId: string): string {
  return MACHINING_OPERATION_LABELS.get(operationId) ?? operationId
}

/** Shop id -> the name it is offered under, lower-cased so it reads inside a
 * sentence; the raw id reads through if content ever loses the entry. */
const TOOL_SHOP_NAMES = new Map(TOOL_SHOPS.map((shop) => [shop.id, shop.displayName.toLowerCase()]))

function toolShopName(shopId: string): string {
  return TOOL_SHOP_NAMES.get(shopId) ?? shopId
}

/** Simple consumable id -> its tin's shelf name; internal ids read straight
 * through if the catalogue is ever missing an entry. */
const CONSUMABLE_TIN_NAMES = new Map<string, string>(CONSUMABLE_TINS.map((t) => [t.id, t.name]))

const PAINT_COLOUR_NAMES = new Map(PAINT_COLOURS.map((c) => [c.id, c.name]))

/** A `GameState.consumableStock` key -> its shelf label - a plain tin name
 * for filler/paper/primer/polish, or "<finish> paint (<colour>)" for a
 * `paint:<finish>:<colour>` key. */
function consumableLabel(consumableKey: string): string {
  if (consumableKey.startsWith('paint:')) {
    const [, finish, colour] = consumableKey.split(':')
    const colourName = colour ? (PAINT_COLOUR_NAMES.get(colour) ?? colour) : consumableKey
    return `${finish} paint (${colourName})`
  }
  return CONSUMABLE_TIN_NAMES.get(consumableKey) ?? consumableKey
}

/** The machine-hire panel's per-group display name: the group's real
 * tier-2 machinery, read straight off `TOOL_LINES` so this name can never
 * drift from the Upgrades wall - distinct from `COMPONENT_DISPLAY_NAMES`
 * (which reads "Suspension and Brakes"/"Wheels and Tyres"), since the hire
 * panel and its gate reason name the actual machine, not the whole
 * component group. */
export const MACHINE_LINE_NAMES: Record<ComponentId, string> = Object.fromEntries(
  ComponentIdSchema.options.map((componentId) => [
    componentId,
    TOOL_LINES[componentId].tiers[1]!.displayName,
  ]),
) as Record<ComponentId, string>

/** The gate reason shown wherever a machine-gated operation needs `group`'s
 * machine owned or hired for the day and isn't - the exact copy the
 * workshop screen, the hire panel, and staged rows all share. */
export function machineLineGateCopy(group: ComponentId): string {
  return `Needs the ${MACHINE_LINE_NAMES[group]} for today. Hire it for the day, or buy your own.`
}

type JobBlockedReason = Extract<DayLogEntry, { type: 'job-blocked' }>['reason']

/**
 * What each refusal reason reads as in the day report - a plain sentence
 * naming what stopped the work and, where there is one, the way round it.
 * The sim's reasons are internal tokens and no player ever sees one. Keyed
 * exhaustively, so a new reason is a compile error here rather than a token
 * leaking onto the screen.
 */
const JOB_BLOCKED_REASON_COPY: Record<JobBlockedReason, string> = {
  'slot-occupied': 'that slot was already filled by the time the work came round.',
  'not-in-service-bay': 'the car has to be in a service bay before anyone can work on it.',
  'part-does-not-fit': 'that part does not fit this car.',
  'tool-tier': 'the shop has not got the tools for that yet.',
  'not-your-part': "that part came off a customer's car and goes back on it.",
  'bench-only': 'that part comes off and goes on the bench before it can be put right.',
  'blocked-by': 'something has to come off first to reach it.',
  'blocks-access': 'the slot under it is still empty - fit that first.',
  'machine-line': 'the machinery for that line is neither owned nor hired today.',
  'derived-band': 'bodywork goes through the panel stages, not a straight repair.',
  'out-of-stock': 'the shelf is short of what that stage needs.',
  'not-in-body-bay': 'the car has to be in the body bay before any of that work can start.',
  'beyond-repair': 'it is past saving. Fit a replacement instead.',
  'nothing-to-repair': 'nothing there was below the band you asked for.',
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
    case 'job-created': {
      const charge = entry.costYen === undefined ? '' : ` for ${formatYen(entry.costYen)}`
      // A recondition works a loose part on the bench, so it has no car to
      // name - `carInstanceId` holds the part instance for identity only.
      if (entry.kind === 'recondition-part') return `Bench recondition started${charge}`
      if (entry.kind === 'dyno-session') return `Strapped ${entry.carInstanceId} to the rollers`
      return `Job started (${entry.kind}) on ${entry.carInstanceId}${charge}`
    }
    case 'job-progress':
      return `Job ${entry.jobId}: +${entry.laborSlotsSpent} labour`
    case 'job-completed':
      return entry.kind === 'dyno-session'
        ? `Dyno run finished on ${entry.carInstanceId}`
        : `Job complete (${entry.kind}) on ${entry.carInstanceId}`
    case 'job-blocked':
      return `Work stopped: ${JOB_BLOCKED_REASON_COPY[entry.reason]}`
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
    case 'auction-attended':
      return `Paid in at the ${entry.tier} rooms: ${formatYen(entry.feeYen)}`
    case 'offer-received': {
      const base = offerCopy(
        resolveBuyerName(entry.buyerId),
        resolveModelName(entry.modelId),
        entry.priceYen,
      )
      // "He heard the idle." - set only when the drawn offer already priced
      // in a caught, unfixed symptom.
      return entry.noticeLine ? `${base} ${entry.noticeLine}` : base
    }
    case 'offer-rejected':
      return `Turned down ${formatYen(entry.priceYen)} for the ${resolveModelName(entry.modelId)}`
    case 'car-sold': {
      // Profit reads before the reputation clause, once, so it shows
      // regardless of which quality branch (or none) fires below.
      const base = `Sold ${entry.carInstanceId} (${entry.channel}) for ${formatYen(entry.priceYen)}`
      const withProfit =
        entry.profitYen !== undefined ? `${base}, profit ${formatYenDelta(entry.profitYen)}` : base
      // Signed explicitly (never assumed positive) - accepting a NOTICED
      // offer can drive this negative even on a sale that otherwise pleased
      // the buyer (knowledge-and-diagnosis.md section 6).
      const repClause = (delta: number) => `reputation ${delta >= 0 ? '+' : ''}${delta}`
      const withQuality = (() => {
        switch (entry.saleQuality) {
          case 'delighted':
            return `${withProfit} - the buyer got everything they came for, ${repClause(entry.reputationDelta ?? 0)}`
          case 'satisfied':
            return `${withProfit} - the buyer got what they came for, ${repClause(entry.reputationDelta ?? 0)}`
          default:
            return entry.reputationDelta
              ? `${withProfit}, ${repClause(entry.reputationDelta)}`
              : withProfit
        }
      })()
      // One line, appended, no popup - set only when the car still carried an
      // unresolved symptom, or (separately) when the buyer noticed one.
      const withReveal = entry.saleRevealLine
        ? `${withQuality} ${entry.saleRevealLine}`
        : withQuality
      return entry.noticeLine ? `${withReveal} ${entry.noticeLine}` : withReveal
    }
    case 'car-listed':
      return `Advertising for ${entry.carInstanceId} (${SELLING_CHANNEL_LABELS[entry.channelId]}): ${formatYen(entry.feeYen)}`
    case 'body-materials-used':
      return entry.zoneId
        ? `Materials drawn, ${entry.stage} on the ${entry.zoneId}: ${formatYen(entry.costYen)}`
        : `Materials drawn, whole-car respray: ${formatYen(entry.costYen)}`
    case 'consumable-bought':
      return `Bought ${consumableLabel(entry.consumableKey)} for ${formatYen(entry.priceYen)}`
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
    case 'part-machined':
      return `${machiningOperationLabel(entry.machiningOperationId)} finished on the ${entry.carPartId}`
    case 'part-removed': {
      const base = `Removed ${entry.carPartId} from ${entry.carInstanceId}`
      // Uninstall reveals truth - this removal collapsed one of the car's
      // symptoms to exactly one remaining cause.
      return entry.revealedCauseId
        ? `${base}. Opened it up: ${titleCaseFromSlug(entry.revealedCauseId)}.`
        : base
    }
    case 'symptom-cause-eliminated':
      return `The ${carPartLabel(entry.carPartId)} is clean. It wasn't that.`
    case 'service-job-accepted':
      // Acceptance no longer places the car instantly, so this reads as the
      // customer's own promise, not a status update.
      return `Thanks - I'll drop it off first thing in the morning.`
    case 'service-job-completed':
      return `Service job paid ${formatYen(entry.payoutYen)} (+${entry.reputationGained} rep), profit ${formatYenDelta(entry.netProfitYen)}`
    case 'service-job-failed':
      return `Service job handed back unfinished, sunk ${formatYen(entry.repairCostYen + entry.partsCostYen)}`
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
          : entry.reason === 'no-forecourt-space'
            ? 'no forecourt slot free - every one is already showing a car'
            : entry.reason === 'operation'
              ? 'needs a craft this shop has not unlocked yet'
              : 'needs a tool upgrade'
      return `${entry.kind} blocked - ${reasonText}`
    }
    case 'equipment-purchased':
      return `Bought equipment ${entry.equipmentId} for ${formatYen(entry.priceYen)}`
    case 'tool-upgraded':
      return `Upgraded ${componentDisplayName(entry.componentId, COMPONENT_DISPLAY_NAMES)} to ${
        TOOL_LINES[entry.componentId].tiers[entry.toTier - 1]!.displayName
      } for ${formatYen(entry.priceYen)}`
    case 'tool-shop-purchased':
      return `Fitted out the ${toolShopName(entry.shopId)} for ${formatYen(entry.priceYen)}`
    case 'machine-listed':
      return `Classifieds: ${
        TOOL_LINES[entry.componentId].tiers[entry.tier - 1]!.displayName
      } listed, ${formatYen(entry.priceYen)}`
    case 'tool-shop-listed':
      return `Classifieds: a whole ${toolShopName(entry.shopId)} listed, ${formatYen(entry.priceYen)}`
    case 'machine-hired':
      return `Hired the ${MACHINE_LINE_NAMES[entry.componentId]} for the day (${formatYen(entry.priceYen)})`
    case 'dyno-hired':
      return `Hired the rolling road for the day (${formatYen(entry.priceYen)})`
    case 'dyno-bought':
      return `Bought a rolling road for ${formatYen(entry.priceYen)}`
    case 'coffee-bought':
      return `Coffee round for the crew: +${entry.labourPoints} labour (${formatYen(entry.priceYen)})`
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
    case 'scene-commission-accepted':
      return `Commission accepted`
    case 'scene-commission-delivered':
      return `Commission delivered: ${formatYen(entry.payoutYen)}`
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

/**
 * The morning report's three money lines, each a sum over `cashMovementFor`'s
 * buckets and never a second classification: `earnedYen` is `income`,
 * `onCarsYen` is what went on cars and the stock waiting to go on them, and
 * `billsYen` is what running the shop and investing in it cost. Same law as
 * the weekly cost sheet, read at a day's scale instead of a week's, and
 * folded to three lines because a day rarely holds enough for five.
 */
export interface DayReportMoney {
  earnedYen: number
  onCarsYen: number
  billsYen: number
}

/** Which of the report's three lines each bucket totals into. */
const DAY_REPORT_LINE_BY_BUCKET: Record<CashBucket, keyof DayReportMoney> = {
  income: 'earnedYen',
  onCars: 'onCarsYen',
  stock: 'onCarsYen',
  running: 'billsYen',
  investment: 'billsYen',
}

export interface DayReportView {
  wins: DayReportWin[]
  money: DayReportMoney
  /** The meaningful, individually-worth-reading lines. */
  notable: string[]
  /** Aggregated quiet lines - grammar-correct, low decision value. */
  noise: string[]
}

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
  // A body-shop day draws filler, primer, paint or polish stage by stage,
  // zone by zone - `describeLogEntry` reads each draw as its own honest
  // sentence for the event log, but a dozen of those in one report would
  // bury the day in prep-and-sand trivia. Summed per car here instead, one
  // line whatever the panel count (the whole-car respray's own zoneless
  // entry folds into the same total, per car).
  const bodyMaterialsByCarId = new Map<string, { totalYen: number; jobs: number }>()

  for (const entry of entries) {
    // Every yen is classified once, by the shared law - so a movement the
    // report used to drop into prose (a bay, a tool line, an inspection
    // visit, a part bought) now counts, and none of them can be counted
    // differently here than the weekly sheet counts them.
    const movement = cashMovementFor(entry)
    if (movement) money[DAY_REPORT_LINE_BY_BUCKET[movement.bucket]] += movement.amountYen

    switch (entry.type) {
      // A car coming home is a celebration card, never a red number in a list.
      case 'auction-hammer-won':
        wins.push({
          modelName: resolveModelName(entry.modelId),
          year: entry.year,
          priceYen: entry.priceYen,
          kind: 'won',
        })
        break
      case 'lot-bought-out':
        wins.push({
          modelName: resolveModelName(entry.modelId),
          year: entry.year,
          priceYen: entry.priceYen,
          kind: 'bought',
        })
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
      case 'body-materials-used': {
        const agg = bodyMaterialsByCarId.get(entry.carInstanceId) ?? { totalYen: 0, jobs: 0 }
        agg.totalYen += entry.costYen
        agg.jobs += 1
        bodyMaterialsByCarId.set(entry.carInstanceId, agg)
        break
      }
      default:
        if (!MONEY_ONLY_TYPES.has(entry.type) && !NOISE_TYPES.has(entry.type)) {
          rest.push(describeLogEntry(entry, resolveModelName, resolveBuyerName))
        }
    }
  }

  // One line per car, whatever the panel count - the aggregate this whole
  // function exists to produce for body work (see the map's own comment
  // above).
  for (const [carInstanceId, agg] of bodyMaterialsByCarId) {
    rest.push(
      `Body shop materials, ${carInstanceId}: ${formatYen(agg.totalYen)} (${pluralise(agg.jobs, 'job')})`,
    )
  }

  const noise: string[] = []
  if (heatShifts > 0) noise.push(`Market prices moved on ${pluralise(heatShifts, 'car')}`)
  // labourTicked is an integer labour point value, not whole slots.
  if (labourTicked > 0) noise.push(`${labourTicked} labour spent in the shop`)

  return { wins, money, notable: rest, noise }
}
