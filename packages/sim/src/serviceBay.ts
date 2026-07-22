import type { EconomyConfig, StaffMember } from '@midnight-garage/content'
import { staffSkillSum } from './staff'

/**
 * The daily fleet-contract retainer. Only members assigned to `contract`
 * earn it (bench-assigned members put their hands on the shop's own work
 * instead, `laborSlots.ts`); each contract member brings in
 * `contractBaseYenPerDay + contractPerSkillPointYenPerDay * sum(stats)` a
 * day (all content, `economy.staff`). Passive income is an assignment you
 * trade labour for, never a bonus on top - and a busy shop benches while
 * a quiet one parks (the probe's bound B keeps the retainer below half
 * the same hands' billable value). Zero with no contract-assigned staff.
 */
export function computeContractIncomeYen(
  staff: readonly StaffMember[],
  economy: EconomyConfig,
): number {
  const { contractBaseYenPerDay, contractPerSkillPointYenPerDay } = economy.staff
  return staff.reduce(
    (sum, member) =>
      member.assignment === 'contract'
        ? sum + contractBaseYenPerDay + contractPerSkillPointYenPerDay * staffSkillSum(member.stats)
        : sum,
    0,
  )
}
