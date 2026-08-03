import { COURSES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { OVERWORLD_LOCATION_IDS } from '../pixi/overworld/buildings'
import { OVERWORLD_PLACEMENTS } from '../pixi/overworld/overworldMap'
import { destinationFor, locationAt } from './overworldNav'

/**
 * Every one of the fourteen overworld locations resolves to somewhere real:
 * an existing route for the twelve that have one, a refusal for the two
 * that do not (the cafe and the bank), and the test track (with a sensible
 * default course) for the three that lead there. `locationAt` is the click
 * side of the same contract - a point inside a location's own placement
 * resolves to that location, and a point that lands on nothing resolves to
 * nothing.
 */

const INERT_IDS = new Set(['cafe', 'bank'])
const TEST_TRACK_IDS = new Set(['mountains-touge', 'highway-wangan', 'international-raceway'])

describe('overworldNav', () => {
  it('covers all fourteen locations, matching the art module id list exactly', () => {
    expect(OVERWORLD_LOCATION_IDS).toHaveLength(14)
    for (const id of OVERWORLD_LOCATION_IDS) expect(() => destinationFor(id)).not.toThrow()
  })

  it('the cafe and the bank refuse the click instead of navigating', () => {
    for (const id of OVERWORLD_LOCATION_IDS.filter((locationId) => INERT_IDS.has(locationId))) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('inert')
      if (destination.kind === 'inert') expect(destination.message.length).toBeGreaterThan(0)
    }
  })

  it('the touge, the wangan and the international raceway all lead to the test track, each with its own course', () => {
    const expected: Record<string, string> = {
      'mountains-touge': 'hakone',
      'highway-wangan': 'wangan',
      'international-raceway': 'misaki',
    }
    for (const id of OVERWORLD_LOCATION_IDS.filter((locationId) =>
      TEST_TRACK_IDS.has(locationId),
    )) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('route')
      if (destination.kind !== 'route') continue
      expect(destination.to).toEqual({
        name: 'test-track',
        query: { course: expected[id] },
      })
      // The default course this location asks for is one the game actually ships.
      expect(COURSES.some((course) => course.id === expected[id])).toBe(true)
    }
  })

  it('every remaining location routes to a real, named screen', () => {
    const expected: Record<string, string> = {
      garage: 'garage-interior',
      'tool-hire': 'upgrades',
      'parts-shop': 'parts',
      'local-yard': 'auctions',
      'staff-centre': 'staff',
      'regional-auction': 'auctions',
      'premium-auction': 'auctions',
      'dealer-network': 'auctions',
      'collector-network': 'auctions',
    }
    const plainIds = OVERWORLD_LOCATION_IDS.filter(
      (id) => !INERT_IDS.has(id) && !TEST_TRACK_IDS.has(id),
    )
    expect(plainIds.sort()).toEqual(Object.keys(expected).sort())
    for (const id of plainIds) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('route')
      if (destination.kind === 'route') expect(destination.to).toEqual({ name: expected[id] })
    }
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
