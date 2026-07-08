import { describe, expect, it } from 'vitest'
import { hashState } from '../src/hashState'

describe('hashState', () => {
  it('is deterministic for the same value', () => {
    const value = { b: 2, a: 1, nested: { z: 9, y: 8 } }
    expect(hashState(value)).toBe(hashState(value))
  })

  it('is insensitive to object key order', () => {
    const a = { x: 1, y: 2 }
    const b = { y: 2, x: 1 }
    expect(hashState(a)).toBe(hashState(b))
  })

  it('differs for different data', () => {
    expect(hashState({ x: 1 })).not.toBe(hashState({ x: 2 }))
  })
})
