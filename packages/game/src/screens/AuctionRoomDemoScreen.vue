<script setup lang="ts">
import type { AuctionLot, CarModel, GameState } from '@midnight-garage/content'
import { fitmentClassForTier, resolveCarDisplayName } from '@midnight-garage/content'
import {
  apparentViewOf,
  beginInspectionVisit,
  computeAuctionGrade,
  inspectionVisitGateReason,
  playerEstimateYen,
  roomLedgerFor,
  runDiagnosticTest,
} from '@midnight-garage/sim'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuctionLotCard, { type AuctionLotCardView } from '../components/AuctionLotCard.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import {
  ROOM_TUNING,
  armReaction,
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
} from './auctionRoomDemo'

const game = useGameStore()

// Rolled once per mount, view-local: leaving the screen forgets everything.
const lobby = buildDemoLobby(game.gameState, game.context)

// lobby -> room (the timed floor). Inspection happens in the lobby now, over a
// shared paid yard visit; there is no separate inspect phase.
type Phase = 'lobby' | 'room'
const phase = ref<Phase>('lobby')

// One shared demo-local game state for both lots, driving the REAL diagnosis
// mechanic (beginInspectionVisit, runDiagnosticTest) against a fresh labour pool
// and a comfortable bankroll so a yard visit always affords. Nothing here reads
// or writes saves, the auction board, or any live sim state.
const demoState = ref<GameState>({
  ...game.gameState,
  cashYen: ROOM_TUNING.bankrollYen,
  energySpentToday: 0,
  activeAuctionLots: lobby.map((e) => e.lot),
  inspectionVisit: null,
})

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

// --- Lobby: the real diagnosis over the shared demo-local state ---

// Assembles the shared production card's view for a demo lot from the same real
// getters the auction board's lotDetail uses: the room's number and its ledger,
// the auction grades, and the public symptom checklist over the CURRENT
// (narrowing) lot. No parallel value or grade maths - every figure rides a real
// sim or store function. Turnout is the room the demo assigns this lot (the
// steal a thin room, the trap a packed one), not the lot's own generated
// turnout.
function cardViewFor(
  lot: AuctionLot,
  model: CarModel,
  state: GameState,
  guideValueYen: number,
  turnout: AuctionLotCardView['turnout'],
): AuctionLotCardView {
  const apparentCar = apparentViewOf(lot.car)
  return {
    lot,
    displayName: resolveCarDisplayName(model),
    fitmentClass: fitmentClassForTier(model.tier),
    turnout,
    playerHasBid: lot.playerHasBid,
    leadingBidder: lot.leadingBidder,
    auctionGrade: computeAuctionGrade(apparentCar, model, game.context.partIdsByGroup),
    symptoms: game.symptomChecklistForCar(lot.car, apparentCar, model),
    guideValueYen,
    ledger: roomLedgerFor(lot.car, model, state, game.context),
  }
}

// The current (narrowing) lot for a lobby entry, read live from the shared demo
// state by id, so the card and its estimate track every test result.
function currentLotFor(entry: DemoLobbyEntry): AuctionLot | undefined {
  return demoState.value.activeAuctionLots.find((l) => l.id === entry.lot.id)
}

// The player's own number over the current lot: equals the room read before any
// test, converging on the truth as causes fall away. Rides the real estimator.
function estimateFor(lot: AuctionLot): number {
  const model = game.context.modelsById[lot.modelId]
  if (!model) return 0
  return Math.round(playerEstimateYen(lot.car, model, demoState.value, game.context))
}

// Both lobby lots as production cards over their CURRENT lot, with the estimate
// each test moves. The room read is the fixed lobby roll the card prints; the
// estimate parts from it the moment a test narrows the doubt (green up, red
// down), and the checklist rides in the card's right block beside it.
const lobbyCards = computed(() =>
  lobby.flatMap((entry) => {
    const lot = currentLotFor(entry)
    const model = lot ? game.context.modelsById[lot.modelId] : undefined
    if (!lot || !model) return []
    const estimate = estimateFor(lot)
    return [
      {
        entry,
        view: cardViewFor(lot, model, demoState.value, entry.roomReadYen, entry.key),
        estimate,
        moved: estimate !== entry.roomReadYen,
        up: estimate > entry.roomReadYen,
      },
    ]
  }),
)

// Why a specific test button is disabled right now, `null` when it isn't: the
// shared visit's proactive "why not" for one test.
function testDisabledReason(test: { minutes: number; alreadyRun: boolean }): string | null {
  const visit = demoState.value.inspectionVisit
  if (!visit) return 'Inspect the yard to run a test'
  if (visit.minutesLeft < test.minutes)
    return `Needs ${test.minutes}m, only ${visit.minutesLeft}m left`
  if (test.alreadyRun) return 'Already run'
  return null
}

