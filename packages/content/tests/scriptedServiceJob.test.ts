import { describe, expect, it } from 'vitest'
import { SCRIPTED_SERVICE_JOB } from '../src/data'
import { ScriptedServiceJobRecipeSchema } from '../src/scriptedServiceJob'
import { ServiceJobSchema, ServiceJobTypeSchema } from '../src/serviceJob'

const baseTask = {
  requirement: {
    kind: 'slotCondition' as const,
    carPartId: 'ignitionEcu' as const,
    minBand: 'fine' as const,
  },
  minToolTier: 1 as const,
}

const baseType = {
  id: 'test-template',
  tier: 1 as const,
  tasks: [baseTask],
  flavorPool: ['One.', 'Two.'],
  deadlineDays: 4,
  baseReputation: 2,
}

describe('ServiceJobTypeSchema.unlocksSellingChannel (sprint205.md task A)', () => {
  it('is absent by default, and every ordinary template still validates', () => {
    const result = ServiceJobTypeSchema.safeParse(baseType)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.unlocksSellingChannel).toBeUndefined()
  })

  it('accepts freeAdsPaper', () => {
    expect(
      ServiceJobTypeSchema.safeParse({ ...baseType, unlocksSellingChannel: 'freeAdsPaper' })
        .success,
    ).toBe(true)
  })

  it.each(['shopFront', 'tradeNetwork'] as const)(
    'refuses %s - both are open from day one',
    (channelId) => {
      expect(
        ServiceJobTypeSchema.safeParse({ ...baseType, unlocksSellingChannel: channelId }).success,
      ).toBe(false)
    },
  )
})

describe('ServiceJobSchema.unlocksSellingChannel (the captured-at-generation instance field)', () => {
  // Tested at the field level, not through a full job object: `car` is a
  // large, unrelated schema, and the refine under test lives entirely on
  // this one field.
  const field = ServiceJobSchema.shape.unlocksSellingChannel

  it('is absent by default, and accepts freeAdsPaper', () => {
    expect(field.safeParse(undefined).success).toBe(true)
    expect(field.safeParse('freeAdsPaper').success).toBe(true)
  })

  it.each(['shopFront', 'tradeNetwork'] as const)(
    'refuses %s on the live job instance too',
    (channelId) => {
      expect(field.safeParse(channelId).success).toBe(false)
    },
  )
})

describe('ScriptedServiceJobRecipeSchema (the stand owner’s job)', () => {
  const baseRecipe = {
    jobId: 'test-job',
    carId: 'test-car',
    modelId: 'test-model',
    year: 1996,
    mileageKm: 90_000,
    color: 'white',
    provenanceNote: 'one-owner, garage kept',
    customerName: 'Mr. Tanaka',
    description: 'Van will not start.',
    appearsOnDay: 5,
    baseBand: 'fine' as const,
    partOverrides: [{ carPartId: 'ignitionEcu' as const, band: 'worn' as const }],
    tasks: [baseTask],
    baseReputation: 4,
    deadlineDays: 5,
    offerLifetimeDays: 10,
    marginRoll: 1.25,
    unlocksSellingChannel: 'freeAdsPaper' as const,
  }

  it('accepts a well-formed recipe', () => {
    expect(ScriptedServiceJobRecipeSchema.safeParse(baseRecipe).success).toBe(true)
  })

  it.each(['shopFront', 'tradeNetwork'] as const)('refuses %s', (channelId) => {
    expect(
      ScriptedServiceJobRecipeSchema.safeParse({ ...baseRecipe, unlocksSellingChannel: channelId })
        .success,
    ).toBe(false)
  })

  it('the real shipped recipe validates and claims freeAdsPaper', () => {
    expect(ScriptedServiceJobRecipeSchema.safeParse(SCRIPTED_SERVICE_JOB).success).toBe(true)
    expect(SCRIPTED_SERVICE_JOB.unlocksSellingChannel).toBe('freeAdsPaper')
    expect(SCRIPTED_SERVICE_JOB.modelId).toBe('honda-acty-ha4')
  })

  it('every authored task is minToolTier 1 - completable by a day-one shop', () => {
    for (const task of SCRIPTED_SERVICE_JOB.tasks) {
      expect(task.minToolTier).toBe(1)
    }
  })

  describe('symptom/handbackCopy/unlockFacts (sprint210.md task A)', () => {
    it('symptom, handbackCopy and unlockFacts are all absent by default, and an ordinary recipe still validates', () => {
      const result = ScriptedServiceJobRecipeSchema.safeParse(baseRecipe)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.symptom).toBeUndefined()
        expect(result.data.handbackCopy).toBeUndefined()
        expect(result.data.unlockFacts).toBeUndefined()
      }
    })

    it('accepts a well-formed symptom, handbackCopy and unlockFacts', () => {
      const withUnlock = {
        ...baseRecipe,
        symptom: {
          symptomId: 'non-starter',
          trueCauseId: 'flat-battery',
          apparent: [{ carPartId: 'ignitionEcu' as const, band: 'fine' as const }],
        },
        handbackCopy: 'She starts first turn now.',
        unlockFacts: ['The stand is open again.'],
      }
      expect(ScriptedServiceJobRecipeSchema.safeParse(withUnlock).success).toBe(true)
    })

    it('the real shipped recipe carries day-5 arrival, its diagnosis beat, and the unlock copy', () => {
      expect(SCRIPTED_SERVICE_JOB.appearsOnDay).toBe(5)
      expect(SCRIPTED_SERVICE_JOB.customerName).toBe('Mrs. Harada (the newsstand)')
      expect(SCRIPTED_SERVICE_JOB.symptom).toEqual({
        symptomId: 'non-starter',
        trueCauseId: 'flat-battery',
        apparent: [{ carPartId: 'ignitionEcu', band: 'fine' }],
      })
      expect(SCRIPTED_SERVICE_JOB.handbackCopy).toBeTruthy()
      expect(SCRIPTED_SERVICE_JOB.unlockFacts).toHaveLength(3)
    })
  })
})
