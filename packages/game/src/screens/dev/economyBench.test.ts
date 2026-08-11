import {
  BUYERS,
  BuyerArchetypeSchema,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  StatKeySchema,
  TOOL_LINES,
  type AuctionLot,
  type CarModel,
  type GameState,
  type SceneStanding,
  type SellingChannelId,
} from '@midnight-garage/content'
import {
  buildSimContext,
  carLedgerFor,
  channelArrivalOddsFor,
  channelBuyerTaste,
  channelPriceBandRangeFor,
  computeDerivedStats,
  createInitialGameState,
  currentGameYear,
  foundationWithheldYen,
  generatedYearRangeFor,
  isEndOfWeek,
  lapBlockers,
  marketValueYen,
  moveCar,
  realisedProfitYen,
  resolveBuyoutInstant,
  valuateCarForBuyer,
  valuateCarForBuyerViaChannel,
  valueLedgerFor,
  type SimContext,
} from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import {
  BENCH_CAR_ID,
  benchCarInstance,
  benchGameState,
  benchYearRange,
  carSpecFrom,
  defaultCarSpec,
  defaultMileageKm,
  defaultShopSpec,
  generatedBenchCar,
  skusForSlot,
  type BenchShopSpec,
} from './economyBench'
import {
  acquisitionPanelFor,
  bandPricedChannelsFor,
  buyerRowsFor,
  channelPricePanelFor,
  channelRowsFor,
  costSheetFor,
  mileageNoteFor,
  openingBlockFor,
  pendingOfferFor,
  statsPanelFor,
} from './economyBenchReadout'
import { runBenchAction } from './economyBenchActions'
import { benchPreviewFor, buildDeltaFor, ledgerDiffRows } from './economyBenchPreview'
import { evaluateCarInstance } from './sandboxModel'
import { formatYen } from '../../utils/formatYen'

const context: SimContext = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  TOOL_LINES,
  ECONOMY,
)

const model: CarModel = context.models[0]!
const modelName = (id: string): string => context.modelsById[id]?.displayName ?? id
const partName = (id: string): string => context.partsById[id]?.name ?? id

function heat(state: GameState, car: { modelId: string }): number {
  return state.marketHeat[car.modelId] ?? 100
}

/**
 * The car built the NORMAL way: a real auction lot bought out through
 * `resolveBuyoutInstant`, then moved into a service bay - the exact sequence a
 * player's own car goes through. Given a large enough float that the buyout
 * cannot refuse for want of cash, since the point of the fixture is the shape
 * of the resulting state, not the till.
 */
function normallyAcquiredState(car: ReturnType<typeof generatedBenchCar>, day: number): GameState {
  const base = createInitialGameState(context, 194)
  const lot: AuctionLot = {
    id: 'guard-lot',
    tier: 'local-yard',
    modelId: car.modelId,
    car,
    bookValueYen: model.bookValueYen,
    expiresOnDay: day + 3,
    turnout: 'steady',
  }
  const seated: GameState = {
    ...base,
    day,
    cashYen: 100_000_000,
    activeAuctionLots: [lot],
  }
  const bought = resolveBuyoutInstant(seated, lot.id, context).state
  return moveCar(bought, car.id, 'service', context.economy).state
}

const shopSpec = defaultShopSpec(context)

