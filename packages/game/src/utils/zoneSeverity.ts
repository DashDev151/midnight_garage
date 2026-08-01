import type { ZoneState } from '@midnight-garage/content'
import { zoneNeedsPanel } from '@midnight-garage/sim'

/**
 * The three layers of a body zone's work model, worst-last within each:
 * `metal` runs 0-4, `surface` 0-2, `finish` 0-3, and 0 is always the good end.
 * Metal's top rung is the one severity hand work cannot reach: beating and
 * welding stop at 3 and only a fresh panel clears 4.
 *
 * One vocabulary, shared by the workshop views (which draw it as rows of pips)
 * and the car screen's docked action panel (which reads it out as a line), so
 * the two surfaces can never word the same fact differently.
 */
export const ZONE_LAYERS = [
  { id: 'metal', tag: 'M', label: 'metal', max: 4 },
  { id: 'surface', tag: 'S', label: 'surface', max: 2 },
  { id: 'finish', tag: 'F', label: 'finish', max: 3 },
] as const

/** The short chip a zone carries when hand work is not the answer, or `null`
 * when it is. An absent panel and one ruined past welding look nothing alike on
 * the car, however identically they price, so they keep separate words. */
export function zoneNeedsPanelTag(zone: ZoneState): string | null {
  if (zone.panelMissing) return 'panel off'
  if (zoneNeedsPanel(zone)) return 'past saving'
  return null
}

/** The same fact as a full line for the docked action panel, naming the
 * remedy: nothing on the stage list will move this zone, and a panel will. */
export function zoneNeedsPanelText(zone: ZoneState): string | null {
  if (zone.panelMissing) return 'Panel is off the car. Fit a replacement.'
  if (zoneNeedsPanel(zone)) {
    return 'Panel is past saving. Beating and welding will not pull it back: fit a replacement.'
  }
  return null
}

/** One zone's three severities as a plain readout. */
export function zoneSeverityText(zone: ZoneState): string {
  return ZONE_LAYERS.map((layer) => `${layer.label} ${zone[layer.id]} of ${layer.max}`).join(', ')
}
