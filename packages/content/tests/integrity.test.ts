import { describe, expect, it } from 'vitest'
import assembliesJson from '../data/assemblies.json'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import economy from '../data/economy.json'
import partsTaxonomy from '../data/parts-taxonomy.json'
import parts from '../data/parts.json'
import serviceJobs from '../data/serviceJobTemplates.json'
import {
  AssemblyDefsSchema,
  ASSEMBLIES,
  BuyersSchema,
  CarModelsSchema,
  CarPartIdSchema,
  CarPartTaxonomyContentSchema,
  EconomyConfigSchema,
  GradeSchema,
  PAINT_COLOURS,
  PART_FITMENT_CLASS_DISPLAY_NAMES,
  PartCatalogEntriesSchema,
  PARTS,
  PARTS_TAXONOMY,
  ServiceJobTypesSchema,
  type PartCatalogEntry,
} from '../src'

const TAXONOMY_CONTENT = CarPartTaxonomyContentSchema.parse(partsTaxonomy)
const GROUP_BY_PART_ID = new Map(TAXONOMY_CONTENT.map((entry) => [entry.id, entry.group]))

describe('referential integrity', () => {
  it('every buyer statTargets covers exactly the five derived stats', () => {
    const parsedBuyers = BuyersSchema.parse(buyers)
    const expectedKeys = ['power', 'handling', 'style', 'reliability', 'authenticity'].sort()
    for (const buyer of parsedBuyers) {
      expect(Object.keys(buyer.statTargets).sort()).toEqual(expectedKeys)
    }
  })

  /**
   * `spec.aspiration` and `tags` are two independent representations of the
   * same fact (whether a car is factory forced-induction), and only one of
   * them is actually read by the sim: `hasForcedInduction`
   * (`packages/sim/src/bands.ts`) reads `spec.aspiration`, the field the
   * roster authors for every car it holds. The induction TAG is a platform
   * facet for display and matching, and a car whose tag disagreed with its own
   * aspiration would advertise one engine and behave as another, with nothing
   * else catching the drift. `engineCharacterOf` calls `hasForcedInduction`
   * first, before anything else, so the fact reaches the power curve and the
   * support-ratio demand driver too.
   */
  it("every car's tags agree with spec.aspiration: a Turbo or Supercharged tag matches a forced aspiration, and vice versa", () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const offenders: string[] = []
    for (const car of parsedCars) {
      const hasTurboTag = car.tags.includes('Turbo')
      const hasSuperchargedTag = car.tags.includes('Supercharged')
      const { aspiration } = car.spec
      const isForced =
        aspiration === 'turbo' || aspiration === 'twin-turbo' || aspiration === 'supercharged'

      if ((hasTurboTag || hasSuperchargedTag) !== isForced) {
        offenders.push(`${car.id}: tags=[${car.tags.join(',')}] aspiration=${aspiration}`)
        continue
      }
      if (hasSuperchargedTag && aspiration !== 'supercharged') {
        offenders.push(`${car.id}: Supercharged tag but aspiration is ${aspiration}`)
      }
      if (hasTurboTag && aspiration !== 'turbo' && aspiration !== 'twin-turbo') {
        offenders.push(`${car.id}: Turbo tag but aspiration is ${aspiration}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * `spec.factoryColours` carries palette ids as plain strings rather than a
   * typed reference, specifically so `carModel.ts` never imports
   * `paintColour.ts` (`data.ts` imports `carModel.ts`, so the reverse would
   * cycle). Nothing at the schema level can catch a typo'd id, so this is
   * the one place both sides are ever imported together: every id a shipped
   * car uses, including each half of a factory two-tone, must be a real
   * member of `PAINT_COLOURS`.
   */
  it("every shipped car's factoryColours resolve against the real palette", () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const paletteIds = new Set(PAINT_COLOURS.map((colour) => colour.id))
    for (const car of parsedCars) {
      for (const entry of car.spec.factoryColours) {
        for (const id of entry.split('+')) {
          expect(paletteIds.has(id), `${car.id}: factoryColours entry "${entry}" (${id})`).toBe(
            true,
          )
        }
      }
    }
  })

  // The tier price bands moved to `rosterCsvGuard.test.ts`, which checks them
  // against `midnight-garage-roster.csv` and also asserts that every car's tier
  // matches the roster's. The bands that used to sit here were a hand-copied
  // second set, taken from a document whose tier system is dead, and they were
  // wide enough to admit the inversion the roster rebuild removed.

  /**
   * The old `wheelsInterior` slot's 3 parts were hand-reclassified by name
   * onto the new `wheels`/`interior` components (no schema check can catch
   * a swap here - `carPartId` is a valid enum value either way, so this is
   * the only thing that would catch e.g. the bucket seat accidentally
   * landing on a wheels part). Wheels parts now address the specific
   * taxonomy part (`rims`), not the old flat `wheels` component.
   */
  it('the former wheelsInterior parts landed on the correct real part', () => {
    const parsedParts = PartCatalogEntriesSchema.parse(parts)
    const byId = Object.fromEntries(parsedParts.map((p) => [p.id, p]))
    expect(byId['ronin-street-alloys']?.carPartId).toBe('rims')
    expect(byId['vulk-ve37']?.carPartId).toBe('rims')
    expect(byId['zashiki-bucket-seat']?.carPartId).toBe('seats')
  })

  /**
   * The job-type + flavor-pool model exists specifically so a flavor line
   * can never be paired with work it wasn't written for - a "Brakes are
   * shot" line on a suspension-zone job is the exact bug this structurally
   * prevents. A template's `tasks` can touch several parts across several
   * groups, so this guards the multi-task shape - no flavor line names a
   * component group that none of the template's own tasks actually touch.
   */
  it('no template flavor line names a component group it does not actually touch', () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    // 6 real groups (forcedInduction folded into engine, brakes folded into
    // suspension - see tags.ts's ComponentIdSchema).
    const COMPONENT_WORDS = ['engine', 'drivetrain', 'suspension', 'body', 'interior', 'wheels']
    for (const type of parsedTypes) {
      const touchedGroups = new Set(
        type.tasks.map((task) => GROUP_BY_PART_ID.get(task.requirement.carPartId)),
      )
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
   * Scrap is unrepairable (directive 17 case (a)): no requirement's
   * `minBand` is ever `scrap` - a template whose premise implies a wrecked
   * part sets a real `minBand` (with a `minGrade`, if it's meant to be
   * satisfied by a fresh part) instead, so the customer pays for actual work
   * rather than a floor `evaluateRequirement` treats as permanently failing
   * regardless of route.
   */
  it("no requirement's minBand is ever scrap", () => {
    const parsedTypes = ServiceJobTypesSchema.parse(serviceJobs)
    for (const type of parsedTypes) {
      for (const task of type.tasks) {
        expect(
          task.requirement.minBand,
          `template "${type.id}" requirement on "${task.requirement.carPartId}" targets scrap`,
        ).not.toBe('scrap')
      }
    }
  })

  /**
   * Payout is derived, not authored, so a guaranteed-loss bug is
   * structurally retired by the payout FORMULA itself - covered by the
   * mandatory profitability invariant property test in
   * `packages/sim/tests/serviceJobPayout.test.ts` (every template x every
   * roster model), not a content-shape check here.
   */

  /**
   * Catalog validation, not authoring. The catalog carries exactly 4 tiers
   * per component (stock/street/sport/race, 116 entries total) and no
   * `requiredTags` entries (aftermarket parts fit any car for now). This
   * asserts every one of the 28 `CarPartId`s still has at least one catalog
   * part addressed to it, and that part fits at least one roster car (not
   * just parses) - a vacuous pass now that `requiredTags` is always `[]`,
   * but still real coverage against a `CarPartId` with zero catalog entries
   * at all.
   */
  it('every real car part has a catalog part addressed to it that fits at least one roster car (Sprint 28)', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const parsedParts = PartCatalogEntriesSchema.parse(parts)
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
   * The rotary content hole this guards against: zero Rotary-tagged parts
   * would mean the FC and FD RX-7s could never receive any engine or forced
   * induction part. Every real engine-group part (the 9 non-FI engine parts
   * plus `forcedInduction` itself) must have at least one catalog part that
   * actually fits a Rotary-tagged car.
   */
  it('every Rotary-tagged roster car has a fitting catalog part for every real engine-group part', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const parsedParts = PartCatalogEntriesSchema.parse(parts)
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
   * A forced-induction kit is installable on an NA car via the universal FI
   * slot. Checked against a real NA, Piston roster car (no Turbo/
   * Supercharged tag of its own). The forced-induction catalog carries one
   * entry per tier with `requiredTags` always `[]`, so "fits" is no longer
   * the discriminating fact; the real remaining fact worth guarding is that
   * a forced-induction kit still exists in the catalog at all.
   */
  it('at least one forced-induction kit fits an NA Piston roster car', () => {
    const parsedCars = CarModelsSchema.parse(cars)
    const parsedParts = PartCatalogEntriesSchema.parse(parts)
    const naPistonCar = parsedCars.find(
      (c) =>
        c.tags.includes('NA') &&
        c.tags.includes('Piston') &&
        !c.tags.includes('Turbo') &&
        !c.tags.includes('Supercharged'),
    )
    expect(naPistonCar, 'no NA Piston car in the roster to test against').toBeDefined()
    const fitsNaCar = (part: PartCatalogEntry) =>
      part.requiredTags.every((tag) => naPistonCar!.tags.includes(tag))

    const forcedInductionKits = parsedParts.filter(
      (p) => p.carPartId === 'forcedInduction' && p.grade !== 'stock' && fitsNaCar(p),
    )

    expect(
      forcedInductionKits.length,
      'no aftermarket forced-induction kit fits an NA Piston roster car',
    ).toBeGreaterThan(0)
  })

  /**
   * `restoration.repairStepFraction` is the ONE knob every repair cost in
   * the pipeline scales by - must be a real, positive fraction of a part's
   * price (never negative, never able to exceed the part's own value per
   * grade), matching the schema's own `.positive().max(1)` bound.
   */
  it('economy.restoration.repairStepFraction is a positive fraction of a part price', () => {
    const parsedEconomy = EconomyConfigSchema.parse(economy)
    const { repairStepFraction } = parsedEconomy.restoration
    expect(repairStepFraction).toBeGreaterThan(0)
    expect(repairStepFraction).toBeLessThanOrEqual(1)
  })

  /**
   * economy-bible.md law 3: repair cost derives from the INSTALLED
   * instance's own resolved `priceYen`, and the flat replacement price
   * (scrap, a missing slot, a non-repairable consumable) is the taxonomy's
   * `stockReplacementPriceYenByClass` - these two numbers are DERIVED from
   * the same resolved catalog (data.ts), so they can never hand-drift apart
   * the way two independently authored numbers could; this guards the
   * derivation wiring itself (a refactor that breaks the link between
   * `PARTS` and `PARTS_TAXONOMY` would still be caught here). Zone-panel SKUs
   * are excluded: they are stock-grade `panels` entries that deliberately
   * price from the independent `zonePanel` basis via `priceBasisPartId`, not
   * from the `panels` taxonomy's own stock-replacement price.
   */
  it("every stock-grade catalog part's resolved price matches its taxonomy entry's per-class stock-replacement price", () => {
    for (const part of PARTS) {
      if (part.grade !== 'stock' || part.zoneId !== undefined) continue
      const entry = PARTS_TAXONOMY.find((e) => e.id === part.carPartId)
      expect(entry, `${part.id} addresses unknown taxonomy id ${part.carPartId}`).toBeDefined()
      expect(
        part.priceYen,
        `${part.id} (stock, ${part.carPartId}, ${part.fitmentClass}) priceYen does not match its taxonomy entry's per-class stock-replacement price`,
      ).toBe(entry!.stockReplacementPriceYenByClass[part.fitmentClass])
    }
  })

  /**
   * Every component slot ships 16 real store SKUs (4 fitment classes x 4
   * grades) - real, separately named catalog entries, never a single part
   * with a runtime price switch. Guards both directions: nothing missing,
   * nothing accidentally duplicated. Zone-panel SKUs (`zoneId` set) are
   * excluded: they are additional `panels` entries addressed to a specific
   * zone, on top of this matrix, not a member of it. `panels` itself only
   * fills the stock rung of this matrix - its street/sport/race rungs are
   * entirely zone-addressed now, so nothing non-zone exists there to find.
   * `paint` still carries a full ladder like every other slot: stock is
   * factory-correct, and street/sport/race are a respray in the car's own
   * colour or another.
   */
  it('every real car part has exactly 16 catalog SKUs - 4 fitment classes x 4 grades - except panels, whose aftermarket rungs are zone-addressed', () => {
    const FITMENT_CLASSES = ['entry', 'everyday', 'enthusiast', 'flagship'] as const
    const nonZonePanelParts = PARTS.filter((p) => p.zoneId === undefined)
    for (const carPartId of CarPartIdSchema.options) {
      for (const fitmentClass of FITMENT_CLASSES) {
        for (const grade of GradeSchema.options) {
          const candidates = nonZonePanelParts.filter(
            (p) =>
              p.carPartId === carPartId && p.fitmentClass === fitmentClass && p.grade === grade,
          )
          const expected = carPartId === 'panels' && grade !== 'stock' ? 0 : 1
          expect(
            candidates.length,
            `expected exactly ${expected} SKU for ${carPartId}/${fitmentClass}/${grade}, found ${candidates.length}`,
          ).toBe(expected)
        }
      }
    }
  })

  /**
   * The three Nurikabe respray grades, pinned to their approved style points
   * and to costing nothing on power - a respray changes how a car looks, not
   * how it goes.
   */
  it('the paint ladder carries the approved style points and no power effect, on every fitment class', () => {
    const stylePointsByGrade = { street: 5, sport: 10, race: 15 } as const
    for (const [grade, stylePoints] of Object.entries(stylePointsByGrade)) {
      const skus = PARTS.filter((p) => p.carPartId === 'paint' && p.grade === grade)
      expect(skus.length, grade).toBe(4)
      for (const sku of skus) {
        expect(sku.brand, sku.id).toBe('Nurikabe')
        expect(sku.statModifiers.style, sku.id).toBe(stylePoints)
        expect(sku.statModifiers.powerFraction, sku.id).toEqual({
          'high-strung-na': 0,
          'lazy-na': 0,
          forced: 0,
        })
      }
    }
  })

  /**
   * The cosmetic/functional split: `aero` is the PERFORMANCE slot and every
   * non-stock SKU on it makes real downforce (`aeroFunctional`, read by
   * `effectiveDownforce`), while the twelve kits that only change how a car
   * looks sit on the body slot each one actually addresses. Fitting a body
   * kit therefore cannot displace a wing, which is what it used to do.
   */
  it('every non-stock aero SKU is aero-functional, and no body-slot SKU claims to be', () => {
    for (const part of PARTS) {
      if (part.carPartId === 'aero') {
        expect(part.aeroFunctional ?? false, `${part.id}`).toBe(part.grade !== 'stock')
        continue
      }
      expect(part.aeroFunctional ?? false, `${part.id}`).toBe(false)
    }
  })

  /**
   * Zone panels are `panels` SKUs addressed to one of the nine body zones,
   * on top of the matrix above (which `panels` only fills at stock). Every
   * one of the other 27 real parts carries its full 16-SKU ladder, so the
   * whole catalog is 27 x 16 = 432, plus panels' own 148 (4 whole-car stock
   * carriers, 36 stock zone panels - one per zone per fitment class - and
   * 108 aftermarket zone panels - nine zones x three grades x four fitment
   * classes) = 580.
   */
  it('the catalog carries exactly 36 stock and 108 aftermarket zone-panel SKUs, and 580 entries total', () => {
    const FITMENT_CLASSES = ['entry', 'everyday', 'enthusiast', 'flagship'] as const
    const zoneIds = [
      'bonnet',
      'boot',
      'left-front',
      'left-rear',
      'right-front',
      'right-rear',
      'front-bumper',
      'rear-bumper',
      'skirts',
    ] as const
    const zonePanelParts = PARTS.filter((p) => p.zoneId !== undefined)
    const stockZonePanels = zonePanelParts.filter((p) => p.grade === 'stock')
    const aftermarketZonePanels = zonePanelParts.filter((p) => p.grade !== 'stock')
    expect(stockZonePanels.length).toBe(36)
    expect(aftermarketZonePanels.length).toBe(108)
    expect(PARTS.length).toBe(580)
    for (const part of zonePanelParts) {
      expect(part.carPartId).toBe('panels')
    }
    for (const part of stockZonePanels) {
      expect(part.priceBasisPartId).toBe('zonePanel')
    }
    for (const part of aftermarketZonePanels) {
      expect(part.priceBasisPartId).toBe('bodyKit')
    }
    for (const zoneId of zoneIds) {
      for (const fitmentClass of FITMENT_CLASSES) {
        const stockCandidates = stockZonePanels.filter(
          (p) => p.zoneId === zoneId && p.fitmentClass === fitmentClass,
        )
        expect(
          stockCandidates.length,
          `expected exactly 1 stock zone-panel SKU for ${zoneId}/${fitmentClass}, found ${stockCandidates.length}`,
        ).toBe(1)
        for (const grade of ['street', 'sport', 'race'] as const) {
          const aftermarketCandidates = aftermarketZonePanels.filter(
            (p) => p.zoneId === zoneId && p.fitmentClass === fitmentClass && p.grade === grade,
          )
          expect(
            aftermarketCandidates.length,
            `expected exactly 1 ${grade} zone-panel SKU for ${zoneId}/${fitmentClass}, found ${aftermarketCandidates.length}`,
          ).toBe(1)
        }
      }
    }
  })

  /**
   * The diegetic class names never leak a raw fitment-class identifier back
   * at the player (mirrors the component-display-name law's own guard).
   */
  it('every fitment class has a real display name, never the raw identifier', () => {
    for (const fitmentClass of ['entry', 'everyday', 'enthusiast', 'flagship'] as const) {
      const label = PART_FITMENT_CLASS_DISPLAY_NAMES[fitmentClass]
      expect(label, `${fitmentClass} has no display name`).toBeTruthy()
      expect(label).not.toBe(fitmentClass)
    }
  })

  /**
   * A guard retired here (directive 17 case (a), not simply deleted without
   * reason): it existed because a `repair` task once PRESCRIBED an action,
   * and prescribing repair on a non-repairable part (`repairable: false` -
   * tyres/brakePadsDiscs/clutch) was a content bug - the job would
   * price/complete through a formula that never applied to that part.
   * Outcome-based tasks don't prescribe a route at all ("any route counts")
   * - a band-only `slotCondition` on a non-repairable part is perfectly
   * satisfiable by replacing it, priced correctly by
   * `serviceJobCostBreakdown`'s fall-through to the install route. There is
   * no longer a content bug this guard could catch.
   */
})

describe('assembly definitions (Sprint 87)', () => {
  it('every assembly member is a real taxonomy part that shares the assembly group', () => {
    for (const assembly of ASSEMBLIES) {
      expect(assembly.members.length, `${assembly.id} has no members`).toBeGreaterThan(0)
      for (const member of assembly.members) {
        expect(
          GROUP_BY_PART_ID.get(member),
          `${assembly.id} member "${member}" is not a real part`,
        ).toBeDefined()
        expect(
          GROUP_BY_PART_ID.get(member),
          `${assembly.id} member "${member}" is not in the assembly's own group`,
        ).toBe(assembly.group)
      }
    }
  })

  it('no part belongs to more than one assembly', () => {
    const seen = new Set<string>()
    for (const assembly of ASSEMBLIES) {
      for (const member of assembly.members) {
        expect(seen.has(member), `part "${member}" is a member of two assemblies`).toBe(false)
        seen.add(member)
      }
    }
  })

  it('the assemblies content parses against its own schema', () => {
    expect(AssemblyDefsSchema.safeParse(assembliesJson).success).toBe(true)
  })
})
