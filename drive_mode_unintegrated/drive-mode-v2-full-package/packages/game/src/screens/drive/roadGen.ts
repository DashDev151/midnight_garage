/**
 * THE ENDLESS ROAD. Seeded value noise drives curvature and elevation;
 * position integrates from them, so the whole world is a deterministic
 * function of one 32-bit seed. Geometry exists as a sliding window of
 * samples every SAMPLE_SPACING_M metres: chunks are generated ahead of
 * the car and dropped behind it, and the absolute station only ever
 * increases (the odometer is the station).
 *
 * RULE (learnt the hard way): samples are for building meshes and for
 * `locateOnRoad` only. Continuous quantities, the height under the car,
 * the grade in the physics, come from `elevationAt`/`gradeAt`, never
 * from a nearest sample, or the car staircases over 2 m steps.
 */

export const SAMPLE_SPACING_M = 2
export const CHUNK_SAMPLES = 100
export const CHUNKS_AHEAD = 5
export const CHUNKS_BEHIND = 2
export const ROAD_HALF_WIDTH_M = 5.0

export interface RoadSample {
  xM: number
  yM: number
  headingRad: number
  curvature: number
  stationM: number
  zM: number
  gradePerM: number
}

export interface Road {
  seed: number
  samples: RoadSample[]
  /** Chunks generated so far; samples.length grows by CHUNK_SAMPLES each. */
  chunksGenerated: number
  /** Samples dropped off the front so far (window offset). */
  samplesDropped: number
  elevationAt(stationM: number): number
  gradeAt(stationM: number): number
  curvatureAt(stationM: number): number
  /** True inside a sodium-lit stretch (about half the road, in zones). */
  litAt(stationM: number): boolean
  /** The zone character at a station: drives road, scenery and sound. */
  zoneAt(stationM: number): Zone
  /** Distant ridge silhouette height for layer k (0 near, 1 far). */
  ridgeAt(stationM: number, k: number): number
  /** Signed cross-slope of the flanking terrain, -1..1. */
  tiltAt(stationM: number): number
}

export interface Zone {
  kind: number
  name: string
  /** 1 forces lamps on, -1 forces off, 0 uses litAt. */
  lampMode: number
  wanderMult: number
  fogNearM: number
  treeMult: number
  /** Which side the sea sits on in a coast zone. */
  waterSide: number
  /** Coast cells split between beach shores and sheer cliff drops. */
  cliff: boolean
}

