import type { ConditionBand } from '@midnight-garage/content'

/**
 * Why the bench has no repair rung to offer for the part sitting on it. Only
 * the three permanent cases live here: a part held back by the shop's own tool
 * ceiling is not idle at all, and the ceiling caption
 * (`benchRepairCeilingCaption`) names the machine that lifts it instead.
 */
export type BenchIdleReason = 'scrap' | 'replace-only' | 'mint'

/**
 * The bench's own reading of a part with no next rung, or `null` when there is
 * work left to do. Pure, so the copy that renders it is the only thing a
 * screen has to hold.
 */
export function benchIdleReason(input: {
  band: ConditionBand
  repairable: boolean
}): BenchIdleReason | null {
  if (input.band === 'scrap') return 'scrap'
  if (!input.repairable) return 'replace-only'
  if (input.band === 'mint') return 'mint'
  return null
}
