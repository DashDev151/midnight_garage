import type { ZoneState, ZoneStates } from '@midnight-garage/content'
import { unpaintedPanelZoneIds, zoneNeedsPanel } from '@midnight-garage/sim'

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

/** The panel count spelled out, so the line below reads as prose rather than
 * as a figure. A body carries five panel zones and no more. */
const PANEL_COUNT_WORDS: readonly string[] = ['', 'One', 'Two', 'Three', 'Four', 'Five']

/**
 * The line a car with unpainted panels carries, or `null` when it has none.
 * Fitting a body kit leaves every panel it covers bare, so the paint band
 * drops and takes style and authenticity down with it. Both numbers are
 * right, and both return when the car is painted; without this line the
 * player only sees them fall.
 */
export function unpaintedPanelsText(zoneStates: ZoneStates): string | null {
  const count = unpaintedPanelZoneIds(zoneStates).length
  if (count === 0) return null
  const word = PANEL_COUNT_WORDS[count] || String(count)
  const subject = count === 1 ? `${word} panel is` : `${word} panels are`
  return `${subject} still unpainted. Style and authenticity read low while the car sits like that, and both come back once the paint is on.`
}
