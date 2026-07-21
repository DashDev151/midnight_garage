<script setup lang="ts">
import type { GameState } from '@midnight-garage/content'
import {
  apparentViewOf,
  playerEstimateYen,
  runDiagnosticTest,
  sheetGuideValueYen,
} from '@midnight-garage/sim'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SymptomChecklist from '../components/SymptomChecklist.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import {
  ROOM_TUNING,
  buildDemoLobby,
  enterRoom,
  letGo,
  nextRungYen,
  playerBid,
  tick,
  verdictFor,
  type DemoLearned,
  type DemoLobbyEntry,
  type DemoRoom,
  type DemoRoomStatus,
  type DemoVerdict,
} from './auctionRoomDemo'

const game = useGameStore()

// Rolled once per mount, view-local: leaving the screen forgets everything.
const lobby = buildDemoLobby(game.gameState, game.context)

// lobby -> inspect (decision-paced, no clock) -> room (the timed floor).
type Phase = 'lobby' | 'inspect' | 'room'
const phase = ref<Phase>('lobby')

// The inspect phase drives the REAL diagnosis mechanic over demo-local state:
// a one-lot game state carrying a full inspection visit, narrowed by the same
// runDiagnosticTest the live yard visit calls. Nothing here reads or writes
// saves, the auction board, or any live sim state.
const inspectEntry = ref<DemoLobbyEntry | null>(null)
const demoState = ref<GameState | null>(null)
const resultCopies = ref<Record<number, string>>({})

const room = ref<DemoRoom | null>(null)
const currentEntry = ref<DemoLobbyEntry | null>(null)
const currentLearned = ref<DemoLearned | null>(null)
const runIndex = ref(0)

// The demo clock: a plain accumulator advanced only by the interval below,
// handed to the machine on every fire. No wall-clock reads anywhere.
const TICK_INTERVAL_MS = 50
const FUSE_RED_MS = 1500
const FLASH_MS = 600
const demoNowMs = ref(0)
let intervalId: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  intervalId = setInterval(() => {
    demoNowMs.value += TICK_INTERVAL_MS
    if (room.value) tick(room.value, demoNowMs.value)
  }, TICK_INTERVAL_MS)
})

onUnmounted(() => {
  if (intervalId !== undefined) clearInterval(intervalId)
})

// --- Inspect phase: the real diagnosis over demo-local state ---

const currentLot = computed(() => demoState.value?.activeAuctionLots[0] ?? null)
const currentModel = computed(() =>
  currentLot.value ? (game.context.modelsById[currentLot.value.modelId] ?? null) : null,
)

// The checklist shape comes straight from the store getter the auction board
// uses, recomputed over the CURRENT (narrowing) demo lot - never hand-rolled.
const symptoms = computed(() => {
  const lot = currentLot.value
  const model = currentModel.value
  if (!lot || !model) return []
  return game.symptomChecklistForCar(lot.car, apparentViewOf(lot.car), model)
})

// The room's odds read: fixed, it does not move as the doubt narrows.
const roomReadYen = computed(() => {
  const lot = currentLot.value
  const model = currentModel.value
  const state = demoState.value
  if (!lot || !model || !state) return 0
  return Math.round(sheetGuideValueYen(lot.car, model, state, game.context))
})

// The player's own number: equals the room read before any test, converging on
// the truth as causes fall away.
const yourNumberYen = computed(() => {
  const lot = currentLot.value
  const model = currentModel.value
  const state = demoState.value
  if (!lot || !model || !state) return 0
  return Math.round(playerEstimateYen(lot.car, model, state, game.context))
})

const inspectVerdict = computed<DemoVerdict>(() =>
  verdictFor(roomReadYen.value, yourNumberYen.value),
)
const minutesLeft = computed(() => demoState.value?.inspectionVisit?.minutesLeft ?? 0)

// The one value the inspect phase shows: the estimated market value. `original`
// is the room read captured at entry; `current` is the player's own number over
// the narrowing lot. They start equal and part once a test moves the estimate,
// at which point the original is struck through and the new figure drawn beside it.
const originalEstimateYen = computed(() => inspectEntry.value?.roomReadYen ?? 0)
const estimateMoved = computed(() => yourNumberYen.value !== originalEstimateYen.value)
const estimateUp = computed(() => yourNumberYen.value > originalEstimateYen.value)

