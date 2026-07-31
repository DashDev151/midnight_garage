# Sprint 156: a channel is a buyer base

**Status: READY TO IMPLEMENT.** Design of record: `docs/design/systems/listing-channels.md`.

## The defect

**Every channel is available on day one, and the only thing separating them is a fee.**

A channel can express six things: a fee, one of three cadence shapes, a `tasteCeiling`, an optional
`priceBand`, a `matchedOnly` flag, and `requiresForecourt`. **There is no per-channel buyer pool.**

Who turns up is decided elsewhere entirely: `interestedBuyers` gates on car tier, and
`pickWeightedCandidate` draws weighted by each buyer's own valuation. The channel only enters
afterwards, as a price band and a veto.

Measured: **`tunerMagazine` and `weekendMeet` produce byte-identical prices on both worked-example
cars** (¥240,184 and ¥542,568). Identical taste ceiling, identical matched-only gate. They are not
two buyer bases. They are one buyer base with two invoices, and the magazine charges four times as
much for it.

And the tier gate bites first: **`entry` cars have exactly two interested archetypes.** No channel
design makes a magazine "unambiguously better for a kei" while the tuner cannot see it at all.

## The ruling

**Channels are progression, on two axes.** General: *"not all of them should be available to the
player from day 1"*, and options *"improve in a general sense"* as you climb. Specific: *"some
listing methods should be unambigously better for some kinds of cars."*

**The shop front is the deliberate floor**: the first way to sell, never the best, and free forever
so a player with nothing is never locked out.

And the sharpest consequence: **a channel is a buyer base before it is a price multiplier with a
fee attached. The question it answers is "who sees this car", not "how much is added to it".**

## The fix

### 1. A channel carries a buyer pool

The missing lever. Each channel gets a weighting over buyer archetypes, and that weighting decides
who walks in. The magazine draws tuners and racers; the meet draws stancers and tuners; the shop
front draws everyone, thinly.

**This is what makes the specific axis real**, and it separates the magazine from the meet without
touching either fee.

**Where it must NOT go.** The obvious implementation is to weight `pickWeightedCandidate`'s draw.
That function samples in proportion to each buyer's own valuation, and **that size bias is the
mechanism holding the instant-flip guard closed**. The channel weighting must **compose** with the
bias, not replace it, and **the instant-flip guard is re-verified in the same change**.

### 2. The tier gate widens

A channel cannot be better for a kei while no kei-interested buyer can be drawn through it.

`Buyer.tierPreferences[].weight` is **authored 0.3 to 1.0 and read by nothing** - `saleCandidates`
maps the weight away and `carGuideValueYen` uses only "is anyone interested at all". So the numbers
exist and are inert.

**Wire the weight**, so a tier preference becomes a probability rather than a hard gate, and a
channel can widen the pool beyond what the gate allows today. That is the "presence-widening" niche
`sale-value-system.md` §6 gives the free ads paper, and it is what earns that channel its place.

### 3. Channels unlock by named events

**RULED: a locked list, opened by named events**, not by cash and not by a bare reputation number.

This is forced, not preferred. The progression bible's pillar table assigns **clientele quality to
reputation** and forbids **cash** from gating it. A better channel is by definition a better
clientele, so **a channel unlocked by paying a larger fee is illegal**, and fee is the only thing
separating channels today.

The shipped precedent is `storyMission.unlocksAuctionTier`: a named narrative event opens a venue,
which is how auction rooms already work. A magazine editor takes your call. A meet organiser
vouches for you. Both are named, period-real things, which Law 5 requires.

**Unlocks never close.** `sale-value-system.md` §5 rules that unlocks stay ratcheted and what
standing buys is flow. So a channel, once open, stays open, and standing changes **how good the
buyers coming through it are**, not whether the door exists.

That is how the two axes coexist: **named events open doors, standing improves who walks through
them.**

## What must not change

- **The shop front is free, available from day one, and never the best.** Progression bible Law 1:
  nothing basic is ever locked.
- **The trade network keeps a reason to exist**: the fast, taste-blind, no-forecourt exit.
- **`tasteCeiling` stays `.min(1)`.** No channel prices below market through taste.
- **No unlock toast.** Law 4 bans ambient notification. The channel list changing shape on the car
  page is diegetic; a banner announcing it is not.
- **The instant-flip guard stays green.**

## Levers, under R4

Authored in this sprint, every value recorded in the Exit with its reasoning:

- **Buyer pool weights per channel**, six archetypes across five channels.
- **Which channels lock, and behind what named event.** Shop front and trade network stay open;
  the magazine, the meet and the free ads paper are the candidates.
- **The shop front's taste ceiling**, approved to raise conservatively. The maintainer noted that
  **widening who appears may be the better half of the answer** than raising what they pay.
- **How standing improves the buyers a channel draws.**

## Reuse analysis (directive 16)

### Genuinely new

- A buyer-pool weighting per channel.
- A named-event unlock for a channel.
- Standing scaling the quality of who arrives.

### Existing mechanisms reused

- **`pickWeightedCandidate`**, whose draw gains a channel factor and keeps its valuation bias.
- **`Buyer.tierPreferences[].weight`**, already authored, finally read.
- **`storyMission.unlocksAuctionTier`'s pattern**, for the named-event unlock.
- **`SellingChannelsSchema`**, extended rather than replaced.
- **`interestedBuyers`**, whose hard gate becomes a weighting.

### Must NOT be built

- **A sixth channel.** This sprint gives the existing five identities.
- **The fixer, the export container, or the scrapyard.** Later sprints.
- **A "channel unlocked" notification.**

## Tests

- Two channels never produce identical prices on the same car unless they genuinely draw the same
  people. **The magazine and the meet must differ.**
- A kei has a channel that is unambiguously good for it.
- The shop front is usable on day one and is never the best answer.
- Every locked channel opens through a named event, and none of them close.
- **The instant-flip guard is still green.**
- The trade network still has a reason to be chosen.

## Re-derivation

The economy approval-gate hash, `SAVE_VERSION` if `ForSaleEntry` changes shape, both `advanceDay`
goldens, the worked example, which prices every channel on both cars.

Run `pnpm typecheck`. Run content, sim AND game.

## Exit

_To be completed on implementation._
