# Sprint 218: workshop diagnosis and symptom service jobs

**Status: APPROVED.** Implements sections 7 and 8 of
`docs/design/systems/knowledge-and-diagnosis.md`. Depends on 215 (verification,
checklist) and 216 (weights); closes the knowledge arc and runs the arc's one
full-suite gate.

## Reuse analysis (directive 16)

**Reused:** the whole test machinery (partitions, resultCopy, unlockedBy):
workshop tests are the same schema with venue fields, never a second system; the
inspection-minutes clock for yard tests unchanged; labour resolution for
workshop test costs (the same pool every action spends); the service-job
system end to end (offer, accept, deadline, payout formula, handback) for the
new task kind; `taskLaborChain` for expected-cost payouts; Sprint 207's
weighted offer generation for rolling symptom jobs onto the board.

**New:** the venue split on tests, the workshop test content pass, the
`resolveSymptom` task kind, symptom-job generation.

## Tasks

### A. Test venues (spec section 7)

- A1. Schema: `venue: 'yard' | 'workshop'` on every test (existing tests become
  `yard`, zero behaviour change); workshop tests may carry `requiresToolTier
  { component, tier }`, `requiresVacatedSlot: CarPartId`, `laborPoints`.
- A2. Workshop tests run only on a car in the player's shop; they charge labour
  points; `requiresVacatedSlot` tests appear only while that slot is empty.
- A3. The symptom checklist lists tests filtered by venue and current
  availability, with each test's cost in its own currency (minutes at the yard,
  labour points in the shop) and its lock reason when unavailable (tool tier,
  vacated slot), in the standard caption idiom.

### B. Workshop test content (spec section 7 coverage commitment)

- B1. Content pass over every symptom: each gains at least one workshop path to
  a single cause that is cheaper in labour than opening its most expensive
  candidate. Worked example from the spec (leak-down splitting rings from head
  gasket at engine tool tier 2, 4 points) is the template.
- B2. Copy: workshop test result lines in the same voice as the yard set; lead
  copy pass before merge.

### C. Symptom service jobs (spec section 8)

- C1. Task kind `resolveSymptom { symptomId }` beside slot tasks in the
  service-job schemas. Generated jobs: customer car with one visible symptom,
  2-4 candidates, candidates' parts consistent with the car's rolled state.
- C2. Payout fixed at accept: `(sum of weight x chainFixCost) x marginRoll +
  calloutFee` (weighted mean by DESIGN: the customer pays the going quote; fear
  pricing is an auction phenomenon: spec section 8, decided).
- C3. Completion: symptom collapsed AND the true cause's part at fine or better.
  Failure/deadline semantics identical to existing jobs.
- C4. Offer generation: symptom jobs enter the daily roll with their own weight
  (content); the offer card shows the symptom line and the candidate count,
  never the answer.
- C5. The margin loop verified by test: opening in descending
  probability-per-labour order on a fixture job spends less than the payout's
  expected cost; the reverse order spends more. (The game never shows
  yen-per-point: ruling 11; the player reads weights and labour costs and
  decides.)

### D. Arc close

- D1. One full `pnpm test` for the whole knowledge arc; golden hashes re-derived
  once here rather than per-sprint where possible.
- D2. Arc summary appended to `knowledge-and-diagnosis.md`: values as shipped.

## Definition of done

- Every symptom is workshop-solvable per the coverage commitment; symptom jobs
  roll, pay expected cost, and reward order; yard flow untouched; full suite
  green; typecheck clean.
