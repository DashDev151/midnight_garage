import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import { BuyersSchema, CarModelsSchema, type RarityTier } from '../src'

describe('referential integrity', () => {
  it('every buyer statWeights covers exactly the five derived stats', () => {
    const parsedBuyers = BuyersSchema.parse(buyers)
    const expectedKeys = ['power', 'handling', 'style', 'reliability', 'authenticity'].sort()
    for (const buyer of parsedBuyers) {
      expect(Object.keys(buyer.statWeights).sort()).toEqual(expectedKeys)
    }
  })

  it('no car repeats the same zone twice in hiddenIssueWeights', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    for (const car of parsedCars) {
      const zones = car.hiddenIssueWeights.map((w) => w.zone)
      expect(new Set(zones).size, `${car.id} has duplicate zone weights`).toBe(zones.length)
    }
  })

  it('every car book value falls inside its tier range (docs/economy-v0.md)', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const ranges: Record<RarityTier, [number, number]> = {
      shitbox: [80_000, 400_000],
      common: [300_000, 1_200_000],
      uncommon: [800_000, 2_500_000],
      rare: [2_000_000, 6_000_000],
      gaisha: [3_000_000, 15_000_000],
      legend: [5_000_000, 100_000_000],
    }
    for (const car of parsedCars) {
      const range = ranges[car.tier]
      const [min, max] = range
      expect(
        car.bookValueYen,
        `${car.id} (${car.tier}) book value ${car.bookValueYen} out of range`,
      ).toBeGreaterThanOrEqual(min)
      expect(car.bookValueYen).toBeLessThanOrEqual(max)
    }
  })
})
