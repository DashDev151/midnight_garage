# The scrapyard and donor lots

Design of record for the donor species and its venue (Workstream C of
`docs/reviews/economy-overhaul-brief.md`, decisions D2 and D9). Design only: no lever
moves here.

## 1. What a donor is, arithmetically

Value is clean minus 1.3 times the remaining bill, floored at the scrap fraction. The
waterline is therefore **bill above roughly 0.73 of clean**: past it the car pins to the
floor and repair yen return nothing until enough bill clears to surface again. A donor is
a car generated deliberately past that line. Nothing new is needed to express one; the
floor has always been there, guarding a case generation was forbidden to produce.

## 2. What it fixes, in order of importance

1. **It gives the buy decision teeth.** Every auction lot today is profitably
   restorable, so "should I buy this" is rarely a real question and inspection is
   optional trivia. A room that can hand you a car worth less than its bill makes
   passing a real move and makes diagnosis protect the purchase, which was always its
   job.
2. **It makes labour scarce, which nothing currently does.** Stripping a donor costs a
   day of the pool and a bay. That creates the game's first repeating, voluntary contest
   for labour: buy the part with cash and fit it now, or spend a day pulling it out of a
   dead car for a fraction of the price. Every other labour sink in the game is
   mandatory, so labour has had no opportunity cost; this one is chosen, which is what
   gives it a price.
3. **It gives cheap cars a second role.** A kei too far gone to flip is still a box of
   parts, so the bottom of the market stops being purely graduation fodder.

## 3. The loop at the yard, and how it feels

You are not buying a car. You are buying **contents**, and the skill is seeing what is
alive inside something dead.

- **The information game inverts.** At auction you buy a car and fear what is hidden. At
  the yard you buy a carcass and hope. The car is open, stripped, obviously finished;
  what you can see, you see for free. What is sealed (the block's internals, the
  gearbox) is the bet. So the yard needs no symptom ladders: its uncertainty is
  physical, not diagnostic.
- **The find is the fantasy.** A mint gearbox behind a grenaded block is the whole
  reason to walk the rows. The same shell with everything at poor is scenery, and being
  able to tell those apart before paying is the mastery curve.
- **Value lands by filling holes.** Installing a harvested part into an empty or scrap
  slot beats selling it by 4.3x to 5.4x, but beats an already-repairable part by only
  1.13x. Donors feed rebuilds; they do not feed an upgrade habit and they do not feed a
  parts-sales business. This is already true of the shipped constants and needs no lever
  moved to stay true (D2).
- **It ends honestly.** The stripped shell is scrapped through the existing flow. The
  car came in dead and leaves as an empty hull; nothing lingers.

## 4. Generation, ranked by what actually works

The brief names four routes. They are not equal, and the differences are load-bearing:

| Route | Status | Note |
| --- | --- | --- |
| **Catastrophe, disclosed** | Works today | The existing catastrophe rungs (scrap block, gearbox, differential, chassis) on a cheap car, stated on the sheet rather than hidden behind a symptom. At auction a catastrophe is a hidden risk; here it is the reason the car is on the yard. |
| **Structural rot** | Works today | Ruined-past-repair metal and a rotten underbody force replacement rather than repair. Note `bodywork` is not a foundation part, so the foundation-law withholding runs through the `chassis` slot only. |
| **Absence, the stripped shell** | Needs authoring | `missingSlotWeightByPart` is zero for block, chassis, bodywork, paint and forced induction, so "someone already took the good bits" is currently unreachable. New weights, scoped to this species only. |
| **Mileage** | Not a route | The clean-value curve floors at 0.75 at any odometer, so mileage alone cannot sink a car. It is a **modifier** that deepens a donor made by another route, and should be described as one. |

A donor generates by choosing one route (or blending rot with absence), targeting a bill
above the model's own break-even ratio. That target must be **built**: the shipped
`donorBreakEvenBillRatio` is a hand-typed global, and `computeDonorBalanceProbe` measures
a clean, all-mint, zero-kilometre car and never reads it. The instrument to extend is
`computeGeneratedLotPlayRanking`, which already runs net-against-net across thousands of
real generated lots, and which will fail the moment a donor exists unless it is scoped to
auction lots in the same change.

## 5. The venue

- **Fixed price, no bidding.** Nobody bids at a breaker's yard: you point, and the owner
  names a number. This drops the auction room's machinery entirely and keeps the
  decision on the arithmetic instead of on a clock.
- **Price sits between the scrap floor and harvest value**, so the yard is never a free
  lunch and never a trap: a good eye is rewarded by margin, not by a mispriced sheet.
- **Disclosure is the venue's whole contract.** The sheet shows value pinned at the
  floor and states the fact in one line. A disclosed money-loser is a decision; an
  undisclosed one is a trap, and the legibility clause carries that burden here.
- **Bays bind.** A donor occupies a bay while it is stripped, which is what stops the
  yard becoming a hoard and makes "is this worth two days of a bay" a real question.
- **Gonda owns the yard** (cast doc), so the venue arrives with a face already assigned.

## 6. Law surgery, stated so it cannot be over-read

Three laws gain a scope clause, "every **auction** lot". No formula, threshold or
constant changes.

- **Law 1 (per-yen return).** The brief says unchanged; the code says otherwise. A
  floor-pinned car has repair slope **zero** below its expectation band, which is
  exactly what Law 1's litmus forbids. A donor is that car by construction and on
  purpose, so Law 1 needs the auction scope clause too, or it ships with a litmus that
  fails on the species it was written beside.
- **Law 2 (every generatable lot clears a profit)** and **the work guarantee**: scoped
  to auction lots. Per D9 the auction's own guarantee weakens to "the room's ODDS are
  honest per tier" rather than "every lot is safe".
- **The four-play law's strategy ranking**: scoped to auction lots. On a donor, stripping
  is meant to win; that is the species.

Bible amendments ship in the same change as the implementation, per the bible's own
protocol.

## 7. What needs authoring before implementation

New content, values chosen at implementation under behaviour-first governance with the
felt behaviour recorded:

- Donor spawn rate per tier at the yard, and how deep past break-even a donor may run.
- Route weights, and the new `missingSlotWeightByPart` entries the stripped shell needs.
- Price anchoring between floor and harvest value.

Felt statements the values must satisfy: **walking the yard should turn up something
worth taking most visits, and something genuinely worth the day roughly one visit in
three**; **a donor bought well should undercut the parts market by enough to feel like a
find, and never by so much that the parts market stops being worth using**.

## 8. Probes

- The inversion holds: fixing a donor loses money; harvesting a good part into a build
  beats both fixing it and selling it.
- Harvest-versus-catalogue crossover: at what part condition does buying new win? That
  crossover is the labour price in (2), and it must exist rather than being lopsided.
- The existing four-play probes re-scope to auction lots.
