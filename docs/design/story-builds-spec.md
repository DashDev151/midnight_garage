# Story Builds - outcome-based build commissions

*Feature spec, v2 (2026-07-15). Status: NOT yet scoped into a sprint. **Maintainer decision
2026-07-15: this is the first proper progression addition; the Hall of Legends is deferred behind
it.** The v1 open questions are resolved below and marked as such. See "Scope status" for the one
call that remains.*

---

## The fantasy is the spec

A customer walks in and names an **outcome**, not a car:

- "Build me something that laps Kirifuri under 1:20."
- "Build me a car that won't strand my daughter on her drive to college."
- "Get me anything on four wheels, I have almost no money."
- "I want an FD that makes real power and still idles like a street car."

The player owns the whole search: which base car to snipe at auction, which slots to repair, which
parts to fit, at what grade and condition, to satisfy the request under a budget and a deadline,
then hand it back for an agreed profit.

This is deliberately not a fetch quest. Naming the car ("procure an FD") is a filter: the player
computes payout minus known cost and accepts or declines. Naming an outcome is a design problem
with a solution space, and the fun is that the player, not a solver, finds the route through it.
It is the PC-building-sim job ("run this game at 1080p60") translated to cars: many valid builds at
different price-performance points, and finding the efficient one is the game.

## Why it earns its place

**It answers "why am I doing this?"** - the question the loop currently has no answer to. Today the
game is buy, repair, sell, and the number goes up. A story build gives the money a named person
attached to it, and a reason to have hunted that specific car.

- It is an arriving situation that ripples forward: the event/story engine wearing a customer's
  face. Decision-paced, no reflex input, no timing bars. Honors every accessibility pillar as-is.
