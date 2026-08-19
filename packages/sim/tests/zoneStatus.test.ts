import type { MetalZoneState, TrimZoneState, ZoneStates } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  ALL_ZONE_IDS,
  bodyworkBindingZoneIds,
  isMetalZoneState,
  paintBindingZoneIds,
  planMetalPipelineStage,
  zoneConditionBand,
  zoneNextStep,
} from '../src/bodyPipeline'

/**
 * The zone-status sim helpers: a zone's own condition band (the headline
 * the body view renders) and its single next pipeline stage (the affordance
 * beneath it). Both are pure derivations over one zone's own state - no
 * levers, no capability, no game state.
 */

function metalZone(overrides: Partial<MetalZoneState> = {}): MetalZoneState {
  return { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false, ...overrides }
}

function trimZone(overrides: Partial<TrimZoneState> = {}): TrimZoneState {
  return { finish: 0, panelMissing: false, primed: false, ...overrides }
}

describe('zoneConditionBand', () => {
  it('reads a metal zone off the worse of metal and surface', () => {
    expect(zoneConditionBand(metalZone({ metal: 0, surface: 0 }))).toBe('mint')
    expect(zoneConditionBand(metalZone({ metal: 1, surface: 0 }))).toBe('fine')
    expect(zoneConditionBand(metalZone({ metal: 0, surface: 2 }))).toBe('worn')
    expect(zoneConditionBand(metalZone({ metal: 3, surface: 0 }))).toBe('poor')
    expect(zoneConditionBand(metalZone({ metal: 4, surface: 0 }))).toBe('scrap')
  })

  it('reads a trim zone off finish alone', () => {
    expect(zoneConditionBand(trimZone({ finish: 0 }))).toBe('mint')
    expect(zoneConditionBand(trimZone({ finish: 1 }))).toBe('fine')
    expect(zoneConditionBand(trimZone({ finish: 2 }))).toBe('worn')
    expect(zoneConditionBand(trimZone({ finish: 3 }))).toBe('poor')
  })

  it('reads scrap for a missing panel outright, on either shape, ignoring every other field', () => {
    expect(zoneConditionBand(metalZone({ metal: 0, surface: 0, panelMissing: true }))).toBe('scrap')
    expect(zoneConditionBand(trimZone({ finish: 0, panelMissing: true }))).toBe('scrap')
  })

  it('never reads a metal zone bad off its own finish - that is the paint carrier reading, not the bodywork one', () => {
    expect(zoneConditionBand(metalZone({ metal: 0, surface: 0, finish: 3 }))).toBe('mint')
  })
})

describe('zoneNextStep', () => {
  it('walks the metal ladder: beat below the weldable ceiling, weld exactly at it', () => {
    expect(zoneNextStep(metalZone({ metal: 1 }))).toBe('beat')
    expect(zoneNextStep(metalZone({ metal: 2 }))).toBe('beat')
    expect(zoneNextStep(metalZone({ metal: 3 }))).toBe('weld')
  })

  it('moves to fillAndSand once metal is clear but surface still carries rust', () => {
    expect(zoneNextStep(metalZone({ metal: 0, surface: 1 }))).toBe('fillAndSand')
  })

  it('moves to prime once metal and surface are clear and the zone is bare', () => {
    expect(zoneNextStep(metalZone({ metal: 0, surface: 0, finish: 3, primed: false }))).toBe(
      'prime',
    )
  })

  it('moves to paint once bare and already primed', () => {
    expect(zoneNextStep(metalZone({ metal: 0, surface: 0, finish: 3, primed: true }))).toBe('paint')
  })

  it('moves to polish once faded but not fully bare, on either shape', () => {
    expect(zoneNextStep(metalZone({ metal: 0, surface: 0, finish: 1 }))).toBe('polish')
    expect(zoneNextStep(trimZone({ finish: 2 }))).toBe('polish')
  })

  it('is null once every axis is already at mint', () => {
    expect(zoneNextStep(metalZone())).toBeNull()
    expect(zoneNextStep(trimZone())).toBeNull()
  })

  it('names replace-panel for a missing panel, ahead of every other reading', () => {
    expect(zoneNextStep(metalZone({ metal: 0, panelMissing: true }))).toBe('replace-panel')
    expect(zoneNextStep(trimZone({ panelMissing: true }))).toBe('replace-panel')
  })

  it('names replace-panel for metal beyond the weldable ceiling - beyond repair, not weld', () => {
    expect(zoneNextStep(metalZone({ metal: 4 }))).toBe('replace-panel')
  })

  it('reads prime straight after a fillAndSand application, since the fill just bared the finish', () => {
    const painted = metalZone({ metal: 0, surface: 1, finish: 0, primed: false, colour: 'red' })
    const applied = planMetalPipelineStage('fillAndSand', painted)
    expect(applied.ok).toBe(true)
    if (applied.ok && isMetalZoneState(applied.zone)) {
      expect(zoneNextStep(applied.zone)).toBe('prime')
    }
  })
})

describe('the binding-zone finders', () => {
  function statesWith(overrides: Partial<ZoneStates>): ZoneStates {
    const base = {} as Record<string, MetalZoneState | TrimZoneState>
    for (const zoneId of ALL_ZONE_IDS) {
      base[zoneId] =
        zoneId === 'front-bumper' || zoneId === 'rear-bumper' || zoneId === 'skirts'
          ? trimZone()
          : metalZone()
    }
    return { ...base, ...overrides } as ZoneStates
  }

  it('bodyworkBindingZoneIds names the single worst metal zone', () => {
    const states = statesWith({ bonnet: metalZone({ metal: 2 }) })
    expect(bodyworkBindingZoneIds(states)).toEqual(['bonnet'])
  })

  it('bodyworkBindingZoneIds names every zone tied for worst', () => {
    const states = statesWith({
      bonnet: metalZone({ surface: 1 }),
      boot: metalZone({ metal: 1 }),
    })
    expect(bodyworkBindingZoneIds(states).sort()).toEqual(['boot', 'bonnet'].sort())
  })

  it('bodyworkBindingZoneIds names every zone missing its panel, ahead of the severity reading', () => {
    const states = statesWith({
      bonnet: metalZone({ metal: 4, panelMissing: true }),
      boot: metalZone({ metal: 3 }),
    })
    expect(bodyworkBindingZoneIds(states)).toEqual(['bonnet'])
  })

  it('paintBindingZoneIds names the single worst-finish zone, metal or trim alike', () => {
    const states = statesWith({ skirts: trimZone({ finish: 2 }) })
    expect(paintBindingZoneIds(states)).toEqual(['skirts'])
  })
})
