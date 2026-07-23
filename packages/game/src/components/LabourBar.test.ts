import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LabourBar from './LabourBar.vue'

describe('LabourBar', () => {
  it('renders the integer readout on hover only (the title), never as visible text', () => {
    const wrapper = mount(LabourBar, { props: { remaining: 60, max: 60 } })
    // The bar carries no visible number - the readout lives in the title.
    expect(wrapper.text()).toBe('')
    expect(wrapper.get('[data-test="labour-bar"]').attributes('title')).toBe('60 / 60 labour')
  })

  it('fills to the remaining/max fraction', () => {
    const wrapper = mount(LabourBar, { props: { remaining: 30, max: 60 } })
    const fill = wrapper.get('[data-test="labour-bar-fill"]')
    expect(fill.attributes('style')).toContain('width: 50%')
    expect(fill.classes()).not.toContain('empty')
  })

  it('marks the fill empty and reads zero width when no labour is left', () => {
    const wrapper = mount(LabourBar, { props: { remaining: 0, max: 60 } })
    const fill = wrapper.get('[data-test="labour-bar-fill"]')
    expect(fill.attributes('style')).toContain('width: 0%')
    expect(fill.classes()).toContain('empty')
  })

  it('clamps the fill to 0-100% for out-of-range values', () => {
    const over = mount(LabourBar, { props: { remaining: 90, max: 60 } })
    expect(over.get('[data-test="labour-bar-fill"]').attributes('style')).toContain('width: 100%')

    const under = mount(LabourBar, { props: { remaining: -10, max: 60 } })
    expect(under.get('[data-test="labour-bar-fill"]').attributes('style')).toContain('width: 0%')
  })

  it('reads empty (no fill) when max is zero, without dividing by zero', () => {
    const wrapper = mount(LabourBar, { props: { remaining: 0, max: 0 } })
    expect(wrapper.get('[data-test="labour-bar-fill"]').attributes('style')).toContain('width: 0%')
  })

  it('renders the optional caption only when set', () => {
    const withCaption = mount(LabourBar, { props: { remaining: 60, max: 60, caption: 'Labour' } })
    expect(withCaption.get('.labour-bar-caption').text()).toBe('Labour')

    const without = mount(LabourBar, { props: { remaining: 60, max: 60 } })
    expect(without.find('.labour-bar-caption').exists()).toBe(false)
  })

  it('forwards a caller-supplied data-test onto the root element (attribute fallthrough)', () => {
    const wrapper = mount(LabourBar, {
      props: { remaining: 60, max: 60 },
      attrs: { 'data-test': 'labour-card' },
    })
    expect(wrapper.element.getAttribute('data-test')).toBe('labour-card')
  })

  it('carries an aria-label with the current/max labour figures, for both orientations', () => {
    const horizontal = mount(LabourBar, { props: { remaining: 30, max: 60 } })
    expect(horizontal.get('[data-test="labour-bar"]').attributes('aria-label')).toBe(
      'Labour remaining: 30 of 60',
    )

    const vertical = mount(LabourBar, { props: { remaining: 30, max: 60, vertical: true } })
    expect(vertical.get('[data-test="labour-bar"]').attributes('aria-label')).toBe(
      'Labour remaining: 30 of 60',
    )
  })

  describe('the vertical variant', () => {
    it('applies the vertical class and fills by height, growing from the bottom, never by width', () => {
      const wrapper = mount(LabourBar, { props: { remaining: 30, max: 60, vertical: true } })
      expect(wrapper.get('[data-test="labour-bar"]').classes()).toContain('vertical')
      const style = wrapper.get('[data-test="labour-bar-fill"]').attributes('style')
      expect(style).toContain('height: 50%')
      expect(style).not.toContain('width')
    })

    it('reads full height at a full day and no height when the day is spent, exactly as the horizontal fill reads full/no width', () => {
      const full = mount(LabourBar, { props: { remaining: 60, max: 60, vertical: true } })
      expect(full.get('[data-test="labour-bar-fill"]').attributes('style')).toContain(
        'height: 100%',
      )

      const spent = mount(LabourBar, { props: { remaining: 0, max: 60, vertical: true } })
      const spentFill = spent.get('[data-test="labour-bar-fill"]')
      expect(spentFill.attributes('style')).toContain('height: 0%')
      expect(spentFill.classes()).toContain('empty')
    })

    it('never renders rotated text - the horizontal fill styling is absent, not transformed', () => {
      const wrapper = mount(LabourBar, {
        props: { remaining: 30, max: 60, vertical: true, caption: 'Labour' },
      })
      const style = wrapper.get('[data-test="labour-bar"]').attributes('style')
      expect(style ?? '').not.toContain('rotate')
      expect(style ?? '').not.toContain('writing-mode')
    })
  })
})
