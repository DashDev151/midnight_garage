import { describe, expect, it } from 'vitest'
import rawParts from '../data/parts.json'
import { PARTS, StatModifierSchema, StatWeightsSchema } from '../src'

/**
 * What a SKU is still allowed to say about a car's derived stats, pinned as a
 * shape rather than as prose.
 *
 * `StatModifierSchema` has been narrowed one field at a time as each additive
 * stat was replaced by something the model derives: absolute `power` by the
 * per-character `powerFraction`, `reliability` by condition plus the support
 * ratios, `authenticity` by how stock the car is, and the flat `handling`
 * delta by `physicalModifiers.grip`, which already moves the quantity the
 * handling readout is built from. What survives is `style` (points spent
 * closing a car's own base-to-ceiling gap) and `powerFraction`.
 *
 * The taxonomy's `statWeights` is a different thing wearing a similar shape -
 * how much a slot's CONDITION counts toward each stat, not what a part adds -
 * and keeps its own five columns, handling included. The two schemas are
 * separate for exactly this reason, and the second half of this file is the
 * guard that narrowing one never narrows the other.
 */
describe('StatModifierSchema carries only what a part can still change', () => {
  it('is exactly style and powerFraction', () => {
    expect(Object.keys(StatModifierSchema.shape).sort()).toEqual(['powerFraction', 'style'])
  })

  it('no SKU carries a handling modifier, checked against the raw JSON rather than the parsed type', () => {
    const offenders = (rawParts as ReadonlyArray<{ id: string; statModifiers: object }>)
      .filter((part) => 'handling' in part.statModifiers)
      .map((part) => part.id)
    expect(offenders).toEqual([])
  })

  it('every one of the 472 parsed SKUs exposes exactly the two surviving keys', () => {
    expect(PARTS.length).toBe(472)
    const shapes = new Set(PARTS.map((part) => Object.keys(part.statModifiers).sort().join(',')))
    expect([...shapes]).toEqual(['powerFraction,style'])
  })
})

describe('the taxonomy condition weights are a separate schema and keep all five stats', () => {
  it('StatWeightsSchema still carries handling, alongside the other four', () => {
    expect(Object.keys(StatWeightsSchema.shape).sort()).toEqual([
      'authenticity',
      'handling',
      'power',
      'reliability',
      'style',
    ])
  })

  it('a taxonomy entry may still weight handling, and rejects an unknown key', () => {
    const weights = { power: 0, handling: 3, style: 0, reliability: 1, authenticity: 2 }
    expect(StatWeightsSchema.parse(weights).handling).toBe(3)
    expect(() => StatWeightsSchema.parse({ ...weights, handlin: 3 })).toThrow()
  })
})