describe('the economy bench state builder', () => {
  it('round-trips a real generated lot: read into a spec and rebuilt is the same car', () => {
    const generated = generatedBenchCar(model, 7, shopSpec, context)
    const rebuilt = benchCarInstance(carSpecFrom(generated), model, context)

    // `history` and `damagePattern` are provenance the bench spec does not
    // carry (a hand-built car genuinely has no rolled history), and part
    // instance ids are the bench's own. Nothing else may differ, and nothing
    // that reaches value is in that list.
    expect(rebuilt.mileageKm).toBe(generated.mileageKm)
    expect(rebuilt.factoryColour).toBe(generated.factoryColour)
    expect(rebuilt.zoneState).toEqual(generated.zoneState)
    expect(rebuilt.symptoms).toEqual(generated.symptoms)
    for (const partId of Object.keys(generated.parts) as (keyof typeof generated.parts)[]) {
      const before = generated.parts[partId].installed
      const after = rebuilt.parts[partId].installed
      expect(after?.partId ?? null).toBe(before?.partId ?? null)
      expect(after?.band ?? null).toBe(before?.band ?? null)
      expect(after?.machining ?? null).toEqual(before?.machining ?? null)
    }
  })

  it('THE GUARD: a bench-built car and a normally-built car produce identical figures', () => {
    const shop = defaultShopSpec(context)
    const generated = generatedBenchCar(model, 11, shop, context)

    const benchState = benchGameState(
      shop,
      benchCarInstance(carSpecFrom(generated), model, context),
      context,
    )
    const normalState = normallyAcquiredState(generated, shop.day)

    const benchCar = benchState.ownedCars.find((c) => c.id === BENCH_CAR_ID)!
    const normalCar = normalState.ownedCars.find((c) => c.id === generated.id)!

    const value = (state: GameState, car: typeof benchCar): number =>
      marketValueYen(
        model,
        car,
        heat(state, car),
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      )

    expect(value(benchState, benchCar)).toBe(value(normalState, normalCar))
    expect(
      valueLedgerFor(
        benchCar,
        model,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      ),
    ).toEqual(
      valueLedgerFor(
        normalCar,
        model,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      ),
    )
    expect(foundationWithheldYen(model, benchCar, context.partsById, context.economy)).toBe(
      foundationWithheldYen(model, normalCar, context.partsById, context.economy),
    )
    expect(
      computeDerivedStats(
        model,
        benchCar,
        context.partsById,
        context.partsTaxonomy,
        context.economy,
      ),
    ).toEqual(
      computeDerivedStats(
        model,
        normalCar,
        context.partsById,
        context.partsTaxonomy,
        context.economy,
      ),
    )
    // The performance side too: the five stats, the power score, the four lap
    // times and the blocker list, plus the two figures that decide whether the
    // build hangs together at all.
    expect(statsPanelFor(benchCar, model, context)).toEqual(
      statsPanelFor(normalCar, model, context),
    )
  })

  it('THE GUARD: the sale side agrees too, buyer for buyer and channel for channel', () => {
    const shop = defaultShopSpec(context)
    const generated = generatedBenchCar(model, 11, shop, context)
    const benchState = benchGameState(
      shop,
      benchCarInstance(carSpecFrom(generated), model, context),
      context,
    )
    const normalState = normallyAcquiredState(generated, shop.day)
    const benchCar = benchState.ownedCars.find((c) => c.id === BENCH_CAR_ID)!
    const normalCar = normalState.ownedCars.find((c) => c.id === generated.id)!

    // Every column of the buyer table: the taste score, the champion gate, the
    // outcome reputation reads, and the price. A buyer id is the only thing
    // these share with the car's own identity.
    expect(buyerRowsFor(benchCar, model, benchState, context)).toEqual(
      buyerRowsFor(normalCar, model, normalState, context),
    )
    // The channel rows carry the car's id into the listing lookup, so this is
    // the one readout that could have told the two cars apart.
    expect(channelRowsFor(benchCar, model, benchState, context)).toEqual(
      channelRowsFor(normalCar, model, normalState, context),
    )
    for (const channelId of Object.keys(context.economy.sellingChannels) as SellingChannelId[]) {
      expect(channelPricePanelFor(benchCar, model, channelId, benchState, context)).toEqual(
        channelPricePanelFor(normalCar, model, channelId, normalState, context),
      )
    }
    expect(bandPricedChannelsFor(benchCar, model, benchState, context)).toEqual(
      bandPricedChannelsFor(normalCar, model, normalState, context),
    )
    expect(acquisitionPanelFor(benchCar, model, benchState, context)).toEqual(
      acquisitionPanelFor(normalCar, model, normalState, context),
    )
  })

  it('THE GUARD: a hand-built car reads the same on the bench as it does in a bay', () => {
    // The generated lot proves the read-back seam. This proves the other half:
    // a car the bench itself assembled, seated the bench's way and the normal
    // way, prices identically - so nothing about hand-building a spec reaches a
    // figure either.
    const shop = defaultShopSpec(context)
    const hand = benchCarInstance(defaultCarSpec(model, shop, context), model, context)
    const benchState = benchGameState(shop, hand, context)
    const normalState = normallyAcquiredState(hand, shop.day)
    const benchCar = benchState.ownedCars.find((c) => c.id === BENCH_CAR_ID)!
    const normalCar = normalState.ownedCars.find((c) => c.id === hand.id)!

    expect(openingBlockFor(benchCar, model, benchState, context)).toEqual(
      openingBlockFor(normalCar, model, normalState, context),
    )
    expect(buyerRowsFor(benchCar, model, benchState, context)).toEqual(
      buyerRowsFor(normalCar, model, normalState, context),
    )
  })

  it('THE GUARD: the same repair on both states leaves the same car and the same price', () => {
    const shop = defaultShopSpec(context)
    const generated = generatedBenchCar(model, 11, shop, context)
    const benchState = benchGameState(
      shop,
      benchCarInstance(carSpecFrom(generated), model, context),
      context,
    )
    const normalState = normallyAcquiredState(generated, shop.day)

    const repair = { kind: 'repair', componentId: 'engine', targetBand: 'fine' } as const

    const benchAfter = runBenchAction(benchState, model, repair, context, partName, modelName).state
    // The normal path runs the SAME resolver through the same staged-work
    // machinery; only the car's id differs, so this is the bench's own
    // dispatcher pointed at the normally-acquired state.
    const normalAfter = runBenchAction(
      { ...normalState, ownedCars: normalState.ownedCars.map((c) => ({ ...c, id: BENCH_CAR_ID })) },
      model,
      repair,
      context,
      partName,
      modelName,
    ).state

    const benchCar = benchAfter.ownedCars.find((c) => c.id === BENCH_CAR_ID)!
    const normalCar = normalAfter.ownedCars.find((c) => c.id === BENCH_CAR_ID)!
    // Every field that reaches value. Part instance ids and the origin's day
    // stamp are identity and provenance: the bench re-stamps them when it
    // rebuilds a car from a spec, and neither is read by any price.
    for (const partId of Object.keys(benchCar.parts) as (keyof typeof benchCar.parts)[]) {
      const bench = benchCar.parts[partId].installed
      const normal = normalCar.parts[partId].installed
      expect(bench?.partId ?? null).toBe(normal?.partId ?? null)
      expect(bench?.band ?? null).toBe(normal?.band ?? null)
      expect(bench?.machining ?? null).toEqual(normal?.machining ?? null)
    }
    expect(benchCar.zoneState).toEqual(normalCar.zoneState)
    expect(
      marketValueYen(
        model,
        benchCar,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      ),
    ).toBe(
      marketValueYen(
        model,
        normalCar,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      ),
    )
  })

  it('seats the bench car in a service bay, so work is not refused for want of one', () => {
    const spec = defaultCarSpec(model, shopSpec, context)
    const state = benchGameState(
      defaultShopSpec(context),
      benchCarInstance(spec, model, context),
      context,
    )
    expect(state.serviceBayCarIds).toContain(BENCH_CAR_ID)
  })

  it('offers only SKUs the sim itself says fit the slot', () => {
    for (const sku of skusForSlot(model, 'tyres', context)) {
      expect(sku.carPartId).toBe('tyres')
      expect(sku.fitmentClass).toBeDefined()
    }
  })
})

