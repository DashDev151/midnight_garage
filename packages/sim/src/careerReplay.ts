import type {
  DayLogEntry,
  GameState,
  ReputationTier,
  SessionEventInput,
} from '@midnight-garage/content'
import { emptyDayActions } from './actions'
import type { NewJobSpec } from './actions'
import { advanceDay } from './advanceDay'
import {
  assemblyContainerFor,
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveRemoveAssemblyMember,
  resolveSwapAssemblyMember,
} from './assemblies'
import { planGroupRepair } from './bands'
import {
  resolveAttendAuction,
  resolveBuyoutInstant,
  settleAuctionHammer,
  settleAuctionLotLost,
} from './bidding'
import { resolveBuyCoffee } from './cafe'
import type { CareerCheckpoint, CareerScript } from './careerScript'
import type { SimContext } from './context'
import { resolveBuyConsumableTin, resolveBuyPaintTin } from './consumables'
import { crewContextFor } from './crewSkills'
import {
  beginInspectionVisit,
  resolveOwnedWorkup,
  resolveSendInspector,
  // Aliased since this module's own switch below has a case literal of the
  // same name (`case 'runDiagnosticTest':`) - labels are strings, not
  // bindings, so there is no real collision; the alias is purely so the two
  // don't read as the same thing at a glance.
  runDiagnosticTest as runDiagnosticTestImpl,
} from './diagnosis'
import { resolveBuyDyno, resolveDynoSession } from './dyno'
import { applyBayPurchase, applyMoves, moveCarToSlot, swapCars } from './facilities'
import { hashState } from './hashState'
import {
  findWorkableCar,
  installLaborSlotsFor,
  refitLaborSlotsFor,
  resolveHireMachineLine,
  resolveJobLabor,
  resolveReconditionLabor,
  resolveRemovePart,
} from './jobs'
import { energyMax } from './laborSlots'
import { resolveFittedMachiningLabor, resolveMachiningLabor } from './machiningJobs'
import { resolveAcceptMission, resolveDeliverMission } from './missions'
import { createInitialGameState } from './newGame'
import {
  resolvePipelineInstallPanelAction,
  resolvePipelinePaintAction,
  resolvePipelineRemovePanelAction,
  resolvePipelineStageAction,
} from './pipelineActions'
import {
  partIdOnStation,
  placeOnStationGateReason,
  resolveBuyPart,
  resolvePlaceOnStation,
  resolveScrapPart,
  resolveSellPart,
  resolveTakeFromStation,
} from './parts'
import { resolveAcceptSceneCommission, resolveDeliverSceneCommission } from './sceneCommissions'
import { resolveDismissStaff, resolveHireStaff, resolveReassignStaff } from './staff'
import {
  resolveRejectOffer,
  resolveScrapShell,
  resolveSellViaWalkIn,
  resolveSetForSale,
} from './selling'
import {
  resolveAcceptServiceJob,
  resolveRejectServiceJobOffer,
  resolveServiceJob,
} from './serviceJobs'
import { applyToolShopPurchase, applyToolUpgrade, toolLevelsFor } from './toolLines'

/** How much of today's labour pool is still free - the same figure the
 * store's `laborSlotsRemainingToday` computed property reads
 * (`energyMax(state, economy) - state.energySpentToday`, floored at zero). */
function remainingLabor(state: GameState, context: SimContext): number {
  return Math.max(0, energyMax(state, context.economy) - state.energySpentToday)
}

/** One event's effect: the state it leaves behind, and whatever day-log
 * entries it produced (empty for an event that moves no logged fact - a
 * refused action, or one of the handful of actions that were never logged
 * to begin with, `runDiagnosticTest`/`resolveSendInspector`/the two station
 * moves). */
interface EventEffect {
  state: GameState
  log: readonly DayLogEntry[]
}

/**
 * Replays one recorded player action through the same sim resolver(s) the
 * game store calls for it - exhaustive over `SessionEventInput`, so a new
 * event type content adds without a matching case here is a compile error.
 * That is the sprint's one structural guarantee: an unreplayable event type
 * can never reach this function silently.
 *
 * `endDay` is deliberately a no-op here rather than a resolver call: it is
 * positional, not causal - the interpreter's own per-day loop
 * (`replayCareerScript` below) already calls `advanceDay` once per script
 * day, exactly where the store's real `endDay` action would; replaying it a
 * second time here would double-advance the day. `acknowledgeTutorialStep`,
 * `skipTutorial` and `finishTutorial` have no sim resolver at all (the store
 * mutates `tutorialAcknowledgedSteps`/`tutorialStatus` directly), so each
 * case mirrors that same manual mutation instead of calling into a resolver
 * that does not exist.
 */
