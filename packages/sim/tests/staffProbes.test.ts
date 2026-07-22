import {
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  ReputationTierSchema,
  type StaffMember,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  computeHireCoherence,
  HIRE_BOUND_A_MAX_RATIO,
  HIRE_BOUND_A_MIN_RATIO,
  HIRE_BOUND_B_BILLABLE_FRACTION,
  HIRE_BOUND_C_STARTING_CASH_FRACTION,
  HIRE_BOUND_D_SAVEABLE_MULTIPLE,
} from '../src/coherence'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'
import { deriveStaffWageYen, rollStaffCandidate, staffSkillSum } from '../src/staff'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

/** The wage formula restated independently of the implementation - a test
 * that recomputes the wage from the raw content coefficients and compares
 * against `deriveStaffWageYen` can never silently drift from the rule
 * that produced it. */
function wageFromRawFormula(stats: StaffMember['stats'], laborSlotsPerDay: number): number {
  const { wageBaseYen, wagePerSkillPointYen, wagePerLaborSlotYen } = ECONOMY.staff
  const sum = stats.engine + stats.chassis + stats.body
  const raw = wageBaseYen + wagePerSkillPointYen * sum + wagePerLaborSlotYen * laborSlotsPerDay
  return Math.round(raw / 100) * 100
}

/** Weekly fleet-contract retainer for a stat line, restated from raw content. */
function weeklyContractYen(stats: StaffMember['stats']): number {
  const { contractBaseYenPerDay, contractPerSkillPointYenPerDay } = ECONOMY.staff
  return 7 * (contractBaseYenPerDay + contractPerSkillPointYenPerDay * staffSkillSum(stats))
}

describe('staff wage formula (crew model R4, content law)', () => {
  it('deriveStaffWageYen is exactly the economy.staff closed-form, over a spread of stats and slot counts', () => {
    const samples: [StaffMember['stats'], 1 | 2][] = [
      [{ engine: 1, chassis: 1, body: 1 }, 1],
      [{ engine: 3, chassis: 2, body: 2 }, 1],
      [{ engine: 4, chassis: 4, body: 4 }, 2],
      [{ engine: 5, chassis: 1, body: 1 }, 2],
      [{ engine: 5, chassis: 5, body: 5 }, 2],
    ]
    for (const [stats, slots] of samples) {
      expect(deriveStaffWageYen(stats, slots, ECONOMY)).toBe(wageFromRawFormula(stats, slots))
    }
  })

  it('is rounded to the nearest 100 yen and monotonic - a stat point and a second labour slot never lower the wage', () => {
    const base: StaffMember['stats'] = { engine: 2, chassis: 2, body: 2 }
    const wageBase = deriveStaffWageYen(base, 1, ECONOMY)
    expect(wageBase % 100).toBe(0)
    expect(deriveStaffWageYen({ ...base, engine: 3 }, 1, ECONOMY)).toBeGreaterThanOrEqual(wageBase)
    // The second labour slot is a real premium.
    expect(deriveStaffWageYen(base, 2, ECONOMY)).toBeGreaterThan(wageBase)
  })

  it('a rolled candidate never rolls its wage independently - it is always the formula of its own stats and slots', () => {
    const rng = createRng(4242)
    for (const tier of ReputationTierSchema.options) {
      for (let i = 0; i < 20; i++) {
        const ad = rollStaffCandidate(CONTEXT, rng, tier, `probe-${tier}-${i}`, 7, new Set())
        const c = ad.candidate
        expect(c.weeklyWageYen).toBe(deriveStaffWageYen(c.stats, c.laborSlotsPerDay, ECONOMY))
        expect([1, 2]).toContain(c.laborSlotsPerDay)
        expect(c.assignment).toBe('bench')
        expect(c.pendingAssignment).toBeNull()
        // Stats are inside the tier's budget - a real candidate for this shop.
        const budget = ECONOMY.staff.statBudgetByTier[tier]!
        for (const value of Object.values(c.stats)) {
          expect(value).toBeGreaterThanOrEqual(budget.min)
          expect(value).toBeLessThanOrEqual(budget.max)
        }
      }
    }
  })
})

