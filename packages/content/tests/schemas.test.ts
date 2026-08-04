import { describe, expect, it } from 'vitest'
import auctionTierCopy from '../data/auctionTierCopy.json'
import buyers from '../data/buyers.json'
import cars from '../data/cars.json'
import componentDisplayNames from '../data/componentDisplayNames.json'
import economy from '../data/economy.json'
import facilities from '../data/facilities.json'
import partPricing from '../data/partPricing.json'
import parts from '../data/parts.json'
import partsTaxonomy from '../data/parts-taxonomy.json'
import provenance from '../data/provenance.json'
import toolLines from '../data/toolLines.json'
import traits from '../data/traits.json'
import venueNames from '../data/venueNames.json'
import {
  AgeBandSchema,
  AuctionTierCopySchema,
  BuyersSchema,
  CarModelsSchema,
  CarPartTaxonomyContentSchema,
  ComponentDisplayNamesSchema,
  ComponentIdSchema,
  EconomyConfigSchema,
  FacilitiesSchema,
  PartCatalogEntriesSchema,
  PartPricingSheetSchema,
  ProvenancePoolSchema,
  ToolLinesSchema,
  TraitDefinitionsSchema,
  TraitIdSchema,
  UpkeepTierSchema,
  VenueNamesSchema,
} from '../src'

