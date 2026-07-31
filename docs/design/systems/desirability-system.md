# Desirability: one dial, two routes

**Status: DESIGN IN PROGRESS. NOT BUILT. NOT READY TO BUILD.**

This records a design conversation of 2026-07-31 so none of it is lost. It is not a spec. It
names what is decided, what is open, and how the design will be approached. **Nothing here may
be implemented until the measurement pass below has run and the design is finished and signed.**

## The defect this replaces

**Style and authenticity are two separate systems, and neither knows what kind of car it is
looking at.**

- `style` is a flat base (per-car `styleBase`, landed Sprint 145) plus additive bolt-ons:
  bodykits, tints, underglow, aero, paint, liveries.
- `authenticity` is a separate axis entirely.
- A mint, numbers-matching 2000GT scores about **20 out of 100** on style, because style only
  counts things bolted on. The maintainer's words: that "feels stupid", and it is.

**And the value lever is keyed on the wrong thing.** `valuation.expectationByTier[].
aftermarketReturn` is **entry 0.3 / everyday 0.6 / enthusiast 0.9 / flagship 1.0**. It is keyed on
tier, which is a price bracket. So the current game says a bolted-on widebody returns **more**
value on a 2000GT (flagship, 1.0) than on any other car in the roster. Exactly backwards, and it
cannot be fixed by tuning, because tier cannot tell a museum piece from a tuner icon: a 2000GT
and an FD sit in the same bracket.

## What is decided

**1. One dial, two routes.** There is a single outward-facing measure of how much a car is
wanted, reached by either of two routes: **originality** (the restoration road) or **expression**
(the tuner road). Both work on any car. Each car rewards one more than the other.

**2. The dial is `max`, not a sum. APPROVED 2026-07-31.**

    desirability = max(originality, expression)

Originality is a stock that can only be spent down: bolt a wing on and the car is no longer
original. So the routes are not parallel scores that accumulate, one is **consumed to fund the
other**. `max` makes committing to a route the right play without any punitive mechanic. A half
and half car gets the better of two mediocre numbers, so "unfinished" reads as unfinished rather
than as broken.

**3. Naming, PROVISIONALLY APPROVED.** The dial is **desirability**; the routes are
**originality** and **expression**. Provisional because the copy surface has not been written.
**"Presence" is BANNED as a name for this**: the planned buyer-flow model has already claimed
`presence` / `basePresence` (see `sale-value-implementation-plan.md` S8), and this repo has
already lost time to three separate name collisions.

**4. Affinity is a per-car ceiling on each route, authored for all 94 cars.** Directive 24
applies: the value is decided once, up front, for the whole roster, not for the shipped subset.

| car | originality ceiling | expression ceiling | result |
| --- | --- | --- | --- |
| Toyota 2000GT | very high | very low | a widebody spends a big number to buy a small one. Net loss, with no special-case rule needed. |
| Nissan 350Z | low | very high | nobody pays for a concours 350Z. Build it. |
| Toyota AE86 | high | high | a genuine choice. Both routes pay. |

**"Good at both" means a high ceiling on each route, NOT scoring both at once.**

**5. Period-correct modification is the interesting middle, and it is nearly free.** A Watanabe
or a period TRD part on an AE86 does not read as a spoiled original, it reads as a period tuner
car, which is its own desirable thing. So **period-correct mods spend less originality than
modern ones**. The hook already exists: `CarInstance.parts[].installed.genuinePeriod` is a
boolean and `valuation.genuinePeriodMultiplier` is **1.25**
(`marketValue.ts:239`). A third playstyle off machinery that already ships.

**6. Modification barely paying on the wrong car is CORRECT, and this rework must preserve it.
RULED 2026-07-31.**

The finding this answers came out of the two-car worked example: modifying the Wagon R spent
¥19,580 on parts and lifted the car ¥6,579, a loss of ¥13,001. **Ruled not a defect**, and ruled
to be answered by this rework rather than ahead of it. The maintainer's words: *"modifying a kei
with performance parts should be mostly a losing proposition unless you can find someone to pay
you for it. already sounds pretty good to me."*

**So it is a constraint on the design, not a problem for the design to fix.** The two halves of
that sentence map onto the two things this document already decides: a kei's low **expression
ceiling** is what makes the loss the default, and *"unless you can find someone to pay you for
it"* is the buyer match, which is what makes the same build occasionally right. A rework that
made a modified kei reliably profitable would have broken this, whatever else it achieved.

## What is open, and it is the hard part

**1. Originality is half-baked.** It is named but not designed. What raises it, what lowers it,
what a "fully original" car actually means mechanically, and whether it decays.

**2. The balance the maintainer named, in their own framing:**

> we should not make it Too easy for players to rely solely on authenticity. But at the same
> time we should not make it impossible to have a car that is both a well performing and
> authentic.

Restoration must not become the safe default that always works, **and** the player must not be
forced to choose between a car that goes well and a car that is authentic. Those two constraints
pull against each other and reconciling them is the design's real job.

**3. Coherence does NOT transfer from reliability, and assuming it does was a mistake made in
this conversation and corrected by the maintainer.** On reliability, an incoherent build is
actively **worse**: a big turbo on stock brakes is dangerous and it breaks. On desirability, a
350Z with only underglow is **not worse, it is unfinished**. The failure modes are different:

- **Within a route: completeness.** Partial work earns partial credit and NO penalty. A look
  scores once enough elements agree that it reads as intentional.
- **Across routes: conflict.** This is the only place a penalty belongs, and under decision 2 the
  `max` already delivers it structurally.

**Do not reuse the reliability coherence curve here without re-deriving what it means.**

**4. Consequences for existing levers.** `aftermarketReturn` (keyed on tier) is superseded by the
expression ceiling and would be **retired**. That is a lever retirement and needs explicit
sign-off under directive 22 when the time comes. `styleBase` (all 94 authored, Sprint 145) and
`statFormulas.styleCap` (retired Sprint 145) both feed into whatever replaces them; the 4 to 20
authored range was deliberately not rescaled and that decision reopens here.

## The method, as instructed

**Measure first, then design the perfect system, then work back.** The same approach the economy
rework used.

1. **Measure.** Establish exactly which levers move style and authenticity today, how they
   interplay, and what each is worth in yen. **The two-car worked example
   (`worked-example-two-cars.md`) is the first half of this**, because it prices what a
   modification is actually worth today.
2. **Design the ideal**, without regard for what currently exists or what it would cost to
   change. Adjacent tunables are never a constraint (directive 23).
3. **Work back** to what ships, with the full lever list, and get the numbers signed one by one.

## Do not build yet

This document is a record of a conversation, not a specification. It has no sprint, no task
breakdown and no lever table, deliberately. The next action on it is the measurement pass, not
implementation.
