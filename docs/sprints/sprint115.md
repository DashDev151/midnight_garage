# Sprint 115: Auction Guarantors

**Date:** drafted 2026-07-23, implemented 2026-07-23. Source: the maintainer's own design
(`docs/design/auction-guarantors.md`, filed 2026-07-19, now unblocked) plus the D4 pick in
`docs/design/midgame-decision-brief.md` ("go ahead with guarantors, make sure it's well
integrated with the rest of the auction progression system"). The lever table (section 4)
and the authored copy (section 5) carried the maintainer's sign-off into implementation.

**One-line goal:** the bigger auction houses stop being rep thresholds and become people
who vouch for you.

## Reuse analysis (directive 16)

**Reused:** the story-mission machine wholesale (missions.ts's linear offer chain, the
no-failure law, requirement kinds, `payoutYenFor` and its probes, the Delivered dialog);
`personas.json`'s shape; the locked-tier rendering seam in AuctionScreen (copy swap, not a
new surface); `catalogs.ts`'s eligible-tier loop (the gate check swaps its source);
`tutorialSteps.json`'s existing auctions step (one added line); the venue-name display from
Sprint 114 (unlock copy names the rolled venue via the same helper).

**Genuinely new:** the `unlocksAuctionTier` reward field on missions; the derived-unlock
read (below); two personas + two missions of content now, one of each written but HELD;
locked-tier guarantor copy.

## Integration decisions (the "well integrated" mandate)

1. **One chain, not a side track.** Guarantor missions join the SAME linear story chain,
   interleaved by rep gate: the campaign already carries the game's beats one at a time,
   and tier access becoming a campaign beat is exactly the integration the mandate asks
   for. Consequence, stated honestly: a player who ignores a guarantor build does not see
   the next story mission until they deliver it: the guarantor waits, and so does the
   chain (consistent with "no failure, the guarantor waits").
2. **Unlocks are DERIVED, not stored:** a tier is open when `local-yard`, or when any
   completed mission carries `unlocksAuctionTier` for it. No new save field, no Dexie
   bump, and the mission record IS the fact (the coupling runs through the content field,
   which is the honest source either way). `AUCTION_TIER_MIN_REPUTATION` retires for the
   three gated tiers per the design's rule 1.
3. **The collector guarantor is WRITTEN but HELD (D1a).** The maintainer's own design note
   says the unlock beat "needs a stocked room, not an empty one", and D1a keeps the
   collector network dark until legend content exists. Shipping its guarantor would unlock
   an empty venue: worse than the silence. The persona and mission draft live in section 5
   and land with the Hall of Legends arc; the collector tier's locked copy meanwhile is
   guarantor-flavoured and permanent-feeling without lying.
4. **Immediate stocking verified in-sprint:** the design's rule that a newly unlocked tier
   has lots the day it opens (the "come by Thursday" beat) gets its own probe against
   `catalogs.ts`.
5. **Tutorial gains one line** in the auctions step establishing the permit and the
   vouching fiction (section 5); the scripted flow is otherwise untouched.

## 4. THE LEVER TABLE (directive 22: each value needs explicit sign-off)

