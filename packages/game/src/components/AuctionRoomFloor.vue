<script setup lang="ts">
import { computed } from 'vue'
import { nextRungYen, type Room, type RoomStatus } from '../screens/auctionRoom'
import { formatYen } from '../utils/formatYen'

/**
 * The live auction room's floor: the shared presentation of an open (or just
 * resolved) `Room` - the seat row, the board price, the fuse track, the room
 * log, the raise/let-go controls, and the outcome strip - reused by both the
 * dev tuning demo (`AuctionRoomDemoScreen.vue`) and the production room
 * (`AuctionRoomScreen.vue`). Purely presentational and stateless: every
 * number comes from `room`, every action goes out through `bid`/`letgo`, and
 * the caller decides what happens next (a demo can offer "run it back"; the
 * production room only ever leaves). `raiseDisabledReasonFor` is the one
 * caller-supplied gate (typically cash) - the demo's bottomless bankroll
 * never disables anything, so it defaults to never refusing. The `extra` slot
 * carries whatever accessibility or dev chrome a caller wants inside the room
 * (the demo's force-reaction strip; the production room's auto-bid controls).
 */

const FLASH_MS = 600
const FUSE_RED_MS = 1500

const props = withDefaults(
  defineProps<{
    room: Room
    nowMs: number
    /** Why the raise landing at `landingYen` cannot be taken right now (a
     * cash gate, typically) - null when nothing blocks it. */
    raiseDisabledReasonFor?: (landingYen: number) => string | null
  }>(),
  // A Function-typed prop's default is used as-is (Vue never treats it as a
  // factory to call) - this is the actual no-op default, not a factory
  // returning one.
  { raiseDisabledReasonFor: () => null },
)

const emit = defineEmits<{
  (e: 'bid', rungs: number): void
  (e: 'letgo'): void
}>()

function fuseRemainingMs(): number {
  return Math.max(0, props.room.clockEndsAtMs - props.nowMs)
}

function seatFlash(by: string): boolean {
  const lastBid = props.room.lastBid
  return lastBid !== null && lastBid.by === by && props.nowMs - lastBid.atMs < FLASH_MS
}

// The bid control turns once the next rung would exceed the player's own
// number (their estimated value from looking closely, or the room read if
// they never learned more). Always reads the cheapest raise (one rung), so
// the marker fires from the same landing price whichever raise is taken.
const pastNumber = computed(() => nextRungYen(props.room) > props.room.playerNumberYen)

// The log window: only the newest lines render, so the log's height never
// grows with the room - the fixed height in the style block below is sized
// exactly to this many lines.
const LOG_WINDOW = 5
const visibleLog = computed(() => props.room.log.slice(-LOG_WINDOW))

const openDisabledReason = computed(() => props.raiseDisabledReasonFor(props.room.reserveYen))

// True once the player already leads: raises and letting go both go inert
// rather than the row disappearing, so the row itself never moves.
const playerLeading = computed(() => props.room.leader === 'player')

interface RaiseOption {
  rungs: number
  dataTest: string
  label: string
  danger: boolean
  disabledReason: string | null
}

// The player's raise choices once the room is open past its opener: one entry
// per rung count in the room's own playerRaiseOptionsRungs, each labelled with
// the yen it lands on, turned to danger styling past the player's own number,
// and disabled with a reason where the caller's own gate refuses it.
const raiseOptions = computed<RaiseOption[]>(() =>
  props.room.config.playerRaiseOptionsRungs.map((rungs, i) => {
    const landingYen = props.room.boardYen + rungs * props.room.incrementYen
    return {
      rungs,
      dataTest: i === 0 ? 'bid' : `bid-jump-${rungs}`,
      label: `Raise to ${formatYen(landingYen)}`,
      danger: landingYen > props.room.playerNumberYen,
      disabledReason: props.raiseDisabledReasonFor(landingYen),
    }
  }),
)

function outcomeText(status: RoomStatus): string {
  if (status === 'won') return 'Yours.'
  if (status === 'lost') return 'Gone.'
  return 'Rolled back.'
}
</script>

