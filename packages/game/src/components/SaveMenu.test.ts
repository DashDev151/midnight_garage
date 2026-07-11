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
