import { describe, expect, it } from 'vitest'
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
   * The 29-part taxonomy replaces hidden-issues.json (archived, not deleted
   * - the paused feature's data). The raw content has no price field -
   * `stockReplacementPriceYenByClass` is derived at content-load time
   * (data.ts) from the resolved parts catalog.
   */
  it('parts-taxonomy.json', () => {
    const result = CarPartTaxonomyContentSchema.safeParse(partsTaxonomy)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(29)
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
   * Each auction tier's venue-name pool (`docs/design/selling-rework.md`
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
  })

  it('economy.json', () => {
    const result = EconomyConfigSchema.safeParse(economy)
    if (!result.success) throw new Error(result.error.message)
    // Rent is a tuned knob (0.3x measured median weekly gross margin,
    // rounded to the nearest Y10,000 - see economy.ts's own doc comment for
    // the full derivation).
    expect(result.data.WEEKLY_RENT_YEN).toBe(20_000)
    // The daily fine for leaving a car in the grace/"double parking"
    // overflow slot.
    expect(result.data.DOUBLE_PARKING_FINE_YEN).toBe(8_000)
    expect(result.data.AUCTION_BUYOUT_PREMIUM).toBe(1.25)
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
    // The core-loop law's floor: every generated car must carry at least
    // this much below-expectation work, strictly under the ceiling above.
    expect(result.data.partsGeneration.minWorkBillFractionByTier).toEqual({
      shitbox: 0.1,
      common: 0.06,
      uncommon: 0.05,
      rare: 0.04,
    })
    for (const [tier, floorFraction] of Object.entries(
      result.data.partsGeneration.minWorkBillFractionByTier,
    )) {
      expect(
        floorFraction,
        `${tier} floor fraction must stay strictly under the maxBillFraction ceiling`,
      ).toBeLessThan(result.data.partsGeneration.maxBillFraction)
    }
    // Upkeep wear can only express in proportion to the car's own mileage -
    // a brand-new car is mint whoever owned it.
    expect(result.data.partsGeneration.wearExposureByMileageKm[0]).toEqual([0, 0])
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
    expect(result.data.selling.offerChanceByTier.shitbox).toBeGreaterThan(
      result.data.selling.offerChanceByTier.legend,
    )
    expect(result.data.selling.offerChanceByHeatBand.hot).toBeGreaterThan(
      result.data.selling.offerChanceByHeatBand.cold,
    )
    // economy-bible.md law 4: the floor must stay high enough that a bad
    // walk-in roll can no longer erase the worst-case flip margin the Law 2
    // generation guard still permits; the mean stays at/below 1.0 (the
    // no-free-lunch invariant) with tails narrow enough that a lucky roll
    // can't manufacture profit on an unimproved flip.
    expect(result.data.selling.offerSpread).toEqual([0.93, 1.05])
    // The five listing channels (directive 22 lever list). The shop front
    // is the deliberate worst-typical-outcome floor (tasteCeiling 1.00,
    // never above value); the trade network trades taste upside for a
    // fixed, near-value band; the tuner magazine and weekend meet are the
    // only two channels whose ceiling clears 1.0, both matched-persona-only.
    expect(result.data.reputation.matchedSaleRepBonus).toBe(1)
    expect(result.data.sellingChannels.shopFront).toEqual({
      feeYen: 0,
      offerChanceFactor: 0.7,
      tasteCeiling: 1.0,
    })
    expect(result.data.sellingChannels.freeAdsPaper).toEqual({
      feeYen: 1500,
      offerChanceFactorByTierClass: {
        shitbox: 1.5,
        common: 1.5,
        uncommon: 0.5,
        rare: 0.5,
        gaisha: 0.5,
        legend: 0.5,
      },
      tasteCeiling: 1.05,
    })
    expect(result.data.sellingChannels.tunerMagazine).toEqual({
      feeYen: 12_000,
      offerChanceFactor: 0.6,
      tasteCeiling: 1.17,
      matchedOnly: true,
    })
    expect(result.data.sellingChannels.tradeNetwork).toEqual({
      feeYen: 0,
      offerChanceFactor: 3.0,
      priceBand: { min: 0.95, max: 1.02 },
    })
    expect(result.data.sellingChannels.weekendMeet).toEqual({
      feeYen: 3000,
      oneDrawNextEndDay: true,
      tasteCeiling: 1.17,
      matchedOnly: true,
    })
    // economy-bible.md law 4: the roster-coherence "brake pads vs car
    // price" cap - a content anchor, not a hardcoded check constant.
    expect(result.data.coherence.maxConsumablesShareOfBookValue).toBe(0.15)
    // Per-depth-class labour, replacing the old flat INSTALL_LABOR_SLOTS
    // constant everywhere.
    expect(result.data.teardown.usedPartSaleFraction).toBe(0.55)
    expect(result.data.teardown.donorBreakEvenBillRatio).toBe(0.45)
  })

  it('parses the Sprint 94 energy-bar knobs (the continuous daily labour bar)', () => {
    const result = EconomyConfigSchema.safeParse(economy)
    expect(result.success).toBe(true)
    if (!result.success) return
    // The x10 scale keeps every labour quantity an integer (no floats in sim).
    expect(result.data.energy.pointsPerLabour).toBe(10)
    // Day-1 pool = old PLAYER_BASE_LABOR_SLOTS (6) x pointsPerLabour.
    expect(result.data.energy.basePoolPoints).toBe(60)
    // Tier reduces a repair's per-grade cost, non-increasing up the tiers; tier 1
    // is exactly the old one-slot-per-grade (10 = 1 slot x pointsPerLabour).
    expect(result.data.energy.energyPerGradeByTier).toEqual({ 1: 10, 2: 6, 3: 4 })
    // Install cost = old teardown.installSlotsByClass {0,1,2} x pointsPerLabour.
    expect(result.data.energy.energyByClass).toEqual({
      surface: 0,
      'bolt-on': 10,
      buried: 20,
    })
    // Every physical action's labour figure lives in this one map; zero means
    // the action is free, a raised figure gates and spends. The two knowledge
    // actions carry the old one-labour cost (10) on their own keys.
    expect(result.data.energy.actionPoints).toEqual({
      removePart: 0,
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
      'WEEKLY_RENT_YEN',
      'DOUBLE_PARKING_FINE_YEN',
      'AUCTION_RESERVE_PRICE_FRACTION',
      'AUCTION_LOTS_PER_TIER',
      'AUCTION_DURATION_STANDARD_RANGE_DAYS',
      'AUCTION_DURATION_LONG_RANGE_DAYS',
      'AUCTION_DURATION_FLASH_DAYS',
      'AUCTION_FLASH_CHANCE',
      'AUCTION_LONG_CHANCE_UNCOMMON_RARE',
      'AUCTION_TRAVEL_FEE_YEN',
      'AUCTION_BUYOUT_PREMIUM',
      'AUCTION_WHOLESALE_FRACTION',
      'AUCTION_DAILY_SPAWN_RATE',
      'AUCTION_MIN_AGE_YEARS',
      'auction',
      'restoration',
      'valuation',
      'marketPressure',
      'statFormulas',
      'bands',
      'partsGeneration',
      'reputation',
      'serviceJobs',
      'selling',
      'sellingChannels',
      'toolCeilings',
      'repairBandCeilingByTier',
      'specialty',
      'machineListings',
      'coherence',
      'teardown',
      'energy',
      'machineShopAssist',
      'diagnosis',
      'auctionRoom',
      'lapModel',
      'staff',
      'auctionGrading',
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
    expect(result.data.auctionRoom.reserveFraction).toBe(0.55)
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
  it('buyer want-lines match the sprint114.md authored copy exactly', () => {
    const wantLineById = Object.fromEntries(
      BuyersSchema.parse(buyers).map((b) => [b.id, b.wantLine]),
    )
    expect(wantLineById).toEqual({
      collector:
        'Asks who owned it before you, and who before that. Originality is the price of entry; everything else is small talk.',
      tuner: 'Wants the numbers, not the story. Power pays; provenance is for other people.',
      stancer: 'Crouches at the arches before saying hello. If it sits right, the rest is detail.',
      racer: 'Checks where the weight sits and how it turns in. Paint does not lap.',
      'first-timer':
        'Needs it to start every cold morning without eating the budget. A service history beats a spoiler.',
    })
  })

  it('parts-taxonomy ids cover exactly the 29 real parts, no duplicates', () => {
    const ids = CarPartTaxonomyContentSchema.parse(partsTaxonomy).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(29)
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

  it('the minimum-work floor stays strictly under the max-bill ceiling for every fitment class', () => {
    // The floor top-up runs under the same Law 2 ceiling guard, so a floor
    // fraction at or above the ceiling would make the guarantee unreachable -
    // a bug, not a tuning choice, so the schema refuses it.
    const bad = {
      ...economy,
      partsGeneration: {
        ...economy.partsGeneration,
        minWorkBillFractionByTier: {
          ...economy.partsGeneration.minWorkBillFractionByTier,
          shitbox: economy.partsGeneration.maxBillFraction,
        },
      },
    }
    expect(EconomyConfigSchema.safeParse(bad).success).toBe(false)
  })
})
