<script setup lang="ts">
/**
 * THE DRIVE MODE: an endless, seeded, procedurally generated night road.
 * Not a race: no laps, no targets, no walls. Pick a car you own, drive
 * it as far as you like, read the odometer. Off the tarmac is grass.
 *
 * The car is the INSTANCE, wear and build included, assembled by the
 * sim's `driveParamsForInstance`; the handling is the arcade register in
 * `arcadePhysics.ts` (converged through the artifact tuning loop) and
 * the world is `roadGen.ts` rendered by the pixel-art WebGL renderer.
 * Driving changes nothing about the save.
 */
import { driveParamsForInstance, lapBlockers, type DriveParams } from '@midnight-garage/sim'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DriveAudio } from './drive/audio'
import { DriftStats, MOOD_NAMES, RainMachine, SmokePool, TrafficMachine, codeToSeed, seedToCode, todNow } from './drive/driveWorld'
import { RouterLink, useRoute } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { ARCADE_CONFIG } from './drive/arcadeConfig'
import { speedTargetControl,
  ARCADE_DT_S,
  DEFAULT_TUNE,
  arcadeCarFor,
  createArcadeState,
  stepArcade,
  type ArcadeCar,
  type ArcadeState,
  type ArcadeTune,
} from './drive/arcadePhysics'
import {
  CHUNK_SAMPLES,
  generateChunk,
  locateOnRoad,
  surfaceZAt,
  waterHazardAt,
  maintainWindow,
  makeRoad,
  surfaceAtLateral,
  type Road,
  ZONE_LENGTH_M,
  ROAD_HALF_WIDTH_M,
  hash01,
} from './drive/roadGen'
import { DriveRenderer, buildChunkMesh, restStopAccents, restStopAt, type SkidMark } from './drive/webglRenderer'
import { formatLapS } from './driveSession'

const game = useGameStore()
const route = useRoute()

const phase = ref<'setup' | 'driving' | 'summary'>('setup')
const paused = ref(false)

const cars = computed(() => game.carsDetailed)
const blockedIds = computed(
  () => new Set(cars.value.filter((d) => lapBlockers(d.car, game.context).length > 0).map((d) => d.car.id)),
)
const preselect = typeof route.query.car === 'string' ? route.query.car : undefined
const selectedCarId = ref(
  preselect && cars.value.some((d) => d.car.id === preselect && !blockedIds.value.has(preselect))
    ? preselect
    : (cars.value.find((d) => !blockedIds.value.has(d.car.id))?.car.id ?? ''),
)
watch(cars, (list) => {
  if (!list.some((d) => d.car.id === selectedCarId.value)) {
    selectedCarId.value = list.find((d) => !blockedIds.value.has(d.car.id))?.car.id ?? ''
  }
})
const selected = computed(() => cars.value.find((d) => d.car.id === selectedCarId.value) ?? null)
const assistLevel = ref(DEFAULT_TUNE.assist)

const paramsInfo = computed<DriveParams | null>(() => {
  if (!selected.value) return null
  return driveParamsForInstance(selected.value.car, selected.value.model, game.context)
})

/** Live, non-reactive sim objects (mutated at 120 Hz). */
let params: DriveParams | null = null
let arcadeCar: ArcadeCar | null = null
let state: ArcadeState | null = null
let road: Road | null = null
let renderer: DriveRenderer | null = null
let tune: ArcadeTune = { ...DEFAULT_TUNE }
let hint = 0
let carRoll = 0
let camEyeZ = 0
let camLookZ = 0
let carPitch = 0
const skids: SkidMark[] = []
const MAX_SKIDS = 800

const hud = ref({ kmh: 0, gear: '1', rpmFrac: 0, odoKm: 0, gradePct: 0, sliding: false, zoneName: 'HILLS' })
const summary = ref({ km: 0, topKmh: 0, timeS: 0, driftS: 0 })
// DEBUG: step the sky through its four moods; force rain on or off.
/* Two control schemes. PC (default): W/S/A/D or arrows as direct
 * pedals and steering, Space handbrake, S at a standstill reverses;
 * the speed-target cruise is fully bypassed. Touch: the slider
 * cluster, exactly as before. */
