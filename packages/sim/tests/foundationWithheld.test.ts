import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type ConditionBand,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { foundationWithheldYen, marketValueYen } from '../src/marketValue'
import { carWithGrades } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

/** The same car with its tyres - one of law 5's foundational parts - at
 * `band`, and nothing else about it touched. */
function withTyreBand(car: CarInstance, band: ConditionBand): CarInstance {
  const tyres = car.parts.tyres.installed!
  return { ...car, parts: { ...car.parts, tyres: { installed: { ...tyres, band } } } }
}

function valueYen(car: CarInstance, modelId: string): number {
  return marketValueYen(
    CONTEXT.modelsById[modelId]!,
    car,
    100,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy,
  )
}

/**
 * The one law the foundation warning exists for: the yen it quotes is the yen
 * the price itself is missing. Proven against `marketValueYen` rather than
 * against the term's own arithmetic, on `valueLedger.test.ts`'s model - a
 * figure the player is shown has to be measured against the price they will
 * actually be paid.
 *
 * The measurement needs a control, because fixing a foundational part moves
 * the price twice: the repair is worth its own restoration value on ANY car,
 * and on a modified car it ALSO releases the premium law 5 was withholding.
 * The stock control isolates the second. Race springs are what the modified
 * car carries, deliberately: they hold a real catalogue price but no power
 * gain and no support specification, so the modified car and the control
 * share a support verdict, a coherence factor and a restoration bill exactly,
 * and the premium is the only thing that differs between them.
 */
describe('foundationWithheldYen is the yen a sound foundation puts back into marketValueYen', () => {
  it.each(CARS.map((model) => [model.id] as const))(
    '%s: the quoted figure is what fixing the foundation is worth beyond the repair itself',
    (modelId) => {
      const model = CONTEXT.modelsById[modelId]!
      const modified = carWithGrades(model, CONTEXT, { springs: 'race' }, 'mint')
      const control = carWithGrades(model, CONTEXT, {}, 'mint')

      // 'poor' fails law 5's foundation test; 'worn' is the first sound band.
      const failing = withTyreBand(modified, 'poor')
      const sound = withTyreBand(modified, 'worn')
      const withheldYen = foundationWithheldYen(model, failing, CONTEXT.partsById, CONTEXT.economy)

      const gainOnModified = valueYen(sound, modelId) - valueYen(failing, modelId)
      const gainOnControl =
        valueYen(withTyreBand(control, 'worn'), modelId) -
        valueYen(withTyreBand(control, 'poor'), modelId)
      expect(withheldYen).toBe(gainOnModified - gainOnControl)
      expect(withheldYen).toBeGreaterThan(0)
    },
  )

  it.each(CARS.map((model) => [model.id] as const))(
    '%s: nothing is withheld from a sound foundation, or from a car carrying no premium',
    (modelId) => {
      const model = CONTEXT.modelsById[modelId]!
      const modified = carWithGrades(model, CONTEXT, { springs: 'race' }, 'mint')
      const control = carWithGrades(model, CONTEXT, {}, 'mint')
      expect(
        foundationWithheldYen(
          model,
          withTyreBand(modified, 'worn'),
          CONTEXT.partsById,
          CONTEXT.economy,
        ),
      ).toBe(0)
      expect(
        foundationWithheldYen(
          model,
          withTyreBand(control, 'poor'),
          CONTEXT.partsById,
          CONTEXT.economy,
        ),
      ).toBe(0)
    },
  )
})
