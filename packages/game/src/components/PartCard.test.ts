import { PARTS, type PartInstance } from '@midnight-garage/content'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession } from '../composables/useDragAndDrop'
import PartCard from './PartCard.vue'

const part = PARTS.find((p) => p.componentId === 'suspension')!

const instance: PartInstance = {
  id: 'pi-1',
  partId: part.id,
  conditionPercent: 100,
  genuinePeriod: false,
}

describe('PartCard (Sprint 24 fix 5)', () => {
  beforeEach(() => clearDragSession())

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
})
