import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type Symptom,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { bandIndex } from '../src/bands'
import { buildSimContext } from '../src/context'
import { verifyAndResolve, verifyManyAndResolve } from '../src/diagnosis'
import {
  buyerKnowledgeViewOf,
  defaultVerifiedSlots,
  fullyVerifiedCar,
  isSlotVerified,
  knowledgeViewOf,
  priorBand,
  seedVerifiedSlots,
  verifySlot,
} from '../src/knowledge'
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'

/** Four causes on four different real parts, all still live - lets a
 * verification event be exercised against a part that IS the true cause
 * (collapse) and one that is NOT (elimination-without-collapse, since two
 * other candidates stay standing). */
const FOUR_CAUSE_SYMPTOM: Symptom = {
  id: 'knowledge-four-cause-symptom',
  cardLine: 'Four cause knowledge test symptom.',
  causes: [
    { id: 'kc-headValvetrain', carPartId: 'headValvetrain', setBand: 'poor', weight: 25 },
    { id: 'kc-internals', carPartId: 'internals', setBand: 'poor', weight: 25 },
    { id: 'kc-intake', carPartId: 'intake', setBand: 'poor', weight: 25 },
    { id: 'kc-exhaust', carPartId: 'exhaust', setBand: 'poor', weight: 25 },
  ],
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
  [FOUR_CAUSE_SYMPTOM],
)

const MODEL = CARS[0]!
const FITMENT_CLASS = fitmentClassForTier(MODEL.tier)

describe('defaultVerifiedSlots / seedVerifiedSlots / fullyVerifiedCar (task A1)', () => {
  it('is exactly every surface-depthClass part plus tyres and rims', () => {
    const surfaceIds = PARTS_TAXONOMY.filter((e) => e.depthClass === 'surface').map((e) => e.id)
    const expected = new Set([...surfaceIds, 'tyres', 'rims'])
    expect(new Set(defaultVerifiedSlots(CONTEXT))).toEqual(expected)
  })

  it('seedVerifiedSlots sets exactly that set on the car, nothing more', () => {
    const car = seedVerifiedSlots(buildCarInstance(), CONTEXT)
    expect(new Set(car.verifiedSlots)).toEqual(new Set(defaultVerifiedSlots(CONTEXT)))
    // Buried/bolt-on parts are NOT seeded verified.
    expect(car.verifiedSlots).not.toContain('internals')
    expect(car.verifiedSlots).not.toContain('headValvetrain')
  })

  it('fullyVerifiedCar verifies every real part (dev grant / tutorial, task A3)', () => {
    const car = fullyVerifiedCar(buildCarInstance())
    expect(new Set(car.verifiedSlots)).toEqual(new Set(ALL_CAR_PART_IDS))
  })
})

describe('isSlotVerified (task A)', () => {
  it('defaults to verified (true) when verifiedSlots is absent - the safe, pre-Sprint-215 default', () => {
    const car = buildCarInstance()
    expect(car.verifiedSlots).toBeUndefined()
    expect(isSlotVerified(car, 'internals')).toBe(true)
  })

  it('reads the seeded set honestly once present', () => {
    const car = seedVerifiedSlots(buildCarInstance(), CONTEXT)
    expect(isSlotVerified(car, 'tyres')).toBe(true)
    expect(isSlotVerified(car, 'internals')).toBe(false)
  })
})

describe('verifySlot (task A/C)', () => {
  it('is idempotent: adding an already-verified slot changes nothing', () => {
    const car = seedVerifiedSlots(buildCarInstance(), CONTEXT)
    const again = verifySlot(car, 'tyres')
    expect(again).toBe(car)
  })

  it('is a safe no-op on a car the knowledge model has not been seeded onto', () => {
    const car = buildCarInstance()
    expect(verifySlot(car, 'internals')).toBe(car)
  })

  it('adds a genuinely new slot to the array', () => {
    const car = seedVerifiedSlots(buildCarInstance(), CONTEXT)
    const verified = verifySlot(car, 'internals')
    expect(verified.verifiedSlots).toContain('internals')
    expect(verified).not.toBe(car)
  })
})

