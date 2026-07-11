import { CARS, PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import ReplaceDrawer from './ReplaceDrawer.vue'

describe('ReplaceDrawer (Sprint 24 fix 5; retargeted to a specific part in Sprint 28)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows only parts addressed to this exact carPartId, fitting and non-fitting alike, each flagged correctly', () => {
    const game = useGameStore()
    // honda-city-e-aa: Piston, not Rotary - so a Rotary-only forcedInduction
    // kit doesn't fit it, while a Piston-tagged one does (both share the
    // forcedInduction address, so both belong in this one drawer).
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const fitting = PARTS.find(
      (p) => p.carPartId === 'forcedInduction' && p.requiredTags.includes('Piston'),
    )!
    const nonFitting = PARTS.find(
      (p) => p.carPartId === 'forcedInduction' && p.requiredTags.includes('Rotary'),
    )!
    // A totally different address - must never appear in this drawer at all.
    const wrongAddress = PARTS.find((p) => p.carPartId === 'ignitionEcu')!
    game.devGrantPart(fitting.id)
    game.devGrantPart(nonFitting.id)
    game.devGrantPart(wrongAddress.id)

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, carPartId: 'forcedInduction' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.findAll('.part-card')).toHaveLength(2)
    expect(wrapper.findAll('.part-card.no-fit')).toHaveLength(1)
    expect(wrapper.text()).not.toContain(wrongAddress.name)
  })

  it('clicking a fitting part stages it (addressed to this exact carPartId) and emits close', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const fitting = PARTS.find((p) => p.carPartId === 'dampers' && p.requiredTags.length === 0)!
    game.devGrantPart(fitting.id)
    const partInstanceId = game.gameState.partInventory[0]!.id

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, carPartId: 'dampers' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('.part-card').trigger('click')

    expect(game.stagedActionsFor(carId)).toEqual([
      { kind: 'install', componentId: 'suspension', carPartId: 'dampers', partInstanceId },
    ])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('clicking a non-fitting part stages nothing and emits no close', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const nonFitting = PARTS.find(
      (p) => p.carPartId === 'forcedInduction' && p.requiredTags.includes('Rotary'),
    )!
    game.devGrantPart(nonFitting.id)

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, carPartId: 'forcedInduction' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('.part-card').trigger('click')

    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('a scrap instance addressed to this part never appears here (never installable anywhere)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const fitting = PARTS.find((p) => p.carPartId === 'dampers' && p.requiredTags.length === 0)!
    game.devGrantPart(fitting.id)
    const instance = game.gameState.partInventory[0]!
    game.gameState = {
      ...game.gameState,
      partInventory: [{ ...instance, band: 'scrap' }],
    }

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, carPartId: 'dampers' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('.part-card').exists()).toBe(false)
    expect(wrapper.text()).toContain('No parts on hand')
  })

  it('renders the empty-inventory state with a link to the parts market', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id

    const wrapper = mount(ReplaceDrawer, {
      props: { carId, carPartId: 'dampers' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.find('.part-card').exists()).toBe(false)
    expect(wrapper.text()).toContain('No parts on hand')
  })
})