// The real paid yard visit over the shared demo state: spends the fee, the
// labour, and grants the shared minutes both lots draw from.
function onInspect(): void {
  const r = beginInspectionVisit(demoState.value, 'local-yard', game.context)
  if (r.outcome === 'started') demoState.value = r.state
}

// A run test narrows the doubt through the real function; the card's estimate
// and its trail both re-derive from the narrowed lot (the store's own
// symptomChecklistForCar), so nothing here needs to remember the result copy.
function onRunTest(payload: { lotId: string; symptomIndex: number; testId: string }): void {
  const r = runDiagnosticTest(
    demoState.value,
    payload.lotId,
    payload.symptomIndex,
    payload.testId,
    game.context,
  )
  demoState.value = r.state
}

// --- Phase transitions ---

function takeSeat(entry: DemoLobbyEntry): void {
  const lot = currentLotFor(entry)
  if (!lot) return
  const playerNumberYen = estimateFor(lot)
  const learned: DemoLearned = {
    playerNumberYen,
    verdict: verdictFor(entry.roomReadYen, playerNumberYen),
    trueValueYen: entry.trueValueYen,
    inspected: lot.car.symptoms.some((symptom) => symptom.runTestIds.length > 0),
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

// The shared visit and its narrowing persist across room visits: only leaving
// the screen (a fresh mount) forgets them, so the player can seat the other car
// or inspect further after a room.
function backToLobby(): void {
  room.value = null
  currentEntry.value = null
  currentLearned.value = null
  phase.value = 'lobby'
}

// --- Room phase ---

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
// ran a test). This always reads the cheapest raise option (one rung), so the
// marker fires from the same landing price whichever raise the player ends up
// taking.
function pastNumber(live: DemoRoom): boolean {
  return nextRungYen(live) > live.playerNumberYen
}

interface RaiseOption {
  rungs: number
  dataTest: string
  label: string
  danger: boolean
}

// The player's raise choices once the room is open past its opener: one entry
// per rung count in ROOM_TUNING.playerRaiseOptionsRungs, each labelled with
// the yen it lands on and turned to danger styling on its own landing price,
// same rule as pastNumber generalised per option.
function raiseOptionsFor(live: DemoRoom): RaiseOption[] {
  return ROOM_TUNING.playerRaiseOptionsRungs.map((rungs, i) => {
    const landingYen = live.boardYen + rungs * live.incrementYen
    return {
      rungs,
      dataTest: i === 0 ? 'bid' : `bid-jump-${rungs}`,
      label: `Raise to ${formatYen(landingYen)}`,
      danger: landingYen > live.playerNumberYen,
    }
  })
}

function outcomeText(status: DemoRoomStatus): string {
  if (status === 'won') return 'Yours.'
  if (status === 'lost') return 'Gone.'
  return 'Rolled back.'
}

// --- Dev-only: force the room's next reaction ---

interface ForceReactionOption {
  kind: DemoRoom['armedReaction'] & string
  dataTest: string
  label: string
}

// One button per armReaction kind: this whole screen is a dev demo, so the
// strip needs no gating beyond being in the room phase.
const FORCE_REACTION_OPTIONS: ForceReactionOption[] = [
  { kind: 'scare', dataTest: 'force-scare', label: 'Scare' },
  { kind: 'call', dataTest: 'force-call', label: 'Call' },
  { kind: 'goad', dataTest: 'force-goad', label: 'Goad' },
  { kind: 'tax', dataTest: 'force-tax', label: 'Snipe tax' },
  { kind: 'feud', dataTest: 'force-feud', label: 'Feud' },
]

// Arms the live room so its next natural trigger for `kind` fires
// deterministically; see armReaction in auctionRoomDemo.ts.
function forceReaction(kind: DemoRoom['armedReaction'] & string): void {
  if (!room.value) return
  armReaction(room.value, kind)
}
</script>

<template>
  <section class="room-demo">
    <RouterLink :to="{ name: 'auctions' }" class="back">&lt; Back</RouterLink>
    <p class="demo-banner" data-test="demo-banner">Dev demo: nothing here is saved.</p>

    <div v-if="phase === 'lobby'" class="lobby">
      <!-- The shared yard-visit control, once above both cards (mirrors the
           board's per-tier control): the real paid inspect button or the active
           visit clock, plus a dim demo HUD line so the fee and labour it spends
           stay visible. -->
      <div class="inspect-bar">
        <button
          v-if="!demoState.inspectionVisit"
          type="button"
          class="inspect-visit"
          data-test="inspect-here"
          :disabled="!!inspectionVisitGateReason(demoState, 'local-yard', game.context)"
          @click="onInspect"
        >
          Inspect here ({{ game.actionPoints.inspectionVisit }} labour +
          {{ formatYen(game.travelFeeYenFor('local-yard')) }})
        </button>
        <p v-else class="visit-panel" data-test="visit-panel">
          At the yard: {{ demoState.inspectionVisit.minutesLeft }}m left
        </p>
        <p class="demo-hud" data-test="demo-hud">
          Cash {{ formatYen(demoState.cashYen) }} · Labour used {{ demoState.energySpentToday }}
        </p>
      </div>

      <div
        v-for="card in lobbyCards"
        :key="card.entry.key"
        class="lobby-card"
        :data-test="'lobby-' + card.entry.key"
      >
        <div class="lot">
          <AuctionLotCard
            :d="card.view"
            :inspection-on-right="true"
            :show-deltas="false"
            :disabled-reason-for="testDisabledReason"
            @run-test="onRunTest"
          >
            <template #info>
              <p class="est-value" :data-test="'est-value-' + card.entry.key">
                Estimated market value:
                <template v-if="!card.moved">{{ formatYen(card.entry.roomReadYen) }}</template>
                <template v-else>
                  <span class="was">{{ formatYen(card.entry.roomReadYen) }}</span>
                  <span :class="card.up ? 'up' : 'down'">{{ formatYen(card.estimate) }}</span>
                </template>
              </p>
            </template>

            <template #actions>
              <button
                class="primary"
                :data-test="'take-seat-' + card.entry.key"
                @click="takeSeat(card.entry)"
              >
                Take a seat
              </button>
            </template>
          </AuctionLotCard>
        </div>
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
        <template v-if="room.leader === null">
          <button
            :class="pastNumber(room) ? 'danger' : 'primary'"
            data-test="bid"
            @click="playerBid(room, demoNowMs)"
          >
            Bid the reserve
          </button>
        </template>
        <template v-else>
          <button
            v-for="option in raiseOptionsFor(room)"
            :key="option.rungs"
            :class="option.danger ? 'danger' : 'primary'"
            :data-test="option.dataTest"
            @click="playerBid(room, demoNowMs, option.rungs)"
          >
            {{ option.label }}
          </button>
        </template>
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

      <!-- Dev-only: force-arms one of the five bidding reactions at its next
           natural trigger, for exercising each without waiting on its own
           chance draw. Dim chrome, tucked below the log and the actions. -->
      <div class="dev-force" data-test="dev-force">
        <span class="dev-force-label">dev: force next</span>
        <button
          v-for="option in FORCE_REACTION_OPTIONS"
          :key="option.kind"
          type="button"
          class="dev-force-btn"
          :class="{ active: room.armedReaction === option.kind }"
          :data-test="option.dataTest"
          @click="forceReaction(option.kind)"
        >
          {{ option.label }}
        </button>
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
.room {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  display: grid;
  gap: var(--mg-space-2);
}

/* The shared yard-visit control above both cards: the inspect button or the
   active visit panel, with the dim demo HUD line beside it. */
.inspect-bar {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
}

/* The paid inspect control: a small cyan secondary button, cosy, never
   competing with the violet seat CTA. */
.inspect-visit {
  font-size: var(--mg-fs-sm);
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
  background: var(--mg-panel);
}

.inspect-visit:disabled {
  opacity: 0.4;
  cursor: default;
}

/* The active visit's clock: a small cyan line, the same weight the live
   yard-visit banner carries. */
.visit-panel {
  margin: 0;
  padding: var(--mg-space-1) var(--mg-space-3);
  color: var(--mg-neon-cyan);
  font-size: var(--mg-fs-sm);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  width: fit-content;
}

/* A dim line making the fee and labour deduction visible: the demo-local cash
   the yard visit is paid from, and the labour it has spent. */
.demo-hud {
  margin: 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

/* The shared production card lays its two panels into this grid; the panel
   frame comes from the lobby card wrapper above, so this stays frameless. */
.lot {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--mg-space-3);
  align-items: start;
}

/* Stamps reach full ink only while the card is hovered or focused within,
   matching the auction board. */
.lot:hover :deep(.grade-stamp),
.lot:focus-within :deep(.grade-stamp) {
  filter: saturate(1) brightness(1);
}

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

/* Each lobby card's estimated market value, under its ledger. Once a test moves
   it, the original is struck dim and the new figure is drawn beside it, green up
   or red down. */
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

/* The dev force-reaction strip: quiet chrome matching the demo banner, set
   off from real play by a thin top rule. */
.dev-force {
  display: flex;
  align-items: center;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
  margin-top: var(--mg-space-2);
  padding-top: var(--mg-space-2);
  border-top: var(--mg-border);
}

.dev-force-label {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.dev-force-btn {
  font-size: var(--mg-fs-xs, 0.7rem);
  padding: 1px var(--mg-space-2);
  color: var(--mg-text-dim);
  border-color: var(--mg-panel-edge);
  background: transparent;
}

.dev-force-btn.active {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
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
