import { describe, expect, it } from 'vitest'
import rawTaxonomy from '../data/parts-taxonomy.json'
import { PARTS_TAXONOMY } from '../src'

/**
 * Catalogue completeness for `StatWeightsSchema.power`/`.reliability`: both
 * fields are required, not defaulted, so a taxonomy entry that forgets one
 * now fails schema validation instead of silently reading as zero - the same
 * missing-entry-fails-loudly shape `powerFraction.test.ts` already checks for
 * `Part.statModifiers.powerFraction`. Checked against the RAW JSON, not the
 * parsed/defaulted type, so a genuinely missing key cannot hide behind the
 * schema filling it in.
 */
describe('StatWeightsSchema completeness (power and reliability)', () => {
  it('covers all 29 taxonomy entries', () => {
    expect(PARTS_TAXONOMY.length).toBe(29)
  })

  it('every taxonomy entry authors power and reliability explicitly in the raw JSON', () => {
    const offenders: string[] = []
    for (const entry of rawTaxonomy as ReadonlyArray<{ id: string; statWeights: object }>) {
      const missing: string[] = []
      if (!('power' in entry.statWeights)) missing.push('power')
      if (!('reliability' in entry.statWeights)) missing.push('reliability')
      if (missing.length > 0) offenders.push(`${entry.id}: missing ${missing.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })
})
