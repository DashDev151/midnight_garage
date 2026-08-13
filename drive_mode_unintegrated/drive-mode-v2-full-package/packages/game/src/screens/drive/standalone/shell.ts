/* The standalone artifact shell: a thin vanilla host around the SAME
 * modules the game screen uses (roadGen, webglRenderer, arcadePhysics,
 * audio, driveWorld). Built by scripts/buildArtifact.mjs into a single
 * HTML file. There is no second implementation of anything here: this
 * file is DOM plumbing, input, and the fixed loop. */
import { ARCADE_CONFIG } from '../arcadeConfig'
import {
  ARCADE_DT_S,
  DEFAULT_TUNE,
  arcadeCarFor,
  createArcadeState,
  speedTargetControl,
  stepArcade,
  type ArcadeTune,
} from '../arcadePhysics'
import { DriveAudio } from '../audio'
import {
  DriftStats,
  MOOD_NAMES,
  RainMachine,
  SmokePool,
  TrafficMachine,
  codeToSeed,
  seedToCode,
  todNow,
} from '../driveWorld'
import {
  CHUNK_SAMPLES,
  ROAD_HALF_WIDTH_M,
  ZONE_LENGTH_M,
  hash01,
  locateOnRoad,
  maintainWindow,
  makeRoad,
  surfaceAtLateral,
  surfaceZAt,
  waterHazardAt,
  type Road,
} from '../roadGen'
import { DriveRenderer, buildChunkMesh, restStopAccents, type SkidMark } from '../webglRenderer'
import { CARS } from './cars'

const $ = (id: string): HTMLElement => document.getElementById(id)!

// ---- State ----
let road: Road | null = null
let state: ReturnType<typeof createArcadeState> | null = null
let params = CARS[1]!.params
let arcadeCar = arcadeCarFor(params, DEFAULT_TUNE)
let tune: ArcadeTune = { ...DEFAULT_TUNE }
let hint = 0
let camEyeZ = 0
let camLookZ = 0
let carPitch = 0
let carRoll = 0
let driveTimeS = 0
let topSpeedMs = 0
let stepN = 0
let todT = 0.25
let paused = false
let routeCode = 'MG-0'
let camMode = 0
let controlMode: 'pc' | 'touch' = 'pc'
let pcThr = 0
let pcBrk = 0
let pendingReset = false
const rain = new RainMachine()
const trafficM = new TrafficMachine()
const smoke = new SmokePool()
const drift = new DriftStats()
const audio = new DriveAudio()
const skids: SkidMark[] = []
let renderer: DriveRenderer | null = null
let loadedChunks = 0
let soundOn = true
let lastThrottle = 0

// ---- Input ----
const keys: Record<string, boolean> = {}
const KMAP: Record<string, string> = {
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hbrake',
}
const axes = { steer: 0, steerActive: false, target: 0 }
const touch = { hbrake: false }
let brkRamp = 0

window.addEventListener('keydown', (e) => {
  $('hintOv').classList.add('off')
  audio.init()
  if (e.code === 'Escape') {
    setPaused(!paused)
    return
  }
  if (e.code === 'KeyC' && !paused) {
    camMode = (camMode + 1) % 3
    $('pCam').textContent = 'Camera: ' + ['Chase', 'Hood', 'Far'][camMode]
    return
  }
  const k = KMAP[e.code]
  if (k) {
    keys[k] = true
    e.preventDefault()
  }
})
window.addEventListener('keyup', (e) => {
  const k = KMAP[e.code]
  if (k) keys[k] = false
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true)
})

function setPaused(v: boolean): void {
  paused = v
  $('pauseOv').classList.toggle('on', v)
}

// Touch controls: throttle slider and steering strip, as before.
function wireTouch(): void {
  const thr = $('thr')
  const fill = $('thrFill')
  const thumb = $('thrThumb')
  const setT = (clientY: number): void => {
    const r = thr.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height))
    axes.target = f * 62
    fill.style.height = f * 100 + '%'
    thumb.style.bottom = f * 100 + '%'
  }
  thr.addEventListener('touchstart', (e) => { audio.init(); setT(e.touches[0]!.clientY) }, { passive: true })
  thr.addEventListener('touchmove', (e) => setT(e.touches[0]!.clientY), { passive: true })
  const str = $('str')
  const sThumb = $('strThumb')
  const setS = (clientX: number, active: boolean): void => {
    const r = str.getBoundingClientRect()
    const f = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1))
    // Input linearity: mild expo softens the centre.
    axes.steer = Math.sign(f) * Math.pow(Math.abs(f), 1.5)
    axes.steerActive = active
    sThumb.style.left = ((f + 1) / 2) * 100 + '%'
  }
  str.addEventListener('touchstart', (e) => { audio.init(); setS(e.touches[0]!.clientX, true) }, { passive: true })
  str.addEventListener('touchmove', (e) => setS(e.touches[0]!.clientX, true), { passive: true })
  str.addEventListener('touchend', () => { axes.steerActive = false; axes.steer = 0; sThumb.style.left = '50%' })
}

