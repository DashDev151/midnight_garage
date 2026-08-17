import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type Symptom,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { apparentViewOf, playerEstimateYen, sheetGuideValueYen } from '../src/diagnosis'
import { marketValueYen } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { buildCarInstance, mintCarParts } from './testFixtures'

/**
 * Yard discriminability and fearful-room probes -
 * docs/design/systems/knowledge-and-diagnosis.md sections 3 and 4.
 * Closed-form, real-content or hand-computable fixtures, no bots and no RNG,
 * matching every other diagnosis probe's own standing (`diagnosisRouteProbes.test.ts`,
 * `balanceProbes.test.ts`'s symptom coherence describe block).
 */

const MODEL = CARS[0]!

/**
 * B2: every scrap-band (grenade) failure mode must be separable from at
 * least one cheaper sibling by SOME yard test in its own symptom - the
 * commitment that lets a grenade be findable before purchase without a new
 * screening mechanic (ruling 4: screening REJECTED, the existing yard tests
 * are the discovery instrument). `severeCauseId`'s own partition group, for
 * whichever test, must exclude at least one other cause in the symptom -
 * that other cause fell in the OTHER group, so running the test tells the
 * player whether they are looking at the grenade or not-this-one.
 */
function severeModeIsYardDiscriminable(symptom: Symptom, severeCauseId: string): boolean {
  return symptom.tests.some((test) => {
    const group = test.partition.find((g) => g.includes(severeCauseId))
    if (!group) return false
    return symptom.causes.some((cause) => cause.id !== severeCauseId && !group.includes(cause.id))
  })
}

