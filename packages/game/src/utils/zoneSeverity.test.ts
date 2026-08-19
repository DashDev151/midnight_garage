import { type ZoneState, type ZoneStates } from '@midnight-garage/content'
import { ALL_ZONE_IDS, PANEL_ZONE_IDS, zoneNextStep } from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import {
  type PipelineStepId,
  type ZonePipelineStep,
  unpaintedPanelsText,
  zonePipelineSteps,
  zoneStatusRows,
  zoneWhyChips,
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
 * The car screen's per-zone "why" row reads this
 * directly - icons and at most two words each, never a raw severity number
 * or a sentence.
 */
describe('zoneWhyChips', () => {
  it('reads a missing panel as the whole story, on its own', () => {
    expect(zoneWhyChips(zone({ panelMissing: true, metal: 2, colour: 'red' }))).toEqual([
      { icon: '×', label: 'panel off' },
    ])
  })

  it('carries a dent chip and a rot chip together on a metal zone, and neither on a trim zone', () => {
    const dented = zone({ metal: 2, surface: 1 })
    expect(zoneWhyChips(dented)).toEqual(
      expect.arrayContaining([
        { icon: '◢', label: 'dent' },
        { icon: '≈', label: 'rot' },
      ]),
    )
    const trim: ZoneState = { finish: 2, panelMissing: false, primed: false }
    expect(zoneWhyChips(trim).map((c) => c.label)).not.toContain('dent')
    expect(zoneWhyChips(trim).map((c) => c.label)).not.toContain('rot')
  })

  it('reads the finish state as exactly one of bare metal, primed or a colour swatch', () => {
    expect(zoneWhyChips(zone({ finish: 3 }))).toEqual([{ icon: '▭', label: 'bare metal' }])
    expect(zoneWhyChips(zone({ primed: true }))).toEqual([{ icon: '▤', label: 'primed' }])
    const painted = zoneWhyChips(zone({ colour: 'white' }))
    expect(painted).toHaveLength(1)
    expect(painted[0]!.label).toBe('Plain White')
    expect(painted[0]!.hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is exactly what would have caught the refit-paint bug: a bare panel reads bare, not silently blended in', () => {
    // A panel taken off and refitted UNCHANGED keeps its finish/colour - this
    // is the "before" case the bug produced instead (a bought or repaired
    // panel legitimately comes back bare, and must read that way).
    const refittedUnchanged = zone({ finish: 1, colour: 'red' })
    const boughtOrRepaired = zone() // no colour, not primed, not bare
    expect(zoneWhyChips(refittedUnchanged).map((c) => c.label)).toEqual(['Bright Red'])
    expect(zoneWhyChips(boughtOrRepaired)).toEqual([])
    const freshBarePanel = zone({ finish: 3 })
    expect(zoneWhyChips(freshBarePanel)).toEqual([{ icon: '▭', label: 'bare metal' }])
  })
})

/** A trim zone in whatever state the test names - no `metal`/`surface` at
 * all, matching the real content schema (`TrimZoneStateSchema`). */
function trimZone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { finish: 3, panelMissing: false, primed: false, ...overrides }
}

/** The five pipeline steps, keyed by id, for one call - every assertion below
 * reads a named step out of this rather than indexing the array, so a test
 * never depends on the steps' own order (already covered separately). */
function stepMap(zoneState: ZoneState, isMetal: boolean): Record<PipelineStepId, ZonePipelineStep> {
  const result = zonePipelineSteps(zoneState, isMetal)
  return Object.fromEntries(result.steps.map((step) => [step.id, step])) as Record<
    PipelineStepId,
    ZonePipelineStep
  >
}

describe('zonePipelineSteps', () => {
  const STEP_IDS: PipelineStepId[] = ['beatWeld', 'fillAndSand', 'prime', 'paint', 'polish']

  it('always returns the same five steps, in the same order', () => {
    expect(zonePipelineSteps(zone(), true).steps.map((s) => s.id)).toEqual(STEP_IDS)
    expect(zonePipelineSteps(zone({ metal: 4 }), true).steps.map((s) => s.id)).toEqual(STEP_IDS)
    expect(zonePipelineSteps(trimZone(), false).steps.map((s) => s.id)).toEqual(STEP_IDS)
  })

  describe('metal zone step state table (sprint220.md)', () => {
    it('beatWeld: done, straight, at metal 0', () => {
      expect(stepMap(zone({ metal: 0 }), true).beatWeld).toMatchObject({
        label: 'Beat',
        state: 'done',
        doneLabel: 'Straight',
        stage: 'beat',
      })
    })

    it('beatWeld: next, labelled Beat, at metal 1-2', () => {
      for (const metal of [1, 2]) {
        expect(stepMap(zone({ metal }), true).beatWeld).toMatchObject({
          label: 'Beat',
          state: 'next',
          stage: 'beat',
        })
      }
    })

    it('beatWeld: next, labelled Weld, at metal 3, and never locked', () => {
      expect(stepMap(zone({ metal: 3 }), true).beatWeld).toMatchObject({
        label: 'Weld',
        state: 'next',
        stage: 'weld',
      })
    })

    it('fillAndSand: done when surface is clear', () => {
      expect(stepMap(zone({ metal: 0, surface: 0 }), true).fillAndSand.state).toBe('done')
    })

    it('fillAndSand: next once the metalwork is clear and surface remains', () => {
      expect(stepMap(zone({ metal: 0, surface: 1 }), true).fillAndSand.state).toBe('next')
    })

    it('fillAndSand: locked, after the metalwork, while metal remains', () => {
      expect(stepMap(zone({ metal: 2, surface: 1 }), true).fillAndSand).toMatchObject({
        state: 'locked',
        lockedCaption: 'After the metalwork',
      })
    })

    it('prime: next once straight, filled and bare', () => {
      expect(
        stepMap(zone({ metal: 0, surface: 0, finish: 3, primed: false }), true).prime.state,
      ).toBe('next')
    })

    it('prime: locked, after fill and sand, while metal or surface remain', () => {
      expect(
        stepMap(zone({ metal: 1, surface: 0, finish: 3, primed: false }), true).prime,
      ).toMatchObject({ state: 'locked', lockedCaption: 'After fill and sand' })
      expect(
        stepMap(zone({ metal: 0, surface: 1, finish: 3, primed: false }), true).prime,
      ).toMatchObject({ state: 'locked', lockedCaption: 'After fill and sand' })
    })

    it('prime: done, primed, once primed but still bare', () => {
      expect(
        stepMap(zone({ metal: 0, surface: 0, finish: 3, primed: true }), true).prime,
      ).toMatchObject({ state: 'done', doneLabel: 'Primed' })
    })

    it('prime: done, sealed under paint, once a colour is on', () => {
      expect(stepMap(zone({ finish: 1, colour: 'white' }), true).prime).toMatchObject({
        state: 'done',
        doneLabel: 'Sealed under paint',
      })
    })

    it('paint: next once primed', () => {
      expect(
        stepMap(zone({ metal: 0, surface: 0, finish: 3, primed: true }), true).paint.state,
      ).toBe('next')
    })

    it('paint: locked, after primer, while unprimed and bare', () => {
      expect(
        stepMap(zone({ metal: 0, surface: 0, finish: 3, primed: false }), true).paint,
      ).toMatchObject({ state: 'locked', lockedCaption: 'After primer' })
    })

    it('paint: done once any coat is on, whatever its own finish', () => {
      for (const finish of [0, 1, 2]) {
        expect(stepMap(zone({ finish, colour: 'white' }), true).paint.state).toBe('done')
      }
    })

    it('polish: next while the coat is dull or fresh', () => {
      for (const finish of [1, 2]) {
        expect(stepMap(zone({ finish, colour: 'white' }), true).polish.state).toBe('next')
      }
    })

    it('polish: locked, after paint, while bare', () => {
      expect(stepMap(zone({ finish: 3 }), true).polish).toMatchObject({
        state: 'locked',
        lockedCaption: 'After paint',
      })
    })

    it('polish: done, showroom, at finish 0', () => {
      expect(stepMap(zone({ finish: 0, colour: 'white' }), true).polish).toMatchObject({
        state: 'done',
        doneLabel: 'Showroom',
      })
    })
  })

  describe('trim zones', () => {
    it('beatWeld and fillAndSand read not needed: trim panel, whatever the finish', () => {
      const steps = stepMap(trimZone(), false)
      expect(steps.beatWeld).toMatchObject({ state: 'not-needed', doneLabel: 'Trim panel' })
      expect(steps.fillAndSand).toMatchObject({ state: 'not-needed', doneLabel: 'Trim panel' })
    })

    it('prime, paint and polish progress exactly as they would on a metal zone', () => {
      expect(stepMap(trimZone({ finish: 3, primed: false }), false).prime.state).toBe('next')
      expect(stepMap(trimZone({ finish: 3, primed: true }), false).paint.state).toBe('next')
      expect(stepMap(trimZone({ finish: 2, colour: 'white' }), false).polish.state).toBe('next')
    })
  })

  describe('the global panel lock', () => {
    it('locks every step, naming the missing panel, when the panel is off', () => {
      const result = zonePipelineSteps(zone({ panelMissing: true, metal: 1 }), true)
      expect(result.panelBlocked).toBe(true)
      expect(result.panelBlockedReason).toBe('missing')
      for (const step of result.steps) {
        expect(step.state).toBe('locked')
        expect(step.lockedCaption).toBe('No panel fitted')
      }
      expect(result.stripBack.enabled).toBe(false)
    })

    it('locks every step, naming beyond repair, at metal 4', () => {
      const result = zonePipelineSteps(zone({ metal: 4 }), true)
      expect(result.panelBlocked).toBe(true)
      expect(result.panelBlockedReason).toBe('beyond-repair')
      for (const step of result.steps) {
        expect(step.state).toBe('locked')
        expect(step.lockedCaption).toBe('Beyond repair: needs a replacement panel')
      }
    })

    it('missing wins over beyond repair when both would apply', () => {
      const result = zonePipelineSteps(zone({ panelMissing: true, metal: 4 }), true)
      expect(result.panelBlockedReason).toBe('missing')
    })

    it('a trim zone can never read beyond repair, only missing', () => {
      expect(zonePipelineSteps(trimZone(), false).panelBlocked).toBe(false)
      expect(zonePipelineSteps(trimZone({ panelMissing: true }), false).panelBlockedReason).toBe(
        'missing',
      )
    })
  })

  describe('stripBack', () => {
    it('is enabled once primed', () => {
      expect(zonePipelineSteps(zone({ finish: 3, primed: true }), true).stripBack.enabled).toBe(
        true,
      )
    })

    it('is enabled once any coat is on', () => {
      expect(zonePipelineSteps(zone({ finish: 1, colour: 'white' }), true).stripBack.enabled).toBe(
        true,
      )
    })

    it('is disabled on a bare, unprimed panel', () => {
      expect(zonePipelineSteps(zone({ finish: 3, primed: false }), true).stripBack.enabled).toBe(
        false,
      )
    })

    it('is disabled while the row is panel-blocked, even primed', () => {
      expect(
        zonePipelineSteps(zone({ panelMissing: true, primed: true, finish: 1 }), true).stripBack
          .enabled,
      ).toBe(false)
    })
  })

  describe('respray state after strip', () => {
    it('reads next: prime on a freshly stripped zone, ignoring the stale colour left behind', () => {
      // stripPrep (sim, planSharedPipelineStage) sets finish back to bare and
      // primed to false but leaves `colour` exactly where it was - a
      // stripped-but-not-yet-reprimed zone must read as bare, not painted.
      const stripped = zone({ metal: 0, surface: 0, finish: 3, primed: false, colour: 'red' })
      const steps = stepMap(stripped, true)
      expect(steps.prime.state).toBe('next')
      expect(steps.paint).toMatchObject({ state: 'locked', lockedCaption: 'After primer' })
    })
  })

  describe('the one-NEXT invariant, cross-checked against zoneNextStep (sim)', () => {
    /** `zoneNextStep`'s answer, folded onto the five-button vocabulary the
     * same way `zonePipelineSteps` itself does, so the two can be compared
     * directly. */
    function expectedNextCount(stage: ReturnType<typeof zoneNextStep>): number {
      return stage === null || stage === 'replace-panel' ? 0 : 1
    }

    it('holds across every metal zone field combination (metal x surface x finish x primed x panelMissing)', () => {
      for (let metal = 0; metal <= 4; metal++) {
        for (let surface = 0; surface <= 2; surface++) {
          for (let finish = 0; finish <= 3; finish++) {
            for (const primed of [false, true]) {
              for (const panelMissing of [false, true]) {
                const candidate: ZoneState = { metal, surface, finish, panelMissing, primed }
                const result = zonePipelineSteps(candidate, true)
                const nextCount = result.steps.filter((s) => s.state === 'next').length
                expect(nextCount).toBeLessThanOrEqual(1)
                if (result.panelBlocked) {
                  expect(nextCount).toBe(0)
                  continue
                }
                expect(nextCount).toBe(expectedNextCount(zoneNextStep(candidate)))
              }
            }
          }
        }
      }
    })

    it('holds across every trim zone field combination (finish x primed x panelMissing)', () => {
      for (let finish = 0; finish <= 3; finish++) {
        for (const primed of [false, true]) {
          for (const panelMissing of [false, true]) {
            const candidate: ZoneState = { finish, panelMissing, primed }
            const result = zonePipelineSteps(candidate, false)
            const nextCount = result.steps.filter((s) => s.state === 'next').length
            expect(nextCount).toBeLessThanOrEqual(1)
            if (result.panelBlocked) {
              expect(nextCount).toBe(0)
              continue
            }
            expect(nextCount).toBe(expectedNextCount(zoneNextStep(candidate)))
          }
        }
      }
    })
  })
})

describe('zoneStatusRows', () => {
  const FACTORY = 'white'

  it('reads missing on all three rows when the panel is off', () => {
    expect(zoneStatusRows(zone({ panelMissing: true }), true, FACTORY)).toEqual({
      metal: 'missing',
      prep: 'missing',
      paint: 'missing',
    })
  })

  it('reads beyond repair on all three rows at metal 4', () => {
    expect(zoneStatusRows(zone({ metal: 4 }), true, FACTORY)).toEqual({
      metal: 'beyond repair',
      prep: 'beyond repair',
      paint: 'beyond repair',
    })
  })

  it('reads the metal row across the full ladder: straight, dented, crumpled', () => {
    expect(zoneStatusRows(zone({ metal: 0 }), true, FACTORY).metal).toBe('straight')
    expect(zoneStatusRows(zone({ metal: 1 }), true, FACTORY).metal).toBe('dented')
    expect(zoneStatusRows(zone({ metal: 2 }), true, FACTORY).metal).toBe('dented')
    expect(zoneStatusRows(zone({ metal: 3 }), true, FACTORY).metal).toBe('crumpled')
  })

  it('reads a trim zone metal row as trim panel, no metalwork', () => {
    expect(zoneStatusRows(trimZone(), false, FACTORY).metal).toBe('Trim panel: no metalwork')
  })

  it('reads a bare fresh panel as bare metal needing primer, and unpainted', () => {
    const rows = zoneStatusRows(
      zone({ metal: 0, surface: 0, finish: 3, primed: false }),
      true,
      FACTORY,
    )
    expect(rows.prep).toBe('bare metal (needs primer)')
    expect(rows.paint).toBe('unpainted')
  })

  it('reads a filler-pending zone as rough, needing fill and sand', () => {
    expect(zoneStatusRows(zone({ metal: 0, surface: 1 }), true, FACTORY).prep).toBe(
      'rough (needs fill and sand)',
    )
  })

  it('reads a primed panel as primed prep, still unpainted', () => {
    const rows = zoneStatusRows(
      zone({ metal: 0, surface: 0, finish: 3, primed: true }),
      true,
      FACTORY,
    )
    expect(rows.prep).toBe('primed')
    expect(rows.paint).toBe('unpainted')
  })

  it('reads the paint row across the finish ladder: dull, painted, showroom', () => {
    expect(zoneStatusRows(zone({ finish: 2, colour: 'white' }), true, FACTORY)).toMatchObject({
      prep: 'sealed under paint',
      paint: 'painted Plain White, dull',
    })
    expect(zoneStatusRows(zone({ finish: 1, colour: 'white' }), true, FACTORY).paint).toBe(
      'painted Plain White',
    )
    expect(zoneStatusRows(zone({ finish: 0, colour: 'white' }), true, FACTORY).paint).toBe(
      'polished Plain White, showroom',
    )
  })

  it('names the off-factory colour when the zone disagrees with the factory scheme', () => {
    expect(zoneStatusRows(zone({ finish: 1, colour: 'red' }), true, FACTORY).paint).toBe(
      'painted Bright Red (not the factory Plain White)',
    )
  })

  it('accepts either half of a two-tone factory scheme without flagging a mismatch', () => {
    const twoTone = 'white+black'
    expect(zoneStatusRows(zone({ finish: 1, colour: 'white' }), true, twoTone).paint).toBe(
      'painted Plain White',
    )
    expect(zoneStatusRows(zone({ finish: 1, colour: 'black' }), true, twoTone).paint).toBe(
      'painted Black',
    )
  })

  it('reads a stripped zone as unpainted, never trusting the stale colour left behind', () => {
    // Mirrors zonePipelineSteps' own respray-after-strip case: stripPrep
    // leaves `colour` set from before the strip, and the paint row must not
    // read it.
    const stripped = zone({ metal: 0, surface: 0, finish: 3, primed: false, colour: 'red' })
    expect(zoneStatusRows(stripped, true, FACTORY).paint).toBe('unpainted')
  })
})
