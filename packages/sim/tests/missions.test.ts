import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type GameState,
  type StoryMission,
  type StoryMissionRecord,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { buildSimContext, type SimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import {
  advanceStoryMissions,
  gradeMissionCar,
  resolveAcceptMission,
  resolveDeliverMission,
} from '../src/missions'
import { createInitialGameState } from '../src/newGame'
import { buildCarInstance, testSpecialty, uniformCarParts } from './testFixtures'

const CIVIC = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!

/** Measured, not guessed (Sprint 75's own precedent): the mint civic's real
 * derived power via a plain, mission-free context - so the tip-trigger
 * thresholds below are picked relative to a number this test actually
 * measures, never an assumed catalog value that could quietly drift as the
 * parts catalog is rebalanced. */
const MEASURING_CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const MINT_CIVIC_POWER = computeDerivedStats(
  CIVIC,
  buildCarInstance({ modelId: CIVIC.id }),
  MEASURING_CONTEXT.partsById,
  MEASURING_CONTEXT.partsTaxonomy,
  MEASURING_CONTEXT.economy,
).power

/** Same measured-not-guessed precedent, for the Sprint 79 lap-tip tests: the
 * mint civic's real lap time under the shipped `economy.lapModel`. */
const MINT_CIVIC_LAP_SECONDS = lapTimeSecondsFor(
  buildCarInstance({ modelId: CIVIC.id }),
  CIVIC,
  MEASURING_CONTEXT,
)!

/** A minimal, fully-specified test mission - every field a real
 * `storyMissions.json` entry would carry, with the `budgetCap` requirement
 * already mirrored in (the same shape `data.ts`'s load-time mirror produces
 * for real content), so tests never depend on the real placeholder content's
 * own numbers, which Sprint 78 replaces outright. Sprint 85 decision 2: no
 * deadline/lapse fields - story missions are unfailable. */
function buildMission(overrides: Partial<StoryMission> = {}): StoryMission {
  return {
    id: 'test-mission-a',
    personaId: 'test-persona-a',
    title: 'Test mission A',
    requestCopy: 'A test request.',
    gateReputationPoints: 0,
    requirements: [{ kind: 'roadworthy' }, { kind: 'budgetCap', maxTotalSpendYen: 500_000 }],
    budgetCapYen: 500_000,
    payoutYen: 200_000,
    tipFraction: 0.1,
    tipTriggerFraction: 0.15,
    lapTipTriggerFraction: 0.03,
    reputationReward: 20,
    specialtyGroups: ['engine'],
    deliveredCopy: 'Delivered A.',
    overdeliveredCopy: 'Overdelivered A.',
    ...overrides,
  }
}

const MISSION_A = buildMission()
const MISSION_B = buildMission({
  id: 'test-mission-b',
  personaId: 'test-persona-b',
  title: 'Test mission B',
  gateReputationPoints: 50,
  requirements: [
    // Comfortably clears both the base requirement and the tip trigger
    // (min * 1.15) against the measured mint civic power.
    { kind: 'statThreshold', stat: 'power', min: Math.floor(MINT_CIVIC_POWER / 2) },
    { kind: 'budgetCap', maxTotalSpendYen: 900_000 },
  ],
  budgetCapYen: 900_000,
  payoutYen: 500_000,
  tipFraction: 0.2,
  reputationReward: 30,
  specialtyGroups: ['engine', 'drivetrain'],
})

function contextWithMissions(storyMissions: StoryMission[]): SimContext {
  return buildSimContext(
    CARS,
    PARTS,
    BUYERS,
    PARTS_TAXONOMY,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    storyMissions,
  )
}

const CONTEXT = contextWithMissions([MISSION_A, MISSION_B])

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), specialty: testSpecialty(), ...overrides }
}