function applyControlUi(): void {
  $('pad').style.display = controlMode === 'pc' ? 'none' : 'grid'
  $('ctlChip').textContent = controlMode === 'pc' ? 'PC' : 'Touch'
  $('pCtl').textContent = 'Controls: ' + (controlMode === 'pc' ? 'PC' : 'Touch')
}

// ---- Drive lifecycle ----
function startDrive(seed: number): void {
  routeCode = seedToCode(seed)
  road = makeRoad(seed)
  maintainWindow(road, 0, (start) => {
    renderer!.addChunk(buildChunkMesh(road!, start))
    loadedChunks++
  })
  hint = 0
  state = createArcadeState(params)
  const s0 = road.samples[2]!
  state.xM = s0.xM
  state.yM = s0.yM
  state.headingRad = s0.headingRad
  driveTimeS = 0
  topSpeedMs = 0
  stepN = 0
  drift.reset()
  trafficM.car = null
  smoke.list.length = 0
  rain.wet = 0
  rain.on = false
  rain.clock = 40 + Math.random() * 80
  skids.length = 0
  camEyeZ = s0.zM + 4.2
  camLookZ = s0.zM
}

function newRoad(): void {
  const entered = codeToSeed(($('routeIn') as HTMLInputElement).value)
  const seed = ($('routeIn') as HTMLInputElement).value.trim() && entered !== null ? entered : (Math.random() * 0xffffffff) >>> 0
  while (loadedChunks > 0) {
    renderer!.dropOldestChunk()
    loadedChunks--
  }
  startDrive(seed)
}

// ---- The fixed loop, same shape as the screen ----
let lastT = performance.now()
let acc = 0

