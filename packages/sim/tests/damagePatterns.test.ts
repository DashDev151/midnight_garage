import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  DAMAGE_PATTERN_IDS,
  DAMAGE_PATTERNS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type ComponentId,
  type DamagePatternId,
  type EconomyConfig,
  type PanelZoneId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { bandIndex } from '../src/bands'
import {
  isBodyDerivedPart,
  PANEL_ZONE_IDS,
  rollZoneStates,
  setZoneCarrierToAtLeastBand,
} from '../src/bodyPipeline'
import { buildSimContext, type SimContext } from '../src/context'
import { pickPatternZone, symptomDrawWeight, zoneDamageOrder } from '../src/damagePatterns'
import { createRng } from '../src/rng'

/**
 * Damage patterns (docs/design/systems/generation-damage.md, layer 3). A pattern
 * is a weighting over part slots and NOTHING else: it answers where, never how
 * much and never which band. One weighting, two consumers - the damage budget's
 * pick and the symptom draw's candidate weighting - which is what makes a car's
 * visible damage and its hidden fault two halves of one event.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const TAXONOMY_BY_ID = CONTEXT.partsTaxonomyById
const GAME_YEAR = 1995
const PROBE_MODEL: CarModel = CARS.find((c) => c.id === 'nissan-silvia-s13')!

/** Every grade forced onto the one pattern, so whatever history a probe car
 * rolls, the pattern it draws is `patternId`. Mirrors `auctions.test.ts`'s
 * `contextForcingGrade` exactly - the same override shape, one table along. */
function contextForcingPattern(patternId: DamagePatternId): SimContext {
  const row = Object.fromEntries(
    DAMAGE_PATTERN_IDS.map((id) => [id, id === patternId ? 1 : 0]),
  ) as EconomyConfig['partsGeneration']['damageGrades']['patternWeightsByGrade']['tidy']
  return buildSimContext(
    CARS,
    PARTS,
    BUYERS,
    PARTS_TAXONOMY,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      ...ECONOMY,
      partsGeneration: {
        ...ECONOMY.partsGeneration,
        damageGrades: {
          ...ECONOMY.partsGeneration.damageGrades,
          patternWeightsByGrade: { tidy: row, used: row, rough: row, project: row },
        },
      },
    },
  )
}

function generate(count: number, context: SimContext, label: string): CarInstance[] {
  return Array.from({ length: count }, (_, seed) =>
    generateAuctionCarInstance(
      PROBE_MODEL,
      `${label}-${seed}`,
      createRng(seed),
      context,
      GAME_YEAR,
    ),
  )
}

/** Mean band steps from mint carried by each taxonomy group, over `cars`. The
 * three zone-derived body carriers are excluded and measured separately below,
 * since their bands come from zone severity rather than from a band step. */
function meanStepsByGroup(cars: readonly CarInstance[]): Record<ComponentId, number> {
  const totals = {} as Record<ComponentId, number>
  for (const car of cars) {
    for (const partId of ALL_CAR_PART_IDS) {
      if (isBodyDerivedPart(partId)) continue
      const installed = car.parts[partId].installed
      if (!installed) continue
      const group = TAXONOMY_BY_ID[partId].group
      totals[group] = (totals[group] ?? 0) + (bandIndex('mint') - bandIndex(installed.band))
    }
  }
  for (const group of Object.keys(totals) as ComponentId[]) totals[group] /= cars.length
  return totals
}

/** Mean money-relevant severity (surface + finish) per panel zone, over `cars`. */
function meanSeverityByZone(cars: readonly CarInstance[]): Record<PanelZoneId, number> {
  const totals = {} as Record<PanelZoneId, number>
  for (const car of cars) {
    const zones = car.zoneState
    if (!zones) continue
    for (const zoneId of PANEL_ZONE_IDS) {
      totals[zoneId] = (totals[zoneId] ?? 0) + zones[zoneId].surface + zones[zoneId].finish
    }
  }
  for (const zoneId of PANEL_ZONE_IDS) totals[zoneId] /= cars.length
  return totals
}

/** Which taxonomy group a symptom mostly lives in, by its own authored cause
 * odds - the same join the pattern weighting uses, read back for measurement. */
