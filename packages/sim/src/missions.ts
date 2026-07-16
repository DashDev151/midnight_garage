import type {
  DayLogEntry,
  GameState,
  RequirementSpec,
  StoryMission,
  StoryMissionRecord,
} from '@midnight-garage/content'
import { applyReputationDelta } from './calendar'
import { carLedgerFor, deleteCarLedger } from './carLedger'
import type { SimContext } from './context'
import { computeDerivedStats } from './derivedStats'
import { releaseCarFromShop } from './facilities'
import { evaluateRequirement, type RequirementResult } from './requirements'
import { applySpecialtyDelta } from './serviceJobs'
import { clearStagedWork } from './stagedWork'

export interface MissionResolution {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Sprint 76 decision 3: the next locked mission that's eligible to be
 * offered - `context.storyMissions` is pre-sorted by `gateReputationPoints`
 * (`buildSimContext`), so the first mission with no progress record at all
 * is the campaign's current frontier. Returns `undefined` the instant an
 * EARLIER mission (in gate order) isn't `delivered` yet (including one
 * that's currently `offered`/`active`/`lapsed`) - the strictly linear
 * campaign never lets a later mission jump ahead, and this same check is
 * what keeps "at most one offered/active mission at a time" true without a
 * separate count check.
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
 * Sprint 76 decision 3-4: the day-boundary mission tick - lapse an overdue
 * active mission, reoffer a lapsed one whose wait elapsed, then offer the
 * next locked mission if reputation clears its gate. Each step can add at
 * most one log entry (at most one offered/active/lapsed-awaiting-reoffer
 * mission exists at a time), and the three steps run in this order so a
 * mission reoffered today is never also treated as "still locked" by the
 * gate step later in the same tick.
 */
export function advanceStoryMissions(state: GameState, context: SimContext): MissionResolution {
  const log: DayLogEntry[] = []
  let next = state
  let records = state.storyMissions

  records = records.map((record) => {
    if (record.status !== 'active' || record.dueOnDay === null || state.day < record.dueOnDay) {
      return record
    }
    const mission = context.storyMissionsById[record.missionId]
    if (!mission) return record
    const before = next.reputationPoints
    next = applyReputationDelta(next, -mission.lapseReputationPenalty, context.economy)
    const reputationLost = before - next.reputationPoints
    const reofferOnDay = state.day + mission.reofferDays
    log.push({ type: 'mission-lapsed', missionId: record.missionId, reputationLost, reofferOnDay })
    return { ...record, status: 'lapsed' as const, dueOnDay: null, reofferOnDay }
  })

  records = records.map((record) => {
    if (
      record.status !== 'lapsed' ||
      record.reofferOnDay === null ||
      state.day < record.reofferOnDay
    ) {
      return record
    }
    log.push({ type: 'mission-reoffered', missionId: record.missionId })
    return { ...record, status: 'offered' as const, reofferOnDay: null }
  })

  const candidate = nextOfferableMission(records, context)
  if (candidate && next.reputationPoints >= candidate.gateReputationPoints) {
    records = [
      ...records,
      {
        missionId: candidate.id,
        status: 'offered' as const,
        acceptedOnDay: null,
        dueOnDay: null,
        reofferOnDay: null,
      },
    ]
  }

  return { state: { ...next, storyMissions: records }, log }
}

/** Sprint 76 decision 4: offered -> active, stamping `acceptedOnDay`/
 * `dueOnDay`. A no-op (matching every other instant resolver's contract) when
 * the mission isn't actually `offered` or doesn't exist. */
export function resolveAcceptMission(
  state: GameState,
  missionId: string,
  context: SimContext,
): MissionResolution {
  const record = state.storyMissions.find((r) => r.missionId === missionId)
  if (!record || record.status !== 'offered') return { state, log: [] }
  const mission = context.storyMissionsById[missionId]
  if (!mission) return { state, log: [] }

  const dueOnDay = state.day + mission.deadlineDays
  const storyMissions = state.storyMissions.map((r) =>
    r.missionId === missionId
      ? { ...r, status: 'active' as const, acceptedOnDay: state.day, dueOnDay }
      : r,
  )
  return {
    state: { ...state, storyMissions },
    log: [{ type: 'mission-accepted', missionId, dueOnDay }],
  }
}

export interface MissionGradeReport {
  pass: boolean
  lines: RequirementResult[]
}

/**
 * Sprint 76 decision 4: pure, free, repeatable - every one of the mission's
 * requirements (already including its mirrored `budgetCap`, decision 2)
 * plus a `deadline` check built fresh from the mission's own live progress
 * record (`dueOnDay` is per-playthrough state, never authored content - see
 * `storyMission.ts`'s module doc). No state change; an unresolvable mission
 * or car reports an outright fail with no lines rather than throwing.
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

  const record = state.storyMissions.find((r) => r.missionId === missionId)
  if (record?.dueOnDay != null) {
    lines.push(
      evaluateRequirement(
        { kind: 'deadline', dueOnDay: record.dueOnDay },
        car,
        ledger,
        state.day,
        context,
        model,
      ),
    )
  }

  return { pass: lines.every((line) => line.pass), lines }
}

function isStatThreshold(
  requirement: RequirementSpec,
): requirement is Extract<RequirementSpec, { kind: 'statThreshold' }> {
  return requirement.kind === 'statThreshold'
}

/**
 * Sprint 76 decision 4: whether every `statThreshold` requirement on
 * `mission` clears its `min` by at least `tipTriggerFraction` - the tip
 * condition. A mission authoring no `statThreshold` at all has nothing to
 * overdeliver against, so it never earns a tip (never vacuously true).
 */
function earnsTip(mission: StoryMission, stats: ReturnType<typeof computeDerivedStats>): boolean {
  const thresholds = mission.requirements.filter(isStatThreshold)
  if (thresholds.length === 0) return false
  return thresholds.every((r) => stats[r.stat] >= r.min * (1 + mission.tipTriggerFraction))
}

/**
 * Sprint 76 decision 4: requires `gradeMissionCar` to pass; removes the car
 * (the sale path's own release/staged-work/ledger cleanup, decision reuse -
 * never a market sale, so no market-heat/player-sales bump), pays
 * `payoutYen` (+ a tip when `earnsTip` above holds), and applies
 * `reputationReward` (+ its `specialtyGroups` split) exactly like a
 * completed service job. A no-op when the mission isn't `active`, the car
 * doesn't exist, or grading fails.
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
    if (earnsTip(mission, stats)) tipYen = Math.round(mission.payoutYen * mission.tipFraction)
  }

  const clearedState = clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId)
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

  return {
    state: deleteCarLedger(
      {
        ...withSpecialty,
        cashYen: withSpecialty.cashYen + totalPayoutYen,
        ownedCars: withSpecialty.ownedCars.filter((c) => c.id !== carInstanceId),
        storyMissions,
      },
      carInstanceId,
    ),
    log: [
      {
        type: 'mission-delivered',
        missionId,
        payoutYen: mission.payoutYen,
        tipYen,
        reputationGained: mission.reputationReward,
        specialtyGained,
      },
    ],
  }
}
