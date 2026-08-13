/* The living world around the drive, shared by the game screen and
 * the standalone artifact shell: time of day, rain, oncoming
 * traffic, tyre smoke and drift statistics. Pure state machines with
 * no DOM and no GL, so both hosts can drive them and tests can pin
 * them. */

export interface Mood {
  fog: number[]
  skyT: number[]
  skyM: number[]
  skyL: number[]
  amb: number
  emi: number
  wet: number
}

export const TOD = [
  { fog: [0.215, 0.118, 0.128], amb: 0.78, emi: 0.72, skyT: [0.1, 0.06, 0.12], skyM: [0.3, 0.13, 0.22], skyL: [0.62, 0.28, 0.2] },
  { fog: [0.1, 0.095, 0.158], amb: 1, emi: 1, skyT: [0.055, 0.055, 0.105], skyM: [0.16, 0.12, 0.26], skyL: [0.36, 0.2, 0.24] },
  { fog: [0.055, 0.056, 0.102], amb: 0.82, emi: 1.14, skyT: [0.03, 0.032, 0.065], skyM: [0.08, 0.075, 0.15], skyL: [0.15, 0.11, 0.19] },
  { fog: [0.145, 0.132, 0.198], amb: 0.92, emi: 0.58, skyT: [0.09, 0.1, 0.17], skyM: [0.22, 0.19, 0.3], skyL: [0.46, 0.33, 0.3] },
] as const

export const MOOD_NAMES = ['Dusk', 'Night', 'Deep', 'Dawn'] as const

/** Cosine blend through the four moods; t in [0,1). */
export function todNow(t: number, wet: number): Mood {
  const x = t * 4
  const i = Math.floor(x) % 4
  const j = (i + 1) % 4
  const k = (1 - Math.cos(Math.PI * (x - Math.floor(x)))) / 2
  const a = TOD[i]!
  const b = TOD[j]!
  const mx = (u: readonly number[], v: readonly number[]): number[] => [
    u[0]! + (v[0]! - u[0]!) * k,
    u[1]! + (v[1]! - u[1]!) * k,
    u[2]! + (v[2]! - u[2]!) * k,
  ]
  return {
    fog: mx(a.fog, b.fog),
    skyT: mx(a.skyT, b.skyT),
    skyM: mx(a.skyM, b.skyM),
    skyL: mx(a.skyL, b.skyL),
    amb: a.amb + (b.amb - a.amb) * k,
    emi: a.emi + (b.emi - a.emi) * k,
    wet,
  }
}

/** Random-length showers; wet fades over ~6 s. */
export class RainMachine {
  on = false
  wet = 0
  clock: number
  constructor(rand: () => number = Math.random) {
    this.rand = rand
    this.clock = 40 + rand() * 80
  }
  private rand: () => number
  advance(dt: number): void {
    this.clock -= dt
    if (this.clock <= 0) {
      this.on = !this.on
      this.clock = this.on ? 55 + this.rand() * 95 : 80 + this.rand() * 140
    }
    this.wet += ((this.on ? 1 : 0) - this.wet) * Math.min(1, dt / 6)
  }
  force(on: boolean): void {
    this.on = on
    this.clock = 99999
  }
}

/** At most one oncoming car; spawns ahead, drives the opposite lane
 * (the RIGHT half: Japan keeps left), despawns behind. */
export class TrafficMachine {
  car: { station: number; lat: number; v: number; kind: number } | null = null
  clock: number
  constructor(rand: () => number = Math.random) {
    this.rand = rand
    this.clock = 14 + rand() * 20
  }
  private rand: () => number
  advance(dt: number, playerStation: number, firstStation: number, ready: boolean): void {
    this.clock -= dt
    if (!this.car && this.clock <= 0 && ready) {
      this.car = { station: playerStation + 380, lat: -1.9, v: 13 + this.rand() * 5, kind: Math.floor(this.rand() * 3) }
    }
    if (this.car) {
      this.car.station -= this.car.v * dt
      if (this.car.station < playerStation - 70 || this.car.station < firstStation + 8) {
        this.car = null
        this.clock = 18 + this.rand() * 32
      }
    }
  }
}

export interface SmokeParticle {
  x: number
  y: number
  z: number
  age: number
}

/** Pale puffs off a held drift; capped pool, 0.85 s lives. */
export class SmokePool {
  readonly list: SmokeParticle[] = []
  spawn(x: number, y: number, z: number): void {
    if (this.list.length < 48) this.list.push({ x, y, z, age: 0 })
  }
  advance(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]!
      s.age += dt
      s.z += dt * 0.9
      if (s.age > 0.85) this.list.splice(i, 1)
    }
  }
}

/** Longest continuous slide, for the drive card. */
export class DriftStats {
  cur = 0
  longest = 0
  advance(dt: number, sliding: boolean): void {
    if (sliding) {
      this.cur += dt
    } else {
      if (this.cur > this.longest) this.longest = this.cur
      this.cur = 0
    }
  }
  commit(): number {
    if (this.cur > this.longest) this.longest = this.cur
    return this.longest
  }
  reset(): void {
    this.cur = 0
    this.longest = 0
  }
}

/** Route codes: the seed, wearing a jacket. */
export function seedToCode(seed: number): string {
  return 'MG-' + (seed >>> 0).toString(36).toUpperCase()
}

export function codeToSeed(code: string): number | null {
  const m = /^\s*(?:MG-)?([0-9A-Za-z]+)\s*$/.exec(code)
  if (!m) return null
  const v = parseInt(m[1]!, 36)
  return Number.isFinite(v) ? v >>> 0 : null
}
