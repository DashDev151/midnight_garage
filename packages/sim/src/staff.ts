import type {
  DayLogEntry,
  EconomyConfig,
  GameState,
  ReputationTier,
  StaffAd,
  StaffAssignment,
  StaffMember,
} from '@midnight-garage/content'
import { TraitIdSchema } from '@midnight-garage/content'
import type { SimContext } from './context'
import type { Rng } from './rng'

export interface StaffResolution {
  state: GameState
  log: DayLogEntry[]
}

/** Sum of the three quality stats (Staff II's layer) - the wage and contract
 * formulas both key off this. Hustle is gone (R1). */
export function staffSkillSum(stats: StaffMember['stats']): number {
  return stats.engine + stats.chassis + stats.body
}

/**
 * A staff member's weekly wage is a pure function of the stat line and
 * labour slots, never rolled independently - asserted by `staffProbes.test.ts`.
 *
 * `weeklyWageYen = round100(wageBaseYen + wagePerSkillPointYen * sum(stats)
 *                 + wagePerLaborSlotYen * laborSlotsPerDay)`.
 */
export function deriveStaffWageYen(
  stats: StaffMember['stats'],
  laborSlotsPerDay: number,
  economy: EconomyConfig,
): number {
  const { wageBaseYen, wagePerSkillPointYen, wagePerLaborSlotYen } = economy.staff
  const raw =
    wageBaseYen +
    wagePerSkillPointYen * staffSkillSum(stats) +
    wagePerLaborSlotYen * laborSlotsPerDay
  return Math.round(raw / 100) * 100
}

/** The one-off introduction fee charged at hire: `introductionFeeWeeks`
 * multiples of the candidate's own weekly wage. 0 disables it. */
export function introductionFeeYen(weeklyWageYen: number, economy: EconomyConfig): number {
  return weeklyWageYen * economy.staff.introductionFeeWeeks
}

/** Rolls `laborSlotsPerDay` (1 or 2) from the content weight tuple
 * `[weightFor1Slot, weightFor2Slots]` - one `rng.next()` draw via cumulative
 * weights. */
function rollLaborSlotsPerDay(weights: readonly [number, number], rng: Rng): 1 | 2 {
  const total = weights[0] + weights[1]
  const roll = rng.next() * total
  return roll < weights[0] ? 1 : 2
}

/**
 * Rolls one job-ad candidate for `reputationTier`. Each quality stat is
 * rolled uniformly within the tier's per-stat budget
 * (`economy.staff.statBudgetByTier`); the wage is DERIVED by formula, never
 * rolled. The display name avoids `usedNames` (current staff plus live
 * ads), falling back to the full pool if that leaves nothing fresh.
 */
export function rollStaffCandidate(
  context: SimContext,
  rng: Rng,
  reputationTier: ReputationTier,
  candidateId: string,
  postedOnDay: number,
  usedNames: ReadonlySet<string>,
): StaffAd {
  const budget = context.economy.staff.statBudgetByTier[reputationTier]!
  const stats = {
    engine: rng.int(budget.min, budget.max),
    chassis: rng.int(budget.min, budget.max),
    body: rng.int(budget.min, budget.max),
  }
  const laborSlotsPerDay = rollLaborSlotsPerDay(context.economy.staff.laborSlotsPerDayWeights, rng)
  const freshNames = context.staffCandidates.names.filter((name) => !usedNames.has(name))
  const displayName = rng.pick(freshNames.length > 0 ? freshNames : context.staffCandidates.names)
  const bio = rng.pick(context.staffCandidates.bios)
  const trait = rng.pick(TraitIdSchema.options)
  const candidate: StaffMember = {
    id: candidateId,
    displayName,
    stats,
    laborSlotsPerDay,
    assignment: 'bench',
    pendingAssignment: null,
    weeklyWageYen: deriveStaffWageYen(stats, laborSlotsPerDay, context.economy),
    trait,
  }
  return { candidate, bio, postedOnDay }
}

/**
 * The weekly job-ad refresh: drops ads older than `adExpiryDays`, then tops
 * the board back up to `maxOpenAds` with fresh candidates whose names avoid
 * current staff and the surviving ads. Logs `staff-ads-refreshed` when any
 * ad was posted.
 */