const controlMode = ref<'pc' | 'touch'>('pc')
const camMode = ref<0 | 1 | 2>(0)
const CAM_NAMES = ['Chase', 'Hood', 'Far'] as const
function cycleCam(): void {
  camMode.value = ((camMode.value + 1) % 3) as 0 | 1 | 2
}
function onVis(): void {
  if (document.hidden && phase.value === 'driving') paused.value = true
}
const showHint = ref(true)
const routeCodeInput = ref('')
const routeCode = ref('')
let pcThr = 0
let pcBrk = 0
function toggleControls(): void {
  controlMode.value = controlMode.value === 'pc' ? 'touch' : 'pc'
  pcThr = 0
  pcBrk = 0
}
const skyLabel = ref('Night')
const rainLabel = ref('Rain off')
let moodK = 1
function cycleSky(): void {
  moodK = (moodK + 1) % 4
  todT = moodK / 4
  skyLabel.value = (['Dusk', 'Night', 'Deep', 'Dawn'] as const)[moodK]!
}
function toggleRain(): void {
  rain.force(!rain.on)
  rainLabel.value = rain.on ? 'Rain on' : 'Rain off'
}
/* Time of day: a slow loop through four moods. Rain: a random-length
 * shower every few minutes; wet fades in and out, cutting grip and
 * thickening the fog. */
let todT = 0.25
const rain = new RainMachine()
const trafficM = new TrafficMachine()
const smoke = new SmokePool()
const drift = new DriftStats()
let stepN = 0
function sampleAtStation(rd2: Road, stn: number): { x: number; y: number; z: number; h: number } {
  const sm = rd2.samples
  const first = sm[0]!
  const last = sm[sm.length - 1]!
  if (stn <= first.stationM) return { x: first.xM, y: first.yM, z: first.zM, h: first.headingRad }
  if (stn >= last.stationM) return { x: last.xM, y: last.yM, z: last.zM, h: last.headingRad }
  let lo = 0
  let hi = sm.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (sm[mid]!.stationM <= stn) lo = mid
    else hi = mid
  }
  const a = sm[lo]!
  const b2 = sm[hi]!
  const t = (stn - a.stationM) / Math.max(0.01, b2.stationM - a.stationM)
  return { x: a.xM + (b2.xM - a.xM) * t, y: a.yM + (b2.yM - a.yM) * t, z: a.zM + (b2.zM - a.zM) * t, h: a.headingRad + (b2.headingRad - a.headingRad) * t }
}
let driveTimeS = 0
let topSpeedMs = 0

function startDriving(): void {
  if (!paramsInfo.value || !renderer) return
  params = paramsInfo.value
  tune = { ...DEFAULT_TUNE, assist: assistLevel.value }
  arcadeCar = arcadeCarFor(params, tune)
  state = createArcadeState(params)
  const entered = codeToSeed(routeCodeInput.value)
  const seed = routeCodeInput.value.trim() && entered !== null ? entered : (Math.random() * 0xffffffff) >>> 0
  routeCode.value = seedToCode(seed)
  road = makeRoad(seed)
  renderer.clearChunks()
  generateChunk(road)
  renderer.addChunk(buildChunkMesh(road, 0))
  const r = road
  maintainWindow(r, 0, (start) => renderer!.addChunk(buildChunkMesh(r, start)))
  const spawn = r.samples[20]!
  state.xM = spawn.xM
  state.yM = spawn.yM
  state.headingRad = spawn.headingRad
  hint = 20
  camEyeZ = spawn.zM
  camLookZ = spawn.zM
  carPitch = 0
  skids.length = 0
  driveTimeS = 0
  topSpeedMs = 0
  drift.reset()
  trafficM.car = null
  trafficM.clock = 14 + Math.random() * 20
  smoke.list.length = 0
  rain.wet = 0
  rain.on = false
  rain.clock = 40 + Math.random() * 80
  renderer.setCar(params)
  audio.setVoice(selected.value?.car.modelId ?? '')
  paused.value = false
  phase.value = 'driving'
}

function endDrive(): void {
  if (road && state) {
    const fix = locateOnRoad(road, state.xM, state.yM, hint)
    summary.value = { km: fix.stationM / 1000, topKmh: Math.round(topSpeedMs * 3.6), timeS: driveTimeS, driftS: drift.commit() }
  }
  paused.value = false
  phase.value = 'summary'
}

