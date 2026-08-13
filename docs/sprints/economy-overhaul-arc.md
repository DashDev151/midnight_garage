# Economy overhaul arc: the action plan

**Status: SUPERSEDED AS A PLAN. Nothing here was built. Read the caveat before using any of it.**

**This plan was written against the 415-line revision of `economy-overhaul-brief.md`. That brief has
since been superseded by a 936-line revision** which adds decisions D8 to D13 and sections 7 to 10:
the ReStory design pillars, drive mode and its containment laws, Workstream H on diagnosis
gameplay weight, and identity within the one system. **The sequencing in this document does not
account for any of it**, and at least one ruling moved underneath it: where the earlier revision
scoped Law 2 to auction lots, D9 now deletes the universal deal guarantee at auction outright.

**Do not execute the waves below.** They are preserved because the reasoning is still legible and
some of it will survive re-planning.

**What remains valid regardless of which brief revision you are working from** is the verification
section immediately following. Those are facts about the shipped code, traced to file and line, and
they are true independent of any plan. Five of them contradict the brief in both revisions. A new
orchestrator should read that section and nothing else in this file.

The design of record is `docs/reviews/economy-overhaul-brief.md` at its current revision, alongside
`docs/design/narrative/ran-when-parked-cast.md` and `ran-when-parked-narrative.md`, which are
deliverables two and three of the same handoff.

**Directive 22 is in force across the whole arc (the brief's own D7).** Workstreams B, F1-F2 and E
move no value at all. C, D and F5 each produce a named lever list for signature and stop there.

---

## The one-paragraph read

The brief's sharpest line is *"the optimal-path problem is solved by mandating the optimal path"*.
That is the actual disease and everything else is either a symptom or an instrument for seeing it.
The second sharpest is the statics-versus-flow split: the bench answers "what is this car worth
right now" and there is no instrument at all for "what does week six feel like", which is why every
tuning argument in this project has been conducted blind. The sequencing follows from those two:
build the flow meter, fix the statics meter's UI, then change the game.

---

## The brief was verified against the code before this plan was written

Taking a review seriously means checking it. Every load-bearing technical claim in the brief was
traced to shipped code. The diagnosis survives intact and the rulings are unaffected. **Five factual
claims do not survive, and each one changes a sprint's scope.** They are recorded here because a
future reader will otherwise implement the brief as written.

| the brief says | the code says | what it changes |
| --- | --- | --- |
| *"Law 1: unchanged entirely"* | A floor-pinned car has repair slope **zero** below its expectation band, which is exactly what Law 1's litmus forbids. `marketValue.ts:181-185` documents the zero slope in its own docstring | **D3 is three-law surgery, not two.** The third is the law the maintainer is most protective of |
| the donor crossover is *"already measured per model"* by `donorBreakEvenBillRatio` and `computeDonorBalanceProbe` | `donorBreakEvenBillRatio` is a **hand-typed global 0.45**; `computeDonorBalanceProbe` measures a clean, all-mint, zero-kilometre car and never reads it | **C must build the instrument, not read it.** Extend `computeGeneratedLotPlayRanking`, which already runs net-against-net on 10,400 real lots |
| rep gates *"auction tiers, facility expansion, tool tiers 2/3, job quality"* | rep is also **the game clock**: `calendar.ts:26-29` derives the campaign year from the rep tier, which decides model eligibility, the auction age floor and the age-to-mileage curve. Auction tiers are **mission**-gated, not rep-gated | **E is not a gate reassignment.** Killing rep means rehoming a second system |
| the weekly summary's *"categorised deltas"* can be aggregated per day | the ledger is **weekly** by deliberate design and carries **five buckets**; all income is one line | **A1's aggregator is a build, not a read.** It has to capture the `DayLogEntry` stream and classify it itself |
| the bench needs four panels built | **three of the four shipped on 2026-08-11**, the day before the brief was dated: generator spawn is already the front door, the work log exists with per-action deltas, the buyer panel exists per channel | **B is half the size the brief thinks**, and is almost entirely subtraction |

Smaller corrections that change tasks rather than workstreams: the bill-to-clean floor pin is at
**0.731**, not 0.77, and end-to-end loss starts at **0.95**, not 1.0; installed part value runs on
`restoration.repairStepFraction`, **not** `bands.bandFactors` (the conclusion holds, the lever name
does not, and `bandFactors` drives every derived stat so tuning it would have a blast radius nobody
intended); the Law 2 guard has **three** call sites including a symptom veto, not one; mileage clean
value **floors at 0.75** at any odometer, so route 1 cannot make a donor alone; `bodywork` is **not**
a foundation part, so route 2's Law 5 withholding runs through the `chassis` slot only; and
`missingSlotWeightByPart` is **zero** for block, chassis, bodywork, paint and forced induction, so
route 3's stripped shell is unreachable without new weights, which is a lever list.

What the brief gets right, plainly: the donor mathematics is directionally correct, the
harvest-over-sale incentive genuinely needs no lever moved (installing into an empty slot beats
selling by 4.3x to 5.4x), the catastrophe rungs are real and cover exactly the four parts named, the
weekly summary genuinely reconciles to the yen, and the leaf count is exact to the unit.

---

## Where this plan deviates from the brief's section 6, and why

Three deviations. Each is a sequencing change, not a scope change.

### 1. B goes first, not level with A

The brief says *"A and B first, in parallel"*. I am putting **B first and alone in wave one**,
because the maintainer is personally blocked on it right now: they opened the bench, could not read
it, and commissioned this review instead. B is a UI refactor of code that already exists and
already has an identical-figures guard, so it is the cheapest item in the arc and the only one that
returns the maintainer's own eyes to the economy this week.

### 2. A splits in two, because its source material does not exist yet

The brief's Workstream A says to author golden careers from *"the existing session-log export...
note the open TODO item to actually capture one"*. That parenthetical is the whole problem: **no
recorded session exists**, so authoring golden careers today means authoring my guess at realistic
play, which is the exact failure mode that condemned the bot harness. A synthetic career script is a
policy bot with the policy hard-coded.

So A splits:

- **A1, the machinery.** Script format, deterministic replay runner, the per-day faucet and sink
  aggregator, the report. All of it is source-agnostic and it is the expensive part. Built now
  against a throwaway script whose only job is to exercise the runner.
- **A2, the authored careers.** Written from a real exported session once one exists. This is the
  instrument; A1 is only the frame it hangs in.

A2 therefore has a maintainer dependency: **play a session and export the log.** Nothing else in
the arc is blocked on it.

### 3. E's census runs immediately, not after A

The brief puts D and E after A because they *"produce decision memos once A exists to measure
against"*. That is right for D, whose deliverable is a measured late-game wage share. It is not
right for E: E's task 1 is an inventory of every consumer of `reputationTier`, which is a read-only
sweep that needs no career curves whatsoever, and E's task 3 (what content depends on a general
tier name) is likewise pure inventory. Only the recommendation needs judgement, and the judgement
is about reassignment, not about pacing.