describe('seed content validates against schemas', () => {
  it('cars.json', () => {
    const result = CarModelsSchema.safeParse(cars)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('a measured performance figure is refused when its slower half is missing', () => {
    // Two readings at two speeds are what separate two unknowns: mechanical
    // grip from downforce, launch traction from power. The FASTER reading alone
    // is not partial data, it is unusable data that reads as complete, so the
    // schema refuses it rather than trusting the JSON.
    //
    // The slower reading alone is a different case, and only for braking and
    // acceleration: a car too slow to reach the higher test speed publishes one
    // figure honestly, and the model has a one-measurement path that spends it.
    // The lateral pair has no such path and stays indivisible.
    const measured = CarModelsSchema.parse(cars).find(
      (model) =>
        model.spec.lateralG193 !== undefined &&
        model.spec.braking161To0M !== undefined &&
        model.spec.zeroTo161S !== undefined,
    )
    expect(measured).toBeDefined()
    expect(CarModelsSchema.safeParse([measured]).success).toBe(true)

    const without = (field: string) => ({
      ...measured!,
      spec: { ...measured!.spec, [field]: undefined },
    })
    for (const half of ['lateralG97', 'lateralG193', 'braking97To0M', 'zeroTo97S'] as const) {
      expect(CarModelsSchema.safeParse([without(half)]).success, `${half} dropped`).toBe(false)
    }
    for (const half of ['braking161To0M', 'zeroTo161S'] as const) {
      expect(CarModelsSchema.safeParse([without(half)]).success, `${half} dropped`).toBe(true)
    }
  })

  /** The raw catalog is identity-only, no `priceYen` - that's resolved at
   * content-load time (data.ts) from `partPricing.json`. */
  it('parts.json', () => {
    const result = PartCatalogEntriesSchema.safeParse(parts)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  /** The centralised pricing sheet every SKU's price resolves from. */
  it('partPricing.json', () => {
    const result = PartPricingSheetSchema.safeParse(partPricing)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.overrides).toEqual({})
  })

  it('buyers.json', () => {
    const result = BuyersSchema.safeParse(buyers)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
  })

  /**
   * The 28-part taxonomy replaces hidden-issues.json (archived, not deleted
   * - the paused feature's data). The raw content has no price field -
   * `stockReplacementPriceYenByClass` is derived at content-load time
   * (data.ts) from the resolved parts catalog.
   */
  it('parts-taxonomy.json', () => {
    const result = CarPartTaxonomyContentSchema.safeParse(partsTaxonomy)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(28)
  })

  it('traits.json', () => {
    const result = TraitDefinitionsSchema.safeParse(traits)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBeGreaterThan(0)
    // Exactly the TraitIdSchema union, no orphaned id on either side - a
    // trait missing its content entry would resolve to blank name/copy at
    // the Staff Office (staffStore.ts's own `?? ''` fallback).
    expect(result.data.map((t) => t.id).sort()).toEqual([...TraitIdSchema.options].sort())
  })

  /** The six always-owned tool lines replace equipment.json. */
  it('toolLines.json', () => {
    const result = ToolLinesSchema.safeParse(toolLines)
    if (!result.success) throw new Error(result.error.message)
    // Exactly the 6 ComponentIds as keys.
    expect(Object.keys(result.data).sort()).toEqual([...ComponentIdSchema.options].sort())
    for (const id of ComponentIdSchema.options) {
      const line = result.data[id]
      // Exactly 3 tiers per line.
      expect(line.tiers).toHaveLength(3)
      // Tier 1 is owned from the start - price 0.
      expect(line.tiers[0]!.upgradePriceYen).toBe(0)
      // Upgrade prices strictly ascend within the line.
      expect(line.tiers[1]!.upgradePriceYen).toBeGreaterThan(line.tiers[0]!.upgradePriceYen)
      expect(line.tiers[2]!.upgradePriceYen).toBeGreaterThan(line.tiers[1]!.upgradePriceYen)
    }
  })

  /**
   * The raw camelCase ComponentId must never reach player copy - this map
   * is the fix, so it must cover every real component and never contain a
   * camelCase token itself (a display name that's just the id back again
   * would defeat the whole point).
   */
  it('componentDisplayNames.json', () => {
    const result = ComponentDisplayNamesSchema.safeParse(componentDisplayNames)
    if (!result.success) throw new Error(result.error.message)
    for (const id of ComponentIdSchema.options) {
      const label = result.data[id]
      expect(label, `${id} has no display name`).toBeTruthy()
      expect(label, `${id}'s display name "${label}" is a raw camelCase token`).not.toMatch(
        /[a-z][A-Z]/,
      )
    }
    // The schema's own key set is exactly the 6 real groups - no dead
    // legacy entries (`brakes`, `forcedInduction`) survive.
    expect(Object.keys(result.data).sort()).toEqual([...ComponentIdSchema.options].sort())
  })

  /**
   * Every `(ageBand, upkeepTier)` cell must carry at least 2 lines for real
   * variety, checked explicitly per cell rather than trusting the schema's
   * own `.min(2)` alone.
   */
  it('provenance.json', () => {
    const result = ProvenancePoolSchema.safeParse(provenance)
    if (!result.success) throw new Error(result.error.message)
    for (const ageBand of AgeBandSchema.options) {
      for (const upkeepTier of UpkeepTierSchema.options) {
        const lines = result.data[ageBand]?.[upkeepTier]
        expect(lines, `${ageBand}/${upkeepTier} has no line pool`).toBeTruthy()
        expect(
          lines!.length,
          `${ageBand}/${upkeepTier} has fewer than 2 lines`,
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })

  /**
   * Each auction tier's venue-name pool (`docs/design/systems/selling-rework.md`
   * section 4) - authored copy, ten names per tier, checked explicitly per
   * tier rather than trusting the schema's own `.min(1)` alone.
   */
  it('venueNames.json', () => {
    const result = VenueNamesSchema.safeParse(venueNames)
    if (!result.success) throw new Error(result.error.message)
    for (const tier of ['local-yard', 'regional', 'premium', 'collector-network'] as const) {
      expect(result.data[tier], `${tier} has no venue-name pool`).toBeTruthy()
      expect(result.data[tier].length, `${tier} does not have exactly 10 names`).toBe(10)
    }
  })

  /**
   * The three locked-tier guarantor lines - pinned verbatim so a future edit
   * can never silently drift from the approved copy.
   */
  it('auctionTierCopy.json (Sprint 115, verbatim)', () => {
    const result = AuctionTierCopySchema.safeParse(auctionTierCopy)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.regional).toBe(
      'Members only. Somebody has to vouch for you, and nobody does. Yet.',
    )
    expect(result.data.premium).toBe(
      "The book at the door is full of names. Yours needs a sponsor's beside it.",
    )
    expect(result.data['collector-network']).toBe(
      'Invitation only, and invitations start with a name they trust. No one is offering yours.',
    )
  })

  it('facilities.json', () => {
    const result = FacilitiesSchema.safeParse(facilities)
    if (!result.success) throw new Error(result.error.message)
    // minReputationTier must line up one-for-one with bayPricesYen for
    // every bay kind - the schema's own refine already enforces this at
    // parse time; this just names the invariant for anyone reading the test.
    expect(result.data.service.minReputationTier.length).toBe(
      result.data.service.bayPricesYen.length,
    )
    expect(result.data.parking.minReputationTier.length).toBe(
      result.data.parking.bayPricesYen.length,
    )
    expect(result.data.forecourt.minReputationTier.length).toBe(
      result.data.forecourt.bayPricesYen.length,
    )
  })

  it('economy.json', () => {
    const result = EconomyConfigSchema.safeParse(economy)
    if (!result.success) throw new Error(result.error.message)
    // Rent is base + a per-bay rate per kind (sprint148.md), replacing the
    // old flat WEEKLY_RENT_YEN - sized so day 1 is unchanged at 20,000.
    expect(result.data.rent).toEqual({
      baseWeeklyYen: 6_000,
      perBayWeeklyYen: { service: 5_000, parking: 2_000, forecourt: 1_500 },
    })
    // The daily fine for leaving a car in the grace/"double parking"
    // overflow slot.
    expect(result.data.DOUBLE_PARKING_FINE_YEN).toBe(8_000)
    expect(result.data.AUCTION_BUYOUT_PREMIUM).toBe(1.0)
    // Derived from real roster medians, not asserted - see
    // STARTING_CASH_YEN's own schema doc comment.
    expect(result.data.STARTING_CASH_YEN).toBe(300_000)
    // The reserve is a pure seller floor, not the price-setter - see
    // AUCTION_RESERVE_PRICE_FRACTION's own doc comment.
    expect(result.data.AUCTION_RESERVE_PRICE_FRACTION).toBe(0.6)
    // Auction-close + rival-contest knobs. Rivals now price near guide
    // value instead of wholesale, so a contested close converges on fair
    // value.
    expect(result.data.AUCTION_WHOLESALE_FRACTION).toBe(0.97)
    // Daily arrivals knobs: rates above 1 mean a guaranteed lot plus a
    // fractional chance.
    expect(result.data.AUCTION_DAILY_SPAWN_RATE['local-yard']).toBe(1.3)
    // No current-model-year car at a backyard auction.
    expect(result.data.AUCTION_MIN_AGE_YEARS).toBe(3)
    // The lot-generation turnout roll weights live directly under `auction`.
    expect(result.data.auction.turnoutBandWeights).toEqual([0.2, 0.45, 0.35])
    // Each room's own opening hours (sprint150.md), replacing the retired
    // single global auction day. Signed as tabled; `calendar.test.ts` (sim)
    // proves what these produce.
    expect(result.data.auction.cadenceByTier).toEqual({
      'local-yard': { openDaysOfWeek: [1, 3, 5, 7], weeksBetween: 1 },
      regional: { openDaysOfWeek: [2, 4], weeksBetween: 1 },
      premium: { openDaysOfWeek: [6], weeksBetween: 1 },
      'collector-network': { openDaysOfWeek: [6, 7], weeksBetween: 2 },
    })
    // The two blocks validate independently, so the bound that ties them
    // together lives here rather than in a cross-block Zod refine.
    for (const cadence of Object.values(result.data.auction.cadenceByTier)) {
      for (const day of cadence.openDaysOfWeek) {
        expect(day).toBeGreaterThanOrEqual(1)
        expect(day).toBeLessThanOrEqual(result.data.calendar.daysPerWeek)
      }
    }
    expect(result.data.valuation.tasteSpread).toBe(0.12)
    // Mileage curve inside clean value - car age no longer factors into
    // value at all, only mileage does.
    expect(result.data.valuation.mileageFactorCurve[1]).toEqual([60000, 1.0])
    // economy-bible.md law 1: ONE slope, always above 1, plus the same
    // small scrap-value backstop floor (bands.scrapValueFraction,
    // unchanged). economy-bible.md law 6 (the wage law): this number IS the
    // entire return on a repair (cost and bill reduction are the same
    // product), and it is jointly constrained with maxBillFraction below -
    // their product must stay under 1 or the scrap floor binds. Asserted
    // together, deliberately.
    expect(result.data.valuation.marketRepairDiscount).toBe(1.3)
    expect(
      result.data.valuation.marketRepairDiscount * result.data.partsGeneration.maxBillFraction,
    ).toBeLessThan(1)
    expect(result.data.valuation.walkAwaySpread).toBe(0.05)
    // economy-bible.md law 5 (the foundation law): the aftermarket premium
    // is scaled by the worst foundational part's factor. Foundational parts
    // are safety/structure; the factor table is monotonic and capped at 1
    // (the schema enforces both), withholding premium for a bad foundation
    // and never inflating it.
    expect(result.data.valuation.foundation.parts).toContain('brakePadsDiscs')
    expect(result.data.valuation.foundation.factorByState.scrap).toBe(0.15)
    expect(result.data.valuation.foundation.factorByState.worn).toBe(1.0)
    // economy-bible.md law 2: the generation-time bill-vs-clean-value
    // ceiling every generated car is softened to satisfy - the other half
    // of the wage law's (D, F) pair (see marketRepairDiscount above).
    expect(result.data.partsGeneration.maxBillFraction).toBe(0.6)
    // What happened to a generated car: the five care profiles a culture and
    // tier select between, and what the rolled history buys in band steps.
    // Not a per-venue table and no longer a roster-wide one either - the
    // gradient across rooms emerges from `auction.carTierWeightsByAuctionTier`
    // and the roster-wide mix from the 94 authored cultures.
    expect(result.data.partsGeneration.damageGrades.careProfiles).toEqual({
      cherished: { tidy: 70, used: 25, rough: 5, project: 0 },
      enthusiast: { tidy: 50, used: 35, rough: 13, project: 2 },
      mixed: { tidy: 45, used: 35, rough: 15, project: 5 },
      hammered: { tidy: 25, used: 35, rough: 30, project: 10 },
      worked: { tidy: 20, used: 35, rough: 33, project: 12 },
    })
    expect(result.data.partsGeneration.damageGrades.careProfileByCulture).toEqual({
      exotic: 'cherished',
      kyusha: 'cherished',
      wangan: 'enthusiast',
      touge: 'enthusiast',
      rotary: 'enthusiast',
      'touring-car': 'enthusiast',
      'front-drive-tuner': 'mixed',
      oddball: 'mixed',
      drift: 'hammered',
      'rally-bred': 'hammered',
      kurokan: 'hammered',
      'honest-transport': 'worked',
      kei: 'worked',
    })
    expect(result.data.partsGeneration.damageGrades.bandStepsByGrade).toEqual({
      tidy: 5,
      used: 12,
      rough: 26,
      project: 48,
    })
    // The history is also the upkeep tier: it is derived here, never rolled
    // beside the history, so how a car was treated and how rough it arrived
    // are one fact.
    expect(result.data.partsGeneration.damageGrades.upkeepTierByGrade).toEqual({
      tidy: 'cherished',
      used: 'average',
      rough: 'neglected',
      project: 'neglected',
    })
    // ...and it scales how likely each slot is to carry an aftermarket part.
    expect(result.data.partsGeneration.damageGrades.aftermarketChanceMultiplierByGrade).toEqual({
      tidy: 0.6,
      used: 1,
      rough: 1.6,
      project: 2,
    })
    // ...and it says which NAMED THINGS could have happened to a car that
    // arrived this rough (layer 3). The grade owns how much and the pattern
    // owns only where, so a tidy car mostly has no story and a project car
    // mostly has a shunt or a let-go engine.
    expect(result.data.partsGeneration.damageGrades.patternWeightsByGrade).toEqual({
      tidy: {
        garaged: 60,
        'neglected-commuter': 25,
        'frontal-collision': 6,
        drifted: 7,
        grenade: 2,
      },
      used: {
        garaged: 30,
        'neglected-commuter': 40,
        'frontal-collision': 12,
        drifted: 15,
        grenade: 3,
      },
      rough: {
        garaged: 8,
        'neglected-commuter': 34,
        'frontal-collision': 24,
        drifted: 26,
        grenade: 8,
      },
      project: {
        garaged: 2,
        'neglected-commuter': 20,
        'frontal-collision': 33,
        drifted: 25,
        grenade: 20,
      },
    })
    // How hard the pattern leans on the symptom draw. Deliberately short of 1:
    // a front-end car that turns out to have a tired gearbox is a real car, and
    // a diagnosis game whose answer is given away by the history is not a game.
    expect(result.data.partsGeneration.damageGrades.patternSymptomBias).toBe(0.6)
    // The age gate: a young, low-mileage car cannot roll the worst grade.
    expect(result.data.partsGeneration.damageGrades.projectGateMaxAgeYears).toBe(6)
    expect(result.data.partsGeneration.damageGrades.projectGateMaxMileageKm).toBe(60000)
    // The core-loop floor: every lot carries at least this many band steps of
    // work, so a `tidy` roll on a barely-driven car cannot scale to nothing.
    expect(result.data.partsGeneration.damageGrades.minWorkSteps).toBe(10)
    // Upkeep wear can only express in proportion to the car's own mileage -
    // a brand-new car is mint whoever owned it.
    expect(result.data.partsGeneration.wearExposureByMileageKm[0]).toEqual([0, 0])
    // The zone model's own generation weights: per-tier metal/finish severity
    // tables and the surface-bump chance.
    expect(result.data.partsGeneration.zoneStates.metalWeightsByTier).toEqual({
      entry: [20, 35, 30, 15],
      everyday: [40, 35, 20, 5],
      enthusiast: [55, 30, 12, 3],
      flagship: [65, 25, 8, 2],
    })
    expect(result.data.partsGeneration.zoneStates.finishWeightsByTier).toEqual({
      entry: [5, 25, 40, 30],
      everyday: [15, 40, 30, 15],
      enthusiast: [30, 40, 22, 8],
      flagship: [40, 38, 17, 5],
    })
    expect(result.data.partsGeneration.zoneStates.surfaceExtraChance).toBe(0.2)
    expect(result.data.restoration.repairStepFraction).toBe(0.1)
    expect(result.data.marketPressure.HEAT_MIN).toBe(70)
    expect(result.data.marketPressure.HEAT_MAX).toBe(140)
    expect(result.data.marketPressure.LEDGER_DECAY).toBe(0.75)
    expect(result.data.statFormulas.powerNormalizationCeiling).toBe(300)
    // The reputation ladder lives in content, calibrated against real play
    // rather than the ~1 rep/day probe bot.
    expect(result.data.reputation.tierThresholds).toEqual({
      unknown: 0,
      local: 60,
      known: 200,
      respected: 500,
      legend: 1400,
    })
    expect(result.data.reputation.cleanSaleMinBand).toBe('fine')
    expect(result.data.reputation.cleanSaleBonus).toBe(2)
    expect(result.data.reputation.concoursSaleMinAuthenticityPercent).toBe(85)
    expect(result.data.reputation.concoursSaleBonus).toBe(4)
    // The lemon penalty and its cost-weighted trigger bar live in content
    // (not sim constants). The penalty is sharp enough that one lemon sale
    // undoes several clean ones; the band-factor bar sits above poor's own
    // factor so an all-poor car reliably reads as a lemon.
    expect(result.data.reputation.lemonSalePenalty).toBe(8)
    expect(result.data.reputation.lemonMaxAverageBandFactor).toBe(0.45)

    expect(result.data.bands.bandFactors.mint).toBe(1.0)
    expect(result.data.bands.bandFactors.scrap).toBe(0.15)
    expect(result.data.bands.migrationThresholds.poor).toBe(15)
    expect(result.data.bands.scrapValueFraction).toBe(0.05)
    expect(result.data.selling.offerChanceBase).toBe(0.65)
    expect(result.data.selling.offerChanceByRarity.common).toBeGreaterThan(
      result.data.selling.offerChanceByRarity.legend,
    )
    expect(result.data.selling.offerChanceByHeatBand.hot).toBeGreaterThan(
      result.data.selling.offerChanceByHeatBand.cold,
    )
    // Stage F, the normalised listing clock (sale-value-system.md S4,
    // sprint147.md): both curves read offersSeen only, never a day count.
    expect(result.data.liquidity).toEqual({
      stalenessFloor: 0.35,
      stalenessHalfLifeOffers: 3.5,
      qualityFresh: 0.96,
      qualityFloor: 0.86,
      qualityHalfLifeOffers: 3.0,
      qualitySpread: 0.04,
      relistRecovery: 0.7,
    })
    // The six listing channels (directive 22 lever list). A channel is a
    // buyer base first: `buyerPoolWeights` decides who walks in and
    // `poolWidening` how far past the tier gate the channel reaches, and only
    // then does `tasteCeiling` decide how much headroom whoever arrived has.
    // The shop front is the deliberate floor on the price axis (ceiling 1.00,
    // never above value) and the widest on the reach axis (a flat pool, so
    // nobody is favoured, plus the widening that puts everyone in it); the
    // trade network trades both axes for a fixed, near-value band and has no
    // persona at all; the tuner magazine, weekend meet and collector network
    // are the three channels whose ceiling clears 1.0, all matched-persona-
    // only, and their pools each point at a different corner of the scene.
    expect(result.data.reputation.matchedSaleRepBonus).toBe(1)
    expect(result.data.sellingChannels.shopFront).toEqual({
      feeYen: 0,
      offerChanceFactor: 0.7,
      tasteCeiling: 1.0,
      buyerPoolWeights: {
        collector: 1,
        tuner: 1,
        'show-crowd': 1,
        racer: 1,
        'daily-drivers': 1,
        touge: 1,
      },
      poolWidening: 0.35,
      requiresForecourt: true,
    })
    expect(result.data.sellingChannels.freeAdsPaper).toEqual({
      feeYen: 1500,
      offerChanceFactorByRarity: {
        common: 1.5,
        uncommon: 0.5,
        rare: 0.5,
        legend: 0.5,
      },
      tasteCeiling: 1.05,
      buyerPoolWeights: {
        collector: 0.4,
        tuner: 0.7,
        'show-crowd': 0.5,
        racer: 0.2,
        'daily-drivers': 2.0,
        touge: 0.3,
      },
      poolWidening: 0.5,
      requiresForecourt: true,
    })
    expect(result.data.sellingChannels.tunerMagazine).toEqual({
      feeYen: 12_000,
      offerChanceFactor: 0.6,
      tasteCeiling: 1.17,
      matchedOnly: true,
      buyerPoolWeights: {
        collector: 0.2,
        tuner: 1.6,
        'show-crowd': 0.3,
        racer: 1.8,
        'daily-drivers': 0.05,
        touge: 1.4,
      },
      poolWidening: 0.25,
      requiresForecourt: true,
    })
    expect(result.data.sellingChannels.tradeNetwork).toEqual({
      feeYen: 0,
      offerChanceFactor: 3.0,
      priceBand: { min: 0.95, max: 1.02 },
      requiresForecourt: false,
    })
    expect(result.data.sellingChannels.weekendMeet).toEqual({
      feeYen: 3000,
      oneDrawNextEndDay: true,
      tasteCeiling: 1.17,
      matchedOnly: true,
      buyerPoolWeights: {
        collector: 0.3,
        tuner: 1.5,
        'show-crowd': 2.2,
        racer: 0.4,
        'daily-drivers': 0.4,
        touge: 1.0,
      },
      poolWidening: 0.4,
      requiresForecourt: true,
    })
    expect(result.data.sellingChannels.collectorNetwork).toEqual({
      feeYen: 20_000,
      oneDrawNextEndDay: true,
      tasteCeiling: 1.2,
      matchedOnly: true,
      buyerPoolWeights: {
        collector: 3.0,
        tuner: 0.2,
        'show-crowd': 0.1,
        racer: 0.2,
        'daily-drivers': 0.05,
        touge: 0.1,
      },
      poolWidening: 0.3,
      requiresForecourt: true,
    })
    // Standing sharpens a channel's own pool rather than opening a door: the
    // exponent every `buyerPoolWeights` entry is raised to. Monotone up the
    // ladder, and exactly 1 at `unknown` so a new career draws the pool as
    // authored.
    expect(result.data.selling.channelStandingFocusByReputationTier).toEqual({
      unknown: 1,
      local: 1.2,
      known: 1.45,
      respected: 1.7,
      legend: 2,
    })
    // economy-bible.md law 4: the roster-coherence "brake pads vs car
    // price" cap - a content anchor, not a hardcoded check constant.
    expect(result.data.coherence.maxConsumablesShareOfBookValue).toBe(0.15)
    // Per-depth-class labour, replacing the old flat INSTALL_LABOR_SLOTS
    // constant everywhere.
    expect(result.data.teardown.usedPartSaleFraction).toBe(0.3)
    // The resale condition curve, deliberately steeper at the bottom than
    // `bands.bandFactors` - that gap is what pays for reconditioning a poor
    // part before it goes on the counter, and what stops it paying past worn.
    expect(result.data.teardown.resaleBandFactors).toEqual({
      mint: 1,
      fine: 0.75,
      worn: 0.55,
      poor: 0.1,
    })
    expect(result.data.teardown.donorBreakEvenBillRatio).toBe(0.45)
  })

  it('parses the Sprint 94 energy-bar knobs (the continuous daily labour bar)', () => {
    const result = EconomyConfigSchema.safeParse(economy)
    expect(result.success).toBe(true)
    if (!result.success) return
    // The x10 scale keeps every labour quantity an integer (no floats in sim).
    expect(result.data.energy.pointsPerLabour).toBe(10)
    // The day's pool, raised from 6 labour slots to 8 because a day ran out
    // too soon to finish anything satisfying. Every labour COST is untouched.
    expect(result.data.energy.basePoolPoints).toBe(80)
    // Tier reduces a repair's per-band-step cost, non-increasing up the tiers.
    // The labour retune (case (a), an intentional cost change, not a stale
    // expectation) sets tier 1/2/3 to 5/4/3.
    expect(result.data.energy.energyPerBandStepByToolTier).toEqual({ 1: 5, 2: 4, 3: 3 })
    // Fitting energy by depth class, also retuned: the common bolt-on anchor
    // drops to 3 and buried scales with it to 6.
    expect(result.data.energy.energyByClass).toEqual({
      surface: 0,
      'bolt-on': 3,
      buried: 6,
    })
    // Every physical action's labour figure lives in this one map; zero means
    // the action is free, a raised figure gates and spends. The two knowledge
    // actions carry the old one-labour cost (10) on their own keys. Pulling a
    // part costs 2 points, so stripping a whole car sits comfortably inside a
    // solo day's pool (80) and price is no longer the only brake on a teardown.
    expect(result.data.energy.actionPoints).toEqual({
      removePart: 2,
      removeAssembly: 0,
      refitAssembly: 0,
      refitUnchangedMember: 0,
      benchFitMember: 0,
      benchRemoveMember: 0,
      benchBuildAssembly: 0,
      moveCar: 0,
      scrapShell: 0,
      scrapPart: 0,
      workup: 10,
      inspectionVisit: 10,
    })
  })

  /**
   * economy-bible.md law 4 (one derived ledger, machine-checked): every
   * top-level `economy.json` group is a hand-authored anchor, listed in the
   * bible's Anchor Inventory section. This is the machine half of that
   * claim - a new top-level field added here without updating the bible's
   * table (or this list) fails loudly instead of silently drifting, exactly
   * the "if two prices drifted apart, would a test catch it" litmus the law
   * itself poses.
   */
  it('economy.json top-level anchors match the bible audit table', () => {
    const expectedTopLevelKeys = [
      'STARTING_CASH_YEN',
      'calendar',
      'rent',
      'DOUBLE_PARKING_FINE_YEN',
      'AUCTION_RESERVE_PRICE_FRACTION',
      'AUCTION_LOTS_PER_TIER',
      'AUCTION_DURATION_STANDARD_RANGE_DAYS',
      'AUCTION_DURATION_LONG_RANGE_DAYS',
      'AUCTION_DURATION_FLASH_DAYS',
      'AUCTION_FLASH_CHANCE',
      'AUCTION_LONG_CHANCE_UNCOMMON_RARE',
      'AUCTION_BUYOUT_PREMIUM',
      'AUCTION_WHOLESALE_FRACTION',
      'AUCTION_DAILY_SPAWN_RATE',
      'AUCTION_MIN_AGE_YEARS',
      'auction',
      'restoration',
      'valuation',
      'marketPressure',
      'statFormulas',
      'supportReadout',
      'bands',
      'partsGeneration',
      'reputation',
      'serviceJobs',
      'selling',
      'liquidity',
      'sellingChannels',
      'toolCeilings',
      'repairBandCeilingByTier',
      'specialty',
      'machineListings',
      'coherence',
      'teardown',
      'energy',
      'machineShopAssist',
      'dyno',
      'machining',
      'diagnosis',
      'auctionRoom',
      'staff',
      'auctionGrading',
      'cafe',
    ].sort()
    expect(Object.keys(economy).sort()).toEqual(expectedTopLevelKeys)
  })

  /**
   * The live auction room's tuning (`packages/game/src/screens/
   * auctionRoom.ts`), generalised out of the auction room demo - every value
   * mirrors the demo's own former ROOM_TUNING constant exactly, so the
   * demo's pinned test values hold unmoved. `steady` is the one genuinely new
   * band, sized between `thin` and `packed` for the real board's three
   * turnouts.
   */
  it('parses the auctionRoom block (the live room tuning, generalised out of the demo)', () => {
    const result = EconomyConfigSchema.safeParse(economy)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.auctionRoom.clockMs).toBe(5000)
    // The room's opening bid is NOT authored in this block. It is the one
    // seller's floor, AUCTION_RESERVE_PRICE_FRACTION, folded in by
    // `auctionRoom.ts`'s `roomConfigFrom` - the retired room-local copy held
    // a second, disagreeing 0.55 (sprint150.md: one reserve everywhere).
    expect('reserveFraction' in result.data.auctionRoom).toBe(false)
    // Every tier ships at zero: the mechanic charges nothing until a tier's
    // price moves off zero.
    expect(result.data.auctionRoom.attendanceFeeYenByTier).toEqual({
      'local-yard': 0,
      regional: 0,
      premium: 0,
      'collector-network': 0,
    })
    expect(result.data.auctionRoom.bidDelayMs).toEqual({ min: 800, max: 4600 })
    expect(result.data.auctionRoom.bargainChance).toBe(0.05)
    expect(result.data.auctionRoom.stepThresholdYen).toBe(500_000)
    expect(result.data.auctionRoom.stepBelowYen).toBe(5_000)
    expect(result.data.auctionRoom.stepAboveYen).toBe(10_000)
    expect(result.data.auctionRoom.playerRaiseOptionsRungs).toEqual([1, 4, 8])
    expect(result.data.auctionRoom.turnout.thin).toEqual({
      dealers: 2,
      clearMin: 0.7,
      clearMax: 0.85,
    })
    expect(result.data.auctionRoom.turnout.steady).toEqual({
      dealers: 4,
      clearMin: 0.72,
      clearMax: 0.9,
    })
    expect(result.data.auctionRoom.turnout.packed).toEqual({
      dealers: 6,
      clearMin: 0.75,
      clearMax: 0.95,
    })
    expect(result.data.auctionRoom.reactions).toEqual({
      jumpRungs: 4,
      scareChance: 0.15,
      scareLeftRungs: 2,
      callChance: 0.12,
      callRungs: 3,
      goadChance: 0.03,
      goadMaxLift: 1.06,
      snipeWindowMs: 800,
      snipesBeforeTax: 2,
      snipeTaxChance: 0.15,
      snipeTaxRungs: 2,
      feudChance: 0.08,
      feudMinGapRungs: 6,
      feudRungs: 4,
      feudDelayMs: { min: 400, max: 1100 },
      spiteChance: 0.35,
      spiteMaxRungs: 1,
    })
  })

  /**
   * The auction card's overall-grade ratio ladder (`computeAuctionGrade`,
   * sim/auctionGrade.ts): a nonempty, ordered list of ratio/grade steps, none
   * naming 'R' (the mechanical-corpse override lives in code, never a ratio
   * outcome).
   */
  it('parses the auctionGrading block', () => {
    const result = EconomyConfigSchema.safeParse(economy)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.auctionGrading.overallRatioSteps.length).toBeGreaterThan(0)
    expect(result.data.auctionGrading.overallRatioSteps).toEqual([
      { maxRatio: 0.01, grade: 'S' },
      { maxRatio: 0.04, grade: '6' },
      { maxRatio: 0.08, grade: '5' },
      { maxRatio: 0.13, grade: '4.5' },
      { maxRatio: 0.19, grade: '4' },
      { maxRatio: 0.27, grade: '3.5' },
      { maxRatio: 0.38, grade: '3' },
      { maxRatio: 0.55, grade: '2' },
    ])
  })
})

describe('seed content ids are unique', () => {
  it('car ids', () => {
    const ids = CarModelsSchema.parse(cars).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('part ids', () => {
    const ids = PartCatalogEntriesSchema.parse(parts).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('buyer ids', () => {
    const ids = BuyersSchema.parse(buyers).map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * Each persona's want-line transplants byte-verbatim from the selling
   * rework's authored copy. Pinned literally, not merely checked non-empty,
   * since this is orchestrator-personal copy.
   */
  it('buyer want-lines match the sprint114.md authored copy exactly (ids renamed, copy unmoved)', () => {
    const SPRINT_114_ARCHETYPES = new Set([
      'collector',
      'tuner',
      'show-crowd',
      'racer',
      'daily-drivers',
    ])
    const wantLineById = Object.fromEntries(
      BuyersSchema.parse(buyers)
        .filter((b) => SPRINT_114_ARCHETYPES.has(b.id))
        .map((b) => [b.id, b.wantLine]),
    )
    expect(wantLineById).toEqual({
      collector:
        'Asks who owned it before you, and who before that. Originality is the price of entry; everything else is small talk.',
      tuner: 'Wants the numbers, not the story. Power pays; provenance is for other people.',
      'show-crowd':
        'Crouches at the arches before saying hello. If it sits right, the rest is detail.',
      racer: 'Checks where the weight sits and how it turns in. Paint does not lap.',
      'daily-drivers':
        'Needs it to start every cold morning without eating the budget. A service history beats a spoiler.',
    })
  })

  /**
   * Touge's want-line is fresh copy authored for its own archetype, pinned
   * separately from the sprint114.md transplant above rather than folded
   * into it - the same treatment the deleted hobbyist archetype's want-line
   * once had.
   */
  it('the Touge want-line matches its authored copy exactly', () => {
    const touge = BuyersSchema.parse(buyers).find((b) => b.id === 'touge')
    expect(touge?.wantLine).toBe(
      "Wants to know how it turns in, not how fast it leaves a corner. A car that won't commit to the apex is no good on the pass.",
    )
  })

  it('parts-taxonomy ids cover exactly the 28 real parts, no duplicates', () => {
    const ids = CarPartTaxonomyContentSchema.parse(partsTaxonomy).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(28)
  })

  it('the reputation ladder is strictly ascending and starts at zero (Sprint 69)', () => {
    // Structural, not a taste check: a ladder that goes down, or that a fresh
    // shop does not start at the bottom of, is a bug rather than a tuning
    // choice - so the schema refuses it rather than trusting the JSON.
    const bad = {
      ...economy,
      reputation: {
        ...economy.reputation,
        tierThresholds: { ...economy.reputation.tierThresholds, known: 10 },
      },
    }
    expect(EconomyConfigSchema.safeParse(bad).success).toBe(false)

    const ladder = EconomyConfigSchema.parse(economy).reputation.tierThresholds
    expect(ladder.unknown).toBe(0)
    expect(ladder.local).toBeLessThan(ladder.known)
    expect(ladder.known).toBeLessThan(ladder.respected)
    expect(ladder.respected).toBeLessThan(ladder.legend)
  })

  it('refuses a damage-grade ladder that does not rise from tidy to project', () => {
    // The four grades are one ordered scale of how rough a car is, so a
    // `rough` car buying fewer band steps than a `used` one is a typo, not a
    // tuning choice.
    const bad = {
      ...economy,
      partsGeneration: {
        ...economy.partsGeneration,
        damageGrades: {
          ...economy.partsGeneration.damageGrades,
          bandStepsByGrade: {
            ...economy.partsGeneration.damageGrades.bandStepsByGrade,
            rough: 0,
          },
        },
      },
    }
    expect(EconomyConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('refuses a care profile that can never roll anything', () => {
    // Every profile is checked, not only the table as a whole: a single dead
    // row would leave every car whose culture selects it with no history to
    // roll at all.
    const bad = {
      ...economy,
      partsGeneration: {
        ...economy.partsGeneration,
        damageGrades: {
          ...economy.partsGeneration.damageGrades,
          careProfiles: {
            ...economy.partsGeneration.damageGrades.careProfiles,
            hammered: { tidy: 0, used: 0, rough: 0, project: 0 },
          },
        },
      },
    }
    expect(EconomyConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('refuses a culture with no care profile at all', () => {
    const withoutDrift = { ...economy.partsGeneration.damageGrades.careProfileByCulture }
    delete (withoutDrift as Record<string, unknown>).drift
    const bad = {
      ...economy,
      partsGeneration: {
        ...economy.partsGeneration,
        damageGrades: {
          ...economy.partsGeneration.damageGrades,
          careProfileByCulture: withoutDrift,
        },
      },
    }
    expect(EconomyConfigSchema.safeParse(bad).success).toBe(false)
  })
})
