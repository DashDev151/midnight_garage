import { CARS, PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import ReplaceDrawer from './ReplaceDrawer.vue'

describe('ReplaceDrawer (Sprint 24 fix 5)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders every owned, unstaged part - fitting and non-fitting alike - each flagged correctly', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const fitting = PARTS.find(
      (p) => p.componentId === 'suspension' && p.requiredTags.length === 0,
    )!
    const wrongPart = PARTS.find((p) => p.componentId === 'brakes')!
    game.devGrantPart(fitting.id)
    game.devGrantPart(wrongPart.id)

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, componentId: 'suspension' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    // Shown either way (Sprint 18 round-2 decision) - not filtered down.
    expect(wrapper.findAll('.part-card')).toHaveLength(2)
    expect(wrapper.findAll('.part-card.no-fit')).toHaveLength(1)
  })

  it('clicking a fitting part stages it and emits close', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const fitting = PARTS.find(
      (p) => p.componentId === 'suspension' && p.requiredTags.length === 0,
    )!
    game.devGrantPart(fitting.id)
    const partInstanceId = game.gameState.partInventory[0]!.id

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, componentId: 'suspension' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('.part-card').trigger('click')

    expect(game.stagedActionsFor(carId)).toEqual([
      { kind: 'install', componentId: 'suspension', partInstanceId },
    ])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('clicking a non-fitting part stages nothing and emits no close', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const wrongPart = PARTS.find((p) => p.componentId === 'brakes')!
    game.devGrantPart(wrongPart.id)

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, componentId: 'suspension' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('.part-card').trigger('click')

    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('renders the empty-inventory state with a link to the parts market', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, componentId: 'suspension' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.find('.part-card').exists()).toBe(false)
    expect(wrapper.text()).toContain('No parts on hand')
  })
})
