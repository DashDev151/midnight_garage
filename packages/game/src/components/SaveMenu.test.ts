import { mount, type VueWrapper } from '@vue/test-utils'
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

/**
 * Every wrapper is tracked
 * and unmounted after its test, so a component left mounted from a prior test
 * cannot leak its store's pinia into the next (see App/CarDetailScreen). This
 * module-level afterEach coexists with the per-describe vi.unstubAllGlobals one.
 */
const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

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

    const wrapper = track(mount(SaveMenu))

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await wrapper.find('[data-test="export-session-log"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0)) // flush the async handler

    expect(clickSpy).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Exported 1 session event(s).')
    clickSpy.mockRestore()
  })
})

/**
 * SaveMenu is the single load surface - its load-behavior coverage lives
 * here (ported from the old MenuScreen tests). The load textarea reveals via
 * the inline "Load from a code" button (no toggle-and-popover), so opening it
 * is a `reveal-load` click.
 */
describe('SaveMenu - loading a save code', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function mountOpen() {
    const wrapper = track(mount(SaveMenu))
    await wrapper.find('[data-test="reveal-load"]').trigger('click')
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