function applySessionEvent(
  state: GameState,
  event: SessionEventInput,
  context: SimContext,
): EventEffect {
  const remaining = remainingLabor(state, context)

  switch (event.type) {
    case 'buyDyno': {
      const result = resolveBuyDyno(state, context)
      return { state: result.state, log: result.log }
    }
    case 'runDynoSession': {
      const result = resolveDynoSession(state, event.payload.carInstanceId, remaining, context)
      return { state: result.state, log: result.log }
    }
    case 'machinePart': {
      const result = resolveMachiningLabor(
        state,
        event.payload.partInstanceId,
        event.payload.operationId,
        remaining,
        context,
      )
      return { state: result.state, log: result.log }
    }
    case 'machineFittedPart': {
      const result = resolveFittedMachiningLabor(
        state,
        event.payload.carId,
        event.payload.operationId,
        remaining,
        context,
      )
      return { state: result.state, log: result.log }
    }
    case 'placeOnStation': {
      const { station, partInstanceId } = event.payload
      if (placeOnStationGateReason(state, station, partInstanceId) !== null) {
        return { state, log: [] }
      }
      return { state: resolvePlaceOnStation(state, station, partInstanceId), log: [] }
    }
    case 'takeFromStation': {
      const { station } = event.payload
      if (partIdOnStation(state, station) === null) return { state, log: [] }
      return { state: resolveTakeFromStation(state, station), log: [] }
    }
    case 'beginInspectionVisit': {
      const result = beginInspectionVisit(state, event.payload.tier, context)
      return { state: result.state, log: result.log }
    }
    case 'runDiagnosticTest': {
      // Never logged to the day log either way - the trail entries it
      // writes are the record - so only the state (on a legal run) matters.
      const { lotId, symptomIndex, testId } = event.payload
      const result = runDiagnosticTestImpl(state, lotId, symptomIndex, testId, context)
      return result.outcome === 'ran' ? { state: result.state, log: [] } : { state, log: [] }
    }
    case 'resolveOwnedWorkup': {
      const result = resolveOwnedWorkup(state, event.payload.carInstanceId, context)
      return { state: result.state, log: result.log }
    }
    case 'resolveSendInspector': {
      const result = resolveSendInspector(state, event.payload.lotId, context)
      return result.outcome === 'done' ? { state: result.state, log: [] } : { state, log: [] }
    }
    case 'moveCar': {
      const { carId, to } = event.payload
      const result = applyMoves(state, [{ carInstanceId: carId, to }], context.economy, remaining)
      return { state: result.state, log: result.log }
    }
    case 'swapCars': {
      const { serviceCarId, parkingCarId } = event.payload
      const result = swapCars(state, serviceCarId, parkingCarId, context.economy, remaining)
      // The store logs a hand-built `cars-swapped` entry here rather than
      // whatever `swapCars` itself returns - mirrored exactly, not
      // `result.log` (facilities.ts's move resolvers carry no log of their
      // own; the day-log entry is synthesised at the call site).
      if (!result.changed) return { state, log: [] }
      return { state: result.state, log: [{ type: 'cars-swapped', serviceCarId, parkingCarId }] }
    }
    case 'moveCarToSlot': {
      const { carId, to, slotIndex } = event.payload
      const result = moveCarToSlot(state, carId, to, slotIndex, context.economy, remaining)
      // Same hand-built-log pattern as `swapCars` above.
      if (!result.changed) return { state, log: [] }
      return { state: result.state, log: [{ type: 'car-moved', carInstanceId: carId, to }] }
    }
    case 'buyBay': {
      const result = applyBayPurchase(
        state,
        event.payload.kind,
        context.facilities,
        context.economy,
      )
      return { state: result.state, log: result.log }
    }
    case 'buyToolShop': {
      const result = applyToolShopPurchase(state, event.payload.shopId, context)
      return { state: result.state, log: result.log }
    }
    case 'upgradeToolLine': {
      const result = applyToolUpgrade(state, event.payload.componentId, context)
      return { state: result.state, log: result.log }
    }
    case 'hireMachineLine': {
      const result = resolveHireMachineLine(state, event.payload.group, context)
      return { state: result.state, log: result.log }
    }
    case 'attendAuction': {
      const result = resolveAttendAuction(state, event.payload.tier, context)
      return { state: result.state, log: result.log }
    }
    case 'repair': {
      // Mirrors `gameStore.ts`'s `repair`: a missing car is a hard gate (no
      // plan, no resolver call, nothing logged), otherwise the plan sizes
      // the job's labour before `resolveJobLabor` spends it.
      const { carId, componentId, targetBand, carPartId } = event.payload
      const car = findWorkableCar(state, carId)
      if (!car) return { state, log: [] }
      const toolLevels = toolLevelsFor(state, context)
      const plan = planGroupRepair(
        car,
        componentId,
        targetBand,
        toolLevels,
        context.partIdsByGroup,
        context.partsById,
        context.partsTaxonomyById,
        context.economy.restoration.repairStepFraction,
        context.economy.energy.energyPerBandStepByToolTier,
        carPartId,
        crewContextFor(state, context.economy),
      )
      const spec: NewJobSpec = {
        carInstanceId: carId,
        kind: 'repair-zone',
        componentId,
        targetBand,
        carPartId,
        laborSlotsRequired: plan.laborSlotsRequired,
      }
      const result = resolveJobLabor(state, spec, remaining, context)
      return { state: result.state, log: result.log }
    }
    case 'install': {
      // Mirrors `gameStore.ts`'s `install`: labour sizes off the target
      // slot's refit/install figure before `resolveJobLabor` spends it.
      const { carId, componentId, partInstanceId, carPartId } = event.payload
      const car = findWorkableCar(state, carId)
      const partInstance = state.partInventory.find((p) => p.id === partInstanceId)
      const catalogPart = partInstance ? context.partsById[partInstance.partId] : undefined
      const targetPartId = carPartId ?? catalogPart?.carPartId
      const laborSlotsRequired = !targetPartId
        ? 1
        : car && partInstance
          ? refitLaborSlotsFor(car, targetPartId, partInstance, context)
          : installLaborSlotsFor(targetPartId, context)
      const spec: NewJobSpec = {
        carInstanceId: carId,
        kind: 'install-part',
        componentId,
        partInstanceId,
        carPartId,
        laborSlotsRequired,
      }
      const result = resolveJobLabor(state, spec, remaining, context)
      return { state: result.state, log: result.log }
    }
    case 'pipelineStage': {
      const { carId, zoneId, stage } = event.payload
      const result = resolvePipelineStageAction(
        state,
        carId,
        { kind: 'pipeline-stage', stage, zoneId },
        context,
        remaining,
      )
      return { state: result.state, log: result.log }
    }
    case 'pipelinePaint': {
      const { carId, zoneId, colour, grade } = event.payload
      const result = resolvePipelinePaintAction(
        state,
        carId,
        { kind: 'pipeline-paint', zoneId, colour, grade },
        context,
        remaining,
      )
      return { state: result.state, log: result.log }
    }
    case 'removePanel': {
      const { carId, zoneId } = event.payload
      const result = resolvePipelineRemovePanelAction(
        state,
        carId,
        { kind: 'pipeline-remove-panel', zoneId },
        context,
        remaining,
      )
      return { state: result.state, log: result.log }
    }
    case 'installPanel': {
      const { carId, zoneId, partInstanceId } = event.payload
      const result = resolvePipelineInstallPanelAction(
        state,
        carId,
        { kind: 'pipeline-install-panel', zoneId, partInstanceId },
        context,
        remaining,
      )
      return { state: result.state, log: result.log }
    }
    case 'removePart': {
      const { carId, carPartId } = event.payload
      if (context.assemblies.some((a) => a.members.includes(carPartId))) return { state, log: [] }
      const result = resolveRemovePart(state, carId, carPartId, context, remaining)
      return { state: result.state, log: result.log }
    }
    case 'removeAssembly': {
      const { carId, assemblyId } = event.payload
      const result = resolveRemoveAssembly(state, carId, assemblyId, context, remaining)
      // Unlike `refitAssembly`/`swapAssemblyMember` below, the store checks
      // `!result.ok` BEFORE pushing the day log here, so a refusal logs
      // nothing at all.
      return result.ok ? { state: result.state, log: result.log } : { state, log: [] }
    }
    case 'refitAssembly': {
      const { carId, assemblyId } = event.payload
      const container = assemblyContainerFor(state, carId, assemblyId)
      if (!container) return { state, log: [] }
      const result = resolveRefitAssembly(state, container.id, context, remaining)
      // The store pushes the day log unconditionally (a refusal still names
      // its reason) but only applies state on success - a refusing resolver
      // never changes state, so applying `result.state` either way is the
      // same value.
      return { state: result.state, log: result.log }
    }
    case 'swapAssemblyMember': {
      const { containerId, memberSlot, partInstanceId } = event.payload
      const result = resolveSwapAssemblyMember(
        state,
        containerId,
        memberSlot,
        partInstanceId,
        context,
        remaining,
      )
      return { state: result.state, log: result.log }
    }
    case 'removeAssemblyMember': {
      const { containerId, memberSlot } = event.payload
      const result = resolveRemoveAssemblyMember(state, containerId, memberSlot, context, remaining)
      return result.ok ? { state: result.state, log: result.log } : { state, log: [] }
    }
    case 'scrapPart': {
      const result = resolveScrapPart(state, event.payload.partInstanceId, context, remaining)
      return { state: result.state, log: result.log }
    }
    case 'sellPart': {
      const result = resolveSellPart(state, event.payload.partInstanceId, context)
      return { state: result.state, log: result.log }
    }
    case 'reconditionPart': {
      const { partInstanceId, targetBand } = event.payload
      const result = resolveReconditionLabor(state, partInstanceId, targetBand, remaining, context)
      return { state: result.state, log: result.log }
    }
    case 'buyout': {
      const result = resolveBuyoutInstant(state, event.payload.lotId, context)
      return { state: result.state, log: result.log }
    }
    case 'buyCoffee': {
      const result = resolveBuyCoffee(state, context)
      return { state: result.state, log: result.log }
    }
    case 'settleAuctionHammer': {
      const { lotId, priceYen } = event.payload
      const result = settleAuctionHammer(state, lotId, priceYen, context)
      return { state: result.state, log: result.log }
    }
    case 'loseAuctionLot': {
      return { state: settleAuctionLotLost(state, event.payload.lotId), log: [] }
    }
    case 'checkoutCart': {
      // The store composes one `resolveBuyPart` call per cart line-unit; the
      // cart's own contents are never themselves logged (`addToCart`/
      // `removeFromCart` log nothing), so replay drives the same loop off
      // the event's own recorded `items` list instead of a reconstructed
      // cart.
      let cur = state
      const log: DayLogEntry[] = []
      for (const item of event.payload.items) {
        const result = resolveBuyPart(cur, item.partId, context, event.payload.deliverySpeed)
        cur = result.state
        log.push(...result.log)
      }
      return { state: cur, log }
    }
    case 'buyConsumableTin': {
      const result = resolveBuyConsumableTin(state, event.payload.id, context)
      return { state: result.state, log: result.log }
    }
    case 'buyPaintTin': {
      const { finish, size, colour } = event.payload
      const result = resolveBuyPaintTin(state, finish, size, colour, context)
      return { state: result.state, log: result.log }
    }
    case 'acceptServiceJob': {
      const result = resolveAcceptServiceJob(state, event.payload.offerId, context)
      return { state: result.state, log: result.log }
    }
    case 'rejectServiceJobOffer': {
      const result = resolveRejectServiceJobOffer(state, event.payload.offerId)
      return { state: result.state, log: [] }
    }
    case 'acceptMission': {
      const result = resolveAcceptMission(state, event.payload.missionId, context)
      return { state: result.state, log: result.log }
    }
    case 'deliverMission': {
      // The store looks the active mission record up first; the payload
      // already carries both ids the resolver needs, so replay skips that
      // lookup and resolves directly against them.
      const { missionId, carInstanceId } = event.payload
      const result = resolveDeliverMission(state, missionId, carInstanceId, context)
      return { state: result.state, log: result.log }
    }
    case 'acceptSceneCommission': {
      const result = resolveAcceptSceneCommission(state, event.payload.scene)
      return { state: result.state, log: result.log }
    }
    case 'deliverSceneCommission': {
      const { scene, carInstanceId } = event.payload
      const result = resolveDeliverSceneCommission(state, scene, carInstanceId, context)
      return { state: result.state, log: result.log }
    }
    case 'completeServiceJob': {
      const resolution = resolveServiceJob(state, event.payload.jobId, context)
      if (resolution.outcome === 'not-found' || resolution.outcome === 'in-transit') {
        return { state, log: [] }
      }
      return { state: resolution.state, log: resolution.log }
    }
    case 'acceptOffer': {
      const result = resolveSellViaWalkIn(state, event.payload.carId, context)
      return { state: result.state, log: result.log }
    }
    case 'rejectOffer': {
      const result = resolveRejectOffer(state, event.payload.carId, context)
      return { state: result.state, log: result.log }
    }
    case 'setForSale': {
      const { carId, forSale, channelId } = event.payload
      const result = resolveSetForSale(state, carId, forSale, context, channelId)
      return { state: result.state, log: result.log }
    }
    case 'scrapShell': {
      const result = resolveScrapShell(state, event.payload.carId, context, remaining)
      return { state: result.state, log: result.log }
    }
    case 'endDay': {
      // Positional, not causal - see this function's own doc comment above.
      return { state, log: [] }
    }
    case 'acknowledgeTutorialStep': {
      const acknowledged = state.tutorialAcknowledgedSteps ?? []
      if (acknowledged.includes(event.payload.stepId)) return { state, log: [] }
      return {
        state: {
          ...state,
          tutorialAcknowledgedSteps: [...acknowledged, event.payload.stepId],
        },
        log: [],
      }
    }
    case 'skipTutorial': {
      if (state.tutorialStatus !== 'active') return { state, log: [] }
      return { state: { ...state, tutorialStatus: 'skipped' }, log: [] }
    }
    case 'finishTutorial': {
      if (state.tutorialStatus !== 'active') return { state, log: [] }
      return { state: { ...state, tutorialStatus: 'done' }, log: [] }
    }
    case 'hireStaff': {
      const result = resolveHireStaff(state, event.payload.candidateId, context)
      return { state: result.state, log: result.log }
    }
    case 'dismissStaff': {
      const result = resolveDismissStaff(state, event.payload.staffId)
      return { state: result.state, log: result.log }
    }
    case 'reassignStaff': {
      const { staffId, to } = event.payload
      const result = resolveReassignStaff(state, staffId, to)
      return { state: result.state, log: result.log }
    }
  }
}

