import { PAINT_COLOURS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { PAINT_FAMILIES } from './paintFamilies'

describe('PAINT_FAMILIES', () => {
  it('groups every palette colour exactly once', () => {
    const grouped = PAINT_FAMILIES.flatMap((family) => family.ids)
    expect(new Set(grouped).size, 'a colour appears in more than one family').toBe(grouped.length)
    expect(grouped.sort()).toEqual(PAINT_COLOURS.map((c) => c.id).sort())
  })
})
