# Auction Guarantors

**Status:** Implemented (Sprint 115), regional and premium only. Replaces the passive
rep-threshold auction gate with authored story-mission unlocks. The collector-network
guarantor (Kurogane, the-quiet-crate) is written but held for the Hall of Legends arc (see
`docs/sprints/sprint115.md` section 5 and `TODO.md`'s progression-map item) - rule 1 below
still governs it (`AUCTION_TIER_MIN_REPUTATION` is fully retired) but no mission unlocks it
yet, so it stays dark.

## Premise (lore)

Period fiction, 1995: any garage can hold a kobutsusho permit (the player's is framed by
the till from day one). What gates each auction house is **membership**: a deposit and a
**guarantor**, an existing member who vouches for you. The Local Yard's guarantor is part
of the opening (the lease came with an introduction); every bigger house requires you to
earn one.

## The loop

Earn rep -> a potential guarantor approaches with a build request (story mission) ->
deliver it -> they stand guarantor at the next house -> tier unlocks, with the rarity
band it carries (`auctionTierForRarity`).

## Rules (locked decisions)

1. **Single gate.** Rep (`gateReputationPoints`) gates when the guarantor mission
   *appears*. Completing the mission unlocks the tier. No residual rep check on the tier
   itself: `AUCTION_TIER_MIN_REPUTATION` (constants.ts, Sprint 16 decision 3) is retired
   for regional/premium/collector-network. `local-yard` stays open from day one.
2. **No failure.** Consistent with all story missions: guarantor missions cannot be
   failed or expire. The guarantor waits.
3. **Guarantors are trade people.** Each must plausibly already be a member of the house
   they vouch at: match the trade to the house's inventory. Three new personas (to be
   written; candidates: taxi-fleet owner whose fleet we service -> Regional (volume
   commercial buyer; ties into the service-bay passive-income fiction); established
   local dealer -> Premium; grey-market euro export agent -> Collector Network).
4. **Sourceable one tier down.** Each guarantor build must be completable with
   cars/parts from already-unlocked tiers. Check every mission's implied platform
   against `auctionTierForRarity` at content-writing time.

## Content additions

- 3 mission entries in `storyMissions.json`, existing shape, plus one new reward field,
  e.g. `"unlocksAuctionTier": "regional"`.
- 3 personas in `personas.json`.
- Locked-tier copy per tier (content law: lives in `packages/content/data/`, not
  hardcoded): narrative, not mechanical: "No guarantor will stand for you here - yet."
- Delivered/overdelivered copy doubles as the unlock beat ("Come by the Regional on
  Thursday. Tell them Ishida sent you.").

## Sim / UI touch points

- `unlockedAuctionTiers` in sim state; set on guarantor-mission completion.
  (Alternative: derive from completed mission ids - decide at implementation; derived
  avoids a save field but couples tier access to mission data forever.)
- `missions.ts` completion path applies the unlock.
- `AuctionScreen.vue` locked-tier rendering switches from rep copy to guarantor copy.
- Save migration: existing saves grant tiers their current rep tier already earned under
  the old gate (no player loses access). *(Filing note: superseded pre-launch by
  CLAUDE.md directive 19 - no migrations before launch; a schema change is a version
  bump and old saves wipe. The migration clause applies only if this lands after real
  players exist.)*
- Tutorial `find` step: one added line establishing the permit + Local Yard guarantor
  fiction.
- Unlock is immediate: verify `catalogs.ts` populates lots for a tier the day it opens
  (the "come by Thursday" beat needs a stocked room, not an empty one).

## Out of scope (noted, not planned)

- No cash/deposit alternate path. Rejected by design: missions can't be failed, so no
  stall state exists, and this feature's currency is trust, not yen.
- Gaisha sourcing is unaffected (Import Broker remains the only channel, GDD 4.5).
