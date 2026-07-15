import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HintTooltip from './HintTooltip.vue'

describe('HintTooltip (Sprint 65 decision 3)', () => {
  it('renders the reason in a role="tooltip" node and is keyboard-reachable', () => {
    const wrapper = mount(HintTooltip, { props: { text: 'Needs local reputation' } })
    const bubble = wrapper.find('[role="tooltip"]')
    expect(bubble.exists()).toBe(true)
    expect(bubble.text()).toBe('Needs local reputation')
    // The trigger is focusable (keyboard users can reveal it) and the reason
    // is exposed to assistive tech, never via native `title`.
    expect(wrapper.get('.hint-tip').attributes('tabindex')).toBe('0')
    expect(wrapper.get('.hint-tip').attributes('aria-label')).toBe('Needs local reputation')
    expect(wrapper.attributes('title')).toBeUndefined()
  })

  it('shows a visible "locked" trigger so a gated control still reads as gated at a glance', () => {
    const wrapper = mount(HintTooltip, { props: { text: 'x' } })
    expect(wrapper.get('.hint-trigger').text()).toBe('locked')
  })
})
