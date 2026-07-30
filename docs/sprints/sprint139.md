# Sprint 139: the premium for building well, if there is to be one

**Status: BLOCKED, and possibly unnecessary. HARD GATE: Sprint 138 has reported AND the
maintainer has read the measurement and chosen a shape.**

**This sprint does not open on Sprint 138 merely having run.** It opens when the maintainer has
read the numbers and said which of the shapes below to build, or said that none is needed.

Sixth of nine in the tuning overhaul arc.

Design reference: `docs/design/systems/tuning-system.md` sections 7a and 16.

## This sprint shrank on 2026-07-29, and cancelling it is a legitimate outcome

**The earlier version of this sprint owned the whole coupling between coherence and money.**
Sprint 136 now owns the penalty half: an incoherent build loses reliability, every buyer already
weights reliability, so a stupid build is already worth less, and the buyers who care least about
it are already the ones left bidding. **That is design 7a's mechanism and it required no new
path.**

What is left here is only the other direction: **does a well-built car deserve to be worth more
than a stock one, and if so, how.** Sprint 136 deliberately does not answer it, capping
`coherenceFactor` at 1.0 so a fully supported build is exactly as reliable as stock and no more.

**If Sprint 138 reports that the penalty is felt and that building well needs no separate reward,
this sprint is closed unbuilt and its Exit records why.** That is a good result, not a failure:
it means the arc got there with one mechanism instead of two. The precedent is Sprint 100, which
was superseded unbuilt and whose doc records that.

**Framing note (`stressCoefficient`, signed 2026-07-30 as a Sprint 136 amendment): the premise
below has partly changed and this sprint is not yet updated to it.** Sprint 136 gained a third
lever after this sprint was written: an outer build-intensity factor that reads a build's total
power gain regardless of how well it is supported. A coherent modified car and a stock car no
longer read identically on reliability whenever the modified car makes more power than stock - the
modified car now reads strictly lower, in proportion to the gain, whether or not it is supported.
What is UNCHANGED is the actual question this sprint asks: whether a well-SUPPORTED build should be
rewarded relative to a poorly-supported build making the same power, which `coherenceFactor`'s own
cap at 1.0 still answers "no" to. Shape 2 below (letting `coherenceFactor` exceed 1.0) is read
against that same cap and is unaffected in its own terms; it would now also have to reckon with the
outer factor pulling any gain-making build down first, which was not a consideration when Shape 2
was drafted. This note flags the drift rather than resolving it: rewriting this sprint's task
breakdown is deferred to whenever Sprint 138 reports and this sprint actually opens.

## The question, and why it is genuinely open

**The case for a premium.** Design 7a says a coherent build reaches a different set of buyers who
pay more because they can see what they are looking at. Under Sprint 136 as built, a coherent
build and a stock build making the SAME power still read identically on reliability (the case the
framing note above leaves untouched), so nothing distinguishes the player who supported their build
properly from the player who did not, for the same amount of power made. **A game about building
things should notice when you build something well.**

**The case against.** Design 7b's stance, carried into Sprint 136's readout: competence is the
baseline rather than an achievement. The player already gets paid for a good build through the
power and handling it makes, which every buyer also weights. **Adding a coherence premium on top
risks paying twice for one decision**, which is the exact defect this whole arc exists to remove
from the power ladder.

**Neither argument wins on reasoning, which is why Sprint 138 measures first.**

## The four shapes, from Sprint 138's own option list

**No values are proposed here.** Sprint 138 exists to produce them, and proposing them in advance
would be inventing the numbers the measurement exists to discover. Each shape is sketched only far
enough to be costed.

### Shape 1: widen `tasteSpread`

One number in `economy.json`. Widens the band every stat plays in, so reliability's share of it
grows without reliability itself changing.

**Cheapest by far, and the bluntest.** It moves power, handling, style and authenticity by the
same proportion, so it is not a coherence decision at all; it is a decision that taste should
matter more across the board. **Say that plainly if it is chosen**, rather than describing it as
a coherence change.

### Shape 2: let `coherenceFactor` exceed 1.0

Sprint 136's curve caps at 1.0 by one `min()`. Removing the cap and letting a genuinely
over-supported build read above the stock ceiling would make building well visible in the stat
itself.

**The objection is real and must be answered before it is built:** an over-supported build is one
where the player bought more fuel system and cooling than the gains demand, and rewarding that
creates a new dominant strategy of over-buying support. **`spec.reliabilityBase` would also stop
being a ceiling**, which breaks the maintainer's rule from 2026-07-29 that the base is the ceiling
and a properly supported build sits exactly on it. It would also mean a well-built FD could out-read
a stock Carina, which is the specific claim Lever 7 exists to prevent. If this shape is chosen,
that rule is being amended and the amendment must be recorded, not slipped in.

### Shape 3: filter the buyer candidate set on coherence

The original route 1. `saleCandidates(model, buyers)` gains the support verdict and the buyers who
would know better step away from a build that does not add up.

| build | who bids |
| --- | --- |
| coherent, well supported | everyone, including the buyers who know |
| powerful but unsupported | only buyers who cannot read it |
| dangerous | almost nobody serious |