function resultCopyFor(symptomIndex: number): string | undefined {
  return resultCopies.value[symptomIndex]
}

function disabledReasonFor(test: { minutes: number; alreadyRun: boolean }): string | null {
  if (test.alreadyRun) return 'Already run'
  if (minutesLeft.value < test.minutes)
    return `Needs ${test.minutes}m, only ${minutesLeft.value}m left`
  return null
}

// A run test narrows the doubt through the real function; the player's number
// and verdict both re-derive from the narrowed lot.
function onRunTest(payload: { lotId: string; symptomIndex: number; testId: string }): void {
  const state = demoState.value
  if (!state) return
  const result = runDiagnosticTest(
    state,
    payload.lotId,
    payload.symptomIndex,
    payload.testId,
    game.context,
  )
  demoState.value = result.state
  if (result.resultCopy)
    resultCopies.value = { ...resultCopies.value, [payload.symptomIndex]: result.resultCopy }
}

// --- Phase transitions ---

function takeALook(entry: DemoLobbyEntry): void {
  inspectEntry.value = entry
  demoState.value = {
    ...game.gameState,
    activeAuctionLots: [entry.lot],
    inspectionVisit: {
      tier: entry.lot.tier,
      minutesLeft: game.context.economy.diagnosis.visitMinutes,
    },
  }
  resultCopies.value = {}
  phase.value = 'inspect'
}

function takeSeat(): void {
  const entry = inspectEntry.value
  if (!entry) return
  const learned: DemoLearned = {
    playerNumberYen: yourNumberYen.value,
    verdict: inspectVerdict.value,
    trueValueYen: entry.trueValueYen,
  }
  currentEntry.value = entry
  currentLearned.value = learned
  runIndex.value = 0
  room.value = reactive(enterRoom(entry, runIndex.value, demoNowMs.value, learned))
  phase.value = 'room'
}

function runItBack(): void {
  if (!currentEntry.value || !currentLearned.value) return
  runIndex.value += 1
  room.value = reactive(
    enterRoom(currentEntry.value, runIndex.value, demoNowMs.value, currentLearned.value),
  )
}

function backToLobby(): void {
  room.value = null
  currentEntry.value = null
  currentLearned.value = null
  inspectEntry.value = null
  demoState.value = null
  resultCopies.value = {}
  phase.value = 'lobby'
}

// --- Room phase ---

function turnoutLine(entry: DemoLobbyEntry): string {
  const crowd = entry.key === 'thin' ? 'Thin turnout' : 'Packed room'
  return `${crowd} · ${entry.dealerCount} dealers`
}

function fuseRemainingMs(live: DemoRoom): number {
  return Math.max(0, live.clockEndsAtMs - demoNowMs.value)
}

function seatFlash(live: DemoRoom, by: string): boolean {
  return (
    live.lastBid !== null &&
    live.lastBid.by === by &&
    demoNowMs.value - live.lastBid.atMs < FLASH_MS
  )
}

// The bid control turns once the next rung would exceed the player's own number
// (their estimated value from looking closely, or the room read if they never
// ran a test).
function pastNumber(live: DemoRoom): boolean {
  return nextRungYen(live) > live.playerNumberYen
}

function outcomeText(status: DemoRoomStatus): string {
  if (status === 'won') return 'Yours.'
  if (status === 'lost') return 'Gone.'
  return 'Rolled back.'
}
</script>

