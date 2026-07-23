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
  PART_FITMENT_CLASS_DISPLAY_NAMES,
  PartCatalogEntriesSchema,
  PARTS,
  PARTS_TAXONOMY,
  ServiceJobTypesSchema,
  type PartCatalogEntry,
  type RarityTier,
} from '../src'

const TAXONOMY_CONTENT = CarPartTaxonomyContentSchema.parse(partsTaxonomy)
const GROUP_BY_PART_ID = new Map(TAXONOMY_CONTENT.map((entry) => [entry.id, entry.group]))

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
    // A desirable kei (Beat, Alto Works) is Kei-tagged, so it takes the
    // shitbox fitment class regardless of its market value, and a cult MR kei
    // roadster clears the old 400k economy-v0.md sanity cap. The ceiling is
    // widened to 500_000 to hold those cars while still catching a genuinely
    // mispriced shitbox.
    const ranges: Record<RarityTier, [number, number]> = {
      shitbox: [80_000, 500_000],
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
   * asserts every one of the 29 `CarPartId`s still has at least one catalog
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
   * slot, plus at least one underglow kit (now the aero and body kit family
   * - underglow migrated out of `underbody`, which is a derived body value
   * carrier with no aftermarket grades of its own). Checked against a real
   * NA, Piston roster car (no Turbo/Supercharged tag of its own). The
   * forced-induction catalog carries one entry per tier with `requiredTags`
   * always `[]`, so "fits" is no longer the discriminating fact; the real
   * remaining fact worth guarding is that a forced-induction and an
   * underglow kit both still exist in the catalog at all.
   */
  it('at least one forced-induction kit and one underglow kit fit an NA Piston roster car', () => {
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
    const underglowKits = parsedParts.filter(
      (p) => p.carPartId === 'aero' && /underglow/i.test(p.name) && fitsNaCar(p),
    )

    expect(
      forcedInductionKits.length,
      'no aftermarket forced-induction kit fits an NA Piston roster car',
    ).toBeGreaterThan(0)
    expect(underglowKits.length, 'no underglow kit fits an NA Piston roster car').toBeGreaterThan(0)
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

  /** The three derived body value carriers - `panels`/`paint`/`underbody`
   * carry no aftermarket grades of their own anymore: their bands derive
   * from zone state, and their old street/sport/race SKUs either retired
   * outright (the paint finishes) or migrated into the `aero` slot as the
   * widened "aero and body kit" family (the panel and underbody kits). */
  const DERIVED_BODY_PART_IDS = ['panels', 'paint', 'underbody'] as const

  /**
   * Every component slot OTHER than the three derived body carriers and
   * `aero` ships 16 real store SKUs (4 fitment classes x 4 grades) - real,
   * separately named catalog entries, never a single part with a runtime
   * price switch. Guards both directions: nothing missing, nothing
   * accidentally duplicated. Zone-panel SKUs (`zoneId` set) are excluded:
   * they are additional stock-grade `panels` entries addressed to a specific
   * zone, on top of this matrix, not a member of it. `panels`/`paint`/
   * `underbody` and `aero` carry their own, separately-shaped counts below.
   */
  it('every ordinary real car part has exactly 16 catalog SKUs - 4 fitment classes x 4 grades', () => {
    const FITMENT_CLASSES = ['shitbox', 'common', 'uncommon', 'rare'] as const
    const nonZonePanelParts = PARTS.filter((p) => p.zoneId === undefined)
    for (const carPartId of CarPartIdSchema.options) {
      if (
        carPartId === 'aero' ||
        (DERIVED_BODY_PART_IDS as readonly string[]).includes(carPartId)
      ) {
        continue
      }
      for (const fitmentClass of FITMENT_CLASSES) {
        for (const grade of GradeSchema.options) {
          const candidates = nonZonePanelParts.filter(
            (p) =>
              p.carPartId === carPartId && p.fitmentClass === fitmentClass && p.grade === grade,
          )
          expect(
            candidates.length,
            `expected exactly 1 SKU for ${carPartId}/${fitmentClass}/${grade}, found ${candidates.length}`,
          ).toBe(1)
        }
      }
    }
  })

  /**
   * `panels`/`paint`/`underbody` are derived body value carriers now: each
   * keeps exactly its one stock SKU per fitment class (the value machinery's
   * installed reference) and nothing at street/sport/race - a player never
   * buys an aftermarket grade for a part whose band the zone pipeline
   * derives.
   */
  it('the three derived body value carriers carry a stock SKU only, one per fitment class, no aftermarket grades', () => {
    const FITMENT_CLASSES = ['shitbox', 'common', 'uncommon', 'rare'] as const
    const nonZonePanelParts = PARTS.filter((p) => p.zoneId === undefined)
    for (const carPartId of DERIVED_BODY_PART_IDS) {
      for (const fitmentClass of FITMENT_CLASSES) {
        const atClass = nonZonePanelParts.filter(
          (p) => p.carPartId === carPartId && p.fitmentClass === fitmentClass,
        )
        expect(
          atClass.map((p) => p.grade),
          `${carPartId}/${fitmentClass} should carry exactly one stock SKU and nothing else`,
        ).toEqual(['stock'])
      }
    }
  })

  /**
   * `aero` is the widened "aero and body kit" family: its own three
   * original aftermarket grades PLUS the six migrated panel/underbody kits
   * (two per grade) now address it too, so each non-stock grade carries 3
   * SKUs per fitment class instead of 1 - the stock grade is still exactly
   * 1.
   */
  it('the widened aero slot carries 3 SKUs per non-stock grade (the original plus two migrated kits), 1 stock', () => {
    const FITMENT_CLASSES = ['shitbox', 'common', 'uncommon', 'rare'] as const
    const nonZonePanelParts = PARTS.filter((p) => p.zoneId === undefined)
    for (const fitmentClass of FITMENT_CLASSES) {
      const stockCandidates = nonZonePanelParts.filter(
        (p) => p.carPartId === 'aero' && p.fitmentClass === fitmentClass && p.grade === 'stock',
      )
      expect(stockCandidates.length, `aero/${fitmentClass}/stock`).toBe(1)
      for (const grade of ['street', 'sport', 'race'] as const) {
        const candidates = nonZonePanelParts.filter(
          (p) => p.carPartId === 'aero' && p.fitmentClass === fitmentClass && p.grade === grade,
        )
        expect(candidates.length, `aero/${fitmentClass}/${grade}`).toBe(3)
      }
    }
  })

  /**
   * Zone panels are additional stock-grade `panels` SKUs, one per (zone x
   * fitment class), on top of the matrix above. The retired paint finishes
   * (12 entries) are gone outright; the six migrated kits changed slot and
   * name in place without changing the catalog's total count, so the whole
   * catalog is the base 29 x 16 = 464, minus the 12 retired paint SKUs, plus
   * the 5 x 4 = 20 zone panels = 472.
   */
  it('the catalog carries exactly 20 zone-panel SKUs - 5 zones x 4 fitment classes - and 472 entries total', () => {
    const FITMENT_CLASSES = ['shitbox', 'common', 'uncommon', 'rare'] as const
    const zonePanelParts = PARTS.filter((p) => p.zoneId !== undefined)
    expect(zonePanelParts.length).toBe(20)
    expect(PARTS.length).toBe(472)
    for (const part of zonePanelParts) {
      expect(part.carPartId).toBe('panels')
      expect(part.grade).toBe('stock')
      expect(part.priceBasisPartId).toBe('zonePanel')
    }
    const zoneIds = ['bonnet', 'boot', 'left', 'right', 'roof'] as const
    for (const zoneId of zoneIds) {
      for (const fitmentClass of FITMENT_CLASSES) {
        const candidates = zonePanelParts.filter(
          (p) => p.zoneId === zoneId && p.fitmentClass === fitmentClass,
        )
        expect(
          candidates.length,
          `expected exactly 1 zone-panel SKU for ${zoneId}/${fitmentClass}, found ${candidates.length}`,
        ).toBe(1)
      }
    }
  })

  /**
   * The diegetic class names never leak a raw fitment-class identifier back
   * at the player (mirrors the component-display-name law's own guard).
   */
  it('every fitment class has a real display name, never the raw identifier', () => {
    for (const fitmentClass of ['shitbox', 'common', 'uncommon', 'rare'] as const) {
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
