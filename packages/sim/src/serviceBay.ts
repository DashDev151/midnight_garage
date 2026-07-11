import type { ReputationTier, StaffMember } from '@midnight-garage/content'
import { REPUTATION_INCOME_MULTIPLIER, SERVICE_BAY_YEN_PER_HUSTLE } from './constants'

/**
 * Passive daily service-bay income (GDD 3.4), scaled by staff Hustle and
 * shop reputation. Zero with no staff - matches GDD 9.0's Act 1 framing,
 * where service jobs are hand-played until staff exist (hiring is
 * Sprint 13); the formula is wired now so it's already correct then.
 */
export function computeServiceBayIncomeYen(
  staff: readonly StaffMember[],
  reputationTier: ReputationTier,
): number {
  const base = staff.reduce(
    (sum, member) => sum + member.stats.hustle * SERVICE_BAY_YEN_PER_HUSTLE,
    0,
  )
  return Math.round(base * REPUTATION_INCOME_MULTIPLIER[reputationTier])
}