/** One day's curve point - cash, cars, reputation and labour utilisation,
 * mirroring `bots/runCareer.ts`'s `CareerSnapshot` shape (a per-day curve is
 * already exactly what that carries) plus the two labour figures the flow
 * meter needs that a bot career never had to report. */
export interface CareerDaySnapshot {
  day: number
  cashYen: number
  carsOwned: number
  /** Cash plus owned cars valued at book price - the same simple, transparent
   * proxy `CareerSnapshot.netWorthEstimateYen` uses, not a real buyer
   * valuation. */
  netWorthEstimateYen: number
  reputationTier: ReputationTier
  reputationPoints: number
  labourSlotsUsed: number
  labourSlotsAvailable: number
}

/** One checkpoint's result: what was asked, whether it held, and the actual
 * figure - disclosed by default (brief A.5), never hard-gating. */
export interface CheckpointOutcome {
  day: number
  checkpoint: CareerCheckpoint
  passed: boolean
  actual: string
}

export interface CareerReplayResult {
  script: CareerScript
  finalState: GameState
  /** One entry per script day, in script order - every log entry that day
   * produced, from its own events AND from that day's `advanceDay` call, in
   * that order. The flow meter (`careerFlow.ts`) classifies these directly. */
  dayLogs: readonly (readonly DayLogEntry[])[]
  /** `hashState(finalState)` after each day's `advanceDay` call, in script
   * order - the golden-master sequence a re-run of the same script and seed
   * must reproduce exactly. */
  hashesByDay: readonly string[]
  snapshots: readonly CareerDaySnapshot[]
  checkpoints: readonly CheckpointOutcome[]
}

