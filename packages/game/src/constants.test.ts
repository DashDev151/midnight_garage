import { describe, expect, it } from 'vitest'
import { repairLaborSlotsFor } from './constants'

describe('repairLaborSlotsFor', () => {
  it('scales up as a zone gets more damaged', () => {
    expect(repairLaborSlotsFor(100)).toBe(1) // pristine: still the 1-slot minimum
    expect(repairLaborSlotsFor(70)).toBe(1)
    expect(repairLaborSlotsFor(40)).toBe(2)
    expect(repairLaborSlotsFor(10)).toBe(3)
    expect(repairLaborSlotsFor(0)).toBeGreaterThanOrEqual(repairLaborSlotsFor(50))
  })

  it('never returns less than one slot', () => {
    for (let c = 0; c <= 100; c += 5) {
      expect(repairLaborSlotsFor(c)).toBeGreaterThanOrEqual(1)
    }
  })
})
