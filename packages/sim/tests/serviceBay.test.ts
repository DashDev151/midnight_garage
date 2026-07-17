import { ECONOMY, type StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeContractIncomeYen } from '../src/serviceBay'

const member = (
  stats: StaffMember['stats'],
  assignment: StaffMember['assignment'],
): StaffMember => ({
  id: `staff-${stats.engine}${stats.chassis}${stats.body}-${assignment}`,
  displayName: 'Test Mechanic',
  stats,
  laborSlotsPerDay: 1,
  assignment,
  pendingAssignment: null,
  weeklyWageYen: 40_000,
  trait: 'perfectionist',
})

const { contractBaseYenPerDay, contractPerSkillPointYenPerDay } = ECONOMY.staff
const dailyContract = (sum: number) => contractBaseYenPerDay + contractPerSkillPointYenPerDay * sum

describe('computeContractIncomeYen (crew model, R3)', () => {
  it('is 0 with no staff', () => {
    expect(computeContractIncomeYen([], ECONOMY)).toBe(0)
  })

  it('is 0 when every member is benched (no retainer for the shop own hands)', () => {
    const bench = member({ engine: 5, chassis: 5, body: 5 }, 'bench')
    expect(computeContractIncomeYen([bench], ECONOMY)).toBe(0)
  })

  it('is contractBase + perSkill x sum(stats) per contract-assigned member', () => {
    const m = member({ engine: 2, chassis: 2, body: 2 }, 'contract') // sum 6
    expect(computeContractIncomeYen([m], ECONOMY)).toBe(dailyContract(6))
  })

  it('sums only the contract-assigned members', () => {
    const contract = member({ engine: 1, chassis: 1, body: 1 }, 'contract') // sum 3
    const bench = member({ engine: 5, chassis: 5, body: 5 }, 'bench')
    expect(computeContractIncomeYen([contract, bench], ECONOMY)).toBe(dailyContract(3))
  })

  it('scales with a contract member stat total', () => {
    const lean = computeContractIncomeYen(
      [member({ engine: 1, chassis: 1, body: 1 }, 'contract')],
      ECONOMY,
    )
    const strong = computeContractIncomeYen(
      [member({ engine: 5, chassis: 5, body: 5 }, 'contract')],
      ECONOMY,
    )
    expect(strong).toBeGreaterThan(lean)
  })
})
