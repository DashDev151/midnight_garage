import { PARTS, type ConditionBand, type Part, type PartInstance } from '@midnight-garage/content'
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

    it('shows the customer-owned badge for a tagged part, and none for a player-owned one', () => {
      const tagged: PartInstance = { ...instance, customerJobId: 'svc-1-0' }
      const withBadge = mount(PartCard, { props: { instance: tagged, part } })
      expect(withBadge.find(`[data-test="customer-owned-${tagged.id}"]`).exists()).toBe(true)

      const noBadge = mount(PartCard, { props: { instance, part } })
      expect(noBadge.find(`[data-test="customer-owned-${instance.id}"]`).exists()).toBe(false)
    })

    it('locks scrap for a customer-owned scrap part (disabled reason, no Scrap button)', () => {
      const customerScrap: PartInstance = { ...instance, band: 'scrap', customerJobId: 'svc-1-0' }
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

    it('clicking Recondition climbs the loose part toward mint through the store', async () => {
      const { game, instance: worn } = grantInventoryPart('worn')
      const wrapper = mount(PartCard, { props: { instance: worn, part } })

      await wrapper.find(`[data-test="recondition-part-${worn.id}"]`).trigger('click')

      expect(game.gameState.partInventory[0]?.band).toBe('mint')
    })

    /**
     * Sprint 40 item 5: the recondition control's own BandPicker defaults to
     * mint (unchanged), but picking a non-default band must actually change
     * what clicking Recondition does - proof the picker's selection, not a
     * hardcoded literal, drives the store call.
     */
    it('picking a non-default band flows through to the recondition call', async () => {
      const { game, instance: poor } = grantInventoryPart('poor')
      const wrapper = mount(PartCard, { props: { instance: poor, part } })

      // 'poor' offers worn/fine/mint - 'worn' is a real, non-default pick.
      await wrapper.find(`[data-test="band-recondition-${poor.id}-worn"]`).trigger('click')
      expect(wrapper.text()).toContain('Recondition to worn')

      await wrapper.find(`[data-test="recondition-part-${poor.id}"]`).trigger('click')
      expect(game.gameState.partInventory[0]?.band).toBe('worn')
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