- Every car built to a named person for a named purpose is a story by construction ("the FD I built
  for the tuner", "the wagon for the kid going to college"). GDD pillar 1 ("every car is a story")
  doing real work instead of flavour text.
- It makes the auction matter. Right now you buy whatever is cheap. A story build tells you what to
  go and *look for*, which is the difference between shopping and hunting.

**One claim from v1 is now stale and is retired here:** the spec said story builds "fix the
flip-loop inversion" because flipping was a net loss. Sprints 59, 66 and 60 rebuilt that economy;
the sensible flip now clears +9.6% to +34.5% of clean value per the coherence table. Story builds
must earn their place as *progression and meaning*, not as an economic patch. They are no longer
load-bearing for the economy and should not be justified as if they were.

## Scope status (one call still open)

The GDD ships `commissions` (§12.2, roadmap Sprint 14). A story build is "a commission whose
acceptance criterion is an outcome predicate instead of a specific car" - which reads as an
extension of canonical scope, needing a sprint but no GDD amendment.

**Recommended: extension.** The maintainer's 2026-07-15 call ("the first proper progression
addition I want to add is Story missions") settles that it ships in v1.0. What still wants an
explicit yes: the **reference-lap board** is genuinely new mechanic surface with no GDD line, so it
either rides in under commissions or earns a one-line GDD note. Do not let it ride along as assumed
scope - that is exactly the failure `IDEAS.md`'s parking-lot rule exists to prevent.

---

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (map onto these before writing a line):**

- **Offer generation / arrival stream.** The service-job offer stream already generates, gates by
  tier/reputation, caps by day (Sprint 52), and expires. A story build is a new offer *kind* on the
  same stream, not a second inbox.
- **The auction loop, untouched.** Procurement is the existing hunt.
- **Band-repair + installs.** The build phase is the existing repair-to-target-band and
  part-install economy. No new build machinery.
- **`computeDerivedStats`.** Power, handling, style, reliability, authenticity are all live and
  band-derived. The predicate reads these; it does not invent a parallel stat model.
- **Buyer archetypes + taste.** The commissioning customer IS a buyer archetype. `statWeights`
  already encode what they care about; `valuateCarForBuyer` already prices taste.
- **Sprint 42 per-car ledger.** `budgetCap` reads `carLedgerFor` - purchase + repairs + parts are
  already tracked per car. No new bookkeeping.
- **Sprint 57 job ledger + `JobCompleteModal`.** Delivery is a close-out with a receipt; both exist.
- **Sprint 68's `SaleResultView`/modal shape** for the delivery receipt.
- **`deriveServiceJobPayoutYen` + the Law 4 margin floor.** The customer's price derives the same
  way, through the same profitability invariant.

**Genuinely new:**

1. A composable **`Requirement`** type: constraint primitives plus a pure pass/fail predicate.
2. A **cross-phase contract** spanning procurement to delivery (accept -> bind car -> deliver /
   lapse), which no existing system spans.
3. The **reference-lap board**: a curated comparables UI plus one pure lap-time model.
4. The **lapse branch** and its consequences.

---

## The `Requirement` primitive (the anti-parallel-system move)

The four example requests are not four features. They are four **constraint shapes** from one
composable set, so a lap-time job and a daughter's-commuter job are the same machine with different
predicates. New request types stay *content*, not code.

Each primitive is a pure `(car, ledger, day) => boolean` plus a human-readable label:

| Primitive | Meaning | Reads |
|---|---|---|
| `statThreshold` | derived stat at or above X | `computeDerivedStats` |
| `statCeiling` | derived stat at or below X | `computeDerivedStats` |
| `reliabilityFloor` | reliability at or above X | `computeDerivedStats` |
| `budgetCap` | total spend at or under ¥X | `carLedgerFor` |
| `deadline` | delivered on or before day D | `state.day` |
| `tasteMatch` | archetype taste-fit at or above X | `valuateCarForBuyer` |

A `Requirement` is an AND of primitives; grading is the conjunction. The four examples:

- **Lap under y**: `statThreshold(lapTime)` + `budgetCap` + `deadline`
- **College commuter**: `reliabilityFloor` + `budgetCap` (low) + `tasteMatch(First-timer)` + `deadline`
- **Near-zero budget**: `budgetCap` (very low) + a roadworthy floor + `deadline`
- **Street-power FD**: `statThreshold(power)` + `statCeiling(harshness proxy)` +
  `tasteMatch(Tuner)` + `budgetCap` + `deadline`

> **RESOLVED (v1 open question 3).** `reliabilityFloor` is a clean read. `computeDerivedStats`
> already returns reliability as `reliabilityFraction * reliabilityCap`, band-derived and weighted
> per stat. No running-condition concept is needed and none should be invented.
>
> Grip tier is likewise clean: it is the fitted tyres' catalog `grade` (stock/street/sport/race),
> not a new axis. Weight is `model.spec.curbWeightKg`.

## Budget and deadline are the dilemma, not garnish

A lone `statThreshold` is solvable - a derived stat usually has one cheapest way to max it, so the
request is boring on its second sighting. Pairing every objective with a budget cap and a deadline
turns one answer into a **Pareto frontier**: "lap under y" is solved; "lap under y, under ¥X, by day
D" has no single answer, and different players land on different points of it. **Budget is what
converts a threshold into a bet.**

The build must offer multiple routes to the same target, or the parts list is solved:

- A junkyard turbo and a crude tune hits the power number cheap and pads margin, but tanks
  reliability - which a Tuner who also street-drives it feels at delivery (taste + reliability).
- A clean build earns less cash but more reputation and specialty.

Because the buyer is *known*, this tension can be sharper than on an open-market flip without
feeling random.

**Sprint 66's expectation bands make this sharper for free.** A story build is a licence to spend
past a car's expectation band: normally that is passion spend at a loss, but here a named buyer is
paying for exactly that. The economy already grew the hook - a story build is the first thing that
hooks onto it.

---

## Grading transparency: the reference-lap board

Deliberately in the middle - not fully visible, not hidden:

- **Transparent:** the player always sees their own three tracked figures - **power, weight, grip
  tier**. Three vars only; more axes make the board unreadable.
- **Semi-hidden:** the *mapping from those figures to a lap time* is what the player triangulates,
  using a board of reference cars with published times. They reason like an enthusiast ("my car is
  900kg / 280ps on sport tyres; here is a 896kg / 280ps / sport-tyre reference at 1:23, so I am
  about there; I need 1:20, so add power"), rather than reading a solver's output.

Fully-visible predicted time evaporates the search; fully-hidden is a dice roll players resent under
the no-reflex pillar. Comparables keep the player's own reasoning as the interface, and residual
uncertainty then lives in the *car* - which is where the drama belongs (see Diagnosis, below).

### The grip-delta anchor (maintainer decision, kept)

Grip is a tier enum, not a clean scalar, so it muddies three-axis interpolation. Solve it with an
**identical reference car published in every tyre tier**: same chassis, same power, same weight, one
row per grip level. The player reads the delta each tier brings off that anchor and applies it to
their own build. The rest of the comparables are matched or weighted within a grip tier, so the
player interpolates in two continuous dimensions plus one well-understood offset.

### Board design rules

- **Curate, do not dump.** 3 to 5 hand-picked comparables that *straddle* the player's figures (at
  least one a touch faster, one a touch slower). A full database is a spreadsheet lookup; a handful
  of neighbours is "read the room".
- **Diegetic wrapper.** Magazine feature times and touge-legend runs, not a stats readout. "Culture
  is the content" doing real work.
- **Tuned for readability, not fidelity.** Monotonic and roughly separable: more power always helps,
  less weight always helps, higher grip always helps, in predictable amounts. A physically accurate
  model the player cannot reason across is worse than a simple power-to-weight-times-grip curve they
  can. One pure function, all coefficients in economy JSON.

> **RESOLVED (v1 open question 1).** Reference times are **synthetic from our own lap model**, with
> a hand-authored, diegetically-named set layered on top and the grip anchor authored explicitly.
> Synthetic gives density around any player's figures; real period times would be a research burden
> and would only cover cars that exist.
>
> The honest cost of that choice, recorded rather than hidden: the comparables are then **our own
> formula echoed back**, which is a subtler solver. The mitigation is the curation rule above - a
> straddling handful, not a queryable table - plus the fact that the player's own car's figures are
> uncertain until inspected. If it still reads as a lookup in playtest, the fix is fewer
> comparables, not a more complex model.

## Where uncertainty lives

Keep the grading honest and visible; put the gamble in the acquisition. **This is now a hard
dependency, not an argument:** an FD that turns out to need more than apex seals is the drama this
feature wants, and it only exists if `diagnosis-spec.md` ships. Without hidden base-car condition, a
story build is a solved shopping list - the player reads the board, reads the auction card's exact
bill, and computes the answer.

**Order matters: diagnosis first, then story builds.** They interlock; shipping story builds onto a
transparent auction would deliver the weakest version of the feature and teach us the wrong thing
about it.

The requirement stays "I could have inspected harder", never "the dice screwed me".

## The lapse branch (what makes accepting a decision)

If accepting is risk-free, the whole thing deflates into free money. Two failure modes give the
"yes" real weight:

- **Never acquired under budget.** No suitable base car won under the cap before the deadline.
- **Deadline lapse.** The build runs long.

Consequence: the player holds a car built to **one specific person's taste**, which the open market
prices through exactly the taste mismatch the commission encouraged them to lean into (a peaky Tuner
build is a hard sell to anyone else). A partial goodwill / reputation ding on lapse, plus the
taste-mismatched fallback sale, is enough. Accepting a commission **spends risk; it does not print
money.**

> **RESOLVED (v1 open question 4).** The customer's price derives from the *target* car's guide
> value plus a rolled margin, through `deriveServiceJobPayoutYen`'s existing shape and gated by the
> same Law 4 profitability floor - never authored, and structurally incapable of promising a
> guaranteed loss. The budget cap is a separate, *lower* number: the customer's price is what they
> pay you; the budget cap is what they will tolerate you spending. The gap between them is the
> margin, and squeezing it is the game.

---

## Open questions (resolve before sprinting)

1. **Scope path for the reference-lap board** - rides under commissions, or a one-line GDD note?
   See Scope status.
2. **Does a story build bind ONE car, or grade whatever the player hands over?** Binding is clearer
   ("this is the FD for Tanaka") and makes the lapse branch legible. Grading-any is more flexible
   and less bookkeeping. Leaning: bind on delivery, not on acquisition - the player should be free
   to change their mind about which car fulfils it right up to the hand-back.
3. **Do story builds and service jobs share the offer cap?** They are on one stream; if they share
   Sprint 52's `offerCountCapByDay`, a story build crowds out paying work, which is a real and
   possibly good tension. Decide explicitly.
4. **Reputation/specialty on delivery** - same curve as a service job, or a premium for the harder
   contract? A story build is strictly more work than a task list.

## Definition of done

- One `Requirement` type with the composable primitives above; grading is a pure predicate; a unit
  test per primitive and per example request shape.
- Story-build offers generate on the existing service-job stream, tier/reputation gated, with
  derived (not authored) customer prices and a profitability floor.
- Reference-lap board renders a curated straddling comparable set plus the all-tyres grip anchor;
  lap model is one pure function with JSON coefficients and a golden test.
- Full contract lifecycle: accept -> bind fulfilling car -> deliver (grade, pay, reputation +
  specialty) or lapse (fallback to taste-mismatched open sale + goodwill ding).
- Balance harness: at least one bot can complete a story build; the feature does not hand free money
  (lapse and budget caps bite); disclosed figures in the report. **Note the prerequisite:** no bot
  can currently choose a repair depth or install an aftermarket part (`TODO.md` findings 2 and 5),
  so no bot can build to a spec. Either the harness rework lands first, or this DoD line is honestly
  marked unmet rather than force-passed.
- No em dashes, no decorative Unicode, all tunable numbers in `packages/content`, yen throughout.
