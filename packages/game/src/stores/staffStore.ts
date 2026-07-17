import { TRAITS, type StaffAssignment, type StaffMember } from '@midnight-garage/content'
import {
  crewSkillFor,
  introductionFeeYen,
  resolveDismissStaff,
  resolveHireStaff,
  resolveReassignStaff,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useGameStore } from './gameStore'

/** Sprint 80 (staff I), crew model: one staff member or job-ad candidate card,
 * with the trait copy resolved for display. */
export interface StaffMemberCardView {
  id: string
  displayName: string
  stats: StaffMember['stats']
  traitName: string
  traitDescription: string
  weeklyWageYen: number
  /** Crew model R2: the flat labour this member puts in (1 or 2 slots a day),
   * shown plainly - a pair of hands is a pair of hands. */
  laborSlotsPerDay: number
  /** Crew model R3: where the member's labour goes now (`bench` or
   * `contract`), and any reassignment scheduled to take effect next day
   * (`null` when none). Candidates on the board are always bench with nothing
   * pending. */
  assignment: StaffAssignment
  pendingAssignment: StaffAssignment | null
}

/** Sprint 80 (staff I): a job-ad card - a candidate plus its bio, the
 * posted/expiry days, and the one-off introduction fee shown before hiring. */
export interface StaffAdCardView extends StaffMemberCardView {
  bio: string
  postedOnDay: number
  expiresOnDay: number
  /** Crew model R6a: the introduction fee (`introductionFeeWeeks` x weekly
   * wage) charged to cash on hire - shown on the card before the player
   * commits. */
  introFeeYen: number
}

/** Sprint 82: the live crew skill at the bench right now - the leading benched
 * skill per area (`crewSkillFor`), and which trait effects are active. Null
 * when no one is on the bench, so the roster can say so plainly. */
export interface BenchCrewView {
  engine: number
  chassis: number
  body: number
  perfectionist: boolean
  auctionRat: boolean
}

/** Sprint 80 (staff I): the whole Staff Office view - the roster and the ads
 * board, with the hiring cap. */
export interface StaffOfficeView {
  roster: StaffMemberCardView[]
  ads: StaffAdCardView[]
  maxStaff: number
  atCap: boolean
  /** Sprint 82: the crew skill currently in effect at the bench, or null when
   * the bench is empty. */
  benchCrew: BenchCrewView | null
}

const TRAIT_BY_ID = new Map(TRAITS.map((trait) => [trait.id, trait]))

function staffCardFor(member: StaffMember): StaffMemberCardView {
  const trait = TRAIT_BY_ID.get(member.trait)
  return {
    id: member.id,
    displayName: member.displayName,
    stats: member.stats,
    traitName: trait?.displayName ?? member.trait,
    traitDescription: trait?.description ?? '',
    weeklyWageYen: member.weeklyWageYen,
    laborSlotsPerDay: member.laborSlotsPerDay,
    assignment: member.assignment,
    pendingAssignment: member.pendingAssignment,
  }
}

/**
 * Sprint 82 decision 6: the Staff Office domain store. The staff surface (the
 * roster/ads view and the hire/dismiss/reassign actions) lives here, split out
 * of `gameStore` per the standing TODO. The persisted staff data itself stays
 * inside `GameState` (the sim owns it and it is saved wholesale), so this store
 * reads and writes it through `gameStore` - no second source of truth, no
 * behaviour change from Sprint 80/81.
 */
export const useStaffStore = defineStore('staff', () => {
  const game = useGameStore()

  /**
   * Sprint 80 decision 7: the Staff Office's two panels - the current roster
   * and the live job-ad board - resolved once from `gameState.staff` /
   * `gameState.staffAds` with each candidate's trait copy attached. Pure
   * re-presentation, no new state; the ads carry their own bio and the
   * posted/expiry days the card shows. Sprint 82 adds the bench crew summary.
   */
  const staffOfficeView = computed<StaffOfficeView>(() => {
    const { adExpiryDays, maxStaff } = game.context.economy.staff
    const roster = game.gameState.staff.map(staffCardFor)
    const ads: StaffAdCardView[] = game.gameState.staffAds.map((ad) => ({
      ...staffCardFor(ad.candidate),
      bio: ad.bio,
      postedOnDay: ad.postedOnDay,
      expiresOnDay: ad.postedOnDay + adExpiryDays,
      introFeeYen: introductionFeeYen(ad.candidate.weeklyWageYen, game.context.economy),
    }))
    // Sprint 82: the crew skill in effect at the bench right now - the leading
    // benched skill per area (`crewSkillFor` reads the map: chassis leads the
    // drivetrain/suspension/wheels groups, so 'drivetrain' stands for it), and
    // the two live trait effects. Null when no one is on the bench.
    const staff = game.gameState.staff
    const economy = game.context.economy
    const anyBenched = staff.some((m) => m.assignment === 'bench')
    const benchCrew: BenchCrewView | null = anyBenched
      ? {
          engine: crewSkillFor('engine', staff, economy),
          chassis: crewSkillFor('drivetrain', staff, economy),
          body: crewSkillFor('body', staff, economy),
          perfectionist: staff.some((m) => m.assignment === 'bench' && m.trait === 'perfectionist'),
          auctionRat: staff.some((m) => m.assignment === 'bench' && m.trait === 'auction-rat'),
        }
      : null
    return { roster, ads, maxStaff, atCap: roster.length >= maxStaff, benchCrew }
  })

  /** Sprint 80 decision 6, crew model R6a: hire the ad candidate - instant, the
   * introduction fee charged to cash. Refused (returns false) at the staff cap
   * or for a missing ad. */
  function hireStaff(candidateId: string): boolean {
    const result = resolveHireStaff(game.gameState, candidateId, game.context)
    if (result.log.length === 0) return false
    game.gameState = result.state
    game.dayLog.push(...result.log)
    game.logSessionEvent('hireStaff', { candidateId })
    return true
  }

  /** Sprint 80 decision 6: dismiss a member - instant, no severance. The
   * two-step confirm lives in the screen. */
  function dismissStaff(staffId: string): boolean {
    const result = resolveDismissStaff(game.gameState, staffId)
    if (result.log.length === 0) return false
    game.gameState = result.state
    game.dayLog.push(...result.log)
    game.logSessionEvent('dismissStaff', { staffId })
    return true
  }

  /** Sprint 80 crew model R3: schedule a member's bench/contract reassignment.
   * It takes effect on the next day boundary (`advanceDay` commits it), so the
   * store just records the pending change. A no-op (returns false) when nothing
   * changed (no such member, or the pending value already matches). */
  function reassignStaff(staffId: string, to: StaffAssignment): boolean {
    const result = resolveReassignStaff(game.gameState, staffId, to)
    if (result.state === game.gameState) return false
    game.gameState = result.state
    game.logSessionEvent('reassignStaff', { staffId, to })
    return true
  }

  return { staffOfficeView, hireStaff, dismissStaff, reassignStaff }
})
