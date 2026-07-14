import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as saveDb from '../save/saveDb'
import { useGameStore } from '../stores/gameStore'
import SaveMenu from './SaveMenu.vue'

vi.mock('../save/saveDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../save/saveDb')>()
  return { ...actual, loadSessionEvents: vi.fn() }
})

const loadSessionEvents = vi.mocked(saveDb.loadSessionEvents)

describe('SaveMenu - export session log (Sprint 24 session log v0)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // happy-dom doesn't implement the Blob URL API - stub it so the download
    // helper's `URL.createObjectURL`/`revokeObjectURL` calls don't throw.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('downloads the loaded session events as a JSON file and reports the count', async () => {
    const game = useGameStore()
    game.newGame(1)
    loadSessionEvents.mockResolvedValue([
      { id: 1, day: 1, type: 'endDay', payload: { endedDay: 1 }, timestamp: 123 },
    ])

    const wrapper = mount(SaveMenu)
    await wrapper.find('[data-test="save-toggle"]').trigger('click')

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await wrapper.find('[data-test="export-session-log"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0)) // flush the async handler

    expect(clickSpy).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Exported 1 session event(s).')
    clickSpy.mockRestore()
  })
})

/**
 * Sprint 58 decision 2: the menu's own inline load panel is gone - SaveMenu
 * is the single load surface now, so its load-behavior coverage moves here
 * (ported from the old MenuScreen tests; SaveMenu's load path had no direct
 * coverage of its own before this).
 */
describe('SaveMenu - loading a save code', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function mountOpen() {
    const wrapper = mount(SaveMenu)
    await wrapper.find('[data-test="save-toggle"]').trigger('click')
    return wrapper
  }

  it('loading a valid save code replaces the career', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.endDay()
    game.endDay()
    const code = game.exportSaveCode()
    const savedDay = game.day

    game.newGame(2) // simulate a different in-memory career before loading
    const wrapper = await mountOpen()

    await wrapper.find('[data-test="save-code-field"]').setValue(code)
    await wrapper.find('[data-test="import-save"]').trigger('click')

    expect(game.day).toBe(savedDay)
    expect(wrapper.text()).toContain('Save loaded.')
  })

  it('an invalid save code shows an error and leaves the career untouched', async () => {
    const game = useGameStore()
    game.newGame(1)
    const dayBefore = game.day
    const wrapper = await mountOpen()

    await wrapper.find('[data-test="save-code-field"]').setValue('not a real code')
    await wrapper.find('[data-test="import-save"]').trigger('click')

    expect(wrapper.text()).toMatch(/save code/i)
    expect(game.day).toBe(dayBefore)
  })

  it('the Load button is disabled until something is pasted', async () => {
    const wrapper = await mountOpen()
    const button = wrapper.get('[data-test="import-save"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-test="save-code-field"]').setValue('abc')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
  })
})
