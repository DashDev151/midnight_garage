# Economy Overhaul Brief: Diagnosis, Decisions, and Workstreams

*Prepared 2026-08-12 from a full review of the repository (economy bible, progression bible,
economy-legibility redesign, lever ledgers, `economy.json`, `packages/sim`, the economy bench,
`tools/balance`, TODO/IDEAS) plus a design session with the maintainer. This document is the
handoff: it records the diagnosis, the maintainer's rulings from that session, and the
workstreams that follow from them, in a form another developer or LLM can pick up and execute.*

*House rules apply to this document and everything derived from it: no em dashes (CLAUDE.md
directive 15), British English (directive 18), no decorative Unicode (directive 2). Critically,
**directive 22 applies to every workstream below**: nothing here authorises moving any economy
lever. Where a workstream implies a value change, the deliverable is a proposal with a named
lever list for maintainer sign-off, never a live edit.*

---

## 1. Context: what the economy is today

Ran When Parked is a turn-based garage sim: buy tatty cars at auction, diagnose, repair or
upgrade, sell. The economy is governed by two locked bibles (economy, progression), six economy
laws, and a hand-audited anchor inventory. `economy.json` carries roughly **1,053 leaf values**
across 40+ top-level groups. Every yen number is either a named anchor or a pure derivation of
one (Law 4), machine-checked. Per-lever maintainer sign-off is mandatory (directive 22) and
guard tests pin the content file.

The measurement estate, as of this writing:

| Instrument | Status | Answers |
|---|---|---|
| Economy bench (`EconomyBenchScreen`) | Live, UI overloaded | Statics: one car, one moment, what is it worth |
| Closed-form probes (Vitest) | Live, trusted | Worst-case invariants: Laws 1, 2, 3, 6, coherence |
| Bot career harness (`pnpm balance:run`) | **Condemned and forbidden** (directive 21) | Nothing trustworthy; report is stale pre-rework data |
| Balance report (`tools/balance/report.md`) | Stale | Nothing; shows every strategy bankrupt with 0 rep, pre-rework |

## 2. The diagnosis, as ratified in session

Five findings. Each carries the maintainer's ruling from the design session; where the ruling
amended the finding, the amended form is what stands.

### Finding 1: the missing instrument is a flow meter, and the bench is the statics meter

The feeling of "no handle on the economy" is an instrumentation gap, not a tuning problem.
Nothing in the repo can answer career-scale flow questions: yen per day, labour per day,
standing per day, what week 6 feels like. The closed-form probes verify worst cases, never
typical experience. The bot harness is condemned. Every tuning debate is currently happening
blind, and the laws (Finding 2) have been compensating for that blindness with guarantees.

**Maintainer ruling (the Anno principle):** the economy bench is *also* a legitimate flow
instrument, at the single-car scale. Before you can reason about cannons on day 100 you must
know how soap is made on day 1. The bench is the soap machine: set the shop's progress, spawn a
car, do things to it, watch value move, see who would buy and at what. **The bench concept is
correct; its current UI is the failure.** Both instruments are needed: the bench for one-car
feel, a career harness for flow. Neither substitutes for the other.

### Finding 2: the laws over-guarantee the loop, which thins decisions

Stacked guarantees, each a rational response to a real playtest trap, collectively legislate
away tension: Law 1 makes every repair yen below the expectation band return >= 1 on every car;
Law 2 makes every generatable lot profitably restorable; the work guarantee puts a minimum
repair bill on every lot; the four-play law pins the strategy ranking per model everywhere
(fix always beats strip); the walk-in offer spread was narrowed to protect worst-case margins.
The optimal-path problem is solved by *mandating* the optimal path. Player uncertainty survives
almost entirely inside diagnosis (which is genuinely excellent: the two-numbers /
knowledge-wedge design is the strongest system in the repo) and buyer taste.

**Maintainer ruling:** some lots should be genuine parts cars, **but the donor's purpose is
harvesting parts into the player's other builds, not selling parts for cash**. Straight donors
are one of the ideas behind the scrapyard. The below-band profitability guarantee stays for the
core loop; the exception is a new, honestly-labelled lot species sold through a venue where
everyone knows the rules are different. See Workstream C for the full design, including the
answer to "what does an unprofitable-to-fix car even look like in this system".

### Finding 3: faucets scale, recurring sinks do not; infinite wallet is coming

Income deliberately gets easier at higher tiers (the repair-margin gradient across tiers is
intentional progression; full aftermarket return on rare cars). Recurring sinks are near flat:
Y6,000 base weekly rent plus a few thousand per bay, wages, machine hire. Once tools, bays and
machines are bought, capital expenditure ends and nothing scales money out. The intended late
sink, passion spend above the expectation band, is explicitly labelled a loss on screen, so the
economically-minded player the game trains will not use it.

**Maintainer rulings:**
- **Scaling rent: REJECTED.** Punishing success through overheads feels unfair. Do not propose
  it again.
- **Scaling staff costs: APPROVED** as a direction (better staff cost more; wage structure may
  scale with quality/capability).
- **Tool lines should be strong money sinks** but are acknowledged as possibly insufficient
  alone.
- **Legendary car acquisition is the endorsed late-game sink.** It converts money into identity
  rather than throughput: the shop's collection is the diegetic proof of "the shop the scene
  whispers about", and it is voluntary, so it never reads as punishment. This is the sink
  species to build more of: yen-denominated, voluntary, identity-building (the marquee price
  bar in scene standing is already this shape).

### Finding 4: the reputation/standing double-axis is suspect; rep may die as a visible mechanic

Scene standing and reputation are both currencies (the maintainer's own note: "rep and standing
are also economy"), and the rep axis is the least instrumented: `reputation.tierThresholds` is
explicitly tabled awaiting re-derivation, and the only instrument that ever measured rep pacing
was a bot earning at one fifth of the maintainer's real rate (5 rep/day real vs ~1 rep/day
bot). The progression bible's own no-double-dip law (Law 3: "if two pillars grant the same kind
of reward, one of them is fake and must be cut") is now pointing at reputation: the
open-questions doc said specialty felt thin, that was fixed by the scene-standing refactor, and
now rep is the axis that feels thin.

**Maintainer ruling:** seriously considering **killing reputation as a player-visible
mechanic**, keeping only scene standing. Not yet decided. Workstream E defines the
investigation that must precede the decision: a full gate census with explicit reassignment,
because rep currently gates real things (auction tiers, facility expansion, tool tiers 2/3, job
quality) and every gate needs a named new owner before rep can die.

### Finding 5: the lever count has outgrown the governance unit

1,053 leaves, 40+ anchor groups, per-lever sign-off, guard tests pinning content, two lever
ledgers in flight (38 and 30 levers). The process exists for good reasons (the silent
`floorFraction` 4.4x regression that triggered the Economy Rebuild), but at this scale the
maintainer signs *values*, not *behaviours*, and nobody can hold the whole state in their head.
This IS the "grown too complicated" feeling.

