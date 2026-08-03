import type { RouteLocationRaw } from 'vue-router'
import {
  INERT_LOCATIONS,
  overworldLocationSize,
  type OverworldLocationId,
} from '../pixi/overworld/buildings'
import { OVERWORLD_PLACEMENTS } from '../pixi/overworld/overworldMap'

/**
 * Where clicking each overworld location actually goes. Every real
 * destination is a route that already exists in `router/index.ts` (the two
 * new ones this feature adds - `garage-interior` and `test-track` - are
 * added there alongside it, never guessed here); the two inert locations
 * refuse the click instead of navigating anywhere.
 */

export type OverworldDestination =
  { kind: 'route'; to: RouteLocationRaw } | { kind: 'inert'; message: string }

/** Why a building that is not open yet stays shut, in the shop's own dry
 * voice - never a blank page, never an apology. */
const INERT_MESSAGE_BY_LOCATION: Partial<Record<OverworldLocationId, string>> = {
  cafe: "Shut. Whatever's meant to happen in there, it hasn't started yet.",
  bank: "Not open for business. Whatever's behind that glass, it isn't loans.",
}

/** The three overworld locations that lead to the test track, each
 * defaulting the course picker to the shipped course its own name matches -
 * the touge to Hakone Pass, the wangan to Wangan Bayshore, the raceway to
 * Misaki International Raceway. Read as a default only: the test track
 * screen still offers every shipped course regardless of how it was
 * reached. */
const TEST_TRACK_COURSE_BY_LOCATION: Partial<Record<OverworldLocationId, string>> = {
  'mountains-touge': 'hakone',
  'highway-wangan': 'wangan',
  'international-raceway': 'misaki',
}

/** Every other location's real, already-existing route. The garage leads
 * into the room-based interior rather than straight to the bays screen, so
 * the six rooms - including the ones the bays screen never touches, like
 * the warehouse and the office - are actually reachable from the map. The
 * four auction-tier buildings (local yard, regional, premium, collector
 * network) and the fifth, dealer network, all front the one auctions
 * screen: the game has a single `auctions` route covering every tier
 * already, and dealer network names no tier of its own in the content. */
const ROUTE_BY_LOCATION: Partial<Record<OverworldLocationId, RouteLocationRaw>> = {
  garage: { name: 'garage-interior' },
  'tool-hire': { name: 'upgrades' },
  'parts-shop': { name: 'parts' },
  'local-yard': { name: 'auctions' },
  'staff-centre': { name: 'staff' },
  'regional-auction': { name: 'auctions' },
  'premium-auction': { name: 'auctions' },
  'dealer-network': { name: 'auctions' },
  'collector-network': { name: 'auctions' },
}

/** What clicking `id` does: navigate, or refuse with a short reason. Every
 * one of the fourteen locations resolves to exactly one of these two. */
export function destinationFor(id: OverworldLocationId): OverworldDestination {
  if (INERT_LOCATIONS.includes(id)) {
    return { kind: 'inert', message: INERT_MESSAGE_BY_LOCATION[id] ?? 'Not open yet.' }
  }
  const courseId = TEST_TRACK_COURSE_BY_LOCATION[id]
  if (courseId) {
    return { kind: 'route', to: { name: 'test-track', query: { course: courseId } } }
  }
  const to = ROUTE_BY_LOCATION[id]
  if (to) return { kind: 'route', to }
  // Every location is one of the three groups above by construction
  // (`overworldNav.test.ts` checks all fourteen); this only fires if a new
  // location is ever added to `buildings.ts` without a destination here.
  throw new Error(`overworld location "${id}" has no destination wired`)
}

/** Which location, if any, sits under scene coordinates (x, y) - a plain
 * point-in-box test against every location's own placement and rendered
 * size, exactly the bounds `overworldMap.ts` itself places sprites at. */
export function locationAt(x: number, y: number): OverworldLocationId | null {
  for (const placement of OVERWORLD_PLACEMENTS) {
    const { width, height } = overworldLocationSize(placement.id)
    const left = placement.x - width / 2
    const top = placement.y - height / 2
    if (x >= left && x < left + width && y >= top && y < top + height) return placement.id
  }
  return null
}