describe("the economy bench's campaign year", () => {
  const legendShop: BenchShopSpec = { ...shopSpec, reputationTier: 'legend' }

  it('bounds the year control by the generator own window at this shop tier', () => {
    for (const shop of [shopSpec, legendShop]) {
      for (const candidate of context.models) {
        expect(benchYearRange(candidate, shop, context)).toEqual(
          generatedYearRangeFor(candidate, currentGameYear(shop.reputationTier), context.economy),
        )
      }
    }
  })

  it('rolls a generated lot at the shop own tier, not at the career opening year', () => {
    // The model whose window the higher tier widens most, so the difference the
    // roll can express is as large as the roster offers.
    const widening = (candidate: CarModel): number =>
      benchYearRange(candidate, legendShop, context)[1] -
      benchYearRange(candidate, shopSpec, context)[1]
    const widest = [...context.models].sort((a, b) => widening(b) - widening(a))[0]!
    expect(widening(widest)).toBeGreaterThan(0)

    const youngestAtOpening = benchYearRange(widest, shopSpec, context)[1]
    const youngestAtLegend = benchYearRange(widest, legendShop, context)[1]
    const years = Array.from(
      { length: 60 },
      (_, seed) => generatedBenchCar(widest, seed + 1, legendShop, context).year,
    )

    // Every roll inside the tier's own window, and at least one of them above
    // the year an opening-tier campaign could ever have produced.
    for (const year of years) {
      expect(year).toBeGreaterThanOrEqual(widest.spec.yearFrom)
      expect(year).toBeLessThanOrEqual(youngestAtLegend)
    }
    expect(Math.max(...years)).toBeGreaterThan(youngestAtOpening)
  })

  it('starts the mileage control from the campaign year, so a later one means an older car', () => {
    // Age 2 at the opening tier, so both readings sit on the rising part of the
    // curve rather than against its cap.
    const year = currentGameYear(shopSpec.reputationTier) - 2
    expect(defaultMileageKm(year, legendShop, context)).toBeGreaterThan(
      defaultMileageKm(year, shopSpec, context),
    )
  })

  it('starts a hand-built car on a year the generator would allow', () => {
    for (const shop of [shopSpec, legendShop]) {
      for (const candidate of context.models) {
        const spec = defaultCarSpec(candidate, shop, context)
        const [oldest, youngest] = benchYearRange(candidate, shop, context)
        expect(spec.year).toBeGreaterThanOrEqual(oldest)
        expect(spec.year).toBeLessThanOrEqual(youngest)
      }
    }
  })
})

