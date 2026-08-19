import { describe, expect, it } from 'vitest'
import { seedChance, seedPick, seedRange } from './paperSeed'

const IDS = Array.from({ length: 200 }, (_, i) => `lot-instance-${i}`)

describe('seedRange', () => {
  it('is deterministic: the same id and salt always produce the same number', () => {
    for (const id of IDS.slice(0, 20)) {
      expect(seedRange(id, 'folder', -1.2, 1.2)).toBe(seedRange(id, 'folder', -1.2, 1.2))
    }
  })

  it('stays inside [min, max) across many ids', () => {
    for (const id of IDS) {
      const value = seedRange(id, 'photo', -4, 4)
      expect(value).toBeGreaterThanOrEqual(-4)
      expect(value).toBeLessThan(4)
    }
  })

  it('different salts decorrelate: the same id does not produce the same offset for two different salts', () => {
    let identical = 0
    for (const id of IDS) {
      const folder = seedRange(id, 'folder', -1.2, 1.2)
      const photo = seedRange(id, 'photo', -1.2, 1.2)
      if (folder === photo) identical++
    }
    // A hash collision on a handful of ids is fine; every id landing on the
    // same offset for two unrelated salts would mean the salt is not doing
    // its job.
    expect(identical).toBeLessThan(IDS.length / 10)
  })

  it('spreads roughly evenly across its range rather than clustering at one end', () => {
    const values = IDS.map((id) => seedRange(id, 'tilt', 0, 1))
    const low = values.filter((v) => v < 0.5).length
    const high = values.length - low
    expect(low).toBeGreaterThan(IDS.length * 0.3)
    expect(high).toBeGreaterThan(IDS.length * 0.3)
  })
})

describe('seedPick', () => {
  const OPTIONS = ['staple', 'paperclip'] as const

  it('is deterministic for the same id and salt', () => {
    for (const id of IDS.slice(0, 20)) {
      expect(seedPick(id, 'attachment', OPTIONS)).toBe(seedPick(id, 'attachment', OPTIONS))
    }
  })

  it('always returns one of the given options', () => {
    for (const id of IDS) {
      expect(OPTIONS).toContain(seedPick(id, 'attachment', OPTIONS))
    }
  })

  it('spreads across every option over 200 generated ids', () => {
    const counts = new Map<string, number>()
    for (const id of IDS) {
      const pick = seedPick(id, 'attachment', OPTIONS)
      counts.set(pick, (counts.get(pick) ?? 0) + 1)
    }
    for (const option of OPTIONS) {
      expect(counts.get(option) ?? 0).toBeGreaterThan(0)
    }
  })

  it('spreads across a six-way pick over 200 generated ids', () => {
    const sixWay = ['a', 'b', 'c', 'd', 'e', 'f'] as const
    const counts = new Map<string, number>()
    for (const id of IDS) {
      const pick = seedPick(id, 'colour', sixWay)
      counts.set(pick, (counts.get(pick) ?? 0) + 1)
    }
    expect(counts.size).toBe(sixWay.length)
  })
})

describe('seedChance', () => {
  it('is deterministic for the same id and salt', () => {
    for (const id of IDS.slice(0, 20)) {
      expect(seedChance(id, 'coffee', 0.35)).toBe(seedChance(id, 'coffee', 0.35))
    }
  })

  it('never fires at probability 0 and always fires at probability 1', () => {
    for (const id of IDS) {
      expect(seedChance(id, 'coffee', 0)).toBe(false)
      expect(seedChance(id, 'coffee', 1)).toBe(true)
    }
  })

  it('lands roughly at the requested probability over 200 generated ids', () => {
    const hits = IDS.filter((id) => seedChance(id, 'coffee', 0.35)).length
    const rate = hits / IDS.length
    expect(rate).toBeGreaterThan(0.2)
    expect(rate).toBeLessThan(0.5)
  })
})
