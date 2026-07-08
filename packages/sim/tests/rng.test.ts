import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng'

describe('createRng', () => {
  it('is deterministic: the same seed yields the same sequence', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 100 }, () => a.next())
    const seqB = Array.from({ length: 100 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds yield different sequences', () => {
    const a = createRng(42)
    const b = createRng(1995)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next() stays in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int() respects inclusive bounds and hits both ends', () => {
    const rng = createRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) {
      const v = rng.int(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      seen.add(v)
    }
    expect(seen.size).toBe(6)
  })

  it('pick() throws on an empty array', () => {
    const rng = createRng(7)
    expect(() => rng.pick([])).toThrow(RangeError)
  })
})