describe('priorBand (task A2)', () => {
  const { mileageFactorCurve } = ECONOMY.valuation

  it('reads mint at low mileage (at/under the first mileageFactorCurve breakpoint)', () => {
    const car = buildCarInstance({ mileageKm: 0 })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('mint')
  })

  it('steps down through fine/worn/poor as mileage climbs the same breakpoints mileageFactorCurve uses', () => {
    const [b0, b1, b2] = mileageFactorCurve.map(([km]) => km)
    expect(priorBand(buildCarInstance({ mileageKm: b0! + 1 }), 'internals', CONTEXT)).toBe('fine')
    expect(priorBand(buildCarInstance({ mileageKm: b1! + 1 }), 'internals', CONTEXT)).toBe('worn')
    expect(priorBand(buildCarInstance({ mileageKm: b2! + 1 }), 'internals', CONTEXT)).toBe('poor')
  })

  it('never guesses beyond the ends of the curve (flat past the last breakpoint)', () => {
    const car = buildCarInstance({ mileageKm: 10_000_000 })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('poor')
  })

  it('is the same guess for every slot on the same car (no per-slot term yet)', () => {
    const car = buildCarInstance({ mileageKm: 90_000 })
    expect(priorBand(car, 'internals', CONTEXT)).toBe(priorBand(car, 'exhaust', CONTEXT))
  })

  it('a garaged history nudges the guess one band toward mint', () => {
    const plain = buildCarInstance({ mileageKm: 90_000 })
    const garaged = buildCarInstance({ mileageKm: 90_000, damagePattern: 'garaged' })
    expect(priorBand(plain, 'internals', CONTEXT)).toBe('worn')
    expect(priorBand(garaged, 'internals', CONTEXT)).toBe('fine')
  })

  it('a neglected-commuter history nudges the guess one band toward poor', () => {
    const neglected = buildCarInstance({ mileageKm: 90_000, damagePattern: 'neglected-commuter' })
    expect(priorBand(neglected, 'internals', CONTEXT)).toBe('poor')
  })

  it('clamps at mint - a garaged, near-new car never guesses "better than mint"', () => {
    const car = buildCarInstance({ mileageKm: 0, damagePattern: 'garaged' })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('mint')
  })

  it('clamps at poor - the guess is never as bad as scrap', () => {
    const car = buildCarInstance({ mileageKm: 10_000_000, damagePattern: 'frontal-collision' })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('poor')
  })

  it('no rolled history applies no modifier', () => {
    const car = buildCarInstance({ mileageKm: 90_000 })
    expect(car.damagePattern).toBeUndefined()
    expect(priorBand(car, 'internals', CONTEXT)).toBe('worn')
  })
})

describe('priorBand evidence term (sprint219.md task A)', () => {
  it('no verified slots at all leaves the pure mileage read untouched', () => {
    const car = buildCarInstance({ mileageKm: 90_000 })
    expect(car.verifiedSlots).toBeUndefined()
    expect(priorBand(car, 'internals', CONTEXT)).toBe('worn')
  })

  it('an empty verifiedSlots array is the same as no evidence', () => {
    const car = buildCarInstance({ mileageKm: 90_000, verifiedSlots: [] })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('worn')
  })

  it('a single clean verified slot lifts the guess one band toward mint', () => {
    // tyres defaults to mint via mintCarParts; mileage alone reads 'worn' at
    // 90,000 km.
    const car = buildCarInstance({ mileageKm: 90_000, verifiedSlots: ['tyres'] })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('fine')
  })

  it('a single rough verified slot pulls the guess one band toward poor', () => {
    const car = buildCarInstance({
      mileageKm: 90_000,
      parts: mintCarParts({ tyres: 'poor' }),
      verifiedSlots: ['tyres'],
    })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('poor')
  })

  it('never moves the guess more than one band step, however wide the verified spread', () => {
    // Every verified slot mint against a mileage prior that already reads
    // the worst band (poor): an unclamped average would want +3.
    const car = buildCarInstance({ mileageKm: 10_000_000, verifiedSlots: ['tyres', 'rims'] })
    expect(bandIndex(priorBand(car, 'internals', CONTEXT))).toBe(bandIndex('poor') + 1)
  })

  it('verifying more slots sharpens the remaining guess, re-read fresh from car.verifiedSlots each call', () => {
    // One clean verified slot against a 'worn' mileage prior lifts the
    // guess; verifying two more, genuinely rough, slots pulls the average
    // (and so the guess) back down without touching internals itself.
    const base = buildCarInstance({
      mileageKm: 90_000,
      parts: mintCarParts({ headValvetrain: 'poor', intake: 'poor' }),
      verifiedSlots: ['tyres'],
    })
    expect(priorBand(base, 'internals', CONTEXT)).toBe('fine')

    const sharpened = verifySlot(verifySlot(base, 'headValvetrain'), 'intake')
    expect(priorBand(sharpened, 'internals', CONTEXT)).toBe('worn')
  })

  it('a verified slot with nothing installed contributes no evidence', () => {
    const car = buildCarInstance({
      mileageKm: 90_000,
      parts: mintCarParts({ tyres: null }),
      verifiedSlots: ['tyres'],
    })
    expect(priorBand(car, 'internals', CONTEXT)).toBe('worn')
  })
})