function dominantGroupOf(symptomId: string): ComponentId {
  const symptom = CONTEXT.symptomsById[symptomId]!
  const byGroup = {} as Record<ComponentId, number>
  for (const cause of symptom.causes) {
    const group = TAXONOMY_BY_ID[cause.carPartId].group
    byGroup[group] = (byGroup[group] ?? 0) + cause.weight
  }
  return (Object.entries(byGroup) as [ComponentId, number][]).sort((a, b) => b[1] - a[1])[0]![0]
}

/** The share of all symptoms drawn across `CARS` under `patternId` whose
 * dominant group falls in `groups`. */
function symptomShareIn(patternId: DamagePatternId, groups: readonly ComponentId[]): number {
  const context = contextForcingPattern(patternId)
  let drawn = 0
  let matched = 0
  for (const model of CARS) {
    for (let seed = 0; seed < 60; seed++) {
      const car = generateAuctionCarInstance(
        model,
        `sym-${patternId}-${model.id}-${seed}`,
        createRng(seed * 13 + 1),
        context,
        GAME_YEAR,
      )
      for (const symptom of car.symptoms) {
        drawn += 1
        if (groups.includes(dominantGroupOf(symptom.symptomId))) matched += 1
      }
    }
  }
  expect(drawn, `${patternId}: expected a real sample of drawn symptoms`).toBeGreaterThan(400)
  return matched / drawn
}

describe('a damage pattern decides WHERE the damage is', () => {
  it('puts a shunted car and a drifted car in materially different states', () => {
    const shunted = generate(600, contextForcingPattern('frontal-collision'), 'shunt')
    const sideways = generate(600, contextForcingPattern('drifted'), 'drift')
    const shuntedGroups = meanStepsByGroup(shunted)
    const sidewaysGroups = meanStepsByGroup(sideways)

    // The front of the car: the engine bay behind the impact, and the bodywork
    // that took it. Measured 17.23 vs 15.48 steps on engine and 2.31 vs 1.67 on
    // body; the bars sit well inside those margins rather than on them.
    expect(shuntedGroups.engine / sidewaysGroups.engine).toBeGreaterThan(1.05)
    expect(shuntedGroups.body / sidewaysGroups.body).toBeGreaterThan(1.15)

    // ...and the reverse on everything a drift car consumes. Measured 4.52 vs
    // 3.41 on wheels, 11.16 vs 9.85 on suspension, 9.39 vs 7.50 on drivetrain.
    expect(sidewaysGroups.wheels / shuntedGroups.wheels).toBeGreaterThan(1.15)
    expect(sidewaysGroups.suspension / shuntedGroups.suspension).toBeGreaterThan(1.05)
    expect(sidewaysGroups.drivetrain / shuntedGroups.drivetrain).toBeGreaterThan(1.1)

    // The body zones invert outright, which is the thing six independent zone
    // rolls could not express at all: there was no front and no rear, and
    // `left` and `right` were unrelated. Measured 3.23 vs 1.68 on the bonnet
    // and 2.69 vs 1.98 on the boot.
    const shuntedZones = meanSeverityByZone(shunted)
    const sidewaysZones = meanSeverityByZone(sideways)
    expect(shuntedZones.bonnet / sidewaysZones.bonnet).toBeGreaterThan(1.4)
    expect(sidewaysZones.boot / shuntedZones.boot).toBeGreaterThan(1.15)
  }, 30_000)

  it('moves the damage without adding any: the pattern owns where, the grade owns how much', () => {
    // The clearest statement that a pattern sets no band and buys no damage. If
    // it did either, concentrating damage would change how much of it there is.
    const totalSteps = (cars: readonly CarInstance[]) => {
      const byGroup = meanStepsByGroup(cars)
      return Object.values(byGroup).reduce((sum, steps) => sum + steps, 0)
    }
    const totals = DAMAGE_PATTERN_IDS.map((patternId) =>
      totalSteps(generate(400, contextForcingPattern(patternId), `total-${patternId}`)),
    )
    const lowest = Math.min(...totals)
    const highest = Math.max(...totals)
    expect(
      highest / lowest,
      `total damage should barely move between patterns: ${totals.map((t) => t.toFixed(2)).join(', ')}`,
    ).toBeLessThan(1.1)
  }, 30_000)

  it('never writes an apparent band: budget damage stays honest visible wear', () => {
    for (const patternId of DAMAGE_PATTERN_IDS) {
      const context = contextForcingPattern(patternId)
      for (const car of generate(60, context, `apparent-${patternId}`)) {
        if (!car.apparentBandByPartId) continue
        const causeParts = new Set(
          car.symptoms.flatMap((carSymptom) =>
            (context.symptomsById[carSymptom.symptomId]?.causes ?? []).map(
              (cause) => cause.carPartId as string,
            ),
          ),
        )
        for (const partId of Object.keys(car.apparentBandByPartId)) {
          expect(
            causeParts.has(partId),
            `${patternId}: ${partId} carries an apparent band but no symptom damaged it`,
          ).toBe(true)
        }
      }
    }
  }, 30_000)

  it('stamps the drawn pattern on the car, and rolls it from the history rather than from the parts', () => {
    for (const patternId of DAMAGE_PATTERN_IDS) {
      const car = generate(1, contextForcingPattern(patternId), `stamp-${patternId}`)[0]!
      expect(car.damagePattern).toBe(patternId)
    }
    // A tidy car mostly has no story; a project car almost always does.
    const patternsFor = (grade: 'tidy' | 'project') => {
      const rng = createRng(20260801)
      const weights = ECONOMY.partsGeneration.damageGrades.patternWeightsByGrade[grade]
      const total = DAMAGE_PATTERN_IDS.reduce((sum, id) => sum + weights[id], 0)
      let garaged = 0
      for (let i = 0; i < 20_000; i++) {
        let roll = rng.next() * total
        for (const id of DAMAGE_PATTERN_IDS) {
          roll -= weights[id]
          if (roll < 0) {
            if (id === 'garaged') garaged += 1
            break
          }
        }
      }
      return garaged / 20_000
    }
    expect(patternsFor('tidy')).toBeGreaterThan(0.5)
    expect(patternsFor('project')).toBeLessThan(0.05)
  })

  it('is deterministic: the same seed draws the same pattern and lands the damage in the same places', () => {
    for (const seed of [1, 7, 42]) {
      const first = generateAuctionCarInstance(
        PROBE_MODEL,
        `det-${seed}`,
        createRng(seed),
        CONTEXT,
        GAME_YEAR,
      )
      const second = generateAuctionCarInstance(
        PROBE_MODEL,
        `det-${seed}`,
        createRng(seed),
        CONTEXT,
        GAME_YEAR,
      )
      expect(second.damagePattern).toBe(first.damagePattern)
      expect(second.zoneState).toEqual(first.zoneState)
      expect(second.parts).toEqual(first.parts)
    }
  })
})

