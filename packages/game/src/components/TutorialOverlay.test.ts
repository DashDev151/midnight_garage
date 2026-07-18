import { STORY_MISSIONS, TUTORIAL_LOT, type GameState } from '@midnight-garage/content'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import TutorialOverlay from './TutorialOverlay.vue'

// The overlay only reads `route.name` (best-effort spotlight); a plain stub is
// enough and keeps the test off a full router install.
vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'jobs' }) }))

const LOT = TUTORIAL_LOT
const FOUR_WHEELS = STORY_MISSIONS.find((m) => m.id === LOT.missionId)!

function ownScriptedCarWithBands(
  state: GameState,
  bands: Partial<Record<string, string>>,
): GameState {
  const lot = state.activeAuctionLots.find((l) => l.id === LOT.lotId)
  const car = lot?.car ?? state.ownedCars.find((c) => c.id === LOT.carId)
  if (!car) throw new Error('scripted car not found in test state')
  const parts = { ...car.parts }
  for (const [partId, band] of Object.entries(bands)) {
    const installed = parts[partId as keyof typeof parts].installed
    if (installed)
      parts[partId as keyof typeof parts] = { installed: { ...installed, band } as never }
  }
  return {
    ...state,
    ownedCars: [...state.ownedCars.filter((c) => c.id !== LOT.carId), { ...car, parts }],
    activeAuctionLots: state.activeAuctionLots.filter((l) => l.id !== LOT.lotId),
  }
}

describe('TutorialOverlay', () => {
  const wrappers: ReturnType<typeof mount>[] = []
  function render() {
    const wrapper = mount(TutorialOverlay)
    wrappers.push(wrapper)
    return wrapper
  }

  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
  })

  it('stays hidden for a non-tutorial career', () => {
    // The eager store init is a plain `createInitialGameState` (no tutorial).
    const wrapper = render()
    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(false)
  })

  it('opens on the accept beat for a fresh tutorial career, with the mission economics interpolated', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tutorial-progress"]').text()).toContain('Step 1 of 6')
    const text = wrapper.text()
    expect(text).toContain(formatYen(FOUR_WHEELS.budgetCapYen))
    expect(text).toContain(formatYen(FOUR_WHEELS.payoutYen))
    expect(text).toContain('Accept the job when you are ready')
  })

  it('advances to the acquire beat once the mission is accepted, revealing the Minor line only after inspection', async () => {
    const game = useGameStore()
    game.newGame(2)
    game.acceptMission(LOT.missionId)
    const wrapper = render()
    await nextTick()

    expect(wrapper.text()).toContain('Open the Local Yard')
    expect(wrapper.text()).toContain('Reserve is the seller')
    // Not yet inspected: the reveal line is hidden.
    expect(wrapper.text()).not.toContain('Minor. The discount stays')

    // Narrow the scripted lot's symptom to one cause (an inspection ran).
    const s = game.gameState
    const lots = s.activeAuctionLots.map((l) =>
      l.id === LOT.lotId
        ? {
            ...l,
            car: {
              ...l.car,
              symptoms: [
                { ...l.car.symptoms[0]!, remainingCauseIds: [l.car.symptoms[0]!.trueCauseId] },
              ],
            },
          }
        : l,
    )
    game.gameState = { ...s, activeAuctionLots: lots }
    await nextTick()
    expect(wrapper.text()).toContain('Minor. The discount stays')
  })

  it('walks the wheel then engine beats as the car is fixed, interpolating the buried part name', async () => {
    const game = useGameStore()
    game.newGame(3)
    game.acceptMission(LOT.missionId)
    // Win the car (still scrap tyres, worn head/valvetrain).
    game.gameState = ownScriptedCarWithBands(game.gameState, {})
    const wrapper = render()
    await nextTick()
    expect(wrapper.text()).toContain('Pull the wheel assembly')
    expect(wrapper.find('[data-test="tutorial-yuki"]').text()).toContain('certain something')

    // Fresh tyres fitted -> engine beat.
    game.gameState = ownScriptedCarWithBands(game.gameState, { tyres: 'mint' })
    await nextTick()
    const engineText = wrapper.text()
    expect(engineText).toContain('Engine work means the engine comes out')
    // {part} resolved to the buried part's display name (head/valvetrain).
    expect(engineText).toContain('Head')
    expect(engineText).not.toContain('{part}')

    // Head/valvetrain repaired -> deliver beat.
    game.gameState = ownScriptedCarWithBands(game.gameState, {
      tyres: 'mint',
      headValvetrain: 'fine',
    })
    await nextTick()
    expect(wrapper.text()).toContain('Deliver it')
  })

  it('shows the terminal sign-off after delivery and finishes cleanly', async () => {
    const game = useGameStore()
    game.newGame(4)
    game.acceptMission(LOT.missionId)
    // Mark the mission delivered and clear the (now-handed-over) car.
    const s = game.gameState
    game.gameState = {
      ...s,
      ownedCars: s.ownedCars.filter((c) => c.id !== LOT.carId),
      activeAuctionLots: s.activeAuctionLots.filter((l) => l.id !== LOT.lotId),
      storyMissions: s.storyMissions.map((r) =>
        r.missionId === LOT.missionId ? { ...r, status: 'delivered' as const } : r,
      ),
    }
    const wrapper = render()
    await nextTick()

    expect(wrapper.text()).toContain('The walkthrough ends here')
    expect(wrapper.find('[data-test="tutorial-progress"]').exists()).toBe(false)

    await wrapper.find('[data-test="tutorial-finish"]').trigger('click')
    await nextTick()
    expect(game.gameState.tutorialStatus).toBe('done')
    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(false)
  })

  it('skips permanently on confirm, leaving the mission in place', async () => {
    const game = useGameStore()
    game.newGame(5)
    const wrapper = render()
    await nextTick()

    await wrapper.find('[data-test="tutorial-skip"]').trigger('click')
    await nextTick()
    await wrapper.find('[data-test="tutorial-skip-confirm-yes"]').trigger('click')
    await nextTick()

    expect(game.gameState.tutorialStatus).toBe('skipped')
    expect(wrapper.find('[data-test="tutorial-overlay"]').exists()).toBe(false)
    // The mission is untouched by the skip - it demotes to a normal mission.
    expect(game.gameState.storyMissions.some((r) => r.missionId === LOT.missionId)).toBe(true)
  })
})
