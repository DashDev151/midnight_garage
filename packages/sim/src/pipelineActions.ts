import {
  fitmentClassForTier,
  type CarInstance,
  type DayLogEntry,
  type GameState,
  type Grade,
  type Part,
  type PartFitmentClass,
  type PipelineStageId,
  type StagedAction,
  type ZoneId,
} from '@midnight-garage/content'
import {
  applyDerivedBodyBands,
  bandForSeverity,
  isMetalZoneState,
  planInstallPanel,
  planPaintStage,
  planPipelineStage,
  planRemovePanel,
  zonePanelPart,
  type BodyLineCapability,
  type PipelineStageEffect,
} from './bodyPipeline'
import { carOriginLabel } from './auctions'
import { updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import {
  consumeStock,
  hasStockFor,
  paintConsumableRequirement,
  stageConsumables,
  type ConsumableRequirement,
} from './consumables'
import { carInBodyBay } from './facilities'
import { bookCashMovements } from './financeLedger'
import {
  findWorkableCar,
  hasMachineLineFor,
  machineHiredToday,
  machineLaborMultiplier,
  partCapabilityRequirement,
} from './jobs'
import { reconcileStations } from './parts'
import { makeCarOrigin } from './provenance'
import { updateServiceJobLedger } from './serviceJobLedger'
import { toolLevelsFor } from './toolLines'

/**
 * The four body-pipeline actions - one zone stage, the paint stage, pulling
 * a panel to the shelf, and fitting one from it - each resolved instantly
 * against today's remaining labour, the same immediate shape every other
 * work action in this codebase uses (`resolveRemovePart`, `resolveJobLabor`).
 * There is no staged/Confirm step anywhere in this game: a click either
 * resolves now, in full or as far as today's labour reaches, or it refuses
 * with a reason.
 */

export interface PipelineOpResult {
  state: GameState
  log: DayLogEntry[]
  laborSlotsUsed: number
}

const NOOP_PIPELINE_RESULT = (state: GameState): PipelineOpResult => ({
  state,
  log: [],
  laborSlotsUsed: 0,
})

/** The body group's own capability reading for today (`bodyPipeline.ts`'s
 * `BodyLineCapability`): `unlocked` is tier 2 owned or the line hired today
 * (gates weld and the better paint finish); `fullCapability` is level 3 (the
 * shop covering the body line) or the line hired today (hiring always grants
 * the WHOLE line, not just tier 2 - see
 * `docs/design/systems/workshop-rework.md`'s tool-gates section) - gates the best
 * polish floor. The one reading of the rule: the game store's own
 * pre-click preview calls this rather than restating it, so the preview and
 * the charge can never gate differently. */
export function bodyLineCapability(state: GameState, context: SimContext): BodyLineCapability {
  return {
    unlocked: hasMachineLineFor('body', state, context),
    fullCapability: toolLevelsFor(state, context).body >= 3 || machineHiredToday('body', state),
  }
}

/** Charges a pipeline effect's labour against `state`, draws its consumable
 * requirements off the shelf, writes the zone mutation, and re-derives the
 * two body bands - the shared second half of every generic-stage and
 * paint-stage resolution. Silently refuses (0 labour, unchanged state) on
 * insufficient labour or shelf stock, the same idiom
 * `chargeRepairWork`/`repairJobGate` use throughout this codebase for an
 * unaffordable resource - the caller already checked stock once to decide
 * whether to log a `job-blocked` refusal, so this is a defensive repeat
 * rather than the only gate. No cash moves here: the tin was already paid
 * for when it was bought (`resolveBuyConsumableTin`/`resolveBuyPaintTin`),
 * so a stage drawing it down a second time would double-charge the same
 * yen. */
export function chargeAndApplyPipelineEffect(
  state: GameState,
  carInstanceId: string,
  car: CarInstance,
  zoneId: ZoneId,
  stage: PipelineStageId,
  effect: PipelineStageEffect,
  laborSlotsRequired: number,
  laborAvailable: number,
  context: SimContext,
  requirements: readonly ConsumableRequirement[],
): PipelineOpResult {
  if (laborSlotsRequired > laborAvailable) return NOOP_PIPELINE_RESULT(state)
  if (!hasStockFor(state.consumableStock ?? {}, requirements)) return NOOP_PIPELINE_RESULT(state)
  const model = context.modelsById[car.modelId]
  if (!model || !car.zoneState) return NOOP_PIPELINE_RESULT(state)

  const nextCar = applyDerivedBodyBands(
    {
      ...car,
      zoneState: { ...car.zoneState, [zoneId]: effect.zone },
    },
    model,
    context,
  )
  const isOwnedCar = state.ownedCars.some((c) => c.id === carInstanceId)
  const ownedIndex = state.ownedCars.findIndex((c) => c.id === carInstanceId)
  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === carInstanceId)
  let next: GameState = {
    ...state,
    consumableStock: consumeStock(state.consumableStock ?? {}, requirements),
    energySpentToday: state.energySpentToday + laborSlotsRequired,
  }
  if (ownedIndex !== -1) {
    const ownedCars = [...next.ownedCars]
    ownedCars[ownedIndex] = nextCar
    next = { ...next, ownedCars }
  } else if (serviceIndex !== -1) {
    const activeServiceJobs = [...next.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...activeServiceJobs[serviceIndex]!, car: nextCar }
    next = { ...next, activeServiceJobs }
  } else {
    return NOOP_PIPELINE_RESULT(state)
  }
  next = isOwnedCar
    ? updateCarLedger(next, carInstanceId, (ledger) => ({
        ...ledger,
        repairYen: ledger.repairYen + effect.materialsCostYen,
      }))
    : updateServiceJobLedger(next, state.activeServiceJobs[serviceIndex]?.id ?? '', (ledger) => ({
        ...ledger,
        repairYen: ledger.repairYen + effect.materialsCostYen,
      }))
  // Filler, primer and paint were bought for the shelf, not this car, so
  // this records the VALUE this zone on this car drew down rather than a
  // fresh charge - no cash moves a second time (`cashMovementFor` reads
  // `body-materials-used` as moneyless).
  const log: DayLogEntry[] =
    effect.materialsCostYen > 0
      ? [
          {
            type: 'body-materials-used',
            carInstanceId,
            zoneId,
            stage,
            costYen: effect.materialsCostYen,
          },
        ]
      : []
  return {
    state: bookCashMovements(next, log, context.economy),
    log,
    laborSlotsUsed: laborSlotsRequired,
  }
}