describe('the symptom a car presents follows what happened to it', () => {
  const FRONT_END: readonly ComponentId[] = ['engine', 'body']
  const RUNNING_GEAR: readonly ComponentId[] = ['suspension', 'wheels', 'drivetrain']

  it('draws a front-end symptom far more often on a shunted car than on a drifted one, and the reverse on running gear', () => {
    const shuntedFront = symptomShareIn('frontal-collision', FRONT_END)
    const sidewaysFront = symptomShareIn('drifted', FRONT_END)
    const shuntedGear = symptomShareIn('frontal-collision', RUNNING_GEAR)
    const sidewaysGear = symptomShareIn('drifted', RUNNING_GEAR)

    expect(
      shuntedFront / sidewaysFront,
      `front-end symptom share: shunted ${shuntedFront.toFixed(3)} vs drifted ${sidewaysFront.toFixed(3)}`,
    ).toBeGreaterThan(1.15)
    expect(
      sidewaysGear / shuntedGear,
      `running-gear symptom share: drifted ${sidewaysGear.toFixed(3)} vs shunted ${shuntedGear.toFixed(3)}`,
    ).toBeGreaterThan(1.25)
  }, 60_000)

  it('leaves every symptom reachable on every car: the history biases the draw, it does not decide it', () => {
    // The whole reason `patternSymptomBias` is short of 1. At bias b the
    // floor under any candidate's weight is `1 - b` of an even draw, so a
    // gearbox whine on a shunted car stays a real, findable outcome.
    const bias = ECONOMY.partsGeneration.damageGrades.patternSymptomBias
    expect(bias).toBeLessThan(1)
    for (const pattern of DAMAGE_PATTERNS) {
      for (const symptom of CONTEXT.symptoms) {
        expect(
          symptomDrawWeight(symptom, pattern, TAXONOMY_BY_ID, bias),
          `${pattern.id} must leave "${symptom.id}" drawable`,
        ).toBeGreaterThan(1 - bias)
      }
    }
  })
})

