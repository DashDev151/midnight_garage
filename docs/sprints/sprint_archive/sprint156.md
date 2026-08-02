# Sprint 156: a channel is a buyer base

**Status: IMPLEMENTED, READY FOR REVIEW.** Design of record:
`docs/design/systems/listing-channels.md`.

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

**Done. Ready for review. Not committed.**

### What a channel is now

A channel carries a **buyer pool** (`buyerPoolWeights`, one draw multiplier per archetype) and a
**reach** (`poolWidening`, the weight an archetype with no stated interest in the car's tier still
draws at). The draw weight in `pickWeightedCandidate` is

```text
valuation(buyer) x tierPreferenceWeight(buyer, tier) x buyerPoolWeights[archetype] ^ focusExponent
```

with `tierPreferenceWeight` falling back to the channel's `poolWidening` when the buyer states no
preference. The valuation term is **multiplied**, never replaced, so the size bias holding the
instant-flip guard closed is untouched by construction.

### The levers, with reasoning (R4)

**1. `sellingChannels[*].buyerPoolWeights` (NEW).** Over collector / tuner / stancer / racer /
first-timer / kei-specialist:

| Channel | collector | tuner | stancer | racer | first-timer | kei-specialist |
|---|---|---|---|---|---|---|
| `shopFront` | 1 | 1 | 1 | 1 | 1 | 1 |
| `freeAdsPaper` | 0.4 | 0.5 | 0.5 | 0.2 | 1.6 | 1.4 |
| `tunerMagazine` | 0.15 | 1.8 | 0.6 | 1.4 | 0.05 | 0.05 |
| `weekendMeet` | 0.3 | 1.2 | 1.8 | 0.5 | 0.1 | 0.8 |
| `tradeNetwork` | - | - | - | - | - | - |

`tradeNetwork` carries no pool at all: it has no persona, and the schema forbids one on a
`priceBand` channel.

- **Shop front flat at 1.** A forecourt favours nobody; whoever walks past, walks past. Flatness is
  load-bearing twice over: it is why the free channel is never the best (the right buyer is no more
  likely than the wrong one), and it is why standing cannot improve it (below).
- **Free ads paper leans practical.** First-timer 1.6 and kei-specialist 1.4 are the people who buy
  a car out of the classifieds. Collector 0.4 is deliberate and was raised from a first-pass 0.2:
  combing small ads for an unmolested survivor is exactly what a collector does.
- **Tuner magazine leans at numbers.** Tuner 1.8 and racer 1.4 are its readership. Collector 0.15
  was **lowered from a first-pass 0.4 by measurement**: at 0.4 the magazine's most likely buyer for
  a mint original kei was a collector, which is the wrong readership for a tuning monthly. The two
  practical archetypes sit at 0.05, not 0, so the channel is thin for them rather than dead.
- **Weekend meet leans at stance.** Stancer 1.8, tuner 1.2, kei-specialist 0.8: a car park on a
  Sunday night. Kei-specialist at 0.8 is the design's kei answer at the top of the ladder.

**2. `sellingChannels[*].poolWidening` (NEW).** freeAdsPaper 0.5, weekendMeet 0.4, shopFront 0.35,
tunerMagazine 0.25. This is what makes `Buyer.tierPreferences[].weight` a probability instead of a
wall, and it is ordered by how far each channel genuinely reaches past the people already looking
at that league of car: the paper widest, because presence-widening is the niche
`sale-value-system.md` §6 gives it; the meet next, because everyone parked there sees everything;
the shop front next, because anyone can walk in; the magazine narrowest, a national title with a
specific readership. **The magazine's 0.25 is not decoration.** At 0 the magazine could never see
an `entry`-tier car at all, which would make a tuned Alto Works invisible to the exact people who
want it. Widening plus `matchedOnly` gets both halves right: the tuner can see the kei, and a
*stock* kei fails their visible want, so the ad draws nobody.