/** Deterministic 0..1 hash shared by generation and scenery. */
export function hash01(seed: number, i: number): number {
  let a = seed ^ Math.imul(i, 40503)
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const ZONE_LENGTH_M = 760

/** The height of the drawn world at any station and lateral offset:
 * the jitter-free mean of the mesh cross-section. The car and camera
 * ride THIS, so the terrain is real, not painted. Ramp distances are
 * FLANK distances (lateral minus the half width), matching the mesh. */
export function surfaceZAt(road: Road, stationM: number, lateralM: number): number {
  const z = road.elevationAt(stationM)
  const a = Math.abs(lateralM)
  if (a <= ROAD_HALF_WIDTH_M + 0.5) return z
  const zn = road.zoneAt(stationM)
  const sd = lateralM > 0 ? 1 : -1
  if (zn.kind === 3 && sd === zn.waterSide) {
    if (zn.cliff) return a <= ROAD_HALF_WIDTH_M + 2 ? z - 0.04 : z - 22
    if (a <= ROAD_HALF_WIDTH_M + 7) return z - 0.02 - ((a - ROAD_HALF_WIDTH_M - 0.5) / 6.5) * 1.28
    if (a <= ROAD_HALF_WIDTH_M + 10) return z - 1.3 - ((a - ROAD_HALF_WIDTH_M - 7) / 3) * 4.2
    return z - 5.5
  }
  const t = road.tiltAt(stationM) * sd
  const fk = a - ROAD_HALF_WIDTH_M
  const ramp = fk <= 11 ? 0 : fk <= 40 ? (fk - 11) * 1.05 : 30.45 + (fk - 40) * 0.65
  if (a <= ROAD_HALF_WIDTH_M + 10) {
    const k = (a - ROAD_HALF_WIDTH_M - 0.5) / 9.5
    return z - 0.02 - k * 0.38 + t * ramp
  }
  if (a <= ROAD_HALF_WIDTH_M + 40) {
    const k = (a - ROAD_HALF_WIDTH_M - 10) / 30
    return z - 0.4 + k * -2.7 + t * ramp
  }
  const vdrop = zn.kind === 4 ? -26 : -9
  const k = Math.min(1, (a - ROAD_HALF_WIDTH_M - 40) / 52)
  return z - 3.1 + k * (vdrop + 3.1) + t * ramp
}

/** True when a lateral offset in a coast zone is out over the water:
 * past the cliff lip, or past the beach and bank on a shore cell. */
export function waterHazardAt(zone: Zone, lateralM: number): boolean {
  if (zone.kind !== 3) return false
  return lateralM * zone.waterSide > ROAD_HALF_WIDTH_M + (zone.cliff ? 2.0 : 8.5)
}

const ZONE_TABLE = [
  { name: 'HILLS', kind: 0, wanderMult: 1.45, lampMode: 0, treeMult: 1.0, fogNearM: 140 },
  { name: 'FOREST', kind: 1, wanderMult: 1.25, lampMode: -1, treeMult: 3.0, fogNearM: 100 },
  { name: 'VILLAGE', kind: 2, wanderMult: 0.6, lampMode: 1, treeMult: 0.3, fogNearM: 155 },
  { name: 'COAST', kind: 3, wanderMult: 0.45, lampMode: -1, treeMult: 0.15, fogNearM: 175 },
  { name: 'SUMMIT', kind: 4, wanderMult: 1.9, lampMode: -1, treeMult: 0.0, fogNearM: 120 },
] as const

/** Deterministic 32-bit PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smoothstep-interpolated 1D value noise on an integer lattice. */
export function makeValueNoise(seed: number): (t: number) => number {
  const cache = new Map<number, number>()
  const lattice = (i: number): number => {
    let v = cache.get(i)
    if (v === undefined) {
      v = mulberry32(seed ^ Math.imul(i, 2654435761))()
      cache.set(i, v)
    }
    return v
  }
  return (t) => {
    const i = Math.floor(t)
    const f = t - i
    const u = f * f * (3 - 2 * f)
    return lattice(i) * (1 - u) + lattice(i + 1) * u
  }
}

interface GenState {
  s: number
  x: number
  y: number
  h: number
  dl: number
}

const genStates = new WeakMap<Road, GenState>()
const lateralFns = new WeakMap<Road, (u: number, m: number) => number>()
const charFns = new WeakMap<Road, (u: number) => number>()

function lateralOf(road: Road): (u: number, m: number) => number {
  const fn = lateralFns.get(road)
  if (!fn) throw new Error('road has no lateral function')
  return fn
}

function charOf(road: Road): (u: number) => number {
  const fn = charFns.get(road)
  if (!fn) throw new Error('road has no character function')
  return fn
}

export function makeRoad(seed: number): Road {
  const n1 = makeValueNoise(seed)
  const n2 = makeValueNoise(seed ^ 0x9e37)
  const n3 = makeValueNoise(seed ^ 0x51ab)
  const n4 = makeValueNoise(seed ^ 0x2f6d)
  const n5 = makeValueNoise(seed ^ 0x77c1)
  // The centreline is FORWARD PROGRESS along +x with bounded lateral
  // wander, never an integrated heading. A heading random walk recrosses
  // itself in plan (measured: within 1 m in most seeds), which puts two
  // stretches of road plus their terrain in the same place: the
  // map-on-top-of-the-map bug. With x monotonic and |dy/dx| bounded
  // below 1, stretches far apart in station stay far apart in plan
  // (measured floor: 146 m over 16 seeds x 5 km), so overlap is
  // impossible by construction.
  const n6 = makeValueNoise(seed ^ 0x3b19)
  const characterAt = (u: number): number => {
    const c = 0.5 + (n6(u / 820) - 0.5) * 1.7
    return Math.max(0, Math.min(1, c))
  }
  // ZONES: each ~760 m cell has a character that drives road shape,
  // lighting, scenery, fog and the sound mix together.
  const zid = (c: number): number => {
    const h = hash01(seed ^ 0x5e11, c * 97)
    return h < 0.3 ? 0 : h < 0.52 ? 1 : h < 0.68 ? 2 : h < 0.84 ? 3 : 4
  }
  const zoneAt = (s: number): Zone => {
    const c = Math.floor(s / ZONE_LENGTH_M)
    const f = (s - c * ZONE_LENGTH_M) / ZONE_LENGTH_M
    const cur = ZONE_TABLE[zid(c)]!
    let oth = cur
    let t = 0
    if (f < 0.1) {
      oth = ZONE_TABLE[zid(c - 1)]!
      t = (1 - f / 0.1) * 0.5
    } else if (f > 0.9) {
      oth = ZONE_TABLE[zid(c + 1)]!
      t = ((f - 0.9) / 0.1) * 0.5
    }
    const mix = (x: number, y: number): number => x + (y - x) * t
    return {
      kind: cur.kind,
      name: cur.name,
      lampMode: cur.lampMode,
      wanderMult: mix(cur.wanderMult, oth.wanderMult),
      fogNearM: mix(cur.fogNearM, oth.fogNearM),
      treeMult: mix(cur.treeMult, oth.treeMult),
      waterSide: hash01(seed ^ 0x77aa, c) > 0.5 ? 1 : -1,
      cliff: cur.kind === 3 && hash01(seed ^ 0x2fe1, c * 57) < 0.45,
    }
  }
  const n7 = makeValueNoise(seed ^ 0x51ab)
  const lateralSlopeAt = (u: number, m: number): number => {
    const d1 = (n1((u + 0.5) / 330) - n1((u - 0.5) / 330)) * 2 * 112 * m
    const dS = (n7((u + 0.5) / 175) - n7((u - 0.5) / 175)) * 2 * 58 * m
    const d2 = (n2((u + 0.5) / 80) - n2((u - 0.5) / 80)) * 2 * (4 + 15 * m)
    // Soft saturation keeps the monotone no-overlap guarantee
    // (|dy/dx| < 1.05, so stations 150 m apart stay >= 103 m in plan).
    return 1.05 * Math.tanh((d1 + dS + d2) / 1.05)
  }
  const curvatureAt = (s: number): number =>
    (Math.atan(lateralSlopeAt(s + 1, 1)) - Math.atan(lateralSlopeAt(s - 1, 1))) / 2
  const n8 = makeValueNoise(seed ^ 0x19d3)
  const n9 = makeValueNoise(seed ^ 0x2e77)
  // Per-cell elevation lift: summits sit tens of metres above coasts,
  // so approaching one is a sustained climb. Cosine blend keeps the
  // grade smooth everywhere (max lift slope ~8%). A long mountain
  // swell (~1.4 km) runs underneath for sustained climbs and descents.
  const LIFT: readonly (readonly [number, number])[] = [
    [8, 8],
    [6, 6],
    [4, 4],
    [-7, -3],
    [20, 12],
  ]
  const liftOf = (c: number): number => {
    const L = LIFT[zid(c)]!
    return L[0] + hash01(seed ^ 0x66d2, c * 131) * L[1]
  }
  const elevationAt = (s: number): number => {
    const c = Math.floor(s / ZONE_LENGTH_M)
    const f = (s - c * ZONE_LENGTH_M) / ZONE_LENGTH_M
    const t = (1 - Math.cos(Math.PI * f)) / 2
    const lift = liftOf(c) + (liftOf(c + 1) - liftOf(c)) * t
    return (
      (n9(s / 1400) - 0.5) * 2 * 34 +
      (n3(s / 430) - 0.5) * 2 * 13 +
      (n4(s / 150) - 0.5) * 2 * 4.5 +
      (n8(s / 70) - 0.5) * 2 * 1.5 +
      lift
    )
  }
  // Distant ridge silhouettes, layered; phase-offset reuse of the
  // terrain noises keeps them smooth and seed-stable.
  const ridgeAt = (s: number, k: number): number =>
    k === 0 ? 10 + n3(s / 210 + 7) * 38 : 18 + n4(s / 300 + 13) * 55
  // Cross-slope: each cell tilts the flanking terrain so one side
  // climbs steeply from the road and the other falls away, like a
  // road cut into a hillside. Signed, cosine-blended; coasts always
  // put the hill on the land side; villages stay nearly flat.
  const TILT_BY_ZONE: readonly number[] = [0.9, 0.7, 0.12, 0.6, 1.0]
  const tiltCell = (c: number): number => {
    const zc = zid(c)
    const mag = TILT_BY_ZONE[zc]! * (0.35 + 0.65 * hash01(seed ^ 0x5aa3, c * 29))
    let sign = hash01(seed ^ 0x1b57, c * 61) >= 0.5 ? 1 : -1
    if (zc === 3) sign = -(hash01(seed ^ 0x77aa, c) > 0.5 ? 1 : -1)
    return mag * sign
  }
  // Holds the cell's own tilt across its middle half, with smooth
  // 25 % ramps at each end, so a village really is flat at its heart
  // and a coast cell really is uphill on the land side.
  const tiltAt = (s: number): number => {
    const c = Math.floor(s / ZONE_LENGTH_M)
    const f = (s - c * ZONE_LENGTH_M) / ZONE_LENGTH_M
    if (f < 0.25) {
      const t = 0.5 + ((1 - Math.cos(Math.PI * (f / 0.25))) / 2) * 0.5
      return tiltCell(c - 1) + (tiltCell(c) - tiltCell(c - 1)) * t
    }
    if (f > 0.75) {
      const t = ((1 - Math.cos(Math.PI * ((f - 0.75) / 0.25))) / 2) * 0.5
      return tiltCell(c) + (tiltCell(c + 1) - tiltCell(c)) * t
    }
    return tiltCell(c)
  }
  const gradeAt = (s: number): number =>
    (elevationAt(s + SAMPLE_SPACING_M) - elevationAt(s)) / SAMPLE_SPACING_M
  const road: Road = {
    seed,
    samples: [],
    chunksGenerated: 0,
    samplesDropped: 0,
    elevationAt,
    gradeAt,
    curvatureAt,
    litAt: (stationM) => n5(stationM / 240) > 0.52,
    zoneAt,
    ridgeAt,
    tiltAt,
  }
  genStates.set(road, { s: 0, x: 0, y: 0, h: 0, dl: 0 })
  lateralFns.set(road, lateralSlopeAt)
  charFns.set(road, characterAt)
  return road
}

/** Appends CHUNK_SAMPLES samples, continuing exactly from the last. */
export function generateChunk(road: Road): void {
  const g = genStates.get(road)
  if (!g) throw new Error('road has no generator state')
  for (let i = 0; i < CHUNK_SAMPLES; i++) {
    // Low-pass the slope: slew-limits curvature (radius floor) while
    // staying a convex mix of clamped values, so the guarantee holds.
    const zn = road.zoneAt(g.s)
    const chr = charOf(road)(g.x)
    const mz = Math.min(1.95, zn.wanderMult * (0.5 + Math.pow(chr, 1.5) * 1.7))
    g.dl += (lateralOf(road)(g.x, mz) - g.dl) * Math.min(1, SAMPLE_SPACING_M / 10.4)
    const dl = g.dl
    const h = Math.atan(dl)
    const z = road.elevationAt(g.s)
    road.samples.push({
      xM: g.x,
      yM: g.y,
      headingRad: h,
      curvature: (h - g.h) / SAMPLE_SPACING_M,
      stationM: g.s,
      zM: z,
      gradePerM: road.gradeAt(g.s),
    })
    g.h = h
    const du = SAMPLE_SPACING_M / Math.hypot(1, dl)
    g.x += du
    g.y += dl * du
    g.s += SAMPLE_SPACING_M
  }
  road.chunksGenerated += 1
}

/** Drops the oldest chunk off the window. Callers must rebase any indices
 * they hold (the hint) by CHUNK_SAMPLES. */
export function dropChunk(road: Road): void {
  road.samples.splice(0, CHUNK_SAMPLES)
  road.samplesDropped += CHUNK_SAMPLES
}

export interface RoadFix {
  stationM: number
  lateralM: number
  index: number
}

/** Nearest-sample fix with a local search around the hint, falling back
 * to a full-window scan when the hint is stale. */
export function locateOnRoad(road: Road, xM: number, yM: number, hint: number): RoadFix {
  const s = road.samples
  const n = s.length
  const search = (a: number, b: number): number => {
    let best = Math.max(0, a)
    let bd = Infinity
    for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) {
      const p = s[i]!
      const dx = xM - p.xM
      const dy = yM - p.yM
      const d = dx * dx + dy * dy
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return best
  }
  let i = search(hint - 40, hint + 40)
  if (i <= Math.max(0, hint - 40) + 1 || i >= Math.min(n - 1, hint + 40) - 1) i = search(0, n - 1)
  const p = s[i]!
  const c = Math.cos(p.headingRad)
  const sn = Math.sin(p.headingRad)
  const dx = xM - p.xM
  const dy = yM - p.yM
  return { stationM: p.stationM + dx * c + dy * sn, lateralM: -dx * sn + dy * c, index: i }
}

export interface RoadSurface {
  grip: number
  extraDragMs2: number
}

/** On the tarmac or on the grass; there are no walls out here. */
export function surfaceAtLateral(
  lateralM: number,
  offRoad: RoadSurface,
): RoadSurface {
  return Math.abs(lateralM) <= ROAD_HALF_WIDTH_M ? { grip: 1, extraDragMs2: 0 } : offRoad
}

/** Keeps the window filled AHEAD chunks past the hint and drops the tail.
 * Returns how many samples were dropped so the caller can rebase indices. */
export function maintainWindow(road: Road, hint: number, onChunk: (startIndex: number) => void): number {
  // Both sides of the comparison must be GLOBAL: chunksGenerated is an
  // all-time total, so the need must include the dropped window offset,
  // or generation stalls once drops begin (the 2 km dead end).
  const needed = Math.floor((hint + road.samplesDropped) / CHUNK_SAMPLES) + CHUNKS_AHEAD + CHUNKS_BEHIND
  while (road.chunksGenerated < needed) {
    const startIndex = road.samples.length
    generateChunk(road)
    onChunk(Math.max(0, startIndex - 1))
  }
  let dropped = 0
  while (hint - dropped > CHUNK_SAMPLES * (CHUNKS_BEHIND + 1) && road.samples.length > CHUNK_SAMPLES * 2) {
    dropChunk(road)
    dropped += CHUNK_SAMPLES
  }
  return dropped
}