describe('the bonnet monopoly is over', () => {
  it('places a body carrier on the zone it is handed, not on a hardcoded one', () => {
    const zones = rollZoneStates('everyday', ECONOMY, createRng(3))
    for (const zoneId of PANEL_ZONE_IDS) {
      const damaged = setZoneCarrierToAtLeastBand({ ...zones }, 'paint', 'poor', zoneId)
      expect(damaged[zoneId].finish, `${zoneId} should carry the symptom's damage`).toBe(3)
    }
  })

  it('spreads a symptom-damaged zone across the whole shell rather than always the bonnet', () => {
    const flat = DAMAGE_PATTERNS.find((pattern) => pattern.id === 'garaged')!
    const rng = createRng(11)
    const seen = new Set<PanelZoneId>()
    for (let draw = 0; draw < 200; draw++) seen.add(pickPatternZone(PANEL_ZONE_IDS, flat, rng))
    expect(seen.size).toBe(PANEL_ZONE_IDS.length)
  })

  it('leans a shunted car toward the bonnet and a drifted one toward the boot', () => {
    const firstZoneShare = (patternId: DamagePatternId, zoneId: PanelZoneId) => {
      const pattern = DAMAGE_PATTERNS.find((entry) => entry.id === patternId)!
      const rng = createRng(97)
      let hits = 0
      for (let draw = 0; draw < 4000; draw++) {
        if (zoneDamageOrder(PANEL_ZONE_IDS, pattern, rng)[0] === zoneId) hits += 1
      }
      return hits / 4000
    }
    expect(firstZoneShare('frontal-collision', 'bonnet')).toBeGreaterThan(0.3)
    expect(firstZoneShare('drifted', 'bonnet')).toBeLessThan(0.15)
    expect(firstZoneShare('drifted', 'boot')).toBeGreaterThan(0.25)
    expect(firstZoneShare('frontal-collision', 'boot')).toBeLessThan(0.15)
  })
})

describe('arranging the zones is a pure permutation', () => {
  it('carries exactly the severities the tier tables rolled, on different zones', () => {
    // The property that makes this safe to do at all: `panels` and `paint`
    // derive from the WORST panel zone, and a worst-of is invariant under
    // permutation. So the derived bands, the repair bill and every Law 2 check
    // see an identical car; only which panel carries what moves.
    const asIs = rollZoneStates('everyday', ECONOMY, createRng(5))
    const reversed = rollZoneStates(
      'everyday',
      ECONOMY,
      createRng(5),
      [...PANEL_ZONE_IDS].reverse(),
    )
    const fingerprint = (zones: typeof asIs) =>
      PANEL_ZONE_IDS.map((zoneId) => JSON.stringify(zones[zoneId]))
        .sort()
        .join('|')
    expect(fingerprint(reversed)).toBe(fingerprint(asIs))
    expect(reversed.chassis).toEqual(asIs.chassis)
  })

  it('deals the worst rolled zone first along the order it is given', () => {
    const severity = (zone: { metal: number; surface: number; finish: number }) =>
      zone.metal + zone.surface + zone.finish
    for (let seed = 0; seed < 40; seed++) {
      const order: PanelZoneId[] = ['boot', 'roof', 'left', 'right', 'bonnet']
      const zones = rollZoneStates('entry', ECONOMY, createRng(seed), order)
      const dealt = order.map((zoneId) => severity(zones[zoneId]))
      for (let i = 1; i < dealt.length; i++) {
        expect(
          dealt[i]!,
          `seed ${seed}: severities should descend along the order`,
        ).toBeLessThanOrEqual(dealt[i - 1]!)
      }
    }
  })
})