/** One of the six generic body-pipeline stages (strip/prep, beat, weld,
 * fill-and-sand, prime, polish) on one zone, resolved instantly. Every stage
 * refuses off the body bay's own car with a `job-blocked`/`not-in-body-bay`
 * entry (sprint208.md: "ALL body work requires the car in the body bay"),
 * checked before anything else. A prerequisite the zone doesn't meet is a
 * silent no-op (the same "nothing to do" idiom `repairJobGate` uses), as is
 * a zone needing a fresh panel before hand work means anything - the car
 * screen names that state on the zone itself, so it is never a stage the
 * player could reach and be surprised by. An empty shelf logs a
 * `job-blocked` entry, matching every other stock-out refusal in this
 * codebase.
 *
 * Weld is the one stage priced at a machine-gated rate rather than a flat
 * one: its labour is stage points x `machineLaborMultiplier('body', ...)`,
 * the stick-welder-by-hand/body-line-hired rate every other machine gate
 * already uses (sprint208.md: "weld works from day one at the machine-less
 * rate ... The body line buys speed"). */
export function resolvePipelineStageAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-stage' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
  if (!carInBodyBay(state, carInstanceId)) {
    return {
      state,
      log: [
        {
          type: 'job-blocked',
          jobId: `pipeline-${carInstanceId}-${action.stage}-${action.zoneId}`,
          reason: 'not-in-body-bay',
        },
      ],
      laborSlotsUsed: 0,
    }
  }
  const zone = car.zoneState[action.zoneId]
  const plan = planPipelineStage(action.stage, zone, bodyLineCapability(state, context))
  if (!plan.ok) return NOOP_PIPELINE_RESULT(state)
  const requirements = stageConsumables(action.stage)
  if (!hasStockFor(state.consumableStock ?? {}, requirements)) {
    return {
      state,
      log: [
        {
          type: 'job-blocked',
          jobId: `pipeline-${carInstanceId}-${action.stage}-${action.zoneId}`,
          reason: 'out-of-stock',
        },
      ],
      laborSlotsUsed: 0,
    }
  }
  const baseLaborSlots = context.economy.energy.bodyStagePoints[action.stage]
  const laborSlotsRequired =
    action.stage === 'weld'
      ? Math.round(baseLaborSlots * machineLaborMultiplier('body', state, context))
      : baseLaborSlots
  return chargeAndApplyPipelineEffect(
    state,
    carInstanceId,
    car,
    action.zoneId,
    action.stage,
    plan,
    laborSlotsRequired,
    laborAvailable,
    context,
    requirements,
  )
}

