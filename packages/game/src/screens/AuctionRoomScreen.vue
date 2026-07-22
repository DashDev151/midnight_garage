<script setup lang="ts">
import { resolveCarDisplayName, TUTORIAL_LOT, type FusePreset } from '@midnight-garage/content'
import { playerEstimateYen, sheetGuideValueYen } from '@midnight-garage/sim'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuctionRoomFloor from '../components/AuctionRoomFloor.vue'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import {
  enterRoom,
  incrementYenFor,
  letGo,
  nextRungYen,
  playerBid,
  tick,
  type Room,
  type RoomConfig,
  type TurnoutKey,
} from './auctionRoom'
import { verdictFor } from './auctionRoomDemo'

/**
 * The production live auction room: one lot, one sitting, seated straight off
 * live game state through the shared machine (`./auctionRoom.ts`) - the same
 * machine and the same `economy.auctionRoom` config the tuning demo reads,
 * config-scaled for the fuse-length setting (and, on the scripted tutorial
 * lot, zeroed dealers) but never forked. Every yen rides the real estimator
 * (`sheetGuideValueYen`, `playerEstimateYen`); the room carries no
 * `trueValueYen` (that is demo-only omniscience), so it never shows a flip
 * epilogue, only the outcome and its own log. A hammer win settles instantly
 * through the sim's real purchase path; a hammer loss removes the lot the
 * same way. The seed is a stable function of the lot id and the current day,
 * so re-entering the same lot on the same day replays an identical room - the
 * anti-scum law, in place of any per-day seat lock.
 */

const route = useRoute()
const router = useRouter()
const game = useGameStore()

const lotId = computed(() => String(route.params.lotId))

const FUSE_MULTIPLIER: Record<FusePreset, number> = { standard: 1, relaxed: 1.6, unhurried: 2.4 }

// The room's own clock: a plain accumulator, advanced only by the interval
// below and handed to the machine on every fire - no wall-clock reads.
const TICK_INTERVAL_MS = 50
const AUTO_BID_DELAY_MS = 700
const nowMs = ref(0)
let intervalId: ReturnType<typeof setInterval> | undefined

const room = ref<Room | null>(null)
const autoBidCeilingYen = ref(0)

/** The stable per-lot, per-day seed: re-entering the same lot on the same day
 * replays an identical room. */
function roomSeed(id: string): string {
  return `auction-room:${id}:day${game.gameState.day}`
}

/**
 * The config a room is seated with: `clockMs` scaled by the chosen fuse
 * preset, and - only for the scripted tutorial lot - the entered turnout
 * band's dealer count forced to zero (a quiet morning nobody else came for).
 * The shared machine stays ignorant of either setting; it only ever reads
 * the config object it is handed.
 */
function scaledConfig(
  base: RoomConfig,
  preset: FusePreset,
  key: TurnoutKey,
  zeroDealers: boolean,
): RoomConfig {
  return {
    ...base,
    clockMs: Math.round(base.clockMs * FUSE_MULTIPLIER[preset]),
    turnout: zeroDealers
      ? { ...base.turnout, [key]: { ...base.turnout[key], dealers: 0 } }
      : base.turnout,
  }
}

/** Builds the room fresh from live game state - the entry read
 * (`sheetGuideValueYen`) and the bidder's own number (`playerEstimateYen`)
 * both over the CURRENT, possibly-narrowed lot, so re-inspecting between
 * visits changes what the player brings into the room. Null when the lot
 * isn't there to seat (a stale deep-link, or a lot already settled). */
function buildRoom(): Room | null {
  const lot = game.gameState.activeAuctionLots.find((l) => l.id === lotId.value)
  const model = lot ? game.context.modelsById[lot.modelId] : undefined
  if (!lot || !model) return null
  const isTutorialLot = lot.id === TUTORIAL_LOT.lotId
  const roomReadYen = Math.round(sheetGuideValueYen(lot.car, model, game.gameState, game.context))
  const playerNumberYen = Math.round(
    playerEstimateYen(lot.car, model, game.gameState, game.context),
  )
  const config = scaledConfig(
    game.context.economy.auctionRoom,
    game.fusePreset,
    lot.turnout,
    isTutorialLot,
  )
  autoBidCeilingYen.value = playerNumberYen
  return enterRoom(
    {
      key: lot.turnout,
      displayName: resolveCarDisplayName(model),
      roomReadYen,
      incrementYen: incrementYenFor(roomReadYen, config),
    },
    roomSeed(lot.id),
    nowMs.value,
    {
      playerNumberYen,
      verdict: verdictFor(roomReadYen, playerNumberYen),
      inspected: lot.car.symptoms.some((symptom) => symptom.runTestIds.length > 0),
    },
    config,
  )
}

