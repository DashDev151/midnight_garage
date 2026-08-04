import { describe, expect, it } from 'vitest'
import { BUYERS, SceneStandingSchema } from '../src'

/**
 * There is one scene per buyer archetype, and the two lists are written out
 * separately: `buyers.json` names the archetypes, and `SceneStandingSchema`
 * names its keys explicitly rather than as a record, so a missing key fails
 * validation instead of vanishing.
 *
 * That explicitness is deliberate and it is also how two lists drift. This
 * guard fails the moment an archetype is added, removed or renamed without
 * its scene following, which is exactly the shape of fault that let a renamed
 * archetype fall through to a default coherence tolerance unnoticed.
 */
describe('every buyer archetype has a scene, and no scene lacks a buyer', () => {
  it('the two lists name the same six', () => {
    const archetypes = BUYERS.map((buyer) => buyer.archetype).sort()
    const scenes = Object.keys(SceneStandingSchema.shape).sort()
    expect(scenes).toEqual(archetypes)
  })
})
