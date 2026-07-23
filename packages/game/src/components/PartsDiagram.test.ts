import { CARS, PARTS_TAXONOMY, type ComponentId } from '@midnight-garage/content'
import { makeMarketOrigin } from '@midnight-garage/sim'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import PartsDiagram from './PartsDiagram.vue'

let pinia: Pinia

function grantCar(modelId?: string) {
  const game = useGameStore()
  game.devGrantCar(modelId ?? CARS[0]!.id)
  return { game, carId: game.gameState.ownedCars.at(-1)!.id }
}

/** Forces every member of `groupId` (bar `forcedInduction`, whose empty slot
 * is only sometimes a defect) onto the car at mint - deterministic fixture
 * setup that doesn't depend on a granted car's own random condition roll.
 * Also clears any rolled symptom: a granted car's true band moves here, but
 * a symptom's own `apparentBandByPartId` override does not, so a real roll
 * landing on this group could otherwise leave a stale "uncertain" wash over
 * a part this fixture just set to mint. */
function fitAllMembers(game: ReturnType<typeof useGameStore>, carId: string, groupId: ComponentId) {
  const car = game.gameState.ownedCars.find((c) => c.id === carId)!
  car.symptoms = []
  car.apparentBandByPartId = null
  for (const entry of PARTS_TAXONOMY.filter(
    (e) => e.group === groupId && e.id !== 'forcedInduction',
  )) {
    car.parts[entry.id] = {
      installed: {
        id: `test-${entry.id}`,
        partId: entry.id,
        band: 'mint',
        genuinePeriod: false,
        origin: makeMarketOrigin(game.gameState.day),
      },
    }
  }
}

function mountFor(carId: string) {
  return mount(PartsDiagram, { props: { carId }, global: { plugins: [pinia] } })
}

const ENGINE_MEMBER_COUNT = PARTS_TAXONOMY.filter((e) => e.group === 'engine').length
const SUSPENSION_MEMBER_COUNT = PARTS_TAXONOMY.filter((e) => e.group === 'suspension').length