function frame(now: number): void {
  requestAnimationFrame(frame)
  let dt = (now - lastT) / 1000
  lastT = now
  dt = Math.min(dt, 0.05)
  if (paused || !road || !state || !renderer) return
  acc += dt
  const rd = road
  const st = state
  const p = params
  let fix = locateOnRoad(rd, st.xM, st.yM, hint)
  hint = fix.index
  while (acc >= ARCADE_DT_S) {
    acc -= ARCADE_DT_S
    const kSteer = (keys['left'] ? 1 : 0) - (keys['right'] ? 1 : 0)
    brkRamp += (((keys['brake'] && controlMode === 'touch') ? 1 : 0) - brkRamp) * Math.min(1, ARCADE_DT_S / 0.15)
    const cruise = speedTargetControl(axes.target, st.vLongMs)
    const braking = brkRamp > 0.02
    let input: { steer: number; throttle: number; brake: number; reverse: boolean; handbrake: boolean }
    if (controlMode === 'pc') {
      const gasHeld = !!keys['gas']
      const brakeHeld = !!keys['brake']
      const stopped = st.vLongMs <= 0.3
      const wantRev = brakeHeld && stopped
      pcThr += ((gasHeld && !brakeHeld ? 1 : 0) - pcThr) * Math.min(1, ARCADE_DT_S / 0.1)
      pcBrk += ((brakeHeld && !wantRev ? 1 : 0) - pcBrk) * Math.min(1, ARCADE_DT_S / 0.12)
      input = { steer: kSteer, throttle: wantRev ? 1 : pcThr, brake: wantRev ? 0 : pcBrk, reverse: wantRev, handbrake: !!keys['hbrake'] }
      lastThrottle = input.throttle
    } else {
      input = {
        steer: axes.steerActive || Math.abs(axes.steer) > 0.02 ? -axes.steer : kSteer,
        throttle: braking ? 0 : Math.max(keys['gas'] ? 1 : 0, cruise.throttle),
        brake: Math.max(brkRamp, braking ? 0 : cruise.brake),
        reverse: cruise.reverse && !braking,
        handbrake: !!keys['hbrake'] || touch.hbrake,
      }
      lastThrottle = input.throttle
    }
    const surface = surfaceAtLateral(fix.lateralM, {
      grip: ARCADE_CONFIG.offRoadGrip,
      extraDragMs2: ARCADE_CONFIG.offRoadDragMs2,
    })
    const latGrade = surfaceZAt(rd, fix.stationM, fix.lateralM + 0.5) - surfaceZAt(rd, fix.stationM, fix.lateralM - 0.5)
    stepArcade(st, arcadeCar, ARCADE_CONFIG, tune, input, surface.grip * (1 - 0.32 * rain.wet), surface.extraDragMs2, rd.gradeAt(fix.stationM), ARCADE_DT_S, latGrade)
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
    if (st.sliding && st.speedMs > 4 && (stepN & 1) === 0 && skids.length < 900) {
      skids.push({ xM: st.xM, yM: st.yM, zM: surfaceZAt(rd, fix.stationM, fix.lateralM) + 0.02 })
    }
    const zoneFix = rd.zoneAt(fix.stationM)
    if (waterHazardAt(zoneFix, fix.lateralM) || Math.abs(fix.lateralM) > 24 || pendingReset) {
      pendingReset = false
      const back = rd.samples[Math.max(2, hint - 6)]!
      st.xM = back.xM
      st.yM = back.yM
      st.headingRad = back.headingRad
      st.vLongMs = 0
      st.vLatMs = 0
      st.yawRadS = 0
    }
  }
  const dropped = maintainWindow(rd, hint, (start) => {
    renderer!.addChunk(buildChunkMesh(rd, start))
    loadedChunks++
  })
  if (dropped > 0) {
    hint -= dropped
    for (let i = 0; i < dropped / CHUNK_SAMPLES; i++) {
      renderer.dropOldestChunk()
      loadedChunks--
    }
  }
  // Camera height follows the drawn surface.
  const zF = surfaceZAt(rd, fix.stationM + p.aM, fix.lateralM)
  const zR = surfaceZAt(rd, fix.stationM - p.bM, fix.lateralM)
  const carGz = (zF * p.bM + zR * p.aM) / (p.aM + p.bM)
  const grade = (zF - zR) / (p.aM + p.bM)
  carPitch += (Math.atan(grade) - carPitch) * Math.min(1, dt / 0.18)
  carRoll += ((surfaceZAt(rd, fix.stationM, fix.lateralM + 0.7) - surfaceZAt(rd, fix.stationM, fix.lateralM - 0.7)) / 1.4 - carRoll) * Math.min(1, dt / 0.2)
  camEyeZ += (carGz + 0 - camEyeZ) * Math.min(1, dt / 0.25)
  camLookZ += (carGz - camLookZ) * Math.min(1, dt / 0.25)
  const zone = rd.zoneAt(fix.stationM)

  // fx payload: lighthouses, windows, traffic, smoke, camera config.
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
  let traf: NonNullable<DriveRenderer['fx']>['traffic'] = null
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
  ][camMode]!
  renderer.fx = { timeS: driveTimeS, wet: rain.wet, axF: st.axFilteredMs2, speed: st.speedMs, camBack: CC.camBack, camH: CC.camH, camAhead: CC.camAhead, camLookH: CC.camLookH, carX: st.xM, carY: st.yM, carH: st.headingRad, groundZ: carGz, smoke: smoke.list, lighthouses, windows, accents, traffic: traf }
  renderer.render(
    { xM: st.xM, yM: st.yM, zM: carGz, headingRad: st.headingRad, pitchRad: carPitch, rollRad: carRoll, steerRad: st.steerRad, sliding: st.sliding },
    p,
    camEyeZ,
    camLookZ,
    skids,
    zone.fogNearM,
    todNow(todT, rain.wet),
  )
  audio.update(dt, st.rpm, lastThrottle, st.speedMs, st.sliding, renderer.nearestLampM(st.xM, st.yM), zone.kind, st.vLatMs, rain.wet)

  // HUD
  $('speed').textContent = String(Math.round(st.speedMs * 3.6))
  $('gearB').textContent = st.vLongMs < -0.1 ? 'R' : 'G' + st.gear
  const stateEl = $('state')
  stateEl.textContent = st.sliding ? 'DRIFT' : 'GRIP'
  stateEl.classList.toggle('drift', st.sliding)
  $('odo').textContent = (fix.stationM / 1000).toFixed(1)
  $('gradeB').textContent = Math.round(rd.gradeAt(fix.stationM) * 100) + '%'
  const rpmEl = $('rpm').firstElementChild as HTMLElement | null
  if (rpmEl) rpmEl.style.width = Math.min(100, (st.rpm / 8200) * 100) + '%'
}

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

