# Sprint 138: measure what coherence actually did to the money

**Status: READY TO IMPLEMENT once Sprint 136 has shipped. No sign-off required, because this
sprint changes nothing.**

**THIS IS A MEASUREMENT SPRINT. BUILD NOTHING.** No schema, no lever, no screen, no behaviour
change. The deliverable is a table of numbers and a recommendation.

Fifth of nine in the tuning overhaul arc. Sprint 139 is hard-gated on this one.

Design reference: `docs/design/systems/tuning-system.md` sections 7a, 16 and 18 question 1.

**This sprint's question changed on 2026-07-29 and it is now a better one.** The earlier version
offered two routes and asked which to build: route 1, filtering the buyer candidate set on
coherence; route 2, deriving reliability from the support ratio. **The maintainer chose route 2
on reasoning rather than on measurement** (*"WHY is there less demand for a stupid build? BECAUSE
it is going to blow up"*) and Sprint 136 built it. So this sprint no longer models a hypothetical
against a hypothetical. **It measures a thing that is running**, which is a far stronger position
to make the remaining decision from.

## The question, stated plainly

Sprint 136 made an incoherent build lose reliability, and reliability is already weighted by every
buyer in `valuateCarForBuyer`. **The downside therefore already reaches price.** Two things about
it are still unknown, and Sprint 139 rests on both.

**Question 1: is the penalty big enough to be felt, and does it change who wins the car?**

The arithmetic ceiling is narrow and known. `tasteMultiplier` is `1 - spread + 2 * spread * score`
with `tasteSpread` at 0.12, so the whole taste band is 24 per cent of value **across all five
stats combined**. A first-timer weights reliability at 57 per cent of their taste, so even a
reliability collapse from 100 to 0 moves their offer by under 14 per cent. **A single stat cannot
carry a large price signal through this system**, and that is a fact about the taste model rather
than about coherence.

What matters is not the absolute size but **whether the ranking flips**: on a coherent build the
first-timer and the racer are competitive, on a collapsed one they should fall behind the stancer,
who weights reliability at zero and genuinely does not care.

**Question 2: does a well-built car deserve a premium, and is one needed?**

Sprint 136 caps `coherenceFactor` at 1.0 deliberately, so a fully supported build is exactly as
reliable as a stock one and no more. Design 7a wants more than that: a coherent build should
**reach a different set of buyers** who pay more because they can see what they are looking at.
**That half is not built and this sprint decides whether it should be.**

The constraint that makes it sharp: **`foundationFactor` and `aftermarketReturn` must not move.**
Law 5 of the economy bible caps what an installed part returns, and the whole point of routing
through buyer selection is that it does not touch that cap.

## What already exists, and is the thing being measured

Read these before measuring. **Do not build a parallel valuation path; measure the real one.**

| concern | where it lives |
| --- | --- |
| Which archetypes will look at this car at all | `saleCandidates(model, buyers)`, `packages/sim/src/selling.ts`, gated on `tierPreferences`. **An archetype with no entry for a tier never bids; there is no fallback.** |
| What one buyer thinks a car is worth | `valuateCarForBuyer(...)`, weighted by that buyer's `statWeights` over the car's `StatBlock` |
| The taste band | `tasteMultiplier` and `channelTasteMultiplier`, `packages/sim/src/valuation.ts`; `economy.valuation.tasteSpread` |
| Which of the interested buyers turns up | `pickWeightedCandidate(...)` |
| What they offer against their own valuation | `economy.selling.offerSpread` |
| Whether an offer is drawn at all on a given day | `offerChanceFor(model, heatPercent, economy)` |
| The five archetypes and their taste | `packages/content/data/buyers.json` |
| The build's coherence | `supportVerdict(...)`, `packages/sim/src/support.ts`, from Sprint 136 |
| What coherence did to the stat | `computeDerivedStats(...).reliability`, from Sprint 136 |

## What to measure

Across **all 26 shipped cars**, for each of four builds carrying **the same parts count and the
same money spent** wherever the catalogue allows it:

| build | definition |
| --- | --- |
| **A. coherent** | gains plus the supporting parts they demand; headline `adequate` |
| **B. incoherent** | the same total spend concentrated in gains, no supporting parts; headline `dangerous` |
| **C. stock** | the control, headline exactly 1.0, mint |
| **D. honest tired** | stock build, all reliability-bearing parts `worn`. The comparison the maintainer named: a stupid mint build against a tired honest car |

For each car and each build, report:

1. The headline support ratio and the named subsystem.
2. The car's `StatBlock` as built, **with `reliability` called out separately**.
3. **The full candidate set**: every archetype `saleCandidates` returns, with each one's
   `valuateCarForBuyer` figure. Not just the winner.
4. **Which archetype wins**, and by how much over the runner-up.
5. The winning valuation as a **share of the car's book value**, the only comparable figure
   across a roster spanning 55 to 324 PS and an order of magnitude of price.

## The four findings the report must reach

**1. The A-to-B spread**, per car, as a share of book value: roster median, minimum, maximum.
This is the number that says whether the penalty is felt.

**2. Does the winner change between A and B?** Count the cars where it does. **This matters more
than the spread size**, because a changed winner is a visible, narratable event ("the enthusiast
walked, the kid with cash turned up") where three per cent off the price is not.

**3. Which cars show no spread at all, and why.** Two failure modes, and they are different:

- **A car whose tier only the stancer bids on cannot respond to coherence at all**, because the
  stancer weights reliability at zero. That is structural, not a tuning problem, and if it is much
  of the roster then route 2 is thin at exactly the cheap end of the game where a first build
  happens.
- **A car whose tier only one archetype bids on** cannot show buyer selection working under any
  route.

Report both counts separately.

**4. Is build A distinguishable from build C at all?** Under Sprint 136 as built, a coherent
modified car and a stock car both read `reliability` at the cap, so **on this stat they are
identical**. If the roster shows no premium anywhere for building well, that is the finding that
Sprint 139 exists to answer, and it should be stated in one plain sentence rather than buried.

## What NOT to do

**Report the numbers. Do not tune toward a target. Do not implement a premium.**

If the spread is too small to be felt, the honest options are: widen `tasteSpread`; give
`coherenceFactor` a range above 1.0 for a genuinely over-supported build; filter the candidate set
on coherence as the original route 1 proposed; or accept the penalty as small and rely on the
readout to carry the message. **All four are maintainer decisions**, two of them are Law 5
questions, and the arc stops here until one is taken.

## Task breakdown

### Task 1: the measurement harness

A test-only probe under `packages/sim/tests/`, in the style of the existing
`valueModelProbes.test.ts` and `coherence.test.ts` probes. It computes and prints the tables.

**It is a probe, not a gate.** It asserts only that it ran and produced a row per car; it must not
assert a spread threshold, because no threshold has been decided and inventing one here is
precisely the failure this sprint exists to avoid.

**Directive 21 applies: no bot careers, no `pnpm balance:run`.** This is closed-form arithmetic
over the roster, which is explicitly still permitted.

### Task 2: build construction

Builds A and B must be constructed from the real catalogue with the real fitment rules, and their
spend matched as closely as the catalogue allows. **Report the actual spend for each so any
mismatch is visible rather than hidden.** If the catalogue makes matched spend impossible on some
car, say so per car rather than quietly approximating.

**Sprint 137's price ladder makes matched spend harder than it was**, because the race turbo is now
2.2 times its old price. Expect build B to buy fewer parts for the same money, and report that as
part of the finding rather than compensating for it.

### Task 3: the document

Write `docs/design/systems/buyer-spread-measurement.md` (not a sprint doc, not a scratch file in
the repo root, directive 11), containing the four tables, the four findings above, and a plain
verdict with reasoning.

### Task 4: checks

```text
pnpm test --project sim
```

Nothing else can have moved, because nothing was changed.

## Hard constraints

- **Build nothing.** No schema, no lever, no screen, no behaviour change.
- **Do not touch `foundationFactor`, `aftermarketReturn` or `tasteSpread`.**
- **Do not tune toward a target.** Report what is there.
- **No bot careers** (directive 21).
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Sprint 136 shipped and green.
- [ ] All 26 cars measured across builds A, B, C and D, with actual spend reported per build.
- [ ] Candidate sets and per-buyer valuations reported, not just the winner.
- [ ] Finding 1: the A-to-B spread, median, minimum and maximum.
- [ ] Finding 2: the count of cars where the winning archetype changes.
- [ ] Finding 3: stancer-only and single-archetype cars counted separately.
- [ ] Finding 4: a plain sentence on whether building well is distinguishable from stock.
- [ ] `docs/design/systems/buyer-spread-measurement.md` written.
- [ ] A plain verdict handed to the maintainer, with the four options for a thin spread named and
      not chosen.
- [ ] `git status` shows no change to any source file outside the probe and the document.

## Exit

_To be completed at the end of the sprint._

---

## Closure

**Status: CLOSED UNBUILT, 2026-07-30. Superseded by the sale value system design.**

This was a measurement sprint asking whether the coherence penalty landed by Sprint 136 was
felt, and whether it changed who bought the car. That question was overtaken: measurement found
the taste band was barely exercised at all, because the score is a weighted mean of five
deliberately anti-correlated stats, so it sits near the middle by construction. The answer was
not "the penalty is too small", it was "the instrument cannot express it".

What replaced it: `docs/design/systems/sale-value-system.md`, which reworks taste into a
per-buyer match, moves reliability out of taste into a value discount (Stage C), and adds
liquidity and standing as the two axes a sale was missing.

The sprint's measurement instinct was right and produced the finding that closed it. It is this
sprint's scope that is superseded, not its purpose.
