import { CARS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import PartsDiagram from './PartsDiagram.vue'

let pinia: Pinia

function grantCar() {
  const game = useGameStore()
  game.devGrantCar(CARS[0]!.id)
  return { game, carId: game.gameState.ownedCars.at(-1)!.id }
}

function mountFor(carId: string) {
  return mount(PartsDiagram, { props: { carId }, global: { plugins: [pinia] } })
}

const ENGINE_MEMBER_COUNT = PARTS_TAXONOMY.filter((e) => e.group === 'engine').length
const SUSPENSION_MEMBER_COUNT = PARTS_TAXONOMY.filter((e) => e.group === 'suspension').length

describe('PartsDiagram (two-level, Sprint 84 amendment)', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('level 1 by default: six group tiles, no part slots, no back control', () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)
    expect(wrapper.findAll('.pd-tile')).toHaveLength(6)
    expect(wrapper.findAll('.pd-slot')).toHaveLength(0)
    expect(wrapper.find('[data-test="diagram-back"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="diagram-tile-engine"]').text()).toContain(
      `${ENGINE_MEMBER_COUNT} parts`,
    )
  })

  it('hovering a tile summarises it in the inspector, with the outside-dependency hint only where the taxonomy has one', async () => {
    const { game, carId } = grantCar()
    const wrapper = mountFor(carId)
    const inspector = () => wrapper.get('[data-test="diagram-inspector"]').text()

    // Suspension: brakes are blocked by rims (wheels group) - the hint shows.
    await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('pointerenter')
    expect(inspector()).toContain(game.componentLabel('suspension'))
    expect(inspector()).toContain(`${SUSPENSION_MEMBER_COUNT} parts`)
    expect(inspector()).toContain(`Parts here sit under: ${game.componentLabel('wheels')}`)
    await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('pointerleave')

    // Engine: every blocker is engine-internal - no hint.
    await wrapper.get('[data-test="diagram-tile-engine"]').trigger('pointerenter')
    expect(inspector()).toContain(game.componentLabel('engine'))
    expect(inspector()).not.toContain('sit under')
  })

  it("clicking a tile opens level 2 with that group's slots and never emits select; back returns to the tiles", async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)

    await wrapper.get('[data-test="diagram-tile-engine"]').trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
    // All engine members render (no visitors: engine blocking is internal).
    expect(wrapper.findAll('.pd-slot')).toHaveLength(ENGINE_MEMBER_COUNT)
    expect(wrapper.find('[data-test="diagram-slot-block"]').exists()).toBe(true)
    expect(wrapper.findAll('.pd-tile')).toHaveLength(0)

    await wrapper.get('[data-test="diagram-back"]').trigger('click')
    expect(wrapper.findAll('.pd-tile')).toHaveLength(6)
    expect(wrapper.findAll('.pd-slot')).toHaveLength(0)
  })

  it('renders an outside blocker as a visitor: rims visits the suspension view, red when fitted (load-bearing)', async () => {
    const { game, carId } = grantCar()
    const wrapper = mountFor(carId)

    await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('click')
    // Members plus the one visiting blocker (rims, from wheels).
    expect(wrapper.findAll('.pd-slot')).toHaveLength(SUSPENSION_MEMBER_COUNT + 1)
    const rims = wrapper.get('[data-test="diagram-slot-rims"]')
    expect(rims.classes()).toContain('visitor')
    expect(rims.text()).toContain(game.componentLabel('wheels'))

    // Hovering the brakes flags the still-fitted rims as in the way, exactly
    // like a native blocker.
    await wrapper.get('[data-test="diagram-slot-brakePadsDiscs"]').trigger('pointerenter')
    expect(rims.classes()).toContain('blocker-fitted')
  })

  it('a pulled visitor blocker reads as cleared, and a pulled member as a ghost in place', async () => {
    const { game, carId } = grantCar()
    // Sprint 87 decision 6: rims is a wheel-assembly member now, so it never
    // comes off per-part - pulling the whole assembly vacates the slot instead
    // (the diagram concern under test, a cleared visitor, is unchanged).
    expect(game.removePart(carId, 'rims')).toBe(false)
    expect(game.removeAssembly(carId, 'wheelAssembly')).toBe(true)
    expect(game.removePart(carId, 'dampers')).toBe(true)
    const wrapper = mountFor(carId)

    await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('click')
    // Every slot still renders - the ghost holds the empty slot's position.
    expect(wrapper.findAll('.pd-slot')).toHaveLength(SUSPENSION_MEMBER_COUNT + 1)
    expect(wrapper.get('[data-test="diagram-slot-dampers"]').classes()).toContain('ghost')

    await wrapper.get('[data-test="diagram-slot-brakePadsDiscs"]').trigger('pointerenter')
    const rims = wrapper.get('[data-test="diagram-slot-rims"]')
    expect(rims.classes()).toContain('blocker-clear')
    expect(rims.classes()).not.toContain('blocker-fitted')
  })

  it('level 2: names the hovered part in the inspector and emits select on part click', async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)
    await wrapper.get('[data-test="diagram-tile-engine"]').trigger('click')

    const inspector = () => wrapper.get('[data-test="diagram-inspector"]').text()
    expect(inspector()).not.toContain('Intake')
    await wrapper.get('[data-test="diagram-slot-intake"]').trigger('pointerenter')
    expect(inspector()).toContain('Intake')
    await wrapper.get('[data-test="diagram-slot-block"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['block'])
  })

  it('resets to level 1 when shown a different car', async () => {
    const { carId } = grantCar()
    const { carId: otherCarId } = grantCar()
    const wrapper = mountFor(carId)

    await wrapper.get('[data-test="diagram-tile-engine"]').trigger('click')
    expect(wrapper.findAll('.pd-slot').length).toBeGreaterThan(0)

    await wrapper.setProps({ carId: otherCarId })
    expect(wrapper.findAll('.pd-tile')).toHaveLength(6)
    expect(wrapper.findAll('.pd-slot')).toHaveLength(0)
  })
})
