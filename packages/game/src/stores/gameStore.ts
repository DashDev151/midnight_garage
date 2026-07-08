import { BUYERS, CARS, HIDDEN_ISSUES, PARTS } from '@midnight-garage/content'
import type {
  CarInstance,
  CarModel,
  DayLogEntry,
  GameState,
  Job,
  Part,
  PartInstance,
  Slot,
  StatBlock,
  Zone,
} from '@midnight-garage/content'
import { resolveCarDisplayName } from '@midnight-garage/content'
import {
  advanceDay,
  availableLaborSlots,
  buildSimContext,
  computeDerivedStats,
  createInitialGameState,
  createRng,
  DayActionsSchema,
  generateAuctionCarInstance,
  type DayActions,
  type LaborAssignment,
  type NewJobSpec,
  type SimContext,
} from '@midnight-garage/sim'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { INSTALL_LABOR_SLOTS, repairLaborSlotsFor } from '../constants'

/** A fully-defaulted, typed empty action set - End Day with nothing queued. */
export function emptyActions(): DayActions {
  return DayActionsSchema.parse({})
}

/** Fixed default seed for a new game until seed selection is a real feature. */
const DEFAULT_SEED = 1

/** A car paired with its resolved model, display name, and derived stats. */
export interface DetailedCar {
  car: CarInstance
  model: CarModel
  displayName: string
  stats: StatBlock
}

/** Everything the car-detail screen needs for one car. */
export interface CarDetail extends DetailedCar {
  jobs: Job[]
  pendingJobs: NewJobSpec[]
}

/**
 * The state bridge between the pure sim and Vue. Holds the one object
 * Dexie will persist in Sprint 7 (`gameState`), the static content
 * `context` (rebuilt each session, never saved), the running day log, and
 * the player's not-yet-committed job plan (`pendingJobs`) for the current
 * day. The interactive per-day seed uses the same `seed + day` derivation
 * as the balance harness, so a played game is as reproducible as a bot
 * career.
 */