export function refreshStaffAds(state: GameState, context: SimContext, rng: Rng): StaffResolution {
  const { maxOpenAds, adExpiryDays } = context.economy.staff
  const kept = state.staffAds.filter((ad) => state.day - ad.postedOnDay < adExpiryDays)

  const usedNames = new Set<string>([
    ...state.staff.map((member) => member.displayName),
    ...kept.map((ad) => ad.candidate.displayName),
  ])
  const fresh: StaffAd[] = []
  let index = 0
  while (kept.length + fresh.length < maxOpenAds) {
    const ad = rollStaffCandidate(
      context,
      rng,
      state.reputationTier,
      `staff-${state.day}-${index}`,
      state.day,
      usedNames,
    )
    usedNames.add(ad.candidate.displayName)
    fresh.push(ad)
    index += 1
  }

  const log: DayLogEntry[] =
    fresh.length > 0 ? [{ type: 'staff-ads-refreshed', count: fresh.length }] : []
  return { state: { ...state, staffAds: [...kept, ...fresh] }, log }
}

/**
 * Hires the candidate on ad `candidateId`, instant. Charges the
 * introduction fee to cash (may go negative) and joins `state.staff`
 * bench-assigned. A no-op when the ad is gone or the shop is already at
 * `economy.staff.maxStaff`.
 */
export function resolveHireStaff(
  state: GameState,
  candidateId: string,
  context: SimContext,
): StaffResolution {
  const ad = state.staffAds.find((entry) => entry.candidate.id === candidateId)
  if (!ad) return { state, log: [] }
  if (state.staff.length >= context.economy.staff.maxStaff) return { state, log: [] }

  const feeYen = introductionFeeYen(ad.candidate.weeklyWageYen, context.economy)
  const staff = [...state.staff, ad.candidate]
  const staffAds = state.staffAds.filter((entry) => entry.candidate.id !== candidateId)
  return {
    state: { ...state, staff, staffAds, cashYen: state.cashYen - feeYen },
    log: [
      {
        type: 'staff-hired',
        staffId: ad.candidate.id,
        displayName: ad.candidate.displayName,
        weeklyWageYen: ad.candidate.weeklyWageYen,
        introFeeYen: feeYen,
      },
    ],
  }
}

/** Dismisses `staffId`, immediate: no severance, no morale machinery (GDD
 * section 7). A no-op when no such member exists. */
export function resolveDismissStaff(state: GameState, staffId: string): StaffResolution {
  const member = state.staff.find((entry) => entry.id === staffId)
  if (!member) return { state, log: [] }

  const staff = state.staff.filter((entry) => entry.id !== staffId)
  return {
    state: { ...state, staff },
    log: [{ type: 'staff-dismissed', staffId, displayName: member.displayName }],
  }
}

/**
 * Schedules a member's reassignment between `bench` and `contract`; takes
 * effect on the next day boundary (`commitPendingStaffAssignments`), never
 * mid-day. Setting the pending value back to the current assignment clears
 * any pending change. A no-op when no such member exists.
 */
export function resolveReassignStaff(
  state: GameState,
  staffId: string,
  to: StaffAssignment,
): StaffResolution {
  const member = state.staff.find((entry) => entry.id === staffId)
  if (!member) return { state, log: [] }

  const pendingAssignment = to === member.assignment ? null : to
  if (pendingAssignment === member.pendingAssignment) return { state, log: [] }

  const staff = state.staff.map((entry) =>
    entry.id === staffId ? { ...entry, pendingAssignment } : entry,
  )
  return { state: { ...state, staff }, log: [] }
}

/** Commits every scheduled reassignment. Called from `advanceDay`'s
 * day-boundary finalisation, after contract income has accrued for the
 * ending day - so a reassignment made today takes effect tomorrow. */
export function commitPendingStaffAssignments(staff: readonly StaffMember[]): StaffMember[] {
  return staff.map((member) =>
    member.pendingAssignment !== null
      ? { ...member, assignment: member.pendingAssignment, pendingAssignment: null }
      : member,
  )
}