So E runs in wave one alongside F1, as a second read-only investigation.

---

## The waves

### Wave 1: see the thing (no lever risk, no game change)

Three parallel workstreams, no file overlap between them.

| sprint | workstream | touches | deliverable |
| --- | --- | --- | --- |
| **198** | **B, the bench rebuilt around the loop** | `packages/game/src/screens/` only | four panels in loop order |
| **199** | **F1 and F2, the lever trace and classification** | read-only, produces a doc and a tool | every leaf, its consumer, its tier |
| **200** | **E, the reputation gate census** | read-only, produces a doc | the census plus a three-option memo |

**Wave one ships nothing the player can see and moves no number.** That is deliberate: the brief's
closing line is *"build the instruments, read them, then tune"*, and every regression in this
project's history happened in the other order.

### Wave 2: build the flow meter, design the game change

| sprint | workstream | touches | deliverable |
| --- | --- | --- | --- |
| **201** | **A1, career replay machinery** | `packages/sim`, a new tool | one command, one report, curves not endpoints |
| **202** | **C1, the scrapyard design doc** | docs only | the donor species, its four routes, its lever list |

### Wave 3: change the game

C's implementation (generation path, venue, probes, bible scope clauses), then D's sinks memo once
A2 has real curves to measure against, then F3-F5's governance and kill list.

Wave three is not scheduled here. It is scheduled when wave two lands, because C's implementation
shape depends on what C1's design concludes and D depends on measurements that do not exist yet.

---

## Workstream notes: what each sprint actually has to decide

### 198 (B): the bench

**This sprint is smaller than the brief thinks and its content is almost entirely subtraction.**
Three of the four panels the brief asks for shipped the day before the brief was written: generator
spawn is already the front door with a seed and a reroll, the work log already runs a per-action
ledger with a running slope and yen per labour point, and the buyer panel already gives every buyer
a gate verdict, a taste score, an outcome and a channel-realised price.

**That reframes the whole sprint, and it is the more useful diagnosis.** The maintainer got
overwhelmed by a bench that already had every panel. So the failure is not a missing view, it is
**six sections all shouting at once**. Adding a seventh would make it worse. The work is:

- **Shop presets**, the one genuinely unbuilt item. Named personas as one dropdown instead of thirty
  controls. Thin (day, cash, standing, tool tiers, staff, heat) or they become a second definition
  of shop state that drifts from the real one.
- **Progressive disclosure across all six sections**, so the loop is what is on screen and the state
  space is one click away. The manual slot-by-slot builder is not deleted, it stops being visible by
  default.

