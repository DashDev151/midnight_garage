import {
  CARS,
  PARTS,
  type ConditionBand,
  type Part,
  type PartInstance,
  type ServiceJob,
} from '@midnight-garage/content'
import { makeCarOrigin, makeMarketOrigin } from '@midnight-garage/sim'
import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import PartCard from './PartCard.vue'

/**
 * Every wrapper is tracked
 * and unmounted after its test, so a component left mounted from a prior test
 * cannot leak its store's pinia into the next (see App/CarDetailScreen).
 */
const mountedWrappers: VueWrapper[] = []
function mountCard(options: ComponentMountingOptions<typeof PartCard>) {
  const wrapper = mount(PartCard, options)
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

const part = PARTS.find((p) => p.carPartId === 'dampers')!

const instance: PartInstance = {
  id: 'pi-1',
  partId: part.id,
  band: 'mint',
  origin: makeMarketOrigin(1),
}

describe('PartCard (Sprint 24 fix 5; scrap + rotary marker in Sprint 28)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  it('fits=true emits select on a plain click', async () => {
    const wrapper = mountCard({ props: { instance, part, fits: true } })
    await wrapper.find('.part-card').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[instance.id]])
  })

  it('fits=false blocks the select emit and applies the disabled style', async () => {
    const wrapper = mountCard({ props: { instance, part, fits: false } })
    expect(wrapper.find('.part-card').classes()).toContain('no-fit')
    await wrapper.find('.part-card').trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('the grab-handle picks even a non-fitting part (Sprint 24 fix 1 depends on this)', async () => {
    const wrapper = mountCard({ props: { instance, part, fits: false } })
    await wrapper.find(`[data-test="pick-part-${instance.id}"]`).trigger('click')
    expect(wrapper.find('.part-card').classes()).toContain('picked')
  })

  it('defaults fits to true when omitted', () => {
    const wrapper = mountCard({ props: { instance, part } })
    expect(wrapper.find('.part-card').classes()).not.toContain('no-fit')
  })

  it('shows the instance’s own condition band (Sprint 33 decision 5)', () => {
    const wornInstance: PartInstance = { ...instance, id: 'pi-worn', band: 'worn' }
    const wrapper = mountCard({ props: { instance: wornInstance, part } })
    expect(wrapper.find('.band-chip.band-worn').exists()).toBe(true)
  })

  describe('a scrap-band instance (Sprint 26 decision 6, Sprint 28 UI)', () => {
    function grantScrapInstance() {
      const game = useGameStore()
      game.devGrantPart(part.id)
      const granted = game.gameState.partInventory[0]!
      game.gameState = { ...game.gameState, partInventory: [{ ...granted, band: 'scrap' }] }
      return { game, scrapInstance: game.gameState.partInventory[0]! }
    }

    it('shows "Scrap it" instead of the pick/install affordance', () => {
      const { scrapInstance } = grantScrapInstance()
      const wrapper = mountCard({ props: { instance: scrapInstance, part } })

      expect(wrapper.find('.part-card').classes()).toContain('scrap')
      expect(wrapper.find(`[data-test="pick-part-${scrapInstance.id}"]`).exists()).toBe(false)
      expect(wrapper.find(`[data-test="scrap-part-${scrapInstance.id}"]`).exists()).toBe(true)
    })

    it('a plain click never emits select (never installable anywhere)', async () => {
      const { scrapInstance } = grantScrapInstance()
      const wrapper = mountCard({ props: { instance: scrapInstance, part } })
      await wrapper.find('.part-card').trigger('click')
      expect(wrapper.emitted('select')).toBeUndefined()
    })

    it('clicking "Scrap it" twice (arm, then confirm) sells it for real cash and removes it from inventory', async () => {
      const { game, scrapInstance } = grantScrapInstance()
      const cashBefore = game.cashYen
      const wrapper = mountCard({ props: { instance: scrapInstance, part } })
      const scrapButton = wrapper.find(`[data-test="scrap-part-${scrapInstance.id}"]`)

      await scrapButton.trigger('click')
      expect(game.gameState.partInventory).toHaveLength(1)
      expect(game.cashYen).toBe(cashBefore)
      expect(scrapButton.text()).toMatch(/^Scrap for ¥[\d,]+\?/)

      await scrapButton.trigger('click')
      expect(game.gameState.partInventory).toHaveLength(0)
      expect(game.cashYen).toBeGreaterThan(cashBefore)
    })
  })

  describe('the Sell arm-then-confirm guard', () => {
    /** One player-owned mint part in the store, so the card renders the Sell
     * handle and a sale actually moves inventory and cash. */
    function grantSellablePart() {
      const game = useGameStore()
      game.devGrantPart(part.id)
      return { game, sellable: game.gameState.partInventory[0]! }
    }

    it('a single click arms the button instead of selling', async () => {
      const { game, sellable } = grantSellablePart()
      const cashBefore = game.cashYen
      const wrapper = mountCard({ props: { instance: sellable, part } })
      const sellButton = wrapper.find(`[data-test="sell-part-${sellable.id}"]`)

      expect(sellButton.text()).toMatch(/^Sell \(¥[\d,]+\)$/)
      await sellButton.trigger('click')

      expect(game.gameState.partInventory).toHaveLength(1)
      expect(game.cashYen).toBe(cashBefore)
      expect(sellButton.text()).toMatch(/^Sell for ¥[\d,]+\?$/)
      expect(sellButton.classes()).toContain('armed')
    })

    it('a second click while armed sells', async () => {
      const { game, sellable } = grantSellablePart()
      const cashBefore = game.cashYen
      const wrapper = mountCard({ props: { instance: sellable, part } })
      const sellButton = wrapper.find(`[data-test="sell-part-${sellable.id}"]`)

      await sellButton.trigger('click')
      await sellButton.trigger('click')

      expect(game.gameState.partInventory).toHaveLength(0)
      expect(game.cashYen).toBeGreaterThan(cashBefore)
    })

    it('the pointer leaving the card disarms, so the next click arms again rather than selling', async () => {
      const { game, sellable } = grantSellablePart()
      const wrapper = mountCard({ props: { instance: sellable, part } })
      const sellButton = wrapper.find(`[data-test="sell-part-${sellable.id}"]`)

      await sellButton.trigger('click')
      await wrapper.find('.part-card').trigger('pointerleave')
      expect(sellButton.classes()).not.toContain('armed')

      await sellButton.trigger('click')
      expect(game.gameState.partInventory).toHaveLength(1)
      expect(sellButton.classes()).toContain('armed')
    })

    it('any other card action disarms (the pick toggle here)', async () => {
      const { game, sellable } = grantSellablePart()
      const wrapper = mountCard({ props: { instance: sellable, part } })
      const sellButton = wrapper.find(`[data-test="sell-part-${sellable.id}"]`)

      await sellButton.trigger('click')
      await wrapper.find(`[data-test="pick-part-${sellable.id}"]`).trigger('click')

      expect(sellButton.classes()).not.toContain('armed')
      expect(game.gameState.partInventory).toHaveLength(1)
    })

    it('the arm stands down on its own after the timeout', async () => {
      vi.useFakeTimers()
      try {
        const { game, sellable } = grantSellablePart()
        const wrapper = mountCard({ props: { instance: sellable, part } })
        const sellButton = wrapper.find(`[data-test="sell-part-${sellable.id}"]`)

        await sellButton.trigger('click')
        expect(sellButton.classes()).toContain('armed')

        vi.advanceTimersByTime(4000)
        await wrapper.vm.$nextTick()

        expect(sellButton.classes()).not.toContain('armed')
        await sellButton.trigger('click')
        expect(game.gameState.partInventory).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('the rotary marker (Sprint 28)', () => {
    it('shows on a Rotary-only part', () => {
      // No real catalog part carries `requiredTags` today (rotary
      // authenticity is explicitly deferred) - the marker
      // component itself still keys off `requiredTags.includes('Rotary')`
      // (PartCard.vue), so a synthetic fixture proves the mechanism works
      // even though no live catalog part currently exercises it.
      const rotaryPart: Part = { ...part, requiredTags: ['Rotary'] }
      const rotaryInstance: PartInstance = {
        id: 'pi-rotary',
        partId: rotaryPart.id,
        band: 'mint',
        origin: makeMarketOrigin(1),
      }
      const wrapper = mountCard({ props: { instance: rotaryInstance, part: rotaryPart } })
      expect(wrapper.find('.rotary-marker').exists()).toBe(true)
    })

    it('is omitted on a part with no Rotary requirement', () => {
      const wrapper = mountCard({ props: { instance, part } })
      expect(wrapper.find('.rotary-marker').exists()).toBe(false)
    })
  })

  describe('customer-owned parts, and where a part is', () => {
    /** Put one inventory part into the store at `band`, in the warehouse and
     * on no station. */
    function grantInventoryPart(band: ConditionBand) {
      const game = useGameStore()
      game.devGrantPart(part.id)
      const granted = game.gameState.partInventory[0]!
      const instance: PartInstance = { ...granted, band }
      game.gameState = { ...game.gameState, partInventory: [instance] }
      return { game, instance }
    }

    /**
     * Ownership is read from the instance's own `origin` against
     * every active service job (`game.isCustomerOwnedPart`), not a mutable
     * `customerJobId` tag - the store needs a real active service job whose
     * car matches the origin for the badge/lock to have anything to key off.
     */
    function grantCustomerOwnedPart(band: ConditionBand) {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const customerCar = game.gameState.ownedCars[0]!
      const fakeJob: ServiceJob = {
        id: 'svc-1-0',
        typeId: 'small-bodywork-touchup',
        customerName: 'Test Customer',
        description: 'test fixture',
        tasks: [],
        car: customerCar,
        payoutYen: 1,
        baseReputation: 1,
        deadlineDays: 1,
        expiresOnDay: 999,
        arrivesOnDay: null,
        dueOnDay: 1,
      }
      const tagged: PartInstance = {
        ...instance,
        band,
        origin: makeCarOrigin(customerCar.id, 'Customer Car', 0),
      }
      game.gameState = {
        ...game.gameState,
        partInventory: [tagged],
        activeServiceJobs: [fakeJob],
      }
      return { game, tagged }
    }

    it('shows the customer-owned badge for a tagged part, and none for a player-owned one', () => {
      const { tagged } = grantCustomerOwnedPart('mint')
      const withBadge = mountCard({ props: { instance: tagged, part } })
      expect(withBadge.find(`[data-test="customer-owned-${tagged.id}"]`).exists()).toBe(true)

      const noBadge = mountCard({ props: { instance, part } })
      expect(noBadge.find(`[data-test="customer-owned-${instance.id}"]`).exists()).toBe(false)
    })

    it('locks scrap for a customer-owned scrap part (disabled reason, no Scrap button)', () => {
      const { tagged: customerScrap } = grantCustomerOwnedPart('scrap')
      const wrapper = mountCard({ props: { instance: customerScrap, part } })
      expect(wrapper.find(`[data-test="scrap-locked-${customerScrap.id}"]`).exists()).toBe(true)
      expect(wrapper.find(`[data-test="scrap-part-${customerScrap.id}"]`).exists()).toBe(false)
    })

    /**
     * Storage lists, holds and hands over; it does no work. A card offers no
     * repair of its own wherever it is rendered - the workshop floor's bench
     * is the only place a loose part is put right.
     */
    it('offers no repair control at all, even on a below-mint part', () => {
      const { instance: worn } = grantInventoryPart('worn')
      const wrapper = mountCard({ props: { instance: worn, part } })
      expect(wrapper.find(`[data-test="recondition-part-${worn.id}"]`).exists()).toBe(false)
    })

    it('marks a part out on the bench, and a part on the machine, by where it is', () => {
      const { game, instance: worn } = grantInventoryPart('worn')

      game.gameState = { ...game.gameState, workbenchPartId: worn.id }
      const onBench = mountCard({ props: { instance: worn, part } })
      expect(onBench.find(`[data-test="part-station-${worn.id}"]`).text()).toBe('on the bench')

      game.gameState = { ...game.gameState, workbenchPartId: null, machinePartId: worn.id }
      const onMachine = mountCard({ props: { instance: worn, part } })
      expect(onMachine.find(`[data-test="part-station-${worn.id}"]`).text()).toBe('on the machine')
    })

    it('leaves a part sitting in the warehouse unmarked', () => {
      const { instance: worn } = grantInventoryPart('worn')
      const wrapper = mountCard({ props: { instance: worn, part } })
      expect(wrapper.find(`[data-test="part-station-${worn.id}"]`).exists()).toBe(false)
    })
  })
})
