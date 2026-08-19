/**
 * Deterministic per-instance variation for the paper-look auction sheets
 * (sprint223.md): every tilt, jitter, coffee ring and stamp offset is a pure
 * function of the car/lot instance id plus a salt naming what it drives, so
 * a folder keeps its own look for life and nothing here calls `Math.random`
 * or `Date.now`.
 */

/** FNV-1a, 32-bit. Cheap, well-distributed for short strings, and stable
 * across platforms since it only ever does integer arithmetic. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** A stable hash in [0, 1) for one (id, salt) pair - the shared basis every
 * helper below scales. Different salts on the same id hash to unrelated
 * strings first, so they decorrelate rather than moving in lockstep. */
function unit(id: string, salt: string): number {
  return fnv1a(`${id}:${salt}`) / 0x100000000
}

/** A continuous value in [min, max), stable for a given (id, salt). */
export function seedRange(id: string, salt: string, min: number, max: number): number {
  return min + unit(id, salt) * (max - min)
}

/** One option from `options`, stable for a given (id, salt). */
export function seedPick<T>(id: string, salt: string, options: readonly T[]): T {
  const index = Math.floor(unit(id, salt) * options.length) % options.length
  return options[index]!
}

/** True with roughly `probability` odds, stable for a given (id, salt). */
export function seedChance(id: string, salt: string, probability: number): boolean {
  return unit(id, salt) < probability
}
