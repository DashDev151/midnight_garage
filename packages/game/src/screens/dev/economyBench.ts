import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type GameState,
  type MetalZoneId,
  type Part,
  type PartInstance,
  type ReputationTier,
  type SceneStanding,
  type ToolTiers,
  type ZoneId,
  type ZoneStates,
} from '@midnight-garage/content'
import {
  applyDerivedBodyBands,
  assignToShop,
  carOriginLabel,
  createInitialGameState,
  currentGameYear,
  generateAuctionCarInstance,
  hasForcedInduction,
  createRng,
  makeCarOrigin,
  machiningOperationsForSlot,
  mileageRangeForAge,
  moveCar,
  partFitsCar,
  type SimContext,
} from '@midnight-garage/sim'

/**
 * THE ECONOMY BENCH'S STATE BUILDER.
 *
 * The bench computes nothing. It assembles a real `GameState` and a real
 * `CarInstance` out of the same primitives generation and the live game use
 * (`stockPartByCarPartId`, `applyDerivedBodyBands`, `createInitialGameState`,
 * `assignToShop`), and hands them to the sim. Every yen the screen shows comes
 * back out of a named sim function; there is no second expression of value
 * here and there must never be one.
 *
 * `economyBench.test.ts` holds a bench-built car and a normally-built one to
 * identical figures, which is what stops this file becoming a second
 * implementation.
 */

/** The one car the bench works on. Fixed, so a rebuild replaces rather than
 * accumulates. */
export const BENCH_CAR_ID = 'bench-car'

/** The seed the bench's own `GameState` starts from - only the day-1 auction
 * board and the venue names read it, neither of which the bench shows. */
export const BENCH_SEED = 194

/** The six zones pressed from sheet metal, in the order the bench lists them. */
export const METAL_ZONE_IDS: readonly MetalZoneId[] = [
  'bonnet',
  'boot',
  'left-front',
  'left-rear',
  'right-front',
  'right-rear',
]

/** All nine zones, metal first then trim - the bench's own display order. */
export const BENCH_ZONE_IDS: readonly ZoneId[] = [
  ...METAL_ZONE_IDS,
  'front-bumper',
  'rear-bumper',
  'skirts',
]

/** Whether `zoneId` carries metal, so the bench knows to offer the metal and
 * surface dials. Trim zones have neither field at all. */
export function isMetalZone(zoneId: ZoneId): zoneId is MetalZoneId {
  return (METAL_ZONE_IDS as readonly ZoneId[]).includes(zoneId)
}

/** One slot of a bench build: the catalogue SKU occupying it (null for an
 * empty slot), the condition band it sits at, and the machining operations
 * already done to the part in it. */
export interface BenchSlotSpec {
  partId: string | null
  band: ConditionBand
  machining: readonly string[]
}

export type BenchBuild = Record<CarPartId, BenchSlotSpec>

/** Everything about one car that reaches its value. */
export interface BenchCarSpec {
  modelId: string
  year: number
  mileageKm: number
  factoryColour: string
  provenanceNote: string
  build: BenchBuild
  zones: ZoneStates
  symptoms: CarInstance['symptoms']
  apparentBandByPartId: CarInstance['apparentBandByPartId']
}

/** Everything about the shop that reaches a price, an offer, or a room. */
export interface BenchShopSpec {
  day: number
  cashYen: number
  reputationTier: ReputationTier
  sceneStanding: SceneStanding
  toolTiers: ToolTiers
  toolShopsOwned: readonly string[]
  /** This model's own market heat, in per cent; 100 is neutral. */
  heatPercent: number
}

/**
 * A zone table with nothing wrong with it: straight metal, ready surface, show
 * finish, every panel present and wearing the car's own factory colour. The
 * state a hand-built bench car starts from, so every point it later loses is
 * visibly the build's own doing.
 */