/** Pure UI-side driving of the real `playerBid`: while armed, the room is
 * open, and nobody but the player themselves is ahead, places the cheapest
 * raise the instant it both fits under the ceiling and is affordable - a
 * short fixed pause after the room's own last bid (whoever placed it) so it
 * reads as a steady hand, never a glitchy snap-raise. */
function maybeAutoBid(): void {
  const live = room.value
  if (!game.autoBidEnabled || !live || live.status !== 'open' || live.leader === 'player') return
  const sinceLastBid = live.lastBid ? nowMs.value - live.lastBid.atMs : Number.POSITIVE_INFINITY
  if (sinceLastBid < AUTO_BID_DELAY_MS) return
  const rung = nextRungYen(live)
  if (rung > autoBidCeilingYen.value || rung > game.cashYen) return
  playerBid(live, nowMs.value, 1)
}

onMounted(() => {
  const built = buildRoom()
  if (!built) {
    void router.replace({ name: 'auctions' })
    return
  }
  room.value = reactive(built)
  intervalId = setInterval(() => {
    nowMs.value += TICK_INTERVAL_MS
    if (room.value) {
      tick(room.value, nowMs.value)
      maybeAutoBid()
    }
  }, TICK_INTERVAL_MS)
})

onUnmounted(() => {
  if (intervalId !== undefined) clearInterval(intervalId)
})

// Settles the real economic outcome the instant the room resolves - a
// hammer price is final the moment the fuse burns, whether or not the player
// has clicked past the outcome text yet. A no-sale needs no action: the lot
// simply stays on the board, untouched.
watch(
  () => room.value?.status,
  (status) => {
    if (!room.value || !status || status === 'open') return
    if (status === 'won') game.settleAuctionHammer(lotId.value, room.value.boardYen)
    else if (status === 'lost') game.loseAuctionLot(lotId.value)
  },
)

function onBid(rungs: number): void {
  if (!room.value) return
  playerBid(room.value, nowMs.value, rungs)
}

function onLetGo(): void {
  if (!room.value) return
  letGo(room.value)
}

/** The cash gate: a raise landing above what's in the till is disabled with
 * a reason, so settlement (which refuses quietly on insufficient cash) can
 * never be asked to honour a bid the player could not actually pay. */
function raiseDisabledReasonFor(landingYen: number): string | null {
  return landingYen > game.cashYen
    ? `Not enough cash - this raise reaches ${formatYen(landingYen)}`
    : null
}

function backToAuctions(): void {
  void router.replace({ name: 'auctions' })
}
</script>

<template>
  <section v-if="room" class="auction-room">
    <RouterLink :to="{ name: 'auctions' }" class="back">&lt; Auctions</RouterLink>

    <div class="room">
      <header class="room-head">
        <h3>{{ room.displayName }}</h3>
        <p class="headline">Estimated market value: {{ formatYen(room.playerNumberYen) }}</p>
      </header>

      <AuctionRoomFloor
        :room="room"
        :now-ms="nowMs"
        :raise-disabled-reason-for="raiseDisabledReasonFor"
        @bid="onBid"
        @letgo="onLetGo"
      >
        <!-- The fuse preset and the auto-bid enable toggle both live in
             Settings now; the room only shows the
             ceiling input, and only once auto-bid is actually on. -->
        <template v-if="game.autoBidEnabled" #extra>
          <div class="autobid" data-test="autobid">
            <label class="autobid-ceiling-row">
              Auto-bid up to
              <input
                v-model.number="autoBidCeilingYen"
                type="number"
                min="0"
                step="1000"
                data-test="autobid-ceiling"
              />
            </label>
          </div>
        </template>
      </AuctionRoomFloor>

      <div v-if="room.status !== 'open'" class="room-actions">
        <button class="primary" data-test="back-to-auctions" @click="backToAuctions">
          Back to auctions
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

.room {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-top: var(--mg-space-2);
  display: grid;
  gap: var(--mg-space-2);
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

/* The auto-bid ceiling strip: quiet chrome, set off from the room log by a
   thin top rule, matching the demo's own dev-force placement. Only rendered
   at all while auto-bid is enabled in Settings. */
.autobid {
  display: flex;
  align-items: center;
  gap: var(--mg-space-3);
  flex-wrap: wrap;
  margin-top: var(--mg-space-2);
  padding-top: var(--mg-space-2);
  border-top: var(--mg-border);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.autobid-ceiling-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-1);
}

.autobid-ceiling-row input {
  width: 8em;
  background: var(--mg-night-deep);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: inherit;
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
</style>
