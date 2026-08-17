# Sprint 210: the newsstand story, and the diagnosis pays off

**Status: APPROVED (fix arc wave 3, playtest notes 2026-08-16: session-1 notes 1 and
3, session-2 note S2-4; character-tier ruling recorded in
`docs/design/systems/community-jobs.md`).**

**Goal:** the first Tier 2 community character exists properly, and a finished
diagnosis hands the player an answer they can use.

## Reuse analysis (directive 16)

**Reused:** the whole Sprint 205 machinery (scripted job injection, the unlock field,
the stand location, the market page) - elevated, not rebuilt; the service-job task
system for the authored tasks; the mission-complete modal idiom for the unlock moment;
the Shop Manual (Compendium) for the reference copy the unlock points at; the
diagnosis system's existing elimination state (which tests ran, which faults remain)
- the resolution layer READS it, no new diagnostic mechanics; the existing value
ledger's "Doubt, resolved" line as the money side of a finding.

**New:** the day-N trigger for scripted jobs, the unlock-communication beat, the
diagnosis verdict layer (copy plus one derived view), and the newsstand owner's
authored content. No new systems.

## Tasks

### A. The newsstand owner, Tier 2 (session-1 note 1, S2-4)

- A1. **Timing:** the job appears a few days in (around day 5, after the tutorial
  mission completes), not day one. The trigger is "tutorial done, then N days", one
  content value.
- A2. **The character:** named, with a couple of lines in their own voice on the
  phone offer, at handback, and at the reopened stand. Written by the lead against
  the community-jobs laws. They leave the Tier 3 name pool.
- A3. **The job:** authored tasks that tell the story of a van that sat too long -
  easy for the shop the player has at day 5, but more textured than a radial job
  (a diagnosis step is part of it: the van is the tutorial-adjacent chance to USE
  the inspection flow on a job that cannot be failed).
- A4. **The unlock communicates.** On handback, the moment says what changed: the
  stand is open; the Free Ads channel exists (what it is, when it beats the shop
  front - reach - and what it costs against it - fees/speed, in one screen of plain
  copy); the Trade Sheet exists (what moved this week, where to read it). The same
  facts land as Shop Manual entries so they can be re-read; the modal is the moment,
  the manual is the memory.

### B. Diagnosis resolves (session-1 note 3, 3.1-3.3)

The player runs tests, eliminates candidates, and the game currently leaves the
conclusion on the table. Three layers, all copy-and-read, no new mechanics:

- B1. **The verdict line.** When elimination leaves one candidate, the panel says so
  in words: "Must be the jumped chain, then." - naming the fault, the part it lives
  in ON the service diagram (the diagram region highlights), and what fixing it
  involves (the part, the depth, the labour class). One derived view over existing
  elimination state.
- B2. **What it means for the wallet.** The verdict states the repair's rough cost
  shape (parts plus the chain labour Sprint 207 now computes) against the "Doubt,
  resolved" swing already in the ledger, so "the car is worth Y11k less" becomes
  "fixing it costs about X; the room does not know this".
- B3. **What to do at the block.** The room-versus-your-number spread gets one plain
  sentence on the bid panel: your number already prices what you found; bid to your
  number, walk when the room passes it. Where a major fault was found pre-bid, the
  panel says which side of the room's number you now stand on. Guidance is stated
  once, in the game's own dry voice, not a tutorial lecture.

## The authored copy (lead-written, 2026-08-16; implementation lifts these verbatim)

**The character: Mrs. Harada**, the newsstand by the station. Named, minor, permanent
(community-jobs.md Tier 2); she leaves the Tier 3 name pool.

- `customerName`: "Mrs. Harada (the newsstand)"
- `description` (her own ask, on the phone): "The van won't start and the stand's
  been shut three days. Papers don't stop printing just because I can't sell them.
  Get her going and I'll see you right."