**3. `selling.channelStandingFocusByReputationTier` (NEW).** unknown 1, local 1.2, known 1.45,
respected 1.7, legend 2. The exponent every `buyerPoolWeights` entry is raised to. A weight above 1
grows under it and a weight below 1 shrinks, so standing sharpens a channel toward its own crowd
without opening a door or adding a yen to any price - which is exactly what
`sale-value-system.md` §5 rules standing buys. Exactly 1 at `unknown`, so a new career draws every
pool as authored. **A flat pool is mathematically untouched by any exponent, so the free shop front
never improves.** That is the design, not a coincidence of the values.

**4. `StoryMission.unlocksSellingChannel` (NEW).** `low-and-loud` opens `weekendMeet`;
`street-power-street-manners` opens `tunerMagazine`. Both missions' `deliveredCopy` gains the
sentence that hands the introduction over, since the mission's own line is where the door opens in
fiction:

- `low-and-loud`: "...We park up at the bay-side PA on Sunday nights. Bring something worth looking
  at and I'll tell them whose work it is."
- `street-power-street-manners`: "...There's an editor at one of the tuning monthlies who still
  owes me a favour. Expect a phone call."

Daisuke is the shakotan customer and the meet is the stance channel; Gen is the tuner and the
magazine is the tuner channel. Each unlock is named, period-real and voiced by the person whose
scene it is (Law 5), and the meet (¥3,000) opens before the magazine (¥12,000).

**Which channels lock, and why only two.** Shop front, free ads paper and trade network stay open
from day one. The two locked channels are precisely the two whose `tasteCeiling` clears 1.00, so
the open/locked line is the progression bible's own line: a better price for the same car is
clientele quality, which the pillar table assigns to reputation and forbids cash from gating. Law 1
(nothing basic is locked) and Law 2 (early difficulty is scarcity, not walls) are why the paper
stays open rather than joining them: a day-one shop gets three genuinely different ways to sell,
none of which charges for standing.

### Levers deliberately NOT moved

`tasteCeiling` on any channel, **including the shop front's 1.00** which R4 covered. The
maintainer's own note that "widening who appears may be the better half of the answer" is right,
and it is the half that was taken. No fee moved, no cadence moved, `matchedOnly` and
`requiresForecourt` are untouched everywhere, and `expectationByTier`, generation and the damage
patterns were not touched at all.

### The measurements

**The magazine and the meet no longer agree.** Regenerated worked example, both cars, each channel
priced through the buyer that channel itself brings:

| | shop front | free ads paper | tuner magazine | trade network | weekend meet |
|---|---|---|---|---|---|
| Wagon R (entry/kei) | First-timer ¥225,094 | First-timer ¥236,349 | Tuner ¥224,587 (taste 0.9977: fails the matched gate) | the trade ¥225,094 | **Kei Specialist ¥239,769** |
| Silvia S13 (everyday/drift) | Kei Specialist ¥408,733 | First-timer ¥429,170 | Tuner ¥448,745 | the trade ¥408,733 | **Shakotan ¥460,775** |

Which of the two premium channels pays more now depends on the car, not the fee.

**The kei answer.** Tidy Wagon R, 200 seeded days through the real draw:

| Channel | draws | mean offer | yen per listed day |
|---|---|---|---|
| `shopFront` | 96/200 | ¥218,731 | ¥104,991 |
| `freeAdsPaper` | 200/200 | ¥227,155 | **¥227,155** |
| `tunerMagazine` | 18/200 | ¥235,466 | ¥21,192 |
| `tradeNetwork` | 200/200 | ¥226,433 | ¥226,433 |
| `weekendMeet` | 87/200 meet days | **¥237,873** | not comparable (one draw a week) |

The free ads paper is the unambiguous day-one answer for a kei: 2.16x the shop front per listed
day, 10.7x the magazine, at an eighth of the magazine's fee. The weekend meet pays the most per
offer of any channel once it opens. Disclosed rather than smoothed over: **the trade network is
within 0.3% of the paper on this car**, which is the trade keeping its reason to exist rather than
a defect, and the gap widens on a car whose crowd actually wants it (Silvia: paper ¥429,170 against
trade ¥408,733).

