import type { ZoneState } from '@midnight-garage/content'

/**
 * The three layers of a body zone's work model, worst-last within each:
 * `metal` runs 0-3, `surface` 0-2, `finish` 0-3, and 0 is always the good end.
 *
 * One vocabulary, shared by the workshop views (which draw it as rows of pips)
 * and the car screen's docked action panel (which reads it out as a line), so
 * the two surfaces can never word the same fact differently.
 */
export const ZONE_LAYERS = [
  { id: 'metal', tag: 'M', label: 'metal', max: 3 },
  { id: 'surface', tag: 'S', label: 'surface', max: 2 },
  { id: 'finish', tag: 'F', label: 'finish', max: 3 },
] as const

/** One zone's three severities as a plain readout. */
export function zoneSeverityText(zone: ZoneState): string {
  return ZONE_LAYERS.map((layer) => `${layer.label} ${zone[layer.id]} of ${layer.max}`).join(', ')
}
