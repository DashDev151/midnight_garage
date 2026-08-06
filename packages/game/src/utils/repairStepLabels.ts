import type { ConditionBand } from '@midnight-garage/content'
import { formatYen } from './formatYen'

/**
 * A repair rung's own inline text - `Repair to fine · ¥9,600 · 20 labour`.
 * The price and the labour are part of the control's own words, never
 * hover-only, and every room that offers a rung words it identically.
 */
export function repairStepText(step: {
  targetBand: ConditionBand
  costYen: number
  laborSlotsRequired: number
}): string {
  return `Repair to ${step.targetBand} · ${formatYen(step.costYen)} · ${step.laborSlotsRequired} labour`
}