describe('knowledgeViewOf (task B)', () => {
  it('is a no-op when the knowledge model has not been seeded onto the car', () => {
    const car = buildCarInstance({ parts: mintCarParts({ internals: 'poor' }) })
    expect(car.verifiedSlots).toBeUndefined()
    expect(knowledgeViewOf(car, MODEL, CONTEXT)).toBe(car)
  })

  it('masks an unverified slot to priorBand, never the truth', () => {
    const car = seedVerifiedSlots(
      buildCarInstance({ mileageKm: 90_000, parts: mintCarParts({ internals: 'poor' }) }),
      CONTEXT,
    )
    expect(isSlotVerified(car, 'internals')).toBe(false)
    const view = knowledgeViewOf(car, MODEL, CONTEXT)
    // Mileage alone reads 'worn' at 90,000 km; every born-verified slot here
    // (seedVerifiedSlots' default set) is mint, so the evidence term (sprint219)
    // lifts the guess a band to 'fine'.
    expect(view.parts.internals.installed!.band).toBe('fine')
    expect(view.parts.internals.installed!.band).not.toBe('poor') // never the truth
  })

  it('masks an unverified slot back to the stock SKU (task E: hides a hidden non-stock identity too)', () => {
    const nonStockPart = PARTS.find((p) => p.carPartId === 'internals' && p.grade !== 'stock')!
    const stockPart = CONTEXT.stockPartByCarPartId[FITMENT_CLASS].internals!
    const car = seedVerifiedSlots(
      buildCarInstance({
        parts: mintCarParts({
          internals: {
            id: 'hidden-1',
            partId: nonStockPart.id,
            band: 'mint',
            origin: { kind: 'market', day: 0 },
          },
        }),
      }),
      CONTEXT,
    )
    const view = knowledgeViewOf(car, MODEL, CONTEXT)
    expect(view.parts.internals.installed!.partId).toBe(stockPart.id)
    expect(view.parts.internals.installed!.partId).not.toBe(nonStockPart.id)
  })

  it('leaves a verified slot showing the truth', () => {
    const car = fullyVerifiedCar(
      buildCarInstance({ mileageKm: 90_000, parts: mintCarParts({ internals: 'poor' }) }),
    )
    const view = knowledgeViewOf(car, MODEL, CONTEXT)
    expect(view.parts.internals.installed!.band).toBe('poor')
  })

  it('leaves a genuinely empty slot empty - absence is visible by eye, not a knowledge question', () => {
    const car = seedVerifiedSlots(
      buildCarInstance({ parts: mintCarParts({ internals: null }) }),
      CONTEXT,
    )
    const view = knowledgeViewOf(car, MODEL, CONTEXT)
    expect(view.parts.internals.installed).toBeNull()
  })
})

describe('buyerKnowledgeViewOf (sprint217.md task A)', () => {
  it('is a no-op when the knowledge model has not been seeded onto the car', () => {
    const car = buildCarInstance({ parts: mintCarParts({ internals: 'poor' }) })
    expect(car.verifiedSlots).toBeUndefined()
    expect(buyerKnowledgeViewOf(car, MODEL, CONTEXT)).toBe(car)
  })

  it('masks an unverified slot to priorBand marked down by the tier haircut - never the truth', () => {
    const car = seedVerifiedSlots(
      buildCarInstance({ mileageKm: 90_000, parts: mintCarParts({ internals: 'poor' }) }),
      CONTEXT,
    )
    const guess = priorBand(car, 'internals', CONTEXT)
    const haircut = ECONOMY.knowledgePriors.unverifiedHaircutByTier[FITMENT_CLASS]
    const expectedIndex = Math.max(bandIndex('poor'), bandIndex(guess) - haircut)
    const view = buyerKnowledgeViewOf(car, MODEL, CONTEXT)
    expect(bandIndex(view.parts.internals.installed!.band)).toBe(expectedIndex)
    expect(view.parts.internals.installed!.band).not.toBe('poor') // never the truth
  })

  it('never marks a guess down past poor - the haircut floors exactly where priorBand already does', () => {
    // Every slot (including the born-verified ones) at 'poor', so the
    // evidence term reads no gap against the equally-poor mileage prior and
    // adds nothing - the floor case, isolated from the evidence term.
    const car = seedVerifiedSlots(
      buildCarInstance({ mileageKm: 10_000_000, parts: uniformCarParts('poor') }),
      CONTEXT,
    )
    expect(priorBand(car, 'internals', CONTEXT)).toBe('poor')
    const view = buyerKnowledgeViewOf(car, MODEL, CONTEXT)
    expect(view.parts.internals.installed!.band).toBe('poor')
  })

  it('leaves a VERIFIED slot at true band even when it is worse than the guess - honesty prices at true value, no extra discount on top', () => {
    const car = fullyVerifiedCar(
      buildCarInstance({ mileageKm: 90_000, parts: mintCarParts({ internals: 'poor' }) }),
    )
    const view = buyerKnowledgeViewOf(car, MODEL, CONTEXT)
    expect(view.parts.internals.installed!.band).toBe('poor')
  })

  it('never leaks a band through part identity either - masks back to the stock SKU exactly like knowledgeViewOf', () => {
    const nonStockPart = PARTS.find((p) => p.carPartId === 'internals' && p.grade !== 'stock')!
    const stockPart = CONTEXT.stockPartByCarPartId[FITMENT_CLASS].internals!
    const car = seedVerifiedSlots(
      buildCarInstance({
        parts: mintCarParts({
          internals: {
            id: 'hidden-buyer-1',
            partId: nonStockPart.id,
            band: 'mint',
            origin: { kind: 'market', day: 0 },
          },
        }),
      }),
      CONTEXT,
    )
    const view = buyerKnowledgeViewOf(car, MODEL, CONTEXT)
    expect(view.parts.internals.installed!.partId).toBe(stockPart.id)
    expect(view.parts.internals.installed!.partId).not.toBe(nonStockPart.id)
  })
})

