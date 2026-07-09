import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import serviceJobs from '../data/serviceJobs.json'
import { BuyersSchema, CarModelsSchema, ServiceJobTypesSchema, type RarityTier } from '../src'

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

  /**
   * Sprint 11: the job-type + flavor-pool model (replacing Sprint 10's fixed
   * 1:1 templates) exists specifically so a flavor line can never be paired
   * with a `work` it wasn't written for — Sprint 10's own "Brakes are shot"
   * line on a suspension-zone job is the exact bug this structurally
   * prevents. This guards against a future editing mistake reintroducing it:
   * no repair-zone type's flavor pool names a *different* zone or "brakes"
   * (a real, distinct part players think of separately from "suspension").
   */
  it('no repair-zone flavor line names a different zone (or brakes)', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    const ZONE_WORDS = ['engine', 'drivetrain', 'suspension', 'body', 'interior', 'brakes']
    for (const type of parsedTypes) {
      if (type.work.kind !== 'repair') continue
      const zone = type.work.zone
      const foreignWords = ZONE_WORDS.filter((w) => w !== zone)
      for (const line of type.flavorPool) {
        const text = line.toLowerCase()
        for (const word of foreignWords) {
          expect(
            text.includes(word),
            `job type "${type.id}" (repair ${zone}) flavor line "${line}" names "${word}"`,
          ).toBe(false)
        }
      }
    }
  })
})
