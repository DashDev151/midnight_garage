import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BandPicker from './BandPicker.vue'

describe('BandPicker (Sprint 40)', () => {
  it('offers every band strictly above currentBand, up to mint', () => {
    const wrapper = mount(BandPicker, {
      props: { currentBand: 'poor', selected: 'mint', testIdPrefix: 'band-test' },
    })
    const labels = wrapper.findAll('.band-option').map((b) => b.text())
    expect(labels).toEqual(['worn', 'fine', 'mint'])
  })

  it('narrows to just mint once currentBand is fine', () => {
    const wrapper = mount(BandPicker, {
      props: { currentBand: 'fine', selected: 'mint', testIdPrefix: 'band-test' },
    })
    expect(wrapper.findAll('.band-option').map((b) => b.text())).toEqual(['mint'])
  })

  it('renders nothing once currentBand is already mint', () => {
    const wrapper = mount(BandPicker, {
      props: { currentBand: 'mint', selected: 'mint', testIdPrefix: 'band-test' },
    })
    expect(wrapper.find('.band-picker').exists()).toBe(false)
  })

  it('marks the selected option active and emits select on click', async () => {
    const wrapper = mount(BandPicker, {
      props: { currentBand: 'poor', selected: 'fine', testIdPrefix: 'band-test' },
    })
    expect(wrapper.get('[data-test="band-test-fine"]').classes()).toContain('active')
    expect(wrapper.get('[data-test="band-test-worn"]').classes()).not.toContain('active')

    await wrapper.get('[data-test="band-test-worn"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['worn']])
  })
})