function carsBookValueYen(state: GameState, context: SimContext): number {
  return state.ownedCars.reduce((sum, car) => {
    const model = context.modelsById[car.modelId]
    return sum + (model?.bookValueYen ?? 0)
  }, 0)
}

function snapshotFor(
  scriptDay: number,
  state: GameState,
  labourSlotsUsed: number,
  labourSlotsAvailable: number,
  context: SimContext,
): CareerDaySnapshot {
  return {
    day: scriptDay,
    cashYen: state.cashYen,
    carsOwned: state.ownedCars.length,
    netWorthEstimateYen: state.cashYen + carsBookValueYen(state, context),
    reputationTier: state.reputationTier,
    reputationPoints: state.reputationPoints,
    labourSlotsUsed,
    labourSlotsAvailable,
  }
}

function evaluateCheckpoint(
  checkpoint: CareerCheckpoint,
  scriptDay: number,
  state: GameState,
  labourSlotsUsed: number,
): CheckpointOutcome {
  switch (checkpoint.kind) {
    case 'hash': {
      const actual = hashState(state)
      return { day: scriptDay, checkpoint, passed: actual === checkpoint.expected, actual }
    }
    case 'cashAtLeast':
      return {
        day: scriptDay,
        checkpoint,
        passed: state.cashYen >= checkpoint.amountYen,
        actual: String(state.cashYen),
      }
    case 'cashAtMost':
      return {
        day: scriptDay,
        checkpoint,
        passed: state.cashYen <= checkpoint.amountYen,
        actual: String(state.cashYen),
      }
    case 'carsOwned':
      return {
        day: scriptDay,
        checkpoint,
        passed: state.ownedCars.length === checkpoint.count,
        actual: String(state.ownedCars.length),
      }
    case 'reputationTier':
      return {
        day: scriptDay,
        checkpoint,
        passed: state.reputationTier === checkpoint.tier,
        actual: state.reputationTier,
      }
    case 'labourUsedAtMost':
      return {
        day: scriptDay,
        checkpoint,
        passed: labourSlotsUsed <= checkpoint.slots,
        actual: String(labourSlotsUsed),
      }
  }
}

