import { describe, expect, it } from 'vitest'
import { mapBackTarget } from './mapBack'

/**
 * A screen reached both from the map and from the tab bar needs its back
 * control to tell the two apart. `mapBackTarget` is the one place that
 * decision lives, reused by every such screen rather than each carrying its
 * own copy of the same branch.
 */
describe('mapBackTarget', () => {
  it('returns to the overworld when the query flags a direct map click', () => {
    expect(mapBackTarget('overworld', { name: 'garage' })).toEqual({ name: 'overworld' })
  })

  it('falls back to the given default when the query carries no flag (a tab-bar arrival)', () => {
    expect(mapBackTarget(undefined, { name: 'garage' })).toEqual({ name: 'garage' })
    expect(mapBackTarget('', { name: 'garage' })).toEqual({ name: 'garage' })
  })

  /** The garage interior's room flags (`from=workshop-floor` and friends)
   * died with the interior screen; a stale one reads as no flag
   * at all rather than as a door to a deleted route. */
  it('falls back to the default for a dead room flag', () => {
    expect(mapBackTarget('workshop-floor', { name: 'garage' })).toEqual({ name: 'garage' })
    expect(mapBackTarget('office', { name: 'garage' })).toEqual({ name: 'garage' })
  })

  it('falls back to the default for a non-string query value', () => {
    expect(mapBackTarget(['overworld'], { name: 'garage' })).toEqual({ name: 'garage' })
    expect(mapBackTarget(null, { name: 'garage' })).toEqual({ name: 'garage' })
  })
})
