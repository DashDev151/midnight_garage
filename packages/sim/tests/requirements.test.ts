import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type CarLedger } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { marketValueYen } from '../src/marketValue'
import { evaluateRequirement } from '../src/requirements'
import { valuateCarForBuyer } from '../src/valuation'
import { buildCarInstance, uniformCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const MODEL = CARS[0]!
const EMPTY_LEDGER: CarLedger = { purchaseYen: null, repairYen: 0, partsYen: 0 }

describe('evaluateRequirement', () => {
  describe('slotCondition (Sprint 72, unchanged)', () => {
    it('passes when the slot meets band and grade', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const result = evaluateRequirement(
        { kind: 'slotCondition', carPartId: 'block', minBand: 'fine' },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
      )
      expect(result.pass).toBe(true)
    })

    it('fails on an empty or scrap slot regardless of minGrade', () => {
      const car = buildCarInstance({
        modelId: MODEL.id,
        parts: uniformCarParts('scrap'),
      })
      const result = evaluateRequirement(
        { kind: 'slotCondition', carPartId: 'block', minBand: 'worn' },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
      )
      expect(result.pass).toBe(false)
      expect(result.actual).toBe('scrap')
    })
  })

  describe('statThreshold / statCeiling (Sprint 76)', () => {
    it('statThreshold passes when the derived stat clears the floor', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const result = evaluateRequirement(
        { kind: 'statThreshold', stat: 'power', min: 1 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
        MODEL,
      )
      expect(result.pass).toBe(true)
    })

    it('statThreshold fails when the derived stat falls short of the floor', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const result = evaluateRequirement(
        { kind: 'statThreshold', stat: 'power', min: 100_000 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
        MODEL,
      )
      expect(result.pass).toBe(false)
    })

    it('statCeiling passes when the derived stat stays under the max', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const result = evaluateRequirement(
        { kind: 'statCeiling', stat: 'style', max: 100 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
        MODEL,
      )
      expect(result.pass).toBe(true)
    })

    it('statCeiling fails when the derived stat exceeds the max', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const result = evaluateRequirement(
        { kind: 'statCeiling', stat: 'style', max: -1 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
        MODEL,
      )
      expect(result.pass).toBe(false)
    })

    it('fails closed when no model is resolvable (a legacy call site with no model to pass)', () => {
      const car = buildCarInstance()
      const result = evaluateRequirement(
        { kind: 'statThreshold', stat: 'power', min: 0 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
      )
      expect(result.pass).toBe(false)
      expect(result.actual).toBe('unknown')
    })
  })

  describe('budgetCap (Sprint 76)', () => {
    it('passes at or under the cap', () => {
      const ledger: CarLedger = { purchaseYen: 100_000, repairYen: 20_000, partsYen: 5_000 }
      const result = evaluateRequirement(
        { kind: 'budgetCap', maxTotalSpendYen: 125_000 },
        buildCarInstance(),
        ledger,
        1,
        CONTEXT,
      )
      expect(result.pass).toBe(true)
    })

    it('fails over the cap', () => {
      const ledger: CarLedger = { purchaseYen: 100_000, repairYen: 20_000, partsYen: 5_001 }
      const result = evaluateRequirement(
        { kind: 'budgetCap', maxTotalSpendYen: 125_000 },
        buildCarInstance(),
        ledger,
        1,
        CONTEXT,
      )
      expect(result.pass).toBe(false)
    })

    it('treats an unknown (null) purchase as zero spend, per decision 1', () => {
      const ledger: CarLedger = { purchaseYen: null, repairYen: 1_000, partsYen: 0 }
      const atCap = evaluateRequirement(
        { kind: 'budgetCap', maxTotalSpendYen: 1_000 },
        buildCarInstance(),
        ledger,
        1,
        CONTEXT,
      )
      expect(atCap.pass).toBe(true)
      const underCap = evaluateRequirement(
        { kind: 'budgetCap', maxTotalSpendYen: 999 },
        buildCarInstance(),
        ledger,
        1,
        CONTEXT,
      )
      expect(underCap.pass).toBe(false)
    })
  })

  describe('deadline (Sprint 76)', () => {
    it('passes on or before the due day', () => {
      const result = evaluateRequirement(
        { kind: 'deadline', dueOnDay: 10 },
        buildCarInstance(),
        EMPTY_LEDGER,
        10,
        CONTEXT,
      )
      expect(result.pass).toBe(true)
    })

    it('fails once the day has passed the deadline', () => {
      const result = evaluateRequirement(
        { kind: 'deadline', dueOnDay: 10 },
        buildCarInstance(),
        EMPTY_LEDGER,
        11,
        CONTEXT,
      )
      expect(result.pass).toBe(false)
    })
  })

  describe('tasteMatch (Sprint 76)', () => {
    const buyer = BUYERS[0]!

    it('passes when the real ratio clears minMultiplier', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const value = marketValueYen(
        MODEL,
        car,
        100,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        CONTEXT.economy,
      )
      const valuated = valuateCarForBuyer(
        buyer,
        MODEL,
        car,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        CONTEXT.partsTaxonomyById,
        100,
        CONTEXT.economy,
      )
      const realRatio = valuated / value
      const result = evaluateRequirement(
        { kind: 'tasteMatch', buyerId: buyer.id, minMultiplier: realRatio - 0.01 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
        MODEL,
      )
      expect(result.pass).toBe(true)
    })

    it('fails when minMultiplier exceeds what the taste bound can ever reach', () => {
      // tasteMultiplier is bounded to [1 - tasteSpread, 1 + tasteSpread]
      // (economy.json's valuation.tasteSpread) - comfortably above that upper
      // bound can never pass.
      const car = buildCarInstance({ modelId: MODEL.id })
      const result = evaluateRequirement(
        { kind: 'tasteMatch', buyerId: buyer.id, minMultiplier: 5 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
        MODEL,
      )
      expect(result.pass).toBe(false)
    })

    it('fails closed for an unresolvable buyer id', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const result = evaluateRequirement(
        { kind: 'tasteMatch', buyerId: 'no-such-buyer', minMultiplier: 0.1 },
        car,
        EMPTY_LEDGER,
        1,
        CONTEXT,
        MODEL,
      )
      expect(result.pass).toBe(false)
      expect(result.actual).toBe('unknown')
    })

    /**
     * Decision 1's own claim: `valuateCarForBuyer / marketValueYen` equals the
     * buyer's taste multiplier regardless of which heat value is used for
     * BOTH terms - so `evaluateRequirement` can read at a fixed neutral heat
     * without threading live `GameState.marketHeat` into its signature. Proven
     * directly here (not through `evaluateRequirement`, which always uses its
     * own fixed heat): the ratio computed at two very different heat
     * percentages is the same, up to the rounding both functions already do.
     */
    it('the heat-cancelling property: the valuation ratio is the same at two different heat values', () => {
      const car = buildCarInstance({ modelId: MODEL.id })
      const ratioAt = (heatPercent: number) => {
        const value = marketValueYen(
          MODEL,
          car,
          heatPercent,
          CONTEXT.partsById,
          CONTEXT.partsTaxonomyById,
          CONTEXT.economy,
        )
        const valuated = valuateCarForBuyer(
          buyer,
          MODEL,
          car,
          CONTEXT.partsById,
          CONTEXT.partsTaxonomy,
          CONTEXT.partsTaxonomyById,
          heatPercent,
          CONTEXT.economy,
        )
        return valuated / value
      }
      expect(ratioAt(60)).toBeCloseTo(ratioAt(140), 3)
    })
  })

  describe('roadworthy (Sprint 76)', () => {
    it('passes when every slot is worn or better', () => {
      const car = buildCarInstance({ modelId: MODEL.id, parts: uniformCarParts('worn') })
      const result = evaluateRequirement({ kind: 'roadworthy' }, car, EMPTY_LEDGER, 1, CONTEXT)
      expect(result.pass).toBe(true)
    })

    it('fails when at least one slot is missing', () => {
      const car = buildCarInstance({
        modelId: MODEL.id,
        parts: uniformCarParts('mint'),
      })
      const withOneMissing = { ...car, parts: { ...car.parts, block: { installed: null } } }
      const result = evaluateRequirement(
        { kind: 'roadworthy' },
        withOneMissing,
        EMPTY_LEDGER,
        1,
        CONTEXT,
      )
      expect(result.pass).toBe(false)
      expect(result.actual).toContain('1 slot')
    })

    it('fails when at least one slot is below worn (poor or scrap)', () => {
      const car = buildCarInstance({ modelId: MODEL.id, parts: uniformCarParts('worn') })
      const withOnePoor = {
        ...car,
        parts: {
          ...car.parts,
          tyres: {
            ...car.parts.tyres,
            installed: { ...car.parts.tyres.installed!, band: 'poor' as const },
          },
        },
      }
      const result = evaluateRequirement(
        { kind: 'roadworthy' },
        withOnePoor,
        EMPTY_LEDGER,
        1,
        CONTEXT,
      )
      expect(result.pass).toBe(false)
    })
  })
})