**Maintainer ruling:** agreed it is bloated; the missing piece was vocabulary for stripping it
back. That vocabulary is now defined (Workstream F) and the census it enables is approved as an
investigation.

---

## 3. Decisions of record from the design session

Collected here so no future reader has to reconstruct them from the findings.

1. **D1.** The economy bench survives as a concept; its UI is rebuilt around the loop, not the
   state space (Workstream B). A separate career-scale flow instrument is built alongside it
   (Workstream A). Both are required; neither replaces the other.
2. **D2.** Donor lots (cars not profitable to fix) become a real, generatable lot species,
   scoped to the scrapyard venue, honestly labelled, with value realised through **harvesting
   parts into the player's own builds**, not through parts sales (Workstream C).
3. **D3.** Laws 1 and 2, the work guarantee, and the four-play law are **scoped to auction
   lots**, not weakened. Three "every lot" sentences become "every auction lot". No formula
   changes.
4. **D4.** Scaling rent is rejected permanently. Scaling staff costs approved as a direction.
   Tool lines remain intended strong sinks. Legendary car acquisition is the endorsed late-game
   sink species (Workstream D).
5. **D5.** Reputation may be removed as a player-visible mechanic in favour of scene standing
   alone. Decision deferred until the gate census (Workstream E) is on the table.
6. **D6.** The lever census and three-tier governance model (Workstream F) are approved as the
   method for stripping back `economy.json`.
7. **D7 (standing constraint, restated).** Directive 22 is untouched by all of the above: every
   value change any workstream produces goes to the maintainer as a named lever list before
   implementation.

**Later decisions of record (added 2026-08-12, ReStory / drive mode / diagnosis sessions):**

8. **D8.** Drive mode graduates from the IDEAS parking lot into planned scope, governed by the
   five drive-mode laws (section 8.3). Feel-the-issues is approved with mandatory scripted
   guidance; economy hooks, scoring, and any skill-gated outcome remain unsanctioned.