Known blocker to settle inside the sprint: the brief says to implement the buyer panel against
`saleCandidates` in `selling.ts`, and **`saleCandidates` is private**. Following that instruction
literally means exporting sim internals to serve a dev screen. The bench currently reaches the same
answer through `valuateCarForBuyerViaChannel`, which is the better boundary. If a near-miss reason
cannot be had without exporting internals, the panel says who bites and stays silent on the rest
rather than inventing a reason.

The invariant that matters survives untouched: **the bench computes nothing.** Every figure is a
named sim function's output, pinned by `economyBench.test.ts`. The pinned money bar stays; it is the
work log's summary line.

### 199 (F1, F2): the trace

Step one is a mechanical trace and it should be **a committed tool, not a one-off script**, so that
"is this lever dead" stays answerable and a newly-dead lever gets caught rather than accumulating.
That is a maintenance cost and it is worth it exactly once: the alternative is doing this census
again in a year.

The 1,053-row table is not a deliverable a person reads. **The deliverable is the one-page
classification summary**: how many leaves are dead, how many are shadow prices, how many survive as
anchors. The brief's acceptance test is that the surviving anchor count is *"measured in dozens, not
hundreds"*, and that number is the only output that matters.

**My own ladder findings fold in here.** I raised a set of concerns about upgrade rungs delivering
little or nothing, and the maintainer correctly dismantled most of them, because I never asked
whether the flatness was the point. F's vocabulary is the frame I was missing: *name the decision
this lever serves*. A steering rung that serves no nameable decision is a texture lever or a dead
one by the census's own definition, and that is a much better question than the one I asked. Those
findings are retired as a separate thread and re-enter as census rows.

### 200 (E): the rep census

Reassign first, kill second. The census names every gate; the memo gives each one a successor owner
or proposes deleting the gate, checked against the progression bible's pillar table and the
no-double-dip law.

**The census already ran, and it changes what E is.** The brief names four gates. There are fifteen
consumers, and one of them is not a gate at all: **`calendar.ts:26-29` derives the campaign game
year from the reputation tier.** Reputation is the clock. It decides which models are eligible to
generate, the auction minimum-age floor, and the age-to-mileage curve. Killing rep as a visible
mechanic therefore means rehoming the passage of time, which is a design question about pacing, not
a gate reassignment. **E's memo has to answer that first or it is not a memo about anything.**

