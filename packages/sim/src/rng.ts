export interface Rng {
  /** Next float in [0, 1). */
  next(): number
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number
  /** Uniformly picked element; throws on an empty array. */
  pick<T>(items: readonly T[]): T
}

/**
 * Deterministic seeded PRNG (mulberry32). The sim must never use
 * Math.random or wall-clock time; all randomness flows through here
 * so any day can be replayed from (state, actions, seed).
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`invalid int range [${min}, ${max}]`)
    }
    return min + Math.floor(next() * (max - min + 1))
  }

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('cannot pick from an empty array')
    const item = items[int(0, items.length - 1)]
    return item as T
  }

  return { next, int, pick }
}

/**
 * Deterministic string -> seed hash, so an id (bidder, car instance, ...)
 * can drive its own persistent seeded RNG stream without any extra state.
 */
export function hashStringToSeed(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/**
 * An approximately-normal(mean, sd) sample via the Irwin-Hall trick: the sum
 * of 12 uniform(0,1) draws has variance exactly 1, so subtracting its mean
 * (6) gives a cheap, deterministic, bell-shaped value with no external
 * dependency (no Box-Muller trig, no rejection sampling). Good enough where
 * "vaguely bell-shaped" matters more than statistical exactness — e.g.
 * rolling how many rival bidders show up to an auction lot.
 */
export function bellNormal(mean: number, sd: number, rng: Rng): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += rng.next()
  return mean + sd * (sum - 6)
}
