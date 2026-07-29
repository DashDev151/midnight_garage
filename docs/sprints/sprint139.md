# Sprint 139: cohesion into buyer selection

**Status: BLOCKED. HARD GATE: Sprint 138 has reported AND the maintainer has accepted its
numbers and chosen a route.**

**This sprint does not open on Sprint 138 merely having run.** It opens when the maintainer
has read the measurement and said which route to build. If Sprint 138 found the spread too
small, the fallbacks are Law 5 questions and the arc stops until one is decided.

Sixth of nine in the tuning overhaul arc.

Design reference: `docs/design/systems/tuning-system.md` sections 7a and 16.

## What this sprint builds

**Cohesion changes who is buying. It never inflates a premium multiplier.**

A coherent build does not receive a bonus; it reaches a different set of buyers, and they
pay more because they can see what they are looking at. A car sold to an enthusiast genuinely
fetches more than the same car sold to someone nervous about it, and that is a taste
judgement rather than a performance-to-price coupling.

## Reuse analysis (directive 16)

### Genuinely new

**One input to an existing gate.** The headline support ratio from Sprint 136 becomes an
input to which archetypes are candidates for a car.

### Existing mechanisms reused, unchanged

- **`saleCandidates(model, buyers)`** (`packages/sim/src/selling.ts`), the existing tier gate
  deciding which archetypes will look at a car at all. This is the hook.
- **`valuateCarForBuyer`**, `pickWeightedCandidate`, `offerSpread`, `offerChanceFor`: all
  untouched.
- **`supportVerdict`** from Sprint 136.
- **The five archetypes** in `buyers.json`, unchanged in taste and count.

### Must NOT be built

- **A premium multiplier.** `foundationFactor` and `aftermarketReturn` are untouched, and a
  test must assert it.
- **A second valuation path.** The existing one is the one that runs.
- **A new archetype.** Five is the roster.

## The mechanism, in outline

`saleCandidates` gains the car's support verdict and filters the archetype list by it: the
buyers who would know better step away from a build that does not add up.

The design's shape (7a):

| build | who bids | what happens to the money |
| --- | --- | --- |
| coherent, well supported | everyone, including the buyers who know | full interest, best prices |
| powerful but unsupported | only buyers who cannot read it | thinner pool, weaker prices |
| dangerous | almost nobody serious | it sits, or it goes cheap |

**Which archetypes step away at which band is Sprint 138's finding, not a choice made
here.** The candidate list must come from content (`buyers.json` or `economy.json`), never
from a list in a source file, so the shape can be tuned without a code change.

## Levers, all set by Sprint 138's accepted numbers

**This doc deliberately does not propose values.** Sprint 138 exists to produce them, and
proposing them here would be inventing the numbers the measurement exists to discover.

What must be signed before implementation, listed so the sign-off is complete:

1. **Which archetypes remain candidates at `strained`.**
2. **Which archetypes remain candidates at `dangerous`.**
3. **Whether an incoherent build also changes `offerChanceFor`**, or only the candidate set.
   Design 18 question 3 asks whether a dangerous car should be nearly unsellable or merely
   cheap, and calls it a feel question worth deciding deliberately.
4. **Whether reliability's derivation moves to the support ratio** (Sprint 138's route 2), or
   stays on condition.

## Task breakdown

Written against the mechanism above; the values come from the sign-off.

### Task 1: content

The band-to-candidate mapping, authored in content and Zod-validated.

### Task 2: the gate

`saleCandidates` takes the support verdict and applies the mapping. **It keeps its existing
tier gate exactly as it is**: an archetype with no `tierPreferences` entry for a tier still
never bids, and cohesion narrows that set further rather than replacing it.

**The empty-set case must be handled explicitly.** `sellViaWalkIn` already throws a
`RangeError` when no archetype is interested in a tier. If cohesion can empty the candidate
set, decide in content whether that is possible at all; if it is, the car draws no offer that
day rather than throwing. **A car the player cannot sell at all is a design decision, not an
exception.**

### Task 3: tests

1. **Law 5 is untouched.** `foundationFactor` and `aftermarketReturn` are provably not read
   or changed by this sprint. Assert the constants directly and assert that a car's
   part-retention figure is identical before and after a support collapse.
2. **A coherent build reaches more archetypes than an incoherent one carrying the same
   parts.**
3. **The spread is real.** The measured price difference matches Sprint 138's reported
   figures within tolerance. If it does not, the implementation disagrees with the
   measurement and the implementation is wrong.
4. **A stock car is unaffected**, on every one of the 26 cars: headline exactly 1.0, so the
   candidate set is exactly what it is today. This is the regression test that keeps the
   whole existing game intact.
5. **The empty-set case** behaves as content says it does.

### Task 4: checks

```text
pnpm test --project content
pnpm test --project sim
pnpm test --project game
```

### Task 5: re-derive whatever moved

Directive 17 case (a). Sale-price pins move for any car with a modified build.
`economyApprovalGate.test.ts` moves if the mapping lands in `economy.json`; re-pin in the
same change as the recorded sign-off.

## Hard constraints

- **Sprint 138 reported and its numbers accepted, or this sprint does not open.**
- **Never inflate a premium multiplier.**
- **Performance never moves price.** A faster car is not worth more for being faster; a
  better-built car is worth more to the person who can tell. Only the second claim is made.
- **No reputation consequence.** Design 7b stays descoped for the whole arc (design 8).
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Sprint 138 reported, numbers accepted, route chosen, all recorded here.
- [ ] The four sign-off items above signed and recorded in this doc.
- [ ] Band-to-candidate mapping in content, Zod-validated.
- [ ] `saleCandidates` reads the support verdict, keeping its tier gate intact.
- [ ] `foundationFactor` and `aftermarketReturn` provably untouched.
- [ ] All 26 stock cars draw exactly the candidate set they draw today.
- [ ] The measured spread matches Sprint 138's report.
- [ ] The empty-candidate case behaves as content specifies.
- [ ] Checks run once each, output shown.

## Exit

_To be completed at the end of the sprint._