/** The catalog `paint` SKU for `grade` at `fitmentClass` - `stock` reads the
 * stock index, everything else the aftermarket one, the same two lookup maps
 * every other slot's fit already reads. `undefined` only if the catalog
 * genuinely has no entry at that grade, never expected for real content. */
function paintCatalogPartForGrade(
  context: SimContext,
  fitmentClass: PartFitmentClass,
  grade: Grade,
): Part | undefined {
  return grade === 'stock'
    ? context.stockPartByCarPartId[fitmentClass]?.paint
    : context.aftermarketPartByCarPartId[fitmentClass]?.paint?.[grade]
}

/**
 * The paint stage, resolved instantly - needs the zone primed and refuses
 * silently (nothing to do) otherwise, including the stock-grade colour gate
 * `planPaintStage` enforces. A shelf short of that exact tin (finish and
 * colour together) logs a `job-blocked` entry instead, the same treatment
 * `resolvePipelineStageAction` gives the generic stages. On success, the
 * `paint` carrier's installed SKU is swapped to match the completed grade
 * BEFORE the zone mutation is charged and applied, so
 * `applyDerivedBodyBands`'s single-writer rule (which preserves whatever SKU
 * is already installed and only rewrites the band) carries the new one
 * through rather than the old. Refuses off the body bay's own car first,
 * same as every other pipeline action (sprint208.md).
 */
export function resolvePipelinePaintAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-paint' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
  if (!carInBodyBay(state, carInstanceId)) {
    return {
      state,
      log: [
        {
          type: 'job-blocked',
          jobId: `pipeline-${carInstanceId}-paint-${action.zoneId}`,
          reason: 'not-in-body-bay',
        },
      ],
      laborSlotsUsed: 0,
    }
  }
  const model = context.modelsById[car.modelId]
  if (!model) return NOOP_PIPELINE_RESULT(state)
  const zone = car.zoneState[action.zoneId]
  const plan = planPaintStage(
    zone,
    action.colour,
    bodyLineCapability(state, context),
    action.grade,
    car.factoryColour,
  )
  if (!plan.ok) return NOOP_PIPELINE_RESULT(state)
  const requirements = [paintConsumableRequirement(action.grade, action.colour)]
  if (!hasStockFor(state.consumableStock ?? {}, requirements)) {
    return {
      state,
      log: [
        {
          type: 'job-blocked',
          jobId: `pipeline-${carInstanceId}-paint-${action.zoneId}`,
          reason: 'out-of-stock',
        },
      ],
      laborSlotsUsed: 0,
    }
  }
  const laborSlotsRequired = context.economy.energy.bodyStagePoints.paint

  const installed = car.parts.paint.installed
  const catalogPart = paintCatalogPartForGrade(
    context,
    fitmentClassForTier(model.tier),
    action.grade,
  )
  const carWithGrade =
    installed && catalogPart
      ? {
          ...car,
          parts: { ...car.parts, paint: { installed: { ...installed, partId: catalogPart.id } } },
        }
      : car

  return chargeAndApplyPipelineEffect(
    state,
    carInstanceId,
    carWithGrade,
    action.zoneId,
    'paint',
    plan,
    laborSlotsRequired,
    laborAvailable,
    context,
    requirements,
  )
}

/**
 * Writes `nextCar` back onto whichever list holds `carInstanceId` (an owned
 * car or a customer's car sitting in an active service job) - the shared
 * write-back both panel resolvers below use, mirroring the same branch every
 * other pipeline resolver in this file already runs inline. `null` when the
 * car is on neither list (already left the shop), which the caller reads as
 * a refusal.
 */
