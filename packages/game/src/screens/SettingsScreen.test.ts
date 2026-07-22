import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import SettingsScreen from './SettingsScreen.vue'

// Track every mounted wrapper and unmount it after each test, so a component
// left mounted from a prior test cannot leak its store's pinia into the next
// (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(SettingsScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('SettingsScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('defaults to the standard fuse preset and auto-bid off', () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(game.fusePreset).toBe('standard')
    expect(game.autoBidEnabled).toBe(false)
    expect(wrapper.find('[data-test="fuse-preset-standard"]').classes()).toContain('active')
    const toggle = wrapper.find('[data-test="autobid-enable-toggle"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
  })

  it('explains the fuse presets in plain words', () => {
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('How long each bid stays open before the hammer.')
  })

  it('selecting a fuse preset persists it to uiSettings and marks the button active', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()

    await wrapper.find('[data-test="fuse-preset-unhurried"]').trigger('click')

    expect(game.fusePreset).toBe('unhurried')
    expect(game.gameState.uiSettings?.fusePreset).toBe('unhurried')
    expect(wrapper.find('[data-test="fuse-preset-unhurried"]').classes()).toContain('active')
    expect(wrapper.find('[data-test="fuse-preset-standard"]').classes()).not.toContain('active')
  })

  it('toggling auto-bid persists to uiSettings without disturbing the fuse preset', async () => {
    const game = useGameStore()
    game.setFusePreset('relaxed')
    const wrapper = mountScreen()

    await wrapper.find('[data-test="autobid-enable-toggle"]').setValue(true)

    expect(game.autoBidEnabled).toBe(true)
    expect(game.gameState.uiSettings?.autoBidEnabled).toBe(true)
    // The earlier fuse choice survives the auto-bid write (the shared
    // uiSettings object is merged, never overwritten wholesale).
    expect(game.fusePreset).toBe('relaxed')
    expect(game.gameState.uiSettings?.fusePreset).toBe('relaxed')
  })

  it('setting the fuse preset after auto-bid is on does not clobber the auto-bid choice', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()

    await wrapper.find('[data-test="autobid-enable-toggle"]').setValue(true)
    await wrapper.find('[data-test="fuse-preset-relaxed"]').trigger('click')

    expect(game.autoBidEnabled).toBe(true)
    expect(game.fusePreset).toBe('relaxed')
  })

  it('links back to the pause menu', () => {
    const wrapper = mountScreen()
    const back = wrapper.findComponent(RouterLinkStub)
    expect(back.props('to')).toEqual({ name: 'menu' })
  })
})
