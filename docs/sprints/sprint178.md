# Sprint 178: the earn event and the shop ledger

**Arc:** `docs/sprints/scene-standing-arc.md`. Step 4.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, sections 4 and 8.

## Goal

**Standing becomes earnable, and the record of it is a list of cars you can point at.**

## The earn event already exists

**This is the sprint's central fact and it removes most of the risk.** `resolveSellViaWalkIn` in
`selling.ts` already computes the exact definition the design names, already comments it as MATCHED,
and already drives `reputation.matchedSaleRepBonus`:

```ts
const matched = buyer !== undefined && tasteCeiling !== undefined
  ? channelBuyerTaste(buyer, model, car, ..., tasteCeiling) >= 1
  : false
```

The channel comes from `state.carsForSale.find(...)?.channelId`; the buyer from the pending offer.
`drawPersonaChannelOffer` uses the same `>= 1` test to gate the two `matchedOnly` channels.

**So this sprint hooks an existing computation. It does not write a detector.**

Two facts that fall out and must be preserved:

- **`tradeNetwork` can never produce a matched delivery.** It has no `tasteCeiling` and its buyer is
  not a real `Buyer.id`. Wholesale earns no standing, which is correct: the trade pays wholesale
  precisely because nobody there is choosing your car.
- The matched read happens **at accept time**, against the car as it is being sold.

## The second earn path: commissions

A completed commission for a scene also counts. Scene commissions are a Respected-stage unlock and
arrive in sprint 179, so this sprint builds the event and 179 supplies the second source.

**Missions credit through their customer, not a tag.** `storyMissions.json`'s ten entries carry
hand-written `specialtyGroups`, which is the bug this arc kills. A mission links to a persona by
`personaId`, and `personas.json` entries currently carry only `id`, `name` and `intro`.

**Personas gain an archetype**, and a delivered mission credits that scene. `four-wheels` links to
`yuki`, a student who wants "anything on four wheels that starts every morning" with almost no
money, which is a Daily Drivers buyer exactly.

**The tutorial needs no rewriting.** It teaches take the job, buy a car, diagnose it, fix it, hand it
over, and none of that changes. Only what the handover credits does, and that now comes from the
customer. **No tutorial copy is touched by this sprint.**

## The ledger

**The record of standing is the list of cars, not a number.** Every matched delivery appends: the
car, the scene, the price, the day. The player says "I built those".

**Everything is a tally underneath and no number is ever surfaced.** Stage advancement counts deeds
and compares against thresholds, because everything does. The requirement is that the player is
shown a history and never a bar. Anyone who reads "no point track" literally and tries to build
thresholdless advancement will stall.

The screen: the ledger, filterable by scene, with each scene's current stage stated in words.
`StandingScreen.vue` exists for the old system and is the natural home, but it is torn down in
sprint 181, so decide deliberately whether to grow it or replace it.

## Anti-lock-in: the rolling window

The loop (deliver to a scene, become known in it, draw more of its buyers, deliver more) is the
feature. Unguarded it is the trap: everybody specialises in Daily Drivers because that is the early
stock, and the standing is dead weight by mid-game.

**Standing never decays.** History is history. Stages and operations, once earned, are permanent, so
the Daily Drivers specialist keeps a quick-flip lane forever while chasing Collector standing.

**The daily draw follows recent deliveries**, on a rolling window, on top of the channels' authored
weights. Pivoting takes effect in days rather than requiring a second climb. That weighting lands in
sprint 179; **this sprint records the window** so 179 has something to read.

## Reuse analysis (directive 16)

| concern | what already does it |
| --- | --- |
| Detecting a matched sale | `channelBuyerTaste >= 1` in `resolveSellViaWalkIn`. Hooked, not rewritten |
| Knowing the channel at accept | `state.carsForSale[].channelId`, already read for exactly this |
| Rewarding a matched sale | `reputation.matchedSaleRepBonus`, already applied there. Standing joins it |
| A per-day event record | the day log and `financeLedger`'s existing shapes |
| Mission delivery | `resolveDeliverMission` in `missions.ts`, the third `applySpecialtyDelta` caller. It swaps what it credits |

**Genuinely new:** the ledger store and screen, persona archetypes, stage thresholds, the rolling
delivery window.

## Levers (directive 22)

**Not approved:**

1. **The stage thresholds.** "A few matched deliveries" and "a body of matched work" are counts and
   need numbers.
2. **The Shop's price bar.** A marquee build is "a matched delivery over a price bar", and that bar
   is a yen figure. Consider whether it should scale with the car's tier rather than be flat: a
   marquee Daily Drivers car and a marquee Collector car are not the same money.
3. **The rolling window's length.**

## Definition of done

1. A matched delivery credits exactly one scene, chosen by the buyer, with no tag anywhere.
2. A trade-network sale credits nothing.
3. A delivered mission credits its customer's scene.
4. The ledger lists real cars, filterable by scene, and surfaces no number.
5. Stages advance from deeds.
6. The tutorial is untouched and still passes.
7. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately not here

Word of mouth, commissions, operations, and deleting the old specialty system.

## Exit

_To be completed at the end of the sprint._
