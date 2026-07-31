import type { GameState } from '@midnight-garage/content'
import { playerEstimateYen, runDiagnosticTest } from '@midnight-garage/sim'
import { mount, RouterLinkStub, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import {
  enterRoom,
  nextRungYen,
  roomConfigFrom,
  tick,
  type Learned,
  type Room,
} from './auctionRoom'
import {
  buildDemoLobby,
  DEMO_BANKROLL_YEN,
  demoRoomSeed,
  verdictFor,
  type DemoLobbyEntry,
} from './auctionRoomDemo'
import AuctionRoomDemoScreen from './AuctionRoomDemoScreen.vue'

// This file's own suite runs 23-26s standalone (a real seeded bid-war
// simulation, not a slow test) and has exceeded Vitest's default 5s
// per-test timeout under `--project game`'s whole-project resource
// contention while passing every time run in isolation - a flake, not a
// regression. An explicit, generous per-test timeout makes the file
// reliable under contention without masking a genuine hang.
vi.setConfig({ testTimeout: 30_000 })

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

/** The same two named lots the screen itself builds (`buildDemoLobby`),
 * fetched independently here so every yen assertion below can be re-derived
 * from live content rather than pinned by hand - a repricing moves this
 * file's expectations right along with the screen's own numbers. */
function buildLobby(): DemoLobbyEntry[] {
  const game = useGameStore()
  return buildDemoLobby(game.gameState, game.context)
}

function roomConfig() {
  return roomConfigFrom(useGameStore().context.economy)
}

/** The reserve `enterRoom` opens a lot's room on - the same formula it uses
 * internally, re-derived rather than pinned. */
function reserveYenFor(roomReadYen: number): number {
  return Math.round(roomReadYen * roomConfig().reserveFraction)
}

/**
 * The player's own estimate after running exactly `testIds`, in order,
 * against a fresh copy of `entry`'s lot - runs the REAL `runDiagnosticTest`
 * against a throwaway `GameState` (mirrors `AuctionRoomDemoScreen.vue`'s own
 * `demoState`), then prices the result with the REAL `playerEstimateYen`,
 * exactly the two functions the screen itself calls. No partition logic is
 * re-implemented here: this is the same narrowing a click produces, just
 * computed ahead of time so the test has something to assert against beyond
 * "some number changed".
 */
function estimateAfterTests(entry: DemoLobbyEntry, testIds: readonly string[]): number {
  const game = useGameStore()
  let state: GameState = {
    ...game.gameState,
    activeAuctionLots: [entry.lot],
    inspectionVisit: { tier: 'local-yard', minutesLeft: 10_000 },
  }
  for (const testId of testIds) {
    const result = runDiagnosticTest(state, entry.lot.id, 0, testId, game.context)
    state = result.state
  }
  const lot = state.activeAuctionLots.find((l) => l.id === entry.lot.id)!
  const model = game.context.modelsById[lot.modelId]!
  return Math.round(playerEstimateYen(lot.car, model, state, game.context))
}

/** Minutes `testIds` cost off the real diagnostic-test catalogue, summed -
 * what the shared visit clock should read down by after running them all. */
function minutesFor(testIds: readonly string[]): number {
  const game = useGameStore()
  return testIds.reduce((sum, id) => sum + game.context.diagnosticTestsById[id]!.minutes, 0)
}

/** A shadow room, seated and ticked forward exactly like the screen's own
 * room, for assertions (a mid-climb board value) that need real seeded state
 * rather than a closed-form yen figure. `tick` fast-forwards a whole climb in
 * one call (see auctionRoom.ts's own doc comment), so a single big jump here
 * lands in the same state as the screen's many small clock ticks would. */
function roomAfter(entry: DemoLobbyEntry, learned: Learned, atMs: number): Room {
  const room = enterRoom(entry, demoRoomSeed(entry.key, 0), 0, learned, roomConfig())
  tick(room, atMs)
  return room
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

function visitPanelText(wrapper: VueWrapper): string {
  return wrapper.find('[data-test="visit-panel"]').text()
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

/** The trap lot's own diagnostic chain, start to finish: `coolant-check`
 * narrows the overheat onto the combustion-breach pair (an early head gasket
 * or a cracked block), then `compression-test` isolates the cracked block
 * alone - the trap's pinned true cause (`auctionRoomDemo.ts`'s own
 * `TRAP_TRUE_CAUSE_ID`) - so the two clicks fully resolve it and the player
 * number becomes the car's real, dear worth rather than the room's read. */
const TRAP_TEST_CHAIN = ['coolant-check', 'compression-test'] as const

async function resolveTrap(wrapper: VueWrapper): Promise<void> {
  for (const testId of TRAP_TEST_CHAIN) {
    await testButton(packedCard(wrapper), testId).trigger('click')
  }
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
    const [thin, packed] = buildLobby()

    expect(wrapper.find('[data-test="demo-banner"]').text()).toBe(
      'Dev demo: nothing here is saved.',
    )

    // Both lots draw as the shared production card: the room's number, the
    // turnout badge, grade stamps, the public symptom checklist, and each lot's
    // own estimate line (starting at the room read, unmoved). The badge follows
    // the room the demo assigns: the steal lot sits in a thin room.
    const thinEl = thinCard(wrapper)
    expect(thinEl.text()).toContain(`the room says ${formatYen(thin!.roomReadYen)}`)
    const thinBadge = thinEl.find('.turnout-badge')
    expect(thinBadge.text()).toBe('Thin turnout')
    expect(thinBadge.classes()).toContain('turnout-thin')
    expect(thinEl.find('[data-test^="grade-stamp-overall-"]').exists()).toBe(true)
    expect(thinEl.find('[data-test^="symptom-"]').exists()).toBe(true)
    const estThin = wrapper.find('[data-test="est-value-thin"]')
    expect(estThin.text()).toContain('Estimated market value:')
    expect(estThin.text()).toContain(formatYen(thin!.roomReadYen))
    expect(estThin.find('.was').exists()).toBe(false)
    expect(wrapper.find('[data-test="take-seat-thin"]').text()).toBe('Take a seat')

    const packedEl = packedCard(wrapper)
    expect(packedEl.text()).toContain(`the room says ${formatYen(packed!.roomReadYen)}`)
    const packedBadge = packedEl.find('.turnout-badge')
    expect(packedBadge.text()).toBe('Packed turnout')
    expect(packedBadge.classes()).toContain('turnout-packed')
    expect(wrapper.find('[data-test="est-value-packed"]').text()).toContain(
      formatYen(packed!.roomReadYen),
    )
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
    const test0 = runTestButtons(thinEl)[0]!
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
    const game = useGameStore()
    const [thin] = buildLobby()
    const visitMinutes = game.context.economy.diagnosis.visitMinutes
    // The steal's own diagnostic chain, in click order (auctionRoomDemo.ts's
    // `STEAL_SYMPTOM_ID`'s own test tree): each slice below is "everything
    // clicked so far".
    const chain = ['trace-the-wet', 'carpet-lift', 'coolant-check', 'hose-the-roof']
    const minutesLeftAfter = (steps: number) => visitMinutes - minutesFor(chain.slice(0, steps))
    await inspect(wrapper)
    expect(wrapper.find('[data-test="est-value-thin"]').find('.was').exists()).toBe(false)

    await testButton(thinCard(wrapper), chain[0]!).trigger('click')

    // The damp tracks in from up top (the dash or a pillar), narrowing off the
    // two below-the-floor causes and onto the three up-top ones (which
    // includes the true cause, `perished-grommet`), so the estimate steps off
    // the room read - up or down depends only on live content, so this reads
    // whichever class the real narrowed estimate actually lands in.
    const afterFirstYen = estimateAfterTests(thin!, chain.slice(0, 1))
    const afterFirst = wrapper.find('[data-test="est-value-thin"]')
    expect(afterFirst.find('.was').text()).toBe(formatYen(thin!.roomReadYen))
    const afterFirstDirection = afterFirstYen >= thin!.roomReadYen ? 'up' : 'down'
    expect(afterFirst.find(`.${afterFirstDirection}`).text()).toBe(formatYen(afterFirstYen))
    // The doubt narrowed: the run test's own result line now shows in the trail.
    expect(wrapper.find('[data-test^="breadcrumb-"]').exists()).toBe(true)
    // The shared clock ran down by the test's own real minutes.
    expect(visitPanelText(wrapper)).toContain(`${minutesLeftAfter(1)}m left`)

    await testButton(thinCard(wrapper), chain[1]!).trigger('click')

    // Lifting the carpet draws the same up-top/below-the-floor line the trace
    // already drew, so it narrows nothing further and the money stands still
    // while the clock runs down. The estimate tracks the doubt, not the effort.
    const afterSecond = wrapper.find('[data-test="est-value-thin"]')
    expect(afterSecond.find(`.${afterFirstDirection}`).text()).toBe(formatYen(afterFirstYen))
    expect(visitPanelText(wrapper)).toContain(`${minutesLeftAfter(2)}m left`)

    await testButton(thinCard(wrapper), chain[2]!).trigger('click')

    // Plain water, no smell: the heater matrix is innocent, narrowing the
    // up-top group further and moving the estimate again.
    const afterThirdYen = estimateAfterTests(thin!, chain.slice(0, 3))
    const afterThird = wrapper.find('[data-test="est-value-thin"]')
    const afterThirdDirection = afterThirdYen >= thin!.roomReadYen ? 'up' : 'down'
    expect(afterThird.find(`.${afterThirdDirection}`).text()).toBe(formatYen(afterThirdYen))
    expect(visitPanelText(wrapper)).toContain(`${minutesLeftAfter(3)}m left`)

    await testButton(thinCard(wrapper), chain[3]!).trigger('click')

    // The roof drains swallow everything poured at them: dry pillars rule out
    // the sunroof drain, so the last cause standing is the pinned true one,
    // `perished-grommet`, the cheapest of the five - the estimate lands on
    // the true worth, comfortably clear of the room read (see
    // auctionRoomDemo.ts's own steal fixture doc comment).
    const est = wrapper.find('[data-test="est-value-thin"]')
    expect(est.find('.was').text()).toBe(formatYen(thin!.roomReadYen))
    expect(est.find('.up').text()).toBe(formatYen(thin!.trueValueYen))
    expect(visitPanelText(wrapper)).toContain(`${minutesLeftAfter(4)}m left`)
  })

  it('resolving the trap redraws its estimate downward, the new figure in red', async () => {
    const wrapper = mountScreen()
    const [, packed] = buildLobby()
    await inspect(wrapper)
    // The trap's overheating settles on its true, dear cause, and it marks
    // the estimate down: the room read was the optimistic one.
    await resolveTrap(wrapper)

    const est = wrapper.find('[data-test="est-value-packed"]')
    expect(est.find('.was').text()).toBe(formatYen(packed!.roomReadYen))
    expect(est.find('.down').text()).toBe(formatYen(packed!.trueValueYen))
    expect(est.find('.up').exists()).toBe(false)
  })

  it('take a seat carries the current lot into the timed room, with no lobby inspect UI there', async () => {
    const wrapper = mountScreen()
    const [thin] = buildLobby()
    const reserveYen = reserveYenFor(thin!.roomReadYen)
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')

    expect(wrapper.find('[data-test="seat-you"]').text()).toContain('You')
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')
    expect(wrapper.find('[data-test="seat-1"]').text()).toContain('Mrs. Sakaki')
    expect(wrapper.find('[data-test="seat-2"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="log"]').text()).toContain(
      `The clerk looks over the room. Reserve is ${formatYen(reserveYen)}.`,
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
    const [thin] = buildLobby()
    const reserveYen = reserveYenFor(thin!.roomReadYen)
    const increment = thin!.incrementYen
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')
    // Lets the room's own opening bid land (Endo opens on the reserve): a
    // leader is now on the board, so the raise-option list replaces the
    // single opening button.
    await advance(2700)
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')

    expect(wrapper.find('[data-test="bid"]').text()).toBe(
      `Raise to ${formatYen(reserveYen + increment)}`,
    )
    expect(wrapper.find('[data-test="bid-jump-4"]').text()).toBe(
      `Raise to ${formatYen(reserveYen + 4 * increment)}`,
    )
    expect(wrapper.find('[data-test="bid-jump-8"]').text()).toBe(
      `Raise to ${formatYen(reserveYen + 8 * increment)}`,
    )
    // The player's number is the room read, since no test has narrowed the
    // doubt yet. Even the eight-rung jump lands under it, so all three
    // options read safe here - the danger flag per option is proven
    // independently by the packed-room case below, where the climb does
    // carry every option past the number.
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
    const [, packed] = buildLobby()
    await inspect(wrapper)
    // Resolve the trap to its true, dear worth; by the time the room has
    // climbed for 18s, every rung on offer already lands past the player's
    // number, so all three read danger at once - each computed off its own
    // landing price, not one shared switch, which the identical `.classes()`
    // calls below still prove independently even though they agree here. A
    // shadow room, seated and ticked the same way the screen's own room is,
    // supplies the exact mid-climb board value to check the labels against.
    await resolveTrap(wrapper)
    const trueValueYen = estimateAfterTests(packed!, [...TRAP_TEST_CHAIN])
    const learned: Learned = {
      playerNumberYen: trueValueYen,
      verdict: verdictFor(packed!.roomReadYen, trueValueYen),
      trueValueYen: packed!.trueValueYen,
      inspected: true,
    }
    const shadow = roomAfter(packed!, learned, 18_000)

    await wrapper.find('[data-test="take-seat-packed"]').trigger('click')
    await advance(18_000)
    expect(wrapper.find('[data-test="seat-0"]').text()).toContain('Endo')

    const rung1 = nextRungYen(shadow)
    const rung4 = shadow.boardYen + 4 * shadow.incrementYen
    const rung8 = shadow.boardYen + 8 * shadow.incrementYen
    expect(rung1).toBeGreaterThan(trueValueYen) // the scenario this test exists to prove
    expect(wrapper.find('[data-test="bid"]').text()).toBe(`Raise to ${formatYen(rung1)}`)
    expect(wrapper.find('[data-test="bid"]').classes()).toContain('danger')
    expect(wrapper.find('[data-test="bid-jump-4"]').text()).toBe(`Raise to ${formatYen(rung4)}`)
    expect(wrapper.find('[data-test="bid-jump-4"]').classes()).toContain('danger')
    expect(wrapper.find('[data-test="bid-jump-8"]').text()).toBe(`Raise to ${formatYen(rung8)}`)
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

  it('marks the bid control past the player number once the room climbs past it', async () => {
    const wrapper = mountScreen()
    await inspect(wrapper)
    // The chain settles the trap at its true, dear worth - well above the
    // packed room's own reserve but well below its clearing price (see
    // auctionRoomDemo.ts's own trap fixture doc comment for the margins), so
    // the room's unprompted climb carries the board past the player's number
    // partway through, and the marker and the danger class light up there
    // rather than at the opening ask.
    await resolveTrap(wrapper)
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
    const [thin] = buildLobby()
    await inspect(wrapper)
    await testButton(thinCard(wrapper), 'trace-the-wet').trigger('click')
    const afterFirstYen = estimateAfterTests(thin!, ['trace-the-wet'])
    const direction = afterFirstYen >= thin!.roomReadYen ? 'up' : 'down'
    expect(wrapper.find('[data-test="est-value-thin"]').find(`.${direction}`).text()).toBe(
      formatYen(afterFirstYen),
    )

    // Seat the thin lot, let it roll back, and return to the lobby.
    await wrapper.find('[data-test="take-seat-thin"]').trigger('click')
    await wrapper.find('[data-test="letgo"]').trigger('click')
    await wrapper.find('[data-test="lobby-back"]').trigger('click')

    // The shared visit clock and the narrowed estimate are both still there:
    // only leaving the screen forgets them.
    const visitMinutes = useGameStore().context.economy.diagnosis.visitMinutes
    const minutesLeft = visitMinutes - minutesFor(['trace-the-wet'])
    expect(visitPanelText(wrapper)).toContain(`${minutesLeft}m left`)
    expect(wrapper.find('[data-test="est-value-thin"]').find(`.${direction}`).text()).toBe(
      formatYen(afterFirstYen),
    )
  })

  it('closes a watched steal with the outcome strip and the bargain-missed epilogue, then runs it back', async () => {
    const wrapper = mountScreen()
    const [thin] = buildLobby()
    const reserveYen = reserveYenFor(thin!.roomReadYen)
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
      `The clerk looks over the room. Reserve is ${formatYen(reserveYen)}.`,
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