/**
 * Replays a whole career script deterministically: day 1 starts from
 * `createInitialGameState(context, script.seed)`, exactly the fresh-career
 * seed every real career (and the balance harness) starts from; each script
 * day applies its events in recorded order through `applySessionEvent`, then
 * calls `advanceDay` once with an empty `DayActions` batch (queued actions
 * are the bot-only surface - the player's own actions, replayed here, are
 * always the direct-resolver path) and the same `state.seed + state.day`
 * derivation `advanceDay` is contracted to everywhere else.
 *
 * A script's `days` must list every day of the career in order starting at
 * 1 with no gaps - the same requirement a real recorded session already
 * satisfies (the store's `endDay` action is itself a logged event, so every
 * day a real player advanced through appears). A mismatched `day` number
 * throws rather than silently reprocessing the wrong day.
 */
export function replayCareerScript(script: CareerScript, context: SimContext): CareerReplayResult {
  let state = createInitialGameState(context, script.seed)
  const dayLogs: DayLogEntry[][] = []
  const hashesByDay: string[] = []
  const snapshots: CareerDaySnapshot[] = []
  const checkpoints: CheckpointOutcome[] = []

  for (const scriptDay of script.days) {
    if (scriptDay.day !== state.day) {
      throw new Error(
        `replayCareerScript: script "${script.name}" expected day ${state.day} next, ` +
          `found day ${scriptDay.day} - career scripts must list every day in order with no gaps`,
      )
    }

    const eventLog: DayLogEntry[] = []
    for (const event of scriptDay.events) {
      const effect = applySessionEvent(state, event, context)
      state = effect.state
      eventLog.push(...effect.log)
    }

    // Captured before `advanceDay`'s day-boundary tick resets the pool for
    // tomorrow - this is the day's own labour spend, the flow meter's
    // labour-utilisation series (D3).
    const labourSlotsUsed = state.energySpentToday
    const labourSlotsAvailable = energyMax(state, context.economy)

    const result = advanceDay(state, emptyDayActions(), state.seed + state.day, context)
    state = result.state

    const dayLog = [...eventLog, ...result.log]
    dayLogs.push(dayLog)
    hashesByDay.push(hashState(state))
    snapshots.push(
      snapshotFor(scriptDay.day, state, labourSlotsUsed, labourSlotsAvailable, context),
    )
    for (const checkpoint of scriptDay.checkpoints) {
      checkpoints.push(evaluateCheckpoint(checkpoint, scriptDay.day, state, labourSlotsUsed))
    }
  }

  return { script, finalState: state, dayLogs, hashesByDay, snapshots, checkpoints }
}
