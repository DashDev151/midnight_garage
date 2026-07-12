import { describe, expect, it } from 'vitest'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import partsTaxonomy from '../data/parts-taxonomy.json'
import parts from '../data/parts.json'
import serviceJobs from '../data/serviceJobTemplates.json'
import {
  BuyersSchema,
  CarModelsSchema,
  CarPartIdSchema,
  CarPartTaxonomySchema,
  PartsSchema,
  ServiceJobTypesSchema,
  type Part,
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
    expect(byId['ronin-street-alloys']?.carPartId).toBe('rims')
    expect(byId['vulk-ve37']?.carPartId).toBe('rims')
    expect(byId['zashiki-bucket-seat']?.carPartId).toBe('seats')
  })

  /**
   * Sprint 11: the job-type + flavor-pool model exists specifically so a
   * flavor line can never be paired with work it wasn't written for -
   * Sprint 10's own "Brakes are shot" line on a suspension-zone job is the
   * exact bug this structurally prevents. Sprint 29: a template's `tasks`
   * can now touch several parts across several groups, so this guards the
   * multi-task shape - no flavor line names a component group that none of
   * the template's own tasks actually touch.
   */
  it('no template flavor line names a component group it does not actually touch', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    // Sprint 26: 6 real groups (forcedInduction folded into engine, brakes
    // folded into suspension - see tags.ts's ComponentIdSchema).
    const COMPONENT_WORDS = ['engine', 'drivetrain', 'suspension', 'body', 'interior', 'wheels']
    for (const type of parsedTypes) {
      const touchedGroups = new Set(type.tasks.map((task) => GROUP_BY_PART_ID.get(task.carPartId)))
      const foreignWords = COMPONENT_WORDS.filter((word) => !touchedGroups.has(word as never))
      for (const line of type.flavorPool) {
        const text = line.toLowerCase()
        for (const word of foreignWords) {
          expect(
            text.includes(word),
            `template "${type.id}" flavor line "${line}" names "${word}", which none of its tasks touch`,
          ).toBe(false)
        }
      }
    }
  })

  /**
   * Sprint 26 decision 5 (scrap is unrepairable) + Sprint 29 decision 3: a
   * repair task's `targetBand` must never be `scrap` - a template whose
   * premise implies a wrecked part uses an `install` task on it instead, so
   * the customer pays for a real replacement rather than an impossible
   * patch job. `deriveServiceJobPayoutYen` (sim) treats a repair task on an
   * already-scrap part as free/auto-satisfied, which would make this a
   * content bug (a "job" with nothing to actually do), not a schema error -
   * this test is what actually catches it.
   */
  it('no repair task ever targets scrap', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    for (const type of parsedTypes) {
      for (const task of type.tasks) {
        if (task.action !== 'repair') continue
        expect(task.targetBand, `template "${type.id}" repair task targets scrap`).not.toBe('scrap')
      }
    }
  })

  /**
   * Sprint 29: payout is derived, not authored, so the guaranteed-loss bug
   * (Sprint 25 task 10's "install-forced-induction paid as little as
   * 110,000 against a 180,000 cheapest turbo") is structurally retired by
   * the payout FORMULA itself - covered by the mandatory profitability
   * invariant property test in `packages/sim/tests/serviceJobPayout.test.ts`
   * (every template x every roster model), not a content-shape check here.
   */

  /**
   * Sprint 28 DoD (catalog validation, not authoring); Sprint 32 decision 1
   * normalized the catalog to exactly 4 tiers per component (stock/street/
   * sport/race, 116 entries total) and dropped every `requiredTags` entry
   * (aftermarket parts fit any car for now). This asserts every one of the
   * 29 `CarPartId`s still has at least one catalog part addressed to it,
   * and that part fits at least one roster car (not just parses) - a
   * vacuous pass now that `requiredTags` is always `[]`, but still real
   * coverage against a `CarPartId` with zero catalog entries at all.
   */
  it('every real car part has a catalog part addressed to it that fits at least one roster car (Sprint 28)', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const parsedParts = PartsSchema.parse(parts)
    for (const carPartId of CarPartIdSchema.options) {
      const candidates = parsedParts.filter((p) => p.carPartId === carPartId)
      expect(candidates.length, `no catalog part addresses "${carPartId}"`).toBeGreaterThan(0)
      const fitsSomeCar = candidates.some((part) =>
        parsedCars.some((car) => part.requiredTags.every((tag) => car.tags.includes(tag))),
      )
      expect(fitsSomeCar, `no catalog part addressing "${carPartId}" fits any roster car`).toBe(
        true,
      )
    }
  })

  /**
   * Sprint 28's own trigger: the rotary content hole found during triage -
   * "verified during triage that zero Rotary-tagged parts exist, so the FC
   * and FD RX-7s can never receive any engine or forced induction part"
   * (sprint28.md's Goal). Every real engine-group part (the 9 non-FI engine
   * parts plus `forcedInduction` itself) must have at least one catalog
   * part that actually fits a Rotary-tagged car now.
   */
  it('every Rotary-tagged roster car has a fitting catalog part for every real engine-group part', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const parsedParts = PartsSchema.parse(parts)
    const rotaryCars = parsedCars.filter((c) => c.tags.includes('Rotary'))
    expect(rotaryCars.length, 'no Rotary-tagged car in the roster to test against').toBeGreaterThan(
      0,
    )
    const engineGroupPartIds = [...GROUP_BY_PART_ID.entries()]
      .filter(([, group]) => group === 'engine')
      .map(([partId]) => partId)
    expect(engineGroupPartIds.length).toBeGreaterThan(0)
    for (const car of rotaryCars) {
      for (const carPartId of engineGroupPartIds) {
        const fits = parsedParts.some(
          (p) => p.carPartId === carPartId && p.requiredTags.every((tag) => car.tags.includes(tag)),
        )
        expect(fits, `${car.id} has no fitting catalog part for engine part "${carPartId}"`).toBe(
          true,
        )
      }
    }
  })

  /**
   * Sprint 28 decision 4: a forced-induction kit is installable on an NA car
   * via the universal FI slot, plus at least one underglow kit (the
   * underbody style slot). Checked against a real NA, Piston roster car (no
   * Turbo/Supercharged tag of its own). Sprint 32 decision 1 normalized the
   * forced-induction catalog to one entry per tier (dropping the old
   * separate turbo/supercharger flavor split - `requiredTags` is `[]`
   * everywhere now, so "fits" is no longer the discriminating fact this
   * test was originally written to prove; the real remaining fact worth
   * guarding is that a forced-induction and an underglow kit both still
   * exist in the catalog at all).
   */
  it('at least one forced-induction kit and one underglow kit fit an NA Piston roster car', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const parsedParts = PartsSchema.parse(parts)
    const naPistonCar = parsedCars.find(
      (c) =>
        c.tags.includes('NA') &&
        c.tags.includes('Piston') &&
        !c.tags.includes('Turbo') &&
        !c.tags.includes('Supercharged'),
    )
    expect(naPistonCar, 'no NA Piston car in the roster to test against').toBeDefined()
    const fitsNaCar = (part: Part) =>
      part.requiredTags.every((tag) => naPistonCar!.tags.includes(tag))

    const forcedInductionKits = parsedParts.filter(
      (p) => p.carPartId === 'forcedInduction' && p.grade !== 'stock' && fitsNaCar(p),
    )
    const underglowKits = parsedParts.filter(
      (p) => p.carPartId === 'underbody' && /underglow/i.test(p.name) && fitsNaCar(p),
    )

    expect(
      forcedInductionKits.length,
      'no aftermarket forced-induction kit fits an NA Piston roster car',
    ).toBeGreaterThan(0)
    expect(underglowKits.length, 'no underglow kit fits an NA Piston roster car').toBeGreaterThan(0)
  })
})