describe('story missions (Sprint 76)', () => {
  describe('advanceStoryMissions: gate offering (decision 3)', () => {
    it('offers the first locked mission once reputation clears its gate', () => {
      const state = baseState({ reputationPoints: 0, storyMissions: [] })
      const result = advanceStoryMissions(state, CONTEXT)
      expect(result.state.storyMissions).toEqual([
        { missionId: 'test-mission-a', status: 'offered', acceptedOnDay: null },
      ])
      expect(result.log).toEqual([])
    })

    it('never offers a later mission while an earlier one is not yet delivered, even if reputation clears the later gate too', () => {
      const state = baseState({ reputationPoints: 100, storyMissions: [] })
      const result = advanceStoryMissions(state, CONTEXT)
      expect(result.state.storyMissions).toHaveLength(1)
      expect(result.state.storyMissions[0]!.missionId).toBe('test-mission-a')
    })

    it('offers the next mission once the earlier one is delivered and reputation clears its gate', () => {
      const delivered: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'delivered',
        acceptedOnDay: 1,
      }
      const state = baseState({ reputationPoints: 50, storyMissions: [delivered] })
      const result = advanceStoryMissions(state, CONTEXT)
      expect(result.state.storyMissions).toEqual([
        delivered,
        { missionId: 'test-mission-b', status: 'offered', acceptedOnDay: null },
      ])
    })

    it("offers nothing while reputation is below every eligible mission's gate", () => {
      const delivered: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'delivered',
        acceptedOnDay: 1,
      }
      const state = baseState({ reputationPoints: 10, storyMissions: [delivered] })
      const result = advanceStoryMissions(state, CONTEXT)
      expect(result.state.storyMissions).toEqual([delivered])
    })
  })

  describe('advanceStoryMissions: missions are unfailable (Sprint 85 decision 2)', () => {
    it('never lapses an active mission, however many days pass - no penalty, no state change', () => {
      const active: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = baseState({ day: 999, reputationPoints: 100, storyMissions: [active] })
      const result = advanceStoryMissions(state, CONTEXT)
      expect(result.state.storyMissions).toEqual([active])
      expect(result.state.reputationPoints).toBe(100)
      expect(result.log).toEqual([])
    })

    it('does not offer a new mission while one is still active (linear campaign, unchanged)', () => {
      const active: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = baseState({ day: 50, reputationPoints: 100, storyMissions: [active] })
      const result = advanceStoryMissions(state, CONTEXT)
      expect(result.state.storyMissions).toEqual([active])
      expect(result.log).toEqual([])
    })
  })

  describe('determinism (task 3)', () => {
    it('the same seed produces an identical storyMissions state on the same offer day', () => {
      function runCareer(seed: number, days: number): GameState[] {
        let state = createInitialGameState(CONTEXT, seed)
        const snapshots: GameState[] = [state]
        for (let day = 1; day <= days; day++) {
          const result = advanceDay(state, emptyDayActions(), seed + day, CONTEXT)
          state = result.state
          snapshots.push(state)
        }
        return snapshots
      }
      const first = runCareer(7, 10)
      const second = runCareer(7, 10)
      expect(second.map((s) => s.storyMissions)).toEqual(first.map((s) => s.storyMissions))
      // The gate (test-mission-a, gateReputationPoints 0) clears on the very
      // first day-boundary tick - a concrete, non-vacuous offer day to assert.
      expect(first[1]!.storyMissions).toEqual([
        { missionId: 'test-mission-a', status: 'offered', acceptedOnDay: null },
      ])
    })
  })

  describe('no interaction with offerCountCapByDay (task 3)', () => {
    it('service-job offer generation is byte-identical whether or not a story mission is active', () => {
      const withoutMission = createInitialGameState(CONTEXT, 3)
      const active: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'active',
        acceptedOnDay: 1,
      }
      const withMission = { ...withoutMission, storyMissions: [active] }

      const resultA = advanceDay(withoutMission, emptyDayActions(), 999, CONTEXT)
      const resultB = advanceDay(withMission, emptyDayActions(), 999, CONTEXT)
      expect(resultB.state.serviceJobOffers).toEqual(resultA.state.serviceJobOffers)
    })
  })

  describe('resolveAcceptMission', () => {
    it('offered -> active, stamping acceptedOnDay and logging mission-accepted (no deadline)', () => {
      const offered: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'offered',
        acceptedOnDay: null,
      }
      const state = baseState({ day: 3, storyMissions: [offered] })
      const result = resolveAcceptMission(state, 'test-mission-a', CONTEXT)
      expect(result.state.storyMissions).toEqual([
        { missionId: 'test-mission-a', status: 'active', acceptedOnDay: 3 },
      ])
      expect(result.log).toEqual([{ type: 'mission-accepted', missionId: 'test-mission-a' }])
    })

    it('is a no-op when the mission is not currently offered', () => {
      const active: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = baseState({ storyMissions: [active] })
      const result = resolveAcceptMission(state, 'test-mission-a', CONTEXT)
      expect(result.state).toBe(state)
      expect(result.log).toEqual([])
    })

    it('is a no-op for an unknown mission id', () => {
      const state = baseState({ storyMissions: [] })
      const result = resolveAcceptMission(state, 'no-such-mission', CONTEXT)
      expect(result.state).toBe(state)
      expect(result.log).toEqual([])
    })
  })

  describe('gradeMissionCar', () => {
    it('passes when every requirement, including the auto-mirrored budgetCap, is met', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: uniformCarParts('worn'),
      })
      const state = baseState({ day: 1, ownedCars: [car] })
      const report = gradeMissionCar(state, 'test-mission-a', car.id, CONTEXT)
      expect(report.pass).toBe(true)
      expect(report.lines.every((l) => l.pass)).toBe(true)
    })

    it('fails and reports the failing line when roadworthy is not met', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: { ...uniformCarParts('worn'), block: { installed: null } },
      })
      const state = baseState({ day: 1, ownedCars: [car] })
      const report = gradeMissionCar(state, 'test-mission-a', car.id, CONTEXT)
      expect(report.pass).toBe(false)
      const roadworthyLine = report.lines.find((l) => l.required === 'worn+ throughout')
      expect(roadworthyLine?.pass).toBe(false)
    })

    // Sprint 85 decision 2 (directive 17 case (a)): the old test asserted a
    // graded "Deliver on time" line that fails once the day passes a record's
    // dueOnDay. Story missions are unfailable now, so grading never adds a
    // deadline line at all - the day the car is delivered is immaterial.
    it('never grades a deadline line, however many days have passed since acceptance', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: uniformCarParts('worn'),
      })
      const active: StoryMissionRecord = {
        missionId: 'test-mission-a',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = baseState({ day: 999, ownedCars: [car], storyMissions: [active] })
      const report = gradeMissionCar(state, 'test-mission-a', car.id, CONTEXT)
      expect(report.lines.some((l) => l.label === 'Deliver on time')).toBe(false)
      expect(report.pass).toBe(true)
    })

    it('is pure and repeatable: calling it twice yields the same report and no state mutation', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: uniformCarParts('worn'),
      })
      const state = baseState({ day: 1, ownedCars: [car] })
      const first = gradeMissionCar(state, 'test-mission-a', car.id, CONTEXT)
      const second = gradeMissionCar(state, 'test-mission-a', car.id, CONTEXT)
      expect(second).toEqual(first)
    })
  })

  describe('resolveDeliverMission and tip arithmetic (task 4)', () => {
    function activeStateFor(
      missionId: string,
      car: ReturnType<typeof buildCarInstance>,
    ): GameState {
      const active: StoryMissionRecord = {
        missionId,
        status: 'active',
        acceptedOnDay: 1,
      }
      return baseState({ day: 5, ownedCars: [car], storyMissions: [active] })
    }

    it('delivers a passing mission: pays out, removes the car, applies reputation + specialty, marks delivered', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: uniformCarParts('worn'),
      })
      const state = activeStateFor('test-mission-a', car)
      const result = resolveDeliverMission(state, 'test-mission-a', car.id, CONTEXT)

      expect(result.state.ownedCars.some((c) => c.id === car.id)).toBe(false)
      expect(result.state.cashYen).toBe(state.cashYen + MISSION_A.payoutYen)
      expect(result.state.reputationPoints).toBe(
        state.reputationPoints + MISSION_A.reputationReward,
      )
      expect(result.state.specialty.engine).toBe(
        state.specialty.engine + MISSION_A.reputationReward,
      )
      expect(result.state.storyMissions).toEqual([
        { missionId: 'test-mission-a', status: 'delivered', acceptedOnDay: 1 },
      ])
      expect(result.log).toEqual([
        {
          type: 'mission-delivered',
          missionId: 'test-mission-a',
          payoutYen: MISSION_A.payoutYen,
          tipYen: 0,
          reputationGained: MISSION_A.reputationReward,
          specialtyGained: {
            engine: MISSION_A.reputationReward,
            drivetrain: 0,
            suspension: 0,
            wheels: 0,
            body: 0,
            interior: 0,
          },
        },
      ])
    })

    it('is a no-op when grading fails', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: { ...uniformCarParts('worn'), block: { installed: null } },
      })
      const state = activeStateFor('test-mission-a', car)
      const result = resolveDeliverMission(state, 'test-mission-a', car.id, CONTEXT)
      expect(result.state).toBe(state)
      expect(result.log).toEqual([])
    })

    it('is a no-op when the mission is not active', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: uniformCarParts('worn'),
      })
      const state = baseState({ day: 5, ownedCars: [car], storyMissions: [] })
      const result = resolveDeliverMission(state, 'test-mission-a', car.id, CONTEXT)
      expect(result.state).toBe(state)
      expect(result.log).toEqual([])
    })

    it('awards a tip when every statThreshold requirement clears the trigger fraction', () => {
      const car = buildCarInstance({ id: 'car-b', modelId: CIVIC.id })
      const state = activeStateFor('test-mission-b', car)
      const result = resolveDeliverMission(state, 'test-mission-b', car.id, CONTEXT)
      const entry = result.log.find((e) => e.type === 'mission-delivered')
      expect(entry).toMatchObject({
        tipYen: Math.round(MISSION_B.payoutYen * MISSION_B.tipFraction),
      })
      expect((entry as { tipYen: number }).tipYen).toBeGreaterThan(0)
    })

    it('withholds the tip when the statThreshold requirement clears the base but not the trigger fraction', () => {
      const tightMission = buildMission({
        id: 'test-mission-tight',
        gateReputationPoints: 0,
        requirements: [
          // A floor set exactly at the measured mint power clears the base
          // requirement (equality passes) but never its own 1.15x trigger.
          { kind: 'statThreshold', stat: 'power', min: MINT_CIVIC_POWER },
          { kind: 'budgetCap', maxTotalSpendYen: 900_000 },
        ],
        budgetCapYen: 900_000,
      })
      const context = contextWithMissions([tightMission])
      const car = buildCarInstance({ id: 'car-c', modelId: CIVIC.id })
      const active: StoryMissionRecord = {
        missionId: 'test-mission-tight',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = { ...baseState({ day: 5, ownedCars: [car] }), storyMissions: [active] }
      const result = resolveDeliverMission(state, 'test-mission-tight', car.id, context)
      const entry = result.log.find((e) => e.type === 'mission-delivered')
      expect(entry).toMatchObject({ tipYen: 0 })
    })

    it('never awards a tip (vacuously) when the mission has no statThreshold requirement at all', () => {
      const car = buildCarInstance({
        id: 'car-a',
        modelId: CIVIC.id,
        parts: uniformCarParts('worn'),
      })
      const state = activeStateFor('test-mission-a', car)
      const result = resolveDeliverMission(state, 'test-mission-a', car.id, CONTEXT)
      const entry = result.log.find((e) => e.type === 'mission-delivered')
      expect(entry).toMatchObject({ tipYen: 0 })
    })

    /**
     * Sprint 79 decision 6: `earnsTip` extends to `lapTimeCeiling`
     * requirements - a lap mission tips when the delivered car clears
     * `maxSeconds * (1 - lapTipTriggerFraction)`, the lap-time twin of the
     * stat-threshold trigger above.
     */
    it('awards a tip on a lap-only mission when the delivered time clears the lap trigger fraction', () => {
      const lapMission = buildMission({
        id: 'test-mission-lap',
        requirements: [
          {
            kind: 'lapTimeCeiling',
            courseId: 'kirifuri',
            maxSeconds: MINT_CIVIC_LAP_SECONDS * 1.5,
          },
        ],
      })
      const context = contextWithMissions([lapMission])
      const car = buildCarInstance({ id: 'car-lap', modelId: CIVIC.id })
      const active: StoryMissionRecord = {
        missionId: 'test-mission-lap',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = { ...baseState({ day: 5, ownedCars: [car] }), storyMissions: [active] }
      const result = resolveDeliverMission(state, 'test-mission-lap', car.id, context)
      const entry = result.log.find((e) => e.type === 'mission-delivered')
      expect(entry).toMatchObject({
        tipYen: Math.round(lapMission.payoutYen * lapMission.tipFraction),
      })
      expect((entry as { tipYen: number }).tipYen).toBeGreaterThan(0)
    })

    it('withholds the tip on a lap-only mission when the delivered time clears the base ceiling but not the lap trigger fraction', () => {
      const tightLapMission = buildMission({
        id: 'test-mission-lap-tight',
        requirements: [
          // Exactly at the measured mint civic time: clears the base ceiling
          // (equality passes) but never its own lapTipTriggerFraction margin.
          { kind: 'lapTimeCeiling', courseId: 'kirifuri', maxSeconds: MINT_CIVIC_LAP_SECONDS },
        ],
      })
      const context = contextWithMissions([tightLapMission])
      const car = buildCarInstance({ id: 'car-lap-tight', modelId: CIVIC.id })
      const active: StoryMissionRecord = {
        missionId: 'test-mission-lap-tight',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = { ...baseState({ day: 5, ownedCars: [car] }), storyMissions: [active] }
      const result = resolveDeliverMission(state, 'test-mission-lap-tight', car.id, context)
      const entry = result.log.find((e) => e.type === 'mission-delivered')
      expect(entry).toMatchObject({ tipYen: 0 })
    })

    it('a mixed mission (statThreshold AND lapTimeCeiling) withholds the tip unless BOTH clear their own trigger fraction', () => {
      const mixedMission = buildMission({
        id: 'test-mission-mixed',
        requirements: [
          { kind: 'statThreshold', stat: 'power', min: Math.floor(MINT_CIVIC_POWER / 2) },
          // The lap side is set tight (equals the measured time): clears the
          // base ceiling but not its own trigger fraction, so the mixed
          // mission must withhold the tip even though the stat side clears
          // comfortably.
          { kind: 'lapTimeCeiling', courseId: 'kirifuri', maxSeconds: MINT_CIVIC_LAP_SECONDS },
        ],
      })
      const context = contextWithMissions([mixedMission])
      const car = buildCarInstance({ id: 'car-mixed', modelId: CIVIC.id })
      const active: StoryMissionRecord = {
        missionId: 'test-mission-mixed',
        status: 'active',
        acceptedOnDay: 1,
      }
      const state = { ...baseState({ day: 5, ownedCars: [car] }), storyMissions: [active] }
      const result = resolveDeliverMission(state, 'test-mission-mixed', car.id, context)
      const entry = result.log.find((e) => e.type === 'mission-delivered')
      expect(entry).toMatchObject({ tipYen: 0 })
    })
  })
})
