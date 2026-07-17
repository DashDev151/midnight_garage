import { ECONOMY, type StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  benchHasPerfectionist,
  benchHasTrait,
  crewAdjustedGroupSlots,
  crewSkillFor,
  crewSlotsSaved,
  perfectionistCostMultiplier,
  skillKeyForGroup,
} from '../src/crewSkills'

/** A benched member with a given stat line and trait; overrides let a test
 * put them on contract or change the flat labour. */
function member(
  id: string,
  stats: StaffMember['stats'],
  trait: StaffMember['trait'] = 'night-owl',
  overrides: Partial<StaffMember> = {},
): StaffMember {
  return {
    id,
    displayName: id,
    stats,
    laborSlotsPerDay: 1,
    assignment: 'bench',
    pendingAssignment: null,
    weeklyWageYen: 4000,
    trait,
    ...overrides,
  }
}

describe('crewSkills - skillKeyForGroup (decision 1 mapping)', () => {
  it('maps every component group to exactly one crew skill per the content map', () => {
    expect(skillKeyForGroup('engine', ECONOMY)).toBe('engine')
    expect(skillKeyForGroup('drivetrain', ECONOMY)).toBe('chassis')
    expect(skillKeyForGroup('suspension', ECONOMY)).toBe('chassis')
    expect(skillKeyForGroup('wheels', ECONOMY)).toBe('chassis')
    expect(skillKeyForGroup('body', ECONOMY)).toBe('body')
    expect(skillKeyForGroup('interior', ECONOMY)).toBe('body')
  })
})

describe('crewSkills - crewSkillFor (decision 1: best benched hands lead)', () => {
  it('is the highest mapped skill among BENCHED members only', () => {
    const staff = [
      member('a', { engine: 2, chassis: 5, body: 1 }),
      member('b', { engine: 4, chassis: 1, body: 3 }),
    ]
    expect(crewSkillFor('engine', staff, ECONOMY)).toBe(4)
    expect(crewSkillFor('drivetrain', staff, ECONOMY)).toBe(5) // chassis, best of 5/1
    expect(crewSkillFor('body', staff, ECONOMY)).toBe(3)
  })

  it('ignores contract members and returns 0 when no benched member covers the group', () => {
    const staff = [
      member('a', { engine: 5, chassis: 5, body: 5 }, 'night-owl', { assignment: 'contract' }),
    ]
    expect(crewSkillFor('engine', staff, ECONOMY)).toBe(0)
    expect(crewSkillFor('body', staff, ECONOMY)).toBe(0)
    expect(crewSkillFor('engine', [], ECONOMY)).toBe(0)
  })
})

describe('crewSkills - benchHasTrait / benchHasPerfectionist (bench gate)', () => {
  it('detects a benched trait and never a contracted one', () => {
    const benched = [member('a', { engine: 3, chassis: 3, body: 3 }, 'auction-rat')]
    expect(benchHasTrait(benched, 'auction-rat')).toBe(true)
    expect(benchHasTrait(benched, 'perfectionist')).toBe(false)

    const contracted = [
      member('a', { engine: 3, chassis: 3, body: 3 }, 'perfectionist', { assignment: 'contract' }),
    ]
    expect(benchHasPerfectionist(contracted)).toBe(false)
    expect(
      benchHasPerfectionist([member('b', { engine: 1, chassis: 1, body: 1 }, 'perfectionist')]),
    ).toBe(true)
  })
})

describe('crewSkills - crewSlotsSaved / crewAdjustedGroupSlots (decision 2 curve + floors)', () => {
  const engineCrew = (skill: number, trait: StaffMember['trait'] = 'night-owl') => [
    member('a', { engine: skill, chassis: 1, body: 1 }, trait),
  ]

  it('reads the crewSpeedDiscount curve at the leading skill', () => {
    // Curve is [0,0,0,1,1,2]: skills 1-2 save nothing, 3-4 save one, 5 saves two.
    expect(crewSlotsSaved(6, 'engine', engineCrew(2), ECONOMY)).toBe(0)
    expect(crewSlotsSaved(6, 'engine', engineCrew(3), ECONOMY)).toBe(1)
    expect(crewSlotsSaved(6, 'engine', engineCrew(5), ECONOMY)).toBe(2)
  })

  it('never saves more than half the base, and never the last slot', () => {
    // skill 5 wants to save 2, but a 3-slot plan keeps ceil(3/2)=2, so only 1.
    expect(crewSlotsSaved(3, 'engine', engineCrew(5), ECONOMY)).toBe(1)
    // a 2-slot plan keeps at least 1: floor(2/2)=1 is also the last-slot cap.
    expect(crewSlotsSaved(2, 'engine', engineCrew(5), ECONOMY)).toBe(1)
    // a 1-slot plan can never be discounted.
    expect(crewSlotsSaved(1, 'engine', engineCrew(5), ECONOMY)).toBe(0)
    expect(crewSlotsSaved(0, 'engine', engineCrew(5), ECONOMY)).toBe(0)
  })

  it('a benched perfectionist spends one of the saved slots (careful work is slower)', () => {
    // skill 5 saves 2; perfectionist trims it to 1 on a big plan.
    expect(crewSlotsSaved(6, 'engine', engineCrew(5, 'perfectionist'), ECONOMY)).toBe(1)
    // skill 3 saves 1; perfectionist takes it to 0.
    expect(crewSlotsSaved(6, 'engine', engineCrew(3, 'perfectionist'), ECONOMY)).toBe(0)
  })

  it('crewAdjustedGroupSlots subtracts the saving from the base', () => {
    expect(crewAdjustedGroupSlots(6, 'engine', engineCrew(5), ECONOMY)).toBe(4)
    expect(crewAdjustedGroupSlots(6, 'engine', [], ECONOMY)).toBe(6)
  })
})

describe('crewSkills - perfectionistCostMultiplier (decision 5)', () => {
  it('is 1 without a benched perfectionist and (1 - discount) with one', () => {
    expect(perfectionistCostMultiplier([], ECONOMY)).toBe(1)
    const withPerf = [member('a', { engine: 1, chassis: 1, body: 1 }, 'perfectionist')]
    expect(perfectionistCostMultiplier(withPerf, ECONOMY)).toBe(
      1 - ECONOMY.staff.perfectionistPartsDiscount,
    )
  })
})