/**
 * The hire coherence probe hard-gates all three bounds with honest
 * margins. A contract-assigned member must net a modest profit (A), the
 * same hands billed out must always out-earn the retainer (B), and a
 * day-one shop must afford its first hire (C). Every bound is asserted
 * exhaustively across each tier's whole budget cube x both labour-slot
 * counts.
 */
describe('hire coherence probe (crew model R5)', () => {
  const rows = computeHireCoherence(CONTEXT)
  const laborRate = ECONOMY.serviceJobs.laborRateYen

  it('covers every reputation tier exactly once', () => {
    expect(rows).toHaveLength(ReputationTierSchema.options.length)
    expect(new Set(rows.map((r) => r.tier))).toEqual(new Set(ReputationTierSchema.options))
  })

  it('every bound-A candidate wage and contract is the closed-form of its own stat line', () => {
    for (const row of rows) {
      for (const cand of [row.boundALow, row.boundAHigh]) {
        expect(cand.wageYen).toBe(deriveStaffWageYen(cand.stats, cand.laborSlotsPerDay, ECONOMY))
        expect(cand.contractWeeklyYen).toBe(weeklyContractYen(cand.stats))
        expect(cand.ratio).toBeCloseTo(cand.contractWeeklyYen / cand.wageYen, 10)
      }
    }
  })

  it('Bound A (net profit): weekly contract sits in [1.05, 1.40] x weekly wage for EVERY candidate in EVERY tier', () => {
    // Each row's two binding candidates first.
    for (const row of rows) {
      expect(
        row.boundALow.ratio,
        `${row.tier}: low ratio ${row.boundALow.ratio}`,
      ).toBeGreaterThanOrEqual(HIRE_BOUND_A_MIN_RATIO)
      expect(
        row.boundAHigh.ratio,
        `${row.tier}: high ratio ${row.boundAHigh.ratio}`,
      ).toBeLessThanOrEqual(HIRE_BOUND_A_MAX_RATIO)
    }
    // Then exhaustively - every reachable stat line x slot count inside each tier.
    for (const tier of ReputationTierSchema.options) {
      const budget = ECONOMY.staff.statBudgetByTier[tier]!
      for (let engine = budget.min; engine <= budget.max; engine++) {
        for (let chassis = budget.min; chassis <= budget.max; chassis++) {
          for (let body = budget.min; body <= budget.max; body++) {
            const stats = { engine, chassis, body }
            const wc = weeklyContractYen(stats)
            for (const slots of [1, 2] as const) {
              const wage = deriveStaffWageYen(stats, slots, ECONOMY)
              const ratio = wc / wage
              const msg = `${tier} {${engine},${chassis},${body}} L${slots}: ratio ${ratio}`
              expect(ratio, msg).toBeGreaterThanOrEqual(HIRE_BOUND_A_MIN_RATIO)
              expect(ratio, msg).toBeLessThanOrEqual(HIRE_BOUND_A_MAX_RATIO)
            }
          }
        }
      }
    }
  })

  it('Bound B (honest work beats the retainer): weekly contract <= 0.5 x (slots x 7 x laborRate) for EVERY candidate', () => {
    for (const row of rows) {
      expect(row.boundBCeilingYen).toBe(
        HIRE_BOUND_B_BILLABLE_FRACTION * row.boundBSlots * 7 * laborRate,
      )
      expect(
        row.boundBMarginYen,
        `${row.tier}: tightest contract ${row.boundBContractWeeklyYen} > ceiling ${row.boundBCeilingYen}`,
      ).toBeGreaterThanOrEqual(0)
    }
    // Exhaustively: the tightest is always max stats at 1 slot, but assert all.
    for (const tier of ReputationTierSchema.options) {
      const budget = ECONOMY.staff.statBudgetByTier[tier]!
      for (let engine = budget.min; engine <= budget.max; engine++) {
        for (let chassis = budget.min; chassis <= budget.max; chassis++) {
          for (let body = budget.min; body <= budget.max; body++) {
            const wc = weeklyContractYen({ engine, chassis, body })
            for (const slots of [1, 2] as const) {
              const ceiling = HIRE_BOUND_B_BILLABLE_FRACTION * slots * 7 * laborRate
              expect(
                wc,
                `${tier} {${engine},${chassis},${body}} L${slots}: contract ${wc} > ceiling ${ceiling}`,
              ).toBeLessThanOrEqual(ceiling)
            }
          }
        }
      }
    }
  })

  it('Bound C (first hire reachable): the entry tier cheapest introduction fee stays within 15% of starting cash', () => {
    const gated = rows.filter((r) => r.boundCGated)
    expect(gated).toHaveLength(1)
    const entry = gated[0]!
    expect(entry.tier).toBe(ReputationTierSchema.options[0])
    expect(entry.boundCCapYen).toBe(
      Math.round(HIRE_BOUND_C_STARTING_CASH_FRACTION * ECONOMY.STARTING_CASH_YEN),
    )
    expect(entry.boundCFeeYen).toBe(entry.boundCWageYen * ECONOMY.staff.introductionFeeWeeks)
    expect(
      entry.boundCMarginYen,
      `entry fee ${entry.boundCFeeYen} > cap ${entry.boundCCapYen}`,
    ).toBeGreaterThanOrEqual(0)
  })

  it('DISCLOSURE: every tier a shop could climb to still affords its own cheapest first hire (the fee only grows with the tier)', () => {
    // Not the hard gate (that is the entry tier alone) - a pinned observation
    // that no tier prices its cheapest hire out of reach at the current knobs.
    for (const row of rows) {
      expect(
        row.boundCMarginYen,
        `${row.tier}: fee ${row.boundCFeeYen} > cap ${row.boundCCapYen}`,
      ).toBeGreaterThanOrEqual(0)
    }
  })

  it('every bound-D row is the closed-form of its budget corners and the speed curve', () => {
    const { crewSpeedDiscount } = ECONOMY.staff
    const laborRate = ECONOMY.serviceJobs.laborRateYen
    for (const row of rows) {
      const budget = ECONOMY.staff.statBudgetByTier[row.tier]!
      const minStats = { engine: budget.min, chassis: budget.min, body: budget.min }
      const maxStats = { engine: budget.max, chassis: budget.max, body: budget.max }
      // Premium restated independently from the wage formula.
      const premium =
        deriveStaffWageYen(maxStats, 1, ECONOMY) - deriveStaffWageYen(minStats, 1, ECONOMY)
      expect(row.boundDPremiumYen).toBe(premium)
      // The premium is slot-independent: the second-slot wage cancels, so a
      // max-skill and a min-skill candidate at the SAME slot count differ only
      // by their stats. Assert at both slot counts.
      expect(
        deriveStaffWageYen(maxStats, 2, ECONOMY) - deriveStaffWageYen(minStats, 2, ECONOMY),
      ).toBe(premium)
      // Saveable weekly value restated from the curve at the tier's ceiling skill.
      const bestSaved = crewSpeedDiscount[Math.min(budget.max, crewSpeedDiscount.length - 1)]!
      const saveableWeekly = bestSaved * 7 * laborRate
      expect(row.boundDSaveableWeeklyYen).toBe(saveableWeekly)
      expect(row.boundDCapYen).toBe(HIRE_BOUND_D_SAVEABLE_MULTIPLE * saveableWeekly)
      expect(row.boundDMarginYen).toBe(row.boundDCapYen - row.boundDPremiumYen)
    }
  })

  it('Bound D (skills worth paying for): the entry tier max-vs-min-skill wage premium stays within HIRE_BOUND_D_SAVEABLE_MULTIPLE x the weekly labour its speed discount can save', () => {
    const gated = rows.filter((r) => r.boundDGated)
    expect(gated).toHaveLength(1)
    const entry = gated[0]!
    expect(entry.tier).toBe(ReputationTierSchema.options[0])
    expect(
      entry.boundDMarginYen,
      `entry premium ${entry.boundDPremiumYen} > cap ${entry.boundDCapYen}`,
    ).toBeGreaterThanOrEqual(0)
  })

  it('DISCLOSURE: no tier overprices its skill premium against the labour that skill can save', () => {
    // Not the hard gate (entry tier alone) - a pinned observation that skills
    // stay a bargain against the labour they save at every tier's ceiling.
    for (const row of rows) {
      expect(
        row.boundDMarginYen,
        `${row.tier}: premium ${row.boundDPremiumYen} > cap ${row.boundDCapYen}`,
      ).toBeGreaterThanOrEqual(0)
    }
  })
})