9. **D9.** Real lemons exist. The universal deal guarantee (Law 2's "every generatable lot
   clears a profit" and the work guarantee's universal scope) is DELETED at auction; the
   per-yen fix guarantee (Law 1's below-band clause) is KEPT untouched (section 9.1).
10. **D10 (the basket inversion).** The full parts basket of a car must cost meaningfully MORE
    than the clean car, as in reality ("buying every individual part of a car and
    constructing it from scratch should cost meaningfully more than buying the car clean as a
    package", maintainer, 2026-08-12). Grenades must be meaningful and VARIED: a totally
    seized engine must make some cars unprofitable, not only chassis rot. Single-part sanity
    (Law 3's original litmus) is preserved (section 9.9).
11. **D11.** Identity lemons (section 10) are the high-end species, but identity is NOT strong
    enough to carry the high end alone: it is combined with real mechanical sinkability for
    the bottom half of every tier, which D10 provides (section 9.10).
12. **D12.** The basket retune is gated behind Workstream A: it does not happen before the
    career flow instrument exists to measure its consequences (section 9.11).
13. **D13 (identity amendment).** The identity system does NOT ship as a parallel
    investigation mechanic; the maintainer's boredom verdict on the standalone version is
    upheld. Identity ships inside the ONE existing diagnosis system: as rung species in
    existing symptom ladders pre-purchase, as guaranteed discovery-through-work reveals in
    existing pipelines post-purchase, and as authored endgame missions. Ceiling-lemons
    survive as economic facts; the parallel doubt-ladder machinery is dead (section 10).
14. **D14 (the Hall of Legends ratified).** The Hall is the game's narrative arc: the first
    museum of a culture that does not yet know it is one, built a decade early and proven
    right by the playable decade. Nine plinths, chapter zero is the shop itself, every car
    in it runs. Full specification: `ran-when-parked-narrative.md` (deliverable 3). The
    D4 legendary-acquisition sink is REALISED by the Hall's chapters.
15. **D15 (no racer or touge selling channels).** The six channels are media and venues;
    racers and touge runners buy through word of mouth by design. Their scenes reach the
    shop only via `wordOfMouthMultiplierByStage` biasing existing channel pools, making
    them the two scenes where standing matters most. One content task (persona pool
    weights), zero new systems.
16. **D16 (the agency package).** Chapters commission ARGUMENTS, never chassis: the player
    sources every plinth car through normal play and nominates it. Each chapter admits two
    or three authored readings and the player picks the plaque's interpretation. The
    disguised era was an audition of the player's 9.6 choices, not their wrench. The
    ending is the player's plaque choice. Specified in `ran-when-parked-narrative.md`
    section 5.
17. **D17 (the 2000GT lock and the delivery law).** The record, the digit, and the
    three-beat reveal are locked (`ran-when-parked-narrative.md` sections 7 and 8), along
    with the arc's legibility rules (every critical beat lands through system, character,
    and image; no load-bearing beat needs more than two short lines; critical lines live
    at moments of forced attention).

---

## 4. Workstreams

Ordered by dependency, not importance. A is the prerequisite for tuning anything; B through F
can proceed in parallel with it.

### Workstream A: the career flow instrument

**Problem.** No working instrument answers "what does a typical career feel like": cash, labour,
and standing as curves over days. The condemned bot harness must not be resurrected as-is; its
failure was policy bots that cannot play the real game (maintainer verdict 2026-07-15, TODO.md).

**Design: scripted golden careers, not policy bots.** A golden career is a deterministic,
hand-authored action script: a sequence of real sim actions (buy lot X at price Y, repair parts
Z to band B, list on channel C, advance day) that replays approximately what the maintainer
actually did in a recorded playtest. It has no decision policy, so it cannot drift into
unrealistic play; it is a regression instrument, not an AI. Assertions are curve-shaped: cash
per day within a band, standing per day within a band, days-to-milestone within a range.

**Tasks.**
1. Define a career-script format: an ordered list of sim action invocations with expected-state
   checkpoints. Reuse the existing session-log export (`SaveMenu.vue`, "Export session log";
   note the open TODO item to actually capture one) as the source material for the first
   script.
2. Author 2 to 3 golden careers from real or realistic sessions: a first-week career (the
   tutorial arc plus the first flip), a mid-game career, and later an endgame career.
3. Build the sources-and-sinks aggregator: the weekly financial summary already reconciles to
   the till to the yen with categories (`financial-summary.md`, `financeLedger.ts`). Aggregate
   those categorised deltas per day across a golden career into a flow table: every faucet and
   every sink, yen per day, as a time series. This is the Sankey diagram of the pipes.
4. Report format mirrors `tools/balance/report.md`: one page a maintainer can eyeball. Curves,
   not endpoints.
5. Gate policy: golden careers **disclose** by default; hard-gate only curve properties the
   maintainer explicitly signs (the days-to-tier lesson from Sprint 69: a gate on a broken or
   unrepresentative instrument is worse than no gate).

**Acceptance.** A maintainer can run one command and see, for each golden career: cash curve,
labour utilisation, standing curve, and a per-category faucet/sink table per week. The
instrument answers "what does week 6 feel like" without a live playtest.

**Explicitly out of scope.** Any lever change motivated by what the instrument shows (D7). Any
revival of policy bots.

### Workstream B: economy bench UI rebuild

**Problem.** The bench engine is correct (it assembles real `GameState` and calls real sim
functions; `economyBench.test.ts` pins bench-built and normally-built cars to identical
figures). The UI exposes the full state space (29 slots, 9 zones, machining, symptoms, every
shop field) when the job is to expose the loop.

**Design: four panels, in loop order.**
1. **Shop state as presets.** Named personas ("day 1 shop", "first hires", "established
   shop", "endgame shop"): each a saved bundle of day, cash, standing, tool tiers, staff,
   heat. Editable underneath, but the entry point is one dropdown, not thirty controls.
2. **Car spawn from the real generator.** Pick tier, roll seed, reroll button. Uses
   `generateAuctionCarInstance` exactly as the game does (the bench already imports it). Manual
   slot-by-slot assembly remains available behind an "advanced" disclosure, not as the front
   door. When Workstream C lands, a "spawn donor" toggle spawns the new species.
3. **The work log.** Every action taken on the bench car appends a two-line ledger entry: cost
   paid (parts, materials, labour points), value moved (guide value delta, via the shared value
   ledger from `valueLedger.ts`), running margin. The slope of that log IS the one-car feel the
   maintainer is after. No new maths: this is the existing ledger presentation law (economy
   legibility, plank 1) applied to a sequence instead of a snapshot.
4. **The buyer panel.** Who would bite right now: per channel and per scene, the taste match,
   the offer range, and for the near misses, why not (taste ceiling, coherence, foundation
   gate, staleness). This is the "who is interested and to what extent" requirement.

**Tasks.** Refactor `EconomyBenchScreen.vue` and `screens/dev/economyBench*.ts` into the four
panels; add the preset store; wire spawn-from-generator as the default path; implement the work
log against `valueLedger.ts`; implement the buyer panel against the real `saleCandidates` path
in `selling.ts`. Preserve the bench's one structural invariant: **the bench computes nothing**;
every number is a named sim function's output, and the identical-figures test stays green.

**Acceptance.** The maintainer's own description, verbatim, is the acceptance test: "Set the
shop progress, set the initial car spawn, do shit to the car and see what it does to value, see
who is interested to buy and to what extent. Thats it."

### Workstream C: donor lots and the scrapyard

**Problem and the key question.** The core loop's guarantees currently make "a car not worth
fixing" unreachable by generation. The maintainer's question, answered in session: **how, in
the current system, do we even make such a car, and what does it look like?**

**The mathematical definition already exists in the sim.** Value is clean minus 1.3x the
remaining bill (`marketRepairDiscount`); once bill/clean exceeds ~0.77 (that is,
1 / marketRepairDiscount) the car pins to the `scrapValueFraction` floor, and past 1.0 fixing
is a pure loss end to end. Law 2's `maxBillFraction` 0.6 is the single dial that keeps
generation below that line. The crossover where parting out beats fixing is *already measured
per model* by `teardown.donorBreakEvenBillRatio` and `computeDonorBalanceProbe`
(`balanceProbes.ts`). The instrument that defines a donor exists; today it is a disclosure. It
becomes the **generation target** for the new species: a donor generates with bill/clean
*above* the model's break-even ratio.

**Four diegetic routes to an honest donor**, all already mechanics in the sim; generation picks
one (or blends) per donor lot:
1. **Mileage crushes the ceiling.** The mileage curve shrinks clean value while parts cost
   the same yen regardless of odometer; at extreme mileage a normal bill overtops the ceiling.
   Nothing dramatic is wrong; the car is simply too far gone to be worth it. (Doubles up with
   the Sprint 101 mileage-correlated-generation option.)
2. **Structural rot.** Ruined-past-repair metal zones and a rotten underbody force
   *replacement* rather than repair (the body system already models this), and
   chassis/underbody are foundational, so Law 5 withholds the aftermarket premium too. Rust
   through the sills is what totals old cars in reality.
3. **Absence.** A stripped shell: interior gone, engine bay half empty. Missing parts bill at
   full stock-replacement price. Someone already took the good bits.
4. **Catastrophe confirmed.** The Sprint 105 catastrophe rungs (scrap block, gearbox,
   differential, chassis) on a cheap car, but **disclosed on the sheet** rather than hidden
   behind a symptom. At auction a catastrophe is a hidden risk; at the scrapyard it is the
   stated reason the car is here.

**The player experience.** Sheet value pinned at the scrap floor; the ledger prints the truth
in one line ("restoration exceeds her value"), exactly as the legibility clause of Law 1
demands: a disclosed money-loser is a choice, an undisclosed one is a trap. The buy logic then
inverts, which is the gameplay: the player prices the *contents*, not the car. A donor's worth
is the installed value of its harvestable parts minus strip labour, and its price sits between
the scrap floor and that number. Diagnosis re-enters with full force: a donor with a mint
gearbox behind a grenaded block is a find; the same shell with everything at poor is scenery.

**Why harvest-into-builds already works economically (D2).** A used part *sold* takes the
`teardown.usedPartSaleFraction` 0.30 haircut and the steep `resaleBandFactors` curve, so
selling parts stays unattractive (the four-play law's intent survives). A used part
*installed* in the player's own build contributes through the normal `bands.bandFactors`, so
donor value is realised through installation. The incentive structure the maintainer wants
(donors feed builds, not a parts-sales business) is already the shape of the existing
constants. No lever needs to move to make this true; tuning may later sharpen it (D7).

**Law surgery (D3), stated precisely so it cannot be over-read.**
- Law 1: **unchanged entirely.** The formula already says "worthless past the ceiling"; the
  `scrapValueFraction` floor is finally doing its intended job rather than guarding a bug.
- Law 2, the work guarantee (core-loop law clause 1), and the four-play law: each gains a
  scope clause, "every **auction** lot". No formula, threshold, or constant changes.
- The scrapyard is the venue where Law 2 does not apply **and everyone knows it**: lots there
  are labelled sold-for-parts. The legibility clause carries the honesty burden.
- The bible amendment recording this scoping is written in the same change as the
  implementation, per the bible's own amendment protocol.

**Tasks.**
1. Design doc first (the repo has `docs/design/systems/scrapyard.md`; extend or supersede it
   with this species definition and the four routes).
2. Donor generation: a generator path targeting bill/clean above the model's break-even ratio,
   selecting one of the four routes; exempt from `enforceMaxBillFraction` and the work
   guarantee; stamped with a lot-species field.
3. Scrapyard venue: listing, disclosed catastrophes, pricing between scrap floor and
   harvest value. Reuse the existing auction/lot plumbing (reuse-first, directive 16).
4. Probes: a donor-species probe asserting the inversion holds (fixing a donor loses money,
   harvesting a donor with good parts into a build beats both fixing it and selling its parts).
   The existing four-play probes re-scope to auction lots only.
5. Lever list for sign-off: donor spawn rate, price anchoring, route weights, any new
   `partsGeneration` keys. All named, none moved without approval (D7).

### Workstream D: late-game sinks

**Constraints from D4.** No scaling rent, ever. Approved directions only:

1. **Scaling staff costs.** Investigate wage structures where better staff cost meaningfully
   more (the anchors exist: `staff.wageBaseYen`, `wagePerSkillPointYen`,
   `wagePerLaborSlotYen`, `statBudgetByTier`). Deliverable: a proposal with measured late-game
   wage share of income under Workstream A's endgame golden career.
2. **Tool lines as strong sinks.** Measure (do not assume) the total tool-line spend against
   cumulative career income on the golden careers; report whether tier 3s bite as sinks.
3. **Legendary car acquisition (the endorsed species).** REALISED as the Hall of Legends
   chapters (D14, `ran-when-parked-narrative.md`): plinth cars are bought and restored at
   flagship scale, converting yen into legacy voluntarily. Design constraints below stand. Design constraints: voluntary (never a tax), yen-denominated,
   visible in the world (progression bible Law 4: revealed diegetically). The scene-standing
   marquee price bar (`marqueeBarYenByTier`) is the existing mechanic of this shape; the
   collection is its larger sibling. Open design questions to resolve in the doc: where
   legends surface (auction tier, story events, scene commissions), whether ownership itself
   feeds standing (mind the progression bible's "money never buys standing" pillar; the clean
   reading is that the *build and delivery* earns standing while *possession* is the trophy),
   and whether holding legends carries running cost (insurance, storage) as a gentle recurring
   sink that is opt-in by nature.

**Acceptance.** A sinks proposal document with golden-career measurements attached, and a
named lever list per proposal (D7).

### Workstream E: the reputation gate census (precedes any decision to kill rep)

**Purpose.** D5 (kill rep as a visible mechanic, keep standing) cannot be decided responsibly
until every gate rep currently holds has a named successor. Reassign first, kill second.

**Tasks.**
1. Census every consumer of `reputationTier` / `reputationPoints` across `packages/sim` and
   `packages/game`: auction tier access, facility expansion, tool tier 2/3 purchase gates,
   service-job reputation-tiers, clientele quality, anything else grep finds.
2. For each gate, propose a successor owner from the surviving pillars: aggregate scene
   standing (e.g. any scene at Respected), specific deeds, cash, or deletion of the gate.
   Check every reassignment against the progression bible's pillar table (what each pillar may
   never gate) and the no-double-dip law.
3. Identify what is lost: rep is currently the only *general* (scene-agnostic) standing
   signal. Determine whether any content (copy, story missions, tutorial) depends on a general
   tier name existing.
4. Deliverable: a one-page decision memo. Option 1: kill visible rep, reassign per the census.
   Option 2: keep rep internal (drives gates, never rendered). Option 3: keep as-is with the
   tabled threshold re-derivation. With a recommendation.

**Note.** `reputation.tierThresholds` re-derivation stays tabled (per the 2026-08-06 bible
amendment) until this memo lands; do not tune a ladder that may be about to die.

### Workstream F: the lever census and three-tier governance

**The vocabulary** (requested by the maintainer; use these terms in all census output):

- **Anchor vs derived**: already the bible's distinction. A derived value is never edited;
  only anchors are governed. The census applies only to anchors (leaf values in
  `economy.json` and `partPricing.json`).
- **Load-bearing lever**: shapes a decision a player actually makes. Test: *name the
  decision*. If no player decision can be named, it is not load-bearing.
- **Texture lever**: changes feel, never a decision (reaction chances, turnout wobble, copy
  weights, display steps). Legitimate content, but frozen at defaults and exempt from
  per-lever sign-off ceremony.
- **Shadow price**: two levers pricing the same concern. `fearPremium` was one (the
  cause-weighted odds already carried the fear) and was correctly killed in Sprint 98. There
  are more.
- **Dead lever**: nothing reads it, or another system fully masks its effect. Delete on
  sight (with the bible's audit table updated in the same change, per Law 4).
- **The wiggle test**: would a playtest notice this lever at +/-50%? No: texture tier.

**The process.**
1. Mechanical trace: for every leaf in `economy.json`, find its consumer function in
   `packages/sim` (and `packages/game` for copy/display levers). Flag unread leaves (dead
   candidates) and leaves consumed only in expressions dominated by another lever (mask/shadow
   candidates). This step is scriptable and safe: it changes nothing.
2. Classification pass: each leaf gets a row: consumer, the player decision it serves (or
   "none"), wiggle-test verdict, tier (anchor / texture / dead / shadow-of-X).
3. Governance proposal: three tiers going forward. **Anchors** (target: a few dozen) signed
   individually as today. **Texture** frozen at defaults, batch-approved, guard-pinned as a
   block. **Derived** untouched as today. The bible's audit table gains the tier column.
4. Approval unit shift: for anchors, propose approving *measured behaviours* where possible
   ("worst-tier flip margin stays within X to Y", verified by probe) rather than raw
   constants, so a future retune inside the signed envelope is one approval, not five.
5. Kill list: dead levers and shadow prices go to the maintainer as a named deletion list
   (D7 applies to deletions too: a deletion is a lever change).

**Why this is the bible's own principle, scaled up.** The legibility redesign already stated
it: "fewer constants, one job each", with a table assigning each constant its fate. The census
applies that table's discipline to all 1,053 leaves instead of one arc's worth.

**Acceptance.** The census table exists, the kill list and tier assignments are on the
maintainer's desk, and the anchor count after approval is measured in dozens, not hundreds.

---

## 5. What is explicitly NOT sanctioned by this document

- Moving any economy lever, payout, or formula constant (directive 22; D7).
- Weakening Law 1's below-band guarantee anywhere it currently applies.
- Scaling rent or any success-punishing overhead (D4 rejection).
- Reviving the policy-bot harness in its condemned form (directive 21).
- Killing reputation before Workstream E's census memo is reviewed.
- Making donor lots a parts-sales cash business; their purpose is feeding the player's own
  builds (D2).

## 6. Sequencing recommendation

1. **A and B first, in parallel.** They are pure instrumentation: no lever risk, and every
   other workstream's proposals need their measurements.
2. **F's mechanical trace** (step 1) can run immediately; it is read-only.
3. **C's design doc** next: it is the highest-value gameplay change and its law surgery is
   small and precisely scoped. The Workstream I design doc (section 10) can be drafted in the
   same window; both are documents, not lever moves.
4. **D and E** produce decision memos once A exists to measure against.
5. **The basket inversion (9.9) and the lemon generation it enables (9.1) land only after A
   is live and has baselined the current economy** (D12), as one signed arc together with
   their bible amendments (9.11), then the straddle and rung-distinctness probes (9.2, 9.3)
   gate the result.
6. **Drive mode (section 8)** proceeds in its standalone containment throughout, never
   blocking a core sprint; its first shipped touchpoint is the zero-information post-repair
   verification drive (8.5).

The through-line, and the reason for the ordering: every past tuning regression in this
project's history (the floorFraction collapse, the 5x rep mis-scale, the wage-law
misinterpretation) happened while flying blind. Build the instruments, read them, then tune.

---

## 7. Design pillars addendum: lessons from ReStory (maintainer session, 2026-08-12)

*The maintainer completed ReStory: Chill Electronics Repairs (Mandragora / tinyBuild, released
2026-08-06; ~20 hours, main and side content complete) and distilled the following pillars in
session. These are design principles, not sprint tasks; every future feature is checked against
them the same way economy work is checked against the bible.*

### P1. Colour: daylight joins the palette; the vibe is hopeful

**Ruling:** more light and saturation. Manila auction cards, bright red painted workshop tools,
heavier emphasis on the accent magentas and teals. The concern being addressed: the current
visual language may not fit the game's hopeful vibe (nobody becomes the shop the scene whispers
about, which is fundamentally warm).

**Direction:** do not soften the synthwave; give it a daylight counterpart. Time-of-day carries
the palette range: sun-washed saturation and manila paper for the daytime commerce half
(auctions, shops, ledgers), neon magentas and teals earning their drama at night. Paper as a UI
material is the anchor: the legibility system is literally ledgers and auction sheets, and
manila card stock makes the economy feel warm rather than clinical. Period note: light,
saturated, hopeful Japanese iconography is city pop, which is period-correct for 1995 and sits
naturally beside synthwave rather than replacing it.

### P2. Tactility: a budget spent on sacred verbs, not everywhere

**Insight:** ReStory's tactile controls (the click of a panel, the feel of setting a screw, the
chime of a perfected build) are the gold standard: important actions must feel like getting
your hands dirty, never a flat button or dropdown. **But** ReStory's repairs are short; this
game has 29 slots and a turn-based structure, so wholesale physicality would violate P6
(friction). The translation is a **tactility budget**: identify the three to five sacred verbs
that ARE the fantasy (candidates: the hammer falling at auction, the first key-turn after a
rebuild, the handover at sale, seating an engine) and give those full physical weight through
drag, animation and sound. Everything administrative stays a clean, fast menu.

**Corollary:** sound design is most of perceived tactility in a 2D game at a fraction of the
cost. Invest in sound early, not as post-launch polish.

### P3. Fictional time is what memory measures; the calendar makes the game feel long

**Insight:** ReStory's 20 hours felt like 10, largely because the whole story spans only 30
in-game days: memory indexes experience by fictional time, so a month in a shop files as a
vignette regardless of hour count. This game's 1995-to-2005 frame is the structural advantage:
a career spanning years of fictional time feels like a life. **Direction:** give the calendar
landmarks that partition memory into chapters (seasons, annual events, era shifts, "back when I
was still in the rented lockup"). Distinct chapters make a game feel long in retrospect;
undifferentiated days blur regardless of count.

### P4. The solved-economy test: heterogeneous demand, roles not parity, legibility

**Insight:** ReStory's economy is solved quickly because value scales with item tier while
risk, effort and access do not, so the best item strictly dominates (buy the laptop, never
return to the tamagotchi). This game already holds the counterweights ReStory lacks
(reputation-gated auction tiers, capital requirements, per-tier diagnosis risk with
catastrophes, the daily labour pool, bay space). Two rulings ride with this:

- **Cheap cars keep a ROLE, not parity.** Graduating past keis is progression working. Their
  role: fast low-labour flips that fill spare capacity, donors (Workstream C), and, the
  strongest card, scenes that WANT them (daily drivers). Heterogeneous demand is the
  structural fix: when different buyers want different cars, "highest value item" stops being
  one answer.
- **The complexity test: intricate does not equal good.** Complexity is fun exactly when it is
  legible: the player forms a theory, acts, and the ledger confirms or refutes them. ReStory's
  failure is being solved in five hours; this game's mirror-image risk is being unsolvable
  because it is opaque. Judge every system by whether it produces a felt decision, not by
  whether it is clever. The two-numbers system and the ledger presentation are the mitigation;
  Workstreams A and B are how it gets proven.

### P5. Characters: strong on characters, light on narrative

**Rulings and craft rules:**
- The target feeling, verbatim: "Ah, its Yuki again from the tutorial. Oh the guy with the
  yellow civic is back, wonder what hes been up to." Memorable regulars, minimal text.
- The diegetic progression law already makes WHO WALKS IN the progression display, so
  recurring characters are the UI, not a bolted-on story layer.
- Memorability is mechanical: distinct silhouette, one want, one verbal tic, and **recurrence
  with visible state change**: the yellow Civic should change between visits, ideally because
  of something the player sold or did to it.
- **In a car game the car is the mnemonic anchor, not the face.** Players forget names; they
  never forget the yellow Civic. Promote a handful of generated buyer personas into
  persistent named regulars whose cars accumulate history.
- Characterise through transactions (what they buy, what they haggle over, what they bring
  back), never through dialogue trees or text walls. Distinctness first (ReStory achieved
  this); attachment comes from recurrence and consequence, which ReStory did not achieve.

### P6. The friction law: challenge without frustration

**The principle, from the maintainer's back-panel-vs-back-plate frustration:** friction is
difficulty that does not contain a decision. Memorising trivia the game already displayed is
friction; judging under uncertainty the game deliberately priced is challenge. **The rule: the
game may quiz the player on information it PRICED, never on information it merely DISPLAYED.**
Applies to all systems. Concrete implications: context carry-over everywhere (the car's needs
visible at the parts market, shopping lists generated from a planned build); the fitment gate
already prevents wrong purchases and stays; the diagnosis system is the model citizen (hidden
causes are priced, so not knowing is a bet, not a chore). The balance to hold: too assisted
and there is no game, too obscure and it is a chore.

### P7. Positioning: win on depth and the decade, not on polish

ReStory's excellence is polish and feel, the dimension hardest for a solo developer to compete
in. Do not fight there. This game's winning hand: systemic depth, heterogeneous demand, the
information economy, and a career that feels like a decade of a life. P2's tactility budget is
how feel gets bought affordably; the depth is the moat.

---

## 8. Drive mode (Midnight Roads): design facts, the balance laws, and containment

*Added 2026-08-12 after maintainer review of the `midnight-roads-v15.html` standalone
prototype. Drive mode graduates from the IDEAS.md parking lot into planned scope; the IDEAS
entry's constraints remain binding and are extended here. This section records the design facts
of the prototype, the maintainer's balance ruling, and the laws that resolve it.*

### 8.1 Design facts established by the prototype

- **The cars are real.** Arcade parameters (mass, mu, brake mu, effective power, the gearbox
  envelope sampled from the actual power curve, weight distribution, yaw inertia, drivetrain
  split) are generated from the locked performance model, never hand-authored. The consequence
  is the mode's entire point: **the car you build is the car you drive.** A parts change, a
  condition change, or a tyre change reaches the road because it reaches the model.
- **The physics is a bicycle model with per-axle slip, a friction circle, load transfer,
  surface grip and grade** (the touge), with aero as a speed-dependent grip multiplier. It is
  arcade-tuned (the grip/slip/hold/assist registers), not arcade-faked.
- **The throttle is a speed-target control law**, not a gas button: the input sets a target
  speed and the controller cruises to it. This is the accessibility pillar (no reflex input)
  resolved at the input layer; driving is deliberate, not twitchy. This control scheme is a
  design decision of record, not an implementation detail.
- **The tune sheet with exportable values is the feel workbench**: the economy-bench
  instrument philosophy applied to handling. It stays.
- **The prototype is a standalone, self-bundled artifact**, iterated in isolation. That
  containment method is mandatory for the whole of the mode's life (see 8.4).

### 8.2 The maintainer's balance ruling, verbatim in substance

This cannot become a driving game. **The player's driving skill must never affect their game.**
But a zero-stakes throwaway sandbox diminishes the mode's power. The resolution below was
accepted in session: the mode's power comes from *meaning*, and meaning comes from context and
ritual, never from stakes. The drive matters because it is YOUR car at THIS moment (just
rebuilt, about to be delivered, finally finished), not because anything rides on the lap.

### 8.3 The five drive-mode laws

1. **The one-way valve.** Game state flows INTO a drive without limit (the build, condition,
   symptoms, weather, time of day, course). Nothing flows OUT of a drive except information
   the player could have obtained through the decision-paced game, and ritual/expressive
   moments. No yen, reputation, standing, wear, damage, fuel, or unlocks are ever written by a
   drive. *Litmus: diff the save before and after any drive; the only permissible differences
   are ones an equivalent bench action could also have produced.*
2. **Attendance, not aptitude.** Any benefit a drive grants is granted by TAKING the drive,
   never by performing well in it. Lap times, crashes, drift, and line quality write nothing.
   A player who drives into the wall for ten minutes receives exactly what a clean driver
   receives. *Litmus: could a player who cannot steer obtain the identical outcome? If not,
   the design is wrong.*
3. **The parity law (optional efficiency, never necessary action).** Every piece of
   information a drive can reveal has a decision-paced bench equivalent at a bounded, normal
   cost. The drive is an alternate SKIN over an existing priced action, never a new
   information channel. If a drive revealed anything the bench could not, driving would become
   the optimal path and therefore mandatory, which is the exact failure this law exists to
   prevent.
4. **The guaranteed reveal.** Where a drive carries diagnostic content (8.5), the car performs
   its symptoms on a script and the reveal fires unconditionally during the drive. Detection
   is never a player test. A player who FEELS the fault before the card fires gets delight;
   a player who feels nothing loses nothing. The car tells you; feeling it first is the treat.
5. **The no-consequence fiction.** Within the drive, nothing is at risk: no damage, no wear,
   no cost beyond whatever the entry action itself is priced at. The fiction carries this
   openly (a closed mountain road at night; nobody is watching; nothing counts). This is what
   licenses the mode to feel dangerous while being safe.

### 8.4 Containment (unchanged from IDEAS.md, extended)

- Fully optional and skippable; a player who never drives finishes the whole game.
- The decision-paced path remains the DEFAULT everywhere drive mode offers an alternative.
- Isolated, cuttable module behind a clean boundary; every drive-mode touchpoint in the core
  game must degrade to the decision-paced path with no hole if the mode is cut.
- Development stays in the standalone-artifact method (own bundle, fast isolated iteration)
  until the core game's vertical slice ships around it. Drive mode never blocks a core sprint.

### 8.5 Feel-the-issues (shakedown diagnosis): approved direction, with the guidance ruling

The fusion the maintainer approved, bounded by the laws above: a car's symptoms can be
EXPERIENCED on a shakedown drive (the pull under braking, the hesitation at high rpm, the
vagueness over crests), and the shakedown can function as a diagnostic action.

- **Mechanically, a shakedown IS an existing diagnostic test**, wearing the drive as its skin:
  same cause-narrowing effect, same labour/yen price as the bench test it mirrors, limited to
  the symptom families that are plausibly drivable (nothing about rust, trim, or paint is
  learned on a road). No new information exists; only a more joyful way to buy information the
  bench already sells (Law 3).
- **Guidance is mandatory, not optional** (maintainer ruling): the symptom performs itself on
  a script at authored moments, and the reveal card fires unconditionally with plain language
  ("she pulls left under braking"), logged to the car's sheet exactly as a bench test result
  would be (Law 4). The player is never asked to notice, interpret, or reproduce anything.
- **Post-repair verification drive**: after the fix, the symptom is gone from the physics and
  the script. This carries ZERO information (the ledger already said the part was replaced)
  and exists purely as emotional payoff; it is the cheapest, safest, highest-value drive
  touchpoint and should ship first.
- Open questions for maintainer sign-off before implementation: which symptom families map to
  which drivable behaviours; the shakedown's price relative to its bench-test twin (parity
  suggests identical); whether a shakedown requires the car to be roadworthy (foundational
  parts above scrap), which would be both diegetic and a neat consumer of the foundation law.

### 8.6 The other sanctioned touchpoints (expressive weight, zero mechanical weight)

- **The shakedown ritual** after a rebuild and the **delivery drive** to a buyer: ceremonial
  framings of moments the core loop already contains. Candidates for P2's sacred-verbs
  budget.
- **The mountain, freely**: any owned roadworthy car, any time, as pure sandbox. This is
  where the build-to-road payoff lives for its own sake.
- **Era and weather as memory** (P3): drives inherit season, weather and time of day, making
  them calendar landmarks ("the first snow run in the finished FD").
- Explicitly NOT sanctioned without a new maintainer ruling: timed events, races against
  others, drift scoring, any leaderboard, any drive-gated content, and any economy hook.

---

## 9. Workstream H: diagnosis gameplay weight (added 2026-08-12)

*The maintainer's verdict: the diagnosis idea is stronger than its implementation. Two named
weaknesses: (1) the so-what problem: diagnosing before buying rarely changes whether you buy,
so the system might as well not exist; (2) the magnitude problem: resolving a doubt often
swings the deal by a trivial sum. Root cause, agreed in session: the safety laws made
ignorance safe. When every lot is guaranteed profitably restorable, the maximum cost of not
knowing is "slightly less profit", and players correctly learn that inspection is optional
trivia. The laws protect the repair; diagnosis is the purchase's only protection, and the
current numbers do not honour that job.*

### 9.1 The ruling that anchors this workstream: real lemons exist (amends D3 / Workstream C)

**Maintainer ruling, end of session:** the universal lot guarantees GO. The game needs actual
lemons and parts cars, and this alone carries much of the fix. Recorded precisely so the right
thing is deleted:

- **KEPT, untouched: the fantasy guarantee.** Below the expectation band, a repair yen still
  returns >= 1 (Law 1's per-yen clause). Fixing, as an act, always pays. This is the core
  fantasy and it does not move.
- **DELETED as a universal: the deal guarantee.** Law 2's "every generatable lot clears a
  profit" and the work guarantee's universal scope no longer hold at auction. Lots can now
  generate past the break-even line (a lemon), hidden behind symptoms exactly as the
  catastrophe rungs already half-do; the scrapyard sells them openly (Workstream C), the
  auction hides them behind honest odds.
- The room's odds stay honest and the ledger stays truthful: a lemon is never a lie, it is a
  bad draw the player could have priced. Generation-side levers (lemon rate per tier, how
  deep past break-even a lemon may run) are the sign-off list.
- Workstream C's scope clause ("every auction lot") is superseded by this ruling: the
  invariant becomes "the auction's ODDS are honest per tier", not "every lot is safe".

**Why this fixes weakness 1:** with lemons live, the pass decision has real teeth, so
diagnosis protects the purchase, which was always its job. **Amended same day:** deleting the
guards alone is NOT sufficient. The arithmetic in 9.8 shows most of the roster is unsinkable
by construction after the four-play-law parts retune; the basket inversion (9.9) is the change
that makes this ruling real.

### 9.2 The straddle law (new probe, same machinery as Law 2)

Every fault ladder must straddle the buy line: at the room's reserve, the car under its
mildest cause is a clear buy and under its worst cause a clear pass. If every rung leaves the
player on the same side of the line, the ladder is decoration. Probe-checkable today: per
symptom per tier, compute profit-at-reserve under best and worst cause; require opposite
signs. Gate as a hard invariant once values are signed.

### 9.3 Rung distinctness (the magnitude fix)

No mush rungs: causes that are diagnostically distinct but economically near-identical are
merged or re-banded. Working rule for authoring and probes: no two rungs on a ladder within
~15% of each other's value impact, and **minimum stakes stated in felt units: if resolving a
doubt cannot swing at least a week's rent, the doubt should not exist.** Fewer, meaner
ladders beat many polite ones: three rungs that each rewrite the deal are a detective story;
seven rungs a coffee apart are paperwork.

### 9.4 Inspection scarcity (diagnosis becomes triage)

The decision moves from "should I inspect this car" (a shrug) to "which of these lots, on
different closing clocks, deserve my limited inspection slots today". Allocation, not
execution, is the skill, which is also the actual detective fantasy. The parts exist (visit
minutes, travel fees, durations, flash lots); the change is making inspection bandwidth
explicitly scarce and visible.

### 9.5 Knowledge persists past the purchase

Undiagnosed faults cost exploratory work at the player's own bench after purchase: the cause
was always going to have to be found; the only question is WHEN the player pays for that
knowledge. Pre-purchase, the same spend also informs the buy and the bid; post-purchase it is
pure cost. Consequence: pre-buy diagnosis is never wasted even on a car the player buys
regardless, and the auction-side premium (travel, scarce slots) against the bench-side calm
becomes an honest trade: pay more for knowledge while it can still change your mind.

### 9.6 The doubt follows the car to the sale

An unresolved doubt on a listed car is a live decision: fix it, disclose it, or pass it on and
let the buyer's verdict find it, which is exactly what the reworked reputation system now
reads. Knowing and not saying becomes a choice with a witness. A diagnosis bought at auction
keeps working weeks later at the handover.

### 9.7 Advertise the spread, never the answer

The sheet shows the RANGE a doubt's rungs span (from a cheap fix to a dead block), never the
odds of which end. The spread is the room's own advertisement for inspection; the fear
pricing already computes it, it just needs to be legible as stakes instead of folded silently
into one number.

*These compound: 9.1-9.2 make knowledge flip decisions, 9.4 makes acquiring it a decision,
9.5 makes it pay even on cars bought anyway, 9.6 gives it a third act. Same architecture,
same math family; only the numbers and two scope sentences move, all via signed lever lists
(D7).*

### 9.8 The unsinkability finding (measured 2026-08-12; the evidence for 9.9)

**The shared mental model first, because every number below depends on it.** Value is clean
minus `marketRepairDiscount` (1.3) times the remaining bill, floored at `scrapValueFraction`.
The waterline is therefore **bill > clean / 1.3 (~77% of clean)**: past it, the car pins to
the floor and repair yen spent while pinned return zero (the underwater dead-spend zone) until
enough of the bill is cleared to surface, after which every yen returns 1.3 as normal. A lemon
is a car that generates underwater. **Grenades reach the bill through one mechanism: a `scrap`
or `missing` part bills at FULL stock replacement price.** This is why `partPricing`'s
`classFactors` is not merely a shop-price lever; it is the grenade-magnitude lever.

**The measurement.** Total-annihilation bill (every one of the 29 part types replaced at
stock, plus all six body panels), per class, at current `classFactors`
(0.14 / 0.16 / 0.40 / 0.90): **entry ~Y224,000, everyday ~Y256,000, enthusiast ~Y640,000,
flagship ~Y1,440,000.** Against the waterline at worst mileage (curve floors at 0.75):

| Car | Book | Worst clean | Waterline | Max possible bill | Sinkable? |
|---|---|---|---|---|---|
| Alto Works (top entry) | 400,000 | 300,000 | 231,000 | 224,000 | **No, ever** |
| Aristo (top everyday) | 770,000 | 577,500 | 444,000 | 256,000 | **No, by miles** |
| Roadster (bottom everyday) | 440,000 | 330,000 | 254,000 | 256,000 | Barely, at total ruin |
| 180SX (bottom enthusiast) | 750,000 | 562,500 | 433,000 | 640,000 | Yes |
| Supra RZ (bottom flagship) | 2,890,000 | 2,167,500 | 1,667,000 | 1,440,000 | **No** |

**Conclusion:** after the four-play-law retune set each tier's basket at ~0.6 of a typical
tier car, the top half of every tier is arithmetically unsinkable even at total annihilation
plus maximum mileage. D9 alone therefore produces lemons only among the cheapest cars of each
tier, and rust-repricing alone would make chassis rot the ONLY thing that matters, which the
maintainer explicitly rejected ("a totally seized engine SHOULD make some cars unprofitable,
not just chassis"). Hence 9.9.

### 9.9 The basket inversion (D10): reprice the basket above the car

**The design error being corrected, named honestly:** the four-play retune conflated two
problems. Law 3's litmus was always about SINGLE parts being absurd (brake pads costing twice
the car). It was never wrong for the BASKET to exceed the car; in reality the sum of the parts
always costs more than the assembled car, which is the entire reason breakers' yards and
insurance write-offs exist. The retune fixed the pads and accidentally abolished the
write-off.

**The proposal for sign-off (all values first-pass tuning bait, per D7):**

- The full basket lands at **1.3 to 1.5x a TYPICAL tier car's book value** (up from ~0.6),
  achieved through `partPricing.classFactors` and, where needed, per-`baseCostYen`
  redistribution, so the change stays inside the existing tuning grammar.
- Distribution targets so grenades are varied, expressed as fractions of a typical tier car:
  **engine assembly (block + internals + head) ~30%, chassis ~20%, gearbox ~12%**, with small
  parts staying cheap. Law 3's single-part litmus is re-asserted as a probe: no single part
  approaches the car it fits.
- The resulting grenade table, which is the point: a seized engine SINKS the bottom half of a
  tier (30% of a typical car is 50%+ of a cheap one, on top of its normal work) and maims the
  top half; a gearbox sinks only the cheapest cars; chassis rot sinks most things; stacked
  grenades sink almost anything. Within-tier price spread (4-8x inside each tier) produces
  the variety automatically: the Supra becomes mechanically sinkable while the 2000GT never
  is, **which is diegetically correct: nobody writes off a 2000GT.**
- Structural rot additionally gets honest pricing through the zone pipeline (terminal metal
  and underbody work priced as heavy materials and forced replacement), so the classic
  real-world totaler exists, as ONE grenade among several rather than the only one.
- The mileage curve (floors at 0.75) is noted as an adjacent lever that deepens waterlines if
  extended; no change proposed, listed for the sign-off conversation.

### 9.10 The two lemon species (D11)

- **Bill-lemons (low end):** the bill beats the car. Enabled by 9.9; hidden behind symptoms
  and catastrophe rungs at auction (honest odds), sold openly at the scrapyard (Workstream
  C).
- **Ceiling-lemons (high end):** the car is not the car. An expensive car cannot be outspent
  even under 9.9's basket; it sinks when its CLEAN VALUE was a lie (accident history under
  the filler, non-genuine spec, wound odometer). Fixing never recovers the loss because
  repair moves the car toward ITS true clean value, not the one on the auction sheet.
  Specified as Workstream I (section 10).
- Ruling D11: both species run together at the high end; identity does not carry it alone.
  The double trap (an accident-history flagship with a tired motor) is intended and should be
  generatable.
- One line per tier, the design's summary: **cheap cars drown when the bill beats the car;
  expensive cars drown when the car is not the car.**

### 9.11 Knock-ons, re-measurement obligations, and the sequencing gate (D12)

The basket inversion is the largest single retune since Sprint 66 and touches everything
downstream. Obligations, all mandatory in the same arc:

- **All repair bills rise** (repairs derive from part prices via `repairStepFraction`); every
  flip margin shrinks; the sensible-restore-per-tier, no-free-lunch, and coherence probes
  re-derive and re-pin with recorded approval (the `economyApprovalGate` guard test re-pins in
  the same change as the sign-off, per the bible's protocol).
- **Teardown re-measures.** A 1.3-1.5x basket at the current 0.30 used-part sale haircut sits
  far closer to break-even; the invariant to watch is the four-play law's "the cheapest car
  in every tier must lose money stripped", and `teardown.usedPartSaleFraction` may need to
  FALL to hold it. Measured, not assumed.
- **The donor game strengthens, intentionally.** With catalogue parts expensive, harvest-vs-buy
  becomes a real ongoing decision and donors (Workstream C) become the working shop's cheap
  parts channel; the infrastructure fantasy arrives through the back door. Workstream C's
  probe set gains a harvest-vs-catalogue crossover measurement.
- **Bible amendments required in the same change:** Law 2's scope (per D9), Law 3's
  clarification (single-part sanity, basket explicitly permitted above 1), the four-play
  law's teardown re-measurement, the `classFactors` history in the amendment log, and the
  straddle law (9.2) recorded as a new invariant.
- **The gate (D12):** none of this lands before Workstream A exists. Raising the factors
  blind means re-discovering the margins by playtest, which is the exact failure mode this
  whole document exists to end. Instrument first, then this.

### 9.12 Diagnosis content audits (from the 2026-08-12 copy review)

The copy itself is signed as good (the Vimes voice lands; negative results carry as much
character as positives; mechanical accuracy is enthusiast-credible). Two audit tasks:

- **Dud-test info-leak check:** several tests carry identical `resultCopy` for both partition
  outcomes (e.g. the stethoscope on `diff-whine`). If these are deliberate no-information
  flavour tests, the sim must not narrow the cause set when they run; verify the partition is
  genuinely inert wherever the copy claims nothing was learned, or the UI leaks knowledge the
  prose denies.
- **Rhythm pass (minor, batched with any future copy sitting):** the "That's X: Y"
  construction and colon-heavy cadence repeat noticeably across a session, partly forced by
  the em-dash ban; vary sentence shapes where cheap.

---

## 10. Identity within the one system (amended per D13; supersedes the original Workstream I)

*The original proposal here specified a parallel identity-investigation mechanic (doubt
species with their own ladders, examined like documents). The maintainer's honesty test
killed it, correctly: its uncertainty faced backward, its tests were not verbs, and its
output fed a price cell instead of the core loop. What survives is everything the economy
needs, delivered through systems that already exist.*

### 10.1 What survives, and where it lives

- **Ceiling-lemons survive as economic facts** (9.10 unchanged): expensive cars sink when
  their clean value was a lie. Only the delivery mechanism changed.
- **Pre-purchase: identity is a rung species, not a system.** New symptoms in the existing
  ladder machinery whose cause rungs reprice CLEAN VALUE instead of adding to the bill.
  The proof it works is already shipped: `quarter-panel-filler` is an identity doubt
  living happily inside the buy decision. Additions of the same shape: odometer doubt
  ("pedal and bolster wear do not match the clock"), spec doubt ("the brochure car and
  this car disagree somewhere"). A handful of symptoms, zero new machinery, directive 16
  by the book. The straddle law (9.2) applies to these ladders like any other.
- **Post-purchase: the truth reveals itself through the work.** Fraud is DISCOVERED, never
  investigated: the sander hits filler and there is the accident; the teardown opens the
  "RZ" engine and the internals are wrong; the paint strip finds the second colour. The
  body pipeline, teardown, and repair systems are the revelation engine at zero new-system
  cost. Reveals fire GUARANTEED as ledger and copy events (P6: never quiz the player on
  noticing), and each one converts directly into the core loop via 9.6: fix it honest,
  disclose it, or pass it on with a witness.
- **Endgame: authored authentication missions**, bespoke set pieces using the cast as
  instruments (Gonda's memory of deaths, Nagata's certified specs, the assembly-line
  judge). These are narrative content, not a repeatable mechanic; they are specified in
  full in `ran-when-parked-narrative.md` (D14), including the 2000GT authentication logic.

### 10.2 Implementation notes

- Generation: identity rungs enter the same per-tier symptom weighting; the scaling
  property stands (identity doubts dominate the mix at high tiers, rare at the bottom;
  both species live in the middle).
- Valuation seam: an identity cause resolves to a clean-value repricing in
  `marketValue.ts` terms; one seam, signed via lever list (D7).
- Discovery-through-work: reveal triggers attach to existing pipeline stages (zone
  sanding, paint strip, teardown of affected slots); authored per fraud species, fired
  unconditionally on reaching the stage.
- Lever list for sign-off: identity symptom weights by tier, repricing magnitudes per
  fraud species (straddle-checked), reveal-stage mappings.
