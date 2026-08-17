import { AUCTION_TIER_COPY, COURSES, type AuctionTier } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  INERT_LOCATIONS,
  OVERWORLD_LOCATION_IDS,
  type OverworldLocationId,
} from '../pixi/overworld/buildings'
import { OVERWORLD_PLACEMENTS } from '../pixi/overworld/overworldMap'
import { AUCTION_TIER_BY_LOCATION, destinationFor, locationAt } from './overworldNav'

/**
 * Every one of the sixteen overworld locations resolves to somewhere real:
 * an existing route for most, a refusal for the inert buildings (the bank,
 * drawn but not open, and the dealer network, a fax circle with nothing
 * inside for a walk-in) plus the three story-gated auction rooms before
 * their guarantor mission lands, and the test track on its own fixed
 * course, no picker, for the four track venues. The stand is its own case:
 * shut (refusing the click) until `standUnlocked` is passed, then routing to
 * the market page - the one destination that depends on state rather than
 * the id alone. `locationAt` is the click side of the same contract - a
 * point inside a location's own placement resolves to that location, and a
 * point that lands on nothing resolves to nothing.
 */

/** Read from the source rather than restated here: a second hand-kept copy of
 * this list is exactly what went stale when the cafe opened. */
const INERT_IDS = new Set<string>(INERT_LOCATIONS)
const TEST_TRACK_IDS = new Set([
  'mountains-touge',
  'highway-wangan',
  'international-raceway',
  'drag-strip',
])
/** The three auction buildings gated behind a guarantor mission - unlike
 * `local-yard`, which is always open, these refuse the click (case: no
 * `unlockedAuctionTiers` handed in, or the tier missing from it) until named
 * unlocked. */
const GATED_AUCTION_IDS = new Set(['regional-auction', 'premium-auction', 'collector-network'])

/** The tab-bar screens a map click also reaches - these mark their own
 * navigation `from: 'overworld'` so the screen's back control can tell a
 * map arrival from a tab arrival apart (`mapBack.ts`). The garage is
 * deliberately absent: it is the tab bar's home screen, with no back
 * control to flag for. */
const OVERWORLD_FLAGGED_ROUTES: Record<string, string> = {
  'tool-hire': 'upgrades',
  'parts-shop': 'parts',
  'staff-centre': 'staff',
}