describe("the economy bench's mileage note", () => {
  it('reads the multiplier and the curve off the economy rather than restating them', () => {
    const note = mileageNoteFor(0, context.economy)
    expect(note.curve).toEqual(context.economy.valuation.mileageFactorCurve)
    expect(note.factor).toBe(context.economy.valuation.mileageFactorCurve[0]![1])
    expect(note.minAgeYears).toBe(context.economy.AUCTION_MIN_AGE_YEARS)
  })

  it('holds the claim the note makes in words: mileage can only take value away', () => {
    // The note says "mileage never adds value". `discountFromKm` alone cannot
    // hold that claim up - it is the last breakpoint AT 1.0, so a curve that
    // rose above 1.0 below it would still name a sensible flat band while the
    // sentence beside it was false. This asserts the sentence itself.
    for (const [km, factor] of context.economy.valuation.mileageFactorCurve) {
      expect(factor, `the curve reads ${factor} at ${km} km`).toBeLessThanOrEqual(1)
    }
  })

  it('names the top of the flat band, and whether a fresh lot sits inside it', () => {
    const note = mileageNoteFor(0, context.economy)
    expect(note.discountFromKm).not.toBeNull()
    // Inside the flat band mileage takes nothing away; above it, it discounts.
    expect(mileageNoteFor(note.discountFromKm! - 1, context.economy).factor).toBe(1)
    expect(mileageNoteFor(note.discountFromKm! + 1, context.economy).factor).toBeLessThan(1)
    expect(note.youngestLotUndiscounted).toBe(note.youngestLotRangeKm[1] <= note.discountFromKm!)
  })
})

describe('the economy bench readout', () => {
  const spec = defaultCarSpec(model, shopSpec, context)
  const car = benchCarInstance(spec, model, context)
  const state = benchGameState(defaultShopSpec(context), car, context)
  const benchCar = state.ownedCars.find((c) => c.id === BENCH_CAR_ID)!

  it('opens on the sim ledger, and the restoration lines sum to the whole bill', () => {
    const block = openingBlockFor(benchCar, model, state, context)
    expect(block.totalYen).toBe(
      marketValueYen(
        model,
        benchCar,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      ),
    )
    expect(block.restoration.lines.reduce((sum, line) => sum + line.billYen, 0)).toBe(
      block.billToMintYen,
    )
    expect(block.ledgerLines.length).toBeGreaterThan(0)
  })

  it('flags a car sitting on the scrap floor rather than printing counterfactuals', () => {
    const stripped = {
      ...spec,
      build: Object.fromEntries(
        Object.entries(spec.build).map(([partId, slot]) => [partId, { ...slot, partId: null }]),
      ) as typeof spec.build,
      zones: Object.fromEntries(
        Object.entries(spec.zones).map(([zoneId, zone]) => [
          zoneId,
          { ...zone, panelMissing: true },
        ]),
      ) as typeof spec.zones,
    }
    const wreck = benchCarInstance(stripped, model, context)
    const wreckState = benchGameState(defaultShopSpec(context), wreck, context)
    const block = openingBlockFor(wreck, model, wreckState, context)
    expect(block.onScrapFloor).toBe(true)
  })

  it('prices each buyer through their own valuation, never through the ledger', () => {
    for (const row of buyerRowsFor(benchCar, model, state, context)) {
      const buyer = context.buyers.find((b) => b.id === row.buyerId)!
      expect(row.priceYen).toBe(
        valuateCarForBuyer(
          buyer,
          model,
          benchCar,
          context.partsById,
          context.partsTaxonomy,
          context.partsTaxonomyById,
          100,
          context.economy,
        ),
      )
      // The champion gate and the sale outcome ask the same question, so the
      // row can never report a passing gate on a `nothing` outcome.
      expect(row.championGatePassed).toBe(row.outcome !== 'nothing')
    }
  })

  it('reports each channel exactly the odds the sim returns, and never a multi-day figure', () => {
    for (const row of channelRowsFor(benchCar, model, state, context)) {
      expect(row.odds).toEqual(
        channelArrivalOddsFor(benchCar, model, row.channelId, state, context),
      )
      expect(row.odds.arrivalChance).toBeLessThanOrEqual(1)
    }
  })

  it('names the matched-only trap: a visit that ages the listing and can never pay', () => {
    const rows = channelRowsFor(benchCar, model, state, context)
    for (const row of rows) {
      if (!row.burnsTicksForNothing) continue
      expect(row.matchedOnly).toBe(true)
      expect(row.odds.arrivalChance).toBeGreaterThan(0)
      expect(row.odds.offerChance).toBe(0)
      expect(row.odds.buyers.every((buyer) => !buyer.tasteMatched)).toBe(true)
    }
    // The flag is only ever raised on a matched-only channel.
    expect(rows.filter((row) => row.burnsTicksForNothing && !row.matchedOnly)).toEqual([])
  })

  it('shows the room as floor, band and ceiling, with the desk priced above the floor', () => {
    const panel = acquisitionPanelFor(benchCar, model, state, context)
    expect(panel.turnouts.length).toBeGreaterThan(0)
    for (const turnout of panel.turnouts) {
      expect(turnout.range.floorYen).toBeLessThanOrEqual(turnout.range.bandMinYen)
      expect(turnout.range.bandMinYen).toBeLessThanOrEqual(turnout.range.bandMaxYen)
      expect(panel.buyoutYen).toBeGreaterThan(turnout.range.floorYen)
    }
    expect(panel.reserveYen).toBeLessThan(panel.buyoutYen)
  })

  it('gives every movement its own line, so no label quotes a yen the row does not show', () => {
    // The label is the sim's sentence about one entry and carries that entry's
    // own price inside it, so a row standing for several movements would print
    // one figure in words and a different one in the column beside them.
    const cheap = [...skusForSlot(model, 'tyres', context)].sort((a, b) => a.priceYen - b.priceYen)
    const first = cheap[0]!
    const second = cheap[cheap.length - 1]!
    expect(second.priceYen).toBeGreaterThan(first.priceYen)

    let running = state
    const entries = []
    for (const sku of [first, second]) {
      const bought = runBenchAction(
        running,
        model,
        { kind: 'buy-part', partId: sku.id },
        context,
        partName,
        modelName,
      )
      running = bought.state
      entries.push(...bought.entries)
    }

    const sheet = costSheetFor(running, BENCH_CAR_ID, entries, modelName)
    const parts = sheet.unattributed.filter((line) => line.type === 'part-bought')
    expect(parts).toHaveLength(2)
    for (const line of parts) {
      expect(line.label).toContain(formatYen(line.yen))
    }
  })

  it('keeps machine-shop hire off the car ledger and on its own line', () => {
    const hired = runBenchAction(
      state,
      model,
      { kind: 'hire-machine-line', group: 'engine' },
      context,
      partName,
      modelName,
    )
    const sheet = costSheetFor(hired.state, BENCH_CAR_ID, hired.entries, modelName)
    expect(sheet.attributed.repairYen).toBe(0)
    expect(sheet.attributed.partsYen).toBe(0)
    expect(sheet.unattributed.some((line) => line.type === 'machine-hired')).toBe(true)
    expect(sheet.unattributedTotalYen).toBeGreaterThan(0)
  })
})