export function cleanZoneStates(factoryColour: string): ZoneStates {
  const trim = { finish: 0, panelMissing: false, primed: false, colour: factoryColour }
  const metal = { metal: 0, surface: 0, ...trim }
  return {
    bonnet: { ...metal },
    boot: { ...metal },
    'left-front': { ...metal },
    'left-rear': { ...metal },
    'right-front': { ...metal },
    'right-rear': { ...metal },
    'front-bumper': { ...trim },
    'rear-bumper': { ...trim },
    skirts: { ...trim },
  }
}

/**
 * Every slot filled with the car's own class of stock part at mint, except a
 * forced-induction slot on a car that never had one - legitimate absence, and
 * exactly what generation does with that slot.
 */
export function stockBuild(model: CarModel, context: SimContext): BenchBuild {
  const fitmentClass = fitmentClassForTier(model.tier)
  const build = {} as BenchBuild
  for (const partId of ALL_CAR_PART_IDS) {
    const absent = partId === 'forcedInduction' && !hasForcedInduction(model)
    const stock = context.stockPartByCarPartId[fitmentClass]?.[partId]
    build[partId] = {
      partId: absent ? null : (stock?.id ?? null),
      band: 'mint',
      machining: [],
    }
  }
  return build
}

/**
 * The mileage a car's control starts at: the midpoint of the range generation
 * would roll for a car of this age, off `economy.json`'s own curves. Mileage
 * belongs to one instance rather than to the model, so this is only where the
 * control begins.
 */
export function defaultMileageKm(model: CarModel, context: SimContext): number {
  const ageYears = Math.max(0, currentGameYear('unknown') - model.spec.yearFrom)
  const [min, max] = mileageRangeForAge(ageYears, context.economy)
  return Math.round((min + max) / 2)
}

/** A clean, stock, mint car of `model` - the bench's hand-build starting
 * point. */
export function defaultCarSpec(model: CarModel, context: SimContext): BenchCarSpec {
  const factoryColour = model.spec.factoryColours[0] ?? 'white'
  return {
    modelId: model.id,
    year: model.spec.yearFrom,
    mileageKm: defaultMileageKm(model, context),
    factoryColour,
    provenanceNote: '',
    build: stockBuild(model, context),
    zones: cleanZoneStates(factoryColour),
    symptoms: [],
    apparentBandByPartId: null,
  }
}

/**
 * Reads a real `CarInstance` back into a bench spec - the seam that lets a
 * GENERATED lot be loaded onto the bench and then edited by hand. A car with
 * no zone table (nothing the current generator produces) reads as a clean one,
 * since the derived body bands would otherwise have nothing to come from.
 */
export function carSpecFrom(car: CarInstance): BenchCarSpec {
  const build = {} as BenchBuild
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    build[partId] = installed
      ? { partId: installed.partId, band: installed.band, machining: installed.machining ?? [] }
      : { partId: null, band: 'mint', machining: [] }
  }
  return {
    modelId: car.modelId,
    year: car.year,
    mileageKm: car.mileageKm,
    factoryColour: car.factoryColour,
    provenanceNote: car.provenanceNote,
    build,
    zones: car.zoneState ?? cleanZoneStates(car.factoryColour),
    symptoms: car.symptoms,
    apparentBandByPartId: car.apparentBandByPartId,
  }
}

/**
 * The `CarInstance` a spec describes.
 *
 * `bodywork` and `paint` are NOT taken from the build: `applyDerivedBodyBands`
 * is the single writer of those two bands and derives them from the zone
 * table, exactly as it does at generation and after every zone stage. So the
 * bench cannot set them by hand and cannot disagree with the body pipeline
 * about what a zone table means.
 */
export function benchCarInstance(
  spec: BenchCarSpec,
  model: CarModel,
  context: SimContext,
): CarInstance {
  const origin = makeCarOrigin(BENCH_CAR_ID, carOriginLabel(model, spec.year), 0)
  const parts = {} as CarInstance['parts']
  for (const partId of ALL_CAR_PART_IDS) {
    const slot = spec.build[partId]
    const catalogPart = slot.partId ? context.partsById[slot.partId] : undefined
    if (!catalogPart) {
      parts[partId] = { installed: null }
      continue
    }
    const installed: PartInstance = {
      id: `${BENCH_CAR_ID}-${partId}`,
      partId: catalogPart.id,
      band: slot.band,
      origin,
      ...(slot.machining.length > 0 ? { machining: [...slot.machining] } : {}),
    }
    parts[partId] = { installed }
  }

  const car: CarInstance = {
    id: BENCH_CAR_ID,
    modelId: model.id,
    year: spec.year,
    mileageKm: spec.mileageKm,
    factoryColour: spec.factoryColour,
    provenanceNote: spec.provenanceNote,
    parts,
    symptoms: spec.symptoms,
    apparentBandByPartId: spec.apparentBandByPartId,
    zoneState: spec.zones,
  }
  return applyDerivedBodyBands(car, model, context)
}

