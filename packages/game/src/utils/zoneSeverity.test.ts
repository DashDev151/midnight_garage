import { type ZoneState, type ZoneStates } from '@midnight-garage/content'
import { ALL_ZONE_IDS, PANEL_ZONE_IDS } from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import { unpaintedPanelsText } from './zoneSeverity'

/**
 * The line a car in bare panels carries. Fitting a body kit strips every panel
 * it covers back to unpainted metal, which drops the `paint` band and takes
 * style and authenticity with it until the car is sprayed. The arithmetic is
 * right and the loss is temporary; without a line saying so, the player only
 * sees two numbers fall for no stated reason.
 */

/** A zone in whatever state the test names, sound everywhere else. */
function zone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false, ...overrides }
}

/** A whole car, every zone painted, then `count` panel zones stripped back to
 * bare. `extra` is applied to those same stripped zones. */
function carWithBarePanels(count: number, extra: Partial<ZoneState> = {}): ZoneStates {
  const states = {} as Record<string, ZoneState>
  for (const zoneId of ALL_ZONE_IDS) states[zoneId] = zone({ colour: 'white' })
  for (const zoneId of PANEL_ZONE_IDS.slice(0, count)) {
    states[zoneId] = zone({ finish: 3, ...extra })
  }
  return states as ZoneStates
}

describe('unpaintedPanelsText', () => {
  it('says nothing about a car that is entirely in colour', () => {
    expect(unpaintedPanelsText(carWithBarePanels(0))).toBeNull()
  })

  it('counts one bare panel in the singular, and names what it costs', () => {
    const line = unpaintedPanelsText(carWithBarePanels(1))
    expect(line).toBe(
      'One panel is still unpainted. Style and authenticity read low while the car sits like that, and both come back once the paint is on.',
    )
  })

  it('spells the count out for the whole body, which is nine panels', () => {
    expect(unpaintedPanelsText(carWithBarePanels(3))).toContain('Three panels are still unpainted.')
    expect(unpaintedPanelsText(carWithBarePanels(9))).toContain('Nine panels are still unpainted.')
  })

  it('still counts a zone that has been primed, since primer is not paint', () => {
    expect(unpaintedPanelsText(carWithBarePanels(2, { primed: true }))).toContain(
      'Two panels are still unpainted.',
    )
  })

  /** A panel that is off the car has its own words elsewhere, and telling the
   * player to paint a hole in the wing would be the wrong instruction. */
  it('says nothing about a zone with no panel on it at all', () => {
    expect(unpaintedPanelsText(carWithBarePanels(2, { panelMissing: true }))).toBeNull()
  })
})
