import { describe, expect, it } from 'vitest'
import { computeMarketMovers } from './marketMovers'

const label = (modelId: string): string => modelId.toUpperCase()

describe('computeMarketMovers', () => {
  it('splits movers into risers (biggest first) and fallers (biggest drop first)', () => {
    const { risers, fallers } = computeMarketMovers(
      { a: 4, b: 9, c: -2, d: -7 },
      label,
      new Set(),
      new Set(),
    )
    expect(risers.map((m) => m.modelId)).toEqual(['b', 'a'])
    expect(fallers.map((m) => m.modelId)).toEqual(['d', 'c'])
  })

  it('drops models that did not move at all', () => {
    const { risers, fallers } = computeMarketMovers({ a: 0, b: 5 }, label, new Set(), new Set())
    expect(risers.map((m) => m.modelId)).toEqual(['b'])
    expect(fallers).toEqual([])
  })

  it('caps each side to the requested count, keeping the biggest movers', () => {
    const { risers } = computeMarketMovers(
      { a: 1, b: 2, c: 3, d: 4 },
      label,
      new Set(),
      new Set(),
      2,
    )
    expect(risers.map((m) => m.modelId)).toEqual(['d', 'c'])
  })

  it('marks a model the player owns, without touching one the player neither owns nor has sold', () => {
    const { risers } = computeMarketMovers({ a: 3 }, label, new Set(['a']), new Set())
    expect(risers[0]!.involvement).toBe('owned')
  })

  it('marks a model the player has been selling, when it is not currently owned', () => {
    const { fallers } = computeMarketMovers({ a: -3 }, label, new Set(), new Set(['a']))
    expect(fallers[0]!.involvement).toBe('sold')
  })

  it('leaves involvement null for a model neither owned nor sold', () => {
    const { risers } = computeMarketMovers({ a: 3 }, label, new Set(), new Set())
    expect(risers[0]!.involvement).toBeNull()
  })

  it('resolves each row through the supplied label function', () => {
    const { risers } = computeMarketMovers({ 'honda-city': 2 }, label, new Set(), new Set())
    expect(risers[0]!.label).toBe('HONDA-CITY')
  })
})
