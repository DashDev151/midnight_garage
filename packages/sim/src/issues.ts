import type {
  CarInstance,
  CarModel,
  ComponentId,
  EconomyConfig,
  HiddenIssue,
} from '@midnight-garage/content'

/**
 * Sprint 22: hidden issues become a real, priced, persistent defect instead
 * of a one-time condition subtraction applied at handover. Severity is
 * rolled once, at car generation (`auctions.ts`'s `generateAuctionCarInstance`),
 * and stored on the instance forever - this module never re-rolls it, only
 * reads it. `CarInstance.hiddenIssues[]` stores only `issueId`; every helper
 * here that needs a component or a repair-cost figure takes the catalog
 * (`issuesById`/`issuesByComponent`, both already on `SimContext`) to
 * resolve it.
 */

function unrepairedSeveritiesFor(
  car: CarInstance,
  componentId: ComponentId,
  issuesById: Readonly<Record<string, HiddenIssue>>,
): number[] {
  return car.hiddenIssues
    .filter((ri) => !ri.repaired)
    .flatMap((ri) => {
      const catalogEntry = issuesById[ri.issueId]
      return catalogEntry && catalogEntry.componentId === componentId ? [ri.severityPercent] : []
    })
}

/** The worst unrepaired issue severity affecting `componentId` on `car`, 0 if none. */
export function maxUnrepairedSeverity(
  car: CarInstance,
  componentId: ComponentId,
  issuesById: Readonly<Record<string, HiddenIssue>>,
): number {
  const severities = unrepairedSeveritiesFor(car, componentId, issuesById)
  return severities.length === 0 ? 0 : Math.max(...severities)
}

/**
 * Decision 2: a component can be cosmetically repaired (raw `condition` at
 * 100) while a mechanically distinct hidden issue still drags its EFFECTIVE
 * condition down - repainting a car does not fix its apex seals. Raw
 * `condition` is untouched by this; it stays exactly what repair-zone jobs
 * set, and stays what the repair-button visibility check reads (decision
 * 2's explicit UI split - CarDetail's condition BAR reads effective, the
 * button's `condition < 100` gate reads raw).
 */
export function effectiveComponentCondition(
  car: CarInstance,
  componentId: ComponentId,
  issuesById: Readonly<Record<string, HiddenIssue>>,
): number {
  const raw = car.components[componentId].condition
  const severity = maxUnrepairedSeverity(car, componentId, issuesById)
  return Math.min(raw, 100 - severity)
}

/**
 * Decision 3: `repairCostBaseYen * severityPercent / costDivisor`, rounded
 * to the nearest Y1,000. Worked example at the default `costDivisor` (50):
 * a severity-50 roll costs exactly `repairCostBaseYen`; a severity-25 roll
 * costs half.
 */
export function issueRepairCostYen(
  issue: HiddenIssue,
  severityPercent: number,
  economy: EconomyConfig,
): number {
  const raw = (issue.repairCostBaseYen * severityPercent) / economy.issues.costDivisor
  return Math.round(raw / 1000) * 1000
}

/**
 * Decision 4: the total owned/sale-side penalty for every unrepaired issue
 * on `car` - `issueAdjustedValueYen` (`marketValue.ts`) subtracts this from
 * the issue-blind `marketValueYen`. A known unfixed defect scares buyers
 * more than the repair costs, so fixing before selling is profitable by
 * construction.
 */
export function issuePenaltyYen(
  car: CarInstance,
  issuesById: Readonly<Record<string, HiddenIssue>>,
  economy: EconomyConfig,
): number {
  let total = 0
  for (const revealedIssue of car.hiddenIssues) {
    if (revealedIssue.repaired) continue
    const catalogEntry = issuesById[revealedIssue.issueId]
    if (!catalogEntry) continue
    total +=
      issueRepairCostYen(catalogEntry, revealedIssue.severityPercent, economy) *
      economy.issues.penaltyMultiplier
  }
  return Math.round(total)
}

/**
 * Decision 5: what everyone in the market knows about this MODEL's issue
 * risk, as a fraction of book value - never the actual rolled issues on any
 * one instance (that stays the player's private, inspection-earned edge).
 * For each of the model's `hiddenIssueWeights` entries (a per-component
 * "how likely is SOME issue on this component" weight - the actual issue is
 * only picked at generation time, per `generateAuctionCarInstance`), this
 * averages the repair cost (at each candidate issue's midpoint severity)
 * across every catalog issue that could land on that component, weights it
 * by the component's own weight, sums across components, scales by
 * `riskDiscountWeight`, and caps at `maxRiskDiscount`.
 */
export function modelRiskDiscount(
  model: CarModel,
  issuesByComponent: Readonly<Record<ComponentId, readonly HiddenIssue[]>>,
  economy: EconomyConfig,
): number {
  let total = 0
  for (const weighted of model.hiddenIssueWeights) {
    const candidates = issuesByComponent[weighted.componentId]
    if (!candidates || candidates.length === 0) continue
    const avgCostFraction =
      candidates.reduce((sum, issue) => {
        const midSeverity = (issue.severityMin + issue.severityMax) / 2
        return sum + issueRepairCostYen(issue, midSeverity, economy) / model.bookValueYen
      }, 0) / candidates.length
    total += weighted.weight * avgCostFraction
  }
  const discount = total * economy.issues.riskDiscountWeight
  return Math.min(discount, economy.issues.maxRiskDiscount)
}

/** Decision 3's labor-slot band for a given severity roll. */
export function issueLaborSlots(severityPercent: number, economy: EconomyConfig): number {
  const [minorMax, seriousMax] = economy.issues.severityBands
  const [minorSlots, seriousSlots, severeSlots] = economy.issues.laborSlotsByBand
  if (severityPercent < minorMax) return minorSlots
  if (severityPercent < seriousMax) return seriousSlots
  return severeSlots
}

export type IssueSeverityBand = 'minor' | 'serious' | 'severe'

/** The severity band word for a given roll (same breakpoints `issueLaborSlots`
 * uses) - exposed separately for UI display (CarDetail/AuctionScreen). */
export function issueSeverityBand(
  severityPercent: number,
  economy: EconomyConfig,
): IssueSeverityBand {
  const [minorMax, seriousMax] = economy.issues.severityBands
  if (severityPercent < minorMax) return 'minor'
  if (severityPercent < seriousMax) return 'serious'
  return 'severe'
}
