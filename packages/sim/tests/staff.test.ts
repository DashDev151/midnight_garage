import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  type GameState,
  type StaffMember,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { applyWeeklyRentAndWages } from '../src/finances'
import { availableLaborSlots } from '../src/laborSlots'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import {
  commitPendingStaffAssignments,
  deriveStaffWageYen,
  refreshStaffAds,
  resolveDismissStaff,
  resolveHireStaff,
  resolveReassignStaff,
  rollStaffCandidate,
} from '../src/staff'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), ...overrides }
}

function member(id: string, stats: StaffMember['stats'], laborSlotsPerDay: 1 | 2 = 1): StaffMember {
  return {
    id,
    displayName: id,
    stats,
    laborSlotsPerDay,
    assignment: 'bench',
    pendingAssignment: null,
    weeklyWageYen: deriveStaffWageYen(stats, laborSlotsPerDay, ECONOMY),
    trait: 'night-owl',
  }
}

describe('candidate roll (Sprint 80 decision 3)', () => {
  it('is deterministic under a fixed seed', () => {
    const a = rollStaffCandidate(CONTEXT, createRng(99), 'local', 'c-0', 7, new Set())
    const b = rollStaffCandidate(CONTEXT, createRng(99), 'local', 'c-0', 7, new Set())
    expect(a).toEqual(b)
  })

  it('never rolls a name already used by current staff or a live ad', () => {
    const taken = CONTEXT.staffCandidates.names[0]!
    const ad = rollStaffCandidate(CONTEXT, createRng(7), 'legend', 'c-1', 7, new Set([taken]))
    expect(ad.candidate.displayName).not.toBe(taken)
  })
})

describe('weekly ad refresh (Sprint 80 decision 2)', () => {
  it('tops the board up to maxOpenAds with distinct candidates', () => {
    const { state, log } = refreshStaffAds(
      baseState({ day: 7, staffAds: [] }),
      CONTEXT,
      createRng(1),
    )
    expect(state.staffAds).toHaveLength(ECONOMY.staff.maxOpenAds)
    const ids = state.staffAds.map((ad) => ad.candidate.id)
    expect(new Set(ids).size).toBe(ids.length)
    const names = state.staffAds.map((ad) => ad.candidate.displayName)
    expect(new Set(names).size).toBe(names.length)
    expect(log).toEqual([{ type: 'staff-ads-refreshed', count: ECONOMY.staff.maxOpenAds }])
  })

  it('is deterministic - same seed, same ads', () => {
    const seedState = baseState({ day: 7, staffAds: [] })
    const a = refreshStaffAds(seedState, CONTEXT, createRng(555))
    const b = refreshStaffAds(seedState, CONTEXT, createRng(555))
    expect(a.state.staffAds).toEqual(b.state.staffAds)
  })

  it('drops ads older than adExpiryDays, keeps the rest, then tops up', () => {
    const { adExpiryDays, maxOpenAds } = ECONOMY.staff
    const day = 20
    const staleAd = rollStaffCandidate(
      CONTEXT,
      createRng(2),
      'unknown',
      'stale',
      day - adExpiryDays,
      new Set(),
    )
    const freshAd = rollStaffCandidate(CONTEXT, createRng(3), 'unknown', 'kept', day - 1, new Set())
    const { state } = refreshStaffAds(
      baseState({ day, staffAds: [staleAd, freshAd] }),
      CONTEXT,
      createRng(4),
    )
    const ids = state.staffAds.map((ad) => ad.candidate.id)
    expect(ids).toContain('kept')
    expect(ids).not.toContain('stale')
    expect(state.staffAds).toHaveLength(maxOpenAds)
  })

  it('does not reissue a name already on the payroll', () => {
    const onPayroll = member('vet', { engine: 3, chassis: 3, body: 3 })
    onPayroll.displayName = CONTEXT.staffCandidates.names[0]!
    const { state } = refreshStaffAds(
      baseState({ day: 7, staff: [onPayroll], staffAds: [] }),
      CONTEXT,
      createRng(8),
    )
    expect(state.staffAds.map((ad) => ad.candidate.displayName)).not.toContain(
      onPayroll.displayName,
    )
  })
})