<template>
  <section class="room-demo">
    <RouterLink :to="{ name: 'auctions' }" class="back">&lt; Back</RouterLink>
    <p class="demo-banner" data-test="demo-banner">Dev demo: nothing here is saved.</p>

    <div v-if="phase === 'lobby'" class="lobby">
      <div
        v-for="entry in lobby"
        :key="entry.key"
        class="lobby-card"
        :data-test="'lobby-' + entry.key"
      >
        <h3>{{ entry.displayName }}</h3>
        <p class="headline">Estimated market value: {{ formatYen(entry.roomReadYen) }}.</p>
        <p class="turnout">{{ turnoutLine(entry) }}</p>
        <button class="primary" :data-test="'inspect-' + entry.key" @click="takeALook(entry)">
          Take a look
        </button>
      </div>
    </div>

    <div v-else-if="phase === 'inspect' && inspectEntry" class="inspect">
      <header class="room-head">
        <h3>{{ inspectEntry.displayName }}</h3>
      </header>
      <p class="minutes" data-test="minutes-left">{{ minutesLeft }}m left</p>

      <SymptomChecklist
        :symptoms="symptoms"
        :lot-id="inspectEntry.lot.id"
        :disabled-reason-for="disabledReasonFor"
        :result-copy-for="resultCopyFor"
        :show-deltas="false"
        @run-test="onRunTest"
      />

      <p class="est-value" data-test="est-value">
        Estimated market value:
        <template v-if="!estimateMoved">{{ formatYen(originalEstimateYen) }}</template>
        <template v-else>
          <span class="was">{{ formatYen(originalEstimateYen) }}</span>
          <span :class="estimateUp ? 'up' : 'down'">{{ formatYen(yourNumberYen) }}</span>
        </template>
      </p>

      <div class="room-actions">
        <button class="primary" :data-test="'take-seat-' + inspectEntry.key" @click="takeSeat">
          Take a seat
        </button>
        <button data-test="lobby-back" @click="backToLobby">Back to the lobby</button>
      </div>
    </div>

    <div v-else-if="phase === 'room' && room" class="room">
      <header class="room-head">
        <h3>{{ room.displayName }}</h3>
        <p class="headline">Estimated market value: {{ formatYen(room.playerNumberYen) }}</p>
      </header>

      <div class="seats">
        <div class="seat" data-test="seat-you" :class="{ flash: seatFlash(room, 'player') }">
          <span v-if="room.leader === 'player'" class="chip" data-test="leader-chip">
            {{ formatYen(room.boardYen) }}
          </span>
          <span class="figure" aria-hidden="true">
            <span class="head"></span>
            <span class="shoulders"></span>
          </span>
          <span class="seat-name">You</span>
        </div>
        <div
          v-for="(dealer, i) in room.dealers"
          :key="dealer.name"
          class="seat"
          :data-test="'seat-' + i"
          :class="{ flash: seatFlash(room, dealer.name), dropped: !dealer.active }"
        >
          <span v-if="room.leaderName === dealer.name" class="chip" data-test="leader-chip">
            {{ formatYen(room.boardYen) }}
          </span>
          <span class="figure" aria-hidden="true">
            <span class="head"></span>
            <span class="shoulders"></span>
          </span>
          <span class="seat-name">{{ dealer.name }}</span>
          <span v-if="!dealer.active" class="out-tag">out</span>
        </div>
      </div>

      <p class="board" data-test="board">{{ formatYen(room.boardYen) }}</p>
      <div class="fuse-track">
        <div
          class="fuse"
          data-test="fuse"
          :class="{ dying: fuseRemainingMs(room) < FUSE_RED_MS }"
          :style="{ width: (fuseRemainingMs(room) / ROOM_TUNING.clockMs) * 100 + '%' }"
        ></div>
      </div>

      <ul class="room-log" data-test="log">
        <li v-for="(line, i) in room.log" :key="i">{{ line }}</li>
      </ul>

      <div v-if="room.status === 'open' && room.leader !== 'player'" class="room-actions">
        <button
          :class="pastNumber(room) ? 'danger' : 'primary'"
          data-test="bid"
          @click="playerBid(room, demoNowMs)"
        >
          {{
            room.leader === null ? 'Bid the reserve' : `Raise to ${formatYen(nextRungYen(room))}`
          }}
        </button>
        <button data-test="letgo" @click="letGo(room)">Let it go</button>
      </div>
      <p
        v-if="room.status === 'open' && room.leader !== 'player' && pastNumber(room)"
        class="past-number"
        data-test="past-number"
      >
        Past your number.
      </p>

      <div v-if="room.status !== 'open'" class="outcome-strip">
        <p class="outcome" data-test="outcome">{{ outcomeText(room.status) }}</p>
        <p v-if="room.epilogue" class="epilogue" data-test="epilogue">{{ room.epilogue }}</p>
        <div class="room-actions">
          <button class="primary" data-test="run-back" @click="runItBack">Run it back</button>
          <button data-test="lobby-back" @click="backToLobby">Back to the lobby</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