Two other corrections the census turned up. **Auction tiers are mission-gated, not rep-gated**
(`isAuctionTierUnlocked` checks for a delivered mission carrying `unlocksAuctionTier`; rep reaches it
at one remove through the mission's own `gateReputationPoints`), so that successor is one lever
rather than four rooms. And the brief's list misses the whole-shop purchase gate, the dyno gate,
staff candidate quality, listing-channel draw weighting, and the garage-wall photo count, which is
the diegetic display the brief's task 3 was asking about.

`reputation.tierThresholds` stays tabled throughout, per the 2026-08-06 bible amendment. Do not tune
a ladder that may be about to die.

### 201 (A1): the machinery

A career script is an ordered list of real sim action invocations with expected-state checkpoints,
replayed deterministically. **It has no decision policy, which is the entire point**: it cannot
drift into unrealistic play because it makes no choices.

The aggregator is the piece with the most value and the most risk, and **it is a build, not a
read.** The brief describes it as rolling up the weekly summary's categorised deltas, but that
ledger is **weekly by deliberate design** (`financeLedger.ts` keys on the week index and says so) and
carries **five buckets**, with car sales, service jobs, missions, commissions and part sales all
collapsed into one income line. Neither the resolution nor the granularity the flow meter needs is
there.

What is available is the classifier itself, `cashMovementFor`, which is exhaustive over the
`DayLogEntry` union. So the aggregator captures the log stream that `advanceDay` already returns
alongside the new state, plus the logs the in-day resolvers return, and classifies it per day
itself. Nothing persists that stream today, which is the actual work.

Its correctness requirement is unchanged and is the reason to do it this way: the flow table must
reconcile to the same till the weekly summary does, to the yen, or the instrument is lying in a new
way.

Gate policy per the brief: **disclose by default, hard-gate only curve properties the maintainer
explicitly signs.** Sprint 69's lesson is that a gate on an unrepresentative instrument is worse
than no gate.

### 202 (C1): the scrapyard design doc

The highest-value gameplay change in the arc, and design-doc-first because its law surgery touches
two locked bibles.

**Three things the verification changed about C, all of which make it bigger.**

**The law surgery is three laws.** Law 1 needs the same "every auction lot" scope clause as Law 2
and the work guarantee. A floor-pinned donor has repair slope zero below its expectation band, and
Law 1's own litmus asks whether a maintainer can point to any car below its band where a repair yen
returns less than a yen. A donor is precisely that car, by construction, on purpose. The brief's
"Law 1 unchanged entirely" would have shipped a law whose litmus fails on the species it was written
alongside. While the bible is open: the core-loop sentence cites `minWorkBillFractionByTier`,
retired in Sprint 153, and the interlock line still says 0.90 where the product is 0.78.

**The generation target has to be built.** `donorBreakEvenBillRatio` is a hand-typed global 0.45,
not a per-model measurement, and `computeDonorBalanceProbe` measures a clean all-mint car and never
reads it. The real instrument to extend is `computeGeneratedLotPlayRanking`, which already runs net
against net across 10,400 real generated lots, and which will fail the moment a donor exists, so it
needs the auction-lot scoping in the same change.

**The four routes each have a bound the brief does not name.** Mileage clean value floors at 0.75 at
any odometer, so route 1 cannot make a donor alone and needs a car already near 0.55 bill to book.
`bodywork` is not a foundation part, so route 2's Law 5 withholding runs through the `chassis` slot
only. Route 3's stripped shell is unreachable: `missingSlotWeightByPart` is zero for block, chassis,
bodywork, paint and forced induction, which is a lever list. Only route 4, the catastrophe rungs, is
reachable today exactly as described. Bypassing Law 2 also means bypassing **three** call sites, one
of which is a symptom veto that drops the symptom entirely, and the damage budget separately cannot
create a `scrap` part at all.

One incentive number worth carrying into the design: installing a harvested part beats selling it by
**4.3x to 5.4x into an empty or scrap slot**, but only **1.13x over an already-repairable part**. So
donor value is realised by **filling holes**, not by upgrading, and the design should lean on that
rather than fight it.

**Correlated damage folds in here.** I have an open design task for making a rough car cohere (no
scrap internals behind a mint block, variation across subsystems rather than a flat wall of the same
band). That is not a separate design: the brief's four routes to a donor are *the same question* at
the extreme end. A car whose sills have rotted through and a car whose damage is uniformly random
are answering "what does rough look like" differently, and only one of them reads as a real car. One
doc, one design.

---

## What Finding 2 leaves open, stated so it is not quietly forgotten

The brief's Finding 2 is that the loop is over-guaranteed **everywhere**. Its ruling adds **one
exception species at one venue**, and scopes three law sentences to auction lots. That is the
correct conservative first move and I am not arguing with it.

But it should be recorded that **C does not close Finding 2.** After C ships, the entire auction
loop, which is where the player spends nearly all of their time, remains fully guaranteed: every
repair yen below the band still returns at least one, every auction lot is still profitably
restorable, and the strategy ranking is still pinned per model. Whether that is still too generous
is a question the flow meter answers and nothing else can. It is an open item for after A2, not a
gap in the plan.

---

## What this arc supersedes, and what survives beside it

**Superseded.**

- The standing bot-harness rework in `TODO.md`. Workstream A replaces it with a different design;
  the policy-bot approach stays condemned (directive 21 is untouched).
- My ladder analysis as a standalone thread. It re-enters as census rows in 199.
- The open question about the bench's pinned bar being a top rail rather than a side rail. Absorbed
  into 198.

**Survives, unrelated and small.** Clear these off the critical path whenever a wave has a gap:

- **`collector-network` never opens.** Auction tiers unlock through a story mission carrying
  `unlocksAuctionTier`, and `storyMissions.json` carries one for `regional` and one for `premium`
  and none for `collector-network`. The top auction tier is currently unreachable in a real career.
  Found by the rep census; it is a live content gap, not an arc item.
- **`fearPremium` has three live references in `tools/balance`**, one of which subscripts a manifest
  key that no current export carries and would raise on contact. Dead code in condemned code, and
  the obvious first entry on F's kill list.
- The monotonicity guard hole (the test reads `physicalModifiers`, and tyres carry none, so it
  cannot see them).
- The DC2 year fix, already ruled in `roster-corrections-v1.md` and unapplied, and the S2000 window
  contradicting its own cited sources.
- The unverified `eraRubberMu` lead: an old car may be capped by its era's rubber whatever tyres are
  fitted.
- The sweep for tests that construct cars the game cannot produce, found twice now.

**Deferred by this arc's priority, not cancelled.** Contact patch (also blocked on the unbuilt
sport and race body panel gate signed in sprint 191), the cage SKU, the race parts shop, aero as a
system, and the art-as-interface goal.

---

## Approval this plan needs

1. **The wave structure and its three deviations** from the brief's section 6.
2. **Sprints 198 to 202 as scoped**, understanding that wave three is deliberately unscheduled.
3. **One maintainer action, unblocking A2 only:** play a session and export the log, so the first
   golden career is authored from a real session rather than from a guess.

No lever list is attached, because wave one and wave two move no values. C, D and F5 each bring
their own list to signature before any implementing agent launches.