function writeBackCar(
  state: GameState,
  carInstanceId: string,
  nextCar: CarInstance,
): GameState | null {
  const ownedIndex = state.ownedCars.findIndex((c) => c.id === carInstanceId)
  if (ownedIndex !== -1) {
    const ownedCars = [...state.ownedCars]
    ownedCars[ownedIndex] = nextCar
    return { ...state, ownedCars }
  }
  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === carInstanceId)
  if (serviceIndex !== -1) {
    const activeServiceJobs = [...state.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...activeServiceJobs[serviceIndex]!, car: nextCar }
    return { ...state, activeServiceJobs }
  }
  return null
}

/**
 * Pulls `zoneId`'s panel onto the shelf as a fresh `PartInstance` at its own
 * severity, and marks the zone missing - the same remove-to-inventory shape
 * `resolveRemovePart` (jobs.ts) uses for every other slot, resolved
 * instantly. Refuses off the body bay's own car first, same as every other
 * pipeline action (sprint208.md). Labour reads the flat remove-part action
 * point, the same figure every slot's removal charges - panel bolts are
 * hand work, never machine-gated. A no-op on an already-missing zone: there
 * is nothing there to pull.
 */
export function resolvePipelineRemovePanelAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-remove-panel' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
  if (!carInBodyBay(state, carInstanceId)) {
    return {
      state,
      log: [
        {
          type: 'job-blocked',
          jobId: `pipeline-${carInstanceId}-remove-panel-${action.zoneId}`,
          reason: 'not-in-body-bay',
        },
      ],
      laborSlotsUsed: 0,
    }
  }
  const model = context.modelsById[car.modelId]
  if (!model) return NOOP_PIPELINE_RESULT(state)
  const zone = car.zoneState[action.zoneId]
  if (zone.panelMissing) return NOOP_PIPELINE_RESULT(state)

  const laborSlotsRequired = context.economy.energy.actionPoints.removePart
  if (laborSlotsRequired > laborAvailable) return NOOP_PIPELINE_RESULT(state)

  const fitmentClass = fitmentClassForTier(model.tier)
  const oldPanelCatalogPart = zonePanelPart(context.partsById, action.zoneId, fitmentClass)
  const nextCar = applyDerivedBodyBands(
    { ...car, zoneState: { ...car.zoneState, [action.zoneId]: planRemovePanel(zone) } },
    model,
    context,
  )

  let partInventory = state.partInventory
  let partInstanceCounter = state.partInstanceCounter ?? 0
  if (oldPanelCatalogPart) {
    const harvestedBand = isMetalZoneState(zone)
      ? bandForSeverity(zone.metal)
      : bandForSeverity(zone.finish)
    partInventory = [
      ...partInventory,
      {
        id: `panel-${partInstanceCounter}`,
        partId: oldPanelCatalogPart.id,
        band: harvestedBand,
        origin: makeCarOrigin(car.id, carOriginLabel(model, car.year), state.day),
        // The zone's paint state rides on the harvested instance so an
        // unchanged refit restores it: a panel taken off and put back keeps
        // its paint. A bought or reconditioned panel carries no `panelState`
        // and comes back bare, which is when paint is honestly owed.
        panelState: {
          finish: zone.finish,
          primed: zone.primed,
          ...(zone.colour ? { colour: zone.colour } : {}),
          ...(isMetalZoneState(zone) ? { surface: zone.surface } : {}),
        },
      },
    ]
    partInstanceCounter += 1
  }

  const next = writeBackCar(
    {
      ...state,
      partInventory,
      partInstanceCounter,
      energySpentToday: state.energySpentToday + laborSlotsRequired,
    },
    carInstanceId,
    nextCar,
  )
  if (!next) return NOOP_PIPELINE_RESULT(state)
  return { state: next, log: [], laborSlotsUsed: laborSlotsRequired }
}