const keys = new Set<string>()
const audio = new DriveAudio()
const soundOn = ref(true)
function toggleSound(): void {
  if (!audio.isEnabled() || soundOn.value === false) {
    soundOn.value = true
    audio.setEnabled(true)
    audio.init()
    return
  }
  soundOn.value = false
  audio.setEnabled(false)
}
// Touch axes: persistent throttle above the notch, sprung brake below,
// sprung centre-return steering.
const axes = { thr: 0, brk: 0, steer: 0, steerActive: false, target: 0 }
const brakeTouch = ref(false)
const pendingReset = ref(false)
const thrThumbPx = ref(0)
const thrTrackEl = ref<HTMLElement | null>(null)
const thrThumbEl = ref<HTMLElement | null>(null)
const thrFillPct = ref(0)
const strThumbPct = ref(50)
const THR_DET = 0.1
const TARGET_VMAX_MS = 62
let brkRamp = 0
let thrVal = 0
let thrPid: number | null = null
let strPid: number | null = null
function thrRender(): void {
  const f = thrVal >= 0 ? THR_DET + thrVal * (1 - THR_DET) : THR_DET + thrVal * THR_DET
  // Keep the thumb inside the track: position over track minus thumb.
  const trackH = thrTrackEl.value?.clientHeight ?? 250
  const thumbH = thrThumbEl.value?.offsetHeight ?? 34
  thrThumbPx.value = f * Math.max(1, trackH - thumbH)
  thrFillPct.value = Math.max(0, thrVal) * (1 - THR_DET) * 94
  // The slider sets a max speed; a small band below the notch is a
  // tiny reverse gear.
  axes.target = thrVal >= 0 ? thrVal * thrVal * TARGET_VMAX_MS : thrVal * 3.5
}
function thrFromY(el: HTMLElement, clientY: number): void {
  const r = el.getBoundingClientRect()
  const f = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height))
  thrVal = f >= THR_DET ? (f - THR_DET) / (1 - THR_DET) : -(THR_DET - f) / THR_DET
  // Magnetic zero: a hard stop that is easy to find by feel.
  if (Math.abs(f - THR_DET) < 0.045) thrVal = 0
  thrRender()
}
function onThrDown(e: PointerEvent): void {
  audio.init()
  thrPid = e.pointerId
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(thrPid)
  thrFromY(el.querySelector('.vtrack') as HTMLElement, e.clientY)
  e.preventDefault()
}
function onThrMove(e: PointerEvent): void {
  if (e.pointerId !== thrPid) return
  thrFromY((e.currentTarget as HTMLElement).querySelector('.vtrack') as HTMLElement, e.clientY)
}
function onThrUp(e: PointerEvent): void {
  if (e.pointerId !== thrPid) return
  thrPid = null
  // Forward target persists; reverse springs back to the zero stop.
  if (thrVal < 0) {
    const t0 = performance.now()
    const v0 = thrVal
    const anim = (n: number): void => {
      const k = Math.min(1, (n - t0) / 140)
      thrVal = v0 * (1 - k)
      thrRender()
      if (k < 1) requestAnimationFrame(anim)
    }
    requestAnimationFrame(anim)
  }
}
function strFromX(el: HTMLElement, clientX: number): void {
  const r = el.getBoundingClientRect()
  const rawS = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1))
  // Input linearity (the third leg in every gamepad-steering guide):
  // a mild expo curve softens the centre without giving up the ends.
  axes.steer = Math.sign(rawS) * Math.pow(Math.abs(rawS), 1.5)
  strThumbPct.value = 50 + axes.steer * 42
}
function onStrDown(e: PointerEvent): void {
  audio.init()
  strPid = e.pointerId
  axes.steerActive = true
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(strPid)
  strFromX(el.querySelector('.htrack') as HTMLElement, e.clientX)
  e.preventDefault()
}
function onStrMove(e: PointerEvent): void {
  if (e.pointerId !== strPid) return
  strFromX((e.currentTarget as HTMLElement).querySelector('.htrack') as HTMLElement, e.clientX)
}
function onStrUp(e: PointerEvent): void {
  if (e.pointerId !== strPid) return
  strPid = null
  axes.steerActive = false
  const t0 = performance.now()
  const v0 = axes.steer
  const anim = (n: number): void => {
    if (axes.steerActive) return
    const k = Math.min(1, (n - t0) / 130)
    axes.steer = v0 * (1 - k) * (1 - k)
    strThumbPct.value = 50 + axes.steer * 42
    if (k < 1) requestAnimationFrame(anim)
  }
  requestAnimationFrame(anim)
}
const hbrakeTouch = ref(false)
function onKeyDown(e: KeyboardEvent): void {
  showHint.value = false
  if (e.code === 'Escape' && phase.value === 'driving') {
    paused.value = !paused.value
    return
  }
  if (e.code === 'KeyC' && phase.value === 'driving' && !paused.value) {
    cycleCam()
    return
  }
  audio.init()
  keys.add(e.code)
  if (e.code === 'Space') e.preventDefault()
}
function onKeyUp(e: KeyboardEvent): void {
  keys.delete(e.code)
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
let raf = 0
let lastMs = 0
let accumulator = 0

function frame(nowMs: number): void {
  raf = requestAnimationFrame(frame)
  const dtS = Math.min(0.05, (nowMs - lastMs) / 1000 || 0)
  lastMs = nowMs
  if (phase.value !== 'driving' || paused.value || !state || !road || !arcadeCar || !params || !renderer) return
  accumulator += dtS
  const st = state
  const rd = road
  const car = arcadeCar
  const p = params
  const rend = renderer
  const kSteer =
    (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0) -
    (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0)
  // Dedicated brake ramps in fast, out faster; while held, the speed
  // target is ignored entirely.
  const brakeHeld = brakeTouch.value || keys.has('ArrowDown') || keys.has('KeyS')
  brkRamp = Math.max(0, Math.min(1, brkRamp + (brakeHeld ? dtS / 0.14 : -dtS / 0.1)))
  const cruise = speedTargetControl(axes.target, st.vLongMs)
  const braking = brkRamp > 0.02
  let input: { steer: number; throttle: number; brake: number; reverse: boolean; handbrake: boolean }
  if (controlMode.value === 'pc') {
    // Direct pedals: quick ramps read as feet, not switches.
    const gasHeld = keys.has('ArrowUp') || keys.has('KeyW')
    const stopped = st.vLongMs <= 0.3
    const wantRev = brakeHeld && stopped
    pcThr += ((gasHeld && !brakeHeld ? 1 : 0) - pcThr) * Math.min(1, dtS / 0.1)
    pcBrk += ((brakeHeld && !wantRev ? 1 : 0) - pcBrk) * Math.min(1, dtS / 0.12)
    input = {
      steer: kSteer,
      throttle: wantRev ? 1 : pcThr,
      brake: wantRev ? 0 : pcBrk,
      reverse: wantRev,
      handbrake: keys.has('Space'),
    }
  } else {
    input = {
      steer: axes.steerActive || Math.abs(axes.steer) > 0.02 ? -axes.steer : kSteer,
      throttle: braking ? 0 : Math.max(keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0, cruise.throttle),
      brake: Math.max(brkRamp, braking ? 0 : cruise.brake),
      reverse: cruise.reverse && !braking,
      handbrake: keys.has('Space') || hbrakeTouch.value,
    }
  }
  let fix = locateOnRoad(rd, st.xM, st.yM, hint)
  while (accumulator >= ARCADE_DT_S) {
    fix = locateOnRoad(rd, st.xM, st.yM, hint)
    hint = fix.index
    const surface = surfaceAtLateral(fix.lateralM, {
      grip: ARCADE_CONFIG.offRoadGrip,
      extraDragMs2: ARCADE_CONFIG.offRoadDragMs2,
    })
    const latGrade = surfaceZAt(rd, fix.stationM, fix.lateralM + 0.5) - surfaceZAt(rd, fix.stationM, fix.lateralM - 0.5)
    stepArcade(st, car, ARCADE_CONFIG, tune, input, surface.grip * (1 - 0.32 * rain.wet), surface.extraDragMs2, rd.gradeAt(fix.stationM), ARCADE_DT_S, latGrade)
    driveTimeS += ARCADE_DT_S
    topSpeedMs = Math.max(topSpeedMs, st.speedMs)
    stepN++
    todT = (todT + ARCADE_DT_S / 900) % 1
    rain.advance(ARCADE_DT_S)
    trafficM.advance(ARCADE_DT_S, fix.stationM, rd.samples[0]!.stationM, rd.samples.length > 50)
    const slidingHard = st.sliding && st.speedMs > 6
    drift.advance(ARCADE_DT_S, slidingHard)
    if (slidingHard && (stepN & 3) === 0) {
      const bx = st.xM - Math.cos(st.headingRad) * p.bM
      const by = st.yM - Math.sin(st.headingRad) * p.bM
      smoke.spawn(bx + (Math.random() - 0.5) * 0.9, by + (Math.random() - 0.5) * 0.9, surfaceZAt(rd, fix.stationM - p.bM, fix.lateralM) + 0.35)
    }
    smoke.advance(ARCADE_DT_S)
    fix = locateOnRoad(rd, st.xM, st.yM, hint)
    hint = fix.index
    // Back to the road, gently: the sea, a long tumble down a flank,
    // or the RESET button.
    const zoneFix = rd.zoneAt(fix.stationM)
    if (waterHazardAt(zoneFix, fix.lateralM) || Math.abs(fix.lateralM) > 24 || pendingReset.value) {
      pendingReset.value = false
      const sr = rd.samples[Math.max(2, Math.min(rd.samples.length - 3, fix.index))]!
      st.xM = sr.xM
      st.yM = sr.yM
      st.headingRad = sr.headingRad
      st.vLatMs = 0
      st.vLongMs = Math.min(st.vLongMs, 6)
      st.yawRadS = 0
      fix = locateOnRoad(rd, st.xM, st.yM, hint)
      hint = fix.index
    }
    const dropped = maintainWindow(rd, hint, (start) => rend.addChunk(buildChunkMesh(rd, start)))
    if (dropped > 0) {
      hint -= dropped
      for (let i = 0; i < dropped / CHUNK_SAMPLES; i++) rend.dropOldestChunk()
    }
    if (st.sliding) {
      const cs = Math.cos(st.headingRad)
      const sn = Math.sin(st.headingRad)
      const gz = rd.elevationAt(fix.stationM)
      const put = (lx: number, ly: number): void => {
        skids.push({ xM: st.xM + cs * lx - sn * ly, yM: st.yM + sn * lx + cs * ly, zM: gz })
      }
      if (st.latSatRear > 1) {
        put(-p.bM, -0.82)
        put(-p.bM, 0.82)
      }
      if (st.latSatFront > 1) {
        put(p.aM, -0.82)
        put(p.aM, 0.82)
      }
      while (skids.length > MAX_SKIDS) skids.shift()
    }
    accumulator -= ARCADE_DT_S
  }
  const zone = rd.zoneAt(fix.stationM)
  // The car rides the drawn surface: axle-sampled height gives real
  // pitch over crests and roll on the flanking banks.
  const zF = surfaceZAt(rd, fix.stationM + p.aM, fix.lateralM)
  const zR = surfaceZAt(rd, fix.stationM - p.bM, fix.lateralM)
  const zL = surfaceZAt(rd, fix.stationM, fix.lateralM + 0.78)
  const zRt = surfaceZAt(rd, fix.stationM, fix.lateralM - 0.78)
  const carGz = (zF * p.bM + zR * p.aM) / (p.aM + p.bM)
  camEyeZ += (carGz - camEyeZ) * Math.min(1, dtS / 0.1)
  camLookZ += (rd.elevationAt(fix.stationM + 17.6) - camLookZ) * Math.min(1, dtS / 0.35)
  carPitch += (Math.atan2(zF - zR, p.aM + p.bM) - carPitch) * Math.min(1, dtS / 0.15)
  carRoll += (Math.atan2(zL - zRt, 1.56) - carRoll) * Math.min(1, dtS / 0.12)
  // The living night: assemble this frame's effect payload.
  {
    const lighthouses: { x: number; y: number; z: number; phase: number }[] = []
    const c0 = Math.floor(fix.stationM / ZONE_LENGTH_M)
    for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
      const zc = rd.zoneAt(cc * ZONE_LENGTH_M + 380)
      if (!(zc.kind === 3 && zc.cliff)) continue
      const ls = sampleAtStation(rd, cc * ZONE_LENGTH_M + 140)
      const nx = -Math.sin(ls.h)
      const ny = Math.cos(ls.h)
      lighthouses.push({ x: ls.x + nx * (ROAD_HALF_WIDTH_M + 3.4) * zc.waterSide, y: ls.y + ny * (ROAD_HALF_WIDTH_M + 3.4) * zc.waterSide, z: ls.z + 9.7, phase: hash01(rd.seed ^ 0x3d1, cc * 17) * 6.28 })
    }
    const windows: { x: number; y: number; z: number; phase: number; rate: number; blue: boolean }[] = []
    const iA = Math.max(2, hint - 30)
    const iB = Math.min(rd.samples.length - 2, hint + 80)
    for (let i2 = iA; i2 < iB; i2++) {
      const gi2 = i2 + rd.samplesDropped
      if (gi2 % 6 !== 0) continue
      const p2 = rd.samples[i2]!
      const zn2 = rd.zoneAt(p2.stationM)
      if (zn2.kind !== 2) continue
      if (hash01(rd.seed, gi2 * 97) >= 0.3) continue
      const sd2 = hash01(rd.seed, gi2 * 17) > 0.5 ? 1 : -1
      const bd2 = ROAD_HALF_WIDTH_M + 9 + hash01(rd.seed, gi2 * 53) * 4.5
      const nx2 = -Math.sin(p2.headingRad)
      const ny2 = Math.cos(p2.headingRad)
      windows.push({ x: p2.xM + nx2 * bd2 * sd2, y: p2.yM + ny2 * bd2 * sd2, z: p2.zM + 1.4, phase: gi2, rate: 5 + hash01(rd.seed, gi2 * 7) * 6, blue: hash01(rd.seed, gi2 * 131) < 0.35 })
    }
    const accents = restStopAccents(rd, fix.stationM)
    let traf: NonNullable<typeof rend.fx>['traffic'] = null
    if (trafficM.car && Math.abs(trafficM.car.station - fix.stationM) < 300) {
      const ts = sampleAtStation(rd, trafficM.car.station)
      const nx3 = -Math.sin(ts.h)
      const ny3 = Math.cos(ts.h)
      const fx3 = -Math.cos(ts.h)
      const fy3 = -Math.sin(ts.h)
      traf = {
        kind: trafficM.car.kind,
        x: ts.x + nx3 * trafficM.car.lat,
        y: ts.y + ny3 * trafficM.car.lat,
        z: ts.z,
        heading: ts.h,
        hx: ts.x + nx3 * trafficM.car.lat + fx3 * (p.aM + 0.72),
        hy: ts.y + ny3 * trafficM.car.lat + fy3 * (p.aM + 0.72),
        hz: ts.z + 0.55,
        nx: nx3,
        ny: ny3,
      }
    }
    const CC = [
      { camBack: 9, camH: 4.2, camAhead: 8, camLookH: 1.1 },
      { camBack: 2.1, camH: 1.4, camAhead: 26, camLookH: 1.2 },
      { camBack: 14.5, camH: 6.6, camAhead: 10, camLookH: 1.5 },
    ][camMode.value]!
    rend.fx = { timeS: driveTimeS, wet: rain.wet, axF: st.axFilteredMs2, speed: st.speedMs, camBack: CC.camBack, camH: CC.camH, camAhead: CC.camAhead, camLookH: CC.camLookH, carX: st.xM, carY: st.yM, carH: st.headingRad, groundZ: carGz, smoke: smoke.list, lighthouses, windows, accents, traffic: traf }
  }
  rend.render(
    {
      xM: st.xM,
      yM: st.yM,
      zM: carGz,
      headingRad: st.headingRad,
      pitchRad: carPitch,
      rollRad: carRoll,
      steerRad: st.steerRad,
      sliding: st.sliding,
    },
    p,
    camEyeZ,
    camLookZ,
    skids,
    zone.fogNearM,
    todNow(todT, rain.wet),
  )
  audio.update(dtS, st.rpm, input.throttle, st.speedMs, st.sliding, rend.nearestLampM(st.xM, st.yM), zone.kind, st.vLatMs, rain.wet)
  hud.value = {
    kmh: Math.round(st.speedMs * 3.6),
    gear: st.vLongMs < -0.1 ? 'R' : String(st.gear),
    rpmFrac: Math.min(1, st.rpm / p.gearbox.redlineRpm),
    odoKm: fix.stationM / 1000,
    gradePct: Math.round(-rd.gradeAt(fix.stationM) * 100),
    sliding: st.sliding,
    zoneName: zone.name,
  }
}

