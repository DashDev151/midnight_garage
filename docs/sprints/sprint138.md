# Sprint 138: measure the buyer-selection spread

**Status: READY TO IMPLEMENT once Sprint 136 has shipped. No sign-off required, because
this sprint changes nothing.**

**THIS IS A MEASUREMENT SPRINT. BUILD NOTHING.** No schema, no lever, no screen, no
behaviour change. The deliverable is a table of numbers and a recommendation.

Fifth of nine in the tuning overhaul arc. Sprint 139 is hard-gated on this one.

Design reference: `docs/design/systems/tuning-system.md` sections 7a, 16 and 18 question 1.

## The question, stated plainly

Design 7a says a coherent build does not receive a bonus; it **reaches a different set of
buyers**, and they pay more because they can see what they are looking at.

**That this produces a price spread large enough to be felt is an assumption, not a
measurement.** The design names it as its own main risk. Every value-side sprint in this arc
rests on it, and it is cheap to test and expensive to be wrong about.

The constraint that makes the question sharp: **`foundationFactor` and `aftermarketReturn`
must not move.** Law 5 of the economy bible caps what an installed part returns, and the
whole point of routing through buyer selection is that it does not touch that cap.

## What already exists, and is the thing being measured

Read these before measuring. **Do not build a parallel valuation path; measure the real
one.**

| concern | where it lives |
| --- | --- |
| Which archetypes will look at this car at all | `saleCandidates(model, buyers)`, `packages/sim/src/selling.ts`, gated on `tierPreferences`. **An archetype with no entry for a tier never bids; there is no fallback.** |
| What one buyer thinks a car is worth | `valuateCarForBuyer(...)`, weighted by that buyer's `statWeights` over the car's `StatBlock` |
| Which of the interested buyers actually turns up | `pickWeightedCandidate(...)` |
| What they offer against their own valuation | `economy.selling.offerSpread` |
| Whether an offer is drawn at all on a given day | `offerChanceFor(model, heatPercent, economy)` |
| The five archetypes and their taste | `packages/content/data/buyers.json`, schema in `packages/content/src/buyer.ts`: `collector`, `tuner`, `stancer`, `racer`, `first-timer` |
| The build's coherence | `supportVerdict(...)`, `packages/sim/src/support.ts`, from Sprint 136 |

## What to measure

Across **all 26 shipped cars**, for each of three builds carrying **the same parts count and
the same money spent** wherever the catalogue allows it:

| build | definition |
| --- | --- |
| **A. coherent** | gains plus the supporting parts they demand; headline support ratio `adequate` |
| **B. incoherent** | the same total spend concentrated in gains, no supporting parts; headline `dangerous` |
| **C. stock** | the control, headline exactly 1.0 |

For each car and each build, report:

1. The headline support ratio and the named subsystem.
2. The car's `StatBlock` as built.
3. **The full candidate set**: every archetype `saleCandidates` returns, with each one's
   `valuateCarForBuyer` figure.
4. The best-fit buyer and their valuation.
5. That valuation as a **share of the car's book value**, which is the comparable figure
   across a roster spanning 55 to 324 PS and an order of magnitude of price.

## The two routes to compare

**Route 1: buyer selection.** Model, without implementing it, what happens if a `dangerous`
build removes the archetypes that would know better (`collector`, `tuner`, `racer`) from the
candidate set, leaving `first-timer` and `stancer`. Report the resulting best-fit valuation
against build A's.

**This is the design's own proposal and it is the one Sprint 139 would build.**

**Route 2: reliability as a derived stat.** Design 9 says a part does not add reliability;
the build supports its own output or it does not. `reliability` is already in `StatBlock`
and **every buyer already weights it**. So deriving reliability from the headline support
ratio would reach price through machinery that exists today, with no new path at all.

Report the same spread under a plain linear derivation, and **state its weakness honestly**:
design 18 question 1 says "do not reach for a third lever", and whether this counts as a
third lever or as the correct home for a stat the design has already decided is derived is
**a maintainer judgement, not an implementation one**.

## The report

A new document, `docs/design/systems/buyer-spread-measurement.md`. Not a sprint doc, not a
scratch file in the repo root (directive 11).

It must contain:

- The three tables above, one per build, all 26 cars.
- The spread between build A and build B, per car, as a share of book value, under both
  routes, with the roster median, minimum and maximum.
- **Which cars, if any, show no spread at all**, and why. A car whose tier only one archetype
  bids on cannot show buyer selection working, and if that is most of the roster the route is
  dead regardless of the average.
- A plain statement of whether the spread is large enough to be felt, and the reasoning.

## The decision this feeds, which is not the implementer's

**Report the numbers. Do not tune toward a target. Do not implement either route.**

If the spread is too small to be felt, the honest options are to withhold premium from
incoherent builds within Law 5, or to amend Law 5 openly. **Both are maintainer decisions and
Law 5 questions**, and the arc stops here until one is taken.

## Task breakdown

### Task 1: the measurement harness

A test-only probe under `packages/sim/tests/`, in the style of the existing
`valueModelProbes.test.ts` and `coherence.test.ts` probes. It computes and prints the tables.

**It is a probe, not a gate.** It asserts only that it ran and produced a row per car; it
must not assert a spread threshold, because no threshold has been decided and inventing one
here is precisely the failure this sprint exists to avoid.

**Directive 21 applies: no bot careers, no `pnpm balance:run`.** This is closed-form
arithmetic over the roster, which is explicitly still permitted.

### Task 2: build construction

Builds A and B must be constructed from the real catalogue with the real fitment rules, and
their spend matched as closely as the catalogue allows. **Report the actual spend for each
so any mismatch is visible rather than hidden**; if the catalogue makes matched spend
impossible on some car, say so per car rather than quietly approximating.

### Task 3: the document

Write `docs/design/systems/buyer-spread-measurement.md` as above.

### Task 4: checks

```text
pnpm test --project sim
```

Nothing else can have moved, because nothing was changed.

## Hard constraints

- **Build nothing.** No schema, no lever, no screen, no behaviour change.
- **Do not touch `foundationFactor` or `aftermarketReturn`.**
- **Do not tune toward a target.** Report what is there.
- **No bot careers** (directive 21).
- No em dashes, no emoji, British spelling, no process-narrative comments.

## Definition of done

- [ ] Sprint 136 shipped and green.
- [ ] All 26 cars measured across builds A, B and C, with actual spend reported per build.
- [ ] Candidate sets and per-buyer valuations reported, not just the best fit.
- [ ] Both routes reported, with route 2's Law-5 objection stated plainly.
- [ ] Cars showing no spread identified and explained.
- [ ] `docs/design/systems/buyer-spread-measurement.md` written.
- [ ] A plain verdict on whether the spread is felt, with reasoning, handed to the maintainer.
- [ ] `git status` shows no change to any source file outside the probe and the document.

## Exit

_To be completed at the end of the sprint._
