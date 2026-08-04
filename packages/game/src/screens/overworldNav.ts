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
  | { kind: 'route'; to: RouteLocationRaw }
  | { kind: 'inert'; message: string }
  /** Somewhere you do a thing rather than somewhere you go. The cafe is the
   * only one: you buy the crew a round and walk back out, so sending the
   * player to a screen for it would be a page they immediately leave. */
  | { kind: 'action'; action: 'buy-coffee' }

/** Why a building that is not open yet stays shut, in the shop's own dry
 * voice - never a blank page, never an apology. */
const INERT_MESSAGE_BY_LOCATION: Partial<Record<OverworldLocationId, string>> = {
  bank: "Not open for business. Whatever's behind that glass, it isn't loans.",
}

/** The four overworld locations that each lead to their own course on the
 * test track, one venue to one course: the touge to Hakone Pass, the wangan
 * to Wangan Bayshore, the raceway to Misaki International Raceway, the drag
 * strip to the Yatabe standing kilometre. Not a default - the test track
 * screen offers only the course its own venue names, never a picker over
 * the other three; arriving at the touge means driving Hakone. */
const TEST_TRACK_COURSE_BY_LOCATION: Partial<Record<OverworldLocationId, string>> = {
  'mountains-touge': 'hakone',
  'highway-wangan': 'wangan',
  'international-raceway': 'misaki',
  'drag-strip': 'yatabe',
}

/** Every other location's real, already-existing route. The garage leads
 * into the room-based interior rather than straight to the bays screen, so
 * the six rooms - including the ones the bays screen never touches, like
 * the warehouse and the office - are actually reachable from the map. The
 * four auction-tier buildings (local yard, regional, premium, collector
 * network) front the one auctions screen: the game has a single `auctions`
 * route covering every tier already.
 *
 * Dealer network is NOT an auction tier - it is `sellingChannels.tradeNetwork`,
 * a fax to the dealer circle rather than a place a buyer or a lot turns up
 * (`selling.ts`'s own doc comment on `TRADE_NETWORK_BUYER_ID`). It fronts the
 * garage's alley instead, the same target (and the same unflagged, always-
 * map-returning back control) as the garage building itself, since that room
 * is where a listed car actually sits - there is no standalone sell screen to
 * point it at, and a fax is not a place to route dedicated art at.
 *
 * Every one of these except the garage and dealer network also sits on the
 * persistent tab bar, so its own screen's back control cannot always return
 * to the map - the `from: 'overworld'` query flag is how that screen tells
 * the two apart (`mapBack.ts`'s `mapBackTarget`). The garage and dealer
 * network carry no such flag: both route to `garage-interior`, whose back
 * control returns to the map unconditionally regardless of which building
 * sent the player there. */
const ROUTE_BY_LOCATION: Partial<Record<OverworldLocationId, RouteLocationRaw>> = {
  garage: { name: 'garage-interior' },
  'tool-hire': { name: 'upgrades', query: { from: 'overworld' } },
  'parts-shop': { name: 'parts', query: { from: 'overworld' } },
  'local-yard': { name: 'auctions', query: { from: 'overworld' } },
  'staff-centre': { name: 'staff', query: { from: 'overworld' } },
  'regional-auction': { name: 'auctions', query: { from: 'overworld' } },
  'premium-auction': { name: 'auctions', query: { from: 'overworld' } },
  'dealer-network': { name: 'garage-interior' },
  'collector-network': { name: 'auctions', query: { from: 'overworld' } },
}

/** What clicking `id` does: navigate, or refuse with a short reason. Every
 * one of the fifteen locations resolves to exactly one of these two. */
export function destinationFor(id: OverworldLocationId): OverworldDestination {
  if (id === 'cafe') return { kind: 'action', action: 'buy-coffee' }
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
  // (`overworldNav.test.ts` checks all fifteen); this only fires if a new
  // location is ever added to `buildings.ts` without a destination here.
  throw new Error(`overworld location "${id}" has no destination wired`)
}

export interface LocationBounds {
  left: number
  top: number
  width: number
  height: number
}

/** A location's own on-screen box, top-left plus size, at exactly the
 * placement and rendered size `overworldMap.ts` itself draws sprites at.
 * `null` for an id with no placement - unreachable while every id in
 * `buildings.ts` has one (`overworldNav.test.ts` checks all fifteen), but a
 * future mismatch between the two modules could hit it. */
export function boundsFor(id: OverworldLocationId): LocationBounds | null {
  const placement = OVERWORLD_PLACEMENTS.find((p) => p.id === id)
  if (!placement) return null
  const { width, height } = overworldLocationSize(id)
  return { left: placement.x - width / 2, top: placement.y - height / 2, width, height }
}

/** Which location, if any, sits under scene coordinates (x, y) - a plain
 * point-in-box test against every location's own bounds. */
export function locationAt(x: number, y: number): OverworldLocationId | null {
  for (const placement of OVERWORLD_PLACEMENTS) {
    const bounds = boundsFor(placement.id)
    if (!bounds) continue
    const insideX = x >= bounds.left && x < bounds.left + bounds.width
    const insideY = y >= bounds.top && y < bounds.top + bounds.height
    if (insideX && insideY) return placement.id
  }
  return null
}