function onResize(): void {
  renderer?.resize()
}
function onGestureUp(): void {
  audio.init()
}
onMounted(() => {
  thrRender()
  window.addEventListener('pointerup', onGestureUp)
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', onResize)
  if (canvasRef.value) renderer = new DriveRenderer(canvasRef.value)
  lastMs = performance.now()
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onGestureUp)
  window.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('visibilitychange', onVis)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('resize', onResize)
  cancelAnimationFrame(raf)
  audio.dispose()
})
</script>

<template>
  <section class="drive">
    <RouterLink :to="{ name: 'overworld' }" class="back" data-test="drive-back">
      Back to the city
    </RouterLink>
    <h2>Night drive</h2>

    <div v-if="phase === 'setup'" class="panel" data-test="drive-setup">
      <p v-if="cars.length === 0" class="dim">You own no cars to drive.</p>
      <template v-else>
        <label>
          Car
          <select v-model="selectedCarId" data-test="drive-car-select">
            <option
              v-for="d in cars"
              :key="d.car.id"
              :value="d.car.id"
              :disabled="blockedIds.has(d.car.id)"
            >
              {{ d.displayName }}{{ blockedIds.has(d.car.id) ? ' (cannot run)' : '' }}
            </option>
          </select>
        </label>
        <label>
          Route code (optional)
          <input v-model="routeCodeInput" data-test="drive-route-code" placeholder="MG-XXXX" spellcheck="false" />
        </label>
        <label>
          Assists {{ assistLevel.toFixed(2) }}
          <input v-model.number="assistLevel" type="range" min="0" max="1" step="0.05" />
        </label>
        <p class="dim">
          An endless seeded road through the hills. No clock, no walls; driving changes nothing
          about the car or the save.
        </p>
        <button type="button" :disabled="!paramsInfo" data-test="drive-start" @click="startDriving">
          Drive
        </button>
      </template>
    </div>

    <div v-show="phase === 'driving'" class="stage">
      <canvas ref="canvasRef" class="viewport"></canvas>
      <p class="hud" data-test="drive-hud">
        {{ hud.kmh }} km/h, gear {{ hud.gear }}, {{ hud.odoKm.toFixed(1) }} km driven,
        {{ hud.gradePct === 0 ? 'flat' : (hud.gradePct > 0 ? 'down ' : 'up ') + Math.abs(hud.gradePct) + '%' }}
        <span v-if="hud.sliding" class="warn">DRIFT</span>
        <button type="button" class="snd" data-test="drive-reset" @click="pendingReset = true">
          Reset
        </button>
        <button type="button" class="snd" data-test="drive-sound" @click="toggleSound">
          {{ soundOn ? 'Sound on' : 'Sound off' }}
        </button>
      </p>
      <div class="rpm"><i :style="{ width: Math.round(hud.rpmFrac * 100) + '%' }"></i></div>
      <p class="dim">Sliders or WASD. The gas slider stays where you set it; space or the button is the handbrake.</p>
      <div v-show="controlMode === 'touch'" class="pad">
        <div
          class="thr"
          data-test="drive-throttle"
          @pointerdown="onThrDown"
          @pointermove="onThrMove"
          @pointerup="onThrUp"
          @pointercancel="onThrUp"
        >
          <div ref="thrTrackEl" class="vtrack">
            <div class="vnotch"></div>
            <div class="vfill" :style="{ height: thrFillPct + '%' }"></div>
            <div ref="thrThumbEl" class="vthumb" :style="{ bottom: thrThumbPx + 'px' }"></div>
          </div>
          <button
            type="button"
            class="hbrake brake-btn"
            data-test="drive-brake"
            @pointerdown.stop.prevent="brakeTouch = true"
            @pointerup.stop.prevent="brakeTouch = false"
            @pointercancel.stop="brakeTouch = false"
          >
            BRAKE
          </button>
          <div class="axlbl">SPEED<br /><span>R</span></div>
        </div>
        <div class="rgt">
          <button
            type="button"
            class="hbrake"
            data-test="drive-handbrake"
            @pointerdown.prevent="hbrakeTouch = true"
            @pointerup.prevent="hbrakeTouch = false"
            @pointercancel="hbrakeTouch = false"
          >
            H-brake
          </button>
          <div
            class="str"
            data-test="drive-steer"
            @pointerdown="onStrDown"
            @pointermove="onStrMove"
            @pointerup="onStrUp"
            @pointercancel="onStrUp"
          >
            <div class="htrack">
              <div class="hnotch"></div>
              <div class="hthumb" :style="{ left: strThumbPct + '%' }"></div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="showHint && !paused" class="firstrun" data-test="drive-hint">
        <p>W accelerate &middot; S brake &middot; A/D steer</p>
        <p>Space handbrake &middot; C camera &middot; Esc pause</p>
      </div>
      <div v-if="paused" class="overlay" data-test="drive-pause">
        <p>Paused</p>
        <button type="button" @click="paused = false">Resume</button>
        <button type="button" data-test="drive-controls" @click="toggleControls">{{ controlMode === 'pc' ? 'PC' : 'Touch' }}</button>
        <button type="button" data-test="drive-sky" @click="cycleSky">{{ skyLabel }}</button>
        <button type="button" data-test="drive-rain" @click="toggleRain">{{ rainLabel }}</button>
        <button type="button" data-test="drive-cam" @click="cycleCam">Camera: {{ CAM_NAMES[camMode] }}</button>
        <p class="hint-lines">W accelerate, S brake, A/D steer, Space handbrake, C camera, Esc pause</p>
        <button type="button" data-test="drive-finish" @click="endDrive">End drive</button>
      </div>
    </div>

    <div v-if="phase === 'summary'" class="panel" data-test="drive-results">
      <h3>Drive over</h3>
      <p class="route">Route {{ routeCode }}</p>
      <p>{{ summary.km.toFixed(1) }} km in {{ formatLapS(summary.timeS) }}</p>
      <p>Top speed {{ summary.topKmh }} km/h</p>
      <p>Longest drift {{ summary.driftS.toFixed(1) }} s</p>
      <button type="button" data-test="drive-again" @click="startDriving">New road</button>
      <button type="button" @click="phase = 'setup'">Change setup</button>
    </div>
  </section>
