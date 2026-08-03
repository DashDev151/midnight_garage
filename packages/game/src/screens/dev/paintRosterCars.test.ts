import { PAINT_COLOURS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { FACTORY_COLOURS_BASIS_LEGEND, ROSTER_CARS } from './paintRosterCars'

describe('ROSTER_CARS', () => {
  it('reads all 94 rows, numbered 1 to 94 in order', () => {
    expect(ROSTER_CARS).toHaveLength(94)
    expect(ROSTER_CARS.map((car) => car.rosterNo)).toEqual(
      Array.from({ length: 94 }, (_, i) => i + 1),
    )
  })

  it('gives every car a name and a non-empty pool', () => {
    for (const car of ROSTER_CARS) {
      expect(car.displayName, `roster ${car.rosterNo}`).not.toBe('')
      expect(car.pool.length, `roster ${car.rosterNo}`).toBeGreaterThan(0)
    }
  })

  it('gives every car a basis the legend explains', () => {
    for (const car of ROSTER_CARS) {
      expect(
        FACTORY_COLOURS_BASIS_LEGEND[car.basis],
        `roster ${car.rosterNo} basis ${car.basis}`,
      ).toBeDefined()
    }
  })

  it('resolves every pool token, and both halves of a two-tone, to a known palette colour', () => {
    const knownIds = new Set(PAINT_COLOURS.map((c) => c.id))
    for (const car of ROSTER_CARS) {
      for (const token of car.pool) {
        for (const id of token.split('+')) {
          expect(knownIds.has(id), `roster ${car.rosterNo} token ${token}`).toBe(true)
        }
      }
    }
  })
})
