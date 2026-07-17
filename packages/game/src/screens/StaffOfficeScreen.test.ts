import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { ECONOMY, type StaffAd, type StaffMember } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import StaffOfficeScreen from './StaffOfficeScreen.vue'

// Sprint 82 decision 7 (Pinia multi-mount isolation): track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(StaffOfficeScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

function member(
  id: string,
  opts: Partial<Pick<StaffMember, 'laborSlotsPerDay' | 'assignment' | 'pendingAssignment'>> = {},
): StaffMember {
  return {
    id,
    displayName: `Name ${id}`,
    stats: { engine: 2, chassis: 2, body: 2 },
    laborSlotsPerDay: opts.laborSlotsPerDay ?? 1,
    assignment: opts.assignment ?? 'bench',
    pendingAssignment: opts.pendingAssignment ?? null,
    weeklyWageYen: 20000,
    trait: 'auction-rat',
  }
}

function ad(id: string, laborSlotsPerDay: 1 | 2 = 1): StaffAd {
  return { candidate: member(id, { laborSlotsPerDay }), bio: `Bio for ${id}`, postedOnDay: 7 }
}

function seed(game: ReturnType<typeof useGameStore>, staff: StaffMember[], ads: StaffAd[]) {
  game.gameState = { ...game.gameState, staff, staffAds: ads }
}

describe('StaffOfficeScreen (Sprint 80: staff I, crew model)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('shows empty states with no crew and no ads', () => {
    const game = useGameStore()
    game.newGame(1)
    seed(game, [], [])
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="roster-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="ads-empty"]').exists()).toBe(true)
  })

  it('renders an ad card with the candidate name, wage, bio, three stats, labour and trait copy', () => {
    const game = useGameStore()
    game.newGame(1)
    seed(game, [], [ad('a1')])
    const wrapper = mountScreen()
    const card = wrapper.find('[data-test="ad-a1"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Name a1')
    expect(card.text()).toContain('Bio for a1')
    expect(card.text()).toContain('Body 2')
    // Hustle is gone from the crew model.
    expect(card.text()).not.toContain('Hustle')
    expect(wrapper.find('[data-test="ad-labour"]').text()).toContain('+1 labour/day')
    // Trait copy resolves from content (Auction Rat), not the raw id.
    expect(card.text()).toContain('Auction Rat')
    expect(card.text()).not.toContain('auction-rat')
  })

  it('shows the introduction fee on an ad card (weekly wage x introductionFeeWeeks)', () => {
    const game = useGameStore()
    game.newGame(1)
    seed(game, [], [ad('a1')])
    const wrapper = mountScreen()
    const fee = wrapper.find('[data-test="ad-fee-a1"]')
    expect(fee.exists()).toBe(true)
    expect(fee.text()).toContain('Introduction fee')
    // 20,000/wk x 2 weeks (introductionFeeWeeks).
    expect(ECONOMY.staff.introductionFeeWeeks).toBe(2)
    expect(fee.text()).toContain('¥40,000')
  })

  it('hires a candidate: the ad leaves the board and the member joins the crew', async () => {
    const game = useGameStore()
    game.newGame(1)
    seed(game, [], [ad('a1')])
    const wrapper = mountScreen()
    await wrapper.find('[data-test="hire-a1"]').trigger('click')

    expect(game.gameState.staff.map((m) => m.id)).toEqual(['a1'])
    expect(game.gameState.staffAds).toEqual([])
    expect(wrapper.find('[data-test="staff-a1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="ad-a1"]').exists()).toBe(false)
  })

  it('shows a two-slot candidate labour plainly', () => {
    const game = useGameStore()
    game.newGame(1)
    seed(game, [], [ad('grafter', 2)])
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="ad-labour"]').text()).toContain('+2 labour/day')
  })

  it('schedules a bench->contract reassignment, effective next day', async () => {
    const game = useGameStore()
    game.newGame(1)
    seed(game, [member('s1')], [])
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="assign-state-s1"]').text()).toContain('Working the bench')

    await wrapper.find('[data-test="assign-toggle-s1"]').trigger('click')
    expect(game.gameState.staff[0]!.assignment).toBe('bench') // unchanged today
    expect(game.gameState.staff[0]!.pendingAssignment).toBe('contract')
    expect(wrapper.find('[data-test="assign-pending-s1"]').exists()).toBe(true)

    // Toggling back clears the pending change.
    await wrapper.find('[data-test="assign-toggle-s1"]').trigger('click')
    expect(game.gameState.staff[0]!.pendingAssignment).toBeNull()
    expect(wrapper.find('[data-test="assign-pending-s1"]').exists()).toBe(false)
  })

  it('disables hiring and shows the cap note at the staff cap', () => {
    const game = useGameStore()
    game.newGame(1)
    const full = Array.from({ length: ECONOMY.staff.maxStaff }, (_, i) => member(`s${i}`))
    seed(game, full, [ad('a1')])
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="staff-cap"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="hire-a1"]').attributes('disabled')).toBeDefined()
  })

  it('dismisses a member behind a two-step confirm', async () => {
    const game = useGameStore()
    game.newGame(1)
    seed(game, [member('s1')], [])
    const wrapper = mountScreen()

    // First click asks for confirmation, does not dismiss.
    await wrapper.find('[data-test="dismiss-s1"]').trigger('click')
    expect(game.gameState.staff).toHaveLength(1)
    expect(wrapper.find('[data-test="dismiss-confirm-s1"]').exists()).toBe(true)

    // Confirm actually removes the member.
    await wrapper.find('[data-test="dismiss-confirm-s1"]').trigger('click')
    expect(game.gameState.staff).toEqual([])
    expect(wrapper.find('[data-test="staff-s1"]').exists()).toBe(false)
  })
})
