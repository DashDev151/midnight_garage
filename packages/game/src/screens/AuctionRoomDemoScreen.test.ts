import { mount, RouterLinkStub, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { DEMO_BANKROLL_YEN } from './auctionRoomDemo'
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

/** The shared paid yard visit, rendered once above both cards. */
async function inspect(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-test="inspect-here"]').trigger('click')
}

function thinCard(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('[data-test="lobby-thin"]')
}

function packedCard(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('[data-test="lobby-packed"]')
}

/** The run-test buttons within one lobby card, in content order - scoped to
 * the card since both lots draw their checklist at once now. */
function runTestButtons(card: DOMWrapper<Element>): DOMWrapper<Element>[] {
  return card.findAll('[data-test^="run-test-"]')
}

/** A run-test button within one lobby card, found by the test id embedded in
 * its data-test rather than by position: several tests in a board-style fork
 * can be offered together once their prerequisite unlocks, so a positional
 * anchor could silently hit the wrong one. */
function testButton(card: DOMWrapper<Element>, testId: string): DOMWrapper<Element> {
  return card.find(`[data-test$="-${testId}"]`)
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

  it('mounts into the lobby with both lots as production cards, the shared inspect control, and tests locked until a visit', () => {
    const wrapper = mountScreen()
    const game = useGameStore()

    expect(wrapper.find('[data-test="demo-banner"]').text()).toBe(
      'Dev demo: nothing here is saved.',
    )

    // Both lots draw as the shared production card: the room's number, the
    // turnout badge, grade stamps, the public symptom checklist, and each lot's
    // own estimate line (starting at the room read, unmoved). The badge follows
    // the room the demo assigns: the steal lot sits in a thin room.
    const thin = thinCard(wrapper)
    expect(thin.text()).toContain('the room says ¥209,266')
    const thinBadge = thin.find('.turnout-badge')
    expect(thinBadge.text()).toBe('Thin turnout')
    expect(thinBadge.classes()).toContain('turnout-thin')
    expect(thin.find('[data-test^="grade-stamp-overall-"]').exists()).toBe(true)
    expect(thin.find('[data-test^="symptom-"]').exists()).toBe(true)
    const estThin = wrapper.find('[data-test="est-value-thin"]')
    expect(estThin.text()).toContain('Estimated market value:')
    expect(estThin.text()).toContain('¥209,266')
    expect(estThin.find('.was').exists()).toBe(false)
    expect(wrapper.find('[data-test="take-seat-thin"]').text()).toBe('Take a seat')

    const packed = packedCard(wrapper)
    expect(packed.text()).toContain('the room says ¥393,886')
    const packedBadge = packed.find('.turnout-badge')
    expect(packedBadge.text()).toBe('Packed turnout')
    expect(packedBadge.classes()).toContain('turnout-packed')
    expect(wrapper.find('[data-test="est-value-packed"]').text()).toContain('¥393,886')
    expect(wrapper.find('[data-test="take-seat-packed"]').text()).toBe('Take a seat')

    // The shared inspect control names the real labour and travel-fee cost; no
    // visit is active yet, and the demo HUD shows the fresh bankroll and no
    // labour spent.
    const inspectBtn = wrapper.find('[data-test="inspect-here"]')
    expect(inspectBtn.text()).toContain('Inspect here')
    expect(inspectBtn.text()).toContain(`${game.actionPoints.inspectionVisit} labour`)
    expect(inspectBtn.text()).toContain(formatYen(game.travelFeeYenFor('local-yard')))
    expect(wrapper.find('[data-test="visit-panel"]').exists()).toBe(false)
    const hud = wrapper.find('[data-test="demo-hud"]')
    expect(hud.text()).toContain(`Cash ${formatYen(DEMO_BANKROLL_YEN)}`)
    expect(hud.text()).toContain('Labour used 0')

    // Before any visit, a test button is locked with the visit-first reason.
    const test0 = runTestButtons(thin)[0]!
    expect((test0.element as HTMLButtonElement).disabled).toBe(true)
    expect(test0.attributes('title')).toBe('Inspect the yard to run a test')
  })

  it('the shared inspect control starts the real paid visit: the panel shows the clock and the HUD shows the fee and labour spent', async () => {
    const wrapper = mountScreen()
    const game = useGameStore()
    const feeYen = game.travelFeeYenFor('local-yard')
    const labour = game.actionPoints.inspectionVisit
    const visitMinutes = game.context.economy.diagnosis.visitMinutes

    await inspect(wrapper)

    // The button gives way to the active visit panel carrying the full clock.
    expect(wrapper.find('[data-test="inspect-here"]').exists()).toBe(false)
    const panel = wrapper.find('[data-test="visit-panel"]')
    expect(panel.text()).toContain('At the yard:')
    expect(panel.text()).toContain(`${visitMinutes}m left`)

    // The HUD reflects the real deduction: cash down by the fee, labour spent.
    const hud = wrapper.find('[data-test="demo-hud"]')
    expect(hud.text()).toContain(`Cash ${formatYen(DEMO_BANKROLL_YEN - feeYen)}`)
    expect(hud.text()).toContain(`Labour used ${labour}`)
  })

  it('running a real test narrows the doubt, moves the estimate off the room read, and spends the shared clock', async () => {
    const wrapper = mountScreen()
    await inspect(wrapper)
    expect(wrapper.find('[data-test="est-value-thin"]').find('.was').exists()).toBe(false)

    await testButton(thinCard(wrapper), 'hand-crank').trigger('click')

    // Hand-cranking the engine narrows the "won't start" symptom's cause set;
    // the estimate already climbs off the room read, in green.
    const afterFirst = wrapper.find('[data-test="est-value-thin"]')
    expect(afterFirst.find('.was').text()).toBe('¥209,266')
    expect(afterFirst.find('.up').text()).toBe('¥229,996')
    // The doubt narrowed: the run test's own result line now shows in the trail.
    expect(wrapper.find('[data-test^="breadcrumb-"]').exists()).toBe(true)
    // The shared clock ran down by the test's minutes.
    expect(wrapper.find('[data-test="visit-panel"]').text()).toContain('45m left')

    await testButton(thinCard(wrapper), 'electrics-check').trigger('click')

    // The electrics check narrows the doubt further, still short of full
    // resolution, lifting the estimate again, still in green.
    const est = wrapper.find('[data-test="est-value-thin"]')
    expect(est.find('.was').text()).toBe('¥209,266')
    expect(est.find('.up').text()).toBe('¥230,971')
    expect(wrapper.find('[data-test="visit-panel"]').text()).toContain('35m left')
  })

  it('resolving the trap redraws its estimate downward, the new figure in red', async () => {
    const wrapper = mountScreen()
    await inspect(wrapper)
    // Tracing the damp narrows toward the worse pair of causes, marking the
    // estimate down.
    await runTestButtons(packedCard(wrapper))[0]!.trigger('click')

    const est = wrapper.find('[data-test="est-value-packed"]')
    expect(est.find('.was').text()).toBe('¥393,886')
    expect(est.find('.down').text()).toBe('¥346,935')
    expect(est.find('.up').exists()).toBe(false)
  })

  it('take a seat carries the current lot into the timed room, with no lobby inspect UI there', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    expect(wrapper.find('[data-test="seat-you"]').text()).toContain('You')
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')
    expect(wrapper.find('[data-test="seat-1"]').text()).toContain('Mrs. Sakaki')
    expect(wrapper.find('[data-test="seat-2"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="log"]').text()).toContain(
      'The clerk looks over the room. Reserve is ¥115,096.',
    )
    expect(wrapper.find('[data-test="bid"]').text()).toBe('Bid the reserve')
    // The room never carries the lobby's inspect control, visit panel, HUD, or
    // estimate lines.
    expect(wrapper.find('[data-test="inspect-here"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="visit-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="demo-hud"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="est-value-thin"]').exists()).toBe(false)
  })

  it('renders the three raise options with their landing-price labels once the room has a leader', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')
    // Lets the room's own opening bid land (Endo opens on the reserve): a
    // leader is now on the board, so the raise-option list replaces the
    // single opening button.
    await advance(2700)
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')

    expect(wrapper.find('[data-test="bid"]').text()).toBe('Raise to ¥120,096')
    expect(wrapper.find('[data-test="bid-jump-4"]').text()).toBe('Raise to ¥135,096')
    expect(wrapper.find('[data-test="bid-jump-8"]').text()).toBe('Raise to ¥155,096')
    // Well under the fully-looked player number (¥230,354): none of the three
    // options are dangerous yet.
    expect(wrapper.find('[data-test="bid"]').classes()).not.toContain('danger')
    expect(wrapper.find('[data-test="bid-jump-4"]').classes()).not.toContain('danger')
    expect(wrapper.find('[data-test="bid-jump-8"]').classes()).not.toContain('danger')
  })

  it('renders the dev force-reaction strip in the room phase', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    expect(wrapper.find('[data-test="dev-force"]').text()).toContain('dev: force next')
    expect(wrapper.find('[data-test="force-scare"]').text()).toBe('Scare')
    expect(wrapper.find('[data-test="force-call"]').text()).toBe('Call')
    expect(wrapper.find('[data-test="force-goad"]').text()).toBe('Goad')
    expect(wrapper.find('[data-test="force-tax"]').text()).toBe('Snipe tax')
    expect(wrapper.find('[data-test="force-feud"]').text()).toBe('Feud')
    expect(wrapper.find('[data-test="force-spite"]').text()).toBe('Spite')
  })

  it('clicking a force button arms the room and marks the button active', async () => {
    type RoomLike = { armedReaction: string | null }
    const wrapper = mountScreen()
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    await wrapper.find('[data-test="force-scare"]').trigger('click')

    expect((wrapper.vm as unknown as { room: RoomLike }).room.armedReaction).toBe('scare')
    expect(wrapper.find('[data-test="force-scare"]').classes()).toContain('active')
  })

  it('an armed scare fires on the next jump raise', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')
    // Lets Endo open so the raise options (including the rung-4 jump) replace
    // the single opening button.
    await advance(2700)
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')

    await wrapper.find('[data-test="force-scare"]').trigger('click')
    await wrapper.find('[data-test="bid-jump-4"]').trigger('click')

    expect(wrapper.find('[data-test="log"]').text()).toContain(
      'The jump lands. Paddles settle into laps down the row.',
    )
  })

  it('marks danger independently on each raise option against its own landing price, not as one shared flag', async () => {
    const wrapper = mountScreen()
    await inspect(wrapper)
    // Resolve the trap to its true worth (¥252,396) via the same two tests;
    // by the time the room has climbed for 18s, every rung on offer already
    // lands past the player's number, so all three read danger at once -
    // each computed off its own landing price, not one shared switch, which
    // the identical `.classes()` calls below still prove independently even
    // though they agree here.
    await testButton(packedCard(wrapper), 'trace-the-wet').trigger('click')
    await testButton(packedCard(wrapper), 'undercarriage-look').trigger('click')
    await wrapper.find('[data-test="take-seat-packed"]').trigger('click')
    await advance(18_000)
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')

    expect(wrapper.find('[data-test="bid"]').text()).toBe('Raise to ¥261,637')
    expect(wrapper.find('[data-test="bid"]').classes()).toContain('danger')
    expect(wrapper.find('[data-test="bid-jump-4"]').text()).toBe('Raise to ¥276,637')
    expect(wrapper.find('[data-test="bid-jump-4"]').classes()).toContain('danger')
    expect(wrapper.find('[data-test="bid-jump-8"]').text()).toBe('Raise to ¥296,637')
    expect(wrapper.find('[data-test="bid-jump-8"]').classes()).toContain('danger')
  })

  it('takeSeat marks the room inspected once a diagnostic test has run on the lot, else not', async () => {
    type RoomLike = { inspected: boolean }

    const untested = mountScreen()
    await untested.find('[data-test="take-seat-thin"]').trigger('click')
    expect((untested.vm as unknown as { room: RoomLike }).room.inspected).toBe(false)

    const tested = mountScreen()
    await inspect(tested)
    await runTestButtons(thinCard(tested))[0]!.trigger('click')
    await tested.find('[data-test="take-seat-thin"]').trigger('click')
    expect((tested.vm as unknown as { room: RoomLike }).room.inspected).toBe(true)
  })

  it('marks the bid control past the player number as soon as the room opens on a reserve that already exceeds it', async () => {
    const wrapper = mountScreen()
    await inspect(wrapper)
    // Resolve the trap all the way to its true worth (¥196,388), which sits
    // BELOW the packed room's own reserve (¥200,348): this trap is bad enough
    // that even the opening ask overpays, so the marker and the danger class
    // are live from the moment the player takes their seat, no climb needed.
    // Each test is found by id fresh: a run test drops out of the fork the
    // moment it runs, and the next one only unlocks once the first has.
    await testButton(packedCard(wrapper), 'trace-the-wet').trigger('click')
    await testButton(packedCard(wrapper), 'undercarriage-look').trigger('click')
    await wrapper.find('[data-test="take-seat-packed"]').trigger('click')

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

  it('keeps the shared visit and its narrowing across a room visit', async () => {
    const wrapper = mountScreen()
    await inspect(wrapper)
    await testButton(thinCard(wrapper), 'hand-crank').trigger('click')
    await testButton(thinCard(wrapper), 'electrics-check').trigger('click')
    expect(wrapper.find('[data-test="est-value-thin"]').find('.up').text()).toBe('¥230,971')

    // Seat the thin lot, let it roll back, and return to the lobby.
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')
    await wrapper.find('[data-test="letgo"]').trigger('click')
    await wrapper.find('[data-test="lobby-back"]').trigger('click')

    // The shared visit clock and the narrowed estimate are both still there:
    // only leaving the screen forgets them.
    expect(wrapper.find('[data-test="visit-panel"]').text()).toContain('35m left')
    expect(wrapper.find('[data-test="est-value-thin"]').find('.up').text()).toBe('¥230,971')
  })

  it('closes a watched steal with the outcome strip and the bargain-missed epilogue, then runs it back', async () => {
    const wrapper = mountScreen()
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
      'The clerk looks over the room. Reserve is ¥115,096.',
    )
    expect(wrapper.find('[data-test="bid"]').text()).toBe('Bid the reserve')
  })

  it('rolls back a lot let go before any bid, with no epilogue, then restores the lobby', async () => {
    const wrapper = mountScreen()
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

  it('shows the real player cash in the room header, not the demo bankroll', async () => {
    const wrapper = mountScreen()
    const game = useGameStore()
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    expect(wrapper.find('[data-test="room-cash"]').text()).toBe(`Cash: ${formatYen(game.cashYen)}`)
  })

  it('leaves no timers behind on unmount', async () => {
    const wrapper = mount(AuctionRoomDemoScreen, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