/** A fresh shop: day 1, the career's own starting cash, unknown, no standing,
 * every tool line on its bottom rung, neutral heat. */
export function defaultShopSpec(context: SimContext): BenchShopSpec {
  const fresh = createInitialGameState(context, BENCH_SEED)
  return {
    day: fresh.day,
    cashYen: fresh.cashYen,
    reputationTier: fresh.reputationTier,
    sceneStanding: fresh.sceneStanding,
    toolTiers: fresh.toolTiers,
    toolShopsOwned: [],
    heatPercent: 100,
  }
}

/**
 * The `GameState` the bench works in: a real new career with the shop dials
 * set where the bench asks, the bench car owned, placed through the real
 * acquisition cascade (`assignToShop`) and then moved into a service bay
 * through the real move (`moveCar`), because work refuses on a car that is not
 * in one. `findWorkableCar` then finds it exactly as it finds a car the player
 * won. The day-1 auction board `createInitialGameState` seeds is left alone
 * rather than cleared: it costs nothing, and clearing it would be the bench
 * deciding what a career looks like.
 */
export function benchGameState(
  shop: BenchShopSpec,
  car: CarInstance,
  context: SimContext,
): GameState {
  const base = createInitialGameState(context, BENCH_SEED)
  const seated: GameState = {
    ...base,
    day: shop.day,
    cashYen: shop.cashYen,
    reputationTier: shop.reputationTier,
    sceneStanding: shop.sceneStanding,
    toolTiers: shop.toolTiers,
    toolShopsOwned: [...shop.toolShopsOwned],
    marketHeat: { ...base.marketHeat, [car.modelId]: shop.heatPercent },
    ownedCars: [car],
  }
  return moveCar(assignToShop(seated, car.id), car.id, 'service', context.economy).state
}

/**
 * A REAL generated lot car for `model`, through the same
 * `generateAuctionCarInstance` every auction lot comes out of - the common
 * case, since hand-setting 28 slots and nine zones is not how a realistic car
 * arises. The instance is re-identified as the bench car; nothing else about
 * it is touched.
 */
export function generatedBenchCar(
  model: CarModel,
  seed: number,
  day: number,
  context: SimContext,
): CarInstance {
  const rolled = generateAuctionCarInstance(
    model,
    BENCH_CAR_ID,
    createRng(seed),
    context,
    currentGameYear('unknown'),
    true,
    day,
  )
  return { ...rolled, id: BENCH_CAR_ID }
}

/**
 * Every catalogue SKU that can occupy `carPartId` on this car - the sim's own
 * fit rule (`partFitsCar`: right slot, required tags, the car's own fitment
 * class), never a second one. What the slot picker offers.
 */
export function skusForSlot(
  model: CarModel,
  carPartId: CarPartId,
  context: SimContext,
): readonly Part[] {
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry) return []
  return context.parts.filter((part) =>
    partFitsCar(part, model, entry.group, context.partsTaxonomyById, carPartId),
  )
}

/** Every machining operation that can be applied to `carPartId`, on either
 * venue - the bench sets machining directly on a slot, so it offers the shop's
 * jobs and the car's setup jobs together. */
export function machiningOptionsForSlot(carPartId: CarPartId, context: SimContext) {
  return [
    ...machiningOperationsForSlot(carPartId, context.economy, 'loose-part'),
    ...machiningOperationsForSlot(carPartId, context.economy, 'fitted-part'),
  ]
}
