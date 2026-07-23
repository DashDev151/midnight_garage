import type {
  DayLogEntry,
  GameState,
  RequirementSpec,
  StoryMission,
  StoryMissionRecord,
} from '@midnight-garage/content'
import { applyReputationDelta } from './calendar'
import { carLedgerFor, deleteCarLedger } from './carLedger'
import { stockNewlyUnlockedTier } from './catalogs'
import type { SimContext } from './context'
import { computeDerivedStats } from './derivedStats'
import { releaseCarFromShop } from './facilities'
import { lapTimeSecondsFor } from './lapModel'
import { evaluateRequirement, type RequirementResult } from './requirements'
import { createRng, hashStringToSeed } from './rng'
import { applySpecialtyDelta } from './serviceJobs'
import { dissolveAssembliesForCar } from './assemblies'
import { clearStagedWork } from './stagedWork'

export interface MissionResolution {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The next locked mission that's eligible to be offered -
 * `context.storyMissions` is pre-sorted by `gateReputationPoints`
 * (`buildSimContext`), so the first mission with no progress record at all
 * is the campaign's current frontier. Returns `undefined` the instant an
 * EARLIER mission (in gate order) isn't `delivered` yet (including one
 * that's currently `offered`/`active`) - the strictly linear campaign never
 * lets a later mission jump ahead, and this same check is what keeps "at
 * most one offered/active mission at a time" true without a separate
 * count check.
 */
function nextOfferableMission(
  records: readonly StoryMissionRecord[],
  context: SimContext,
): StoryMission | undefined {
  const recordsById = new Map(records.map((record) => [record.missionId, record]))
  for (const mission of context.storyMissions) {
    const record = recordsById.get(mission.id)
    if (!record) return mission
    if (record.status !== 'delivered') return undefined
  }
  return undefined
}

/**
 * The day-boundary mission tick - offer the next locked mission if
 * reputation clears its gate, and nothing else. Story missions cannot
 * lapse or reoffer; the budget cap and requirements are the whole
 * challenge. At most one offered/active mission exists at a time, so this
 * adds at most one `offered` record. Offering is silent - the player
 * reads the card appearing, no log entry.
 */
export function advanceStoryMissions(state: GameState, context: SimContext): MissionResolution {
  const candidate = nextOfferableMission(state.storyMissions, context)
  if (!candidate || state.reputationPoints < candidate.gateReputationPoints) {
    return { state, log: [] }
  }
  const storyMissions: StoryMissionRecord[] = [
    ...state.storyMissions,
    { missionId: candidate.id, status: 'offered' as const, acceptedOnDay: null },
  ]
  return { state: { ...state, storyMissions }, log: [] }
}

/** Offered -> active, stamping `acceptedOnDay` only - there is no
 * deadline to count from. A no-op (matching every other instant
 * resolver's contract) when the mission isn't actually `offered` or
 * doesn't exist. */
export function resolveAcceptMission(
  state: GameState,
  missionId: string,
  context: SimContext,
): MissionResolution {
  const record = state.storyMissions.find((r) => r.missionId === missionId)
  if (!record || record.status !== 'offered') return { state, log: [] }
  const mission = context.storyMissionsById[missionId]
  if (!mission) return { state, log: [] }

  const storyMissions = state.storyMissions.map((r) =>
    r.missionId === missionId ? { ...r, status: 'active' as const, acceptedOnDay: state.day } : r,
  )
  return {
    state: { ...state, storyMissions },
    log: [{ type: 'mission-accepted', missionId }],
  }
}

export interface MissionGradeReport {
  pass: boolean
  lines: RequirementResult[]
}

/**
 * Pure, free, repeatable - every one of the mission's requirements
 * (already including its mirrored `budgetCap`). No deadline check - story
 * missions cannot lapse, so there is no day-of-delivery cutoff to grade.
 * No state change; an unresolvable mission or car reports an outright
 * fail with no lines rather than throwing.
 */
export function gradeMissionCar(
  state: GameState,
  missionId: string,
  carInstanceId: string,
  context: SimContext,
): MissionGradeReport {
  const mission = context.storyMissionsById[missionId]
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!mission || !car) return { pass: false, lines: [] }

  const model = context.modelsById[car.modelId]
  const ledger = carLedgerFor(state, carInstanceId)
  const lines = mission.requirements.map((requirement) =>
    evaluateRequirement(requirement, car, ledger, state.day, context, model),
  )

  return { pass: lines.every((line) => line.pass), lines }
}

function isStatThreshold(
  requirement: RequirementSpec,
): requirement is Extract<RequirementSpec, { kind: 'statThreshold' }> {
  return requirement.kind === 'statThreshold'
}

function isLapTimeCeiling(
  requirement: RequirementSpec,
): requirement is Extract<RequirementSpec, { kind: 'lapTimeCeiling' }> {
  return requirement.kind === 'lapTimeCeiling'
}

