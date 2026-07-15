# Story Builds - outcome-based build commissions

*Feature spec, first draft. Status: NOT yet scoped into a sprint and NOT in the frozen v1.0 GDD.
Before this becomes a sprint it needs one scope decision (see "Scope status" below): whether it
extends the already-shipped `commissions` concept (in-GDD, canonical) or is new enough surface to
land as an `IDEAS.md` entry plus a GDD amendment first. This doc is the design; the scope call is
the maintainer's.*

---

## The fantasy is the spec

A customer walks in and names an **outcome**, not a car:

- "Build me something that laps Kirifuri under 1:20."
- "Build me a car that won't strand my daughter on her drive to college."
- "Get me anything on four wheels, I have almost no money."
- "I want an FD that makes real power and still idles like a street car."

The player owns the whole search: which base car to snipe at auction, which slots to repair,
which parts to fit, at what grade and condition, to satisfy the request under a budget and a
deadline, then hand it back for an agreed profit.

This is deliberately not a fetch quest. Naming the car ("procure an FD") is a filter: the player
computes payout minus known cost and accepts or declines. Naming an outcome is a design problem
with a solution space, and the fun is that the player, not a solver, finds the route through it.
It is the PC-building-sim job ("run this game at 1080p60") translated to cars: many valid builds
at different price-performance points, and finding the efficient one is the game.

## Why it earns its place (which pillars it serves)

- It fixes the flip-loop inversion. Today the fantasy path (hunt and flip) is a net loss and the
  grind (service jobs) pays. A story build is a flip with a **pre-committed buyer at a known
  price**, so the fantasy activity finally has a positive gradient without breaking the open
  market.
- It is an arriving situation that ripples forward: the event/story engine wearing a customer's
  face. Decision-paced, no reflex input, no timing bars. Honors every accessibility pillar as-is.
