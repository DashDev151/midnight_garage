<script setup lang="ts">
import { Application, type Container } from 'pixi.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  buildGarageRoomScene,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type GarageRoomId,
  type OfficeSceneCounts,
} from '../pixi/garage/rooms'
import { bodyPaintShopOpen, machineShopOpen } from './garageCapability'
import { photoCountForReputationTier } from './officeDisplay'
import { useGameStore } from '../stores/gameStore'

/**
 * The garage interior: six rooms in the same top-down oblique projection as
 * the overworld, moved between locally (no route change per room - the
 * player is still "in the garage" the whole time) with a way back out to
 * the map from the alley.
 *
 * A room's own art comes straight from `pixi/garage/rooms.ts`
 * (`buildGarageRoomScene`), untouched: this screen only decides WHICH of
 * its nine scene ids to render (the `-open` or `-derelict` twin, for the
 * two rooms that gate on a tool) and what each room's own action leads to.
 *
 * The warehouse ships an `-open`/`-derelict` pair in the art module, but
 * the design gives it no tool gate at all (parts inventory has always been
 * day-one), so this screen only ever renders `warehouse-open` and never
 * `warehouse-derelict` - a real gap between the art and the design rather
 * than a silent workaround.
 *
 * A room action's own sub-screen (inventory, the workbench, the machine shop,
 * the phone, the books, a car in the bay) carries the launching room in its
 * own navigation (`goToRoute`/`goToCar`), so that sub-screen's back control
 * can return here on the same room rather than always landing on the alley -
 * `roomIdFromQuery` is the read side of that round trip.
 */

type SimpleRoom =
  'alley' | 'workshop-floor' | 'warehouse' | 'machine-shop' | 'body-paint' | 'office'

const ROOMS: readonly { id: SimpleRoom; label: string }[] = [
  { id: 'alley', label: 'Alley' },
  { id: 'workshop-floor', label: 'Workshop floor' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'machine-shop', label: 'Machine shop' },
  { id: 'body-paint', label: 'Body and paint' },
  { id: 'office', label: 'Office' },
]

const game = useGameStore()
const route = useRoute()
const router = useRouter()

/** The room a sub-screen's own back control asked to return to
 * (`mapBack.ts`'s `mapBackTarget`), read straight off the query - a
 * starting point only, falling back to the alley when the query is missing
 * or names no real room. */
function roomIdFromQuery(): SimpleRoom {
  const requested = route.query.room
  const wanted = typeof requested === 'string' ? requested : undefined
  const match = ROOMS.find((room) => room.id === wanted)
  return match?.id ?? 'alley'
}

const currentRoom = ref<SimpleRoom>(roomIdFromQuery())

const machineShopIsOpen = computed(() => machineShopOpen(game.gameState, game.context.economy))
const bodyPaintIsOpen = computed(() => bodyPaintShopOpen(game.gameState))

const listingCount = computed(() => game.gameState.carsForSale.length)
const photoCount = computed(() => photoCountForReputationTier(game.reputationTier))
/** Every craft operation the shop actually possesses right now - a scene's
 * own operation counts once its gate (Shop-stage standing plus tier 3 of
 * the tool line it uses) is fully met. Reads `standingView.scenes`, the
 * same derivation the Standing screen itself shows, rather than a second
 * source for the same fact. */
const unlockedOperations = computed(() =>
  game.standingView.scenes
    .map((scene) => scene.operation)
    .filter(
      (operation): operation is NonNullable<typeof operation> => operation?.gateReason === null,
    ),
)

/** The office scene's real counts, read from state already computed
 * elsewhere (directive 16: no second source for any of these three
 * numbers) rather than anything this screen derives itself. */
const officeCounts = computed<OfficeSceneCounts>(() => ({
  listings: listingCount.value,
  photos: photoCount.value,
  certificates: unlockedOperations.value.length,
}))

/** The one car a room's "work on it" action can point at without an id of
 * its own to route with (mirrors the machine shop's and the dyno's own
 * "exactly one car in a service bay" reading of the same state). */
const soloServiceBayCarId = computed<string | null>(() => {
  const ids = game.gameState.serviceBayCarIds.filter((id): id is string => id !== null)
  return ids.length === 1 ? ids[0]! : null
})

function sceneIdFor(room: SimpleRoom): GarageRoomId {
  switch (room) {
    case 'alley':
      return 'alley'
    case 'workshop-floor':
      return 'workshop-floor'
    case 'warehouse':
      return 'warehouse-open'
    case 'machine-shop':
      return machineShopIsOpen.value ? 'machine-shop-open' : 'machine-shop-derelict'
    case 'body-paint':
      return bodyPaintIsOpen.value ? 'body-paint-open' : 'body-paint-derelict'
    case 'office':
      return 'office'
  }
}

const host = ref<HTMLDivElement | null>(null)
let app: Application | null = null
let scene: Container | null = null

function redraw(): void {
  if (!app) return
  scene?.destroy({ children: true, texture: true })
  scene = buildGarageRoomScene(sceneIdFor(currentRoom.value), officeCounts.value)
  app.stage.addChild(scene)
}

onMounted(async () => {
  app = new Application()
  await app.init({
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    background: 0x1c1d20,
    antialias: false,
  })
  host.value?.appendChild(app.canvas)
  redraw()
})

watch([currentRoom, machineShopIsOpen, bodyPaintIsOpen, officeCounts], redraw)

onUnmounted(() => {
  app?.destroy(true, { children: true, texture: true })
  app = null
  scene = null
})

/** The bays screen has no back control of its own to mark (it is the tab
 * bar's home already), so only the room sub-screens carry the room a
 * back-of-theirs should return to (`mapBack.ts`'s `mapBackTarget`). */
