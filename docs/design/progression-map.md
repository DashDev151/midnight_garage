# The progression map

**Status: factual instrument, drafted 2026-07-22 for the mid-game design session** ("when does
what unlock, how does it feel, what are we missing, what is broken"). Everything here is read
from live code and content with receipts; no design decisions are made in this document. The
holes section is ranked findings, not proposals.

## The career timeline, rung by rung

**Day one (`unknown`, ¥300,000):** one service bay, three parking bays, tier-1 tools on all
six lines (free by law), the local yard open (3 lots day one, ~1.3/day after), service-job
tier 1, missions one and two reachable (gates 0 and 30 rep). Weekly rent ¥20,000.

**`local` (60 rep):** the regional auction opens (~1.1 lots/day). Tool tier 2 becomes
buyable on all lines (¥150,000 wheels to ¥900,000 drivetrain), service bays 2-3 (¥300,000 /
¥750,000), parking 4-7 (¥80,000-220,000), service-job tier 2, missions three and four
(gates 60 / 120).

**`known` (200 rep):** the premium auction (~0.7 lots/day). Tool tier 3 (¥350,000 wheels to
¥1,500,000 engine machine shop), service bays 4-5 (¥1.5M / ¥3M: the biggest fixed purchase
in the game), parking 8-11, service-job tier 3, missions five and six (gates 200 / 320).

**`respected` (500 rep):** the collector-network auction gate opens (SEE HOLE 1). Parking
12-15, service-job tier 4 including the six technique-gated signature jobs (each needs 120
specialty points in its group), missions seven and eight (gates 500 / 800; mission eight
pays ¥3,681,000).

**`legend` (1,400 rep):** staff candidates roll better stats. Nothing else (SEE HOLE 2).

## The cash curve against it

Start ¥300,000; rent ¥20,000/week; wages formula ~¥4,000+/week per hire plus a two-week
introduction fee; the purchase ladder runs ¥80,000 (first parking bay) through ¥3,000,000
(bay five); mission payouts track and outpace the ladder (¥145,000 -> ¥3.68M), making the
campaign the mid-game's bank. Machine-assist fees (¥3,000-18,000/op) are the standing
rent-a-tier valve for players who have not bought tier 2.

## Pacing mechanisms worth knowing cold

- **The classifieds listing gate on tools:** rep-eligible and cash-ready is NOT buyable; a
  listing for that line+tier must be live (4-8 day random gap, 3-day window, one listing
  shop-wide at a time). Tool acquisition is deliberately lumpy.
- **The "one upgrade away" honesty rule:** no service job is ever offered that needs 2+
  tool tiers or 2+ deficient groups (progression bible Law 1, structurally enforced).
- **Specialty moves in lockstep with rep** off the same earned number, split across the
  groups a job touched; 40 points = in-lane margin premium, 80 = title, 100 = bias softcap,
  120 = technique (access-only, gates the signature jobs).

## THE HOLES, ranked

1. **The collector-network tier is structurally empty.** The gate fires at `respected`, the
   catalogue draws only `legend`-rarity models, and the roster content contains ZERO legend
   (and zero gaisha) cars: 26 models split 8/4/9/5 across the four lower rarities. A career
   that earns 500 rep unlocks an auction that will never stock a single lot, day-one batch
   or daily trickle. This also fronts the Hall of Legends problem: the win condition needs
   legend cars that do not exist in content yet.
2. **The `legend` rung (1,400 rep) is vestigial.** It gates staff stat budgets and the
   in-game year formula; no tool, facility, auction, service tier, or mission reads it. The
   top of the ladder rewards nothing.
3. **Three of five staff traits are inert.** `ex-pro-driver` (lap model has no trait
   awareness), `night-owl` (its precondition, evening events, does not exist as a
   mechanic), and `gaisha-fluent` (no gaisha car can ever appear) are hireable, described,
   and mechanically dead. `auction-rat` and `perfectionist` are wired and real.
4. **Gaisha (import) cars are unreachable by any channel:** excluded from auctions by
   design, and the stated alternative ("Import Broker") has zero implementation. Several
   live config curves (offer chances, buyer weights) reference tiers no car occupies.
5. **Auction Guarantors:** fully designed (docs/design/auction-guarantors.md), deliberately
   deferred, zero implementation; the passive rep gate remains the live mechanism.
6. **`AUCTION_TRAVEL_FEE_YEN`** is dead content (already in TODO), superseded by the
   diagnosis visit fees.
7. **Specialty never earns from sales** (deliberate, recorded seam): building and flipping
   a masterpiece feeds no specialty; only customer work does.

## Questions the design session must answer (deliberately unanswered here)

What stocks the collector network before the Hall of Legends content lands, or does its
gate move? What does `legend` mean: a rung with no reward is a promise the game breaks.
Cull or wire the three dead traits? Is the Import Broker v1.0 or is gaisha content cut
until it exists? When do the Guarantors land relative to the mid-game arc? And what does a
career spend money on after bay five (¥3M) if the campaign pays ¥3.68M at mission eight?