describe('the economy bench actions', () => {
  const spec = defaultCarSpec(model, shopSpec, context)
  const state = benchGameState(
    defaultShopSpec(context),
    benchCarInstance(spec, model, context),
    context,
  )

  it('measures a delta as market value after minus before, and nothing else', () => {
    // `seats` is removable on its own: it is in no assembly, so the removal
    // runs rather than being refused the way a wheel-assembly member is.
    const result = runBenchAction(
      state,
      model,
      { kind: 'remove-part', carPartId: 'seats' },
      context,
      partName,
      modelName,
    )
    expect(result.line.valueAfterYen).not.toBeNull()
    expect(result.line.deltaYen).toBe(result.line.valueAfterYen! - result.line.valueBeforeYen)
    expect(result.line.valueAfterYen!).toBeLessThan(result.line.valueBeforeYen)
  })

  it('refuses to pull an assembly member on its own, as the workshop floor does', () => {
    const result = runBenchAction(
      state,
      model,
      { kind: 'remove-part', carPartId: 'tyres' },
      context,
      partName,
      modelName,
    )
    expect(result.line.deltaYen).toBe(0)
    expect(result.line.refusal).toBeDefined()
  })

  it('buys a part through the real resolver, so the till and the shelf both move', () => {
    const sku = skusForSlot(model, 'tyres', context)[0]!
    const result = runBenchAction(
      state,
      model,
      { kind: 'buy-part', partId: sku.id },
      context,
      partName,
      modelName,
    )
    expect(result.state.partInventory).toHaveLength(1)
    expect(result.line.cashDeltaYen).toBeLessThan(0)
    // A part on the shelf is not on the car, so it cannot move the car's price.
    expect(result.line.deltaYen).toBe(0)
  })

  it('measures the five stats and all four laps the same way it measures the price', () => {
    // Strip a slot that carries real stat weight, then read what the log line
    // says about it. Every figure has to be a measured before and after, so a
    // moved stat shows and an untouched one is exactly zero.
    const result = runBenchAction(
      state,
      model,
      { kind: 'remove-part', carPartId: 'seats' },
      context,
      partName,
      modelName,
    )
    const carBefore = state.ownedCars.find((c) => c.id === BENCH_CAR_ID)!
    const carAfter = result.state.ownedCars.find((c) => c.id === BENCH_CAR_ID)!
    const before = evaluateCarInstance(model, carBefore, context)
    const after = evaluateCarInstance(model, carAfter, context)

    for (const stat of StatKeySchema.options) {
      expect(result.line.statDeltas![stat]).toBe(after.stats[stat] - before.stats[stat])
    }
    for (const course of context.courses) {
      const lap = result.line.laps[course.id]!
      expect(lap.beforeS).toBe(before.laps[course.id]!)
      expect(lap.afterS).toBe(after.laps[course.id]!)
      expect(lap.deltaS).toBe(
        lap.beforeS === null || lap.afterS === null ? null : lap.afterS - lap.beforeS,
      )
    }
  })

  it('reads a blocked lap as blocked rather than as a delta of nothing', () => {
    // Pulling a slot that disables the car takes every lap time away at once.
    // A null on either side has to stay a null, since there is no time for the
    // other side to be measured against.
    // Whichever such slot the sim will actually let go on its own: several are
    // assembly members and are correctly refused one at a time.
    let blocked: ReturnType<typeof runBenchAction> | undefined
    for (const entry of context.partsTaxonomy.filter((e) => e.scrapDisablesCar)) {
      const result = runBenchAction(
        state,
        model,
        { kind: 'remove-part', carPartId: entry.id },
        context,
        partName,
        modelName,
      )
      const carAfter = result.state.ownedCars.find((c) => c.id === BENCH_CAR_ID)
      if (carAfter && lapBlockers(carAfter, context).length > 0) {
        blocked = result
        break
      }
    }
    expect(blocked).toBeDefined()
    for (const course of context.courses) {
      expect(blocked!.line.laps[course.id]!.beforeS).not.toBeNull()
      expect(blocked!.line.laps[course.id]!.afterS).toBeNull()
      expect(blocked!.line.laps[course.id]!.deltaS).toBeNull()
    }
  })

  it('reports a refusal in the sim own words rather than as a silent nothing', () => {
    // Nothing on a mint car is below `poor`, so the repair gate refuses.
    const result = runBenchAction(
      state,
      model,
      { kind: 'repair', componentId: 'engine', targetBand: 'poor' },
      context,
      partName,
      modelName,
    )
    expect(result.line.deltaYen).toBe(0)
    expect(result.line.refusal ?? result.line.notes.join(' ')).toMatch(/nothing|stopped/i)
  })
})