describe('PartsDiagram (two-level)', () => {
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
    // Rims is a wheel-assembly member now, so it never comes off per-part -
    // pulling the whole assembly vacates the slot instead (the diagram concern
    // under test, a cleared visitor, is unchanged).
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

  describe('the condition wash', () => {
    it('the corner dot is gone at both levels - the wash replaced it', async () => {
      const { carId } = grantCar()
      const wrapper = mountFor(carId)
      expect(wrapper.find('.pd-cond-dot').exists()).toBe(false)
      await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('click')
      expect(wrapper.find('.pd-cond-dot').exists()).toBe(false)
    })

    it('a fitted slot carries its band wash class, always on', async () => {
      const { game, carId } = grantCar()
      const car = game.gameState.ownedCars.at(-1)!
      car.parts.dampers = { installed: { ...car.parts.dampers.installed!, band: 'poor' } }
      const wrapper = mountFor(carId)

      await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('click')
      const slot = wrapper.get('[data-test="diagram-slot-dampers"]')
      expect(slot.classes()).toContain('pd-washed')
      expect(slot.classes()).toContain('pd-wash-poor')
    })

    it('an empty slot stays an unwashed ghost - no condition, no tint', async () => {
      const { game, carId } = grantCar()
      expect(game.removePart(carId, 'dampers')).toBe(true)
      const wrapper = mountFor(carId)

      await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('click')
      const slot = wrapper.get('[data-test="diagram-slot-dampers"]')
      expect(slot.classes()).toContain('ghost')
      expect(slot.classes()).not.toContain('pd-washed')
    })

    it('an uncertain part keeps a neutral wash - never the band the player cannot trust yet', async () => {
      const { game, carId } = grantCar()
      // The same content-backed symptomatic fixture the car-detail tests use:
      // the true band is worn, the apparent band mint, and the open symptom
      // makes the row uncertain.
      game.gameState = {
        ...game.gameState,
        ownedCars: game.gameState.ownedCars.map((c) =>
          c.id === carId
            ? {
                ...c,
                parts: {
                  ...c.parts,
                  headValvetrain: {
                    installed: { ...c.parts.headValvetrain.installed!, band: 'worn' as const },
                  },
                },
                symptoms: [
                  {
                    symptomId: 'smokes-on-startup',
                    trueCauseId: 'valve-seals',
                    remainingCauseIds: ['valve-seals', 'tired-rings', 'head-gasket'],
                    runTestIds: [],
                  },
                ],
                apparentBandByPartId: { headValvetrain: 'mint' as const },
              }
            : c,
        ),
      }
      const wrapper = mountFor(carId)

      await wrapper.get('[data-test="diagram-tile-engine"]').trigger('click')
      const slot = wrapper.get('[data-test="diagram-slot-headValvetrain"]')
      expect(slot.classes()).toContain('pd-wash-neutral')
      expect(slot.classes()).not.toContain('pd-wash-mint')
      expect(slot.classes()).not.toContain('pd-wash-worn')
    })

    it('a level-1 group tile carries the wash too, for glanceability before drilling in', () => {
      const { carId } = grantCar()
      const wrapper = mountFor(carId)
      expect(wrapper.get('[data-test="diagram-tile-suspension"]').classes()).toContain('pd-washed')
    })
  })

  describe('the open/incomplete state (a real defect empty slot, never the healthy colour)', () => {
    it('a fully disassembled group never reads healthy', () => {
      const { game, carId } = grantCar()
      expect(game.removeAssembly(carId, 'wheelAssembly')).toBe(true)
      const wrapper = mountFor(carId)
      const tile = wrapper.get('[data-test="diagram-tile-wheels"]')
      expect(tile.classes()).not.toContain('pd-wash-mint')
      expect(tile.classes()).toContain('pd-wash-open')
    })

    it('a naturally-aspirated car with an otherwise fully fitted engine is not incomplete - the legitimately-empty forcedInduction slot alone never counts', () => {
      const naModel = CARS.find(
        (m) => !m.tags.includes('Turbo') && !m.tags.includes('Supercharged'),
      )!
      const { game, carId } = grantCar(naModel.id)
      fitAllMembers(game, carId, 'engine')
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      expect(car.parts.forcedInduction.installed).toBeNull()

      const wrapper = mountFor(carId)
      const tile = wrapper.get('[data-test="diagram-tile-engine"]')
      expect(tile.classes()).not.toContain('pd-wash-open')
      expect(tile.classes()).toContain('pd-wash-mint')
    })

    it('a group with every member fitted stays the healthy green', () => {
      const { game, carId } = grantCar()
      fitAllMembers(game, carId, 'suspension')
      const wrapper = mountFor(carId)
      const tile = wrapper.get('[data-test="diagram-tile-suspension"]')
      expect(tile.classes()).toContain('pd-wash-mint')
      expect(tile.classes()).not.toContain('pd-wash-open')
    })
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

  describe('click-blocking (playtest item 5 hotfix: a removed blocker must not steal clicks)', () => {
    it('with rims removed, brake pads outranks rims in stacking order and stays selectable', async () => {
      const { game, carId } = grantCar()
      // Rims is a wheel-assembly member - pulling the whole assembly is how it
      // comes off, exactly like the existing "pulled visitor blocker" fixture.
      expect(game.removeAssembly(carId, 'wheelAssembly')).toBe(true)
      const wrapper = mountFor(carId)
      await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('click')

      const rims = wrapper.get('[data-test="diagram-slot-rims"]')
      const brakePads = wrapper.get('[data-test="diagram-slot-brakePadsDiscs"]')
      expect(rims.classes()).toContain('ghost')

      // happy-dom runs no real layout/paint, so a bare `trigger('click')` on
      // the brakes element cannot reproduce the actual pixel-overlap bug - it
      // bypasses hit-testing entirely and would pass even with the bug live.
      // What actually proves the fix is the z-index each element renders
      // with, the CSS stacking order a real browser's hit-testing honours: a
      // removed (ghost) rims must render BELOW the still-fitted brake pads
      // slot it used to sit over, so the brakes receive the click instead of
      // the empty rim tile.
      const rimsZ = Number((rims.element as HTMLElement).style.zIndex)
      const brakesZ = Number((brakePads.element as HTMLElement).style.zIndex)
      expect(brakesZ).toBeGreaterThan(rimsZ)

      // Brake pads remains reachable and selects itself, unblocked.
      await brakePads.trigger('click')
      expect(wrapper.emitted('select')?.[0]).toEqual(['brakePadsDiscs'])
    })

    it('while rims IS fitted, it still outranks the brakes - unchanged: the wheel must come off first', async () => {
      const { carId } = grantCar()
      const wrapper = mountFor(carId)
      await wrapper.get('[data-test="diagram-tile-suspension"]').trigger('click')

      const rims = wrapper.get('[data-test="diagram-slot-rims"]')
      const brakePads = wrapper.get('[data-test="diagram-slot-brakePadsDiscs"]')
      const rimsZ = Number((rims.element as HTMLElement).style.zIndex)
      const brakesZ = Number((brakePads.element as HTMLElement).style.zIndex)
      expect(rimsZ).toBeGreaterThan(brakesZ)
    })
  })
})
