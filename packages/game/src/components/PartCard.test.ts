import {
  CARS,
  PARTS,
  type ConditionBand,
  type Part,
  type PartInstance,
  type ServiceJob,
} from '@midnight-garage/content'
import { makeCarOrigin, makeMarketOrigin } from '@midnight-garage/sim'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import PartCard from './PartCard.vue'

const part = PARTS.find((p) => p.carPartId === 'dampers')!

const instance: PartInstance = {
  id: 'pi-1',
  partId: part.id,
  band: 'mint',
  genuinePeriod: false,
  origin: makeMarketOrigin(1),
}

describe('PartCard (Sprint 24 fix 5; scrap + rotary marker in Sprint 28)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  it('fits=true emits select on a plain click', async () => {
    const wrapper = mount(PartCard, { props: { instance, part, fits: true } })
    await wrapper.find('.part-card').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[instance.id]])
  })

  it('fits=false blocks the select emit and applies the disabled style', async () => {
    const wrapper = mount(PartCard, { props: { instance, part, fits: false } })
    expect(wrapper.find('.part-card').classes()).toContain('no-fit')
    await wrapper.find('.part-card').trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('the grab-handle picks even a non-fitting part (Sprint 24 fix 1 depends on this)', async () => {
    const wrapper = mount(PartCard, { props: { instance, part, fits: false } })
    await wrapper.find(`[data-test="pick-part-${instance.id}"]`).trigger('click')
    expect(wrapper.find('.part-card').classes()).toContain('picked')
  })

  it('defaults fits to true when omitted', () => {
    const wrapper = mount(PartCard, { props: { instance, part } })
    expect(wrapper.find('.part-card').classes()).not.toContain('no-fit')
  })

  it('shows the instance’s own condition band (Sprint 33 decision 5)', () => {
    const wornInstance: PartInstance = { ...instance, id: 'pi-worn', band: 'worn' }
    const wrapper = mount(PartCard, { props: { instance: wornInstance, part } })
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
      const wrapper = mount(PartCard, { props: { instance: scrapInstance, part } })

      expect(wrapper.find('.part-card').classes()).toContain('scrap')
      expect(wrapper.find(`[data-test="pick-part-${scrapInstance.id}"]`).exists()).toBe(false)
      expect(wrapper.find(`[data-test="scrap-part-${scrapInstance.id}"]`).exists()).toBe(true)
    })

    it('a plain click never emits select (never installable anywhere)', async () => {
      const { scrapInstance } = grantScrapInstance()
      const wrapper = mount(PartCard, { props: { instance: scrapInstance, part } })
      await wrapper.find('.part-card').trigger('click')
      expect(wrapper.emitted('select')).toBeUndefined()
    })

    it('clicking "Scrap it" sells it for real cash and removes it from inventory', async () => {
      const { game, scrapInstance } = grantScrapInstance()
      const cashBefore = game.cashYen
      const wrapper = mount(PartCard, { props: { instance: scrapInstance, part } })

      await wrapper.find(`[data-test="scrap-part-${scrapInstance.id}"]`).trigger('click')

      expect(game.gameState.partInventory).toHaveLength(0)
      expect(game.cashYen).toBeGreaterThan(cashBefore)
    })
  })

  describe('the rotary marker (Sprint 28)', () => {
    it('shows on a Rotary-only part', () => {
      // Sprint 32 decision 1 drops `requiredTags` from every real catalog
      // part (rotary authenticity is explicitly deferred) - the marker
      // component itself still keys off `requiredTags.includes('Rotary')`
      // (PartCard.vue), so a synthetic fixture proves the mechanism works
      // even though no live catalog part currently exercises it.
      const rotaryPart: Part = { ...part, requiredTags: ['Rotary'] }
      const rotaryInstance: PartInstance = {
        id: 'pi-rotary',
        partId: rotaryPart.id,
        band: 'mint',
        genuinePeriod: false,
        origin: makeMarketOrigin(1),
      }
      const wrapper = mount(PartCard, { props: { instance: rotaryInstance, part: rotaryPart } })
      expect(wrapper.find('.rotary-marker').exists()).toBe(true)
    })

    it('is omitted on a part with no Rotary requirement', () => {
      const wrapper = mount(PartCard, { props: { instance, part } })
      expect(wrapper.find('.rotary-marker').exists()).toBe(false)
    })
  })

  describe('customer-owned parts + in-inventory recondition (Sprint 35)', () => {
    /** Put one below-mint inventory part into the store so the recondition
     * quote (which reads gameState.partInventory) resolves, and return it. */
    function grantInventoryPart(band: ConditionBand) {
      const game = useGameStore()
      game.devGrantPart(part.id)
      const granted = game.gameState.partInventory[0]!
      const instance: PartInstance = { ...granted, band }
      game.gameState = { ...game.gameState, partInventory: [instance] }
      return { game, instance }
    }

    /**
     * Sprint 70: ownership is read from the instance's own `origin` against
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
      const withBadge = mount(PartCard, { props: { instance: tagged, part } })
      expect(withBadge.find(`[data-test="customer-owned-${tagged.id}"]`).exists()).toBe(true)

      const noBadge = mount(PartCard, { props: { instance, part } })
      expect(noBadge.find(`[data-test="customer-owned-${instance.id}"]`).exists()).toBe(false)
    })

    it('locks scrap for a customer-owned scrap part (disabled reason, no Scrap button)', () => {
      const { tagged: customerScrap } = grantCustomerOwnedPart('scrap')
      const wrapper = mount(PartCard, { props: { instance: customerScrap, part } })
      expect(wrapper.find(`[data-test="scrap-locked-${customerScrap.id}"]`).exists()).toBe(true)
      expect(wrapper.find(`[data-test="scrap-part-${customerScrap.id}"]`).exists()).toBe(false)
    })

    it('offers an enabled recondition control on a below-mint part at tier 1 - no tooling gate exists (Sprint 36)', () => {
      const { instance: worn } = grantInventoryPart('worn') // nothing upgraded
      const wrapper = mount(PartCard, { props: { instance: worn, part } })
      const button = wrapper.find(`[data-test="recondition-part-${worn.id}"]`)
      expect(button.exists()).toBe(true)
      expect(button.attributes('disabled')).toBeUndefined()
    })

    it("disables the recondition control once today's labor is spent (the labor gate stays)", () => {
      const { game, instance: worn } = grantInventoryPart('worn')
      game.gameState = { ...game.gameState, laborSlotsSpentToday: 99 }
      const wrapper = mount(PartCard, { props: { instance: worn, part } })
      expect(
        wrapper.find(`[data-test="recondition-part-${worn.id}"]`).attributes('disabled'),
      ).toBeDefined()
    })

    it('omits the recondition control on a mint part (nothing to climb)', () => {
      const { instance: mint } = grantInventoryPart('mint')
      const wrapper = mount(PartCard, { props: { instance: mint, part } })
      expect(wrapper.find(`[data-test="recondition-part-${mint.id}"]`).exists()).toBe(false)
    })

    it('suppresses the recondition control when show-recondition is false (the Replace drawer)', () => {
      const { instance: worn } = grantInventoryPart('worn')
      const wrapper = mount(PartCard, {
        props: { instance: worn, part, showRecondition: false },
      })
      expect(wrapper.find(`[data-test="recondition-part-${worn.id}"]`).exists()).toBe(false)
    })

    /**
     * Sprint 48: recondition is click-per-rung now, same as an on-car
     * repair - one click climbs exactly one band, priced/labored off the
     * real next-rung quote, never straight to mint in a single click.
     */
    it('clicking Recondition climbs the loose part exactly one band through the store', async () => {
      const { game, instance: worn } = grantInventoryPart('worn')
      const wrapper = mount(PartCard, { props: { instance: worn, part } })

      await wrapper.find(`[data-test="recondition-part-${worn.id}"]`).trigger('click')

      expect(game.gameState.partInventory[0]?.band).toBe('fine')
    })

    it('clicking Recondition repeatedly climbs one rung at a time until mint', async () => {
      const { game, instance: poor } = grantInventoryPart('poor')
      const wrapper = mount(PartCard, { props: { instance: poor, part } })

      await wrapper.find(`[data-test="recondition-part-${poor.id}"]`).trigger('click')
      expect(game.gameState.partInventory[0]?.band).toBe('worn')

      await wrapper.vm.$nextTick()
      await wrapper.find(`[data-test="recondition-part-${poor.id}"]`).trigger('click')
      expect(game.gameState.partInventory[0]?.band).toBe('fine')

      await wrapper.vm.$nextTick()
      await wrapper.find(`[data-test="recondition-part-${poor.id}"]`).trigger('click')
      expect(game.gameState.partInventory[0]?.band).toBe('mint')
    })

    /**
     * Sprint 41 decision 2: tyres/brakePadsDiscs/clutch are replace-only -
     * the recondition control never renders for one, even below mint,
     * mirroring how it never renders for scrap (there's simply nothing to
     * fix on the bench either way).
     */
    it('omits the recondition control entirely for a non-repairable part (tyres)', () => {
      const tyrePart = PARTS.find((p) => p.carPartId === 'tyres' && p.grade === 'stock')!
      const game = useGameStore()
      game.devGrantPart(tyrePart.id)
      const granted = game.gameState.partInventory[0]!
      const wornTyres: PartInstance = { ...granted, band: 'worn' }
      game.gameState = { ...game.gameState, partInventory: [wornTyres] }

      const wrapper = mount(PartCard, { props: { instance: wornTyres, part: tyrePart } })
      expect(wrapper.find(`[data-test="recondition-part-${wornTyres.id}"]`).exists()).toBe(false)
    })
  })
})