describe('the economy bench closes a sale', () => {
  const PURCHASE_YEN = 400_000
  const shop: BenchShopSpec = { ...defaultShopSpec(context), purchaseYen: PURCHASE_YEN }
  const car = benchCarInstance(defaultCarSpec(model, shop, context), model, context)
  const base = benchGameState(shop, car, context)

  /** Lists the car, draws until the real draw brings an offer, and takes it -
   * every step a resolver the game itself calls, with the draw seeded so the
   * whole sequence repeats exactly. */
  function sell(): {
    listed: GameState
    beforeSale: GameState
    offerYen: number
    sold: ReturnType<typeof runBenchAction>
  } {
    const listed = runBenchAction(
      base,
      model,
      { kind: 'list-for-sale', channelId: 'shopFront' },
      context,
      partName,
      modelName,
    ).state
    for (let seed = 1; seed < 200; seed++) {
      const drawn = runBenchAction(
        listed,
        model,
        { kind: 'draw-offers', seed },
        context,
        partName,
        modelName,
      )
      const offer = pendingOfferFor(drawn.state, BENCH_CAR_ID, context)
      if (!offer) continue
      return {
        listed,
        beforeSale: drawn.state,
        offerYen: offer.priceYen,
        sold: runBenchAction(
          drawn.state,
          model,
          { kind: 'accept-offer' },
          context,
          partName,
          modelName,
        ),
      }
    }
    throw new Error('the shop front drew no offer in 200 seeds')
  }

  it('sells at the drawn offer and reports the profit against the car ledger', () => {
    const { beforeSale, offerYen, sold } = sell()
    const summary = sold.line.sale
    expect(summary).toBeDefined()
    expect(summary!.priceYen).toBe(offerYen)

    // The claim the screen makes in words: the profit is the sale price less
    // everything the ledger recorded against this car.
    const ledger = carLedgerFor(beforeSale, BENCH_CAR_ID)
    expect(ledger.purchaseYen).toBe(PURCHASE_YEN)
    expect(summary!.ledger).toEqual(ledger)
    expect(summary!.profitYen).toBe(
      offerYen - (PURCHASE_YEN + ledger.repairYen + ledger.partsYen + ledger.listingFeesYen),
    )
    expect(sold.state.cashYen - beforeSale.cashYen).toBe(offerYen)
    expect(sold.state.ownedCars.some((c) => c.id === BENCH_CAR_ID)).toBe(false)
  })

  it('reports no profit at all on a car whose purchase was never recorded', () => {
    // The sim never fabricates one, and neither does the bench.
    const unrecorded = benchGameState({ ...shop, purchaseYen: null }, car, context)
    expect(carLedgerFor(unrecorded, BENCH_CAR_ID).purchaseYen).toBeNull()
  })

  it('reads the reputation move off the sale rather than recomputing it', () => {
    const { beforeSale, sold } = sell()
    const summary = sold.line.sale!
    expect(summary.reputationPointsBefore).toBe(beforeSale.reputationPoints)
    expect(summary.reputationPointsAfter).toBe(sold.state.reputationPoints)
    // Reputation only ever rises, and the delta the entry reported is the move
    // the state actually made.
    expect(summary.reputationPointsAfter - summary.reputationPointsBefore).toBe(
      summary.reputationDelta,
    )
    expect(summary.reputationDelta).toBeGreaterThanOrEqual(0)
  })

  it('moves the sales counter on the day and leaves heat for the weekly update', () => {
    const { sold } = sell()
    const summary = sold.line.sale!
    expect(summary.playerSalesAfter).toBe(summary.playerSalesBefore + 1)
    expect(summary.heatPercentAfter).toBe(summary.heatPercentBefore)
  })

  it('runs the real weekly market update, which is what moves heat', () => {
    const endOfWeek = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].find((day) =>
      isEndOfWeek(day, context.economy),
    )!
    const weekly = runBenchAction(
      benchGameState({ ...shop, day: endOfWeek }, car, context),
      model,
      { kind: 'settle-week' },
      context,
      partName,
      modelName,
    )
    expect(weekly.entries.some((entry) => entry.type === 'market-heat-shift')).toBe(true)
  })

  it('leaves the sale line with no measured delta, because there is no after', () => {
    const { sold } = sell()
    expect(sold.line.valueAfterYen).toBeNull()
    expect(sold.line.deltaYen).toBeNull()
    expect(sold.line.statDeltas).toBeNull()
    expect(sold.line.laps).toEqual({})
  })
})