- Every car built to a named person for a named purpose is a story by construction ("the FD I
  built for the tuner," "the wagon for the kid going to college"). That is GDD pillar 1 ("every
  car is a story") doing real work instead of flavor text.

## Scope status (read before scheduling)

The GDD ships `commissions` already. If a story build is "a commission whose acceptance criterion
is an outcome predicate instead of a specific car," this extends existing canonical scope and
needs no GDD change, only a sprint. If the reference-lap board and the composable requirement
system read as genuinely new mechanic surface, it wants an `IDEAS.md` entry and a GDD amendment
first, the same path the drive-mode spec took. Decide this explicitly; do not let it ride along as
assumed scope (the exact failure `IDEAS.md`'s parking-lot rule exists to prevent).

---

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (map onto these before writing a line):**

- **Offer generation / arrival stream.** The service-job offer stream already generates, gates by
  tier/reputation, and surfaces daily offers. A story build is a new offer *kind* on the same
  stream, not a second inbox.
- **The auction loop, untouched.** Procurement is the existing hunt: snipe a base car at auction.
  No new acquisition path.
- **Band-repair + installs.** The build phase is the existing repair-to-target-band and
  part-install economy. No new build machinery.
- **`computeDerivedStats`.** Power, weight, and grip tier are (or derive from) existing stats.
  The requirement predicate reads these; it does not invent a parallel stat model.
- **Buyer archetypes + taste.** The commissioning customer IS a buyer archetype (Tuner, Collector,
  First-timer, ...). Their `statWeights` already encode what they care about. The taste system
  decides the on-delivery quality/reputation delta and the open-market fallback price.
- **Sprint 42 per-car ledger.** Projected profit, purchase, repair spend, and part spend are
  already tracked per car. The commission's margin readout is that ledger, not new bookkeeping.
- **Content law / economy JSON.** Every number below lives in `packages/content`, not code.

**Genuinely new mechanisms:**

1. A **composable `Requirement` type**: a small set of constraint primitives a request assembles
   from, with a pure predicate that grades any candidate car pass/fail.
2. A **cross-phase commission contract** that spans procurement to delivery (accept -> which owned
   car fulfills this -> deliver / lapse), which no existing system spans.
3. The **reference-lap benchmark board**: a curated comparables UI plus one pure lap-time model.
4. The **lapse / fall-through branch** and its consequences.

Everything else is content and wiring over the above.

---

## The `Requirement` primitive (the anti-parallel-system move)

The four example requests are not four features. They are four **constraint shapes** built from
one composable set of primitives, so a lap-time job and a daughter's-commuter job are the same
machine with different predicates. This keeps new request types as *content*, not code.

Primitive constraints (each a pure `(car, ledger, day) => boolean` plus a human-readable label):

| Primitive | Meaning | Example use |
|---|---|---|
| `statThreshold` | derived stat at or above X | lap time at or under 1:20 (a stat floor) |
| `statCeiling` | derived stat at or below X | keep it under 300ps for the insurance-shy buyer |
| `reliabilityFloor` | reliability at or above X | the college commuter |
| `budgetCap` | total spend (from the ledger) at or under ¥X | near-zero-budget request |
| `deadline` | delivered on or before day D | every request, softly |
| `tasteMatch` | archetype taste-fit at or above X | "and make it feel like a real tuner car" |

A `Requirement` is an AND of primitives. Grading is the conjunction of their predicates. The four
example requests:

- **Lap under y**: `statThreshold(lapTime)` + `budgetCap` + `deadline`.
- **College commuter**: `reliabilityFloor` + `budgetCap` (low) + `tasteMatch(First-timer)` +
  `deadline`.
- **Near-zero budget, any car**: `budgetCap` (very low) + a roadworthy-floor + `deadline`.
- **Street-power FD**: `statThreshold(power)` + `statCeiling(harshness/idle proxy)` +
  `tasteMatch(Tuner)` + `budgetCap` + `deadline`.

## Budget and deadline are not garnish, they are the dilemma

A lone `statThreshold` is solvable: a derived stat usually has one cheapest way to max it, so the
request is boring on its second sighting. Pairing every objective with a budget cap and a deadline
turns a single answer into a **Pareto frontier**: "lap under y" is solved; "lap under y, under ¥X,
by day D" has no single answer, and different players land on different points of it. Budget is
what converts a threshold into a bet.

The build itself must also offer multiple valid routes to the same target, or the parts list is
solved:

- A junkyard turbo and a crude tune hits the power number cheap and pads margin, but tanks
  reliability, which a Tuner who also street-drives it will feel at delivery (taste + reliability).
- A clean build earns less cash but more reputation and specialty.

Because the buyer is *known*, we can afford to make this tension sharper than on an open-market
flip without it feeling random.

---

## Grading transparency: the reference-lap board

The chosen model is deliberately in the middle, not fully visible and not hidden:

- **Transparent:** the player always sees their own three tracked figures - **power, weight, grip
  tier**. (Three vars only; more axes make the board unreadable.)
- **Semi-hidden:** the *mapping from those figures to a lap time* is what the player triangulates,
  using a board of reference cars with published times. They reason like an enthusiast ("my car is
  900kg / 280ps on sport tyres; here is a 896kg / 280ps / sport-tyre reference at 1:23, so I am
  about there; I need 1:20, so add power"), rather than reading a solver's output.

This is the sweet spot: fully-visible predicted time evaporates the search; fully-hidden is a dice
roll players resent under the no-reflex pillar. Comparables keep the player's own reasoning as the
interface, and all residual uncertainty can then live in the *car* (how rough the base actually
snipes), which is where the drama belongs.

### The grip-delta anchor (maintainer decision)

Grip is a tier enum (street / sport / race), not a clean scalar, so it muddies three-axis
interpolation. Solve it with an **identical reference car published in every tyre tier**: same
chassis, same power, same weight, one row per grip level. The player reads the delta each tier
brings off that anchor and applies it to their own build. The rest of the comparables can then be
matched or weighted within a grip tier, so the player is really interpolating in two continuous
dimensions (power, weight) plus one well-understood offset.

### Board design rules

- **Curate, do not dump.** Show a small, hand-picked comparable set (3 to 5) that *straddles* the
  player's current figures (at least one a touch faster, one a touch slower). A full-database table
  is back to a spreadsheet lookup; a handful of neighbors is "read the room."
- **Diegetic wrapper.** These are magazine feature times and touge-legend runs, not a stats
  readout. That is the "culture is the content" pillar doing real work.
- **The lap model is tuned for readability, not fidelity.** It must be monotonic and roughly
  separable: more power always helps, less weight always helps, higher grip always helps, in
  predictable amounts. A physically accurate model the player cannot reason across is worse than a
  simple power-to-weight-times-grip curve they can. Fidelity is the enemy of fun here. One pure
  function, all coefficients in economy JSON.

## Where uncertainty lives (and the case for hidden base-car condition)

Keep the grading honest and visible; put the gamble in the acquisition. The strongest argument for
reintroducing some form of the paused hidden-condition / inspection system is exactly this: an FD
that turns out to need more than apex seals is the drama this feature wants, **as long as it reads
as "I could have inspected harder," not "the dice screwed me."** Decision-paced, no reflex: the
player chooses how much to inspect before bidding, and lives with the information they bought.

## The lapse branch (what makes accepting a decision)

If accepting a commission is risk-free, the whole thing deflates into free money. Two failure
modes give the "yes" real weight:

- **Never acquired under budget.** The player cannot win a suitable base car under the budget cap
  before the deadline.
- **Deadline lapse.** The build runs long.

Consequence: the player is left holding a car built to **one specific person's taste**, which the
open market then prices through exactly the taste mismatch the commission encouraged them to lean
into (a peaky Tuner build is a hard sell to anyone else). A partial goodwill / reputation ding on
lapse, plus the taste-mismatched fallback sale, is enough. The point is that accepting a commission
spends risk, it does not print money.

---

## Open questions (resolve before sprinting)

1. **Reference data source.** Real period lap times for roster cars (authentic, but a research
   burden and only covers cars that exist) versus synthetic times generated from our own lap model
   (always dense around the player's figures, but then the "comparables" are our own formula echoed
   back, a subtler solver). Leaning: synthetic for density with a hand-authored, diegetically named
   set on top, and the grip-delta anchor authored explicitly. Confirm.
2. **Scope path.** Commission-extension (sprint only) or new-surface (IDEAS.md + GDD amendment)?
   See Scope status.
3. **Reliability / "won't break" as a predicate.** Is `reliabilityFloor` a clean read off
   `computeDerivedStats`, or does "won't strand her" want a running-condition concept the sim does
   not model yet? If the latter, that is its own scope, flag it.
4. **How the customer's price is set.** Derived from guide value plus a margin, the same way
   service-job payouts are derived (retiring any authored-number risk), and gated so it cannot
   promise a guaranteed loss.

## Definition of done (when this is real)

- One `Requirement` type with the composable primitives above; grading is a pure predicate; a unit
  test per primitive and per example request shape.
- Story-build offers generate on the existing service-job stream, tier/reputation gated, with
  derived (not authored) customer prices and a profitability floor.
- Reference-lap board renders a curated straddling comparable set plus the all-tyres grip anchor;
  lap model is one pure function with JSON coefficients and a golden test.
- Full contract lifecycle: accept -> bind fulfilling car -> deliver (grade, pay, reputation +
  specialty) or lapse (fallback to taste-mismatched open sale + goodwill ding).
- Balance harness: at least one bot can complete a story build; the feature does not hand free
  money (lapse and budget caps bite); disclosed figures in the report.
- No em dashes, no decorative Unicode, all tunable numbers in `packages/content`, yen throughout.
