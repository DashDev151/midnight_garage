import { describe, expect, it } from 'vitest'
import {
  CareerScriptSchema,
  sessionBundleToScript,
  type SessionExportBundle,
} from '../src/careerScript'
import smokeScriptRaw from '../src/careerScripts/smoke.script.json'

describe('CareerScriptSchema', () => {
  it('round-trips the smoke fixture through JSON unchanged', () => {
    const parsed = CareerScriptSchema.parse(smokeScriptRaw)
    const roundTripped = CareerScriptSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(roundTripped).toEqual(parsed)
  })

  it('rejects a script whose event payload does not match its declared type', () => {
    const bad = {
      name: 'bad',
      description: 'bad',
      synthetic: true,
      seed: 1,
      days: [
        {
          day: 1,
          events: [{ type: 'buyout', payload: { notLotId: 'x' } }],
          checkpoints: [],
        },
      ],
    }
    expect(() => CareerScriptSchema.parse(bad)).toThrow()
  })
})

describe('sessionBundleToScript', () => {
  const bundle: SessionExportBundle = {
    career: 'test-career',
    exportedOnDay: 3,
    seed: 42,
    actions: [
      { id: 1, day: 1, type: 'buyout', payload: { lotId: 'lot-1-local-yard-0' }, timestamp: 100 },
      { id: 2, day: 1, type: 'sellPart', payload: { partInstanceId: 'part-1-0' }, timestamp: 200 },
      { id: 3, day: 2, type: 'endDay', payload: { endedDay: 2 }, timestamp: 300 },
    ],
  }

  it('groups recorded events by day, in id order, stripping the envelope', () => {
    const script = sessionBundleToScript(bundle, 7)
    expect(script.synthetic).toBe(false)
    expect(script.days).toEqual([
      {
        day: 1,
        events: [
          { type: 'buyout', payload: { lotId: 'lot-1-local-yard-0' } },
          { type: 'sellPart', payload: { partInstanceId: 'part-1-0' } },
        ],
        checkpoints: [],
      },
      { day: 2, events: [{ type: 'endDay', payload: { endedDay: 2 } }], checkpoints: [] },
    ])
  })

  it('an explicit seed argument overrides the bundle-carried seed', () => {
    const script = sessionBundleToScript(bundle, 7)
    expect(script.seed).toBe(7)
  })

  it('reads the seed off the bundle when no explicit argument is given', () => {
    const script = sessionBundleToScript(bundle)
    expect(script.seed).toBe(42)
  })

  it('throws when neither the bundle nor an explicit argument carries a seed', () => {
    const seedless: SessionExportBundle = { ...bundle, seed: undefined }
    expect(() => sessionBundleToScript(seedless)).toThrow(/no seed/)
  })

  it('fails loudly on an event type the vocabulary cannot place, never silently', () => {
    // The archived pre-202 sessions log a bare `type` the current vocabulary
    // has since renamed or dropped - simulated here via an escape hatch
    // (`unknown` first), since the typed union itself would refuse to let
    // real code construct this literal at all.
    const preSprint202Bundle = {
      career: 'archived',
      exportedOnDay: 1,
      actions: [{ id: 1, day: 1, type: 'buyCar', payload: { lotId: 'x' }, timestamp: 1 }],
    } as unknown as SessionExportBundle
    expect(() => sessionBundleToScript(preSprint202Bundle, 1)).toThrow(/cannot place/)
  })
})
