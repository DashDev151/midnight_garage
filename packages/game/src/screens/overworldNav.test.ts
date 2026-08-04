import { COURSES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { OVERWORLD_LOCATION_IDS, type OverworldLocationId } from '../pixi/overworld/buildings'
import { OVERWORLD_PLACEMENTS } from '../pixi/overworld/overworldMap'
import { destinationFor, locationAt } from './overworldNav'

/**
 * Every one of the fifteen overworld locations resolves to somewhere real:
 * an existing route for the twelve that have one, a refusal for the two
 * that do not (the cafe and the bank), and the test track (with its own
 * fixed course, no picker) for the four track venues. `locationAt` is the
 * click side of the same contract - a point inside a location's own
 * placement resolves to that location, and a point that lands on nothing
 * resolves to nothing.
 */

const INERT_IDS = new Set(['cafe', 'bank'])
const TEST_TRACK_IDS = new Set([
  'mountains-touge',
  'highway-wangan',
  'international-raceway',
  'drag-strip',
])

/** The tab-bar screens a map click also reaches - these mark their own
 * navigation `from: 'overworld'` so the screen's back control can tell a
 * map arrival from a tab arrival apart (`mapBack.ts`). The garage is
 * deliberately absent: nothing else routes to `garage-interior`, so it
 * carries no such flag. */
const OVERWORLD_FLAGGED_ROUTES: Record<string, string> = {
  'tool-hire': 'upgrades',
  'parts-shop': 'parts',
  'local-yard': 'auctions',
  'staff-centre': 'staff',
  'regional-auction': 'auctions',
  'premium-auction': 'auctions',
  'dealer-network': 'auctions',
  'collector-network': 'auctions',
}

describe('overworldNav', () => {
  it('covers all fifteen locations, matching the art module id list exactly', () => {
    expect(OVERWORLD_LOCATION_IDS).toHaveLength(15)
    for (const id of OVERWORLD_LOCATION_IDS) expect(() => destinationFor(id)).not.toThrow()
  })

  it('the cafe and the bank refuse the click instead of navigating', () => {
    for (const id of OVERWORLD_LOCATION_IDS.filter((locationId) => INERT_IDS.has(locationId))) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('inert')
      if (destination.kind === 'inert') expect(destination.message.length).toBeGreaterThan(0)
    }
  })

  it('the touge, the wangan, the international raceway and the drag strip each lead to the test track on their own course, and no two venues share one', () => {
    const expected: Record<string, string> = {
      'mountains-touge': 'hakone',
      'highway-wangan': 'wangan',
      'international-raceway': 'misaki',
      'drag-strip': 'yatabe',
    }
    const trackIds = OVERWORLD_LOCATION_IDS.filter((locationId) => TEST_TRACK_IDS.has(locationId))
    expect(trackIds.sort()).toEqual(Object.keys(expected).sort())

    const coursesAssigned: string[] = []
    for (const id of trackIds) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('route')
      if (destination.kind !== 'route') continue
      expect(destination.to).toEqual({
        name: 'test-track',
        query: { course: expected[id] },
      })
      // The course this venue names is one the game actually ships.
      expect(COURSES.some((course) => course.id === expected[id])).toBe(true)
      coursesAssigned.push(expected[id]!)
    }
    // One venue, one course: every shipped course is used exactly once across
    // the four track venues, never offered as a choice on more than one.
    expect(coursesAssigned.sort()).toEqual(COURSES.map((c) => c.id).sort())
    expect(new Set(coursesAssigned).size).toBe(coursesAssigned.length)
  })

  it('every remaining location routes to a real, named screen', () => {
    const expected: Record<string, string> = {
      garage: 'garage-interior',
      ...OVERWORLD_FLAGGED_ROUTES,
    }
    const plainIds = OVERWORLD_LOCATION_IDS.filter(
      (id) => !INERT_IDS.has(id) && !TEST_TRACK_IDS.has(id),
    )
    expect(plainIds.sort()).toEqual(Object.keys(expected).sort())
    for (const id of plainIds) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('route')
      if (destination.kind === 'route') {
        // `toMatchObject` rather than `toEqual`: the eight tab-reachable
        // destinations also carry a `from: 'overworld'` query (checked in
        // its own test below), which this test isn't about.
        expect(destination.to).toMatchObject({ name: expected[id] })
      }
    }
  })

  it('marks every tab-reachable destination `from: overworld`, so its own back control can return to the map', () => {
    for (const [id, name] of Object.entries(OVERWORLD_FLAGGED_ROUTES)) {
      const destination = destinationFor(id as OverworldLocationId)
      expect(destination.kind).toBe('route')
      if (destination.kind === 'route') {
        expect(destination.to).toEqual({ name, query: { from: 'overworld' } })
      }
    }
  })

  it('the garage carries no `from` flag - nothing else routes to garage-interior, so its back control is unconditional', () => {
    const destination = destinationFor('garage')
    expect(destination).toEqual({ kind: 'route', to: { name: 'garage-interior' } })
  })

  it('finds the location under a point at its own placement centre', () => {
    for (const placement of OVERWORLD_PLACEMENTS) {
      expect(locationAt(placement.x, placement.y)).toBe(placement.id)
    }
  })

  it('finds nothing at a point that sits on no building', () => {
    expect(locationAt(2, 2)).toBeNull()
  })
})