describe('the economy bench channel-realised price', () => {
  const shop = defaultShopSpec(context)
  const car = benchCarInstance(defaultCarSpec(model, shop, context), model, context)
  const state = benchGameState(shop, car, context)
  const benchCar = state.ownedCars.find((c) => c.id === BENCH_CAR_ID)!

  it('prices each buyer through the channel own ceiling and this shop standing', () => {
    const panel = channelPricePanelFor(benchCar, model, 'shopFront', state, context)
    expect(panel.rows.length).toBeGreaterThan(0)
    for (const row of panel.rows) {
      const buyer = context.buyers.find((b) => b.id === row.buyerId)!
      expect(row.channelPriceYen).toBe(
        valuateCarForBuyerViaChannel(
          buyer,
          model,
          benchCar,
          context.partsById,
          context.partsTaxonomy,
          context.partsTaxonomyById,
          100,
          context.economy,
          context.economy.sellingChannels.shopFront.tasteCeiling!,
          state.sceneStanding,
        ),
      )
      expect(row.channelTaste).toBe(
        channelBuyerTaste(
          buyer,
          model,
          benchCar,
          context.partsById,
          context.partsTaxonomy,
          context.economy,
          context.economy.sellingChannels.shopFront.tasteCeiling!,
          state.sceneStanding,
        ),
      )
    }
  })

  it('MOVES with a scene standing dial, which the buyer table does not', () => {
    // The whole reason this column exists: standing reaches the realised price
    // and never the standard band, so without it the six dials in the builder
    // change nothing a reader can see.
    const standing: SceneStanding = Object.fromEntries(
      BuyerArchetypeSchema.options.map((archetype) => [archetype, 'shop']),
    ) as SceneStanding
    const raised = benchGameState({ ...shop, sceneStanding: standing }, car, context)
    const raisedCar = raised.ownedCars.find((c) => c.id === BENCH_CAR_ID)!

    const before = channelPricePanelFor(benchCar, model, 'shopFront', state, context)
    const after = channelPricePanelFor(raisedCar, model, 'shopFront', raised, context)
    expect(after.rows.map((row) => row.channelPriceYen)).not.toEqual(
      before.rows.map((row) => row.channelPriceYen),
    )
    // The standard band is blind to standing, so it has not moved with it.
    expect(after.rows.map((row) => row.standardPriceYen)).toEqual(
      before.rows.map((row) => row.standardPriceYen),
    )
    expect(buyerRowsFor(raisedCar, model, raised, context)).toEqual(
      buyerRowsFor(benchCar, model, state, context),
    )
  })

  it('gives a channel with no buyer pool its own two figures instead of a table', () => {
    const ranges = bandPricedChannelsFor(benchCar, model, state, context)
    expect(ranges.length).toBeGreaterThan(0)
    for (const range of ranges) {
      expect(range).toEqual(
        channelPriceBandRangeFor(benchCar, model, range.channelId, 100, context),
      )
      expect(range.minYen).toBeLessThan(range.maxYen)
      // No buyer pool means no per-buyer row to show for it at all.
      expect(channelPricePanelFor(benchCar, model, range.channelId, state, context).rows).toEqual(
        [],
      )
    }
  })
})

