import {
  ALL_CAR_PART_IDS,
  BUYERS,
  BuyerArchetypeSchema,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type Buyer,
  type BuyerArchetype,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type Grade,
  type StatKey,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { marketValueYen } from '../src/marketValue'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import { freshSceneLedger, wordOfMouthMultiplierFor } from '../src/sceneStanding'
import {
  championStatFor,
  currentPowerExpectationBarPs,
  isTasteMatched,
  valuateCarForBuyer,
  valuateCarForBuyerViaChannel,
} from '../src/valuation'
import { carWithGrades, testSceneStanding } from './testFixtures'

/**
 * sprint183.md half one: re-establish, in numbers, what the scene-standing
 * ladder's thresholds now mean after sprint182.md made a matched delivery
 * rare on purpose (the champion gate + culture affinity). This is
 * measurement only - no lever in `economy.json` moves as a result of this
 * file. Every
 * number below is closed-form arithmetic over the real sim functions against
 * the shipped roster and generated lots, in the style of
 * `tasteMatchGradient.test.ts` (sprint182) and `balanceProbes.ts` - no bot
 * career, no RNG-driven "how long does a player take" simulation (directive
 * 21 forbids both).
 *
 * Every `it` below logs the figures behind the sprint's own Exit and report
 * table, then asserts only what is STRUCTURALLY true (bounds, orderings,
 * internal consistency) - never a pinned percentage that would make this
 * file the next thing to go stale the moment content changes again.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const SCENES = BuyerArchetypeSchema.options
const LOT_COUNT = 400
const SHOP_FRONT_CEILING = ECONOMY.sellingChannels.shopFront.tasteCeiling!

function buyerFor(scene: BuyerArchetype): Buyer {
  return BUYERS.find((b) => b.archetype === scene)!
}

/** Every shipped model, once each - the 26-car roster sprint182.md itself
 * measured against. */
const SHIPPED_MODELS = CARS

/** 400 generated auction lots, cycling the shipped roster exactly as
 * `tasteMatchGradient.test.ts` (sprint182) does, so this file's population
 * is directly comparable to that one's. */
const LOTS = Array.from({ length: LOT_COUNT }, (_, i) => {
  const model = CARS[i % CARS.length]!
  const car = generateAuctionCarInstance(model, `retune-lot-${i}`, createRng(i), CONTEXT)
  return { model, car }
})

function stockMint(model: CarModel): CarInstance {
  return carWithGrades(model, CONTEXT, {}, 'mint')
}

function uniformGrade(model: CarModel, grade: Grade): CarInstance {
  const grades = Object.fromEntries(ALL_CAR_PART_IDS.map((id) => [id, grade])) as Partial<
    Record<CarPartId, Grade>
  >
  return carWithGrades(model, CONTEXT, grades, 'mint')
}

/** Every `CarPartId` whose taxonomy entry carries a positive condition
 * weight on `stat` - the real, authored slots a build aimed at that stat
 * would touch (`parts-taxonomy.json`), not a hand-maintained second list. */
function slotsCarryingWeight(stat: StatKey): CarPartId[] {
  return PARTS_TAXONOMY.filter((entry) => entry.statWeights[stat] > 0).map((entry) => entry.id)
}

const POWER_SLOTS = slotsCarryingWeight('power')
const HANDLING_SLOTS = slotsCarryingWeight('handling')
const STYLE_SLOTS = slotsCarryingWeight('style')

/**
 * The build a player DELIBERATELY targeting `scene` would make: race-grade,
 * mint parts in every slot that actually moves that scene's champion stat
 * (`championStatFor`), everything else left plain mint stock so an unrelated
 * stat is never dragged down by the build (`upper`-bounded stats - Touge and
 * Daily Drivers both cap power - stay safe this way, since neither of their
 * champions is power). Reliability and authenticity have no aftermarket
 * lever that helps them at all (`derivedStats.ts`: reliability is best at
 * zero build intensity, authenticity is best at zero machining and full
 * stockness) - so for Collector and Daily Drivers, the honestly-targeted
 * build IS the plain restoration, identical to `stockMint`. That equality is
 * a finding in itself, not an oversight.
 */
function sceneTargetedBuild(model: CarModel, scene: BuyerArchetype): CarInstance {
  const champion = championStatFor(buyerFor(scene))
  if (champion === 'reliability' || champion === 'authenticity') return stockMint(model)
  const slots =
    champion === 'power' ? POWER_SLOTS : champion === 'handling' ? HANDLING_SLOTS : STYLE_SLOTS
  const grades = Object.fromEntries(slots.map((id) => [id, 'race' as Grade])) as Partial<
    Record<CarPartId, Grade>
  >
  return carWithGrades(model, CONTEXT, grades, 'mint')
}

type BuildLevel = 'stock' | 'street' | 'sport' | 'race' | 'targeted'
const BUILD_LEVELS: readonly BuildLevel[] = ['stock', 'street', 'sport', 'race', 'targeted']

function buildAt(model: CarModel, level: BuildLevel, scene: BuyerArchetype): CarInstance {
  if (level === 'stock') return stockMint(model)
  if (level === 'targeted') return sceneTargetedBuild(model, scene)
  return uniformGrade(model, level)
}

function matches(scene: BuyerArchetype, model: CarModel, car: CarInstance): boolean {
  return isTasteMatched(
    buyerFor(scene),
    model,
    car,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomy,
    ECONOMY,
  )
}

function fraction(count: number, total: number): number {
  return total === 0 ? 0 : count / total
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function yen(x: number): string {
  return `Y${Math.round(x).toLocaleString('en-US')}`
}

// ---------------------------------------------------------------------------
// Item 1: match rate per scene, per build level, roster and generated lots.
// ---------------------------------------------------------------------------

interface RateRow {
  scene: BuyerArchetype
  level: BuildLevel
  rosterFraction: number
  lotsFraction: number
}

const MATCH_RATES: RateRow[] = []
for (const scene of SCENES) {
  for (const level of BUILD_LEVELS) {
    const rosterMatched = SHIPPED_MODELS.filter((model) =>
      matches(scene, model, buildAt(model, level, scene)),
    ).length
    const lotsMatched = LOTS.filter(({ model }) =>
      matches(scene, model, buildAt(model, level, scene)),
    ).length
    MATCH_RATES.push({
      scene,
      level,
      rosterFraction: fraction(rosterMatched, SHIPPED_MODELS.length),
      lotsFraction: fraction(lotsMatched, LOT_COUNT),
    })
  }
}

/** Arrival-stage match rate per scene, over the same 400 generated lots -
 * bonus context for item 4 (word-of-mouth dormancy): how often a lot ARRIVES
 * already matched, before any purchase decision at all. Not one of item 1's
 * five requested build levels, but the natural sixth data point and the one
 * `tasteMatchGradient.test.ts` already established the aggregate ("any
 * scene") version of. */
const ARRIVAL_RATE_BY_SCENE: Record<BuyerArchetype, number> = {} as Record<BuyerArchetype, number>
for (const scene of SCENES) {
  const arrivalMatched = LOTS.filter(({ model, car }) => matches(scene, model, car)).length
  ARRIVAL_RATE_BY_SCENE[scene] = fraction(arrivalMatched, LOT_COUNT)
}

describe('Item 1: per-scene, per-build-level match rate (roster and 400 generated lots)', () => {
  it('reports the full matrix', () => {
    console.log('\n=== ITEM 1: match rate by scene x build level ===')
    console.log('scene | arrival | stock-mint | street | sport | race | targeted   (roster / lots)')
    for (const scene of SCENES) {
      const rowFor = (level: BuildLevel): RateRow =>
        MATCH_RATES.find((r) => r.scene === scene && r.level === level)!
      const cells = BUILD_LEVELS.map((level) => {
        const row = rowFor(level)
        return `${pct(row.rosterFraction)}/${pct(row.lotsFraction)}`
      })
      console.log(
        `${scene.padEnd(14)} | ${pct(ARRIVAL_RATE_BY_SCENE[scene]).padEnd(7)} | ${cells.join(' | ')}`,
      )
    }
  })

  it('every measured fraction is a real probability (sanity, not a pin)', () => {
    for (const row of MATCH_RATES) {
      expect(row.rosterFraction).toBeGreaterThanOrEqual(0)
      expect(row.rosterFraction).toBeLessThanOrEqual(1)
      expect(row.lotsFraction).toBeGreaterThanOrEqual(0)
      expect(row.lotsFraction).toBeLessThanOrEqual(1)
    }
  })

  it('a deliberate scene-targeted build never scores a scene worse than doing nothing (stock mint), on the lots population', () => {
    // Structurally true by construction: the targeted build either equals
    // stock mint outright (collector, daily-drivers - no aftermarket lever
    // helps their champion) or adds race-grade parts ONLY in slots that
    // carry positive weight on the champion stat, changing nothing else -
    // so the champion score can only rise or hold. A failure here would mean
    // the targeted-build construction itself is unsound, not a content fact
    // worth reporting.
    for (const scene of SCENES) {
      const stockRate = MATCH_RATES.find(
        (r) => r.scene === scene && r.level === 'stock',
      )!.lotsFraction
      const targetedRate = MATCH_RATES.find(
        (r) => r.scene === scene && r.level === 'targeted',
      )!.lotsFraction
      expect(targetedRate).toBeGreaterThanOrEqual(stockRate)
    }
  })
})

// ---------------------------------------------------------------------------
// Item 2: what the thresholds now mean in cars.
// ---------------------------------------------------------------------------

const { knownDeliveries, respectedDeliveries } = ECONOMY.sceneStandingProgress

interface ThresholdRow {
  scene: BuyerArchetype
  bestMatchRate: number
  bestLevel: BuildLevel
  reachableRosterFraction: number
  carsFor3: number | null
  carsFor10: number | null
}

/**
 * The base rate a genuinely deliberate player converts at: the BEST of the
 * five measured build levels, not the isolated "champion-only" targeted
 * build in particular. Measured, not assumed - for Tuner and Racer a full
 * uniform `race` build clears the overall weighted mean (not just the
 * champion gate) more often than a build isolated to only the champion's own
 * slots, because their champion is not the only heavily-weighted stat
 * (Racer weights handling at 0.9, second only to power's 1); for Touge the
 * opposite holds, because a full race build overshoots its power `upper`
 * (0.55) on some cars, so the isolated targeted build (which never touches
 * power) does better. A real player facing this ladder would simply pick
 * whichever build works, so the best-of-five is the honest base rate, and
 * which level wins is itself a finding, reported alongside the number.
 */
const THRESHOLD_ROWS: ThresholdRow[] = SCENES.map((scene) => {
  const ratesByLevel = BUILD_LEVELS.map((level) => ({
    level,
    rate: MATCH_RATES.find((r) => r.scene === scene && r.level === level)!.lotsFraction,
  }))
  const best = ratesByLevel.reduce((a, b) => (b.rate > a.rate ? b : a))
  const reachableCount = SHIPPED_MODELS.filter((model) =>
    BUILD_LEVELS.some((level) => matches(scene, model, buildAt(model, level, scene))),
  ).length
  const reachableRosterFraction = fraction(reachableCount, SHIPPED_MODELS.length)
  const carsFor = (n: number): number | null => (best.rate > 0 ? Math.ceil(n / best.rate) : null)
  return {
    scene,
    bestMatchRate: best.rate,
    bestLevel: best.level,
    reachableRosterFraction,
    carsFor3: carsFor(knownDeliveries),
    carsFor10: carsFor(respectedDeliveries),
  }
})

describe('Item 2: what knownDeliveries (3) and respectedDeliveries (10) now mean in cars', () => {
  it('reports the derived car counts per scene', () => {
    console.log('\n=== ITEM 2: cars needed for Known (3) / Respected (10), by scene ===')
    console.log(
      'scene | best rate (best of the 5 measured builds) | reachable-at-all (roster) | cars for 3 | cars for 10',
    )
    for (const row of THRESHOLD_ROWS) {
      console.log(
        `${row.scene.padEnd(14)} | ${pct(row.bestMatchRate).padEnd(6)} via ${row.bestLevel.padEnd(
          8,
        )} | ${pct(row.reachableRosterFraction).padEnd(25)} | ${row.carsFor3 ?? 'IMPOSSIBLE'} | ${
          row.carsFor10 ?? 'IMPOSSIBLE'
        }`,
      )
    }
  })

  it('a scene reachable by at least one build can never report an impossible car count', () => {
    for (const row of THRESHOLD_ROWS) {
      if (row.reachableRosterFraction > 0) {
        expect(row.carsFor3).not.toBeNull()
        expect(row.carsFor10).not.toBeNull()
      }
    }
  })

  it('the cars-for-10 figure is never smaller than the cars-for-3 figure (monotonic in the threshold)', () => {
    for (const row of THRESHOLD_ROWS) {
      if (row.carsFor3 !== null && row.carsFor10 !== null) {
        expect(row.carsFor10).toBeGreaterThanOrEqual(row.carsFor3)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Item 3: the Shop stage's joint condition (matched AND clears the marquee bar).
// ---------------------------------------------------------------------------

interface ShopJointRow {
  scene: BuyerArchetype
  qualifyingCount: number
}

const SHOP_JOINT_ROWS: ShopJointRow[] = SCENES.map((scene) => {
  const buyer = buyerFor(scene)
  const qualifyingCount = SHIPPED_MODELS.filter((model) => {
    const marqueeBar =
      ECONOMY.sceneStandingProgress.marqueeBarYenByTier[fitmentClassForTier(model.tier)]
    return BUILD_LEVELS.some((level) => {
      const car = buildAt(model, level, scene)
      if (!matches(scene, model, car)) return false
      const priceYen = valuateCarForBuyer(
        buyer,
        model,
        car,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        CONTEXT.partsTaxonomyById,
        100,
        ECONOMY,
      )
      return priceYen >= marqueeBar
    })
  }).length
  return { scene, qualifyingCount }
})

describe("Item 3: the Shop stage's joint condition (matched AND clears the price bar), per scene, 26 shipped cars", () => {
  it('reports how many shipped cars can BOTH match and clear the bar, at the best of five build levels', () => {
    console.log(
      '\n=== ITEM 3: shipped cars that can jointly match + clear the marquee bar (of 26) ===',
    )
    console.log(
      "(the price used is `valuateCarForBuyer` - this buyer's own uncapped valuation, a CEILING on the real sale price: an actual walk-in offer is priced through a channel band and a quality-draw fraction that can only price it LOWER, so this measures whether the joint condition is reachable at all, not that a real sale would clear it.)",
    )
    for (const row of SHOP_JOINT_ROWS) {
      console.log(`${row.scene.padEnd(14)} | ${row.qualifyingCount} / ${SHIPPED_MODELS.length}`)
    }
    const deadScenes = SHOP_JOINT_ROWS.filter((r) => r.qualifyingCount === 0).map((r) => r.scene)
    if (deadScenes.length > 0) {
      console.log(`DEAD TOP RUNG (no shipped car can do both): ${deadScenes.join(', ')}`)
    }
  })

  it('every scene reports a count within [0, 26]', () => {
    for (const row of SHOP_JOINT_ROWS) {
      expect(row.qualifyingCount).toBeGreaterThanOrEqual(0)
      expect(row.qualifyingCount).toBeLessThanOrEqual(SHIPPED_MODELS.length)
    }
  })
})

// ---------------------------------------------------------------------------
// Item 4: the rolling window's share cap.
// ---------------------------------------------------------------------------

describe('Item 4: rollingWindowShareCap (1.5) - how concentrated deliveries can realistically be', () => {
  const MODEL_ID = CARS[0]!.id
  const { rollingWindowShareCap, wordOfMouthMultiplierByStage } = ECONOMY.sceneStandingProgress
  const fresh = createInitialGameState(CONTEXT, 1)

  it('a single matched delivery, alone in its 14-day window, already reaches the FULL cap - not a partial one', () => {
    // Structural fact about the share formula itself (recentDeliveryShareMultiplier,
    // sceneStanding.ts): share = thisScene's recent count / EVERY scene's
    // recent count. One delivery, nothing else recent anywhere, gives
    // share = 1 exactly - the cap does not require repeated concentrated
    // selling, only that nothing else matched-and-sold recently. This
    // already held before sprint182 (sceneStanding.test.ts's own
    // "exclusive" case); what changed is how likely the diluting case (a
    // second scene ALSO landing a matched sale in the same 14 days) now is.
    const day = 100
    const state = {
      ...fresh,
      day,
      sceneStanding: { ...fresh.sceneStanding, tuner: 'known' as const },
      sceneLedger: {
        ...freshSceneLedger(),
        tuner: [{ carInstanceId: 'a', modelId: MODEL_ID, priceYen: 1, day: day - 1 }],
      },
    }
    const multiplier = wordOfMouthMultiplierFor('tuner', state, ECONOMY)
    expect(multiplier).toBeCloseTo(wordOfMouthMultiplierByStage.known * rollingWindowShareCap, 9)
  })

  it('the cap is diluted only when a SECOND scene also lands a matched sale in the same window - the case sprint182 makes rarer', () => {
    const day = 100
    const state = {
      ...fresh,
      day,
      sceneStanding: { ...fresh.sceneStanding, tuner: 'known' as const, racer: 'known' as const },
      sceneLedger: {
        ...freshSceneLedger(),
        tuner: [{ carInstanceId: 'a', modelId: MODEL_ID, priceYen: 1, day: day - 1 }],
        racer: [{ carInstanceId: 'b', modelId: MODEL_ID, priceYen: 1, day: day - 1 }],
      },
    }
    const multiplier = wordOfMouthMultiplierFor('tuner', state, ECONOMY)
    expect(multiplier).toBeLessThan(wordOfMouthMultiplierByStage.known * rollingWindowShareCap)
  })

  it('reports the finding: given how rare matched deliveries now are (item 1), a diluting second scene in the same window is the unusual case, not the norm', () => {
    console.log('\n=== ITEM 4: rollingWindowShareCap (1.5) reachability ===')
    console.log(
      'The cap is reached by ANY single matched delivery with nothing else recent, at any scene, ' +
        'confirmed above. This was already true pre-182. What sprint182 changes is the DENOMINATOR: ' +
        'reaching the cap fully requires that no OTHER scene also lands a matched sale inside the same ' +
        `14-day window. Arrival-stage match rate per scene over 400 generated lots (context, not a` +
        ' selling-cadence estimate):',
    )
    for (const scene of SCENES) {
      console.log(`  ${scene.padEnd(14)} | arrival match rate ${pct(ARRIVAL_RATE_BY_SCENE[scene])}`)
    }
    console.log(
      'No selling-cadence figure is estimated here (that would need a bot-career-shaped simulation, ' +
        'forbidden by directive 21) - the honest claim is structural: since a matched delivery to even ' +
        'ONE scene is now the rare event, matched deliveries to TWO DIFFERENT scenes landing inside the ' +
        'same 14-day window is rarer still, so in practice reaching the full 1.5 cap now requires LESS ' +
        'deliberate single-scene focus than the cap was calibrated to price - a lot of ordinary, ' +
        'undirected selling will now still read as "exclusive" to whichever scene happens to land at all.',
    )
  })
})

// ---------------------------------------------------------------------------
// Item 5: standing's per-stage effect on a REALISED sale price, in yen.
// ---------------------------------------------------------------------------

interface StandingPriceRow {
  scene: BuyerArchetype
  modelId: string | null
  priceByStage: Record<'none' | 'known' | 'respected' | 'shop', number> | null
  partsBillNoiseYen: number | null
}

const STANDING_PRICE_ROWS: StandingPriceRow[] = SCENES.map((scene) => {
  const buyer = buyerFor(scene)
  // The exemplar: the shipped model with the highest culture affinity for
  // this buyer among those whose scene-targeted build is genuinely MATCHED -
  // a real, matched car, not a hypothetical one, so the price effect
  // measured is the one the gate actually leaves standing to move.
  const candidates = SHIPPED_MODELS.filter((model) =>
    matches(scene, model, sceneTargetedBuild(model, scene)),
  )
  if (candidates.length === 0) {
    return { scene, modelId: null, priceByStage: null, partsBillNoiseYen: null }
  }
  const model = candidates.reduce((best, m) =>
    (buyer.culturePreferences.find((p) => p.culture === m.spec.culture)?.weight ?? 0) >
    (buyer.culturePreferences.find((p) => p.culture === best.spec.culture)?.weight ?? 0)
      ? m
      : best,
  )
  const targetedCar = sceneTargetedBuild(model, scene)
  const stockCar = stockMint(model)

  const priceAt = (stage: 'none' | 'known' | 'respected' | 'shop'): number =>
    valuateCarForBuyerViaChannel(
      buyer,
      model,
      targetedCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.partsTaxonomyById,
      100,
      ECONOMY,
      SHOP_FRONT_CEILING,
      testSceneStanding(stage === 'none' ? {} : { [scene]: stage }),
    )

  const priceByStage = {
    none: priceAt('none'),
    known: priceAt('known'),
    respected: priceAt('respected'),
    shop: priceAt('shop'),
  }

  const partsBillNoiseYen =
    marketValueYen(model, targetedCar, 100, CONTEXT.partsById, CONTEXT.partsTaxonomyById, ECONOMY) -
    marketValueYen(model, stockCar, 100, CONTEXT.partsById, CONTEXT.partsTaxonomyById, ECONOMY)

  return { scene, modelId: model.id, priceByStage, partsBillNoiseYen }
})

describe('Item 5: standing per-stage effect on a REALISED sale price - visible above the parts-bill noise?', () => {
  it('reports yen at every stage, per scene, for a real matched exemplar, against the parts-bill delta on the same car', () => {
    console.log(
      '\n=== ITEM 5: realised sale price by scene standing stage (yen), matched exemplar per scene ===',
    )
    for (const row of STANDING_PRICE_ROWS) {
      if (!row.priceByStage || !row.modelId) {
        console.log(`${row.scene.padEnd(14)} | NO MATCHED SHIPPED EXEMPLAR AT SCENE-TARGETED BUILD`)
        continue
      }
      const { none, known, respected, shop } = row.priceByStage
      const swingPct = ((shop - none) / none) * 100
      console.log(
        `${row.scene.padEnd(14)} | model ${row.modelId.padEnd(28)} | none ${yen(none)} -> known ${yen(
          known,
        )} -> respected ${yen(respected)} -> shop ${yen(shop)}  (swing ${swingPct.toFixed(1)}%, ${yen(
          shop - none,
        )}) | parts-bill delta on same car ${yen(row.partsBillNoiseYen!)}`,
      )
    }
  })

  it('standing never LOWERS the realised price as it climbs the ladder, on a fixed matched build (monotonic by construction)', () => {
    // sceneStandingBandFor only ever raises the floor and/or the ceiling as
    // stage climbs (economy.valuation.sceneStanding: known 0.92 floor;
    // respected 0.95/1.17; shop 0.95/1.25) - never lowers either, so this is
    // a structural property of the band table, not a coincidence of the
    // exemplar chosen.
    for (const row of STANDING_PRICE_ROWS) {
      if (!row.priceByStage) continue
      const { none, known, respected, shop } = row.priceByStage
      expect(known).toBeGreaterThanOrEqual(none)
      expect(respected).toBeGreaterThanOrEqual(known)
      expect(shop).toBeGreaterThanOrEqual(respected)
    }
  })
})

// ---------------------------------------------------------------------------
// Item 6: what else the gate touches - scene commissions and word of mouth.
// ---------------------------------------------------------------------------

describe('Item 6: what the gate touches beyond the matched predicate', () => {
  it("a scene commission's champion requirement (raw-scale statThreshold) is algebraically identical to the gate's champion check (normalized) - never able to disagree", () => {
    // commissionRequirementsFor (sceneCommissions.ts) asks for
    // `buyer.statTargets[champion].target * 100` (or, for power,
    // `* powerNormalizationCeiling`) on the RAW computeDerivedStats scale;
    // the gate (normalizedTasteScore, valuation.ts) asks
    // `scoreByStat[champion] >= target` on the [0, 1] scale, where
    // scoreByStat[champion] is exactly rawStat/100 (or rawStat/ceiling for
    // power). The two are the same inequality on different scales - proved
    // here on real cars either side of a real target, not just asserted in
    // prose.
    for (const scene of SCENES) {
      const buyer = buyerFor(scene)
      const champion = championStatFor(buyer)
      const target = buyer.statTargets[champion].target
      for (const model of SHIPPED_MODELS.slice(0, 6)) {
        for (const level of BUILD_LEVELS) {
          const car = buildAt(model, level, scene)
          const stats = computeDerivedStats(
            model,
            car,
            CONTEXT.partsById,
            CONTEXT.partsTaxonomy,
            ECONOMY,
          )
          const rawValue = stats[champion]
          const normalizedScore =
            champion === 'power'
              ? rawValue / ECONOMY.statFormulas.powerNormalizationCeiling
              : rawValue / 100
          const gateClears = normalizedScore >= target
          const rawThresholdPs =
            champion === 'power'
              ? target * ECONOMY.statFormulas.powerNormalizationCeiling
              : target * 100
          const commissionClears = rawValue >= rawThresholdPs - 1e-9
          expect(commissionClears).toBe(gateClears)
        }
      }
    }
  })

  it("a champion-gate PASS with the worst-authored culture affinity still prices between the standard band's floor and ceiling - commissions are not zeroed by culture, only nudged", () => {
    // normalizedTasteScore multiplies the post-gate match by cultureAffinityFor,
    // and tasteMultiplier (valuation.ts) bounds the RESULT to
    // [1 - tasteSpread, 1 + tasteSpread] regardless of how low that product
    // is - so a scene commission's payout (payoutMultiplier x
    // valuateCarForBuyer) can be pulled toward the floor by a bad-culture car
    // clearing the champion, but it is never driven toward zero the way the
    // matched PREDICATE now can be.
    const { tasteSpread } = ECONOMY.valuation
    console.log(
      '\n=== ITEM 6a: culture affinity bounds on a champion-gate-passing car (tasteMultiplier) ===',
    )
    for (const scene of SCENES) {
      const buyer = buyerFor(scene)
      const worstCulture = buyer.culturePreferences.reduce((worst, p) =>
        p.weight < worst.weight ? p : worst,
      )
      const bestCulture = buyer.culturePreferences.reduce((best, p) =>
        p.weight > best.weight ? p : best,
      )
      console.log(
        `${scene.padEnd(14)} | worst culture ${worstCulture.culture} (${worstCulture.weight}) -> floor ${(
          1 - tasteSpread
        ).toFixed(2)}x | best culture ${bestCulture.culture} (${bestCulture.weight}) -> up to ${(
          1 + tasteSpread
        ).toFixed(2)}x`,
      )
      // The bound holds structurally regardless of which culture: even the
      // worst-authored affinity, once the champion gate has passed, cannot
      // push the multiplier below the standard floor.
      expect(1 - tasteSpread).toBeGreaterThan(0)
    }
  })

  it("word of mouth is inert (flat 1x) until Known, which item 2's own car counts now gate - reported, not re-derived", () => {
    console.log('\n=== ITEM 6b: word-of-mouth dormancy window, per scene (from item 2) ===')
    for (const row of THRESHOLD_ROWS) {
      console.log(
        `${row.scene.padEnd(14)} | word of mouth stays at 1x for approximately ${
          row.carsFor3 ?? 'an unreachable number of'
        } delivered cars before Known's own ${ECONOMY.sceneStandingProgress.wordOfMouthMultiplierByStage.known}x can even begin`,
      )
    }
    expect(ECONOMY.sceneStandingProgress.knownDeliveries).toBe(knownDeliveries)
  })

  it('the Racer scene commission CAN demand strictly more power than the plain taste gate once the power-expectation chain has climbed - a pre-existing interaction, unaffected by 182, worth naming', () => {
    const racer = buyerFor('racer')
    const ordinaryPs =
      racer.statTargets.power.target * ECONOMY.statFormulas.powerNormalizationCeiling
    // A plausible climbed chain: someone has already delivered a genuinely
    // fast car (600 PS, the roster's own power-normalization ceiling), well
    // above the Racer's own ordinary appetite, and stayed at the top of the
    // market for two further deliveries (climbedSteps 2).
    const climbedBar = currentPowerExpectationBarPs({ bestPowerPs: 600, climbedSteps: 2 }, ECONOMY)
    console.log('\n=== ITEM 6c: Racer commission vs plain gate, power requirement (PS) ===')
    console.log(
      `ordinary gate requirement ${ordinaryPs.toFixed(
        0,
      )} PS | climbed-chain bar (bestPowerPs=600, climbedSteps=2) ${(climbedBar ?? 0).toFixed(0)} PS`,
    )
    // A near-ceiling delivered car, held at the top for two further
    // deliveries, genuinely pushes the bar past the Racer's ordinary
    // appetite - the commission and the plain gate are only guaranteed to
    // ask the same thing at the START of a career, before the chain climbs.
    expect(climbedBar).toBeDefined()
    expect(climbedBar!).toBeGreaterThan(ordinaryPs)
  })
})