describe('B2: every severe (scrap-band) failure mode is yard-discriminable', () => {
  const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

  it('every scrap-band cause is separated from at least one sibling by some yard test in its own symptom', () => {
    const failures: string[] = []
    for (const symptom of CONTEXT.symptoms) {
      for (const cause of symptom.causes) {
        if (cause.setBand !== 'scrap') continue
        if (!severeModeIsYardDiscriminable(symptom, cause.id)) {
          failures.push(`${symptom.id}/${cause.id}`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('at least one real symptom actually carries a scrap-band candidate (the probe above is not vacuously true)', () => {
    const hasScrapCause = CONTEXT.symptoms.some((symptom) =>
      symptom.causes.some((cause) => cause.setBand === 'scrap'),
    )
    expect(hasScrapCause).toBe(true)
  })
})

/**
 * C3 fixtures: one symptom spanning a cheap (`worn` brake pads) and a
 * grenade (`scrap` internals) candidate, 70/30 weighted toward the cheap
 * outcome (roughly this sprint's own real-content retune, task B1) - plus
 * two single-cause "isolate one candidate's own chain-priced fix cost"
 * symptoms, which let the probes below read `candidateFixCostYen` indirectly
 * through the public `sheetGuideValueYen`: with only one candidate, weight
 * is 100% on it, so the fear blend `fearBias x max + (1 - fearBias) x mean`
 * degenerates to exactly that candidate's own fix cost.
 */
const ROOM_CHEAP_CAUSE_ID = 'room-cause-cheap'
const ROOM_GRENADE_CAUSE_ID = 'room-cause-grenade'

const ROOM_SPAN_SYMPTOM: Symptom = {
  id: 'room-span-symptom',
  cardLine: 'Room fear test symptom.',
  causes: [
    { id: ROOM_CHEAP_CAUSE_ID, carPartId: 'brakePadsDiscs', setBand: 'worn', weight: 70 },
    { id: ROOM_GRENADE_CAUSE_ID, carPartId: 'internals', setBand: 'scrap', weight: 30 },
  ],
  tests: [],
}

const ROOM_CHEAP_ONLY_SYMPTOM: Symptom = {
  id: 'room-cheap-only-symptom',
  cardLine: 'Cheap-only isolation symptom.',
  causes: [{ id: ROOM_CHEAP_CAUSE_ID, carPartId: 'brakePadsDiscs', setBand: 'worn', weight: 100 }],
  tests: [],
}

const ROOM_GRENADE_ONLY_SYMPTOM: Symptom = {
  id: 'room-grenade-only-symptom',
  cardLine: 'Grenade-only isolation symptom.',
  causes: [{ id: ROOM_GRENADE_CAUSE_ID, carPartId: 'internals', setBand: 'scrap', weight: 100 }],
  tests: [],
}

const CONTEXT = buildSimContext(
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
  [ROOM_SPAN_SYMPTOM, ROOM_CHEAP_ONLY_SYMPTOM, ROOM_GRENADE_ONLY_SYMPTOM],
)
const STATE = createInitialGameState(CONTEXT, 1)

/** A car carrying exactly one fixture symptom, both candidate slots at
 * `mint` in truth and in apparent - `sheetGuideValueYen`/`playerEstimateYen`
 * both reason about a candidate's cost by FORCING that candidate's own band
 * on the apparent view (`candidateFixCostYen`'s `damagedView`,
 * `symptomDiscountYen`'s own equivalent), never by reading the car's true
 * installed band, so the true band never has to match any one candidate's
 * claim here. */
function carWithRoomSymptom(symptomId: string, remainingCauseIds: string[]): CarInstance {
  return {
    ...buildCarInstance({
      modelId: MODEL.id,
      parts: mintCarParts(),
    }),
    symptoms: [
      {
        symptomId,
        trueCauseId: remainingCauseIds[0]!,
        remainingCauseIds,
        runTestIds: [],
        latent: false,
      },
    ],
    apparentBandByPartId: { brakePadsDiscs: 'mint', internals: 'mint' },
  }
}

const heatPercent = STATE.marketHeat[MODEL.id] ?? 100
const apparentValue = marketValueYen(
  MODEL,
  apparentViewOf(
    carWithRoomSymptom(ROOM_SPAN_SYMPTOM.id, [ROOM_CHEAP_CAUSE_ID, ROOM_GRENADE_CAUSE_ID]),
  ),
  heatPercent,
  CONTEXT.partsById,
  CONTEXT.partsTaxonomyById,
  CONTEXT.economy,
)

const cheapFixCostYen =
  apparentValue -
  sheetGuideValueYen(
    carWithRoomSymptom(ROOM_CHEAP_ONLY_SYMPTOM.id, [ROOM_CHEAP_CAUSE_ID]),
    MODEL,
    STATE,
    CONTEXT,
  )
const grenadeFixCostYen =
  apparentValue -
  sheetGuideValueYen(
    carWithRoomSymptom(ROOM_GRENADE_ONLY_SYMPTOM.id, [ROOM_GRENADE_CAUSE_ID]),
    MODEL,
    STATE,
    CONTEXT,
  )

describe('C3(a): the room figure on a symptom spanning cheap..grenade sits within a stated band of the worst case', () => {
  it('the cheap and grenade candidates really are worlds apart (the fixture is not degenerate)', () => {
    expect(grenadeFixCostYen).toBeGreaterThan(cheapFixCostYen * 3)
  })

  it('the unresolved span symptom prices between fearBias x worst-case and the full worst-case', () => {
    const { fearBias } = CONTEXT.economy.diagnosis
    const unresolvedCar = carWithRoomSymptom(ROOM_SPAN_SYMPTOM.id, [
      ROOM_CHEAP_CAUSE_ID,
      ROOM_GRENADE_CAUSE_ID,
    ])
    const roomDiscountYen = apparentValue - sheetGuideValueYen(unresolvedCar, MODEL, STATE, CONTEXT)
    // fearBias x max + (1 - fearBias) x weightedMean always sits in
    // [fearBias x max, max], since weightedMean <= max by construction - a
    // one-yen rounding slack either side, not a real tolerance.
    expect(roomDiscountYen).toBeGreaterThanOrEqual(fearBias * grenadeFixCostYen - 1)
    expect(roomDiscountYen).toBeLessThanOrEqual(grenadeFixCostYen + 1)
  })
})

describe('C3(b)/(c): the player, once collapsed, reads the true cause exactly - the room still fears the field', () => {
  it('(b) collapsed-cheap: the player reads comfortably above the still-fearful room', () => {
    const collapsedCheapCar = carWithRoomSymptom(ROOM_SPAN_SYMPTOM.id, [ROOM_CHEAP_CAUSE_ID])
    const playerYen = playerEstimateYen(collapsedCheapCar, MODEL, STATE, CONTEXT)
    const roomYen = sheetGuideValueYen(collapsedCheapCar, MODEL, STATE, CONTEXT)
    expect(playerYen).toBeGreaterThan(roomYen)
    // Not just technically positive: a diagnosed-cheap fault is meant to be
    // a real, bid-it-with-confidence edge, so the gap must clear a real
    // fraction of the car's own apparent value.
    expect(playerYen - roomYen).toBeGreaterThan(0.01 * apparentValue)
  })

  it('(c) collapsed-grenade: the player reads below the still-fearful room', () => {
    const collapsedGrenadeCar = carWithRoomSymptom(ROOM_SPAN_SYMPTOM.id, [ROOM_GRENADE_CAUSE_ID])
    const playerYen = playerEstimateYen(collapsedGrenadeCar, MODEL, STATE, CONTEXT)
    const roomYen = sheetGuideValueYen(collapsedGrenadeCar, MODEL, STATE, CONTEXT)
    expect(playerYen).toBeLessThan(roomYen)
    expect(roomYen - playerYen).toBeGreaterThan(0.01 * apparentValue)
  })
})