.demo-banner {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-3);
  width: fit-content;
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

.lobby {
  display: grid;
  gap: var(--mg-space-4);
}

.lobby-card,
.inspect,
.room {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: grid;
  gap: var(--mg-space-2);
}

.lobby-card h3,
.room-head h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0;
}

.headline {
  margin: 0;
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.turnout {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The visit clock the player is spending as they look: a small cyan line, the
   same weight the live yard-visit banner carries. */
.minutes {
  margin: 0;
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
}

/* The one inspect-phase value: the estimated market value. Once a test moves
   it, the original is struck dim and the new figure is drawn beside it, green
   up or red down. */
.est-value {
  margin: 0;
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.est-value .was {
  color: var(--mg-text-dim);
  text-decoration: line-through;
  margin-left: 0.35em;
}

.est-value .up {
  color: var(--mg-success);
  margin-left: 0.35em;
}

.est-value .down {
  color: var(--mg-danger);
  margin-left: 0.35em;
}

/* The silhouette row: the player seated with the dealers. */
.seats {
  display: flex;
  align-items: flex-end;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  padding-top: var(--mg-space-2);
}

.seat {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 2px;
  min-width: 64px;
  padding-top: 26px;
}

.seat.dropped {
  opacity: 0.35;
}

/* Pure CSS head-and-shoulders: a circle over a rounded block. */
.figure {
  display: grid;
  justify-items: center;
}

.head {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--mg-night-deep);
  border: var(--mg-border);
}

.shoulders {
  width: 34px;
  height: 16px;
  margin-top: 2px;
  border-radius: 10px 10px 4px 4px;
  background: var(--mg-night-deep);
  border: var(--mg-border);
}

.seat.flash .head,
.seat.flash .shoulders {
  background: var(--mg-text-dim);
}

.seat-name {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  text-align: center;
  max-width: 8em;
}

.out-tag {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: 0 var(--mg-space-1);
}

/* The winning chip: the board price in green, above the leader's head. */
.chip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  color: var(--mg-success);
  background: var(--mg-night-deep);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: 0 var(--mg-space-1);
  font-size: var(--mg-fs-sm);
  white-space: nowrap;
}

/* The board price: the loudest number in the room, in amber. */
.board {
  margin: 0;
  color: var(--mg-yen);
  font-size: var(--mg-fs-lg);
  font-weight: bold;
}

/* The fuse: drains with the bid clock, dying red near the hammer. */
.fuse-track {
  height: 6px;
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  overflow: hidden;
}

.fuse {
  height: 100%;
  background: var(--mg-yen);
}

.fuse.dying {
  background: var(--mg-danger);
}

/* The room log: monospace, like the day report's line lists. */
.room-log {
  list-style: none;
  margin: 0;
  padding: var(--mg-space-2);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  font-family: var(--mg-font-body);
  font-size: var(--mg-fs-sm);
}

.room-log li {
  padding: 2px 0;
  color: var(--mg-text-dim);
}

.room-log li:last-child {
  color: var(--mg-text);
}

/* Past the player's number: the moment chasing stops paying. */
.past-number {
  margin: 0;
  color: var(--mg-danger);
  font-size: var(--mg-fs-sm);
}

.outcome-strip {
  display: grid;
  gap: var(--mg-space-2);
}

.outcome {
  margin: 0;
  color: var(--mg-text);
  font-size: var(--mg-fs-md);
  font-weight: bold;
}

.epilogue {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.room-actions {
  display: flex;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-2) var(--mg-space-3);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

button.primary {
  background: var(--mg-neon-violet);
  color: var(--mg-night-deep);
  border-color: var(--mg-neon-violet);
}

button.danger {
  background: var(--mg-danger);
  color: var(--mg-night-deep);
  border-color: var(--mg-danger);
}
</style>
