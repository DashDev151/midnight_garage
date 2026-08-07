import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
  type AuctionLot,
  type CarModel,
  type GameState,
} from '@midnight-garage/content'
import {
  buildSimContext,
  channelArrivalOddsFor,
  computeDerivedStats,
  createInitialGameState,
  foundationWithheldYen,
  marketValueYen,
  moveCar,
  resolveBuyoutInstant,
  valuateCarForBuyer,
  valueLedgerFor,
  type SimContext,
} from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import {
  BENCH_CAR_ID,
  benchCarInstance,
  benchGameState,
  carSpecFrom,
  defaultCarSpec,
  defaultShopSpec,
  generatedBenchCar,
  skusForSlot,
} from './economyBench'
import {
  acquisitionPanelFor,
  buyerRowsFor,
  channelRowsFor,
  costSheetFor,
  openingBlockFor,
} from './economyBenchReadout'
import { runBenchAction } from './economyBenchActions'

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

describe('the economy bench state builder', () => {
  it('round-trips a real generated lot: read into a spec and rebuilt is the same car', () => {
    const generated = generatedBenchCar(model, 7, 1, context)
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
    const generated = generatedBenchCar(model, 11, 1, context)
    const shop = defaultShopSpec(context)

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
  })

  it('THE GUARD: the same repair on both states leaves the same car and the same price', () => {
    const generated = generatedBenchCar(model, 11, 1, context)
    const shop = defaultShopSpec(context)
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
    const spec = defaultCarSpec(model, context)
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

describe('the economy bench readout', () => {
  const spec = defaultCarSpec(model, context)
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
  const spec = defaultCarSpec(model, context)
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
    expect(result.line.deltaYen).toBe(result.line.valueAfterYen - result.line.valueBeforeYen)
    expect(result.line.valueAfterYen).toBeLessThan(result.line.valueBeforeYen)
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