- Handback line (job complete, hers): "She starts first turn now. Mrs. Harada
  listens to the idle all the way through before she says thank you. The shutters
  are up in time for the evening edition."
- The unlock moment (the handback modal gains a what-changed section, three plain
  facts):
  - "The stand is open again. Mrs. Harada keeps your card under the till."
  - "The free ads paper takes your listings now. Costs nothing, reaches the whole
    town, hurries nobody - the shop front sells to whoever walks past; the paper
    sells to whoever has been circling the same ad all week."
  - "She saves you the trade sheet too: what moved last week, model by model. Read
    it at the stand."
- Shop Manual entries (re-readable memory of the moment):
  - **The free ads paper**: "List a car in the free ads and it sits in ten thousand
    kitchens by morning. Costs nothing, reaches everyone, hurries nobody. The shop
    front sells to whoever walks past; the paper sells to whoever has been circling
    the same ad for a week."
  - **The trade sheet**: "The stand saves the trade sheet from the back pages: last
    week's movement, model by model, risers and fallers. It reports what happened,
    never what will. A model you keep selling into goes soft; the sheet is where
    you watch it happen."

**The diagnosis verdict layer:**

- Verdict line, per symptom narrowed to one candidate: "Must be the {cause}, then."
  followed by the fact line "{part label} - about {yen} and {labour} labour to put
  right." The figures come from the Sprint 207 chain function (`taskLaborChain`),
  never a second computation; the named part's diagram region highlights.
- The bid guidance, shown on the lot once any finding is resolved: "Your number
  already carries what you found. Bid to it; past it, the room is paying for a car
  you know better than they do."
- The spread line, under the room-versus-yours figures: "Your number prices what
  you found. The room's doesn't."

## Definition of done

- The stand job arrives day ~5 with a person attached, uses a diagnosis beat, and
  its handback moment plus Shop Manual entries teach the channel and the sheet.
- A completed elimination states its verdict, points at the diagram, prices the fix,
  and advises the bid; all three playtest questions (3.1-3.3) have on-screen answers.
- Copy is lead-written throughout; the copy guards pass.
- Narrowest tests once; pre-push gate is the evidence.

## Exit

**Implemented 2026-08-16. All green; lead copy verified verbatim on every surface.**

- **Mrs. Harada (A).** `appearsOnDay: 5` in content, enforced by the ensure-function;
  she left the Tier 3 name pool; her ask, handback line and the three unlock facts
  render through generic recipe fields (`handbackCopy`, `unlockFacts`) on the
  job-complete modal, no character-specific branch anywhere. The van carries a
  deterministic `non-starter`/`flat-battery` symptom so the job teaches the
  inspection flow on unfailable work; making that possible fixed a real scoping
  gap (owned-car-only workups generalised to the owned-or-customer duality the
  rest of the sim already uses). The Shop Manual gained "The free ads paper" and
  "The trade sheet".
- **The verdict (B).** A symptom narrowed to one candidate states it: "Must be the
  {cause}, then." with the part and the price from the Sprint 207 chain function
  (a synthetic repair-to-fine task through `serviceJobCostBreakdown`, never a
  second sum); clicking it docks the panel on the named part. A lot with any
  resolved finding shows the bid-guidance line and the spread line; a clean lot
  shows neither. All three playtest questions (3.1, 3.2, 3.3) now have on-screen
  answers.
- **A guard earned its keep:** the duplicate-formula ban refused an inline
  "resolved" check in the store; the resolution predicate moved into
  `diagnosis.ts` (`symptomVerdictCauseId`) as the one owner. Directive 17 case
  (b), code fixed, guard untouched.
- **Fallout** was case (a) throughout: day-1 fixtures moved to day 5, and the
  name-pool shrinking by one shifted the RNG stream, so the golden hashes were
  re-derived from real runs per their own convention.

**Evidence:** `pnpm typecheck` clean; full suite 229 files / 4,738 tests, 0
failures; all four copy guards green. Pre-push gate re-verifies at push.