<template>
  <div class="floor">
    <div class="seats">
      <div class="seat" data-test="seat-you" :class="{ flash: seatFlash('player') }">
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
        :class="{ flash: seatFlash(dealer.name), dropped: !dealer.active }"
      >
        <span v-if="room.leaderName === dealer.name" class="chip" data-test="leader-chip">
          {{ formatYen(room.boardYen) }}
        </span>
        <span class="figure" aria-hidden="true">
          <span class="head"></span>
          <span class="shoulders"></span>
        </span>
        <span class="seat-name">{{ dealer.name }}</span>
        <span class="out-tag" :class="{ 'out-tag-hidden': dealer.active }">out</span>
      </div>
    </div>

    <p class="board" data-test="board">{{ formatYen(room.boardYen) }}</p>
    <div class="fuse-track">
      <div
        class="fuse"
        data-test="fuse"
        :class="{ dying: fuseRemainingMs() < FUSE_RED_MS }"
        :style="{ width: (fuseRemainingMs() / room.config.clockMs) * 100 + '%' }"
      ></div>
    </div>

    <ul class="room-log" data-test="log">
      <li v-for="(line, i) in visibleLog" :key="room.log.length - visibleLog.length + i">
        {{ line }}
      </li>
    </ul>

    <div v-if="room.status === 'open'" class="room-actions">
      <template v-if="room.leader === null">
        <button
          :class="pastNumber ? 'danger' : 'primary'"
          data-test="bid"
          :disabled="!!openDisabledReason"
          :title="openDisabledReason ?? undefined"
          @click="emit('bid', 1)"
        >
          Bid the reserve
        </button>
      </template>
      <template v-else>
        <button
          v-for="option in raiseOptions"
          :key="option.rungs"
          :class="option.danger ? 'danger' : 'primary'"
          :data-test="option.dataTest"
          :disabled="!!option.disabledReason || playerLeading"
          :title="option.disabledReason ?? undefined"
          @click="emit('bid', option.rungs)"
        >
          {{ option.label }}
        </button>
      </template>
      <button data-test="letgo" :disabled="playerLeading" @click="emit('letgo')">Let it go</button>
    </div>
    <div v-if="room.status === 'open'" class="past-number-slot">
      <p v-if="room.leader !== 'player' && pastNumber" class="past-number" data-test="past-number">
        Past your number.
      </p>
    </div>

    <div v-if="room.status !== 'open'" class="outcome-strip">
      <p class="outcome" data-test="outcome">{{ outcomeText(room.status) }}</p>
      <p v-if="room.epilogue" class="epilogue" data-test="epilogue">{{ room.epilogue }}</p>
    </div>

    <slot name="extra" />
  </div>
</template>

<style scoped>
/* A display:contents wrapper keeps this a single-root component while its
   children become direct grid items of the parent's own room-panel grid -
   the same "shared frame, borrowed layout" pattern AuctionLotCard.vue uses. */
.floor {
  display: contents;
}

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

/* Always in the seat's own grid so a dealer dropping out never changes the
   seat's height (and so never shifts the rows below it); hidden with
   visibility rather than unmounted so its space stays reserved. */
.out-tag-hidden {
  visibility: hidden;
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

/* The room log: monospace, like the day report's line lists. A fixed height
   holding exactly LOG_WINDOW lines, so the log can never grow and push the
   controls below it: 5 lines * (1rem line-height + 4px li padding) + the
   list's own 1rem top+bottom padding (var(--mg-space-2) on all sides). */
.room-log {
  list-style: none;
  margin: 0;
  padding: var(--mg-space-2);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-night-deep);
  font-family: var(--mg-font-body);
  font-size: var(--mg-fs-sm);
  height: calc(6rem + 20px);
  overflow: hidden;
}

.room-log li {
  padding: 2px 0;
  line-height: 1rem;
  color: var(--mg-text-dim);
}

/* The newest line reads at full strength; older visible lines dissolve
   upward, like room chatter fading rather than a scrolling document. */
.room-log li:last-child {
  color: var(--mg-text);
}

.room-log li:nth-last-child(2) {
  opacity: 0.75;
}

.room-log li:nth-last-child(3) {
  opacity: 0.55;
}

.room-log li:nth-last-child(4) {
  opacity: 0.4;
}

.room-log li:nth-last-child(5) {
  opacity: 0.28;
}

.room-actions {
  display: flex;
  gap: var(--mg-space-2);
  flex-wrap: wrap;
}

/* Reserves the warning's own line height for the whole open room, whether or
   not the warning is currently showing, so it never shifts the rows below it
   as it comes and goes mid-bidding. */
.past-number-slot {
  min-height: 1rem;
}

/* Past the player's number: the moment chasing stops paying. */
.past-number {
  margin: 0;
  line-height: 1rem;
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

button {
  background: var(--mg-panel);
  color: var(--mg-text);
  border: var(--mg-border);
  border-radius: 4px;
  padding: var(--mg-space-2) var(--mg-space-3);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
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