describe('verifyAndResolve (tasks C1-C3, D): the one verification+resolution function', () => {
  function carWithSymptom(trueCauseId: string): CarInstance {
    return seedVerifiedSlots(
      buildCarInstance({
        symptoms: [
          {
            symptomId: FOUR_CAUSE_SYMPTOM.id,
            trueCauseId,
            remainingCauseIds: FOUR_CAUSE_SYMPTOM.causes.map((c) => c.id),
            runTestIds: [],
            latent: false,
          },
        ],
      }),
      CONTEXT,
    )
  }

  it("collapse: verifying the true cause's own part collapses the symptom to it (the existing verdict idiom)", () => {
    const car = carWithSymptom('kc-internals')
    const result = verifyAndResolve(car, 'internals', CONTEXT)
    expect(result.car.symptoms[0]!.remainingCauseIds).toEqual(['kc-internals'])
    expect(result.revealedCauseId).toBe('kc-internals')
    expect(result.eliminated).toBe(false)
    expect(isSlotVerified(result.car, 'internals')).toBe(true)
  })

  it('elimination without collapse: verifying a part that is NOT the true cause drops just that candidate, no reveal line', () => {
    const car = carWithSymptom('kc-internals')
    const result = verifyAndResolve(car, 'exhaust', CONTEXT)
    expect(result.car.symptoms[0]!.remainingCauseIds).toEqual([
      'kc-headValvetrain',
      'kc-internals',
      'kc-intake',
    ])
    expect(result.revealedCauseId).toBeNull()
    expect(result.eliminated).toBe(true)
    expect(isSlotVerified(result.car, 'exhaust')).toBe(true)
  })

  it("elimination verifies nothing about any OTHER part (design section 1): only the exhaust slot verifies, not the true cause's own internals slot", () => {
    const car = carWithSymptom('kc-internals')
    const result = verifyAndResolve(car, 'exhaust', CONTEXT)
    expect(isSlotVerified(result.car, 'internals')).toBe(false)
    expect(isSlotVerified(result.car, 'headValvetrain')).toBe(false)
    expect(isSlotVerified(result.car, 'intake')).toBe(false)
  })

  it('a slot no symptom targets at all is simply verified, with nothing to resolve', () => {
    const car = carWithSymptom('kc-internals')
    const result = verifyAndResolve(car, 'tyres', CONTEXT)
    expect(result.eliminated).toBe(false)
    expect(result.revealedCauseId).toBeNull()
    expect(isSlotVerified(result.car, 'tyres')).toBe(true)
  })
})

describe('verifyManyAndResolve (task C2: group repairs touch several slots at once)', () => {
  it('folds each slot through in turn, collecting every distinct reveal and elimination', () => {
    const car = seedVerifiedSlots(
      buildCarInstance({
        symptoms: [
          {
            symptomId: FOUR_CAUSE_SYMPTOM.id,
            trueCauseId: 'kc-internals',
            remainingCauseIds: FOUR_CAUSE_SYMPTOM.causes.map((c) => c.id),
            runTestIds: [],
            latent: false,
          },
        ],
      }),
      CONTEXT,
    )
    const result = verifyManyAndResolve(car, ['exhaust', 'internals'], CONTEXT)
    expect(result.revealedCauseIds).toEqual(['kc-internals'])
    expect(result.eliminatedCarPartIds).toEqual(['exhaust'])
    expect(isSlotVerified(result.car, 'exhaust')).toBe(true)
    expect(isSlotVerified(result.car, 'internals')).toBe(true)
    expect(result.car.symptoms[0]!.remainingCauseIds).toEqual(['kc-internals'])
  })
})
