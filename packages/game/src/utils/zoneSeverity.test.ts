import { type ZoneState, type ZoneStates } from '@midnight-garage/content'
import { ALL_ZONE_IDS, PANEL_ZONE_IDS } from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import {
  finishConditionText,
  metalConditionText,
  paintStateText,
  surfaceConditionText,
  unpaintedPanelsText,
} from './zoneSeverity'

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

/**
 * The car screen's per-zone condition panel reads these four functions
 * directly - plain words only, never a raw severity number or a part
 * condition band (poor/worn/fine/mint mean something different on a zone).
 */
describe('the plain-word zone condition readouts', () => {
  it('metalConditionText walks the ladder from straight to needing a fresh panel, and is null on a trim zone', () => {
    expect(metalConditionText(zone({ metal: 0 }))).toBe('straight')
    expect(metalConditionText(zone({ metal: 4 }))).toBe(
      'beyond straightening - needs a fresh panel',
    )
    const trim: ZoneState = { finish: 0, panelMissing: false, primed: false }
    expect(metalConditionText(trim)).toBeNull()
  })

  it('surfaceConditionText walks clean to rusted through, and is null on a trim zone', () => {
    expect(surfaceConditionText(zone({ surface: 0 }))).toBe('clean')
    expect(surfaceConditionText(zone({ surface: 2 }))).toBe('rusted through')
    const trim: ZoneState = { finish: 0, panelMissing: false, primed: false }
    expect(surfaceConditionText(trim)).toBeNull()
  })

  it('finishConditionText walks flawless to bare metal, on every zone shape', () => {
    expect(finishConditionText(zone({ finish: 0 }))).toBe('flawless')
    expect(finishConditionText(zone({ finish: 3 }))).toBe('bare metal, no finish left')
    const trim: ZoneState = { finish: 1, panelMissing: false, primed: false }
    expect(finishConditionText(trim)).toBe('faded')
  })

  it('paintStateText reads panel-off, colour, primed-no-colour and bare-unpainted as four distinct facts', () => {
    expect(paintStateText(zone({ panelMissing: true }))).toBe('panel is off')
    expect(paintStateText(zone({ colour: 'white' }))).toBe('Plain White')
    expect(paintStateText(zone({ colour: 'red' }))).toBe('Bright Red')
    expect(paintStateText(zone({ primed: true }))).toBe('primed, no colour yet')
    expect(paintStateText(zone())).toBe('bare metal, unpainted')
  })

  it('paintStateText is exactly what would have caught the refit-paint bug: a bare panel reads bare, not silently blended in', () => {
    // A panel taken off and refitted UNCHANGED keeps its finish/colour - this
    // is the "before" case the bug produced instead (a bought or repaired
    // panel legitimately comes back bare, and must read that way).
    const refittedUnchanged = zone({ finish: 1, colour: 'red' })
    const boughtOrRepaired = zone() // no colour, not primed
    expect(paintStateText(refittedUnchanged)).toBe('Bright Red')
    expect(paintStateText(boughtOrRepaired)).toBe('bare metal, unpainted')
    expect(paintStateText(refittedUnchanged)).not.toBe(paintStateText(boughtOrRepaired))
  })
})
