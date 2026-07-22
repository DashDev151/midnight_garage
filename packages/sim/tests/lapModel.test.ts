import {
  BUYERS,
  CARS,
  ECONOMY,
  LAP_REFERENCES,
  PARTS,
  PARTS_TAXONOMY,
  type CarModel,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { lapTimeSecondsFor, selectBoardRows } from '../src/lapModel'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

/** A street-grade, common-fitment-class tyre catalog part - installing it
 * overrides `mintCarParts`'s default stock tyre. */
const STREET_TYRES = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.grade === 'street' && p.fitmentClass === 'common',
)!
const STOCK_TYRES = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.grade === 'stock' && p.fitmentClass === 'common',
)!
const SPORT_TYRES = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.grade === 'sport' && p.fitmentClass === 'common',
)!
const RACE_TYRES = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.grade === 'race' && p.fitmentClass === 'common',
)!

function tyreInstance(part: (typeof PARTS)[number], band: 'mint' | 'scrap' = 'mint') {
  return {
    id: `fixture-${part.id}`,
    partId: part.id,
    band,
    genuinePeriod: false,
    origin: { kind: 'market' as const, day: 1 },
  }
}

function modelWith(overrides: { stockPowerPs: number; curbWeightKg: number }): CarModel {
  return {
    id: 'lap-test-model',
    displayName: 'Test Model',
    brand: 'Testa',
    parodyName: 'Test Model',
    parodyBrand: 'Testa',
    spec: {
      chassisCode: 'TT',
      engineCode: 'TT',
      yearFrom: 1990,
      curbWeightKg: overrides.curbWeightKg,
      stockPowerPs: overrides.stockPowerPs,
    },
    tier: 'common',
    tags: ['FR', 'NA', 'Piston', '90s', 'JDM'],
    bookValueYen: 1_000_000,
  }
}

/** The same raw formula the sim uses, restated independently here so the
 * test is a genuine cross-check of the implementation against the
 * published coefficients: "the FORMULA is the contract", not any single
 * hand-computed decimal example. */
function expectedLapTimeSeconds(weightKg: number, powerPs: number, gripMult: number): number {
  const { C, ratioExp } = ECONOMY.lapModel
  return Math.round(C * Math.pow(weightKg / powerPs, ratioExp) * gripMult * 10) / 10
}