**The instant-flip guard is green**, re-measured rather than assumed. Medians move because the
walk-in now reads each archetype's own tier-preference weight: entry -1.68%, everyday -0.92%,
enthusiast -0.99%, flagship +1.87%, against a bound of 0.10. Flagship is the one tier that moved
materially (+1.05% before), because the collector states the strongest flagship preference of any
archetype (0.8, against tuner 0.6, racer 0.5, stancer 0.3) and is exactly who pays most for an
untouched original. It sits five times inside the bound.

### Re-derivation

| Pin | Old | New |
|---|---|---|
| `economy.json` approval hash | `35c62a03...ca778e8` | `a43d34af...0dcd252d` |
| `advanceDay` 30-day golden | `90b8b963` | **unchanged** |
| `advanceDay` acquisition-to-sale golden | `5f377288` | **unchanged** |
| `SAVE_VERSION` | unchanged | `ForSaleEntry` did not change shape |
| `damagePatterns.json` / `partPricing.json` hashes | unchanged | not touched |
| Mission payouts and budget caps | unchanged | not touched |
| Worked example | regenerated | channel table now names who each channel brings |

Both goldens held because neither scripted career's offer draw falls on a pool the weighting
reorders. Checked, not assumed.

### Checks

```text
pnpm typecheck            content Done / sim Done / game Done
pnpm test --project content   26 files, 569 tests passed
pnpm test --project sim       76 files, 2022 tests passed
pnpm test --project game      62 files, 837 tests passed
pnpm format                   All matched files use Prettier code style
pnpm lint                     clean
```

### Stale assertions corrected (directive 17 case (a))

- `schemas.test.ts`: the five channel shapes gained their pool fields, plus the new standing table.
- `selling.test.ts`: `stateWithCar` now defaults to every channel-opening mission delivered
  (derived from the shipped campaign, not by mission id), because five listing tests about fees and
  clocks were listing on channels that are now earned. The unlock behaviour has its own block that
  asserts against `storyMissions: []`.
- `workedExample.test.ts`: "every channel with headroom above 1 quotes at or above it" was true only
  while every channel drew the same fixed buyer. It is replaced by the genuine invariants (the
  trade network has no persona, the shop front's taste never exceeds 1, every quote sits inside
  `[1 - tasteSpread, ceiling]`) plus a new test that the magazine and the meet never agree.
- `CarDetailScreen.test.ts`: "renders all five channel options" became "renders the day-one channel
  options", plus a new test that the list grows when a mission delivers and one that the audience
  line renders.

### What was built

- `packages/content/src/economy.ts`: `BuyerPoolWeightsSchema`, `buyerPoolWeights`/`poolWidening` on
  `SellingChannelSchema` (with a refine that a persona channel must state its pool and a `priceBand`
  channel may state neither), `selling.channelStandingFocusByReputationTier`.
- `packages/content/src/storyMission.ts`: `unlocksSellingChannel`, refined so no mission can claim
  an always-open channel - Law 1's floor lives in content, not in a list of exceptions in code.
- `packages/sim/src/bidding.ts`: `tierPreferenceWeight` extracted, so the auction gate and the
  selling weighting read one rule.
- `packages/sim/src/selling.ts`: `ChannelDrawWeighting`, `channelDrawWeighting`, a weighted
  `saleCandidates`, the composed draw in `pickWeightedCandidate`, `likelyChannelBuyer` (the
  deterministic mode of that draw), `isSellingChannelUnlocked`, and the unlock gate in
  `resolveSetForSale`.
- `packages/sim/src/workedExample.ts` + `workedExampleDoc.ts`: each channel quotes through its own
  likely buyer, and the table names them.
- `packages/game`: `availableSellingChannelIds` on the store, the picker filtered to it, and a
  `sellingChannelAudienceLabel` derived from the pool weights so the picker shows who reads each
  channel. No unlock toast: the list changing shape is the signal (Law 4).