</template>

<style scoped>
.pad {
  z-index: 10;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  pointer-events: none;
}
.thr {
  pointer-events: auto;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  touch-action: none;
}
.vtrack {
  position: relative;
  width: 58px;
  height: min(42vh, 250px);
  border-radius: 16px;
  background: rgba(20, 22, 32, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.13);
}
.vnotch {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 10%;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
}
.vfill {
  position: absolute;
  left: 5px;
  right: 5px;
  bottom: 10%;
  background: rgba(120, 220, 255, 0.28);
  border-radius: 10px;
}
.vthumb {
  position: absolute;
  left: 4px;
  right: 4px;
  height: 34px;
  border-radius: 12px;
  background: rgba(235, 240, 255, 0.9);
}
.axlbl {
  align-self: center;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(235, 240, 255, 0.5);
}
.axlbl span {
  color: rgba(255, 170, 150, 0.55);
}
.rgt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
  pointer-events: auto;
}
.str {
  touch-action: none;
}
.htrack {
  position: relative;
  height: 58px;
  width: min(46vw, 290px);
  border-radius: 16px;
  background: rgba(20, 22, 32, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.13);
}
.hnotch {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background: rgba(255, 255, 255, 0.3);
}
.hthumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 44px;
  margin-left: -22px;
  border-radius: 12px;
  background: rgba(235, 240, 255, 0.9);
}
.brake-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  align-self: flex-end;
  margin: 0 0 4px 2px;
  font-size: 12px;
}
.hbrake {
  padding: 10px 16px;
}
.zone {
  margin-left: 8px;
  opacity: 0.75;
  letter-spacing: 0.1em;
}
.snd {
  margin-left: 10px;
  font-size: 11px;
  padding: 2px 8px;
}

.drive {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

h2 {
  color: var(--mg-neon-violet);
}

.back {
  color: var(--mg-text-dim);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  max-width: 30rem;
}

.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.viewport {
  width: min(100%, 60rem);
  aspect-ratio: 16 / 10;
  border: 1px solid var(--mg-text-dim);
  image-rendering: pixelated;
}

.hud {
  font-variant-numeric: tabular-nums;
}

.rpm {
  width: 180px;
  height: 8px;
  background: #22222b;
  border-radius: 4px;
  overflow: hidden;
}

.rpm i {
  display: block;
  height: 100%;
  background: var(--mg-neon-violet);
}

.warn {
  color: #ff8a3d;
}

.dim {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.overlay {
  z-index: 40;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: center;
  justify-content: center;
  background: #0c0c11cc;
}
</style>
