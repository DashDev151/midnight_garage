import type { RouteLocationRaw } from 'vue-router'
import { AUCTION_TIER_COPY, type AuctionTier } from '@midnight-garage/content'
import {
  INERT_LOCATIONS,
  overworldLocationSize,
  type OverworldLocationId,
} from '../pixi/overworld/buildings'
import { OVERWORLD_PLACEMENTS } from '../pixi/overworld/overworldMap'

/**
 * Where clicking each overworld location actually goes. Every real
 * destination is a route that already exists in `router/index.ts`, never
 * guessed here; the inert locations refuse the click instead of navigating
 * anywhere.
 */

export type OverworldDestination =
  { kind: 'route'; to: RouteLocationRaw } | { kind: 'inert'; message: string }

/** Why a building that is not open yet stays shut, in the shop's own dry
 * voice - never a blank page, never an apology. */
const INERT_MESSAGE_BY_LOCATION: Partial<Record<OverworldLocationId, string>> = {
  bank: "Not open for business. Whatever's behind that glass, it isn't loans.",
  // The dealer network is `sellingChannels.tradeNetwork`, a fax to the dealer
  // circle rather than a place a buyer or a lot turns up (`selling.ts`'s own
  // doc comment on `TRADE_NETWORK_BUYER_ID`) - there is nothing inside the
  // building for a walk-in to do.
  'dealer-network': 'Dealer to dealer only. Nothing on the block for a walk-in.',
}

/** The four auction buildings, each mapped to the one tier its own room
 * scopes to (sprint209.md task A) - `local-yard`'s building id and tier id
 * happen to share a spelling, the other three don't
 * (`regional-auction`/`regional`, `premium-auction`/`premium`). Exported so
 * `OverworldScreen` can reuse the same mapping for the hover card's cadence
 * line rather than keeping a second copy. */
export const AUCTION_TIER_BY_LOCATION: Partial<Record<OverworldLocationId, AuctionTier>> = {
  'local-yard': 'local-yard',
  'regional-auction': 'regional',
  'premium-auction': 'premium',
  'collector-network': 'collector-network',
}

/** The auctions route for a single tier's own room - a query param rather
 * than a path segment, so the route table in `router/index.ts` needs no
 * change and a screen reached with no tier at all (a stale link, the
 * transitional tab-bar entry) still resolves via `AuctionScreen`'s own
 * lowest-unlocked-tier default. */
function auctionRouteFor(tier: AuctionTier): RouteLocationRaw {
  return { name: 'auctions', query: { from: 'overworld', tier } }
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

/** Why the stand refuses a click while it is shut - the van, not the news,
 * is the reason, in the shop's own dry voice. */
const STAND_SHUT_MESSAGE = 'Shutters down. No van, no papers.'

/** Every other location's real, already-existing route. The garage leads
 * straight to the garage screen: it is the whole building, bays and work
 * stations alike. The cafe leads into its own small interior beat, walked
 * out of the same way the market and test track are (no `from` flag - see
 * below); the four auction-tier buildings are handled separately above
 * (`AUCTION_TIER_BY_LOCATION`), each landing in its own scoped room rather
 * than this flat map.
 *
 * The three left here also sit on the persistent tab bar, so their own
 * screen's back control cannot always return to the map - the
 * `from: 'overworld'` query flag is how that screen tells the two apart
 * (`mapBack.ts`'s `mapBackTarget`). The garage and the cafe carry no such
 * flag: the garage is the tab bar's home screen with no back control at
 * all, and the cafe is never on the tab bar, so its own back control always
 * means the map (`MarketScreen.vue`'s hardcoded `{ name: 'overworld' }`
 * follows the same rule for the same reason). */
const ROUTE_BY_LOCATION: Partial<Record<OverworldLocationId, RouteLocationRaw>> = {
  garage: { name: 'garage' },
  cafe: { name: 'cafe' },
  'tool-hire': { name: 'upgrades', query: { from: 'overworld' } },
  'parts-shop': { name: 'parts', query: { from: 'overworld' } },
  'staff-centre': { name: 'staff', query: { from: 'overworld' } },
}

/** Options that vary a destination by live game state rather than by id
 * alone. The stand is the one location whose route depends on something
 * other than which building was clicked: `standUnlocked` mirrors the same
 * claim `isSellingChannelUnlocked` reads for the `freeAdsPaper` channel
 * (sprint205.md), since the one scripted job hands the player both. Missing
 * or `false` reads as shut - the safe default for any caller (this test
 * file's own coverage check included) that has no state to hand.
 *
 * `unlockedAuctionTiers` mirrors the sim's own `unlockedAuctionTiers`
 * (`catalogs.ts`): which of the three story-gated rooms this player may walk
 * into today. `local-yard` never needs to appear in it - the lease's own
 * guarantor keeps that room open regardless of what this array holds, the
 * same unconditional truth `isAuctionTierUnlocked` hardcodes on the sim
 * side. Missing reads as "only the local yard", the safe default matching
 * every other option here. */
export interface DestinationOptions {
  standUnlocked?: boolean
  unlockedAuctionTiers?: AuctionTier[]
}

/** What clicking `id` does: navigate, or refuse with a short reason. Every
 * one of the sixteen locations resolves to exactly one of these two. */
export function destinationFor(
  id: OverworldLocationId,
  options?: DestinationOptions,
): OverworldDestination {
  if (id === 'the-stand') {
    return options?.standUnlocked
      ? { kind: 'route', to: { name: 'market' } }
      : { kind: 'inert', message: STAND_SHUT_MESSAGE }
  }
  const auctionTier = AUCTION_TIER_BY_LOCATION[id]
  if (auctionTier) {
    if (auctionTier === 'local-yard') return { kind: 'route', to: auctionRouteFor(auctionTier) }
    const unlocked = options?.unlockedAuctionTiers?.includes(auctionTier) ?? false
    return unlocked
      ? { kind: 'route', to: auctionRouteFor(auctionTier) }
      : { kind: 'inert', message: AUCTION_TIER_COPY[auctionTier] }
  }
  if (INERT_LOCATIONS.includes(id)) {
    return { kind: 'inert', message: INERT_MESSAGE_BY_LOCATION[id] ?? 'Not open yet.' }
  }
  const courseId = TEST_TRACK_COURSE_BY_LOCATION[id]
  if (courseId) {
    return { kind: 'route', to: { name: 'test-track', query: { course: courseId } } }
  }
  const to = ROUTE_BY_LOCATION[id]
  if (to) return { kind: 'route', to }
  // Every location is one of the four groups above by construction
  // (`overworldNav.test.ts` checks all sixteen); this only fires if a new
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
 * `buildings.ts` has one (`overworldNav.test.ts` checks all sixteen), but a
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
