import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import AuctionRoomDemoScreen from './AuctionRoomDemoScreen.vue'

// Track every mounted wrapper and unmount it after each test, so a component
// left mounted from a prior test cannot leak its store's pinia into the next.
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(AuctionRoomDemoScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** Runs the fake clock forward and lets the DOM catch up. */
async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

async function lookThin(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-test="inspect-thin"]').trigger('click')
}

async function lookPacked(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-test="inspect-packed"]').trigger('click')
}

/** The run-test buttons the shared checklist renders, in content order. */
function runTestButtons(wrapper: VueWrapper) {
  return wrapper.findAll('[data-test^="run-test-"]')
}

describe('AuctionRoomDemoScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
    vi.useRealTimers()
  })

  it('mounts into the lobby with the estimated-market-value headline and a look button on both cards', () => {
    const wrapper = mountScreen()

    expect(wrapper.find('[data-test="demo-banner"]').text()).toBe(
      'Dev demo: nothing here is saved.',
    )

    const thin = wrapper.find('[data-test="lobby-thin"]')
    expect(thin.text()).toContain('Estimated market value: ¥366,988.')
    expect(thin.text()).toContain('Thin turnout · 2 dealers')
    expect(wrapper.find('[data-test="inspect-thin"]').text()).toBe('Take a look')

    const packed = wrapper.find('[data-test="lobby-packed"]')
    expect(packed.text()).toContain('Estimated market value: ¥252,041.')
    expect(packed.text()).toContain('Packed room · 6 dealers')
    expect(wrapper.find('[data-test="inspect-packed"]').text()).toBe('Take a look')
  })

  it('take a look enters the inspect phase: the real checklist, a full visit clock, and one estimated-value line before any test', async () => {
    const wrapper = mountScreen()
    await lookThin(wrapper)

    expect(wrapper.find('[data-test="minutes-left"]').text()).toBe('60m left')
    // The shared checklist renders with the car's own symptom and real tests,
    // and hides the per-cause value deltas in the demo.
    const symptom = wrapper.find('[data-test^="symptom-"]')
    expect(symptom.exists()).toBe(true)
    expect(symptom.text()).toContain('Faint filler line along a rear quarter panel.')
    expect(symptom.find('.delta').exists()).toBe(false)
    expect(runTestButtons(wrapper).length).toBeGreaterThan(0)
    // Before any test the estimate is a single value (the room read at entry),
    // with nothing struck through.
    const estValue = wrapper.find('[data-test="est-value"]')
    expect(estValue.text()).toContain('Estimated market value:')
    expect(estValue.text()).toContain('¥366,988')
    expect(estValue.find('.was').exists()).toBe(false)
    expect(estValue.find('.up').exists()).toBe(false)
    expect(estValue.find('.down').exists()).toBe(false)
    expect(wrapper.find('[data-test="take-seat-thin"]').text()).toBe('Take a seat')
  })

  it('running a real test moves the estimate off the room read and spends the clock', async () => {
    const wrapper = mountScreen()
    await lookThin(wrapper)
    expect(wrapper.find('[data-test="est-value"]').find('.was').exists()).toBe(false)

    await runTestButtons(wrapper)[0]!.trigger('click')

    // The estimate moved: the room read is struck through and a new figure
    // drawn beside it, and the visit clock ran down.
    const moved = wrapper.find('[data-test="est-value"]')
    expect(moved.find('.was').exists()).toBe(true)
    expect(moved.find('.was').text()).toBe('¥366,988')
    expect(wrapper.find('[data-test="minutes-left"]').text()).toBe('45m left')
  })

  it('resolving the thin lot redraws the estimate upward, the new figure in green', async () => {
    const wrapper = mountScreen()
    await lookThin(wrapper)
    // The one undercarriage look resolves the quarter-panel doubt to a cosmetic
    // respray, lifting the estimate above the room read.
    await runTestButtons(wrapper)[0]!.trigger('click')

    const estValue = wrapper.find('[data-test="est-value"]')
    expect(estValue.find('.was').text()).toBe('¥366,988')
    expect(estValue.find('.up').text()).toBe('¥385,126')
    expect(estValue.find('.down').exists()).toBe(false)
  })

  it('resolving the trap redraws the estimate downward, the new figure in red', async () => {
    const wrapper = mountScreen()
    await lookPacked(wrapper)
    // The single coolant check resolves the damp footwell to the rotten seam.
    await runTestButtons(wrapper)[0]!.trigger('click')

    const estValue = wrapper.find('[data-test="est-value"]')
    expect(estValue.find('.was').text()).toBe('¥252,041')
    expect(estValue.find('.down').text()).toBe('¥224,415')
    expect(estValue.find('.up').exists()).toBe(false)
  })

  it('take a seat carries the learned numbers into the timed room, with no inspect UI there', async () => {
    const wrapper = mountScreen()
    await lookThin(wrapper)
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    expect(wrapper.find('[data-test="seat-you"]').text()).toContain('You')
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')
    expect(wrapper.find('[data-test="seat-1"]').text()).toContain('Mrs. Sakaki')
    expect(wrapper.find('[data-test="seat-2"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="log"]').text()).toContain(
      'The clerk looks over the room. Reserve is ¥201,843.',
    )
    expect(wrapper.find('[data-test="bid"]').text()).toBe('Bid the reserve')
    expect(wrapper.find('[data-test="letgo"]').text()).toBe('Let it go')
    // The room never offers a closer look or a visit clock.
    expect(wrapper.find('[data-test="est-value"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="minutes-left"]').exists()).toBe(false)
  })

  it('puts the leader chip on the opening dealer at the seeded instant', async () => {
    const wrapper = mountScreen()
    await lookThin(wrapper)
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    // The room's opening raise is scheduled for the seeded instant (2265ms).
    await advance(2250)
    expect(wrapper.find('[data-test="leader-chip"]').exists()).toBe(false)

    await advance(50)
    expect(wrapper.find('[data-test="log"]').text()).toContain('Endo opens: ¥201,843.')
    expect(wrapper.find('[data-test="seat-0"] [data-test="leader-chip"]').text()).toBe('¥201,843')
    expect(wrapper.findAll('[data-test="leader-chip"]')).toHaveLength(1)
    expect(wrapper.find('[data-test="bid"]').text()).toBe('Raise to ¥206,843')
  })

  it('keeps the bid control neutral below the player number, then reddens it once a raise would exceed it', async () => {
    const wrapper = mountScreen()
    await lookPacked(wrapper)
    await runTestButtons(wrapper)[0]!.trigger('click') // resolve to the trap's true worth (¥224,415)
    await wrapper.find('[data-test="take-seat-packed"]').trigger('click')

    // Opening on the reserve, well below the player's number: no marker, and the
    // bid control stays neutral.
    expect(wrapper.find('[data-test="past-number"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="bid"]').classes()).not.toContain('danger')

    // Let the packed room bid the resolved trap up. Its rivals carry the board
    // past the player's number, so the past-your-number marker lights before the
    // hammer.
    let sawPast = false
    for (let i = 0; i < 500 && !sawPast; i++) {
      if (wrapper.find('[data-test="past-number"]').exists()) {
        sawPast = true
        break
      }
      if (wrapper.find('[data-test="outcome"]').exists()) break
      await advance(200)
    }

    expect(sawPast).toBe(true)
    expect(wrapper.find('[data-test="past-number"]').text()).toBe('Past your number.')
    expect(wrapper.find('[data-test="bid"]').classes()).toContain('danger')
  })

  it('closes a watched steal with the outcome strip and the bargain-missed epilogue, then runs it back', async () => {
    const wrapper = mountScreen()
    await lookThin(wrapper)
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    await advance(300_000)
    expect(wrapper.find('[data-test="outcome"]').text()).toBe('Gone.')
    expect(wrapper.find('[data-test="epilogue"]').text()).toBe(
      'You let it go. Someone got a bargain there.',
    )
    expect(wrapper.find('[data-test="bid"]').exists()).toBe(false)

    await wrapper.find('[data-test="run-back"]').trigger('click')
    expect(wrapper.find('[data-test="outcome"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="log"]').text()).toBe(
      'The clerk looks over the room. Reserve is ¥201,843.',
    )
    expect(wrapper.find('[data-test="bid"]').text()).toBe('Bid the reserve')
  })

  it('rolls back a lot let go before any bid, with no epilogue, then restores the lobby', async () => {
    const wrapper = mountScreen()
    await lookThin(wrapper)
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    await wrapper.find('[data-test="letgo"]').trigger('click')
    expect(wrapper.find('[data-test="outcome"]').text()).toBe('Rolled back.')
    expect(wrapper.find('[data-test="log"]').text()).toContain('Nobody moves. The lot rolls back.')
    expect(wrapper.find('[data-test="epilogue"]').exists()).toBe(false)

    await wrapper.find('[data-test="lobby-back"]').trigger('click')
    expect(wrapper.find('[data-test="lobby-thin"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lobby-packed"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="outcome"]').exists()).toBe(false)
  })

  it('leaves no timers behind on unmount', async () => {
    const wrapper = mount(AuctionRoomDemoScreen, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('[data-test="inspect-thin"]').trigger('click')
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