describe('lapTimeSecondsFor (Sprint 77 decision 1)', () => {
  it('matches the published formula exactly: 130 PS / 940 kg / street', () => {
    const model = modelWith({ stockPowerPs: 130, curbWeightKg: 940 })
    const car = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({ tyres: tyreInstance(STREET_TYRES) }),
    })
    const result = lapTimeSecondsFor(car, model, CONTEXT)
    expect(result).toBe(expectedLapTimeSeconds(940, 130, ECONOMY.lapModel.gripMult.street))
    // Sanity check against the worked example (~84.9s) - a generous
    // tolerance, since the doc itself says not to trust its
    // hand-computed decimals, only the formula.
    expect(result).toBeCloseTo(84.9, 0)
  })

  it('matches the published formula exactly: 55 PS / 720 kg / stock', () => {
    const model = modelWith({ stockPowerPs: 55, curbWeightKg: 720 })
    const car = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({ tyres: tyreInstance(STOCK_TYRES) }),
    })
    const result = lapTimeSecondsFor(car, model, CONTEXT)
    expect(result).toBe(expectedLapTimeSeconds(720, 55, ECONOMY.lapModel.gripMult.stock))
  })

  it('returns null when the tyres slot is empty', () => {
    const model = modelWith({ stockPowerPs: 130, curbWeightKg: 940 })
    const car = buildCarInstance({ modelId: model.id, parts: mintCarParts({ tyres: null }) })
    expect(lapTimeSecondsFor(car, model, CONTEXT)).toBeNull()
  })

  it('returns null when the tyres slot is scrap-band', () => {
    const model = modelWith({ stockPowerPs: 130, curbWeightKg: 940 })
    const car = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({ tyres: tyreInstance(STREET_TYRES, 'scrap') }),
    })
    expect(lapTimeSecondsFor(car, model, CONTEXT)).toBeNull()
  })

  it('is deterministic: the same car/model computes the same time every call', () => {
    const model = modelWith({ stockPowerPs: 170, curbWeightKg: 1050 })
    const car = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({ tyres: tyreInstance(SPORT_TYRES) }),
    })
    const first = lapTimeSecondsFor(car, model, CONTEXT)
    const second = lapTimeSecondsFor(car, model, CONTEXT)
    expect(first).toBe(second)
  })

  it('monotonic: more power (nothing else changed) always produces a faster (lower) time', () => {
    const weaker = modelWith({ stockPowerPs: 120, curbWeightKg: 1000 })
    const stronger = modelWith({ stockPowerPs: 200, curbWeightKg: 1000 })
    const tyres = { tyres: tyreInstance(STREET_TYRES) }
    const weakerTime = lapTimeSecondsFor(
      buildCarInstance({ modelId: weaker.id, parts: mintCarParts(tyres) }),
      weaker,
      CONTEXT,
    )!
    const strongerTime = lapTimeSecondsFor(
      buildCarInstance({ modelId: stronger.id, parts: mintCarParts(tyres) }),
      stronger,
      CONTEXT,
    )!
    expect(strongerTime).toBeLessThan(weakerTime)
  })

  it('monotonic: less weight (nothing else changed) always produces a faster (lower) time', () => {
    const heavier = modelWith({ stockPowerPs: 150, curbWeightKg: 1300 })
    const lighter = modelWith({ stockPowerPs: 150, curbWeightKg: 950 })
    const tyres = { tyres: tyreInstance(STREET_TYRES) }
    const heavierTime = lapTimeSecondsFor(
      buildCarInstance({ modelId: heavier.id, parts: mintCarParts(tyres) }),
      heavier,
      CONTEXT,
    )!
    const lighterTime = lapTimeSecondsFor(
      buildCarInstance({ modelId: lighter.id, parts: mintCarParts(tyres) }),
      lighter,
      CONTEXT,
    )!
    expect(lighterTime).toBeLessThan(heavierTime)
  })

  it('monotonic: better tyres (nothing else changed) always produce a faster (lower) time, stock > street > sport > race', () => {
    const model = modelWith({ stockPowerPs: 150, curbWeightKg: 1050 })
    const timeAt = (part: typeof STOCK_TYRES) =>
      lapTimeSecondsFor(
        buildCarInstance({ modelId: model.id, parts: mintCarParts({ tyres: tyreInstance(part) }) }),
        model,
        CONTEXT,
      )!
    const stockTime = timeAt(STOCK_TYRES)
    const streetTime = timeAt(STREET_TYRES)
    const sportTime = timeAt(SPORT_TYRES)
    const raceTime = timeAt(RACE_TYRES)
    expect(stockTime).toBeGreaterThan(streetTime)
    expect(streetTime).toBeGreaterThan(sportTime)
    expect(sportTime).toBeGreaterThan(raceTime)
  })
})

