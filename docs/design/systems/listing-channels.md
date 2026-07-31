# Listing channels: who sees the car

**Status: BUILT (Sprint 156).** Implements the maintainer's ruling of 2026-07-31, recorded in
`sale-value-system.md` §6. Every value is in `docs/sprints/sprint156.md`'s Exit and in the
economy approval gate's own ledger; the four open questions below are answered at the foot of
this document.

## What is wrong

**Every channel is available on day one, and the only thing separating them is a fee.**

A channel can currently express six things: a fee, one of three cadence shapes, a taste ceiling,
an optional price band, a matched-buyers-only flag, and whether it needs a forecourt slot. There
is **no per-channel buyer pool**. Who turns up is decided elsewhere entirely: a tier gate
(`interestedBuyers`) picks who is eligible, and a weighted draw (`pickWeightedCandidate`) picks
which of them arrives. The channel only enters afterwards, as a price band and a veto.

The measured result: **`tunerMagazine` and `weekendMeet` produce byte-identical prices on both
worked-example cars** (¥240,184 and ¥542,568). Identical taste ceiling, identical matched-only
gate. They are not two buyer bases. They are one buyer base with two invoices, and the magazine
charges four times as much for it.

**And the tier gate bites before any channel can help.** `entry` cars have exactly two interested
archetypes. No amount of channel design makes a tuner magazine better for a kei, because the tuner
is not eligible to look at it at all.

## The ruling

**Channels are progression, on two axes.**

**General:** *"not all of them should be available to the player from day 1"*, and *"as you
progress in the game your listing options should improve in a general sense."*

**Specific:** *"some listing methods should be unambigously better for some kinds of cars."*

**The shop front is the deliberate floor:** *"listing in the shop front should be deliberatly the
worst way to sell, but free."* First way, never best, and free forever so a player with nothing is
never locked out.

And the sharpest consequence, already recorded: **a channel is a buyer base before it is a price
multiplier with a fee attached. The question a channel answers is "who sees this car", not "how
much is added to it".**

## The fix

### 1. A channel carries a buyer pool

The missing lever. Each channel gets a weighting over buyer archetypes, and that weighting decides
who walks in. The magazine draws tuners and racers; the meet draws stancers and tuners; the shop
front draws everyone, thinly.

This is what makes the specific axis real. It also fixes the magazine-and-meet collapse without
touching either fee: they stop being identical the moment they draw different people.

**Where it must NOT go.** The obvious implementation is to weight `pickWeightedCandidate`'s draw.
That function currently samples in proportion to each buyer's own valuation, and that size bias is
the last remaining mechanism holding the instant-flip guard closed. **Adding a channel weighting
must compose with that bias, not replace it**, and the guard must be re-checked in the same change.

### 2. The tier gate widens

A channel cannot be "unambiguously better for a kei" while no kei-interested buyer can be drawn
through it. Either `tierPreferences` stops being a hard gate and becomes a weight (it is currently
authored with weights 0.3 to 1.0 that **no code reads**), or a channel may widen the pool beyond
what the tier gate allows.

The second is the better answer and it already has a home: `sale-value-system.md` §6 gives the
free ads paper a "presence-widening" niche, and says to cut the channel if that niche is not
wanted. **This is the niche.**

### 3. Channels unlock by named events

**RULED: a locked list, opened by named events**, not by cash and not by a bare reputation number.

This is forced by the progression bible, not merely preferred. Law 4's pillar table assigns
**clientele quality to reputation** and forbids **cash** from gating it. A better channel is by
definition a better clientele, so **a channel unlocked by paying a larger fee is illegal**, and
fee is the only thing separating channels today.

The shipped precedent is `storyMission.unlocksAuctionTier`: a named narrative event opens a
venue. It satisfies every relevant law at once, and it is how auction rooms already work. A
magazine editor takes your call. A meet organiser vouches for you. Both are named, period-real
things, which Law 5 requires.

**Unlocks never close.** `sale-value-system.md` §5 rules that unlocks stay ratcheted and that what
standing buys is flow. So a channel, once opened, stays open, and standing changes **how good the
buyers coming through it are**, not whether the door exists.

That is how the two axes coexist: **named events open doors, standing improves who walks through
them.**

## What must not change

- **The shop front is free, available from day one, and never the best.** Law 1 of the progression
  bible: nothing basic is ever locked.
- **The trade network keeps a reason to exist.** It is the fast, taste-blind, no-forecourt exit.
  Raising the shop front's ceiling must not swallow it.
- **`tasteCeiling` stays `.min(1)`.** No channel prices below market through taste.
- **No unlock toast.** Law 4 bans ambient notification. The channel list changing shape on the car
  page is diegetic; a banner announcing it is not.

## Answered on implementation (Sprint 156, under R4)

1. **Which channels lock, and behind what named event.** `weekendMeet` opens on delivering
   `low-and-loud` (Daisuke, the shakotan customer, who parks up at the bay-side PA on Sundays);
   `tunerMagazine` opens on delivering `street-power-street-manners` (Gen, whose editor friend at
   one of the tuning monthlies owes him a favour). The shop front, the trade network **and the
   free ads paper** stay open from day one, so a new career has three genuinely different ways to
   sell rather than one. The line between open and locked is exactly the line the progression
   bible draws: the two locked channels are the only two whose `tasteCeiling` clears 1.00, and a
   better price for the same car is clientele quality, which the pillar table assigns to
   reputation.
2. **The buyer pool weights per channel.** Authored on the four persona channels; the trade
   network has no persona and carries none. Full table in `sprint156.md`'s Exit.
3. **The shop front's taste ceiling.** Left at exactly 1.00. The maintainer's own floated
   alternative was the better half of the answer: the shop front now reaches **everybody** (a flat
   pool plus the widest-but-one `poolWidening`), and stays the deliberate floor on price. Its flat
   pool also makes it the one channel standing cannot improve, since 1 raised to any exponent is
   still 1.
4. **Does the free ads paper survive?** Yes, and it earns the presence-widening niche outright: it
   carries the widest `poolWidening` of the five and is the best day-one answer for an ordinary
   car. Measured on a tidy Wagon R, it returns ¥227,155 per listed day against the shop front's
   ¥104,991.

## What moves when this lands

`SellingChannelsSchema` is a fixed five-key object and `SellingChannelIdSchema` a closed enum, so
a sixth channel is a schema change plus a `SAVE_VERSION` bump (`ForSaleEntry.channelId` persists).
The instant-flip guard must be re-verified. `economy-bible.md`'s audit table already names
`sellingChannels.*` as an anchor, so a new channel property joins that row.

## Definition of done

1. Two channels never produce identical prices on the same car unless they genuinely draw the same
   people.
2. A kei has a channel that is unambiguously good for it.
3. The shop front is usable on day one, forever, and is never the best answer.
4. Every locked channel opens through a named, period-real event, and none of them close.
5. The instant-flip guard is still green.
