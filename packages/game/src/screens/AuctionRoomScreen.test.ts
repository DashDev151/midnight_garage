import { CARS, TUTORIAL_LOT, type AuctionLot, type TurnoutBand } from '@midnight-garage/content'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import {
  createRng,
  generateAuctionCatalog,
  playerEstimateYen,
  sheetGuideValueYen,
} from '@midnight-garage/sim'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import AuctionRoomScreen from './AuctionRoomScreen.vue'

/**
 * The production live auction room, mounted through a real router (the
 * screen reads `route.params.lotId` and navigates back to `auctions` on its
 * own). Every fixture lot is real, content-backed data
 * (`generateAuctionCatalog`), stripped of symptoms so the room's read and
 * the player's own number are identical by construction - the tests below
 * are about the room's wiring to live state, not the diagnosis system
 * (already covered elsewhere).
 */

const mountedWrappers: VueWrapper[] = []

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auctions', name: 'auctions', component: { render: () => null } },
      { path: '/auctions/:lotId/room', name: 'auction-room', component: AuctionRoomScreen },
    ],
  })
}

async function mountRoom(lotId: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = makeRouter()
  router.push({ name: 'auction-room', params: { lotId } })
  await router.isReady()
  const wrapper = mount(AuctionRoomScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

/** Runs the fake clock forward and lets the DOM catch up. */
async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

/** The room ref `<script setup>` exposes - same access pattern the demo's
 * own test suite already relies on (`AuctionRoomDemoScreen.test.ts`). */
interface RoomLike {
  status: string
  leader: 'player' | 'room' | null
  boardYen: number
  reserveYen: number
  incrementYen: number
  clearingYen: number
  playerNumberYen: number
  config: { clockMs: number }
  log: string[]
}

function roomOf(wrapper: VueWrapper): RoomLike {
  return (wrapper.vm as unknown as { room: RoomLike }).room
}

/** A real, deterministic, symptom-free lot: a fresh local-yard shitbox with
 * every doubt stripped, so the room's read and the player's own number agree
 * exactly and every test drives the same fixture regardless of what
 * generation happened to roll for it. */
function makeLot(
  game: ReturnType<typeof useGameStore>,
  id: string,
  turnout: TurnoutBand,
): AuctionLot {
  const model = CARS.find((c) => c.id === 'suzuki-wagon-r-ct21s')
  if (!model) throw new Error('fixture model missing from the roster')
  const [rolled] = generateAuctionCatalog([model], 'local-yard', 1, 1, createRng(7), game.context)
  if (!rolled) throw new Error('fixture generation produced no lot')
  return { ...rolled, id, turnout, car: { ...rolled.car, symptoms: [] } }
}

function seatLot(game: ReturnType<typeof useGameStore>, lot: AuctionLot): void {
  game.gameState = {
    ...game.gameState,
    activeAuctionLots: [...game.gameState.activeAuctionLots.filter((l) => l.id !== lot.id), lot],
  }
}

/** Opens at the reserve, then keeps overtaking with the biggest rung on offer
 * whenever the room is leading, until either it resolves or the guard budget
 * runs out - a real, UI-driven win, not a hand-rolled shortcut. */
async function driveToPlayerWin(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-test="bid"]').trigger('click')
  for (let i = 0; i < 400; i++) {
    if (wrapper.find('[data-test="outcome"]').exists()) return
    const jump8 = wrapper.find('[data-test="bid-jump-8"]')
    if (jump8.exists() && !(jump8.element as HTMLButtonElement).disabled) {
      await jump8.trigger('click')
    }
    await advance(200)
  }
  throw new Error('room never resolved within the guard budget')
}

describe('AuctionRoomScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
    vi.useRealTimers()
  })

  it('seats the room from live data with the real read and the real number', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'seat-test-lot', 'thin')
    seatLot(game, lot)
    const model = game.context.modelsById[lot.modelId]!
    const roomReadYen = Math.round(sheetGuideValueYen(lot.car, model, game.gameState, game.context))
    const playerNumberYen = Math.round(
      playerEstimateYen(lot.car, model, game.gameState, game.context),
    )
    // Symptom-free: the room's read and the player's own number agree.
    expect(playerNumberYen).toBe(roomReadYen)
    const reserveYen = Math.round(roomReadYen * game.context.economy.auctionRoom.reserveFraction)

    const { wrapper } = await mountRoom(lot.id)

    expect(wrapper.find('.headline').text()).toContain(formatYen(playerNumberYen))
    expect(wrapper.find('[data-test="log"]').text()).toContain(formatYen(reserveYen))
    // A thin room seats exactly two dealers alongside the player.
    expect(wrapper.find('[data-test="seat-0"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="seat-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="seat-2"]').exists()).toBe(false)
  })

  it('the win path settles instantly: cash down by the hammer, the car owned, the lot gone', async () => {
    const game = useGameStore()
    game.devGiveCash(50_000_000)
    const lot = makeLot(game, 'win-test-lot', 'thin')
    seatLot(game, lot)
    const { wrapper } = await mountRoom(lot.id)
    const cashBefore = game.cashYen

    await driveToPlayerWin(wrapper)

    expect(wrapper.find('[data-test="outcome"]').text()).toBe('Yours.')
    const finalBoardYen = roomOf(wrapper).boardYen
    expect(game.cashYen).toBe(cashBefore - finalBoardYen)
    expect(game.gameState.ownedCars.some((c) => c.id === lot.car.id)).toBe(true)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })

  it('the lost path removes the lot with no cash or car movement on the player side', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'lost-test-lot', 'thin')
    seatLot(game, lot)
    const { wrapper } = await mountRoom(lot.id)
    const cashBefore = game.cashYen

    // Never bids - the room's own dealer-versus-dealer climb hammers to a rival.
    await advance(3_600_000)

    expect(wrapper.find('[data-test="outcome"]').text()).toBe('Gone.')
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
    expect(game.gameState.ownedCars.some((c) => c.id === lot.car.id)).toBe(false)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('a no-sale before any bid leaves the lot untouched on the board', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'no-sale-test-lot', 'thin')
    seatLot(game, lot)
    const { wrapper } = await mountRoom(lot.id)
    const cashBefore = game.cashYen

    await wrapper.find('[data-test="letgo"]').trigger('click')

    expect(wrapper.find('[data-test="outcome"]').text()).toBe('Rolled back.')
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(true)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('re-entering the same lot on the same day replays an identical room (the stable seed)', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'replay-test-lot', 'packed')
    seatLot(game, lot)

    const first = await mountRoom(lot.id)
    const room1 = roomOf(first.wrapper)
    const log1 = first.wrapper.find('[data-test="log"]').text()
    first.wrapper.unmount()

    const second = await mountRoom(lot.id)
    const room2 = roomOf(second.wrapper)
    const log2 = second.wrapper.find('[data-test="log"]').text()

    expect(room2.reserveYen).toBe(room1.reserveYen)
    expect(room2.clearingYen).toBe(room1.clearingYen)
    expect(log2).toBe(log1)
  })

  it('auto-bid answers up to its ceiling and stops the instant the next rung would pass it', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'autobid-test-lot', 'thin')
    seatLot(game, lot)
    // Auto-bid is enabled from Settings, not a toggle in the room - the room
    // only offers the ceiling once it's on.
    game.setAutoBidEnabled(true)
    const { wrapper } = await mountRoom(lot.id)
    const opening = roomOf(wrapper)
    const ceiling = opening.reserveYen + opening.incrementYen

    await wrapper.find('[data-test="autobid-ceiling"]').setValue(ceiling)

    // The opener lands (autobid itself, since nothing has bid yet and the
    // reserve sits at or under the ceiling), then the room's own counter
    // reaches exactly the ceiling; the rung past that would exceed it, so
    // autobid never answers a second time even as the room keeps climbing
    // dealer against dealer on its own, all the way to its clearing price
    // (the same generous window the machine's own "climbs to clearing"
    // test uses).
    await advance(3_600_000)

    // Reads the room's own full log, not the rendered window (which only ever
    // shows the newest five lines and would miss an early opener by now).
    const fullLog = roomOf(wrapper).log.join('\n')
    const playerBids = fullLog.match(/You (open|raise):/g) ?? []
    expect(playerBids).toHaveLength(1)
    expect(wrapper.find('[data-test="outcome"]').exists()).toBe(true)
    expect(roomOf(wrapper).boardYen).toBeGreaterThan(ceiling)
  })

  it('a relaxed or unhurried fuse preset (set from Settings) scales the room clock on the next room built, pinned to the exact multiplier', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'fuse-test-lot', 'thin')
    seatLot(game, lot)
    const baseClockMs = game.context.economy.auctionRoom.clockMs

    const first = await mountRoom(lot.id)
    expect(roomOf(first.wrapper).config.clockMs).toBe(baseClockMs)
    first.wrapper.unmount()

    // The preset selector lives in Settings - the room only ever reads
    // `game.fusePreset` when it builds a fresh room.
    game.setFusePreset('unhurried')
    const second = await mountRoom(lot.id)
    expect(roomOf(second.wrapper).config.clockMs).toBe(Math.round(baseClockMs * 2.4))
  })

  it('disables a raise option the instant its landing price passes current cash, with a reason', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'cash-gate-test-lot', 'thin')
    seatLot(game, lot)
    const { wrapper } = await mountRoom(lot.id)

    // Let the room's own opener land so the raise-option row replaces the
    // single opening button.
    await advance(5000)
    const opening = roomOf(wrapper)
    expect(opening.leader).not.toBeNull()

    // Affords the rung-1 landing but not the rung-4 landing.
    game.gameState = { ...game.gameState, cashYen: opening.boardYen + opening.incrementYen }
    await nextTick()

    const rung1 = wrapper.find('[data-test="bid"]')
    const rung4 = wrapper.find('[data-test="bid-jump-4"]')
    expect((rung1.element as HTMLButtonElement).disabled).toBe(false)
    expect((rung4.element as HTMLButtonElement).disabled).toBe(true)
    expect(rung4.attributes('title')).toContain('Not enough cash')
  })

  it('the tutorial quiet room rolls no dealers: bidding the reserve and letting the fuse run wins honestly', async () => {
    const game = useGameStore()
    game.newGame(3)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === TUTORIAL_LOT.lotId)).toBe(true)

    const { wrapper } = await mountRoom(TUTORIAL_LOT.lotId)

    // Only the player's own seat - nobody else came for her.
    expect(wrapper.find('[data-test="seat-you"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="seat-0"]').exists()).toBe(false)

    await wrapper.find('[data-test="bid"]').trigger('click')
    expect(wrapper.find('[data-test="log"]').text()).toContain('You open:')

    // Nobody left to counter: the fuse alone decides it.
    await advance(6000)

    expect(wrapper.find('[data-test="outcome"]').text()).toBe('Yours.')
    expect(game.gameState.ownedCars.some((c) => c.id === TUTORIAL_LOT.carId)).toBe(true)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === TUTORIAL_LOT.lotId)).toBe(false)
  })

  it('shows only the newest five lines of a longer room log, in order', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'log-window-test-lot', 'packed')
    seatLot(game, lot)
    const { wrapper } = await mountRoom(lot.id)

    // Runs the packed room's own dealer-versus-dealer climb forward until its
    // full log has grown past the rendered window, stopping the instant it
    // has (or if it resolves first, whichever comes first).
    for (let i = 0; i < 500; i++) {
      if (roomOf(wrapper).log.length > 5) break
      if (wrapper.find('[data-test="outcome"]').exists()) break
      await advance(200)
    }
    const fullLog = roomOf(wrapper).log
    expect(fullLog.length).toBeGreaterThan(5)

    const renderedLines = wrapper.find('[data-test="log"]').findAll('li')
    expect(renderedLines).toHaveLength(5)
    expect(renderedLines.at(-1)!.text()).toBe(fullLog.at(-1))
  })

  it('keeps the raise and let-go controls in place, disabled rather than gone, while the player leads', async () => {
    const game = useGameStore()
    const lot = makeLot(game, 'leading-test-lot', 'thin')
    seatLot(game, lot)
    const { wrapper } = await mountRoom(lot.id)

    await wrapper.find('[data-test="bid"]').trigger('click')
    expect(roomOf(wrapper).leader).toBe('player')

    const actions = wrapper.find('.room-actions')
    expect(actions.exists()).toBe(true)
    const raiseButtons = actions.findAll('button[data-test^="bid"]')
    expect(raiseButtons.length).toBeGreaterThan(0)
    for (const button of raiseButtons) {
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
    }
    const letgo = wrapper.find('[data-test="letgo"]')
    expect((letgo.element as HTMLButtonElement).disabled).toBe(true)
  })

  /** The room-entry admission: the real content ships every tier at 0 (built
   * dark), so only the "nothing renders" pin runs under real content; the
   * charge-on-entry behaviour needs a test-override context to exercise at
   * all. */
  describe('room admission', () => {
    it('shows no admission line under the real, zero-fee content', async () => {
      const game = useGameStore()
      const lot = makeLot(game, 'admission-zero-test-lot', 'thin')
      seatLot(game, lot)
      const { wrapper } = await mountRoom(lot.id)

      expect(wrapper.find('[data-test="admission-fee"]').exists()).toBe(false)
    })

    it('shows and charges the admission once a tier fee is tuned above zero, covering a same-day re-entry', async () => {
      const game = useGameStore()
      const lot = makeLot(game, 'admission-nonzero-test-lot', 'thin')
      seatLot(game, lot)
      game.context = {
        ...game.context,
        economy: {
          ...game.context.economy,
          auctionRoom: {
            ...game.context.economy.auctionRoom,
            attendanceFeeYenByTier: {
              'local-yard': 5_000,
              regional: 5_000,
              premium: 5_000,
              'collector-network': 5_000,
            },
          },
        },
      }
      const cashBefore = game.cashYen

      const first = await mountRoom(lot.id)
      expect(first.wrapper.find('[data-test="admission-fee"]').text()).toBe(
        `Admission: ${formatYen(5_000)}`,
      )
      expect(game.cashYen).toBe(cashBefore - 5_000)
      first.wrapper.unmount()

      // Re-entering the same lot the same day is already covered - no
      // second charge.
      await mountRoom(lot.id)
      expect(game.cashYen).toBe(cashBefore - 5_000)
    })

    it('refuses to seat when admission is unaffordable, redirecting back to auctions', async () => {
      const game = useGameStore()
      const lot = makeLot(game, 'admission-refused-test-lot', 'thin')
      seatLot(game, lot)
      game.context = {
        ...game.context,
        economy: {
          ...game.context.economy,
          auctionRoom: {
            ...game.context.economy.auctionRoom,
            attendanceFeeYenByTier: {
              'local-yard': 5_000,
              regional: 5_000,
              premium: 5_000,
              'collector-network': 5_000,
            },
          },
        },
      }
      game.gameState = { ...game.gameState, cashYen: 0 }

      const { wrapper, router } = await mountRoom(lot.id)

      expect(wrapper.find('.auction-room').exists()).toBe(false)
      expect(router.currentRoute.value.name).toBe('auctions')
      expect(game.cashYen).toBe(0)
    })
  })
})
