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
 * Sprint 80 crew model, R4 (content law, the Sprint 78 formula-derived-content
 * pattern): a staff member's weekly wage is a PURE function of the stat line
 * and the labour slots, never rolled independently. Every coefficient is
 * content (`economy.staff`); the formula relationship is the invariant,
 * asserted by `staffProbes.test.ts` so wage content and this formula can never
 * drift.
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

/**
 * Sprint 80 crew model, R6a: the one-off introduction fee charged at hire -
 * `introductionFeeWeeks` multiples of the candidate's own weekly wage. 0
 * disables it. Content law: the multiple is a knob (`economy.staff`).
 */
export function introductionFeeYen(weeklyWageYen: number, economy: EconomyConfig): number {
  return weeklyWageYen * economy.staff.introductionFeeWeeks
}

/**
 * Sprint 80 crew model, R2: roll `laborSlotsPerDay` (1 or 2) from the content
 * weight tuple `[weightFor1Slot, weightFor2Slots]`. One `rng.next()` draw via
 * cumulative weights, the same single-draw shape `sampleDailyOfferCount` and
 * `rollUpkeepTier` use.
 */
function rollLaborSlotsPerDay(weights: readonly [number, number], rng: Rng): 1 | 2 {
  const total = weights[0] + weights[1]
  const roll = rng.next() * total
  return roll < weights[0] ? 1 : 2
}

/**
 * Sprint 80 crew model, R2/R3: roll one job-ad candidate for the given hiring
 * tier. Each of the three quality stats is rolled uniformly in that tier's
 * per-stat budget (`economy.staff.statBudgetByTier` - better shops attract
 * people stronger across the board); `laborSlotsPerDay` is a weighted 1-or-2
 * roll; the trait is rolled uniformly; the wage is DERIVED by formula, never
 * rolled. A fresh hire starts `bench`-assigned with nothing pending. The
 * display name avoids `usedNames` (current staff plus live ads) so the board
 * never shows a duplicate; if the pool is exhausted it falls back to the full
 * pool rather than looping forever. The bio is drawn independently and rides on
 * the ad only (not the persisted staff member).
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
 * Sprint 80 decision 2: the weekly job-ad refresh, run from `advanceDay`'s
 * day-boundary tick on the same 7-day cadence as wages. Expired ads (posted
 * more than `adExpiryDays` ago) drop first, then seeded rolls top the board
 * back up to `maxOpenAds` with fresh candidates whose names avoid current
 * staff and the surviving ads. Candidate ids are `staff-<day>-<i>` (the
 * refresh runs at most once per day, so they never collide). One
 * `staff-ads-refreshed` log entry when any ad was posted.
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
 * Sprint 80 crew model, R6a: hire the candidate on the ad with `candidateId` -
 * instant. The introduction fee (`introductionFeeWeeks` x weekly wage) is
 * charged to cash at hire (may go negative, as rent/wages already can); the
 * member joins `state.staff` bench-assigned (its labour applies from the next
 * slot computation; the first wage lands on the next weekly tick via the
 * existing `finances.ts` path). The ad leaves the board. A no-op (empty log,
 * matching every instant resolver's contract) when the ad is gone or the shop
 * is already at `economy.staff.maxStaff`.
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

/**
 * Sprint 80 decision 6: dismiss `staffId` - immediate, no severance, no morale
 * machinery (GDD section 7: no morale sim). A no-op when no such member
 * exists. The two-step confirm lives in the UI, not here.
 */
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
 * Sprint 80 crew model, R3: schedule a member's reassignment between `bench`
 * and `contract`. It takes effect on the NEXT day boundary
 * (`commitPendingStaffAssignments`, run by `advanceDay`), never mid-day - a
 * bench day cannot also collect the retainer, and the labour pool never shifts
 * under an action already taken. Setting the pending value back to the current
 * effective assignment simply clears any pending change. A no-op (returns the
 * same state) when no such member exists. No log entry: the change is silent
 * until it lands.
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

/**
 * Sprint 80 crew model, R3: commit every scheduled reassignment. Called from
 * `advanceDay`'s day-boundary finalisation (step 10), AFTER contract income has
 * accrued for the day that is ending - so a reassignment made today takes
 * effect tomorrow, never tonight. Members with nothing pending are untouched.
 */
export function commitPendingStaffAssignments(staff: readonly StaffMember[]): StaffMember[] {
  return staff.map((member) =>
    member.pendingAssignment !== null
      ? { ...member, assignment: member.pendingAssignment, pendingAssignment: null }
      : member,
  )
}
