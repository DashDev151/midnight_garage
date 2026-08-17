# Community jobs: the three character tiers

**Maintainer ruling, 2026-08-16 (recorded verbatim in intent; design of record for
character scope).** Sits beside `ran-when-parked-cast.md` (which owns Tier 1) and the
narrative doc. Sprint 210 builds the first Tier 2 character; this doc is the law the
rest follow.

## The tiers

**Tier 1 - the cast.** Yuki, Dai-chan, Gonda and the rest of the named cast doc.
Critical to the narrative and their scenes. Owned by the cast document; nothing here
touches them.

**Tier 2 - the community.** Named, minor, recurring. They reach the player through
smallish jobs - simpler than story missions - and completing their job CHANGES THE
WORLD in a specific, permanent way. The shape of the trade: a short-term loss or
break-even for the player (reduced pay, or free, a straight cost) bought back as a
lasting improvement to their world. The player is given a way to interact with their
world and watch it answer.

Settled examples of the pattern:

- **The newsstand owner** (first built, Sprint 205/210): fix the Acty, the stand
  reopens: the free-ads listing channel and the trade sheet exist because the player
  put them there.
- **The cafe owner**: a job done for little or nothing unlocks "the usual" - a menu
  item at the same price as coffee that restores more labour. A strict upgrade, sold
  with warm copy: the owner knows what you take and has it poured when you walk in.
- **The parts-shop owner**: a favour earns a standing small discount.
- **The banker**: a favour earns slightly better rates when borrowing exists.

Laws for Tier 2:

1. The reward is a world-change, never a cash payout. The job itself pays poorly or
   not at all; that is the point and the copy owns it.
2. The change is permanent, legible, and attached to the person: the player can point
   at a thing in their world and say who gave it to them.
3. One character, one place, one change. A Tier 2 character does not accumulate a
   quest log.
4. Tier 2 jobs are authored (tasks chosen for the story they tell), arrive when the
   player is ready for them (not day one), and are completable by the shop the player
   plausibly has at that point.
5. Copy bar: full lead pass, cosy-management tone, the Vimes voice, the
   lived-in-Japan-1995-2005 credibility test. Heartwarming is allowed; cheesy is not.

**Tier 3 - the throwaway tier.** Randomly generated names on radial jobs. Not cast,
just names. No copy investment, no arcs, no unlocks. The existing
`serviceJobCustomerNames` pool is exactly this tier; "The newsstand owner" leaves
that pool when Sprint 210 promotes them to Tier 2.

## Mechanics note (reuse-first)

Tier 2 rides the service-job system plus the unlock field Sprint 205 added
(`serviceJobChannelUnlocks` generalises to a small set of world-change claims). No
parallel quest system exists or will: a community job IS a service job with an
authored car, authored tasks, a person, and an unlock.
