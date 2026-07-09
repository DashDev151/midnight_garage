import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import parts from '../data/parts.json'
import serviceJobs from '../data/serviceJobs.json'
import {
  BuyersSchema,
  CarModelsSchema,
  PartsSchema,
  ServiceJobTypesSchema,
  type RarityTier,
} from '../src'

describe('referential integrity', () => {
  it('every buyer statWeights covers exactly the five derived stats', () => {
    const parsedBuyers = BuyersSchema.parse(buyers)
    const expectedKeys = ['power', 'handling', 'style', 'reliability', 'authenticity'].sort()
    for (const buyer of parsedBuyers) {
      expect(Object.keys(buyer.statWeights).sort()).toEqual(expectedKeys)
    }
  })

  it('no car repeats the same component twice in hiddenIssueWeights', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    for (const car of parsedCars) {
      const componentIds = car.hiddenIssueWeights.map((w) => w.componentId)
      expect(new Set(componentIds).size, `${car.id} has duplicate component weights`).toBe(
        componentIds.length,
      )
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
   * Sprint 12: the old `wheelsInterior` slot's 3 parts were hand-reclassified
   * by name onto the new `wheels`/`interior` components (no schema check can
   * catch a swap here — `componentId` is a valid enum value either way, so
   * this is the only thing that would catch e.g. the bucket seat accidentally
   * landing on `wheels`).
   */
  it('the former wheelsInterior parts landed on the correct real component', () => {
    const parsedParts = PartsSchema.parse(parts)
    const byId = Object.fromEntries(parsedParts.map((p) => [p.id, p]))
    expect(byId['enkai-mesh-15']?.componentId).toBe('wheels')
    expect(byId['vulk-ve37']?.componentId).toBe('wheels')
    expect(byId['zashiki-bucket-seat']?.componentId).toBe('interior')
  })

  /**
   * Sprint 11: the job-type + flavor-pool model (replacing Sprint 10's fixed
   * 1:1 templates) exists specifically so a flavor line can never be paired
   * with a `work` it wasn't written for — Sprint 10's own "Brakes are shot"
   * line on a suspension-zone job is the exact bug this structurally
   * prevents. This guards against a future editing mistake reintroducing it:
   * no repair-zone type's flavor pool names a *different* component (Sprint
   * 12: componentId now covers all 8 real components, brakes included as a
   * real one rather than a special case).
   */
  it('no repair-zone flavor line names a different component', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    const COMPONENT_WORDS = [
      'engine',
      'drivetrain',
      'suspension',
      'body',
      'interior',
      'brakes',
      'wheels',
    ]
    for (const type of parsedTypes) {
      if (type.work.kind !== 'repair') continue
      const componentId = type.work.componentId
      const foreignWords = COMPONENT_WORDS.filter((w) => w !== componentId)
      for (const line of type.flavorPool) {
        const text = line.toLowerCase()
        for (const word of foreignWords) {
          expect(
            text.includes(word),
            `job type "${type.id}" (repair ${componentId}) flavor line "${line}" names "${word}"`,
          ).toBe(false)
        }
      }
    }
  })
})
