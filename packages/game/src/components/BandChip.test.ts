import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BandChip from './BandChip.vue'

describe('BandChip', () => {
  it.each(['scrap', 'poor', 'worn', 'fine', 'mint'] as const)('renders the %s band', (band) => {
    const wrapper = mount(BandChip, { props: { band } })
    expect(wrapper.text()).toBe(band)
    expect(wrapper.find('.band-chip').classes()).toContain('band-' + band)
  })

  it('renders "not fitted" when band is null', () => {
    const wrapper = mount(BandChip, { props: { band: null } })
    expect(wrapper.text()).toBe('not fitted')
    expect(wrapper.find('.band-chip').classes()).toContain('band-unfitted')
  })
})
