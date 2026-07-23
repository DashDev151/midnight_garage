# Sprint 115: Auction Guarantors - PENDING COPY AND LEVER SIGN-OFF

**Date:** drafted 2026-07-23. Source: the maintainer's own design
(`docs/design/auction-guarantors.md`, filed 2026-07-19, now unblocked) plus the D4 pick in
`docs/design/midgame-decision-brief.md` ("go ahead with guarantors, make sure it's well
integrated with the rest of the auction progression system"). NOT CLEARED FOR
IMPLEMENTATION until the maintainer signs the lever table (section 4, directive 22) and
red-pens the authored copy (section 5).

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

**Personas (personas.json intros, existing register):**

- Numata (taxi-fleet owner, regional guarantor): "Runs thirty taxis and one ulcer. Pays on
  the day."
- Ishida (established dealer, premium guarantor): "Thirty years behind a forecourt smile.
  The eyes do the arithmetic."
- HELD, lands with the Hall arc: Kurogane (quiet-market export agent, collector
  guarantor): "Moves cars that never get advertised. Knows why."

**Mission briefs (offer copy):**

- the-fleet-spare (Numata): "One of my drivers put cab twelve into a barrier and walked
  away laughing. I need a spare that starts every shift and forgives every driver. Nothing
  clever. Clever breaks."
- the-showroom-standard (Ishida): "My forecourt sells the idea that a used car can be a
  new beginning. Bring me one I could photograph for the window. If I find a rough edge,
  I will find it in front of you."

**Delivered lines (the unlock beat; {venue} resolves to the rolled venue name):**

- Numata: "She'll outlast three drivers. Come by {venue} on Thursday; tell the desk Numata
  stands for you."
- Ishida: "Hm. I would have photographed it from the other side. Come to {venue}; the book
  at the door will have your name where mine used to be."

**Locked-tier copy (AuctionScreen, replaces the rep-threshold copy):**

- regional: "Members only. Somebody has to vouch for you, and nobody does. Yet."
- premium: "The book at the door is full of names. Yours needs a sponsor's beside it."
- collector-network (dark under D1a, permanent-feeling without lying): "Invitation only,
  and invitations start with a name they trust. No one is offering yours."

**Tutorial addition (auctions step, one instruction line after the existing venue line):**
"The permit behind the till covers any auction house in town. Getting through their doors
is another matter: the bigger rooms want a member to vouch for you."

## Tasks (on sign-off)

- [ ] Content: `unlocksAuctionTier` schema field; two missions + two personas (copy
      verbatim from section 5); locked-tier copy content; tutorial line.
- [ ] Sim: derived tier-unlock read replacing the rep table for the three gated tiers;
      missions.ts unchanged in shape (the field is a reward like any other); the
      same-day-stocking probe; chain-order probes.
- [ ] Game: AuctionScreen locked-tier copy swap ({venue}-aware); re-pins.
- [ ] Orchestrator: verification, Exit.

## Exit

(To be filled from real verification output on sign-off and implementation.)