describe("the economy bench's preview", () => {
  const shop: BenchShopSpec = { ...defaultShopSpec(context), purchaseYen: 400_000 }
  const spec = defaultCarSpec(model, shop, context)
  const worn = { ...spec, mileageKm: spec.mileageKm + 150_000 }

  it('prices a pending spec through the same functions the bench car goes through', () => {
    const preview = benchPreviewFor(worn, shop, model, context)
    expect(preview.summary.valueYen).toBe(
      marketValueYen(
        model,
        preview.car,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      ),
    )
    // The same figure the opening block prints for a car actually built from
    // that spec, so the panel and the block below it cannot disagree.
    const built = benchGameState(shop, preview.car, context)
    expect(preview.summary.valueYen).toBe(
      openingBlockFor(preview.car, model, built, context).totalYen,
    )
    expect(preview.summary.lines).toEqual(
      valueLedgerFor(
        preview.car,
        model,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      ).lines,
    )
    expect(preview.summary.foundationWithheldYen).toBe(
      foundationWithheldYen(model, preview.car, context.partsById, context.economy),
    )
  })

  it('measures profit with the same function a sale realises one with', () => {
    const preview = benchPreviewFor(spec, shop, model, context)
    expect(preview.summary.ledger.purchaseYen).toBe(400_000)
    expect(preview.summary.profitAtValueYen).toBe(
      realisedProfitYen(preview.summary.valueYen, preview.summary.ledger),
    )
    // No recorded purchase is not a profit of nothing, and the bench reports it
    // as the sim does: not at all.
    const unrecorded = benchPreviewFor(spec, { ...shop, purchaseYen: null }, model, context)
    expect(unrecorded.summary.ledger.purchaseYen).toBeNull()
    expect(unrecorded.summary.profitAtValueYen).toBeNull()
  })

  it('names which ledger lines moved, and their deltas sum to the value delta', () => {
    const before = benchPreviewFor(spec, shop, model, context).summary
    const after = benchPreviewFor(worn, shop, model, context).summary
    const rows = ledgerDiffRows(before, after)

    const moved = rows.filter((row) => row.deltaYen !== 0)
    expect(moved.length).toBeGreaterThan(0)
    // Mileage is the only thing that changed, so it is the line that moved and
    // book value is untouched by it.
    expect(moved.map((row) => row.id)).toContain('mileage')
    expect(rows.find((row) => row.id === 'book')?.deltaYen).toBe(0)
    // The moved lines come first, which is what makes the reason readable.
    expect(rows.slice(0, moved.length)).toEqual(moved)
    expect(rows.reduce((sum, row) => sum + row.deltaYen, 0)).toBe(after.valueYen - before.valueYen)
  })

  it('reads an absent ledger line as an adjustment of nothing, not as a gap', () => {
    // Heat is only carried when it is not neutral, so a heat move puts a line
    // on one side of the diff and not the other.
    const before = benchPreviewFor(spec, shop, model, context).summary
    const after = benchPreviewFor(spec, { ...shop, heatPercent: 130 }, model, context).summary
    expect(before.lines.some((line) => line.id === 'heat')).toBe(false)
    expect(after.lines.some((line) => line.id === 'heat')).toBe(true)

    const heatRow = ledgerDiffRows(before, after).find((row) => row.id === 'heat')
    expect(heatRow?.beforeYen).toBe(0)
    expect(heatRow?.afterYen).toBe(after.lines.find((line) => line.id === 'heat')?.yen)
  })

  it('measures the build the same way the running log does', () => {
    const stripped = {
      ...spec,
      build: { ...spec.build, tyres: { ...spec.build.tyres, band: 'scrap' as const } },
    }
    const live = benchCarInstance(spec, model, context)
    const pending = benchPreviewFor(stripped, shop, model, context)
    const delta = buildDeltaFor(live, pending.car, model, context)

    const was = evaluateCarInstance(model, live, context)
    const now = evaluateCarInstance(model, pending.car, context)
    for (const stat of StatKeySchema.options) {
      expect(delta.statDeltas[stat]).toBe(now.stats[stat] - was.stats[stat])
    }
    for (const course of context.courses) {
      expect(delta.laps[course.id]?.beforeS).toBe(was.laps[course.id] ?? null)
      expect(delta.laps[course.id]?.afterS).toBe(now.laps[course.id] ?? null)
    }
  })

  it('leaves the world it previewed alone', () => {
    // The whole reason this is a preview and not a rebuild: a session's car,
    // till and ledger survive a builder edit.
    const car = benchCarInstance(spec, model, context)
    const state = benchGameState(shop, car, context)
    const snapshot = JSON.stringify(state)
    benchPreviewFor(worn, { ...shop, cashYen: 1 }, model, context)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