/**
 * Consumes the picked zone-panel `PartInstance` from inventory and fits it -
 * metal at the panel's own band on a metal zone, surface/finish reset -
 * exactly what a fresh physical panel leaves regardless of what stood there
 * before, resolved instantly. Refuses off the body bay's own car first, same
 * as every other pipeline action (sprint208.md). Needs the zone missing
 * first (`planRemovePanel` ran, or the zone was never fitted): a zone still
 * carrying its old panel refuses, matching every other slot's
 * replace-needs-empty-first rule. Labour is the flat fitting (bolt-on) class
 * figure - panel bolts are hand work, never machine-gated (sprint208.md:
 * "the booth gates booth work... not spanners"). No separate materials
 * charge, since the new panel's price was already paid at purchase and lands
 * on the car's ledger here, the same moment `completeJob`'s install-part
 * branch posts a part's cost. Also records the fitted SKU's own grade onto
 * the zone (`planInstallPanel`'s `grade` argument), which is what lets the
 * car read as modified the moment a non-stock panel goes on - the zone, not
 * the whole-car carrier, is now the truth about which panel is actually
 * fitted.
 */
export function resolvePipelineInstallPanelAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-install-panel' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
  if (!carInBodyBay(state, carInstanceId)) {
    return {
      state,
      log: [
        {
          type: 'job-blocked',
          jobId: `pipeline-${carInstanceId}-install-panel-${action.zoneId}`,
          reason: 'not-in-body-bay',
        },
      ],
      laborSlotsUsed: 0,
    }
  }
  const model = context.modelsById[car.modelId]
  if (!model) return NOOP_PIPELINE_RESULT(state)
  const fitmentClass = fitmentClassForTier(model.tier)
  const zone = car.zoneState[action.zoneId]
  if (!zone.panelMissing) return NOOP_PIPELINE_RESULT(state) // something is already there - remove it first

  const newPanelInstance = state.partInventory.find((p) => p.id === action.partInstanceId)
  if (!newPanelInstance) return NOOP_PIPELINE_RESULT(state)
  const newPanelCatalogPart = context.partsById[newPanelInstance.partId]
  if (
    !newPanelCatalogPart ||
    newPanelCatalogPart.zoneId !== action.zoneId ||
    newPanelCatalogPart.fitmentClass !== fitmentClass
  ) {
    return NOOP_PIPELINE_RESULT(state)
  }

  // A zone panel is a fitted part like any other, so the one capability gate
  // applies here exactly as it does on the car and at the bench - the only
  // refusal on this path that says why.
  if (partCapabilityRequirement(newPanelCatalogPart, car, state, context)) {
    return {
      state,
      log: [
        {
          type: 'job-blocked',
          jobId: `pipeline-${carInstanceId}-install-panel-${action.zoneId}`,
          reason: 'tool-tier',
        },
      ],
      laborSlotsUsed: 0,
    }
  }

  // Panel hanging is hand work, flat at the bolt-on class figure - the
  // booth prices the booth (weld, the paint finish tier), not spanners.
  const laborSlotsRequired = context.economy.energy.energyByClass['bolt-on']
  if (laborSlotsRequired > laborAvailable) return NOOP_PIPELINE_RESULT(state)

  const nextZone = planInstallPanel(
    zone,
    newPanelInstance.band,
    newPanelCatalogPart.grade,
    newPanelInstance.panelState,
  )
  const nextCar = applyDerivedBodyBands(
    { ...car, zoneState: { ...car.zoneState, [action.zoneId]: nextZone } },
    model,
    context,
  )
  const partInventory = state.partInventory.filter((p) => p.id !== action.partInstanceId)

  const isOwnedCar = state.ownedCars.some((c) => c.id === carInstanceId)
  // The panel has left the warehouse for the zone, so whichever station it was
  // on is now clear.
  const withInventory: GameState = reconcileStations({
    ...state,
    partInventory,
    energySpentToday: state.energySpentToday + laborSlotsRequired,
  })
  const next = writeBackCar(withInventory, carInstanceId, nextCar)
  if (!next) return NOOP_PIPELINE_RESULT(state)
  const pricePaidYen = newPanelInstance.pricePaidYen ?? 0
  const withLedger = isOwnedCar
    ? updateCarLedger(next, carInstanceId, (ledger) => ({
        ...ledger,
        partsYen: ledger.partsYen + pricePaidYen,
      }))
    : updateServiceJobLedger(
        next,
        state.activeServiceJobs.find((sj) => sj.car.id === carInstanceId)?.id ?? '',
        (ledger) => ({ ...ledger, partsYen: ledger.partsYen + pricePaidYen }),
      )
  return { state: withLedger, log: [], laborSlotsUsed: laborSlotsRequired }
}
