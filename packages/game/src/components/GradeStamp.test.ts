import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GradeStamp from './GradeStamp.vue'

/**
 * The stamp color-bucket mapping (green/amber/red,
 * plus `R`'s own distinct defect tone) - the one genuinely new piece of
 * logic here (everything else is presentation over an existing
 * `computeAuctionGrade` output).
 */
describe('GradeStamp', () => {
  it.each([
    ['S', 'stamp-green'],
    ['6', 'stamp-green'],
    ['5', 'stamp-green'],
    ['A', 'stamp-green'],
    ['B', 'stamp-green'],
  ] as const)('grades %s green', (grade, expectedClass) => {
    const wrapper = mount(GradeStamp, { props: { label: 'Overall', grade } })
    expect(wrapper.find('.grade-stamp').classes()).toContain(expectedClass)
  })

  it.each([
    ['4.5', 'stamp-amber'],
    ['4', 'stamp-amber'],
    ['3.5', 'stamp-amber'],
    ['C', 'stamp-amber'],
  ] as const)('grades %s amber', (grade, expectedClass) => {
    const wrapper = mount(GradeStamp, { props: { label: 'Overall', grade } })
    expect(wrapper.find('.grade-stamp').classes()).toContain(expectedClass)
  })

  it.each([
    ['3', 'stamp-red'],
    ['2', 'stamp-red'],
    ['1', 'stamp-red'],
    ['D', 'stamp-red'],
    ['E', 'stamp-red'],
  ] as const)('grades %s red', (grade, expectedClass) => {
    const wrapper = mount(GradeStamp, { props: { label: 'Overall', grade } })
    expect(wrapper.find('.grade-stamp').classes()).toContain(expectedClass)
  })

  it('grades R with its own distinct defect tone, never the ordinary red bucket', () => {
    const wrapper = mount(GradeStamp, { props: { label: 'Overall', grade: 'R' } })
    const classes = wrapper.find('.grade-stamp').classes()
    expect(classes).toContain('stamp-defect')
    expect(classes).not.toContain('stamp-red')
  })

  it('renders the label and the grade value', () => {
    const wrapper = mount(GradeStamp, { props: { label: 'Ext', grade: 'B' } })
    expect(wrapper.text()).toContain('Ext')
    expect(wrapper.text()).toContain('B')
  })
})
