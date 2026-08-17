import type { ZoneState, ZoneStates } from '@midnight-garage/content'
import { PAINT_COLOURS } from '@midnight-garage/content'
import {
  MAX_REPAIRABLE_METAL,
  isMetalZoneState,
  unpaintedPanelZoneIds,
  zoneNeedsPanel,
} from '@midnight-garage/sim'
import { colourTokenDisplayName } from './paintFamilies'

/** The short chip a zone carries when hand work is not the answer, or `null`
 * when it is. An absent panel and one ruined past welding look nothing alike on
 * the car, however identically they price, so they keep separate words. */
export function zoneNeedsPanelTag(zone: ZoneState): string | null {
  if (zone.panelMissing) return 'panel off'
  if (zoneNeedsPanel(zone)) return 'past saving'
  return null
}

/** The finish axis's own maximum (`zone.ts`'s `finish` field runs 0-3) - a
 * zone reading it is fully bare, with nothing on it at all. */
const FINISH_BARE = 3

/**
 * One "why" fact a zone carries, as an icon plus at most two words - the
 * vocabulary the zone panel renders instead of a sentence: `dent`,
 * `rot`, `bare metal`, `primed`, or a colour swatch. `hex` is set only on the
 * colour chip, which paints its own icon rather than using the glyph.
 */
export interface ZoneWhyChip {
  icon: string
  label: string
  hex?: string
}

const DENT_ICON = '◢'
const ROT_ICON = '≈'
const BARE_ICON = '▭'
const PRIMED_ICON = '▤'
const OFF_ICON = '×'
const COLOUR_ICON = '■'

/**
 * Every "why" fact behind a zone's condition, in icon-plus-short-word form -
 * what A2's band colour and A4's next action leave unsaid. A missing panel
 * is the whole story on its own (there is nothing else to read on an empty
 * frame); otherwise a metal zone can carry a dent chip and a rot chip
 * together, and every zone carries exactly one of bare metal / primed /
 * colour, the three mutually exclusive states of its own finish.
 */
export function zoneWhyChips(zone: ZoneState, carUid?: string): ZoneWhyChip[] {
  if (zone.panelMissing) return [{ icon: OFF_ICON, label: 'panel off' }]
  const chips: ZoneWhyChip[] = []
  if (isMetalZoneState(zone) && zone.metal > 0) chips.push({ icon: DENT_ICON, label: 'dent' })
  if (isMetalZoneState(zone) && zone.surface > 0) chips.push({ icon: ROT_ICON, label: 'rot' })
  if (zone.colour) {
    chips.push({
      icon: COLOUR_ICON,
      label: colourTokenDisplayName(zone.colour, carUid),
      hex: PAINT_COLOURS.find((c) => c.id === zone.colour)?.hex,
    })
  } else if (zone.primed) {
    chips.push({ icon: PRIMED_ICON, label: 'primed' })
  } else if (zone.finish >= FINISH_BARE) {
    chips.push({ icon: BARE_ICON, label: 'bare metal' })
  }
  return chips
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
 * Where a zone's FINISH sits, as its own axis separate from the
 * structure/metal band (`zoneConditionBand`, sim): bare metal (never coated,
 * or a fresh panel), prepped (stripped back on purpose - the colour field is
 * stale from before the strip, which is exactly what tells this state apart
 * from bare metal), primed, painted (coated, not yet polished down), or
 * polished (finish at its floor). Checked in this order because the fields
 * are not mutually exclusive in the raw state: `primed` can coexist with a
 * stale `colour` (stripped, then re-primed without a fresh coat yet), and a
 * bare zone can carry a stale `colour` too (stripped, not yet re-primed) -
 * `primed` wins over a lingering colour reading either way, since it is the
 * more recent, more physically true fact.
 */
export type ZoneFinishPosition = 'bare-metal' | 'prepped' | 'primed' | 'painted' | 'polished'

export const ZONE_FINISH_LABELS: Record<ZoneFinishPosition, string> = {
  'bare-metal': 'bare metal',
  prepped: 'prepped',
  primed: 'primed',
  painted: 'painted',
  polished: 'polished',
}

export function zoneFinishPosition(zone: ZoneState): ZoneFinishPosition {
  if (zone.primed) return 'primed'
  if (zone.finish >= FINISH_BARE) return zone.colour ? 'prepped' : 'bare-metal'
  if (zone.finish === 0) return 'polished'
  return 'painted'
}

/**
 * Whether a zone's structure and finish are BOTH fully done - the one
 * condition allowed to read as a plain "Mint" chip with nothing beside it.
 * Everywhere else the structure/metal band and the finish-position tag show
 * together, so a beaten-straight bare panel never reads as though the whole
 * zone were finished.
 */
export function zoneBothDone(band: string, finishPosition: ZoneFinishPosition): boolean {
  return band === 'mint' && finishPosition === 'polished'
}

/**
 * The zone's own remaining-steps checklist, in pipeline order - what
 * `zoneNextStep` (sim) already picks the FIRST of, unrolled into the whole
 * ladder instead of just the next verb. Read straight off the zone's own
 * fields (metal, surface, finish, primed), the same facts `zoneNextStep`
 * itself reads, so the checklist and the single active control can never
 * disagree about what is left.
 */
export function zoneRemainingSteps(zone: ZoneState): string[] {
  if (zone.panelMissing) return ['Fit a panel']
  const steps: string[] = []
  if (isMetalZoneState(zone)) {
    if (zone.metal > 0) steps.push(zone.metal >= MAX_REPAIRABLE_METAL ? 'Weld' : 'Beat')
    if (zone.surface > 0) steps.push('Fill and sand')
  }
  if (zone.finish >= FINISH_BARE) {
    if (!zone.primed) steps.push('Prime')
    steps.push('Paint')
    steps.push('Polish')
  } else if (zone.finish > 0) {
    steps.push('Polish')
  }
  return steps
}

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