export const useGameStore = defineStore('game', () => {
  // Content catalogs are static and heavy; shallowRef avoids deep reactivity we never mutate.
  const context = shallowRef<SimContext>(buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES))
  const gameState = ref<GameState>(createInitialGameState(context.value, DEFAULT_SEED))
  const dayLog = ref<DayLogEntry[]>([])
  const pendingJobs = ref<NewJobSpec[]>([])
  // Monotonic counter for dev-granted content ids (dev-only, so non-deterministic is fine).
  const grantCounter = ref(0)

  const day = computed(() => gameState.value.day)
  const cashYen = computed(() => gameState.value.cashYen)
  const reputationTier = computed(() => gameState.value.reputationTier)
  const ownedCarCount = computed(() => gameState.value.ownedCars.length)
  const laborSlotsPerDay = computed(() => availableLaborSlots(gameState.value))

  function detailFor(car: CarInstance): DetailedCar {
    const model = context.value.modelsById[car.modelId]
    if (!model) throw new Error(`owned car ${car.id} references unknown model ${car.modelId}`)
    return {
      car,
      model,
      displayName: resolveCarDisplayName(model),
      stats: computeDerivedStats(model, car, context.value.partsById),
    }
  }

  const carsDetailed = computed<DetailedCar[]>(() => gameState.value.ownedCars.map(detailFor))

  const ownedCarNames = computed(() => carsDetailed.value.map((d) => d.displayName))

  function resolveModelName(modelId: string): string {
    const model = context.value.modelsById[modelId]
    return model ? resolveCarDisplayName(model) : modelId
  }

  /** Display label for a part (parody-branded from day one, no naming flip). */
  function partName(partId: string): string {
    const part = context.value.partsById[partId]
    return part ? `${part.brand} ${part.name}` : partId
  }

  /** Full detail bundle for one owned car, or undefined if not owned. */
  function carDetail(carId: string): CarDetail | undefined {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    if (!car) return undefined
    return {
      ...detailFor(car),
      jobs: gameState.value.jobs.filter((j) => j.carInstanceId === carId),
      pendingJobs: pendingJobs.value.filter((j) => j.carInstanceId === carId),
    }
  }

  /** Parts in inventory that fit an empty slot on the given car (slot + required tags). */
  function installablePartsFor(carId: string, slot: Slot): PartInstance[] {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    const model = car ? context.value.modelsById[car.modelId] : undefined
    if (!car || !model || car.buildSheet[slot]) return []
    return gameState.value.partInventory.filter((pi) => {
      const part = context.value.partsById[pi.partId]
      if (!part || part.slot !== slot) return false
      return part.requiredTags.every((tag) => model.tags.includes(tag))
    })
  }

  // --- day planning -----------------------------------------------------

  function isZoneBusy(carId: string, zone: Zone): boolean {
    const inProgress = gameState.value.jobs.some(
      (j) => j.carInstanceId === carId && j.kind === 'repair-zone' && j.zone === zone,
    )
    const queued = pendingJobs.value.some(
      (j) => j.carInstanceId === carId && j.kind === 'repair-zone' && j.zone === zone,
    )
    return inProgress || queued
  }

  /** Queue a zone repair for the current day (committed on End Day). */
  function queueRepair(carId: string, zone: Zone): void {
    const car = gameState.value.ownedCars.find((c) => c.id === carId)
    if (!car || isZoneBusy(carId, zone)) return
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'repair-zone',
      zone,
      laborSlotsRequired: repairLaborSlotsFor(car.condition[zone]),
    }
    pendingJobs.value = [...pendingJobs.value, spec]
  }

  /** Queue installing an owned part into an empty slot (committed on End Day). */
  function queueInstall(carId: string, slot: Slot, partInstanceId: string): void {
    const spec: NewJobSpec = {
      carInstanceId: carId,
      kind: 'install-part',
      slot,
      partInstanceId,
      laborSlotsRequired: INSTALL_LABOR_SLOTS,
    }
    pendingJobs.value = [...pendingJobs.value, spec]
  }

  function cancelPending(index: number): void {
    pendingJobs.value = pendingJobs.value.filter((_, i) => i !== index)
  }

  /**
   * Auto-allocates the day's labor slots across in-progress jobs first
   * (continue what's started), then newly-queued jobs in order, and returns
   * the full DayActions to commit. Predicted ids for new jobs match
   * advanceDay's `job-${day}-${index}` scheme.
   */
  function planActions(): DayActions {
    let remaining = laborSlotsPerDay.value
    const laborAssignments: LaborAssignment[] = []

    for (const job of gameState.value.jobs) {
      if (remaining <= 0) break
      const need = job.laborSlotsRequired - job.laborSlotsSpent
      if (need <= 0) continue
      const slots = Math.min(need, remaining)
      laborAssignments.push({ jobId: job.id, laborSlots: slots })
      remaining -= slots
    }

    pendingJobs.value.forEach((spec, i) => {
      if (remaining <= 0) return
      const slots = Math.min(spec.laborSlotsRequired, remaining)
      laborAssignments.push({ jobId: `job-${gameState.value.day}-${i}`, laborSlots: slots })
      remaining -= slots
    })

    return DayActionsSchema.parse({ createJobs: pendingJobs.value, laborAssignments })
  }

  // --- day advance ------------------------------------------------------

  function advance(actions: DayActions): void {
    const state = gameState.value
    const result = advanceDay(state, actions, state.seed + state.day, context.value)
    gameState.value = result.state
    dayLog.value.push(...result.log)
  }

  /** Low-level advance (dev warp, tests). Does not touch the pending plan. */
  function endDay(actions: DayActions = emptyActions()): void {
    advance(actions)
  }

  /** Player-facing End Day: commit the queued plan with auto-planned labor. */
  function commitDay(): void {
    advance(planActions())
    pendingJobs.value = []
  }

  function newGame(seed: number = DEFAULT_SEED): void {
    gameState.value = createInitialGameState(context.value, seed)
    dayLog.value = []
    pendingJobs.value = []
  }

  // --- dev-console affordances (dev build only) -------------------------

  function devGiveCash(amountYen: number): void {
    gameState.value = { ...gameState.value, cashYen: gameState.value.cashYen + amountYen }
  }

  /** Spawn a rough auction-grade car of the given model (random if omitted) into the garage. */
  function devGrantCar(modelId?: string): void {
    const models = context.value.models
    const model =
      (modelId && context.value.modelsById[modelId]) || models[grantCounter.value % models.length]
    if (!model) return
    grantCounter.value += 1
    const id = `dev-car-${grantCounter.value}`
    const car = generateAuctionCarInstance(
      model,
      context.value.hiddenIssuesByZone,
      id,
      createRng(grantCounter.value),
    )
    gameState.value = { ...gameState.value, ownedCars: [...gameState.value.ownedCars, car] }
  }

  /** Add a part from the catalog to inventory as a new instance. */
  function devGrantPart(partId: string): void {
    const part = context.value.partsById[partId]
    if (!part) return
    grantCounter.value += 1
    const instance: PartInstance = {
      id: `dev-part-${grantCounter.value}`,
      partId: part.id,
      conditionPercent: 100,
      genuinePeriod: false,
    }
    gameState.value = {
      ...gameState.value,
      partInventory: [...gameState.value.partInventory, instance],
    }
  }

  /** The parts catalog, for the dev grant picker. */
  const partsCatalog = computed<readonly Part[]>(() => context.value.parts)
  const modelsCatalog = computed<readonly CarModel[]>(() => context.value.models)

  return {
    gameState,
    dayLog,
    pendingJobs,
    day,
    cashYen,
    reputationTier,
    ownedCarCount,
    laborSlotsPerDay,
    carsDetailed,
    ownedCarNames,
    partsCatalog,
    modelsCatalog,
    resolveModelName,
    partName,
    carDetail,
    installablePartsFor,
    queueRepair,
    queueInstall,
    cancelPending,
    endDay,
    commitDay,
    newGame,
    devGiveCash,
    devGrantCar,
    devGrantPart,
  }
})