describe('overworldNav', () => {
  it('covers all sixteen locations, matching the art module id list exactly', () => {
    expect(OVERWORLD_LOCATION_IDS).toHaveLength(16)
    for (const id of OVERWORLD_LOCATION_IDS) expect(() => destinationFor(id)).not.toThrow()
  })

  it('an inert building refuses the click instead of navigating, and says why', () => {
    for (const id of OVERWORLD_LOCATION_IDS.filter((locationId) => INERT_IDS.has(locationId))) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('inert')
      if (destination.kind === 'inert') expect(destination.message.length).toBeGreaterThan(0)
    }
  })

  /**
   * The cafe leads into its own small interior beat (sprint209.md task C) -
   * no `from` flag, since it never sits on the tab bar and its own back
   * control always means the map.
   */
  it('the cafe routes to its own interior screen, with no `from` flag to carry', () => {
    expect(destinationFor('cafe')).toEqual({ kind: 'route', to: { name: 'cafe' } })
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
      garage: 'garage',
      cafe: 'cafe',
      'local-yard': 'auctions',
      ...OVERWORLD_FLAGGED_ROUTES,
    }
    // The three gated auction buildings drop out - their own dedicated tests
    // below cover them, since their destination depends on
    // `unlockedAuctionTiers` rather than being a plain, always-on route. The
    // stand drops out for the same reason (`standUnlocked`).
    const plainIds = OVERWORLD_LOCATION_IDS.filter(
      (id) =>
        !INERT_IDS.has(id) &&
        !TEST_TRACK_IDS.has(id) &&
        !GATED_AUCTION_IDS.has(id) &&
        id !== 'the-stand',
    )
    expect(plainIds.sort()).toEqual(Object.keys(expected).sort())
    for (const id of plainIds) {
      const destination = destinationFor(id)
      expect(destination.kind).toBe('route')
      if (destination.kind === 'route') {
        // `toMatchObject` rather than `toEqual`: the three tab-reachable
        // destinations also carry a `from: 'overworld'` query (checked in
        // its own test below), which this test isn't about.
        expect(destination.to).toMatchObject({ name: expected[id] })
      }
    }
  })

  it('the local yard always routes to its own auctions room, regardless of any unlock state', () => {
    expect(destinationFor('local-yard')).toEqual({
      kind: 'route',
      to: { name: 'auctions', query: { from: 'overworld', tier: 'local-yard' } },
    })
    // Even an empty unlock list (the safe default for a caller with no
    // state) never shuts the local yard - the lease's own guarantor keeps
    // it open unconditionally, matching the sim's `isAuctionTierUnlocked`.
    expect(destinationFor('local-yard', { unlockedAuctionTiers: [] })).toEqual({
      kind: 'route',
      to: { name: 'auctions', query: { from: 'overworld', tier: 'local-yard' } },
    })
  })

  describe('the three story-gated auction rooms', () => {
    const CASES: Array<{ id: OverworldLocationId; tier: Exclude<AuctionTier, 'local-yard'> }> = [
      { id: 'regional-auction', tier: 'regional' },
      { id: 'premium-auction', tier: 'premium' },
      { id: 'collector-network', tier: 'collector-network' },
    ]

    it('refuse the click with the guarantor line when no unlock state is given, the safe default', () => {
      for (const { id, tier } of CASES) {
        expect(destinationFor(id)).toEqual({ kind: 'inert', message: AUCTION_TIER_COPY[tier] })
      }
    })

    it('refuse the click while their own tier is absent from `unlockedAuctionTiers`', () => {
      for (const { id, tier } of CASES) {
        const destination = destinationFor(id, { unlockedAuctionTiers: [] })
        expect(destination).toEqual({ kind: 'inert', message: AUCTION_TIER_COPY[tier] })
      }
    })

    it('route to their own scoped auctions room once their tier is unlocked, and no other tier unlocks it', () => {
      for (const { id, tier } of CASES) {
        const otherTier = CASES.find((c) => c.tier !== tier)!.tier
        expect(destinationFor(id, { unlockedAuctionTiers: [otherTier] })).toEqual({
          kind: 'inert',
          message: AUCTION_TIER_COPY[tier],
        })
        expect(destinationFor(id, { unlockedAuctionTiers: [tier] })).toEqual({
          kind: 'route',
          to: { name: 'auctions', query: { from: 'overworld', tier } },
        })
      }
    })
  })

  it('maps every auction building id to the one tier its room scopes to', () => {
    expect(AUCTION_TIER_BY_LOCATION).toEqual({
      'local-yard': 'local-yard',
      'regional-auction': 'regional',
      'premium-auction': 'premium',
      'collector-network': 'collector-network',
    })
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

  it('the garage building leads straight to the garage screen, with no `from` flag to carry', () => {
    expect(destinationFor('garage')).toEqual({ kind: 'route', to: { name: 'garage' } })
  })

  /** The dealer network is `sellingChannels.tradeNetwork`, a fax circle
   * rather than a walk-in trade - the building refuses the click with its
   * own line. */
  it('the dealer network refuses a walk-in with its own line', () => {
    expect(destinationFor('dealer-network')).toEqual({
      kind: 'inert',
      message: 'Dealer to dealer only. Nothing on the block for a walk-in.',
    })
  })

  /**
   * The stand is shut until the scripted job that fixes the owner's van is
   * delivered, and open afterwards - `overworldNav.ts`'s own `standUnlocked`
   * flag, which `OverworldScreen.vue` derives from
   * `game.availableSellingChannelIds` including `freeAdsPaper`. No state and
   * no flag both mean the same thing: shut, never a route.
   */
  it('the stand refuses the click when no unlock state is given, the safe default', () => {
    expect(destinationFor('the-stand')).toEqual({
      kind: 'inert',
      message: expect.stringContaining('Shutters down'),
    })
  })

  it('the stand refuses the click while explicitly unlocked is false', () => {
    const destination = destinationFor('the-stand', { standUnlocked: false })
    expect(destination.kind).toBe('inert')
  })

  it('the stand routes to the market page once unlocked', () => {
    expect(destinationFor('the-stand', { standUnlocked: true })).toEqual({
      kind: 'route',
      to: { name: 'market' },
    })
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