// ---- Chips and overlays ----
function wireUi(): void {
  const carSel = $('carSel') as HTMLSelectElement
  carSel.innerHTML = ''
  for (const c of CARS) {
    const o = document.createElement('option')
    o.value = c.id
    o.textContent = c.name
    carSel.appendChild(o)
  }
  carSel.value = CARS[1]!.id
  carSel.addEventListener('change', () => {
    const c = CARS.find((x) => x.id === carSel.value) ?? CARS[1]!
    params = c.params
    arcadeCar = arcadeCarFor(params, tune)
    renderer!.setCar(params)
    audio.setVoice(c.id)
    newRoad()
  })
  $('roadBtn').addEventListener('click', () => { audio.init(); newRoad() })
  $('rstChip').addEventListener('click', () => {
    pendingReset = true
    $('rstChip').classList.add('flash')
    setTimeout(() => $('rstChip').classList.remove('flash'), 320)
  })
  const sndChip = $('sndChip')
  const setSndUi = (): void => {
    sndChip.textContent = soundOn ? 'Sound on' : 'Sound off'
    sndChip.style.opacity = soundOn ? '1' : '0.55'
  }
  sndChip.addEventListener('click', () => {
    soundOn = !soundOn
    if (soundOn) audio.init()
    audio.setEnabled(soundOn)
    setSndUi()
  })
  setSndUi()
  // Handbrake pad button (class-addressed in the template).
  const hb = document.querySelector('.btn.hbrake') as HTMLElement | null
  if (hb) {
    hb.addEventListener('touchstart', (e) => { e.preventDefault(); touch.hbrake = true; hb.classList.add('on') })
    hb.addEventListener('touchend', () => { touch.hbrake = false; hb.classList.remove('on') })
  }
  // Tune sheet: five sliders straight onto the five tune fields.
  $('tuneChip').addEventListener('click', () => $('sheet').classList.toggle('open'))
  $('closeBtn').addEventListener('click', () => $('sheet').classList.remove('open'))
  const bindTune = (sid: string, oid: string, field: keyof ArcadeTune, fmt: (v: number) => string): void => {
    const inp = $(sid) as HTMLInputElement
    const out = $(oid)
    inp.value = String(tune[field])
    out.textContent = fmt(tune[field])
    inp.addEventListener('input', () => {
      tune[field] = parseFloat(inp.value)
      out.textContent = fmt(tune[field])
      arcadeCar = arcadeCarFor(params, tune)
    })
  }
  bindTune('sGrip', 'oGrip', 'grip', (v) => v.toFixed(2))
  bindTune('sSlip', 'oSlip', 'slip', (v) => v.toFixed(2))
  bindTune('sHold', 'oHold', 'hold', (v) => v.toFixed(3))
  bindTune('sAsst', 'oAsst', 'assist', (v) => v.toFixed(2))
  bindTune('sPow', 'oPow', 'power', (v) => v.toFixed(2))
  $('ctlChip').addEventListener('click', () => {
    controlMode = controlMode === 'pc' ? 'touch' : 'pc'
    pcThr = 0
    pcBrk = 0
    applyControlUi()
  })
  $('pCtl').addEventListener('click', () => {
    controlMode = controlMode === 'pc' ? 'touch' : 'pc'
    applyControlUi()
  })
  let moodK = 1
  const skyTo = (k: number): void => {
    moodK = k
    todT = k / 4
    $('skyChip').textContent = MOOD_NAMES[k]!
    $('pSky').textContent = 'Sky: ' + MOOD_NAMES[k]!
  }
  $('skyChip').addEventListener('click', () => skyTo((moodK + 1) % 4))
  $('pSky').addEventListener('click', () => skyTo((moodK + 1) % 4))
  const rainTo = (): void => {
    rain.force(!rain.on)
    $('rainChip').textContent = rain.on ? 'Rain on' : 'Rain off'
    $('pRain').textContent = 'Rain: ' + (rain.on ? 'on' : 'off')
  }
  $('rainChip').addEventListener('click', rainTo)
  $('pRain').addEventListener('click', rainTo)
  $('pCam').addEventListener('click', () => {
    camMode = (camMode + 1) % 3
    $('pCam').textContent = 'Camera: ' + ['Chase', 'Hood', 'Far'][camMode]
  })
  $('pResume').addEventListener('click', () => setPaused(false))
  const showCard = (): void => {
    $('cdKm').textContent = (road ? (locateOnRoad(road, state!.xM, state!.yM, hint).stationM / 1000).toFixed(1) : '0.0') + ' km'
    const mm2 = Math.floor(driveTimeS / 60)
    const ss = Math.floor(driveTimeS % 60)
    $('cdT').textContent = mm2 + ':' + String(ss).padStart(2, '0')
    $('cdV').textContent = Math.round(topSpeedMs * 3.6) + ' km/h'
    $('cdD').textContent = drift.commit().toFixed(1) + ' s'
    $('cdCode').textContent = routeCode
    $('card').classList.add('on')
  }
  $('endChip').addEventListener('click', showCard)
  $('pEnd').addEventListener('click', () => { setPaused(false); showCard() })
  $('cdGo').addEventListener('click', () => $('card').classList.remove('on'))
  $('cdNew').addEventListener('click', () => {
    $('card').classList.remove('on')
    newRoad()
  })
}

// ---- Boot ----
const canvas = document.getElementById('c') as HTMLCanvasElement
renderer = new DriveRenderer(canvas)
renderer.setCar(params)
audio.setVoice(CARS[1]!.id)
wireTouch()
wireUi()
applyControlUi()
startDrive((Math.random() * 0xffffffff) >>> 0)
requestAnimationFrame(frame)