describe('hire and dismiss (Sprint 80 decision 6)', () => {
  it('hires the ad candidate onto the payroll, clears the ad, and charges the introduction fee', () => {
    const ad = rollStaffCandidate(CONTEXT, createRng(11), 'known', 'hire-me', 7, new Set())
    const before = baseState({ staffAds: [ad] })
    const { state, log } = resolveHireStaff(before, 'hire-me', CONTEXT)
    expect(state.staff.map((m) => m.id)).toEqual(['hire-me'])
    expect(state.staffAds).toEqual([])
    const expectedFee = ad.candidate.weeklyWageYen * ECONOMY.staff.introductionFeeWeeks
    expect(expectedFee).toBeGreaterThan(0)
    expect(state.cashYen).toBe(before.cashYen - expectedFee)
    expect(log).toEqual([
      {
        type: 'staff-hired',
        staffId: 'hire-me',
        displayName: ad.candidate.displayName,
        weeklyWageYen: ad.candidate.weeklyWageYen,
        introFeeYen: expectedFee,
      },
    ])
  })

  it('a hired member adds their own laborSlotsPerDay through the existing formula, unchanged', () => {
    const ad = rollStaffCandidate(CONTEXT, createRng(1), 'legend', 'grafter', 7, new Set())
    // Force a two-slot candidate to exercise the crew-model labour contribution.
    ad.candidate.laborSlotsPerDay = 2
    const { state } = resolveHireStaff(baseState({ staffAds: [ad] }), 'grafter', CONTEXT)
    expect(availableLaborSlots(state)).toBe(availableLaborSlots(baseState()) + 2)
  })

  it('refuses to hire at the staff cap (no-op, empty log)', () => {
    const staff = Array.from({ length: ECONOMY.staff.maxStaff }, (_, i) =>
      member(`s${i}`, { engine: 2, chassis: 2, body: 2 }),
    )
    const ad = rollStaffCandidate(CONTEXT, createRng(9), 'known', 'one-too-many', 7, new Set())
    const before = baseState({ staff, staffAds: [ad] })
    const { state, log } = resolveHireStaff(before, 'one-too-many', CONTEXT)
    expect(log).toEqual([])
    expect(state).toBe(before)
    expect(state.staff).toHaveLength(ECONOMY.staff.maxStaff)
  })

  it('hiring a missing candidate is a no-op', () => {
    const before = baseState({ staffAds: [] })
    const { state, log } = resolveHireStaff(before, 'ghost', CONTEXT)
    expect(state).toBe(before)
    expect(log).toEqual([])
  })

  it('dismisses a member and logs it; a missing member is a no-op', () => {
    const m = member('leaving', { engine: 2, chassis: 2, body: 2 })
    const { state, log } = resolveDismissStaff(baseState({ staff: [m] }), 'leaving')
    expect(state.staff).toEqual([])
    expect(log).toEqual([{ type: 'staff-dismissed', staffId: 'leaving', displayName: 'leaving' }])

    const before = baseState({ staff: [m] })
    const noop = resolveDismissStaff(before, 'nobody')
    expect(noop.state).toBe(before)
    expect(noop.log).toEqual([])
  })
})

describe('wage integration (the existing finances path picks up a hired member unchanged)', () => {
  it('deducts a hired member wage on the weekly boundary via applyWeeklyRentAndWages', () => {
    const m = member('waged', { engine: 4, chassis: 4, body: 4 }, 2)
    const state = baseState({ day: 7, staff: [m], cashYen: 500_000 })
    const { state: after, log } = applyWeeklyRentAndWages(state, ECONOMY)
    expect(after.cashYen).toBe(500_000 - ECONOMY.WEEKLY_RENT_YEN - m.weeklyWageYen)
    expect(log).toContainEqual({ type: 'wage-paid', staffId: 'waged', amountYen: -m.weeklyWageYen })
  })
})

describe('reassignment (crew model, R3)', () => {
  it('schedules a bench->contract switch as pending, not effective today', () => {
    const m = member('m', { engine: 2, chassis: 2, body: 2 })
    const { state, log } = resolveReassignStaff(baseState({ staff: [m] }), 'm', 'contract')
    expect(state.staff[0]!.assignment).toBe('bench')
    expect(state.staff[0]!.pendingAssignment).toBe('contract')
    expect(log).toEqual([])
  })

  it('scheduling the current assignment clears any pending change', () => {
    const m = {
      ...member('m', { engine: 2, chassis: 2, body: 2 }),
      pendingAssignment: 'contract' as const,
    }
    const { state } = resolveReassignStaff(baseState({ staff: [m] }), 'm', 'bench')
    expect(state.staff[0]!.pendingAssignment).toBeNull()
  })

  it('is a no-op (same state) for a missing member or an unchanged pending value', () => {
    const before = baseState({ staff: [member('m', { engine: 2, chassis: 2, body: 2 })] })
    expect(resolveReassignStaff(before, 'ghost', 'contract').state).toBe(before)
    expect(resolveReassignStaff(before, 'm', 'bench').state).toBe(before)
  })

  it('commitPendingStaffAssignments applies the pending value and clears it; untouched members pass through', () => {
    const pending = {
      ...member('p', { engine: 2, chassis: 2, body: 2 }),
      pendingAssignment: 'contract' as const,
    }
    const stable = member('s', { engine: 3, chassis: 3, body: 3 })
    const [committed, unchanged] = commitPendingStaffAssignments([pending, stable])
    expect(committed!.assignment).toBe('contract')
    expect(committed!.pendingAssignment).toBeNull()
    expect(unchanged).toBe(stable)
  })
})
