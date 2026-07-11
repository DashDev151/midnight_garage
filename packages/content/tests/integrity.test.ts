import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import partsTaxonomy from '../data/parts-taxonomy.json'
import parts from '../data/parts.json'
import serviceJobs from '../data/serviceJobs.json'
import {
  BuyersSchema,
  CarModelsSchema,
  CarPartTaxonomySchema,
  PartsSchema,
  ServiceJobTypesSchema,
  type RarityTier,
} from '../src'

const PARTS_TAXONOMY = CarPartTaxonomySchema.parse(partsTaxonomy)
const GROUP_BY_PART_ID = new Map(PARTS_TAXONOMY.map((entry) => [entry.id, entry.group]))

describe('referential integrity', () => {
  it('every buyer statWeights covers exactly the five derived stats', () => {
    const parsedBuyers = BuyersSchema.parse(buyers)
    const expectedKeys = ['power', 'handling', 'style', 'reliability', 'authenticity'].sort()
    for (const buyer of parsedBuyers) {
      expect(Object.keys(buyer.statWeights).sort()).toEqual(expectedKeys)
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
   * catch a swap here - `carPartId` is a valid enum value either way, so
   * this is the only thing that would catch e.g. the bucket seat accidentally
   * landing on a wheels part). Sprint 26 remap: wheels parts now address the
   * specific taxonomy part (`rims`), not the old flat `wheels` component.
   */
  it('the former wheelsInterior parts landed on the correct real part', () => {
    const parsedParts = PartsSchema.parse(parts)
    const byId = Object.fromEntries(parsedParts.map((p) => [p.id, p]))
    expect(byId['enkai-mesh-15']?.carPartId).toBe('rims')
    expect(byId['vulk-ve37']?.carPartId).toBe('rims')
    expect(byId['zashiki-bucket-seat']?.carPartId).toBe('seats')
  })

  /**
   * Sprint 11: the job-type + flavor-pool model (replacing Sprint 10's fixed
   * 1:1 templates) exists specifically so a flavor line can never be paired
   * with a `work` it wasn't written for - Sprint 10's own "Brakes are shot"
   * line on a suspension-zone job is the exact bug this structurally
   * prevents. This guards against a future editing mistake reintroducing it:
   * no repair-zone type's flavor pool names a *different* component (Sprint
   * 12: componentId now covers all 8 real components, brakes included as a
   * real one rather than a special case).
   */
  it('no repair-zone flavor line names a different component', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    // Sprint 26: 6 real groups (forcedInduction folded into engine, brakes
    // folded into suspension - see tags.ts's ComponentIdSchema).
    const COMPONENT_WORDS = ['engine', 'drivetrain', 'suspension', 'body', 'interior', 'wheels']
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

  /**
   * Sprint 25 task 10: a job's worst-roll payout must clear the cheapest
   * catalog part that could fulfill it by a real margin. This is the exact
   * bug this test exists to keep out: install-forced-induction paid as
   * little as 110,000 yen while the cheapest turbo cost 180,000 - a
   * guaranteed loss no player choice could avoid. Interim guard (payouts are
   * still hand-authored) - Sprint 29 replaces authored payouts with derived
   * ones, but this invariant survives regardless of how payout gets
   * computed. Sprint 26: an install job's `componentId` now addresses a
   * GROUP (the "bridge," sprint26.md decision 13), so "fitting parts" means
   * every catalog part whose own `carPartId` resolves (via the taxonomy) to
   * that same group - not a direct id match anymore.
   */
  it('every install-kind job pays enough at worst roll to clear the cheapest fitting part by 1.2x', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    const parsedParts = PartsSchema.parse(parts)
    const installTypes = parsedTypes.filter((t) => t.work.kind === 'install')
    expect(installTypes.length).toBeGreaterThan(0)
    for (const type of installTypes) {
      if (type.work.kind !== 'install') continue
      const groupId = type.work.componentId
      const fittingParts = parsedParts.filter((p) => GROUP_BY_PART_ID.get(p.carPartId) === groupId)
      expect(
        fittingParts.length,
        `no catalog part fits group "${groupId}" (job type "${type.id}")`,
      ).toBeGreaterThan(0)
      const cheapest = Math.min(...fittingParts.map((p) => p.priceYen))
      const [minPayout] = type.payoutRangeYen
      const requiredFloor = Math.round(cheapest * 1.2)
      expect(
        minPayout,
        `${type.id}'s worst payout (${minPayout}) doesn't clear 1.2x the cheapest fitting part (${cheapest}, needs >= ${requiredFloor})`,
      ).toBeGreaterThanOrEqual(requiredFloor)
    }
  })
})
