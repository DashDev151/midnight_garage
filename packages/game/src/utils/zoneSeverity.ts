import type { ZoneState, ZoneStates } from '@midnight-garage/content'
import { isMetalZoneState, unpaintedPanelZoneIds, zoneNeedsPanel } from '@midnight-garage/sim'

/**
 * The three layers a METAL zone's work model carries, worst-last within each:
 * `metal` runs 0-4, `surface` 0-2, `finish` 0-3, and 0 is always the good end.
 * Metal's top rung is the one severity hand work cannot reach: beating and
 * welding stop at 3 and only a fresh panel clears 4.
 *
 * One vocabulary, shared by the workshop views (which draw it as rows of pips)
 * and the car screen's docked action panel (which reads it out as a line), so
 * the two surfaces can never word the same fact differently.
 */
export const METAL_ZONE_LAYERS = [
  { id: 'metal', tag: 'M', label: 'metal', max: 4 },
  { id: 'surface', tag: 'S', label: 'surface', max: 2 },
  { id: 'finish', tag: 'F', label: 'finish', max: 3 },
] as const

/** The one layer a TRIM zone carries: a bumper or a skirt has no metal or
 * surface to show, only the finish its paint is in. */
export const TRIM_ZONE_LAYERS = [{ id: 'finish', tag: 'F', label: 'finish', max: 3 }] as const

/** One layer's descriptor plus the severity `zone` actually reads for it. */
export interface ZoneLayerReading {
  id: 'metal' | 'surface' | 'finish'
  tag: string
  label: string
  max: number
  severity: number
}

/**
 * Every layer reading on `zone`, worst-last: all three on a metal zone,
 * `finish` alone on trim. Resolved here, behind the `isMetalZoneState` narrow,
 * rather than handing a caller the bare descriptor list - a caller holding
 * only a runtime-generic `ZoneState` has no type-level link between which
 * list it got back and which shape `zone` actually is, so the severity lookup
 * has to happen on this side of the narrow.
 */
export function zoneLayerReadings(zone: ZoneState): ZoneLayerReading[] {
  if (isMetalZoneState(zone)) {
    return METAL_ZONE_LAYERS.map((layer) => ({ ...layer, severity: zone[layer.id] }))
  }
  return TRIM_ZONE_LAYERS.map((layer) => ({ ...layer, severity: zone[layer.id] }))
}

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

/** One zone's severities as a plain readout - all three layers on a metal
 * zone, `finish` alone on trim. */
export function zoneSeverityText(zone: ZoneState): string {
  return zoneLayerReadings(zone)
    .map((layer) => `${layer.label} ${layer.severity} of ${layer.max}`)
    .join(', ')
}

/** The panel count spelled out, so the line below reads as prose rather than
 * as a figure. A body carries nine panel zones and no more. */
const PANEL_COUNT_WORDS: readonly string[] = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
]

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