function goToRoute(
  name: 'garage' | 'inventory' | 'workshop-floor' | 'machine-shop' | 'jobs' | 'costs',
): void {
  if (name === 'garage') {
    void router.push({ name })
    return
  }
  void router.push({ name, query: { from: currentRoom.value } })
}

function goToCar(id: string): void {
  void router.push({ name: 'car', params: { id }, query: { from: currentRoom.value } })
}
</script>

<template>
  <section class="garage-interior">
    <RouterLink :to="{ name: 'overworld' }" class="back" data-test="interior-back">
      &lt; Back to the street
    </RouterLink>

    <nav class="room-tabs" data-test="room-tabs">
      <button
        v-for="room in ROOMS"
        :key="room.id"
        type="button"
        class="room-tab"
        :class="{ active: room.id === currentRoom }"
        :data-test="`room-tab-${room.id}`"
        @click="currentRoom = room.id"
      >
        {{ room.label }}
        <span
          v-if="room.id === 'machine-shop' && !machineShopIsOpen"
          class="derelict-flag"
          data-test="room-tab-machine-shop-derelict-flag"
        >
          derelict
        </span>
        <span
          v-if="room.id === 'body-paint' && !bodyPaintIsOpen"
          class="derelict-flag"
          data-test="room-tab-body-paint-derelict-flag"
        >
          derelict
        </span>
      </button>
    </nav>

    <div ref="host" class="stage" data-test="garage-interior-stage"></div>

    <section class="room-panel" data-test="room-panel">
      <template v-if="currentRoom === 'alley'">
        <button type="button" data-test="alley-yard" @click="goToRoute('garage')">
          Open the yard
        </button>
      </template>

      <template v-else-if="currentRoom === 'workshop-floor'">
        <button type="button" data-test="workshop-floor-enter" @click="goToRoute('workshop-floor')">
          Open the workbench
        </button>
        <button
          v-if="soloServiceBayCarId"
          type="button"
          data-test="workshop-car"
          @click="goToCar(soloServiceBayCarId)"
        >
          Open the car in the bay
        </button>
        <p v-else class="hint">Bring a car into a service bay to open it directly from here.</p>
      </template>

      <template v-else-if="currentRoom === 'warehouse'">
        <button type="button" data-test="warehouse-inventory" @click="goToRoute('inventory')">
          Open the parts inventory
        </button>
      </template>

      <template v-else-if="currentRoom === 'machine-shop'">
        <button
          v-if="machineShopIsOpen"
          type="button"
          data-test="machine-shop-enter"
          @click="goToRoute('machine-shop')"
        >
          Open the machine shop
        </button>
        <p v-else class="refusal" data-test="machine-shop-refusal">
          Somebody's old lathe under thirty years of dust. Not going near it without the
          machine-shop tooling.
        </p>
      </template>

      <template v-else-if="currentRoom === 'body-paint'">
        <template v-if="bodyPaintIsOpen">
          <button
            v-if="soloServiceBayCarId"
            type="button"
            data-test="body-paint-enter"
            @click="goToCar(soloServiceBayCarId)"
          >
            Work the body and paint
          </button>
          <p v-else class="hint">Bring a car into a service bay first.</p>
        </template>
        <p v-else class="refusal" data-test="body-paint-refusal">
          A dead spray booth and someone else's panels. Needs the body line before any of it is
          yours to use.
        </p>
      </template>

      <template v-else-if="currentRoom === 'office'">
        <div class="office-actions">
          <button type="button" data-test="office-phone" @click="goToRoute('jobs')">
            Answer the phone
          </button>
          <button type="button" data-test="office-register" @click="goToRoute('costs')">
            Open the books
          </button>
        </div>
        <dl class="office-readouts">
          <div>
            <dt>Corkboard</dt>
            <dd data-test="office-card-count">
              {{ listingCount }} car{{ listingCount === 1 ? '' : 's' }} listed
            </dd>
          </div>
          <div>
            <dt>Photo wall</dt>
            <dd data-test="office-photo-count">
              {{ photoCount }} photographs pinned up, {{ game.reputationTier }} reputation
            </dd>
          </div>
          <div>
            <dt>Certificates</dt>
            <dd data-test="office-certificate-count">
              <span v-if="unlockedOperations.length === 0">none earned yet</span>
              <span v-else>{{ unlockedOperations.map((op) => op.displayName).join(', ') }}</span>
            </dd>
          </div>
        </dl>
      </template>
    </section>
  </section>
</template>

<style scoped>
.garage-interior {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
  margin-bottom: var(--mg-space-2);
}

.room-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-1);
  margin-bottom: var(--mg-space-2);
}

.room-tab {
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-1) var(--mg-space-2);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
}

.room-tab.active {
  color: var(--mg-neon-violet);
  border-color: var(--mg-neon-violet);
}

.derelict-flag {
  color: var(--mg-danger);
  font-size: 0.6rem;
  text-transform: uppercase;
  margin-left: var(--mg-space-1);
}

.stage {
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  overflow-x: auto;
  max-width: 100%;
}

.stage :deep(canvas) {
  image-rendering: pixelated;
}

.room-panel {
  margin-top: var(--mg-space-3);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mg-space-2);
}

.office-actions {
  display: flex;
  gap: var(--mg-space-2);
}

.hint,
.refusal {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.office-readouts {
  display: grid;
  gap: var(--mg-space-1);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.office-readouts dt {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.office-readouts dd {
  margin: 0 0 var(--mg-space-1);
  color: var(--mg-text);
}
</style>
