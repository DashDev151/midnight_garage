import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as saveDb from '../save/saveDb'
import PlaytestClock from './PlaytestClock.vue'

vi.mock('../save/saveDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../save/saveDb')>()
  return { ...actual, appendSessionEvent: vi.fn() }
})

const appendSessionEvent = vi.mocked(saveDb.appendSessionEvent)

const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})

describe('PlaytestClock', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    appendSessionEvent.mockClear()
  })

  it('ticks the elapsed active time once a second while running', async () => {
    vi.useFakeTimers()
    const wrapper = track(mount(PlaytestClock))

    expect(wrapper.get('[data-test="playtest-clock-value"]').text()).toBe('0:00:00')

    vi.advanceTimersByTime(3000)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-test="playtest-clock-value"]').text()).toBe('0:00:03')
  })

  it('freezes the readout and shows paused while paused, then resumes ticking', async () => {
    vi.useFakeTimers()
    const wrapper = track(mount(PlaytestClock))

    vi.advanceTimersByTime(5000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="playtest-clock-value"]').text()).toBe('0:00:05')

    await wrapper.get('[data-test="playtest-clock-toggle"]').trigger('click')
    expect(wrapper.classes()).toContain('paused')
    expect(wrapper.find('[data-test="playtest-clock-paused-label"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="playtest-clock-toggle"]').text()).toBe('Resume')

    // Frozen while paused - further elapsed wall-clock time does not move
    // the readout.
    vi.advanceTimersByTime(4000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="playtest-clock-value"]').text()).toBe('0:00:05')

    await wrapper.get('[data-test="playtest-clock-toggle"]').trigger('click')
    expect(wrapper.classes()).not.toContain('paused')
    expect(wrapper.find('[data-test="playtest-clock-paused-label"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playtest-clock-toggle"]').text()).toBe('Pause')

    vi.advanceTimersByTime(2000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="playtest-clock-value"]').text()).toBe('0:00:07')
  })

  it('logs playClockPaused then playClockResumed with the same, and monotone, activeMs', async () => {
    vi.useFakeTimers()
    const wrapper = track(mount(PlaytestClock))

    vi.advanceTimersByTime(5000)
    await wrapper.get('[data-test="playtest-clock-toggle"]').trigger('click')

    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playClockPaused', payload: { activeMs: 5000 } }),
    )

    appendSessionEvent.mockClear()
    await wrapper.get('[data-test="playtest-clock-toggle"]').trigger('click')

    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playClockResumed', payload: { activeMs: 5000 } }),
    )

    appendSessionEvent.mockClear()
    vi.advanceTimersByTime(3000)
    await wrapper.get('[data-test="playtest-clock-toggle"]').trigger('click')

    // The second pause's activeMs is strictly greater than the first - the
    // banked total only ever grows across a pause/resume cycle.
    expect(appendSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playClockPaused', payload: { activeMs: 8000 } }),
    )
  })
})
