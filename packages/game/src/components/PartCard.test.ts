import { PARTS, type Part, type PartInstance } from '@midnight-garage/content'
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
})
