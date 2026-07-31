import { describe, expect, it } from 'vitest'
import rawTaxonomy from '../data/parts-taxonomy.json'
import { PARTS_TAXONOMY } from '../src'

/**
 * Catalogue completeness for `StatWeightsSchema`'s three required columns
 * (`power`, `reliability`, `authenticity`): none is defaulted, so a taxonomy
 * entry that forgets one fails schema validation instead of silently reading
 * as zero - the same missing-entry-fails-loudly shape `powerFraction.test.ts`
 * already checks for `Part.statModifiers.powerFraction`. Checked against the
 * RAW JSON, not the parsed/defaulted type, so a genuinely missing key cannot
 * hide behind the schema filling it in.
 *
 * `authenticity` matters most of the three, because it is read twice: it
 * weights the originality sum (`stocknessOf`) as well as authenticity's own
 * condition mean, so an unauthored slot would drop out of both at once.
 */
const REQUIRED_WEIGHTS = ['power', 'reliability', 'authenticity'] as const

describe('StatWeightsSchema completeness (power, reliability and authenticity)', () => {
  it('covers all 29 taxonomy entries', () => {
    expect(PARTS_TAXONOMY.length).toBe(29)
  })

  it('every taxonomy entry authors all three required weights explicitly in the raw JSON', () => {
    const offenders: string[] = []
    for (const entry of rawTaxonomy as ReadonlyArray<{ id: string; statWeights: object }>) {
      const missing = REQUIRED_WEIGHTS.filter((key) => !(key in entry.statWeights))
      if (missing.length > 0) offenders.push(`${entry.id}: missing ${missing.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })
})
