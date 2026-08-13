<script setup lang="ts">
/**
 * THE DRIVE DEBUG SCREEN: a top-down, heading-up canvas where the drive
 * model can actually be driven. Dev-route only. Arrows or WASD steer and
 * pedal, space is the handbrake, the selects swap car and course live, and
 * the assist slider fades every helper from raw to full. Rendering is plain
 * canvas 2D reading published `DriveState` telemetry; the physics never
 * learns the renderer exists.
 */
import { COURSES } from '@midnight-garage/content'
import {
  buildTrack,
  createDriveState,
  DRIVE_DT_S,
  locateOnTrack,
  stepDrive,
  surfaceAtLateral,
  wrapPose,
  type DriveInput,
  type DriveState,
  type Track,
} from '@midnight-garage/sim'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { driveDebugCars, stockDriveParams } from './dev/driveDebugCars'

const LAP_COURSES = COURSES.filter((c) => c.kind === 'lap')
const CAR_OPTIONS = driveDebugCars()

const carId = ref(CAR_OPTIONS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')?.id ?? CAR_OPTIONS[0]!.id)
const courseId = ref(LAP_COURSES.find((c) => c.id === 'hakone')?.id ?? LAP_COURSES[0]!.id)
const assistLevel = ref(1)
const lapCount = ref(0)
const hud = ref({ kmh: 0, gear: 1, rpm: 0, frontSlip: 0, rearSlip: 0, offRoad: false })

const canvasRef = ref<HTMLCanvasElement | null>(null)

const selectedCar = computed(() => CAR_OPTIONS.find((c) => c.id === carId.value)!)
const selectedCourse = computed(() => LAP_COURSES.find((c) => c.id === courseId.value)!)

/** Live sim objects, rebuilt on car or course change. Not reactive: the
 * physics state mutates 120 times a second and Vue has no business there. */
let params = stockDriveParams(selectedCar.value.model)
let track: Track = buildTrack(selectedCourse.value, 2)
let state: DriveState = createDriveState(params)
let hintIndex = 0

function reset(): void {
  params = stockDriveParams(selectedCar.value.model)
  track = buildTrack(selectedCourse.value, 2)
  state = createDriveState(params)
  hintIndex = 0
  lapCount.value = 0
}
watch([carId, courseId], reset)

/** Held-key state; the physics' own slew turns digital edges into a ramp. */
const keys = new Set<string>()
function onKeyDown(e: KeyboardEvent): void {
  keys.add(e.code)
  if (e.code === 'Space') e.preventDefault()
}
function onKeyUp(e: KeyboardEvent): void {
  keys.delete(e.code)
}

function readInput(): DriveInput {
  const left = keys.has('ArrowLeft') || keys.has('KeyA')
  const right = keys.has('ArrowRight') || keys.has('KeyD')
  return {
    steer: (left ? 1 : 0) - (right ? 1 : 0),
    throttle: keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0,
    brake: keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0,
    handbrake: keys.has('Space'),
    assistLevel: assistLevel.value,
  }
}

let raf = 0
let lastMs = 0
let accumulator = 0

function frame(nowMs: number): void {
  const dtS = Math.min(0.1, (nowMs - lastMs) / 1000 || 0)
  lastMs = nowMs
  accumulator += dtS

  const input = readInput()
  let fix = locateOnTrack(track, state.xM, state.yM, hintIndex)
  while (accumulator >= DRIVE_DT_S) {
    fix = locateOnTrack(track, state.xM, state.yM, hintIndex)
    hintIndex = fix.index
    stepDrive(state, params, input, surfaceAtLateral(track, fix.lateralM), DRIVE_DT_S)
    accumulator -= DRIVE_DT_S
  }

  // Endless laps: crossing into the generated second lap teleports the pose
  // back one lap by the rigid transform; the manoeuvre in progress carries.
  if (fix.stationM >= track.lapLengthM) {
    wrapPose(track, state)
    hintIndex = Math.max(0, hintIndex - Math.round(track.lapLengthM / track.sampleSpacingM))
    lapCount.value += 1
  }

  hud.value = {
    kmh: Math.round(state.speedMs * 3.6),
    gear: state.gear,
    rpm: Math.round(state.rpm / 100) * 100,
    frontSlip: Math.round(state.frontSlip * 100) / 100,
    rearSlip: Math.round(state.rearSlip * 100) / 100,
    offRoad: Math.abs(fix.lateralM) > track.halfWidthM,
  }
  draw(fix.index)
  raf = requestAnimationFrame(frame)
}

function draw(centreIndex: number): void {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#101014'
  ctx.fillRect(0, 0, w, h)

  // World-to-screen: metres to pixels, y flipped, car heading pointing up.
  const scale = 3.2
  ctx.translate(w / 2, h * 0.62)
  ctx.scale(scale, -scale)
  ctx.rotate(Math.PI / 2 - state.headingRad)
  ctx.translate(-state.xM, -state.yM)

  const samples = track.samples
  const from = Math.max(0, centreIndex - 90)
  const to = Math.min(samples.length - 1, centreIndex + 90)
  const half = track.halfWidthM

  // Road surface as a ribbon, then edge lines.
  ctx.beginPath()
  for (let i = from; i <= to; i++) {
    const s = samples[i]!
    const nx = -Math.sin(s.headingRad) * half
    const ny = Math.cos(s.headingRad) * half
    if (i === from) ctx.moveTo(s.xM + nx, s.yM + ny)
    else ctx.lineTo(s.xM + nx, s.yM + ny)
  }
  for (let i = to; i >= from; i--) {
    const s = samples[i]!
    const nx = Math.sin(s.headingRad) * half
    const ny = -Math.cos(s.headingRad) * half
    ctx.lineTo(s.xM + nx, s.yM + ny)
  }
  ctx.closePath()
  ctx.fillStyle = '#26262e'
  ctx.fill()

  ctx.lineWidth = 0.35
  for (const side of [-1, 1]) {
    ctx.beginPath()
    for (let i = from; i <= to; i++) {
      const s = samples[i]!
      const nx = -Math.sin(s.headingRad) * half * side
      const ny = Math.cos(s.headingRad) * half * side
      if (i === from) ctx.moveTo(s.xM + nx, s.yM + ny)
      else ctx.lineTo(s.xM + nx, s.yM + ny)
    }
    ctx.strokeStyle = '#9a9aa8'
    ctx.stroke()
  }

  // Centreline dashes.
  ctx.beginPath()
  for (let i = from; i <= to; i++) {
    const s = samples[i]!
    if (i === from) ctx.moveTo(s.xM, s.yM)
    else ctx.lineTo(s.xM, s.yM)
  }
  ctx.setLineDash([1.4, 2.2])
  ctx.strokeStyle = '#5a5a68'
  ctx.lineWidth = 0.2
  ctx.stroke()
  ctx.setLineDash([])

  // The car: a body-frame rectangle with a nose marker.
  ctx.translate(state.xM, state.yM)
  ctx.rotate(state.headingRad)
  ctx.fillStyle = hud.value.offRoad ? '#d8944a' : '#e8e8f0'
  ctx.fillRect(-params.bM, -0.85, params.wheelbaseM + 0.8, 1.7)
  ctx.fillStyle = '#ff5470'
  ctx.fillRect(params.aM + 0.1, -0.55, 0.5, 1.1)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  lastMs = performance.now()
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <section class="drive-debug">
    <h2>Drive debug</h2>
    <div class="controls">
      <label>
        Car
        <select v-model="carId">
          <option v-for="car in CAR_OPTIONS" :key="car.id" :value="car.id">{{ car.label }}</option>
        </select>
      </label>
      <label>
        Course
        <select v-model="courseId">
          <option v-for="course in LAP_COURSES" :key="course.id" :value="course.id">
            {{ course.id }}
          </option>
        </select>
      </label>
      <label>
        Assists {{ assistLevel.toFixed(2) }}
        <input v-model.number="assistLevel" type="range" min="0" max="1" step="0.05" />
      </label>
      <button type="button" @click="reset">Reset</button>
    </div>
    <canvas ref="canvasRef" width="640" height="360" class="viewport"></canvas>
    <p class="hud">
      {{ hud.kmh }} km/h, gear {{ hud.gear }}, {{ hud.rpm }} rpm, lap {{ lapCount }},
      slip F {{ hud.frontSlip }} R {{ hud.rearSlip }}<span v-if="hud.offRoad">, OFF ROAD</span>
    </p>
    <p class="caption">
      Arrows or WASD drive, space is the handbrake. Everything physical comes from the car's own
      spec through `carBlock()`; the assist slider fades TC, ABS, the yaw damper and countersteer
      help from raw to full.
    </p>
  </section>
</template>

<style scoped>
.drive-debug {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

h2 {
  color: var(--mg-neon-violet);
}

.controls {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.viewport {
  border: 1px solid var(--mg-text-dim);
  image-rendering: pixelated;
}

.hud {
  font-variant-numeric: tabular-nums;
}

.caption {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}
</style>
