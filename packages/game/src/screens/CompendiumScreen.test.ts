import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CompendiumScreen from './CompendiumScreen.vue'

const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(CompendiumScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('CompendiumScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('renders and lists every entry', () => {
    const wrapper = mountScreen()
    const list = wrapper.get('[data-test="compendium-entry-list"]')
    expect(list.findAll('button').length).toBeGreaterThanOrEqual(6)
    expect(list.text()).toContain('The workshop and stations')
    expect(list.text()).toContain('Body and paint')
    expect(list.text()).toContain('Buying parts and fitment')
    expect(list.text()).toContain('Selling and channels')
    expect(list.text()).toContain('Labour and the working day')
    expect(list.text()).toContain('Machine hire versus buying tools')
  })

  it('shows the first entry by default, with its body text', () => {
    const wrapper = mountScreen()
    const body = wrapper.get('[data-test="compendium-entry-body"]')
    expect(body.text()).toContain('The workshop and stations')
    expect(body.text()).toContain('bench, the machine shop, and the body line')
  })

  it('selecting another entry swaps the shown body and marks the button active', async () => {
    const wrapper = mountScreen()

    await wrapper.get('[data-test="compendium-entry-selling"]').trigger('click')

    expect(wrapper.get('[data-test="compendium-entry-selling"]').classes()).toContain('active')
    const body = wrapper.get('[data-test="compendium-entry-body"]')
    expect(body.text()).toContain('Selling and channels')
    expect(body.text()).not.toContain('bench, the machine shop, and the body line')
  })

  it('links back to the pause menu', () => {
    const wrapper = mountScreen()
    const back = wrapper.findComponent(RouterLinkStub)
    expect(back.props('to')).toEqual({ name: 'menu' })
  })
})