/**
 * Whether every `statThreshold` requirement on `mission` clears its `min`
 * by at least `tipTriggerFraction` AND every `lapTimeCeiling` requirement
 * clears its `maxSeconds` by at least `lapTipTriggerFraction` - the tip
 * condition. A mission authoring neither kind has nothing to overdeliver
 * against, so it never earns a tip (never vacuously true; `four-wheels`, a
 * `roadworthy`-only mission, stays tipless by design). A `lapTimeCeiling`
 * mission whose car cannot even set a time (`lapTimeSeconds === null` - no
 * tyres fitted, or scrap-band) never tips either.
 */
function earnsTip(
  mission: StoryMission,
  stats: ReturnType<typeof computeDerivedStats>,
  lapTimeSeconds: number | null,
): boolean {
  const thresholds = mission.requirements.filter(isStatThreshold)
  const lapCeilings = mission.requirements.filter(isLapTimeCeiling)
  if (thresholds.length === 0 && lapCeilings.length === 0) return false
  const thresholdsClear = thresholds.every(
    (r) => stats[r.stat] >= r.min * (1 + mission.tipTriggerFraction),
  )
  const lapsClear = lapCeilings.every(
    (r) =>
      lapTimeSeconds !== null &&
      lapTimeSeconds <= r.maxSeconds * (1 - mission.lapTipTriggerFraction),
  )
  return thresholdsClear && lapsClear
}

/**
 * Requires `gradeMissionCar` to pass; removes the car (the sale path's own
 * release/staged-work/ledger cleanup - never a market sale, so no
 * market-heat/player-sales bump), pays `payoutYen` (+ a tip when
 * `earnsTip` above holds), and applies `reputationReward` (+ its
 * `specialtyGroups` split) exactly like a completed service job. A no-op
 * when the mission isn't `active`, the car doesn't exist, or grading
 * fails.
 */
export function resolveDeliverMission(
  state: GameState,
  missionId: string,
  carInstanceId: string,
  context: SimContext,
): MissionResolution {
  const record = state.storyMissions.find((r) => r.missionId === missionId)
  if (!record || record.status !== 'active') return { state, log: [] }
  const mission = context.storyMissionsById[missionId]
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!mission || !car) return { state, log: [] }

  const grade = gradeMissionCar(state, missionId, carInstanceId, context)
  if (!grade.pass) return { state, log: [] }

  const model = context.modelsById[car.modelId]
  let tipYen = 0
  if (model) {
    const stats = computeDerivedStats(
      model,
      car,
      context.partsById,
      context.partsTaxonomy,
      context.economy,
    )
    const lapTimeSeconds = lapTimeSecondsFor(car, model, context)
    if (earnsTip(mission, stats, lapTimeSeconds)) {
      tipYen = Math.round(mission.payoutYen * mission.tipFraction)
    }
  }

  const clearedState = dissolveAssembliesForCar(
    clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId),
    carInstanceId,
  )
  const withReputation = applyReputationDelta(
    clearedState,
    mission.reputationReward,
    context.economy,
  )
  const { state: withSpecialty, deltas: specialtyGained } = applySpecialtyDelta(
    withReputation,
    mission.specialtyGroups,
    mission.reputationReward,
  )

  const storyMissions = withSpecialty.storyMissions.map((r) =>
    r.missionId === missionId ? { ...r, status: 'delivered' as const } : r,
  )
  const totalPayoutYen = mission.payoutYen + tipYen

  const deliveredState = deleteCarLedger(
    {
      ...withSpecialty,
      cashYen: withSpecialty.cashYen + totalPayoutYen,
      ownedCars: withSpecialty.ownedCars.filter((c) => c.id !== carInstanceId),
      storyMissions,
    },
    carInstanceId,
  )

  const log: DayLogEntry[] = [
    {
      type: 'mission-delivered',
      missionId,
      payoutYen: mission.payoutYen,
      tipYen,
      reputationGained: mission.reputationReward,
      specialtyGained,
    },
  ]

  // A guarantor mission's reward is a tier unlock, not just yen - the
  // newly-open room gets stocked THIS SAME DAY (the "come by Thursday"
  // beat needs a stocked room, not an empty one), reusing the day-1
  // seeding path (`stockNewlyUnlockedTier`, catalogs.ts). The delivery
  // event is a one-time fact per mission id, so the rng stream it derives
  // (mission id + car instance id) is deterministic and never reused.
  if (mission.unlocksAuctionTier) {
    const tier = mission.unlocksAuctionTier
    const rng = createRng(hashStringToSeed(`tier-unlock:${missionId}:${carInstanceId}`))
    const freshLots = stockNewlyUnlockedTier(deliveredState, context, deliveredState.day, tier, rng)
    if (freshLots.length > 0) {
      return {
        state: {
          ...deliveredState,
          activeAuctionLots: [...deliveredState.activeAuctionLots, ...freshLots],
        },
        log: [...log, { type: 'auction-catalog-refreshed', tier, lotCount: freshLots.length }],
      }
    }
  }

  return { state: deliveredState, log }
}
