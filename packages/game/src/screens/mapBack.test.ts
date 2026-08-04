import { describe, expect, it } from 'vitest'
import { mapBackTarget } from './mapBack'

/**
 * A screen reached both from the map and from the tab bar needs its back
 * control to tell the two apart. `mapBackTarget` is the one place that
 * decision lives, reused by every such screen rather than each carrying its
 * own copy of the same three-way branch.
 */
describe('mapBackTarget', () => {
  it('returns to the overworld when the query flags a direct map click', () => {
    expect(mapBackTarget('overworld', { name: 'garage' })).toEqual({ name: 'overworld' })
  })

  it('returns to the garage-interior room the query names, for an action launched from a room', () => {
    expect(mapBackTarget('workshop-floor', { name: 'garage' })).toEqual({
      name: 'garage-interior',
      query: { room: 'workshop-floor' },
    })
    expect(mapBackTarget('office', { name: 'garage' })).toEqual({
      name: 'garage-interior',
      query: { room: 'office' },
    })
  })

  it('falls back to the given default when the query carries no flag (a tab-bar arrival)', () => {
    expect(mapBackTarget(undefined, { name: 'garage' })).toEqual({ name: 'garage' })
    expect(mapBackTarget('', { name: 'garage' })).toEqual({ name: 'garage' })
  })

  it('falls back to the default for a non-string query value', () => {
    expect(mapBackTarget(['overworld'], { name: 'garage' })).toEqual({ name: 'garage' })
    expect(mapBackTarget(null, { name: 'garage' })).toEqual({ name: 'garage' })
  })
})
