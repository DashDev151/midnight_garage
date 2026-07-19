import { CARS, PARTS } from '@midnight-garage/content'
import {
  mount,
  RouterLinkStub,
  type ComponentMountingOptions,
  type VueWrapper,
} from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import ReplaceDrawer from './ReplaceDrawer.vue'

/**
 * Sprint 82 decision 7 (Pinia multi-mount isolation): every wrapper is tracked
 * and unmounted after its test, so a component left mounted from a prior test
 * cannot leak its store's pinia into the next (see App/CarDetailScreen).
 */
const mountedWrappers: VueWrapper[] = []
function mountDrawer(options: ComponentMountingOptions<typeof ReplaceDrawer>) {
  const wrapper = mount(ReplaceDrawer, options)
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('ReplaceDrawer (Sprint 24 fix 5; retargeted to a specific part in Sprint 28)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows only parts addressed to this exact carPartId; an already-occupied slot flags every entry as not-fitting', () => {
    const game = useGameStore()
    // Sprint 32: every slot starts filled with a stock part by default -
    // forcedInduction stays genuinely empty on honda-city-e-aa (NA) though,
    // so leave that one alone and exercise the occupied case on a normally-
    // filled slot (dampers) instead.
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // CARS[0] (honda-city-e-aa) is 'shitbox' tier.
    const fitting = PARTS.find(
      (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
    )!
    // A totally different address - must never appear in this drawer at all.
    const wrongAddress = PARTS.find((p) => p.carPartId === 'ignitionEcu')!
    game.devGrantPart(fitting.id)
    game.devGrantPart(wrongAddress.id)

    const wrapper = mountDrawer({
      props: { carId, carPartId: 'dampers' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    // dampers is already stock-filled - the address-matching entry still
    // renders (the player sees their whole inventory), but dimmed and inert.
    expect(wrapper.findAll('.part-card')).toHaveLength(1)
    expect(wrapper.findAll('.part-card.no-fit')).toHaveLength(1)
    expect(wrapper.text()).not.toContain(wrongAddress.name)
  })

  it('clicking a fitting part stages it (addressed to this exact carPartId) and emits close', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // CARS[0] (honda-city-e-aa) is 'shitbox' tier.
    const fitting = PARTS.find(
      (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
    )!
    game.devGrantPart(fitting.id)
    const partInstanceId = game.gameState.partInventory[0]!.id
    // Empty the slot directly (bypassing removePart's own inventory side
    // effect) so this test's inventory holds exactly the one granted part.
    const car = game.gameState.ownedCars[0]!
    game.gameState = {
      ...game.gameState,
      ownedCars: [{ ...car, parts: { ...car.parts, dampers: { installed: null } } }],
    }

    const wrapper = mountDrawer({
      props: { carId, carPartId: 'dampers' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('.part-card').trigger('click')

    expect(game.stagedActionsFor(carId)).toEqual([
      { kind: 'install', componentId: 'suspension', carPartId: 'dampers', partInstanceId },
    ])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('clicking a non-fitting part (its slot is already occupied) stages nothing and emits no close', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // dampers is already stock-filled by default - nothing addressed to it
    // can actually land there without removing the incumbent first.
    const nonFitting = PARTS.find(
      (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
    )!
    game.devGrantPart(nonFitting.id)

    const wrapper = mountDrawer({
      props: { carId, carPartId: 'dampers' },
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
    game.removePart(carId, 'dampers')
    // CARS[0] (honda-city-e-aa) is 'shitbox' tier.
    const fitting = PARTS.find(
      (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
    )!
    game.devGrantPart(fitting.id)
    const instance = game.gameState.partInventory.at(-1)!
    game.gameState = {
      ...game.gameState,
      partInventory: [{ ...instance, band: 'scrap' }],
    }

    const wrapper = mountDrawer({
      props: { carId, carPartId: 'dampers' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('.part-card').exists()).toBe(false)
    expect(wrapper.text()).toContain('No parts on hand')
  })

  it('renders the empty-inventory state with a slot-prefiltered link to the parts market (Sprint 96 decision 2)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id

    const wrapper = mountDrawer({
      props: { carId, carPartId: 'dampers' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.find('.part-card').exists()).toBe(false)
    expect(wrapper.text()).toContain('No parts on hand')
    // A plain link to the market: the player navigates the shop themselves
    // (the slot deep link was scrapped the day it landed).
    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ name: 'parts' })
  })
})