describe('selectBoardRows (Sprint 77 decision 4)', () => {
  const anchor = {
    id: 'anchor-car',
    name: "The magazine's long-termer",
    powerPs: 150,
    weightKg: 1000,
  }

  // A hand-built pool: 3 street-grade entries (so the same-grade straddle has
  // real slower/faster options), plus a couple of other-grade entries used
  // only by the padding tests below.
  const pool = [
    {
      id: 'street-a',
      name: 'Street A',
      powerPs: 140,
      weightKg: 1100,
      tyreGrade: 'street' as const,
    },
    {
      id: 'street-b',
      name: 'Street B',
      powerPs: 160,
      weightKg: 1000,
      tyreGrade: 'street' as const,
    },
    { id: 'street-c', name: 'Street C', powerPs: 180, weightKg: 950, tyreGrade: 'street' as const },
    { id: 'sport-a', name: 'Sport A', powerPs: 150, weightKg: 1000, tyreGrade: 'sport' as const },
    { id: 'stock-a', name: 'Stock A', powerPs: 100, weightKg: 1200, tyreGrade: 'stock' as const },
  ]

  it('always appends exactly the 4 anchor rows, one per tyre grade', () => {
    const rows = selectBoardRows(pool, anchor, null, 90, ECONOMY)
    const anchorRows = rows.filter((r) => r.isAnchor)
    expect(anchorRows).toHaveLength(4)
    expect(new Set(anchorRows.map((r) => r.tyreGrade))).toEqual(
      new Set(['stock', 'street', 'sport', 'race']),
    )
    expect(anchorRows.every((r) => r.name === anchor.name)).toBe(true)
  })

  it('with a candidate: picks the 2 nearest slower and 2 nearest faster from the SAME tyre grade', () => {
    // street-a (140/1100) and street-c (180/950) straddle street-b
    // (160/1000) from below/above respectively; candidate time is computed
    // to fall between them.
    const candidateTime = expectedLapTimeSeconds(1000, 155, ECONOMY.lapModel.gripMult.street)
    const rows = selectBoardRows(
      pool,
      anchor,
      { timeSeconds: candidateTime, tyreGrade: 'street' },
      90,
      ECONOMY,
    )
    const poolRows = rows.filter((r) => !r.isAnchor)
    const ids = poolRows.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['street-a', 'street-b', 'street-c']))
    // Only 3 street entries exist, so the 4th slot pads from another grade.
    expect(poolRows).toHaveLength(4)
  })

  it('pads from another grade, nearest by time, when a side runs dry within the same grade', () => {
    const timesById = Object.fromEntries(
      pool.map((entry) => [
        entry.id,
        expectedLapTimeSeconds(
          entry.weightKg,
          entry.powerPs,
          ECONOMY.lapModel.gripMult[entry.tyreGrade],
        ),
      ]),
    )
    // Only ONE street entry (street-c) is faster than this candidate - the
    // faster side needs a 2nd row and sport-a (the nearest non-street entry
    // that's also actually faster) is the only thing available to pad it
    // with. Picked as the midpoint between sport-a and street-b so sport-a
    // and street-c both land on the faster side and street-a/street-b both
    // land on the slower side, regardless of the exact formula constants.
    const candidateTime = (timesById['sport-a']! + timesById['street-b']!) / 2
    const rows = selectBoardRows(
      pool,
      anchor,
      { timeSeconds: candidateTime, tyreGrade: 'street' },
      90,
      ECONOMY,
    )
    const poolRows = rows.filter((r) => !r.isAnchor)
    expect(poolRows.map((r) => r.id)).toEqual(
      expect.arrayContaining(['street-c', 'sport-a', 'street-b', 'street-a']),
    )
    expect(poolRows.some((r) => r.tyreGrade !== 'street')).toBe(true)
  })

  it('with no candidate: takes the 4 pool entries nearest the target time, no grade filtering', () => {
    const rows = selectBoardRows(pool, anchor, null, 90, ECONOMY)
    const poolRows = rows.filter((r) => !r.isAnchor)
    expect(poolRows).toHaveLength(4)
    // The pool only has 5 entries total, so "nearest 4 of 5" excludes
    // exactly the single furthest-from-90s entry.
    const allTimed = pool.map((entry) => ({
      id: entry.id,
      timeSeconds: expectedLapTimeSeconds(
        entry.weightKg,
        entry.powerPs,
        ECONOMY.lapModel.gripMult[entry.tyreGrade],
      ),
    }))
    const furthest = [...allTimed].sort(
      (a, b) => Math.abs(b.timeSeconds - 90) - Math.abs(a.timeSeconds - 90),
    )[0]!
    expect(poolRows.map((r) => r.id)).not.toContain(furthest.id)
  })

  it("never surfaces the candidate's own predicted time in any returned row", () => {
    const candidateTime = expectedLapTimeSeconds(1000, 155, ECONOMY.lapModel.gripMult.street)
    const rows = selectBoardRows(
      pool,
      anchor,
      { timeSeconds: candidateTime, tyreGrade: 'street' },
      90,
      ECONOMY,
    )
    expect(rows.some((r) => r.timeSeconds === candidateTime)).toBe(false)
  })

  it('is deterministic across repeated calls with the same inputs', () => {
    const first = selectBoardRows(pool, anchor, null, 90, ECONOMY)
    const second = selectBoardRows(pool, anchor, null, 90, ECONOMY)
    expect(second).toEqual(first)
  })
})

/**
 * The real `lapReferences.json` content, run through the real model - a
 * generous [55s, 125s] band around the "roughly 70 to 110s" target (times
 * are synthetic and formula-derived, never authored, so a small
 * coefficient retune should not make this brittle).
 */
describe('LAP_REFERENCES content sanity (Sprint 77 task 3)', () => {
  it('every pool entry computes a lap time in the intended range', () => {
    const pool = LAP_REFERENCES.filter((entry) => !entry.anchor)
    expect(pool).toHaveLength(12)
    for (const entry of pool) {
      const time = expectedLapTimeSeconds(
        entry.weightKg,
        entry.powerPs,
        ECONOMY.lapModel.gripMult[entry.tyreGrade],
      )
      expect(time, `"${entry.id}" computed ${time}s, outside the intended range`).toBeGreaterThan(
        55,
      )
      expect(time, `"${entry.id}" computed ${time}s, outside the intended range`).toBeLessThan(125)
    }
  })

  it("the anchor's four grade rows are each in the intended range", () => {
    const anchor = LAP_REFERENCES.find((entry) => entry.anchor)!
    for (const grade of ['stock', 'street', 'sport', 'race'] as const) {
      const time = expectedLapTimeSeconds(
        anchor.weightKg,
        anchor.powerPs,
        ECONOMY.lapModel.gripMult[grade],
      )
      expect(time).toBeGreaterThan(55)
      expect(time).toBeLessThan(125)
    }
  })
})
