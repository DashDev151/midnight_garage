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
import type { NewJobSpec } from './actions'
import {
  assemblyContainerFor,
  assemblyDefById,
  resolveRefitAssembly,
  resolveRemoveAssembly,
} from './assemblies'
import { bandIndex, canRepair, planGroupRepair, repairLevelForGroup } from './bands'
import {
  applyDerivedBodyBands,
  bandForSeverity,
  isBodyDerivedPart,
  isMetalZoneState,
  planInstallPanel,
  planPaintStage,
  planPipelineStage,
  planRemovePanel,
  refitCarrierZoneStates,
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
import { bookCashMovements } from './financeLedger'
import {
  findWorkableCar,
  hasMachineLineFor,
  installLaborSlotsFor,
  machineHiredToday,
  machineLineGroupFor,
  refitLaborSlotsFor,
  resolveJobLabor,
} from './jobs'
import { makeCarOrigin } from './provenance'
import { updateServiceJobLedger } from './serviceJobLedger'

/**
 * Drops a car's staged-work entry, wherever it stands - called by every
 * car-exit resolver (walk-in sale, public listing, service-job resolution)
 * so staged work never outlives the car it was staged on. A car that
 * leaves with staged installs still pending would otherwise leave those
 * specific `PartInstance`s permanently greyed out in the inventory. No-op
 * (same reference) if the car has no staged entry.
 */
export function clearStagedWork(state: GameState, carInstanceId: string): GameState {
  if (!(carInstanceId in state.stagedCarWork)) return state
  const stagedCarWork = Object.fromEntries(
    Object.entries(state.stagedCarWork).filter(([id]) => id !== carInstanceId),
  )
  return { ...state, stagedCarWork }
}

export interface StagedWorkResolution {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Immediate free refits: true when staging `action` (an
 * 'install') would resolve for FREE right now - zero labour (the picked
 * instance matches the target slot's own vacated baseline exactly, the
 * equivalence refit `refitLaborSlotsFor` prices free) AND not machine-shop
 * gated (no buried or signature slot needing machinery neither owned nor hired
 * today). A free refit is putting the car back together the way it was
 * found, not real work - the game store's `stageAction` resolves it right
 * away through the same job machinery Confirm would use, exactly as
 * `removePart` already resolves instantly, rather than parking it on the
 * staged list for a click that would spend nothing anyway. A costed install
 * (real labour) or a gated one always stays staged, so its gate reason can
 * show. `false` for an unresolvable car/part/slot - the caller's own fit
 * gate has already refused those before this ever runs.
 */
export function isFreeInstallRefit(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'install' }>,
  context: SimContext,
): boolean {
  const car = findWorkableCar(state, carInstanceId)
  const partInstance = state.partInventory.find((p) => p.id === action.partInstanceId)
  const catalogPart = partInstance ? context.partsById[partInstance.partId] : undefined
  const targetPartId = action.carPartId ?? catalogPart?.carPartId
  if (!car || !partInstance || !targetPartId) return false
  if (refitLaborSlotsFor(car, targetPartId, partInstance, context) > 0) return false
  const group = machineLineGroupFor(targetPartId, context)
  return !group || hasMachineLineFor(group, state)
}

interface PipelineOpResult {
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
 * (gates weld and the better paint finish); `fullCapability` is tier 3 owned
 * or hired today (hiring always grants the WHOLE line, not just tier 2 - see
 * `docs/design/systems/workshop-rework.md`'s tool-gates section) - gates the best
 * polish floor. The one reading of the rule: the game store's own
 * pre-confirm preview calls this rather than restating it, so the preview and
 * the charge can never gate differently. */
export function bodyLineCapability(state: GameState): BodyLineCapability {
  return {
    unlocked: hasMachineLineFor('body', state),
    fullCapability: state.toolTiers.body >= 3 || machineHiredToday('body', state),
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
function chargeAndApplyPipelineEffect(
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

/** One `pipeline-stage` staged action's resolution - one of the six generic
 * stages (strip/prep, beat, weld, fill-and-sand, prime, polish) on one zone.
 * A prerequisite the zone doesn't meet is a silent no-op (the same "nothing
 * to do" idiom `repairJobGate` uses), as is a zone needing a fresh panel
 * before hand work means anything - the car screen names that state on the
 * zone itself, so it is never a stage the player could reach and be surprised
 * by. The weld machine-shop gate and an empty shelf both log a `job-blocked`
 * entry, matching every other machine-shop refusal in this codebase. */
function resolvePipelineStageAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-stage' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
  const zone = car.zoneState[action.zoneId]
  const plan = planPipelineStage(action.stage, zone, bodyLineCapability(state))
  if (!plan.ok) {
    if (plan.reason === 'machine-line') {
      return {
        state,
        log: [
          {
            type: 'job-blocked',
            jobId: `pipeline-${carInstanceId}-${action.stage}-${action.zoneId}`,
            reason: 'machine-line',
          },
        ],
        laborSlotsUsed: 0,
      }
    }
    return NOOP_PIPELINE_RESULT(state)
  }
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
  const repairLevel = repairLevelForGroup(state.toolTiers, 'body')
  const laborSlotsRequired =
    plan.laborUnits * context.economy.energy.energyPerBandStepByToolTier[repairLevel]
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
 * One `pipeline-paint` staged action's resolution - needs the zone primed and
 * refuses silently (nothing to do) otherwise, including the stock-grade
 * colour gate `planPaintStage` enforces. A shelf short of that exact tin
 * (finish and colour together) logs a `job-blocked` entry instead, the same
 * treatment `resolvePipelineStageAction` gives the generic stages. On
 * success, the `paint` carrier's installed SKU is swapped to match the
 * completed grade BEFORE the zone mutation is charged and applied, so
 * `applyDerivedBodyBands`'s single-writer rule (which preserves whatever SKU
 * is already installed and only rewrites the band) carries the new one
 * through rather than the old.
 */
function resolvePipelinePaintAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-paint' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
  const model = context.modelsById[car.modelId]
  if (!model) return NOOP_PIPELINE_RESULT(state)
  const zone = car.zoneState[action.zoneId]
  const plan = planPaintStage(
    zone,
    action.colour,
    bodyLineCapability(state),
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
  const repairLevel = repairLevelForGroup(state.toolTiers, 'body')
  const laborSlotsRequired =
    plan.laborUnits * context.economy.energy.energyPerBandStepByToolTier[repairLevel]

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
 * One `pipeline-remove-panel` staged action's resolution: pulls `zoneId`'s
 * panel onto the shelf as a fresh `PartInstance` at its own severity, and
 * marks the zone missing - the same remove-to-inventory shape
 * `resolveRemovePart` (jobs.ts) uses for every other slot. Labour reads the
 * flat remove-part action point, the same figure every slot's removal
 * charges. A no-op on an already-missing zone: there is nothing there to
 * pull.
 */
function resolvePipelineRemovePanelAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-remove-panel' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
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
  if (oldPanelCatalogPart) {
    const harvestedBand = isMetalZoneState(zone)
      ? bandForSeverity(zone.metal)
      : bandForSeverity(zone.finish)
    partInventory = [
      ...partInventory,
      {
        id: `panel-${state.day}-${partInventory.length}`,
        partId: oldPanelCatalogPart.id,
        band: harvestedBand,
        origin: makeCarOrigin(car.id, carOriginLabel(model, car.year), state.day),
      },
    ]
  }

  const next = writeBackCar(
    { ...state, partInventory, energySpentToday: state.energySpentToday + laborSlotsRequired },
    carInstanceId,
    nextCar,
  )
  if (!next) return NOOP_PIPELINE_RESULT(state)
  return { state: next, log: [], laborSlotsUsed: laborSlotsRequired }
}

/**
 * One `pipeline-install-panel` staged action's resolution: consumes the
 * picked zone-panel `PartInstance` from inventory and fits it - metal at the
 * panel's own band on a metal zone, surface/finish reset - exactly what a
 * fresh physical panel leaves regardless of what stood there before. Needs
 * the zone missing first (`planRemovePanel` ran, or the zone was never
 * fitted): a zone still carrying its old panel refuses, matching every other
 * slot's replace-needs-empty-first rule. Labour is the fitting (bolt-on)
 * class, not a band-step unit - no separate materials charge, since the new
 * panel's price was already paid at purchase and lands on the car's ledger
 * here, the same moment `completeJob`'s install-part branch posts a part's
 * cost.
 */
function resolvePipelineInstallPanelAction(
  state: GameState,
  carInstanceId: string,
  action: Extract<StagedAction, { kind: 'pipeline-install-panel' }>,
  context: SimContext,
  laborAvailable: number,
): PipelineOpResult {
  const car = findWorkableCar(state, carInstanceId)
  if (!car || !car.zoneState) return NOOP_PIPELINE_RESULT(state)
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

  const laborSlotsRequired = context.economy.energy.energyByClass['bolt-on']
  if (laborSlotsRequired > laborAvailable) return NOOP_PIPELINE_RESULT(state)

  const nextZone = planInstallPanel(zone, newPanelInstance.band)
  const nextCar = applyDerivedBodyBands(
    { ...car, zoneState: { ...car.zoneState, [action.zoneId]: nextZone } },
    model,
    context,
  )
  const partInventory = state.partInventory.filter((p) => p.id !== action.partInstanceId)

  const isOwnedCar = state.ownedCars.some((c) => c.id === carInstanceId)
  const withInventory: GameState = {
    ...state,
    partInventory,
    energySpentToday: state.energySpentToday + laborSlotsRequired,
  }
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

/**
 * The Confirm resolver: resolves every staged action on one car at once,
 * against a single shared remaining-labor budget, through the exact same
 * `resolveJobLabor`/`findOrCreateJob` machinery the old per-click instant
 * flow always used - Confirm is a loop over that machinery, not a new
 * resolution path. Staged actions are processed in list order (first
 * staged, first dibs on today's labor); an action whose gate refuses (e.g.
 * the repair-cost affordability gate) or that only partially labors today
 * still leaves behind a normal, continuable `Job` - nothing here changes
 * what happens to an already-open job afterward. The car's staged list is
 * cleared unconditionally at the end, whether or not every action could be
 * fully labored today.
 *
 * A staged `repair` sizes its `NewJobSpec.laborSlotsRequired` via
 * `planGroupRepair` (bands.ts) - every non-mint, non-scrap part in the
 * group climbing toward the staged `targetBand`, at the group's own repair
 * level. A group with nothing left to repair (already there, or every
 * part scrap) simply produces no spec - the same "nothing to do" no-op
 * `repairJobGate` itself falls back on.
 *
 * `action.carPartId`, when set, passes straight through to the built
 * `NewJobSpec` (and into `planGroupRepair`'s `onlyPartId`) - a per-part
 * staged action resolves through this exact same loop, sized down to one
 * part instead of the whole group. Nothing else about the loop changes;
 * group-level and per-part staged actions on the same car are simply
 * different entries in the same `staged` list, each producing its own
 * spec and its own job.
 */
export function confirmStagedWork(
  state: GameState,
  carInstanceId: string,
  laborAvailable: number,
  context: SimContext,
): StagedWorkResolution {
  const staged = state.stagedCarWork[carInstanceId] ?? []
  let current = state
  let remainingLabor = laborAvailable
  const log: DayLogEntry[] = []

  for (const action of staged) {
    const car = findWorkableCar(current, carInstanceId)
    if (!car) break // the car left the shop mid-loop - nothing left to work on

    // An assembly op is a single atomic resolver, not a NewJobSpec - it
    // runs against the same shared remaining-labour budget and appends to
    // the same log, but never touches the repair/install job pipeline below.
    if (action.kind === 'remove-assembly') {
      const result = resolveRemoveAssembly(
        current,
        carInstanceId,
        action.assemblyId,
        context,
        remainingLabor,
      )
      current = result.state
      log.push(...result.log)
      remainingLabor -= result.laborSlotsUsed
      continue
    }
    if (action.kind === 'refit-assembly') {
      const container = assemblyContainerFor(current, carInstanceId, action.assemblyId)
      if (container) {
        const result = resolveRefitAssembly(current, container.id, context, remainingLabor)
        current = result.state
        log.push(...result.log)
        remainingLabor -= result.laborSlotsUsed
      }
      continue
    }
    // Every body-pipeline stage is likewise a single atomic resolver against
    // the same shared labour budget - never a NewJobSpec/Job, since a stage
    // is one zone mutation, not banded work on a whole slot.
    if (action.kind === 'pipeline-stage') {
      const result = resolvePipelineStageAction(
        current,
        carInstanceId,
        action,
        context,
        remainingLabor,
      )
      current = result.state
      log.push(...result.log)
      remainingLabor -= result.laborSlotsUsed
      continue
    }
    if (action.kind === 'pipeline-remove-panel') {
      const result = resolvePipelineRemovePanelAction(
        current,
        carInstanceId,
        action,
        context,
        remainingLabor,
      )
      current = result.state
      log.push(...result.log)
      remainingLabor -= result.laborSlotsUsed
      continue
    }
    if (action.kind === 'pipeline-install-panel') {
      const result = resolvePipelineInstallPanelAction(
        current,
        carInstanceId,
        action,
        context,
        remainingLabor,
      )
      current = result.state
      log.push(...result.log)
      remainingLabor -= result.laborSlotsUsed
      continue
    }
    if (action.kind === 'pipeline-paint') {
      const result = resolvePipelinePaintAction(
        current,
        carInstanceId,
        action,
        context,
        remainingLabor,
      )
      current = result.state
      log.push(...result.log)
      remainingLabor -= result.laborSlotsUsed
      continue
    }

    let spec: NewJobSpec | null = null
    if (action.kind === 'repair') {
      const plan = planGroupRepair(
        car,
        action.componentId,
        action.targetBand,
        current.toolTiers,
        context.partIdsByGroup,
        context.partsById,
        context.partsTaxonomyById,
        context.economy.restoration.repairStepFraction,
        context.economy.energy.energyPerBandStepByToolTier,
        action.carPartId,
        // Size staged repair labour with the benched crew's speed
        // discount, matching the store's Confirm-total preview.
        { staff: current.staff, economy: context.economy },
      )
      if (plan.partIds.length > 0) {
        spec = {
          carInstanceId,
          kind: 'repair-zone',
          componentId: action.componentId,
          targetBand: action.targetBand,
          carPartId: action.carPartId,
          laborSlotsRequired: plan.laborSlotsRequired,
        }
      }
    } else {
      // Labor sizes off the TARGET slot's own depth class - the picked
      // part's own catalog address when `action.carPartId` (the per-part
      // drawer) is unset, exactly how `applyJobToCar` itself resolves the
      // real target slot at completion. A refit matching the slot's own
      // `vacatedBaseline` (putting the car back the way it was found) is
      // free - `refitLaborSlotsFor` falls back to the plain class-based
      // cost whenever `partInstance` can't be resolved.
      const partInstance = current.partInventory.find((p) => p.id === action.partInstanceId)
      const catalogPart = partInstance ? context.partsById[partInstance.partId] : undefined
      const targetPartId = action.carPartId ?? catalogPart?.carPartId
      spec = targetPartId
        ? {
            carInstanceId,
            kind: 'install-part',
            componentId: action.componentId,
            partInstanceId: action.partInstanceId,
            carPartId: action.carPartId,
            laborSlotsRequired: partInstance
              ? refitLaborSlotsFor(car, targetPartId, partInstance, context)
              : installLaborSlotsFor(targetPartId, context),
          }
        : null
    }
    if (!spec) continue // nothing left to do for this staged action - skip it

    const result = resolveJobLabor(current, spec, remainingLabor, context)
    current = result.state
    log.push(...result.log)
    remainingLabor -= result.laborSlotsUsed
  }

  return { state: clearStagedWork(current, carInstanceId), log }
}

/**
 * A pure "what would this car look like if every currently planned action
 * fully completed" projection - no cash, no labor, no jobs created,
 * nothing in `state` mutated. Powers the Finances panel's pre-confirm
 * estimate: the projected car feeds straight into the same `marketValueYen`
 * the real guide value already uses, so "value after" is never a parallel
 * estimator. Deliberately simpler than `confirmStagedWork` (no labor
 * budget, no partial completion) - a preview assumes every planned action
 * finishes, which is exactly what "projected after Confirm, assuming
 * enough labor" should show.
 */
export function previewPlannedWork(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): CarInstance | null {
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return null
  const staged = state.stagedCarWork[carInstanceId] ?? []
  let parts = car.parts
  let zoneState = car.zoneState

  for (const action of staged) {
    if (action.kind === 'repair') {
      const candidateIds = action.carPartId
        ? [action.carPartId]
        : context.partIdsByGroup[action.componentId]
      for (const partId of candidateIds) {
        // A body value carrier's band is derived, never a direct repair
        // target, on a car that's on the zone model - see `confirmStagedWork`.
        if (car.zoneState && isBodyDerivedPart(partId)) continue
        const installed = parts[partId].installed
        if (!installed) continue
        const entry = context.partsTaxonomyById[partId]
        if (!entry || !canRepair(installed.band, entry)) continue
        if (bandIndex(installed.band) >= bandIndex(action.targetBand)) continue
        parts = { ...parts, [partId]: { installed: { ...installed, band: action.targetBand } } }
      }
    } else if (action.kind === 'remove-assembly') {
      // The assembly comes off - every member slot projects empty.
      const def = assemblyDefById(action.assemblyId, context)
      if (def) for (const member of def.members) parts = { ...parts, [member]: { installed: null } }
    } else if (action.kind === 'refit-assembly') {
      // The assembly goes back on - fill each member slot from the
      // container currently on the bench, if any.
      const container = assemblyContainerFor(state, carInstanceId, action.assemblyId)
      if (container) {
        for (const [member, instance] of Object.entries(container.members)) {
          if (instance)
            parts = { ...parts, [member as keyof typeof parts]: { installed: instance } }
        }
      }
    } else if (
      action.kind === 'pipeline-stage' ||
      action.kind === 'pipeline-remove-panel' ||
      action.kind === 'pipeline-install-panel' ||
      action.kind === 'pipeline-paint'
    ) {
      // Not projected: a body-pipeline stage moves zone state, not a band
      // directly, and this value preview only ever shows a projected BAND -
      // a per-zone preview belongs to the future representative-schematic
      // views, not this one.
      continue
    } else {
      const partInstance = state.partInventory.find((p) => p.id === action.partInstanceId)
      if (!partInstance) continue
      const catalogPart = context.partsById[partInstance.partId]
      const targetPartId = action.carPartId ?? catalogPart?.carPartId
      if (!targetPartId) continue
      parts = { ...parts, [targetPartId]: { installed: partInstance } }
      // Fitting a body value carrier refits the zones it covers, so the
      // projection carries the paint the car will owe rather than showing a
      // fresh kit over the finish it is about to lose (`applyJobToCar`).
      if (zoneState && isBodyDerivedPart(targetPartId)) {
        zoneState = refitCarrierZoneStates(zoneState, targetPartId, partInstance.band)
      }
    }
  }

  if (zoneState === car.zoneState) return { ...car, parts }
  const model = context.modelsById[car.modelId]
  const projected: CarInstance = { ...car, parts, zoneState }
  return model ? applyDerivedBodyBands(projected, model, context) : projected
}
