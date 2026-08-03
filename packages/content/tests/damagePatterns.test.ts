import { describe, expect, it } from 'vitest'
import {
  DAMAGE_GRADES,
  DAMAGE_PATTERN_IDS,
  DAMAGE_PATTERNS,
  DamagePatternSchema,
  ECONOMY,
  PARTS_TAXONOMY,
} from '../src/index'

/**
 * Damage patterns (docs/design/systems/generation-damage.md, layer 3). A pattern
 * is a weighting over part slots and NOTHING ELSE - the content shape is where
 * that is enforced, because a pattern that could carry a band or an amount
 * would be `applySymptoms` minus the causes, the tests and the price.
 */
describe('the damage-pattern content', () => {
  it('ships exactly one entry per pattern id, so the file and the enum cannot drift', () => {
    expect(DAMAGE_PATTERNS.map((pattern) => pattern.id).sort()).toEqual(
      [...DAMAGE_PATTERN_IDS].sort(),
    )
  })

  it('weights the taxonomy groups and body zones the game already authors, and invents no third grouping', () => {
    const groups = new Set(PARTS_TAXONOMY.map((entry) => entry.group))
    for (const pattern of DAMAGE_PATTERNS) {
      expect(new Set(Object.keys(pattern.slotWeights.groups))).toEqual(groups)
      expect(Object.keys(pattern.slotWeights.zones).sort()).toEqual(
        [
          'bonnet',
          'boot',
          'left-front',
          'left-rear',
          'right-front',
          'right-rear',
          'front-bumper',
          'rear-bumper',
          'skirts',
        ].sort(),
      )
    }
  })

  it('biases rather than filters: every pattern leaves every group and zone reachable', () => {
    // A zero weight would make a whole third of the car unreachable for a car
    // carrying that pattern, which is stronger than any story needs - a shunted
    // car still has a gearbox that can be tired.
    for (const pattern of DAMAGE_PATTERNS) {
      for (const weight of Object.values(pattern.slotWeights.groups)) {
        expect(weight, `${pattern.id} weights a group at zero`).toBeGreaterThan(0)
      }
      for (const weight of Object.values(pattern.slotWeights.zones)) {
        expect(weight, `${pattern.id} weights a zone at zero`).toBeGreaterThan(0)
      }
    }
  })

  it('refuses a pattern that tries to carry a band, an amount or a list of effects', () => {
    const base = DAMAGE_PATTERNS[0]!
    for (const extra of [{ setBand: 'poor' }, { bandSteps: 12 }, { causes: ['rust-patch'] }]) {
      expect(
        DamagePatternSchema.safeParse({ ...base, ...extra }).success,
        `a pattern must not be able to carry ${Object.keys(extra)[0]}`,
      ).toBe(false)
    }
  })

  it('refuses a pattern with a group or a zone missing', () => {
    const base = DAMAGE_PATTERNS[0]!
    const withoutEngine = { ...base.slotWeights.groups }
    delete (withoutEngine as Record<string, unknown>).engine
    expect(
      DamagePatternSchema.safeParse({
        ...base,
        slotWeights: { ...base.slotWeights, groups: withoutEngine },
      }).success,
    ).toBe(false)
    const withoutBonnet = { ...base.slotWeights.zones }
    delete (withoutBonnet as Record<string, unknown>).bonnet
    expect(
      DamagePatternSchema.safeParse({
        ...base,
        slotWeights: { ...base.slotWeights, zones: withoutBonnet },
      }).success,
    ).toBe(false)
  })

  it('gives every history a pattern to draw, and every pattern a history that draws it', () => {
    const { patternWeightsByGrade } = ECONOMY.partsGeneration.damageGrades
    for (const grade of DAMAGE_GRADES) {
      const row = patternWeightsByGrade[grade]
      expect(Object.keys(row).sort(), `${grade} row`).toEqual([...DAMAGE_PATTERN_IDS].sort())
      expect(
        DAMAGE_PATTERN_IDS.reduce((sum, id) => sum + row[id], 0),
        `${grade} row must be drawable`,
      ).toBeGreaterThan(0)
    }
    for (const patternId of DAMAGE_PATTERN_IDS) {
      expect(
        DAMAGE_GRADES.some((grade) => patternWeightsByGrade[grade][patternId] > 0),
        `"${patternId}" is authored but no history can ever draw it`,
      ).toBe(true)
    }
  })
})
