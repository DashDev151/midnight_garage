import { type StaffMember } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { useStaffStore } from './staffStore'

function member(
  id: string,
  stats: StaffMember['stats'],
  trait: StaffMember['trait'],
  assignment: StaffMember['assignment'] = 'bench',
): StaffMember {
  return {
    id,
    displayName: `Name ${id}`,
    stats,
    laborSlotsPerDay: 1,
    assignment,
    pendingAssignment: null,
    weeklyWageYen: 20000,
    trait,
  }
}

/**
 * The staff store owns the Staff Office view but reads and
 * writes the persisted staff data through `gameStore`. These tests seed via
 * `useGameStore` and read the view off `useStaffStore` to prove the two stay in
 * one source of truth, and cover the `benchCrew` summary.
 */
describe('useStaffStore benchCrew (Sprint 82)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed(staff: StaffMember[]) {
    const game = useGameStore()
    game.newGame(1)
    game.gameState = { ...game.gameState, staff, staffAds: [] }
    return useStaffStore()
  }

  it('is null when no one is on the bench', () => {
    expect(seed([]).staffOfficeView.benchCrew).toBeNull()
    // A member entirely on contract still leaves the bench empty.
    expect(
      seed([member('c', { engine: 5, chassis: 5, body: 5 }, 'night-owl', 'contract')])
        .staffOfficeView.benchCrew,
    ).toBeNull()
  })

  it('reports the leading benched skill per area and the live trait effects', () => {
    const staff = seed([
      member('a', { engine: 2, chassis: 5, body: 1 }, 'perfectionist'),
      member('b', { engine: 4, chassis: 1, body: 3 }, 'auction-rat'),
    ])
    expect(staff.staffOfficeView.benchCrew).toEqual({
      engine: 4,
      chassis: 5,
      body: 3,
      perfectionist: true,
      auctionRat: true,
    })
  })

  it('ignores a contracted trait-bearer for the trait flags', () => {
    const staff = seed([
      member('a', { engine: 3, chassis: 3, body: 3 }, 'perfectionist', 'contract'),
      member('b', { engine: 2, chassis: 2, body: 2 }, 'auction-rat'),
    ])
    // Only b is benched: b's skills lead, only b's trait is live.
    expect(staff.staffOfficeView.benchCrew).toEqual({
      engine: 2,
      chassis: 2,
      body: 2,
      perfectionist: false,
      auctionRat: true,
    })
  })
})