| Lever | Proposed value |
|---|---|
| the-fleet-spare (regional guarantor) gateReputationPoints | 45 (between wont-strand-her 30 and first-proper-car 60) |
| the-fleet-spare requirement | reliability >= 58 on the delivered car (fleet duty; buildable from local-yard stock per the design's rule 4) |
| the-fleet-spare budgetCap/payout | budget cap 350,000; payout derived by the same `payoutYenFor` path every mission uses, pinned by the existing probes (computed value presented at implementation, never hand-set) |
| the-showroom-standard (premium guarantor) gateReputationPoints | 240 (between the-column-clock 200 and low-and-loud 320) |
| the-showroom-standard requirement | every part fine-or-better (the clean sale bar) plus style >= 50: a car his forecourt could take photos of; buildable from regional stock |
| the-showroom-standard budgetCap/payout | budget cap 1,200,000; payout via `payoutYenFor`, same rule |
| unlock timing | tier opens the moment the mission resolves as delivered; stocking probe guarantees lots that same day |

Retired: `AUCTION_TIER_MIN_REPUTATION` entries for regional/premium/collector-network
(local-yard remains open from day one; the collector tier remains dark under D1a with or
without this table).

## 5. Authored copy (orchestrator-personal, for the red pen)

**Personas (personas.json intros, existing register; rewritten 2026-07-23 after the
maintainer's review: same trades, less edge, people worth a favour):**

- Numata (taxi-fleet owner, regional guarantor): "Runs thirty taxis. Knows every driver by
  first name, and pays on the day."
- Ishida (established dealer, premium guarantor): "Thirty years selling cars, and still
  walks the lot every morning like it's day one."
- Kurogane (quiet-market export agent, collector guarantor; mission HELD for the Hall arc,
  copy complete): "Finds homes abroad for cars too good to shout about. Never seen without
  the notebook."

**Mission briefs (offer copy):**

- the-fleet-spare (Numata): "One of my drivers put cab twelve into a barrier and walked
  away laughing, so we're calling it a lucky week. I need a spare that starts every shift
  and forgives every driver. Nothing clever. Clever breaks."
- the-showroom-standard (Ishida): "My forecourt sells the idea that a used car can be a new
  beginning. Bring me one I could photograph for the window, the kind that makes a young
  couple stop walking. I'll know it when I see it."
- HELD with the Hall arc, the-quiet-crate (Kurogane): "There's a buyer overseas who asks me
  for the impossible twice a year. This time it's simple: bring me a car so right that
  nobody has to say a word when the crate opens. Take your time. The good ones always take
  time."

**Delivered lines (the unlock beat; {venue} resolves to the rolled venue name):**

- Numata: "She'll outlast three of my drivers. Come by {venue} on Thursday; tell the desk
  Numata stands for you."
- Ishida: "It'll photograph beautifully. Come to {venue}; the book at the door will have
  your name where mine used to be."
- HELD, Kurogane: "I watched them open the crate over a phone call. Nobody said anything
  for a while, which is how you know. {venue} keeps a chair for people like you; I've told
  them your name."

**Locked-tier copy (AuctionScreen, replaces the rep-threshold copy):**

- regional: "Members only. Somebody has to vouch for you, and nobody does. Yet."
- premium: "The book at the door is full of names. Yours needs a sponsor's beside it."
- collector-network (dark under D1a, permanent-feeling without lying): "Invitation only,
  and invitations start with a name they trust. No one is offering yours."

**Tutorial addition (auctions step, one instruction line after the existing venue line):**
"The permit behind the till covers any auction house in town. Getting through their doors
is another matter: the bigger rooms want a member to vouch for you."

**Overdelivered lines (agent-drafted where the schema demanded them, orchestrator-reviewed
and APPROVED same day; presented to the maintainer with the rest of section 5):**

- Numata: "Outlast three of my drivers? Give her a month, she'll outlast the fleet."
- Ishida: "I didn't even need the photograph. She sold herself the moment she rolled onto
  the lot."

## Tasks (on sign-off)

- [x] Content: `unlocksAuctionTier` schema field; two missions + two personas (copy
      verbatim from section 5); locked-tier copy content; tutorial line.
- [x] Sim: derived tier-unlock read replacing the rep table for the three gated tiers;
      missions.ts unchanged in shape (the field is a reward like any other); the
      same-day-stocking probe; chain-order probes.
- [x] Game: AuctionScreen locked-tier copy swap ({venue}-aware); re-pins.
- [x] Orchestrator: verification, Exit.

## Exit

**Content.** `unlocksAuctionTier` (optional `AuctionTier`, refined to exclude `'local-yard'`)
added to `StoryMissionSchema`. `the-fleet-spare` (gate 45, persona `numata`) and
`the-showroom-standard` (gate 240, persona `ishida`) added to `storyMissions.json` in gate
order, both with byte-verbatim section-5 copy. `the-quiet-crate`/`kurogane` stayed out
(HELD for the Hall arc). Personas `numata`/`ishida` added with verbatim intros. A new
content home, `AuctionTierCopySchema`/`auctionTierCopy.json`, carries the three locked-tier
lines verbatim (pinned in `schemas.test.ts`). The tutorial's `find` step gained the one
authored permit/vouch line, verbatim, immediately after the existing venue-introduction
line. `RequirementSpecSchema` gained `allPartsBandAtLeast` (a `minBand` floor, `roadworthy`'s
general form) with a matching `evaluateAllPartsBandAtLeast` in `requirements.ts`. The
directive-22 approval gate (`economyApprovalGate.test.ts`) was re-pinned to the two new
missions' payout/budget pair.

**Payouts (formula-derived, never hand-set).** Both locked `budgetCapYen` values from the
lever table were verified achievable EXACTLY through `payoutYenFor` (the same 1.3x-of-probe-
cost formula every mission uses), so `payoutYen === budgetCapYen` holds with no exception:

- `the-fleet-spare`: a `honda-crx-sir-ef8` with every reliability-weighted slot repaired to
  fine and the five purely cosmetic slots (paint, underbody, aero, seats, dashGauges) left
  worn - reliability 60 (clears the 58 floor), probe cost 268,540 yen, formula payout
  **350,000 yen** (exact match).
- `the-showroom-standard`: a `nissan-cefiro-a31` with every slot fine-or-better, sport-grade
  panels/paint/underbody/aero swapped in, and block/exhaust/fuelSystem/clutch upgraded to
  mint - style 62 (clears the 50 floor), probe cost 922,360 yen, formula payout
  **1,200,000 yen** (exact match).

`reputationReward`: 22 (`the-fleet-spare`, interpolating wont-strand-her's 20 and
first-proper-car's 25) and 38 (`the-showroom-standard`, interpolating the-column-clock's 35
and low-and-loud's 40).

**Sim.** `catalogs.ts` gained `isAuctionTierUnlocked`/`unlockedAuctionTiers` (pure, derived
from `state.storyMissions`: `local-yard` always true, every other tier true iff some
`delivered` record's mission carries a matching `unlocksAuctionTier`) and
`stockNewlyUnlockedTier` (the day-1 seeding path, `generateAuctionCatalog` with
`AUCTION_LOTS_PER_TIER[tier]`, scoped to one tier). `generateForEligibleTiers`'s gate swapped
from `reputationAtLeast(..., AUCTION_TIER_MIN_REPUTATION[tier])` to
`isAuctionTierUnlocked(state, context, tier)`. `AUCTION_TIER_MIN_REPUTATION` is deleted from
`constants.ts` - its only consumers were `catalogs.ts` (swapped above) and
`bots/competentPolicy.ts`'s `highestAccessibleTier` (swapped to the same derived read, now
taking `context`). Same-day stocking is wired at the delivery resolver
(`resolveDeliverMission`, missions.ts): the instant a mission with `unlocksAuctionTier`
delivers, its tier's opening batch is generated with an rng stream seeded from
`tier-unlock:${missionId}:${carInstanceId}` (deterministic, never reused - a mission delivers
at most once) and appended to `activeAuctionLots` for the CURRENT day, logged as
`auction-catalog-refreshed`. `missions.ts` importing `catalogs.ts` closes a function-level
import cycle (`catalogs.ts` -> `tutorial.ts` -> `missions.ts`); verified safe in practice
(all three modules only reference each other inside function bodies, never at module-eval
time) by the full green sim suite.

**Probes.** `storyMissionProbes.test.ts` gained a "guarantor mission probes" describe:
satisfiability + the formula-derived payout pin for each mission, plus a same-day-stocking
probe per tier (`resolveDeliverMission` then asserts `isAuctionTierUnlocked` flips true and
`activeAuctionLots` carries `lot-${day}-<tier>-*` entries dated TODAY, not tomorrow). A new
`auctionGuarantors.test.ts` covers chain order (both missions' sorted-array neighbours),
collector-network staying dark under D1a even with both missions delivered and reputation
maxed, and the derived read surviving a plain `JSON.parse(JSON.stringify(state))` round-trip
(proving no dedicated save field is needed). `catalogs.test.ts`'s three reputation-gate tests
were re-pinned to the derived read (case (a), directive 17: the mechanism they exercised no
longer exists) plus two new tests asserting reputation ALONE never opens a tier.

**Game.** `gameStore.ts` exposes `unlockedAuctionTiers` (wrapping the sim function over
`gameState`/`context`). `AuctionScreen.vue`'s tier loop now walks all four tiers in order
(`Object.keys(AUCTION_TIER_LABELS)`, reused rather than a new literal list): an unlocked tier
with lots renders exactly as before (venue-name heading, inspect control, board); a locked
tier always renders a heading (the plain tier label, never the rolled venue name) and the
`AUCTION_TIER_COPY` guarantor line, with no inspect control. New `AuctionScreen.test.ts`
coverage: the three locked lines render byte-verbatim with no inspect button; the local-yard
heading is never suppressed; delivering `the-fleet-spare` (via a synthetic, ledger-free,
already-fine owned car - a random auction buyout's purchase price would itself blow the
mission's budget cap) flips regional to its rolled venue name while premium/collector-network
stay locked. `ServiceJobsScreen.test.ts`'s campaign-chain fixture (marks the four
earlier-gated missions delivered to reach `the-column-clock` directly) was re-pinned to
include `the-fleet-spare`, now interleaved between `wont-strand-her` and `first-proper-car`.

**Checks (run once each, in order, all green):** `pnpm test --project content` (14 files,
122 tests), `pnpm test --project sim` (57 files, 1405 tests), `pnpm test --project game`
(55 files, 682 tests), `pnpm typecheck` (content, sim, game all clean).

**Deviations from the task list:** `overdeliveredCopy` for both missions is NOT in section
5 (only `requestCopy`/`deliveredCopy` were authored there) - two short in-voice lines were
written to satisfy the schema's non-empty requirement and flagged for the same red-pen pass
as the rest of section 5, rather than left as a gap:

- `the-fleet-spare`: "Outlast three of my drivers? Give her a month, she'll outlast the
  fleet."
- `the-showroom-standard`: "I didn't even need the photograph. She sold herself the moment
  she rolled onto the lot."