**Note what this actually adds now that Sprint 136 has shipped**: reliability already makes the
knowledgeable buyers offer *less*. This makes them offer *nothing*. That is a different and
sharper feel, and design 18 question 3 calls it a deliberate feel question: should a dangerous car
be nearly unsellable, or merely cheap.

Two things ride with it. **The band-to-candidate mapping must live in content**, never a list in a
source file. And **the empty-set case must be handled explicitly**: `sellViaWalkIn` already throws
a `RangeError` when no archetype is interested in a tier, so if coherence can empty the set,
content decides whether that is possible, and if it is, the car draws no offer that day rather
than throwing. **A car the player cannot sell at all is a design decision, not an exception.**

### Shape 4: nothing

Accept the penalty as sufficient, rely on Sprint 136's readout and Sprint 141's dyno to carry the
message, and close this sprint unbuilt.

**This is a real option and it must be presented as one**, not as the failure case.

## Reuse analysis (directive 16)

### Genuinely new

**At most one input to one existing gate**, under shape 3. Shapes 1 and 2 are a single number
each. Shape 4 is nothing.

### Existing mechanisms reused, unchanged

- **`saleCandidates`**, the existing tier gate. Shape 3 narrows what it returns; it never replaces
  it.
- **`valuateCarForBuyer`, `pickWeightedCandidate`, `offerSpread`, `offerChanceFor`**: untouched
  under every shape.
- **`supportVerdict`** and **the reliability derivation**, both from Sprint 136.
- **The five archetypes** in `buyers.json`, unchanged in taste and count.

### Must NOT be built

- **A premium multiplier on value.** `foundationFactor` and `aftermarketReturn` are untouched
  under every shape, and a test asserts it.
- **A second valuation path.** The existing one is the one that runs.
- **A new archetype.** Five is the roster.
- **A second coherence quantity.** `supportVerdict` is the one, and it already exists.

## What must be signed before implementation

1. **Which shape**, or that none is built.
2. **Its values**, from Sprint 138's measured numbers.
3. **Under shape 3 only:** which archetypes remain candidates at `strained` and at `dangerous`,
   and whether an incoherent build also changes `offerChanceFor` or only the candidate set
   (design 18 question 3).
4. **Under shape 2 only:** an explicit amendment to the 1.0-is-the-ceiling rule.

## Task breakdown

Written against shape 3, the only shape with real structure. **If another shape is chosen, this
section is rewritten to it before implementation and the change is recorded here.**

### Task 1: content

The band-to-candidate mapping, authored in content and Zod-validated.

### Task 2: the gate

`saleCandidates` takes the support verdict and applies the mapping. **It keeps its existing tier
gate exactly as it is**: an archetype with no `tierPreferences` entry for a tier still never bids,
and cohesion narrows that set further rather than replacing it. Handle the empty set as content
specifies.

### Task 3: tests

1. **Law 5 is untouched.** `foundationFactor` and `aftermarketReturn` provably not read or changed.
   Assert the constants directly and assert a car's part-retention figure is identical before and
   after a support collapse.
2. **A coherent build reaches more archetypes than an incoherent one carrying the same parts.**
3. **The spread matches Sprint 138's reported figures** within tolerance. If it does not, the
   implementation disagrees with the measurement and the implementation is wrong.
4. **A stock car is unaffected**, on every one of the 26 cars: headline exactly 1.0, candidate set
   exactly what it is today. This is the regression test that keeps the existing game intact.
5. **The empty-set case** behaves as content says it does.
6. **Reliability is not double-charged.** A car's price falls once for a collapsed build, not once
   through reliability and again through a narrowed pool applied to the same shortfall. **This is
   the test specific to shape 3 landing on top of Sprint 136**, and it is the one an implementer
   is most likely to miss.

### Task 4: checks

```text
pnpm test --project content
pnpm test --project sim
pnpm test --project game
```

### Task 5: re-derive whatever moved

Directive 17 case (a). Sale-price pins move for any car with a modified build.
`economyApprovalGate.test.ts` moves if the mapping lands in `economy.json`; re-pin in the same
change as the recorded sign-off.

## Hard constraints

- **Sprint 138 reported and a shape chosen, or this sprint does not open.**
- **Never inflate a premium multiplier.**
- **Performance never moves price.** A faster car is not worth more for being faster; a
  better-built car is worth more to the person who can tell. Only the second claim is made.
- **Do not re-implement the penalty.** It landed in Sprint 136 and doing it again anywhere is the
  double-charge test 6 exists to catch.
- **No reputation consequence.** Design 7b stays descoped for the whole arc (design 8).
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

**If the sprint is built:**

- [ ] Sprint 138 reported, numbers accepted, shape chosen, all recorded here.
- [ ] The sign-off items above signed and recorded in this doc.
- [ ] The chosen shape implemented, with its task breakdown rewritten first if it is not shape 3.
- [ ] `foundationFactor` and `aftermarketReturn` provably untouched.
- [ ] All 26 stock cars behave exactly as they do today.
- [ ] The measured spread matches Sprint 138's report.
- [ ] No double-charge: a collapsed build is penalised once.
- [ ] Checks run once each, output shown.

**If the sprint is closed unbuilt:**

- [ ] The Exit records which of Sprint 138's findings made a premium unnecessary, and the arc
      continues at Sprint 140. **No code change, and no apology in the doc.**

## Exit

_To be completed at the end of the sprint._
