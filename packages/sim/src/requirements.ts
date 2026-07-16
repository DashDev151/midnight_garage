import type { CarInstance, CarLedger, RequirementSpec } from '@midnight-garage/content'
import { bandIndex } from './bands'
import { gradeAtLeast } from './parts'
import type { SimContext } from './context'

/**
 * Sprint 72 (outcome-based service jobs, the shared module story missions
 * consume too - Sprint 76): the result of checking one `RequirementSpec`
 * against a car right now. `label`/`actual`/`required` are plain, catalog-
 * display-name-backed strings (never a raw id) so a caller can show them
 * directly, without a second lookup pass.
 */
export interface RequirementResult {
  pass: boolean
  label: string
  actual: string
  required: string
}

/**
 * The one evaluator every requirement kind runs through. Pure and total over
 * `RequirementSpec` - a future primitive (Sprint 76's lap-time ceiling, taste
 * match, budget cap, deadline) adds its own branch here, never a parallel
 * evaluator. `ledger`/`day` are unused by `slotCondition` (this sprint's only
 * primitive) but are part of the shared signature every future primitive
 * needs, so evaluators are never keyed only on `car`.
 */
export function evaluateRequirement(
  spec: RequirementSpec,
  car: CarInstance,
  ledger: CarLedger,
  day: number,
  context: SimContext,
): RequirementResult {
  void ledger
  void day
  const entry = context.partsTaxonomyById[spec.carPartId]
  const displayName = entry?.displayName ?? spec.carPartId
  const installed = car.parts[spec.carPartId].installed

  const required = spec.minGrade
    ? `${spec.minGrade}+ grade, ${spec.minBand}+ condition`
    : `${spec.minBand}+ condition`
  const label = spec.minGrade
    ? `${displayName}: ${spec.minGrade} or better, fitted and ${spec.minBand}`
    : `${displayName} must be ${spec.minBand}`

  // Decision 1: an empty or scrap-band slot always fails, regardless of
  // minGrade - closes the old "or empty" hole (`isServiceTaskDone`'s former
  // `if (!installed) return true` for a repair task).
  if (!installed || installed.band === 'scrap') {
    return { pass: false, label, actual: installed ? 'scrap' : 'empty', required }
  }

  const part = context.partsById[installed.partId]
  const actual = part ? `${installed.band} (${part.grade})` : installed.band
  const bandOk = bandIndex(installed.band) >= bandIndex(spec.minBand)
  const gradeOk = !spec.minGrade || (!!part && gradeAtLeast(part.grade, spec.minGrade))
  return { pass: bandOk && gradeOk, label, actual, required }
}
