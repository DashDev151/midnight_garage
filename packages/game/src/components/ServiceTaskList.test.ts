import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ServiceTaskList from './ServiceTaskList.vue'

/**
 * These pin the checklist shape: a list of work the player MUST do must
 * never read as flavour text (dim grey prose).
 */
describe('ServiceTaskList', () => {
  const tasks = [
    { label: 'Replace the tyres', done: false },
    { label: 'Repair the fuel system to fine', done: true },
  ]

  it('renders every task as a checklist line with its own box', () => {
    const wrapper = mount(ServiceTaskList, { props: { tasks } })
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toContain('Replace the tyres')
    expect(items[1]!.text()).toContain('Repair the fuel system to fine')
  })

  it('marks outstanding work [ ] and finished work [x] - never an unmarked line', () => {
    const wrapper = mount(ServiceTaskList, { props: { tasks } })
    const marks = wrapper.findAll('.mark').map((m) => m.text())
    expect(marks).toEqual(['[ ]', '[x]'])
  })

  it('distinguishes done from outstanding by class, not by colour alone', () => {
    const wrapper = mount(ServiceTaskList, { props: { tasks } })
    const items = wrapper.findAll('li')
    expect(items[0]!.classes()).not.toContain('done')
    expect(items[1]!.classes()).toContain('done')
  })

  it('renders nothing for an empty task list', () => {
    const wrapper = mount(ServiceTaskList, { props: { tasks: [] } })
    expect(wrapper.findAll('li')).toHaveLength(0)
  })
})
