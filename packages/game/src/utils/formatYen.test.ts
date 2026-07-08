import { describe, expect, it } from 'vitest'
import { formatYen, formatYenDelta } from './formatYen'

describe('formatYen', () => {
  it('adds the yen sign and thousands separators, no decimals', () => {
    expect(formatYen(1_500_000)).toBe('¥1,500,000')
    expect(formatYen(0)).toBe('¥0')
    expect(formatYen(999)).toBe('¥999')
  })

  it('places a leading minus outside the yen sign', () => {
    expect(formatYen(-90_000)).toBe('-¥90,000')
  })

  it('rounds to whole yen', () => {
    expect(formatYen(1234.6)).toBe('¥1,235')
  })
})

describe('formatYenDelta', () => {
  it('always shows an explicit sign for non-zero changes', () => {
    expect(formatYenDelta(50_000)).toBe('+¥50,000')
    expect(formatYenDelta(-50_000)).toBe('-¥50,000')
    expect(formatYenDelta(0)).toBe('¥0')
  })
})
